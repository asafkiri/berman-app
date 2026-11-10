// v163 — בדיקה שורה-שורה: סריקה חוזרת שואלת "עוד כמה?", והמספר קובע את הסימון (כמו ביטבתה 411 ותנובה 156).
// 9.11.2026, בעל העסק, מתוך בדיקה אמיתית: (א) "הייתי רוצה שסריקה כזאת תגיד: סרקת עד עכשיו 1 — עוד כמה תרצה לסרוק? ובצד
// עדיין להשאיר כמה יש בתעודה"; (ב) "אני רושם ב'אחרת' את הכמות המדויקת שהבאתי, והוא לא משנה ל'הגיע' — זה לא אמור להיות ככה".
// אותם נתונים כמו ב-v160: תעודת משלוח (5 שורות) ונייר "ת.משלוח" קטן (אחיד פרוס ×5, אסלי ×2); המצלמה מזויפת, הברקוד דרך onScanned.
// מה שנבדק:
// 1. סריקה חוזרת של שורה שסומנה "אחרת" חלקית: "סרקת עד עכשיו 4 מתוך 6", הכמות בתעודה בצד, מה שחסר (2) כבר בשדה, "הוסף";
//    הסיכום "סה״כ 6 · כמו בתעודה" ומשתנה בהקלדה; מספר לא תקין לא נשמר; "הוסף" משלים ל"הגיע" (לא "אחרת" עם 6); הטיוטה, הרשימה.
//    (v165: כל סימון מהכרטיס — גם "הוסף" — סוגר את המצלמה וחוזר לרשימה, לשורה שסומנה; לסריקה הבאה לוחצים "סרוק מוצר" שוב.)
// 2. שורה שכבר "הגיע" כולה: "— הכל הגיע", השדה ריק; "הוסף" בלי מספר — לא; ✕ לא משנה; עוד 1 (Enter) — עודף; ואז "— עודף 1".
// 3. שורה שסומנה "לא הגיע": "סרקת עד עכשיו 0 מתוך 3", כל הכמות בשדה; Enter — "הגיע".
// 4. "לא נכון? תקן את הסה״כ": הכרטיס הקודם ("כבר סומנה: הגיעו 4 — אפשר לשנות", שלושת הכפתורים); "אחרת" שם מקליד סה״כ, לא תוספת; "לא הגיע".
// 5. "אחרת" במצלמה עם הכמות שבתעודה בדיוק — "הגיע"; עם אפס — "לא הגיע"; מספר אחר — "אחרת" כמו קודם.
// 6. ברשימה: הקלדת הכמות שבתעודה — הכרטיס ירוק ו"הגיע 6" דולק תוך כדי הקלדה, בלי ציור מחדש; 60 — כתום; 0 — אדום; יציאה
//    מהשדה — "הגיע" בנתונים ובטיוטה בלי ציור מחדש; הציור הבא מקפל; הקלדה אחרי שהתיישבה — שוב "אחרת"; אפס — "לא הגיע".
// 7. בלי יציאה מהשדה: "סיום" ו"סרוק מוצר" מיישבים; שוויון מלא מול "הגיע" ביד — עד הקליטה השמורה.
// 8. המקרה מהטלפון: מוצר שנסרק חלקית בקליטה (v162) ואז נסרק שוב בבדיקה — "סרקת עד עכשיו 3 מתוך 5", "הוסף" משלים.
// 9. קריאה בלבד — "הוסף" סוגר את המצלמה בלי לסמן.
// 10. הגרסה.
// הרצה: TZ=Asia/Jerusalem node --test tests/line-check-scan-add.test.mjs
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { app, delivery, printed, now, readPapers, receive, state } from './one-button-helpers.mjs';

