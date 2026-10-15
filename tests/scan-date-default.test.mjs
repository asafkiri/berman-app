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
const NOTE_RETURN = 'תאריך התעודה לא נקרא בוודאות — נקבע תאריך ההחזרה; אפשר לשנות';
const V7_DATE_WARNING = 'לא ניתן לאמת את הקריאה: תאריך. בדוק את המספר המודפס.';
const json = (r, code) => JSON.parse(r.run('JSON.stringify(' + code + ')'));

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
  assert.deepEqual(p.docDayDefault, { reason: 'disputed', printed: '04/10/2026', day: TODAY, from: 'receiving' });
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
  assert.deepEqual(paperOf(future).docDayDefault, { reason: 'future', printed: printed(days(1)), day: TODAY, from: 'receiving' });
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

test('נייר שצולם מכרטיס ההחזרה — התאריך שלא נקרא הוא יום ההחזרה, וההערה אומרת זאת', async () => {
  const r = paperApp([credit142({ docDate: null }, { docDateUnreliable: [{ noteIndex: 0, reason: 'unreadable' }] })]);
  await intake(r, R1004);
  const p = paperOf(r);
  assert.equal(p.state, 'accepted');
  assert.equal(p.docDay, '2026-10-04', 'יום ההחזרה');
  assert.equal(p.docDayDefault.from, 'return');
  assert.equal(p.attach.type, 'return'); assert.equal(p.attach.id, R1004);
  assert.ok(r.run('paperIntakeItemHtml(paperIntake.items[0])').includes(NOTE_RETURN));
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
// שעון קבוע (15.10.2026, 12:00 בירושלים) לבדיקות שתלויות בחלון השיוך של 14 יום סביב ההחזרה מ-4.10
const FIXED_NOW = Date.UTC(2026, 9, 15, 9, 0);
class FixedDate extends Date {
  constructor(...a) { super(...(a.length ? a : [FIXED_NOW])); }
  static now() { return FIXED_NOW; }
}
const pinned = { globals: { Date: FixedDate } };

test('נייר זיכוי שהתאריך שלו לא נקרא היטב ומשתייך לבד להחזרה — היום של ההחזרה (לא יום הצילום), וההערה אומרת זאת', async () => {
  for (const [reason, resp] of [['disputed', credit142({ docDate: '06/10/2026' }, { docDateUnreliable: [{ noteIndex: 0, reason: 'disputed' }] })],
    ['unreadable', credit142({ docDate: null }, { docDateUnreliable: [{ noteIndex: 0, reason: 'unreadable' }] })]]) {
    const r = paperApp([resp], pinned);
    assert.equal(r.run('todayStr()'), '2026-10-15');
    await intake(r);
    const p = paperOf(r);
    assert.equal(p.state, 'accepted', reason);
    assert.equal(p.attach.type, 'return'); assert.equal(p.attach.id, R1004);
    assert.equal(p.docDay, '2026-10-04', 'היום של ההחזרה שהנייר משתייך אליה');
    assert.deepEqual(p.docDayDefault, { reason, printed: reason === 'disputed' ? '06/10/2026' : null, day: '2026-10-04', from: 'return', returnId: R1004 });
    assert.ok(r.run('paperIntakeItemHtml(paperIntake.items[0])').includes(NOTE_RETURN));
    assert.equal(r.requests.length, 1, 'בלי קריאה נוספת');
    assert.equal(r.run(`currentLedger().states['paper_290095142']`), 'counted');
  }
  // אותו נייר בלי החזרה שהוא משתייך אליה — יום הצילום
  const none = paperApp([credit142({ docDate: null }, { docDateUnreliable: [{ noteIndex: 0, reason: 'unreadable' }] })], { ...pinned, returns: [] });
  await intake(none);
  assert.equal(paperOf(none).docDay, '2026-10-15');
  assert.equal(paperOf(none).docDayDefault.from, 'receiving');
});

test('המרכזת: נייר זיכוי שהיום שלו נקבע (התאריך לא נקרא היטב) נשאר בחודש של ההחזרה; נייר שהודפס בחודש אחר — ביום המודפס, כמו קודם', () => {
  const r = paperApp([credit142()], pinned);
  const row = (line, code, qty) => ({ line, itemCode: code, barcode: null, description: '', qty, productId: 'code_' + code });
  const mk = (docDay, extra = {}) => ({ schema: 1, state: 'accepted', timestamp: 5, id: 'paper_290099999', kind: 'credit', number: '290099999', docDay,
    rows: [row(1, '2381', 3), row(2, '2387', 2)], ...extra });
  const matrix = p => json(r, `(() => { const p = ${JSON.stringify(p)};
    const lg = paperLedger({ recs: receipts, rets: returns, papers: [p], from: '2026-09-01', asOf: '2026-10-05' });
    return { attach: ((lg.placed || []).find(x => x.id === p.id) || {}).attach || null,
      adj: ledgerMatrixAdjust(lg, '2026-09-01', '2026-10-05', [p]).filter(x => x.papers.includes(p.id)).map(x => [x.key, x.day]) }; })()`);
  const R0928 = 'returns_9f0d5217-6358-479f-82c8-42200d902895';
  const real = matrix(mk('2026-09-29'));
  assert.equal(real.attach.id, R0928);
  assert.deepEqual(real.adj, [['code_2381', '2026-09-28']], 'הודפס ב-29.9 — ביום ההחזרה');
  const defaulted = matrix(mk('2026-10-01', { docDayDefault: { reason: 'disputed', printed: '29/09/2026', day: '2026-10-01', from: 'receiving' } }));
  assert.equal(defaulted.attach.id, R0928);
  assert.deepEqual(defaulted.adj, [['code_2381', '2026-09-28']], 'היום שנקבע אינו חודש מודפס — הזיכוי לא עובר לאוקטובר');
  // שומר: נייר שבאמת הודפס ב-1.10 — ביום המודפס (כלל v128)
  assert.deepEqual(matrix(mk('2026-10-01')).adj, [['code_2381', '2026-10-01']]);
  // העובד שינה את היום (טלפון ישן השאיר את הסימן) — היום שלו, כמו מודפס
  assert.deepEqual(matrix(mk('2026-10-01', { docDayDefault: { reason: 'disputed', printed: '29/09/2026', day: '2026-10-02', from: 'receiving' } })).adj, [['code_2381', '2026-10-01']]);
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

test('נייר "ת.משלוח" קטן שהיום שלו נקבע — לא נכנס לבד לקליטה פתוחה מיום אחר בגלל "אותו חודש"; נייר קטן מהיום — כן', async () => {
  const r = oneButtonApp(deliveryV8({ docDate: printed(days(-1)) }, null));
  await receive(r);
  assert.equal(r.run('receiptDocDate'), iso(days(-1)), 'הקליטה הפתוחה מאתמול');
  const scan = json(r, `paperIntake.items[0].scan`);
  const base = json(r, `paperFind('paper_77001234').paper`);
  const route = paper => json(r, `receivingDeliveryRoute(${JSON.stringify(scan)}, ${JSON.stringify(paper)}, null, {})`);
  const small = { ...base, id: 'paper_290012345', number: '290012345', captureId: 'capS', small: true, docDay: TODAY };
  const defaulted = route({ ...small, docDayDefault: { reason: 'unreadable', printed: null, day: TODAY, from: 'receiving' } });
  assert.equal(defaulted.action, 'ask');
  assert.equal(defaulted.reason, 'other-receiving');
  if (iso(days(-1)).slice(0, 7) === TODAY.slice(0, 7)) assert.equal(route(small).action, 'append', 'נייר קטן שנקרא מהיום, באותו חודש — נכנס לבד (v130)');
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

test('נייר זיכוי שהיום שלו נקבע לפי ההחזרה — כשתאריך ההחזרה נקבע אחר כך (openReturnDateEdit), הנייר נשאר שלה והיום הולך איתה; הזיכוי לא עובר לחודש אחר', async () => {
  const rets = L.returns.map(x => x.id === R1004 ? { ...x, docDate: '2026-10-03' } : x);
  const r = paperApp([credit142({ docDate: null }, { docDateUnreliable: [{ noteIndex: 0, reason: 'unreadable' }] })], { ...pinned, returns: rets });
  await intake(r);
  const p = paperOf(r);
  assert.equal(p.attach.id, R1004);
  assert.equal(p.docDay, '2026-10-03');
  assert.equal(p.docDayDefault.returnId, R1004, 'ההחזרה שהיום נלקח ממנה');
  // העובד קובע לתעודת ההחזרה את התאריך המודפס (4.10)
  r.run(`returns = returns.map(x => x.id === '${R1004}' ? { ...x, docDate: '2026-10-04' } : x); ledgerInvalidate();`);
  const lg = json(r, `(() => { const lg = currentLedger(); const pl = lg.placed.find(x => x.id === 'paper_290095142');
    return { st: lg.states['paper_290095142'], attach: pl && pl.attach, day: pl && pl.docDay,
      adj: ledgerMatrixAdjust(lg, '2026-09-01', '2026-10-15', papers).filter(x => x.papers.includes('paper_290095142')).map(x => x.day) }; })()`);
  assert.equal(lg.st, 'counted');
  assert.equal(lg.attach.type, 'return');
  assert.equal(lg.attach.id, R1004, 'לא נצמד להחזרה ישנה יותר');
  assert.equal(lg.day, '2026-10-04', 'היום הולך אחרי ההחזרה');
  assert.ok(lg.adj.every(d => d >= '2026-10-01'), 'שום זיכוי לא עבר לספטמבר: ' + lg.adj.join(','));
  // אותו דבר לנייר שצולם מכרטיס ההחזרה (forReturnId)
  const c = paperApp([credit142({ docDate: null }, { docDateUnreliable: [{ noteIndex: 0, reason: 'unreadable' }] })], { ...pinned, returns: rets });
  await intake(c, R1004);
  assert.equal(paperOf(c).docDay, '2026-10-03');
  c.run(`returns = returns.map(x => x.id === '${R1004}' ? { ...x, docDate: '2026-10-04' } : x); ledgerInvalidate();`);
  assert.equal(c.run(`currentLedger().placed.find(x => x.id === 'paper_290095142').docDay`), '2026-10-04');
  // החזרה זהה שנרשמה אחר כך באותו יום — הנייר נשאר של ההחזרה שהיום שלו נלקח ממנה (לא הופך לשאלה, לא עובר)
  r.run(`returns = returns.concat([{ ...returns.find(x => x.id === '${R1004}'), id: 'returns_same_day_copy', timestamp: 99 }]); ledgerInvalidate();`);
  const again = json(r, `(() => { const lg = currentLedger(); const pl = lg.placed.find(x => x.id === 'paper_290095142'); return { st: lg.states['paper_290095142'], id: pl && pl.attach.id }; })()`);
  assert.equal(again.st, 'counted');
  assert.equal(again.id, R1004);
  // שומר: יום שהעובד קבע (docDayBy) לא זז עם ההחזרה
  const u = json(r, `paperDayFollowLinked({ ...paperFind('paper_290095142').paper, docDay: '2026-10-02', docDayBy: 'user' }, id => '2026-10-04').docDay`);
  assert.equal(u, '2026-10-02');
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
