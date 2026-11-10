// v160 — הסריקה בתוך הבדיקה שורה-שורה בדפדפן אמיתי (Chromium, רוחב טלפון 390px), בלי רשת חיצונית ובלי Firebase.
// אותו מסלול כמו tests/line-check-browser.mjs (v154): תעודת משלוח ונייר "ת.משלוח" קטן נקראים בקוד של האפליקציה, נכנסים לקליטה
// בדפדפן ב"לקליטה", והבדיקה שורה-שורה נפתחת מהכפתור. המצלמה מזויפת (זרם מקנבס, BarcodeDetector שלא קורא כלום), והברקוד
// "נקרא" דרך onScanned. מה שנבדק בדום אמיתי:
// - "סרוק מוצר" ו"סיום" בתחתית הקבועה: גלויים, ולא זזים כשגוללים את הרשימה.
// - הלחיצה פותחת את המצלמה (החלון מוסתר), עם "סומנו 0 מתוך 5"; ברקוד מעלה את הכרטיס, ולחיצה אמיתית על "הגיע 6" מסמנת;
//   "אחרת" — השדה בפוקוס, הסיכום מתעדכן בהקלדה, Enter שומר; מוצר שאינו בתעודה — "הוסף"; ברקוד לא מוכר — ההודעה.
// - v165: כל סימון מהכרטיס סוגר את המצלמה וחוזר לרשימה — רק השורה שסומנה מודגשת, והיא נגללת לתוך המסך (גם הכרטיס הצהוב
//   בתחתית); "סרוק מוצר" שוב למוצר הבא, עם המונה המעודכן. ✕ בכרטיס, "תקן את הסה״כ" וברקוד לא מוכר משאירים את המצלמה.
// - ✕ במצלמה מחזיר לרשימה כמו שהיא: השורות שסומנו בסריקה מקופלות, המונה נכון; בלי שגיאות דף ובלי גלילה לצדדים.
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
  stream: () => !!scanStream, beep: code => onScanned(code), purpose: () => scanPurpose, later: () => { lastScanTime = 0; }, card: () => receiptLineScanCard };
