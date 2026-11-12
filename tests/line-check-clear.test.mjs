// v170 — הבדיקה שורה-שורה: "בטל סימון", ומה שהגיע ומחיר הקופה בכתב גדול ועבה יותר. בעל העסק, 12.11.2026, מתוך בדיקה בטלפון:
// 1) "הכתב שיהיה קצת יותר עבה וקצת יותר גדול, כדי שיהיה יותר קל לקרוא אותו (כמה הגיע ומה המחיר)."
// 2) "אם בטעות לחצתי 'הגיע' או 'לא הגיע' — שיהיה כפתור ביטול. קורה לי שאני לוחץ בטעות 'הגיע', ואז צריך ללחוץ 'לא הגיע' בינתיים
//    עד שאני אגיע למוצר, וזה סתם עושה לי בלאגן בראש."
// אותם נתונים מומצאים כמו ב-v154/v159: תעודת משלוח (5 שורות, 30 יח׳) ונייר "ת.משלוח" קטן (אחיד פרוס ×5, אסלי ×2).
// מה שנבדק:
// 1. השורה המקופלת: מה שהגיע ומחיר הקופה ב-15px ו-font-black (לא 12px bold), בשני חלקים שאינם נשברים באמצע, עם סמל הקופה
//    ביניהם; "לא הגיע" — אותו דבר באדום; מוצר בלי מחיר קופה — השדה להשלמה (v167), כמו קודם; והסיכום של "אחרת".
// 2. "בטל סימון" מופיע רק בשורה פתוחה שכבר סומנה: לא בשורה שעוד לא נבדקה ולא בשורה מקופלת; אחרי "שנה" — כן; ב"אחרת" — כן.
// 3. הלחיצה: השורה חוזרת להיות "עוד לא נבדקה" — בלי סימון, לבנה ופתוחה, נספרת ב"נשארו", ו"סיום" מחכה לה; נשמר בטיוטה.
//    אחרי הביטול הבדיקה זהה בדיוק למה שהייתה לפני הסימון.
// 4. מוצר בשתי תעודות (קבוצה, v164): הביטול מוחק את הסימון בכל שורותיו, ושורת ההפניה חוזרת להיות בלי סטטוס.
// 5. "אחרת" עם כמות, ועם שדה ריק — הביטול מנקה גם את מה שהוקלד; "הגיע" אחרי הביטול — כרגיל.
// 6. "סיום" אחרי ביטול מביא לשורה שבוטלה; אחרי שסומנה שוב — נשמר כמו בלי הביטול.
// 7. הכרטיס שמעל המצלמה — בלי שינוי (אין בו "בטל סימון"); אחרי ביטול, סריקה של המוצר היא סריקה ראשונה ("הגיע N").
// 8. הגרסה.
// הרצה: TZ=Asia/Jerusalem node --test tests/line-check-clear.test.mjs
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { app, delivery, printed, now, readPapers, receive, state } from './one-button-helpers.mjs';

