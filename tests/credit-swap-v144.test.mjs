// v144 — זיהוי החלפות בזיכוי שלא נשבר בגלל החלפות אחרות, ושאלה על נייר שזיכה רק מוצר שלא הוחזר.
// הממצאים מסימולציה של חודשי עבודה (tests/ledger-sim.test.mjs): ב-37% מהחודשים שבהם הכל זוכה, גרסה 143 הראתה
// לפחות פעם אחת התראת שווא באדום. כאן כל מקרה לבד, בנתונים מומצאים (מוצרי הקטלוג מ-tests/ledger-2026-10.json, והמבצע
// על ברמן אקטיב מ-fixture.json); הגיבוי של המשתמש אינו במאגר.
// - אותה החלפה בשתי החזרות, כשהמוצר שזוכה במקום לא הוחזר בהן — שתיהן מזוהות (עד v143 — רק הראשונה).
// - החלפות הפוכות (קלועה במקום מרובעת, ואחר כך מרובעת במקום קלועה) — לא חוסמות זו את זו.
// - החזרה שנשלחה ביום של הנייר — לא "בולעת" את העודף של ההחלפה.
// - נייר שהחלפה בו הוא עדיין הנייר הראשי: שורה שחסרה בו — חוסר מיד, לא "ממתינה".
// - נייר שכולו מוצר שלא הוחזר (החזרה של מוצר אחד, או נייר השלמה עם המוצר הלא נכון) — "של איזו החזרה הוא?" עם
//   ההחזרה שחסר בה בדיוק זה; אחרי הבחירה ההחלפה מזוהה, וההחזרה "זוכתה — נייר …". "לא שייך להחזרה" — כמו קודם.
// הרצה: TZ=Asia/Jerusalem node --test tests/credit-swap-v144.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runtime, fixture } from './receipt-scan-harness.mjs';

const L = JSON.parse(fs.readFileSync(new URL('./ledger-2026-10.json', import.meta.url), 'utf8'));
const strip = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&#039;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const name = code => (L.products.find(p => p.id === 'code_' + code) || {}).name || code;

function app(papersList, { returns = [], receipts = [], today = '2026-10-12' } = {}) {
  const r = runtime({ data: { ...fixture(), products: structuredClone(L.products) } });
  r.context.testL = { receipts, returns, papers: papersList };
  r.context.testWrites = [];
  r.run(`receipts = testL.receipts; returns = testL.returns; papers = testL.papers; todayStr = () => '${today}';
    runCloudTask = async (label, task) => { testWrites.push(task); return true; }; runCloudTaskSilent = runCloudTask; ledgerInvalidate();`);
  r.j = expr => JSON.parse(r.run('JSON.stringify(' + expr + ')'));
  r.items = () => r.j(`currentLedger().items.map(i => ({ kind: i.kind, state: i.state, key: i.key || null, units: i.units, paper: i.paper ? i.paper.id : null, why: i.why || null,
    swap: i.swap ? { a: i.swap.a, b: i.swap.b, q: i.swap.q, price: i.swap.price, ret: i.swap.returnId } : null,
    text: ledgerItemText(i, currentLedger(), ledgerAllPapers(currentLedger())).text, detail: ledgerItemText(i, currentLedger(), ledgerAllPapers(currentLedger())).detail || '',
    actions: (ledgerItemText(i, currentLedger(), ledgerAllPapers(currentLedger())).actions || []).map(a => a.label) }))`);
  r.open = () => r.items().filter(i => i.state === 'problem' || i.state === 'question');
  r.swaps = () => r.items().filter(i => i.kind === 'swap' || i.kind === 'autoSwap').map(i => i.kind + ':' + i.swap.ret + ':' + i.swap.a + '>' + i.swap.b + '×' + i.swap.q);
  r.state = id => r.run(`returnStateNow(returns.find(x => x.id === '${id}'))`);
  r.card = id => strip(r.run(`returnCardInReceipts(returns.find(x => x.id === '${id}'))`));
  // המשתמש עונה "של איזו החזרה" — כמו כפתור התשובה במאזן (setPaperAttach → paperUserAttach)
  r.answer = (paperId, returnId) => r.run(`(function(){ const p = papers.find(x => x.id === '${paperId}'); p.attach = paperUserAttach(p, '${returnId}'); p.forReturnId = '${returnId}' || null; ledgerInvalidate(); })()`);
  return r;
}
const ret = (id, date, rows) => ({ id, date, docDate: date, credited: false, timestamp: Date.parse(date + 'T19:30:00'), sentTo: 'קבוצה בוואטסאפ',
  items: rows.map(([code, qty]) => ({ productId: 'code_' + code, code, name: name(code), barcode: '', qty })) });
