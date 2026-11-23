// v175 — "מוצר חדש" בבדיקת נייר.
// בעל העסק (23.11.2026, מול שורה "לא זוהה" בנייר זיכוי): "נגיד שבאמת הייתי מקבל פריט כזה או מחזיר פריט כזה שלא קיים לי
// באפליקציה — צריך לתת לי אופציה להוסיף מוצר חדש". עד 174 היו בשורה כזו רק "בחר מוצר" (מתוך המאגר), "הסר שורה", ובנייר
// זיכוי "מחיר אפסי — לא לספור"; מוצר שבאמת חדש חייב לצאת מהמסך, להוסיף אותו בניהול ולחזור. (בקליטה של תעודת משלוח —
// "מוצר חדש — הוסף למאגר", מ-v172.)
// מה שנבדק: הכפתור רק בשורה בלי מוצר, בכל סוגי הנייר; הכרטיס הרגיל של מוצר חדש עם מה שמודפס בשורה (קוד, שם, ברקוד,
// והמחירון מהקריאה השמורה — לא מחיר אפסי, ולא מעל מה שהוקלד); אחרי השמירה המוצר במאגר ומשויך לשורה, ואפשר לאשר את
// הנייר; סגירה בלי לשמור — כלום; קוד שכבר במאגר — בוחרים אותו, בלי כפילות; שתי שורות עם אותו קוד; שורה שהשתנתה בינתיים;
// שורה שנוספה ביד, בלי קוד.
// כל הניירות וההחזרות כאן מומצאים (מוצרי הקטלוג מ-tests/ledger-2026-10.json).
// הרצה: TZ=Asia/Jerusalem node --test tests/paper-review-new-product-v175.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runtime, fixture, html } from './receipt-scan-harness.mjs';

const L = JSON.parse(fs.readFileSync(new URL('./ledger-2026-10.json', import.meta.url), 'utf8'));
const name = code => (L.products.find(p => p.id === 'code_' + code) || {}).name || code;
const tick = () => new Promise(res => setImmediate(res));
const settle = async () => { for (let i = 0; i < 12; i++) await tick(); };
async function until(cond, n = 400) { for (let i = 0; i < n && !cond(); i++) await tick(); assert.ok(cond(), 'התנאי לא התקיים'); }
const PID = 'paper_290099320';
const ret = (id, rows, date = '2026-10-03') => ({ id, date, docDate: date, credited: false, timestamp: Date.parse(date + 'T08:00:00'), sentTo: 'הנהג',
  items: rows.map(([code, qty]) => ({ productId: 'code_' + code, code, name: name(code), barcode: '', qty })) });
// נייר שמור שממתין לבדיקה: שורות מזוהות, ושורה (או שתיים) שקוד הפריט שלהן אינו במאגר. row: [קוד, כמות, תיאור?, ברקוד?]
function paper(kind, rows, extra = {}) {
  const list = rows.map(([code, qty, description, barcode], i) => { const known = L.products.some(p => p.id === 'code_' + code);
    return { line: i + 1, itemCode: code, barcode: barcode || (known ? '' : '40330' + code.slice(-2)), description: description || name(code), qty, productId: known ? 'code_' + code : null, matchedBy: known ? 'tnuva_code_exact' : null }; });
  return { schema: 1, state: 'needs-review', id: PID, kind, kindKnown: true, number: '290099320', terminalNumber: '290099320', numerator: '99320', docDay: '2026-10-04', printedTime: '10:00',
    timestamp: Date.parse('2026-10-04T10:00:00'), captureId: 'cap_n', rev: 1, rows: list, anchors: { units: list.reduce((a, x) => a + x.qty, 0), lines: list.length, source: 'printed' },
    proof: { unitsOk: true, linesOk: true }, review: { notes: [] }, ...extra };
}
// הקריאה השמורה של הנייר (כמו ב-paperScans): המחיר המודפס בכל שורה
const scanOf = (p, prices) => ({ serviceVersion: 8, doc: { docType: p.kind === 'credit' ? 'credit' : 'invoice',
  rows: p.rows.map((x, i) => ({ lineNumber: x.line, supplierItemCode: x.itemCode, description: x.description, quantity: x.qty, printedListUnitPrice: prices[i] })),
  __pricePaper: { rows: p.rows.map((x, i) => ({ lineNumber: x.line, itemCode: x.itemCode, barcode: x.barcode, unitPriceExVat: prices[i] })) } } });
