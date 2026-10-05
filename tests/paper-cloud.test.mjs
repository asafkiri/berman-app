// v125 — ניירות מהנהג מול ענן אמיתי-למחצה: Firestore מדומה בזיכרון שמריץ את הטרנזקציות,
// האצוות והעדכונים של האפליקציה כמו שהם (runCloudTask, executePaperCreateTask, מחיקה לסל).
// מה שנבדק: אישור הענן שלא חזר לא גורם לעותק ישן לדרוס בדיקה ממכשיר אחר, ולא מחזיר נייר
// שנמחק; מחיקה של צילום שכבר בענן מוציאה גם את העותק שם; שחזור מהסל מחליף את מצבת המחיקה;
// תיקון מספר מוציא את העותק במספר הקודם; מספר שכבר נשמר בענן לא משתנה בשקט; תעודת משלוח
// שצולמה פעמיים לא הופכת להתנגשות; צילום מתנגש לא "מאושר" בלי לתקן מספר; כרטיס ההחזרה
// מראה נייר שמחכה לבדיקה במקום להזמין צילום נוסף בתשלום.
// הרצה: node --test tests/paper-cloud.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runtime, fixture } from './receipt-scan-harness.mjs';

const L = JSON.parse(fs.readFileSync(new URL('./ledger-2026-10.json', import.meta.url), 'utf8'));
const R1004 = 'returns_43eb7cdd-5e32-4524-aa86-b87ca8e88650';
const tick = async (n = 30) => { for (let i = 0; i < n; i++) await new Promise(res => setImmediate(res)); };

function makeCloud() {
  const store = new Map(), phones = [];
  const c = { store, phones, dropReply: 0 };
  const read = ref => { const v = store.get(ref.path); return { id: ref.id, exists: () => v !== undefined, data: () => v === undefined ? undefined : structuredClone(v) }; };
  const commit = ops => {
    for (const o of ops) {
      if (o.t === 'set') store.set(o.ref.path, structuredClone(o.d));
      else if (o.t === 'update') { if (!store.has(o.ref.path)) throw Object.assign(new Error('not-found'), { code: 'not-found' }); store.set(o.ref.path, { ...store.get(o.ref.path), ...structuredClone(o.d) }); }
      else store.delete(o.ref.path);
    }
    phones.forEach(r => r.run('papers = __cloudPapers(); ledgerInvalidate();')); // כמו המאזין על papers
  };
  const under = name => [...store.entries()].filter(([k]) => k.split('/').slice(-2, -1)[0] === name).map(([k, v]) => ({ id: k.split('/').pop(), ...structuredClone(v) }));
  c.papers = () => under('papers');
  c.trash = () => under('trash');
  c.scans = () => under('paperScans');
  c.globals = {
    doc: (_db, ...seg) => ({ path: seg.join('/'), id: seg[seg.length - 1] }),
    getDoc: async ref => read(ref),
    setDoc: async (ref, d) => commit([{ t: 'set', ref, d }]),
    updateDoc: async (ref, d) => commit([{ t: 'update', ref, d }]),
    deleteDoc: async ref => commit([{ t: 'delete', ref }]),
    writeBatch: () => { const ops = []; const b = { set(ref, d) { ops.push({ t: 'set', ref, d }); return b; }, update(ref, d) { ops.push({ t: 'update', ref, d }); return b; }, delete(ref) { ops.push({ t: 'delete', ref }); return b; }, commit: async () => commit(ops) }; return b; },
    runTransaction: async (_db, fn) => {
      const ops = [];
      const tx = { get: async ref => read(ref), set(ref, d) { ops.push({ t: 'set', ref, d }); return tx; }, update(ref, d) { ops.push({ t: 'update', ref, d }); return tx; }, delete(ref) { ops.push({ t: 'delete', ref }); return tx; } };
      const out = await fn(tx);
      commit(ops);
      // הכתיבה הגיעה לשרת, והתשובה לא חזרה לטלפון
      if (c.dropReply > 0) { c.dropReply--; throw Object.assign(new Error('client is offline'), { code: 'unavailable' }); }
      return out;
    },
    __cloudPapers: () => under('papers')
  };
  return c;
}
const rowOf = (i, barcode, itemCode, quantity) => ({ sourcePage: 1, lineNumber: i + 1, barcode, itemCode, description: 'x' + itemCode, quantity, unitPriceExVat: 1, confidence: 0.98 });
function scan(doc) {
  return { ok: true, serviceVersion: 7, model: 'fixture', requestId: 'req', reads: [{ model: 'a' }, { model: 'b' }], usage: null,
    verification: { version: 1, status: 'agreed', primaryReads: 2, escalationAttempted: false, reasons: [], issues: [], readCount: 2 },
    scan: { warnings: [], documents: [{ noteIndex: 0, pageCount: 1, confidence: 0.98, warnings: [], otherPapersVisible: false, notDriverStrip: false, ...doc }] } };
}
// 290095142: מודפס 17 יח׳ / 4 שורות. q0=13 נסגר; q0=12 — "לבדיקה"
const CREDIT = (q0, number = '290095142') => ({ docNumber: number, docType: 'credit', docDate: '04/10/2026', totalUnits: 17, printedLines: 4, headerText: 'ת.משלוח החזרה יבש',
  internalNumber: null, numerator: '95142', printedCheck: 147, rows: [rowOf(0, '497112', '101', q0), rowOf(1, '497297', '233', 1), rowOf(2, '498034', '344', 2), rowOf(3, '497204', '238', 1)] });
