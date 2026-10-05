// v125 — קליטת ניירות מהנהג ("צלם כל נייר") על המודול המלא (receipt-scan-harness).
// מה שנבדק: כל נייר הוא בקשה אחת, בלי עוגנים צפויים; התשובה ששולמה נשמרת במכשיר לפני
// כל שימוש ונשלחת לענן עד שמאושרת — ואז לא נשלחת שוב לעולם; קריאה שנקטעה אינה נשלחת
// שוב לבד; דף שאינו של הנהג לא נשמר; וטיוטת הקליטה לא משתנה כלל.
// הרצה: node --test tests/paper-intake.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runtime, fixture } from './receipt-scan-harness.mjs';

const L = JSON.parse(fs.readFileSync(new URL('./ledger-2026-10.json', import.meta.url), 'utf8'));
const R1004 = 'returns_43eb7cdd-5e32-4524-aa86-b87ca8e88650';
// נייר 290095142 כפי שהשרת (v7) מחזיר אותו
function credit142(extra = {}) {
  const rows = [['497112', '101', 'אחיד פרוס ברמן', 13, 6.24], ['497297', '233', 'זוג לחמניות אצ', 1, 4.1], ['498034', '344', 'לחם כוסמין E-F', 2, 17.58], ['497204', '238', 'ברמן אסלי 5 פי', 1, 7.95]]
    .map(([barcode, itemCode, description, quantity, unitPriceExVat], i) => ({ sourcePage: 1, lineNumber: i + 1, barcode, itemCode, description, quantity, unitPriceExVat, confidence: 0.97 }));
  return { ok: true, serviceVersion: 7, model: 'fixture', requestId: 'req-142', reads: [{ model: 'luna' }, { model: 'luna' }], usage: null,
    verification: { version: 1, status: 'agreed', primaryReads: 2, escalationAttempted: false, reasons: [], issues: [], readCount: 2 },
    scan: { warnings: [], documents: [{ noteIndex: 0, docNumber: '290095142', docType: 'credit', docDate: '04/10/2026', pageCount: 1,
      totalUnits: 17, printedLines: 4, netToChargeExVat: 106.32, vatAmountPrinted: 19.14, totalToChargeInclVat: 125.46,
      headerText: 'ת.משלוח החזרה יבש', internalNumber: null, numerator: '95142', printedCheck: 147, otherPapersVisible: false, notDriverStrip: false,
      confidence: 0.97, warnings: [], rows, ...extra }] } };
}
function app(paper, opts = {}) {
  const data = { ...fixture(), paper };
  data.products = L.products;
  const r = runtime({ data, storage: opts.storage || new Map(), globals: opts.globals || {} });
  r.run(`products = testData.products; returns = ${JSON.stringify(opts.returns || [])}; receipts = ${JSON.stringify(opts.receipts || [])};
    runCloudTaskSilent = async (label, task) => { testWrites.push(structuredClone(task)); return true; };
    executePaperCreateTask = async task => { if (globalThis.__failCloud) throw new Error('offline'); if (globalThis.__cloudGate) await globalThis.__cloudGate;
      testWrites.push({ paperCreate: structuredClone(task) });
      const cur = papers.find(p => p.id === task.id);
      if (cur && cur.captureId !== task.paper.captureId && paperFingerprint(cur) !== paperFingerprint(task.paper)) { const e = new Error('conflict'); e.code = 'paper-conflict'; e.existing = cur; throw e; }
      papers = papers.filter(p => p.id !== task.id).concat([structuredClone(task.paper)]); return cur ? 'same' : 'created'; };`); // כמו המאזין: מה שנכתב לענן מגיע ל-papers
  return r;
}
// fetch בשליטת הבדיקה: כל קריאה מקבלת את התשובה הבאה ברשימה (האחרונה חוזרת)
function gated(list) {
  const calls = [];
  const fetch = async (url, options) => { calls.push({ url: String(url), body: options && options.body }); return list[Math.min(calls.length - 1, list.length - 1)](); };
  return { fetch, calls };
}
const ok = payload => () => Promise.resolve({ ok: true, status: 200, json: async () => structuredClone(payload) });
const never = () => new Promise(() => {});
const fail = (status, body) => () => Promise.resolve({ ok: false, status, json: async () => body });
const tick = () => new Promise(res => setImmediate(res));
async function until(cond, n = 200) { for (let i = 0; i < n && !cond(); i++) await tick(); assert.ok(cond(), 'התנאי לא התקיים'); }
// שורה עם קוד שלא קיים בקטלוג — הקליטה שולחת קריאת אימות שלישית (בתשלום) על הזהות שלה
function needsVerify() { const p = credit142(); Object.assign(p.scan.documents[0].rows[3], { itemCode: '99999', barcode: '7290000099999' }); return p; }
const store = r => JSON.parse(r.storage.get('bm_paper_results_v1') || '{}');
const page = n => ({ dataUrl: 'data:image/jpeg;base64,cGFwZXI' + n, baseDataUrl: 'data:image/jpeg;base64,cGFwZXI' + n, rotation: 0, orientationConfirmed: true });
async function intake(r, items, forReturnId = '') {
  r.run(`openPaperIntake({ forReturnId: ${JSON.stringify(forReturnId)} });
    paperIntake.items = ${JSON.stringify(items)}.map((p, i) => ({ captureId: 'cap' + i, hash: 'h' + i, page: p, status: 'photo' }));`);
  await r.run('paperIntakeRun()');
}

