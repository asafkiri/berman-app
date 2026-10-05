// v124 — שלב 6: product.price הוא מחיר החשבונית. כרטיס המוצר מציג "מחיר מחירון"
// (המודפס בתעודה — עדות לזהות בסריקה), "מחיר בחשבונית" ו"בתוקף מ":
//   • מוצר קיים: שינוי מחיר יוצא כרשומה מתוארכת (priceEntry) שנכתבת בטרנזקציה וממוזגת
//     לתוך המוצר בענן; product.price אינו נכתב — חודש שכבר עבר לא מתומחר מחדש.
//   • ניסיון חוזר אחרי ניתוק אינו דורס רשומה שנכתבה בינתיים ממכשיר אחר, ושמירה חדשה
//     של המוצר אינה מוחקת מהתור את המחיר המתוארך שעוד לא נשמר.
//   • אותו מחיר כמו שבתוקף — אין כתיבה למחיר; שדה ריק — המחיר הקיים נשאר.
//   • מוצר חדש: product.price = מחיר החשבונית, ובלעדיו המחירון המלא ("לא אומת"); discountPct/discountSet
//     נכתבים כתאימות ל-v123 (שמחשב price = מחירון × (1 − אחוז)) ומחזירים את הבסיס בקירוב
//     (לכל היותר אלפית); מחיר מעל המחירון — בלי שדות תאימות (אחוז שלילי חוסם שמירה ב-v123).
//   • מוצר בלי מחיר בכלל: מחיר עם תאריך של היום או לפניו הוא הבסיס לכל התאריכים, והרמז אומר זאת.
//   • ההנחה מהמחירון נגזרת (תצוגה); "מחיר חשבונית לא אומת" למחיר שנזרע בלי אחוז.
//   • המלצת המחיר ועלות השלטים לפי מחיר החשבונית שבתוקף היום.
// הרצה: node --test tests/product-price-editor.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './receipt-scan-harness.mjs';

const productWrites = r => r.writes.filter(x => /products/.test(String(x.path)));
const val = (r, id, v) => { r.node(id).value = v; };
const P = "products.find(p => p.id === 'code_9604')";

function setup(opts) {
  const r = runtime(opts);
  r.run(`products.push({ id: 'code_9604', code: '9604', name: 'פרנה לבדיקה', barcode: '9604000', listPrice: 12.9, discountPct: 25, discountSet: true, price: 9.03, category: 'c1' });
    pricingCats = [{ id: 'c1', name: 'לחם', pct: 30 }]; pricingCatsLoaded = true;`);
  for (const id of ['prod_barcode', 'prod_code', 'prod_name', 'prod_price', 'prod_invoicePrice']) r.node(id).setCustomValidity = () => {};
  return r;
}
const open = (r, id) => r.run(`openProdModal(products.find(p => p.id === '${id}'), false, '')`);

test('מוצר קיים: מחיר חדש מ-1.9 יוצא כרשומה מתוארכת; product.price ואחוז ההנחה לא נכתבים', async () => {
  const r = setup();
  open(r, 'code_9604');
  assert.equal(r.node('prod_price').value, 12.9, 'המחירון');
  assert.equal(r.node('prod_invoicePrice').value, '9.03', 'מחיר החשבונית שבתוקף היום');
  assert.equal(r.node('prod_invoicePrice').placeholder, 'ריק = המחיר הקיים נשאר');
  assert.equal(r.node('prod_priceFrom').value, r.run('todayStr()'));
  val(r, 'prod_invoicePrice', '9.5'); val(r, 'prod_priceFrom', '2026-09-01');
  r.run('updateProdFinalHint()');
  assert.match(r.node('prod_finalHint').textContent, /הנחה מהמחירון: 26\.36%/);
  assert.match(r.node('prod_finalHint').textContent, /₪9\.03 ← ₪9\.5/);
  await r.run('saveProd(false)');
  const w = productWrites(r).pop();
  assert.ok(w, 'נכתב עדכון למוצר');
  for (const k of ['price', 'discountPct', 'discountSet', 'priceHistory']) assert.ok(!(k in w.data), k + ' אינו נכתב בשדות');
  assert.deepEqual([w.priceEntry.from, w.priceEntry.price, w.priceEntry.source.method], ['2026-09-01', 9.5, 'editor']);
  assert.equal(r.run(P + '.price'), 9.03, 'הבסיס נשאר');
  assert.equal(r.run(`priceAt(${P}, '2026-08-31')`), 9.03, 'אוגוסט לא מתומחר מחדש');
  assert.equal(r.run(`priceAt(${P}, '2026-09-01')`), 9.5);
});

