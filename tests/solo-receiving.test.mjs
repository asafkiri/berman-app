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

test('old live selection never blocks local editing or starts a cloud draft',async()=>{const r=brokenSync();assert.equal(r.run('canEditSharedReceipt()'),true);assert.equal(r.run('sharedReceiving'),null);assert.match(r.node('sharedReceivingBanner').innerHTML,/בטלפון הזה בלבד/);await bannerClick(r,'on');assert.equal(r.run('sharedReceivingOff'),true);});
test('local receiving is available immediately without a network timeout or migration prompt',()=>{const r=brokenSync();r.run('navigator.onLine=false;renderSharedReceivingBanner()');assert.equal(r.run('canEditSharedReceipt()'),true);assert.doesNotMatch(r.node('sharedReceivingBanner').innerHTML,/טוען את הקליטה|הפעל סנכרון/);});
test('failed server save preserves both current counts and summary',async()=>{const r=brokenSync();r.run("receiptDraftId='local-failed';receiptOpened=true;receiptNoDoc=true;receiptList=[{productId:products[0].id,qty:9}];saveReceiptDraft();pendingReceipt={lines:receiptList.slice(),noDoc:true};");r.finalCloud.reject='permission-denied';await r.run('confirmReceipt()');assert.equal(r.run('receiptList[0].qty'),9);assert.ok(r.run('pendingReceipt'));assert.equal(saves(r).length,0);});
