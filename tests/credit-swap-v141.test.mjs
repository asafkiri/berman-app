// v141 — חוסר ועודף בזיכוי של החזרה, בתצוגה ברורה; החלפה גם כשהמוצר שזוכה במקום כן הוחזר.
// כל ההחזרות, הניירות והקליטות כאן מומצאים (מוצרי הקטלוג מ-tests/ledger-2026-10.json); הגיבוי של המשתמש אינו במאגר.
// מה שנבדק, על האפליקציה כולה (המאזן, ההתראות, כרטיס ההחזרה בהיסטוריה והמרכזת):
// - ברמן זיכתה חלה מרובעת ×3 כשהוחזרו חלה מרובעת ×1 וחלה קלועה ×2: זו החלפה (לא "עודף" ו"חסר" נפרדים);
//   באותו מחיר — נסגרת לבד ("לידיעה"); במחיר שונה — לטיפול, עם "מקבל את ההחלפה" שסוגר.
// - חוסר חלקי בתעודת הזיכוי — חוסר מיד, בהתראה העליונה, "חסר זיכוי על …" עם כמה הוחזר וכמה זוכה.
// - עודף אמיתי — "עודף זיכוי על … (החזרת 1, זוכו 3)". כשהכמויות לא מתאימות בדיוק — לא מנחשים החלפה, ושני הצדדים גלויים.
// - החזרה בלי תעודת זיכוי — "ממתינה" (בכתום) עד 4 ביקורים של הנהג, ואז חוסר.
// - כרטיס ההחזרה: לכל מוצר "זוכה N · חסר / עודף / במקומו זוכה …"; המרכזת: "הוחלף" ולא "חסר שטרם זוכה".
// - שום תעודה שמורה לא נכתבת.
// הרצה: TZ=Asia/Jerusalem node --test tests/credit-swap-v141.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runtime, fixture } from './receipt-scan-harness.mjs';

const L = JSON.parse(fs.readFileSync(new URL('./ledger-2026-10.json', import.meta.url), 'utf8'));
const strip = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&#039;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const name = code => (L.products.find(p => p.id === 'code_' + code) || {}).name || code;

function app(papersList, { receipts = [], returns = [], today = '2026-10-05' } = {}) {
  const r = runtime({ data: { ...fixture(), products: structuredClone(L.products) } });
  r.context.testL = { receipts, returns, papers: papersList };
  r.context.testWrites = [];
  r.run(`receipts = testL.receipts; returns = testL.returns; papers = testL.papers; todayStr = () => '${today}';
    runCloudTask = async (label, task) => { testWrites.push(task); return true; }; runCloudTaskSilent = runCloudTask; ledgerInvalidate();`);
  r.j = expr => JSON.parse(r.run('JSON.stringify(' + expr + ')'));
  r.items = () => r.j(`currentLedger().items.map(i => ({ id: i.id, kind: i.kind, state: i.state, key: i.key || null, units: i.units, swap: i.swap ? { a: i.swap.a, b: i.swap.b, q: i.swap.q, over: !!i.swap.over, price: i.swap.price } : null, ret: i.swap ? i.swap.returnId : null,
    text: ledgerItemText(i, currentLedger(), ledgerAllPapers(currentLedger())).text, detail: ledgerItemText(i, currentLedger(), ledgerAllPapers(currentLedger())).detail || '' }))`);
  r.open = () => r.items().filter(i => i.state === 'problem' || i.state === 'question');
  r.card = () => { r.run(`currentView = 'receiptsHistory'; receiptHistoryFilter = 'all'; renderReceiptsHistory();`);
    return (r.node('app').innerHTML.split('<details').slice(1).map(c => '<details' + c).find(c => /תעודת חזרות/.test(strip(c))) || ''); };
  r.state = () => r.run('returnStateNow(returns[0])');
  return r;
}
const ret = (id, rows, date = '2026-10-03') => ({ id, date, docDate: date, credited: false, timestamp: Date.parse(date + 'T08:00:00'), sentTo: 'הנהג',
  items: rows.map(([code, qty]) => ({ productId: 'code_' + code, code, name: name(code), barcode: '', qty })) });
const paper = (kind, number, rows, docDay = '2026-10-04') => ({ schema: 1, state: 'accepted', id: 'paper_' + number, kind, number, terminalNumber: number, numerator: number.slice(-5), docDay, printedTime: '10:00',
  timestamp: Date.parse(docDay + 'T10:00:00') + Number(number.slice(-2)),
  rows: rows.map(([code, qty], i) => ({ line: i + 1, itemCode: code, barcode: '', description: code, qty, productId: 'code_' + code, matchedBy: 'code' })),
  anchors: { units: rows.reduce((a, x) => a + x[1], 0), lines: rows.length, source: 'printed' }, proof: { unitsOk: true, linesOk: true } });
const credit = (number, rows, docDay) => paper('credit', number, rows, docDay);
const declared = o => ({ schema: 1, kind: 'declared', state: 'accepted', docDay: '2026-10-05', timestamp: 3, ...o });
const delivery = (id, date) => ({ id, date, docDate: date, timestamp: Date.parse(date + 'T06:00:00'), items: [{ productId: 'code_2381', code: '2381', name: name('2381'), qty: 1, noteQty: 1 }] });

