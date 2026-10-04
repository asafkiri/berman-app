// v123 — תעודת חזרות חדשה היא כמויות בלבד.
// השליחה, השמירה בלי שליחה, שורה ידנית, שורה שהועברה מפער וסריקה של מוצר בלי
// מחיר: אף אחד מהם לא כותב מחיר, סכום שורה או סכום תעודה. הכסף של החזרה
// מחושב במרכזת החודשית ממחיר הלקוח של אותו יום.
// הרצה: node --test tests/returns-quantities.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './receipt-scan-harness.mjs';

const MONEY_DOC = ['totalExVat', 'totalIncVat'];
const MONEY_LINE = ['unitPrice', 'lineTotal', 'sentUnitPrice', 'listPrice', 'discountPct', 'priceForm', 'promoOnPaper'];
// שדה input בדפדפן הופך כל ערך למחרוזת; צומת ההארנס לא — כאן הוא מתנהג כמו בדפדפן
function stringInput(rt, id) {
  const n = rt.node(id); let v = '';
  Object.defineProperty(n, 'value', { get: () => v, set: x => { v = String(x); }, configurable: true });
}
function setup() {
  const rt = runtime();
  stringInput(rt, 'qtyVal');
  rt.run(`returns = []; receipts = []; returnsList = []; returnsSlots = { weekly: returnsList, daily: [] }; returnsSlot = 'weekly';
    window.location = { href: '' }; Date.now = () => ${Date.UTC(2026, 9, 4, 6, 0)};`);
  return rt;
}
const pick = (rt, code) => JSON.parse(rt.run(`JSON.stringify(products.find(p => p.code === '${code}'))`));
const lastWrite = rt => rt.writes[rt.writes.length - 1];
function assertNoMoney(data) {
  MONEY_DOC.forEach(k => assert.equal(Object.hasOwn(data, k), false, 'doc has ' + k));
  (data.items || []).forEach((l, i) => MONEY_LINE.forEach(k => assert.equal(Object.hasOwn(l, k), false, 'line ' + i + ' has ' + k)));
}

test('save without sending and WhatsApp send write the same quantities-only document', async () => {
  for (const via of ['save-only', 'send']) {
    const rt = setup();
    const loaf = pick(rt, '101'), pita = pick(rt, '401');
    rt.context.rows = [{ productId: loaf.id, name: loaf.name, barcode: loaf.barcode, qty: 3 }, { productId: pita.id, name: pita.name, barcode: pita.barcode, qty: 2 }];
    rt.run(`rows.forEach(x => returnsList.push(x)); setView('returns'); openReturnsSend();`);
    const msgBefore = rt.run('buildReturnsMessage(sendCtx.items, "")');
    if (via === 'save-only') await rt.run('saveReturnsWithoutSending()');
    else await rt.run(`performSend({ name: 'הנהג', phone: '050-1234567' })`);
    await rt.run('Promise.resolve()');
    const w = lastWrite(rt);
    assert.equal(w.op, 'set', via);
    const data = w.data;
    assert.equal(data.schemaVersion, 2, via);
    assert.equal(data.vatPct, 18, via + ': the VAT rate stays on the document for the month');
    assert.equal(data.credited, false);
    assert.equal(data.sentTo, via === 'save-only' ? 'נמסר ידנית' : 'הנהג');
    assertNoMoney(data);
    assert.deepEqual(data.items, [
      { name: loaf.name, barcode: loaf.barcode, code: '101', productId: loaf.id, qty: 3 },
      { name: pita.name, barcode: pita.barcode, code: '401', productId: pita.id, qty: 2 }], via);
    assert.match(msgBefore, /קוד פריט: 101/);
    assert.match(msgBefore, /סה״כ: \*2\* סוגים · \*5\* יחידות/);
    assert.doesNotMatch(msgBefore, /₪/);
    assert.equal(rt.requests.length, 0, 'no network');
    if (via === 'send') assert.match(rt.run('window.location.href'), /^https:\/\/wa\.me\/972501234567\?text=/);
    // v124: returnTotals הוסר; המסמך עצמו אינו נושא סכום
    assert.ok(!('totalExVat' in data) && !('totalIncVat' in data), JSON.stringify(Object.keys(data)));
  }
});

