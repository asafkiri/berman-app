// v147 — אותה תעודת משלוח נקלטה פעמיים. 19.10.2026: תעודה 244767903 (14 שורות, 95 יח׳) נקלטה ב-06:43:41, ושוב
// ב-06:43:57 — שתי קליטות זהות, שתיהן "הכמויות אושרו ידנית". השמירה היא טרנזקציה, והיא לא נכנסת למטמון של הטלפון:
// המאזין של הענן מביא את הקליטה רק כשהשרת שולח אותה — ובטלפון זה לקח יותר מ-15 שניות. בינתיים ההיסטוריה (שאליה
// האפליקציה עוברת אחרי השמירה) הראתה "תעודת משלוח מהנהג · ממתינה לקליטה" עם "לקליטה", בלי הקליטה החדשה; "לקליטה"
// פתח לתעודה קליטה חדשה, ושתי בדיקות הכפילות בסיום ("התעודה כבר נקלטה", "אולי כפילות") לא ראו את הראשונה.
// מה שנבדק (8 מתוך 10 נכשלות על v146; 3ב ו-3ג שומרות על ההתנהגות החדשה):
// 1. אחרי "שמור", לפני שהמאזין מביא אותה: הקליטה בהיסטוריה, התעודה "כבר בקליטה" — בלי "ממתינה לקליטה" ו"לקליטה".
// 2. "לקליטה" על התעודה (הכפתור שנלחץ ב-06:43) — "כבר נקלטה", בלי קליטה חדשה ובלי שמירה שנייה.
// 3. המאזין האמיתי מאחר: רשימה בלי הקליטה (וניירות בלי התעודה) לא מורידה אותה, גם לא מה שנרשם בה כאן; כשהיא מגיעה —
//    פעם אחת; ומאז המאזין קובע: נמחקה בטלפון אחר (3), השתנתה בטלפון אחר (3ג). מחיקה כאן — לא חוזרת (3ב). צירוף נייר
//    לקליטה שמורה — החדשה נשארת כל עוד המאזין מביא את הקודמת (3ד).
// 4. ריענון לפני שהמאזין הביא אותה — היא עדיין ידועה (נשמרת במכשיר עד שמגיעה, לא יותר מיום).
// 5. טלפון שלא יודע על הקליטה (טלפון אחר, או שהמאזין לא הביא אותה): הקליטה השנייה נדחית בענן עצמו — "כבר נקלטה",
//    בלי קליטה שנייה בענן, והקליטה הפתוחה נשארת. 5ב: תשובה שאבדה ו"נסה שוב" — גם אז ברשימה מיד.
// 6. מה שלא השתנה: תעודה אחרת מאותו יום נקלטת כרגיל; קליטה שנמחקה משחררת את התעודה.
// הרצה: TZ=Asia/Jerusalem node --test tests/double-receipt-v147.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { app, delivery, credit, readPapers, join } from './one-button-helpers.mjs';

const NUM = '244767903', PID = 'paper_' + NUM;
const json = (r, expr) => JSON.parse(r.run('JSON.stringify(' + expr + ')'));
const settle = async () => { for (let i = 0; i < 30; i++) await new Promise(res => setImmediate(res)); };
const cloudReceipts = r => r.finalCloud.paths('/receipts/');
const cloudPaper = (r, id = PID) => r.finalCloud.find('/papers/' + id);

