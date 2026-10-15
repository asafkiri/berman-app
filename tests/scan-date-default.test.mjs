// v142 — תאריך תעודה שלא נקרא היטב הוא יום הקליטה (החלטת ברמן: "אם התאריך לא נקרא טוב, התאריך
// הוא של היום"). לא קריאה בתשלום, לא עוצר את העובד, הערה קצרה; תאריך שהעובד הקליד/אישר גובר;
// הערך המודפס לא נדרס. "לא נקרא היטב": לא נקרא / אינו תאריך אמיתי; שנוי במחלוקת (שרת v8 —
// verification.docDateUnreliable, שרת v7 — ממצא docDate, או קריאת האימות של האפליקציה שקראה יום
// אחר); אחרי יום המשלוח. המודול המלא (receipt-scan-harness) — רק הרשת, Firebase והמסך מזויפים.
// הרצה: TZ=Asia/Jerusalem node --test tests/scan-date-default.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runtime, fixture } from './receipt-scan-harness.mjs';
import { app as oneButtonApp, delivery, readPapers, receive, state, days, printed, TODAY, plain } from './one-button-helpers.mjs';

const L = JSON.parse(fs.readFileSync(new URL('./ledger-2026-10.json', import.meta.url), 'utf8'));
const R1004 = 'returns_43eb7cdd-5e32-4524-aa86-b87ca8e88650'; // ההחזרה מ-4.10
const iso = d => d.toLocaleDateString('en-CA');
const NOTE = 'תאריך התעודה לא נקרא בוודאות — נקבע תאריך הקליטה; אפשר לשנות';
const V7_DATE_WARNING = 'לא ניתן לאמת את הקריאה: תאריך. בדוק את המספר המודפס.';
const json = (r, code) => JSON.parse(r.run('JSON.stringify(' + code + ')'));
// שעון קבוע (15.10.2026, 12:00 בירושלים) לבדיקות שתלויות בחלון השיוך של 14 יום סביב ההחזרה מ-4.10
const FIXED_NOW = Date.UTC(2026, 9, 15, 9, 0);
class FixedDate extends Date {
  constructor(...a) { super(...(a.length ? a : [FIXED_NOW])); }
  static now() { return FIXED_NOW; }
}
const pinned = { globals: { Date: FixedDate } };

// ===== קליטה במצלמה =====
function cameraFixture() {
  const products = [
    { id: 'spelt', code: '649', barcode: '4685447', name: 'לחמניות בדיקה', listPrice: 14.94, price: 10.458, discountPct: 30, discountSet: true },
    { id: 'buns', code: '1231', barcode: '498256', name: 'לחמניות עשרייה בדיקה', listPrice: 20.46, price: 10.399818, discountPct: 49.17, discountSet: true },
    { id: 'active', code: '339', barcode: '497044', name: 'לחם מבצע בדיקה', listPrice: 17.21, price: 12.047, discountPct: 30, discountSet: true }
  ];
  const qty = [2, 8, 8];
  const rows = products.map((p, i) => ({ sourcePage: 1, lineNumber: i + 10, itemCode: p.code, barcode: p.barcode,
    description: p.name, quantity: qty[i], unitPriceExVat: p.listPrice, confidence: .99 }));
  return { products, promos: [], items: products.map((p, i) => ({ productId: p.id, name: p.name, barcode: p.barcode, qty: qty[i] })),
    paper: { ok: true, serviceVersion: 7, reads: [{ model: 'luna' }, { model: 'luna' }],
      verification: { version: 1, status: 'agreed', primaryReads: 2, escalationAttempted: false, reasons: [], readCount: 2, issues: [] },
      scan: { warnings: [], documents: [{ noteIndex: 0, docType: 'invoice', docNumber: '87654321', docDate: printed(days(-3)),
        pageCount: 1, totalUnits: 18, printedLines: 3, netToChargeExVat: 174.72, confidence: .99, rows, warnings: [] }] } } };
}
// שרת v7 שלא הכריע את התאריך גם בקריאה החזקה: needs_review עם ממצא docDate (ולפעמים עוד ממצאים)
function cameraV7(issues, extra = {}) {
  const data = cameraFixture();
  data.paper.verification = { ...data.paper.verification, status: 'needs_review', escalationAttempted: true, readCount: 3, reasons: ['disagreement'], issues };
  data.paper.scan.warnings = [V7_DATE_WARNING];
  Object.assign(data.paper.scan.documents[0], extra);
  return data;
}
function cameraApp(data, storage) {
  const r = runtime({ data, storage: storage || new Map() });
  r.run(`currentView = 'receiving'; mainMode = 'receiving';`);
  return r;
}
// קליטה חדשה (בלי תאריך שנבחר) → צילום → קריאה ברקע → ספירה שתואמת לנייר
async function cameraScan(r) {
  r.run(`receiptOpened = true; receiptDocDate = null; receiptList = [];
    bermanSeedPhotoFirstScan(1);
    aiScanDocuments[0].pages = [{ dataUrl: 'data:image/jpeg;base64,Zml4dHVyZQ==', orientationConfirmed: true }];`);
  await r.run('bermanRunPaperScanInBackground()');
  r.run('receiptList = structuredClone(testData.items); saveReceiptDraft();');
}
async function cameraSave(r) {
  r.run('finishReceipt()');
  assert.ok(r.run('!!pendingReceipt && pendingReceipt.status === "ok"'), 'הסיכום נפתח — שום דבר לא עוצר');
  await r.run('confirmReceipt()');
  const saved = r.writes.find(w => w.op === 'set' && w.path && w.path[w.path.length - 2] === 'receipts');
  assert.ok(saved, 'הקליטה נשמרה');
  return saved.data;
}

test('v7: ממצא על התאריך לא חוסם, לא מוצע להקלדה, ולא עולה קריאה נוספת — הקליטה על יום הקליטה, המודפס נשמר כפי שנקרא', async () => {
  const r = cameraApp(cameraV7([{ noteIndex: 0, field: 'docDate', reason: 'disagreement' }]));
  await cameraScan(r);
  assert.equal(r.requests.length, 1, 'בקשה אחת — בלי קריאת אימות בתשלום על התאריך');
  assert.equal(r.run('receiptPaperScanState'), 'ok');
  assert.equal(r.run('bermanOcrPendingDocs().length'), 0, 'אין מה לאמת');
  assert.deepEqual(json(r, 'bermanOcrReviewFields(aiScanResponse.scan.documents[0])'), []);
  assert.equal(r.run('bermanOcrReviewHtml()'), '');
  assert.ok(r.run('receiptQuantityPaperRows()'), 'הנייר עדיין מוכיח את הספירה');
  assert.ok(!r.run('aiScanResponse.scan.warnings').includes(V7_DATE_WARNING), 'האזהרה של השרת על התאריך לא מוצגת');
  assert.equal(r.run('receiptScanDateDoubts().length'), 1);
  r.run('renderReceiving()');
  assert.ok(r.node('app').innerHTML.includes(NOTE), 'הערה קצרה ליד "ערוך"');
  const data = await cameraSave(r);
  assert.equal(data.docDate, TODAY, 'יום הקליטה');
  assert.equal(data.paperDocs[0].date, printed(days(-3)), 'הערך המודפס נשמר כפי שנקרא');
  assert.equal(data.paperScan.response.scan.documents[0].docDate, printed(days(-3)), 'גם בסריקה השמורה');
  assert.equal(r.requests.length, 1);
});

test('v7: ממצא תאריך לצד ממצא כמות — רק הכמות מוצעת להקלדה; אישורה משחרר את הקליטה', async () => {
  const r = cameraApp(cameraV7([{ noteIndex: 0, field: 'docDate', reason: 'disagreement' },
    { noteIndex: 0, sourcePage: 1, lineNumber: 11, rowIndex: 1, field: 'quantity', reason: 'disagreement' }]));
  await cameraScan(r);
  assert.equal(r.run('bermanOcrPendingDocs().length'), 1);
  assert.deepEqual(json(r, 'bermanOcrReviewFields(aiScanResponse.scan.documents[0]).map(f => [f.rowIndex, f.field])'), [[1, 'quantity']]);
  const html = r.run('bermanOcrReviewHtml()');
  assert.ok(!html.includes('תאריך'), 'אין שדה תאריך');
  assert.equal((html.match(/<input/g) || []).length, 1);
  r.context.document.querySelectorAll = selector => selector === '[data-ocr-doc]' ? [{ dataset: { ocrDoc: '0', ocrKey: '1:quantity' }, value: '8' }] : [];
  assert.equal(r.run('bermanConfirmOcr(0)'), true);
  assert.equal(r.run('bermanOcrPendingDocs().length'), 0);
  const data = await cameraSave(r);
  assert.equal(data.docDate, TODAY);
  assert.equal(r.requests.length, 1);
});

test('קליטה במצלמה: תאריך שהעובד בחר גובר; תאריך שהוקלד באימות הקריאה בגרסה 141 נאמן; תאריך מוסכם מהעבר — בלי הערה', async () => {
  const r = cameraApp(cameraV7([{ noteIndex: 0, field: 'docDate', reason: 'disagreement' }]));
  await cameraScan(r);
  r.run(`receiptDocDate = '${iso(days(-1))}'; saveReceiptDraft();`);
  const data = await cameraSave(r);
  assert.equal(data.docDate, iso(days(-1)), 'התאריך שהעובד בחר');
  // טיוטה מגרסה 141: העובד הקליד את התאריך באימות הקריאה — התיקון רשום על התעודה
  const t = cameraApp(cameraV7([{ noteIndex: 0, field: 'docDate', reason: 'disagreement' }]));
  await cameraScan(t);
  t.run(`aiScanResponse.scan.documents[0].docDate = '${printed(days(-2))}';
    aiScanResponse.scan.documents[0].__bermanOcrCorrections = [{ field: 'docDate', rowIndex: -1, before: '${printed(days(-3))}', after: '${printed(days(-2))}' }];`);
  assert.equal(t.run('bermanScanDateDoubt(aiScanResponse.scan.documents[0], todayStr())'), null, 'מה שהוקלד גובר');
  assert.equal(t.run('bermanScanDocDay(aiScanResponse.scan.documents[0], todayStr())'), iso(days(-2)));
  assert.equal(t.run('receiptScanDateDoubts().length'), 0);
  // שני הקריאות הסכימו על תאריך מהעבר — נאמן, בלי הערה
  const a = cameraApp(cameraFixture());
  await cameraScan(a);
  assert.equal(a.run('receiptScanDateDoubts().length'), 0);
  assert.equal(a.run('bermanScanDocDay(aiScanResponse.scan.documents[0], todayStr())'), iso(days(-3)));
  a.run('renderReceiving()');
  assert.ok(!a.node('app').innerHTML.includes('data-doc-date-note'));
});

test('קליטה במצלמה: הסימן של שרת v8, ותאריך אחרי יום הקליטה — הערה, והקליטה נשארת של היום; אחרי ריענון — אותו דבר', async () => {
  const data = cameraFixture();
  data.paper.serviceVersion = 8;
  data.paper.verification.docDateUnreliable = [{ noteIndex: 0, reason: 'disputed' }];
  const storage = new Map();
  const r = cameraApp(data, storage);
  await cameraScan(r);
  assert.equal(r.requests.length, 1);
  assert.equal(r.run('bermanScanDateDoubt(aiScanResponse.scan.documents[0], todayStr())'), 'disputed');
  assert.equal(r.run('receiptScanDateDoubts().length'), 1);
  const s = cameraApp(data, storage);
  assert.equal(s.run('receiptPaperScanState'), 'ok');
  assert.equal(s.run('receiptScanDateDoubts().length'), 1, 'אחרי ריענון — אותה הערה');
  s.run('renderReceiving()');
  assert.ok(s.node('app').innerHTML.includes(NOTE));
  assert.equal(s.requests.length, 0);
  // תאריך בעתיד (אחרי יום הקליטה) — גם כשכל הקריאות הסכימו
  const f = cameraFixture();
  f.paper.scan.documents[0].docDate = printed(days(2));
  const u = cameraApp(f);
  await cameraScan(u);
  assert.equal(u.run('bermanScanDateDoubt(aiScanResponse.scan.documents[0], todayStr())'), 'future');
  assert.equal(u.run('bermanScanDocDay(aiScanResponse.scan.documents[0], todayStr())'), TODAY);
  const saved = await cameraSave(u);
  assert.equal(saved.docDate, TODAY);
  assert.equal(saved.paperDocs[0].date, printed(days(2)), 'המודפס לא נדרס');
});

// ===== קליטת ניירות מהנהג =====
// נייר הזיכוי 290095142 (מ-4.10, לקוח מ-tests/paper-intake.test.mjs) כפי ששרת v8 מחזיר אותו
function credit142(extra = {}, verification = {}) {
  const rows = [['497112', '101', 'אחיד פרוס ברמן', 13, 6.24], ['497297', '233', 'זוג לחמניות אצ', 1, 4.1], ['498034', '344', 'לחם כוסמין E-F', 2, 17.58], ['497204', '238', 'ברמן אסלי 5 פי', 1, 7.95]]
    .map(([barcode, itemCode, description, quantity, unitPriceExVat], i) => ({ sourcePage: 1, lineNumber: i + 1, barcode, itemCode, description, quantity, unitPriceExVat, confidence: 0.97 }));
  return { ok: true, serviceVersion: 8, model: 'fixture', requestId: 'req-142', reads: [{ model: 'luna' }, { model: 'luna' }], usage: null,
    verification: { version: 1, status: 'agreed', primaryReads: 2, escalationAttempted: false, reasons: [], issues: [], readCount: 2, docDateUnreliable: [], ...verification },
    scan: { warnings: [], documents: [{ noteIndex: 0, docNumber: '290095142', docType: 'credit', docDate: '04/10/2026', pageCount: 1,
      totalUnits: 17, printedLines: 4, netToChargeExVat: 106.32, vatAmountPrinted: 19.14, totalToChargeInclVat: 125.46,
      headerText: 'ת.משלוח החזרה יבש', internalNumber: null, numerator: '95142', printedCheck: 147, otherPapersVisible: false, notDriverStrip: false,
      confidence: 0.97, warnings: [], rows, ...extra }] } };
}
function paperApp(responses, opts = {}) {
  const data = { ...fixture(), paper: responses[0] };
  data.products = L.products;
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url: String(url), body: options && options.body });
    const payload = responses[Math.min(calls.length - 1, responses.length - 1)];
    return { ok: true, status: 200, json: async () => structuredClone(payload) };
  };
  const r = runtime({ data, storage: opts.storage || new Map(), globals: { fetch, ...(opts.globals || {}) } });
  Object.defineProperty(r, 'requests', { get: () => calls });
  // returns: [] — נייר שאינו משתייך לבד לאף החזרה (אז היום שנקבע הוא יום הצילום)
  r.run(`products = testData.products; returns = ${JSON.stringify(opts.returns || L.returns)}; receipts = ${JSON.stringify(opts.receipts || L.receipts)};
    runCloudTaskSilent = async (label, task) => { testWrites.push(structuredClone(task)); return true; };
    executePaperCreateTask = async task => { if (globalThis.__failCloud) throw new Error('offline');
      testWrites.push({ paperCreate: structuredClone(task) });
      papers = papers.filter(p => p.id !== task.id).concat([structuredClone(task.paper)]); return 'created'; };`);
  if (opts.offline) r.run('globalThis.__failCloud = true;');
  return r;
}
const page = n => ({ dataUrl: 'data:image/jpeg;base64,cGFwZXI' + n, baseDataUrl: 'data:image/jpeg;base64,cGFwZXI' + n, rotation: 0, orientationConfirmed: true });
async function intake(r, forReturnId = '') {
  r.run(`currentView = 'ledger'; openPaperIntake({ forReturnId: ${JSON.stringify(forReturnId)} });
    paperIntake.items = [{ captureId: 'cap0', hash: 'h0', page: ${JSON.stringify(page(0))}, status: 'photo', forReturnId: ${JSON.stringify(forReturnId)} }];`);
  await r.run('paperIntakeRun()');
}
const stored = r => JSON.parse(r.storage.get('bm_paper_results_v1') || '{}').cap0;
const paperOf = r => json(r, `paperFind('paper_290095142', 'cap0').paper`);

