// v169 — סריקת מוצר לשלט ולסל מבצע: ברקוד שמודפס על כמה מוצרים. ההמשך של v168 (בדיקה שורה-שורה): בעל העסק, 12.11.2026 —
// "לגבי סעיף 3 תתקן גם אותו". בקטלוג של ברמן הברקוד 4033569 מודפס על ארבעה מוצרים (ביס עננים, לחמניות המבורגר, פרנה, לבש). עד 168
// שתי הסריקות האלה לקחו את הראשון במאגר (findProductByBarcode): מי שסרק פרנה קיבל "נוסף לסל: ביס עננים", וכשביס עננים כבר היה בסל —
// "כבר בסל", ואת הפרנה אי אפשר היה להוסיף בסריקה. עכשיו — "לאיזה מוצר הכוונה?" (openBarcodeChoicePicker), כמו בקליטה בסריקה.
// הנתונים מומצאים, עם אותם ברקודים. המצלמה מזויפת, והברקוד "נקרא" דרך onScanned — כמו בבדיקות הסריקה האחרות.
// מה שנבדק:
// 1. סל מבצע, ברקוד של מוצר אחד (גם הקוד המלא מהאריזה) — בדיוק כמו קודם: נוסף, הסריקה ממשיכה; שוב — "כבר בסל"; לא מוכר — ההודעה.
// 2. סל מבצע, ברקוד של כמה מוצרים — שום דבר לא נוסף בשקט; הבורר עם כל המועמדים ועם ההסבר של המסך הזה; המצלמה נסגרת; הבחירה
//    מוסיפה את המוצר שנבחר (לא את הראשון במאגר); שוב אותו מוצר — "כבר בסל"; מוצר אחר על אותו ברקוד — נוסף לצידו.
// 3. המקרה שחסם: ביס עננים כבר בסל, וסורקים פרנה — לא "כבר בסל: ביס עננים", אלא הבורר, והפרנה נוספת.
// 4. סגירת הבורר בלי לבחור — כלום לא נוסף, והמצלמה סגורה.
// 5. שלט: אותו דבר — מוצר אחד כמו קודם; כמה מוצרים — הבורר, והבחירה נכנסת לשלט.
// 6. הבורר של הקליטה בסריקה ושל מסך המחירים — הנוסח הקיים, כמו קודם.
// 7. הגרסה.
// הרצה: TZ=Asia/Jerusalem node --test tests/scan-shared-barcode-sign-promo.test.mjs
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './receipt-scan-harness.mjs';