const BIG = '244785003', SMALL = '290096103';
const json = (r, e) => JSON.parse(r.run('JSON.stringify(' + e + ')'));
const strip = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const settle = async () => { for (let i = 0; i < 40; i++) await new Promise(res => setImmediate(res)); };
function small(number = SMALL) {
  const p = delivery(number, { internalNumber: null, headerText: 'ת.משלוח', docDate: printed(now) });
  const rows = p.scan.documents[0].rows;
  p.scan.documents[0].rows = [{ ...rows[0], quantity: 5, lineNumber: 1 }, { ...rows[2], quantity: 2, lineNumber: 2 }];
  Object.assign(p.scan.documents[0], { totalUnits: 7, printedLines: 2 });
  return p;
}
async function twoPapers() {
  const r = app(delivery(BIG));
  await receive(r);
  r.serve(small());
  await readPapers(r, 1, 1);
  assert.deepEqual(state(r).nums, [BIG, SMALL], 'שתי התעודות בקליטה');
  r.run(`currentView = 'receiving'; mainMode = 'receiving';`);
  return r;
}
async function onePaper() {
  const r = app(delivery(BIG));
  await receive(r);
  r.run(`currentView = 'receiving'; mainMode = 'receiving';`);
  return r;
}
const click = (r, dataset) => r.run(`receiptLineCheckClick({ target: { closest: () => ({ dataset: ${JSON.stringify(dataset)} }) } })`);
const type = (r, dataset, value) => r.run(`receiptLineCheckInput({ target: { dataset: ${JSON.stringify(dataset)}, value: ${JSON.stringify(value)} } })`);
const review = r => json(r, 'receiptQuantityReview');
const marks = r => review(r).docs.map(d => d.lines.map(l => l.mark + (l.got ? ':' + l.got : '')).join(','));
const draftMarks = r => JSON.parse(r.storage.get('bm_receipt_draft')).quantityReview.docs.map(d => d.lines.map(l => l.mark + (l.got ? ':' + l.got : '')).join(','));
const rows = r => r.run(`$('receiptQuantityRows').innerHTML`);
const progress = r => r.run(`$('receiptQuantityProgress').textContent`);
const finish = r => r.run(`$('receiptQuantityConfirm').textContent`);
// ה-HTML של שורה אחת (lineCheck_di_li) מתוך הרשימה — עד השורה הבאה או סוף התעודה
function row(r, di, li) {
  const h = rows(r), i = h.indexOf('<div id="lineCheck_' + di + '_' + li + '"');
  assert.ok(i >= 0, 'שורה ' + di + ':' + li + ' קיימת');
  const ends = [h.indexOf('<div id="lineCheck_', i + 10), h.indexOf('<section', i), h.indexOf('</section>', i)].filter(x => x > 0);
  return h.slice(i, ends.length ? Math.min(...ends) : undefined);
}
const CLEAR = /<button type="button" data-line-clear="(\d+:\d+)" class="btn-tap min-h-\[44px\] w-full [^"]*"[^>]*>.*? בטל סימון<\/button>/;
const snapshot = r => json(r, '({ docs: receiptQuantityReview.docs, extras: receiptQuantityReview.extras, rows: receiptQuantityReview.rows, products: receiptQuantityReview.products })');

