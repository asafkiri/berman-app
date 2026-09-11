// v62 — שער האמון של זרימת הצילום-תחילה.
// כשהעוגנים אינם מוקלדים, מה שמאשר שה-AI קרא נכון הוא בלוק הסיכום שבתחתית
// הנייר, שמודפס בנפרד מהשורות. הבדיקות כאן בונות תשובות סריקה סינתטיות —
// גיבוי אמיתי אינו שומר את גוף התשובה — ומוודאות שהשער נפתח רק כששלוש
// הבדיקות עוברות, ושהוא אומר במדויק מה לא נסגר כשהוא נסגר.
//
// הרצה: node tests/paper-anchors.test.mjs
import { extractSource } from './extract.mjs';

const FNS = ['r2', 'fmtMoney', 'aiMoneyCents', 'aiDocRowUnits', 'bermanFullListMatch', 'bermanPaperAnchorCheck', 'bermanPaperAnchorsFromScan'];
const CONSTS = ['const RECEIPT_ROUNDING_TOLERANCE_CENTS = 30;'];
// eslint-disable-next-line no-eval
const api = eval(extractSource(FNS, CONSTS) + '\n({ ' + FNS.join(', ') + ' })');
const { bermanPaperAnchorCheck, bermanPaperAnchorsFromScan } = api;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  — ' + detail : '')); }
}
function section(t) { console.log('\n' + t); }

// תעודה כפי שהיא חוזרת מהשרת אחרי bermanAdaptScanPayload
function row(description, quantity, unitPrice) {
  return { description, quantity, unitPriceExVat: unitPrice, lineTotalExVat: Math.round(unitPrice * quantity * 100) / 100 };
}
function doc(rows, overrides) {
  const rowsTotal = Math.round(rows.reduce((a, r) => a + r.lineTotalExVat, 0) * 100) / 100;
  const units = rows.reduce((a, r) => a + (/פ.?קדון/.test(r.description) ? 0 : r.quantity), 0);
  return Object.assign({
    rows, subtotalExVat: rowsTotal, printedUnits: units, printedLines: rows.length, docType: 'delivery'
  }, overrides || {});
}
const scan = docs => ({ scan: { documents: docs } });

const CLEAN = [row('אחיד פרוס ברמן', 30, 5.7408), row('לחמניות 10 בשקית', 13, 8.5),
  row('ברמן אקטיב', 7, 12.047), row('זוג לחמניות אצבע', 15, 2.16603), row('פיתות פרימיום 10', 6, 9.6512)];

section('[1] תעודה שנקראה נכון — השער נפתח');
const okDoc = doc(CLEAN);
const c1 = bermanPaperAnchorCheck(okDoc);
check('שלוש הבדיקות עוברות', c1.ok && c1.money === true && c1.units === true && c1.lines === true, JSON.stringify({ m: c1.money, u: c1.units, l: c1.lines }));
const a1 = bermanPaperAnchorsFromScan(scan([okDoc]));
check('מוחזרים עוגנים', a1.ok && a1.notes.length === 1);
check('הסכום הוא "נטו לחיוב" המודפס', a1.notes[0].amount === okDoc.subtotalExVat, String(a1.notes[0].amount));
check('היחידות והשורות מהמודפס', a1.notes[0].units === 71 && a1.notes[0].lines === 5, JSON.stringify(a1.notes[0]));
check('סוג התעודה — חיוב', a1.notes[0].kind === 'charge');

section('[2] כמות שנקראה שגוי — השער נסגר');
const badQty = doc(CLEAN);
badQty.rows = CLEAN.map((r, i) => i === 0 ? row(r.description, 20, 5.7408) : r); // 30 נקרא כ-20
const c2 = bermanPaperAnchorCheck(badQty);
check('בדיקת היחידות נכשלת', c2.units === false);
check('גם בדיקת הכסף נכשלת', c2.money === false);
check('השער סגור', !c2.ok && !bermanPaperAnchorsFromScan(scan([badQty])).ok);
check('הסיבה מנוסחת ומוחזרת', bermanPaperAnchorsFromScan(scan([badQty])).problems.length >= 2);

section('[3] שורה שפוספסה לגמרי');
const missingRow = doc(CLEAN);
missingRow.rows = CLEAN.slice(0, 4); // בלוק הסיכום עדיין מכריז על 5 שורות
const c3 = bermanPaperAnchorCheck(missingRow);
check('בדיקת השורות נכשלת', c3.lines === false);
check('השער סגור', !c3.ok);

section('[4] סיבולת העיגול של הספק');
// v79: כששני העוגנים המדויקים סגורים, הסיבולת היא זו של README 6ב — 30 אג׳
// לתעודה. סיבולת הבסיס (2 אג׳ לשורה, 3 עד 25) נשארת בתוקף בלעדיהם.
function withGap(rows, agorot) {
  const d = doc(rows);
  d.subtotalExVat = Math.round((d.subtotalExVat + agorot / 100) * 100) / 100;
  return d;
}
check('9 אגורות עוברות', bermanPaperAnchorCheck(withGap(CLEAN, 9)).money === true);
check('30 אגורות עוברות — שני העוגנים המדויקים סגורים', bermanPaperAnchorCheck(withGap(CLEAN, 30)).money === true);
check('31 אגורות נדחות — הסיבולת אינה נמתחת', bermanPaperAnchorCheck(withGap(CLEAN, 31)).money === false);
check('60 אגורות נדחות', bermanPaperAnchorCheck(withGap(CLEAN, 60)).money === false);
check('פער בכיוון ההפוך נמדד באותה סיבולת', bermanPaperAnchorCheck(withGap(CLEAN, -30)).money === true && bermanPaperAnchorCheck(withGap(CLEAN, -31)).money === false);

