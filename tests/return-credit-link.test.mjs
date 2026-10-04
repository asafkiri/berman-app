import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './receipt-scan-harness.mjs';

// v87 → v123: תעודת זיכוי חדשה משלימה חוסר בזיכוי של חזרות קודמות. הקישור
// ביחידות: באימות התעודה החדשה מסמנים "זוכה גם על מוצר שלא הוחזר" (מוצר +
// כמות), והבלש מציע את שורת החוסר באותו מוצר בתעודה הקודמת. בלי סכומים.
const copy = x => JSON.parse(JSON.stringify(x));
const SPELT = { id: 'p_spelt', code: '344', name: 'לחם מקמח כוסמין E-FREE', barcode: 'spelt', price: 12.31 };
const oldReturn = (qty = 1) => ({
  id: 'old', date: '2026-08-10', docDate: '2026-08-10', timestamp: 1,
  credited: true, creditStatus: 'open', creditNoteNumber: 'old-note', creditNoteTotal: 205.69,
  totalExVat: Math.round((205.65 + qty * 12.31) * 100) / 100,
  items: [{ name: 'מוצרים שזוכו', barcode: 'credited', qty: 1, unitPrice: 205.65 },
    { name: 'לחם מקמח כוסמין E-FREE', barcode: 'spelt', qty, noteQty: 0, unitPrice: 12.31 }]
});
const newReturn = (id = 'new', day = '2026-09-14') => ({
  id, date: day, docDate: day, timestamp: 2, credited: false, schemaVersion: 2,
  items: [{ name: 'חזרות חדשות', barcode: 'new-product', productId: 'p_new', qty: 10 }]
});

// Only the Firestore boundary is replaced. Real task execution, write queue,
// matching, confirmation, accounting and history rendering run unchanged.
function setup(docs = [oldReturn(), newReturn()], receiptDocs = []) {
  const rt = runtime({ realCloudTasks: true });
  const db = new Map(docs.map(d => ['returns/' + d.id, copy(d)]).concat(receiptDocs.map(d => ['receipts/' + d.id, copy(d)]))), commits = [], updates = [];
  let fail = false;
  const key = path => path.slice(-2).join('/');
  rt.context.doc = (_, ...path) => key(path);
  rt.context.updateDoc = async (ref, data) => { db.set(ref, { ...db.get(ref), ...copy(data) }); updates.push({ ref, data: copy(data) }); };
  rt.context.runTransaction = async (_, fn) => {
    const pending = [];
    const result = await fn({
      get: async ref => ({ exists: () => db.has(ref), data: () => copy(db.get(ref)) }),
      update: (ref, data) => pending.push({ ref, data: copy(data) })
    });
    if (fail) throw new Error('simulated network failure');
    for (const { ref, data } of pending) db.set(ref, { ...db.get(ref), ...data });
    if (pending.length) commits.push(pending);
    return result;
  };
  rt.context.writeBatch = () => {
    const pending = [];
    return { update: (ref, data) => pending.push({ ref, data: copy(data) }),
      commit: async () => { if (fail) throw new Error('simulated network failure'); for (const { ref, data } of pending) db.set(ref, { ...db.get(ref), ...data }); commits.push(pending); } };
  };
  rt.context.testDocs = docs;
  rt.context.testReceipts = receiptDocs;
  rt.context.spelt = SPELT;
  rt.run(`products.push(spelt); returns = structuredClone(testDocs); receipts = structuredClone(testReceipts); receiptHistoryFilter = 'all'; currentView = 'receiptsHistory';
    logCloudActionIfNeeded = () => {};`);
  const get = id => copy(rt.run(`returns.find(x => x.id === '${id}')`));
  const info = id => copy(rt.run(`returnsDiscrepancyInfo(returns.find(x => x.id === '${id}'))`));
  // האימות של התעודה החדשה: הכל זוכה, ובנוסף N יח׳ כוסמין שלא הוחזרו
  const prompt = async (qty = 1, id = 'new', typed = null) => {
    rt.node('rvNote_' + id).value = typed == null ? '' : String(typed);
    await rt.click('rv-verify-inline', id);
    rt.run(`rvExtraAdd('p_spelt'); returnVerify.extra[0].qty = ${qty}; returnVerify.items.forEach(l => l.checked = true);`);
    await rt.run('saveReturnVerify()');
    return copy(rt.run('creditSplit'));
  };
  return { ...rt, db, commits, updates, get, info, prompt, fail: value => { fail = value; } };
}
const pick = async (rt, idx = 0) => {
  const button = { dataset: { role: 'credit-split-pick', id: String(idx) }, closest: () => button };
  await rt.events.get('creditSplitModal:click')({ target: button });
};

