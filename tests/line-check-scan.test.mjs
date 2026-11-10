// v160 — סריקה בתוך הבדיקה שורה-שורה (כמו ביטבתה 408 ותנובה 153). בקשת המשתמשים (8.11.2026): לא לבחור בין "לסרוק"
// ל"לבדוק שורה-שורה" — באותה בדיקה סורקים מוצר והשורה שלו מסומנת, או מסמנים ביד; מוצר שאינו בתעודה נכנס ל"הגיע בנוסף".
// אותם נתונים כמו ב-v154: תעודת משלוח (5 שורות, 30 יח׳) ונייר "ת.משלוח" קטן (אחיד פרוס ×5, אסלי ×2) — אחיד פרוס ואסלי בשניהם.
// המצלמה מזויפת: BarcodeDetector ו-getUserMedia מדומים, והברקוד "נקרא" דרך onScanned — כמו בבדיקות הסריקה.
// מה שנבדק:
// 1. "סרוק מוצר" בתחתית הקבועה של החלון, ליד "סיום" — רק בבדיקה שורה-שורה; "חוסרים ועודפים" כמו קודם. ההסבר בכותרת.
// 2. פתיחת הסריקה: החלון מוסתר, המצלמה במצב רציף עם "סומנו 0 מתוך 5", הכותרת והרמז; ✕ מחזיר לרשימה בלי לסמן.
// 3. ברקוד של שורה: הכרטיס מעל המצלמה (שורה N, השם, מחיר הקופה, הכמות בתעודה); "הגיע N" מסמן בדיוק כמו לחיצה ברשימה —
//    הטיוטה, השורות לכל מוצר; הלולאה מושהית כשהכרטיס פתוח. v165: הסימון סוגר את המצלמה וחוזר לרשימה, לשורה שסומנה (מודגשת);
//    "סרוק מוצר" שוב — המונה על המצלמה מעודכן.
// 4. "אחרת": שדה כמות, הסיכום תוך כדי הקלדה, כמות לא תקינה לא נשמרת, Enter שומר; "לא הגיע"; ✕ בכרטיס סוגר בלי לסמן — והמצלמה נשארת.
// 5. אותו מוצר בשתי תעודות — v164: קבוצה אחת (כרטיס אחד של 17, "הגיע 17" לשתי השורות); סריקה חוזרת — "סרקת עד עכשיו … — עוד
//    כמה?" (v163), "תקן את הסה״כ" מחזיר את שלושת הכפתורים, ו"אחרת" מתחלק אוטומטית (10 בראשונה, 0 בשנייה).
// 6. מוצר שאינו באף תעודה: "לא בתעודה — הגיע בנוסף" עם כמות, נכנס ל"הגיע משהו נוסף"; סריקה חוזרת — "כבר ברשימה", "עדכן".
// 7. ברקוד שאינו במאגר: ההודעה של הקליטה, הסריקה ממשיכה, כלום לא השתנה. אותו ברקוד פעמיים ברצף (אחרי ✕ בכרטיס) — נספר
//    פעם אחת; אחרי סימון וחזרה לרשימה, "סרוק מוצר" פותח מצלמה נקייה — אותו ברקוד הוא סריקה חוזרת (v165).
// 8. יחידה מול מארז חיוב: סורקים את המארז כשבתעודה היחידה — השורה של היחידה, לא "הגיע בנוסף".
// 9. ברקוד שקיים בשני מוצרים במאגר — נפתר למוצר שבנייר.
// 10. שוויון: אותה תעודה מסומנת פעם בסריקה ופעם ביד — אותן שורות, אותו "סיום", אותה ספירה ואותה קליטה שמורה.
// 11. קריאה בלבד (canEditSharedReceipt) — המצלמה נסגרת בלי לסמן, עם ההודעה; הכרטיס שמעל המצלמה נחשב עריכת קליטה.
// 12. הגרסה.
// הרצה: TZ=Asia/Jerusalem node --test tests/line-check-scan.test.mjs
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { app, delivery, printed, now, readPapers, receive, state } from './one-button-helpers.mjs';

const BIG = '244785003', SMALL = '290096103';
// הברקודים של המוצרים בתעודה (fixture.json): אחיד פרוס ברמן, לחמניות 10 בשקית, ברמן אסלי 5 פיתות, פיתות פרימיום 10, פיתות עננים 8;
// לחם מלא בטוב — לא בתעודות
const BC = { code_101: '497112', code_1231: '498256', code_238: '497204', code_2381: '4033033', code_2387: '4033057', code_119: '2037194' };
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
// המצלמה המזויפת: BarcodeDetector מובנה שלא קורא כלום, זרם בלי מסלולים, וידאו שמתנגן
const fakeCamera = r => r.run(`window.BarcodeDetector = class { detect() { return Promise.resolve([]); } };
  navigator.mediaDevices = { getUserMedia: async () => ({ getTracks: () => [], getVideoTracks: () => [] }) };
  $('scanVideo').play = async () => {};`);
