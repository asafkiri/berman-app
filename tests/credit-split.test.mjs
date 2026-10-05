// v66 — תעודת זיכוי אחת שסוגרת גם חזרות וגם חוסר של תעודת קליטה אחרת.
// המקרה שהוליד את זה: תעודת החזרות של 5.9 חזרה מודפסת למחרת עם שורה שלא
// החזרנו — 2 יח' פיתות כוסמין, בדיוק החוסר של הקליטה מאותו בוקר.
//
// v123: הקישור ביחידות. באימות הזיכוי מסמנים "זוכה גם על מוצר שלא הוחזר"
// (מוצר + כמות), והבלש מחפש חוסר פתוח באותו מוצר בחלון של 14 יום. שתי
// הרשומות התאומות נושאות מוצר וכמות בלי סכום. הכלל הכספי הישן (סיבולת עיגול
// מול shortCreditNotes) נשאר לתעודות שנרשמו לפני v123 — [3]. (v124: [1]–[2] בדקו את
// shortCreditToleranceCents/shortCreditFullyCovers, שאינן בשימוש מאז v123 והוסרו.)
//
// הבדיקות רצות על הפונקציות האמיתיות מ-index.html (ראה extract.mjs).
//
// הרצה:            node tests/credit-split.test.mjs
// מול גיבוי אמיתי: node tests/credit-split.test.mjs --backup ~/bermanbackup.json
// (המסמכים בתרחיש נבנים כאן בכל מקרה — מה שמגיע מהגיבוי הוא הקטלוג האמיתי.)
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

const FNS = ['r2', 'lineTotalFromUnit', 'todayStr', 'storedReceiptDate', 'dDisp',
  'normNote', 'noteSign', 'notesAnchor', 'receiptAwaitingDoc', 'cloneReceiptDiffItem',
  'consumeReceiptDiffQty', 'consumeStoredReceiptOffsets', 'receiptDiscrepancyInfo', 'productListPrice', 'priceAt', 'receiptPaperLineCount',
  // v66 / v123
  'ymdDayDiff', 'receiptOpenShortUnits', 'creditLineSameProduct',
  'shortageCreditCandidates', 'returnsCreditSourcesForShortage', 'creditAllocationList', 'returnsBalance',
  'buildCreditSplitRecords', 'creditSplitPairId', 'vatRateForDoc', 'receiptCreditedShortUnits',
  // v78 — החזרת פריטים מתעודת חזרות לרשימת החזרות הפתוחה
  'returnCarriedNotes', 'retCarryKey', 'consumeReturnCarriedNotes', 'returnsDiscrepancyInfo',
  'returnCreditNotes', 'consumeReturnLinkedCredit'];
const CONSTS = [];
// eslint-disable-next-line no-eval
const api = eval(extractSource(FNS, CONSTS) + '\n({ ' + FNS.join(', ') + ' })');
const { r2, receiptDiscrepancyInfo, ymdDayDiff,
  shortageCreditCandidates, returnsCreditSourcesForShortage, creditAllocationList, returnsBalance,
  buildCreditSplitRecords, receiptCreditedShortUnits } = api;

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

// v123: זיכוי ביחידות סוגר את החוסר לפני הכלל הכספי, ומתועד לתצוגה
const rcUnits = makeReceipt({ shortCreditUnits: [{ id: 'u1', productId: PITA.id, name: PITA.name, qty: 2, source: 'credit-note', at: 1788700000000, noteNumber: '290094052' }] });
const dUnits = receiptDiscrepancyInfo(rcUnits);
ok('שתי יחידות שזוכו סוגרות את החוסר', dUnits.open === false && dUnits.shortItems.length === 0);
ok('מה שזוכה מתועד ביחידות', dUnits.creditedUnits.length === 1 && dUnits.creditedUnits[0].qty === 2 && dUnits.creditedUnits[0].id === 'u1');
ok('עם מספר התעודה לזיהוי', dUnits.creditedUnits[0].noteNumber === '290094052');
ok('השם החדש של יתרת החוסר ביחידות', dUnits.shortUnitsLeft === 0 && !('shortCreditUnits' in dUnits));
const dUnitsHalf = receiptDiscrepancyInfo(makeReceipt({ shortCreditUnits: [{ id: 'u1', productId: PITA.id, qty: 1 }] }));
ok('יחידה אחת מתוך שתיים — נשאר חוסר של אחת', dUnitsHalf.open === true && dUnitsHalf.shortUnits === 1);
// קורא המרכזת: יחידות קודם, ואחריהן הזיכוי הכספי הישן על מה שנשאר
const twoShort = makeReceipt({ items: [
  { productId: LOAF.id, name: LOAF.name, qty: 28, noteQty: 30, unitPrice: LOAF.price },
  { productId: PITA.id, name: PITA.name, qty: 0, noteQty: 2, unitPrice: PITA.price }] });
