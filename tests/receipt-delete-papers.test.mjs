// v132 — מוחקים קליטה, והיא באמת נמחקת. עד v131 נייר "ת.משלוח" (גם הקטן) שצולם נשאר אחרי ביטול הקליטה או מחיקתה
// כ"צולם ועוד לא נקלט", עם "לקליטה" בלבד — בלי שום דרך להוציא אותו (אסף, 6.10.2026: "אין דרך למחוק אותה לא משנה מה").
// מה שנבדק:
// - הזרימה של אסף: צילום 95141 → "לא הגיע כלום" → שמירה → "מחק תעודה": השאלה אומרת שגם הצילום יימחק; אחרי
//   המחיקה — אין שורה עליו, הוא בסל המחזור (עם תשובת הסריקה), ו"בטל" מחזיר גם את הקליטה וגם את הנייר.
// - ביטול קליטה פתוחה (X): השאלה אומרת שגם הצילום יימחק; אחרי האישור — אין שורה עליו. "ביטול" בשאלה — כלום.
// - נייר שכבר תקוע (הקליטה שלו נמחקה בגרסה קודמת): בשורה האדומה, במאזן, בהיסטוריה ובכרטיס הנייר — "מחק את
//   הצילום"; אחרי אישור — יוצא. כתיבה לענן שנכשלה — הנייר נשאר, לא נעלם רק במכשיר.
// - מה שלא נמחק: נייר שנמצא גם בקליטה שמורה אחרת; נייר זיכוי; נייר שכבר בקליטה שמורה כשמבטלים טיוטה.
// הרצה: node --test tests/receipt-delete-papers.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { app, days, delivery, printed, readPapers } from './one-button-helpers.mjs';

const small = (number = '290095141', d = days(0)) => delivery(number, { internalNumber: null, headerText: 'ת.משלוח', docDate: printed(d) });
const PID = 'paper_290095141';
const json = (r, expr) => JSON.parse(r.run('JSON.stringify(' + expr + ')'));
const settle = async () => { for (let i = 0; i < 30; i++) await new Promise(res => setImmediate(res)); };
// גבולות הענן: מחיקה לסל, טרנזקציה לשחזור, וההודעה עם "בטל"
function cloud(r) {
  r.run(`globalThis.__baseFinalDoc = doc; globalThis.__baseFinalTx = runTransaction; globalThis.doc = (db, ...path) => sharedReceiptFinalizing ? __baseFinalDoc(db,...path) : path.join('/');
    globalThis.getDoc = async () => ({ exists: () => false, data: () => null });
    globalThis.runTransaction = async (db, body) => sharedReceiptFinalizing ? __baseFinalTx(db,body) : body({ get: async () => ({ exists: () => !!globalThis.__cloudPaper, data: () => globalThis.__cloudPaper }),
      set: (ref, v) => testWrites.push({ tx: 'set', ref, v }), delete: ref => testWrites.push({ tx: 'delete', ref }) });
    hardDeleteDocWithBackup = async (name, id, data, reason) => { testWrites.push({ hardDelete: name, id, reason }); if (name === 'receipts') receipts = receipts.filter(x => x.id !== id); return true; };
    showToast = (text, label, cb) => { testToasts.push(text); globalThis.__undo = cb || null; };`);
  return r;
}
const issueTexts = r => json(r, 'openIssuesList().map(x => x.text)');
const stuckLine = r => issueTexts(r).filter(t => /95141/.test(t));
const isDeleted = r => r.run(`!papers.some(p => p.id === '${PID}' && !p.deleted)`);
const trashWrites = r => json(r, `testWrites.filter(w => w.op === 'batch').flatMap(w => w.writes).filter(w => w.path && w.path[w.path.length - 2] === 'trash')`);

// כמו אצל אסף: נייר מלפני יומיים (מהיום — "ממתין", ולא בשורה האדומה)
async function photographed(d = days(-2)) {
  const r = cloud(app(small('290095141', d)));
  await readPapers(r);
  assert.equal(r.run('receiptPaperScanState'), 'ok', 'הנייר הקטן נכנס לקליטה');
  // Simulate the legacy already-uploaded delivery paper whose deletion/undo this suite protects.
  r.run('papers=paperPendingLocal().slice()');
  for (const paper of json(r,'papers')) r.finalCloud.put('artifacts/berman-app-classic/public/data/papers/'+paper.id,paper);
  assert.equal(r.run(`papers.some(p => p.id === '${PID}' && p.kind === 'delivery' && p.small)`), true, 'נשמר בענן כנייר משלוח קטן');
  return r;
}
// "לא הגיע כלום" → בדיקה → סיכום → שמירה; הקליטה השמורה מגיעה מהענן
async function savedNothingArrived(r) {
  r.run(`setView('receiving'); startReceiptQuantityReview('none')`);
  r.run('testConfirms[testConfirms.length - 1].cb()');
  if (!r.run('!!pendingReceipt')) r.click('ai-close-receipt');
  assert.ok(r.run('!!pendingReceipt'), 'סיכום');
  await r.run('confirmReceipt()'); await settle();
  const saved = json(r, `testWrites.filter(w => w.op === 'set' && w.path && w.path[w.path.length - 2] === 'receipts').pop()`);
  assert.ok(saved, 'הקליטה נשמרה');
  r.context.__saved = saved;
  r.run(`receipts = [{ ...__saved.data, id: __saved.path[__saved.path.length - 1] }]; ledgerInvalidate();`);
  assert.equal(r.run(`currentLedger().states['${PID}']`), 'in-receipt');
  assert.equal(r.run('receivingDraftEmpty()'), true);
  return r.run('receipts[0].id');
}

