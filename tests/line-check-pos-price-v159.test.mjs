// v159 — המחיר בקופה (כולל מע״מ) ליד כל מוצר בבדיקה שורה-שורה.
// 3.11.2026: בעל החנות עובר על הסחורה שורה-שורה בטלפון, ורוצה לראות ליד כל מוצר גם כמה הוא עובר בקופה — בלי
// לגשת לקופה. הנתונים כאן מומצאים (one-button-helpers): תעודת משלוח של 5 שורות, ולשניים מהמוצרים נקבע מחיר קופה.
// מה שנבדק:
// 1. בכל שורה של התעודה: מוצר עם מחיר קופה — "בקופה: ₪X"; בלי — "אין מחיר קופה"; "בתעודה: N" נשאר. גם ב"הגיע משהו
//    נוסף" ובתוצאות החיפוש (שם — רק כשיש מחיר).
// 2. המחיר נקרא מכרטיס המוצר ברגע הציור: שינוי במסך המחירים מופיע בציור הבא, ושום מחיר לא נשמר בבדיקה (הטיוטה).
// 3. הסימון, המונה והסיום — כמו ב-154 (המחיר הוא תצוגה בלבד).
// הרצה: TZ=Asia/Jerusalem node --test tests/line-check-pos-price-v159.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { app, delivery, receive } from './one-button-helpers.mjs';

const json = (r, e) => JSON.parse(r.run('JSON.stringify(' + e + ')'));
const strip = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const click = (r, dataset) => r.run(`receiptLineCheckClick({ target: { closest: () => ({ dataset: ${JSON.stringify(dataset)} }) } })`);
const type = (r, dataset, value) => r.run(`receiptLineCheckInput({ target: { dataset: ${JSON.stringify(dataset)}, value: ${JSON.stringify(value)} } })`);
// הכרטיס של שורה אחת מתוך החלון (lineCheck_<doc>_<line>), בלי תגיות
function card(r, di, li) {
  const html = r.run(`$('receiptQuantityRows').innerHTML`);
  const m = html.match(new RegExp('<div id="lineCheck_' + di + '_' + li + '"[\\s\\S]*?(?=<div class="grid grid-cols-3)'));
  assert.ok(m, 'השורה ' + di + ':' + li + ' בחלון');
  return strip(m[0]);
}
async function open() {
  const r = app(delivery('244804072'));
  await receive(r);
  // אחיד פרוס ₪5.90 בקופה, לחמניות ₪12 (מספר שלם — מוצג עם אגורות); לשאר אין מחיר קופה
  r.run(`products.find(p => p.id === 'code_101').posPrice = 5.9; products.find(p => p.id === 'code_1231').posPrice = 12;`);
  r.run(`currentView = 'receiving'; mainMode = 'receiving'; startReceiptLineCheck();`);
  assert.equal(r.run('receiptQuantityReview.mode'), 'lines');
  return r;
}