// המאזינים האמיתיים של האפליקציה (startListeners), עם ענן שמגיש רק מה שהבדיקה שולחת — כמו מאזין שמאחר
function listening(r) {
  const listeners = new Map();
  Object.assign(r.context, {
    collection: (_db, ...parts) => parts.join('/'), query: ref => ref, orderBy: () => null, limit: () => null, where: () => null,
    onSnapshot(ref, opts, next) {
      const key = typeof ref === 'string' ? ref : ref.path;
      listeners.set(key, typeof opts === 'function' ? opts : next);
      return () => listeners.delete(key);
    }
  });
  r.run('startSharedReceiving = () => {}; startReturnsEvents = () => {}; startListeners();');
  const emit = (source, list, fromCache = false) => {
    const next = [...listeners].find(([key]) => key.endsWith('/' + source))?.[1];
    assert.equal(typeof next, 'function', 'המאזין של ' + source);
    const docs = structuredClone(list).map(({ id, ...body }) => ({ id, data: () => body }));
    next({ docs, empty: !docs.length, metadata: { fromCache }, data: () => ({}) });
  };
  emit('products', json(r, 'products')); emit('returns', []); emit('papers', []); emit('receipts', []); emit('config/app', []);
  return emit;
}
// תעודת משלוח אחרת מאותו יום: 4 שורות, 27 יח׳ (בלי "אולי כפילות" — זו בדיקה קיימת, על אותן כמויות באותו יום)
function otherDelivery(number) {
  const p = delivery(number), doc = p.scan.documents[0];
  doc.rows = doc.rows.slice(0, 4);
  Object.assign(doc, { totalUnits: doc.rows.reduce((a, row) => a + row.quantity, 0), printedLines: doc.rows.length });
  return p;
}
// "כל הכמויות תואמות" → "שמור" — כמו ב-06:43
async function allMatchAndSave(r) {
  r.run(`currentView = 'receiving'; mainMode = 'receiving'; startReceiptQuantityReview(true)`);
  assert.ok(r.run('!!pendingReceipt'), 'הסיכום פתוח');
  await r.run('confirmReceipt()'); await settle();
}
// כמו בבוקר של 19.10: תעודת המשלוח (06:34), נייר הזיכוי בצילום נפרד (06:35), ואז "כל הכמויות תואמות" → "שמור" (06:43)
async function receivedOnce(opts = {}) {
  const r = app(delivery(NUM), opts);
  const emit = opts.listen ? listening(r) : null;
  await readPapers(r);
  assert.equal(r.run('receiptPaperScanState'), 'ok', 'התעודה נכנסה לקליטה');
  r.serve(credit('290095775'));
  await readPapers(r, 1, 1);
  assert.equal(r.run(`paperIntake.items.some(x => x.paperId === '${PID}')`), false, 'נייר הזיכוי — סבב צילום חדש');
  await allMatchAndSave(r);
  assert.equal(cloudReceipts(r).length, 1, 'נשמרה קליטה אחת');
  assert.equal(r.run('receiptDraftId'), null, 'הטיוטה נסגרה');
  return { r, emit, id: cloudReceipts(r)[0].split('/').pop() };
}

test('1. אחרי "שמור", לפני שהמאזין מביא אותה: הקליטה בהיסטוריה, והתעודה לא "ממתינה לקליטה"', async () => {
  const { r, id } = await receivedOnce();
  assert.equal(r.run('currentView'), 'receiptsHistory', 'אחרי השמירה — להיסטוריה');
  assert.deepEqual(json(r, 'receipts.map(x => x.id)'), [id], 'הקליטה ברשימה, בלי לחכות למאזין');
  assert.equal(r.run(`currentLedger().states['${PID}']`), 'in-receipt');
  assert.equal(r.run(`fullLedger().states['${PID}']`), 'in-receipt');
  assert.ok(!json(r, 'paperHistoryList().map(p => p.id)').includes(PID), 'אין לתעודה כרטיס "ממתינה לקליטה"');
  assert.equal(r.run('receivingAwaitingDeliveryPapers().length'), 0, 'אין "צרף" במסך הקליטה');
  r.run('renderReceiptsHistory()');
  const html = r.node('app').innerHTML;
  assert.doesNotMatch(html, /ממתינה לקליטה/);
  assert.doesNotMatch(html, /data-role="ledger-start-receiving"/);
  // מסך הניירות: הכרטיס של התעודה אומר שנקלטה — בלי "לקליטה"
  const view = json(r, `paperJoinView(null, paperFind('${PID}').paper)`);
  assert.equal(view.done, true);
  assert.match(view.text, /נקלטה — לא נקלטת פעמיים/);
});

