// v133 — "לא הגיע כלום" סוגר את הקליטה. עד v132 אחרי "לא הגיע כלום" ← אישור, האפליקציה שלחה למסך ההבדלים
// ("יש הבדלים מול הנייר · חוסר 13 · חוסר 2 · קלוט את התעודה") ואחריו לסיכום — אותה שאלה פעמיים (אסף, 6.10.2026:
// "המסך הזה מיותר, אישרתי שלא הגיע כלום — סגור את הקליטה וזהו").
// מה שנבדק:
// - מסך הניירות ומסך הקליטה: "לא הגיע כלום" ← "לא הגיע כלום — שמור" ← הקליטה נשמרת: כל שורה 0 התקבלו מול מה
//   שבנייר, בלי מסך ההבדלים ובלי הסיכום, בלי קריאה נוספת; ההודעה אומרת מה במאזן.
// - "ביטול" בשאלה — כלום לא נשמר ולא השתנה.
// - שאלה אמיתית בדרך (התעודה כבר נקלטה) — נעצרים בה, לא נשמר לבד.
// - השמירה נכשלה (אין חיבור) — הסיכום נשאר פתוח עם "שמור", כלום לא אבד.
// הרצה: node --test tests/none-arrived-closes.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { app, days, delivery, printed, readPapers } from './one-button-helpers.mjs';

const small = (number = '290095141', d = days(0)) => delivery(number, { internalNumber: null, headerText: 'ת.משלוח', docDate: printed(d) });
const json = (r, expr) => JSON.parse(r.run('JSON.stringify(' + expr + ')'));
const settle = async () => { for (let i = 0; i < 40; i++) await new Promise(res => setImmediate(res)); };
const savedReceipts = r => json(r, `testWrites.filter(w => w.op === 'set' && w.path && w.path[w.path.length - 2] === 'receipts').map(w => w.data)`);

async function smallInReceiving(paper = small()) {
  const r = app(paper);
  await readPapers(r);
  assert.equal(r.run('receiptPaperScanState'), 'ok');
  return r;
}
function assertSavedNothingArrived(r, paperRows, requestsBefore) {
  const saved = savedReceipts(r);
  assert.equal(saved.length, 1, 'הקליטה נשמרה — פעם אחת');
  const items = saved[0].items.map(l => [l.productId, l.qty, l.noteQty]).sort();
  assert.deepEqual(items, paperRows.map(x => [x.productId, 0, x.paperQty]).sort(), 'כל שורה: 0 התקבלו מול מה שבנייר');
  assert.equal(saved[0].quantityCheck.method, 'manual');
  assert.ok(saved[0].paperDocs.some(d => d.number === '290095141'), 'עם מספר הנייר');
  assert.notEqual(r.run('currentView'), 'reconcile', 'בלי מסך ההבדלים');
  assert.equal(r.run('pendingReceipt'), null, 'בלי הסיכום');
  assert.ok(r.node('receiptSummaryModal').classList.contains('hidden'), 'הסיכום לא נשאר פתוח');
  assert.equal(r.run('receivingDraftEmpty()'), true, 'הקליטה נסגרה');
  assert.match(r.toasts[r.toasts.length - 1], /^התעודה נקלטה ✓ · /);
  assert.equal(r.requests.length, requestsBefore, 'בלי קריאה בתשלום');
}

test('מסך הניירות: "לא הגיע כלום" ← "לא הגיע כלום — שמור" ← הקליטה נשמרת, בלי מסך ההבדלים ובלי הסיכום', async () => {
  const r = await smallInReceiving();
  const rows = json(r, 'receiptQuantityPaperRows()'), before = r.requests.length;
  r.run('renderPaperIntake()');
  r.click('paper-none-arrived');
  const ask = r.run('testConfirms[testConfirms.length - 1]');
  assert.equal(ask.title, 'לא הגיע כלום?');
  assert.match(ask.message, /^כל השורות שבתעודה \(290095141\) יירשמו כחוסר \(0 התקבלו\), והקליטה תישמר\./);
  assert.equal(ask.label, 'לא הגיע כלום — שמור');
  assert.deepEqual(savedReceipts(r), [], 'כלום לא נשמר לפני האישור');
  r.run('testConfirms[testConfirms.length - 1].cb()'); await settle();
  assertSavedNothingArrived(r, rows, before);
});

