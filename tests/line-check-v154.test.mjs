// v154 — בדיקה שורה-שורה בטלפון, לכל תעודה בנפרד; "הנייר הזה לא שלנו"; כרטיס הקליטה לפי תעודות.
// 26.10.2026: לקליטה נכנס נייר "ת.משלוח" קטן של חנות אחרת (מינימרקט אנג'לה, 3 שורות, 8 יח׳), ו"כל הכמויות תואמות"
// אישר גם אותו בלחיצה אחת. הנתונים כאן מומצאים, באותו מבנה: תעודת משלוח (5 שורות, 30 יח׳) ונייר קטן שאינו שלנו
// (אחיד פרוס ×5, ברמן אסלי 5 פיתות ×2 — אחיד פרוס ואסלי נמצאים גם בתעודה הגדולה).
// מה שנבדק:
// 1. הכפתור החדש בכל מקום שיש בו בדיקה ידנית; הכפתורים הקיימים — באותם טקסטים ובאותו סדר.
// 2. השורות של כל תעודה בנפרד (מוצר שבשתי תעודות — בכל אחת), בלי "סמן הכל"; "סיום" רק כשכל השורות סומנו.
// 3. "סיום" = בדיוק "יש חוסרים או עודפים" עם אותם הבדלים: אותה קליטה נשמרת, ורק תוספת של מה שסומן בכל תעודה.
// 4. "הנייר הזה לא שלנו": התעודה יוצאת מהקליטה (עוגנים, קריאה, מספרים), הנייר לסל המחזור, מה שסומן נשאר; כשל — כלום
//    לא משתנה; עם נייר אחד — אין כפתור.
// 5. הבדיקה נשמרת בטיוטה וממשיכה מאותו מקום; החלון חוזר בדיוק לבדיקה הקיימת; "הגיע משהו נוסף".
// 6. כרטיס הקליטה בהיסטוריה: לפי תעודה (מה שסומן, או לפי הסדר בלעדיו); תעודה אחת או מספרים שלא נסגרים — כמו קודם.
// הרצה: TZ=Asia/Jerusalem node --test tests/line-check-v154.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { app, delivery, printed, now, readPapers, receive, state } from './one-button-helpers.mjs';

const BIG = '244785003', SMALL = '290096103';
const json = (r, e) => JSON.parse(r.run('JSON.stringify(' + e + ')'));
const strip = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const settle = async () => { for (let i = 0; i < 30; i++) await new Promise(res => setImmediate(res)); };
// נייר "ת.משלוח" קטן (2900, בלי מספר פנימי): אחיד פרוס ×5, ברמן אסלי 5 פיתות ×2
function small(number = SMALL) {
  const p = delivery(number, { internalNumber: null, headerText: 'ת.משלוח', docDate: printed(now) });
  const rows = p.scan.documents[0].rows;
  p.scan.documents[0].rows = [{ ...rows[0], quantity: 5, lineNumber: 1 }, { ...rows[2], quantity: 2, lineNumber: 2 }];
  Object.assign(p.scan.documents[0], { totalUnits: 7, printedLines: 2 });
  return p;
}
// קליטה פתוחה עם שתי התעודות (הקטנה מתווספת לבד, כמו ב-26.10)
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
const marks = r => review(r).docs.map(d => d.lines.map(l => l.mark + (l.got ? ':' + l.got : '')).join(','));
// כל השורות "הגיע" — חוץ ממה שכבר סומן
function markRestOk(r) {
  review(r).docs.forEach((d, di) => d.lines.forEach((l, li) => { if (!l.mark) click(r, { lineMark: di + ':' + li + ':ok' }); }));
}
// מהבדיקה ועד השמירה, כמו בטלפון: מסך ההבדלים (אם יש) → "קלוט" → הסיכום → "אשר וקלוט"
async function saveAfterCheck(r) {
  if (r.run('currentView') === 'reconcile') r.run('aiApplyInvoiceResult()');
  assert.ok(r.run('!!pendingReceipt'), 'הסיכום פתוח');
  await r.run('confirmReceipt()'); await settle();
  return json(r, 'receipts[0]');
}
const items = rc => rc.items.map(l => [l.productId, l.qty, l.noteQty == null ? null : l.noteQty]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));