const BIG = '244785003', SMALL = '290096103';
// אחיד פרוס ברמן 12 (+5 בנייר הקטן), לחמניות 10 בשקית 6, ברמן אסלי 5 פיתות 4 (+2), פיתות פרימיום 10 5, פיתות עננים 8 3; לחם מלא בטוב — לא בתעודות
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
const fakeCamera = r => r.run(`window.BarcodeDetector = class { detect() { return Promise.resolve([]); } };
  navigator.mediaDevices = { getUserMedia: async () => ({ getTracks: () => [], getVideoTracks: () => [] }) };
  $('scanVideo').play = async () => {};`);
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
// הבדיקה פתוחה, ו"סרוק מוצר" נלחץ — המצלמה (המזויפת) נפתחת עד הסוף
async function scanning(r) {
  r.run('startReceiptLineCheck()');
  r.events.get('receiptLineScan:click')();
  await settle();
  return r;
}
const click = (r, dataset) => r.run(`receiptLineCheckClick({ target: { closest: () => ({ dataset: ${JSON.stringify(dataset)} }) } })`);
const type = (r, dataset, value) => r.run(`receiptLineCheckInput({ target: { dataset: ${JSON.stringify(dataset)}, value: ${JSON.stringify(value)} } })`);
// יציאה משדה הכמות של שורה (focusout על הרשימה)
const blur = (r, lineGot) => r.events.get('receiptQuantityRows:focusout')({ target: { dataset: { lineGot } } });
const cardClick = (r, dataset) => r.run(`receiptLineScanCardClick({ target: { closest: () => ({ dataset: ${JSON.stringify(dataset)} }) } })`);
const cardType = (r, value) => r.run(`receiptLineScanCardInput({ target: { dataset: { scanGot: '' }, value: ${JSON.stringify(value)} } })`);
const cardEnter = r => r.events.get('scanLineCard:keydown')({ key: 'Enter', target: { dataset: { scanGot: '' } }, preventDefault() {} });
const beep = (r, code) => r.run(`onScanned(${JSON.stringify(code)})`);
const later = r => r.run('lastScanTime = 0'); // עברו שתי שניות — אותו ברקוד נחשב סריקה חדשה
const review = r => json(r, 'receiptQuantityReview');
const marks = r => review(r).docs.map(d => d.lines.map(l => l.mark + (l.got ? ':' + l.got : '')).join(','));
const card = r => r.run(`$('scanLineCard').innerHTML`);
const cardOpen = r => !r.run(`$('scanLineCard').classList.contains('hidden')`);
const overlay = r => r.run(`$('scanOverlayLabel').textContent + ' ' + $('scanOverlayCount').textContent + ' | ' + $('scanOverlayName').textContent`);
const draftMarks = r => JSON.parse(r.storage.get('bm_receipt_draft')).quantityReview.docs.map(d => d.lines.map(l => l.mark + (l.got ? ':' + l.got : '')).join(','));
const rows = r => r.run(`$('receiptQuantityRows').innerHTML`);
const progress = r => r.run(`$('receiptQuantityProgress').textContent`);
const sum = r => r.run(`$('scanLineSum').textContent`);
const tone = (r, di, li) => r.run(`$('lineCheck_${di}_${li}').className`);
// v165: כל סימון מהכרטיס סוגר את המצלמה וחוזר לרשימה, לשורה שסומנה (מודגשת); למוצר הבא — "סרוק מוצר" שוב
function returned(r, id) {
  assert.equal(cardOpen(r), false, 'הכרטיס נסגר'); assert.equal(r.run('scanPurpose'), 'field');
  assert.equal(r.run(`$('scanModal').classList.contains('hidden')`), true, 'המצלמה נסגרה');
  assert.equal(r.run(`$('receiptQuantityModal').classList.contains('hidden')`), false, 'הרשימה חזרה');
  assert.equal(r.run(`$('${id}').classList.contains('ring-4')`), true, id + ' — השורה שסומנה מודגשת');
}
async function rescan(r) { r.events.get('receiptLineScan:click')(); await settle(); assert.equal(r.run('scanPurpose'), 'linecheck', 'המצלמה נפתחה שוב'); return r; }
// ה-HTML של שורה אחת (lineCheck_di_li) מתוך הרשימה — עד השורה הבאה או סוף התעודה
function row(r, di, li) {
  const h = rows(r), i = h.indexOf('<div id="lineCheck_' + di + '_' + li + '"');
  assert.ok(i >= 0, 'שורה ' + di + ':' + li + ' קיימת');
  const ends = [h.indexOf('<div id="lineCheck_', i + 10), h.indexOf('<section', i), h.indexOf('</section>', i)].filter(x => x > 0);
  return h.slice(i, Math.min.apply(null, ends));
}
function markRestOk(r) { review(r).docs.forEach((d, di) => d.lines.forEach((l, li) => { if (!l.mark) click(r, { lineMark: di + ':' + li + ':ok' }); })); }
async function saveAfterCheck(r) {
  if (r.run('currentView') === 'reconcile') r.run('aiApplyInvoiceResult()');
  assert.ok(r.run('!!pendingReceipt'), 'הסיכום פתוח');
  await r.run('confirmReceipt()'); await settle();
  return json(r, 'receipts[0]');
}
const items = rc => rc.items.map(l => [l.productId, l.qty, l.noteQty == null ? null : l.noteQty]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));

