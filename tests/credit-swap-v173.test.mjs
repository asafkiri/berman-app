// v173 — החלפה בזיכוי: "מועמד יחיד" לא לוקח מוצר שיש לו החלפה מדויקת באותה החזרה.
// המקרה (נייר 97318, 22.11.2026): הוחזרו חלה מרובעת ×3 וחלה קלועה ×2, ובנייר הזיכוי — חלה מרובעת ×5 (הנהג מקיש את כל
// החלות כ"מרובעת"; אותו מחיר) ועוד "לחמניות חלומית" ×1 שלא הוחזרו. כל עוד היה בהחזרה עוד מוצר חסר, ההחלפה באותו מחיר
// נסגרה לבד. ברגע שהמוצר ההוא זוכה (נייר זיכוי משלים), השורה של "לחמניות חלומית" מצאה "מועמד יחיד" — חלה קלועה, שחסרות
// בה 2 — ולקחה אחת מהן: "ברמן זיכתה לחמניות חלומית ×1 במקום חלה קלועה", "חסר זיכוי על חלה קלועה ×1 — לבקש זיכוי מהנהג"
// ו"עודף זיכוי על חלה מרובעת ×2" — שלושה פריטים אדומים על חמש חלות שזוכו כולן.
// עכשיו: מוצר שחסר בו בדיוק מה שמוצר אחר של אותה החזרה זוכה ביתר — זו ההחלפה שלו; שורה של מוצר שלא הוחזר אינה מנחשת אותו.
// כל ההחזרות והניירות כאן מומצאים (מוצרי הקטלוג מ-tests/ledger-2026-10.json).
// הרצה: TZ=Asia/Jerusalem node --test tests/credit-swap-v173.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runtime, fixture } from './receipt-scan-harness.mjs';

const L = JSON.parse(fs.readFileSync(new URL('./ledger-2026-10.json', import.meta.url), 'utf8'));
const name = code => (L.products.find(p => p.id === 'code_' + code) || {}).name || code;
function app(papersList, { returns = [], today = '2026-10-06' } = {}) {
  const r = runtime({ data: { ...fixture(), products: structuredClone(L.products) } });
  r.context.testL = { returns, papers: papersList };
  r.run(`receipts = []; returns = testL.returns; papers = testL.papers; todayStr = () => '${today}'; ledgerInvalidate();`);
  r.j = expr => JSON.parse(r.run('JSON.stringify(' + expr + ')'));
  r.items = () => r.j(`currentLedger().items.map(i => ({ kind: i.kind, state: i.state, key: i.key || (i.keys && i.keys[0] && i.keys[0].key) || null, units: i.units,
    swap: i.swap ? { a: i.swap.a, b: i.swap.b, q: i.swap.q, over: !!i.swap.over, price: i.swap.price } : null, text: ledgerItemText(i, currentLedger(), ledgerAllPapers(currentLedger())).text }))`);
  r.open = () => r.items().filter(i => i.state === 'problem' || i.state === 'question');
  r.state = () => r.run('returnStateNow(returns[0])');
  return r;
}
const ret = (id, rows, date = '2026-10-03') => ({ id, date, docDate: date, credited: false, timestamp: Date.parse(date + 'T08:00:00'), sentTo: 'הנהג',
  items: rows.map(([code, qty]) => ({ productId: 'code_' + code, code, name: name(code), barcode: '', qty })) });
const credit = (number, rows, docDay = '2026-10-04') => ({ schema: 1, state: 'accepted', id: 'paper_' + number, kind: 'credit', number, terminalNumber: number, numerator: number.slice(-5), docDay, printedTime: '10:00',
  timestamp: Date.parse(docDay + 'T10:00:00') + Number(number.slice(-2)),
  rows: rows.map(([code, qty], i) => ({ line: i + 1, itemCode: code, barcode: '', description: code, qty, productId: 'code_' + code, matchedBy: 'code' })),
  anchors: { units: rows.reduce((a, x) => a + x[1], 0), lines: rows.length, source: 'printed' }, proof: { unitsOk: true, linesOk: true } });
const SAME = { kind: 'autoSwap', state: 'info', key: 'code_451', units: 2, swap: { a: 'code_451', b: 'code_450', q: 2, over: true, price: 'same' },
  text: 'ברמן זיכתה חלה מרובעת ברמן ×2 במקום חלה קלועה ברמן שהחזרת ב-3.10 — אותו מחיר, התקזז. אין מה לבקש' };
const EXTRA = 'עודף זיכוי: ברמן זיכתה לחמניות חלומית 4 בשקית ×1 שלא החזרת — לבדוק שהנייר נקרא נכון';

