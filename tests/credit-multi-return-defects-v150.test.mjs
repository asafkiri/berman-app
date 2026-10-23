// v150 (סבב 2) — נייר זיכוי אחד לכמה החזרות, כשהנהג גם טעה בו. בסבב הראשון (וכמו ב-v149) שלושה מקרים לא נסגרו לבד:
// - אותה החלפה בשתי ההחזרות ("דגני קלות ×2" בנייר, במקום "ברמן לענין קל ×1" בכל אחת): "חסר זיכוי" בכל אחת ו"עודף זיכוי"
//   על המוצר שבמקום — או, בהחזרות גדולות יותר, "לא נספר עד שתבחר לאיזו";
// - בכל אחת מההחזרות נשכחה שורה: "לא נספר עד שתבחר לאיזו", ואחרי כמה ביקורים שתיהן אדומות כאילו לא זוכו בכלל;
// - החזרה קטנה שהנהג זיכה רק חלק ממנה, בנייר של החזרה אחרת: "ממתינה לאימות זיכוי", ורק אחרי כמה ביקורים "חסר";
// - מוצר שמשותף לשתי ההחזרות והנייר זיכה ממנו פחות: הכל לחדשה, והישנה "ממתינה";
// - החלפה שהשיוך מצא בהחזרה הנוספת, כשבראשית חסר מוצר אחר באותה כמות: המאזן שם אותה בראשית.
// עכשיו כל החזרה מקבלת את ההחלפה שלה, השאלה נעלמת כשכל תשובה נותנת אותה חלוקה, החזרה קטנה שרק היא מסבירה את מה
// שנשאר בנייר מקבלת אותו — והחוסר בה מיד, ומוצר משותף מתחלק מהישנה לחדשה. ובלי לנחש: כשיש הסבר אחר (עוד החזרה עם אותו
// מוצר, חוסר באותה כמות בראשית, שורה שהועברה מהחזרה אחרת, תשובות שנותנות חלוקה שונה) — כמו קודם.
// כל הנתונים כאן מומצאים (מוצרי הקטלוג מ-tests/ledger-2026-10.json); הגיבוי של המשתמש אינו במאגר.
// הרצה: TZ=Asia/Jerusalem node --test tests/credit-multi-return-defects-v150.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runtime, fixture } from './receipt-scan-harness.mjs';

const L = JSON.parse(fs.readFileSync(new URL('./ledger-2026-10.json', import.meta.url), 'utf8'));
const strip = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&#039;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const name = code => (L.products.find(p => p.id === 'code_' + code) || {}).name || code;

function app(papersList, { returns = [], receipts = [], today = '2026-10-23' } = {}) {
  const r = runtime({ data: { ...fixture(), products: structuredClone(L.products) } });
  r.context.testL = { receipts, returns, papers: papersList };
  r.context.testWrites = [];
  r.run(`receipts = testL.receipts; returns = testL.returns; papers = testL.papers; todayStr = () => '${today}';
    runCloudTask = async (label, task) => { testWrites.push(task); return true; }; runCloudTaskSilent = runCloudTask; ledgerInvalidate();`);
  r.j = expr => JSON.parse(r.run('JSON.stringify(' + expr + ')'));
  r.card = id => r.run(`returnCardInReceipts(returns.find(x => x.id === '${id}'), true)`);
  r.state = id => r.run(`returnStateNow(returns.find(x => x.id === '${id}'))`);
  r.attach = id => r.j(`(fullLedger().placed.find(p => p.id === '${id}') || {}).attach || null`);
  r.items = () => r.j(`currentLedger().items.filter(i => i.state !== 'info').map(i => ({ kind: i.kind, state: i.state, part: i.part ? i.part.id : null, keys: i.keys || (i.key ? [{ key: i.key, units: i.units }] : null) }))`);
  r.swaps = () => r.j(`currentLedger().swaps.map(s => [s.a, s.b, s.q, s.returnId, !!s.settled]).sort()`);
  return r;
}
const ret = (id, date, time, rows) => ({ id, date, docDate: date, credited: false, timestamp: Date.parse(date + 'T' + time + ':00'), sentTo: 'קבוצה בוואטסאפ',
  items: rows.map(([code, qty]) => ({ productId: 'code_' + code, code, name: name(code), barcode: '', qty })) });