test('אותו מחיר: ברמן זיכתה חלה מרובעת ×3 במקום ×1 + חלה קלועה ×2 — החלפה שנסגרת לבד, בלי "לטיפול"', () => {
  const R = ret('ret_swap_same', [['450', 1], ['451', 2], ['238', 5], ['344', 4]]);
  const r = app([credit('290099101', [['450', 3], ['238', 5], ['344', 4]])], { returns: [R] });
  assert.deepEqual(r.open(), [], 'אין עודף ואין חוסר לטיפול');
  const sw = r.items().find(i => i.kind === 'autoSwap');
  assert.deepEqual([sw.state, sw.key, sw.units, sw.swap], ['info', 'code_451', 2, { a: 'code_451', b: 'code_450', q: 2, over: true, price: 'same' }]);
  assert.equal(sw.text, 'ברמן זיכתה חלה מרובעת ברמן ×2 במקום חלה קלועה ברמן שהחזרת ב-3.10 — אותו מחיר, התקזז. אין מה לבקש');
  assert.ok(!r.items().some(i => i.kind === 'creditedNotReturned' || i.kind === 'returnedNotCredited' || i.kind === 'swap'));
  assert.deepEqual(r.j(`['code_450', 'code_451'].map(k => currentLedger().products[k].net)`), [0, 0]);
  assert.equal(r.state(), 'done');
  assert.equal(r.run('pendingReturnsBannerHtml()'), '', 'בלי "יש תעודת חזרות פתוחה לאימות"');
  assert.deepEqual(r.j('openIssuesList()'), []);
  const card = strip(r.card());
  assert.match(card, /זוכתה — נייר 99101/);
  assert.match(card, /חלה מרובעת ברמן .*זוכה 3 · 2 מהן במקום חלה קלועה ברמן \(אותו מחיר — התקזז\)/);
  assert.match(card, /חלה קלועה ברמן .*זוכה 0 · במקומו זוכה חלה מרובעת ברמן ×2 \(אותו מחיר — התקזז\)/);
  assert.doesNotMatch(card, /חסר זיכוי|עודף זיכוי/);
  // המרכזת נשארת לפי הנייר (בחשבונית זוכה חלה מרובעת ×3), ובשורות המוצר — "הוחלף", לא "חסר שטרם זוכה"
  const adj = r.j(`ledgerMatrixAdjust(paperLedger({ recs: receipts, rets: returns, papers, from: ledgerFrom, asOf: todayStr() }), '2026-10-01', '2026-10-31', papers).map(x => [x.key, x.credit])`);
  assert.deepEqual(adj.filter(x => x[0] === 'code_450' || x[0] === 'code_451'), [['code_450', 3]]);
  const flags = strip(r.run(`(function(){ const d = receiptRangeData('2026-10-01', '2026-10-31'); return ['code_450', 'code_451'].map(k => mtxRowFlags(d.matrix.list.find(x => x.key === k))).join(' | ') + ' | ' + supplierPaymentModeCardsHtml(d); })()`));
  assert.match(flags, /2 יח׳ זוכו במקום חלה קלועה ברמן \(אותו מחיר\) \| הוחלף: במקום 2 יח׳ זוכה חלה מרובעת ברמן \(אותו מחיר\)/);
  assert.doesNotMatch(flags, /שטרם זוכה|מעבר לחיוב|התקבלו מעבר למה שחויב/);
  assert.deepEqual(r.j('testWrites.length'), 0, 'תצוגה בלבד');
});

test('מחיר שונה: אותה החלפה — לטיפול, אומרת למה לא נסגרה; "מקבל את ההחלפה" סוגר רק את ההחזרה שעליה נאמר', () => {
  const R = ret('ret_swap_diff', [['100', 1], ['101', 2], ['238', 5], ['344', 4]]);
  const P = credit('290099102', [['100', 3], ['238', 5], ['344', 4]]);
  const r = app([P], { returns: [R] });
  const open = r.open();
  assert.deepEqual(open.map(i => [i.kind, i.key, i.units]), [['swap', 'code_101', 2]], 'פריט אחד — לא "עודף" ו"חסר" נפרדים');
  assert.deepEqual(open[0].swap, { a: 'code_101', b: 'code_100', q: 2, over: true, price: 'diff' });
  assert.equal(open[0].text, 'ברמן זיכתה לחם אחיד ברמן ×2 במקום אחיד פרוס ברמן שהחזרת ב-3.10');
  assert.match(open[0].detail, /המחיר של שני המוצרים שונה, ולכן זה לא נסגר לבד\. אם הכמות בנייר נקראה לא נכון — פתח ותקן\.$/);
  assert.equal(r.state(), 'open');
  assert.match(r.run('pendingReturnsBannerHtml()'), /bg-rose-600[\s\S]*יש פער בזיכוי בתעודת חזרות[\s\S]*לפרטים ←/);
  const card = strip(r.card());
  assert.match(card, /אחיד פרוס ברמן .*זוכה 0 · חסר 2 · במקומו זוכה לחם אחיד ברמן ×2/);
  assert.match(card, /לחם אחיד ברמן .*זוכה 3 · עודף 2 · 2 מהן במקום אחיד פרוס ברמן/);
  assert.match(card, /חסר זיכוי 2 · עודף זיכוי 2/, 'בשורת הסיכום — שני הצדדים, לא נטו');
  // ההסכמה נשמרת עם ההחזרה; הסכמה שנאמרה על החזרה אחרת — לא חלה
  const pair = { a: 'code_101', b: 'code_100', q: 2 };
  const other = app([P, declared({ id: 'decl_swap_other', declare: 'accept-swap', pair, standsFor: { returnId: 'ret_other' } })], { returns: [R] });
  assert.equal(other.j(`currentLedger().states['decl_swap_other']`), 'superseded');
  assert.equal(other.open().length, 1);
  const ok = app([P, declared({ id: 'decl_swap_ok', declare: 'accept-swap', pair, standsFor: { returnId: R.id } })], { returns: [R] });
  assert.deepEqual(ok.open(), []);
  assert.equal(ok.state(), 'done');
  assert.deepEqual(ok.j(`fullLedger().docViews['${R.id}'].gap`), 0, 'ההסכמה מתקזזת גם מול העודף שעל שורת ההחזרה');
  assert.match(strip(ok.card()), /זוכה 0 · במקומו זוכה לחם אחיד ברמן ×2 \(קיבלת את ההחלפה\)/);
  // הכפתור במסך המאזן כותב את ההסכמה עם הכמות של ההחלפה (העודף בלבד), ופריט "לידיעה" אינו מקבל אותו
  assert.deepEqual(r.j(`ledgerItemText(currentLedger().items.find(i => i.kind === 'swap'), currentLedger(), papers).actions.map(a => a.role)`), ['ledger-accept-swap', 'ledger-paper-open']);
});

