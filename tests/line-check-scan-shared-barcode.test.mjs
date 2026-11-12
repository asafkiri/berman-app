// v168 — סריקה בתוך הבדיקה שורה-שורה: ברקוד שמודפס על כמה מוצרים. בעל העסק (12.11.2026), מתוך בדיקה אמיתית בטלפון:
// "אני סורק בכלל פרנות, ויוצא לי לחמניות ביס עננים. זה אמור להוציא לי אופציה במה לבחור, לא?"
// בקטלוג של ברמן הברקוד 4033569 מודפס על ארבעה מוצרים (ביס עננים 209, לחמניות המבורגר 3703, פרנה 3604, לבש 3601), והמצלמה
// קוראת מהאריזה את הקוד המלא (7290004033569) בעוד שבמאגר שמור הקטע שבמחירון. עד 167 הסריקה שבתוך הבדיקה לקחה את המוצר
// הראשון במאגר (ביס עננים) והציגה "לא בתעודה — הגיע בנוסף" — גם כשהפרנה עצמה בתעודה. הנתונים כאן מומצאים, עם אותם ברקודים.
// הכלל (בעל העסק, 12.11.2026: "עדיף לשאול, כי אם הגיע מוצר אחר מהבחירה ולא מה שבתעודה אז נתקעים"): ברקוד של כמה מוצרים —
// תמיד "לאיזה מוצר הכוונה?", גם כשרק אחד מהם בתעודה; מי שבתעודה מופיע ראשון.
// מה שנבדק:
// 1. המקרה שדווח: הפרנה בתעודה, והקוד המלא מהאריזה נסרק — שואלים (לא "הגיע בנוסף" של ביס עננים, ולא ניחוש לפי הנייר), הפרנה
//    ראשונה ובירוק עם השורה והכמות שלה; הבחירה פותחת את הכרטיס של השורה, ו"הגיע 1" מסמן אותה.
// 2. אף אחד מהמוצרים אינו בתעודה — "לאיזה מוצר הכוונה?": כל המועמדים לפי הסדר במאגר; הלולאה מושהית; הבחירה פותחת את
//    "לא בתעודה — הגיע בנוסף" של המוצר שנבחר, ו"הוסף" מכניס אותו (ולא את הראשון במאגר) ל"הגיע משהו נוסף".
// 3. סריקה חוזרת אחרי שהמוצר נוסף — שוב הבחירה, עם "כבר ב״הגיע משהו נוסף״" ראשון; הבחירה — "כבר ברשימה", "עדכן".
// 4. שניים מהמוצרים בתעודה — הבחירה, עם השורה והכמות של כל אחד (לפי סדר התעודה) לפני מי שאינו בתעודה; אחרי סימון — "כבר סומן".
// 5. הגיע מוצר אחר מזה שבתעודה — בוחרים אותו: "הגיע בנוסף", והשורה שבתעודה נשארת לסימון; "בחר מוצר אחר" מחזיר לבחירה (בלי
//    לסמן); ✕ סוגר בלי לסמן, והסריקה ממשיכה.
// 6. מה שלא השתנה: ברקוד של מוצר אחד (גם הקוד המלא מהאריזה) — הכרטיס כמו תמיד, בלי "בחר מוצר אחר"; ברקוד לא מוכר — ההודעה.
// 7. קוד מלא שמור במוצר אחד גובר על קטע משותף (findProductsByBarcode) — בלי שאלה.
// 8. יחידה מול מארז חיוב בתוך הבחירה; מוצר שנמחק מהמאגר בזמן שהבחירה פתוחה.
// 9. שוויון: סימון דרך הבחירה נשמר בדיוק כמו סימון ביד.
// 10. הקליטה בסריקה (handleReceivingScan) — הבורר הקיים, כמו קודם.
// 11. שתי תעודות: מוצר שבשתיהן הוא שורה אחת גם בבחירה ("3 יח׳ ב-2 תעודות"), ומספר התעודה ליד כל מועמד.
// 12. הגרסה.
// הרצה: TZ=Asia/Jerusalem node --test tests/line-check-scan-shared-barcode.test.mjs
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { app, delivery, printed, now, readPapers, receive, state } from './one-button-helpers.mjs';

const NOTE = '244826000';
const SHARED = '4033569', FULL = '7290004033569'; // הקטע שבמחירון, והקוד המלא שהמצלמה קוראת מהאריזה
const json = (r, e) => JSON.parse(r.run('JSON.stringify(' + e + ')'));
const strip = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const settle = async () => { for (let i = 0; i < 40; i++) await new Promise(res => setImmediate(res)); };
const fakeCamera = r => r.run(`window.BarcodeDetector = class { detect() { return Promise.resolve([]); } };
  navigator.mediaDevices = { getUserMedia: async () => ({ getTracks: () => [], getVideoTracks: () => [] }) };
  $('scanVideo').play = async () => {};`);
