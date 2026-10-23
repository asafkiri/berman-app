// v150 — נייר זיכוי אחד לכמה החזרות. 23.10.2026: הנהג לקח את ההחזרה מ-20.10 ואת זו מ-21.10 והדפיס להן נייר אחד
// (95955 מ-22.10, 5 שורות, 11 יח׳; "ברמן אסלי 5 פ׳ ×4" — 3 מההחזרה מ-21.10 ו-1 מזו מ-20.10). עד v149 נייר זיכוי שייך
// כולו להחזרה אחת: ההחזרה מ-21.10 "זוכתה" עם "1 התקזזו מול תעודה אחרת", והחזרה מ-20.10 נשארה "ממתינה לאימות זיכוי" —
// עם "שלח שוב", "החזר לרשימה" ו"מזג", כאילו הנהג לא זיכה אותה.
// כל הנתונים כאן מומצאים (מוצרי הקטלוג מ-tests/ledger-2026-10.json); הגיבוי של המשתמש אינו במאגר. המקרה נבנה מחדש
// באותם מוצרים, כמויות, ימים ושעות.
// הרצה: TZ=Asia/Jerusalem node --test tests/credit-multi-return-v150.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runtime, fixture } from './receipt-scan-harness.mjs';

const L = JSON.parse(fs.readFileSync(new URL('./ledger-2026-10.json', import.meta.url), 'utf8'));
const strip = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&#039;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const name = code => (L.products.find(p => p.id === 'code_' + code) || {}).name || code;

function app(papersList, { returns = [], receipts = [], today = '2026-10-23', closedThrough = '' } = {}) {
  const r = runtime({ data: { ...fixture(), products: structuredClone(L.products) } });
  r.context.testL = { receipts, returns, papers: papersList };
  r.context.testWrites = [];
  r.run(`receipts = testL.receipts; returns = testL.returns; papers = testL.papers; todayStr = () => '${today}'; ledgerClosedThrough = '${closedThrough}';
    runCloudTask = async (label, task) => { testWrites.push(task); return true; }; runCloudTaskSilent = runCloudTask; ledgerInvalidate();`);
  r.j = expr => JSON.parse(r.run('JSON.stringify(' + expr + ')'));
  r.history = (filter = 'all') => { r.run(`setView('receiptsHistory'); receiptHistoryFilter = '${filter}'; renderReceiptsHistory();`); return r.node('app').innerHTML; };
  r.card = id => r.run(`returnCardInReceipts(returns.find(x => x.id === '${id}'), true)`);
  r.state = id => r.run(`returnStateNow(returns.find(x => x.id === '${id}'))`);
  r.stillOpen = id => r.run(`returnStillOpen(returns.find(x => x.id === '${id}'))`);
  r.attach = id => r.j(`(fullLedger().placed.find(p => p.id === '${id}') || {}).attach || null`);
  r.items = (lg = 'currentLedger()') => r.j(`${lg}.items.filter(i => i.state !== 'info').map(i => ({ kind: i.kind, state: i.state, part: i.part ? i.part.id : null, keys: i.keys || (i.key ? [{ key: i.key, units: i.units }] : null), paper: i.paper ? i.paper.id : null }))`);
  return r;
}
const ret = (id, date, time, rows, extra = {}) => ({ id, date, docDate: date, credited: false, timestamp: Date.parse(date + 'T' + time + ':00'), sentTo: 'קבוצה בוואטסאפ', ...extra,
  items: rows.map(([code, qty]) => ({ productId: 'code_' + code, code, name: name(code), barcode: '', qty })) });
const credit = (number, rows, docDay, extra = {}) => ({ schema: 1, state: 'accepted', id: 'paper_' + number, kind: 'credit', kindKnown: true, number, terminalNumber: number, numerator: number.slice(-5), docDay, printedTime: null,
  headerText: 'ח.משלוח החזרה יבש', timestamp: Date.parse(docDay + 'T08:00:00') + Number(number.slice(-2)), ...extra,
  rows: rows.map(([code, qty], i) => ({ line: i + 1, itemCode: code, barcode: '', description: name(code), qty, productId: 'code_' + code, matchedBy: 'tnuva_code_exact' })),
  anchors: { units: rows.reduce((a, x) => a + x[1], 0), lines: rows.length, source: 'printed' }, proof: { unitsOk: true, linesOk: true, checkOk: true, scanStatus: 'verified' } });
