// v122 — replay של 20 תשובות הסריקה האמיתיות (ספטמבר–אוקטובר 2026) דרך מסלול
// הצילום המלא של האפליקציה: קריאת העוגנים מהנייר, התאמת השורות לקטלוג,
// ההשוואה לספירה, ההחלה והשמירה. ה-fixture (tests/scan-replay-2026.json) הוא
// תשובת השרת הגולמית (בלי מזהי בקשה, usage, perDocument ובלי שדות __* של הלקוח;
// השורות שוחזרו מ-__pricePaper.rows, כי התשובה השמורה היא אחרי ההתאמה), עם
// הקטלוג, המבצעים, העוגנים שהוקלדו והשורות שנספרו בכל תעודה.
//
// מה מוצמד (הבסיס נמדד על v121, לפני שהשערים עברו לכמויות):
//   • בכל 20 התעודות הנייר מאשר את עצמו (receiptPaperScanState 'ok', העוגנים
//     מהנייר), ההשוואה תקפה (valid) וסך היחידות של כל תעודה אומת.
//   • הכמות שנקראה לכל מוצר שווה למה שנשמר בפועל (noteQty ?? qty) — 20/20.
//   • ממצאים רק בשתי תעודות: 29.9 (חוסר פרנה 1) ו-4.10 (עודף לחמניות 10 בשקית 2,
//     חוסר זוג לחמניות אצבע 1). בשאר — אפס ממצאים, אפס שאריות, אפס הצעות ברקוד.
//   • תקציב הקריאות בתשלום: בקשת סריקה אחת לכל נייר (22 ל-20 תעודות: 16.9 ו-20.9
//     עם שני ניירות), ואפס יעדי אימות OCR — מה שהקוד הישן הפיק. אסור לעלות.
//   • ההחלה ("ai-apply") כותבת לכל שורה את כמות הנייר, והתעודה שנשמרת היא
//     כמויות בלבד (סכמה 2), בלי כתיבה למוצרים.
// הרצה: node --test tests/scan-replay.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runtime } from './receipt-scan-harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FX = JSON.parse(fs.readFileSync(path.join(HERE, 'scan-replay-2026.json'), 'utf8'));
const EXPECTED_FINDINGS = {
  '2026-09-29': [['shortage', 'code_3604', 1]],
  '2026-10-04': [['shortage', 'code_233', 1], ['surplus', 'code_1231', 2]],
};
const MONEY_KEYS = ['totalExVat', 'totalIncVat', 'receivedExVat', 'calculatedExVat', 'grossExVat', 'roundingAdjustment', 'supplierDiscount',
  'supplierPromoItems', 'supplierPromoMismatchItems', 'supplierCreditClaim', 'monthEndRebates', 'monthEndPending', 'promoOnPaper',
  'unresolvedAmountGap', 'priceAudit', 'discountReview'];

function replay(rc) {
  const inputs = rc.inputs;
  const data = { products: FX.products, promos: FX.promos, paper: rc.response, items: rc.items.map(l => ({ productId: l.productId, name: l.name, barcode: l.barcode || '', qty: Number(l.qty) || 0 })) };
  const r = runtime({ data, globals: { fetch: async (url, options) => {
    const body = options && options.body ? JSON.parse(options.body) : {};
    const one = structuredClone(data.paper);
    // בקשה אחת לכל נייר שצולם; הצילום אומר איזה נייר הוא
    if (inputs.length > 1 && body.documents && body.documents[0] && body.documents[0].pages) {
      const page = String(body.documents[0].pages[0]);
      const index = Number(Buffer.from(page.split(',')[1], 'base64').toString().replace('DOC', ''));
      one.scan.documents = [{ ...one.scan.documents[index], noteIndex: 0 }];
    }
    r.requests.push({ url: String(url), body: options && options.body });
    return { ok: true, status: 200, json: async () => one };
  } } });
  r.context.testDay = rc.docDate;
  r.context.testPhotos = inputs.map((d, i) => 'data:image/jpeg;base64,' + Buffer.from('DOC' + i).toString('base64'));
  return r;
}
async function scan(r, rc) {
  r.run(`receiptOpened = true; receiptDocDate = testDay; receiptList = [];
    bermanSeedPhotoFirstScan(${rc.inputs.length});
    aiScanDocuments.forEach((d, i) => { d.pages = [{ dataUrl: testPhotos[i], orientationConfirmed: true }]; });`);
  await r.run('bermanRunPaperScanInBackground()');
  r.run('receiptList = structuredClone(testData.items); saveReceiptDraft();');
}
const json = (r, expr) => JSON.parse(r.run('JSON.stringify(' + expr + ')'));
const expectedQty = rc => Object.fromEntries(rc.items.map(l => [l.productId, l.noteQty != null ? Number(l.noteQty) : Number(l.qty)]));

test('fixture: 20 תעודות, כל נייר נסגר בכמויות (סכום השורות = "סה"כ כללי", מספר השורות = "סה"כ שורות")', () => {
  assert.equal(FX.receipts.length, 20);
  for (const rc of FX.receipts) {
    for (const d of rc.response.scan.documents) {
      const q = d.rows.reduce((a, x) => a + (Number(x.quantity) || 0), 0);
      assert.equal(q, d.totalUnits, rc.docDate + ' units');
      assert.equal(d.rows.length, d.printedLines, rc.docDate + ' lines');
      for (const x of d.rows) assert.ok(!Object.keys(x).some(k => k.startsWith('__')), 'raw rows only');
    }
    assert.equal(rc.inputs.length, rc.response.scan.documents.length);
  }
});

