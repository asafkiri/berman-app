// v139 — המאזן מקבל מקורות בסדר משתנה בדפדפן אמיתי; רק נתונים מומצאים.
// הפעלה: BERMAN_CHROMIUM=/tmp/chromium node tests/ledger-startup-browser.mjs
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { html, moduleSource } from './receipt-scan-harness.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const item = (qty, noteQty) => ({ productId: 'code_9101', code: '9101', name: 'לחם בדיקה', qty, noteQty });
const data = {
  products: [{ id: 'code_9101', code: '9101', name: 'לחם בדיקה', price: 10, listPrice: 10, defaultUnit: 'unit' }],
  receipts: [
    { id: 'rc_old', date: '2026-10-02', docDate: '2026-10-02', timestamp: 10, items: [item(4, 5)] },
    { id: 'rc_recent', date: '2026-10-05', docDate: '2026-10-05', timestamp: 20, items: [item(2, 2)] }
  ],
  returns: [],
  config: { ledgerFrom: '2026-09-01' },
  papers: [{ id: 'paper_credit', schema: 1, rev: 1, state: 'accepted', kind: 'credit', number: '290099999',
    docDay: '2026-10-03', timestamp: 30,
    rows: [{ line: 1, itemCode: '9101', productId: 'code_9101', description: 'לחם בדיקה', qty: 1 }] }]
};
const setup = `
const initializeApp=()=>({}), getAuth=()=>({currentUser:{getIdToken:async()=> 'local-test'}});
const initializeFirestore=()=>({}),getFirestore=()=>({}),persistentLocalCache=()=>({}),persistentMultipleTabManager=()=>({});
const signInAnonymously=async()=>({}),onAuthStateChanged=()=>{};
const doc=(_db,...path)=>path.join('/'),collection=(_db,...path)=>({collection:path.join('/')});
const query=(ref,...filters)=>({...ref,filters}),orderBy=(...args)=>args,limit=n=>n,where=(...args)=>args;
const listenerCallbacks=new Map();
const onSnapshot=(ref,opts,callback)=>{
 if(typeof opts==='function')callback=opts;
 listenerCallbacks.set(typeof ref==='string'?ref:ref.collection,callback);return()=>{};
};
const emptySnapshot=()=>({exists:()=>false,data:()=>undefined,docs:[],empty:true,metadata:{fromCache:false,hasPendingWrites:false}});
const getDoc=async()=>emptySnapshot(),getDocFromServer=getDoc,getDocs=async()=>emptySnapshot(),getDocsFromServer=getDocs;
const prohibitedWrite=()=>{throw new Error('כתיבה אינה מותרת בבדיקת תצוגה');};
const setDoc=prohibitedWrite,updateDoc=prohibitedWrite,deleteDoc=prohibitedWrite,runTransaction=prohibitedWrite;
const deleteField=()=>({}),writeBatch=()=>({set:prohibitedWrite,update:prohibitedWrite,delete:prohibitedWrite,commit:prohibitedWrite});
`;
const replay = `
const startupData=${JSON.stringify(data)};
// תהליכי כתיבה אחרים אינם חלק מבדיקת מאזיני המאזן. המאזינים והתצוגה עצמם הם קוד האפליקציה.
startSharedReceiving=()=>{};startReturnsEvents=()=>{};
migrateLegacyReceiptOffsets=()=>{};autoOffsetSweep=()=>{};
todayStr=()=> '2026-10-06';
window.fetch=async()=>{throw new Error('רשת חיצונית אינה מותרת בבדיקה');};
window.t={
 emit(name,value,fromCache=true){
   const suffix=name==='config'?'/config/app':'/'+name;
   const found=[...listenerCallbacks.entries()].find(([path])=>path.endsWith(suffix));
   if(!found)throw new Error('מאזין חסר: '+name);
   const v=value===undefined?structuredClone(startupData[name]):structuredClone(value);
   const metadata={fromCache,hasPendingWrites:false};
   found[1](Array.isArray(v)?{docs:v.map(row=>({id:row.id,data:()=>row})),empty:!v.length,metadata}
     :{exists:()=>v!==null,data:()=>v,metadata});
 },
 go:view=>setView(view),
 state:()=>({view:currentView,count:currentLedger().count,items:structuredClone(receiptList)}),
 openDraft(){
   receiptOpened=true;receiptNoDoc=true;receiptEntryMode='manual';receiptDocDate='2026-10-06';
   receiptList=[{productId:'code_9101',code:'9101',name:'לחם בדיקה',qty:9,unitPrice:10}];
   setView('receiving');
 }
};
startListeners();setView('receiving');window.t.loaded=true;
`;
const css = `.hidden{display:none!important}.flex{display:flex}.grid{display:grid}.flex-1{flex:1}.flex-wrap{flex-wrap:wrap}.min-w-0{min-width:0}.fixed{position:fixed}.inset-0{inset:0}.w-full{width:100%}body{margin:0;font:16px Arial}button,input{font:inherit;padding:8px;max-width:100%;box-sizing:border-box}`;
const pageHtml = html
  .replace(/<script\s+src="https:[^"]+"><\/script>/g, '')
  .replace(/<link[^>]+(?:href="https:[^"]+"|rel="(?:manifest|preconnect)")[^>]*>/g, '')
  .replace(/<script type="module">[\s\S]*?<\/script>/, () => '<script type="module">' + setup + moduleSource + replay + '</script>')
  .replace('</head>', '<style>' + css + '</style></head>');
const assets = new Set(['shared-return-events.js', 'draft-handoff.js', 'shared-receiving.js']);
const server = http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'none'");
  const asset = req.url.split('?')[0].slice(1);
  if (assets.has(asset)) { res.setHeader('Content-Type', 'text/javascript'); res.end(fs.readFileSync(new URL('../' + asset, import.meta.url))); }
  else if (req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(pageHtml); }
  else { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, executablePath: process.env.BERMAN_CHROMIUM, args: ['--no-sandbox'] });