test('שני ניירות → שתי בקשות → שני ניירות; בלי עוגנים צפויים; טיוטת הקליטה לא נגעה', async () => {
  const r = app(credit142(), { returns: L.returns, receipts: L.receipts });
  const before = r.run('JSON.stringify([aiScanDocuments, reconcileData, receiptNotes])');
  const draft = r.storage.get('bm_receipt_draft_v1');
  await intake(r, [page(1), page(2)]);
  assert.equal(r.requests.length, 2);
  r.requests.forEach(q => { const d = JSON.parse(q.body).documents[0]; assert.equal(d.expectedUnits, null); assert.equal(d.expectedLines, null); assert.equal(d.pages.length, 1); });
  assert.equal(r.run('JSON.stringify([aiScanDocuments, reconcileData, receiptNotes])'), before);
  assert.equal(r.storage.get('bm_receipt_draft_v1'), draft);
  const s = store(r);
  assert.deepEqual(Object.keys(s).sort(), ['cap0', 'cap1']);
  const p = s.cap0.paper;
  assert.equal(p.id, 'paper_290095142'); assert.equal(p.kind, 'credit'); assert.equal(p.state, 'accepted'); assert.equal(p.docDay, '2026-10-04');
  assert.deepEqual(p.rows.map(x => [x.productId, x.qty]), [['code_101', 13], ['code_233', 1], ['code_344', 2], ['code_238', 1]]);
  assert.equal(p.proof.checkOk, true, 'ביקורת 147 = 12+97+34+04');
  assert.equal(p.attach.type, 'return'); assert.equal(p.attach.id, R1004);
  const creates = r.writes.filter(w => w.paperCreate);
  assert.equal(creates.length, 2, 'שני צילומים של אותו נייר — שתי בקשות כתיבה; הענן מזהה שזה אותו נייר');
  r.run('papers = []; ledgerInvalidate();');
  const s2 = store(r); delete s2.cap0.ackedAt; delete s2.cap1.ackedAt; r.storage.set('bm_paper_results_v1', JSON.stringify(s2));
  assert.equal(r.run('paperPendingLocal().length'), 1, 'לפני שהגיע לענן — נספר פעם אחת במאזן');
  assert.ok(s.cap0.ackedAt && !s.cap0.scan, 'אחרי אישור הענן התשובה הכבדה נמחקת מהמכשיר');
  assert.equal(r.storage.get('bm_paper_inflight_v1'), undefined);
});

