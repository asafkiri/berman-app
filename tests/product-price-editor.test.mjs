// v124 — שלב 6: product.price הוא מחיר החשבונית. כרטיס המוצר מציג "מחיר מחירון"
// (המודפס בתעודה — עדות לזהות בסריקה), "מחיר בחשבונית" ו"בתוקף מ":
//   • מוצר קיים: שינוי מחיר נרשם ב-priceHistory מתאריך התחילה; product.price,
//     discountPct ו-discountSet אינם נכתבים — חודש שכבר עבר לא מתומחר מחדש.
//   • אותו מחיר כמו שבתוקף — אין כתיבה למחיר.
//   • מוצר חדש: product.price = מחיר החשבונית, ובלעדיו המחירון המלא.
//   • ההנחה מהמחירון נגזרת (תצוגה); שורת המחירון בלי שדה "אחוז".
//   • המלצת המחיר ועלות השלטים לפי מחיר החשבונית שבתוקף היום.
// הרצה: node --test tests/product-price-editor.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './receipt-scan-harness.mjs';

const json = (r, expr) => JSON.parse(r.run('JSON.stringify(' + expr + ')'));
const productWrites = r => r.writes.filter(x => /products/.test(String(x.path)));
const val = (r, id, v) => { r.node(id).value = v; };

function setup() {
  const r = runtime();
  r.run(`products.push({ id: 'code_9604', code: '9604', name: 'פרנה לבדיקה', barcode: '9604000', listPrice: 12.9, discountPct: 30, discountSet: true, price: 9.03, category: 'c1' });
    pricingCats = [{ id: 'c1', name: 'לחם', pct: 30 }]; pricingCatsLoaded = true;`);
  for (const id of ['prod_barcode', 'prod_code', 'prod_name', 'prod_price', 'prod_invoicePrice']) r.node(id).setCustomValidity = () => {};
  return r;
}
const open = (r, id) => r.run(`openProdModal(products.find(p => p.id === '${id}'), false, '')`);

test('מוצר קיים: מחיר חדש מ-1.9 נרשם בהיסטוריה; product.price ואחוז ההנחה לא נכתבים', async () => {
  const r = setup();
  open(r, 'code_9604');
  assert.equal(r.node('prod_price').value, 12.9, 'המחירון');
  assert.equal(r.node('prod_invoicePrice').value, '9.03', 'מחיר החשבונית שבתוקף היום');
  assert.equal(r.node('prod_priceFrom').value, r.run('todayStr()'));
  val(r, 'prod_invoicePrice', '9.5'); val(r, 'prod_priceFrom', '2026-09-01');
  r.run('updateProdFinalHint()');
  assert.match(r.node('prod_finalHint').textContent, /הנחה מהמחירון: 26\.36%/);
  assert.match(r.node('prod_finalHint').textContent, /₪9\.03 ← ₪9\.5/);
  await r.run('saveProd(false)');
  const w = productWrites(r).pop();
  assert.ok(w, 'נכתב עדכון למוצר');
  for (const k of ['price', 'discountPct', 'discountSet']) assert.ok(!(k in w.data), k + ' אינו נכתב');
  assert.deepEqual(w.data.priceHistory.map(h => [h.from, h.price, h.source && h.source.method]), [['2026-09-01', 9.5, 'editor']]);
  assert.equal(w.data.listPrice, 12.9);
  assert.equal(r.run("products.find(p => p.id === 'code_9604').price"), 9.03, 'הבסיס נשאר');
  assert.equal(r.run("priceAt(products.find(p => p.id === 'code_9604'), '2026-08-31')"), 9.03, 'אוגוסט לא מתומחר מחדש');
  assert.equal(r.run("priceAt(products.find(p => p.id === 'code_9604'), '2026-09-01')"), 9.5);
});

test('אותו מחיר שבתוקף — אין כתיבת מחיר; שדה מחירון ריק אינו מוחק את המחירון', async () => {
  const r = setup();
  open(r, 'code_9604');
  val(r, 'prod_price', '');
  await r.run('saveProd(false)');
  const w = productWrites(r).pop();
  for (const k of ['price', 'priceHistory', 'listPrice', 'discountPct', 'discountSet']) assert.ok(!(k in w.data), k);
  assert.equal(r.run("products.find(p => p.id === 'code_9604').listPrice"), 12.9);
});

test('מוצר חדש: מחיר החשבונית הוא product.price; בלעדיו — המחירון המלא', async () => {
  for (const [inv, expected] of [['7.25', 7.25], ['', 10]]) {
    const r = setup();
    r.run(`openProdModal(null, false, '')`);
    val(r, 'prod_code', '9876'); val(r, 'prod_name', 'מוצר חדש'); val(r, 'prod_price', '10'); val(r, 'prod_invoicePrice', inv);
    val(r, 'prod_category', 'c1');
    await r.run('saveProd(false)');
    const w = productWrites(r).pop();
    assert.ok(w, 'נוצר מוצר');
    assert.equal(w.data.price, expected);
    assert.equal(w.data.listPrice, 10);
    assert.ok(!('discountPct' in w.data) && !('discountSet' in w.data) && !('priceHistory' in w.data));
  }
});

test('שורת המחירון: מחירון, מחיר בחשבונית והנחה נגזרת — בלי שדה "אחוז"; מחיר עתידי מוצג', () => {
  const r = setup();
  r.run(`products.find(p => p.id === 'code_9604').priceHistory = [{ from: '2099-01-01', price: 9.9, source: null }];`);
  const html = r.run(`priceRowHtml(products.find(p => p.id === 'code_9604'))`);
  assert.match(html, /מחירון ₪12\.90/);
  assert.match(html, /בחשבונית: ₪9\.03</);
  assert.match(html, />30%</, 'ההנחה נגזרת מ-9.03 מול 12.90');
  assert.match(html, /מ-[^<]*: ₪9\.90</, 'המחיר העתידי');
  assert.doesNotMatch(html, /pct-set|אחוז לא נקבע|סופי:/);
  assert.equal(r.run('typeof saveDiscountPct'), 'undefined');
});

test('המלצת המחיר ועלות השלטים לפי מחיר החשבונית שבתוקף היום', () => {
  const r = setup();
  const before = r.run(`recForProduct(products.find(p => p.id === 'code_9604'))`);
  r.run(`products.find(p => p.id === 'code_9604').priceHistory = [{ from: '2000-01-01', price: 9.5, source: null }];`);
  const after = r.run(`recForProduct(products.find(p => p.id === 'code_9604'))`);
  assert.equal(after, r.run('recommendedPrice(9.5, 30, 0)'));
  assert.ok(after > before);
  assert.equal(r.run(`internalSignShelfPrice(products.find(p => p.id === 'code_9604'))`), after);
});
