// v160 — הסריקה בתוך הבדיקה שורה-שורה בדפדפן אמיתי (Chromium, רוחב טלפון 390px), בלי רשת חיצונית ובלי Firebase.
// אותו מסלול כמו tests/line-check-browser.mjs (v154): תעודת משלוח ונייר "ת.משלוח" קטן נקראים בקוד של האפליקציה, נכנסים לקליטה
// בדפדפן ב"לקליטה", והבדיקה שורה-שורה נפתחת מהכפתור. המצלמה מזויפת (זרם מקנבס, BarcodeDetector שלא קורא כלום), והברקוד
// "נקרא" דרך onScanned. מה שנבדק בדום אמיתי:
// - "סרוק מוצר" ו"סיום" בתחתית הקבועה: גלויים, ולא זזים כשגוללים את הרשימה.
// - הלחיצה פותחת את המצלמה (החלון מוסתר), עם "סומנו 0 מתוך 7"; ברקוד מעלה את הכרטיס, ולחיצה אמיתית על "הגיע 6" מסמנת;
//   "אחרת" — השדה בפוקוס, הסיכום מתעדכן בהקלדה, Enter שומר; מוצר שאינו בתעודה — "הוסף"; ברקוד לא מוכר — ההודעה.
// - ✕ מחזיר לרשימה: השורות שסומנו בסריקה מקופלות, השורה האחרונה מודגשת, המונה נכון; בלי שגיאות דף ובלי גלילה לצדדים.
// Run: node tests/line-check-scan-browser.mjs (Playwright + Chromium; BERMAN_CHROMIUM optional; BERMAN_SHOTS — תיקייה לצילומי מסך)
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { html, moduleSource } from './receipt-scan-harness.mjs';
import { app, delivery, printed, now, readPapers, receive, TODAY } from './one-button-helpers.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

// 1. הניירות — נקראים בקוד של האפליקציה (כמו בטלפון), ומשם הנייר והקריאה שלו נכנסים לדפדפן כאילו הם בענן
function small(number) {
  const p = delivery(number, { internalNumber: null, headerText: 'ת.משלוח', docDate: printed(now) });
  const rows = p.scan.documents[0].rows;
  p.scan.documents[0].rows = [{ ...rows[0], quantity: 5, lineNumber: 1 }, { ...rows[2], quantity: 2, lineNumber: 2 }];
  Object.assign(p.scan.documents[0], { totalUnits: 7, printedLines: 2 });
  return p;
}
const h = app(delivery('244785003'));
await receive(h);
h.serve(small('290096103'));
await readPapers(h, 1, 1);
const read = JSON.parse(h.run(`JSON.stringify(Object.values(paperLocalResults()).map(x => ({ paper: x.paper, scan: x.scan })))`));
assert.equal(read.length, 2, 'שני ניירות נקראו');
const data = { products: JSON.parse(h.run('JSON.stringify(products)')), promos: JSON.parse(h.run('JSON.stringify(promos)')), read };

