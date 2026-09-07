// v62 — שער האמון של זרימת הצילום-תחילה.
// כשהעוגנים אינם מוקלדים, מה שמאשר שה-AI קרא נכון הוא בלוק הסיכום שבתחתית
// הנייר, שמודפס בנפרד מהשורות. הבדיקות כאן בונות תשובות סריקה סינתטיות —
// גיבוי אמיתי אינו שומר את גוף התשובה — ומוודאות שהשער נפתח רק כששלוש
// הבדיקות עוברות, ושהוא אומר במדויק מה לא נסגר כשהוא נסגר.
//
// הרצה: node tests/paper-anchors.test.mjs
import { extractSource } from './extract.mjs';

const FNS = ['r2', 'fmtMoney', 'aiMoneyCents', 'aiDocRowUnits', 'bermanFullListMatch', 'bermanPaperAnchorCheck', 'bermanPaperAnchorsFromScan'];
// eslint-disable-next-line no-eval
const api = eval(extractSource(FNS, []) + '\n({ ' + FNS.join(', ') + ' })');
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
const rounded = doc(CLEAN);
rounded.subtotalExVat = Math.round((rounded.subtotalExVat + 0.09) * 100) / 100; // 9 אג׳ — בתוך הסיבולת
check('9 אגורות עוברות (5 שורות → סיבולת 10 אג׳)', bermanPaperAnchorCheck(rounded).money === true);
const wayOff = doc(CLEAN);
wayOff.subtotalExVat = Math.round((wayOff.subtotalExVat + 0.6) * 100) / 100;
check('60 אגורות נדחות', bermanPaperAnchorCheck(wayOff).money === false);

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