test('חלה מרובעת ×5 על מרובעת ×3 + קלועה ×2, ועוד מוצר שלא הוחזר ×1: ההחלפה באותו מחיר נסגרת לבד, והמוצר הנוסף הוא עודף זיכוי — בלי "חסר זיכוי על חלה קלועה"', () => {
  const R = ret('ret_challah', [['450', 3], ['451', 2], ['238', 4], ['344', 2], ['233', 5]]);
  const r = app([credit('290099501', [['450', 5], ['238', 4], ['344', 2], ['233', 5], ['221', 1]])], { returns: [R] });
  assert.deepEqual(r.items().filter(i => i.kind === 'autoSwap'), [SAME]);
  assert.deepEqual(r.open().map(i => [i.kind, i.key, i.units, i.text]), [['creditedNotReturned', 'code_221', 1, EXTRA]]);
  assert.ok(!r.items().some(i => i.kind === 'swap' || i.kind === 'returnedNotCredited'), 'אין החלפה מנוחשת ואין חוסר על חלה שזוכתה');
  assert.deepEqual(r.j(`['code_450', 'code_451'].map(k => currentLedger().products[k].net)`), [0, 0]);
  assert.equal(r.state(), 'done', 'ההחזרה זוכתה; הזיכוי העודף אינו פותח אותה');
});

test('המסלול של 22.11: עוד מוצר חסר בהחזרה — ואחר כך נייר זיכוי משלים עליו; החלות נשארות סגורות גם אחריו', () => {
  const R = ret('ret_two_step', [['450', 3], ['451', 2], ['649', 3], ['238', 4], ['344', 2], ['233', 5]]);
  const main = { ...credit('290099502', [['450', 5], ['238', 4], ['344', 2], ['233', 5], ['221', 1]]), nominal: [{ line: 6, itemCode: '1649', barcode: '4033064', description: 'לחמניות כוסמין', qty: 3, productId: null, matchedBy: null, price: 0.01 }] };
  const before = app([main], { returns: [R] });
  assert.deepEqual(before.items().filter(i => i.kind === 'autoSwap'), [SAME]);
  assert.deepEqual(before.open().map(i => [i.kind, i.key, i.text]), [
    ['returnedNotCredited', 'code_649', 'חסר זיכוי על 6 לחמניות כוסמין ×3 מההחזרה של 3.10 — לבקש זיכוי מהנהג'], ['creditedNotReturned', 'code_221', EXTRA]]);
  // למחרת: הנהג מזכה את 6 לחמניות כוסמין בנייר נפרד (האפליקציה משייכת אותו להחזרה כזיכוי משלים)
  const after = app([main, credit('290099503', [['649', 3]], '2026-10-05')], { returns: [R] });
  assert.equal(after.j(`paperAttachShown(papers[1])`), 'זיכוי משלים להחזרה מ-3.10');
  assert.deepEqual(after.items().filter(i => i.kind === 'autoSwap'), [SAME], 'אותה החלפה, עדיין סגורה');
  assert.deepEqual(after.open().map(i => [i.kind, i.key, i.text]), [['creditedNotReturned', 'code_221', EXTRA]]);
  assert.ok(!after.items().some(i => i.kind === 'swap' || i.kind === 'returnedNotCredited'));
  assert.equal(after.state(), 'done');
});

test('מה שלא השתנה: בלי עודף מדויק על מוצר אחר — "מועמד יחיד" עדיין מוצע כהחלפה לטיפול, והיתרה חסרה', () => {
  // אין עודף בכלל: קלועה ×2 חסרה, ושורה של מוצר שלא הוחזר ×1
  const R1 = ret('ret_single', [['451', 2], ['238', 4], ['344', 2], ['233', 5]]);
  const a = app([credit('290099504', [['238', 4], ['344', 2], ['233', 5], ['221', 1]])], { returns: [R1] });
  assert.deepEqual(a.open().map(i => [i.kind, i.key, i.units]), [['swap', 'code_451', 1], ['returnedNotCredited', 'code_451', 1]]);
  assert.deepEqual(a.open()[0].swap, { a: 'code_451', b: 'code_221', q: 1, over: false, price: 'diff' });
  assert.equal(a.open()[0].text, 'ברמן זיכתה לחמניות חלומית 4 בשקית ×1 במקום חלה קלועה ברמן שהחזרת ב-3.10');
  // עודף שאינו בדיוק בכמות החסרה (מרובעת ×4 על ×3, קלועה ×2 חסרה): לא החלפה מדויקת — כמו עד 172
  const R2 = ret('ret_inexact', [['450', 3], ['451', 2], ['238', 4], ['344', 2], ['233', 5]]);
  const b = app([credit('290099505', [['450', 4], ['238', 4], ['344', 2], ['233', 5], ['221', 1]])], { returns: [R2] });
  assert.deepEqual(b.open().map(i => [i.kind, i.key, i.units]).sort(), [['creditedNotReturned', 'code_450', 1], ['returnedNotCredited', 'code_451', 1], ['swap', 'code_451', 1]]);
  // שורה של מוצר שלא הוחזר בדיוק בכמות החסרה — החלפה מדויקת שלה, כמו תמיד (גם כשיש עודף מדויק על מוצר אחר)
  const R3 = ret('ret_exact_loose', [['450', 3], ['451', 2], ['238', 4], ['344', 2], ['233', 5]]);
  const c = app([credit('290099506', [['450', 5], ['238', 4], ['344', 2], ['233', 5], ['221', 2]])], { returns: [R3] });
  assert.deepEqual(c.items().filter(i => i.kind === 'swap').map(i => i.swap), [{ a: 'code_451', b: 'code_221', q: 2, over: false, price: 'diff' }]);
});
