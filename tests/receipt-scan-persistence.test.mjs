import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, fixture } from './receipt-scan-harness.mjs';

const plain = value => JSON.parse(JSON.stringify(value));
const draft = r => JSON.parse(r.storage.get('bm_receipt_draft'));
const findings = r => plain(r.run('aiScanEvaluation.findings.filter(f => ["shortage", "surplus"].includes(f.type))'));
async function scanned() { const r = runtime(); await r.scan(); return r; }

test('complete app: scan -> count -> reload -> Finish shows the same differences with zero new scan requests', async () => {
  const r = await scanned(); r.events.get('cartBtn:click')();
  const expected = findings(r);
  assert.equal(expected.filter(f => f.type === 'shortage').length, 2);
  assert.equal(expected.filter(f => f.type === 'surplus').length, 1);
  const before = plain(r.run('aiScanResponse'));
  const s = runtime({ storage: r.storage });
  assert.equal(s.run('aiScanEvaluation'), null, 'Recompute after catalog load, not while restoring');
  s.events.get('cartBtn:click')();
  assert.deepEqual(findings(s), expected);
  assert.deepEqual(plain(s.run('aiScanResponse')), before);
  assert.match(s.node('app').innerHTML, /יש הבדלים מול הנייר/);
  assert.doesNotMatch(s.node('app').innerHTML, /0 עמודים|פענח את כל התעודות/);
  assert.equal(r.requests.length, 1); assert.equal(s.requests.length, 0);
  assert.equal(s.run('aiTotalPages()'), 0, 'No fake photos after reload');
  assert.ok(s.run('aiScanEvaluation.aggregates instanceof Map'));
});

test('returning to receiving and changing a count recomputes findings without OCR or changing paper quantities', async () => {
  const r = await scanned(), s = runtime({ storage: r.storage });
  s.run('openReconcile()');
  const paper = plain(s.run('aiScanResponse.scan.documents'));
  s.run(`setView('receiving'); receiptList.find(x => x.productId === 'code_238').qty++;
    saveReceiptDraft(); finishReceipt();`);
  assert.equal(findings(s).length, 2);
  assert.ok(!findings(s).some(f => f.productId === 'code_238'));
  assert.deepEqual(plain(s.run('aiScanResponse.scan.documents')), paper);
  assert.equal(s.requests.length, 0);
});

test('matching counts and a receipt without a promotion remain matching after reload', async () => {
  const data = fixture();
  data.paper.scan.documents[0].rows = data.paper.scan.documents[0].rows.filter(row => row.itemCode === '101');
  const doc = data.paper.scan.documents[0], row = doc.rows[0];
  doc.totalUnits = row.quantity; doc.printedLines = 1;
  doc.netToChargeExVat = Math.round(data.products.find(p => p.code === '101').price * row.quantity * 100) / 100;
  data.items = data.items.filter(it => it.productId === 'code_101');
  const r = runtime({ data }); await r.scan(); const s = runtime({ data, storage: r.storage });
  s.run('finishReceipt()');
  assert.ok(s.run('pendingReceipt && pendingReceipt.status === "ok"'));
  assert.equal(s.requests.length, 0);
});

test('decoded payload and original page count survive; photos and computed evaluation are never persisted', async () => {
  const r = await scanned(), saved = draft(r).paperScan;
  assert.deepEqual(saved.response, plain(r.run('aiScanResponse')));
  assert.equal(saved.documents[0].pageCount, 1);
  assert.ok(!('pages' in saved.documents[0]));
  assert.doesNotMatch(JSON.stringify(saved), /data:image|orientationConfirmed|aiScanEvaluation/);
});

test('two photographed pages retain the independent page-count check after reload', async () => {
  const r = await scanned();
  r.run('aiScanDocuments[0].pages.push({...aiScanDocuments[0].pages[0]}); aiScanResponse.scan.documents[0].pageCount = 2; aiRefreshScanEvaluation();');
  let s = runtime({ storage: r.storage }); s.run('openReconcile()');
  assert.ok(!s.run('aiScanEvaluation.errors.some(e => e.includes("מספר העמודים"))'));
  const bad = draft(s); bad.paperScan.response.scan.documents[0].pageCount = 1;
  s.storage.set('bm_receipt_draft', JSON.stringify(bad));
  s = runtime({ storage: s.storage }); s.run('openReconcile()');
  assert.ok(s.run('aiScanEvaluation.errors.some(e => e.includes("מספר העמודים"))'));
  assert.equal(s.run('aiScanEvaluation.valid'), false);
});

