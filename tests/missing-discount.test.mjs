import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runtime } from './receipt-scan-harness.mjs';

function fixture() {
  const products = [
    { id: 'missing', code: '8001', barcode: '7290000008001', name: 'לחם בדיקה', listPrice: 6.24, price: 6.24, discountPct: 0, discountSet: false },
    { id: 'known', code: '8002', barcode: '7290000008002', name: 'לחמניות בדיקה', listPrice: 10, price: 8, discountPct: 20, discountSet: true }
  ];
  return { products, promos: [], items: [], paper: { ok: true, scan: { warnings: [], documents: [{
    noteIndex: 0, docType: 'invoice', docNumber: 'DEFER-TEST', docDate: '14/09/2026', pageCount: 1,
    totalUnits: 35, printedLines: 2, netToChargeExVat: 212.22,
    rows: products.map((p, i) => ({ itemCode: p.code, barcode: p.barcode, description: p.name,
      quantity: i ? 5 : 30, unitPriceExVat: p.listPrice, sourcePage: 1, lineNumber: i + 1 })), warnings: []
  }] } } };
}
const json = (c, code) => JSON.parse(c.run('JSON.stringify(' + code + ')'));
async function scanned(data = fixture()) {
  const c = runtime({ data }); c.run("currentView='receiving';mainMode='receiving';receiptCountingMode='manual'");
  await c.scan(); c.run('renderReceiving()'); return c;
}
async function deferred(data = fixture()) {
  const c = await scanned(data);
  assert.equal(c.run('bermanDeferDiscount()'), true); return c;
}
async function savedReceipt({ shortage = 0, surplus = 0, data = fixture() } = {}) {
  const c = await deferred(data);
  c.click('rc-quantity-differences');
  if (shortage) c.run("receiptQuantityReview.rows[0].kind='shortage';receiptQuantityReview.rows[0].difference=" + JSON.stringify(String(shortage)));
  if (surplus) c.run("receiptQuantityReview.rows[1].kind='surplus';receiptQuantityReview.rows[1].difference=" + JSON.stringify(String(surplus)));
  assert.equal(c.run('commitReceiptQuantityReview()'), true);
  assert.equal(c.run('pendingReceipt.status'), 'open');
  await c.run('confirmReceipt()');
  const task = c.writes.find(t => t.op === 'set');
  assert.ok(task);
  c.context.savedTestReceipt = { id: task.operationId, ...structuredClone(task.data) };
  c.run("receipts=[savedTestReceipt];currentView='receiptsHistory';renderReceiptsHistory()");
  return c;
}
function saveRate(c, rate, id = 'missing') {
  const token = c.run('JSON.stringify([receipts[0].items,receipts[0].discountReview])');
  return c.run('bermanSaveKnownDiscount(' + JSON.stringify(id) + ',' + JSON.stringify(rate) + ',receipts[0].id,' + JSON.stringify(token) + ')');
}

