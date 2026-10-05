// v124 — הניתוח השבועי מתמחר כמו המרכזת. עד v123 שווי שורה נלקח מהכסף שנשמר על
// השורה (lineTotal / unitPrice), ולכן קליטות מ-v121 וחזרות מ-v123 — שאינן נושאות
// כסף — נספרו ₪0 ב"הגיע ₪", "חזר ₪", אחוז החזרות בכסף, העלות והרווח.
//   • מוצר מהקטלוג: כמות × invoiceUnitAt(מוצר, יום התעודה) — מחיר החשבונית
//     שבתוקף (priceHistory) ומבצע מרכזת — בתעודה חדשה ובתעודה ישנה כאחד.
//   • מוצר שכבר אינו בקטלוג: המחיר שנשמר על השורה (תעודות ישנות).
//   • חזרה מתומחרת ביום תעודת החזרות עצמה, לא ביום השבוע שאליו היא משויכת.
//   • שורה בלי productId נמצאת לפי קוד הפריט לפני הברקוד (ברקוד משותף בברמן).
//   • שווי כרטיס התעודה בהיסטוריה — אותו כלל.
// הרצה: node --test tests/analytics-money.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { runtime } from './receipt-scan-harness.mjs';

const json = (r, expr) => JSON.parse(r.run('JSON.stringify(' + expr + ')'));

function setup() {
  const r = runtime();
  r.run(`products.push(
      { id: 'pA', code: '9701', name: 'מוצר א', barcode: '777', price: 10, listPrice: 14, priceHistory: [{ from: '2026-09-01', price: 12, source: null }] },
      { id: 'pB', code: '9702', name: 'מוצר ב', barcode: '777', price: 5, listPrice: 7 });
    promos = [{ id: 'm1', type: 'receipt', fixedPrice: 9, pct: 0, minQty: 1, start: '2026-09-14', end: '2026-09-20', productIds: ['pA'] }];`);
  return r;
}
const rows = (r, rcs, rets) => {
  r.context.rcs = rcs; r.context.rets = rets;
  return json(r, `(() => { const out = {}; anBuildWeeks(rcs, rets, products).forEach(w => { out[w.key] = { recvValue: w.recvValue, retValue: w.retValue, rows: {} }; w.prod.forEach((x, k) => { out[w.key].rows[k] = { recvUnits: x.recvUnits, recvValue: x.recvValue, retUnits: x.retUnits, retValue: x.retValue, prices: x.prices.map(p => [p.d, p.unit, p.base, p.promo]) }; }); }); return out; })()`);
};

test('קליטה חדשה (בלי כסף) מתומחרת במחיר החשבונית של יום התעודה, כולל מבצע מרכזת', () => {
  const r = setup();
  const out = rows(r, [
    { id: 'a', schemaVersion: 2, timestamp: 1, date: '2026-08-25', docDate: '2026-08-25', items: [{ productId: 'pA', name: 'מוצר א', qty: 3 }] },
    { id: 'b', schemaVersion: 2, timestamp: 2, date: '2026-09-08', docDate: '2026-09-08', items: [{ productId: 'pA', name: 'מוצר א', qty: 2 }] },
    { id: 'c', schemaVersion: 2, timestamp: 3, date: '2026-09-15', docDate: '2026-09-15', items: [{ productId: 'pA', name: 'מוצר א', qty: 4 }] }], []);
  const all = Object.values(out).map(w => w.rows['p:pA']).filter(Boolean);
  const prices = all.flatMap(x => x.prices);
  assert.deepEqual(prices, [['2026-08-25', 10, 10, false], ['2026-09-08', 12, 12, false], ['2026-09-15', 9, 12, true]]);
  assert.equal(all.reduce((a, x) => a + x.recvValue, 0), 30 + 24 + 36, 'הגיע ₪ אינו 0');
});

test('תעודה ישנה עם מחיר שמור: מוצר מהקטלוג — לפי הקטלוג (כמו במרכזת); מוצר שנמחק — לפי השורה', () => {
  const r = setup();
  const out = rows(r, [
    { id: 'old', timestamp: 1, date: '2026-08-10', items: [
      { productId: 'pA', name: 'מוצר א', qty: 2, unitPrice: 9.03, lineTotal: 18.06 },
      { productId: 'gone', name: 'מוצר שנמחק', barcode: '', qty: 3, unitPrice: 4, lineTotal: 12 }] }], []);
  const w = Object.values(out)[0];
  assert.equal(w.rows['p:pA'].recvValue, 20);
  assert.equal(w.rows['n:מוצר שנמחק'].recvValue, 12);
  assert.equal(w.recvValue, 32);
});

test('חזרה של v123 (בלי כסף): "חזר ₪" לפי יום תעודת החזרות; שורה מועברת ופיקדון אינם נספרים', () => {
  const r = setup();
  const out = rows(r, [], [
    { id: 'ret', schemaVersion: 2, timestamp: 1, date: '2026-09-15', docDate: '2026-09-15', credited: true,
      items: [{ productId: 'pA', name: 'מוצר א', qty: 2, code: '9701' }, { productId: 'carry_x', name: 'מוצר א', qty: 1, carried: true },
        { name: 'פיקדון', barcode: '', qty: 3, isDeposit: true }] }]);
  const w = Object.values(out)[0];
  assert.equal(w.rows['p:pA'].retUnits, 2);
  assert.equal(w.rows['p:pA'].retValue, 18, 'מחיר המבצע ביום החזרה');
  assert.equal(w.retValue, 18);
});

