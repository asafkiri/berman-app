// v143 — החלפה בזיכוי (ברמן זיכתה מוצר אחד במקום אחר) לא נעלמת בגלל תעודה מאוחרת יותר של אותו מוצר.
// המקרה (18.10.2026): ב-10.10 הוחזרו חלה מרובעת ×1 וחלה קלועה ×2, ותעודת הזיכוי מ-11.10 זיכתה חלה מרובעת ×3 —
// אותו מחיר, החלפה שנסגרה לבד. ב-17.10 נשלחה החזרה עם חלה מרובעת ×6 שעוד חיכתה לזיכוי, והמאזן "קיזז" מולה את
// 2 החלות המרובעות העודפות מ-10.10: ההחלפה נעלמה, הופיע "חסר זיכוי על חלה קלועה ×2 מההחזרה של 10.10 — לבקש זיכוי
// מהנהג", וההחזרה של 17.10 חיכתה רק ל-4 חלות מרובעות. כל הנתונים כאן מומצאים (מוצרי הקטלוג מ-tests/ledger-2026-10.json);
// הגיבוי של המשתמש אינו במאגר.
// מה שנבדק, על האפליקציה כולה (המאזן, ההתראות וכרטיס ההחזרה בהיסטוריה):
// - חוסר במוצר שזוכה במקום — בהחזרה שנשלחה אחרי היום של הנייר (ממתינה לזיכוי, או שהנייר שלה זיכה פחות), או בקליטה
//   מיותר מיום אחריו — לא מבטל את ההחלפה: הנייר לא יכול היה לזכות עליו. כל תעודה מראה את מה שבה.
// - מה שנשאר כמו קודם: החזרה מלפני הנייר שעוד מחכה לזיכוי, חוסר בקליטה ביום שאחרי הנייר, ונייר חיוב של ברמן על המוצר
//   שזוכה במקום (ביטול הזיכוי העודף) — אין החלפה, ושני הצדדים גלויים.
// - החזרה שנייר זיכוי מהנהג כבר נגע בה — בלי "החזר את הפריטים לרשימת החזרות", "מזג" ו"שלח שוב", גם כשחסרה בה שורה:
//   הנהג לקח אותה וזיכה, והחזרה לרשימה או מיזוג היו תובעים שוב את מה שזוכה.
// - שום תעודה שמורה לא נכתבת.
// הרצה: TZ=Asia/Jerusalem node --test tests/credit-swap-v143.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runtime, fixture } from './receipt-scan-harness.mjs';

const L = JSON.parse(fs.readFileSync(new URL('./ledger-2026-10.json', import.meta.url), 'utf8'));
const strip = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&#039;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const name = code => (L.products.find(p => p.id === 'code_' + code) || {}).name || code;

function app(papersList, { receipts = [], returns = [], today = '2026-10-07' } = {}) {
  const r = runtime({ data: { ...fixture(), products: structuredClone(L.products) } });
  r.context.testL = { receipts, returns, papers: papersList };
  r.context.testWrites = [];
  r.run(`receipts = testL.receipts; returns = testL.returns; papers = testL.papers; todayStr = () => '${today}';
    runCloudTask = async (label, task) => { testWrites.push(task); return true; }; runCloudTaskSilent = runCloudTask; ledgerInvalidate();`);
  r.j = expr => JSON.parse(r.run('JSON.stringify(' + expr + ')'));
  r.items = () => r.j(`currentLedger().items.map(i => ({ id: i.id, kind: i.kind, state: i.state, key: i.key || null, units: i.units, keys: i.keys || null,
    swap: i.swap ? { a: i.swap.a, b: i.swap.b, q: i.swap.q, over: !!i.swap.over, price: i.swap.price } : null,
    text: ledgerItemText(i, currentLedger(), ledgerAllPapers(currentLedger())).text, detail: ledgerItemText(i, currentLedger(), ledgerAllPapers(currentLedger())).detail || '' }))`);
  r.open = () => r.items().filter(i => i.state === 'problem' || i.state === 'question');
  r.kinds = () => r.items().filter(i => i.kind === 'swap' || i.kind === 'autoSwap').map(i => i.kind + ':' + (i.swap && i.swap.price));
  r.card = id => r.run(`returnCardInReceipts(returns.find(x => x.id === '${id}'))`);
  r.state = id => r.run(`returnStateNow(returns.find(x => x.id === '${id}'))`);
  return r;
}
const ret = (id, rows, date) => ({ id, date, docDate: date, credited: false, timestamp: Date.parse(date + 'T08:00:00'), sentTo: 'הנהג',
  items: rows.map(([code, qty]) => ({ productId: 'code_' + code, code, name: name(code), barcode: '', qty })) });