test('multiple documents and credit kind retain their independent inputs after reload', async () => {
  const r = await scanned();
  r.run(`const second = structuredClone(aiScanResponse.scan.documents[0]); second.noteIndex = 1; second.docType = 'credit';
    aiScanResponse.scan.documents.push(second);
    aiScanDocuments.push({...aiScanDocuments[0], noteIndex:1, kind:'credit'});
    receiptNotes.push({...receiptNotes[0],kind:'credit'}); recomputeNoteTotal(); aiRefreshScanEvaluation();`);
  const before = draft(r).paperScan, s = runtime({ storage: r.storage });
  assert.deepEqual(draft(s).paperScan, before);
  assert.equal(s.run('aiScanDocuments.length'), 2);
  assert.equal(s.run('aiScanDocuments[1].kind'), 'credit');
  s.run('openReconcile()');
  assert.ok(!s.run('aiScanEvaluation.errors.some(e => e.includes("מספר העמודים"))'));
});

test('successful read saved just before anchor adoption is recovered on restart', async () => {
  const r = runtime();
  r.run(`receiptOpened = true; receiptDocDate = '2026-09-09'; bermanSeedPhotoFirstScan(1);
    aiScanDocuments[0].pages = [{dataUrl:'fixture',orientationConfirmed:true}];`);
  await r.run('aiRunInvoiceScan()');
  assert.equal(r.run('receiptNotes.length'), 0);
  assert.ok(draft(r).paperScan);
  const s = runtime({ storage: r.storage });
  assert.equal(s.run('receiptPaperScanState'), 'ok');
  assert.equal(s.run('receiptNotes.length'), 1);
  assert.equal(s.requests.length, 0);
});

test('an evaluation failure cannot discard a successful server response', async () => {
  const r = runtime();
  r.run(`receiptOpened = true; receiptDocDate = '2026-09-09'; bermanSeedPhotoFirstScan(1);
    aiScanDocuments[0].pages = [{dataUrl:'fixture',orientationConfirmed:true}];
    aiEvaluateInvoiceScan = () => { throw new Error('evaluation failure'); };`);
  await r.run('bermanRunPaperScanInBackground()');
  assert.ok(draft(r).paperScan.response.scan.documents[0].rows.length);
  const s = runtime({ storage: r.storage });
  s.run('receiptList = structuredClone(testData.items); finishReceipt()');
  assert.equal(findings(s).length, 3);
  assert.equal(s.requests.length, 0);
});

test('a partial multi-document scan survives without declaring the missing document verified', async () => {
  const r = runtime();
  r.run(`receiptOpened = true; receiptDocDate = '2026-09-09'; bermanSeedPhotoFirstScan(2);
    aiScanDocuments.forEach(d => d.pages = [{dataUrl:'fixture',orientationConfirmed:true}]);`);
  let calls = 0;
  r.context.fetch = async () => ++calls === 1
    ? {ok:true, status:200, json:async()=>structuredClone(fixture().paper)}
    : {ok:false, status:400, json:async()=>({error:'invalid_model_output'})};
  await r.run('bermanRunPaperScanInBackground()');
  assert.equal(r.run('receiptPaperScanState'), 'failed');
  const s = runtime({ storage:r.storage });
  assert.equal(s.run('aiScanDocuments.length'), 2);
  assert.equal(s.run('aiScanResponse.scan.documents.length'), 1);
  assert.equal(s.run('receiptPaperScanState'), 'failed');
  assert.equal(s.run('receiptNotes.length'), 0);
  assert.match(s.run('paperScanStatusHtml()'), /אינו תואם לכל נתוני/);
});

test('a restored payload cannot silently replace existing supplier anchors', async () => {
  const r = await scanned(), changed = draft(r);
  changed.paperScan.response.scan.documents[0].subtotalExVat += 0.01;
  r.storage.set('bm_receipt_draft', JSON.stringify(changed));
  const s = runtime({ storage:r.storage });
  assert.deepEqual(plain(s.run('receiptNotes')), changed.notes);
  assert.equal(s.run('receiptPaperScanState'), 'failed');
});

test('legacy drafts retain counts and summaries but no longer claim that detailed results are available', async () => {
  const r = await scanned(), old = draft(r); delete old.paperScan;
  r.storage.set('bm_receipt_draft', JSON.stringify(old));
  const s = runtime({ storage: r.storage });
  assert.deepEqual(plain(s.run('receiptList')), old.items);
  assert.deepEqual(plain(s.run('receiptNotes')), old.notes);
  assert.match(s.run('paperScanStatusHtml()'), /פירוט הפענוח אינו זמין/);
  assert.equal(s.run('aiScanResponse'), null);
});

test('another draft with identical totals cannot reuse this receipt\'s scan', async () => {
  const r = await scanned(), changed = draft(r); changed.draftId = 'another-receipt';
  r.storage.set('bm_receipt_draft', JSON.stringify(changed));
  assert.equal(runtime({ storage: r.storage }).run('aiScanResponse'), null);
});

for (const field of ['amount', 'units', 'lines', 'kind']) {
  test('editing supplier ' + field + ' invalidates the saved scan', async () => {
    const r = await scanned();
    r.run(field === 'kind' ? 'receiptNotes[0].kind = "credit"' : `receiptNotes[0].${field}++`);
    r.run('recomputeNoteTotal(); saveReceiptDraft();');
    assert.equal(draft(r).paperScan, null);
    assert.equal(runtime({ storage: r.storage }).run('aiScanResponse'), null);
  });
}

