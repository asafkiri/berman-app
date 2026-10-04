// v123 — עריכת פריטים ומיזוג תעודות חזרות, ביחידות.
// • העריכה שומרת כל שדה שכבר יש בשורה (קוד, העברה מפער, ידני, פיקדון, וכסף ישן
//   של שורה שלא נגעה), ואינה כותבת סכום תעודה.
// • בתעודה שכבר אומתה עריכה אינה משנה מה הספק זיכה: העלאת כמות פותחת חוסר
//   בזיכוי במקום להיחשב "זוכה" בשקט במרכזת.
// • מיזוג מאחד לפי מוצר (ואחריו ברקוד או שם), בלי תלות במחיר, וחוסם תעודה
//   שיש עליה קישור זיכוי.
// הרצה: node --test tests/returns-edit-merge.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './receipt-scan-harness.mjs';

const LEGACY_LINE = { name: 'אחיד פרוס ברמן', barcode: '497112', code: '101', productId: 'code_101', qty: 3, unitPrice: 5.7408, lineTotal: 17.22, sentUnitPrice: 5.7408 };
function doc(extra) {
  return { id: 'r1', date: '2026-10-01', docDate: '2026-10-01', timestamp: Date.UTC(2026, 9, 1), vatPct: 18, sentTo: 'הנהג', returnKind: 'weekly',
    credited: false, totalExVat: 50, totalIncVat: 59,
    items: [{ ...LEGACY_LINE },
      { name: 'ברמן אסלי 5 פיתות', barcode: '497440', code: '238', productId: 'carry_5', qty: 2, manual: true, carried: true, carriedFrom: 'older' },
      { name: 'לחמניה משקית', barcode: '', productId: 'manual_7', qty: 1, manual: true },
      { name: 'פיקדון · אחיד', barcode: '', qty: 3, isDeposit: true }],
    ...(extra || {}) };
}
function open(d) {
  const rt = runtime();
  rt.context.testDoc = structuredClone(d);
  rt.run(`returns = [testDoc]; receipts = []; currentView = 'receiptsHistory'; openReturnItemsEdit('r1');`);
  return rt;
}
const saved = rt => rt.writes[rt.writes.length - 1].data;
const MONEY_LINE = ['unitPrice', 'lineTotal', 'sentUnitPrice', 'listPrice', 'discountPct', 'priceForm', 'promoOnPaper'];

test('an untouched edit round-trips every line field; no totals or VAT are written', async () => {
  const d = doc();
  const rt = open(d);
  await rt.run('saveReturnItemsEdit()');
  const s = saved(rt);
  assert.deepEqual(Object.keys(s), ['items'], 'only the items are written for an unverified document');
  assert.deepEqual(s.items, d.items, 'code, carried, carriedFrom, manual, isDeposit and the legacy price all survive');
});

test('a quantity edit keeps the line identity and drops its stale legacy price', async () => {
  const rt = open(doc());
  rt.run(`retEditSetQtyLive(0, '5')`);
  assert.match(rt.node('reUnits').textContent, /8 יח׳ · 3 שורות/);
  await rt.run('saveReturnItemsEdit()');
  const line = saved(rt).items[0];
  assert.equal(line.qty, 5);
  assert.equal(line.code, '101');
  assert.equal(line.productId, 'code_101');
  MONEY_LINE.forEach(k => assert.equal(Object.hasOwn(line, k), false, k));
  assert.equal(saved(rt).items[1].carriedFrom, 'older', 'other rows untouched');
});

test('the edit screen speaks units; there is no price input and no re-price handler', () => {
  const rt = open(doc());
  const page = rt.node('app').innerHTML;
  assert.match(page, /לפני העריכה<\/span><span>6 יח׳ · 3 שורות/);
  assert.match(page, /שורה ידנית \(שם וכמות\)/);
  assert.doesNotMatch(page, /re-price|₪|סכום מעודכן|מול תעודת הזיכוי/);
  assert.equal(rt.run(`typeof retEditSetPriceLive`), 'undefined');
  // שם עם תגית מוצג מוברח גם כשהשורה מזוהה בקטלוג
  rt.run(`returnEdit.items[0].name = 'א <b>ב</b>'`);
  assert.match(rt.run('retEditRowHtml(returnEdit.items[0], 0)'), /א &lt;b&gt;ב&lt;\/b&gt;/);
});

