// v174 — שלושה ליטושים ל-173 (שורה במחיר אפסי בנייר זיכוי, וה"מועמד היחיד" בהחלפות), מסקירה של הקוד אחרי המיזוג.
// 1. "מועמד יחיד" (שורה של מוצר שלא הוחזר, כשהמוצר היחיד שחסר בהחזרה חסר ביותר מהכמות שלה) הוא ניחוש, והוא נסוג רק
//    כשהוא חוסם החלפה מדויקת של אותו מוצר — וההחלפה הזו באמת נוצרת כשבונים שוב בלעדיו. ב-173 הוא לא נלקח בכל פעם שמוצר
//    אחר באותה החזרה זוכה ביתר בדיוק בכמות שחסרה — גם כששלב העודפים לא מציע את ההחלפה הזו (למוצר שזוכה ביתר יש חוסר
//    בקליטה סמוכה), או ששלב 2 דוחה אותה (החוסר מוסבר בחלקו במקום אחר). אז נעלמה ההחלפה שהוצגה עד 172, ובמקומה הופיעו
//    "חסר זיכוי" גדול יותר ו"עודף זיכוי". עכשיו, בכל מקרה כזה — בדיוק כמו עד 172.
//    ההחלפה המדויקת יכולה להיות גם שורה אחרת של מוצר שלא הוחזר (בלי תלות בסדר השורות בנייר). ניחוש שהוא החלפה באותו
//    מחיר (נסגרת לבד) נסוג רק מפני החלפה מדויקת שגם היא באותו מחיר. ה"בדיוק" צריך להיות אמיתי בחשבון הכולל של שני
//    המוצרים. ובנייר של כמה החזרות, השורה של הניחוש שנסוג חופשית למצוא החלפה אחרת.
// 2. הדילוג על קריאת האימות לשורה במחיר אפסי — רק בקליטת הניירות מהנהג, שם השורה באמת יוצאת מהנייר.
// 3. "ספור בכל זאת" ואישור, כשהנייר אינו ברשימה שבזיכרון (אחרי רענון, לפני שהמאזין הביא אותו) — השורה יורדת מ-nominal גם בענן.
// כל ההחזרות, הקליטות והניירות כאן מומצאים (מוצרי הקטלוג מ-tests/ledger-2026-10.json).
// הרצה: TZ=Asia/Jerusalem node --test tests/credit-v174.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runtime, fixture, html } from './receipt-scan-harness.mjs';

const L = JSON.parse(fs.readFileSync(new URL('./ledger-2026-10.json', import.meta.url), 'utf8'));
const name = code => (L.products.find(p => p.id === 'code_' + code) || {}).name || code;
const tick = () => new Promise(res => setImmediate(res));
async function until(cond, n = 400) { for (let i = 0; i < n && !cond(); i++) await tick(); assert.ok(cond(), 'התנאי לא התקיים'); }
// samePriceAs: { קוד: קוד } — המוצר הראשון מקבל את המחירים של השני (כדי לבדוק "אותו מחיר" על זוג שאינו החלות)
function app({ papers = [], returns = [], receipts = [], today = '2026-10-06', paper, samePriceAs = {} } = {}) {
  const products = structuredClone(L.products);
  Object.entries(samePriceAs).forEach(([code, like]) => { const a = products.find(p => p.id === 'code_' + code), b = products.find(p => p.id === 'code_' + like); a.price = b.price; a.listPrice = b.listPrice; });
  const r = runtime({ data: { ...fixture(), ...(paper ? { paper } : {}), products } });
  r.context.testL = structuredClone({ returns, receipts, papers });
  r.context.testProducts = products;
  r.run(`products = testProducts; receipts = testL.receipts; returns = testL.returns; papers = testL.papers; todayStr = () => '${today}'; ledgerInvalidate();`);
  r.j = expr => JSON.parse(r.run('JSON.stringify(' + expr + ')'));
  r.items = () => r.j(`currentLedger().items.map(i => ({ kind: i.kind, state: i.state, key: i.key || (i.keys && i.keys[0] && i.keys[0].key) || null, units: i.units,
    swap: i.swap ? { a: i.swap.a, b: i.swap.b, q: i.swap.q, over: !!i.swap.over, price: i.swap.price } : null, text: ledgerItemText(i, currentLedger(), ledgerAllPapers(currentLedger())).text }))`);
  r.open = () => r.items().filter(i => i.state === 'problem' || i.state === 'question');
  r.click = (role, id) => r.run(`paperUiClick({ dataset: ${JSON.stringify(id === undefined ? { role } : { role, id })} })`);
  return r;
}
const ret = (id, rows, date = '2026-10-03') => ({ id, date, docDate: date, credited: false, timestamp: Date.parse(date + 'T08:00:00'), sentTo: 'הנהג',
  items: rows.map(([code, qty]) => ({ productId: 'code_' + code, code, name: name(code), barcode: '', qty })) });
