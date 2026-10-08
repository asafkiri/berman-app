// Actual application integration with the coordinator/network boundaries faked.
// Engine transactions and media chunks have their own multi-device suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, runtime } from './receipt-scan-harness.mjs';

const plain = value => JSON.parse(JSON.stringify(value));

function device({ canEdit = true, ...options } = {}) {
  const r = runtime({ ...options, sharedReceiving: true, loadSharedEngine: true });
  const saved = [], finished = [];
  const status = { ready: true, canEdit, busy: false, status: 'synced', error: null,
    revision: 2, owner: null, dirty: false, conflict: canEdit ? null : {path:'qty'},
    head: { schema: 2, revision: 2, owner: null } };
  const coordinator = {
    ready: true, canEdit, busy: false, status, head: status.head, revision: 2, payload: null,
    save: async payload => { saved.push(plain(payload)); return { revision: 3 }; },
    flush: async () => ({ revision: 3 }),
    finish: async (receiptId, data, empty) => { finished.push({ receiptId, data: plain(data), empty: plain(empty) }); return { revision: 4 }; },
    acquireScan: async () => ({id:'paid-scan'}), releaseScan: async () => {},
    start: async () => true, stop() {}
  };
  r.context.testSharedCoordinator = coordinator;
  r.context.testSharedStatus = status;
  r.run('sharedReceiving = testSharedCoordinator; sharedReceiptHooksReady = true; sharedReceivingStatusChanged(testSharedStatus);');
  return { ...r, saved, finished, coordinator, status };
}

function transfer(from, to, source = 'remote') {
  to.context.testIncomingReceipt = plain(from.run('captureSharedReceipt()'));
  to.context.testIncomingMeta = { source, canEdit: to.coordinator.canEdit, head: to.status.head, revision: 2 };
  return to.run('applySharedReceipt(testIncomingReceipt, testIncomingMeta)');
}

test('another device receives the same photos, OCR, counts and comparison without paying for another scan', async () => {
  const source = device();
  await source.scan();
  source.run('openReconcile()');
  const expected = plain(source.run('aiScanEvaluation.findings'));
  const target = device({ canEdit: true });
  await transfer(source, target);
  assert.deepEqual(plain(target.run('receiptList')), plain(source.run('receiptList')));
  assert.deepEqual(plain(target.run('aiScanDocuments')), plain(source.run('aiScanDocuments')));
  assert.deepEqual(plain(target.run('aiScanResponse')), plain(source.run('aiScanResponse')));
  assert.deepEqual(plain(target.run('reconcileData')), plain(source.run('reconcileData')));
  assert.deepEqual(plain(target.run('aiScanEvaluation.findings')), expected);
  assert.equal(target.run('aiScanEvaluation.aggregates instanceof Map'), true);
  assert.equal(target.run('currentView'), 'reconcile');
  assert.equal(target.requests.length, 0);
  assert.match(target.node('app').innerHTML, /יש הבדלים מול הנייר/);
});

test('manual quantity and reconciliation decisions arrive together with the same draft identity', async () => {
  const source = device();
  await source.scan();
  source.run(`openReconcile(); receiptCountingMode = 'manual';
    receiptQuantityReview = {rows: [{productId:'code_238', received:3, expected:4, status:'shortage'}]};
    reconcileData[0].checked = true; reconcileData[0].noteQty = 13;
    reconcilePaperEntered = true;`);
  const target = device({ canEdit: true });
  await transfer(source, target);
  for (const expression of ['receiptDraftId', 'receiptCountingMode', 'receiptQuantityReview', 'reconcileData',
    'reconcilePaperEntered']) {
    assert.deepEqual(plain(target.run(expression)), plain(source.run(expression)), expression);
  }
  assert.equal(target.requests.length, 0);
});

