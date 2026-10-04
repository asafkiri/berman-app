// v123 — תעודת חזרות נבדקת לפי כמויות בלבד.
// הרגרסיה רצה על צמצום מנוקה של 19 תעודות החזרה האמיתיות (אוגוסט–אוקטובר
// 2026, tests/returns-2026-08-10.json) ומצמידה לכל אחת: פתוחה/סגורה, החוסר
// והעודף ביחידות לפי מוצר, וכמה יחידות נשלחו וזוכו.
//   • רק תעודת 4.10 פתוחה: ברמן לא זיכתה על 238 (ברמן אסלי 5 פיתות) ×1 ועל 344
//     (לחם מקמח כוסמין E-FREE) ×2 — 3 יחידות. 1231 (לחמניות 10 בשקית) זוכתה.
//   • שאר 18 התעודות סגורות; שאריות האגורות של היום (0.01, ‎-0.21) נעלמות.
//   • חודשים לפי תאריך התעודה: אוגוסט 56/56, ספטמבר 152/152, אוקטובר 97 נשלחו / 94 זוכו.
//   • כל הפסיקות זהות כשמוחקים מכל תעודה את שדות הכסף — הקוראים לא נוגעים בכסף.
// הרצה:            node --test tests/returns-regression.test.mjs
// מול גיבוי אמיתי: node --test tests/returns-regression.test.mjs -- --backup ~/backup.json
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runtime } from './receipt-scan-harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const backupArg = (() => { const i = process.argv.indexOf('--backup'); return i > -1 ? process.argv[i + 1] : null; })();
const OCT4 = 'returns_43eb7cdd-5e32-4524-aa86-b87ca8e88650';
const SEP5 = 'returns_84f367b7-7408-4aa4-a303-8a98e971a28b';

function load() {
  if (backupArg) {
    const bk = JSON.parse(fs.readFileSync(backupArg, 'utf8'));
    const col = bk.collections || bk;
    const raw = col.products;
    const products = Array.isArray(raw) ? raw.map(v => ({ id: 'code_' + v.code, ...v })) : Object.entries(raw).map(([id, v]) => ({ id, ...v }));
    const returns = Object.entries(col.returns).map(([id, v]) => ({ id, ...v }));
    const receipts = Object.entries(col.receipts || {}).map(([id, v]) => ({ id, ...v }));
    return { products, returns, receipts };
  }
  const rx = JSON.parse(fs.readFileSync(path.join(HERE, 'receipts-2026-08-10.json'), 'utf8'));
  const fx = JSON.parse(fs.readFileSync(path.join(HERE, 'returns-2026-08-10.json'), 'utf8'));
  // התאום של קישור הזיכוי (5.9 → קליטת 6.9) כמו שהוא שמור בגיבוי
  const twins = new Map((fx.receiptTwins || []).map(t => [t.id, t]));
  const receipts = rx.receipts.map(rc => twins.has(rc.id) ? { ...rc, ...twins.get(rc.id) } : rc);
  return { products: rx.products, returns: fx.returns, receipts };
}

const MONEY = ['totalExVat', 'totalIncVat', 'creditNoteTotal', 'creditNoteParts'];
const LINE_MONEY = ['unitPrice', 'lineTotal', 'sentUnitPrice', 'listPrice', 'discountPct', 'priceForm', 'promoOnPaper'];
function stripMoney(r) {
  const out = { ...r };
  MONEY.forEach(k => delete out[k]);
  out.items = (r.items || []).map(l => { const c = { ...l }; LINE_MONEY.forEach(k => delete c[k]); return c; });
  return out;
}

function create(opts) {
  opts = opts || {};
  const r = runtime();
  const { products, returns, receipts } = load();
  r.context.__products = products;
  r.context.__returns = opts.strip ? returns.map(stripMoney) : returns;
  r.context.__receipts = receipts;
  r.run('products = __products; returns = __returns; receipts = __receipts; promos = [];');
  return r;
}
const verdicts = r => JSON.parse(r.run(`JSON.stringify(returns.map(rt => {
  const di = returnsDiscrepancyInfo(rt);
  const sent = (rt.items || []).filter(l => !l.isDeposit).reduce((a, l) => a + (Number(l.qty) || 0), 0);
  const credited = !rt.credited ? 0 : (rt.items || []).filter(l => !l.isDeposit).reduce((a, l) => a + (l.noteQty != null ? (Number(l.noteQty) || 0) : (Number(l.qty) || 0)), 0);
  return { id: rt.id, day: String(rt.docDate || rt.date).slice(0, 10), open: di.open, credited: !!rt.credited,
    short: di.shortItems.map(x => [x.name, x.n]), over: di.overItems.map(x => [x.name, x.n]), sent, creditedUnits: credited };
}))`));

test('19 תעודות: רק תעודת 4.10 פתוחה, ורק בגלל כמויות', () => {
  const all = verdicts(create());
  if (!backupArg) assert.equal(all.length, 19);
  assert.ok(all.every(x => x.credited), 'כל התעודות אומתו');
  const open = all.filter(x => x.open);
  assert.deepEqual(open.map(x => x.id), [OCT4], JSON.stringify(open));
  const [oct4] = open;
  assert.deepEqual(oct4.short, [['ברמן אסלי 5 פיתות', 1], ['לחם מקמח כוסמין E-FREE', 2]]);
  assert.deepEqual(oct4.over, []);
  assert.equal(oct4.sent, 48);
  assert.equal(oct4.creditedUnits, 45);
  // כל השאר סגורות לגמרי — בלי חוסר ובלי עודף
  all.filter(x => x.id !== OCT4).forEach(x => {
    assert.deepEqual([x.short, x.over, x.sent === x.creditedUnits], [[], [], true], x.id);
  });
});