// תעודת המשלוח של הבדיקות (5 שורות, 30 יח׳), ועוד שורות לפי הצורך: [קוד פריט, כמות]
function note(more = []) {
  const p = delivery(NOTE);
  const doc = p.scan.documents[0];
  more.forEach(([code, quantity, description]) => {
    doc.rows.push({ itemCode: String(code), description: description || 'שורה ' + code, barcode: SHARED, quantity, unitPriceExVat: 10, sourcePage: 1, lineNumber: doc.rows.length + 1 });
    doc.totalUnits += quantity; doc.printedLines += 1;
  });
  return p;
}
// המאגר כמו בחנות: ביס עננים ולחמניות המבורגר לפני הפרנה, ולבש אחריה — כולם על אותו ברקוד (הפרנה כבר ב-fixture.json)
const catalog = r => r.run(`(() => { const at = products.findIndex(p => p.id === 'code_3604');
  products.splice(at, 0, { id: 'code_209', code: '209', name: 'ביס עננים - 8 לחמניות בסגנון בריוש', barcode: '${SHARED}', price: 15, listPrice: 15, posPrice: 16.9 },
    { id: 'code_3703', code: '3703', name: 'לחמניות המבורגר 8 בשקית ודש', barcode: '${SHARED}', price: 13.9, listPrice: 13.9, posPrice: 16.9 });
  products.splice(at + 3, 0, { id: 'code_3601', code: '3601', name: 'לבש - לחם ארמני דוראל', barcode: '${SHARED}', price: 14.9, listPrice: 14.9, posPrice: 16.9 });
  products.find(p => p.id === 'code_3604').posPrice = 16.9; })()`);
async function open(more) {
  const r = app(note(more));
  catalog(r);
  await receive(r);
  r.run(`currentView = 'receiving'; mainMode = 'receiving';`);
  fakeCamera(r);
  r.run('startReceiptLineCheck()');
  r.events.get('receiptLineScan:click')();
  await settle();
  assert.equal(r.run('scanPurpose'), 'linecheck', 'המצלמה פתוחה');
  return r;
}
const cardClick = (r, dataset) => r.run(`receiptLineScanCardClick({ target: { closest: () => ({ dataset: ${JSON.stringify(dataset)} }) } })`);
const cardType = (r, value) => r.run(`receiptLineScanCardInput({ target: { dataset: { scanGot: '' }, value: ${JSON.stringify(value)} } })`);
const beep = (r, code) => r.run(`onScanned(${JSON.stringify(code)})`);
const later = r => r.run('lastScanTime = 0'); // עברו שתי שניות — אותו ברקוד נחשב סריקה חדשה
const review = r => json(r, 'receiptQuantityReview');
const marks = r => review(r).docs.map(d => d.lines.map(l => l.productId.replace('code_', '') + ':' + l.mark + (l.got ? ':' + l.got : '')).join(','));
const card = r => r.run(`$('scanLineCard').innerHTML`);
const cardOpen = r => !r.run(`$('scanLineCard').classList.contains('hidden')`);
const kind = r => r.run('receiptLineScanCard && receiptLineScanCard.kind');
const picks = r => Array.from(card(r).matchAll(/data-scan-pick="([^"]+)"/g)).map(m => m[1]);
const OTHER = 'לא המוצר הזה? בחר מוצר אחר';
function returned(r, id) {
  assert.equal(cardOpen(r), false, 'הכרטיס נסגר'); assert.equal(r.run('receiptLineScanCard'), null);
  assert.equal(r.run('scanPurpose'), 'field'); assert.equal(r.run(`$('scanModal').classList.contains('hidden')`), true, 'המצלמה נסגרה');
  assert.equal(r.run(`$('receiptQuantityModal').classList.contains('hidden')`), false, 'הרשימה חזרה');
  assert.equal(r.run(`$('${id}').classList.contains('ring-4')`), true, id + ' — השורה שסומנה מודגשת');
}
async function rescan(r) { r.events.get('receiptLineScan:click')(); await settle(); assert.equal(r.run('scanPurpose'), 'linecheck', 'המצלמה נפתחה שוב'); return r; }