const credit = (number, rows, docDay, extra = {}) => ({ schema: 1, state: 'accepted', id: 'paper_' + number, kind: 'credit', kindKnown: true, number, terminalNumber: number, numerator: number.slice(-5), docDay, printedTime: null,
  headerText: 'ח.משלוח החזרה יבש', timestamp: Date.parse('2026-10-23T06:55:00') + Number(number.slice(-2)), ...extra,
  rows: rows.map(([code, qty], i) => ({ line: i + 1, itemCode: code, barcode: '', description: name(code), qty, productId: 'code_' + code, matchedBy: 'tnuva_code_exact' })),
  anchors: { units: rows.reduce((a, x) => a + x[1], 0), lines: rows.length, source: 'printed' }, proof: { unitsOk: true, linesOk: true, checkOk: true, scanStatus: 'verified' } });
const targets = at => (at.rowTargets || []).map(t => t.line + ':' + (t.type ? t.id : 'null') + (t.qty != null ? '×' + t.qty : ''));
// הנהג שכח שורה, ואחרי כמה ביקורים (משלוחים) — כדי לראות שהחזרה לא נשארת "ממתינה" ולא נהיית "לא הגיעה תעודת זיכוי"
const visits = days => days.map((d, i) => ({ id: 'rc_v' + i, date: d, docDate: d, timestamp: Date.parse(d + 'T06:30:00'), items: [] }));
const WEEK = visits(['2026-10-23', '2026-10-24', '2026-10-26', '2026-10-27', '2026-10-28']);

// ברמן לענין קל (324) ודגני קלות (333) — אותו מחיר בחשבונית; ברמן אקטיב (339) ולחם קסטן הולנדי (305) — לא
test('אותה החלפה בשתי ההחזרות, באותו מחיר ("דגני קלות ×2" במקום "ברמן לענין קל ×1" בכל אחת) — שתיהן זוכו, כל אחת עם ההחלפה שלה', () => {
  const A = ret('ret_a', '2026-10-20', '07:05', [['233', 2], ['324', 1]]);
  const B = ret('ret_b', '2026-10-21', '06:56', [['220', 2], ['232', 1], ['324', 1]]);
  const r = app([credit('290099801', [['233', 2], ['220', 2], ['232', 1], ['333', 2]], '2026-10-22')], { returns: [A, B] });
  const at = r.attach('paper_290099801');
  assert.deepEqual([at.id, at.also], ['ret_b', [{ id: 'ret_a', role: 'main' }]]);
  assert.deepEqual(targets(at), ['0:ret_a', '1:ret_b', '2:ret_b', '3:null×1', '3:null×1'], 'שורת דגני קלות — חלק לכל החלפה, כדי שהמאזן ימצא כל אחת בהחזרה שלה');
  assert.deepEqual(r.swaps(), [['code_324', 'code_333', 1, 'ret_a', true], ['code_324', 'code_333', 1, 'ret_b', true]]);
  assert.deepEqual(r.items(), [], 'עד כאן: "חסר זיכוי על ברמן לענין קל ×1" בכל אחת, ו"עודף זיכוי: ברמן זיכתה דגני קלות ×2 שלא החזרת"');
  assert.deepEqual([r.state('ret_a'), r.state('ret_b')], ['done', 'done']);
  const ca = strip(r.card('ret_a')), cb = strip(r.card('ret_b'));
  assert.match(ca, /זוכתה — נייר 99801 .*הוחזרו · זוכו 3 · 3 /);
  assert.match(ca, /ברמן לענין קל 1 0 זוכו כ״דגני קלות״ ×1 — אותו מחיר, אין מה לבקש/);
  assert.match(cb, /זוכתה — נייר 99801 .*הוחזרו · זוכו 4 · 4 /, 'דגני קלות — רק החלק של ההחזרה הזו (לא 2)');
  assert.equal(r.j('openIssuesList().length'), 0);
  assert.equal(r.j('testWrites.length'), 0, 'תצוגה בלבד');
});