const documents = new Map();
const rpc = async (operation, args = {}) => {
  if (operation === 'read') return documents.get(args.path) ?? null;
  if (operation === 'commit' || operation === 'batch') for (const [p, value, op] of args.writes) { if (op === 'delete') documents.delete(p); else documents.set(p, structuredClone(value)); }
  return true;
};
const setup = `
const initializeApp = () => ({}), getAuth = () => ({currentUser:{uid:'line-check',getIdToken:async()=> 'test'}});
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
// מצלמה מזויפת: זרם מקנבס, ומנוע שלא קורא כלום — הברקוד נכנס דרך onScanned
const fakeCanvas = document.createElement('canvas'); fakeCanvas.width = 320; fakeCanvas.height = 240;
fakeCanvas.getContext('2d').fillStyle = '#334'; fakeCanvas.getContext('2d').fillRect(0, 0, 320, 240);
navigator.mediaDevices.getUserMedia = async () => fakeCanvas.captureStream(5);
window.BarcodeDetector = class { detect() { return Promise.resolve([]); } };
`;
const replay = `
const D = ${JSON.stringify(data)};
products = D.products; promos = D.promos; receipts = []; returns = [];
papers = D.read.map(x => x.paper); // בענן, כמו אחרי הצילום
paperScanFromCloud = async id => { const x = D.read.find(y => y.paper.id === id); return x ? structuredClone(x.scan) : null; };
todayStr = () => '${TODAY}'; ledgerInvalidate();
window.fetch = async url => { throw new Error('External network is forbidden in local replay: ' + url); };
window.t = { view: () => currentView, join: id => receivingJoinDelivery({ paperId: id, explicit: true }),
  nums: () => aiScanResponse ? aiScanResponse.scan.documents.map(d => d.docNumber) : [], mode: () => receiptQuantityReview && receiptQuantityReview.mode,
  marks: () => receiptQuantityReview.docs.map(d => d.lines.map(l => l.mark + (l.got ? ':' + l.got : '')).join(',')), extras: () => receiptQuantityReview.extras.map(x => [x.productId, x.got]),
  stream: () => !!scanStream, beep: code => onScanned(code), purpose: () => scanPurpose, later: () => { lastScanTime = 0; } };
setView('receiving'); window.t.loaded = true;
`;
const css = `.hidden{display:none!important}.flex{display:flex}.grid{display:grid}.grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}.grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}.flex-1{flex:1}.min-w-0{min-width:0}.shrink-0{flex-shrink:0}.gap-2{gap:.5rem}.fixed{position:fixed}.inset-0{inset:0}.overflow-y-auto{overflow-y:auto}.min-h-0{min-height:0}.flex-col{flex-direction:column}.w-full{width:100%}.max-w-lg{max-width:32rem}.whitespace-nowrap{white-space:nowrap}body{margin:0;font:16px Arial}button,input{font:inherit;padding:8px;max-width:100%;box-sizing:border-box}
.absolute{position:absolute}.relative{position:relative}.inset-x-0{left:0;right:0}.bottom-0{bottom:0}.items-center{align-items:center}.items-start{align-items:flex-start}.gap-3{gap:.75rem}.p-3{padding:.75rem}.p-4{padding:1rem}.mt-3{margin-top:.75rem}
.grid-cols-\\[1\\.15fr_1fr\\]{grid-template-columns:1.15fr 1fr}.grid-cols-\\[1fr_auto_auto\\]{grid-template-columns:1fr auto auto}.bg-white{background:#fff}.bg-black{background:#000}.rounded-2xl{border-radius:1rem}.text-3xl{font-size:1.875rem}.min-h-\\[52px\\]{min-height:52px}.min-h-\\[48px\\]{min-height:48px}.ring-4{box-shadow:0 0 0 4px #93c5fd}.pointer-events-none{pointer-events:none}video{background:#222}`;
const pageHtml = html.replace(/<script\s+src="https:[^"]+"><\/script>/g, '').replace(/<link[^>]+(?:href="https:[^"]+"|rel="manifest")[^>]*>/g, '')
  .replace(/<script type="module">[\s\S]*?<\/script>/, () => '<script type="module">' + setup + moduleSource + replay + '</script>')
  .replace('</head>', '<style>' + css + '</style></head>');
