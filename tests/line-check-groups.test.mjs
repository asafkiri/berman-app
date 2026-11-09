// v164 — בדיקה שורה-שורה: מוצר אחד — שורה אחת, גם כשהוא בשתי תעודות (כמו ביטבתה 412 ותנובה 157). בעל העסק, 9.11.2026: "אני
// עדיין לא בטוח מה נעשה כשיהיו שתי תעודות — זה נראה לי יסבך את כל המערכת". הסחורה על הרצפה לא אומרת לאיזה נייר היא שייכת,
// ולכן מוצר שבכמה ניירות הוא קבוצה אחת: כרטיס אחד עם הסך, והחלוקה בין הניירות אוטומטית — לפי הסדר, והחוסר על האחרון.
// אותם נתונים כמו ב-v154: תעודת משלוח (5 שורות, 30 יח׳) ונייר "ת.משלוח" קטן (אחיד פרוס ×5, אסלי ×2) — אחיד פרוס (12 + 5) ואסלי
// (4 + 2) בשניהם; 7 שורות בניירות, 5 מוצרים.
// מה שנבדק:
// 1. הרשימה: 5 שורות; אחיד פרוס — כרטיס אחד בתעודה 1 ("גם בתעודה 2 (5 יח׳)", "17 יח׳ ב-2 תעודות", "12 + 5", "הגיע 17"), ובנייר
//    הקטן שורת הפניה ("נספר יחד עם תעודה 1, שורה 1", "הצג"); כותרות הניירות — כמו שהן (5 שורות · 30 יח׳; 2 שורות · 7 יח׳).
// 2. סימון הקבוצה: "הגיע 17" — שתי השורות; "אחרת" 15 — מתחלק 12 + 3 (החוסר על האחרון), הסיכום "התקבלו 15 · חוסר 2", ואחרי
//    היציאה מהשדה השורה המלאה "הגיע"; "לא הגיע" — שתיהן; 20 — עודף 3 על האחרון; שורת ההפניה אומרת מה סומן.
// 3. "הצג" בשורת ההפניה — לכרטיס של הקבוצה.
// 4. "סיום": מה שנשמר — לכל שורה בכל נייר, עם split; הכרטיס בהיסטוריה — לפי החלוקה, עם ההערה שהיא אוטומטית.
// 5. המעבר מסריקה (162): מוצר בשני ניירות שנסרק בכמות חלקית — "אחרת" עם המספר, מחולק; בדיוק הסך — "הגיע" בשניהם.
// 6. טיוטה מגרסה קודמת שבה שורה אחת של המוצר סומנה והשנייה לא — מה שסומן הופך לסך של הקבוצה, גם בהמשך מאותו מקום.
// 7. "הנייר הזה לא שלנו": הנייר הראשון יוצא — השורה שנשארה (בנייר השני) שומרת את חלקה; השני יוצא — הראשונה שומרת את חלקה.
// 8. הגרסה.
// הרצה: TZ=Asia/Jerusalem node --test tests/line-check-groups.test.mjs
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
  await receive(r);
  r.serve(small());
  await readPapers(r, 1, 1);
  assert.deepEqual(state(r).nums, [BIG, SMALL], 'שתי התעודות בקליטה');
  r.run(`currentView = 'receiving'; mainMode = 'receiving';`);
  return r;
}
const click = (r, dataset) => r.run(`receiptLineCheckClick({ target: { closest: () => ({ dataset: ${JSON.stringify(dataset)} }) } })`);
const type = (r, dataset, value) => r.run(`receiptLineCheckInput({ target: { dataset: ${JSON.stringify(dataset)}, value: ${JSON.stringify(value)} } })`);
const blur = (r, lineGot) => r.events.get('receiptQuantityRows:focusout')({ target: { dataset: { lineGot } } });
const review = r => json(r, 'receiptQuantityReview');
const marks = r => review(r).docs.map(d => d.lines.map(l => l.mark + (l.got ? ':' + l.got : '')).join(','));
const rows = r => r.run(`$('receiptQuantityRows').innerHTML`);
const progress = r => r.run(`$('receiptQuantityProgress').textContent`);
// ה-HTML של שורה אחת (lineCheck_di_li, או lineCheckRef_di_li — שורת הפניה) — עד השורה הבאה או סוף התעודה
function block(r, id) {
  const h = rows(r), i = h.indexOf('<div id="' + id + '"');
  assert.ok(i >= 0, id + ' קיים');
  const ends = ['<div id="lineCheck_', '<div id="lineCheckRef_', '<section', '</section>'].map(s => h.indexOf(s, i + 10)).filter(x => x > 0);
  return h.slice(i, Math.min.apply(null, ends));
}
const row = (r, di, li) => block(r, 'lineCheck_' + di + '_' + li);
const ref = (r, di, li) => block(r, 'lineCheckRef_' + di + '_' + li);
function markRestOk(r) { review(r).docs.forEach((d, di) => d.lines.forEach((l, li) => { if (!l.mark) click(r, { lineMark: di + ':' + li + ':ok' }); })); }
async function saveAfterCheck(r) {
  if (r.run('currentView') === 'reconcile') r.run('aiApplyInvoiceResult()');
  assert.ok(r.run('!!pendingReceipt'), 'הסיכום פתוח');
  await r.run('confirmReceipt()'); await settle();
  return json(r, 'receipts[0]');
}

