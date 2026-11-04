// v159 — הבדיקה שורה-שורה: השורה כמו במסך הסריקה (מחיר קופה, ברקוד וקוד, מספר השורה בנייר, הכמות בתעודה גדולה),
// "הגיע" ככפתור הראשי, שורה שסומנה מתקפלת ל"שנה", מונה החוסרים והעודפים בראש החלון, ורקע אפור לגוף החלון.
// 4.11.2026, בעל החנות על הבדיקה שורה-שורה: "גם אין מחירים של כל מוצר שעוברים בקופה". אותם נתונים מומצאים כמו ב-v154:
// תעודת משלוח (5 שורות, 30 יח׳) ונייר "ת.משלוח" קטן (אחיד פרוס ×5, אסלי ×2).
// מה שנבדק:
// 1. השורה: מחיר הקופה בדיוק כמו בשורת הסריקה (buildReceiptRow — posPriceLineHtml משותפת), "אין מחיר קופה" למוצר בלי מחיר,
//    ברקוד, קוד, "שורה N בתעודה", הכמות, "2 ארגזים × 3", ו"הגיע N" — בלי "סמן הכל"; כותרת התעודה נשארת למעלה (sticky).
// 2. קיפול: "הגיע"/"לא הגיע" מקפלים את השורה (בלי כפתורי סימון, עם "שנה" ומה שסומן); "שנה" פותח עם הסימון; "אחרת" נשארת
//    פתוחה; פתיחה מחדש של החלון — מקופל; "סיום" לפני הזמן מסמן את השורה הפתוחה שנשארה; הסיום — כמו ב-v154.
// 3. המונה: "סומנו X מתוך Y שורות · חוסר N יח׳ · עודף M יח׳" (גם "הגיע משהו נוסף"), וגם כשכל השורות סומנו.
// 4. גוף החלון אפור בבדיקה שורה-שורה בלבד; הבדיקה הקיימת ("חוסרים ועודפים") — לבנה, בלי שינוי.
// הרצה: TZ=Asia/Jerusalem node --test tests/line-check-v159.test.mjs
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
async function twoPapers(opts) {
  const r = app(delivery(BIG), opts);
  await receive(r);
  r.serve(small());
  await readPapers(r, 1, 1);
  assert.deepEqual(state(r).nums, [BIG, SMALL], 'שתי התעודות בקליטה');
  r.run(`currentView = 'receiving'; mainMode = 'receiving';`);
  return r;
}
const click = (r, dataset) => r.run(`receiptLineCheckClick({ target: { closest: () => ({ dataset: ${JSON.stringify(dataset)} }) } })`);
const type = (r, dataset, value) => r.run(`receiptLineCheckInput({ target: { dataset: ${JSON.stringify(dataset)}, value: ${JSON.stringify(value)} } })`);
const review = r => json(r, 'receiptQuantityReview');
const rows = r => r.run(`$('receiptQuantityRows').innerHTML`);
const progress = r => r.run(`$('receiptQuantityProgress').textContent`);
// ה-HTML של שורה אחת (lineCheck_di_li) מתוך הרשימה — עד השורה הבאה או סוף התעודה
function row(r, di, li) {
  const h = rows(r), i = h.indexOf('<div id="lineCheck_' + di + '_' + li + '"');
  assert.ok(i >= 0, 'שורה ' + di + ':' + li + ' קיימת');
  const ends = [h.indexOf('<div id="lineCheck_', i + 10), h.indexOf('<section', i), h.indexOf('</section>', i)].filter(x => x > 0);
  return h.slice(i, ends.length ? Math.min(...ends) : undefined);
}
const markRestOk = r => review(r).docs.forEach((d, di) => d.lines.forEach((l, li) => { if (!l.mark) click(r, { lineMark: di + ':' + li + ':ok' }); }));