const credit = (number, rows, docDay = '2026-10-04') => ({ schema: 1, state: 'accepted', id: 'paper_' + number, kind: 'credit', kindKnown: true, number, terminalNumber: number, numerator: number.slice(-5), docDay, printedTime: '10:00',
  timestamp: Date.parse(docDay + 'T10:00:00') + Number(number.slice(-2)),
  rows: rows.map(([code, qty], i) => ({ line: i + 1, itemCode: code, barcode: '', description: code, qty, productId: 'code_' + code, matchedBy: 'code' })),
  anchors: { units: rows.reduce((a, x) => a + x[1], 0), lines: rows.length, source: 'printed' }, proof: { unitsOk: true, linesOk: true } });
// קליטה: [קוד, נספרו, חויבו]
const receipt = (id, day, rows) => ({ id, date: day, docDate: day, timestamp: Date.parse(day + 'T06:00:00'), items: rows.map(([code, qty, noteQty]) => ({ productId: 'code_' + code, code, name: name(code), qty, noteQty })) });
const brief = r => r.open().map(i => [i.kind, i.key, i.units]);

test('ההחלפה המדויקת נדחתה בשלב 2 (החוסר מוסבר בחלקו בנייר אחר) — ה"מועמד היחיד" נשאר, כמו עד 172', () => {
  // 6 לחמניות כוסמין: ×1 בהחזרה מ-30.9 (זוכו ×2 בנייר שלה), ×4 בהחזרה מ-3.10 (לא בנייר שלה). בנייר של 3.10 — חלה קלועה ×5
  // על ×1 (עודף 4, בדיוק מה שחסר בכוסמין בהחזרה), ועוד "זוג לחמניות אצבע" ×2 שלא הוחזרו. המאזן הכולל של הכוסמין הוא 3,
  // ולכן "קלועה ×4 במקום כוסמין" לא מחזיקה — והניחוש של 172 (אצבע ×2 במקום כוסמין) חוזר.
  const r = app({ returns: [ret('ret_a1', [['649', 1], ['100', 1]], '2026-09-30'), ret('ret_a2', [['649', 4], ['238', 2], ['451', 1], ['450', 2]])],
    papers: [credit('290099601', [['649', 2], ['100', 1]], '2026-10-01'), credit('290099602', [['238', 1], ['451', 5], ['450', 2], ['233', 2]])] });
  assert.deepEqual(brief(r), [['swap', 'code_649', 2], ['returnedNotCredited', 'code_649', 1], ['creditedNotReturned', 'code_451', 4]]);
  assert.deepEqual(r.open()[0].swap, { a: 'code_649', b: 'code_233', q: 2, over: false, price: 'diff' });
  assert.equal(r.open()[0].text, "ברמן זיכתה זוג לחמניות אצבע בש' ×2 במקום 6 לחמניות כוסמין שהחזרת ב-3.10");
  assert.equal(r.open()[1].text, 'חסר זיכוי על 6 לחמניות כוסמין ×1, ברמן אסלי 5 פיתות ×1 מההחזרה של 3.10 — לבקש זיכוי מהנהג');
});