test('ענן לא זמין: הנייר נשמר במכשיר ונספר במאזן שלו; אחרי "ריענון" נשלח — באפס קריאות; אחרי אישור לא נשלח שוב', async () => {
  const storage = new Map();
  const r = app(credit142(), { storage, returns: L.returns, receipts: L.receipts });
  r.run('globalThis.__failCloud = true;');
  await intake(r, [page(1)]);
  assert.equal(r.requests.length, 1);
  assert.equal(r.writes.filter(w => w.paperCreate).length, 0);
  assert.ok(!store(r).cap0.ackedAt);
  assert.equal(r.run(`currentLedger().states['paper_290095142']`), 'counted', 'ממתין לענן — אבל כבר במאזן של המכשיר');
  const r2 = app(credit142(), { storage, returns: L.returns, receipts: L.receipts });
  await r2.run('paperFlushPending()');
  assert.equal(r2.requests.length, 0, 'אפס קריאות סריקה אחרי ריענון');
  assert.equal(r2.writes.filter(w => w.paperCreate).length, 1);
  await r2.run('paperFlushPending()');
  assert.equal(r2.writes.filter(w => w.paperCreate).length, 1, 'אחרי אישור — לא נשלח שוב');
});

test('קריאה שנקטעה (ריענון באמצע) אינה נשלחת שוב לבד — מבקשים לצלם שוב', async () => {
  const storage = new Map([['bm_paper_inflight_v1', JSON.stringify({ captureId: 'capX', hash: 'hX', at: 1 })]]);
  const r = app(credit142(), { storage });
  r.run('openPaperIntake({});');
  assert.match(r.run('paperIntake.note'), /נקטעה/);
  assert.equal(storage.get('bm_paper_inflight_v1'), undefined);
  assert.equal(r.requests.length, 0);
});

test('אותה תמונה פעמיים — אפס בקשות', async () => {
  const storage = new Map([['bm_paper_results_v1', JSON.stringify({ cap9: { captureId: 'cap9', hash: 'samehash', ackedAt: 1, paper: { id: 'paper_290095142', kind: 'credit', rows: [] } } })]]);
  const r = app(credit142(), { storage });
  assert.equal(r.run(`paperByHash('samehash').paper.id`), 'paper_290095142');
  assert.equal(r.requests.length, 0);
});

test('דף A4 (לא נייר של הנהג) — לא נשמר ולא נכתב לענן', async () => {
  const a4 = credit142({ docType: 'unknown', notDriverStrip: true, rows: [], totalUnits: null, printedLines: null, docNumber: null, docDate: null, headerText: null });
  a4.verification.status = 'needs_review';
  const r = app(a4);
  await intake(r, [page(1)]);
  assert.equal(r.run(`paperIntake.items[0].status`), 'rejected');
  assert.equal(store(r).cap0.discarded, true);
  assert.equal(r.writes.filter(w => w.paperCreate).length, 0);
});

test('נייר שלא נסגר מול בלוק הסיכום — נשמר לבדיקה ואינו נספר; אישור ידני אחרי השלמה סופר אותו', async () => {
  const bad = credit142(); bad.scan.documents[0].rows[0].quantity = 12; // 101 נקרא 12 במקום 13
  const r = app(bad, { returns: L.returns, receipts: L.receipts });
  await intake(r, [page(1)]);
  assert.equal(r.run(`paperIntake.items[0].status`), 'review');
  assert.equal(r.run(`currentLedger().states['paper_290095142']`), 'unproven');
  await r.run(`openPaperReview('paper_290095142')`);
  r.run(`paperReview.paper.rows[0].qty = 13; paperReview.units = '17'; paperReview.lines = '4';`);
  assert.equal(r.run('paperReviewState().ok'), true);
  await r.run('savePaperReview()');
  const upd = r.writes.find(w => w.op === 'update' && w.path && w.path.at(-1) === 'paper_290095142');
  assert.ok(upd, 'נייר שכבר בענן מתעדכן במקום');
  assert.equal(upd.data.state, 'accepted'); assert.equal(upd.data.anchors.source, 'typed'); assert.equal(upd.data.rows[0].qty, 13);
  assert.equal(r.run(`currentLedger().states['paper_290095142']`), 'counted');
});

