// v136/v137 — שני טלפונים בדפדפן אמיתי, במצב ברירת המחדל (בלי סנכרון בלייב): A מצלם נייר "ת.משלוח" קטן — הקליטה מגובה
// לענן בשקט. B פותח: "יש קליטה פתוחה … המשך אותה כאן" → אותה קליטה. A: "ממשיכה בטלפון אחר". B: "לא הגיע כלום —
// שמור" → התעודה נשמרת במזהה של הקליטה והגיבוי נסגר. A: "כבר נשמרה" → "נקה". בלי שגיאות, בלי רשת חיצונית, 390px.
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
let transactionQueue = Promise.resolve(), releaseTransaction;
const rpc = async (operation, args = {}) => {
  if (operation === 'begin') {
    const previous = transactionQueue;
    transactionQueue = new Promise(resolve => { args.release = resolve; });
    await previous; releaseTransaction = args.release; return true;
  }
  if (operation === 'read') return documents.get(args.path) ?? null;
  if (operation === 'list') return [...documents.entries()].filter(([k, v]) => k.startsWith(args.prefix + '/') && k.split('/').length === args.prefix.split('/').length + 1
    && v && (args.wheres || []).every(w => v[w.field] === w.value)).map(([k, v]) => ({ id: k.split('/').pop(), value: v }));
  if (operation === 'commit' || operation === 'batch') {
    for (const [path, value, op] of args.writes) { if (op === 'delete') documents.delete(path); else documents.set(path, structuredClone(value)); }
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
let scanRequests=0;
window.fetch=async(url)=>{if(String(url)===AI_SCAN_WORKER_URL){scanRequests++;return{ok:true,status:200,json:async()=>structuredClone(testData.paper)}}throw new Error('External network is forbidden in local replay: '+url)};
openScanner=async()=>{window.t.scanner=(window.t.scanner||0)+1;};
window.t={
  state:()=>({solo:sharedReceivingOff,canEdit:canEditSharedReceipt(),draftId:receiptDraftId,away:(draftHandoff&&draftHandoff.state().away||{}).away||'',notes:structuredClone(receiptNotes),items:structuredClone(receiptList),mode:receiptCountingMode,paperState:receiptPaperScanState,view:currentView,requests:scanRequests,ready:!!sharedReceiving?.ready,small:!!(papers.concat(Object.values(paperLocalResults()).map(r=>r.paper)).find(p=>p&&p.number==='290095141')||{}).small}),
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
  if (req.url.startsWith('/draft-handoff.js')) { res.setHeader('Content-Type', 'text/javascript'); res.end(fs.readFileSync(new URL('../draft-handoff.js', import.meta.url))); }
  else if (req.url.startsWith('/shared-receiving.js')) { res.setHeader('Content-Type', 'text/javascript'); res.end(fs.readFileSync(new URL('../shared-receiving.js', import.meta.url))); }
  else if (req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(pageHtml); }
  else { res.statusCode = 404; res.end(); }
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
async function confirmNone(page) {
  await page.locator('#confirmModal').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#confirmTitle').innerText(), 'לא הגיע כלום?');
  assert.deepEqual((await state(page)).items, [], 'כלום לא נרשם לפני האישור');
  assert.equal(await page.locator('#confirmOk').innerText(), 'לא הגיע כלום — שמור');
  const before = [...documents.keys()].filter(k => /\/receipts\//.test(k)).length;
  await page.locator('#confirmOk').click();
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
const handoffDoc = id => documents.get([...documents.keys()].find(x => x.endsWith('/drafts/handoff_berman_receiving_' + id))) || null;
try {
  const A = await device('A'), a = A.page;
  assert.equal((await state(a)).solo, true, 'ברירת המחדל: טלפון אחד');
  await photographSmall(a);
  const draftId = (await state(a)).draftId;
  // הגיבוי לענן — בשקט, בלי לחכות לו
  for (let i = 0; i < 100 && !handoffDoc(draftId); i++) await new Promise(r => setTimeout(r, 50));
  assert.equal(handoffDoc(draftId).state, 'open'); assert.equal(handoffDoc(draftId).gen, 1); assert.ok(handoffDoc(draftId).payload.length > 100);
  assert.equal([...documents.keys()].filter(k => k.endsWith('/drafts/receiving_handoff')).length, 0, 'לא המסמך האחד של v136');
  await a.locator('#app [data-role="paper-count-now"]').click();
  await a.waitForFunction(() => window.t.state().view === 'receiving');
  await a.locator('#sharedReceivingBanner', { hasText: 'הקליטה מגובה בענן' }).waitFor();
  // B פותח — ההצעה
  const B = await device('B'), b = B.page;
  await b.locator('#sharedReceivingBanner [data-shared-receiving="handoff-take"]').waitFor({ state: 'visible' });
  assert.match(await b.locator('#sharedReceivingBanner').innerText(), /יש קליטה פתוחה[\s\S]*290095141[\s\S]*המשך אותה כאן/);
  assert.ok(await b.evaluate(() => window.t.scrollOk()), 'בלי גלילה לצדדים');
  await b.screenshot({ path: '/tmp/berman-v137-handoff-offer.png' });
  await b.locator('#sharedReceivingBanner [data-shared-receiving="handoff-take"]').click();
  await b.waitForFunction(id => window.t.state().draftId === id && window.t.state().paperState === 'ok', draftId);
  assert.deepEqual((await state(b)).notes.map(n => [n.units, n.lines]), (await state(a)).notes.map(n => [n.units, n.lines]));
  assert.equal((await state(b)).requests, 0, 'בלי קריאה בתשלום');
  // A יודע שהקליטה עברה
  await a.locator('#sharedReceivingBanner', { hasText: 'ממשיכה בטלפון אחר' }).waitFor({ timeout: 10000 });
  await a.screenshot({ path: '/tmp/berman-v137-handoff-moved.png' });
  assert.equal((await state(a)).away, 'moved');
  assert.equal((await state(a)).canEdit, false, 'הטלפון הראשון — לקריאה בלבד');
  assert.equal(handoffDoc(draftId).gen, 2);
  // B: "לא הגיע כלום — שמור"
  await b.locator('#app [data-role="rc-quantity-none"]').click();
  await confirmNone(b);
  const saved = [...documents.entries()].filter(([k]) => /\/receipts\//.test(k));
  assert.equal(saved.length, 1); assert.ok(saved[0][0].endsWith('/' + draftId), 'במזהה של הקליטה');
  assert.equal(saved[0][1].savedBy.sessionId, draftId, 'בטרנזקציה של המודול');
  assert.equal(handoffDoc(draftId).state, 'saved', 'המסמך נסגר');
  // A: "כבר נשמרה" → "נקה"
  await a.locator('#sharedReceivingBanner [data-shared-receiving="handoff-drop"]').waitFor({ state: 'visible', timeout: 10000 });
  await a.locator('#sharedReceivingBanner [data-shared-receiving="handoff-drop"]').click();
  await a.locator('#confirmModal').waitFor({ state: 'visible' });
  await a.locator('#confirmOk').click();
  await a.waitForFunction(() => !window.t.state().draftId);
  assert.equal([...documents.keys()].filter(k => /\/trash\//.test(k)).length, 0, 'בלי למחוק ניירות');
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log('✓ מעבר בין טלפונים בדפדפן (v137): גיבוי → "המשך אותה כאן" → "ממשיכה בטלפון אחר" (לקריאה בלבד) → שמירה בטרנזקציה בטלפון השני → "נקה" — /tmp/berman-v137-handoff-*.png');
} finally { await browser.close(); server.close(); }
