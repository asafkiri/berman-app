import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runtime } from './receipt-scan-harness.mjs';

const json = (c, source) => JSON.parse(c.run('JSON.stringify(' + source + ')'));
const r2 = n => Math.round(n * 100) / 100;
function fixture(modes = ['promotion', 'regular']) {
  const products = [
    { id:'buns',code:'8101',barcode:'7290000008101',name:'לחמניות בדיקה',listPrice:10,price:8,discountPct:20,discountSet:true },
    { id:'bread',code:'8102',barcode:'7290000008102',name:'לחם בדיקה',listPrice:20,price:14,discountPct:30,discountSet:true },
    { id:'plain',code:'8103',barcode:'7290000008103',name:'מוצר רגיל',listPrice:5,price:4,discountPct:20,discountSet:true }
  ];
  const fixed = [7, 11], qty = [8, 3, 2];
  const promos = products.slice(0,2).map((p,i) => ({ id:'promo-'+p.id,productIds:[p.id],fixedPrice:fixed[i],
    type:'monthEnd',minQty:1,minUnit:'unit',start:'2026-09-01',end:'2026-09-30' }));
  const prices = products.map((p,i) => modes[i] === 'promotion' ? fixed[i] : modes[i] === 'full' ? p.listPrice : p.price);
  const rows = products.map((p,i) => ({ itemCode:p.code,barcode:p.barcode,description:p.name,quantity:qty[i],
    unitPriceExVat:modes[i] === 'promotion' ? fixed[i] : p.listPrice,sourcePage:1,lineNumber:i+1 }));
  return { products,promos,prices,items:products.map((p,i) => ({productId:p.id,name:p.name,barcode:p.barcode,qty:qty[i]})),
    paper:{ok:true,scan:{warnings:[],documents:[{noteIndex:0,docType:'invoice',docNumber:'PROMO-FINISH',docDate:'09/09/2026',
      pageCount:1,totalUnits:13,printedLines:3,netToChargeExVat:r2(prices.reduce((n,p,i)=>n+p*qty[i],0)),rows,warnings:[]}]}} };
}
async function scanned(data=fixture()) {
  const c=runtime({data}); await c.scan();
  c.run("currentView='receiving';receiptDupConfirmed=true;globalThis.prompts=[];showConfirm=(title)=>{prompts.push(title)}");
  return c;
}
function finish(c, manual=true) {
  if(manual) { c.run("receiptCountingMode='manual';receiptList=[]"); c.click('rc-quantity-all'); }
  else c.run('finishReceipt()');
}