test('התור: כשהקליטה בטלפון הזה מעלה תעודה — הנייר מחכה; ונבדק שוב לפני כל נייר', async () => {
  let openFirst;
  const first = () => new Promise(res => { openFirst = () => res({ ok: true, status: 200, json: async () => structuredClone(credit142()) }); });
  const g = gated([first, ok(credit142())]);
  const r = app(credit142(), { globals: { fetch: g.fetch } });
  r.run(`receivingUploadBusy = true; paperSleep = () => new Promise(res => { globalThis.__wake = res; });
    openPaperIntake({}); paperIntake.items = [{ captureId: 'c0', hash: 'h0', page: ${JSON.stringify(page(1))}, status: 'photo' }, { captureId: 'c1', hash: 'h1', page: ${JSON.stringify(page(2))}, status: 'photo' }];`);
  const running = r.run('paperIntakeRun()');
  await tick(); await tick();
  assert.equal(g.calls.length, 0, 'עדיין ממתין');
  assert.match(r.run('paperIntake.progress'), /ממתין לסיום הקריאה בקליטה/);
  // הקליטה מסתיימת; הנייר הראשון עולה. בזמן שהוא עולה הקליטה מתחילה שוב — הנייר השני מחכה לה
  r.run('receivingUploadBusy = false; __wake();');
  await until(() => g.calls.length === 1);
  assert.equal(r.run('paperUploadBusy'), true);
  // aiScanBusy (המשותף בין מכשירים) כבר לא עוצר את התור — רק העלאה מהטלפון הזה
  r.run('aiScanBusy = true; receivingUploadBusy = true;');
  openFirst();
  await until(() => r.run('paperIntake.progress').includes('ממתין'));
  assert.equal(g.calls.length, 1, 'הנייר השני לא עולה בזמן שהקליטה מעלה');
  r.run('receivingUploadBusy = false; __wake();');
  await running;
  assert.equal(g.calls.length, 2);
});

test('הקליטה מחכה לקריאת נייר שרצה (לא שתי העלאות במקביל)', async () => {
  const r = app(credit142());
  r.run(`paperUploadBusy = true; paperSleep = () => new Promise(res => { globalThis.__wake = res; });`);
  const running = r.run('aiRunInvoiceScan()');
  await tick();
  assert.ok(r.toasts.some(t => /ממתין שקריאת הנייר/.test(t)));
  assert.equal(r.run('aiScanWaitingForPaper'), true);
  assert.equal(r.run('receivingUploadBusy'), false);
  assert.equal(r.requests.length, 0);
  await r.run('aiRunInvoiceScan()'); // לחיצה שנייה בזמן ההמתנה — לא מתחילה עוד אחת
  r.run('paperUploadBusy = false; __wake();');
  await running;
  assert.equal(r.run('aiScanWaitingForPaper'), false);
});

test('סנכרון שרץ ברקע לא דורס: תוצאה חדשה, תיקון ומחיקה שנשמרו בזמן שחיכה לענן', async () => {
  const storage = new Map();
  const r = app(credit142(), { storage, returns: L.returns, receipts: L.receipts });
  await intake(r, [page(1)]);
  const p0 = store(r).cap0.paper;
  // רשומה שלא אושרה עדיין, וענן איטי
  const s0 = store(r); delete s0.cap0.ackedAt; s0.cap0.scan = { doc: null }; r.storage.set('bm_paper_results_v1', JSON.stringify(s0));
  r.run('papers = []; globalThis.__cloudGate = new Promise(res => { globalThis.__open = res; });');
  const flushing = r.run('paperFlushPending()');
  await tick();
  // בזמן ההמתנה: תוצאה חדשה ששולמה (cap1), ותיקון של cap0 (מספר אחר → מזהה אחר)
  r.run(`paperPatchLocal('cap1', () => ({ captureId: 'cap1', hash: 'h1', at: 1, paper: ${JSON.stringify({ ...p0, id: 'paper_290095143', number: '290095143', captureId: 'cap1' })} }));
    paperPatchLocal('cap0', cur => ({ ...cur, paper: { ...cur.paper, number: '290095149', id: 'paper_290095149' } }));`);
  r.run('__open(); globalThis.__cloudGate = null;');
  await flushing;
  // אותו סנכרון ממשיך לסבב נוסף: התוצאה החדשה והתיקון נשלחים; שום דבר לא אבד
  const s = store(r);
  assert.ok(s.cap1, 'התוצאה החדשה לא נמחקה');
  assert.ok(s.cap0.ackedAt && s.cap1.ackedAt, 'שניהם נשלחו בסבב הנוסף');
  assert.equal(s.cap0.paper.id, 'paper_290095149', 'התיקון נשמר');
  const ids = r.writes.filter(w => w.paperCreate).map(w => w.paperCreate.id);
  // הראשון — מהקליטה עצמה; אחריו: הגרסה שנשלחה לפני התיקון, התיקון, והתוצאה החדשה
  assert.deepEqual(JSON.parse(JSON.stringify(ids.slice(1))), ['paper_290095142', 'paper_290095149', 'paper_290095143']);
  const drop = r.writes.find(w => w.op === 'batch' && w.writes.some(x => x.op === 'delete' && x.path.at(-1) === 'paper_290095142'));
  assert.ok(drop, 'העותק במספר הישן נמחק מהענן');
});

