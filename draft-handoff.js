/* draft-handoff.js — טיוטה בטלפון, גיבוי בענן, מעבר בין טלפונים.
 * המפרט: docs/local-first-sync.md (במאגר asafkiri/berman-app). המודול עצמאי: אותו קובץ בכל אפליקציה, ורק המתאם שונה.
 *
 * העיקר:
 * - העבודה לא מחכה לרשת. הטיוטה נשמרת בטלפון (אצל האפליקציה); המודול רק מגבה, מעביר ושומר בסוף.
 * - מסמך אחד בענן לכל מושב טיוטה: drafts/handoff_{app}_{kind}_{sessionId}. כל כתיבה אליו — וגם השמירה הסופית — היא
 *   טרנזקציה עם תנאי (maxAttempts: 1, עם גידור ותקרת זמן). אין כתיבה עיוורת, ולכן אין כתיבה ישנה שנוחתת מאוחר.
 * - החלטות ("שלי" / "עברה" / "נשמרה" / "בוטלה") רק מהשרת: קריאה בתוך טרנזקציה, או snapshot עם fromCache === false.
 * - מונה gen (לא שעון). deviceId אקראי לכל טלפון.
 *
 * שימוש:
 *   const h = DraftHandoff.create({ app, kind, prefix, db, fs, rootPath, recordCollection, adapter, appVersion });
 *   h.start();                 // אחרי ההתחברות, איפה שמתחילים את שאר המאזינים
 *   h.changed({ user });       // אחרי כל שמירה מקומית של הטיוטה (user: true כשהשינוי נולד מאירוע של המשתמש)
 *   h.flush();                 // גיבוי מיד (מעבר לרקע, תחילת/סוף קריאה בתשלום)
 *   await h.take(sessionId);   // "המשך אותה כאן" / "החזר אותה לכאן"
 *   await h.finish(recordId, data);  // השמירה הסופית (במקום set עיוור)
 *   h.cancel();                // לפני שהאפליקציה מרוקנת טיוטה שבוטלה
 *   h.clear();                 // "נקה אותה מהטלפון הזה"
 *   h.openSide(sessionId);     // "פתח אותה" — עותק בצד
 *   h.state();                 // לשורה העליונה ולשומר: { readOnly, away, offers, side, status, checking, ... }
 *
 * המתאם (adapter):
 *   getDraft() → { sessionId, recordId, empty, payload (מחרוזת JSON בלי תמונות), summary, scanRunning, expected }
 *   validatePayload(obj, doc) → true/false        applyPayload(text, meta)        emptyDraft()
 *   recordSaved(recordId) → true/false (לניקוי עותקים בצד בלבד, לא להחלטה)       deviceName() → מחרוזת
 *   onChange(state)   onNotice(code, info)   finishedLate(sessionId)   log(title, text, meta)
 *   finishWrites(tx, ctx) — כתיבות נוספות בתוך טרנזקציית הסיום (רשות)
 */
