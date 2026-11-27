// v176 — "אשר וקלוט" עם ניסיון שמירה תלוי: הלחיצה האמיתית.
// 26–27.11.2026: בתנובה (165) שמירה שלא קיבלה אישור נעלה את הקליטה, ו"אשר וקלוט" נבלע בשומר הלחיצות — "עכשיו אני חסום לא יודע מה
// קורה פה". בבדיקה מול ברמן נמצא אותו דבר: v157 לימד את confirmReceipt לבדוק בעצמו ניסיון תלוי, אבל guardSharedReceiptEvent עוצר
// את הלחיצה על "אשר וקלוט" לפני שהיא מגיעה אליו — עם "השמירה לא אושרה עדיין. לחץ על בדיקה וניסיון חוזר בראש מסך הקליטה", בדיוק
// ההודעה ש-157 בא להוריד. הבדיקות של 157 קראו ל-confirmReceipt ישירות, ולכן עברו.
// כאן כל לחיצה עוברת קודם בשומר הלחיצות (כמו בטלפון: שומר → המאזין של הכפתור → השמירה הנגררת של הטיוטה).
// כל הנתונים מומצאים (one-button-helpers). הרצה: TZ=Asia/Jerusalem node --test tests/confirm-tap-v176.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { app, delivery, receive } from './one-button-helpers.mjs';

const settle = async (n = 40) => { for (let i = 0; i < n; i++) await new Promise(res => setImmediate(res)); };
const json = (r, e) => JSON.parse(r.run('JSON.stringify(' + e + ')'));
const strip = s => String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const FINAL = 'bm_receiving_final_v1';
const OLD = /לחץ על בדיקה וניסיון חוזר|השמירה לא אושרה עדיין/;
const LOCKED = 'הקליטה נעולה עד שהשמירה תאושר. לחץ "בדוק ונסה לשמור שוב" בראש מסך הקליטה.';
const DONE = { summaryOpen: false, modalHidden: true, view: 'receiptsHistory', saved: [['ok', 30, 5]], draftOpened: false, pending: false };

// קליטה עם תעודה אחת, בדיקה שורה-שורה שכולה "הגיע", עד חלון הסיכום (כמו ב-receiving-save-fence-v156)
async function toSummary(storage = new Map()) {
  const r = app(delivery('244804072'), { storage });
  await receive(r);
  r.run(`currentView = 'receiving'; mainMode = 'receiving'; startReceiptLineCheck();`);
  json(r, 'receiptQuantityReview').docs.forEach((d, di) => d.lines.forEach((l, li) =>
    r.run(`receiptLineCheckClick({ target: { closest: () => ({ dataset: ${JSON.stringify({ lineMark: di + ':' + li + ':ok' })} }) } })`)));
  r.run('finishReceiptLineCheck()'); await settle();
  if (r.run('currentView') === 'reconcile') r.run('aiApplyInvoiceResult()');
  assert.ok(r.run('!!pendingReceipt'), 'הסיכום פתוח');
  return r;
}
const after = r => ({ summaryOpen: r.run('!!pendingReceipt'), modalHidden: r.run(`$('receiptSummaryModal').classList.contains('hidden')`), view: r.run('currentView'),
  saved: json(r, 'receipts.filter(x => x.docDate).map(x => [x.status, x.units, x.count])'), draftOpened: json(r, 'readLocalJson(RECEIPT_DRAFT_KEY, {}).opened'),
  pending: r.run('localReceivingPending()') });
const cloudReceipts = r => r.finalCloud.paths('/receipts/').length;
const banner = r => { r.run('renderSharedReceivingBanner()'); return strip(r.node('sharedReceivingBanner').innerHTML); };

// אלמנט כמו בדף: כפתור עם id או data-role, בתוך חלון או בתוך #app
function control({ id = '', role = '', inside }) {
  const el = { id, dataset: role ? { role } : {} }, box = { id: inside.slice(1), dataset: {} };
  el.closest = selector => {
    const parts = selector.split(',').map(s => s.trim());
    if (parts.some(p => p === 'button' || (p === '[id]' && id) || (p === '[data-role]' && role) || (id && p === '#' + id))) return el;
    return parts.some(p => p === inside || p === '[id]') ? box : null;
  };
  return el;
}
// לחיצה כמו בטלפון. מחזיר 'blocked' כשהשומר עצר אותה. start: true — לא מחכה לסיום (לבדיקות של "בזמן שהשמירה רצה"):
// מחזיר { work } — עטוף, כי פונקציה אסינכרונית שמחזירה Promise מחכה לו.
async function tap(r, what, { start = false } = {}) {
  let stopped = false;
  r.context.__tap = { type: 'click', target: control(what), preventDefault() {}, stopImmediatePropagation() { stopped = true; } };
  r.run('guardSharedReceiptEvent(__tap)');
  if (stopped) return 'blocked';
  const handler = what.id && r.events.get(what.id + ':click');
  const work = handler ? handler() : null;
  if (r.run('sharedReceiptEventTouchesWorkflow(__tap.target)')) r.run('saveReceiptDraft()'); // השמירה הנגררת שאחרי כל לחיצה בקליטה
  if (start) return { work };
  await work; await settle();
  return 'ran';
}
const OK_BUTTON = { id: 'rs_ok', inside: '#receiptSummaryModal' };
const bannerRetry = r => r.events.get('sharedReceivingBanner:click')({ target: { closest: s => s === '[data-shared-receiving]' ? { dataset: { sharedReceiving: 'local-retry' } } : null } });

