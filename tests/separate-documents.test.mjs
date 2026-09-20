// v100 — שתי תעודות שצולמו ככרטיס אחד, על מודול האפליקציה המלא.
// המקרה מ-20.9.2026: תעודת משלוח ולצידה תעודה שנייה של אותו משלוח צולמו
// כ"עמוד נוסף" של אותה תעודה. השרת החזיר את שורות שני העמודים מול בלוק
// הסיכום של העמוד הראשון, והמסך הכריז על פער של ₪39.08 "מעל סיבולת העיגול —
// כמעט תמיד אחוז הנחה שהתיישן". הבדיקות כאן לוחצות על אותם כפתורים בדיוק.
//
// הרצה: node --test tests/separate-documents.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as harness from './receipt-scan-harness.mjs';

const { runtime, fixture } = harness;
const json = (r, expression) => JSON.parse(r.run('JSON.stringify(' + expression + ')'));
const settle = async () => { for (let i = 0; i < 16; i++) await new Promise(resolve => setImmediate(resolve)); };
const PAGE = { dataUrl: 'data:image/jpeg;base64,Zml4dHVyZQ==', orientationConfirmed: true };

const PRODUCTS = [
  { id: 'bread', name: 'אחיד פרוס ברמן', code: '101', barcode: '497112', price: 5.7408, listPrice: 6.24, discountPct: 8, discountSet: true },
  { id: 'challah', name: 'חלה מרובעת ברמן', code: '450', barcode: '498393', price: 4.6276, listPrice: 5.03, discountPct: 8, discountSet: true },
  { id: 'pita', name: 'ברמן אסלי 5 פיתות', code: '238', barcode: '497204', price: 4.9131, listPrice: 7.95, discountPct: 38.2, discountSet: true }
];
const row = (p, sourcePage, lineNumber, quantity) => ({ sourcePage, lineNumber, itemCode: p.code, barcode: p.barcode,
  description: p.name, quantity, unitPriceExVat: p.listPrice, confidence: 0.95 });
// העמוד הראשון: 15 × 5.7408 = 86.11 + 6 × 4.6276 = 27.77 → ₪113.88, 21 יח׳, 2 שורות.
const FIRST = { docNumber: '244685560', rows: [row(PRODUCTS[0], 1, 1, 15), row(PRODUCTS[1], 1, 2, 6)], net: 113.88, units: 21, lines: 2 };
// התעודה השנייה: 8 × 4.9131 = ₪39.30, 8 יח׳, שורה אחת.
const SECOND = { docNumber: '290094585', rows: [row(PRODUCTS[2], 1, 1, 8)], net: 39.30, units: 8, lines: 1 };
const MODEL_NOTE = 'עמוד 2 אינו המשך של התעודה שבעמוד 1: הוא כולל כותרת ומספר תעודה נפרדים (290094585).';
const SCAN_NOTE = 'קבוצת התמונות שסומנה כ-noteIndex 0 מכילה בפועל שתי תעודות מודפסות נפרדות.';

function document(note, overrides) {
  return Object.assign({ noteIndex: 0, docNumber: note.docNumber, docType: 'invoice', docDate: '20/09/2026', pageCount: 1,
    totalUnits: note.units, printedLines: note.lines, netToChargeExVat: note.net,
    vatAmountPrinted: Math.round(note.net * 18) / 100, totalToChargeInclVat: Math.round(note.net * 118) / 100,
    confidence: 0.82, warnings: [], rows: note.rows }, overrides || {});
}
function payload(documents, warnings) {
  return { ok: true, serviceVersion: 5, model: 'fixture', requestId: 'two-notes', scan: { documents, warnings: warnings || [] } };
}
// שני העמודים בכרטיס אחד — כפי שהשרת באמת החזיר: הסיכום של העמוד הראשון, השורות של שניהם.
function mergedPayload() {
  const rows = FIRST.rows.concat(SECOND.rows.map(r => Object.assign({}, r, { sourcePage: 2 })));
  return payload([document(FIRST, { pageCount: 2, rows, warnings: [MODEL_NOTE] })], [SCAN_NOTE]);
}
function data(paper) { return Object.assign({}, fixture(), { products: PRODUCTS, promos: [], items: [], paper }); }
function photoScreen(r, cards, pagesPerCard) {
  r.run(`currentView = 'receiving'; mainMode = 'receiving'; receiptList = []; receiptOpened = false;
    openReceivingScanner = () => {}; bermanSeedPhotoFirstScan(${cards});
    aiScanDocuments.forEach(d => { d.pages = ${JSON.stringify(Array.from({ length: pagesPerCard }, () => PAGE))}; }); renderReceiving();`);
}
function manualScreen(r) {
  const html = r.node('app').innerHTML;
  assert.match(html, /data-manual-receiving/);
  return html;
}