test('חוסר חלקי בתעודת הזיכוי — חוסר מיד: בהתראה העליונה, בכרטיס ובבאנר; תעודה נוספת סוגרת', () => {
  const R = ret('ret_short', [['450', 1], ['451', 2], ['238', 5]]);
  const r = app([credit('290099103', [['450', 1], ['238', 5]])], { returns: [R] });
  const open = r.open();
  assert.deepEqual(open.map(i => [i.kind, i.key, i.units, i.state]), [['returnedNotCredited', 'code_451', 2, 'problem']]);
  assert.equal(open[0].text, 'חסר זיכוי על חלה קלועה ברמן ×2 מההחזרה של 3.10 — לבקש זיכוי מהנהג');
  assert.match(open[0].detail, /^חלה קלועה ברמן: הוחזרו 2, זוכו 0\. אם הנהג הביא עוד תעודת זיכוי — צלם אותה בכפתור "צלם נייר מהנהג" למעלה, וזה ייסגר לבד\.$/);
  assert.deepEqual(r.j('openIssuesList().map(x => [x.state, x.text])'), [['problem', open[0].text]], 'החוסר בהתראה העליונה');
  assert.match(strip(r.run('openIssuesBannerContentHtml({})')), /דבר אחד לטיפול מול ברמן.*חסר זיכוי על חלה קלועה ברמן ×2/);
  assert.match(r.run('pendingReturnsBannerHtml()'), /bg-rose-600[\s\S]*יש פער בזיכוי בתעודת חזרות/);
  assert.match(strip(r.run('returnsBalanceBannerHtml()')), /חסר זיכוי על 2 יח׳ בתעודה אחת .*לבקש זיכוי מהנהג; הפירוט בכרטיס ההחזרה/, 'לא "כל מה שהחזרת זוכה"');
  const card = strip(r.card());
  assert.match(card, /לטיפול במאזן/);
  assert.match(card, /חסר זיכוי 2/);
  assert.match(card, /חלה קלועה ברמן .*זוכה 0 · חסר 2/);
  const done = app([credit('290099103', [['450', 1], ['238', 5]]), credit('290099104', [['451', 2]], '2026-10-05')], { returns: [R] });
  assert.deepEqual(done.open(), []);
  assert.equal(done.state(), 'done');
});

test('עודף אמיתי — "עודף זיכוי … (החזרת 1, זוכו 3)"; כמויות שלא מתאימות בדיוק — לא מנחשים החלפה, ושני הצדדים גלויים', () => {
  const R = ret('ret_over', [['450', 1], ['238', 5], ['344', 4]]);
  const r = app([credit('290099105', [['450', 3], ['238', 5], ['344', 4]])], { returns: [R] });
  const open = r.open();
  assert.deepEqual(open.map(i => [i.kind, i.key, i.units]), [['creditedNotReturned', 'code_450', 2]]);
  assert.equal(open[0].text, 'עודף זיכוי על חלה מרובעת ברמן ×2 בהחזרה מ-3.10 (החזרת 1, זוכו 3) — לבדוק שהנייר נקרא נכון');
  assert.match(strip(r.card()), /חלה מרובעת ברמן .*זוכה 3 · עודף 2/);
  // עודף 3 מול חוסר 2 — לא החלפה: החוסר והעודף, כל אחד בשמו, שניהם לטיפול ובהתראה
  const R2 = ret('ret_mismatch', [['450', 1], ['451', 2], ['238', 5]]);
  const m = app([credit('290099106', [['450', 4], ['238', 5]])], { returns: [R2] });
  assert.deepEqual(m.open().map(i => [i.kind, i.key, i.units]).sort(), [['creditedNotReturned', 'code_450', 3], ['returnedNotCredited', 'code_451', 2]]);
  assert.equal(m.j('openIssuesList().length'), 2, 'החוסר גלוי לצד העודף');
  // שני מוצרים חסרים באותה כמות — לא בוחרים אחד באקראי
  const R3 = ret('ret_two', [['450', 1], ['451', 2], ['458', 2], ['238', 5]]);
  const t = app([credit('290099107', [['450', 3], ['238', 5]])], { returns: [R3] });
  assert.ok(!t.items().some(i => i.kind === 'swap' || i.kind === 'autoSwap'));
  assert.deepEqual(t.open().map(i => i.kind).sort(), ['creditedNotReturned', 'returnedNotCredited']);
});