test('ניסיון חוזר אחרי ניתוק ממזג לתוך המוצר בענן — אימוץ שנכתב בינתיים ממכשיר אחר נשמר', async () => {
  const r = setup({ realCloudTasks: true });
  const db = new Map([['products/code_9604', JSON.parse(r.run(`JSON.stringify(${P})`))]]);
  let offline = true;
  r.context.doc = (_, ...path) => path.slice(-2).join('/');
  r.context.updateDoc = async (ref, data) => { if (offline) throw new Error('offline'); db.set(ref, { ...db.get(ref), ...structuredClone(data) }); };
  r.context.runTransaction = async (_, fn) => {
    if (offline) throw new Error('offline');
    const pending = [];
    const out = await fn({ get: async ref => ({ exists: () => db.has(ref), data: () => structuredClone(db.get(ref)) }), update: (ref, data) => pending.push([ref, structuredClone(data)]) });
    pending.forEach(([ref, data]) => db.set(ref, { ...db.get(ref), ...data }));
    return out;
  };
  r.run('logCloudActionIfNeeded = () => {};');
  // המכשיר בלי רשת: מחיר אוקטובר מכרטיס המוצר נכשל ונכנס לתור
  open(r, 'code_9604');
  val(r, 'prod_invoicePrice', '9.7'); val(r, 'prod_priceFrom', '2026-10-01');
  await r.run('saveProd(false)');
  assert.equal(r.run('cloudFailedWrites.length'), 1, 'בתור');
  // בינתיים מכשיר אחר אימץ את מחיר ספטמבר במרכזת
  db.get('products/code_9604').priceHistory = [{ from: '2026-09-01', price: 9.6, source: { method: 'invoice' } }];
  // שמירה חדשה של המוצר (שם) מחליפה את שדות המוצר שבתור — לא את המחיר המתוארך
  offline = false;
  r.run(`priceEditId = null;`); open(r, 'code_9604');
  val(r, 'prod_name', 'פרנה — שם חדש'); val(r, 'prod_invoicePrice', '');
  await r.run('saveProd(false)');
  assert.deepEqual(JSON.parse(r.run('JSON.stringify(cloudFailedWrites.map(x => [x.actionName, x.task.op]))')), [['save product invoice price', 'price-entry']]);
  await r.run('retryCloudFailedWrites()');
  assert.equal(r.run('cloudFailedWrites.length'), 0);
  const server = db.get('products/code_9604');
  assert.deepEqual(server.priceHistory.map(h => [h.from, h.price]), [['2026-09-01', 9.6], ['2026-10-01', 9.7]], 'שתי הרשומות');
  assert.equal(server.name, 'פרנה — שם חדש');
  assert.equal(server.price, 9.03);
});