const paper = (kind, number, rows, docDay) => ({ schema: 1, state: 'accepted', id: 'paper_' + number, kind, number, terminalNumber: number, numerator: number.slice(-5), docDay, printedTime: '10:00',
  timestamp: Date.parse(docDay + 'T10:00:00') + Number(number.slice(-2)),
  rows: rows.map(([code, qty], i) => ({ line: i + 1, itemCode: code, barcode: '', description: code, qty, productId: 'code_' + code, matchedBy: 'code' })),
  anchors: { units: rows.reduce((a, x) => a + x[1], 0), lines: rows.length, source: 'printed' }, proof: { unitsOk: true, linesOk: true } });
const credit = (number, rows, docDay) => paper('credit', number, rows, docDay);
const receipt = (id, date, rows) => ({ id, date, docDate: date, timestamp: Date.parse(date + 'T06:00:00'),
  items: rows.map(([code, qty, noteQty]) => ({ productId: 'code_' + code, code, name: name(code), qty, noteQty })) });
// סכום הפריטים שמוצגים לכל מוצר שווה למאזן שלו (כמו ב-credit-swap-v141)
const accounting = r => r.j(`(function(){ const lg = currentLedger(), out = {};
  lg.items.forEach(i => {
    const add = (k, u) => { out[k] = Math.round(((out[k] || 0) + u) * 1000) / 1000; };
    if (i.kind === 'swap') { add(i.swap.a, i.units); add(i.swap.b, -i.units); return; }
    if (!i.part || ['netted', 'autoSwap', 'autoCorrection'].indexOf(i.kind) !== -1) return;
    const sign = ['chargedNotReceived', 'chargedTwice', 'returnedNotCredited', 'returnNotCreditedYet', 'paperChargeNotReceived'].indexOf(i.kind) !== -1 ? 1 : -1;
    (i.keys || [{ key: i.key, units: i.units }]).forEach(z => add(z.key, sign * z.units));
  });
  return Object.keys(lg.products).filter(k => lg.products[k].net || out[k]).map(k => [k, lg.products[k].net, out[k] || 0]); })()`);
const balanced = r => accounting(r).forEach(([k, net, shown]) => assert.equal(shown, net, 'מוצג מול המאזן: ' + k));

// ההחזרה מ-3.10 (חלה מרובעת ×1, חלה קלועה ×2), ותעודת הזיכוי שלה מ-4.10 (חלה מרובעת ×3) — אותו מחיר
const R = () => ret('ret_r', [['450', 1], ['451', 2], ['238', 5], ['344', 4]], '2026-10-03');
const P = () => credit('290099701', [['450', 3], ['238', 5], ['344', 4]], '2026-10-04');
// ההחזרה הבאה, מ-6.10 — עם חלה מרובעת ×6
const Y = () => ret('ret_y', [['450', 6], ['101', 2]], '2026-10-06');
const SWAP_TEXT = 'ברמן זיכתה חלה מרובעת ברמן ×2 במקום חלה קלועה ברמן שהחזרת ב-3.10 — אותו מחיר, התקזז. אין מה לבקש';