// קליטה פתוחה עם שתי התעודות (הקטנה מתווספת לבד, כמו ב-26.10)
async function twoPapers(opts) {
  const r = app(delivery(BIG), opts);
  await receive(r);
  r.serve(small());
  await readPapers(r, 1, 1);
  assert.deepEqual(state(r).nums, [BIG, SMALL], 'שתי התעודות בקליטה');
  r.run(`currentView = 'receiving'; mainMode = 'receiving';`);
  fakeCamera(r);
  return r;
}
async function onePaper() {
  const r = app(delivery(BIG));
  await receive(r);
  r.run(`currentView = 'receiving'; mainMode = 'receiving';`);
  fakeCamera(r);
  return r;
}
// הבדיקה פתוחה, ו"סרוק מוצר" נלחץ — המצלמה (המזויפת) נפתחת עד הסוף
async function scanning(r) {
  r.run('startReceiptLineCheck()');
  r.events.get('receiptLineScan:click')();
  await settle();
  return r;
}
const click = (r, dataset) => r.run(`receiptLineCheckClick({ target: { closest: () => ({ dataset: ${JSON.stringify(dataset)} }) } })`);
const type = (r, dataset, value) => r.run(`receiptLineCheckInput({ target: { dataset: ${JSON.stringify(dataset)}, value: ${JSON.stringify(value)} } })`);
const cardClick = (r, dataset) => r.run(`receiptLineScanCardClick({ target: { closest: () => ({ dataset: ${JSON.stringify(dataset)} }) } })`);
const cardType = (r, value) => r.run(`receiptLineScanCardInput({ target: { dataset: { scanGot: '' }, value: ${JSON.stringify(value)} } })`);
const beep = (r, code) => r.run(`onScanned(${JSON.stringify(code)})`);
// עברו שתי שניות — אותו ברקוד נחשב סריקה חדשה (בבדיקה הזמן אמיתי, אז מזיזים את השעון של הסריקה האחרונה)
const later = r => r.run('lastScanTime = 0');
const review = r => json(r, 'receiptQuantityReview');
const marks = r => review(r).docs.map(d => d.lines.map(l => l.mark + (l.got ? ':' + l.got : '')).join(','));
const card = r => r.run(`$('scanLineCard').innerHTML`);
const cardOpen = r => !r.run(`$('scanLineCard').classList.contains('hidden')`);
const overlay = r => r.run(`$('scanOverlayLabel').textContent + ' ' + $('scanOverlayCount').textContent + ' | ' + $('scanOverlayName').textContent`);
const modalHidden = r => r.run(`$('receiptQuantityModal').classList.contains('hidden')`);
const progress = r => r.run(`$('receiptQuantityProgress').textContent`);
// v165: כל סימון מהכרטיס סוגר את המצלמה וחוזר לרשימה, לשורה שסומנה (מודגשת); למוצר הבא — "סרוק מוצר" שוב
function returned(r, id) {
  assert.equal(cardOpen(r), false, 'הכרטיס נסגר'); assert.equal(r.run('receiptLineScanCard'), null);
  assert.equal(r.run('scanPurpose'), 'field'); assert.equal(r.run(`$('scanModal').classList.contains('hidden')`), true, 'המצלמה נסגרה');
  assert.equal(modalHidden(r), false, 'הרשימה חזרה');
  assert.equal(r.run(`$('${id}').classList.contains('ring-4')`), true, id + ' — השורה שסומנה מודגשת');
  assert.equal(r.run('receiptLineScanLast'), null, 'ההדגשה כבר נעשתה');
}
async function rescan(r) { r.events.get('receiptLineScan:click')(); await settle(); assert.equal(r.run('scanPurpose'), 'linecheck', 'המצלמה נפתחה שוב'); return r; }
const draftMarks = r => JSON.parse(r.storage.get('bm_receipt_draft')).quantityReview.docs.map(d => d.lines.map(l => l.mark + (l.got ? ':' + l.got : '')).join(','));
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

test('1. "סרוק מוצר" בתחתית הקבועה ליד "סיום" — רק בבדיקה שורה-שורה; "חוסרים ועודפים" כמו קודם', async () => {
  const r = await twoPapers();
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  // המבנה: התחתית מחוץ לגוף הנגלל (shrink-0, אחרי receiptQuantityBody), ובה "סרוק מוצר" ואז "סיום"
  assert.match(html, /<div id="receiptQuantityBody" class="p-4 overflow-y-auto min-h-0">[\s\S]*?<div id="receiptQuantityFooter" class="[^"]*border-t border-slate-100 shrink-0 grid gap-2"><button id="receiptLineScan"[^>]*>[\s\S]*?סרוק מוצר<\/button><button id="receiptQuantityConfirm"/);
  r.run('startReceiptLineCheck()');
  assert.equal(r.run(`$('receiptLineScan').classList.contains('hidden')`), false, 'הכפתור גלוי');
  assert.equal(r.run(`$('receiptQuantityFooter').classList.contains('grid-cols-[1.15fr_1fr]')`), true, 'שני כפתורים זה לצד זה — "סרוק" רחב יותר');
  assert.equal(r.run(`$('receiptQuantityIntro').textContent`), 'סרוק מוצר מהסחורה, או סמן ביד בכל שורה: הגיע, כמות אחרת או לא הגיע.');
  assert.equal(r.run(`$('receiptQuantityConfirm').textContent`), 'סיום (נשארו 5)'); // v164: 7 שורות בשני ניירות, 5 מוצרים — 5 שורות ברשימה
  assert.match(r.run(`$('receiptQuantityConfirm').className`), /bg-slate-400/);
  // הבדיקה הקיימת — הכפתור היחיד, בדיוק כמו קודם
  r.run('closeReceiptQuantityReview(); startReceiptQuantityReview(false)');
  assert.equal(r.run(`$('receiptLineScan').classList.contains('hidden')`), true);
  assert.equal(r.run(`$('receiptQuantityFooter').classList.contains('grid-cols-[1.15fr_1fr]')`), false);
  assert.equal(r.run(`$('receiptQuantityIntro').textContent`), 'סמן רק את ההפרשים שמצאת. בסיום תאשר ששאר הכמויות תואמות.');
  assert.equal(r.run(`$('receiptQuantityConfirm').className`), 'btn-tap w-full bg-blue-600 text-white rounded-xl py-3 font-black text-base');
  assert.equal(r.run(`$('receiptQuantityConfirm').textContent`), 'אשר הפרשים — שאר הכמויות תואמות');
});

