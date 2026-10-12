// v140 (היה v136/v137: "המשך אותה כאן" בטלפון אחר) — שני טלפונים בדפדפן אמיתי: הקליטה נשמרת רק בטלפון שבו התחילה,
// והתעודה נכתבת לענן פעם אחת, בסיום. A מצלם נייר "ת.משלוח" קטן — שום דבר לא נכתב לענן (בלי גיבוי, בלי drafts, בלי
// הנייר והפענוח); ריענון — אותה קליטה, בלי קריאה בתשלום. B פותח: אין "יש קליטה פתוחה … המשך אותה כאן", הקליטה שלו ריקה
// ונפרדת, וגם הפעולה הישנה "המשך" לא מושכת אליו את הקליטה של A. A לא עובר ל"לקריאה בלבד", וגם B לא. B סופר משלו — רק
// בטלפון. A: "לא הגיע כלום — שמור", התשובה מהענן אובדת → "בדוק ונסה לשמור שוב" → התעודה (במזהה של הקליטה), הנייר, הפענוח
// ושורת היומן — בטרנזקציה אחת, בלי כפילות. הקליטה של B לא נפגעת, שורדת ריענון ונשמרת בתעודה משלה. בלי "כבר נשמרה"/"נקה",
// בלי למחוק ניירות, בלי טעינת draft-handoff.js/shared-receiving.js, בלי שגיאות, בלי רשת חיצונית, 390px.
// Run: NODE_PATH=$(npm root -g) node tests/receiving-handoff-browser.mjs
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
// נייר "ת.משלוח" קטן מהמסופון: מספר 2900…, בלי מספר פנימי
Object.assign(data.paper.scan.documents[0], { docNumber: '290095141', internalNumber: null, headerText: 'ת.משלוח', docDate: pad(now.getDate()) + '/' + pad(now.getMonth() + 1) + '/' + now.getFullYear() });
const photo = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="500"><rect width="300" height="500" fill="white"/><path d="M20 60h260M20 120h200" stroke="black" stroke-width="6"/></svg>');
// v140: כל כתיבה לענן נרשמת (commit = טרנזקציה, batch = כתיבה רגילה), ואפשר "לאבד" את התשובה של טרנזקציה שנכנסה
const commits = [], net = { loseReply: false, down: false };
let transactionQueue = Promise.resolve(), releaseTransaction;
const rpc = async (operation, args = {}) => {
  if (operation === 'begin') {
    const previous = transactionQueue;
    transactionQueue = new Promise(resolve => { args.release = resolve; });
    await previous; releaseTransaction = args.release; return true;
  }
  if (operation === 'read') { if (net.down) throw new Error('unavailable'); return documents.get(args.path) ?? null; }
  if (operation === 'list') return [...documents.entries()].filter(([k, v]) => k.startsWith(args.prefix + '/') && k.split('/').length === args.prefix.split('/').length + 1
    && v && (args.wheres || []).every(w => v[w.field] === w.value)).map(([k, v]) => ({ id: k.split('/').pop(), value: v }));
  if (operation === 'commit' || operation === 'batch') {
    for (const [path, value, op] of args.writes) { if (op === 'delete') documents.delete(path); else if(op === 'update'){const data=structuredClone(documents.get(path)||{});for(const [key,v] of Object.entries(value)){const parts=key.split('.');let obj=data;for(const p of parts.slice(0,-1)){obj[p]||={};obj=obj[p];}if(v?.__deleteField)delete obj[parts.at(-1)];else obj[parts.at(-1)]=structuredClone(v);}documents.set(path,data);}else documents.set(path, structuredClone(value)); }
    commits.push({ operation, paths: args.writes.map(w => w[0]) });
  }
  if (operation === 'commit' || operation === 'abort') { if (releaseTransaction) releaseTransaction(); releaseTransaction = null; }
  // הטרנזקציה נכנסה לענן — והתשובה לא הגיעה לטלפון (וגם הבדיקה מול השרת נכשלת, עד שהרשת חוזרת)
  if (operation === 'commit' && net.loseReply) { net.loseReply = false; net.down = true; throw new Error('unavailable: reply lost'); }
  return true;
};
const setup = `
const initializeApp = () => ({}), getAuth = () => ({currentUser:{getIdToken:async()=> 'test'}});
const initializeFirestore = () => ({}), getFirestore = () => ({});
const persistentLocalCache = () => ({}), persistentMultipleTabManager = () => ({});
const signInAnonymously = async () => ({}), onAuthStateChanged = () => {};
const doc = (_db, ...path) => path.join('/');
const collection = (_db, ...path) => ({ collection: path.join('/') });
const where = (field, op, value) => ({ field, op, value });
const query = (col, ...wheres) => ({ collection: col.collection, wheres });
const snapshot = value => ({exists:()=>value!==null,data:()=>structuredClone(value),metadata:{fromCache:false,hasPendingWrites:false}});
const getDoc = async path => snapshot(await window.__sharedRpc('read',{path}));
const getDocFromServer = getDoc;
const onSnapshot = (path, opts, callback) => {
  if (typeof opts === 'function') { callback = opts; }
  let stopped=false, previous;
  const poll=async()=>{
    if(stopped)return;
    if (path && path.collection) {
      const list=await window.__sharedRpc('list',{prefix:path.collection,wheres:path.wheres}), encoded=JSON.stringify(list);
      if(encoded!==previous){previous=encoded;await callback({docs:list.map(d=>({id:d.id,data:()=>structuredClone(d.value)})),metadata:{fromCache:false}});}
      if(!stopped)setTimeout(poll,30);
      return;
    }
    const value=await window.__sharedRpc('read',{path}), encoded=JSON.stringify(value);
    if(encoded!==previous){previous=encoded;await callback(snapshot(value));}
    if(!stopped)setTimeout(poll,30);
  };poll();return()=>{stopped=true};
};
const runTransaction = async(_db,body)=>{
  await window.__sharedRpc('begin'); const writes=[];
  try{const value=await body({get:getDoc,set:(path,value)=>writes.push([path,value]),update:(path,value)=>writes.push([path,value,'update']),delete:path=>writes.push([path,null,'delete'])});await window.__sharedRpc('commit',{writes});return value;}
  catch(error){await window.__sharedRpc('abort');throw error;}
};
const writeBatch=()=>{const writes=[];return{set:(path,value)=>writes.push([path,value]),commit:()=>window.__sharedRpc('batch',{writes})};};
const setDoc=(path,value)=>window.__sharedRpc('batch',{writes:[[path,value]]});
const deleteDoc=path=>window.__sharedRpc('batch',{writes:[[path,null,'delete']]});
const updateDoc=(path,value)=>window.__sharedRpc('batch',{writes:[[path,value,'update']]}),deleteField=()=>({__deleteField:true});
const getDocs=async q=>{const list=await window.__sharedRpc('list',{prefix:q.collection,wheres:q.wheres});return {docs:list.map(d=>({id:d.id,data:()=>d.value})),metadata:{fromCache:false}};},getDocsFromServer=getDocs;
`;
const replay = `
const testData = ${JSON.stringify(data)};
products=testData.products;promos=testData.promos;receipts=[];returns=[];
aiRunAnalyzer=async()=>{};
let scanRequests=0;
window.fetch=async(url)=>{if(String(url)===AI_SCAN_WORKER_URL){scanRequests++;return{ok:true,status:200,json:async()=>structuredClone(testData.paper)}}throw new Error('External network is forbidden in local replay: '+url)};
openScanner=async()=>{window.t.scanner=(window.t.scanner||0)+1;};
window.t={
  // v140: handoff/shared — אין מנגנון גיבוי/העברה ואין קליטה משותפת; pending — שמירה בסיום שעוד לא אושרה; stored — מזהה הטיוטה
  // ששמורה בטלפון (bm_receipt_draft); disabled — שדות שננעלו ל"לקריאה בלבד"
  state:()=>({solo:sharedReceivingOff,canEdit:canEditSharedReceipt(),pending:localReceivingPending(),handoff:!!draftHandoff,shared:!!sharedReceiving,draftId:receiptDraftId,stored:(JSON.parse(localStorage.getItem(RECEIPT_DRAFT_KEY)||'null')||{}).draftId||null,away:(draftHandoff&&draftHandoff.state().away||{}).away||'',notes:structuredClone(receiptNotes),items:structuredClone(receiptList),mode:receiptCountingMode,paperState:receiptPaperScanState,view:currentView,requests:scanRequests,disabled:document.querySelectorAll('[data-shared-receiving-disabled]').length,toast:$('toast').classList.contains('hidden')?'':$('toastMsg').textContent,small:!!(papers.concat(Object.values(paperLocalResults()).map(r=>r.paper)).find(p=>p&&p.number==='290095141')||{}).small}),
  scrollOk:()=>document.scrollingElement.scrollWidth<=document.scrollingElement.clientWidth+1,
  // B סופר משלו (כמו local-receiving-returns-browser) ומסיים קליטה בלי תעודה
  receive:(id,n)=>{receiptOpened=true;addReceiptQtyToTop(products.find(p=>p.id===id),n);saveReceiptDraft();},
  finish:async()=>{receiptNoDoc=true;pendingReceipt={lines:receiptList.map(x=>({...x})),noDoc:true,status:'open',noteParts:[]};await confirmReceipt();}
};
setView('receiving');await startSharedReceiving();window.t.loaded=true;
`;
const css = process.env.BERMAN_TEST_CSS ? fs.readFileSync(process.env.BERMAN_TEST_CSS, 'utf8')
  : `.hidden{display:none!important}.flex{display:flex}.grid{display:grid}.grid-cols-2{grid-template-columns:1fr 1fr}.flex-wrap{flex-wrap:wrap}.flex-1{flex:1}.min-w-0{min-width:0}.fixed{position:fixed}.inset-0{inset:0}.items-center{align-items:center}.justify-center{justify-content:center}.w-full{width:100%}.gap-2{gap:.5rem}.font-black{font-weight:900}.min-h-\\[48px\\]{min-height:48px}.min-h-\\[52px\\]{min-height:52px}.min-h-\\[56px\\]{min-height:56px}body{margin:0;font:16px Arial}header{background:#92400e;padding:14px}button,input{font:inherit;padding:8px;max-width:100%;box-sizing:border-box}img{max-width:100%}[id$="Modal"]{background:#0008;align-items:center;justify-content:center;z-index:50}[id$="Modal"]>div{background:white;max-height:90vh;overflow-y:auto;padding:16px;box-sizing:border-box}`;
