// Actual adapter -> per-document gate -> reconciliation -> saved pending rebate.
// No image API calls. Invoice rows are manually transcribed; no customer data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { extractSource } from './extract.mjs';
const backupAt = process.argv.indexOf('--backup');
const source = JSON.parse(fs.readFileSync(backupAt < 0 ? new URL('./fixture.json', import.meta.url) : process.argv[backupAt + 1], 'utf8'));
const collections = source.collections || source;
const products = Object.entries(collections.products).map(([id, p]) => ({ id, ...p }));
const promos = Object.entries(collections.promos).map(([id, p]) => ({ id, ...p }));
let receiptDocDate = '2026-09-07', receiptList = [], aiScanResponse = null, aiScanDocuments = [];
const byCode = code => products.find(p => p.code === String(code));
// Identity resolution is isolated here; the real adapter has already assigned IDs.
function aiResolveInvoiceBarcode(row) { return { product: products.find(p => p.id === row.__tnuvaProductId) }; }
function findProductsByBarcode(barcode) { return products.filter(p => p.barcode === barcode); }
const FNS = ['priceAuditCapture','makeOperationId','r2', 'fmtMoney', 'normalizeBarcode', 'productCode', 'productListPrice',
  'productDiscountPct', 'finalUnitPrice', 'promoFixedPrice', 'promoActive', 'promoForProduct',
  'promoTriggered', 'promoUnitPriceOf', 'effectivePrice', 'lineTotalFromUnit', 'todayStr',
  'activeReceiptDate', 'aiMoneyCents', 'aiDocRowUnits', 'bermanBuildCodeIndex',
  'aiActiveFixedPromoFor', 'bermanAdaptScanPayload', 'bermanFullListMatch', 'bermanPaperAnchorCheck',
  'bermanPaperAnchorsFromScan', 'bermanScanDocumentDate', 'aiPriceBreakdownRows', 'aiPriceGapContext',
  'aiMonthEndPendingRecord', 'aiGapExplainedLine'];
const CONSTS = ['const RECEIPT_ROUNDING_TOLERANCE_CENTS = 30;'];
const api = eval(extractSource(FNS, CONSTS) + '\n({ ' + FNS.join(', ') + ' })');
function doc(rows, total, date = '01/09/2026') {
  return { docType: 'invoice', docDate: date, noteIndex: 0, netToChargeExVat: total,
    totalUnits: rows.reduce((s, r) => s + r[1], 0), printedLines: rows.length,
    rows: rows.map(([code, quantity, unitPriceExVat], i) => ({ itemCode: String(code), quantity,
      unitPriceExVat, barcode: byCode(code).barcode, sourcePage: 1, lineNumber: i + 1 })) };
}
function run(raw) {
  aiScanResponse = api.bermanAdaptScanPayload({ scan: { documents: [structuredClone(raw)], warnings: [] } });
  aiScanDocuments = [{ units: raw.totalUnits, lines: raw.printedLines }];
  const gate = api.bermanPaperAnchorsFromScan(aiScanResponse);
  const ev = { docSummaries: [{ subtotal: raw.netToChargeExVat }] };
  return { gate, ctx: api.aiPriceGapContext(ev), pending: api.aiMonthEndPendingRecord(ev),
    adapted: aiScanResponse.scan.documents[0] };
}
let passed = 0;
function check(name, test) { test(); passed++; console.log('✓ ' + name); }
const original = JSON.stringify({ products, promos });
const paper = [[101,20,6.24],[1220,3,20.4],[1231,15,20.46],[233,15,4.1],[238,7,7.95],
  [2381,6,12.8],[2387,5,14.2],[333,1,17.21],[339,8,17.21],[344,2,17.58],[349,4,14.12],
  [3604,1,12.9],[3701,2,11.5],[401,1,15.66],[649,1,14.94]];