const targets = at => (at.rowTargets || []).map(t => t.line + ':' + (t.type ? t.id : 'null') + (t.qty != null ? '×' + t.qty : ''));

// המקרה מ-22.10
const R20 = () => ret('ret_2010', '2026-10-20', '07:05', [['233', 2], ['238', 1]]);
const R21 = () => ret('ret_2110', '2026-10-21', '06:56', [['220', 2], ['232', 1], ['238', 3], ['349', 2]]);
const R22 = () => ret('ret_2210', '2026-10-22', '07:11', [['349', 2]]);
const P955 = () => credit('290099955', [['220', 2], ['349', 2], ['232', 1], ['233', 2], ['238', 4]], '2026-10-22', { timestamp: Date.parse('2026-10-23T06:55:59') });

test('המקרה מ-22.10: נייר אחד זיכה את ההחזרות מ-20.10 ומ-21.10 — שתיהן "זוכתה", ו"ברמן אסלי ×4" מתחלק 3 ו-1', () => {
  const r = app([P955()], { returns: [R20(), R21(), R22()] });
  const at = r.attach('paper_290099955');
  assert.deepEqual([at.type, at.id, at.role], ['return', 'ret_2110', 'main'], 'הראשית — זו שרוב הנייר שלה');
  assert.deepEqual(at.also, [{ id: 'ret_2010', role: 'main' }], 'הנייר הוא תעודת הזיכוי גם של ההחזרה מ-20.10');
  assert.deepEqual(targets(at), ['0:ret_2110', '1:ret_2110', '2:ret_2110', '3:ret_2010', '4:ret_2110×3', '4:ret_2010×1']);
  assert.equal(r.j(`fullLedger().states['paper_290099955']`), 'counted');
  for (const id of ['ret_2010', 'ret_2110']) {
    assert.equal(r.state(id), 'done', id);
    assert.equal(r.stillOpen(id), false, id + ': בלי "שלח שוב", "החזר לרשימה" ו"מזג" — הנהג כבר זיכה אותה');
  }
  // רק ההחזרה מ-22.10 עוד מחכה לנייר שלה
  assert.deepEqual(r.items(), [{ kind: 'returnNotCreditedYet', state: 'pending', part: 'ret_2210', keys: [{ key: 'code_349', units: 2 }], paper: null }]);
  assert.equal(r.state('ret_2210'), 'credit');
  assert.equal(r.j('testWrites.length'), 0, 'תצוגה בלבד');
});

