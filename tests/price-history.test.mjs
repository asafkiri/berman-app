import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, fixture } from './receipt-scan-harness.mjs';

// v118: מחיר לקוח עם היסטוריה. אימוץ מחיר מהחשבונית כותב רק priceHistory על
// המוצר; product.price (המחיר שהקליטה משווה אליו את התעודה) אינו משתנה.
const { products } = fixture();
const product = code => products.find(p => p.code === String(code));

test('v118 — אימוץ מחיר חשבונית: רשומת היסטוריה בלבד, product.price נשאר', async () => {
  const rt = runtime();
  const p = product('1220');
  rt.run(`receipts = []; returns = []; monthInvoice = { month: '2026-09', totalEx: null, lines: {} };`);
  await rt.run(`adoptInvoicePrice('${p.id}', 12, '2026-09-01')`);
  assert.equal(rt.writes.length, 1);
  const w = rt.writes[0];
  assert.equal(w.op, 'update');
  assert.equal(w.path[w.path.length - 1], p.id);
  assert.deepEqual(Object.keys(w.data), ['priceHistory']);
  assert.equal(w.data.priceHistory.length, 1);
  assert.equal(w.data.priceHistory[0].from, '2026-09-01');
  assert.equal(w.data.priceHistory[0].price, 12);
  assert.equal(w.data.priceHistory[0].source.method, 'invoice');
  assert.equal(w.data.priceHistory[0].source.month, '2026-09');
  assert.equal(rt.run(`products.find(x => x.id === '${p.id}').price`), p.price, 'product.price untouched');
  assert.equal(rt.run(`priceAt(products.find(x => x.id === '${p.id}'), '2026-08-31')`), p.price, 'August keeps the old price');
  assert.equal(rt.run(`priceAt(products.find(x => x.id === '${p.id}'), '2026-09-15')`), 12);
  assert.match(rt.toasts.join(' '), /מחיר חשבונית ₪12/);
});

test('v118 — אימוץ חוזר לאותו חודש דורס; אימוץ לחודש מוקדם יותר מתווסף לפניו', async () => {
  const rt = runtime();
  const p = product('3604');
  rt.run(`receipts = []; returns = []; monthInvoice = { month: '2026-09', totalEx: null, lines: {} };`);
  await rt.run(`adoptInvoicePrice('${p.id}', 9.5, '2026-09-01')`);
  await rt.run(`adoptInvoicePrice('${p.id}', 9.55, '2026-09-01')`);
  assert.equal(rt.run(`products.find(x => x.id === '${p.id}').priceHistory.length`), 1);
  assert.equal(rt.run(`priceAt(products.find(x => x.id === '${p.id}'), '2026-09-10')`), 9.55);
  await rt.run(`adoptInvoicePrice('${p.id}', 9.4, '2026-08-01')`);
  assert.equal(rt.run(`products.find(x => x.id === '${p.id}').priceHistory.map(h => h.from + ':' + h.price).join(',')`), '2026-08-01:9.4,2026-09-01:9.55');
  assert.equal(rt.run(`priceAt(products.find(x => x.id === '${p.id}'), '2026-08-20')`), 9.4);
  assert.equal(rt.run(`priceAt(products.find(x => x.id === '${p.id}'), '2026-07-20')`), p.price);
});

test('v118 — שורות החשבונית: הקלדה, השוואה, קוד חלופי', async () => {
  const rt = runtime();
  const p339 = product('339'), p458 = product('458');
  // טווח של חודש שלם במסך — אחרת המרכזת מנקה את שורות החשבונית (אין חשבונית לטווח חלקי)
  rt.node('rcFrom').value = '2026-09-01'; rt.node('rcTo').value = '2026-09-30';
  rt.run(`receipts = [{ id: 'r1', docDate: '2026-09-10', timestamp: 1, vatPct: 18, items: [
      { productId: '${p339.id}', name: '${p339.name}', qty: 10, unitPrice: 12.047 },
      { productId: '${p458.id}', name: '${p458.name}', qty: 31, unitPrice: 10.406 } ] }];
    returns = []; monthInvoice = { month: '2026-09', totalEx: null, lines: {} };
    setInvoiceLine('339', 'qty', '10'); setInvoiceLine('339', 'price', '10');
    setInvoiceLine('458', 'qty', '8'); setInvoiceLine('458', 'price', '10.406');
    setInvoiceLine('4581', 'qty', '23'); setInvoiceLine('4581', 'price', '10.452');`);
  assert.equal(rt.run('JSON.stringify(monthInvoice.lines)'), JSON.stringify({ '339': { qty: 10, price: 10 }, '458': { qty: 8, price: 10.406 }, '4581': { qty: 23, price: 10.452 } }), 'prices keep three decimals, as printed');
  const row = code => `receiptRangeData('2026-09-01', '2026-09-30').matrix.list.find(r => r.code === '${code}')`;
  assert.equal(rt.run(`invoiceRowCompare(${row('339')}, monthInvoice).status`), 'ok', 'promo price 10 matches the invoice');
  assert.equal(rt.run(`invoiceRowCompare(${row('458')}, monthInvoice).status`), 'qty', '4581 is unknown, so 458 sees 8 against 31');
  assert.equal(rt.run(`invoiceExtraLines(receiptRangeData('2026-09-01', '2026-09-30').matrix, monthInvoice).map(x => x.code + ':' + (x.product ? 'known' : 'unknown')).join(',')`), '4581:unknown');
  await rt.run(`assignInvoiceAltCode('4581', '${p458.id}')`);
  assert.equal(JSON.stringify(rt.writes[rt.writes.length - 1].data), JSON.stringify({ altCodes: ['4581'] }));
  const cmp = rt.run(`invoiceRowCompare(${row('458')}, monthInvoice)`);
  assert.equal(cmp.invQty, 31);
  assert.equal(cmp.status, 'amount', 'quantities merge; the 4581 price gap stays visible as an amount difference');
  assert.equal(rt.run(`invoiceExtraLines(receiptRangeData('2026-09-01', '2026-09-30').matrix, monthInvoice).length`), 0);
  // מחיר שונה בספרה השלישית נחשב מחיר אחר (ברמן מכפילה את המחיר בשלוש ספרות)
  rt.run(`setInvoiceLine('339', 'price', '10.001')`);
  assert.equal(rt.run(`invoiceRowCompare(${row('339')}, monthInvoice).status`), 'price');
  assert.equal(rt.run(`rangeMonthKey('2026-09-01', '2026-09-30')`), '2026-09');
  assert.equal(rt.run(`rangeMonthKey('2026-09-02', '2026-09-30')`), '', 'a partial month has no invoice');
});
