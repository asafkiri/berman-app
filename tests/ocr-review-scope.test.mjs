// טווח ההשפעה של ממצא אימות (v122). השרת מסמן "needs_review" עם רשימת ממצאים;
// הלקוח מבקש מהמשתמש להקליד רק מה שמוכיח קריאה של כמויות: קוד הפריט והכמות
// של שורה שסומנה, ולממצא ברמת המסמך — שני עוגני בלוק הסיכום ("סה"כ כללי",
// "סה"כ שורות"). ממצא על מחיר מודפס אינו שדה להקלדה: הכסף אינו עניין של
// הקליטה. כל עוד תעודה ממתינה לאימות, הסיום נעצר והכמות לא מועתקת מהנייר.
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
  const qty = [2, 8, 8];
  const rows = products.map((p, i) => ({ sourcePage: 1, lineNumber: i + 10, itemCode: p.code, barcode: p.barcode,
    description: p.name, quantity: qty[i], unitPriceExVat: p.listPrice, confidence: .99 }));
  return { products, promos: [], items: products.map((p, i) => ({ productId: p.id, name: p.name, barcode: p.barcode, qty: qty[i] })),
    paper: { ok: true, serviceVersion: 5, reads: [read('luna'), read('luna')],
      verification: { version: 1, status: 'agreed', primaryReads: 2, escalationAttempted: false, readCount: 2, issues: [] },
      scan: { warnings: [], documents: [{ noteIndex: 0, docType: 'invoice', docNumber: '87654321', docDate: '09/09/2026',
        pageCount: 1, totalUnits: 18, printedLines: 3, netToChargeExVat: 174.72, confidence: .99, rows, warnings: [] }] } } };
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
const fields = r => json(r, 'bermanOcrReviewFields(aiScanResponse.scan.documents[0])').map(f => [f.rowIndex, f.field]);
const rowIssue = (rowIndex, field, reason = 'low_confidence') =>
  ({ noteIndex: 0, sourcePage: 1, lineNumber: rowIndex + 10, rowIndex, field, reason });

test('a row issue asks for the code and the quantity of that row only', async () => {
  const r = flagged([rowIssue(0, 'row')]);
  await r.scan();
  assert.equal(r.requests.length, 1);
  assert.deepEqual(fields(r), [[0, 'itemCode'], [0, 'quantity']]);
  const html = r.run('bermanOcrReviewHtml()');
  assert.equal((html.match(/<input/g) || []).length, 2);
  assert.ok(!html.includes('מחיר'), 'no price field is offered');
  assert.equal(r.run('bermanOcrPendingDocs().length'), 1);
});

test('an identity issue asks for the code; a quantity issue for the quantity; a row found by line number too', async () => {
  const byField = {};
  for (const field of ['identity', 'quantity', 'itemCode']) {
    const r = flagged([rowIssue(1, field)]);
    await r.scan();
    byField[field] = fields(r);
  }
  assert.deepEqual(byField, { identity: [[1, 'itemCode']], quantity: [[1, 'quantity']], itemCode: [[1, 'itemCode']] });
  const r = flagged([{ noteIndex: 0, sourcePage: 1, lineNumber: 12, field: 'identity', reason: 'disagreement' }]);
  await r.scan();
  assert.deepEqual(fields(r), [[2, 'itemCode']]);
});

test('a price issue is not the receiving\'s business: nothing to type, nothing pending', async () => {
  const r = flagged([rowIssue(0, 'unitPriceExVat', 'disagreement')]);
  await r.scan();
  assert.deepEqual(fields(r), []);
  assert.equal(r.run('bermanOcrPendingDocs().length'), 0);
  assert.equal(r.run('bermanOcrReviewHtml()'), '');
});

test('an in-scope issue that yields no typeable field renders an explanation, never a no-op form', async () => {
  const r = flagged([{ noteIndex: 0, field: 'docType', reason: 'unreadable' }]);
  await r.scan();
  assert.deepEqual(fields(r), []);
  assert.equal(r.run('bermanOcrPendingDocs().length'), 1);
  const html = r.run('bermanOcrReviewHtml()');
  assert.equal((html.match(/<input/g) || []).length, 0);
  assert.ok(html.includes('הקריאה לא אומתה במלואה'), 'the user must be told what is unverified');
  assert.ok(!html.includes('בדוק בכל מוצר'), 'never ask for products when none are listed');
  assert.equal((html.match(/berman-ocr-confirm/g) || []).length, 1);
});

test('a document-level issue offers the two printed anchors — never a money field', async () => {
  const r = flagged([{ noteIndex: 0, field: 'document', reason: 'low_confidence' }]);
  await r.scan();
  assert.deepEqual(fields(r), [[-1, 'totalUnits'], [-1, 'printedLines']]);
  const html = r.run('bermanOcrReviewHtml()');
  assert.equal((html.match(/<input/g) || []).length, 2);
  assert.ok(html.includes('סה"כ כללי') && html.includes('סה"כ שורות'));
  assert.ok(!html.includes('נטו לחיוב'));
});

