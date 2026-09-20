// v62 — שער האמון של זרימת הצילום-תחילה.
// כשהעוגנים אינם מוקלדים, מה שמאשר שה-AI קרא נכון הוא בלוק הסיכום שבתחתית
// הנייר, שמודפס בנפרד מהשורות. הבדיקות כאן בונות תשובות סריקה סינתטיות —
// גיבוי אמיתי אינו שומר את גוף התשובה — ומוודאות שהשער נפתח רק כששלוש
// הבדיקות עוברות, ושהוא אומר במדויק מה לא נסגר כשהוא נסגר.
//
// הרצה: node tests/paper-anchors.test.mjs
import { extractSource } from './extract.mjs';

const FNS = ['r2', 'fmtMoney', 'aiMoneyCents', 'aiDocRowUnits', 'bermanFullListMatch', 'bermanPaperAnchorCheck',
  'bermanSeparateDocumentsCheck', 'bermanSeparateDocumentsProblem', 'bermanPaperAnchorsFromScan', 'bermanPaperScanNotes'];
const CONSTS = ['const RECEIPT_ROUNDING_TOLERANCE_CENTS = 30;'];
// eslint-disable-next-line no-eval
const api = eval(extractSource(FNS, CONSTS) + '\n({ ' + FNS.join(', ') + ' })');
const { bermanPaperAnchorCheck, bermanPaperAnchorsFromScan, bermanSeparateDocumentsCheck, bermanPaperScanNotes } = api;

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

// v100: שתי תעודות שצולמו ככרטיס אחד. המקרה מ-20.9.2026: תעודה 244685560
// (8 שורות · 63 יח׳ · ₪388.11) ותעודה 290094585 (שורה אחת · 8 יח׳ · ₪39.30)
// כשני עמודים של כרטיס אחד — השרת החזיר 9 שורות מול הסיכום של העמוד הראשון.
section('[10] שתי תעודות בכרטיס אחד');
function onPage(rows, page) { return rows.map(r => Object.assign({ sourcePage: page }, r)); }
const SECOND = [row('ברמן אסלי 5 פיתות', 8, 4.9131)]; // 39.30 — התעודה השנייה
const merged = doc(onPage(CLEAN, 1).concat(onPage(SECOND, 2)), { invoiceNumber: '244685560', pageCount: 2 });
const firstOnly = doc(CLEAN); // בלוק הסיכום של העמוד הראשון בלבד
merged.subtotalExVat = firstOnly.subtotalExVat; merged.printedUnits = firstOnly.printedUnits; merged.printedLines = firstOnly.printedLines;
const c10 = bermanPaperAnchorCheck(merged);
check('התעודה הממוזגת נכשלת בשלושת העוגנים', !c10.ok && c10.money === false && c10.units === false && c10.lines === false);
const split10 = bermanSeparateDocumentsCheck(merged, c10);
check('העמוד הראשון נסגר לבדו — הזיהוי מבני, בלי אזהרה מהמודל', !!split10 && split10.closedPages === 1 && split10.firstExtraPage === 2, JSON.stringify(split10));
check('השורות העודפות נספרות', split10 && split10.extraRows === 1 && split10.extraUnits === 8);
const g10 = bermanPaperAnchorsFromScan(scan([merged]));
check('השער סגור ובלי עוגנים', !g10.ok && g10.notes.length === 0);
check('הודעה אחת במקום שלושה פערים', g10.problems.length === 1, JSON.stringify(g10.problems));
check('ההודעה אומרת מה קרה', /יותר מתעודה אחת/.test(g10.problems[0]) && /244685560/.test(g10.problems[0]) && /מעמוד 2/.test(g10.problems[0]) && /שורה אחת · 8 יח׳/.test(g10.problems[0]), g10.problems[0]);
check('ההודעה אומרת מה לעשות', /כרטיס משלה/.test(g10.problems[0]));
check('ההודעה אינה מפנה לאחוז ההנחה', !/אחוז הנחה/.test(g10.problems[0]));
check('הצילום הבא נפתח בשני כרטיסים', g10.documentCount === 2, String(g10.documentCount));
check('מפוצל לשני כרטיסים — שתי התעודות עוברות', bermanPaperAnchorsFromScan(scan([doc(CLEAN), doc(SECOND)])).ok);