const DELIVERY = q1 => ({ docNumber: '244739999', docType: 'invoice', docDate: '06/10/2026', totalUnits: 38, printedLines: 2, headerText: 'תעודת משלוח', internalNumber: 'N290096000',
  numerator: null, printedCheck: null, rows: [rowOf(0, null, '101', 20), rowOf(1, null, '238', q1)] });

function phone(cloud, resp, opts = {}) {
  const data = { ...fixture(), paper: resp, products: L.products };
  let next = resp;
  const r = runtime({ data, storage: opts.storage || new Map(), realCloudTasks: true,
    globals: { ...cloud.globals, fetch: async () => ({ ok: true, status: 200, json: async () => structuredClone(next) }) } });
  r.setResp = v => { next = v; };
  r.run(`products = testData.products; returns = ${JSON.stringify(opts.returns || L.returns)}; receipts = ${JSON.stringify(L.receipts)};
    papers = __cloudPapers(); showConfirm = (t, m, b, fn) => { globalThis.__confirm = m; return fn(); };`);
  cloud.phones.push(r);
  return r;
}
const local = r => JSON.parse(r.storage.get('bm_paper_results_v1') || '{}');
async function read(r, n = 1, forReturnId = '', cap = 'cap') {
  r.run(`openPaperIntake({ forReturnId: ${JSON.stringify(forReturnId)} }); paperIntake.items = Array.from({ length: ${n} }, (_, i) => ({ captureId: ${JSON.stringify(cap)} + i, hash: 'h' + i + Math.random(),
    page: { dataUrl: 'data:x' + i, baseDataUrl: 'data:x' + i, rotation: 0, orientationConfirmed: true }, status: 'photo', forReturnId: ${JSON.stringify(forReturnId)} }));`);
  await r.run('paperIntakeRun()'); await tick();
}

test('אישור הענן לא חזר: הצילום הישן לא דורס בדיקה ממכשיר אחר', async () => {
  const cloud = makeCloud();
  const A = phone(cloud, scan(CREDIT(12)));
  cloud.dropReply = 1;
  await read(A);
  assert.ok(!local(A).cap0.ackedAt, 'במכשיר: עוד לא אושר');
  assert.equal(cloud.papers()[0].state, 'needs-review');
  const B = phone(cloud, scan(CREDIT(12)));
  await B.run(`openPaperReview('paper_290095142')`);
  B.run(`paperReview.paper.rows[0].qty = 13; paperReview.units = '17'; paperReview.lines = '4'; paperReview.checked = true;`);
  await B.run('savePaperReview()');
  assert.equal(cloud.papers()[0].state, 'accepted');
  await A.run('paperFlushPending()');
  const p = cloud.papers()[0];
  assert.equal(p.state, 'accepted', 'האישור מ-B נשאר'); assert.equal(p.rows[0].qty, 13);
  assert.ok(local(A).cap0.ackedAt, 'A מסמן שנשלח, בלי לדרוס');
});

