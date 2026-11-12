// v162 — מעבר מסריקה לבדיקה שורה-שורה: מה שנסרק עובר לרשימה (כמו ביטבתה 410 ותנובה 155). 8.11.2026, בעל העסק באמצע קליטה
// אמיתית: "אם כבר התחלתי סריקת מוצרים אני יכול לעבור לבדיקת שורה-שורה והמוצרים שסרקתי יעברו לרשימה?" עד כאן השורות נפתחו
// ריקות והספירה הוחלפה ב"סיום". אותם נתונים כמו ב-v154: תעודת משלוח (5 שורות) ונייר "ת.משלוח" קטן (אחיד פרוס ×5, אסלי ×2) —
// אחיד פרוס (12 + 5) ואסלי (4 + 2) בשניהם.
// מה שנבדק:
// 1. הכלל: נסרק בדיוק כמו בתעודה — "הגיע" (גם מוצר בשני ניירות שנסרק בסך שניהם); שורה אחת בכמות אחרת — "אחרת" עם המספר;
//    מוצר שאינו בניירות — "הגיע משהו נוסף" כמו קודם; המונה, השורות המקופלות והפתוחות, ושאלת האישור.
// 2. מוצר בשני ניירות שנסרק בכמות שאינה הסך — נשאר פתוח, בלי ניחוש, עם ההערה כמה נסרק; אחרי "הנייר הזה לא שלנו" הוא שורה
//    אחת, והסימון מתיישב לבד.
// 3. מה שכבר סומן לא נדרס: חזרה לבדיקה (resume) ובדיקה חדשה אחרי שהקליטה השתנתה שומרות את הסימונים; רק שורות פתוחות
//    מקבלות את מה שנסרק. בלי סריקה — כלום לא מסומן מראש (כמו קודם).
// 4. שוויון: בדיקה שהתחילה מסריקה ובדיקה שסומנה כולה ביד — אותן שורות, אותה ספירה ואותה קליטה שמורה.
// 5. הגרסה.
// הרצה: TZ=Asia/Jerusalem node --test tests/line-check-carry.test.mjs
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { app, delivery, printed, now, readPapers, receive, state } from './one-button-helpers.mjs';

const BIG = '244785003', SMALL = '290096103';
const json = (r, e) => JSON.parse(r.run('JSON.stringify(' + e + ')'));
const strip = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const settle = async () => { for (let i = 0; i < 30; i++) await new Promise(res => setImmediate(res)); };
function small(number = SMALL) {
  const p = delivery(number, { internalNumber: null, headerText: 'ת.משלוח', docDate: printed(now) });
  const rows = p.scan.documents[0].rows;
  p.scan.documents[0].rows = [{ ...rows[0], quantity: 5, lineNumber: 1 }, { ...rows[2], quantity: 2, lineNumber: 2 }];
  Object.assign(p.scan.documents[0], { totalUnits: 7, printedLines: 2 });
  return p;
}
async function twoPapers(opts) {
  const r = app(delivery(BIG), opts);
  await receive(r, 1, 0, { count: false }); // v171: הניירות נקראו במסך הניירות (בלי "התחל לסרוק עכשיו") — התעודה כבר בקליטה כשהבדיקה נפתחת
  r.serve(small());
  await readPapers(r, 1, 1);
  assert.deepEqual(state(r).nums, [BIG, SMALL], 'שתי התעודות בקליטה');
  r.run(`currentView = 'receiving'; mainMode = 'receiving';`);
  return r;
}
// מה שנסרק בקליטה בסריקה (כמה מכל מוצר), ואז "בדוק שורה-שורה בטלפון" עם אישור השאלה
function scannedThen(r, list) {
  r.run(`receiptList = ${JSON.stringify(list)}.map(([id, qty]) => { const p = products.find(x => x.id === id); return { productId: id, name: p.name, barcode: p.barcode, qty }; }); saveReceiptDraft(); receiptCountingMode = 'scan'; testConfirms = [];`);
  r.run('startReceiptLineCheck()');
  const confirms = json(r, 'testConfirms');
  assert.equal(confirms.length, 1, 'שאלה אחת'); assert.equal(r.run('receiptQuantityReview'), null, 'לפני האישור — כלום');
  r.run('testConfirms[testConfirms.length - 1].cb()');
  return confirms[0];
}
const click = (r, dataset) => r.run(`receiptLineCheckClick({ target: { closest: () => ({ dataset: ${JSON.stringify(dataset)} }) } })`);
const type = (r, dataset, value) => r.run(`receiptLineCheckInput({ target: { dataset: ${JSON.stringify(dataset)}, value: ${JSON.stringify(value)} } })`);
const review = r => json(r, 'receiptQuantityReview');
const marks = r => review(r).docs.map(d => d.lines.map(l => l.mark + (l.got ? ':' + l.got : '')).join(','));
const rows = r => r.run(`$('receiptQuantityRows').innerHTML`);
const progress = r => r.run(`$('receiptQuantityProgress').textContent`);
function markRestOk(r) { review(r).docs.forEach((d, di) => d.lines.forEach((l, li) => { if (!l.mark) click(r, { lineMark: di + ':' + li + ':ok' }); })); }
async function saveAfterCheck(r) {
  if (r.run('currentView') === 'reconcile') r.run('aiApplyInvoiceResult()');
  assert.ok(r.run('!!pendingReceipt'), 'הסיכום פתוח');
  await r.run('confirmReceipt()'); await settle();
  return json(r, 'receipts[0]');
}
const items = rc => rc.items.map(l => [l.productId, l.qty, l.noteQty == null ? null : l.noteQty]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));

