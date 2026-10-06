// v136 — קליטה בטלפון (בלי סנכרון בלייב), גיבוי שקט לענן ו"המשך אותה כאן" בטלפון אחר. אסף, 6.10.2026: "טלפון אחד,
// אבל לפעמים סתם עוברים מטלפון אחד לשני"; הסנכרון בלייב תקע את הקליטה שוב ושוב ("סיוט").
// שני טלפונים אמיתיים (האפליקציה כולה) על ענן מדומה אחד. מה שנבדק:
// - ברירת המחדל: טלפון אחד — עורכים תמיד, בלי לחכות לענן.
// - הקליטה הפתוחה מגובה למסמך אחד בענן (בלי תמונות, בלי סיכום פתוח), עם מספר התעודה ומה שנספר.
// - בטלפון השני: "יש קליטה פתוחה … המשך אותה כאן" → אותה קליטה (אותו מזהה, אותם עוגנים, אותה קריאה, אותה ספירה).
// - הטלפון הראשון: "ממשיכה בטלפון אחר" + "החזר אותה לכאן"; לא שומר אותה במקביל ולא דורס את הגיבוי.
// - סיום בטלפון השני: התעודה נשמרת (במזהה של הקליטה), הגיבוי נסגר; בראשון — "כבר נשמרה" + "נקה" (בלי למחוק ניירות).
// - "החזר אותה לכאן" — הספירה העדכנית מהטלפון השני חוזרת.
// - קליטה אחרת פתוחה בטלפון השני — שואלים, והיא נשמרת בצד (לא נמחקת).
// - הענן תקוע — לא עוצר כלום: עורכים ושומרים; השורה העליונה אומרת שהגיבוי מתעכב.
// - קריאה שרצה בטלפון הראשון לא "תקועה" בשני.
// הרצה: node --test tests/receiving-handoff.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { app, days, delivery, printed, readPapers } from './one-button-helpers.mjs';

const json = (r, expr) => JSON.parse(r.run('JSON.stringify(' + expr + ')'));
const settle = async () => { for (let i = 0; i < 40; i++) await new Promise(res => setImmediate(res)); };
const small = (number = '290095141') => delivery(number, { internalNumber: null, headerText: 'ת.משלוח', docDate: printed(days(0)) });
// ענן מדומה אחד לשני הטלפונים: setDoc / onSnapshot / doc — מה שמודול הגיבוי משתמש בו
function makeCloud() {
  const docs = new Map(), listeners = new Map();
  const cloud = {
    docs, hang: false,
    async set(path, value) {
      if (cloud.hang) return new Promise(() => {});
      docs.set(path, JSON.parse(JSON.stringify(value)));
      for (const fn of listeners.get(path) || []) setImmediate(() => fn(docs.get(path)));
    },
    listen(path, fn) { if (!listeners.has(path)) listeners.set(path, new Set()); listeners.get(path).add(fn); setImmediate(() => fn(docs.get(path) ?? null)); return () => listeners.get(path).delete(fn); }
  };
  return cloud;
}
function phone(cloud, name, paper = small()) {
  const r = app(paper);
  r.context.__cloud = cloud;
  r.run(`globalThis.doc = (db, ...p) => p.join('/');
    globalThis.setDoc = (path, value) => __cloud.set(path, value);
    globalThis.onSnapshot = (path, cb) => __cloud.listen(path, v => cb({ exists: () => v != null, data: () => v == null ? null : JSON.parse(JSON.stringify(v)) }));
    deviceName = ${JSON.stringify(name)}; currentView = 'receiving'; mainMode = 'receiving';
    startReceivingHandoff();`);
  return r;
}
const handoff = cloud => { const k = [...cloud.docs.keys()].find(x => x.endsWith('/drafts/receiving_handoff')); return k ? cloud.docs.get(k) : null; };
// השורה העליונה מוצגת במסך הקליטה — שם רואים אותה
const banner = r => { r.run(`currentView = 'receiving'; renderSharedReceivingBanner()`); return r.node('sharedReceivingBanner').innerHTML; };
const bannerClick = async (r, action) => { await r.events.get('sharedReceivingBanner:click')({ target: { closest: sel => sel === '[data-shared-receiving]' ? { dataset: { sharedReceiving: action } } : null } }); await settle(); };
const receiptSaves = r => json(r, `testWrites.filter(w => w.op === 'set' && w.path && w.path[w.path.length - 2] === 'receipts')`);
async function startOnA(cloud) {
  const a = phone(cloud, 'טלפון א');
  await readPapers(a); await settle();
  await a.run('receivingHandoffSaveNow()'); await settle();
  return a;
}