test('1. סריקה חוזרת של שורה שסומנה "אחרת" חלקית: "סרקת עד עכשיו 4 מתוך 6", מה שחסר בשדה, ו"הוסף" משלים ל"הגיע"', async () => {
  const r = await scanning(await twoPapers());
  beep(r, BC.code_1231); cardClick(r, { scanMark: 'qty' }); cardType(r, '4'); cardClick(r, { scanSave: '' });
  returned(r, 'lineCheck_0_1'); // v165
  assert.deepEqual(marks(r), [',qty:4,,,', ',']);
  await rescan(r); beep(r, BC.code_1231);
  assert.equal(cardOpen(r), true);
  assert.deepEqual(json(r, '({ di: receiptLineScanCard.di, li: receiptLineScanCard.li, addQty: receiptLineScanCard.addQty, askQty: receiptLineScanCard.askQty, got: receiptLineScanCard.got })'),
    { di: 0, li: 1, addQty: true, askQty: false, got: '2' });
  const c = card(r);
  assert.match(strip(c), /^שורה 2 בתעודה 1 מתוך 2 לחמניות 10 בשקית אין מחיר קופה — בדוק בקופה ועדכן סרקת עד עכשיו 4 מתוך 6 6 יח׳ בתעודה עוד כמה\? הוסף סה״כ 6 · כמו בתעודה לא נכון\? תקן את הסה״כ$/);
  assert.match(c, /text-amber-700[^>]*>סרקת עד עכשיו 4 מתוך 6</, 'חלקי — כתום');
  assert.match(c, /id="scanLineGot" data-scan-got[^>]*value="2"/, 'מה שחסר — בשדה');
  assert.match(c, /data-scan-save[^>]*>הוסף</); assert.match(c, /data-scan-mark="fix"/); assert.match(c, /data-scan-dismiss/);
  assert.doesNotMatch(c, /data-scan-mark="(ok|qty|none)"|כבר סומנה|כמה הגיע\?/);
  assert.match(c, /text-3xl[^>]*>6<\/div><div[^>]*>יח׳ בתעודה</, 'הכמות בתעודה נשארת בצד, גדולה');
  // הסיכום תוך כדי הקלדה — הסה״כ אחרי ההוספה; מספר לא תקין לא נשמר
  cardType(r, '1'); assert.equal(sum(r), 'סה״כ 5 · חוסר 1');
  cardType(r, '3'); assert.equal(sum(r), 'סה״כ 7 · עודף 1');
  cardType(r, 'x'); assert.equal(sum(r), 'הקלד כמה עוד הגיעו');
  assert.equal(r.run('receiptLineScanSave()'), false); assert.equal(cardOpen(r), true);
  assert.match(strip(card(r)), /הקלד מספר — כמה עוד הגיעו/); assert.deepEqual(marks(r), [',qty:4,,,', ','], 'לא נשמר');
  // "הוסף" — 4 + 2 = 6: "הגיע", לא "אחרת" עם 6
  const ticks = r.callbacks.length;
  cardType(r, '2'); cardClick(r, { scanSave: '' });
  returned(r, 'lineCheck_0_1'); // v165: "הוסף" — המצלמה נסגרת והרשימה חוזרת על השורה
  assert.deepEqual(marks(r), [',ok,,,', ',']);
  assert.deepEqual(draftMarks(r), [',ok,,,', ','], 'נשמר בטיוטה');
  assert.equal(json(r, 'receiptQuantityReview.rows.find(x => x.productId === "code_1231")').kind, 'match');
  assert.equal(r.callbacks.length, ticks, 'המצלמה נסגרה — לא תוזמן טיק של סריקה');
  // ברשימה — מקופלת וירוקה, כמו "הגיע" ביד
  assert.match(strip(row(r, 0, 1)), /^לחמניות 10 בשקית הגיע · 6 יח׳ אין מחיר קופה — אפשר להשלים כאן כמה עובר בקופה \(כולל מע״מ\) ₪ שנה$/);
  assert.equal(progress(r), 'סומנו 1 מתוך 5 שורות');
  await rescan(r);
  assert.equal(overlay(r), 'סומנו 1 מתוך 5 | ', 'המונה על המצלמה מעודכן');
});