check('reported invoice: 759.32 / 91 / 15, full-list Active and preserved monthly rebate', () => {
  const r = run(doc(paper, 759.32));
  assert.equal(r.gate.ok, true);
  assert.equal(r.ctx.appTotal, 718.01);
  assert.deepEqual(r.adapted.__bermanFullListRowIndexes, [8]);
  assert.equal(r.ctx.gapExplained, true);
  assert.equal(r.pending.productId, byCode(339).id);
  assert.equal(r.pending.gap, 41.31);
  assert.equal(r.pending.expectedRebate, 57.68);
  assert.equal(r.adapted.rows[8].unitPriceExVat, byCode(339).price);
});
for (const a of ['regular', 'full', 'promotion']) for (const b of ['regular', 'full', 'promotion']) {
  check('independent monthly billing modes: ' + a + ' / ' + b, () => {
    const modes = [a, b], codes = [1231, 339], qtys = [4, 3], fixed = [8.5, 10];
    const rows = codes.map((c, i) => [c, qtys[i], modes[i] === 'promotion' ? fixed[i] : byCode(c).listPrice]);
    const amount = codes.reduce((s, c, i) => s + api.lineTotalFromUnit(
      modes[i] === 'full' ? byCode(c).listPrice : modes[i] === 'promotion' ? fixed[i] : byCode(c).price, qtys[i]), 0);
    const r = run(doc(rows, api.r2(amount)));
    assert.equal(r.gate.ok, true);
    assert.equal(r.adapted.__bermanFullListRowIndexes.length, modes.filter(x => x === 'full').length);
    if (modes.includes('full')) assert.equal(r.ctx.gapExplained, true);
    if (a === 'full' && b === 'full') {
      assert.equal(r.pending.items.length, 2);
      assert.equal(r.pending.gap, r.ctx.gap);
      assert.equal(r.pending.expectedRebate, 69.47);
    }
    if (a === 'promotion' || b === 'promotion') assert.ok(r.ctx.promoOnPaperRows.length);
  });
}
check('two full-price candidates with identical deltas do not guess a row', () => {
  const r = run(doc([[339,1,17.21],[339,1,17.21]], api.r2(17.21 + byCode(339).price)));
  assert.equal(r.gate.ok, false);
  assert.deepEqual(r.adapted.__bermanFullListRowIndexes, []);
});
check('full price without a monthly promotion remains a genuine difference', () => {
  assert.equal(run(doc([[101,20,6.24]], 124.8)).gate.ok, false);
});
check('expired promotion cannot explain full price on an older invoice', () => {
  assert.equal(run(doc([[339,8,17.21]], 137.68, '31/08/2026')).gate.ok, false);
});
check('a wrong printed price is not silently replaced by the catalog to explain a gap', () => {
  assert.equal(run(doc([[339,8,17.50]], 137.68)).gate.ok, false);
});
check('missing quantities, rows and missing summary still block promotion alternatives', () => {
  const raw = doc(paper, 759.32);
  raw.totalUnits++;
  assert.equal(run(raw).gate.ok, false);
  raw.totalUnits--; raw.printedLines++;
  assert.equal(run(raw).gate.ok, false);
  raw.printedLines--; raw.netToChargeExVat = null;
  assert.equal(run(raw).gate.ok, false);
});
check('an unexplained extra shekel remains blocked', () => {
  assert.equal(run(doc(paper, 760.32)).gate.ok, false);
});
check('separate documents cannot cancel their money differences', () => {
  const a = doc([[339,8,17.21]], 138.68), b = doc([[339,8,17.21]], 136.68);
  b.noteIndex = 1;
  const scan = api.bermanAdaptScanPayload({ scan: { documents: [a, b], warnings: [] } });
  assert.equal(api.bermanPaperAnchorsFromScan(scan).ok, false);
});
check('ordinary invoice still validates after all alternative-price cases', () => {
  assert.equal(run(doc(paper, 718.01)).gate.ok, true);
});
check('no catalog or promotion changes from inference', () => assert.equal(JSON.stringify({ products, promos }), original));
console.log(passed + ' checks passed');
