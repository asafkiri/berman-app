// v118 — המרכזת החודשית מול חשבונית ברמן האמיתית של ספטמבר 2026 (1539902).
// הנתונים: tests/month-2026-09.json — התעודות וההחזרות של ספטמבר מהגיבוי,
// מצומצמות לכמויות ותאריכים בלבד (בלי סכומי נייר ובלי סריקות), והמוצרים
// והמבצעים כפי שהיו; tests/invoice-2026-09.json — 26 שורות החשבונית כפי שמודפסות.
// הבדיקה מצמידה את מה שנמצא ב-4.10.2026: 21 מתוך 26 הקודים תואמים בכמות
// בדיוק, חמישה נבדלים ביחידה אחת (החלפה בין פיתות, וכדומה), ושני מחירי לקוח
// (1220 ו-3604) שונים ממה שהמסופון מחייב — ואחרי אימוץ מחירי החשבונית כל שורה
// שהכמות שלה תואמת נסגרת לאגורה.
//
// הרצה: node tests/monthly-invoice.test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractSource } from './extract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const month = JSON.parse(fs.readFileSync(path.join(HERE, 'month-2026-09.json'), 'utf8')).collections;
const invoice = JSON.parse(fs.readFileSync(path.join(HERE, 'invoice-2026-09.json'), 'utf8'));
const products = Object.entries(month.products).map(([id, v]) => ({ id, ...v }));
const promos = Object.entries(month.promos).map(([id, v]) => ({ id, ...v }));
const recs = Object.values(month.receipts), rets = Object.values(month.returns);

const FNS = ['r2', 'todayStr', 'storedReceiptDate', 'productCode', 'productListPrice',
  'promoFixedPrice', 'promoActive', 'monthEndPromoForProduct', 'monthEndUnitRebate', 'mtxQty',
  'mtxPromoUnit', 'vatRateForDoc', 'priceAt', 'invoiceUnitAt', 'priceHistoryWith', 'receiptCreditedShortUnits', 'lineOwnCode', 'rangeProductMatrixData'];
// eslint-disable-next-line no-eval
const api = eval('let VAT = 0.18;\n' + extractSource(FNS, []) + '\n({ ' + FNS.join(', ') + ' })');
const { r2, rangeProductMatrixData, priceHistoryWith } = api;

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); } };
const head = t => console.log('\n' + t);
const byCode = c => products.find(p => p.code === String(c));
const round3 = n => Math.round(n * 1000) / 1000;

// ברמן פיצלה "חלומית ארוזה" לשני קודים על אותו ברקוד; בטבלה הם שורה אחת
byCode('458').altCodes = ['4581'];
const invoiceLinesOf = row => [row.code].concat(row.product && row.product.altCodes || []).map(c => invoice.lines[c]).filter(Boolean);
const compare = () => {
  const m = rangeProductMatrixData({ recs, rets });
  const out = { m, rows: new Map(), invoiceTotal: 0 };
  m.list.forEach(row => {
    const lines = invoiceLinesOf(row);
    const invQty = lines.reduce((a, l) => a + l[0], 0), invAmount = r2(lines.reduce((a, l) => a + l[0] * l[1], 0));
    out.invoiceTotal += invAmount;
    out.rows.set(row.code, { row, lines, invQty, invAmount, qtyDiff: row.expectedQty - invQty, amountDiff: r2(row.amount - invAmount) });
  });
  out.invoiceTotal = r2(out.invoiceTotal);
  return out;
};

head('[1] כל שורות החשבונית מופיעות בטבלה, ובסדר הקודים כמחרוזת');
let c = compare();
ok('25 שורות (26 קודים, 458+4581 מאוחדים)', c.m.list.length === 25, String(c.m.list.length));
ok('כל קוד בחשבונית מצא שורה', Object.keys(invoice.lines).every(code => c.m.list.some(r => [r.code].concat(r.product.altCodes || []).indexOf(code) !== -1)));
ok('סכום שורות החשבונית = סה"כ לפני מע"מ המודפס (±0.02)', Math.abs(c.invoiceTotal - invoice.totalEx) <= 0.02, String(c.invoiceTotal));
ok('הסדר: 101 → 111 → 119 → 1220 → 1231 → 1244 → 220', c.m.list.slice(0, 7).map(r => r.code).join(',') === '101,111,119,1220,1231,1244,220');

head('[2] כמויות: 20 שורות תואמות בדיוק, חמש נבדלות ביחידה אחת (מה שנמצא ב-4.10)');
const knownQtyGaps = { '2381': 1, '2387': -1, '349': 1, '450': 1, '451': -1 };
let exact = 0;
c.rows.forEach((x, code) => {
  if (knownQtyGaps[code] != null) ok(code + ': אצלנו ' + x.row.expectedQty + ' מול ' + x.invQty + ' בחשבונית', x.qtyDiff === knownQtyGaps[code], String(x.qtyDiff));
  else if (x.qtyDiff === 0) exact++;
  else ok(code + ': כמות לא תואמת ולא ידועה', false, x.row.expectedQty + ' מול ' + x.invQty);
});
ok('20 שורות תואמות בדיוק בכמות', exact === 20, String(exact));
ok('ברמן זיכתה את כל החוסרים של ספטמבר: צפוי בחשבונית = מה שמגיע', c.m.openUnits === 0 && c.m.overUnits === 0 && c.m.total === c.m.fairTotal);
const r3604 = c.rows.get('3604').row;
ok('פרנה: חויבה 11, נספרה 9, שתי היחידות שחסרו זוכו בכסף (9.03 כל אחת) — 9 בחשבונית', r3604.billed === 11 && r3604.received === 9 && r3604.credited === 2 && r3604.expectedQty === 9);
const r401 = c.rows.get('401').row;
ok('פיתות כוסמין: חוסר של 2 שזוכה דרך תעודת זיכוי — 32 חויבו, 30 בחשבונית', r401.billed === 32 && r401.credited === 2 && r401.expectedQty === 30);

