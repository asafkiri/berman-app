// v122 — תקציב הקריאות בתשלום של הסריקה. השרת (v5) קורא כל נייר פעמיים
// במודל זול; קריאה שלישית (חזקה, בתשלום) נשלחת מהלקוח רק על יעדי אימות.
// מ-v122 יעד אימות הוא זהות או כמות בלבד: שורה שלא זוהתה במאגר (קוד הפריט)
// או שורה שהכמות שלה לא נקראה. מחיר מודפס שונה מהקטלוג, או "נטו לחיוב"
// שאינו סוגר — אינם יעדים: הכסף אינו עניין של הקליטה.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './receipt-scan-harness.mjs';

function fixture() {
  const products = [
    { id:'spelt',code:'649',barcode:'4685447',name:'לחמניות בדיקה',listPrice:14.94,price:10.458,discountPct:30,discountSet:true },
    { id:'buns',code:'1231',barcode:'498256',name:'לחמניות עשרייה בדיקה',listPrice:20.46,price:10.399818,discountPct:49.17,discountSet:true },
    { id:'active',code:'339',barcode:'497044',name:'לחם מבצע בדיקה',listPrice:17.21,price:12.047,discountPct:30,discountSet:true }
  ];
  const promos = products.slice(1).map((p,i) => ({ id:'p-'+p.id,productIds:[p.id],fixedPrice:i ? 10 : 8.5,
    type:'monthEnd',minQty:1,minUnit:'unit',start:'2026-09-01',end:'2026-10-31' }));
  const qty = [2,8,8];
  const rows = products.map((p,i) => ({ sourcePage:1,lineNumber:i+10,itemCode:p.code,barcode:p.barcode,
    description:p.name,quantity:qty[i],unitPriceExVat:p.listPrice,confidence:.99 }));
  const net = Math.round(products.reduce((s,p,i)=>s+p.price*qty[i],0)*100)/100;
  return { products,promos,items:products.map((p,i)=>({ productId:p.id,name:p.name,barcode:p.barcode,qty:qty[i] })),
    paper:{ok:true,serviceVersion:5,verification:{version:1,status:'agreed',primaryReads:2,escalationAttempted:false,readCount:2,issues:[]},
      reads:[read('luna'),read('luna')],scan:{warnings:[],documents:[{noteIndex:0,docType:'invoice',docNumber:'87654321',docDate:'09/09/2026',
        pageCount:1,totalUnits:18,printedLines:3,netToChargeExVat:net,confidence:.99,rows,warnings:[]}]}} };
}
function read(model) { return {model,usage:{input_tokens:100,output_tokens:20,total_tokens:120}}; }
// הקריאה החזקה: אותו נייר, קריאה נכונה, מסומנת "verified"
function strong(data) {
  const payload = structuredClone(data.paper);
  payload.verification = {...payload.verification,status:'verified',primaryReads:0,escalationAttempted:true,readCount:1};
  payload.reads = [read('terra')]; return payload;
}
function setup(data, responses = []) {
  const r = runtime({data});
  const queue = [data.paper,...responses];
  r.context.fetch = async (url,options) => {
    r.requests.push({url:String(url),body:options.body});
    const value = queue.shift();
    if (value instanceof Error) throw value;
    assert.ok(value, 'unexpected extra paid request');
    return {ok:true,status:200,json:async()=>structuredClone(value)};
  };
  return r;
}
const json = (r,code) => JSON.parse(r.run('JSON.stringify('+code+')'));
const targets = r => json(r, 'bermanOcrVerificationTargets(aiScanResponse, aiScanDocuments[0], aiScanResponse.scan.documents[0])');

test('identified rows with matching anchors: one request, no verification, anchors from the paper', async () => {
  const r = setup(fixture()); await r.scan();
  assert.equal(r.requests.length, 1);
  assert.equal(r.run('receiptPaperScanState'), 'ok');
  assert.deepEqual(json(r, '[receiptNoteUnits, receiptNoteLines, receiptAnchorSource]'), [18, 3, 'paper']);
  assert.deepEqual(targets(r), []);
  assert.equal(r.run('aiScanEvaluation.anchorsVerified'), true);
  assert.equal(r.run('bermanOcrPendingDocs().length'), 0);
});