test('1. המקרה שדווח: הפרנה בתעודה, והקוד המלא מהאריזה נסרק — שואלים, הפרנה ראשונה; הבחירה מסמנת את השורה שלה', async () => {
  const r = await open([[3604, 1, 'פרנה 4 בשקית']]);
  const ALL = ['code_209', 'code_3703', 'code_3604', 'code_3601'];
  // כך זה במאגר: ארבעה מוצרים על הברקוד, וביס עננים ראשון — מה שהסריקה לקחה עד 167
  assert.deepEqual(json(r, `findProductsByBarcode('${FULL}').map(p => p.id)`), ALL);
  assert.equal(r.run(`findProductByBarcode('${FULL}').id`), 'code_209');
  assert.deepEqual(json(r, 'receiptQuantityReview.docs[0].lines[5]'), { productId: 'code_3604', name: 'פרנה - 4 בשקית 400 גר', barcode: SHARED, paperQty: 1, line: 6, mark: '', got: '' });
  for (const code of [FULL, SHARED]) { // הקוד המלא מהאריזה, וגם הקטע עצמו
    later(r); beep(r, code);
    assert.equal(cardOpen(r), true);
    // לא "לא בתעודה — הגיע בנוסף" של ביס עננים, וגם לא ניחוש לפי הנייר: שואלים — ומי שבתעודה ראשון ובירוק
    assert.deepEqual(json(r, 'receiptLineScanCard'), { kind: 'choose', choices: ALL }, code);
    assert.equal(strip(card(r)), 'לאיזה מוצר הכוונה? אותו ברקוד מודפס על 4 מוצרים — בחר את המוצר שסרקת. ' +
      'פרנה - 4 בשקית 400 גר בתעודה · שורה 6 · 1 יח׳ קוד 3604 ביס עננים - 8 לחמניות בסגנון בריוש לא בתעודה קוד 209 ' +
      'לחמניות המבורגר 8 בשקית ודש לא בתעודה קוד 3703 לבש - לחם ארמני דוראל לא בתעודה קוד 3601');
    assert.deepEqual(picks(r), ['code_3604', 'code_209', 'code_3703', 'code_3601']);
    assert.equal((card(r).match(/bg-emerald-50 border-emerald-300/g) || []).length, 1, 'רק הפרנה — בירוק');
    assert.doesNotMatch(card(r), /הגיע בנוסף/);
    cardClick(r, { scanDismiss: '' });
  }
  assert.deepEqual(marks(r), ['101:,1231:,238:,2381:,2387:,3604:']); assert.deepEqual(review(r).extras, [], 'הסריקה עצמה אינה מסמנת דבר');
  later(r); beep(r, FULL); cardClick(r, { scanPick: 'code_3604' });
  assert.deepEqual(json(r, '[receiptLineScanCard.kind, receiptLineScanCard.di, receiptLineScanCard.li, receiptLineScanCard.scanned.id, receiptLineScanCard.related, receiptLineScanCard.choices]'),
    ['line', 0, 5, 'code_3604', null, ALL]);
  assert.equal(strip(card(r)), 'שורה 6 בתעודה פרנה - 4 בשקית 400 גר בקופה: ₪16.90 1 יח׳ בתעודה הגיע 1 אחרת לא הגיע ' + OTHER);
  cardClick(r, { scanMark: 'ok' });
  returned(r, 'lineCheck_0_5');
  assert.deepEqual(marks(r), ['101:,1231:,238:,2381:,2387:,3604:ok']);
  assert.deepEqual(review(r).extras, [], 'שום דבר לא נכנס ל"הגיע משהו נוסף"');
  assert.equal(r.run(`$('receiptQuantityProgress').textContent`), 'סומנו 1 מתוך 6 שורות');
});

test('2. אף אחד מהמוצרים אינו בתעודה — "לאיזה מוצר הכוונה?"; הבחירה מכניסה את המוצר שנבחר, לא את הראשון במאגר', async () => {
  const r = await open();
  const ticks = r.callbacks.length;
  beep(r, FULL);
  assert.equal(cardOpen(r), true);
  assert.deepEqual(json(r, 'receiptLineScanCard'), { kind: 'choose', choices: ['code_209', 'code_3703', 'code_3604', 'code_3601'] });
  assert.equal(r.callbacks.length, ticks, 'הלולאה מושהית כשהבחירה פתוחה');
  const c = card(r);
  assert.equal(strip(c), 'לאיזה מוצר הכוונה? אותו ברקוד מודפס על 4 מוצרים — בחר את המוצר שסרקת. ' +
    'ביס עננים - 8 לחמניות בסגנון בריוש לא בתעודה קוד 209 לחמניות המבורגר 8 בשקית ודש לא בתעודה קוד 3703 ' +
    'פרנה - 4 בשקית 400 גר לא בתעודה קוד 3604 לבש - לחם ארמני דוראל לא בתעודה קוד 3601');
  assert.deepEqual(picks(r), ['code_209', 'code_3703', 'code_3604', 'code_3601'], 'לפי הסדר במאגר, כמו בבורר של הקליטה בסריקה');
  assert.match(c, /border-indigo-300/); assert.match(c, /data-scan-dismiss/);
  assert.doesNotMatch(c, /data-scan-got|data-scan-save|data-scan-mark|data-scan-choose/, 'בבחירה אין כמות ואין סימון');
  // קריאה נוספת בזמן שהבחירה פתוחה — מתעלמים; "שמור" בלי כרטיס של מוצר — כלום
  beep(r, '497112');
  assert.equal(kind(r), 'choose'); assert.equal(r.callbacks.length, ticks);
  assert.equal(r.run('receiptLineScanSave()'), false); assert.equal(kind(r), 'choose');
  cardClick(r, { scanMark: 'ok' }); cardClick(r, { scanSave: '' });
  assert.equal(kind(r), 'choose', 'סימון בלי בחירה — כלום');
  assert.deepEqual(review(r).extras, []); assert.deepEqual(marks(r), ['101:,1231:,238:,2381:,2387:']);
  // מוצר שאינו בין המועמדים — לא נבחר
  cardClick(r, { scanPick: 'code_101' });
  assert.equal(kind(r), 'choose');
  // הבחירה: פרנה
  cardClick(r, { scanPick: 'code_3604' });
  assert.deepEqual(json(r, '({ kind: receiptLineScanCard.kind, k: receiptLineScanCard.k, got: receiptLineScanCard.got, id: receiptLineScanCard.scanned.id, choices: receiptLineScanCard.choices })'),
    { kind: 'extra', k: -1, got: '1', id: 'code_3604', choices: ['code_209', 'code_3703', 'code_3604', 'code_3601'] });
  assert.equal(strip(card(r)), 'לא בתעודה — הגיע בנוסף פרנה - 4 בשקית 400 גר בקופה: ₪16.90 4033569 כמה הגיע? הוסף התקבלו 1 · עודף 1 ' + OTHER);
  assert.match(card(r), /border-amber-300/);
  assert.equal(r.callbacks.length, ticks, 'הבחירה אינה סגירה — הלולאה עדיין מושהית');
  cardType(r, '2'); cardClick(r, { scanSave: '' });
  returned(r, 'lineExtra_0');
  assert.deepEqual(review(r).extras, [{ productId: 'code_3604', name: 'פרנה - 4 בשקית 400 גר', barcode: SHARED, got: '2' }]);
  assert.deepEqual(json(r, 'receiptQuantityReview.rows.filter(x => x.paperQty === 0).map(x => [x.productId, x.kind, x.difference])'), [['code_3604', 'surplus', '2']]);
  assert.deepEqual(JSON.parse(r.storage.get('bm_receipt_draft')).quantityReview.extras.map(x => [x.productId, x.got]), [['code_3604', '2']], 'נשמר בטיוטה');
  assert.equal(r.run(`$('receiptQuantityProgress').textContent`), 'סומנו 0 מתוך 5 שורות · עודף 2 יח׳');
});