test('1. הכפתור החדש בכל מקום שיש בו בדיקה ידנית — והכפתורים הקיימים כמו שהיו', async () => {
  const r = await twoPapers();
  const open = r.run('receiptQuantityButtonsHtml()');
  assert.deepEqual([...open.matchAll(/data-role="(rc-quantity-[a-z]+)"/g)].map(m => m[1]), ['rc-quantity-lines', 'rc-quantity-all', 'rc-quantity-differences', 'rc-quantity-none'], 'החדש ראשון, ואחריו שלושת הקיימים');
  assert.match(strip(open), /בדקת ידנית את הכמויות מול התעודה\? בדוק שורה-שורה בטלפון כל הכמויות תואמות יש חוסרים או עודפים לא הגיע כלום — הכל חסר/);
  // מסך הבדיקה הידנית (אחרי שבחרו בה)
  r.run(`receiptCountingMode = 'manual'`);
  const manual = r.run('receiptQuantityButtonsHtml()');
  assert.match(strip(manual), /^בדוק שורה-שורה בטלפון בדקתי ידנית — כל הכמויות תואמות, המשך לקליטה בדקתי ידנית — יש חוסרים או עודפים לא הגיע כלום — הכל חסר$/);
  // אחרי שהתחילו לספור — בתוך "בדקת ידנית את הכמויות מול התעודה?"
  r.run(`receiptCountingMode = 'scan'; receiptList = [{ productId: 'code_101', name: 'אחיד פרוס ברמן', barcode: '', qty: 3 }];`);
  const folded = r.run('receiptQuantityButtonsHtml()');
  assert.match(folded, /<details data-quantity-picker/);
  assert.deepEqual([...folded.matchAll(/data-role="(rc-quantity-[a-z]+)"/g)].map(m => m[1]), ['rc-quantity-toggle', 'rc-quantity-lines', 'rc-quantity-all', 'rc-quantity-differences', 'rc-quantity-none']);
  // מסך הניירות — אותן בחירות, עם התפקיד שלו; ובלי roles.lines — כמו קודם
  assert.match(r.run(`quantityChoicesOpenHtml({ all: 'paper-quantity-all', diff: 'paper-quantity-differences', none: 'paper-none-arrived', lines: 'paper-quantity-lines' }, '')`), /data-role="paper-quantity-lines"/);
  assert.doesNotMatch(r.run(`quantityChoicesOpenHtml({ all: 'a', diff: 'b', none: 'c' }, '')`), /שורה-שורה/);
});

test('2. השורות של כל תעודה בנפרד; בלי "סמן הכל"; "סיום" רק כשכל השורות סומנו', async () => {
  const r = await twoPapers();
  r.run('startReceiptLineCheck()');
  const rv = review(r);
  assert.equal(rv.mode, 'lines'); assert.equal(r.run('receiptCountingMode'), 'manual');
  assert.deepEqual(rv.docs.map(d => [d.number, d.header, d.lines.map(l => l.productId + '×' + l.paperQty).join(' ')]), [
    [BIG, 'תעודת משלוח', 'code_101×12 code_1231×6 code_238×4 code_2381×5 code_2387×3'],
    [SMALL, 'ת.משלוח', 'code_101×5 code_238×2']], 'אחיד פרוס: 12 בתעודה ו-5 בנייר הקטן — לא 17 בשורה אחת');
  assert.equal(r.run(`$('receiptQuantityModal').classList.contains('hidden')`), false, 'החלון פתוח');
  assert.equal(r.run(`$('receiptQuantityTitle').textContent`), 'בדיקה שורה-שורה');
  assert.equal(r.run(`$('receiptQuantitySearch').classList.contains('hidden')`), true);
  assert.equal(r.run(`$('receiptQuantityProgress').textContent`), 'סומנו 0 מתוך 7 שורות');
  assert.equal(r.run(`$('receiptQuantityConfirm').textContent`), 'סיום (נשארו 7)');
  assert.match(r.run(`$('receiptQuantityConfirm').className`), /bg-slate-400/, 'אפור (ולא מושבת — v151)');
  const html = r.run(`$('receiptQuantityRows').innerHTML`);
  assert.match(strip(html), /תעודה 1 מתוך 2 תעודת משלוח 244785003 5 שורות · 30 יח׳ הנייר הזה לא שלנו/);
  assert.match(strip(html), /תעודה נפרדת תעודה 2 מתוך 2 ת\.משלוח 290096103 2 שורות · 7 יח׳ הנייר הזה לא שלנו/);
  assert.equal((html.match(/data-line-mark="\d+:\d+:ok"/g) || []).length, 7, 'שלוש בחירות לכל אחת מ-7 השורות');
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 0, 'אף שורה לא מסומנת מראש');
  assert.doesNotMatch(strip(html), /סמן הכל|הכל הגיע/);
  // "סיום" לפני שהכל סומן — לא נשמר כלום, ואומר מה נשאר (בחלון עצמו)
  click(r, { lineMark: '0:0:ok' });
  assert.equal(r.run('finishReceiptLineCheck()'), false);
  assert.equal(r.run(`$('receiptQuantityProgress').textContent`), 'נשארו 6 שורות בלי סימון — סמן בכל שורה: הגיע, כמות אחרת או לא הגיע');
  assert.equal(r.run(`$('lineCheck_0_1').classList.contains('ring-4')`), true, 'השורה הראשונה שנשארה — מסומנת');
  assert.equal(r.run('receiptList.length'), 0, 'הספירה לא השתנתה'); assert.equal(review(r).confirmedAt, null);
  // כמות אחרת בלי מספר — עדיין לא סומנה; עם מספר — כן
  click(r, { lineMark: '0:1:qty' });
  assert.equal(r.run(`$('receiptQuantityProgress').textContent`), 'סומנו 1 מתוך 7 שורות');
  type(r, { lineGot: '0:1' }, '4');
  assert.equal(r.run(`$('lineCheckSum_0_1').textContent`), 'התקבלו 4 · חוסר 2');
  assert.equal(r.run(`$('receiptQuantityProgress').textContent`), 'סומנו 2 מתוך 7 שורות · חוסר 2 יח׳', 'v159: המונה אומר גם מה סומן');
  type(r, { lineGot: '0:1' }, 'x'); assert.equal(r.run(`receiptLineGot(receiptQuantityReview.docs[0].lines[1])`), null, 'לא מספר — לא סומנה');
  type(r, { lineGot: '0:1' }, '6'); assert.equal(r.run(`$('lineCheckSum_0_1').textContent`), 'כמו בתעודה');
});