test('1. הכלל: כמו בתעודה — "הגיע" (גם בשני ניירות יחד); שורה אחת בכמות אחרת — "אחרת" עם המספר; לא בניירות — "נוסף"', async () => {
  const r = await twoPapers();
  // אחיד פרוס 17 = 12 + 5; לחמניות 6 = 6; אסלי 6 = 4 + 2; פרימיום 3 מתוך 5; עננים 4 מתוך 3; לחם מלא — לא בניירות
  const ask = scannedThen(r, [['code_101', 17], ['code_1231', 6], ['code_238', 6], ['code_2381', 3], ['code_2387', 4], ['code_119', 2]]);
  assert.equal(ask.title, 'בדיקה שורה-שורה'); assert.equal(ask.label, 'התחל בדיקה');
  assert.match(ask.message, /^כבר נספרו \S+ יח׳ — הם עוברים לרשימה: מוצר שנסרק בדיוק כמו בתעודה מסומן "הגיע", כמות אחרת מסומנת "אחרת" עם המספר, והשאר ממתינים לסימון\. מה שנספר ואינו בתעודות יופיע ב"הגיע משהו נוסף"\. בסיום, הספירה היא מה שסומן בשורות\.$/);
  assert.equal(review(r).mode, 'lines');
  assert.deepEqual(marks(r), ['ok,ok,ok,qty:3,qty:4', 'ok,ok'], 'אחיד פרוס ואסלי בשני הניירות — "הגיע" בשניהם; פרימיום ועננים — "אחרת" עם מה שנסרק');
  assert.deepEqual(review(r).extras.map(x => [x.productId, x.got]), [['code_119', '2']]);
  assert.equal(progress(r), 'כל 5 שורות סומנו — אפשר לסיים · חוסר 2 יח׳ · עודף 3 יח׳'); // v164: 5 מוצרים — 5 שורות (אחיד פרוס ואסלי פעם אחת)
  const html = rows(r);
  assert.match(strip(html), /אחיד פרוס ברמן הגיע · 17 יח׳ ב-2 תעודות אין מחיר קופה — אפשר להשלים כאן כמה עובר בקופה \(כולל מע״מ\) ₪ שנה/, 'שורה שסומנה "הגיע" — מקופלת, כמו סימון ביד; v164: הקבוצה של שני הניירות');
  assert.match(strip(html), /לחמניות 10 בשקית הגיע · 6 יח׳ אין מחיר קופה — אפשר להשלים כאן כמה עובר בקופה \(כולל מע״מ\) ₪ שנה/);
  assert.match(html, /data-line-got="0:3"[^>]*value="3"/, '"אחרת" פתוחה עם המספר שנסרק');
  assert.match(html, /id="lineCheckSum_0_3"[^>]*>התקבלו 3 · חוסר 2</);
  assert.match(html, /id="lineCheckSum_0_4"[^>]*>התקבלו 4 · עודף 1</);
  assert.doesNotMatch(strip(html), /נסרקו \d+ יח׳ מהמוצר/, 'ההערה — רק למוצר בכמה ניירות שלא התיישב');
  assert.equal(r.run('receiptList.length'), 6, 'הספירה עצמה לא השתנתה עד "סיום"');
  // אפשר לשנות כל סימון שהגיע מהסריקה, כמו כל סימון (v164: אחיד פרוס — קבוצה אחת; "אחרת" 5 מתחלקת 5 בנייר הראשון, 0 בשני)
  click(r, { lineMark: '0:0:qty' }); type(r, { lineGot: '0:0' }, '5');
  assert.deepEqual(marks(r), ['qty:5,ok,ok,qty:3,qty:4', 'qty:0,ok']);
  // "סיום" — מה שסומן (כולל מה שהגיע מהסריקה), ואותה דרך כמו תמיד
  assert.equal(r.run('finishReceiptLineCheck()'), true);
  assert.deepEqual(json(r, 'receiptList.map(l => l.productId + " " + l.qty).sort()'), ['code_101 5', 'code_119 2', 'code_1231 6', 'code_238 6', 'code_2381 3', 'code_2387 4']);
  // בלי סריקה — כלום לא מסומן מראש ובלי שאלה, כמו קודם
  const plain = await twoPapers();
  plain.run('testConfirms = []; startReceiptLineCheck()');
  assert.equal(plain.run('testConfirms.length'), 0);
  assert.deepEqual(marks(plain), [',,,,', ',']);
  assert.equal(progress(plain), 'סומנו 0 מתוך 5 שורות');
});