for (const action of ['ai-edit-images', 'ai-reset-scan', 'rc-cancel', 'rc-paper-rescan']) {
  test(action + ' clears the persisted result through the real event handler', async () => {
    const r = await scanned(); r.run('openReconcile()');
    r.run('showConfirm = (title, text, button, confirm) => confirm();');
    r.click(action);
    assert.equal(draft(r).paperScan, null);
    assert.equal(runtime({ storage: r.storage }).run('aiScanResponse'), null);
  });
}

test('removing a photo or changing the document set cannot resurrect an earlier scan', async () => {
  for (const action of ['aiRemoveInvoicePage(0,0)', 'bermanPhotoFirstAddDoc()']) {
    const r = await scanned(); r.run(action);
    assert.equal(draft(r).paperScan, null);
    assert.equal(runtime({ storage: r.storage }).run('aiScanResponse'), null);
  }
});

test('corrupt payload, invalid input metadata and unsupported versions fail safely', async () => {
  const r = await scanned(), original = draft(r);
  for (const corrupt of [s => s.schemaVersion++, s => s.response.scan.documents[0].rows = [null],
    s => s.documents[0].amount++, s => s.documents[0].pageCount = 0,
    s => s.response.scan.documents[0].noteIndex = 7, s => s.response.ok = false]) {
    const changed = structuredClone(original); corrupt(changed.paperScan);
    const storage = new Map([['bm_receipt_draft', JSON.stringify(changed)]]);
    const s = runtime({ storage });
    assert.equal(s.run('aiScanResponse'), null);
    assert.deepEqual(plain(s.run('receiptList')), original.items);
  }
});

test('insufficient local storage warns explicitly and preserves the latest counts without reviving an old scan', async () => {
  const r = await scanned();
  const setItem = r.context.localStorage.setItem;
  r.context.localStorage.setItem = (k, v) => {
    if (k === 'bm_receipt_draft' && JSON.parse(v).paperScan) throw new Error('QuotaExceededError');
    setItem(k, v);
  };
  r.run('receiptList[0].qty++;');
  assert.equal(r.run('saveReceiptDraft()'), false);
  assert.ok(r.run('aiScanResponse'));
  assert.match(r.toasts.at(-1), /לא ניתן לשמור את הפענוח/);
  assert.equal(draft(r).paperScan, null);
  assert.deepEqual(draft(r).items, plain(r.run('receiptList')));
  await r.run('bermanRunPaperScanInBackground()');
  assert.match(r.toasts.at(-1), /לא ניתן לשמור את הפענוח/, 'A scan-success toast must not hide the storage failure');
});

test('a failed new scan does not restore the result it explicitly replaced', async () => {
  const r = await scanned();
  r.context.fetch = async () => ({ok:false, status:400, json:async()=>({error:'invalid_model_output'})});
  await r.run('bermanRunPaperScanInBackground()');
  assert.equal(draft(r).paperScan, null);
  assert.equal(r.run('receiptPaperScanState'), 'failed');
  assert.equal(runtime({ storage:r.storage }).run('aiScanResponse'), null);
});

test('late server result after cancellation/new capture is ignored', async () => {
  const r = runtime(); let resolve, entered;
  const started = new Promise(r => { entered = r; });
  r.context.fetch = () => { entered(); return new Promise(r => { resolve = r; }); };
  r.run(`receiptOpened = true; receiptDocDate = '2026-09-09'; bermanSeedPhotoFirstScan(1);
    aiScanDocuments[0].pages = [{dataUrl:'fixture',orientationConfirmed:true}];`);
  const pending = r.run('bermanRunPaperScanInBackground()'); await started;
  r.run('bermanSeedPhotoFirstScan(1)');
  resolve({ok:true, status:200, json:async()=>structuredClone(fixture().paper)});
  await pending;
  assert.equal(r.run('aiScanResponse'), null);
  assert.equal(draft(r).paperScan, null);
  assert.equal(r.run('receiptPaperScanState'), '');
});

test('final save carries the full scan and clears it only after the cloud write succeeds', async () => {
  const r = await scanned(); r.run('openReconcile()');
  r.run('showConfirm = (title, text, button, confirm) => confirm();');
  r.click('ai-close-receipt');
  assert.ok(r.run('pendingReceipt'));
  const expected = plain(r.run('aiScanResponse'));
  r.run('runCloudTask = async () => false');
  await r.run('confirmReceipt()');
  assert.ok(draft(r).paperScan);
  r.run('runCloudTask = async (label, task) => {testWrites.push(structuredClone(task)); return true;}');
  await r.run('confirmReceipt()');
  const saved = r.writes.find(task => task.path?.includes('receipts'));
  assert.deepEqual(saved.data.paperScan.response, expected);
  assert.equal(draft(r).paperScan, null);
  assert.equal(draft(r).items.length, 0);
  assert.equal(r.run('aiScanResponse'), null);
});
