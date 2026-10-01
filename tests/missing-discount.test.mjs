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
  const token = c.run('bermanReceiptDiscountFingerprint(receipts[0])');
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
  const c = await savedReceipt(), token = c.run('bermanReceiptDiscountFingerprint(receipts[0])');
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

// v108: ההנחה נשמרה אבל הסכום לפיה אינו תואם לנייר (תעודת 1.10.2026: 30%
// על לחמניות 6 בשקית, ₪437.70 מול ₪430.07). המסך חזר לאותו מצב סגול עם שדה
// ריק, ולחיצה חוזרת על אותו אחוז לא שינתה דבר — וזה נראה כמו שמירה שנכשלה.
function proveKnown(c, fields = {}) {
  c.context.priorFields = fields;
  c.run("receipts.push({ id: 'prior', timestamp: 1, date: '2026-09-01', status: 'ok', noteTotalInc: 40, items: [{ productId: 'known', name: 'לחמניות בדיקה', qty: 5, unitPrice: 8 }], ...priorFields })");
}
const card = c => c.node('app').innerHTML.match(/<section data-receipt-discount[\s\S]*?<\/section>/)?.[0] || '';
test('v108: a saved rate that misses the paper shows the saved rate and the money gap, without a guess', async () => {
  const c = await savedReceipt();
  assert.equal(await saveRate(c, '5'), true);
  assert.equal(c.run('receipts[0].discountReview.status'), 'price_check');
  assert.equal(c.toasts.at(-1), 'ההנחה נשמרה, אבל לפיה התעודה יוצאת ₪217.84 ובנייר ₪212.22 — הפרש ₪5.62. בדוק את ההנחה מול הספק.');
  const html = card(c);
  assert.match(html, /נשמר כרגע: 5%/);
  assert.match(html, /data-role="berman-known-discount"[^>]*value="5"/);
  assert.match(html, /לפי ההנחה שנשמרה: ₪217\.84 · בתעודה: ₪212\.22/);
  assert.match(html, /הפרש ₪5\.62 — בתעודה פחות מהחישוב/);
  assert.doesNotMatch(html, /data-discount-implied|berman-known-discount-fill/);
});
const adoptButton = (c, html = card(c)) => {
  const tag = html.match(/<button data-role="berman-known-discount-adopt"[^>]*>/)?.[0];
  if (!tag) return null;
  const attr = name => tag.match(new RegExp(name + '="([^"]*)"'))[1].replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const button = { dataset: { value: attr('data-value'), product: attr('data-product'), receipt: attr('data-receipt'), fingerprint: attr('data-fingerprint') },
    closest: s => s === '[data-role="berman-known-discount-adopt"]' ? button : null };
  return button;
};
test('v108: the paper-implied rate is offered when every other row is proven, and one tap sets it', async () => {
  const c = await savedReceipt(); proveKnown(c);
  assert.equal(await saveRate(c, '5'), true);
  assert.match(c.toasts.at(-1), /הפרש ₪5\.62\. לפי הנייר ההנחה היא 8%\.$/);
  const html = card(c);
  assert.match(html, /לפי סכום התעודה, ההנחה על לחם בדיקה היא <b dir="ltr">8%<\/b>\. המוצר האחר בתעודה כבר מאומת\./);
  assert.match(html, /data-role="berman-known-discount-adopt" data-value="8"[^>]*>קבע 8% לפי התעודה</);
  const writes = c.writes.length;
  assert.equal(await c.events.get('app:click')({ target: adoptButton(c) }), true);
  assert.equal(c.writes.length, writes + 1);
  assert.equal(c.run('receipts[0].discountReview.status'), 'resolved');
  assert.equal(c.run('receipts[0].status'), 'ok');
  assert.equal(c.run('products[0].discountPct'), 8);
  assert.equal(c.run('products[0].discountSource.basis'), 'paper_total');
  assert.equal(c.toasts.at(-1), 'ההנחה 8% נקבעה לפי התעודה.');
  assert.equal(card(c), '');
});
test('v108: before any rate is typed, a stored receipt already offers the paper rate', async () => {
  const c = await savedReceipt(); proveKnown(c); c.run('renderReceiptsHistory()');
  const html = card(c);
  assert.match(html, /התעודה פתוחה — חסר אחוז הנחה/);
  assert.doesNotMatch(html, /נשמר כרגע|data-discount-gap/);
  assert.match(html, /קבע 8% לפי התעודה/);
  assert.equal(await c.events.get('app:click')({ target: adoptButton(c) }), true);
  assert.equal(c.run('receipts[0].status'), 'ok');
  assert.equal(c.run('products[0].discountSource.basis'), 'paper_total');
});
test('v108: without proven neighbours nothing is offered before typing either', async () => {
  const c = await savedReceipt();
  assert.doesNotMatch(card(c), /data-discount-implied|berman-known-discount-adopt/);
});
test('v108: a paper that charges the full list price offers an explicit 0%', async () => {
  const data = fixture(); data.paper.scan.documents[0].netToChargeExVat = 227.2;
  const c = await savedReceipt({ data }); proveKnown(c); c.run('renderReceiptsHistory()');
  assert.match(card(c), /היא <b dir="ltr">0%<\/b>/);
  assert.equal(await c.events.get('app:click')({ target: adoptButton(c) }), true);
  assert.equal(c.run('products[0].discountSet'), true);
  assert.equal(c.run('products[0].discountPct'), 0);
  assert.equal(c.run('receipts[0].status'), 'ok');
});
test('v108: a set button whose rate no longer follows from the paper does not save', async () => {
  const c = await savedReceipt(); proveKnown(c); c.run('renderReceiptsHistory()');
  const button = adoptButton(c), writes = c.writes.length;
  button.dataset.value = '7';
  assert.equal(await c.events.get('app:click')({ target: button }), false);
  assert.equal(c.toasts.at(-1), 'ההצעה לפי התעודה השתנתה — בדוק שוב לפני השמירה.');
  c.run("receipts.splice(1, 1)");
  button.dataset.value = '8';
  assert.equal(await c.events.get('app:click')({ target: button }), false, 'the neighbouring proof is gone');
  assert.equal(c.writes.length, writes);
  assert.equal(c.run('receipts[0].status'), 'open');
});
test('v108: receiving offers the paper rate before deferral, and one tap closes the paper check', async () => {
  const c = await scanned();
  assert.doesNotMatch(c.node('app').innerHTML, /berman-known-discount-adopt/);
  proveKnown(c); c.run('renderReceiving()');
  const html = c.node('app').innerHTML.match(/<section data-missing-discount[\s\S]*?<\/section>/)[0];
  assert.match(html, /חסר אחוז הנחה — לבירור מול הספק/);
  assert.match(html, /קבע 8% לפי התעודה/);
  assert.match(html, /data-role="berman-discount-later"/);
  assert.equal(c.run('bermanDeferredReview()'), null, 'showing the offer does not defer');
  assert.equal(await c.events.get('app:click')({ target: adoptButton(c, html) }), true);
  assert.equal(c.run('products[0].discountPct'), 8);
  assert.equal(c.run('products[0].discountSource.basis'), 'paper_total');
  assert.equal(c.run('receiptPaperScanState'), 'ok');
  assert.equal(c.requests.length, 1);
});
for (const [name, fields] of [
  ['another unit price', { items: [{ productId: 'known', qty: 5, unitPrice: 8.5 }] }],
  ['an open receipt', { status: 'open' }],
  ['a receipt without a paper total', { noteTotalInc: null }],
  ['a receipt still under price check', { discountReview: { schemaVersion: 1, status: 'price_check', missing: [], rates: {}, catalog: [], documents: [], notes: [], promos: [] } }]
]) test('v108: ' + name + ' does not prove a neighbouring row, so no rate is guessed', async () => {
  const c = await savedReceipt(); proveKnown(c, fields);
  await saveRate(c, '5');
  assert.match(card(c), /הפרש ₪5\.62/);
  assert.doesNotMatch(card(c), /data-discount-implied/);
});
test('v108: the receipt itself cannot prove its own rows', async () => {
  const c = await savedReceipt();
  c.run("Object.assign(receipts[0], { status: 'ok', date: '2026-09-14', docDate: '2026-09-14', discountReview: { ...receipts[0].discountReview, status: 'resolved' } })");
  assert.equal(c.run("bermanUnitPriceProven('known', 8, '', '2026-09-14')"), true, 'the same receipt would prove the row if it were not excluded');
  assert.equal(c.run("bermanUnitPriceProven('known', 8, receipts[0].id, '2026-09-14')"), false);
  assert.equal(c.run("bermanUnitPriceProven('known', 8, '', '')"), false, 'no paper date, no proof');
});
test('v108: saving the same rate again explains the gap and writes nothing', async () => {
  const c = await savedReceipt(); proveKnown(c);
  await saveRate(c, '5');
  const writes = c.writes.length;
  assert.equal(await saveRate(c, '5'), false);
  assert.equal(c.writes.length, writes);
  assert.equal(c.toasts.at(-1), 'ההנחה 5% כבר שמורה, אבל לפיה התעודה יוצאת ₪217.84 ובנייר ₪212.22 — הפרש ₪5.62. לפי הנייר ההנחה היא 8%.');
  c.run('products[0].discountPct=8;products[0].price=5.7408');
  assert.equal(await saveRate(c, '5'), false, 'a rate this receipt already disproved never overwrites the catalog');
  assert.equal(c.writes.length, writes);
  assert.equal(c.run('products[0].discountPct'), 8);
});
test('v108: a re-save of the stored rate goes through when a rebuild today already closes the receipt', async () => {
  const c = await savedReceipt();
  assert.equal(await saveRate(c, '8'), true);
  c.run("receipts[0].discountReview.status='price_check';receipts[0].status='open'");
  assert.equal(await saveRate(c, '8'), true);
  assert.equal(c.run('receipts[0].discountReview.status'), 'resolved');
});
test('v108: two products that were missing a discount are never attributed from the remainder', async () => {
  const data = fixture(); data.products[1].discountSet = false;
  const c = await savedReceipt({ data }); proveKnown(c);
  await saveRate(c, '5'); await saveRate(c, '20', 'known');
  assert.equal(c.run('receipts[0].discountReview.status'), 'price_check');
  assert.match(card(c), /הפרש ₪5\.62 — בתעודה פחות מהחישוב/);
  assert.match(card(c), /נשמר כרגע: 5%/);
  assert.match(card(c), /נשמר כרגע: 20%/);
  assert.doesNotMatch(card(c), /data-discount-implied/);
  assert.equal(c.run('bermanImpliedDiscount({ ...receipts[0].discountReview, missing: receipts[0].discountReview.missing.slice(0, 1) }, receipts[0].id).pct'), 8,
    'the same paper with one missing product would be attributed — only the count blocks it');
});
test('v108: a promotion on the missing product itself prevents a guess', async () => {
  const data = fixture();
  data.promos = [{ id: 'promo', productIds: ['missing'], fixedPrice: 5, type: 'receipt', minQty: 1, minUnit: 'unit', start: '2026-09-01', end: '2026-09-30' }];
  const c = await savedReceipt({ data }); proveKnown(c);
  await saveRate(c, '5');
  assert.equal(c.run('receipts[0].discountReview.status'), 'price_check');
  assert.doesNotMatch(card(c), /data-discount-implied/);
});
test('v108: an unchanged receipt whose fields return from the cloud in another order still saves', async () => {
  const c = await savedReceipt(), token = c.run('bermanReceiptDiscountFingerprint(receipts[0])');
  const before = c.run('JSON.stringify([receipts[0].items,receipts[0].discountReview])');
  c.run('const rev = v => Array.isArray(v) ? v.map(rev) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, rev(x)])) : v; receipts[0] = rev(receipts[0])');
  assert.notEqual(c.run('JSON.stringify([receipts[0].items,receipts[0].discountReview])'), before);
  assert.equal(c.run('bermanReceiptDiscountFingerprint(receipts[0])'), token);
  assert.equal(await c.run("bermanSaveKnownDiscount('missing','8',receipts[0].id," + JSON.stringify(token) + ')'), true);
  assert.equal(c.run('receipts[0].status'), 'ok');
});
test('v108: a cloud re-render keeps an open receipt open and an unsaved percentage in its field', async () => {
  const c = await savedReceipt(), id = c.run('receipts[0].id'), app = c.node('app');
  const typed = { dataset: { key: id + '|missing', initial: '' }, value: '7' }, fresh = { dataset: { key: id + '|missing', initial: '' }, value: '' };
  let inputCalls = 0;
  app.querySelectorAll = s => s.startsWith('details') ? [{ dataset: { rcCard: id } }]
    : s === '[data-role="berman-known-discount"]' ? (inputCalls++ ? [fresh] : [typed]) : [];
  c.run('renderReceiptsHistory()');
  assert.match(app.innerHTML, new RegExp('<details data-rc-card="' + id + '" open'));
  assert.equal(fresh.value, '7');
  app.querySelectorAll = () => [];
  c.run('renderReceiptsHistory()');
  assert.doesNotMatch(app.innerHTML, /data-rc-card="[^"]*" open/);
});
test('v108: receiving shows the saved rate and the gap, and the same rate again does not write', async () => {
  const c = await scanned();
  assert.equal(await c.run("bermanSaveKnownDiscount('missing','5','',bermanDeferredSourceKey())"), true);
  assert.match(c.toasts.at(-1), /^ההנחה נשמרה, אבל לפיה התעודה יוצאת ₪217\.84 ובנייר ₪212\.22 — הפרש ₪5\.62\./);
  const html = c.node('app').innerHTML;
  assert.match(html, /הסכום עדיין לא תואם — בדוק את ההנחה שנמסרה/);
  assert.match(html, /לפי ההנחה שנשמרה: ₪217\.84 · בתעודה: ₪212\.22/);
  assert.match(html, /נשמר כרגע: 5%/);
  const writes = c.writes.length;
  assert.equal(await c.run("bermanSaveKnownDiscount('missing','5','',bermanDeferredSourceKey())"), false);
  assert.equal(c.writes.length, writes);
  assert.match(c.toasts.at(-1), /^ההנחה 5% כבר שמורה/);
  c.click('rc-quantity-all');
  assert.match(c.node('rsBody').innerHTML, /הפרש ₪5\.62 — בתעודה פחות מהחישוב/);
});
test('v108: a counted product that is not on the paper does not break the discount status', async () => {
  const data = fixture();
  data.products.push({ id: 'extra', code: '8003', barcode: '7290000008003', name: 'מוצר שלא בתעודה', listPrice: 5, price: 5, discountPct: 0, discountSet: true });
  const c = await deferred(data);
  c.run("receiptList.push({ productId: 'extra', name: 'מוצר שלא בתעודה', qty: 1 })");
  assert.equal(await c.run("bermanSaveKnownDiscount('missing','8','',bermanDeferredSourceKey())"), true);
  assert.equal(c.toasts.at(-1), 'ההנחה שאושרה מול הספק נשמרה.');
  assert.equal(c.run('bermanDeferredReview()'), null);
  assert.equal(c.run('receiptPaperScanState'), 'ok');
});
test('v108: private backup — every receipt under price check explains its gap, and an offered rate closes it', { skip: !process.env.BERMAN_PRICE_CHECK_BACKUP }, async () => {
  const b = JSON.parse(fs.readFileSync(process.env.BERMAN_PRICE_CHECK_BACKUP, 'utf8'));
  const data = { ...fixture(), products: Object.entries(b.collections.products).map(([id, p]) => ({ id, ...p })),
    promos: Object.entries(b.collections.promos).map(([id, p]) => ({ id, ...p })) };
  const c = runtime({ data });
  c.context.backupReceipts = Object.entries(b.collections.receipts).map(([id, r]) => ({ id, ...r }));
  c.run("receipts = backupReceipts; currentView = 'receiptsHistory'");
  const ids = JSON.parse(c.run("JSON.stringify(receipts.filter(r => r.discountReview && r.discountReview.status === 'price_check').map(r => r.id))"));
  assert.ok(ids.length);
  for (const id of ids) {
    c.context.rid = id;
    const info = JSON.parse(c.run('JSON.stringify(bermanDiscountCheckInfo(receipts.find(r => r.id === rid).discountReview, rid))'));
    assert.notEqual(info.gap, 0, id);
    if (!info.implied) continue;
    const token = c.run('bermanReceiptDiscountFingerprint(receipts.find(r => r.id === rid))');
    assert.equal(await c.run('bermanSaveKnownDiscount(' + JSON.stringify(info.implied.productId) + ',' + JSON.stringify(String(info.implied.pct)) + ',rid,' + JSON.stringify(token) + ",'paper_total')"), true);
    assert.equal(c.run('receipts.find(r => r.id === rid).discountReview.status'), 'resolved', id);
    assert.equal(c.run('receipts.find(r => r.id === rid).unresolvedAmountGap'), 0, id);
  }
  assert.equal(c.requests.length, 0);
});