test('v8 "disputed": נייר שאינו משתייך לבד להחזרה — מתקבל ונספר על יום הצילום (היום), עם הערה; בקשה אחת; המודפס נשמר בסריקה ובנייר', async () => {
  const r = paperApp([credit142({}, { docDateUnreliable: [{ noteIndex: 0, reason: 'disputed' }] })], { returns: [] });
  await intake(r);
  assert.equal(r.requests.length, 1, 'שום קריאה נוספת בגלל התאריך');
  const p = paperOf(r);
  assert.equal(p.state, 'accepted');
  assert.equal(p.docDay, TODAY);
  assert.deepEqual(p.docDayDefault, { reason: 'disputed', printed: '04/10/2026', day: TODAY, from: 'capture' });
  assert.ok(!(p.review && p.review.notes || []).some(t => /תאריך/.test(t)), 'התאריך אינו "דבר לבדוק"');
  const create = r.writes.find(w => w.paperCreate);
  assert.equal(create.paperCreate.scan.doc.docDate, '04/10/2026', 'הסריקה שנשמרת בענן — כפי שנקראה');
  assert.equal(create.paperCreate.paper.docDay, TODAY);
  assert.notEqual(r.run(`currentLedger().states['paper_290095142']`), 'unproven');
  assert.ok(r.run('paperIntakeItemHtml(paperIntake.items[0])').includes(NOTE + ' (נקרא: 04/10/2026)'));
  const card = r.run(`paperCardInHistory(paperFind('paper_290095142').paper, currentLedger(), [], true)`);
  assert.ok(card.includes(NOTE));
});

test('תאריך שלא נקרא (v8 "unreadable", null / "לא ברור" / 31/02) — הנייר לא נעצר: מתקבל כשכל השאר תקין, על היום', async () => {
  for (const docDate of [null, 'לא ברור', '31/02/2026']) {
    const r = paperApp([credit142({ docDate }, { docDateUnreliable: [{ noteIndex: 0, reason: 'unreadable' }] })], { returns: [] });
    await intake(r);
    const p = paperOf(r);
    assert.equal(p.state, 'accepted', String(docDate));
    assert.equal(p.docDay, TODAY);
    assert.equal(p.docDayDefault.reason, 'unreadable');
    assert.equal(p.docDayDefault.printed, docDate);
    assert.ok(!p.review, 'אין מה לבדוק');
    assert.equal(r.requests.length, 1);
    const html = r.run('paperIntakeItemHtml(paperIntake.items[0])');
    assert.ok(html.includes(NOTE) && !html.includes('נקרא:'), 'בלי "נקרא:" כשלא נקרא כלום');
  }
  // שרת v7: אותו נייר, והתאריך לא נקרא גם בקריאה החזקה — ממצא docDate. גם הוא לא עוצר.
  const v7 = credit142({ docDate: null }, { status: 'needs_review', escalationAttempted: true, readCount: 3, issues: [{ noteIndex: 0, field: 'docDate', reason: 'unreadable' }] });
  v7.serviceVersion = 7; delete v7.verification.docDateUnreliable;
  const r = paperApp([v7], { returns: [] });
  await intake(r);
  const p = paperOf(r);
  assert.equal(p.state, 'accepted');
  assert.equal(p.docDay, TODAY);
  assert.equal(p.docDayDefault.reason, 'unreadable');
  assert.equal(r.requests.length, 1);
});

test('v7: ממצא תאריך שנוי במחלוקת בנייר — מתקבל על היום; ותאריך בעתיד — על היום', async () => {
  const v7 = credit142({}, { status: 'needs_review', escalationAttempted: true, readCount: 3, issues: [{ noteIndex: 0, field: 'docDate', reason: 'disagreement' }] });
  v7.serviceVersion = 7; delete v7.verification.docDateUnreliable;
  const r = paperApp([v7], { returns: [] });
  await intake(r);
  assert.equal(paperOf(r).state, 'accepted');
  assert.equal(paperOf(r).docDay, TODAY);
  assert.equal(paperOf(r).docDayDefault.reason, 'disputed');
  const future = paperApp([credit142({ docDate: printed(days(1)) })], { returns: [] });
  await intake(future);
  assert.equal(paperOf(future).state, 'accepted');
  assert.equal(paperOf(future).docDay, TODAY);
  assert.deepEqual(paperOf(future).docDayDefault, { reason: 'future', printed: printed(days(1)), day: TODAY, from: 'capture' });
});

test('תאריך שהקריאות הסכימו עליו (גם מהעבר) — נאמן: היום המודפס, בלי סימן ובלי הערה', async () => {
  const r = paperApp([credit142()]);
  await intake(r);
  const p = paperOf(r);
  assert.equal(p.state, 'accepted');
  assert.equal(p.docDay, '2026-10-04');
  assert.equal(p.docDayDefault, undefined);
  assert.ok(!r.run('paperIntakeItemHtml(paperIntake.items[0])').includes('data-doc-date-note'));
  assert.equal(p.attach.type, 'return'); assert.equal(p.attach.id, R1004);
});

// סבב 3 (החלטת ברמן, D1): היה "יום ההחזרה" — עכשיו יום הצילום: "כשהנהג מביא אותו ואנחנו מצלמים — זה היום שהוא זיכה"
test('נייר שצולם מכרטיס ההחזרה — התאריך שלא נקרא הוא יום הצילום (לא יום ההחזרה); הנייר עדיין משויך להחזרה', async () => {
  const r = paperApp([credit142({ docDate: null }, { docDateUnreliable: [{ noteIndex: 0, reason: 'unreadable' }] })], pinned);
  await intake(r, R1004);
  const p = paperOf(r);
  assert.equal(p.state, 'accepted');
  assert.equal(p.docDay, '2026-10-15', 'יום הצילום');
  assert.deepEqual(p.docDayDefault, { reason: 'unreadable', printed: null, day: '2026-10-15', from: 'capture' }, 'בלי returnId — היום לא נלקח מההחזרה');
  assert.equal(p.attach.type, 'return'); assert.equal(p.attach.id, R1004);
  assert.ok(r.run('paperIntakeItemHtml(paperIntake.items[0])').includes(NOTE));
  assert.ok(!r.run('paperIntakeItemHtml(paperIntake.items[0])').includes('תאריך ההחזרה'));
  // נייר שהודפס אחרי ההחזרה (הנהג לקח אותה יום אחר כך) — לא "בעתיד": נאמן
  const later = paperApp([credit142({ docDate: '05/10/2026' })]);
  await intake(later, R1004);
  assert.equal(paperOf(later).docDay, '2026-10-05');
  assert.equal(paperOf(later).docDayDefault, undefined);
});

test('מה שהעובד הקליד בבדיקת הנייר גובר: היום שלו נשמר, ההערה יורדת; אחרי ריענון — הנייר כפי שנשמר', async () => {
  const storage = new Map();
  const r = paperApp([credit142({ docDate: null }, { docDateUnreliable: [{ noteIndex: 0, reason: 'unreadable' }] })], { storage, offline: true, returns: [] });
  await intake(r);
  assert.equal(stored(r).paper.docDay, TODAY);
  // ריענון: הנייר במכשיר (הענן לא זמין) — אותו יום ואותו סימן, בלי קריאה
  const s = paperApp([credit142()], { storage, offline: true, returns: [] });
  assert.equal(s.run(`paperFind('paper_290095142', 'cap0').paper.docDay`), TODAY);
  assert.equal(s.run(`paperFind('paper_290095142', 'cap0').paper.docDayDefault.reason`), 'unreadable');
  assert.equal(s.requests.length, 0);
  await s.run(`openPaperReview('paper_290095142', 'cap0')`);
  s.run('renderPaperReview()');
  assert.ok(s.node('app').innerHTML.includes(NOTE), 'ההערה ליד שדה התאריך');
  s.run(`paperUiInput({ id: 'reviewDay', value: '2026-10-04', dataset: {}, getAttribute: () => null })`);
  assert.equal(s.run('paperReviewState().ok'), true);
  await s.run('savePaperReview()');
  const p = json(s, `paperFind('paper_290095142', 'cap0').paper`);
  assert.equal(p.docDay, '2026-10-04');
  assert.equal(p.docDayDefault, null);
  assert.equal(p.docDayBy, 'user');
  assert.equal(s.run(`paperDayDefaultNote(paperFind('paper_290095142', 'cap0').paper)`), '');
  // נייר שכבר בענן: העדכון מוריד את הסימן ושומר שהיום של העובד
  const c = paperApp([credit142({}, { docDateUnreliable: [{ noteIndex: 0, reason: 'disputed' }] })], { returns: [] });
  await intake(c);
  await c.run(`openPaperReview('paper_290095142')`);
  c.run(`paperUiInput({ id: 'reviewDay', value: '2026-10-03', dataset: {}, getAttribute: () => null })`);
  await c.run('savePaperReview()');
  const upd = c.writes.find(w => w.op === 'update' && w.path && w.path.at(-1) === 'paper_290095142');
  assert.ok(upd);
  assert.equal(upd.data.docDay, '2026-10-03'); assert.equal(upd.data.docDayDefault, null); assert.equal(upd.data.docDayBy, 'user');
  // טלפון בגרסה ישנה שינה את היום ולא מחק את הסימן — ההערה כבר לא שלו
  assert.equal(c.run(`paperDayDefaultNote({ docDay: '2026-10-03', docDayDefault: { reason: 'disputed', day: '${TODAY}', from: 'receiving' } })`), '');
});

test('קריאת האימות של האפליקציה (בתשלום, על זהות) קראה יום אחר — התאריך שנוי במחלוקת; אותו יום — נאמן', async () => {
  const first = credit142({}, {});
  Object.assign(first.scan.documents[0].rows[3], { itemCode: '99999', barcode: '7290000099999' }); // קוד שלא בקטלוג — קריאת אימות
  const verify = (docDate) => {
    const v = credit142({ docDate }, { status: 'verified', escalationAttempted: true, primaryReads: 0, readCount: 1, docDateUnreliable: [] });
    v.reads = [{ model: 'sol', escalation: true }];
    return v;
  };
  const r = paperApp([first, verify('05/10/2026')], { returns: [] });
  await intake(r);
  assert.equal(r.requests.length, 2, 'האימות בתשלום נשלח על הזהות, לא על התאריך');
  assert.ok(JSON.parse(r.requests[1].body).verificationTargets.every(t => t.field !== 'docDate'));
  assert.equal(paperOf(r).docDay, TODAY);
  assert.equal(paperOf(r).docDayDefault.reason, 'disputed');
  assert.equal(paperOf(r).docDayDefault.printed, '05/10/2026');
  const same = paperApp([first, verify('04/10/2026')], { returns: [] });
  await intake(same);
  assert.equal(paperOf(same).docDay, '2026-10-04');
  assert.equal(paperOf(same).docDayDefault, undefined);
});

// ===== תעודת משלוח מקליטת הניירות → קליטה =====
function deliveryV8(extra, flag) {
  const p = delivery('77001234', extra);
  p.serviceVersion = 8;
  p.verification.docDateUnreliable = flag ? [{ noteIndex: 0, reason: flag }] : [];
  return p;
}

test('תעודת משלוח מאתמול שהתאריך שלה שנוי במחלוקת — הקליטה החדשה של היום (לא מאמצת את היום המודפס); נאמנה — מאמצת כמו קודם', async () => {
  const r = oneButtonApp(deliveryV8({ docDate: printed(days(-1)) }, 'disputed'));
  await receive(r);
  assert.equal(state(r).st, 'ok');
  assert.equal(r.run('receiptDocDate'), null, 'הקליטה של היום');
  assert.equal(r.run('activeReceiptDate()'), TODAY);
  const p = json(r, `paperFind('paper_77001234').paper`);
  assert.equal(p.docDay, TODAY);
  assert.equal(p.docDayDefault.reason, 'disputed');
  assert.equal(r.run('receiptScanDateDoubts().length'), 1);
  assert.equal(r.run('aiScanResponse.scan.documents[0].docDate'), printed(days(-1)), 'המודפס בקליטה — כפי שנקרא');
  assert.equal(r.requests.length, 1);
  const y = oneButtonApp(deliveryV8({ docDate: printed(days(-1)) }, null));
  await receive(y);
  assert.equal(y.run('receiptDocDate'), iso(days(-1)), 'תאריך נאמן מאתמול — הקליטה על התאריך של הנייר, כמו קודם');
});

test('נייר שנשמר בגרסה ישנה עם היום המודפס, והקריאה שלו שנויה במחלוקת — לא נכנס כיום הקליטה; יום שהעובד אישר — כן', async () => {
  const r = oneButtonApp(deliveryV8({ docDate: printed(days(-1)) }, 'disputed'));
  await readPapers(r);
  const scan = json(r, 'paperIntake.items[0].scan');
  const install = (src) => {
    const b = oneButtonApp(delivery());
    b.run(`receivingInstallDelivery(${JSON.stringify(scan)}, ${JSON.stringify({ paperId: 'paper_77001234', captureId: 'cap0', number: '77001234', ...src })}, 'replace')`);
    return b;
  };
  const old = install({ docDay: iso(days(-1)), dayDefault: false, dayConfirmed: false });
  assert.equal(old.run('receiptDocDate'), null, 'היום המודפס שנוי במחלוקת — הקליטה של היום');
  assert.equal(old.run('receiptScanDateDoubts().length'), 1);
  const typed = install({ docDay: iso(days(-2)), dayDefault: false, dayConfirmed: true });
  assert.equal(typed.run('receiptDocDate'), iso(days(-2)), 'היום שהעובד קבע בבדיקת הנייר');
  assert.equal(typed.run('aiScanResponse.scan.documents[0].__bermanDocDateConfirmed'), iso(days(-2)));
  assert.equal(typed.run('aiScanResponse.scan.documents[0].docDate'), printed(days(-1)), 'המודפס לא נדרס');
  assert.equal(typed.run('receiptScanDateDoubts().length'), 0, 'בלי הערה — העובד קבע');
});

test('צירוף נייר לקליטה שנשמרה בלי תעודה (מלפני יומיים): התאריך שלא נקרא הוא היום של הקליטה ההיא — נכנס בלי שאלה', async () => {
  const day = iso(days(-2));
  const bare = { id: 'rc_bare', date: day, docDate: day, noDoc: true, noteParts: [], items: [{ productId: 'code_101', name: 'אחיד', qty: 12 }], timestamp: 1 };
  const a = oneButtonApp(deliveryV8({ docDate: null }, 'unreadable'), { receipts: [bare] });
  a.run(`reopenReceiptForDoc('rc_bare')`);
  assert.equal(a.run('receiptDocDate'), day);
  await readPapers(a);
  assert.equal(a.run('testConfirms.length'), 0, 'בלי שאלה');
  assert.equal(state(a).st, 'ok'); assert.equal(a.run('receiptAttachTarget.id'), 'rc_bare');
  assert.equal(a.run('receiptDocDate'), day);
  const p = json(a, `paperFind('paper_77001234').paper`);
  assert.equal(p.docDay, day, 'היום של הקליטה השמורה');
  assert.equal(p.docDayDefault.reason, 'unreadable');
  // בלי צירוף: קליטה פתוחה מלפני שבוע (בלי תעודה) — הנייר הוא של היום, ונשאלים כמו תמיד
  const o = oneButtonApp(deliveryV8({ docDate: null }, 'unreadable'));
  o.run(`receiptNoDoc = true; receiptOpened = true; receiptEntryMode = 'manual'; receiptDocDate = '${iso(days(-7))}'; receiptList = [{ productId: 'code_101', name: 'x', barcode: '', qty: 7 }]; saveReceiptDraft();`);
  await readPapers(o);
  assert.equal(json(o, `paperFind('paper_77001234').paper`).docDay, TODAY);
  assert.equal(o.run('receiptNoDoc'), true, 'לא נכנסה לבד לקליטה מלפני שבוע');
});

