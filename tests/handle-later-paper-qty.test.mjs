// v105: "קלוט ותטפל בהפרש אחר כך" (ai-close-receipt) saves, per product, the
// quantity the paper billed — the same number ai-apply saves (line.noteQty =
// a.qty). Until v105 aiRecordFindingsAsPaperQty wrote received ± qty for EACH
// finding, so when the analyzer led and one product had several findings (a
// substitution splits into a shortage and a surplus, next to another claim)
// the last one won: billed 12, scanned 4 → saved 6, "חסר 2", and 6 units that
// belonged to no product. The fix is the source: when the analyzer led, the
// quantities come from the engine's paper-vs-scan comparison (ev.engineFindings,
// one finding per product), not from the analyzer's claims — so the tests below
// with several claims on one product pass whatever the claims say, in any order.
// The per-product sum inside aiRecordFindingsAsPaperQty is a guard for a source
// with several findings per product; it is pinned by a direct call at the end.
// The analyzer runs for real here (aiRunAnalyzer and its aiFindingsClosure gate);
// only its network answer is faked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, fixture } from './receipt-scan-harness.mjs';

const strip = s => String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// docs: [{ rows: [[code, qty], ...], credit?: true }]; scanned: { code: qty }.
// Every document is self-consistent, so the scan verifies against its anchors.
function makeData(docs, scanned) {
  const data = fixture();
  const products = data.products;
  const base = data.paper.scan.documents[0];
  data.paper.scan.documents = docs.map((d, noteIndex) => {
    const rows = d.rows.map(([code, quantity], i) => {
      const p = products.find(x => x.code === String(code));
      return { itemCode: String(code), description: p.name, barcode: p.barcode, quantity, unitPriceExVat: p.listPrice, sourcePage: 1, lineNumber: i + 1 };
    });
    const total = rows.reduce((s, r) => s + r.quantity * products.find(p => p.code === r.itemCode).price, 0);
    return { ...base, noteIndex, docType: d.credit ? 'credit' : 'invoice', rows, netToChargeExVat: Math.round(total * 100) / 100,
      totalUnits: rows.reduce((s, r) => s + r.quantity, 0), printedLines: rows.length };
  });
  data.items = Object.entries(scanned).map(([code, qty]) => {
    const p = products.find(x => x.code === String(code));
    return { productId: p.id, name: p.name, barcode: p.barcode, qty };
  });
  return data;
}
async function scanned(docs, scannedQty, claims, mutate) {
  const data = makeData(docs, scannedQty);
  if (mutate) mutate(data);
  const r = runtime({ data, globals: { fetch: async (url, options) => {
    const body = options && options.body ? JSON.parse(options.body) : {};
    if (body.mode === 'analyze') return { ok: true, status: 200, json: async () => ({ ok: true, analysis: { claims: structuredClone(claims || []) } }) };
    const one = structuredClone(data.paper);
    // One request per photographed document; its photo says which one it is.
    if (docs.length > 1) {
      const page = String(body.documents[0].pages[0]);
      const index = Number(Buffer.from(page.split(',')[1], 'base64').toString().replace('DOC', ''));
      one.scan.documents = [{ ...one.scan.documents[index], noteIndex: 0 }];
    }
    return { ok: true, status: 200, json: async () => one };
  } } });
  if (docs.length > 1) {
    r.context.testPhotos = docs.map((d, i) => 'data:image/jpeg;base64,' + Buffer.from('DOC' + i).toString('base64'));
    r.run(`receiptOpened = true; receiptDocDate = '2026-09-09'; receiptList = [];
      bermanSeedPhotoFirstScan(${docs.length});
      aiScanDocuments.forEach((d, i) => { d.pages = [{ dataUrl: testPhotos[i], orientationConfirmed: true }]; });`);
    await r.run('bermanRunPaperScanInBackground()');
    r.run('receiptList = structuredClone(testData.items); saveReceiptDraft();');
  } else {
    await r.scan();
  }
  r.run('openReconcile()');
  if (claims) await r.run('auditOriginalAnalyzer({ auto: false })');
  return r;
}
const analyzerLed = r => r.run('!!(aiAnalyzeResult && aiAnalyzeResult.accepted) && aiScanEvaluation.analyzerLed === true');
// { code: [received, noteQty] } for every product line on the reconcile screen.
const paperQty = r => JSON.parse(r.run("JSON.stringify(Object.fromEntries(reconcileData.filter(l => !l.isDeposit).map(l => [String(l.productId).replace('code_', ''), [l.received, l.noteQty]])))"));
function acceptConfirm(r) { r.run('if (confirmCb) { const cb = confirmCb; hideConfirm(); cb(); }'); }
// The evaluation is not valid (e.g. ai-apply rolled back), so the only way on is ai-close-receipt.
function closeLater(r) {
  r.run('aiScanEvaluation.valid = false; aiDetailsOpen = false; renderReconcile();');
  assert.match(r.node('app').innerHTML, /data-role="ai-close-receipt"/);
  r.click('ai-close-receipt');
  acceptConfirm(r);
}
async function saveAndShow(r) {
  await r.run('confirmReceipt()');
  const w = r.writes.filter(x => x.op === 'set' && /receipts/.test(x.path)).pop();
  assert.ok(w, 'the receipt was saved');
  const rc = { id: 'r1', ...w.data };
  r.context.savedReceipt = rc;
  const di = JSON.parse(r.run(`(function () { const d = receiptDiscrepancyInfo(savedReceipt);
    return JSON.stringify({ short: d.shortItems.map(x => [String(x.productId).replace('code_', ''), x.n]), over: d.overItems.map(x => [String(x.productId).replace('code_', ''), x.n]), unitsGap: d.unresolvedUnitsGap }); })()`));
  r.run('receipts = [savedReceipt]; receiptHistoryFilter = "all"; currentView = "receiptsHistory"; renderReceiptsHistory();');
  const html = r.node('app').innerHTML;
  assert.ok(!/התצוגה נכשלה/.test(html));
  const at = html.indexOf('הפרשים מול התעודה');
  const end = at > 0 ? html.indexOf('data-role="rc-fix-open"', at) : -1;
  const history = at > 0 ? strip(html.slice(at, end > 0 ? end : undefined)) : '';
  const items = Object.fromEntries(rc.items.map(l => [String(l.productId).replace('code_', ''), l.noteQty == null ? [l.qty] : [l.qty, l.noteQty]]));
  return { rc, di, history, items };
}
const PAPER = [{ rows: [[238, 12], [101, 10]] }];
const SUBSTITUTION = { kind: 'substitution', productId: 'code_238', substituteProductId: 'code_101', quantity: 2 };
const SHORTAGE_6 = { kind: 'shortage', productId: 'code_238', quantity: 6 };