for (const rc of FX.receipts) {
  test(rc.docDate + ': הנייר מאשר את עצמו, הכמויות תואמות לשמור, ממצאים רק איפה שהיו', async () => {
    const r = replay(rc);
    await scan(r, rc);
    const anchors = json(r, '[receiptNoteUnits, receiptNoteLines, receiptAnchorSource, receiptPaperScanState, receiptPaperScanProblems]');
    assert.equal(anchors[3], 'ok', rc.docDate + ' paper scan state: ' + JSON.stringify(anchors[4]));
    assert.equal(anchors[2], 'paper');
    const units = rc.inputs.reduce((a, d) => a + (d.kind === 'credit' ? -1 : 1) * (Number(d.units) || 0), 0);
    assert.equal(anchors[0], units, 'units anchor from the paper (net of credit)');
    assert.equal(r.requests.length, rc.inputs.length, 'one paid scan request per paper, no more');
    r.run('openReconcile()');
    assert.equal(r.run('rcStep'), 'ai');
    const ev = json(r, `(function () { const ev = aiScanEvaluation; const agg = {}; ev.aggregates.forEach((a, k) => { agg[k] = a.qty; });
      return { valid: ev.valid, unitsVerified: ev.unitsVerified, anchorsVerified: ev.anchorsVerified, allRowsMapped: ev.allRowsMapped, basketComplete: ev.basketComplete,
        findingsReady: ev.findingsReady, closure: !!(ev.closure && ev.closure.ok), errors: ev.errors, findings: ev.findings.map(f => [f.type, f.productId, f.qty]).sort(),
        suggestions: (ev.barcodeSuggestions || []).length, residuals: (ev.residuals || []).length, agg }; })()`);
    assert.deepEqual(ev.errors, [], rc.docDate);
    assert.equal(ev.valid, true, rc.docDate + ' valid');
    assert.equal(ev.unitsVerified, true);
    if (ev.anchorsVerified !== undefined) assert.equal(ev.anchorsVerified, true, 'v122: units and lines verified per paper');
    assert.equal(ev.allRowsMapped, true); assert.equal(ev.basketComplete, true); assert.equal(ev.findingsReady, true); assert.equal(ev.closure, true);
    assert.equal(ev.suggestions, 0); assert.equal(ev.residuals, 0);
    assert.deepEqual(ev.agg, expectedQty(rc), rc.docDate + ' paper quantities per product');
    assert.deepEqual(ev.findings.filter(f => ['shortage', 'surplus'].includes(f[0])), (EXPECTED_FINDINGS[rc.docDate] || []).slice().sort(), rc.docDate + ' quantity findings');
    assert.ok(ev.findings.every(f => ['shortage', 'surplus'].includes(f[0])), 'v122: no money findings — ' + JSON.stringify(ev.findings));
    // תקציב: אפס יעדי אימות OCR בתשלום (כמו בבסיס), ואין נייר שממתין לבדיקה
    const targets = json(r, '(aiScanResponse.scan.documents || []).map(d => { const t = bermanOcrVerificationTargets(aiScanResponse, aiScanDocuments[d.noteIndex] || {}, d); return Array.isArray(t) ? t.length : (t && t.targets ? t.targets.length : 0); })');
    assert.deepEqual(targets, rc.inputs.map(() => 0), rc.docDate + ' OCR verification targets');
    assert.equal(r.run('bermanOcrPendingDocs().length'), 0);
    // ההחלה כותבת את כמויות הנייר; השמירה היא כמויות בלבד
    const good = (EXPECTED_FINDINGS[rc.docDate] || []).length === 0;
    assert.equal(r.run('aiScanAllGood(aiScanEvaluation)'), good, 'all good ⇔ no findings');
    r.click('ai-apply');
    const pending = json(r, 'pendingReceipt');
    assert.ok(pending, rc.docDate + ' apply produced a summary');
    const rows = Object.fromEntries(pending.lines.filter(l => !l.isDeposit).map(l => [l.productId, l.noteQty != null ? l.noteQty : l.qty]));
    assert.deepEqual(rows, expectedQty(rc), rc.docDate + ' applied paper quantities');
    assert.equal(pending.status, good ? 'ok' : 'open');
    await r.run('confirmReceipt()');
    const w = r.writes.filter(x => x.op === 'set' && /receipts/.test(x.path)).pop();
    assert.ok(w, 'saved');
    assert.equal(w.data.schemaVersion, 2);
    for (const k of MONEY_KEYS) assert.ok(!(k in w.data), k + ' is not written');
    assert.equal(w.data.paperDocs.length, rc.inputs.length);
    assert.equal(w.data.paperDocs[0].number, rc.response.scan.documents[0].docNumber);
    assert.equal(r.writes.filter(x => /products/.test(String(x.path))).length, 0, 'no product writes');
    assert.equal(r.requests.length, rc.inputs.length, 'still one request per paper after apply and save');
  });
}