test('מחיר שלא אומת מול חשבונית — לא "אותו מחיר": ההחלפה לטיפול ואומרת למה', () => {
  const R = ret('ret_unknown', [['450', 1], ['451', 2], ['238', 5], ['344', 4]]);
  const r = app([credit('290099108', [['450', 3], ['238', 5], ['344', 4]])], { returns: [R] });
  r.run(`products.find(p => p.id === 'code_451').discountSet = false; ledgerInvalidate();`);
  const open = r.open();
  assert.deepEqual(open.map(i => [i.kind, i.swap && i.swap.price]), [['swap', 'unknown']]);
  assert.match(open[0].detail, /אין מחיר מאומת לאחד המוצרים, ולכן זה לא נסגר לבד/);
});

test('נייר תיקון של ברמן אחרי החלפה שנסגרה לבד — הכל מתקזז, וההחלפה יורדת', () => {
  const R = ret('ret_fixed', [['450', 1], ['451', 2], ['238', 5], ['344', 4]]);
  const fix = [credit('290099109', [['450', 3], ['238', 5], ['344', 4]]), paper('charge', '290099110', [['450', 2]], '2026-10-05'), credit('290099111', [['451', 2]], '2026-10-05')];
  const r = app(fix, { returns: [R] });
  assert.deepEqual(r.open(), []);
  assert.ok(!r.items().some(i => i.kind === 'autoSwap' || i.kind === 'swap'));
  assert.deepEqual(r.j(`['code_450', 'code_451'].map(k => currentLedger().products[k].net)`), [0, 0]);
});

test('החזרה בלי תעודת זיכוי — "ממתינה" בכתום עד 4 ביקורים של הנהג, ואז "חסר זיכוי על ההחזרה"', () => {
  const R = ret('ret_wait', [['450', 1], ['451', 2]]);
  const three = ['2026-10-04', '2026-10-05', '2026-10-06'].map((d, i) => delivery('rc_w' + i, d));
  const w = app([], { returns: [R], receipts: three, today: '2026-10-07' });
  assert.deepEqual(w.open(), []);
  assert.deepEqual(w.items().filter(i => i.kind === 'returnNotCreditedYet').map(i => [i.state, i.text]), [['pending', 'ההחזרה מ-3.10 (2 מוצרים, 3 יח׳) — ממתינה לתעודת זיכוי']]);
  assert.match(w.run('pendingReturnsBannerHtml()'), /bg-amber-400[\s\S]*יש תעודת חזרות פתוחה לאימות/, 'ממתינה — בכתום, לא באדום');
  const four = three.concat([delivery('rc_w3', '2026-10-07')]);
  const l = app([], { returns: [R], receipts: four, today: '2026-10-07' });
  const open = l.open();
  assert.deepEqual(open.map(i => [i.kind, i.state]), [['returnNotCreditedYet', 'problem']]);
  assert.equal(open[0].text, 'חסר זיכוי על ההחזרה מ-3.10 (2 מוצרים, 3 יח׳) — לא הגיעה תעודת זיכוי. לבקש זיכוי מהנהג');
});

// ===== מהסקירה של v141 =====
test('סקירה: נייר מחודש אחר — ההחלפה שנסגרה לבד לא מזיזה זיכוי בין חודשים; "הוחלף" רק בחודש שבו הפער נראה', () => {
  const R = { ...ret('ret_month', [['450', 1], ['451', 2], ['238', 5], ['344', 4]], '2026-09-29'), credited: true, creditStatus: 'closed' };
  const r = app([credit('290099120', [['450', 3], ['238', 5], ['344', 4]], '2026-10-01')], { returns: [R] });
  assert.ok(r.items().some(i => i.kind === 'autoSwap'));
  const adj = r.j(`ledgerMatrixAdjust(paperLedger({ recs: receipts, rets: returns, papers, from: ledgerFrom, asOf: todayStr() }), '2026-09-01', '2026-10-31', papers).filter(x => x.key === 'code_451').map(x => x.day)`);
  assert.ok(adj.every(d => d === '2026-09-29'), 'מה שחסר בחלה קלועה נשאר ביום ההחזרה: ' + adj.join(','));
  const flags = m => strip(r.run(`(function(){ const d = receiptRangeData('${m}-01', '${m}-30'); return ['code_450', 'code_451'].map(k => { const x = d.matrix.list.find(z => z.key === k); return k + ':' + (x ? mtxRowFlags(x) : '-'); }).join(' | '); })()`));
  assert.match(flags('2026-09'), /code_450: \| code_451: הוחלף: במקום 2 יח׳ זוכה חלה מרובעת ברמן \(אותו מחיר\)/);
  assert.match(flags('2026-10'), /code_450: 2 יח׳ זוכו במקום חלה קלועה ברמן \(אותו מחיר\)/);
});

