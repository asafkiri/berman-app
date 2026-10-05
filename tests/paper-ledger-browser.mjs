// v125 — מסך "מאזן מול ברמן" ומסך הצילום בדפדפן אמיתי, על הנתונים של 4–5.10.2026.
// הבדיקה שומרת על:
// - המאזן נטען בלי שגיאות דף, עם 141 ו-142: "חויבת פעמיים" על לחמניות 10 בשקית ושאלת תיקון על לחם אחיד.
// - "כן, זה תיקון" נכתב לענן (papers/decl_corr_…) ונשאר רק 1231 ×2.
// - "בטל" מחזיר את השאלה.
// - הפס של הניירות מופיע בקליטה ונעלם במסך המאזן; מסך הצילום נפתח עם שני שדות הקובץ (מצלמה וגלריה).
// - כרטיסי התעודות של 4.10 ו-5.10 מראים "במאזן".
// Run: node tests/paper-ledger-browser.mjs (Playwright + Chromium; BERMAN_CHROMIUM optional)
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { html, moduleSource, fixture } from './receipt-scan-harness.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const L = JSON.parse(fs.readFileSync(new URL('./ledger-2026-10.json', import.meta.url), 'utf8'));
const data = { ...fixture(), products: L.products };
const documents = new Map();
const rpc = async (operation, args = {}) => {
  if (operation === 'read') return documents.get(args.path) ?? null;
  if (operation === 'commit' || operation === 'batch') for (const [p, value, op] of args.writes) { if (op === 'delete') documents.delete(p); else documents.set(p, structuredClone(value)); }
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
const onSnapshot = () => () => {};
const runTransaction = async(_db,body)=>{const writes=[];const value=await body({get:getDoc,set:(path,value)=>writes.push([path,value]),delete:path=>writes.push([path,null,'delete'])});await window.__sharedRpc('commit',{writes});return value;};
const writeBatch=()=>{const writes=[];return{set:(path,value)=>writes.push([path,value]),update:(path,value)=>writes.push([path,value]),delete:path=>writes.push([path,null,'delete']),commit:()=>window.__sharedRpc('batch',{writes})};};
const setDoc=(path,value)=>window.__sharedRpc('batch',{writes:[[path,value]]});
const deleteDoc=path=>window.__sharedRpc('batch',{writes:[[path,null,'delete']]});
`;
const replay = `
const testData = ${JSON.stringify(data)};
const L = ${JSON.stringify({ receipts: L.receipts, returns: L.returns, papers: [L.papers.p141, L.papers.p142] })};
products=testData.products;promos=testData.promos;receipts=L.receipts;returns=L.returns;papers=L.papers;
todayStr=()=> '2026-10-05';ledgerInvalidate();
window.fetch=async(url)=>{throw new Error('External network is forbidden in local replay: '+url)};
window.t={ view:()=>currentView, count:()=>currentLedger().count, history:()=>{ receiptHistoryFilter='all'; setView('receiptsHistory'); }, kinds:()=>currentLedger().items.filter(i=>i.state==='problem'||i.state==='question').map(i=>i.kind+':'+i.key) };
setView('receiving');window.t.loaded=true;
`;
const css = `.hidden{display:none!important}.flex{display:flex}.grid{display:grid}.flex-1{flex:1}.gap-2{gap:.5rem}.fixed{position:fixed}.bottom-0{bottom:0}.inset-x-0{left:0;right:0}.w-full{width:100%}body{margin:0;font:16px Arial}button,input{font:inherit;padding:8px;max-width:100%;box-sizing:border-box}`;
const pageHtml = html.replace(/<script\s+src="https:[^"]+"><\/script>/g, '').replace(/<link[^>]+(?:href="https:[^"]+"|rel="manifest")[^>]*>/g, '')
  .replace(/<script type="module">[\s\S]*?<\/script>/, () => '<script type="module">' + setup + moduleSource + replay + '</script>')
  .replace('</head>', '<style>' + css + '</style></head>');
const server = http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'none'");
  if (req.url.startsWith('/shared-receiving.js')) { res.setHeader('Content-Type', 'text/javascript'); res.end(fs.readFileSync(new URL('../shared-receiving.js', import.meta.url))); }
  else if (req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(pageHtml); }
  else { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, executablePath: process.env.BERMAN_CHROMIUM, args: ['--no-sandbox'] });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 860 }, serviceWorkers: 'block', locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
  await context.exposeBinding('__sharedRpc', (_source, operation, args) => rpc(operation, args));
  await context.route('**/*', route => { const u = route.request().url(); if (u.startsWith(url) || u.startsWith('data:')) return route.continue(); return route.abort(); });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => window.t && window.t.loaded);
  // הפס בקליטה
  assert.match(await page.locator('#ledgerBar').innerText(), /צלם נייר מברמן[\s\S]*מאזן: 2 לטיפול/);
  await page.locator('#ledgerBar [data-role="ledger-open"]').click();
  assert.equal(await page.evaluate(() => window.t.view()), 'ledger');
  assert.equal((await page.locator('#ledgerBar').innerText()).trim(), '', 'הפס לא מופיע במסך המאזן עצמו');
  const text = await page.locator('#app').innerText();
  assert.match(text, /חויבת פעמיים על לחמניות 10 בשקית ×2 — לבקש זיכוי מהנהג/);
  assert.match(text, /נראה שזה תיקון לזיכוי של ההחזרה מ-4\.10/);
  assert.deepEqual(await page.evaluate(() => window.t.kinds()), ['chargedTwice:code_1231', 'correctionPair:code_100']);
  // "כן, זה תיקון"
  await page.locator('#app [data-role="ledger-declare-correction"]').click();
  await page.waitForFunction(() => window.t.count() === 1);
  const decl = [...documents.keys()].find(k => /\/papers\/decl_corr_/.test(k));
  assert.ok(decl, 'ההצהרה נכתבה לענן');
  assert.equal(documents.get(decl).declare, 'correction');
  assert.deepEqual(await page.evaluate(() => window.t.kinds()), ['chargedTwice:code_1231']);
  assert.match(await page.locator('#app').innerText(), /התשובות שלך \(1\)/);
  // "בטל" מחזיר את השאלה
  await page.locator('#app details summary', { hasText: 'התשובות שלך' }).click();
  await page.locator('#app [data-role="ledger-undo"]').click();
  await page.waitForFunction(() => window.t.count() === 2);
  assert.ok(!documents.has(decl));
  // מסך הצילום
  await page.locator('#app [data-role="paper-photo"]').first().click();
  assert.equal(await page.evaluate(() => window.t.view()), 'paperIntake');
  assert.equal(await page.locator('#paperCamInput').getAttribute('capture'), 'environment');
  assert.equal(await page.locator('#paperGalInput').getAttribute('multiple'), '');
  // כרטיסי התעודות
  await page.evaluate(() => window.t.history());
  const hist = await page.locator('#app').evaluate(el => el.textContent); // הכרטיסים מקופלים (details)
  assert.ok((hist.match(/במאזן: \d+ לטיפול|מוסבר במאזן/g) || []).length >= 2, 'שורת המאזן בכרטיסי 4.10 ו-5.10');
  assert.deepEqual(errors, []);
  console.log('✓ מאזן מול ברמן בדפדפן: 2 לטיפול → "כן, זה תיקון" → 1 → ביטול → 2; מסך הצילום וכרטיסי התעודות');
} finally {
  await browser.close();
  server.close();
}
