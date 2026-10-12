// v132 — "לא הגיע כלום" גלוי בדפדפן אמיתי, ברוחב טלפון (390px), על נייר "ת.משלוח" קטן שצולם בכפתור שבפס.
// A: צילום → מסך הניירות: "לא הגיע כלום" מתחת ל"לספירה", במסך הראשון בלי לגלול → "לספירה" → מסך הקליטה:
//    שלוש הבחירות פתוחות, "לא הגיע כלום" מעל "סרוק פריט לתעודה" ובמסך הראשון → v140: ריענון — הקליטה חוזרת מהטלפון
//    כמו שהייתה, בלי קריאה נוספת → לחיצה → "לא הגיע כלום — שמור" → v133: הקליטה נשמרת (כל השורות 0) בלי מסך ההבדלים ובלי הסיכום.
// B: טלפון אחר, קליטה משלו: צילום → "לא הגיע כלום" ישר ממסך הניירות → מסך הקליטה עם שאלת האישור → כל השורות 0;
//    v140: השמירה נכנסה לענן אבל התשובה הלכה לאיבוד — הקליטה נשארת בטלפון, "בדוק ונסה לשמור שוב" → נשמרת פעם אחת, בלי כפילות.
// v140 (הקליטה נשמרת בטלפון; התעודה בענן רק בסיום): הקליטה פתוחה לעריכה מיד — בלי לחכות לענן, בלי "צפייה בלבד", גם בטלפון
//    שבחר ב-v136 בסנכרון בלייב; בשורה העליונה "נשמרת בטלפון הזה בלבד", בלי "המשך אותה כאן" / "החזר אותה לכאן"; עד הסיום —
//    אפס כתיבות קליטה לענן (טיוטה, העברה, תעודה, נייר) ובלי האזנה לטיוטות; בסיום — טרנזקציה אחת: התעודה במזהה של הקליטה,
//    תעודת המשלוח והקריאה שלה, ורישום.
// בלי גלילה לצדדים, בלי שגיאות דף, בלי רשת חיצונית, בקשת קריאה אחת לכל טלפון.
// Run: TZ=Asia/Jerusalem node tests/none-arrived-browser.mjs (Playwright + Chromium; BERMAN_CHROMIUM optional;
// BERMAN_TEST_CSS=<קובץ CSS> — לצילומי מסך עם העיצוב המלא במקום ה-CSS המינימלי)
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { html, moduleSource, fixture } from './receipt-scan-harness.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const data = fixture(), documents = new Map(), writeLog = [], readLog = [];
const pad = n => String(n).padStart(2, '0'), now = new Date();
Object.assign(data.paper, { serviceVersion: 7, verification: { version: 1, status: 'agreed', primaryReads: 2, escalationAttempted: false, reasons: [], issues: [], readCount: 2 } });
// נייר "ת.משלוח" קטן מהמסופון: מספר 2900…, בלי מספר פנימי
Object.assign(data.paper.scan.documents[0], { docNumber: '290095141', internalNumber: null, headerText: 'ת.משלוח', docDate: pad(now.getDate()) + '/' + pad(now.getMonth() + 1) + '/' + now.getFullYear() });
const photo = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="500"><rect width="300" height="500" fill="white"/><path d="M20 60h260M20 120h200" stroke="black" stroke-width="6"/></svg>');
// הענן המדומה. cloud.loseAck — שמירת התעודה הבאה נכנסת, אבל התשובה עליה לא מגיעה, ומיד אחריה אין רשת (cloud.down)
const cloud = { loseAck: false, down: false };
let transactionQueue = Promise.resolve(), releaseTransaction;
const rpc = async (operation, args = {}) => {
  if (operation === 'abort') { releaseTransaction?.(); releaseTransaction = null; return true; }
  if (cloud.down) throw new Error('offline (test)');
  if (operation === 'begin') {
    const previous = transactionQueue;
    transactionQueue = new Promise(resolve => { args.release = resolve; });
    await previous; releaseTransaction = args.release; return true;
  }
  if (operation === 'read') { readLog.push(args.path); return documents.get(args.path) ?? null; }
  if (operation === 'commit' || operation === 'batch') {
    writeLog.push({ operation, paths: args.writes.map(([path]) => path) });
    for (const [path, value, op] of args.writes) { if (op === 'delete') documents.delete(path); else documents.set(path, structuredClone(value)); }
  }
  if (operation === 'commit') {
    releaseTransaction(); releaseTransaction = null;
    if (cloud.loseAck && args.writes.some(([path]) => /\/receipts\//.test(path))) { cloud.loseAck = false; cloud.down = true; throw new Error('ack lost (test)'); }
  }
  return true;
};
const setup = `
try{localStorage.setItem('bm_shared_receiving_live','1')}catch(e){} // v140: טלפון שבחר ב-v136 בסנכרון בלייב — הבחירה הישנה לא מחזירה סנכרון; הקליטה נשארת בטלפון
const initializeApp = () => ({}), getAuth = () => ({currentUser:{getIdToken:async()=> 'test'}});
const initializeFirestore = () => ({}), getFirestore = () => ({});
const persistentLocalCache = () => ({}), persistentMultipleTabManager = () => ({});
const signInAnonymously = async () => ({}), onAuthStateChanged = () => {};
const doc = (_db, ...path) => path.join('/');
const snapshot = value => ({exists:()=>value!==null,data:()=>structuredClone(value),metadata:{fromCache:false,hasPendingWrites:false}});
const getDoc = async path => snapshot(await window.__sharedRpc('read',{path})), getDocFromServer = getDoc;
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
const deleteDoc=path=>window.__sharedRpc('batch',{writes:[[path,null,'delete']]});
`;
const replay = `
const testData = ${JSON.stringify(data)};
products=testData.products;promos=testData.promos;receipts=[];returns=[];
aiRunAnalyzer=async()=>{};
let scanRequests=Number(sessionStorage.getItem('t_scanRequests'))||0; // v140: נספר גם אחרי ריענון של אותו טלפון
window.fetch=async(url)=>{if(String(url)===AI_SCAN_WORKER_URL){scanRequests++;sessionStorage.setItem('t_scanRequests',String(scanRequests));return{ok:true,status:200,json:async()=>structuredClone(testData.paper)}}throw new Error('External network is forbidden in local replay: '+url)};
openScanner=async()=>{window.t.scanner=(window.t.scanner||0)+1;};
window.t={
  state:()=>({items:structuredClone(receiptList),mode:receiptCountingMode,paperState:receiptPaperScanState,view:currentView,requests:scanRequests,
    editable:canEditSharedReceipt(),shared:!!sharedReceiving,off:sharedReceivingOff,pending:localReceivingPending(),finalizing:sharedReceiptFinalizing,
    draftId:receiptDraftId,stored:(JSON.parse(localStorage.getItem(RECEIPT_DRAFT_KEY)||'{}')||{}).draftId??null,
    small:!!(papers.concat(Object.values(paperLocalResults()).map(r=>r.paper)).find(p=>p&&p.number==='290095141')||{}).small}),
  banner:()=>{const el=document.getElementById('sharedReceivingBanner');return el&&!el.classList.contains('hidden')?el.innerText:null;},
  scrollOk:()=>document.scrollingElement.scrollWidth<=document.scrollingElement.clientWidth+1
};
setView('receiving');await startSharedReceiving();window.t.loaded=true;
`;
const css = process.env.BERMAN_TEST_CSS ? fs.readFileSync(process.env.BERMAN_TEST_CSS, 'utf8')
  : `.hidden{display:none!important}.flex{display:flex}.grid{display:grid}.grid-cols-2{grid-template-columns:1fr 1fr}.flex-wrap{flex-wrap:wrap}.flex-1{flex:1}.min-w-0{min-width:0}.fixed{position:fixed}.inset-0{inset:0}.items-center{align-items:center}.justify-center{justify-content:center}.w-full{width:100%}.gap-2{gap:.5rem}.font-black{font-weight:900}.min-h-\\[48px\\]{min-height:48px}.min-h-\\[52px\\]{min-height:52px}.min-h-\\[56px\\]{min-height:56px}body{margin:0;font:16px Arial}header{background:#92400e;padding:14px}button,input{font:inherit;padding:8px;max-width:100%;box-sizing:border-box}img{max-width:100%}[id$="Modal"]{background:#0008;align-items:center;justify-content:center;z-index:50}[id$="Modal"]>div{background:white;max-height:90vh;overflow-y:auto;padding:16px;box-sizing:border-box}`;
const pageHtml = html.replace(/<script\s+src="https:[^"]+"><\/script>/g, '').replace(/<link[^>]+(?:href="https:[^"]+"|rel="(?:manifest|preconnect)")[^>]*>/g, '')
  .replace(/<script type="module">[\s\S]*?<\/script>/, () => '<script type="module">' + setup + moduleSource + replay + '</script>')
  .replace('</head>', '<style>' + css + '</style></head>');
const server = http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'none'");
  // v140: הדף טוען את local-receiving.js (השמירה בסיום) ואת shared-return-events.js (החזרות) — לא את shared-receiving.js
  const file = req.url.split('?')[0];
  if (/^\/(local-receiving|shared-return-events)\.js$/.test(file)) { res.setHeader('Content-Type', 'text/javascript'); res.end(fs.readFileSync(new URL('..' + file, import.meta.url))); }
  else if (file === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(pageHtml); }
  else { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, executablePath: process.env.BERMAN_CHROMIUM, args: ['--no-sandbox'] });
