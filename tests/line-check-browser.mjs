// v154 — הבדיקה שורה-שורה בדפדפן אמיתי, ברוחב טלפון (390px): תעודת משלוח ונייר "ת.משלוח" קטן שאינו שלנו.
// הניירות נקראים קודם בקוד של האפליקציה עצמה (receipt-scan-harness, נתונים מומצאים), ונכנסים לקליטה בדפדפן
// בדיוק כמו בבוקר: "לקליטה" על כל אחד (receivingJoinDelivery). הבדיקה שומרת על:
// - הכפתור "בדוק שורה-שורה בטלפון" במסך הקליטה פותח את החלון: שתי תעודות, הפרדה ביניהן, "סיום" אפור (aria-disabled).
// - לחיצה על "הגיע" מסמנת (aria-pressed) ומעדכנת את המונה; "כמות אחרת" פותח שדה עם פוקוס, והסיכום מתעדכן בהקלדה.
// - "הנייר הזה לא שלנו" → "הוצא מהקליטה": תעודה אחת נשארת, ההודעה בראש החלון, והנייר בסל המחזור בענן.
// - "סיום" לפני הזמן: ההודעה בראש החלון והשורה שנשארה מסומנת; אחרי שהכל סומן — החלון נסגר והקליטה ממשיכה.
// - v170: "בטל סימון" בשורה שנפתחה ב"שנה" — בלחיצה אמיתית השורה חוזרת ל"עוד לא נבדקה", והפוקוס נשאר על "הגיע" שלה.
// - v159: שורה שסומנה "הגיע" מתקפלת ("הגיע · 12 יח׳", בלי כפתורי סימון), "שנה" פותח אותה עם aria-pressed והפוקוס על "הגיע",
//   ו"הגיע" שוב מקפל; המונה בראש החלון אומר גם את החוסר.
// - בלי שגיאות דף ובלי גלילה לצדדים.
// Run: node tests/line-check-browser.mjs (Playwright + Chromium; BERMAN_CHROMIUM optional)
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
await receive(h, 1, 0, { count: false }); // v171: הניירות נקראו במסך הניירות (בלי "התחל לסרוק עכשיו") — התעודה כבר בקליטה כשהבדיקה נפתחת
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
  marks: () => receiptQuantityReview.docs.map(d => d.lines.map(l => l.mark + (l.got ? ':' + l.got : '')).join(',')) };
