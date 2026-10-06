// v135 — "המשך בטלפון הזה בלבד": כשהסנכרון בין טלפונים לא עולה או נכשל, הקליטה לא ננעלת. עד v134 קליטה בלי
// סנכרון הייתה במצב צפייה בלבד, ו"אשר וקלוט" נכשל שוב ושוב ("התעודה לא נסגרה…") — אסף, 6.10.2026: "תמיד שאני בא
// לקלוט אין סנכרון".
// מה שנבדק:
// - הסנכרון נכשל (כאן: מנוע הסנכרון לא נטען) — הקליטה במצב צפייה; בשורה העליונה הסיבה האמיתית ו"המשך בטלפון הזה בלבד".
// - אחרי אישור: אפשר לערוך, ו"לא הגיע כלום" / "אשר וקלוט" שומרים את התעודה ישר לענן — במזהה של הטיוטה (שמירה חוזרת
//   דורסת אותה תעודה), בלי לגעת בסנכרון. הבחירה נשמרת לטלפון (גם אחרי פתיחה מחדש), והשורה העליונה אומרת זאת.
// - "הפעל סנכרון בין טלפונים" — חוזרים לסנכרון.
// - כשהסנכרון רק נטען — "המשך בטלפון הזה בלבד" לא מוצע בשניות הראשונות.
// - שמירה לענן שנכשלה בטלפון אחד — הטיוטה לא נמחקת.
// הרצה: node --test tests/solo-receiving.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, fixture } from './receipt-scan-harness.mjs';

const json = (r, expr) => JSON.parse(r.run('JSON.stringify(' + expr + ')'));
const settle = async () => { for (let i = 0; i < 40; i++) await new Promise(res => setImmediate(res)); };
const bannerClick = (r, action) => r.events.get('sharedReceivingBanner:click')({ target: { closest: sel => sel === '[data-shared-receiving]' ? { dataset: { sharedReceiving: action } } : null } });
// טלפון שהסנכרון שלו נכשל: המנוע לא נטען (כמו "shared_receiving_script_missing")
function brokenSync(storage = new Map()) {
  const r = runtime({ data: fixture(), storage, sharedReceiving: true, loadSharedEngine: false });
  r.run(`showConfirm = (t, m, l, cb) => { globalThis.__c = { t, m, l, cb }; }; currentView = 'receiving'; mainMode = 'receiving';
    sharedReceiptHooksReady = true; startSharedReceiving();`);
  return r;
}
const saves = r => json(r, `testWrites.filter(w => w.op === 'set' && w.path && w.path[w.path.length - 2] === 'receipts')`);