test('2. פתיחת הסריקה: החלון מוסתר והמצלמה רציפה עם "סומנו 0 מתוך 5"; ✕ מחזיר לרשימה בלי לסמן', async () => {
  const r = await twoPapers();
  r.run('startReceiptLineCheck()');
  assert.equal(modalHidden(r), false);
  r.events.get('receiptLineScan:click')();
  assert.equal(r.run('scanPurpose'), 'linecheck');
  assert.equal(modalHidden(r), true, 'החלון מוסתר — המצלמה בשכבה שמתחתיו');
  await settle();
  assert.equal(r.run(`$('scanModal').classList.contains('hidden')`), false, 'המצלמה פתוחה');
  assert.equal(r.run('!!scanStream'), true, 'הזרם התקבל (מזויף)');
  assert.equal(r.run(`$('scanOverlay').classList.contains('hidden')`), false, 'מצב רציף — המונה מוצג');
  assert.equal(overlay(r), 'סומנו 0 מתוך 5 | ');
  assert.equal(r.run(`$('scanTitle').textContent`), 'בדיקה שורה-שורה — סריקה');
  assert.equal(r.run(`$('scanHint').textContent`), 'סרוק מוצר מהסחורה — ✕ חוזר לרשימה');
  assert.equal(cardOpen(r), false);
  // סורקים — הכרטיס פתוח — ואז ✕ במצלמה: חזרה לרשימה בלי לסמן, ובלי שורה מודגשת
  beep(r, BC.code_1231);
  assert.equal(cardOpen(r), true);
  r.events.get('scanClose:click')();
  assert.equal(r.run('scanPurpose'), 'field');
  assert.equal(r.run(`$('scanModal').classList.contains('hidden')`), true);
  assert.equal(modalHidden(r), false, 'החלון חזר');
  assert.equal(r.run(`$('receiptQuantityTitle').textContent`), 'בדיקה שורה-שורה');
  assert.equal(progress(r), 'סומנו 0 מתוך 5 שורות');
  assert.deepEqual(marks(r), [',,,,', ',']);
  assert.equal(r.run(`$('lineCheck_0_1').classList.contains('ring-4')`), false, 'כלום לא סומן — שום שורה לא מודגשת');
  assert.equal(cardOpen(r), false);
  assert.equal(r.run('receiptLineScanCard'), null);
  // v165: סימון מהכרטיס — המצלמה נסגרת לבד, והרשימה חוזרת על השורה שסומנה
  await rescan(r);
  beep(r, BC.code_1231); cardClick(r, { scanMark: 'ok' });
  returned(r, 'lineCheck_0_1');
  assert.equal(progress(r), 'סומנו 1 מתוך 5 שורות');
  // המצלמה של הקליטה בסריקה — הכותרת והמונה כמו קודם
  r.run("scanPurpose = 'receiving'"); await r.run('openScanner()'); await settle();
  assert.equal(r.run(`$('scanTitle').textContent`), 'סריקת ברקוד');
  assert.equal(r.run(`$('scanOverlayLabel').textContent`), 'פריטים:');
  assert.equal(r.run(`$('scanHint').textContent`), 'סרוק פריטים — לחץ ✕ לסיום');
  r.run('closeScanner()');
});