const both = receiptCreditedShortUnits({ ...twoShort, shortCreditUnits: [{ id: 'u', productId: LOAF.id, qty: 2 }], shortCreditNotes: [{ amount: CREDITED_EX, at: 1 }] }, '2026-09-06');
ok('המרכזת: יחידות ללחם, והזיכוי הכספי הישן לפיתות', both[LOAF.id] === 2 && both[PITA.id] === 2);
ok('המרכזת: יחידות לא נספרות מעבר לחוסר', receiptCreditedShortUnits({ ...makeReceipt(), shortCreditUnits: [{ productId: PITA.id, qty: 5 }] }, '2026-09-06')[PITA.id] === 2);

head('[4] הבלש — לאיזה חוסר שייך מוצר שזוכה בלי שהוחזר');
receipts = [makeReceipt()];
const PITA2 = [{ productId: PITA.id, name: PITA.name, qty: 2 }];
const cands = shortageCreditCandidates(PITA2, receipts, { anchorDate: '2026-09-05' });
ok('נמצא מועמד אחד', cands.length === 1);
ok('כמות מדויקת', cands[0].kind === 'item' && cands[0].partial === false);
ok('המוצר והכמות', cands[0].items.length === 1 && cands[0].items[0].productId === PITA.id && cands[0].items[0].qty === 2);
ok('התעודה הנכונה', cands[0].receiptId === 'receipt_0609');
ok('בלי סכום במועמד', !('amountEx' in cands[0]) && !('remainingEx' in cands[0]));
ok('יחידה אחת מתוך שתיים — מועמד חלקי', shortageCreditCandidates([{ ...PITA2[0], qty: 1 }], receipts, { anchorDate: '2026-09-05' })[0].partial === true);
ok('זיכוי על 3 כשחסרו 2 — משויכות רק 2', shortageCreditCandidates([{ ...PITA2[0], qty: 3 }], receipts, { anchorDate: '2026-09-05' })[0].items[0].qty === 2);
ok('מוצר אחר — אין מועמד', shortageCreditCandidates([{ productId: BRIOCHE.id, name: BRIOCHE.name, qty: 2 }], receipts, { anchorDate: '2026-09-05' }).length === 0);
ok('בלי כמות — אין מועמד', shortageCreditCandidates([{ ...PITA2[0], qty: 0 }], receipts, { anchorDate: '2026-09-05' }).length === 0);
ok('מחוץ לחלון 14 הימים — אין מועמד', shortageCreditCandidates(PITA2, receipts, { anchorDate: '2026-08-20' }).length === 0);
ok('חלון מפורש רחב מספיק כן מוצא', shortageCreditCandidates(PITA2, receipts, { anchorDate: '2026-06-01', windowDays: 200 }).length === 1);
ok('חוסר שכבר זוכה ביחידות — אין מועמד', shortageCreditCandidates(PITA2, [rcUnits], { anchorDate: '2026-09-05' }).length === 0);
ok('חוסר שזוכה בכסף לפני v123 — אין מועמד', shortageCreditCandidates(PITA2, [rcCredited], { anchorDate: '2026-09-05' }).length === 0);
// זיכוי כספי ישן שכיסה יחידה אחת מתוך שתיים — מוצעת רק היחידה שנשארה
const rcHalfMoney = makeReceipt({ shortCreditNotes: [{ amount: r2(PITA.price), at: 1 }] });
ok('זיכוי כספי ישן חלקי — היחידה שכוסתה יורדת מהפתוח', JSON.stringify(api.receiptOpenShortUnits(rcHalfMoney)) === JSON.stringify({ [PITA.id]: 1 }));
const halfCands = shortageCreditCandidates(PITA2, [rcHalfMoney], { anchorDate: '2026-09-05' });
ok('ומוצעת רק יחידה אחת', halfCands.length === 1 && halfCands[0].items[0].qty === 1 && halfCands[0].remainingUnits === 1);
ok('המועמד אומר איזו שורה נצרכה ובכמה', JSON.stringify(halfCands[0].used) === JSON.stringify([{ i: 0, qty: 1 }]));
const near = makeReceipt({ id: 'near', date: '2026-09-06', docDate: '2026-09-06' });
const far = makeReceipt({ id: 'far', date: '2026-09-15', docDate: '2026-09-15' });
ok('הקרובה בתאריך קודם', shortageCreditCandidates(PITA2, [far, near], { anchorDate: '2026-09-05' }).map(c => c.receiptId).join() === 'near,far');
ok('מרחק ימים נמדד נכון', ymdDayDiff('2026-09-06', '2026-09-05') === 1 && ymdDayDiff('2026-09-05', '2026-09-06') === -1);
ok('תאריך לא תקין אינו מפיל', ymdDayDiff('', '2026-09-05') === null);