test('a printed price that differs from the catalog is not a verification target and does not block', async () => {
  const data = fixture(); data.paper.scan.documents[0].rows[0].unitPriceExVat = 14.84;
  const r = setup(data); await r.scan();
  assert.equal(r.requests.length, 1, 'no paid re-read for money');
  assert.deepEqual(targets(r), []);
  r.run('openReconcile()');
  assert.equal(r.run('aiScanEvaluation.valid'), true);
  assert.equal(r.run('aiScanResponse.scan.documents[0].rows[0].__tnuvaProductId'), 'spelt', 'the code identifies the row; the price is evidence only');
  assert.deepEqual(json(r,'products'), data.products);
});

test('a "net to charge" that does not add up is identification only — no verification, anchors still adopted', async () => {
  const data = fixture(); data.paper.scan.documents[0].netToChargeExVat += 5;
  const r = setup(data); await r.scan();
  assert.equal(r.requests.length, 1);
  assert.equal(r.run('receiptPaperScanState'), 'ok');
  assert.equal(r.run('receiptNoteTotal'), data.paper.scan.documents[0].netToChargeExVat);
  assert.deepEqual(targets(r), []);
});

test('an unidentified code triggers exactly one verification of the code, and the verified read resolves it', async () => {
  const data = fixture(), correct = strong(data);
  data.paper.scan.documents[0].rows[0].itemCode = '9999'; data.paper.scan.documents[0].rows[0].barcode = '';
  const r = setup(data, [correct]); await r.scan();
  assert.equal(r.requests.length, 2);
  const request = JSON.parse(r.requests[1].body);
  assert.equal(request.mode, 'verify');
  assert.equal(request.documents[0].pages[0], JSON.parse(r.requests[0].body).documents[0].pages[0]);
  assert.deepEqual(request.verificationTargets.map(t => [t.lineNumber, t.field]), [[10, 'itemCode']]);
  assert.ok(!request.verificationTargets.some(t => ['unitPriceExVat', 'netToChargeExVat'].includes(t.field)), 'no money targets');
  assert.equal(r.run('aiScanResponse.scan.documents[0].rows[0].__tnuvaProductId'), 'spelt');
  assert.equal(r.run('aiScanResponse.scan.documents[0].__bermanOcrVerification.status'), 'verified');
  assert.equal(r.run('aiScanResponse.perDocument[0].usage.total_tokens'), 360);
  assert.equal(r.run('receiptPaperScanState'), 'ok');
  assert.deepEqual(json(r,'products'), data.products);
});

test('a quantity that was not read never opens a paid request of its own — the paper fails on its units anchor instead', async () => {
  const data = fixture();
  data.paper.scan.documents[0].rows[0].quantity = null;
  const r = setup(data); await r.scan();
  assert.equal(r.requests.length, 1, 'no verify request for a quantity alone (main sent none either)');
  assert.deepEqual(targets(r), []);
  assert.equal(r.run('receiptPaperScanState'), 'failed');
  assert.ok(json(r, 'receiptPaperScanProblems').some(p => /סה״כ כללי/.test(p)));
});

test('a quantity that was not read rides on a verification that identity already forces', async () => {
  const data = fixture(), correct = strong(data);
  Object.assign(data.paper.scan.documents[0].rows[0], { quantity: null, itemCode: '9999', barcode: '' });
  const r = setup(data, [correct]); await r.scan();
  assert.equal(r.requests.length, 2);
  const request = JSON.parse(r.requests[1].body);
  assert.deepEqual(request.verificationTargets.map(t => [t.lineNumber, t.field]), [[10, 'itemCode'], [10, 'quantity']]);
  assert.equal(r.run('aiScanResponse.scan.documents[0].rows[0].quantity'), 2);
  assert.equal(r.run('aiScanResponse.scan.documents[0].rows[0].__tnuvaProductId'), 'spelt');
  assert.equal(r.run('receiptPaperScanState'), 'ok');
});