test('2. שורה שכבר "הגיע" כולה: "— הכל הגיע" והשדה ריק; ✕ לא משנה; עוד 1 — עודף, ואז "— עודף 1"', async () => {
  const r = await scanning(await twoPapers());
  beep(r, BC.code_1231); cardClick(r, { scanMark: 'ok' });
  returned(r, 'lineCheck_0_1'); // v165
  await rescan(r); beep(r, BC.code_1231);
  const c = card(r);
  assert.match(strip(c), /סרקת עד עכשיו 6 מתוך 6 — הכל הגיע 6 יח׳ בתעודה עוד כמה\? הוסף הקלד כמה עוד הגיעו לא נכון\? תקן את הסה״כ$/);
  assert.match(c, /text-emerald-700[^>]*>סרקת עד עכשיו 6 מתוך 6 — הכל הגיע</);
  assert.match(c, /data-scan-got[^>]*value=""/, 'כלום לא חסר — השדה ריק');
  assert.equal(r.run('receiptLineScanSave()'), false, '"הוסף" בלי מספר — לא');
  assert.match(strip(card(r)), /הקלד מספר — כמה עוד הגיעו/);
  assert.equal(r.run('scanPurpose'), 'linecheck', 'מספר לא תקין — הכרטיס והמצלמה נשארים');
  const ticks = r.callbacks.length;
  cardClick(r, { scanDismiss: '' });
  assert.equal(cardOpen(r), false); assert.deepEqual(marks(r), [',ok,,,', ',']); assert.equal(r.callbacks.length, ticks + 1);
  assert.equal(r.run('scanPurpose'), 'linecheck', '✕ בכרטיס — המצלמה נשארת');
  // עוד אחת — עודף
  later(r); beep(r, BC.code_1231); cardType(r, '1');
  assert.equal(sum(r), 'סה״כ 7 · עודף 1');
  cardEnter(r);
  returned(r, 'lineCheck_0_1');
  assert.deepEqual(marks(r), [',qty:7,,,', ',']);
  assert.equal(progress(r), 'סומנו 1 מתוך 5 שורות · עודף 1 יח׳');
  assert.equal(json(r, 'receiptQuantityReview.rows.find(x => x.productId === "code_1231")').kind, 'surplus');
  await rescan(r); beep(r, BC.code_1231);
  assert.match(strip(card(r)), /סרקת עד עכשיו 7 מתוך 6 — עודף 1 6 יח׳ בתעודה עוד כמה\?/);
  assert.match(card(r), /text-amber-700[^>]*>סרקת עד עכשיו 7/); assert.match(card(r), /data-scan-got[^>]*value=""/);
  cardClick(r, { scanDismiss: '' });
});

test('3. שורה שסומנה "לא הגיע" ואז נסרקה: "סרקת עד עכשיו 0 מתוך 3", כל הכמות בשדה; Enter — "הגיע"', async () => {
  const r = await scanning(await twoPapers());
  beep(r, BC.code_2387); cardClick(r, { scanMark: 'none' });
  returned(r, 'lineCheck_0_4'); // v165
  assert.deepEqual(marks(r), [',,,,none', ',']);
  assert.match(strip(row(r, 0, 4)), /^פיתות עננים 8 לא הגיע · 0 מתוך 3 אין מחיר קופה — אפשר להשלים כאן כמה עובר בקופה \(כולל מע״מ\) ₪ שנה$/);
  await rescan(r); beep(r, BC.code_2387);
  const c = card(r);
  assert.match(strip(c), /סרקת עד עכשיו 0 מתוך 3 3 יח׳ בתעודה עוד כמה\? הוסף סה״כ 3 · כמו בתעודה/);
  assert.match(c, /text-rose-700[^>]*>סרקת עד עכשיו 0 מתוך 3</); assert.match(c, /data-scan-got[^>]*value="3"/);
  cardEnter(r);
  returned(r, 'lineCheck_0_4');
  assert.deepEqual(marks(r), [',,,,ok', ',']);
  assert.match(strip(row(r, 0, 4)), /^פיתות עננים 8 הגיע · 3 יח׳ אין מחיר קופה — אפשר להשלים כאן כמה עובר בקופה \(כולל מע״מ\) ₪ שנה$/);
  assert.equal(progress(r), 'סומנו 1 מתוך 5 שורות');
});

