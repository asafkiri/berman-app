// v66 — תעודת זיכוי אחת שסוגרת גם חזרות וגם חוסר של תעודת קליטה אחרת.
// המקרה שהוליד את זה: תעודת החזרות של 5.9 חזרה מודפסת למחרת עם שורה שלא
// החזרנו — 2 יח' פיתות כוסמין, בדיוק החוסר של הקליטה מאותו בוקר. ערך החוסר
// לפי המחירון ₪21.92, והספק זיכה ₪21.88 אחרי שעיגל את השורה בדרכו.
//
// הבדיקות רצות על הפונקציות האמיתיות מ-index.html (ראה extract.mjs), כדי
// ששני הכללים לא ייעלמו בשקט: עודף על תעודת זיכוי נבדק מול חוסר פתוח לפני
// שהוא נחשב "הספק זיכה יותר מדי", וזיכוי חוסר נסגר בסיבולת עיגול ולא באגורה.
//
// הרצה:            node tests/credit-split.test.mjs
// מול גיבוי אמיתי: node tests/credit-split.test.mjs --backup ~/bermanbackup.json
// (המסמכים בתרחיש נבנים כאן בכל מקרה — מה שמגיע מהגיבוי הוא מחירי הקטלוג
//  האמיתיים, כדי שסיבולת העיגול תיבדק מול המחירים שבאמת רצים בענן.)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractSource, APP_PATH } from './extract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const backupArg = (() => { const i = process.argv.indexOf('--backup'); return i > -1 ? process.argv[i + 1] : null; })();
const source = JSON.parse(fs.readFileSync(backupArg || path.join(HERE, 'fixture.json'), 'utf8'));
const collections = source.collections || source;
const rawProducts = collections.products;
const productList = Array.isArray(rawProducts)
  ? rawProducts.map(v => ({ id: 'code_' + v.code, ...v }))
  : Object.entries(rawProducts).map(([id, v]) => ({ id, ...v }));
const rawPromos = collections.promos || [];
const promoList = Array.isArray(rawPromos)
  ? rawPromos.map((v, i) => ({ id: 'promo_' + i, ...v }))
  : Object.entries(rawPromos).map(([id, v]) => ({ id, ...v }));
const byCode = c => productList.find(p => String(p.code) === String(c));

// ===== המצב הגלובלי שהפונקציות הנשלפות נשענות עליו =====
let products = productList, promos = promoList, receipts = [], returns = [], VAT = 0.18;

const FNS = ['r2', 'moneyDiffCents', 'lineTotalFromUnit', 'todayStr', 'storedReceiptDate', 'dDisp',
  'normNote', 'noteSign', 'notesAnchor', 'receiptAwaitingDoc', 'cloneReceiptDiffItem',
  'consumeReceiptDiffQty', 'consumeStoredReceiptOffsets', 'supplierCreditClaimOpen',
  'supplierCreditClaimDeferred', 'aiPriceFindingPromoMatch', 'promoForProduct', 'promoActive',
  'promoTriggered', 'promoFixedPrice', 'promoPctOf', 'basketQty', 'promoMinUnitsP',
  'discountedUnitPrice', 'receiptDiscrepancyInfo',
  // v66
  'shortCreditToleranceCents', 'shortCreditFullyCovers', 'ymdDayDiff', 'receiptOpenShortEx',
  'shortageCreditCandidates', 'returnsCreditSourcesForShortage', 'creditAllocationList',
  'creditAllocatedEx', 'returnsCreditForReturns', 'returnsCreditSurplus', 'returnsBalance',
  'buildCreditSplitRecords', 'creditSplitPairId', 'vatRateForDoc', 'amountIncForDoc', 'returnTotals'];
const CONSTS = ['const RECEIPT_ROUNDING_TOLERANCE_CENTS = 30;'];
// eslint-disable-next-line no-eval
const api = eval(extractSource(FNS, CONSTS) + '\n({ ' + FNS.join(', ') + ' })');
const { r2, receiptDiscrepancyInfo, shortCreditToleranceCents, shortCreditFullyCovers, ymdDayDiff,
  shortageCreditCandidates, returnsCreditSourcesForShortage, creditAllocatedEx,
  returnsCreditForReturns, returnsCreditSurplus, returnsBalance, buildCreditSplitRecords } = api;

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } };
const head = t => console.log('\n' + t);