test('a row the server already flagged is not re-targeted (no second paid request); it waits for manual review', async () => {
  const data = fixture();
  Object.assign(data.paper.scan.documents[0].rows[0], { itemCode: '9999', barcode: '', unitPriceExVat: 99 });
  data.paper.verification = { ...data.paper.verification, status: 'needs_review', issues: [{ noteIndex: 0, sourcePage: 1, lineNumber: 10, field: 'identity', reason: 'unreadable' }] };
  const r = setup(data); await r.scan();
  assert.equal(r.requests.length, 1);
  assert.deepEqual(targets(r), []);
  assert.equal(r.run('bermanOcrPendingDocs().length'), 1);
  // a document-level issue pulls the whole paper to manual review — no row targets at all
  const other = fixture();
  Object.assign(other.paper.scan.documents[0].rows[0], { itemCode: '9999', barcode: '', unitPriceExVat: 99 });
  other.paper.verification = { ...other.paper.verification, status: 'needs_review', issues: [{ noteIndex: 0, field: 'document', reason: 'low_confidence' }] };
  const s = setup(other); await s.scan();
  assert.equal(s.requests.length, 1);
  assert.deepEqual(targets(s), []);
});

test('analyzer: an answer with only price claims is not adopted — the engine\'s quantity findings stay', async () => {
  const data = fixture(); data.items[0].qty = 1; data.items[1].qty = 9; // spelt short 1, buns surplus 1 — units still 18
  const r = setup(data); await r.scan();
  r.run('openReconcile()');
  assert.deepEqual(json(r, 'aiScanEvaluation.findings.map(f => [f.type, f.productId, f.qty]).sort()'), [['shortage', 'spelt', 1], ['surplus', 'buns', 1]]);
  r.context.fetch = async (url, options) => {
    r.requests.push({ url: String(url), body: options.body });
    assert.equal(JSON.parse(options.body).mode, 'analyze');
    return { ok: true, status: 200, json: async () => ({ ok: true, analysis: { claims: [{ kind: 'price', productId: 'spelt', quantity: 0, billedUnitPriceExVat: 14.94, expectedUnitPriceExVat: 10.46, amountExVat: 8.96 }], summary: 'מחיר שונה', unexplained: '' } }) };
  };
  r.run('aiRunAnalyzer = auditOriginalAnalyzer');
  await r.run('aiRunAnalyzer()');
  assert.equal(r.requests.length, 2);
  assert.equal(r.run('aiAnalyzeResult && aiAnalyzeResult.accepted'), false);
  assert.equal(r.run('aiScanEvaluation.analyzerLed'), undefined);
  assert.deepEqual(json(r, 'aiScanEvaluation.findings.map(f => [f.type, f.productId, f.qty]).sort()'), [['shortage', 'spelt', 1], ['surplus', 'buns', 1]]);
  assert.equal(r.run('aiScanAllGood(aiScanEvaluation)'), false);
});

test('server escalation already used the third read: no fourth request; the row is resolved locally by name and list price', async () => {
  const data = fixture(); data.paper.scan.documents[0].rows[0].itemCode = '9999'; data.paper.scan.documents[0].rows[0].barcode = '';
  data.paper.verification.escalationAttempted = true; data.paper.verification.status = 'verified';
  const r = setup(data); await r.scan();
  assert.equal(r.requests.length, 1);
  r.run('openReconcile()');
  // v122: המחיר המודפס (המחירון) הוא עדות זהות — שם יחיד + מחירון תואם מכריעים בלי קריאה בתשלום
  assert.deepEqual(json(r, 'aiScanEvaluation.autoResolutions.map(a => [a.productId, a.method])'), [['spelt', 'auto_local_name_price']]);
  assert.equal(r.run('aiScanEvaluation.allRowsMapped'), true);
  assert.equal(r.run('aiScanEvaluation.valid'), true);
  // ובלי מחירון תואם — השורה נשארת פתוחה, ועדיין בלי קריאה נוספת
  const other = fixture(); Object.assign(other.paper.scan.documents[0].rows[0], { itemCode: '9999', barcode: '', unitPriceExVat: 99 });
  other.paper.verification.escalationAttempted = true; other.paper.verification.status = 'verified';
  const s = setup(other); await s.scan();
  assert.equal(s.requests.length, 1);
  s.run('openReconcile()');
  assert.equal(s.run('aiScanEvaluation.allRowsMapped'), false);
  assert.equal(s.run('aiScanEvaluation.valid'), false);
});