for(const first of ['regular','full','promotion']) for(const second of ['regular','full','promotion']) {
  test('manual finish uses verified paper billing without a promotion question: '+first+' / '+second,async()=>{
    const data=fixture([first,second]), c=await scanned(data);
    const original=json(c,'aiScanResponse.scan'), catalog=json(c,'[products,promos]');
    finish(c);
    assert.deepEqual(json(c,'prompts'),[]);
    assert.equal(c.run('pendingReceipt && pendingReceipt.status'),'ok');
    assert.deepEqual(json(c,'pendingReceipt.lines.map(l=>l.unitPrice)'),data.prices);
    assert.equal(c.run('pendingReceipt.ex'),data.paper.scan.documents[0].netToChargeExVat);
    assert.deepEqual(json(c,'aiScanResponse.scan'),original);
    assert.deepEqual(json(c,'[products,promos]'),catalog);
    for(const [i,mode] of [first,second].entries()) assert.equal(c.run('!!pendingReceipt.lines['+i+'].promoOnPaper'),mode==='promotion');
    await c.run('confirmReceipt()');
    const receipt=c.writes.find(w=>w.op==='set').data;
    assert.equal(receipt.status,'ok');
    assert.equal(receipt.monthEndRebates.find(p=>p.id==='promo-buns').rebate,r2((data.prices[0]-7)*8));
    assert.equal(receipt.monthEndRebates.find(p=>p.id==='promo-bread').rebate,r2((data.prices[1]-11)*3));
    assert.equal(c.writes.length,1);
    assert.equal(c.requests.length,1);
  });
}
test('scanner finish and reload use the same saved paper without another scan or billing confirmation',async()=>{
  const data=fixture(), a=await scanned(data); a.run('saveReceiptDraft()');
  const b=runtime({data,storage:a.storage});
  b.run("restoreReceiptDraft();currentView='receiving';globalThis.prompts=[];showConfirm=(title)=>prompts.push(title)");
  finish(b,false);
  assert.equal(b.run('pendingReceipt.status'),'ok');
  assert.equal(b.run('pendingReceipt.lines[0].unitPrice'),7);
  assert.deepEqual(json(b,'prompts'),[]);
  assert.equal(b.requests.length,0);
});
test('printed promotion evidence resolves equal saving combinations',async()=>{
  const data=fixture();
  data.promos[1].fixedPrice=14-8/3;
  const c=await scanned(data); finish(c);
  assert.equal(c.run('pendingReceipt.status'),'ok');
  assert.equal(c.run('pendingReceipt.lines[0].unitPrice'),7);
  assert.equal(c.run('pendingReceipt.lines[1].unitPrice'),14);
  assert.deepEqual(json(c,'prompts'),[]);
});
test('a printed promotion and full billing can explain a zero overall difference',async()=>{
  const data=fixture(['promotion','full']);
  data.promos[0].fixedPrice=5.75;
  data.paper.scan.documents[0].rows[0].unitPriceExVat=5.75;
  data.paper.scan.documents[0].netToChargeExVat=114;
  const c=await scanned(data); finish(c);
  assert.equal(c.run('pendingReceipt.status'),'ok');
  assert.equal(c.run('pendingReceipt.lines[0].unitPrice'),5.75);
  assert.equal(c.run('pendingReceipt.lines[1].unitPrice'),20);
});
for(const [name,modify] of [
  ['different printed price',d=>{d.paper.scan.documents[0].rows[2].unitPriceExVat=4.9}],
  ['unexplained total',d=>{d.paper.scan.documents[0].netToChargeExVat+=1}],
  ['expired promotion',d=>{d.promos[0].end='2026-08-31'}],
  ['missing discount',d=>{d.products[2].discountSet=false}]
]) test(name+' cannot be hidden by a promotion that balances a total',async()=>{
  const data=fixture();modify(data);const c=await scanned(data);
  assert.equal(c.run("bermanVerifiedPaperPricing('2026-09-09')"),null);
  finish(c,false);
  assert.equal(c.run('pendingReceipt && pendingReceipt.status'),null);
  assert.doesNotMatch(json(c,'prompts').join(' '),/המבצע ירד/);
});
test('shortage and surplus retain the ordinary quantity findings',async()=>{
  const data=fixture();data.items[0].qty--;data.items[1].qty++;
  const c=await scanned(data);finish(c,false);
  assert.equal(c.run("bermanVerifiedPaperPricing('2026-09-09')"),null);
  assert.equal(c.run('currentView'),'reconcile');
  const types=json(c,'aiScanEvaluation.findings.map(f=>f.type)');
  assert.ok(types.includes('shortage'));assert.ok(types.includes('surplus'));
  assert.doesNotMatch(json(c,'prompts').join(' '),/המבצע ירד/);
});
test('the private saved invoice finishes without asking about the printed 8.50 promotion', {skip:!process.env.BERMAN_DISCOUNT_BACKUP},async()=>{
  const backup=JSON.parse(fs.readFileSync(process.env.BERMAN_DISCOUNT_BACKUP,'utf8'));
  const data=fixture();
  data.products=Object.entries(backup.collections.products).map(([id,p])=>({id,...p}));
  data.promos=Object.entries(backup.collections.promos).map(([id,p])=>({id,...p}));
  // Simulate a supplier-confirmed 8% discount; never infer or write user data.
  Object.assign(data.products.find(p=>p.id==='code_111'),{discountSet:true,discountPct:8,price:5.7408});
  const c=runtime({data});c.storage.set(c.run('RECEIPT_DRAFT_KEY'),JSON.stringify(backup.localDrafts.receipt));
  c.run("restoreReceiptDraft();receiptDocDate='2026-09-14';bermanRefreshDiscountRows('code_111');bermanAdoptPaperAnchors();globalThis.prompts=[];showConfirm=(title)=>prompts.push(title)");
  finish(c);
  assert.deepEqual(json(c,'prompts'),[]);
  assert.equal(c.run('pendingReceipt && pendingReceipt.status'),'ok');
  assert.equal(c.run('pendingReceipt.lines.reduce((n,l)=>n+l.qty,0)'),91);
  assert.equal(c.run("pendingReceipt.lines.find(l=>l.productId==='code_1231').unitPrice"),8.5);
  assert.equal(c.run('pendingReceipt.ex'),723.73);
  assert.equal(c.requests.length,0);
});
