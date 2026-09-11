// Exercise the real raw-scan adapter and photo-first gate together. The older
// gate tests started after adaptation and therefore missed printed promotions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { extractSource } from './extract.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixture.json', import.meta.url), 'utf8'));
const products = Object.entries(fixture.products).map(([id, p]) => ({ id, ...p }));
const promos = Object.entries(fixture.promos).map(([id, p]) => ({ id, ...p }));
let receiptDocDate = '2026-09-07', receiptList = [], receiptPromoOnPaper = [];
const FNS = ['priceAuditCapture','makeOperationId','r2', 'fmtMoney', 'normalizeBarcode', 'productCode', 'productListPrice',
  'productDiscountPct', 'finalUnitPrice', 'promoFixedPrice', 'promoActive', 'promoForProduct',
  'promoTriggered', 'promoUnitPriceOf', 'effectivePrice', 'lineTotalFromUnit', 'todayStr',
  'activeReceiptDate', 'aiMoneyCents', 'aiDocRowUnits', 'bermanBuildCodeIndex',
  'aiActiveFixedPromoFor', 'bermanAdaptScanPayload', 'bermanFullListMatch', 'bermanPaperAnchorCheck',
  'bermanPaperAnchorsFromScan', 'monthEndPromoForProduct', 'monthEndUnitRebate',
  'receiptPromoOnPaperHas', 'receivingUnitPrice', 'bermanScanDocumentDate'];
const CONSTS = ['const RECEIPT_ROUNDING_TOLERANCE_CENTS = 30;'];
const api = eval(extractSource(FNS, CONSTS) + '\n({ ' + FNS.join(', ') + ' })');
const byCode = code => products.find(p => p.code === String(code));
function document(rows, amount, date = '07/09/2026') {
  return { noteIndex: 0, docNumber: null, docType: 'invoice', docDate: date, pageCount: 1,
    netToChargeExVat: amount, totalUnits: rows.reduce((sum, r) => sum + r[1], 0),
    printedLines: rows.length, rows: rows.map(([code, quantity, unitPriceExVat], i) => ({
      sourcePage: 1, lineNumber: i + 1, itemCode: String(code), barcode: byCode(code).barcode,
      description: byCode(code).name, quantity, unitPriceExVat, confidence: 1
    })) };
}
function adapt(doc) { return api.bermanAdaptScanPayload({ scan: { documents: [structuredClone(doc)], warnings: [] } }); }
function gate(doc) { return api.bermanPaperAnchorsFromScan(adapt(doc)); }
const rounded = (code, qty) => api.lineTotalFromUnit(byCode(code).price, qty);
const regular = rounded(1231, 4) + rounded(339, 3);
const mixedTotal = 4 * 8.5 + rounded(339, 3);
let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log('✓ ' + name); }
  catch (error) { failed++; console.error('✗ ' + name + ': ' + error.message); }
}
check('mixed invoice: buns at promotion, active bread at regular price', () => {
  assert.equal(gate(document([[1231, 4, 8.5], [339, 3, 17.21]], mixedTotal + 0.02)).ok, true);
});
check('same products can both arrive at regular prices next time', () => {
  assert.equal(gate(document([[1231, 4, 20.46], [339, 3, 17.21]], regular)).ok, true);
});
check('both products can already have their promotions on paper', () => {
  assert.equal(gate(document([[1231, 4, 8.5], [339, 3, 10]], 64)).ok, true);
});
check('each document in a batch uses its own printed prices', () => {
  const a = document([[1231, 4, 8.5]], 34);
  const b = document([[1231, 4, 20.46]], rounded(1231, 4));
  b.noteIndex = 1;
  const payload = api.bermanAdaptScanPayload({ scan: { documents: [a, b], warnings: [] } });
  assert.equal(api.bermanPaperAnchorsFromScan(payload).ok, true);
});
check('preserve catalog prices and the existing reconciliation baseline', () => {
  const before = JSON.stringify({ products, promos, receiptPromoOnPaper });
  const row = adapt(document([[1231, 4, 8.5]], 34)).scan.documents[0].rows[0];
  assert.equal(row.unitPriceExVat, byCode(1231).price);
  assert.equal(row.lineTotalExVat, rounded(1231, 4));
  assert.equal(row.printedListUnitPrice, 8.5);
  assert.equal(JSON.stringify({ products, promos, receiptPromoOnPaper }), before);
});
check('promotion on paper must not validate the regular-price total', () => {
  assert.equal(gate(document([[1231, 4, 8.5]], rounded(1231, 4))).ok, false);
});
check('a missing quantity is not explained away by a promotion', () => {
  const d = document([[1231, 4, 8.5], [339, 3, 17.21]], mixedTotal);
  d.totalUnits++;
  assert.equal(gate(d).checks[0].units, false);
  assert.equal(gate(d).ok, false);
});
check('a missing row remains a failed gate', () => {
  const d = document([[1231, 4, 8.5]], 34); d.printedLines = 2;
  assert.equal(gate(d).ok, false);
});
check('real money differences remain blocked', () => {
  assert.equal(gate(document([[1231, 4, 8.5]], 34.4)).ok, false);
});
// v79: התלונה מהשטח — עשר שורות, היחידות והשורות סגורות בדיוק, ופער עיגול של
// 21 אג׳ מול "נטו לחיוב". סיבולת הבסיס (2 אג׳ לשורה) נתנה 20 בלבד, ולכן שער
// הצילום חסם תעודה שהקליטה הידנית — ואותה דוקטרינה שב-README 6ב — מקבלת.
const TEN_ROWS = [[101, 30, 8.24], [1231, 13, 14.93], [339, 7, 17.21], [233, 15, 3.11],
  [2381, 6, 13.86], [238, 12, 7.05], [458, 8, 14.94], [401, 5, 15.74], [344, 9, 17.67], [649, 11, 15.01]];
