// v113 — "2 בדף (קטן)" בהכנת שלטי מבצע, בדפדפן אמיתי.
// ביקשו הדפסה כמו "2 בדף (גדול)", רק מוקטנת — אותו דף עם שוליים לבנים מסביב.
// הבדיקה שומרת על:
// - ארבעה כפתורי פריסה בסדר 4 / 2 קטן / 2 גדול / 1, ובדיוק אחד מסומן — זה שבמצב.
// - "2 בדף (קטן)" נשאר A4 לאורך (1240×1754): מחוץ למלבן הממורכז של 88% הכל לבן
//   לגמרי, בזמן שב"2 בדף (גדול)" המסגרת האדומה יושבת בתוך אותה רצועה.
// - הדף הקטן הוא הדף הגדול מוקטן ל־88% סביב מרכז ה־A4 — אותה כותרת, מחיר, ברקודים
//   ושבירת שורות. משווים פיקסלים מול הדף הגדול שהוקטן כתמונה, והמסגרת האדומה
//   יושבת במקום הצפוי.
// - "2 בדף (גדול)", "4 בדף" ו"1 בדף (רוחב)" מבטלים את המצב הקטן.
// - עם 3 שלטים "2 בדף (קטן)" לא עובר (אותה הגנה כמו בגדול), ומופיעה הודעה.
// - חזרה לבחירה וחזרה לעריכה, או ציור מחדש של הכרטיסים, משאירים את המצב הקטן.
// הנתונים: שני מבצעי הפיקסצ'ר (ברמן אקטיב, לחמניות 10 בשקית — כמו בדוגמה מ־1.10.2026),
// והשעון קבוע על 1.10.2026 כדי שהמבצעים יהיו פעילים גם אחרי סוף אוקטובר.
// Run: node tests/sign-small-layout-browser.mjs (Playwright + Chromium; BERMAN_CHROMIUM optional)
// Images: BERMAN_SCREENSHOT_DIR (default: <OS temp>/berman-sign-layouts) — 4.png, 2small.png, 2big.png, 1.png.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { html, moduleSource, fixture } from './receipt-scan-harness.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const shots = process.env.BERMAN_SCREENSHOT_DIR || path.join(os.tmpdir(), 'berman-sign-layouts');
fs.mkdirSync(shots, { recursive: true });

// הדף הקטן: 88% מה־A4, ממורכז. אותם מספרים כמו ב־README של v113 (17.3×12.3 ס״מ).
const K = 0.88, W = 1240, H = 1754;
const OX = Math.round(W * (1 - K) / 2), OY = Math.round(H * (1 - K) / 2);
const BOX = { x0: OX, y0: OY, x1: OX + Math.round(W * K), y1: OY + Math.round(H * K) };
const TOL = 2;
// הדף הקטן מצויר בווקטור בקנה מידה 0.88; ההשוואה היא מול הדף הגדול שהוקטן כתמונה
// (דגימה דו־לינארית). ההבדל הוא רק בהחלקת קצוות של טקסט וקווים. נמדד ב־Chromium 141
// (Playwright 1.56), ממוצע הפרש לערוץ: 1.0 על כל הדף ו־7.0 על פיקסלי הדיו. הזזה של
// פיקסל אחד באלכסון כבר נותנת 4.2 / 27.7, שני פיקסלים 8.1 / 49, וקנה מידה 0.89
// במקום 0.88 נותן 11.4 / 65. הסף יושב באמצע, והבדיקה מוכיחה שהוא תופס את השניים.
const MEAN_DIFF_MAX = 2.5, INK_DIFF_MAX = 15;

