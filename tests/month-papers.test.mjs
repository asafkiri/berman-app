// v128 — הניירות מהנהג במרכזת החודשית, סגירת חודש מול החשבונית, ובלי "אישור" עיוור בכרטיס ההחזרה.
// על הנתונים של 19.8–5.10.2026 (tests/ledger-2026-10.json) ועל החזרות קטנות סינתטיות.
// מה שנבדק:
// - ספטמבר זהה בדיוק, עם ניירות ובלעדיהם (₪14,210.88); חודש לפני תחילת המאזן — בלי ניירות.
// - אוקטובר: בלי ניירות 4 יח׳ פתוחות (233, 344, 238); עם 141 ו-142 — 1231 ×2 (חיוב כפול) ו-100 ×13,
//   והשלוש נסגרות; "כן, זה תיקון" — רק 1231 ×2 (₪17). הפירוט היומי מראה את הניירות.
// - סגירת חודש: כפתור רק לחודש מלא שעבר ובתוך המאזן; הכתיבה ל-config/app; המאזן מתחיל ביום שאחרי,
//   והמרכזת של החודש הסגור לא משתנה; "פתח מחדש" מחזיר את הסגירה הקודמת.
// - כרטיס החזרה: בלי "אישור"; נייר שסגר — "זוכתה, אין מה לעשות"; "הכל זוכה במלואו" רק בבדיקה הידנית
//   ורק לתעודה שעוד לא אומתה.
// הרצה: node --test tests/month-papers.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runtime, fixture } from './receipt-scan-harness.mjs';

const L = JSON.parse(fs.readFileSync(new URL('./ledger-2026-10.json', import.meta.url), 'utf8'));
const RET410 = L.returns.find(x => (x.docDate || x.date) === '2026-10-04').id;
const corr = { schema: 1, kind: 'declared', state: 'accepted', docDay: '2026-10-04', timestamp: 2, id: 'decl_corr_1', declare: 'correction',
  rows: [{ line: 1, itemCode: '100', productId: 'code_100', qty: 13 }], standsFor: { returnId: RET410, chargePaperId: L.papers.p141.id } };

function app(papersList, opts = {}) {
  const r = runtime({ data: { ...fixture(), products: L.products } });
  r.context.testL = { receipts: opts.receipts || L.receipts.slice().reverse(), returns: opts.returns || L.returns.slice().reverse(), papers: papersList };
  r.context.testWrites = [];
  r.run(`receipts = testL.receipts; returns = testL.returns; papers = testL.papers; todayStr = () => '${opts.today || '2026-10-05'}';
    runCloudTask = async (label, task) => { testWrites.push(structuredClone(task)); return true; }; runCloudTaskSilent = runCloudTask; ledgerInvalidate();`);
  r.month = (from, to) => JSON.parse(r.run(`JSON.stringify((() => { const d = receiptRangeData('${from}', '${to}');
    const row = c => { const x = d.matrix.list.find(q => q.code === c); return x ? { billed: x.billed, credited: x.credited, open: x.openUnits } : null; };
    return { net: d.netEx, fair: d.fairEx, open: d.openClaimUnits, papers: d.paperCount, days: d.paperDays, r1231: row('1231'), r100: row('100'), r233: row('233'), r344: row('344'), r238: row('238') }; })())`));
  return r;
}

test('ספטמבר זהה בדיוק עם ניירות ובלעדיהם; אוגוסט (לפני תחילת המאזן) — בלי ניירות', () => {
  const plain = app([]).month('2026-09-01', '2026-09-30');
  const withPapers = app([L.papers.p141, L.papers.p142, corr]).month('2026-09-01', '2026-09-30');
  assert.equal(plain.net, 14210.88);
  assert.deepEqual(withPapers, plain);
  assert.equal(withPapers.papers, 0);
  const aug = app([L.papers.p141, L.papers.p142]).month('2026-08-01', '2026-08-31');
  assert.deepEqual(aug, app([]).month('2026-08-01', '2026-08-31'));
});