test('1. הרשימה: 5 שורות ל-7 שורות בשני ניירות — מוצר שבשניהם הוא כרטיס אחד עם הסך, ובנייר השני שורת הפניה', async () => {
  const r = await twoPapers();
  r.run('startReceiptLineCheck()');
  assert.deepEqual(json(r, 'receiptLineGroups(receiptQuantityReview).map(g => [g.key, g.productId, g.paperQty, g.lines.map(x => x.di + ":" + x.li).join(" ")])'), [
    ['0:0', 'code_101', 17, '0:0 1:0'], ['0:1', 'code_1231', 6, '0:1'], ['0:2', 'code_238', 6, '0:2 1:1'], ['0:3', 'code_2381', 5, '0:3'], ['0:4', 'code_2387', 3, '0:4']]);
  assert.equal(progress(r), 'סומנו 0 מתוך 5 שורות');
  assert.equal(r.run(`$('receiptQuantityConfirm').textContent`), 'סיום (נשארו 5)');
  const html = rows(r);
  assert.equal((html.match(/data-line-mark="\d+:\d+:ok"/g) || []).length, 5, 'חמישה כרטיסים');
  // הכרטיס של אחיד פרוס — בתעודה 1, עם הסך והחלוקה
  const a = row(r, 0, 0);
  assert.equal(strip(a), 'שורה 1 בתעודה · גם בתעודה 2 (5 יח׳) אחיד פרוס ברמן אין מחיר קופה — בדוק בקופה ועדכן 497112 · קוד 101 17 יח׳ ב-2 תעודות 12 + 5 הגיע 17 אחרת לא הגיע');
  assert.match(a, /data-line-mark="0:0:ok"/); assert.match(a, /data-line-mark="0:0:qty"/); assert.match(a, /data-line-mark="0:0:none"/);
  // בנייר הקטן — שורת הפניה, בלי כפתורים, עם "הצג" שמוביל לכרטיס
  const p = ref(r, 1, 0);
  assert.equal(strip(p), 'שורה 1 בתעודה אחיד פרוס ברמן · 5 יח׳ נספר יחד עם תעודה 1, שורה 1 הצג');
  assert.doesNotMatch(p, /data-line-mark|data-line-got/);
  assert.match(p, /data-line-show="lineCheck_0_0"/);
  assert.equal(strip(ref(r, 1, 1)), 'שורה 2 בתעודה ברמן אסלי 5 פיתות · 2 יח׳ נספר יחד עם תעודה 1, שורה 3 הצג');
  assert.match(strip(row(r, 0, 2)), /^שורה 3 בתעודה · גם בתעודה 2 \(2 יח׳\) ברמן אסלי 5 פיתות .* 6 יח׳ ב-2 תעודות 4 \+ 2 הגיע 6 אחרת לא הגיע$/);
  // מוצר בנייר אחד — כמו קודם
  assert.match(strip(row(r, 0, 1)), /^שורה 2 בתעודה לחמניות 10 בשקית .* 6 יח׳ בתעודה הגיע 6 אחרת לא הגיע$/);
  assert.doesNotMatch(strip(row(r, 0, 1)), /גם בתעודה|ב-2 תעודות/);
  // כותרות הניירות — כמו שהן: הנייר הקטן עדיין "2 שורות · 7 יח׳", גם ששורותיו נספרות למעלה
  assert.match(strip(html), /תעודה 1 מתוך 2 תעודת משלוח 244785003 5 שורות · 30 יח׳/);
  assert.match(strip(html), /תעודה נפרדת תעודה 2 מתוך 2 ת\.משלוח 290096103 2 שורות · 7 יח׳/);
  assert.doesNotMatch(strip(html), /שורה נוספת|סרוק שוב|נסרקו \d+ יח׳ מהמוצר/);
  // הנתונים — עדיין שורה לכל נייר (מה שנשמר אינו משתנה במבנה)
  assert.deepEqual(review(r).docs.map(d => d.lines.map(l => l.productId + '×' + l.paperQty).join(' ')), ['code_101×12 code_1231×6 code_238×4 code_2381×5 code_2387×3', 'code_101×5 code_238×2']);
});