const credit = (number, rows, docDay) => ({ schema: 1, state: 'accepted', id: 'paper_' + number, kind: 'credit', kindKnown: true, number, terminalNumber: number, numerator: number.slice(-5), docDay, printedTime: null,
  timestamp: Date.parse(docDay + 'T08:00:00') + Number(number.slice(-2)),
  rows: rows.map(([code, qty], i) => ({ line: i + 1, itemCode: code, barcode: '', description: code, qty, productId: 'code_' + code, matchedBy: 'tnuva_code_exact' })),
  anchors: { units: rows.reduce((a, x) => a + x[1], 0), lines: rows.length, source: 'printed' }, proof: { unitsOk: true, linesOk: true } });
const visits = days => days.map(d => ({ id: 'rc_' + d, date: d, docDate: d, timestamp: Date.parse(d + 'T06:00:00'), items: [{ productId: 'code_101', code: '101', name: name('101'), qty: 10, noteQty: 10 }] }));

test('אותה החלפה בשתי החזרות (המוצר שזוכה במקום לא הוחזר) — שתיהן מזוהות, לא "חסר" ו"עודף"', () => {
  // חלומית אישית ← בייגל מלוח, באותו מחיר: נסגרות לבד
  const A = ret('ret_a', '2026-10-05', [['3701', 1], ['238', 4]]), B = ret('ret_b', '2026-10-08', [['3701', 2], ['2381', 3]]);
  const same = app([credit('290099401', [['3712', 1], ['238', 4]], '2026-10-06'), credit('290099402', [['3712', 2], ['2381', 3]], '2026-10-09')], { returns: [A, B] });
  assert.deepEqual(same.open(), []);
  assert.deepEqual(same.swaps(), ['autoSwap:ret_a:code_3701>code_3712×1', 'autoSwap:ret_b:code_3701>code_3712×2']);
  assert.deepEqual([same.state('ret_a'), same.state('ret_b')], ['done', 'done']);
  // ברמן אקטיב ← דגני קלות, במחיר שונה (מבצע): כל אחת החלפה לטיפול, עם "מקבל את ההחלפה" — לא "חסר" ו"עודף"
  const C = ret('ret_c', '2026-10-05', [['339', 2], ['238', 4]]), D = ret('ret_d', '2026-10-08', [['339', 2], ['2381', 3]]);
  const diff = app([credit('290099403', [['333', 2], ['238', 4]], '2026-10-06'), credit('290099404', [['333', 2], ['2381', 3]], '2026-10-09')], { returns: [C, D] });
  assert.deepEqual(diff.open().map(i => [i.kind, i.swap && i.swap.ret, i.swap && i.swap.price]), [['swap', 'ret_c', 'diff'], ['swap', 'ret_d', 'diff']]);
});

test('החלפות הפוכות בשתי החזרות (קלועה במקום מרובעת, ואחר כך מרובעת במקום קלועה) — שתיהן מזוהות', () => {
  const A = ret('ret_a', '2026-10-03', [['450', 4], ['238', 1]]), B = ret('ret_b', '2026-10-08', [['451', 3], ['238', 2]]);
  const r = app([credit('290099411', [['450', 1], ['451', 3], ['238', 1]], '2026-10-04'), credit('290099412', [['451', 2], ['450', 1], ['238', 2]], '2026-10-09')], { returns: [A, B] });
  assert.deepEqual(r.open(), [], 'עד v143: "חסר זיכוי על חלה מרובעת ×2" ו"עודף זיכוי: חלה קלועה ×2"');
  assert.deepEqual(r.swaps().sort(), ['autoSwap:ret_a:code_450>code_451×3', 'autoSwap:ret_b:code_451>code_450×1']);
});

