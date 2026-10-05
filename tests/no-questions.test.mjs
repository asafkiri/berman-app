// v130 — הכל בקליטה, בלי שאלות. נייר "ת.משלוח" קטן מהמסופון (מספר 2900, בלי מספר פנימי) הוא חלק מהקליטה,
// כמו תעודת המשלוח הגדולה: נכנס לבד לקליטה הפתוחה (גם מיום אחר בשבוע האחרון) או פותח קליטה, בלי לשאול.
// סופרים מה שהגיע (או "לא הגיע כלום"), ובסוף — המאזן במשפט אחד.
// מה שנבדק:
// - הנייר הקטן נקרא כתעודת משלוח (small), לא כנייר חיוב.
// - בלי קליטה פתוחה: פותח קליטה לבד, בלי "לפתוח קליטה לתעודה?" — גם כשהוא מלפני 3 ימים.
// - עם קליטה פתוחה מהיום: מתווסף לבד (תעודה גדולה מיום אחר — עדיין שאלה, כמו קודם).
// - נייר קטן ישן מדי (יותר משבוע) — כמו כל תעודה: שאלה.
// - אחרי השמירה: "התעודה נקלטה ✓ · במאזן: …" / "הכל מאוזן מול ברמן".
// הרצה: node --test tests/no-questions.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { app, days, delivery, printed, readPapers, receive, state } from './one-button-helpers.mjs';
import { runtime, fixture } from './receipt-scan-harness.mjs';

// נייר "ת.משלוח" קטן כפי שהשרת (v7) מחזיר אותו
const small = (number = '290095177', d = days(-3)) => delivery(number, { internalNumber: null, headerText: 'ת.משלוח', docDate: printed(d) });

test('נייר "ת.משלוח" קטן — תעודת משלוח קטנה; בלי קליטה פתוחה הוא פותח קליטה לבד, גם מלפני 3 ימים', async () => {
  const r = app(small());
  await readPapers(r);
  const p = JSON.parse(r.run(`JSON.stringify(paperFind('paper_290095177').paper)`));
  assert.equal(p.kind, 'delivery'); assert.equal(p.small, true);
  assert.equal(r.run(`paperLabel(paperFind('paper_290095177').paper)`).startsWith('נייר המשלוח הקטן 95177'), true);
  assert.equal(r.run('testConfirms.length'), 0, 'בלי שאלה');
  assert.equal(r.run('receiptOpened'), true, 'נפתחה קליטה עם הנייר');
  assert.match(r.run('paperIntakeItemHtml(paperIntake.items[0])'), /נכנסה לקליטה/);
  assert.equal(state(r).st, 'ok'); assert.equal(state(r).docs.length, 1);
  assert.equal(r.requests.length, 1, 'בלי קריאה נוספת');
  // תעודה גדולה מאותו יום — עדיין שואלת (כמו קודם)
  const b = app(delivery('77001234', { docDate: printed(days(-3)) }));
  await readPapers(b);
  assert.equal(b.run(`receivingDeliveryRoute(paperIntake.items[0].scan, paperFind('paper_77001234').paper, null, {}).reason`), 'date-new');
});

test('עם קליטה פתוחה מהיום — הנייר הקטן מלפני יומיים מתווסף לבד; נייר קטן מלפני 9 ימים — שאלה', async () => {
  const r = app(delivery('77001234'));
  await receive(r);
  r.serve(small('290095180', days(-2)));
  await readPapers(r, 1, 1);
  assert.equal(r.run('testConfirms.length'), 0, 'בלי שאלה');
  assert.deepEqual(state(r).nums, ['77001234', '290095180']);
  const o = app(delivery('77001234'));
  await receive(o);
  o.serve(small('290095181', days(-9)));
  await readPapers(o, 1, 1);
  assert.equal(o.run(`receivingDeliveryRoute(paperIntake.items.find(x => x.captureId === 'cap1').scan, paperFind('paper_290095181').paper, null, {}).reason`), 'other-receiving');
  assert.equal(state(o).docs.length, 1, 'מיום רחוק — לא נכנס לבד');
});