test('המקרה מ-22.10: הכרטיסים בהיסטוריה — כל החזרה עם החלק שלה בנייר, ובלי "התקזזו מול תעודה אחרת"', () => {
  const r = app([P955()], { returns: [R20(), R21(), R22()] });
  const c20 = r.card('ret_2010'), s20 = strip(c20);
  assert.match(s20, /תעודת חזרות \/ זיכוי זוכתה — נייר 99955 20\.10\.2026 · 07:05 .*הוחזרו · זוכו 3 · 3/);
  assert.match(s20, /✓ נייר הזיכוי 99955 מ-22\.10 צולם ומתאים — ההחזרה זוכתה \(בנייר אחד יחד עם ההחזרה מ-21\.10\)\. אין מה לעשות\./);
  assert.match(s20, /נייר הזיכוי מהנהג של ההחזרה הזו נייר הזיכוי 99955 מ-22\.10 5 שורות · 11 יח׳ · תעודת הזיכוי של ההחזרה \(3 יח׳\) · יחד עם ההחזרה מ-21\.10 \(8 יח׳\) פתח/);
  assert.match(s20, /כל 2 המוצרים זוכו במלואם/);
  assert.doesNotMatch(c20, /data-role="ret-merge"|data-role="ret-unsend"|data-role="ret-resend"|data-role="rv-verify-inline"/);
  const s21 = strip(r.card('ret_2110'));
  assert.match(s21, /זוכתה — נייר 99955 21\.10\.2026 · 06:56 .*הוחזרו · זוכו 8 · 8/);
  assert.match(s21, /ההחזרה זוכתה \(בנייר אחד יחד עם ההחזרה מ-20\.10\)/);
  assert.match(s21, /תעודת הזיכוי של ההחזרה \(8 יח׳\) · יחד עם ההחזרה מ-20\.10 \(3 יח׳\)/);
  assert.doesNotMatch(s21, /התקזזו מול תעודה אחרת/);
  // ההחזרה מ-22.10 היא הפתוחה היחידה — אין עם מה "למזג" (עד v149 הוצע למזג אותה עם זו מ-20.10)
  assert.doesNotMatch(r.card('ret_2210'), /data-role="ret-merge"/);
  // הנייר בתוך שני הכרטיסים — לא כרטיס נפרד ברשימה
  const html = r.history();
  assert.ok(!html.includes('data-rc-card="paper:paper_290099955"'));
  assert.equal(r.run(`paperAttachShown(papers[0], fullLedger())`), 'תעודת הזיכוי של ההחזרות מ-20.10 (3 יח׳) ומ-21.10 (8 יח׳)');
  assert.equal(r.j('openIssuesList().length'), 0);
});

test('המקרה מ-22.10: המרכזת — אותם זיכויים לכל מוצר בחודש (רק היום של חלק מהם הוא יום ההחזרה שלו)', () => {
  const r = app([P955()], { returns: [R20(), R21(), R22()] });
  const adj = r.j(`ledgerMatrixAdjust(fullLedger(), '2026-10-01', '2026-10-31', ledgerAllPapers(fullLedger()))`);
  const by = {};
  adj.forEach(a => { by[a.key] = (by[a.key] || 0) + a.credit - a.billed; });
  assert.deepEqual(by, { code_220: 2, code_349: 2, code_232: 1, code_233: 2, code_238: 4 });
  assert.deepEqual(adj.filter(a => a.key === 'code_238').map(a => a.day + ':' + a.credit).sort(), ['2026-10-20:1', '2026-10-21:3']);
});

test('אותו מוצר בשתי ההחזרות, והנייר מאחד אותו — אף החזרה לבד לא מתאימה לנייר: בלי "לאיזו החזרה?", שתיהן זוכו', () => {
  const A = ret('ret_a', '2026-10-13', '19:30', [['238', 2], ['2381', 1]]);
  const B = ret('ret_b', '2026-10-14', '19:30', [['238', 1], ['2381', 2], ['349', 1]]);
  const r = app([credit('290099701', [['238', 3], ['2381', 3], ['349', 1]], '2026-10-15')], { returns: [A, B], today: '2026-10-16' });
  assert.equal(r.j(`fullLedger().states['paper_290099701']`), 'counted', 'עד v149: "מתאים לכמה החזרות — לא נספר עד שתבחר לאיזו"');
  const at = r.attach('paper_290099701');
  assert.deepEqual([at.id, at.also], ['ret_b', [{ id: 'ret_a', role: 'main' }]]);
  assert.deepEqual(targets(at), ['0:ret_b×1', '0:ret_a×2', '1:ret_b×2', '1:ret_a×1', '2:ret_b']);
  assert.deepEqual([r.state('ret_a'), r.state('ret_b')], ['done', 'done']);
  assert.deepEqual(r.items(), []);
});

