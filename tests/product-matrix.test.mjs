// v64 — פירוט לפי מוצר × ימים, במבנה החשבונית המפורטת של ברמן.
// v118 — הכמות היא מה שחויב בתעודה פחות מה שזוכה, והמחיר הוא מחיר הלקוח
// (priceAt, עם היסטוריה) ומבצע המרכזת ביום התעודה — לא המחיר שנשמר על השורה.
// הבדיקות רצות על הפונקציות האמיתיות מ-index.html (ראה extract.mjs), כדי
// שהמבנה שנבנה מול הנייר — סדר השורות, החזרה כשורה שנייה בתא, וסגירת
// הסכומים — לא ישתנה בשקט.
//
// הרצה:            node tests/product-matrix.test.mjs
// מול גיבוי אמיתי: node tests/product-matrix.test.mjs --backup ~/bermanbackup.json
//
// ברירת המחדל היא fixture.json — מוצרים ומבצעים בלבד. הכמויות והתעודות
// שבתרחישים כתובות כאן במפורש, ולכן --backup משנה רק את המחירון והמבצעים.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractSource } from './extract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const backupArg = (() => { const i = process.argv.indexOf('--backup'); return i > -1 ? process.argv[i + 1] : null; })();
const source = JSON.parse(fs.readFileSync(backupArg || path.join(HERE, 'fixture.json'), 'utf8'));
const collections = source.collections || source;

const products = Object.entries(collections.products).map(([id, v]) => ({ id, ...v }));
const promos = Object.entries(collections.promos).map(([id, v]) => ({ id, ...v }));
const byCode = c => products.find(p => String(p.code) === String(c));

const FNS = ['r2', 'todayStr', 'storedReceiptDate', 'productCode', 'productListPrice',
  'promoFixedPrice', 'promoActive', 'monthEndPromoForProduct', 'monthEndUnitRebate', 'mtxQty',
  'mtxPromoUnit', 'vatRateForDoc', 'priceAt', 'invoiceUnitAt', 'priceHistoryWith', 'receiptCreditedShortUnits', 'lineOwnCode', 'rangeProductMatrixData'];
// eslint-disable-next-line no-eval
const api = eval('let VAT = 0.18;\n' + extractSource(FNS, []) + '\n({ ' + FNS.join(', ') + ' })');
const { r2, rangeProductMatrixData, mtxQty, priceAt, invoiceUnitAt, priceHistoryWith } = api;
// המחיר שהחשבונית מדפיסה לשורה: מחיר הלקוח ביום, ואחריו מבצע המרכזת
const invoiceUnit = (p, day) => invoiceUnitAt(p, day).unit;

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } };
const head = t => console.log('\n' + t);

const P = { b101: byCode('101'), b119: byCode('119'), b1231: byCode('1231'), b339: byCode('339'), b349: byCode('349') };
const line = (p, qty, unitPrice, extra) => ({ productId: p.id, name: p.name, qty, unitPrice, ...(extra || {}) });

// שלושה ימי תנועה. 1231 במבצע פעיל (₪8.50 מ-1/9), 349 מבצע שהסתיים 31/8.
// 101 מקבל מחיר לקוח חדש מ-2/9 (היסטוריית מחירים), ו-119 מגיע רק כהחזרה.
// המחיר שנשמר על השורה (unitPrice) אינו משתתף: הוא מה שהמסופון חייב, לא החשבונית.
P.b101.priceHistory = priceHistoryWith(P.b101, '2026-09-02', 5.9, { method: 'invoice', month: '2026-09' });
const u101a = 5.7408, u101b = 5.9;
const d = {
  netEx: 0,
  recs: [
    { docDate: '2026-09-01', items: [
      line(P.b101, 25, 5.7408),
      line(P.b1231, 12, 10.399818),
      line(P.b349, 6, 9.884),
      { productId: P.b101.id, name: 'פיקדון ארגז', qty: 4, unitPrice: 12, isDeposit: true }
    ] },
    { docDate: '2026-09-02', items: [
      line(P.b101, 20, 5.7408),                    // בשורה המחיר הישן — בחשבונית כבר 5.90
      line(P.b1231, 10, 8.5),                      // הפעם המבצע ירד כבר בתעודה
      { name: P.b339.name, qty: 3, unitPrice: 12.047 } // שורה בלי productId — לפי שם
    ] }
  ],
  rets: [
    { docDate: '2026-09-02', credited: true, items: [line(P.b101, 3, 5.7408)] },
    { docDate: '2026-09-04', credited: true, items: [line(P.b119, 2, 7.25026), line(P.b1231, 1, 8.5)] }
  ]
};
const m = rangeProductMatrixData(d);
const row = code => m.list.find(r => r.code === String(code));