const errors = [], external = [];
const H = 844;
const state = page => page.evaluate(() => window.t.state());
// v140: אין קליטה משותפת שצריך לחכות שתעלה מהענן (עד v139: sharedReceiving.ready). הקליטה עולה מהטלפון ופתוחה לעריכה
// מיד — לא "צפייה בלבד" — גם בטלפון שבחר פעם בסנכרון בלייב
async function ready(page) {
  await page.waitForFunction(() => window.t?.loaded && window.t.state().editable);
  const s = await state(page);
  assert.equal(s.shared, false, 'v140: בלי מנוע קליטה משותפת');
  assert.equal(s.off, true, 'v140: הבחירה הישנה בסנכרון בלייב לא מדליקה אותו');
}
async function device(name) {
  const context = await browser.newContext({ viewport: { width: 390, height: H }, serviceWorkers: 'block', locale: 'he-IL' });
  await context.exposeBinding('__sharedRpc', (_source, operation, args) => rpc(operation, args));
  await context.route('**/*', route => { if (route.request().url().startsWith(url) || route.request().url().startsWith('data:')) return route.continue(); external.push(route.request().url()); return route.abort(); });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(name + ': ' + error.message));
  page.on('dialog', dialog => dialog.dismiss());
  await page.goto(url); await ready(page);
  return { page, context };
}
// v140: השורה העליונה במסך הקליטה (עד v139: "מסונכרן בלייב"): נשמרת בטלפון הזה בלבד; בלי "המשך אותה כאן" / "החזר אותה לכאן"
async function localBanner(page) {
  const text = await page.evaluate(() => window.t.banner());
  assert.match(text || '', /הקליטה נשמרת בטלפון הזה בלבד/);
  assert.doesNotMatch(text, /מסונכרן|טוען את הקליטה|המשך אותה כאן|החזר אותה לכאן|ממשיכה בטלפון אחר|צפייה בלבד/);
  assert.equal(await page.locator('#sharedReceivingBanner [data-shared-receiving="handoff-take"], #sharedReceivingBanner [data-shared-receiving="on"], #sharedReceivingBanner [data-shared-receiving="off"]').count(), 0);
}
// v140: עד הסיום שום דבר מהקליטה לא נכתב לענן — לא טיוטה, לא מסמך העברה, לא התעודה, לא תעודת המשלוח או הקריאה שלה
const RECEIVING_DOCS = /\/(drafts|receipts|papers|paperScans)\//;
const receivingWrites = () => writeLog.filter(w => w.paths.some(path => RECEIVING_DOCS.test(path)));
function nothingInCloudYet(label) {
  assert.deepEqual(receivingWrites(), [], label + ': אפס כתיבות קליטה לענן לפני הסיום');
  assert.deepEqual(readLog.filter(path => /\/drafts\//.test(path)), [], label + ': בלי האזנה לטיוטות בענן');
}
// צילום בכפתור שבפס → הקריאה רצה לבד → הנייר הקטן פותח קליטה ונכנס אליה
async function photographSmall(page) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#ledgerBar [data-role="paper-photo"]').click()]);
  await chooser.setFiles({ name: 'paper.svg', mimeType: 'image/svg+xml', buffer: photo });
  await page.waitForFunction(() => window.t.state().paperState === 'ok' && window.t.state().view === 'paperIntake');
  // v134: קודם מצלמים את כל הניירות — "צלם עוד נייר" / "זה כל הניירות"; הבחירות רק אחרי
  await page.locator('#app [data-role="paper-all-in"]').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#app [data-role="paper-photo-more"]').count(), 1);
  assert.equal(await page.locator('#app [data-role="paper-none-arrived"]').count(), 0, 'עוד לא — מצלמים');
  await page.screenshot({ path: '/tmp/berman-v134-photographing.png' });
  await page.locator('#app [data-role="paper-all-in"]').click();
  await page.locator('#app [data-role="paper-none-arrived"]').waitFor({ state: 'visible' });
  for (const role of ['paper-quantity-all', 'paper-quantity-differences']) assert.equal(await page.locator('#app [data-role="' + role + '"]').isVisible(), true, role);
  const s = await state(page);
  assert.equal(s.small, true, 'נקרא כנייר משלוח קטן'); assert.equal(s.requests, 1); assert.deepEqual(s.items, []);
}
// הכפתור כולו במסך הראשון, בלי לגלול
async function inFirstScreen(page, selector, label) {
  const box = await page.locator(selector).first().boundingBox();
  assert.ok(box && box.y >= 0 && box.y + box.height <= H, label + ': במסך הראשון בלי לגלול (' + JSON.stringify(box) + ')');
  return box;
}
// ackLost (v140): השמירה נכנסה לענן, אבל התשובה לא הגיעה ואין רשת לבדוק — הקליטה לא נמחקת מהטלפון ולא נשלחת שוב לבד;
// "בדוק ונסה לשמור שוב" מוצא את התעודה שכבר נשמרה ולא כותב אותה (או את הנייר) פעם שנייה
async function confirmNone(page, { ackLost = false } = {}) {
  await page.locator('#confirmModal').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#confirmTitle').innerText(), 'לא הגיע כלום?');
  assert.deepEqual((await state(page)).items, [], 'כלום לא נרשם לפני האישור');
  assert.equal(await page.locator('#confirmOk').innerText(), 'לא הגיע כלום — שמור');
  nothingInCloudYet('לפני האישור');
  const { draftId } = await state(page);
  assert.ok(draftId, 'לקליטה יש מזהה בטלפון');
  const receiptPath = 'artifacts/berman-app-classic/public/data/receipts/' + draftId;
  const before = [...documents.keys()].filter(k => /\/receipts\//.test(k)).length;
  cloud.loseAck = ackLost;
  await page.locator('#confirmOk').click();
  if (ackLost) {
    await page.waitForFunction(() => !window.t.state().finalizing && /השמירה לא אושרה[\s\S]*נשארה בטלפון/.test(document.getElementById('toastMsg').textContent));
    const retry = page.locator('#sharedReceivingBanner [data-shared-receiving="local-retry"]');
    await retry.waitFor({ state: 'visible' });
    const sent = () => writeLog.filter(w => w.paths.includes(receiptPath)).length;
    const s = await state(page);
    assert.ok(['receiving', 'reconcile'].includes(s.view), 'נשאר בקליטה (לא נסגרה): ' + s.view);
    assert.ok(s.items.length > 0 && s.items.every(l => l.qty === 0), 'הקליטה (כל השורות 0) נשארה בטלפון: ' + JSON.stringify(s.items));
    assert.equal(s.stored, draftId, 'הטיוטה בטלפון לא נמחקה');
    assert.equal(s.pending, true, 'השמירה ממתינה לבדיקה');
    assert.match(await page.evaluate(() => window.t.banner()), /השמירה לא אושרה עדיין/);
    assert.equal(sent(), 1, 'נשלחה פעם אחת');
    await page.screenshot({ path: '/tmp/berman-v140-ack-lost.png' });
    // הסיכום מחכה (כמו ב-solo-receiving.test); "אשר וקלוט" שוב, כשהשמירה הראשונה עוד לא הוכרעה — לא נשלח פעם שנייה
    assert.equal(await page.locator('#receiptSummaryModal').isVisible(), true, 'הסיכום מחכה');
    await page.locator('#rs_ok').click();
    await page.waitForFunction(() => /השמירה לא אושרה עדיין/.test(document.getElementById('toastMsg').textContent));
    assert.equal(sent(), 1, '"אשר וקלוט" שוב — לא נשלח פעם שנייה');
    await page.locator('#rs_cancel').click();
    // הרשת חזרה — ובכל זאת שום דבר לא נשלח לבד ברקע; רק "בדוק ונסה לשמור שוב"
    cloud.down = false;
    await page.waitForTimeout(400);
    assert.equal(sent(), 1, 'לא נשלח שוב לבד'); assert.equal((await state(page)).pending, true);
    assert.equal(await retry.innerText(), 'בדוק ונסה לשמור שוב');
    await retry.click();
  }
  // v133: נשמר מיד — בלי מסך ההבדלים ובלי הסיכום
  await page.waitForFunction(() => window.t.state().view === 'receiptsHistory');
  const saved = [...documents.entries()].filter(([k]) => /\/receipts\//.test(k));
  assert.equal(saved.length, before + 1, 'הקליטה נשמרה' + (ackLost ? ' — פעם אחת, בלי כפילות' : ''));
  // v140: טרנזקציה אחת בסיום — התעודה במזהה של הקליטה, תעודת המשלוח והקריאה שלה, ורישום; שום דבר מזה לא נכתב פעם נוספת
  const finals = receivingWrites();
  assert.equal(finals.length, 1, 'שמירה אחת לענן: ' + JSON.stringify(finals));
  assert.equal(finals[0].operation, 'commit', 'בטרנזקציה');
  const rel = finals[0].paths.map(path => path.replace(/^artifacts\/berman-app-classic\/public\/data\//, ''));
  assert.deepEqual(rel.map(path => path.split('/')[0]).sort(), ['actionLog', 'paperScans', 'papers', 'receipts'].sort(), 'תעודה + נייר + קריאה + רישום: ' + JSON.stringify(rel));
  assert.ok(rel.includes('receipts/' + draftId), 'במזהה של הקליטה');
  const paperId = rel.find(path => path.startsWith('papers/')).split('/')[1];
  assert.ok(rel.includes('paperScans/' + paperId), 'הקריאה של אותו נייר');
  const paper = documents.get('artifacts/berman-app-classic/public/data/papers/' + paperId);
  assert.equal(paper.number, '290095141'); assert.equal(paper.kind, 'delivery');
  const record = documents.get(receiptPath);
  assert.equal(record.localFinal?.sessionId, draftId);
  const items = record.items;
  assert.ok(items.length > 0 && items.every(l => l.qty === 0 && l.noteQty > 0), 'כל השורות 0 מול מה שבנייר: ' + JSON.stringify(items));
  assert.equal(await page.locator('#receiptSummaryModal').isVisible(), false, 'בלי הסיכום');
  const s = await state(page);
  assert.deepEqual(s.items, [], 'הקליטה נסגרה');
  assert.equal(s.requests, 1, 'בלי קריאה נוספת');
  // v140: הטיוטה בטלפון נסגרת רק אחרי שהענן אישר
  assert.equal(s.stored, null, 'הטיוטה בטלפון נסגרה'); assert.equal(s.pending, false);
}
try {
  // A — מסך הניירות, ואז "לספירה" ומשם "לא הגיע כלום"
  const A = await device('A'), a = A.page;
  await photographSmall(a);
  const intake = await a.locator('#app').innerText();
  assert.ok(intake.indexOf('לספירה') >= 0 && intake.indexOf('לא הגיע כלום — הכל חסר') > intake.indexOf('לספירה'), 'מתחת ל"לספירה"');
  const countBox = await inFirstScreen(a, '#app [data-role="paper-count-now"]', 'לספירה');
  const noneBox = await inFirstScreen(a, '#app [data-role="paper-none-arrived"]', 'לא הגיע כלום (מסך הניירות)');
  assert.ok(noneBox.width >= countBox.width * 0.85 && noneBox.height >= countBox.height - 1, 'לא קטן מ"לספירה"');
  assert.ok(await a.evaluate(() => window.t.scrollOk()), 'מסך הניירות: בלי גלילה לצדדים');
  await a.screenshot({ path: '/tmp/berman-v132-intake.png' });
  await a.locator('#app [data-role="paper-count-now"]').click();
  await a.waitForFunction(() => window.t.state().view === 'receiving');
  const choices = /בדקת ידנית את הכמויות מול התעודה\?[\s\S]*כל הכמויות תואמות[\s\S]*יש חוסרים או עודפים[\s\S]*לא הגיע כלום — הכל חסר/;
  assert.equal(await a.locator('#app details[data-quantity-picker]').count(), 0, 'לא מקופל');
  assert.match(await a.locator('#app [data-quantity-first]').innerText(), choices);
  const recvNone = await inFirstScreen(a, '#app [data-role="rc-quantity-none"]', 'לא הגיע כלום (מסך הקליטה)');
  const scanBox = await a.locator('#app [data-role="rc-scan"]').boundingBox();
  assert.ok(scanBox.y > recvNone.y, 'מעל "סרוק פריט לתעודה"');
  assert.ok(recvNone.width >= scanBox.width * 0.85, 'כמעט ברוחב "סרוק פריט לתעודה" (בתוך הכרטיס)');
  assert.ok(recvNone.height >= 48, 'גבוה כמו כפתור, לא שורת טקסט: ' + recvNone.height);
  assert.ok(await a.evaluate(() => window.t.scrollOk()), 'מסך הקליטה: בלי גלילה לצדדים');
  await localBanner(a);
  await a.screenshot({ path: '/tmp/berman-v132-receiving.png' });
  // v140: הקליטה שמורה בטלפון — ריענון מחזיר אותה כמו שהייתה (אותו מזהה, הנייר, שלוש הבחירות), בלי לחכות לענן
  // ובלי לקרוא את הנייר שוב בתשלום
  const beforeReload = await state(a);
  nothingInCloudYet('לפני הריענון');
  await a.reload(); await ready(a);
  const reloaded = await state(a);
  assert.equal(reloaded.view, 'receiving');
  assert.equal(reloaded.draftId, beforeReload.draftId, 'אותה קליטה אחרי ריענון');
  assert.equal(reloaded.small, true, 'הנייר נשאר בטלפון'); assert.deepEqual(reloaded.items, []);
  assert.equal(reloaded.requests, 1, 'בלי קריאה נוספת אחרי ריענון');
  assert.equal(await a.locator('#app details[data-quantity-picker]').count(), 0, 'אחרי ריענון: לא מקופל');
  assert.match(await a.locator('#app [data-quantity-first]').innerText(), choices);
  await inFirstScreen(a, '#app [data-role="rc-quantity-none"]', 'לא הגיע כלום (מסך הקליטה, אחרי ריענון)');
  assert.ok(await a.evaluate(() => window.t.scrollOk()), 'אחרי ריענון: בלי גלילה לצדדים');
  await localBanner(a);
  await a.locator('#app [data-role="rc-quantity-none"]').click();
  await a.screenshot({ path: '/tmp/berman-v132-confirm.png' });
  await confirmNone(a);
  await A.context.close();
  // B — טלפון אחר, ישר ממסך הניירות. עד v139 זו הייתה "קליטה משותפת חדשה" (ולכן ניקינו את הענן); ב-v140 לכל טלפון
  // קליטה משלו בטלפון. הענן מתנקה כדי שאותו נייר קטן ייקלט כחדש ולא כנייר שכבר נשמר בתעודה של A
  documents.clear(); writeLog.length = 0; readLog.length = 0;
  const B = await device('B'), b = B.page;
  await photographSmall(b);
  await b.locator('#app [data-role="paper-none-arrived"]').click();
  await b.waitForFunction(() => window.t.state().view === 'receiving');
  await localBanner(b);
  await confirmNone(b, { ackLost: true });
  assert.ok(await b.evaluate(() => window.t.scrollOk()));
  await B.context.close();
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log('✓ "לא הגיע כלום" בדפדפן: גלוי במסך הניירות ובמסך הקליטה, באותו גודל כמו הספירה; שאלת אישור אחת; כל השורות 0; v140: הקליטה בטלפון (גם אחרי ריענון), אפס כתיבות לענן עד הסיום, שמירה אחת אטומית, תשובה שאבדה — בלי כפילות — /tmp/berman-v132-*.png');
} finally { await browser.close(); server.close(); }