const errors = [], external = [];
async function device() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
  await context.route('**/*', route => {
    const requestUrl = route.request().url();
    if (requestUrl.startsWith(url) || requestUrl.startsWith('data:')) return route.continue();
    external.push(requestUrl); return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.t?.loaded);
  return page;
}
const emit = (page, name, value, fromCache = true) => page.evaluate(({name,value,fromCache}) => window.t.emit(name,value,fromCache), {name,value,fromCache});
const assertLoading = async page => {
  const text = await page.locator('#app').innerText();
  assert.match(text, /בודק את המאזן/, 'לפני השלמת הטעינה המצב אינו מוצג כחוב או כמאוזן');
  assert.doesNotMatch(text, /דברים לטיפול מול ברמן|דבר אחד לטיפול מול ברמן|הכל מאוזן/);
};
const assertBalancedBanner = async page => {
  assert.equal(await page.locator('#openIssuesBanner').count(), 1, 'מקום קבוע לעדכון בלי להחליף את מסך הספירה');
  assert.equal((await page.locator('#openIssuesBanner').innerText()).trim(), '', 'הזיכוי הסיר את ההתראה בלי לעבור למסך אחר');
  assert.equal((await page.evaluate(() => window.t.state())).count, 0);
};
try {
  const page = await device();
  await assertLoading(page);
  // קליטות מגיעות לפני הזיכוי: אין התראת שווא, גם כשהנתונים הראשונים באים מהמטמון.
  for (const source of ['receipts','returns','products','config']) { await emit(page, source); await assertLoading(page); }
  await emit(page, 'papers');
  await assertBalancedBanner(page);
  // שינוי מאוחר בענן חייב להגיע לבאנר בשני הכיוונים, גם כשהבאנר היה ריק.
  await emit(page, 'papers', [], false);
  assert.match(await page.locator('#openIssuesBanner').innerText(), /דבר אחד לטיפול מול ברמן[\s\S]*חויבת ולא קיבלת/);
  await emit(page, 'papers', undefined, false);
  await assertBalancedBanner(page);
  // אותו עדכון אוטומטי במסך ניהול.
  await page.evaluate(() => window.t.go('manage'));
  await emit(page, 'papers', [], false);
  assert.match(await page.locator('#openIssuesBanner').innerText(), /דבר אחד לטיפול מול ברמן/);
  await emit(page, 'papers', undefined, false);
  await assertBalancedBanner(page);
  // עדכון זיכוי בזמן הקלדת כמות אינו מחליף את השדה ואינו גונב את המיקוד.
  await emit(page, 'papers', [], false);
  await page.evaluate(() => window.t.openDraft());
  const qty = page.locator('#app input[data-role="rc-qty"]').first();
  await qty.fill('4');
  await page.evaluate(() => { window.__focusedQty=document.activeElement; });
  assert.match(await page.locator('#openIssuesBanner').innerText(), /דבר אחד לטיפול מול ברמן/);
  await emit(page, 'papers', undefined, false);
  await assertBalancedBanner(page);
  assert.equal(await qty.inputValue(), '4');
  assert.equal(await page.evaluate(() => document.activeElement===window.__focusedQty && window.__focusedQty.isConnected), true, 'שדה הכמות והמיקוד נשמרו');
  assert.equal((await page.evaluate(() => window.t.state())).items[0].qty, 4, 'גם הטיוטה המקומית נשארה עם הכמות שהוקלדה');
  // מסך המאזן עצמו אינו טוען שהכול מאוזן לפני שהגיעו כל המקורות.
  const ledger = await device();
  await ledger.evaluate(() => window.t.go('ledger'));
  await assertLoading(ledger);
  for (const source of ['papers','products','config','returns']) { await emit(ledger, source); await assertLoading(ledger); }
  await emit(ledger, 'receipts');
  assert.match(await ledger.locator('#app').innerText(), /הכל מאוזן/);
  await emit(ledger, 'papers', [], false);
  assert.match(await ledger.locator('#app').innerText(), /חויבת ולא קיבלת/);
  assert.doesNotMatch(await ledger.locator('#app').innerText(), /הכל מאוזן/);
  await emit(ledger, 'papers', undefined, false);
  assert.match(await ledger.locator('#app').innerText(), /הכל מאוזן/);
  assert.deepEqual(errors, [], 'אין שגיאות דף');
  assert.deepEqual(external, [], 'אין פנייה לרשת חיצונית או לקריאת AI');
  console.log('✓ דפדפן: טעינה חלקית אינה יוצרת התראות שווא; זיכויים מעדכנים קליטה, ניהול ומאזן; הכמות והמיקוד נשמרים');
} finally { await browser.close(); server.close(); }