test('single finding per product (engine led): the saved receipt is exactly what it was before v105', async () => {
  const r = await scanned(PAPER, { 238: 4, 101: 10 });
  assert.equal(analyzerLed(r), false);
  closeLater(r);
  const { rc, items, di } = await saveAndShow(r);
  // v121: שורת התעודה נשמרת בלי כסף — מזהה, שם, ברקוד וכמויות בלבד
  assert.deepEqual(rc.items, [
    { productId: 'code_101', name: 'אחיד פרוס ברמן', barcode: rc.items[0].barcode, qty: 10 },
    { productId: 'code_238', name: 'ברמן אסלי 5 פיתות', barcode: rc.items[1].barcode, qty: 4, noteQty: 12 }
  ]);
  assert.equal(rc.schemaVersion, 2);
  for (const k of ['totalExVat', 'unresolvedAmountGap', 'priceAudit', 'supplierDiscount', 'monthEndRebates']) assert.ok(!(k in rc), k + ' is not written since v121');
  assert.deepEqual(items, { 101: [10], 238: [4, 12] });
  assert.deepEqual(di, { short: [['238', 8]], over: [], unitsGap: 0 });

  // A surplus alone, and a product billed but never scanned (the v46 line), are unchanged too.
  const surplus = await scanned(PAPER, { 238: 12, 101: 13 });
  closeLater(surplus);
  assert.deepEqual(paperQty(surplus), { 238: [12, 12], 101: [13, 10] });
  const neverScanned = await scanned([{ rows: [[238, 12], [3604, 3], [101, 10]] }], { 238: 12, 101: 10 });
  closeLater(neverScanned);
  assert.deepEqual(paperQty(neverScanned), { 238: [12, 12], 101: [10, 10], 3604: [0, 3] });
  // One analyzer claim per product that agrees with the paper: the same 12 as always.
  const oneClaim = await scanned(PAPER, { 238: 4, 101: 10 }, [{ kind: 'shortage', productId: 'code_238', quantity: 8 }]);
  assert.equal(analyzerLed(oneClaim), true);
  closeLater(oneClaim);
  assert.deepEqual(paperQty(oneClaim), { 238: [4, 12], 101: [10, 10] });
});

