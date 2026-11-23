// v173 — שורה במחיר אפסי בנייר זיכוי, בדפדפן אמיתי ברוחב טלפון (390):
// - ניהול: "חסר זיכוי על 6 לחמניות כוסמין ×3 … — לבקש זיכוי מהנהג" בהתראה העליונה;
// - בדיקת נייר: הבלוק "שורה במחיר אפסי — לא נספרת כזיכוי" עם "ספור בכל זאת", "המספרים בתחתית הנייר" הם המודפס (11, 4),
//   שלושת הכפתורים של כל שורה (כולל "מחיר אפסי — לא לספור") בגובה 44px ומעלה ובלי גלילה לצדדים;
// - לחיצות אמיתיות: "ספור בכל זאת" מחזיר את השורה (בלי מוצר — "אשר את הנייר" אפור), "מחיר אפסי — לא לספור" מוציא אותה
//   שוב, ו"אשר את הנייר" שומר — 3 שורות, 8 יח׳ והשורה ב-nominal.
// ההחזרה והנייר כאן מומצאים (מוצרי הקטלוג מ-tests/ledger-2026-10.json).
// Run: TZ=Asia/Jerusalem node tests/credit-nominal-browser.mjs (Playwright + Chromium; BERMAN_CHROMIUM optional)
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
const PID = 'paper_290099318';
const RETS = [{ id: 'ret_nominal', date: '2026-10-03', docDate: '2026-10-03', credited: false, timestamp: Date.parse('2026-10-03T08:00:00'), sentTo: 'הנהג',
  items: [['238', 4], ['450', 3], ['3701', 1], ['649', 3]].map(([code, qty]) => ({ productId: 'code_' + code, code, name: name(code), barcode: '4000000', qty })) }];
// הנייר כפי שהצילום שומר אותו ב-173: שלוש שורות נספרות, והשורה במחיר 0.01 ב-nominal; העוגנים — של השורות הנספרות
const PAPERS = [{ schema: 1, rev: 1, state: 'accepted', id: PID, kind: 'credit', kindKnown: true, number: '290099318', terminalNumber: '290099318', numerator: '99318', docDay: '2026-10-04', printedTime: null,
  timestamp: Date.parse('2026-10-04T10:00:00'), captureId: 'cap_nominal', headerText: 'ת.משלוח החזרה יבש', forReturnId: null, writtenBy: '173',
  rows: [['238', '497204', 'ברמן אסלי 5 פי', 4], ['450', '498393', 'חלה מרובעת ברמן', 3], ['3701', '4033484', 'חלומית אישית 3', 1]].map(([code, barcode, description, qty], i) => ({ line: i + 1, itemCode: code, barcode, description, qty, productId: 'code_' + code, matchedBy: 'tnuva_code_exact' })),
  nominal: [{ line: 4, itemCode: '1649', barcode: '4033064', description: 'לחמניות כוסמין', qty: 3, productId: null, matchedBy: null, price: 0.01 }],
  anchors: { units: 8, lines: 3, check: 245, source: 'printed' }, proof: { unitsOk: true, linesOk: true, checkOk: true, scanStatus: 'verified' } }];
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
const runTransaction = async(_db,body)=>{const writes=[];const value=await body({get:getDoc,set:(path,value)=>writes.push([path,value]),update:(path,value)=>writes.push([path,value]),delete:path=>writes.push([path,null,'delete'])});await window.__sharedRpc('commit',{writes});return value;};
const writeBatch=()=>{const writes=[];return{set:(path,value)=>writes.push([path,value]),update:(path,value)=>writes.push([path,value]),delete:path=>writes.push([path,null,'delete']),commit:()=>window.__sharedRpc('batch',{writes})};};
const setDoc=(path,value)=>window.__sharedRpc('batch',{writes:[[path,value]]});
const updateDoc=(path,value)=>window.__sharedRpc('batch',{writes:[[path,value]]});
const deleteDoc=path=>window.__sharedRpc('batch',{writes:[[path,null,'delete']]});
`;
const replay = `
const testData = ${JSON.stringify(data)};
products=testData.products;promos=testData.promos;receipts=[];returns=${JSON.stringify(RETS)};papers=${JSON.stringify(PAPERS)};
todayStr=()=> '2026-10-05';ledgerInvalidate();
window.__saved=[];runCloudTask=async(label,task)=>{window.__saved.push(JSON.parse(JSON.stringify(task)));return true;};
window.fetch=async(url)=>{throw new Error('External network is forbidden in local replay: '+url)};
window.t={ view:()=>currentView, go:v=>setView(v), review:()=>openPaperReview('${PID}'), open:()=>currentLedger().items.filter(i=>i.state==='problem'||i.state==='question').map(i=>ledgerItemText(i,currentLedger(),ledgerAllPapers(currentLedger())).text),
  state:()=>({ ok: paperReviewState().ok, rows: paperReview.paper.rows.length, nominal: paperNominalRows(paperReview.paper).length, units: paperReview.units, lines: paperReview.lines }),
  paper:()=>JSON.parse(JSON.stringify(papers.find(p=>p.id==='${PID}'))), reviewing:()=>!!paperReview };