test('החלפה בהחזרה השנייה (חלה קלועה במקום מרובעת, אותו מחיר) — ההחזרה זוכתה, וההחלפה נסגרת לבד', () => {
  const A = ret('ret_s1', '2026-10-15', '19:30', [['450', 3], ['238', 1]]);
  const B = ret('ret_s2', '2026-10-16', '19:30', [['220', 2], ['349', 2], ['232', 1], ['238', 3]]);
  const r = app([credit('290099702', [['220', 2], ['349', 2], ['232', 1], ['238', 4], ['451', 3]], '2026-10-17')], { returns: [A, B], today: '2026-10-18' });
  const at = r.attach('paper_290099702');
  assert.deepEqual([at.id, at.also], ['ret_s2', [{ id: 'ret_s1', role: 'main' }]]);
  assert.deepEqual(targets(at), ['0:ret_s2', '1:ret_s2', '2:ret_s2', '3:ret_s2×3', '3:ret_s1×1', '4:null'], 'קלועה — בלי שיוך: ההחלפה מזוהה במאזן');
  assert.deepEqual(r.j(`currentLedger().swaps.map(s => [s.a, s.b, s.q, s.returnId, !!s.settled])`), [['code_450', 'code_451', 3, 'ret_s1', true]]);
  assert.deepEqual(r.items(), []);
  assert.deepEqual([r.state('ret_s1'), r.state('ret_s2')], ['done', 'done']);
  assert.match(strip(r.card('ret_s1')), /חלה מרובעת ברמן 3 0 זוכו כ״חלה קלועה ברמן״ ×3 — אותו מחיר, אין מה לבקש/);
});

test('שורה שנשכחה בהחזרה השנייה — הנייר הוא תעודת הזיכוי שלה, והחוסר מיד: "חסר זיכוי … מההחזרה של 15.10"', () => {
  const A = ret('ret_p1', '2026-10-15', '19:30', [['233', 2], ['238', 1], ['450', 3]]);
  const B = ret('ret_p2', '2026-10-16', '19:30', [['220', 2], ['349', 2], ['232', 1], ['238', 3]]);
  const r = app([credit('290099703', [['220', 2], ['349', 2], ['232', 1], ['233', 2], ['238', 4]], '2026-10-17')], { returns: [A, B], today: '2026-10-18' });
  const at = r.attach('paper_290099703');
  assert.deepEqual([at.id, at.also], ['ret_p2', [{ id: 'ret_p1', role: 'main' }]]);
  assert.deepEqual(r.items(), [{ kind: 'returnedNotCredited', state: 'problem', part: 'ret_p1', keys: [{ key: 'code_450', units: 3 }], paper: null }]);
  assert.deepEqual([r.state('ret_p1'), r.state('ret_p2')], ['open', 'done']);
  assert.match(strip(r.card('ret_p1')), /חסר זיכוי על 3 יח׳ .*מה לעשות לבקש מהנהג זיכוי על חלה מרובעת ברמן ×3 מההחזרה של 15\.10\./);
});

test('שורה שנשכחה בהחזרה הראשית — החוסר בה, וההחזרה השנייה זוכתה', () => {
  const A = ret('ret_q1', '2026-10-15', '19:30', [['233', 2], ['238', 1]]);
  const B = ret('ret_q2', '2026-10-16', '19:30', [['220', 2], ['349', 2], ['232', 1], ['238', 3]]);
  const r = app([credit('290099704', [['220', 2], ['232', 1], ['233', 2], ['238', 4]], '2026-10-17')], { returns: [A, B], today: '2026-10-18' });
  assert.deepEqual(r.attach('paper_290099704').also, [{ id: 'ret_q1', role: 'main' }]);
  assert.deepEqual(r.items(), [{ kind: 'returnedNotCredited', state: 'problem', part: 'ret_q2', keys: [{ key: 'code_349', units: 2 }], paper: null }]);
  assert.deepEqual([r.state('ret_q1'), r.state('ret_q2')], ['done', 'open']);
});

