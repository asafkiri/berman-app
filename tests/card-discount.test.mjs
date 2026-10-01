// v112 — אחוז שגוי בכרטיס מוצר (לא חסר, אלא שגוי). 1.10.2026: ניחוש של 30%
// נשמר בכרטיס של לחמניות 6 בשקית; התעודה שצולמה מחדש נעצרה ב"צריך להשלים את
// פענוח התעודה" עם הפניה לצילומים בלבד. כשרק מוצר אחד בתעודה לא אומת מול
// נייר, הקליטה אומרת איזה, ומציעה את האחוז שהנייר גוזר בלחיצה אחת.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './receipt-scan-harness.mjs';

function fixture() {
  const products = [
    { id: 'stale', code: '8001', barcode: '7290000008001', name: 'לחם בדיקה', listPrice: 6.24, price: 5.928, discountPct: 5, discountSet: true },
    { id: 'known', code: '8002', barcode: '7290000008002', name: 'לחמניות בדיקה', listPrice: 10, price: 8, discountPct: 20, discountSet: true }
  ];
  return { products, promos: [], items: [], paper: { ok: true, scan: { warnings: [], documents: [{
    noteIndex: 0, docType: 'invoice', docNumber: 'CARD-TEST', docDate: '14/09/2026', pageCount: 1,
    totalUnits: 35, printedLines: 2, netToChargeExVat: 212.22,
    rows: products.map((p, i) => ({ itemCode: p.code, barcode: p.barcode, description: p.name,
      quantity: i ? 5 : 30, unitPriceExVat: p.listPrice, sourcePage: 1, lineNumber: i + 1 })), warnings: []
  }] } } };
}
const prove = (c, fields = {}) => { c.context.priorFields = fields;
  c.run("receipts.push({ id: 'prior', timestamp: 1, date: '2026-09-01', docDate: '2026-09-01', status: 'ok', noteTotalInc: 40, items: [{ productId: 'known', name: 'לחמניות בדיקה', qty: 5, unitPrice: 8 }], ...priorFields })"); };
async function scanned({ data = fixture(), mode = 'manual', proven = true } = {}) {
  const c = runtime({ data });
  c.run("currentView='receiving';mainMode='receiving';receiptCountingMode=" + JSON.stringify(mode));
  if (proven) prove(c);
  await c.scan(); c.run('renderReceiving()');
  return c;
}
const offerBox = c => c.node('app').innerHTML.match(/<div data-card-discount-offer[\s\S]*?<\/button><\/div>/)?.[0] || '';
const adoptButton = c => {
  const tag = c.node('app').innerHTML.match(/<button data-role="berman-card-discount-adopt"[^>]*>/)[0];
  const attr = n => tag.match(new RegExp(n + '="([^"]*)"'))[1].replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const button = { dataset: { product: attr('data-product'), value: attr('data-value'), fingerprint: attr('data-fingerprint') } };
  button.closest = s => s === '[data-role="berman-card-discount-adopt"]' ? button : null;
  return button;
};