test('a deposit product adds a quantity-only deposit line that is not counted as units', async () => {
  const rt = setup();
  const loaf = pick(rt, '101');
  rt.run(`products.find(p => p.code === '101').deposit = 0.3;
    returnsList.push({ productId: '${loaf.id}', name: '${loaf.name}', barcode: '${loaf.barcode}', qty: 4 }); openReturnsSend();`);
  const items = JSON.parse(rt.run('JSON.stringify(sendCtx.items)'));
  assert.deepEqual(items[1], { name: 'פיקדון · ' + loaf.name, barcode: '', qty: 4, isDeposit: true });
  assert.match(rt.run('buildReturnsMessage(sendCtx.items, "")'), /\*1\* סוגים · \*4\* יחידות/);
  await rt.run('saveReturnsWithoutSending()');
  assertNoMoney(lastWrite(rt).data);
});

test('a manual product is a name and a quantity — the modal has no price field', async () => {
  const rt = setup();
  rt.run('openManualReturn()');
  rt.node('mr_name').value = 'לחמניה משקית שנפתחה';
  rt.node('mr_qty').value = '3';
  await rt.events.get('mr_add:click')();
  const row = JSON.parse(rt.run('JSON.stringify(returnsList[0])'));
  assert.equal(row.name, 'לחמניה משקית שנפתחה');
  assert.equal(row.qty, 3);
  assert.equal(row.manual, true);
  assert.match(row.productId, /^manual_/);
  assert.equal(Object.hasOwn(row, 'unitPrice'), false);
  rt.run('openReturnsSend()');
  const line = JSON.parse(rt.run('JSON.stringify(sendCtx.items[0])'));
  assert.deepEqual(Object.keys(line).sort(), ['barcode', 'code', 'name', 'productId', 'qty']);
  // שם חסר — לא נוסף; כמות חסרה — לא נוסף
  rt.run('returnsList.length = 0; openManualReturn()');
  rt.node('mr_name').value = '';
  await rt.events.get('mr_add:click')();
  assert.equal(rt.run('returnsList.length'), 0);
  assert.match(rt.toasts.at(-1), /הזן שם מוצר/);
});

test('scanning or typing the code of a product without a price goes straight to the quantity — nothing is written to products', async () => {
  const rt = setup();
  rt.run(`products.push({ id: 'code_9999', code: '9999', name: 'מוצר בלי מחיר', barcode: '7290099999', price: 0, listPrice: 0 });`);
  rt.run(`returnsDigitsPick('code_9999')`);
  assert.equal(rt.run('qtyProduct && qtyProduct.id'), 'code_9999', 'the qty modal opened');
  assert.equal(rt.run('qtyTarget'), 'returns');
  rt.node('qtyVal').value = '2';
  rt.run('commitQty(false)');
  assert.deepEqual(JSON.parse(rt.run('JSON.stringify(returnsList.map(x => [x.productId, x.qty]))')), [['code_9999', 2]]);
  rt.run(`handleReturnsScan('7290099999')`);
  assert.equal(rt.run('qtyProduct && qtyProduct.id'), 'code_9999', 'the scanner path too');
  assert.equal(rt.writes.filter(w => (w.path || []).includes('products')).length, 0, 'no price prompt, no product write');
  // בקליטה שער המחיר נשאר כמו שהיה (שלב 6)
  rt.run(`qtyProduct = null; proceedScannedProduct(products.find(p => p.id === 'code_9999'), 'receipt')`);
  assert.equal(rt.run('qtyProduct'), null, 'receiving still asks for a price first');
});

test('the pack offer in the returns qty modal shows units without a price', () => {
  const rt = setup();
  rt.run(`products.push({ id: 'pack', code: '7001', name: 'מארז 6', barcode: '7001', price: 30, creditPrice: 29 });
    products.push({ id: 'single', code: '7000', name: 'בודד', barcode: '7000', price: 5, billingPackId: 'pack', billingPackSize: 6 });
    promptQty(products.find(p => p.id === 'single'), 'returns');`);
  rt.node('qtyVal').value = '13';
  rt.run('updateQtyPackOffer()');
  const html = rt.node('qtyPackOffer').innerHTML;
  assert.match(html, /13 יח׳ = 2 × מארז 6 \+ 1 בודדים/);
  assert.doesNotMatch(html, /₪/);
});

