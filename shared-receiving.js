/* Shared receiving: immutable media snapshots and a fenced, single editor head. */
(function (global) {
  'use strict';
  const SCHEMA = 1, CHUNK_SIZE = 180000, BLOB_SIZE = 100000;
  const clone = value => JSON.parse(JSON.stringify(value));
  const canonical = value => JSON.stringify(value && typeof value === 'object'
    ? (Array.isArray(value) ? value.map(item => JSON.parse(canonical(item)))
      : Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(canonical(value[key]))]))) : value);
  const fault = (code, message) => Object.assign(new Error(message), { code });
  const id = () => global.crypto?.randomUUID?.() || Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
  const split = text => {
    const out = [];
    for (let at = 0; at < text.length;) {
      let end = Math.min(at + CHUNK_SIZE, text.length);
      if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
      out.push(text.slice(at, end)); at = end;
    }
    return out.length ? out : [''];
  };

  function create(options) {
    const { db, doc, getDoc, onSnapshot, runTransaction, writeBatch, setDoc,
      rootPath, clientId, onState = () => {}, onStatus = () => {} } = options;
    if (!clientId || !Array.isArray(rootPath)) throw new Error('Shared receiving requires clientId and rootPath');
    const headRef = doc(db, ...rootPath, 'drafts', 'receiving');
    const refForChunk = key => doc(db, ...rootPath, 'drafts', 'receiving_chunk_' + key);
    const chunks = new Map(), contentKeys = new Map(), published = new Map();
    const online = () => options.isOnline ? options.isOnline() : global.navigator?.onLine !== false;
    let head = null, payload = null, editEpoch = null, serverSeen = false, hydrated = false;
    let stopped = false, started = false, claiming = false, finishing = false, status = 'connecting', error = null;
    let unsubscribe, generation = 0, pending = null, failed = null, draining = null, sequence = 0;
    let waiters = [], startResolve, startReject;
    const startPromise = new Promise((resolve, reject) => { startResolve = resolve; startReject = reject; });
    // A caller may create the coordinator before it is ready to await start().
    startPromise.catch(() => {});
    const revision = () => Number(head?.revision) || 0;
    const owns = () => !!(editEpoch && head?.owner === clientId && head?.epoch === editEpoch);
    const ready = () => serverSeen && hydrated && !stopped && !claiming;
    const state = () => ({ ready: ready(), isOwner: ready() && owns(), busy: !!draining || claiming || finishing,
      status, error, revision: revision(), owner: head?.owner || null, epoch: head?.epoch || null,
      dirty: !!pending || !!failed || !!draining, head: head ? clone(head) : null });
    const notify = (next, problem) => {
      if (next) status = next;
      if (problem !== undefined) error = problem;
      try { onStatus(state()); } catch (e) { global.console?.error?.('Shared receiving status callback failed', e); }
    };
    const emit = (value, source) => {
      payload = clone(value);
      onState(clone(value), { head: head ? clone(head) : null, revision: revision(), isOwner: owns(), source });
    };
    const checkOnline = () => { if (!online()) throw fault('offline', 'אין חיבור לאינטרנט. השינויים טרם סונכרנו.'); };
    const checkEdit = () => {
      checkOnline();
      if (!ready() || !owns() || finishing) throw fault('not-owner', 'הקליטה נפתחה לעריכה במכשיר אחר. יש לקבל שליטה לפני עריכה.');
    };
    const settle = (until, problem) => {
      const done = waiters.filter(w => w.sequence <= until);
      waiters = waiters.filter(w => w.sequence > until);
      for (const waiter of done) problem ? waiter.reject(problem) : waiter.resolve({ revision: revision() });
    };
    const loseOwnership = () => {
      editEpoch = null; pending = null; failed = null;
      settle(Infinity, fault('not-owner', 'השליטה בקליטה עברה למכשיר אחר.'));
    };
    const readHead = snapshot => {
      if (!snapshot.exists()) return null;
      const value = snapshot.data();
      if (value.schema !== SCHEMA || !Number.isSafeInteger(value.revision) || value.revision < 0)
        throw fault('unsupported-state', 'גרסת הקליטה המשותפת אינה נתמכת. יש לרענן את האפליקציה.');
      return value;
    };
    const guard = (current, epoch, expected) => {
      if (current?.owner !== clientId || current?.epoch !== epoch)
        throw fault('not-owner', 'השליטה בקליטה עברה למכשיר אחר.');
      if ((Number(current.revision) || 0) !== expected)
        throw fault('conflict', 'קיים עדכון חדש לקליטה. יש להמתין לסנכרון לפני שמירה.');
    };
    const bounded = promise => {
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(fault('timeout', 'הסנכרון מתעכב. השינויים טרם נשמרו בענן.')), options.timeoutMs || 30000);
      });
      return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
    };
    async function transaction(body) {
      let active = true;
      const checkActive = () => {
        if (!active || stopped) throw fault('abandoned', 'הפעולה הופסקה. יש לרענן את מצב הסנכרון.');
      };
      try {
        return await bounded(runTransaction(db, async tx => {
          checkActive(); checkOnline();
          const fenced = {
            get: async ref => { checkActive(); const result = await tx.get(ref); checkActive(); return result; },
            set: (ref, data) => { checkActive(); tx.set(ref, data); },
            delete: ref => { checkActive(); tx.delete(ref); }
          };
          return body(fenced);
        }));
      } finally { active = false; }
    }

    async function keyFor(text) {
      if (contentKeys.has(text)) return contentKeys.get(text);
      let key;
      if (global.crypto?.subtle && global.TextEncoder) {
        const hash = await global.crypto.subtle.digest('SHA-256', new global.TextEncoder().encode(text));
        key = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
      } else key = id();
      contentKeys.set(text, key);
      return key;
    }
    async function prepare(value) {
      const data = clone(value), blobs = [], writes = new Map(), refs = new Set();
      const durable = new Set(head?.snapshot?.refs || []);
      async function encodeText(text) {
        const keys = [];
        for (const part of split(text)) {
          const key = await keyFor(part); keys.push(key); refs.add(key);
          if (!chunks.has(key) || !durable.has(key)) writes.set(key, part);
        }
        return keys;
      }
      async function visit(node, path, parent, key) {
        if (typeof node === 'string' && node.length > BLOB_SIZE) {
          blobs.push({ path, chunks: await encodeText(node), length: node.length });
          parent[key] = null;
        } else if (node && typeof node === 'object') {
          for (const name of Object.keys(node)) await visit(node[name], path.concat(name), node, name);
        }
      }
      const holder = { data };
      await visit(data, [], holder, 'data');
      const manifest = JSON.stringify({ schema: SCHEMA, data: holder.data, blobs });
      const snapshot = { id: id(), chunks: await encodeText(manifest), length: manifest.length };
      snapshot.refs = Array.from(refs);
      if (snapshot.refs.length > 1000) throw fault('too-large', 'הקליטה גדולה מדי לסנכרון. יש לצמצם את מספר התמונות.');
      const entries = Array.from(writes);
      // Worst case UTF-8 is four bytes per code point; keep each request <10 MiB.
      for (let at = 0; at < entries.length; at += 12) {
        checkOnline();
        const group = entries.slice(at, at + 12);
        if (writeBatch) {
          const batch = writeBatch(db);
          group.forEach(([key, text]) => batch.set(refForChunk(key), { schema: SCHEMA, text }));
          await bounded(batch.commit());
        } else {
          await bounded(Promise.all(group.map(([key, text]) => setDoc(refForChunk(key), { schema: SCHEMA, text }))));
        }
        group.forEach(([key, text]) => chunks.set(key, text));
      }
      return snapshot;
    }
    function garbageFor(snapshot) {
      const keep = new Set(snapshot.refs || snapshot.chunks);
      const garbage = Array.from(new Set([...(head?.garbage || []), ...(head?.snapshot?.refs || head?.snapshot?.chunks || [])]))
        .filter(key => !keep.has(key));
      if (garbage.length > 2000) throw fault('cleanup-required', 'יש תקלה בניקוי נתוני הסנכרון הישנים. השמירה נעצרה כדי למנוע הצטברות נתונים.');
      return garbage;
    }
    function trimCaches() {
      if (!head?.snapshot?.refs) return;
      const keep = new Set(head.snapshot.refs);
      for (const key of chunks.keys()) if (!keep.has(key)) chunks.delete(key);
      for (const [text, key] of contentKeys) if (!keep.has(key)) contentKeys.delete(text);
      for (const key of published.keys()) if (key !== head.snapshot.id) published.delete(key);
    }
    async function cleanup(target) {
      // Serialize with writes. Only the current owner can delete unreachable chunks.
      // A concurrent claim changes epoch/revision and aborts this transaction.
      if (!target?.garbage?.length || stopped || !owns()) { trimCaches(); return; }
      try {
        let remaining = target.garbage.slice();
        while (remaining.length && !stopped) {
          const group = remaining.slice(0, 100);
          let cleaned;
          await transaction(async tx => {
            const current = readHead(await tx.get(headRef)); guard(current, target.epoch, target.revision);
            const reachable = new Set(current.snapshot?.refs || current.snapshot?.chunks || []);
            group.filter(key => !reachable.has(key)).forEach(key => tx.delete(refForChunk(key)));
            cleaned = { ...current, garbage: (current.garbage || []).filter(key => !group.includes(key)) };
            tx.set(headRef, cleaned);
          });
          remaining = cleaned.garbage;
          if (head?.epoch === target.epoch && revision() === target.revision) head = cleaned;
          group.forEach(key => { if (!head?.snapshot?.refs?.includes(key)) chunks.delete(key); });
        }
      } catch (problem) {
        // The new snapshot is already durable. Retain the garbage list for the
        // next successful edit rather than reporting the user's save as lost.
        global.console?.warn?.('Shared receiving cleanup deferred', problem.code || problem.message);
      }
      trimCaches();
    }
    async function loadSnapshot(target) {
      if (!target?.snapshot) return null;
      const pointer = target.snapshot;
      async function readText(keys, length) {
        if (!Array.isArray(keys) || keys.length > 1000 || !Number.isSafeInteger(length) || length < 0)
          throw fault('invalid-snapshot', 'נתוני הקליטה אינם תקינים. לא שונו הנתונים במכשיר.');
        const values = await Promise.all(keys.map(async key => {
          if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(key)) throw fault('invalid-snapshot', 'קובץ קליטה לא תקין.');
          if (chunks.has(key)) return chunks.get(key);
          const snap = await bounded(getDoc(refForChunk(key)));
          if (!snap.exists() || typeof snap.data().text !== 'string')
            throw fault('missing-chunk', 'חלק מנתוני הקליטה חסר בענן. הנתונים הקודמים נשמרו במכשיר.');
          const text = snap.data().text;
          if (key.length === 64 && global.crypto?.subtle && global.TextEncoder && await keyFor(text) !== key)
            throw fault('corrupt-chunk', 'קובץ הקליטה בענן אינו תקין.');
          chunks.set(key, text); contentKeys.set(text, key);
          return text;
        }));
        const result = values.join('');
        if (result.length !== length) throw fault('invalid-snapshot', 'קובץ הקליטה בענן אינו שלם.');
        return result;
      }
      const manifest = JSON.parse(await readText(pointer.chunks, pointer.length));
      if (manifest.schema !== SCHEMA || !Array.isArray(manifest.blobs)) throw fault('invalid-snapshot', 'מבנה הקליטה אינו נתמך.');
      let value = manifest.data;
      await Promise.all(manifest.blobs.map(async blob => {
        const text = await readText(blob.chunks, blob.length);
        if (!Array.isArray(blob.path) || blob.path.some(key => ['__proto__', 'constructor', 'prototype'].includes(key)))
          throw fault('invalid-snapshot', 'מבנה הקליטה אינו תקין.');
        if (!blob.path.length) { value = text; return; }
        let parent = value;
        for (const key of blob.path.slice(0, -1)) {
          if (!parent || !Object.prototype.hasOwnProperty.call(parent, key)) throw fault('invalid-snapshot', 'מבנה הקליטה אינו שלם.');
          parent = parent[key];
        }
        const key = blob.path[blob.path.length - 1];
        if (!parent || !Object.prototype.hasOwnProperty.call(parent, key)) throw fault('invalid-snapshot', 'מבנה הקליטה אינו שלם.');
        parent[key] = text;
      }));
      return value;
    }

    async function receive(snapshot) {
      if (stopped || snapshot.metadata?.hasPendingWrites || snapshot.metadata?.fromCache !== false) return;
      let token = generation;
      try {
        const next = readHead(snapshot);
        if (head && next && next.revision < head.revision) return;
        // Duplicate metadata events must not invalidate a hydration already in flight.
        if (serverSeen && next?.revision === head?.revision && next?.epoch === head?.epoch &&
          next?.snapshot?.id === head?.snapshot?.id && status !== 'error') {
          if (head && next) head.garbage = next.garbage || [];
          return;
        }
        token = ++generation;
        serverSeen = true;
        const previous = head;
        head = next;
        if (editEpoch && !owns()) loseOwnership();
        const ownPublish = next?.snapshot?.id && published.has(next.snapshot.id);
        const sameSnapshot = previous && previous.snapshot?.id === next?.snapshot?.id && hydrated;
        // Fence controls immediately, even while photos are downloading.
        if (!ownPublish && !sameSnapshot) hydrated = false;
        notify(ownPublish ? 'saving' : 'loading', null);
        if (ownPublish) {
          payload = clone(published.get(next.snapshot.id));
          hydrated = true;
        } else if (!sameSnapshot || claiming) {
          const value = await loadSnapshot(next);
          if (token !== generation || stopped) return;
          hydrated = true;
          emit(value, 'remote');
        }
        if (token !== generation || stopped) return;
        notify(owns() ? 'synced' : 'viewing', null);
        if (!draining && !claiming && !finishing) trimCaches();
        startResolve(api);
      } catch (problem) {
        if (token !== generation || stopped) return;
        hydrated = false;
        notify('error', problem);
        startReject(problem);
      }
    }

    async function drain() {
      while (pending && !stopped) {
        const item = pending; pending = null;
        const epoch = editEpoch, expected = revision();
        try {
          checkEdit(); notify('saving', null);
          const snapshot = await prepare(item.value);
          checkEdit();
          if (epoch !== editEpoch) throw fault('not-owner', 'השליטה בקליטה עברה למכשיר אחר.');
          const next = { schema: SCHEMA, revision: expected + 1, owner: clientId, epoch,
            snapshot, garbage: garbageFor(snapshot), updatedAt: Date.now(), closed: false };
          published.set(snapshot.id, item.value);
          await transaction(async tx => {
            checkOnline(); const current = readHead(await tx.get(headRef)); guard(current, epoch, expected);
            tx.set(headRef, next);
          });
          if (owns() && epoch === editEpoch && revision() <= next.revision) {
            head = next; payload = clone(item.value); hydrated = true;
          }
          if (!failed || failed.sequence <= item.sequence) failed = null;
          settle(item.sequence);
          await cleanup(next);
        } catch (problem) {
          if (problem.code === 'not-owner') loseOwnership();
          else if (epoch === editEpoch && owns()) {
            failed = [pending, failed, item].filter(Boolean).sort((a, b) => b.sequence - a.sequence)[0];
            pending = null;
          }
          settle(Infinity, problem); notify('error', problem);
          return;
        }
      }
    }
    function kick() {
      if (draining) return draining;
      // Start asynchronously so busy is already true in the first status callback.
      draining = Promise.resolve().then(drain).finally(() => {
        draining = null;
        if (!error) notify(owns() ? 'synced' : 'viewing', null); else notify();
        if (pending) kick();
      });
      return draining;
    }
    const api = {
      get ready() { return ready(); }, get isOwner() { return ready() && owns(); },
      get busy() { return !!draining || claiming || finishing; }, get status() { return state(); },
      get revision() { return revision(); }, get payload() { return payload === null ? null : clone(payload); },
      get head() { return head ? clone(head) : null; },
      start() {
        if (!started) {
          started = true;
          unsubscribe = onSnapshot(headRef, { includeMetadataChanges: true }, receive, problem => {
            hydrated = false; notify('error', problem); startReject(problem);
          });
        }
        return startPromise;
      },
      async claim(force = false) {
        if (!ready()) await api.start();
        checkOnline();
        if (stopped) throw fault('stopped', 'הסנכרון הופסק.');
        if (claiming || finishing) throw fault('busy', 'יש להמתין לסיום הפעולה הקודמת.');
        if (draining) await api.flush();
        claiming = true; hydrated = false; notify('claiming', null);
        const epoch = id();
        let claimed;
        try {
          await transaction(async tx => {
            checkOnline(); const current = readHead(await tx.get(headRef));
            if (current?.owner && current.owner !== clientId && !force)
              throw fault('owned', 'הקליטה פתוחה לעריכה במכשיר אחר.');
            claimed = { ...(current || {}), schema: SCHEMA, revision: (current?.revision || 0) + 1,
              owner: clientId, epoch, updatedAt: Date.now() };
            tx.set(headRef, claimed);
          });
          if (head && head.revision > claimed.revision) throw fault('conflict', 'הקליטה השתנתה במהלך העברת השליטה. יש לנסות שוב.');
          const token = ++generation;
          head = claimed; editEpoch = epoch;
          const value = await loadSnapshot(claimed);
          if (token !== generation || !owns() || stopped) throw fault('not-owner', 'השליטה בקליטה הועברה למכשיר אחר.');
          // Recheck the server after hydration; a takeover can race the photo fetch.
          await transaction(async tx => { guard(readHead(await tx.get(headRef)), epoch, claimed.revision); });
          if (token !== generation || !owns() || stopped) throw fault('not-owner', 'השליטה בקליטה הועברה למכשיר אחר.');
          hydrated = true; claiming = false; failed = null;
          emit(value, 'claim'); notify('synced', null); trimCaches();
          return clone(value);
        } catch (problem) {
          claiming = false; editEpoch = null; notify('error', problem); throw problem;
        }
      },
      save(value) {
        try { value = clone(value); checkEdit(); } catch (problem) {
          if (problem.code === 'offline' && owns() && ready() && !finishing)
            failed = { value, sequence: ++sequence };
          notify('error', problem); return Promise.reject(problem);
        }
        failed = null; pending = { value, sequence: ++sequence };
        const promise = new Promise((resolve, reject) => waiters.push({ sequence, resolve, reject }));
        kick(); return promise;
      },
      async flush() {
        if (draining) await draining;
        if (failed) {
          checkEdit(); const value = failed.value; failed = null; await api.save(value);
        }
        if (pending || draining) { kick(); await draining; }
        if (error) throw error;
      },
      async finish(receiptId, data, emptyPayload, finishOptions = {}) {
        if (typeof receiptId !== 'string' || !receiptId || receiptId.includes('/')) throw new Error('Invalid receipt id');
        await api.flush(); checkEdit();
        finishing = true; notify('finishing', null);
        const epoch = editEpoch, expected = revision(), receiptRef = doc(db, ...rootPath, 'receipts', receiptId);
        let next;
        try {
          const snapshot = await prepare(emptyPayload);
          next = { schema: SCHEMA, revision: expected + 1, owner: clientId, epoch, snapshot,
            garbage: garbageFor(snapshot), updatedAt: Date.now(), closed: true, receiptId };
          published.set(snapshot.id, emptyPayload);
          await transaction(async tx => {
            checkOnline();
            const current = readHead(await tx.get(headRef));
            const existing = await tx.get(receiptRef);
            if (current?.closed && current.receiptId === receiptId && existing.exists()) { next = current; return; }
            guard(current, epoch, expected);
            if (existing.exists() && (!finishOptions.expectedReceipt || canonical(existing.data()) !== canonical(finishOptions.expectedReceipt)))
              throw fault('receipt-exists', 'התעודה כבר נשמרה או השתנתה במכשיר אחר. הקליטה הנוכחית לא נסגרה.');
            tx.set(receiptRef, clone(data)); tx.set(headRef, next);
          });
          if (owns() && epoch === editEpoch && revision() <= next.revision) {
            head = next; hydrated = true; emit(emptyPayload, 'finish');
          }
          failed = null; pending = null; notify('synced', null);
          await cleanup(next);
          return { receiptId, revision: next.revision };
        } catch (problem) {
          if (problem.code === 'not-owner') loseOwnership();
          notify('error', problem); throw problem;
        } finally { finishing = false; notify(); }
      },
      stop() {
        stopped = true; generation++; unsubscribe?.(); loseOwnership(); hydrated = false;
        startReject(fault('stopped', 'הסנכרון הופסק.'));
        notify('stopped', null);
      }
    };
    return api;
  }
  global.BermanSharedReceiving = Object.freeze({ create, schemaVersion: SCHEMA });
})(globalThis);