test('a credited-only line on the next note proposes the older missing credit; confirmation records both sides without another return', async () => {
  const rt = setup(), before = rt.get('old').items;
  const ctx = await rt.prompt(1, 'new', 112.31);
  assert.equal(rt.get('new').credited, true, 'the new note was verified first');
  assert.equal(rt.get('new').creditNoteTotal, 112.31, 'typed amount kept for identification');
  assert.equal(ctx.candidates.length, 1);
  assert.equal(ctx.candidates[0].returnId, 'old');
  assert.match(rt.node('creditSplitList').innerHTML, /חסר זיכוי בחזרות/);
  assert.match(rt.node('creditSplitList').innerHTML, /E-FREE/);
  assert.doesNotMatch(rt.node('creditSplitList').innerHTML, /₪/);
  assert.equal(rt.commits.length, 0, 'a proposal alone must not allocate');
  rt.node('creditSplitNoteNumber').value = 'new-note';
  await pick(rt);
  const source = rt.get('new'), target = rt.get('old');
  assert.equal(rt.commits.length, 1);
  assert.equal(rt.commits[0].length, 2, 'one atomic write updates both records');
  assert.equal(target.creditNoteTotal, 205.69, 'original paper amount survives');
  assert.equal(source.creditAllocations[0].amount, undefined, 'no money in the link');
  assert.deepEqual(source.creditAllocations[0].items.map(i => [i.rowIndex, i.qty]), [[1, 1]], 'row identity and quantity');
  assert.equal(target.returnCreditNotes[0].id, source.creditAllocations[0].id);
  assert.equal(target.returnCreditNotes[0].noteNumber, 'new-note');
  assert.deepEqual(target.items, before);
  assert.deepEqual(source.items, newReturn().items);
  assert.equal(source.creditStatus, 'ok');
  assert.equal(rt.info('old').open, false);
  assert.equal(rt.info('old').shortItems.length, 0);
  assert.equal(rt.info('old').owed, undefined);
  assert.deepEqual(copy(rt.run('returnsBalance()')), { shortUnits: 0, overUnits: 0, openDocs: 0, n: 2 }, 'the link is not counted twice');
  const history = rt.run('renderReceiptsHistory(); app.innerHTML');
  assert.match(history, /השלמות זיכוי שהתקבלו/);
  assert.match(history, /new-note/);
  const card = rt.run('returnCardInReceipts(returns[0])');
  assert.match(card, /השלמות זיכוי שהתקבלו/);
  assert.match(card, /לחם מקמח כוסמין E-FREE × 1/);
  const reloaded = setup([...rt.db.values()].filter(d => !String(d.id).startsWith('receipt')));
  assert.equal(reloaded.info('old').open, false);
});

test('partial quantity stays open, a later note offers only the remaining units', async () => {
  const rt = setup([oldReturn(3), newReturn(), newReturn('later', '2026-09-15')]);
  const ctx = await rt.prompt(1);
  assert.equal(ctx.candidates[0].partial, true);
  assert.equal(ctx.candidates[0].items[0].qty, 1);
  assert.match(rt.node('creditSplitList').innerHTML, /השלמה חלקית/);
  await rt.run('confirmCreditSplitPick("0")');
  assert.equal(rt.info('old').shortItems[0].n, 2);
  assert.equal(rt.info('old').open, true);
  assert.equal(rt.get('old').items[1].qty, 3);
  assert.equal(rt.get('old').items[1].noteQty, 0);
  const second = await rt.prompt(5, 'later');
  assert.equal(second.candidates[0].items[0].qty, 2, 'never more than what is still open');
  await rt.run('confirmCreditSplitPick("0")');
  assert.equal(rt.info('old').open, false);
  assert.equal(rt.get('old').returnCreditNotes.length, 2);
});

test('identical rows and documents remain separate choices, with exact row identity', async () => {
  const old = oldReturn();
  old.items.push({ ...old.items[1] });
  const other = { ...oldReturn(), id: 'other', creditNoteNumber: 'other-note' };
  const rt = setup([old, other, newReturn()]);
  const ctx = await rt.prompt(1);
  assert.equal(ctx.candidates.length, 2, 'one candidate per document; one unit goes to the first open row');
  rt.context.ctx = ctx;
  const idx = ctx.candidates.findIndex(c => c.returnId === 'old');
  assert.equal(ctx.candidates[idx].items[0].rowIndex, 1);
  await rt.run(`confirmCreditSplitPick('${idx}')`);
  assert.deepEqual(rt.info('old').shortItems.map(x => x.rowIndex), [2]);
  assert.equal(rt.info('other').open, true);
  assert.equal(rt.get('other').returnCreditNotes, undefined);
});

