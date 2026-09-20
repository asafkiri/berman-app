// v89: שלוש צורות המחיר, מוכרעות לפי שורה, כשבמקבץ יש גם תעודת זיכוי.
//
// המקרה שנתפס בשטח (16.9.2026): תעודת משלוח של 16 שורות שבה "לחמניות 10
// בשקית" הגיעו במחיר המבצע שירד כבר בתעודה (₪8.50 במקום ₪10.40), ולצידה
// תעודת זיכוי אחת על ₪9.03 שמבטלת פריט במלואו. אותה תעודה בדיוק נקלטה
// בהצלחה בכל אחד מחמשת הימים שלפניה — ההבדל היחיד היה הזיכוי.
//
// שני כשלים הוכיחו את עצמם, ושניהם חייבים להישאר סגורים:
//   1. הצורה "מבצע שירד בתעודה" חיה רק בשדה צדדי, ולכן בדיקת סכום המסמך —
//      שקוראת את lineTotalExVat — הכריזה על "פער של ₪34.19 בין השורות
//      לסכום, אך הנחת המסמך לא נקראה" בכל תעודה שבה ירד מבצע.
//   2. שורת הזיכוי נספרה בפלוס בהסבר הפער בזמן ש"נטו הנייר" הפחית אותה,
//      ולכן ₪9.03 הפכו לשארית של ₪18.05 ששום הסבר לא יכול לסגור. התוצאה:
//      הצורה קרסה ל"הנחה קבועה", והמסך הראה "עודף ₪34.21" על תעודה תקינה.
//
// אין כאן נתוני לקוח: המוצרים והמחירים מ-fixture.json, הכמויות כתובות כאן.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { extractSource } from './extract.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixture.json', import.meta.url), 'utf8'));
const products = Object.entries(fixture.products).map(([id, p]) => ({ id, ...p }));
const promos = Object.entries(fixture.promos).map(([id, p]) => ({ id, ...p }));
let receiptDocDate = '2026-09-07', receiptList = [], receiptPromoOnPaper = [];
let aiScanResponse = null, aiScanDocuments = [];
const FNS = ['priceAuditCapture', 'makeOperationId', 'r2', 'fmtMoney', 'normalizeBarcode', 'productCode',
  'productListPrice', 'productDiscountPct', 'finalUnitPrice', 'promoFixedPrice', 'promoActive',
  'promoForProduct', 'promoTriggered', 'promoUnitPriceOf', 'effectivePrice', 'lineTotalFromUnit',
  'todayStr', 'activeReceiptDate', 'aiMoneyCents', 'aiDocRowUnits', 'bermanBuildCodeIndex',
  'aiActiveFixedPromoFor', 'bermanPrintedProvesPromo', 'bermanPriceForm', 'bermanAggregateForm', 'bermanAdaptScanPayload',
  'bermanFullListMatch', 'bermanPaperAnchorCheck', 'bermanSeparateDocumentsCheck', 'bermanSeparateDocumentsProblem', 'bermanPaperAnchorsFromScan',
  'bermanScanDocumentDate', 'aiPriceBreakdownRows', 'aiPriceGapContext', 'aiGapExplainedLine',
  'aiMonthEndPendingRecord'];
const CONSTS = ['const RECEIPT_ROUNDING_TOLERANCE_CENTS = 30;',
  "const BERMAN_FORM_REGULAR = 'regular';", "const BERMAN_FORM_FULL_LIST = 'full_list';",
  "const BERMAN_FORM_PROMO_ON_PAPER = 'promo_on_paper';"];
const api = eval(extractSource(FNS, CONSTS) + '\n({ ' + FNS.join(', ') + ' })');
function aiResolveInvoiceBarcode(row) { return { product: products.find(p => p.id === row.__tnuvaProductId) }; }
function findProductsByBarcode(barcode) { return products.filter(p => p.barcode === barcode); }

const byCode = code => products.find(p => p.code === String(code));
const net = (code, qty) => api.lineTotalFromUnit(byCode(code).price, qty);
const PROMO_UNIT = 8.5; // המבצע הפעיל על קוד 1231 ב-fixture