test('2. "לקליטה" על תעודה שנקלטה עכשיו — "כבר נקלטה", בלי קליטה חדשה ובלי שמירה שנייה', async () => {
  const { r } = await receivedOnce();
  // הכפתור שבכרטיס ההיסטוריה (ב-v146 — "ממתינה לקליטה"), כפי שנלחץ ב-06:43
  await join(r, PID);
  assert.equal(r.run('receiptDraftId'), null, 'לא נפתחה קליטה');
  assert.equal(r.run('receivingDraftEmpty()'), true);
  assert.match(r.toasts[r.toasts.length - 1], /כבר נקלטה ב-.* — לא נקלטת פעמיים/);
  // ואם בכל זאת "כל הכמויות תואמות" — אין מה לשמור
  r.run(`currentView = 'receiving'; startReceiptQuantityReview(true)`);
  assert.equal(r.run('!!pendingReceipt'), false);
  assert.equal(cloudReceipts(r).length, 1);
  // גם ישירות, בלי הכפתור (תור, ניסיון חוזר)
  assert.equal(await r.run(`receivingJoinDelivery({ paperId: '${PID}', explicit: true })`), 'refuse');
  assert.equal(r.run('receiptDraftId'), null);
});

test('3. המאזין מאחר: רשימה בלי הקליטה לא מורידה אותה; כשהיא מגיעה — פעם אחת; ומאז המאזין קובע', async () => {
  const { r, emit, id } = await receivedOnce({ listen: true });
  const inCloud = { id, ...r.finalCloud.get(cloudReceipts(r)[0]) };
  // קיזוז שנרשם כאן אחרי השמירה (applyAutoOffsetPair משנה את הקליטה ברשימה) — לא נמחק עד שהמאזין מביא אותה
  r.run(`receipts.find(x => x.id === '${id}').externalOffsets = [{ id: 'xo1' }]`);
  // מה שהמאזין מגיש לפני שהשמירה הגיעה (שינוי במסמך אחר, מהמטמון) — בלי הקליטה, ובלי תעודת המשלוח שנשמרה איתה
  emit('receipts', [], true); emit('receipts', []); emit('papers', []);
  assert.deepEqual(json(r, 'receipts.map(x => x.id)'), [id], 'הקליטה לא ירדה');
  assert.deepEqual(json(r, `receipts[0].externalOffsets`), [{ id: 'xo1' }], 'עם מה שנרשם בה כאן');
  assert.notEqual(r.run(`currentLedger().states['${PID}'] || ''`), 'awaiting-receipt');
  assert.ok(!json(r, 'paperHistoryList().map(p => p.id)').includes(PID));
  assert.equal(json(r, `paperJoinView(null, paperFind('${PID}').paper)`).done, true, 'גם בלי הנייר ברשימה — "נקלטה"');
  assert.equal(await r.run(`receivingJoinDelivery({ paperId: '${PID}', explicit: true })`), 'refuse');
  emit('papers', [{ id: PID, ...r.finalCloud.get(r.finalCloud.paths('/papers/' + PID)[0]) }]);
  assert.equal(r.run(`currentLedger().states['${PID}']`), 'in-receipt');
  // הגיעה — פעם אחת
  emit('receipts', [inCloud]);
  assert.deepEqual(json(r, 'receipts.map(x => x.id)'), [id]);
  // מכאן המאזין קובע: נמחקה בטלפון אחר — לא חוזרת מהטלפון הזה
  emit('receipts', []);
  assert.deepEqual(json(r, 'receipts.map(x => x.id)'), []);
});

