// (נגזר מ-none-arrived-browser.mjs) v140 — קליטה בטלפון הזה בלבד, גם כשהענן תקוע (קריאה של drafts מחוץ לטרנזקציה לא חוזרת לעולם,
// כמו "הסנכרון לא עולה" של v135). עד v139: "צפייה בלבד", "טוען את הקליטה", ואחרי 6 שניות "המשך בטלפון הזה בלבד" + אישור.
// מ-v140 אין סנכרון ביניים ואין מה לבחור: אפשר לערוך מיד וגם אחרי 6 שניות (גם כשנשארה בטלפון בחירה ישנה בסנכרון בלייב); השורה
// העליונה: "הקליטה נשמרת בטלפון הזה בלבד" — בלי "המשך בטלפון הזה בלבד", "הפעל סנכרון", "המשך אותה כאן" / "החזר אותה לכאן".
// צילום, "זה כל הניירות", "לא הגיע כלום" — אפס פעולות בענן (שום drafts, שום כתיבה). "לא הגיע כלום — שמור" → נשמר ישר לענן:
// התעודה (במזהה של הטיוטה), הנייר וקריאתו — יחד, בטרנזקציה אחת. כאן האישור מהענן אבד בדרך: הקליטה נשארת והסיכום מחכה,
// "אשר וקלוט" שוב לא שולח; פתיחה מחדש — הקליטה (מזהה, נייר, שורות) עדיין בטלפון, בלי קריאה נוספת; "בדוק ונסה לשמור שוב" →
// נשמרה, בלי כתיבה שנייה ובלי כפילות. אחרי פתיחה מחדש — עדיין בטלפון, אפשר לערוך מיד, הקליטה לא חוזרת ושום דבר לא נשלח שוב.
// drafts — רק קריאה אחת בתוך טרנזקציית הסיום (local-receiving.js בודק שטלפון בגרסה ישנה לא מחזיק בקליטה), בלי כתיבה ובלי האזנה.
// v132–v134: "לא הגיע כלום" בדפדפן אמיתי, ברוחב טלפון (390px), על נייר "ת.משלוח" קטן שצולם בכפתור שבפס; v133: נשמר (כל השורות 0)
// בלי מסך ההבדלים ובלי הסיכום. בלי גלילה לצדדים, בלי שגיאות דף, בלי רשת חיצונית, בקשת קריאה אחת (גם אחרי פתיחה מחדש).
// Run: TZ=Asia/Jerusalem node tests/solo-receiving-browser.mjs (Playwright + Chromium; BERMAN_CHROMIUM optional;
// BERMAN_TEST_CSS=<קובץ CSS> — לצילומי מסך עם העיצוב המלא במקום ה-CSS המינימלי)
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
// v140: כל פעולה בענן נרשמת — כדי לבדוק שבזמן הקליטה אין אף אחת, ושבסיום יש טרנזקציה אחת
const ops = [], cloud = { ackLost: false, down: false };
const rpc = async (operation, args = {}) => {
  ops.push({ operation, tx: !!args.tx, paths: operation === 'read' ? [args.path] : (args.writes || []).map(([path, , op]) => (op === 'delete' ? 'delete ' : '') + path) });
  if (operation === 'begin') {
    const previous = transactionQueue;
    transactionQueue = new Promise(resolve => { args.release = resolve; });
    await previous; releaseTransaction = args.release; return true;
  }
  if (operation === 'read') {
    if (cloud.down && !args.tx) throw new Error('offline: the server did not answer');
    // הסנכרון תקוע (כמו ב-v135): קריאה או האזנה ל-drafts לא חוזרת לעולם. בתוך טרנזקציית הסיום הקריאה עונה — שם local-receiving.js
    // רק קורא את מסמך הבעלות של גרסה ישנה; ענן שלא עונה בסיום הוא "אין רשת", וזה נבדק כאן עם האישור שאבד
    if (/\/drafts\//.test(args.path) && !args.tx) await new Promise(() => {});
    return documents.get(args.path) ?? null;
  }
  if (operation === 'commit' || operation === 'batch') {
    for (const [path, value, op] of args.writes) { if (op === 'delete') documents.delete(path); else documents.set(path, structuredClone(value)); }
  }
  if (operation === 'commit' || operation === 'abort') { if (releaseTransaction) releaseTransaction(); releaseTransaction = null; }
  // v140: הכתיבה נקלטה בענן, אבל התשובה לטלפון אבדה — והענן גם לא עונה לבדיקה שאחריה
  if (operation === 'commit' && cloud.ackLost) { cloud.ackLost = false; cloud.down = true; throw new Error('network: the commit landed but its acknowledgement was lost'); }
  return true;
};
const setup = `
try{localStorage.setItem('bm_shared_receiving_live','1')}catch(e){} // v140: בחירה ישנה (v136) בסנכרון בלייב שנשארה בטלפון — לא מפעילה סנכרון ולא נועלת
const initializeApp = () => ({}), getAuth = () => ({currentUser:{getIdToken:async()=> 'test'}});
const initializeFirestore = () => ({}), getFirestore = () => ({});
const persistentLocalCache = () => ({}), persistentMultipleTabManager = () => ({});
const signInAnonymously = async () => ({}), onAuthStateChanged = () => {};
const doc = (_db, ...path) => path.join('/');
const snapshot = value => ({exists:()=>value!==null,data:()=>structuredClone(value),metadata:{fromCache:false,hasPendingWrites:false}});
const getDoc = async path => snapshot(await window.__sharedRpc('read',{path}));
const getDocFromServer = getDoc; // v140: local-receiving.js בודק בשרת אם תעודה שהאישור שלה אבד כבר נשמרה
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
  try{const value=await body({get:async path=>snapshot(await window.__sharedRpc('read',{path,tx:true})),set:(path,value)=>writes.push([path,value]),delete:path=>writes.push([path,null,'delete'])});await window.__sharedRpc('commit',{writes});return value;}
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
let scanRequests=0;try{scanRequests=Number(sessionStorage.getItem('t_scan_requests'))||0}catch(e){} // v140: נספר גם אחרי פתיחה מחדש
window.fetch=async(url)=>{if(String(url)===AI_SCAN_WORKER_URL){scanRequests++;try{sessionStorage.setItem('t_scan_requests',String(scanRequests))}catch(e){}return{ok:true,status:200,json:async()=>structuredClone(testData.paper)}}throw new Error('External network is forbidden in local replay: '+url)};
openScanner=async()=>{window.t.scanner=(window.t.scanner||0)+1;};
window.t={
  state:()=>({solo:sharedReceivingOff,canEdit:canEditSharedReceipt(),engine:sharedReceiving,pending:localReceivingPending(),finalizing:sharedReceiptFinalizing,draftId:receiptDraftId,notes:receiptNotes.length,items:structuredClone(receiptList),mode:receiptCountingMode,paperState:receiptPaperScanState,view:currentView,requests:scanRequests,small:!!(papers.concat(Object.values(paperLocalResults()).map(r=>r.paper)).find(p=>p&&p.number==='290095141')||{}).small}),
  scrollOk:()=>document.scrollingElement.scrollWidth<=document.scrollingElement.clientWidth+1,
  finals:()=>{try{return Object.keys(JSON.parse(localStorage.getItem('bm_receiving_final_v1')||'{}'))}catch(e){return ['unreadable']}}
};
setView('receiving');startSharedReceiving();window.t.loaded=true;
`;
const css = process.env.BERMAN_TEST_CSS ? fs.readFileSync(process.env.BERMAN_TEST_CSS, 'utf8')
  : `.hidden{display:none!important}.flex{display:flex}.grid{display:grid}.grid-cols-2{grid-template-columns:1fr 1fr}.flex-wrap{flex-wrap:wrap}.flex-1{flex:1}.min-w-0{min-width:0}.fixed{position:fixed}.inset-0{inset:0}.items-center{align-items:center}.justify-center{justify-content:center}.w-full{width:100%}.gap-2{gap:.5rem}.font-black{font-weight:900}.min-h-\\[48px\\]{min-height:48px}.min-h-\\[52px\\]{min-height:52px}.min-h-\\[56px\\]{min-height:56px}body{margin:0;font:16px Arial}header{background:#92400e;padding:14px}button,input{font:inherit;padding:8px;max-width:100%;box-sizing:border-box}img{max-width:100%}[id$="Modal"]{background:#0008;align-items:center;justify-content:center;z-index:50}[id$="Modal"]>div{background:white;max-height:90vh;overflow-y:auto;padding:16px;box-sizing:border-box}`;
const pageHtml = html.replace(/<script\s+src="https:[^"]+"><\/script>/g, '').replace(/<link[^>]+(?:href="https:[^"]+"|rel="(?:manifest|preconnect)")[^>]*>/g, '')
  .replace(/<script type="module">[\s\S]*?<\/script>/, () => '<script type="module">' + setup + moduleSource + replay + '</script>')
  .replace('</head>', '<style>' + css + '</style></head>');