test('אוקטובר: הניירות במרכזת — כמו המאזן', () => {
  const none = app([]).month('2026-10-01', '2026-10-31');
  assert.equal(none.open, 4, '233 ×1, 344 ×2, 238 ×1');
  assert.deepEqual([none.r233.open, none.r344.open, none.r238.open], [1, 2, 1]);
  const both = app([L.papers.p141, L.papers.p142]).month('2026-10-01', '2026-10-31');
  assert.equal(both.papers, 2);
  assert.deepEqual(both.days, { '2026-10-04': ['95141', '95142'] });
  assert.deepEqual(both.r1231, { billed: 42, credited: 1, open: 2 }, '141 חייב את העודף של 4.10 — ו-5.10 חויבה שוב: חיוב כפול');
  assert.deepEqual(both.r100, { billed: 13, credited: 0, open: 13 }, '100 ×13 מ-141 — עד שיתברר שזה תיקון');
  assert.deepEqual([both.r233.open, both.r344.open, both.r238.open], [0, 0, 0], '142 זיכה אותם');
  assert.equal(both.open, 15);
  assert.equal(both.fair, none.fair, 'מה שבאמת מגיע לא משתנה — נייר אינו סחורה');
  const fixed = app([L.papers.p141, L.papers.p142, corr]).month('2026-10-01', '2026-10-31');
  assert.deepEqual(fixed.r100, { billed: 13, credited: 13, open: 0 }, '"כן, זה תיקון" — הזיכוי הראשון זיכה 100');
  assert.equal(fixed.open, 2, 'נשאר רק 1231 ×2');
  assert.equal(Math.round((fixed.net - fixed.fair) * 100) / 100, 17, '2 × ₪8.50');
});

test('הפירוט היומי והשורה העליונה מראים את הניירות', () => {
  const r = app([L.papers.p141, L.papers.p142]);
  r.run(`document.getElementById('rcFrom').value = '2026-10-01'; document.getElementById('rcTo').value = '2026-10-31'; renderRangeResult('2026-10-01', '2026-10-31');`);
  const html = r.node('rcRangeResult').innerHTML;
  assert.match(html, /2 ניירות מהנהג/);
  assert.match(html, /ניירות 95141, 95142/);
  assert.match(html, /תעודות משלוח וניירות חיוב/);
  assert.doesNotMatch(html, /הניירות מהנהג לא חושבו/);
});

test('סגירת חודש: רק חודש מלא שעבר; נכתב ל-config; המאזן ממשיך ביום שאחרי; המרכזת של החודש לא משתנה; פתיחה מחדש', async () => {
  const r = app([L.papers.p141, L.papers.p142], { today: '2026-11-03' });
  const octBefore = r.month('2026-10-01', '2026-10-31');
  const box = from => r.run(`monthCloseHtml(receiptRangeData('${from}', monthLastDay('${from.slice(0, 7)}')))`);
  assert.match(box('2026-10-01'), /data-role="rc-month-close" data-day="2026-10-31"/);
  assert.match(box('2026-10-01'), /במאזן עוד 2 פריטים פתוחים מהחודש הזה/);
  assert.equal(r.run(`monthCloseHtml(receiptRangeData('2026-11-01', '2026-11-30'))`), '', 'החודש הנוכחי — לא');
  assert.equal(r.run(`monthCloseHtml(receiptRangeData('2026-10-01', '2026-10-20'))`), '', 'חלק מחודש — לא');
  assert.equal(r.run(`monthCloseHtml(receiptRangeData('2026-08-01', '2026-08-31'))`), '', 'לפני תחילת המאזן — לא');
  r.run(`closeLedgerMonth('2026-10-31')`);
  assert.match(r.node('confirmMsg').textContent, /המאזן ימשיך מ-.*עוד 2 פריטים פתוחים/);
  assert.equal(r.context.testWrites.length, 0, 'כלום לפני האישור');
  await r.events.get('confirmOk:click')();
  const w = r.context.testWrites.at(-1);
  assert.deepEqual([w.op, w.path.slice(-2).join('/'), w.merge, w.data.ledgerClosedThrough, w.data.ledgerClosedPrev], ['set', 'config/app', true, '2026-10-31', '']);
  assert.equal(r.run('ledgerClosedThrough'), '2026-10-31');
  assert.equal(r.run('currentLedger().start'), '2026-11-01');
  assert.equal(r.run('currentLedger().count'), 0, 'הפריטים של אוקטובר יצאו מהמאזן');
  assert.deepEqual(r.month('2026-10-01', '2026-10-31'), octBefore, 'המרכזת של אוקטובר — עם הניירות שלו, כמו שהושוותה');
  assert.match(box('2026-10-01'), /נסגר מול החשבונית ✓[\s\S]*data-role="rc-month-reopen" data-day="2026-10-31"/);
  r.run(`setView('ledger')`);
  assert.match(r.node('app').innerHTML, /עד 31\.10 נסגר מול החשבונית/);
  // פתיחה מחדש
  r.run(`reopenLedgerMonth('2026-10-31')`);
  await r.events.get('confirmOk:click')();
  assert.equal(r.context.testWrites.at(-1).data.ledgerClosedThrough, '');
  assert.equal(r.run('ledgerClosedThrough'), '');
  assert.equal(r.run('currentLedger().count'), 2, 'הפריטים חזרו');
});