test('למוצר שזוכה ביתר יש חוסר בקליטה סמוכה (הזיכוי אולי עליו) — שלב העודפים לא מציע החלפה, וה"מועמד היחיד" נשאר, כמו עד 172', () => {
  const r = app({ returns: [ret('ret_b', [['238', 2], ['450', 4], ['221', 3], ['649', 3]])],
    papers: [credit('290099603', [['238', 6], ['221', 3], ['649', 3], ['233', 2]])], receipts: [receipt('rc_b', '2026-10-02', [['238', 1, 6]])] });
  assert.deepEqual(brief(r), [['chargedNotReceived', 'code_238', 1], ['swap', 'code_450', 2], ['returnedNotCredited', 'code_450', 2]]);
  assert.deepEqual(r.open()[1].swap, { a: 'code_450', b: 'code_233', q: 2, over: false, price: 'diff' });
  assert.equal(r.open()[2].text, 'חסר זיכוי על חלה מרובעת ברמן ×2 מההחזרה של 3.10 — לבקש זיכוי מהנהג');
});

test('כשההחלפה המדויקת כן מוצעת ומחזיקה — היא גוברת על הניחוש, והשורה של המוצר שלא הוחזר היא עודף זיכוי (כמו ב-173)', () => {
  // חלומית אישית ×8 על ×5 (עודף 3), 6 לחמניות כוסמין ×3 חסרות (בדיוק 3), ועוד "אסלי" ×1 שלא הוחזר
  const r = app({ returns: [ret('ret_c', [['3701', 5], ['233', 2], ['649', 3], ['451', 2], ['221', 2]])], papers: [credit('290099604', [['3701', 8], ['233', 2], ['451', 2], ['221', 2], ['238', 1]])] });
  assert.deepEqual(brief(r), [['swap', 'code_649', 3], ['creditedNotReturned', 'code_238', 1]]);
  assert.deepEqual(r.open()[0].swap, { a: 'code_649', b: 'code_3701', q: 3, over: true, price: 'diff' });
  assert.equal(r.open()[0].text, 'ברמן זיכתה חלומית אישית 3 יח׳ ×3 במקום 6 לחמניות כוסמין שהחזרת ב-3.10');
  assert.equal(r.open()[1].text, 'עודף זיכוי: ברמן זיכתה ברמן אסלי 5 פיתות ×1 שלא החזרת — לבדוק שהנייר נקרא נכון');
});

test('שתי שורות של מוצרים שלא הוחזרו, ורק אחת בדיוק בכמות החסרה — היא ההחלפה, בלי תלות בסדר השורות בנייר', () => {
  // לחמניות חלומית ×5 הוחזרו וזוכו ×3 (חסרות 2). בנייר גם "לחם אחיד" ×1 ו"חלומית אישית" ×2 שלא הוחזרו. עד 173, כשהשורה
  // של ×1 הודפסה קודם, היא לקחה את המוצר כ"מועמד יחיד" וחסמה את השורה המדויקת: החלפה ×1, "חסר זיכוי ×1" ו"עודף זיכוי ×2"
  const rows = [['238', 3], ['221', 3], ['233', 3]], run = extra => app({ returns: [ret('ret_d', [['238', 3], ['221', 5], ['233', 3]])], papers: [credit('290099605', rows.concat(extra))] });
  [[['100', 1], ['3701', 2]], [['3701', 2], ['100', 1]]].forEach(extra => {
    const r = run(extra);
    assert.deepEqual(brief(r).sort(), [['creditedNotReturned', 'code_100', 1], ['swap', 'code_221', 2]], JSON.stringify(extra));
    const swap = r.open().find(i => i.kind === 'swap');
    assert.deepEqual(swap.swap, { a: 'code_221', b: 'code_3701', q: 2, over: false, price: 'diff' });
    assert.equal(swap.text, 'ברמן זיכתה חלומית אישית 3 יח׳ ×2 במקום לחמניות חלומית 4 בשקית שהחזרת ב-3.10');
    assert.equal(r.open().find(i => i.kind === 'creditedNotReturned').text, 'עודף זיכוי: ברמן זיכתה לחם אחיד ברמן ×1 שלא החזרת — לבדוק שהנייר נקרא נכון');
  });
});