test('3. סריקה חוזרת אחרי שהמוצר נוסף — שוב הבחירה, עם "כבר ב״הגיע משהו נוסף״" ראשון; הבחירה — "כבר ברשימה", "עדכן"', async () => {
  const r = await open();
  beep(r, FULL); cardClick(r, { scanPick: 'code_3604' }); cardClick(r, { scanSave: '' });
  returned(r, 'lineExtra_0');
  await rescan(r);
  beep(r, FULL);
  // אותו ברקוד יכול להיות גם מוצר אחר שהגיע — לכן שוב שואלים, ומי שכבר ברשימה ראשון
  assert.equal(kind(r), 'choose');
  assert.deepEqual(picks(r), ['code_3604', 'code_209', 'code_3703', 'code_3601']);
  assert.match(strip(card(r)), /^לאיזה מוצר הכוונה\? .* בחר את המוצר שסרקת\. פרנה - 4 בשקית 400 גר כבר ב״הגיע משהו נוסף״ קוד 3604 ביס עננים - 8 לחמניות בסגנון בריוש לא בתעודה קוד 209 /);
  cardClick(r, { scanPick: 'code_3604' });
  assert.deepEqual(json(r, '({ kind: receiptLineScanCard.kind, k: receiptLineScanCard.k, got: receiptLineScanCard.got })'), { kind: 'extra', k: 0, got: '1' });
  assert.match(strip(card(r)), /^כבר ברשימה ״הגיע משהו נוסף״ פרנה - 4 בשקית 400 גר .* עדכן התקבלו 1 · עודף 1 לא המוצר הזה\? בחר מוצר אחר$/);
  cardType(r, '3'); cardClick(r, { scanSave: '' });
  returned(r, 'lineExtra_0');
  assert.deepEqual(review(r).extras.map(x => [x.productId, x.got]), [['code_3604', '3']], 'התעדכן, לא נוסף פעמיים');
  // ומוצר אחר על אותו ברקוד — נוסף לצידו
  await rescan(r); beep(r, FULL); cardClick(r, { scanPick: 'code_209' });
  assert.match(strip(card(r)), /^לא בתעודה — הגיע בנוסף ביס עננים - 8 לחמניות בסגנון בריוש /);
  cardClick(r, { scanSave: '' });
  returned(r, 'lineExtra_1');
  assert.deepEqual(review(r).extras.map(x => [x.productId, x.got]), [['code_3604', '3'], ['code_209', '1']]);
});