test('1. השורה המקופלת: מה שהגיע ומחיר הקופה גדולים ועבים יותר, בשני חלקים שאינם נשברים; "לא הגיע"; בלי מחיר קופה; "אחרת"', async () => {
  const r = await onePaper();
  r.run(`products.find(p => p.id === 'code_101').posPrice = 8.38; products.find(p => p.id === 'code_1231').posPrice = 17.9; products.find(p => p.id === 'code_238').posPrice = 10;`);
  r.run('startReceiptLineCheck()');
  click(r, { lineMark: '0:0:ok' }); click(r, { lineMark: '0:1:none' }); click(r, { lineMark: '0:3:ok' });
  const a = row(r, 0, 0);
  assert.equal(strip(a), 'אחיד פרוס ברמן הגיע · 12 יח׳ בקופה ₪8.38 שנה');
  // 15px ו-font-black (עד 169: text-xs font-bold), ושני חלקים שלמים — מה שהגיע, ומחיר הקופה עם הסמל שלו
  assert.match(a, /<div class="flex flex-wrap items-baseline gap-x-2\.5 text-\[15px\] font-black leading-snug text-emerald-700">/);
  assert.match(a, /<span class="whitespace-nowrap"><i class="fa-solid fa-check" aria-hidden="true"><\/i> הגיע · 12 יח׳<\/span><span class="whitespace-nowrap"><i class="fa-solid fa-cash-register text-xs" aria-hidden="true"><\/i> בקופה ₪8\.38<\/span>/);
  assert.doesNotMatch(a, /text-xs font-bold/, 'לא הכתב הקטן של קודם');
  assert.match(a, /<div class="font-black text-slate-800 truncate">אחיד פרוס ברמן<\/div>/, 'השם — כמו קודם');
  assert.match(a, /<button type="button" data-line-open="0:0" class="btn-tap shrink-0 min-h-\[44px\] px-3 [^"]*"[^>]*>שנה<\/button>/, '"שנה" — כמו קודם, הכפתור היחיד בשורה המקופלת');
  // "לא הגיע" — אותו דבר, באדום
  const b = row(r, 0, 1);
  assert.equal(strip(b), 'לחמניות 10 בשקית לא הגיע · 0 מתוך 6 בקופה ₪17.90 שנה');
  assert.match(b, /text-\[15px\] font-black leading-snug text-rose-700">/);
  assert.match(b, /<span class="whitespace-nowrap"><i class="fa-solid fa-xmark" aria-hidden="true"><\/i> לא הגיע · 0 מתוך 6<\/span><span class="whitespace-nowrap"><i class="fa-solid fa-cash-register text-xs" aria-hidden="true"><\/i> בקופה ₪17\.90<\/span>/);
  // מוצר בלי מחיר קופה — מה שהגיע באותו כתב, ואחריו השדה להשלמת המחיר (v167), בלי "בקופה ₪"
  const d = row(r, 0, 3);
  assert.match(d, /text-\[15px\] font-black leading-snug text-emerald-700"><span class="whitespace-nowrap"><i class="fa-solid fa-check" aria-hidden="true"><\/i> הגיע · 5 יח׳<\/span><\/div>/);
  assert.match(d, /data-line-pos="code_2381"/); assert.doesNotMatch(strip(d), /בקופה ₪/);
  // "אחרת" — הסיכום מתחת לשדה באותו כתב
  click(r, { lineMark: '0:2:qty' }); type(r, { lineGot: '0:2' }, '3');
  click(r, { lineOpen: '0:0' }); // ציור מחדש
  assert.match(row(r, 0, 2), /<div id="lineCheckSum_0_2" class="text-\[15px\] font-black mt-1 text-amber-800" aria-live="polite">התקבלו 3 · חוסר 1<\/div>/);
});

test('2. "בטל סימון" מופיע רק בשורה פתוחה שכבר סומנה: לא לפני סימון ולא בשורה מקופלת; אחרי "שנה" וב"אחרת" — כן', async () => {
  const r = await onePaper();
  r.run('startReceiptLineCheck()');
  assert.doesNotMatch(rows(r), /data-line-clear|בטל סימון/, 'לפני שסומן משהו — אין מה לבטל');
  click(r, { lineMark: '0:0:ok' }); click(r, { lineMark: '0:1:none' });
  assert.doesNotMatch(rows(r), /data-line-clear|בטל סימון/, 'בשורה מקופלת — רק "שנה"');
  // "שנה" — השורה נפתחת עם הסימון שלה, ומתחת לשלושת הכפתורים "בטל סימון"
  click(r, { lineOpen: '0:0' });
  let a = row(r, 0, 0);
  assert.match(a, /data-line-mark="0:0:ok" aria-pressed="true"/);
  assert.equal(a.match(CLEAR)[1], '0:0');
  assert.match(a, /aria-label="בטל סימון: אחיד פרוס ברמן"/);
  assert.match(a, /<i class="fa-solid fa-rotate-left" aria-hidden="true"><\/i> בטל סימון<\/button><\/div>$/, 'אחרי הכפתורים, בסוף הכרטיס');
  assert.match(strip(a), / 12 יח׳ בתעודה הגיע 12 אחרת לא הגיע בטל סימון$/);
  assert.equal((rows(r).match(/data-line-clear=/g) || []).length, 1, 'רק בשורה שנפתחה');
  // גם "לא הגיע" שנפתחה
  click(r, { lineOpen: '0:1' });
  assert.equal(row(r, 0, 1).match(CLEAR)[1], '0:1');
  // "אחרת" — פתוחה תמיד, ולכן "בטל סימון" בה מיד, גם לפני שהוקלדה כמות
  click(r, { lineMark: '0:2:qty' });
  let c = row(r, 0, 2);
  assert.equal(c.match(CLEAR)[1], '0:2');
  assert.match(strip(c), / כמה הגיע\? הקלד כמה יחידות הגיעו בטל סימון$/);
  // שורות שעוד לא סומנו — בלי
  assert.doesNotMatch(row(r, 0, 3), /data-line-clear/); assert.doesNotMatch(row(r, 0, 4), /data-line-clear/);
  assert.equal(progress(r), 'סומנו 2 מתוך 5 שורות · חוסר 6 יח׳', 'פתיחה ו"אחרת" בלי כמות אינן סימון — "הגיע" ו"לא הגיע" (6 יח׳) בלבד');
});

test('3. הלחיצה: השורה חוזרת להיות "עוד לא נבדקה" — בלי סימון, לבנה ופתוחה, נספרת ב"נשארו"; הבדיקה זהה למה שהייתה לפני הסימון', async () => {
  const r = await onePaper();
  r.run('startReceiptLineCheck()');
  click(r, { lineMark: '0:1:ok' });
  const before = snapshot(r), beforeRow = row(r, 0, 0);
  assert.equal(progress(r), 'סומנו 1 מתוך 5 שורות'); assert.equal(finish(r), 'סיום (נשארו 4)');
  // בטעות "הגיע" על אחיד פרוס
  click(r, { lineMark: '0:0:ok' });
  assert.deepEqual(marks(r), ['ok,ok,,,']); assert.equal(progress(r), 'סומנו 2 מתוך 5 שורות'); assert.equal(finish(r), 'סיום (נשארו 3)');
  // "שנה" ← "בטל סימון"
  click(r, { lineOpen: '0:0' });
  assert.equal(r.run('receiptLineOpen.has("0:0")'), true);
  click(r, { lineClear: '0:0' });
  assert.deepEqual(marks(r), [',ok,,,'], 'בלי סימון — לא "לא הגיע" בינתיים');
  assert.equal(r.run('receiptLineOpen.has("0:0")'), false);
  const a = row(r, 0, 0);
  assert.equal(a, beforeRow, 'השורה בדיוק כמו לפני שנגעו בה');
  assert.match(a, /class="rounded-2xl border-2 p-3 mb-2\.5 shadow-sm border-slate-200 bg-white"/, 'לבנה ופתוחה');
  assert.equal((a.match(/aria-pressed="false"/g) || []).length, 3, 'שום כפתור לא דולק');
  assert.doesNotMatch(a, /data-line-clear/, 'אין יותר מה לבטל');
  assert.equal(progress(r), 'סומנו 1 מתוך 5 שורות'); assert.equal(finish(r), 'סיום (נשארו 4)');
  assert.match(r.run(`$('receiptQuantityConfirm').className`), /bg-slate-400/, '"סיום" אפור — מחכה לשורה');
  assert.deepEqual(snapshot(r), before, 'הבדיקה זהה בדיוק למה שהייתה לפני הסימון');
  assert.deepEqual(draftMarks(r), [',ok,,,'], 'נשמר בטיוטה');
  assert.equal(r.run('receiptQuantityReview.confirmedAt'), null);
  // שורה אחרת לא הושפעה
  assert.doesNotMatch(row(r, 0, 1), /data-line-mark=/, 'לחמניות — עדיין מקופלת "הגיע"');
  // מפתח לא תקין — כלום
  click(r, { lineClear: '9:9' });
  assert.deepEqual(marks(r), [',ok,,,']);
  // "לא הגיע" בטעות — אותו דבר
  click(r, { lineMark: '0:3:none' }); click(r, { lineOpen: '0:3' }); click(r, { lineClear: '0:3' });
  assert.deepEqual(marks(r), [',ok,,,']); assert.deepEqual(snapshot(r), before);
});

test('4. מוצר בשתי תעודות: הביטול מוחק את הסימון בכל שורותיו, ושורת ההפניה בלי סטטוס', async () => {
  const r = await twoPapers();
  r.run('startReceiptLineCheck()');
  const before = snapshot(r);
  click(r, { lineMark: '0:0:ok' }); // אחיד פרוס — 12 בתעודה ו-5 בנייר הקטן
  assert.deepEqual(marks(r), ['ok,,,,', 'ok,']);
  assert.match(strip(r.run(`$('receiptQuantityRows').innerHTML`).match(/<div id="lineCheckRef_1_0"[\s\S]*?<\/button><\/div>/)[0]), /נספר יחד עם תעודה 1, שורה 1 · ✓ הגיע הצג$/);
  click(r, { lineOpen: '0:0' });
  assert.equal(row(r, 0, 0).match(CLEAR)[1], '0:0');
  click(r, { lineClear: '0:0' });
  assert.deepEqual(marks(r), [',,,,', ','], 'שתי השורות של המוצר');
  assert.deepEqual(snapshot(r), before);
  assert.match(strip(r.run(`$('receiptQuantityRows').innerHTML`).match(/<div id="lineCheckRef_1_0"[\s\S]*?<\/button><\/div>/)[0]), /נספר יחד עם תעודה 1, שורה 1 הצג$/, 'ההפניה — בלי סטטוס');
  assert.equal(progress(r), 'סומנו 0 מתוך 5 שורות');
  // "אחרת" 10 מתוך 17 (מתחלק 10 + 0) — הביטול מנקה את שתיהן
  click(r, { lineMark: '0:0:qty' }); type(r, { lineGot: '0:0' }, '10');
  assert.deepEqual(marks(r), ['qty:10,,,,', 'qty:0,']);
  click(r, { lineClear: '0:0' });
  assert.deepEqual(marks(r), [',,,,', ',']); assert.deepEqual(snapshot(r), before);
});

test('5. "אחרת": הביטול מנקה גם את מה שהוקלד; "הגיע" אחרי הביטול — כרגיל', async () => {
  const r = await onePaper();
  r.run('startReceiptLineCheck()');
  const before = snapshot(r);
  click(r, { lineMark: '0:2:qty' }); type(r, { lineGot: '0:2' }, '3');
  assert.deepEqual(marks(r), [',,qty:3,,']); assert.equal(progress(r), 'סומנו 1 מתוך 5 שורות · חוסר 1 יח׳');
  click(r, { lineClear: '0:2' });
  assert.deepEqual(marks(r), [',,,,']); assert.equal(progress(r), 'סומנו 0 מתוך 5 שורות', 'גם החוסר ירד מהמונה');
  assert.doesNotMatch(row(r, 0, 2), /data-line-got|data-line-clear/, 'בלי שדה הכמות');
  assert.deepEqual(snapshot(r), before);
  // שדה ריק (לחצו "אחרת" ולא הקלידו), ואותיות
  click(r, { lineMark: '0:2:qty' }); click(r, { lineClear: '0:2' });
  assert.deepEqual(marks(r), [',,,,']);
  click(r, { lineMark: '0:2:qty' }); type(r, { lineGot: '0:2' }, 'אב'); click(r, { lineClear: '0:2' });
  assert.deepEqual(marks(r), [',,,,']); assert.deepEqual(snapshot(r), before);
  // אחרי הביטול — "הגיע" מקפל כרגיל, ו"אחרת" נפתחת עם שדה ריק (לא עם מה שהוקלד קודם)
  click(r, { lineMark: '0:2:qty' });
  assert.match(row(r, 0, 2), /data-line-got="0:2"[^>]*value=""/);
  click(r, { lineMark: '0:2:ok' });
  assert.deepEqual(marks(r), [',,ok,,']); assert.doesNotMatch(row(r, 0, 2), /data-line-mark=/);
});

test('6. "סיום" אחרי ביטול מביא לשורה שבוטלה; אחרי שסומנה שוב — נשמר כמו בלי הביטול', async () => {
  const markAll = r => review(r).docs.forEach((d, di) => d.lines.forEach((l, li) => { if (!l.mark) click(r, { lineMark: di + ':' + li + ':ok' }); }));
  const a = await onePaper();
  a.run('startReceiptLineCheck()');
  markAll(a);
  assert.equal(finish(a), 'סיום — שמור את הבדיקה');
  click(a, { lineOpen: '0:3' }); click(a, { lineClear: '0:3' });
  assert.equal(finish(a), 'סיום (נשארו 1)');
  assert.equal(a.run('finishReceiptLineCheck()'), false, 'אי אפשר לסיים עם שורה שבוטלה');
  assert.equal(progress(a), 'נשארה שורה אחת בלי סימון — סמן בכל שורה: הגיע, כמות אחרת או לא הגיע');
  assert.equal(a.run(`$('lineCheck_0_3').classList.contains('ring-4')`), true, 'השורה שבוטלה מודגשת');
  // סומנה שוב ("אחרת" 4 מתוך 5) — מול בדיקה שבה סומנה כך מההתחלה
  click(a, { lineMark: '0:3:qty' }); type(a, { lineGot: '0:3' }, '4');
  const b = await onePaper();
  b.run('startReceiptLineCheck()');
  click(b, { lineMark: '0:3:qty' }); type(b, { lineGot: '0:3' }, '4'); markAll(b);
  assert.deepEqual(snapshot(a), snapshot(b), 'אותה בדיקה בדיוק');
  assert.equal(a.run('finishReceiptLineCheck()'), true); assert.equal(b.run('finishReceiptLineCheck()'), true);
  assert.deepEqual(json(a, 'receiptList'), json(b, 'receiptList'));
  assert.deepEqual(json(a, 'receiptList.map(l => l.productId + " " + l.qty).sort()'), ['code_101 12', 'code_1231 6', 'code_238 4', 'code_2381 4', 'code_2387 3']);
});

test('7. הכרטיס שמעל המצלמה — בלי "בטל סימון"; אחרי ביטול, סריקה של המוצר היא סריקה ראשונה', async () => {
  const r = await onePaper();
  r.run(`window.BarcodeDetector = class { detect() { return Promise.resolve([]); } };
    navigator.mediaDevices = { getUserMedia: async () => ({ getTracks: () => [], getVideoTracks: () => [] }) };
    $('scanVideo').play = async () => {};`);
  r.run('startReceiptLineCheck()');
  click(r, { lineMark: '0:1:ok' }); click(r, { lineOpen: '0:1' }); click(r, { lineClear: '0:1' });
  r.events.get('receiptLineScan:click')(); await settle();
  assert.equal(r.run('scanPurpose'), 'linecheck');
  r.run(`onScanned('498256')`); // לחמניות 10 בשקית
  const card = r.run(`$('scanLineCard').innerHTML`);
  assert.deepEqual(json(r, '[receiptLineScanCard.kind, receiptLineScanCard.di, receiptLineScanCard.li, receiptLineScanCard.addQty]'), ['line', 0, 1, false], 'לא "עוד כמה?" — השורה אינה מסומנת');
  assert.match(strip(card), /6 יח׳ בתעודה הגיע 6 אחרת לא הגיע$/);
  assert.doesNotMatch(card, /data-line-clear|בטל סימון/);
});

test('8. הגרסה עלתה ל-170, כולל ההערה ב-service worker', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /const APP_VERSION = '170'/);
  assert.match(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), /גרסת אפליקציה 170/);
});
