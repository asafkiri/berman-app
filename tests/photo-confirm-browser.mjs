// v175 — מסך האישור של צילום נייר מהנהג, בדפדפן אמיתי (Chromium) וברוחב טלפון (390px), עם צינור התמונה האמיתי: פענוח,
// זיהוי הנייר, חיתוך, חלוקה של תעודה ארוכה ויישור של צילום שוכב. הצילומים מסונתזים בדף עצמו (נייר בהיר על רקע אפור,
// שורות של "אותיות" 5×7; השליש העליון צפוף יותר — כך אפשר למדוד איפה ראש התעודה בתמונה שנשלחת), ונכנסים דרך קלט
// המצלמה האמיתי של האפליקציה (paperCamGlobal). השרת מזויף ומחזיר ב-pageCount את מספר התמונות שקיבל, כמו השרת האמיתי.
// מה שנבדק:
// - צילום ישר: מסך האישור נפתח מעל מסך הניירות, שום דבר לא נשלח; הנייר זוהה ונחתך; "סובב" בלחיצה אמיתית; "אשר" שולח
//   עמוד אחד, ותעודת המשלוח נכנסת לקליטה עם נתוני הצילום.
// - "מחק צילום" מוריד את הצילום בלי בקשה.
// - צילום שוכב (אותה תעודה, רבע סיבוב שמאלה, בלי תג כיוון): מיושר לבד, נחתך, המסך אומר זאת, וראש התעודה למעלה.
// - אותו צילום עם תג כיוון 3 (הדפדפן מציג אותו הפוך מהקודם): מיושר לצד השני — ושוב ראש התעודה למעלה.
// - תעודה ארוכה, שוכבת: מיושרת ומחולקת לשני חלקים; אישור אחד; בקשה אחת עם שני עמודים; הקליטה סופרת שניהם.
// - מהסקירה: נייר קצר וישר כמו של המסופון (גופן ברוחב קבוע, 1/3/6 שורות), פריים לאורך — לא מסובב, ומה שנשלח זקוף.
// - בלי שגיאות דף ובלי גלילה לצדדים.
// Run: node tests/photo-confirm-browser.mjs (Playwright + Chromium; BERMAN_CHROMIUM optional)
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { html, moduleSource, fixture } from './receipt-scan-harness.mjs';
import { delivery, TODAY } from './one-button-helpers.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const fx = fixture();
const data = { products: fx.products, promos: fx.promos, paper: delivery('77001234') };
const documents = new Map();
const rpc = async (operation, args = {}) => {
  if (operation === 'read') return documents.get(args.path) ?? null;
  if (operation === 'commit' || operation === 'batch') for (const [p, value, op] of args.writes) { if (op === 'delete') documents.delete(p); else documents.set(p, structuredClone(value)); }
  return true;
};
const setup = `
const initializeApp = () => ({}), getAuth = () => ({currentUser:{uid:'photo-confirm',getIdToken:async()=> 'test'}});
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
products = D.products; promos = D.promos; receipts = []; returns = []; papers = [];
todayStr = () => '${TODAY}'; ledgerInvalidate();
window.__scans = [];
window.fetch = async (url, options) => {
  if (String(url) !== AI_SCAN_WORKER_URL) throw new Error('External network is forbidden in local replay: ' + url);
  const body = JSON.parse(options.body), n = window.__scans.push(body);
  const payload = structuredClone(D.paper), d = payload.scan.documents[0];
  d.pageCount = body.documents[0].pages.length; // השרת האמיתי מחזיר בדיוק את מספר התמונות שקיבל
  d.docNumber = String(77001233 + n); payload.requestId = 'req-' + n;
  return { ok: true, status: 200, json: async () => payload };
};
// נייר מסונתז: רקע אפור, נייר בהיר, שורות של "אותיות" 5×7 (u פיקסלים לנקודה) במילים. השליש העליון צפוף יותר.
// sideways — התמונה מסובבת רבע סיבוב שמאלה, כמו שיוצא כשהטלפון לאורך והמצלמה שומרת "לרוחב". exif — תג כיוון שנכתב לקובץ.
window.t = {
  bytes: async ({ u = 8, sideways = false, exif = 0, seed = 7 } = {}) => {
    const W = 3000, H = 4000, paper = { x: 900, y: 300, w: 1200, h: 3400 };
    let s = seed >>> 0; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    let c = document.createElement('canvas'); c.width = W; c.height = H;
    let g = c.getContext('2d');
    g.fillStyle = 'rgb(100,100,100)'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgb(240,240,240)'; g.fillRect(paper.x, paper.y, paper.w, paper.h);
    g.fillStyle = 'rgb(60,60,60)';
    const cellW = 6 * u, rowStep = 12 * u, cols = Math.floor(paper.w * 0.88 / cellW), rows = Math.floor(paper.h * 0.94 / rowStep);
    const left = paper.x + Math.round(paper.w * 0.06), top = paper.y + Math.round(paper.h * 0.03);
    for (let r = 0; r < rows; r++) {
      const fill = r < rows * 0.3 ? 0.62 : 0.3; let word = 0;
      for (let col = 0; col < cols; col++) {
        if (word <= 0) { word = 3 + Math.floor(rnd() * 6); continue; }
        word--;
        for (let gy = 0; gy < 7; gy++) for (let gx = 0; gx < 5; gx++) if (rnd() < fill) g.fillRect(left + col * cellW + gx * u, top + r * rowStep + gy * u, u, u);
      }
    }
    if (sideways) {
      const turned = document.createElement('canvas'); turned.width = H; turned.height = W;
      const tg = turned.getContext('2d'); tg.translate(0, W); tg.rotate(-Math.PI / 2); tg.drawImage(c, 0, 0);
      c = turned;
    }
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.9));
    let bytes = new Uint8Array(await blob.arrayBuffer());
    if (exif) { // מקטע EXIF (APP1) עם תג הכיוון, מיד אחרי תחילת הקובץ
      const tiff = [0x49, 0x49, 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, exif, 0, 0, 0, 0, 0, 0, 0];
      const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff], length = payload.length + 2;
      const head = [0xFF, 0xD8, 0xFF, 0xE1, length >> 8, length & 255, ...payload];
      const out = new Uint8Array(head.length + bytes.length - 2); out.set(head, 0); out.set(bytes.subarray(2), head.length); bytes = out;
    }
    return bytes;
  },
  photo: async options => {
    const bytes = await window.t.bytes(options);
    let text = ''; for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(text);
  },
  // לא כל פריסה מסונתזת עוברת את הזיהוי (יש שבהן שני העוגנים לא מסכימים), וזה תלוי גם בגרסת הדפדפן. לכן הבדיקה
  // בוחרת זרע שבו הצילום הישר נחתך (want: 'cropped') או מתחלק ('split') — ואז בודקת שהשוכב מגיע לאותה תוצאה.
  // מהסקירה שלפני המיזוג: נייר קצר כמו שהמסופון מדפיס — כותרת, מעט שורות, סיכום, בגופן ברוחב קבוע — צילום ישר, פריים לאורך.
  // בעותק מסובב שלו העמודות של האותיות נראות כמו שורות דפוס, ועד התיקון הוא סובב לצד ונשלח למודל שוכב.
  slip: async ({ rows = 3, cpl = 42, W = 3000, H = 4000 } = {}) => {
    let s = 4242; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const heb = 'אבגדהוזחטיכלמנסעפצקרשת', word = n => Array.from({ length: n }, () => heb[Math.floor(rnd() * heb.length)]).join('');
    const digits = n => Array.from({ length: n }, () => Math.floor(rnd() * 10)).join('');
    const lines = [word(5) + ' ' + word(6), word(4) + ' ' + digits(9), digits(2) + '/' + digits(2) + '/' + digits(4), word(6) + ': ' + digits(9), word(5) + ': ' + word(4), '-'.repeat(cpl)];
    for (let r = 0; r < rows; r++) lines.push((digits(13) + ' ' + word(5) + ' ' + word(3) + '   ' + digits(2) + ' ' + digits(3) + '.' + digits(2)).slice(0, cpl));
    lines.push('-'.repeat(cpl), word(3) + ' ' + word(4) + ':   ' + digits(3), word(5) + ': ' + digits(4), word(4) + ' ' + word(5));
    const pitchK = 1.65, fontN = 1 / 0.602, pwN = cpl / 0.92, phN = (lines.length + 2) * fontN * pitchK, k = Math.min(W * 0.88 / pwN, H * 0.88 / phN);
    const adv = k, font = fontN * k, pitch = fontN * pitchK * k, pw = pwN * k, ph = phN * k, px = (W - pw) / 2, py = (H - ph) / 2;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = 'rgb(105,100,95)'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgb(238,238,234)'; g.fillRect(px, py, pw, ph);
    g.fillStyle = 'rgb(45,45,48)'; g.font = font + 'px monospace'; g.textBaseline = 'top';
    lines.forEach((text, r) => { for (let i = 0; i < text.length && i < cpl; i++) if (text[i] !== ' ') g.fillText(text[i], px + pw * 0.04 + i * adv, py + pitch + r * pitch); });
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.9));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let text = ''; for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(text);
  },
  pick: async ({ u, want }) => {
    for (const seed of [7, 11, 17, 19, 23, 29, 31, 37, 41, 43]) {
      const made = [].concat(await aiCompressInvoiceImage(new File([await window.t.bytes({ u, seed })], 'pick.jpg', { type: 'image/jpeg' })));
      if (made[0].cropInfo.reason === want && !made[0].autoRotated) return seed;
    }
    return null;
  },
  state: () => ({ view: currentView, session: aiOrientationSession ? { paper: !!aiOrientationSession.paper } : null, paperState: receiptPaperScanState,
    scans: window.__scans.length, busy: !!(paperIntake && paperIntake.busy),
    items: paperIntake ? paperIntake.items.map(x => ({ status: x.status, confirmed: paperItemConfirmed(x), cap: x.captureId,
      pages: paperItemPages(x).map(p => ({ rotation: p.rotation, autoRotated: p.autoRotated || 0, reason: p.cropInfo && p.cropInfo.reason, auto: !!p.autoCropped, split: p.split ? [p.split.index, p.split.count] : null })) })) : [],
    per: aiScanResponse && aiScanResponse.perDocument ? aiScanResponse.perDocument.map(p => ({ pageCount: p.pageCount, cropReasons: p.cropReasons, rotations: p.rotations, autoRotated: p.autoRotated, source: p.source })) : null,
    docs: aiScanDocuments.map(d => d.savedPageCount) }),
  // התמונות שמחכות לאישור (מה שיישלח), לפי הסדר
  pending: () => { const it = paperIntake && paperIntake.items.find(x => x.status === 'photo'); return it ? paperItemPages(it).map(p => p.dataUrl) : []; },
  sent: i => window.__scans[i].documents[0].pages,
  // כהות ממוצעת (ערוץ אדום) ברצועה העליונה וברצועה התחתונה של תמונה — השליש העליון של התעודה צפוף יותר, ולכן כהה יותר
  tone: async dataUrl => {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const band = (y0, y1) => { const d = g.getImageData(Math.round(c.width * 0.15), Math.round(c.height * y0), Math.round(c.width * 0.7), Math.round(c.height * (y1 - y0))).data; let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i]; return Math.round(sum / (d.length / 4)); };
    return { w: c.width, h: c.height, top: band(0.06, 0.24), bottom: band(0.74, 0.92) };
  },
  saved: cap => { const r = paperLocalResults()[cap]; return r && r.scan ? r.scan.photo || null : null; }
};
setView('receiving'); window.t.loaded = true;
`;
const css = `.hidden{display:none!important}.flex{display:flex}.flex-col{flex-direction:column}.flex-1{flex:1 1 0%}.min-h-0{min-height:0}.min-w-0{min-width:0}.shrink-0{flex-shrink:0}.grid{display:grid}.grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}.col-span-2{grid-column:span 2/span 2}.gap-2{gap:.5rem}.fixed{position:fixed}.absolute{position:absolute}.relative{position:relative}.inset-0{inset:0}.w-full{width:100%}.h-full{height:100%}.object-contain{object-fit:contain}.overflow-hidden{overflow:hidden}.items-center{align-items:center}.justify-center{justify-content:center}.z-\\[95\\]{z-index:95}.bg-slate-950{background:#020617}.bg-white{background:#fff}.text-white{color:#fff}.w-16{width:4rem}.h-20{height:5rem}.object-cover{object-fit:cover}button{min-height:44px}img{max-width:100%}`;
const pageHtml = html.replace(/<script\s+src="https:[^"]+"><\/script>/g, '').replace(/<link[^>]+(?:href="https:[^"]+"|rel="manifest")[^>]*>/g, '')
  .replace(/<script type="module">[\s\S]*?<\/script>/, () => '<script type="module">' + setup + moduleSource + replay + '</script>')
  .replace('</head>', '<style>' + css + '</style></head>');
