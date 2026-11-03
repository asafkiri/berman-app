// v156 — "אשר וקלוט" לא סוגר את התעודה (3.11.2026).
// בעל החנות: "לא משנה כמה אני לוחץ, התעודה לא נסגרת". הקליטה נשמרה בענן (סטטוס ok, 77 יח׳, 15 שורות), אבל חלון
// "סיכום תעודה" נשאר פתוח, הטיוטה נשארה, וכל לחיצה נוספת אמרה "השמירה לא אושרה עדיין".
// המנגנון: אחרי שהענן אישר, finishSharedReceipt רשם את האישור בטלפון (ackedAt על הנייר; וכשאין מקום בטלפון —
// paperLocalSave מוחק את הסריקה של נייר שאושר) ורק אז בדק אם "הספירה השתנתה בזמן השמירה" — והרישום עצמו שינה את
// טביעת הקליטה. מעכשיו הבדיקה רצה מיד אחרי האישור, לפני הרישום.
// ועוד: ניסיון שמירה תקוע מהטיוטה הזאת (טביעה אחרת) כשבענן אין כלום — מוחלף בשמירה החדשה, לא חוסם אותה.
// כל הנתונים מומצאים (one-button-helpers). הרצה: TZ=Asia/Jerusalem node --test tests/receiving-save-fence-v156.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { app, delivery, receive } from './one-button-helpers.mjs';