test('סקירה: עודף 2 מול חוסר 5 — לא החלפה (רק כמות זהה בדיוק); שני הצדדים לטיפול, והפירוט מסכם לכותרת', () => {
  const R = ret('ret_inexact', [['450', 1], ['451', 5], ['238', 5], ['344', 4]]);
  const r = app([credit('290099121', [['450', 3], ['238', 5], ['344', 4]])], { returns: [R] });
  assert.ok(!r.items().some(i => i.kind === 'swap' || i.kind === 'autoSwap'));
  assert.deepEqual(r.open().map(i => [i.kind, i.key, i.units]).sort(), [['creditedNotReturned', 'code_450', 2], ['returnedNotCredited', 'code_451', 5]]);
  // חוסר שחלקו התקזז מול עודף בקליטה — הפירוט אומר את זה (ולא "הוחזרו 2, זוכו 0" מול ×1)
  const R2 = ret('ret_net', [['450', 1], ['451', 2], ['238', 5]]);
  const rc = { id: 'rc_sur', date: '2026-10-02', docDate: '2026-10-02', timestamp: Date.parse('2026-10-02T06:00:00'), items: [{ productId: 'code_451', code: '451', name: name('451'), qty: 4, noteQty: 3 }] };
  const n = app([credit('290099122', [['450', 1], ['238', 5]])], { returns: [R2], receipts: [rc] });
  const it = n.open().find(i => i.kind === 'returnedNotCredited');
  assert.equal(it.units, 1);
  assert.match(it.detail, /^חלה קלועה ברמן: הוחזרו 2, זוכו 0, 1 התקזזו מול תעודה אחרת\./);
});

test('סקירה: חודש שנסגר — המאזן החי והמלא מסכימים: חוסר בקליטה שלפני הסגירה חוסם החלפה, החוסר האמיתי גלוי', () => {
  const rc = { id: 'rc_closed', date: '2026-09-29', docDate: '2026-09-29', timestamp: Date.parse('2026-09-29T06:00:00'), items: [{ productId: 'code_450', code: '450', name: name('450'), qty: 1, noteQty: 3 }] };
  const R = ret('ret_after_close', [['450', 1], ['451', 2], ['238', 5], ['344', 4]], '2026-10-01');
  const r = app([credit('290099123', [['450', 3], ['238', 5], ['344', 4]], '2026-10-02')], { returns: [R], receipts: [rc] });
  r.run(`ledgerClosedThrough = '2026-09-30'; ledgerInvalidate();`);
  assert.deepEqual(r.j('currentLedger().swaps.length'), 0);
  assert.deepEqual(r.j('fullLedger().swaps.length'), 0);
  assert.ok(r.j(`openIssuesList().map(x => x.text)`).some(t => /^חסר זיכוי על חלה קלועה ברמן ×2/.test(t)), 'החוסר בחלה קלועה לא "התקזז"');
});

test('סקירה: חלק שני של זיכוי מפוצל צולם ועוד לא נספר (ממתין לבחירה / לבדיקה) — לא "לבקש זיכוי מהנהג"', () => {
  const R1 = ret('ret_a', [['450', 2], ['238', 3], ['344', 1]], '2026-10-01');
  const R2 = ret('ret_b', [['450', 2], ['100', 5]], '2026-10-02');
  const r = app([credit('290099131', [['238', 3], ['344', 1]]), credit('290099132', [['450', 2]])], { returns: [R1, R2] });
  const w = r.items().find(i => i.kind === 'returnedNotCredited');
  assert.deepEqual([w.state, w.text], ['pending', 'חסר זיכוי על חלה מרובעת ברמן ×2 מההחזרה של 1.10 — ממתין לנייר זיכוי שצילמת ועוד לא נספר']);
  assert.ok(!r.j('openIssuesList()').some(x => /לבקש זיכוי מהנהג/.test(x.text)));
  const R = ret('ret_s', [['450', 1], ['451', 2], ['238', 5]]);
  const u = app([credit('290099133', [['450', 1], ['238', 5]]), { ...credit('290099134', [['451', 2]]), state: 'review' }], { returns: [R] });
  assert.deepEqual(u.items().filter(i => i.kind === 'returnedNotCredited').map(i => i.state), ['pending'], 'נייר שלא נקרא עד הסוף — ממתין לו');
});

test('סקירה: כרטיס הנייר הראשי שחסרה בו שורה — לא "תואם לנייר"; בהיסטוריה "לטיפול במאזן"', () => {
  const R = ret('ret_card', [['450', 1], ['451', 2], ['238', 5]]);
  const P = credit('290099141', [['450', 1], ['238', 5]]);
  const r = app([P], { returns: [R] });
  r.run(`paperIntake = { items: [{ captureId: 'cap1', status: 'saved', paperId: '${P.id}' }], allIn: true, busy: false }; currentView = 'paperIntake'; renderPaperIntake();`);
  const intake = strip(r.node('app').innerHTML.split('paperIntakeList')[1] || '');
  assert.match(intake, /נקרא, ויש פער מול ההחזרה.*חסר זיכוי על חלה קלועה ברמן ×2/);
  assert.doesNotMatch(intake, /תואם לנייר/);
  r.run(`currentView = 'receiptsHistory'; receiptHistoryFilter = 'all'; renderReceiptsHistory();`);
  const pcard = strip(r.node('app').innerHTML.split('<details').slice(1).find(c => /נייר זיכוי מהנהג/.test(strip(c))) || '');
  assert.match(pcard, /לטיפול במאזן/);
});

