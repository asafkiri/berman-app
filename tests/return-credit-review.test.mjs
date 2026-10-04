import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './receipt-scan-harness.mjs';

// v123: אימות זיכוי לפי כמויות בלבד. סכום תעודת הזיכוי נשמר לזיהוי ואינו נבדק.
// Synthetic return (legacy shape, with stored money that must survive untouched).
function sampleReturn() {
  const values = [[6, 4.91], [2, 10.71], [1, 14.28], [2, 8.2], [1, 10.41],
    [1, 12.31], [1, 12.05], [1, 12.05], [5, 9.88], [7, 5.74]];
  return { id: 'test-return', date: '2026-01-01', timestamp: Date.UTC(2026, 0, 1), vatPct: 18,
    credited: false, creditNoteTotal: 205.69, totalExVat: 217.96, totalIncVat: 257.19,
    items: values.map(([qty, unitPrice], i) => ({ name: i === 5 ? 'לחם מקמח כוסמין E-FREE' : 'מוצר בדיקה ' + i,
      barcode: 'test-barcode-' + i, code: 'test-' + i, productId: 'test-product-' + i,
      qty, unitPrice, lineTotal: Math.round(qty * unitPrice * 100) / 100 })) };
}
function open(doc = sampleReturn(), preset) {
  const rt = runtime();
  rt.context.testReturn = structuredClone(doc);
  rt.run(`returns = [testReturn]; receipts = []; receiptHistoryFilter = 'all'; currentView = 'receiptsHistory'; openReturnVerify('test-return'${preset != null ? ', ' + preset : ''});`);
  return rt;
}
const state = rt => JSON.parse(rt.run('JSON.stringify(returnVerify)'));
const summary = rt => JSON.parse(rt.run('JSON.stringify(rvCreditSummary())'));
async function markOthers(rt, n = 10) {
  for (let i = 0; i < n; i++) if (i !== 5) await rt.click('rv-check', String(i));
}
async function saveClick(rt) {
  await rt.click('rv-save');
  await rt.run('Promise.resolve()');
}
const MONEY_LINE = ['unitPrice', 'lineTotal', 'sentUnitPrice', 'listPrice', 'discountPct', 'priceForm', 'promoOnPaper'];

test('an unchecked row remains unreviewed; a review tick does not change credited quantities', async () => {
  const rt = open();
  await markOthers(rt);
  assert.deepEqual(summary(rt), { sent: 27, credited: 27, shortItems: [], overItems: [], extra: [] });
  assert.equal(state(rt).items[5].qty, 1);
  assert.equal(state(rt).items[5].noteQty, 1);
  assert.equal(state(rt).items[5].checked, false);
  assert.match(rt.run('rvRowHtml(returnVerify.items[5], 5)'), /ממתין לבדיקה/);
  assert.doesNotMatch(rt.run('rvRowHtml(returnVerify.items[5], 5)'), /זוכה במלואו/);
  await rt.click('rv-check', '5');
  assert.equal(summary(rt).credited, 27);
  await rt.click('rv-check', '5');
  assert.equal(state(rt).items[5].noteQty, 1);
});

test('the verify screen speaks units only: no price field, no line total, no price-form chips', () => {
  const rt = open();
  const row = rt.run('rvRowHtml(returnVerify.items[0], 0)');
  assert.doesNotMatch(row, /₪|rv-price|rv-form-|rvLineTot_|rvForms_/);
  assert.match(row, /הוחזר: <span[^>]*>6</);
  assert.match(row, /data-role="rv-note"[^>]*text-base/, '16px input — no zoom on iPhone');
  const html = rt.node('app').innerHTML;
  assert.match(html, /יחידות שהחזרת/);
  assert.match(html, /27 יח׳/);
  assert.match(html, /סכום תעודת הזיכוי ₪205\.69 — לזיהוי בלבד/);
  assert.doesNotMatch(html, /פער בסכום|הפרש קטן בסכום|שווי החזרות/);
});