test('money-only issues from the server (net, VAT, totals, unit price) do not gate the receipt at all', async () => {
  const r = flagged([
    { noteIndex: 0, field: 'netToChargeExVat', reason: 'unreadable' },
    { noteIndex: 0, field: 'totals', reason: 'inconsistent' },
    { noteIndex: 0, field: 'vatAmountPrinted', reason: 'disagreement' },
    rowIssue(0, 'unitPriceExVat', 'unreadable')
  ]);
  await r.scan();
  assert.equal(r.requests.length, 1);
  assert.equal(r.run('receiptPaperScanState'), 'ok');
  assert.equal(r.run('bermanOcrPendingDocs().length'), 0, 'nothing to verify for the receiving');
  assert.deepEqual(fields(r), []);
  assert.equal(r.run('bermanOcrReviewHtml()'), '');
  assert.ok(r.run('receiptQuantityPaperRows()'), 'the paper can still prove the count');
  r.run('finishReceipt()');
  assert.ok(r.run('pendingReceipt && pendingReceipt.status === "ok"'));
  // mixed: a money issue beside a quantity issue — only the quantity is asked for
  const m = flagged([{ noteIndex: 0, field: 'netToChargeExVat', reason: 'unreadable' }, rowIssue(1, 'quantity')]);
  await m.scan();
  assert.equal(m.run('bermanOcrPendingDocs().length'), 1);
  assert.deepEqual(fields(m), [[1, 'quantity']]);
});

test('closing from the comparison screen also waits for the review; confirming inside the summary keeps the save valid', async () => {
  const r = flagged([{ noteIndex: 0, field: 'document', reason: 'low_confidence' }]);
  await r.scan();
  r.run('openReconcile(); saveReconciledReceipt({ skipChecked: true, skipGap: true });');
  assert.equal(r.run('pendingReceipt'), null, 'the summary does not open while a document waits for review');
  assert.match(r.toasts.at(-1), /אימות הקריאה/);
  r.context.document.querySelectorAll = selector => selector === '[data-ocr-doc]'
    ? [{ dataset: { ocrDoc: '0', ocrKey: '-1:totalUnits' }, value: '18' }, { dataset: { ocrDoc: '0', ocrKey: '-1:printedLines' }, value: '3' }] : [];
  // the confirm button also lives in the summary modal (rsBody). A summary that is open while a
  // document still waits for review was built before the read came back, so it was never compared
  // to this paper: confirming closes it and the worker summarizes again.
  r.run('pendingReceipt = { lines: [], status: "ok", sharedBasis: "stale" }; $("receiptSummaryModal").classList.remove("hidden"); $("rsOcrReview").innerHTML = ocrReviewPanelHtml();');
  assert.ok(r.node('rsOcrReview').innerHTML.includes('berman-ocr-confirm'));
  r.events.get('rsBody:click')({ target: { dataset: { role: 'berman-ocr-confirm', id: '0' }, closest: s => s === '[data-role="berman-ocr-confirm"]' ? { dataset: { id: '0' } } : null } });
  assert.equal(r.run('bermanOcrPendingDocs().length'), 0);
  assert.equal(r.node('rsOcrReview').innerHTML, '', 'the panel in the summary is cleared');
  assert.equal(r.run('pendingReceipt'), null, 'a summary built before the read is dropped, never saved');
  assert.ok(r.node('receiptSummaryModal').classList.contains('hidden'));
  assert.match(r.toasts.at(-1), /סכם את התעודה שוב/);
  r.run('openReconcile(); saveReconciledReceipt({ skipChecked: true, skipGap: true });');
  assert.ok(r.run('pendingReceipt && pendingReceipt.status === "ok"'));
  assert.equal(r.requests.length, 1);
});

test('while a document waits for review, finishing stops and the paper cannot prove a count; confirming releases both', async () => {
  const r = flagged([{ noteIndex: 0, field: 'document', reason: 'low_confidence' }]);
  await r.scan();
  assert.equal(r.run('receiptPaperScanState'), 'ok', 'anchors still come from the paper');
  assert.equal(r.run('receiptQuantityPaperRows()'), null);
  r.run('finishReceipt()');
  assert.equal(r.run('pendingReceipt'), null);
  assert.match(r.toasts.at(-1), /אימות הקריאה/);
  r.context.document.querySelectorAll = selector => selector === '[data-ocr-doc]'
    ? [{ dataset: { ocrDoc: '0', ocrKey: '-1:totalUnits' }, value: '18' }, { dataset: { ocrDoc: '0', ocrKey: '-1:printedLines' }, value: '3' }] : [];
  assert.equal(r.run('bermanConfirmOcr(0)'), true);
  assert.equal(r.run('bermanOcrPendingDocs().length'), 0);
  assert.equal(r.run('aiScanResponse.scan.documents[0].__bermanOcrVerification.status'), 'user_confirmed');
  assert.ok(r.run('receiptQuantityPaperRows()'));
  r.run('finishReceipt()');
  assert.ok(r.run('pendingReceipt && pendingReceipt.status === "ok"'));
  assert.equal(r.requests.length, 1);
});

test('a corrected anchor that still does not match the rows is rejected before saving', async () => {
  const r = flagged([{ noteIndex: 0, field: 'document', reason: 'low_confidence' }]);
  await r.scan();
  r.context.document.querySelectorAll = selector => selector === '[data-ocr-doc]'
    ? [{ dataset: { ocrDoc: '0', ocrKey: '-1:totalUnits' }, value: '0' }, { dataset: { ocrDoc: '0', ocrKey: '-1:printedLines' }, value: '3' }] : [];
  assert.equal(r.run('bermanConfirmOcr(0)'), false);
  assert.equal(r.run('bermanOcrPendingDocs().length'), 1);
});