// ===== התפאורה: הקליטה של 6.9 עם 2 יח' פיתות כוסמין שלא הגיעו =====
const PITA = byCode('401');      // פיתות כוסמין 10 בשקית — ₪10.962
const LOAF = byCode('101');      // אחיד פרוס ברמן
const BRIOCHE = byCode('349');   // לחם עננים בסגנון בריוש
const SHORT_EX = r2(PITA.price * 2);   // ₪21.92 — ערך החוסר לפי המחירון
const CREDITED_EX = 21.88;             // מה שהספק זיכה בפועל, אחרי עיגול השורה
// שורות החזרות הן של התרחיש הזה בלבד (ראה tests/README.md) — מה שנבדק כאן
// הוא היחס בין השלושה, לא הסכומים של תעודה אמיתית.
const RET_LINES = [
  { productId: LOAF.id, name: LOAF.name, qty: 6, unitPrice: LOAF.price, lineTotal: r2(LOAF.price * 6) },
  { productId: BRIOCHE.id, name: BRIOCHE.name, qty: 2, unitPrice: BRIOCHE.price, lineTotal: r2(BRIOCHE.price * 2) }
];
const RETURNED_EX = r2(RET_LINES.reduce((a, l) => a + l.lineTotal, 0)); // מה שהוחזר בפועל
const PAPER_EX = r2(RETURNED_EX + CREDITED_EX);                        // "נטו לחיוב" שעל הנייר

function makeReceipt(over) {
  return Object.assign({
    id: 'receipt_0609', date: '2026-09-06', docDate: '2026-09-06', count: 2,
    items: [
      { productId: LOAF.id, name: LOAF.name, qty: 30, unitPrice: LOAF.price, lineTotal: r2(LOAF.price * 30) },
      { productId: PITA.id, name: PITA.name, qty: 0, noteQty: 2, unitPrice: PITA.price, lineTotal: 0 }
    ],
    noteParts: [], unresolvedAmountGap: 0, unresolvedUnitsGap: 0, status: 'open'
  }, over || {});
}
function makeReturn(over) {
  return Object.assign({
    id: 'returns_0509', date: '2026-09-05', docDate: '2026-09-05', vatPct: 18,
    totalExVat: RETURNED_EX, totalIncVat: r2(RETURNED_EX * 1.18), credited: false,
    items: RET_LINES.map(l => ({ ...l }))
  }, over || {});
}

head('[1] סיבולת העיגול — שתי אגורות ליחידה, מינ׳ 3, מקס׳ 25');
ok('בלי יחידות — הרצפה 3 אג׳', shortCreditToleranceCents(0) === 3);
ok('יחידה אחת — עדיין 3 אג׳', shortCreditToleranceCents(1) === 3);
ok('שתי יחידות — 4 אג׳', shortCreditToleranceCents(2) === 4);
ok('13 יחידות — נעצר בתקרה 25', shortCreditToleranceCents(13) === 25);
ok('הרבה יחידות — עדיין 25', shortCreditToleranceCents(500) === 25);
// הגבול העליון הוא מה ששומר על הכלל: 25 אג' אינן יכולות לבלוע יחידה שלמה
const cheapestAgorot = Math.min(...productList.map(p => Math.round((Number(p.price) || 0) * 100)).filter(x => x > 0));
ok('התקרה רחוקה בסדר גודל מהמוצר הזול בקטלוג (' + cheapestAgorot + ' אג׳)', cheapestAgorot > 25 * 4);

