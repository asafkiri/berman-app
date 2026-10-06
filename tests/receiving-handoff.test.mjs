// v137 — קליטה בטלפון, גיבוי בענן ו"המשך אותה כאן" בטלפון אחר, על המודול draft-handoff.js (docs/local-first-sync.md).
// שני טלפונים אמיתיים (האפליקציה כולה) על ענן מדומה אחד (tests/fake-firestore.mjs: מטמון לכל טלפון, טרנזקציות, השרת מכריע).
// מה שנבדק:
// - ברירת המחדל: טלפון אחד — עורכים תמיד; לכל קליטה מסמך משלה בענן (בלי תמונות ובלי סיכום פתוח), עם מספר התעודה ומה שנספר.
// - בטלפון השני: "יש קליטה פתוחה … המשך אותה כאן" → אותה קליטה (מזהה, עוגנים, קריאה, ספירה), בלי קריאה בתשלום.
// - הטלפון הראשון: "ממשיכה בטלפון אחר" — לקריאה בלבד (לא עורך, לא שומר, לא מבטל), ו"החזר אותה לכאן".
// - סיום בשני: התעודה נשמרת בטרנזקציה במזהה של הקליטה (עם savedBy), והמסמך נסגר; בראשון — "כבר נשמרה" + "נקה" (בלי למחוק ניירות).
// - "החזר אותה לכאן" — הספירה העדכנית חוזרת; הספירה המקומית נשמרת בצד.
// - קליטה אחרת פתוחה בטלפון השני — שואלים; היא נשמרת בצד, ואפשר לפתוח אותה אחר כך מהשורה העליונה.
// - ביטול אצל המחזיק — בשני "בוטלה" (לא "נשמרה").
// - קריאה בתשלום רצה בראשון — בשני אין "המשך" עד שהיא נגמרת.
// - קליטה שהייתה פתוחה לפני העדכון — לא נתבעת בפתיחה, רק בעריכה של המשתמש.
// - בלי רשת: "שמור" אומר "אין חיבור", הקליטה נשארת, ושום שמירה לא נוחתת מאוחר.
// - מעבר מ-v136: הקליטה ש-v136 שם "בצד" מקבלת דרך חזרה; שמירה עיוורת שממתינה בתור לא תדרוס.
// הרצה: node --test tests/receiving-handoff.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { app, days, delivery, printed, readPapers } from './one-button-helpers.mjs';
import { createCloud } from './fake-firestore.mjs';

const json = (r, expr) => JSON.parse(r.run('JSON.stringify(' + expr + ')'));
const settle = async () => { for (let i = 0; i < 60; i++) await new Promise(res => setImmediate(res)); };
const small = (number = '290095141') => delivery(number, { internalNumber: null, headerText: 'ת.משלוח', docDate: printed(days(0)) });
const ROOT = 'artifacts/berman-app-classic/public/data/';
const handoffDoc = (cloud, sid) => cloud.get(ROOT + 'drafts/handoff_berman_receiving_' + sid);
const record = (cloud, id) => cloud.get(ROOT + 'receipts/' + id);
// טלפון: האפליקציה כולה + "Firestore" של אותו טלפון (מטמון משלו, רשת משלו)
function phone(cloud, name, paper = small(), opts = {}) {
  const client = cloud.client({ cache: opts.cache });
  const r = app(paper, { storage: opts.storage });
  r.client = client; r.context.__fs = client.fs;
  r.run(`for (const k of ['doc', 'collection', 'query', 'where', 'onSnapshot', 'runTransaction', 'getDocFromServer']) globalThis[k] = __fs[k];
    deviceName = ${JSON.stringify(name)}; currentView = 'receiving'; mainMode = 'receiving';`);
  if (!opts.noStart) r.run('startSharedReceiving()');
  return r;
}
const online = (r, v) => { r.run('navigator.onLine = ' + !!v); r.client.setOnline(!!v); };
const sync = async r => { r.run('draftHandoff.retry()'); await settle(); };
const banner = r => { r.run(`currentView = 'receiving'; renderSharedReceivingBanner()`); return r.node('sharedReceivingBanner').innerHTML; };
const sessionIn = html => (html.match(/data-shared-receiving="handoff-take" data-session="([^"]+)"/) || [])[1];
const bannerClick = async (r, action, session = '') => {
  await r.events.get('sharedReceivingBanner:click')({ target: { closest: sel => sel === '[data-shared-receiving]' ? { dataset: { sharedReceiving: action, session } } : null } });
  await settle();
};
const lastConfirm = r => r.run('testConfirms[testConfirms.length - 1]');
async function startOnA(cloud, opts) {
  const a = phone(cloud, 'טלפון א', small(), opts);
  await readPapers(a); await settle();
  await sync(a);
  return a;
}
async function takeOnB(cloud, a) {
  const b = phone(cloud, 'טלפון ב'); await settle();
  await bannerClick(b, 'handoff-take', a.run('receiptDraftId'));
  await settle(); await settle();
  return b;
}