test('3. "סיום" עובר בדיוק כמו "יש חוסרים או עודפים": אותה קליטה נשמרת, ועוד מה שסומן בכל תעודה', async () => {
  // הבדיקה שורה-שורה: מהתעודה הגדולה הגיעו 10 אחיד פרוס מתוך 12; מהנייר הקטן אחיד פרוס לא הגיע
  const a = await twoPapers();
  a.run('startReceiptLineCheck()');
  click(a, { lineMark: '0:0:qty' }); type(a, { lineGot: '0:0' }, '10'); click(a, { lineMark: '1:0:none' }); markRestOk(a);
  assert.equal(a.run(`$('receiptQuantityConfirm').textContent`), 'סיום — שמור את הבדיקה');
  assert.equal(a.run('finishReceiptLineCheck()'), true);
  assert.equal(a.run(`$('receiptQuantityModal').classList.contains('hidden')`), true, 'החלון נסגר');
  const listA = json(a, 'receiptList');
  const savedA = await saveAfterCheck(a);
  // אותם הבדלים ב"יש חוסרים או עודפים" (הדרך הקיימת)
  const b = await twoPapers();
  b.run('startReceiptQuantityReview(false)');
  assert.equal(b.run(`$('receiptQuantityTitle').textContent`), 'חוסרים ועודפים');
  b.run(`const row = receiptQuantityReview.rows.find(x => x.productId === 'code_101'); row.kind = 'shortage'; row.difference = '7';`);
  assert.equal(b.run('commitReceiptQuantityReview()'), true);
  assert.deepEqual(listA, json(b, 'receiptList'), 'אותה ספירה');
  const savedB = await saveAfterCheck(b);
  assert.deepEqual(items(savedA), items(savedB), 'אותן שורות בקליטה');
  assert.deepEqual(items(savedA).find(x => x[0] === 'code_101'), ['code_101', 10, 17]);
  for (const k of ['noteParts', 'paperDocs', 'units', 'count', 'status', 'unresolvedUnitsGap', 'noDoc', 'vatPct']) assert.deepEqual(savedA[k], savedB[k], k);
  assert.deepEqual(savedA.quantityCheck.differences, savedB.quantityCheck.differences);
  assert.equal(savedA.quantityCheck.method, 'manual'); assert.equal(savedB.quantityCheck.byLine, undefined, 'הדרך הקיימת — בלי תוספת');
  assert.equal(savedA.quantityCheck.byLine, true);
  assert.deepEqual(savedA.quantityCheck.papers, [
    { number: BIG, lines: [{ productId: 'code_101', paperQty: 12, got: 10 }, { productId: 'code_1231', paperQty: 6, got: 6 }, { productId: 'code_238', paperQty: 4, got: 4 }, { productId: 'code_2381', paperQty: 5, got: 5 }, { productId: 'code_2387', paperQty: 3, got: 3 }] },
    { number: SMALL, lines: [{ productId: 'code_101', paperQty: 5, got: 0 }, { productId: 'code_238', paperQty: 2, got: 2 }] }]);
  assert.ok(!JSON.stringify(savedA.quantityCheck).includes('[['), 'בלי מערך בתוך מערך (Firestore)');
});