test('4. "לא נכון? תקן את הסה״כ" — הכרטיס הקודם עם שלושת הכפתורים; "אחרת" שם מקליד סה״כ, לא תוספת; "לא הגיע"', async () => {
  const r = await scanning(await twoPapers());
  beep(r, BC.code_1231); cardClick(r, { scanMark: 'qty' }); cardType(r, '4'); cardClick(r, { scanSave: '' });
  returned(r, 'lineCheck_0_1'); // v165
  await rescan(r); beep(r, BC.code_1231);
  cardClick(r, { scanMark: 'fix' });
  assert.equal(cardOpen(r), true);
  assert.equal(r.run('scanPurpose'), 'linecheck', '"תקן את הסה״כ" אינו סימון — המצלמה נשארת');
  const c = card(r);
  assert.match(strip(c), /כבר סומנה: הגיעו 4 — אפשר לשנות 6 יח׳ בתעודה הגיע 6 אחרת לא הגיע$/);
  assert.match(c, /data-scan-mark="ok"[\s\S]*data-scan-mark="qty"[\s\S]*data-scan-mark="none"/);
  assert.doesNotMatch(c, /data-scan-got|עוד כמה|data-scan-mark="fix"|סרקת עד עכשיו/);
  assert.deepEqual(json(r, '[receiptLineScanCard.addQty, receiptLineScanCard.askQty, receiptLineScanCard.got]'), [false, false, '']);
  // "אחרת" — שדה ריק, "כמה הגיע?", סה״כ: 3 הם 3 (לא 4 + 3)
  cardClick(r, { scanMark: 'qty' });
  assert.match(card(r), /כמה הגיע\?<input id="scanLineGot" data-scan-got[^>]*value=""/); assert.match(card(r), /data-scan-save[^>]*>שמור</);
  cardType(r, '3'); assert.equal(sum(r), 'התקבלו 3 · חוסר 3');
  cardClick(r, { scanSave: '' });
  returned(r, 'lineCheck_0_1');
  assert.deepEqual(marks(r), [',qty:3,,,', ',']);
  assert.equal(progress(r), 'סומנו 1 מתוך 5 שורות · חוסר 3 יח׳');
  // "לא הגיע" מהכרטיס הקודם
  await rescan(r); beep(r, BC.code_1231);
  assert.match(strip(card(r)), /סרקת עד עכשיו 3 מתוך 6/);
  cardClick(r, { scanMark: 'fix' }); cardClick(r, { scanMark: 'none' });
  returned(r, 'lineCheck_0_1');
  assert.deepEqual(marks(r), [',none,,,', ',']);
  assert.equal(progress(r), 'סומנו 1 מתוך 5 שורות · חוסר 6 יח׳');
});

test('5. "אחרת" במצלמה עם הכמות שבתעודה בדיוק — "הגיע"; עם אפס — "לא הגיע"; מספר אחר — "אחרת" כמו קודם', async () => {
  const r = await scanning(await twoPapers());
  beep(r, BC.code_1231); cardClick(r, { scanMark: 'qty' }); cardType(r, '6');
  assert.equal(sum(r), 'כמו בתעודה');
  cardClick(r, { scanSave: '' });
  returned(r, 'lineCheck_0_1'); // v165
  assert.deepEqual(marks(r), [',ok,,,', ','], '6 מתוך 6 — "הגיע"');
  assert.equal(progress(r), 'סומנו 1 מתוך 5 שורות');
  await rescan(r); beep(r, BC.code_2387); cardClick(r, { scanMark: 'qty' }); cardType(r, '0'); cardEnter(r);
  returned(r, 'lineCheck_0_4');
  assert.deepEqual(marks(r), [',ok,,,none', ','], 'אפס — "לא הגיע"');
  assert.equal(progress(r), 'סומנו 2 מתוך 5 שורות · חוסר 3 יח׳');
  await rescan(r); beep(r, BC.code_2381); cardClick(r, { scanMark: 'qty' }); cardType(r, '4'); cardClick(r, { scanSave: '' });
  returned(r, 'lineCheck_0_3');
  assert.deepEqual(marks(r), [',ok,,qty:4,none', ','], 'מספר אחר — "אחרת" עם המספר, כמו קודם');
  assert.match(strip(row(r, 0, 1)), /^לחמניות 10 בשקית הגיע · 6 יח׳ אין מחיר קופה — אפשר להשלים כאן כמה עובר בקופה \(כולל מע״מ\) ₪ שנה$/);
  assert.match(strip(row(r, 0, 4)), /^פיתות עננים 8 לא הגיע · 0 מתוך 3 אין מחיר קופה — אפשר להשלים כאן כמה עובר בקופה \(כולל מע״מ\) ₪ שנה$/);
  assert.match(row(r, 0, 3), /data-line-got="0:3"[^>]*value="4"/);
  assert.equal(progress(r), 'סומנו 3 מתוך 5 שורות · חוסר 4 יח׳');
});