test('two notes photographed as one card are named as such, not as a stale discount', async () => {
  const r = runtime({ data: data(mergedPayload()) });
  photoScreen(r, 1, 2);
  r.click('rc-open-photo-quantity'); await settle();
  assert.equal(r.run('receiptPaperScanState'), 'failed');
  const problems = json(r, 'receiptPaperScanProblems');
  assert.equal(problems.length, 1, JSON.stringify(problems));
  assert.match(problems[0], /יותר מתעודה אחת/);
  assert.match(problems[0], /244685560/);
  assert.match(problems[0], /2 שורות · 21 יח׳ · ₪113\.88/);
  assert.match(problems[0], /מעמוד 2 מתחילה תעודה אחרת/);
  assert.match(problems[0], /שורה אחת · 8 יח׳/);
  assert.doesNotMatch(problems[0], /אחוז הנחה|סיבולת העיגול/);
  const html = manualScreen(r);
  assert.match(html, /צריך להשלים את פענוח התעודה/);
  assert.match(html, /יותר מתעודה אחת/);
  // הערות המודל, שעד כאן לא הוצגו בשום מקום במסך הקליטה.
  assert.match(html, /290094585/);
  assert.match(html, /שתי תעודות מודפסות נפרדות/);
  // הכפתור אומר מה הוא עושה.
  assert.match(html, /data-role="rc-paper-rescan"[^>]*>[^<]*<i[^>]*><\/i> צלם את התעודות מחדש/);
  assert.doesNotMatch(html, /בדוק את צילומי התעודה/);
  assert.doesNotMatch(html, /data-role="rc-quantity-all"/);
  assert.equal(r.run('receiptNotes.length'), 0);
});

test('the explanation survives a reload with no new request, and the retake opens one card per note', async () => {
  const a = runtime({ data: data(mergedPayload()) });
  photoScreen(a, 1, 2);
  a.click('rc-open-photo-quantity'); await settle();
  const requests = a.requests.length;
  const b = runtime({ data: data(mergedPayload()), storage: a.storage });
  b.run("currentView = 'receiving'; mainMode = 'receiving'; renderReceiving()");
  assert.equal(b.run('receiptPaperScanState'), 'failed');
  assert.match(json(b, 'receiptPaperScanProblems')[0], /יותר מתעודה אחת/);
  assert.match(manualScreen(b), /שתי תעודות מודפסות נפרדות/);
  assert.equal(b.requests.length, 0);
  b.click('rc-paper-rescan');
  assert.equal(b.run('aiScanDocuments.length'), 2);
  assert.deepEqual(json(b, 'aiScanDocuments.map(d => d.pages.length)'), [0, 0]);
  assert.equal(b.run('aiScanResponse'), null);
  assert.equal(b.run('receiptOpened'), false);
  const html = b.node('app').innerHTML;
  assert.match(html, /תעודה 1/);
  assert.match(html, /תעודה 2/);
  assert.equal(JSON.parse(b.storage.get('bm_receipt_draft')).paperScan, null);
  assert.equal(a.requests.length, requests);
});

test('a retake after an ordinary failure keeps a single card', async () => {
  const r = runtime({ data: data({ ok: false, error: 'invalid_model_output' }) });
  photoScreen(r, 1, 1);
  r.click('rc-open-photo-quantity'); await settle();
  assert.equal(r.run('receiptPaperScanState'), 'failed');
  r.click('rc-paper-rescan');
  assert.equal(r.run('aiScanDocuments.length'), 1);
});

test('the same two notes as two cards pass the gate and yield two charge notes', async () => {
  const responses = [payload([document(FIRST)]), payload([document(SECOND)])];
  const r = runtime({ data: data(responses[0]) });
  r.context.fetch = async (url, options) => {
    r.requests.push({ url: String(url), body: options && options.body });
    return { ok: true, status: 200, json: async () => structuredClone(responses.shift()) };
  };
  photoScreen(r, 2, 1);
  r.click('rc-open-photo-quantity'); await settle();
  assert.equal(r.run('receiptPaperScanState'), 'ok', JSON.stringify(json(r, 'receiptPaperScanProblems')));
  assert.deepEqual(json(r, 'receiptNotes.map(n => [n.amount, n.units, n.lines, n.kind])'),
    [[113.88, 21, 2, 'charge'], [39.3, 8, 1, 'charge']]);
  assert.equal(r.run('receiptNoteTotal'), 153.18);
  assert.equal(r.run('receiptNoteUnits'), 29);
  assert.match(manualScreen(r), /data-role="rc-quantity-all"/);
});