test('אותה החלפה בשתי ההחזרות, במחיר שונה — "מקבל את ההחלפה" בכל אחת, בלי "חסר" ו"עודף"', () => {
  const A = ret('ret_a', '2026-10-20', '07:05', [['233', 2], ['339', 1]]);
  const B = ret('ret_b', '2026-10-21', '06:56', [['220', 2], ['232', 1], ['339', 1]]);
  const r = app([credit('290099802', [['233', 2], ['220', 2], ['232', 1], ['305', 2]], '2026-10-22')], { returns: [A, B] });
  assert.deepEqual(r.swaps(), [['code_339', 'code_305', 1, 'ret_a', false], ['code_339', 'code_305', 1, 'ret_b', false]]);
  assert.deepEqual(r.items().map(i => [i.kind, i.state]), [['swap', 'problem'], ['swap', 'problem']]);
  assert.match(strip(r.card('ret_a')), /זוכה מוצר אחר — לבדוק .*ברמן זיכתה לחם קסטן הולנדי ×1 במקום ברמן אקטיב שהחזרת ב-20\.10/);
  assert.match(r.card('ret_b'), /data-role="ledger-accept-swap"/);
});

test('אותה החלפה בהחזרות גדולות יותר — בלי "לאיזו החזרה?": הנייר נספר, ושתיהן זוכו', () => {
  const A = ret('ret_a', '2026-10-20', '07:05', [['233', 2], ['230', 3], ['324', 1]]);
  const B = ret('ret_b', '2026-10-21', '06:56', [['220', 2], ['232', 1], ['324', 1]]);
  const r = app([credit('290099803', [['233', 2], ['230', 3], ['220', 2], ['232', 1], ['333', 2]], '2026-10-22')], { returns: [A, B] });
  assert.equal(r.j(`fullLedger().states['paper_290099803']`), 'counted', 'עד כאן: "מתאים לכמה החזרות — לא נספר עד שתבחר לאיזו"');
  assert.deepEqual(r.attach('paper_290099803').also, [{ id: 'ret_a', role: 'main' }]);
  assert.deepEqual(r.items(), []);
  assert.deepEqual([r.state('ret_a'), r.state('ret_b')], ['done', 'done']);
});

test('בכל אחת מההחזרות נשכחה שורה — בלי "לאיזו החזרה?": הנייר מתחלק, וכל אחת מציגה רק את מה שנשכח בה', () => {
  const A = ret('ret_a', '2026-10-20', '07:05', [['233', 2], ['238', 1], ['230', 3]]);
  const B = ret('ret_b', '2026-10-21', '06:56', [['220', 2], ['232', 1], ['349', 2]]);
  const P = () => credit('290099804', [['233', 2], ['230', 3], ['220', 2], ['349', 2]], '2026-10-22');
  const r = app([P()], { returns: [A, B] });
  assert.equal(r.j(`fullLedger().states['paper_290099804']`), 'counted');
  const at = r.attach('paper_290099804');
  assert.deepEqual([at.id, at.also, at.ask], ['ret_a', [{ id: 'ret_b', role: 'main' }], undefined], 'הראשית — הישנה');
  assert.deepEqual(targets(at), ['0:ret_a', '1:ret_a', '2:ret_b', '3:ret_b']);
  assert.deepEqual(r.items().map(i => [i.kind, i.state, i.part, i.keys]).sort(), [
    ['returnedNotCredited', 'problem', 'ret_a', [{ key: 'code_238', units: 1 }]],
    ['returnedNotCredited', 'problem', 'ret_b', [{ key: 'code_232', units: 1 }]]]);
  assert.match(strip(r.card('ret_a')), /זוכתה בנייר 99804 מ-22\.10 חסר זיכוי על ברמן אסלי 5 פיתות ×1 מההחזרה של 20\.10/);
  // אחרי שבוע — אותו דבר (עד כאן: שתיהן "חסר זיכוי על ההחזרה … — לא הגיעה תעודת זיכוי" על כל מה שבהן)
  const later = app([P()], { returns: [A, B], receipts: WEEK, today: '2026-10-28' });
  assert.deepEqual(later.items().map(i => [i.kind, i.part, i.keys]).sort(), [
    ['returnedNotCredited', 'ret_a', [{ key: 'code_238', units: 1 }]],
    ['returnedNotCredited', 'ret_b', [{ key: 'code_232', units: 1 }]]]);
  // "שנה" עדיין עובד: ההחזרה שנבחרה היא הראשית, והשאר להחזרה האחרת
  const pick = r.j(`paperUserAttach(papers[0], 'ret_a')`);
  assert.deepEqual([pick.id, pick.also], ['ret_a', [{ id: 'ret_b', role: 'main' }]]);
});