test('one note can complete several missing products in the older document', async () => {
  const old = oldReturn(); old.items.push({ name: 'מוצר נוסף', barcode: 'second', productId: 'p_second', qty: 1, noteQty: 0 });
  const rt = setup([old, newReturn()]);
  rt.run(`products.push({ id: 'p_second', name: 'מוצר נוסף', barcode: 'second', price: 7 })`);
  rt.node('rvNote_new').value = '';
  await rt.click('rv-verify-inline', 'new');
  rt.run(`rvExtraAdd('p_spelt'); rvExtraAdd('p_second'); returnVerify.items.forEach(l => l.checked = true);`);
  await rt.run('saveReturnVerify()');
  const ctx = copy(rt.run('creditSplit'));
  assert.equal(ctx.candidates[0].items.length, 2);
  await rt.run('confirmCreditSplitPick("0")');
  assert.equal(rt.info('old').open, false);
});

test('self, future, closed and carried shortages are never offered', () => {
  const src = newReturn();
  const variants = [
    { ...oldReturn(), id: 'new' }, { ...oldReturn(), docDate: '2026-09-15' },
    { ...oldReturn(), creditStatus: 'ok' },
    { ...oldReturn(), carriedNotes: [{ name: 'לחם מקמח כוסמין E-FREE', barcode: 'spelt', qty: 1 }] },
    { ...oldReturn(), credited: false }
  ];
  const rt = setup([src]);
  rt.context.variants = variants;
  assert.equal(rt.run(`returnShortageCreditCandidates(returns[0], [{ productId: 'p_spelt', name: 'x', barcode: 'spelt', qty: 1 }], variants).length`), 0);
  rt.context.open = [oldReturn()];
  assert.equal(rt.run(`returnShortageCreditCandidates(returns[0], [{ productId: 'p_other', name: 'אחר', barcode: 'other', qty: 1 }], open).length`), 0, 'another product is no match');
  assert.equal(rt.run(`returnShortageCreditCandidates(returns[0], [{ productId: 'p_spelt', name: 'x', barcode: 'spelt', qty: 1 }], open).length`), 1);
});

test('retries are idempotent; cancellation reopens the old claim and retains both original documents', async () => {
  const rt = setup();
  const ctx = await rt.prompt(1, 'new', 112.31);
  rt.context.ctx = ctx;
  await rt.run('applyReturnCreditSplit(ctx, ctx.candidates[0], "n1")');
  const link = rt.get('new').creditAllocations[0];
  rt.context.replay = { op: 'return-credit-link', returnsId: 'new', returnId: 'old', linkId: link.id, operationId: link.id };
  await rt.run('executeCloudTask(replay)');
  assert.equal(rt.get('old').returnCreditNotes.length, 1);
  assert.equal(rt.commits.length, 1);
  await rt.run(`cancelCreditSplit('new', '${link.id}')`);
  assert.equal(rt.get('old').returnCreditNotes.length, 0);
  assert.equal(rt.get('new').creditAllocations.length, 0);
  assert.equal(rt.info('old').shortItems[0].n, 1);
  assert.equal(rt.info('old').open, true);
  assert.equal(rt.get('old').creditStatus, 'open', 'stored by the raw rule');
  assert.equal(rt.info('new').open, false, 'the new note itself was fully credited');
  assert.equal(rt.get('new').creditNoteTotal, 112.31);
  assert.deepEqual(rt.get('old').items, oldReturn().items);
  await assert.rejects(rt.run('executeCloudTask(replay)'), { code: 'stale-return-credit-link' });
  assert.equal(rt.commits.length, 2, 'a delayed retry cannot recreate a cancelled link');
  // אפשר לקשר שוב דרך "ערוך אימות"
  await rt.click('rv-open', 'new');
  rt.run(`rvExtraAdd('p_spelt'); returnVerify.items.forEach(l => l.checked = true);`);
  await rt.run('saveReturnVerify()');
  assert.equal(rt.run('creditSplit.candidates[0].returnId'), 'old');
});