// עיגול של הספק בעמוד הראשון אינו מסתיר את הפיצול: 22 אג׳ בתוך הסיבולת של 30.
const mergedGap = doc(onPage(CLEAN, 1).concat(onPage(SECOND, 2)));
mergedGap.subtotalExVat = withGap(CLEAN, 22).subtotalExVat; mergedGap.printedUnits = firstOnly.printedUnits; mergedGap.printedLines = firstOnly.printedLines;
check('הפיצול מזוהה גם עם פער עיגול בעמוד הראשון', !!bermanSeparateDocumentsCheck(mergedGap, bermanPaperAnchorCheck(mergedGap)));

// תעודה אמיתית של שני עמודים: בלוק הסיכום מכסה את שניהם — אין פיצול.
const twoPages = doc(onPage(CLEAN.slice(0, 3), 1).concat(onPage(CLEAN.slice(3), 2)), { pageCount: 2 });
check('תעודה של שני עמודים שנסגרת אינה מפוצלת', bermanPaperAnchorCheck(twoPages).ok && bermanSeparateDocumentsCheck(twoPages, bermanPaperAnchorCheck(twoPages)) === null);
check('והשער פתוח לה כרגיל', bermanPaperAnchorsFromScan(scan([twoPages])).ok);

// שורה שפוספסה בעמוד הראשון של תעודה דו-עמודית: העמוד הראשון אינו נסגר לבדו,
// ולכן ההודעות הישנות (מה לא נסגר) נשארות — לא ממציאים פיצול.
const twoPagesMissing = doc(onPage(CLEAN.slice(0, 3), 1).concat(onPage(CLEAN.slice(3), 2)), { pageCount: 2 });
twoPagesMissing.rows = twoPagesMissing.rows.slice(1);
const g10b = bermanPaperAnchorsFromScan(scan([twoPagesMissing]));
check('בלי עמוד שנסגר לבדו אין פיצול', bermanSeparateDocumentsCheck(twoPagesMissing, bermanPaperAnchorCheck(twoPagesMissing)) === null);
check('וההודעות המספריות נשארות', !g10b.ok && g10b.problems.some(p => p.includes('סה״כ שורות')) && g10b.problems.every(p => !p.includes('יותר מתעודה אחת')), JSON.stringify(g10b.problems));

// שורות בלי sourcePage (תשובה ישנה) — עמוד אחד, אין מה לפצל.
const legacy = doc(CLEAN.concat(SECOND));
legacy.subtotalExVat = firstOnly.subtotalExVat; legacy.printedUnits = firstOnly.printedUnits; legacy.printedLines = firstOnly.printedLines;
check('בלי מספרי עמודים ההתנהגות הישנה נשמרת', bermanSeparateDocumentsCheck(legacy, bermanPaperAnchorCheck(legacy)) === null && bermanPaperAnchorsFromScan(scan([legacy])).problems.length === 3);

// SERVICE_VERSION 6: השרת מדווח separateDocuments במבנה. גם כשהעמוד הראשון
// אינו נסגר לבדו (60 אג׳ — אחוז הנחה שהתיישן בנוסף לפיצול) ההסבר הראשון הוא הפיצול.
const reported = doc(onPage(CLEAN, 1).concat(onPage(SECOND, 2)), { invoiceNumber: '244685560', pageCount: 2,
  separateDocuments: [{ sourcePage: 2, docNumber: '290094585' }] });
reported.subtotalExVat = withGap(CLEAN, 60).subtotalExVat; reported.printedUnits = firstOnly.printedUnits; reported.printedLines = firstOnly.printedLines;
const g10c = bermanPaperAnchorsFromScan(scan([reported]));
check('דיווח השרת מכריע גם בלי סגירה מבנית', !g10c.ok && g10c.problems.length === 1 && /290094585/.test(g10c.problems[0]) && /מעמוד 2/.test(g10c.problems[0]), JSON.stringify(g10c.problems));
check('הודעת השרת אינה טוענת שהעמוד הראשון נסגר', !/נסגרת לבדה/.test(g10c.problems[0]));
// תעודה שדווחה כמפוצלת לעולם אינה מאומצת בשקט — גם אם המודל השמיט את השורות של העמוד השני.
const reportedButClosing = doc(onPage(CLEAN, 1), { pageCount: 2, separateDocuments: [{ sourcePage: 2, docNumber: '290094585' }] });
const g10d = bermanPaperAnchorsFromScan(scan([reportedButClosing]));
check('תעודה שדווחה כמפוצלת אינה מאומצת בשקט', bermanPaperAnchorCheck(reportedButClosing).ok && !g10d.ok && g10d.notes.length === 0 && /290094585/.test(g10d.problems[0]), JSON.stringify(g10d.problems));
check('ומבקשת שני כרטיסים', g10d.documentCount === 2);
check('דיווח ריק אינו פיצול', bermanPaperAnchorsFromScan(scan([doc(CLEAN, { separateDocuments: [] })])).ok);

