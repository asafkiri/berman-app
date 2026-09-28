// v105: one product on two paper rows — two rows of one delivery note, or a
// charge plus a credit note in the same delivery. Two things broke there:
// 1. Berman's paper has no line totals; each row's money is its decided unit
//    price × qty, rounded per row. 58.96 / 12 = 4.91 but 9.83 / 2 = 4.92, and
//    that rounding was read as "billed at more than one price": a price
//    finding, an agorot supplier credit claim, and a receipt saved open.
// 2. The receipt-fix screen ("תקן") added the credit note's units to the
//    charge's (24) instead of subtracting them (20), so its units never
//    matched and a credit-note delivery saved there reopened on one agora.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, fixture } from './receipt-scan-harness.mjs';

// docs: [{ rows: [[code, qty, printedUnit?], ...], credit?: true }]; scanned: { code: qty }.
function makeData(docs, scanned) {
  const data = fixture();
  const P = code => data.products.find(x => x.code === String(code));
  const base = data.paper.scan.documents[0];
  const lineTotal = (u, q) => Math.round(u * q * 100) / 100;
  data.paper.scan.documents = docs.map((d, noteIndex) => {
    const rows = d.rows.map(([code, quantity, printed], i) => ({ itemCode: String(code), description: P(code).name, barcode: P(code).barcode,
      quantity, unitPriceExVat: printed != null ? printed : P(code).listPrice, sourcePage: 1, lineNumber: i + 1 }));
    // A printed unit below the list price is the fixed promotion printed on the paper.
    const total = d.rows.reduce((s, [code, q, printed]) => s + lineTotal(printed != null ? printed : P(code).price, q), 0);
    return { ...base, noteIndex, docType: d.credit ? 'credit' : 'invoice', rows, netToChargeExVat: Math.round(total * 100) / 100,
      totalUnits: rows.reduce((s, r) => s + r.quantity, 0), printedLines: rows.length };
  });
  data.items = Object.entries(scanned).map(([code, qty]) => ({ productId: P(code).id, name: P(code).name, barcode: P(code).barcode, qty }));
  return data;
}
async function scanned(docs, scannedQty) {
  const data = makeData(docs, scannedQty);
  const r = runtime({ data, globals: { fetch: async (url, options) => {
    const body = JSON.parse(options.body);
    const one = structuredClone(data.paper);
    const index = Number(Buffer.from(String(body.documents[0].pages[0]).split(',')[1], 'base64').toString().replace('DOC', ''));
    one.scan.documents = [{ ...one.scan.documents[index], noteIndex: 0 }];
    return { ok: true, status: 200, json: async () => one };
  } } });
  r.context.testPhotos = docs.map((d, i) => 'data:image/jpeg;base64,' + Buffer.from('DOC' + i).toString('base64'));
  r.run(`receiptOpened = true; receiptDocDate = '2026-09-09'; receiptList = [];
    bermanSeedPhotoFirstScan(${docs.length});
    aiScanDocuments.forEach((d, i) => { d.pages = [{ dataUrl: testPhotos[i], orientationConfirmed: true }]; });`);
  await r.run('bermanRunPaperScanInBackground()');
  r.run('receiptList = structuredClone(testData.items); saveReceiptDraft();');
  r.run('openReconcile()');
  return r;
}
const variants = (r, id) => JSON.parse(r.run(`JSON.stringify(Array.from(aiScanEvaluation.aggregates.get(${JSON.stringify(id)}).priceVariants))`));
const actionable = r => JSON.parse(r.run('JSON.stringify(aiScanEvaluation.findings.filter(aiIsActionableFinding).map(f => f.type + " " + f.productId))'));
async function applyAndSave(r) {
  assert.equal(r.run('aiScanEvaluation.valid'), true, r.run('JSON.stringify(aiScanEvaluation.errors)'));
  r.click('ai-apply');
  r.run('if (confirmCb) { const cb = confirmCb; hideConfirm(); cb(); }');
  await r.run('confirmReceipt()');
  const w = r.writes.filter(x => x.op === 'set' && /receipts/.test(x.path)).pop();
  assert.ok(w, 'the receipt was saved');
  return { id: 'r1', timestamp: Date.now(), ...w.data };
}

