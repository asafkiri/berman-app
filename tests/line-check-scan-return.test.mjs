// v165 — בדיקה שורה-שורה: הסימון מהכרטיס שמעל המצלמה מחזיר לשורה של המוצר ברשימה (כמו ביטבתה 413).
// 10.11.2026, בעל העסק, מתוך בדיקה אמיתית בטלפון: "אחרי שאני מסמן מוצר ומאשר, או רושם 'לא קיבלתי' או 'קיבלתי אחרת', הוא נשאר
// במצלמה וכביכול ממשיך למוצר הבא. אני רוצה שאחרי שאישרת מוצר, או רשמת כמות אחרת, או 'לא הגיע' — וגם אם המוצר הוא פלוס
// בכלל — שיצא מהמוצר וילך לשורה של המוצר". עד 164 הכרטיס נסגר והמצלמה המשיכה לסרוק (עם "✓ שם · הגיע 6" מעליה); מעכשיו כל
// סימון סוגר את המצלמה, הרשימה חוזרת, והשורה שסומנה מודגשת ונגללת למרכז (receiptLineScanReturn → closeScanner →
// receiptLineScanClosed → receiptLineReveal). לסריקה הבאה — "סרוק מוצר" שבתחתית הקבועה.
// אותם נתונים כמו בבדיקות הסריקה (v160): תעודת משלוח (אחיד פרוס 12, לחמניות 6, אסלי 4, פיתות פרימיום 5, פיתות עננים 3) ונייר
// "ת.משלוח" קטן (אחיד פרוס 5, אסלי 2); לחם מלא בטוב — לא בתעודות. המצלמה מזויפת, הברקוד דרך onScanned.
// מה שנבדק:
// 1. "הגיע N": המצלמה נסגרת, הרשימה חוזרת, רק השורה שסומנה מודגשת ונגללת; הטיוטה כמו ביד; בלי טיק של סריקה.
// 2. "אחרת" עם כמות (שמור / Enter): חזרה לשורה — פתוחה עם הכמות; "לא הגיע": חזרה לשורה — מקופלת ואדומה.
// 3. סריקה חוזרת — "עוד כמה?" + "הוסף": חזרה לשורה שהושלמה.
// 4. מוצר שאינו בתעודה ("פלוס"): "הוסף" — חזרה לכרטיס הצהוב שלו ב"הגיע משהו נוסף"; סריקה חוזרת — "עדכן" — שוב אליו.
// 5. מה שאינו סימון משאיר את המצלמה: ✕ בכרטיס (והסריקה ממשיכה), "תקן את הסה״כ", כמות לא תקינה, ברקוד לא מוכר.
// 6. "סרוק מוצר" שוב: המצלמה נפתחת נקייה — המונה מעודכן, בלי כרטיס ובלי "מה סומן זה עתה", ואותו ברקוד הוא סריקה חוזרת.
// 7. מוצר בשני ניירות (v164): "הגיע 17" מחזיר לכרטיס של הקבוצה (השורה הראשונה), גם כשנסרק אחרי שהרשימה הייתה גלולה.
// 8. שוויון: קליטה שסומנה כולה בסריקה (סריקה לכל מוצר) זהה לסימון ביד — השורות, הספירה, הקליטה השמורה.
// 9. הגרסה.
// הרצה: TZ=Asia/Jerusalem node --test tests/line-check-scan-return.test.mjs
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
// המצלמה המזויפת: BarcodeDetector מובנה שלא קורא כלום, זרם בלי מסלולים, וידאו שמתנגן
const fakeCamera = r => r.run(`window.BarcodeDetector = class { detect() { return Promise.resolve([]); } };
  navigator.mediaDevices = { getUserMedia: async () => ({ getTracks: () => [], getVideoTracks: () => [] }) };
  $('scanVideo').play = async () => {};`);