test('substitution + another shortage on the same product: billed 12 is saved, in either claim order, and the history says חסר 8', async () => {
  for (const claims of [[SHORTAGE_6, SUBSTITUTION], [SUBSTITUTION, SHORTAGE_6]]) {
    const r = await scanned(PAPER, { 238: 4, 101: 12 }, claims);
    assert.equal(analyzerLed(r), true, 'the real gate adopted the claims');
    closeLater(r);
    assert.deepEqual(paperQty(r), { 238: [4, 12], 101: [12, 10] });
    const summary = strip(r.node('rsBody').innerHTML);
    assert.match(summary, /ברמן אסלי 5 פיתות חויב בתעודה 12 · נסרק בפועל 4 · חסר 8/, summary);
    const { rc, di, history } = await saveAndShow(r);
    assert.deepEqual(di, { short: [['238', 8]], over: [['101', 2]], unitsGap: 0 });
    assert.equal(rc.unresolvedUnitsGap, 0);
    assert.match(history, /חסר: ברמן אסלי 5 פיתות חויב בתעודה 12 · נסרק בפועל 4 · חסר 8 יח׳ · ₪39\.30/, history);
    assert.ok(!history.includes('שטרם שויך'), history);
  }
});

test('the reviewer\'s case: the substitute is not on the paper at all — 238 is saved as billed 12, not 6', async () => {
  const r = await scanned(PAPER, { 238: 4, 101: 10, 2387: 2 },
    [SHORTAGE_6, { kind: 'substitution', productId: 'code_238', substituteProductId: 'code_2387', quantity: 2 }]);
  assert.equal(analyzerLed(r), true);
  closeLater(r);
  assert.deepEqual(paperQty(r), { 238: [4, 12], 101: [10, 10], 2387: [2, 0] });
  const { di, history, rc } = await saveAndShow(r);
  assert.deepEqual(di, { short: [['238', 8]], over: [['2387', 2]], unitsGap: 0 });
  assert.ok(!/חסר 2 יח׳/.test(history), history);
  assert.match(history, /ברמן אסלי 5 פיתות חויב בתעודה 12 · נסרק בפועל 4 · חסר 8 יח׳/, history);
});

test('two shortage claims on one product (the paper has it on two rows, 7 + 5): the paper\'s 12 is saved, nothing left unowned', async () => {
  const r = await scanned([{ rows: [[238, 7], [101, 10], [238, 5]] }], { 238: 4, 101: 10 },
    [{ kind: 'shortage', productId: 'code_238', quantity: 5 }, { kind: 'shortage', productId: 'code_238', quantity: 3 }]);
  assert.equal(analyzerLed(r), true);
  closeLater(r);
  assert.deepEqual(paperQty(r), { 238: [4, 12], 101: [10, 10] });
  const { rc, di } = await saveAndShow(r);
  assert.deepEqual(di, { short: [['238', 8]], over: [], unitsGap: 0 });
});

test('shortage and surplus claims on one product: the paper\'s comparison is saved — a real surplus of 1 is never saved as "חסר 2"', async () => {
  const r = await scanned(PAPER, { 238: 4, 101: 11 }, [
    { kind: 'substitution', productId: 'code_238', substituteProductId: 'code_101', quantity: 3 },
    { kind: 'shortage', productId: 'code_238', quantity: 5 },
    { kind: 'shortage', productId: 'code_101', quantity: 2 }]);
  assert.equal(analyzerLed(r), true);
  closeLater(r);
  assert.deepEqual(paperQty(r), { 238: [4, 12], 101: [11, 10] });
  const { rc, di } = await saveAndShow(r);
  assert.deepEqual(di, { short: [['238', 8]], over: [['101', 1]], unitsGap: 0 });
});