setView('receiving'); window.t.loaded = true;
`;
const css = `.hidden{display:none!important}.flex{display:flex}.grid{display:grid}.grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}.grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}.flex-1{flex:1}.min-w-0{min-width:0}.shrink-0{flex-shrink:0}.gap-2{gap:.5rem}.fixed{position:fixed}.inset-0{inset:0}.overflow-y-auto{overflow-y:auto}.min-h-0{min-height:0}.flex-col{flex-direction:column}.w-full{width:100%}.max-w-lg{max-width:32rem}.whitespace-nowrap{white-space:nowrap}body{margin:0;font:16px Arial}button,input{font:inherit;padding:8px;max-width:100%;box-sizing:border-box}.min-h-\\[44px\\]{min-height:44px}.flex-wrap{flex-wrap:wrap}`;
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
  // 4. סימון, כמות אחרת עם פוקוס, וסיכום בהקלדה
  await page.locator('[data-line-mark="0:0:ok"]').click();
  // v159: השורה שסומנה מתקפלת — "הגיע · 12 יח׳" ו"שנה"; "שנה" פותח אותה עם הסימון והפוקוס על "הגיע"; "הגיע" שוב — מקפל
  assert.equal(await page.locator('[data-line-mark="0:0:ok"]').count(), 0, 'מקופלת — בלי כפתורי סימון');
  assert.match(await page.locator('#lineCheck_0_0').innerText(), /הגיע · 17 יח׳ ב-2 תעודות/, 'v164: אחיד פרוס — קבוצה אחת לשתי התעודות');
  assert.equal(await page.locator('#receiptQuantityProgress').innerText(), 'סומנו 1 מתוך 5 שורות');
  await page.locator('[data-line-open="0:0"]').click();
  assert.equal(await page.locator('[data-line-mark="0:0:ok"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.dataset.lineMark), '0:0:ok', 'הפוקוס על "הגיע"');
  // v170: "בטל סימון" בלחיצה אמיתית — בשורה שנפתחה ב"שנה": השורה חוזרת ל"עוד לא נבדקה" בשתי התעודות (אף כפתור לא דולק, המונה
  // יורד), והפוקוס נשאר על "הגיע" שלה; בשורה שלא סומנה ובשורה מקופלת הכפתור אינו קיים
  const clear = page.locator('[data-line-clear="0:0"]');
  assert.equal(await page.locator('[data-line-clear]').count(), 1, 'רק בשורה הפתוחה שסומנה');
  assert.equal((await clear.innerText()).trim(), 'בטל סימון');
  const clearBox = await clear.boundingBox(), rowBox = await page.locator('#lineCheck_0_0').boundingBox();
  assert.ok(clearBox.height >= 44 && clearBox.x >= rowBox.x && clearBox.x + clearBox.width <= rowBox.x + rowBox.width + 1, '"בטל סימון" — יעד מגע של 44px, בתוך הכרטיס: ' + JSON.stringify(clearBox));
  await clear.click();
  assert.deepEqual(await page.evaluate(() => window.t.marks()), [',,,,', ','], 'בלי סימון, בשתי השורות של המוצר');
  assert.equal(await page.locator('[data-line-clear]').count(), 0);
  for (const m of ['ok', 'qty', 'none']) assert.equal(await page.locator('[data-line-mark="0:0:' + m + '"]').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('#receiptQuantityProgress').innerText(), 'סומנו 0 מתוך 5 שורות');
  assert.equal(await page.locator('#receiptQuantityConfirm').innerText(), 'סיום (נשארו 5)');
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.dataset.lineMark), '0:0:ok', 'הפוקוס על "הגיע" של השורה שבוטלה');
  await page.locator('[data-line-mark="0:0:ok"]').click();
  assert.equal(await page.locator('[data-line-mark="0:0:ok"]').count(), 0, 'מתקפלת שוב');
  // v170: בשורה המקופלת מה שהגיע ומחיר הקופה הם שני חלקים שאינם נשברים באמצע
  assert.equal(await page.locator('#lineCheck_0_0 .whitespace-nowrap').count() >= 1, true);
  await page.locator('[data-line-mark="0:1:qty"]').click();
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.dataset.lineGot), '0:1', 'הפוקוס בשדה הכמות');
  await page.keyboard.type('4');
  assert.equal(await page.locator('#lineCheckSum_0_1').innerText(), 'התקבלו 4 · חוסר 2');
  assert.equal(await page.locator('#receiptQuantityProgress').innerText(), 'סומנו 2 מתוך 5 שורות · חוסר 2 יח׳');
  assert.ok(await over() <= 1, 'בלי גלילה לצדדים');
  // 5. "הנייר הזה לא שלנו"
  await page.locator('[data-line-drop="1"]').click();
  assert.match(await page.locator('#receiptQuantityRows').innerText(), /להוציא את ת\.משלוח 290096103 מהקליטה\?/);
  await page.locator('[data-line-drop-yes="1"]').click();
  await page.waitForFunction(() => document.querySelectorAll('#receiptQuantityRows section').length === 2);
  assert.deepEqual(await page.evaluate(() => window.t.nums()), ['244785003']);
  assert.equal(await page.locator('#receiptQuantityProgress').innerText(), 'ת.משלוח 290096103 יצא מהקליטה ועבר לסל המחזור');
  assert.match(await page.locator('#lineCheck_0_0').innerText(), /הגיע · 12 יח׳/, 'מה שסומן נשאר (מקופל)');
  await page.waitForFunction(() => true);
  for (let i = 0; i < 50 && ![...documents.keys()].some(k => k.includes('/trash/papers_paper_290096103_')); i++) await new Promise(r => setTimeout(r, 20));
  assert.ok([...documents.keys()].some(k => k.includes('/trash/papers_paper_290096103_')), 'הנייר בסל המחזור');
  assert.equal(documents.get([...documents.keys()].find(k => k.endsWith('/papers/paper_290096103'))).deleted, true);
  // 6. "סיום" לפני הזמן — אפור, ולחיצה מסבירה ומביאה לשורה (גם בטלפון אפשר ללחוץ עליו)
  await page.locator('#receiptQuantityConfirm').click({ force: true });
  assert.match(await page.locator('#receiptQuantityProgress').innerText(), /^נשארו 3 שורות בלי סימון/);
  assert.equal(await page.locator('#lineCheck_0_2').evaluate(el => el.classList.contains('ring-4')), true);
  assert.equal(await page.locator('#receiptQuantityModal').isVisible(), true);
  // 7. כל השאר "הגיע" → "סיום" → החלון נסגר והקליטה ממשיכה (החוסר של 2 — במסך ההבדלים, כמו תמיד)
  for (let li = 2; li < 5; li++) await page.locator('[data-line-mark="0:' + li + ':ok"]').click();
  assert.equal(await page.locator('#receiptQuantityConfirm').getAttribute('aria-disabled'), 'false');
  assert.equal(await page.locator('#receiptQuantityConfirm').innerText(), 'סיום — שמור את הבדיקה');
  await page.locator('#receiptQuantityConfirm').click();
  await page.waitForSelector('#receiptQuantityModal.hidden', { state: 'attached' });
  assert.equal(await page.evaluate(() => window.t.view()), 'reconcile');
  assert.match(await page.locator('#app').innerText(), /יש הבדלים מול הנייר/);
  assert.ok(await over() <= 1, 'בלי גלילה לצדדים');
  assert.deepEqual(errors, [], 'בלי שגיאות דף');
  console.log('✓ v154 בדפדפן: בדיקה שורה-שורה — שתי תעודות בנפרד, סימון וכמות, "הנייר הזה לא שלנו" לסל המחזור, "סיום" רק כשהכל סומן; בלי גלילה לצדדים ובלי שגיאות');
} finally {
  await browser.close();
  server.close();
}
