// v126 — "כפתור אחד": כל נייר מהנהג נקרא פעם אחת בקליטת הניירות, ותעודת משלוח נכנסת לקליטה
// כשהיא כבר קרואה — בלי בקשת קריאה נוספת, בלי עמודים (שום "הפעל שוב" לא ישלם עליה שוב),
// ובאותה צורה בדיוק שהקליטה בונה אחרי קריאה משלה. המודול המלא (receipt-scan-harness);
// רק הרשת, Firebase והמסך מזויפים.
// הרצה: node --test tests/one-button.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, fixture } from './receipt-scan-harness.mjs';

const plain = v => JSON.parse(JSON.stringify(v));
const pad = n => String(n).padStart(2, '0');
const now = new Date();
const TODAY = now.toLocaleDateString('en-CA');
const TODAY_PRINTED = pad(now.getDate()) + '/' + pad(now.getMonth() + 1) + '/' + now.getFullYear();
const days = n => { const d = new Date(now); d.setDate(d.getDate() + n); return d; };
const printed = d => pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();

// תעודת משלוח כפי שהשרת (v7) מחזיר אותה: 5 שורות, 30 יח׳, "סה״כ כללי" ו"סה״כ שורות" מודפסים ונסגרים
function delivery(number = '77001234', extra = {}) {
  const p = structuredClone(fixture().paper);
  Object.assign(p, { serviceVersion: 7, requestId: 'req-' + number, model: 'fixture', reads: [{ model: 'luna' }, { model: 'luna' }], usage: null,
    verification: { version: 1, status: 'agreed', primaryReads: 2, escalationAttempted: false, reasons: [], issues: [], readCount: 2 } });
  Object.assign(p.scan.documents[0], { docNumber: number, internalNumber: '4411', headerText: 'תעודת משלוח', docDate: TODAY_PRINTED,
    numerator: null, printedCheck: null, otherPapersVisible: false, notDriverStrip: false }, extra);
  return p;
}
function app(paper, opts = {}) {
  const data = { ...fixture(), paper };
  // כל קריאה מקבלת את התשובה הנוכחית (r.serve — משתנה בין ניירות)
  const box = { paper, calls: [] };
  const fetch = async (url, options) => { box.calls.push({ url: String(url), body: options && options.body });
    if (!String(url).endsWith('/scan')) throw new Error('Unexpected network request: ' + url);
    return { ok: true, status: 200, json: async () => structuredClone(box.paper) }; };
  const r = runtime({ data, storage: opts.storage || new Map(), globals: { fetch, ...(opts.globals || {}) } });
  r.serve = p => { box.paper = p; };
  Object.defineProperty(r, 'requests', { get: () => box.calls });
  r.context.testConfirms = [];
  r.context.testCloudScans = opts.cloudScans || {};
  r.run(`returns = []; receipts = ${JSON.stringify(opts.receipts || [])};
    runCloudTaskSilent = async (label, task) => { testWrites.push(structuredClone(task)); return true; };
    executePaperDropTask = async (id, cap) => 'gone';
    executePaperCreateTask = async task => { if (globalThis.__failCloud) throw new Error('offline');
      testWrites.push({ paperCreate: structuredClone(task) });
      const cur = papers.find(p => p.id === task.id);
      if (cur && !cur.deleted && cur.captureId === task.paper.captureId) return 'same';
      if (cur && !cur.deleted) return 'duplicate';
      papers = papers.filter(p => p.id !== task.id).concat([structuredClone(task.paper)]); return 'created'; };
    globalThis.__cloudReads = 0;
    paperScanFromCloud = async id => { globalThis.__cloudReads++; return testCloudScans[id] ? structuredClone(testCloudScans[id]) : null; };
    showConfirm = (title, message, label, cb) => { testConfirms.push({ title, message, label, cb }); };`);
  return r;
}
const page = n => ({ dataUrl: 'data:image/jpeg;base64,cGFwZXI' + n, baseDataUrl: 'data:image/jpeg;base64,cGFwZXI' + n, rotation: 0, orientationConfirmed: true });
// סבב בקליטת הניירות (כמו v125 — "קרא"), בלי כניסה לקליטה
async function readPapers(r, n = 1, start = 0) {
  r.run(`if (!paperIntake) openPaperIntake({});
    paperIntake.items = paperIntake.items.concat(${JSON.stringify(Array.from({ length: n }, (x, i) => page(start + i)))}.map((p, i) => ({ captureId: 'cap' + (${start} + i), hash: 'h' + (${start} + i), page: p, status: 'photo' })));`);
  await r.run('paperIntakeRun()');
}
// "לקליטה" (מהמאזן או מכרטיס הנייר)
async function join(r, paperId, cap) {
  r.run(`paperUiClick({ dataset: { role: 'ledger-start-receiving', paper: ${JSON.stringify(paperId)}${cap ? ', cap: ' + JSON.stringify(cap) : ''} } })`);
  await r.run('paperJoinChain');
}
async function confirmLast(r) {
  const n = r.run('testConfirms.length');
  assert.ok(n > 0, 'נשאלה שאלה');
  r.run('testConfirms[testConfirms.length - 1].cb()');
  await r.run('paperJoinChain');
}
const state = r => plain(r.run(`({ opened: receiptOpened, source: receiptAnchorSource, st: receiptPaperScanState, busy: aiScanBusy,
  notes: receiptNotes, docs: aiScanDocuments, per: aiScanResponse && aiScanResponse.perDocument, nums: aiScanResponse && aiScanResponse.scan.documents.map(d => d.docNumber),
  basisOk: !!aiScanBasis && aiScanBasis.notes === aiScanNoteSignature(), snap: receiptScanSnapshot() && receiptScanSnapshot().documents.map(d => d.pageCount) })`));