function doc(rows, total, { noteIndex = 0, credit = false, date = '07/09/2026' } = {}) {
  return { noteIndex, docNumber: null, docType: credit ? 'credit' : 'invoice', docDate: date, pageCount: 1,
    netToChargeExVat: total, totalUnits: rows.reduce((sum, r) => sum + r[1], 0), printedLines: rows.length,
    rows: rows.map(([code, quantity, unitPriceExVat], i) => ({ sourcePage: 1, lineNumber: i + 1,
      itemCode: String(code), barcode: byCode(code).barcode, description: byCode(code).name,
      quantity, unitPriceExVat, confidence: 1 })) };
}
// מריץ את הצנרת האמיתית: מתאם -> שער הצילום -> הסבר הפער.
function run(documents) {
  aiScanResponse = api.bermanAdaptScanPayload({
    scan: { documents: documents.map(d => structuredClone(d)), warnings: [] } });
  aiScanDocuments = documents.map(d => ({ noteIndex: d.noteIndex, amount: d.netToChargeExVat,
    units: d.totalUnits, lines: d.printedLines, kind: d.docType === 'credit' ? 'credit' : 'charge' }));
  const ev = { docSummaries: documents.map(d => ({ noteIndex: d.noteIndex,
    credit: d.docType === 'credit', subtotal: d.netToChargeExVat })) };
  return { gate: api.bermanPaperAnchorsFromScan(aiScanResponse), ctx: api.aiPriceGapContext(ev),
    pending: api.aiMonthEndPendingRecord(ev), adapted: aiScanResponse.scan.documents };
}

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log('✓ ' + name); }
  catch (error) { failed++; console.error('✗ ' + name + ': ' + error.message); }
}

// ===== הצורה מוכרעת בשורה, לא מהסכום =====
check('מחיר מודפס ששווה למחיר המבצע מוכרע כ"מבצע שירד בתעודה"', () => {
  const form = api.bermanPriceForm(byCode('1231'), PROMO_UNIT, '2026-09-07');
  assert.equal(form.form, 'promo_on_paper');
  assert.equal(form.unitPrice, PROMO_UNIT);
  assert.equal(form.fullListCandidate, false);
});
check('מחיר מודפס ששווה למחירון נשאר "הנחה קבועה" ומועמד למחירון מלא בלבד', () => {
  const form = api.bermanPriceForm(byCode('1231'), byCode('1231').listPrice, '2026-09-07');
  assert.equal(form.form, 'regular');
  assert.equal(form.unitPrice, byCode('1231').price);
  assert.equal(form.fullListCandidate, true);
});
check('מוצר בלי מבצע פעיל אינו מקבל צורה אחרת מהמחיר המודפס', () => {
  const form = api.bermanPriceForm(byCode('101'), byCode('101').listPrice, '2026-09-07');
  assert.equal(form.form, 'regular');
  assert.equal(form.promoFixed, 0);
  assert.equal(form.fullListCandidate, false);
});

// ===== כשל 1: בדיקת סכום המסמך קוראת את אותו מספר שהשער קורא =====
check('שורה שהמבצע ירד בה נכתבת אל כסף השורה עצמו', () => {
  const { adapted } = run([doc([[1231, 18, PROMO_UNIT]], 153)]);
  const row = adapted[0].rows[0];
  assert.equal(row.__bermanPriceForm, 'promo_on_paper');
  assert.equal(row.unitPriceExVat, PROMO_UNIT);
  assert.equal(row.lineTotalExVat, 153);
  // שני הצרכנים קוראים את אותו מספר — זה בדיוק מה שלא התקיים ב-v88.
  assert.equal(row.__bermanPaperLineTotalExVat, row.lineTotalExVat);
});
check('סכום השורות נסגר על "נטו לחיוב" ואינו מתחזה להנחת מסמך', () => {
  const rows = [[101, 30, byCode('101').listPrice], [1231, 18, PROMO_UNIT], [339, 6, byCode('339').listPrice]];
  const total = api.r2(net(101, 30) + 153 + net(339, 6));
  const { gate, adapted } = run([doc(rows, total)]);
  const summed = api.r2(adapted[0].rows.reduce((sum, r) => sum + r.lineTotalExVat, 0));
  assert.equal(summed, total);
  assert.equal(gate.ok, true);
  assert.deepEqual(gate.problems, []);
});

// ===== כשל 2: זיכוי במקבץ =====
const CHARGE = [[101, 30, byCode('101').listPrice], [1231, 18, PROMO_UNIT],
  [339, 6, byCode('339').listPrice], [3604, 1, byCode('3604').listPrice]];
const CHARGE_TOTAL = api.r2(net(101, 30) + 153 + net(339, 6) + net(3604, 1));
const CREDIT_TOTAL = net(3604, 1);

