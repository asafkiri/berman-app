// v147 — המודול local-receiving.js: תעודת משלוח נכנסת לקליטה שמורה אחת בלבד, והענן עצמו מכריע.
// 19.10.2026 אותה תעודה נקלטה פעמיים: הטלפון לא ידע שהיא כבר נקלטה (המאזין לא הביא את השמירה), והשמירה השנייה
// נבדקה רק מול המזהה שלה. מעכשיו בטרנזקציה של השמירה: הנייר בענן אומר באיזו קליטה הוא (receivedIn), וקליטה אחרת
// שעוד קיימת ועוד כוללת אותו — מנצחת. מה שנבדק:
// - שמירה ראשונה מסמנת את הנייר (גם נייר שנוצר באותה שמירה), ושאר השדות שלו לא משתנים.
// - קליטה שנייה עם אותו נייר — 'paper-received' עם הקליטה שכבר כוללת אותו; שום דבר לא נכתב.
// - סימן ישן (הקליטה נמחקה, או כבר לא כוללת את הנייר) — לא עוצר, והסימן עובר.
// - אותה קליטה (צירוף נייר, ניסיון חוזר אחרי תשובה שאבדה) — לא עוצרת את עצמה.
// - נייר שאין בענן, או שנמחק — לא נוצר ולא חוזר בגלל הסימון.
// - שני טלפונים שומרים באותו רגע את אותו נייר בשתי קליטות — רק אחת נשמרת.
// - ניסיון ששמור בטלפון מגרסה קודמת (בלי claims) — נשמר כמו קודם.
// - התשובה מחזירה את מה שנשמר (record), כדי שהאפליקציה תראה אותו לפני שהמאזין מביא אותו.
// 7 מתוך 9 נכשלות על v146 (נייר שאין/שנמחק, וניסיון מגרסה קודמת — שומרות על מה שלא השתנה).
// הרצה: node --test tests/local-receiving-claims-v147.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createCloud, memoryStorage } from './fake-firestore.mjs';

const root = ['artifacts', 'berman-app-classic', 'public', 'data'];
const at = (collection, id) => root.concat(collection, id).join('/');
const PAPER = 'paper_244767903';
const paper = (extra = {}) => ({ id: PAPER, schema: 1, kind: 'delivery', state: 'accepted', number: '244767903', docDay: '2026-10-19', captureId: 'cap-1', rev: 1, rows: [{ itemCode: '101', qty: 12 }], ...extra });
const receiptData = (ids = [PAPER], extra = {}) => ({ timestamp: 100, date: '2026-10-19', items: [{ productId: 'code_101', qty: 12 }], count: 1,
  paperScan: { response: { perDocument: ids.map(paperId => ({ paperId, source: 'paper' })) } }, ...extra });
let sequence = 0;
function phone({ cloud = createCloud(), storage = memoryStorage(), recordId = 'receipt_a', session = recordId } = {}) {
  const context = vm.createContext({ console, JSON, Date, setTimeout, clearTimeout, navigator: { onLine: true }, crypto: { randomUUID: () => 'u' + (++sequence) } });
  vm.runInContext(fs.readFileSync(new URL('../local-receiving.js', import.meta.url), 'utf8'), context);
  const client = cloud.client();
  const state = { fp: 'fp-' + recordId, session };
  const engine = context.LocalReceiving.create({ storage, prefix: 'bm', app: 'berman', db: client.db, fs: client.fs, rootPath: root,
    makeId: () => 'finish_' + (++sequence), deviceName: () => 'phone', appVersion: '147', getFingerprint: () => state.fp, getSession: () => state.session, timeoutMs: 200 });
  const input = { sessionId: session, recordId, data: receiptData(), expected: null, prices: [], extras: [], claims: [PAPER], fingerprint: state.fp };
  return { engine, cloud, client, storage, state, input, finish: (over = {}) => engine.finish({ ...input, ...over }) };
}
const writesNothing = (cloud, before) => assert.deepEqual(cloud.paths(), before, 'שום מסמך לא נוסף');

