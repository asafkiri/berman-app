// v89 מקצה לקצה, במודול האפליקציה המלא: משלוח של תעודת חיוב + תעודת זיכוי,
// שבו מוצר אחד הגיע כבר במחיר המבצע ומוצר אחר בוטל במלואו בזיכוי.
//
// זה המסך שהמשתמש ראה ב-16.9.2026: "צריך בדיקה", "עודף ₪34.21", וכפתור
// כחול "קלוט ותטפל בהפרש אחר כך" — על תעודה שכל שורה בה חויבה נכון. הבדיקה
// רצה על הצנרת האמיתית (סריקה -> הערכה -> מסך ההשוואה -> החלה) ואינה מדמה
// אף חישוב. אין בה נתוני לקוח: המוצרים והמחירים מוגדרים כאן.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './receipt-scan-harness.mjs';

const r2 = n => Math.round(n * 100) / 100;
const BUNS = { id: 'buns', code: '1231', barcode: '498256', name: 'לחמניות עשרייה בדיקה',
  listPrice: 20.46, price: 10.399818, discountPct: 49.17, discountSet: true };
const BREAD = { id: 'bread', code: '101', barcode: '497112', name: 'לחם פרוס בדיקה',
  listPrice: 6.24, price: 5.7408, discountPct: 8, discountSet: true };
const FRENA = { id: 'frena', code: '3604', barcode: '4033569', name: 'פרנה בדיקה',
  listPrice: 12.9, price: 9.03, discountPct: 30, discountSet: true };
const PROMO_UNIT = 8.5;
const products = [BREAD, BUNS, FRENA];
const promos = [{ id: 'promo-buns', name: 'לחמניות עשרייה — ממכתב מבצעים', productIds: [BUNS.id],
  fixedPrice: PROMO_UNIT, pct: 0, type: 'receipt', minQty: 1, minUnit: 'unit',
  start: '2026-09-01', end: '2026-10-31' }];

// התעודה: 30 לחם במחירון, 18 לחמניות במחיר המבצע, פרנה אחת שתזוכה כולה.
const CHARGE_ROWS = [[BREAD, 30, BREAD.listPrice], [BUNS, 18, PROMO_UNIT], [FRENA, 1, FRENA.listPrice]];
const CHARGE_TOTAL = r2(r2(BREAD.price * 30) + r2(PROMO_UNIT * 18) + r2(FRENA.price * 1));
const CREDIT_TOTAL = r2(FRENA.price * 1);

function document(rows, total, { credit = false } = {}) {
  return { noteIndex: 0, docType: credit ? 'credit' : 'invoice', docNumber: credit ? 'C-1' : 'D-1',
    docDate: '09/09/2026', pageCount: 1, netToChargeExVat: total,
    totalUnits: rows.reduce((sum, r) => sum + r[1], 0), printedLines: rows.length, warnings: [],
    rows: rows.map(([p, quantity, unitPriceExVat], i) => ({ sourcePage: 1, lineNumber: i + 1,
      itemCode: p.code, barcode: p.barcode, description: p.name, quantity, unitPriceExVat, confidence: 0.99 })) };
}
const payload = doc => ({ ok: true, serviceVersion: 5, model: 'fixture', requestId: 'fixture',
  scan: { warnings: [], documents: [doc] } });

// הסחורה שנספרה בפועל: הפרנה בוטלה בזיכוי ולכן לא התקבלה.
const COUNTED = [{ productId: BREAD.id, name: BREAD.name, barcode: BREAD.barcode, qty: 30 },
  { productId: BUNS.id, name: BUNS.name, barcode: BUNS.barcode, qty: 18 }];

async function deliveryWithCredit(overrides = {}) {
  const data = { products, promos, items: COUNTED,
    paper: payload(document(CHARGE_ROWS, overrides.chargeTotal ?? CHARGE_TOTAL)) };
  const r = runtime({ data });
  const queue = [data.paper, payload(document([[FRENA, 1, FRENA.listPrice]],
    overrides.creditTotal ?? CREDIT_TOTAL, { credit: true }))];
  r.context.fetch = async (url, options) => {
    r.requests.push({ url: String(url), body: options.body });
    const value = queue.shift();
    assert.ok(value, 'unexpected extra scan request');
    return { ok: true, status: 200, json: async () => structuredClone(value) };
  };
  r.run(`receiptOpened = true; receiptDocDate = '2026-09-09'; receiptList = [];
    bermanSeedPhotoFirstScan(2);
    aiScanDocuments.forEach(d => { d.pages = [{ dataUrl: 'data:image/jpeg;base64,Zml4dHVyZQ==', orientationConfirmed: true }]; });`);
  await r.run('bermanRunPaperScanInBackground()');
  r.run('receiptList = structuredClone(testData.items); saveReceiptDraft(); openReconcile();');
  r.run('aiRefreshScanEvaluation();');
  return r;
}
const json = (r, code) => JSON.parse(r.run('JSON.stringify(' + code + ')'));

