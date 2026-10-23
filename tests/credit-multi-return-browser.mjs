// v150 — נייר זיכוי אחד לשתי החזרות, בדפדפן אמיתי ברוחב טלפון (390): המקרה מ-22.10 (נייר 95955 זיכה את ההחזרה מ-20.10
// ואת זו מ-21.10). הבדיקה שומרת על:
// - בהיסטוריה שני הכרטיסים "זוכתה — נייר 99955", עם "בנייר אחד יחד עם ההחזרה מ-…" והחלק של כל אחת בנייר — בלי גלילה לצדדים;
// - בכרטיס של 20.10 אין "שלח שוב", "החזר לרשימה", "מזג" ו"בדיקה ידנית"; הנייר — בתוך הכרטיסים, לא כרטיס נפרד;
// - במאזן — רק ההחזרה מ-22.10 ממתינה; שום דבר לא נכתב לענן, ואין שגיאות דף.
// כל הנתונים מומצאים (מוצרי הקטלוג מ-tests/ledger-2026-10.json), באותם מוצרים, כמויות, ימים ושעות כמו המקרה.
// Run: TZ=Asia/Jerusalem node tests/credit-multi-return-browser.mjs (Playwright + Chromium; BERMAN_CHROMIUM optional)
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
const ret = (id, date, time, rows) => ({ id, date, docDate: date, credited: false, timestamp: Date.parse(date + 'T' + time + ':00'), sentTo: 'קבוצה בוואטסאפ',
  items: rows.map(([code, qty]) => ({ productId: 'code_' + code, code, name: name(code), barcode: '', qty })) });
const RETS = [ret('ret_2010', '2026-10-20', '07:05', [['233', 2], ['238', 1]]),
  ret('ret_2110', '2026-10-21', '06:56', [['220', 2], ['232', 1], ['238', 3], ['349', 2]]),
  ret('ret_2210', '2026-10-22', '07:11', [['349', 2]])];
const rows = [['220', 2], ['349', 2], ['232', 1], ['233', 2], ['238', 4]];
const PAPERS = [{ schema: 1, state: 'accepted', id: 'paper_290099955', kind: 'credit', kindKnown: true, number: '290099955', terminalNumber: '290099955', numerator: '99955',
  docDay: '2026-10-22', printedTime: null, headerText: 'ח.משלוח החזרה יבש', timestamp: Date.parse('2026-10-23T06:55:59'),
  rows: rows.map(([code, qty], i) => ({ line: i + 1, itemCode: code, barcode: '', description: name(code), qty, productId: 'code_' + code, matchedBy: 'tnuva_code_exact' })),
  anchors: { units: 11, lines: 5, source: 'printed', check: 215 }, proof: { unitsOk: true, linesOk: true, checkOk: true, scanStatus: 'verified' } }];
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
todayStr=()=> '2026-10-23';ledgerInvalidate();
window.fetch=async(url)=>{throw new Error('External network is forbidden in local replay: '+url)};
window.t={ go:v=>setView(v), ledger:()=>{ ledgerInvalidate(); setView('ledger'); }, history:()=>{ receiptHistoryFilter='all'; setView('receiptsHistory'); },
  kinds:()=>currentLedger().items.filter(i=>i.state!=='info').map(i=>i.state+':'+i.kind+':'+(i.part?i.part.id:'')),
  states:()=>returns.map(r=>r.id+':'+returnStateNow(r)) };
setView('manage');window.t.loaded=true;
`;
const css = `.hidden{display:none!important}.flex{display:flex}.grid{display:grid}.flex-1{flex:1}.flex-wrap{flex-wrap:wrap}.min-w-0{min-width:0}.shrink-0{flex-shrink:0}.truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.justify-between{justify-content:space-between}.items-center{align-items:center}.gap-2{gap:.5rem}.fixed{position:fixed}.bottom-0{bottom:0}.inset-x-0{left:0;right:0}.w-full{width:100%}.text-left{text-align:left}body{margin:0;font:16px Arial}button,input{font:inherit;padding:8px;max-width:100%;box-sizing:border-box}.p-4{padding:1rem}.px-4{padding-left:1rem;padding-right:1rem}.pb-4{padding-bottom:1rem}.py-1{padding-top:.25rem;padding-bottom:.25rem}.text-\\[11px\\]{font-size:11px}.font-black{font-weight:900}`;
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
  assert.deepEqual(await page.evaluate(() => window.t.kinds()), ['pending:returnNotCreditedYet:ret_2210']);
  assert.deepEqual(await page.evaluate(() => window.t.states()), ['ret_2010:done', 'ret_2110:done', 'ret_2210:credit']);
  // היסטוריה: שני הכרטיסים פתוחים — "זוכתה — נייר 99955", הנייר המשותף והחלק של כל אחת בו
  await page.evaluate(() => window.t.history());
  const card = id => page.locator('#app details[data-rc-card="ret:' + id + '"]');
  for (const id of ['ret_2010', 'ret_2110']) await card(id).locator('summary').first().click();
  const c20 = await card('ret_2010').innerText(), c21 = await card('ret_2110').innerText();
  assert.match(c20, /זוכתה — נייר 99955/);
  assert.match(c20, /ההחזרה זוכתה \(בנייר אחד יחד עם ההחזרה מ-21\.10\)\. אין מה לעשות\./);
  assert.match(c20, /תעודת הזיכוי של ההחזרה \(3 יח׳\) · יחד עם ההחזרה מ-21\.10 \(8 יח׳\)/);
  assert.match(c21, /זוכתה — נייר 99955/);
  assert.match(c21, /תעודת הזיכוי של ההחזרה \(8 יח׳\) · יחד עם ההחזרה מ-20\.10 \(3 יח׳\)/);
  assert.doesNotMatch(c21, /התקזזו מול תעודה אחרת/);
  assert.equal(await card('ret_2010').locator('[data-role="ret-merge"], [data-role="ret-unsend"], [data-role="ret-resend"], [data-role="rv-verify-inline"]').count(), 0);
  assert.equal(await page.locator('#app [data-rc-card="paper:paper_290099955"]').count(), 0, 'הנייר — בתוך הכרטיסים');
  await noScroll('היסטוריה, שני הכרטיסים פתוחים');
  await page.screenshot({ path: shots + '/berman-v150-history.png', fullPage: true });
  // המאזן — בלי שום דבר לטיפול
  await page.evaluate(() => window.t.ledger());
  await noScroll('מאזן');
  assert.ok([...documents.keys()].every(k => !/\/(papers|returns|receipts)\//.test(k)), 'שום דבר לא נכתב לענן');
  assert.deepEqual(errors, []);
  console.log('✓ v150 בדפדפן: נייר אחד לשתי החזרות — שתיהן "זוכתה" עם החלק של כל אחת בנייר, בלי גלילה לצדדים ובלי כתיבה לענן');
} finally {
  await browser.close();
  server.close();
}