// במקבץ: הפיצול מיוחס לתעודה הנכונה, וכרטיס לכל תעודה שנמצאה.
const bundle = bermanPaperAnchorsFromScan(scan([doc(CLEAN), merged]));
check('במקבץ הפיצול מיוחס לתעודה הנכונה', !bundle.ok && bundle.problems.length === 1 && bundle.problems[0].startsWith('תעודה 2: '), JSON.stringify(bundle.problems));
check('ומספר הכרטיסים כולל את התעודה שהתגלתה', bundle.documentCount === 3);

// דיווח באותה משמעות של השרת: עמוד 1 אינו תעודה נוספת, כל עמוד פעם אחת,
// ומספר התעודה עצמה הוא צילום נוסף של אותו נייר — לא תעודה אחרת.
check('דיווח על עמוד 1 אינו פיצול', bermanPaperAnchorsFromScan(scan([doc(CLEAN, { separateDocuments: [{ sourcePage: 1, docNumber: '1' }] })])).ok);
check('דיווח שנושא את מספר התעודה עצמה אינו פיצול', bermanPaperAnchorsFromScan(scan([doc(CLEAN, { invoiceNumber: '244685560', pageCount: 2, separateDocuments: [{ sourcePage: 2, docNumber: '244685560' }] })])).ok);
const dupReport = doc(onPage(CLEAN, 1), { pageCount: 2, separateDocuments: [{ sourcePage: 2, docNumber: '1' }, { sourcePage: 2, docNumber: '2' }] });
const dupSplit = bermanSeparateDocumentsCheck(dupReport, bermanPaperAnchorCheck(dupReport));
check('עמוד שדווח פעמיים נספר פעם אחת', !!dupSplit && dupSplit.documentCount === 2, JSON.stringify(dupSplit));
// דיווח שהמבנה סותר: כל השורות, כולל אלה שבעמוד המדווח, סוגרות יחד את הסיכום.
const contradicted = doc(onPage(CLEAN.slice(0, 3), 1).concat(onPage(CLEAN.slice(3), 2)), { pageCount: 2, separateDocuments: [{ sourcePage: 2, docNumber: null }] });
check('דיווח שהשורות סותרות אינו פיצול — התעודה עוברת', bermanPaperAnchorsFromScan(scan([contradicted])).ok);
check('דיווח בלי שורות בעמוד הנוסף — נאמר שהן לא נקראו, בלי "0 שורות"', /לא נקראו כלל/.test(g10d.problems[0]) && !/0 שורות/.test(g10d.problems[0]), g10d.problems[0]);

// אחוז הנחה חסר בעמוד הראשון: הכסף אינו ניתן לחישוב, אבל שני העוגנים
// המדויקים עדיין מוכיחים את הפיצול — וההנחה החסרה נשארת משימה גלויה.
const noDiscount = doc(onPage(CLEAN, 1).concat(onPage(SECOND, 2)), { invoiceNumber: '244685560', pageCount: 2 });
noDiscount.subtotalExVat = firstOnly.subtotalExVat; noDiscount.printedUnits = firstOnly.printedUnits; noDiscount.printedLines = firstOnly.printedLines;
noDiscount.rows[0] = Object.assign({}, noDiscount.rows[0], { __bermanDiscountMissing: true });
const g10e = bermanPaperAnchorsFromScan(scan([noDiscount]));
check('אחוז הנחה חסר אינו מסתיר את הפיצול', !g10e.ok && g10e.problems.some(p => p.includes('יותר מתעודה אחת')) && g10e.documentCount === 2, JSON.stringify(g10e.problems));
check('וההנחה החסרה נשארת משימה', g10e.problems.length === 2 && g10e.problems.some(p => p.includes('אחוז הנחה למוצר')), JSON.stringify(g10e.problems));