test('3ב. קליטה שנמחקה כאן לפני שהמאזין הביא אותה — לא חוזרת', async () => {
  const { r, emit, id } = await receivedOnce({ listen: true });
  r.run(`writeBatch = () => ({ set() {}, delete() {}, commit: async () => {} }); doc = (db, ...p) => p.join('/'); logAction = () => {};`);
  assert.equal(await r.run(`hardDeleteDocWithBackup('receipts', '${id}', receipts.find(x => x.id === '${id}'), 'delete-receipt')`), true);
  emit('receipts', []);
  assert.deepEqual(json(r, 'receipts.map(x => x.id)'), [], 'לא חזרה');
});

test('3ג. גרסה אחרת של הקליטה מהמאזין (טלפון אחר שינה אותה אחרי השמירה) — של המאזין, לא של הטלפון', async () => {
  const { r, emit, id } = await receivedOnce({ listen: true });
  const inCloud = { id, ...r.finalCloud.get(cloudReceipts(r)[0]) };
  emit('receipts', [{ ...inCloud, items: inCloud.items.map(l => ({ ...l, qty: l.qty + 1 })), localFinal: { token: 'finish_other', sessionId: 'edit_' + id } }]);
  assert.equal(r.run(`receipts.find(x => x.id === '${id}').localFinal.token`), 'finish_other');
  emit('receipts', []);
  assert.deepEqual(json(r, 'receipts.map(x => x.id)'), [], 'ומאז — המאזין קובע');
});

test('3ד. צירוף נייר לקליטה שמורה: כל עוד המאזין מביא את הגרסה הקודמת — נשארת החדשה', async () => {
  const r = app(delivery(NUM));
  const emit = listening(r);
  const before = { id: 'rc_bare', date: '2026-10-19', docDate: '2026-10-19', timestamp: 1, noDoc: true, count: 1, items: [{ productId: 'code_101', qty: 12 }] };
  emit('receipts', [before]);
  r.context.__before = before;
  r.context.__after = { ...before, noDoc: false, paperDocs: [{ number: NUM }], localFinal: { token: 'finish_attach', sessionId: 'edit_rc_bare_1' } };
  r.run('receiptSavedHere(__after, __before)');
  emit('receipts', [before]);
  assert.equal(r.run(`receipts[0].localFinal && receipts[0].localFinal.token`), 'finish_attach', 'הגרסה הקודמת לא דורסת');
  emit('receipts', [{ ...before, items: [{ productId: 'code_101', qty: 13 }] }]);
  assert.equal(r.run('receipts[0].items[0].qty'), 13, 'גרסה שלישית — של המאזין');
});

test('4. ריענון לפני שהמאזין הביא אותה — היא עדיין ידועה; אחרי יום — לא', async () => {
  const { r, id } = await receivedOnce();
  const again = app(delivery(NUM), { storage: r.storage });
  const emit = listening(again);
  assert.deepEqual(json(again, 'receipts.map(x => x.id)'), [id], 'מהמכשיר, עד שהמאזין מביא אותה');
  assert.equal(await again.run(`receivingJoinDelivery({ paperId: '${PID}', explicit: true })`), 'refuse');
  // יום אחרי — לא מחזיקים אותה יותר (המאזין כבר הביא אותה מזמן, או שאין מה להחזיק)
  again.run('const __now = Date.now; Date.now = () => __now() + 25 * 3600 * 1000;');
  emit('receipts', []);
  assert.deepEqual(json(again, 'receipts.map(x => x.id)'), []);
  assert.equal(again.storage.has('bm_receipts_saved_here_v1'), false);
});