test('3. ברקוד של שורה: הכרטיס מעל המצלמה, ו"הגיע N" מסמן בדיוק כמו לחיצה ברשימה — וחוזר לשורה שלה (v165)', async () => {
  const r = await scanning(await twoPapers());
  const ticks = r.callbacks.length;
  beep(r, BC.code_1231); // לחמניות 10 בשקית — שורה 2 בתעודת המשלוח
  assert.equal(cardOpen(r), true);
  const c = card(r);
  assert.match(strip(c), /^שורה 2 בתעודה 1 מתוך 2 לחמניות 10 בשקית אין מחיר קופה — בדוק בקופה ועדכן 6 יח׳ בתעודה הגיע 6 אחרת לא הגיע$/);
  assert.match(c, /data-scan-dismiss/); assert.match(c, /data-scan-mark="ok"[\s\S]*data-scan-mark="qty"[\s\S]*data-scan-mark="none"/);
  assert.doesNotMatch(c, /data-scan-got|כבר סומנה/);
  assert.deepEqual(json(r, '({ kind: receiptLineScanCard.kind, di: receiptLineScanCard.di, li: receiptLineScanCard.li })'), { kind: 'line', di: 0, li: 1 });
  assert.equal(r.callbacks.length, ticks, 'כרטיס פתוח — לא תוזמן טיק (הלולאה מושהית)');
  cardClick(r, { scanMark: 'ok' });
  returned(r, 'lineCheck_0_1'); // v165: המצלמה נסגרה, הרשימה חזרה, והשורה שסומנה מודגשת
  assert.deepEqual(marks(r), [',ok,,,', ',']);
  assert.deepEqual(draftMarks(r), [',ok,,,', ','], 'נשמר בטיוטה כמו סימון ביד');
  assert.equal(review(r).confirmedAt, null);
  assert.equal(json(r, 'receiptQuantityReview.rows.map(x => x.productId + " " + x.kind + " " + x.difference).sort().join(" | ")'), 'code_101 match 0 | code_1231 match 0 | code_238 match 0 | code_2381 match 0 | code_2387 match 0');
  assert.equal(r.callbacks.length, ticks, 'המצלמה נסגרה — לא תוזמן טיק של סריקה');
  assert.equal(progress(r), 'סומנו 1 מתוך 5 שורות');
  assert.match(strip(r.run(`$('receiptQuantityRows').innerHTML`)), /לחמניות 10 בשקית הגיע · 6 יח׳ אין מחיר קופה — אפשר להשלים כאן כמה עובר בקופה \(כולל מע״מ\) ₪ שנה/, 'מקופלת וירוקה, כמו "הגיע" ביד');
  // "סרוק מוצר" שוב — המונה על המצלמה מעודכן, בלי כרטיס ובלי "מה סומן זה עתה"
  await rescan(r);
  assert.equal(overlay(r), 'סומנו 1 מתוך 5 | ');
  assert.equal(cardOpen(r), false);
  // מחיר קופה וארגזים בכרטיס — כמו בשורה ברשימה; מוצר שגם בנייר הקטן — v164: קבוצה אחת, "6 יח׳ ב-2 תעודות · 4 + 2", והארגזים לפי הסך
  r.run(`products.find(p => p.id === 'code_238').boxSize = 2; products.find(p => p.id === 'code_238').posPrice = 7.9;`);
  beep(r, BC.code_238);
  assert.match(strip(card(r)), /^שורה 3 בתעודה 1 מתוך 2 · גם בתעודה 2 \(2 יח׳\) ברמן אסלי 5 פיתות בקופה: ₪7\.90 6 יח׳ ב-2 תעודות 4 \+ 2 3 ארגזים × 2 הגיע 6 אחרת לא הגיע$/);
  assert.ok(card(r).includes(r.run(`posPriceLineHtml(products.find(p => p.id === 'code_238'))`)), 'מחיר הקופה — אותה שורה כמו ברשימה ובסריקה');
  cardClick(r, { scanMark: 'ok' });
  returned(r, 'lineCheck_0_2');
  assert.deepEqual(marks(r), [',ok,ok,,', ',ok'], '"הגיע 6" — שתי השורות של אסלי, בשני הניירות');
  assert.equal(progress(r), 'סומנו 2 מתוך 5 שורות');
  await rescan(r);
  assert.equal(overlay(r), 'סומנו 2 מתוך 5 | ');
  beep(r, BC.code_238); // שוב — אותה קבוצה: "סרקת עד עכשיו 6 מתוך 6"
  assert.match(strip(card(r)), /סרקת עד עכשיו 6 מתוך 6 — הכל הגיע 6 יח׳ ב-2 תעודות 4 \+ 2 3 ארגזים × 2 עוד כמה\?/);
  cardClick(r, { scanDismiss: '' });
  // תעודה אחת — "שורה 2 בתעודה", בלי "מתוך"
  const one = await scanning(await onePaper());
  beep(one, BC.code_1231);
  assert.match(strip(card(one)), /^שורה 2 בתעודה לחמניות 10 בשקית אין מחיר קופה — בדוק בקופה ועדכן 6 יח׳ בתעודה הגיע 6 אחרת לא הגיע$/);
});