test('המקרה: החזרה מאוחרת שמחכה לזיכוי על חלה מרובעת — ההחלפה מ-3.10 נשארת "אותו מחיר, התקזז", והמאוחרת מחכה לכל ה-6', () => {
  const r = app([P()], { returns: [R(), Y()] });
  assert.deepEqual(r.open(), [], 'בלי "חסר זיכוי על חלה קלועה" ובלי שום דבר לטיפול');
  const sw = r.items().filter(i => i.kind === 'autoSwap');
  assert.deepEqual(sw.map(i => [i.state, i.key, i.units, i.swap]), [['info', 'code_451', 2, { a: 'code_451', b: 'code_450', q: 2, over: true, price: 'same' }]]);
  assert.equal(sw[0].text, SWAP_TEXT);
  const wait = r.items().filter(i => i.kind === 'returnNotCreditedYet');
  assert.deepEqual(wait.map(i => [i.state, i.text]), [['pending', 'ההחזרה מ-6.10 (2 מוצרים, 8 יח׳) — ממתינה לתעודת זיכוי']]);
  assert.match(wait[0].detail, /חלה מרובעת ברמן ×6/, 'כל 6 החלות המרובעות — לא 4');
  balanced(r);
  assert.equal(r.state('ret_r'), 'done');
  assert.equal(r.state('ret_y'), 'credit');
  assert.deepEqual(r.j('openIssuesList()'), [], 'אין "דבר אחד לטיפול מול ברמן"');
  const banner = r.run('pendingReturnsBannerHtml()');
  assert.match(banner, /bg-amber-400[\s\S]*יש תעודת חזרות פתוחה לאימות/, 'רק ההחזרה שממתינה — בכתום');
  assert.doesNotMatch(banner, /bg-rose-600|יש פער בזיכוי/);
  assert.doesNotMatch(strip(r.run('returnsBalanceBannerHtml()')), /חסר זיכוי/);
  const card = strip(r.card('ret_r'));
  assert.match(card, /זוכתה — נייר 99701/);
  assert.match(card, /חלה קלועה ברמן .*זוכה 0 · במקומו זוכה חלה מרובעת ברמן ×2 \(אותו מחיר — התקזז\)/);
  assert.doesNotMatch(card, /חסר זיכוי|לטיפול במאזן/);
  assert.deepEqual(r.j('testWrites.length'), 0, 'תצוגה בלבד');
});

test('ההחזרה המאוחרת זוכתה בנייר שלה על 4 מתוך 6 — החוסר שלה, בשמה; ההחלפה מ-3.10 לא נפתחת', () => {
  const r = app([P(), credit('290099702', [['450', 4], ['101', 2]], '2026-10-07')], { returns: [R(), Y()], today: '2026-10-08' });
  const open = r.open();
  assert.deepEqual(open.map(i => [i.kind, i.key, i.units]), [['returnedNotCredited', 'code_450', 2]]);
  assert.equal(open[0].text, 'חסר זיכוי על חלה מרובעת ברמן ×2 מההחזרה של 6.10 — לבקש זיכוי מהנהג');
  assert.match(open[0].detail, /^חלה מרובעת ברמן: הוחזרו 6, זוכו 4\./);
  assert.deepEqual(r.kinds(), ['autoSwap:same']);
  balanced(r);
  assert.equal(r.state('ret_r'), 'done');
  assert.equal(r.state('ret_y'), 'open');
  // והנייר שלה זיכה את כל 6 — הכל סגור
  const full = app([P(), credit('290099703', [['450', 6], ['101', 2]], '2026-10-07')], { returns: [R(), Y()], today: '2026-10-08' });
  assert.deepEqual(full.open(), []);
  assert.deepEqual(full.kinds(), ['autoSwap:same']);
  assert.deepEqual([full.state('ret_r'), full.state('ret_y')], ['done', 'done']);
});