test('תעודת משלוח שנקראה בקליטת הניירות → "לקליטה" → נכנסת כפי שנקראה: אפס בקשות, בלי עמודים, העוגנים מהנייר', async () => {
  const storage = new Map();
  const r = app(delivery(), { storage });
  await readPapers(r);
  assert.equal(r.requests.length, 1);
  assert.equal(r.run('paperIntake.items[0].status'), 'delivery');
  assert.match(r.run('paperIntakeItemHtml(paperIntake.items[0])'), /היא כבר נקראה/);
  assert.doesNotMatch(r.run('paperIntakeItemHtml(paperIntake.items[0])'), /הקלד את המספרים/);
  await join(r, 'paper_77001234');
  assert.equal(r.requests.length, 1, 'אפס בקשות נוספות');
  const s = state(r);
  assert.equal(s.opened, true); assert.equal(s.source, 'paper'); assert.equal(s.st, 'ok'); assert.equal(s.busy, false);
  assert.deepEqual(s.notes.map(n => [n.units, n.lines]), [[30, 5]]);
  assert.deepEqual(s.docs, [{ noteIndex: 0, amount: s.notes[0].amount, units: 30, lines: 5, kind: 'charge', pages: [], savedPageCount: 1, paperId: 'paper_77001234', captureId: 'cap0' }]);
  assert.equal(s.per.length, 1);
  assert.equal(s.per[0].source, 'paper'); assert.equal(s.per[0].paperId, 'paper_77001234'); assert.equal(s.per[0].docIndex, 0); assert.equal(s.per[0].pageCount, 1);
  assert.ok(s.basisOk, 'הבסיס = החתימה'); assert.deepEqual(s.snap, [1]);
  assert.equal(r.run('currentView'), 'receiving');
  assert.match(r.run('paperIntakeItemHtml(paperIntake.items[0])'), /נכנסה לקליטה/);
  assert.match(r.run('paperIntakeItemHtml(paperIntake.items[0])'), /paper-goto-receiving/);
  // הספירה עיוורת: במסך הקליטה אין אף שורה מהנייר
  r.run('renderReceiving()');
  const html = r.node('app').innerHTML;
  ['אחיד פרוס', 'לחמניות'].forEach(w => assert.doesNotMatch(html, new RegExp(w)));
  assert.match(html, /העוגנים נקראו מהתעודה/);
  // ריענון: הקריאה חוזרת מהמכשיר — אפס בקשות
  const r2 = app(delivery(), { storage });
  const s2 = state(r2);
  assert.equal(s2.st, 'ok'); assert.equal(s2.source, 'paper'); assert.deepEqual(s2.per.map(p => p.paperId), ['paper_77001234']);
  assert.equal(r2.requests.length, 0);
  // "הפעל שוב" של גרסה ישנה (אין עמודים) — אפס בקשות
  await r2.run('aiScanBusy = false; bermanRunPaperScanInBackground()');
  assert.equal(r2.requests.length, 0);
});