test('1. השורה כמו במסך הסריקה: מחיר קופה, ברקוד וקוד, מספר השורה, הכמות גדולה, "הגיע N"', async () => {
  const r = await twoPapers();
  r.run(`products.find(p => p.id === 'code_101').posPrice = 12.9; products.find(p => p.id === 'code_1231').boxSize = 3;`);
  r.run('startReceiptLineCheck()');
  assert.equal(r.run(`$('receiptQuantityModal').classList.contains('hidden')`), false, 'החלון פתוח');
  const a = row(r, 0, 0);
  assert.equal(strip(a), 'שורה 1 בתעודה אחיד פרוס ברמן בקופה: ₪12.90 497112 · קוד 101 12 יח׳ בתעודה הגיע 12 אחרת לא הגיע');
  // אותה שורת מחיר קופה כמו בשורת המוצר במסך הסריקה
  const pos = r.run(`posPriceLineHtml(products.find(p => p.id === 'code_101'))`);
  assert.match(pos, /fa-cash-register.*בקופה: ₪12\.90/);
  assert.ok(a.includes(pos), 'בבדיקה שורה-שורה');
  assert.ok(r.run(`buildReceiptRow({ productId: 'code_101', name: 'אחיד פרוס ברמן', barcode: '497112', qty: 1 })`).includes(pos), 'ובסריקה');
  // בלי מחיר קופה — האזהרה, כמו בסריקה; וגודל ארגז: 6 יח׳ = 2 ארגזים × 3
  const b = row(r, 0, 1);
  assert.match(strip(b), /^שורה 2 בתעודה לחמניות 10 בשקית אין מחיר קופה — בדוק בקופה ועדכן .*· קוד 1231 6 יח׳ בתעודה 2 ארגזים × 3 הגיע 6 אחרת לא הגיע$/);
  assert.match(b, /fa-triangle-exclamation/);
  assert.equal(r.run(`receiptLineBoxText({ boxSize: 3 }, 3)`), 'ארגז אחד של 3');
  assert.equal(r.run(`receiptLineBoxText({ boxSize: 4 }, 6)`), '', 'לא מתחלק — בלי ארגזים');
  assert.equal(r.run(`receiptLineBoxText({ boxSize: 0 }, 6)`), '');
  // "הגיע N" הוא הכפתור הראשי; שלוש הבחירות לכל שורה, בלי "סמן הכל", ואף שורה לא מסומנת מראש (כמו ב-v154)
  const all = rows(r);
  assert.equal((all.match(/data-line-mark="\d+:\d+:ok"/g) || []).length, 7);
  assert.equal((all.match(/aria-pressed="true"/g) || []).length, 0);
  assert.doesNotMatch(strip(all), /סמן הכל|הכל הגיע/);
  assert.match(a, /data-line-mark="0:0:ok"[^>]*class="[^"]*text-base[^"]*bg-emerald-50 border-2 border-emerald-500/, '"הגיע" רחב ומודגש');
  // כותרת התעודה — למעלה בגלילה, ובאותו סדר טקסט כמו קודם
  assert.match(all, /sticky top-0 z-10 bg-white border-r-4 border-blue-500/);
  assert.match(strip(all), /תעודה 1 מתוך 2 תעודת משלוח 244785003 5 שורות · 30 יח׳ הנייר הזה לא שלנו/);
});

test('2. שורה שסומנה "הגיע" או "לא הגיע" מתקפלת; "שנה" פותח; "אחרת" נשארת פתוחה; פתיחה מחדש — מקופל', async () => {
  const r = await twoPapers();
  r.run(`products.find(p => p.id === 'code_101').posPrice = 12.9`);
  r.run('startReceiptLineCheck()');
  click(r, { lineMark: '0:0:ok' });
  let a = row(r, 0, 0);
  assert.doesNotMatch(a, /data-line-mark=/, 'מקופלת — בלי כפתורי סימון');
  assert.equal(strip(a), 'אחיד פרוס ברמן הגיע · 12 יח׳ · בקופה ₪12.90 שנה');
  assert.match(a, /data-line-open="0:0"/); assert.match(a, /border-emerald-300 bg-emerald-50/);
  assert.equal(progress(r), 'סומנו 1 מתוך 7 שורות');
  assert.equal(json(r, 'receiptQuantityReview.docs[0].lines[0].mark'), 'ok', 'הסימון נשמר כמו ב-v154');
  // "שנה" — נפתחת עם "הגיע" מסומן
  click(r, { lineOpen: '0:0' });
  a = row(r, 0, 0);
  assert.match(a, /data-line-mark="0:0:ok" aria-pressed="true"/);
  assert.equal((a.match(/data-line-mark=/g) || []).length, 3);
  assert.equal(progress(r), 'סומנו 1 מתוך 7 שורות', 'פתיחה אינה סימון');
  // "הגיע" שוב — מתקפלת שוב; "לא הגיע" — מקופלת אדומה
  click(r, { lineMark: '0:0:ok' });
  assert.doesNotMatch(row(r, 0, 0), /data-line-mark=/);
  click(r, { lineMark: '0:2:none' });
  const c = row(r, 0, 2);
  assert.equal(strip(c), 'ברמן אסלי 5 פיתות לא הגיע · 0 מתוך 4 שנה');
  assert.match(c, /border-rose-300 bg-rose-50/);
  // "אחרת" — פתוחה, עם השדה והסיכום
  click(r, { lineMark: '0:1:qty' }); type(r, { lineGot: '0:1' }, '4');
  const b = row(r, 0, 1);
  assert.match(b, /data-line-got="0:1"/); assert.match(b, /data-line-mark="0:1:qty" aria-pressed="true"/);
  assert.equal(r.run(`$('lineCheckSum_0_1').textContent`), 'התקבלו 4 · חוסר 2');
  // פתיחה מחדש של החלון: מה שסומן מקופל, גם מה שנפתח ב"שנה"; "אחרת" פתוחה
  click(r, { lineOpen: '0:0' }); assert.match(row(r, 0, 0), /data-line-mark=/);
  r.run('closeReceiptQuantityReview(); startReceiptLineCheck()');
  assert.equal(r.run('testConfirms.length'), 0, 'בלי שאלה (ממשיכים מאותו מקום)');
  assert.doesNotMatch(row(r, 0, 0), /data-line-mark=/); assert.match(row(r, 0, 1), /data-line-got="0:1"/);
  // "סיום" לפני הזמן — השורה הפתוחה הראשונה שנשארה מסומנת (כמו ב-v154)
  assert.equal(r.run('finishReceiptLineCheck()'), false);
  assert.equal(r.run(`$('lineCheck_0_3').classList.contains('ring-4')`), true);
  // ומשם כמו תמיד: הכל "הגיע", "סיום" — אותה ספירה כמו ב-v154
  markRestOk(r);
  assert.equal(progress(r), 'כל 7 שורות סומנו — אפשר לסיים · חוסר 6 יח׳');
  assert.equal(r.run('finishReceiptLineCheck()'), true);
  assert.equal(r.run(`$('receiptQuantityModal').classList.contains('hidden')`), true, 'החלון נסגר');
  assert.deepEqual(json(r, 'receiptList.map(l => l.productId + " " + l.qty)'), ['code_101 17', 'code_1231 4', 'code_238 2', 'code_2381 5', 'code_2387 3']);
});

test('3. המונה בראש החלון: החוסרים והעודפים שסומנו עד עכשיו', async () => {
  const r = await twoPapers();
  r.run('startReceiptLineCheck()');
  assert.equal(progress(r), 'סומנו 0 מתוך 7 שורות');
  click(r, { lineMark: '0:1:qty' }); type(r, { lineGot: '0:1' }, '4');
  assert.equal(progress(r), 'סומנו 1 מתוך 7 שורות · חוסר 2 יח׳');
  click(r, { lineMark: '1:0:none' });
  assert.equal(progress(r), 'סומנו 2 מתוך 7 שורות · חוסר 7 יח׳');
  type(r, { lineGot: '0:1' }, '8');
  assert.equal(progress(r), 'סומנו 2 מתוך 7 שורות · חוסר 5 יח׳ · עודף 2 יח׳');
  type(r, { lineGot: '0:1' }, 'x');
  assert.equal(progress(r), 'סומנו 1 מתוך 7 שורות · חוסר 5 יח׳', 'כמות לא תקינה — השורה לא נספרת');
  type(r, { lineGot: '0:1' }, '6');
  assert.equal(progress(r), 'סומנו 2 מתוך 7 שורות · חוסר 5 יח׳');
  // "הגיע משהו נוסף" — עודף
  const extra = r.run(`products.find(p => !['code_101','code_1231','code_238','code_2381','code_2387','code_119'].includes(p.id) && p.name).id`);
  click(r, { extraAdd: extra }); type(r, { extraGot: '0' }, '3');
  assert.equal(progress(r), 'סומנו 2 מתוך 7 שורות · חוסר 5 יח׳ · עודף 3 יח׳');
  markRestOk(r);
  assert.equal(progress(r), 'כל 7 שורות סומנו — אפשר לסיים · חוסר 5 יח׳ · עודף 3 יח׳');
  // הודעה בראש החלון עדיין גוברת על המונה (כמו ב-v154)
  click(r, { extraRemove: '0' });
  r.run(`receiptLineNotice = { tone: 'ok', text: 'הודעה' }; refreshReceiptLineProgress();`);
  assert.equal(progress(r), 'הודעה');
});

test('4. רקע אפור רק בבדיקה שורה-שורה; "חוסרים ועודפים" — לבן ובלי שינוי', async () => {
  const r = await twoPapers();
  r.run('startReceiptLineCheck()');
  assert.equal(r.run(`$('receiptQuantityBody').classList.contains('bg-slate-50')`), true);
  r.run('closeReceiptQuantityReview(); startReceiptQuantityReview(false)');
  assert.equal(r.run(`$('receiptQuantityTitle').textContent`), 'חוסרים ועודפים');
  assert.equal(r.run(`$('receiptQuantityBody').classList.contains('bg-slate-50')`), false);
  const html = rows(r);
  assert.match(html, /data-quantity-kind=/);
  assert.doesNotMatch(html, /בקופה|data-line-open|data-line-mark/, 'הבדיקה הקיימת — כמו קודם');
  assert.equal(r.run(`$('receiptQuantityConfirm').className`), 'btn-tap w-full bg-blue-600 text-white rounded-xl py-3 font-black text-base');
});