test('a product billed but never scanned, explained by two claims, gets one line with the paper\'s 3 billed', async () => {
  const r = await scanned([{ rows: [[238, 12], [3604, 3], [101, 10]] }], { 238: 12, 101: 11 }, [
    { kind: 'substitution', productId: 'code_3604', substituteProductId: 'code_101', quantity: 1 },
    { kind: 'shortage', productId: 'code_3604', quantity: 2 }]);
  assert.equal(analyzerLed(r), true);
  closeLater(r);
  assert.deepEqual(paperQty(r), { 238: [12, 12], 101: [11, 10], 3604: [0, 3] });
  assert.equal(r.run("reconcileData.filter(l => String(l.productId) === 'code_3604').length"), 1);
  const { rc, di } = await saveAndShow(r);
  assert.deepEqual(di, { short: [['3604', 3]], over: [['101', 1]], unitsGap: 0 });
});

test('a credit note in the same delivery: the saved paper quantity is the net (12 − 2), with one finding or with two claims', async () => {
  const docs = [{ rows: [[238, 12], [101, 10]] }, { rows: [[238, 2]], credit: true }];
  const engine = await scanned(docs, { 238: 4, 101: 10 });
  assert.equal(engine.run('aiScanEvaluation.findingsReady && receiptHasCreditNote()'), true);
  closeLater(engine);
  assert.deepEqual(paperQty(engine), { 238: [4, 10], 101: [10, 10] });

  const r = await scanned(docs, { 238: 4, 101: 12 }, [SUBSTITUTION, { kind: 'shortage', productId: 'code_238', quantity: 4 }]);
  assert.equal(analyzerLed(r), true);
  closeLater(r);
  assert.deepEqual(paperQty(r), { 238: [4, 10], 101: [12, 10] });
  const { rc, di } = await saveAndShow(r);
  assert.deepEqual(di, { short: [['238', 6]], over: [['101', 2]], unitsGap: 0 });
});

test('handle later saves what ai-apply saves — also when a same-price claim names another product than the paper', async () => {
  // 333 and 339 cost the same, so the gate cannot tell them apart. The paper
  // says 339 is 3 short; the claim says 333. The saved receipt follows the paper.
  const docs = [{ rows: [[333, 5], [339, 5], [101, 10]] }];
  const claims = [{ kind: 'shortage', productId: 'code_333', quantity: 3 }];
  const applied = await scanned(docs, { 333: 5, 339: 2, 101: 10 }, claims);
  assert.equal(analyzerLed(applied), true);
  applied.click('ai-apply');
  const later = await scanned(docs, { 333: 5, 339: 2, 101: 10 }, claims);
  closeLater(later);
  assert.deepEqual(paperQty(later), { 333: [5, 5], 339: [2, 5], 101: [10, 10] });
  assert.deepEqual(paperQty(later), paperQty(applied));
  const { history } = await saveAndShow(later);
  assert.ok(!/חויב בתעודה 8/.test(history), 'the paper never billed 8 of 333: ' + history);
  // The analyzer's own words stay what they were, on screen and in the text for the supplier.
  assert.match(later.run('aiAnalyzeClaimsPlainText()'), /חוסר: 3 × דגני קלות/);
});

test('claims that count the same units twice are rejected by the gate, so the engine\'s single finding is saved', async () => {
  const r = await scanned(PAPER, { 238: 4, 101: 12 }, [{ kind: 'shortage', productId: 'code_238', quantity: 8 }, SUBSTITUTION]);
  assert.equal(analyzerLed(r), false);
  assert.match(r.run('aiAnalyzeResult.closure.reason'), /צפוי 6, נמצא 8/);
  closeLater(r);
  assert.deepEqual(paperQty(r), { 238: [4, 12], 101: [12, 10] });
});