function app(p, { returns = [], scan = null } = {}) {
  const r = runtime({ data: { ...fixture(), products: structuredClone(L.products) } });
  r.context.testL = structuredClone({ returns, receipts: [], papers: [p] }); r.context.testScan = scan; r.context.testScanReads = []; r.context.testPrompts = [];
  r.run(`products = testData.products; receipts = testL.receipts; returns = testL.returns; papers = testL.papers; todayStr = () => '2026-10-06';
    pricingCats = [{ id: 'c1', name: 'לחם', pct: 30 }]; pricingCatsLoaded = true;
    paperScanFromCloud = async id => { testScanReads.push(id); return testScan ? structuredClone(testScan) : null; };
    promptQty = (product, target) => { testPrompts.push([product && product.id, target]); };
    ledgerInvalidate();`);
  for (const id of ['prod_barcode', 'prod_code', 'prod_name', 'prod_price', 'prod_invoicePrice']) r.node(id).setCustomValidity = () => {};
  r.j = expr => JSON.parse(r.run('JSON.stringify(' + expr + ')'));
  r.click = (role, id) => r.run(`paperUiClick({ dataset: ${JSON.stringify(id === undefined ? { role } : { role, id })} })`);
  r.rows = () => r.j('paperReview.paper.rows.map(x => [x.line, x.itemCode, x.productId, x.matchedBy])');
  r.card = () => ['prod_code', 'prod_name', 'prod_barcode', 'prod_price'].map(id => String(r.node(id).value));
  r.buttons = () => r.node('app').innerHTML.split('data-role="review-pick"').slice(1).map(part => (part.split('<input id="reviewSearch"')[0].match(/data-role="(review-row-(?:new|del|nominal))"/g) || []).map(x => x.slice(11, -1)));
  r.fill = () => { r.node('prod_category').value = 'c1'; r.node('prod_visible').checked = true; };
  return r;
}
const toastText = r => r.toasts[r.toasts.length - 1];
const CREDIT = () => paper('credit', [['238', 4], ['450', 3], ['1649', 3, 'לחמניות 10 כוסמין', '4033064']]);

test('הכפתור "מוצר חדש": רק בשורה בלי מוצר — בנייר זיכוי, בנייר חיוב ובתעודת משלוח קטנה', async () => {
  for (const [kind, expected] of [['credit', ['review-row-new', 'review-row-del', 'review-row-nominal']], ['charge', ['review-row-new', 'review-row-del']], ['delivery', ['review-row-new', 'review-row-del']]]) {
    const r = app(paper(kind, [['238', 4], ['450', 3], ['1649', 3]]));
    await r.run(`openPaperReview('${PID}')`);
    const known = expected.filter(x => x !== 'review-row-new');
    assert.deepEqual(r.buttons(), [known, known, expected], kind);
    assert.match(r.node('app').innerHTML, /data-role="review-row-new" data-id="2" aria-label="מוצר חדש — הוסף למאגר"[^>]*min-h-\[44px\][^>]*>מוצר חדש<\/button>/);
    // על שורה שכבר יש לה מוצר — הלחיצה אינה פותחת כלום
    r.click('review-row-new', '0');
    assert.equal(r.run('prodAfterSaveTarget'), null, kind);
  }
});

test('הכרטיס הרגיל של מוצר חדש, עם מה שמודפס בשורה; המחירון מגיע מהקריאה השמורה; סגירה בלי לשמור — שום דבר לא משתנה', async () => {
  const P = CREDIT(), r = app(P, { scan: scanOf(P, [7.95, 5.03, 16.9]) });
  await r.run(`openPaperReview('${PID}')`);
  const before = r.rows(), count = r.run('products.length');
  r.click('review-row-new', '2');
  assert.equal(r.run('prodAfterSaveTarget'), 'paper_review'); assert.equal(r.node('prodTitle').textContent, 'מוצר חדש');
  assert.deepEqual(r.card(), ['1649', 'לחמניות 10 כוסמין', '4033064', ''], 'המחירון עוד לא הגיע');
  await settle();
  assert.deepEqual(r.card(), ['1649', 'לחמניות 10 כוסמין', '4033064', '16.9']);
  assert.deepEqual(r.j('testScanReads'), [PID], 'קריאה אחת מהענן — הקריאה השמורה, לא קריאה חדשה בתשלום');
  assert.equal(r.requests.length, 0);
  r.run('hideProdModal()');
  assert.equal(r.run('paperReviewNewProductContext'), null); assert.deepEqual(r.rows(), before); assert.equal(r.run('products.length'), count);
  assert.doesNotMatch(r.node('app').innerHTML, /יש תיקונים שעוד לא נשמרו/);
});