test('6. ברשימה: הכמות שבתעודה — ירוק ו"הגיע" דולק תוך כדי הקלדה בלי ציור מחדש; יציאה מהשדה — "הגיע"; הציור הבא מקפל', async () => {
  const r = await twoPapers();
  r.run('startReceiptLineCheck()');
  click(r, { lineMark: '0:1:qty' });
  assert.match(row(r, 0, 1), /data-line-mark="0:1:qty" aria-pressed="true"/);
  assert.match(row(r, 0, 1), /class="rounded-2xl border-2 p-3 mb-2\.5 shadow-sm border-amber-300 bg-amber-50"/);
  const before = rows(r);
  type(r, { lineGot: '0:1' }, '6');
  assert.equal(rows(r), before, 'בלי ציור מחדש תוך כדי הקלדה — השדה והמקלדת נשארים');
  assert.deepEqual(marks(r), [',qty:6,,,', ','], 'בנתונים עדיין "אחרת" עם 6 — עד שעוזבים את השדה');
  assert.equal(tone(r, 0, 1), 'rounded-2xl border-2 p-3 mb-2.5 shadow-sm border-emerald-300 bg-emerald-50', 'הכרטיס ירוק');
  assert.equal(r.run(`$('lineCheckSum_0_1').textContent`), 'כמו בתעודה');
  assert.equal(progress(r), 'סומנו 1 מתוך 5 שורות');
  // ממשיכים להקליד: 60 — שוב כתום ו"אחרת"; 0 — אדום; ריק — כתום ולא סומנה
  type(r, { lineGot: '0:1' }, '60');
  assert.match(tone(r, 0, 1), /border-amber-300 bg-amber-50$/); assert.deepEqual(marks(r), [',qty:60,,,', ',']);
  assert.equal(progress(r), 'סומנו 1 מתוך 5 שורות · עודף 54 יח׳');
  type(r, { lineGot: '0:1' }, '0');
  assert.match(tone(r, 0, 1), /border-rose-300 bg-rose-50$/, 'אפס — אדום');
  type(r, { lineGot: '0:1' }, '');
  assert.match(tone(r, 0, 1), /border-amber-300 bg-amber-50$/); assert.equal(progress(r), 'סומנו 0 מתוך 5 שורות');
  type(r, { lineGot: '0:1' }, '6');
  // יציאה מהשדה — "הגיע" בנתונים ובטיוטה; הרשימה לא צוירה מחדש (הלחיצה שגרמה ליציאה לא נבלעת)
  const shown = rows(r);
  blur(r, '0:1');
  assert.deepEqual(marks(r), [',ok,,,', ',']);
  assert.deepEqual(draftMarks(r), [',ok,,,', ',']);
  assert.equal(rows(r), shown, 'בלי ציור מחדש ביציאה מהשדה');
  // הקלדה אחרי שהתיישבה (השדה עדיין על המסך) — שוב "אחרת" עם המספר; ושוב יציאה
  type(r, { lineGot: '0:1' }, '60'); assert.deepEqual(marks(r), [',qty:60,,,', ',']);
  type(r, { lineGot: '0:1' }, '6'); blur(r, '0:1'); assert.deepEqual(marks(r), [',ok,,,', ',']);
  // הפעולה הבאה מציירת — מקופלת וירוקה, בדיוק כמו "הגיע" ביד
  click(r, { lineMark: '0:0:ok' });
  assert.match(strip(row(r, 0, 1)), /^לחמניות 10 בשקית הגיע · 6 יח׳ אין מחיר קופה — אפשר להשלים כאן כמה עובר בקופה \(כולל מע״מ\) ₪ שנה$/);
  assert.equal(progress(r), 'סומנו 2 מתוך 5 שורות');
  // "שנה" פותח אותה כמו שורת "הגיע": "הגיע 6" דולק, בלי שדה
  click(r, { lineOpen: '0:1' });
  assert.match(row(r, 0, 1), /data-line-mark="0:1:ok" aria-pressed="true"/); assert.doesNotMatch(row(r, 0, 1), /data-line-got/);
  // אפס ויציאה — "לא הגיע"
  click(r, { lineMark: '0:3:qty' }); type(r, { lineGot: '0:3' }, '0'); blur(r, '0:3');
  assert.deepEqual(marks(r), ['ok,ok,,none,', 'ok,'], 'v164: "הגיע" על אחיד פרוס סימן גם את השורה שלו בנייר הקטן');
  click(r, { lineOpen: '0:0' });
  assert.match(strip(row(r, 0, 3)), /^פיתות פרימיום 10 לא הגיע · 0 מתוך 5 אין מחיר קופה — אפשר להשלים כאן כמה עובר בקופה \(כולל מע״מ\) ₪ שנה$/);
  // מספר אחר — נשאר "אחרת" פתוח, כמו קודם
  click(r, { lineMark: '0:4:qty' }); type(r, { lineGot: '0:4' }, '2'); blur(r, '0:4');
  assert.deepEqual(marks(r), ['ok,ok,,none,qty:2', 'ok,']);
  click(r, { lineOpen: '0:0' });
  assert.match(row(r, 0, 4), /data-line-got="0:4"[^>]*value="2"/); assert.match(row(r, 0, 4), /data-line-mark="0:4:qty" aria-pressed="true"/);
  assert.equal(progress(r), 'סומנו 4 מתוך 5 שורות · חוסר 6 יח׳');
});