test('אחרי ריענון: מהמכשיר, ואחרי שהענן אישר (התשובה נמחקה מהמכשיר) — מהענן; אף פעם לא קריאה חדשה', async () => {
  const storage = new Map();
  const r = app(delivery(), { storage });
  await readPapers(r);
  const scan = plain(r.run('paperIntake.items[0].scan'));
  assert.equal(r.run(`!!paperLocalResults().cap0.ackedAt`), true, 'הענן אישר');
  assert.equal(r.run(`!!paperLocalResults().cap0.scan`), false, 'והתשובה הכבדה נמחקה מהמכשיר');
  storage.delete('bm_receipt_draft');
  const r2 = app(delivery(), { storage, cloudScans: { paper_77001234: scan } });
  await join(r2, 'paper_77001234');
  assert.equal(r2.requests.length, 0);
  assert.equal(r2.run('globalThis.__cloudReads'), 1);
  assert.equal(state(r2).st, 'ok');
  // אין חיבור ואין עותק במכשיר — לא נכנסת, נשמרת בתור, ואומרים למה
  storage.delete('bm_receipt_draft');
  const r3 = app(delivery(), { storage });
  r3.run('navigator.onLine = false');
  await join(r3, 'paper_77001234');
  assert.equal(r3.run('receiptOpened'), false);
  assert.equal(r3.run(`paperJoinPending.has('paper_77001234')`), true);
  assert.ok(r3.toasts.some(t => /לא נמצאה במכשיר/.test(t)));
  assert.equal(r3.requests.length, 0);
});

test('אותה תעודה פעמיים — "כבר בקליטה"; תעודה שכבר נקלטה — לא נקלטת פעמיים', async () => {
  const r = app(delivery());
  await readPapers(r);
  await join(r, 'paper_77001234');
  const before = JSON.stringify(state(r));
  await join(r, 'paper_77001234');
  assert.equal(JSON.stringify(state(r)), before);
  assert.ok(r.toasts.some(t => /כבר בקליטה הפתוחה/.test(t)));
  const saved = [{ id: 'rc1', date: TODAY, paperDocs: [{ number: '77001234' }], items: [] }];
  const r2 = app(delivery(), { receipts: saved });
  await readPapers(r2);
  await join(r2, 'paper_77001234');
  assert.equal(r2.run('receiptOpened'), false);
  assert.ok(r2.toasts.some(t => /כבר נקלטה/.test(t)));
});

test('צילום חוזר של אותה תעודה (אפס בקשות) — "לקליטה" מהכרטיס שלו מכניס אותה', async () => {
  const r = app(delivery());
  await readPapers(r);
  // אותה תמונה: אותו hash — הכרטיס "כבר נקרא"
  r.run(`paperIntake.items.push({ captureId: 'capDup', hash: 'h0', status: 'dup', paperId: 'paper_77001234', dupCap: 'cap0' });`);
  const html = r.run(`paperIntakeItemHtml(paperIntake.items.find(x => x.captureId === 'capDup'))`);
  assert.match(html, /כבר נקרא — לא נשלח שוב/);
  assert.match(html, /ledger-start-receiving/);
  await join(r, 'paper_77001234', 'capDup');
  assert.equal(state(r).st, 'ok');
  assert.equal(r.requests.length, 1);
});

test('מספרים שהוקלדו: זהים לנייר — מתחלפים בקריאה; שונים — שאלה, ובלי "כן" לא נוגעים בכלום', async () => {
  const r = app(delivery());
  await readPapers(r);
  // הקלדה דרך "סיום" של עריכת התעודות — המקור נשאר ריק (לא 'manual')
  r.run(`receiptOpened = true; receiptEntryMode = 'photo'; receiptNotes = [{ amount: 0, units: 30, lines: 5, kind: 'charge' }]; recomputeNoteTotal(); receiptAnchorSource = null; saveReceiptDraft();`);
  await join(r, 'paper_77001234');
  assert.equal(state(r).source, 'paper');
  assert.equal(state(r).st, 'ok');
  const r2 = app(delivery());
  await readPapers(r2);
  r2.run(`receiptOpened = true; receiptEntryMode = 'photo'; receiptNotes = [{ amount: 0, units: 31, lines: 5, kind: 'charge' }]; recomputeNoteTotal(); receiptAnchorSource = null; saveReceiptDraft();`);
  const before = JSON.stringify(state(r2));
  await join(r2, 'paper_77001234');
  assert.equal(JSON.stringify(state(r2)), before, 'לפני "כן" — שום שינוי');
  assert.match(r2.run('testConfirms[0].message'), /הוקלדו 31 יח׳ · 5 שורות; בתעודה: 30 יח׳ · 5 שורות/);
  assert.equal(r2.run('testConfirms[0].label'), 'החלף במספרים מהנייר');
  await confirmLast(r2);
  assert.equal(state(r2).source, 'paper');
  assert.deepEqual(state(r2).notes.map(n => n.units), [30]);
  assert.equal(r2.requests.length, 1);
});