test('נייר שנמחק לסל לא חוזר מצילום ישן שהאישור שלו לא חזר; שחזור מהסל מחליף את מצבת המחיקה', async () => {
  const cloud = makeCloud();
  const A = phone(cloud, scan(CREDIT(13)));
  cloud.dropReply = 1;
  await read(A);
  const B = phone(cloud, scan(CREDIT(13)));
  await B.run(`openPaperReview('paper_290095142')`);
  await B.run('deletePaperFromReview()'); await tick();
  assert.equal(cloud.papers()[0].deleted, true, 'במקום הנייר — מצבת מחיקה');
  assert.equal(cloud.trash().length, 1);
  await A.run('paperFlushPending()');
  assert.equal(cloud.papers()[0].deleted, true, 'הנייר לא נכתב מחדש');
  assert.ok(local(A).cap0.discarded && local(A).cap0.ackedAt);
  assert.equal(A.run(`currentLedger().states['paper_290095142'] || null`), null, 'לא במאזן');
  // שחזור מהסל: המצבת מוחלפת בנייר
  const t = cloud.trash()[0];
  B.run(`trash = [${JSON.stringify({ ...t, trashId: t.id })}];`);
  await B.run(`restoreTrashItem(${JSON.stringify(t.id)})`); await tick();
  const p = cloud.papers()[0];
  assert.ok(!p.deleted && p.state === 'accepted', 'הנייר חזר');
  assert.equal(cloud.trash().length, 0);
});

test('מחיקה בטלפון שצילם, כשהצילום כבר הגיע לענן אבל האישור לא חזר — יוצא גם מהענן', async () => {
  const cloud = makeCloud();
  const A = phone(cloud, scan(CREDIT(12)));
  cloud.dropReply = 1;
  await read(A);
  await A.run(`openPaperReview('paper_290095142', 'cap0')`);
  assert.equal(A.run('paperReview.local'), true);
  await A.run('deletePaperFromReview()'); await tick();
  assert.match(A.run('globalThis.__confirm'), /סל המחזור/, 'לא "עוד לא נשמר בענן"');
  assert.equal(cloud.papers()[0].deleted, true);
  assert.equal(cloud.trash().length, 1);
  await A.run('paperFlushPending()');
  assert.equal(cloud.papers()[0].deleted, true);
});

test('תיקון מספר של צילום שכבר הגיע לענן במספר השגוי — העותק במספר הקודם יוצא', async () => {
  const cloud = makeCloud();
  const A = phone(cloud, scan(CREDIT(12, '290095112')));
  cloud.dropReply = 1;
  await read(A);
  assert.deepEqual(cloud.papers().map(p => p.id), ['paper_290095112']);
  await A.run(`openPaperReview('paper_290095112', 'cap0')`);
  A.run(`paperUiInput({ id: 'reviewNumber', value: '290095142', getAttribute: () => null, dataset: {} });
    paperReview.paper.rows[0].qty = 13; paperReview.units = '17'; paperReview.lines = '4'; paperReview.checked = true;`);
  await A.run('savePaperReview()'); await tick(60);
  await A.run('paperFlushPending()'); await tick();
  assert.deepEqual(cloud.papers().map(p => p.id), ['paper_290095142']);
  assert.equal(cloud.papers()[0].state, 'accepted');
  assert.deepEqual(local(A).cap0.dropIds, []);
});

test('מספר שכבר נשמר בענן — לא משתנה בשקט; ההודעה אומרת זאת', async () => {
  const cloud = makeCloud();
  const A = phone(cloud, scan(CREDIT(12, '290095112')));
  A.run('globalThis.__hold = true; const _f = paperFlushPending; paperFlushPending = async () => { if (globalThis.__hold) return null; return _f(); };');
  await read(A);
  await A.run(`openPaperReview('paper_290095112', 'cap0')`);
  A.run('globalThis.__hold = false;');
  await A.run('paperFlushPending()');
  assert.ok(local(A).cap0.ackedAt, 'נשלח בזמן שהבדיקה פתוחה');
  A.run(`paperReview.paper.number = '290095142'; paperReview.paper.rows[0].qty = 13; paperReview.units = '17'; paperReview.lines = '4'; paperReview.checked = true;`);
  await A.run('savePaperReview()'); await tick();
  assert.ok(A.toasts.some(t => /המספר כבר נשמר בענן/.test(t)), A.toasts.join(' | '));
  assert.deepEqual(cloud.papers().map(p => [p.id, p.state]), [['paper_290095112', 'accepted']]);
});

