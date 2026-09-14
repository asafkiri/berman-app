import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './receipt-scan-harness.mjs';

const copy = x => JSON.parse(JSON.stringify(x));
const oldReturn = (qty = 1, price = 12.31) => ({
  id: 'old', date: '2026-08-10', docDate: '2026-08-10', timestamp: 1,
  credited: true, creditStatus: 'open', creditNoteNumber: 'old-note',
  totalExVat: Math.round((205.65 + qty * price) * 100) / 100, creditNoteTotal: 205.69,
  items: [{ name: 'מוצרים שזוכו', barcode: 'credited', qty: 1, unitPrice: 205.65 },
    { name: 'לחם מקמח כוסמין E-FREE', barcode: 'spelt', qty, noteQty: 0, unitPrice: price }]
});
const newReturn = (id = 'new', day = '2026-09-14') => ({
  id, date: day, docDate: day, timestamp: 2, credited: false, totalExVat: 100,
  items: [{ name: 'חזרות חדשות', barcode: 'new-product', qty: 10, unitPrice: 10 }]
});

// Only the Firestore boundary is replaced. Real task execution, write queue,
// matching, confirmation, accounting and history rendering run unchanged.
function setup(docs = [oldReturn(), newReturn()]) {
  const rt = runtime({ realCloudTasks: true });
  const db = new Map(docs.map(d => ['returns/' + d.id, copy(d)])), commits = [];
  let fail = false;
  const key = path => path.slice(-2).join('/');
  rt.context.doc = (_, ...path) => key(path);
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
      commit: async () => { for (const { ref, data } of pending) db.set(ref, { ...db.get(ref), ...data }); commits.push(pending); } };
  };
  rt.context.testDocs = docs;
  rt.run(`returns = structuredClone(testDocs); receipts = []; currentView = 'returnsHistory';
    logCloudActionIfNeeded = () => {};`);
  const get = id => copy(rt.run(`returns.find(x => x.id === '${id}')`));
  const info = id => copy(rt.run(`returnsDiscrepancyInfo(returns.find(x => x.id === '${id}'))`));
  const prompt = async (total = 112.31, id = 'new') => {
    rt.node('rvNote_' + id).value = String(total);
    await rt.click('rv-verify-inline', id);
    return copy(rt.run('creditSplit'));
  };
  return { ...rt, db, commits, get, info, prompt, fail: value => { fail = value; } };
}

test('entering the next note proposes the older missing credit; confirmation records both sides without another return', async () => {
  const rt = setup(), before = rt.get('old').items;
  const ctx = await rt.prompt();
  assert.equal(ctx.candidates.length, 1);
  assert.equal(ctx.candidates[0].returnId, 'old');
  assert.match(rt.node('creditSplitList').innerHTML, /חסר זיכוי בחזרות/);
  assert.match(rt.node('creditSplitList').innerHTML, /E-FREE/);
  assert.match(rt.node('creditSplitList').innerHTML, /12.31/);
  assert.equal(rt.commits.length, 0, 'amount match alone must not allocate');
  rt.node('creditSplitNoteNumber').value = 'new-note';
  const button = { dataset: { role: 'credit-split-pick', id: '0' }, closest: () => button };
  await rt.events.get('creditSplitModal:click')({ target: button });
  const source = rt.get('new'), target = rt.get('old');
  assert.equal(rt.commits.length, 1);
  assert.equal(rt.commits[0].length, 2, 'one atomic write updates both records');
  assert.equal(source.creditNoteTotal, 112.31);
  assert.equal(target.creditNoteTotal, 205.69, 'original paper amount survives');
  assert.equal(source.creditAllocations[0].amount, 12.31);
  assert.equal(target.returnCreditNotes[0].id, source.creditAllocations[0].id);
  assert.equal(target.returnCreditNotes[0].noteNumber, 'new-note');
  assert.deepEqual(target.items, before);
  assert.deepEqual(source.items, newReturn().items);
  assert.equal(source.creditStatus, 'ok');
  assert.equal(target.creditStatus, 'ok');
  assert.equal(rt.info('old').open, false);
  assert.equal(rt.info('old').shortItems.length, 0);
  assert.equal(rt.info('old').owed, -0.04, 'retain small original residual, never invent money');
  assert.equal(rt.run('returnsBalance().bal'), -0.04, 'the link is not counted twice');
  const history = rt.run('renderReturnsHistory(); app.innerHTML');
  assert.match(history, /השלמות זיכוי שהתקבלו/);
  assert.match(history, /new-note/);
  const card = rt.run('returnCardInReceipts(returns[0])');
  assert.match(card, /השלמות זיכוי שהתקבלו/);
  assert.match(card, /new-note/);
  const reloaded = setup([...rt.db.values()]);
  assert.equal(reloaded.info('old').open, false);
  assert.equal(reloaded.run('returnsBalance().bal'), -0.04);
});

test('partial quantity stays open, a later note offers only the remaining units', async () => {
  const rt = setup([oldReturn(3), newReturn(), newReturn('later', '2026-09-15')]);
  const ctx = await rt.prompt();
  assert.equal(ctx.candidates[0].partial, true);
  assert.match(rt.node('creditSplitList').innerHTML, /השלמה חלקית/);
  await rt.run('confirmCreditSplitPick("0")');
  assert.equal(rt.info('old').shortItems[0].n, 2);
  assert.equal(rt.info('old').open, true);
  assert.equal(rt.get('old').items[1].qty, 3);
  assert.equal(rt.get('old').items[1].noteQty, 0);
  const second = await rt.prompt(124.62, 'later');
  assert.equal(second.candidates[0].items[0].qty, 2);
  await rt.run('confirmCreditSplitPick("0")');
  assert.equal(rt.info('old').open, false);
  assert.equal(rt.get('old').returnCreditNotes.length, 2);
});