setView('manage');window.t.loaded=true;
`;
const css = `.hidden{display:none!important}.flex{display:flex}.grid{display:grid}.grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}.flex-1{flex:1}.flex-wrap{flex-wrap:wrap}.min-w-0{min-width:0}.shrink-0{flex-shrink:0}.truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.break-words{overflow-wrap:anywhere}.justify-between{justify-content:space-between}.items-center{align-items:center}.gap-1\\.5{gap:.375rem}.gap-2{gap:.5rem}.fixed{position:fixed}.bottom-0{bottom:0}.inset-x-0{left:0;right:0}.z-20{z-index:20}.z-40{z-index:40}.bg-white{background:#fff}.w-full{width:100%}.w-16{width:4rem}.h-11{height:2.75rem}.min-h-\\[44px\\]{min-height:44px}.h-24{height:6rem}.text-left{text-align:left}body{margin:0;font:16px Arial}#app{padding:12px}button,input{font:inherit;padding:8px;max-width:100%;box-sizing:border-box}.text-xs{font-size:12px}.text-sm{font-size:14px}.text-\\[11px\\]{font-size:11px}.font-black{font-weight:900}.p-2\\.5{padding:.625rem}.mt-2{margin-top:.5rem}.mb-2{margin-bottom:.5rem}.rounded-xl{border-radius:.75rem}.border{border:1px solid #cbd5e1}.bg-slate-100{background:#f1f5f9}.bg-blue-600{background:#2563eb;color:#fff}.bg-slate-300{background:#cbd5e1}`;
const pageHtml = html.replace(/<script\s+src="https:[^"]+"><\/script>/g, '').replace(/<link[^>]+(?:href="https:[^"]+"|rel="manifest")[^>]*>/g, '')
  .replace(/<script type="module">[\s\S]*?<\/script>/, () => '<script type="module">' + setup + moduleSource + replay + '</script>')
  .replace('</head>', '<style>' + css + '</style></head>');