test('טביעת הנייר של קליטה שמורה: גם היום של הקליטה כשהתאריך שנוי במחלוקת — נייר בלי מספר שנקבע לאותו יום נמצא בה', async () => {
  const r = oneButtonApp(deliveryV8({ docDate: printed(days(-1)) }, 'disputed'));
  await receive(r);
  const doc = json(r, 'aiScanResponse.scan.documents[0]');
  const rc = { id: 'rc_x', date: TODAY, docDate: TODAY, timestamp: 1, paperDocs: [], items: [], paperScan: { response: { scan: { documents: [doc] } } } };
  const prints = json(r, `receiptScanFingerprints(${JSON.stringify(rc)})`);
  assert.equal(prints.length, 2, 'המודפס והיום של הקליטה');
  const rows = doc.__pricePaper.rows.map(x => ({ itemCode: x.itemCode, barcode: x.barcode, qty: x.quantity }));
  assert.ok(prints.includes(r.run(`paperFingerprint(${JSON.stringify({ docDay: TODAY, rows })})`)));
  assert.ok(prints.includes(r.run(`paperFingerprint(${JSON.stringify({ docDay: iso(days(-1)), rows })})`)), 'נייר שנשמר בגרסה קודמת ביום המודפס');
  // נאמן — טביעה אחת, כמו קודם
  const t = oneButtonApp(deliveryV8({ docDate: printed(days(-1)) }, null));
  await receive(t);
  const tdoc = json(t, 'aiScanResponse.scan.documents[0]');
  assert.equal(json(t, `receiptScanFingerprints(${JSON.stringify({ ...rc, paperScan: { response: { scan: { documents: [tdoc] } } } })})`).length, 1);
  assert.deepEqual(plain(t.run('receiptScanDateDoubts()')), []);
});

// ===== אחרי הסקירה =====

// סבב 3 (החלטת ברמן, D1): היה "היום של ההחזרה" — עכשיו יום הצילום, גם כשהנייר משתייך לבד להחזרה
test('נייר זיכוי שהתאריך שלו לא נקרא היטב ומשתייך לבד להחזרה — יום הצילום (לא היום של ההחזרה); עדיין משויך אליה ונספר', async () => {
  for (const [reason, resp] of [['disputed', credit142({ docDate: '06/10/2026' }, { docDateUnreliable: [{ noteIndex: 0, reason: 'disputed' }] })],
    ['unreadable', credit142({ docDate: null }, { docDateUnreliable: [{ noteIndex: 0, reason: 'unreadable' }] })]]) {
    const r = paperApp([resp], pinned);
    assert.equal(r.run('todayStr()'), '2026-10-15');
    await intake(r);
    const p = paperOf(r);
    assert.equal(p.state, 'accepted', reason);
    assert.equal(p.attach.type, 'return'); assert.equal(p.attach.id, R1004);
    assert.equal(p.docDay, '2026-10-15', 'יום הצילום — לא היום של ההחזרה');
    assert.deepEqual(p.docDayDefault, { reason, printed: reason === 'disputed' ? '06/10/2026' : null, day: '2026-10-15', from: 'capture' });
    assert.ok(r.run('paperIntakeItemHtml(paperIntake.items[0])').includes(NOTE));
    assert.equal(r.requests.length, 1, 'בלי קריאה נוספת');
    assert.equal(r.run(`currentLedger().states['paper_290095142']`), 'counted');
    assert.equal(r.run(`currentLedger().placed.find(x => x.id === 'paper_290095142').docDay`), '2026-10-15', 'במאזן — יום הצילום');
  }
  // אותו נייר בלי החזרה שהוא משתייך אליה — גם יום הצילום
  const none = paperApp([credit142({ docDate: null }, { docDateUnreliable: [{ noteIndex: 0, reason: 'unreadable' }] })], { ...pinned, returns: [] });
  await intake(none);
  assert.equal(paperOf(none).docDay, '2026-10-15');
  assert.equal(paperOf(none).docDayDefault.from, 'capture');
});

// סבב 3 (D1): היה "נשאר בחודש של ההחזרה" — עכשיו יום שנקבע נספר במרכזת בדיוק כמו יום מודפס (גם המחיר — לפי היום הזה)
test('המרכזת: נייר זיכוי שהיום שלו נקבע (התאריך לא נקרא היטב) — כמו נייר שהודפס באותו יום: בחודש אחר מההחזרה — ביום שלו', () => {
  const r = paperApp([credit142()], pinned);
  const row = (line, code, qty) => ({ line, itemCode: code, barcode: null, description: '', qty, productId: 'code_' + code });
  const mk = (docDay, extra = {}) => ({ schema: 1, state: 'accepted', timestamp: 5, id: 'paper_290099999', kind: 'credit', number: '290099999', docDay,
    rows: [row(1, '2381', 3), row(2, '2387', 2)], ...extra });
  const matrix = p => json(r, `(() => { const p = ${JSON.stringify(p)};
    const lg = paperLedger({ recs: receipts, rets: returns, papers: [p], from: '2026-09-01', asOf: '2026-10-05' });
    return { attach: ((lg.placed || []).find(x => x.id === p.id) || {}).attach || null,
      adj: ledgerMatrixAdjust(lg, '2026-09-01', '2026-10-05', [p]).filter(x => x.papers.includes(p.id)).map(x => [x.key, x.day, x.credit]) }; })()`);
  const R0928 = 'returns_9f0d5217-6358-479f-82c8-42200d902895';
  const real = matrix(mk('2026-09-29'));
  assert.equal(real.attach.id, R0928);
  assert.deepEqual(real.adj.map(x => x.slice(0, 2)), [['code_2381', '2026-09-28']], 'הודפס ב-29.9 — ביום ההחזרה');
  const printedOct = matrix(mk('2026-10-01'));
  assert.deepEqual(printedOct.adj.map(x => x.slice(0, 2)), [['code_2381', '2026-10-01']], 'הודפס ב-1.10 — ביום המודפס (כלל v128)');
  const defaulted = matrix(mk('2026-10-01', { docDayDefault: { reason: 'disputed', printed: '29/09/2026', day: '2026-10-01', from: 'capture' } }));
  assert.equal(defaulted.attach.id, R0928);
  assert.deepEqual(defaulted.adj, printedOct.adj, 'יום הצילום — בדיוק כמו יום מודפס: הזיכוי באוקטובר, באותו יום ובאותה כמות');
  // גם יום שנקבע במעבר מגרסה 141
  assert.deepEqual(matrix(mk('2026-10-01', { docDayDefault: { reason: 'unreadable', printed: null, day: '2026-10-01', from: 'migration' } })).adj, printedOct.adj);
});

test('תעודת משלוח שהיום שלה נקבע, וקליטה מאתמול נשמרה בלי תעודה — נשאלים אם לצרף אליה, לא נפתחת קליטה שנייה לבד', async () => {
  const day = iso(days(-1));
  const bare = { id: 'rc_bare', date: day, docDate: day, noDoc: true, noteParts: [], items: [{ productId: 'code_101', name: 'אחיד', qty: 12 }], timestamp: 1 };
  const a = oneButtonApp(deliveryV8({ docDate: null }, 'unreadable'), { receipts: [bare] });
  await readPapers(a);
  assert.equal(a.run('receiptOpened'), false, 'לא נפתחה קליטה לסחורה שכבר נספרה');
  assert.equal(a.run('aiScanDocuments.length'), 0);
  assert.equal(a.run('paperIntake.items[0].join.reason'), 'bare');
  assert.ok(a.run('paperIntakeItemHtml(paperIntake.items[0])').includes('קליטה חדשה לתעודה הזאת'), 'אפשר גם לפתוח קליטה חדשה');
  assert.equal(a.run('testConfirms.length'), 0, 'בלי חלון — רק הכרטיס');
  assert.equal(json(a, `paperFind('paper_77001234').paper`).docDay, TODAY);
  // "לקליטה" → "צרף" — נכנסת לקליטה שנשמרה בלי תעודה
  const { join, confirmLast } = await import('./one-button-helpers.mjs');
  await join(a, 'paper_77001234', 'cap0');
  await confirmLast(a);
  assert.equal(a.run('receiptAttachTarget && receiptAttachTarget.id'), 'rc_bare');
  assert.equal(a.run('aiScanDocuments.length'), 1);
  // בלי קליטה כזו בשבוע האחרון — שואלים אם לפתוח קליטה (שאלה בכרטיס, לא תאריך להקליד)
  const b = oneButtonApp(deliveryV8({ docDate: null }, 'unreadable'));
  await readPapers(b);
  assert.equal(b.run('receiptOpened'), false);
  assert.equal(b.run('paperIntake.items[0].join.reason'), 'date-new');
  assert.match(b.run('paperIntake.items[0].join.text'), /תאריך התעודה לא נקרא בוודאות/);
  await join(b, 'paper_77001234', 'cap0');
  await confirmLast(b);
  assert.equal(b.run('receiptOpened'), true);
  assert.equal(b.run('receiptDocDate'), null, 'הקליטה של היום');
  // "קליטה חדשה לתעודה הזאת" — העובד כבר בחר: נפתחת בלי שאלה נוספת
  const c = oneButtonApp(deliveryV8({ docDate: null }, 'unreadable'), { receipts: [bare] });
  await readPapers(c);
  c.run(`paperUiClick({ dataset: { role: 'ledger-start-receiving', paper: 'paper_77001234', cap: 'cap0', new: '1' } })`);
  await c.run('paperJoinChain');
  assert.equal(c.run('testConfirms.length'), 0);
  assert.equal(c.run('receiptOpened'), true);
  assert.equal(c.run('receiptAttachTarget'), null);
  // שומר: תעודה שנקראה מהיום — נפתחת לה קליטה לבד, כמו קודם
  const t = oneButtonApp(deliveryV8({}, null));
  await readPapers(t);
  assert.equal(t.run('receiptOpened'), true);
});

// סבב 3 (D1): היה "לא נכנס לבד" — נייר קטן שהיום שלו נקבע (יום הצילום) נכנס כמו נייר קטן שהודפס ביום הצילום
test('נייר "ת.משלוח" קטן שהיום שלו נקבע — כמו נייר קטן שהודפס ביום הצילום: נכנס לבד לקליטה הפתוחה מאתמול (אותו חודש, v130)', async () => {
  const r = oneButtonApp(deliveryV8({ docDate: '14/10/2026' }, null), pinned);
  await receive(r);
  assert.equal(r.run('todayStr()'), '2026-10-15');
  assert.equal(r.run('receiptDocDate'), '2026-10-14', 'הקליטה הפתוחה מאתמול');
  const scan = json(r, `paperIntake.items[0].scan`);
  const base = json(r, `paperFind('paper_77001234').paper`);
  const route = paper => json(r, `receivingDeliveryRoute(${JSON.stringify(scan)}, ${JSON.stringify(paper)}, null, {})`);
  const small = { ...base, id: 'paper_290012345', number: '290012345', captureId: 'capS', small: true, docDay: '2026-10-15' };
  assert.equal(route(small).action, 'append', 'נייר קטן שהודפס היום, באותו חודש — נכנס לבד (v130)');
  assert.equal(route({ ...small, docDayDefault: { reason: 'unreadable', printed: null, day: '2026-10-15', from: 'capture' } }).action, 'append', 'יום הצילום — כמו יום מודפס');
  // שומר: תעודת משלוח (לא קטנה) שהיום שלה נקבע — היום שלה הוא של הקליטה שהיא נכנסת אליה, ולכן שואלים (D2)
  const big = route({ ...base, id: 'paper_77005555', number: '77005555', captureId: 'capB', docDay: '2026-10-15', docDayDefault: { reason: 'unreadable', printed: null, day: '2026-10-15', from: 'capture' } });
  assert.equal(big.action, 'ask');
  assert.equal(big.reason, 'other-receiving');
});

test('קריאת האימות של האפליקציה: קריאה בלי תאריך לא מאשרת ולא חולקת — תאריך שנקרא טוב לא נזרק', async () => {
  const unknownRow = resp => { Object.assign(resp.scan.documents[0].rows[3], { itemCode: '99999', barcode: '7290000099999' }); return resp; };
  const verify = (docDate, flag, extra = {}) => {
    const v = credit142({ docDate }, { status: 'verified', escalationAttempted: true, primaryReads: 0, readCount: 1, docDateUnreliable: flag ? [{ noteIndex: 0, reason: flag }] : [], ...extra });
    v.reads = [{ model: 'sol', escalation: true }];
    return v;
  };
  // A: הקריאה הראשונה לא קראה תאריך; קריאת האימות קראה 04/10 ואין קריאה שחולקת עליה — נאמן
  const a = paperApp([unknownRow(credit142({ docDate: null }, { docDateUnreliable: [{ noteIndex: 0, reason: 'unreadable' }] })), verify('04/10/2026')], { returns: [] });
  await intake(a);
  assert.equal(a.requests.length, 2);
  assert.equal(paperOf(a).docDay, '2026-10-04');
  assert.equal(paperOf(a).docDayDefault, undefined);
  // B: שתי הקריאות הזולות הסכימו על 04/10; קריאת האימות לא קראה תאריך — היום שהן קראו נשאר; המודפס של הקריאה החדשה לא נדרס
  const b = paperApp([unknownRow(credit142()), verify(null, 'unreadable')], { returns: [] });
  await intake(b);
  assert.equal(b.requests.length, 2);
  assert.equal(paperOf(b).docDay, '2026-10-04');
  assert.equal(paperOf(b).docDayDefault, undefined);
  const kept = json(b, 'paperIntake.items[0].scan.doc');
  assert.equal(kept.docDate, null, 'docDate של הקריאה שנשמרה — כפי שנקרא');
  assert.equal(kept.__bermanDocDateRead, '2026-10-04');
  // B מול שרת v7: קריאת האימות לא הוכרעה (needs_review עם ממצא תאריך) — נשארת הקריאה הקודמת, והממצא שלה לא נדבק אליה
  const v7 = verify(null, null, { status: 'needs_review', issues: [{ noteIndex: 0, field: 'docDate', reason: 'unreadable' }] });
  v7.serviceVersion = 7; delete v7.verification.docDateUnreliable;
  const first7 = unknownRow(credit142({}, {})); first7.serviceVersion = 7; delete first7.verification.docDateUnreliable;
  const b7 = paperApp([first7, v7], { returns: [] });
  await intake(b7);
  assert.equal(b7.requests.length, 2);
  assert.equal(paperOf(b7).docDay, '2026-10-04');
  assert.equal(paperOf(b7).docDayDefault, undefined);
  assert.ok(!json(b7, 'paperIntake.items[0].scan.doc.__bermanOcrVerification.issues').some(i => i.field === 'docDate'));
  // שומר: התאריך של הקריאה הקודמת היה שנוי במחלוקת — לא נשאר כשקריאת האימות לא קראה תאריך
  const d = paperApp([unknownRow(credit142({}, { docDateUnreliable: [{ noteIndex: 0, reason: 'disputed' }] })), verify(null, 'unreadable')], { returns: [] });
  await intake(d);
  assert.equal(paperOf(d).docDay, TODAY);
  assert.equal(paperOf(d).docDayDefault.reason, 'unreadable');
  // כל בקשת סריקה אומרת לשרת שהאפליקציה קובעת יום לתאריך שלא נקרא היטב (dateDefaults) — גם בקשת האימות
  assert.ok(b.requests.every(q => JSON.parse(q.body).dateDefaults === true));
  assert.equal(JSON.parse(b.requests[1].body).mode, 'verify');
});

// ===== אחרי סבב הסקירה השני =====
// כל בדיקה כאן נכשלת כשהתיקון שלה מוחזר.
const saveReceipt = async r => {
  r.run('finishReceipt()');
  assert.ok(r.run('!!pendingReceipt'), 'הסיכום נפתח');
  await r.run('confirmReceipt()');
  const saved = r.writes.filter(w => w.op === 'set' && w.path && w.path.at(-2) === 'receipts').at(-1);
  assert.ok(saved, 'הקליטה נשמרה');
  return saved;
};
const verifyRead = (docDate, flag, extra = {}) => {
  const v = credit142({ docDate }, { status: 'verified', escalationAttempted: true, primaryReads: 0, readCount: 1, docDateUnreliable: flag ? [{ noteIndex: 0, reason: flag }] : [], ...extra });
  v.reads = [{ model: 'sol', escalation: true }];
  return v;
};
const withUnknownRow = resp => { Object.assign(resp.scan.documents[0].rows[3], { itemCode: '99999', barcode: '7290000099999' }); return resp; };

