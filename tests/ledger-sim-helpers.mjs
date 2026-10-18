// v144 — הסימולציה של ledger-sim.test.mjs (חודש מומצא, והשוואה יום-יום מול מה שקרה באמת). ראה שם.
import fs from 'node:fs';
import { runtime, fixture } from './receipt-scan-harness.mjs';

const L = JSON.parse(fs.readFileSync(new URL('./ledger-2026-10.json', import.meta.url), 'utf8'));
const PROMO = { id: 'promo_sim_339', type: 'receipt', productIds: ['code_339'], pct: 0, fixedPrice: 10, minQty: 1, minUnit: 'unit', start: '2026-09-01', end: '2026-10-31', name: 'ברמן אקטיב — מבצע' };
export const P = Object.fromEntries(L.products.map(p => [p.code, p]));
export const app = runtime({ data: { ...fixture(), products: structuredClone(L.products), promos: [PROMO] } });
app.context.testWrites = [];
app.run(`runCloudTask = async (label, task) => { testWrites.push(task); return true; }; runCloudTaskSilent = runCloudTask;`);
const j = expr => JSON.parse(app.run('JSON.stringify(' + expr + ')'));

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00'); t.setDate(t.getDate() + n); return t.toLocaleDateString('en-CA'); };
const weekday = d => new Date(d + 'T12:00:00').getDay();
// כמה פעמים כל מוצר הופיע בהחזרות של המשתמש (משקל לבחירה)
const POOL = [['238', 19], ['2387', 14], ['2381', 12], ['349', 10], ['101', 8], ['339', 8], ['458', 8], ['450', 6], ['233', 6], ['344', 5], ['220', 5], ['119', 4], ['3701', 4], ['333', 4], ['1220', 3], ['451', 3], ['401', 3], ['1231', 2], ['1244', 2], ['232', 1]];
const SIB = { 450: ['451'], 451: ['450'], 101: ['111'], 3701: ['3712'], 333: ['339'], 339: ['333'] };
const line = (code, qty) => ({ productId: P[code].id, code, name: P[code].name, barcode: P[code].barcode || '', qty });

// חודש אחד. shorts — שיעור הניירות שחסרה בהם שורה (או חלק ממנה)
export function month(seed, shorts) {
  const rand = rng(seed), pick = a => a[Math.floor(rand() * a.length)];
  const wpick = () => { let x = rand() * POOL.reduce((s, p) => s + p[1], 0); for (const [c, w] of POOL) if ((x -= w) < 0) return c; return POOL[0][0]; };
  const start = '2026-10-01', days = 26, receipts = [], returns = [], papers = [], truth = { swaps: [], shorts: [] };
  let num = 95000 + Math.floor(rand() * 500), pending = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(start, i);
    if (weekday(d) !== 6) receipts.push({ id: 'rc_' + d, date: d, docDate: d, timestamp: Date.parse(d + 'T06:00:00'), items: [{ ...line(pick(['101', '238', '2381']), 10 + i % 5), noteQty: 10 + i % 5 }] });
  }
  const mkPaper = (rows, docDay, rid) => {
    const merged = {}; rows.forEach(([c, q]) => { merged[c] = (merged[c] || 0) + q; });
    const list = Object.entries(merged).filter(([, q]) => q > 0);
    if (!list.length) return;
    num += 1 + Math.floor(rand() * 3);
    const number = '2900' + String(num).padStart(5, '0');
    papers.push({ schema: 1, state: 'accepted', id: 'paper_' + number, kind: 'credit', kindKnown: true, number, terminalNumber: number, numerator: String(num), docDay, printedTime: null,
      headerText: 'ח.משלוח החזרה יבש', rid, timestamp: 0,
      rows: list.map(([c, q], k) => ({ line: k + 1, itemCode: c, barcode: P[c].barcode || '', description: P[c].name, qty: q, productId: P[c].id, matchedBy: 'tnuva_code_exact' })),
      anchors: { units: list.reduce((s, x) => s + x[1], 0), lines: list.length, source: 'printed' }, proof: { unitsOk: true, linesOk: true, checkOk: true, scanStatus: 'agreed' } });
  };
  const credRows = R => {
    let rows = R.items.map(l => [l.code, l.qty]);
    const cand = rows.filter(([c]) => SIB[c]);
    if (cand.length && rand() < 0.3) {
      const [a, qa] = pick(cand), b = pick(SIB[a]), q = 1 + Math.floor(rand() * qa);
      rows = rows.map(([c, x]) => [c, c === a ? x - q : x]); rows.push([b, q]);
      truth.swaps.push({ ret: R.id, a, b, q });
    }
    if (rows.length > 1 && rand() < shorts) {
      const k = Math.floor(rand() * rows.length), [c, x] = rows[k];
      if (x > 0 && !truth.swaps.some(s => s.ret === R.id && (s.a === c || s.b === c))) {
        const miss = rand() < 0.5 ? x : 1 + Math.floor(rand() * x);
        // חוסר בדיוק בכמות של החלפה באותה החזרה — מעורפל מטבעו (איזה מהשניים הוחלף?): המאזן מראה את שניהם, בכוונה
        if (!truth.swaps.some(s => s.ret === R.id && s.q === miss)) { rows[k] = [c, x - miss]; truth.shorts.push({ ret: R.id, code: c, units: miss }); }
      }
    }
    return rows;
  };
  for (let i = 0; i < days - 4; i++) {
    const d = addDays(start, i);
    if (rand() < 0.4) {
      const items = {};
      for (let k = 2 + Math.floor(rand() * 6); k > 0; k--) { const c = wpick(); items[c] = (items[c] || 0) + 1 + Math.floor(rand() * (rand() < 0.2 ? 7 : 3)); }
      const R = { id: 'ret_' + d, date: d, docDate: d, credited: false, timestamp: Date.parse(d + 'T19:30:00'), sentTo: 'קבוצה בוואטסאפ', items: Object.entries(items).map(([c, q]) => line(c, q)) };
      returns.push(R); pending.push(R);
    }
    const tomorrow = addDays(d, 1);
    if (!pending.length || weekday(tomorrow) === 6 || rand() < 0.2) continue;
    pending.forEach(R => {
      const rows = credRows(R);
      if (rows.length > 2 && rand() < 0.2) {
        const side = rows.splice(Math.floor(rand() * rows.length), 1);
        mkPaper(rows, tomorrow, R.id);
        mkPaper(side, rand() < 0.5 ? tomorrow : addDays(tomorrow, weekday(addDays(tomorrow, 1)) === 6 ? 2 : 1), R.id);
      } else mkPaper(rows, tomorrow, R.id);
    });
    pending = [];
  }
  // צילום במנות: ביום צילום מצלמים את כל מה שהודפס עד אז
  const shoot = new Set(); for (let i = 0; i < days + 4; i++) if (rand() < 0.65) shoot.add(addDays(start, i));
  papers.forEach(p => { let d = p.docDay; while (!shoot.has(d) && d < addDays(p.docDay, 3)) d = addDays(d, 1); p.photo = d; p.timestamp = Date.parse(d + 'T08:00:00'); });
  return { receipts, returns, papers, truth, start, end: addDays(start, days + 3), deliveries: receipts.map(rc => rc.date) };
}