test('ברירת המחדל: טלפון אחד — עורכים תמיד; לכל קליטה מסמך משלה בענן (בלי תמונות ובלי סיכום פתוח)', async () => {
  const cloud = createCloud();
  const a = phone(cloud, 'טלפון א');
  assert.equal(a.run('sharedReceivingOff'), true, 'ברירת המחדל');
  assert.equal(a.run('!!draftHandoff'), true, 'המודול עלה');
  assert.equal(a.run('canEditSharedReceipt()'), true);
  await readPapers(a); await settle();
  a.run(`pendingReceipt = { lines: [] }; aiScanDocuments = [{ noteIndex: 0, pages: [{ dataUrl: 'data:image/jpeg;base64,' + 'x'.repeat(5000) }] }];`);
  await sync(a);
  const id = a.run('receiptDraftId');
  const h = handoffDoc(cloud, id);
  assert.ok(h, 'גובה');
  assert.equal(h.state, 'open'); assert.equal(h.gen, 1); assert.equal(h.deviceName, 'טלפון א'); assert.equal(h.sessionId, id); assert.equal(h.recordId, id);
  assert.equal(h.openKey, 'berman:receiving');
  assert.deepEqual(h.summary.docs, ['290095141']); assert.equal(h.summary.paperUnits, 30);
  const p = JSON.parse(h.payload);
  assert.equal(p.state.pendingReceipt, null, 'בלי סיכום פתוח');
  assert.ok(p.state.aiScanDocuments.every(d => d.pages.length === 0), 'בלי תמונות');
  assert.equal(p.state.receiptNotes[0].units, 30);
  assert.match(banner(a), /הקליטה מגובה בענן/);
  assert.equal(cloud.paths('receiving_handoff').length, 0, 'לא המסמך האחד של v136');
});

test('"המשך אותה כאן" — אותה קליטה בלי קריאה בתשלום; הראשון — "ממשיכה בטלפון אחר", לקריאה בלבד: לא עורך, לא שומר, לא דורס', async () => {
  const cloud = createCloud();
  const a = await startOnA(cloud);
  a.run(`receiptList = [{ productId: products[0].id, name: products[0].name, barcode: products[0].barcode, qty: 3 }]; saveReceiptDraft();`);
  await sync(a);
  const b = phone(cloud, 'טלפון ב'); await settle();
  const bb = banner(b);
  assert.match(bb, /יש קליטה פתוחה בטלפון "טלפון א"/);
  assert.match(bb, /תעודה 290095141/); assert.match(bb, /30 יח׳ בנייר/); assert.match(bb, /נספרו 3 יח׳ ב-שורה אחת/);
  assert.equal(sessionIn(bb), a.run('receiptDraftId'));
  assert.match(bb, /data-shared-receiving="handoff-take"[^>]*>המשך אותה כאן/);
  await bannerClick(b, 'handoff-take', sessionIn(bb)); await settle();
  assert.equal(b.run('receiptDraftId'), a.run('receiptDraftId'), 'אותה קליטה');
  assert.deepEqual(json(b, 'receiptList.map(l => l.qty)'), [3]);
  assert.deepEqual(json(b, 'receiptNotes.map(n => [n.units, n.lines])'), [[30, 5]]);
  assert.deepEqual(json(b, 'aiScanResponse.perDocument.map(d => d.paperId)'), ['paper_290095141']);
  assert.equal(b.run('receiptPaperScanState'), 'ok');
  assert.equal(b.requests.length, 0, 'בלי קריאה בתשלום');
  const h = handoffDoc(cloud, a.run('receiptDraftId'));
  assert.equal(h.deviceName, 'טלפון ב'); assert.equal(h.gen, 2);
  // הראשון
  await settle();
  const ab = banner(a);
  assert.match(ab, /הקליטה הזאת ממשיכה בטלפון "טלפון ב"/);
  assert.match(ab, /data-shared-receiving="handoff-take"[^>]*>החזר אותה לכאן/);
  assert.equal(a.run('canEditSharedReceipt()'), false, 'לקריאה בלבד');
  // שמירה באישור — לא נשמרת, וההודעה אומרת למה
  a.run(`pendingReceipt = { lines: receiptList.slice(), status: 'ok' };`);
  await a.run('confirmReceipt()'); await settle();
  assert.equal(record(cloud, a.run('receiptDraftId')), null, 'לא נשמרה בטלפון הראשון');
  assert.match(a.toasts[a.toasts.length - 1], /ממשיכה בטלפון "טלפון ב"/);
  // גם נייר שמגיע עכשיו לא נכנס לעותק הישן, וההסבר נכון
  assert.match(a.run(`paperJoinReasonText({ reason: 'readonly' })`), /ממשיכה בטלפון/);
  // לא דורס את הגיבוי
  a.run(`receiptList[0].qty = 9; saveReceiptDraft();`); await sync(a);
  assert.equal(handoffDoc(cloud, a.run('receiptDraftId')).deviceName, 'טלפון ב');
  assert.deepEqual(JSON.parse(handoffDoc(cloud, a.run('receiptDraftId')).payload).state.receiptList.map(l => l.qty), [3]);
});