test('מסך הקליטה: אותו דבר — וגם כשכבר נספר משהו (השאלה אומרת שהספירה תימחק)', async () => {
  const r = await smallInReceiving();
  const rows = json(r, 'receiptQuantityPaperRows()'), before = r.requests.length;
  r.run(`receiptList = [{ productId: products[0].id, name: products[0].name, barcode: products[0].barcode, qty: 2 }]; saveReceiptDraft(); setView('receiving')`);
  r.click('rc-quantity-none');
  assert.match(r.run('testConfirms[testConfirms.length - 1].message'), /^שים לב: כבר נספרו 2 יח׳ — הספירה תימחק\. כל השורות שבתעודה \(290095141\) יירשמו כחוסר \(0 התקבלו\), והקליטה תישמר\./);
  r.run('testConfirms[testConfirms.length - 1].cb()'); await settle();
  assertSavedNothingArrived(r, rows, before);
});

test('"ביטול" בשאלה — כלום לא נשמר ולא השתנה', async () => {
  const r = await smallInReceiving();
  r.run(`setView('receiving')`);
  r.click('rc-quantity-none');
  // לא נלחץ "לא הגיע כלום — שמור"
  await settle();
  assert.deepEqual(savedReceipts(r), []);
  assert.deepEqual(json(r, 'receiptList'), []);
  assert.equal(r.run('receiptCountingMode'), 'scan');
  assert.equal(r.run('receiptQuantityReview'), null);
});

test('שאלה אמיתית בדרך (התעודה כבר נקלטה) — נעצרים בה, לא נשמר לבד', async () => {
  const r = await smallInReceiving();
  // אותו נייר כבר בקליטה שמורה
  r.run(`receipts = [{ id: 'rc_prev', date: '${days(-1).toLocaleDateString('en-CA')}', timestamp: 1, paperDocs: [{ number: '290095141' }], items: [{ productId: products[0].id, qty: 1 }] }]; ledgerInvalidate(); setView('receiving')`);
  r.click('rc-quantity-none');
  r.run('testConfirms[testConfirms.length - 1].cb()'); await settle();
  assert.equal(r.run('testConfirms[testConfirms.length - 1].title'), 'התעודה כבר נקלטה', 'השאלה על הכפילות');
  assert.deepEqual(savedReceipts(r), [], 'לא נשמר לבד');
});

test('השמירה נכשלה (אין חיבור) — הסיכום נשאר פתוח עם "שמור", והכמויות במקום', async () => {
  const r = await smallInReceiving();
  r.run(`finishSharedReceipt = async () => false; setView('receiving')`);
  r.click('rc-quantity-none');
  r.run('testConfirms[testConfirms.length - 1].cb()'); await settle();
  assert.ok(r.run('!!pendingReceipt'), 'הסיכום מחכה');
  assert.equal(r.node('receiptSummaryModal').classList.contains('hidden'), false, 'פתוח, עם "שמור"');
  assert.ok(json(r, 'receiptList').every(l => l.qty === 0) && r.run('receiptList.length') > 0, 'הכמויות במקום');
  assert.equal(r.run('receivingDraftEmpty()'), false, 'הקליטה לא נמחקה');
});

test('השמירה האוטומטית רק כשההבדלים הם חוסרים בלבד — עודף, שורה שלא נקראה, מוצר לא מוכר או קריאה לא תקינה: נעצרים', async () => {
  const r = app(small());
  const only = ev => r.run('aiScanOnlyShortages(' + JSON.stringify(ev) + ')');
  const base = { valid: true, findings: [{ type: 'shortage', qty: 13 }, { type: 'shortage', qty: 2 }], residuals: [], barcodeSuggestions: [] };
  assert.equal(only(base), true);
  assert.equal(only({ ...base, findings: base.findings.concat([{ type: 'surplus', qty: 1 }]) }), false, 'עודף');
  assert.equal(only({ ...base, residuals: [{}] }), false, 'שורה שלא נקראה');
  assert.equal(only({ ...base, barcodeSuggestions: [{ unknownProduct: true }] }), false, 'מוצר לא מוכר');
  assert.equal(only({ ...base, valid: false }), false, 'קריאה לא תקינה');
  assert.equal(only({ ...base, findings: [] }), false, 'אין חוסר — זה לא "לא הגיע כלום"');
  assert.equal(only({ ...base, findings: base.findings.concat([{ type: 'price' }]) }), true, 'ממצא כסף אינו עניין של הקליטה');
});