test('שמירה: המוצר במאגר ובענן, השורה משויכת אליו, ואפשר לאשר את הנייר — בלי לצאת מהמסך', async () => {
  const P = CREDIT(), r = app(P, { scan: scanOf(P, [7.95, 5.03, 16.9]), returns: [ret('ret_n', [['238', 4], ['450', 3]])] });
  await r.run(`openPaperReview('${PID}')`);
  assert.equal(r.run('paperReviewState().ok'), false);
  r.click('review-row-new', '2'); await settle(); r.fill();
  await r.run('saveProd(false)'); await settle();
  const created = r.j(`products.find(p => p.id === 'code_1649')`);
  assert.deepEqual([created.code, created.name, created.barcode, created.listPrice], ['1649', 'לחמניות 10 כוסמין', '4033064', 16.9]);
  assert.ok(r.writes.some(w => w.path && w.path.join('/').endsWith('products/code_1649')), 'נכתב לענן');
  assert.deepEqual(r.rows()[2], [3, '1649', 'code_1649', 'user']);
  assert.equal(toastText(r), '"לחמניות 10 כוסמין" נוסף למאגר ושויך לשורה 3.');
  assert.equal(r.run('currentView'), 'paperReview'); assert.equal(r.run('prodAfterSaveTarget'), null);
  assert.match(r.node('app').innerHTML, /לחמניות 10 כוסמין/); assert.doesNotMatch(r.node('app').innerHTML, /לא זוהה/);
  assert.deepEqual(r.buttons()[2], ['review-row-del', 'review-row-nominal'], 'לשורה יש מוצר — "שנה מוצר", בלי "מוצר חדש"');
  assert.deepEqual(r.j('testPrompts'), [], 'בלי שאלת כמות — הכמות היא מה שמודפס בנייר');
  // עכשיו אפשר לאשר
  assert.equal(r.run('paperReviewState().ok'), true);
  r.click('review-save');
  await until(() => r.run('paperReview') === null);
  const upd = r.writes.filter(w => w.op === 'update' && w.path && w.path.at(-1) === PID).at(-1);
  assert.deepEqual(JSON.parse(JSON.stringify(upd.data.rows.map(x => [x.itemCode, x.productId, x.qty]))), [['238', 'code_238', 4], ['450', 'code_450', 3], ['1649', 'code_1649', 3]]);
  assert.equal(upd.data.state, 'accepted');
});