test('סירובים: סיכום פתוח, צילום שעוד לא נקרא (טלפון ישן), 4 תעודות — הקליטה לא משתנה', async () => {
  const r = app(delivery());
  await readPapers(r);
  r.run(`receiptOpened = true; receiptList = [{ productId: 'code_101', name: 'x', barcode: '', qty: 2 }]; reconcileData = []; saveReceiptDraft();`);
  let before = JSON.stringify(state(r));
  await join(r, 'paper_77001234');
  assert.equal(JSON.stringify(state(r)), before);
  assert.ok(r.toasts.some(t => /כבר בסיכום/.test(t)));
  r.run(`reconcileData = null; bermanSeedPhotoFirstScan(1); aiScanDocuments[0].pages = [{ dataUrl: 'data:image/jpeg;base64,eA==', orientationConfirmed: true }]; saveReceiptDraft();`);
  before = JSON.stringify(state(r));
  await join(r, 'paper_77001234');
  assert.equal(JSON.stringify(state(r)), before, 'הצילום של הטלפון הישן נשאר');
  assert.equal(r.run('aiTotalPages()'), 1);
  assert.ok(r.toasts.some(t => /צילום תעודה שעוד לא נקרא/.test(t)));
  // כבר 4 תעודות בקליטה הפתוחה
  r.run(`aiScanDocuments = [0, 1, 2, 3].map(i => ({ noteIndex: i, amount: null, units: 1, lines: 1, kind: 'charge', pages: [], savedPageCount: 1 }));
    aiScanResponse = { ok: true, scan: { documents: [], warnings: [] }, perDocument: [] }; receiptPaperScanState = 'ok'; receiptAnchorSource = 'paper';`);
  assert.equal(r.run(`receivingDeliveryRoute(paperIntake.items[0].scan, paperFind('paper_77001234').paper, null, {}).reason`), 'full');
  assert.equal(r.requests.length, 1);
});

test('תעודה שנייה מאותו משלוח: מתווספת (noteIndex 0,1), שני עוגנים, נשמרת לריענון; תעודה שלא אישרה את עצמה — רק אחרי "כן", ואז כל העוגנים מתאפסים', async () => {
  const storage = new Map();
  const r = app(delivery('77001234'), { storage });
  await readPapers(r);
  r.serve(delivery('77001235', { rows: delivery().scan.documents[0].rows.slice(0, 4), totalUnits: 27, printedLines: 4 }));
  await readPapers(r, 1, 1);
  assert.equal(r.requests.length, 2);
  await join(r, 'paper_77001234');
  await join(r, 'paper_77001235');
  assert.match(r.run('testConfirms[0].title'), /להוסיף לקליטה הפתוחה/);
  await confirmLast(r);
  const s = state(r);
  assert.equal(s.st, 'ok');
  assert.deepEqual(s.docs.map(d => [d.noteIndex, d.paperId, d.savedPageCount, d.pages.length]), [[0, 'paper_77001234', 1, 0], [1, 'paper_77001235', 1, 0]]);
  assert.deepEqual(s.per.map(p => p.docIndex), [0, 1]);
  assert.deepEqual(s.notes.map(n => [n.units, n.lines]), [[30, 5], [27, 4]]);
  assert.ok(s.basisOk); assert.deepEqual(s.snap, [1, 1]);
  const ev = r.run('aiEvaluateInvoiceScan(aiScanResponse)');
  assert.ok(!(ev.errors || []).some(e => /עמודים|לא התקבל פענוח/.test(e)), 'אין שגיאת עמודים או תעודה חסרה');
  const r2 = app(delivery(), { storage });
  assert.equal(state(r2).st, 'ok'); assert.equal(state(r2).docs.length, 2); assert.equal(r2.requests.length, 0);
  // תעודה שלישית שלא נסגרת מול בלוק הסיכום שלה
  r.serve(delivery('77001236', { totalUnits: 99 }));
  await readPapers(r, 1, 2);
  const before = JSON.stringify(state(r));
  r.run('testConfirms = []');
  await join(r, 'paper_77001236');
  assert.equal(JSON.stringify(state(r)), before, 'לפני "כן" — שום שינוי');
  assert.match(r.run('testConfirms[0].title'), /לא אישרה את עצמה/);
  await confirmLast(r);
  const f = state(r);
  assert.equal(f.st, 'failed'); assert.deepEqual(f.notes, []); assert.equal(f.source, null);
  assert.ok(f.docs.every(d => d.units == null && d.lines == null && d.amount == null));
  assert.ok(f.basisOk); assert.deepEqual(f.snap, [1, 1, 1]);
  const r3 = app(delivery(), { storage });
  assert.equal(state(r3).st, 'failed'); assert.equal(state(r3).docs.length, 3); assert.equal(r3.requests.length, 0);
});