test('two clicks create one link; a source or target changed on another device is rejected', async () => {
  const rt = setup();
  await rt.prompt();
  await Promise.all([rt.run('confirmCreditSplitPick("0")'), rt.run('confirmCreditSplitPick("0")')]);
  assert.equal(rt.commits.length, 1);
  for (const id of ['old', 'new']) {
    const stale = setup(); await stale.prompt();
    stale.db.get('returns/' + id).items[0].qty = 50;
    await stale.run('confirmCreditSplitPick("0")');
    assert.equal(stale.commits.length, 0);
    assert.equal(stale.run('cloudFailedWrites.length'), 0, 'stale choices are not queued for blind replay');
    assert.match(stale.toasts.at(-1), /התעודות השתנו/);
  }
});

test('failed transaction changes neither side; queued retry saves both once', async () => {
  const rt = setup(); await rt.prompt(); rt.fail(true);
  await rt.run('confirmCreditSplitPick("0")');
  assert.equal(rt.commits.length, 0);
  assert.equal(rt.get('new').creditAllocations, undefined);
  assert.equal(rt.get('old').returnCreditNotes, undefined);
  assert.equal(rt.run('cloudFailedWrites.length'), 1);
  rt.fail(false); await rt.run('retryCloudFailedWrites()');
  assert.equal(rt.commits.length, 1);
  assert.equal(rt.get('old').returnCreditNotes.length, 1);
  assert.equal(rt.run('cloudFailedWrites.length'), 0);
  assert.equal(rt.info('old').open, false);
});

test('Firestore field order differences do not reject an unchanged document', async () => {
  const rt = setup(); await rt.prompt();
  const reorder = x => Array.isArray(x) ? x.map(reorder) : x && typeof x === 'object'
    ? Object.fromEntries(Object.entries(x).reverse().map(([k, v]) => [k, reorder(v)])) : x;
  for (const [key, value] of rt.db) rt.db.set(key, reorder(value));
  await rt.run('confirmCreditSplitPick("0")');
  assert.equal(rt.commits.length, 1);
  assert.equal(rt.info('old').open, false);
});

test('linked records cannot be reset, edited or deleted while the link exists', async () => {
  const rt = setup(); await rt.prompt(1, 'new', 112.31); await rt.run('confirmCreditSplitPick("0")');
  const updatesBefore = rt.updates.length;
  for (const id of ['old', 'new']) {
    await rt.run(`clearReturnVerification('${id}')`);
    await rt.run(`openReturnItemsEdit('${id}')`);
    await rt.run(`delReturn('${id}')`);
    await rt.run(`addCreditNote('${id}', 12.31)`);
  }
  assert.equal(rt.commits.length, 1);
  assert.equal(rt.updates.length, updatesBefore);
  assert.equal(rt.get('old').creditNoteTotal, 205.69);
  assert.equal(rt.get('new').creditNoteTotal, 112.31);
});

test('the intake-shortage route appears alongside return-credit candidates and writes units on both sides', async () => {
  const intake = { id: 'intake', date: '2026-09-14', docDate: '2026-09-14', status: 'open',
    items: [{ name: 'לחם מקמח כוסמין E-FREE', productId: 'p_spelt', qty: 0, noteQty: 1 }] };
  const rt = setup([oldReturn(), newReturn()], [intake]);
  const ctx = await rt.prompt(1);
  assert.ok(ctx.candidates.some(c => c.returnId === 'old'));
  assert.ok(ctx.candidates.some(c => c.receiptId === 'intake'));
  const idx = ctx.candidates.findIndex(c => c.receiptId === 'intake');
  await rt.run(`confirmCreditSplitPick('${idx}')`);
  const alloc = rt.get('new').creditAllocations[0];
  assert.equal(alloc.receiptId, 'intake');
  assert.equal(alloc.amount, undefined);
  const unit = copy(rt.run('receipts[0].shortCreditUnits[0]'));
  assert.deepEqual({ productId: unit.productId, qty: unit.qty, source: unit.source, fromReturnsId: unit.fromReturnsId, id: unit.id },
    { productId: 'p_spelt', qty: 1, source: 'returns-note', fromReturnsId: 'new', id: alloc.id });
  assert.equal(rt.run('receipts[0].shortCreditNotes'), undefined, 'no money note is written');
  assert.equal(rt.run('receiptDiscrepancyInfo(receipts[0]).open'), false);
  // ביטול מהצד של תעודת החזרות מוריד את התאום מתעודת הקליטה
  await rt.run(`cancelCreditSplit('new', '${alloc.id}')`);
  assert.equal(rt.run('receipts[0].shortCreditUnits.length'), 0);
  assert.equal(rt.run('receiptDiscrepancyInfo(receipts[0]).open'), true);
  assert.equal(rt.db.get('receipts/intake').shortCreditUnits.length, 0);
});