test('missing discount asks for supplier information or deferral, without promotion questions or a guessed percentage', async () => {
  const c = await scanned(), html = c.node('app').innerHTML;
  assert.match(html, /כמה אחוז הנחה יש/);
  assert.match(html, /data-role="berman-discount-later"/);
  assert.doesNotMatch(html, /data-role="berman-discount-basis"|data-role="berman-discount-pct"|כ־8%/);
  assert.doesNotMatch(html, /data-role="rc-paper-rescan"/);
  assert.equal(c.writes.length, 0);
});
test('deferred receipt validates quantities without claiming a verified monetary total', async () => {
  const c = await deferred();
  assert.equal(c.run('receiptPaperScanState'), 'discount-pending');
  assert.equal(c.run('receiptQuantityPaperRows().length'), 2);
  assert.match(c.node('app').innerHTML, /data-role="rc-quantity-all"/);
  assert.doesNotMatch(c.node('app').innerHTML, /data-role="rc-paper-rescan"/);
  assert.equal(c.run('bermanPaperAnchorCheck(aiScanResponse.scan.documents[0]).money'), null);
  c.click('rc-quantity-all');
  assert.equal(c.run('pendingReceipt.lines[0].qty'), 30);
  assert.equal(c.run('pendingReceipt.lines[0].noteQty'), 30);
  assert.match(c.node('rsBody').innerHTML, /הכמויות תואמות לתעודה/);
  assert.equal(c.requests.length, 1);
});
test('matching quantities save as purple and open until the supplier confirms the discount', async () => {
  const c = await savedReceipt();
  assert.equal(c.run('receiptDiscrepancyInfo(receipts[0]).open'), true);
  assert.equal(c.run('receipts[0].status'), 'open');
  assert.match(c.node('app').innerHTML, /bg-purple-700|ממתינה להנחה/);
  assert.match(c.node('app').innerHTML, /הכמויות תואמות לתעודה/);
  assert.doesNotMatch(c.node('app').innerHTML, /הפרשים מול התעודה|מאזן הסחורה מול הספק מאוזן/);
  const original = json(c, 'receipts[0].paperScan');
  const counts = json(c, 'receipts[0].items.map(l=>[l.productId,l.qty,l.noteQty])');
  assert.equal(await saveRate(c, '8'), true);
  assert.equal(c.writes.at(-1).op, 'batch');
  assert.equal(c.writes.at(-1).writes.length, 2);
  assert.equal(c.run('receipts[0].status'), 'ok');
  assert.equal(c.run('receiptDiscrepancyInfo(receipts[0]).open'), false);
  assert.equal(c.run('receipts[0].discountReview.status'), 'resolved');
  assert.ok(Math.abs(c.run('receipts[0].items[0].unitPrice') - 5.7408) < 1e-10);
  assert.deepEqual(json(c, 'receipts[0].items.map(l=>[l.productId,l.qty,l.noteQty])'), counts);
  assert.deepEqual(json(c, 'receipts[0].paperScan'), original);
  assert.equal(c.requests.length, 1);
});
test('shortage and surplus remain quantities after the discount is supplied; neither is paid', async () => {
  const c = await savedReceipt({ shortage: 2, surplus: 1 });
  assert.match(c.node('app').innerHTML, /חוסר 2 יח׳/);
  assert.match(c.node('app').innerHTML, /עודף 1 יח׳/);
  assert.doesNotMatch(c.node('app').innerHTML, /data-role="rc-offset-choose"|data-role="rc-short-credit"/);
  const counts = json(c, 'receipts[0].items.map(l=>[l.qty,l.noteQty])');
  assert.equal(await saveRate(c, '8'), true);
  assert.deepEqual(json(c, 'receipts[0].items.map(l=>[l.qty,l.noteQty])'), counts);
  assert.equal(c.run('receipts[0].status'), 'open');
  assert.equal(c.run('receiptDiscrepancyInfo(receipts[0]).shortItems[0].n'), 2);
  assert.equal(c.run('receiptDiscrepancyInfo(receipts[0]).overItems[0].n'), 1);
  assert.equal(c.run('receipts[0].totalExVat'), 200.74);
});
test('a late discount uses the historical catalog and document date', async () => {
  const c = await savedReceipt();
  c.run("products[1].listPrice=100;products[1].price=80;products[0].listPrice=7;receiptDocDate='2026-11-01'");
  assert.equal(await saveRate(c, '8'), true);
  assert.equal(c.run('receipts[0].status'), 'ok');
  assert.equal(c.run('receipts[0].items[1].unitPrice'), 8);
  assert.equal(c.run('products[0].price'), 6.44);
  assert.equal(c.run('receipts[0].docDate'), '2026-09-14');
});
test('a discount that leaves a real money gap cannot close the receipt', async () => {
  const c = await savedReceipt(); await saveRate(c, '5');
  assert.equal(c.run('receipts[0].discountReview.status'), 'price_check');
  assert.equal(c.run('receipts[0].status'), 'open');
  assert.equal(c.run('receiptDiscrepancyInfo(receipts[0]).open'), true);
  assert.match(c.node('app').innerHTML, /נדרשת בדיקת המחיר והסכום/);
  assert.equal(await saveRate(c, '8'), true);
  assert.equal(c.run('receipts[0].status'), 'ok');
});
test('failure and blank/invalid percentages preserve both receipt and catalog', async () => {
  const c = await savedReceipt(), before = json(c, '[receipts,products]'), writes = c.writes.length;
  for (const rate of ['', '-1', '100', '8.123', '8abc']) assert.equal(await saveRate(c, rate), false);
  assert.equal(c.writes.length, writes);
  c.run('runCloudTask=async()=>false');
  assert.equal(await saveRate(c, '8'), false);
  assert.deepEqual(json(c, '[receipts,products]'), before);
});
test('explicit zero is a valid known discount', async () => {
  const data = fixture(); data.paper.scan.documents[0].netToChargeExVat = 227.2;
  const c = await savedReceipt({ data }); assert.equal(await saveRate(c, '0'), true);
  assert.equal(c.run('products[0].discountSet'), true);
  assert.equal(c.run('receipts[0].status'), 'ok');
});
test('a pending draft and its manual count survive reload without OCR', async () => {
  const data = fixture(), a = await deferred(data);
  a.click('rc-quantity-differences');
  a.run("receiptQuantityReview.rows[0].kind='shortage';receiptQuantityReview.rows[0].difference='2';saveReceiptDraft()");
  const b = runtime({ data, storage: a.storage }); b.run("restoreReceiptDraft();currentView='receiving';renderReceiving()");
  assert.equal(b.run('receiptPaperScanState'), 'discount-pending');
  assert.equal(b.run('receiptQuantityReview.rows[0].difference'), '2');
  assert.match(b.node('app').innerHTML, /data-role="rc-quantity-differences"/);
  assert.equal(b.requests.length, 0);
});
test('a changed confirmed document date invalidates a pending discount form', async () => {
  const c = await deferred(), token = c.run('bermanDeferredSourceKey()');
  c.run("aiScanResponse.scan.documents[0].__priceConfirmedDate='2026-10-01'");
  assert.equal(c.run('bermanDeferredReview()'), null);
  assert.equal(await c.run("bermanSaveKnownDiscount('missing','8','',"+JSON.stringify(token)+")"), false);
  assert.equal(c.writes.length, 0);
});
test('repeated document indexes cannot stand in for two photographed documents', async () => {
  const c = await scanned();
  c.run('aiScanDocuments.push(cloneSafe(aiScanDocuments[0]));aiScanResponse.scan.documents.push(cloneSafe(aiScanResponse.scan.documents[0]))');
  assert.equal(c.run('bermanQuantityPaperState()'), null);
  assert.equal(c.run('bermanDeferDiscount()'), false);
});
for (const [name, modify] of [
  ['missing page', d => { d.pageCount = 2; }],
  ['wrong unit total', d => { d.totalUnits = 34; }],
  ['unknown product', d => { d.rows[1].itemCode = '404'; d.rows[1].barcode = ''; }],
  ['contradictory VAT', d => { d.vatAmountPrinted = 20; d.totalToChargeInclVat = 300; }]
]) test(name + ' cannot use a missing discount to bypass document validation', async () => {
  const data = fixture(); modify(data.paper.scan.documents[0]); const c = await scanned(data);
  assert.equal(c.run('bermanDeferDiscount()'), false);
  assert.equal(c.run('receiptQuantityPaperRows()'), null);
});
test('known supplier discount can be entered immediately through the real button', async () => {
  const c = await scanned();
  const card = { querySelector: () => ({ value: '8' }) };
  const button = { dataset: { product: 'missing', receipt: '', fingerprint: c.run('bermanDeferredSourceKey()') },
    closest: s => s === '[data-known-discount]' ? card : s === '[data-role="berman-known-discount-save"]' ? button : null };
  assert.equal(await c.events.get('app:click')({ target: button }), true);
  assert.equal(c.run('products[0].discountPct'), 8);
  assert.equal(c.run('receiptPaperScanState'), 'ok');
  assert.match(c.node('app').innerHTML, /data-role="rc-quantity-all"/);
  assert.equal(c.requests.length, 1);
});
test('an immediate rate that does not balance still allows quantities and open saving', async () => {
  const c = await scanned();
  assert.equal(await c.run("bermanSaveKnownDiscount('missing','5','',bermanDeferredSourceKey())"), true);
  assert.equal(c.run('bermanDeferredReview().status'), 'price_check');
  c.click('rc-quantity-all');
  assert.equal(c.run('pendingReceipt.status'), 'open');
  assert.match(c.node('rsBody').innerHTML, /נדרשת בדיקת מחיר/);
});
test('two missing discounts remain open until both are confirmed', async () => {
  const data = fixture(); data.products[1].discountSet = false;
  const c = await savedReceipt({ data });
  assert.equal(await saveRate(c, '8'), true);
  assert.equal(c.run('receipts[0].discountReview.status'), 'pending');
  assert.equal(c.run('receipts[0].status'), 'open');
  assert.doesNotMatch(c.node('app').innerHTML, /data-role="berman-known-discount-save"[^>]* disabled/);
  assert.equal(await saveRate(c, '20', 'known'), true);
  assert.equal(c.run('receipts[0].status'), 'ok');
});
for (const [mode, charged] of [['regular',8],['full',10],['promotion',7]]) test('confirmed discount recalculates ' + mode + ' promotion billing from the saved document', async () => {
  const data = fixture(), d = data.paper.scan.documents[0];
  data.promos = [{ id:'promo',productIds:['known'],fixedPrice:7,type:'receipt',minQty:1,minUnit:'unit',start:'2026-09-01',end:'2026-09-30' }];
  d.rows[1].unitPriceExVat = mode === 'promotion' ? 7 : 10;
  d.netToChargeExVat = 172.22 + charged * 5;
  const c = await savedReceipt({ data });
  c.run("promos=[];receiptDocDate='2027-01-01'");
  assert.equal(await saveRate(c, '8'), true);
  assert.equal(c.run('receipts[0].status'), 'ok');
  assert.equal(c.run('receipts[0].items[1].unitPrice'), charged);
  assert.equal(c.run('receipts[0].monthEndRebates[0].id'), 'promo');
  assert.equal(c.run('receipts[0].monthEndRebates[0].rebate'), (charged - 7) * 5);
});
test('quantity corrections remain available while discount and monetary verification stay open', async () => {
  const c = await savedReceipt({ shortage: 2 });
  c.run('openReceiptFix(receipts[0].id)');
  assert.equal(c.run('receiptFixEffectiveInfo().amountGapOpen'), false);
  assert.match(c.node('app').innerHTML, /חוסר 2 יח׳/);
  assert.doesNotMatch(c.node('app').innerHTML, /data-role="rc-fix-price"|הכל תואם — אפשר לסגור/);
  c.run("receiptFix.items.find(l=>l.productId==='missing').qty=30");
  await c.run('saveReceiptFix()');
  const update = c.writes.at(-1).data;
  assert.equal(update.status, 'open');
  assert.equal(update.unresolvedAmountGap, 0);
  c.context.quantityUpdate = update; c.run('Object.assign(receipts[0],quantityUpdate)');
  assert.equal(await saveRate(c, '8'), true);
  assert.equal(c.run('receipts[0].status'), 'ok');
  assert.equal(c.run("receipts[0].items.find(l=>l.productId==='missing').qty"), 30);
});
test('scanner counting also saves known quantities as open without another OCR request', async () => {
  const c = await deferred();
  c.run("receiptCountingMode='scan';receiptList=[{productId:'missing',name:'לחם',qty:28},{productId:'known',name:'לחמניות',qty:5}];finishReceipt()");
  assert.equal(c.run('pendingReceipt.lines[0].noteQty'), 30);
  assert.equal(c.run('pendingReceipt.lines[0].qty'), 28);
  assert.match(c.node('rsBody').innerHTML, /חוסר 2 יח׳/);
  assert.equal(c.requests.length, 1);
});
test('stale forms and a double click cannot overwrite a newer quantity review', async () => {
  const c = await savedReceipt(), token = c.run('JSON.stringify([receipts[0].items,receipts[0].discountReview])');
  c.run('receipts[0].items[0].qty=29');
  assert.equal(await c.run("bermanSaveKnownDiscount('missing','8',receipts[0].id,"+JSON.stringify(token)+")"), false);
  c.run('runCloudTask=()=>new Promise(resolve=>{globalThis.releaseDiscount=resolve})');
  const first = saveRate(c, '8');
  assert.equal(await saveRate(c, '8'), false);
  c.run('releaseDiscount(true)'); assert.equal(await first, true);
  assert.equal(c.run('receipts[0].items[0].qty'), 29);
  assert.equal(c.run('receipts[0].status'), 'open');
});
test('late successful retry updates the active deferred draft without OCR', async () => {
  const c = await deferred(); c.run('runCloudTask=async()=>false');
  assert.equal(await c.run("bermanSaveKnownDiscount('missing','8','',bermanDeferredSourceKey())"), false);
  c.run("Object.assign(products[0],{discountSet:true,discountPct:8,price:5.7408,discountSource:{method:'supplier_confirmation',approvedPct:8,receiptId:receiptDraftId}});bermanSyncApprovedDiscounts()");
  assert.equal(c.run('receiptPaperScanState'), 'ok');
  assert.equal(c.requests.length, 1);
});
test('private backup can finish quantity review and later confirm the supplier discount without scanning', { skip: !process.env.BERMAN_DISCOUNT_BACKUP }, async () => {
  const b = JSON.parse(fs.readFileSync(process.env.BERMAN_DISCOUNT_BACKUP, 'utf8'));
  const data = { ...fixture(), products: Object.entries(b.collections.products).map(([id,p])=>({id,...p})),
    promos: Object.entries(b.collections.promos).map(([id,p])=>({id,...p})) };
  const c = runtime({ data });
  c.storage.set(c.run('RECEIPT_DRAFT_KEY'), JSON.stringify(b.localDrafts.receipt));
  c.run("restoreReceiptDraft();receiptCountingMode='manual';currentView='receiving'");
  assert.equal(c.run('bermanDeferDiscount()'), true);
  c.run('receiptList=[]'); c.click('rc-quantity-all');
  assert.equal(c.run('pendingReceipt.lines.reduce((n,l)=>n+l.qty,0)'), 91);
  await c.run('confirmReceipt()');
  const task = c.writes.find(t=>t.op==='set'); c.context.savedTestReceipt = { id: task.operationId, ...task.data };
  c.run("receipts=[savedTestReceipt];currentView='receiptsHistory'");
  assert.equal(await saveRate(c, '8', 'code_111'), true);
  assert.equal(c.run('receipts[0].status'), 'ok');
  assert.equal(c.run('receipts[0].totalExVat'), 723.73);
  assert.equal(c.requests.length, 0);
});