test('שמירה ראשונה מסמנת את הנייר בקליטה שלה — ושאר השדות שלו לא משתנים', async () => {
  const a = phone();
  a.cloud.put(at('papers', PAPER), paper());
  const res = await a.finish();
  assert.equal(res.ok, true);
  assert.deepEqual(a.cloud.get(at('papers', PAPER)), { ...paper(), receivedIn: 'receipt_a' });
  // מה שנשמר — חוזר לאפליקציה, עם המזהה וה-localFinal שהמאזין יביא
  assert.equal(res.record.id, 'receipt_a');
  assert.deepEqual(res.record, { id: 'receipt_a', ...a.cloud.get(at('receipts', 'receipt_a')) });
  assert.equal(res.expected, null);
});

test('נייר שנוצר באותה שמירה (מהטלפון) — נוצר כבר מסומן', async () => {
  const a = phone();
  const res = await a.finish({ extras: [{ collection: 'papers', id: PAPER, data: paper(), expected: null }, { collection: 'paperScans', id: PAPER, data: { doc: 1 }, expected: null }] });
  assert.equal(res.ok, true);
  assert.equal(a.cloud.get(at('papers', PAPER)).receivedIn, 'receipt_a');
  assert.deepEqual(a.cloud.get(at('paperScans', PAPER)), { doc: 1 });
});

test('קליטה שנייה עם אותו נייר — נדחית בענן, עם הקליטה שכבר כוללת אותו; שום דבר לא נכתב', async () => {
  const cloud = createCloud();
  cloud.put(at('papers', PAPER), paper());
  assert.equal((await phone({ cloud }).finish()).ok, true);
  const markedPaper = cloud.get(at('papers', PAPER)), before = cloud.paths();
  const b = phone({ cloud, recordId: 'receipt_b' });
  const res = await b.finish();
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'paper-received');
  assert.equal(res.paperId, PAPER);
  assert.equal(res.owner.id, 'receipt_a');
  assert.deepEqual(res.owner.paperScan.response.perDocument.map(x => x.paperId), [PAPER]);
  assert.equal(cloud.get(at('receipts', 'receipt_b')), null);
  assert.deepEqual(cloud.get(at('papers', PAPER)), markedPaper);
  writesNothing(cloud, before);
  assert.equal(b.engine.pending(b.input.sessionId), false, 'הניסיון לא נשאר לשליחה חוזרת');
  // גם כשהנייר הוא רק אחד מכמה — כל הקליטה נעצרת
  const c = phone({ cloud, recordId: 'receipt_c' });
  cloud.put(at('papers', 'paper_2'), paper({ id: 'paper_2', number: '2' }));
  assert.equal((await c.finish({ claims: ['paper_2', PAPER], data: receiptData(['paper_2', PAPER]) })).reason, 'paper-received');
  assert.equal(cloud.get(at('papers', 'paper_2')).receivedIn, undefined);
});

test('סימן ישן — הקליטה נמחקה, או כבר לא כוללת את הנייר: לא עוצר, והסימן עובר', async () => {
  const cloud = createCloud();
  cloud.put(at('papers', PAPER), paper({ receivedIn: 'receipt_gone' }));
  assert.equal((await phone({ cloud, recordId: 'receipt_b' }).finish()).ok, true);
  assert.equal(cloud.get(at('papers', PAPER)).receivedIn, 'receipt_b');
  cloud.put(at('receipts', 'receipt_b'), { ...cloud.get(at('receipts', 'receipt_b')), paperScan: { response: { perDocument: [] } } });
  assert.equal((await phone({ cloud, recordId: 'receipt_c' }).finish()).ok, true);
  assert.equal(cloud.get(at('papers', PAPER)).receivedIn, 'receipt_c');
});

test('אותה קליטה לא עוצרת את עצמה: צירוף נייר לקליטה השמורה, וניסיון חוזר אחרי תשובה שאבדה', async () => {
  const cloud = createCloud();
  cloud.put(at('papers', PAPER), paper());
  const first = phone({ cloud });
  cloud.loseReplyAfterCommit = true;
  await first.finish(); // נכתב בענן; התשובה אבדה
  cloud.loseReplyAfterCommit = false;
  assert.equal(cloud.get(at('papers', PAPER)).receivedIn, 'receipt_a');
  const retry = await phone({ cloud, storage: first.storage }).finish(); // אחרי ריענון — אותו ניסיון
  assert.equal(retry.ok, true);
  assert.equal(retry.already, true);
  assert.equal(retry.record.id, 'receipt_a');
  // צירוף: אותו מזהה, מול הגרסה השמורה — הנייר כבר שלה
  const expected = cloud.get(at('receipts', 'receipt_a')), version = cloud._version(at('papers', PAPER));
  const attach = phone({ cloud, session: 'edit_receipt_a' });
  const res = await attach.finish({ expected, data: receiptData([PAPER], { timestamp: 100, noDoc: true }) });
  assert.equal(res.ok, true);
  assert.deepEqual(res.expected, expected, 'הגרסה שלפני הצירוף חוזרת לאפליקציה');
  assert.equal(cloud._version(at('papers', PAPER)), version, 'הנייר לא נכתב שוב');
});