test('7. בלי יציאה מהשדה: "סיום" ו"סרוק מוצר" מיישבים; שוויון מלא מול "הגיע" ביד — עד הקליטה השמורה', async () => {
  // א: הכול "הגיע" ביד חוץ מלחמניות — "אחרת" עם 6, והשדה לא ננטש; "סיום" מיישב ושומר
  const a = await twoPapers();
  a.run('startReceiptLineCheck()');
  review(a).docs.forEach((d, di) => d.lines.forEach((l, li) => { if (!(di === 0 && li === 1)) click(a, { lineMark: di + ':' + li + ':ok' }); }));
  click(a, { lineMark: '0:1:qty' }); type(a, { lineGot: '0:1' }, '6');
  assert.deepEqual(marks(a), ['ok,qty:6,ok,ok,ok', 'ok,ok']);
  assert.equal(a.run(`$('receiptQuantityConfirm').textContent`), 'סיום — שמור את הבדיקה');
  const rowsA = json(a, 'receiptQuantityReview.rows');
  assert.equal(a.run('finishReceiptLineCheck()'), true);
  assert.deepEqual(marks(a), ['ok,ok,ok,ok,ok', 'ok,ok'], '"סיום" יישב את השורה');
  // ב: הכול ביד
  const b = await twoPapers();
  b.run('startReceiptLineCheck()'); markRestOk(b);
  assert.deepEqual(rowsA, json(b, 'receiptQuantityReview.rows'), 'אותן שורות לכל מוצר עוד לפני "סיום"');
  assert.equal(b.run('finishReceiptLineCheck()'), true);
  assert.deepEqual(json(a, 'receiptList'), json(b, 'receiptList'));
  assert.deepEqual(json(a, 'receiptList.map(l => l.productId + " " + l.qty).sort()'), ['code_101 17', 'code_1231 6', 'code_238 6', 'code_2381 5', 'code_2387 3']);
  const savedA = await saveAfterCheck(a), savedB = await saveAfterCheck(b);
  assert.deepEqual(items(savedA), items(savedB));
  assert.deepEqual({ ...savedA.quantityCheck, confirmedAt: null }, { ...savedB.quantityCheck, confirmedAt: null }, 'מה שנשמר בקליטה — זהה');
  for (const k of ['noteParts', 'paperDocs', 'units', 'count', 'status', 'unresolvedUnitsGap', 'noDoc', 'vatPct']) assert.deepEqual(savedA[k], savedB[k], k);
  // "סרוק מוצר" מיישב לפני שהרשימה מתחבאת — המונה על המצלמה כבר סופר את השורה, ובחזרה היא מקופלת
  const c = await twoPapers();
  c.run('startReceiptLineCheck()');
  click(c, { lineMark: '0:1:qty' }); type(c, { lineGot: '0:1' }, '6');
  c.events.get('receiptLineScan:click')(); await settle();
  assert.deepEqual(marks(c), [',ok,,,', ',']);
  assert.equal(c.run(`$('scanOverlayCount').textContent`), '1 מתוך 5');
  c.run('closeScanner()');
  assert.match(strip(row(c, 0, 1)), /^לחמניות 10 בשקית הגיע · 6 יח׳ אין מחיר קופה — אפשר להשלים כאן כמה עובר בקופה \(כולל מע״מ\) ₪ שנה$/);
});