test('4. "הנייר הזה לא שלנו": התעודה יוצאת מהקליטה, הנייר נמחק כמו "מחק" רגיל, ומה שסומן נשאר', async () => {
  const r = await twoPapers();
  r.run('startReceiptLineCheck()');
  click(r, { lineMark: '0:0:ok' }); click(r, { lineMark: '0:1:qty' }); type(r, { lineGot: '0:1' }, '5'); click(r, { lineMark: '1:1:ok' });
  // שאלה בחלון עצמו (חלון האישור הרגיל נפתח מתחת לבדיקה)
  click(r, { lineDrop: '1' });
  assert.match(strip(r.run(`$('receiptQuantityRows').innerHTML`)), /להוציא את ת\.משלוח 290096103 מהקליטה\? השורות שלו לא ייספרו, והצילום שלו נמחק מהטלפון\. .* הוצא מהקליטה ביטול/);
  assert.equal(r.run('testConfirms.length'), 0);
  click(r, { lineDropNo: '1' });
  assert.doesNotMatch(r.run(`$('receiptQuantityRows').innerHTML`), /להוציא את/, '"ביטול" — כלום לא השתנה');
  assert.deepEqual(state(r).nums, [BIG, SMALL]);
  r.run('testWrites.length = 0');
  click(r, { lineDrop: '1' }); click(r, { lineDropYes: '1' });
  await settle();
  const s = state(r);
  assert.deepEqual(s.nums, [BIG], 'רק התעודה שלנו בקליטה');
  assert.deepEqual(s.notes, [{ amount: 219.92, units: 30, lines: 5, kind: 'charge' }], 'העוגנים — מהתעודה שנשארה');
  assert.deepEqual(s.per.map(p => [p.docIndex, p.paperId]), [[0, 'paper_' + BIG]]);
  assert.deepEqual(s.docs.map(d => [d.noteIndex, d.paperId, d.units, d.lines]), [[0, 'paper_' + BIG, 30, 5]]);
  assert.equal(s.basisOk, true); assert.equal(s.st, 'ok');
  assert.deepEqual(marks(r), ['ok,qty:5,,,'], 'מה שסומן בתעודה שנשארה — נשאר');
  assert.equal(r.run(`$('receiptQuantityProgress').textContent`), 'ת.משלוח 290096103 יצא מהקליטה, והצילום שלו נמחק מהטלפון');
  assert.doesNotMatch(r.run(`$('receiptQuantityRows').innerHTML`), /data-line-drop=/, 'תעודה אחת — בלי "לא שלנו"');
  // הנייר עוד לא הגיע לענן (נשמר בטלפון) — הצילום במכשיר מסומן "נמחק" (paperDiscard, כמו "מחק" רגיל); הענן — ב-4ג
  assert.equal(r.run(`Object.values(paperLocalResults()).some(x => x.paper && x.paper.id === 'paper_290096103' && x.discarded)`), true);
  assert.equal(r.run(`!!paperFind('paper_290096103')`), false);
  assert.equal(r.run(`Object.values(paperLocalResults()).some(x => x.paper && x.paper.id === 'paper_244785003' && x.discarded)`), false, 'התעודה שלנו — לא');
  // ומשם — רגיל: סיום ושמירה, עם תעודה אחת
  markRestOk(r);
  assert.equal(r.run('finishReceiptLineCheck()'), true);
  const saved = await saveAfterCheck(r);
  assert.deepEqual(saved.paperDocs.map(d => d.number), [BIG]);
  assert.deepEqual(saved.noteParts.map(n => n.units), [30]);
  assert.deepEqual(saved.paperScan.response.perDocument.map(p => p.paperId), ['paper_' + BIG]);
  assert.equal(saved.items.reduce((a, l) => a + l.qty, 0), 29, '30 בתעודה, ואחת שסומנה לפני היציאה כחסרה');
  assert.deepEqual(items(saved).find(x => x[0] === 'code_1231'), ['code_1231', 5, 6], 'מה שסומן לפני שהנייר יצא — נשמר');
  assert.ok(!['counted', 'in-receipt'].includes(r.run(`currentLedger().states['paper_290096103'] || ''`)), 'הנייר שיצא אינו נספר');
});