// קליטה פתוחה עם שני הניירות (הקטן מתווסף לבד)
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
const cardClick = (r, dataset) => r.run(`receiptLineScanCardClick({ target: { closest: () => ({ dataset: ${JSON.stringify(dataset)} }) } })`);
const cardType = (r, value) => r.run(`receiptLineScanCardInput({ target: { dataset: { scanGot: '' }, value: ${JSON.stringify(value)} } })`);
const cardEnter = r => r.events.get('scanLineCard:keydown')({ key: 'Enter', target: { dataset: { scanGot: '' } }, preventDefault() {} });
const beep = (r, code) => r.run(`onScanned(${JSON.stringify(code)})`);
const later = r => r.run('lastScanTime = 0'); // עברו שתי שניות — אותו ברקוד נחשב סריקה חדשה
const review = r => json(r, 'receiptQuantityReview');
const marks = r => review(r).docs.map(d => d.lines.map(l => l.mark + (l.got ? ':' + l.got : '')).join(','));
const card = r => r.run(`$('scanLineCard').innerHTML`);
const cardOpen = r => !r.run(`$('scanLineCard').classList.contains('hidden')`);
const cameraOpen = r => !r.run(`$('scanModal').classList.contains('hidden')`);
const listOpen = r => !r.run(`$('receiptQuantityModal').classList.contains('hidden')`);
const overlay = r => r.run(`$('scanOverlayLabel').textContent + ' ' + $('scanOverlayCount').textContent + ' | ' + $('scanOverlayName').textContent`);
const draftMarks = r => JSON.parse(r.storage.get('bm_receipt_draft')).quantityReview.docs.map(d => d.lines.map(l => l.mark + (l.got ? ':' + l.got : '')).join(','));
const rows = r => r.run(`$('receiptQuantityRows').innerHTML`);
const progress = r => r.run(`$('receiptQuantityProgress').textContent`);
// ה-HTML של שורה אחת (lineCheck_di_li) מתוך הרשימה — עד השורה הבאה או סוף התעודה
function row(r, di, li) {
  const h = rows(r), i = h.indexOf('<div id="lineCheck_' + di + '_' + li + '"');
  assert.ok(i >= 0, 'שורה ' + di + ':' + li + ' קיימת');
  const ends = [h.indexOf('<div id="lineCheck_', i + 10), h.indexOf('<section', i), h.indexOf('</section>', i)].filter(x => x > 0);
  return h.slice(i, Math.min.apply(null, ends));
}
// ההדגשה (ring-4) מוסרת מהצומת לפני הפעולה — בדום המזויף querySelectorAll אינו מסיר אותה, ולכן ההדגשה שנבדקת היא של הפעולה הזאת
const unring = (r, id) => r.run(`$('${id}').classList.remove('ring-4', 'ring-blue-300')`);
const ringed = (r, id) => r.run(`$('${id}').classList.contains('ring-4') && $('${id}').classList.contains('ring-blue-300')`);
// הסימון חזר לרשימה: המצלמה סגורה, הכרטיס סגור, הרשימה פתוחה, והשורה מודגשת
function returned(r, id) {
  assert.equal(cardOpen(r), false, 'הכרטיס נסגר'); assert.equal(r.run('receiptLineScanCard'), null);
  assert.equal(cameraOpen(r), false, 'המצלמה נסגרה'); assert.equal(r.run('scanPurpose'), 'field');
  assert.equal(r.run('!!scanStream'), false, 'הזרם נעצר');
  assert.equal(listOpen(r), true, 'הרשימה חזרה');
  assert.equal(ringed(r, id), true, id + ' — השורה שסומנה מודגשת');
  assert.equal(r.run('receiptLineScanLast'), null);
}
// המצלמה נשארה: הרשימה מוסתרת, המצלמה פתוחה, הסריקה במצב שורה-שורה
function stayed(r) {
  assert.equal(cameraOpen(r), true, 'המצלמה נשארת'); assert.equal(r.run('scanPurpose'), 'linecheck');
  assert.equal(listOpen(r), false, 'הרשימה עדיין מוסתרת');
}
async function rescan(r) { r.events.get('receiptLineScan:click')(); await settle(); assert.equal(r.run('scanPurpose'), 'linecheck', 'המצלמה נפתחה שוב'); return r; }
function markRestOk(r) { review(r).docs.forEach((d, di) => d.lines.forEach((l, li) => { if (!l.mark) click(r, { lineMark: di + ':' + li + ':ok' }); })); }
// מהבדיקה ועד השמירה, כמו בטלפון: מסך ההבדלים (אם יש) → "קלוט" → הסיכום → "אשר וקלוט"
async function saveAfterCheck(r) {
  if (r.run('currentView') === 'reconcile') r.run('aiApplyInvoiceResult()');
  assert.ok(r.run('!!pendingReceipt'), 'הסיכום פתוח');
  await r.run('confirmReceipt()'); await settle();
  return json(r, 'receipts[0]');
}
const items = rc => rc.items.map(l => [l.productId, l.qty, l.noteQty == null ? null : l.noteQty]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));

