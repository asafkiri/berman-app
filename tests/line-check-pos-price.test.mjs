// v167 — בדיקה שורה-שורה: מוצר בלי מחיר קופה — השדה להשלמת המחיר בשורה עצמה (כמו יטבתה 415 ותנובה 161).
// 10.11.2026, בעל העסק: "כאשר יש מוצר שאין לו מחיר קופה באפליקציה — אפשר שיהיה ישירות מהשורה להכניס את המחיר של הקופה?"
// עד כאן השורה אמרה "אין מחיר קופה — בדוק בקופה ועדכן" ושלחה למסך המחירים. אותם נתונים מומצאים כמו ב-v159: תעודת משלוח
// (5 שורות, 30 יח׳) ונייר "ת.משלוח" קטן (אחיד פרוס ×5, אסלי ×2).
// מה שנבדק:
// 1. השורה: בלי מחיר קופה — שדה ההשלמה (receiptLinePosHtml) במקום האזהרה; עם מחיר — "בקופה: ₪X" בלי שדה; שורת הסריקה
//    (buildReceiptRow) והכרטיס שמעל המצלמה (receiptLineScanCardHtml) — האזהרה כמו קודם, בלי שדה.
// 2. הקלדה: נשמר מיד דרך savePosPrice (posPrice, posPriceAt, אותה כתיבה מושהית לענן כמו מסך המחירים), "נשמר — ₪X בקופה",
//    בלי לצייר מחדש; פסיק כנקודה; בציור הבא (סימון, "שנה") — "בקופה ₪X" כמו כל שורה, בלי שדה.
// 3. קלט לא תקין: ריק — המחיר נמחק והרמז נעלם; אותיות, אפס או שלילי — "הזן מחיר חיובי", ומחיר שנשמר מהשדה רגע קודם נמחק.
// 4. מתחת לעלות כולל מע״מ — נשמר, עם אזהרה אדומה (לא חסימה).
// 5. שורה מקופלת ("הגיע" / "לא הגיע") בלי מחיר קופה — השדה גם בה; Enter בשדה סוגר את המקלדת (blur), Escape עדיין סוגר את החלון.
// 6. הגרסה עלתה ל-167, כולל ההערה ב-service worker.
// הרצה: TZ=Asia/Jerusalem node --test tests/line-check-pos-price.test.mjs
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { app, delivery, printed, now, readPapers, receive, state } from './one-button-helpers.mjs';

const BIG = '244785003', SMALL = '290096103';
const json = (r, e) => JSON.parse(r.run('JSON.stringify(' + e + ')'));
const strip = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
function small(number = SMALL) {
  const p = delivery(number, { internalNumber: null, headerText: 'ת.משלוח', docDate: printed(now) });
  const rows = p.scan.documents[0].rows;
  p.scan.documents[0].rows = [{ ...rows[0], quantity: 5, lineNumber: 1 }, { ...rows[2], quantity: 2, lineNumber: 2 }];
  Object.assign(p.scan.documents[0], { totalUnits: 7, printedLines: 2 });
  return p;
}
// שתי התעודות בקליטה והבדיקה שורה-שורה פתוחה; אחיד פרוס (code_101) עם מחיר קופה, לחמניות (code_1231) בלי — ועלות 7 (8.26 כולל מע״מ)
async function open() {
  const r = app(delivery(BIG));
  await receive(r);
  r.serve(small());
  await readPapers(r, 1, 1);
  assert.deepEqual(state(r).nums, [BIG, SMALL], 'שתי התעודות בקליטה');
  r.run(`currentView = 'receiving'; mainMode = 'receiving';
    products.find(p => p.id === 'code_101').posPrice = 12.9; products.find(p => p.id === 'code_1231').price = 7;
    startReceiptLineCheck()`);
  assert.equal(r.run(`$('receiptQuantityModal').classList.contains('hidden')`), false, 'החלון פתוח');
  assert.equal(json(r, 'receiptQuantityReview.mode'), 'lines');
  r.callbacks.splice(0); r.writes.splice(0); // מה שנצבר עד כאן אינו של הבדיקה
  return r;
}
const click = (r, dataset) => r.run(`receiptLineCheckClick({ target: { closest: () => ({ dataset: ${JSON.stringify(dataset)} }) } })`);
const type = (r, dataset, value) => r.run(`receiptLineCheckInput({ target: { dataset: ${JSON.stringify(dataset)}, value: ${JSON.stringify(value)} } })`);
const rows = r => r.run(`$('receiptQuantityRows').innerHTML`);
const product = (r, id) => json(r, `products.find(p => p.id === ${JSON.stringify(id)})`);
const hint = (r, id) => r.node('linePosHint_' + id);
// ה-HTML של שורה אחת (lineCheck_di_li) מתוך הרשימה — עד השורה הבאה או סוף התעודה
function row(r, di, li) {
  const h = rows(r), i = h.indexOf('<div id="lineCheck_' + di + '_' + li + '"');
  assert.ok(i >= 0, 'שורה ' + di + ':' + li + ' קיימת');
  const ends = [h.indexOf('<div id="lineCheck_', i + 10), h.indexOf('<section', i), h.indexOf('</section>', i)].filter(x => x > 0);
  return h.slice(i, ends.length ? Math.min(...ends) : undefined);
}
// הכתיבות המושהות לענן (setTimeout של savePosPrice) — בהרצה: מה שנצבר בתור; runCloudTaskSilent (one-button-helpers) רושם את המשימה
function flush(r) { const fns = r.callbacks.splice(0); fns.forEach(fn => fn()); return r.writes.splice(0).filter(w => w && w.op === 'update' && Array.isArray(w.path) && w.path[w.path.length - 2] === 'products'); }
const EDITOR = 'אין מחיר קופה — אפשר להשלים כאן כמה עובר בקופה (כולל מע״מ) ₪';