test('מחיקה בזמן שהסנכרון מחכה לענן — הנייר יוצא מהענן ולא חוזר', async () => {
  const r = app(credit142(), { returns: L.returns, receipts: L.receipts });
  r.run('globalThis.__failCloud = true;');
  await intake(r, [page(1)]);
  r.run('globalThis.__failCloud = false; globalThis.__cloudGate = new Promise(res => { globalThis.__open = res; });');
  const flushing = r.run('paperFlushPending()');
  await tick();
  r.run(`paperPatchLocal('cap0', cur => ({ ...cur, discarded: true, discardedAt: 1 }));`);
  r.run('__open(); globalThis.__cloudGate = null;');
  await flushing;
  await until(() => r.writes.some(w => w.op === 'batch' && w.writes.some(x => x.path[x.path.length - 2] === 'trash')));
  assert.equal(r.run('paperPendingLocal().length'), 0);
});

test('פתיחה מחדש של מסך הצילום באמצע קריאה — אותו סבב, אותו נייר, שום קריאה לא נזרקת', async () => {
  const g = gated([ok(needsVerify()), never]);
  const r = app(credit142(), { globals: { fetch: g.fetch }, returns: L.returns, receipts: L.receipts });
  r.run(`openPaperIntake({ forReturnId: 'RA' });
    paperIntake.items = [0, 1].map(i => ({ captureId: 'cap' + i, hash: 'h' + i, page: { dataUrl: 'data:x' + i, baseDataUrl: 'data:x' + i, rotation: 0, orientationConfirmed: true }, status: 'photo', forReturnId: 'RA' }));`);
  r.run('paperIntakeRun()');
  await until(() => g.calls.length === 2); // הקריאה השלישית (האימות) נשלחה ותלויה
  r.run(`openPaperIntake({ forReturnId: 'RB' });`); // "צלם נייר" מהמאזן, באמצע
  assert.equal(r.run('paperIntake.items.length'), 2, 'הסבב לא הוחלף');
  assert.equal(r.run('paperIntake.items[1].status'), 'photo');
  assert.equal(r.run('paperIntake.note'), '', 'לא "נקטעה" על קריאה שעוד רצה');
  assert.ok(r.storage.get('bm_paper_inflight_v1'), 'הסימון של הקריאה שרצה לא נמחק');
  const s = store(r);
  assert.ok(s.cap0 && s.cap0.interim && s.cap0.paper, 'מה שנקרא נשמר לפני האימות בתשלום');
  assert.equal(s.cap0.paper.forReturnId, 'RA', 'הנייר שומר את ההחזרה שממנה צולם');
  assert.equal(r.run('paperPendingLocal().length'), 0, 'עד שהקריאה מסתיימת היא לא במאזן');
});