test('1. "הגיע N" מהכרטיס: המצלמה נסגרת, הרשימה חוזרת, והשורה שסומנה מודגשת — בלי טיק של סריקה; הטיוטה כמו ביד', async () => {
  const r = await scanning(await twoPapers());
  assert.equal(cameraOpen(r), true); assert.equal(listOpen(r), false);
  unring(r, 'lineCheck_0_1');
  beep(r, BC.code_1231); // לחמניות — שורה 2 בתעודת המשלוח
  assert.equal(cardOpen(r), true);
  stayed(r);
  const ticks = r.callbacks.length;
  cardClick(r, { scanMark: 'ok' });
  returned(r, 'lineCheck_0_1');
  assert.equal(r.callbacks.length, ticks, 'המצלמה נסגרה — לא תוזמן טיק של סריקה');
  assert.deepEqual(marks(r), [',ok,,,', ',']);
  assert.deepEqual(draftMarks(r), [',ok,,,', ','], 'נשמר בטיוטה כמו סימון ביד');
  assert.match(strip(row(r, 0, 1)), /^לחמניות 10 בשקית הגיע · 6 יח׳ שנה$/, 'מקופלת וירוקה, כמו "הגיע" ביד');
  assert.equal(progress(r), 'סומנו 1 מתוך 5 שורות');
  assert.equal(r.run(`$('receiptQuantityTitle').textContent`), 'בדיקה שורה-שורה');
  // שאר השורות — לא מודגשות
  for (const id of ['lineCheck_0_0', 'lineCheck_0_2', 'lineCheck_0_3', 'lineCheck_0_4']) assert.equal(ringed(r, id), false, id);
  // ברשימה אפשר להמשיך ביד — והסימון מהסריקה נשאר
  click(r, { lineMark: '0:3:none' });
  assert.deepEqual(marks(r), [',ok,,none,', ',']);
});

test('2. "אחרת" עם כמות (שמור / Enter) — חזרה לשורה פתוחה עם הכמות; "לא הגיע" — חזרה לשורה מקופלת ואדומה', async () => {
  const r = await scanning(await twoPapers());
  unring(r, 'lineCheck_0_1');
  beep(r, BC.code_1231); cardClick(r, { scanMark: 'qty' });
  stayed(r); // "אחרת" פותחת את שדה הכמות — עדיין לא סימון
  assert.equal(cardOpen(r), true); assert.match(card(r), /id="scanLineGot"/);
  cardType(r, '4'); cardClick(r, { scanSave: '' });
  returned(r, 'lineCheck_0_1');
  assert.deepEqual(marks(r), [',qty:4,,,', ',']);
  assert.match(row(r, 0, 1), /data-line-got="0:1"[^>]*value="4"/, 'השורה פתוחה עם הכמות');
  assert.match(row(r, 0, 1), /data-line-mark="0:1:qty" aria-pressed="true"/);
  assert.equal(progress(r), 'סומנו 1 מתוך 5 שורות · חוסר 2 יח׳');
  // Enter — אותו דבר
  await rescan(r); unring(r, 'lineCheck_0_3');
  beep(r, BC.code_2381); cardClick(r, { scanMark: 'qty' }); cardType(r, '1'); cardEnter(r);
  returned(r, 'lineCheck_0_3');
  assert.deepEqual(marks(r), [',qty:4,,qty:1,', ',']);
  assert.match(row(r, 0, 3), /data-line-got="0:3"[^>]*value="1"/);
  // "לא הגיע"
  await rescan(r); unring(r, 'lineCheck_0_4');
  beep(r, BC.code_2387); cardClick(r, { scanMark: 'none' });
  returned(r, 'lineCheck_0_4');
  assert.deepEqual(marks(r), [',qty:4,,qty:1,none', ',']);
  assert.match(strip(row(r, 0, 4)), /^פיתות עננים 8 לא הגיע · 0 מתוך 3 שנה$/, 'מקופלת');
  assert.match(row(r, 0, 4), /border-rose-300 bg-rose-50/, 'אדומה');
  assert.equal(progress(r), 'סומנו 3 מתוך 5 שורות · חוסר 9 יח׳');
  // "אחרת" עם הכמות שבתעודה בדיוק — "הגיע" (v163), וגם היא חוזרת לשורה (של הקבוצה: אחיד פרוס בשני הניירות)
  await rescan(r); unring(r, 'lineCheck_0_0');
  beep(r, BC.code_101); cardClick(r, { scanMark: 'qty' }); cardType(r, '17'); cardClick(r, { scanSave: '' });
  returned(r, 'lineCheck_0_0');
  assert.deepEqual(marks(r), ['ok,qty:4,,qty:1,none', 'ok,']);
  assert.equal(progress(r), 'סומנו 4 מתוך 5 שורות · חוסר 9 יח׳');
});