test('סיום בשני: נשמרת בטרנזקציה במזהה של הקליטה (savedBy) והמסמך נסגר; בראשון — "כבר נשמרה" ו"נקה" (בלי למחוק ניירות)', async () => {
  const cloud = createCloud();
  const a = await startOnA(cloud);
  const draftId = a.run('receiptDraftId');
  const b = await takeOnB(cloud, a);
  assert.equal(b.run('receiptDraftId'), draftId);
  b.run(`startReceiptQuantityReview('none'); testConfirms[testConfirms.length - 1].cb();`);
  await settle(); await settle();
  const rec = record(cloud, draftId);
  assert.ok(rec, 'נשמרה');
  assert.equal(rec.savedBy.sessionId, draftId); assert.equal(rec.savedBy.gen, 2); assert.equal(rec.operationId, draftId);
  assert.equal(handoffDoc(cloud, draftId).state, 'saved'); assert.equal(handoffDoc(cloud, draftId).payload, null);
  assert.equal(b.run('receivingDraftEmpty()'), true, 'הקליטה נסגרה בשני');
  assert.match(b.toasts.join(' | '), /התעודה נקלטה ✓/);
  assert.deepEqual(json(b, `testWrites.filter(w => w.path && w.path[w.path.length - 2] === 'receipts')`), [], 'לא בשמירה העיוורת הישנה');
  await settle();
  assert.match(banner(a), /הקליטה הזאת כבר נשמרה/);
  await bannerClick(a, 'handoff-drop');
  assert.equal(lastConfirm(a).title, 'לנקות את העותק הישן?');
  a.run('testConfirms[testConfirms.length - 1].cb()'); await settle();
  assert.equal(a.run('receivingDraftEmpty()'), true, 'העותק הישן נוקה');
  assert.deepEqual(json(a, `testWrites.filter(w => w.op === 'batch' && w.writes.some(x => x.path && x.path.includes('trash')))`), [], 'בלי למחוק ניירות');
  assert.equal(record(cloud, draftId).savedBy.gen, 2, 'התעודה השמורה לא השתנתה');
});

test('"החזר אותה לכאן" — הספירה העדכנית מהשני חוזרת, והספירה המקומית נשמרת בצד', async () => {
  const cloud = createCloud();
  const a = await startOnA(cloud);
  const b = await takeOnB(cloud, a);
  b.run(`receiptList = [{ productId: products[1].id, name: products[1].name, barcode: products[1].barcode, qty: 7 }]; saveReceiptDraft();`);
  await sync(b); await settle();
  const ab = banner(a);
  await bannerClick(a, 'handoff-take', sessionIn(ab)); await settle();
  assert.deepEqual(json(a, 'receiptList.map(l => l.qty)'), [7], 'הספירה מהשני');
  assert.equal(handoffDoc(cloud, a.run('receiptDraftId')).deviceName, 'טלפון א');
  assert.equal(a.run('canEditSharedReceipt()'), true);
  await settle();
  assert.match(banner(b), /ממשיכה בטלפון "טלפון א"/);
  const side = JSON.parse(a.storage.get('bm_handoff_receiving_side'));
  assert.equal(side.length, 1); assert.equal(side[0].reason, 'same', 'הגרסה המקומית — בצד');
});