test('ברירת המחדל: טלפון אחד — עורכים תמיד, בלי לחכות לענן; הקליטה מגובה למסמך אחד (בלי תמונות ובלי סיכום פתוח)', async () => {
  const cloud = makeCloud();
  const a = phone(cloud, 'טלפון א');
  assert.equal(a.run('sharedReceivingOff'), true, 'ברירת המחדל');
  assert.equal(a.run('canEditSharedReceipt()'), true);
  await readPapers(a); await settle();
  a.run(`pendingReceipt = { lines: [] }; aiScanDocuments = [{ noteIndex: 0, pages: [{ dataUrl: 'data:image/jpeg;base64,' + 'x'.repeat(5000) }] }];`);
  await a.run('receivingHandoffSaveNow()'); await settle();
  const h = handoff(cloud);
  assert.ok(h, 'גובה');
  assert.equal(h.closed, false); assert.equal(h.deviceName, 'טלפון א'); assert.equal(h.draftId, a.run('receiptDraftId'));
  assert.deepEqual(h.summary.docs, ['290095141']); assert.equal(h.summary.paperUnits, 30);
  const p = JSON.parse(h.payload);
  assert.equal(p.state.pendingReceipt, null, 'בלי סיכום פתוח');
  assert.ok(p.state.aiScanDocuments.every(d => d.pages.length === 0), 'בלי תמונות');
  assert.equal(p.state.receiptNotes[0].units, 30);
  assert.match(banner(a), /הקליטה מגובה בענן/);
});

test('בטלפון השני: "המשך אותה כאן" — אותה קליטה; הראשון: "ממשיכה בטלפון אחר", לא שומר במקביל ולא דורס', async () => {
  const cloud = makeCloud();
  const a = await startOnA(cloud);
  a.run(`receiptList = [{ productId: products[0].id, name: products[0].name, barcode: products[0].barcode, qty: 3 }]; saveReceiptDraft();`);
  await a.run('receivingHandoffSaveNow()'); await settle();
  const b = phone(cloud, 'טלפון ב'); await settle();
  let bb = banner(b);
  assert.match(bb, /יש קליטה פתוחה בטלפון "טלפון א"/);
  assert.match(bb, /תעודה 290095141/); assert.match(bb, /30 יח׳ בנייר/); assert.match(bb, /נספרו 3 יח׳ ב-1 שורות/);
  assert.match(bb, /data-shared-receiving="handoff-take"[^>]*>המשך אותה כאן/);
  await bannerClick(b, 'handoff-take');
  assert.equal(b.run('receiptDraftId'), a.run('receiptDraftId'), 'אותה קליטה');
  assert.deepEqual(json(b, 'receiptList.map(l => l.qty)'), [3]);
  assert.deepEqual(json(b, 'receiptNotes.map(n => [n.units, n.lines])'), [[30, 5]]);
  assert.deepEqual(json(b, 'aiScanResponse.perDocument.map(d => d.paperId)'), ['paper_290095141']);
  assert.equal(b.run('receiptPaperScanState'), 'ok');
  assert.equal(b.requests.length, 0, 'בלי קריאה בתשלום');
  await settle();
  assert.equal(handoff(cloud).deviceName, 'טלפון ב', 'השני מחזיק בה עכשיו');
  // הראשון
  await settle();
  const ab = banner(a);
  assert.match(ab, /הקליטה הזאת ממשיכה בטלפון "טלפון ב"/);
  assert.match(ab, /data-shared-receiving="handoff-take"[^>]*>החזר אותה לכאן/);
  assert.equal(a.run('receivingHandoffAway()'), 'moved');
  // לא דורס את הגיבוי
  a.run(`receiptList[0].qty = 9; saveReceiptDraft();`);
  await a.run('receivingHandoffSaveNow()'); await settle();
  assert.equal(handoff(cloud).deviceName, 'טלפון ב');
  // לא שומר אותה במקביל
  a.run(`startReceiptQuantityReview('none'); testConfirms[testConfirms.length - 1].cb();`);
  if (!a.run('!!pendingReceipt')) a.click('ai-close-receipt');
  await a.run('confirmReceipt()'); await settle();
  assert.deepEqual(receiptSaves(a), [], 'לא נשמרה בטלפון הראשון');
  assert.match(a.toasts.join(' | '), /ממשיכה בטלפון אחר/);
});

test('סיום בטלפון השני: נשמרת במזהה של הקליטה והגיבוי נסגר; בראשון — "כבר נשמרה" ו"נקה" (בלי למחוק ניירות)', async () => {
  const cloud = makeCloud();
  const a = await startOnA(cloud);
  const draftId = a.run('receiptDraftId');
  const b = phone(cloud, 'טלפון ב'); await settle();
  await bannerClick(b, 'handoff-take');
  b.run(`startReceiptQuantityReview('none'); testConfirms[testConfirms.length - 1].cb();`); await settle();
  const saved = receiptSaves(b);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].path[saved[0].path.length - 1], draftId, 'במזהה של הקליטה');
  b.callbacks.splice(0).forEach(fn => { try { fn(); } catch (e) {} });
  await b.run('receivingHandoffSaveNow()'); await settle();
  assert.equal(handoff(cloud).closed, true, 'הגיבוי נסגר');
  await settle();
  const ab = banner(a);
  assert.match(ab, /הקליטה הזאת כבר נשמרה/);
  await bannerClick(a, 'handoff-drop');
  a.run('testConfirms[testConfirms.length - 1].cb()'); await settle();
  assert.equal(a.run('receivingDraftEmpty()'), true, 'העותק הישן נוקה');
  assert.deepEqual(json(a, `testWrites.filter(w => w.op === 'batch' && w.writes.some(x => x.path && x.path.includes('trash')))`), [], 'בלי למחוק ניירות');
  assert.equal(banner(a), '', 'ושום דבר לא נשאר בשורה');
});