test('on a verified document the credited count stays: raising a quantity opens a credit shortage', async () => {
  const rt = open(doc({ credited: true, creditStatus: 'ok', creditNoteTotal: 40 }));
  rt.run(`retEditSetQtyLive(0, '5')`);
  await rt.run('saveReturnItemsEdit()');
  const s = saved(rt);
  assert.equal(s.items[0].qty, 5);
  assert.equal(s.items[0].noteQty, 3, 'the supplier credited 3 — still 3');
  assert.equal(s.creditStatus, 'open');
  assert.equal(rt.run('returnsDiscrepancyInfo(returns[0]).open'), true);
  assert.equal(rt.run('returnsDiscrepancyInfo(returns[0]).shortUnits'), 2);
  assert.match(rt.toasts.at(-1), /נותר פער בזיכוי/);
});

test('on a verified document an added line counts as not credited, and a product swap carries the credited count', async () => {
  const rt = open(doc({ credited: true, creditStatus: 'ok' }));
  rt.run(`retEditAddItem('code_401')`);
  rt.run(`returnEdit.replaceIdx = 0; retEditReplacePick('code_349')`);
  await rt.run('saveReturnItemsEdit()');
  const s = saved(rt);
  const added = s.items[s.items.length - 1];
  assert.equal(added.productId, 'code_401');
  assert.equal(added.code, '401');
  assert.equal(added.qty, 1);
  assert.equal(added.noteQty, 0, 'a line the supplier never saw is not credited');
  const swapped = s.items[0];
  assert.equal(swapped.productId, 'code_349');
  assert.equal(swapped.code, '349');
  assert.equal(swapped.qty, 3);
  assert.equal(Object.hasOwn(swapped, 'noteQty'), false, 'same count, fully credited as before');
  MONEY_LINE.forEach(k => assert.equal(Object.hasOwn(swapped, k), false, 'a swapped product drops the old price: ' + k));
  assert.equal(s.creditStatus, 'open');
});

test('on a verified document an unchanged short line keeps its noteQty; lowering the quantity to the credited count closes it', async () => {
  const d = doc({ credited: true, creditStatus: 'open' });
  d.items[0].noteQty = 1;
  const rt = open(d);
  await rt.run('saveReturnItemsEdit()');
  assert.equal(saved(rt).items[0].noteQty, 1);
  assert.equal(saved(rt).creditStatus, 'open');
  const rt2 = open(d);
  rt2.run(`retEditSetQtyLive(0, '1')`);
  await rt2.run('saveReturnItemsEdit()');
  assert.equal(Object.hasOwn(saved(rt2).items[0], 'noteQty'), false);
  assert.equal(saved(rt2).creditStatus, 'ok');
});

test('an unverified document never carries a credited count after an edit', async () => {
  const d = doc();
  d.items[0].noteQty = 1; // שאריות מאימות שבוטל
  const rt = open(d);
  rt.run(`retEditSetQtyLive(0, '4')`);
  await rt.run('saveReturnItemsEdit()');
  assert.equal(Object.hasOwn(saved(rt).items[0], 'noteQty'), false);
  assert.equal(Object.hasOwn(saved(rt), 'creditStatus'), false);
});

test('the pack split works without a price; on a fully credited line the packs stay credited', async () => {
  const rt = open(doc({ credited: true, creditStatus: 'ok' }));
  rt.run(`products.push({ id: 'pack6', code: '1016', name: 'מארז 6 אחיד', barcode: '1016', price: 30 });
    const p = products.find(x => x.id === 'code_101'); p.billingPackId = 'pack6'; p.billingPackSize = 6;
    returnEdit.items[0].qty = 13;`);
  assert.match(rt.run('retEditRowHtml(returnEdit.items[0], 0)'), /פצל ל-2 מארזים \+ 1 בודדים/);
  assert.doesNotMatch(rt.run('retEditRowHtml(returnEdit.items[0], 0)'), /₪/);
  rt.run('retEditConvertPack(0)');
  await rt.run('saveReturnItemsEdit()');
  const s = saved(rt);
  assert.deepEqual(s.items.slice(0, 2).map(l => [l.productId, l.qty, l.noteQty]), [['pack6', 2, undefined], ['code_101', 1, undefined]]);
  assert.ok(s.items.slice(0, 2).every(l => MONEY_LINE.every(k => !Object.hasOwn(l, k))));
});