const SHARED = '4033569', FULL = '7290004033569'; // הקטע שבמחירון, והקוד המלא שהמצלמה קוראת מהאריזה
const ALL = ['code_209', 'code_3703', 'code_3604', 'code_3601'];
const HINT = 'אותו ברקוד מודפס על כמה מוצרים — בחר את המוצר שסרקת.';
const json = (r, e) => JSON.parse(r.run('JSON.stringify(' + e + ')'));
const strip = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const settle = async () => { for (let i = 0; i < 40; i++) await new Promise(res => setImmediate(res)); };
// המאגר כמו בחנות: ביס עננים ולחמניות המבורגר לפני הפרנה, ולבש אחריה — כולם על אותו ברקוד (הפרנה כבר ב-fixture.json)
function start() {
  const r = runtime();
  r.run(`(() => { const at = products.findIndex(p => p.id === 'code_3604');
    products.splice(at, 0, { id: 'code_209', code: '209', name: 'ביס עננים - 8 לחמניות בסגנון בריוש', barcode: '${SHARED}', price: 15, listPrice: 15 },
      { id: 'code_3703', code: '3703', name: 'לחמניות המבורגר 8 בשקית ודש', barcode: '${SHARED}', price: 13.9, listPrice: 13.9 });
    products.splice(at + 3, 0, { id: 'code_3601', code: '3601', name: 'לבש - לחם ארמני דוראל', barcode: '${SHARED}', price: 14.9, listPrice: 14.9 }); })();
    window.BarcodeDetector = class { detect() { return Promise.resolve([]); } };
    navigator.mediaDevices = { getUserMedia: async () => ({ getTracks: () => [], getVideoTracks: () => [] }) };
    $('scanVideo').play = async () => {};`);
  return r;
}
// כפתור המצלמה של המסך (data-role) — המצלמה (המזויפת) נפתחת עד הסוף
async function camera(r, role, purpose) {
  r.click(role);
  await settle();
  assert.equal(r.run('scanPurpose'), purpose, 'המצלמה פתוחה');
  assert.equal(r.run(`$('scanModal').classList.contains('hidden')`), false);
}
const beep = (r, code) => r.run(`lastScanTime = 0; onScanned(${JSON.stringify(code)})`); // כל קריאה — סריקה חדשה (עברו 1.4 שניות)
const lastToast = r => r.toasts[r.toasts.length - 1];
const scannerClosed = r => r.run('scanPurpose') === 'field' && r.run(`$('scanModal').classList.contains('hidden')`) && !r.run('!!scanStream');
// הבורר: הדף שנוצר (document.createElement('div') בבדיקה), הכפתורים שבו, ולחיצה על אחד מהם או על ✕
const picker = r => r.node('new-div').innerHTML;
const pickerIds = r => Array.from(picker(r).matchAll(/data-bc-id="([^"]+)"/g)).map(m => m[1]);
const pick = (r, id) => r.events.get('new-div:click')({ target: { closest: sel => sel === '[data-bc-id]' ? { getAttribute: () => id } : null } });
const dismiss = r => r.events.get('new-div:click')({ target: { closest: sel => sel === '[data-bc-close]' ? {} : null } });
// הבורר נפתח רק כשקוראים לו — סופרים את הפתיחות בלי לשנות אותו
function countPicker(r) {
  r.run(`globalThis.__pickerOpened = 0; const realPicker = openBarcodeChoicePicker;
    openBarcodeChoicePicker = (list, onPick, hint) => { globalThis.__pickerOpened++; return realPicker(list, onPick, hint); };`);
  return () => r.run('__pickerOpened');
}
const basket = r => json(r, 'promoEdit.productIds');
const sign = r => json(r, 'signMaker.signs[signMaker.editing].productIds || []');

test('1. סל מבצע, ברקוד של מוצר אחד — כמו קודם: נוסף והסריקה ממשיכה; שוב — "כבר בסל"; לא מוכר — ההודעה', async () => {
  const r = start(), opened = countPicker(r);
  r.run('newPromo()');
  await camera(r, 'promo-scan', 'promo');
  const ticks = r.callbacks.length;
  beep(r, '7290000497112'); // הקוד המלא מהאריזה של אחיד פרוס (497112 שמור כקטע)
  assert.deepEqual(basket(r), ['code_101']);
  assert.equal(lastToast(r), '➕ נוסף לסל: אחיד פרוס ברמן');
  assert.equal(r.run(`$('peCount').textContent`), '(1)');
  assert.equal(r.run('scanPurpose'), 'promo', 'המצלמה נשארת — סריקה רציפה');
  assert.equal(r.callbacks.length, ticks + 1, 'הסריקה ממשיכה');
  beep(r, '497112');
  assert.deepEqual(basket(r), ['code_101']); assert.equal(lastToast(r), 'כבר בסל: אחיד פרוס ברמן');
  beep(r, '7290119390519');
  assert.deepEqual(basket(r), ['code_101']); assert.equal(lastToast(r), '❌ ברקוד לא נמצא במוצרים: 7290119390519');
  assert.equal(r.run('scanPurpose'), 'promo');
  assert.equal(opened(), 0, 'בלי שאלה כשהברקוד של מוצר אחד');
});