test('החזרה קטנה שהנהג זיכה רק חלק ממנה, בנייר של החזרה אחרת — "זוכתה בנייר" והחוסר מיד, לא "ממתינה"', () => {
  const A = ret('ret_a', '2026-10-20', '07:05', [['233', 2], ['238', 1]]);
  const B = ret('ret_b', '2026-10-21', '06:56', [['220', 2], ['232', 1], ['349', 2]]);
  const r = app([credit('290099805', [['233', 2], ['220', 2], ['232', 1], ['349', 2]], '2026-10-22')], { returns: [A, B] });
  const at = r.attach('paper_290099805');
  assert.deepEqual([at.id, at.also], ['ret_b', [{ id: 'ret_a', role: 'main' }]]);
  assert.deepEqual(targets(at), ['0:ret_a', '1:ret_b', '2:ret_b', '3:ret_b']);
  assert.deepEqual(r.items(), [{ kind: 'returnedNotCredited', state: 'problem', part: 'ret_a', keys: [{ key: 'code_238', units: 1 }] }],
    'עד כאן: "ההחזרה מ-20.10 (ברמן אסלי 5 פיתות ×1) — ממתינה לתעודת זיכוי", ואחרי כמה ביקורים "לא הגיעה תעודת זיכוי"');
  assert.deepEqual([r.state('ret_a'), r.state('ret_b')], ['open', 'done']);
  const ca = strip(r.card('ret_a'));
  assert.match(ca, /חסר זיכוי על 1 יח׳ 20\.10\.2026 · 07:05 זוכתה בנייר 99805 מ-22\.10 חסר זיכוי על ברמן אסלי 5 פיתות ×1 מההחזרה של 20\.10 — לבקש זיכוי מהנהג/);
  assert.match(ca, /תעודת הזיכוי של ההחזרה \(2 יח׳\) · יחד עם ההחזרה מ-21\.10 \(5 יח׳\)/);
});

test('אותו מוצר נשכח בשתי ההחזרות — החוסר בכל אחת מיד', () => {
  const A = ret('ret_a', '2026-10-20', '07:05', [['233', 2], ['339', 1]]);
  const B = ret('ret_b', '2026-10-21', '06:56', [['220', 2], ['232', 1], ['339', 1]]);
  const r = app([credit('290099806', [['233', 2], ['220', 2], ['232', 1]], '2026-10-22')], { returns: [A, B] });
  assert.deepEqual(r.attach('paper_290099806').also, [{ id: 'ret_a', role: 'main' }]);
  assert.deepEqual(r.items().map(i => [i.kind, i.state, i.part, i.keys]).sort(), [
    ['returnedNotCredited', 'problem', 'ret_a', [{ key: 'code_339', units: 1 }]],
    ['returnedNotCredited', 'problem', 'ret_b', [{ key: 'code_339', units: 1 }]]]);
});

test('מוצר שמשותף לשתי ההחזרות, והנייר זיכה ממנו פחות — הישנה זוכתה, והחוסר בחדשה מיד (לא "ממתינה")', () => {
  const A = ret('ret_a', '2026-10-15', '07:05', [['238', 2]]);
  const B = ret('ret_b', '2026-10-17', '06:56', [['238', 1], ['451', 1]]);
  const r = app([credit('290099812', [['238', 2], ['451', 1]], '2026-10-18')], { returns: [A, B], today: '2026-10-19' });
  const at = r.attach('paper_290099812');
  assert.deepEqual([at.id, at.also], ['ret_b', [{ id: 'ret_a', role: 'main' }]]);
  assert.deepEqual(targets(at), ['0:ret_a', '1:ret_b'], 'ברמן אסלי ×2 — לישנה; עד כאן: כולו לחדשה, והישנה "ממתינה" לברמן אסלי ×1');
  assert.deepEqual(r.items(), [{ kind: 'returnedNotCredited', state: 'problem', part: 'ret_b', keys: [{ key: 'code_238', units: 1 }] }]);
  assert.deepEqual([r.state('ret_a'), r.state('ret_b')], ['done', 'open']);
});

