// v126 — "כפתור אחד" בדפדפן אמיתי, שני טלפונים מבודדים על אותה קליטה משותפת (מנוע הסנכרון אמיתי).
// A מצלם ב"צלם נייר מהנהג" שבפס העליון → "קרא" → "התחל לספור עכשיו": הספירה נפתחת מיד בשני הטלפונים ("קורא…"), B סופר
// בינתיים, והתעודה נכנסת לשניהם — בקשה אחת (A), אפס (B), בלי התנגשות. A מסיים והקליטה נשמרת עם
// מספר התעודה. 390px בלי גלילה לצדדים.
// Run: NODE_PATH=$(npm root -g) node tests/one-button-browser.mjs (Playwright + Chromium; BERMAN_CHROMIUM optional)
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { html, moduleSource, fixture } from './receipt-scan-harness.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const data = fixture(), documents = new Map();
const pad = n => String(n).padStart(2, '0'), now = new Date();
Object.assign(data.paper, { serviceVersion: 7, verification: { version: 1, status: 'agreed', primaryReads: 2, escalationAttempted: false, reasons: [], issues: [], readCount: 2 } });
Object.assign(data.paper.scan.documents[0], { docNumber: '77001234', internalNumber: '4411', headerText: 'תעודת משלוח', docDate: pad(now.getDate()) + '/' + pad(now.getMonth() + 1) + '/' + now.getFullYear() });
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
let scanRequests=0, gate=null;
window.fetch=async(url)=>{if(String(url)===AI_SCAN_WORKER_URL){scanRequests++;if(gate)await gate;return{ok:true,status:200,json:async()=>structuredClone(testData.paper)}}throw new Error('External network is forbidden in local replay: '+url)};
openScanner=async()=>{window.t.scanner=(window.t.scanner||0)+1;};
window.t={
  state:()=>({items:structuredClone(receiptList),opened:receiptOpened,busy:aiScanBusy,paperState:receiptPaperScanState,source:receiptAnchorSource,notes:structuredClone(receiptNotes),per:aiScanResponse&&structuredClone(aiScanResponse.perDocument),pages:aiTotalPages(),view:currentView,requests:scanRequests,conflict:!!sharedReceiptStatus.conflict,ready:!!sharedReceiving?.ready}),
  hold:()=>{let release;gate=new Promise(r=>release=r);window.t.release=()=>{gate=null;release();};},
  addCount:()=>{receiptList=receiptList.concat([{productId:testData.products[0].id,name:testData.products[0].name,barcode:testData.products[0].barcode||'',qty:2}]);saveReceiptDraft();renderReceiving();},
  countAsPaper:()=>{receiptList=testData.paper.scan.documents[0].rows.map(row=>{const p=products.find(x=>x.code===row.itemCode);return{productId:p.id,name:p.name,barcode:p.barcode,qty:Number(row.quantity)};});saveReceiptDraft();},
  finish:async()=>{finishReceipt();if(!pendingReceipt)return 'no-summary';await confirmReceipt();return 'saved';},
  saved:()=>Object.keys(window.__docs||{}),
  scrollOk:()=>document.scrollingElement.scrollWidth<=document.scrollingElement.clientWidth+1
};
setView('receiving');await startSharedReceiving();window.t.loaded=true;
`;
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
async function device(name){
  const context=await browser.newContext({viewport:{width:390,height:860},serviceWorkers:'block',locale:'he-IL'});
  await context.exposeBinding('__sharedRpc',(_source,operation,args)=>rpc(operation,args));
  await context.route('**/*',route=>{if(route.request().url().startsWith(url)||route.request().url().startsWith('data:'))return route.continue();external.push(route.request().url());return route.abort();});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(name+': '+error.message));
  page.on('dialog',dialog=>dialog.dismiss());
  await page.goto(url);await page.waitForFunction(()=>window.t?.loaded&&window.t.state().ready);
  return page;
}
const state=page=>page.evaluate(()=>window.t.state());
const svg=Buffer.from(photo.split(',')[1],'base64');
try{
  const a=await device('A'), b=await device('B');
  const role=(p,r)=>p.locator('#app [data-role="'+r+'"]').first();
  // מסך הקליטה: אין מצלמה במסך — רק "צלם נייר מהנהג" בפס העליון
  await a.locator('#ledgerBar [data-role="paper-photo"]').waitFor({state:'visible'});
  assert.equal(await a.locator('#app input[type="file"]').count(),0);
  assert.match(await a.locator('#app').innerText(),/אין קליטה פתוחה/);
  assert.ok(await a.evaluate(()=>window.t.scrollOk()),'אין גלילה לצדדים ב-390px');
  await a.screenshot({path:'/tmp/berman-one-button.png',fullPage:true});
  // A מצלם בכפתור שבפס — הצילום נכנס למסך הניירות
  // הקריאה מתחילה לבד אחרי הצילום (בלי "קרא") — עוצרים אותה כדי לראות את "התחל לספור עכשיו"
  await a.evaluate(()=>window.t.hold());
  const [chooser]=await Promise.all([a.waitForEvent('filechooser'),a.locator('#ledgerBar [data-role="paper-photo"]').click()]);
  await chooser.setFiles({name:'paper.svg',mimeType:'image/svg+xml',buffer:svg});
  await a.waitForFunction(()=>window.t.state().requests===1);
  assert.match(await a.locator('#app').innerText(),/הניירות מהנהג/);
  assert.equal(await a.locator('#app [data-role="paper-run"]').count(),0,'בלי "קרא" — הקריאה כבר רצה');
  await a.screenshot({path:'/tmp/berman-one-button-tray.png',fullPage:true});
  // בזמן הקריאה: "התחל לספור עכשיו"
  await role(a,'paper-count-now').waitFor({state:'visible'});
  await role(a,'paper-count-now').click();
  // הספירה נפתחת מיד, בשני הטלפונים: "קורא…"
  await a.waitForFunction(()=>window.t.state().view==='receiving'&&window.t.state().busy);
  await b.waitForFunction(()=>window.t.state().busy&&window.t.state().opened);
  assert.match(await b.locator('#app').innerText(),/קורא את הניירות מהנהג/);
  // B סופר בזמן שהנייר נקרא
  await b.evaluate(()=>window.t.addCount());
  await a.waitForFunction(()=>window.t.state().items.length===1);
  await a.evaluate(()=>window.t.release());
  await a.waitForFunction(()=>window.t.state().paperState==='ok');
  await b.waitForFunction(()=>window.t.state().paperState==='ok');
  for(const p of [a,b]){
    const s=await state(p);
    assert.equal(s.busy,false);assert.equal(s.source,'paper');assert.equal(s.pages,0);assert.equal(s.conflict,false);
    assert.deepEqual(s.notes.map(n=>[n.units,n.lines]),[[30,5]]);assert.equal(s.per[0].paperId,'paper_77001234');
    assert.equal(s.items.length,1,'הספירה של B נשמרה');
    assert.match(await p.locator('#app').innerText(),/העוגנים נקראו מהתעודה/);
  }
  assert.equal((await state(a)).requests,1);assert.equal((await state(b)).requests,0);
  await a.screenshot({path:'/tmp/berman-one-button-counting.png',fullPage:true});
  assert.ok(await a.evaluate(()=>window.t.scrollOk()));
  // A מסיים: הקליטה נשמרת עם מספר התעודה
  await a.evaluate(()=>window.t.countAsPaper());
  assert.equal(await a.evaluate(()=>window.t.finish()),'saved');
  const saved=[...documents.entries()].filter(([k])=>/\/receipts\//.test(k));
  assert.equal(saved.length,1);assert.equal(saved[0][1].paperDocs[0].number,'77001234');
  assert.equal(saved[0][1].paperScan.response.perDocument[0].paperId,'paper_77001234');
  assert.equal((await state(a)).requests,1);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('one-button browser: all checks passed — /tmp/berman-one-button*.png');
}finally{await browser.close();server.close();}