test('סקירה: החזרה בלי נייר אחרי 4 ביקורים — פתוחה בכל המסכים; ממתינה (נייר משלים בלבד) — לא "כל מה שהחזרת זוכה"', () => {
  const R = ret('ret_late', [['450', 1], ['451', 2]]);
  const OK = { ...ret('ret_ok', [['238', 2]], '2026-10-02'), credited: true, creditStatus: 'closed' };
  const four = ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'].map((d, i) => delivery('rc_l' + i, d));
  const r = app([], { returns: [R, OK], receipts: four, today: '2026-10-07' });
  assert.equal(r.run(`returnStateNow(returns[0])`), 'open');
  assert.match(r.run('pendingReturnsBannerHtml()'), /bg-rose-600/);
  assert.match(strip(r.run('returnsBalanceBannerHtml()')), /חסר זיכוי על 3 יח׳ בתעודה אחת/);
  assert.match(strip(r.card()), /לטיפול במאזן/);
  // חלק מההחזרה זוכה בנייר משלים והשאר ממתין — אין "כל מה שהחזרת זוכה ✓", ובכרטיס "טרם זוכה" (לא "חסר")
  const S = ret('ret_side', [['450', 1], ['451', 2], ['238', 5], ['344', 4], ['100', 2]]);
  const s = app([credit('290099151', [['450', 1], ['451', 2]])], { returns: [S], receipts: [delivery('rc_s', '2026-10-04')] });
  assert.equal(s.run('returnsBalanceBannerHtml()'), '');
  const card = strip(s.card());
  assert.match(card, /טרם זוכה 11/);
  assert.doesNotMatch(card, /חסר זיכוי/);
});

test('סקירה: זיכוי על מוצר שלא הוחזר, בנייר של ההחזרה — מוצג בכרטיס ונספר כעודף, אבל לא פותח מחדש החזרה שזוכתה (בלי "החזר לרשימה" / "מזג"); "אין עוד" ישן יורד מהתשובות', () => {
  const R = ret('ret_loose', [['450', 1], ['238', 5], ['344', 4]]);
  const r = app([credit('290099161', [['450', 1], ['238', 5], ['344', 4], ['100', 2]])], { returns: [R] });
  assert.equal(r.run(`returnStateNow(returns[0])`), 'done', 'כל השורות שהוחזרו זוכו');
  assert.equal(r.run(`returnStillOpen(returns[0])`), false, 'לא מציעים להחזיר לרשימה או למזג — זה היה תובע שוב זיכוי שניתן');
  assert.deepEqual(r.j('returnsBalance()'), { shortUnits: 0, overUnits: 2, openDocs: 1, n: 1 });
  assert.ok(r.j('openIssuesList()').some(x => /^עודף זיכוי: ברמן זיכתה לחם אחיד ברמן ×2 שלא החזרת/.test(x.text)), 'העודף בהתראה העליונה');
  const card = strip(r.card());
  assert.match(card, /עודף זיכוי: ברמן זיכתה לחם אחיד ברמן ×2 שלא החזרת/);
  assert.match(card, /זוכה גם על מוצרים שלא הוחזרו: לחם אחיד ברמן עודף 2 זוכה 2/);
  assert.doesNotMatch(r.card(), /data-role="ret-unsend"|data-role="ret-resend"/);
  const D = { schema: 1, id: 'decl_done_old', kind: 'declared', declare: 'complete', returnId: 'ret_c', state: 'accepted', docDay: '2026-10-05', timestamp: 3 };
  const c = app([credit('290099162', [['450', 1], ['238', 5]]), D], { returns: [ret('ret_c', [['450', 1], ['451', 2], ['238', 5]])] });
  assert.equal(c.j(`currentLedger().states['decl_done_old']`), 'superseded');
  c.run(`currentView = 'ledger'; renderLedger();`);
  assert.doesNotMatch(strip(c.node('app').innerHTML), /אישרת שאין עוד תעודת זיכוי/);
});

// ===== מהסקירה של v141 (2): כל שומר של סגירה לבד ושל זיהוי ההחלפה — נבדק =====
const SAME = () => ret('ret_g', [['450', 1], ['451', 2], ['238', 5], ['344', 4]]);
const SAME_PAPER = () => credit('290099170', [['450', 3], ['238', 5], ['344', 4]]);
const kinds = r => r.items().filter(i => i.kind === 'swap' || i.kind === 'autoSwap').map(i => i.kind + ':' + (i.swap && i.swap.price));

test('שומרים של "נסגר לבד": נייר זיכוי באותו יום שלא נקרא עד הסוף; פיקדון שונה; מבצע על אחד המוצרים — ההחלפה לטיפול', () => {
  assert.deepEqual(kinds(app([SAME_PAPER()], { returns: [SAME()] })), ['autoSwap:same'], 'בלי ספק — נסגרת לבד');
  const unsure = app([SAME_PAPER(), { ...credit('290099171', [['2381', 1]]), state: 'review' }], { returns: [SAME()] });
  assert.deepEqual(kinds(unsure), ['swap:same'], 'נייר מאותו יום שעוד לא נקרא — לא סוגרים לבד');
  const dep = app([SAME_PAPER()], { returns: [SAME()] });
  dep.run(`products.find(p => p.id === 'code_451').deposit = 0.3; ledgerInvalidate();`);
  assert.deepEqual(kinds(dep), ['swap:diff']);
  const promo = app([SAME_PAPER()], { returns: [SAME()] });
  promo.run(`promos = [{ id: 'pr_t', type: 'receipt', productIds: ['code_450'], pct: 0, fixedPrice: 4, start: '2026-10-04', end: '2026-10-31' }]; ledgerInvalidate();`);
  assert.deepEqual(kinds(promo), ['swap:diff'], 'מבצע מחיר קבוע על חלה מרובעת ביום הנייר — המחיר בחשבונית שונה');
});