test('הזרימה של אסף: 95141 → "לא הגיע כלום" → שמירה → מחיקה: גם הצילום נמחק, ואין שורה תקועה; "בטל" מחזיר הכל', async () => {
  const r = await photographed();
  const id = await savedNothingArrived(r);
  assert.deepEqual(stuckLine(r), [], 'כל עוד הקליטה שמורה — אין שורה');
  r.click('del-receipt', id);
  const ask = r.run('testConfirms[testConfirms.length - 1]');
  assert.equal(ask.title, 'מחיקת תעודה');
  assert.match(ask.message, /גם הצילום של נייר המשלוח הקטן 95141 .*יימחק \(לסל המחזור\)\./);
  await r.run('testConfirms[testConfirms.length - 1].cb()'); await settle();
  assert.equal(r.run('receipts.length'), 0, 'הקליטה נמחקה');
  assert.equal(isDeleted(r), true, 'גם הנייר');
  assert.deepEqual(stuckLine(r), [], 'בלי "צולם ועוד לא נקלט"');
  assert.notEqual(r.run(`currentLedger().states['${PID}'] || ''`), 'awaiting-receipt');
  const trash = trashWrites(r);
  assert.equal(trash.length, 1, 'לסל המחזור');
  assert.equal(trash[0].data.paperData.paper.id, PID, 'אפשר לשחזר: הנייר עצמו בסל');
  assert.match(r.toasts[r.toasts.length - 1], /התעודה נמחקה, עם הצילום שלה/);
  assert.equal(r.run(`paperFind('${PID}')`), null, 'גם לא מהצילום שבמכשיר');
  // "בטל" — הקליטה וגם הנייר חוזרים
  await r.run('__undo()'); await settle();
  assert.ok(json(r, `testWrites.some(w => w.op === 'set' && w.path && w.path[w.path.length - 2] === 'receipts' && w.path[w.path.length - 1] === '${id}')`), 'הקליטה שוחזרה');
  assert.equal(r.run(`papers.some(p => p.id === '${PID}' && !p.deleted && p.kind === 'delivery')`), true, 'הנייר שוחזר');
  assert.ok(json(r, `testWrites.some(w => w.tx === 'delete' && /\\/trash\\//.test(w.ref))`), 'ורשומת הסל יצאה');
});

test('ביטול קליטה פתוחה (X): השאלה אומרת שגם הצילום יימחק; אחרי האישור — אין שורה תקועה. "ביטול" בשאלה — כלום', async () => {
  const r = await photographed();
  r.run(`setView('receiving')`);
  r.click('rc-cancel');
  const ask = r.run('testConfirms[testConfirms.length - 1]');
  assert.equal(ask.title, 'ביטול תעודה');
  assert.match(ask.message, /^לבטל את התעודה הנוכחית\? כל הפריטים שנסרקו יימחקו, וגם הצילום של נייר המשלוח הקטן 95141 .*\(לסל המחזור — אפשר לשחזר\)\.$/);
  // לא אישר — שום דבר לא זז
  assert.equal(isDeleted(r), false); assert.equal(r.run('receiptPaperScanState'), 'ok');
  r.run('testConfirms[testConfirms.length - 1].cb()'); await settle();
  assert.equal(r.run('receivingDraftEmpty()'), true, 'הקליטה בוטלה');
  assert.equal(isDeleted(r), true, 'וגם הנייר שלה');
  assert.deepEqual(stuckLine(r), [], 'בלי "צולם ועוד לא נקלט"');
  assert.equal(trashWrites(r).length, 1);
  // כרטיס הצילום במסך הניירות — לא ריק
  assert.match(r.run('paperIntakeItemHtml(paperIntake.items[0])'), /הצילום נמחק/);
});