head('[2] מתי חוסר נחשב "זוכה במלואו"');
ok('₪21.88 מול ₪21.92 בשתי יחידות — זיכוי מלא', shortCreditFullyCovers(SHORT_EX, CREDITED_EX, 2) === true);
ok('אותן ארבע אגורות ביחידה אחת — עדיין חוב פתוח', shortCreditFullyCovers(SHORT_EX, CREDITED_EX, 1) === false);
ok('זיכוי מדויק נסגר כמובן', shortCreditFullyCovers(SHORT_EX, SHORT_EX, 2) === true);
ok('זיכוי יתר נחשב מכוסה', shortCreditFullyCovers(SHORT_EX, 22.0, 2) === true);
ok('חסרות 12 אג׳ — לא נסגר', shortCreditFullyCovers(SHORT_EX, 21.8, 2) === false);
ok('בלי כסף אין סגירה', shortCreditFullyCovers(SHORT_EX, 0, 2) === false);
ok('בלי חוסר אין מה לסגור', shortCreditFullyCovers(0, 5, 2) === false);

head('[3] התעודה עצמה — ארבע אגורות כבר לא משאירות אותה אדומה');
const rcOpen = makeReceipt();
const dOpen = receiptDiscrepancyInfo(rcOpen);
ok('החוסר זוהה', (dOpen.shortItems || []).length === 1 && dOpen.shortItems[0].productId === PITA.id);
ok('שתי יחידות', dOpen.shortItems[0].n === 2);
ok('ערך החוסר ₪' + SHORT_EX, dOpen.shortValRaw === SHORT_EX);
ok('התעודה פתוחה', dOpen.open === true);
ok('אין עדיין זיכוי', dOpen.shortFullyCredited === false);

const rcCredited = makeReceipt({ shortCreditNotes: [{ amount: CREDITED_EX, at: 1788700000000 }] });
const dCredited = receiptDiscrepancyInfo(rcCredited);
ok('הזיכוי סוגר את החוסר', dCredited.shortFullyCredited === true);
ok('התעודה נסגרה', dCredited.open === false);
ok('הפרש העיגול נשמר לתצוגה — 4 אג׳', dCredited.shortCreditGapCents === 4);
ok('החוסר המקורי לא נמחק מההיסטוריה', dCredited.shortValRaw === SHORT_EX);
ok('לא נשאר חוב מוצג', dCredited.shortVal === 0);

const rcPartial = makeReceipt({ shortCreditNotes: [{ amount: 12, at: 1788700000000 }] });
const dPartial = receiptDiscrepancyInfo(rcPartial);
ok('זיכוי חלקי אמיתי נשאר חוב פתוח', dPartial.shortFullyCredited === false && dPartial.open === true);
ok('היתרה היא ההפרש', dPartial.shortVal === r2(SHORT_EX - 12));

head('[4] הבלש — לאיזה חוסר שייך העודף שעל תעודת החזרות');
receipts = [makeReceipt()];
const cands = shortageCreditCandidates(CREDITED_EX, receipts, { anchorDate: '2026-09-05' });
ok('נמצא מועמד אחד', cands.length === 1);
ok('התאמה ברמת השורה', cands[0].kind === 'item');
ok('המוצר הנכון', cands[0].items[0].productId === PITA.id && cands[0].items[0].qty === 2);
ok('התעודה הנכונה', cands[0].receiptId === 'receipt_0609');
ok('מה שמשויך הוא הכסף שעל הנייר', cands[0].amountEx === CREDITED_EX);
ok('החוב הפתוח מוצג לצידו', cands[0].remainingEx === SHORT_EX);
ok('הפרש העיגול נאמר', cands[0].diffCents === 4);
ok('עודף שאינו תואם לשום חוסר — אין מועמד', shortageCreditCandidates(50, receipts, { anchorDate: '2026-09-05' }).length === 0);
ok('עודף אפס — אין מועמד', shortageCreditCandidates(0, receipts, { anchorDate: '2026-09-05' }).length === 0);
ok('מחוץ לחלון התאריכים — אין מועמד', shortageCreditCandidates(CREDITED_EX, receipts, { anchorDate: '2026-06-01' }).length === 0);
ok('חלון מפורש רחב מספיק כן מוצא', shortageCreditCandidates(CREDITED_EX, receipts, { anchorDate: '2026-06-01', windowDays: 200 }).length === 1);
ok('תעודה בלי חוסר — אין מועמד', shortageCreditCandidates(CREDITED_EX, [makeReceipt({ items: [{ productId: LOAF.id, name: LOAF.name, qty: 30, unitPrice: LOAF.price, lineTotal: r2(LOAF.price * 30) }] })], { anchorDate: '2026-09-05' }).length === 0);
ok('חוסר שכבר זוכה — אין מועמד', shortageCreditCandidates(CREDITED_EX, [rcCredited], { anchorDate: '2026-09-05' }).length === 0);
ok('מרחק ימים נמדד נכון', ymdDayDiff('2026-09-06', '2026-09-05') === 1 && ymdDayDiff('2026-09-05', '2026-09-06') === -1);
ok('תאריך לא תקין אינו מפיל', ymdDayDiff('', '2026-09-05') === null);

