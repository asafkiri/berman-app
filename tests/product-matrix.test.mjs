// v64 — פירוט לפי מוצר × ימים, במבנה החשבונית המפורטת של ברמן.
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
  'promoFixedPrice', 'promoActive', 'monthEndPromoForProduct', 'mtxQty', 'mtxReturnUnit',
  'rangeProductMatrixData'];
// eslint-disable-next-line no-eval
const api = eval(extractSource(FNS, []) + '\n({ ' + FNS.join(', ') + ' })');
const { r2, rangeProductMatrixData, mtxQty } = api;

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } };
const head = t => console.log('\n' + t);

const P = { b101: byCode('101'), b119: byCode('119'), b1231: byCode('1231'), b339: byCode('339'), b349: byCode('349') };
const line = (p, qty, unitPrice, extra) => ({ productId: p.id, name: p.name, qty, unitPrice, ...(extra || {}) });

// שלושה ימי תנועה. 1231 במבצע פעיל (₪8.50 מ-1/9), 349 מבצע שהסתיים 31/8.
// 101 מגיע בשני מחירים שונים בתוך התקופה, ו-119 מגיע רק כהחזרה.
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
      line(P.b101, 20, 5.9),                       // המחיר זז באמצע התקופה
      line(P.b1231, 10, 8.5),                      // הפעם המבצע ירד כבר בתעודה
      { name: P.b339.name, qty: 3, unitPrice: 12.047 } // שורה בלי productId — לפי שם
    ] }
  ],
  rets: [
    { docDate: '2026-09-02', items: [line(P.b101, 3, 5.7408)] },
    { docDate: '2026-09-04', items: [line(P.b119, 2, 7.25026), line(P.b1231, 1, 8.5)] }
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
ok('25 סופקו ב-1/9', r101.days['2026-09-01'].q === 25 && !r101.days['2026-09-01'].r);
ok('20 סופקו ו-3 חזרו באותו יום', r101.days['2026-09-02'].q === 20 && r101.days['2026-09-02'].r === 3);
ok('כמות השורה היא נטו', r101.qty === 42);
ok('סך ההחזרות נשמר בנפרד', r101.rets === 3);
const r119 = row('119');
ok('מוצר שרק חזר יוצא בכמות שלילית', r119.qty === -2 && r119.rets === 2);
ok('ובסכום שלילי', r2(r119.amount) === r2(-2 * 7.25026));

head('[3ב] לכל תא יש גם כסף — זה מה שנפתח מתחת למוצר');
ok('יום אספקה בלבד', r2(r101.days['2026-09-01'].amt) === r2(25 * 5.7408));
ok('יום שיש בו גם החזרה — נטו', r2(r101.days['2026-09-02'].amt) === r2(20 * 5.9 - 3 * 5.7408));
ok('יום החזרה בלבד יוצא שלילי', r2(r119.days['2026-09-04'].amt) === r2(-2 * 7.25026));
ok('סכום הימים של השורה = סכום השורה',
  Math.abs(m.days.reduce((s, x) => s + ((r101.days[x.day] || {}).amt || 0), 0) - r101.amount) < 0.001);

head('[4] מה לא נכנס לטבלה');
ok('שורת פיקדון אינה נספרת', !m.list.some(r => r.name.indexOf('פיקדון') > -1));
ok('שורה בלי productId מזוהה לפי שם ולא פותחת שורה כפולה',
  m.list.filter(r => r.code === '339').length === 1 && row('339').qty === 3);

head('[5] הסכומים נסגרים');
let expQty = 0, expAmt = 0;
d.recs.forEach(r => (r.items || []).forEach(l => { if (!l.isDeposit) { expQty += l.qty; expAmt += l.qty * l.unitPrice; } }));
d.rets.forEach(r => (r.items || []).forEach(l => { expQty -= l.qty; expAmt -= l.qty * l.unitPrice; }));
const gotQty = m.list.reduce((s, r) => s + r.qty, 0);
const dayQty = m.days.reduce((s, x) => s + m.dayAgg[x.day].q, 0);
const dayAmt = m.days.reduce((s, x) => s + m.dayAgg[x.day].amount, 0);
ok('סך הכמות בשורות = הכמות שהוזנה', gotQty === expQty);
ok('סך הכמות בעמודות הימים זהה', dayQty === expQty);
ok('סך הכסף בשורות = מה שהוזן', Math.abs(m.total - r2(expAmt)) <= 0.01);
ok('סך הכסף בעמודות הימים זהה', Math.abs(r2(dayAmt) - m.total) <= 0.01);
ok('מחיר ממוצע לשורה = סכום חלקי כמות', Math.abs(r101.amount / r101.qty - r2(r101.amount) / 42) < 0.001);

head('[6] הסימונים שמסבירים פער מול הנייר');
ok('מוצר במבצע פעיל מסומן', row('1231').promo === true);
ok('מבצע שהסתיים לפני התקופה אינו מסמן', row('349').promo === false);
ok('שינוי מחיר בתוך התקופה מסומן', row('101').prices.length === 2);
ok('מחיר יציב אינו מסומן', row('349').prices.length === 1);

head('[7] תקופה ריקה אינה מפילה');
const empty = rangeProductMatrixData({ recs: [], rets: [], netEx: 0 });
ok('בלי ימים ובלי שורות', empty.days.length === 0 && empty.list.length === 0 && empty.total === 0);
ok('mtxQty על ערך חסר מחזיר אפס', mtxQty(undefined) === '0' && mtxQty(null) === '0');

console.log('\n' + (fail ? '✗ נכשלו ' + fail : '✓ הכל עבר') + ' (' + pass + '/' + (pass + fail) + ')' +
  (backupArg ? ' · מול הגיבוי' : ' · מול fixture.json'));
process.exit(fail ? 1 : 0);
