// v137 — מקרי קצה בחיבור לברמן: צירוף נייר פעמיים (כל צירוף מושב משלו), ביטול צירוף סוגר את המושב,
// "המשך" בזמן קריאה בתשלום — נדחה, ושמירה שהתשובה שלה אבדה — "בודק…" ואז השרת מכריע.
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
function phone(cloud, name, paper = small(), opts = {}) {
  const client = cloud.client({ cache: opts.cache });
  const r = app(paper, { storage: opts.storage });
  r.client = client; r.context.__fs = client.fs;
  r.run(`for (const k of ['doc', 'collection', 'query', 'where', 'onSnapshot', 'runTransaction', 'getDocFromServer']) globalThis[k] = __fs[k];
    deviceName = ${JSON.stringify(name)}; currentView = 'receiving'; mainMode = 'receiving';`);
  if (!opts.noStart) r.run('startSharedReceiving()');
  return r;
}
const sync = async r => { r.run('draftHandoff.retry()'); await settle(); };

async function saveFirst(cloud) {
  const a = phone(cloud, 'טלפון א');
  await readPapers(a); await settle(); await sync(a);
  const id = a.run('receiptDraftId');
  a.run(`startReceiptQuantityReview('none'); testConfirms[testConfirms.length - 1].cb();`); await settle(); await settle();
  assert.ok(record(cloud, id), 'first save');
  const rec = record(cloud, id); rec.items = rec.items.map(l => ({ ...l, qty: l.noteQty || 1 }));
  cloud.put(ROOT + 'receipts/' + id, rec); // e.g. counted lines (as a normal saved receipt has)
  return { a, id };
}
async function attachOnce(a, cloud, id, tag) {
  // the receipts listener would deliver the saved record
  a.context.__rec = { id, ...record(cloud, id) };
  a.run(`receipts = [__rec]; reopenReceiptForDoc(${JSON.stringify(id)});
    receiptEntryMode = 'manual'; receiptOpened = true;
    receiptNotes = [{ amount: 100, units: 30, lines: 5, kind: 'charge', tag: ${JSON.stringify(tag)} }]; recomputeNoteTotal(); saveReceiptDraft();`);
  const sid = a.run('receiptAttachTarget.sessionId');
  await sync(a);
  a.run('finishReceipt()');
  assert.ok(a.run('!!pendingReceipt'), 'summary ready');
  await a.run('confirmReceipt()'); await settle();
  return sid;
}

test('KA1 attach paper to a saved receipt (module path) — twice in a row, each its own session', async () => {
  const cloud = createCloud();
  const { a, id } = await saveFirst(cloud);
  const s1 = await attachOnce(a, cloud, id, 'one');
  assert.ok(s1 && s1.startsWith('edit_' + id + '_'), 'own session id: ' + s1);
  assert.equal(a.run('!!receiptAttachTarget'), false, 'attach finished: ' + a.toasts.slice(-2).join(' | '));
  assert.equal(handoffDoc(cloud, s1).state, 'saved');
  assert.equal(record(cloud, id).savedBy.sessionId, s1);
  const s2 = await attachOnce(a, cloud, id, 'two');
  assert.notEqual(s2, s1);
  assert.equal(a.run('!!receiptAttachTarget'), false, 'second attach finished: ' + a.toasts.slice(-2).join(' | '));
  assert.equal(record(cloud, id).savedBy.sessionId, s2);
});

test('KA2 canceling an attach closes its cloud session (no lingering "המשך אותה כאן" on another phone)', async () => {
  const cloud = createCloud();
  const { a, id } = await saveFirst(cloud);
  a.context.__rec = { id, ...record(cloud, id) };
  a.run(`receipts = [__rec]; reopenReceiptForDoc(${JSON.stringify(id)}); receiptEntryMode = 'manual'; receiptOpened = true; saveReceiptDraft();`);
  const sid = a.run('receiptAttachTarget.sessionId');
  await sync(a);
  assert.equal(handoffDoc(cloud, sid).state, 'open');
  a.run('cancelReceiptAttach()'); await settle(); await sync(a);
  assert.equal(handoffDoc(cloud, sid).state, 'canceled');
});

test('KA3 "המשך" בזמן שקריאה בתשלום רצה בטלפון השני — נדחה לפי השרת; בלי בקשה, בלי שינוי', async () => {
  const cloud = createCloud();
  const a = phone(cloud, 'טלפון א');
  await readPapers(a); await settle();
  a.run(`aiScanBusy = true; receiptPaperScanState = 'running'; saveReceiptDraft();`);
  await sync(a);
  const sid = a.run('receiptDraftId');
  assert.equal(handoffDoc(cloud, sid).scanRunning, true);
  const b = phone(cloud, 'טלפון ב'); await settle();
  const r = await b.run(`draftHandoff.take(${JSON.stringify(sid)})`); await settle();
  assert.equal(r.ok, false); assert.equal(r.reason, 'scan-running');
  assert.equal(b.run('receivingDraftEmpty()'), true, 'שום דבר לא השתנה');
  assert.equal(handoffDoc(cloud, sid).deviceName, 'טלפון א');
  assert.equal(b.requests.length, 0, 'no paid request');
});

test('KA4 app: save whose reply is lost — "בודק…", read-only, then the server decides: saved once, draft closed, normal after-save', async () => {
  const cloud = createCloud();
  const a = phone(cloud, 'טלפון א');
  await readPapers(a); await settle(); await sync(a);
  const id = a.run('receiptDraftId');
  cloud.loseReplyAfterCommit = true;
  a.run(`startReceiptQuantityReview('none'); testConfirms[testConfirms.length - 1].cb();`); await settle(); await settle();
  cloud.loseReplyAfterCommit = false;
  assert.match(a.toasts.join(' | '), /בודק אם התעודה נשמרה/);
  assert.equal(a.run('canEditSharedReceipt()'), false, 'read-only while checking');
  assert.ok(record(cloud, id), 'written on the server');
  const n = cloud.transactions;
  // the harness collects timers; run the ones the module set (grace, cap) a few rounds
  for (let round = 0; round < 4; round++) { const cbs = a.callbacks.splice(0); for (const fn of cbs) { try { await fn(); } catch (e) {} } await settle(); }
  assert.equal(a.run('receivingDraftEmpty()'), true, 'closed after the server said saved: ' + a.toasts.slice(-2).join(' | '));
  assert.match(a.toasts.join(' | '), /התעודה נקלטה ✓/);
  assert.equal(a.run('currentView'), 'receiptsHistory');
  assert.equal(cloud.transactions - n <= 1, true);
});