test('ניחוש שהוא החלפה באותו מחיר (חלה קלועה במקום מרובעת) נשאר ונסגר לבד, כמו עד 172 — גם מול עודף מדויק או שורה מדויקת במחיר אחר', () => {
  const auto = r => r.items().filter(i => i.kind === 'autoSwap').map(i => [i.swap.a, i.swap.b, i.swap.q, i.swap.price, i.state]);
  // מרובעת ×3 הוחזרו ולא זוכו; בנייר קלועה ×2 שלא הוחזרו, וחלומית אישית ×5 על ×2 (עודף 3 — בדיוק מה שחסר במרובעת)
  const over = app({ returns: [ret('ret_e1', [['344', 3], ['221', 1], ['450', 3], ['3701', 2]])], papers: [credit('290099606', [['344', 3], ['221', 1], ['3701', 5], ['451', 2]])] });
  assert.deepEqual(auto(over), [['code_450', 'code_451', 2, 'same', 'info']]);
  assert.deepEqual(brief(over).sort(), [['creditedNotReturned', 'code_3701', 3], ['returnedNotCredited', 'code_450', 1]]);
  // אותו דבר מול שורה מדויקת של מוצר אחר שלא הוחזר (אסלי ×3), שהודפסה אחרי הקלועה
  const row = app({ returns: [ret('ret_e2', [['450', 3], ['344', 3], ['221', 1], ['233', 2]])], papers: [credit('290099607', [['344', 3], ['221', 1], ['233', 2], ['451', 1], ['238', 3]])] });
  assert.deepEqual(auto(row), [['code_450', 'code_451', 1, 'same', 'info']]);
  assert.deepEqual(brief(row).sort(), [['creditedNotReturned', 'code_238', 3], ['returnedNotCredited', 'code_450', 2]]);
});

test('ניחוש באותו מחיר מוותר להחלפה מדויקת שגם היא באותו מחיר — הכול נסגר לבד, והשורה של הקלועה היא עודף זיכוי', () => {
  // כמו למעלה, אבל המוצר שזוכה ביתר (זוג לחמניות אצבע ×5 על ×2) באותו מחיר כמו החלה המרובעת
  const r = app({ samePriceAs: { 233: '450' }, returns: [ret('ret_f', [['450', 3], ['233', 2], ['344', 3], ['221', 1]])], papers: [credit('290099608', [['233', 5], ['344', 3], ['221', 1], ['451', 1]])] });
  assert.deepEqual(r.items().filter(i => i.kind === 'autoSwap').map(i => [i.swap.a, i.swap.b, i.swap.q, i.swap.over, i.swap.price]), [['code_450', 'code_233', 3, true, 'same']]);
  assert.deepEqual(brief(r), [['creditedNotReturned', 'code_451', 1]]);
});

const swapsOf = r => r.items().filter(i => i.swap).map(i => [i.swap.a, i.swap.b, i.swap.q, i.swap.over, i.text.match(/ב-(\d+\.\d+)/)[1]]).sort();

test('נייר של שתי החזרות: השורה המדויקת מוצאת מוצר פנוי בהחזרה האחרת — הניחוש בהחזרה הראשית נשאר, כמו עד 172', () => {
  // חלומית אישית חסרה ×3 בהחזרה מ-2.10 (4, זוכתה 1) וחסרה ×3 בהחזרה מ-3.10. בנייר "6 לחמניות כוסמין" ×1 ו"חלה מרובעת" ×3
  // שלא הוחזרו: המרובעת היא בדיוק החוסר של 3.10, והכוסמין נשאר "מועמד יחיד" ב-2.10 — לא מפנים אותו בשביל המרובעת
  const r = app({ returns: [ret('ret_m1f', [['3701', 3], ['233', 5]]), ret('ret_m1g', [['3701', 4], ['221', 1]], '2026-10-02')],
    papers: [credit('290099609', [['649', 1], ['450', 3], ['233', 5], ['3701', 1], ['221', 1]])] });
  assert.deepEqual(swapsOf(r), [['code_3701', 'code_450', 3, false, '3.10'], ['code_3701', 'code_649', 1, false, '2.10']]);
  assert.deepEqual(brief(r).filter(x => x[0] !== 'swap'), [['returnedNotCredited', 'code_3701', 2]]);
});