test('שומרים של זיהוי ההחלפה: שורה "מפער קודם" של המוצר, חוסר שלו בקליטה סמוכה, החזרה בלי נייר ראשי — אין החלפה, שני הצדדים גלויים', () => {
  const carried = SAME(); carried.items.push({ productId: 'carry_450', code: '450', name: name('450'), barcode: '', qty: 2, carried: true });
  const c = app([SAME_PAPER()], { returns: [carried] });
  assert.deepEqual(kinds(c), []);
  const rc = { id: 'rc_short450', date: '2026-10-04', docDate: '2026-10-04', timestamp: Date.parse('2026-10-04T06:00:00'), items: [{ productId: 'code_450', code: '450', name: name('450'), qty: 1, noteQty: 2 }] };
  // חוסר 1 בקליטה סמוכה: בלי השומר, המאזן של המוצר עדיין בעודף (1−2) והיה מניח החלפה ומסתיר את החוסר בחלה קלועה
  const s = app([SAME_PAPER()], { returns: [SAME()], receipts: [rc] });
  assert.deepEqual(kinds(s), []);
  assert.ok(s.open().some(i => i.kind === 'returnedNotCredited' && i.key === 'code_451'), 'חלה קלועה — עדיין חסרה');
  const big = ret('ret_side_only', [['450', 1], ['451', 2], ['238', 5], ['344', 4], ['2381', 3]]);
  const side = app([credit('290099172', [['450', 3], ['238', 5]])], { returns: [big] });
  assert.equal(side.j(`currentLedger().placed[0].attach.role`), 'side');
  assert.deepEqual(kinds(side), [], 'בלי נייר ראשי — לא מניחים החלפה');
});

test('אותה החלפה בשתי החזרות — כל אחת החלפה משלה (לא מבטלות זו את זו); הסכמה על אחת לא חלה על השנייה', () => {
  const R1 = ret('ret_two_a', [['450', 1], ['451', 2], ['238', 5], ['344', 4]], '2026-10-01');
  const R2 = ret('ret_two_b', [['450', 1], ['451', 2], ['1231', 5], ['220', 4]], '2026-10-03');
  const P1 = credit('290099181', [['450', 3], ['238', 5], ['344', 4]], '2026-10-02'), P2 = credit('290099182', [['450', 3], ['1231', 5], ['220', 4]], '2026-10-04');
  const same = app([P1, P2], { returns: [R1, R2] });
  assert.deepEqual(same.open(), []);
  assert.deepEqual(same.items().filter(i => i.kind === 'autoSwap').map(i => i.swap && i.units), [2, 2]);
  const D1 = ret('ret_two_c', [['100', 1], ['101', 2], ['238', 5], ['344', 4]], '2026-10-01');
  const D2 = ret('ret_two_d', [['100', 1], ['101', 2], ['1231', 5], ['220', 4]], '2026-10-03');
  const Q1 = credit('290099183', [['100', 3], ['238', 5], ['344', 4]], '2026-10-02'), Q2 = credit('290099184', [['100', 3], ['1231', 5], ['220', 4]], '2026-10-04');
  const two = app([Q1, Q2], { returns: [D1, D2] });
  assert.deepEqual(two.open().map(i => [i.kind, i.units]), [['swap', 2], ['swap', 2]], 'שתי החלפות פתוחות, כל אחת בפריט משלה');
  const acc = app([Q1, Q2, declared({ id: 'decl_swap_c', declare: 'accept-swap', swapPair: { a: 'code_101', b: 'code_100', q: 2 }, standsFor: { returnId: D1.id } })], { returns: [D1, D2] });
  assert.equal(acc.j(`currentLedger().states['decl_swap_c']`), 'counted');
  assert.deepEqual(acc.open().map(i => [i.kind, i.ret]), [['swap', D2.id]], 'רק ההחזרה שעליה הסכמת נסגרה');
});

test('מעבר גרסה: הסכמה של החלפה על מוצר שהוחזר נשמרת ב-swapPair (גרסה 140 לא תחיל אותה על החלפה אחרת); הסכמה מגרסה 140 (pair) — חלה פעם אחת', async () => {
  const R = ret('ret_ver', [['100', 1], ['101', 2], ['238', 5], ['344', 4]]);
  const r = app([credit('290099191', [['100', 3], ['238', 5], ['344', 4]])], { returns: [R] });
  r.context.testDecl = [];
  r.run(`saveLedgerDeclaration = async (id, body) => { testDecl.push([id, body]); };`);
  const id = r.j(`currentLedger().items.find(i => i.kind === 'swap').id`);
  await r.run(`ledgerAnswer('ledger-accept-swap', ${JSON.stringify(id)})`);
  const [[, body]] = r.j('testDecl');
  assert.deepEqual([body.declare, body.swapPair, body.pair, body.standsFor], ['accept-swap', { a: 'code_101', b: 'code_100', q: 2 }, undefined, { returnId: R.id }]);
  // גרסה 140 שמרה pair גם על החלפה רגילה (מוצר שלא הוחזר) באותו מחיר — v141 מחיל אותה פעם אחת ולא סוגר לבד בנוסף
  const L1 = ret('ret_v140', [['450', 2], ['238', 5], ['344', 4]]);
  const lp = credit('290099192', [['451', 2], ['238', 5], ['344', 4]]);
  const old = declared({ id: 'decl_swap_v140', declare: 'accept-swap', pair: { a: 'code_450', b: 'code_451', q: 2 }, standsFor: { returnId: L1.id }, writtenBy: '140' });
  const v = app([lp, old], { returns: [L1] });
  assert.equal(v.j(`currentLedger().states['decl_swap_v140']`), 'counted');
  assert.deepEqual(v.open(), []);
  assert.ok(!v.items().some(i => i.kind === 'autoSwap'), 'ההסכמה חלה — בלי סגירה לבד כפולה');
  assert.deepEqual(v.j(`['code_450', 'code_451'].map(k => currentLedger().products[k].net)`), [0, 0]);
});