test('קליטה שנשמרה בלי תעודה מאותו יום — "לקליטה" שואל, ואז מצרף אליה (אותו מזהה, אותה ספירה)', async () => {
  const bare = { id: 'rc_bare', date: TODAY, noDoc: true, noteParts: [], items: [{ productId: 'code_101', name: 'אחיד', qty: 12 }], timestamp: 1 };
  const r = app(delivery(), { receipts: [bare] });
  await readPapers(r);
  await join(r, 'paper_77001234');
  assert.equal(r.run('receiptOpened'), false);
  assert.match(r.run('testConfirms[0].title'), /בלי תעודה/);
  await confirmLast(r);
  assert.equal(r.run('receiptDraftId'), 'rc_bare');
  assert.equal(r.run('receiptAttachTarget.id'), 'rc_bare');
  assert.deepEqual(plain(r.run('receiptList.map(l => [l.productId, l.qty])')), [['code_101', 12]]);
  assert.equal(state(r).st, 'ok');
  assert.equal(r.requests.length, 1);
});

test('מספר שתוקן בבדיקת הנייר — הוא המספר שנכנס לקליטה', async () => {
  const r = app(delivery());
  r.run('globalThis.__failCloud = true');
  await readPapers(r);
  r.run(`const rec = paperLocalResults().cap0; paperWrite({ ...rec.paper, number: '77001299' }, { local: true, cap: 'cap0' });`);
  assert.equal(r.run(`paperLocalResults().cap0.paper.id`), 'paper_77001299');
  await join(r, 'paper_77001299');
  assert.deepEqual(state(r).nums, ['77001299']);
  assert.deepEqual(plain(r.run('receiptPaperDocsSnapshot().map(d => d.number)')), ['77001299']);
});

test('אי אפשר לכתוב עכשיו (אין חיבור לקליטה המשותפת) — ממתינה בתור, ונכנסת לבד כשחוזר', async () => {
  const r = app(delivery());
  await readPapers(r);
  r.run('canEditSharedReceipt = () => false');
  await join(r, 'paper_77001234');
  assert.equal(r.run('receiptOpened'), false);
  assert.equal(r.run(`paperJoinPending.has('paper_77001234')`), true);
  r.run('canEditSharedReceipt = () => true');
  await r.run('paperJoinRetryNow()');
  assert.equal(state(r).st, 'ok');
  assert.equal(r.run(`paperJoinPending.size`), 0);
  assert.equal(r.requests.length, 1);
});

test('תעודה מיום אחר בלי קליטה פתוחה — שואל לפני שפותח לה קליטה; התאריך של הקליטה הוא של הנייר', async () => {
  const r = app(delivery('77001234', { docDate: printed(days(-1)) }));
  await readPapers(r);
  await join(r, 'paper_77001234');
  assert.equal(r.run('receiptOpened'), false);
  assert.match(r.run('testConfirms[0].title'), /לפתוח קליטה/);
  await confirmLast(r);
  assert.equal(state(r).st, 'ok');
  assert.equal(r.run('receiptDocDate'), days(-1).toLocaleDateString('en-CA'));
});