test('duplicate-price rows and documents remain separate choices, with exact row identity', async () => {
  const old = oldReturn();
  old.items.push({ ...old.items[1] }); old.totalExVat += 12.31;
  const other = { ...oldReturn(), id: 'other', creditNoteNumber: 'other-note' };
  const rt = setup([old, other, newReturn()]);
  const ctx = await rt.prompt();
  assert.equal(ctx.candidates.length, 3);
  const idx = ctx.candidates.findIndex(c => c.returnId === 'old' && c.items[0].rowIndex === 2);
  await rt.run(`confirmCreditSplitPick('${idx}')`);
  assert.equal(rt.info('old').shortItems[0].rowIndex, 1);
  assert.equal(rt.info('other').open, true);
  assert.equal(rt.get('other').returnCreditNotes, undefined);
});

test('one note can complete several missing products in the older document', async () => {
  const old = oldReturn(); old.items.push({ name: 'מוצר נוסף', barcode: 'second', qty: 1, noteQty: 0, unitPrice: 7 }); old.totalExVat += 7;
  const rt = setup([old, newReturn()]);
  const ctx = await rt.prompt(119.31);
  assert.equal(ctx.candidates[0].items.length, 2);
  await rt.run('confirmCreditSplitPick("0")');
  assert.equal(rt.info('old').open, false);
});

test('self, future, closed, carried and unexplained monetary gaps are never offered', () => {
  const src = newReturn();
  const variants = [
    { ...oldReturn(), id: 'new' }, { ...oldReturn(), docDate: '2026-09-15' },
    { ...oldReturn(), creditStatus: 'ok' },
    { ...oldReturn(), carriedNotes: [{ name: 'לחם מקמח כוסמין E-FREE', barcode: 'spelt', qty: 1, price: 12.31 }] },
    { ...oldReturn(), creditNoteTotal: 195 }, { ...oldReturn(), creditNoteTotal: null }
  ];
  const rt = setup([src]);
  rt.context.variants = variants;
  assert.equal(rt.run('returnShortageCreditCandidates(returns[0], 112.31, variants).length'), 0);
  assert.equal(rt.run('returnShortageCreditCandidates(returns[0], 150, variants).length'), 0);
});

test('retries are idempotent; cancellation reopens the old claim and retains both original documents', async () => {
  const rt = setup();
  const ctx = await rt.prompt();
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
  assert.equal(rt.info('new').open, true);
  assert.equal(rt.get('new').creditNoteTotal, 112.31);
  assert.deepEqual(rt.get('old').items, oldReturn().items);
  await assert.rejects(rt.run('executeCloudTask(replay)'), { code: 'stale-return-credit-link' });
  assert.equal(rt.commits.length, 2, 'a delayed retry cannot recreate a cancelled link');
  assert.match(rt.run('creditAllocationsHtml(returns.find(x => x.id === "new"))'), /credit-split-open/);
  await rt.click('credit-split-open', 'new');
  assert.equal(rt.run('creditSplit.candidates[0].returnId'), 'old');
});

test('two clicks create one link; a source or target changed on another device is rejected', async () => {
  const rt = setup();
  await rt.prompt();
  await Promise.all([rt.run('confirmCreditSplitPick("0")'), rt.run('confirmCreditSplitPick("0")')]);
  assert.equal(rt.commits.length, 1);
  for (const id of ['old', 'new']) {
    const stale = setup(); await stale.prompt();
    stale.db.get('returns/' + id).creditNoteTotal = 50;
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
  const rt = setup(); await rt.prompt(); await rt.run('confirmCreditSplitPick("0")');
  for (const id of ['old', 'new']) {
    await rt.run(`clearReturnVerification('${id}')`);
    await rt.run(`openReturnItemsEdit('${id}')`);
    await rt.run(`delReturn('${id}')`);
    await rt.run(`addCreditNote('${id}', 12.31)`);
  }
  assert.equal(rt.commits.length, 1);
  assert.equal(rt.get('old').creditNoteTotal, 205.69);
  assert.equal(rt.get('new').creditNoteTotal, 112.31);
});

test('the existing intake-shortage route still appears alongside return-credit candidates', async () => {
  const rt = setup();
  rt.run(`receipts = [{ id: 'intake', date: '2026-09-14', docDate: '2026-09-14', status: 'open',
    items: [{ name: 'חוסר קליטה', productId: 'p', qty: 0, noteQty: 1, unitPrice: 12.31 }] }];`);
  const ctx = await rt.prompt();
  assert.ok(ctx.candidates.some(c => c.returnId === 'old'));
  assert.ok(ctx.candidates.some(c => c.receiptId === 'intake'));
  await rt.run('applyCreditSplit("new", "intake", 12.31, {items: [{productId:"p", name:"חוסר קליטה", qty:1}]})');
  assert.equal(rt.get('new').creditAllocations[0].receiptId, 'intake');
  assert.equal(rt.run('receipts[0].shortCreditNotes[0].amount'), 12.31);
});