// ===== מהסקירה של v141 (סבב 2) =====
// סכום הפריטים שמוצגים לכל מוצר שווה למאזן שלו: החלפה פתוחה מסבירה בדיוק את החלק שלה, וכל השאר מוצג
const accounting = r => r.j(`(function(){ const lg = currentLedger(), out = {};
  lg.items.forEach(i => {
    const add = (k, u) => { out[k] = Math.round(((out[k] || 0) + u) * 1000) / 1000; };
    if (i.kind === 'swap') { add(i.swap.a, i.units); add(i.swap.b, -i.units); return; }
    if (!i.part || ['netted', 'autoSwap', 'autoCorrection'].indexOf(i.kind) !== -1) return;
    const sign = ['chargedNotReceived', 'chargedTwice', 'returnedNotCredited', 'returnNotCreditedYet', 'paperChargeNotReceived'].indexOf(i.kind) !== -1 ? 1 : -1;
    (i.keys || [{ key: i.key, units: i.units }]).forEach(z => add(z.key, sign * z.units));
  });
  return Object.keys(lg.products).filter(k => lg.products[k].net || out[k]).map(k => [k, lg.products[k].net, out[k] || 0]); })()`);

test('סבב 2: שתי החלפות שבהן אותו מוצר זוכה במקום (בהחזרות שונות) לא מסתירות חוסר אמיתי שלו בהחזרה שלישית', () => {
  const R1 = ret('ret_m1', [['450', 1], ['101', 2], ['238', 5], ['344', 4]], '2026-10-01');
  const R2 = ret('ret_m2', [['450', 1], ['451', 2], ['1231', 5], ['220', 4]], '2026-10-02');
  const R3 = ret('ret_m3', [['450', 5], ['2381', 3], ['458', 2]], '2026-10-04');
  const r = app([credit('290099311', [['450', 3], ['238', 5], ['344', 4]], '2026-10-02'), credit('290099312', [['450', 3], ['1231', 5], ['220', 4]], '2026-10-03'),
    credit('290099313', [['450', 2], ['2381', 3], ['458', 2]], '2026-10-05')], { returns: [R1, R2, R3], today: '2026-10-06' });
  accounting(r).forEach(([k, net, shown]) => assert.equal(shown, net, 'מוצג מול המאזן: ' + k));
  assert.ok(r.open().some(i => i.kind === 'returnedNotCredited' && i.key === 'code_450' && i.units === 3), 'החוסר של 3 חלה מרובעת בהחזרה השלישית גלוי');
  assert.equal(r.run(`returnStateNow(returns[2])`), 'open');
});

test('סבב 2: החלפה שנייה על אותו מוצר — יש לה פריט משלה, והעודף שלה לא נבלע (גם כשהמאזן של המוצר שהוחזר מתאפס)', () => {
  const R1 = ret('ret_n1', [['100', 1], ['101', 2], ['238', 5], ['344', 4]], '2026-10-01');
  const R2 = ret('ret_n2', [['100', 1], ['101', 2], ['1231', 5], ['220', 4]], '2026-10-03');
  const R3 = ret('ret_n3', [['101', 1], ['458', 2]], '2026-10-04');
  const r = app([credit('290099301', [['100', 3], ['238', 5], ['344', 4]], '2026-10-02'), credit('290099302', [['100', 3], ['1231', 5], ['220', 4]], '2026-10-04'),
    credit('290099303', [['101', 3], ['458', 2]], '2026-10-05')], { returns: [R1, R2, R3], today: '2026-10-06' });
  accounting(r).forEach(([k, net, shown]) => assert.equal(shown, net, 'מוצג מול המאזן: ' + k));
  assert.deepEqual(r.open().filter(i => i.kind === 'swap').map(i => i.ret).sort(), [R1.id, R2.id]);
  assert.equal(r.run(`returnStateNow(returns[1])`), 'open', 'ההחזרה השנייה לא "צולם ומתאים"');
});

test('סבב 2: החזרה שזוכתה ויש לה זיכוי על מוצר שלא הוחזר — בלי "אין מה לעשות" ובלי "מוסבר במאזן"; נייר ששויך ידנית וכל שורותיו לא בה — העודף בכרטיס ובמאזן הזיכויים', () => {
  const R = ret('ret_ex', [['450', 1], ['238', 5], ['344', 4]]);
  const r = app([credit('290099401', [['450', 1], ['238', 5], ['344', 4], ['100', 2]])], { returns: [R] });
  const card = strip(r.card());
  assert.match(card, /זיכה את כל מה שהוחזר — וגם מוצר שלא הוחזר\. בדוק את הנייר במאזן/);
  assert.match(card, /במאזן: 1 לטיפול/);
  assert.doesNotMatch(card, /אין מה לעשות|מוסבר במאזן/);
  const V = { ...ret('ret_ver_ex', [['450', 2], ['238', 5]]), credited: true, creditStatus: 'closed' };
  const P = credit('290099601', [['100', 2]]);
  const u = app([{ ...P, attach: { by: 'user', type: 'return', id: V.id, role: 'side', rowTargets: [{ line: 0, type: null, id: null }] } }], { returns: [V] });
  assert.ok(u.j(`ledgerDocStatus('${V.id}') !== null`));
  assert.match(strip(u.card()), /עודף זיכוי: ברמן זיכתה לחם אחיד ברמן ×2 שלא החזרת/);
  assert.match(strip(u.run('returnsBalanceBannerHtml()')), /זוכו 2 יח׳ יותר ממה שהחזרת/);
});