test('שרת v8 docDateRead: הקריאה הסופית לא קראה תאריך, והקריאה האחרת קראה יום שאף קריאה לא חולקת עליו — היום הזה נאמן (לא נקבע יום הקליטה), והמודפס לא נדרס', async () => {
  const r = paperApp([credit142({ docDate: null }, { docDateRead: [{ noteIndex: 0, day: '2026-10-04' }] })], { returns: [] });
  await intake(r);
  const p = paperOf(r);
  assert.equal(p.state, 'accepted');
  assert.equal(p.docDay, '2026-10-04', 'היום שנקרא');
  assert.equal(p.docDayDefault, undefined);
  const kept = json(r, 'paperIntake.items[0].scan.doc');
  assert.equal(kept.docDate, null, 'docDate כפי שנקרא');
  assert.equal(kept.__bermanDocDateRead, '2026-10-04');
  // תעודת משלוח מאתמול שהקריאה הסופית שלה פספסה את התאריך — הקליטה החדשה מאמצת את היום (תעודה של אתמול), כמו תאריך נאמן
  const resp = deliveryV8({ docDate: null }, null);
  resp.verification.docDateRead = [{ noteIndex: 0, day: iso(days(-1)) }];
  const y = oneButtonApp(resp);
  await receive(y);
  assert.equal(y.run('receiptDocDate'), iso(days(-1)), 'הקליטה על היום שנקרא — לא על יום הצילום');
  assert.equal(y.run('receiptScanDateDoubts().length'), 0);
  // קריאת האימות של האפליקציה (על זהות) לא קראה תאריך — היום שנמסר ב-docDateRead נשאר
  const v = paperApp([withUnknownRow(credit142({ docDate: null }, { docDateRead: [{ noteIndex: 0, day: '2026-10-04' }] })), verifyRead(null, 'unreadable')], { returns: [] });
  await intake(v);
  assert.equal(v.requests.length, 2);
  assert.equal(paperOf(v).docDay, '2026-10-04');
  assert.equal(paperOf(v).docDayDefault, undefined);
  assert.equal(json(v, 'paperIntake.items[0].scan.doc').__bermanDocDateRead, '2026-10-04');
  // שומר: יום ב-docDateRead לא נכנס כשהקריאה הסופית קראה תאריך משלה, ולא כשהוא אינו יום אמיתי
  const own = paperApp([credit142({ docDate: '05/10/2026' }, { docDateRead: [{ noteIndex: 0, day: '2026-10-04' }] })], { returns: [] });
  await intake(own);
  assert.equal(paperOf(own).docDay, '2026-10-05');
  assert.equal(json(own, 'paperIntake.items[0].scan.doc').__bermanDocDateRead, undefined);
  const junk = paperApp([credit142({ docDate: null }, { docDateUnreliable: [{ noteIndex: 0, reason: 'unreadable' }], docDateRead: [{ noteIndex: 0, day: '2026-02-31' }] })], { returns: [] });
  await intake(junk);
  assert.equal(paperOf(junk).docDay, TODAY);
  assert.equal(paperOf(junk).docDayDefault.reason, 'unreadable');
});

test('שרת v7: קריאת האימות של האפליקציה שנשארה needs_review רק כי אין בה תאריך — מתקבלת (השורה שתוקנה נכנסת), התאריך כמו בקריאה בלי תאריך', async () => {
  const v7 = (issues) => { const v = verifyRead(null, null, { status: 'needs_review', issues }); v.serviceVersion = 7; delete v.verification.docDateUnreliable; return v; };
  const first7 = () => { const f = withUnknownRow(credit142({}, {})); f.serviceVersion = 7; delete f.verification.docDateUnreliable; return f; };
  const r = paperApp([first7(), v7([{ noteIndex: 0, field: 'docDate', reason: 'unreadable' }])], { returns: [] });
  await intake(r);
  assert.equal(r.requests.length, 2);
  const p = paperOf(r);
  assert.equal(p.state, 'accepted', 'השורה תוקנה — שום דבר לא עוצר');
  assert.ok(p.rows.every(x => x.productId), 'כל השורות זוהו');
  assert.ok(!p.review);
  assert.equal(p.docDay, '2026-10-04', 'היום שהקריאות הקודמות קראו');
  assert.equal(p.docDayDefault, undefined);
  const doc = json(r, 'paperIntake.items[0].scan.doc');
  assert.equal(p.rows[3].itemCode, '238', 'הקריאה של האימות נשמרה');
  assert.equal(doc.docDate, null, 'המודפס כפי שנקרא');
  assert.equal(doc.__bermanOcrVerification.status, 'verified');
  assert.ok(!doc.__bermanOcrVerification.issues.some(i => i.field === 'docDate'));
  // שומר: ממצא תאריך לצד ממצא אחר — הקריאה לא אומתה, הקריאה הקודמת נשארת (והממצא על התאריך לא נדבק אליה)
  const g = paperApp([first7(), v7([{ noteIndex: 0, field: 'docDate', reason: 'unreadable' }, { noteIndex: 0, field: 'quantity', reason: 'unreadable', rowIndex: 0, sourcePage: 1, lineNumber: 1 }])], { returns: [] });
  await intake(g);
  assert.equal(paperOf(g).state, 'needs-review');
  const kept = json(g, 'paperIntake.items[0].scan.doc');
  assert.equal(paperOf(g).rows[3].itemCode, '99999', 'הקריאה הקודמת');
  assert.ok(!kept.__bermanOcrVerification.issues.some(i => i.field === 'docDate'));
});

// סבב 3 (D1): היה "היום הולך אחרי ההחזרה" (paperDayFollowLinked, docDayDefault.returnId) — הוסר: יום הצילום הוא היום
test('נייר זיכוי שהיום שלו נקבע — כשתאריך ההחזרה נקבע אחר כך (openReturnDateEdit), היום של הנייר לא זז: יום הצילום, כמו יום מודפס', async () => {
  const rets = L.returns.map(x => x.id === R1004 ? { ...x, docDate: '2026-10-03' } : x);
  for (const forReturn of ['', R1004]) {
    const r = paperApp([credit142({ docDate: null }, { docDateUnreliable: [{ noteIndex: 0, reason: 'unreadable' }] })], { ...pinned, returns: rets });
    await intake(r, forReturn);
    const p = paperOf(r);
    assert.equal(p.attach.id, R1004, forReturn || 'בלי כרטיס');
    assert.equal(p.docDay, '2026-10-15');
    assert.equal(p.docDayDefault.returnId, undefined, 'היום לא נלקח מההחזרה');
    // העובד קובע לתעודת ההחזרה את התאריך המודפס (4.10)
    r.run(`returns = returns.map(x => x.id === '${R1004}' ? { ...x, docDate: '2026-10-04' } : x); ledgerInvalidate();`);
    const lg = json(r, `(() => { const lg = currentLedger(); const pl = lg.placed.find(x => x.id === 'paper_290095142');
      return { st: lg.states['paper_290095142'], attach: pl && pl.attach, day: pl && pl.docDay }; })()`);
    assert.equal(lg.st, 'counted');
    assert.equal(lg.day, '2026-10-15', 'היום של הנייר לא הולך אחרי ההחזרה');
    assert.equal(lg.attach.type, 'return');
    assert.equal(lg.attach.id, R1004);
  }
});

test('כפילות: אותו נייר צולם שוב — המספר נקרא בספרה שגויה והתאריך לא נקרא (היום נקבע) — נספר פעם אחת; שני צילומים מטושטשים של אותו מספר בימים שונים — "אותו נייר", לא התנגשות', async () => {
  const r = paperApp([credit142()], pinned);
  const rows = [['101', 13], ['233', 1], ['344', 2], ['238', 1]].map(([code, qty], i) => ({ line: i + 1, itemCode: code, barcode: null, description: '', qty, productId: 'code_' + code }));
  const A = { schema: 1, state: 'accepted', timestamp: 1, id: 'paper_290095142', kind: 'credit', number: '290095142', numerator: '95142', docDay: '2026-10-04', rows };
  const B = { ...A, id: 'paper_290095147', number: '290095147', timestamp: 2, docDay: '2026-10-15', docDayDefault: { reason: 'unreadable', printed: null, day: '2026-10-15', from: 'receiving' } };
  const states = ps => json(r, `paperLedger({ recs: receipts, rets: returns, papers: ${JSON.stringify(ps)}, from: '2026-09-01', asOf: '2026-10-15' }).states`);
  let st = states([A, B]);
  assert.equal(st[A.id], 'counted');
  assert.equal(st[B.id], 'duplicate', 'אותו נייר — היום שנקבע אינו יום מודפס');
  // גם כשהנייר שנקבע לו יום קודם בסדר (יום ההחזרה) — אחד בלבד נספר, והוא זה עם התאריך שנקרא
  st = states([A, { ...B, docDay: '2026-10-03', docDayDefault: { ...B.docDayDefault, day: '2026-10-03' } }]);
  assert.equal(st[A.id], 'counted');
  assert.equal(st[B.id], 'duplicate');
  // שומר: שני ניירות אמיתיים (כל מספר תואם לנומרטור שלו) — שניהם נספרים, גם כשהיום של אחד נקבע
  st = states([A, { ...B, numerator: '95147' }]);
  assert.equal(st[B.id], 'counted');
  // שומר: בלי יום שנקבע — ימים שונים הם ניירות שונים (כמו קודם)
  st = states([A, { ...B, docDayDefault: undefined }]);
  assert.equal(st[B.id], 'counted');
  // הכתיבה לענן: אותו מספר, צילום אחר, היום נקבע בשני ימים שונים — אותו נייר ("duplicate"), לא "נייר אחר כבר נשמר"
  const store = new Map();
  const cloud = runtime({ globals: {
    doc: (_db, ...seg) => ({ path: seg.join('/'), id: seg.at(-1) }),
    runTransaction: async (_db, fn) => fn({ get: async ref => ({ id: ref.id, exists: () => store.has(ref.path), data: () => structuredClone(store.get(ref.path)) }),
      set: (ref, d) => store.set(ref.path, structuredClone(d)) }) } });
  const blur = (day, cap) => ({ ...A, numerator: null, captureId: cap, docDay: day, docDayDefault: { reason: 'unreadable', printed: null, day, from: 'receiving' } });
  assert.equal(await cloud.run(`executePaperCreateTask(${JSON.stringify({ id: A.id, paper: blur('2026-10-14', 'c1') })})`), 'created');
  assert.equal(await cloud.run(`executePaperCreateTask(${JSON.stringify({ id: A.id, paper: blur('2026-10-15', 'c2') })})`), 'duplicate');
  // שומר: שורות אחרות באותו מספר — עדיין התנגשות
  await assert.rejects(cloud.run(`executePaperCreateTask(${JSON.stringify({ id: A.id, paper: { ...blur('2026-10-15', 'c3'), rows: rows.slice(1) } })})`), e => e.code === 'paper-conflict');
  // צילום של אותו נייר שקרא את התאריך המודפס — מחליף את השמור עם היום שנקבע (לא נזרק כ"כפילות")
  assert.equal(await cloud.run(`executePaperCreateTask(${JSON.stringify({ id: A.id, paper: { ...A, captureId: 'c4' } })})`), 'replaced');
  assert.equal([...store.values()].find(x => x.captureId === 'c4').docDay, '2026-10-04');
  // ושוב צילום מטושטש אחריו — כפילות, לא דורס את היום שנקרא
  assert.equal(await cloud.run(`executePaperCreateTask(${JSON.stringify({ id: A.id, paper: blur('2026-10-16', 'c5') })})`), 'duplicate');
  assert.ok([...store.values()].some(x => x.captureId === 'c4'));
});

test('זוג תיקון (חיוב שמבטל זיכוי): נייר שהיום שלו נקבע לא מפספס את הזוג רק בגלל היום', () => {
  const r = paperApp([credit142()], pinned);
  const c = json(r, `(() => {
    const day = '2026-10-04', R = { rows: { code_101: { sent: 13, cred: 13 }, code_344: { sent: 2, cred: 2 }, code_349: { sent: 5, cred: 5 }, code_233: { sent: 0, cred: 1 } }, credited: true };
    const credit = { id: 'paper_c', kind: 'credit', docDay: day, numerator: '95142', rows: [{ itemCode: '233', qty: 1, productId: 'code_233' }],
      attach: { type: 'return', id: 'R', rowTargets: [{ line: 0, type: 'return', id: 'R' }] } };
    const charge = { id: 'paper_h', kind: 'charge', docDay: '2026-10-15', numerator: '95143', rows: [{ itemCode: '238', qty: 1, productId: 'code_238' }],
      docDayDefault: { reason: 'unreadable', printed: null, day: '2026-10-15', from: 'receiving' } };
    const ctx = { placed: [credit], docOf: (t, id) => id === 'R' ? R : null, mainOf: {}, pendingRets: new Set(), unsureDays: new Set(), regNotes: new Set(), recs: [] };
    const key = paperRowKey(charge.rows[0]).key;
    return { defaulted: ledgerCorrectionCandidates(key, charge, 1, ctx).length,
      printed: ledgerCorrectionCandidates(key, { ...charge, docDayDefault: undefined }, 1, ctx).length,
      far: ledgerCorrectionCandidates(key, { ...charge, numerator: '95150' }, 1, ctx).length,
      unsure: ledgerCorrectionCandidates(key, charge, 1, { ...ctx, unsureDays: new Set([day]) }).length };
  })()`);
  assert.equal(c.defaulted, 1, 'נומרטורים סמוכים, היום של החיוב נקבע — הזוג נמצא');
  assert.equal(c.printed, 0, 'שומר: שני ימים מודפסים שונים — לא זוג (כמו קודם)');
  assert.equal(c.far, 0, 'שומר: נומרטור רחוק — לא זוג');
  assert.equal(c.unsure, 0, 'שומר: ספק ביום של נייר הזיכוי — אין תיקון');
});

