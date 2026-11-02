// v153 — המרכזת: ההחזרה הולכת אחרי תעודת הזיכוי שלה. נייר זיכוי מחודש אחר מההחזרה נספר בחודש שלו (החלטת ברמן,
// v128/v142), אבל ההחזרה נשארה בחודש שנשלחה: אותה החזרה הייתה "חסרו ועדיין לא זוכו" באוקטובר ו"התקבלו מעבר למה
// שחויב" בנובמבר (2.11.2026: ההחזרה מ-31.10, 26 יח׳, נייר 96389 מ-1.11). עכשיו שורת החזרה שהזיכוי עליה נספר
// בחודש אחר נספרת שם, באותו יום — "הוחזר" ו"זוכה" באותו חודש, ושורת מידע בשני החודשים.
// נתונים מומצאים (מוצרי הקטלוג מ-tests/ledger-2026-10.json), באותו מבנה כמו המקרה, כולל ההחלפה 451 → 450.
// הרצה: TZ=Asia/Jerusalem node --test tests/return-follows-credit-v153.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runtime, fixture } from './receipt-scan-harness.mjs';

const L = JSON.parse(fs.readFileSync(new URL('./ledger-2026-10.json', import.meta.url), 'utf8'));
const name = code => (L.products.find(p => p.id === 'code_' + code) || {}).name || code;
const ret = (id, date, rows) => ({ id, date, docDate: date, credited: false, timestamp: Date.parse(date + 'T07:05:00'), sentTo: 'קבוצה בוואטסאפ',
  items: rows.map(([code, qty]) => ({ productId: 'code_' + code, code, name: name(code), barcode: '', qty })) });
const credit = (number, rows, docDay) => ({ schema: 1, state: 'accepted', id: 'paper_' + number, kind: 'credit', kindKnown: true, number, terminalNumber: number, numerator: number.slice(-5), docDay, printedTime: null,
  headerText: 'ח.משלוח החזרה יבש', timestamp: Date.parse(docDay + 'T08:00:00'),
  rows: rows.map(([code, qty], i) => ({ line: i + 1, itemCode: code, barcode: '', description: name(code), qty, productId: 'code_' + code, matchedBy: 'tnuva_code_exact' })),
  anchors: { units: rows.reduce((a, x) => a + x[1], 0), lines: rows.length, source: 'printed' }, proof: { unitsOk: true, linesOk: true, checkOk: true, scanStatus: 'verified' } });
const rc = (date, n) => ({ id: 'rc_' + date, date, docDate: date, timestamp: Date.parse(date + 'T07:00:00'), status: 'ok', noteParts: [], paperDocs: [{ number: '24470000' + n }],
  items: [{ productId: 'code_101', code: '101', name: name('101'), qty: 5, noteQty: 5 }] });
const RECS = () => ['2026-10-15', '2026-10-22', '2026-10-29', '2026-11-03', '2026-11-05'].map((d, i) => rc(d, i));

function app(papersList, returnsList, today = '2026-11-06') {
  const r = runtime({ data: { ...fixture(), products: structuredClone(L.products) } });
  r.context.T = { receipts: RECS(), returns: returnsList, papers: papersList };
  r.run(`products = testData.products; receipts = T.receipts; returns = T.returns; papers = T.papers; todayStr = () => '${today}'; ledgerInvalidate();`);
  r.month = (from, to) => JSON.parse(r.run(`JSON.stringify((() => { const d = receiptRangeData('${from}', '${to}');
    const rows = {}; d.matrix.list.forEach(x => { if (x.code) rows[x.code] = { billed: x.billed, sent: x.sent, credited: x.credited, open: x.openUnits }; });
    return { rets: d.rets.length, retIds: d.rets.map(x => x.id), net: d.netEx, fair: d.fairEx, claimsEx: d.openClaimsEx, claimUnits: d.openClaimUnits - (d.swapShort || 0),
      overUnits: d.overUnits - (d.swapOver || 0), moved: d.retMoved, note: rangeReturnMovedHtml(d).replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim(), rows }; })())`));
  return r;
}
const OCT = ['2026-10-01', '2026-10-31'], NOV = ['2026-11-01', '2026-11-30'], BOTH = ['2026-10-01', '2026-11-30'];
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.011, (msg || '') + ' (' + a + ' ≠ ' + b + ')'); // עד אגורה — עיגול של כל חודש בנפרד

