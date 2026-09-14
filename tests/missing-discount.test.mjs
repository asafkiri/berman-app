import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runtime } from './receipt-scan-harness.mjs';

// Synthetic documents only. A private backup can be replayed through the same
// module using BERMAN_DISCOUNT_BACKUP, without copying it into the repository.
function fixture({ monthly = false } = {}) {
  const products = [
    { id: 'unknown', code: '8001', barcode: '7290000008001', name: 'לחם בדיקה', listPrice: 6.24, price: 6.24, discountPct: 0, discountSet: false },
    { id: 'known', code: '8002', barcode: '7290000008002', name: 'לחמניות בדיקה', listPrice: 10, price: 8, discountPct: 20, discountSet: true }
  ];
  const rows = products.map((p, i) => ({ itemCode: p.code, barcode: p.barcode, description: p.name,
    quantity: i ? 5 : 30, unitPriceExVat: p.listPrice, sourcePage: 1, lineNumber: i + 1, confidence: .99 }));
  return { products, promos: monthly ? [{ id: 'monthly', name: 'מבצע בדיקה', productIds: ['known'],
    fixedPrice: 7, type: 'receipt', minQty: 1, minUnit: 'unit', start: '2026-09-01', end: '2026-09-30' }] : [],
    items: [{ productId: 'unknown', name: products[0].name, barcode: products[0].barcode, qty: 1 }],
    paper: { ok: true, serviceVersion: 4, model: 'fixture', requestId: 'discount-fixture', scan: { warnings: [], documents: [{
      noteIndex: 0, docType: 'invoice', docNumber: 'TEST-DISCOUNT', docDate: '14/09/2026', pageCount: 1,
      totalUnits: 35, printedLines: 2, netToChargeExVat: 212.22, rows, warnings: [], confidence: .99
    }] } } };
}
const report = c => JSON.parse(c.run('JSON.stringify(receiptPriceAudit())'));
const inference = (c, index = 0) => report(c).documents[index].discountInference;
const fingerprint = (c, index = 0) => c.run(`bermanDiscountFingerprint(receiptPriceAudit().documents[${index}])`);
const readDoc = c => JSON.parse(c.run('JSON.stringify(aiScanResponse.scan.documents[0])'));
const save = (c, value, index = 0, token = fingerprint(c, index)) =>
  c.run(`bermanSaveInferredDiscount(${index},${JSON.stringify(value)},${JSON.stringify(token)})`);
async function scan(data = fixture()) {
  const c = runtime({ data });
  c.run("currentView='receiving';mainMode='receiving';");
  await c.scan();
  return c;
}
function clickSave(c, value, host = 'app') {
  const card = { querySelector: () => ({ value }) };
  const button = { dataset: { role: 'berman-discount-save', doc: '0', fingerprint: fingerprint(c) },
    closest(selector) {
      if (selector === '[data-role="berman-discount-save"]' || selector === '[data-role]') return button;
      if (selector === '[data-discount-inference]') return card;
      return null;
    } };
  return c.events.get(host + ':click')({ target: button });
}

test('one unknown discount uses paper quantities, rounded line totals and preserved evidence', async () => {
  const c = await scan(), a = inference(c), before = readDoc(c);
  assert.equal(a.status, 'ready');
  assert.equal(a.quantity, 30);
  assert.equal(a.candidates[0].knownCents, 4000);
  assert.equal(a.candidates[0].remainingCents, 17222);
  assert.equal(a.candidates[0].discountPct, 8);
  assert.equal(report(c).rows[0].result, null);
  assert.equal(report(c).complete, false);
  assert.equal(c.run('receiptList[0].qty'), 1);
  assert.equal(c.run('bermanPaperAnchorCheck(aiScanResponse.scan.documents[0]).ok'), false);
  assert.equal(c.writes.length, 0);
  assert.equal(c.requests.length, 1);
  c.run('receiptList[0].qty=99;saveReceiptDraft();renderReceiving()');
  assert.deepEqual(inference(c), a);
  assert.deepEqual(readDoc(c).__pricePaper, before.__pricePaper);
  assert.match(c.node('app').innerHTML, /הנחה מחושבת מהתעודה/);
  assert.match(c.node('app').innerHTML, /כ־8% הנחה/);
  assert.doesNotMatch(c.run('paperScanStatusHtml()'), /הנייר לא אישר את עצמו/);
});