test('תעודה בלי מספר שהתאריך שלה לא נקרא, שצורפה לקליטה שנשמרה בלי תעודה (מלפני יומיים): היום שלה הוא של הקליטה ההיא, והיא נמצאת בה — לא "ממתינה לקליטה", ולא נפתחת קליטה שנייה', async () => {
  const day = iso(days(-2));
  const resp = deliveryV8({ docDate: null, docNumber: null, internalNumber: null }, 'unreadable');
  resp.verification = { ...resp.verification, status: 'needs_review', issues: [{ noteIndex: 0, field: 'docNumber', reason: 'unreadable' }] };
  const items = resp.scan.documents[0].rows.map(row => { const p = fixture().products.find(x => x.code === row.itemCode); return { productId: p.id, name: p.name, barcode: p.barcode, qty: Number(row.quantity) }; });
  const bare = { id: 'rc_bare', date: day, docDate: day, noDoc: true, noteParts: [], items, timestamp: 1 };
  const a = oneButtonApp(resp, { receipts: [bare] });
  a.finalCloud.put(a.run(`dataPath('receipts', 'rc_bare').join('/')`), bare);
  a.run(`currentView = 'ledger';`); // צולם מהמאזן — הנייר נשמר בענן מיד (לא עם קליטה)
  await readPapers(a);
  assert.ok(a.run(`papers.some(p => p.kind === 'delivery')`), 'הנייר בענן');
  const cloudPath = pid => a.run(`dataPath('papers', '${pid}').join('/')`);
  a.run(`papers.filter(p => p.kind === 'delivery')`).forEach(p => a.finalCloud.put(cloudPath(p.id), JSON.parse(JSON.stringify(p))));
  const id = a.run('paperIntake.items[0].paperId || paperIntake.items[0].paper && paperIntake.items[0].paper.id') || 'paper_cap_cap0';
  assert.equal(json(a, `paperFind('${id}').paper`).docDay, TODAY, 'עד הצירוף — יום הצילום');
  assert.equal(a.run('paperIntake.items[0].join.reason'), 'bare');
  const { join, confirmLast } = await import('./one-button-helpers.mjs');
  await join(a, id, 'cap0');
  await confirmLast(a);
  assert.equal(a.run('receiptAttachTarget && receiptAttachTarget.id'), 'rc_bare');
  // מספר התעודה לא נקרא — מקלידים אותו בבדיקת הקריאה של הקליטה, ושומרים
  a.context.document.querySelectorAll = selector => selector === '[data-ocr-doc]' ? [{ dataset: { ocrDoc: '0', ocrKey: '-1:docNumber' }, value: '77009999' }] : [];
  assert.equal(a.run('bermanConfirmOcr(0)'), true);
  const saved = await saveReceipt(a);
  assert.equal(saved.data.docDate, day, 'הקליטה נשארת של היום שבו נקלטה');
  // היום של הנייר — של הקליטה שצורף אליה (גם בענן)
  await new Promise(res => setImmediate(res));
  const upd = a.writes.filter(w => w.op === 'set' && w.path && w.path.at(-2) === 'papers' && w.path.at(-1) === id).at(-1);
  assert.ok(upd, 'היום של הנייר עודכן בענן');
  assert.equal(upd.data.docDay, day);
  assert.equal(upd.data.docDayDefault.day, day);
  const p = json(a, `paperFind('${id}').paper`);
  assert.equal(p.docDay, day);
  assert.equal(p.docDayDefault.reason, 'unreadable', 'עדיין יום שנקבע (התאריך לא נקרא)');
  assert.equal(a.run(`paperDayDefaultNote(paperFind('${id}').paper)`), NOTE);
  // הקליטה השמורה — הנייר נמצא בה (גם בלי מספר), והמאזן לא מבקש לקלוט אותו שוב
  a.run(`receipts = receipts.filter(x => x.id !== 'rc_bare').concat([${JSON.stringify({ id: 'rc_bare', ...saved.data })}]); ledgerInvalidate();`);
  assert.equal(a.run(`currentLedger().states['${id}']`), 'in-receipt');
  assert.equal(a.run(`paperInSavedReceipt(paperFind('${id}').paper)`), true);
  assert.equal(json(a, `receivingDeliveryRoute(paperIntake.items[0].scan, paperFind('${id}').paper, null, {})`).reason, 'received', 'לא נכנסת לקליטה שנייה');
  // גם נייר שהיום שלו לא עודכן (טלפון בגרסה ישנה / העדכון עוד בדרך) — נמצא בקליטה לפי הזהות
  a.run(`papers = papers.map(x => x.id === '${id}' ? { ...x, docDay: '${TODAY}', docDayDefault: { ...x.docDayDefault, day: '${TODAY}' } } : x); ledgerInvalidate();`);
  assert.equal(a.run(`currentLedger().states['${id}']`), 'in-receipt');
  // שומר: העדכון בענן רק כל עוד היום שם עדיין נקבע — יום שהעובד קבע בינתיים לא נדרס
  const userSet = { ...a.finalCloud.get(cloudPath(id)), docDay: iso(days(-3)), docDayDefault: null, docDayBy: 'user' };
  a.finalCloud.put(cloudPath(id), userSet);
  a.run(`papers = papers.map(x => x.id === '${id}' ? { ...x, docDay: '${TODAY}', docDayDefault: { ...x.docDayDefault, day: '${TODAY}' } } : x);`);
  const before = a.writes.length;
  await a.run(`paperDeliveryDaysFollowReceipt(${JSON.stringify(saved.data)})`);
  assert.equal(a.writes.length, before, 'לא נכתב');
  assert.equal(a.finalCloud.get(cloudPath(id)).docDay, iso(days(-3)));
});

test('תעודה שהתאריך שלה לא נקרא, שצולמה בקליטה, והעובד קבע לקליטה יום אחר — הנייר נשמר עם הקליטה על היום שלה', async () => {
  const r = oneButtonApp(deliveryV8({ docDate: null }, 'unreadable'));
  await receive(r);
  const id = 'paper_77001234';
  assert.equal(json(r, `paperFind('${id}').paper`).docDay, TODAY);
  r.run(`receiptDocDate = '${iso(days(-1))}'; saveReceiptDraft();`);
  const { countAsPaper } = await import('./one-button-helpers.mjs');
  countAsPaper(r);
  const saved = await saveReceipt(r);
  assert.equal(saved.data.docDate, iso(days(-1)));
  const w = r.writes.find(x => x.op === 'set' && x.path && x.path.at(-2) === 'papers' && x.path.at(-1) === id);
  assert.ok(w, 'הנייר נכתב יחד עם הקליטה');
  assert.equal(w.data.docDay, iso(days(-1)), 'היום של הקליטה');
  assert.equal(w.data.docDayDefault.day, iso(days(-1)));
  assert.equal(w.data.docDayDefault.reason, 'unreadable');
  const local = JSON.parse(r.storage.get('bm_paper_results_v1')).cap0;
  assert.equal(local.paper.docDay, iso(days(-1)), 'גם העותק במכשיר');
  assert.ok(local.ackedAt, 'ואושר');
  // אותו נייר כבר בענן (נשמר גם מטלפון אחר) — היום עובר באותה שמירה, מול העותק שבענן
  const c = oneButtonApp(deliveryV8({ docDate: null }, 'unreadable'));
  await receive(c);
  const copy = JSON.parse(c.storage.get('bm_paper_results_v1')).cap0.paper;
  c.run(`papers = papers.concat([${JSON.stringify(copy)}]); ledgerInvalidate();`);
  c.finalCloud.put(c.run(`dataPath('papers', '${id}').join('/')`), copy);
  c.run(`receiptDocDate = '${iso(days(-1))}'; saveReceiptDraft();`);
  countAsPaper(c);
  await saveReceipt(c);
  const cw = c.writes.find(x => x.op === 'set' && x.path && x.path.at(-2) === 'papers' && x.path.at(-1) === id);
  assert.ok(cw, 'נכתב באותה טרנזקציה');
  assert.equal(cw.data.docDay, iso(days(-1)));
  assert.equal(c.run(`papers.find(x => x.id === '${id}').docDay`), iso(days(-1)));
  // שומר: תעודה שהתאריך שלה נקרא — היום שלה לא זז עם הקליטה
  const t = oneButtonApp(deliveryV8({}, null));
  await receive(t);
  t.run(`receiptDocDate = '${iso(days(-1))}'; saveReceiptDraft();`);
  countAsPaper(t);
  await saveReceipt(t);
  const tw = t.writes.find(x => x.op === 'set' && x.path && x.path.at(-2) === 'papers' && x.path.at(-1) === id);
  assert.equal(tw.data.docDay, TODAY);
});

// ===== סבב 3: החלטות ברמן (15.10) =====
// D1 נייר זיכוי/חיוב ונייר "ת.משלוח" קטן — יום הצילום, נספר כמו יום מודפס (מאזן, מרכזת, מחיר); לא נלקח מהחזרה או מקליטה.
// D2 תעודת משלוח — היום של הקליטה שהיא נכנסת אליה (קליטה בלי נייר, שאלת שלב 7, כניסה שקטה ±יום בשלב 12, צירוף);
//    תעודה שפותחת קליטה חדשה — יום הצילום.
// D3 יום הצילום — כשהצילום נכנס לתור (capturedAt), לא כשנקרא; צילום בלי זמן כזה — יום הקריאה.
// D4 מעבר חד-פעמי לניירות שגרסה 141 השאירה "לבדיקה" רק בגלל התאריך.
// D5 בדיקת הנייר הופכת יום שנקבע ליום של העובד רק כשהשדה שונה או כשאושר ("התאריך נכון").
// כל בדיקה כאן נכשלת על הגרסה שלפני הסבב הזה (2674d5b), או — לבדיקות של D2 — על גרסה 141.
const DAY_MS = 86400000;
const unreadableCredit = () => credit142({ docDate: null }, { docDateUnreliable: [{ noteIndex: 0, reason: 'unreadable' }] });
// צילום שנכנס לתור ב-capturedAt (לא הצילומים של intake(), שאין להם זמן צילום — כמו צילום מגרסה קודמת)
async function intakeAt(r, capturedAt, forReturnId = '') {
  r.run(`currentView = 'ledger'; openPaperIntake({ forReturnId: ${JSON.stringify(forReturnId)} });
    paperIntake.items = [{ captureId: 'cap0', hash: 'h0', page: ${JSON.stringify(page(0))}, status: 'photo', forReturnId: ${JSON.stringify(forReturnId)}, capturedAt: ${capturedAt} }];`);
  await r.run('paperIntakeRun()');
}

test('סבב 3 (D1): נייר זיכוי שצולם בזמן צירוף נייר לקליטה שמורה — יום הצילום, לא היום של הקליטה; תעודת משלוח באותו צירוף — היום של הקליטה (D2)', async () => {
  const { credit: creditPaper } = await import('./one-button-helpers.mjs');
  const day = iso(days(-2));
  const bare = { id: 'rc_bare', date: day, docDate: day, noDoc: true, noteParts: [], items: [{ productId: 'code_101', name: 'אחיד', qty: 12 }], timestamp: 1 };
  const resp = creditPaper('290095142');
  resp.serviceVersion = 8;
  Object.assign(resp.scan.documents[0], { docDate: null });
  resp.verification.docDateUnreliable = [{ noteIndex: 0, reason: 'unreadable' }];
  const a = oneButtonApp(resp, { receipts: [bare] });
  a.run(`reopenReceiptForDoc('rc_bare')`);
  assert.equal(a.run('receiptAttachTarget.id'), 'rc_bare');
  await readPapers(a);
  const p = json(a, `paperFind('paper_290095142').paper`);
  assert.equal(p.kind, 'credit');
  assert.equal(p.docDay, TODAY, 'יום הצילום');
  assert.equal(p.docDayDefault.from, 'capture');
  // שומר: תעודת משלוח באותו צירוף — היום של הקליטה השמורה (D2)
  const d = oneButtonApp(deliveryV8({ docDate: null }, 'unreadable'), { receipts: [bare] });
  d.run(`reopenReceiptForDoc('rc_bare')`);
  await readPapers(d);
  const dp = json(d, `paperFind('paper_77001234').paper`);
  assert.equal(dp.docDay, day);
  assert.equal(dp.docDayDefault.from, 'receiving');
});

test('סבב 3 (D1): נייר "ת.משלוח" קטן שהיום שלו נקבע נשאר ביום הצילום גם כשהוא נשמר עם קליטה מיום אחר; תעודת משלוח — עוברת ליום הקליטה', () => {
  const r = paperApp([credit142()], pinned);
  const def = { reason: 'unreadable', printed: null, day: '2026-10-15', from: 'capture' };
  const small = { id: 'paper_290012345', kind: 'delivery', small: true, docDay: '2026-10-15', docDayDefault: def };
  assert.equal(r.run(`paperDeliveryDayForReceipt(${JSON.stringify(small)}, '2026-10-14')`), null, 'נייר קטן — יום הצילום, כמו נייר חיוב');
  const big = json(r, `paperDeliveryDayForReceipt(${JSON.stringify({ ...small, id: 'paper_77001234', small: undefined })}, '2026-10-14')`);
  assert.equal(big.docDay, '2026-10-14');
  assert.deepEqual(big.docDayDefault, { ...def, day: '2026-10-14', from: 'receiving' });
  // גם יום שנקבע במעבר מגרסה 141 — תעודת משלוח עוברת לקליטה שלה
  assert.equal(json(r, `paperDeliveryDayForReceipt(${JSON.stringify({ ...small, id: 'paper_77001234', small: undefined, docDayDefault: { ...def, from: 'migration' } })}, '2026-10-14')`).docDay, '2026-10-14');
});

test('סבב 3 (D1): החלפה שנסגרה לבד — "הוחלף" והזיכוי במרכזת ביום של נייר שהיום שלו נקבע, בדיוק כמו נייר שהודפס באותו יום (rangePaperAdjust, ledgerMatrixAdjust)', () => {
  const name = code => (L.products.find(p => p.id === 'code_' + code) || {}).name || code;
  const strip = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&#039;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
  const R = { id: 'ret_month', date: '2026-09-29', docDate: '2026-09-29', credited: true, creditStatus: 'closed', timestamp: Date.parse('2026-09-29T08:00:00'), sentTo: 'הנהג',
    items: [['450', 1], ['451', 2], ['238', 5], ['344', 4]].map(([code, qty]) => ({ productId: 'code_' + code, code, name: name(code), barcode: '', qty })) };
  const credit = extra => ({ schema: 1, state: 'accepted', id: 'paper_290099120', kind: 'credit', number: '290099120', terminalNumber: '290099120', numerator: '99120', docDay: '2026-10-01', printedTime: '10:00',
    timestamp: Date.parse('2026-10-01T10:00:00'), rows: [['450', 3], ['238', 5], ['344', 4]].map(([code, qty], i) => ({ line: i + 1, itemCode: code, barcode: '', description: code, qty, productId: 'code_' + code, matchedBy: 'code' })),
    anchors: { units: 12, lines: 3, source: 'printed' }, proof: { unitsOk: true, linesOk: true }, ...extra });
  const look = p => {
    const r = runtime({ data: { ...fixture(), products: structuredClone(L.products) } });
    r.context.testL = { receipts: [], returns: [R], papers: [p] };
    r.run(`receipts = testL.receipts; returns = testL.returns; papers = testL.papers; todayStr = () => '2026-10-05'; ledgerInvalidate();`);
    const flags = m => strip(r.run(`(function(){ const d = receiptRangeData('${m}-01', '${m}-30'); return ['code_450', 'code_451'].map(k => { const x = d.matrix.list.find(z => z.key === k); return k + ':' + (x ? mtxRowFlags(x) : '-'); }).join(' | '); })()`));
    return { sep: flags('2026-09'), oct: flags('2026-10'),
      adj: json(r, `ledgerMatrixAdjust(paperLedger({ recs: receipts, rets: returns, papers, from: ledgerFrom, asOf: todayStr() }), '2026-09-01', '2026-10-31', papers).filter(x => x.key === 'code_450').map(x => [x.day, x.credit])`) };
  };
  const printedDay = look(credit({}));
  assert.match(printedDay.oct, /code_450: 2 יח׳ זוכו במקום חלה קלועה ברמן \(אותו מחיר\)/, 'שומר: נייר שהודפס ב-1.10');
  const defaulted = look(credit({ docDayDefault: { reason: 'unreadable', printed: null, day: '2026-10-01', from: 'capture' } }));
  assert.equal(defaulted.oct, printedDay.oct, 'אוקטובר — כמו יום מודפס');
  assert.equal(defaulted.sep, printedDay.sep, 'ספטמבר — כמו יום מודפס');
  assert.deepEqual(defaulted.adj, printedDay.adj);
  assert.ok(defaulted.adj.every(([d]) => d === '2026-10-01'), 'הזיכוי על חלה מרובעת — ביום הנייר: ' + JSON.stringify(defaulted.adj));
});

test('סבב 3 (D3): יום הצילום — כשהצילום נכנס לתור, גם כשנקרא למחרת; "בעתיד" — אחרי יום הצילום; צילום בלי זמן צילום — יום הקריאה', async () => {
  const yesterday = FIXED_NOW - DAY_MS;
  const r = paperApp([unreadableCredit()], { ...pinned, returns: [] });
  await intakeAt(r, yesterday);
  const p = paperOf(r);
  assert.equal(p.state, 'accepted');
  assert.equal(p.docDay, '2026-10-14', 'יום הצילום — לא יום הקריאה');
  assert.deepEqual(p.docDayDefault, { reason: 'unreadable', printed: null, day: '2026-10-14', from: 'capture' });
  assert.equal(p.capturedAt, yesterday, 'זמן הצילום נשמר על הנייר');
  assert.equal(p.timestamp, FIXED_NOW, 'timestamp — כשנקרא, כמו קודם');
  // תאריך מודפס של היום על נייר שצולם אתמול — בעתיד (נייר לא מודפס אחרי שצולם)
  const f = paperApp([credit142({ docDate: '15/10/2026' })], { ...pinned, returns: [] });
  await intakeAt(f, yesterday);
  assert.equal(paperOf(f).docDay, '2026-10-14');
  assert.equal(paperOf(f).docDayDefault.reason, 'future');
  // שומר: אותו נייר שצולם היום — נאמן
  const t = paperApp([credit142({ docDate: '15/10/2026' })], { ...pinned, returns: [] });
  await intakeAt(t, FIXED_NOW);
  assert.equal(paperOf(t).docDay, '2026-10-15');
  assert.equal(paperOf(t).docDayDefault, undefined);
  // שומר: צילום בלי זמן צילום (נכנס לתור לפני גרסה 142) — יום הקריאה, ובלי capturedAt
  const o = paperApp([unreadableCredit()], { ...pinned, returns: [] });
  await intake(o);
  assert.equal(paperOf(o).docDay, '2026-10-15');
  assert.equal(paperOf(o).capturedAt, undefined);
});