head('[3] מחירים: מבצעי המרכזת כבר בשורה, ושני מחירי לקוח שונים מהמסופון');
ok('ברמן אקטיב 97 × 10.000 = 970.00 כמו בחשבונית', c.rows.get('339').row.unit === 10 && c.rows.get('339').row.amount === 970 && c.rows.get('339').amountDiff === 0);
ok('לחמניות 10 בשקית 230 × 8.500 = 1,955.00', c.rows.get('1231').row.amount === 1955 && c.rows.get('1231').amountDiff === 0);
ok('לחמנ׳ עננים 10: אצלנו 14.28 (מחירון−30%), בחשבונית 12.00', r2(c.rows.get('1220').row.unit) === 14.28 && c.rows.get('1220').lines[0][1] === 12);
ok('פרנה: אצלנו 9.03, בחשבונית 9.50', r2(c.rows.get('3604').row.unit) === 9.03 && c.rows.get('3604').lines[0][1] === 9.5);
ok('הפער הכולל לפני אימוץ מחירים: ~113 (1220: 109.44, פרנה: −4.23, והיתר יחידות ואגורות)', Math.abs(c.m.total - c.invoiceTotal - 112.96) < 0.05, String(r2(c.m.total - c.invoiceTotal)));

head('[4] אימוץ מחיר החשבונית מ-1/9 מתקן את השורה, ולא נוגע ב-product.price');
const p1220 = byCode('1220'), p3604 = byCode('3604');
const price1220 = p1220.price, price3604 = p3604.price;
p1220.priceHistory = priceHistoryWith(p1220, '2026-09-01', 12, { method: 'invoice', month: '2026-09' });
p3604.priceHistory = priceHistoryWith(p3604, '2026-09-01', 9.5, { method: 'invoice', month: '2026-09' });
c = compare();
ok('1220: 48 × 12.000 = 576.00', c.rows.get('1220').row.amount === 576 && c.rows.get('1220').amountDiff === 0);
ok('3604: 9 × 9.500 = 85.50 — והזיכוי על החוסר עדיין נמדד במחיר התעודה (9.03)', c.rows.get('3604').row.amount === 85.5 && c.rows.get('3604').row.credited === 2);
ok('product.price לא השתנה', p1220.price === price1220 && p3604.price === price3604);
ok('אוגוסט לא הושפע: המחיר ב-31/8 הוא עדיין 14.28', api.priceAt(p1220, '2026-08-31') === price1220 && api.priceAt(p1220, '2026-09-01') === 12);

head('[5] ברמן מחשבת מחיר לקוח בשלוש ספרות; אחרי אימוץ כל מחיר שונה, כל שורה עם כמות תואמת נסגרת לאגורה');
c.rows.forEach((x, code) => {
  if (x.lines.length !== 1) return;
  const inv = x.lines[0][1];
  if (round3(x.row.unit) !== round3(inv) && x.row.product) x.row.product.priceHistory = priceHistoryWith(x.row.product, '2026-09-01', inv, { method: 'invoice', month: '2026-09' });
});
c = compare();
let closed = 0, open = [];
c.rows.forEach((x, code) => { if (x.qtyDiff === 0 && code !== '458') { if (Math.abs(x.amountDiff) <= 0.011) closed++; else open.push(code + ':' + x.amountDiff); } });
ok('19 השורות התואמות בכמות (חוץ מ-458) תואמות גם בסכום (±0.01)', closed === 19 && !open.length, open.join(' '));
// 4581 הוא מוצר נפרד אצל ברמן עם מחיר משלו (10.452 מול 10.406). איחוד הקודים
// מיישר את הכמות (31) אבל לא את הכסף — עד שיוגדר כמוצר נפרד נשאר 23 × 0.046
ok('458/4581: הכמות תואמת, ההפרש הוא רק מחיר 4581 (−1.05)', c.rows.get('458').qtyDiff === 0 && Math.abs(c.rows.get('458').amountDiff + 1.05) < 0.02, String(c.rows.get('458').amountDiff));
const unitGapsEx = Object.keys(knownQtyGaps).reduce((a, code) => a + knownQtyGaps[code] * invoice.lines[code][1], 0);
ok('מה שנשאר מהפער הכולל: חמש היחידות ו-4581 (±0.05)', Math.abs((c.m.total - c.invoiceTotal) - (unitGapsEx - 1.05)) < 0.05, r2(c.m.total - c.invoiceTotal) + ' מול ' + r2(unitGapsEx - 1.05));

head('[6] שורות שהועברו קדימה אינן נספרות פעמיים');
const p101 = byCode('101');
const carry = { docDate: '2026-09-30', credited: true, items: [{ productId: 'carry_1', name: p101.name, barcode: p101.barcode, qty: 5, unitPrice: 5.7408, carried: true }] };
const before = rangeProductMatrixData({ recs, rets }).list.find(r => r.code === '101');
const after = rangeProductMatrixData({ recs, rets: rets.concat([carry]) }).list.find(r => r.code === '101');
ok('שורה שהועברה: זוכה (+5) אבל לא "נשלחה" שוב', after.credited === before.credited + 5 && after.sent === before.sent);

console.log('\n' + (fail ? '✗ נכשלו ' + fail : '✓ הכל עבר') + ' (' + pass + '/' + (pass + fail) + ')');
process.exit(fail ? 1 : 0);