test('4. שניים מהמוצרים בתעודה — הבחירה, עם השורה והכמות של כל אחד לפני מי שאינו בתעודה; אחרי סימון — "כבר סומן"', async () => {
  const r = await open([[3604, 2, 'פרנה 4 בשקית'], [209, 3, 'ביס עננים']]);
  beep(r, FULL);
  assert.equal(kind(r), 'choose');
  // לפי סדר התעודה (פרנה בשורה 6, ביס עננים בשורה 7), ואחריהם מי שאינו בתעודה — לפי הסדר במאגר
  assert.deepEqual(picks(r), ['code_3604', 'code_209', 'code_3703', 'code_3601']);
  assert.equal(strip(card(r)), 'לאיזה מוצר הכוונה? אותו ברקוד מודפס על 4 מוצרים — בחר את המוצר שסרקת. ' +
    'פרנה - 4 בשקית 400 גר בתעודה · שורה 6 · 2 יח׳ קוד 3604 ביס עננים - 8 לחמניות בסגנון בריוש בתעודה · שורה 7 · 3 יח׳ קוד 209 ' +
    'לחמניות המבורגר 8 בשקית ודש לא בתעודה קוד 3703 לבש - לחם ארמני דוראל לא בתעודה קוד 3601');
  assert.equal((card(r).match(/bg-emerald-50 border-emerald-300/g) || []).length, 2, 'שני המוצרים שבתעודה — בירוק');
  cardClick(r, { scanPick: 'code_209' });
  assert.deepEqual(json(r, '[receiptLineScanCard.kind, receiptLineScanCard.di, receiptLineScanCard.li, receiptLineScanCard.scanned.id, receiptLineScanCard.addQty]'), ['line', 0, 6, 'code_209', false]);
  assert.equal(strip(card(r)), 'שורה 7 בתעודה ביס עננים - 8 לחמניות בסגנון בריוש בקופה: ₪16.90 3 יח׳ בתעודה הגיע 3 אחרת לא הגיע ' + OTHER);
  cardClick(r, { scanMark: 'ok' });
  returned(r, 'lineCheck_0_6');
  assert.deepEqual(marks(r), ['101:,1231:,238:,2381:,2387:,3604:,209:ok']);
  // שוב — הבחירה אומרת מה כבר סומן; הפרנה: "אחרת" 1 מתוך 2
  await rescan(r); beep(r, FULL);
  assert.match(strip(card(r)), /פרנה - 4 בשקית 400 גר בתעודה · שורה 6 · 2 יח׳ קוד 3604 ביס עננים - 8 לחמניות בסגנון בריוש בתעודה · שורה 7 · 3 יח׳ · כבר סומן \(3\) קוד 209 /);
  cardClick(r, { scanPick: 'code_3604' }); cardClick(r, { scanMark: 'qty' }); cardType(r, '1');
  assert.equal(r.run(`$('scanLineSum').textContent`), 'התקבלו 1 · חוסר 1');
  cardClick(r, { scanSave: '' });
  returned(r, 'lineCheck_0_5');
  assert.deepEqual(marks(r), ['101:,1231:,238:,2381:,2387:,3604:qty:1,209:ok']);
  // סריקה חוזרת של מי שכבר סומן, דרך הבחירה — "עוד כמה?" עם מה שחסר
  await rescan(r); beep(r, FULL); cardClick(r, { scanPick: 'code_3604' });
  assert.deepEqual(json(r, '[receiptLineScanCard.addQty, receiptLineScanCard.got]'), [true, '1']);
  assert.match(strip(card(r)), /סרקת עד עכשיו 1 מתוך 2 .* עוד כמה\? הוסף סה״כ 2 · כמו בתעודה לא נכון\? תקן את הסה״כ לא המוצר הזה\? בחר מוצר אחר$/);
  cardClick(r, { scanSave: '' });
  returned(r, 'lineCheck_0_5');
  assert.deepEqual(marks(r), ['101:,1231:,238:,2381:,2387:,3604:ok,209:ok']);
});