test('סבב 3 (D3): צילום שנכנס לתור נושא את זמן הצילום — קריאה למחרת (בלי רשת עד אז) משתמשת ביום שבו צולם', async () => {
  let clock = Date.UTC(2026, 9, 14, 15, 0); // 14.10, 18:00 בירושלים
  class MovingDate extends Date {
    constructor(...a) { super(...(a.length ? a : [clock])); }
    static now() { return clock; }
  }
  const r = paperApp([unreadableCredit()], { globals: { Date: MovingDate }, returns: [] });
  r.run(`currentView = 'ledger'; openPaperIntake({});
    aiCompressInvoiceImage = async () => ({ dataUrl: 'data:image/jpeg;base64,cGFwZXI', baseDataUrl: 'data:image/jpeg;base64,cGFwZXI', rotation: 0 });`);
  await r.run(`paperIntakeAddFiles([{ size: 1234, name: 'paper.jpg', lastModified: 1 }])`);
  assert.equal(r.run('paperIntake.items.length'), 1);
  assert.equal(r.run('paperIntake.items[0].status'), 'photo');
  assert.equal(r.run('paperIntake.items[0].capturedAt'), clock, 'זמן הצילום נרשם כשנכנס לתור');
  clock = Date.UTC(2026, 9, 15, 6, 0); // למחרת בבוקר — יש רשת
  await r.run('paperIntakeRun()');
  const id = r.run('paperIntake.items[0].paperId');
  const p = json(r, `paperFind(${JSON.stringify(id)}).paper`);
  assert.equal(p.docDay, '2026-10-14', 'היום שבו צולם');
  assert.equal(p.docDayDefault.day, '2026-10-14');
});

test('סבב 3 (D2): תעודת משלוח שהתאריך שלה לא נקרא נכנסת בשקט (שלב 12, ±יום) לקליטה הפתוחה מאתמול — ונשמרת ביום של הקליטה', async () => {
  const yesterday = iso(days(-1));
  const r = oneButtonApp(deliveryV8({ docDate: null }, 'unreadable'));
  r.run(`receiptOpened = true; receiptEntryMode = 'manual'; receiptDocDate = '${yesterday}'; receiptList = [{ productId: 'code_101', name: 'x', barcode: '', qty: 7 }]; saveReceiptDraft();`);
  await readPapers(r);
  assert.equal(r.run('testConfirms.length'), 0, 'בלי שאלה');
  assert.equal(r.run('paperIntake.items[0].join && paperIntake.items[0].join.state'), 'joined');
  assert.equal(r.run('aiScanDocuments.length'), 1, 'נכנסה לקליטה הפתוחה');
  assert.equal(r.run('receiptDocDate'), yesterday, 'הקליטה נשארת של אתמול');
  const { countAsPaper } = await import('./one-button-helpers.mjs');
  countAsPaper(r);
  const saved = await saveReceipt(r);
  assert.equal(saved.data.docDate, yesterday);
  const w = r.writes.find(x => x.op === 'set' && x.path && x.path.at(-2) === 'papers' && x.path.at(-1) === 'paper_77001234');
  assert.ok(w, 'הנייר נכתב עם הקליטה');
  assert.equal(w.data.docDay, yesterday, 'היום של הקליטה שהתעודה נכנסה אליה');
  assert.deepEqual(w.data.docDayDefault, { reason: 'unreadable', printed: null, day: yesterday, from: 'receiving' });
});

test('סבב 3 (D2+D3): תעודת משלוח שצולמה אתמול ונקראה היום פותחת קליטה — של יום הצילום (הקליטה ביום הזה, והנייר נשמר בו)', async () => {
  const yesterday = iso(days(-1));
  const shot = days(-1).getTime();
  const r = oneButtonApp(deliveryV8({ docDate: null }, 'unreadable'));
  r.run(`openPaperIntake({}); paperIntake.items = [{ captureId: 'cap0', hash: 'h0', page: { dataUrl: 'data:image/jpeg;base64,cGFwZXI0', baseDataUrl: 'data:image/jpeg;base64,cGFwZXI0', rotation: 0, orientationConfirmed: true }, status: 'photo', target: '', forDraftId: null, capturedAt: ${shot} }];`);
  await r.run('paperIntakeRun()');
  await r.run('paperJoinChain');
  const p = json(r, `paperFind('paper_77001234').paper`);
  assert.equal(p.docDay, yesterday, 'יום הצילום');
  assert.equal(r.run('receiptOpened'), false, 'לא נפתחה קליטה לבד');
  assert.equal(r.run('paperIntake.items[0].join.reason'), 'date-new');
  assert.match(r.run('paperIntake.items[0].join.text'), new RegExp('פותח לה קליטה מ-' + r.run(`ledgerDayShort('${yesterday}')`).replace('.', '\\.')));
  const { join, confirmLast, countAsPaper } = await import('./one-button-helpers.mjs');
  await join(r, 'paper_77001234', 'cap0');
  await confirmLast(r);
  assert.equal(r.run('receiptOpened'), true);
  assert.equal(r.run('receiptDocDate'), yesterday, 'הקליטה החדשה — של יום הצילום');
  countAsPaper(r);
  const saved = await saveReceipt(r);
  assert.equal(saved.data.docDate, yesterday);
  const w = r.writes.find(x => x.op === 'set' && x.path && x.path.at(-2) === 'papers' && x.path.at(-1) === 'paper_77001234');
  assert.equal(w.data.docDay, yesterday, 'הנייר — יום הצילום');
  // "קליטה חדשה לתעודה הזאת" כשיש קליטה בלי נייר — נפתחת בלי שאלה נוספת, גם כשיום הצילום אינו היום
  const bareDay = iso(days(-3));
  const bare = { id: 'rc_bare', date: bareDay, docDate: bareDay, noDoc: true, noteParts: [], items: [{ productId: 'code_101', name: 'אחיד', qty: 12 }], timestamp: 1 };
  const c = oneButtonApp(deliveryV8({ docDate: null }, 'unreadable'), { receipts: [bare] });
  c.run(`openPaperIntake({}); paperIntake.items = [{ captureId: 'cap0', hash: 'h0', page: { dataUrl: 'data:image/jpeg;base64,cGFwZXI0', baseDataUrl: 'data:image/jpeg;base64,cGFwZXI0', rotation: 0, orientationConfirmed: true }, status: 'photo', target: '', forDraftId: null, capturedAt: ${shot} }];`);
  await c.run('paperIntakeRun()');
  await c.run('paperJoinChain');
  assert.equal(c.run('paperIntake.items[0].join.reason'), 'bare');
  c.run(`paperUiClick({ dataset: { role: 'ledger-start-receiving', paper: 'paper_77001234', cap: 'cap0', new: '1' } })`);
  await c.run('paperJoinChain');
  assert.equal(c.run('testConfirms.length'), 0, 'העובד כבר בחר');
  assert.equal(c.run('receiptOpened'), true);
  assert.equal(c.run('receiptAttachTarget'), null);
  assert.equal(c.run('receiptDocDate'), yesterday);
});

// ===== D4: המעבר =====
const at = (day, time = '10:00') => Date.parse(day + 'T' + time + ':00');
const rows141 = () => [['101', 13], ['233', 1], ['344', 2], ['238', 1]].map(([code, qty], i) => ({ line: i + 1, itemCode: code, barcode: null, description: '', qty, productId: 'code_' + code, matchedBy: 'code' }));
// נייר כפי שגרסה 141 שמרה אותו כשהתאריך לא נקרא: docDay '' והערה אחת ב"מה לבדוק"
function paper141(id, extra = {}) {
  return { schema: 1, rev: 1, id, kind: 'credit', kindKnown: true, number: id.replace('paper_', ''), terminalNumber: null, numerator: null, headerText: 'ת.משלוח החזרה יבש',
    docDay: '', printedTime: null, rows: rows141(), anchors: { units: 17, lines: 4, check: null, source: 'printed' },
    proof: { unitsOk: true, linesOk: true, checkOk: null, scanStatus: 'agreed' }, state: 'needs-review', otherPapersVisible: false,
    forReturnId: null, captureId: 'cap_' + id, photoHash: 'h_' + id, timestamp: at('2026-10-12'), deviceName: 'טלפון', writtenBy: '141',
    review: { notes: ['התאריך לא נקרא — הקלד אותו'], mustCheck: false }, attach: null, ...extra };
}
function migrationApp(list, opts = {}) {
  const r = paperApp([credit142()], { ...pinned, returns: opts.returns || [], receipts: opts.receipts || [], storage: opts.storage });
  r.context.testLogs = [];
  r.context.testCloudPapers = list;
  r.run(`logAction = async (...a) => { testLogs.push(a); };
    papers = structuredClone(testCloudPapers); ledgerInvalidate();
    paperListFromServer = true; receiptListFromServer = true;`);
  r.cloudPath = id => r.run(`dataPath('papers', ${JSON.stringify(id)}).join('/')`);
  list.forEach(p => r.finalCloud.put(r.cloudPath(p.id), p));
  r.cloud = id => r.finalCloud.get(r.cloudPath(id));
  return r;
}

test('סבב 3 (D4): ניירות שגרסה 141 השאירה "לבדיקה" רק כי התאריך לא נקרא — מקבלים יום (יום הצילום; תעודה שנקלטה — יום הקליטה), מסומנים, ומתקבלים; כל נייר אחר — לא נוגעים', async () => {
  const rc = { id: 'rc_10', date: '2026-10-10', docDate: '2026-10-10', timestamp: at('2026-10-10', '07:00'), items: [{ productId: 'code_101', name: 'אחיד', qty: 13 }],
    paperScan: { response: { perDocument: [{ docIndex: 0, paperId: 'paper_77000002' }, { docIndex: 1, paperId: 'paper_290012399' }], scan: { documents: [] } } } };
  const migrate = {
    credit: paper141('paper_290090001'),
    v7: paper141('paper_290090002', { proof: { unitsOk: true, linesOk: true, checkOk: null, scanStatus: 'needs_review' }, review: { notes: ['בדוק מול הנייר: התאריך', 'התאריך לא נקרא — הקלד אותו'], mustCheck: true } }),
    charge: paper141('paper_290090003', { kind: 'charge', timestamp: at('2026-10-13', '23:30') }),
    inReceipt: paper141('paper_77000002', { kind: 'delivery', headerText: 'תעודת משלוח', terminalNumber: '4411' }),
    delivery: paper141('paper_77000003', { kind: 'delivery', headerText: 'תעודת משלוח', terminalNumber: '4412' }),
    small: paper141('paper_290012399', { kind: 'delivery', small: true, headerText: 'ת.משלוח' })
  };
  const unmapped = rows141(); unmapped[3] = { ...unmapped[3], productId: null };
  const flagged = rows141(); flagged[0] = { ...flagged[0], flag: true };
  const keep = {
    unmapped: paper141('paper_290090010', { rows: unmapped, review: { notes: ['התאריך לא נקרא — הקלד אותו', 'שורה אחת לא זוהתה — בחר מוצר'], mustCheck: false } }),
    flagged: paper141('paper_290090011', { rows: flagged, review: { notes: ['הקריאה סימנה שורה אחת לבדיקה — היא מסומנת בצהוב', 'התאריך לא נקרא — הקלד אותו'], mustCheck: true } }),
    typed: paper141('paper_290090012', { docDay: '2026-10-11', review: { notes: ['הקריאה לא אומתה במלואה — השווה את השורות לנייר'], mustCheck: true } }),
    confirmed: paper141('paper_290090013', { proof: { unitsOk: true, linesOk: true, checkOk: null, scanStatus: 'agreed', confirmedAt: 5, confirmedBy: 'טלפון' } }),
    byUser: paper141('paper_290090014', { docDayBy: 'user' }),
    deleted: paper141('paper_290090015', { deleted: true }),
    numberToo: paper141('paper_290090016', { review: { notes: ['בדוק מול הנייר: מספר התעודה, התאריך', 'התאריך לא נקרא — הקלד אותו'], mustCheck: true } }),
    anchors: paper141('paper_290090017', { proof: { unitsOk: false, linesOk: true, checkOk: null, scanStatus: 'agreed' }, review: { notes: ['התאריך לא נקרא — הקלד אותו', 'סכום הכמויות שנקראו (17) אינו תואם ל"סה״כ כללי" המודפס (18)'], mustCheck: false } }),
    check: paper141('paper_290090018', { proof: { unitsOk: true, linesOk: true, checkOk: false, scanStatus: 'agreed' } }),
    kindless: paper141('paper_290090019', { kind: null, kindKnown: false, review: { notes: ['לא נקרא אם זה נייר חיוב, זיכוי או תעודת משלוח — בחר את הסוג למטה', 'התאריך לא נקרא — הקלד אותו'], mustCheck: false } }),
    accepted: paper141('paper_290090020', { state: 'accepted', docDay: '2026-10-12', review: undefined })
  };
  // נייר במכשיר שגרסה 141 קראה ועוד לא נשלח לענן
  const storage = new Map([['bm_paper_results_v1', JSON.stringify({ capL: { captureId: 'capL', hash: 'hL', at: at('2026-10-11'), paper: paper141('paper_290090030', { captureId: 'capL', timestamp: at('2026-10-11') }) } })]]);
  const r = migrationApp(Object.values(migrate).concat(Object.values(keep)), { receipts: [rc], storage });
  const before = r.finalCloud.transactions;
  const out = plain(await r.run('paperDayMigration()'));
  assert.deepEqual(out.failed, []);
  assert.deepEqual(out.done.slice().sort(), Object.values(migrate).map(p => p.id).concat(['paper_290090030']).sort());
  const expectDay = { credit: '2026-10-12', v7: '2026-10-12', charge: '2026-10-13', inReceipt: '2026-10-10', delivery: '2026-10-12', small: '2026-10-12' };
  for (const [k, p] of Object.entries(migrate)) {
    const c = r.cloud(p.id);
    assert.equal(c.docDay, expectDay[k], k);
    assert.deepEqual(c.docDayDefault, { reason: 'unreadable', printed: null, day: expectDay[k], from: 'migration' }, k);
    assert.equal(c.state, 'accepted', k);
    assert.equal(c.review, null, k);
    assert.equal(c.rev, 2, k);
    assert.equal(c.docDayBy, undefined, k);
    assert.deepEqual(c.rows, p.rows, k + ': השורות לא משתנות');
    assert.equal(c.captureId, p.captureId, k);
    assert.equal(r.run(`paperDayDefaultNote(papers.find(x => x.id === '${p.id}'))`), NOTE, k + ': ההערה');
  }
  assert.ok(r.cloud(migrate.credit.id).attach && r.cloud(migrate.credit.id).attach.by === 'auto', 'נייר זיכוי — שיוך לרגע השמירה, כמו נייר חדש');
  for (const [k, p] of Object.entries(keep)) assert.deepEqual(r.cloud(p.id), JSON.parse(JSON.stringify(p)), k + ': לא נגעו');
  assert.equal(r.finalCloud.transactions - before, Object.keys(migrate).length, 'טרנזקציה לכל נייר שעבר, ולא לאחרים');
  // במאזן — נספרים
  assert.equal(r.run(`currentLedger().states['${migrate.credit.id}']`), 'counted');
  assert.equal(r.run(`currentLedger().states['${migrate.inReceipt.id}']`), 'in-receipt');
  // הנייר במכשיר — ברשומה שלו, ונשלח כך
  const local = JSON.parse(r.storage.get('bm_paper_results_v1')).capL.paper;
  assert.equal(local.docDay, '2026-10-11');
  assert.equal(local.state, 'accepted');
  assert.equal(local.docDayDefault.from, 'migration');
  await new Promise(res => setImmediate(res));
  assert.ok(r.writes.some(w => w.paperCreate && w.paperCreate.id === 'paper_290090030' && w.paperCreate.paper.docDay === '2026-10-11'), 'נשלח לענן ביום שנקבע');
  // בלי קריאה בתשלום; ביומן הפעולות; פעם אחת בטלפון
  assert.equal(r.requests.length, 0);
  const log = json(r, 'testLogs').filter(x => x[3] && x[3].migration);
  assert.equal(log.length, 1, 'רשומה אחת ביומן הפעולות');
  assert.equal(log[0][0], 'paper');
  assert.equal(log[0][3].migration, 'paper-day-default-v142');
  assert.equal(log[0][3].paperIds.length, 7);
  assert.ok(JSON.parse(r.storage.get('bm_paper_day_default_v142')).at > 0, 'סימן במכשיר');
  const t0 = r.finalCloud.transactions;
  assert.equal(await r.run('paperDayMigration()'), null, 'פעם אחת בטלפון');
  assert.equal(r.finalCloud.transactions, t0);
  // חוזר על עצמו בלי נזק: בלי הסימן — אין מה להעביר, שום דבר לא נכתב
  r.storage.delete('bm_paper_day_default_v142');
  const writes = r.writes.length;
  assert.deepEqual(plain(await r.run('paperDayMigration()')), { done: [], failed: [] });
  assert.equal(r.writes.length, writes);
  assert.equal(r.finalCloud.transactions, t0, 'אין נייר שמתאים — אין טרנזקציה');
});

