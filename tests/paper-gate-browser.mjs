// v172 — כרטיס הזיהוי של מוצר שבתעודה ואינו מזוהה במאגר, בדפדפן אמיתי וברוחב טלפון (390px).
// התעודה נקראת קודם בקוד של האפליקציה עצמה (receipt-scan-harness, נתונים מומצאים: בשורה 5 קוד פריט שאינו במאגר), ונכנסת לקליטה
// בדפדפן כמו בבוקר: "לקליטה" (receivingJoinDelivery). הבדיקה שומרת על:
// - אימות הקריאה של קוד הפריט קודם, כמו תמיד; אחרי "בדקתי מול התעודה" — כרטיס אחד במסך הקליטה ("צריך רק לזהות מוצר אחד — ואז
//   ממשיכים לקלוט"), בלי ארבע הבחירות, בלי מסך ההשוואה ובלי המילה "חסר" על התעודה.
// - "זה מוצר אחר — בחר מהמאגר" פותח חלון מעל המסך: מה שמודפס בשורה, ההצעה, חיפוש בהקלדה אמיתית, "זה המוצר שמופיע בשורה?",
//   "חזרה לחיפוש", ו"כן, שייך לשורה" — החלון נסגר, ארבע הבחירות חוזרות, ומה שזוהה מופיע מתחתיהן.
// - "בטל את הבחירה" מחזיר את הכרטיס; "זה המוצר" על ההצעה משייך בלחיצה אחת; "בדוק שורה-שורה" פותח את הרשימה עם חמש השורות.
// - ✕ סוגר את החלון בלי לשנות דבר; בלי שגיאות דף ובלי גלילה לצדדים.
// Run: node tests/paper-gate-browser.mjs (Playwright + Chromium; BERMAN_CHROMIUM optional)
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { html, moduleSource } from './receipt-scan-harness.mjs';
import { app, delivery, receive, TODAY } from './one-button-helpers.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