setView('receiving'); window.t.loaded = true;
`;
const css = `.hidden{display:none!important}.flex{display:flex}.grid{display:grid}.grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}.grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}.flex-1{flex:1}.min-w-0{min-width:0}.shrink-0{flex-shrink:0}.gap-2{gap:.5rem}.fixed{position:fixed}.inset-0{inset:0}.overflow-y-auto{overflow-y:auto}.min-h-0{min-height:0}.flex-col{flex-direction:column}.w-full{width:100%}.max-w-lg{max-width:32rem}.whitespace-nowrap{white-space:nowrap}body{margin:0;font:16px Arial}button,input{font:inherit;padding:8px;max-width:100%;box-sizing:border-box}
.absolute{position:absolute}.relative{position:relative}.inset-x-0{left:0;right:0}.bottom-0{bottom:0}.items-center{align-items:center}.items-start{align-items:flex-start}.gap-3{gap:.75rem}.p-3{padding:.75rem}.p-4{padding:1rem}.mt-3{margin-top:.75rem}
.grid-cols-\\[1\\.15fr_1fr\\]{grid-template-columns:1.15fr 1fr}.grid-cols-\\[1fr_auto_auto\\]{grid-template-columns:1fr auto auto}.bg-white{background:#fff}.bg-black{background:#000}.rounded-2xl{border-radius:1rem}.text-3xl{font-size:1.875rem}.min-h-\\[52px\\]{min-height:52px}.min-h-\\[48px\\]{min-height:48px}.ring-4{box-shadow:0 0 0 4px #93c5fd}.pointer-events-none{pointer-events:none}.h-full{height:100%}.items-stretch{align-items:stretch}.top-0{top:0}.px-4{padding-left:1rem;padding-right:1rem}.pt-4{padding-top:1rem}.pb-4{padding-bottom:1rem}video{background:#222}`;
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
  assert.equal(await page.locator('#receiptQuantityProgress').innerText(), 'סומנו 0 מתוך 5 שורות');
  const shots = process.env.BERMAN_SHOTS;
  const snap = async name => { if (shots) await page.screenshot({ path: shots + '/' + name + '.png' }); };
  const cardHidden = () => page.waitForFunction(() => document.getElementById('scanLineCard').classList.contains('hidden'));
  const highlighted = () => page.evaluate(() => [...document.querySelectorAll('#receiptQuantityRows .ring-4')].map(e => e.id));
  // v165: הסימון סגר את המצלמה — הרשימה חזרה, רק השורה שסומנה מודגשת, והיא בתוך המסך (נגללת למרכז) ולא מתחת לכותרת הדביקה
  const returned = async id => {
    await page.waitForSelector('#receiptQuantityModal:not(.hidden)');
    assert.equal(await page.locator('#scanModal').isVisible(), false, 'המצלמה נסגרה אחרי הסימון');
    assert.equal(await page.evaluate(() => window.t.purpose()), 'field');
    assert.equal(await page.evaluate(() => window.t.card()), null);
    assert.deepEqual(await highlighted(), [id], 'רק השורה שסומנה מודגשת');
    await page.waitForFunction(i => { const el = document.getElementById(i), e = el.getBoundingClientRect(), b = document.getElementById('receiptQuantityBody').getBoundingClientRect();
      const head = el.closest('section') && el.closest('section').querySelector('.sticky'), headBottom = head ? head.getBoundingClientRect().bottom : b.top;
      return e.height > 0 && e.top >= b.top - 1 && e.top >= headBottom - 1 && e.bottom <= b.bottom + 1; }, id, { timeout: 5000 })
      .catch(() => assert.fail(id + ' — השורה שסומנה לא נגללה לתוך המסך (או שהיא מתחת לכותרת הדביקה)'));
  };
  // "סרוק מוצר" שוב — המצלמה נפתחת נקייה למוצר הבא. מנהל הפוקוס של החלונות (accessibleDialogs) מעביר את הפוקוס ל-✕ של
  // המצלמה רגע אחרי הפתיחה (setTimeout 0) — בטלפון זה קורה הרבה לפני שברקוד נקרא; הבדיקה מחכה לזה, שלא ייגנב הפוקוס מהכרטיס
  const rescan = async () => {
    await page.locator('#receiptLineScan').click();
    await page.waitForSelector('#scanModal:not(.hidden)');
    await page.waitForFunction(() => window.t.stream());
    await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'scanClose');
    assert.equal(await page.locator('#receiptQuantityModal').isVisible(), false);
    assert.equal(await page.locator('#scanLineCard').isVisible(), false);
  };
  // 4. התחתית הקבועה: "סרוק מוצר" ו"סיום" גלויים, ולא זזים כשגוללים את הרשימה
  const scanBtn = page.locator('#receiptLineScan'), finish = page.locator('#receiptQuantityConfirm');
  assert.equal(await scanBtn.isVisible(), true); assert.equal(await finish.isVisible(), true);
  assert.equal((await scanBtn.textContent()).trim(), 'סרוק מוצר'); assert.equal((await finish.textContent()).trim(), 'סיום (נשארו 5)');
  const before = await page.evaluate(() => document.getElementById('receiptQuantityFooter').getBoundingClientRect().top);
  const scrolled = await page.evaluate(() => { const b = document.getElementById('receiptQuantityBody'); b.scrollTop = 10000; return b.scrollTop; });
  assert.ok(scrolled > 100, 'הרשימה נגללת (' + scrolled + ')');
  assert.equal(await page.evaluate(() => document.getElementById('receiptQuantityFooter').getBoundingClientRect().top), before, 'התחתית לא זזה בגלילה');
  const scanBox = await scanBtn.boundingBox(), finishBox = await finish.boundingBox();
  assert.ok(scanBox.x > finishBox.x && scanBox.width > finishBox.width, '"סרוק" מימין (RTL) ורחב יותר');
  // v161: בטלפון החלון על כל המסך — התיבה מהקצה לקצה (390×860), והתחתית צמודה לתחתית המסך
  const box = await page.locator('#receiptQuantityModal > div').boundingBox(), footerBox = await page.locator('#receiptQuantityFooter').boundingBox();
  assert.ok(Math.abs(box.y) < 1 && Math.abs(box.height - 860) < 2 && Math.abs(box.width - 390) < 2, 'מסך מלא: ' + JSON.stringify(box));
  assert.ok(Math.abs(footerBox.y + footerBox.height - 860) < 2, 'התחתית צמודה לתחתית המסך: ' + JSON.stringify(footerBox));
  await snap('1-list');
  // 5. הלחיצה פותחת את המצלמה; החלון מוסתר
  await scanBtn.click();
  await page.waitForSelector('#scanModal:not(.hidden)');
  await page.waitForFunction(() => window.t.stream());
  assert.equal(await page.locator('#receiptQuantityModal').isVisible(), false, 'החלון מוסתר בזמן הסריקה');
  assert.equal(await page.evaluate(() => window.t.purpose()), 'linecheck');
  assert.equal((await page.locator('#scanTitle').textContent()).trim(), 'בדיקה שורה-שורה — סריקה');
  assert.equal(await page.evaluate(() => document.getElementById('scanOverlayLabel').textContent + ' ' + document.getElementById('scanOverlayCount').textContent), 'סומנו 0 מתוך 5');
  assert.equal(await page.locator('#scanLineCard').isVisible(), false);
  // 6. ברקוד של שורה → הכרטיס; לחיצה אמיתית על "הגיע 6"
  await page.evaluate(() => window.t.beep('498256')); // לחמניות 10 בשקית
  await page.waitForSelector('#scanLineCard:not(.hidden)');
  assert.match((await page.locator('#scanLineCard').innerText()).replace(/\s+/g, ' '), /שורה 2 בתעודה 1 מתוך 2 לחמניות 10 בשקית .*6 יח׳ בתעודה.*הגיע 6/);
  await snap('2-card');
  await page.locator('[data-scan-mark="ok"]').click();
  await returned('lineCheck_0_1'); // v165: המצלמה נסגרה, הרשימה חזרה על השורה
  assert.deepEqual(await page.evaluate(() => window.t.marks()), [',ok,,,', ',']);
  assert.match((await page.locator('#lineCheck_0_1').innerText()).replace(/\s+/g, ' '), /הגיע · 6 יח׳.*שנה/, 'מקופלת, כמו "הגיע" ביד');
  assert.equal((await page.locator('#receiptQuantityProgress').textContent()).trim(), 'סומנו 1 מתוך 5 שורות');
  assert.notEqual(await page.evaluate(() => document.activeElement && document.activeElement.tagName), 'INPUT', 'הפוקוס לא על שדה (המקלדת לא קופצת)');
  await snap('2b-returned');
  // "סרוק מוצר" שוב — המונה מעודכן, בלי "מה סומן זה עתה"
  await rescan();
  assert.equal(await page.evaluate(() => document.getElementById('scanOverlayCount').textContent + ' | ' + document.getElementById('scanOverlayName').textContent), '1 מתוך 5 | ');
  // 7. "אחרת": השדה בפוקוס, הסיכום בהקלדה, Enter שומר
  await page.evaluate(() => window.t.beep('497112')); // אחיד פרוס — 12 בתעודה
  await page.waitForSelector('#scanLineCard:not(.hidden)');
  await page.locator('[data-scan-mark="qty"]').click();
  await page.waitForSelector('#scanLineGot');
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'scanLineGot', 'שדה הכמות בפוקוס');
  await page.keyboard.type('10');
  assert.equal((await page.locator('#scanLineSum').textContent()).trim(), 'התקבלו 10 · חוסר 7'); // v164: אחיד פרוס — 17 בשני הניירות
  await snap('3-qty');
  await page.keyboard.press('Enter');
  await returned('lineCheck_0_0');
  assert.deepEqual(await page.evaluate(() => window.t.marks()), ['qty:10,ok,,,', 'none,']); // v164: 10 מתוך 17 — 10 בתעודה, 0 ("לא הגיע") בנייר הקטן
  assert.equal(await page.locator('#lineCheck_0_0 [data-line-got]').inputValue(), '10', '"אחרת" — השורה פתוחה עם הכמות');
  // 7b. v163: סריקה חוזרת של שורה שסומנה — "סרקת עד עכשיו 3 מתוך 5", מה שחסר כבר בשדה (בפוקוס ומסומן), Enter מוסיף ומשלים ל"הגיע"
  await rescan();
  await page.evaluate(() => window.t.beep('4033033')); // פיתות פרימיום 10 — 5 בתעודה
  await page.waitForSelector('#scanLineCard:not(.hidden)');
  await page.locator('[data-scan-mark="qty"]').click();
  await page.waitForSelector('#scanLineGot');
  await page.keyboard.type('3'); await page.keyboard.press('Enter');
  await returned('lineCheck_0_3');
  assert.deepEqual(await page.evaluate(() => window.t.marks()), ['qty:10,ok,,qty:3,', 'none,']);
  await rescan();
  await page.evaluate(() => window.t.beep('4033033'));
  await page.waitForSelector('#scanLineCard:not(.hidden)');
  assert.match((await page.locator('#scanLineCard').innerText()).replace(/\s+/g, ' '), /סרקת עד עכשיו 3 מתוך 5 .*5 יח׳ בתעודה.*עוד כמה\?.*הוסף.*סה״כ 5 · כמו בתעודה.*תקן את הסה״כ/);
  assert.equal(await page.locator('#scanLineGot').inputValue(), '2', 'מה שחסר — בשדה');
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'scanLineGot', 'השדה בפוקוס');
  assert.deepEqual(await page.evaluate(() => [document.activeElement.selectionStart, document.activeElement.selectionEnd]), [0, 1], 'המספר מסומן — הקלדה מחליפה אותו');
  assert.equal(await page.locator('[data-scan-mark="ok"]').count(), 0, 'בלי "הגיע N" — זה כרטיס של תוספת');
  await snap('3b-add');
  await page.keyboard.press('Enter');
  await returned('lineCheck_0_3');
  assert.deepEqual(await page.evaluate(() => window.t.marks()), ['qty:10,ok,,ok,', 'none,'], '3 + 2 = 5 — "הגיע"');
  assert.match((await page.locator('#lineCheck_0_3').innerText()).replace(/\s+/g, ' '), /הגיע · 5 יח׳.*שנה/, 'v163: השורה שהושלמה ב"עוד כמה?" — מקופלת כמו "הגיע"');
  assert.equal((await page.locator('#receiptQuantityProgress').textContent()).trim(), 'סומנו 3 מתוך 5 שורות · חוסר 7 יח׳');
  // "לא נכון? תקן את הסה״כ" — הכרטיס הקודם עם שלושת הכפתורים; ✕ בכרטיס סוגר בלי לשנות — והמצלמה נשארת
  await rescan();
  await page.evaluate(() => window.t.beep('498256')); // לחמניות — כבר "הגיע" 6 מתוך 6
  await page.waitForSelector('#scanLineCard:not(.hidden)');
  assert.match((await page.locator('#scanLineCard').innerText()).replace(/\s+/g, ' '), /סרקת עד עכשיו 6 מתוך 6 — הכל הגיע/);
  assert.equal(await page.locator('#scanLineGot').inputValue(), '');
  await page.locator('[data-scan-mark="fix"]').click();
  assert.match((await page.locator('#scanLineCard').innerText()).replace(/\s+/g, ' '), /כבר סומנה: הגיע — אפשר לשנות.*הגיע 6.*אחרת.*לא הגיע/);
  assert.equal(await page.locator('#scanLineGot').count(), 0);
  assert.equal(await page.evaluate(() => window.t.purpose()), 'linecheck', '"תקן את הסה״כ" אינו סימון — המצלמה נשארת');
  await page.locator('[data-scan-dismiss]').click();
  await cardHidden();
  assert.deepEqual(await page.evaluate(() => window.t.marks()), ['qty:10,ok,,ok,', 'none,']);
  assert.equal(await page.locator('#scanModal').isVisible(), true, '✕ בכרטיס — המצלמה נשארת');
  assert.equal(await page.evaluate(() => window.t.purpose()), 'linecheck');
  // 8. מוצר שאינו בתעודה — "הוסף": חזרה לרשימה, לכרטיס הצהוב שבתחתית — נגלל לתוך המסך
  await page.evaluate(() => { window.t.later(); window.t.beep('2037194'); }); // לחם מלא בטוב
  await page.waitForSelector('#scanLineCard:not(.hidden)');
  assert.match((await page.locator('#scanLineCard').innerText()).replace(/\s+/g, ' '), /לא בתעודה — הגיע בנוסף לחם מלא בטוב/);
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'scanLineGot');
  await page.locator('[data-scan-save]').click();
  await returned('lineExtra_0');
  assert.deepEqual(await page.evaluate(() => window.t.extras()), [['code_119', '1']]);
  assert.ok(await page.evaluate(() => document.getElementById('receiptQuantityBody').scrollTop) > 0, 'הרשימה נגללה אל הכרטיס הצהוב שבתחתית');
  await snap('3c-extra-returned');
  // 9. ברקוד לא מוכר — ההודעה, בלי כרטיס, והמצלמה נשארת
  await rescan();
  await page.evaluate(() => window.t.beep('7290119390519'));
  assert.equal(await page.locator('#scanLineCard').isVisible(), false);
  assert.match(await page.locator('#toastMsg').textContent(), /ברקוד לא מזוהה/);
  assert.equal(await page.locator('#scanModal').isVisible(), true);
  // 10. ✕ במצלמה — חזרה לרשימה כמו שהיא, בלי שורה מודגשת (כלום לא סומן מאז)
  await page.locator('#scanClose').click();
  await page.waitForSelector('#receiptQuantityModal:not(.hidden)');
  assert.equal(await page.locator('#scanModal').isVisible(), false);
  assert.equal(await page.evaluate(() => window.t.purpose()), 'field');
  assert.equal((await page.locator('#receiptQuantityProgress').textContent()).trim(), 'סומנו 3 מתוך 5 שורות · חוסר 7 יח׳ · עודף 1 יח׳');
  assert.match((await page.locator('#lineCheck_0_1').innerText()).replace(/\s+/g, ' '), /הגיע · 6 יח׳.*שנה/, 'השורה שסומנה בסריקה — מקופלת');
  assert.equal(await page.locator('#lineCheck_0_0 [data-line-got]').inputValue(), '10', '"אחרת" — פתוחה עם הכמות');
  assert.deepEqual(await highlighted(), [], '✕ בלי סימון — שום שורה לא מודגשת');
  await snap('4-back');
  // 11. v163/v164: המספר קובע — ב"אחרת" של אחיד פרוס (10 מתוך 17 בשני הניירות) מקלידים 17: תוך כדי ההקלדה הכרטיס ירוק ו"הגיע 17"
  //     דולק, בלי שהשדה נעלם; 170 — שוב כתום; 17, ויציאה מהשדה עם לחיצה על "סיום" — "הגיע" (12 + 5), מקופלת, והלחיצה לא נבלעה
  assert.match((await page.locator('#lineCheck_0_0').innerText()).replace(/\s+/g, ' '), /גם בתעודה 2 \(5 יח׳\).*17 יח׳ ב-2 תעודות 12 \+ 5/, 'v164: כרטיס אחד לשני הניירות');
  assert.match((await page.locator('#lineCheckRef_1_0').innerText()).replace(/\s+/g, ' '), /נספר יחד עם תעודה 1, שורה 1 · התקבלו 10 מתוך 17 הצג/, 'v164: בנייר הקטן — שורת הפניה');
  const got = page.locator('#lineCheck_0_0 [data-line-got]');
  await got.click(); await got.selectText(); await page.keyboard.type('17');
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.dataset.lineGot), '0:0', 'השדה עדיין בפוקוס — לא צויר מחדש');
  assert.match(await page.evaluate(() => document.getElementById('lineCheck_0_0').className), /border-emerald-300 bg-emerald-50/, 'הכרטיס ירוק');
  assert.equal(await page.locator('[data-line-mark="0:0:ok"]').getAttribute('aria-pressed'), 'true', '"הגיע 17" דולק');
  assert.equal(await page.locator('[data-line-mark="0:0:qty"]').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('#lineCheckSum_0_0').innerText(), 'כמו בתעודה');
  await page.keyboard.type('0'); // 170
  assert.match(await page.evaluate(() => document.getElementById('lineCheck_0_0').className), /border-amber-300 bg-amber-50/, 'עודף — שוב כתום');
  assert.equal(await page.locator('[data-line-mark="0:0:qty"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#lineCheckSum_0_0').innerText(), 'התקבלו 170 · עודף 153');
  await got.selectText(); await page.keyboard.type('17');
  assert.deepEqual(await page.evaluate(() => window.t.marks()), ['qty:12,ok,,ok,', 'qty:5,'], 'בנתונים עדיין "אחרת" — 17 מתחלקים 12 + 5 — עד שעוזבים את השדה');
  await snap('5-exact');
  await finish.click({ force: true }); // "סיום" אפור עם aria-disabled — Playwright היה מחכה שיהיה "enabled"; הלחיצה עצמה אמיתית
  assert.deepEqual(await page.evaluate(() => window.t.marks()), ['ok,ok,,ok,', 'ok,'], 'יציאה מהשדה — "הגיע" בשני הניירות');
  assert.match((await page.locator('#lineCheck_0_0').innerText()).replace(/\s+/g, ' '), /הגיע · 17 יח׳ ב-2 תעודות.*שנה/, 'מקופלת, כמו "הגיע" ביד');
  assert.equal(await page.locator('#lineCheck_0_0 [data-line-got]').count(), 0);
  assert.match((await page.locator('#lineCheckRef_1_0').innerText()).replace(/\s+/g, ' '), /✓ הגיע/);
  assert.equal(await page.locator('#receiptQuantityProgress').innerText(), 'נשארו 2 שורות בלי סימון — סמן בכל שורה: הגיע, כמות אחרת או לא הגיע', 'הלחיצה על "סיום" לא נבלעה');
  assert.equal((await finish.textContent()).trim(), 'סיום (נשארו 2)');
  await snap('6-settled');
  assert.ok(await over() <= 1, 'בלי גלילה לצדדים');
  assert.deepEqual(errors, [], 'בלי שגיאות דף');
  console.log('✓ v160–v165 בדפדפן: הסריקה בבדיקה שורה-שורה — התחתית הקבועה, המצלמה, הכרטיס בלחיצות אמיתיות, "אחרת", "עוד כמה?" (פוקוס, מסומן, Enter), "תקן את הסה״כ", "הגיע בנוסף", ברקוד לא מוכר, כל סימון חוזר לשורה שלו ברשימה (v165), והמספר שקובע את הסימון; בלי גלילה לצדדים ובלי שגיאות');
} finally {
  await browser.close();
  server.close();
}