const ITEMS = `currentLedger().items.map(i => ({ kind: i.kind, state: i.state, key: i.key || null, units: i.units, keys: i.keys || null, part: i.part ? { type: i.part.type, id: i.part.id } : null,
  paper: i.paper ? i.paper.id : null, swap: i.swap ? { a: i.swap.a, b: i.swap.b, q: i.swap.q, price: i.swap.price, ret: i.swap.returnId } : null, text: ledgerItemText(i, currentLedger(), ledgerAllPapers(currentLedger())).text }))`;
// כל יום בחודש — מה שהמשתמש היה רואה, מול מה שקרה באמת. מחזיר את מה שלא היה צריך להופיע (או חסר)
export function replay(S) {
  const wrong = [], answers = {}, seen = new Set();
  const own = rid => S.papers.filter(p => p.rid === rid);
  const partial = (rid, T) => own(rid).some(p => p.photo <= T) && own(rid).some(p => p.photo > T);
  const allIn = (rid, T) => own(rid).length > 0 && own(rid).every(p => p.photo <= T);
  const note = (T, key, what) => { if (!seen.has(key)) { seen.add(key); wrong.push(T + ': ' + what); } };
  // חוסר שהוזרק לנייר של ההחזרה — כל המוצרים בפריט הם חוסרים כאלה, בכמות שלהם
  const injected = (rid, it) => (it.keys || [{ key: it.key, units: it.units }]).every(z => S.truth.shorts.some(x => x.ret === rid && P[x.code].id === z.key && x.units === z.units));
  // החזרה אחרת שנייר ההשלמה שלה עוד לא צולם, ושיש בה (או בניירות שלה) אותו מוצר — עד שיצולם, הזיכוי שלה יכול
  // להתקזז מול החוסר הזה (מאזן לפי מוצר); נבדק שוב כשיצולם
  // חוסר אמיתי במוצר שבהחזרה אחרת (בשבועיים סביבו) הנהג זיכה במקום מוצר אחר — מעורפל מטבעו: הזיכוי הזה יכול להיות
  // גם הזיכוי המאוחר על החוסר (v141: "הזיכוי אולי עליהם"). אז המאזן מראה חוסר באחד משניהם — לא נבדק איזה
  const near = (a, b) => Math.abs(Date.parse(a.slice(4)) - Date.parse(b.slice(4))) <= 14 * 864e5;
  const twin = x => S.truth.swaps.some(w => w.b === x.code && w.ret !== x.ret && near(w.ret, x.ret));
  const twinSwap = (rid, it) => (it.keys || [{ key: it.key, units: it.units }]).every(z => S.truth.swaps.some(w => w.ret === rid && P[w.a].id === z.key && z.units <= w.q && S.truth.shorts.some(x => x.code === w.b && x.ret !== rid && near(x.ret, rid))));
  const busy = (code, T) => S.returns.some(R => partial(R.id, T) && (R.items.some(l => l.code === code) || own(R.id).some(p => p.rows.some(r => r.itemCode === code))));
  for (let T = S.start; T <= S.end; T = addDays(T, 1)) {
    const load = () => {
      app.context.simL = { receipts: S.receipts.filter(x => x.date <= T), returns: S.returns.filter(x => x.date <= T),
        papers: S.papers.filter(p => p.photo <= T).map(({ rid, photo, ...p }) => answers[p.id] ? { ...p, attach: answers[p.id].attach, forReturnId: answers[p.id].rid } : p) };
      app.run(`receipts = simL.receipts; returns = simL.returns; papers = simL.papers; todayStr = () => '${T}'; ledgerInvalidate();`);
      return j(ITEMS);
    };
    let items = load();
    const asks = items.filter(it => it.kind === 'needsAttach' && it.paper && !answers[it.paper]);
    if (asks.length) {
      asks.forEach(it => { const rid = S.papers.find(p => p.id === it.paper).rid; answers[it.paper] = { rid, attach: j(`paperUserAttach(papers.find(p => p.id === '${it.paper}'), '${rid}')`) }; });
      items = load();
    }
    items.forEach(it => {
      if (it.state === 'info') return;
      if (it.kind === 'needsAttach') return note(T, 'na|' + it.paper, 'שאלה שחוזרת אחרי תשובה: ' + it.text);
      const paperRet = it.part && it.part.type === 'paper' ? (S.papers.find(p => p.id === it.part.id) || {}).rid : null;
      const rid = (it.swap && it.swap.ret) || (it.part && it.part.type === 'return' && it.part.id) || paperRet;
      if (rid && partial(rid, T)) return; // נייר ההשלמה עוד לא צולם — חוסר עד שיצולם (בכוונה)
      if (it.kind === 'returnNotCreditedYet') {
        const R = S.returns.find(x => x.id === it.part.id), visits = S.deliveries.filter(d => d > R.date && d <= T).length;
        // בלי נייר ראשי (הניירות של ההחזרה מכסים פחות מחצי ממנה) — מה שחסר בהם "ממתין", ואחרי 4 ביקורים חוסר (v141)
        if (allIn(R.id, T)) return injected(R.id, it) ? undefined : note(T, 'pd|' + R.id, 'ממתינה למרות שהנייר צולם: ' + it.text);
        if (it.state !== 'pending' && visits < 4) return note(T, it.text, it.text);
        const sent = R.items.reduce((a, l) => a + l.qty, 0), shown = (it.keys || [{ units: it.units }]).reduce((a, z) => a + z.units, 0);
        if (shown !== sent) note(T, 'pc|' + R.id, 'ממתינה ל-' + shown + ' מתוך ' + sent + ': ' + it.text);
        return;
      }
      if (it.kind === 'swap' && it.swap.price !== 'same' && S.truth.swaps.some(x => x.ret === it.swap.ret && P[x.a].id === it.swap.a && P[x.b].id === it.swap.b && x.q === it.swap.q)) return;
      if (it.kind === 'returnedNotCredited' && it.part && (injected(it.part.id, it) || (it.keys || [{ key: it.key, units: it.units }]).every(z => injected(it.part.id, { keys: [z] }) || twinSwap(it.part.id, { keys: [z] })))) return;
      note(T, it.kind + '|' + it.text, it.text);
    });
    S.truth.shorts.forEach(x => {
      if (!allIn(x.ret, T) || busy(x.code, T) || twin(x)) return;
      const hit = items.some(it => (it.kind === 'returnedNotCredited' || it.kind === 'returnNotCreditedYet') && it.part && it.part.id === x.ret && (it.keys || [{ key: it.key, units: it.units }]).some(z => z.key === P[x.code].id && z.units === x.units));
      if (!hit) note(T, 'miss|' + x.ret + x.code, 'החוסר לא מוצג: ' + P[x.code].name + ' ×' + x.units + ' מההחזרה של ' + x.ret.slice(-5));
    });
  }
  return wrong;
}