test('5. טלפון שלא יודע על הקליטה: השמירה השנייה נדחית בענן — בלי קליטה שנייה, והקליטה הפתוחה נשארת', async () => {
  const { r, id } = await receivedOnce();
  assert.equal(cloudPaper(r).receivedIn, id, 'התעודה בענן יודעת באיזו קליטה היא');
  // כמו טלפון אחר (או מאזין שלא הביא אותה): הקליטה לא ברשימה, ו"לקליטה" פותח קליטה חדשה
  r.run(`receipts = []; receiptsSavedHere = {}; ledgerInvalidate();`);
  assert.equal(await r.run(`receivingJoinDelivery({ paperId: '${PID}', explicit: true })`), 'joined');
  const draft = r.run('receiptDraftId');
  await allMatchAndSave(r);
  assert.equal(cloudReceipts(r).length, 1, 'בענן — עדיין קליטה אחת');
  assert.match(r.toasts[r.toasts.length - 1], /כבר נקלטה/);
  assert.equal(r.run('receiptDraftId'), draft, 'הקליטה הפתוחה נשארה');
  // מה שהענן החזיר — עכשיו ברשימה: הקליטה מראה שהנייר כבר נקלט
  assert.deepEqual(json(r, 'receipts.map(x => x.id)'), [id]);
  assert.equal(r.run('receiptAlreadyReceivedPapers().length'), 1);
  assert.equal(cloudPaper(r).receivedIn, id, 'הסימון לא זז');
});

test('5ב. התשובה של השמירה אבדה, ו"נסה שוב" מאשר אותה — הקליטה ברשימה מיד, והתעודה לא "ממתינה לקליטה"', async () => {
  let noServerRead = false;
  const r = app(delivery(NUM), { globals: { getDocFromServer: async (...args) => {
    if (noServerRead) throw Object.assign(new Error('offline'), { code: 'unavailable' });
    return r.finalClient.fs.getDocFromServer(...args);
  } } });
  await readPapers(r);
  r.finalCloud.loseReplyAfterCommit = true; noServerRead = true;
  await allMatchAndSave(r);
  r.finalCloud.loseReplyAfterCommit = false; noServerRead = false;
  assert.equal(cloudReceipts(r).length, 1, 'נשמרה בענן');
  assert.notEqual(r.run('receiptDraftId'), null, 'בטלפון — עוד לא אושרה');
  assert.equal(r.run('localReceivingPending()'), true);
  await r.run('localReceivingRetry()'); await settle();
  const id = cloudReceipts(r)[0].split('/').pop();
  assert.equal(r.run('receiptDraftId'), null);
  assert.deepEqual(json(r, 'receipts.map(x => x.id)'), [id]);
  assert.equal(r.run(`currentLedger().states['${PID}']`), 'in-receipt');
  assert.equal(await r.run(`receivingJoinDelivery({ paperId: '${PID}', explicit: true })`), 'refuse');
});

test('6. תעודה אחרת מאותו יום נקלטת כרגיל, וקליטה שנמחקה משחררת את התעודה', async () => {
  const { r, id } = await receivedOnce();
  // קליטה שנייה עם תעודה אחרת — נשמרת, וכל תעודה מסומנת בקליטה שלה
  r.serve(otherDelivery('244767999'));
  await readPapers(r, 1, 5);
  assert.equal(r.run('receiptPaperScanState'), 'ok');
  await allMatchAndSave(r);
  assert.equal(cloudReceipts(r).length, 2);
  const second = cloudReceipts(r).map(p => p.split('/').pop()).find(x => x !== id);
  assert.equal(cloudPaper(r, 'paper_244767999').receivedIn, second);
  assert.equal(cloudPaper(r).receivedIn, id);
  // הקליטה הראשונה נמחקה (בענן): הסימון על התעודה ישן — קליטה חדשה שלה נשמרת
  r.finalCloud.server.delete(cloudReceipts(r).find(p => p.endsWith('/' + id)));
  r.run(`receipts = receipts.filter(x => x.id !== '${id}'); receiptsSavedHere = {}; ledgerInvalidate();`);
  assert.equal(await r.run(`receivingJoinDelivery({ paperId: '${PID}', explicit: true })`), 'joined');
  await allMatchAndSave(r);
  const third = cloudReceipts(r).map(p => p.split('/').pop()).find(x => x !== second);
  assert.ok(third && third !== id, 'נשמרה');
  assert.equal(cloudPaper(r).receivedIn, third);
});