head('[5] הכיוון ההפוך — מאיזו תעודת חזרות הגיע הזיכוי');
const pending = makeReturn();
const withSurplus = makeReturn({ id: 'returns_surplus', credited: true, creditNoteTotal: PAPER_EX });
const exact = makeReturn({ id: 'returns_exact', credited: true, creditNoteTotal: RETURNED_EX });
const srcs = returnsCreditSourcesForShortage(SHORT_EX, [exact, pending, withSurplus], { anchorDate: '2026-09-06', units: 2 });
ok('שתי תעודות רלוונטיות', srcs.length === 2);
ok('העודף המזוהה קודם', srcs[0].kind === 'surplus' && srcs[0].returnsId === 'returns_surplus');
ok('העודף הוא ₪' + CREDITED_EX, srcs[0].surplusEx === CREDITED_EX);
ok('תעודה שממתינה לאימות נכנסת אחריה', srcs[1].kind === 'pending' && srcs[1].returnsId === 'returns_0509');
ok('תעודה שסוגרת בדיוק אינה מקור', !srcs.some(s => s.returnsId === 'returns_exact'));
ok('חוב אפס — אין מקורות', returnsCreditSourcesForShortage(0, [withSurplus], { anchorDate: '2026-09-06', units: 2 }).length === 0);
ok('מחוץ לחלון — אין מקורות', returnsCreditSourcesForShortage(SHORT_EX, [withSurplus], { anchorDate: '2026-12-01', units: 2 }).length === 0);

head('[6] חשבון הכסף על תעודת החזרות');
const notSplit = makeReturn({ credited: true, creditNoteTotal: PAPER_EX });
ok('בלי שיוך — עודף של ₪' + CREDITED_EX, returnsCreditSurplus(notSplit) === CREDITED_EX);
ok('הסכום שנחשב לחזרות הוא הנייר המלא', returnsCreditForReturns(notSplit) === PAPER_EX);

const split = makeReturn({ credited: true, creditNoteTotal: PAPER_EX, creditNoteNumber: '290094052',
  creditAllocations: [{ id: 'cs1|a|b|1', amount: CREDITED_EX, at: 1788700000000, receiptId: 'receipt_0609', receiptDate: '2026-09-06', items: [{ productId: PITA.id, name: PITA.name, qty: 2 }] }] });
ok('ההקצאה נספרת', creditAllocatedEx(split) === CREDITED_EX);
ok('מה שנשאר לחזרות הוא בדיוק מה שהוחזר', returnsCreditForReturns(split) === RETURNED_EX);
ok('אין יותר עודף', returnsCreditSurplus(split) === 0);
ok('הקצאה בסכום אפס אינה נספרת', creditAllocatedEx(makeReturn({ creditAllocations: [{ id: 'x', amount: 0 }] })) === 0);
ok('תעודה בלי סכום נייר — אין מה להשוות', returnsCreditForReturns(makeReturn()) === null);

// הבאג שהמנגנון בא למנוע: בלי שיוך, יתרת החזרות מדווחת חוב דמיוני לנצח
returns = [notSplit];
ok('בלי שיוך — יתרת חזרות שקרית של ₪' + CREDITED_EX, returnsBalance().bal === r2(-CREDITED_EX));
returns = [split];
ok('עם שיוך — היתרה מתאפסת', returnsBalance().bal === 0);
returns = [];

head('[7] שתי רשומות תאומות — והשורות של החזרות לא זזות');
const rec = buildCreditSplitRecords(makeReturn(), makeReceipt(), CREDITED_EX,
  { id: 'cs1|fixed', at: 1788700000000, noteNumber: ' 290094052 ', items: [{ productId: PITA.id, name: PITA.name, qty: 2 }] });
