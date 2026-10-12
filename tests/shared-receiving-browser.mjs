// v140 — קליטה בשלושה טלפונים מבודדים בדפדפן אמיתי: לכל טלפון קליטה משלו, שנשמרת בטלפון בלבד; התעודה עולה לענן רק בסיום.
// האפליקציה אמיתית; רק Firebase (אחסון/התחברות) והקריאה בתשלום מוחלפים, ושום בקשה לא יוצאת מהמחשב.
// עד v139 הבדיקה הזאת בדקה קליטה משותפת בלייב בין טלפונים — ב-v140 היא בוטלה, וכל שלב הוחלף במקבילה שלו:
// - A ו-B נפתחים (גם עם דגל הסנכרון בלייב הישן): אין מנוע סנכרון, שניהם עורכים — אף פעם לא "צפייה בלבד", בלי
//   "המשך אותה כאן"/השתלטות, ובשורה העליונה "הקליטה נשמרת בטלפון הזה בלבד".
// - A מצלם וקורא (בקשה אחת): הקריאה שלמה ב-A, ו-B לא רואה ממנה כלום ולא משלם. B מצלם וקורא קליטה משלו.
// - "+", חלון הכמות, בדיקת הצילום, עריכות בו-זמנית ומסך בדיקת התעודה — כל טלפון רק בקליטה שלו; כלום לא עובר ולא נדרס.
// - עד הסיום: אפס כתיבות לענן, ושום קריאה של טיוטה/העברה/תעודה.
// - ריענון A: הספירה, הקריאה ומסך הבדיקה חוזרים מהטלפון, בלי קריאה חוזרת בתשלום. טלפון שלישי (C): ריק ועריך.
// - סיום A: התעודה (עם הקריאה) ויומן הפעולה בטרנזקציה אחת. האישור אבד בדרך — הספירה נשמרת ב-A, ו"בדוק ונסה לשמור
//   שוב" סוגר אותה בלי תעודה כפולה. B, שלא ננעל בינתיים, שומר תעודה משלו, ושל A לא נדרסת.
// - בלי שגיאות דף, בלי רשת חיצונית.
// Run: TZ=Asia/Jerusalem node tests/shared-receiving-browser.mjs (Playwright + Chromium; BERMAN_CHROMIUM optional)
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { html, moduleSource, fixture } from './receipt-scan-harness.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const data = fixture(), documents = new Map();
const paperPhoto = text => 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="450" height="650"><rect width="450" height="650" fill="white"/><text x="25" y="60" font-size="25">' + text + '</text><path d="M25 100h400M25 150h300M25 200h350M25 250h200" stroke="black" stroke-width="6"/></svg>').toString('base64');
const photo = paperPhoto('PHONE A RECEIPT'), photoB = paperPhoto('PHONE B RECEIPT');
// v140: כל כתיבה וכל קריאה מהענן נרשמות — כדי להראות שבזמן הקליטה אין בכלל תנועה של הקליטה לענן.
const writeLog = [], readLog = [];
let transactionQueue = Promise.resolve(), releaseTransaction, loseNextCommitAck = false;
const rpc = async (operation, args = {}) => {
  if (operation === 'begin') {
    const previous = transactionQueue;
    transactionQueue = new Promise(resolve => { args.release = resolve; });
    await previous; releaseTransaction = args.release; return true;
  }
  if (operation === 'read') { readLog.push(args.path); return documents.get(args.path) ?? null; }
  if (operation === 'commit' || operation === 'batch') {
    if (args.writes.length) writeLog.push({ operation, paths: args.writes.map(([path]) => path) });
    for (const [path, value, operation] of args.writes) { if(operation==='delete') documents.delete(path);else documents.set(path, structuredClone(value)); }
  }
  if (operation === 'commit' || operation === 'abort') { releaseTransaction?.(); releaseTransaction = null; }
  // v140: הטרנזקציה נכנסה לענן, אבל התשובה לא הגיעה לטלפון (החיבור נפל באמצע)
  if (operation === 'commit' && loseNextCommitAck) { loseNextCommitAck = false; throw new Error('connection lost before the acknowledgement'); }
  return true;
};
const setup = `
try{localStorage.setItem('bm_shared_receiving_live','1')}catch(e){} // v140: דגל הסנכרון בלייב הישן (v136) נשאר בטלפון — ועדיין שום סנכרון לא עולה
const initializeApp = () => ({}), getAuth = () => ({currentUser:{getIdToken:async()=> 'test'}});
const initializeFirestore = () => ({}), getFirestore = () => ({});
const persistentLocalCache = () => ({}), persistentMultipleTabManager = () => ({});
const signInAnonymously = async () => ({}), onAuthStateChanged = () => {};
const doc = (_db, ...path) => path.join('/');
const snapshot = value => ({exists:()=>value!==null,data:()=>structuredClone(value),metadata:{fromCache:false,hasPendingWrites:false}});
const getDoc = async path => snapshot(await window.__sharedRpc('read',{path}));
// v140: בדיקת "האם נשמרה" אחרי אישור שאבד היא קריאה מהשרת (לא ממטמון); כשאין חיבור — היא נכשלת
const getDocFromServer = async path => { if(window.__serverUnreachable) throw new Error('offline'); return snapshot(await window.__sharedRpc('read',{path})); };
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
  state:()=>({live:sharedReceiving,editable:canEditSharedReceipt(),pending:localReceivingPending(),finalizing:sharedReceiptFinalizing,items:structuredClone(receiptList),photos:structuredClone(aiScanDocuments),pageCounts:aiScanDocuments.map(aiScanDocumentPageCount),view:currentView,reconcile:structuredClone(reconcileData),requests:scanRequests,qtyValue:$('qtyVal').value,modal:sharedReceiptModalOpen('qtyModal'),draftId:receiptDraftId,busy:aiScanBusy,paperState:receiptPaperScanState,response:aiScanResponse,notes:structuredClone(receiptNotes),banner:$('sharedReceivingBanner').innerText,toast:$('toastMsg').textContent}),
  scan:async(dataUrl)=>{receiptList=[];receiptNotes=[];receiptOpened=true;receiptDocDate='2026-09-09';receiptEntryMode='photo';receiptAnchorSource=null;bermanSeedPhotoFirstScan(1);aiScanDocuments[0].pages=[{dataUrl:dataUrl||${JSON.stringify(photo)},orientationConfirmed:true}];await bermanRunPaperScanInBackground();receiptList=structuredClone(testData.items);saveReceiptDraft();renderReceiving();},
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
  // v140: הדף טוען local-receiving.js?v=140 (השמירה בסיום) ו-shared-return-events.js?v=138 — מגישים אותם עם מחרוזת הגרסה
  const file=req.url.split('?')[0];
  if(/^\/(local-receiving|shared-return-events|draft-handoff|shared-receiving)\.js$/.test(file)){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(new URL('..'+file,import.meta.url)));}
  else if(file==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(pageHtml);}
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
// אין מנוע סנכרון שאמור "להגיע" — ההמתנה רק נותנת לשינוי זמן לעבור, אילו היה עובר (הסנכרון הישן עבד ב-30ms).
const settle=()=>new Promise(resolve=>setTimeout(resolve,500));
const counted=s=>Object.fromEntries(s.items.map(x=>[x.productId,x.qty]));
const receiptPaths=()=>[...documents.keys()].filter(k=>/\/receipts\//.test(k));
// עד v139: B התחיל כצופה, ו"#sharedReceivingTakeover" העביר אליו את העריכה. v140: כל טלפון עורך את שלו —
// בלי השתלטות, בלי הצעת "המשך אותה כאן" (v136/v137), בלי "צפייה בלבד" ובלי מעבר לסנכרון.
async function assertOwnLocalReceiving(page,label){
  const s=await state(page);
  assert.equal(s.live,null,label+': no live receiving engine');
  assert.equal(s.editable,true,label+': never read-only');
  assert.match(s.banner,/הקליטה נשמרת בטלפון הזה בלבד/,label+': banner says the receiving stays on this phone');
  assert.doesNotMatch(s.banner,/מסונכרן|טוען את הקליטה|המשך אותה כאן|המשך כאן|ממשיכה בטלפון אחר|צפייה בלבד/,label);
  assert.equal(await page.locator('#sharedReceivingTakeover').count(),0,label+': no takeover');
  assert.equal(await page.locator('[data-shared-receiving="handoff-take"],[data-shared-receiving="off"],[data-shared-receiving="on"]').count(),0,label+': no handoff/sync offers');
  assert.doesNotMatch(await page.locator('body').innerText(),/צפייה בלבד|המשך אותה כאן/,label);
}
try{
  // עד v139: A חיכה ל-sharedReceiving.ready, ו-B נפתח עורך (owner). v140: אין "מוכן" של סנכרון — הקליטה זמינה מיד.
  const a=await device();await assertOwnLocalReceiving(a,'A');
  const b=await device();await assertOwnLocalReceiving(b,'B');
  await a.evaluate(()=>sharedTest.scan());
  // עד v139: הסריקה של A הופיעה ב-B (אותן שורות, אותם צילומים) בלי בקשה ב-B. v140: B לא רואה כלום ולא משלם.
  const scannedA=await state(a);
  assert.equal(scannedA.items.length,5);assert.equal(scannedA.photos[0].pages[0].dataUrl,photo);assert.equal(scannedA.requests,1);
  await settle();
  let sb=await state(b);
  assert.deepEqual(sb.items,[]);assert.equal(sb.draftId,null);assert.equal(sb.response,null);
  assert.equal(sb.photos.some(d=>d.pages?.length),false,'A photo must not reach B');
  assert.equal(sb.requests,0);
  // B פותח קליטה משלו (צילום אחר) — הוא משלם רק על הנייר שלו
  await b.evaluate(photoB=>sharedTest.scan(photoB),photoB);
  sb=await state(b);
  assert.equal(sb.items.length,5);assert.equal(sb.photos[0].pages[0].dataUrl,photoB);assert.equal(sb.requests,1);
  assert.notEqual(sb.draftId,scannedA.draftId,'each phone owns a separate receiving');
  assert.equal((await state(a)).photos[0].pages[0].dataUrl,photo,'B photo must not replace A photo');
  // הקריאה שלמה בכל טלפון — על הנייר שלו (עד v139: אותה קריאה בשני הטלפונים)
  for (const page of [a,b]) {
    const result=await state(page);assert.equal(result.busy,false);assert.ok(result.response);assert.equal(result.paperState,'ok');assert.equal(result.notes.length,1);
  }
  const firstId=scannedA.items[0].productId;
  const plus='[data-role="rc-plus"][data-id="'+firstId+'"]';
  // עד v139: "+" ב-B הגיע ל-A ולהפך (12→13→14 בשניהם). v140: כל טלפון סופר רק בקליטה שלו.
  await b.locator(plus).click();await b.waitForFunction(()=>sharedTest.state().items[0].qty===13);
  await b.locator(plus).click();await b.waitForFunction(()=>sharedTest.state().items[0].qty===14);
  await a.locator(plus).click();await a.waitForFunction(()=>sharedTest.state().items[0].qty===13);
  await settle();
  assert.equal((await state(a)).items[0].qty,13);assert.equal((await state(b)).items[0].qty,14);
  await b.screenshot({path:'/tmp/berman-local-receiving.png',fullPage:true});
  // עד v139: בדיקת הצילום שנפתחה ב-A נפתחה גם ב-B, עם הצילום של A, ו-B אישר אותה. v140: החלון והצילום של כל טלפון — שלו.
  await a.evaluate(()=>sharedTest.openPhoto());
  await a.locator('#aiOrientationModal').waitFor({state:'visible'});
  assert.equal(await a.locator('#aiOrientationImage').getAttribute('src'),photo);
  await settle();assert.equal(await b.locator('#aiOrientationModal').isVisible(),false);
  await a.locator('#aiOrientationConfirm').click();
  await a.locator('#aiOrientationModal').waitFor({state:'hidden'});
  await b.evaluate(()=>sharedTest.openPhoto());
  await b.locator('#aiOrientationModal').waitFor({state:'visible'});
  assert.equal(await b.locator('#aiOrientationImage').getAttribute('src'),photoB);
  await b.locator('#aiOrientationConfirm').click();
  await b.locator('#aiOrientationModal').waitFor({state:'hidden'});
  // עד v139: חלון הכמות של A (עם "4") הופיע ב-B, ו-B סיים אותו. v140: החלון רק ב-A, ו-A מסיים אותו.
  await a.evaluate(()=>sharedTest.openQuantity());
  await a.locator('#qtyVal').fill('4');
  await settle();sb=await state(b);assert.equal(sb.modal,false);assert.notEqual(sb.qtyValue,'4');
  await a.locator('#qty_done').click();
  await a.waitForFunction(()=>sharedTest.state().items[0].qty===17);
  assert.equal((await state(b)).items[0].qty,14);
  await a.locator('#qtyModal').waitFor({state:'hidden'});
  // Both devices edit different products at the same moment. עד v139: שני השינויים בשני הטלפונים.
  // v140: כל טלפון רואה רק את השינוי שלו — אף אחד לא דורס ולא מקבל את של השני.
  const ids=(await state(a)).items.slice(0,2).map(x=>x.productId);
  const beforeA=(await state(a)).items.slice(0,2).map(x=>x.qty), beforeB=(await state(b)).items.slice(0,2).map(x=>x.qty);
  await Promise.all([a.locator('[data-role="rc-plus"][data-id="'+ids[0]+'"]').click(),
    b.locator('[data-role="rc-plus"][data-id="'+ids[1]+'"]').click()]);
  await a.waitForFunction(before=>sharedTest.state().items[0].qty===before[0]+1,beforeA);
  await b.waitForFunction(before=>sharedTest.state().items[1].qty===before[1]+1,beforeB);
  await settle();
  assert.deepEqual((await state(a)).items.slice(0,2).map(x=>x.qty),[beforeA[0]+1,beforeA[1]]);
  assert.deepEqual((await state(b)).items.slice(0,2).map(x=>x.qty),[beforeB[0],beforeB[1]+1]);
  // עד v139: B פתח את בדיקת התעודה, ו-A עבר אליה עם אותן שורות. v140: A נשאר בקליטה; כל טלפון בודק את הספירה שלו.
  await b.evaluate(()=>sharedTest.reconcile());
  await b.waitForFunction(()=>sharedTest.state().view==='reconcile');
  await settle();
  assert.equal((await state(a)).view,'receiving');assert.equal((await state(a)).reconcile,null);
  await a.evaluate(()=>sharedTest.reconcile());
  await a.waitForFunction(()=>sharedTest.state().view==='reconcile');
  const reconciledA=await state(a), reconciledB=await state(b);
  for (const s of [reconciledA,reconciledB]) assert.deepEqual(Object.fromEntries(s.reconcile.filter(r=>!r.isDeposit).map(r=>[r.productId,r.received])),counted(s));
  assert.notDeepEqual(reconciledA.reconcile,reconciledB.reconcile);
  await a.screenshot({path:'/tmp/berman-local-reconcile.png',fullPage:true});
  // בלי קריאה כפולה בתשלום: אחת לכל נייר, גם אחרי הכמויות, הצילום ומסך הבדיקה (עד v139: 1 ב-A, 0 ב-B)
  assert.equal(reconciledA.requests,1);assert.equal(reconciledB.requests,1);
  // עד v139: טלפון שלישי (C) נפתח על מסך הבדיקה, עם הצילומים והשורות של B, ועורך. v140 — שני חלקים:
  // (1) ריענון של אותו טלפון (A): הקליטה חוזרת מהטלפון — הספירה, הקריאה ומסך הבדיקה — בלי בקשה חוזרת. הצילום עצמו
  //     זמני מאז v70 (נשמרים מספר העמודים והקריאה), ומסך הפתיחה הוא הקליטה (מסך משותף היה של הסנכרון בלייב).
  await a.reload();await a.waitForFunction(()=>window.sharedTest?.loaded);
  const reloadedA=await state(a);
  assert.deepEqual(reloadedA.items,reconciledA.items,'same-phone reload keeps the local counts');
  assert.equal(reloadedA.draftId,reconciledA.draftId);
  assert.deepEqual(reloadedA.response,reconciledA.response);assert.deepEqual(reloadedA.notes,reconciledA.notes);assert.equal(reloadedA.paperState,'ok');
  assert.deepEqual(reloadedA.reconcile,reconciledA.reconcile,'reconciliation rows survive reload');
  assert.deepEqual(reloadedA.pageCounts,[1]);
  assert.equal(reloadedA.requests,0,'reload must not replay paid OCR');
  await assertOwnLocalReceiving(a,'A after reload');
  // (2) טלפון אחר (C): לא רואה את הקליטה של A או של B — ריק ועורך, ובלי בקשה.
  const c=await device();const sc=await state(c);
  assert.deepEqual(sc.items,[]);assert.equal(sc.draftId,null);assert.equal(sc.response,null);assert.equal(sc.reconcile,null);
  assert.equal(sc.view,'receiving');assert.equal(sc.requests,0);
  await assertOwnLocalReceiving(c,'C');
  // עד הסיום שום דבר מהקליטה לא נגע בענן: אף כתיבה (טיוטה, גיבוי, העברה, בעלות, תעודה), ואף האזנה לטיוטה משותפת.
  assert.deepEqual(writeLog,[],'zero cloud writes during receiving');
  assert.equal(readLog.some(p=>/\/(drafts|receipts)\//.test(p)),false,'no shared draft/handoff/receipt reads during receiving: '+JSON.stringify(readLog));
  // סיום A — והאישור מהענן אבד בדרך (וגם בדיקת השרת נכשלת, כי אין חיבור)
  await a.evaluate(()=>sharedTest.reconcile());await a.waitForFunction(()=>sharedTest.state().view==='reconcile');
  const finalA=await state(a);
  loseNextCommitAck=true;await a.evaluate(()=>{window.__serverUnreachable=true;});
  await a.locator('[data-role="ai-apply"]').click();
  await a.locator('#receiptSummaryModal').waitFor({state:'visible'});
  await a.locator('#rs_ok').click();
  await a.waitForFunction(()=>sharedTest.state().pending&&!sharedTest.state().finalizing);
  // הכל בטרנזקציה אחת: התעודה במזהה של הקליטה (עם הקריאה מהנייר) ויומן הפעולה — ותו לא.
  assert.equal(writeLog.length,1);assert.equal(writeLog[0].operation,'commit');
  assert.deepEqual(writeLog[0].paths.map(p=>p.split('/').slice(-2,-1)[0]),['receipts','actionLog']);
  assert.deepEqual(receiptPaths(),['artifacts/berman-app-classic/public/data/receipts/'+finalA.draftId]);
  const savedA=documents.get(receiptPaths()[0]), frozenA=JSON.stringify(savedA);
  assert.deepEqual(Object.fromEntries(savedA.items.map(x=>[x.productId,x.qty])),counted(finalA),'saved quantities are the local count of A');
  assert.equal(savedA.localFinal.sessionId,finalA.draftId);assert.equal(savedA.operationId,finalA.draftId);
  assert.equal(savedA.paperScan.response.scan.documents.length,1,'the paid OCR result is committed with the receipt');
  // A: הספירה נשארת בטלפון ונעולה עד שיתברר; "בדוק ונסה לשמור שוב" בשורה העליונה
  let sa=await state(a);
  assert.deepEqual(sa.items,finalA.items);assert.equal(sa.draftId,finalA.draftId);assert.equal(sa.editable,false);
  assert.match(sa.banner,/השמירה לא אושרה עדיין/);
  // B לא ננעל בגלל השמירה של A (עד v139: הטלפון השני היה צופה עד השתלטות)
  assert.equal((await state(b)).editable,true);
  // לחיצה נוספת על "אשר וקלוט" לא שולחת שוב — היא מפנה לבדיקה בראש המסך; "חזרה" סוגר את הסיכום
  await a.locator('#rs_ok').click();
  await a.waitForFunction(()=>/השמירה לא אושרה עדיין/.test(sharedTest.state().toast));
  assert.equal(writeLog.length,1,'a second tap must not submit again');
  await a.locator('#rs_cancel').click();await a.locator('#receiptSummaryModal').waitFor({state:'hidden'});
  await a.evaluate(()=>{window.__serverUnreachable=false;});
  await a.locator('[data-shared-receiving="local-retry"]').click();
  await a.waitForFunction(()=>sharedTest.state().draftId===null&&!sharedTest.state().pending);
  sa=await state(a);
  assert.deepEqual(sa.items,[]);assert.equal(sa.view,'receiptsHistory');assert.equal(sa.editable,true);
  assert.equal(writeLog.length,1,'retry must not write a second receipt');
  assert.deepEqual(receiptPaths(),['artifacts/berman-app-classic/public/data/receipts/'+finalA.draftId]);
  assert.equal(JSON.stringify(documents.get(receiptPaths()[0])),frozenA);
  // B מסיים את הקליטה שלו: תעודה נפרדת במזהה שלו, עם הספירה שלו; של A לא נדרסת
  const finalB=await state(b);
  assert.equal(finalB.view,'reconcile');assert.deepEqual(finalB.items,reconciledB.items,'A finish must not touch B local receiving');
  await b.locator('[data-role="ai-apply"]').click();
  await b.locator('#receiptSummaryModal').waitFor({state:'visible'});
  await b.locator('#rs_ok').click();
  await b.waitForFunction(()=>sharedTest.state().draftId===null&&!sharedTest.state().pending);
  assert.equal(writeLog.length,2);assert.equal(writeLog[1].operation,'commit');
  assert.deepEqual(receiptPaths().sort(),['artifacts/berman-app-classic/public/data/receipts/'+finalA.draftId,'artifacts/berman-app-classic/public/data/receipts/'+finalB.draftId].sort());
  assert.deepEqual(Object.fromEntries(documents.get('artifacts/berman-app-classic/public/data/receipts/'+finalB.draftId).items.map(x=>[x.productId,x.qty])),counted(finalB));
  assert.equal(JSON.stringify(documents.get('artifacts/berman-app-classic/public/data/receipts/'+finalA.draftId)),frozenA);
  assert.equal([...documents.keys()].some(k=>/\/drafts\//.test(k)),false,'no receiving draft/handoff document was ever written');
  assert.equal((await state(c)).items.length,0);
  // אין קריאה בתשלום בסיום: A (אחרי הריענון) ו-C — אפס; B — רק הקריאה של הנייר שלו מקודם
  assert.deepEqual([(await state(a)).requests,(await state(b)).requests,(await state(c)).requests],[0,1,0],'no OCR during finish');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('PASS: three phones, each with its own local receiving: photos/OCR/counts/quantity modal/photo review/concurrent edits/reconciliation never cross phones; nobody is read-only and no handoff offers; zero cloud writes and no shared-draft reads until finish; same-phone reload keeps counts, OCR and reconciliation without paid OCR; finish commits receipt+OCR+log in one transaction; lost acknowledgement retried without a duplicate; second phone saves its own receipt; zero external requests.');
  console.log('Screenshots: /tmp/berman-local-receiving.png /tmp/berman-local-reconcile.png');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