test('הסנכרון נכשל: הסיבה ו"המשך בטלפון הזה בלבד"; אחרי אישור — עורכים ושומרים ישר לענן, והבחירה נשמרת לטלפון', async () => {
  const storage = new Map();
  const r = brokenSync(storage);
  assert.equal(r.run('canEditSharedReceipt()'), false, 'צפייה בלבד — כמו אצל אסף');
  r.run('renderSharedReceivingBanner()');
  let banner = r.node('sharedReceivingBanner').innerHTML;
  assert.match(banner, /הקליטה עדיין לא סונכרנה/);
  assert.match(banner, /shared_receiving_script_missing/, 'הסיבה האמיתית');
  assert.match(banner, /data-shared-receiving="off"[^>]*>המשך בטלפון הזה בלבד/);
  bannerClick(r, 'off');
  assert.equal(r.run('__c.t'), 'להמשיך בטלפון הזה בלבד?');
  assert.equal(r.run('canEditSharedReceipt()'), false, 'לפני האישור — כלום');
  r.run('__c.cb()');
  assert.equal(r.run('canEditSharedReceipt()'), true, 'אפשר לערוך');
  assert.equal(storage.get('bm_shared_receiving_off'), '1', 'נשמר לטלפון');
  r.run('renderSharedReceivingBanner()');
  banner = r.node('sharedReceivingBanner').innerHTML;
  // v136: בטלפון אחד השורה העליונה אומרת רק מה קורה עם הגיבוי לענן (וקליטה מטלפון אחר, אם יש)
  assert.doesNotMatch(banner, /הקליטה עדיין לא סונכרנה|data-shared-receiving="off"/);
  // קליטה עד הסוף: סריקה (הנייר), ספירה תואמת, סיכום, שמירה
  await r.scan();
  r.run('receiptDupConfirmed = true; finishReceipt()');
  if (!r.run('!!pendingReceipt')) r.click('ai-close-receipt');
  assert.ok(r.run('!!pendingReceipt'), 'סיכום');
  const draftId = r.run('receiptDraftId');
  await r.run('confirmReceipt()'); await settle();
  const saved = saves(r);
  assert.equal(saved.length, 1, 'נשמרה');
  assert.equal(saved[0].path[saved[0].path.length - 1], draftId, 'במזהה של הטיוטה');
  assert.equal(saved[0].operationId, draftId);
  assert.equal(r.run('receivingDraftEmpty()'), true, 'הקליטה נסגרה');
  assert.match(r.toasts[r.toasts.length - 1], /התעודה נקלטה ✓/);
  // פתיחה מחדש — עדיין טלפון אחד
  const again = brokenSync(storage);
  assert.equal(again.run('sharedReceivingOff'), true);
  assert.equal(again.run('canEditSharedReceipt()'), true);
});

test('"הפעל סנכרון בין טלפונים" — חוזרים לסנכרון (וכשהוא שוב לא עולה — שוב מוצע טלפון אחד)', async () => {
  const storage = new Map([['bm_shared_receiving_off', '1']]);
  const r = brokenSync(storage);
  assert.equal(r.run('canEditSharedReceipt()'), true);
  await bannerClick(r, 'on'); await settle();
  assert.equal(r.run('sharedReceivingOff'), false);
  assert.equal(storage.has('bm_shared_receiving_off'), false);
  assert.equal(r.run('canEditSharedReceipt()'), false, 'הסנכרון — ועדיין לא עלה');
  r.run('renderSharedReceivingBanner()');
  assert.match(r.node('sharedReceivingBanner').innerHTML, /data-shared-receiving="off"/);
});

test('כשהסנכרון רק נטען — "המשך בטלפון הזה בלבד" לא מוצע בשניות הראשונות; אחרי 6 שניות — כן', () => {
  const r = runtime({ data: fixture(), sharedReceiving: true, loadSharedEngine: false });
  r.run(`currentView = 'receiving'; sharedReceiptLastError = ''; sharedReceiptStatus = { ready: false, status: 'loading' }; sharedReceivingStartedAt = Date.now(); renderSharedReceivingBanner();`);
  assert.match(r.node('sharedReceivingBanner').innerHTML, /טוען את הקליטה/);
  assert.doesNotMatch(r.node('sharedReceivingBanner').innerHTML, /data-shared-receiving="off"/);
  r.run(`sharedReceivingStartedAt = Date.now() - 7000; renderSharedReceivingBanner();`);
  assert.match(r.node('sharedReceivingBanner').innerHTML, /data-shared-receiving="off"/);
});

test('טלפון אחד, השמירה לענן נכשלה — הטיוטה לא נמחקת והסיכום מחכה', async () => {
  const r = brokenSync(new Map([['bm_shared_receiving_off', '1']]));
  r.run(`runCloudTask = async () => false;`);
  await r.scan();
  r.run('receiptDupConfirmed = true; finishReceipt()');
  if (!r.run('!!pendingReceipt')) r.click('ai-close-receipt');
  await r.run('confirmReceipt()'); await settle();
  assert.ok(r.run('!!pendingReceipt'), 'הסיכום מחכה');
  assert.equal(r.run('receivingDraftEmpty()'), false, 'הטיוטה במקום');
  assert.equal(r.run('sharedReceiptFinalizing'), false);
});