test('החזרה שנשלחה ביום של הנייר (אחרי הביקור) לא בולעת את העודף של ההחלפה', () => {
  const A = ret('ret_a', '2026-10-04', [['450', 2], ['2387', 3]]), Y = ret('ret_y', '2026-10-05', [['451', 1], ['238', 6]]);
  const r = app([credit('290099421', [['450', 1], ['451', 1], ['2387', 3]], '2026-10-05')], { returns: [A, Y], today: '2026-10-06' });
  assert.deepEqual(r.open(), []);
  assert.deepEqual(r.swaps(), ['autoSwap:ret_a:code_450>code_451×1']);
  assert.match(r.items().find(i => i.kind === 'returnNotCreditedYet').text, /^ההחזרה מ-5\.10 \(2 מוצרים, 7 יח׳\)/, 'ממתינה לכל ה-7');
});

test('נייר שהחלפה בו הוא הנייר הראשי — שורה שחסרה בו היא חוסר מיד (לא "ממתינה"); בשני חסרים באותה כמות — זה שבאותו מחיר', () => {
  // הוחזרו 3: חלה קלועה ×1, ברמן אקטיב ×1, ברמן אסלי ×5. בנייר: אסלי ×5, ומרובעת ×1 במקום קלועה. ברמן אקטיב — חסר
  const R = ret('ret_r', '2026-10-05', [['451', 1], ['339', 1], ['238', 5]]);
  const r = app([credit('290099431', [['238', 5], ['450', 1]], '2026-10-06')], { returns: [R], receipts: visits(['2026-10-06']), today: '2026-10-06' });
  assert.equal(r.j('currentLedger().placed[0].attach.role'), 'main', 'הקלועה שהוחלפה נספרת כמכוסה');
  assert.deepEqual(r.open().map(i => [i.kind, i.key, i.units, i.text]), [['returnedNotCredited', 'code_339', 1, 'חסר זיכוי על ברמן אקטיב ×1 מההחזרה של 5.10 — לבקש זיכוי מהנהג']]);
  assert.deepEqual(r.swaps(), ['autoSwap:ret_r:code_451>code_450×1'], 'קלועה ×1 וברמן אקטיב ×1 חסרים — המרובעת באותו מחיר כמו הקלועה');
});

test('נייר שכולו מוצר שלא הוחזר — "של איזו החזרה הוא?" עם ההחזרה שחסר בה בדיוק זה; אחרי הבחירה — "זוכתה"', () => {
  // החזרה של מוצר אחד: ברמן אקטיב ×4. הנהג זיכה דגני קלות ×4 (מחיר שונה במבצע)
  const R = ret('ret_r', '2026-10-05', [['339', 4]]), O = ret('ret_o', '2026-10-06', [['238', 4], ['2381', 2]]);
  const P = credit('290099441', [['333', 4]], '2026-10-07');
  const r = app([P], { returns: [R, O], today: '2026-10-07' });
  const ask = r.items().filter(i => i.kind === 'needsAttach');
  assert.deepEqual(ask.map(i => [i.state, i.why, i.text]), [['pending', 'substitute', 'נייר הזיכוי 99441 מ-7.10 זיכה דגני קלות ×4 — מוצר שלא החזרת. של איזו החזרה הוא? (לא נספר עד שתבחר)']]);
  // ההחזרות שחסר בהן מוצר בדיוק בכמות הזו; קודם זו שבה המוצר באותו מחיר קטלוג (ברמן אקטיב כמו דגני קלות), אחר כך
  // ההחזרה מ-6.10 שעוד ממתינה (ברמן אסלי ×4)
  assert.deepEqual(ask[0].actions, ['ההחזרה מ-5.10 — חסר בה ברמן אקטיב ×4', 'ההחזרה מ-6.10 — חסר בה ברמן אסלי 5 פיתות ×4', 'לא שייך להחזרה']);
  assert.deepEqual(r.open(), [], 'שאלה (ממתין), לא "עודף" ו"חסר" באדום');
  assert.match(strip(r.run('openIssuesBannerContentHtml({})')), /של איזו החזרה הוא\?/, 'השאלה בהתראה העליונה');
  r.answer(P.id, R.id);
  assert.deepEqual(r.open().map(i => [i.kind, i.swap && i.swap.price]), [['swap', 'diff']], 'מחיר שונה — החלפה עם "מקבל את ההחלפה"');
  // אותו נייר, במוצר באותו מחיר (חלומית אישית ← בייגל): אחרי הבחירה נסגר לבד, וההחזרה "זוכתה — נייר"
  const S = ret('ret_s', '2026-10-05', [['3701', 2]]), Q = credit('290099442', [['3712', 2]], '2026-10-07');
  const s = app([Q], { returns: [S], today: '2026-10-07' });
  assert.equal(s.items().filter(i => i.kind === 'needsAttach').length, 1);
  s.answer(Q.id, S.id);
  assert.deepEqual(s.open(), []);
  assert.deepEqual(s.swaps(), ['autoSwap:ret_s:code_3701>code_3712×2']);
  assert.equal(s.state('ret_s'), 'done');
  assert.match(s.card('ret_s'), /זוכתה — נייר 99442/);
  // "לא שייך להחזרה" — נספר כמו קודם (עודף), וההחזרה ממשיכה לחכות
  const n = app([Q], { returns: [S], today: '2026-10-07' });
  n.answer(Q.id, '');
  assert.deepEqual(n.items().filter(i => i.state !== 'info').map(i => i.kind).sort(), ['creditedNotReturned', 'returnNotCreditedYet']);
  assert.deepEqual(r.j('testWrites.length'), 0);
});

