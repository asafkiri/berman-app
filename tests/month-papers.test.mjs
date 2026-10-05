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

// config/app בענן מדומה: הטרנזקציה האמיתית (executeLedgerCloseTask) רצה מולו
function withConfig(r, cfg = {}) {
  r.context.testCfg = cfg;
  r.context.doc = (_db, ...path) => path.join('/');
  r.context.runTransaction = async (_db, fn) => fn({
    get: async () => ({ exists: () => true, data: () => JSON.parse(JSON.stringify(r.context.testCfg)) }),
    set: (_ref, data) => { r.context.testCfg = { ...r.context.testCfg, ...JSON.parse(JSON.stringify(data)) }; } });
  r.run(`runCloudTask = async (label, task) => { testWrites.push(JSON.parse(JSON.stringify(task)));
    try { if (task.op === 'ledger-close') await executeLedgerCloseTask(task); return true; } catch (e) { testWrites.push({ stale: e.code }); return false; } };`);
  return r;
}
const cfg = r => JSON.parse(JSON.stringify(r.context.testCfg));
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise(res => setImmediate(res)); };
const ok = async r => { await r.events.get('confirmOk:click')(); await flush(); };

test('סגירת חודש: רק חודש מלא שעבר; טרנזקציה על config; המאזן ממשיך ביום שאחרי; המרכזת של החודש לא משתנה; פתיחה מחדש', async () => {
  const r = withConfig(app([L.papers.p141, L.papers.p142], { today: '2026-11-03' }));
  const octBefore = r.month('2026-10-01', '2026-10-31');
  const box = from => r.run(`monthCloseHtml(receiptRangeData('${from}', monthLastDay('${from.slice(0, 7)}')))`);
  assert.match(box('2026-10-01'), /data-role="rc-month-close" data-day="2026-10-31"/);
  assert.match(box('2026-10-01'), /2 פריטים פתוחים במאזן ייצאו ממנו בסגירה/);
  assert.equal(r.run(`monthCloseHtml(receiptRangeData('2026-11-01', '2026-11-30'))`), '', 'החודש הנוכחי — לא');
  assert.equal(r.run(`monthCloseHtml(receiptRangeData('2026-10-01', '2026-10-20'))`), '', 'חלק מחודש — לא');
  assert.equal(r.run(`monthCloseHtml(receiptRangeData('2026-08-01', '2026-08-31'))`), '', 'לפני תחילת המאזן — לא');
  r.run(`closeLedgerMonth('2026-10-31')`);
  assert.match(r.node('confirmMsg').textContent, /המאזן ימשיך מ-.*2 פריטים פתוחים ייצאו/);
  assert.equal(r.context.testWrites.length, 0, 'כלום לפני האישור');
  await ok(r);
  const w = r.context.testWrites.at(-1);
  assert.deepEqual([w.op, w.mode, w.day, w.expect], ['ledger-close', 'close', '2026-10-31', '']);
  assert.deepEqual([cfg(r).ledgerClosedThrough, cfg(r).ledgerClosedHistory], ['2026-10-31', []]);
  assert.equal(r.run('ledgerClosedThrough'), '2026-10-31');
  assert.equal(r.run('currentLedger().start'), '2026-11-01');
  assert.equal(r.run('currentLedger().count'), 0, 'הפריטים של אוקטובר יצאו מהמאזן');
  assert.deepEqual(r.month('2026-10-01', '2026-10-31'), octBefore, 'המרכזת של אוקטובר — עם הניירות שלו, כמו שהושוותה');
  assert.match(box('2026-10-01'), /נסגר מול החשבונית ✓[\s\S]*data-role="rc-month-reopen" data-day="2026-10-31"/);
  // הקליטה של 4.10 שהניירות סגרו — נשארת סגורה אחרי סגירת החודש (הסטטוס מהמאזן המלא)
  assert.equal(r.run(`receiptOpenNow(receipts.find(x => (x.docDate || x.date) === '2026-10-04'))`), false);
  r.run(`setView('ledger')`);
  assert.match(r.node('app').innerHTML, /עד 31\.10 נסגר מול החשבונית/);
  // פתיחה מחדש
  r.run(`reopenLedgerMonth('2026-10-31')`);
  await ok(r);
  assert.equal(cfg(r).ledgerClosedThrough, '');
  assert.equal(r.run('ledgerClosedThrough'), '');
  assert.equal(r.run('currentLedger().count'), 2, 'הפריטים חזרו');
});