test('מחיר אפסי בשורה אינו מחירון: השדה נשאר ריק, ובלי מחירון המוצר לא נשמר; מחיר שהוקלד לפני שהקריאה הגיעה — נשאר', async () => {
  const P = CREDIT(), r = app(P, { scan: scanOf(P, [7.95, 5.03, 0.01]) });
  await r.run(`openPaperReview('${PID}')`);
  r.click('review-row-new', '2'); await settle();
  assert.deepEqual(r.card(), ['1649', 'לחמניות 10 כוסמין', '4033064', '']);
  r.fill();
  await r.run('saveProd(false)'); await settle();
  assert.equal(toastText(r), 'הזן מחיר מחירון למוצר החדש'); assert.equal(r.run(`products.some(p => p.id === 'code_1649')`), false);
  assert.equal(r.run('prodAfterSaveTarget'), 'paper_review', 'הכרטיס נשאר פתוח');
  r.node('prod_price').value = '0';
  await r.run('saveProd(false)'); await settle();
  assert.equal(toastText(r), 'בקליטה או בהחזרה חייבים מחיר מחירון גדול מ-0'); assert.equal(r.run(`products.some(p => p.id === 'code_1649')`), false);
  r.node('prod_price').value = '16.9';
  await r.run('saveProd(false)'); await settle();
  assert.equal(r.j(`products.find(p => p.id === 'code_1649')`).listPrice, 16.9); assert.equal(r.rows()[2][2], 'code_1649');
  // מחיר שהעובד הקליד לפני שהקריאה השמורה הגיעה — לא נדרס
  const Q = CREDIT(), q = app(Q, { scan: scanOf(Q, [7.95, 5.03, 16.9]) });
  await q.run(`openPaperReview('${PID}')`);
  q.click('review-row-new', '2'); q.node('prod_price').value = '17.5'; await settle();
  assert.equal(String(q.node('prod_price').value), '17.5');
  // בלי קריאה שמורה (או כשהיא לא מתאימה לשורה) — השדה ריק, והעובד מקליד
  const N = CREDIT(), n = app(N, { scan: null });
  await n.run(`openPaperReview('${PID}')`);
  n.click('review-row-new', '2'); await settle();
  assert.deepEqual(n.card(), ['1649', 'לחמניות 10 כוסמין', '4033064', '']);
  assert.equal(n.run(`paperScanRowPrice(${JSON.stringify(scanOf(N, [7.95, 5.03, 16.9]))}, { line: 3, itemCode: '9999' })`), null, 'קוד אחר באותה שורה — אין מחיר');
  assert.equal(n.run(`paperScanRowPrice(${JSON.stringify(scanOf(N, [7.95, 5.03, 16.9]))}, { line: 3, itemCode: '1649' })`), 16.9);
});

test('קוד הפריט כבר במאגר (המוצר נוסף אחרי שהנייר נקרא) — לא יוצרים כפילות: החיפוש נפתח על הקוד, ובוחרים אותו', async () => {
  const P = CREDIT(), r = app(P);
  r.run(`products.push({ id: 'code_1649', code: '1649', name: 'לחמניות 10 כוסמין', barcode: '4033064', price: 11.83, listPrice: 16.9 })`);
  await r.run(`openPaperReview('${PID}')`);
  assert.deepEqual(r.buttons()[2], ['review-row-new', 'review-row-del', 'review-row-nominal'], 'השורה השמורה עוד בלי מוצר');
  r.click('review-row-new', '2');
  assert.equal(r.run('prodAfterSaveTarget'), null, 'הכרטיס לא נפתח');
  assert.equal(toastText(r), 'קוד הפריט 1649 כבר במאגר: לחמניות 10 כוסמין — בחר אותו מהרשימה');
  assert.deepEqual(r.j('[paperReview.pickLine, paperReview.query]'), [2, '1649']);
  assert.match(r.node('reviewSearchList').innerHTML, /data-role="review-pick-product"[^>]*data-id="code_1649"|data-id="code_1649"[^>]*data-role="review-pick-product"/);
  r.click('review-pick-product', 'code_1649');
  assert.deepEqual(r.rows()[2], [3, '1649', 'code_1649', 'user']);
});

test('שתי שורות עם אותו קוד פריט — שתיהן משויכות למוצר החדש; שורה עם קוד אחר נשארת', async () => {
  const P = paper('charge', [['238', 4], ['1649', 3, 'לחמניות 10 כוסמין', '4033064'], ['1650', 2, 'מוצר אחר'], ['1649', 1, 'לחמניות 10 כוסמין', '4033064']]);
  const r = app(P, { scan: scanOf(P, [7.95, 16.9, 9, 16.9]) });
  await r.run(`openPaperReview('${PID}')`);
  r.click('review-row-new', '3'); await settle(); r.fill();
  assert.deepEqual(r.card(), ['1649', 'לחמניות 10 כוסמין', '4033064', '16.9']);
  await r.run('saveProd(false)'); await settle();
  assert.deepEqual(r.rows().map(x => x[2]), ['code_238', 'code_1649', null, 'code_1649']);
  assert.equal(toastText(r), '"לחמניות 10 כוסמין" נוסף למאגר ושויך לשורה 4.');
  // העובד תיקן את הקוד בכרטיס (נקרא לא נכון): רק השורה שממנה נפתח משויכת
  const Q = paper('charge', [['238', 4], ['1649', 3, 'לחמניות 10 כוסמין'], ['1649', 1, 'לחמניות 10 כוסמין']]), q = app(Q);
  await q.run(`openPaperReview('${PID}')`);
  q.click('review-row-new', '1'); await settle(); q.fill();
  q.node('prod_code').value = '1648'; q.node('prod_price').value = '16.9';
  await q.run('saveProd(false)'); await settle();
  assert.deepEqual(q.rows().map(x => x[2]), ['code_238', 'code_1648', null]);
});