test('1. המחיר בקופה ליד כל מוצר: בשורות התעודה, ב"הגיע משהו נוסף" ובחיפוש', async () => {
  const r = await open();
  assert.equal(card(r, 0, 0), 'אחיד פרוס ברמן בקופה: ₪5.90 בתעודה: 12');
  assert.equal(card(r, 0, 1), 'לחמניות 10 בשקית בקופה: ₪12.00 בתעודה: 6');
  assert.equal(card(r, 0, 2), 'ברמן אסלי 5 פיתות אין מחיר קופה — בדוק בקופה ועדכן במסך המחירים בתעודה: 4');
  const html = r.run(`$('receiptQuantityRows').innerHTML`);
  assert.equal((html.match(/בקופה: ₪/g) || []).length, 2, 'שני מוצרים עם מחיר');
  assert.equal((html.match(/אין מחיר קופה/g) || []).length, 3, 'שלושה בלי');
  assert.equal((html.match(/fa-cash-register/g) || []).length, 2, 'הסמל של הקופה — כמו בשורת המוצר שנקלט');
  // "הגיע משהו נוסף": מוצר עם מחיר ומוצר בלי
  r.run(`products.find(p => p.id === 'code_119').posPrice = 13.5;`);
  const other = r.run(`products.find(p => !['code_101','code_1231','code_238','code_2381','code_2387','code_119'].includes(p.id) && p.name && p.posPrice == null).id`);
  type(r, { lineSearch: '' }, 'לחם מלא');
  const found = r.run(`receiptLineSearchResultsHtml('לחם מלא')`);
  assert.match(strip(found), /\+ לחם מלא בטוב · בקופה: ₪13\.50/, 'בחיפוש — המחיר ליד השם');
  assert.doesNotMatch(r.run(`receiptLineSearchResultsHtml(products.find(p => p.id === ${JSON.stringify(other)}).name)`), /בקופה|אין מחיר/, 'בחיפוש, מוצר בלי מחיר — בלי תזכורת (רק השם)');
  click(r, { extraAdd: 'code_119' }); click(r, { extraAdd: other });
  const extras = strip(r.run(`$('receiptQuantityRows').innerHTML`).split('הגיע משהו נוסף?')[1] || '');
  assert.match(extras, /לחם מלא בטוב בקופה: ₪13\.50 הסר/);
  assert.match(extras, /אין מחיר קופה — בדוק בקופה ועדכן במסך המחירים הסר/);
});

test('2. המחיר נקרא מכרטיס המוצר בכל ציור, ולא נשמר בבדיקה', async () => {
  const r = await open();
  r.run(`products.find(p => p.id === 'code_101').posPrice = 6.2; products.find(p => p.id === 'code_238').posPrice = 8;`);
  click(r, { lineMark: '0:0:ok' }); // ציור מחדש
  assert.equal(card(r, 0, 0), 'אחיד פרוס ברמן בקופה: ₪6.20 בתעודה: 12');
  assert.equal(card(r, 0, 2), 'ברמן אסלי 5 פיתות בקופה: ₪8.00 בתעודה: 4');
  r.run(`products.find(p => p.id === 'code_101').posPrice = null;`);
  click(r, { lineMark: '0:1:ok' });
  assert.match(card(r, 0, 0), /^אחיד פרוס ברמן אין מחיר קופה/);
  assert.doesNotMatch(JSON.stringify(json(r, 'receiptQuantityReview')), /posPrice|בקופה/, 'הבדיקה (והטיוטה) בלי מחירים');
  // מוצר שנמחק מהמאגר בזמן הבדיקה — השורה נשארת, בלי מחיר ובלי שגיאה
  r.run(`products = products.filter(p => p.id !== 'code_2387');`);
  click(r, { lineMark: '0:2:ok' });
  assert.equal(card(r, 0, 4), 'פיתות עננים 8 בתעודה: 3');
});

test('3. הסימון, המונה והסיום — כמו קודם', async () => {
  const r = await open();
  assert.equal(r.run(`$('receiptQuantityProgress').textContent`), 'סומנו 0 מתוך 5 שורות');
  click(r, { lineMark: '0:0:qty' }); type(r, { lineGot: '0:0' }, '10');
  assert.equal(r.run(`$('lineCheckSum_0_0').textContent`), 'התקבלו 10 · חוסר 2');
  assert.equal(card(r, 0, 0), 'אחיד פרוס ברמן בקופה: ₪5.90 בתעודה: 12', 'המחיר נשאר גם בשורה עם כמות אחרת');
  for (let li = 1; li < 5; li++) click(r, { lineMark: '0:' + li + ':ok' });
  assert.equal(r.run(`$('receiptQuantityConfirm').textContent`), 'סיום — שמור את הבדיקה');
  assert.equal(r.run('finishReceiptLineCheck()'), true);
  assert.deepEqual(json(r, 'receiptList.map(l => l.productId + " " + l.qty)'), ['code_101 10', 'code_1231 6', 'code_238 4', 'code_2381 5', 'code_2387 3']);
  assert.deepEqual(Object.keys(json(r, 'receiptList[0]')).sort(), ['barcode', 'name', 'productId', 'qty'], 'שורת הקליטה בלי מחיר');
});