test('3. סריקה חוזרת — "עוד כמה?" ו"הוסף" — חזרה לשורה שהושלמה', async () => {
  const r = await scanning(await twoPapers());
  beep(r, BC.code_1231); cardClick(r, { scanMark: 'qty' }); cardType(r, '4'); cardClick(r, { scanSave: '' });
  returned(r, 'lineCheck_0_1');
  await rescan(r); unring(r, 'lineCheck_0_1');
  beep(r, BC.code_1231);
  assert.equal(json(r, 'receiptLineScanCard.addQty'), true);
  assert.match(strip(card(r)), /סרקת עד עכשיו 4 מתוך 6 .* עוד כמה\? הוסף סה״כ 6 · כמו בתעודה/);
  stayed(r);
  cardClick(r, { scanSave: '' }); // "הוסף" 2 — 6: "הגיע"
  returned(r, 'lineCheck_0_1');
  assert.deepEqual(marks(r), [',ok,,,', ',']);
  assert.match(strip(row(r, 0, 1)), /^לחמניות 10 בשקית הגיע · 6 יח׳ שנה$/);
  assert.equal(progress(r), 'סומנו 1 מתוך 5 שורות');
  // עוד אחת מעבר — עודף; גם זה חוזר לשורה
  await rescan(r); unring(r, 'lineCheck_0_1');
  beep(r, BC.code_1231); cardType(r, '1'); cardEnter(r);
  returned(r, 'lineCheck_0_1');
  assert.deepEqual(marks(r), [',qty:7,,,', ',']);
  assert.equal(progress(r), 'סומנו 1 מתוך 5 שורות · עודף 1 יח׳');
});