test('נייר עם שורה לחוסר בקליטה — השורה לקליטה, ושתי ההחזרות זוכו', () => {
  const rc = { id: 'rc_2210', date: '2026-10-22', docDate: '2026-10-22', timestamp: Date.parse('2026-10-22T06:46:00'),
    items: [{ productId: 'code_101', code: '101', name: name('101'), barcode: '', qty: 8, noteQty: 10 }] };
  const p = credit('290099955', [['220', 2], ['349', 2], ['232', 1], ['233', 2], ['238', 4], ['101', 2]], '2026-10-22');
  const r = app([p], { returns: [R20(), R21()], receipts: [rc] });
  const at = r.attach('paper_290099955');
  assert.deepEqual(at.also, [{ id: 'ret_2010', role: 'main' }]);
  assert.equal(targets(at).pop(), '5:rc_2210');
  assert.deepEqual([r.state('ret_2010'), r.state('ret_2110')], ['done', 'done']);
  assert.deepEqual(r.items(), []);
});

test('לא מנחשים: החזרה שכבר יש לה תעודת זיכוי משלה אינה חלק מנייר אחר — העודף נשאר גלוי', () => {
  const A = ret('ret_c1', '2026-10-14', '19:30', [['238', 1], ['101', 2]]);
  const B = ret('ret_c2', '2026-10-15', '19:30', [['238', 3], ['220', 2]]);
  const r = app([credit('290099705', [['238', 1], ['101', 2]], '2026-10-15'), credit('290099706', [['238', 4], ['220', 2]], '2026-10-16')], { returns: [A, B], today: '2026-10-17' });
  assert.equal(r.attach('paper_290099706').also, undefined);
  assert.deepEqual(r.items().map(i => [i.kind, i.part || i.paper]), [['creditedNotReturned', 'ret_c2']]);
});

test('שתי החזרות זהות של שורה אחת, ובנייר רק אחת מהן — הישנה זוכתה, והחדשה ממשיכה לחכות לנייר שלה', () => {
  const A = ret('ret_d1', '2026-10-19', '19:30', [['238', 1]]);
  const C = ret('ret_d3', '2026-10-20', '19:30', [['238', 1]]);
  const B = ret('ret_d2', '2026-10-21', '19:30', [['220', 2], ['238', 3]]);
  const r = app([credit('290099707', [['220', 2], ['238', 4]], '2026-10-22')], { returns: [A, C, B] });
  assert.deepEqual(r.attach('paper_290099707').also, [{ id: 'ret_d1', role: 'main' }]);
  assert.deepEqual([r.state('ret_d1'), r.state('ret_d3'), r.state('ret_d2')], ['done', 'credit', 'done']);
  assert.deepEqual(r.items().map(i => [i.kind, i.state, i.part]), [['returnNotCreditedYet', 'pending', 'ret_d3']]);
});

test('חודש שנסגר: נייר שזיכה החזרה מספטמבר ואחת מאוקטובר — נספר באוקטובר (לא "מחוץ לתקופת המאזן")', () => {
  const S = ret('ret_sep', '2026-09-30', '19:30', [['233', 2], ['238', 1]]);
  const O = ret('ret_oct', '2026-10-01', '06:50', [['220', 2], ['349', 2], ['232', 1], ['238', 3]]);
  const r = app([credit('290099708', [['220', 2], ['349', 2], ['232', 1], ['233', 2], ['238', 4]], '2026-10-02')], { returns: [S, O], today: '2026-10-03', closedThrough: '2026-09-30' });
  assert.equal(r.j(`currentLedger().states['paper_290099708']`), 'counted');
  const at = r.j(`currentLedger().placed.find(p => p.id === 'paper_290099708').attach`);
  assert.deepEqual([at.id, at.also], ['ret_oct', [{ id: 'ret_sep', role: 'main' }]], 'הראשית — זו שבתקופה');
  assert.deepEqual(r.items(), []);
  assert.deepEqual([r.state('ret_sep'), r.state('ret_oct')], ['done', 'done']);
});