const tenRowsTotal = api.r2(TEN_ROWS.reduce((sum, [code, qty]) => sum + rounded(code, qty), 0));
check('a rounding gap of 21 agorot over ten rows no longer blocks receiving', () => {
  const result = gate(document(TEN_ROWS, api.r2(tenRowsTotal + 0.21)));
  assert.equal(result.checks[0].units, true);
  assert.equal(result.checks[0].lines, true);
  assert.equal(result.checks[0].gapCents, 21);
  assert.equal(result.ok, true);
});
check('the absorbed gap is kept for display instead of vanishing', () => {
  assert.equal(gate(document(TEN_ROWS, api.r2(tenRowsTotal + 0.21))).checks[0].roundingGapCents, 21);
});
check('the tolerance still stops one agora past it', () => {
  assert.equal(gate(document(TEN_ROWS, api.r2(tenRowsTotal + 0.31))).ok, false);
});
check('without an exact unit anchor the base tolerance still applies', () => {
  const d = document(TEN_ROWS, api.r2(tenRowsTotal + 0.21));
  d.totalUnits++;
  const result = gate(d);
  assert.equal(result.checks[0].tolCents, 20);
  assert.equal(result.ok, false);
});
check('a whole cheap unit is still far outside the widened tolerance', () => {
  const cheapest = Math.min(...products.map(p => Math.round(p.price * 100)));
  assert.ok(cheapest > 4 * 30, 'cheapest unit ' + cheapest + ' agorot must dwarf the 30-agora tolerance');
});
check('active today does not make a promotion valid on an older document', () => {
  assert.equal(gate(document([[1231, 4, 8.5]], 34, '31/08/2026')).ok, false);
});
check('expired today can still be valid on the printed document date', () => {
  receiptDocDate = '2026-12-01';
  try { assert.equal(gate(document([[1231, 4, 8.5]], 34)).ok, true); }
  finally { receiptDocDate = '2026-09-07'; }
});
check('a credit document uses the same prices and retains its sign', () => {
  const d = document([[1231, 4, 8.5]], 34); d.docType = 'credit';
  const result = gate(d);
  assert.equal(result.ok, true); assert.equal(result.notes[0].kind, 'credit');
});
check('regular-price credit is also valid', () => {
  const d = document([[1231, 4, 20.46]], rounded(1231, 4)); d.docType = 'credit';
  assert.equal(gate(d).ok, true);
});
check('existing receipt choice prevents a second monthly rebate', () => {
  receiptPromoOnPaper = [byCode(1231).id];
  try {
    const p = byCode(1231), pr = api.monthEndPromoForProduct(p.id, receiptDocDate);
    const unit = api.receivingUnitPrice(p, 4, receiptDocDate);
    assert.equal(unit, 8.5); assert.equal(api.monthEndUnitRebate(pr, unit), 0);
    assert.equal(api.receivingUnitPrice(byCode(339), 3, receiptDocDate), byCode(339).price);
  } finally { receiptPromoOnPaper = []; }
});
console.log(`${passed}/${passed + failed} passed`);
process.exitCode = failed ? 1 : 0;