test('ריענון באמצע הקריאה השלישית: מה שנקרא נשמר ועובר לבדיקה — בלי לשלם שוב', async () => {
  const g = gated([ok(needsVerify()), never]);
  const storage = new Map();
  const r = app(credit142(), { storage, globals: { fetch: g.fetch }, returns: L.returns, receipts: L.receipts });
  await intakeNoWait(r, 1);
  await until(() => g.calls.length === 2);
  assert.match(storage.get('bm_paper_inflight_v1'), /"verify":true/);
  // "ריענון": מודול חדש על אותו אחסון
  const r2 = app(credit142(), { storage, returns: L.returns, receipts: L.receipts });
  r2.run('openPaperIntake({});');
  assert.match(r2.run('paperIntake.note'), /נשמר/);
  assert.equal(storage.get('bm_paper_inflight_v1'), undefined);
  await r2.run('paperFlushPending()');
  assert.equal(r2.requests.length, 0, 'אפס קריאות סריקה אחרי ריענון');
  const sent = r2.writes.filter(w => w.paperCreate);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].paperCreate.paper.state, 'needs-review');
  assert.equal(r2.run(`currentLedger().states['paper_290095142']`), 'unproven');
});
async function intakeNoWait(r, n) {
  r.run(`openPaperIntake({}); paperIntake.items = Array.from({ length: ${n} }, (_, i) => ({ captureId: 'cap' + i, hash: 'h' + i, page: { dataUrl: 'data:x' + i, baseDataUrl: 'data:x' + i, rotation: 0, orientationConfirmed: true }, status: 'photo' }));`);
  r.run('paperIntakeRun()');
}

test('הקריאה השלישית נחסמה (יותר מדי ניסיונות): מה שנקרא עובר לבדיקה, והסבב עוצר', async () => {
  const g = gated([ok(needsVerify()), fail(429, { ok: false, error: 'rate_limited' })]);
  const r = app(credit142(), { globals: { fetch: g.fetch }, returns: L.returns, receipts: L.receipts });
  r.run(`openPaperIntake({}); paperIntake.items = [0, 1].map(i => ({ captureId: 'cap' + i, hash: 'h' + i, page: { dataUrl: 'data:x' + i, baseDataUrl: 'data:x' + i, rotation: 0, orientationConfirmed: true }, status: 'photo' }));`);
  await r.run('paperIntakeRun()');
  assert.equal(g.calls.length, 2, 'הנייר השני לא נשלח אחרי חסימה');
  assert.equal(r.run('paperIntake.items[0].status'), 'review');
  assert.equal(r.run('paperIntake.items[1].status'), 'photo');
  const s = store(r);
  assert.ok(s.cap0.paper && !s.cap0.interim && s.cap0.ackedAt, 'נשמר ונשלח לענן לבדיקה');
  assert.equal(r.storage.get('bm_paper_inflight_v1'), undefined);
});

test('האחסון במכשיר מלא: הנייר נשמר בזיכרון הדף, נספר ונשלח; התמונה לא נזרקת', async () => {
  const storage = new Map();
  const r = app(credit142(), { storage, returns: L.returns, receipts: L.receipts });
  r.run(`globalThis.__failCloud = true; const _set = localStorage.setItem; localStorage.setItem = (k, v) => { if (k === 'bm_paper_results_v1') throw new Error('QuotaExceededError'); return _set(k, v); };`);
  await intake(r, [page(1)]);
  assert.ok(r.toasts.some(t => /אל תרענן/.test(t)));
  assert.equal(r.run('paperIntake.items[0].status'), 'saved');
  assert.ok(r.run('!!paperIntake.items[0].page'), 'התמונה נשארת עד שנשמר');
  assert.equal(r.run('paperPendingLocal().length'), 1);
  assert.equal(r.run(`!!paperFind('paper_290095142')`), true);
  r.run('globalThis.__failCloud = false;');
  await r.run('paperFlushPending()');
  assert.equal(r.writes.filter(w => w.paperCreate).length, 1);
});