test('a failed verification preserves quantities and marks the document for review; reload makes no request', async () => {
  const data = fixture(); data.paper.scan.documents[0].rows[0].itemCode = '9999'; data.paper.scan.documents[0].rows[0].barcode = '';
  const r = setup(data, [new Error('network failed')]); await r.scan();
  assert.equal(r.requests.length, 2, 'no automatic network replay');
  assert.equal(r.run('bermanOcrPendingDocs().length'), 1);
  assert.match(r.run('bermanOcrReviewHtml()'), /נשארו מספרים לבדיקה/);
  assert.deepEqual(json(r,'receiptList'), data.items);
  r.run('finishReceipt()');
  assert.equal(r.run('pendingReceipt'), null, 'finishing waits for the review');
  assert.equal(r.run('receiptQuantityPaperRows()'), null, 'a doubtful read cannot be copied into the count');
  const next = runtime({data,storage:r.storage}); next.run('restoreReceiptDraft()');
  assert.equal(next.requests.length, 0);
  assert.equal(next.run('bermanOcrPendingDocs().length'), 1);
});

test('manual correction of the code resolves the row and keeps the original OCR and the physical count', async () => {
  const data = fixture(); data.paper.scan.documents[0].rows[0].itemCode = '9999'; data.paper.scan.documents[0].rows[0].barcode = '';
  const r = setup(data, [new Error('network failed')]); await r.scan();
  const before = json(r,'receiptList');
  r.context.document.querySelectorAll = selector => selector === '[data-ocr-doc]'
    ? [{dataset:{ocrDoc:'0',ocrKey:'0:itemCode'},value:'649'}] : [];
  assert.equal(r.run('bermanConfirmOcr(0)'), true);
  assert.equal(r.run('bermanOcrPendingDocs().length'), 0);
  assert.equal(r.run('aiScanResponse.scan.documents[0].rows[0].__tnuvaProductId'), 'spelt');
  assert.equal(r.run('aiScanResponse.scan.documents[0].__pricePaper.rows[0].itemCode'), '649');
  assert.equal(r.run('aiScanResponse.scan.documents[0].__bermanOcrOriginalPaper.rows[0].itemCode'), '9999');
  assert.deepEqual(json(r,'receiptList'), before);
  assert.equal(r.requests.length, 2);
  const next = runtime({data,storage:r.storage}); next.run('restoreReceiptDraft()');
  assert.equal(next.run('aiScanResponse.scan.documents[0].rows[0].__tnuvaProductId'), 'spelt');
  assert.equal(next.run('bermanOcrPendingDocs().length'), 0);
});

test('an unresolved disagreement from the server keeps the document under review', async () => {
  const data = fixture(); data.paper.verification = {...data.paper.verification,status:'needs_review',escalationAttempted:true,
    issues:[{noteIndex:0,sourcePage:1,lineNumber:10,rowIndex:0,field:'identity',reason:'disagreement'}]};
  const r = setup(data); await r.scan();
  assert.equal(r.requests.length, 1);
  assert.equal(r.run('bermanOcrPendingDocs().length'), 1);
  r.run('finishReceipt()');
  assert.equal(r.run('pendingReceipt'), null);
});

test('reload of a verified scan uses saved results without another request', async () => {
  const data = fixture(); const r = setup(data); await r.scan();
  const next = runtime({data,storage:r.storage}); next.run('restoreReceiptDraft(); prepareAiInvoiceScan()');
  assert.equal(next.requests.length, 0);
  assert.equal(next.run('aiScanResponse.scan.documents[0].__bermanOcrVerification.status'), 'agreed');
});