test('המקרה מ-2.11: החזרה מ-31.10 שזוכתה בנייר מ-1.11, עם החלפה 451 → 450 — נספרת בנובמבר, בלי חוסר באוקטובר ובלי עודף בנובמבר', () => {
  // ההחזרה: 450 ×3, 451 ×3, 242 ×5, 459 ×2 (13 יח׳); הנייר: 450 ×6 (במקום 451), 242 ×5, 459 ×2
  const R31 = ret('ret_3110', '2026-10-31', [['450', 3], ['451', 3], ['242', 5], ['459', 2]]);
  const P = credit('290096389', [['450', 6], ['242', 5], ['459', 2]], '2026-11-01');
  const r = app([P], [R31]);
  assert.equal(r.run(`(currentLedger().swaps || []).filter(s => s.returnId === 'ret_3110' && s.settled).length`), 1, 'ההחלפה נסגרה (אותו מחיר)');
  const oct = r.month(...OCT), nov = r.month(...NOV), both = r.month(...BOTH);
  // אוקטובר: ההחזרה יצאה מהחודש — בלי "חסרו ועדיין לא זוכו"
  assert.equal(oct.rets, 0, 'ב-152: תעודת החזרה אחת, 13 יח׳ "חסרו ועדיין לא זוכו"');
  assert.equal(oct.claimUnits, 0); assert.equal(oct.overUnits, 0); near(oct.claimsEx, 0, 'מה שבאמת מגיע = הצפוי בחשבונית');
  assert.equal(oct.rows['242'], undefined, 'המוצר לא מופיע בטבלה של אוקטובר');
  assert.deepEqual(oct.moved, { out: [{ id: 'ret_3110', day: '2026-10-31', creditDay: '2026-11-01', units: 13 }], in: [] });
  assert.equal(oct.note, '13 יח׳ מההחזרה מ-31.10 זוכו ב-1.11 — נספרות בחודש של הזיכוי');
  // נובמבר: ההחזרה לצד הנייר — הוחזר 13, זוכה 13 (3 מהם במוצר אחר, החלפה שנסגרה), בלי "מעבר למה שחויב"
  assert.equal(nov.rets, 1); assert.deepEqual(nov.retIds, ['ret_3110']);
  assert.deepEqual(nov.rows['242'], { billed: 0, sent: 5, credited: 5, open: 0 });
  assert.deepEqual(nov.rows['450'], { billed: 0, sent: 3, credited: 6, open: -3 }, 'זוכה 6 במקום 3 + 3 של 451');
  assert.deepEqual(nov.rows['451'], { billed: 0, sent: 3, credited: 0, open: 3 }, 'המוצר שהוחזר והוחלף — באותו חודש כמו הזיכוי שניתן במקומו');
  assert.equal(nov.claimUnits, 0, 'ההחלפה מסבירה את ה-3'); assert.equal(nov.overUnits, 0);
  near(nov.claimsEx, 0, 'אותו מחיר — אין הפרש כסף');
  assert.deepEqual(nov.moved, { out: [], in: [{ id: 'ret_3110', day: '2026-10-31', creditDay: '2026-11-01', units: 13 }] });
  assert.equal(nov.note, 'כולל 13 יח׳ מההחזרה מ-31.10 שזוכו ב-1.11');
  // שני החודשים יחד — אותו סכום: ההעברה בין חודשים לא משנה כלום בסך הכול
  near(oct.net + nov.net, both.net, 'צפוי בחשבונית'); near(oct.fair + nov.fair, both.fair, 'מה שבאמת מגיע');
  near(both.claimsEx, 0); assert.equal(both.rets, 1); assert.equal(both.note, '', 'בטווח שמכיל את שניהם — אין מה להסביר');
});