test('2. מוצר בשני ניירות שנסרק בכמות שאינה הסך — v164: קבוצה אחת "אחרת" עם המספר, מחולק לפי הסדר; אחרי "לא שלנו" הוא שורה אחת ומתיישב לבד', async () => {
  const r = await twoPapers();
  scannedThen(r, [['code_101', 12], ['code_1231', 6]]); // אחיד פרוס: 12 מול 12 + 5
  assert.deepEqual(marks(r), ['ok,ok,,,', 'none,'], 'אחיד פרוס: 12 בנייר הראשון (מלא — "הגיע"), 0 בשני ("לא הגיע"); הקבוצה — 12 מתוך 17');
  const html = rows(r);
  assert.match(strip(html), /אחיד פרוס ברמן .* 17 יח׳ ב-2 תעודות 12 \+ 5 הגיע 17 אחרת לא הגיע כמה הגיע\? התקבלו 12 · חוסר 5/, 'הקבוצה פתוחה — "אחרת" עם 12, והחוסר מול העיניים');
  assert.match(html, /data-line-got="0:0"[^>]*value="12"/);
  assert.match(strip(html), /שורה 1 בתעודה אחיד פרוס ברמן · 5 יח׳ נספר יחד עם תעודה 1, שורה 1 · התקבלו 12 מתוך 17 הצג/, 'בנייר הקטן — שורת הפניה, לא כרטיס');
  assert.doesNotMatch(strip(html), /נסרקו \d+ יח׳ מהמוצר/);
  assert.equal(progress(r), 'סומנו 2 מתוך 5 שורות · חוסר 5 יח׳');
  // "הנייר הזה לא שלנו" על הנייר הקטן — אחיד פרוס נשאר בשורה אחת של 12, והסריקה (12) מתיישבת: "הגיע"
  click(r, { lineDrop: '1' }); click(r, { lineDropYes: '1' }); await settle();
  assert.equal(review(r).docs.length, 1);
  assert.deepEqual(marks(r), ['ok,ok,,,']);
  assert.doesNotMatch(strip(rows(r)), /נספר יחד עם|data-line-show/);
});

