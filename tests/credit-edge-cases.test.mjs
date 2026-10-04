// v123 — מקרי קצה מהסקירה השנייה של שלב 5 (על התיקונים עצמם).
// • זיכוי כספי ישן (לפני v123) לצד זיכוי ביחידות: כלל אחד לסגירת התעודה, להצעה בחלון
//   "התקבל בזיכוי" ולמרכזת — קודם היחידות (מפורשות לפי מוצר), ואז הכסף לפי סדר השורות
//   על מה שנשאר, בסיבולת של 5 אגורות ליחידה מהחוסר המקורי של השורה.
// • קישור חזרות→חזרות במרכזת: רק רישום ביחידות; קישור ישן (עם סכום) כמו לפני v123.
// • זהות מוצר: שורה מועברת נושאת קוד מהקטלוג; ברקוד משותף לכמה מוצרים אינו מזהה לבדו.
// • עורך: פיצול מארז בתעודה מאומתת שומר את הזיכוי של כל שורה; שורה בכמות 0 עם זיכוי
//   (זיכוי ביתר) אינה "החזרה" בניתוח ובשליחה חוזרת; ביטול העברה לפי חוסר שנשאר.
// הרצה: node --test tests/credit-edge-cases.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './receipt-scan-harness.mjs';

const j = (rt, expr) => JSON.parse(rt.run('JSON.stringify(' + expr + ')'));
function receiptRt(rc) {
  const rt = runtime();
  rt.context.rc = rc;
  rt.run(`products.push({ id: 'pA', code: '9101', name: 'מוצר א', barcode: 'bA', price: 10 }, { id: 'pE', code: '9105', name: 'מוצר ה', barcode: 'bE', price: 10.962 });
    receipts = [rc]; returns = []; receiptHistoryFilter = 'all'; currentView = 'receiptsHistory';`);
  return rt;
}
const line = (pid, name, short, price) => ({ productId: pid, name, qty: 0, noteQty: short, unitPrice: price });

test('legacy money up to 5 agorot short per unit covers it: the receipt is closed and the month counts it, by the same rule', () => {
  const rt = receiptRt({ id: 'rc1', date: '2026-09-02', docDate: '2026-09-02', status: 'open', items: [line('pA', 'מוצר א', 1, 10)], shortCreditNotes: [{ amount: 9.96, at: 1 }] });
  assert.equal(rt.run('receiptDiscrepancyInfo(receipts[0]).open'), false);
  assert.deepEqual(j(rt, 'receiptOpenShortUnits(receipts[0])'), {});
  assert.equal(rt.run("receiptCreditedShortUnits(receipts[0], '2026-09-02').pA"), 1);
  assert.equal(rt.run("rangeProductMatrixData({ recs: receipts, rets: [] }).list.find(r => r.pid === 'pA').openUnits"), 0);
});

test('legacy money 10 agorot short on one unit: the receipt is open, the button offers that unit, and crediting it closes it', async () => {
  const rt = receiptRt({ id: 'rc1', date: '2026-09-02', docDate: '2026-09-02', status: 'open', items: [line('pA', 'מוצר א', 1, 10)], shortCreditNotes: [{ amount: 9.90, at: 1 }] });
  assert.equal(rt.run('receiptDiscrepancyInfo(receipts[0]).open'), true);
  assert.equal(rt.run("rangeProductMatrixData({ recs: receipts, rets: [] }).list.find(r => r.pid === 'pA').openUnits"), 1, 'the month agrees: still open');
  assert.deepEqual(j(rt, 'receiptOpenShortUnits(receipts[0])'), { pA: 1 }, 'never an open receipt with nothing to credit');
  rt.run('renderReceiptsHistory()');
  assert.match(rt.node('app').innerHTML, /התקבל בזיכוי \(1 יח׳\)/);
  rt.run("openShortCreditPrompt('rc1')");
  assert.equal(rt.run('shortCreditPick.lines.length'), 1);
  await rt.run('confirmShortCredit()');
  assert.equal(rt.run('receiptDiscrepancyInfo(receipts[0]).open'), false);
  assert.match(rt.toasts.at(-1), /החוסר נסגר בזיכוי/);
});

