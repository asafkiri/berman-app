// v171 — הבדיקה שורה-שורה היא הדרך היחידה, והיא נפתחת לפני שתעודת המשלוח נכנסה לקליטה — וגם בלי נייר (כמו ביטבתה 417 ותנובה 163).
// בעל העסק, 12.11.2026: (1) "שהבדיקה שורה-שורה תהיה האופציה היחידה, כלומר לא תהיה האופציה סריקת מוצרים ('הגיע הכל' ו'לא הגיע כלום'
// עדיין יהיו אופציה)"; (2) "כאשר אני בוחר בדיקה שורה-שורה תהיה אופציה להתחיל לסרוק עוד לפני שהאפליקציה מסיימת לקרוא את התעודה — המשתמש
// מתחיל לסרוק, וכשסריקת התעודה נגמרת עולה כל הרשימה והמשתמש מבחינתו ממשיך את הבדיקה"; (3) "עדיין לתת אופציה להתחיל לסרוק ללא תעודה
// כלל, וגם אפשר לסגור אותה ככה — אבל אם הוא מצרף תעודה באמצע הבדיקה, הבדיקה הופכת להיות שורה-שורה".
// בברמן הניירות מצולמים ב"צלם נייר מהנהג" ונקראים במסך הניירות; תעודת משלוח נכנסת לקליטה לבד. אותם נתונים מומצאים כמו ב-v154/v160
// (תעודת משלוח: 5 שורות, 30 יח׳), ואותה מצלמה מזויפת (הברקוד "נקרא" דרך onScanned). הרשימה עולה לבד ב"תור הבא" של הדפדפן
// (setTimeout) — בבדיקות מריצים אותו עם lineListArrives.
// מה שנבדק:
// 1. "התחל לסרוק עכשיו" (בזמן שהניירות נקראים) פותח את חלון הבדיקה מיד: בלי רשימה, עם כרטיס מצב, ו"סיום" אפור שאומר למה. המצלמה
//    לא נפתחת לבד; מאחורי החלון — מסך הבדיקה; הבדיקה הממתינה נשמרת בטיוטה.
// 2. סורקים לפני שהרשימה עלתה: הכרטיס שמעל המצלמה שואל כמה הגיע; סריקה חוזרת — "עוד כמה?"; "תקן את הסה״כ"; חיפוש ביד; ברקוד
//    לא מוכר; ברקוד שמודפס על כמה מוצרים. מה שנסרק נשמר בספירה (receiptList) ובטיוטה.
// 3. תעודת המשלוח נכנסה — הרשימה עולה באותו חלון, לבד ובלי שאלה: כמו בתעודה → "הגיע"; כמות אחרת → "אחרת" עם המספר; לא בתעודה →
//    "הגיע משהו נוסף"; רטט אחד, והודעה בראש החלון. "סיום" — אותה קליטה שמורה כמו סימון ביד.
// 4. התעודה נכנסה כשהמצלמה פתוחה: המצלמה לא נסגרת, המונה עובר ל"סומנו", כרטיס שפתוח באותו רגע נבנה מחדש מול הרשימה ומה שהוקלד
//    בו נשאר; החלון מוצג כשהמצלמה נסגרת.
// 5. מספר שהקריאה סימנה לבדיקה מול הנייר: בזמן שהמצלמה פתוחה לא קורה דבר; כשהיא נסגרת — אימות הקריאה במסך הקליטה (החלון נסגר,
//    ניסיון אחד); אחרי האישור — הרשימה עולה לבד, עם מה שנסרק.
// 6. הסבב נגמר בלי תעודת משלוח, ונייר שלא אישר את עצמו: החלון אומר זאת וסורקים הלאה; "מה אפשר לעשות — במסך הקליטה"; תעודה שמצולמת
//    אחר כך — הרשימה, עם מה שנסרק. מספרים שהוקלדו ביד — מסך הסריקה, עם אותה ספירה.
// 7. בלי נייר: אותו חלון ("בדיקה בלי נייר"); "סיום — שמור בלי נייר" שומר קליטה בלי נייר, פתוחה, כמו קודם; המסך שמאחורי החלון.
// 8. בלי נייר, ואז מצלמים אותו באמצע: מה שנסרק נשאר, בזמן הקריאה "סיום" מחכה, והבדיקה הופכת לשורה-שורה כשתעודת המשלוח נכנסת.
// 9. מארז החיוב שנסרק כשבתעודה היחידה הבודדת (ולהפך) — עובר לשורה שבתעודה כשהכמות מתחלקת; אחרת נשאר "נוסף".
// 10. בדיקה שכבר סומנו בה שורות אינה מוחלפת כשעוד נייר נקרא; בדיקה ממתינה שורדת רענון; לחם בתפזורת; קריאה בלבד.
// 11. הכפתור הכחול שבתחתית ("בדוק וסיים") פותח את הבדיקה עד שהיא אושרה — לא השוואה של ספירה חלקית מול התעודה.
// 12. מה שאינו בדיקה כזאת: צירוף נייר לקליטה שמורה (כפתור אחד, בלי חלון); כרטיס הצילום "עמוד אחרי עמוד" — כפתור אחד.
// 13. הגרסה; "סריקת מוצרים" אינה נבחרת עוד בשום מסך.
// הרצה: TZ=Asia/Jerusalem node --test tests/line-check-pending.test.mjs
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { TODAY, app, credit, delivery, lineListArrives, readPapers, receive, startRound, state, until } from './one-button-helpers.mjs';

const BIG = '244785003';
// הברקודים של המוצרים בתעודה (fixture.json): אחיד פרוס ברמן ×12, לחמניות 10 בשקית ×6, ברמן אסלי 5 פיתות ×4, פיתות פרימיום 10 ×5,
// פיתות עננים 8 ×3; לחם מלא בטוב — לא בתעודה
const BC = { code_101: '497112', code_1231: '498256', code_238: '497204', code_2381: '4033033', code_2387: '4033057', code_119: '2037194' };
const json = (r, e) => JSON.parse(r.run('JSON.stringify(' + e + ')'));
const strip = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const settle = async () => { for (let i = 0; i < 40; i++) await new Promise(res => setImmediate(res)); };
// המצלמה המזויפת (כמו ב-line-check-scan), והרטט נרשם: הרטט של "הרשימה מוכנה" הוא התבנית [60, 40, 60] (סריקה וברקוד לא מוכר — אחרים)
const fakeCamera = r => r.run(`window.BarcodeDetector = class { detect() { return Promise.resolve([]); } };
  navigator.mediaDevices = { getUserMedia: async () => ({ getTracks: () => [], getVideoTracks: () => [] }) };
  globalThis.__buzz = []; navigator.vibrate = p => { __buzz.push(p); return true; };
  $('scanVideo').play = async () => {};`);