test('the same product on two rows of one note, same price: no "more than one price", no credit claim, saved closed', async () => {
  const r = await scanned([{ rows: [[238, 12], [101, 10], [238, 2]] }], { 238: 14, 101: 10 });
  assert.deepEqual(variants(r, 'code_238'), [4.91]);
  assert.deepEqual(actionable(r), []);
  const rc = await applyAndSave(r);
  assert.equal(rc.status, 'ok');
  assert.equal(rc.supplierCreditClaim, null);
  assert.equal(rc.aiAudit.hasDiscrepancy, false);
  assert.deepEqual(rc.items.map(l => [l.productId, l.qty, l.noteQty]), [['code_101', 10, undefined], ['code_238', 14, undefined]]);
});

test('a charge and a credit note for the same product: the net 10 is billed at one price, the receipt is saved closed', async () => {
  const r = await scanned([{ rows: [[238, 12], [101, 10]] }, { rows: [[238, 2]], credit: true }], { 238: 10, 101: 10 });
  assert.equal(r.run('receiptHasCreditNote()'), true);
  assert.deepEqual(variants(r, 'code_238'), [4.91]);
  assert.deepEqual(actionable(r), []);
  const rc = await applyAndSave(r);
  assert.equal(rc.status, 'ok');
  assert.equal(rc.supplierCreditClaim, null);
  assert.deepEqual(rc.items.map(l => [l.productId, l.qty, l.noteQty]), [['code_101', 10, undefined], ['code_238', 10, undefined]]);
});

test('control: two rows of one product at really different prices are still "billed at more than one price"', async () => {
  // 339 has a fixed promotion of ₪10: one row printed at the promotion, one at the list price.
  const r = await scanned([{ rows: [[339, 3, 10], [101, 10], [339, 2]] }], { 339: 5, 101: 10 });
  assert.deepEqual(variants(r, 'code_339'), [10, 12.05]);
  assert.deepEqual(actionable(r), ['price code_339']);
  assert.match(r.run('aiScanEvaluation.findings.find(f => f.type === "price").text'), /ברמן אקטיב — ₪10\.00 · ₪12\.05/);
});

test('receipt fix ("תקן") on a credit-note delivery: the units are net, and saving with no edits keeps it closed', async () => {
  const run = async docs => {
    const r = await scanned(docs, { 238: 10, 101: 10 });
    const rc = await applyAndSave(r);
    r.context.savedReceipt = rc;
    r.run("receipts = [savedReceipt]; openReceiptFix('r1');");
    const anchor = JSON.parse(r.run('JSON.stringify(receiptFixUnitAnchorState(receiptFix.items))'));
    await r.run('saveReceiptFix()');
    const update = r.writes.at(-1).data;
    return { rc, anchor, update };
  };
  const control = await run([{ rows: [[238, 10], [101, 10]] }]);
  assert.deepEqual(control.anchor, { complete: true, paperUnits: 20, assignedUnits: 20, matches: true });
  assert.equal(control.update.status, 'ok');

  const credit = await run([{ rows: [[238, 12], [101, 10]] }, { rows: [[238, 2]], credit: true }]);
  assert.deepEqual(credit.rc.noteParts.map(n => [n.kind, n.units]), [['charge', 22], ['credit', 2]]);
  assert.deepEqual(credit.anchor, { complete: true, paperUnits: 20, assignedUnits: 20, matches: true }, '22 − 2, not 22 + 2');
  assert.equal(credit.update.status, 'ok');
  assert.equal(credit.update.unresolvedAmountGap, 0);
  assert.equal(credit.update.roundingAdjustment, control.update.roundingAdjustment, 'the same agora of rounding is accepted');
  assert.equal(credit.update.totalExVat, credit.rc.totalExVat);
});

test('receipt fix: a deposit line carries money, not units', () => {
  const r = runtime();
  r.context.testReceipt = { id: 'dep', timestamp: Date.parse('2026-09-09T08:00:00Z'), date: '2026-09-09', status: 'ok',
    noteParts: [{ amount: 60.3, units: 10, lines: 1, kind: 'charge' }],
    items: [{ productId: 'code_101', name: 'אחיד פרוס ברמן', qty: 10, unitPrice: 6, lineTotal: 60 },
      { productId: 'deposit-1-0-1', name: 'פיקדון · אחיד פרוס ברמן', qty: 10, unitPrice: 0.03, lineTotal: 0.3 }] };
  r.run("receipts = [testReceipt]; openReceiptFix('dep');");
  assert.deepEqual(JSON.parse(r.run('JSON.stringify(receiptFixUnitAnchorState(receiptFix.items))')),
    { complete: true, paperUnits: 10, assignedUnits: 10, matches: true });
});

