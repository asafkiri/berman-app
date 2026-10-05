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
  const r = runtime({ data, storage: opts.storage || new Map() });
  r.run(`products = testData.products; returns = ${JSON.stringify(opts.returns || [])}; receipts = ${JSON.stringify(opts.receipts || [])};
    executePaperCreateTask = async task => { if (globalThis.__failCloud) throw new Error('offline'); testWrites.push({ paperCreate: structuredClone(task) });
      if (!papers.some(p => p.id === task.id)) papers = papers.concat([structuredClone(task.paper)]); return 'created'; };`); // כמו המאזין: מה שנכתב לענן מגיע ל-papers
  return r;
}
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

test('התור: כשהקליטה קוראת תעודה עכשיו — קליטת הנייר מחכה לה', async () => {
  const r = app(credit142());
  r.run(`aiScanBusy = true; paperSleep = () => new Promise(res => { globalThis.__wake = res; });
    openPaperIntake({}); paperIntake.items = [{ captureId: 'c0', hash: 'h0', page: ${JSON.stringify(page(1))}, status: 'photo' }];`);
  const running = r.run('paperIntakeRun()');
  await new Promise(res => setImmediate(res));
  assert.equal(r.requests.length, 0, 'עדיין ממתין');
  assert.match(r.run('paperIntake.progress'), /ממתין לסיום הקריאה בקליטה/);
  r.run('aiScanBusy = false; __wake();');
  await running;
  assert.equal(r.requests.length, 1);
});