const server = http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' data: blob:; worker-src 'none'");
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
  await context.route('**/*', route => { const u = route.request().url(); if (u.startsWith(url) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue(); return route.abort(); });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => window.t && window.t.loaded);
  const state = () => page.evaluate(() => window.t.state());
  const over = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const text = async selector => (await page.locator(selector).innerText()).replace(/\s+/g, ' ').trim();
  const modalOpen = () => page.waitForSelector('#aiOrientationModal:not(.hidden)');
  const modalClosed = () => page.waitForSelector('#aiOrientationModal.hidden', { state: 'attached' });
  // מצלמים: הקובץ נכנס לקלט המצלמה של כל האפליקציה, כמו שהמצלמה של הטלפון מחזירה אותו
  const shoot = async options => {
    const base64 = await page.evaluate(o => window.t.photo(o), options);
    await page.setInputFiles('#paperCamGlobal', { name: 'paper-' + JSON.stringify(options).replace(/[^a-z0-9]/gi, '') + '.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(base64, 'base64') });
    await modalOpen();
  };
  const upright = async (dataUrl, label) => {
    const tone = await page.evaluate(d => window.t.tone(d), dataUrl);
    assert.ok(tone.h > tone.w, label + ': התמונה שנשלחת זקופה (' + tone.w + '×' + tone.h + ')');
    assert.ok(tone.top < tone.bottom - 8, label + ': ראש התעודה למעלה (עליון ' + tone.top + ', תחתון ' + tone.bottom + ')');
    return tone;
  };

  // הפריסות: תעודה קצרה שהישר שלה נחתך, ותעודה ארוכה שהישר שלה מתחלק
  const short = await page.evaluate(() => window.t.pick({ u: 8, want: 'cropped' }));
  const long = await page.evaluate(() => window.t.pick({ u: 5, want: 'split' }));
  assert.ok(short != null && long != null, 'נמצאה פריסה מסונתזת שהזיהוי מקבל (קצרה: ' + short + ', ארוכה: ' + long + ')');

  // 1. צילום ישר: מסך האישור מעל מסך הניירות, שום דבר לא נשלח; הנייר זוהה ונחתך
  await shoot({ u: 8, seed: short });
  let s = await state();
  assert.equal(s.view, 'paperIntake'); assert.deepEqual(s.session, { paper: true }); assert.equal(s.scans, 0, 'שום דבר לא נשלח לפני האישור');
  assert.deepEqual(s.items.map(x => [x.status, x.confirmed]), [['photo', false]]);
  assert.deepEqual(s.items[0].pages, [{ rotation: 0, autoRotated: 0, reason: 'cropped', auto: true, split: null }], 'הנייר זוהה ונחתך; תעודה קצרה — עמוד אחד');
  assert.match(await text('#aiOrientationLabel'), /^נייר מהנהג · v180 · חיתוך אוטומטי · הוסרו \d+% מהשוליים$/);
  assert.match(await text('#aiOrientationHint'), /^השוליים נחתכו אוטומטית\./);
  assert.equal(await text('#aiOrientationNote'), 'התמונה לא תישלח ל-AI לפני האישור. אחרי האישור הקריאה מתחילה לבד.');
  assert.match(await text('#aiOrientationConfirm'), /אשר תמונה חתוכה/);
  assert.equal(await page.evaluate(() => !!document.elementFromPoint(195, 400).closest('#aiOrientationModal')), true, 'המסך מעל מסך הניירות');
  await upright((await page.evaluate(() => window.t.pending()))[0], 'צילום ישר');
  assert.ok(await over() <= 1, 'בלי גלילה לצדדים');
  // "סובב ימינה" ו"סובב שמאלה" בלחיצה אמיתית — התמונה מסתובבת, ועדיין לא נשלח דבר
  await page.locator('#aiOrientationRight').click();
  await page.waitForFunction(() => /סיבוב 90°/.test(document.getElementById('aiOrientationLabel').textContent));
  assert.equal((await state()).items[0].pages[0].rotation, 90);
  await page.locator('#aiOrientationLeft').click();
  await page.waitForFunction(() => !/סיבוב/.test(document.getElementById('aiOrientationLabel').textContent));
  assert.equal((await state()).scans, 0);
  // "אשר" — המסך נסגר, הקריאה מתחילה לבד, ותעודת המשלוח נכנסת לקליטה עם נתוני הצילום
  await page.locator('#aiOrientationConfirm').click();
  await modalClosed();
  await page.waitForFunction(() => { const x = window.t.state(); return x.scans === 1 && !x.busy && x.paperState === 'ok'; });
  s = await state();
  assert.equal((await page.evaluate(() => window.t.sent(0))).length, 1);
  assert.deepEqual(s.items.map(x => x.status), ['delivery']);
  assert.deepEqual(s.per, [{ pageCount: 1, cropReasons: ['cropped'], rotations: [0], autoRotated: [0], source: 'paper' }]);
  assert.match(await text('#app'), /צלם עוד נייר/);

  // 2. "מחק צילום" — הצילום יורד, בלי בקשה
  await shoot({ u: 8, seed: short + 1000 });
  await page.locator('#aiOrientationCancel').click();
  await modalClosed();
  s = await state();
  assert.equal(s.scans, 1); assert.equal(s.items.filter(x => x.status === 'photo').length, 0);

  // 3. אותה תעודה שוכבת (רבע סיבוב שמאלה, בלי תג כיוון): מיושרת לבד לפני החיתוך, והמסך אומר זאת
  await shoot({ u: 8, sideways: true, seed: short });
  s = await state();
  let waiting = s.items.find(x => x.status === 'photo');
  assert.deepEqual(waiting.pages, [{ rotation: 0, autoRotated: 90, reason: 'cropped', auto: true, split: null }], 'יושר ימינה, ואז זוהה ונחתך כמו צילום ישר');
  assert.match(await text('#aiOrientationHint'), /^הצילום יצא שוכב ויושר לבד — ודא שהכותרת למעלה \(הפוך\? סובב פעמיים\)\. השוליים נחתכו אוטומטית\./);
  await upright((await page.evaluate(() => window.t.pending()))[0], 'צילום שוכב');
  assert.ok(await over() <= 1);
  const capSideways = waiting.cap;
  await page.locator('#aiOrientationConfirm').click();
  await modalClosed();
  await page.waitForFunction(() => { const x = window.t.state(); return x.scans === 2 && !x.busy; });
  assert.deepEqual((await page.evaluate(cap => window.t.saved(cap), capSideways)).autoRotated, [90], 'היישור נשמר עם הקריאה');
  await upright((await page.evaluate(() => window.t.sent(1)))[0], 'מה שנשלח');

  // 4. אותם פיקסלים עם תג כיוון 3: הדפדפן מציג את הקובץ הפוך מהקודם, והיישור הוא לצד השני — שוב ראש התעודה למעלה
  await shoot({ u: 8, sideways: true, exif: 3, seed: short });
  s = await state();
  waiting = s.items.find(x => x.status === 'photo');
  assert.deepEqual(waiting.pages, [{ rotation: 0, autoRotated: 270, reason: 'cropped', auto: true, split: null }], 'תג כיוון 3 — רבע סיבוב שמאלה');
  await upright((await page.evaluate(() => window.t.pending()))[0], 'צילום שוכב עם תג כיוון 3');
  await page.locator('#aiOrientationConfirm').click();
  await modalClosed();
  await page.waitForFunction(() => { const x = window.t.state(); return x.scans === 3 && !x.busy; });

  // 5. תעודה ארוכה, שוכבת: מיושרת ומחולקת לשני חלקים; אישור אחד; בקשה אחת עם שני עמודים
  await shoot({ u: 5, sideways: true, seed: long });
  s = await state();
  waiting = s.items.find(x => x.status === 'photo');
  assert.deepEqual(waiting.pages.map(p => [p.autoRotated, p.reason, p.split]), [[90, 'split', [0, 2]], [90, 'split', [1, 2]]], 'יושרה, ואז חולקה לשני חלקים');
  assert.match(await text('#aiOrientationLabel'), /^נייר מהנהג · חלק 1 מתוך 2 · v166 · תעודה ארוכה · חלק 1 מתוך 2/);
  assert.match(await text('#aiOrientationHint'), /^הצילום יצא שוכב ויושר לבד[^.]*\. התעודה ארוכה, ולכן חולקה ל-2 חלקים/);
  const parts = await page.evaluate(() => window.t.pending());
  const tones = [];
  for (const part of parts) tones.push(await page.evaluate(d => window.t.tone(d), part));
  assert.ok(tones[0].top < tones[1].top - 8, 'החלק הראשון הוא ראש התעודה (עליון ' + tones[0].top + ' מול ' + tones[1].top + ')');
  assert.ok(await over() <= 1);
  await page.locator('#aiOrientationConfirm').click();
  await modalClosed();
  await page.waitForFunction(() => { const x = window.t.state(); return x.scans === 4 && !x.busy; });
  assert.equal((await page.evaluate(() => window.t.sent(3))).length, 2, 'שני החלקים כעמודים של אותה תעודה');
  s = await state();
  assert.equal(s.paperState, 'ok', 'הקליטה מקבלת תעודה של שני עמודים');
  assert.deepEqual(s.docs, [1, 1, 1, 2], 'ארבע תעודות בקליטה, האחרונה בשני עמודים');
  assert.deepEqual(s.per[3], { pageCount: 2, cropReasons: ['split', 'split'], rotations: [0, 0], autoRotated: [90, 90], source: 'paper' });
  assert.equal(s.session, null);
  // 6. מהסקירה: נייר קצר וישר (גופן ברוחב קבוע, 1, 3 ו-6 שורות), פריים לאורך — לעולם לא מסובב, ומה שנשלח זקוף
  for (const rows of [1, 3, 6]) {
    const before = (await state()).scans;
    const b64 = await page.evaluate(o => window.t.slip(o), { rows });
    await page.setInputFiles('#paperCamGlobal', { name: 'slip-' + rows + '.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') });
    await modalOpen();
    waiting = (await state()).items.find(x => x.status === 'photo');
    assert.deepEqual(waiting.pages.map(p => p.autoRotated), [0], rows + ' שורות: נייר ישר לא מסובב');
    assert.doesNotMatch(await text('#aiOrientationHint'), /יושר לבד/);
    await page.waitForTimeout(500); // אדם שמסתכל על הצילום (ההגנה מהקשה כפולה)
    await page.locator('#aiOrientationConfirm').click();
    await modalClosed();
    await page.waitForFunction(n => { const x = window.t.state(); return x.scans === n + 1 && !x.busy; }, before);
    const sent = (await page.evaluate(i => window.t.sent(i), before))[0];
    const dim = await page.evaluate(d => window.t.tone(d), sent);
    assert.ok(dim.h > dim.w, rows + ' שורות: מה שנשלח זקוף (' + dim.w + '×' + dim.h + ')');
  }
  assert.deepEqual(errors, [], 'בלי שגיאות דף');
  console.log('✓ v175 בדפדפן: צילום של נייר מהנהג מחכה במסך האישור ולא נשלח לפניו; "סובב", "אשר" ו"מחק צילום" בלחיצות אמיתיות; צילום שוכב מיושר לבד (בלי תג כיוון — ימינה, תג 3 — שמאלה) וראש התעודה למעלה; תעודה ארוכה מיושרת, מחולקת לשניים ונשלחת כשני עמודים; נתוני הצילום נשמרים; נייר קצר וישר (גופן ברוחב קבוע) לא מסובב לעולם; 390px בלי גלילה לצדדים');
} finally {
  await browser.close();
  server.close();
}