test('אותו מחיר שבתוקף, או שדה מחיר ריק — אין כתיבת מחיר; שדה מחירון ריק אינו מוחק את המחירון', async () => {
  for (const inv of ['9.03', '']) {
    const r = setup();
    open(r, 'code_9604');
    val(r, 'prod_price', ''); val(r, 'prod_invoicePrice', inv);
    r.run('updateProdFinalHint()');
    if (inv === '') assert.match(r.node('prod_finalHint').textContent, /המחיר הקיים נשאר: ₪9\.03/);
    await r.run('saveProd(false)');
    const w = productWrites(r).pop();
    for (const k of ['price', 'priceHistory', 'listPrice', 'discountPct', 'discountSet']) assert.ok(!(k in w.data), k);
    assert.ok(!w.priceEntry);
    assert.equal(r.run(P + '.listPrice'), 12.9);
  }
});

test('מוצר חדש: מחיר החשבונית הוא product.price, ושדות התאימות ל-v123 מחזירים אותו', async () => {
  for (const [inv, expected, pct, set] of [['7.25', 7.25, 27.5, true], ['', 10, 0, false]]) {
    const r = setup();
    r.run(`openProdModal(null, false, '')`);
    assert.equal(r.node('prod_invoicePrice').placeholder, 'ריק = מחירון מלא');
    val(r, 'prod_code', '9876'); val(r, 'prod_name', 'מוצר חדש'); val(r, 'prod_price', '10'); val(r, 'prod_invoicePrice', inv);
    val(r, 'prod_category', 'c1');
    await r.run('saveProd(false)');
    const w = productWrites(r).pop();
    assert.ok(w, 'נוצר מוצר');
    assert.equal(w.data.price, expected);
    assert.equal(w.data.listPrice, 10);
    assert.deepEqual([w.data.discountPct, w.data.discountSet], [pct, set], 'בלי מחיר בחשבונית — "לא אומת" (גם ב-v123: "אחוז לא נקבע")');
    if (!set) assert.match(r.run(`priceRowHtml(products.find(p => p.id === 'code_9876'))`), /מחיר חשבונית לא אומת/);
    assert.equal(Math.round(r.run(`finalUnitPrice(10, ${pct})`) * 1000) / 1000, expected, 'v123 מחשב בחזרה את אותו בסיס');
    assert.ok(!('priceHistory' in w.data));
  }
});

test('שינוי מחירון במוצר קיים: האחוז נכתב מחדש כך ש-v123 שומר על אותו בסיס', async () => {
  const r = setup();
  open(r, 'code_9604');
  val(r, 'prod_price', '13.5');
  await r.run('saveProd(false)');
  const w = productWrites(r).pop();
  assert.equal(w.data.listPrice, 13.5);
  assert.ok(!('price' in w.data));
  assert.equal(Math.round(r.run(`finalUnitPrice(13.5, ${w.data.discountPct})`) * 1000) / 1000, 9.03);
});

test('מוצר בלי מחיר: מחיר מהיום ולפניו הוא הבסיס לכל התאריכים (והרמז אומר זאת); תאריך עתידי — רשומה מתוארכת', async () => {
  for (const [from, asBase] of [['2026-01-01', true], ['2099-01-01', false]]) {
    const r = setup();
    r.run(`products.push({ id: 'code_9605', code: '9605', name: 'בלי מחיר', barcode: '9605000', listPrice: 10, price: 0, category: 'c1' });`);
    open(r, 'code_9605');
    val(r, 'prod_invoicePrice', '7'); val(r, 'prod_priceFrom', from);
    r.run('updateProdFinalHint()');
    const hint = r.node('prod_finalHint').textContent;
    await r.run('saveProd(false)');
    const w = productWrites(r).pop();
    if (asBase) {
      assert.match(hint, /למוצר לא היה מחיר — ₪7\.00? יחול על כל התאריכים|למוצר לא היה מחיר — ₪7 יחול על כל התאריכים/);
      assert.equal(w.data.price, 7);
      assert.ok(!w.priceEntry);
      assert.equal(w.data.discountPct, 30, 'תאימות ל-v123');
    } else {
      assert.match(hint, /\(יחול בעתיד\)/);
      assert.ok(!('price' in w.data));
      assert.deepEqual([w.priceEntry.from, w.priceEntry.price], ['2099-01-01', 7]);
    }
  }
});