test('2. סל מבצע, ברקוד של כמה מוצרים — הבורר במקום הראשון במאגר; הבחירה מוסיפה את המוצר שנבחר', async () => {
  const r = start(), opened = countPicker(r);
  r.run('newPromo()');
  await camera(r, 'promo-scan', 'promo');
  assert.equal(r.run(`findProductByBarcode('${FULL}').id`), 'code_209', 'הראשון במאגר — מה שנוסף בשקט עד 168');
  const toasts = r.toasts.length, ticks = r.callbacks.length;
  for (const code of [FULL, SHARED]) { // הקוד המלא מהאריזה, וגם הקטע עצמו
    beep(r, code);
    assert.deepEqual(basket(r), [], code + ' — שום דבר לא נוסף בשקט');
    assert.equal(r.toasts.length, toasts, 'בלי "נוסף לסל"');
    assert.deepEqual(pickerIds(r), ALL, 'כל המועמדים, לפי הסדר במאגר');
    assert.equal(strip(picker(r)), 'לאיזה מוצר הכוונה? ' + HINT + ' ביס עננים - 8 לחמניות בסגנון בריוש קוד 209 מחירון ₪15.00 ' +
      'לחמניות המבורגר 8 בשקית ודש קוד 3703 מחירון ₪13.90 פרנה - 4 בשקית 400 גר קוד 3604 מחירון ₪12.90 לבש - לחם ארמני דוראל קוד 3601 מחירון ₪14.90');
    assert.ok(scannerClosed(r), 'הבורר סוגר את המצלמה');
    assert.equal(r.callbacks.length, ticks, 'אין טיק נוסף כשהמצלמה סגורה');
    dismiss(r);
    await camera(r, 'promo-scan', 'promo');
    assert.equal(r.callbacks.length, ticks + 1, 'פתיחת המצלמה — טיק אחד'); r.callbacks.length = ticks;
  }
  assert.equal(opened(), 2);
  beep(r, FULL); pick(r, 'code_3604');
  assert.deepEqual(basket(r), ['code_3604'], 'הפרנה שנבחרה — לא ביס עננים');
  assert.equal(lastToast(r), '➕ נוסף לסל: פרנה - 4 בשקית 400 גר');
  assert.equal(r.run(`$('peCount').textContent`), '(1)');
  assert.match(r.run(`$('promoProdList').innerHTML`), /data-id="code_3604" class="[^"]*border-rose-500 bg-rose-50/, 'מסומנת ברשימת הסל');
  assert.ok(scannerClosed(r), 'אחרי הבחירה חוזרים למסך המבצע — להמשך סריקה, כפתור המצלמה');
  // שוב אותו מוצר — "כבר בסל", לא פעמיים
  await camera(r, 'promo-scan', 'promo'); beep(r, FULL); pick(r, 'code_3604');
  assert.deepEqual(basket(r), ['code_3604']); assert.equal(lastToast(r), 'כבר בסל: פרנה - 4 בשקית 400 גר');
  // מוצר אחר על אותו ברקוד — נוסף לצידו
  await camera(r, 'promo-scan', 'promo'); beep(r, FULL); pick(r, 'code_3601');
  assert.deepEqual(basket(r), ['code_3604', 'code_3601']); assert.equal(lastToast(r), '➕ נוסף לסל: לבש - לחם ארמני דוראל');
  assert.equal(r.run(`$('peCount').textContent`), '(2)');
});

test('3. המקרה שחסם: ביס עננים כבר בסל, וסורקים פרנה — הבורר, והפרנה נוספת (לא "כבר בסל: ביס עננים")', async () => {
  const r = start();
  r.run(`newPromo(); togglePromoProduct('code_209')`);
  assert.deepEqual(basket(r), ['code_209']);
  await camera(r, 'promo-scan', 'promo');
  const toasts = r.toasts.length;
  beep(r, FULL);
  assert.equal(r.toasts.length, toasts, 'בלי "כבר בסל: ביס עננים"');
  assert.deepEqual(pickerIds(r), ALL);
  pick(r, 'code_3604');
  assert.deepEqual(basket(r), ['code_209', 'code_3604']);
  assert.equal(lastToast(r), '➕ נוסף לסל: פרנה - 4 בשקית 400 גר');
  // ומי שבאמת סרק ביס עננים — "כבר בסל"
  await camera(r, 'promo-scan', 'promo'); beep(r, FULL); pick(r, 'code_209');
  assert.deepEqual(basket(r), ['code_209', 'code_3604']); assert.equal(lastToast(r), 'כבר בסל: ביס עננים - 8 לחמניות בסגנון בריוש');
});