test('שורה בלי productId: קוד הפריט מכריע לפני ברקוד משותף', () => {
  const r = setup();
  const out = rows(r, [{ id: 'k', schemaVersion: 2, timestamp: 1, date: '2026-08-12', docDate: '2026-08-12', items: [{ name: 'מוצר ב', barcode: '777', code: '9702', qty: 2 }] }], []);
  const w = Object.values(out)[0];
  assert.ok(w.rows['p:pB'], JSON.stringify(Object.keys(w.rows)));
  assert.equal(w.rows['p:pB'].recvValue, 10);
});

test('שווי כרטיס התעודה בהיסטוריה — אותו כלל', () => {
  const r = setup();
  r.run(`receipts = [{ id: 'v', schemaVersion: 2, timestamp: 1, date: '2026-09-15', docDate: '2026-09-15', status: 'ok', noteParts: [],
      items: [{ productId: 'pA', name: 'מוצר א', qty: 4 }, { productId: 'deposit-recv-pA', name: 'פיקדון', qty: 4, isDeposit: true }] }];
    returns = []; receiptHistoryFilter = 'all'; currentView = 'receiptsHistory'; renderReceiptsHistory();`);
  assert.match(r.node('app').innerHTML, /שווי לפי מחירי האפליקציה[^₪]*₪36\.00/);
});

test('אריחי החודש (הגיע/חזר החודש ₪, % מהכסף) — בלי כסף על השורות, לפי מחיר החשבונית', () => {
  const r = setup();
  const today = r.run('todayStr()'), first = today.slice(0, 8) + '01';
  r.context.rcs = [{ id: 'm1', schemaVersion: 2, timestamp: 1, date: first, docDate: first, items: [{ productId: 'pB', name: 'מוצר ב', qty: 10 }] }];
  r.context.rets = [{ id: 'm2', schemaVersion: 2, timestamp: 2, date: first, docDate: first, credited: true, items: [{ productId: 'pB', name: 'מוצר ב', qty: 2 }] }];
  r.run(`anBuild(rcs, rets, [anThisWeek()], [], null, 'test', false);`);
  const m = json(r, '{ recvValue: anData.month.recvValue, retValue: anData.month.retValue, retPctMoney: anData.month.retPctMoney }');
  assert.deepEqual(m, { recvValue: 50, retValue: 10, retPctMoney: 20 });
});

test('עלות ברירת המחדל בניתוח: מחיר החשבונית שבתוקף היום (לא הבסיס)', () => {
  const r = setup();
  r.run(`products.find(p => p.id === 'pB').priceHistory = [{ from: '2000-01-01', price: 6, source: null }];`);
  const cost = r.run(`(() => { const x = anNewRow({ key: 'p:pB', p: products.find(p => p.id === 'pB'), name: 'מוצר ב', barcode: '' }); anFinishRow(x); return x.cost; })()`);
  assert.equal(cost, 6);
});

test('מוצר שנמחק עם ברקוד משותף: לא נרשם על מוצר אחר — נשאר במחיר שנשמר על השורה (גם במרכזת)', () => {
  const r = setup();
  const out = rows(r, [{ id: 'd', timestamp: 1, date: '2026-08-10', items: [{ productId: 'code_9999', code: '9999', name: 'מוצר שנמחק', barcode: '777', qty: 3, unitPrice: 9.03, lineTotal: 27.09 }] }], []);
  const w = Object.values(out)[0];
  assert.ok(!w.rows['p:pA'] && !w.rows['p:pB'], JSON.stringify(Object.keys(w.rows)));
  assert.equal(w.recvValue, 27.09);
  r.context.recs = [{ id: 'd', timestamp: 1, date: '2026-08-10', items: [{ productId: 'code_9999', code: '9999', name: 'מוצר שנמחק', barcode: '777', qty: 3, unitPrice: 9.03 }] }];
  const m = json(r, `rangeProductMatrixData({ recs, rets: [] }).list.map(x => [x.pid, x.billed])`);
  assert.deepEqual(m, [['code_9999', 3]]);
});

test('קוד חלופי אינו מסתיר קוד ראשי של מוצר אחר', () => {
  const r = setup();
  r.run(`products.find(p => p.id === 'pA').altCodes = ['9702'];`);
  const out = rows(r, [{ id: 'k', schemaVersion: 2, timestamp: 1, date: '2026-08-12', docDate: '2026-08-12', items: [{ name: 'x', barcode: '555', code: '9702', qty: 1 }] }], []);
  assert.ok(Object.values(out)[0].rows['p:pB']);
});

test('קליטה במבצע: "לפי המחיר הרגיל", לא "לא נספרות"', () => {
  const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /במבצע, לא נספרות|קליטות במבצע לא נספרות|קליטות במחיר מבצע לא נספרות/);
});