test('2. סימון הקבוצה: "הגיע 17" לשתי השורות; "אחרת" 15 מתחלק 12 + 3 והחוסר על האחרון; "לא הגיע" לשתיהן; 20 — עודף על האחרון', async () => {
  const r = await twoPapers();
  r.run('startReceiptLineCheck()');
  click(r, { lineMark: '0:0:ok' });
  assert.deepEqual(marks(r), ['ok,,,,', 'ok,']);
  assert.equal(strip(row(r, 0, 0)), 'אחיד פרוס ברמן הגיע · 17 יח׳ ב-2 תעודות שנה', 'מקופל, עם הסך');
  assert.equal(strip(ref(r, 1, 0)), 'שורה 1 בתעודה אחיד פרוס ברמן · 5 יח׳ נספר יחד עם תעודה 1, שורה 1 · ✓ הגיע הצג');
  assert.equal(progress(r), 'סומנו 1 מתוך 5 שורות');
  // "אחרת" 15: תוך כדי הקלדה — 12 + 3 בנתונים (עדיין "אחרת" בשתיהן — v163), הסיכום על הסך, הכרטיס כתום
  click(r, { lineOpen: '0:0' }); click(r, { lineMark: '0:0:qty' });
  assert.match(row(r, 0, 0), /data-line-got="0:0"[^>]*value=""/);
  type(r, { lineGot: '0:0' }, '15');
  assert.deepEqual(marks(r), ['qty:12,,,,', 'qty:3,'], 'ממלאים לפי הסדר: 12 בראשון, 3 בשני');
  assert.equal(r.run(`$('lineCheckSum_0_0').textContent`), 'התקבלו 15 · חוסר 2');
  assert.match(r.run(`$('lineCheck_0_0').className`), /border-amber-300 bg-amber-50$/);
  assert.equal(progress(r), 'סומנו 1 מתוך 5 שורות · חוסר 2 יח׳');
  // יציאה מהשדה — השורה שהתמלאה בדיוק נהיית "הגיע"; הקבוצה עדיין "אחרת" עם 15
  blur(r, '0:0');
  assert.deepEqual(marks(r), ['ok,,,,', 'qty:3,']);
  click(r, { lineMark: '0:1:ok' }); // ציור מחדש
  const a = row(r, 0, 0);
  assert.match(a, /data-line-got="0:0"[^>]*value="15"/, 'השדה — הסך של הקבוצה');
  assert.match(a, /data-line-mark="0:0:qty" aria-pressed="true"/);
  assert.equal(r.run(`$('lineCheckSum_0_0').textContent`), 'התקבלו 15 · חוסר 2');
  assert.equal(strip(ref(r, 1, 0)), 'שורה 1 בתעודה אחיד פרוס ברמן · 5 יח׳ נספר יחד עם תעודה 1, שורה 1 · התקבלו 15 מתוך 17 הצג');
  assert.equal(progress(r), 'סומנו 2 מתוך 5 שורות · חוסר 2 יח׳');
  // "לא הגיע" — שתי השורות
  click(r, { lineMark: '0:0:none' });
  assert.deepEqual(marks(r), ['none,ok,,,', 'none,']);
  assert.equal(strip(row(r, 0, 0)), 'אחיד פרוס ברמן לא הגיע · 0 מתוך 17 שנה');
  assert.equal(strip(ref(r, 1, 0)), 'שורה 1 בתעודה אחיד פרוס ברמן · 5 יח׳ נספר יחד עם תעודה 1, שורה 1 · ✗ לא הגיע הצג');
  // 20 — העודף (3) על האחרון
  click(r, { lineOpen: '0:0' }); click(r, { lineMark: '0:0:qty' }); type(r, { lineGot: '0:0' }, '20'); blur(r, '0:0');
  assert.deepEqual(marks(r), ['ok,ok,,,', 'qty:8,']);
  assert.equal(progress(r), 'סומנו 2 מתוך 5 שורות · עודף 3 יח׳');
  // השורות לכל מוצר (rows) — לפי הסך, כמו "יש חוסרים או עודפים"
  assert.equal(json(r, 'receiptQuantityReview.rows.find(x => x.productId === "code_101")').kind, 'surplus');
  assert.equal(json(r, 'receiptQuantityReview.rows.find(x => x.productId === "code_101")').difference, '3');
});