for (const mode of ['manual', 'scan']) test('a wrong card discount on the only unproven product is named, with the paper rate (' + mode + ' counting)', async () => {
  const c = await scanned({ mode });
  assert.equal(c.run('receiptPaperScanState'), 'failed');
  const box = offerBox(c);
  assert.match(box, /ייתכן שאחוז ההנחה בכרטיס של לחם בדיקה שגוי/);
  assert.match(box, /בכרטיס רשום 5%, והמחיר הזה לא אומת מול נייר בחודש האחרון\. לפיו התעודה יוצאת ₪217\.84 ובנייר ₪212\.22\./);
  assert.match(box, /אם ההנחות של שאר המוצרים לא השתנו, ההנחה על לחם בדיקה לפי סכום התעודה היא <b dir="ltr">8%<\/b>/);
  assert.match(box, /קבע 8% לפי התעודה/);
});
test('one tap updates the card, re-prices the paper already read and unblocks the receipt without another scan', async () => {
  const c = await scanned();
  assert.equal(await c.events.get('app:click')({ target: adoptButton(c) }), true);
  assert.equal(c.writes.length, 1);
  assert.deepEqual(c.writes[0].path.slice(-2), ['products', 'stale']);
  assert.equal(c.run('products[0].discountPct'), 8);
  assert.equal(c.run('products[0].discountSource.basis'), 'paper_total');
  assert.equal(c.run('products[0].discountSource.previousPct'), 5);
  assert.equal(c.run('receiptPaperScanState'), 'ok');
  assert.equal(c.run('receiptNoteTotal'), 212.22);
  assert.equal(offerBox(c), '');
  assert.doesNotMatch(c.node('app').innerHTML, /צריך להשלים את פענוח התעודה/);
  assert.equal(c.toasts.at(-1), 'ההנחה על לחם בדיקה עודכנה ל־8% לפי התעודה (במקום 5%).');
  assert.equal(c.requests.length, 1, 'no second OCR request');
});
test('without a proven neighbour, or with two unproven products, nothing is offered', async () => {
  const lone = await scanned({ proven: false });
  assert.equal(lone.run('receiptPaperScanState'), 'failed');
  assert.equal(offerBox(lone), '');
  const data = fixture();
  data.products.push({ id: 'third', code: '8003', barcode: '7290000008003', name: 'פיתות בדיקה', listPrice: 4, price: 3, discountPct: 25, discountSet: true });
  const d = data.paper.scan.documents[0];
  d.rows.push({ itemCode: '8003', barcode: '7290000008003', description: 'פיתות בדיקה', quantity: 10, unitPriceExVat: 4, sourcePage: 1, lineNumber: 3 });
  d.totalUnits = 45; d.printedLines = 3; d.netToChargeExVat = 242.22;
  const two = await scanned({ data });
  assert.equal(two.run('receiptPaperScanState'), 'failed');
  assert.equal(offerBox(two), '', 'the gap could belong to either unproven product');
});
test('a printed list price that differs from the card is not attributed to a discount', async () => {
  const data = fixture(); data.paper.scan.documents[0].rows[1].unitPriceExVat = 10.5; data.paper.scan.documents[0].netToChargeExVat = 214.22;
  const c = await scanned({ data });
  assert.equal(offerBox(c), '');
});
test('a paper that already balances, or a discount that is missing rather than wrong, keeps its own flow', async () => {
  const data = fixture(); data.products[0].discountPct = 8; data.products[0].price = 5.7408;
  const ok = await scanned({ data });
  assert.equal(ok.run('receiptPaperScanState'), 'ok');
  assert.equal(offerBox(ok), '');
  const missing = fixture(); missing.products[0].discountSet = false;
  const m = await scanned({ data: missing });
  assert.equal(offerBox(m), '');
  assert.match(m.node('app').innerHTML, /data-missing-discount/);
});
test('a set button whose rate no longer follows from the paper does not save', async () => {
  const c = await scanned(), button = adoptButton(c);
  button.dataset.value = '7';
  assert.equal(await c.events.get('app:click')({ target: button }), false);
  assert.equal(c.toasts.at(-1), 'ההצעה לפי התעודה השתנתה — בדוק שוב לפני השמירה.');
  button.dataset.value = '8'; button.dataset.fingerprint = 'stale';
  assert.equal(await c.events.get('app:click')({ target: button }), false);
  assert.equal(c.writes.length, 0);
  assert.equal(c.run('products[0].discountPct'), 5);
});
test('a failed cloud write leaves the card and the paper state unchanged', async () => {
  const c = await scanned();
  c.run('runCloudTask = async () => false');
  assert.equal(await c.events.get('app:click')({ target: adoptButton(c) }), false);
  assert.equal(c.run('products[0].discountPct'), 5);
  assert.equal(c.run('receiptPaperScanState'), 'failed');
  assert.match(offerBox(c), /קבע 8% לפי התעודה/);
});