test('legacy money that covered one unit of five: crediting the 4 offered units closes the receipt, and the month counts 5', async () => {
  const rt = receiptRt({ id: 'rc1', date: '2026-09-02', docDate: '2026-09-02', status: 'open', items: [line('pE', 'מוצר ה', 5, 10.962)], shortCreditNotes: [{ amount: 10.90, at: 1 }] });
  assert.deepEqual(j(rt, 'receiptOpenShortUnits(receipts[0])'), { pE: 4 });
  rt.run('renderReceiptsHistory()');
  assert.match(rt.node('app').innerHTML, /התקבל בזיכוי \(4 יח׳\)/, 'the button counts what is open, not the whole shortage');
  rt.run("openShortCreditPrompt('rc1')");
  assert.deepEqual(j(rt, 'shortCreditPick.lines.map(x => x.qty)'), [4]);
  await rt.run('confirmShortCredit()');
  assert.equal(rt.run('receiptDiscrepancyInfo(receipts[0]).open'), false, 'no phantom unit reopens');
  assert.deepEqual(j(rt, 'receiptOpenShortUnits(receipts[0])'), {});
  assert.equal(rt.run("receiptCreditedShortUnits(receipts[0], '2026-09-02').pE"), 5, 'the month: 1 in money + 4 in units');
  assert.equal(rt.run("rangeProductMatrixData({ recs: receipts, rets: [] }).list.find(r => r.pid === 'pE').openUnits"), 0);
});

test('two lines, legacy money for two units: the toast after a partial unit credit counts only what is still open', async () => {
  const rt = receiptRt({ id: 'rc1', date: '2026-09-02', docDate: '2026-09-02', status: 'open',
    items: [line('pA', 'מוצר א', 3, 10), { ...line('pE', 'מוצר ה', 2, 10) }], shortCreditNotes: [{ amount: 20, at: 1 }] });
  assert.deepEqual(j(rt, 'receiptOpenShortUnits(receipts[0])'), { pA: 1, pE: 2 });
  rt.run("openShortCreditPrompt('rc1'); shortCreditStep(1, -2);");
  await rt.run('confirmShortCredit()');
  assert.match(rt.toasts.at(-1), /נותרו 2 יח׳ חסרות/);
});

test('matrix: a legacy money-era return link is not counted (as before v123); a v123 link is, once', () => {
  const rt = runtime();
  const T = { docDate: '2026-09-02', credited: true, creditStatus: 'open', items: [{ productId: 'code_101', name: 'אחיד פרוס ברמן', barcode: '497112', qty: 2, noteQty: 0 }] };
  // ישן: השורה של S זוכתה 5 על 3 שהוחזרו, והעודף הכספי שויך ל-T
  rt.context.legacy = [T, { docDate: '2026-09-09', credited: true, creditStatus: 'open', items: [{ productId: 'code_101', name: 'אחיד פרוס ברמן', qty: 3, noteQty: 5 }],
    creditAllocations: [{ targetType: 'return', returnId: 'T', amount: 11.48, items: [{ rowIndex: 0, name: 'אחיד פרוס ברמן', barcode: '497112', price: 5.74, qty: 2 }] }] }];
  const old = j(rt, "rangeProductMatrixData({ recs: [], rets: legacy }).list.find(r => r.pid === 'code_101')");
  assert.deepEqual([old.sent, old.credited], [5, 5], 'the over-credited line already carries the 2 units');
  // חדש: הקישור נושא מוצר וכמות בלי סכום
  rt.context.fresh = [T, { docDate: '2026-09-09', credited: true, creditStatus: 'ok', items: [{ productId: 'code_349', name: 'x', qty: 1 }],
    creditAllocations: [{ targetType: 'return', returnId: 'T', items: [{ rowIndex: 0, productId: 'code_101', code: '101', name: 'אחיד פרוס ברמן', barcode: '497112', qty: 2 }] }] }];
  const now = j(rt, "rangeProductMatrixData({ recs: [], rets: fresh }).list.find(r => r.pid === 'code_101')");
  assert.deepEqual([now.sent, now.credited, now.openUnits], [2, 2, 0]);
  // רק תעודת הזיכוי בטווח, והשורה ידנית — נספרת ומסומנת "ללא מחיר"
  rt.context.only = [{ docDate: '2026-09-03', credited: true, items: [{ productId: 'code_349', name: 'x', qty: 1 }],
    creditAllocations: [{ targetType: 'return', returnId: 'T0', items: [{ rowIndex: 0, productId: 'manual_1', name: 'לחמניה משקית', qty: 3 }] }] }];
  const m = j(rt, "rangeProductMatrixData({ recs: [], rets: only }).list.find(r => r.pid === 'manual_1')");
  assert.deepEqual([m.credited, m.unpriced], [3, true]);
});