ok('מזהה משותף לשני הצדדים', rec.allocation.id === 'cs1|fixed' && rec.shortNote.id === 'cs1|fixed');
ok('אותו סכום בשני הצדדים', rec.allocation.amount === CREDITED_EX && rec.shortNote.amount === CREDITED_EX);
ok('צד החזרות מצביע על תעודת הקליטה', rec.allocation.receiptId === 'receipt_0609' && rec.allocation.receiptDate === '2026-09-06');
ok('צד הקליטה מצביע על תעודת החזרות', rec.shortNote.fromReturnsId === 'returns_0509' && rec.shortNote.returnsDate === '2026-09-05');
ok('מספר התעודה נשמר נקי בשני הצדדים', rec.allocation.noteNumber === '290094052' && rec.shortNote.noteNumber === '290094052');
ok('בלי מספר תעודה — השדה לא נוצר', !('noteNumber' in buildCreditSplitRecords(makeReturn(), makeReceipt(), 5, { id: 'x' }).allocation));
ok('הפריטים נשמרים לתיאור', rec.shortNote.items[0].productId === PITA.id && rec.shortNote.items[0].qty === 2);
// הכלל שבגללו לא פשוט מוסיפים שורה לתעודת החזרות
const retAfter = makeReturn({ creditAllocations: [rec.allocation] });
ok('פיתות הכוסמין אינן שורת חזרה', !(retAfter.items || []).some(l => l.productId === PITA.id));
ok('הן נשארות חוסר בתעודת הקליטה', receiptDiscrepancyInfo(makeReceipt({ shortCreditNotes: [rec.shortNote] })).shortValRaw === SHORT_EX);
ok('כמות שהתקבלה נשארת אפס — לא תיספר כחזרה בניתוח', (makeReceipt().items.find(l => l.productId === PITA.id) || {}).qty === 0);
ok('מזהה זוג נוצר עם שני הצדדים בתוכו', creditSplitPairIdHas());
function creditSplitPairIdHas() { const s = api.creditSplitPairId('returns_0509', 'receipt_0609'); return s.indexOf('returns_0509') > -1 && s.indexOf('receipt_0609') > -1; }

head('[8] החיווט — חלון שיושב מחוץ ל-#app וכפתורים מתים');
// זה כבר קרה כאן פעמיים (ראה ההערות ליד shortCreditModal ו-retMergeModal):
// האצלת ה-data-role קשורה ל-#app בלבד, ולכן חלון מחוצה לו חייב מאזין משלו.
const appSrc = fs.readFileSync(APP_PATH, 'utf8');
const emitted = [...new Set([...appSrc.matchAll(/data-role="(credit-split-[a-z-]+|credit-alloc-cancel|short-credit-from-returns)"/g)].map(m => m[1]))];
ok('שלושת התפקידים של חלון הפיצול נפלטים', ['credit-split-pick', 'credit-split-none', 'credit-split-cancel'].every(r => emitted.includes(r)));
ok('גם ביטול שיוך וגם הכיוון ההפוך נפלטים', emitted.includes('credit-alloc-cancel') && emitted.includes('short-credit-from-returns'));
emitted.forEach(role => ok('ל-' + role + ' יש מטפל בקוד', new RegExp("role === '" + role + "'").test(appSrc) || new RegExp('data-role="' + role + '"\\]').test(appSrc)));
ok('לחלון הפיצול יש מאזין משלו', /\$\('creditSplitModal'\)\.addEventListener/.test(appSrc));
['creditSplitModal', 'creditSplitSurplus', 'creditSplitReturned', 'creditSplitPaper', 'creditSplitList',
  'creditSplitNoteNumber', 'shortCreditSources'].forEach(el => ok('קיים אלמנט ' + el, appSrc.includes('id="' + el + '"')));

console.log('\n' + (fail ? '✗ נכשלו ' + fail + ' מתוך ' + (pass + fail) : '✓ הכל עבר (' + pass + '/' + pass + ')'));
process.exit(fail ? 1 : 0);