const server = http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'none'");
  if (/^\/(shared-receiving|draft-handoff|local-receiving|shared-return-events)\.js/.test(req.url)) { res.setHeader('Content-Type', 'text/javascript'); res.end(fs.readFileSync(new URL('..' + req.url.split('?')[0], import.meta.url))); }
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
  const MISSING = 'חסר זיכוי על 6 לחמניות כוסמין ×3 מההחזרה של 3.10 — לבקש זיכוי מהנהג';
  // ניהול: מה שהוחזר ולא זוכה באמת — בהתראה העליונה
  assert.deepEqual(await page.evaluate(() => window.t.open()), [MISSING]);
  assert.match(await page.locator('#app').innerText(), /חסר זיכוי על 6 לחמניות כוסמין ×3 מההחזרה של 3\.10 — לבקש זיכוי מהנהג/);
  await noScroll('ניהול');
  // בדיקת נייר: הבלוק של השורה במחיר אפסי, המספרים המודפסים, ושלושת הכפתורים של כל שורה
  await page.evaluate(() => window.t.review());
  await page.waitForFunction(() => window.t.view() === 'paperReview');
  const block = page.locator('#app [data-review-nominal]');
  assert.equal(await block.count(), 1);
  const blockText = await block.innerText();
  assert.match(blockText, /שורה במחיר אפסי — לא נספרת כזיכוי/);
  assert.match(blockText, /לחמניות כוסמין ×3 \(₪0\.01\)/);
  assert.match(blockText, /שורה 4 · קוד 1649 · ברקוד 4033064/);
  assert.equal(await page.locator('#reviewUnits').inputValue(), '11');
  assert.equal(await page.locator('#reviewLines').inputValue(), '4');
  assert.match(await page.locator('#reviewStatus').innerText(), /שורות הנייר: 11 יח׳ · ✓ 4 שורות · ✓ תואם לנייר — אפשר לאשר\s*נספר כזיכוי: 8 יח׳ · 3 שורות \(בלי השורה במחיר אפסי\)/);
  assert.equal(await page.locator('#reviewSave').getAttribute('aria-disabled'), 'false');
  const tappable = async (locator, label) => {
    const n = await locator.count();
    assert.ok(n > 0, label + ': אין כפתור');
    for (let i = 0; i < n; i++) {
      const box = await locator.nth(i).boundingBox();
      assert.ok(box && box.height >= 44, label + ' ' + i + ': גובה ' + (box && box.height));
      assert.ok(box.x >= 0 && box.x + box.width <= 390 + 1, label + ' ' + i + ': מחוץ למסך (' + box.x + ' + ' + box.width + ')');
    }
    return n;
  };
  assert.equal(await tappable(page.locator('#app [data-role="review-row-nominal"]'), 'מחיר אפסי — לא לספור'), 3);
  await tappable(page.locator('#app [data-role="review-pick"]'), 'שנה מוצר');
  await tappable(page.locator('#app [data-role="review-row-del"]'), 'הסר שורה');
  await tappable(page.locator('#app [data-role="review-nominal-count"]'), 'ספור בכל זאת');
  await noScroll('בדיקת נייר');
  await page.screenshot({ path: shots + '/berman-v173-review.png', fullPage: true });
  // "ספור בכל זאת" בלחיצה אמיתית: השורה חוזרת (בלי מוצר), והאישור אפור
  await page.locator('#app [data-role="review-nominal-count"]').click();
  assert.deepEqual(await page.evaluate(() => window.t.state()), { ok: false, rows: 4, nominal: 0, units: 11, lines: 4 });
  assert.equal(await page.locator('#app [data-review-nominal]').count(), 0);
  assert.equal(await page.locator('#reviewSave').getAttribute('aria-disabled'), 'true');
  assert.match(await page.locator('#reviewStatus').innerText(), /יש שורה בלי מוצר — "בחר מוצר" בשורה המסומנת\./);
  assert.match(await page.locator('#app').innerText(), /לא זוהה: לחמניות כוסמין/);
  await noScroll('בדיקת נייר, ארבע שורות');
  // "מחיר אפסי — לא לספור" על השורה הרביעית: חוזרת לבלוק, והאישור כחול
  await page.locator('#app [data-role="review-row-nominal"]').nth(3).click();
  assert.deepEqual(await page.evaluate(() => window.t.state()), { ok: true, rows: 3, nominal: 1, units: 11, lines: 4 });
  assert.equal(await page.locator('#app [data-review-nominal]').count(), 1);
  assert.equal(await page.locator('#reviewSave').getAttribute('aria-disabled'), 'false');
  // "אשר את הנייר": נשמר מה שנספר — 3 שורות, 8 יח׳ — והשורה במחיר אפסי לצידן
  await page.locator('#reviewSave').click();
  await page.waitForFunction(() => !window.t.reviewing());
  const saved = (await page.evaluate(() => window.__saved)).filter(w => w.op === 'update' && w.path.at(-1) === PID).at(-1);
  assert.ok(saved, 'עדכון הנייר');
  assert.deepEqual([saved.data.state, saved.data.rows.length, saved.data.anchors.units, saved.data.anchors.lines, saved.data.anchors.source], ['accepted', 3, 8, 3, 'typed']);
  assert.deepEqual(saved.data.nominal.map(x => [x.line, x.itemCode, x.qty, x.price]), [[4, '1649', 3, 0.01]]);
  assert.deepEqual(await page.evaluate(() => window.t.open()), [MISSING], 'אחרי האישור — אותו חוסר במאזן');
  assert.deepEqual(errors, []);
  console.log('✓ v173 בדפדפן: שורה במחיר אפסי מוצגת בבדיקת הנייר, "ספור בכל זאת" ו"מחיר אפסי — לא לספור" בלחיצות אמיתיות, המספרים המודפסים, ושמירה של 3 שורות / 8 יח׳; בלי גלילה לצדדים');
} finally {
  await browser.close();
  server.close();
}