test('חוסר בחלה מרובעת בקליטה מיותר מיום אחרי הנייר — ההחלפה נשארת, והחוסר בקליטה גלוי בשמו', () => {
  const r = app([P()], { returns: [R()], receipts: [receipt('rc_later', '2026-10-06', [['450', 1, 3]])] });
  assert.deepEqual(r.kinds(), ['autoSwap:same']);
  const open = r.open();
  assert.deepEqual(open.map(i => [i.kind, i.key, i.units]), [['chargedNotReceived', 'code_450', 2]]);
  assert.match(open[0].text, /^חוסר בקליטה של 6\.10: חלה מרובעת ברמן ×2 — חויבת ולא קיבלת/);
  balanced(r);
  assert.equal(r.state('ret_r'), 'done');
});

test('הנייר זיכה מוצר שלא הוחזר בכלל (חלה מרובעת במקום חלה קלועה), ואחר כך החזרה עם חלה מרובעת — עדיין החלפה', () => {
  const R0 = ret('ret_r0', [['451', 2], ['238', 5], ['344', 4]], '2026-10-03');
  const r = app([credit('290099704', [['450', 2], ['238', 5], ['344', 4]], '2026-10-04')], { returns: [R0, Y()] });
  assert.deepEqual(r.open(), []);
  const sw = r.items().find(i => i.kind === 'autoSwap');
  assert.deepEqual(sw.swap, { a: 'code_451', b: 'code_450', q: 2, over: false, price: 'same' });
  assert.equal(sw.text, SWAP_TEXT);
  assert.match(r.items().find(i => i.kind === 'returnNotCreditedYet').detail, /חלה מרובעת ברמן ×6/);
  balanced(r);
  assert.equal(r.state('ret_r0'), 'done');
});

test('מחיר שונה, ואחר כך החזרה עם המוצר שזוכה במקום — החלפה לטיפול עם "מקבל את ההחלפה", לא "חסר זיכוי"', () => {
  const D = ret('ret_d', [['100', 1], ['101', 2], ['238', 5], ['344', 4]], '2026-10-03');
  const r = app([credit('290099705', [['100', 3], ['238', 5], ['344', 4]], '2026-10-04')], { returns: [D, ret('ret_y100', [['100', 4]], '2026-10-06')] });
  const open = r.open();
  assert.deepEqual(open.map(i => [i.kind, i.key, i.units, i.swap && i.swap.price]), [['swap', 'code_101', 2, 'diff']]);
  assert.equal(open[0].text, 'ברמן זיכתה לחם אחיד ברמן ×2 במקום אחיד פרוס ברמן שהחזרת ב-3.10');
  assert.deepEqual(r.j(`ledgerItemText(currentLedger().items.find(i => i.kind === 'swap'), currentLedger(), papers).actions.map(a => a.role)`), ['ledger-accept-swap', 'ledger-paper-open']);
  assert.equal(r.items().find(i => i.kind === 'returnNotCreditedYet').text, 'ההחזרה מ-6.10 (לחם אחיד ברמן ×4) — ממתינה לתעודת זיכוי');
  balanced(r);
});

test('מה שנשאר כמו קודם: החזרה מלפני הנייר שמחכה לזיכוי, חוסר בקליטה ביום שאחרי הנייר, נייר חיוב של ברמן — אין החלפה, החוסר גלוי', () => {
  const missing = r => r.open().some(i => i.kind === 'returnedNotCredited' && i.key === 'code_451' && i.units === 2);
  // החזרה מ-2.10 (לפני הנייר) שעוד מחכה לזיכוי על חלה מרובעת — אולי הנייר זיכה אותה; לא מנחשים
  const early = app([P()], { returns: [ret('ret_early', [['450', 2]], '2026-10-02'), R()] });
  assert.deepEqual(early.kinds(), []);
  assert.ok(missing(early), 'החוסר בחלה קלועה גלוי');
  balanced(early);
  // חוסר בחלה מרובעת בקליטה של 5.10 (יום אחרי הנייר) — הנייר אולי זיכה עליו (כמו בשיוך של נייר לקליטה)
  const next = app([P()], { returns: [R()], receipts: [receipt('rc_next', '2026-10-05', [['450', 1, 3]])] });
  assert.deepEqual(next.kinds(), []);
  assert.ok(missing(next));
  balanced(next);
  // נייר חיוב של ברמן על חלה מרובעת ×2 אחרי הנייר — ברמן ביטלה את הזיכוי העודף, וחלה קלועה עדיין לא זוכתה
  const charge = app([P(), paper('charge', '290099706', [['450', 2]], '2026-10-06')], { returns: [R()] });
  assert.deepEqual(charge.kinds(), []);
  assert.ok(missing(charge));
  balanced(charge);
});