test('קליטה אחרת פתוחה בטלפון השני — שואלים; היא נשמרת בצד, ואחרי הסיום נפתחת מהשורה העליונה', async () => {
  const cloud = createCloud();
  const a = await startOnA(cloud);
  const b = phone(cloud, 'טלפון ב', delivery('77001234'));
  await readPapers(b); await settle(); await sync(b);
  const bDraft = b.run('receiptDraftId');
  assert.notEqual(bDraft, a.run('receiptDraftId'));
  const bb = banner(b);
  assert.match(bb, /המשך אותה כאן/);
  await bannerClick(b, 'handoff-take', sessionIn(bb));
  assert.equal(lastConfirm(b).title, 'להחליף את הקליטה שפתוחה כאן?');
  assert.equal(b.run('receiptDraftId'), bDraft, 'לפני האישור — כלום');
  await b.run('testConfirms[testConfirms.length - 1].cb()'); await settle();
  assert.equal(b.run('receiptDraftId'), a.run('receiptDraftId'));
  const side = JSON.parse(b.storage.get('bm_handoff_receiving_side'));
  assert.equal(side[0].sessionId, bDraft); assert.equal(side[0].reason, 'other');
  assert.ok(JSON.parse(side[0].payload).state.aiScanDocuments.every(d => d.pages.length === 0), 'בלי תמונות');
  // מסיימים את הקליטה שהגיעה מא' — והקליטה שבצד מוצעת
  b.run(`startReceiptQuantityReview('none'); testConfirms[testConfirms.length - 1].cb();`); await settle(); await settle();
  const after = banner(b);
  assert.match(after, /קליטה שנשמרה בצד בטלפון הזה/); assert.match(after, /פתח אותה/);
  await bannerClick(b, 'side-open', bDraft); await settle();
  assert.equal(b.run('receiptDraftId'), bDraft, 'הקליטה שבצד חזרה');
  assert.equal(b.run('canEditSharedReceipt()'), true);
});

test('ביטול אצל המחזיק — בשני "בוטלה" (לא "נשמרה"), ו"נקה" שומר קודם עותק בצד', async () => {
  const cloud = createCloud();
  const a = await startOnA(cloud);
  const draftId = a.run('receiptDraftId');
  const b = await takeOnB(cloud, a);
  b.click('rc-cancel'); b.run('testConfirms[testConfirms.length - 1].cb()'); await settle();
  assert.equal(b.run('receivingDraftEmpty()'), true);
  await sync(b);
  assert.equal(handoffDoc(cloud, draftId).state, 'canceled');
  await settle();
  const ab = banner(a);
  assert.match(ab, /בוטלה בטלפון "טלפון ב"/); assert.doesNotMatch(ab, /נשמרה/);
  await bannerClick(a, 'handoff-drop'); a.run('testConfirms[testConfirms.length - 1].cb()'); await settle();
  assert.equal(a.run('receivingDraftEmpty()'), true);
  assert.equal(JSON.parse(a.storage.get('bm_handoff_receiving_side'))[0].reason, 'canceled');
});

test('קריאה בתשלום רצה בראשון — בשני אין "המשך" עד שהיא נגמרת', async () => {
  const cloud = createCloud();
  const a = await startOnA(cloud);
  // תחילת קריאה — הגיבוי מתעדכן מיד (פעם אחת לכל שינוי, לא בכל ציור)
  a.run(`globalThis.__changed = 0; const __orig = draftHandoff.changed; draftHandoff.changed = o => { __changed++; return __orig(o); };`);
  a.run(`aiScanBusy = true; receiptPaperScanState = 'running'; refreshScanHost(); refreshScanHost();`);
  assert.equal(a.run('__changed'), 1, 'הקריאה התחילה — עדכון אחד');
  await sync(a);
  assert.equal(handoffDoc(cloud, a.run('receiptDraftId')).scanRunning, true);
  const b = phone(cloud, 'טלפון ב'); await settle();
  let bb = banner(b);
  assert.match(bb, /קריאת הנייר רצה שם/); assert.doesNotMatch(bb, /המשך אותה כאן/);
  a.run(`aiScanBusy = false; receiptPaperScanState = 'ok'; refreshScanHost();`); await sync(a); await settle();
  bb = banner(b);
  assert.match(bb, /המשך אותה כאן/);
});

