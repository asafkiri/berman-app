// v141 — כרטיס ההחזרה וההתראות בדפדפן אמיתי ברוחב טלפון (390):
// - לכל מוצר "זוכה N · חסר / עודף / במקומו זוכה …", ובשורת הסיכום "חסר זיכוי · עודף זיכוי" — בלי גלילה לצדדים;
// - החלפה באותו מחיר — "לידיעה" במאזן, בלי "לטיפול"; במחיר שונה — "מקבל את ההחלפה"; חוסר חלקי — בהתראה העליונה;
// - "פער בזיכוי" — באדום; שום דבר לא נכתב לענן.
// כל ההחזרות והניירות כאן מומצאים (מוצרי הקטלוג מ-tests/ledger-2026-10.json).
// Run: TZ=Asia/Jerusalem node tests/credit-swap-browser.mjs (Playwright + Chromium; BERMAN_CHROMIUM optional)
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { html, moduleSource, fixture } from './receipt-scan-harness.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const L = JSON.parse(fs.readFileSync(new URL('./ledger-2026-10.json', import.meta.url), 'utf8'));
const data = { ...fixture(), products: L.products };
const name = code => (L.products.find(p => p.id === 'code_' + code) || {}).name || code;
const ret = (id, rows, date) => ({ id, date, docDate: date, credited: false, timestamp: Date.parse(date + 'T08:00:00'), sentTo: 'הנהג',
  items: rows.map(([code, qty]) => ({ productId: 'code_' + code, code, name: name(code), barcode: '4000000', qty })) });
const credit = (number, rows, docDay) => ({ schema: 1, state: 'accepted', id: 'paper_' + number, kind: 'credit', number, terminalNumber: number, numerator: number.slice(-5), docDay, printedTime: '10:00',
  timestamp: Date.parse(docDay + 'T10:00:00') + Number(number.slice(-2)),
  rows: rows.map(([code, qty], i) => ({ line: i + 1, itemCode: code, barcode: '', description: code, qty, productId: 'code_' + code, matchedBy: 'code' })),
  anchors: { units: rows.reduce((a, x) => a + x[1], 0), lines: rows.length, source: 'printed' }, proof: { unitsOk: true, linesOk: true } });
// שלוש החזרות מומצאות: החלפה באותו מחיר (נסגרת לבד), החלפה במחיר שונה (לטיפול), וחוסר חלקי אמיתי
const RETS = [ret('ret_b_same', [['450', 1], ['451', 2], ['238', 6], ['344', 3]], '2026-10-01'),
  ret('ret_b_diff', [['100', 1], ['101', 2], ['2381', 3], ['349', 6]], '2026-10-02'),
  ret('ret_b_short', [['458', 7], ['3701', 1], ['339', 6]], '2026-10-03')];
const PAPERS = [credit('290099201', [['450', 3], ['238', 6], ['344', 3]], '2026-10-02'), credit('290099202', [['100', 3], ['2381', 3], ['349', 6]], '2026-10-03'),
  credit('290099203', [['3701', 1], ['339', 6]], '2026-10-04')];
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
products=testData.products;promos=testData.promos;receipts=[];returns=${JSON.stringify(RETS)};papers=${JSON.stringify(PAPERS)};
todayStr=()=> '2026-10-05';ledgerInvalidate();
window.fetch=async(url)=>{throw new Error('External network is forbidden in local replay: '+url)};
window.t={ view:()=>currentView, go:v=>setView(v), ledger:()=>{ ledgerInvalidate(); setView('ledger'); }, history:()=>{ receiptHistoryFilter='all'; setView('receiptsHistory'); },
  kinds:()=>currentLedger().items.map(i=>i.state+':'+i.kind+':'+(i.key||'')) };