test('ההחלפה שהשיוך מצא בהחזרה הנוספת — שם, גם כשבראשית חסר מוצר אחר באותה כמות', () => {
  // חלה קלועה (451) וחלה מרובעת (450) — אותו מחיר; חלומית ארוזה (458) — לא
  const A = ret('ret_a', '2026-10-20', '07:05', [['233', 2], ['451', 1]]);
  const B = ret('ret_b', '2026-10-21', '06:56', [['220', 2], ['232', 1], ['458', 1]]);
  const r = app([credit('290099813', [['233', 2], ['450', 1], ['220', 2], ['232', 1]], '2026-10-22')], { returns: [A, B] });
  const at = r.attach('paper_290099813');
  assert.deepEqual([at.id, at.also], ['ret_b', [{ id: 'ret_a', role: 'main' }]]);
  assert.deepEqual(at.rowTargets[1], { line: 1, type: null, id: null, for: 'ret_a' }, 'החלק של ההחלפה — עם ההחזרה שלה');
  assert.deepEqual(r.swaps(), [['code_451', 'code_450', 1, 'ret_a', true]], 'עד כאן: "ברמן זיכתה חלה מרובעת במקום חלומית ארוזה" בראשית');
  assert.deepEqual(r.items(), [{ kind: 'returnedNotCredited', state: 'problem', part: 'ret_b', keys: [{ key: 'code_458', units: 1 }] }]);
  assert.deepEqual([r.state('ret_a'), r.state('ret_b')], ['done', 'open']);
});

test('לא מנחשים: עוד החזרה עם אותו מוצר, חוסר באותה כמות בראשית, שתי החזרות זהות — כמו קודם', () => {
  // שתי החזרות קטנות, ובכל אחת "זוג לחמניות אצבע ×2" — לא ברור של מי השורה: שתיהן ממתינות
  const two = app([credit('290099807', [['233', 2], ['220', 2], ['232', 1], ['349', 2]], '2026-10-22')], { returns: [
    ret('ret_a', '2026-10-19', '07:05', [['233', 2], ['238', 1]]), ret('ret_a2', '2026-10-20', '07:05', [['233', 2], ['230', 1]]),
    ret('ret_b', '2026-10-21', '06:56', [['220', 2], ['232', 1], ['349', 2]])] });
  assert.equal(two.attach('paper_290099807').also, undefined);
  assert.deepEqual([two.state('ret_a'), two.state('ret_a2'), two.state('ret_b')], ['credit', 'credit', 'done']);
  // השורה שנשארה בכמות של חוסר בראשית (לחמניות 6 ×2) — אולי החלפה שם: לא להחזרה הקטנה
  const hole = app([credit('290099808', [['233', 2], ['220', 2], ['349', 2]], '2026-10-22')], { returns: [
    ret('ret_a', '2026-10-20', '07:05', [['233', 2], ['238', 1]]), ret('ret_b', '2026-10-21', '06:56', [['220', 2], ['232', 2], ['349', 2]])] });
  assert.equal(hole.attach('paper_290099808').also, undefined);
  assert.equal(hole.state('ret_a'), 'credit');
  // החזרה שכבר יש לה תעודת זיכוי, וחסר בה אותו מוצר — אולי השורה היא התיקון שלה: לא להחזרה הקטנה
  const C = ret('ret_c', '2026-10-18', '07:05', [['233', 2], ['253', 4], ['230', 2]]);
  const own = app([credit('290099809', [['253', 4], ['230', 2]], '2026-10-19'), credit('290099810', [['233', 2], ['220', 2], ['232', 1], ['349', 2]], '2026-10-22')], { returns: [
    C, ret('ret_a', '2026-10-20', '07:05', [['233', 2], ['238', 1]]), ret('ret_b', '2026-10-21', '06:56', [['220', 2], ['232', 1], ['349', 2]])] });
  assert.equal(own.attach('paper_290099810').also, undefined);
  // שתי החזרות זהות ונייר של אחת מהן — כל תשובה נותנת חלוקה אחרת: עדיין "לאיזו החזרה?"
  const same = app([credit('290099811', [['233', 2], ['230', 3]], '2026-10-22')], { returns: [
    ret('ret_a', '2026-10-20', '07:05', [['233', 2], ['230', 3]]), ret('ret_b', '2026-10-21', '06:56', [['233', 2], ['230', 3]])] });
  assert.equal(same.j(`fullLedger().states['paper_290099811']`), 'needs-attach');
  assert.deepEqual(same.attach('paper_290099811'), null);
});