test('נייר שאין בענן, או שנמחק — לא נוצר ולא חוזר בגלל הסימון', async () => {
  const a = phone();
  assert.equal((await a.finish()).ok, true);
  assert.equal(a.cloud.get(at('papers', PAPER)), null);
  const cloud = createCloud();
  cloud.put(at('papers', PAPER), { id: PAPER, deleted: true, state: 'void', receivedIn: 'receipt_x' });
  cloud.put(at('receipts', 'receipt_x'), receiptData());
  assert.equal((await phone({ cloud }).finish()).ok, true, 'נייר שנמחק לסל לא עוצר');
  assert.deepEqual(cloud.get(at('papers', PAPER)), { id: PAPER, deleted: true, state: 'void', receivedIn: 'receipt_x' });
});

test('שני טלפונים שומרים באותו רגע את אותו נייר בשתי קליטות — רק אחת נשמרת', async () => {
  const cloud = createCloud();
  cloud.put(at('papers', PAPER), paper());
  const a = phone({ cloud }), b = phone({ cloud, recordId: 'receipt_b' });
  let release; cloud.commitGate = new Promise(r => { release = r; });
  const pa = a.finish(), pb = b.finish();
  await new Promise(r => setTimeout(r, 5));
  cloud.commitGate = null; release();
  const results = await Promise.all([pa, pb]);
  assert.equal(results.filter(r => r.ok).length, 1);
  const lost = results.find(r => !r.ok);
  assert.equal(lost.reason, 'paper-received');
  assert.equal(cloud.paths('/receipts/').length, 1);
  assert.equal(cloud.get(at('papers', PAPER)).receivedIn, results.find(r => r.ok).record.id);
  assert.equal(cloud.paths('/actionLog/').length, 1);
});

test('ניסיון ששמור בטלפון מגרסה קודמת (בלי claims) — נשמר כמו קודם', async () => {
  const a = phone();
  a.cloud.put(at('papers', PAPER), paper());
  // כך v146 שמרה ניסיון שעוד לא אושר (bm_receiving_final_v1) — בלי claims
  a.storage.setItem('bm_receiving_final_v1', JSON.stringify({ receipt_a: { sessionId: 'receipt_a', recordId: 'receipt_a', data: receiptData(), expected: null,
    prices: [], extras: [], fingerprint: a.state.fp, token: 'finish_v146', deviceName: '', createdAt: 1 } }));
  const res = await a.finish();
  assert.equal(res.ok, true);
  assert.equal(a.cloud.get(at('receipts', 'receipt_a')).localFinal.token, 'finish_v146');
  assert.equal(a.cloud.get(at('papers', PAPER)).receivedIn, undefined, 'בלי claims — בלי סימון');
  // ובלי claims בכלל (קריאה כמו של v146)
  const b = phone({ recordId: 'receipt_b' });
  assert.equal((await b.finish({ claims: undefined })).ok, true);
});

test('נשמר אבל הספירה השתנתה בזמן השמירה (saved-late) — גם אז חוזר מה שנשמר', async () => {
  const a = phone();
  a.cloud.put(at('papers', PAPER), paper());
  let release; a.cloud.commitGate = new Promise(r => { release = r; });
  const pending = a.finish();
  await new Promise(r => setTimeout(r, 5));
  a.state.fp = 'changed-while-saving'; release();
  const res = await pending;
  assert.equal(res.reason, 'saved-late');
  assert.equal(res.saved, true);
  assert.deepEqual(res.record, { id: 'receipt_a', ...a.cloud.get(at('receipts', 'receipt_a')) });
});