test('שורת המחירון: הנחה נגזרת (לא האחוז השמור), מחיר עתידי, ו"מחיר חשבונית לא אומת"', () => {
  const r = setup();
  r.run(`${P}.priceHistory = [{ from: '2000-01-01', price: 9.5, source: null }, { from: '2099-01-01', price: 9.9, source: null }];`);
  const html = r.run(`priceRowHtml(${P})`);
  assert.match(html, /מחירון ₪12\.90/);
  assert.match(html, /בחשבונית: ₪9\.50?</);
  assert.match(html, />26\.36%</, 'נגזר מ-9.50 מול 12.90 — לא 25% השמורים');
  assert.doesNotMatch(html, />25%</);
  assert.match(html, /מ-[^<]*: ₪9\.90?</, 'המחיר העתידי');
  assert.doesNotMatch(html, /pct-set|אחוז לא נקבע|סופי:/);
  assert.equal(r.run('typeof saveDiscountPct'), 'undefined');
  r.run(`products.push({ id: 'code_111', code: '111', name: 'אחיד פרוס ודש', barcode: '1', listPrice: 6.24, discountPct: 0, discountSet: false, price: 6.24 });`);
  assert.match(r.run(`priceRowHtml(products.find(p => p.id === 'code_111'))`), /מחיר חשבונית לא אומת/);
});

test('אישור מחיר שלא אומת: שמירה עם אותו מחיר כותבת discountSet ומורידה את הסימון', async () => {
  const r = setup();
  r.run(`products.push({ id: 'code_111', code: '111', name: 'אחיד פרוס ודש', barcode: '1', listPrice: 6.24, discountPct: 0, discountSet: false, price: 6.24, category: 'c1' });`);
  open(r, 'code_111');
  r.run('updateProdFinalHint()');
  assert.match(r.node('prod_finalHint').textContent, /מחיר החשבונית לא אומת/);
  await r.run('saveProd(false)');
  const w = productWrites(r).pop();
  assert.deepEqual([w.data.discountSet, w.data.discountPct], [true, 0]);
  assert.ok(!('price' in w.data) && !w.priceEntry);
  assert.doesNotMatch(r.run(`priceRowHtml(products.find(p => p.id === 'code_111'))`), /לא אומת/);
});

test('המלצת המחיר ועלות השלטים לפי מחיר החשבונית שבתוקף היום — גם במוצר בלי קטגוריה', () => {
  const r = setup();
  const before = r.run(`recForProduct(${P})`);
  r.run(`${P}.priceHistory = [{ from: '2000-01-01', price: 9.5, source: null }];`);
  const after = r.run(`recForProduct(${P})`);
  assert.equal(after, r.run('recommendedPrice(9.5, 30, 0)'));
  assert.ok(after > before);
  // בלי קטגוריה: השלט מחושב ישירות מהעלות (signMarginPct), ועלות המבצע/השלט הפנימי
  r.run(`products.push({ id: 'code_9606', code: '9606', name: 'בלי קטגוריה', barcode: '9606000', listPrice: 12, price: 8, priceHistory: [{ from: '2000-01-01', price: 9.5, source: null }] });
    promos.push({ id: 'pr_sign', productIds: ['code_9606'], fixedPrice: 7, start: '2000-01-01', end: '2099-12-31' });`);
  const q = "products.find(p => p.id === 'code_9606')";
  assert.equal(r.run(`internalSignShelfPrice(${q})`), r.run(`recommendedPrice(9.5, Number(signMarginPct) || 0, depositIncFor(${q}))`));
  assert.equal(r.run(`signMaxCost('pr_sign')`), 9.5);
  assert.equal(r.run(`signInternalBasis({ productIds: ['code_9606'] }).cost`), 9.5);
});