test('השורה השתנתה בזמן שהכרטיס היה פתוח — המוצר נשמר במאגר, אבל אינו משויך לבד', async () => {
  const P = CREDIT(), r = app(P, { scan: scanOf(P, [7.95, 5.03, 16.9]) });
  await r.run(`openPaperReview('${PID}')`);
  r.click('review-row-new', '2'); await settle(); r.fill();
  r.run('paperReview.paper.rows.splice(2, 1)');
  await r.run('saveProd(false)'); await settle();
  assert.equal(r.run(`products.some(p => p.id === 'code_1649')`), true);
  assert.equal(toastText(r), 'המוצר נוסף למאגר, אבל השורה בנייר השתנתה ולכן לא שויכה — בחר אותו ב"בחר מוצר".');
  assert.deepEqual(r.rows().map(x => x[2]), ['code_238', 'code_450']);
  // המסך נסגר בינתיים — בלי שגיאה
  const Q = CREDIT(), q = app(Q, { scan: scanOf(Q, [7.95, 5.03, 16.9]) });
  await q.run(`openPaperReview('${PID}')`);
  q.click('review-row-new', '2'); await settle(); q.fill();
  q.run(`paperReview = null; currentView = 'manage'`);
  await q.run('saveProd(false)'); await settle();
  assert.equal(q.run(`products.some(p => p.id === 'code_1649')`), true);
  assert.equal(toastText(q), 'המוצר נוסף למאגר, אבל השורה בנייר השתנתה ולכן לא שויכה — בחר אותו ב"בחר מוצר".');
});

test('שורה שנוספה ביד ("שורה שלא נקראה"), בלי קוד: הכרטיס נפתח ריק, ואחרי השמירה השורה מקבלת את המוצר ואת הקוד שלו', async () => {
  const P = paper('charge', [['238', 4], ['450', 3]]), r = app(P);
  await r.run(`openPaperReview('${PID}')`);
  r.click('review-row-add');
  assert.deepEqual(r.buttons()[2], ['review-row-new', 'review-row-del']);
  r.click('review-row-new', '2'); await settle();
  assert.deepEqual(r.card(), ['', '', '', '']);
  r.node('prod_code').value = '1651'; r.node('prod_name').value = 'מאפה חדש'; r.node('prod_price').value = '8.5'; r.fill();
  await r.run('saveProd(false)'); await settle();
  assert.deepEqual(r.rows()[2], [3, '1651', 'code_1651', 'user']);
});

test('מה שלא השתנה: "מוצר חדש — הוסף למאגר" בקליטה (v172) והכרטיס הרגיל בניהול אינם נוגעים בבדיקת הנייר', async () => {
  const P = CREDIT(), r = app(P);
  await r.run(`openPaperReview('${PID}')`);
  r.click('review-row-new', '2'); await settle();
  // כרטיס אחר שנפתח (מהניהול) — ההקשר של הנייר מתאפס, והמוצר שנשמר אינו משויך לשורה
  r.run(`openProdModal(null, false, '')`);
  assert.equal(r.run('paperReviewNewProductContext'), null); assert.equal(r.run('prodAfterSaveTarget'), null);
  r.node('prod_code').value = '1652'; r.node('prod_name').value = 'מוצר מהניהול'; r.node('prod_price').value = '5'; r.fill();
  await r.run('saveProd(false)'); await settle();
  assert.equal(r.run(`products.some(p => p.id === 'code_1652')`), true); assert.equal(toastText(r), 'המוצר נוסף');
  assert.deepEqual(r.rows()[2], [3, '1649', null, null]);
  assert.match(html, /if \(afterTarget === 'paper_gate'\) \{ if \(savedProduct\) receiptGateCompleteNewProduct\(savedProduct, gateContext\); return; \}/);
});

test('הגרסה 175, כולל ההערה ב-service worker', () => {
  assert.match(html, /const APP_VERSION = '175'/);
  assert.match(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), /גרסת אפליקציה 175/);
});