// "אשר וקלוט" והענן לא עונה: הניסיון נשאר תלוי, חלון הסיכום פתוח, הקליטה נעולה.
async function lostSave(r) {
  r.finalCloud.reject = 'unavailable';
  assert.equal(await tap(r, OK_BUTTON), 'ran');
  r.finalCloud.reject = null;
  assert.equal(r.run('localReceivingPending()'), true, 'הניסיון תלוי');
  assert.equal(r.run('canEditSharedReceipt()'), false, 'הקליטה נעולה');
  assert.equal(r.run('!!pendingReceipt'), true, 'חלון הסיכום נשאר פתוח');
  assert.equal(cloudReceipts(r), 0);
}

test('1. שמירה בלי תשובה, ושוב "אשר וקלוט": הלחיצה מגיעה, בודקת, שומרת פעם אחת והחלון נסגר (עד 175 נבלעה: "לחץ על בדיקה וניסיון חוזר")', async () => {
  const r = await toSummary();
  await lostSave(r);
  r.toasts.length = 0;
  assert.equal(await tap(r, OK_BUTTON), 'ran', 'שומר הלחיצות מעביר את "אשר וקלוט"');
  assert.deepEqual(after(r), DONE);
  assert.equal(cloudReceipts(r), 1, 'נשמרה פעם אחת');
  assert.match(r.toasts.join(' | '), /התעודה נקלטה ✓/);
  assert.doesNotMatch(r.toasts.join(' | '), OLD);
});

test('2. ניסיון תקוע מלפני, ובענן אין כלום (המקרה של 3.11): לחיצה אחת אמיתית מורידה אותו ושומרת את מה שיש עכשיו', async () => {
  const storage = new Map();
  const r = await toSummary(storage);
  const draftId = r.run('receiptDraftId');
  storage.set(FINAL, JSON.stringify({ [draftId]: { sessionId: draftId, recordId: draftId, data: { schemaVersion: 2, items: [], timestamp: 1 }, expected: null, prices: [], extras: [], claims: [],
    fingerprint: 'stale-fingerprint-from-before', token: 'finish_stale', deviceName: '', createdAt: 1 } }));
  r.toasts.length = 0;
  assert.equal(await tap(r, OK_BUTTON), 'ran');
  assert.deepEqual(after(r), DONE);
  assert.notEqual(json(r, 'receipts.find(x => x.docDate)').localFinal.token, 'finish_stale', 'נשמר הניסיון החדש, לא הישן');
  assert.match(r.toasts.join(' | '), /הניסיון הקודם לא הגיע לענן/);
  assert.match(r.toasts.join(' | '), /התעודה נקלטה ✓/);
  assert.doesNotMatch(r.toasts.join(' | '), OLD);
});

test('3. בזמן שהבדיקה רצה: לחיצה נוספת על "אשר וקלוט" נעצרת ("שומר את התעודה — רגע."), והתעודה נשמרת פעם אחת', async () => {
  const r = await toSummary();
  await lostSave(r);
  let release; r.finalCloud.commitGate = new Promise(res => { release = res; });
  const { work } = await tap(r, OK_BUTTON, { start: true });
  await settle();
  assert.equal(r.run('sharedReceiptFinalizing'), true, 'הבדיקה רצה');
  r.toasts.length = 0;
  assert.equal(await tap(r, OK_BUTTON), 'blocked', 'לחיצה כפולה לא מתחילה שמירה שנייה');
  assert.equal(r.toasts.at(-1), 'שומר את התעודה — רגע.');
  release(); r.finalCloud.commitGate = null;
  await work; await settle();
  assert.deepEqual(after(r), DONE);
  assert.equal(cloudReceipts(r), 1);
});

test('4. כפתור אחר בזמן הנעילה נעצר — עם השם של הכפתור כמו שהוא כתוב בפס; "חזרה" עובר', async () => {
  const r = await toSummary();
  await lostSave(r);
  r.toasts.length = 0;
  assert.equal(await tap(r, { role: 'rc-quantity-lines', inside: '#app' }), 'blocked');
  assert.equal(r.toasts.at(-1), LOCKED);
  assert.equal(await tap(r, { id: 'rs_cancel', inside: '#receiptSummaryModal' }), 'ran');
  assert.equal(r.run('localReceivingPending()'), true);
  assert.equal(cloudReceipts(r), 0);
});

