// v61 — מוצר במבצע מחיר-קבוע יכול להגיע בתעודה בשני מחירים לגיטימיים.
// הבדיקות רצות על הפונקציות האמיתיות מ-index.html (ראה extract.mjs).
//
// הרצה:            node tests/promo-on-paper.test.mjs
// מול גיבוי אמיתי: node tests/promo-on-paper.test.mjs --backup ~/bermanbackup.json
//
// ברירת המחדל היא fixture.json — מוצרים ומבצעים בלבד, בלי תעודות. הכמויות
// בתרחישים כתובות כאן במפורש. מצב --backup מריץ את אותם תרחישים על התעודות
// האמיתיות שבקובץ גיבוי, בלי שהגיבוי ייכנס אי פעם לריפו הציבורי.
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

// ===== המצב הגלובלי שהפונקציות הנשלפות נשענות עליו =====
let receiptList = [], receiptDocDate = null, receiptNoteTotal = null, receiptNoteUnits = null, receiptPromoOnPaper = [];

const FNS = ['r2', 'moneyDiffCents', 'receiptMoneyMatches', 'lineTotalFromUnit', 'discountedUnitPrice',
  'promoFixedPrice', 'promoPctOf', 'promoUnitPriceOf', 'promoTitle', 'promoActive', 'promoForProduct',
  'promoTriggered', 'basketQty', 'promoMinUnitsP', 'effectivePrice', 'monthEndPromoForProduct',
  'monthEndUnitRebate', 'activeReceiptDate', 'receiptPromoOnPaperHas', 'receivingUnitPrice',
  'receivingLineTotal', 'receiptPromoOnPaperCandidates', 'solveReceiptPromoOnPaper', 'todayStr',
  'promoOnPaperStamp'];
const CONSTS = ['const RECEIPT_ROUNDING_TOLERANCE_CENTS = 30;', 'const PROMO_ON_PAPER_MAX_CANDIDATES = 12;'];

// הפונקציות מוערכות בהקשר הזה, כך שהן רואות את המשתנים שלמעלה.
// eslint-disable-next-line no-eval
const api = eval(extractSource(FNS, CONSTS) + '\n({ ' + FNS.join(', ') + ' })');
const { r2, receiptMoneyMatches, effectivePrice, monthEndPromoForProduct, monthEndUnitRebate,
  receiptPromoOnPaperHas, receivingUnitPrice, solveReceiptPromoOnPaper } = api;

// ===== תרחישים =====
const DAY = '2026-09-06';
const P = { b1231: byCode('1231'), b339: byCode('339'), b101: byCode('101'), b233: byCode('233'), b2381: byCode('2381') };

// שורות התעודה. במצב --backup נלקחות מהתעודה האמיתית של אותו יום, לפי הכמות
// שכתובה בנייר; אחרת אלו הכמויות שכתובות כאן.
function scenarioLines(docDate) {
  if (backupArg && collections.receipts) {
    const rc = Object.values(collections.receipts).find(r => r.docDate === docDate);
    if (rc) return rc.items.filter(l => !l.isDeposit)
      .map(l => ({ productId: l.productId, name: l.name, qty: (l.noteQty != null ? Number(l.noteQty) : Number(l.qty)) || 0 }))
      .filter(l => l.qty > 0);
  }
  return [
    { productId: P.b1231.id, name: P.b1231.name, qty: 13 },
    { productId: P.b339.id, name: P.b339.name, qty: 7 },
    { productId: P.b101.id, name: P.b101.name, qty: 30 },
    { productId: P.b233.id, name: P.b233.name, qty: 15 },
    { productId: P.b2381.id, name: P.b2381.name, qty: 6 }
  ];
}

function load(docDate) {
  receiptDocDate = docDate;
  receiptPromoOnPaper = [];
  receiptList = scenarioLines(docDate);
  receiptNoteUnits = receiptList.reduce((a, l) => a + l.qty, 0);
}
// הסכום בדיוק מלא לפני העיגול היחיד — בדיוק מה ש-finishReceipt מעביר לפותר
function exRaw() {
  return receiptList.reduce((a, it) => a + receivingUnitPrice(products.find(p => p.id === it.productId), it.qty, receiptDocDate) * it.qty, 0);
}
// מה שהנייר היה מראה אם המבצע ירד על המוצרים שברשימה
function paperTotal(promoIds) {
  return receiptList.reduce((a, it) => {
    const p = products.find(x => x.id === it.productId);
    const pr = promoIds.includes(it.productId) ? monthEndPromoForProduct(it.productId, receiptDocDate) : null;
    return a + (pr ? api.promoUnitPriceOf(pr, effectivePrice(p, it.qty, receiptDocDate)) : effectivePrice(p, it.qty, receiptDocDate)) * it.qty;
  }, 0);
}
function apply(fix) { fix.ids.forEach(id => { if (receiptPromoOnPaper.indexOf(id) === -1) receiptPromoOnPaper.push(id); }); }

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  — ' + detail : '')); }
}
function section(t) { console.log('\n' + t); }

