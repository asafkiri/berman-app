// v62 → v122 — שער האמון של זרימת הצילום-תחילה.
// כשהעוגנים אינם מוקלדים, מה שמאשר שה-AI קרא נכון הוא בלוק הסיכום שבתחתית
// הנייר, שמודפס בנפרד מהשורות. מ-v122 השער הוא כמויות בלבד: סכום הכמויות
// של השורות מול "סה״כ כללי", ומספר השורות מול "סה״כ שורות". "נטו לחיוב"
// נקרא לזיהוי בלבד ואינו שער — הוא הסכום של המסופון, לא של החשבונית.
// הבדיקות בונות תשובות סריקה סינתטיות ומוודאות שהשער נפתח רק כששתי הבדיקות
// עוברות, שהוא אומר במדויק מה לא נסגר, ושהכסף לעולם אינו סוגר אותו.
//
// הרצה: node tests/paper-anchors.test.mjs
import { extractSource } from './extract.mjs';

const FNS = ['r2', 'aiMoneyCents', 'aiDocRowUnits', 'bermanPaperAnchorCheck', 'bermanPaperAnchorsFromScan'];
// eslint-disable-next-line no-eval
const api = eval(extractSource(FNS, []) + '\n({ ' + FNS.join(', ') + ' })');
const { bermanPaperAnchorCheck, bermanPaperAnchorsFromScan } = api;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  — ' + detail : '')); }
}
function section(t) { console.log('\n' + t); }

// תעודה כפי שהיא חוזרת מהשרת אחרי bermanAdaptScanPayload (המחיר המודפס נשאר על השורה כעדות זהות בלבד)
function row(description, quantity, unitPrice) {
  return { description, quantity, unitPriceExVat: unitPrice };
}
function doc(rows, overrides) {
  const units = rows.reduce((a, r) => a + (/פ.?קדון/.test(r.description) ? 0 : r.quantity), 0);
  return Object.assign({
    rows, subtotalExVat: 691.13, printedUnits: units, printedLines: rows.length, docType: 'delivery'
  }, overrides || {});
}
const scan = docs => ({ scan: { documents: docs } });

const CLEAN = [row('אחיד פרוס ברמן', 30, 8.2), row('לחמניות 10 בשקית', 13, 20.46),
  row('ברמן אקטיב', 7, 17.21), row('זוג לחמניות אצבע', 15, 3.09), row('פיתות פרימיום 10', 6, 13.79)];

section('[1] תעודה שנקראה נכון — השער נפתח');
const okDoc = doc(CLEAN);
const c1 = bermanPaperAnchorCheck(okDoc);
check('שתי הבדיקות עוברות', c1.ok && c1.units === true && c1.lines === true, JSON.stringify({ u: c1.units, l: c1.lines }));
check('אין בדיקת כסף', !('money' in c1) && !('gapCents' in c1) && !('tolCents' in c1), JSON.stringify(Object.keys(c1)));
const a1 = bermanPaperAnchorsFromScan(scan([okDoc]));
check('מוחזרים עוגנים', a1.ok && a1.notes.length === 1);
check('היחידות והשורות מהמודפס', a1.notes[0].units === 71 && a1.notes[0].lines === 5, JSON.stringify(a1.notes[0]));
check('"נטו לחיוב" המודפס עובר לזיהוי בלבד', a1.notes[0].amount === 691.13, String(a1.notes[0].amount));
check('סוג התעודה — חיוב', a1.notes[0].kind === 'charge');

section('[2] כמות שנקראה שגוי — השער נסגר');
const badQty = doc(CLEAN);
badQty.rows = CLEAN.map((r, i) => i === 0 ? row(r.description, 20, 8.2) : r); // 30 נקרא כ-20
const c2 = bermanPaperAnchorCheck(badQty);
check('בדיקת היחידות נכשלת', c2.units === false);
check('השער סגור', !c2.ok && !bermanPaperAnchorsFromScan(scan([badQty])).ok);
const p2 = bermanPaperAnchorsFromScan(scan([badQty])).problems;
check('הסיבה מנוסחת, נוקבת ב"סה״כ כללי" ובמספרים', p2.length === 1 && p2[0].includes('סה״כ כללי') && p2[0].includes('61') && p2[0].includes('71'), JSON.stringify(p2));

section('[3] שורה שפוספסה לגמרי');
const missingRow = doc(CLEAN);
missingRow.rows = CLEAN.slice(0, 4); // בלוק הסיכום עדיין מכריז על 5 שורות
const c3 = bermanPaperAnchorCheck(missingRow);
check('בדיקת השורות נכשלת', c3.lines === false);
check('היחידות נכשלות גם הן (השורה נשאה 6 יחידות)', c3.units === false);
check('השער סגור', !c3.ok);
check('שתי הסיבות מוחזרות', bermanPaperAnchorsFromScan(scan([missingRow])).problems.length === 2);

section('[4] הכסף אינו שער — v122');
const offBy60 = doc(CLEAN, { subtotalExVat: 691.73 });
check('60 אגורות מעל סכום השורות אינן חוסמות', bermanPaperAnchorCheck(offBy60).ok === true);
const offBy100 = doc(CLEAN, { subtotalExVat: 791.13 });
check('גם ₪100 אינם חוסמים — הסכום של המסופון אינו מה שמשלמים', bermanPaperAnchorCheck(offBy100).ok === true);
check('הסכום המודפס עובר כמו שהוא, לזיהוי', bermanPaperAnchorsFromScan(scan([offBy100])).notes[0].amount === 791.13);
const noAmount = doc(CLEAN, { subtotalExVat: null });
const c4 = bermanPaperAnchorCheck(noAmount);
check('"נטו לחיוב" שלא נקרא אינו חסר ואינו חוסם', c4.ok === true && c4.missing.length === 0 && c4.amount === null, JSON.stringify(c4.missing));
check('העוגנים מאומצים גם בלי סכום', bermanPaperAnchorsFromScan(scan([noAmount])).ok === true);
const wrongPrices = doc(CLEAN.map(r => row(r.description, r.quantity, 999)));
check('מחיר מודפס שגוי בכל שורה אינו משנה דבר', bermanPaperAnchorCheck(wrongPrices).ok === true);

section('[5] בלוק סיכום שלא נקרא במלואו');
const noUnits = doc(CLEAN, { printedUnits: null });
const c5 = bermanPaperAnchorCheck(noUnits);
check('שדה חסר אינו "עבר"', c5.units === null && !c5.ok);
check('נאמר במפורש מה לא נקרא', c5.missing.length === 1 && c5.missing[0].includes('סה״כ כללי'), JSON.stringify(c5.missing));
check('אין נפילה שקטה לעוגנים', bermanPaperAnchorsFromScan(scan([noUnits])).notes.length === 0);
const noLines = doc(CLEAN, { printedLines: null });
const c5b = bermanPaperAnchorCheck(noLines);
check('גם "סה״כ שורות" חובה', c5b.lines === null && !c5b.ok && c5b.missing[0].includes('סה״כ שורות'), JSON.stringify(c5b.missing));

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
