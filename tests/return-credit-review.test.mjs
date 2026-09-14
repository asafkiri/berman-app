import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './receipt-scan-harness.mjs';

// Synthetic return reproducing the reported totals; no customer data or photos.
function sampleReturn() {
  const values = [[6, 4.91], [2, 10.71], [1, 14.28], [2, 8.2], [1, 10.41],
    [1, 12.31], [1, 12.05], [1, 12.05], [5, 9.88], [7, 5.74]];
  return { id: 'test-return', date: '2026-01-01', timestamp: Date.UTC(2026, 0, 1), vatPct: 18,
    credited: false, creditNoteTotal: 205.69,
    items: values.map(([qty, unitPrice], i) => ({ name: i === 5 ? 'לחם מקמח כוסמין E-FREE' : 'מוצר בדיקה ' + i,
      barcode: 'test-barcode-' + i, code: 'test-' + i, productId: 'test-product-' + i,
      qty, unitPrice, lineTotal: Math.round(qty * unitPrice * 100) / 100 })) };
}
function open(doc = sampleReturn()) {
  const rt = runtime();
  rt.context.testReturn = structuredClone(doc);
  rt.run(`returns = [testReturn]; currentView = 'returnsHistory'; openReturnVerify('test-return');`);
  return rt;
}
const state = rt => JSON.parse(rt.run('JSON.stringify(returnVerify)'));
const summary = rt => JSON.parse(rt.run('JSON.stringify(rvCreditSummary())'));
async function markOthers(rt) {
  for (let i = 0; i < 10; i++) if (i !== 5) await rt.click('rv-check', String(i));
}
async function saveClick(rt) {
  await rt.click('rv-save');
  await rt.run('Promise.resolve()');
}

test('an unchecked row remains unreviewed; a review tick does not change credited quantities', async () => {
  const rt = open();
  await markOthers(rt);
  assert.equal(summary(rt).creditedEx, 217.96);
  assert.equal(summary(rt).gap, -12.27);
  assert.equal(state(rt).items[5].qty, 1);
  assert.equal(state(rt).items[5].noteQty, 1);
  assert.equal(state(rt).items[5].checked, false);
  assert.match(rt.run('rvRowHtml(returnVerify.items[5], 5)'), /ממתין לבדיקה/);
  assert.doesNotMatch(rt.run('rvRowHtml(returnVerify.items[5], 5)'), /זוכה במלואו/);
  await rt.click('rv-check', '5');
  assert.equal(summary(rt).creditedEx, 217.96);
  await rt.click('rv-check', '5');
  assert.equal(state(rt).items[5].noteQty, 1);
});

test('explicit not-credited action preserves the return and explains the missing product', async () => {
  const rt = open();
  await markOthers(rt);
  await rt.click('rv-not-credited', '5');
  const row = state(rt).items[5];
  assert.equal(row.qty, 1);
  assert.equal(row.noteQty, 0);
  assert.equal(row.unitPrice, 12.31);
  assert.equal(row.checked, true);
  assert.equal(rt.run('returns[0].items[5].noteQty'), undefined, 'no mutation before saving');
  assert.deepEqual(summary(rt), { sentEx: 217.96, creditedEx: 205.65, gap: 0.04,
    shortItems: [{ name: row.name, qty: 1, total: 12.31 }], overItems: [] });
  const html = rt.node('rvSummary').innerHTML;
  assert.match(html, /חסר זיכוי על:/);
  assert.match(html, /כוסמין E-FREE · 1 יח׳/);
  assert.match(html, /₪12.31/);
  assert.match(html, /הפרש קטן בסכום/);
  assert.match(html, /₪0.04/);
  assert.match(html, /נבדקו 10 מתוך 10/);
  assert.doesNotMatch(html, /הפרש לא מוסבר|עודף ₪12.27/);
  assert.equal(rt.node('rvSave').textContent, 'שמור חוסר בזיכוי');
  assert.match(rt.run('rvRowHtml(returnVerify.items[5], 5)'), /bg-rose-50/);
});