test('1. השורה: בלי מחיר קופה — שדה ההשלמה במקום האזהרה; עם מחיר — "בקופה: ₪X" בלי שדה; הסריקה והכרטיס שמעל המצלמה — כמו קודם', async () => {
  const r = await open();
  const p = product(r, 'code_1231');
  const b = row(r, 0, 1);
  assert.equal(strip(b), 'שורה 2 בתעודה לחמניות 10 בשקית ' + EDITOR + ' ' + p.barcode + ' · קוד 1231 6 יח׳ בתעודה הגיע 6 אחרת לא הגיע');
  assert.match(b, /<input id="linePos_code_1231" data-line-pos="code_1231" type="text" inputmode="decimal" autocomplete="off" placeholder="0\.00" aria-label="מחיר קופה: לחמניות 10 בשקית"/);
  assert.match(b, /<label for="linePos_code_1231"/); assert.match(b, /<div id="linePosHint_code_1231" class="hidden" aria-live="polite"><\/div>/);
  assert.match(b, /fa-triangle-exclamation/); assert.match(b, /fa-cash-register/);
  assert.doesNotMatch(b, /בדוק בקופה ועדכן/);
  // עם מחיר קופה — כמו קודם, בלי שדה
  const a = row(r, 0, 0);
  assert.match(a, /fa-cash-register text-xs"><\/i> בקופה: ₪12\.90/); assert.doesNotMatch(a, /data-line-pos|אין מחיר קופה/);
  // שורת הסריקה והכרטיס שמעל המצלמה — האזהרה הישנה, בלי שדה (שם אין איפה להקליד)
  const scanRow = r.run(`buildReceiptRow({ productId: 'code_1231', name: 'לחמניות 10 בשקית', barcode: ${JSON.stringify(p.barcode)}, qty: 1 })`);
  assert.match(scanRow, /אין מחיר קופה — בדוק בקופה ועדכן/); assert.doesNotMatch(scanRow, /data-line-pos/);
  const cardHtml = r.run(`receiptLineScanCardHtml({ kind: 'line', di: 0, li: 1, scanned: products.find(p => p.id === 'code_1231'), related: null, askQty: false, addQty: false, got: '' })`);
  assert.match(strip(cardHtml), /^שורה 2 בתעודה 1 מתוך 2 לחמניות 10 בשקית אין מחיר קופה — בדוק בקופה ועדכן 6 יח׳ בתעודה הגיע 6 אחרת לא הגיע$/);
  assert.doesNotMatch(cardHtml, /data-line-pos/);
  // אותה פונקציה — הדגל מחליט
  assert.match(r.run(`posPriceLineHtml(products.find(p => p.id === 'code_1231'))`), /^<div class="text-\[11px\] font-black text-amber-600 mt-0\.5">.*בדוק בקופה ועדכן<\/div>$/);
  assert.equal(r.run(`posPriceLineHtml(products.find(p => p.id === 'code_1231'), true)`), r.run(`receiptLinePosHtml(products.find(p => p.id === 'code_1231'))`));
  assert.equal(r.run(`posPriceLineHtml(null, true)`), '');
});

test('2. הקלדה: נשמר מיד דרך savePosPrice (posPrice, posPriceAt, הכתיבה לענן), "נשמר — ₪X בקופה", בלי ציור מחדש; בציור הבא — "בקופה ₪X" בלי שדה', async () => {
  const r = await open();
  const before = rows(r);
  type(r, { linePos: 'code_1231' }, '9.90'); // עלות 7 + מע״מ = 8.26 — מעל העלות
  const p = product(r, 'code_1231');
  assert.equal(p.posPrice, 9.9); assert.ok(Number(p.posPriceAt) > 0, 'posPriceAt — מגן מפני דריסה בייבוא דוח ישן');
  assert.equal(hint(r, 'code_1231').className, 'text-[11px] font-black mt-1.5 text-emerald-700');
  assert.equal(strip(hint(r, 'code_1231').innerHTML), 'נשמר — ₪9.90 בקופה'); assert.match(hint(r, 'code_1231').innerHTML, /fa-check/);
  assert.equal(rows(r), before, 'בלי ציור מחדש — השדה, הפוקוס והמקלדת נשארים');
  // הכתיבה המושהית לענן — בדיוק מה שמסך המחירים כותב (savePosPrice)
  const writes = flush(r);
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].path.slice(-2), ['products', 'code_1231']);
  assert.deepEqual(writes[0].data, { posPrice: 9.9, posPriceAt: p.posPriceAt });
  assert.match(writes[0].operationId || '', /pos/);
  // פסיק כנקודה
  type(r, { linePos: 'code_1231' }, '10,50');
  assert.equal(product(r, 'code_1231').posPrice, 10.5); assert.equal(strip(hint(r, 'code_1231').innerHTML), 'נשמר — ₪10.50 בקופה');
  assert.equal(flush(r).pop().data.posPrice, 10.5);
  // הציור הבא — הסימון: השורה מקופלת עם המחיר, בלי שדה; "שנה" — הכרטיס הפתוח עם "בקופה: ₪10.50", בלי שדה
  click(r, { lineMark: '0:1:ok' });
  let b = row(r, 0, 1);
  assert.equal(strip(b), 'לחמניות 10 בשקית הגיע · 6 יח׳ · בקופה ₪10.50 שנה'); assert.doesNotMatch(b, /data-line-pos|flex-1/);
  click(r, { lineOpen: '0:1' });
  b = row(r, 0, 1);
  assert.match(b, /בקופה: ₪10\.50/); assert.doesNotMatch(b, /data-line-pos|אין מחיר קופה/);
  assert.equal(json(r, 'receiptQuantityReview.docs[0].lines[1].mark'), 'ok', 'הסימון לא נגע במחיר ולהפך');
});