test('the actual receiving save button writes only the approved product and recalculates locally', async () => {
  const c = await scan(), before = readDoc(c), items = c.run('JSON.stringify(receiptList)');
  assert.equal(await clickSave(c, '8'), true);
  const data = c.writes[0].data;
  assert.equal(c.writes.length, 1);
  assert.equal(data.discountSet, true);
  assert.equal(data.discountPct, 8);
  assert.equal(data.price, 5.7408);
  assert.equal(data.discountSource.method, 'document_remainder');
  assert.equal(c.run('products[0].discountPct'), 8);
  assert.equal(c.run('JSON.stringify(receiptList)'), items);
  assert.deepEqual(readDoc(c).__pricePaper, before.__pricePaper);
  assert.deepEqual(readDoc(c).rows[1], before.rows[1]);
  assert.equal(readDoc(c).rows[0].unitPriceExVat, 5.7408);
  assert.equal(c.run('receiptPaperScanState'), 'ok');
  assert.equal(report(c).rows[0].result, 'confirmed_inference');
  assert.equal(report(c).complete, false);
  assert.match(c.run('paperScanStatusHtml()'), /המבוסס על אישורך/);
  assert.doesNotMatch(c.run('paperScanStatusHtml()'), /אומתו מול בלוק/);
  assert.equal(c.requests.length, 1);
  assert.equal(await save(c, '8'), false);
  assert.equal(c.writes.length, 1);
});

test('save also works through the detached final-summary event handler', async () => {
  const c = await scan();
  assert.equal(await clickSave(c, '7.5', 'rsBody'), true);
  assert.equal(c.run('products[0].discountPct'), 7.5);
  assert.equal(c.run('receiptPaperScanState'), 'failed');
  assert.equal(c.run('receiptNoteTotal'), null);
});

test('a declared 0% is known; a missing discount is not proof of zero even when totals match', async () => {
  const data = fixture(); data.products[0].discountSet = true;
  data.paper.scan.documents[0].netToChargeExVat = 227.2;
  const declared = await scan(data);
  assert.equal(inference(declared), null);
  assert.equal(report(declared).rows[0].result, 'match');
  data.products[0].discountSet = false;
  const missing = await scan(data);
  assert.equal(inference(missing).candidates[0].discountPct, 0);
  assert.equal(missing.run('bermanPaperAnchorCheck(aiScanResponse.scan.documents[0]).ok'), false);
  assert.equal(await save(missing, '0'), true);
  assert.equal(missing.writes[0].data.discountSet, true);
});

test('repeated rows of one product share one discount and aggregate the paper quantity', async () => {
  const data = fixture(), d = data.paper.scan.documents[0];
  d.rows[0].quantity = 15;
  d.rows.push({ ...d.rows[0], lineNumber: 3 }); d.printedLines = 3;
  const c = await scan(data);
  assert.equal(inference(c).quantity, 30);
  assert.equal(inference(c).candidates[0].discountPct, 8);
  await save(c, '8');
  assert.equal(readDoc(c).rows[0].unitPriceExVat, 5.7408);
  assert.equal(readDoc(c).rows[2].unitPriceExVat, 5.7408);
});

