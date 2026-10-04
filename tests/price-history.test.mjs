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

test('v119 — סה"כ החשבונית נשמר לפי חודש; טווח חלקי אינו חודש', () => {
  const rt = runtime();
  rt.run(`receipts = []; returns = []; monthInvoice = { month: '2026-09', totalEx: null };`);
  assert.equal(rt.run(`rangeMonthKey('2026-09-01', '2026-09-30')`), '2026-09');
  assert.equal(rt.run(`rangeMonthKey('2026-09-02', '2026-09-30')`), '', 'a partial month has no invoice');
  rt.node('rcFrom').value = '2026-09-01'; rt.node('rcTo').value = '2026-09-30'; rt.node('rcSupplierInc').value = '14,203.14';
  rt.run('compareSupplierStatement()');
  assert.equal(rt.run('monthInvoice.totalEx'), 14203.14);
});
