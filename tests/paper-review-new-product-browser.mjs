// v175 — "מוצר חדש" בבדיקת נייר, בדפדפן אמיתי ברוחב טלפון (390):
// - בשורה "לא זוהה" ארבעה כפתורים — "בחר מוצר", "מוצר חדש", "הסר שורה", "מחיר אפסי — לא לספור" — כל אחד בגובה 44px
//   ומעלה ובתוך המסך, בלי גלילה לצדדים; בשורות שזוהו אין "מוצר חדש";
// - לחיצה אמיתית על "מוצר חדש": הכרטיס הרגיל של מוצר חדש נפתח מעל המסך עם קוד הפריט, השם, הברקוד והמחירון שבשורה;
//   בוחרים קבוצה ו"שמור" — הכרטיס נסגר, השורה מציגה את המוצר החדש, ו"אשר את הנייר" נעשה כחול;
// - "אשר את הנייר": הנייר נשמר עם שלוש שורות, והשלישית על המוצר החדש.
// הנייר כאן מומצא (מוצרי הקטלוג מ-tests/ledger-2026-10.json).
// Run: TZ=Asia/Jerusalem node tests/paper-review-new-product-browser.mjs (Playwright + Chromium; BERMAN_CHROMIUM optional)
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { html, moduleSource, fixture } from './receipt-scan-harness.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const L = JSON.parse(fs.readFileSync(new URL('./ledger-2026-10.json', import.meta.url), 'utf8'));
const data = { ...fixture(), products: L.products };
const PID = 'paper_290099320';
// נייר זיכוי שמור שממתין לבדיקה: שתי שורות שזוהו, ושורה שקוד הפריט שלה (1649) אינו במאגר
const ROWS = [['238', '497204', 'ברמן אסלי 5 פי', 4, 7.95], ['450', '498393', 'חלה מרובעת ברמן', 3, 5.03], ['1649', '4033064', 'לחמניות 10 כוסמין', 3, 16.9]];
const PAPERS = [{ schema: 1, rev: 1, state: 'needs-review', id: PID, kind: 'credit', kindKnown: true, number: '290099320', terminalNumber: '290099320', numerator: '99320', docDay: '2026-10-04', printedTime: null,
  timestamp: Date.parse('2026-10-04T10:00:00'), captureId: 'cap_new', headerText: 'ת.משלוח החזרה יבש', forReturnId: null, review: { notes: [] },
  rows: ROWS.map(([code, barcode, description, qty], i) => ({ line: i + 1, itemCode: code, barcode, description, qty, productId: code === '1649' ? null : 'code_' + code, matchedBy: code === '1649' ? null : 'tnuva_code_exact' })),
  anchors: { units: 10, lines: 3, source: 'printed' }, proof: { unitsOk: true, linesOk: true, scanStatus: 'verified' } }];
// הקריאה השמורה של הנייר (paperScans): המחיר המודפס בכל שורה
const SCAN = { serviceVersion: 8, doc: { docType: 'credit', rows: ROWS.map(([code, , description, qty, price], i) => ({ lineNumber: i + 1, supplierItemCode: code, description, quantity: qty, printedListUnitPrice: price })),
  __pricePaper: { rows: ROWS.map(([code, barcode, , , price], i) => ({ lineNumber: i + 1, itemCode: code, barcode, unitPriceExVat: price })) } } };
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
products=testData.products;promos=testData.promos;receipts=[];returns=[];papers=${JSON.stringify(PAPERS)};
pricingCats=[{id:'c1',name:'לחם',pct:30}];pricingCatsLoaded=true;
todayStr=()=> '2026-10-05';ledgerInvalidate();
window.__saved=[];runCloudTask=async(label,task)=>{window.__saved.push(JSON.parse(JSON.stringify(task)));return true;};
paperScanFromCloud=async id=>id==='${PID}'?${JSON.stringify(SCAN)}:null;
window.fetch=async(url)=>{throw new Error('External network is forbidden in local replay: '+url)};
window.t={ view:()=>currentView, review:()=>openPaperReview('${PID}'), reviewing:()=>!!paperReview,
  state:()=>({ ok: paperReviewState().ok, rows: paperReview.paper.rows.map(x=>[x.itemCode,x.productId,x.matchedBy]) }),
  product:()=>JSON.parse(JSON.stringify(products.find(p=>p.id==='code_1649')||null)), target:()=>prodAfterSaveTarget };