test('monthly full-vs-regular billing yields alternatives and requires a basis choice', async () => {
  const c = await scan(fixture({ monthly: true })), a = inference(c);
  assert.equal(a.status, 'ambiguous');
  assert.deepEqual(a.candidates.map(x => x.discountPct), [8, 13.34]);
  assert.equal(await save(c, '8'), false);
  assert.equal(c.writes.length, 0);
  const choice = a.choices[0];
  await c.events.get('app:change')({ target: { dataset: { role: 'berman-discount-basis', doc: '0', row: choice.rowId }, value: '8' } });
  assert.equal(inference(c).status, 'ready');
  assert.equal(inference(c).candidates[0].discountPct, 8);
  assert.equal(c.writes.length, 0);
  assert.equal(c.run('receiptPromoOnPaper.length'), 0);
  assert.equal(await save(c, '8'), true);
  assert.equal(c.run('receiptPaperScanState'), 'ok');
  assert.equal(c.run('receiptPromoOnPaper.length'), 0);
});

test('choosing full price leads to a different inferred rate without double discounting', async () => {
  const c = await scan(fixture({ monthly: true }));
  const choice = inference(c).choices[0];
  c.run(`bermanSelectDiscountBasis(0,${JSON.stringify(choice.rowId)},'10')`);
  assert.equal(inference(c).candidates[0].discountPct, 13.34);
  await save(c, '13.34');
  assert.equal(c.run('receiptPaperScanState'), 'ok');
  assert.deepEqual(readDoc(c).__bermanFullListRowIndexes, [1]);
  assert.equal(c.run('receiptPromoOnPaper.length'), 0);
});

test('an already printed promotion uses its printed net price once', async () => {
  const data = fixture({ monthly: true }), d = data.paper.scan.documents[0];
  d.rows[1].unitPriceExVat = 7; d.netToChargeExVat = 207.22;
  const c = await scan(data), a = inference(c);
  assert.equal(a.status, 'ready');
  assert.equal(a.choices.length, 0);
  assert.equal(a.candidates[0].knownCents, 3500);
  assert.equal(a.candidates[0].discountPct, 8);
});

test('ambiguity selections survive reload and expire when pricing inputs change', async () => {
  const data = fixture({ monthly: true }), c = await scan(data), choice = inference(c).choices[0];
  c.run(`bermanSelectDiscountBasis(0,${JSON.stringify(choice.rowId)},'8')`);
  const restored = runtime({ storage: c.storage, data }); restored.run('restoreReceiptDraft()');
  assert.equal(inference(restored).status, 'ready');
  restored.run('products[1].discountPct=10;products[1].price=9;');
  assert.equal(inference(restored).status, 'ambiguous');
  assert.equal(inference(restored).choices[0].selected, '');
  assert.equal(restored.requests.length, 0);
});

test('approved provenance, source prices and counts survive reload', async () => {
  const data = fixture(), c = await scan(data); await save(c, '8');
  data.products = JSON.parse(c.run('JSON.stringify(products)'));
  const restored = runtime({ storage: c.storage, data }); restored.run('restoreReceiptDraft()');
  assert.equal(restored.run('receiptList[0].qty'), 1);
  assert.equal(report(restored).rows[0].result, 'confirmed_inference');
  assert.equal(report(restored).rows[0].originalUnitPrice, 6.24);
  assert.equal(restored.run('receiptPaperScanState'), 'ok');
  assert.equal(restored.requests.length, 0);
});