test('4. "אחרת" עם כמות, "לא הגיע", ו-✕ בכרטיס שסוגר בלי לסמן', async () => {
  const r = await scanning(await twoPapers());
  beep(r, BC.code_1231);
  cardClick(r, { scanMark: 'qty' });
  assert.equal(cardOpen(r), true);
  const c = card(r);
  assert.match(c, /id="scanLineGot" data-scan-got[^>]*value=""/); assert.match(c, /data-scan-save[^>]*>שמור</);
  assert.doesNotMatch(c, /data-scan-mark=/);
  assert.match(c, /id="scanLineSum"[^>]*>הקלד כמה יחידות הגיעו</);
  // כמות לא תקינה — לא נשמר, הכרטיס אומר
  cardType(r, 'x');
  assert.equal(r.run('receiptLineScanSave()'), false);
  assert.equal(cardOpen(r), true);
  assert.match(strip(card(r)), /הקלד מספר — כמה יחידות הגיעו/);
  assert.deepEqual(marks(r), [',,,,', ',']);
  // כמות תקינה — הסיכום תוך כדי הקלדה, והשמירה (Enter) מסמנת "אחרת" עם הכמות
  cardType(r, '4');
  assert.equal(r.run(`$('scanLineSum').textContent`), 'התקבלו 4 · חוסר 2');
  cardType(r, '6'); assert.equal(r.run(`$('scanLineSum').textContent`), 'כמו בתעודה');
  cardType(r, '4');
  r.events.get('scanLineCard:keydown')({ key: 'Enter', target: { dataset: { scanGot: '' } }, preventDefault() {} });
  returned(r, 'lineCheck_0_1'); // v165: חזרה לרשימה — השורה של "אחרת" פתוחה עם הכמות, מודגשת
  assert.deepEqual(marks(r), [',qty:4,,,', ',']);
  assert.equal(json(r, 'receiptQuantityReview.rows.find(x => x.productId === "code_1231")').kind, 'shortage');
  assert.match(r.run(`$('receiptQuantityRows').innerHTML`), /data-line-got="0:1"[^>]*value="4"/);
  assert.equal(progress(r), 'סומנו 1 מתוך 5 שורות · חוסר 2 יח׳');
  // "לא הגיע"
  await rescan(r); beep(r, BC.code_2387);
  cardClick(r, { scanMark: 'none' });
  returned(r, 'lineCheck_0_4');
  assert.deepEqual(marks(r), [',qty:4,,,none', ',']);
  assert.match(strip(r.run(`$('receiptQuantityRows').innerHTML`)), /פיתות עננים 8 לא הגיע · 0 מתוך 3 אין מחיר קופה — אפשר להשלים כאן כמה עובר בקופה \(כולל מע״מ\) ₪ שנה/, '"לא הגיע" מקופלת');
  assert.equal(progress(r), 'סומנו 2 מתוך 5 שורות · חוסר 5 יח׳');
  // ✕ בכרטיס — כלום לא משתנה, המצלמה נשארת והסריקה ממשיכה
  await rescan(r);
  assert.equal(overlay(r), 'סומנו 2 מתוך 5 | ');
  const ticks = r.callbacks.length;
  beep(r, BC.code_2381);
  assert.equal(cardOpen(r), true);
  cardClick(r, { scanDismiss: '' });
  assert.equal(cardOpen(r), false);
  assert.equal(r.run('scanPurpose'), 'linecheck'); assert.equal(r.run(`$('scanModal').classList.contains('hidden')`), false, '✕ בכרטיס — המצלמה נשארת');
  assert.equal(modalHidden(r), true);
  assert.deepEqual(marks(r), [',qty:4,,,none', ',']);
  assert.equal(r.callbacks.length, ticks + 1, 'טיק אחד — הסריקה ממשיכה');
  assert.equal(overlay(r), 'סומנו 2 מתוך 5 | ', 'המונה כמו שהיה');
  // ✕ במצלמה — חזרה לרשימה כמו שהיא
  r.run('closeScanner()');
  assert.equal(modalHidden(r), false);
  assert.equal(progress(r), 'סומנו 2 מתוך 5 שורות · חוסר 5 יח׳');
});

test('5. אותו מוצר בשתי תעודות — קבוצה אחת (v164): כרטיס אחד של 17, "הגיע 17" לשתי השורות, סריקה חוזרת "סרקת עד עכשיו … — עוד כמה?", ו"תקן את הסה״כ" מחלק 10 + 0', async () => {
  const r = await scanning(await twoPapers());
  beep(r, BC.code_101); // אחיד פרוס — 12 בתעודת המשלוח, 5 בנייר הקטן: קבוצה אחת של 17
  assert.deepEqual(json(r, '[receiptLineScanCard.di, receiptLineScanCard.li, receiptLineScanCard.addQty]'), [0, 0, false]);
  assert.match(strip(card(r)), /^שורה 1 בתעודה 1 מתוך 2 · גם בתעודה 2 \(5 יח׳\) אחיד פרוס ברמן אין מחיר קופה — בדוק בקופה ועדכן 17 יח׳ ב-2 תעודות 12 \+ 5 הגיע 17 אחרת לא הגיע$/);
  assert.doesNotMatch(strip(card(r)), /שורה נוספת|סרוק שוב/);
  cardClick(r, { scanMark: 'ok' });
  returned(r, 'lineCheck_0_0'); // v165: חזרה לכרטיס של הקבוצה ברשימה
  assert.deepEqual(marks(r), ['ok,,,,', 'ok,'], '"הגיע 17" — שתי השורות');
  assert.equal(progress(r), 'סומנו 1 מתוך 5 שורות');
  // "סרוק מוצר" ואותו ברקוד שוב — סריקה חוזרת של אותה קבוצה
  await rescan(r);
  assert.equal(overlay(r), 'סומנו 1 מתוך 5 | ');
  beep(r, BC.code_101);
  assert.deepEqual(json(r, '[receiptLineScanCard.di, receiptLineScanCard.li, receiptLineScanCard.addQty]'), [0, 0, true]);
  assert.match(strip(card(r)), /סרקת עד עכשיו 17 מתוך 17 — הכל הגיע 17 יח׳ ב-2 תעודות 12 \+ 5 עוד כמה\? הוסף הקלד כמה עוד הגיעו לא נכון\? תקן את הסה״כ$/);
  assert.doesNotMatch(card(r), /data-scan-mark="(ok|qty|none)"/);
  cardClick(r, { scanMark: 'fix' });
  assert.match(strip(card(r)), /כבר סומנה: הגיע — אפשר לשנות 17 יח׳ ב-2 תעודות 12 \+ 5 הגיע 17 אחרת לא הגיע$/);
  cardClick(r, { scanMark: 'none' });
  returned(r, 'lineCheck_0_0');
  assert.deepEqual(marks(r), ['none,,,,', 'none,']);
  // "לא הגיע" ואז סריקה — "סרקת עד עכשיו 0 מתוך 17", וכל הכמות כבר בשדה
  await rescan(r); beep(r, BC.code_101);
  assert.match(strip(card(r)), /סרקת עד עכשיו 0 מתוך 17 .* עוד כמה\? הוסף סה״כ 17 · כמו בתעודה/);
  assert.match(card(r), /data-scan-got[^>]*value="17"/);
  // "תקן את הסה״כ" → "אחרת" 10: החלוקה אוטומטית — 10 בתעודה הראשונה, 0 בשנייה ("לא הגיע")
  cardClick(r, { scanMark: 'fix' }); cardClick(r, { scanMark: 'qty' }); cardType(r, '10'); cardClick(r, { scanSave: '' });
  returned(r, 'lineCheck_0_0');
  assert.deepEqual(marks(r), ['qty:10,,,,', 'none,']);
  assert.equal(progress(r), 'סומנו 1 מתוך 5 שורות · חוסר 7 יח׳');
  await rescan(r); beep(r, BC.code_101);
  assert.match(strip(card(r)), /סרקת עד עכשיו 10 מתוך 17 .* עוד כמה\? הוסף סה״כ 17 · כמו בתעודה/);
  assert.match(card(r), /data-scan-got[^>]*value="7"/, 'מה שחסר — בשדה');
  // "הוסף" 7 — 17: "הגיע", ומתחלק 12 + 5
  cardClick(r, { scanSave: '' });
  returned(r, 'lineCheck_0_0');
  assert.deepEqual(marks(r), ['ok,,,,', 'ok,']);
  assert.equal(progress(r), 'סומנו 1 מתוך 5 שורות');
});