test('a genuine two-page note still passes, and a server-reported split is never adopted silently', async () => {
  const pages = payload([document(FIRST, { pageCount: 2, rows: [FIRST.rows[0], Object.assign({}, FIRST.rows[1], { sourcePage: 2 })] })]);
  const a = runtime({ data: data(pages) });
  photoScreen(a, 1, 2);
  a.click('rc-open-photo-quantity'); await settle();
  assert.equal(a.run('receiptPaperScanState'), 'ok');
  assert.equal(a.run('receiptNotes.length'), 1);

  // SERVICE_VERSION 6: המודל השמיט את שורות העמוד השני אך דיווח על תעודה נפרדת.
  const reported = payload([document(FIRST, { pageCount: 2, separateDocuments: [{ sourcePage: 2, docNumber: '290094585' }] })]);
  const b = runtime({ data: data(reported) });
  photoScreen(b, 1, 2);
  b.click('rc-open-photo-quantity'); await settle();
  assert.equal(b.run('receiptPaperScanState'), 'failed');
  const problems = json(b, 'receiptPaperScanProblems');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /290094585/);
  assert.match(problems[0], /כרטיס משלה/);
  assert.equal(b.run('receiptNotes.length'), 0);
  b.click('rc-paper-rescan');
  assert.equal(b.run('aiScanDocuments.length'), 2);
});

test('a reported split is not swallowed by the missing-discount path', async () => {
  const products = PRODUCTS.map(p => p.id === 'challah' ? Object.assign({}, p, { discountSet: false, discountPct: 0 }) : p);
  const reported = payload([document(FIRST, { pageCount: 2, separateDocuments: [{ sourcePage: 2, docNumber: '290094585' }] })]);
  const r = runtime({ data: Object.assign(data(reported), { products }) });
  photoScreen(r, 1, 2);
  r.click('rc-open-photo-quantity'); await settle();
  assert.equal(r.run('receiptPaperScanState'), 'failed');
  assert.equal(r.run('bermanQuantityPaperState()'), null);
  assert.ok(r.run('bermanMissingDiscountProducts().length > 0'));
  const html = manualScreen(r);
  assert.match(html, /290094585/);
  assert.match(html, /data-role="rc-paper-rescan"/);
  assert.doesNotMatch(html, /berman-discount-later|data-role="rc-quantity-all"/);
  assert.match(html, /צלם קודם את התעודות מחדש/);
  assert.equal(r.run('bermanDeferDiscount()'), false);
  assert.equal(r.run('receiptNotes.length'), 0);
  assert.equal(r.run('receiptPaperScanState'), 'failed');
});

test('under the deployed v5 service the merged scan no longer opens the anchor-confirmation dialog', async () => {
  const merged = mergedPayload();
  merged.verification = { version: 1, status: 'needs_review', primaryReads: 2, escalationAttempted: true, reasons: ['inconsistent'],
    issues: [{ noteIndex: 0, field: 'totalUnits', reason: 'inconsistent' }, { noteIndex: 0, field: 'printedLines', reason: 'inconsistent' }],
    agreementCleared: 0, readCount: 3 };
  merged.scan.warnings.push('לא ניתן לאמת את הקריאה: סך יחידות. בדוק את המספר המודפס.');
  const r = runtime({ data: data(merged) });
  photoScreen(r, 1, 2);
  r.click('rc-open-photo-quantity'); await settle();
  assert.equal(r.run('receiptPaperScanState'), 'failed');
  assert.equal(r.run('aiScanResponse.scan.documents[0].__bermanOcrVerification.status'), 'needs_review');
  assert.equal(r.run('bermanOcrPendingDocs().length'), 0);
  const html = manualScreen(r);
  assert.match(html, /יותר מתעודה אחת/);
  assert.doesNotMatch(html, /בדקתי מול התעודה|berman-ocr-confirm/);
  assert.doesNotMatch(html, /לא ניתן לאמת את הקריאה/);
  assert.match(html, /שתי תעודות מודפסות נפרדות/);
});

test('a note whose first page does not close on its own keeps the numeric messages, without the stale-discount hint', async () => {
  const merged = mergedPayload();
  merged.scan.documents[0].netToChargeExVat = 114.48; // 60 אג׳ מעל הסיבולת בעמוד הראשון
  const r = runtime({ data: data(merged) });
  photoScreen(r, 1, 2);
  r.click('rc-open-photo-quantity'); await settle();
  assert.equal(r.run('receiptPaperScanState'), 'failed');
  const problems = json(r, 'receiptPaperScanProblems');
  assert.ok(problems.some(p => /סה״כ שורות/.test(p)), JSON.stringify(problems));
  assert.ok(!problems.some(p => /אחוז הנחה שהתיישן/.test(p)), JSON.stringify(problems));
  assert.ok(problems.some(p => /ייתכן שהצילומים מכילים יותר מתעודה אחת/.test(p)), JSON.stringify(problems));
  assert.equal(r.run('bermanPaperRescanDocCount()'), 1);
});