test('save keeps the known credit shortage open in both histories and when reopened', async () => {
  const rt = open();
  await markOthers(rt);
  await rt.click('rv-not-credited', '5');
  await saveClick(rt);
  assert.equal(rt.node('confirmTitle').textContent, '', 'no unnecessary confirmation');
  assert.equal(rt.writes.length, 1);
  const saved = rt.writes[0].data;
  assert.equal(saved.creditStatus, 'open');
  assert.equal(saved.creditNoteTotal, 205.69);
  assert.equal(saved.totalExVat, 217.96);
  assert.equal(saved.items.length, 10);
  assert.equal(saved.items[5].qty, 1);
  assert.equal(saved.items[5].noteQty, 0);
  assert.equal(saved.items[5].lineTotal, 12.31);
  assert.equal(saved.items[5].productId, 'test-product-5');
  assert.equal(saved.items[5].code, 'test-5');
  assert.equal(Object.hasOwn(saved.items[5], 'checked'), false);
  assert.equal(rt.run('returnVerify'), null);
  assert.equal(rt.run('returnsDiscrepancyInfo(returns[0]).open'), true);
  assert.equal(rt.run('returnsDiscrepancyInfo(returns[0]).shortItems[0].n'), 1);
  assert.equal(rt.run('returnsDiscrepancyInfo(returns[0]).owed'), 12.27);
  assert.match(rt.node('app').innerHTML, /פתוח — חסר זיכוי/);
  assert.match(rt.node('app').innerHTML, /חסר זיכוי: לחם מקמח כוסמין E-FREE/);
  assert.doesNotMatch(rt.node('app').innerHTML, /כל הזיכויים אומתו/);
  assert.match(rt.run('returnCardInReceipts(returns[0])'), /פתוח — חסר זיכוי/);
  assert.match(rt.run('returnCardInReceipts(returns[0])'), /חסר זיכוי על:/);
  rt.run(`openReturnVerify('test-return');`);
  assert.equal(state(rt).items[5].qty, 1);
  assert.equal(state(rt).items[5].noteQty, 0);
  assert.match(rt.node('app').innerHTML, /כוסמין E-FREE · 1 יח׳/);
});

test('not-credited is idempotent and changing the credited quantity can correct it', async () => {
  const rt = open();
  await rt.click('rv-not-credited', '5');
  await rt.click('rv-not-credited', '5');
  assert.equal(state(rt).items[5].noteQty, 0);
  await rt.click('rv-check', '5');
  assert.equal(state(rt).items[5].noteQty, 0, 'unchecking never assumes a credit');
  await rt.click('rv-plus', '5');
  assert.equal(state(rt).items[5].qty, 1);
  assert.equal(state(rt).items[5].noteQty, 1);
  assert.equal(summary(rt).shortItems.length, 0);
});

test('partial credit and additional credited units stay distinct, including live edits', async () => {
  const doc = sampleReturn();
  doc.items = [{ ...doc.items[0], qty: 4, unitPrice: 3, lineTotal: 12 }];
  doc.creditNoteTotal = 6;
  const rt = open(doc);
  await rt.click('rv-not-credited', '0');
  const field = { dataset: { role: 'rv-note', id: '0' }, value: '2', getAttribute: key => key === 'data-role' ? 'rv-note' : null };
  rt.events.get('app:input')({ target: field });
  assert.equal(state(rt).items[0].qty, 4);
  assert.deepEqual(summary(rt).shortItems, [{ name: doc.items[0].name, qty: 2, total: 6 }]);
  assert.match(rt.node('rvSummary').innerHTML, /חסר זיכוי על:/);
  assert.match(rt.node('rvStatus_0').innerHTML, /חסר זיכוי על 2 יח׳/);
  await saveClick(rt);
  assert.equal(rt.writes[0].data.items[0].noteQty, 2);
  assert.equal(rt.writes[0].data.items[0].qty, 4);
  assert.equal(rt.writes[0].data.creditStatus, 'open');
  rt.run(`openReturnVerify('test-return'); returnVerify.noteTotal = 15;`);
  field.value = '5'; rt.events.get('app:input')({ target: field });
  assert.equal(summary(rt).shortItems.length, 0);
  assert.equal(summary(rt).overItems[0].qty, 1);
  assert.match(rt.node('rvSummary').innerHTML, /זוכו יחידות נוספות:/);
});