test('סגירות אחת אחרי השנייה, ופתיחה מחדש חוזרת לאחרונה שלפניה — גם כמה פעמים', async () => {
  const r = withConfig(app([], { today: '2026-12-02' }), { ledgerClosedThrough: '2026-09-30' });
  r.run(`ledgerClosedThrough = '2026-09-30';`);
  const step = async code => { r.run(code); await ok(r); };
  await step(`closeLedgerMonth('2026-10-31')`);
  await step(`closeLedgerMonth('2026-11-30')`);
  assert.deepEqual([cfg(r).ledgerClosedThrough, cfg(r).ledgerClosedHistory], ['2026-11-30', ['2026-09-30', '2026-10-31']]);
  await step(`reopenLedgerMonth('2026-11-30')`);
  assert.equal(r.run('ledgerClosedThrough'), '2026-10-31');
  assert.match(r.run(`monthCloseHtml(receiptRangeData('2026-10-01', '2026-10-31'))`), /data-role="rc-month-reopen"/);
  await step(`reopenLedgerMonth('2026-10-31')`);
  assert.deepEqual([cfg(r).ledgerClosedThrough, cfg(r).ledgerClosedHistory], ['2026-09-30', []], 'ספטמבר נשאר סגור');
});

test('סגירה ישנה (טלפון אחר כבר סגר חודש מאוחר יותר) לא כותבת אחורה; ניסיון חוזר של סגירה שנשמרה — בלי כתיבה', async () => {
  const r = withConfig(app([], { today: '2026-12-02' }));
  r.run(`closeLedgerMonth('2026-09-30')`); // הכפתור של ספטמבר על המסך, כשעוד לא נסגר כלום
  r.context.testCfg = { ledgerClosedThrough: '2026-10-31', ledgerClosedHistory: [] }; // בינתיים טלפון אחר סגר את אוקטובר
  await ok(r);
  assert.equal(r.context.testWrites.at(-1).stale, 'stale-ledger-close');
  assert.equal(cfg(r).ledgerClosedThrough, '2026-10-31', 'אוקטובר נשאר סגור');
  // אותה פעולה שוב מהתור אחרי שנשמרה (התשובה אבדה) — הצלחה, בלי שינוי
  r.context.testCfg = { ledgerClosedThrough: '2026-11-30', ledgerClosedHistory: ['2026-10-31'] };
  await r.run(`executeLedgerCloseTask({ op: 'ledger-close', mode: 'close', day: '2026-11-30', expect: '2026-10-31', at: 1 })`);
  assert.deepEqual(cfg(r).ledgerClosedHistory, ['2026-10-31']);
  // פתיחה מחדש של חודש שכבר לא הסגירה הנוכחית — נדחית
  r.run(`ledgerClosedThrough = '2026-10-31'; reopenLedgerMonth('2026-10-31')`);
  await ok(r);
  assert.equal(r.context.testWrites.at(-1).stale, 'stale-ledger-close');
  assert.equal(cfg(r).ledgerClosedThrough, '2026-11-30');
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

// ===== מה שהסקירה מצאה — כל מקרה עם נייר שתואם בדיוק למה שנרשם: המרכזת לא משתנה =====
const nm = c => (L.products.find(p => p.id === 'code_' + c) || {}).name || c;
const line = (c, qty, extra = {}) => ({ productId: 'code_' + c, code: c, name: nm(c), barcode: '', qty, ...extra });
const credit344 = r => r.month('2026-10-01', '2026-10-31').r344;

test('קישור זיכוי להחזרה קודמת (v87) + נייר ראשי שתואם — לא נספר פעמיים', () => {
  const R1 = { id: 'ret_a', date: '2026-10-01', credited: true, creditStatus: 'open', timestamp: 1, items: [line('344', 3, { noteQty: 2 })] };
  const R2 = { id: 'ret_b', date: '2026-10-03', credited: true, creditStatus: 'ok', timestamp: 2, items: [line('344', 2), line('101', 4)],
    creditAllocations: [{ id: 'l1', targetType: 'return', returnId: 'ret_a', items: [{ productId: 'code_344', code: '344', name: nm('344'), qty: 1 }] }] };
  const before = app([], { receipts: [], returns: [R1, R2] });
  const paper = { ...creditPaper('290099010', [['344', 3], ['101', 4]]), docDay: '2026-10-03', forReturnId: 'ret_b' };
  const after = app([paper], { receipts: [], returns: [R1, R2] });
  assert.equal(credit344(before).credited, 5);
  assert.deepEqual(credit344(after), credit344(before));
  assert.equal(after.run('fullLedger().docViews.ret_b.main'), true, 'הנייר — הראשי של ההחזרה');
});

test('זיכוי ששויך מההחזרה לחוסר בקליטה (v66/v123) + הנייר של ההחזרה — לא נספר פעמיים', () => {
  const split = (rcId, day) => [{ id: 'sp1', at: 1, receiptId: rcId, receiptDate: day, items: [{ productId: 'code_344', name: nm('344'), qty: 2 }], source: 'shortage-credit' }];
  const RC = (day) => ({ id: 'rc_s', date: day, timestamp: 1, items: [line('344', 3, { noteQty: 5 })],
    shortCreditUnits: [{ id: 'sp1', productId: 'code_344', name: nm('344'), qty: 2, fromReturnsId: 'ret_s', at: 1 }] });
  // א: 344 גם בהחזרה — הנייר מראה 4 (2 שהוחזרו + 2 לחוסר)
  const Ra = { id: 'ret_s', date: '2026-10-10', credited: true, creditStatus: 'ok', timestamp: 2, items: [line('344', 2), line('101', 4)], creditAllocations: split('rc_s', '2026-10-08') };
  const pa = { ...creditPaper('290099011', [['344', 4], ['101', 4]]), docDay: '2026-10-10', forReturnId: 'ret_s' };
  const a0 = app([], { receipts: [RC('2026-10-08')], returns: [Ra] }), a1 = app([pa], { receipts: [RC('2026-10-08')], returns: [Ra] });
  assert.equal(credit344(a0).credited, 4);
  assert.deepEqual(credit344(a1), credit344(a0));
  assert.equal(a1.run(`fullLedger().items.filter(i => i.state === 'problem' || i.state === 'question').length`), 0, 'ובמאזן — בלי "זוכה ולא הוחזר"');
  // ב: 344 לא בהחזרה, והקליטה רחוקה מהנייר (1.10 מול 10.10) — השורה הולכת לקליטה ששויכה, לא "בלי שיוך"
  const Rb = { ...Ra, items: [line('101', 4)], creditAllocations: split('rc_s', '2026-10-01') };
  const pb = { ...creditPaper('290099012', [['344', 2], ['101', 4]]), docDay: '2026-10-10', forReturnId: 'ret_s' };
  const b0 = app([], { receipts: [RC('2026-10-01')], returns: [Rb] }), b1 = app([pb], { receipts: [RC('2026-10-01')], returns: [Rb] });
  assert.equal(credit344(b0).credited, 2);
  assert.deepEqual(credit344(b1), credit344(b0));
});

test('נייר חיוב מ-1.10 על עודף בקליטה של 30.9 — נספר באוקטובר (כמו בחשבונית), ספטמבר לא משתנה', () => {
  const RC = { id: 'rc_e', date: '2026-09-30', timestamp: 1, items: [line('344', 7, { noteQty: 5 })] };
  const charge = { ...creditPaper('290099013', [['344', 2]]), kind: 'charge', docDay: '2026-10-01' };
  const r0 = app([], { receipts: [RC], returns: [] }), r1 = app([charge], { receipts: [RC], returns: [] });
  assert.deepEqual(r1.month('2026-09-01', '2026-09-30'), r0.month('2026-09-01', '2026-09-30'));
  assert.equal(r1.month('2026-10-01', '2026-10-31').r344.billed, 2);
  assert.equal(r1.run(`fullLedger().placed[0].attach.rowTargets[0].id`), 'rc_e', 'במאזן — על העודף של 30.9');
});

test('החזרה שנייר סגר נשארת סגורה אחרי סגירת החודש; בלי "החזר לרשימה", "מזג" ו"שלח שוב"', async () => {
  const R = ret('ret_t1', [['101', 2], ['344', 1]]);
  const r = withConfig(app([creditPaper('290099001', [['101', 2], ['344', 1]])], { receipts: [], returns: [R, ret('ret_t2', [['238', 1]]), ret('ret_t3', [['233', 1]])], today: '2026-11-03' }));
  const card = () => r.run(`returnCardInReceipts(returns[0])`);
  assert.doesNotMatch(card(), /data-role="ret-unsend"|data-role="ret-merge"|data-role="ret-resend"/);
  assert.match(r.run(`returnCardInReceipts(returns[1])`), /data-role="ret-unsend"[\s\S]*data-role="ret-merge"/, 'החזרה פתוחה — כמו קודם');
  r.run(`openReturnUnsendConfirm('ret_t1')`);
  assert.ok(r.toasts.some(t => /כבר זיכה את התעודה הזאת בנייר/.test(t)));
  assert.match(r.run('pendingReturnsBannerHtml()'), /יש 2 תעודות חזרות/, 'רק שתי הפתוחות');
  r.run(`closeLedgerMonth('2026-10-31')`); await ok(r);
  assert.equal(r.run('ledgerClosedThrough'), '2026-10-31');
  assert.equal(r.run(`returnStateNow(returns[0])`), 'done');
  assert.match(r.run('retVerifyRowHtml(returns[0])'), /ההחזרה זוכתה\. אין מה לעשות/);
  assert.match(r.run('pendingReturnsBannerHtml()'), /יש 2 תעודות חזרות/, 'לא חוזרת לבאנר');
});

test('"הכל זוכה במלואו" כשהוזנו גם מוצרים שזוכו בלי שהוחזרו — מסמן את השורות, לא מאשר בלי לשמור אותם', async () => {
  const r = app([], { receipts: [], returns: [ret('ret_x', [['101', 2], ['344', 1]])] });
  await r.click('rv-verify-inline', 'ret_x');
  r.run(`rvExtraAdd('code_238')`);
  await r.click('rv-all-credited');
  assert.equal(r.run('currentView'), 'returnReconcile', 'נשארים במסך');
  assert.equal(r.run('returnVerify.items.every(l => l.checked && l.noteQty === l.qty)'), true);
  assert.equal(r.run('returnVerify.extra.length'), 1, 'המוצר הנוסף נשאר לשמירה');
  assert.ok(r.toasts.some(t => /שמור אימות/.test(t)));
  assert.equal(r.context.testWrites.length, 0);
});