for (const [name, change] of [
  ['two missing products', d => { d.products[1].discountSet = false; }],
  ['unidentified second product', d => { d.paper.scan.documents[0].rows[1].itemCode = '404'; d.paper.scan.documents[0].rows[1].barcode = ''; }],
  ['another printed price mismatch', d => { d.paper.scan.documents[0].rows[1].unitPriceExVat = 11; }],
  ['stored price inconsistent with its discount', d => { d.products[1].price = 7.5; }],
  ['missing page', d => { d.paper.scan.documents[0].pageCount = 2; }],
  ['incomplete units', d => { d.paper.scan.documents[0].totalUnits = 34; }],
  ['missing printed row count', d => { d.paper.scan.documents[0].printedLines = null; }],
  ['missing date', d => { d.paper.scan.documents[0].docDate = ''; }],
  ['unknown product itself has a promotion', d => { d.promos = [{ id: 'p', productIds: ['unknown'], fixedPrice: 5, minQty: 1, start: '2026-09-01', end: '2026-09-30' }]; }],
  ['overlapping promotions', d => { d.promos = [1, 2].map(n => ({ id: 'p' + n, productIds: ['known'], fixedPrice: 7, minQty: 1, start: '2026-09-01', end: '2026-09-30' })); }],
  ['separate document discount', d => { d.paper.scan.documents[0].documentDiscountExVat = 1; }],
  ['credit document', d => { d.paper.scan.documents[0].docType = 'credit'; }],
  ['negative remainder', d => { d.paper.scan.documents[0].netToChargeExVat = 30; }],
  ['remainder above list price', d => { d.paper.scan.documents[0].netToChargeExVat = 300; }],
  ['contradictory VAT summary', d => { Object.assign(d.paper.scan.documents[0], { vatAmountPrinted: 20, totalToChargeInclVat: 300 }); }]
]) test(name + ' cannot produce an actionable inferred discount', async () => {
  const data = fixture(); change(data); const c = await scan(data);
  if (name === 'missing date') c.run('receiptDocDate=null;'); // no manually entered fallback either
  assert.equal(inference(c)?.status, 'blocked');
  assert.equal(await save(c, '8'), false);
  assert.equal(c.writes.length, 0);
});

test('stale displayed proposals are rejected before any write', async () => {
  const c = await scan(), token = fingerprint(c);
  c.run('products[1].discountPct=10;products[1].price=9;');
  assert.equal(await save(c, '8', 0, token), false);
  assert.equal(c.writes.length, 0);
  assert.equal(c.run('products[0].discountSet'), false);
});

for (const update of ['aiScanDocuments[0].amount=200', 'aiScanDocuments[0].units=34', 'aiScanDocuments[0].lines=3', 'aiScanResponse.scan.documents[0].rows[0].quantity=29']) {
  test('contradictory entered anchors or corrected quantities block inference: ' + update, async () => {
    const c = await scan(); c.run(update);
    assert.equal(inference(c).status, 'blocked');
    assert.equal(await save(c, '8'), false);
    assert.equal(c.writes.length, 0);
  });
}

test('a local-storage failure after the cloud save keeps the persistence warning visible', async () => {
  const c = await scan();
  c.context.localStorage.setItem = () => { throw Error('storage full'); };
  assert.equal(await save(c, '8'), true);
  assert.equal(c.writes[0].data.discountPct, 8);
  assert.equal(c.run('receiptPriceSaveFailed'), true);
  assert.match(c.toasts.at(-1), /הפענוח לא נשמר במכשיר/);
  assert.equal(report(c).state, 'unsaved');
});

test('failed writes and invalid input preserve the original catalog and document', async () => {
  const c = await scan(), before = readDoc(c);
  for (const value of ['', '-1', '100', '8abc', '8.123', 'NaN']) assert.equal(await save(c, value), false);
  assert.equal(c.writes.length, 0);
  c.run('runCloudTask=async()=>false');
  assert.equal(await save(c, '8'), false);
  assert.equal(c.run('products[0].discountSet'), false);
  assert.deepEqual(readDoc(c), before);
  assert.equal(c.run('bermanDiscountSaveBusy'), false);
});

test('a later successful cloud retry refreshes the saved scan from approved provenance', async () => {
  const c = await scan();
  c.run('runCloudTask=async(label,task)=>{testWrites.push(structuredClone(task));return false;}');
  assert.equal(await save(c, '8'), false);
  assert.equal(c.run('products[0].discountSet'), false);
  c.context.retryData = c.writes[0].data;
  c.run('Object.assign(products[0],retryData);rerender();');
  assert.equal(readDoc(c).rows[0].unitPriceExVat, 5.7408);
  assert.equal(report(c).rows[0].result, 'confirmed_inference');
  assert.equal(c.run('receiptPaperScanState'), 'ok');
  assert.equal(c.run('receiptList[0].qty'), 1);
  assert.equal(c.requests.length, 1);
  assert.equal(c.writes.length, 1);
});

