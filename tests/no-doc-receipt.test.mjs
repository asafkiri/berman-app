// v63 — קליטה בלי תעודה. הבדיקות רצות על הפונקציות האמיתיות מ-index.html
// (ראה extract.mjs), כדי שהכלל "תעודה בלי נייר אינה יכולה להיות אומתה"
// לא ייעלם בשקט בשינוי הבא.
//
// הרצה: node tests/no-doc-receipt.test.mjs
import { extractSource } from './extract.mjs';

const FNS = ['r2', 'moneyDiffCents', 'lineTotalFromUnit', 'todayStr', 'storedReceiptDate',
  'normNote', 'noteSign', 'notesAnchor', 'receiptAwaitingDoc', 'cloneReceiptDiffItem',
  'consumeReceiptDiffQty', 'consumeStoredReceiptOffsets', 'supplierCreditClaimOpen',
  'supplierCreditClaimDeferred', 'aiPriceFindingPromoMatch', 'promoForProduct', 'promoActive',
  'promoTriggered', 'promoFixedPrice', 'promoPctOf', 'basketQty', 'promoMinUnitsP',
  'discountedUnitPrice', 'shortCreditToleranceCents', 'shortCreditFullyCovers',
  'receiptDiscrepancyInfo'];
const CONSTS = ['const RECEIPT_ROUNDING_TOLERANCE_CENTS = 30;'];
let products = [], promos = [], receiptList = [];
// eslint-disable-next-line no-eval
const api = eval(extractSource(FNS, CONSTS) + '\n({ ' + FNS.join(', ') + ' })');
const { receiptAwaitingDoc, receiptDiscrepancyInfo } = api;

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } };
const head = t => console.log('\n' + t);

// שלוש שורות, 30 יחידות, ₪300 — הספירה של החנות.
const items = [
  { productId: 'a', name: 'לחם', qty: 10, unitPrice: 10, lineTotal: 100 },
  { productId: 'b', name: 'חלה', qty: 12, unitPrice: 10, lineTotal: 120 },
  { productId: 'c', name: 'בגט', qty: 8, unitPrice: 10, lineTotal: 80 }
];
const base = { items, date: '2026-09-06', docDate: '2026-09-06', totalExVat: 300, count: 3 };

head('[1] נקלטה בלי תעודה — פתוחה, אבל לא בגלל הפרש');
const noDoc = { ...base, noDoc: true, noteParts: [], noteTotalInc: null, status: 'open' };
const d1 = receiptDiscrepancyInfo(noDoc);
ok('מזוהה כממתינה לנייר', receiptAwaitingDoc(noDoc) === true);
ok('התעודה פתוחה', d1.open === true);
ok('הדגל עולה גם ב-di', d1.awaitingDoc === true);
ok('אין חוסר מומצא', (d1.shortItems || []).length === 0);
ok('אין עודף מומצא', (d1.overItems || []).length === 0);
ok('אין פער יחידות מומצא', d1.unresolvedUnitsGap === 0);

head('[2] הנייר צורף ותואם — התעודה נסגרת כרגיל');
const attached = { ...base, noDoc: true, noteTotalInc: 300,
  noteParts: [{ amount: 300, units: 30, lines: 3, kind: 'charge' }],
  unresolvedAmountGap: 0, unresolvedUnitsGap: 0 };
const d2 = receiptDiscrepancyInfo(attached);
ok('אינה ממתינה עוד לנייר', receiptAwaitingDoc(attached) === false);
ok('התעודה נסגרה', d2.open === false);
ok('הדגל כבוי', !d2.awaitingDoc);

head('[3] הנייר צורף וגילה חוסר — הבדיקה הרגילה עובדת על ספירה שנעשתה בלי נייר');
const short = { ...attached,
  items: items.map(l => l.productId === 'b' ? { ...l, qty: 10, noteQty: 12, lineTotal: 100 } : l),
  noteParts: [{ amount: 300, units: 30, lines: 3, kind: 'charge' }] };
const d3 = receiptDiscrepancyInfo(short);
ok('התעודה פתוחה', d3.open === true);
ok('החוסר זוהה', (d3.shortItems || []).length === 1 && d3.shortItems[0].productId === 'b');
ok('שתי היחידות החסרות נספרו', d3.shortItems[0].n === 2);
ok('זה כבר לא "ממתינה לנייר"', !d3.awaitingDoc);

head('[4] תעודה רגילה — בלי רגרסיה');
const normal = { ...base, noteTotalInc: 300, noteParts: [{ amount: 300, units: 30, lines: 3, kind: 'charge' }], unresolvedAmountGap: 0, unresolvedUnitsGap: 0 };
ok('אינה ממתינה לנייר', receiptAwaitingDoc(normal) === false);
ok('נסגרת', receiptDiscrepancyInfo(normal).open === false);

head('[5] הדגל לבדו אינו מספיק — נייר שכבר צורף מנצח');
ok('noDoc בלי noteParts = ממתינה', receiptAwaitingDoc({ noDoc: true, noteParts: [] }) === true);
ok('noDoc עם noteParts = לא ממתינה', receiptAwaitingDoc({ noDoc: true, noteParts: [{ amount: 5 }] }) === false);
ok('בלי noDoc — לעולם לא ממתינה', receiptAwaitingDoc({ noteParts: [] }) === false);
ok('תעודה ריקה אינה מפילה', receiptAwaitingDoc(null) === false);

console.log('\n' + (fail ? '✗ נכשלו ' + fail + ' מתוך ' + (pass + fail) : '✓ הכל עבר (' + pass + '/' + pass + ')'));
process.exit(fail ? 1 : 0);