const pageHtml = html.replace(/<script\s+src="https:[^"]+"><\/script>/g, '').replace(/<link[^>]+(?:href="https:[^"]+"|rel="(?:manifest|preconnect)")[^>]*>/g, '')
  .replace(/<script type="module">[\s\S]*?<\/script>/, () => '<script type="module">' + setup + moduleSource + replay + '</script>')
  .replace('</head>', '<style>' + css + '</style></head>');
// v140: הדף טוען local-receiving.js?v=140 (השמירה בסיום) ו-shared-return-events.js?v=138 — לא draft-handoff.js ולא shared-receiving.js
const served = [], missing = [];
const server = http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'none'");
  const file = req.url.split('?')[0]; served.push(file);
  if (/^\/(local-receiving|shared-return-events|draft-handoff|shared-receiving)\.js$/.test(file)) { res.setHeader('Content-Type', 'text/javascript'); res.end(fs.readFileSync(new URL('..' + file, import.meta.url))); }
  else if (file === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(pageHtml); }
  else { if (/\.js$/.test(file)) missing.push(file); res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, executablePath: process.env.BERMAN_CHROMIUM, args: ['--no-sandbox'] });
const errors = [], external = [];
const H = 844;
async function device(name) {
  const context = await browser.newContext({ viewport: { width: 390, height: H }, serviceWorkers: 'block', locale: 'he-IL' });
  await context.exposeBinding('__sharedRpc', (_source, operation, args) => rpc(operation, args));
  await context.route('**/*', route => { if (route.request().url().startsWith(url) || route.request().url().startsWith('data:')) return route.continue(); external.push(route.request().url()); return route.abort(); });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(name + ': ' + error.message));
  page.on('dialog', dialog => dialog.dismiss());
  await page.goto(url); await page.waitForFunction(() => window.t?.loaded);
  return { page, context };
}
const state = page => page.evaluate(() => window.t.state());
const reload = async page => { await page.reload(); await page.waitForFunction(() => window.t?.loaded); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const keys = re => [...documents.keys()].filter(k => re.test(k));
// כתיבות של קליטה: תעודה, טיוטה/גיבוי (drafts — גם המסמך האחד של v136), נייר ופענוח
const RECEIVING = /\/(receipts|drafts|papers|paperScans)\//;
const receivingWrites = () => commits.filter(c => c.paths.some(p => RECEIVING.test(p)));
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
// replyLost (v140): הטרנזקציה נכנסת לענן אבל התשובה אובדת — הקליטה נשארת בטלפון עד "בדוק ונסה לשמור שוב"
async function confirmNone(page, { replyLost = false } = {}) {
  await page.locator('#confirmModal').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#confirmTitle').innerText(), 'לא הגיע כלום?');
  assert.deepEqual((await state(page)).items, [], 'כלום לא נרשם לפני האישור');
  assert.equal(await page.locator('#confirmOk').innerText(), 'לא הגיע כלום — שמור');
  const before = [...documents.keys()].filter(k => /\/receipts\//.test(k)).length;
  const draftId = (await state(page)).draftId;
  net.loseReply = replyLost;
  await page.locator('#confirmOk').click();
  if (replyLost) {
    const retry = page.locator('#sharedReceivingBanner [data-shared-receiving="local-retry"]');
    await retry.waitFor({ state: 'visible', timeout: 10000 });
    assert.match(await page.locator('#sharedReceivingBanner').innerText(), /השמירה לא אושרה עדיין[\s\S]*בדוק ונסה לשמור שוב/);
    const p = await state(page);
    assert.equal(p.pending, true, 'השמירה ממתינה לאישור');
    assert.equal(p.draftId, draftId, 'הקליטה לא נסגרה לפני אישור'); assert.equal(p.stored, draftId, 'ושמורה בטלפון');
    assert.notEqual(p.view, 'receiptsHistory');
    assert.equal(keys(/\/receipts\//).length, before + 1, 'הטרנזקציה עצמה נכנסה פעם אחת');
    // הסיכום מחכה פתוח; "אשר וקלוט" שוב לא שולח עוד שמירה — מפנה לבדיקה שבראש מסך הקליטה
    await page.locator('#receiptSummaryModal').waitFor({ state: 'visible' });
    await page.screenshot({ path: '/tmp/berman-v140-save-unconfirmed.png' });
    await page.locator('#rs_ok').click();
    await page.waitForFunction(() => /השמירה לא אושרה עדיין/.test(window.t.state().toast));
    assert.equal(keys(/\/receipts\//).length, before + 1, 'בלי כפילות');
    assert.equal((await state(page)).pending, true);
    await page.locator('#rs_cancel').click();
    await page.locator('#receiptSummaryModal').waitFor({ state: 'hidden' });
    assert.ok(await page.evaluate(() => window.t.scrollOk()), 'בלי גלילה לצדדים');
    net.down = false; // הרשת חזרה
    await retry.click();
  }
  // v133: נשמר מיד — בלי מסך ההבדלים ובלי הסיכום
  await page.waitForFunction(() => window.t.state().view === 'receiptsHistory');
  const saved = [...documents.entries()].filter(([k]) => /\/receipts\//.test(k));
  assert.equal(saved.length, before + 1, 'הקליטה נשמרה');
  const items = saved[saved.length - 1][1].items;
  assert.ok(items.length > 0 && items.every(l => l.qty === 0 && l.noteQty > 0), 'כל השורות 0 מול מה שבנייר: ' + JSON.stringify(items));
  assert.equal(await page.locator('#receiptSummaryModal').isVisible(), false, 'בלי הסיכום');
  const s = await state(page);
  assert.deepEqual(s.items, [], 'הקליטה נסגרה');
  assert.ok(s.requests <= 1, 'בלי קריאה נוספת');
}
try {
  const A = await device('A'), a = A.page;
  let s = await state(a);
  assert.equal(s.solo, true, 'ברירת המחדל: טלפון אחד');
  // v140: אין גיבוי/מעבר בין טלפונים (draft-handoff) ואין קליטה משותפת — גם לא ברקע
  assert.equal(s.handoff, false, 'בלי מנגנון המעבר'); assert.equal(s.shared, false, 'בלי קליטה משותפת');
  await photographSmall(a);
  const draftId = (await state(a)).draftId;
  assert.ok(draftId, 'לקליטה יש מזהה');
  // היה (v136/v137): "הגיבוי לענן — בשקט" — drafts/handoff_berman_receiving_<מזהה> נוצר (open, gen 1, payload). v140: הקליטה
  // נשמרת בטלפון בלבד — גם אחרי יותר מזמן ההשהיה של הגיבוי הישן (1.5 שניות) אין שום כתיבה של קליטה לענן: לא גיבוי,
  // לא תעודה, לא הנייר ולא הפענוח שלו
  await sleep(2500);
  assert.deepEqual(receivingWrites(), [], 'בלי כתיבות קליטה לענן באמצע הקליטה');
  // המסמך האחד של v136 (drafts/receiving_handoff) — v137 סגר אותו; v140 לא נוגע במסמכי טיוטה בכלל
  assert.deepEqual(keys(/\/drafts\//), [], 'לא נכתב שום מסמך טיוטה');
  s = await state(a);
  assert.equal(s.stored, draftId, 'הטיוטה שמורה בטלפון, באותו מזהה');
  await a.locator('#app [data-role="paper-count-now"]').click();
  await a.waitForFunction(() => window.t.state().view === 'receiving');
  // היה: "הקליטה מגובה בענן". v140: הקליטה בטלפון הזה בלבד; התעודה תישמר בענן בסיום
  await a.locator('#sharedReceivingBanner', { hasText: 'הקליטה נשמרת בטלפון הזה בלבד' }).waitFor();
  assert.match(await a.locator('#sharedReceivingBanner').innerText(), /התעודה תישמר בענן בסיום/);
  assert.doesNotMatch(await a.locator('#sharedReceivingBanner').innerText(), /מגובה בענן/);
  const notesA = (await state(a)).notes.map(n => [n.units, n.lines]);
  assert.ok(notesA.length > 0, 'עוגני הנייר');
  // היה: B לוחץ "המשך אותה כאן" ומקבל אותה קליטה (מזהה, עוגנים), בלי קריאה בתשלום. v140: ההמשך הוא באותו טלפון —
  // ריענון מחזיר את אותה קליטה מהטלפון, בלי קריאה נוספת ובלי כתיבה לענן
  await reload(a);
  s = await state(a);
  assert.equal(s.draftId, draftId, 'אחרי ריענון — אותה קליטה');
  assert.deepEqual(s.notes.map(n => [n.units, n.lines]), notesA);
  assert.equal(s.paperState, 'ok'); assert.equal(s.small, true, 'הנייר שנקרא נשאר בטלפון');
  assert.equal(s.requests, 0, 'בלי קריאה בתשלום');
  assert.equal(s.canEdit, true);
  await a.locator('#sharedReceivingBanner', { hasText: 'הקליטה נשמרת בטלפון הזה בלבד' }).waitFor();
  assert.deepEqual(receivingWrites(), [], 'גם הריענון לא כתב לענן');
  // B פותח — היה: "יש קליטה פתוחה … 290095141 … המשך אותה כאן". v140: אין הצעה; הקליטה של A לא קיימת בשבילו
  const B = await device('B'), b = B.page;
  await b.locator('#sharedReceivingBanner', { hasText: 'הקליטה נשמרת בטלפון הזה בלבד' }).waitFor();
  assert.doesNotMatch(await b.locator('#sharedReceivingBanner').innerText(), /יש קליטה פתוחה|המשך אותה כאן|290095141/);
  assert.equal(await b.locator('[data-shared-receiving="handoff-take"], [data-shared-receiving="handoff-drop"]').count(), 0, 'בלי "המשך אותה כאן"/"נקה"');
  await b.locator('#app', { hasText: 'אין קליטה פתוחה' }).waitFor();
  s = await state(b);
  assert.notEqual(s.draftId, draftId, 'לא הקליטה של A'); assert.deepEqual(s.notes, []); assert.deepEqual(s.items, []);
  assert.equal(s.small, false, 'הנייר של A לא הגיע ל-B');
  assert.equal(s.requests, 0, 'בלי קריאה בתשלום');
  // היה: A — "לקריאה בלבד". v140: אף טלפון לא ננעל
  assert.equal(s.canEdit, true, 'הטלפון השני — עורך'); assert.equal(s.disabled, 0);
  assert.ok(await b.evaluate(() => window.t.scrollOk()), 'בלי גלילה לצדדים');
  await b.screenshot({ path: '/tmp/berman-v140-second-phone.png' });
  // גם הפעולה הישנה עצמה (data-shared-receiving="handoff-take" עם המזהה של A, כמו בכפתור של v137) לא מעבירה כלום
  // (v140 עונה "הקליטה נשמרת רק בטלפון שבו התחילה"; העיקר — שום דבר לא עובר ולא נכתב)
  await b.evaluate(id => document.querySelector('#sharedReceivingBanner').insertAdjacentHTML('beforeend',
    '<button data-shared-receiving="handoff-take" data-session="' + id + '">המשך אותה כאן</button>'), draftId);
  await b.locator('#sharedReceivingBanner [data-shared-receiving="handoff-take"]').click();
  await sleep(500);
  s = await state(b);
  assert.notEqual(s.draftId, draftId); assert.deepEqual(s.notes, []); assert.deepEqual(s.items, []);
  assert.doesNotMatch(s.toast, /עברה לטלפון הזה/);
  assert.equal(s.requests, 0, 'בלי קריאה בתשלום');
  assert.deepEqual(receivingWrites(), [], 'בלי כתיבה לענן');
  // היה: A — "ממשיכה בטלפון אחר", away 'moved', לקריאה בלבד, gen 2. v140: A לא יודע על B, ממשיך לערוך את הקליטה שלו
  s = await state(a);
  assert.equal(s.canEdit, true, 'הטלפון הראשון לא עובר ל"לקריאה בלבד"'); assert.equal(s.away, ''); assert.equal(s.disabled, 0);
  assert.equal(s.draftId, draftId); assert.deepEqual(s.notes.map(n => [n.units, n.lines]), notesA);
  assert.doesNotMatch(await a.locator('#sharedReceivingBanner').innerText(), /ממשיכה בטלפון|לקריאה בלבד|כבר נשמרה/);
  await a.screenshot({ path: '/tmp/berman-v140-first-phone.png' });
  // B סופר משלו — גם זה רק בטלפון שלו, ו-A לא רואה את זה
  await b.evaluate(() => window.t.receive('code_119', 4));
  const draftB = (await state(b)).draftId;
  assert.ok(draftB && draftB !== draftId, 'לכל טלפון קליטה משלו');
  const storedB = await b.evaluate(() => localStorage.getItem('bm_receipt_draft'));
  assert.equal(JSON.parse(storedB).draftId, draftB);
  assert.deepEqual(receivingWrites(), [], 'הספירה של B — רק בטלפון');
  assert.deepEqual((await state(a)).items, [], 'A לא רואה את הספירה של B');
  // A: "לא הגיע כלום — שמור" (היה: B, אחרי שקיבל את הקליטה). התשובה מהענן אובדת → "בדוק ונסה לשמור שוב"
  await a.locator('#app [data-role="rc-quantity-none"]').click();
  await confirmNone(a, { replyLost: true });
  const saved = [...documents.entries()].filter(([k]) => /\/receipts\//.test(k));
  assert.equal(saved.length, 1); assert.ok(saved[0][0].endsWith('/' + draftId), 'במזהה של הקליטה');
  // היה: savedBy.sessionId — הטרנזקציה של draft-handoff.js. v140: localFinal — הטרנזקציה של local-receiving.js
  assert.equal(saved[0][1].localFinal.sessionId, draftId, 'בטרנזקציה של המודול');
  assert.equal(saved[0][1].operationId, draftId);
  // הכל בבת אחת: התעודה, נייר המשלוח והפענוח שלו ושורת היומן — טרנזקציה אחת; הניסיון החוזר לא כתב שוב
  const finals = receivingWrites();
  assert.equal(finals.length, 1, 'כתיבת קליטה אחת לענן: ' + JSON.stringify(finals));
  assert.equal(finals[0].operation, 'commit', 'בטרנזקציה');
  const paperDocs = keys(/\/papers\//), scanDocs = keys(/\/paperScans\//);
  assert.equal(paperDocs.length, 1, 'הנייר נשמר פעם אחת'); assert.equal(scanDocs.length, 1, 'הפענוח נשמר פעם אחת');
  assert.equal(documents.get(paperDocs[0]).number, '290095141');
  for (const path of [saved[0][0], paperDocs[0], scanDocs[0]]) assert.ok(finals[0].paths.includes(path), 'באותה טרנזקציה: ' + path);
  assert.equal(finals[0].paths.filter(p => /\/actionLog\/receiving_final_/.test(p)).length, 1, 'שורת יומן אחת');
  // היה: המסמך נסגר (state 'saved'). v140: אין מסמך טיוטה בענן בכלל; ההתחייבות המקומית נמחקה והטיוטה ריקה
  assert.deepEqual(keys(/\/drafts\//), [], 'בלי מסמך טיוטה');
  s = await state(a);
  assert.equal(s.pending, false, 'השמירה אושרה'); assert.equal(s.draftId, null); assert.equal(s.stored, null);
  // היה: A — "כבר נשמרה" → "נקה" (העותק הישן). v140: אין עותק ישן באף טלפון. B — הקליטה שלו לא נפגעה, ובלי "נקה"
  await sleep(300);
  s = await state(b);
  assert.equal(s.draftId, draftB); assert.deepEqual(s.items.map(l => [l.productId, l.qty]), [['code_119', 4]]);
  assert.equal(s.canEdit, true); assert.equal(s.disabled, 0);
  assert.equal(await b.evaluate(() => localStorage.getItem('bm_receipt_draft')), storedB, 'הטיוטה של B לא השתנתה');
  assert.equal(await b.locator('[data-shared-receiving="handoff-drop"]').count(), 0);
  assert.doesNotMatch(await b.locator('#sharedReceivingBanner').innerText(), /כבר נשמרה|ממשיכה בטלפון|נקה/);
  await reload(b);
  s = await state(b);
  assert.equal(s.draftId, draftB, 'B אחרי ריענון — אותה קליטה'); assert.deepEqual(s.items.map(l => [l.productId, l.qty]), [['code_119', 4]]);
  // B מסיים — תעודה משלו, במזהה שלו; התעודה של A לא נדרסת
  const recordA = JSON.stringify(documents.get(saved[0][0]));
  await b.evaluate(() => window.t.finish());
  await b.waitForFunction(() => window.t.state().view === 'receiptsHistory');
  const all = [...documents.entries()].filter(([k]) => /\/receipts\//.test(k));
  assert.equal(all.length, 2, 'שתי תעודות — אחת לכל טלפון');
  const recordB = all.find(([k]) => k.endsWith('/' + draftB));
  assert.ok(recordB, 'במזהה של הקליטה של B');
  assert.deepEqual(recordB[1].items.map(l => [l.productId, l.qty]), [['code_119', 4]]);
  assert.equal(recordB[1].localFinal.sessionId, draftB);
  assert.equal(JSON.stringify(documents.get(saved[0][0])), recordA, 'התעודה של A לא השתנתה');
  assert.equal(receivingWrites().length, 2, 'כתיבת קליטה אחת לכל סיום');
  assert.equal((await state(b)).requests, 0, 'בלי קריאה בתשלום');
  assert.equal([...documents.keys()].filter(k => /\/trash\//.test(k)).length, 0, 'בלי למחוק ניירות');
  assert.ok(served.includes('/local-receiving.js'), 'local-receiving.js נטען');
  assert.deepEqual(served.filter(f => /draft-handoff|shared-receiving/.test(f)), [], 'המודולים של המעבר והקליטה המשותפת לא נטענים');
  assert.deepEqual(missing, [], 'בלי סקריפט חסר');
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log('✓ קליטה בטלפון שלה בדפדפן (v140): בלי כתיבה לענן באמצע → ריענון שומר → B בלי "המשך אותה כאן" ובלי לקריאה בלבד → שמירה בטרנזקציה אחת (תעודה+נייר+פענוח), תשובה שאבדה → "בדוק ונסה שוב" בלי כפילות → הקליטה של B נשמרת לחוד — /tmp/berman-v140-*.png');
} finally { await browser.close(); server.close(); }