test('partial basket: a shortage from the resolved rows is saved, a surplus the incomplete paper cannot prove is not', async () => {
  const r = await scanned([{ rows: [[238, 12], [101, 10], [238, 3]] }], { 238: 4, 101: 12 }, null, data => {
    Object.assign(data.paper.scan.documents[0].rows[2], { itemCode: '99999', barcode: '1234567890123', description: 'שורה לא קריאה' });
  });
  assert.equal(r.run('aiScanEvaluation.basketComplete'), false);
  closeLater(r);
  assert.deepEqual(paperQty(r), { 238: [4, 12], 101: [12, 12] });
});

test('a second click (after cancelling the confirm) writes the same quantities, not twice the difference', async () => {
  const r = await scanned(PAPER, { 238: 4, 101: 12 }, [SHORTAGE_6, SUBSTITUTION]);
  assert.equal(analyzerLed(r), true);
  r.run('aiScanEvaluation.valid = false; aiDetailsOpen = false; renderReconcile();');
  r.click('ai-close-receipt');
  r.run('hideConfirm(); document.getElementById("receiptSummaryModal").classList.add("hidden");');
  assert.deepEqual(paperQty(r), { 238: [4, 12], 101: [12, 10] });
  r.click('ai-close-receipt');
  acceptConfirm(r);
  assert.deepEqual(paperQty(r), { 238: [4, 12], 101: [12, 10] });
  const { di } = await saveAndShow(r);
  assert.deepEqual(di, { short: [['238', 8]], over: [['101', 2]], unitsGap: 0 });
});

// The per-product sum is a guard: the engine gives at most one quantity finding per
// product, so with a real scan the old "last finding wins" would pass every test
// above. Called directly with several findings per product it must add them up.
test('aiRecordFindingsAsPaperQty adds up several quantity findings for one product (direct call)', async () => {
  const r = await scanned(PAPER, { 238: 4, 101: 12 });
  const out = r.run(`(function () {
    reconcileData.forEach(l => { l.noteQty = l.received; });
    const n = aiRecordFindingsAsPaperQty({ findings: [
      { type: 'shortage', productId: 'code_238', qty: 6 },
      { type: 'shortage', productId: 'code_238', qty: 2 },
      { type: 'surplus', productId: 'code_101', qty: 3 },
      { type: 'shortage', productId: 'code_101', qty: 1 } ] });
    return JSON.stringify([n, reconcileData.find(l => l.productId === 'code_238').noteQty, reconcileData.find(l => l.productId === 'code_101').noteQty]);
  })()`);
  assert.deepEqual(JSON.parse(out), [2, 12, 10], 'last-wins would give 238 → 6, 101 → 13');
});

test('a product billed but never scanned gets a line at the engine\'s expected price (the shortage is valued at it)', async () => {
  const r = await scanned([{ rows: [[238, 12], [339, 3], [101, 10]] }], { 238: 12, 101: 10 });
  const shortage = JSON.parse(r.run("JSON.stringify(aiScanEvaluation.findings.find(f => f.productId === 'code_339' && f.type === 'shortage'))"));
  const catalog = Number(r.run("products.find(p => p.id === 'code_339').price"));
  assert.notEqual(shortage.expectedPrice, catalog, 'the fixture must tell the two prices apart');
  closeLater(r);
  const line = JSON.parse(r.run("JSON.stringify(reconcileData.find(l => l.productId === 'code_339'))"));
  assert.deepEqual([line.received, line.noteQty, line.price], [0, 3, shortage.expectedPrice]);
});

test('a stale paper quantity already on the line (typed, or restored) is replaced by what the paper billed', async () => {
  const r = await scanned(PAPER, { 238: 4, 101: 12 }, [SHORTAGE_6, SUBSTITUTION]);
  assert.equal(analyzerLed(r), true);
  // The v104-era numbers ("חויב 6") sitting on the lines before the click.
  r.run("reconcileData.find(l => l.productId === 'code_238').noteQty = 6; reconcileData.find(l => l.productId === 'code_101').noteQty = 11;");
  closeLater(r);
  assert.deepEqual(paperQty(r), { 238: [4, 12], 101: [12, 10] });
});