test('3. "הצג" בשורת ההפניה — גלילה לכרטיס של הקבוצה והדגשה שלו', async () => {
  const r = await twoPapers();
  r.run('startReceiptLineCheck()');
  click(r, { lineShow: 'lineCheck_0_0' });
  assert.equal(r.run(`$('lineCheck_0_0').classList.contains('ring-4')`), true);
  assert.equal(r.run(`$('lineCheck_0_0').classList.contains('ring-blue-300')`), true);
  assert.deepEqual(marks(r), [',,,,', ','], 'הצגה אינה סימון');
});

test('4. "סיום": מה שנשמר — לכל שורה בכל נייר לפי החלוקה, עם split; הכרטיס בהיסטוריה אומר שהחלוקה אוטומטית', async () => {
  const r = await twoPapers();
  r.run('startReceiptLineCheck()');
  click(r, { lineMark: '0:0:qty' }); type(r, { lineGot: '0:0' }, '15'); // אחיד פרוס 15 מתוך 17
  markRestOk(r);
  assert.equal(progress(r), 'כל 5 שורות סומנו — אפשר לסיים · חוסר 2 יח׳');
  assert.equal(r.run('finishReceiptLineCheck()'), true);
  assert.deepEqual(json(r, 'receiptList.map(l => l.productId + " " + l.qty)'), ['code_101 15', 'code_1231 6', 'code_238 6', 'code_2381 5', 'code_2387 3']);
  const saved = await saveAfterCheck(r);
  assert.deepEqual(saved.quantityCheck.papers, [
    { number: BIG, lines: [{ productId: 'code_101', paperQty: 12, got: 12, split: true }, { productId: 'code_1231', paperQty: 6, got: 6 }, { productId: 'code_238', paperQty: 4, got: 4, split: true }, { productId: 'code_2381', paperQty: 5, got: 5 }, { productId: 'code_2387', paperQty: 3, got: 3 }] },
    { number: SMALL, lines: [{ productId: 'code_101', paperQty: 5, got: 3, split: true }, { productId: 'code_238', paperQty: 2, got: 2, split: true }] }], 'החוסר (2) על הנייר האחרון');
  assert.deepEqual(saved.quantityCheck.differences, [{ productId: 'code_101', paperQty: 17, received: 15 }]);
  r.context.SAVED = saved;
  const sec = json(r, 'receiptPaperSections(SAVED)');
  assert.equal(sec.split, true);
  assert.deepEqual(sec.sections.map(s => s.rows.map(x => x.name + ' ' + x.got + '/' + x.billed).join(' | ')), [
    'אחיד פרוס ברמן 12/12 | לחמניות 10 בשקית 6/6 | ברמן אסלי 5 פיתות 4/4 | פיתות פרימיום 10 5/5 | פיתות עננים 8 3/3',
    'אחיד פרוס ברמן 3/5 | ברמן אסלי 5 פיתות 2/2']);
  r.run(`receipts = [SAVED]; receiptHistoryFilter = 'all'; ledgerInvalidate(); setView('receiptsHistory');`);
  const card = strip(r.run('app.innerHTML'));
  assert.match(card, /ת\.משלוח 290096103 · 2 שורות · 7 יח׳ אחיד פרוס ברמן 3 יח׳ \(חויב 5\) ברמן אסלי 5 פיתות 2 יח׳/);
  assert.match(card, /מוצר שמופיע בכמה תעודות נספר יחד, והחלוקה בין התעודות אוטומטית — לפי סדר התעודות, והחוסר על האחרונה\./);
  // קליטה עם נייר אחד — בלי ההערה
  const one = app(delivery(BIG));
  await receive(one);
  one.run(`currentView = 'receiving'; mainMode = 'receiving'; startReceiptLineCheck()`);
  markRestOk(one);
  assert.equal(one.run('finishReceiptLineCheck()'), true);
  const savedOne = await saveAfterCheck(one);
  assert.ok(!JSON.stringify(savedOne.quantityCheck).includes('split'), 'בלי מוצר בכמה ניירות — בלי split');
});