test('אחרי השמירה — המאזן במשפט אחד', () => {
  const L = JSON.parse(fs.readFileSync(new URL('./ledger-2026-10.json', import.meta.url), 'utf8'));
  const r = runtime({ data: { ...fixture(), products: L.products } });
  r.context.testL = { receipts: L.receipts.slice().reverse(), returns: L.returns.slice().reverse(), papers: [L.papers.p141, L.papers.p142] };
  r.run(`receipts = testL.receipts; returns = testL.returns; papers = testL.papers; todayStr = () => '2026-10-05'; ledgerInvalidate();`);
  assert.equal(r.run('receivingBalanceLine()'), 'במאזן: חויבת פעמיים על לחמניות 10 בשקית ×2 — לבקש זיכוי מהנהג · תיקון של ברמן התקזז: לחם אחיד ברמן ×13');
  r.run(`todayStr = () => '2026-10-20'; ledgerInvalidate();`);
  assert.doesNotMatch(r.run('receivingBalanceLine()'), /תיקון של ברמן/, 'תיקון ישן — לא חוזר בכל שמירה');
  r.run(`todayStr = () => '2026-10-05'; ledgerInvalidate();`);
  r.run(`receipts = [{ id: 'rc_ok', date: '2026-10-04', timestamp: 1, items: [{ productId: 'code_101', name: 'x', qty: 3, noteQty: 3 }] }]; returns = []; papers = []; ledgerInvalidate();`);
  assert.equal(r.run('receivingBalanceLine()'), 'הכל מאוזן מול ברמן');
});

test('סקירה 8: נייר קטן מחודש אחר — לא נכנס לבד (ברמן מחייבת אותו בחודש שהודפס); מאותו חודש — כן', async () => {
  const r = app(small('290095177', days(-3)));
  await readPapers(r);
  // הקליטה של היום (מדומה) בתחילת חודש, והנייר מסוף החודש הקודם — 3 ימים אחורה
  const p = JSON.parse(r.run(`JSON.stringify(paperFind('paper_290095177').paper)`));
  r.context.testP = { ...p, docDay: '2026-10-30' };
  r.run(`todayStr = () => '2026-11-02'; receiptDocDate = null;`);
  const scan = `paperIntake.items[0].scan`;
  r.run(`receiptOpened = false; receiptList = []; aiScanResponse = null; receiptNotes = []; aiScanDocuments = []; receiptPaperScanState = null; reconcileData = null; pendingReceipt = null;`);
  assert.equal(r.run(`receivingDraftEmpty()`), true);
  assert.equal(r.run(`receivingDeliveryRoute(${scan}, testP, null, { fresh: true }).reason`), 'date-new', 'חודש אחר — שואלים');
  r.context.testP = { ...p, docDay: '2026-11-01' };
  assert.equal(r.run(`receivingDeliveryRoute(${scan}, testP, null, { fresh: true }).action`), 'new', 'אותו חודש — נכנס לבד');
});

// ===== סבב סקירה 2 =====
const L2 = JSON.parse(fs.readFileSync(new URL('./ledger-2026-10.json', import.meta.url), 'utf8'));
function ledgerApp(recs, rets, papersList) {
  const r = runtime({ data: { ...fixture(), products: L2.products } });
  r.context.testL = { receipts: recs, returns: rets, papers: papersList };
  r.run(`receipts = testL.receipts; returns = testL.returns; papers = testL.papers; todayStr = () => '2026-10-05'; ledgerInvalidate();`);
  return r;
}

test('סבב 2: ההודעה אחרי שמירה מחושבת עם הקליטה שנשמרה עכשיו (גם לפני שהענן החזיר אותה), בלי לשנות את הרשימה', () => {
  const r = ledgerApp([], [], []);
  r.context.saved = { id: 'rc_new', date: '2026-10-05', docDate: '2026-10-05', timestamp: 1, paperDocs: [{ number: '244799991' }], items: [{ productId: 'code_101', code: '101', name: 'אחיד פרוס', qty: 7, noteQty: 10 }] };
  assert.match(r.run('receivingBalanceLine(saved)'), /^במאזן: חוסר בקליטה של 5\.10: .* ×3 — חויבת ולא קיבלת/);
  assert.equal(r.run('receipts.length'), 0, 'הרשימה לא השתנתה');
  assert.equal(r.run('currentLedger().count'), 0, 'והמאזן חזר לרשימה האמיתית');
});