test('סריקה: "אותו מחיר — הבחירה לא עולה כסף" לפי מחיר החשבונית ביום התעודה, לא לפי הבסיס', () => {
  const r = setup();
  r.run(`products.push({ id: 'code_7001', code: '7001', name: 'וריאנט', barcode: '70', listPrice: 12.9, price: 9.03 },
      { id: 'code_7002', code: '7002', name: 'וריאנט', barcode: '70', listPrice: 12.9, price: 9.03 });
    receiptDocDate = '2026-10-05';`);
  const pick = () => r.run(`aiSingleNameCandidateId({ catalogHintId: 'code_7001', catalogCandidateHintIds: ['code_7001', 'code_7002'] })`);
  assert.equal(pick(), 'code_7001', 'מחיר זהה — מכריעים');
  r.run(`products.find(p => p.id === 'code_7001').priceHistory = [{ from: '2026-10-01', price: 9.5, source: null }];`);
  assert.equal(pick(), '', 'מחיר החשבונית שונה ביום התעודה — לא מנחשים');
});

test('מחיר מעל המחירון: בלי אחוז תאימות שלילי (שחוסם שמירה ב-v123)', async () => {
  const r = setup();
  r.run(`openProdModal(null, false, '')`);
  val(r, 'prod_code', '9877'); val(r, 'prod_name', 'יקר מהמחירון'); val(r, 'prod_price', '10'); val(r, 'prod_invoicePrice', '10.5'); val(r, 'prod_category', 'c1');
  await r.run('saveProd(false)');
  const w = productWrites(r).pop();
  assert.equal(w.data.price, 10.5);
  assert.ok(!('discountPct' in w.data) && !('discountSet' in w.data));
  assert.equal(r.run('JSON.stringify(productCompatDiscount(5.65, 5.6))'), '{}');
});

function cloudSetup() {
  const r = setup({ realCloudTasks: true });
  const db = new Map([['products/code_9604', JSON.parse(r.run(`JSON.stringify(${P})`))]]);
  const state = { offline: false };
  r.context.doc = (_, ...path) => path.slice(-2).join('/');
  r.context.updateDoc = async (ref, data) => { if (state.offline) throw new Error('offline'); db.set(ref, { ...db.get(ref), ...structuredClone(data) }); };
  r.context.runTransaction = async (_, fn) => {
    if (state.offline) throw new Error('offline');
    const pending = [];
    const out = await fn({ get: async ref => ({ exists: () => db.has(ref), data: () => structuredClone(db.get(ref)) }), update: (ref, data) => pending.push([ref, structuredClone(data)]) });
    pending.forEach(([ref, data]) => db.set(ref, { ...db.get(ref), ...data }));
    return out;
  };
  r.run('globalThis.__log = []; logAction = (...a) => __log.push(a);');
  return { r, db, state };
}

test('שמירה מקוונת של שם ומחיר יחד: הטרנזקציה כותבת את כל שדות המוצר ואת הרשומה', async () => {
  const { r, db } = cloudSetup();
  open(r, 'code_9604');
  val(r, 'prod_name', 'שם חדש'); val(r, 'prod_price', '13'); val(r, 'prod_posPrice', '15.9'); val(r, 'prod_invoicePrice', '9.5'); val(r, 'prod_priceFrom', '2026-09-01');
  await r.run('saveProd(false)');
  const server = db.get('products/code_9604');
  assert.deepEqual([server.name, server.listPrice, server.posPrice, server.price], ['שם חדש', 13, 15.9, 9.03]);
  assert.deepEqual(server.priceHistory.map(h => [h.from, h.price]), [['2026-09-01', 9.5]]);
});