test('explicit not-credited action preserves the return and explains the missing product', async () => {
  const rt = open();
  await markOthers(rt);
  await rt.click('rv-not-credited', '5');
  const row = state(rt).items[5];
  assert.equal(row.qty, 1);
  assert.equal(row.noteQty, 0);
  assert.equal(row.checked, true);
  assert.equal(rt.run('returns[0].items[5].noteQty'), undefined, 'no mutation before saving');
  assert.deepEqual(summary(rt), { sent: 27, credited: 26, shortItems: [{ name: row.name, qty: 1 }], overItems: [], extra: [] });
  const html = rt.node('rvSummary').innerHTML;
  assert.match(html, /חסר זיכוי על:/);
  assert.match(html, /כוסמין E-FREE · 1 יח׳/);
  assert.match(html, /נבדקו 10 מתוך 10/);
  assert.equal(rt.node('rvSave').textContent, 'שמור חוסר בזיכוי');
  assert.match(rt.run('rvRowHtml(returnVerify.items[5], 5)'), /bg-rose-50/);
});

test('save keeps the known credit shortage open in the unified history, on its card and when reopened', async () => {
  const rt = open();
  await markOthers(rt);
  await rt.click('rv-not-credited', '5');
  await saveClick(rt);
  assert.equal(rt.node('confirmTitle').textContent, '', 'no unnecessary confirmation');
  assert.equal(rt.writes.length, 1);
  const saved = rt.writes[0].data;
  assert.equal(saved.creditStatus, 'open');
  assert.equal(saved.creditNoteTotal, 205.69, 'the typed paper total is kept as identification');
  assert.equal(Object.hasOwn(saved, 'totalExVat'), false, 'no total is recomputed or rewritten');
  assert.equal(Object.hasOwn(saved, 'vatPct'), false);
  assert.equal(saved.items.length, 10);
  assert.equal(saved.items[5].qty, 1);
  assert.equal(saved.items[5].noteQty, 0);
  assert.equal(saved.items[5].productId, 'test-product-5');
  assert.equal(saved.items[5].code, 'test-5');
  assert.equal(Object.hasOwn(saved.items[5], 'checked'), false);
  assert.equal(rt.run('returnVerify'), null);
  assert.equal(rt.run('returnsDiscrepancyInfo(returns[0]).open'), true);
  assert.equal(rt.run('returnsDiscrepancyInfo(returns[0]).shortItems[0].n'), 1);
  assert.equal(rt.run('returnsDiscrepancyInfo(returns[0]).shortUnits'), 1);
  assert.equal(rt.run('returnsDiscrepancyInfo(returns[0]).owed'), undefined);
  assert.match(rt.node('app').innerHTML, /פתוח — חסר זיכוי/);
  assert.match(rt.node('app').innerHTML, /חסר זיכוי: לחם מקמח כוסמין E-FREE/);
  assert.match(rt.node('app').innerHTML, /תעודת חזרה אחת עם פער פתוח בזיכוי/);
  assert.match(rt.node('app').innerHTML, /חסר זיכוי על 1 יח׳ בתעודה אחת/);
  const card = rt.run('returnCardInReceipts(returns[0])');
  assert.match(card, /פתוח — חסר זיכוי/);
  assert.match(card, /פירוט הפער/);
  assert.match(card, /27 יח׳ · 10 שורות/);
  assert.match(card, /תעודת זיכוי ₪205\.69 \(לזיהוי\)/);
  assert.match(card, /זוכה 0/);
  assert.doesNotMatch(card, /הספק חייב לך|זיכוי ללא מע"מ|₪12\.31/);
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
  // ported from credit-price-forms: the minus button reaches 0 the same way
  await rt.click('rv-minus', '5');
  assert.equal(state(rt).items[5].noteQty, 0);
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
  assert.deepEqual(summary(rt).shortItems, [{ name: doc.items[0].name, qty: 2 }]);
  assert.match(rt.node('rvSummary').innerHTML, /חסר זיכוי על:/);
  assert.match(rt.node('rvStatus_0').innerHTML, /חסר זיכוי על 2 יח׳/);
  await saveClick(rt);
  assert.equal(rt.writes[0].data.items[0].noteQty, 2);
  assert.equal(rt.writes[0].data.items[0].qty, 4);
  assert.equal(rt.writes[0].data.creditStatus, 'open');
  rt.run(`openReturnVerify('test-return');`);
  field.value = '5'; rt.events.get('app:input')({ target: field });
  assert.equal(summary(rt).shortItems.length, 0);
  assert.equal(summary(rt).overItems[0].qty, 1);
  assert.match(rt.node('rvSummary').innerHTML, /זוכו יחידות נוספות:/);
  assert.equal(rt.node('rvSave').textContent, 'שמור עם פער פתוח');
});

test('all units credited closes the document whatever the typed paper total is', async () => {
  // v123: הסכום אינו נבדק — 200 מול שורות של 217.96 אינו "פער"
  const doc = sampleReturn(); doc.creditNoteTotal = null;
  const rt = open(doc, 200);
  assert.equal(state(rt).noteTotal, 200);
  rt.run('returnVerify.items.forEach(l => l.checked = true)');
  await saveClick(rt);
  assert.equal(rt.node('confirmTitle').textContent, '', 'no money-gap confirmation any more');
  assert.equal(rt.writes[0].data.creditStatus, 'ok');
  assert.equal(rt.writes[0].data.creditNoteTotal, 200, 'stored as typed');
  assert.equal(rt.run('returnsDiscrepancyInfo(returns[0]).open'), false);
  assert.equal(rt.run('returns[0].credited'), true);
});

test('correcting a not-credited mark to full credit closes the document', async () => {
  const rt = open();
  await markOthers(rt);
  await rt.click('rv-not-credited', '5');
  await rt.click('rv-plus', '5');
  await saveClick(rt);
  assert.equal(rt.writes[0].data.creditStatus, 'ok');
  assert.equal(Object.hasOwn(rt.writes[0].data.items[5], 'noteQty'), false);
  assert.equal(rt.run('returnsDiscrepancyInfo(returns[0]).open'), false);
});

test('a legacy document keeps its stored money byte-identical; a new document gains none', async () => {
  const legacy = sampleReturn();
  legacy.items[0].sentUnitPrice = 4.9123;
  legacy.items[0].priceForm = 'manual';
  const rt = open(legacy);
  rt.run('returnVerify.items.forEach(l => l.checked = true)');
  await rt.click('rv-not-credited', '5');
  await saveClick(rt);
  const saved = rt.writes[0].data;
  saved.items.forEach((l, i) => MONEY_LINE.forEach(k => assert.deepEqual(l[k], legacy.items[i][k], i + ':' + k)));
  assert.equal(Object.hasOwn(saved.items[1], 'sentUnitPrice'), false, 'no sentUnitPrice is injected');
  assert.equal(Object.hasOwn(saved.items[1], 'priceForm'), false);
  // תעודה חדשה (schemaVersion 2) — בלי שום שדה כסף
  const fresh = { id: 'test-return', schemaVersion: 2, date: '2026-10-04', docDate: '2026-10-04', timestamp: Date.UTC(2026, 9, 4), vatPct: 18, credited: false,
    items: [{ name: 'אחיד פרוס ברמן', barcode: '497112', code: '101', productId: 'code_101', qty: 3 }] };
  const rt2 = open(fresh, 17.22);
  rt2.run('returnVerify.items.forEach(l => l.checked = true)');
  await saveClick(rt2);
  const s2 = rt2.writes[0].data;
  assert.deepEqual(Object.keys(s2.items[0]).sort(), ['barcode', 'code', 'name', 'productId', 'qty']);
  assert.equal(Object.hasOwn(s2, 'totalExVat'), false);
  assert.equal(s2.creditNoteTotal, 17.22);
});

test('allocations and row metadata survive verify-save; deposit lines are read-only and never open the document', async () => {
  const doc = sampleReturn();
  doc.creditNoteTotal += 20;
  doc.creditAllocations = [{ id: 'allocation', amount: 20, receiptId: 'test-receipt' }];
  doc.items[0].carried = true;
  doc.items[0].carriedFrom = 'older-return';
  doc.items[0].productId = 'carry_17';
  doc.items[1].isDeposit = true;
  doc.items[2].productId = 'manual_9';
  doc.items[2].manual = true;
  const rt = open(doc);
  assert.match(rt.run('rvRowHtml(returnVerify.items[1], 1)'), /פיקדון · 2 יח׳ — אינו נבדק בזיכוי/);
  assert.doesNotMatch(rt.run('rvRowHtml(returnVerify.items[1], 1)'), /rv-note|rv-check/);
  assert.match(rt.run('rvProgressHtml()'), /מתוך 9 מוצרים/, 'the deposit row is not counted as unreviewed');
  // פיקדון שזוכה אחרת אינו פותח את התעודה
  rt.run('returnVerify.items[1].noteQty = 0');
  await markOthers(rt);
  await rt.click('rv-not-credited', '5');
  await saveClick(rt);
  const saved = rt.writes[0].data;
  assert.equal(saved.creditNoteTotal, 225.69);
  assert.equal(saved.items[0].carried, true);
  assert.equal(saved.items[0].carriedFrom, 'older-return');
  assert.equal(saved.items[0].productId, 'carry_17');
  assert.equal(saved.items[1].isDeposit, true);
  assert.equal(Object.hasOwn(saved.items[1], 'noteQty'), false, 'deposit rows carry no credited quantity');
  assert.equal(saved.items[2].productId, 'manual_9');
  assert.equal(saved.items[2].manual, true);
  assert.equal(rt.run('creditAllocationList(returns[0]).length'), 1);
  assert.deepEqual(JSON.parse(rt.run('JSON.stringify(returnsDiscrepancyInfo(returns[0]).shortItems.map(x => [x.productId, x.n]))')), [['test-product-5', 1]]);
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

test('a product credited but not returned is entered on the verify screen and offered to an open receipt shortage', async () => {
  // 5.9: תעודת הזיכוי של החזרות כללה 2 פיתות כוסמין שלא הוחזרו — החוסר מהקליטה של 6.9
  const rt = open();
  rt.run(`products.push({ id: 'code_401', code: '401', name: 'פיתות כוסמין 10 בשקית', barcode: '4685478', price: 10.96 });
    receipts = [{ id: 'rc-short', date: '2026-01-02', docDate: '2026-01-02', timestamp: Date.UTC(2026, 0, 2), status: 'open',
      items: [{ productId: 'code_401', name: 'פיתות כוסמין 10 בשקית', barcode: '4685478', qty: 0, noteQty: 2 }] }];`);
  const search = { id: 'rvExtraSearch', dataset: {}, value: 'כוסמין 10', getAttribute: () => null };
  rt.events.get('app:input')({ target: search });
  assert.match(rt.node('rvExtraList').innerHTML, /data-role="rv-extra-add" data-id="code_401"/);
  await rt.click('rv-extra-add', 'code_401');
  await rt.click('rv-extra-plus', '0');
  assert.deepEqual(state(rt).extra.map(x => [x.productId, x.qty]), [['code_401', 2]]);
  assert.match(rt.node('rvSummary').innerHTML, /זוכה גם על מוצרים שלא הוחזרו:/);
  rt.run('returnVerify.items.forEach(l => l.checked = true)');
  await saveClick(rt);
  const saved = rt.writes[0].data;
  assert.equal(saved.items.length, 10, 'the credited-only product is never saved as a returned line');
  assert.equal(rt.run('creditSplit && creditSplit.candidates.length'), 1);
  assert.deepEqual(JSON.parse(rt.run('JSON.stringify(creditSplit.candidates[0].items)')), [{ productId: 'code_401', name: 'פיתות כוסמין 10 בשקית', qty: 2 }]);
  assert.match(rt.node('creditSplitExtra').textContent, /פיתות כוסמין 10 בשקית × 2/);
});