// 1. התעודה — נקראת בקוד של האפליקציה (כמו בטלפון), ומשם הנייר והקריאה שלו נכנסים לדפדפן כאילו הם בענן
const paper = delivery('244785003');
paper.scan.documents[0].rows[4] = { ...paper.scan.documents[0].rows[4], itemCode: '9999', barcode: '7290000099999', description: 'לחם חדש שאינו במאגר' };
const h = app(paper);
await receive(h, 1, 0, { count: false });
const read = JSON.parse(h.run(`JSON.stringify(Object.values(paperLocalResults()).map(x => ({ paper: x.paper, scan: x.scan })))`));
assert.equal(read.length, 1, 'התעודה נקראה');
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
  row: () => { const r = aiScanResponse.scan.documents[0].rows[4]; return [r.barcodeMatchMethod, r.__tnuvaProductId, r.supplierItemCode]; },
  gate: () => { const g = receiptPaperGate(); return g ? g.rows.length : 0; }, comparing: () => !!reconcileData,
  lines: () => receiptQuantityReview && receiptQuantityReview.mode === 'lines' && !receiptQuantityReview.pending ? receiptQuantityReview.docs[0].lines.map(l => l.productId) : null };
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
  const over = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  // בדף הזה אין Tailwind (רק כללי בסיס), ולכן חלקים שבאפליקציה יושבים בשורות נפרדות (class="block", כפתורים ברוחב מלא) עשויים
  // להיצמד בטקסט — הביטויים מרשים רווח או היעדרו בנקודות האלה (\s*)
  const text = async selector => (await page.locator(selector).innerText()).replace(/\s+/g, ' ').trim();
  // 2. "לקליטה" — התעודה בקליטה; קודם אימות הקריאה של קוד הפריט, כמו תמיד (ארבע הבחירות עוד על המסך)
  await page.evaluate(() => window.t.join('paper_244785003'));
  await page.waitForSelector('#app [data-role="berman-ocr-confirm"]');
  assert.equal(await page.evaluate(() => window.t.gate()), 0, 'אימות הקריאה קודם');
  assert.equal(await page.locator('#app [data-role="rc-quantity-lines"]').count(), 1);
  assert.equal(await page.locator('#app [data-ocr-key="4:itemCode"]').inputValue(), '9999');
  // 3. הקוד מודפס כך בתעודה — "בדקתי מול התעודה": הכרטיס, במסך הקליטה
  await page.locator('#app [data-role="berman-ocr-confirm"]').click();
  await page.waitForSelector('#app [data-paper-gate]');
  assert.equal(await page.evaluate(() => window.t.view()), 'receiving', 'לא מסך ההשוואה'); assert.equal(await page.evaluate(() => window.t.comparing()), false);
  assert.equal(await page.locator('#app [data-role^="rc-quantity-"]').count(), 0, 'בלי בחירות שעוד אינן יכולות לפעול');
  const card = await text('#app [data-paper-gate]');
  assert.match(card, /^תעודת המשלוח נקראה · 5 שורות · 30 יח׳ צריך רק לזהות מוצר אחד — ואז ממשיכים לקלוט /);
  assert.match(card, /שום דבר לא חסר — עוד לא נספר כלום\. כך מודפס בתעודה · עמוד 1 · שורה 5 לחם חדש שאינו במאגר קוד פריט 9999 · 3 יח׳ בתעודה · מחירון ₪14\.20 אולי זה המוצר:\s*פיתות עננים 8\s*אותו מחירון כמו בשורה\s*קוד 2387 · מחירון ₪14\.20\s*זה המוצר\s*זה מוצר אחר — בחר מהמאגר\s*מוצר חדש — הוסף למאגר$/);
  assert.doesNotMatch(await text('#app'), /חסר ב|חוסר|לא נסרק|עודף/, 'שום מילה על חוסר');
  assert.ok(await over() <= 1, 'בלי גלילה לצדדים');
  // 4. "זה מוצר אחר — בחר מהמאגר": חלון מעל המסך, עם מה שמודפס בשורה וההצעה
  await page.locator('#app [data-role="gate-pick-search"]').click();
  await page.waitForSelector('#gatePickModal');
  assert.equal(await page.locator('#gatePickModal').getAttribute('role'), 'dialog');
  assert.match(await text('#gatePickBody'), /^כך מודפס בתעודה · עמוד 1 · שורה 5 לחם חדש שאינו במאגר קוד פריט 9999 · 3 יח׳ בתעודה · מחירון ₪14\.20 אולי זה המוצר:\s*פיתות עננים 8/);
  // החלון מעל הכרטיס: מה שבאמצע המסך שייך לחלון
  assert.equal(await page.evaluate(() => !!document.elementFromPoint(195, 300).closest('#gatePickModal')), true, 'החלון מעל המסך');
  // חיפוש בהקלדה אמיתית — לפי שם, ואז לפי קוד פריט
  await page.locator('#gatePickSearch').fill('כוסמין');
  assert.deepEqual((await page.locator('#gatePickResults [data-pick-id]').evaluateAll(els => els.map(el => el.dataset.pickId))).sort(), ['code_344', 'code_401', 'code_649']);
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'gatePickSearch', 'ההקלדה לא מאבדת את השדה');
  await page.locator('#gatePickSearch').fill('2387');
  assert.deepEqual(await page.locator('#gatePickResults [data-pick-id]').evaluateAll(els => els.map(el => el.dataset.pickId)), ['code_2387']);
  // בחירה → "זה המוצר שמופיע בשורה?" → "חזרה לחיפוש" (החיפוש נשאר) → בחירה → "כן, שייך לשורה"
  await page.locator('#gatePickResults [data-pick-id="code_2387"]').click();
  assert.match(await text('#gatePickBody'), /זה המוצר שמופיע בשורה\?\s*פיתות עננים 8\s*קוד 2387 · מחירון ₪14\.20 · ברקוד 4033057\s*השיוך הוא לשורה הזאת, בקליטה הזאת בלבד — המאגר לא משתנה, והכמות נשארת כמו שנקראה\.\s*כן, שייך לשורה\s*חזרה לחיפוש$/);
  assert.deepEqual(await page.evaluate(() => window.t.row()), [null, null, '9999'], 'עוד לא שויך דבר');
  await page.locator('#gatePickBody [data-pick-back]').click();
  assert.equal(await page.locator('#gatePickSearch').inputValue(), '2387');
  await page.locator('#gatePickResults [data-pick-id="code_2387"]').click();
  await page.locator('#gatePickBody [data-pick-confirm]').click();
  assert.equal(await page.locator('#gatePickModal').count(), 0, 'החלון נסגר');
  assert.deepEqual(await page.evaluate(() => window.t.row()), ['user_catalog_pick', 'code_2387', '9999']);
  // 5. הכרטיס ירד, ארבע הבחירות חזרו, ומה שזוהה מופיע מתחתיהן
  assert.equal(await page.locator('#app [data-paper-gate]').count(), 0);
  assert.equal(await page.locator('#app [data-role^="rc-quantity-"]').count(), 4);
  assert.match(await text('#app [data-gate-picked] summary'), /^מוצר אחד שזיהית מהמאגר$/);
  // 6. "בטל את הבחירה" (בתוך הקיפול) — הכרטיס חוזר
  await page.locator('#app [data-gate-picked] summary').click();
  await page.locator('#app [data-role="gate-pick-undo"]').click();
  await page.waitForSelector('#app [data-paper-gate]');
  assert.deepEqual(await page.evaluate(() => window.t.row()), [null, null, '9999']); assert.equal(await page.evaluate(() => window.t.gate()), 1);
  // ✕ סוגר את החלון בלי לשנות דבר
  await page.locator('#app [data-role="gate-pick-search"]').click();
  await page.waitForSelector('#gatePickModal');
  await page.locator('#gatePickModal [data-pick-close]').click();
  assert.equal(await page.locator('#gatePickModal').count(), 0); assert.equal(await page.evaluate(() => window.t.gate()), 1);
  // 7. "זה המוצר" על ההצעה — לחיצה אחת; ואז "בדוק שורה-שורה" פותח את הרשימה עם חמש השורות
  await page.locator('#app [data-role="gate-pick-product"]').click();
  assert.deepEqual(await page.evaluate(() => window.t.row()), ['user_catalog_pick', 'code_2387', '9999']);
  await page.locator('#app [data-role="rc-quantity-lines"]').click();
  await page.waitForSelector('#receiptQuantityModal:not(.hidden)');
  assert.deepEqual(await page.evaluate(() => window.t.lines()), ['code_101', 'code_1231', 'code_238', 'code_2381', 'code_2387']);
  assert.equal(await page.locator('#receiptQuantityProgress').innerText(), 'סומנו 0 מתוך 5 שורות');
  assert.ok(await over() <= 1, 'בלי גלילה לצדדים');
  assert.deepEqual(errors, [], 'בלי שגיאות דף');
  console.log('✓ v172 בדפדפן: מוצר שאינו במאגר — אימות הקריאה, כרטיס הזיהוי במסך הקליטה (בלי מסך ההשוואה), חלון הבחירה מהמאגר בהקלדה ובלחיצות אמיתיות, "בטל את הבחירה", "זה המוצר", והרשימה עם חמש השורות; בלי גלילה לצדדים ובלי שגיאות');
} finally {
  await browser.close();
  server.close();
}