test('8. המקרה מהטלפון: מוצר שנסרק חלקית בקליטה (v162) ואז נסרק שוב בבדיקה — "סרקת עד עכשיו 3 מתוך 5", "הוסף" משלים', async () => {
  const r = await twoPapers();
  r.run(`receiptList = [{ productId: 'code_2381', name: 'פיתות פרימיום 10', barcode: '4033033', qty: 3 }]; saveReceiptDraft(); receiptCountingMode = 'scan'; testConfirms = [];`);
  r.run('startReceiptLineCheck()');
  assert.equal(r.run('testConfirms.length'), 1); r.run('testConfirms[0].cb()');
  assert.deepEqual(marks(r), [',,,qty:3,', ','], 'מה שנסרק עבר לרשימה כ"אחרת" עם 3');
  r.events.get('receiptLineScan:click')(); await settle();
  assert.equal(r.run(`$('scanOverlayCount').textContent`), '1 מתוך 5');
  beep(r, BC.code_2381);
  assert.match(strip(card(r)), /^שורה 4 בתעודה 1 מתוך 2 פיתות פרימיום 10 אין מחיר קופה — בדוק בקופה ועדכן סרקת עד עכשיו 3 מתוך 5 5 יח׳ בתעודה עוד כמה\? הוסף סה״כ 5 · כמו בתעודה לא נכון\? תקן את הסה״כ$/);
  assert.match(card(r), /data-scan-got[^>]*value="2"/);
  cardClick(r, { scanSave: '' });
  returned(r, 'lineCheck_0_3'); // v165
  assert.deepEqual(marks(r), [',,,ok,', ',']);
  assert.match(strip(row(r, 0, 3)), /^פיתות פרימיום 10 הגיע · 5 יח׳ אין מחיר קופה — אפשר להשלים כאן כמה עובר בקופה \(כולל מע״מ\) ₪ שנה$/);
  assert.equal(progress(r), 'סומנו 1 מתוך 5 שורות');
});

test('9. קריאה בלבד — "הוסף" בכרטיס של סריקה חוזרת סוגר את המצלמה בלי לסמן', async () => {
  const r = await scanning(await twoPapers());
  beep(r, BC.code_1231); cardClick(r, { scanMark: 'qty' }); cardType(r, '4'); cardClick(r, { scanSave: '' });
  returned(r, 'lineCheck_0_1'); // v165
  await rescan(r); beep(r, BC.code_1231);
  assert.equal(cardOpen(r), true);
  r.run('canEditSharedReceipt = () => false');
  const toasts = r.toasts.length;
  cardClick(r, { scanSave: '' });
  assert.equal(cardOpen(r), false); assert.equal(r.run('scanPurpose'), 'field');
  assert.equal(r.run(`$('scanModal').classList.contains('hidden')`), true);
  assert.deepEqual(marks(r), [',qty:4,,,', ',']);
  assert.ok(r.toasts.length > toasts, 'ההודעה של קריאה בלבד');
});

test('10. הגרסה (163 ומעלה), כולל ההערה ב-service worker', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const v = html.match(/const APP_VERSION = '(\d+)'/)[1];
  assert.ok(Number(v) >= 163, v);
  assert.match(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), new RegExp('גרסת אפליקציה ' + v));
});