test('4. סגירת הבורר בלי לבחור — כלום לא נוסף, והמצלמה סגורה; מבצע שנסגר בינתיים — הבחירה אינה עושה כלום', async () => {
  const r = start();
  r.run('newPromo()');
  await camera(r, 'promo-scan', 'promo');
  const toasts = r.toasts.length;
  beep(r, FULL); dismiss(r);
  assert.deepEqual(basket(r), []); assert.equal(r.toasts.length, toasts);
  assert.ok(scannerClosed(r));
  // הבורר פתוח, והמבצע נסגר (חזרה מהמסך) — בחירה מאוחרת אינה נזרקת ואינה מוסיפה
  await camera(r, 'promo-scan', 'promo'); beep(r, FULL);
  r.run('promoEdit = null');
  pick(r, 'code_3604');
  assert.equal(r.run('promoEdit'), null); assert.equal(r.toasts.length, toasts);
  // בלי מבצע פתוח — הסריקה סוגרת את המצלמה, כמו קודם
  r.run(`scanPurpose = 'promo'`); r.run(`handlePromoScan('${FULL}')`);
  assert.equal(r.run('scanPurpose'), 'field');
});

test('5. שלט: מוצר אחד — כמו קודם; כמה מוצרים — הבורר, והבחירה נכנסת לשלט', async () => {
  const r = start(), opened = countPicker(r);
  r.run('startInternalSignMaker()');
  await camera(r, 'sign-prod-scan', 'signprod');
  beep(r, '7290000497112');
  assert.deepEqual(sign(r), ['code_101']); assert.equal(lastToast(r), '➕ נוסף לשלט: אחיד פרוס ברמן');
  assert.equal(r.run('scanPurpose'), 'signprod', 'המצלמה נשארת');
  beep(r, '497112');
  assert.equal(lastToast(r), 'כבר בשלט: אחיד פרוס ברמן');
  beep(r, '7290119390519');
  assert.equal(lastToast(r), '❌ ברקוד לא נמצא במוצרים: 7290119390519');
  assert.equal(opened(), 0);
  // ברקוד של כמה מוצרים
  const toasts = r.toasts.length;
  beep(r, FULL);
  assert.deepEqual(sign(r), ['code_101'], 'שום דבר לא נוסף בשקט'); assert.equal(r.toasts.length, toasts);
  assert.deepEqual(pickerIds(r), ALL);
  assert.match(strip(picker(r)), new RegExp('^לאיזה מוצר הכוונה\\? ' + HINT + ' ביס עננים'));
  assert.ok(scannerClosed(r));
  pick(r, 'code_3604');
  assert.deepEqual(sign(r), ['code_101', 'code_3604']); assert.equal(lastToast(r), '➕ נוסף לשלט: פרנה - 4 בשקית 400 גר');
  assert.equal(r.run(`$('signProdCount').textContent`), '(2)');
  // שוב אותו מוצר — "כבר בשלט"; ✕ — כלום; בלי שלט פתוח — המצלמה נסגרת
  await camera(r, 'sign-prod-scan', 'signprod'); beep(r, FULL); pick(r, 'code_3604');
  assert.deepEqual(sign(r), ['code_101', 'code_3604']); assert.equal(lastToast(r), 'כבר בשלט: פרנה - 4 בשקית 400 גר');
  await camera(r, 'sign-prod-scan', 'signprod'); beep(r, FULL); dismiss(r);
  assert.deepEqual(sign(r), ['code_101', 'code_3604']);
  assert.equal(opened(), 3);
  r.run(`signMaker = null; scanPurpose = 'signprod'`); r.run(`handleSignProdScan('${FULL}')`);
  assert.equal(r.run('scanPurpose'), 'field');
});

test('6. הבורר של הקליטה בסריקה ושל מסך המחירים — הנוסח הקיים, כמו קודם', () => {
  const r = start();
  r.run(`promptQty = () => {}; openProdModal = () => {};`);
  r.run(`handleReceivingScan('${FULL}')`);
  assert.deepEqual(pickerIds(r), ALL);
  assert.match(strip(picker(r)), /^לאיזה מוצר הכוונה\? אותו ברקוד מודפס על כמה מוצרים — בחר לפי קוד הפריט שבתעודה\. ביס עננים/);
  r.run(`handlePriceScan('${FULL}')`);
  assert.match(strip(picker(r)), /^לאיזה מוצר הכוונה\? אותו ברקוד מודפס על כמה מוצרים — בחר לפי קוד הפריט שבתעודה\. ביס עננים/);
});

test('7. הגרסה עלתה ל-169, כולל ההערה ב-service worker', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /const APP_VERSION = '169'/);
  assert.match(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), /גרסת אפליקציה 169/);
});