const server = http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'none'");
  if (req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(pageHtml); }
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
  // 2. "לקליטה" על שני הניירות — התעודה פותחת קליטה, והנייר הקטן מתווסף לבד
  await page.evaluate(() => window.t.join('paper_244785003'));
  await page.evaluate(() => window.t.join('paper_290096103'));
  assert.deepEqual(await page.evaluate(() => window.t.nums()), ['244785003', '290096103']);
  const over = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  // 3. הכפתור החדש פותח את הבדיקה
  await page.locator('#app [data-role="rc-quantity-lines"]').click();
  await page.waitForSelector('#receiptQuantityModal:not(.hidden)');
  assert.equal(await page.evaluate(() => window.t.mode()), 'lines');
  assert.equal(await page.locator('#receiptQuantityTitle').innerText(), 'בדיקה שורה-שורה');
  assert.equal(await page.locator('#receiptQuantitySearch').isVisible(), false);
  assert.equal(await page.locator('#receiptQuantityRows section').count(), 3, 'שתי תעודות ו"הגיע משהו נוסף"');
  assert.match(await page.locator('#receiptQuantityRows').innerText(), /תעודה 1 מתוך 2[\s\S]*תעודה נפרדת[\s\S]*תעודה 2 מתוך 2[\s\S]*הגיע משהו נוסף/);
  assert.equal(await page.locator('#receiptQuantityConfirm').getAttribute('aria-disabled'), 'true');
  assert.equal(await page.locator('#receiptQuantityProgress').innerText(), 'סומנו 0 מתוך 7 שורות');
  const shots = process.env.BERMAN_SHOTS;
  const snap = async name => { if (shots) await page.screenshot({ path: shots + '/' + name + '.png' }); };
  const cardHidden = () => page.waitForFunction(() => document.getElementById('scanLineCard').classList.contains('hidden'));
  // 4. התחתית הקבועה: "סרוק מוצר" ו"סיום" גלויים, ולא זזים כשגוללים את הרשימה
  const scanBtn = page.locator('#receiptLineScan'), finish = page.locator('#receiptQuantityConfirm');
  assert.equal(await scanBtn.isVisible(), true); assert.equal(await finish.isVisible(), true);
  assert.equal((await scanBtn.textContent()).trim(), 'סרוק מוצר'); assert.equal((await finish.textContent()).trim(), 'סיום (נשארו 7)');
  const before = await page.evaluate(() => document.getElementById('receiptQuantityFooter').getBoundingClientRect().top);
  const scrolled = await page.evaluate(() => { const b = document.getElementById('receiptQuantityBody'); b.scrollTop = 10000; return b.scrollTop; });
  assert.ok(scrolled > 100, 'הרשימה נגללת (' + scrolled + ')');
  assert.equal(await page.evaluate(() => document.getElementById('receiptQuantityFooter').getBoundingClientRect().top), before, 'התחתית לא זזה בגלילה');
  const scanBox = await scanBtn.boundingBox(), finishBox = await finish.boundingBox();
  assert.ok(scanBox.x > finishBox.x && scanBox.width > finishBox.width, '"סרוק" מימין (RTL) ורחב יותר');
  await snap('1-list');
  // 5. הלחיצה פותחת את המצלמה; החלון מוסתר
  await scanBtn.click();
  await page.waitForSelector('#scanModal:not(.hidden)');
  await page.waitForFunction(() => window.t.stream());
  assert.equal(await page.locator('#receiptQuantityModal').isVisible(), false, 'החלון מוסתר בזמן הסריקה');
  assert.equal(await page.evaluate(() => window.t.purpose()), 'linecheck');
  assert.equal((await page.locator('#scanTitle').textContent()).trim(), 'בדיקה שורה-שורה — סריקה');
  assert.equal(await page.evaluate(() => document.getElementById('scanOverlayLabel').textContent + ' ' + document.getElementById('scanOverlayCount').textContent), 'סומנו 0 מתוך 7');
  assert.equal(await page.locator('#scanLineCard').isVisible(), false);
  // 6. ברקוד של שורה → הכרטיס; לחיצה אמיתית על "הגיע 6"
  await page.evaluate(() => window.t.beep('498256')); // לחמניות 10 בשקית
  await page.waitForSelector('#scanLineCard:not(.hidden)');
  assert.match((await page.locator('#scanLineCard').innerText()).replace(/\s+/g, ' '), /שורה 2 בתעודה 1 מתוך 2 לחמניות 10 בשקית .*6 יח׳ בתעודה.*הגיע 6/);
  await snap('2-card');
  await page.locator('[data-scan-mark="ok"]').click();
  await cardHidden();
  assert.deepEqual(await page.evaluate(() => window.t.marks()), [',ok,,,', ',']);
  assert.equal(await page.evaluate(() => document.getElementById('scanOverlayCount').textContent + ' | ' + document.getElementById('scanOverlayName').textContent), '1 מתוך 7 | ✓ לחמניות 10 בשקית · הגיע 6');
  // 7. "אחרת": השדה בפוקוס, הסיכום בהקלדה, Enter שומר
  await page.evaluate(() => { window.t.later(); window.t.beep('497112'); }); // אחיד פרוס — 12 בתעודה
  await page.waitForSelector('#scanLineCard:not(.hidden)');
  await page.locator('[data-scan-mark="qty"]').click();
  await page.waitForSelector('#scanLineGot');
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'scanLineGot', 'שדה הכמות בפוקוס');
  await page.keyboard.type('10');
  assert.equal((await page.locator('#scanLineSum').textContent()).trim(), 'התקבלו 10 · חוסר 2');
  await snap('3-qty');
  await page.keyboard.press('Enter');
  await cardHidden();
  assert.deepEqual(await page.evaluate(() => window.t.marks()), ['qty:10,ok,,,', ',']);
  // 8. מוצר שאינו בתעודה — "הוסף"
  await page.evaluate(() => { window.t.later(); window.t.beep('2037194'); }); // לחם מלא בטוב
  await page.waitForSelector('#scanLineCard:not(.hidden)');
  assert.match((await page.locator('#scanLineCard').innerText()).replace(/\s+/g, ' '), /לא בתעודה — הגיע בנוסף לחם מלא בטוב/);
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'scanLineGot');
  await page.locator('[data-scan-save]').click();
  await cardHidden();
  assert.deepEqual(await page.evaluate(() => window.t.extras()), [['code_119', '1']]);
  // 9. ברקוד לא מוכר — ההודעה, בלי כרטיס
  await page.evaluate(() => { window.t.later(); window.t.beep('7290119390519'); });
  assert.equal(await page.locator('#scanLineCard').isVisible(), false);
  assert.match(await page.locator('#toastMsg').textContent(), /ברקוד לא מזוהה/);
  // 10. ✕ — חזרה לרשימה
  await page.locator('#scanClose').click();
  await page.waitForSelector('#receiptQuantityModal:not(.hidden)');
  assert.equal(await page.locator('#scanModal').isVisible(), false);
  assert.equal(await page.evaluate(() => window.t.purpose()), 'field');
  assert.equal((await page.locator('#receiptQuantityProgress').textContent()).trim(), 'סומנו 2 מתוך 7 שורות · חוסר 2 יח׳ · עודף 1 יח׳');
  assert.match((await page.locator('#lineCheck_0_1').innerText()).replace(/\s+/g, ' '), /הגיע · 6 יח׳.*שנה/, 'השורה שסומנה בסריקה — מקופלת');
  assert.equal(await page.locator('#lineCheck_0_0 [data-line-got]').inputValue(), '10', '"אחרת" — פתוחה עם הכמות');
  assert.equal(await page.evaluate(() => document.getElementById('lineExtra_0').classList.contains('ring-4')), true, 'השורה האחרונה שסומנה — מודגשת');
  await snap('4-back');
  assert.ok(await over() <= 1, 'בלי גלילה לצדדים');
  assert.deepEqual(errors, [], 'בלי שגיאות דף');
  console.log('✓ v160 בדפדפן: הסריקה בבדיקה שורה-שורה — התחתית הקבועה, המצלמה, הכרטיס בלחיצות אמיתיות, "אחרת", "הגיע בנוסף", ברקוד לא מוכר, וחזרה לרשימה; בלי גלילה לצדדים ובלי שגיאות');
} finally {
  await browser.close();
  server.close();
}