test('merge unites the same product whatever its legacy price; no totals; mergedFrom counts units', () => {
  const rt = runtime();
  rt.context.target = { id: 't', docDate: '2026-10-01', items: [{ ...LEGACY_LINE }, { name: 'פיקדון · אחיד', barcode: '', qty: 3, isDeposit: true }], totalExVat: 17.22 };
  rt.context.source = { id: 's', docDate: '2026-10-02', returnKind: 'daily', sentTo: 'הנהג', schemaVersion: 2,
    items: [{ name: 'אחיד פרוס ברמן', barcode: '497112', code: '101', productId: 'code_101', qty: 2 },
      { name: 'פיקדון · אחיד', barcode: '', qty: 2, isDeposit: true },
      { name: 'ברמן אסלי 5 פיתות', barcode: '497440', productId: 'carry_9', qty: 1, carried: true, carriedFrom: 'x' }] };
  const out = JSON.parse(rt.run('JSON.stringify(mergedReturnUpdateData(target, source))'));
  assert.deepEqual(Object.keys(out).sort(), ['items', 'mergedFrom']);
  assert.equal(out.items.length, 3);
  assert.deepEqual([out.items[0].productId, out.items[0].qty, out.items[0].code], ['code_101', 5, '101']);
  MONEY_LINE.forEach(k => assert.equal(Object.hasOwn(out.items[0], k), false, k));
  assert.deepEqual([out.items[1].isDeposit, out.items[1].qty], [true, 5], 'deposit merges with deposit');
  assert.equal(out.items[2].carried, true, 'a carried row stays its own row');
  assert.deepEqual([out.mergedFrom[0].units, out.mergedFrom[0].itemsCount, out.mergedFrom[0].returnKind], [3, 3, 'daily']);
  assert.equal(Object.hasOwn(out.mergedFrom[0], 'totalExVat'), false);
  rt.context.target.mergedFrom = out.mergedFrom;
  const note = rt.run('retMergedNoteHtml(target)');
  assert.match(note, /3 יח׳ · 3 שורות/);
  assert.doesNotMatch(note, /₪/);
  // רישום ישן עם סכום — מוצג בשורות, בלי ₪
  rt.context.legacy = { mergedFrom: [{ docDate: '2026-08-19', returnKind: 'weekly', itemsCount: 1, totalExVat: 12.05 }] };
  assert.doesNotMatch(rt.run('retMergedNoteHtml(legacy)'), /₪/);
});

test('a source document with a credit link cannot be merged away', async () => {
  const rt = runtime();
  rt.context.a = { id: 'a', docDate: '2026-10-01', credited: false, items: [{ name: 'x', productId: 'code_101', qty: 1 }] };
  rt.context.b = { id: 'b', docDate: '2026-10-02', credited: false, items: [{ name: 'y', productId: 'code_349', qty: 2 }],
    creditAllocations: [{ id: 'cs1', receiptId: 'rc', items: [{ productId: 'code_401', name: 'פיתות', qty: 2 }] }] };
  rt.run(`returns = [a, b]; retMergeTargetId = 'a'; confirmReturnMergePick('b');`);
  assert.equal(rt.node('confirmTitle').textContent, '', 'no merge confirmation is offered');
  assert.match(rt.toasts.at(-1), /קישור זיכוי/);
  rt.run(`globalThis.txRan = false; runTransaction = async () => { txRan = true; };`);
  await rt.run(`mergeReturnDocs('a', 'b')`);
  assert.equal(rt.run('txRan'), false);
  // הבוחר מציג יחידות
  rt.run(`returns = [a, { ...b, creditAllocations: [] }]; openReturnMergePicker('a')`);
  assert.match(rt.node('retMergeList').innerHTML, /2 יח׳/);
  assert.doesNotMatch(rt.node('retMergeList').innerHTML, /₪/);
});