test('4ב. "לא שלנו" שנכשל — הקליטה בדיוק כמו שהייתה; עם נייר אחד — אין כפתור', async () => {
  const r = await twoPapers();
  r.run('startReceiptLineCheck()');
  const before = state(r);
  r.run(`bermanPaperAnchorsFromScan = () => { throw new Error('boom'); };`);
  assert.equal(r.run('receivingDropDeliveryDoc(1)'), null);
  assert.deepEqual(state(r), before, 'בלי שינוי');
  // נייר אחד
  const one = app(delivery(BIG));
  await receive(one);
  one.run(`currentView = 'receiving'; mainMode = 'receiving'; startReceiptLineCheck()`);
  assert.equal(review(one).docs.length, 1);
  assert.doesNotMatch(one.run(`$('receiptQuantityRows').innerHTML`), /data-line-drop=|לא שלנו|תעודה נפרדת/);
  assert.match(strip(one.run(`$('receiptQuantityRows').innerHTML`)), /^התעודה תעודת משלוח 244785003 5 שורות · 30 יח׳/);
  assert.equal(one.run('receivingDropDeliveryDoc(0)'), null, 'התעודה היחידה — לא יוצאת (מבטלים את הקליטה)');
});

test('5. נשמר בטיוטה וממשיך מאותו מקום; החלון חוזר בדיוק לבדיקה הקיימת; "הגיע משהו נוסף"', async () => {
  const storage = new Map();
  const r = await twoPapers({ storage });
  r.run('startReceiptLineCheck()');
  click(r, { lineMark: '0:0:ok' }); click(r, { lineMark: '1:0:none' });
  // פתיחה מחדש של האפליקציה באותו טלפון
  const again = app(delivery(BIG), { storage });
  assert.equal(again.run(`receiptQuantityReview && receiptQuantityReview.mode`), 'lines');
  again.run(`currentView = 'receiving'; mainMode = 'receiving'; startReceiptLineCheck()`);
  assert.equal(again.run('testConfirms.length'), 0, 'בלי שאלה');
  assert.deepEqual(marks(again), ['ok,,,,', 'none,'], 'מה שסומן — נשאר');
  // "חזרה" ו"יש חוסרים או עודפים" — החלון כמו שהיה תמיד
  again.run('closeReceiptQuantityReview(); startReceiptQuantityReview(false)');
  assert.equal(again.run(`$('receiptQuantityTitle').textContent`), 'חוסרים ועודפים');
  assert.equal(again.run(`$('receiptQuantityIntro').textContent`), 'סמן רק את ההפרשים שמצאת. בסיום תאשר ששאר הכמויות תואמות.');
  assert.equal(again.run(`$('receiptQuantitySearch').classList.contains('hidden')`), false);
  assert.equal(again.run(`$('receiptQuantityProgress').className`), 'hidden text-sm font-black text-slate-700 mt-2');
  assert.equal(again.run(`$('receiptQuantityConfirm').textContent`), 'אשר הפרשים — שאר הכמויות תואמות');
  assert.equal(again.run(`$('receiptQuantityConfirm').className`), 'btn-tap w-full bg-blue-600 text-white rounded-xl py-3 font-black text-base');
  assert.match(again.run(`$('receiptQuantityRows').innerHTML`), /data-quantity-kind=/, 'השורות של הבדיקה הקיימת');
  assert.equal(again.run('receiptQuantityReview.mode'), undefined);
  // "הגיע משהו נוסף": מה שנספר ואינו בתעודות נכנס לבד (אחרי שאלה), ומוצר נוסף מהחיפוש
  const x = await twoPapers();
  x.run(`receiptList = [{ productId: 'code_1231', name: 'לחמניות 10 בשקית', barcode: '', qty: 6 }, { productId: 'code_119', name: 'לחם מלא בטוב', barcode: '', qty: 2 }]; saveReceiptDraft();`);
  x.run('startReceiptLineCheck()');
  assert.match(json(x, 'testConfirms.map(c => c.message)').join(' '), /כבר נספרו 8 יח׳/);
  x.run('testConfirms[testConfirms.length - 1].cb()');
  assert.deepEqual(review(x).extras.map(e => [e.productId, e.got]), [['code_119', '2']], 'רק מה שאינו בתעודות');
  const other = x.run(`products.find(p => !['code_101','code_1231','code_238','code_2381','code_2387','code_119'].includes(p.id) && p.name).id`);
  click(x, { extraAdd: other }); type(x, { extraGot: '1' }, '3');
  markRestOk(x);
  assert.equal(x.run('finishReceiptLineCheck()'), true);
  const rows = json(x, 'receiptQuantityReview.rows.filter(r => r.paperQty === 0).map(r => [r.productId, r.kind, r.difference])');
  assert.deepEqual(rows, [['code_119', 'surplus', '2'], [other, 'surplus', '3']]);
});