test('5. המעבר מסריקה (162) עם מוצר בשני ניירות: כמות חלקית — "אחרת" מחולקת; בדיוק הסך — "הגיע" בשניהם', async () => {
  const r = await twoPapers();
  r.run(`receiptList = [{ productId: 'code_101', name: 'אחיד פרוס ברמן', barcode: '497112', qty: 15 }, { productId: 'code_238', name: 'ברמן אסלי 5 פיתות', barcode: '497204', qty: 6 }]; saveReceiptDraft(); receiptCountingMode = 'scan';`);
  r.run('startReceiptLineCheck()');
  assert.equal(r.run('testConfirms.length'), 1); r.run('testConfirms[0].cb()');
  assert.deepEqual(marks(r), ['ok,,ok,,', 'qty:3,ok'], 'אחיד פרוס 15: 12 בראשון (מלא — "הגיע"), 3 בשני; אסלי 6 = 4 + 2: "הגיע" בשניהם');
  const a = row(r, 0, 0);
  assert.match(a, /data-line-got="0:0"[^>]*value="15"/); assert.match(a, /data-line-mark="0:0:qty" aria-pressed="true"/);
  assert.match(a, /id="lineCheckSum_0_0"[^>]*>התקבלו 15 · חוסר 2</);
  assert.equal(strip(row(r, 0, 2)), 'ברמן אסלי 5 פיתות הגיע · 6 יח׳ ב-2 תעודות שנה');
  assert.equal(progress(r), 'סומנו 2 מתוך 5 שורות · חוסר 2 יח׳');
  assert.doesNotMatch(strip(rows(r)), /נסרקו \d+ יח׳ מהמוצר/);
});

test('6. טיוטה מגרסה קודמת — שורה אחת של המוצר סומנה והשנייה לא: מה שסומן הופך לסך של הקבוצה, גם בהמשך מאותו מקום', async () => {
  const storage = new Map();
  const r = await twoPapers({ storage });
  r.run('startReceiptLineCheck()');
  // כמו שגרסה 163 הייתה שומרת: אחיד פרוס "הגיע" בתעודה הגדולה בלבד
  r.run(`receiptQuantityReview.docs[0].lines[0].mark = 'ok'; receiptQuantityReview.docs[0].lines[0].got = ''; saveReceiptDraft(); closeReceiptQuantityReview();`);
  r.run('startReceiptLineCheck()');
  assert.equal(r.run('testConfirms.length'), 0, 'המשך מאותו מקום');
  assert.deepEqual(marks(r), ['ok,,,,', 'none,'], 'הסך של מה שסומן — 12 מתוך 17: 12 בראשון, 0 בשני');
  assert.match(row(r, 0, 0), /data-line-got="0:0"[^>]*value="12"/);
  assert.match(row(r, 0, 0), /id="lineCheckSum_0_0"[^>]*>התקבלו 12 · חוסר 5</);
  // גם בפתיחה מחדש של האפליקציה
  const again = app(delivery(BIG), { storage });
  again.run(`currentView = 'receiving'; mainMode = 'receiving'; startReceiptLineCheck()`);
  assert.deepEqual(marks(again), ['ok,,,,', 'none,']);
});

test('7. "הנייר הזה לא שלנו": כל נייר שנשאר שומר את חלקו בחלוקה', async () => {
  // הנייר הקטן יוצא — נשארת שורת ה-12 (מלאה: "הגיע")
  const r = await twoPapers();
  r.run('startReceiptLineCheck()');
  click(r, { lineMark: '0:0:qty' }); type(r, { lineGot: '0:0' }, '15'); blur(r, '0:0');
  click(r, { lineDrop: '1' }); click(r, { lineDropYes: '1' }); await settle();
  assert.deepEqual(marks(r), ['ok,,,,']);
  assert.equal(strip(row(r, 0, 0)), 'אחיד פרוס ברמן הגיע · 12 יח׳ שנה');
  // הנייר הגדול יוצא — נשארת שורת ה-5 עם חלקה (3)
  const q = await twoPapers();
  q.run('startReceiptLineCheck()');
  click(q, { lineMark: '0:0:qty' }); type(q, { lineGot: '0:0' }, '15'); blur(q, '0:0');
  click(q, { lineDrop: '0' }); click(q, { lineDropYes: '0' }); await settle();
  assert.deepEqual(marks(q), ['qty:3,']);
  assert.match(strip(row(q, 0, 0)), /^שורה 1 בתעודה אחיד פרוס ברמן .* 5 יח׳ בתעודה הגיע 5 אחרת לא הגיע כמה הגיע\? התקבלו 3 · חוסר 2$/);
  assert.doesNotMatch(strip(rows(q)), /גם בתעודה|נספר יחד עם/);
});

test('8. הגרסה (164 ומעלה), כולל ההערה ב-service worker', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const v = html.match(/const APP_VERSION = '(\d+)'/)[1];
  assert.ok(Number(v) >= 164, v);
  assert.match(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), new RegExp('גרסת אפליקציה ' + v));
});