// v124: 22 מפתחות של זרימות שהוסרו (הבלש, בדיקת התעודה, הבדיקה הידנית, מבצע בתעודה,
// הנחת ספק ותביעת זיכוי) ירדו מהטיוטה המשותפת — בלי לשנות את SCHEMA (2) ואת גרסת
// המטען (1). מכשיר v123 ממלא אותם בברירות מחדל משלו; v124 מתעלם מהם ואינו שולח אותם.
const V123_ONLY_KEYS = {
  receiptPromoOnPaper: [], reconcileDetectiveRoundingGap: null, detectiveOpen: false, detectiveStrictNote: '',
  detectiveScope: null, detectiveQuestionState: { fingerprint: '', asked: 0, constraints: [] }, detectiveLinesWitness: null,
  noteCheckOpen: false, noteCheckAuto: false, noteCheckRows: [], noteCheckRes: null, noteCheckQtyMode: false,
  noteCheckForceQty: false, ncPromoResult: null, reconcileSupplierDiscount: 0, reconcileSupplierPromoItems: [],
  reconcilePromoMismatchItems: [], reconcileSupplierCreditClaim: null, manualSearchTerm: '', manualAssigned: [],
  manualSearchOpen: false, manualPromoMarks: {}
};
test('a v123 draft that still carries the removed keys applies cleanly, and v124 never sends them back', async () => {
  const source = device();
  await source.scan();
  source.run('openReconcile()');
  const payload = plain(source.run('captureSharedReceipt()'));
  assert.equal(payload.version, 1, 'the payload version stays 1 — a v123 device throws on any other');
  Object.keys(V123_ONLY_KEYS).forEach(k => assert.ok(!(k in payload.state), k + ' is not sent'));
  const legacy = { ...payload, state: { ...payload.state, ...V123_ONLY_KEYS, reconcileSupplierDiscount: 3.2, manualPromoMarks: { code_238: true } } };
  const target = device({ canEdit: true });
  target.context.testIncomingReceipt = legacy;
  target.context.testIncomingMeta = { source: 'remote', canEdit: true, head: target.status.head, revision: 2 };
  await target.run('applySharedReceipt(testIncomingReceipt, testIncomingMeta)');
  assert.deepEqual(plain(target.run('reconcileData')), plain(source.run('reconcileData')));
  const back = plain(target.run('captureSharedReceipt()'));
  Object.keys(V123_ONLY_KEYS).forEach(k => assert.ok(!(k in back.state), k + ' is not echoed'));
  assert.deepEqual(Object.keys(plain(target.run('emptySharedReceipt()')).state).sort(), Object.keys(plain(target.run('sharedReceiptBindings()'))).sort(),
    'the empty state and the bindings list the same keys');
  assert.equal(target.requests.length, 0);
});

test('unfinished manual anchor fields follow the shared screen without becoming approved anchors', async () => {
  const source = device();
  source.run("receiptEntryMode = 'manual'; renderReceiving()");
  const values = { rcNoteInput: '123.45', rcNoteUnits: '30', rcNoteLines: '5', rcDocDate: '2026-09-09', rcDigits: '729' };
  for (const [id, value] of Object.entries(values)) source.node(id).value = value;
  const target = device({ canEdit: true });
  await transfer(source, target);
  for (const [id, value] of Object.entries(values)) assert.equal(target.node(id).value, value, id);
  assert.equal(target.run('receiptNotes.length'), 0);
  assert.equal(target.run('receiptAnchorSource'), null);
});

test('an ordinary remote quantity edit does not cancel an in-flight OCR response', async () => {
  const source = device();
  let resolveResponse, entered;
  const started = new Promise(resolve => { entered = resolve; });
  source.context.fetch = () => { entered(); return new Promise(resolve => { resolveResponse = resolve; }); };
  source.run(`receiptOpened = true; receiptDocDate = '2026-09-09'; bermanSeedPhotoFirstScan(1);
    aiScanDocuments[0].pages = [{dataUrl:'data:image/jpeg;base64,Zml4dHVyZQ==',orientationConfirmed:true}];`);
  const pending = source.run('bermanRunPaperScanInBackground()');
  await started;
  const beforeSession = source.run('aiScanSession');
  const remote = plain(source.run('captureSharedReceipt()'));
  remote.state.receiptList = structuredClone(fixture().items);
  remote.state.receiptList[0].qty = 17;
  source.context.testReplacement = remote;
  source.run('applySharedReceipt(testReplacement, {source:"remote"})');
  resolveResponse({ ok: true, status: 200, json: async () => structuredClone(fixture().paper) });
  await pending;
  assert.equal(source.run('aiScanSession'), beforeSession);
  assert.ok(source.run('aiScanResponse'));
  assert.equal(source.run('receiptList[0].qty'), 17);
  assert.equal(source.run('canEditSharedReceipt()'), true);
});