head('[5] הכיוון ההפוך — מאיזו תעודת חזרות הגיע הזיכוי');
const pending = makeReturn();
const verified = makeReturn({ id: 'returns_verified', date: '2026-09-07', docDate: '2026-09-07', credited: true, creditNoteTotal: 70 });
const old = makeReturn({ id: 'returns_old', date: '2026-08-01', docDate: '2026-08-01', credited: true });
const srcs = returnsCreditSourcesForShortage(PITA2, [old, verified, pending], { anchorDate: '2026-09-06' });
ok('שתי תעודות בחלון', srcs.length === 2 && !srcs.some(s => s.returnsId === 'returns_old'));
ok('גם תעודה שממתינה לאימות וגם שאומתה', srcs.some(s => s.kind === 'pending') && srcs.some(s => s.kind === 'verified'));
ok('כמה יחידות הוחזרו בה — בלי ₪', srcs[0].units === 8 && !('returnedEx' in srcs[0]) && !('surplusEx' in srcs[0]));
ok('בלי יחידות שנבחרו — אין מקורות', returnsCreditSourcesForShortage([{ ...PITA2[0], qty: 0 }], [pending], { anchorDate: '2026-09-06' }).length === 0);

head('[6] מאזן החזרות ביחידות');
const shortRet = makeReturn({ id: 'r_short', credited: true, creditStatus: 'open', items: [{ ...RET_LINES[0], noteQty: 4 }, { ...RET_LINES[1] }] });
const overRet = makeReturn({ id: 'r_over', credited: true, creditStatus: 'open', items: [{ ...RET_LINES[1], noteQty: 3 }] });
returns = [shortRet, overRet, makeReturn({ id: 'r_ok', credited: true, creditStatus: 'ok' }), makeReturn({ id: 'r_pending' })];
const bal = returnsBalance();
ok('חוסר 2 יח׳ ועודף 1 יח׳ בשתי תעודות', bal.shortUnits === 2 && bal.overUnits === 1 && bal.openDocs === 2);
ok('נספרות רק תעודות שאומתו', bal.n === 3);
ok('בלי ₪', !('bal' in bal));
returns = [];

head('[7] שתי רשומות תאומות — מוצר וכמות, והשורות של החזרות לא זזות');
const rec = buildCreditSplitRecords(makeReturn(), makeReceipt(), PITA2,
  { id: 'cs1|fixed', at: 1788700000000, noteNumber: ' 290094052 ' });
ok('מזהה משותף לשני הצדדים', rec.allocation.id === 'cs1|fixed' && rec.units.every(u => u.id === 'cs1|fixed'));
ok('בלי סכום בשני הצדדים', !('amount' in rec.allocation) && rec.units.every(u => !('amount' in u)));
ok('ההקצאה נושאת מוצר וכמות', JSON.stringify(rec.allocation.items) === JSON.stringify([{ productId: PITA.id, name: PITA.name, qty: 2 }]));
ok('צד החזרות מצביע על תעודת הקליטה', rec.allocation.receiptId === 'receipt_0609' && rec.allocation.receiptDate === '2026-09-06');
ok('צד הקליטה: רשומת יחידות שמצביעה על תעודת החזרות', rec.units.length === 1 && rec.units[0].productId === PITA.id && rec.units[0].qty === 2 &&
  rec.units[0].fromReturnsId === 'returns_0509' && rec.units[0].returnsDate === '2026-09-05' && rec.units[0].source === 'returns-note');