test('4. מוצר שאינו בתעודה ("פלוס"): "הוסף" — חזרה לכרטיס הצהוב שלו; סריקה חוזרת — "עדכן" — שוב אליו', async () => {
  const r = await scanning(await twoPapers());
  unring(r, 'lineExtra_0');
  beep(r, BC.code_119); // לחם מלא בטוב — לא בתעודות
  assert.deepEqual(json(r, '({ kind: receiptLineScanCard.kind, k: receiptLineScanCard.k, got: receiptLineScanCard.got })'), { kind: 'extra', k: -1, got: '1' });
  stayed(r);
  cardType(r, '3'); cardClick(r, { scanSave: '' });
  returned(r, 'lineExtra_0');
  assert.deepEqual(review(r).extras.map(x => [x.productId, x.got]), [['code_119', '3']]);
  assert.deepEqual(JSON.parse(r.storage.get('bm_receipt_draft')).quantityReview.extras.map(x => [x.productId, x.got]), [['code_119', '3']]);
  assert.match(strip(rows(r)), /הגיע משהו נוסף\? .* לחם מלא בטוב הסר כמה הגיע\?/, 'הכרטיס הצהוב ברשימה');
  assert.match(rows(r), /data-extra-got="0"[^>]*value="3"/);
  assert.equal(progress(r), 'סומנו 0 מתוך 5 שורות · עודף 3 יח׳');
  // שוב — "כבר ברשימה", "עדכן" — וחזרה לאותו כרטיס
  await rescan(r); unring(r, 'lineExtra_0');
  beep(r, BC.code_119);
  assert.deepEqual(json(r, '({ k: receiptLineScanCard.k, got: receiptLineScanCard.got })'), { k: 0, got: '3' });
  assert.match(strip(card(r)), /^כבר ברשימה ״הגיע משהו נוסף״ לחם מלא בטוב/);
  cardType(r, '5'); cardClick(r, { scanSave: '' });
  returned(r, 'lineExtra_0');
  assert.deepEqual(review(r).extras.map(x => [x.productId, x.got]), [['code_119', '5']]);
  assert.match(rows(r), /data-extra-got="0"[^>]*value="5"/);
  assert.equal(progress(r), 'סומנו 0 מתוך 5 שורות · עודף 5 יח׳');
  // מוצר "פלוס" שני — הכרטיס השני
  r.run(`products.push({ id: 'x_challah', name: 'חלה מתוקה', code: '9901', barcode: '7290000000099', price: 10 });`);
  await rescan(r); unring(r, 'lineExtra_0'); unring(r, 'lineExtra_1');
  beep(r, '7290000000099'); cardType(r, '2'); cardClick(r, { scanSave: '' });
  returned(r, 'lineExtra_1');
  assert.deepEqual(review(r).extras.map(x => [x.productId, x.got]), [['code_119', '5'], ['x_challah', '2']]);
  assert.equal(ringed(r, 'lineExtra_0'), false, 'רק הכרטיס שסומן עכשיו מודגש');
});

test('5. מה שאינו סימון משאיר את המצלמה: ✕ בכרטיס (והסריקה ממשיכה), "תקן את הסה״כ", כמות לא תקינה, ברקוד לא מוכר', async () => {
  const r = await scanning(await twoPapers());
  // ✕ בכרטיס — כלום לא משתנה, המצלמה נשארת, טיק אחד והסריקה ממשיכה
  let ticks = r.callbacks.length;
  beep(r, BC.code_1231); assert.equal(cardOpen(r), true);
  cardClick(r, { scanDismiss: '' });
  assert.equal(cardOpen(r), false); stayed(r);
  assert.equal(r.callbacks.length, ticks + 1, 'טיק אחד — הסריקה ממשיכה');
  assert.deepEqual(marks(r), [',,,,', ',']); assert.deepEqual(review(r).extras, []);
  // כמות לא תקינה — הכרטיס נשאר ואומר
  later(r); beep(r, BC.code_1231); cardClick(r, { scanMark: 'qty' }); cardType(r, 'x');
  assert.equal(r.run('receiptLineScanSave()'), false);
  assert.equal(cardOpen(r), true); stayed(r);
  assert.match(strip(card(r)), /הקלד מספר — כמה יחידות הגיעו/);
  cardClick(r, { scanDismiss: '' });
  // "תקן את הסה״כ" — מהכרטיס של "עוד כמה?" לכרטיס הקודם, בלי לסמן
  later(r); beep(r, BC.code_2381); cardClick(r, { scanMark: 'ok' });
  returned(r, 'lineCheck_0_3');
  await rescan(r);
  beep(r, BC.code_2381); assert.equal(json(r, 'receiptLineScanCard.addQty'), true);
  cardClick(r, { scanMark: 'fix' });
  assert.equal(cardOpen(r), true); stayed(r);
  assert.match(strip(card(r)), /כבר סומנה: הגיע — אפשר לשנות/);
  cardClick(r, { scanDismiss: '' });
  // ברקוד לא מוכר — ההודעה, המצלמה נשארת והסריקה ממשיכה
  ticks = r.callbacks.length;
  later(r); beep(r, '7290119390519');
  assert.equal(cardOpen(r), false); stayed(r);
  assert.equal(r.toasts[r.toasts.length - 1], '❌ ברקוד לא מזוהה: 7290119390519 — בדוק את הברקוד בכרטיס המוצר, או הוסף מוצר חדש');
  assert.equal(r.callbacks.length, ticks + 1);
  assert.deepEqual(marks(r), [',,,ok,', ',']);
  // ✕ במצלמה — חזרה לרשימה כמו שהיא, בלי שורה מודגשת חדשה
  unring(r, 'lineCheck_0_3');
  r.events.get('scanClose:click')();
  assert.equal(cameraOpen(r), false); assert.equal(listOpen(r), true);
  assert.equal(ringed(r, 'lineCheck_0_3'), false, 'כלום לא סומן מאז — שום שורה לא מודגשת');
  assert.equal(progress(r), 'סומנו 1 מתוך 5 שורות');
});