head('[1] העמודות — יום לכל תנועה, עם אות היום כמו בנייר');
ok('שלושה ימי תנועה', m.days.length === 3);
ok('הימים ממוינים מהמוקדם למאוחר', m.days.map(x => x.day).join(',') === '2026-09-01,2026-09-02,2026-09-04');
ok('1/9/26 הוא יום ג׳', m.days[0].num === '01' && m.days[0].wd === 'ג');
ok('יום שיש בו רק החזרה מקבל עמודה', m.days[2].day === '2026-09-04');

head('[1ב] כל יום נושא גם תווית לתצוגה הפתוחה של המוצר');
ok('התווית היא יום/חודש', m.days.map(x => x.md).join(',') === '01/09,02/09,04/09');

head('[2] סדר השורות — קוד הפריט כמחרוזת, בדיוק כמו בחשבונית');
// בנייר: 101 → 119 → 1231 → 339. מיון מספרי היה נותן 101, 119, 339, 1231.
ok('101 → 119 → 1231 → 339', m.list.map(r => r.code).slice(0, 4).join(',') === '101,119,1231,339');

head('[3] התא — כמות למעלה, ההחזרה של אותו יום מתחתיה');
const r101 = row('101');
ok('25 חויבו ב-1/9', r101.days['2026-09-01'].q === 25 && !r101.days['2026-09-01'].r);
ok('20 חויבו ו-3 זוכו באותו יום', r101.days['2026-09-02'].q === 20 && r101.days['2026-09-02'].r === 3);
ok('כמות השורה = חויב פחות זוכה', r101.qty === 42 && r101.expectedQty === 42 && r101.billed === 45 && r101.credited === 3);
ok('מה שמגיע = נספר פחות נשלח', r101.fairQty === 42 && r101.openUnits === 0);
ok('סך הזיכויים נשמר בנפרד', r101.rets === 3);
const r119 = row('119');
ok('מוצר שרק חזר יוצא בכמות שלילית', r119.qty === -2 && r119.rets === 2);
ok('ובסכום שלילי', r2(r119.amount) === r2(-2 * 7.25026));

head('[3ב] לכל תא יש גם כסף — זה מה שנפתח מתחת למוצר');
ok('יום אספקה בלבד', r2(r101.days['2026-09-01'].amt) === r2(25 * u101a));
ok('יום שיש בו גם החזרה — נטו, במחיר הלקוח של אותו יום', r2(r101.days['2026-09-02'].amt) === r2(20 * u101b - 3 * u101b));
ok('יום החזרה בלבד יוצא שלילי', r2(r119.days['2026-09-04'].amt) === r2(-2 * 7.25026));
ok('סכום הימים של השורה = סכום השורה (השורה מעוגלת לאגורה)',
  Math.abs(m.days.reduce((s, x) => s + ((r101.days[x.day] || {}).amt || 0), 0) - r101.amount) < 0.011);

head('[4] מה לא נכנס לטבלה');
ok('שורת פיקדון אינה נספרת', !m.list.some(r => r.name.indexOf('פיקדון') > -1));
ok('שורה בלי productId מזוהה לפי שם ולא פותחת שורה כפולה',
  m.list.filter(r => r.code === '339').length === 1 && row('339').qty === 3);

head('[5] הסכומים נסגרים');
// הכסף הצפוי הוא במחירי החשבונית: מחיר הלקוח ביום (priceAt) ומבצע המרכזת — שורת
// 1231 יורדת ל-₪8.50 גם כשחויבה ב-₪10.40, ו-101 עולה ל-₪5.90 מ-2/9 גם כשהשורה 5.7408
let expQty = 0, expAmt = 0;
const pOf = l => products.find(x => x.id === l.productId) || products.find(x => x.name === l.name);
d.recs.forEach(r => (r.items || []).forEach(l => { if (!l.isDeposit) { expQty += l.qty; expAmt += l.qty * invoiceUnit(pOf(l), r.docDate); } }));
d.rets.forEach(r => (r.items || []).forEach(l => { expQty -= l.qty; expAmt -= l.qty * invoiceUnit(pOf(l), r.docDate); }));
const gotQty = m.list.reduce((s, r) => s + r.qty, 0);
const dayQty = m.days.reduce((s, x) => s + m.dayAgg[x.day].q - m.dayAgg[x.day].r, 0);
const dayAmt = m.days.reduce((s, x) => s + m.dayAgg[x.day].amount, 0);
ok('סך הכמות בשורות = הכמות שהוזנה', gotQty === expQty);
ok('סך הכמות בעמודות הימים זהה', dayQty === expQty);
ok('סך הכסף בשורות = מה שהוזן', Math.abs(m.total - r2(expAmt)) <= 0.01);
ok('סך הכסף בעמודות הימים זהה', Math.abs(r2(dayAmt) - m.total) <= 0.01);
ok('מחיר ממוצע לשורה = סכום חלקי כמות', Math.abs(r101.amount / r101.qty - r2(r101.amount) / 42) < 0.001);