test('identity: a carried row takes its code from the catalog, and a shared barcode alone never matches different products', () => {
  const rt = runtime();
  const doc = { id: 'r', credited: true, creditStatus: 'open', items: [{ productId: 'code_101', name: 'אחיד פרוס ברמן', barcode: '497112', qty: 2, noteQty: 0 }] };
  rt.context.doc = doc;
  assert.equal(rt.run('retCarryPlan(doc).items[0].code'), '101', 'the line had no code; the catalog has one');
  rt.run(`products.push({ id: 's1', code: '8001', name: 'המבורגר', barcode: '4033569' }, { id: 's2', code: '8002', name: 'ביס עננים', barcode: '4033569' }, { id: 's3', code: '8003', name: 'יחיד', barcode: 'uniq' });`);
  assert.equal(rt.run(`creditLineSameProduct({ productId: 's2', code: '8002', name: 'ביס עננים', barcode: '4033569' }, { productId: 'carry_1', code: '', name: 'המבורגר', barcode: '4033569' })`), false);
  assert.equal(rt.run(`creditLineSameProduct({ productId: 's1', code: '8001', name: 'המבורגר', barcode: '4033569' }, { productId: 'carry_1', code: '', name: 'המבורגר', barcode: '4033569' })`), true);
  assert.equal(rt.run(`creditLineSameProduct({ productId: 's3', code: '8003', name: 'יחיד', barcode: 'uniq' }, { productId: 'carry_2', name: 'שם ישן', barcode: 'uniq' })`), true, 'a unique barcode still matches a renamed line');
});

function editRt(d) {
  const rt = runtime();
  rt.context.testDoc = d;
  rt.run(`products.push({ id: 'pack6', code: '1016', name: 'מארז 6 אחיד', barcode: '1016', price: 30 });
    const p = products.find(x => x.id === 'code_101'); p.billingPackId = 'pack6'; p.billingPackSize = 6;
    returns = [testDoc]; receipts = []; returnsList = []; returnsSlots = { weekly: returnsList, daily: [] }; returnsSlot = 'weekly';
    currentView = 'receiptsHistory'; openReturnItemsEdit('r1');`);
  return rt;
}
const verified = (items, extra) => ({ id: 'r1', date: '2026-10-01', docDate: '2026-10-01', timestamp: 1, credited: true, creditStatus: 'ok', items, ...(extra || {}) });
const saved = rt => rt.writes.filter(w => w.op === 'update' && w.data && w.data.items).pop().data;