test('"שנה": המשתמש בוחר החזרה — השאר עדיין הולך להחזרה האחרת; "לא שייך להחזרה" — שורה אחת לכל יעד, בלי חלקים', async () => {
  const r = app([P955()], { returns: [R20(), R21(), R22()] });
  const pick21 = r.j(`paperUserAttach(papers[0], 'ret_2110')`);
  assert.deepEqual([pick21.by, pick21.id, pick21.also], ['user', 'ret_2110', [{ id: 'ret_2010', role: 'main' }]]);
  const pick20 = r.j(`paperUserAttach(papers[0], 'ret_2010')`);
  assert.deepEqual([pick20.id, pick20.also], ['ret_2010', [{ id: 'ret_2110', role: 'main' }]]);
  assert.deepEqual(targets(pick20), ['0:ret_2110', '1:ret_2110', '2:ret_2110', '3:ret_2010', '4:ret_2010×1', '4:ret_2110×3']);
  await r.run(`setPaperAttach('paper_290099955', null)`);
  const [w] = r.j('testWrites');
  assert.equal(w.op, 'update');
  assert.equal(w.data.attach.also, undefined);
  assert.deepEqual(targets(w.data.attach), ['0:null', '1:null', '2:null', '3:null', '4:null']);
  // השיוך שנשמר (ידני) — נספר כמו שנשמר: בלי החזרה
  r.run(`papers = papers.map(p => ({ ...p, attach: testWrites[0].data.attach, forReturnId: null })); ledgerInvalidate();`);
  assert.deepEqual([r.state('ret_2010'), r.state('ret_2110')], ['credit', 'credit']);
});

test('paperReturnCover: מה מחפשים ומה לא מנחשים', () => {
  const r = app([]);
  const cover = (need, cands, opts) => r.j(`paperReturnCover(${JSON.stringify(need)}, ${JSON.stringify(cands)}, ${JSON.stringify(opts || {})})`);
  // כל מה שפתוח בשתי החזרות, בדיוק
  assert.deepEqual(cover({ a: 2, b: 3, c: 1 }, [{ id: 'x', open: { a: 2, c: 1 } }, { id: 'y', open: { b: 3 } }], {}).members.map(m => m.id), ['x', 'y']);
  // החלפה: c במקום b, באותה כמות — c נשאר בלי שיוך
  const sw = cover({ a: 2, c: 3 }, [{ id: 'x', open: { a: 2, b: 3 } }], {});
  assert.deepEqual([sw.members[0].swap, sw.loose], [{ a: 'b', b: 'c', q: 3 }, { c: 3 }]);
  // ...אבל חוסר באותה כמות בהחזרה הראשית — אולי ההחלפה שם: לא
  assert.equal(cover({ a: 2, c: 3 }, [{ id: 'x', open: { a: 2, b: 3 } }], { holes: { z: 3 } }), null);
  // החזרה שחסר בה משהו — רק עם opts.partial, ורק כששתי שורות שלה בדיוק והן חצי ממנה
  assert.equal(cover({ a: 2, b: 1 }, [{ id: 'x', open: { a: 2, b: 1, c: 4 } }], {}), null);
  assert.deepEqual(cover({ a: 2, b: 1 }, [{ id: 'x', open: { a: 2, b: 1, c: 4 } }], { partial: true }).members[0].short, { c: 4 });
  assert.equal(cover({ a: 2 }, [{ id: 'x', open: { a: 2, c: 4 } }], { partial: true }), null, 'שורה אחת — לא מספיק');
  // שתי החזרות שונות שכל אחת יכולה להיות "החזרה שחסר בה משהו" — לא מנחשים
  assert.equal(cover({ a: 2, b: 1 }, [{ id: 'x', open: { a: 2, b: 1, c: 4 } }, { id: 'y', open: { a: 2, b: 1, d: 4 } }], { partial: true }), null);
  // החזרה של שורה אחת בכמות של חוסר במוצר אחר בראשית — אולי החלפה בראשית: לא
  assert.equal(cover({ a: 1 }, [{ id: 'x', open: { a: 1 } }], { holes: { z: 1 } }), null);
  assert.deepEqual(cover({ a: 1 }, [{ id: 'x', open: { a: 1 } }], { holes: { z: 2 } }).members.map(m => m.id), ['x']);
});
