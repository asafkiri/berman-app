// v108 — הנחה שנשמרה ואינה סוגרת את הנייר, בדפדפן אמיתי.
// תעודה שמורה בבדיקת מחיר: הכרטיס מראה מה נשמר, כמה הפער, ואיזו הנחה הנייר
// גוזר. לחיצה חוזרת על אותו אחוז אינה כותבת; "מלא" מכניס את האחוז לשדה;
// השמירה סוגרת את התעודה — והכרטיס נשאר פתוח גם כשעדכון הענן מצייר את
// הרשימה מחדש באמצע השמירה (עד v107 הוא נסגר, והשדה התרוקן).
// Run: node tests/discount-price-check-browser.mjs (Playwright + Chromium; BERMAN_CHROMIUM optional)
// Private replay: BERMAN_PRICE_CHECK_BACKUP=/path/to/backup.json — the first receipt under price check.
// Screenshots: BERMAN_SCREENSHOT_DIR (default: the OS temp directory).
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { html, moduleSource, runtime } from './receipt-scan-harness.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const shots = process.env.BERMAN_SCREENSHOT_DIR || os.tmpdir();

// הנתונים: תעודה שנשמרה עם 5% על מוצר שחסרה לו הנחה, כשהנייר מחייב 8%.
// נבנית במודול האפליקציה המלא (אותו מסלול כמו בבדיקות missing-discount).
async function syntheticSeed() {
  const products = [
    { id: 'missing', code: '8001', barcode: '7290000008001', name: 'לחם בדיקה', listPrice: 6.24, price: 6.24, discountPct: 0, discountSet: false },
    { id: 'known', code: '8002', barcode: '7290000008002', name: 'לחמניות בדיקה', listPrice: 10, price: 8, discountPct: 20, discountSet: true }
  ];
  const data = { products, promos: [], items: [], paper: { ok: true, scan: { warnings: [], documents: [{
    noteIndex: 0, docType: 'invoice', docNumber: 'DEFER-TEST', docDate: '14/09/2026', pageCount: 1,
    totalUnits: 35, printedLines: 2, netToChargeExVat: 212.22,
    rows: products.map((p, i) => ({ itemCode: p.code, barcode: p.barcode, description: p.name,
      quantity: i ? 5 : 30, unitPriceExVat: p.listPrice, sourcePage: 1, lineNumber: i + 1 })), warnings: [] }] } } };
  const c = runtime({ data });
  c.run("currentView='receiving';mainMode='receiving';receiptCountingMode='manual'");
  await c.scan(); c.run('renderReceiving()');
  assert.equal(c.run('bermanDeferDiscount()'), true);
  c.click('rc-quantity-all');
  await c.run('confirmReceipt()');
  const task = c.writes.find(t => t.op === 'set');
  c.context.saved = { id: task.operationId, timestamp: Date.now(), ...structuredClone(task.data) };
  c.run("receipts=[saved, { id: 'prior', timestamp: 1, date: '2026-09-01', docDate: '2026-09-01', status: 'ok', noteTotalInc: 40, count: 1, items: [{ productId: 'known', name: 'לחמניות בדיקה', qty: 5, unitPrice: 8, lineTotal: 40 }] }];currentView='receiptsHistory'");
  const token = c.run('bermanReceiptDiscountFingerprint(receipts[0])');
  assert.equal(await c.run("bermanSaveKnownDiscount('missing','5',receipts[0].id," + JSON.stringify(token) + ')'), true);
  return { products: JSON.parse(c.run('JSON.stringify(products)')), promos: [], returns: [],
    receipts: JSON.parse(c.run('JSON.stringify(receipts)')), id: c.run('receipts[0].id'),
    saved: '5', implied: '8', gap: 'הפרש ₪5.62', amounts: 'לפי ההנחה שנשמרה: ₪217.84 · בתעודה: ₪212.22' };
}
function backupSeed(file) {
  const b = JSON.parse(fs.readFileSync(file, 'utf8')), all = name => Object.entries(b.collections[name] || {}).map(([id, x]) => ({ id, ...x }));
  const receipts = all('receipts'), rc = receipts.find(r => r.discountReview && r.discountReview.status === 'price_check');
  assert.ok(rc, 'the backup has no receipt under price check');
  const id = rc.discountReview.missing[0].productId;
  return { products: all('products'), promos: all('promos'), returns: all('returns'), receipts, id: rc.id,
    saved: String(rc.discountReview.rates[id]), implied: null, gap: 'הפרש ₪', amounts: 'לפי ההנחה שנשמרה: ₪' };
}
const seed = process.env.BERMAN_PRICE_CHECK_BACKUP ? backupSeed(process.env.BERMAN_PRICE_CHECK_BACKUP) : await syntheticSeed();