test('5. הגיע מוצר אחר מזה שבתעודה — בוחרים אותו: "הגיע בנוסף", והשורה שבתעודה נשארת לסימון; "בחר מוצר אחר"; ✕ סוגר בלי לסמן', async () => {
  const r = await open([[3604, 1, 'פרנה 4 בשקית']]);
  const ALL = ['code_209', 'code_3703', 'code_3604', 'code_3601'];
  const ticks = r.callbacks.length;
  beep(r, FULL);
  assert.equal(kind(r), 'choose');
  // בתעודה פרנה, אבל על הרצפה ביס עננים (אותו ברקוד) — בוחרים את מה שהגיע, לא את מה שבתעודה
  cardClick(r, { scanPick: 'code_209' });
  assert.deepEqual(json(r, '[receiptLineScanCard.kind, receiptLineScanCard.k, receiptLineScanCard.scanned.id]'), ['extra', -1, 'code_209']);
  assert.equal(strip(card(r)), 'לא בתעודה — הגיע בנוסף ביס עננים - 8 לחמניות בסגנון בריוש בקופה: ₪16.90 4033569 כמה הגיע? הוסף התקבלו 1 · עודף 1 ' + OTHER);
  assert.match(card(r), /<button type="button" data-scan-choose class="btn-tap min-h-\[44px\] w-full /, 'יעד מגע של 44px');
  // טעות — "בחר מוצר אחר": חזרה לבחירה (בלי לסמן), ומשם לפרנה — הכרטיס של השורה שלה
  cardClick(r, { scanChoose: '' });
  assert.deepEqual(json(r, 'receiptLineScanCard'), { kind: 'choose', choices: ALL });
  cardClick(r, { scanChoose: '' });
  assert.equal(kind(r), 'choose', '"בחר מוצר אחר" בתוך הבחירה — כלום');
  cardClick(r, { scanPick: 'code_3604' });
  assert.deepEqual(json(r, '[receiptLineScanCard.kind, receiptLineScanCard.di, receiptLineScanCard.li, receiptLineScanCard.scanned.id]'), ['line', 0, 5, 'code_3604']);
  // עד כאן שום דבר לא סומן, והמצלמה לא זזה
  assert.deepEqual(marks(r), ['101:,1231:,238:,2381:,2387:,3604:']); assert.deepEqual(review(r).extras, []);
  assert.equal(r.run('scanPurpose'), 'linecheck'); assert.equal(r.callbacks.length, ticks, 'הלולאה מושהית לאורך כל הבחירה');
  // ✕ מתוך הבחירה — סוגר בלי לסמן, הסריקה ממשיכה, ואותו ברקוד לא נקרא שוב בשתי השניות הבאות
  cardClick(r, { scanChoose: '' }); cardClick(r, { scanDismiss: '' });
  assert.equal(cardOpen(r), false); assert.equal(r.run('receiptLineScanCard'), null);
  assert.equal(r.callbacks.length, ticks + 1, 'הסריקה ממשיכה');
  assert.equal(r.run('scanPurpose'), 'linecheck');
  beep(r, FULL);
  assert.equal(cardOpen(r), false, 'המוצר עדיין מול המצלמה — לא נקרא שוב');
  later(r); beep(r, FULL);
  assert.equal(kind(r), 'choose', 'אחרי שתי שניות — סריקה חדשה, ושוב שואלים');
  // ובאמת הגיע ביס עננים: "הוסף" — הוא ב"הגיע משהו נוסף", והשורה של הפרנה לא סומנה מעצמה (נשארת לסימון ביד: "לא הגיע")
  cardClick(r, { scanPick: 'code_209' }); cardClick(r, { scanSave: '' });
  returned(r, 'lineExtra_0');
  assert.deepEqual(review(r).extras.map(x => [x.productId, x.got]), [['code_209', '1']]);
  assert.deepEqual(marks(r), ['101:,1231:,238:,2381:,2387:,3604:']);
  assert.equal(r.run(`$('receiptQuantityProgress').textContent`), 'סומנו 0 מתוך 6 שורות · עודף 1 יח׳');
  assert.equal(r.run(`$('receiptQuantityConfirm').textContent`), 'סיום (נשארו 6)');
});

test('6. מה שלא השתנה: ברקוד של מוצר אחד — הכרטיס כמו תמיד, בלי "בחר מוצר אחר"; ברקוד לא מוכר — ההודעה', async () => {
  const r = await open([[3604, 1, 'פרנה 4 בשקית']]);
  // הקוד המלא מהאריזה של מוצר שבתעודה (497112 שמור כקטע) — השורה שלו
  beep(r, '7290000497112');
  assert.deepEqual(json(r, '[receiptLineScanCard.kind, receiptLineScanCard.di, receiptLineScanCard.li, receiptLineScanCard.scanned.id]'), ['line', 0, 0, 'code_101']);
  assert.equal(r.run('"choices" in receiptLineScanCard'), false);
  assert.doesNotMatch(card(r), /data-scan-choose|בחר מוצר אחר|לאיזה מוצר/);
  assert.match(strip(card(r)), /^שורה 1 בתעודה אחיד פרוס ברמן .* 12 יח׳ בתעודה הגיע 12 אחרת לא הגיע$/);
  cardClick(r, { scanDismiss: '' });
  // מוצר אחד שאינו בתעודה — "הגיע בנוסף" כמו תמיד
  later(r); beep(r, '7290002037194');
  assert.deepEqual(json(r, '[receiptLineScanCard.kind, receiptLineScanCard.k, receiptLineScanCard.scanned.id]'), ['extra', -1, 'code_119']);
  assert.match(strip(card(r)), /^לא בתעודה — הגיע בנוסף לחם מלא בטוב .* כמה הגיע\? הוסף התקבלו 1 · עודף 1$/);
  cardClick(r, { scanDismiss: '' });
  // ברקוד שאינו במאגר
  const ticks = r.callbacks.length;
  later(r); beep(r, '7290119390519');
  assert.equal(cardOpen(r), false);
  assert.equal(r.toasts[r.toasts.length - 1], '❌ ברקוד לא מזוהה: 7290119390519 — בדוק את הברקוד בכרטיס המוצר, או הוסף מוצר חדש');
  assert.equal(r.callbacks.length, ticks + 1, 'הסריקה ממשיכה');
});

test('7. קוד מלא שמור במוצר אחד גובר על קטע משותף — בלי שאלה', async () => {
  const r = await open();
  // מי שסרק את האריזה לתוך כרטיס המוצר שמר את הקוד המלא — ההתאמה המלאה היא של מוצר אחד
  r.run(`products.find(p => p.id === 'code_3604').barcode = '${FULL}'`);
  assert.deepEqual(json(r, `findProductsByBarcode('${FULL}').map(p => p.id)`), ['code_3604']);
  beep(r, FULL);
  assert.deepEqual(json(r, '[receiptLineScanCard.kind, receiptLineScanCard.k, receiptLineScanCard.scanned.id]'), ['extra', -1, 'code_3604']);
  assert.doesNotMatch(card(r), /data-scan-choose|לאיזה מוצר/);
  cardClick(r, { scanDismiss: '' });
  // הקטע עצמו (הקלדה / ברקוד קצר) — שלושת האחרים, ושואלים
  later(r); beep(r, SHARED);
  assert.deepEqual(json(r, 'receiptLineScanCard'), { kind: 'choose', choices: ['code_209', 'code_3703', 'code_3601'] });
  assert.match(strip(card(r)), /אותו ברקוד מודפס על 3 מוצרים — בחר את המוצר שסרקת\./);
});

test('8. יחידה מול מארז חיוב בתוך הבחירה; מוצר שנמחק מהמאגר בזמן שהבחירה פתוחה', async () => {
  const r = await open();
  // שני מוצרים חדשים על ברקוד אחד: מארז החיוב של אחיד פרוס (שבתעודה כיחידה), ומוצר אחר לגמרי
  r.run(`products.push({ id: 'pack101', name: 'אחיד פרוס — מארז 6', code: '9101', barcode: '7290000000060', price: 30 }, { id: 'other60', name: 'מוצר אחר על אותו ברקוד', code: '9102', barcode: '7290000000060', price: 9 });
    const unit = products.find(p => p.id === 'code_101'); unit.billingPackId = 'pack101'; unit.billingPackSize = 6;`);
  beep(r, '7290000000060');
  assert.equal(kind(r), 'choose', 'אף אחד מהשניים אינו בתעודה בעצמו');
  assert.equal(strip(card(r)), 'לאיזה מוצר הכוונה? אותו ברקוד מודפס על 2 מוצרים — בחר את המוצר שסרקת. ' +
    'אחיד פרוס — מארז 6 בתעודה — היחידה הבודדת שלו · שורה 1 · 12 יח׳ קוד 9101 מוצר אחר על אותו ברקוד לא בתעודה קוד 9102');
  cardClick(r, { scanPick: 'pack101' });
  assert.deepEqual(json(r, '[receiptLineScanCard.kind, receiptLineScanCard.di, receiptLineScanCard.li, receiptLineScanCard.scanned.id, receiptLineScanCard.related.id]'), ['line', 0, 0, 'pack101', 'code_101']);
  assert.match(strip(card(r)), /^סרקת אחיד פרוס — מארז 6 — בתעודה היחידה הבודדת שלו: שורה 1 בתעודה אחיד פרוס ברמן .* הגיע 12 אחרת לא הגיע לא המוצר הזה\? בחר מוצר אחר$/);
  cardClick(r, { scanChoose: '' });
  assert.equal(kind(r), 'choose');
  // מוצר שנמחק מהמאגר בינתיים (ממכשיר אחר) — אינו מוצע, ובחירה בו אינה עושה כלום
  r.run(`products = products.filter(p => p.id !== 'other60')`);
  cardClick(r, { scanPick: 'other60' });
  assert.equal(kind(r), 'choose');
  assert.deepEqual(picks(r), ['pack101']);
  // כשלא נשאר ממה לבחור — הכרטיס נסגר והסריקה ממשיכה
  const ticks = r.callbacks.length;
  r.run(`products = products.filter(p => p.id !== 'pack101')`);
  cardClick(r, { scanPick: 'pack101' });
  assert.equal(cardOpen(r), false); assert.equal(r.run('receiptLineScanCard'), null);
  assert.equal(r.callbacks.length, ticks + 1);
  assert.equal(r.run('scanPurpose'), 'linecheck');
});

test('9. שוויון: סימון דרך הבחירה נשמר בדיוק כמו סימון ביד', async () => {
  const click = (r, dataset) => r.run(`receiptLineCheckClick({ target: { closest: () => ({ dataset: ${JSON.stringify(dataset)} }) } })`);
  const type = (r, dataset, value) => r.run(`receiptLineCheckInput({ target: { dataset: ${JSON.stringify(dataset)}, value: ${JSON.stringify(value)} } })`);
  const more = [[3604, 2, 'פרנה 4 בשקית'], [209, 3, 'ביס עננים']];
  // בסריקה: פרנה 1 מתוך 2 וביס עננים 3 — שניהם דרך "לאיזה מוצר הכוונה?"; השאר "הגיע"
  const a = await open(more);
  beep(a, FULL); cardClick(a, { scanPick: 'code_3604' }); cardClick(a, { scanMark: 'qty' }); cardType(a, '1'); cardClick(a, { scanSave: '' });
  await rescan(a); beep(a, FULL); cardClick(a, { scanPick: 'code_209' }); cardClick(a, { scanMark: 'ok' });
  for (const code of ['497112', '498256', '497204', '4033033', '4033057']) { await rescan(a); beep(a, code); cardClick(a, { scanMark: 'ok' }); }
  // ביד — אותם סימונים
  const b = await open(more);
  b.run('closeScanner()'); // ✕ במצלמה — חזרה לרשימה
  click(b, { lineMark: '0:5:qty' }); type(b, { lineGot: '0:5' }, '1');
  [0, 1, 2, 3, 4, 6].forEach(li => click(b, { lineMark: '0:' + li + ':ok' }));
  const pick = r => json(r, '({ docs: receiptQuantityReview.docs, extras: receiptQuantityReview.extras, rows: receiptQuantityReview.rows, products: receiptQuantityReview.products })');
  assert.deepEqual(pick(a), pick(b), 'אותה בדיקה בדיוק');
  assert.deepEqual(marks(a), ['101:ok,1231:ok,238:ok,2381:ok,2387:ok,3604:qty:1,209:ok']);
  assert.equal(a.run('finishReceiptLineCheck()'), true); assert.equal(b.run('finishReceiptLineCheck()'), true);
  assert.deepEqual(json(a, 'receiptList'), json(b, 'receiptList'));
  assert.deepEqual(json(a, 'receiptList.filter(l => ["code_3604", "code_209"].includes(l.productId)).map(l => l.productId + " " + l.qty).sort()'), ['code_209 3', 'code_3604 1']);
});

test('10. הקליטה בסריקה — הבורר הקיים, כמו קודם', async () => {
  const r = app(note());
  catalog(r);
  r.run(`globalThis.__picker = null; openBarcodeChoicePicker = list => { globalThis.__picker = list.map(p => p.id); };`);
  r.run(`handleReceivingScan('${FULL}')`);
  assert.deepEqual(json(r, '__picker'), ['code_209', 'code_3703', 'code_3604', 'code_3601'], '"לאיזה מוצר הכוונה?" של הקליטה בסריקה — אותם מועמדים, אותו סדר');
});

test('11. שתי תעודות: מוצר שבשתיהן הוא שורה אחת גם בבחירה, ומספר התעודה ליד כל מועמד', async () => {
  // תעודת המשלוח: פרנה ×1 (שורה 6) וביס עננים ×3 (שורה 7); נייר "ת.משלוח" קטן שמתווסף לבד: פרנה ×2 ולבש ×4
  const r = app(note([[3604, 1, 'פרנה 4 בשקית'], [209, 3, 'ביס עננים']]));
  catalog(r);
  await receive(r);
  const small = delivery('290096103', { internalNumber: null, headerText: 'ת.משלוח', docDate: printed(now) });
  small.scan.documents[0].rows = [{ itemCode: '3604', description: 'פרנה 4 בשקית', barcode: SHARED, quantity: 2, unitPriceExVat: 12.9, sourcePage: 1, lineNumber: 1 },
    { itemCode: '3601', description: 'לבש', barcode: SHARED, quantity: 4, unitPriceExVat: 14.9, sourcePage: 1, lineNumber: 2 }];
  Object.assign(small.scan.documents[0], { totalUnits: 6, printedLines: 2 });
  r.serve(small);
  await readPapers(r, 1, 1);
  assert.deepEqual(state(r).nums, [NOTE, '290096103'], 'שתי התעודות בקליטה');
  r.run(`currentView = 'receiving'; mainMode = 'receiving';`);
  fakeCamera(r);
  r.run('startReceiptLineCheck()');
  r.events.get('receiptLineScan:click')();
  await settle();
  beep(r, FULL);
  assert.equal(kind(r), 'choose', 'שלושה מהמועמדים בתעודות');
  assert.deepEqual(picks(r), ['code_3604', 'code_209', 'code_3601', 'code_3703']);
  assert.equal(strip(card(r)), 'לאיזה מוצר הכוונה? אותו ברקוד מודפס על 4 מוצרים — בחר את המוצר שסרקת. ' +
    'פרנה - 4 בשקית 400 גר בתעודה 1 · שורה 6 · 3 יח׳ ב-2 תעודות קוד 3604 ביס עננים - 8 לחמניות בסגנון בריוש בתעודה 1 · שורה 7 · 3 יח׳ קוד 209 ' +
    'לבש - לחם ארמני דוראל בתעודה 2 · שורה 2 · 4 יח׳ קוד 3601 לחמניות המבורגר 8 בשקית ודש לא בתעודה קוד 3703');
  // הפרנה — הכרטיס של הקבוצה (v164): 3 בשתי התעודות, והסימון מתחלק 1 + 2
  cardClick(r, { scanPick: 'code_3604' });
  assert.match(strip(card(r)), /^שורה 6 בתעודה 1 מתוך 2 · גם בתעודה 2 \(2 יח׳\) פרנה - 4 בשקית 400 גר .* 3 יח׳ ב-2 תעודות 1 \+ 2 הגיע 3 אחרת לא הגיע לא המוצר הזה\? בחר מוצר אחר$/);
  cardClick(r, { scanMark: 'ok' });
  returned(r, 'lineCheck_0_5');
  assert.deepEqual(marks(r), ['101:,1231:,238:,2381:,2387:,3604:ok,209:', '3604:ok,3601:']);
  // הלבש — בנייר הקטן
  await rescan(r); beep(r, FULL);
  assert.match(strip(card(r)), /פרנה - 4 בשקית 400 גר בתעודה 1 · שורה 6 · 3 יח׳ ב-2 תעודות · כבר סומן \(3\) קוד 3604 /);
  cardClick(r, { scanPick: 'code_3601' });
  assert.deepEqual(json(r, '[receiptLineScanCard.kind, receiptLineScanCard.di, receiptLineScanCard.li, receiptLineScanCard.scanned.id]'), ['line', 1, 1, 'code_3601']);
  assert.match(strip(card(r)), /^שורה 2 בתעודה 2 מתוך 2 לבש - לחם ארמני דוראל .* 4 יח׳ בתעודה הגיע 4 אחרת לא הגיע /);
  cardClick(r, { scanMark: 'none' });
  returned(r, 'lineCheck_1_1');
  assert.deepEqual(marks(r), ['101:,1231:,238:,2381:,2387:,3604:ok,209:', '3604:ok,3601:none']);
});

test('12. הגרסה עלתה ל-168, כולל ההערה ב-service worker', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /const APP_VERSION = '168'/);
  assert.match(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), /גרסת אפליקציה 168/);
});