test('סבב 2: קליטה שנשמרה בלי נייר — לא "הכל מאוזן", אלא ממתין לנייר', () => {
  const r = ledgerApp([{ id: 'rc_bare', date: '2026-10-04', docDate: '2026-10-04', timestamp: 1, noDoc: true, noteParts: [], items: [{ productId: 'code_101', code: '101', name: 'x', qty: 3 }] },
    { id: 'rc_ok', date: '2026-10-05', docDate: '2026-10-05', timestamp: 2, paperDocs: [{ number: '244799992' }], items: [{ productId: 'code_101', code: '101', name: 'x', qty: 3, noteQty: 3 }] }], [], []);
  assert.equal(r.run('receivingBalanceLine()'), 'אין מה לבקש מהנהג כרגע · דבר אחד ממתין לנייר (במאזן)');
});

test('סבב 2: כרטיס הנייר — רק השורה שזוהתה כתיקון "(התקזז)"; השורה השנייה של אותו מוצר — בלי עודף מתאים', () => {
  const ch = { ...L2.papers.p141, rows: [L2.papers.p141.rows[0], L2.papers.p141.rows[1], { ...L2.papers.p141.rows[0], line: 3, qty: 2 }] };
  const r = ledgerApp(L2.receipts.slice().reverse(), L2.returns.slice().reverse(), [ch, L2.papers.p142]);
  const t = r.run(`paperAttachShown(papers[0])`);
  assert.match(t, /תיקון של ברמן: .* ×13 \(התקזז\)/);
  assert.match(t, /שורה אחת בלי עודף מתאים בקליטה/);
  assert.doesNotMatch(t, /×2 \(התקזז\)/);
});

// סבב 3: קליטה שנשמרה בלי נייר — הניירות שלה מצטרפים אליה, גם הנייר הקטן (מה שהגיע איתו נספר שם). פתיחת
// קליטה נפרדת לנייר הקטן הייתה מושכת אליה גם את התעודה הגדולה, והספירה שבקליטה הישנה לא הייתה מקבלת נייר
test('סבב 3: נייר קטן ביום שיש בו קליטה שנשמרה בלי נייר — מצטרף אליה (כמו התעודה הגדולה)', async () => {
  const d = days(-1).toLocaleDateString('en-CA');
  const bare = { id: 'rc_bare', date: d, docDate: d, noDoc: true, noteParts: [], items: [{ productId: 'code_101', name: 'אחיד', qty: 12 }], timestamp: 1 };
  const r = app(small('290095177', days(-1)), { receipts: [bare] });
  await readPapers(r);
  assert.equal(r.run(`receivingDeliveryRoute(paperIntake.items[0].scan, paperFind('paper_290095177').paper, null, {}).reason`), 'bare');
});

test('סבב 2: תעודה גדולה ונייר קטן עם אותו מוצר — הספירה שתואמת לשניהם לא שואלת "פער בספירת הפריטים"', async () => {
  const r = app(delivery('77001234'));
  await receive(r);
  r.serve(small('290095180', days(0)));
  await readPapers(r, 1, 1);
  assert.deepEqual(state(r).nums, ['77001234', '290095180']);
  r.run(`receiptList = receiptQuantityPaperRows().map(x => ({ productId: x.productId, name: x.name, barcode: x.barcode, qty: x.paperQty })); receiptDupConfirmed = true; saveReceiptDraft(); finishReceipt();`);
  assert.ok(!JSON.parse(r.run('JSON.stringify(testConfirms.map(c => c.title))')).some(t => /פער בספירת הפריטים/.test(t)));
  assert.ok(r.run('!!pendingReceipt || currentView === "reconcile"'), 'ממשיך לסיכום');
});

test('סבב 3: כמה ניירות ושורות שאי אפשר לצרף (למשל צירוף לקליטה שנשמרה) — בלי "פער בספירת הפריטים" על סכום השורות המודפסות', async () => {
  const r = app(delivery('77001234'));
  await receive(r);
  r.serve(small('290095180', days(0)));
  await readPapers(r, 1, 1);
  r.run(`receiptList = receiptQuantityPaperRows().map(x => ({ productId: x.productId, name: x.name, barcode: x.barcode, qty: x.paperQty })); receiptDupConfirmed = true; saveReceiptDraft();
    receiptQuantityPaperRows = () => null; finishReceipt();`);
  assert.ok(!JSON.parse(r.run('JSON.stringify(testConfirms.map(c => c.title))')).some(t => /פער בספירת הפריטים/.test(t)));
});