test('paperReturnCover: אותה החלפה בכמה החזרות, והחזרה קטנה שרק היא מסבירה את מה שנשאר', () => {
  const r = app([]);
  const cover = (need, cands, opts) => r.j(`paperReturnCover(${JSON.stringify(need)}, ${JSON.stringify(cands)}, ${JSON.stringify(opts || {})})`);
  // s ×2 במקום a ×1 בכל אחת — כל החזרה עם ההחלפה שלה, והשורה בשני חלקים
  const tw = cover({ x: 2, y: 1, s: 2 }, [{ id: 'p', open: { x: 2, a: 1 } }, { id: 'q', open: { y: 1, a: 1 } }], { all: true });
  assert.deepEqual(tw.members.map(m => [m.id, m.swap]), [['p', { a: 'a', b: 's', q: 1 }], ['q', { a: 'a', b: 's', q: 1 }]]);
  assert.deepEqual([tw.loose, tw.pieces], [{ s: 2 }, { s: [{ q: 1, id: 'p' }, { q: 1, id: 'q' }] }]);
  // שורה שההחלפות לוקחות ממנה רק חלק — לא, אלא אם השאר הוא בדיוק החוסר באותו מוצר בראשית (אותה החלפה גם בה)
  assert.equal(cover({ x: 2, s: 3 }, [{ id: 'p', open: { x: 2, a: 1 } }], {}), null);
  assert.deepEqual(cover({ x: 2, s: 2 }, [{ id: 'p', open: { x: 2, a: 1 } }], { holes: { a: 1 } }).members[0].swap, { a: 'a', b: 's', q: 1 });
  assert.equal(cover({ x: 2, s: 2 }, [{ id: 'p', open: { x: 2, a: 1 } }], { holes: { z: 1 } }), null);
  // שתי החלפות שונות לאותו מוצר (a ו-c במקום s) — לא חולקות שורה
  assert.equal(cover({ x: 2, y: 1, s: 2 }, [{ id: 'p', open: { x: 2, a: 1 } }, { id: 'q', open: { y: 1, c: 1 } }], { all: true }), null);
  // החזרה קטנה שנמצאה רק בחלקה — רק עם opts.weak, כשהיא היחידה עם המוצר, ולא מוצר של הראשית
  const weak = (need, cands, opts, ok = true) => r.j(`paperReturnCover(${JSON.stringify(need)}, ${JSON.stringify(cands)}, { ...${JSON.stringify(opts)}, partial: true, weak: () => ${ok} })`);
  const small = [{ id: 'p', open: { x: 2, z: 1 } }];
  assert.equal(cover({ x: 2 }, small, { partial: true }), null);
  assert.deepEqual(weak({ x: 2 }, small, {}).members.map(m => [m.id, m.short, !!m.weak]), [['p', { z: 1 }, true]]);
  assert.equal(weak({ x: 2 }, small, {}, false), null);
  assert.equal(weak({ x: 2 }, small.concat([{ id: 'q', open: { x: 2, w: 3 } }]), {}), null);
  assert.equal(weak({ x: 2 }, small, { own: ['x'] }), null);
  assert.equal(weak({ x: 2 }, [{ id: 'p', open: { x: 2, z: 1, w: 1 } }], {}), null, 'פחות מחצי מההחזרה');
  assert.equal(weak({ x: 2 }, small, { holes: { y: 2 } }), null, 'חוסר באותה כמות בראשית — אולי החלפה שם');
});