test('אותה תמונה פעמיים באותו סבב — נקראת פעם אחת', async () => {
  const r = app(credit142());
  r.run(`openPaperIntake({}); aiCompressInvoiceImage = async () => ({ dataUrl: 'data:x', baseDataUrl: 'data:x', rotation: 0 }); paperFileHash = async f => 'same-' + f.name;`);
  await r.run(`paperIntakeAddFiles([{ name: 'a' }, { name: 'a' }, { name: 'b' }])`);
  assert.deepEqual(JSON.parse(r.run('JSON.stringify(paperIntake.items.map(x => x.status))')), ['photo', 'dup-batch', 'photo']);
});

test('התנגשות: מספר ששמור בענן עם שורות אחרות — שאלה במאזן; "החלף" מעביר את הישן לסל ושומר את החדש; "מחק" זורק את החדש', async () => {
  const r = app(credit142(), { returns: L.returns, receipts: L.receipts });
  const older = { ...credit142().scan.documents[0] };
  r.run(`papers = [{ id: 'paper_290095142', schema: 1, kind: 'credit', state: 'accepted', number: '290095142', docDay: '2026-10-04', captureId: 'old', rows: [{ itemCode: '101', productId: 'code_101', qty: 5 }], timestamp: 1 }];`);
  await intake(r, [page(1)]);
  const s = store(r);
  assert.ok(s.cap0.conflict, 'נשמר כהתנגשות, לא נדרס');
  assert.equal(r.run(`paperFind('paper_290095142', 'cap0').local.captureId`), 'cap0', 'הצילום החדש נפתח מהכרטיס שלו');
  assert.equal(r.run(`paperFind('paper_290095142').local`), null, 'בלי הצילום — השמור');
  assert.match(r.run('paperIntakeItemHtml(paperIntake.items[0])'), /נייר אחר כבר שמור עם המספר הזה/);
  const before = r.run('currentLedger().count');
  r.run('refreshLedgerBar();');
  r.run(`setView('ledger')`);
  assert.match(r.node('app').innerHTML, /החלף בצילום החדש/);
  await r.run(`paperResolveConflict('cap0', true)`);
  assert.ok(r.writes.some(w => w.op === 'batch' && w.writes.some(x => x.path[x.path.length - 2] === 'trash')), 'הישן לסל המחזור');
  const s2 = store(r);
  assert.ok(!s2.cap0.conflict && s2.cap0.ackedAt, 'החדש נשמר');
  assert.equal(r.run(`papers.find(p => p.id === 'paper_290095142').captureId`), 'cap0');
  // מחיקה של צילום מתנגש
  const r2 = app(credit142(), { returns: L.returns, receipts: L.receipts });
  r2.run(`papers = [{ id: 'paper_290095142', schema: 1, kind: 'credit', state: 'accepted', number: '290095142', docDay: '2026-10-04', captureId: 'old', rows: [{ itemCode: '101', productId: 'code_101', qty: 5 }], timestamp: 1 }];`);
  await intake(r2, [page(1)]);
  await r2.run(`paperResolveConflict('cap0', false)`);
  const s3 = store(r2);
  assert.ok(s3.cap0.discarded && !s3.cap0.scan);
  assert.equal(r2.run('paperLocalConflicts().length'), 0);
  assert.equal(r2.run(`papers[0].captureId`), 'old');
  void before; void older;
});