test('6. כרטיס הקליטה בהיסטוריה: לפי תעודה, ובלי חלוקה — בדיוק כמו קודם', async () => {
  const r = await twoPapers();
  r.run('startReceiptLineCheck()');
  // אחיד פרוס: מהתעודה הגדולה לא הגיע כלום, מהנייר הקטן הגיעו כל ה-5
  click(r, { lineMark: '0:0:none' }); markRestOk(r);
  assert.equal(r.run('finishReceiptLineCheck()'), true);
  const saved = await saveAfterCheck(r);
  r.context.SAVED = saved;
  const sec = json(r, 'receiptPaperSections(SAVED)');
  assert.deepEqual(sec.sections.map(s => [s.number, s.header, s.lineCount, s.units, s.rows.map(x => x.name + ' ' + x.got + '/' + x.billed).join(' | ')]), [
    [BIG, 'תעודת משלוח', 5, 30, 'אחיד פרוס ברמן 0/12 | לחמניות 10 בשקית 6/6 | ברמן אסלי 5 פיתות 4/4 | פיתות פרימיום 10 5/5 | פיתות עננים 8 3/3'],
    [SMALL, 'ת.משלוח', 2, 7, 'אחיד פרוס ברמן 5/5 | ברמן אסלי 5 פיתות 2/2']], 'מה שסומן בכל תעודה');
  // בלי מה שסומן (קליטה ישנה): מוצר שבשתי התעודות עם הפרש — אין לדעת באיזו תעודה, ולא מנחשים: הכרטיס כמו קודם
  r.context.OLD = { ...saved, quantityCheck: { method: 'manual', confirmedAt: 1, differences: [] } };
  assert.equal(r.run('receiptPaperSections(OLD)'), null);
  // ובלי הפרש — לפי התעודות
  r.context.OLD2 = { ...r.context.OLD, items: saved.items.map(l => l.productId === 'code_101' ? (({ noteQty, ...rest }) => ({ ...rest, qty: 17 }))(l) : l) };
  assert.deepEqual(json(r, 'receiptPaperSections(OLD2).sections.map(s => s.rows[0].got + "/" + s.rows[0].billed)'), ['12/12', '5/5']);
  // מה שהכרטיס מציג
  r.run(`receipts = [SAVED]; receiptHistoryFilter = 'all'; ledgerInvalidate(); setView('receiptsHistory');`);
  const card = strip(r.run('app.innerHTML'));
  assert.match(card, /הכמויות נבדקו שורה-שורה/);
  assert.match(card, /תעודה 1 מתוך 2 תעודת משלוח 244785003 · 5 שורות · 30 יח׳ אחיד פרוס ברמן 0 יח׳ \(חויב 12\)/);
  assert.match(card, /תעודה נפרדת תעודה 2 מתוך 2 ת\.משלוח 290096103 · 2 שורות · 7 יח׳ אחיד פרוס ברמן 5 יח׳ ברמן אסלי 5 פיתות 2 יח׳/);
  // מספרים שלא נסגרים (תיקון אחרי השמירה) — בלי חלוקה; קליטה עם תעודה אחת — בלי חלוקה; תעודת זיכוי בתוך הקליטה — בלי חלוקה
  r.context.EDITED = { ...saved, items: saved.items.map(l => l.productId === 'code_101' ? { ...l, noteQty: 16 } : l) };
  assert.equal(r.run('receiptPaperSections(EDITED)'), null);
  r.context.ONE = { ...saved, paperScan: { ...saved.paperScan, response: { ...saved.paperScan.response, scan: { ...saved.paperScan.response.scan, documents: saved.paperScan.response.scan.documents.slice(0, 1) } } } };
  assert.equal(r.run('receiptPaperSections(ONE)'), null);
  r.context.CREDIT = { ...saved, paperScan: { ...saved.paperScan, documents: saved.paperScan.documents.map((d, i) => i ? { ...d, kind: 'credit' } : d) } };
  assert.equal(r.run('receiptPaperSections(CREDIT)'), null);
  // תעודה בלי שורות שנקראו; מוצר שחויב ואינו באף תעודה — לא נסגר, כמו קודם
  const docs = saved.paperScan.response.scan.documents;
  r.context.EMPTY = { ...saved, paperScan: { ...saved.paperScan, response: { ...saved.paperScan.response, scan: { ...saved.paperScan.response.scan, documents: [docs[0], { ...docs[1], rows: [] }] } } } };
  assert.equal(r.run('receiptPaperSections(EMPTY)'), null);
  r.context.OUTSIDE = { ...saved, items: saved.items.concat([{ productId: 'code_119', name: 'לחם מלא בטוב', barcode: '', qty: 2 }]) };
  assert.equal(r.run('receiptPaperSections(OUTSIDE)'), null, 'חויב (אין noteQty) ואינו באף תעודה');
  r.context.SURPLUS = { ...saved, items: saved.items.concat([{ productId: 'code_119', name: 'לחם מלא בטוב', barcode: '', qty: 2, noteQty: 0 }]) };
  assert.deepEqual(json(r, 'receiptPaperSections(SURPLUS).others.map(x => x.name + " " + x.got + "/" + x.billed)'), ['לחם מלא בטוב 2/0'], 'עודף שאינו בתעודות — "לא באף תעודה"');
  assert.equal(r.run('receiptPaperSections({ items: [] })'), null);
  // "הכמויות אושרו ידנית" — כמו קודם, לכל בדיקה ידנית אחרת
  r.run(`receipts = [OLD]; setView('receiptsHistory');`);
  assert.match(strip(r.run('app.innerHTML')), /הכמויות אושרו ידנית/);
});