test('a carried row is sent flagged with its origin and code, without a price', async () => {
  const rt = setup();
  rt.run(`returnsList.push({ productId: 'carry_1', name: 'ברמן אסלי 5 פיתות', barcode: '497440', code: '238', qty: 1, manual: true, carried: true, carriedFrom: 'returns_43eb' });
    openReturnsSend();`);
  const line = JSON.parse(rt.run('JSON.stringify(sendCtx.items[0])'));
  assert.deepEqual(line, { name: 'ברמן אסלי 5 פיתות', barcode: '497440', code: '238', productId: 'carry_1', qty: 1, carried: true, carriedFrom: 'returns_43eb' });
  assert.match(rt.run('buildReturnRow(returnsList[0])'), /הוחזר מפער זיכוי/);
  await rt.run('saveReturnsWithoutSending()');
  assertNoMoney(lastWrite(rt).data);
});

test('resending a saved document keeps the item code and leaves deposit lines out of the totals', () => {
  const rt = setup();
  rt.context.doc = { id: 'r1', items: [{ name: 'אחיד פרוס ברמן', barcode: '497112', code: '101', productId: 'code_101', qty: 3 },
    { name: 'פיקדון · אחיד פרוס ברמן', barcode: '', qty: 3, isDeposit: true }] };
  rt.run('openReturnsResend(doc)');
  const msg = rt.run('buildReturnsMessage(sendCtx.items, "")');
  assert.match(msg, /קוד פריט: 101/);
  assert.match(msg, /סה״כ: \*1\* סוגים · \*3\* יחידות/);
  assert.equal(rt.run('sendCtx.resendExisting'), true);
});

test('the action log describes a returns document in kinds and units, including a save without sending', () => {
  const rt = setup();
  rt.context.task = { data: { sentTo: 'הנהג', items: [{ name: 'a', qty: 3 }, { name: 'b', qty: 2 }, { name: 'פיקדון', qty: 2, isDeposit: true }] } };
  assert.equal(rt.run(`actionDetailsFromCloud('save returns before send', task)`), 'נשלח אל: הנהג · 2 סוגים · 5 יח׳');
  assert.equal(rt.run(`actionDetailsFromCloud('save returns without sending', task)`), 'נמסר ידנית · 2 סוגים · 5 יח׳');
  assert.deepEqual(JSON.parse(rt.run(`JSON.stringify(actionTitleFromCloud('save returns without sending', task))`)), ['returns', 'שמירת חזרות בלי שליחה']);
});

test('a qty-only credit link blocks delete on both sides, and the prune and clear-all filters see it', async () => {
  const rt = setup();
  rt.context.linked = { id: 'r_link', credited: true, creditStatus: 'ok', timestamp: 1, items: [{ name: 'x', qty: 1 }],
    creditAllocations: [{ id: 'cs1', receiptId: 'rc1', items: [{ productId: 'code_401', name: 'פיתות', qty: 2 }] }] };
  rt.context.noted = { id: 'r_note', credited: true, creditStatus: 'ok', timestamp: 1, items: [{ name: 'x', qty: 1 }],
    returnCreditNotes: [{ id: 'l1', fromReturnsId: 'r_link', items: [{ rowIndex: 0, name: 'x', qty: 1 }] }] };
  rt.run(`returns = [linked, noted]; receipts = [{ id: 'rc1', items: [] }];`);
  assert.equal(rt.run(`returnHasCreditAllocations('r_link')`), true);
  assert.equal(rt.run(`returnHasCreditAllocations('r_note')`), true);
  assert.equal(rt.run(`receiptHasCreditAllocations('rc1')`), true, 'the receipt side is guarded too');
  rt.run(`globalThis.testDeleted = []; hardDeleteDocWithBackup = async (n, id) => { testDeleted.push(id); return true; };`);
  await rt.run(`delReturn('r_link')`);
  await rt.run(`delReturnDoc('r_link')`);
  await rt.run(`delReceipt('rc1')`);
  assert.equal(rt.run('testDeleted.length'), 0);
  // שומרי הגזימה והמחיקה המרוכזת משתמשים באותם מסננים
  assert.equal(rt.run('creditAllocationList(linked).length'), 1);
  assert.equal(rt.run('returnCreditNotes(noted).length'), 1);
});