test('נייר של שתי החזרות: ניחוש שנסוג מפני שורה מדויקת — השורה שלו חופשית להחלפה אחרת (בהחזרה השנייה)', () => {
  // 2.10: חלה מרובעת ×3 לא זוכתה. 3.10: אסלי ×4 לא זוכה, חלומית אישית חסרה ×1. בנייר "אחיד פרוס" ×2 (מודפס קודם) ו"6 לחמניות
  // כוסמין" ×3 שלא הוחזרו. עד 173: האחיד לקח את המרובעת כ"מועמד יחיד" (×2, ועוד "חסר זיכוי" ×1), והכוסמין — את האסלי (×3,
  // ועוד "חסר זיכוי" ×1). עכשיו: הכוסמין ×3 היא ההחלפה המדויקת של המרובעת, והאחיד ×2 — "מועמד יחיד" של האסלי
  const r = app({ returns: [ret('ret_m2f', [['451', 1], ['238', 4], ['3701', 2], ['344', 4], ['100', 2]]), ret('ret_m2g', [['100', 3], ['451', 4], ['450', 3]], '2026-10-02')],
    papers: [credit('290099610', [['100', 5], ['451', 5], ['101', 2], ['3701', 1], ['649', 3], ['344', 4]])] });
  assert.deepEqual(swapsOf(r), [['code_238', 'code_101', 2, false, '3.10'], ['code_450', 'code_649', 3, false, '2.10']]);
  assert.deepEqual(r.open().filter(i => !i.swap).map(i => i.text), ['חסר זיכוי על ברמן אסלי 5 פיתות ×2, חלומית אישית 3 יח׳ ×1 מההחזרה של 3.10 — לבקש זיכוי מהנהג']);
});

test('ה"בדיוק" צריך להיות אמיתי בחשבון הכולל: שורה שחלק ממנה מכסה החזרה אחרת של אותו מוצר, או מוצר חסר שחלקו כבר מכוסה — הניחוש נשאר, כמו עד 172', () => {
  // (1) אסלי ×5 לא זוכה ב-3.10. בנייר "חלה קלועה" ×4 (ניחוש) ו"זוג לחמניות אצבע" ×5 — בדיוק 5, אבל ×3 מהן הוחזרו ב-2.10
  // (החזרה שהנייר לא שויך אליה) ועוד לא זוכו: רק ×2 עודפות. ההחלפה נשארת הקלועה, וההחזרה מ-2.10 נסגרת בלחמניות
  const r1 = app({ returns: [ret('ret_g1f', [['100', 4], ['344', 2], ['238', 5]]), ret('ret_g1g', [['233', 3]], '2026-10-02')], papers: [credit('290099611', [['451', 4], ['100', 4], ['344', 2], ['233', 5]])] });
  assert.deepEqual(swapsOf(r1), [['code_238', 'code_451', 4, false, '3.10']]);
  assert.deepEqual(brief(r1).filter(x => x[0] !== 'swap').sort(), [['creditedNotReturned', 'code_233', 2], ['returnedNotCredited', 'code_238', 1]]);
  assert.equal(r1.items().some(i => i.kind === 'returnNotCreditedYet'), false, 'ההחזרה מ-2.10 אינה חוזרת ל"ממתינה לתעודת זיכוי"');
  // (2) זוג לחמניות אצבע ×4 הוחזרו ב-2.10; בנייר שורה שלהן ×1 (שהשיוך שמר להחלפה אחרת), "אחיד פרוס" ×7 על ×4 (עודף 3 —
  // ניחוש על הלחמניות), ועוד "חלה קלועה" ×5 על ×1 ו"לחם כוסמין" ×4 — כל אחת "בדיוק 4". אבל מהלחמניות חסרות באמת רק 3
  const r2 = app({ returns: [ret('ret_g2f', [['221', 2], ['101', 4], ['3701', 5], ['649', 2], ['238', 3]]), ret('ret_g2g', [['451', 1], ['450', 1], ['233', 4]], '2026-10-02')],
    papers: [credit('290099612', [['233', 1], ['101', 7], ['238', 6], ['451', 5], ['344', 4], ['221', 2], ['3701', 4], ['649', 2], ['450', 1]])] });
  assert.deepEqual(swapsOf(r2), [['code_233', 'code_101', 3, false, '2.10']]);
  assert.deepEqual(brief(r2).filter(x => x[0] !== 'swap').sort(), [['creditedNotReturned', 'code_238', 3], ['creditedNotReturned', 'code_344', 4], ['creditedNotReturned', 'code_451', 4], ['returnedNotCredited', 'code_3701', 1]]);
});