test('5. הפס שבראש מסך הקליטה: מה קרה, שלא אבד כלום ומה לוחצים; "בודק ושומר…" בזמן הבדיקה; "בדוק ונסה לשמור שוב" שומר', async () => {
  const r = await toSummary();
  await lostSave(r);
  let text = banner(r);
  assert.ok(text.startsWith('השמירה נשלחה, ועוד לא הגיע אישור מהענן. שום דבר לא אבד — הקליטה שמורה בטלפון הזה. עד שהשמירה תאושר, הקליטה נעולה. בדוק ונסה לשמור שוב לא עובר? סגור את האפליקציה, פתח אותה שוב ולחץ כאן שוב.'), text);
  assert.doesNotMatch(text, OLD);
  let release; r.finalCloud.commitGate = new Promise(res => { release = res; });
  const work = bannerRetry(r);
  await settle();
  assert.equal(r.run('sharedReceiptFinalizing'), true);
  text = strip(r.node('sharedReceivingBanner').innerHTML);
  assert.ok(text.startsWith('בודק ושומר… זה לוקח פחות מדקה. שום דבר לא אבד — הקליטה שמורה בטלפון הזה.'), text);
  assert.ok(!r.node('sharedReceivingBanner').innerHTML.includes('data-shared-receiving="local-retry"'), 'בזמן הבדיקה — בלי כפתור');
  release(); r.finalCloud.commitGate = null;
  await work; await settle();
  assert.deepEqual(after(r), DONE);
  assert.equal(cloudReceipts(r), 1);
});

test('6. עדיין אין חיבור: "אשר וקלוט" משאיר את הניסיון תלוי, בלי לשמור; כשהחיבור חוזר — לחיצה אחת שומרת', async () => {
  const r = await toSummary();
  await lostSave(r);
  r.finalCloud.reject = 'unavailable';
  r.toasts.length = 0;
  assert.equal(await tap(r, OK_BUTTON), 'ran');
  assert.equal(r.run('localReceivingPending()'), true);
  assert.equal(r.run('!!pendingReceipt'), true);
  assert.equal(cloudReceipts(r), 0);
  assert.match(r.toasts.join(' | '), /השמירה לא אושרה\. הקליטה נשמרה בטלפון\./);
  assert.ok(banner(r).includes('בדוק ונסה לשמור שוב'), 'הפס חזר עם הכפתור');
  r.finalCloud.reject = null;
  assert.equal(await tap(r, OK_BUTTON), 'ran');
  assert.deepEqual(after(r), DONE);
  assert.equal(cloudReceipts(r), 1);
});

test('7. בלי ניסיון תלוי — כמו תמיד: "אשר וקלוט" שומר ונסגר; ובזמן השמירה הראשונה לחיצה נוספת נעצרת', async () => {
  const r = await toSummary();
  let release; r.finalCloud.commitGate = new Promise(res => { release = res; });
  const { work } = await tap(r, OK_BUTTON, { start: true });
  await settle();
  assert.equal(r.run('sharedReceiptFinalizing'), true);
  assert.equal(await tap(r, OK_BUTTON), 'blocked');
  release(); r.finalCloud.commitGate = null;
  await work; await settle();
  assert.deepEqual(after(r), DONE);
  assert.equal(cloudReceipts(r), 1);
});

test('8. סגירה ופתיחה של האפליקציה עם ניסיון תלוי (מה שהפס מציע כשזה "לא עובר"): הקליטה חוזרת, הפס מופיע, ו"בדוק ונסה לשמור שוב" שומר', async () => {
  const storage = new Map();
  const a = await toSummary(storage);
  await lostSave(a);
  // אותו טלפון, אחרי סגירה ופתיחה: אותו זיכרון, דף חדש
  const b = app(delivery('244804072'), { storage });
  await settle();
  b.run(`currentView = 'receiving'; mainMode = 'receiving';`);
  assert.equal(b.run('localReceivingPending()'), true, 'הניסיון התלוי נשאר אחרי הפתיחה');
  assert.equal(b.run('canEditSharedReceipt()'), false);
  assert.ok(banner(b).startsWith('השמירה נשלחה, ועוד לא הגיע אישור מהענן.'), banner(b));
  b.toasts.length = 0;
  await bannerRetry(b); await settle();
  assert.equal(b.run('localReceivingPending()'), false);
  assert.equal(b.run('currentView'), 'receiptsHistory');
  assert.equal(cloudReceipts(b), 1, 'נשמרה פעם אחת');
  assert.match(b.toasts.join(' | '), /התעודה נקלטה ✓/);
});

test('9. הגרסה 176 ומעלה, כולל ההערה ב-service worker', () => {
  const v = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').match(/const APP_VERSION = '(\d+)'/)[1];
  assert.ok(Number(v) >= 176, v);
  assert.match(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), new RegExp('גרסת אפליקציה ' + v));
});