test('4ג. "לא שלנו" על נייר שכבר בענן: לסל המחזור בענן — סל, מצבה ומחיקת הסריקה (כמו "מחק" רגיל)', async () => {
  const r = await twoPapers();
  // שני הניירות הגיעו לענן (כמו בבוקר רגיל)
  r.run(`papers = Object.values(paperLocalResults()).map(x => structuredClone(x.paper));
    Object.keys(paperLocalResults()).forEach(cap => paperPatchLocal(cap, cur => ({ ...cur, ackedAt: Date.now() })));`);
  r.run('startReceiptLineCheck(); testWrites.length = 0;');
  click(r, { lineDrop: '1' }); click(r, { lineDropYes: '1' });
  await settle();
  assert.deepEqual(state(r).nums, [BIG]);
  const del = json(r, `testWrites.filter(w => w.op === 'batch').map(w => w.writes.map(x => x.op + ':' + x.path.slice(-2).join('/')))`).flat();
  assert.ok(del.some(x => /^set:trash\/papers_paper_290096103_/.test(x)) && del.includes('set:papers/paper_290096103') && del.includes('delete:paperScans/paper_290096103'), JSON.stringify(del));
  assert.ok(!del.some(x => x.includes('244785003')), 'התעודה שלנו לא נגעה');
  assert.equal(r.run(`papers.find(p => p.id === 'paper_290096103').deleted`), true);
  assert.equal(r.run(`!!paperFind('paper_290096103')`), false);
  assert.equal(r.run(`!!paperFind('paper_244785003')`), true);
});

test('7. טלפון בגרסה 153 שממשיך את הקליטה: השורות לכל מוצר (rows) מעודכנות עם כל סימון — שורה שלא סומנה נחשבת "הגיע"', async () => {
  const r = await twoPapers();
  r.run('startReceiptLineCheck()');
  const rows = () => json(r, 'receiptQuantityReview.rows.map(x => x.productId + " " + x.kind + " " + x.difference + "/" + x.paperQty).join(" | ")');
  assert.equal(rows(), 'code_101 match 0/17 | code_1231 match 0/6 | code_238 match 0/6 | code_2381 match 0/5 | code_2387 match 0/3', 'עוד לא סומן כלום — כמו "יש חוסרים או עודפים" בפתיחה');
  click(r, { lineMark: '1:0:none' }); click(r, { lineMark: '0:1:qty' }); type(r, { lineGot: '0:1' }, '4');
  assert.equal(rows(), 'code_101 shortage 5/17 | code_1231 shortage 2/6 | code_238 match 0/6 | code_2381 match 0/5 | code_2387 match 0/3');
  // מה שטלפון ב-153 עושה עם הבדיקה הזו: החלון הרגיל, "אשר הפרשים — שאר הכמויות תואמות"
  assert.equal(r.run('commitReceiptQuantityReview()'), true);
  assert.deepEqual(json(r, 'receiptList.map(l => l.productId + " " + l.qty)'), ['code_101 12', 'code_1231 4', 'code_238 6', 'code_2381 5', 'code_2387 3'], 'מה שסומן, והשאר — הגיע; לא רשימה ריקה');
});