test('3. מה שכבר סומן לא נדרס: חזרה לבדיקה ובדיקה חדשה אחרי שינוי בקליטה שומרות את הסימונים; רק שורות פתוחות מקבלות את הסריקה', async () => {
  const r = await twoPapers();
  scannedThen(r, [['code_1231', 6], ['code_2381', 1]]);
  assert.deepEqual(marks(r), [',ok,,qty:1,', ',']);
  // המשתמש משנה: לחמניות "לא הגיע", פרימיום "הגיע"; "חזרה" ופתיחה מחדש — המשך מאותו מקום (resume), בלי שאלה ובלי דריסה
  click(r, { lineMark: '0:1:none' }); click(r, { lineMark: '0:3:ok' });
  r.run('closeReceiptQuantityReview(); startReceiptLineCheck()');
  assert.equal(r.run('testConfirms.length'), 1, 'בלי שאלה נוספת');
  assert.deepEqual(marks(r), [',none,,ok,', ',']);
  // בדיקה חדשה כי הקליטה השתנתה (מוצר נוסף נסרק בינתיים): הסימונים נשארים, ורק שורות פתוחות מקבלות את מה שנסרק
  r.run(`closeReceiptQuantityReview(); receiptList = receiptList.concat([{ productId: 'code_2387', name: 'פיתות עננים 8', barcode: '4033057', qty: 3 }]); saveReceiptDraft(); startReceiptLineCheck();`);
  assert.equal(r.run('testConfirms.length'), 2, 'הקליטה השתנתה — שאלה חדשה');
  r.run('testConfirms[testConfirms.length - 1].cb()');
  assert.deepEqual(marks(r), [',none,,ok,ok', ','], 'לחמניות ופרימיום כמו שסומנו ביד (גם שפרימיום נסרק 1 ועכשיו מסומן "הגיע"); עננים 3 = 3 — "הגיע"');
});

test('4. שוויון: בדיקה שהתחילה מסריקה ובדיקה שסומנה כולה ביד — אותן שורות, אותה ספירה ואותה קליטה שמורה', async () => {
  // א: נסרקו לחמניות 4 (מתוך 6), אסלי 6 (4 + 2), עננים 3; אחיד פרוס ופרימיום סומנו ביד "הגיע"
  const a = await twoPapers();
  scannedThen(a, [['code_1231', 4], ['code_238', 6], ['code_2387', 3]]);
  assert.deepEqual(marks(a), [',qty:4,ok,,ok', ',ok']);
  markRestOk(a);
  // ב: הכול ביד
  const b = await twoPapers();
  b.run('startReceiptLineCheck()');
  click(b, { lineMark: '0:1:qty' }); type(b, { lineGot: '0:1' }, '4'); markRestOk(b);
  const pick = r => json(r, '({ docs: receiptQuantityReview.docs, extras: receiptQuantityReview.extras, rows: receiptQuantityReview.rows, products: receiptQuantityReview.products })');
  assert.deepEqual(pick(a), pick(b), 'אותה בדיקה בדיוק');
  assert.equal(a.run('finishReceiptLineCheck()'), true); assert.equal(b.run('finishReceiptLineCheck()'), true);
  assert.deepEqual(json(a, 'receiptList'), json(b, 'receiptList'));
  assert.deepEqual(json(a, 'receiptList.map(l => l.productId + " " + l.qty).sort()'), ['code_101 17', 'code_1231 4', 'code_238 6', 'code_2381 5', 'code_2387 3']);
  const savedA = await saveAfterCheck(a), savedB = await saveAfterCheck(b);
  assert.deepEqual(items(savedA), items(savedB));
  assert.deepEqual({ ...savedA.quantityCheck, confirmedAt: null }, { ...savedB.quantityCheck, confirmedAt: null }, 'מה שנשמר בקליטה — זהה, בלי שדה חדש');
  assert.ok(!JSON.stringify(savedA).includes('"scanned"'), 'ההערה (scanned) אינה נשמרת בקליטה');
  for (const k of ['noteParts', 'paperDocs', 'units', 'count', 'status', 'unresolvedUnitsGap', 'noDoc', 'vatPct']) assert.deepEqual(savedA[k], savedB[k], k);
});

test('5. הגרסה (162 ומעלה), כולל ההערה ב-service worker', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const v = html.match(/const APP_VERSION = '(\d+)'/)[1];
  assert.ok(Number(v) >= 162, v);
  assert.match(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), new RegExp('גרסת אפליקציה ' + v));
});