// v105 money note: with the false "more than one price" finding gone, a product on
// two rows is written at the catalog unit price, exactly like a product on one row
// (238 × 8 on one row is saved at ₪4.91). Until v105 the two-row line kept the paper
// average (₪4.9136) and opened an agorot claim on top, so a short two-row product
// was valued ~4 agorot differently from the same shortage on one row.
test('a short product on two rows is valued like the same shortage on one row: ₪4.91 per missing unit, no claim', async () => {
  const out = [];
  for (const docs of [[{ rows: [[238, 12], [101, 10], [238, 2]] }], [{ rows: [[238, 14], [101, 10]] }]]) {
    const r = await scanned(docs, { 238: 4, 101: 10 });
    const noteTotal = r.run('receiptNoteTotal');
    const rc = await applyAndSave(r);
    r.context.savedReceipt = rc;
    const di = JSON.parse(r.run('JSON.stringify((d => ({ short: d.shortItems.map(x => [x.productId, x.n, x.price]), shortValRaw: d.shortValRaw }))(receiptDiscrepancyInfo(savedReceipt)))'));
    assert.deepEqual(di, { short: [['code_238', 10, 4.91]], shortValRaw: 49.1 });
    assert.equal(rc.supplierCreditClaim, null);
    assert.deepEqual(rc.items.find(l => l.productId === 'code_238').unitPrice, 4.91);
    out.push([noteTotal, rc.totalExVat, rc.receivedExVat]);
  }
  // Paper 58.96 + 9.83 = 68.79 on two rows, 68.78 on one row; either way the payable is the paper less 10 × ₪4.91.
  assert.deepEqual(out, [[126.2, 77.1, 77.04], [126.19, 77.09, 77.04]]);
});

// A receipt saved before v105 (a charge and a credit note; the stored rounding is
// −₪0.05 and there is no amount gap). Opening it in "תקן" and saving with no edits
// used to count the units as 36 + 2 = 38 against 34 assigned, move the −₪0.05 from
// roundingAdjustment into unresolvedAmountGap, and so change a receipt nobody edited.
test('receipt fix: re-saving a stored credit-note receipt with no edits keeps its stored rounding and amount gap', async () => {
  const r = runtime();
  r.context.storedReceipt = { id: 'r64', timestamp: Date.parse('2026-09-28T08:00:00Z'), date: '2026-09-28', docDate: '2026-09-09', vatPct: 18,
    items: [
      { productId: 'code_101', name: 'אחיד פרוס ברמן', barcode: '497112', qty: 14, unitPrice: 5.74, basePrice: 5.74, lineTotal: 80.36, promoPct: 0 },
      { productId: 'code_238', name: 'ברמן אסלי 5 פיתות', barcode: '497204', qty: 1, unitPrice: 4.91, basePrice: 4.91, lineTotal: 4.91, promoPct: 0 },
      { productId: 'code_333', name: 'דגני קלות', barcode: '497570', qty: 9, unitPrice: 12.05, basePrice: 12.05, lineTotal: 108.45, promoPct: 0 },
      { productId: 'code_2387', name: 'פיתות עננים 8', barcode: '4033057', qty: 10, unitPrice: 10.71, basePrice: 10.71, lineTotal: 107.1, promoPct: 0 }],
    count: 4, totalExVat: 300.77, totalIncVat: 354.91, receivedExVat: 300.82, calculatedExVat: 300.82, roundingAdjustment: -0.05, grossExVat: 300.82,
    supplierDiscount: 0, supplierCreditClaim: null, noteTotalInc: 300.77,
    noteParts: [{ amount: 310.6, units: 36, lines: 4, kind: 'charge' }, { amount: 9.83, units: 2, lines: 1, kind: 'credit' }],
    unresolvedAmountGap: 0, unresolvedUnitsGap: 0, status: 'open' };
  r.run("receipts = [storedReceipt]; openReceiptFix('r64');");
  assert.deepEqual(JSON.parse(r.run('JSON.stringify(receiptFixUnitAnchorState(receiptFix.items))')),
    { complete: true, paperUnits: 34, assignedUnits: 34, matches: true });
  await r.run('saveReceiptFix()');
  const update = r.writes.at(-1).data;
  assert.deepEqual([update.totalExVat, update.roundingAdjustment, update.unresolvedAmountGap, update.unresolvedUnitsGap],
    [300.77, -0.05, 0, 0], 'before v105: roundingAdjustment 0 and unresolvedAmountGap −0.05');
});