test('3. קלט לא תקין: ריק — המחיר נמחק והרמז נעלם; אותיות, אפס או שלילי — "הזן מחיר חיובי", ומחיר שנשמר רגע קודם נמחק', async () => {
  const r = await open();
  type(r, { linePos: 'code_1231' }, '7');
  assert.equal(product(r, 'code_1231').posPrice, 7);
  type(r, { linePos: 'code_1231' }, '');
  assert.equal(product(r, 'code_1231').posPrice, null); assert.equal(hint(r, 'code_1231').className, 'hidden'); assert.equal(hint(r, 'code_1231').innerHTML, '');
  assert.equal(flush(r).pop().data.posPrice, null, 'המחיקה נכתבת לענן');
  type(r, { linePos: 'code_1231' }, '7');
  for (const bad of ['abc', '0', '-3', '0,00']) {
    type(r, { linePos: 'code_1231' }, bad);
    assert.equal(product(r, 'code_1231').posPrice, null, bad + ': המחיר שנשמר מהשדה נמחק');
    assert.equal(hint(r, 'code_1231').className, 'text-[11px] font-black mt-1.5 text-rose-600'); assert.equal(hint(r, 'code_1231').innerHTML, 'הזן מחיר חיובי');
  }
  // ריק כשלא נשמר כלום — בלי כתיבה מיותרת
  r.callbacks.splice(0); r.writes.splice(0);
  type(r, { linePos: 'code_1231' }, '');
  assert.equal(flush(r).length, 0);
  // מוצר שאינו במאגר — כלום
  type(r, { linePos: 'nobody' }, '5');
  assert.equal(flush(r).length, 0);
});