test('תיקון לאותו תאריך גובר על רשומה ישנה שבתור (בלי רשת → ניסיון חוזר)', async () => {
  const { r, db, state } = cloudSetup();
  const today = r.run('todayStr()');
  state.offline = true;
  open(r, 'code_9604'); val(r, 'prod_invoicePrice', '97');
  await r.run('saveProd(false)');
  assert.equal(r.run('cloudFailedWrites.length'), 1);
  state.offline = false;
  r.run('priceEditId = null;'); open(r, 'code_9604'); val(r, 'prod_invoicePrice', '9.7');
  await r.run('saveProd(false)');
  assert.equal(r.run('cloudFailedWrites.length'), 0, 'הרשומה הישנה לאותו תאריך ירדה מהתור');
  assert.deepEqual(db.get('products/code_9604').priceHistory.map(h => [h.from, h.price]), [[today, 9.7]]);
});

test('ניסיון חוזר אינו דורס רשומה לאותו תאריך שנכתבה אחריו ממכשיר אחר', async () => {
  const { r, db, state } = cloudSetup();
  state.offline = true;
  await r.run(`adoptInvoicePrice('code_9604', 9.6, '2026-09-01')`);
  assert.equal(r.run('cloudFailedWrites.length'), 1);
  db.get('products/code_9604').priceHistory = [{ from: '2026-09-01', price: 9.65, source: { method: 'invoice', adoptedAt: Date.now() + 60000 } }];
  state.offline = false;
  await r.run('retryCloudFailedWrites()');
  assert.deepEqual(db.get('products/code_9604').priceHistory.map(h => [h.from, h.price]), [['2026-09-01', 9.65]]);
});

test('יומן הפעולות: אימוץ מחיר רושם מחיר ותאריך', async () => {
  const { r } = cloudSetup();
  const text = r.run(`actionDetailsFromCloud('adopt invoice price', { op: 'price-entry', path: ['x', 'products', 'code_9604'], priceEntry: { from: '2026-09-01', price: 9.6, source: null } })`);
  assert.match(text, /פרנה לבדיקה · ₪9\.6.* מ-1\.9\.2026/);
  assert.match(r.run(`actionDetailsFromCloud('save product invoice price', { op: 'price-entry', path: ['x', 'products', 'code_9604'], priceEntry: { from: '2026-10-01', price: 9.7, source: null } })`), /₪9\.7/);
});

test('סריקה: ההכרעה לפי מחיר החשבונית ביום התעודה — לא ביום הסריקה', () => {
  const r = setup();
  r.run(`products.push({ id: 'code_7101', code: '7101', name: 'וריאנט', barcode: '71', listPrice: 12.9, price: 9.03, priceHistory: [{ from: '2026-09-15', price: 9.5, source: null }] },
      { id: 'code_7102', code: '7102', name: 'וריאנט', barcode: '71', listPrice: 12.9, price: 9.03 });
    receiptDocDate = '2026-09-10';`);
  assert.equal(r.run(`aiSingleNameCandidateId({ catalogHintId: 'code_7101', catalogCandidateHintIds: ['code_7101', 'code_7102'] })`), 'code_7101', 'ב-10.9 שני המחירים 9.03');
  r.run(`receiptDocDate = '2026-09-20';`);
  assert.equal(r.run(`aiSingleNameCandidateId({ catalogHintId: 'code_7101', catalogCandidateHintIds: ['code_7101', 'code_7102'] })`), '');
});

test('שורת המחירון: המבצע הפעיל מוצג גם כשמבצע שפג קודם לו ברשימה', () => {
  const r = setup();
  r.run(`promos = [{ id: 'old', productIds: ['code_9604'], fixedPrice: 8.5, start: '2000-01-01', end: '2000-01-31', title: 'ישן' },
    { id: 'now', productIds: ['code_9604'], fixedPrice: 8.2, start: '2000-02-01', end: '2099-12-31', title: 'פעיל' }];`);
  const html = r.run(`priceRowHtml(${P})`);
  assert.match(html, /מרכזת: [^<]*₪8\.20/, 'המבצע הפעיל (8.20), לא זה שפג (8.50)');
  assert.doesNotMatch(html, /₪8\.50|\(לא פעיל\)/);
});