test('8. "לא שלנו" אומר מה באמת קורה: נייר שעוד רק בטלפון — נמחק בלי סל; נייר בענן — לסל המחזור', async () => {
  const r = await twoPapers();
  r.run('startReceiptLineCheck()');
  click(r, { lineDrop: '1' });
  assert.match(strip(r.run(`$('receiptQuantityRows').innerHTML`)), /הצילום שלו נמחק מהטלפון\. הוא עוד לא נשמר בענן, ולכן לא יעבור לסל המחזור — אם זה הנייר שלך, לחץ "ביטול"/);
  assert.doesNotMatch(strip(r.run(`$('receiptQuantityRows').innerHTML`)), /אפשר לשחזר/);
  click(r, { lineDropYes: '1' }); await settle();
  assert.equal(r.run(`$('receiptQuantityProgress').textContent`), 'ת.משלוח 290096103 יצא מהקליטה, והצילום שלו נמחק מהטלפון');
  const c = await twoPapers();
  c.run(`papers = Object.values(paperLocalResults()).map(x => structuredClone(x.paper));
    Object.keys(paperLocalResults()).forEach(cap => paperPatchLocal(cap, cur => ({ ...cur, ackedAt: Date.now() })));`);
  c.run('startReceiptLineCheck()');
  click(c, { lineDrop: '1' });
  assert.match(strip(c.run(`$('receiptQuantityRows').innerHTML`)), /והנייר עובר לסל המחזור — אפשר לשחזר אותו משם/);
  click(c, { lineDropYes: '1' }); await settle();
  assert.equal(c.run(`$('receiptQuantityProgress').textContent`), 'ת.משלוח 290096103 יצא מהקליטה ועבר לסל המחזור');
});

test('9. מה שנספר אחרי שהבדיקה כבר התחילה — גם הוא ב"הגיע משהו נוסף"; מה שהוסף שם קודם — נשאר', async () => {
  const r = await twoPapers();
  r.run('startReceiptLineCheck()');
  const extra = r.run(`products.find(p => !['code_101','code_1231','code_238','code_2381','code_2387','code_119'].includes(p.id) && p.name).id`);
  click(r, { extraAdd: extra });
  // "חזרה" → סורקים מוצר שאינו בתעודות → שוב "בדוק שורה-שורה"
  r.run(`closeReceiptQuantityReview(); receiptList = [{ productId: 'code_119', name: 'לחם מלא בטוב', barcode: '', qty: 2 }]; saveReceiptDraft(); startReceiptLineCheck();`);
  r.run('testConfirms[testConfirms.length - 1].cb()');
  assert.deepEqual(review(r).extras.map(e => [e.productId, e.got]), [[extra, '1'], ['code_119', '2']]);
  markRestOk(r);
  assert.equal(r.run('finishReceiptLineCheck()'), true);
  assert.deepEqual(json(r, 'receiptList.filter(l => ["code_119", ' + JSON.stringify(extra) + '].includes(l.productId)).map(l => l.productId + " " + l.qty)'), [extra + ' 1', 'code_119 2']);
});

test('10. הנייר שיצא נתן לקליטה את התאריך שלו — היום חוזר לפי התעודה שנשארה', async () => {
  const r = await twoPapers();
  // הקליטה קיבלה את היום של הנייר הראשון (receivingInstallDelivery); כאן — כאילו הראשון היה מאתמול
  const yesterday = r.run(`ledgerAddDays(todayStr(), -1)`);
  r.run(`(() => { const cap = Object.keys(paperLocalResults()).find(k => paperLocalResults()[k].paper.id === 'paper_244785003');
    paperPatchLocal(cap, cur => ({ ...cur, paper: { ...cur.paper, docDay: '${yesterday}' } }));
    aiScanResponse.scan.documents[0].docDate = '${yesterday.split('-').reverse().join('/')}'; receiptDocDate = '${yesterday}'; })()`);
  assert.equal(r.run(`paperFind('paper_244785003').paper.docDay`), yesterday);
  r.run('startReceiptLineCheck()');
  click(r, { lineDrop: '0' }); click(r, { lineDropYes: '0' }); await settle();
  assert.deepEqual(state(r).nums, [SMALL]);
  assert.equal(r.run('receiptDocDate'), null, 'הנייר שנשאר מהיום — הקליטה של היום');
  // יום שנקבע ביד, שונה מהנייר שיצא — לא נוגעים בו
  const o = await twoPapers();
  const before = o.run(`ledgerAddDays(todayStr(), -2)`);
  o.run(`receiptDocDate = '${before}'; startReceiptLineCheck()`);
  click(o, { lineDrop: '0' }); click(o, { lineDropYes: '0' }); await settle();
  assert.equal(o.run('receiptDocDate'), before);
});