for (const [name, fields] of [
  ['a proof more than a month before the paper', { date: '2026-08-10', docDate: '2026-08-10' }],
  ['a proof dated after the paper', { date: '2026-09-20', docDate: '2026-09-20' }]
]) test('v108: ' + name + ' does not prove a neighbouring row', async () => {
  const c = await savedReceipt(); proveKnown(c, fields); c.run('renderReceiptsHistory()');
  assert.doesNotMatch(card(c), /data-discount-implied/);
});
test('v108: an older matching price is no proof when the latest verified receipt shows another price', async () => {
  const c = await savedReceipt(); proveKnown(c);
  c.run("receipts.push({ id: 'newer', timestamp: 2, date: '2026-09-10', docDate: '2026-09-10', status: 'ok', noteTotalInc: 37.5, items: [{ productId: 'known', name: 'לחמניות בדיקה', qty: 5, unitPrice: 7.5 }] }); renderReceiptsHistory()");
  assert.doesNotMatch(card(c), /data-discount-implied/);
  c.run("receipts.find(r => r.id === 'newer').items[0].unitPrice = 8; renderReceiptsHistory()");
  assert.match(card(c), /קבע 8% לפי התעודה/);
});
test('v108: a line too small for the rounding tolerance to decide the rate gets no offer', async () => {
  const data = fixture(), d = data.paper.scan.documents[0];
  d.rows[0].quantity = 2; d.totalUnits = 7; d.netToChargeExVat = 51.48;
  const c = await savedReceipt({ data }); proveKnown(c); c.run('renderReceiptsHistory()');
  assert.match(card(c), /התעודה פתוחה — חסר אחוז הנחה/);
  assert.doesNotMatch(card(c), /data-discount-implied/);
});
test('v108: a printed list price that differs from the app is named instead of blaming the discount', async () => {
  const data = fixture(), d = data.paper.scan.documents[0];
  d.rows[1].unitPriceExVat = 10.5; d.netToChargeExVat = 214.22;
  const c = await savedReceipt({ data }); proveKnown(c);
  assert.equal(await saveRate(c, '8'), true);
  assert.equal(c.run('receipts[0].discountReview.status'), 'price_check');
  const html = card(c);
  assert.match(html, /מחיר המחירון שמודפס בתעודה שונה מזה שבאפליקציה — לחמניות בדיקה: בתעודה ₪10\.50, במחירון באפליקציה ₪10\.00/);
  assert.match(html, /אחוז ההנחה לא יסגור את זה/);
  assert.doesNotMatch(html, /התעודה תיסגר כשהאחוז יתאים לנייר|data-discount-gap|data-discount-implied/);
  assert.match(c.toasts.at(-1), /^ההנחה נשמרה, אבל מחיר המחירון בתעודה שונה מזה שבאפליקציה — לחמניות בדיקה: בתעודה ₪10\.50/);
});
test('v108: only a document that does not close contributes to the unresolved gap', async () => {
  const c = await savedReceipt(); await saveRate(c, '5');
  const one = c.run('bermanBuildDeferredReceipt(receipts[0].discountReview, []).unresolvedAmountGap');
  assert.equal(one, -5.62);
  c.run(`const r = cloneSafe(receipts[0].discountReview), a = cloneSafe(r.documents[0]);
    a.rows = [a.rows[1]]; a.__pricePaper.rows = [a.__pricePaper.rows[1]];
    a.subtotalExVat = a.netToChargeExVat = a.__pricePaper.netToChargeExVat = 40.2;
    a.printedUnits = a.totalUnits = a.__pricePaper.totalUnits = 5; a.printedLines = a.__pricePaper.printedLines = 1;
    r.documents.unshift(a); r.notes.unshift({ amount: 40.2, units: 5, lines: 1, kind: 'charge' }); globalThis.twoDocs = r;`);
  assert.equal(c.run('bermanBuildDeferredReceipt(twoDocs, []).unresolvedAmountGap'), -5.62, 'a 20 agorot rounding document adds nothing');
  assert.equal(c.run('bermanBuildDeferredReceipt(twoDocs, []).discountReview.status'), 'price_check');
});
test('v108: the receiving panel is not redrawn under a focused discount field, and keeps a typed rate otherwise', async () => {
  const c = await deferred(); assert.equal(await c.run("bermanSaveKnownDiscount('missing','5','',bermanDeferredSourceKey())"), true);
  const host = c.node('rcPriceAudit'), field = { dataset: { role: 'berman-known-discount', key: '|missing', initial: '5' }, value: '8' };
  host.innerHTML = 'typing'; host.contains = () => true; c.context.document.activeElement = field;
  c.run('refreshPriceAuditViews()');
  assert.equal(host.innerHTML, 'typing');
  c.context.document.activeElement = null;
  const fresh = { dataset: { key: '|missing', initial: '5' }, value: '5' }; let calls = 0;
  host.querySelector = () => null; host.querySelectorAll = sel => sel === '[data-role="berman-known-discount"]' ? (calls++ ? [fresh] : [field]) : [];
  c.run('refreshPriceAuditViews()');
  assert.match(host.innerHTML, /נשמר כרגע: 5%/);
  assert.equal(fresh.value, '8');
});