head('[6] הסימונים שמסבירים פער מול הנייר');
ok('מוצר במבצע פעיל מסומן', row('1231').promo === true);
ok('מבצע שהסתיים לפני התקופה אינו מסמן', row('349').promo === false);
ok('שינוי מחיר לקוח בתוך התקופה מסומן', row('101').prices.length === 2);
ok('priceAt: לפני תאריך התחילה המחיר הישן, ממנו והלאה החדש', priceAt(P.b101, '2026-09-01') === u101a && priceAt(P.b101, '2026-09-02') === u101b && priceAt(P.b101, '2026-12-31') === u101b);
ok('priceHistoryWith: אותו תאריך תחילה דורס, לא מכפיל', priceHistoryWith({ priceHistory: P.b101.priceHistory }, '2026-09-02', 6.1).length === 1);
ok('product.price לא השתנה מהיסטוריית מחירים', P.b101.price === u101a);
ok('מחיר יציב אינו מסומן', row('349').prices.length === 1);

head('[6ב] v116/v118 — מבצע המרכזת יורד בשורת המוצר, כמו בחשבונית');
// ברמן אקטיב (₪10 קבוע מ-1/9) הגיע בשלוש צורות: במחיר הרגיל 12.047, במחירון
// המלא 17.21 (תעודת 1/9 האמיתית) ובמחיר המבצע עצמו. בחשבונית כולם 97 × ₪10 —
// ומ-v118 המחיר שנשמר על השורה אינו משתתף כלל, ולכן שלוש הצורות זהות מאליהן.
const dp = {
  netEx: 0,
  recs: [
    { docDate: '2026-09-01', items: [line(P.b339, 8, 17.21), line(P.b1231, 15, 10.399818), line(P.b349, 4, 9.884)] },
    { docDate: '2026-09-02', items: [line(P.b339, 8, 12.047), line(P.b1231, 14, 8.5)] },
    { docDate: '2026-09-03', items: [line(P.b339, 4, 10)] },
    // לפני תחילת המבצע — המחיר שחויב נשאר
    { docDate: '2026-08-31', items: [line(P.b339, 3, 12.047)] }
  ],
  rets: [
    { docDate: '2026-09-03', credited: true, items: [line(P.b339, 2, 12.047)] },
    { docDate: '2026-09-04', credited: true, items: [{ name: P.b339.name, qty: 1 }] } // בלי מחיר ובלי productId — לפי שם
  ]
};
const mp = rangeProductMatrixData(dp);
const rp = code => mp.list.find(r => r.code === String(code));
const r339 = rp('339');
ok('כמות נטו', r339.qty === 20 && r339.rets === 3);
ok('אספקה במחיר הרגיל יורדת ל-₪10', r2(r339.days['2026-09-02'].amt) === 80);
ok('אספקה במחירון מלא יורדת ל-₪10', r2(r339.days['2026-09-01'].amt) === 80);
ok('אספקה שכבר ירדה בתעודה אינה יורדת שוב', r2(r339.days['2026-09-03'].amt) === r2(40 - 2 * 10));
ok('החזרה מזוכה במחיר המבצע (v57)', r2(r339.days['2026-09-04'].amt) === -10);
ok('לפני המבצע — המחיר שחויב', r2(r339.days['2026-08-31'].amt) === r2(3 * 12.047));
ok('סכום השורה = (20 − 3) × 10 + 3 × 12.047', Math.abs(r339.amount - (17 * 10 + 3 * 12.047)) < 0.011);
ok('המחיר הממוצע של החלק שבמבצע הוא 10.000', Math.abs((r339.amount - 3 * 12.047) / 17 - 10) < 0.0001);
ok('הקיזוז של השורה: 20 יח׳ במבצע × 2.047 (ממחיר הלקוח, לא ממחיר השורה) − 3 שזוכו', Math.abs(r339.rebate - r2(20 * 2.047 - 3 * 2.047)) < 0.011);
ok('שלוש צורות החיוב אינן "שינוי מחיר" — בחשבונית מחיר אחד', r339.prices.filter(x => Math.abs(x - 10) < 0.001).length === 1 && r339.prices.length === 2);
ok('מסומן כמבצע', r339.promo === true);
const r1231 = rp('1231');
ok('לחמניות: 15 × 10.40 + 14 × 8.50 יוצאים 29 × 8.50', r2(r1231.amount) === r2(29 * 8.5) && r2(r1231.rebate) === r2(29 * (10.399818 - 8.5)));
ok('מבצע שהסתיים אינו נוגע במחיר', r2(rp('349').amount) === r2(4 * 9.884) && rp('349').rebate === 0);
ok('promoEx = סך מה שירד מכל השורות', Math.abs(mp.promoEx - r2(r339.rebate + r1231.rebate)) < 0.011);
ok('הסכום הכולל = סכום השורות', Math.abs(mp.total - r2(mp.list.reduce((s, r) => s + r.amount, 0))) <= 0.01);
ok('סכום הימים = הסכום הכולל', Math.abs(r2(mp.days.reduce((s, x) => s + mp.dayAgg[x.day].amount, 0)) - mp.total) <= 0.01);