test('6. מוצר שאינו באף תעודה: "לא בתעודה — הגיע בנוסף" עם כמות, נכנס ל"הגיע משהו נוסף"; סריקה חוזרת מעדכנת', async () => {
  const r = await scanning(await twoPapers());
  beep(r, BC.code_119); // לחם מלא בטוב — לא בתעודות
  assert.equal(cardOpen(r), true);
  assert.deepEqual(json(r, '({ kind: receiptLineScanCard.kind, k: receiptLineScanCard.k, got: receiptLineScanCard.got })'), { kind: 'extra', k: -1, got: '1' });
  const c = card(r);
  assert.match(strip(c), /^לא בתעודה — הגיע בנוסף לחם מלא בטוב אין מחיר קופה — בדוק בקופה ועדכן 2037194 כמה הגיע\? הוסף התקבלו 1 · עודף 1$/);
  assert.match(c, /border-amber-300/); assert.match(c, /data-scan-got[^>]*value="1"/); assert.doesNotMatch(c, /data-scan-mark=/);
  cardType(r, '0'); assert.equal(r.run(`$('scanLineSum').textContent`), 'הקלד כמה יחידות הגיעו', '"נוסף" בלי כמות — אין מה להוסיף');
  assert.equal(r.run('receiptLineScanSave()'), false); assert.equal(cardOpen(r), true);
  cardType(r, '3'); assert.equal(r.run(`$('scanLineSum').textContent`), 'התקבלו 3 · עודף 3');
  cardClick(r, { scanSave: '' });
  returned(r, 'lineExtra_0'); // v165: גם מוצר שאינו בתעודה — חזרה לרשימה, לכרטיס הצהוב שלו (מודגש)
  assert.deepEqual(review(r).extras.map(x => [x.productId, x.got]), [['code_119', '3']]);
  assert.deepEqual(JSON.parse(r.storage.get('bm_receipt_draft')).quantityReview.extras.map(x => [x.productId, x.got]), [['code_119', '3']]);
  assert.deepEqual(json(r, 'receiptQuantityReview.rows.filter(x => x.paperQty === 0).map(x => [x.productId, x.kind, x.difference])'), [['code_119', 'surplus', '3']]);
  assert.match(strip(r.run(`$('receiptQuantityRows').innerHTML`)), /הגיע משהו נוסף\? .* לחם מלא בטוב הסר כמה הגיע\?/, 'הכרטיס הצהוב כמו מהחיפוש');
  assert.match(r.run(`$('receiptQuantityRows').innerHTML`), /data-extra-got="0"[^>]*value="3"/);
  assert.equal(progress(r), 'סומנו 0 מתוך 5 שורות · עודף 3 יח׳');
  // שוב — "כבר ברשימה", עם הכמות הנוכחית, "עדכן"; לא נוסף פעמיים
  await rescan(r);
  assert.equal(overlay(r), 'סומנו 0 מתוך 5 | ');
  beep(r, BC.code_119);
  assert.deepEqual(json(r, '({ k: receiptLineScanCard.k, got: receiptLineScanCard.got })'), { k: 0, got: '3' });
  assert.match(strip(card(r)), /^כבר ברשימה ״הגיע משהו נוסף״ לחם מלא בטוב .* עדכן התקבלו 3 · עודף 3$/);
  cardType(r, '5'); cardClick(r, { scanSave: '' });
  returned(r, 'lineExtra_0');
  assert.deepEqual(review(r).extras.map(x => [x.productId, x.got]), [['code_119', '5']]);
  assert.match(r.run(`$('receiptQuantityRows').innerHTML`), /data-extra-got="0"[^>]*value="5"/);
  assert.equal(progress(r), 'סומנו 0 מתוך 5 שורות · עודף 5 יח׳');
});