test('v108: a typed rate is dropped when the receipt changed underneath it, and kept when it did not', async () => {
  const c = await savedReceipt(), id = c.run('receipts[0].id'), app = c.node('app');
  const field = (fp, value, initial) => {
    const save = { dataset: { fingerprint: fp } }, box = { querySelector: s => s === '[data-role="berman-known-discount-save"]' ? save : null };
    return { dataset: { key: id + '|missing', initial }, value, closest: s => s === '[data-known-discount]' ? box : null };
  };
  const run = (before, after) => { let n = 0; app.querySelectorAll = s => s === '[data-role="berman-known-discount"]' ? (n++ ? [after] : [before]) : []; c.run('renderReceiptsHistory()'); };
  let fresh = field('A', '', ''); run(field('A', '7', ''), fresh);
  assert.equal(fresh.value, '7');
  fresh = field('B', '5', '5'); run(field('A', '7', ''), fresh);
  assert.equal(fresh.value, '5', 'another device changed the receipt; the stale typing is not restored');
});
test('v108: a promotion price printed on the paper proves its own row without any earlier receipt', async () => {
  const data = fixture(), d = data.paper.scan.documents[0];
  data.promos = [{ id: 'promo', productIds: ['known'], fixedPrice: 7, type: 'receipt', minQty: 1, minUnit: 'unit', start: '2026-09-01', end: '2026-09-30' }];
  d.rows[1].unitPriceExVat = 7; d.netToChargeExVat = 172.22 + 7 * 5;
  const c = await savedReceipt({ data });
  assert.equal(c.run('receipts.length'), 1, 'no earlier receipt');
  c.run('renderReceiptsHistory()');
  assert.match(card(c), /המוצר האחר בתעודה כבר מאומת/);
  assert.match(card(c), /קבע 8% לפי התעודה/);
});