test('נייר באותו חודש — כמו קודם; החזרה שעוד אין עליה נייר — נשארת בחודש שלה כ"חסרו ועדיין לא זוכו"', () => {
  const R20 = ret('ret_2010', '2026-10-20', [['242', 5], ['459', 2]]);
  const same = app([credit('290095900', [['242', 5], ['459', 2]], '2026-10-22')], [R20]).month(...OCT);
  assert.equal(same.rets, 1); assert.equal(same.claimUnits, 0); assert.equal(same.overUnits, 0); near(same.claimsEx, 0);
  assert.deepEqual(same.moved, { out: [], in: [] }); assert.equal(same.note, '');
  const none = app([], [ret('ret_3110', '2026-10-31', [['242', 5], ['459', 2]])]);
  const oct = none.month(...OCT);
  assert.equal(oct.rets, 1); assert.equal(oct.claimUnits, 7, 'עוד לא זוכתה — חוסר בחודש שנשלחה, עד שיגיע נייר');
  assert.ok(oct.claimsEx > 0); assert.deepEqual(oct.moved, { out: [], in: [] });
  assert.equal(none.month(...NOV).rets, 0);
});

test('זיכוי חלקי: רק השורות שזוכו עוברות לחודש של הנייר; מה שלא זוכה נשאר בחודש שנשלח כחוסר', () => {
  const R31 = ret('ret_3110', '2026-10-31', [['242', 5], ['459', 2]]);
  const r = app([credit('290096389', [['242', 5]], '2026-11-01')], [R31]);
  const oct = r.month(...OCT), nov = r.month(...NOV), both = r.month(...BOTH);
  assert.equal(oct.rets, 1, 'ההחזרה עוד בחודש — בגלל השורה שלא זוכתה');
  assert.deepEqual(oct.rows['459'], { billed: 0, sent: 2, credited: 0, open: 2 }); assert.equal(oct.rows['242'], undefined);
  assert.equal(oct.claimUnits, 2); assert.deepEqual(oct.moved.out, [{ id: 'ret_3110', day: '2026-10-31', creditDay: '2026-11-01', units: 5 }]);
  assert.equal(oct.note, '5 יח׳ מההחזרה מ-31.10 זוכו ב-1.11 — נספרות בחודש של הזיכוי');
  assert.equal(nov.rets, 1); assert.deepEqual(nov.rows['242'], { billed: 0, sent: 5, credited: 5, open: 0 }); assert.equal(nov.rows['459'], undefined);
  assert.equal(nov.claimUnits, 0); assert.equal(nov.overUnits, 0);
  assert.equal(nov.note, 'כולל 5 יח׳ מההחזרה מ-31.10 שזוכו ב-1.11');
  near(oct.net + nov.net, both.net); near(oct.fair + nov.fair, both.fair); assert.equal(both.claimUnits, 2);
});

test('החזרה שזוכתה בשני ניירות בשני חודשים — כל שורה בחודש של הנייר שלה, בלי חוסר ובלי עודף באף חודש', () => {
  const R26 = ret('ret_2610', '2026-10-26', [['242', 5], ['459', 2]]);
  const r = app([credit('290096100', [['242', 5]], '2026-10-27'), credit('290096400', [['459', 2]], '2026-11-02')], [R26]);
  const oct = r.month(...OCT), nov = r.month(...NOV), both = r.month(...BOTH);
  assert.equal(oct.rets, 1); assert.deepEqual(oct.rows['242'], { billed: 0, sent: 5, credited: 5, open: 0 }); assert.equal(oct.rows['459'], undefined);
  assert.equal(oct.claimUnits, 0); assert.equal(oct.overUnits, 0); near(oct.claimsEx, 0);
  assert.equal(oct.note, '2 יח׳ מההחזרה מ-26.10 זוכו ב-2.11 — נספרות בחודש של הזיכוי');
  assert.equal(nov.rets, 1); assert.deepEqual(nov.rows['459'], { billed: 0, sent: 2, credited: 2, open: 0 }); assert.equal(nov.rows['242'], undefined);
  assert.equal(nov.claimUnits, 0); assert.equal(nov.overUnits, 0); near(nov.claimsEx, 0);
  assert.equal(nov.note, 'כולל 2 יח׳ מההחזרה מ-26.10 שזוכו ב-2.11');
  near(oct.net + nov.net, both.net); near(oct.fair + nov.fair, both.fair); near(both.claimsEx, 0);
});