// העמוד הראשון לא נסגר לבדו (60 אג׳ מעל הסיבולת) ואין דיווח: ההודעות
// המספריות נשארות — בלי ההפניה לאחוז ההנחה, כי היחידות והשורות כבר מסבירות
// את פער הכסף — ועם רמז לשתי תעודות בכרטיס אחד.
const imperfect = doc(onPage(CLEAN, 1).concat(onPage(SECOND, 2)), { pageCount: 2 });
imperfect.subtotalExVat = withGap(CLEAN, 60).subtotalExVat; imperfect.printedUnits = firstOnly.printedUnits; imperfect.printedLines = firstOnly.printedLines;
const g10f = bermanPaperAnchorsFromScan(scan([imperfect]));
check('בלי סגירה ובלי דיווח — ההודעות המספריות נשארות', !g10f.ok && g10f.problems.some(p => p.includes('סה״כ שורות')) && !g10f.problems.some(p => p.includes('יותר מתעודה אחת:')), JSON.stringify(g10f.problems));
check('ההפניה לאחוז ההנחה נשמטת כשעוגן מדויק נכשל', !g10f.problems.some(p => p.includes('אחוז הנחה שהתיישן')), JSON.stringify(g10f.problems));
check('ורמז לשתי תעודות בכרטיס אחד נאמר כאפשרות', g10f.problems.some(p => p.includes('ייתכן שהצילומים מכילים יותר מתעודה אחת')));
check('פער כסף לבדו עדיין מפנה לאחוז ההנחה', bermanPaperAnchorsFromScan(scan([withGap(CLEAN, 60)])).problems.some(p => p.includes('אחוז הנחה שהתיישן')));
check('כמות שנקראה שגוי בעמוד יחיד — בלי רמז לשתי תעודות', !bermanPaperAnchorsFromScan(scan([badQty])).problems.some(p => p.includes('ייתכן שהצילומים')));

// עמודים נוספים בלי דיווח: לא ידוע אם הם תעודה אחת או יותר — "אחת לפחות".
const three = doc(onPage(CLEAN, 1).concat(onPage(SECOND, 2)).concat(onPage([row('חלה קלועה', 3, 4.6276)], 3)), { pageCount: 3 });
three.subtotalExVat = firstOnly.subtotalExVat; three.printedUnits = firstOnly.printedUnits; three.printedLines = firstOnly.printedLines;
check('עמודים נוספים בלי דיווח — "תעודה אחרת אחת לפחות"', /תעודה אחרת אחת לפחות/.test(bermanPaperAnchorsFromScan(scan([three])).problems[0]), bermanPaperAnchorsFromScan(scan([three])).problems[0]);

// הערות המודל מגיעות למסך הקליטה: אלה שעל התעודה ואלה שעל כל הסריקה.
const notes = bermanPaperScanNotes({ scan: { warnings: ['קבוצת התמונות מכילה בפועל שתי תעודות מודפסות נפרדות.'],
  documents: [Object.assign({}, merged, { warnings: ['עמוד 2 אינו המשך של התעודה שבעמוד 1 (290094585).'] })] } });
check('הערות התעודה והסריקה נאספות יחד', notes.length === 2 && notes[0].includes('290094585') && notes[1].includes('שתי תעודות'), JSON.stringify(notes));
check('סריקה ריקה — בלי הערות ובלי קריסה', bermanPaperScanNotes(null).length === 0);
// "לא ניתן לאמת את הקריאה: סך יחידות" של השרת היא אותו ממצא, לא ספק בקריאה.
const serverDoubt = 'לא ניתן לאמת את הקריאה: סך יחידות. בדוק את המספר המודפס.';
check('ספק השרת בעוגנים נשמט כשהפיצול מסביר אותו', !bermanPaperScanNotes({ scan: { warnings: [serverDoubt], documents: [merged] } }).includes(serverDoubt));
check('ובלי פיצול הוא מוצג', bermanPaperScanNotes({ scan: { warnings: [serverDoubt], documents: [badQty] } }).includes(serverDoubt));

console.log('\n' + (fail ? '✗ ' + fail + ' נכשלו' : '✓ הכל עבר') + ' (' + pass + '/' + (pass + fail) + ')');
process.exit(fail ? 1 : 0);