const data = fixture();
const promoId = name => data.promos.find(p => p.name.startsWith(name)).id;
const ACTIVE = promoId('ברמן אקטיב'), ROLLS = promoId('לחמניות 10 בשקית');
// מבצע שלישי — רק כדי להגיע ל־3 שלטים בדף (ההגנה של "2 בדף")
const third = { ...data.promos.find(p => p.id === 'seed_promo_349'), id: 'test_promo_third', start: '2026-10-01', end: '2026-10-31' };
data.promos.push(third);

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
const writeBatch=()=>{const writes=[];return{set:(path,value)=>writes.push([path,value]),commit:()=>window.__sharedRpc('batch',{writes})};};
const setDoc=(path,value)=>window.__sharedRpc('batch',{writes:[[path,value]]});
`;
const replay = `
const testData = ${JSON.stringify(data)};
products=testData.products;promos=testData.promos;
aiRunAnalyzer=async()=>{};
window.fetch=async(url)=>{throw new Error('External network is forbidden in local replay: '+url)};
window.t={
  state:()=>({view:currentView,step:signMaker&&signMaker.step,perPage:signMaker&&signMaker.perPage,small:!!(signMaker&&signMaker.small),smallPage:typeof signSmallPage==='function'&&signSmallPage(),
    signs:signMaker?signMaker.signs.map(s=>({title:s.title,kind:s.kind,price:s.price,validUntil:s.validUntil})):[]}),
  store:()=>storeName
};
setView('promos');window.t.loaded=true;
`;
const css = `.hidden{display:none!important}.flex{display:flex}.grid{display:grid}.grid-cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}.flex-wrap{flex-wrap:wrap}.flex-1{flex:1}.gap-1{gap:.25rem}.gap-2{gap:.5rem}.fixed{position:fixed}.sticky{position:sticky}.top-0{top:0}.bottom-0{bottom:0}.bottom-24{bottom:6rem}.inset-x-0{left:0;right:0}.z-40{z-index:40}.pointer-events-none{pointer-events:none}.items-center{align-items:center}.justify-center{justify-content:center}.justify-between{justify-content:space-between}.w-full{width:100%}.block{display:block}.max-w-3xl{max-width:48rem}.mx-auto{margin-left:auto;margin-right:auto}.bg-white{background:white}.bg-slate-100{background:#f1f5f9}.bg-slate-200{background:#e2e8f0}.bg-rose-600{background:#e11d48}.text-white{color:white}.p-3{padding:.75rem}.p-4{padding:1rem}.pb-24{padding-bottom:6rem}.rounded-lg{border-radius:.5rem}.font-black{font-weight:900}body{margin:0;font:16px Arial}header{background:#92400e;padding:14px;z-index:30}button,input{font:inherit;padding:8px;max-width:100%;box-sizing:border-box}button{cursor:pointer}[class*="z-50"]{z-index:50}[class*="z-\\["]{z-index:10000}[id$="Modal"]{background:#0008;align-items:center;justify-content:center}`;
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
const errors = [], external = [];
const context = await browser.newContext({ viewport: { width: 430, height: 920 }, serviceWorkers: 'block', locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
await context.exposeBinding('__sharedRpc', (_source, operation, args) => rpc(operation, args));
await context.route('**/*', route => { const u = route.request().url(); if (u.startsWith(url) || u.startsWith('data:')) return route.continue(); external.push(u); return route.abort(); });
const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
page.on('dialog', dialog => dialog.dismiss());
await page.clock.setFixedTime(new Date('2026-10-01T10:00:00+03:00'));

const state = () => page.evaluate(() => window.t.state());
const role = (r, attrs = '') => page.locator('#app [data-role="' + r + '"]' + attrs).first();
const LAYOUT = [
  { label: '4 בדף', pp: '4', small: null },
  { label: '2 בדף (קטן)', pp: '2', small: '1' },
  { label: '2 בדף (גדול)', pp: '2', small: null },
  { label: '1 בדף (רוחב)', pp: '1', small: null }
];
const layoutBtn = i => role('sign-pp', '[data-pp="' + LAYOUT[i].pp + '"]' + (LAYOUT[i].small ? '[data-small="1"]' : ':not([data-small])'));
const [L4, L2S, L2B, L1] = [0, 1, 2, 3];
const expectedIndex = s => s.perPage === 4 ? L4 : s.perPage === 1 ? L1 : s.small ? L2S : L2B;

// ארבעת הכפתורים בסדר, ובדיוק אחד מסומן — זה שמתאים למצב
async function assertButtons(expect, why) {
  const btns = await page.$$eval('#app [data-role="sign-pp"]', bs => bs.map(b => ({
    label: b.textContent.trim(), pp: b.dataset.pp, small: b.dataset.small || null, on: b.classList.contains('bg-rose-600'),
    row: b.parentElement.className, head: b.parentElement.previousElementSibling ? b.parentElement.previousElementSibling.textContent.trim() : '' })));
  assert.deepEqual(btns.map(b => ({ label: b.label, pp: b.pp, small: b.small })), LAYOUT, why + ': four layout buttons in order');
  assert.ok(btns.every(b => /\bgrid-cols-4\b/.test(b.row) && b.head === 'תצוגה מקדימה של הדף'), why + ': buttons sit in their own 4-column row under the preview label');
  const on = btns.map((b, i) => b.on ? i : -1).filter(i => i >= 0);
  assert.deepEqual(on, [expect], why + ': exactly one active button, ' + LAYOUT[expect].label + ' (got ' + on.map(i => LAYOUT[i].label).join(',') + ')');
  const s = await state();
  assert.equal(expectedIndex(s), expect, why + ': active button matches state ' + JSON.stringify({ perPage: s.perPage, small: s.small }));
}

// כלי פיקסלים בתוך הדף — לא נוגעים במודול האפליקציה
async function installPixelTools() {
  await page.evaluate(() => {
    const shots = {};
    const copy = cv => { const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; c.getContext('2d').drawImage(cv, 0, 0); return c; };
    const pixels = c => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const isRed = (d, i) => d[i] >= 180 && d[i + 1] <= 100 && d[i + 2] <= 130;
    window.px = {
      grab(name) { const cv = document.getElementById('signCanvas'); shots[name] = copy(cv); return { w: cv.width, h: cv.height }; },
      live() { const cv = document.getElementById('signCanvas'); return { w: cv.width, h: cv.height, url: cv.toDataURL('image/png') }; },
      url(name) { return shots[name].toDataURL('image/png'); },
      // פיקסלים שאינם לבן מלא מחוץ למלבן (ובתוכו), וכמה מהם אדומים
      outside(name, box) {
        const c = shots[name], d = pixels(c); let out = 0, outRed = 0, inside = 0, first = null;
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          if (d[i] === 255 && d[i + 1] === 255 && d[i + 2] === 255 && d[i + 3] === 255) continue;
          if (x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1) { inside++; continue; }
          out++; if (isRed(d, i)) outRed++; if (!first) first = { x, y, rgba: [d[i], d[i + 1], d[i + 2], d[i + 3]] };
        }
        return { out, outRed, inside, first };
      },
      redBox(name) {
        const c = shots[name], d = pixels(c); let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, n = 0;
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
          if (!isRed(d, (y * c.width + x) * 4)) continue;
          n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        return { x0, y0, x1, y1, n };
      },
      // הדף הגדול מוקטן כתמונה באותו translate+scale, מול הדף הקטן
      compare(smallName, bigName, k, ox, oy) {
        const s = shots[smallName], b = shots[bigName];
        const ref = document.createElement('canvas'); ref.width = s.width; ref.height = s.height;
        const ctx = ref.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, ref.width, ref.height);
        ctx.translate(ox, oy); ctx.scale(k, k); ctx.drawImage(b, 0, 0);
        // mean: ממוצע הפרש לערוץ על כל הדף; inkMean: רק על פיקסלים שאינם לבנים באחד מהשניים
        const a = pixels(s), r = pixels(ref); let sum = 0, ink = 0, inkSum = 0;
        for (let i = 0; i < a.length; i += 4) {
          const diff = Math.abs(a[i] - r[i]) + Math.abs(a[i + 1] - r[i + 1]) + Math.abs(a[i + 2] - r[i + 2]);
          sum += diff;
          const blank = a[i] + a[i + 1] + a[i + 2] === 765 && r[i] + r[i + 1] + r[i + 2] === 765;
          if (!blank) { ink++; inkSum += diff; }
        }
        return { mean: sum / (a.length / 4 * 3), inkMean: inkSum / (ink * 3), ink };
      }
    };
  });
}
const save = async name => fs.writeFileSync(path.join(shots, name + '.png'), Buffer.from((await page.evaluate(n => px.url(n), name)).split(',')[1], 'base64'));
const live = () => page.evaluate(() => px.live());
const grab = name => page.evaluate(n => px.grab(n), name);
const outside = (name, box) => page.evaluate(([n, b]) => px.outside(n, b), [name, box]);
const tolBox = { x0: BOX.x0 - TOL, y0: BOX.y0 - TOL, x1: BOX.x1 + TOL, y1: BOX.y1 + TOL };
// הדף הקטן: מחוץ למלבן 88% (עם 2px סבילות) — לבן מלא, ובפנים יש שלטים
async function assertSmallPage(name, why) {
  const g = await grab(name);
  assert.deepEqual(g, { w: W, h: H }, why + ': small page stays A4 portrait');
  const o = await outside(name, tolBox);
  assert.equal(o.out, 0, why + ': non-white pixel outside the centered ' + K * 100 + '% box: ' + JSON.stringify(o.first));
  assert.ok(o.inside > 10000, why + ': the signs are drawn inside the box');
  return o;
}
// דף שאינו קטן: המסגרת האדומה יושבת ברצועת השוליים
async function assertMarginsUsed(name, size, why) {
  const g = await grab(name);
  assert.deepEqual(g, size, why + ': canvas size');
  const o = await outside(name, tolBox);
  assert.ok(o.out > 1000 && o.outRed > 1000, why + ': the red frame reaches into the margin band (' + JSON.stringify(o) + ')');
  return o;
}

try {
  await page.goto(url); await page.waitForFunction(() => window.t?.loaded);
  await installPixelTools();
  assert.equal(await page.evaluate(() => window.t.store()), 'מיני מרקט שלום');

  // --- שני השלטים מהדוגמה: ברמן אקטיב 14.90, לחמניות 10 בשקית 12.90, בתוקף עד 31.10.2026
  await role('sign-start').click();
  await role('sign-pick', '[data-id="' + ACTIVE + '"]').click();
  await role('sign-pick', '[data-id="' + ROLLS + '"]').click();
  await role('sign-next').click();
  await page.locator('#signCanvas').waitFor({ state: 'attached' });
  for (const [i, price] of [[0, '14.90'], [1, '12.90']]) {
    await role('sign-kind', '[data-id="' + i + '"][data-kind="unit"]').click();
    await role('sign-f', '[data-id="' + i + '"][data-f="price"]').fill(price);
  }
  let s = await state();
  assert.equal(s.step, 'edit');
  assert.deepEqual(s.signs, [
    { title: 'ברמן אקטיב', kind: 'unit', price: '14.90', validUntil: '31.10.2026' },
    { title: 'לחמניות 10 בשקית', kind: 'unit', price: '12.90', validUntil: '31.10.2026' }]);

  // [1] ארבעה כפתורים, "4 בדף" מסומן בהתחלה
  await assertButtons(L4, 'start');
  await assertMarginsUsed('4', { w: W, h: H }, '4 per page');
  await save('4');

  await layoutBtn(L2B).click();
  s = await state(); assert.equal(s.perPage, 2); assert.equal(s.small, false);
  await assertButtons(L2B, '2 big');
  const bigBand = await assertMarginsUsed('2big', { w: W, h: H }, '2 big');
  await save('2big');

  // [2] "2 בדף (קטן)": A4 לאורך, שוליים לבנים לגמרי מחוץ למלבן 88%
  await layoutBtn(L2S).click();
  s = await state(); assert.equal(s.perPage, 2); assert.equal(s.small, true); assert.equal(s.smallPage, true);
  await assertButtons(L2S, '2 small');
  await assertSmallPage('2small', '2 small');
  await save('2small');
  const smallUrl = (await live()).url;

  // [3] הדף הקטן = הדף הגדול מוקטן. ביקורת שלילית: הזזה של 2px או קנה מידה 0.89 נכשלים.
  const compare = (k, dx) => page.evaluate(([k, dx]) => px.compare('2small', '2big', k, Math.round(1240 * (1 - k) / 2) + dx, Math.round(1754 * (1 - k) / 2) + dx), [k, dx]);
  const cmp = await compare(K, 0), shifted = await compare(K, 2), rescaled = await compare(0.89, 0);
  const fmt = r => 'mean ' + r.mean.toFixed(3) + '/ch, ink ' + r.inkMean.toFixed(2) + '/ch';
  console.log('small vs big scaled as an image: ' + fmt(cmp) + ' over ' + cmp.ink + ' ink px | shifted 2px: ' + fmt(shifted) + ' | scale 0.89: ' + fmt(rescaled));
  assert.ok(cmp.mean < MEAN_DIFF_MAX, 'small page is the big page scaled (mean diff ' + cmp.mean + ')');
  assert.ok(cmp.inkMean < INK_DIFF_MAX, 'small page is the big page scaled (ink diff ' + cmp.inkMean + ')');
  assert.ok(shifted.mean > MEAN_DIFF_MAX && shifted.inkMean > INK_DIFF_MAX, 'the comparison catches a 2px shift: ' + JSON.stringify(shifted));
  assert.ok(rescaled.mean > MEAN_DIFF_MAX && rescaled.inkMean > INK_DIFF_MAX, 'the comparison catches a 0.89 scale: ' + JSON.stringify(rescaled));
  const bigRed = await page.evaluate(() => px.redBox('2big'));
  const smallRed = await page.evaluate(() => px.redBox('2small'));
  const expectRed = { x0: OX + K * bigRed.x0, y0: OY + K * bigRed.y0, x1: OX + K * (bigRed.x1 + 1) - 1, y1: OY + K * (bigRed.y1 + 1) - 1 };
  console.log('red frame: big %j -> small %j (expected %j)', bigRed, smallRed, Object.fromEntries(Object.entries(expectRed).map(([k, v]) => [k, +v.toFixed(1)])));
  for (const k of ['x0', 'y0', 'x1', 'y1']) assert.ok(Math.abs(smallRed[k] - expectRed[k]) <= 3, 'red frame ' + k + ': ' + smallRed[k] + ' vs ' + expectRed[k].toFixed(1));
  // הגדול מגיע עד 40px מהקצה, כלומר לתוך רצועת השוליים של הקטן
  assert.ok(bigRed.x0 < BOX.x0 - TOL && bigRed.y0 < BOX.y0 - TOL && bigRed.x1 >= BOX.x1 + TOL && bigRed.y1 >= BOX.y1 + TOL, 'big frame reaches the margin band: ' + JSON.stringify(bigRed));
  assert.ok(smallRed.x0 >= BOX.x0 && smallRed.y0 >= BOX.y0 && smallRed.x1 < BOX.x1 && smallRed.y1 < BOX.y1, 'small frame stays inside the box: ' + JSON.stringify(smallRed));
  assert.ok(bigBand.outRed > 1000);

  // [6] ציור מחדש וחזרה לעריכה משאירים את "2 בדף (קטן)"
  await role('sign-kind', '[data-id="0"][data-kind="unit"]').click();
  await assertButtons(L2S, 'after re-render');
  assert.equal((await live()).url, smallUrl, 're-render draws the same small page');
  await role('sign-f', '[data-id="1"][data-f="price"]').fill('12.90');
  assert.equal((await state()).small, true);
  assert.equal((await live()).url, smallUrl, 'typing redraws the same small page');
  await role('sign-back').click();
  assert.equal((await state()).step, 'pick');
  await role('sign-next').click();
  s = await state(); assert.equal(s.step, 'edit'); assert.equal(s.perPage, 2); assert.equal(s.small, true);
  await assertButtons(L2S, 'back to edit');
  await assertSmallPage('2small-again', 'back to edit');
  assert.equal((await live()).url, smallUrl, 'back to edit draws the same small page');

  // [4] כל כפתור אחר מבטל את המצב הקטן
  await layoutBtn(L2B).click();
  s = await state(); assert.equal(s.perPage, 2); assert.equal(s.small, false);
  await assertButtons(L2B, 'small -> 2 big');
  await assertMarginsUsed('2big-again', { w: W, h: H }, 'small -> 2 big');
  assert.equal((await live()).url, await page.evaluate(() => px.url('2big')), 'small -> 2 big draws the original big page');

  await layoutBtn(L2S).click(); assert.equal((await state()).small, true);
  await layoutBtn(L4).click();
  s = await state(); assert.equal(s.perPage, 4); assert.equal(s.small, false);
  await assertButtons(L4, 'small -> 4');
  await assertMarginsUsed('4-again', { w: W, h: H }, 'small -> 4');
  assert.equal((await live()).url, await page.evaluate(() => px.url('4')), 'small -> 4 draws the original 4 page');

  // "1 בדף" דורש שלט אחד: מורידים את הלחמניות, המצב הקטן נשמר בדרך
  await layoutBtn(L2S).click(); assert.equal((await state()).small, true);
  await role('sign-back').click();
  await role('sign-pick', '[data-id="' + ROLLS + '"]').click();
  await role('sign-next').click();
  s = await state(); assert.equal(s.signs.length, 1); assert.equal(s.small, true);
  await assertButtons(L2S, 'one sign, small');
  await assertSmallPage('2small-one', 'one sign, small');
  await layoutBtn(L1).click();
  s = await state(); assert.equal(s.perPage, 1); assert.equal(s.small, false); assert.equal(s.smallPage, false);
  await assertButtons(L1, 'small -> 1');
  await assertMarginsUsed('1', { w: H, h: W }, 'small -> 1 (landscape)');
  await save('1');

  // [5] שלושה שלטים: "2 בדף (קטן)" לא עובר, כמו "2 בדף (גדול)"
  await layoutBtn(L4).click();
  await role('sign-back').click();
  await role('sign-pick', '[data-id="' + ROLLS + '"]').click();
  await role('sign-pick', '[data-id="' + third.id + '"]').click();
  await role('sign-next').click();
  s = await state(); assert.equal(s.signs.length, 3); assert.equal(s.perPage, 4);
  await assertButtons(L4, 'three signs');
  const threeUrl = (await live()).url;
  for (const i of [L2S, L2B]) {
    await page.evaluate(() => { document.getElementById('toastMsg').textContent = ''; });
    await layoutBtn(i).click();
    s = await state(); assert.equal(s.perPage, 4, LAYOUT[i].label + ' with 3 signs keeps 4'); assert.equal(s.small, false);
    await assertButtons(L4, LAYOUT[i].label + ' with 3 signs');
    assert.equal(await page.locator('#toastMsg').textContent(), 'בחרת 3 מבצעים — הסר כדי לעבור ל-2 בדף');
    assert.equal(await page.locator('#toast').evaluate(el => el.classList.contains('hidden')), false, 'toast shown');
    assert.equal((await live()).url, threeUrl, LAYOUT[i].label + ' with 3 signs leaves the page as is');
  }

  // ידוע ואינו קשור לשלטים: promoAutoCleanup (נקרא מ־renderPromos) קורא ל־promoCleanupRan
  // שאינו מוצהר בשום מקום, ולכן נזרק בכל כניסה למסך המבצעים. רק השגיאה הזו מסוננת.
  assert.deepEqual(errors.filter(e => e !== 'promoCleanupRan is not defined'), []); assert.deepEqual(external, []);
  console.log('sign small layout: all checks passed — images in ' + shots);
} finally { await browser.close(); server.close(); }