test('a genuine remaining money gap is warned about and cannot be saved as closed', async () => {
  const doc = sampleReturn(); doc.creditNoteTotal = 200;
  const rt = open(doc);
  await markOthers(rt);
  await rt.click('rv-not-credited', '5');
  await saveClick(rt);
  assert.equal(rt.writes.length, 0);
  assert.equal(rt.node('confirmTitle').textContent, 'נותר פער בסכום');
  assert.match(rt.node('confirmMsg').textContent, /5.65/);
  assert.match(rt.node('confirmMsg').textContent, /נוסף למוצרים/);
  await rt.run('saveReturnVerify({ skipChecked: true, skipGap: true })');
  assert.equal(rt.writes[0].data.creditStatus, 'open');
  const rt2 = open();
  rt2.run('returnVerify.items.forEach(l => l.checked = true)');
  await rt2.run('saveReturnVerify({ skipGap: true })');
  assert.equal(rt2.writes[0].data.creditStatus, 'open', 'money-only gaps stay open too');
  assert.equal(rt2.run('returnsDiscrepancyInfo(returns[0]).open'), true);
});

test('correcting a not-credited mark to full credit allows a matching document to close', async () => {
  const rt = open();
  await markOthers(rt);
  await rt.click('rv-not-credited', '5');
  await rt.click('rv-plus', '5');
  rt.run('returnVerify.noteTotal = 217.96; refreshRvHeader()');
  await saveClick(rt);
  assert.equal(rt.writes[0].data.creditStatus, 'ok');
  assert.equal(Object.hasOwn(rt.writes[0].data.items[5], 'noteQty'), false);
  assert.equal(rt.run('returnsDiscrepancyInfo(returns[0]).open'), false);
});

test('allocated credit and original row metadata survive marking an item not credited', async () => {
  const doc = sampleReturn();
  doc.creditNoteTotal += 20;
  doc.creditAllocations = [{ id: 'allocation', amount: 20, receiptId: 'test-receipt' }];
  doc.items[0].carried = true;
  doc.items[0].carriedFrom = 'older-return';
  doc.items[1].isDeposit = true;
  const rt = open(doc);
  await markOthers(rt);
  await rt.click('rv-not-credited', '5');
  await saveClick(rt);
  assert.equal(rt.writes[0].data.creditNoteTotal, 225.69);
  assert.equal(rt.writes[0].data.totalExVat, 217.96);
  assert.equal(rt.writes[0].data.items[0].carried, true);
  assert.equal(rt.writes[0].data.items[0].carriedFrom, 'older-return');
  assert.equal(rt.writes[0].data.items[1].isDeposit, true);
  assert.equal(rt.run('returnsDiscrepancyInfo(returns[0]).owed'), 12.27);
});

test('failed persistence preserves the draft and does not alter the stored return', async () => {
  const rt = open();
  await markOthers(rt);
  await rt.click('rv-not-credited', '5');
  rt.run('runCloudTask = async () => false');
  await saveClick(rt);
  assert.equal(state(rt).items[5].noteQty, 0);
  assert.equal(rt.run('returns[0].items[5].noteQty'), undefined);
  assert.equal(rt.run('returns[0].credited'), false);
  assert.equal(rt.run('currentView'), 'returnReconcile');
});