test('לחמניות 10 בשקית (1231) זוכתה ב-4.10 — אינה חוסר', () => {
  const r = create();
  const di = JSON.parse(r.run(`JSON.stringify(returnsDiscrepancyInfo(returns.find(x => x.id === ${JSON.stringify(OCT4)})))`));
  assert.ok(!di.shortItems.some(x => /לחמניות 10 בשקית/.test(x.name)));
  // החוסר נושא את זהות המוצר — העברה קדימה וקישור זיכוי מתאימים לפיה
  assert.deepEqual(di.shortItems.map(x => [x.productId, x.code, x.n]), [['code_238', '238', 1], ['code_344', '344', 2]]);
  assert.equal(di.shortUnits, 3);
  assert.equal(di.overUnits, 0);
  assert.equal(di.owed, undefined, 'אין יותר "הספק חייב לך ₪"');
});

test('המאזן בבאנר: 3 יח׳ חסרות בתעודה אחת, בלי ₪', () => {
  const r = create();
  const bal = JSON.parse(r.run('JSON.stringify(returnsBalance())'));
  assert.equal(bal.openDocs, 1);
  assert.equal(bal.shortUnits, 3);
  assert.equal(bal.overUnits, 0);
  if (!backupArg) assert.equal(bal.n, 19);
  const html = r.run('returnsBalanceBannerHtml()');
  assert.match(html, /חסר זיכוי על 3 יח׳ בתעודה אחת/);
  assert.doesNotMatch(html, /₪/);
});

test('חודשים לפי תאריך התעודה: אוגוסט 56/56, ספטמבר 152/152, אוקטובר 97/94', () => {
  if (backupArg) return;
  const r = create();
  const month = (from, to) => JSON.parse(r.run(`(() => {
    const rets = returns.filter(rt => { const d = String(rt.docDate || rt.date).slice(0, 10); return d >= ${JSON.stringify(from)} && d <= ${JSON.stringify(to)}; });
    const m = rangeProductMatrixData({ recs: [], rets });
    return JSON.stringify({ sent: m.list.reduce((a, x) => a + x.sent, 0), credited: m.list.reduce((a, x) => a + x.credited, 0) });
  })()`));
  assert.deepEqual(month('2026-08-01', '2026-08-31'), { sent: 56, credited: 56 });
  assert.deepEqual(month('2026-09-01', '2026-09-30'), { sent: 152, credited: 152 });
  assert.deepEqual(month('2026-10-01', '2026-10-31'), { sent: 97, credited: 94 });
});

test('תעודה מ-30.9 עם תאריך נייר 1.10 נספרת באוקטובר', () => {
  if (backupArg) return;
  const all = verdicts(create());
  const doc = all.find(x => x.id === 'returns_2c14e178-331b-485b-a72b-b09ab789415a');
  assert.equal(doc.day, '2026-10-01');
  assert.equal(doc.sent, 34);
});

test('כל הפסיקות זהות כשמוחקים את שדות הכסף מכל התעודות', () => {
  const plain = verdicts(create());
  const stripped = verdicts(create({ strip: true }));
  assert.deepEqual(stripped, plain);
  const bal = r => JSON.parse(r.run('JSON.stringify(returnsBalance())'));
  assert.deepEqual(bal(create({ strip: true })), bal(create()));
});

test('ההעברה קדימה של 4.10: 238×1 ו-344×2, בלי מחיר', () => {
  const r = create();
  const plan = JSON.parse(r.run(`JSON.stringify(retCarryPlan(returns.find(x => x.id === ${JSON.stringify(OCT4)})))`));
  assert.deepEqual(plan.items.map(x => [x.productId, x.name, x.qty]), [['code_238', 'ברמן אסלי 5 פיתות', 1], ['code_344', 'לחם מקמח כוסמין E-FREE', 2]]);
  assert.equal(plan.units, 3);
  assert.ok(plan.items.every(x => x.price === undefined && x.amountOnly === undefined), JSON.stringify(plan));
});

test('הקישור הישן 5.9 → קליטת 6.9 נשמר: חוסם מחיקה, ו-401 זוכה פעמיים בדיוק', () => {
  if (backupArg) return;
  const r = create();
  const out = JSON.parse(r.run(`(() => {
    const rt = returns.find(x => x.id === ${JSON.stringify(SEP5)});
    const rc = receipts.find(x => x.id === 'receipt_6771fe19-82e4-4f34-b81a-42ef5c9904b4');
    const m = rangeProductMatrixData({ recs: [rc], rets: [rt] });
    const row = m.list.find(x => x.pid === 'code_401');
    return JSON.stringify({ allocations: creditAllocationList(rt).length, blocked: returnHasCreditAllocations(rt.id), credited: row.credited, receiptOpen: receiptDiscrepancyInfo(rc).open });
  })()`));
  assert.deepEqual(out, { allocations: 1, blocked: true, credited: 2, receiptOpen: false });
});