// Firestore בדפים: batch שנכתב לחנות בזיכרון, ועדכון "מהענן" שמגיע באמצע
// השמירה — כמו ההד המקומי של Firestore — עם השדות בסדר הפוך, כמו שהשרת
// מחזיר אותם בסדר משלו.
const setup = `
const initializeApp = () => ({}), getAuth = () => ({currentUser:{getIdToken:async()=> 'test'}});
const initializeFirestore = () => ({}), getFirestore = () => ({});
const persistentLocalCache = () => ({}), persistentMultipleTabManager = () => ({});
const signInAnonymously = async () => ({}), onAuthStateChanged = () => {};
const doc = (_db, ...path) => path;
const writeBatch = () => { const writes = []; return {
  set: (p, v) => writes.push(['set', p, v]), update: (p, v) => writes.push(['update', p, v]), delete: p => writes.push(['delete', p]),
  commit: async () => { window.__cloudCommit(writes); await new Promise(r => setTimeout(r, 250)); } }; };
const setDoc = async () => {}, updateDoc = async () => {}, deleteDoc = async () => {};
`;
const replay = `
const seed = ${JSON.stringify(seed)};
const reorder = v => Array.isArray(v) ? v.map(reorder) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reorder(x)])) : v;
const store = { receipts: new Map(seed.receipts.map(r => [r.id, structuredClone(r)])), products: new Map(seed.products.map(p => [p.id, structuredClone(p)])) };
window.__writes = [];
window.__cloudCommit = writes => {
  window.__writes.push(structuredClone(writes));
  for (const [op, p, v] of writes) { const coll = p[p.length - 2], id = p[p.length - 1], m = store[coll];
    if (m && op === 'update') m.set(id, { ...(m.get(id) || { id }), ...structuredClone(v) }); }
  setTimeout(() => {
    receipts = reorder([...store.receipts.values()]).sort((a, b) => String(b.docDate || b.date || '').localeCompare(String(a.docDate || a.date || '')) || (b.timestamp || 0) - (a.timestamp || 0));
    products = reorder([...store.products.values()]);
    window.__echoes = (window.__echoes || 0) + 1;
    rerender();
  }, 0);
};
products = structuredClone(seed.products); promos = structuredClone(seed.promos); returns = structuredClone(seed.returns);
receipts = structuredClone(seed.receipts);
const toastText = showToast; window.__toasts = [];
showToast = (msg, ...rest) => { window.__toasts.push(msg); return toastText(msg, ...rest); };
setView('receiptsHistory');
window.t = { loaded: true, redraw: () => renderReceiptsHistory(),
  status: id => { const r = receipts.find(x => x.id === id); return [r.status, r.discountReview.status, r.unresolvedAmountGap]; } };
`;
const css = `.hidden{display:none!important}.flex{display:flex}.block{display:block}.w-full{width:100%}.rounded-xl{border-radius:.75rem}.rounded-2xl{border-radius:1rem}.p-3{padding:.75rem}.p-4{padding:1rem}.px-4{padding-left:1rem;padding-right:1rem}.py-2{padding-top:.5rem;padding-bottom:.5rem}.mt-1{margin-top:.25rem}.mt-2{margin-top:.5rem}.mt-3{margin-top:.75rem}.my-3{margin:.75rem 0}.font-black{font-weight:900}.font-bold{font-weight:700}.text-sm{font-size:.875rem}.text-lg{font-size:1.125rem}.justify-between{justify-content:space-between}.items-center{align-items:center}.gap-2{gap:.5rem}.border{border:1px solid #cbd5e1}.border-2{border:2px solid #cbd5e1}.border-purple-200,.border-purple-300{border-color:#c4b5fd}.bg-white{background:#fff}.bg-purple-50{background:#faf5ff}.bg-purple-700{background:#7e22ce}.bg-emerald-500{background:#10b981}.bg-rose-50{background:#fff1f2}.text-white{color:#fff}.text-purple-900{color:#581c87}.text-purple-800{color:#6b21a8}.text-rose-700{color:#be123c}body{margin:0;font:16px Arial;background:#f1f5f9}main,#app{padding:12px}button,input{font:inherit;padding:8px;max-width:100%;box-sizing:border-box}button{cursor:pointer}details{margin-bottom:10px}summary{list-style:none}`;
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
const errors = [], external = [];
try {
  const context = await browser.newContext({ viewport: { width: 430, height: 920 }, serviceWorkers: 'block', locale: 'he-IL' });
  await context.route('**/*', route => { const u = route.request().url(); if (u.startsWith(url) || u.startsWith('data:')) return route.continue(); external.push(u); return route.abort(); });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(url); await page.waitForFunction(() => window.t?.loaded);
  const cardSel = '#app details[data-rc-card="' + seed.id + '"]';
  const card = page.locator(cardSel), section = card.locator('section[data-receipt-discount]');
  const isOpen = () => page.evaluate(s => document.querySelector(s)?.open === true, cardSel);
  const writes = () => page.evaluate(() => window.__writes.length);
  const lastToast = () => page.evaluate(() => window.__toasts.at(-1) || '');

  // [1] פותחים את התעודה: מה נשמר, כמה הפער, והאחוז שהנייר גוזר
  await card.locator('summary').click();
  assert.equal(await isOpen(), true);
  const text = await section.innerText();
  assert.match(text, new RegExp('נשמר כרגע: ' + seed.saved.replace('.', '\\.') + '%'));
  assert.ok(text.includes(seed.amounts), text);
  assert.ok(text.includes(seed.gap), text);
  const input = section.locator('[data-role="berman-known-discount"]');
  assert.equal(await input.inputValue(), seed.saved);
  const fill = section.locator('[data-role="berman-known-discount-fill"]');
  assert.equal(await fill.count(), 1, 'the paper-implied rate is offered');
  const implied = await fill.getAttribute('data-value');
  if (seed.implied) assert.equal(implied, seed.implied);
  await section.scrollIntoViewIfNeeded();
  await card.screenshot({ path: path.join(shots, 'berman-v108-price-check.png') });

  // [2] אותו אחוז שוב: אין כתיבה, ההודעה אומרת למה, והכרטיס נשאר פתוח
  await section.locator('[data-role="berman-known-discount-save"]').click();
  await page.waitForTimeout(100);
  assert.equal(await writes(), 0);
  assert.match(await lastToast(), new RegExp('^ההנחה ' + seed.saved.replace('.', '\\.') + '% כבר שמורה, אבל לפיה התעודה יוצאת'));
  assert.equal(await isOpen(), true);

  // [3] הקלדה שלא נשמרה שורדת ציור מחדש מהענן
  await input.fill('12');
  await page.evaluate(() => document.activeElement.blur());
  await page.evaluate(() => window.t.redraw());
  assert.equal(await isOpen(), true);
  assert.equal(await card.locator('[data-role="berman-known-discount"]').inputValue(), '12');

  // [4] "מלא" מכניס את האחוז שהנייר גוזר; שום דבר לא נכתב עד השמירה
  await card.locator('[data-role="berman-known-discount-fill"]').click();
  assert.equal(await card.locator('[data-role="berman-known-discount"]').inputValue(), implied);
  assert.equal(await writes(), 0);

  // [5] השמירה: עדכון הענן מגיע באמצע, בסדר שדות אחר — הכרטיס נשאר פתוח,
  // והתעודה נסגרת ירוקה
  const toastsBefore = await page.evaluate(() => window.__toasts.length);
  await card.locator('[data-role="berman-known-discount-save"]').click();
  await page.waitForFunction(() => (window.__echoes || 0) >= 1);
  assert.equal(await isOpen(), true, 'open while the cloud echo re-renders mid-save');
  await page.waitForFunction(s => !document.querySelector(s + ' section[data-receipt-discount]'), cardSel);
  await page.waitForFunction(n => window.__toasts.length > n, toastsBefore);
  assert.equal(await writes(), 1);
  assert.equal(await isOpen(), true, 'still open after the save');
  assert.equal(await lastToast(), 'ההנחה שאושרה מול הספק נשמרה.');
  assert.match(await card.locator('summary').innerText(), /אומתה/);
  const status = await page.evaluate(id => window.t.status(id), seed.id);
  assert.deepEqual(status, ['ok', 'resolved', 0]);
  await card.screenshot({ path: path.join(shots, 'berman-v108-resolved.png') });

  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log('discount price check: all checks passed · implied ' + implied + '% · screenshots in ' + shots);
} finally { await browser.close(); server.close(); }