test('editor: lines from a pack split keep the credit fixed at split time', async () => {
  // (1) פיצול ואז העלאת המארז — חוסר בזיכוי, לא "זוכה" בשקט
  const a = editRt(verified([{ productId: 'code_101', name: 'אחיד פרוס ברמן', barcode: '497112', qty: 12 }, { productId: 'code_401', name: 'פיתות', qty: 2 }]));
  a.run(`retEditConvertPack(0); retEditStepQty(0, 3);`);
  await a.run('saveReturnItemsEdit()');
  assert.deepEqual([saved(a).items[0].productId, saved(a).items[0].qty, saved(a).items[0].noteQty, saved(a).creditStatus], ['pack6', 5, 2, 'open']);
  // (2) שורה מהפיצול שהשתנתה אינה מוצעת לפיצול נוסף
  const b = editRt(verified([{ productId: 'code_101', name: 'אחיד פרוס ברמן', barcode: '497112', qty: 13 }]));
  b.run(`retEditConvertPack(0); retEditStepQty(1, 6);`);
  assert.equal(b.run('retEditPackInfo(1)'), null);
  // (3) מחיקת שורת מארז שזוכתה — נשארת בכמות 0 עם הזיכוי
  const c = editRt(verified([{ productId: 'code_101', name: 'אחיד פרוס ברמן', barcode: '497112', qty: 12 }, { productId: 'code_401', name: 'פיתות', qty: 2 }]));
  c.run(`retEditConvertPack(0); retEditRemove(0);`);
  await c.run('saveReturnItemsEdit({ skipDropped: true })');
  assert.deepEqual([saved(c).items[0].productId, saved(c).items[0].qty, saved(c).items[0].noteQty, saved(c).creditStatus], ['pack6', 0, 2, 'open']);
  assert.ok(saved(c).items.every(l => !('creditedQty' in l)), 'editor-only fields are not saved');
});

test('editor: removing the carried short line leaves over-credit only — the carry is taken back', async () => {
  const rt = editRt(verified([{ productId: 'code_101', name: 'אחיד פרוס ברמן', barcode: '497112', qty: 5, noteQty: 3 }, { productId: 'code_401', name: 'פיתות', qty: 2 }],
    { creditStatus: 'open', carriedNotes: [{ productId: 'code_101', name: 'אחיד פרוס ברמן', barcode: '497112', qty: 2, at: 1 }] }));
  rt.run(`returnsList.push({ productId: 'carry_9', name: 'אחיד פרוס ברמן', barcode: '497112', qty: 2, manual: true, carried: true, carriedFrom: 'r1' }); returnsSlots.weekly = returnsList;`);
  rt.run('retEditRemove(0)');
  await rt.run('saveReturnItemsEdit({ skipDropped: true })');
  assert.equal(saved(rt).creditStatus, 'open', 'over-credit keeps the document open');
  assert.deepEqual(rt.writes[rt.writes.length - 1].data, { carriedNotes: [] }, 'but the carry is undone');
  assert.equal(rt.run('returnsList.length'), 0);
});

test('a line kept at qty 0 is not a return: analytics, resend and the card line count skip it', () => {
  const rt = runtime();
  rt.context.rets = [
    { id: 'a', docDate: '2026-09-29', date: '2026-09-29', timestamp: 1, credited: true, creditStatus: 'ok', items: [{ productId: 'code_101', name: 'אחיד פרוס ברמן', qty: 4 }] },
    { id: 'b', docDate: '2026-10-01', date: '2026-10-01', timestamp: 2, credited: true, creditStatus: 'open', sentTo: 'הנהג',
      items: [{ productId: 'code_101', name: 'אחיד פרוס ברמן', qty: 0, noteQty: 3 }, { productId: 'code_401', name: 'פיתות', code: '401', qty: 2 }] }];
  rt.run('returns = rets;');
  // anBuildWeeks מחזיר Map של שבועות, ובכל שבוע Map של שורות מוצר
  const last = j(rt, `(() => { const out = []; anBuildWeeks([], rets, products).forEach(w => w.prod.forEach(r => { if (r.lastRet) out.push([r.name, r.lastRet.d, r.lastRet.qty]); })); return out; })()`);
  assert.ok(last.length > 0, 'the analytics saw the returns');
  assert.ok(last.every(x => x[2] > 0), 'no "last returned 0 units": ' + JSON.stringify(last));
  assert.ok(last.some(x => x[1] === '2026-09-29' && x[2] === 4), 'the real last return of 101 stays 29.9 × 4');
  rt.run('openReturnsResend(rets[1])');
  assert.deepEqual(j(rt, 'sendCtx.items.map(i => [i.name, i.qty])'), [['פיתות', 2]]);
  assert.match(rt.run('returnCardInReceipts(rets[1])'), /2 יח׳ · 1 שורות/);
  assert.match(rt.run('returnCardInReceipts(rets[1])'), /זוכה 3/, 'the over-credited row is still shown');
});