test('קריאת האימות לקוד שאינו במאגר: מדלגים על שורה במחיר אפסי רק בקליטת הניירות — בתעודה שנקראת בתוך קליטה היא נשלחת כמו עד 172', () => {
  const r = app();
  // תעודת זיכוי אחרי ההתאמה לקטלוג: שורה 2 — קוד שאינו במאגר, במחיר 0.01
  const doc = { docType: 'credit', headerText: 'ת.משלוח החזרה יבש', rows: [
    { sourcePage: 1, lineNumber: 1, quantity: 4, __tnuvaProductId: 'code_238', barcodeMatchMethod: 'tnuva_code_exact', printedListUnitPrice: 7.95 },
    { sourcePage: 1, lineNumber: 2, quantity: 3, __tnuvaProductId: null, barcodeMatchMethod: null, printedListUnitPrice: 0.01 }] };
  r.context.testDoc = doc;
  const target = [{ noteIndex: 0, sourcePage: 1, lineNumber: 2, field: 'itemCode' }];
  assert.deepEqual(r.j(`bermanOcrVerificationTargets({ scan: { documents: [testDoc] } }, {})`), target, 'בלי opts (קריאה בתוך קליטה) — היעד נשלח');
  assert.deepEqual(r.j(`bermanOcrVerificationTargets({ scan: { documents: [testDoc] } }, {}, null, { paperIntake: false })`), target);
  assert.deepEqual(r.j(`bermanOcrVerificationTargets({ scan: { documents: [testDoc] } }, {}, null, { paperIntake: true })`), [], 'בקליטת הניירות — לא משלמים על השורה שלא נספרת');
  // מחיר רגיל — נשלח תמיד; נייר שאינו זיכוי — נשלח גם בקליטת הניירות
  r.context.testDoc2 = { ...doc, rows: [doc.rows[0], { ...doc.rows[1], printedListUnitPrice: 7.95 }] };
  assert.deepEqual(r.j(`bermanOcrVerificationTargets({ scan: { documents: [testDoc2] } }, {}, null, { paperIntake: true })`), target);
  r.context.testDoc3 = { ...doc, docType: 'invoice', headerText: 'ת.משלוח' };
  assert.deepEqual(r.j(`bermanOcrVerificationTargets({ scan: { documents: [testDoc3] } }, {}, null, { paperIntake: true })`), target);
  // וקליטת הניירות אכן מעבירה את הדגל
  assert.match(html, /paperIntake: true, \/\/ v174/);
  assert.match(html, /bermanOcrVerificationTargets\(best\.payload, inputDoc, null, \{ paperIntake: opts\.paperIntake === true \}\)/);
});