head('[6ג] v118 — ארבע כמויות: חויב, נספר, זוכה, נשלח');
// תעודת 29/9 האמיתית: פרנה חויבה 1 ונספרה 0, ואחר כך נרשם זיכוי כספי 9.03.
// החזרה שטרם אומתה נספרת כ"נשלחה" אבל לא כ"זוכתה"; שורה שהועברה קדימה
// נשלחה פעם אחת בלבד.
const P3604 = byCode('3604');
const dq = {
  recs: [
    { docDate: '2026-09-29', items: [line(P3604, 0, 9.03, { noteQty: 1 }), line(P.b101, 10, 5.7408)], shortCreditNotes: [{ amount: 9.03 }] },
    { docDate: '2026-09-30', items: [line(P3604, 0, 9.03, { noteQty: 1 })] },           // חוסר שטרם זוכה
    { docDate: '2026-09-28', items: [line(P.b101, 7, 5.7408, { noteQty: 8 })], shortCreditNotes: [{ amount: 5.70 }] } // זיכוי שנופל 4 אג׳ ממחיר התעודה 5.7408 — עדיין מלא (v66); נמדד במחיר התעודה, לא במחיר הלקוח
  ],
  rets: [
    { docDate: '2026-09-29', credited: false, items: [line(P.b101, 4, 5.7408)] },
    { docDate: '2026-09-30', credited: true, items: [line(P.b101, 2, 5.7408, { noteQty: 1 })] },
    { docDate: '2026-09-30', credited: true, items: [{ productId: 'carry_x', name: P.b101.name, barcode: P.b101.barcode, qty: 1, unitPrice: 5.7408, carried: true }] }
  ]
};
const mq = rangeProductMatrixData(dq);
const q3604 = mq.list.find(r => r.code === '3604'), q101 = mq.list.find(r => r.code === '101');
ok('פרנה: חויב 2, נספר 0, זוכה 1', q3604.billed === 2 && q3604.received === 0 && q3604.credited === 1);
ok('פרנה: צפוי בחשבונית 1, מגיע 0, חוסר 1 שטרם זוכה', q3604.expectedQty === 1 && q3604.fairQty === 0 && q3604.openUnits === 1);
const u3604 = invoiceUnit(P3604, '2026-09-29');
ok('פרנה: הכסף במחיר הלקוח על מה שצפוי בחשבונית', r2(q3604.amount) === r2(u3604) && r2(q3604.fair) === 0);
ok('101: חויב 18, נספר 17, זיכוי חוסר באגורות חסרות = יחידה מלאה', q101.billed === 18 && q101.received === 17 && q101.credited === 1 + 1 + 1);
ok('101: נשלח 6 (4 שטרם אומתו + 2), לא כולל השורה שהועברה', q101.sent === 6);
ok('101: צפוי בחשבונית 18−3=15, מגיע 17−6=11 — 4 יחידות שהוחזרו וטרם זוכו', q101.expectedQty === 15 && q101.fairQty === 11 && q101.openUnits === 4);
ok('101: הסכום הצפוי לפי מחיר הלקוח', Math.abs(q101.amount - 15 * priceAt(P.b101, '2026-09-29')) < 0.011);
ok('סך החוסרים שטרם זוכו', mq.openUnits === 5 && Math.abs(mq.total - mq.fairTotal - (u3604 + 4 * priceAt(P.b101, '2026-09-29'))) < 0.02);
ok('כולל מע״מ 18% על הצפוי', Math.abs(mq.totalInc - mq.total * 1.18) < 0.02);
delete P.b101.priceHistory;