test('קליטה שהייתה פתוחה לפני העדכון — לא נתבעת בפתיחה; שמירה אוטומטית לא תובעת; עריכה של המשתמש — כן', async () => {
  const cloud = createCloud();
  const a = phone(cloud, 'טלפון א', small(), { noStart: true });
  await readPapers(a); await settle();
  a.run('startSharedReceiving()'); await sync(a);
  const id = a.run('receiptDraftId');
  assert.equal(handoffDoc(cloud, id), null, 'פתיחה לא תובעת');
  a.run('saveReceiptDraft()'); await sync(a);
  assert.equal(handoffDoc(cloud, id), null, 'שמירה אוטומטית לא תובעת');
  assert.doesNotMatch(banner(a), /מגובה/);
  // לחיצה של המשתמש בלי שינוי בתוכן (למשל ניווט) — לא תובעת: אולי בטלפון אחר יש עותק חדש יותר מהסנכרון הישן
  const target = { closest: sel => (sel === '#app' ? {} : null) };
  a.events.get('click')({ type: 'click', target }); await sync(a);
  assert.equal(handoffDoc(cloud, id), null, 'לחיצה בלי שינוי — לא נתבעת');
  // עריכה אמיתית של המשתמש: אירוע על מסך הקליטה + התוכן השתנה
  a.run(`receiptList = [{ productId: products[0].id, name: products[0].name, barcode: products[0].barcode, qty: 1 }]; saveReceiptDraft();`);
  a.events.get('input')({ type: 'input', target }); await sync(a);
  assert.equal(handoffDoc(cloud, id).deviceName, 'טלפון א', 'עריכה של המשתמש — נתבעת ומגובה');
});

test('בלי רשת: "שמור" אומר "אין חיבור" — הקליטה והסיכום נשארים, ושום שמירה לא נוחתת אחר כך', async () => {
  const cloud = createCloud();
  const a = await startOnA(cloud);
  const id = a.run('receiptDraftId');
  online(a, false);
  a.run(`startReceiptQuantityReview('none'); testConfirms[testConfirms.length - 1].cb();`); await settle();
  assert.match(a.toasts.join(' | '), /אין חיבור — הקליטה שמורה בטלפון/);
  assert.equal(a.run('receivingDraftEmpty()'), false);
  assert.equal(a.run('!!pendingReceipt'), true, 'הסיכום מחכה');
  online(a, true); await sync(a);
  assert.equal(record(cloud, id), null, 'שום שמירה לא נוחתת לבד');
  await a.run('confirmReceipt()'); await settle();
  assert.ok(record(cloud, id), 'ושמירה חוזרת עובדת');
});

test('מעבר מ-v136: מה ש-v136 שם "בצד" מקבל דרך חזרה; שמירה עיוורת שממתינה בתור — לא תדרוס', async () => {
  const cloud = createCloud();
  const a = phone(cloud, 'טלפון א', small(), { noStart: true });
  await readPapers(a); await settle();
  const id = a.run('receiptDraftId');
  const old = { savedAt: Date.now() - 3600000, payload: { version: 1, ui: { view: 'receiving', forms: {} }, state: { receiptDraftId: 'receipt_old1', receiptOpened: true,
    receiptList: [{ productId: 'p1', qty: 4 }], aiScanDocuments: [{ noteIndex: 0, pages: [{ dataUrl: 'data:image/jpeg;base64,eA==' }] }] } } };
  a.storage.set('bm_receipt_before_handoff', JSON.stringify(old));
  a.storage.set('bm_receiving_claim_v1', JSON.stringify({ draftId: id, at: 1 }));
  a.run(`cloudFailedWrites = [
    { id: 'w1', actionName: 'save receipt', task: { op: 'set', path: dataPath('receipts', ${JSON.stringify(id)}), data: { a: 1 }, operationId: ${JSON.stringify(id)} } },
    { id: 'w2', actionName: 'save receipt', task: { op: 'set', path: dataPath('receipts', 'receipt_other'), data: { b: 1 }, operationId: 'receipt_other' } },
    { id: 'w3', actionName: 'save product', task: { op: 'set', path: dataPath('products', 'x'), data: {} } }]; saveCloudFailedWrites();`);
  a.run('startSharedReceiving()'); await settle();
  assert.deepEqual(json(a, 'cloudFailedWrites.map(w => [w.id, w.task.op])'), [['w2', 'create-if-absent'], ['w3', 'set']]);
  assert.equal(a.storage.has('bm_receipt_before_handoff'), false);
  assert.equal(a.storage.has('bm_receiving_claim_v1'), false);
  const side = JSON.parse(a.storage.get('bm_handoff_receiving_side'));
  assert.equal(side[0].sessionId, 'receipt_old1');
  assert.ok(JSON.parse(side[0].payload).state.aiScanDocuments.every(d => d.pages.length === 0), 'בלי תמונות');
});