test('תעודת משלוח שצולמה פעמיים ונקראה קצת אחרת — לא התנגשות, השמורה נשארת', async () => {
  const cloud = makeCloud();
  const A = phone(cloud, scan(DELIVERY(18)));
  await read(A);
  A.setResp(scan(DELIVERY(17)));
  A.run(`openPaperIntake({}); paperIntake.items = [{ captureId: 'capB', hash: 'hB', page: { dataUrl: 'data:y', baseDataUrl: 'data:y', rotation: 0, orientationConfirmed: true }, status: 'photo' }];`);
  await A.run('paperIntakeRun()'); await tick();
  const rec = local(A).capB;
  assert.ok(!rec.conflict && rec.discarded && rec.outcome === 'duplicate');
  assert.equal(A.run('paperLocalConflicts().length'), 0);
  assert.deepEqual(cloud.papers().map(p => p.rows[1].qty), [18]);
});

test('צילום שמתנגש עם נייר שמור: "אשר" חסום עד שמתקנים את המספר; כרטיס ההחזרה מראה נייר שמחכה לבדיקה', async () => {
  const cloud = makeCloud();
  const B = phone(cloud, scan(CREDIT(13)));
  await read(B, 1, '', 'capB');
  const A = phone(cloud, scan(CREDIT(5)));
  await read(A);
  assert.ok(local(A).cap0.conflict);
  await A.run(`openPaperReview('paper_290095142', 'cap0')`);
  A.run(`paperReview.units = '9'; paperReview.lines = '4'; paperReview.checked = true;`);
  assert.equal(A.run('paperReviewState().conflictBlocked'), true);
  assert.equal(A.run('paperReviewState().ok'), false);
  A.run(`paperUiInput({ id: 'reviewNumber', value: '290095143', getAttribute: () => null, dataset: {} })`);
  assert.equal(A.run('paperReviewState().ok'), true, 'מספר אחר — אפשר לאשר');
  // כרטיס ההחזרה: נייר זיכוי שצולם ממנו ומחכה לבדיקה — במקום כפתור צילום כחול
  const C = phone(makeCloud(), scan(CREDIT(12)), { returns: L.returns.map(r => r.id === R1004 ? { ...r, credited: false } : r) });
  await read(C, 1, R1004);
  const html = C.run(`retVerifyRowHtml(returns.find(r => r.id === ${JSON.stringify(R1004)}))`);
  assert.match(html, /מחכה לבדיקה שלך/);
  assert.match(html, /data-role="ledger-paper-open"/);
});

// ===== סבב סקירה שלישי =====
test('מחיקה מהעותק שבענן בטלפון שצילם: אותה תמונה נקראת שוב (המשתמש ביקש), והתמונה לא נשמרת לנצח', async () => {
  const cloud = makeCloud();
  const A = phone(cloud, scan(CREDIT(13)));
  A.run(`openPaperIntake({}); paperIntake.items = [{ captureId: 'cap0', hash: 'same-photo', page: { dataUrl: 'data:x', baseDataUrl: 'data:x', rotation: 0, orientationConfirmed: true }, status: 'photo' }];`);
  await A.run('paperIntakeRun()'); await tick();
  assert.ok(local(A).cap0.ackedAt);
  await A.run(`openPaperReview('paper_290095142')`);
  assert.equal(A.run('paperReview.local'), false);
  await A.run('deletePaperFromReview()'); await tick();
  assert.equal(cloud.papers()[0].deleted, true);
  assert.equal(local(A).cap0.discarded, true, 'גם הרשומה של הצילום במכשיר');
  assert.equal(A.run(`paperByHash('same-photo')`), null, 'אותה תמונה — תיקרא שוב');
  assert.equal(A.run(`papers.some(p => p.id === 'paper_290095142' && p.deleted && p.captureId === 'cap0') ? 'skip' : 'keep'`), 'skip', 'תמונה של נייר שנמחק — לא נשמרת בגיזום');
});