test('סבב 3 (D4): המעבר רץ רק על רשימה מהשרת; טלפון בגרסה 141 שהקליד את התאריך באותו רגע — לא נדרס; כשל — שוב בפעם הבאה, בלי סימן', async () => {
  const p = paper141('paper_290090001');
  const r = migrationApp([p]);
  r.run('paperListFromServer = false;');
  assert.equal(await r.run('paperDayMigration()'), null, 'רשימה מהמטמון — מחכים לשרת');
  assert.equal(r.finalCloud.get(r.cloudPath(p.id)).state, 'needs-review');
  r.run('paperListFromServer = true;');
  // הטלפון השני (141) שומר את הבדיקה בין הקריאה של הטרנזקציה לכתיבה שלה
  let release; r.finalCloud.commitGate = new Promise(res => { release = res; });
  const run = r.run('paperDayMigration()');
  for (let i = 0; i < 50 && r.finalCloud.transactions < 1; i++) await new Promise(res => setImmediate(res));
  for (let i = 0; i < 5; i++) await new Promise(res => setImmediate(res));
  const typed = { ...p, docDay: '2026-10-11', state: 'accepted', review: null, rev: 2, proof: { ...p.proof, confirmedBy: 'טלפון 141', confirmedAt: 7 } };
  r.finalCloud.put(r.cloudPath(p.id), typed);
  r.finalCloud.commitGate = null; release();
  const out = plain(await run);
  assert.deepEqual(out, { done: [], failed: [] });
  assert.deepEqual(r.cloud(p.id), typed, 'התאריך שהעובד הקליד נשאר; אין docDayDefault');
  // כשל בענן — אין סימן, והמעבר ינסה שוב
  const f = migrationApp([p]);
  f.finalCloud.reject = 'unavailable';
  const fo = plain(await f.run('paperDayMigration()'));
  assert.deepEqual(fo.failed, [p.id]);
  assert.equal(f.storage.get('bm_paper_day_default_v142'), undefined);
  f.finalCloud.reject = null;
  assert.deepEqual(plain(await f.run('paperDayMigration()')).done, [p.id]);
  assert.ok(f.storage.get('bm_paper_day_default_v142'));
  // נייר במכשיר שהוא חלק מהקליטה הפתוחה (בטביעה שלה) — לא נוגעים עכשיו, ובלי סימן: בטעינה הבאה, אחרי שנשמר עם הקליטה
  const draftPaper = paper141('paper_77000009', { kind: 'delivery', captureId: 'capD' });
  const storage = new Map([['bm_paper_results_v1', JSON.stringify({ capD: { captureId: 'capD', hash: 'hD', at: 1, localOnlyReceiving: true, paper: draftPaper } })]]);
  const d = migrationApp([], { storage });
  d.run(`aiScanResponse = { scan: { documents: [] }, perDocument: [{ docIndex: 0, paperId: 'paper_77000009', captureId: 'capD' }] };`);
  const fingerprint = d.run('localReceivingFingerprint()');
  assert.deepEqual(plain(await d.run('paperDayMigration()')), { done: [], failed: ['paper_77000009'] });
  assert.equal(JSON.parse(d.storage.get('bm_paper_results_v1')).capD.paper.docDay, '');
  assert.equal(d.run('localReceivingFingerprint()'), fingerprint, 'טביעת הקליטה הפתוחה לא השתנתה');
  assert.equal(d.storage.get('bm_paper_day_default_v142'), undefined);
  // ובזמן שמירת קליטה — לא רץ בכלל
  d.run('sharedReceiptFinalizing = true;');
  assert.equal(await d.run('paperDayMigration()'), null);
});

// ===== D5: בדיקת הנייר =====
function defaultedReview(opts) {
  return (async () => {
    const r = paperApp([unreadableCredit()], { ...pinned, returns: [], ...opts });
    await intake(r);
    assert.equal(paperOf(r).docDayDefault.day, '2026-10-15');
    // הנייר מחכה לבדיקה בגלל שורה שלא זוהתה (לא בגלל התאריך)
    const fix = `p => ({ ...p, state: 'needs-review', rows: p.rows.map((x, i) => i === 3 ? { ...x, productId: null } : x), review: { notes: ['שורה אחת לא זוהתה — בחר מוצר'], mustCheck: false } })`;
    if (opts && opts.offline) r.run(`paperPatchLocal('cap0', cur => ({ ...cur, paper: (${fix})(cur.paper) }));`);
    else r.run(`papers = papers.map(x => x.id === 'paper_290095142' ? (${fix})(x) : x); ledgerInvalidate();`);
    await r.run(`openPaperReview('paper_290095142'${opts && opts.offline ? ", 'cap0'" : ''})`);
    r.run('renderPaperReview()');
    return r;
  })();
}
const pickRow = r => { r.run(`paperUiClick({ dataset: { role: 'review-pick', id: '3' } })`); r.run(`paperUiClick({ dataset: { role: 'review-pick-product', id: 'code_238' } })`); };

test('סבב 3 (D5): בדיקה שנפתחה רק כדי לתקן שורה לא הופכת את היום שנקבע ליום של העובד — ההערה נשארת', async () => {
  // במכשיר (עוד לא בענן)
  const r = await defaultedReview({ storage: new Map(), offline: true });
  assert.ok(r.node('app').innerHTML.includes(NOTE));
  pickRow(r);
  assert.equal(r.run('paperReviewState().ok'), true);
  await r.run('savePaperReview()');
  const p = json(r, `paperFind('paper_290095142', 'cap0').paper`);
  assert.equal(p.state, 'accepted');
  assert.equal(p.docDay, '2026-10-15');
  // סבב 4: הסימן נשאר עם האישור של הבדיקה הזו (proofAt) — אישור מאוחר יותר בטלפון בגרסה 141 יהפוך אותו ליום של העובד
  assert.deepEqual(p.docDayDefault, { reason: 'unreadable', printed: null, day: '2026-10-15', from: 'capture', proofAt: p.proof.confirmedAt }, 'היום עדיין נקבע');
  assert.ok(p.proof.confirmedAt > 0);
  assert.equal(p.docDayBy, undefined);
  assert.equal(r.run(`paperDayDefaultNote(paperFind('paper_290095142', 'cap0').paper)`), NOTE);
  // בענן — העדכון לא מוחק את הסימן ולא כותב docDayBy
  const c = await defaultedReview({});
  pickRow(c);
  await c.run('savePaperReview()');
  const upd = c.writes.filter(w => w.op === 'update' && w.path && w.path.at(-1) === 'paper_290095142').at(-1);
  assert.ok(upd);
  assert.equal(upd.data.state, 'accepted');
  assert.deepEqual(upd.data.docDayDefault, { reason: 'unreadable', printed: null, day: '2026-10-15', from: 'capture', proofAt: upd.data.proof.confirmedAt });
  assert.equal('docDayBy' in upd.data, false);
});

test('סבב 3 (D5): "התאריך נכון" — העובד מאשר את היום שנקבע בלי לשנות אותו: היום שלו (docDayBy), ההערה יורדת; שינוי השדה — גם', async () => {
  const r = await defaultedReview({ storage: new Map(), offline: true });
  const html = r.node('app').innerHTML;
  assert.ok(html.includes('data-role="review-day-confirm"'), 'כפתור "התאריך נכון" ליד ההערה');
  pickRow(r);
  r.run(`paperUiClick({ dataset: { role: 'review-day-confirm' } })`);
  assert.ok(r.node('app').innerHTML.includes('אישרת את התאריך'));
  assert.ok(!r.node('app').innerHTML.includes('data-role="review-day-confirm"'));
  await r.run('savePaperReview()');
  const p = json(r, `paperFind('paper_290095142', 'cap0').paper`);
  assert.equal(p.docDay, '2026-10-15', 'אותו יום');
  assert.equal(p.docDayDefault, null);
  assert.equal(p.docDayBy, 'user');
  assert.equal(r.run(`paperDayDefaultNote(paperFind('paper_290095142', 'cap0').paper)`), '');
  // שינוי השדה (בלי "התאריך נכון") — היום של העובד
  const c = await defaultedReview({});
  pickRow(c);
  c.run(`paperUiInput({ id: 'reviewDay', value: '2026-10-14', dataset: {}, getAttribute: () => null })`);
  await c.run('savePaperReview()');
  const upd = c.writes.filter(w => w.op === 'update' && w.path && w.path.at(-1) === 'paper_290095142').at(-1);
  assert.equal(upd.data.docDay, '2026-10-14');
  assert.equal(upd.data.docDayDefault, null);
  assert.equal(upd.data.docDayBy, 'user');
});

// ===== מהסבב הקודם, בלי בדיקה עד עכשיו =====
test('כתיבה לענן: צילום שקרא את התאריך של נייר שהעובד שייך בעצמו (או שלא נקרא עד הסוף) — "אותו נייר", השמור נשאר; לא "נייר אחר כבר נשמר"', async () => {
  const store = new Map();
  const cloud = runtime({ globals: {
    doc: (_db, ...seg) => ({ path: seg.join('/'), id: seg.at(-1) }),
    runTransaction: async (_db, fn) => fn({ get: async ref => ({ id: ref.id, exists: () => store.has(ref.path), data: () => structuredClone(store.get(ref.path)) }),
      set: (ref, d) => store.set(ref.path, structuredClone(d)) }) } });
  const rows = rows141();
  const A = { schema: 1, state: 'accepted', timestamp: 1, id: 'paper_290095142', kind: 'credit', number: '290095142', numerator: '95142', docDay: '2026-10-04', rows };
  const blur = { ...A, captureId: 'c1', docDay: '2026-10-14', docDayDefault: { reason: 'unreadable', printed: null, day: '2026-10-14', from: 'capture' },
    attach: { type: 'return', id: R1004, role: 'main', by: 'user' } };
  assert.equal(await cloud.run(`executePaperCreateTask(${JSON.stringify({ id: A.id, paper: blur })})`), 'created');
  assert.equal(await cloud.run(`executePaperCreateTask(${JSON.stringify({ id: A.id, paper: { ...A, captureId: 'c2' } })})`), 'duplicate', 'העובד שייך — השמור נשאר');
  assert.equal([...store.values()][0].captureId, 'c1');
  const plainBlur = { ...blur, attach: null };
  store.clear();
  assert.equal(await cloud.run(`executePaperCreateTask(${JSON.stringify({ id: A.id, paper: plainBlur })})`), 'created');
  assert.equal(await cloud.run(`executePaperCreateTask(${JSON.stringify({ id: A.id, paper: { ...A, captureId: 'c3', state: 'needs-review' } })})`), 'duplicate', 'הצילום החדש לא נקרא עד הסוף — השמור נשאר');
  assert.equal([...store.values()][0].captureId, 'c1');
  // שומר: צילום שקרא את התאריך ונקרא עד הסוף — מחליף (כמו בסבב הקודם)
  assert.equal(await cloud.run(`executePaperCreateTask(${JSON.stringify({ id: A.id, paper: { ...A, captureId: 'c4' } })})`), 'replaced');
});

// ===== סבב 4: ממצאי הסקירה של סבב 3 =====
// כל בדיקה כאן נכשלת על הקוד שלפני התיקון שלה.
const shotItem = capturedAt => `openPaperIntake({}); paperIntake.items = [{ captureId: 'cap0', hash: 'h0', page: ${JSON.stringify(page(0))}, status: 'photo', target: '', forDraftId: null, capturedAt: ${capturedAt} }];`;
const paperWriteOf = (r, id) => r.writes.filter(x => x.op === 'set' && x.path && x.path.at(-2) === 'papers' && x.path.at(-1) === id).at(-1);
// תעודת משלוח מגרסה 141 שהמעבר נתן לה יום (from: 'migration'), בענן — בלי רשומה במכשיר; הקריאה שלה בענן
async function migratedDelivery(day, opts = {}) {
  const resp = deliveryV8({ docDate: null }, 'unreadable');
  const doc = resp.scan.documents[0];
  const scan = { at: 1, serviceVersion: 8, model: 'fixture', requestId: 'r', usage: null, verification: resp.verification, reads: [], warnings: [], attempts: 1, retryAudit: null, doc };
  const r = oneButtonApp(resp, { cloudScans: { paper_77001234: scan }, ...opts });
  r.run(shotItem(Date.parse(day + 'T10:00:00')));
  await r.run('paperIntakeRun()'); await r.run('paperJoinChain');
  r.run(`(() => { const rec = paperLocalResults().cap0;
    const mp = { ...rec.paper, docDay: '${day}', docDayDefault: { reason: 'unreadable', printed: null, day: '${day}', from: 'migration' }, captureId: 'capOld', capturedAt: undefined, timestamp: ${Date.parse(day + 'T10:00:00')}, writtenBy: '141' };
    papers = [mp]; paperPatchLocal('cap0', () => null); ledgerInvalidate(); paperIntake = null; testConfirms.length = 0; })()`);
  return r;
}