head('[6ד] v123 — זיכוי חוסר ביחידות, וקישור זיכוי שלא נספר פעמיים');
{
  // (א) תעודה עם זיכוי ביחידות למוצר אחד וזיכוי כספי ישן למוצר אחר — שניהם נספרים
  const PITA = byCode('401');
  const both = rangeProductMatrixData({ recs: [{ docDate: '2026-09-06', items: [
      line(PITA, 0, 10.96, { noteQty: 2 }), line(P.b101, 8, 5.7408, { noteQty: 10 })],
    shortCreditUnits: [{ id: 'u1', productId: P.b101.id, qty: 2, source: 'credit-note' }],
    shortCreditNotes: [{ amount: 21.88 }] }], rets: [] });
  const bPita = both.list.find(r => r.pid === PITA.id), bLoaf = both.list.find(r => r.pid === P.b101.id);
  ok('יחידות לאחיד: זוכו 2', bLoaf.credited === 2 && bLoaf.openUnits === 0);
  ok('והזיכוי הכספי הישן על מה שנשאר — הפיתות: זוכו 2', bPita.credited === 2 && bPita.openUnits === 0);
  // (ב) קישור 5.9 → 6.9: ההקצאה על תעודת החזרות והתאום על תעודת הקליטה — 401 זוכה 2, לא 4
  const twinId = 'cs1|returns_84f367b7|receipt_6771fe19|x';
  const linked = rangeProductMatrixData({
    recs: [{ docDate: '2026-09-06', items: [line(PITA, 0, 10.96, { noteQty: 2 })],
      shortCreditUnits: [{ id: twinId, productId: PITA.id, name: PITA.name, qty: 2, source: 'returns-note', fromReturnsId: 'returns_84f367b7' }] }],
    rets: [{ docDate: '2026-09-05', credited: true, items: [line(P.b101, 6, 5.7408)],
      creditAllocations: [{ id: twinId, receiptId: 'receipt_6771fe19', items: [{ productId: PITA.id, name: PITA.name, qty: 2 }] }] }] });
  const lPita = linked.list.find(r => r.pid === PITA.id);
  ok('401 זוכה פעמיים בדיוק — לא 4', lPita.credited === 2 && lPita.sent === 0 && lPita.openUnits === 0);
  // אותו קישור ברישום הכספי הישן (כמו בגיבוי) — אותה תוצאה
  const legacy = rangeProductMatrixData({
    recs: [{ docDate: '2026-09-06', items: [line(PITA, 0, 10.96, { noteQty: 2 })], shortCreditNotes: [{ id: twinId, amount: 21.88, source: 'returns-note', items: [{ productId: PITA.id, qty: 2 }] }] }],
    rets: [{ docDate: '2026-09-05', credited: true, items: [line(P.b101, 6, 5.7408)], creditAllocations: [{ id: twinId, amount: 21.88, receiptId: 'r', items: [{ productId: PITA.id, qty: 2 }] }] }] });
  ok('ברישום הכספי הישן — גם 2', legacy.list.find(r => r.pid === PITA.id).credited === 2);
  // (ג) שורת החזרה בלי מחיר (תעודה חדשה) נותנת בדיוק את אותו כסף כמו שורה עם מחיר ישן
  const priced = rangeProductMatrixData({ recs: [], rets: [{ docDate: '2026-09-10', credited: true, items: [line(P.b101, 3, 5.7408, { lineTotal: 17.22 })] }] });
  const plain = rangeProductMatrixData({ recs: [], rets: [{ docDate: '2026-09-10', credited: true, schemaVersion: 2, items: [{ productId: P.b101.id, name: P.b101.name, code: '101', qty: 3 }] }] });
  ok('שורת החזרה בלי מחיר — אותו סכום', plain.total === priced.total && plain.list[0].credited === 3);
  // (ד) שורה עם קידומת carry_ בלי דגל אינה נספרת כנשלחה
  const carryNoFlag = rangeProductMatrixData({ recs: [], rets: [{ docDate: '2026-09-10', credited: true,
    items: [{ productId: 'carry_77', name: P.b101.name, barcode: P.b101.barcode, qty: 2 }] }] });
  ok('carry_ בלי דגל: זוכה 2, נשלח 0', carryNoFlag.list[0].credited === 2 && carryNoFlag.list[0].sent === 0);
  // (ה) קישור בין שתי תעודות חזרות: היחידה שזוכתה בנייר החדש נספרת פעם אחת, ביום שלו
  const older = { docDate: '2026-09-08', credited: true, creditStatus: 'open', items: [line(P.b101, 2, 5.7408, { noteQty: 0 })],
    returnCreditNotes: [{ id: 'l1', fromReturnsId: 'n', items: [{ rowIndex: 0, productId: P.b101.id, name: P.b101.name, barcode: P.b101.barcode, qty: 1 }] }] };
  const newer = { docDate: '2026-09-12', credited: true, creditStatus: 'ok', items: [line(P.b349, 3, 9.884)],
    creditAllocations: [{ id: 'l1', targetType: 'return', returnId: 'o', items: [{ rowIndex: 0, productId: P.b101.id, name: P.b101.name, barcode: P.b101.barcode, qty: 1 }] }] };
  const rr = rangeProductMatrixData({ recs: [], rets: [older, newer] });
  const r101 = rr.list.find(r => r.pid === P.b101.id);
  ok('קישור חזרות→חזרות: 101 נשלח 2, זוכה 1 — פעם אחת', r101.sent === 2 && r101.credited === 1);
  ok('והזיכוי בתא של יום תעודת הזיכוי', r101.days['2026-09-12'] && r101.days['2026-09-12'].r === 1 && !(r101.days['2026-09-08'] && r101.days['2026-09-08'].r));
  ok('תעודה שטרם אומתה אינה מזכה דרך קישור', rangeProductMatrixData({ recs: [], rets: [{ ...newer, credited: false }] }).list.every(r => r.credited === 0));
  // (ו) שורה מועברת בלי מוצר קטלוג — לפי קוד הפריט לפני ברקוד (ברקוד משותף לכמה מוצרים)
  const shared = { id: 'shared_bc', code: '9001', name: 'מוצר א', barcode: '777', price: 4 };
  const shared2 = { id: 'shared_bc2', code: '9002', name: 'מוצר ב', barcode: '777', price: 6 };
  products.push(shared, shared2);
  const byCodeRow = rangeProductMatrixData({ recs: [], rets: [{ docDate: '2026-09-10', credited: true, items: [{ productId: 'carry_5', code: '9002', name: 'מוצר ב', barcode: '777', qty: 1, carried: true }] }] });
  ok('carry_ עם קוד 9002 נספר על 9002 ולא על הראשון עם אותו ברקוד', byCodeRow.list.length === 1 && byCodeRow.list[0].pid === 'shared_bc2');
  products.splice(products.indexOf(shared), 1); products.splice(products.indexOf(shared2), 1);
  // (ז) מוצר ידני בלי מחיר במאגר — מסומן "ללא מחיר" ולא נעלם בשקט
  const manual = rangeProductMatrixData({ recs: [], rets: [{ docDate: '2026-09-10', credited: true, items: [{ productId: 'manual_1', name: 'לחמניה משקית', qty: 4, manual: true }] }] });
  ok('שורה ידנית: זוכה 4, מסומנת ללא מחיר', manual.list[0].credited === 4 && manual.list[0].unpriced === true);
}

head('[7] תקופה ריקה אינה מפילה');
const empty = rangeProductMatrixData({ recs: [], rets: [], netEx: 0 });
ok('בלי ימים ובלי שורות', empty.days.length === 0 && empty.list.length === 0 && empty.total === 0 && empty.promoEx === 0);
ok('mtxQty על ערך חסר מחזיר אפס', mtxQty(undefined) === '0' && mtxQty(null) === '0');

console.log('\n' + (fail ? '✗ נכשלו ' + fail : '✓ הכל עבר') + ' (' + pass + '/' + (pass + fail) + ')' +
  (backupArg ? ' · מול הגיבוי' : ' · מול fixture.json'));
process.exit(fail ? 1 : 0);