const readyBuzzes = r => json(r, `__buzz.filter(p => Array.isArray(p) && p.join() === '60,40,60')`);
function open(paper = delivery(BIG), opts) { const r = app(paper, opts); fakeCamera(r); return r; }
// "צלם נייר מהנהג" → "קרא" → "התחל לסרוק עכשיו", והקריאה מעוכבת: מחזיר את האפליקציה ואת מה שמשחרר את הקריאה עד שהתעודה בקליטה
async function scanningWhileRead(paper, opts) {
  const r = open(paper, opts);
  const release = r.hold(), round = startRound(r);
  await until(() => r.requests.length === 1);
  return { r, arrive: async () => { release(); await round; await r.run('paperJoinChain'); } };
}
const click = (r, dataset) => r.run(`receiptLineCheckClick({ target: { closest: () => ({ dataset: ${JSON.stringify(dataset)} }) } })`);
const type = (r, dataset, value) => r.run(`receiptLineCheckInput({ target: { dataset: ${JSON.stringify(dataset)}, value: ${JSON.stringify(value)} } })`);
const cardClick = (r, dataset) => r.run(`receiptLineScanCardClick({ target: { closest: () => ({ dataset: ${JSON.stringify(dataset)} }) } })`);
const cardType = (r, value) => r.run(`receiptLineScanCardInput({ target: { dataset: { scanGot: '' }, value: ${JSON.stringify(value)} } })`);
const beep = (r, code) => r.run(`lastScanTime = 0; onScanned(${JSON.stringify(code)})`);
const camera = async r => { r.events.get('receiptLineScan:click')(); await settle(); assert.equal(r.run('scanPurpose'), 'linecheck', 'המצלמה של הבדיקה נפתחה'); };
// מוצר שנוסף בחיפוש ביד (אותו נתיב כמו "הגיע משהו נוסף"), עם כמות
function add(r, id, qty) { click(r, { extraAdd: id }); const k = r.run('receiptQuantityReview.extras.length') - 1; type(r, { extraGot: String(k) }, String(qty)); }
const review = r => json(r, 'receiptQuantityReview');
const marks = r => review(r).docs.map(d => d.lines.map(l => l.mark + (l.got ? ':' + l.got : '')).join(','));
const counted = r => json(r, 'receiptList.map(l => [l.productId, l.qty])');
const title = r => r.run(`$('receiptQuantityTitle').textContent`);
const progress = r => r.run(`$('receiptQuantityProgress').textContent`);
const finishLabel = r => r.run(`$('receiptQuantityConfirm').textContent`);
const rows = r => strip(r.run(`$('receiptQuantityRows').innerHTML`));
const hidden = r => r.run(`$('receiptQuantityModal').classList.contains('hidden')`);
const card = r => strip(r.run(`$('scanLineCard').innerHTML`));
const cardOpen = r => !r.run(`$('scanLineCard').classList.contains('hidden')`);
const overlay = r => r.run(`$('scanOverlayLabel').textContent + ' ' + $('scanOverlayCount').textContent + ' | ' + $('scanOverlayName').textContent`);
const screen = r => strip(r.node('app').innerHTML);
const roles = r => [...new Set([...r.node('app').innerHTML.matchAll(/data-role="([^"]+)"/g)].map(m => m[1]))];
const pendingNow = r => r.run(`!!receiptQuantityReview && receiptQuantityReview.mode === 'lines' && receiptQuantityReview.pending === true`);
const listUp = r => r.run(`!!receiptQuantityReview && receiptQuantityReview.mode === 'lines' && !receiptQuantityReview.pending`);
const draft = r => JSON.parse(r.storage.get('bm_receipt_draft'));
function markRestOk(r) {
  review(r).docs.forEach((d, di) => d.lines.forEach((l, li) => { if (!l.mark) click(r, { lineMark: di + ':' + li + ':ok' }); }));
}
// מהבדיקה ועד השמירה, כמו בטלפון: מסך ההבדלים (אם יש) → "קלוט" → הסיכום → "אשר וקלוט"
async function saveAfterCheck(r) {
  // מוצר שאינו בתעודה ("הגיע משהו נוסף") — השאלה הקיימת על מספר השורות, כמו בכל קליטה: "המשך בכל זאת"
  if (r.run(`testConfirms.length > 0 && testConfirms[testConfirms.length - 1].title === 'פער בספירת הפריטים'`)) r.run('testConfirms.pop().cb()');
  if (r.run('currentView') === 'reconcile') r.run('aiApplyInvoiceResult()');
  assert.ok(r.run('!!pendingReceipt'), 'הסיכום פתוח');
  await r.run('confirmReceipt()'); await settle();
  const saved = r.writes.filter(w => w.op === 'set' && w.path && w.path[w.path.length - 2] === 'receipts').map(w => w.data);
  assert.equal(saved.length, 1, 'הקליטה נשמרה — פעם אחת');
  return saved[0];
}
const items = rc => rc.items.map(l => [l.productId, l.qty, l.noteQty == null ? null : l.noteQty]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
// נייר שהקריאה סימנה בו מספר אחד לבדיקה מול הנייר (כמות בשורה 2)
const flagged = () => { const p = delivery(BIG); p.verification = { ...p.verification, status: 'needs_review', escalationAttempted: true, issues: [{ noteIndex: 0, rowIndex: 1, field: 'quantity' }] }; return p; };

test('1. "התחל לסרוק עכשיו" פותח את חלון הבדיקה מיד, בזמן שהניירות נקראים — בלי רשימה, ו"סיום" מחכה לתעודה', async () => {
  const { r, arrive } = await scanningWhileRead();
  assert.equal(r.run('receiptPaperScanState'), 'running');
  assert.equal(r.run('receiptCountingMode'), 'manual', 'קליטה של בדיקה שורה-שורה');
  assert.equal(r.run('globalThis.__scanner'), 0, 'המצלמה לא נפתחת לבד');
  assert.equal(pendingNow(r), true); assert.equal(hidden(r), false);
  assert.equal(r.run('receiptLinePendingKind()'), 'reading');
  assert.deepEqual(json(r, '[receiptQuantityReview.docs, receiptQuantityReview.products, receiptQuantityReview.extras, receiptQuantityReview.rows]'), [[], [], [], []]);
  assert.equal(title(r), 'בדיקה שורה-שורה');
  assert.equal(r.run(`$('receiptQuantityIntro').textContent`), 'הנייר עוד נקרא — אפשר כבר לסרוק מוצרים. הרשימה תעלה כאן לבד, ומה שנסרק יסומן בה.');
  assert.equal(progress(r), 'עוד לא נסרק כלום');
  assert.equal(finishLabel(r), 'סיום — כשהנייר ייקרא');
  assert.match(r.run(`$('receiptQuantityConfirm').className`), /bg-slate-400/, 'אפור');
  assert.equal(r.run(`$('receiptLineScan').classList.contains('hidden')`), false, '"סרוק מוצר" בתחתית החלון');
  assert.match(rows(r), /^קורא את הניירות מהנהג.* אפשר לסרוק בינתיים\. כשתעודת המשלוח תיכנס לקליטה הטלפון ירטוט, והרשימה תעלה כאן עם מה שכבר נסרק\. נסרקו עד עכשיו עוד לא נסרק כלום — "סרוק מוצר" למטה, או חפש מוצר כאן\.$/);
  assert.match(r.run(`$('receiptQuantityRows').innerHTML`), /id="receiptLinePaperStatus" data-paper-kind="reading" role="status"/);
  assert.match(r.run(`$('receiptQuantityRows').innerHTML`), /data-line-search/, 'חיפוש ביד');
  // "סיום" בזמן הקריאה — אומר למה, ולא שומר ולא סוגר
  assert.equal(r.run('finishReceiptLineCheck()'), false);
  assert.equal(progress(r), 'הנייר עוד נקרא — אפשר להמשיך לסרוק. הרשימה תעלה כאן לבד, ואז אפשר לסיים.');
  assert.equal(hidden(r), false); assert.equal(r.run('pendingReceipt'), null);
  // מאחורי החלון — מסך הבדיקה, בלי מסך סריקה נפרד
  const html = r.node('app').innerHTML;
  assert.match(html, /data-manual-receiving/); assert.match(screen(r), /בדיקת הקליטה קורא את הניירות מהנהג/);
  assert.match(html, /data-role="rc-quantity-lines"[^>]*>(<i[^>]*><\/i>)? ?התחל לסרוק בינתיים — בדיקה שורה-שורה<\/button>/);
  assert.doesNotMatch(html, /data-role="rc-scan"|data-role="rc-crates"|rc-count-by-scan|id="rcListEl"/);
  // הבדיקה הממתינה בטיוטה
  assert.equal(draft(r).countingMode, 'manual');
  assert.deepEqual([draft(r).quantityReview.mode, draft(r).quantityReview.pending, draft(r).quantityReview.docs], ['lines', true, []]);
  // "חזרה" סוגר את החלון, ומסך הבדיקה מציע להמשיך; "התחל לסרוק בינתיים" פותח אותו שוב
  r.events.get('receiptQuantityClose:click')();
  assert.equal(hidden(r), true); assert.equal(pendingNow(r), true, 'הבדיקה נשארת');
  r.click('rc-quantity-lines');
  assert.equal(hidden(r), false); assert.equal(pendingNow(r), true);
  await arrive();
});

test('2. סורקים לפני שהרשימה עלתה: כמה הגיע, סריקה חוזרת "עוד כמה?", "תקן את הסה״כ", חיפוש ביד, ברקוד לא מוכר, ברקוד של כמה מוצרים — והכול בספירה', async () => {
  const { r, arrive } = await scanningWhileRead();
  await camera(r);
  assert.equal(hidden(r), true, 'החלון מוסתר בזמן הסריקה');
  assert.equal(r.run(`$('scanTitle').textContent`), 'בדיקה שורה-שורה — סריקה');
  assert.equal(overlay(r), 'נסרקו: 0 מוצרים | ');
  // סריקה ראשונה: כמה הגיע? (1 כברירת מחדל), "הוסף"
  beep(r, BC.code_101);
  assert.equal(cardOpen(r), true);
  assert.deepEqual(json(r, '[receiptLineScanCard.kind, receiptLineScanCard.k, receiptLineScanCard.addQty, receiptLineScanCard.got]'), ['extra', -1, false, '1']);
  assert.match(card(r), /^התעודה עוד לא בקליטה — המוצר יסומן ברשימה כשהיא תעלה אחיד פרוס ברמן .* 497112 כמה הגיע\? הוסף נסרקו 1 יח׳$/);
  cardType(r, '5');
  assert.equal(r.run('receiptLineScanSumText(receiptLineScanCard)'), 'נסרקו 5 יח׳');
  cardClick(r, { scanSave: '' });
  // כמו אחרי כל סימון — המצלמה נסגרת, והחלון חוזר עם מה שנסרק
  assert.equal(r.run('scanPurpose'), 'field'); assert.equal(hidden(r), false);
  assert.deepEqual(counted(r), [['code_101', 5]]);
  assert.equal(progress(r), 'נסרקו מוצר אחד · 5 יח׳');
  assert.match(rows(r), /נסרקו עד עכשיו אפשר לתקן כמות, או להסיר\. אחיד פרוס ברמן .* 497112 הסר כמה הגיע\?/);
  assert.deepEqual(draft(r).items.map(l => [l.productId, l.qty]), [['code_101', 5]], 'גם בטיוטה');
  // סריקה חוזרת: "עוד כמה?" — תוספת, עם הסה״כ; "תקן את הסה״כ" מחזיר לשדה של הסה״כ
  await camera(r);
  assert.equal(overlay(r), 'נסרקו: מוצר אחד | ');
  beep(r, BC.code_101);
  assert.deepEqual(json(r, '[receiptLineScanCard.kind, receiptLineScanCard.k, receiptLineScanCard.addQty, receiptLineScanCard.got]'), ['extra', 0, true, '1']);
  assert.match(card(r), /^סרקת עד עכשיו 5 יח׳ אחיד פרוס ברמן .* עוד כמה\? הוסף סה״כ 6 יח׳ לא נכון\? תקן את הסה״כ$/);
  cardType(r, '3');
  assert.equal(r.run('receiptLineScanSumText(receiptLineScanCard)'), 'סה״כ 8 יח׳');
  cardClick(r, { scanMark: 'fix' });
  assert.deepEqual(json(r, '[receiptLineScanCard.addQty, receiptLineScanCard.got]'), [false, '5']);
  assert.match(card(r), /^כבר נסרק: 5 יח׳ — אפשר לשנות אחיד פרוס ברמן .* כמה הגיע\? עדכן נסרקו 5 יח׳$/);
  cardType(r, '9'); cardClick(r, { scanSave: '' });
  assert.deepEqual(counted(r), [['code_101', 9]]);
  // תוספת שנשמרת מתחברת למה שכבר נסרק
  await camera(r); beep(r, BC.code_101); cardType(r, '3'); cardClick(r, { scanSave: '' });
  assert.deepEqual(counted(r), [['code_101', 12]]);
  // חיפוש ביד, בחלון: מוצר שני
  add(r, 'code_1231', 4);
  assert.deepEqual(counted(r), [['code_101', 12], ['code_1231', 4]]);
  assert.equal(progress(r), 'נסרקו 2 מוצרים · 16 יח׳');
  // שדה כמות לא תקין אינו נספר עד שיתוקן; "הסר" מוריד מהספירה
  type(r, { extraGot: '1' }, 'x');
  assert.deepEqual(counted(r), [['code_101', 12]]);
  type(r, { extraGot: '1' }, '4');
  click(r, { extraRemove: '1' });
  assert.deepEqual(counted(r), [['code_101', 12]]);
  add(r, 'code_1231', 4);
  // ברקוד שאינו במאגר: ההודעה של הקליטה, כלום לא השתנה והסריקה ממשיכה
  await camera(r);
  const said = r.toasts.length;
  beep(r, '7290999999999');
  assert.match(r.toasts[r.toasts.length - 1], /ברקוד לא מזוהה: 7290999999999/); assert.equal(r.toasts.length, said + 1);
  assert.equal(cardOpen(r), false); assert.equal(r.run('scanPurpose'), 'linecheck');
  assert.deepEqual(counted(r), [['code_101', 12], ['code_1231', 4]]);
  // ברקוד שמודפס על שני מוצרים — "לאיזה מוצר הכוונה?", ולפני שהרשימה עלתה נאמר רק מה כבר נסרק
  r.run(`products.push({ id: 'code_101_old', name: 'אחיד פרוס (פריט ישן)', code: '1010', barcode: '497112', price: 5 });`);
  beep(r, BC.code_101);
  assert.equal(json(r, 'receiptLineScanCard.kind'), 'choose');
  assert.match(card(r), /^לאיזה מוצר הכוונה\? אותו ברקוד מודפס על 2 מוצרים — בחר את המוצר שסרקת\. אחיד פרוס ברמן כבר נסרק · 12 יח׳ קוד 101 אחיד פרוס \(פריט ישן\) עוד לא נסרק קוד 1010$/);
  assert.doesNotMatch(card(r), /בתעודה|הגיע משהו נוסף/);
  cardClick(r, { scanPick: 'code_101_old' });
  assert.deepEqual(json(r, '[receiptLineScanCard.kind, receiptLineScanCard.k, receiptLineScanCard.scanned.id]'), ['extra', -1, 'code_101_old']);
  cardClick(r, { scanDismiss: '' });
  // ✕ במצלמה מחזיר לחלון, בלי לשנות דבר
  r.run('closeScanner()'); await settle();
  assert.equal(hidden(r), false); assert.equal(pendingNow(r), true);
  assert.deepEqual(counted(r), [['code_101', 12], ['code_1231', 4]]);
  assert.deepEqual(readyBuzzes(r), [], 'עוד אין רשימה — בלי הרטט שלה');
  await arrive();
});

test('3. תעודת המשלוח נכנסה — הרשימה עולה באותו חלון, לבד ובלי שאלה, ומה שנסרק כבר מסומן; "סיום" שומר כמו סימון ביד', async () => {
  const { r, arrive } = await scanningWhileRead();
  add(r, 'code_101', 12);  // בדיוק כמו בתעודה
  add(r, 'code_1231', 4);  // בתעודה 6
  add(r, 'code_119', 2);   // לא בתעודה
  const before = counted(r);
  await arrive();
  assert.equal(r.run('receiptPaperScanState'), 'ok'); assert.equal(r.run('receiptLinePendingKind()'), 'ready');
  assert.equal(pendingNow(r), true, 'עד התור הבא — עוד בדיקה ממתינה');
  assert.match(strip(r.run(`$('receiptLinePaperStatus').innerHTML`)), /^תעודת המשלוח בקליטה — הרשימה עולה…$/);
  assert.equal(lineListArrives(r), 1, 'הרשימה התבקשה פעם אחת');
  assert.equal(listUp(r), true); assert.equal(hidden(r), false, 'באותו חלון');
  assert.equal(r.run('testConfirms.length'), 0, 'בלי שאלה — המשתמש כבר בתוך הבדיקה');
  assert.deepEqual(readyBuzzes(r), [[60, 40, 60]], 'רטט אחד');
  assert.deepEqual(marks(r), ['ok,qty:4,,,']);
  assert.deepEqual(review(r).extras, [{ productId: 'code_119', name: 'לחם מלא בטוב', barcode: BC.code_119, got: '2' }]);
  assert.equal(title(r), 'בדיקה שורה-שורה');
  assert.equal(progress(r), 'התעודה בקליטה — 5 שורות · 2 כבר סומנו ממה שנסרק · מוצר אחד שאינו בתעודה');
  assert.equal(finishLabel(r), 'סיום (נשארו 3)');
  assert.deepEqual(counted(r), before, 'הספירה היא מה שנסרק — עד "סיום"');
  assert.equal(r.run('receiptCountingMode'), 'manual');
  // ממשיכים את הבדיקה כרגיל, ו"סיום"
  markRestOk(r);
  assert.equal(finishLabel(r), 'סיום — שמור את הבדיקה');
  assert.equal(r.run('finishReceiptLineCheck()'), true);
  const saved = await saveAfterCheck(r);
  // אותה קליטה כמו סימון ביד, בלי לסרוק לפני
  const b = open();
  await receive(b, 1, 0, { count: false });
  b.run(`currentView = 'receiving'; mainMode = 'receiving'; startReceiptLineCheck();`);
  click(b, { lineMark: '0:0:ok' }); click(b, { lineMark: '0:1:qty' }); type(b, { lineGot: '0:1' }, '4');
  click(b, { extraAdd: 'code_119' }); type(b, { extraGot: '0' }, '2');
  markRestOk(b);
  assert.equal(b.run('finishReceiptLineCheck()'), true);
  const byHand = await saveAfterCheck(b);
  assert.deepEqual(items(saved), items(byHand), 'אותן שורות');
  assert.deepEqual(items(saved).find(x => x[0] === 'code_1231'), ['code_1231', 4, 6]);
  for (const k of ['noteParts', 'paperDocs', 'units', 'count', 'status', 'unresolvedUnitsGap', 'noDoc']) assert.deepEqual(saved[k], byHand[k], k);
  assert.deepEqual(saved.quantityCheck.papers, byHand.quantityCheck.papers, 'ומה שסומן בכל שורה');
  // שורה אחת שסומנה — ביחיד
  const { r: one, arrive: arriveOne } = await scanningWhileRead();
  add(one, 'code_101', 12);
  await arriveOne(); lineListArrives(one);
  assert.equal(progress(one), 'התעודה בקליטה — 5 שורות · אחת כבר סומנה ממה שנסרק');
});

test('4. התעודה נכנסה כשהמצלמה פתוחה: המצלמה נשארת, המונה עובר ל"סומנו", וכרטיס פתוח נבנה מחדש מול הרשימה עם מה שהוקלד', async () => {
  const { r, arrive } = await scanningWhileRead();
  await camera(r);
  beep(r, BC.code_1231); cardType(r, '4');
  assert.match(card(r), /^התעודה עוד לא בקליטה/);
  await arrive();
  assert.equal(lineListArrives(r), 1);
  assert.equal(listUp(r), true);
  assert.equal(r.run('scanPurpose'), 'linecheck', 'המצלמה לא נסגרה'); assert.equal(hidden(r), true, 'החלון מחכה מאחוריה');
  assert.equal(overlay(r), 'סומנו 0 מתוך 5 | התעודה בקליטה ✓ הרשימה מוכנה');
  assert.deepEqual(readyBuzzes(r), [[60, 40, 60]]);
  // הכרטיס שהיה פתוח — עכשיו מול השורה שלו, עם הכמות בתעודה, ומה שהוקלד נשאר
  assert.deepEqual(json(r, '[receiptLineScanCard.kind, receiptLineScanCard.di, receiptLineScanCard.li, receiptLineScanCard.got, receiptLineScanCard.askQty]'), ['line', 0, 1, '4', true]);
  assert.match(card(r), /^שורה 2 בתעודה לחמניות 10 בשקית .* 6 יח׳ בתעודה כמה הגיע\? שמור התקבלו 4 · חוסר 2$/);
  cardClick(r, { scanSave: '' });
  assert.equal(r.run('scanPurpose'), 'field'); assert.equal(hidden(r), false, 'הרשימה מוצגת כשהמצלמה נסגרת');
  assert.deepEqual(marks(r), [',qty:4,,,']);
  assert.equal(progress(r), 'סומנו 1 מתוך 5 שורות · חוסר 2 יח׳');
  // סריקה חדשה כבר מגיעה לשורה שלה
  await camera(r);
  assert.equal(overlay(r), 'סומנו 1 מתוך 5 | ');
  beep(r, BC.code_238);
  assert.deepEqual(json(r, '[receiptLineScanCard.kind, receiptLineScanCard.li]'), ['line', 2]);
  cardClick(r, { scanMark: 'ok' });
  assert.deepEqual(marks(r), [',qty:4,ok,,']);
  // כרטיס של מוצר שאינו בתעודה, עם תוספת ("עוד כמה?") — אחרי שהרשימה עלתה השדה הוא הסה״כ
  const { r: x, arrive: arriveX } = await scanningWhileRead();
  add(x, 'code_119', 2);
  await camera(x); beep(x, BC.code_119); cardType(x, '3');
  assert.equal(json(x, 'receiptLineScanCard.addQty'), true);
  await arriveX(); lineListArrives(x);
  assert.deepEqual(json(x, '[receiptLineScanCard.kind, receiptLineScanCard.got]'), ['extra', '5'], '2 שנסרקו + 3 שהוקלדו');
  cardClick(x, { scanSave: '' });
  assert.deepEqual(review(x).extras.map(e => [e.productId, e.got]), [['code_119', '5']]);
});

test('5. מספר שהקריאה סימנה לבדיקה: המצלמה לא נקטעת; כשהיא נסגרת — אימות הקריאה במסך הקליטה; אחרי האישור הרשימה עולה לבד', async () => {
  const { r, arrive } = await scanningWhileRead(flagged());
  add(r, 'code_1231', 6);
  await camera(r);
  await arrive();
  assert.equal(r.run('bermanOcrPendingDocs().length'), 1); assert.equal(r.run('receiptLinePendingKind()'), 'ready');
  // המצלמה פתוחה — לא קורה דבר (בלי הודעה, בלי רטט), והסריקה ממשיכה
  let said = r.toasts.length;
  lineListArrives(r);
  assert.equal(r.toasts.length, said); assert.equal(pendingNow(r), true); assert.equal(r.run('scanPurpose'), 'linecheck');
  assert.equal(overlay(r), 'נסרקו: מוצר אחד | ');
  assert.deepEqual(readyBuzzes(r), []);
  // המצלמה נסגרת — ניסיון אחד: החלון נסגר, אימות הקריאה מוצג במסך הקליטה, ואומרים למה
  r.run('closeScanner()'); await settle();
  assert.ok(lineListArrives(r) >= 1);
  assert.equal(hidden(r), true, 'החלון לא נשאר מעל אימות הקריאה');
  assert.equal(pendingNow(r), true, 'הבדיקה מחכה, עם מה שנסרק'); assert.deepEqual(counted(r), [['code_1231', 6]]);
  assert.match(r.toasts[r.toasts.length - 1], /קודם בדוק מול הנייר את המספרים המסומנים באימות הקריאה/);
  assert.match(r.node('app').innerHTML, /data-ocr-key="1:quantity"/);
  said = r.toasts.length;
  r.run('renderReceiving()'); lineListArrives(r);
  assert.equal(r.toasts.length, said, 'לא מנסים שוב לבד על אותו מצב של הנייר'); assert.equal(hidden(r), true);
  // "בדקתי מול התעודה" — הרשימה עולה לבד, ומה שנסרק מסומן
  r.context.document.querySelectorAll = selector => selector === '[data-ocr-doc]' ? [{ dataset: { ocrDoc: '0', ocrKey: '1:quantity' }, value: '6' }] : [];
  r.click('berman-ocr-confirm', '0'); await settle();
  assert.equal(r.run('bermanOcrPendingDocs().length'), 0);
  assert.ok(lineListArrives(r) >= 1);
  assert.equal(listUp(r), true); assert.equal(hidden(r), false);
  assert.deepEqual(marks(r), [',ok,,,']);
  assert.equal(progress(r), 'התעודה בקליטה — 5 שורות · אחת כבר סומנה ממה שנסרק');
  assert.deepEqual(readyBuzzes(r), [[60, 40, 60], [60, 40, 60]], 'רטט לכל ניסיון שהמשתמש רואה');
  // מוצר שבתעודה לא זוהה במאגר (קוד פריט לא מוכר) — אותו דבר: אין רשימה עד שהוא נבדק, והמצלמה לא נקטעת
  const unknown = delivery(BIG);
  unknown.scan.documents[0].rows[4] = { ...unknown.scan.documents[0].rows[4], itemCode: '9999', code: '9999', barcode: '7290000099999', description: 'מוצר שאינו במאגר' };
  const { r: u, arrive: arriveU } = await scanningWhileRead(unknown);
  add(u, 'code_101', 12);
  await camera(u);
  await arriveU();
  assert.equal(u.run('receiptPaperScanState'), 'ok'); assert.equal(u.run('!!receiptLineCheckDocs()'), false, 'אי אפשר לבנות את הרשימה');
  said = u.toasts.length;
  lineListArrives(u);
  assert.equal(u.toasts.length, said); assert.equal(u.run('scanPurpose'), 'linecheck'); assert.equal(pendingNow(u), true);
  u.run('closeScanner()'); await settle();
  assert.ok(lineListArrives(u) >= 1);
  assert.equal(hidden(u), true); assert.equal(pendingNow(u), true); assert.equal(u.toasts.length, said + 1, 'אומרים למה');
  assert.equal(u.run('currentView') === 'receiving' ? /data-ocr-key/.test(u.node('app').innerHTML) : u.run('currentView') === 'reconcile', true, 'מה שצריך להשלים — מול העיניים');
  assert.deepEqual(counted(u), [['code_101', 12]], 'מה שנסרק נשמר');
});

test('6. בלי תעודת משלוח בסבב, ונייר שלא אישר את עצמו: החלון אומר זאת וסורקים הלאה; תעודה שמצולמת אחר כך — הרשימה; מספרים ביד — מסך הסריקה', async () => {
  // (א) בניירות שצולמו לא נמצאה תעודת משלוח (רק זיכוי)
  const r = open(credit());
  await receive(r);
  assert.equal(r.run('receiptPaperScanState'), 'failed'); assert.equal(r.run('receivingNoDeliveryYet()'), true);
  assert.equal(r.run('receiptLinePendingKind()'), 'failed'); assert.equal(pendingNow(r), true); assert.equal(hidden(r), false);
  assert.equal(finishLabel(r), 'סיום — כשתהיה תעודה');
  assert.match(strip(r.run(`$('receiptLinePaperStatus').innerHTML`)), /^עוד אין תעודת משלוח שאפשר לבדוק מולה בניירות שצולמו לא נמצאה תעודת משלוח\. מה שנסרק נשמר, ואפשר להמשיך לסרוק — הרשימה תעלה כשתעודת המשלוח תיכנס לקליטה\. מה אפשר לעשות — במסך הקליטה$/);
  add(r, 'code_101', 12);
  assert.equal(r.run('finishReceiptLineCheck()'), false);
  assert.equal(progress(r), 'עוד אין תעודת משלוח בקליטה — מה אפשר לעשות: במסך הקליטה. מה שנסרק נשמר.');
  // "מה אפשר לעשות — במסך הקליטה": החלון נסגר, והמסך מציע לצלם, להקליד או להמשיך בלי נייר — ולהמשיך לסרוק
  click(r, { linePaper: 'repair' });
  assert.equal(hidden(r), true); assert.equal(r.run('currentView'), 'receiving');
  assert.match(screen(r), /עוד אין תעודת משלוח בקליטה בניירות שצולמו לא נמצאה תעודת משלוח .* הקלד את המספרים מתחתית התעודה המשך בלי נייר בדיקת הקליטה המשך לסרוק בינתיים$/);
  for (const role of ['rc-notes-edit', 'rc-nodoc-switch', 'rc-quantity-lines']) assert.ok(roles(r).includes(role), role);
  assert.deepEqual(counted(r), [['code_101', 12]]);
  // תעודת המשלוח מצולמת (במסך הניירות) ונכנסת לקליטה הזאת — כשחוזרים למסך הקליטה הרשימה עולה, עם מה שנסרק
  r.serve(delivery(BIG));
  await readPapers(r, 1, 1);
  assert.equal(r.run('receiptPaperScanState'), 'ok'); assert.equal(r.run('receiptCountingMode'), 'manual');
  assert.deepEqual(counted(r), [['code_101', 12]], 'הספירה נשארת');
  r.run(`setView('receiving')`);
  assert.ok(lineListArrives(r) >= 1);
  assert.equal(listUp(r), true); assert.equal(hidden(r), false); assert.equal(r.run('testConfirms.length'), 0);
  assert.deepEqual(marks(r), ['ok,,,,']);
  // "המשך בלי נייר" (במקום לצלם): אותה ספירה, בדיקה בלי נייר
  const n = open(credit());
  await receive(n);
  add(n, 'code_101', 12);
  click(n, { linePaper: 'repair' });
  n.click('rc-nodoc-switch');
  assert.equal(n.run('receiptNoDoc'), true); assert.equal(n.run('receiptLinePendingKind()'), 'nodoc');
  assert.equal(hidden(n), false); assert.equal(title(n), 'בדיקה בלי נייר'); assert.equal(finishLabel(n), 'סיום — שמור בלי נייר');
  assert.deepEqual(counted(n), [['code_101', 12]]);
  // (ב) תעודה שנקראה ולא אישרה את עצמה (סך הכמויות אינו "סה״כ כללי" המודפס)
  const f = open(delivery('77001250', { totalUnits: 99 }));
  await receive(f);
  assert.equal(f.run('receiptPaperScanState'), 'failed'); assert.equal(f.run('receivingNoDeliveryYet()'), false);
  assert.match(strip(f.run(`$('receiptLinePaperStatus').innerHTML`)), /^עוד אין תעודת משלוח שאפשר לבדוק מולה סכום הכמויות שנקראו \(30\) אינו תואם ל"סה״כ כללי" המודפס \(99\)\. מה שנסרק נשמר/);
  add(f, 'code_101', 12);
  click(f, { linePaper: 'repair' });
  // מסך הבדיקה מציג את אותו כרטיס מלא כמו מסך הסריקה: להקליד את שני המספרים, או לצלם שוב
  assert.match(screen(f), /בדיקת הקליטה הנייר לא אישר את עצמו — צריך את המספרים ממך .* הקלד את המספרים מתחתית התעודה או: צלם את התעודה שוב בכפתור "צלם נייר מהנהג" למעלה .* המשך לסרוק בינתיים$/);
  assert.match(f.node('app').innerHTML, /data-manual-receiving/);
  // המספרים הוקלדו ביד — אין רשימה לבדוק מולה: מסך הסריקה, עם מה שכבר נסרק, מול שני המספרים
  f.run(`receiptNotes = [{ amount: 0, units: 30, lines: 5, kind: 'charge' }]; receiptAnchorSource = 'manual'; recomputeNoteTotal(); editingNotes = false; saveReceiptDraft(); renderReceiving();`);
  assert.equal(f.run('receiptAnchorsTyped()'), true); assert.equal(f.run('receiptLinePendingKind()'), null); assert.equal(f.run('receiptUsesManualQuantities()'), false);
  assert.doesNotMatch(f.node('app').innerHTML, /data-manual-receiving/);
  assert.match(f.node('app').innerHTML, /data-role="rc-scan"/);
  assert.match(screen(f), /12\/30 יח׳/);
  assert.deepEqual(counted(f), [['code_101', 12]]);
  assert.equal(lineListArrives(f), 0, 'בלי רשימה שעולה לבד');
});

test('7. בלי נייר: אותו חלון, "סיום — שמור בלי נייר" שומר קליטה פתוחה בלי נייר; המסך שמאחורי החלון', async () => {
  const r = open();
  r.run(`currentView = 'receiving'; mainMode = 'receiving'; renderReceiving();`);
  assert.match(screen(r), /קבלת סחורה בלי נייר/);
  r.click('rc-open-nodoc');
  assert.equal(r.run('receiptNoDoc'), true); assert.equal(r.run('receiptLinePendingKind()'), 'nodoc');
  assert.equal(pendingNow(r), true); assert.equal(hidden(r), false);
  assert.equal(title(r), 'בדיקה בלי נייר');
  assert.equal(r.run(`$('receiptQuantityIntro').textContent`), 'סרוק את מה שהגיע, או חפש מוצר והקלד כמה הגיע. אין רשימה להשוות אליה.');
  assert.equal(finishLabel(r), 'סיום — שמור בלי נייר');
  assert.match(rows(r), /^אין נייר — קולטים לפי מה שנסרק "סיום" שומר את הקליטה פתוחה עד שהנייר יגיע\. הנייר הגיע\? צלם אותו, והבדיקה תהפוך לשורה-שורה עם מה שכבר נסרק\. צלם נייר מהנהג נסרקו עד עכשיו עוד לא נסרק כלום/);
  assert.match(r.run(`$('receiptQuantityRows').innerHTML`), /data-line-paper="photo"/);
  // "סיום" בלי שנסרק דבר — אומר מה חסר
  assert.equal(r.run('finishReceiptLineCheck()'), false);
  assert.equal(progress(r), 'עוד לא נסרק כלום — סרוק מוצר, או חפש אותו והקלד כמה הגיע');
  // סורקים
  await camera(r);
  assert.equal(r.run(`$('scanTitle').textContent`), 'בדיקה בלי נייר — סריקה');
  beep(r, BC.code_101);
  assert.match(card(r), /^קבלת סחורה בלי נייר אחיד פרוס ברמן .* כמה הגיע\? הוסף נסרקו 1 יח׳$/);
  cardType(r, '12'); cardClick(r, { scanSave: '' });
  assert.deepEqual(counted(r), [['code_101', 12]]);
  assert.equal(progress(r), 'נסרקו מוצר אחד · 12 יח׳');
  // שדה כמות ריק — "סיום" מחכה לו
  click(r, { extraAdd: 'code_119' }); type(r, { extraGot: '1' }, '');
  assert.equal(r.run('finishReceiptLineCheck()'), false);
  assert.equal(progress(r), 'הקלד כמה הגיע מכל מוצר, או הסר אותו');
  click(r, { extraRemove: '1' });
  // "חזרה": המסך שמאחורי החלון — כמה נסרק, "המשך לסרוק", ואיך מסיימים
  r.events.get('receiptQuantityClose:click')();
  assert.equal(hidden(r), true);
  const html = r.node('app').innerHTML;
  assert.match(html, /data-nodoc-check/);
  assert.match(screen(r), /בדיקה בלי נייר נסרקו מוצר אחד · 12 יח׳ סורקים את מה שהגיע וסוגרים\. אם הנייר מגיע באמצע — מצלמים אותו בכפתור "צלם נייר מהנהג" למעלה, והבדיקה הופכת לשורה-שורה עם מה שכבר נסרק\. המשך לסרוק לסיום בלי נייר — "סיום" בחלון הסריקה, או הכפתור הכחול למטה\.$/);
  assert.doesNotMatch(html, /data-role="rc-scan"|data-role="rc-crates"|id="rcListEl"/, 'בלי מסך סריקה נפרד');
  assert.deepEqual(roles(r), ['rc-cancel', 'rc-nodoc-found', 'rc-nodoc-check']);
  r.click('rc-nodoc-check');
  assert.equal(hidden(r), false); assert.equal(progress(r), 'נסרקו מוצר אחד · 12 יח׳');
  // "סיום — שמור בלי נייר": הסיכום של קבלת סחורה בלי נייר, והקליטה נשמרת פתוחה — כמו קודם
  assert.equal(r.run('finishReceiptLineCheck()'), true);
  assert.equal(hidden(r), true);
  assert.deepEqual(json(r, '[pendingReceipt.status, pendingReceipt.noDoc, pendingReceipt.lines.length]'), ['open', true, 1]);
  await r.run('confirmReceipt()'); await settle();
  const saved = r.writes.filter(w => w.op === 'set' && w.path && w.path[w.path.length - 2] === 'receipts').map(w => w.data);
  assert.equal(saved.length, 1);
  assert.deepEqual([saved[0].noDoc, saved[0].status, saved[0].noteParts, saved[0].quantityCheck], [true, 'open', [], null]);
  assert.deepEqual(saved[0].items.map(l => [l.productId, l.qty]), [['code_101', 12]]);
  assert.equal(r.requests.length, 0, 'בלי קריאה בתשלום');
  // הכפתור הכחול שבתחתית — בלי נייר הוא שומר, כמו קודם
  const b = open();
  b.run(`currentView = 'receiving'; mainMode = 'receiving'; renderReceiving();`);
  b.click('rc-open-nodoc'); add(b, 'code_101', 3);
  b.events.get('receiptQuantityClose:click')();
  b.events.get('cartBtn:click')();
  assert.deepEqual(json(b, '[pendingReceipt.status, pendingReceipt.noDoc]'), ['open', true]);
});

test('8. בלי נייר, ומצלמים אותו באמצע: מה שנסרק נשאר, בזמן הקריאה "סיום" מחכה, והבדיקה הופכת לשורה-שורה כשתעודת המשלוח נכנסת', async () => {
  const r = open();
  r.run(`currentView = 'receiving'; mainMode = 'receiving'; renderReceiving(); globalThis.__cam = 0; paperOpenCamera = () => { __cam++; };`);
  r.click('rc-open-nodoc');
  add(r, 'code_101', 12); add(r, 'code_1231', 4); add(r, 'code_119', 2);
  // "צלם נייר מהנהג" בכרטיס המצב — המצלמה של הניירות (אותה אחת של כל האפליקציה); הספירה נשמרת
  click(r, { linePaper: 'photo' });
  assert.equal(r.run('__cam'), 1); assert.equal(hidden(r), true);
  assert.deepEqual(counted(r), [['code_101', 12], ['code_1231', 4], ['code_119', 2]]);
  // הנייר נקרא (במסך הניירות)
  const release = r.hold();
  r.run(`openPaperIntake({}); paperIntake.items = paperIntake.items.concat([{ captureId: 'cap0', hash: 'h0', page: { dataUrl: 'data:image/jpeg;base64,cGFwZXI0', baseDataUrl: 'data:image/jpeg;base64,cGFwZXI0', rotation: 0, orientationConfirmed: true }, status: 'photo', target: '', forDraftId: null }]);`);
  const run = r.run('paperIntakeRun()');
  await until(() => r.requests.length === 1);
  assert.equal(r.run('receiptNoDoc'), true); assert.equal(r.run('receiptLinePendingKind()'), 'reading', 'הבדיקה כבר מחכה לרשימה שלו');
  // חוזרים לקליטה בזמן הקריאה: המסך אומר שהנייר נקרא, והחלון — ש"סיום" מחכה; אפשר להמשיך לסרוק
  r.run(`setView('receiving')`);
  assert.match(screen(r), /בדיקה בלי נייר נסרקו 3 מוצרים · 18 יח׳ הנייר מהנהג נקרא עכשיו\. כשתעודת המשלוח תיכנס לקליטה, הבדיקה תהפוך לשורה-שורה עם מה שכבר נסרק — אפשר להמשיך לסרוק בינתיים\. המשך לסרוק$/);
  r.click('rc-nodoc-check');
  assert.equal(hidden(r), false); assert.equal(title(r), 'בדיקה שורה-שורה'); assert.equal(finishLabel(r), 'סיום — כשהנייר ייקרא');
  assert.match(rows(r), /^קורא את הניירות מהנהג|^קורא/);
  assert.equal(r.run('finishReceiptLineCheck()'), false);
  assert.equal(progress(r), 'הנייר עוד נקרא — אפשר להמשיך לסרוק. הרשימה תעלה כאן לבד, ואז אפשר לסיים.');
  assert.equal(r.run('pendingReceipt'), null, 'לא נסגרת בלי נייר כשהנייר כבר בדרך');
  // תעודת המשלוח נכנסת: הקליטה כבר אינה "בלי נייר", והרשימה עולה עם מה שנסרק — בלי שאלה
  release(); await run; await r.run('paperJoinChain');
  assert.equal(r.run('receiptNoDoc'), false); assert.equal(r.run('receiptCountingMode'), 'manual'); assert.equal(r.run('receiptPaperScanState'), 'ok');
  assert.deepEqual(state(r).nums, [BIG]);
  assert.ok(lineListArrives(r) >= 1);
  assert.equal(listUp(r), true); assert.equal(hidden(r), false); assert.equal(r.run('testConfirms.length'), 0);
  assert.deepEqual(marks(r), ['ok,qty:4,,,']);
  assert.deepEqual(review(r).extras.map(e => [e.productId, e.got]), [['code_119', '2']]);
  assert.equal(progress(r), 'התעודה בקליטה — 5 שורות · 2 כבר סומנו ממה שנסרק · מוצר אחד שאינו בתעודה');
  assert.deepEqual(readyBuzzes(r), [[60, 40, 60]]);
  // ממשיכים וסוגרים — קליטה רגילה, עם הנייר
  markRestOk(r);
  assert.equal(r.run('finishReceiptLineCheck()'), true);
  const saved = await saveAfterCheck(r);
  assert.ok(!saved.noDoc, 'כבר לא "בלי נייר"'); assert.equal(saved.paperDocs[0].number, BIG);
  assert.deepEqual(items(saved).find(x => x[0] === 'code_1231'), ['code_1231', 4, 6]);
  assert.deepEqual(items(saved).find(x => x[0] === 'code_119'), ['code_119', 2, 0], 'לא בתעודה — עודף');
  // נייר שנקרא ואינו תעודת משלוח (זיכוי) — הקליטה נשארת בלי נייר, והחלון חוזר ל"סיום — שמור בלי נייר"
  const c = open(credit());
  c.run(`currentView = 'receiving'; mainMode = 'receiving'; renderReceiving();`);
  c.click('rc-open-nodoc'); add(c, 'code_101', 3);
  await readPapers(c);
  c.run(`setView('receiving')`);
  assert.equal(c.run('receiptNoDoc'), true); assert.equal(c.run('receiptLinePendingKind()'), 'nodoc');
  c.click('rc-nodoc-check');
  assert.equal(title(c), 'בדיקה בלי נייר'); assert.equal(finishLabel(c), 'סיום — שמור בלי נייר');
  assert.deepEqual(counted(c), [['code_101', 3]]);
});

test('9. מארז החיוב שנסרק כשבתעודה היחידה הבודדת (ולהפך) — עובר לשורה שבתעודה כשהכמות מתחלקת; אחרת נשאר "נוסף"', async () => {
  const pack = `products.push({ id: 'pack101', name: 'אחיד פרוס — מארז 6', code: '9101', barcode: '7290000000060', price: 30 });
    const unit = products.find(p => p.id === 'code_101'); unit.billingPackId = 'pack101'; unit.billingPackSize = 6;`;
  // 2 מארזים של 6 = 12 בודדים, בדיוק כמו בתעודה
  const { r, arrive } = await scanningWhileRead();
  r.run(pack);
  add(r, 'pack101', 2);
  await arrive(); lineListArrives(r);
  assert.deepEqual(marks(r), ['ok,,,,']); assert.deepEqual(review(r).extras, []);
  assert.deepEqual(counted(r), [['code_101', 12]], 'הספירה עברה למוצר שבתעודה');
  // מארז אחד = 6 בודדים מתוך 12 — "אחרת" עם המספר
  const { r: h, arrive: arriveH } = await scanningWhileRead();
  h.run(pack);
  add(h, 'pack101', 1);
  await arriveH(); lineListArrives(h);
  assert.deepEqual(marks(h), ['qty:6,,,,']); assert.deepEqual(review(h).extras, []);
  // להפך: בתעודה המארז, נסרקו בודדים — 12 בודדים הם 2 מארזים; 7 בודדים אינם מתחלקים ונשארים "נוסף"
  const packPaper = () => { const p = delivery(BIG); p.scan.documents[0].rows[0] = { ...p.scan.documents[0].rows[0], itemCode: '9101', code: '9101', barcode: '7290000000060', description: 'אחיד פרוס — מארז 6', quantity: 2 }; Object.assign(p.scan.documents[0], { totalUnits: 20 }); return p; };
  for (const [units, expectMarks, expectExtras, expectList] of [[12, 'ok,,,,', [], [['pack101', 2]]], [7, ',,,,', [['code_101', '7']], [['code_101', 7]]]]) {
    const { r: u, arrive: arriveU } = await scanningWhileRead(packPaper());
    u.run(pack);
    add(u, 'code_101', units);
    await arriveU();
    assert.equal(u.run('receiptPaperScanState'), 'ok');
    lineListArrives(u);
    assert.equal(listUp(u), true);
    assert.equal(json(u, 'receiptQuantityReview.docs[0].lines[0].productId'), 'pack101', 'בתעודה המארז');
    assert.deepEqual(marks(u), [expectMarks], units + ' בודדים');
    assert.deepEqual(review(u).extras.map(e => [e.productId, e.got]), expectExtras, units + ' בודדים');
    assert.deepEqual(counted(u), expectList, units + ' בודדים');
  }
});

test('10. בדיקה שסומנו בה שורות אינה מוחלפת כשעוד נייר נקרא; בדיקה ממתינה שורדת רענון; לחם בתפזורת; קריאה בלבד', async () => {
  // (א) שורות כבר סומנו, ועוד נייר מהנהג נקרא — אין חלון ממתין שידרוס אותן; מחכים לו, כמו קודם
  const r = open();
  await receive(r, 1, 0, { count: false });
  r.run(`currentView = 'receiving'; mainMode = 'receiving'; renderReceiving(); startReceiptLineCheck();`);
  click(r, { lineMark: '0:0:ok' });
  r.run(`paperIntake.busy = true; paperIntake.items = paperIntake.items.concat([{ captureId: 'capX', hash: 'hX', status: 'reading', target: '', forDraftId: receiptDraftId }]);`);
  assert.equal(r.run('receiptLinePendingKind()'), 'reading'); assert.equal(r.run('receiptLinePendingAllowed()'), false);
  r.run('closeReceiptQuantityReview(); renderReceiving()');
  assert.doesNotMatch(r.node('app').innerHTML, /לסרוק בינתיים/, 'לא מוצע לסרוק בינתיים');
  const said = r.toasts.length;
  r.click('rc-quantity-lines');
  assert.match(r.toasts[r.toasts.length - 1], /עוד נייר מהנהג נקרא עכשיו — עוד רגע הוא ייכנס לבד, ואז אפשר לבחור/); assert.equal(r.toasts.length, said + 1);
  assert.equal(listUp(r), true); assert.deepEqual(marks(r), ['ok,,,,'], 'מה שסומן נשאר');
  assert.equal(r.run('openReceiptLinePending()'), false);
  // (ב) בדיקה ממתינה שורדת רענון של הדף: מה שנסרק חוזר, והרשימה עולה כשהתעודה כבר בקליטה
  const storage = new Map();
  const { r: a, arrive } = await scanningWhileRead(delivery(BIG), { storage });
  add(a, 'code_101', 7);
  assert.deepEqual([draft(a).countingMode, draft(a).quantityReview.pending, draft(a).quantityReview.extras.map(e => [e.productId, e.got])], ['manual', true, [['code_101', '7']]]);
  await arrive();
  const b = open(delivery(BIG), { storage: new Map(storage) });
  b.run(`currentView = 'receiving'; mainMode = 'receiving'; renderReceiving();`);
  assert.equal(b.run('receiptCountingMode'), 'manual'); assert.equal(b.run('receiptPaperScanState'), 'ok');
  assert.equal(pendingNow(b), true); assert.deepEqual(counted(b), [['code_101', 7]]);
  assert.equal(lineListArrives(b), 1);
  assert.equal(listUp(b), true); assert.equal(hidden(b), false);
  assert.deepEqual(marks(b), ['qty:7,,,,']);
  assert.equal(b.requests.length, 0, 'בלי קריאה נוספת');
  // (ג) לחם בתפזורת (אין עליו ברקוד) — כפתור לכל מוצר שעוד אינו ברשימה, בבדיקה ממתינה ובלי נייר
  const { r: c, arrive: arriveC } = await scanningWhileRead();
  c.run(`products.push({ id: 'crate1', name: 'לחם אחיד בתפזורת', code: '700', barcode: '', price: 4, quickCrate: true });`);
  c.run('renderReceiptQuantityReview()');
  assert.match(c.run(`$('receiptQuantityRows').innerHTML`), /data-line-crates[\s\S]*לחם בתפזורת — אין עליו ברקוד, מוסיפים מכאן[\s\S]*data-extra-add="crate1"[^>]*>\+ לחם אחיד בתפזורת<\/button>/);
  add(c, 'crate1', 8);
  assert.deepEqual(counted(c), [['crate1', 8]]);
  assert.doesNotMatch(c.run(`$('receiptQuantityRows').innerHTML`), /data-line-crates/, 'כבר ברשימה — אין כפתור');
  await arriveC();
  // (ד) טלפון שרק צופה בקליטה (קריאה בלבד): החלון לא נפתח, והרשימה לא עולה בו לבד
  const { r: v, arrive: arriveV } = await scanningWhileRead();
  v.run('canEditSharedReceipt = () => false; globalThis.__ro = 0; sharedReceiptReadOnlyNotice = () => { __ro++; }; closeReceiptQuantityReview();');
  assert.equal(v.run('openReceiptLinePending()'), false); assert.equal(v.run('__ro'), 1); assert.equal(hidden(v), true);
  await arriveV();
  lineListArrives(v);
  assert.equal(pendingNow(v), true); assert.equal(hidden(v), true); assert.deepEqual(readyBuzzes(v), []);
});

test('11. הכפתור הכחול שבתחתית ("בדוק וסיים") פותח את הבדיקה עד שהיא אושרה — לא השוואה של ספירה חלקית מול התעודה', async () => {
  const { r, arrive } = await scanningWhileRead();
  add(r, 'code_101', 9);
  r.events.get('receiptQuantityClose:click')();
  assert.equal(hidden(r), true);
  assert.ok(r.run(`mainMode === 'receiving' && currentView === 'receiving' && receiptList.length > 0`), 'יש ספירה — הכפתור הכחול מוצג (updateCart)');
  assert.equal(r.run(`$('cartLabel').textContent`), 'בדוק וסיים');
  // בזמן שהנייר נקרא — חלון הבדיקה (בלי הודעת שגיאה)
  let said = r.toasts.length;
  r.events.get('cartBtn:click')();
  assert.equal(hidden(r), false); assert.equal(pendingNow(r), true); assert.equal(r.toasts.length, said);
  await arrive(); lineListArrives(r);
  assert.equal(listUp(r), true); assert.deepEqual(marks(r), ['qty:9,,,,']);
  // הרשימה עלתה, ונשארו שורות — הכפתור חוזר לרשימה (מאותו מקום), לא למסך ההבדלים עם 4 שורות "חוסר"
  r.events.get('receiptQuantityClose:click')();
  r.events.get('cartBtn:click')();
  assert.equal(hidden(r), false); assert.equal(r.run('currentView'), 'receiving'); assert.equal(r.run('pendingReceipt'), null);
  assert.equal(r.run('testConfirms.length'), 0);
  assert.deepEqual(marks(r), ['qty:9,,,,']); assert.equal(finishLabel(r), 'סיום (נשארו 4)');
  // אחרי "סיום" הבדיקה אושרה — הכפתור הכחול הוא שוב הסיום הרגיל (חוזר לסיכום)
  markRestOk(r);
  assert.equal(r.run('finishReceiptLineCheck()'), true);
  if (r.run('currentView') === 'reconcile') r.run('aiApplyInvoiceResult()');
  assert.ok(r.run('!!pendingReceipt'));
  r.run(`pendingReceipt = null; hideReceiptSummary(); setView('receiving');`);
  assert.ok(r.run('!!receiptQuantityCheckAudit()'), 'הבדיקה אושרה');
  r.events.get('cartBtn:click')();
  assert.equal(hidden(r), true, 'לא פותח שוב את הרשימה');
  assert.ok(r.run(`currentView === 'reconcile' || !!pendingReceipt`), 'ממשיך לסיום');
  // קליטה שנספרת במסך הסריקה (מספרים שהוקלדו ביד) — הכפתור כמו קודם
  const t = open();
  t.run(`currentView = 'receiving'; mainMode = 'receiving'; receiptOpened = true; receiptEntryMode = 'manual'; receiptAnchorSource = 'manual';
    receiptNotes = [{ amount: 0, units: 3, lines: 1, kind: 'charge' }]; recomputeNoteTotal();
    receiptList = [{ productId: 'code_101', name: 'אחיד פרוס ברמן', barcode: '497112', qty: 3 }]; saveReceiptDraft(); renderReceiving();`);
  t.events.get('cartBtn:click')();
  assert.equal(hidden(t), true); assert.equal(t.run('receiptQuantityReview'), null);
  assert.ok(t.run(`!!pendingReceipt || currentView === 'reconcile' || testConfirms.length > 0`), 'הסיום הרגיל');
});

test('12. מה שאינו בדיקה כזאת: צירוף נייר לקליטה שמורה — כפתור אחד, בלי חלון; כרטיס הצילום "עמוד אחרי עמוד" — כפתור אחד', async () => {
  // צירוף נייר לקליטה שנשמרה בלי תעודה: הספירה כבר נעשתה, והבדיקה רצה מולה
  const bare = { id: 'rc_bare', date: TODAY, noDoc: true, noteParts: [], items: [{ productId: 'code_101', name: 'אחיד', qty: 12 }], timestamp: 1 };
  const a = open(delivery(BIG), { receipts: [bare] });
  a.run(`reopenReceiptForDoc('rc_bare')`);
  assert.equal(a.run('receiptLinePendingKind()'), null);
  assert.equal(a.run('openReceiptLinePending()'), false);
  a.run(`rcMultiPhotoWanted = true; renderReceiving();`);
  let html = a.node('app').innerHTML;
  assert.match(html, /data-role="rc-open-photo"[^>]*>(<i[^>]*><\/i>)? ?קרא את התעודה — הבדיקה תרוץ מול הספירה<\/button>/);
  assert.doesNotMatch(html, /rc-open-photo-quantity|התחל בדיקה שורה-שורה/);
  await readPapers(a);
  assert.equal(a.run('receiptPaperScanState'), 'ok'); assert.equal(a.run('receiptCountingMode'), 'scan', 'הספירה נשארת ספירה');
  assert.equal(a.run('receiptQuantityReview'), null); assert.equal(a.run('receiptUsesManualQuantities()'), false);
  a.run(`setView('receiving')`);
  assert.equal(lineListArrives(a), 0);
  // כרטיס הצילום "עמוד אחרי עמוד" (תעודה ארוכה): כפתור אחד — "התחל בדיקה שורה-שורה"; החלון נפתח מיד, והרשימה עולה כשהתעודה נקראה
  const p = open(delivery(BIG));
  p.run(`currentView = 'receiving'; mainMode = 'receiving'; receiptList = []; receiptOpened = false; bermanSeedPhotoFirstScan(1);
    aiScanDocuments[0].pages = [{ dataUrl: 'data:image/jpeg;base64,Zml4dHVyZQ==', orientationConfirmed: true }]; renderReceiving();`);
  html = p.node('app').innerHTML;
  assert.match(html, /data-role="rc-open-photo"[^>]*>(<i[^>]*><\/i>)? ?התחל בדיקה שורה-שורה<\/button>/);
  assert.doesNotMatch(html, /rc-open-photo-quantity/);
  const release = p.hold();
  p.click('rc-open-photo'); await settle();
  assert.equal(p.run('receiptPaperScanState'), 'running'); assert.equal(p.run('receiptCountingMode'), 'manual');
  assert.equal(pendingNow(p), true); assert.equal(hidden(p), false); assert.equal(p.run('globalThis.__scanner'), 0);
  add(p, 'code_238', 4);
  release(); await settle();
  assert.equal(p.run('receiptPaperScanState'), 'ok');
  assert.ok(lineListArrives(p) >= 1);
  assert.equal(listUp(p), true); assert.deepEqual(marks(p), [',,ok,,']);
});

test('13. הגרסה עלתה ל-171, כולל ההערה ב-service worker; "סריקת מוצרים" אינה נבחרת עוד בשום מסך', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /const APP_VERSION = '171'/);
  assert.match(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), /גרסת אפליקציה 171/);
  assert.doesNotMatch(html, /data-role="rc-count-by-scan"|role === 'rc-count-by-scan'|מעבר לקליטה בסריקת מוצרים<|data-role="rc-open-photo-quantity"/);
  assert.doesNotMatch(html, /[>']\s*(התחל לספור עכשיו|קרא את התעודה והתחל לסרוק)/, 'הכפתורים של "קודם סופרים" ירדו');
  assert.match(html, /התחל לסרוק עכשיו — הרשימה תעלה כשתעודת המשלוח תיקרא/);
});