test('another device follows a running scan without starting a duplicate request', async () => {
  const source = device();
  source.run(`receiptOpened = true; bermanSeedPhotoFirstScan(1);
    aiScanDocuments[0].pages = [{dataUrl:'data:image/jpeg;base64,Zml4dHVyZQ==',orientationConfirmed:true}];
    aiScanBusy = true; receiptPaperScanState = 'running';`);
  const target = device();
  await transfer(source, target);
  await target.run('aiRunInvoiceScan()');
  assert.equal(target.run('aiScanBusy'), true);
  assert.equal(target.run('receiptPaperScanState'), 'running');
  assert.equal(target.run('aiTotalPages()'), 1);
  assert.equal(target.run('canEditSharedReceipt()'), true);
  assert.equal(target.requests.length, 0);
});

for (const action of ['prepare', 'rotate']) test('late image ' + action + ' cannot alter a remotely replaced page', async () => {
  const source = device();
  let complete;
  source.context.deferImage = () => new Promise(resolve => { complete = resolve; });
  source.run(`bermanSeedPhotoFirstScan(1);
    aiScanDocuments[0].pages = [{dataUrl:'original-page',orientationConfirmed:true}];`);
  const pending = action === 'prepare'
    ? source.run('aiCompressInvoiceImage = deferImage; aiAddInvoiceFiles(0,[{}])')
    : source.run('aiRenderInvoiceRotation = deferImage; aiRotateInvoicePage(0,0)');
  const remote = plain(source.run('captureSharedReceipt()'));
  remote.state.aiScanDocuments[0].pages = [{dataUrl:'remote-page',orientationConfirmed:true}];
  remote.state.aiScanBusy = true;
  remote.state.aiScanProgressText = 'remote job';
  source.context.testReplacement = remote;
  source.run('applySharedReceipt(testReplacement, {source:"remote"})');
  complete({dataUrl:'stale-processed-page', bytes:100});
  await pending;
  assert.equal(source.run('aiScanDocuments[0].pages.length'), 1);
  assert.equal(source.run('aiScanDocuments[0].pages[0].dataUrl'), 'remote-page');
  assert.equal(source.run('aiScanBusy'), true);
  assert.equal(source.run('aiScanProgressText'), 'remote job');
});

test('late analyzer completion cannot overwrite decisions received from another device', async () => {
  const source = device();
  await source.scan();
  source.run('openReconcile()');
  let complete, entered;
  const started = new Promise(resolve => { entered = resolve; });
  source.context.fetch = () => { entered(); return new Promise(resolve => { complete = resolve; }); };
  const pending = source.run('auditOriginalAnalyzer({auto:true})');
  await started;
  const remote = plain(source.run('captureSharedReceipt()'));
  remote.state.aiAnalyzeResult = {summary:'remote decision', accepted:false};
  remote.state.aiAnalyzeBusy = true;
  source.context.testReplacement = remote;
  source.run('applySharedReceipt(testReplacement, {source:"remote"})');
  complete({ok:true, json:async()=>({ok:true,analysis:{claims:[],summary:'stale decision'}})});
  await pending;
  assert.equal(source.run('aiAnalyzeResult.summary'), 'remote decision');
  assert.equal(source.run('aiAnalyzeBusy'), true);
});

test('late crop confirmation cannot clear a new remote OCR result or dismiss its photo preview', async () => {
  const source = device();
  await source.scan();
  const remote = plain(source.run('captureSharedReceipt()'));
  remote.ui.orientation = {doc:0, page:0, reviewOnly:true};
  remote.state.aiScanDocuments[0].pages[0].dataUrl = 'remote-replacement';
  let complete;
  source.context.deferCrop = () => new Promise(resolve => { complete = resolve; });
  source.run(`aiOrientationSession = {page:aiScanDocuments[0].pages[0],reviewOnly:false,cropMode:true};
    aiCropState = {moved:true}; aiApplyCropIfMoved = deferCrop;`);
  const pending = source.run('aiConfirmOrientationReview()');
  source.context.testReplacement = remote;
  source.run('applySharedReceipt(testReplacement, {source:"remote"})');
  complete();
  await pending;
  assert.ok(source.run('aiScanResponse'));
  assert.equal(source.run('aiOrientationSession.page === aiScanDocuments[0].pages[0]'), true);
  assert.equal(source.run('aiOrientationSession.reviewOnly'), true);
  assert.equal(source.node('aiOrientationModal').classList.contains('hidden'), false);
});