test('a credit note in the batch no longer breaks a promotion that came down on the paper', async () => {
  const r = await deliveryWithCredit();
  assert.equal(r.requests.length, 2);
  assert.equal(r.run('receiptPaperScanState'), 'ok');
  // הנטו שהאפליקציה מודדת מולו הוא נטו הנייר אחרי הזיכוי.
  assert.equal(r.run('r2(receiptNoteTotal)'), r2(CHARGE_TOTAL - CREDIT_TOTAL));
  // v88 נעצר כאן על שתי שגיאות: "פער בין השורות לסכום" ו"סך הנחות המסמך".
  assert.deepEqual(json(r, 'aiScanEvaluation.errors'), []);
  assert.equal(r.run('aiScanEvaluation.valid'), true);
  assert.equal(r.run('aiScanEvaluation.totalVerified'), true);
});

test('the promotion line is billed at the promotion price, with no phantom surplus', async () => {
  const r = await deliveryWithCredit();
  const ctx = json(r, 'aiPriceGapContext(aiScanEvaluation)');
  assert.equal(ctx.gap, 0);
  assert.equal(ctx.gapExplained, true);
  assert.equal(ctx.promoOnPaperRows.length, 1);
  assert.equal(ctx.promoOnPaperRows[0].product.id, BUNS.id);
  // v88 הראה כאן "עודף ₪34.21" — 18 יחידות × ההפרש בין 10.40 ל-8.50.
  assert.deepEqual(json(r, 'aiScanEvaluation.findings.map(f => f.type)').filter(t => t !== 'printed_promo'), []);
});

test('applying the scan writes the paper price and records the promotion on the line', async () => {
  const r = await deliveryWithCredit();
  r.click('ai-apply');
  const line = json(r, 'reconcileData.find(l => l.productId === ' + JSON.stringify(BUNS.id) + ')');
  assert.equal(r2(line.price), PROMO_UNIT);
  assert.equal(line.noteQty, 18);
  assert.ok(line.promoOnPaper, 'המבצע שירד בתעודה חייב להירשם על השורה');
  assert.equal(r2(line.promoOnPaper.promoFixedPrice), PROMO_UNIT);
  assert.equal(r2(line.promoOnPaper.expectedNet), r2(BUNS.price));
  // התעודה נסגרת על נטו הנייר, בלי הפרש פתוח.
  assert.equal(r.run('reconcileIsBalanced()'), true);
  const bread = json(r, 'reconcileData.find(l => l.productId === ' + JSON.stringify(BREAD.id) + ')');
  assert.equal(bread.promoOnPaper, undefined);
});

test('the cancelled product is not claimed and not counted as a shortage', async () => {
  const r = await deliveryWithCredit();
  assert.match(json(r, 'aiScanEvaluation.warnings').join(' · '), /בוטלו במלואם בזיכוי/);
  assert.equal(r.run('aiScanEvaluation.aggregates.has(' + JSON.stringify(FRENA.id) + ')'), false);
  assert.equal(r.run('reconcileScannedUnits()'), 48);
});

test('a real money gap alongside the promotion still blocks closing', async () => {
  const r = await deliveryWithCredit({ chargeTotal: r2(CHARGE_TOTAL + 15) });
  assert.equal(r.run('aiScanEvaluation.valid'), false);
  assert.equal(r.run('aiPriceGapContext(aiScanEvaluation).gapExplained'), false);
});

test('closing with an open gap still bills the promotion line at the paper price', async () => {
  // הפער האמיתי אינו קשור למבצע, ולכן אסור שהוא יגרור את המבצע איתו —
  // זה בדיוק מה שקרה ב-v88, שם כל הצורות נגזרו מסגירת הסכום הכולל.
  const r = await deliveryWithCredit({ chargeTotal: r2(CHARGE_TOTAL + 15) });
  r.click('ai-close-receipt');
  const line = json(r, 'reconcileData.find(l => l.productId === ' + JSON.stringify(BUNS.id) + ')');
  assert.equal(r2(line.price), PROMO_UNIT);
  assert.ok(line.promoOnPaper);
});

test('a credit for an amount the paper does not support still blocks closing', async () => {
  const r = await deliveryWithCredit({ creditTotal: r2(CREDIT_TOTAL + 7) });
  assert.equal(r.run('aiScanEvaluation.valid'), false);
});

test('a draft saved before the per-line decision is upgraded instead of demanding a re-scan', async () => {
  const r = await deliveryWithCredit();
  // מחזירים את הטיוטה לצורתה ב-v88: כסף השורה הוא המחיר הרגיל, בלי צורה.
  r.run(`aiScanResponse.scan.documents.forEach(d => d.rows.forEach(row => {
    delete row.__bermanPriceForm;
    const p = products.find(x => x.id === row.__tnuvaProductId);
    if (!p) return;
    row.unitPriceExVat = Number(p.price);
    row.lineTotalExVat = lineTotalFromUnit(Number(p.price), row.quantity);
  }));`);
  const stale = json(r, 'aiScanResponse.scan.documents[0].rows[1]');
  assert.equal(r2(stale.unitPriceExVat), r2(BUNS.price));
  r.run('aiRefreshScanEvaluation();');
  const upgraded = json(r, 'aiScanResponse.scan.documents[0].rows[1]');
  assert.equal(upgraded.__bermanPriceForm, 'promo_on_paper');
  assert.equal(r2(upgraded.unitPriceExVat), PROMO_UNIT);
  assert.equal(r2(upgraded.lineTotalExVat), r2(PROMO_UNIT * 18));
  assert.deepEqual(json(r, 'aiScanEvaluation.errors'), []);
  assert.equal(r.run('aiScanEvaluation.valid'), true);
});