// v140: הדף טוען את local-receiving.js?v=140 ואת shared-return-events.js?v=138 (בלי local-receiving.js אין שמירה בסיום)
const missing = [];
const server = http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'none'");
  const file = req.url.split('?')[0];
  if (/^\/(local-receiving|shared-return-events|draft-handoff|shared-receiving)\.js$/.test(file)) { res.setHeader('Content-Type', 'text/javascript'); res.end(fs.readFileSync(new URL('..' + file, import.meta.url))); }
  else if (file === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(pageHtml); }
  else { if (/\.js(\?|$)/.test(req.url)) missing.push(req.url); res.statusCode = 404; res.end(); }
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
// v140: מה שהיה עד v139 בשורה העליונה ובמסך — ואיננו: נעילה, טעינה, הצעה לטלפון אחד, חזרה לסנכרון, העברה בין טלפונים
const OLD_BANNER = /לא סונכרנה|טוען את הקליטה|המשך בטלפון הזה בלבד|הפעל סנכרון|המשך אותה כאן|החזר אותה לכאן|ממשיכה בטלפון אחר|מסונכרן בלייב/;
async function localOnly(page, label) {
  const s = await state(page);
  assert.equal(s.solo, true, label + ': בטלפון הזה'); assert.equal(s.canEdit, true, label + ': אפשר לערוך — לא צפייה בלבד');
  assert.equal(s.engine, null, label + ': הסנכרון בלייב לא עלה');
  const banner = await page.locator('#sharedReceivingBanner').innerText();
  assert.match(banner, /הקליטה נשמרת בטלפון הזה בלבד/, label);
  assert.doesNotMatch(banner, OLD_BANNER, label);
  for (const role of ['off', 'on', 'retry', 'cloud', 'local', 'handoff-take', 'handoff-drop', 'side-open', 'side-drop'])
    assert.equal(await page.locator('#sharedReceivingBanner [data-shared-receiving="' + role + '"]').count(), 0, label + ': בלי ' + role);
  assert.doesNotMatch(await page.locator('body').innerText(), /המשך אותה כאן|החזר אותה לכאן|המשך כאן|המשך בטלפון הזה בלבד/, label);
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
async function confirmNone(page, { ackLost = false } = {}) {
  await page.locator('#confirmModal').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#confirmTitle').innerText(), 'לא הגיע כלום?');
  assert.deepEqual((await state(page)).items, [], 'כלום לא נרשם לפני האישור');
  assert.equal(await page.locator('#confirmOk').innerText(), 'לא הגיע כלום — שמור');
  const before = [...documents.keys()].filter(k => /\/receipts\//.test(k)).length;
  cloud.ackLost = ackLost;
  await page.locator('#confirmOk').click();
  if (ackLost) {
    // v140: התעודה נכתבה בענן, אבל האישור לא הגיע לטלפון (והענן לא ענה לבדיקה) — הקליטה לא נמחקת והסיכום מחכה (כמו ב-v135)
    await page.waitForFunction(() => window.t.state().pending && !window.t.state().finalizing);
    assert.equal(cloud.down, true, 'האישור אבד'); // "לא הגיע כלום — שמור" לבד (בלי עוד לחיצה) שלח את התעודה
    assert.equal([...documents.keys()].filter(k => /\/receipts\//.test(k)).length, before + 1, 'התעודה כבר בענן — הטלפון לא יודע');
    assert.equal(await page.locator('#receiptSummaryModal').isVisible(), true, 'הסיכום מחכה');
    const s = await state(page);
    assert.equal(s.pending, true, 'ממתין לבדיקה');
    assert.ok(s.draftId && s.items.length > 0 && s.items.every(l => l.qty === 0), 'הקליטה נשארה בטלפון: ' + JSON.stringify(s));
    assert.match(await page.locator('#receiptSummaryModal').innerText(), /נספר\s*0 יח׳ · 5 שורות/);
    cloud.down = false; // הרשת חזרה
    // "אשר וקלוט" שוב — כל עוד לא ברור מה קרה לשמירה הקודמת לא נשלח כלום; אומרים ללחוץ על הבדיקה למעלה
    const opsBefore = ops.length;
    await page.locator('#rs_ok').click();
    await page.waitForFunction(() => /השמירה לא אושרה עדיין/.test(document.getElementById('toast').innerText));
    assert.equal(ops.length, opsBefore, '"אשר וקלוט" שוב — לא נשלח');
    // הטלפון נסגר ונפתח: הקליטה (אותו מזהה, הנייר, השורות שאושרו) נשמרה בטלפון — בלי שום פעולה בענן ובלי לקרוא את הנייר שוב
    await page.reload(); await page.waitForFunction(() => window.t?.loaded);
    const r = await state(page);
    assert.equal(r.draftId, s.draftId, 'אותה קליטה אחרי פתיחה מחדש'); assert.equal(r.notes, 1, 'הנייר שבקליטה נשאר'); assert.equal(r.small, true);
    assert.deepEqual(r.items, s.items, 'השורות שאושרו נשארו'); assert.equal(r.pending, true); assert.equal(r.requests, 1, 'בלי קריאה נוספת');
    assert.equal(ops.length, opsBefore, 'פתיחה מחדש — אפס פעולות בענן');
    // עד שבודקים מה קרה לשמירה שהאישור שלה אבד לא עורכים (זו לא "צפייה בלבד" של v135) — והבדיקה באותה שורה, בלי העברה לטלפון אחר
    const banner = await page.locator('#sharedReceivingBanner').innerText();
    assert.match(banner, /השמירה לא אושרה עדיין/); assert.match(banner, /הקליטה נשמרת בטלפון הזה בלבד/); assert.doesNotMatch(banner, OLD_BANNER);
    const retry = page.locator('#sharedReceivingBanner [data-shared-receiving="local-retry"]');
    await retry.waitFor({ state: 'visible' });
    assert.ok(await page.evaluate(() => window.t.scrollOk()), 'בדוק ונסה שוב: בלי גלילה לצדדים');
    await retry.click(); // "בדוק ונסה לשמור שוב"
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
  assert.equal(s.requests, 1, 'בלי קריאה נוספת');
}
const drafts = list => list.filter(o => o.paths.some(p => /\/drafts\//.test(p)));
try {
  const A = await device('A'), a = A.page;
  const loadedAt = Date.now();
  // עד v139 (הסנכרון תקוע): צפייה בלבד, "טוען את הקליטה", ואחרי 6 שניות "המשך בטלפון הזה בלבד" + "להמשיך בטלפון הזה בלבד?".
  // v140: אין למה לחכות ואין מה לבחור — אפשר לערוך מיד, וכך גם אחרי 6 שניות; אף שאלה לא נפתחת
  await localOnly(a, 'מיד');
  await a.waitForTimeout(Math.max(0, 6500 - (Date.now() - loadedAt)));
  await localOnly(a, 'אחרי 6 שניות');
  assert.equal(await a.locator('#confirmModal').isVisible(), false, 'בלי "להמשיך בטלפון הזה בלבד?"');
  assert.ok(await a.evaluate(() => window.t.scrollOk()), 'בלי גלילה לצדדים');
  await a.screenshot({ path: '/tmp/berman-v140-local-receiving.png' });
  // צילום, "זה כל הניירות" — הכל בטלפון: אף פעולה בענן (בלי drafts, בלי כתיבה, בלי טרנזקציה)
  await photographSmall(a);
  const { draftId } = await state(a);
  assert.ok(draftId, 'נפתחה קליטה');
  await a.locator('#app [data-role="paper-none-arrived"]').click();
  await a.waitForFunction(() => window.t.state().view === 'receiving');
  await localOnly(a, 'מסך הקליטה');
  assert.deepEqual(ops, [], 'בזמן הקליטה — אפס פעולות בענן');
  // "לא הגיע כלום — שמור" — נשמר ישר לענן; כאן האישור מהענן אבד בדרך → פתיחה מחדש → "בדוק ונסה לשמור שוב"
  await confirmNone(a, { ackLost: true });
  // הסיום: טרנזקציה שכתבה פעם אחת — התעודה במזהה של הטיוטה, הנייר וקריאתו יחד; הניסיון החוזר לא כתב שוב
  const commits = ops.filter(o => o.operation === 'commit' && o.paths.length);
  assert.equal(commits.length, 1, 'כתיבה אחת לענן: ' + JSON.stringify(commits));
  assert.equal(ops.filter(o => o.operation === 'batch').length, 0, 'בלי כתיבה מחוץ לטרנזקציה');
  const base = commits[0].paths[0].replace(/receipts\/.*$/, '');
  for (const path of ['receipts/' + draftId, 'papers/paper_290095141', 'paperScans/paper_290095141'])
    assert.ok(commits[0].paths.includes(base + path), path + ' בטרנזקציה של הסיום: ' + JSON.stringify(commits[0].paths));
  assert.ok(commits[0].paths.every(p => /\/(receipts|papers|paperScans|actionLog)\//.test(p)), JSON.stringify(commits[0].paths));
  const receipt = documents.get(base + 'receipts/' + draftId);
  assert.equal(receipt.localFinal?.sessionId, draftId, 'התעודה מסומנת בקליטה שלה (כך הניסיון החוזר מזהה אותה)');
  assert.equal(documents.get(base + 'papers/paper_290095141').number, '290095141', 'הנייר נשמר עם התעודה');
  for (const collection of ['receipts', 'papers', 'paperScans', 'actionLog'])
    assert.equal([...documents.keys()].filter(k => k.includes('/' + collection + '/')).length, 1, collection + ': פעם אחת, בלי כפילות');
  // drafts: אף כתיבה ואף האזנה — רק קריאה בתוך טרנזקציית הסיום (גרסה ישנה לא מחזיקה בקליטה הזאת)
  for (const o of drafts(ops)) {
    assert.equal(o.operation, 'read', 'בלי כתיבה ל-drafts: ' + JSON.stringify(o));
    assert.equal(o.tx, true, 'בלי קריאה של drafts מחוץ לטרנזקציה: ' + JSON.stringify(o));
    assert.match(o.paths[0], new RegExp('/drafts/handoff_berman_receiving_' + draftId + '$'));
  }
  assert.ok(![...documents.keys()].some(k => /\/drafts\//.test(k)), 'שום טיוטה בענן');
  // פתיחה מחדש — עדיין בטלפון, ואפשר לערוך מיד; הקליטה שנשמרה לא חוזרת ושום דבר לא נשלח שוב
  const saved = JSON.stringify([...documents]), opsBefore = ops.length;
  await a.reload(); await a.waitForFunction(() => window.t?.loaded);
  const s = await state(a);
  assert.equal(s.draftId, null); assert.deepEqual(s.items, []); assert.equal(s.pending, false); assert.equal(s.requests, 1, 'בלי קריאה נוספת');
  assert.deepEqual(await a.evaluate(() => window.t.finals()), [], 'אין שמירה ממתינה בטלפון');
  await localOnly(a, 'אחרי פתיחה מחדש');
  assert.equal(await a.locator('#sharedReceivingBanner [data-shared-receiving="local-retry"]').count(), 0);
  await a.waitForTimeout(300);
  assert.equal(ops.length, opsBefore, 'אחרי פתיחה מחדש — אפס פעולות בענן');
  assert.equal(JSON.stringify([...documents]), saved, 'התעודה לא נכתבה שוב');
  assert.ok(await a.evaluate(() => window.t.scrollOk()), 'בלי גלילה לצדדים');
  assert.deepEqual(errors, []); assert.deepEqual(external, []); assert.deepEqual(missing, [], 'כל הסקריפטים של הדף נטענו');
  console.log('✓ קליטה בטלפון בדפדפן (v140): הענן תקוע → עורכים מיד, בלי "צפייה בלבד" ובלי "המשך בטלפון הזה בלבד"; אפס פעולות בענן בזמן הקליטה; פתיחה מחדש שומרת את הטיוטה; "לא הגיע כלום — שמור" כותב תעודה ונייר בטרנזקציה אחת; אישור שאבד → ניסיון חוזר בלי כפילות; אחרי פתיחה מחדש — שום דבר לא נשלח שוב — /tmp/berman-v140-local-receiving.png');
} finally { await browser.close(); server.close(); }