test('נייר השלמה עם המוצר הלא נכון — שאלה עם ההחזרה; אחרי הבחירה ההחלפה מזוהה (גם כשהמוצר שזוכה כן הוחזר)', () => {
  const R = ret('ret_r', '2026-10-10', [['238', 6], ['339', 6], ['450', 1], ['451', 2]]);
  const main = credit('290099451', [['238', 6], ['339', 6], ['450', 1]], '2026-10-11'), fix = credit('290099452', [['450', 2]], '2026-10-12');
  const r = app([main, fix], { returns: [R], receipts: visits(['2026-10-11', '2026-10-12']) });
  const ask = r.items().filter(i => i.kind === 'needsAttach');
  assert.deepEqual(ask.map(i => i.actions), [['ההחזרה מ-10.10 — חסר בה חלה קלועה ברמן ×2', 'לא שייך להחזרה']]);
  assert.equal(r.items().find(i => i.kind === 'returnedNotCredited').state, 'pending', 'ממתין לנייר שצולם, לא "לבקש מהנהג"');
  r.answer(fix.id, R.id);
  assert.deepEqual(r.open(), []);
  assert.deepEqual(r.swaps(), ['autoSwap:ret_r:code_451>code_450×2']);
  assert.match(r.card('ret_r'), /זוכתה — ניירות 99451, 99452/);
  // בייגל במקום חלומית אישית (בייגל לא הוחזר) — אותו דבר
  const R2 = ret('ret_r2', '2026-10-10', [['238', 6], ['3701', 1]]);
  const m2 = credit('290099453', [['238', 6]], '2026-10-11'), f2 = credit('290099454', [['3712', 1]], '2026-10-12');
  const s = app([m2, f2], { returns: [R2], receipts: visits(['2026-10-11', '2026-10-12']) });
  assert.equal(s.items().filter(i => i.kind === 'needsAttach').length, 1);
  s.answer(f2.id, R2.id);
  assert.deepEqual(s.open(), []);
  assert.equal(s.state('ret_r2'), 'done');
});

test('בלי החזרה שחסר בה בדיוק זה — אין שאלה: "עודף זיכוי" כמו קודם', () => {
  const R = ret('ret_r', '2026-10-05', [['339', 3]]);
  const r = app([credit('290099461', [['333', 4]], '2026-10-07')], { returns: [R], today: '2026-10-07' });
  assert.ok(!r.items().some(i => i.kind === 'needsAttach'));
  assert.deepEqual(r.open().map(i => i.kind), ['creditedNotReturned']);
});