test('a double click and switching receipts during a write do not apply stale receipt data', async () => {
  const c = await scan(); let finish;
  c.context.waitForSave = new Promise(resolve => { finish = resolve; });
  c.run('runCloudTask=async(label,task)=>{testWrites.push(task);return await waitForSave;}');
  const pending = save(c, '8');
  assert.equal(await save(c, '8'), false);
  c.run("receiptDraftId='new-receipt';aiScanResponse=null;receiptList=[];receiptNotes=[];");
  finish(true); assert.equal(await pending, true);
  assert.equal(c.writes.length, 1);
  assert.equal(c.run('aiScanResponse'), null);
  assert.equal(c.run('receiptList.length'), 0);
  assert.equal(c.run('products[0].discountPct'), 8);
});

test('each document has its own remainder; totals are not pooled across invoices', async () => {
  const c = await scan();
  c.run(`const second=structuredClone(aiScanResponse.scan.documents[0]);second.noteIndex=1;second.__priceSourceId='second-paper';
    second.__pricePaper.netToChargeExVat=200;second.subtotalExVat=200;aiScanResponse.scan.documents.push(second);
    aiScanDocuments.push({...aiScanDocuments[0],noteIndex:1});saveReceiptDraft();`);
  const docs = report(c).documents;
  assert.equal(docs[0].discountInference.candidates[0].discountPct, 8);
  assert.equal(docs[1].discountInference.candidates[0].discountPct, 14.53);
});

test('legacy stored scans also treat missing discounts as unknown', async () => {
  const c = await scan();
  c.run('delete aiScanResponse.scan.documents[0].rows[0].__bermanDiscountMissing;aiScanResponse.scan.documents[0].subtotalExVat=227.2;');
  assert.equal(c.run('bermanPaperAnchorCheck(aiScanResponse.scan.documents[0]).ok'), false);
  assert.equal(c.run('bermanPaperAnchorCheck(aiScanResponse.scan.documents[0]).money'), null);
});

test('private uploaded backup replay', { skip: !process.env.BERMAN_DISCOUNT_BACKUP }, async () => {
  const backup = JSON.parse(fs.readFileSync(process.env.BERMAN_DISCOUNT_BACKUP, 'utf8'));
  const data = { products: Object.entries(backup.collections.products).map(([id, p]) => ({ id, ...p })),
    promos: Object.entries(backup.collections.promos).map(([id, p]) => ({ id, ...p })), items: [], paper: fixture().paper };
  const c = runtime({ data });
  c.storage.set(c.run('RECEIPT_DRAFT_KEY'), JSON.stringify(backup.localDrafts.receipt));
  c.run('restoreReceiptDraft()');
  const a = inference(c);
  assert.equal(a.productId, 'code_111');
  assert.equal(a.status, 'ambiguous');
  assert.ok(a.candidates.some(x => x.discountPct === 8));
  const ch = a.choices[0];
  c.run(`bermanSelectDiscountBasis(0,${JSON.stringify(ch.rowId)},${JSON.stringify(ch.options[0].key)})`);
  assert.equal(inference(c).candidates[0].discountPct, 8);
  const source = readDoc(c).__pricePaper, counted = c.run('JSON.stringify(receiptList)');
  assert.equal(await save(c, '8'), true);
  assert.equal(c.run('receiptPaperScanState'), 'ok');
  assert.deepEqual(readDoc(c).__pricePaper, source);
  assert.equal(c.run('JSON.stringify(receiptList)'), counted);
  assert.equal(c.requests.length, 0);
});