test('7. ברקוד שאינו במאגר — ההודעה של הקליטה והסריקה ממשיכה; אותו ברקוד פעמיים ברצף — פעם אחת', async () => {
  const r = await scanning(await twoPapers());
  const ticks = r.callbacks.length;
  beep(r, '7290119390519');
  assert.equal(cardOpen(r), false);
  assert.equal(r.toasts[r.toasts.length - 1], '❌ ברקוד לא מזוהה: 7290119390519 — בדוק את הברקוד בכרטיס המוצר, או הוסף מוצר חדש');
  assert.equal(r.callbacks.length, ticks + 1, 'הסריקה ממשיכה');
  assert.equal(r.run('scanPurpose'), 'linecheck', 'המצלמה נשארת — אין שורה לחזור אליה');
  assert.deepEqual(marks(r), [',,,,', ',']); assert.deepEqual(review(r).extras, []);
  assert.equal(overlay(r), 'סומנו 0 מתוך 5 | ');
  // אותו ברקוד מיד שוב — אחרי שהכרטיס הקודם נסגר ב-✕ בלי לסמן — לא נספר (המוצר עדיין מול המצלמה)
  beep(r, BC.code_1231); cardClick(r, { scanDismiss: '' });
  assert.ok(r.run('Date.now() - lastScanTime') < 1000, 'השעון של הסריקה האחרונה מתחדש בסגירת הכרטיס');
  beep(r, BC.code_1231);
  assert.equal(cardOpen(r), false, 'קריאה כפולה של אותו ברקוד תוך 2 שניות — מתעלמים');
  // קריאה נוספת בזמן שכרטיס פתוח — מתעלמים ולא מתזמנים טיק
  later(r); beep(r, BC.code_2381);
  assert.equal(cardOpen(r), true);
  const t2 = r.callbacks.length;
  beep(r, BC.code_2387);
  assert.deepEqual(json(r, '[receiptLineScanCard.di, receiptLineScanCard.li]'), [0, 3], 'הכרטיס של פיתות פרימיום נשאר');
  assert.equal(r.callbacks.length, t2);
  cardClick(r, { scanDismiss: '' });
  // v165: אחרי סימון וחזרה לרשימה, "סרוק מוצר" פותח מצלמה נקייה — אותו ברקוד מיד הוא סריקה חוזרת של השורה, לא "קריאה כפולה"
  later(r); beep(r, BC.code_1231); cardClick(r, { scanMark: 'ok' });
  returned(r, 'lineCheck_0_1');
  await rescan(r);
  assert.equal(r.run('lastScanCode'), '');
  beep(r, BC.code_1231);
  assert.equal(cardOpen(r), true); assert.equal(json(r, 'receiptLineScanCard.addQty'), true, 'סריקה חוזרת — "עוד כמה?"');
  cardClick(r, { scanDismiss: '' });
});

test('8. יחידה מול מארז חיוב: סורקים את המארז כשבתעודה היחידה — השורה של היחידה, לא "הגיע בנוסף"', async () => {
  const r = await scanning(await twoPapers());
  r.run(`products.push({ id: 'pack101', name: 'אחיד פרוס — מארז 6', code: '9101', barcode: '7290000000060', price: 30 });
    const unit = products.find(p => p.id === 'code_101'); unit.billingPackId = 'pack101'; unit.billingPackSize = 6;`);
  beep(r, '7290000000060');
  assert.equal(cardOpen(r), true);
  assert.equal(json(r, 'receiptLineScanCard.kind'), 'line');
  assert.deepEqual(json(r, '[receiptLineScanCard.di, receiptLineScanCard.li, receiptLineScanCard.scanned.id, receiptLineScanCard.related.id]'), [0, 0, 'pack101', 'code_101']);
  assert.match(strip(card(r)), /^סרקת אחיד פרוס — מארז 6 — בתעודה היחידה הבודדת שלו: שורה 1 בתעודה 1 מתוך 2 · גם בתעודה 2 \(5 יח׳\) אחיד פרוס ברמן .* 17 יח׳ ב-2 תעודות 12 \+ 5 הגיע 17 אחרת לא הגיע$/);
  cardClick(r, { scanMark: 'ok' });
  returned(r, 'lineCheck_0_0');
  assert.deepEqual(marks(r), ['ok,,,,', 'ok,']); assert.deepEqual(review(r).extras, [], 'לא נוסף "הגיע בנוסף"');
  // המוצר עצמו בתעודה — קודם הוא, בלי הסבר על קרוב
  await rescan(r); beep(r, BC.code_1231);
  assert.doesNotMatch(strip(card(r)), /סרקת/);
  assert.equal(json(r, 'receiptLineScanCard.related'), null);
  cardClick(r, { scanDismiss: '' });
});

test('9. ברקוד שקיים בשני מוצרים במאגר — נפתר למוצר שבנייר', async () => {
  const r = await scanning(await twoPapers());
  assert.equal(r.run(`findProductByBarcode('497112').id`), 'code_101');
  r.run(`products.push({ id: 'code_101_old', name: 'אחיד פרוס (פריט ישן)', code: '1010', barcode: '497112', price: 5 }); products.unshift(products.pop());`); // הפריט הישן ראשון במאגר
  assert.equal(r.run(`findProductByBarcode('497112').id`), 'code_101_old');
  beep(r, BC.code_101);
  assert.deepEqual(json(r, '[receiptLineScanCard.kind, receiptLineScanCard.di, receiptLineScanCard.li, receiptLineScanCard.scanned.id]'), ['line', 0, 0, 'code_101']);
  cardClick(r, { scanMark: 'ok' });
  assert.deepEqual(marks(r), ['ok,,,,', 'ok,']); assert.deepEqual(review(r).extras, []);
});