const settle = async () => { for (let i = 0; i < 30; i++) await new Promise(res => setImmediate(res)); };
const json = (r, e) => JSON.parse(r.run('JSON.stringify(' + e + ')'));
const FINAL = 'bm_receiving_final_v1';
// localStorage "מלא": הכתיבה של תוצאות הניירות נכשלת כשמסמנים נייר כמאושר (ackedAt) — פעם אחת או תמיד
class QuotaMap extends Map {
  constructor(mode) { super(); this.mode = mode; this.throws = 0; }
  set(k, v) {
    if (this.mode && k === 'bm_paper_results_v1' && String(v).includes('"ackedAt"') && (this.mode === 'always' || this.throws === 0)) { this.throws++; throw new Error('QuotaExceededError'); }
    return super.set(k, v);
  }
}
// קליטה עם תעודה אחת, בדיקה שורה-שורה שכולה "הגיע", עד חלון הסיכום
async function toSummary(storage) {
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
const after = (r, storage) => ({ summaryOpen: r.run('!!pendingReceipt'), modalHidden: r.run(`$('receiptSummaryModal').classList.contains('hidden')`), view: r.run('currentView'),
  saved: json(r, 'receipts.filter(x => x.docDate).map(x => [x.status, x.units, x.count])'), draftOpened: json(r, 'readLocalJson(RECEIPT_DRAFT_KEY, {}).opened'),
  pending: r.run('localReceivingPending()'), throws: storage ? storage.throws : 0 });

test('בלי תקלה — כמו תמיד: הסיכום נסגר, ההיסטוריה, הטיוטה ריקה, בלי ניסיון תלוי', async () => {
  const storage = new QuotaMap(null);
  const r = await toSummary(storage);
  r.toasts.length = 0;
  await r.run('confirmReceipt()'); await settle();
  assert.deepEqual(after(r, storage), { summaryOpen: false, modalHidden: true, view: 'receiptsHistory', saved: [['ok', 30, 5]], draftOpened: false, pending: false, throws: 0 });
  assert.match(r.toasts.join(' | '), /התעודה נקלטה ✓/);
});

for (const mode of ['once', 'always']) test('אין מקום בטלפון בזמן רישום האישור (' + mode + ') — התעודה נשמרת פעם אחת, הסיכום נסגר והטיוטה ריקה (עד v155: נשאר פתוח לנצח)', async () => {
  const storage = new QuotaMap(mode);
  const r = await toSummary(storage);
  r.toasts.length = 0;
  await r.run('confirmReceipt()'); await settle();
  const a = after(r, storage);
  assert.ok(a.throws >= 1, 'הכתיבה אכן נכשלה');
  assert.deepEqual({ ...a, throws: 0 }, { summaryOpen: false, modalHidden: true, view: 'receiptsHistory', saved: [['ok', 30, 5]], draftOpened: false, pending: false, throws: 0 });
  assert.match(r.toasts.join(' | '), /התעודה נקלטה ✓/);
  assert.doesNotMatch(r.toasts.join(' | '), /שינויים מאוחרים|לא אושרה/);
  // v155 (לשם השוואה): הסריקה של הנייר שאושר נמחקה מהעותק המקומי — זה מה ששינה את הטביעה
  const local = Object.values(json(r, 'paperLocalResults()'));
  assert.equal(local.length, 1); assert.equal(local[0].outcome, 'receipt-finalized'); assert.equal(local[0].scan, undefined, 'הסריקה ירדה כשאין מקום');
});

// ניסיון שמירה תקוע מהטיוטה הזאת (כמו שנשאר בטלפון אחרי התקלה של v155), עם טביעה שכבר לא תואמת
const staleAttempt = (draftId, data) => ({ sessionId: draftId, recordId: draftId, data: data || { schemaVersion: 2, items: [], timestamp: 1 }, expected: null, prices: [], extras: [], claims: [],
  fingerprint: 'stale-fingerprint-from-before', token: 'finish_stale', deviceName: '', createdAt: 1 });
const cloudPath = (r, draftId) => ['artifacts', r.run('appId'), 'public', 'data', 'receipts', draftId].join('/');

test('ניסיון תקוע ובענן אין כלום: "אשר וקלוט" חסום; "בדוק ונסה לשמור שוב" משחרר את הקליטה, ואז השמירה נסגרת (עד v155: נעול לנצח)', async () => {
  const storage = new QuotaMap(null);
  const r = await toSummary(storage);
  const draftId = r.run('receiptDraftId');
  storage.set(FINAL, JSON.stringify({ [draftId]: staleAttempt(draftId) }));
  assert.equal(r.run('localReceivingPending()'), true);
  // כמו בטלפון: הלחיצה השנייה על "אשר וקלוט" — חסומה
  r.toasts.length = 0;
  await r.run('confirmReceipt()'); await settle();
  assert.equal(r.run('!!pendingReceipt'), true);
  assert.match(r.toasts.join(' | '), /השמירה לא אושרה עדיין\. לחץ על בדיקה וניסיון חוזר/);
  assert.deepEqual(json(r, 'receipts.filter(x => x.docDate)'), [], 'לא נשמר');
  // "בדוק ונסה לשמור שוב": השרת ענה שאין שם כלום — הניסיון הישן יורד, לא נשלח
  r.toasts.length = 0;
  await r.run('localReceivingRetry()'); await settle();
  assert.equal(r.run('localReceivingPending()'), false, 'הניסיון התקוע ירד');
  assert.deepEqual(json(r, 'receipts.filter(x => x.docDate)'), [], 'הישן לא נשלח');
  assert.match(r.toasts.join(' | '), /הניסיון הקודם לא הגיע לענן.*הקליטה פתוחה שוב/);
  assert.equal(r.run('!!pendingReceipt'), true, 'הסיכום עדיין פתוח — לוחצים שוב');
  // ועכשיו "אשר וקלוט" שומר את מה שיש עכשיו, ונסגר
  r.toasts.length = 0;
  await r.run('confirmReceipt()'); await settle();
  assert.deepEqual(after(r, storage), { summaryOpen: false, modalHidden: true, view: 'receiptsHistory', saved: [['ok', 30, 5]], draftOpened: false, pending: false, throws: 0 });
  const saved = json(r, 'receipts.find(x => x.docDate)');
  assert.notEqual(saved.localFinal.token, 'finish_stale', 'נשמר הניסיון החדש, לא הישן');
  assert.match(r.toasts.join(' | '), /התעודה נקלטה ✓/);
});

test('ניסיון תקוע שהענן כבר שמר בדיוק (saved-late): לא נשמר שוב ולא נדרס; הניסיון יורד והטיוטה נשארת לבדיקה', async () => {
  const storage = new QuotaMap(null);
  const r = await toSummary(storage);
  const draftId = r.run('receiptDraftId');
  const data = { schemaVersion: 2, items: [{ productId: 'code_101', qty: 1 }], timestamp: 1, docDate: '2026-11-03', date: '2026-11-03' };
  storage.set(FINAL, JSON.stringify({ [draftId]: staleAttempt(draftId, data) }));
  r.finalCloud.put(cloudPath(r, draftId), { ...data, localFinal: { token: 'finish_stale', sessionId: draftId } });
  r.toasts.length = 0;
  await r.run('localReceivingRetry()'); await settle();
  assert.match(r.toasts.join(' | '), /התעודה כבר נשמרה\. השינויים המאוחרים נשארו בטלפון לבדיקה/);
  assert.equal(r.run('localReceivingPending()'), false, 'אין מה לנסות שוב — הניסיון יורד');
  assert.equal(r.run('!!pendingReceipt'), true, 'הטיוטה נשארת לבדיקה');
  assert.equal(r.finalCloud.get(cloudPath(r, draftId)).localFinal.token, 'finish_stale', 'לא נדרס');
  assert.equal(json(r, 'receipts.filter(x => x.docDate).length'), 1, 'מה שבענן — ברשימה (v147)');
});

test('ניסיון תקוע כשהשרת לא ענה (בלי רשת) — נשאר תלוי, כמו קודם', async () => {
  const storage = new QuotaMap(null);
  const r = await toSummary(storage);
  const draftId = r.run('receiptDraftId');
  storage.set(FINAL, JSON.stringify({ [draftId]: staleAttempt(draftId) }));
  r.context.navigator.onLine = false;
  r.toasts.length = 0;
  await r.run('localReceivingRetry()'); await settle();
  assert.equal(r.run('localReceivingPending()'), true, 'בלי תשובה מהשרת — לא מוותרים על הניסיון');
  assert.equal(JSON.parse(storage.get(FINAL))[draftId].token, 'finish_stale');
  assert.deepEqual(json(r, 'receipts.filter(x => x.docDate)'), []);
  assert.match(r.toasts.join(' | '), /השמירה לא אושרה/);
});
