/* Live receiving: every device edits; revisions merge changes or preserve a conflict. */
(function (global) {
  'use strict';
  const SCHEMA = 2, CHUNK_SIZE = 180000, BLOB_SIZE = 100000;
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const canonical = value => JSON.stringify(value === undefined ? null : value && typeof value === 'object'
    ? Array.isArray(value) ? value.map(item => JSON.parse(canonical(item)))
      : Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(canonical(value[key]))])) : value);
  const equal = (a, b) => canonical(a) === canonical(b);
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
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  // Three-way merge, never latest-writer-wins for amounts or quantities.
  function merge(base, local, remote, path = '') {
    if (equal(local, base)) return clone(remote);
    if (equal(remote, base) || equal(local, remote)) return clone(local);
    if (!path && base?.state && local?.state && remote?.state) {
      const b = base.state.receiptDraftId, l = local.state.receiptDraftId, r = remote.state.receiptDraftId;
      if (l !== r && (l !== b || r !== b)) throw fault('conflict', 'הקליטה הסתיימה או הוחלפה במכשיר אחר. השינויים שלך נשמרו כאן.');
    }
    if (Array.isArray(local) && Array.isArray(remote) && Array.isArray(base)
        && /(?:receiptList|reconcileData|receiptQuantityReview\.rows)$/.test(path)) {
      const key = value => value && (value.productId || value.id);
      if ([base, local, remote].every(rows => rows.every(key) && new Set(rows.map(key)).size === rows.length)) {
        const maps = [base, local, remote].map(rows => new Map(rows.map(row => [key(row), row])));
        const keys = [...new Set([...local.map(key), ...remote.map(key), ...base.map(key)])];
        return keys.map(k => merge(maps[0].get(k), maps[1].get(k), maps[2].get(k), path + '.' + k)).filter(v => v !== undefined);
      }
    }
    if (object(local) && object(remote) && (object(base) || base == null)) {
      const result = {};
      for (const key of new Set([...Object.keys(base || {}), ...Object.keys(local), ...Object.keys(remote)])) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) throw fault('invalid-snapshot', 'מבנה קליטה לא תקין');
        const value = merge(base?.[key], local[key], remote[key], path ? path + '.' + key : key);
        if (value !== undefined) result[key] = value;
      }
      return result;
    }
    // Navigation/display choices are not business data. Active typing wins on
    // this screen; simultaneous edits to a real form value remain a conflict.
    if (path.startsWith('ui.') && !path.startsWith('ui.forms.') && path !== 'ui.quantity.value') return clone(local);
    const problem = fault('conflict', 'אותו נתון השתנה גם במכשיר אחר. שתי הגרסאות נשמרו — בחר איזו להמשיך.');
    problem.path = path; throw problem;
  }
  function create(options) {
    const { db, doc, getDoc, onSnapshot, runTransaction, writeBatch, setDoc,
      rootPath, clientId, onState = () => {}, onStatus = () => {} } = options;
    if (!clientId || !Array.isArray(rootPath)) throw new Error('Shared receiving requires clientId and rootPath');
    const headRef = doc(db, ...rootPath, 'drafts', 'receiving');
    const refForChunk = key => doc(db, ...rootPath, 'drafts', 'receiving_chunk_' + key);
    const chunks = new Map(), contentKeys = new Map(), published = new Map();
    const online = () => options.isOnline ? options.isOnline() : global.navigator?.onLine !== false;
    let head = null, payload = null, visibleBase = null, localValue = null, serverSeen = false, hydrated = false;
    let stopped = false, started = false, finishing = false, status = 'connecting', error = null, conflict = null;
    let unsubscribe, generation = 0, pending = null, failed = null, draining = null, sequence = 0, flight = null;
    let waiters = [], startResolve, startReject, scanToken = null, heartbeat = null;
    const startPromise = new Promise((resolve, reject) => { startResolve = resolve; startReject = reject; });
    startPromise.catch(() => {});
    const revision = () => Number(head?.revision) || 0;
    const ready = () => serverSeen && hydrated && !stopped;
    const state = () => ({ ready: ready(), canEdit: ready() && !conflict, isOwner: ready() && !conflict,
      busy: !!draining || finishing, status, error, revision: revision(), owner: null,
      dirty: !!pending || !!failed || !!draining, conflict: conflict ? { path: conflict.path || '', message: conflict.message } : null,
      scan: head?.scanLock || null, head: head ? clone(head) : null });
    const notify = (next, problem) => {
      if (next) status = next;
      if (problem !== undefined) error = problem;
      try { onStatus(state()); } catch (e) { global.console?.error?.('Shared receiving status callback failed', e); }
    };
    const emit = (value, source) => {
      visibleBase = clone(value); localValue = clone(value);
      onState(clone(value), { head: head ? clone(head) : null, revision: revision(), canEdit: true, source });
    };
    const currentLocal = () => clone(options.getLocal && hydrated ? options.getLocal() : localValue);
    const checkOnline = () => { if (!online()) throw fault('offline', 'אין חיבור לאינטרנט. השינויים טרם סונכרנו.'); };
    const checkEdit = () => {
      checkOnline();
      if (!ready() || finishing) throw fault('not-ready', 'ממתין לקליטה העדכנית מהענן.');
      if (conflict) throw conflict;
    };
    const settle = (until, problem) => {
      const done = waiters.filter(w => w.sequence <= until); waiters = waiters.filter(w => w.sequence > until);
      for (const waiter of done) problem ? waiter.reject(problem) : waiter.resolve({ revision: revision() });
    };
    const readHead = snapshot => {
      if (!snapshot.exists()) return null;
      const value = snapshot.data();
      if (![1, SCHEMA].includes(value.schema) || !Number.isSafeInteger(value.revision) || value.revision < 0)
        throw fault('unsupported-state', 'גרסת הקליטה אינה נתמכת. יש לרענן את האפליקציה.');
      return value;
    };
    const guard = (current, expected) => {
      if ((Number(current?.revision) || 0) !== expected) throw fault('revision-changed', 'הקליטה התעדכנה — ממזג את השינויים.');
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
    function garbageFor(snapshot, base = head) {
      const keep = new Set([...(snapshot.refs || snapshot.chunks), ...(base?.pinnedRefs || [])]);
      const garbage = Array.from(new Set([...(base?.garbage || []), ...(base?.snapshot?.refs || base?.snapshot?.chunks || [])]))
        .filter(key => !keep.has(key));
      if (garbage.length > 2000) throw fault('cleanup-required', 'יש תקלה בניקוי נתוני הסנכרון הישנים. השמירה נעצרה כדי למנוע הצטברות נתונים.');
      return garbage;
    }
    function trimCaches() {
      if (!head?.snapshot?.refs) return;
      const keep = new Set(head.snapshot.refs);
      for (const key of chunks.keys()) if (!keep.has(key)) chunks.delete(key);
      for (const [text, key] of contentKeys) if (!keep.has(key)) contentKeys.delete(text);
      for (const key of published.keys()) if (key !== head.mutationId) published.delete(key);
    }
    async function cleanup(target) {
      // GC also advances the revision: a concurrent prepared snapshot must retry
      // rather than publish a reference that another writer just deleted.
      if (!target?.garbage?.length || stopped) { trimCaches(); return; }
      try {
        let remaining = target.garbage.slice();
        while (remaining.length && !stopped) {
          const group = remaining.slice(0, 100);
          let cleaned;
          await transaction(async tx => {
            const current = readHead(await tx.get(headRef)); guard(current, target.revision);
            const reachable = new Set([...(current.snapshot?.refs || current.snapshot?.chunks || []), ...(current.pinnedRefs || [])]);
            group.filter(key => !reachable.has(key)).forEach(key => tx.delete(refForChunk(key)));
            cleaned = { ...current, revision: current.revision + 1, garbage: (current.garbage || []).filter(key => !group.includes(key)) };
            tx.set(headRef, cleaned);
          });
          remaining = cleaned.garbage;
          if (revision() <= cleaned.revision) head = cleaned;
          target = cleaned;
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
      if (![1, SCHEMA].includes(manifest.schema) || !Array.isArray(manifest.blobs)) throw fault('invalid-snapshot', 'מבנה הקליטה אינו נתמך.');
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

    async function refresh() {
      const next = readHead(await bounded(getDoc(headRef)));
      if (next && head && next.revision < head.revision) return head;
      head = next; return next;
    }
    async function reconcileRemote(next, value, source = 'remote') {
      const initial = !hydrated;
      const local = initial ? null : currentLocal(), base = visibleBase;
      head = next; payload = clone(value); serverSeen = true; hydrated = true;
      if (initial) { emit(value, source); notify('synced', null); startResolve(api); return; }
      if (draining || finishing || conflict) { notify(conflict ? 'conflict' : status); return; }
      try {
        const merged = merge(base, local, value);
        const changed = !equal(local, merged);
        // Keep the merge base equal to the authoritative server state, while
        // local edits that predate the notification remain pending.
        if (changed) emit(merged, source);
        visibleBase = clone(value); localValue = clone(merged);
        if (!equal(merged, value)) queueValue(merged, value);
        else { failed = null; notify('synced', null); }
      } catch (problem) {
        if (problem.code !== 'conflict') throw problem;
        conflict = problem; failed = { value: local, base, sequence: ++sequence };
        notify('conflict', problem);
      }
    }
    async function receive(snapshot) {
      if (stopped || snapshot.metadata?.hasPendingWrites || snapshot.metadata?.fromCache !== false) return;
      const token = ++generation;
      try {
        const next = readHead(snapshot);
        if (head && next && next.revision < head.revision) return;
        if (hydrated && next?.snapshot?.id === head?.snapshot?.id) {
          head = next; notify(status, error); startResolve(api); return;
        }
        // Own commits are acknowledged without replacing newer local typing.
        if (next?.mutationId && published.has(next.mutationId)) {
          head = next; payload = clone(published.get(next.mutationId)); notify('saving', null); return;
        }
        const value = await loadSnapshot(next);
        if (token !== generation || stopped) return;
        await reconcileRemote(next, value);
      } catch (problem) {
        if (token !== generation || stopped) return;
        notify('error', problem); if (!hydrated) startReject(problem);
      }
    }
    function queueValue(value, base = visibleBase) {
      const item = { value: clone(value), base: clone(base), sequence: ++sequence, mutationId: id() };
      pending = item; localValue = clone(value); failed = null;
      kick(); return item;
    }
    async function commitItem(item) {
      for (let retry = 0; retry < 8; retry++) {
        checkEdit();
        const remote = await refresh(), expected = revision();
        if (remote?.mutationId === item.mutationId) return { head: remote, value: await loadSnapshot(remote) };
        let value;
        try { value = merge(item.base, item.value, await loadSnapshot(remote)); }
        catch (problem) { if (problem.code === 'conflict') conflict = problem; throw problem; }
        const snapshot = await prepare(value);
        const next = { ...(remote || {}), schema: SCHEMA, mode: 'live', owner: null, epoch: null,
          revision: expected + 1, snapshot, garbage: garbageFor(snapshot, remote), mutationId: item.mutationId,
          updatedAt: Date.now(), closed: false };
        // A different/cleared receipt invalidates any old paid scan lease.
        if (remote?.draftId !== value?.state?.receiptDraftId) next.scanLock = null;
        next.draftId = value?.state?.receiptDraftId || null;
        published.set(item.mutationId, value);
        try {
          await transaction(async tx => {
            const current = readHead(await tx.get(headRef)); guard(current, expected);
            // Scan leases can change without a content revision during upload.
            next.scanLock = current?.draftId === next.draftId ? current?.scanLock || null : null;
            tx.set(headRef, next);
          });
          if (revision() <= next.revision) { head = next; payload = clone(value); }
          return { head: next, value };
        } catch (problem) { published.delete(item.mutationId); if (problem.code !== 'revision-changed') throw problem; }
      }
      throw fault('busy', 'הקליטה מתעדכנת כעת. השינויים נשמרו כאן — נסה שוב.');
    }
    async function drain() {
      while (pending && !stopped) {
        const item = pending; pending = null; flight = item;
        try {
          notify('saving', null);
          const result = await commitItem(item);
          // Capture edits made during upload before replacing anything on screen.
          const latest = options.getLocal ? currentLocal() : clone((pending || item).value);
          const merged = merge(item.value, latest, result.value);
          if (!equal(latest, merged)) emit(merged, 'merged');
          visibleBase = clone(result.value); localValue = clone(merged);
          if (pending) { pending.base = clone(result.value); pending.value = clone(merged); }
          else if (!equal(merged, result.value)) queueValue(merged, result.value);
          if (!failed || failed.sequence <= item.sequence) failed = null;
          settle(item.sequence);
          await cleanup(result.head);
        } catch (problem) {
          if (problem.code === 'conflict') conflict = problem;
          failed = pending || failed || item; pending = null;
          settle(Infinity, problem); notify(conflict ? 'conflict' : 'error', problem); return;
        } finally { flight = null; }
      }
    }
    function kick() {
      if (draining) return draining;
      draining = Promise.resolve().then(drain).finally(async () => {
        draining = null;
        if (!error) notify('synced', null); else notify();
        if (pending) kick();
        else if (!conflict && !failed && hydrated && !finishing && !stopped) {
          // A remote write can arrive while an upload is pending. Apply it now.
          try { const latest = await refresh(); const value = await loadSnapshot(latest); await reconcileRemote(latest, value); }
          catch (problem) { notify('error', problem); }
        }
      });
      return draining;
    }
    async function resolveConflict(useLocal) {
      if (draining) await draining;
      if (!conflict && !failed) return;
      const local = currentLocal(), latest = await refresh(), remoteValue = await loadSnapshot(latest);
      const localSnapshot = await prepare(local), backupId = 'receiving_conflict_' + id();
      let next;
      await transaction(async tx => {
        const current = readHead(await tx.get(headRef)); guard(current, latest?.revision || 0);
        tx.set(doc(db, ...rootPath, 'drafts', backupId), { schema: SCHEMA, savedAt: Date.now(),
          local: localSnapshot, remote: current?.snapshot || null, reason: 'concurrent_receiving_edit' });
        const selected = useLocal ? localSnapshot : current.snapshot;
        next = { ...current, schema: SCHEMA, mode: 'live', owner: null, epoch: null,
          revision: current.revision + 1, snapshot: selected, mutationId: id(), updatedAt: Date.now(), scanLock: null,
          draftId: (useLocal ? local : remoteValue)?.state?.receiptDraftId || null,
          closed: useLocal ? false : !!current.closed,
          pinnedRefs: [...new Set([...(current.pinnedRefs || []), ...localSnapshot.refs, ...(current.snapshot?.refs || [])])] };
        tx.set(headRef, next);
      });
      conflict = null; failed = null; pending = null; head = next; payload = clone(useLocal ? local : remoteValue);
      emit(payload, 'resolved'); notify('synced', null);
    }
    async function updateScan(action, token) {
      let lock;
      await transaction(async tx => {
        const current = readHead(await tx.get(headRef));
        if (!current) throw fault('not-ready', 'יש לשמור את הצילום לפני פענוח.');
        const existing = current.scanLock;
        if (action === 'acquire') {
          if (existing && existing.expiresAt > Date.now()) throw fault('scan-busy', 'הפענוח כבר מתבצע במכשיר אחר. התוצאה תופיע כאן אוטומטית.');
          lock = { id: id(), clientId, draftId: current.draftId || null, expiresAt: Date.now() + 180000 };
        } else {
          if (!existing || existing.id !== token?.id || existing.draftId !== current.draftId) return;
          lock = action === 'release' ? null : { ...existing, expiresAt: Date.now() + 180000 };
        }
        tx.set(headRef, { ...current, scanLock: lock });
      });
      return lock;
    }
    const api = {
      get ready() { return ready(); }, get canEdit() { return ready() && !conflict; },
      get isOwner() { return ready() && !conflict; }, // Compatibility only; no ownership exists in v102.
      get clientId() { return clientId; }, get busy() { return !!draining || finishing; }, get status() { return state(); },
      get revision() { return revision(); }, get payload() { return clone(payload); }, get head() { return clone(head); },
      merge,
      start() {
        if (!started) { started = true; unsubscribe = onSnapshot(headRef, { includeMetadataChanges: true }, receive, problem => {
          notify('error', problem); if (!hydrated) startReject(problem);
        }); }
        return startPromise;
      },
      save(value) {
        try { value = clone(value); checkEdit(); }
        catch (problem) {
          if (problem.code === 'offline' && hydrated) { localValue = value; failed = { value, base: clone(visibleBase), sequence: ++sequence, mutationId: id() }; }
          notify('error', problem); return Promise.reject(problem);
        }
        if (head?.schema === SCHEMA && !pending && !draining && equal(value, visibleBase)) return Promise.resolve({ revision: revision() });
        const item = queueValue(value);
        return new Promise((resolve, reject) => waiters.push({ sequence: item.sequence, resolve, reject }));
      },
      async flush() {
        if (draining) await draining;
        if (conflict) throw conflict;
        if (failed) {
          checkEdit(); const old = failed; failed = null; pending = old; await kick();
        }
        while (pending || draining) { kick(); await draining; }
        if (error) throw error;
      },
      resolveConflict,
      async acquireScan() {
        await api.flush(); checkEdit(); scanToken = await updateScan('acquire');
        if (global.setInterval) { heartbeat = global.setInterval(() => updateScan('heartbeat', scanToken).catch(() => {}), 45000); heartbeat?.unref?.(); }
        return clone(scanToken);
      },
      async releaseScan(token) { if (!token) return; if (heartbeat) global.clearInterval(heartbeat); heartbeat = null; await updateScan('release', token); if (scanToken?.id === token.id) scanToken = null; },
      async finish(receiptId, data, emptyPayload, finishOptions = {}) {
        if (typeof receiptId !== 'string' || !receiptId || receiptId.includes('/')) throw new Error('Invalid receipt id');
        await api.flush(); checkEdit(); finishing = true; notify('finishing', null);
        const expected = revision(), receiptRef = doc(db, ...rootPath, 'receipts', receiptId);
        try {
          const snapshot = await prepare(emptyPayload);
          let next;
          await transaction(async tx => {
            const current = readHead(await tx.get(headRef)), existing = await tx.get(receiptRef);
            if (current?.closed && current.receiptId === receiptId && existing.exists()) { next = current; return; }
            guard(current, expected);
            if (current.scanLock?.expiresAt > Date.now()) throw fault('scan-busy', 'יש להמתין לסיום הפענוח לפני שמירת התעודה.');
            if (existing.exists() && (!finishOptions.expectedReceipt || !equal(existing.data(), finishOptions.expectedReceipt)))
              throw fault('receipt-exists', 'התעודה כבר נשמרה או השתנתה. בדוק לפני הסיום.');
            next = { ...current, schema: SCHEMA, mode: 'live', owner: null, epoch: null,
              revision: expected + 1, snapshot, garbage: garbageFor(snapshot, current), mutationId: id(),
              updatedAt: Date.now(), closed: true, receiptId, draftId: null, scanLock: null };
            tx.set(receiptRef, clone(data)); tx.set(headRef, next);
          });
          head = next; payload = clone(emptyPayload); failed = null; pending = null;
          emit(emptyPayload, 'finish'); await cleanup(next); notify('synced', null);
          return { receiptId, revision: revision() };
        } catch (problem) { notify('error', problem); throw problem; }
        finally { finishing = false; notify(); }
      },
      stop() {
        stopped = true; generation++; unsubscribe?.(); if (heartbeat) global.clearInterval(heartbeat);
        settle(Infinity, fault('stopped', 'הסנכרון הופסק.')); hydrated = false; notify('stopped', null);
      }
    };
    return api;
  }
  global.BermanSharedReceiving = Object.freeze({ create, merge, schemaVersion: SCHEMA });
})(globalThis);
