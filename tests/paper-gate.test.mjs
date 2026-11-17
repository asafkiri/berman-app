// v172 — מוצר שמודפס בתעודה ואינו מזוהה במאגר: כרטיס זיהוי במסך הקליטה, במקום מסך ההשוואה לפני שנספר משהו (כמו ביטבתה 419).
// בעל העסק, 17.11.2026 (על יטבתה — אותו עיקרון בכל האפליקציות): "שלא יופיע ישר חוסר בכל המוצרים — זה מלחיץ את המשתמש", ו"שיהיה יותר
// מובן שצריך רק לאשר את השורות האלה ואפשר להמשיך לקלוט את הסחורה".
// עד 171: שורה שקוד הפריט שלה לא נמצא במאגר עצרה את הרשימה, ואחרי אימות הקריאה האפליקציה פתחה את מסך ההשוואה — "חסר ביחידות 30 יח׳"
// וכל מוצר כחוסר, לפני שנספר משהו — בלי דרך לזהות שם את המוצר.
// אותם נתונים מומצאים כמו ב-line-check-pending (תעודת משלוח: 5 שורות, 30 יח׳); בשורה 5 קוד פריט שאינו במאגר.
// מה שנבדק:
// 1. "בדוק שורה-שורה" (וגם הכפתור הכחול שבתחתית): נשארים במסך הקליטה, עם כרטיס אחד במילים של בעל העסק — בלי מסך ההשוואה ובלי "חסר".
// 2. שלוש הבחירות האחרות ("הכל תואם", "חוסרים ועודפים", "לא הגיע כלום"), גם ממסך הניירות: אותו דבר — בלי שאלה ובלי שמירה.
// 3. "זה המוצר" על הצעה מהמאגר: השורה משויכת (לשורה הזאת, בקליטה הזאת; המאגר לא משתנה), ארבע הבחירות חוזרות, הבחירה שורדת רענון.
// 4. סורקים בזמן שהתעודה נקראת: אימות הקריאה, אחריו הכרטיס (החלון נסגר, מה שנסרק נשמר), ואחרי הזיהוי הרשימה עולה לבד עם מה שנסרק.
// 5. "בחר מוצר מהמאגר": חיפוש לפי שם, קוד פריט או ברקוד; "זה המוצר שמופיע בשורה?"; אזהרה על מוצר שכבר בתעודה; "כן, שייך לשורה".
// 6. "בטל את הבחירה" מחזיר את השורה בדיוק כמו שהייתה; לחיצה על כרטיס שהתיישן (השורה השתנתה) אינה משייכת.
// 7. "מוצר חדש — הוסף למאגר": הכרטיס הרגיל עם מה שמודפס בשורה; אחרי השמירה המוצר משויך לשורה; סגירה בלי לשמור — כלום לא משתנה.
// 8. מוצר בלי ברקוד במאגר נבחר כמו כל מוצר; "בדוק שורה-שורה" שנעצר בכרטיס — הרשימה עולה לבד אחרי הזיהוי.
// 9. שני מוצרים שלא זוהו: "N מוצרים", אחד אחד; ההצעות: קוד פריט דומה, מחירון; מוצר שכבר בתעודה אינו מוצע.
// 10. מה שהכרטיס לא יכול לפתור נשאר כמו עד היום: אימות קריאה שממתין — הכרטיס שלו; קליטה שנספרת במסך הסריקה — מסך ההשוואה.
// 11. עד השמירה: הקליטה נשמרת עם המוצר שנבחר, והבחירה נרשמת כהחלטה של העובד (manual_catalog_pick); בחירה שהמוצר שלה נמחק — חוזרת לזיהוי.
// 12. הגרסה.
// הרצה: TZ=Asia/Jerusalem node --test tests/paper-gate.test.mjs
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { app, delivery, lineListArrives, receive, startRound, until } from './one-button-helpers.mjs';

const BIG = '244785003';
const json = (r, e) => JSON.parse(r.run('JSON.stringify(' + e + ')'));
const strip = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
const settle = async () => { for (let i = 0; i < 40; i++) await new Promise(res => setImmediate(res)); };
const fakeCamera = r => r.run(`window.BarcodeDetector = class { detect() { return Promise.resolve([]); } };
  navigator.mediaDevices = { getUserMedia: async () => ({ getTracks: () => [], getVideoTracks: () => [] }) };
  globalThis.__buzz = []; navigator.vibrate = p => { __buzz.push(p); return true; };
  $('scanVideo').play = async () => {};`);