test('פתיחה מחדש מחזירה את הסגירה הקודמת', async () => {
  const r = app([], { today: '2026-12-02' });
  r.run(`ledgerClosedThrough = '2026-09-30';`);
  r.run(`closeLedgerMonth('2026-10-31')`); await r.events.get('confirmOk:click')();
  assert.equal(r.context.testWrites.at(-1).data.ledgerClosedPrev, '2026-09-30');
  r.run(`reopenLedgerMonth('2026-10-31')`); await r.events.get('confirmOk:click')();
  assert.equal(r.run('ledgerClosedThrough'), '2026-09-30');
});

const ret = (id, rows, extra = {}) => ({ id, date: '2026-10-03', credited: false, timestamp: Date.parse('2026-10-03T08:00:00'), sentTo: 'הנהג', ...extra,
  items: rows.map(([code, qty]) => ({ productId: 'code_' + code, code, name: (L.products.find(p => p.id === 'code_' + code) || {}).name || code, barcode: '', qty })) });
const creditPaper = (number, rows) => ({ schema: 1, state: 'accepted', id: 'paper_' + number, kind: 'credit', number, terminalNumber: number, docDay: '2026-10-04', printedTime: '10:00', timestamp: Date.parse('2026-10-04T10:00:00'),
  rows: rows.map(([code, qty], i) => ({ line: i + 1, itemCode: code, barcode: '', description: code, qty, productId: 'code_' + code, matchedBy: 'code' })),
  anchors: { units: rows.reduce((a, x) => a + x[1], 0), lines: rows.length, source: 'printed' }, proof: { unitsOk: true, linesOk: true } });

test('כרטיס החזרה: בלי "אישור"; נייר שסגר — "אין מה לעשות"; "הכל זוכה במלואו" רק בבדיקה הידנית של תעודה שלא אומתה', async () => {
  const R = ret('ret_t1', [['101', 2], ['344', 1]]);
  const closed = app([creditPaper('290099001', [['101', 2], ['344', 1]])], { receipts: [], returns: [R] });
  const row = closed.run('retVerifyRowHtml(returns[0])');
  assert.match(row, /צולם ומתאים — ההחזרה זוכתה\. אין מה לעשות/);
  assert.doesNotMatch(row, /data-role="rv-approve"|data-role="rv-verify-inline"/);
  // והמרכזת סופרת את הזיכוי מהנייר — בלי "אישור"
  const m = closed.month('2026-10-01', '2026-10-31');
  assert.equal(m.r344 && m.r344.credited, 1);
  assert.equal(m.open, 0);
  // בלי נייר: בדיקה ידנית (עם שדה הסכום), בלי אישור
  const bare = app([], { receipts: [], returns: [ret('ret_t2', [['101', 2]])] });
  const html = bare.run('retVerifyRowHtml(returns[0])');
  assert.match(html, /data-role="rv-verify-inline" data-id="ret_t2"/);
  assert.match(html, /id="rvNote_ret_t2"/);
  assert.doesNotMatch(html, /data-role="rv-approve"/);
  await bare.click('rv-verify-inline', 'ret_t2');
  assert.equal(bare.run('currentView'), 'returnReconcile');
  assert.match(bare.node('app').innerHTML, /data-role="rv-all-credited"[^>]*>.*הכל זוכה במלואו/);
  await bare.click('rv-all-credited');
  assert.match(bare.node('confirmMsg').textContent, /כל 2 היחידות/);
  // תעודה שכבר אומתה — בבדיקה החוזרת אין "הכל זוכה" (האישור הוא רק לתעודה שעוד לא אומתה)
  const done = app([], { receipts: [], returns: [ret('ret_t3', [['101', 2]], { credited: true, creditStatus: 'ok' })] });
  await done.click('rv-open', 'ret_t3');
  assert.equal(done.run('currentView'), 'returnReconcile');
  assert.doesNotMatch(done.node('app').innerHTML, /data-role="rv-all-credited"/);
});