test('"החזר אותה לכאן" — הספירה העדכנית מהטלפון השני חוזרת, והשני יודע', async () => {
  const cloud = makeCloud();
  const a = await startOnA(cloud);
  const b = phone(cloud, 'טלפון ב'); await settle();
  await bannerClick(b, 'handoff-take');
  b.run(`receiptList = [{ productId: products[1].id, name: products[1].name, barcode: products[1].barcode, qty: 7 }]; saveReceiptDraft();`);
  await b.run('receivingHandoffSaveNow()'); await settle();
  await bannerClick(a, 'handoff-take');
  assert.deepEqual(json(a, 'receiptList.map(l => l.qty)'), [7], 'הספירה מהשני');
  await settle();
  assert.equal(handoff(cloud).deviceName, 'טלפון א');
  assert.equal(b.run('receivingHandoffAway()'), 'moved');
});

test('קליטה אחרת פתוחה בטלפון השני — שואלים, והיא נשמרת בצד (לא נמחקת)', async () => {
  const cloud = makeCloud();
  const a = await startOnA(cloud);
  const b = phone(cloud, 'טלפון ב', delivery('77001234'));
  await readPapers(b); await settle();
  const bDraft = b.run('receiptDraftId');
  assert.notEqual(bDraft, a.run('receiptDraftId'));
  // הגיבוי בענן הוא עדיין של א (ב עוד לא כתב) — ההצעה מופיעה
  b.context.__h = handoff(cloud); b.run('receivingHandoffRemote = JSON.parse(JSON.stringify(__h))');
  assert.match(banner(b), /המשך אותה כאן/);
  await bannerClick(b, 'handoff-take');
  assert.equal(b.run('testConfirms[testConfirms.length - 1].title'), 'להחליף את הקליטה שפתוחה כאן?');
  assert.equal(b.run('receiptDraftId'), bDraft, 'לפני האישור — כלום');
  b.run('testConfirms[testConfirms.length - 1].cb()'); await settle();
  assert.equal(b.run('receiptDraftId'), a.run('receiptDraftId'));
  const kept = JSON.parse(b.storage.get('bm_receipt_before_handoff'));
  assert.equal(kept.payload.state.receiptDraftId, bDraft, 'הקליטה הקודמת נשמרה בצד');
});

test('הענן תקוע — לא עוצר כלום: עורכים ושומרים; השורה העליונה אומרת שהגיבוי מתעכב', async () => {
  const cloud = makeCloud(); cloud.hang = true;
  const a = phone(cloud, 'טלפון א');
  await readPapers(a); await settle();
  const pending = a.run('receivingHandoffSaveNow()');
  assert.match(banner(a), /מגבה לענן/);
  assert.equal(a.run('canEditSharedReceipt()'), true, 'עורכים');
  a.run(`startReceiptQuantityReview('none'); testConfirms[testConfirms.length - 1].cb();`); await settle();
  assert.equal(receiptSaves(a).length, 1, 'התעודה נשמרה');
  // הזמן הקצוב של הגיבוי עבר
  a.callbacks.splice(0).forEach(fn => { try { fn(); } catch (e) {} });
  await pending; await settle();
  assert.equal(a.run('receivingHandoffStatus'), 'failed');
});

test('קריאה שרצה בטלפון הראשון לא "תקועה" בשני: בלי קריאה — "צלם שוב או הקלד"; עם קריאה — העוגנים ממנה', async () => {
  const cloud = makeCloud();
  const a = phone(cloud, 'טלפון א');
  a.run(`receiptOpened = true; receiptEntryMode = 'photo'; aiScanBusy = true; receiptPaperScanState = 'running'; aiScanProgressText = 'קורא…'; saveReceiptDraft();`);
  await a.run('receivingHandoffSaveNow()'); await settle();
  const b = phone(cloud, 'טלפון ב'); await settle();
  await bannerClick(b, 'handoff-take');
  assert.equal(b.run('aiScanBusy'), false);
  assert.equal(b.run('receiptPaperScanState'), 'failed');
  assert.match(b.run('receiptPaperScanProblems[0]'), /לא הסתיימה בטלפון השני/);
  assert.equal(b.requests.length, 0);
});