setView('manage');window.t.loaded=true;
`;
const css = `.hidden{display:none!important}.flex{display:flex}.grid{display:grid}.flex-1{flex:1}.flex-wrap{flex-wrap:wrap}.min-w-0{min-width:0}.shrink-0{flex-shrink:0}.truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.justify-between{justify-content:space-between}.items-center{align-items:center}.gap-2{gap:.5rem}.fixed{position:fixed}.bottom-0{bottom:0}.inset-x-0{left:0;right:0}.w-full{width:100%}.text-left{text-align:left}body{margin:0;font:16px Arial}button,input{font:inherit;padding:8px;max-width:100%;box-sizing:border-box}.text-rose-600{color:#e11d48}.text-slate-500{color:#64748b}.text-amber-700{color:#b45309}.bg-rose-600{background:#e11d48;color:#fff}.bg-amber-400{background:#fbbf24}.p-4{padding:1rem}.px-4{padding-left:1rem;padding-right:1rem}.pb-4{padding-bottom:1rem}.py-1{padding-top:.25rem;padding-bottom:.25rem}.text-\\[11px\\]{font-size:11px}.font-black{font-weight:900}`;
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
const shots = process.env.BERMAN_SHOTS || '/tmp';
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 860 }, serviceWorkers: 'block', locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
  await context.exposeBinding('__sharedRpc', (_source, operation, args) => rpc(operation, args));
  await context.route('**/*', route => { const u = route.request().url(); if (u.startsWith(url) || u.startsWith('data:')) return route.continue(); return route.abort(); });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => window.t && window.t.loaded);
  const noScroll = async label => {
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(over <= 1, label + ': גלילה לצדדים ' + over);
  };
  // המאזן: החלפה באותו מחיר — "לידיעה"; במחיר שונה — לטיפול; החוסר החלקי — לטיפול
  assert.deepEqual((await page.evaluate(() => window.t.kinds())).sort(),
    ['info:autoSwap:code_451', 'problem:returnedNotCredited:code_458', 'problem:swap:code_101']);
  // ניהול: ההתראה העליונה מראה גם את החוסר, והבאנר של ההחזרות אדום כי יש פער בזיכוי
  const manage = await page.locator('#app').innerText();
  assert.match(manage, /2 דברים לטיפול מול ברמן/);
  assert.match(manage, /חסר זיכוי על חלומית ארוזה ברמן ×7 מההחזרה של 3\.10 — לבקש זיכוי מהנהג/);
  assert.match(manage, /ברמן זיכתה לחם אחיד ברמן ×2 במקום אחיד פרוס ברמן שהחזרת ב-2\.10/);
  assert.match(manage, /יש פער בזיכוי ב-2 תעודות חזרות/);
  await noScroll('ניהול');
  await page.screenshot({ path: shots + '/berman-v141-manage.png', fullPage: false });
  // מסך המאזן: "מקבל את ההחלפה" רק על ההחלפה במחיר שונה
  await page.evaluate(() => window.t.ledger());
  assert.equal(await page.locator('#app [data-role="ledger-accept-swap"]').count(), 1);
  assert.match(await page.locator('#app').evaluate(el => el.textContent), /ברמן זיכתה חלה מרובעת ברמן ×2 במקום חלה קלועה ברמן שהחזרת ב-1\.10 — אותו מחיר, התקזז\. אין מה לבקש/);
  await noScroll('מאזן');
  await page.screenshot({ path: shots + '/berman-v141-ledger.png', fullPage: true });
  // היסטוריה: כל כרטיס החזרה פתוח — שורות "זוכה …" ושורת הסיכום, בלי גלילה לצדדים
  await page.evaluate(() => window.t.history());
  const cards = page.locator('#app details', { hasText: 'תעודת חזרות' });
  assert.equal(await cards.count(), 3);
  for (let i = 0; i < 3; i++) await cards.nth(i).locator('summary').click();
  const hist = await page.locator('#app').innerText();
  assert.match(hist, /זוכה 0 · במקומו זוכה חלה מרובעת ברמן ×2 \(אותו מחיר — התקזז\)/);
  assert.match(hist, /זוכה 0 · חסר 2 · במקומו זוכה לחם אחיד ברמן ×2/);
  assert.match(hist, /זוכה 0 · חסר 7/);
  assert.match(hist, /חסר זיכוי 2 · עודף זיכוי 2/);
  assert.match(hist, /חסר זיכוי 7/);
  await noScroll('היסטוריה, כרטיסים פתוחים');
  await page.screenshot({ path: shots + '/berman-v141-history.png', fullPage: true });
  // החזרות: הבאנר אדום — יש פער בזיכוי
  await page.evaluate(() => window.t.go('returns'));
  assert.equal(await page.locator('#app [data-role="ret-history"].bg-rose-600').count(), 1);
  await noScroll('החזרות');
  assert.ok([...documents.keys()].every(k => !/\/(papers|returns|receipts)\//.test(k)), 'שום דבר לא נכתב לענן');
  assert.deepEqual(errors, []);
  console.log('✓ v141 בדפדפן: החלפה באותו מחיר לידיעה, במחיר שונה לטיפול, חוסר חלקי בהתראה; כרטיסי ההחזרה עם זוכה/חסר/עודף לכל מוצר, בלי גלילה לצדדים');
} finally {
  await browser.close();
  server.close();
}
