// v104: wherever a shortage/surplus is shown, the owner sees three numbers —
// billed on the supplier document, actually scanned, and the gap — on the
// analyzer card, in the close summary and on the saved receipt in history.
// The same safety rule as the v100 row: the numbers appear only when they add
// up exactly for that product; otherwise the display stays the plain one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, fixture } from './receipt-scan-harness.mjs';

const strip = s => String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const cells = h => Object.fromEntries([...h.matchAll(/<div class="text-\[10px\] font-bold text-slate-500">([^<]*)<\/div><div class="text-base font-black [^"]*">([^<]*)<\/div>/g)].map(m => [m[1], m[2]]));
const CLAIM_CARD = '<div class="rounded-xl border p-2.5 ';
const MAIN_ROW = '<div class="bg-white rounded-xl px-3 py-2.5 mt-2">';

// Paper rows [code, qty] and scanned {code: qty}; the paper is self-consistent,
// so the scan verifies and the differences are real shortages/surpluses.
function makeData(paperRows, scanned) {
  const data = fixture();
  const products = data.products;
  const rows = paperRows.map(([code, quantity], i) => {
    const p = products.find(x => x.code === String(code));
    return { itemCode: String(code), description: p.name, barcode: p.barcode, quantity, unitPriceExVat: p.listPrice, sourcePage: 1, lineNumber: i + 1 };
  });
  const total = rows.reduce((s, r) => s + r.quantity * products.find(p => p.code === r.itemCode).price, 0);
  data.paper.scan.documents[0] = { ...data.paper.scan.documents[0], rows, netToChargeExVat: Math.round(total * 100) / 100,
    totalUnits: rows.reduce((s, r) => s + r.quantity, 0), printedLines: rows.length };
  data.items = Object.entries(scanned).map(([code, qty]) => {
    const p = products.find(x => x.code === String(code));
    return { productId: p.id, name: p.name, barcode: p.barcode, qty };
  });
  return data;
}
async function scanned(paperRows, scannedQty) {
  const r = runtime({ data: makeData(paperRows, scannedQty) });
  await r.scan();
  r.run('openReconcile()');
  assert.equal(r.run('rcStep'), 'ai');
  return r;
}
// The analyzer's answer, adopted exactly as aiRunAnalyzer does when it closes.
function adoptClaims(r, claims) {
  r.context.testClaims = claims;
  r.run(`(function () {
    const ev = aiScanEvaluation;
    const findings = aiClaimsToFindings(testClaims, ev);
    aiAnalyzeResult = { claims: testClaims, findings, closure: { ok: true, expectedUnitsDelta: 0, actualUnitsDelta: 0, expectedAmountDelta: 0, actualAmountDelta: 0 }, summary: '', unexplained: '', droppedClaims: 0, accepted: true };
    aiAdoptAnalyzerResult(ev, aiAnalyzeResult);
  })()`);
}
function analyzerCards(html) {
  const start = html.indexOf('אלה הבעיות שנמצאו');
  assert.ok(start > 0, 'the analyzer card is shown');
  const section = html.slice(start, html.indexOf('data-role="ai-analyze-copy"', start));
  return section.split(CLAIM_CARD).slice(1).map(h => '<div class="' + h);
}
function mainRows(html) {
  const start = html.indexOf('יש הבדלים מול הנייר');
  assert.ok(start > 0, 'the main differences card is shown');
  return html.slice(start, html.indexOf('data-role="ai-apply"', start)).split(MAIN_ROW).slice(1);
}

test('analyzer card: a shortage claim that closes shows billed · scanned · missing', async () => {
  const r = await scanned([[238, 12], [101, 10]], { 238: 4, 101: 10 });
  adoptClaims(r, [{ kind: 'shortage', productId: 'code_238', quantity: 8, amountExVat: 39.3 }]);
  r.run('aiDetailsOpen = true; renderReconcile();');
  const html = r.node('app').innerHTML;
  assert.ok(!/התצוגה נכשלה/.test(html));
  const [card] = analyzerCards(html);
  // v122: the card is quantities only — the claim's money never reaches the receiving screen
  assert.ok(strip(card).startsWith('חוסר חוסר: 8 × ברמן אסלי 5 פיתות חויב בתעודה'), strip(card));
  assert.ok(!strip(card).includes('₪'), 'no money on the analyzer card: ' + strip(card));
  assert.deepEqual(cells(card), { 'חויב בתעודה': '12', 'נסרק בפועל': '4', 'חסר': '8' });
  assert.ok(strip(card).includes('נסרקו 4 יח׳ מתוך 12 שחויבו בתעודה'));
});

test('analyzer card: a surplus claim that closes shows the numbers, a claim that does not close stays plain', async () => {
  const r = await scanned([[238, 12], [101, 10], [2381, 5]], { 238: 4, 101: 12, 2381: 5 });
  // 238: paper 12, scanned 4 → 8 missing, but the claim says 5. 101: 10 → 12 = surplus 2.
  adoptClaims(r, [
    { kind: 'shortage', productId: 'code_238', quantity: 5 },
    { kind: 'surplus', productId: 'code_101', quantity: 2 }
  ]);
  r.run('aiDetailsOpen = true; renderReconcile();');
  const html = r.node('app').innerHTML;
  const [short, surplus] = analyzerCards(html);
  assert.ok(strip(short).includes('חוסר: 5 × ברמן אסלי 5 פיתות'));
  assert.deepEqual(cells(short), {}, 'claim 5 ≠ 12 − 4: no numbers that contradict each other');
  assert.ok(!strip(short).includes('חויב בתעודה'));
  assert.ok(strip(surplus).includes('עודף: 2 × אחיד פרוס ברמן'));
  assert.deepEqual(cells(surplus), { 'חויב בתעודה': '10', 'נסרק בפועל': '12', 'עודף': '2' });
});

test('two quantity claims on one product (substitution split): no numbers for it — on the analyzer card and on the main card', async () => {
  const r = await scanned([[238, 12], [101, 10], [2381, 5]], { 238: 4, 101: 12, 2381: 2 });
  // 238 has a shortage claim of 8 (= 12 − 4, would close on its own) AND is the
  // billed side of a substitution. 2381 is an ordinary shortage of 3.
  adoptClaims(r, [
    { kind: 'shortage', productId: 'code_238', quantity: 8 },
    { kind: 'substitution', productId: 'code_238', substituteProductId: 'code_101', quantity: 2 },
    { kind: 'shortage', productId: 'code_2381', quantity: 3 }
  ]);
  r.run('aiDetailsOpen = false; renderReconcile();');
  const main = mainRows(r.node('app').innerHTML);
  const row = name => main.filter(h => strip(h).startsWith(name));
  assert.equal(row('ברמן אסלי 5 פיתות').length, 2, 'both 238 findings are listed');
  for (const h of row('ברמן אסלי 5 פיתות')) assert.deepEqual(cells(h), {}, strip(h));
  // It is the guard, not the arithmetic: on its own the 8 closes (12 − 4).
  assert.equal(r.run("!!aiQuantityFindingNumbers({ productId: 'code_238', qty: 8 }, true, [])"), true);
  assert.deepEqual(cells(row('פיתות פרימיום 10')[0]), { 'חויב בתעודה': '5', 'נסרק בפועל': '2', 'חסר': '3' });
  // The delivered side of the substitution is the only finding on 101 and closes (10 → 12).
  assert.deepEqual(cells(row('אחיד פרוס ברמן')[0]), { 'חויב בתעודה': '10', 'נסרק בפועל': '12', 'עודף': '2' });

  r.run('aiDetailsOpen = true; renderReconcile();');
  const html = r.node('app').innerHTML;
  assert.ok(!/התצוגה נכשלה/.test(html));
  const [short238, substitution, short2381] = analyzerCards(html);
  assert.ok(strip(short238).includes('חוסר: 8 × ברמן אסלי 5 פיתות'));
  assert.deepEqual(cells(short238), {}, 'guarded: another claim touches the same product');
  assert.ok(strip(substitution).includes('החלפה: חויב 2 × ברמן אסלי 5 פיתות, סופק אחיד פרוס ברמן'));
  assert.deepEqual(cells(substitution), {}, 'substitution cards stay as they were');
  assert.deepEqual(cells(short2381), { 'חויב בתעודה': '5', 'נסרק בפועל': '2', 'חסר': '3' });
});

test('close summary: a line with a difference says billed, scanned and the gap', async () => {
  const r = await scanned([[238, 12], [101, 10], [2381, 5]], { 238: 4, 101: 10, 2381: 5 });
  r.click('ai-apply');
  const text = strip(r.node('rsBody').innerHTML);
  assert.match(text, /ברמן אסלי 5 פיתות חויב בתעודה 12 · נסרק בפועל 4 · חסר 8/);
  assert.ok(!/התקבל 4\b/.test(text), 'the short line no longer shows only what arrived');
  assert.match(text, /אחיד פרוס ברמן התקבל 10/, 'a line without a difference is unchanged');
  assert.ok(!/אחיד פרוס ברמן חויב בתעודה/.test(text));
});

test('close summary: a surplus line shows the same three numbers', async () => {
  const r = await scanned([[238, 12], [101, 10]], { 238: 12, 101: 13 });
  r.click('ai-apply');
  const text = strip(r.node('rsBody').innerHTML);
  assert.match(text, /אחיד פרוס ברמן חויב בתעודה 10 · נסרק בפועל 13 · עודף 3/);
});

test('history: the saved receipt\'s difference row shows billed and scanned', async () => {
  const r = await scanned([[238, 12], [101, 10]], { 238: 4, 101: 10 });
  r.click('ai-apply');
  await r.run('confirmReceipt()');
  const saved = r.writes.filter(w => w.op === 'set' && /receipts/.test(w.path)).pop();
  assert.ok(saved, 'the receipt was saved');
  r.context.savedReceipt = { id: 'r1', ...saved.data };
  r.run('receipts = [savedReceipt]; receiptHistoryFilter = "all"; currentView = "receiptsHistory"; renderReceiptsHistory();');
  const html = r.node('app').innerHTML;
  const at = html.indexOf('הפרשים מול התעודה');
  assert.ok(at > 0);
  const block = strip(html.slice(at, html.indexOf('מצא קיזוז', at)));
  assert.match(block, /חסר: ברמן אסלי 5 פיתות חויב בתעודה 12 · נסרק בפועל 4 · חסר 8 יח׳ · ₪\d+\.\d\d/);
});

// A saved receipt built by hand, to reach the offset/credit states directly.
function historyBlock(r, rc) {
  r.context.testReceipt = { id: 'rh', timestamp: Date.parse('2026-09-09T08:00:00Z'), date: '2026-09-09', status: 'open', noteParts: [], ...rc };
  r.run('receipts = [testReceipt]; receiptHistoryFilter = "all"; currentView = "receiptsHistory"; renderReceiptsHistory();');
  const html = r.node('app').innerHTML;
  assert.ok(!/התצוגה נכשלה/.test(html));
  const at = html.indexOf('הפרשים מול התעודה');
  assert.ok(at > 0, 'the differences block is shown');
  const end = html.indexOf('data-role="rc-fix-open"', at);
  return html.slice(at, end > 0 ? end : undefined);
}
const line = (productId, name, unitPrice, qty, noteQty) => ({ productId, name, unitPrice, qty, noteQty, lineTotal: Math.round(unitPrice * qty * 100) / 100 });
const rowText = (block, name) => {
  const rows = block.split('<div class="flex items-center justify-between gap-2 py-1.5 ').slice(1)
    .map(h => strip('<div class="' + h.slice(0, h.indexOf('</button>'))));
  return rows.find(t => t.includes(name)) || '';
};

test('history: an internal price offset shrinks the row — that product keeps the plain row, the others get numbers', () => {
  const r = runtime();
  // v120: הקיזוז הפנימי לפי המחירון בקטלוג (זהות), לא לפי המחיר שחויב
  r.run("products = products.concat([{ id: 'pa', name: 'לחם א', listPrice: 5, price: 5 }, { id: 'pb', name: 'לחם ב', listPrice: 5, price: 5 }, { id: 'pc', name: 'חלה', listPrice: 7, price: 7 }]);");
  const block = historyBlock(r, { items: [
    line('pa', 'לחם א', 5, 2, 5),   // short 3, one of them offset by B's surplus at the same price
    line('pb', 'לחם ב', 5, 2, 1),   // surplus 1, fully consumed by the offset
    line('pc', 'חלה', 7, 4, 6)      // short 2, untouched
  ] });
  assert.equal(rowText(block, 'לחם א'), 'חסר: לחם א 2 יח׳ · ₪10.00 מצא קיזוז', 'n = 2 after the offset ≠ 5 − 2: plain row');
  assert.equal(rowText(block, 'חלה'), 'חסר: חלה חויב בתעודה 6 · נסרק בפועל 4 · חסר 2 יח׳ · ₪14.00 מצא קיזוז');
  assert.equal(rowText(block, 'לחם ב'), '', 'the fully offset surplus is not listed');
});

test('history: a stored external offset and goods delivered later both keep the plain row', () => {
  const r = runtime();
  const block = historyBlock(r, {
    items: [
      line('pa', 'לחם א', 5, 4, 12),  // short 8, 3 of them offset against another receipt → n = 5
      line('pc', 'חלה', 7, 7, 12),    // was 4 of 12; 3 arrived later with the driver → qty 7, n = 5
      line('pd', 'פיתות', 3, 0, 2)     // short 2, nothing else
    ],
    externalOffsets: [{ id: 'x1', otherId: 'other', productId: 'pa', dir: 'short', qty: 3, name: 'לחם א' }],
    shortGoodsNotes: [{ at: Date.parse('2026-09-10T08:00:00Z'), amount: 21, items: [{ productId: 'pc', name: 'חלה', qty: 3, unitPrice: 7 }] }]
  });
  assert.equal(rowText(block, 'לחם א'), 'חסר: לחם א 5 יח׳ · ₪25.00 מצא קיזוז');
  assert.equal(rowText(block, 'חלה'), 'חסר: חלה 5 יח׳ · ₪35.00 מצא קיזוז', '"scanned" would include the goods that came later');
  assert.equal(rowText(block, 'פיתות'), 'חסר: פיתות חויב בתעודה 2 · נסרק בפועל 0 · חסר 2 יח׳ · ₪6.00 מצא קיזוז');
});

test('history: numbers never leak NaN/undefined from odd saved data', () => {
  const r = runtime();
  for (const items of [
    [{ productId: 'pa', name: 'x', unitPrice: 5, qty: '2', noteQty: '5' }],
    [{ productId: '', name: 'x', unitPrice: 5, qty: 2, noteQty: 5 }],
    [null, { productId: 'pa', name: 'x', unitPrice: 5, qty: 2, noteQty: 5 }, { productId: 'deposit-1', name: 'פיקדון', unitPrice: 1, qty: 3, noteQty: 5, isDeposit: true }]
  ]) {
    r.context.oddItems = items;
    const out = r.run(`(function () {
      const rc = { id: 'odd', items: oddItems.filter(Boolean) };
      const di = receiptDiscrepancyInfo(rc);
      return di.shortItems.map(s => receiptDiffRowHtml(rc, s, 'short')).concat(di.overItems.map(s => receiptDiffRowHtml(rc, s, 'over'))).join('');
    })()`);
    assert.ok(out.length > 0);
    assert.ok(!/NaN|undefined|null/.test(strip(out)), strip(out));
  }
});

// Review fixes. The line's paper quantity is not always what the paper says:
// "קלוט ותטפל בהפרש אחר כך" derives it from the findings. Until v105 each
// finding overwrote the last one (received ± qty), so two findings on one
// product gave a number the paper never printed; since v105 it is written once
// per product from the engine's paper-vs-scan comparison, not from the analyzer's
// claims (tests/handle-later-paper-qty).
// Receipts saved before that, and partial baskets, still need the guards: the
// summary checks the quantity against what was read for that product; the
// saved receipt checks that its paper quantities close the document at all.
function acceptConfirm(r) {
  r.run('if (confirmCb) { const cb = confirmCb; hideConfirm(); cb(); }');
}
async function savedHistoryBlock(r) {
  await r.run('confirmReceipt()');
  const saved = r.writes.filter(w => w.op === 'set' && /receipts/.test(w.path)).pop();
  assert.ok(saved, 'the receipt was saved');
  r.context.savedReceipt = { id: 'r1', ...saved.data };
  r.run('receipts = [savedReceipt]; receiptHistoryFilter = "all"; currentView = "receiptsHistory"; renderReceiptsHistory();');
  const html = r.node('app').innerHTML;
  assert.ok(!/התצוגה נכשלה/.test(html));
  const at = html.indexOf('הפרשים מול התעודה');
  assert.ok(at > 0, 'the differences block is shown');
  const end = html.indexOf('data-role="rc-fix-open"', at);
  return html.slice(at, end > 0 ? end : undefined);
}

test('close "handle later" after a substitution split: the saved paper quantity is what the paper billed, not received ± the last claim', async () => {
  // Paper 238 = 12, 101 = 10; scanned 238 = 4, 101 = 12. The analyzer says
  // shortage 238 × 6 plus substitution 238 → 101 × 2, and the evaluation is not
  // valid, so only ai-close-receipt is offered. The saved 238 paper quantity is
  // the 12 on the paper, from the engine's paper-vs-scan comparison (until v105
  // the last claim won: 4 + 2 = 6, "חסר 2" and 6 units nobody owned) — the same
  // number ai-apply saves.
  const r = await scanned([[238, 12], [101, 10]], { 238: 4, 101: 12 });
  adoptClaims(r, [
    { kind: 'shortage', productId: 'code_238', quantity: 6 },
    { kind: 'substitution', productId: 'code_238', substituteProductId: 'code_101', quantity: 2 }
  ]);
  r.run('aiScanEvaluation.valid = false; aiDetailsOpen = false; renderReconcile();');
  assert.match(r.node('app').innerHTML, /data-role="ai-close-receipt"/);
  r.click('ai-close-receipt');
  acceptConfirm(r);
  assert.equal(r.run("String(reconcileData.find(l => l.productId === 'code_238').noteQty)"), '12');
  assert.equal(r.run("String(reconcileData.find(l => l.productId === 'code_101').noteQty)"), '10');
  const text = strip(r.node('rsBody').innerHTML);
  assert.ok(!/חויב בתעודה 6|חסר 2\b/.test(text), text);
  assert.match(text, /ברמן אסלי 5 פיתות חויב בתעודה 12 · נסרק בפועל 4 · חסר 8/, text);
  assert.match(text, /אחיד פרוס ברמן חויב בתעודה 10 · נסרק בפועל 12 · עודף 2/);

  // History: billed − scanned = the gap on every row, and nothing is left unowned.
  const block = await savedHistoryBlock(r);
  assert.match(rowText(block, 'ברמן אסלי 5 פיתות'), /^חסר: ברמן אסלי 5 פיתות חויב בתעודה 12 · נסרק בפועל 4 · חסר 8 יח׳ · ₪39\.30 מצא קיזוז$/);
  assert.match(rowText(block, 'אחיד פרוס ברמן'), /^עודף: אחיד פרוס ברמן חויב בתעודה 10 · נסרק בפועל 12 · עודף 2 יח׳ · ₪11\.48 מצא קיזוז$/);
  assert.ok(!strip(block).includes('פער יחידות שטרם שויך'), strip(block));
  assert.ok(!strip(block).includes('פער סכום שטרם שויך'), strip(block));
  assert.ok(strip(block).includes('תעודת ספק ₪116.37 · סכום מודפס, לזיהוי בלבד'), strip(block)); // v120: הכסף של התעודה לזיהוי בלבד
});

test('partial basket closed "handle later": the summary says "billed (resolved rows)", the saved receipt keeps the plain row', async () => {
  // The third paper row (3 more of 238) has a code nobody knows, so the basket
  // is incomplete and "billed" counts only the rows that were resolved.
  const data = makeData([[238, 12], [101, 10], [238, 3]], { 238: 4, 101: 10 });
  Object.assign(data.paper.scan.documents[0].rows[2], { itemCode: '99999', barcode: '1234567890123', description: 'שורה לא קריאה' });
  const r = runtime({ data });
  await r.scan();
  r.run('openReconcile()');
  assert.equal(r.run('aiScanEvaluation.basketComplete'), false);
  r.click('ai-close-receipt');
  acceptConfirm(r);
  const text = strip(r.node('rsBody').innerHTML);
  assert.match(text, /ברמן אסלי 5 פיתות חויב \(שורות שזוהו\) 12 · נסרק בפועל 4 · חסר 8/, text);
  assert.ok(!/חויב בתעודה 12/.test(text));

  // v120: בלי עוגנים התעודה השמורה יודעת רק את השורות שזוהו, והן מוצגות כפי שנשמרו.
  const block = await savedHistoryBlock(r);
  assert.match(rowText(block, 'ברמן אסלי 5 פיתות'), /^חסר: ברמן אסלי 5 פיתות חויב בתעודה 12 · נסרק בפועל 4 · חסר 8 יח׳ · ₪[\d.]+ מצא קיזוז$/);
  // עוגן שורות שאומר "3 שורות בנייר" מול 2 שנשמרו — "חויב בתעודה" אינו שלם, השורה נשארת פשוטה
  r.run("receipts[0].noteParts = [{ lines: 3, kind: 'charge' }]; renderReceiptsHistory();");
  const html2 = r.node('app').innerHTML;
  const block2 = html2.slice(html2.indexOf('הפרשים מול התעודה'));
  assert.ok(!/חויב בתעודה/.test(strip(block2)), strip(block2));
  assert.match(rowText(block2, 'ברמן אסלי 5 פיתות'), /^חסר: ברמן אסלי 5 פיתות 8 יח׳ · ₪[\d.]+ מצא קיזוז$/);
});

test('a credit note in the same delivery: the net quantity is never labelled as billed — main card, summary, history', async () => {
  const r = await scanned([[238, 12], [101, 10]], { 238: 4, 101: 10 });
  r.run('aiDetailsOpen = false; renderReconcile();');
  assert.deepEqual(cells(mainRows(r.node('app').innerHTML)[0]), { 'חויב בתעודה': '12', 'נסרק בפועל': '4', 'חסר': '8' }, 'control: no credit note');
  // The delivery also carries a credit note: what was read is charge − credit.
  const withCredit = "receiptNotes = receiptNotes.concat([{ amount: 5, kind: 'credit' }]);";
  r.run('const chargeOnlyNotes = receiptNotes.slice(); ' + withCredit + ' aiDetailsOpen = false; renderReconcile();');
  const html = r.node('app').innerHTML;
  assert.ok(!/התצוגה נכשלה/.test(html));
  const [main] = mainRows(html);
  assert.ok(strip(main).startsWith('ברמן אסלי 5 פיתות חסר 8'), strip(main));
  assert.deepEqual(cells(main), {});

  r.run('receiptNotes = chargeOnlyNotes;');
  r.click('ai-apply');
  assert.match(strip(r.node('rsBody').innerHTML), /ברמן אסלי 5 פיתות חויב בתעודה 12 · נסרק בפועל 4/, 'control: no credit note');
  r.run(withCredit + ' presentReconcileSummary(pendingReceipt.lines, false, {});');
  const text = strip(r.node('rsBody').innerHTML);
  assert.match(text, /ברמן אסלי 5 פיתות התקבל 4 · חסר 8/);
  assert.ok(!/חויב בתעודה/.test(text));

  const items = [line('pa', 'לחם א', 5, 4, 12)];
  const charge = { amount: 60, kind: 'charge' };
  assert.equal(rowText(historyBlock(runtime(), { items, noteParts: [charge] }), 'לחם א'), 'חסר: לחם א חויב בתעודה 12 · נסרק בפועל 4 · חסר 8 יח׳ · ₪40.00 מצא קיזוז', 'control: charge only');
  assert.equal(rowText(historyBlock(runtime(), { items, noteParts: [charge, { amount: 10, kind: 'credit' }] }), 'לחם א'), 'חסר: לחם א 8 יח׳ · ₪40.00 מצא קיזוז');
});

test('history: paper quantities that do not close the document (units gap) keep every row plain', () => {
  const items = [line('pa', 'לחם א', 5, 4, 12), line('pc', 'חלה', 7, 3, 3)];
  const numbers = 'חסר: לחם א חויב בתעודה 12 · נסרק בפועל 4 · חסר 8 יח׳ · ₪40.00 מצא קיזוז';
  const plain = 'חסר: לחם א 8 יח׳ · ₪40.00 מצא קיזוז';
  assert.equal(rowText(historyBlock(runtime(), { items, noteParts: [{ amount: 81, units: 15, kind: 'charge' }] }), 'לחם א'), numbers, '12 + 3 = 15 units: closes');
  assert.equal(rowText(historyBlock(runtime(), { items, noteParts: [{ amount: 96, units: 18, kind: 'charge' }] }), 'לחם א'), plain, '3 units on the paper are on no line');
  // v120: פער כסף שמור מתעודה ישנה אינו פותח ואינו מסתיר את המספרים
  assert.equal(rowText(historyBlock(runtime(), { items, noteParts: [{ amount: 81, units: 15, kind: 'charge' }], unresolvedAmountGap: 14.5 }), 'לחם א'), numbers, 'a stored amount gap is ignored');
});