test('6. "סרוק מוצר" שוב: המצלמה נפתחת נקייה — המונה מעודכן, בלי כרטיס ובלי "מה סומן זה עתה"; אותו ברקוד מיד הוא סריקה חוזרת', async () => {
  const r = await scanning(await twoPapers());
  assert.equal(overlay(r), 'סומנו 0 מתוך 5 | ');
  beep(r, BC.code_1231); cardClick(r, { scanMark: 'ok' });
  returned(r, 'lineCheck_0_1');
  assert.equal(r.run('lastScanCode'), BC.code_1231);
  await rescan(r);
  assert.equal(cameraOpen(r), true); assert.equal(listOpen(r), false);
  assert.equal(overlay(r), 'סומנו 1 מתוך 5 | ', 'המונה מעודכן, ומתחתיו כלום');
  assert.equal(cardOpen(r), false); assert.equal(r.run('receiptLineScanCard'), null);
  assert.equal(r.run('lastScanCode'), '', 'הברקוד האחרון נמחק — המצלמה נקייה');
  assert.equal(r.run(`$('scanTitle').textContent`), 'בדיקה שורה-שורה — סריקה');
  assert.equal(r.run(`$('scanHint').textContent`), 'סרוק מוצר מהסחורה — ✕ חוזר לרשימה');
  // אותו ברקוד מיד — סריקה חוזרת ("עוד כמה?"), לא "קריאה כפולה" שמתעלמים ממנה
  beep(r, BC.code_1231);
  assert.equal(cardOpen(r), true); assert.equal(json(r, 'receiptLineScanCard.addQty'), true);
  assert.match(strip(card(r)), /סרקת עד עכשיו 6 מתוך 6 — הכל הגיע/);
  cardClick(r, { scanDismiss: '' });
  // "סרוק מוצר" מיישב "אחרת" עם הכמות המדויקת שהוקלדה ברשימה (v163) לפני שהרשימה מתחבאת — ועדיין המונה נכון
  r.run('closeScanner()');
  click(r, { lineMark: '0:3:qty' }); type(r, { lineGot: '0:3' }, '5');
  await rescan(r);
  assert.deepEqual(marks(r), [',ok,,ok,', ',']);
  assert.equal(overlay(r), 'סומנו 2 מתוך 5 | ');
});

