// Two isolated real Chromium devices; the app and synchronization engine are real.
// Only Firebase storage/auth and paid OCR boundaries are replaced. No network leaves localhost.
// Run: node tests/shared-receiving-browser.mjs
// Optional: BERMAN_CHROMIUM=/path/to/chromium when Playwright browser is not installed.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { html, moduleSource, fixture } from './receipt-scan-harness.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const data = fixture(), documents = new Map();
const photo = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="450" height="650"><rect width="450" height="650" fill="white"/><text x="25" y="60" font-size="25">SHARED RECEIPT</text><path d="M25 100h400M25 150h300M25 200h350M25 250h200" stroke="black" stroke-width="6"/></svg>').toString('base64');
let transactionQueue = Promise.resolve(), releaseTransaction;
const rpc = async (operation, args = {}) => {
  if (operation === 'begin') {
    const previous = transactionQueue;
    transactionQueue = new Promise(resolve => { args.release = resolve; });
    await previous; releaseTransaction = args.release; return true;
  }
  if (operation === 'read') return documents.get(args.path) ?? null;
  if (operation === 'commit' || operation === 'batch') {
    for (const [path, value, operation] of args.writes) { if(operation==='delete') documents.delete(path);else documents.set(path, structuredClone(value)); }
  }
  if (operation === 'commit' || operation === 'abort') { releaseTransaction(); releaseTransaction = null; }
  return true;
};
const setup = `
const initializeApp = () => ({}), getAuth = () => ({currentUser:{getIdToken:async()=> 'test'}});
const initializeFirestore = () => ({}), getFirestore = () => ({});
const persistentLocalCache = () => ({}), persistentMultipleTabManager = () => ({});
const signInAnonymously = async () => ({}), onAuthStateChanged = () => {};
const doc = (_db, ...path) => path.join('/');
const snapshot = value => ({exists:()=>value!==null,data:()=>structuredClone(value),metadata:{fromCache:false,hasPendingWrites:false}});
const getDoc = async path => snapshot(await window.__sharedRpc('read',{path}));
const onSnapshot = (path, opts, callback) => {
  let stopped=false, previous;
  const poll=async()=>{
    if(stopped)return;
    const value=await window.__sharedRpc('read',{path}), encoded=JSON.stringify(value);
    if(encoded!==previous){previous=encoded;await callback(snapshot(value));}
    if(!stopped)setTimeout(poll,30);
  };poll();return()=>{stopped=true};
};
const runTransaction = async(_db,body)=>{
  await window.__sharedRpc('begin'); const writes=[];
  try{const value=await body({get:getDoc,set:(path,value)=>writes.push([path,value]),delete:path=>writes.push([path,null,'delete'])});await window.__sharedRpc('commit',{writes});return value;}
  catch(error){await window.__sharedRpc('abort');throw error;}
};
const writeBatch=()=>{const writes=[];return{set:(path,value)=>writes.push([path,value]),commit:()=>window.__sharedRpc('batch',{writes})};};
const setDoc=(path,value)=>window.__sharedRpc('batch',{writes:[[path,value]]});
`;
const replay = `
const testData = ${JSON.stringify(data)};
products=testData.products;promos=testData.promos;
aiRunAnalyzer=async()=>{};
let scanRequests=0;
window.fetch=async(url)=>{if(String(url)===AI_SCAN_WORKER_URL){scanRequests++;return{ok:true,status:200,json:async()=>structuredClone(testData.paper)}}throw new Error('External network is forbidden in local replay: '+url)};
window.sharedTest={
  state:()=>({owner:sharedReceiving?.isOwner,revision:sharedReceiving?.revision,ready:sharedReceiving?.ready,status:sharedReceiptStatus.status,dirty:sharedReceiptStatus.dirty,items:structuredClone(receiptList),photos:structuredClone(aiScanDocuments),view:currentView,reconcile:structuredClone(reconcileData),requests:scanRequests,qtyValue:$('qtyVal').value,modal:sharedReceiptModalOpen('qtyModal'),draftId:receiptDraftId}),
  scan:async()=>{receiptList=[];receiptNotes=[];receiptOpened=true;receiptDocDate='2026-09-09';receiptEntryMode='photo';receiptAnchorSource=null;bermanSeedPhotoFirstScan(1);aiScanDocuments[0].pages=[{dataUrl:${JSON.stringify(photo)},orientationConfirmed:true}];await bermanRunPaperScanInBackground();receiptList=structuredClone(testData.items);saveReceiptDraft();renderReceiving();},
  openQuantity:()=>promptQty(products.find(p=>p.id===receiptList[0].productId),'receipt'),
  openPhoto:()=>aiOpenOrientationReview(0,0,false),
  reconcile:()=>openReconcile(),
  receive:()=>setView('receiving')
};
renderReceiving();await startSharedReceiving();window.sharedTest.loaded=true;
`;
// A small local utility stylesheet preserves visibility and modal stacking while
// external Tailwind/fonts stay blocked. Screenshots are behavioral QA, not pixel QA.
const css = `.hidden{display:none!important}.flex{display:flex}.flex-col{flex-direction:column}.flex-wrap{flex-wrap:wrap}.flex-1{flex:1}.fixed{position:fixed}.sticky{position:sticky}.absolute{position:absolute}.relative{position:relative}.inset-0{inset:0}.top-0{top:0}.bottom-5{bottom:1.25rem}.left-4{left:1rem}.right-4{right:1rem}.items-center{align-items:center}.justify-center{justify-content:center}.justify-between{justify-content:space-between}.overflow-y-auto{overflow-y:auto}.w-full{width:100%}.max-w-lg{max-width:32rem}.max-w-sm{max-width:24rem}.max-w-3xl{max-width:48rem}.mx-auto{margin-left:auto;margin-right:auto}.bg-white{background:white}.bg-blue-600{background:#2563eb}.bg-slate-50{background:#f8fafc}.text-white{color:white}.p-3{padding:.75rem}.p-4{padding:1rem}.px-4{padding-left:1rem;padding-right:1rem}.py-3{padding-top:.75rem;padding-bottom:.75rem}.gap-2{gap:.5rem}.rounded-xl{border-radius:.75rem}.font-black{font-weight:900}.border{border:1px solid #cbd5e1}body{margin:0;font:16px Arial}header{background:#92400e;padding:14px;z-index:30}button,input{font:inherit;padding:8px;max-width:100%;box-sizing:border-box}button{cursor:pointer}img{max-width:100%}[class*="z-50"]{z-index:50}[class*="z-\["]{z-index:10000}[id$="Modal"]{background:#0008;align-items:center;justify-content:center}[id$="Modal"]>div{background:white;max-height:90vh;overflow-y:auto;padding:16px;box-sizing:border-box}#qtyModal>div{width:95%;max-width:420px}#sharedReceivingBanner{background:#eff6ff;padding:12px}`;
const pageHtml=html.replace(/<script\s+src="https:[^"]+"><\/script>/g,'').replace(/<link[^>]+(?:href="https:[^"]+"|rel="manifest")[^>]*>/g,'')
.replace(/<script type="module">[\s\S]*?<\/script>/,()=>'<script type="module">'+setup+moduleSource+replay+'</script>')
.replace('</head>','<style>'+css+'</style></head>');
const server=http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'none'");
  if(req.url.startsWith('/shared-receiving.js')){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(new URL('../shared-receiving.js',import.meta.url)));}
  else if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(pageHtml);}
  else {res.statusCode=404;res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.BERMAN_CHROMIUM,args:['--no-sandbox']});