test('הסוג נקבע לפי המספר: 2900 בלי מספר פנימי = נייר חיוב; עם מספר פנימי = תעודת משלוח; סוג שלא נקרא — אין ברירת מחדל', async () => {
  const doc = extra => ({ doc: { ...credit142().scan.documents[0], docType: 'invoice', headerText: null, ...extra, rows: [] } });
  const rec = d => JSON.parse(JSON.stringify(app(credit142()).run(`bermanPaperRecord(${JSON.stringify(d)}, { captureId: 'c' })`)));
  assert.equal(rec(doc({ docNumber: '290095141' })).paper.kind, 'charge');
  assert.equal(rec(doc({ docNumber: '290095141', headerText: 'תעודת משלוח' })).paper.kind, 'charge', 'המספר גובר על כותרת שנקראה ארוכה');
  assert.equal(rec(doc({ docNumber: '244734757', internalNumber: '2900951' })).paper.kind, 'delivery');
  assert.equal(rec(doc({ docNumber: '244734757' })).paper.kind, 'delivery');
  assert.equal(rec(doc({ docNumber: '290095142', docType: 'invoice', headerText: 'ת.משלוח החזרה יבש' })).paper.kind, 'credit');
  const unknown = rec(doc({ docType: 'unknown', docNumber: '290095150', rows: undefined }));
  void unknown;
  const r = app(credit142());
  const p = JSON.parse(JSON.stringify(r.run(`bermanPaperRecord({ doc: { ...${JSON.stringify(credit142().scan.documents[0])}, docType: 'unknown', headerText: null, docNumber: null } }, { captureId: 'c' })`))).paper;
  assert.equal(p.kind, null); assert.equal(p.state, 'needs-review');
  assert.ok(p.review.notes.some(t => /בחר למעלה/.test(t)));
  // A4 משרת ישן: אין סיכום מודפס, אין כותרת, אין מספר פנימי ואין 2900
  const a4 = JSON.parse(JSON.stringify(r.run(`bermanPaperRecord({ doc: { docType: 'invoice', docNumber: '1539902', totalUnits: null, printedLines: null, rows: [{ description: 'x', quantity: 3 }] } }, { captureId: 'c' })`)));
  assert.equal(a4.rejected, true);
});

test('נייר שהסריקה סימנה: מה לבדוק מוצג, השורה מסומנת, ואישור רק אחרי "בדקתי מול הנייר"; סוג שלא נקרא — חייבים לבחור', async () => {
  const flagged = credit142();
  flagged.verification = { version: 1, status: 'needs_review', primaryReads: 2, escalationAttempted: true, reasons: ['quantity'], issues: [{ noteIndex: 0, rowIndex: 0, field: 'quantity' }], readCount: 3 };
  const r = app(flagged, { returns: L.returns, receipts: L.receipts });
  await intake(r, [page(1)]);
  assert.equal(r.run('paperIntake.items[0].status'), 'review');
  await r.run(`openPaperReview('paper_290095142', 'cap0')`);
  assert.equal(r.run('paperReview.paper.rows[0].flag'), true);
  const html = r.node('app').innerHTML;
  assert.match(html, /מה לבדוק/); assert.match(html, /סומנה לבדיקה/); assert.match(html, /בדקתי את השורות המסומנות/);
  assert.equal(r.run('paperReviewState().ok'), false);
  r.run(`paperUiClick({ dataset: { role: 'review-checked' } })`);
  assert.equal(r.run('paperReviewState().ok'), true);
  r.run(`paperReview.paper.kind = null; paperReview.paper.kindKnown = false;`);
  assert.equal(r.run('paperReviewState().ok'), false, 'בלי סוג אין אישור');
  r.run(`paperUiClick({ dataset: { role: 'review-kind', kind: 'credit' } })`);
  assert.equal(r.run('paperReviewState().ok'), true);
  await r.run('savePaperReview()');
  const upd = r.writes.find(w => w.op === 'update' && w.path && w.path.at(-1) === 'paper_290095142');
  assert.ok(upd); assert.equal(upd.data.review, null); assert.equal(upd.data.rows[0].flag, undefined);
});

test('בדיקת נייר שכבר בענן — התמונה מהטלפון שצילם מוצגת; המספר לא ניתן לשינוי', async () => {
  const bad = credit142(); bad.scan.documents[0].rows[0].quantity = 12;
  const r = app(bad, { returns: L.returns, receipts: L.receipts });
  r.run(`const imgs = {}; paperImgPut = async (k, v) => { imgs[k] = v; }; paperImgGet = async k => imgs[k] || null;`);
  await intake(r, [page(1)]);
  assert.equal(r.run(`!!papers.find(p => p.id === 'paper_290095142')`), true);
  await r.run(`openPaperReview('paper_290095142')`);
  assert.ok(r.run('paperReview.img'), 'התמונה נמצאה לפי captureId של הנייר');
  assert.equal(r.run('paperReview.local'), false);
  r.run(`paperUiInput({ id: 'reviewNumber', value: '1', getAttribute: () => null, dataset: {} })`);
  assert.equal(r.run('paperReview.paper.number'), '290095142');
});