setView('manage');window.t.loaded=true;
`;
const css = `.hidden{display:none!important}.flex{display:flex}.grid{display:grid}.grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}.flex-1{flex:1}.flex-wrap{flex-wrap:wrap}.min-w-0{min-width:0}.shrink-0{flex-shrink:0}.truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.break-words{overflow-wrap:anywhere}.justify-between{justify-content:space-between}.items-center{align-items:center}.gap-1\\.5{gap:.375rem}.gap-2{gap:.5rem}.fixed{position:fixed}.bottom-0{bottom:0}.inset-x-0{left:0;right:0}.z-20{z-index:20}.z-40{z-index:40}.bg-white{background:#fff}.w-full{width:100%}.w-16{width:4rem}.h-11{height:2.75rem}.min-h-\\[44px\\]{min-height:44px}.h-24{height:6rem}.text-left{text-align:left}body{margin:0;font:16px Arial}#app{padding:12px}button,input{font:inherit;padding:8px;max-width:100%;box-sizing:border-box}.text-xs{font-size:12px}.text-sm{font-size:14px}.text-\\[11px\\]{font-size:11px}.font-black{font-weight:900}.p-2\\.5{padding:.625rem}.mt-2{margin-top:.5rem}.mb-2{margin-bottom:.5rem}.rounded-xl{border-radius:.75rem}.border{border:1px solid #cbd5e1}.bg-slate-100{background:#f1f5f9}.bg-blue-600{background:#2563eb;color:#fff}.bg-slate-300{background:#cbd5e1}.inset-0{inset:0}.z-\\[70\\]{z-index:70}.max-h-\\[92vh\\]{max-height:92vh}.flex-col{flex-direction:column}.overflow-y-auto{overflow-y:auto}.overflow-hidden{overflow:hidden}.justify-center{justify-content:center}.p-4{padding:1rem}.max-w-sm{max-width:24rem}.min-h-0{min-height:0}`;
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
  // בדיקת נייר: השורה השלישית "לא זוהה", עם ארבעה כפתורים; בשורות שזוהו אין "מוצר חדש"
  await page.evaluate(() => window.t.review());
  await page.waitForFunction(() => window.t.view() === 'paperReview');
  assert.match(await page.locator('#app').innerText(), /לא זוהה: לחמניות 10 כוסמין/);
  assert.equal(await tappable(page.locator('#app [data-role="review-row-new"]'), 'מוצר חדש'), 1);
  assert.equal((await page.locator('#app [data-role="review-row-new"]').innerText()).trim(), 'מוצר חדש');
  assert.equal(await tappable(page.locator('#app [data-role="review-pick"]'), 'בחר מוצר'), 3);
  assert.equal(await tappable(page.locator('#app [data-role="review-row-del"]'), 'הסר שורה'), 3);
  assert.equal(await tappable(page.locator('#app [data-role="review-row-nominal"]'), 'מחיר אפסי — לא לספור'), 3);
  assert.equal(await page.locator('#reviewSave').getAttribute('aria-disabled'), 'true');
  await noScroll('בדיקת נייר');
  await page.screenshot({ path: shots + '/berman-v175-review.png', fullPage: true });
  // "מוצר חדש" בלחיצה אמיתית: הכרטיס הרגיל, עם מה שמודפס בשורה; המחירון מגיע מהקריאה השמורה
  await page.locator('#app [data-role="review-row-new"]').click();
  await page.waitForFunction(() => !document.getElementById('prodModal').classList.contains('hidden'));
  assert.equal(await page.evaluate(() => window.t.target()), 'paper_review');
  assert.equal((await page.locator('#prodTitle').innerText()).trim(), 'מוצר חדש');
  await page.waitForFunction(() => document.getElementById('prod_price').value !== '');
  assert.deepEqual(await page.evaluate(() => ['prod_code', 'prod_name', 'prod_barcode', 'prod_price'].map(id => document.getElementById(id).value)), ['1649', 'לחמניות 10 כוסמין', '4033064', '16.9']);
  await page.screenshot({ path: shots + '/berman-v175-card.png' });
  // בוחרים קבוצה ושומרים: המוצר במאגר, הכרטיס נסגר, והשורה משויכת
  await page.selectOption('#prod_category', 'c1');
  await page.locator('#prod_save').click();
  await page.waitForFunction(() => document.getElementById('prodModal').classList.contains('hidden'));
  await page.waitForFunction(() => window.t.state().ok);
  const product = await page.evaluate(() => window.t.product());
  assert.deepEqual([product.code, product.name, product.barcode, product.listPrice, product.category], ['1649', 'לחמניות 10 כוסמין', '4033064', 16.9, 'c1']);
  assert.deepEqual((await page.evaluate(() => window.t.state())).rows[2], ['1649', 'code_1649', 'user']);
  assert.equal(await page.evaluate(() => window.t.view()), 'paperReview');
  const text = await page.locator('#app').innerText();
  assert.match(text, /לחמניות 10 כוסמין/); assert.doesNotMatch(text, /לא זוהה/);
  assert.equal(await page.locator('#app [data-role="review-row-new"]').count(), 0, 'לשורה יש מוצר — אין "מוצר חדש"');
  assert.match(await page.locator('#toast').innerText(), /"לחמניות 10 כוסמין" נוסף למאגר ושויך לשורה 3\./);
  assert.equal(await page.locator('#reviewSave').getAttribute('aria-disabled'), 'false');
  await noScroll('בדיקת נייר, אחרי השיוך');
  // "אשר את הנייר": שלוש שורות, והשלישית על המוצר החדש
  await page.locator('#reviewSave').click();
  await page.waitForFunction(() => !window.t.reviewing());
  const saved = (await page.evaluate(() => window.__saved)).filter(w => w.op === 'update' && w.path.at(-1) === PID).at(-1);
  assert.ok(saved, 'עדכון הנייר');
  assert.equal(saved.data.state, 'accepted');
  assert.deepEqual(saved.data.rows.map(x => [x.itemCode, x.productId, x.qty]), [['238', 'code_238', 4], ['450', 'code_450', 3], ['1649', 'code_1649', 3]]);
  assert.deepEqual(errors, []);
  console.log('✓ v175 בדפדפן: "מוצר חדש" בשורה שלא זוהתה בבדיקת הנייר — הכרטיס עם מה שמודפס בשורה, שמירה, שיוך לשורה ואישור הנייר; ארבעת הכפתורים בגובה 44px ומעלה, בלי גלילה לצדדים');
} finally {
  await browser.close();
  server.close();
}