test('החזרה שנייר זיכוי מהנהג נגע בה — בלי "החזר לרשימה", "מזג" ו"שלח שוב", גם כשחסרה בה שורה; החזרה בלי נייר — כמו קודם', async () => {
  const S = ret('ret_short', [['450', 1], ['451', 2], ['238', 5]], '2026-10-03');
  const r = app([credit('290099707', [['450', 1], ['238', 5]], '2026-10-04')], { returns: [S, ret('ret_o1', [['101', 2]], '2026-10-05'), ret('ret_o2', [['220', 1]], '2026-10-06')] });
  assert.deepEqual(r.open().map(i => [i.kind, i.key, i.units]), [['returnedNotCredited', 'code_451', 2]], 'החוסר האמיתי נשאר לטיפול');
  assert.equal(r.state('ret_short'), 'open');
  assert.equal(r.run(`returnStillOpen(returns[0])`), false);
  const card = r.card('ret_short');
  assert.match(strip(card), /לטיפול במאזן/);
  assert.doesNotMatch(card, /data-role="ret-unsend"|data-role="ret-merge"|data-role="ret-resend"/);
  assert.match(card, /data-role="ret-edit-items"[\s\S]*data-role="ret-delete"/, 'עריכה ומחיקה — כמו קודם');
  assert.match(r.card('ret_o1'), /data-role="ret-resend"[\s\S]*data-role="ret-unsend"[\s\S]*data-role="ret-merge"/, 'החזרה בלי נייר — כמו קודם');
  r.run(`openReturnUnsendConfirm('ret_short')`);
  assert.ok(r.toasts.some(t => /כבר זיכה את התעודה הזאת בנייר/.test(t)));
  r.run(`openReturnMergePicker('ret_short')`);
  assert.ok(r.toasts.some(t => /אפשר למזג רק תעודת חזרה פתוחה/.test(t)));
  // גם כשהחלון כבר היה פתוח: ההחזרה עם הנייר לא מוצעת למיזוג, ואם נבחרה — המיזוג מתבטל
  r.run(`openReturnMergePicker('ret_o1')`);
  const list = r.node('retMergeList').innerHTML;
  assert.match(list, /data-id="ret_o2"/);
  assert.doesNotMatch(list, /data-id="ret_short"/);
  r.run(`retMergeTargetId = 'ret_o1'; confirmReturnMergePick('ret_short')`);
  assert.ok(r.toasts.some(t => /המיזוג בוטל/.test(t)));
  // זיכוי חלקי בנייר משלים בלבד (בלי נייר ראשי) — הנהג לקח אותה: גם בלי "החזר לרשימה"
  const side = app([credit('290099708', [['450', 1], ['451', 2]], '2026-10-04')], { returns: [ret('ret_side', [['450', 1], ['451', 2], ['238', 5], ['344', 4], ['100', 2]], '2026-10-03')] });
  assert.equal(side.j(`currentLedger().placed[0].attach.role`), 'side');
  assert.equal(side.state('ret_side'), 'credit');
  assert.doesNotMatch(side.card('ret_side'), /data-role="ret-unsend"|data-role="ret-merge"|data-role="ret-resend"/);
  assert.deepEqual(r.j('testWrites.length'), 0);
});