test('an in-flight local finalization blocks paid OCR and retains the summary', async () => {
  const source = device();
  await source.scan();
  source.run(`openReconcile(); showConfirm = (title, text, button, confirm) => confirm();`);
  source.click('ai-close-receipt');
  assert.ok(source.run('pendingReceipt'));
  const target = device({ canEdit: false });
  await transfer(source, target);
  assert.ok(target.run('pendingReceipt'));
  target.run('sharedReceiptFinalizing=true');
  await target.run('confirmReceipt()');
  await target.run('aiRunInvoiceScan()');
  assert.equal(target.finished.length, 0);
  assert.equal(target.writes.length, 0);
  assert.equal(target.requests.length, 0);
  assert.ok(target.run('pendingReceipt'), 'A denied viewer action must retain the shared summary');
});

test('the capture event guard blocks edits during local finalization but permits navigation', () => {
  const viewer = device({ canEdit: false }); viewer.run('sharedReceiptFinalizing=true');
  for (const area of ['#app', '#receiptSummaryModal, #receiptQuantityModal, #aiOrientationModal, #aiLiveCameraModal']) {
    let prevented = false, stopped = false;
    viewer.context.testEvent = {
      target: { closest: selector => selector === area ? viewer.node('workflow') : null },
      preventDefault() { prevented = true; }, stopImmediatePropagation() { stopped = true; }
    };
    viewer.run('guardSharedReceiptEvent(testEvent)');
    assert.equal(prevented, true, area);
    assert.equal(stopped, true, area);
  }
  let blocked = false;
  const target = { dataset: { role: 'rc-history' }, closest: selector =>
    selector === '#app' ? viewer.node('app') : selector === '[data-role]' ? target : null };
  viewer.context.testEvent = { target, preventDefault() { blocked = true; }, stopImmediatePropagation() {} };
  viewer.run('guardSharedReceiptEvent(testEvent)');
  assert.equal(blocked, false);
});

test('final confirmation uses independent guarded transaction; failures retain local data', async () => {
 const source=device();await source.scan();source.run('openReconcile();showConfirm=(a,b,c,fn)=>fn()');source.click('ai-close-receipt');
 source.finalCloud.reject='permission-denied';const id=source.run('receiptDraftId');await source.run('confirmReceipt()');assert.equal(source.run('receiptDraftId'),id);assert.ok(source.run('pendingReceipt'));
 source.finalCloud.reject=null;await source.run('confirmReceipt()');assert.equal(source.finished.length,0);assert.ok(source.finalCloud.get('artifacts/berman-app-classic/public/data/receipts/'+id));assert.equal(source.run('receiptDraftId'),null);
});

test('server-cleared draft replaces an old local receipt and does not replay OCR on reload', async () => {
  const previous = device();
  await previous.scan();
  const restored = device({ canEdit: true, storage: previous.storage });
  assert.ok(restored.run('receiptList.length'));
  const empty = device();
  await transfer(empty, restored, 'finish');
  assert.equal(restored.run('receiptList.length'), 0);
  assert.equal(restored.run('receiptDraftId'), null);
  assert.equal(restored.run('aiScanResponse'), null);
  assert.equal(restored.run('aiTotalPages()'), 0);
  const next = device({ canEdit: true, storage: restored.storage });
  assert.equal(next.run('receiptList.length'), 0);
  assert.equal(next.run('aiScanResponse'), null);
  assert.equal(restored.requests.length, 0);
  assert.equal(next.requests.length, 0);
});

for (const previouslyShared of [false,true]) test('startup retains local receipt regardless of old shared flag: '+previouslyShared,async()=>{
 const previous=device();await previous.scan();const storage=new Map(previous.storage);if(previouslyShared)storage.set('bm_shared_receiving_live','1');
 const restored=runtime({storage});await restored.run('startSharedReceiving()');assert.equal(restored.run('receiptList.length'),fixture().items.length);assert.ok(restored.run('aiScanResponse'));assert.equal(restored.run('sharedReceiving'),null);assert.equal(restored.requests.length,0);
});

test('a shared summary can be confirmed by another device, but a changed quantity requires a new review',async()=>{
  const source=device();await source.scan();
  source.run('openReconcile();showConfirm=(title,text,button,confirm)=>confirm();');
  source.click('ai-close-receipt');assert.ok(source.run('pendingReceipt.sharedBasis'));
  const unchanged=device();await transfer(source,unchanged);
  await unchanged.run('confirmReceipt()');assert.equal(unchanged.finished.length,0);assert.equal(unchanged.finalCloud.paths('/receipts/').length,1);
  const edited=device();await transfer(source,edited);
  edited.run('receiptList[0].qty++;');
  await edited.run('confirmReceipt()');assert.equal(edited.finished.length,0);
  assert.equal(edited.run('pendingReceipt'),null);assert.ok(edited.run('receiptList.length'));
});
