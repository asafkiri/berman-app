// v140 — "כפתור אחד" בדפדפן אמיתי, שני טלפונים מבודדים — ולכל טלפון קליטה משלו (הקליטה נשמרת בטלפון, התעודה בענן רק בסיום).
// A מצלם ב"צלם נייר מהנהג" שבפס העליון → הקריאה מתחילה לבד → "זה כל הניירות" → "התחל לספור עכשיו": הספירה נפתחת מיד ב-A
// ("קורא…") ו-A סופר בזמן הקריאה. B לא רואה את הקליטה של A ואינו "צפייה בלבד" — פותח קליטה משלו ("קבלת סחורה בלי נייר") וסופר
// בה; אף טלפון לא רואה ולא דורס את הספירה של השני, ואין "המשך אותה כאן" / העברה בין טלפונים — גם כשבטלפון נשארה הבחירה הישנה
// בסנכרון בלייב. התעודה נכנסת ל-A בלבד — בקשה אחת (A), אפס (B). עד הסיום אין שום כתיבה של הקליטה לענן (לא טיוטה, לא נייר,
// לא תעודה), וריענון של A משאיר את הקליטה בלי לקרוא שוב. A מסיים: התעודה (עם מספר התעודה), תעודת המשלוח והקריאה שלה נשמרות
// בטרנזקציה אחת; אישור שאבד ו"בדוק ונסה לשמור שוב" לא יוצרים כפילות. הקליטה של B נשארת בטלפון שלו. 390px בלי גלילה לצדדים.
// Run: TZ=Asia/Jerusalem NODE_PATH=$(npm root -g) node tests/one-button-browser.mjs (Playwright + Chromium; BERMAN_CHROMIUM optional)
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { html, moduleSource, fixture } from './receipt-scan-harness.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const data = fixture(), documents = new Map(), commits = [];
const pad = n => String(n).padStart(2, '0'), now = new Date();
Object.assign(data.paper, { serviceVersion: 7, verification: { version: 1, status: 'agreed', primaryReads: 2, escalationAttempted: false, reasons: [], issues: [], readCount: 2 } });
Object.assign(data.paper.scan.documents[0], { docNumber: '77001234', internalNumber: '4411', headerText: 'תעודת משלוח', docDate: pad(now.getDate()) + '/' + pad(now.getMonth() + 1) + '/' + now.getFullYear() });
const photo = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="450" height="650"><rect width="450" height="650" fill="white"/><text x="25" y="60" font-size="25">SHARED RECEIPT</text><path d="M25 100h400M25 150h300M25 200h350M25 250h200" stroke="black" stroke-width="6"/></svg>').toString('base64');
let transactionQueue = Promise.resolve(), releaseTransaction, loseReceiptAck = false;
const rpc = async (operation, args = {}) => {
  if (operation === 'begin') {
    const previous = transactionQueue;
    transactionQueue = new Promise(resolve => { args.release = resolve; });
    await previous; releaseTransaction = args.release; return true;
  }
  if (operation === 'read') return documents.get(args.path) ?? null;
  if (operation === 'commit' || operation === 'batch') {
    for (const [path, value, operation] of args.writes) { if(operation==='delete') documents.delete(path);else documents.set(path, structuredClone(value)); }
    commits.push({ operation, paths: args.writes.map(([path]) => path) });
  }
  if (operation === 'commit' || operation === 'abort') { releaseTransaction?.(); releaseTransaction = null; }
  // v140: אישור שאבד — הטרנזקציה של סיום הקליטה נכנסה לענן, אבל התשובה לא הגיעה לטלפון
  if (operation === 'commit' && loseReceiptAck && args.writes.some(([path]) => /\/receipts\//.test(path))) { loseReceiptAck = false; throw new Error('network: the commit response was lost'); }
  return true;
};
const setup = `
// v136 שמר בטלפון בחירה בסנכרון בלייב. ב-v140 היא כבר לא מחזירה קליטה משותפת — הבדיקה משאירה אותה כדי לוודא את זה
try{localStorage.setItem('bm_shared_receiving_live','1')}catch(e){}
const initializeApp = () => ({}), getAuth = () => ({currentUser:{getIdToken:async()=> 'test'}});
const initializeFirestore = () => ({}), getFirestore = () => ({});
const persistentLocalCache = () => ({}), persistentMultipleTabManager = () => ({});
const signInAnonymously = async () => ({}), onAuthStateChanged = () => {};
const doc = (_db, ...path) => path.join('/');
const snapshot = value => ({exists:()=>value!==null,data:()=>structuredClone(value),metadata:{fromCache:false,hasPendingWrites:false}});
const getDoc = async path => snapshot(await window.__sharedRpc('read',{path}));
// קריאה מהשרת (local-receiving.js בודק בה אישור שאבד); window.__serverReadFails — הקריאה הבאה נכשלת (אין רשת)
const getDocFromServer = async path => { if(window.__serverReadFails){window.__serverReadFails=false;throw new Error('offline');} return getDoc(path); };
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
// כל בקשה בתשלום נספרת גם מחוץ לדף (__paidScan), כדי שגם אחרי ריענון יידעו שלא נקרא שוב
window.fetch=async(url)=>{if(String(url)===AI_SCAN_WORKER_URL){scanRequests++;await window.__paidScan();if(gate)await gate;return{ok:true,status:200,json:async()=>structuredClone(testData.paper)}}throw new Error('External network is forbidden in local replay: '+url)};
openScanner=async()=>{window.t.scanner=(window.t.scanner||0)+1;};
window.t={
  state:()=>({items:structuredClone(receiptList),opened:receiptOpened,noDoc:receiptNoDoc,draftId:receiptDraftId,busy:aiScanBusy,paperState:receiptPaperScanState,source:receiptAnchorSource,notes:structuredClone(receiptNotes),per:aiScanResponse&&structuredClone(aiScanResponse.perDocument),pages:aiTotalPages(),view:currentView,requests:scanRequests,conflict:!!sharedReceiptStatus.conflict,
    shared:sharedReceiving!==null,local:!!globalThis.LocalReceiving,canEdit:canEditSharedReceipt(),pending:localReceivingPending()}),
  hold:()=>{let release;gate=new Promise(r=>release=r);window.t.release=()=>{gate=null;release();};},
  addCount:(i=0,qty=2)=>{const p=testData.products[i];receiptList=receiptList.concat([{productId:p.id,name:p.name,barcode:p.barcode||'',qty}]);saveReceiptDraft();renderReceiving();},
  countAsPaper:()=>{receiptList=testData.paper.scan.documents[0].rows.map(row=>{const p=products.find(x=>x.code===row.itemCode);return{productId:p.id,name:p.name,barcode:p.barcode,qty:Number(row.quantity)};});saveReceiptDraft();},
  // 'saved' — רק כשהשמירה אושרה והקליטה נסגרה בטלפון; אחרת הטיוטה נשארת ('kept')
  finish:async()=>{finishReceipt();if(!pendingReceipt)return 'no-summary';await confirmReceipt();return !pendingReceipt&&receiptDraftId===null&&receivingDraftEmpty()?'saved':'kept';},
  scrollOk:()=>document.scrollingElement.scrollWidth<=document.scrollingElement.clientWidth+1
};
setView('receiving');await startSharedReceiving();window.t.loaded=true;
`;
const css = `.hidden{display:none!important}.flex{display:flex}.flex-col{flex-direction:column}.flex-wrap{flex-wrap:wrap}.flex-1{flex:1}.fixed{position:fixed}.sticky{position:sticky}.absolute{position:absolute}.relative{position:relative}.inset-0{inset:0}.top-0{top:0}.bottom-5{bottom:1.25rem}.left-4{left:1rem}.right-4{right:1rem}.items-center{align-items:center}.justify-center{justify-content:center}.justify-between{justify-content:space-between}.overflow-y-auto{overflow-y:auto}.w-full{width:100%}.max-w-lg{max-width:32rem}.max-w-sm{max-width:24rem}.max-w-3xl{max-width:48rem}.mx-auto{margin-left:auto;margin-right:auto}.bg-white{background:white}.bg-blue-600{background:#2563eb}.bg-slate-50{background:#f8fafc}.text-white{color:white}.p-3{padding:.75rem}.p-4{padding:1rem}.px-4{padding-left:1rem;padding-right:1rem}.py-3{padding-top:.75rem;padding-bottom:.75rem}.gap-2{gap:.5rem}.rounded-xl{border-radius:.75rem}.font-black{font-weight:900}.border{border:1px solid #cbd5e1}body{margin:0;font:16px Arial}header{background:#92400e;padding:14px;z-index:30}button,input{font:inherit;padding:8px;max-width:100%;box-sizing:border-box}button{cursor:pointer}img{max-width:100%}[class*="z-50"]{z-index:50}[class*="z-\["]{z-index:10000}[id$="Modal"]{background:#0008;align-items:center;justify-content:center}[id$="Modal"]>div{background:white;max-height:90vh;overflow-y:auto;padding:16px;box-sizing:border-box}#qtyModal>div{width:95%;max-width:420px}#sharedReceivingBanner{background:#eff6ff;padding:12px}`;
const pageHtml=html.replace(/<script\s+src="https:[^"]+"><\/script>/g,'').replace(/<link[^>]+(?:href="https:[^"]+"|rel="manifest")[^>]*>/g,'')
.replace(/<script type="module">[\s\S]*?<\/script>/,()=>'<script type="module">'+setup+moduleSource+replay+'</script>')
.replace('</head>','<style>'+css+'</style></head>');
// v140: הדף טוען את local-receiving.js (השמירה בסיום) ואת shared-return-events.js (החזרות) — ושום סקריפט שלו לא חסר
const scripts=new Set(['local-receiving.js','shared-return-events.js']), missing=[];
const server=http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'none'");
  const file=req.url.split('?')[0].slice(1);
  if(scripts.has(file)){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(new URL('../'+file,import.meta.url)));}
  else if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(pageHtml);}
  else {if(/\.js$/.test(file))missing.push(req.url);res.statusCode=404;res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.BERMAN_CHROMIUM,args:['--no-sandbox']});