ok('מספר התעודה נשמר נקי בשני הצדדים', rec.allocation.noteNumber === '290094052' && rec.units[0].noteNumber === '290094052');
ok('בלי מספר תעודה — השדה לא נוצר', !('noteNumber' in buildCreditSplitRecords(makeReturn(), makeReceipt(), PITA2, { id: 'x' }).allocation));
ok('שורה בלי מוצר אינה נרשמת', buildCreditSplitRecords(makeReturn(), makeReceipt(), [{ name: 'x', qty: 2 }], { id: 'x' }).units.length === 0);
// הכלל שבגללו לא פשוט מוסיפים שורה לתעודת החזרות
const retAfter = makeReturn({ creditAllocations: [rec.allocation] });
ok('פיתות הכוסמין אינן שורת חזרה', !(retAfter.items || []).some(l => l.productId === PITA.id));
ok('הקצאה ביחידות בלי סכום נספרת כקישור (חוסמת מחיקה ומיזוג)', creditAllocationList(retAfter).length === 1);
ok('הקצאה ריקה אינה נספרת', creditAllocationList(makeReturn({ creditAllocations: [{ id: 'x', amount: 0, items: [] }] })).length === 0);
ok('החוסר בתעודת הקליטה נסגר בתאום', receiptDiscrepancyInfo(makeReceipt({ shortCreditUnits: rec.units })).open === false);
ok('כמות שהתקבלה נשארת אפס — לא תיספר כחזרה בניתוח', (makeReceipt().items.find(l => l.productId === PITA.id) || {}).qty === 0);
ok('מזהה זוג נוצר עם שני הצדדים בתוכו', creditSplitPairIdHas());
function creditSplitPairIdHas() { const s = api.creditSplitPairId('returns_0509', 'receipt_0609'); return s.indexOf('returns_0509') > -1 && s.indexOf('receipt_0609') > -1; }

head('[8] החיווט — חלון שיושב מחוץ ל-#app וכפתורים מתים');
// זה כבר קרה כאן פעמיים (ראה ההערות ליד shortCreditModal ו-retMergeModal):
// האצלת ה-data-role קשורה ל-#app בלבד, ולכן חלון מחוצה לו חייב מאזין משלו.
const appSrc = fs.readFileSync(APP_PATH, 'utf8');
const emitted = [...new Set([...appSrc.matchAll(/data-role="(credit-split-[a-z-]+|credit-alloc-cancel|short-credit-[a-z-]+|rc-short-credit-undo|rv-extra-[a-z]+)"/g)].map(m => m[1]))];
ok('שלושת התפקידים של חלון הפיצול נפלטים', ['credit-split-pick', 'credit-split-none', 'credit-split-cancel'].every(r => emitted.includes(r)));
ok('גם ביטול שיוך וגם הכיוון ההפוך נפלטים', emitted.includes('credit-alloc-cancel') && emitted.includes('short-credit-from-returns'));
ok('בורר היחידות בחלון הזיכוי נפלט', emitted.includes('short-credit-minus') && emitted.includes('short-credit-plus'));
ok('"זוכה גם על מוצר שלא הוחזר" נפלט', ['rv-extra-minus', 'rv-extra-plus', 'rv-extra-remove'].every(r => emitted.includes(r)) && appSrc.includes("addListRowHtml(p, 'rv-extra-add', q)") && /role === 'rv-extra-add'/.test(appSrc));
emitted.forEach(role => ok('ל-' + role + ' יש מטפל בקוד', new RegExp("role === '" + role + "'").test(appSrc) || new RegExp('data-role="' + role + '"\\]').test(appSrc)));
ok('לחלון הפיצול יש מאזין משלו', /\$\('creditSplitModal'\)\.addEventListener/.test(appSrc));
ok('לחלון הזיכוי יש מאזין משלו', /\$\('shortCreditModal'\)\.addEventListener/.test(appSrc));
['creditSplitModal', 'creditSplitExtra', 'creditSplitList', 'creditSplitNoteNumber', 'shortCreditSources', 'shortCreditLines', 'shortCreditNoteNumber']
  .forEach(el => ok('קיים אלמנט ' + el, appSrc.includes('id="' + el + '"')));
['creditSplitSurplus', 'creditSplitReturned', 'creditSplitPaper', 'shortCreditAmount']
  .forEach(el => ok('האלמנט הכספי ' + el + ' ירד — וגם כל התייחסות אליו', !appSrc.includes(el)));
ok('אין יותר הצעת "השלמת זיכוי אפשרית" לפי סכום', !appSrc.includes('credit-split-open'));

console.log('\n' + (fail ? '✗ נכשלו ' + fail + ' מתוך ' + (pass + fail) : '✓ הכל עבר (' + pass + '/' + pass + ')'));
process.exit(fail ? 1 : 0);
