import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './receipt-scan-harness.mjs';

function fixture(forms = ['promotion', 'regular']) {
  const products = [
    { id:'spelt',code:'649',barcode:'4685447',name:'לחמניות בדיקה',listPrice:14.94,price:10.458,discountPct:30,discountSet:true },
    { id:'buns',code:'1231',barcode:'498256',name:'לחמניות עשרייה בדיקה',listPrice:20.46,price:10.399818,discountPct:49.17,discountSet:true },
    { id:'active',code:'339',barcode:'497044',name:'לחם מבצע בדיקה',listPrice:17.21,price:12.047,discountPct:30,discountSet:true }
  ];
  const promos = products.slice(1).map((p,i) => ({ id:'p-'+p.id,productIds:[p.id],fixedPrice:i ? 10 : 8.5,
    type:'monthEnd',minQty:1,minUnit:'unit',start:'2026-09-01',end:'2026-10-31' }));
  const prices = [10.458, ...forms.map((f,i) => f === 'promotion' ? promos[i].fixedPrice : f === 'full' ? products[i+1].listPrice : products[i+1].price)];
  const qty = [2,8,8];
  const rows = products.map((p,i) => ({ sourcePage:1,lineNumber:i+10,itemCode:p.code,barcode:p.barcode,
    description:p.name,quantity:qty[i],unitPriceExVat:i && forms[i-1] === 'promotion' ? promos[i-1].fixedPrice
      : i && forms[i-1] === 'regular' ? p.price : p.listPrice,confidence:.99 }));
  const net = Math.round(prices.reduce((s,p,i)=>s+p*qty[i],0)*100)/100;
  return { products,promos,items:products.map((p,i)=>({ productId:p.id,name:p.name,barcode:p.barcode,qty:qty[i] })),
    paper:{ok:true,serviceVersion:5,verification:{version:1,status:'agreed',primaryReads:2,escalationAttempted:false,readCount:2,issues:[]},
      reads:[read('luna'),read('luna')],scan:{warnings:[],documents:[{noteIndex:0,docType:'invoice',docNumber:'87654321',docDate:'09/09/2026',
        pageCount:1,totalUnits:18,printedLines:3,netToChargeExVat:net,confidence:.99,rows,warnings:[]}]}} };
}
function read(model) { return {model,usage:{input_tokens:100,output_tokens:20,total_tokens:120}}; }
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
test('two agreeing cheap reads with 14.84 trigger one fresh verification and preserve 14.94 from it',async()=>{
  const data=fixture(), correct=strong(data);
  data.paper.scan.documents[0].rows[0].unitPriceExVat=14.84;
  const r=setup(data,[correct]); await r.scan();
  assert.equal(r.requests.length,2);
  const request=JSON.parse(r.requests[1].body);
  assert.equal(request.mode,'verify');
  assert.equal(request.documents[0].pages[0],JSON.parse(r.requests[0].body).documents[0].pages[0]);
  assert.ok(request.verificationTargets.some(t=>t.lineNumber===10 && t.field==='unitPriceExVat'));
  assert.ok(!r.requests[1].body.includes('14.94') && !r.requests[1].body.includes('14.84'));
  assert.equal(r.run('aiScanResponse.scan.documents[0].__pricePaper.rows[0].unitPriceExVat'),14.94);
  assert.equal(r.run('receiptPriceAudit().rows[0].result'),'match');
  assert.equal(r.run('aiScanResponse.perDocument[0].usage.total_tokens'),360);
  assert.deepEqual(json(r,'products'),data.products);
});
test('a price still different after Terra remains a real difference, with no fourth read',async()=>{
  const data=fixture(); data.paper.scan.documents[0].rows[0].unitPriceExVat=14.84;
  const r=setup(data,[strong(data)]); await r.scan();
  assert.equal(r.requests.length,2);
  assert.equal(r.run('receiptPriceAudit().rows[0].result'),'difference');
  assert.equal(r.run('aiScanResponse.scan.documents[0].__pricePaper.rows[0].unitPriceExVat'),14.84);
});
test('server escalation already used the third read, so a catalog difference cannot trigger another',async()=>{
  const data=fixture(); data.paper.scan.documents[0].rows[0].unitPriceExVat=14.84;
  data.paper.verification.escalationAttempted=true; data.paper.verification.status='verified';
  const r=setup(data); await r.scan();
  assert.equal(r.requests.length,1);
  assert.equal(r.run('receiptPriceAudit().rows[0].result'),'difference');
});
for(const first of ['promotion','regular','full']) for(const second of ['promotion','regular','full']) {
  test('valid promotion prices do not trigger OCR: '+first+' / '+second,async()=>{
    const r=setup(fixture([first,second])); await r.scan();
    assert.equal(r.requests.length,1);
    assert.ok(json(r,'receiptPriceAudit().rows').every(row=>row.result==='match'));
  });
}
test('a missing discount does not trigger another OCR request or a guessed discount',async()=>{
  const data=fixture(); data.products[0].discountSet=false; data.products[0].discountPct=0; data.products[0].price=14.94;
  const r=setup(data); await r.scan();
  assert.equal(r.requests.length,1);
  assert.equal(r.run('receiptPriceAudit().rows[0].missingDiscount'),true);
  assert.equal(r.run('products[0].discountSet'),false);
});
test('an unexplained monetary mismatch with known discounts gets one verification',async()=>{
  const data=fixture(), correct=strong(data); data.paper.scan.documents[0].netToChargeExVat+=5;
  const r=setup(data,[correct]); await r.scan();
  assert.equal(r.requests.length,2);
  assert.ok(JSON.parse(r.requests[1].body).verificationTargets.some(t=>t.field==='netToChargeExVat'));
});
test('a failed verification preserves quantities and marks only the suspect row as unverified',async()=>{
  const data=fixture(); data.paper.scan.documents[0].rows[0].unitPriceExVat=14.84;
  const r=setup(data,[new Error('network failed')]); await r.scan();
  assert.equal(r.requests.length,2, 'no automatic network replay');
  assert.equal(r.run('bermanOcrPendingDocs().length'),1);
  assert.equal(r.run('receiptPriceAudit().rows[0].capability'),'ocr_uncertain');
  assert.equal(r.run('receiptPriceAudit().rows[1].result'),'match');
  assert.match(r.run('receiptPriceAuditHtml()'),/נשארו מספרים לבדיקה/);
  assert.deepEqual(json(r,'receiptList'),data.items);
  r.run('finishReceipt()');
  assert.equal(r.run('pendingReceipt'),null);
  const next=runtime({data,storage:r.storage}); next.run('restoreReceiptDraft()');
  assert.equal(next.requests.length,0);
  assert.equal(next.run('bermanOcrPendingDocs().length'),1);
});
test('manual correction changes the printed price and keeps the original OCR and physical count',async()=>{
  const data=fixture(); data.paper.scan.documents[0].rows[0].unitPriceExVat=14.84;
  const r=setup(data,[new Error('network failed')]); await r.scan();
  const before=json(r,'receiptList');
  r.context.document.querySelectorAll=selector=>selector==='[data-ocr-doc]'
    ? [{dataset:{ocrDoc:'0',ocrKey:'0:unitPriceExVat'},value:'14.94'}] : [];
  assert.equal(r.run('bermanConfirmOcr(0)'),true);
  assert.equal(r.run('bermanOcrPendingDocs().length'),0);
  assert.equal(r.run('aiScanResponse.scan.documents[0].__pricePaper.rows[0].unitPriceExVat'),14.94);
  assert.equal(r.run('aiScanResponse.scan.documents[0].__bermanOcrOriginalPaper.rows[0].unitPriceExVat'),14.84);
  assert.deepEqual(json(r,'receiptList'),before);
  assert.equal(r.requests.length,2);
  const next=runtime({data,storage:r.storage}); next.run('restoreReceiptDraft()');
  assert.equal(next.run('aiScanResponse.scan.documents[0].__pricePaper.rows[0].unitPriceExVat'),14.94);
  assert.equal(next.run('bermanOcrPendingDocs().length'),0);
});
test('an unresolved disagreement from the server cannot be called a price match',async()=>{
  const data=fixture(); data.paper.verification={...data.paper.verification,status:'needs_review',escalationAttempted:true,
    issues:[{noteIndex:0,sourcePage:1,lineNumber:10,rowIndex:0,field:'unitPriceExVat',reason:'disagreement'}]};
  const r=setup(data); await r.scan();
  assert.equal(r.requests.length,1);
  assert.equal(r.run('receiptPriceAudit().rows[0].capability'),'ocr_uncertain');
  assert.equal(r.run('receiptPriceAudit().complete'),false);
});
test('reload of a verified scan uses saved results without another request',async()=>{
  const data=fixture(); const r=setup(data); await r.scan();
  const next=runtime({data,storage:r.storage}); next.run('restoreReceiptDraft(); prepareAiInvoiceScan()');
  assert.equal(next.requests.length,0);
  assert.equal(next.run('aiScanResponse.scan.documents[0].__bermanOcrVerification.status'),'agreed');
});