const readyBuzzes = r => json(r, `__buzz.filter(p => Array.isArray(p) && p.join() === '60,40,60')`);
// שורה 5 של התעודה (פיתות עננים 8, קוד 2387) נקראת עם קוד פריט שאינו במאגר; המחירון המודפס (14.20) נשאר
function unknown(edit) {
  const p = delivery(BIG), rows = p.scan.documents[0].rows;
  rows[4] = { ...rows[4], itemCode: '9999', barcode: '7290000099999', description: 'לחם חדש שאינו במאגר' };
  if (edit) edit(rows, p);
  return p;
}
const screen = r => strip(r.node('app').innerHTML);
const roles = r => [...new Set([...r.node('app').innerHTML.matchAll(/data-role="([^"]+)"/g)].map(m => m[1]))];
const unesc = s => s.replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const attrsOf = tag => Object.fromEntries([...tag.matchAll(/data-([a-z-]+)="([^"]*)"/g)].map(m => [m[1].replace(/-([a-z])/g, (x, c) => c.toUpperCase()), unesc(m[2])]));
const buttons = (r, role) => [...r.node('app').innerHTML.matchAll(new RegExp('<button[^>]*data-role="' + role + '"[^>]*>', 'g'))].map(m => attrsOf(m[0]));
// לחיצה אמיתית על כפתור שבמסך — עם כל ה-data שלו (המאזין של האפליקציה קורא doc, row, token, product)
const press = (r, dataset) => { const target = { dataset, closest: s => s === '[data-role]' ? target : null }; return r.events.get('app:click')({ target }); };
const gate = r => json(r, `(function(){ const g = receiptPaperGate(); return g && g.rows.map(x => ({ doc: x.documentIndex, row: x.rowIndex, line: x.lineNumber, qty: x.qty, code: x.row.supplierItemCode })); })()`);
const row = (r, i = 4) => json(r, `aiScanResponse.scan.documents[0].rows[${i}]`);
const hidden = r => r.run(`$('receiptQuantityModal').classList.contains('hidden')`);
const pendingNow = r => r.run(`!!receiptQuantityReview && receiptQuantityReview.mode === 'lines' && receiptQuantityReview.pending === true`);
const listUp = r => r.run(`!!receiptQuantityReview && receiptQuantityReview.mode === 'lines' && !receiptQuantityReview.pending`);
const review = r => json(r, 'receiptQuantityReview');
const marks = r => review(r).docs.map(d => d.lines.map(l => l.mark + (l.got ? ':' + l.got : '')).join(','));
const counted = r => json(r, 'receiptList.map(l => [l.productId, l.qty])');
const lastToast = r => r.toasts[r.toasts.length - 1];
const click = (r, dataset) => r.run(`receiptLineCheckClick({ target: { closest: () => ({ dataset: ${JSON.stringify(dataset)} }) } })`);
const type = (r, dataset, value) => r.run(`receiptLineCheckInput({ target: { dataset: ${JSON.stringify(dataset)}, value: ${JSON.stringify(value)} } })`);
function add(r, id, qty) { click(r, { extraAdd: id }); const k = r.run('receiptQuantityReview.extras.length') - 1; type(r, { extraGot: String(k) }, String(qty)); }
// "בדקתי מול התעודה — שמור את הנתונים", בלי לשנות דבר: קוד הפריט מודפס כך בתעודה
async function confirmOcrAsPrinted(r) {
  const docs = json(r, `bermanOcrPendingDocs().map(d => ({ doc: d.noteIndex, fields: bermanOcrReviewFields(d).map(f => ({ key: f.key, value: String(f.value) })) }))`);
  for (const d of docs) {
    r.context.document.querySelectorAll = selector => selector === '[data-ocr-doc]' ? d.fields.map(f => ({ dataset: { ocrDoc: String(d.doc), ocrKey: f.key }, value: f.value })) : [];
    r.click('berman-ocr-confirm', String(d.doc)); await settle();
  }
  r.context.document.querySelectorAll = () => [];
  assert.equal(r.run('bermanOcrPendingDocs().length'), 0, 'אימות הקריאה הושלם');
}
// התעודה כבר בקליטה (נקראה במסך הניירות), ואימות הקריאה של קוד הפריט אושר כמו שהוא מודפס — מסך הקליטה מול העיניים
async function arrived(paper = unknown(), opts) {
  const r = app(paper, opts); fakeCamera(r);
  await receive(r, 1, 0, { count: false });
  r.run(`setView('receiving')`);
  await confirmOcrAsPrinted(r);
  return r;
}
// "התחל לסרוק עכשיו" בזמן שהניירות נקראים (כמו ב-line-check-pending): החלון פתוח, והקריאה מעוכבת עד arrive()
async function scanningWhileRead(paper = unknown(), opts) {
  const r = app(paper, opts); fakeCamera(r);
  const release = r.hold(), round = startRound(r);
  await until(() => r.requests.length === 1);
  return { r, arrive: async () => { release(); await round; await r.run('paperJoinChain'); } };
}
// חלון הבחירה מהמאגר: המאזין האחד של החלון (כמו הבורר "לאיזה מוצר הכוונה?")
const pickerClick = (r, selector, dataset = {}) => r.events.get('new-div:click')({ target: { closest: s => s === selector ? { dataset } : null } });
const pickerType = (r, value) => r.events.get('new-div:input')({ target: { id: 'gatePickSearch', value } });
const pickerBody = r => strip(r.node('gatePickBody').innerHTML);
const pickerResults = r => r.node('gatePickResults').innerHTML;
const pickIds = html => [...html.matchAll(/data-pick-id="([^"]+)"/g)].map(m => m[1]);
// מהבדיקה ועד השמירה, כמו בטלפון (line-check-pending): מסך ההבדלים (אם יש) → "קלוט" → הסיכום → "אשר וקלוט"
async function saveAfterCheck(r) {
  if (r.run(`testConfirms.length > 0 && testConfirms[testConfirms.length - 1].title === 'פער בספירת הפריטים'`)) r.run('testConfirms.pop().cb()');
  if (r.run('currentView') === 'reconcile') r.run('aiApplyInvoiceResult()');
  assert.ok(r.run('!!pendingReceipt'), 'הסיכום פתוח');
  await r.run('confirmReceipt()'); await settle();
  const saved = r.writes.filter(w => w.op === 'set' && w.path && w.path[w.path.length - 2] === 'receipts').map(w => w.data);
  assert.equal(saved.length, 1, 'הקליטה נשמרה — פעם אחת');
  return saved[0];
}
function markRestOk(r) { review(r).docs.forEach((d, di) => d.lines.forEach((l, li) => { if (!l.mark) click(r, { lineMark: di + ':' + li + ':ok' }); })); }

test('1. מוצר שאינו במאגר: "בדוק שורה-שורה" משאיר במסך הקליטה עם כרטיס אחד — בלי מסך ההשוואה ובלי "חסר" על כל התעודה', async () => {
  const r = await arrived();
  assert.equal(r.run('currentView'), 'receiving'); assert.equal(r.run('receiptPaperScanState'), 'ok'); assert.equal(r.run('receiptCountingMode'), 'manual');
  assert.equal(r.run('!!receiptLineCheckDocs()'), false, 'אי אפשר לבנות את הרשימה');
  assert.deepEqual(gate(r), [{ doc: 0, row: 4, line: 5, qty: 3, code: '9999' }]);
  // הכרטיס במקום ארבע הבחירות
  assert.deepEqual(roles(r).filter(x => /^rc-quantity-/.test(x)), [], 'בלי בחירות שעוד אינן יכולות לפעול');
  assert.match(r.node('app').innerHTML, /data-paper-gate role="status"/);
  const text = screen(r);
  assert.match(text, /תעודת המשלוח נקראה · 5 שורות · 30 יח׳/);
  assert.match(text, /צריך רק לזהות מוצר אחד — ואז ממשיכים לקלוט/);
  assert.match(text, /המוצר הזה מודפס בתעודה, אבל האפליקציה לא זיהתה אותו במאגר לפי קוד הפריט\. בוחרים כאן איזה מוצר זה\. מיד אחרי זה בוחרים כאן איך לבדוק, וממשיכים לקלוט את הסחורה\./);
  assert.match(text, /שום דבר לא חסר — עוד לא נספר כלום\./);
  assert.match(text, /כך מודפס בתעודה · עמוד 1 · שורה 5 לחם חדש שאינו במאגר קוד פריט 9999 · 3 יח׳ בתעודה · מחירון ₪14\.20/);
  assert.deepEqual(roles(r).filter(x => /^gate-/.test(x)), ['gate-pick-product', 'gate-pick-search', 'gate-pick-new']);
  assert.doesNotMatch(text, /חסר ב|חוסר|לא נסרק|עודף/, 'שום מילה על חוסר במסך');
  // "בדוק שורה-שורה" — מהכפתור הכחול שבתחתית (הבחירות עצמן אינן על המסך): נשארים כאן, ואומרים מה צריך
  let said = r.toasts.length;
  r.run('receiptFinishFromBar()');
  assert.equal(r.run('currentView'), 'receiving', 'לא מסך ההשוואה'); assert.equal(r.run('reconcileData'), null); assert.equal(hidden(r), true);
  assert.equal(r.toasts.length, said + 1); assert.equal(lastToast(r), 'קודם מזהים את המוצר שכאן — ואז ממשיכים לקלוט.');
  assert.match(screen(r), /מיד אחרי זה הבדיקה שורה-שורה נפתחת לבד, וממשיכים לקלוט את הסחורה\./, 'הרשימה תעלה לבד אחרי הזיהוי');
  // וגם הלחיצה עצמה על "בדוק שורה-שורה"
  said = r.toasts.length;
  r.click('rc-quantity-lines');
  assert.equal(r.run('currentView'), 'receiving'); assert.equal(r.run('reconcileData'), null); assert.equal(r.toasts.length, said + 1);
  assert.equal(r.run('testConfirms.length'), 0); assert.equal(r.run('receiptQuantityReview'), null); assert.deepEqual(counted(r), []);
});

test('2. שלוש הבחירות האחרות — גם ממסך הניירות: נשארים במסך הקליטה, בלי שאלה ובלי שמירה', async () => {
  const r = await arrived();
  for (const start of [`startReceiptQuantityReview(true)`, `startReceiptQuantityReview(false)`, `startReceiptQuantityReview('none')`]) {
    const said = r.toasts.length;
    r.run(start);
    assert.equal(r.run('currentView'), 'receiving', start); assert.equal(r.run('reconcileData'), null, start);
    assert.equal(r.toasts.length, said + 1, start); assert.equal(lastToast(r), 'קודם מזהים את המוצר שכאן — ואז ממשיכים לקלוט.');
    assert.equal(r.run('testConfirms.length'), 0, 'בלי שאלה: ' + start); assert.equal(r.run('receiptQuantityReview'), null, start);
    assert.equal(r.run('!!pendingReceipt'), false, start);
  }
  // שלוש הבחירות אינן רצות לבד אחרי הזיהוי — הכרטיס אומר שבוחרים שוב
  assert.match(screen(r), /מיד אחרי זה בוחרים כאן איך לבדוק, וממשיכים לקלוט את הסחורה\./);
  // ממסך הניירות (אותן בחירות, מתחת לנייר שנקרא)
  for (const role of ['paper-quantity-all', 'paper-quantity-differences', 'paper-none-arrived', 'paper-quantity-lines']) {
    r.run(`currentView = 'paperIntake'`);
    const said = r.toasts.length;
    press(r, { role });
    assert.equal(r.run('currentView'), 'receiving', role); assert.equal(r.run('reconcileData'), null, role);
    assert.equal(r.toasts.length, said + 1, role); assert.equal(lastToast(r), 'קודם מזהים את המוצר שכאן — ואז ממשיכים לקלוט.');
    assert.match(r.node('app').innerHTML, /data-paper-gate/, role);
  }
  assert.equal(r.run('testConfirms.length'), 0); assert.equal(r.writes.filter(w => w.path && w.path.includes('receipts')).length, 0, 'שום דבר לא נשמר');
});

test('3. "זה המוצר" על הצעה: השורה משויכת — לשורה הזאת, בקליטה הזאת — ארבע הבחירות חוזרות, והבחירה שורדת רענון', async () => {
  const storage = new Map();
  const r = await arrived(unknown(), { storage });
  const before = row(r), catalog = json(r, 'products');
  // ההצעה: המוצר היחיד במאגר שהמחירון שלו הוא המחירון שמודפס בשורה
  const offers = buttons(r, 'gate-pick-product');
  assert.deepEqual(offers.map(o => [o.doc, o.row, o.product]), [['0', '4', 'code_2387']]);
  assert.match(screen(r), /אולי זה המוצר: פיתות עננים 8 אותו מחירון כמו בשורה קוד 2387 · מחירון ₪14\.20 זה המוצר זה מוצר אחר — בחר מהמאגר מוצר חדש — הוסף למאגר/);
  press(r, { role: 'gate-pick-product', ...offers[0] });
  assert.equal(lastToast(r), '"פיתות עננים 8" שויך לשורה. עכשיו בוחרים איך לבדוק — וממשיכים לקלוט.');
  const after = row(r);
  assert.equal(after.barcodeMatchMethod, 'user_catalog_pick'); assert.equal(after.__tnuvaProductId, 'code_2387');
  assert.equal(after.barcodeUserPickedProductId, 'code_2387'); assert.equal(after.barcodeUserPickedCode, '9999'); assert.ok(after.userConfirmedAt > 0);
  assert.equal(after.supplierItemCode, '9999', 'מה שנקרא מהנייר נשאר'); assert.equal(after.description, before.description); assert.equal(after.quantity, 3);
  assert.deepEqual(json(r, 'products'), catalog, 'המאגר לא השתנה');
  // הכרטיס ירד, ארבע הבחירות חזרו, ומה שזוהה ביד מופיע מתחתיהן עם "בטל את הבחירה"
  assert.equal(gate(r), null); assert.doesNotMatch(r.node('app').innerHTML, /data-paper-gate/);
  assert.deepEqual(roles(r).filter(x => /^rc-quantity-|^gate-/.test(x)), ['rc-quantity-lines', 'rc-quantity-all', 'rc-quantity-differences', 'rc-quantity-none', 'gate-pick-undo']);
  assert.match(screen(r), /מוצר אחד שזיהית מהמאגר פיתות עננים 8 בתעודה: לחם חדש שאינו במאגר · עמוד 1 · שורה 5 · קוד פריט 9999 בטל את הבחירה/);
  assert.equal(r.run('!!receiptLineCheckDocs()'), true, 'עכשיו יש רשימה');
  assert.deepEqual(json(r, `receiptLineCheckDocs().docs[0].lines.map(l => [l.productId, l.paperQty])`), [['code_101', 12], ['code_1231', 6], ['code_238', 4], ['code_2381', 5], ['code_2387', 3]]);
  assert.equal(json(r, `(function(){ const prev = reconcileData; reconcileData = []; try { return aiEvaluateInvoiceScan(aiScanResponse).allRowsMapped; } finally { reconcileData = prev; } })()`), true);
  // רענון של הדף: הבחירה בטיוטה, בלי קריאה נוספת ובלי כרטיס
  const saved = JSON.parse(storage.get('bm_receipt_draft')).paperScan.response.scan.documents[0].rows[4];
  assert.equal(saved.barcodeMatchMethod, 'user_catalog_pick'); assert.equal(saved.__tnuvaProductId, 'code_2387');
  const b = app(unknown(), { storage: new Map(storage) }); fakeCamera(b);
  b.run(`currentView = 'receiving'; mainMode = 'receiving'; renderReceiving();`);
  assert.equal(b.run('receiptPaperScanState'), 'ok'); assert.equal(gate(b), null); assert.equal(b.run('!!receiptLineCheckDocs()'), true);
  assert.equal(b.requests.length, 0, 'בלי קריאה נוספת');
  // עכשיו "בדוק שורה-שורה" פותח את הרשימה, עם השורה שזוהתה
  b.click('rc-quantity-lines');
  assert.equal(listUp(b), true); assert.equal(hidden(b), false);
  assert.deepEqual(review(b).docs[0].lines.map(l => l.productId), ['code_101', 'code_1231', 'code_238', 'code_2381', 'code_2387']);
});

test('4. סורקים בזמן שהתעודה נקראת: אימות הקריאה, אחריו הכרטיס — ואחרי הזיהוי הרשימה עולה לבד, עם מה שנסרק', async () => {
  const { r, arrive } = await scanningWhileRead();
  add(r, 'code_101', 12);   // בדיוק כמו בתעודה
  add(r, 'code_2387', 3);   // המוצר שבשורה שלא זוהתה
  await arrive();
  assert.equal(r.run('receiptPaperScanState'), 'ok'); assert.equal(pendingNow(r), true);
  // ניסיון ראשון: אימות הקריאה של קוד הפריט — כמו עד היום
  assert.equal(lineListArrives(r), 1);
  assert.equal(hidden(r), true); assert.equal(r.run('currentView'), 'receiving');
  assert.match(lastToast(r), /קודם בדוק מול הנייר את המספרים המסומנים באימות הקריאה/);
  assert.match(r.node('app').innerHTML, /data-ocr-key="4:itemCode"/);
  assert.equal(gate(r), null, 'אימות הקריאה קודם');
  // הקוד מודפס כך בתעודה — "בדקתי מול התעודה": הכרטיס, לא מסך ההשוואה
  await confirmOcrAsPrinted(r);
  assert.ok(lineListArrives(r) >= 1);
  assert.equal(r.run('currentView'), 'receiving', 'לא מסך ההשוואה'); assert.equal(r.run('reconcileData'), null);
  assert.equal(hidden(r), true, 'החלון לא נשאר מעל הכרטיס'); assert.equal(pendingNow(r), true, 'הבדיקה מחכה, עם מה שנסרק');
  assert.deepEqual(counted(r), [['code_101', 12], ['code_2387', 3]], 'מה שנסרק נשמר');
  assert.equal(lastToast(r), 'קודם מזהים את המוצר שכאן — ואז ממשיכים לקלוט.');
  const text = screen(r);
  assert.match(text, /צריך רק לזהות מוצר אחד — ואז ממשיכים לקלוט/);
  assert.match(text, /מיד אחרי זה הבדיקה שורה-שורה נפתחת לבד, וממשיכים לקלוט את הסחורה\./);
  assert.match(text, /מה שכבר נסרק נשמר: 2 מוצרים · 15 יח׳ — יסומן ברשימה כשהיא תיפתח\./);
  assert.match(text, /שום דבר לא חסר — הבדיקה מול התעודה עוד לא התחילה\./);
  assert.doesNotMatch(text, /חסר ב|חוסר|לא נסרק|עודף/);
  assert.deepEqual(readyBuzzes(r), [[60, 40, 60], [60, 40, 60]], 'רטט לכל ניסיון שהמשתמש רואה');
  // לא מנסים שוב לבד על אותו מצב של הנייר
  let said = r.toasts.length;
  r.run('renderReceiving()'); lineListArrives(r);
  assert.equal(r.toasts.length, said); assert.equal(hidden(r), true);
  // "זה המוצר" — הרשימה עולה לבד, ומה שנסרק מסומן
  const offer = buttons(r, 'gate-pick-product').find(o => o.product === 'code_2387');
  assert.ok(offer, 'ההצעה לפי המחירון');
  press(r, { role: 'gate-pick-product', ...offer });
  assert.equal(lastToast(r), '"פיתות עננים 8" שויך לשורה — הבדיקה שורה-שורה נפתחת.');
  assert.ok(lineListArrives(r) >= 1);
  assert.equal(listUp(r), true); assert.equal(hidden(r), false, 'הרשימה מול העיניים');
  assert.equal(r.run('testConfirms.length'), 0, 'בלי שאלה — המשתמש כבר בתוך הבדיקה');
  assert.deepEqual(marks(r), ['ok,,,,ok'], 'שתי השורות שנסרקו מסומנות — גם זו שזוהתה עכשיו');
  assert.deepEqual(review(r).extras, [], 'שום דבר לא נשאר "נוסף"');
  assert.equal(r.run(`$('receiptQuantityProgress').textContent`), 'התעודה בקליטה — 5 שורות · 2 כבר סומנו ממה שנסרק');
  assert.deepEqual(readyBuzzes(r).length, 3);
});

test('5. "בחר מוצר מהמאגר": חיפוש לפי שם, קוד פריט או ברקוד; "זה המוצר שמופיע בשורה?"; אזהרה על מוצר שכבר בתעודה', async () => {
  const r = await arrived();
  const search = buttons(r, 'gate-pick-search')[0];
  assert.equal(strip(r.node('app').innerHTML.match(/<button[^>]*data-role="gate-pick-search"[^>]*>([\s\S]*?)<\/button>/)[1]), 'זה מוצר אחר — בחר מהמאגר');
  press(r, { role: 'gate-pick-search', ...search });
  assert.equal(r.run('!!receiptGatePickState'), true, 'החלון נפתח');
  assert.match(r.node('new-div').innerHTML, /בחירת מוצר מהמאגר/);
  // בראש החלון — מה שמודפס בשורה; בלי חיפוש — ההצעות
  assert.match(pickerBody(r), /^כך מודפס בתעודה · עמוד 1 · שורה 5 לחם חדש שאינו במאגר קוד פריט 9999 · 3 יח׳ בתעודה · מחירון ₪14\.20/);
  assert.match(pickerBody(r), /אולי זה המוצר: פיתות עננים 8 אותו מחירון כמו בשורה קוד 2387 · מחירון ₪14\.20 לא זה\? הקלד למעלה חלק מהשם שמודפס בשורה, או את קוד הפריט\./);
  // חיפוש לפי שם, לפי קוד פריט ולפי ברקוד
  pickerType(r, 'כוסמין');
  assert.deepEqual(pickIds(pickerResults(r)).sort(), ['code_344', 'code_401', 'code_649']);
  pickerType(r, '3604');
  assert.deepEqual(pickIds(pickerResults(r)), ['code_3604']);
  pickerType(r, '4033569');
  assert.deepEqual(pickIds(pickerResults(r)), ['code_3604']);
  pickerType(r, 'אין מוצר כזה');
  assert.equal(strip(pickerResults(r)), 'לא נמצא מוצר כזה במאגר. מוצר חדש? סגור את החלון ולחץ "מוצר חדש — הוסף למאגר".');
  // מוצר שכבר מופיע בתעודה — אחרון ברשימה, עם הערה; ובשלב האישור — אזהרה
  pickerType(r, 'פיתות');
  const found = pickIds(pickerResults(r));
  assert.deepEqual(found.slice(-2).sort(), ['code_238', 'code_2381'], 'מה שכבר בתעודה — בסוף');
  assert.match(strip(pickerResults(r)), /ברמן אסלי 5 פיתות קוד 238 · מחירון ₪7\.95 כבר מופיע בתעודה · עמוד 1 · שורה 3/);
  pickerClick(r, '[data-pick-id]', { pickId: 'code_238' });
  assert.match(pickerBody(r), /זה המוצר שמופיע בשורה\? ברמן אסלי 5 פיתות קוד 238 · מחירון ₪7\.95 · ברקוד 497204 שים לב: המוצר הזה כבר מופיע בתעודה \(עמוד 1 · שורה 3\)\. אם הוא ישויך גם לשורה הזאת, הכמויות של שתי השורות יתחברו\./);
  assert.equal(row(r).barcodeMatchMethod, null, 'עוד לא שויך דבר');
  // "חזרה לחיפוש" — החיפוש נשאר; בוחרים את המוצר הנכון ומאשרים
  pickerClick(r, '[data-pick-back]');
  assert.match(r.node('gatePickBody').innerHTML, /id="gatePickSearch"[^>]*value="פיתות"/);
  pickerClick(r, '[data-pick-id]', { pickId: 'code_2387' });
  assert.match(pickerBody(r), /זה המוצר שמופיע בשורה\? פיתות עננים 8 קוד 2387 · מחירון ₪14\.20 · ברקוד 4033057 השיוך הוא לשורה הזאת, בקליטה הזאת בלבד — המאגר לא משתנה, והכמות נשארת כמו שנקראה\. כן, שייך לשורה חזרה לחיפוש$/);
  pickerClick(r, '[data-pick-confirm]');
  assert.equal(r.run('!!receiptGatePickState'), false, 'החלון נסגר');
  assert.equal(row(r).barcodeMatchMethod, 'user_catalog_pick'); assert.equal(row(r).__tnuvaProductId, 'code_2387');
  assert.equal(gate(r), null); assert.equal(lastToast(r), '"פיתות עננים 8" שויך לשורה. עכשיו בוחרים איך לבדוק — וממשיכים לקלוט.');
  // סגירה ב-✕ — שום דבר לא משתנה
  const c = await arrived();
  press(c, { role: 'gate-pick-search', ...buttons(c, 'gate-pick-search')[0] });
  pickerClick(c, '[data-pick-id]', { pickId: 'code_333' });
  pickerClick(c, '[data-pick-close]');
  assert.equal(c.run('!!receiptGatePickState'), false); assert.equal(row(c).barcodeMatchMethod, null); assert.equal(gate(c).length, 1);
});

test('6. "בטל את הבחירה" מחזיר את השורה בדיוק כמו שהייתה; כרטיס שהתיישן אינו משייך', async () => {
  const r = await arrived();
  const before = row(r), offer = buttons(r, 'gate-pick-product')[0];
  press(r, { role: 'gate-pick-product', ...offer });
  assert.equal(gate(r), null);
  press(r, { role: 'gate-pick-undo', ...buttons(r, 'gate-pick-undo')[0] });
  assert.deepEqual(row(r), before, 'בדיוק כמו לפני הבחירה');
  assert.equal(lastToast(r), 'הבחירה בוטלה. המוצר חזר לזיהוי — בחר אותו מחדש.');
  assert.deepEqual(gate(r), [{ doc: 0, row: 4, line: 5, qty: 3, code: '9999' }]); assert.match(r.node('app').innerHTML, /data-paper-gate/);
  assert.equal(r.run('!!receiptLineCheckDocs()'), false);
  // בחירה שנייה על אותה שורה (מוצר אחר), וביטול — עדיין בדיוק כמו בהתחלה
  press(r, { role: 'gate-pick-search', ...buttons(r, 'gate-pick-search')[0] });
  pickerClick(r, '[data-pick-id]', { pickId: 'code_333' }); pickerClick(r, '[data-pick-confirm]');
  assert.equal(row(r).__tnuvaProductId, 'code_333');
  press(r, { role: 'gate-pick-undo', ...buttons(r, 'gate-pick-undo')[0] });
  assert.deepEqual(row(r), before);
  // כרטיס שהתיישן: הכמות בשורה השתנתה מאז שהכפתור צויר — הלחיצה אינה משייכת, והמסך מצויר מחדש
  const stale = buttons(r, 'gate-pick-product')[0];
  r.run(`aiScanResponse.scan.documents[0].rows[4].description = 'שם אחר'`);
  press(r, { role: 'gate-pick-product', ...stale });
  assert.equal(lastToast(r), 'התעודה או המוצר השתנו. בחר שוב מהכרטיס.');
  assert.equal(row(r).barcodeMatchMethod, null); assert.match(screen(r), /כך מודפס בתעודה · עמוד 1 · שורה 5 שם אחר/);
  // מוצר שאינו במאגר, ושורה שאינה ממתינה לזיהוי
  press(r, { role: 'gate-pick-product', ...buttons(r, 'gate-pick-product')[0], product: 'no-such-product' });
  assert.equal(lastToast(r), 'התעודה או המוצר השתנו. בחר שוב מהכרטיס.'); assert.equal(row(r).barcodeMatchMethod, null);
  press(r, { role: 'gate-pick-product', ...buttons(r, 'gate-pick-product')[0], row: '0' });
  assert.equal(row(r, 0).barcodeMatchMethod, 'tnuva_code_exact', 'שורה שזוהתה לפי הקוד אינה משתנה');
});

test('7. "מוצר חדש — הוסף למאגר": הכרטיס הרגיל עם מה שמודפס בשורה; אחרי השמירה המוצר משויך לשורה; סגירה בלי לשמור — כלום', async () => {
  const r = await arrived();
  r.run(`pricingCats = [{ id: 'c1', name: 'לחם', pct: 30 }]; pricingCatsLoaded = true;`);
  for (const id of ['prod_barcode', 'prod_code', 'prod_name', 'prod_price', 'prod_invoicePrice']) r.node(id).setCustomValidity = () => {};
  const before = row(r), count = r.run('products.length');
  // נפתח וסוגרים בלי לשמור
  press(r, { role: 'gate-pick-new', ...buttons(r, 'gate-pick-new')[0] });
  assert.equal(r.run('prodAfterSaveTarget'), 'paper_gate'); assert.equal(r.node('prodTitle').textContent, 'מוצר חדש');
  assert.deepEqual(['prod_code', 'prod_name', 'prod_barcode', 'prod_price'].map(id => String(r.node(id).value)), ['9999', 'לחם חדש שאינו במאגר', '7290000099999', '14.2']);
  r.run('hideProdModal()');
  assert.equal(r.run('receiptGateNewProductContext'), null); assert.deepEqual(row(r), before); assert.equal(r.run('products.length'), count);
  // נפתח, משלימים קבוצה ושומרים
  press(r, { role: 'gate-pick-new', ...buttons(r, 'gate-pick-new')[0] });
  r.node('prod_name').value = 'לחם חדש'; r.node('prod_category').value = 'c1'; r.node('prod_visible').checked = true;
  await r.run('saveProd(false)'); await settle();
  const created = json(r, `products.find(p => p.id === 'code_9999')`);
  assert.ok(created, 'המוצר נוסף למאגר'); assert.deepEqual([created.code, created.name, created.barcode, created.listPrice], ['9999', 'לחם חדש', '7290000099999', 14.2]);
  assert.ok(r.writes.some(w => w.path && w.path.join('/').endsWith('products/code_9999')), 'נכתב לענן');
  assert.equal(row(r).barcodeMatchMethod, 'user_catalog_pick'); assert.equal(row(r).__tnuvaProductId, 'code_9999');
  assert.equal(lastToast(r), '"לחם חדש" נוסף למאגר ושויך לשורה. עכשיו בוחרים איך לבדוק — וממשיכים לקלוט.');
  assert.equal(gate(r), null); assert.equal(r.run('!!receiptLineCheckDocs()'), true);
  assert.equal(r.run('testConfirms.length'), 0, 'בלי שאלת כמות — הכמות נספרת בבדיקה');
  // השורה השתנתה בזמן שהכרטיס היה פתוח — המוצר נשמר, אבל אינו משויך לבד
  const c = await arrived();
  c.run(`pricingCats = [{ id: 'c1', name: 'לחם', pct: 30 }]; pricingCatsLoaded = true;`);
  for (const id of ['prod_barcode', 'prod_code', 'prod_name', 'prod_price', 'prod_invoicePrice']) c.node(id).setCustomValidity = () => {};
  press(c, { role: 'gate-pick-new', ...buttons(c, 'gate-pick-new')[0] });
  c.node('prod_category').value = 'c1'; c.node('prod_visible').checked = true;
  c.run(`aiScanResponse.scan.documents[0].rows[4].quantity = 4`);
  await c.run('saveProd(false)'); await settle();
  assert.ok(c.run(`!!products.find(p => p.id === 'code_9999')`)); assert.equal(row(c).barcodeMatchMethod, null);
  assert.equal(lastToast(c), 'המוצר נוסף למאגר, אבל שורת התעודה השתנתה ולכן לא שויכה — בחר אותו מהכרטיס.');
});

test('8. מוצר בלי ברקוד במאגר נבחר כמו כל מוצר; "בדוק שורה-שורה" שנעצר בכרטיס — הרשימה עולה לבד אחרי הזיהוי', async () => {
  const r = await arrived();
  r.run(`products.push({ id: 'crate1', name: 'לחם אחיד בתפזורת', code: '700', barcode: '', listPrice: 5, price: 4, quickCrate: true });`);
  // "בדוק שורה-שורה" נלחץ ונעצר בכרטיס
  r.run('receiptFinishFromBar()');
  assert.equal(r.run('currentView'), 'receiving'); assert.equal(r.run('receiptGateLinesWanted === receiptDraftId'), true);
  press(r, { role: 'gate-pick-search', ...buttons(r, 'gate-pick-search')[0] });
  pickerType(r, 'תפזורת');
  assert.deepEqual(pickIds(pickerResults(r)), ['crate1']);
  pickerClick(r, '[data-pick-id]', { pickId: 'crate1' });
  assert.match(pickerBody(r), /זה המוצר שמופיע בשורה\? לחם אחיד בתפזורת קוד 700 · מחירון ₪5\.00 השיוך הוא לשורה הזאת/, 'בלי ברקוד — בלי שורת ברקוד');
  pickerClick(r, '[data-pick-confirm]');
  assert.deepEqual([row(r).barcodeMatchMethod, row(r).__tnuvaProductId, row(r).barcode, row(r).barcodeReadType], ['user_catalog_pick', 'crate1', null, 'unreadable']);
  assert.equal(lastToast(r), '"לחם אחיד בתפזורת" שויך לשורה — הבדיקה שורה-שורה נפתחת.');
  // הרשימה עלתה לבד, עם השורה של המוצר שנבחר
  assert.equal(listUp(r), true); assert.equal(hidden(r), false); assert.equal(r.run('receiptGateLinesWanted'), null);
  assert.deepEqual(review(r).docs[0].lines.map(l => [l.productId, l.paperQty]), [['code_101', 12], ['code_1231', 6], ['code_238', 4], ['code_2381', 5], ['crate1', 3]]);
  assert.deepEqual(readyBuzzes(r), [[60, 40, 60]]);
});

test('9. שני מוצרים שלא זוהו: "2 מוצרים", אחד אחד; ההצעות — קוד פריט דומה ומחירון; מוצר שכבר בתעודה אינו מוצע', async () => {
  // שורה 3 (ברמן אסלי 5 פיתות, 238) נקראה 239: קוד שאינו במאגר, וסוטה בספרה אחת משלושה מוצרים (238, 339 ו-233) — אין תיקון
  // אוטומטי, יש שלוש הצעות. השם שנקרא ("פיתות פרימיום") מתאים רק למוצר שכבר מזוהה בשורה 4 של אותה תעודה — והוא אינו מוצע.
  const paper = unknown(rows => { rows[2] = { ...rows[2], itemCode: '239', barcode: '', description: 'פיתות פרימיום', unitPriceExVat: 9.99 }; });
  const r = await arrived(paper);
  assert.deepEqual(gate(r).map(g => [g.line, g.code]), [[3, '239'], [5, '9999']]);
  const text = screen(r);
  assert.match(text, /צריך רק לזהות 2 מוצרים — ואז ממשיכים לקלוט/);
  assert.match(text, /המוצרים האלה מודפסים בתעודה, אבל האפליקציה לא זיהתה אותם במאגר לפי קוד הפריט\. בוחרים כאן, אחד אחד, איזה מוצר זה\./);
  const offers = buttons(r, 'gate-pick-product');
  assert.deepEqual(offers.filter(o => o.row === '2').map(o => o.product), ['code_238', 'code_339', 'code_233'], 'הקודים שסוטים בספרה אחת — בלי 2381, שכבר בתעודה');
  assert.match(text, /כך מודפס בתעודה · עמוד 1 · שורה 3 פיתות פרימיום קוד פריט 239 · 4 יח׳ בתעודה · מחירון ₪9\.99 אולי אחד מאלה: ברמן אסלי 5 פיתות קוד פריט דומה קוד 238 · מחירון ₪7\.95 זה המוצר ברמן אקטיב קוד פריט דומה קוד 339 · מחירון ₪17\.21 זה המוצר זוג לחמניות אצבע בש' קוד פריט דומה קוד 233 · מחירון ₪4\.10 זה המוצר/);
  assert.deepEqual(offers.filter(o => o.row === '4').map(o => o.product), ['code_2387']);
  // בחיפוש המוצר שכבר בתעודה מופיע — עם ההערה
  press(r, { role: 'gate-pick-search', ...buttons(r, 'gate-pick-search')[0] });
  pickerType(r, 'פרימיום');
  assert.match(strip(pickerResults(r)), /^פיתות פרימיום 10 קוד 2381 · מחירון ₪12\.80 כבר מופיע בתעודה · עמוד 1 · שורה 4$/);
  pickerClick(r, '[data-pick-close]');
  // מזהים את הראשון: נשאר עוד אחד, והכרטיס נשאר
  press(r, { role: 'gate-pick-product', ...offers.find(o => o.row === '2' && o.product === 'code_238') });
  assert.equal(lastToast(r), '"ברמן אסלי 5 פיתות" שויך לשורה. נשאר לזהות עוד מוצר אחד.');
  assert.deepEqual(gate(r).map(g => g.line), [5]); assert.match(screen(r), /צריך רק לזהות מוצר אחד — ואז ממשיכים לקלוט/);
  assert.match(screen(r), /מוצר אחד שזיהית מהמאגר ברמן אסלי 5 פיתות בתעודה: פיתות פרימיום · עמוד 1 · שורה 3 · קוד פריט 239 בטל את הבחירה/, 'מה שכבר זוהה — בתוך הכרטיס');
  assert.deepEqual(buttons(r, 'gate-pick-product').map(o => [o.row, o.product]), [['4', 'code_2387']]);
  press(r, { role: 'gate-pick-product', ...buttons(r, 'gate-pick-product')[0] });
  assert.equal(gate(r), null); assert.equal(r.run('!!receiptLineCheckDocs()'), true);
  assert.match(screen(r), /2 מוצרים שזיהית מהמאגר/);
  assert.deepEqual(json(r, `receiptLineCheckDocs().docs[0].lines.map(l => [l.productId, l.paperQty])`), [['code_101', 12], ['code_1231', 6], ['code_238', 4], ['code_2381', 5], ['code_2387', 3]]);
});

test('10. מה שהכרטיס לא יכול לפתור נשאר כמו עד היום: אימות קריאה שממתין; קליטה שנספרת במסך הסריקה', async () => {
  // (א) אימות הקריאה ממתין — הכרטיס שלו, וארבע הבחירות, בדיוק כמו ב-171
  const r = app(unknown()); fakeCamera(r);
  await receive(r, 1, 0, { count: false });
  r.run(`setView('receiving')`);
  assert.equal(r.run('bermanOcrPendingDocs().length'), 1); assert.equal(gate(r), null);
  assert.deepEqual(roles(r).filter(x => /^rc-quantity-|^gate-|^berman-/.test(x)), ['rc-quantity-lines', 'rc-quantity-all', 'rc-quantity-differences', 'rc-quantity-none', 'berman-ocr-confirm']);
  r.click('rc-quantity-lines');
  assert.match(lastToast(r), /קודם בדוק מול הנייר את המספרים המסומנים באימות הקריאה/); assert.equal(r.run('currentView'), 'receiving');
  // (ב) טיוטה ישנה שנספרת במסך הסריקה (לא בבדיקה) — אין כרטיס, ו"יש חוסרים או עודפים" פותח את מסך ההשוואה כמו קודם
  const s = await arrived();
  s.run(`receiptCountingMode = 'scan'; receiptList = [{ productId: 'code_101', name: 'אחיד פרוס ברמן', barcode: '497112', qty: 12 }]; saveReceiptDraft(); renderReceiving();`);
  assert.equal(gate(s), null); assert.doesNotMatch(s.node('app').innerHTML, /data-paper-gate/);
  s.run('startReceiptQuantityReview(false)');
  assert.equal(lastToast(s), 'צריך להשלים את זיהוי המוצרים ובדיקת הפענוח לפני אישור הכמויות');
  assert.equal(s.run('currentView'), 'reconcile');
  // (ג) תעודה שכל המוצרים בה מזוהים — אין כרטיס, והבדיקה נפתחת כרגיל
  const ok = app(delivery(BIG)); fakeCamera(ok);
  await receive(ok, 1, 0, { count: false });
  ok.run(`setView('receiving')`);
  assert.equal(gate(ok), null); assert.doesNotMatch(ok.node('app').innerHTML, /data-paper-gate|data-gate-picked/);
  ok.click('rc-quantity-lines');
  assert.equal(listUp(ok), true); assert.equal(ok.run('receiptGateLinesWanted'), null);
});

test('11. עד השמירה: הקליטה נשמרת עם המוצר שנבחר, והבחירה נרשמת כהחלטה של העובד; מוצר שנמחק מהמאגר — השורה חוזרת לזיהוי', async () => {
  const r = await arrived();
  press(r, { role: 'gate-pick-product', ...buttons(r, 'gate-pick-product')[0] });
  r.click('rc-quantity-lines');
  assert.equal(listUp(r), true);
  click(r, { lineMark: '0:4:qty' }); type(r, { lineGot: '0:4' }, '2'); // מהמוצר שזוהה הגיעו 2 מתוך 3
  markRestOk(r);
  assert.equal(r.run('finishReceiptLineCheck()'), true);
  const saved = await saveAfterCheck(r);
  const line = saved.items.find(l => l.productId === 'code_2387');
  assert.deepEqual([line.qty, line.noteQty], [2, 3], 'חוסר של יחידה אחת — מול התעודה, אחרי ספירה');
  assert.equal(saved.items.length, 5);
  const mapping = (saved.aiAudit && saved.aiAudit.confirmedMappings || []).find(m => m.rowIndex === 4);
  assert.ok(mapping, 'הבחירה נרשמה בתעודה השמורה');
  assert.deepEqual([mapping.productId, mapping.confirmationSource, mapping.selectedProductId, mapping.sourceObserved, mapping.printedDescription, mapping.quantity, mapping.nameOnly],
    ['code_2387', 'manual_catalog_pick', 'code_2387', '9999', 'לחם חדש שאינו במאגר', 3, false]);
  assert.ok(mapping.confirmedAt > 0);
  // בחירה שהמוצר שלה נמחק מהמאגר — השורה חוזרת לזיהוי, והכרטיס חוזר
  const d = await arrived();
  press(d, { role: 'gate-pick-search', ...buttons(d, 'gate-pick-search')[0] });
  pickerClick(d, '[data-pick-id]', { pickId: 'code_333' }); pickerClick(d, '[data-pick-confirm]');
  assert.equal(gate(d), null);
  d.run(`products = products.filter(p => p.id !== 'code_333'); renderReceiving();`);
  assert.deepEqual(gate(d).map(g => g.line), [5]); assert.match(d.node('app').innerHTML, /data-paper-gate/);
  assert.doesNotMatch(d.node('app').innerHTML, /data-gate-picked/, 'בחירה שאינה תקפה אינה מוצגת כזיהוי');
  assert.equal(d.run(`aiResolveInvoiceBarcode(aiScanResponse.scan.documents[0].rows[4]).error`), 'המוצר שנבחר מהמאגר אינו קיים עוד במאגר — יש לבחור מוצר אחר');
  // בחירה שאינה שייכת לשורה כפי שנקראה (קוד פריט אחר) — אינה תקפה
  d.run(`aiScanResponse.scan.documents[0].rows[4].supplierItemCode = '8888'`);
  assert.equal(d.run(`aiResolveInvoiceBarcode(aiScanResponse.scan.documents[0].rows[4]).error`), 'בחירת המוצר מהמאגר אינה תואמת עוד לשורה — יש לבחור את המוצר שוב');
});

test('12. הגרסה עלתה ל-172, כולל ההערה ב-service worker', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /const APP_VERSION = '172'/);
  assert.match(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), /גרסת אפליקציה 172/);
});