test('סבב 4 (D2): תעודת משלוח שצולמה לפני יותר משבוע ופותחת קליטה חדשה — הקליטה והנייר ביום הצילום, כמו שנאמר בכרטיס ובשאלה; יום צילום לפני המאזן החי (חודש שנסגר) — "של היום", והקליטה של היום', async () => {
  const { join, confirmLast, countAsPaper } = await import('./one-button-helpers.mjs');
  const shotDay = iso(days(-10));
  const r = oneButtonApp(deliveryV8({ docDate: null }, 'unreadable'));
  r.run(`ledgerFrom = '${iso(days(-40))}';`);
  r.run(shotItem(days(-10).getTime()));
  await r.run('paperIntakeRun()'); await r.run('paperJoinChain');
  assert.equal(json(r, `paperFind('paper_77001234').paper`).docDay, shotDay, 'יום הצילום');
  const short = r.run(`ledgerDayShort('${shotDay}')`);
  assert.equal(r.run('paperIntake.items[0].join.reason'), 'date-new');
  assert.ok(r.run('paperIntake.items[0].join.text').includes('פותח לה קליטה מ-' + short), r.run('paperIntake.items[0].join.text'));
  await join(r, 'paper_77001234', 'cap0');
  assert.ok(r.run('testConfirms[testConfirms.length - 1].message').includes('תיפתח לה קליטה מ-' + short));
  await confirmLast(r);
  assert.equal(r.run('receiptOpened'), true);
  assert.equal(r.run('receiptDocDate'), shotDay, 'הקליטה החדשה — ביום הצילום, גם יותר משבוע אחורה');
  countAsPaper(r);
  const saved = await saveReceipt(r);
  assert.equal(saved.data.docDate, shotDay);
  assert.equal(paperWriteOf(r, 'paper_77001234').data.docDay, shotDay, 'הנייר נשאר ביום הצילום');
  // תעודה מגרסה 141 שהמעבר נתן לה יום מה-timestamp (9 ימים אחורה) — אותו דבר
  const migDay = iso(days(-9));
  const m = await migratedDelivery(migDay);
  m.run(`ledgerFrom = '${iso(days(-40))}';`);
  await join(m, 'paper_77001234');
  const q = m.run('testConfirms[testConfirms.length - 1].message');
  assert.ok(q.includes('תיפתח לה קליטה מ-' + m.run(`ledgerDayShort('${migDay}')`)), q);
  await confirmLast(m);
  assert.equal(m.run('receiptDocDate'), migDay);
  // יום הצילום לפני המאזן החי (החודש נסגר מול החשבונית) — הכרטיס, השאלה והקליטה: של היום
  const c = oneButtonApp(deliveryV8({ docDate: null }, 'unreadable'));
  c.run(`ledgerFrom = '${iso(days(-40))}'; ledgerClosedThrough = '${iso(days(-8))}';`);
  c.run(shotItem(days(-10).getTime()));
  await c.run('paperIntakeRun()'); await c.run('paperJoinChain');
  assert.ok(c.run('paperIntake.items[0].join.text').includes('פותח לה קליטה של היום'), c.run('paperIntake.items[0].join.text'));
  await join(c, 'paper_77001234', 'cap0');
  assert.ok(c.run('testConfirms[testConfirms.length - 1].message').includes('תיפתח לה קליטה של היום'));
  await confirmLast(c);
  assert.equal(c.run('receiptDocDate'), null, 'הקליטה של היום');
  countAsPaper(c);
  const cs = await saveReceipt(c);
  assert.equal(cs.data.docDate, TODAY);
  assert.equal(paperWriteOf(c, 'paper_77001234').data.docDay, TODAY, 'הנייר עובר ליום של הקליטה');
  // תעודה שהיום שלה נלקח מקליטה שהיא לא נשארה בה (from: 'receiving') — קליטה חדשה ביום הצילום שלה (capturedAt)
  const recv = { kind: 'delivery', docDay: iso(days(-2)), docDayDefault: { reason: 'unreadable', printed: null, day: iso(days(-2)), from: 'receiving' }, capturedAt: days(-5).getTime(), timestamp: days(-4).getTime() };
  assert.equal(r.run(`paperNewReceivingDay(${JSON.stringify(recv)})`), iso(days(-5)));
  assert.equal(r.run(`paperCaptureDayText(${JSON.stringify(recv)})`), 'מ-' + r.run(`ledgerDayShort('${iso(days(-5))}')`));
});

test('סבב 4 (D2): תעודת משלוח שהיום שלה נקבע ונכנסת לקליטה פתוחה שעוד לא נספר בה כלום — הקליטה נשארת ביום שלה (גם בשקט, שלב 12, וגם אחרי "הכנס"); הנייר עובר אליה', async () => {
  const { join, confirmLast, countAsPaper } = await import('./one-button-helpers.mjs');
  // צולמה אתמול (חיכתה בתור), נקראה היום ונכנסה בשקט לקליטה של היום שנפתחה ועוד לא נספר בה כלום
  const r = oneButtonApp(deliveryV8({ docDate: null }, 'unreadable'));
  r.run(`receiptOpened = true; receiptEntryMode = 'manual'; receiptDocDate = null; receiptList = []; saveReceiptDraft();`);
  r.run(shotItem(days(-1).getTime()));
  await r.run('paperIntakeRun()'); await r.run('paperJoinChain');
  assert.equal(r.run('testConfirms.length'), 0, 'בלי שאלה');
  assert.equal(r.run('paperIntake.items[0].join && paperIntake.items[0].join.state'), 'joined');
  assert.equal(r.run('receiptDocDate'), null, 'הקליטה הפתוחה נשארת של היום — לא עוברת ליום הצילום של התעודה');
  countAsPaper(r);
  const saved = await saveReceipt(r);
  assert.equal(saved.data.docDate, TODAY);
  const w = paperWriteOf(r, 'paper_77001234');
  assert.equal(w.data.docDay, TODAY, 'הנייר — היום של הקליטה');
  assert.equal(w.data.docDayDefault.from, 'receiving');
  // תעודה מהמעבר (12.10) שנכנסת ב"לקליטה" → "הכנס" לקליטה הפתוחה של היום, שעוד לא נספר בה כלום
  const migDay = iso(days(-3));
  const m = await migratedDelivery(migDay);
  m.run(`receiptOpened = true; receiptEntryMode = 'manual'; receiptDocDate = null; receiptList = []; saveReceiptDraft();`);
  await join(m, 'paper_77001234');
  assert.equal(m.run('testConfirms[testConfirms.length - 1].title'), 'להכניס לקליטה הפתוחה?');
  await confirmLast(m);
  assert.equal(m.run('aiScanDocuments.length'), 1, 'נכנסה');
  assert.equal(m.run('receiptDocDate'), null, 'הקליטה נשארת מהיום שנאמר בשאלה');
  // שומר: כשאין קליטה פתוחה — "לקליטה" פותח קליטה ביום הצילום (D2)
  const n = await migratedDelivery(migDay);
  await join(n, 'paper_77001234');
  assert.equal(n.run('testConfirms[testConfirms.length - 1].title'), 'לפתוח קליטה לתעודה?');
  await confirmLast(n);
  assert.equal(n.run('receiptDocDate'), migDay);
});

test('סבב 4 (D4): נייר שהוא חלק מהקליטה הפתוחה — גם העותק שלו בענן (מטלפון אחר) לא עובר עכשיו; ועותק בענן שעבר בטלפון אחר — הקליטה עם הנייר נשמרת, והיום שלו עובר ליום הקליטה', async () => {
  const id = 'paper_77000009';
  // אותו טלפון: העותק במכשיר בקליטה הפתוחה (capA), והעותק בענן מטלפון B (capB) — אף אחד מהם לא עובר עכשיו, ובלי סימן
  const local = paper141(id, { kind: 'delivery', headerText: 'תעודת משלוח', terminalNumber: '4411', captureId: 'capA', timestamp: at('2026-10-14') });
  const cloudB = paper141(id, { kind: 'delivery', headerText: 'תעודת משלוח', terminalNumber: '4411', captureId: 'capB', deviceName: 'B' });
  const storage = new Map([['bm_paper_results_v1', JSON.stringify({ capA: { captureId: 'capA', hash: 'hA', at: 1, localOnlyReceiving: true, paper: local } })]]);
  const d = migrationApp([cloudB], { storage });
  d.run(`aiScanResponse = { scan: { documents: [] }, perDocument: [{ docIndex: 0, paperId: '${id}', captureId: 'capA' }] };`);
  const extrasBefore = json(d, `localReceivingPaperExtras('2026-10-15').extras.map(e => ({ expected: !!e.expected, guardOnly: !!e.guardOnly }))`);
  const out = plain(await d.run('paperDayMigration()'));
  assert.deepEqual(out.done, []);
  assert.ok(out.failed.includes(id));
  assert.deepEqual(d.cloud(id), JSON.parse(JSON.stringify(cloudB)), 'העותק בענן לא עבר — הוא יעבור אחרי שהקליטה תישמר');
  assert.equal(d.storage.get('bm_paper_day_default_v142'), undefined);
  assert.deepEqual(json(d, `localReceivingPaperExtras('2026-10-15').extras.map(e => ({ expected: !!e.expected, guardOnly: !!e.guardOnly }))`), extrasBefore, 'השמירה של הקליטה לא השתנתה');
  // טלפון אחר כבר העביר את העותק בענן; בקליטה הפתוחה כאן — העותק מגרסה 141 (בלי יום). הקליטה נשמרת (לא "התעודה השתנתה בענן")
  const { countAsPaper } = await import('./one-button-helpers.mjs');
  const r = oneButtonApp(deliveryV8({ docDate: null }, 'unreadable'));
  await receive(r);
  const pid = 'paper_77001234';
  r.run(`paperPatchLocal('cap0', cur => ({ ...cur, paper: { ...cur.paper, docDay: '', docDayDefault: null, capturedAt: null, state: 'needs-review', review: { notes: ['התאריך לא נקרא — הקלד אותו'], mustCheck: false } } }))`);
  const mine = json(r, 'paperLocalResults().cap0.paper');
  const migDay = iso(days(-3));
  const migrated = { ...mine, captureId: 'capB', docDayDefault: { reason: 'unreadable', printed: null, day: migDay, from: 'migration' }, docDay: migDay, state: 'accepted', review: null, rev: 2 };
  const path = r.run(`dataPath('papers', '${pid}').join('/')`);
  r.finalCloud.put(path, migrated);
  r.run(`papers = [${JSON.stringify(migrated)}]; ledgerInvalidate();`);
  countAsPaper(r);
  const saved = await saveReceipt(r);
  assert.equal(saved.data.docDate, TODAY);
  const cloud = r.finalCloud.get(path);
  assert.equal(cloud.captureId, 'capB', 'העותק בענן עודכן במקום (לא נוצר מחדש)');
  assert.equal(cloud.docDay, TODAY, 'היום של הקליטה');
  assert.equal(cloud.docDayDefault.from, 'receiving');
});

test('סבב 4 (D4/D5): טלפון בגרסה 141 ששומר את בדיקת הנייר אחרי שהמעבר נכתב, עם אותו יום — היום של העובד: בלי הערה, ותעודת משלוח לא זזה ליום הקליטה; בדיקה בגרסה 142 שלא נגעה בתאריך — היום עדיין נקבע', async () => {
  const p = paper141('paper_290090001');
  const r = migrationApp([p]);
  assert.deepEqual(plain(await r.run('paperDayMigration()')).done, [p.id]);
  const migrated = r.cloud(p.id);
  assert.equal(migrated.docDay, '2026-10-12');
  // עדכון של גרסה 141 (paperWrite שלה): אותו יום הוקלד, proof.confirmedAt — בלי docDayDefault ובלי docDayBy
  const write141 = confirmedAt => ({ ...migrated, kindKnown: true, docDay: '2026-10-12', anchors: { ...migrated.anchors, source: 'typed' },
    proof: { ...migrated.proof, unitsOk: true, linesOk: true, confirmedBy: 'טלפון 141', confirmedAt }, state: 'accepted', review: null, rev: migrated.rev + 1 });
  for (const confirmedAt of [FIXED_NOW + 60000, FIXED_NOW - 3600000]) { // גם כשהשעון של הטלפון הישן מאחר
    const after = write141(confirmedAt);
    r.finalCloud.put(r.cloudPath(p.id), after);
    r.run(`papers = papers.map(x => x.id === '${p.id}' ? ${JSON.stringify({ id: p.id, ...after })} : x); ledgerInvalidate();`);
    const live = `papers.find(x => x.id === '${p.id}')`;
    assert.equal(r.run(`paperDayDefaulted(${live})`), false, 'היום של העובד');
    assert.equal(r.run(`paperDayDefaultNote(${live})`), '', 'בלי ההערה');
    // תעודת משלוח באותו מצב — לא זזה ליום של הקליטה
    assert.equal(r.run(`paperDeliveryDayForReceipt({ ...${live}, kind: 'delivery' }, '2026-10-14')`), null);
  }
  // בדיקה בגרסה 142 שנפתחה רק כדי לתקן שורה (D5) — היום עדיין נקבע, גם אחרי האישור
  const c = await defaultedReview({});
  pickRow(c);
  await c.run('savePaperReview()');
  const upd = c.writes.filter(w => w.op === 'update' && w.path && w.path.at(-1) === 'paper_290095142').at(-1);
  assert.ok(upd.data.proof.confirmedAt > 0);
  const kept = { ...json(c, `papers.find(x => x.id === 'paper_290095142')`), ...upd.data };
  assert.equal(c.run(`paperDayDefaulted(${JSON.stringify(kept)})`), true, 'בדיקה בגרסה 142 בלי נגיעה בתאריך — עדיין נקבע');
  assert.equal(c.run(`paperDayDefaultNote(${JSON.stringify(kept)})`), NOTE);
});

test('סבב 4 (D4): המעבר רץ גם כשהמאזינים מקבלים רק את המטמון — השרת אישר אותו בלי שינוי (SDK 11: אירוע כזה מגיע רק למאזין עם includeMetadataChanges)', async () => {
  const p = paper141('paper_290090001');
  // מאזינים כמו ב-SDK האמיתי עם persistentLocalCache: קודם המטמון (fromCache: true); כשהשרת מאשר בלי שינוי —
  // אירוע רק למאזין שביקש includeMetadataChanges, ובלי שינויים במסמכים
  const listeners = [];
  const data = { papers: [p], receipts: [], returns: [], products: L.products, contacts: [], history: [], notes: [], promos: [], trash: [], actionLog: [] };
  const r = paperApp([credit142()], { returns: [], receipts: [], globals: { Date: FixedDate, orderBy: () => ({}), limit: () => ({}),
    onSnapshot(ref, opts, next) {
      const o = typeof opts === 'function' ? {} : (opts || {});
      listeners.push({ ref, o, cb: typeof opts === 'function' ? opts : next });
      return () => {};
    } } });
  r.context.testLogs = [];
  r.run(`logAction = async (...a) => { testLogs.push(a); }; startSharedReceiving = () => {}; startReturnsEvents = () => {}; startListeners();`);
  r.finalCloud.put(r.run(`dataPath('papers', '${p.id}').join('/')`), p);
  const snapOf = (ref, fromCache, changes) => {
    const key = ref.path.split('/').pop();
    if (ref.kind === 'doc') { const v = key === 'app' ? { ledgerFrom: '2026-09-01' } : null; return { id: key, exists: () => !!v, data: () => v, metadata: { fromCache } }; }
    const docs = (data[key] || []).map(({ id, ...body }) => ({ id, data: () => structuredClone(body) }));
    return { docs, empty: !docs.length, size: docs.length, metadata: { fromCache }, docChanges: () => changes ? docs.map(doc => ({ type: 'added', doc })) : [] };
  };
  for (const l of listeners) l.cb(snapOf(l.ref, true, true));
  assert.equal(r.run('ledgerSourcesReady()'), true);
  for (const f of r.callbacks.splice(0)) { try { const x = f(); if (x && typeof x.then === 'function') await x.catch(() => {}); } catch (e) {} }
  assert.equal(r.finalCloud.get(r.run(`dataPath('papers', '${p.id}').join('/')`)).state, 'needs-review', 'מהמטמון — עוד לא');
  // השרת אישר את המטמון — בלי שינוי. האירוע הזה רק מסמן: לא בונה את הרשימות מחדש (כמו קודם, כשהוא לא הגיע)
  r.run(`papers.__sameList = true; receipts.__sameList = true;`);
  assert.ok(listeners.filter(l => l.o.includeMetadataChanges).length >= 2, 'הניירות והקליטות');
  for (const l of listeners) if (l.o.includeMetadataChanges) l.cb(snapOf(l.ref, false, false));
  assert.equal(r.run('papers.__sameList === true && receipts.__sameList === true'), true, 'אירוע של מטא-דאטה בלבד לא בונה את הרשימה מחדש');
  assert.equal(r.run('paperListFromServer && receiptListFromServer'), true);
  for (const f of r.callbacks.splice(0)) { try { const x = f(); if (x && typeof x.then === 'function') await x.catch(() => {}); } catch (e) {} }
  for (let i = 0; i < 20; i++) await new Promise(res => setImmediate(res));
  const c = r.finalCloud.get(r.run(`dataPath('papers', '${p.id}').join('/')`));
  assert.equal(c.state, 'accepted', 'המעבר רץ');
  assert.equal(c.docDayDefault.from, 'migration');
  assert.ok(r.storage.get('bm_paper_day_default_v142'), 'הסימן במכשיר');
  assert.equal(r.run(`papers.find(x => x.id === '${p.id}').state`), 'accepted');
  // שומר: אירוע עם שינוי במסמכים — מטופל כרגיל (הרשימה נבנית מחדש)
  data.papers = [{ ...p, id: 'paper_290090099', number: '290090099' }, p];
  for (const l of listeners) if (String(l.ref.path).endsWith('/papers')) l.cb(snapOf(l.ref, false, true));
  assert.equal(r.run(`papers.some(x => x.id === 'paper_290090099')`), true);
});
