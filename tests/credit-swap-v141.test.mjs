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
  r.items = () => r.j(`currentLedger().items.map(i => ({ id: i.id, kind: i.kind, state: i.state, key: i.key || null, units: i.units, swap: i.swap ? { a: i.swap.a, b: i.swap.b, q: i.swap.q, over: !!i.swap.over, price: i.swap.price } : null,
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
  const R = ret('ret_swap_same', [['450', 1], ['451', 2], ['238', 6], ['344', 3]]);
  const r = app([credit('290099101', [['450', 3], ['238', 6], ['344', 3]])], { returns: [R] });
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
  const R = ret('ret_swap_diff', [['100', 1], ['101', 2], ['238', 6], ['344', 3]]);
  const P = credit('290099102', [['100', 3], ['238', 6], ['344', 3]]);
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
  const R = ret('ret_short', [['450', 1], ['451', 2], ['238', 6]]);
  const r = app([credit('290099103', [['450', 1], ['238', 6]])], { returns: [R] });
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
  const done = app([credit('290099103', [['450', 1], ['238', 6]]), credit('290099104', [['451', 2]], '2026-10-05')], { returns: [R] });
  assert.deepEqual(done.open(), []);
  assert.equal(done.state(), 'done');
});

test('עודף אמיתי — "עודף זיכוי … (החזרת 1, זוכו 3)"; כמויות שלא מתאימות בדיוק — לא מנחשים החלפה, ושני הצדדים גלויים', () => {
  const R = ret('ret_over', [['450', 1], ['238', 6], ['344', 3]]);
  const r = app([credit('290099105', [['450', 3], ['238', 6], ['344', 3]])], { returns: [R] });
  const open = r.open();
  assert.deepEqual(open.map(i => [i.kind, i.key, i.units]), [['creditedNotReturned', 'code_450', 2]]);
  assert.equal(open[0].text, 'עודף זיכוי על חלה מרובעת ברמן ×2 בהחזרה מ-3.10 (החזרת 1, זוכו 3) — לבדוק שהנייר נקרא נכון');
  assert.match(strip(r.card()), /חלה מרובעת ברמן .*זוכה 3 · עודף 2/);
  // עודף 3 מול חוסר 2 — לא החלפה: החוסר והעודף, כל אחד בשמו, שניהם לטיפול ובהתראה
  const R2 = ret('ret_mismatch', [['450', 1], ['451', 2], ['238', 6]]);
  const m = app([credit('290099106', [['450', 4], ['238', 6]])], { returns: [R2] });
  assert.deepEqual(m.open().map(i => [i.kind, i.key, i.units]).sort(), [['creditedNotReturned', 'code_450', 3], ['returnedNotCredited', 'code_451', 2]]);
  assert.equal(m.j('openIssuesList().length'), 2, 'החוסר גלוי לצד העודף');
  // שני מוצרים חסרים באותה כמות — לא בוחרים אחד באקראי
  const R3 = ret('ret_two', [['450', 1], ['451', 2], ['458', 2], ['238', 6]]);
  const t = app([credit('290099107', [['450', 3], ['238', 6]])], { returns: [R3] });
  assert.ok(!t.items().some(i => i.kind === 'swap' || i.kind === 'autoSwap'));
  assert.deepEqual(t.open().map(i => i.kind).sort(), ['creditedNotReturned', 'returnedNotCredited']);
});

test('מחיר שלא אומת מול חשבונית — לא "אותו מחיר": ההחלפה לטיפול ואומרת למה', () => {
  const R = ret('ret_unknown', [['450', 1], ['451', 2], ['238', 6], ['344', 3]]);
  const r = app([credit('290099108', [['450', 3], ['238', 6], ['344', 3]])], { returns: [R] });
  r.run(`products.find(p => p.id === 'code_451').discountSet = false; ledgerInvalidate();`);
  const open = r.open();
  assert.deepEqual(open.map(i => [i.kind, i.swap && i.swap.price]), [['swap', 'unknown']]);
  assert.match(open[0].detail, /אין מחיר מאומת לאחד המוצרים, ולכן זה לא נסגר לבד/);
});

test('נייר תיקון של ברמן אחרי החלפה שנסגרה לבד — הכל מתקזז, וההחלפה יורדת', () => {
  const R = ret('ret_fixed', [['450', 1], ['451', 2], ['238', 6], ['344', 3]]);
  const fix = [credit('290099109', [['450', 3], ['238', 6], ['344', 3]]), paper('charge', '290099110', [['450', 2]], '2026-10-05'), credit('290099111', [['451', 2]], '2026-10-05')];
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