const errors=[],external=[],paid={A:0,B:0};
async function device(name){
  const context=await browser.newContext({viewport:{width:390,height:860},serviceWorkers:'block',locale:'he-IL'});
  await context.exposeBinding('__sharedRpc',(_source,operation,args)=>rpc(operation,args));
  await context.exposeBinding('__paidScan',()=>{paid[name]++;});
  await context.route('**/*',route=>{if(route.request().url().startsWith(url)||route.request().url().startsWith('data:'))return route.continue();external.push(route.request().url());return route.abort();});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(name+': '+error.message));
  page.on('dialog',dialog=>dialog.dismiss());
  // v140: אין יותר קליטה משותפת שצריך לחכות שתיטען (sharedReceiving.ready) — הקליטה מקומית ומוכנה מיד
  await page.goto(url);await page.waitForFunction(()=>window.t?.loaded);
  return page;
}
const state=page=>page.evaluate(()=>window.t.state());
const svg=Buffer.from(photo.split(',')[1],'base64');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// כתיבות של הקליטה לענן: טיוטה / העברה (drafts), תעודה, תעודת משלוח והקריאה שלה
const receivingWrites=()=>[...documents.keys()].filter(k=>/\/(drafts|receipts|papers|paperScans)\//.test(k));
const counted=s=>s.items.map(l=>[l.productId,l.qty]);
// v140: אין קליטה בטלפון אחר — לא "המשך אותה כאן", לא "החזר אותה לכאן", לא צפייה בלבד ולא סנכרון בלייב
async function localOnly(p,name){
  const banner=p.locator('#sharedReceivingBanner');
  assert.match(await banner.innerText(),/הקליטה נשמרת בטלפון הזה בלבד/,name+': השורה העליונה');
  assert.equal(await banner.locator('[data-shared-receiving]:not([data-shared-receiving^="local-"])').count(),0,name+': בלי כפתורי העברה/סנכרון');
  const text=await banner.innerText()+'\n'+await p.locator('#app').innerText();
  assert.doesNotMatch(text,/המשך אותה כאן|המשך כאן|החזר אותה לכאן|ממשיכה בטלפון|צפייה בלבד|לקריאה בלבד|מסונכרן בלייב|טוען את הקליטה/,name);
}
try{
  const a=await device('A'), b=await device('B');
  const role=(p,r)=>p.locator('#app [data-role="'+r+'"]').first();
  for(const [p,name] of [[a,'A'],[b,'B']]){
    const s=await state(p);
    assert.equal(s.local,true,name+': local-receiving.js נטען');
    assert.equal(s.shared,false,name+': אין מנוע קליטה משותפת גם עם הבחירה הישנה בסנכרון');
    assert.equal(s.canEdit,true,name+': לא צפייה בלבד');
  }
  // מסך הקליטה: אין מצלמה במסך — רק "צלם נייר מהנהג" בפס העליון
  await a.locator('#ledgerBar [data-role="paper-photo"]').waitFor({state:'visible'});
  assert.equal(await a.locator('#app input[type="file"]').count(),0);
  assert.match(await a.locator('#app').innerText(),/אין קליטה פתוחה/);
  assert.ok(await a.evaluate(()=>window.t.scrollOk()),'אין גלילה לצדדים ב-390px');
  await localOnly(a,'A');
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
  // v134: קודם "זה כל הניירות" (עד אז: "צלם עוד נייר"), ואז — בזמן הקריאה: "התחל לספור עכשיו"
  await role(a,'paper-all-in').waitFor({state:'visible'});
  assert.equal(await a.locator('#app [data-role="paper-count-now"]').count(),0,'עוד מצלמים');
  await role(a,'paper-all-in').click();
  await role(a,'paper-count-now').waitFor({state:'visible'});
  await role(a,'paper-count-now').click();
  // הספירה נפתחת מיד ב-A: "קורא…"
  await a.waitForFunction(()=>window.t.state().view==='receiving'&&window.t.state().busy&&window.t.state().opened);
  assert.match(await a.locator('#app').innerText(),/קורא את הניירות מהנהג/);
  // v140 (עד v139 הספירה נפתחה גם ב-B, עם "קורא…"): B לא רואה את הקליטה של A — אצלו אין קליטה פתוחה ואין קריאה
  let sb=await state(b);
  assert.equal(sb.busy,false);assert.equal(sb.opened,false);assert.deepEqual(sb.items,[]);assert.equal(sb.draftId,null);
  assert.match(await b.locator('#app').innerText(),/אין קליטה פתוחה/);
  assert.doesNotMatch(await b.locator('#app').innerText(),/קורא את הניירות מהנהג/);
  // v140 (עד v139 B ספר בקליטה של A): B אינו צפייה בלבד — פותח קליטה משלו בזמן ש-A קורא, וסופר בה
  await role(b,'rc-open-nodoc').click();
  await b.waitForFunction(()=>window.t.state().opened&&window.t.state().noDoc);
  await b.evaluate(()=>window.t.addCount(1,3));
  // ו-A סופר בזמן שהנייר שלו נקרא
  await a.evaluate(()=>window.t.addCount(0,2));
  await pause(300); // זמן לסנכרון (שאסור שיקרה) להגיע לטלפון השני
  const [p0,p1]=data.products;
  assert.deepEqual(counted(await state(a)),[[p0.id,2]],'A רואה רק את הספירה שלו');
  assert.deepEqual(counted(await state(b)),[[p1.id,3]],'B רואה רק את הספירה שלו');
  const draftA=(await state(a)).draftId, draftB=(await state(b)).draftId;
  assert.ok(draftA&&draftB&&draftA!==draftB,'לכל טלפון קליטה משלו');
  assert.deepEqual(receivingWrites(),[],'באמצע הקליטה — אפס כתיבות קליטה לענן');
  await a.evaluate(()=>window.t.release());
  await a.waitForFunction(()=>window.t.state().paperState==='ok');
  const sa=await state(a);
  assert.equal(sa.busy,false);assert.equal(sa.source,'paper');assert.equal(sa.pages,0);assert.equal(sa.conflict,false);
  assert.deepEqual(sa.notes.map(n=>[n.units,n.lines]),[[30,5]]);assert.equal(sa.per[0].paperId,'paper_77001234');
  assert.deepEqual(counted(sa),[[p0.id,2]],'הספירה מזמן הקריאה נשמרה');
  assert.match(await a.locator('#app').innerText(),/העוגנים נקראו מהתעודה/);
  // v140 (עד v139 התעודה נכנסה גם ל-B): הקליטה של B לא השתנתה — בלי תעודה, בלי עוגנים, אותה ספירה
  sb=await state(b);
  assert.equal(sb.busy,false);assert.notEqual(sb.paperState,'ok');assert.deepEqual(sb.notes,[]);assert.ok(!sb.per||!sb.per.length);
  assert.equal(sb.noDoc,true);assert.equal(sb.draftId,draftB);assert.deepEqual(counted(sb),[[p1.id,3]]);assert.equal(sb.canEdit,true);
  assert.doesNotMatch(await b.locator('#app').innerText(),/העוגנים נקראו מהתעודה|קורא את הניירות מהנהג/);
  assert.equal((await state(a)).requests,1);assert.equal((await state(b)).requests,0);
  await localOnly(a,'A');await localOnly(b,'B');
  assert.deepEqual(receivingWrites(),[],'תעודת המשלוח לא עולה לענן לפני סיום הקליטה');
  await a.screenshot({path:'/tmp/berman-one-button-counting.png',fullPage:true});
  assert.ok(await a.evaluate(()=>window.t.scrollOk()));assert.ok(await b.evaluate(()=>window.t.scrollOk()));
  // v140: ריענון של A — הקליטה נשארת מהטלפון (ספירה, תעודה, עוגנים) והנייר לא נקרא שוב
  await a.reload();await a.waitForFunction(()=>window.t?.loaded);
  const reloaded=await state(a);
  assert.equal(reloaded.draftId,draftA);assert.deepEqual(counted(reloaded),[[p0.id,2]]);
  assert.equal(reloaded.paperState,'ok');assert.equal(reloaded.source,'paper');
  assert.deepEqual(reloaded.notes.map(n=>[n.units,n.lines]),[[30,5]]);assert.equal(reloaded.per[0].paperId,'paper_77001234');
  assert.equal(reloaded.requests,0);assert.equal(paid.A,1,'אחרי ריענון — בלי קריאה נוספת בתשלום');
  assert.match(await a.locator('#app').innerText(),/העוגנים נקראו מהתעודה/);
  assert.deepEqual(receivingWrites(),[]);
  // A מסיים — והאישור מהענן אובד בדרך: הטרנזקציה נכנסה, אבל הטלפון לא יודע. הקליטה נשארת בטלפון
  await a.evaluate(()=>window.t.countAsPaper());
  loseReceiptAck=true;await a.evaluate(()=>{window.__serverReadFails=true;});
  assert.equal(await a.evaluate(()=>window.t.finish()),'kept','השמירה לא אושרה — הקליטה לא נמחקה');
  assert.equal(loseReceiptAck,false,'הטרנזקציה של הסיום נשלחה');
  const kept=await state(a);
  assert.equal(kept.draftId,draftA);assert.equal(kept.items.length,5);assert.equal(kept.pending,true);
  assert.equal(commits.filter(c=>c.paths.some(k=>/\/receipts\//.test(k))).length,1);
  const receiptBefore=JSON.stringify([...documents.entries()].filter(([k])=>/\/receipts\//.test(k)));
  // הסיכום מחכה. "אשר וקלוט" שוב — לא שולח שמירה שנייה, ואומר איפה לבדוק
  await a.locator('#receiptSummaryModal #rs_ok').waitFor({state:'visible'});
  await a.locator('#receiptSummaryModal #rs_ok').click();
  assert.match(await a.locator('#toastMsg').innerText(),/השמירה לא אושרה עדיין/);
  assert.equal(commits.filter(c=>c.paths.some(k=>/\/receipts\//.test(k))).length,1,'אין שמירה שנייה בזמן שהראשונה לא אושרה');
  await a.locator('#receiptSummaryModal #rs_cancel').click();
  const retry=a.locator('#sharedReceivingBanner [data-shared-receiving="local-retry"]');
  await retry.waitFor({state:'visible'});
  assert.match(await a.locator('#sharedReceivingBanner').innerText(),/השמירה לא אושרה עדיין/);
  // "בדוק ונסה לשמור שוב" — התעודה כבר בענן: הקליטה נסגרת בלי כתיבה נוספת ובלי כפילות
  await retry.click();
  await a.waitForFunction(()=>window.t.state().draftId===null&&!window.t.state().items.length&&!window.t.state().pending);
  // A מסיים: הקליטה נשמרת עם מספר התעודה
  const saved=[...documents.entries()].filter(([k])=>/\/receipts\//.test(k));
  assert.equal(saved.length,1);assert.equal(saved[0][1].paperDocs[0].number,'77001234');
  assert.equal(saved[0][1].paperScan.response.perDocument[0].paperId,'paper_77001234');
  assert.ok(saved[0][0].endsWith('/receipts/'+draftA),'התעודה נשמרה במזהה של הקליטה');
  assert.deepEqual(saved[0][1].items.map(l=>l.qty).sort((x,y)=>x-y),data.paper.scan.documents[0].rows.map(r=>r.quantity).sort((x,y)=>x-y));
  assert.equal(JSON.stringify(saved),receiptBefore,'הניסיון החוזר לא שינה את התעודה');
  // v140: התעודה, תעודת המשלוח והקריאה שלה — בטרנזקציה אחת, פעם אחת
  const receiptCommits=commits.filter(c=>c.paths.some(k=>/\/(receipts|papers|paperScans)\//.test(k)));
  assert.equal(receiptCommits.length,1,'כתיבה אחת של הקליטה לענן');
  assert.equal(receiptCommits[0].operation,'commit');
  for(const re of [/\/receipts\//,/\/papers\/paper_77001234$/,/\/paperScans\/paper_77001234$/])assert.equal(receiptCommits[0].paths.filter(k=>re.test(k)).length,1,String(re));
  assert.equal([...documents.keys()].filter(k=>/\/papers\//.test(k)).length,1);
  assert.deepEqual([...documents.keys()].filter(k=>/\/drafts\//.test(k)),[],'שום טיוטת קליטה או מסמך העברה לא נכתבו');
  assert.equal(paid.A,1);assert.equal(paid.B,0); // (היה: state(a).requests===1 — אחרי הריענון המונה שבדף מתחיל מאפס)
  // הקליטה של B נשארת בטלפון שלו — הסיום של A לא נגע בה
  sb=await state(b);
  assert.equal(sb.draftId,draftB);assert.equal(sb.opened,true);assert.deepEqual(counted(sb),[[p1.id,3]]);assert.equal(sb.canEdit,true);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(missing,[]);
  console.log('one-button browser: all checks passed — /tmp/berman-one-button*.png');
}finally{await browser.close();server.close();}