const errors=[],external=[];
async function device(){
  const context=await browser.newContext({viewport:{width:430,height:920},serviceWorkers:'block'});
  await context.exposeBinding('__sharedRpc',(_source,operation,args)=>rpc(operation,args));
  await context.route('**/*',route=>{if(route.request().url().startsWith(url)||route.request().url().startsWith('data:'))return route.continue();external.push(route.request().url());return route.abort();});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>dialog.dismiss());
  await page.goto(url);await page.waitForFunction(()=>window.sharedTest?.loaded);
  return page;
}
const state=page=>page.evaluate(()=>window.sharedTest.state());
try{
  const a=await device();await a.waitForFunction(()=>sharedTest.state().owner);
  const b=await device();assert.equal((await state(b)).owner,false);
  await a.evaluate(()=>sharedTest.scan());
  await b.waitForFunction(()=>sharedTest.state().items.length===5);
  assert.deepEqual((await state(b)).items,(await state(a)).items);
  assert.deepEqual((await state(b)).photos,(await state(a)).photos);
  assert.equal((await state(b)).requests,0);
  const qty='[data-role="rc-qty"]';
  const firstId=(await state(a)).items[0].productId;
  const plus='[data-role="rc-plus"][data-id="'+firstId+'"]';
  await b.locator(plus).click();assert.equal((await state(b)).items[0].qty,12,'Viewer click must be blocked');
  await a.locator(plus).click();await b.waitForFunction(()=>sharedTest.state().items[0].qty===13);
  assert.equal(await b.locator(qty).first().inputValue(),'13');
  await b.screenshot({path:'/tmp/berman-shared-viewer.png',fullPage:true});
  await a.evaluate(()=>sharedTest.openPhoto());
  await b.locator('#aiOrientationModal').waitFor({state:'visible'});
  assert.equal(await b.locator('#aiOrientationImage').getAttribute('src'),photo);
  await b.locator('#aiOrientationConfirm').click();
  await a.locator('#aiOrientationConfirm').click();
  await a.evaluate(()=>sharedTest.openQuantity());
  await a.locator('#qtyVal').fill('4');
  await b.waitForFunction(()=>sharedTest.state().modal&&sharedTest.state().qtyValue==='4');
  await b.locator('#qty_done').click();assert.equal((await state(b)).items[0].qty,13,'Viewer cannot commit modal');
  await b.keyboard.press('Escape');await b.locator('#qtyModal').waitFor({state:'hidden'});
  await b.locator('#segReturns').click();await b.waitForFunction(()=>sharedTest.state().view==='returns');
  await a.locator('#qtyVal').fill('5');
  await a.waitForFunction(()=>!sharedTest.state().dirty&&sharedTest.state().status==='synced');
  const revision=(await state(a)).revision;
  await b.waitForFunction(rev=>sharedTest.state().revision>=rev,revision);
  await b.locator('#segReceiving').click();
  await b.waitForFunction(()=>sharedTest.state().modal&&sharedTest.state().qtyValue==='5');
  await b.locator('#sharedReceivingTakeover').waitFor({state:'visible'});
  await b.locator('#qtyVal').focus();
  const tabFocus=[];for(let i=0;i<15;i++){await b.keyboard.press('Tab');const id=await b.evaluate(()=>document.activeElement.id);tabFocus.push(id);if(id==='sharedReceivingTakeover')break;}
  assert.ok(tabFocus.includes('sharedReceivingTakeover'),'Tab must reach takeover in modal: '+JSON.stringify(tabFocus));
  await b.screenshot({path:'/tmp/berman-shared-takeover.png',fullPage:true});
  await b.keyboard.press('Enter');
  await b.waitForFunction(()=>sharedTest.state().owner);
  await a.waitForFunction(()=>!sharedTest.state().owner);
  assert.equal((await state(b)).qtyValue,'5');
  await b.locator('#qty_done').click();
  await a.waitForFunction(()=>sharedTest.state().items[0].qty===18);
  assert.equal((await state(b)).items[0].qty,18);
  await b.evaluate(()=>sharedTest.reconcile());
  await a.waitForFunction(()=>sharedTest.state().view==='reconcile');
  assert.deepEqual((await state(a)).reconcile,(await state(b)).reconcile);
  await a.screenshot({path:'/tmp/berman-shared-reconcile.png',fullPage:true});
  assert.equal((await state(a)).requests,1);assert.equal((await state(b)).requests,0);
  const c=await device();await c.waitForFunction(()=>sharedTest.state().view==='reconcile');
  assert.deepEqual((await state(c)).photos,(await state(b)).photos);
  assert.deepEqual((await state(c)).items,(await state(b)).items);
  assert.equal((await state(c)).owner,false);assert.equal((await state(c)).requests,0);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('PASS: owner → viewer photos/OCR/counts; read-only guards; keyboard modal takeover; restored modal after tab return; new-owner edit → old owner; reconciliation; third-device reload; no duplicated OCR; zero external requests.');
  console.log('Screenshots: /tmp/berman-shared-viewer.png /tmp/berman-shared-takeover.png /tmp/berman-shared-reconcile.png');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