test('10. שוויון: אותה תעודה מסומנת פעם בסריקה ופעם ביד — אותן שורות, אותה ספירה ואותה קליטה שמורה', async () => {
  // בסריקה: אחיד פרוס "אחרת" 10 מתוך 17 בשתי התעודות (v164: קבוצה אחת — 10 בתעודת המשלוח, 0 בנייר הקטן); השאר הגיע (עודף של
  // מוצר שאינו בתעודה — בבדיקה 6; במסך ההבדלים הוא דורש החלטה לפני "קלוט", ולכן אינו חלק מהשוואת השמירה כאן)
  const a = await scanning(await twoPapers());
  beep(a, BC.code_101); cardClick(a, { scanMark: 'qty' }); cardType(a, '10'); cardClick(a, { scanSave: '' });
  returned(a, 'lineCheck_0_0');
  assert.deepEqual(marks(a), ['qty:10,,,,', 'none,'], 'החלוקה: 10 בראשונה, והשארית (0) בשנייה');
  for (const code of [BC.code_1231, BC.code_238, BC.code_2381, BC.code_2387]) { await rescan(a); beep(a, code); cardClick(a, { scanMark: 'ok' }); } // v165: כל סימון חוזר לרשימה — "סרוק מוצר" לכל מוצר
  returned(a, 'lineCheck_0_4');
  assert.equal(progress(a), 'כל 5 שורות סומנו — אפשר לסיים · חוסר 7 יח׳');
  assert.equal(a.run(`$('receiptQuantityConfirm').textContent`), 'סיום — שמור את הבדיקה');
  // ביד — אותם סימונים ("אחרת" 10 על הקבוצה מחלק בדיוק כך)
  const b = await twoPapers();
  b.run('startReceiptLineCheck()');
  click(b, { lineMark: '0:0:qty' }); type(b, { lineGot: '0:0' }, '10');
  markRestOk(b);
  const pick = r => json(r, '({ docs: receiptQuantityReview.docs, extras: receiptQuantityReview.extras, rows: receiptQuantityReview.rows, products: receiptQuantityReview.products })');
  assert.deepEqual(pick(a), pick(b), 'אותה בדיקה בדיוק');
  assert.deepEqual(draftMarks(a), draftMarks(b));
  assert.equal(a.run('finishReceiptLineCheck()'), true); assert.equal(b.run('finishReceiptLineCheck()'), true);
  assert.deepEqual(json(a, 'receiptList'), json(b, 'receiptList'));
  assert.deepEqual(json(a, 'receiptList.map(l => l.productId + " " + l.qty).sort()'), ['code_101 10', 'code_1231 6', 'code_238 6', 'code_2381 5', 'code_2387 3']);
  const savedA = await saveAfterCheck(a), savedB = await saveAfterCheck(b);
  assert.deepEqual(items(savedA), items(savedB));
  assert.deepEqual({ ...savedA.quantityCheck, confirmedAt: null }, { ...savedB.quantityCheck, confirmedAt: null }, 'מה שנשמר בקליטה — זהה, בלי שדה חדש');
  for (const k of ['noteParts', 'paperDocs', 'units', 'count', 'status', 'unresolvedUnitsGap', 'noDoc', 'vatPct']) assert.deepEqual(savedA[k], savedB[k], k);
});

test('11. קריאה בלבד — המצלמה נסגרת בלי לסמן, עם ההודעה; הכרטיס שמעל המצלמה נחשב עריכת קליטה', async () => {
  const r = await scanning(await twoPapers());
  assert.equal(r.run(`sharedReceiptEventTouchesWorkflow({ closest: s => s.includes('#scanModal') ? {} : null })`), true, 'לחיצה בחלון המצלמה בבדיקה שורה-שורה — עריכת קליטה');
  // כרטיס פתוח, ואז קריאה בלבד (שמירה שרצה) — הלחיצה סוגרת את המצלמה בלי לסמן
  beep(r, BC.code_1231);
  assert.equal(cardOpen(r), true);
  r.run('canEditSharedReceipt = () => false');
  const toasts = r.toasts.length;
  cardClick(r, { scanMark: 'ok' });
  assert.equal(cardOpen(r), false);
  assert.equal(r.run('scanPurpose'), 'field');
  assert.equal(r.run(`$('scanModal').classList.contains('hidden')`), true);
  assert.equal(modalHidden(r), false, 'החלון חזר');
  assert.deepEqual(marks(r), [',,,,', ',']);
  assert.ok(r.toasts.length > toasts, 'ההודעה של קריאה בלבד');
  // סריקה בזמן קריאה בלבד — אותו דבר
  r.run('canEditSharedReceipt = () => true'); r.events.get('receiptLineScan:click')(); await settle();
  assert.equal(r.run('scanPurpose'), 'linecheck');
  r.run('canEditSharedReceipt = () => false');
  later(r); beep(r, BC.code_1231);
  assert.equal(cardOpen(r), false); assert.equal(r.run('scanPurpose'), 'field'); assert.deepEqual(marks(r), [',,,,', ',']);
  // קריאה בלבד — "סרוק מוצר" לא פותח את המצלמה
  r.events.get('receiptLineScan:click')();
  assert.equal(r.run('scanPurpose'), 'field');
  assert.equal(modalHidden(r), false, 'החלון נשאר');
});

test('12. הגרסה (160 ומעלה), כולל ההערה ב-service worker', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const v = html.match(/const APP_VERSION = '(\d+)'/)[1];
  assert.ok(Number(v) >= 160, v);
  assert.match(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), new RegExp('גרסת אפליקציה ' + v));
});
