// v126 — כלים משותפים לבדיקות "כפתור אחד" (tests/one-button*.test.mjs)
import assert from 'node:assert/strict';
import { runtime, fixture } from './receipt-scan-harness.mjs';

export const plain = v => JSON.parse(JSON.stringify(v));
export const pad = n => String(n).padStart(2, '0');
export const now = new Date();
export const TODAY = now.toLocaleDateString('en-CA');
export const days = n => { const d = new Date(now); d.setDate(d.getDate() + n); return d; };
export const printed = d => pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
export const tick = () => new Promise(res => setImmediate(res));
export async function until(cond, n = 400) { for (let i = 0; i < n && !cond(); i++) await tick(); assert.ok(cond(), 'התנאי לא התקיים'); }

// תעודת משלוח כפי שהשרת (v7) מחזיר אותה: 5 שורות, 30 יח׳; "סה״כ כללי" ו"סה״כ שורות" מודפסים ונסגרים
export function delivery(number = '77001234', extra = {}) {
  const p = structuredClone(fixture().paper);
  Object.assign(p, { serviceVersion: 7, requestId: 'req-' + number, model: 'fixture', reads: [{ model: 'luna' }, { model: 'luna' }], usage: null,
    verification: { version: 1, status: 'agreed', primaryReads: 2, escalationAttempted: false, reasons: [], issues: [], readCount: 2 } });
  Object.assign(p.scan.documents[0], { docNumber: number, internalNumber: '4411', headerText: 'תעודת משלוח', docDate: printed(now),
    numerator: null, printedCheck: null, otherPapersVisible: false, notDriverStrip: false }, extra);
  return p;
}
// נייר זיכוי קטן ("ת.משלוח החזרה יבש") על שני מוצרים מהקטלוג
export function credit(number = '290095142') {
  const p = delivery(number, { docType: 'credit', headerText: 'ת.משלוח החזרה יבש', internalNumber: null, totalUnits: 3, printedLines: 2 });
  const rows = p.scan.documents[0].rows;
  p.scan.documents[0].rows = [{ ...rows[0], quantity: 2, lineNumber: 1 }, { ...rows[2], quantity: 1, lineNumber: 2 }];
  return p;
}
export function app(paper, opts = {}) {
  const data = { ...fixture(), paper };
  // כל בקשה מקבלת את התשובה הבאה ברשימה (האחרונה חוזרת); gate — עוצר את הבקשה עד שמשחררים
  const box = { list: [paper], calls: [], gate: null };
  const fetch = async (url, options) => {
    box.calls.push({ url: String(url), body: options && options.body });
    if (!String(url).endsWith('/scan')) throw new Error('Unexpected network request: ' + url);
    const payload = box.list[Math.min(box.calls.length - 1, box.list.length - 1)];
    if (box.gate) await box.gate;
    return { ok: true, status: 200, json: async () => structuredClone(payload) };
  };
  const r = runtime({ data, storage: opts.storage || new Map(), globals: { fetch, ...(opts.globals || {}) }, sharedReceiving: !!opts.shared, loadSharedEngine: !!opts.shared });
  r.serve = (...list) => { box.list = box.calls.length ? Array(box.calls.length).fill(null).concat(list) : list; };
  r.hold = () => { let release; box.gate = new Promise(res => { release = res; }); return () => { box.gate = null; release(); }; };
  r.held = () => !!box.gate;
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
    globalThis.__cloudReads = 0; globalThis.__scanner = 0;
    paperScanFromCloud = async id => { globalThis.__cloudReads++; return testCloudScans[id] ? structuredClone(testCloudScans[id]) : null; };
    openReceivingScanner = () => { globalThis.__scanner++; };
    showConfirm = (title, message, label, cb) => { testConfirms.push({ title, message, label, cb }); };`);
  return r;
}
export const page = n => ({ dataUrl: 'data:image/jpeg;base64,cGFwZXI' + n, baseDataUrl: 'data:image/jpeg;base64,cGFwZXI' + n, rotation: 0, orientationConfirmed: true });
export const items = (n, start, target) => JSON.stringify(Array.from({ length: n }, (x, i) => ({ captureId: 'cap' + (start + i), hash: 'h' + (start + i), page: page(start + i), status: 'photo', target, forDraftId: null })));
// "צלם נייר" מהמאזן או מכרטיס החזרה (v125) → "קרא"
export async function readPapers(r, n = 1, start = 0) {
  r.run(`openPaperIntake({}); paperIntake.items = paperIntake.items.concat(${items(n, start, '')});`);
  await r.run('paperIntakeRun()');
  await r.run('paperJoinChain');
}
// מסך הקליטה: כפתור הניירות → "הכל ישר — קרא והתחל לספור"
// "צלם נייר מהנהג" (מכל מסך) → "הכל ישר — קרא", ובזמן הקריאה "התחל לספור עכשיו" (count: false — בלי).
// מחזיר את הסבב (Promise). הבקשה נעצרת עד שהספירה נפתחה — אלא אם הבדיקה כבר עצרה אותה בעצמה.
export async function startRound(r, n = 1, start = 0, { count = true } = {}) {
  r.run(`currentView = 'receiving'; mainMode = 'receiving'; openPaperIntake({});
    paperIntake.items = paperIntake.items.concat(${items(n, start, '')});`);
  const release = r.held() ? null : r.hold();
  const run = r.run('paperIntakeRun()');
  if (count) await r.run('receivingCountNow()');
  if (release) release();
  return run;
}
export async function receive(r, n = 1, start = 0, opts = {}) { await (await startRound(r, n, start, opts)); await r.run('paperJoinChain'); }
// "לקליטה" (מהמאזן או מכרטיס הנייר)
export async function join(r, paperId, cap) {
  r.run(`paperUiClick({ dataset: { role: 'ledger-start-receiving', paper: ${JSON.stringify(paperId)}${cap ? ', cap: ' + JSON.stringify(cap) : ''} } })`);
  await r.run('paperJoinChain');
}
export async function confirmLast(r) {
  assert.ok(r.run('testConfirms.length') > 0, 'נשאלה שאלה');
  r.run('testConfirms[testConfirms.length - 1].cb()');
  await r.run('paperJoinChain');
}
export const state = r => plain(r.run(`({ opened: receiptOpened, source: receiptAnchorSource, st: receiptPaperScanState, busy: aiScanBusy,
  notes: receiptNotes, docs: aiScanDocuments, per: aiScanResponse && aiScanResponse.perDocument, nums: aiScanResponse && aiScanResponse.scan.documents.map(d => d.docNumber),
  basisOk: !!aiScanBasis && aiScanBasis.notes === aiScanNoteSignature(), snap: receiptScanSnapshot() && receiptScanSnapshot().documents.map(d => d.pageCount) })`));
// ספירה שתואמת בדיוק לנייר (בלי לראות אותו — מהתשובה של השרת בבדיקה)
export const countAsPaper = r => r.run(`receiptList = testData.paper.scan.documents[0].rows.map(row => { const p = products.find(x => x.code === row.itemCode);
  return { productId: p.id, name: p.name, barcode: p.barcode, qty: Number(row.quantity) }; }); saveReceiptDraft();`);