test('צילום נוסף של נייר שעוד "לבדיקה" — לא נאמר שהוא נספר', async () => {
  const cloud = makeCloud();
  const A = phone(cloud, scan(CREDIT(12)));
  await read(A, 1, '', 'c1');
  await read(A, 1, '', 'c2');
  assert.equal(local(A).c20.outcome, 'duplicate');
  const card = A.run(`paperIntakeItemHtml(paperIntake.items[0])`);
  assert.doesNotMatch(card, /נספר פעם אחת/);
  assert.match(card, /צילום נוסף של נייר שכבר נשמר — לא נקרא עד הסוף/);
});

test('ההתנגשות נעלמת כשהנייר השמור נמחק; "החלף" לא שולח לסל את סימן המחיקה; רשומת סל של סימן מחיקה לא "משוחזרת"', async () => {
  const cloud = makeCloud();
  const B = phone(cloud, scan(CREDIT(13)));
  await read(B, 1, '', 'capB');
  const A = phone(cloud, scan(CREDIT(5)));
  await read(A, 1, '', 'capA');
  assert.ok(local(A).capA0.conflict);
  await B.run(`openPaperReview('paper_290095142')`);
  await B.run('deletePaperFromReview()'); await tick();
  A.run('papers = __cloudPapers(); paperClearStaleConflicts();'); // המאזין
  await A.run('paperFlushPending()'); await tick(); // הסנכרון שהניקוי מתזמן
  assert.equal(A.run('paperLocalConflicts().length'), 0);
  assert.equal(cloud.papers()[0].captureId, 'capA0', 'הצילום החדש נשמר במקום סימן המחיקה');
  assert.equal(cloud.trash().length, 1, 'רק הנייר שנמחק — לא סימן המחיקה');
  B.run(`trash = [${JSON.stringify({ trashId: 'junk', collectionName: 'papers', originalId: 'paper_290095142', data: null, paperData: { paper: { id: 'paper_290095142', deleted: true, state: 'void', rows: [] } } })}];`);
  await B.run(`restoreTrashItem('junk')`);
  assert.ok(B.toasts.some(t => /אין מה לשחזר/.test(t)));
});

test('נייר שהסוג שלו לא נקרא — בלי כמויות עד שבוחרים סוג; "תעודת משלוח" נשארת בלי כמויות', async () => {
  const cloud = makeCloud();
  const kindless = { ...DELIVERY(18), docType: 'unknown', headerText: null, internalNumber: null };
  const A = phone(cloud, scan(kindless));
  await read(A);
  const id = cloud.papers()[0].id;
  await A.run(`openPaperReview(${JSON.stringify(id)})`);
  assert.equal(A.run('paperReview.paper.kind'), null);
  assert.doesNotMatch(A.node('app').innerHTML, /data-role="review-qty"/);
  A.run(`paperUiClick({ dataset: { role: 'review-kind', kind: 'delivery' } })`);
  assert.doesNotMatch(A.node('app').innerHTML, /data-role="review-qty"/);
  A.run(`paperUiClick({ dataset: { role: 'review-kind', kind: 'credit' } })`);
  assert.match(A.node('app').innerHTML, /data-role="review-qty"/);
});

test('"ביטול תשובה" נרשם ביומן עם התשובה שבוטלה', async () => {
  const cloud = makeCloud();
  const A = phone(cloud, scan(CREDIT(13)));
  await A.run(`saveLedgerDeclaration('decl_done_x', { declare: 'complete', returnId: ${JSON.stringify(R1004)} })`); await tick();
  await A.run(`undoLedgerDeclaration('decl_done_x')`); await tick();
  const log = [...cloud.store.entries()].filter(([k]) => k.includes('/actionLog/')).map(([, v]) => v);
  const undo = log.find(v => v.title === 'ביטול תשובה במאזן');
  assert.ok(undo); assert.match(undo.details, /אישרת שאין עוד תעודת זיכוי להחזרה מ-4\.10/);
});