test('7. מוצר בשני ניירות (v164): "הגיע 17" מחזיר לכרטיס של הקבוצה — השורה הראשונה, גם מתוך רשימה גלולה', async () => {
  const r = await twoPapers();
  r.run('startReceiptLineCheck()');
  // מסמנים קודם את השורות האחרות, "סרוק מוצר" (הרשימה גלולה למטה — בדום המזויף אין גלילה, אבל ההדגשה והיעד נבדקים)
  click(r, { lineMark: '0:1:ok' }); click(r, { lineMark: '0:2:ok' }); click(r, { lineMark: '0:3:ok' }); click(r, { lineMark: '0:4:ok' });
  await rescan(r);
  assert.equal(overlay(r), 'סומנו 4 מתוך 5 | ');
  unring(r, 'lineCheck_0_0'); unring(r, 'lineCheckRef_1_0');
  beep(r, BC.code_101);
  assert.match(strip(card(r)), /^שורה 1 בתעודה 1 מתוך 2 · גם בתעודה 2 \(5 יח׳\) אחיד פרוס ברמן .* 17 יח׳ ב-2 תעודות 12 \+ 5 הגיע 17 אחרת לא הגיע$/);
  cardClick(r, { scanMark: 'ok' });
  returned(r, 'lineCheck_0_0');
  assert.equal(ringed(r, 'lineCheckRef_1_0'), false, 'שורת ההפניה בנייר הקטן — לא היא המודגשת');
  assert.deepEqual(marks(r), ['ok,ok,ok,ok,ok', 'ok,ok'], '"הגיע 17" — שתי השורות');
  assert.match(strip(row(r, 0, 0)), /אחיד פרוס ברמן הגיע · 17 יח׳ ב-2 תעודות שנה/);
  assert.match(strip(rows(r)), /נספר יחד עם תעודה 1, שורה 1 · ✓ הגיע/);
  assert.equal(progress(r), 'כל 5 שורות סומנו — אפשר לסיים');
  assert.equal(r.run(`$('receiptQuantityConfirm').textContent`), 'סיום — שמור את הבדיקה');
});

test('8. שוויון: קליטה שסומנה כולה בסריקה — סריקה לכל מוצר, עם חזרה לרשימה בין לבין — זהה לסימון ביד, עד הקליטה השמורה', async () => {
  // בסריקה: אחיד פרוס "אחרת" 10 מתוך 17 בשני הניירות; השאר הגיע — "סרוק מוצר" לפני כל מוצר (עודף של מוצר שאינו בתעודה — בבדיקה 4;
  // במסך ההבדלים הוא דורש החלטה לפני "קלוט", ולכן אינו חלק מהשוואת השמירה כאן)
  const a = await twoPapers();
  a.run('startReceiptLineCheck()');
  await rescan(a); beep(a, BC.code_101); cardClick(a, { scanMark: 'qty' }); cardType(a, '10'); cardClick(a, { scanSave: '' }); returned(a, 'lineCheck_0_0');
  assert.deepEqual(marks(a), ['qty:10,,,,', 'none,'], 'החלוקה: 10 בתעודת המשלוח, והשארית (0) בנייר הקטן');
  await rescan(a); beep(a, BC.code_1231); cardClick(a, { scanMark: 'ok' }); returned(a, 'lineCheck_0_1');
  await rescan(a); beep(a, BC.code_238); cardClick(a, { scanMark: 'ok' }); returned(a, 'lineCheck_0_2');
  await rescan(a); beep(a, BC.code_2381); cardClick(a, { scanMark: 'ok' }); returned(a, 'lineCheck_0_3');
  await rescan(a); beep(a, BC.code_2387); cardClick(a, { scanMark: 'ok' }); returned(a, 'lineCheck_0_4');
  assert.equal(progress(a), 'כל 5 שורות סומנו — אפשר לסיים · חוסר 7 יח׳');
  assert.equal(a.run(`$('receiptQuantityConfirm').textContent`), 'סיום — שמור את הבדיקה');
  // ביד — אותם סימונים ("אחרת" 10 על הקבוצה מחלקת בדיוק כך)
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

test('9. הגרסה (165 ומעלה), כולל ההערה ב-service worker', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const v = html.match(/const APP_VERSION = '(\d+)'/)[1];
  assert.ok(Number(v) >= 165, v);
  assert.match(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), new RegExp('גרסת אפליקציה ' + v));
  // הסימון מהכרטיס חוזר לרשימה — דרך closeScanner, לא דרך סגירת הכרטיס בלבד
  assert.match(html, /function receiptLineScanReturn\(id\) \{\s*receiptLineScanLast = id;\s*closeScanner\(\);/);
  assert.match(html, /receiptLineScanReturn\('lineCheck_' \+ g\.di \+ '_' \+ g\.li\)/);
  assert.match(html, /receiptLineScanReturn\('lineExtra_' \+ k\)/);
});