test('אותה תעודת זיכוי דרך צינור הקריאה עצמו: בתוך קליטה נשלחת קריאת האימות (שתי בקשות), בקליטת הניירות — לא (בקשה אחת)', async () => {
  // תשובת שרת מלאה (מומצאת): שתי הקריאות הסכימו; שורה 2 — קוד 1649 שאינו במאגר, ×3 במחיר 0.01
  const rows = [['497204', '238', 'ברמן אסלי 5 פי', 4, 7.95], ['4033064', '1649', 'לחמניות כוסמין', 3, 0.01]]
    .map(([barcode, itemCode, description, quantity, unitPriceExVat], i) => ({ sourcePage: 1, lineNumber: i + 1, barcode, itemCode, description, quantity, unitPriceExVat, confidence: 0.95 }));
  const reply = { ok: true, serviceVersion: 8, model: 'fixture', requestId: 'req-v174', reads: [{ model: 'luna' }, { model: 'luna' }], usage: null,
    verification: { version: 1, status: 'agreed', primaryReads: 2, escalationAttempted: false, reasons: [], issues: [], readCount: 2 },
    scan: { warnings: [], documents: [{ noteIndex: 0, docNumber: '290099319', docType: 'credit', docDate: '04/10/2026', pageCount: 1, totalUnits: 7, printedLines: 2,
      netToChargeExVat: 31.83, vatAmountPrinted: 5.73, totalToChargeInclVat: 37.56, headerText: 'ת.משלוח החזרה יבש', internalNumber: null, numerator: '99319', printedCheck: 68,
      otherPapersVisible: false, notDriverStrip: false, confidence: 0.95, warnings: [], rows }] } };
  const page = { dataUrl: 'data:image/jpeg;base64,cGFwZXIx', baseDataUrl: 'data:image/jpeg;base64,cGFwZXIx', rotation: 0, orientationConfirmed: true };
  const read = async extra => {
    const r = app({ paper: reply });
    r.context.testPage = page;
    await r.run(`aiScanSingleDocPipeline('token', 0, { inputDoc: { noteIndex: 0, pages: [testPage], amount: null, units: null, lines: null, kind: 'charge' }, isCurrent: () => true${extra} })`);
    return r.requests.length;
  };
  assert.equal(await read(''), 2, 'בתוך קליטה: קוד שאינו במאגר נשלח לאימות, כמו עד 172');
  assert.equal(await read(', paperIntake: true'), 1, 'בקליטת הניירות: השורה לא נספרת — בלי קריאה נוספת');
});

test('"ספור בכל זאת" ואישור כשהנייר אינו ברשימה שבזיכרון — השדה nominal מתרוקן גם בענן', async () => {
  const P = { ...credit('290099318', [['238', 4], ['450', 3], ['3701', 1]]), captureId: 'cap_old', rev: 1,
    nominal: [{ line: 4, itemCode: '1649', barcode: '4033064', description: 'לחמניות כוסמין', qty: 3, productId: null, matchedBy: null, price: 0.01 }] };
  const r = app({ papers: [P], returns: [ret('ret_nominal', [['238', 4], ['450', 3], ['3701', 1], ['649', 3]])] });
  await r.run(`openPaperReview('${P.id}')`);
  r.run('papers = [];'); // כמו אחרי רענון, לפני שהמאזין של הניירות הביא אותו
  r.click('review-nominal-count', '0'); r.click('review-pick', '3'); r.click('review-pick-product', 'code_649');
  assert.equal(r.run('paperReviewState().ok'), true);
  r.click('review-save');
  await until(() => r.run('paperReview') === null);
  const upd = r.writes.filter(w => w.op === 'update' && w.path && w.path.at(-1) === P.id).at(-1);
  assert.ok(upd, 'עדכון הנייר');
  assert.deepEqual(JSON.parse(JSON.stringify([upd.data.rows.length, upd.data.anchors.units, upd.data.anchors.lines, upd.data.nominal])), [4, 11, 4, []], 'בלי זה השורה הייתה גם נספרת וגם רשומה כ"לא נספרת"');
});

test('הגרסה 174, כולל ההערה ב-service worker', () => {
  assert.match(html, /const APP_VERSION = '174'/);
  assert.match(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), /גרסת אפליקציה 174/);
});
