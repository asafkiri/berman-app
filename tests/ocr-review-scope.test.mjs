// טווח ההשפעה של ממצא אימות. הבאג שנמצא בשטח: חמש שורות בביטחון נמוך הפכו
// ל"19/19 לא נבדקו", 15 שדות להקלדה, ובדיקת המחיר מול המאגר לא רצה על אף
// שורה — כלומר הנוקשות לא רק הכבידה, היא ביטלה את הבדיקה האמיתית היחידה.
// הכלל כאן: ממצא ששויך לשורה נעצר בשורה שלו; ממצא שאינו מצביע על שום שורה
// מפיל את התעודה, כי אין שורה אחת שתישא אותו.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './receipt-scan-harness.mjs';

function read(model) { return { model, usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 } }; }
function fixture() {
  const products = [
    { id: 'spelt', code: '649', barcode: '4685447', name: 'לחמניות בדיקה', listPrice: 14.94, price: 10.458, discountPct: 30, discountSet: true },
    { id: 'buns', code: '1231', barcode: '498256', name: 'לחמניות עשרייה בדיקה', listPrice: 20.46, price: 10.399818, discountPct: 49.17, discountSet: true },
    { id: 'active', code: '339', barcode: '497044', name: 'לחם מבצע בדיקה', listPrice: 17.21, price: 12.047, discountPct: 30, discountSet: true }
  ];
  const promos = products.slice(1).map((p, i) => ({ id: 'p-' + p.id, productIds: [p.id], fixedPrice: i ? 10 : 8.5,
    type: 'monthEnd', minQty: 1, minUnit: 'unit', start: '2026-09-01', end: '2026-10-31' }));
  const qty = [2, 8, 8], prices = [10.458, 8.5, 10];
  const rows = products.map((p, i) => ({ sourcePage: 1, lineNumber: i + 10, itemCode: p.code, barcode: p.barcode,
    description: p.name, quantity: qty[i], unitPriceExVat: i ? promos[i - 1].fixedPrice : p.price, confidence: .99 }));
  const net = Math.round(prices.reduce((sum, price, i) => sum + price * qty[i], 0) * 100) / 100;
  return { products, promos, items: products.map((p, i) => ({ productId: p.id, name: p.name, barcode: p.barcode, qty: qty[i] })),
    paper: { ok: true, serviceVersion: 5, reads: [read('luna'), read('luna')],
      verification: { version: 1, status: 'agreed', primaryReads: 2, escalationAttempted: false, readCount: 2, issues: [] },
      scan: { warnings: [], documents: [{ noteIndex: 0, docType: 'invoice', docNumber: '87654321', docDate: '09/09/2026',
        pageCount: 1, totalUnits: 18, printedLines: 3, netToChargeExVat: net, confidence: .99, rows, warnings: [] }] } } };
}
function flagged(issues) {
  const data = fixture();
  data.paper.verification = { ...data.paper.verification, status: 'needs_review', escalationAttempted: true, issues };
  const r = runtime({ data });
  const queue = [data.paper];
  r.context.fetch = async (url, options) => {
    r.requests.push({ url: String(url), body: options.body });
    const value = queue.shift();
    assert.ok(value, 'unexpected extra paid request');
    return { ok: true, status: 200, json: async () => structuredClone(value) };
  };
  return r;
}
const json = (r, code) => JSON.parse(r.run('JSON.stringify(' + code + ')'));
const rowIssue = (rowIndex, field, reason = 'low_confidence') =>
  ({ noteIndex: 0, sourcePage: 1, lineNumber: rowIndex + 10, rowIndex, field, reason });

test('a row-scoped issue stops at its own row; the rest of the document is still price-checked', async () => {
  const r = flagged([rowIssue(0, 'row')]);
  await r.scan();
  const rows = json(r, 'receiptPriceAudit().rows');
  assert.deepEqual(rows.map(x => x.capability), ['ocr_uncertain', 'checkable', 'checkable']);
  assert.ok(rows.slice(1).every(x => x.result === 'match'), 'the unflagged rows must reach a real verdict');
});

test('a row-scoped issue on any field behaves the same — not only unitPriceExVat', async () => {
  for (const field of ['row', 'quantity', 'itemCode', 'identity', 'unitPriceExVat']) {
    const r = flagged([rowIssue(0, field)]);
    await r.scan();
    const rows = json(r, 'receiptPriceAudit().rows');
    const caps = rows.map(x => x.capability);
    assert.deepEqual(caps.slice(1), ['checkable', 'checkable'], field + ' must not void the other rows');
    // המחצית השנייה של החוק, וזו שנושאת את האמינות: השורה שסומנה עצמה לעולם
    // אינה נחשבת בדוקה, בכל שדה שהוא.
    assert.notEqual(caps[0], 'checkable', field + ' must still stop its own row');
    assert.equal(rows[0].result, null, field + ' must not produce a verdict for its own row');
  }
});

test('an unattributable issue still voids the whole document', async () => {
  for (const field of ['document', 'totalUnits', 'printedLines', 'totals']) {
    const r = flagged([{ noteIndex: 0, field, reason: 'low_confidence' }]);
    await r.scan();
    const rows = json(r, 'receiptPriceAudit().rows');
    assert.ok(rows.every(x => x.capability !== 'checkable'), field + ' names no row, so nothing may be declared checked');
    assert.equal(json(r, 'receiptPriceAudit().complete'), false);
  }
});

test('a flagged row is never reported as a verified price', async () => {
  const r = flagged([rowIssue(0, 'row')]);
  await r.scan();
  const audit = json(r, 'receiptPriceAudit()');
  assert.equal(audit.rows[0].result, null);
  assert.equal(audit.complete, false, 'one unproven row keeps the audit incomplete');
});

test('a document-level issue offers the summary anchors instead of an empty review block', async () => {
  const r = flagged([{ noteIndex: 0, field: 'document', reason: 'low_confidence' }]);
  await r.scan();
  const fields = json(r, 'bermanOcrReviewFields(aiScanResponse.scan.documents[0])').map(f => f.field);
  assert.deepEqual(fields, ['netToChargeExVat', 'totalUnits', 'printedLines']);
  const html = r.run('bermanOcrReviewHtml()');
  assert.equal((html.match(/<input/g) || []).length, 3);
});

test('an issue that yields no typeable field renders an explanation, never a no-op form', async () => {
  const r = flagged([{ noteIndex: 0, field: 'docType', reason: 'unreadable' }]);
  await r.scan();
  assert.deepEqual(json(r, 'bermanOcrReviewFields(aiScanResponse.scan.documents[0])'), []);
  const html = r.run('bermanOcrReviewHtml()');
  assert.equal((html.match(/<input/g) || []).length, 0);
  assert.ok(html.includes('הקריאה לא אומתה במלואה'), 'the user must be told what is unverified');
  assert.ok(!html.includes('בדוק בכל מוצר'), 'never ask for products when none are listed');
});

test('the quantity-proof path still stops on a quantity issue, even one scoped to a row', async () => {
  for (const field of ['quantity', 'row']) {
    const r = flagged([rowIssue(0, field)]);
    await r.scan();
    assert.equal(json(r, 'bermanQuantityPaperState(products) === null'), true, field + ' can move a counted quantity');
  }
  const priced = flagged([rowIssue(0, 'unitPriceExVat', 'disagreement')]);
  await priced.scan();
  assert.equal(json(priced, 'bermanQuantityPaperState(products) === null'), false, 'a price dispute cannot move a count');
});