(function (global) {
  'use strict';
  const VERSION = 1;
  const MAX_BYTES = 900000, SIDE_MAX = 3, SIDE_BYTES = 1000000;
  const fault = (code, message) => Object.assign(new Error(message || code), { code });
  const canonical = value => JSON.stringify(value === undefined ? null : value && typeof value === 'object'
    ? Array.isArray(value) ? value.map(item => JSON.parse(canonical(item)))
      : Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(canonical(value[key]))])) : value);
  const equal = (a, b) => canonical(a) === canonical(b);
  const bytes = text => { try { return new global.TextEncoder().encode(text).length; } catch (e) { return text.length * 3; } };
  const randomId = () => (global.crypto && typeof global.crypto.randomUUID === 'function' ? global.crypto.randomUUID()
    : Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
  const safeId = id => String(id || '').replace(/[\/\s]/g, '_').slice(0, 300);

  function create(o) {
    const { app, kind, prefix, db, rootPath } = o;
    const fs = o.fs || null, A = o.adapter || {};
    if (!app || !kind || !prefix) throw new Error('draft-handoff: app, kind, prefix are required');
    const store = o.storage || (() => { try { return global.localStorage; } catch (e) { return null; } })();
    const timers = o.timers || { set: (fn, ms) => global.setTimeout(fn, ms), clear: id => global.clearTimeout(id) };
    const online = () => (o.isOnline ? o.isOnline() : !(global.navigator && global.navigator.onLine === false));
    const now = () => (o.now ? o.now() : Date.now());
    const maxScanMs = Number(o.maxScanMs) || 16 * 60000;
    const T = Object.assign({ backup: 12000, take: 12000, finish: 15000, close: 12000, read: 10000, debounce: 1500, retry: 20000, grace: 2500, settleCap: 60000 }, o.timeouts || {});
    const openKey = app + ':' + kind;
    const K = { device: prefix + '_device_id', claim: prefix + '_handoff_' + kind + '_claim', away: prefix + '_handoff_' + kind + '_away',
      side: prefix + '_handoff_' + kind + '_side', close: prefix + '_handoff_' + kind + '_close', legacy: prefix + '_handoff_' + kind + '_legacy' };
    const cloudReady = () => !!(db && fs && typeof fs.runTransaction === 'function' && typeof fs.doc === 'function');

    // ---- אחסון בטלפון (עם עותק בזיכרון: אם localStorage נכשל, לא ממציאים claim חדש בכל פעם) ----
    const memory = new Map();
    function readKey(key, fallback) {
      if (memory.has(key)) return memory.get(key);
      let value = fallback;
      try { const raw = store && store.getItem(key); if (raw != null) value = JSON.parse(raw); } catch (e) { value = fallback; }
      memory.set(key, value); return value;
    }
    function writeKey(key, value) {
      memory.set(key, value);
      try { if (!store) return false; if (value == null) store.removeItem(key); else store.setItem(key, JSON.stringify(value)); return true; }
      catch (e) { return false; }
    }
    let deviceIdValue = null;
    function me() {
      if (deviceIdValue) return deviceIdValue;
      let id = null;
      try { id = store && store.getItem(K.device); } catch (e) { id = null; }
      if (!id) { id = 'dev_' + randomId(); try { store && store.setItem(K.device, id); } catch (e) {} } // נכשל → אקראי לריצה הזאת
      deviceIdValue = id; return id;
    }
    const name = () => { try { return String((A.deviceName && A.deviceName()) || '').slice(0, 60); } catch (e) { return ''; } };

    // claim: { sessionId, gen } — gen 0 = נוצרה כאן, הבעלות עוד לא אושרה. אין claim = טיוטה מלפני המנגנון (או מהסנכרון הישן)
    const claim = () => readKey(K.claim, null);
    const claimFor = sessionId => { const c = claim(); return c && c.sessionId === sessionId ? c : null; };
    const setClaim = (sessionId, gen) => writeKey(K.claim, { sessionId, gen: Number(gen) || 0 });
    const away = () => readKey(K.away, null);
    const awayFor = sessionId => { const a = away(); return a && a.sessionId === sessionId ? a : null; };
    function setAway(sessionId, kindOfAway, docData) {
      const prev = awayFor(sessionId);
      const next = { sessionId, away: kindOfAway, by: docData ? docData.deviceName || '' : '', byDevice: docData ? docData.deviceId || '' : '',
        gen: docData ? Number(docData.gen) || 0 : 0, at: docData ? Number(docData.updatedAt) || 0 : 0 };
      if (prev && equal(prev, next)) return;
      writeKey(K.away, next);
    }
    const clearAway = sessionId => { const a = away(); if (a && (!sessionId || a.sessionId === sessionId)) writeKey(K.away, null); };
    const sideList = () => (Array.isArray(readKey(K.side, [])) ? readKey(K.side, []) : []);
    const closeQueue = () => (Array.isArray(readKey(K.close, [])) ? readKey(K.close, []) : []);

    // ---- הטיוטה דרך המתאם ----
    function draft() {
      let d = null;
      try { d = A.getDraft ? A.getDraft() : null; } catch (e) { d = null; }
      if (!d) return { empty: true };
      const sessionId = d.sessionId ? safeId(d.sessionId) : null;
      return { sessionId, recordId: d.recordId ? safeId(d.recordId) : sessionId, empty: !!d.empty || !sessionId,
        payload: typeof d.payload === 'string' ? d.payload : null, summary: d.summary || {}, scanRunning: !!d.scanRunning,
        expected: d.expected || null };
    }
    // טיוטה שהייתה פתוחה כשהמנגנון עלה לראשונה בטלפון הזה — מהסנכרון הישן: לא נתבעת בפתיחה, רק בעריכה הראשונה של המשתמש
    function legacySession() { const l = readKey(K.legacy, null); return l && l.sessionId || null; }
    function isLegacy(sessionId) { return !!sessionId && legacySession() === sessionId && !claimFor(sessionId); }
    // טיוטה בלי claim שאינה הטיוטה הישנה → נוצרה כאן (המודול כבר רץ כשנוצרה)
    function ensureClaim(d) {
      if (!d || d.empty || !d.sessionId) return null;
      const c = claimFor(d.sessionId); if (c) return c;
      if (isLegacy(d.sessionId)) return null;
      setClaim(d.sessionId, 0); return claimFor(d.sessionId);
    }

    // ---- ענן ----
    const handoffRef = sessionId => fs.doc(db, ...rootPath, 'drafts', 'handoff_' + safeId(app) + '_' + safeId(kind) + '_' + safeId(sessionId));
    const recordRef = recordId => fs.doc(db, ...rootPath, o.recordCollection, safeId(recordId));
    const exists = snap => !!snap && (typeof snap.exists === 'function' ? snap.exists() : !!snap.exists);
    const fromServer = snap => !!snap && !!snap.metadata && snap.metadata.fromCache === false;
    const errorCode = e => (e && e.code ? String(e.code).replace(/^firestore\//, '') : 'failed');
    const permanent = e => ['permission-denied', 'invalid-argument', 'too-big'].includes(errorCode(e));

    // טרנזקציה אחת: בלי ניסיונות חוזרים, עם גידור (כלום לא ייכתב אחרי תקרת הזמן), ו-commitSent ("לא ידוע" אחרי שליחה)
    function transaction(body, ms) {
      if (!cloudReady()) return Promise.reject(fault('no-cloud'));
      if (!online()) return Promise.reject(fault('offline'));
      let active = true, commitSent = false, timer = null;
      const check = () => { if (!active) throw fault('timeout'); };
      const run = Promise.resolve().then(() => fs.runTransaction(db, async raw => {
        check();
        const fenced = {
          get: async ref => { check(); const snap = await raw.get(ref); check(); return snap; },
          set: (ref, data) => { check(); raw.set(ref, data); }
        };
        const out = await body(fenced);
        check();
        commitSent = true;
        return out;
      }, { maxAttempts: 1 }));
      const timeout = new Promise((_, reject) => { timer = timers.set(() => { active = false; reject(fault('timeout')); }, ms); });
      const settled = run.then(() => true, () => true);
      return Promise.race([run, timeout]).then(value => { active = false; timers.clear(timer); return value; }, error => {
        active = false; timers.clear(timer);
        const e = error && typeof error === 'object' ? error : fault('failed'); // גם שגיאה מ-realm אחר
        e.commitSent = commitSent; e.settled = settled; throw e;
      });
    }

    // ---- מצב ----
    let started = false, stopped = false, status = 'idle', writing = false, again = false, debounceTimer = null, retryTimer = null;
    let finishing = false, taking = false, checking = null, lastScan = false, scanStartedLocal = null, scanTimer = null;
    let watched = new Map(), currentDoc = null, offerDocs = [], offersFromServer = false, unsubQuery = null;
    const scanSeen = new Map();
    function setStatus(next) { if (status !== next) { status = next; emit(); } }
    function emit() { try { A.onChange && A.onChange(api.state()); } catch (e) { global.console && global.console.warn && global.console.warn('draft-handoff onChange', e); } }
    function notice(code, info) { try { A.onNotice && A.onNotice(code, info || {}); } catch (e) {} }
    function log(title, text, meta) { try { A.log && A.log(title, text, meta || {}); } catch (e) {} }

    function docData(d, gen, extra) {
      const data = Object.assign({ handoff: VERSION, app, kind, openKey, sessionId: d.sessionId, recordId: d.recordId, editsExisting: !!d.expected,
        deviceId: me(), deviceName: name(), gen, state: 'open', savedBy: null, payload: d.payload, tooBig: false,
        summary: d.summary || {}, scanRunning: !!d.scanRunning, scanStartedAt: d.scanRunning ? (scanStartedLocal || now()) : null,
        updatedAt: now(), writtenBy: String(o.appVersion || '') }, extra || {});
      if (data.payload == null || bytes(JSON.stringify(data)) > MAX_BYTES) { data.payload = null; data.tooBig = true; }
      return data;
    }
    function closedDoc(prev, d, state, savedBy) {
      return { handoff: VERSION, app, kind, openKey: null, sessionId: d.sessionId, recordId: d.recordId || (prev && prev.recordId) || d.sessionId,
        editsExisting: !!(d.expected || (prev && prev.editsExisting)), deviceId: me(), deviceName: name(),
        gen: prev ? Number(prev.gen) || 0 : (claimFor(d.sessionId) ? claimFor(d.sessionId).gen : 0),
        state, savedBy: savedBy || null, payload: null, tooBig: false, summary: d.summary || (prev && prev.summary) || {},
        scanRunning: false, scanStartedAt: null, updatedAt: now(), writtenBy: String(o.appVersion || '') };
    }
    const sameContent = (cur, next) => cur && cur.payload === next.payload && !!cur.tooBig === !!next.tooBig
      && equal(cur.summary || {}, next.summary || {}) && !!cur.scanRunning === !!next.scanRunning && (cur.deviceName || '') === next.deviceName;

    // ---- מאזינים ----
    function watch(sessionId) {
      if (!sessionId || watched.has(sessionId) || !cloudReady() || typeof fs.onSnapshot !== 'function') return;
      let unsub = null;
      try {
        unsub = fs.onSnapshot(handoffRef(sessionId), { includeMetadataChanges: true }, snap => onDoc(sessionId, snap),
          e => global.console && global.console.warn && global.console.warn('draft-handoff doc listener', e));
      } catch (e) { unsub = null; }
      watched.set(sessionId, unsub);
    }
    function unwatchExcept(keep) {
      for (const [id, unsub] of watched) if (!keep.includes(id)) { try { unsub && unsub(); } catch (e) {} watched.delete(id); }
    }
    function syncWatches() {
      const d = draft(), keep = [];
      if (!d.empty) keep.push(d.sessionId);
      if (checking) keep.push(checking.sessionId);
      unwatchExcept(keep); keep.forEach(watch);
      if (d.empty || !watched.has(d.sessionId)) currentDoc = d.empty ? null : currentDoc && currentDoc.sessionId === d.sessionId ? currentDoc : null;
    }
    function onDoc(sessionId, snap) {
      if (!fromServer(snap)) return; // מטמון — לא מחליטים לפיו
      const cur = exists(snap) ? snap.data() : null;
      const d = draft();
      if (!d.empty && d.sessionId === sessionId) currentDoc = cur;
      if (checking && checking.sessionId === sessionId && checking.settledOk) resolveChecking(cur);
      if (!d.empty && d.sessionId === sessionId && cur) decide(sessionId, cur);
      emit();
    }
    // הכרעה לפי מסמך מהשרת, לטיוטה שפתוחה כאן
    function decide(sessionId, cur) {
      if (checking && checking.sessionId === sessionId) return;
      if (cur.state === 'saved') {
        if (cur.savedBy && cur.savedBy.deviceId === me() && finishing) return;
        setAway(sessionId, 'saved', cur);
      } else if (cur.state === 'canceled') setAway(sessionId, 'canceled', cur);
      else if (cur.state === 'open' && cur.deviceId !== me()) setAway(sessionId, 'moved', cur);
      else if (cur.state === 'open' && cur.deviceId === me()) {
        clearAway(sessionId);
        const c = claimFor(sessionId);
        if (!c || c.gen !== Number(cur.gen)) setClaim(sessionId, Number(cur.gen) || 0);
      }
    }
    function startQuery() {
      if (unsubQuery || !cloudReady() || typeof fs.onSnapshot !== 'function' || typeof fs.query !== 'function') return;
      try {
        const q = fs.query(fs.collection(db, ...rootPath, 'drafts'), fs.where('openKey', '==', openKey));
        unsubQuery = fs.onSnapshot(q, { includeMetadataChanges: true }, qs => {
          if (!qs || !qs.metadata || qs.metadata.fromCache !== false) return;
          offersFromServer = true;
          offerDocs = (qs.docs || []).map(s => s.data()).filter(x => x && x.handoff === VERSION && x.state === 'open' && x.sessionId);
          const live = new Set();
          for (const x of offerDocs) if (x.scanRunning) {
            const key = x.sessionId + ':' + (x.scanStartedAt || '') + ':' + (x.deviceId || '');
            live.add(key); if (!scanSeen.has(key)) scanSeen.set(key, now());
          }
          for (const key of [...scanSeen.keys()]) if (!live.has(key)) scanSeen.delete(key);
          scheduleScanExpiry();
          emit();
        }, e => global.console && global.console.warn && global.console.warn('draft-handoff query listener', e));
      } catch (e) { unsubQuery = null; }
    }
    function scanWindowOpen(x) {
      if (!x.scanRunning) return false;
      const seen = scanSeen.get(x.sessionId + ':' + (x.scanStartedAt || '') + ':' + (x.deviceId || ''));
      return seen == null || now() - seen < maxScanMs;
    }
    function scheduleScanExpiry() {
      if (scanTimer) { timers.clear(scanTimer); scanTimer = null; }
      const left = [...scanSeen.values()].map(at => at + maxScanMs - now()).filter(ms => ms > 0);
      if (left.length) scanTimer = timers.set(() => { scanTimer = null; emit(); }, Math.min(...left) + 50);
    }

    // ---- גיבוי ----
    function schedule(ms) {
      if (!cloudReady() || stopped) return;
      if (debounceTimer) timers.clear(debounceTimer);
      debounceTimer = timers.set(() => { debounceTimer = null; backup(); }, ms);
    }
    function scheduleRetry() {
      if (retryTimer || !cloudReady() || stopped) return;
      retryTimer = timers.set(() => { retryTimer = null; retryAll(); }, T.retry);
    }
    function retryAll() {
      if (!cloudReady() || stopped) return;
      processCloses();
      if (checking && checking.settledOk) resolveCheckingFromServer();
      backup();
    }
    async function backup() {
      if (!cloudReady()) return;
      if (writing) { again = true; return; }
      const d = draft();
      if (d.empty) { setStatus('idle'); return; }
      if (checking || finishing || taking) return;
      if (awayFor(d.sessionId)) return;
      const c = ensureClaim(d);
      if (!c) { setStatus('local'); return; } // טיוטה מהסנכרון הישן שעוד לא נערכה כאן — לא נתבעת
      if (!online()) { setStatus('failed'); scheduleRetry(); return; }
      writing = true; setStatus('saving');
      try {
        const res = await transaction(async t => {
          const ref = handoffRef(d.sessionId);
          const snap = await t.get(ref);
          const cur = exists(snap) ? snap.data() : null;
          if (!cur) {
            if (!d.expected) { const rec = await t.get(recordRef(d.recordId)); if (exists(rec)) return { away: 'saved', doc: null }; }
            t.set(ref, docData(d, 1)); return { gen: 1 };
          }
          if (cur.state !== 'open') return { away: cur.state === 'canceled' ? 'canceled' : 'saved', doc: cur };
          if (cur.deviceId !== me()) return { away: 'moved', doc: cur };
          const next = docData(d, Number(cur.gen) || 1);
          if (sameContent(cur, next)) return { gen: next.gen, same: true };
          t.set(ref, next); return { gen: next.gen };
        }, T.backup);
        const still = draft();
        if (res.away) { if (!still.empty && still.sessionId === d.sessionId) setAway(d.sessionId, res.away, res.doc); setStatus('idle'); }
        else {
          if (claimFor(d.sessionId)) setClaim(d.sessionId, res.gen);
          setStatus(still.sessionId === d.sessionId && still.payload === d.payload && still.scanRunning === d.scanRunning ? 'saved' : 'saving');
        }
        if (retryTimer && !closeQueue().length) { timers.clear(retryTimer); retryTimer = null; }
      } catch (e) {
        setStatus(permanent(e) ? 'blocked' : 'failed');
        if (!permanent(e)) scheduleRetry();
      } finally {
        writing = false;
        const later = draft();
        if (again || (!later.empty && later.sessionId === d.sessionId && (later.payload !== d.payload || later.scanRunning !== d.scanRunning) && status !== 'blocked')) {
          again = false; schedule(0);
        }
        emit();
      }
    }

    // ---- ביטול ----
    let closing = false;
    async function processCloses() {
      if (closing || !cloudReady() || !online()) return;
      const queue = closeQueue(); if (!queue.length) return;
      closing = true;
      try {
        for (const q of queue) {
          try {
            await transaction(async t => {
              const ref = handoffRef(q.sessionId), snap = await t.get(ref);
              const cur = exists(snap) ? snap.data() : null;
              if (!cur) {
                if (!q.editsExisting) { const rec = await t.get(recordRef(q.recordId)); if (exists(rec)) return; }
                t.set(ref, closedDoc(null, { sessionId: q.sessionId, recordId: q.recordId, expected: q.editsExisting ? {} : null, summary: q.summary }, 'canceled')); return;
              }
              if (cur.state !== 'open' || cur.deviceId !== me()) return; // כבר סגור, או שטלפון אחר לקח — הוא ממשיך איתה
              if (q.gen != null && q.gen > 0 && Number(cur.gen) !== q.gen) return;
              t.set(ref, closedDoc(cur, { sessionId: q.sessionId, recordId: q.recordId, summary: cur.summary }, 'canceled'));
            }, T.close);
            writeKey(K.close, closeQueue().filter(x => !(x.sessionId === q.sessionId && x.at === q.at)));
          } catch (e) { if (permanent(e)) writeKey(K.close, closeQueue().filter(x => !(x.sessionId === q.sessionId && x.at === q.at))); else scheduleRetry(); }
        }
      } finally { closing = false; }
    }

    // ---- עותקים בצד ----
    function sidePut(entry) {
      const before = sideList();
      let list = before.filter(x => x.sessionId !== entry.sessionId);
      list.push(entry);
      const order = { canceled: 0, same: 1, other: 2 };
      while (list.length > SIDE_MAX || bytes(JSON.stringify(list)) > SIDE_BYTES) {
        const victims = list.filter(x => x !== entry && x.reason !== 'other').sort((a, b) => (order[a.reason] - order[b.reason]) || (a.savedAt - b.savedAt));
        if (!victims.length) return { ok: false, reason: list.length > SIDE_MAX ? 'side-full' : 'storage' };
        list = list.filter(x => x !== victims[0]);
      }
      if (!writeKey(K.side, list)) { memory.set(K.side, before); return { ok: false, reason: 'storage' }; }
      return { ok: true, undo: () => { writeKey(K.side, before); } };
    }
    function sideEntry(d, reason) {
      const c = claimFor(d.sessionId);
      return { savedAt: now(), sessionId: d.sessionId, recordId: d.recordId, gen: c ? c.gen : null, legacy: !c, reason,
        summary: d.summary || {}, payload: d.payload, expected: !!d.expected };
    }
    function sideTidy() {
      const list = sideList();
      const keep = list.filter(x => { try { return !(A.recordSaved && !x.expected && A.recordSaved(x.recordId)); } catch (e) { return true; } });
      if (keep.length !== list.length) writeKey(K.side, keep);
    }

    // ---- "המשך אותה כאן" ----
    function applyTaken(sessionId, res) {
      A.applyPayload(res.payload, { source: 'handoff', doc: res.doc });
      setClaim(sessionId, res.gen); clearAway(sessionId); currentDoc = res.doc || null;
      syncWatches(); setStatus('saved');
      log('הטיוטה עברה לטלפון הזה', (res.doc && res.doc.deviceName ? 'מ-' + res.doc.deviceName : 'מטלפון אחר'), { sessionId, gen: res.gen });
    }
    async function take(sessionId) {
      sessionId = safeId(sessionId);
      if (!cloudReady()) return { ok: false, reason: 'no-cloud' };
      if (!online()) return { ok: false, reason: 'offline' };
      if (taking || finishing || checking) return { ok: false, reason: 'busy' };
      const d = draft();
      const remote = offerDocs.find(x => x.sessionId === sessionId) || (currentDoc && currentDoc.sessionId === sessionId ? currentDoc : null);
      let undo = null;
      if (!d.empty && d.payload != null && (d.sessionId !== sessionId || !remote || d.payload !== remote.payload)) {
        const put = sidePut(sideEntry(d, d.sessionId !== sessionId ? 'other' : 'same'));
        if (!put.ok) return { ok: false, reason: put.reason };
        undo = put.undo;
      }
      taking = true; emit();
      let expectGen = null;
      try {
        const res = await transaction(async t => {
          const ref = handoffRef(sessionId), snap = await t.get(ref);
          if (!exists(snap)) throw fault('gone');
          const cur = snap.data();
          if (cur.state === 'saved') throw fault('saved');
          if (cur.state === 'canceled') throw fault('canceled');
          if (cur.tooBig || cur.payload == null) throw fault('too-big-move');
          let parsed = null;
          try { parsed = JSON.parse(cur.payload); } catch (e) { throw fault('invalid'); }
          if (A.validatePayload && !A.validatePayload(parsed, cur)) throw fault('invalid');
          if (cur.deviceId === me()) return { gen: Number(cur.gen) || 1, payload: cur.payload, doc: cur }; // כבר שלי (גם commit קודם שהתשובה שלו אבדה)
          const next = Object.assign({}, cur, { deviceId: me(), deviceName: name(), gen: (Number(cur.gen) || 1) + 1, updatedAt: now(), scanRunning: false, scanStartedAt: null });
          expectGen = next.gen;
          t.set(ref, next);
          return { gen: next.gen, payload: cur.payload, doc: next };
        }, T.take);
        taking = false;
        try { applyTaken(sessionId, res); }
        catch (applyError) { emit(); notice('apply-failed', { sessionId }); return { ok: false, reason: 'apply' }; } // העותק בצד נשאר
        return { ok: true };
      } catch (e) {
        taking = false;
        if (e.commitSent) {
          checking = { type: 'take', sessionId, gen: expectGen, undo, settledOk: false };
          syncWatches(); emit();
          awaitSettle(e.settled, sessionId);
          return { ok: false, unknown: true };
        }
        if (undo) undo();
        const code = errorCode(e);
        if (['saved', 'canceled'].includes(code) && !d.empty && d.sessionId === sessionId) setAway(sessionId, code, remote);
        emit();
        return { ok: false, reason: code };
      }
    }

    // ---- "לא ידוע" (commit נשלח והתשובה לא הגיעה) — השרת מכריע ----
    // מחכים שהטרנזקציה תיגמר (או לתקרה, אם היא תקועה), ועוד רגע — ואז קוראים את המסמך מהשרת
    function awaitSettle(settled, sessionId) {
      let done = false;
      const go = () => { if (done) return; done = true; timers.set(() => { if (checking && checking.sessionId === sessionId) { checking.settledOk = true; resolveCheckingFromServer(); } }, T.grace); };
      settled.then(go); timers.set(go, T.settleCap);
    }
    async function resolveCheckingFromServer() {
      if (!checking || !checking.settledOk) return;
      const c = checking;
      if (typeof fs.getDocFromServer !== 'function') return; // יוכרע מה-snapshot הבא מהשרת
      try {
        const snap = await Promise.race([fs.getDocFromServer(handoffRef(c.sessionId)),
          new Promise((_, reject) => timers.set(() => reject(fault('timeout')), T.read))]);
        if (checking === c) resolveChecking(exists(snap) ? snap.data() : null);
      } catch (e) { scheduleRetry(); }
    }
    function resolveChecking(cur) {
      const c = checking; if (!c) return;
      checking = null;
      if (c.type === 'take') {
        if (cur && cur.state === 'open' && cur.deviceId === me() && (c.gen == null || Number(cur.gen) === c.gen) && cur.payload != null) {
          try { applyTaken(c.sessionId, { gen: Number(cur.gen), payload: cur.payload, doc: cur }); notice('take-done'); }
          catch (e) { notice('take-failed'); }
        } else { if (c.undo) c.undo(); notice('take-failed', { state: cur && cur.state }); }
      } else if (c.type === 'finish') {
        if (cur && cur.state === 'saved' && cur.savedBy && cur.savedBy.deviceId === me() && cur.savedBy.sessionId === c.sessionId) {
          afterClose(c.sessionId);
          try { A.finishedLate && A.finishedLate(c.sessionId); } catch (e) {}
          notice('finish-done');
        } else notice('finish-not-saved');
      }
      syncWatches(); emit();
      schedule(T.debounce);
    }

    // ---- שמירה סופית ----
    function afterClose(sessionId) {
      if (claimFor(sessionId)) writeKey(K.claim, null);
      clearAway(sessionId);
      writeKey(K.side, sideList().filter(x => x.sessionId !== sessionId));
    }
    async function finish(recordId, data) {
      const d = draft();
      if (d.empty) return { ok: false, reason: 'empty' };
      recordId = safeId(recordId || d.recordId);
      if (!cloudReady()) return { ok: false, reason: 'no-cloud' };
      if (!online()) return { ok: false, reason: 'offline' };
      if (finishing || taking || checking) return { ok: false, reason: 'busy' };
      const a = awayFor(d.sessionId); if (a) return { ok: false, reason: a.away };
      finishing = true; emit();
      try {
        const out = await transaction(async t => {
          const ref = handoffRef(d.sessionId);
          const hs = await t.get(ref), rs = await t.get(recordRef(recordId));
          const extra = A.finishReads ? await A.finishReads(t, { sessionId: d.sessionId, recordId }) : null;
          const cur = exists(hs) ? hs.data() : null, rec = exists(rs) ? rs.data() : null;
          const mine = by => by && by.deviceId === me() && by.sessionId === d.sessionId;
          if (cur && cur.state === 'saved' && mine(cur.savedBy)) return { already: true };
          if (cur && cur.state !== 'open') throw fault(cur.state === 'canceled' ? 'canceled' : 'saved');
          if (cur && cur.deviceId !== me()) throw fault('moved');
          if (!d.expected) {
            if (rec) { if (mine(rec.savedBy)) return { already: true }; throw fault('exists'); }
          } else {
            if (!rec) throw fault('changed');
            if (!equal(rec, d.expected)) { if (mine(rec.savedBy)) return { already: true }; throw fault('changed'); }
          }
          const c = claimFor(d.sessionId);
          const savedBy = { deviceId: me(), sessionId: d.sessionId, gen: cur ? Number(cur.gen) || 1 : (c ? c.gen : 0) };
          t.set(recordRef(recordId), Object.assign({}, data, { savedBy }));
          if (A.finishWrites) A.finishWrites(t, { sessionId: d.sessionId, recordId, savedBy, extra });
          t.set(ref, closedDoc(cur, d, 'saved', savedBy));
          return { savedBy };
        }, T.finish);
        afterClose(d.sessionId);
        return { ok: true, already: !!out.already };
      } catch (e) {
        if (e.commitSent) {
          checking = { type: 'finish', sessionId: d.sessionId, settledOk: false };
          syncWatches(); emit();
          awaitSettle(e.settled, d.sessionId);
          return { ok: false, unknown: true };
        }
        const code = errorCode(e);
        if (['moved', 'saved', 'canceled'].includes(code)) { setAway(d.sessionId, code, null); syncWatches(); }
        return { ok: false, reason: code };
      } finally { finishing = false; emit(); }
    }

    // ---- ביטול, ניקוי, פתיחת עותק ----
    function cancel() {
      const d = draft(); if (d.empty) return;
      const c = claimFor(d.sessionId), a = awayFor(d.sessionId);
      if (!a && cloudReady()) {
        const queue = closeQueue().filter(x => x.sessionId !== d.sessionId);
        queue.push({ sessionId: d.sessionId, recordId: d.recordId, gen: c ? c.gen : null, editsExisting: !!d.expected, summary: d.summary || {}, at: now() });
        writeKey(K.close, queue);
      }
      if (c) writeKey(K.claim, null);
      clearAway(d.sessionId);
      timers.set(() => processCloses(), 0);
    }
    function clear() {
      const d = draft(); if (d.empty) return { ok: true };
      const a = awayFor(d.sessionId);
      if (!a || a.away !== 'saved') {
        if (d.payload != null) { const put = sidePut(sideEntry(d, a && a.away === 'canceled' ? 'canceled' : 'same')); if (!put.ok) return { ok: false, reason: put.reason }; }
      }
      if (claimFor(d.sessionId)) writeKey(K.claim, null);
      clearAway(d.sessionId);
      A.emptyDraft && A.emptyDraft();
      syncWatches(); emit();
      return { ok: true };
    }
    function openSide(sessionId) {
      sessionId = safeId(sessionId);
      const entry = sideList().find(x => x.sessionId === sessionId); if (!entry) return { ok: false, reason: 'gone' };
      const d = draft();
      if (!d.empty && d.sessionId !== sessionId) { const put = sidePut(sideEntry(d, 'other')); if (!put.ok) return { ok: false, reason: put.reason }; }
      writeKey(K.side, sideList().filter(x => x.sessionId !== sessionId));
      A.applyPayload(entry.payload, { source: 'side' });
      if (entry.legacy) { if (claimFor(sessionId)) writeKey(K.claim, null); }
      else setClaim(sessionId, entry.gen || 0);
      clearAway(sessionId); currentDoc = null;
      syncWatches(); emit(); schedule(0);
      return { ok: true };
    }

    // ---- ציבורי ----
    const api = {
      version: VERSION,
      deviceId: me,
      start() {
        if (started) return; started = true;
        // הטיוטה שפתוחה כשהמנגנון עולה לראשונה בטלפון — מלפני המנגנון: לא נתבעת עד עריכה של המשתמש
        if (readKey(K.legacy, null) == null) { const d = draft(); writeKey(K.legacy, { sessionId: d.empty || claimFor(d.sessionId) ? null : d.sessionId, at: now() }); }
        sideTidy();
        if (cloudReady()) {
          startQuery(); syncWatches();
          const on = (target, type, fn) => { try { target && target.addEventListener && target.addEventListener(type, fn); } catch (e) {} };
          if (o.lifecycle !== false) {
            on(global, 'online', retryAll);
            on(global.document, 'visibilitychange', () => { const v = global.document && global.document.visibilityState; if (v === 'hidden') api.flush(); else retryAll(); });
            on(global, 'pagehide', () => api.flush());
          }
          retryAll();
        }
        emit();
      },
      changed(opts) {
        if (opts && opts.user) api.userEdit();
        syncWatches();
        const d = draft();
        const scan = !d.empty && d.scanRunning;
        if (scan !== lastScan) { lastScan = scan; scanStartedLocal = scan ? now() : null; schedule(0); }
        else schedule(T.debounce);
        emit();
      },
      userEdit() {
        const d = draft();
        if (!d.empty && isLegacy(d.sessionId) && !awayFor(d.sessionId)) setClaim(d.sessionId, 0);
      },
      flush() { schedule(0); },
      // עותק בצד מבחוץ (למשל טיוטה שנשמרה בצד בגרסה קודמת של האפליקציה) — כדי שתהיה לו דרך חזרה
      importSide(entry) {
        if (!entry || !entry.sessionId || typeof entry.payload !== 'string') return { ok: false, reason: 'invalid' };
        if (sideList().some(x => x.sessionId === safeId(entry.sessionId))) return { ok: true };
        const put = sidePut({ savedAt: Number(entry.savedAt) || now(), sessionId: safeId(entry.sessionId), recordId: safeId(entry.recordId || entry.sessionId),
          gen: null, legacy: true, reason: entry.reason || 'other', summary: entry.summary || {}, payload: entry.payload, expected: !!entry.expected });
        if (put.ok) emit();
        return put;
      },
      // עוצר מאזינים וטיימרים (מעבר בין מצבים, בדיקות)
      stop() {
        stopped = true;
        try { unsubQuery && unsubQuery(); } catch (e) {} unsubQuery = null;
        unwatchExcept([]);
        [debounceTimer, retryTimer, scanTimer].forEach(t => { if (t) timers.clear(t); });
        debounceTimer = retryTimer = scanTimer = null;
      },
      retry: retryAll,
      take, finish, cancel, clear, openSide,
      state() {
        const d = draft(), a = d.empty ? null : awayFor(d.sessionId);
        const cur = currentDoc && !d.empty && currentDoc.sessionId === d.sessionId ? currentDoc : null;
        const sides = sideList().map(x => ({ sessionId: x.sessionId, savedAt: x.savedAt, reason: x.reason, summary: x.summary || {} }));
        const sideIds = new Set(sides.map(x => x.sessionId));
        const offers = !offersFromServer ? [] : offerDocs.filter(x => (d.empty || x.sessionId !== d.sessionId) && !sideIds.has(x.sessionId)).map(x => ({
          sessionId: x.sessionId, mine: x.deviceId === me(), deviceName: x.deviceName || '', updatedAt: Number(x.updatedAt) || 0,
          summary: x.summary || {}, scanRunning: !!x.scanRunning && scanWindowOpen(x), tooBig: !!x.tooBig || x.payload == null,
          button: !x.tooBig && x.payload != null && !scanWindowOpen(x) }));
        const canTakeBack = !!(a && a.away === 'moved' && cur && cur.state === 'open' && cur.deviceId !== me() && !cur.tooBig && cur.payload != null);
        return {
          enabled: cloudReady(), status, deviceId: me(),
          sessionId: d.empty ? null : d.sessionId,
          legacy: !d.empty && isLegacy(d.sessionId),
          away: a ? { away: a.away, by: a.by, at: a.at } : null,
          checking: checking ? checking.type : null,
          busy: taking || finishing,
          readOnly: !!a || !!checking,
          canTakeBack,
          offers,
          side: d.empty ? sides.filter(x => x.reason !== 'canceled') : [],
          closesPending: closeQueue().length
        };
      },
      // לבדיקות ולאבחון
      _debug: () => ({ claim: claim(), away: away(), side: sideList(), close: closeQueue(), legacy: readKey(K.legacy, null), currentDoc, offerDocs, checking, status })
    };
    return api;
  }
  global.DraftHandoff = { create, version: VERSION };
})(typeof globalThis !== 'undefined' ? globalThis : this);