test('שורה עליונה: תאריך להצעה ישנה, "שורה אחת", "תעודות" ברבים', () => {
  const r = app(small());
  assert.match(r.run(`receivingHandoffWhen(Date.now() - 2 * 86400000)`), /\d+\.\d+/);
  assert.doesNotMatch(r.run(`receivingHandoffWhen(Date.now())`), /\d+\.\d+\s/);
  assert.match(r.run(`receivingHandoffWhat({ lines: 1, units: 3 })`), /ב-שורה אחת/);
  assert.match(r.run(`receivingHandoffWhat({ lines: 2, units: 3, docs: ['1', '2'] })`), /תעודות 1, 2 · נספרו 3 יח׳ ב-2 שורות/);
});

test('לחיצה כפולה על "שמור" — תעודה אחת; בזמן השמירה אי אפשר לערוך', async () => {
  const cloud = createCloud();
  const a = await startOnA(cloud);
  const id = a.run('receiptDraftId');
  a.run(`pendingReceipt = { lines: receiptList.slice(), status: 'ok', noteTotal: 0, noteParts: [] };`);
  const first = a.run('confirmReceipt()');
  assert.equal(a.run('canEditSharedReceipt()'), false, 'בזמן השמירה — לא עורכים');
  const second = a.run('confirmReceipt()');
  await first; await second; await settle();
  assert.equal(cloud.transactions >= 1, true);
  assert.ok(record(cloud, id), 'נשמרה');
  assert.equal(cloud.paths('/receipts/').length, 1, 'תעודה אחת');
});

test('בלי רשת בזמן עבודה — השורה העליונה אומרת "הגיבוי לענן מתעכב", והעבודה ממשיכה', async () => {
  const cloud = createCloud();
  const a = await startOnA(cloud);
  online(a, false);
  a.run(`receiptList = [{ productId: products[0].id, name: products[0].name, barcode: products[0].barcode, qty: 2 }]; saveReceiptDraft();`);
  await sync(a);
  assert.match(banner(a), /הגיבוי לענן מתעכב — הקליטה שמורה בטלפון/);
  assert.equal(a.run('canEditSharedReceipt()'), true);
  online(a, true); await sync(a);
  assert.match(banner(a), /הקליטה מגובה בענן/);
  assert.deepEqual(JSON.parse(handoffDoc(cloud, a.run('receiptDraftId')).payload).state.receiptList.map(l => l.qty), [2]);
});

test('קליטה שמגיעה מטלפון אחר עם קריאה "רצה": בלי קריאה — "צלם שוב או הקלד"; עם קריאה — העוגנים ממנה, בלי בקשה', async () => {
  const cloud = createCloud();
  const a = await startOnA(cloud);
  const p = JSON.parse(handoffDoc(cloud, a.run('receiptDraftId')).payload);
  const b = phone(cloud, 'טלפון ב');
  // עם קריאה: הקריאה כבר יש — לוקחים ממנה את העוגנים
  p.state.aiScanBusy = true; p.state.receiptPaperScanState = 'running'; p.state.receiptNotes = []; p.state.receiptAnchorSource = null;
  b.context.__p = p; b.run('receivingHandoffApply(JSON.parse(JSON.stringify(__p)), {})');
  assert.equal(b.run('aiScanBusy'), false); assert.equal(b.run('receiptPaperScanState'), 'ok');
  assert.deepEqual(json(b, 'receiptNotes.map(n => n.units)'), [30]);
  // בלי קריאה: "צלם שוב או הקלד"
  p.state.aiScanResponse = null; p.state.receiptDraftId = 'receipt_other';
  b.context.__p = p; b.run('receivingHandoffApply(JSON.parse(JSON.stringify(__p)), {})');
  assert.equal(b.run('receiptPaperScanState'), 'failed');
  assert.match(b.run('receiptPaperScanProblems[0]'), /לא הסתיימה בטלפון השני/);
  assert.equal(b.requests.length, 0);
});