section('[1] המבצע ירד בתעודה על מוצר אחד (המקרה של 1231 ב-6/9/26)');
load(DAY);
receiptNoteTotal = r2(paperTotal([P.b1231.id]));
check('יש פער לפני התיקון', !receiptMoneyMatches(r2(exRaw()), receiptNoteTotal, true), 'ex=' + r2(exRaw()) + ' note=' + receiptNoteTotal);
const fix1 = solveReceiptPromoOnPaper(exRaw(), DAY);
check('נמצא פתרון יחיד', !!fix1);
check('נבחר בדיוק 1231', !!fix1 && fix1.ids.length === 1 && fix1.ids[0] === P.b1231.id, fix1 ? JSON.stringify(fix1.rows.map(r => r.name)) : 'null');
if (fix1) { apply(fix1); check('אחרי החלה — הכסף נסגר', receiptMoneyMatches(r2(exRaw()), receiptNoteTotal, true), 'ex=' + r2(exRaw())); }
check('מחיר השורה הפך למחיר המבצע', r2(receivingUnitPrice(P.b1231, 13, DAY)) === r2(api.promoFixedPrice(monthEndPromoForProduct(P.b1231.id, DAY))));
check('קיזוז המרכזת על השורה = 0', monthEndUnitRebate(monthEndPromoForProduct(P.b1231.id, DAY), receivingUnitPrice(P.b1231, 13, DAY)) === 0);
check('339 לא נגע — נשאר במחיר המלא', r2(receivingUnitPrice(P.b339, 7, DAY)) === r2(P.b339.price));

section('[2] המבצע לא ירד בתעודה (המקרה של 1/9/26) — אין מה להסביר');
load(DAY);
receiptNoteTotal = r2(paperTotal([]));
check('נסגר לבד — אין פער', receiptMoneyMatches(r2(exRaw()), receiptNoteTotal, true));
check('הפותר לא ממציא הסבר לתעודה תקינה', solveReceiptPromoOnPaper(exRaw(), DAY) === null);

section('[3] שני מוצרים במבצע באותה תעודה');
load(DAY);
receiptNoteTotal = r2(paperTotal([P.b1231.id, P.b339.id]));
const fix3 = solveReceiptPromoOnPaper(exRaw(), DAY);
check('נמצאו שניהם', !!fix3 && fix3.ids.length === 2 && fix3.ids.includes(P.b1231.id) && fix3.ids.includes(P.b339.id), fix3 ? JSON.stringify(fix3.rows.map(r => r.name)) : 'null');
if (fix3) { apply(fix3); check('הכסף נסגר', receiptMoneyMatches(r2(exRaw()), receiptNoteTotal, true)); }

section('[4] חוסר אמיתי אינו מתחפש למבצע');
load(DAY);
receiptNoteTotal = r2(paperTotal([]) + effectivePrice(P.b2381, 1, DAY)); // הנייר גבוה מהמחושב
check('פער בכיוון ההפוך אינו מקבל הסבר מבצע', solveReceiptPromoOnPaper(exRaw(), DAY) === null);

section('[5] מבצע שאינו פעיל בתאריך התעודה');
load('2026-08-15'); // לפני שהמבצע של 1231 התחיל (1/9)
receiptPromoOnPaper = [P.b1231.id];
check('הסימון מתבטל מעצמו', receiptPromoOnPaperHas(P.b1231.id, '2026-08-15') === false);
check('המחיר חוזר למלא', r2(receivingUnitPrice(P.b1231, 13, '2026-08-15')) === r2(P.b1231.price));

section('[6] סיבולת העיגול של הספק');
load(DAY);
const base6 = paperTotal([P.b1231.id]);
receiptNoteTotal = r2(base6 + 0.07);
const fix6 = solveReceiptPromoOnPaper(exRaw(), DAY);
check('נסגר גם עם 7 אגורות עיגול', !!fix6 && fix6.ids[0] === P.b1231.id);
receiptNoteTotal = r2(base6 + 0.45); // מעבר לסיבולת 30 אג׳
check('נדחה מעבר לסיבולת', solveReceiptPromoOnPaper(exRaw(), DAY) === null);

section('[7] שני צירופים סוגרים אותו פער — לא מנחשים');
load(DAY);
const promo339 = promos.find(p => (p.productIds || []).includes(P.b339.id));
const orig339 = promo339.fixedPrice;
const q1231 = receiptList.find(l => l.productId === P.b1231.id).qty;
const q339 = receiptList.find(l => l.productId === P.b339.id).qty;
const saving1231 = (P.b1231.price - api.promoFixedPrice(monthEndPromoForProduct(P.b1231.id, DAY))) * q1231;
promo339.fixedPrice = P.b339.price - saving1231 / q339; // חיסכון זהה בדיוק
receiptNoteTotal = r2(exRaw() - saving1231);
const fix7 = solveReceiptPromoOnPaper(exRaw(), DAY);
check('צירוף דו-משמעי מוחזר כ-null', fix7 === null, fix7 ? JSON.stringify(fix7.rows.map(r => r.name)) : '');
promo339.fixedPrice = orig339;

console.log('\n' + (fail ? '✗ ' + fail + ' נכשלו' : '✓ הכל עבר') + ' (' + pass + '/' + (pass + fail) + ')'
  + (backupArg ? ' · מול ' + path.basename(backupArg) : ' · מול fixture.json'));
process.exit(fail ? 1 : 0);