// התלונה שהולידה את v79: 10 שורות, היחידות והשורות סגורות, 21 אג׳ עיגול.
// סיבולת הבסיס נתנה 20 אג׳ בלבד, וקליטה שלמה נחסמה על אגורה אחת.
const TEN = CLEAN.concat([row('שמיניה שומשום', 12, 3.11), row('חלומית ארוזה', 8, 2.9),
  row('בריוש 10', 5, 20.4), row('פיתות כוסמין', 9, 4.2), row('לחמניה רכה', 11, 3.05)]);
const twentyOne = bermanPaperAnchorCheck(withGap(TEN, 21));
check('21 אג׳ על 10 שורות אינן חוסמות עוד', twentyOne.money === true && twentyOne.ok, JSON.stringify({ gap: twentyOne.gapCents, tol: twentyOne.tolCents }));
check('הפער נשמר לתצוגה ואינו נבלע בשקט', twentyOne.roundingGapCents === 21, String(twentyOne.roundingGapCents));

// בלי עוגן יחידות סגור אין עד שני, והסיבולת חוזרת לבסיס — 2 אג׳ לשורה.
const noUnitAnchor = withGap(CLEAN, 21);
noUnitAnchor.printedUnits = 70; // נקרא 71
const c4 = bermanPaperAnchorCheck(noUnitAnchor);
check('עוגן יחידות פתוח מחזיר את סיבולת הבסיס', c4.money === false && c4.tolCents === 10, JSON.stringify({ tol: c4.tolCents }));
const noLineAnchor = withGap(CLEAN, 21);
noLineAnchor.printedLines = 6; // נקראו 5
check('עוגן שורות פתוח מחזיר את סיבולת הבסיס', bermanPaperAnchorCheck(noLineAnchor).money === false);
const noAnchorsAtAll = withGap(CLEAN, 21);
noAnchorsAtAll.printedUnits = null; noAnchorsAtAll.printedLines = null;
check('עוגן שלא נקרא אינו מרחיב את הסיבולת', bermanPaperAnchorCheck(noAnchorsAtAll).money === false);

// הפער אומר את עצמו ומפנה לסיבה האמיתית, ולא ל"צלם שוב".
const overTol = bermanPaperAnchorsFromScan(scan([withGap(CLEAN, 60)]));
check('ההודעה נוקבת בפער באגורות', overTol.problems.some(p => p.includes('60 אג׳')), JSON.stringify(overTol.problems));
check('ההודעה מפנה לאחוז ההנחה', overTol.problems.some(p => p.includes('אחוז הנחה')), JSON.stringify(overTol.problems));
check('ההודעה נוקבת בסיבולת שנחרגה', overTol.problems.some(p => p.includes('30 אג׳')), JSON.stringify(overTol.problems));

// 25 אג׳ (25 שורות ומעלה) נשארות התקרה של סיבולת הבסיס, ולא יותר.
const MANY = Array.from({ length: 25 }, (unused, i) => row('פריט ' + i, 2, 3 + i / 100));
const manyOpen = withGap(MANY, 26);
manyOpen.printedUnits = 49; // עוגן היחידות פתוח
check('תקרת סיבולת הבסיס נשארת 25 אג׳', bermanPaperAnchorCheck(manyOpen).tolCents === 25 && bermanPaperAnchorCheck(manyOpen).money === false);

section('[5] בלוק סיכום שלא נקרא במלואו');
const noUnits = doc(CLEAN, { printedUnits: null });
const c5 = bermanPaperAnchorCheck(noUnits);
check('שדה חסר אינו "עבר"', c5.units === null && !c5.ok);
check('נאמר במפורש מה לא נקרא', c5.missing.length === 1 && c5.missing[0].includes('סה״כ כללי'), JSON.stringify(c5.missing));
check('אין נפילה שקטה לעוגנים', bermanPaperAnchorsFromScan(scan([noUnits])).notes.length === 0);

section('[6] תעודת זיכוי');
const credit = doc(CLEAN.slice(0, 2), { docType: 'credit' });
check('הסוג נקרא מהכותרת', bermanPaperAnchorsFromScan(scan([credit])).notes[0].kind === 'credit');

section('[7] שורת פיקדון אינה נספרת ביחידות');
const withDeposit = doc(CLEAN.concat([row('פיקדון ארגז', 4, 5)]));
withDeposit.printedUnits = 71; // הנייר סופר יחידות בלי פיקדון
const c7 = bermanPaperAnchorCheck(withDeposit);
check('היחידות נסגרות למרות שורת הפיקדון', c7.units === true, 'printed=71');
check('השורות כן נספרות (6)', c7.lines === true && withDeposit.printedLines === 6);

section('[8] מקבץ תעודות — מספיק שאחת לא נסגרת');
const mixed = bermanPaperAnchorsFromScan(scan([doc(CLEAN), missingRow]));
check('השער סגור לכל המקבץ', !mixed.ok && mixed.notes.length === 0);
check('הבעיה מיוחסת לתעודה הנכונה', mixed.problems.some(p => p.startsWith('תעודה 2')), JSON.stringify(mixed.problems));

section('[9] סריקה ריקה');
const empty = bermanPaperAnchorsFromScan({ scan: { documents: [] } });
check('לא ok, ולא קורס', empty.ok === false && empty.problems.length === 1);

console.log('\n' + (fail ? '✗ ' + fail + ' נכשלו' : '✓ הכל עבר') + ' (' + pass + '/' + (pass + fail) + ')');
process.exit(fail ? 1 : 0);

