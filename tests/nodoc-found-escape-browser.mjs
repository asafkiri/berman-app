// v107 — "מצאתי את התעודה" בקליטה בלי תעודה אינו מבוי סתום.
// קליטה בלי תעודה עם שורות שכבר נספרו: "סיום" עם שדות ריקים מחזיר לקליטה בלי
// תעודה, "חזור לקליטה בלי תעודה" עושה אותו דבר, ו"צלם את התעודה" חוזר לשלב
// הצילום בלי לאבד את הספירה — והקריאה מהנייר רצה מולה.
// Run: node tests/nodoc-found-escape-browser.mjs (Playwright + Chromium; BERMAN_CHROMIUM optional)
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
window.fetch=async(url)=>{if(String(url)===AI_SCAN_WORKER_URL)return{ok:true,status:200,json:async()=>structuredClone(testData.paper)};throw new Error('External network is forbidden in local replay: '+url)};
window.t={
  state:()=>({items:structuredClone(receiptList),noDoc:receiptNoDoc,opened:receiptOpened,editing:editingNotes,mode:receiptEntryMode,notes:structuredClone(receiptNotes),paperState:receiptPaperScanState,view:currentView}),
  counted:()=>{receiptList=structuredClone(testData.items);receiptNotes=[];recomputeNoteTotal();receiptNoDoc=true;receiptOpened=true;receiptEntryMode='manual';receiptDocDate='2026-09-09';editingNotes=false;saveReceiptDraft();renderReceiving();},
  photo:()=>{aiScanDocuments[0].pages=[{dataUrl:${JSON.stringify(photo)},orientationConfirmed:true}];renderReceiving();},
  closeScanner:()=>{try{closeScanner()}catch(e){}},
  regularEmpty:()=>{receiptNotes=[];recomputeNoteTotal();receiptNoDoc=false;editingNotes=true;receiptEntryMode='manual';saveReceiptDraft();renderReceiving();},
  paperDone:()=>!aiScanBusy&&receiptPaperScanState!=='running'
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
async function device(){
  const context=await browser.newContext({viewport:{width:430,height:920},serviceWorkers:'block'});
  await context.exposeBinding('__sharedRpc',(_source,operation,args)=>rpc(operation,args));
  await context.route('**/*',route=>{if(route.request().url().startsWith(url)||route.request().url().startsWith('data:'))return route.continue();external.push(route.request().url());return route.abort();});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>dialog.dismiss());
  await page.goto(url);await page.waitForFunction(()=>window.sharedTest?.loaded);
  return page;
}
const state=page=>page.evaluate(()=>window.t.state());
const context=await browser.newContext({viewport:{width:430,height:920},serviceWorkers:'block'});
await context.exposeBinding('__sharedRpc',(_source,operation,args)=>rpc(operation,args));
await context.route('**/*',route=>{if(route.request().url().startsWith(url)||route.request().url().startsWith('data:'))return route.continue();external.push(route.request().url());return route.abort();});
const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
page.on('dialog',dialog=>dialog.dismiss());
const role=r=>page.locator('#app [data-role="'+r+'"]').first();
try{
  await page.goto(url);await page.waitForFunction(()=>window.t?.loaded);
  await page.evaluate(()=>t.counted());
  const items=(await state(page)).items;assert.ok(items.length>0);
  await role('rc-nodoc-photo').waitFor({state:'visible'});

  // [1] "מצאתי את התעודה — הזן" ואז "סיום" בשדות ריקים: חזרה לקליטה בלי תעודה
  await role('rc-nodoc-found').click();
  await role('rc-notes-done').waitFor({state:'visible'});
  await role('rc-notes-done').click();
  await role('rc-nodoc-found').waitFor({state:'visible'});
  let s=await state(page);assert.equal(s.editing,false);assert.equal(s.noDoc,true);assert.deepEqual(s.items,items);

  // [2] הכפתור המפורש "חזור לקליטה בלי תעודה"
  await role('rc-nodoc-found').click();
  await role('rc-nodoc-back').click();
  await role('rc-nodoc-found').waitFor({state:'visible'});
  s=await state(page);assert.equal(s.editing,false);assert.equal(s.noDoc,true);assert.deepEqual(s.items,items);

  // [3] מתוך השדות: "צלם את התעודה במקום להקליד" — שלב הצילום, הספירה נשמרת
  await role('rc-nodoc-found').click();
  await role('rc-nodoc-photo').click();
  await role('rc-open-photo').waitFor({state:'attached'});
  s=await state(page);assert.equal(s.noDoc,false);assert.equal(s.opened,false);assert.equal(s.mode,'photo');assert.deepEqual(s.items,items);
  assert.match(await page.locator('#app').innerText(),new RegExp(items.length+' שורות'));
  await page.screenshot({path:'/tmp/berman-nodoc-photo-step.png',fullPage:true});

  // [3b] משלב הצילום אפשר לבחור להקליד — נפתחים השדות, ומהם שוב לצילום
  await role('rc-entry-manual').click();
  await role('rc-notes-done').waitFor({state:'visible'});
  s=await state(page);assert.equal(s.opened,true);assert.equal(s.editing,true);assert.deepEqual(s.items,items);
  await role('rc-nodoc-photo').click();
  await role('rc-open-photo').waitFor({state:'attached'});

  // [4] "אין תעודה בכלל" משלב הצילום — חוזרים לאותה ספירה
  await role('rc-open-nodoc').click();await page.evaluate(()=>t.closeScanner());
  await role('rc-nodoc-found').waitFor({state:'visible'});
  s=await state(page);assert.equal(s.noDoc,true);assert.deepEqual(s.items,items);

  // [5] מהסרגל הכתום: "מצאתי את התעודה — צלם אותה", צילום, והקריאה רצה מול הספירה
  await role('rc-nodoc-photo').click();
  await role('rc-open-photo').waitFor({state:'attached'});
  await page.evaluate(()=>t.photo());
  await role('rc-open-photo').click();await page.evaluate(()=>t.closeScanner());
  await page.waitForFunction(()=>t.paperDone());
  s=await state(page);assert.equal(s.opened,true);assert.equal(s.noDoc,false);assert.equal(s.paperState,'ok');assert.equal(s.notes.length,1);assert.deepEqual(s.items,items);

  // [6] קליטה רגילה (לא "בלי תעודה") — "סיום" בשדות ריקים עדיין חוסם
  await page.evaluate(()=>t.regularEmpty());
  await role('rc-notes-done').click();
  s=await state(page);assert.equal(s.editing,true);
  assert.equal(await page.locator('#app [data-role="rc-nodoc-back"]').count(),0);

  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('nodoc-found escape: all checks passed');
}finally{await browser.close();server.close();}