test('נייר שכבר תקוע: "מחק את הצילום" בשורה האדומה, במאזן, בהיסטוריה ובכרטיס — ואחרי האישור הוא יוצא', async () => {
  const r = await photographed();
  // הקליטה בוטלה בגרסה קודמת (בלי למחוק את הנייר) — המצב שבצילום המסך של אסף
  r.run(`receiptList = []; receiptNotes = []; receiptOpened = false; resetAiInvoiceScan(); aiScanDocuments = []; receiptPaperScanState = ''; receiptDraftId = null; saveReceiptDraft(); ledgerInvalidate();`);
  assert.equal(r.run(`currentLedger().states['${PID}']`), 'awaiting-receipt');
  assert.equal(stuckLine(r).length, 1);
  assert.match(stuckLine(r)[0], /נייר המשלוח הקטן 95141 .*צולם ועוד לא נקלט/);
  const actions = json(r, `openIssuesList().find(x => /95141/.test(x.text)).actions.map(a => a.role + ':' + a.label)`);
  assert.deepEqual(actions, ['ledger-start-receiving:לקליטה', 'ledger-paper-delete:מחק את הצילום']);
  r.run(`setView('receiving')`);
  assert.match(r.node('app').innerHTML, new RegExp('data-role="ledger-paper-delete"[^>]*data-paper="' + PID + '"[^>]*>מחק את הצילום<'));
  r.run(`setView('ledger')`);
  assert.match(r.node('app').innerHTML, /data-role="ledger-paper-delete"/, 'במסך המאזן');
  const card = r.run(`paperCardInHistory(paperFind('${PID}').paper, fullLedger(), ledgerAllPapers(fullLedger()), true)`);
  assert.match(card, /data-role="ledger-paper-delete"[^>]*>.*מחק את הצילום/, 'בכרטיס בהיסטוריה');
  assert.match(r.run('paperIntakeItemHtml(paperIntake.items[0])'), /data-role="ledger-paper-delete"/, 'בכרטיס במסך הניירות');
  // כתיבה לענן שנכשלה — הנייר נשאר (לא נעלם רק בטלפון הזה)
  r.run(`globalThis.__realTask = runCloudTask; runCloudTask = async () => false;`);
  r.run(`paperUiClick({ dataset: { role: 'ledger-paper-delete', paper: '${PID}' } })`);
  assert.equal(r.run('testConfirms[testConfirms.length - 1].title'), 'למחוק את הצילום?');
  assert.match(r.run('testConfirms[testConfirms.length - 1].message'), /נייר המשלוח הקטן 95141 .*יוצא מהרשימה ולא יחכה לקליטה\. אפשר לשחזר אותו מסל המחזור\./);
  await r.run('testConfirms[testConfirms.length - 1].cb()'); await settle();
  assert.equal(isDeleted(r), false, 'נכשל — נשאר');
  assert.ok(r.run(`!!paperFind('${PID}')`), 'גם הצילום במכשיר לא סומן כנמחק');
  assert.equal(stuckLine(r).length, 1);
  // עכשיו בהצלחה
  r.run(`runCloudTask = globalThis.__realTask;`);
  r.run(`paperUiClick({ dataset: { role: 'ledger-paper-delete', paper: '${PID}' } })`);
  await r.run('testConfirms[testConfirms.length - 1].cb()'); await settle();
  assert.equal(isDeleted(r), true);
  assert.deepEqual(stuckLine(r), []);
  assert.equal(trashWrites(r).length, 1);
  assert.equal(r.run('currentView'), 'ledger', 'נשארים במסך');
  assert.doesNotMatch(r.node('app').innerHTML, /95141/);
});

test('מה שלא נמחק: נייר שנמצא גם בקליטה שמורה אחרת, נייר זיכוי, ונייר שכבר בקליטה שמורה כשמבטלים טיוטה', async () => {
  const r = await photographed();
  const id = await savedNothingArrived(r);
  // אותה תעודה נקלטה פעמיים בטעות — מוחקים את הכפולה: הנייר שייך גם לשנייה
  r.run(`receipts = receipts.concat([{ ...receipts[0], id: 'rc_twin' }]); ledgerInvalidate();`);
  assert.deepEqual(json(r, `receiptOwnDeliveryPapers(receipts.find(x => x.id === '${id}')).map(p => p.id)`), []);
  r.click('del-receipt', id);
  assert.doesNotMatch(r.run('testConfirms[testConfirms.length - 1].message'), /צילום/);
  await r.run('testConfirms[testConfirms.length - 1].cb()'); await settle();
  assert.equal(isDeleted(r), false, 'הנייר נשאר — הוא בקליטה השנייה');
  assert.equal(trashWrites(r).length, 0);
  // נייר זיכוי לא נוגע לקליטות — לא נמחק איתן
  r.run(`papers = papers.concat([{ schema: 1, id: 'paper_cr', kind: 'credit', state: 'accepted', number: '290095142', docDay: '${days(0).toLocaleDateString('en-CA')}', rows: [] }]); ledgerInvalidate();`);
  r.context.__twin = 1;
  assert.deepEqual(json(r, `receiptOwnDeliveryPapers({ ...receipts[0], id: 'other', paperDocs: [{ number: '290095142' }] }).map(p => p.id)`), [], 'לא נייר זיכוי');
  // טיוטה שהנייר שלה כבר בקליטה שמורה — הביטול לא מוחק אותו
  r.run(`receiptDraftDeliveryPapers = receiptDraftDeliveryPapers;`);
  assert.equal(r.run(`paperInSavedReceipt(paperFind('${PID}').paper)`), true);
  r.run(`aiScanResponse = { perDocument: [{ paperId: '${PID}' }], scan: { documents: [] } };`);
  assert.deepEqual(json(r, 'receiptDraftDeliveryPapers().map(p => p.id)'), []);
});