test('ביטול: תעודות המשלוח של הקליטה יוצאות לסל רק אחרי שהענן אישר שהיא של הטלפון הזה; הקליטה לא מוצעת בחזרה', async () => {
  const cloud = createCloud();
  const a = await startOnA(cloud);
  a.run(`globalThis.__discarded = []; paperDiscard = async p => { __discarded.push(p.id); return { ok: true }; };`);
  online(a, false);
  a.click('rc-cancel'); a.run('testConfirms[testConfirms.length - 1].cb()'); await settle();
  assert.equal(a.run('receivingDraftEmpty()'), true);
  assert.deepEqual(json(a, '__discarded'), [], 'עוד לא — הענן לא אישר');
  assert.doesNotMatch(banner(a), /המשך אותה כאן/, 'הקליטה שבוטלה לא מוצעת בחזרה');
  online(a, true); await sync(a); await settle();
  assert.deepEqual(json(a, '__discarded'), ['paper_290095141'], 'אחרי האישור — לסל');
});

test('צירוף נייר לתעודה ששוחזרה (יש בה שדה id) — נשמר, במושב צירוף משלו', async () => {
  const cloud = createCloud();
  const a = phone(cloud, 'טלפון א');
  const rec = { schemaVersion: 2, timestamp: Date.now() - 86400000, date: '2026-10-05', docDate: '2026-10-05', noDoc: true, status: 'open', units: 3, count: 1,
    items: [{ productId: 'x', name: 'לחם', barcode: '1', qty: 3 }], operationId: 'rc1', id: 'rc1' };
  cloud.put(ROOT + 'receipts/rc1', rec);
  a.context.__rec = rec; a.run(`receipts = [JSON.parse(JSON.stringify(__rec))];`);
  a.run(`reopenReceiptForDoc('rc1')`);
  assert.match(a.run('receiptAttachTarget.sessionId'), /^edit_rc1_/);
  a.run(`pendingReceipt = { lines: receiptList.slice(), status: 'ok', noteParts: [], noDoc: false };`);
  await a.run('confirmReceipt()'); await settle();
  const saved = record(cloud, 'rc1');
  assert.match(saved.savedBy.sessionId, /^edit_rc1_/, 'נשמר — בלי "התעודה השתנתה"');
  assert.doesNotMatch(a.toasts.join(' | '), /השתנתה/);
});

test('טיוטה שהתרוקנה (למשל הצילום בוטל) — לא נשארת "קליטה פתוחה" בענן; השומר לא בונה את הקליטה בכל לחיצה', async () => {
  const cloud = createCloud();
  const a = await startOnA(cloud);
  const id = a.run('receiptDraftId');
  // השומר והשורה העליונה — בלי לבנות את ה-payload (התמונות לא משוכפלות בכל לחיצה)
  a.run(`globalThis.__pc = 0; const __o = receivingHandoffPayload; receivingHandoffPayload = () => { __pc++; return __o(); };`);
  for (let i = 0; i < 20; i++) a.run('canEditSharedReceipt()');
  a.run('renderSharedReceivingBanner()');
  assert.equal(a.run('__pc'), 0);
  a.run(`receiptList = []; receiptNotes = []; recomputeNoteTotal(); receiptOpened = false; aiScanDocuments = []; aiScanResponse = null; receiptAttachTarget = null; saveReceiptDraft();`);
  assert.equal(a.run('receiptDraftId'), id, 'המזהה נשאר (כמו בביטול צילום)');
  await sync(a); await settle();
  assert.equal(handoffDoc(cloud, id).openKey, null, 'חונה');
  const b = phone(cloud, 'טלפון ב'); await settle();
  assert.doesNotMatch(banner(b), /יש קליטה פתוחה/);
});