test('4. מתחת לעלות כולל מע״מ — נשמר, עם אזהרה אדומה (לא חסימה)', async () => {
  const r = await open();
  type(r, { linePos: 'code_1231' }, '5'); // עלות 7 + 18% מע״מ = 8.26
  assert.equal(product(r, 'code_1231').posPrice, 5);
  assert.equal(hint(r, 'code_1231').className, 'text-[11px] font-black mt-1.5 text-rose-600');
  assert.equal(strip(hint(r, 'code_1231').innerHTML), 'נשמר — ₪5.00 בקופה · נמוך מהעלות כולל מע״מ (₪8.26)'); assert.match(hint(r, 'code_1231').innerHTML, /fa-triangle-exclamation/);
  type(r, { linePos: 'code_1231' }, '8.26');
  assert.equal(hint(r, 'code_1231').className, 'text-[11px] font-black mt-1.5 text-emerald-700'); assert.equal(strip(hint(r, 'code_1231').innerHTML), 'נשמר — ₪8.26 בקופה');
  // בלי מחיר עלות — אין מול מה להשוות
  r.run(`products.find(p => p.id === 'code_2387').price = null`);
  type(r, { linePos: 'code_2387' }, '1');
  assert.equal(strip(hint(r, 'code_2387').innerHTML), 'נשמר — ₪1.00 בקופה');
});

test('5. שורה מקופלת בלי מחיר קופה — השדה גם בה; Enter בשדה סוגר את המקלדת, Escape עדיין סוגר את החלון', async () => {
  const r = await open();
  click(r, { lineMark: '0:1:ok' }); // לחמניות — בלי מחיר קופה
  let c = row(r, 0, 1);
  assert.doesNotMatch(c, /data-line-mark=/, 'מקופלת');
  assert.equal(strip(c), 'לחמניות 10 בשקית הגיע · 6 יח׳ ' + EDITOR + ' שנה');
  assert.match(c, /<div class="min-w-0 flex-1">/, 'הטקסט תופס את הרוחב — לשדה'); assert.match(c, /data-line-pos="code_1231"/); assert.match(c, /data-line-open="0:1"/);
  type(r, { linePos: 'code_1231' }, '9.5');
  assert.equal(product(r, 'code_1231').posPrice, 9.5);
  click(r, { lineOpen: '0:1' });
  c = row(r, 0, 1);
  assert.match(c, /בקופה: ₪9\.50/); assert.doesNotMatch(c, /data-line-pos/);
  click(r, { lineMark: '0:1:ok' });
  c = row(r, 0, 1);
  assert.equal(strip(c), 'לחמניות 10 בשקית הגיע · 6 יח׳ · בקופה ₪9.50 שנה'); assert.match(c, /<div class="min-w-0">/, 'עם מחיר — כמו קודם');
  // "לא הגיע" — גם מקופלת עם השדה
  click(r, { lineMark: '0:4:none' }); // פיתות עננים — בלי מחיר קופה
  const d = row(r, 0, 4);
  assert.equal(strip(d), 'פיתות עננים 8 לא הגיע · 0 מתוך 3 ' + EDITOR + ' שנה'); assert.match(d, /data-line-pos="code_2387"/);
  // Enter בשדה — blur (המקלדת נסגרת), בלי לסגור את החלון; Escape — כמו קודם
  const keydown = r.events.get('receiptQuantityModal:keydown');
  let blurred = 0, prevented = 0;
  keydown({ key: 'Enter', target: { dataset: { linePos: 'code_1231' }, blur: () => blurred++ }, preventDefault: () => prevented++ });
  assert.equal(blurred, 1); assert.equal(prevented, 1);
  assert.equal(r.run(`!$('receiptQuantityModal').classList.contains('hidden')`), true, 'החלון פתוח');
  keydown({ key: 'Enter', target: { dataset: { lineGot: '0:1' }, blur: () => blurred++ }, preventDefault: () => prevented++ });
  assert.equal(blurred, 1, 'Enter בשדה אחר — כלום');
  keydown({ key: 'Escape', target: { dataset: {} } });
  assert.equal(r.run(`$('receiptQuantityModal').classList.contains('hidden')`), true, 'Escape סוגר');
});

test('6. הגרסה (167 ומעלה), כולל ההערה ב-service worker', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const v = html.match(/const APP_VERSION = '(\d+)'/)[1];
  assert.ok(Number(v) >= 167, v);
  assert.match(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), new RegExp('גרסת אפליקציה ' + v));
});