check('זיכוי במקבץ אינו מזיז את הפער — ההסבר נשאר תקף', () => {
  const { ctx } = run([doc(CHARGE, CHARGE_TOTAL),
    doc([[3604, 1, byCode('3604').listPrice]], CREDIT_TOTAL, { noteIndex: 1, credit: true })]);
  // הזיכוי מופחת משני צדי החיסור, ולכן הפער הוא אפס ולא 2×9.03.
  assert.equal(ctx.paperTotal, api.r2(CHARGE_TOTAL - CREDIT_TOTAL));
  assert.equal(ctx.appTotal, ctx.paperTotal);
  assert.equal(ctx.gap, 0);
  assert.equal(ctx.gapExplained, true);
  assert.equal(ctx.promoOnPaperRows.length, 1);
  assert.equal(ctx.promoOnPaperRows[0].product.code, '1231');
  assert.equal(ctx.promoOnPaperTotal, api.r2((PROMO_UNIT - byCode('1231').price) * 18));
});
check('אותה תעודה בלי הזיכוי מתנהגת זהה — הזיכוי לא היה אמור לשנות דבר', () => {
  const withCredit = run([doc(CHARGE, CHARGE_TOTAL),
    doc([[3604, 1, byCode('3604').listPrice]], CREDIT_TOTAL, { noteIndex: 1, credit: true })]);
  const alone = run([doc(CHARGE, CHARGE_TOTAL)]);
  assert.equal(alone.ctx.gapExplained, withCredit.ctx.gapExplained);
  assert.equal(alone.ctx.gap, withCredit.ctx.gap);
  assert.equal(alone.ctx.promoOnPaperTotal, withCredit.ctx.promoOnPaperTotal);
});
check('שורת הזיכוי עצמה אינה נספרת כשורת מבצע שמסבירה פער', () => {
  const { ctx } = run([doc(CHARGE, CHARGE_TOTAL),
    doc([[1231, 2, PROMO_UNIT]], 17, { noteIndex: 1, credit: true })]);
  assert.ok(ctx.promoOnPaperRows.every(r => !r.credit));
});
check('המשפט למשתמש נאמר גם כשיש זיכוי במקבץ', () => {
  const { ctx } = run([doc(CHARGE, CHARGE_TOTAL),
    doc([[3604, 1, byCode('3604').listPrice]], CREDIT_TOTAL, { noteIndex: 1, credit: true })]);
  const line = api.aiGapExplainedLine(ctx);
  assert.match(line, /כבר במחיר המבצע/);
  assert.match(line, /אפשר לקלוט/);
});

// ===== מה שאסור שההקלה תבלע =====
check('חוסר כסף אמיתי לצד מבצע שירד בתעודה נשאר פער לא מוסבר', () => {
  const { ctx, gate } = run([doc(CHARGE, api.r2(CHARGE_TOTAL + 12.4))]);
  assert.equal(ctx.gapExplained, false);
  assert.equal(gate.ok, false);
});
check('זיכוי בסכום שגוי אינו נבלע בהסבר המבצע', () => {
  const { ctx } = run([doc(CHARGE, CHARGE_TOTAL),
    doc([[3604, 1, byCode('3604').listPrice]], api.r2(CREDIT_TOTAL + 5), { noteIndex: 1, credit: true })]);
  assert.equal(ctx.gapExplained, false);
  assert.notEqual(ctx.gap, 0);
});
check('מחירון מלא עדיין מוכרע מהחשבון ושומר על קיזוז המרכזת', () => {
  // אקטיב מגיע במחירון מלא: אין הנחה קבועה בשורה, והמבצע יקוזז במרכזת.
  const rows = [[101, 30, byCode('101').listPrice], [339, 6, byCode('339').listPrice]];
  const total = api.r2(net(101, 30) + api.lineTotalFromUnit(byCode('339').listPrice, 6));
  const { ctx, pending } = run([doc(rows, total)]);
  assert.equal(ctx.gapExplained, true);
  assert.ok(ctx.fullListRow);
  assert.equal(ctx.fullListRow.product.code, '339');
  assert.ok(pending && pending.expectedRebate > 0);
});
check('מבצע שירד בתעודה ומחירון מלא יחד — שניהם מוסברים באותה תעודה', () => {
  const rows = [[1231, 18, PROMO_UNIT], [339, 6, byCode('339').listPrice]];
  const total = api.r2(153 + api.lineTotalFromUnit(byCode('339').listPrice, 6));
  const { ctx, pending } = run([doc(rows, total)]);
  assert.equal(ctx.gapExplained, true);
  assert.equal(ctx.promoOnPaperRows.length, 1);
  assert.ok(ctx.fullListRow && ctx.fullListRow.product.code === '339');
  // הקיזוז הצפוי במרכזת הוא של האקטיב בלבד; על הלחמניות אין מה לקזז.
  assert.equal(pending.productId, byCode('339').id);
});

console.log(passed + '/' + (passed + failed) + ' passed');
if (failed) process.exit(1);
