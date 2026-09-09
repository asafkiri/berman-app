// v78 — החזרת פריטים מתעודת חזרות פתוחה לרשימת החזרות הפתוחה.
// המקרה: החזרנו 4 יח׳ ברמן אסלי 5 פיתות, הספק זיכה רק 1, והבטיח להשלים
// בהחזרה הבאה. עד היום התעודה נשארה אדומה לנצח ("הספק חייב לך") ואיש לא
// זכר לתבוע שוב את שלוש היחידות. עכשיו הן חוזרות לרשימת החזרות הפתוחה,
// נשלחות בתעודה הבאה, והתעודה המקורית נסגרת בלי שהכסף ייספר פעמיים.
//
// הבדיקות רצות על הפונקציות האמיתיות מ-index.html (ראה extract.mjs).
//
// הרצה:            node tests/returns-carry.test.mjs
// מול גיבוי אמיתי: node tests/returns-carry.test.mjs --backup ~/bermanbackup.json
// (התעודות בתרחיש נבנות כאן בכל מקרה — מהגיבוי מגיעים רק מחירי הקטלוג.)
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
const byCode = c => productList.find(p => String(p.code) === String(c));

// ===== המצב הגלובלי שהפונקציות הנשלפות נשענות עליו =====
// htmlEscape נכתב כאן ולא נשלף: הוא בנוי סביב ליטרל רגולרי שמכיל גם גרש וגם
// מרכאות, ושולף הפונקציות (extract.mjs) סופר מחרוזות ולא מבין ליטרל כזה.
let products = productList, returns = [], VAT = 0.18;
const htmlEscape = v => String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));

const FNS = ['r2', 'lineTotalFromUnit', 'dDisp', 'fmtMoney', 'vatRateForDoc',
  'amountIncForDoc', 'returnTotals', 'creditAllocationList', 'creditAllocatedEx',
  'returnsCreditForReturns', 'returnsBalance',
  'returnCarriedNotes', 'retCarryKey', 'consumeReturnCarriedNotes', 'returnsDiscrepancyInfo',
  'returnCarriedVal', 'retCarryDocLabel', 'retCarryPlan', 'retCarrySideText',
  'retCarryBoxHtml', 'retCarryBtnHtml', 'buildReturnRow', 'anIsCarriedLine', 'anIsDepositLine'];
// eslint-disable-next-line no-eval
const api = eval(extractSource(FNS, []) + '\n({ ' + FNS.join(', ') + ' })');
const { r2, returnsDiscrepancyInfo, returnsBalance, returnCarriedVal, retCarryPlan, retCarrySideText,
  retCarryBoxHtml, retCarryBtnHtml, buildReturnRow, anIsCarriedLine, anIsDepositLine,
  consumeReturnCarriedNotes, returnCarriedNotes, retCarryKey } = api;

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } };
const near = (a, b, eps = 0.011) => Math.abs(Number(a) - Number(b)) <= eps;
const head = t => console.log('\n' + t);

// ===== התפאורה: החזרה של 8.9 — 4 פיתות ו-1 לחם, זוכו רק 1 פיתה =====
const PITA = byCode('401');   // פיתות כוסמין 10 בשקית
const LOAF = byCode('101');   // אחיד פרוס ברמן
const pitaUnit = r2(Number(PITA.price) || 0);
const loafUnit = r2(Number(LOAF.price) || 0);

// תעודה: 4 פיתות + 1 לחם. הספק זיכה 1 פיתה + 1 לחם.
function baseDoc(extra) {
  const items = [
    { name: PITA.name, barcode: PITA.barcode || 'bc-pita', productId: PITA.id, qty: 4, noteQty: 1, unitPrice: pitaUnit, lineTotal: r2(pitaUnit * 4) },
    { name: LOAF.name, barcode: LOAF.barcode || 'bc-loaf', productId: LOAF.id, qty: 1, noteQty: 1, unitPrice: loafUnit, lineTotal: loafUnit }
  ];
  const ex = r2(items.reduce((a, l) => a + l.lineTotal, 0));
  return Object.assign({
    id: 'ret_8_9', timestamp: Date.UTC(2026, 8, 8, 7, 0), date: '2026-09-08', docDate: '2026-09-08',
    items, totalExVat: ex, totalIncVat: r2(ex * 1.18), vatPct: 18,
    credited: true, creditedAt: Date.UTC(2026, 8, 9, 7, 0), creditStatus: 'open',
    creditNoteTotal: r2(pitaUnit * 1 + loafUnit)
  }, extra || {});
}
const shortEx = r2(pitaUnit * 3); // שלוש הפיתות שלא זוכו

head('[1] הפער לפני ההחזרה — התעודה אדומה והספק חייב');
{
  const r = baseDoc();
  returns = [r];
  const di = returnsDiscrepancyInfo(r);
  ok('התעודה פתוחה', di.open === true);
  ok('שורה אחת חסרה', di.shortItems.length === 1);
  ok('שלוש יחידות', di.shortItems[0].n === 3);
  ok('הברקוד נשמר לשורה — לפיו נצרך הרישום', di.shortItems[0].barcode === (PITA.barcode || 'bc-pita'));
  ok('מחיר הזיכוי נשמר לשורה', near(di.shortItems[0].price, pitaUnit));
  ok('ערך החוסר', near(di.shortVal, shortEx));
  ok('אין עדיין מה שהועבר', di.carried.length === 0 && di.carriedVal === 0);
  ok('הספק חייב את ערך החוסר', near(di.owed, shortEx));
  ok('גם המאזן הכולל אומר את זה', near(returnsBalance().bal, shortEx));
}

head('[2] התוכנית — בדיוק אותן שורות, במחיר הזיכוי המקורי');
{
  const r = baseDoc();
  returns = [r];
  const plan = retCarryPlan(r);
  ok('יש תוכנית', !!plan);
  ok('שורה אחת', plan.items.length === 1);
  ok('שלוש יחידות פיתה', plan.items[0].qty === 3);
  ok('המחיר הוא מחיר הזיכוי מהתעודה, לא מחיר היום', near(plan.items[0].price, pitaUnit));
  ok('לא שורת סכום', plan.items[0].amountOnly === false);
  ok('שווי התוכנית', near(plan.val, shortEx));
  ok('הטקסט לאישור מזכיר כמות ושם', retCarrySideText(plan.items).indexOf('3 × ') === 0);
}

head('[3] אין מה להחזיר — תעודה שממתינה לאימות, ותעודה שנסגרה בדיוק');
{
  const pending = baseDoc({ credited: false, creditStatus: null, creditNoteTotal: null });
  ok('תעודה שטרם אומתה — אין תוכנית', retCarryPlan(pending) === null);
  const exact = baseDoc();
  exact.items = exact.items.map(l => { const c = { ...l }; delete c.noteQty; return c; });
  exact.creditStatus = 'ok';
  exact.creditNoteTotal = exact.totalExVat;
  ok('תעודה שנסגרה בדיוק — אין תוכנית', retCarryPlan(exact) === null);
  ok('וגם הכפתור לא נפלט', retCarryBtnHtml(exact) === '');
  ok('אבל על תעודה עם פער הכפתור כן נפלט', retCarryBtnHtml(baseDoc()).indexOf('data-role="ret-carry"') > -1);
}

head('[4] אחרי ההחזרה — התעודה נסגרת, והכסף לא נספר בה פעמיים');
{
  const r = baseDoc({ carriedNotes: [{ name: PITA.name, barcode: PITA.barcode || 'bc-pita', qty: 3, price: pitaUnit, amountOnly: false, at: Date.UTC(2026, 8, 9, 8, 0) }] });
  returns = [r];
  const di = returnsDiscrepancyInfo(r);
  ok('אין יותר שורת חוסר פתוחה', di.shortItems.length === 0);
  ok('הרישום נצרך', di.carried.length === 1 && di.carried[0].qty === 3);
  ok('שווי מה שהועבר', near(di.carriedVal, shortEx));
  ok('הספק כבר לא חייב על התעודה', near(di.owed, 0));
  ok('התעודה נסגרה — לא אדומה', di.open === false);
  ok('גם המאזן הכולל התאפס', near(returnsBalance().bal, 0));
  ok('אין תוכנית שנייה על אותו פער', retCarryPlan(r) === null);
  const box = retCarryBoxHtml(r);
  ok('ההערה מספרת לאן הלכו הפריטים', box.indexOf('הוחזר לרשימת החזרות הפתוחה') > -1);
  ok('ואפשר לבטל מתוכה', box.indexOf('data-role="ret-carry-undo"') > -1);
}

head('[5] החזרה חלקית — מה שלא הוחזר נשאר חוב פתוח');
{
  const r = baseDoc({ carriedNotes: [{ name: PITA.name, barcode: PITA.barcode || 'bc-pita', qty: 2, price: pitaUnit, amountOnly: false, at: 1 }] });
  returns = [r];
  const di = returnsDiscrepancyInfo(r);
  ok('נשארה יחידה אחת חסרה', di.shortItems.length === 1 && di.shortItems[0].n === 1);
  ok('שתי יחידות נצרכו', near(di.carriedVal, r2(pitaUnit * 2)));
  ok('החוב שנשאר הוא יחידה אחת', near(di.owed, pitaUnit));
  ok('התעודה עדיין פתוחה', di.open === true);
  ok('ותוכנית ההחזרה הבאה היא על היחידה שנשארה', retCarryPlan(r).items[0].qty === 1);
}

head('[6] רישום שאינו מתאים לשום שורה — לא נצרך ולא מקזז');
{
  const r = baseDoc({ carriedNotes: [{ name: 'מוצר אחר לגמרי', barcode: 'bc-zzz', qty: 3, price: pitaUnit, amountOnly: false, at: 1 }] });
  returns = [r];
  const di = returnsDiscrepancyInfo(r);
  ok('שורת החוסר נשארה שלמה', di.shortItems.length === 1 && di.shortItems[0].n === 3);
  ok('שום דבר לא נספר כהועבר', di.carried.length === 0 && di.carriedVal === 0);
  ok('החוב לא הצטמצם', near(di.owed, shortEx));
  ok('רישום בכמות אפס נזרק', returnCarriedNotes({ carriedNotes: [{ name: 'x', qty: 0 }] }).length === 0);
  ok('המפתח הוא ברקוד+שם', retCarryKey({ barcode: 'b', name: 'n' }) === 'b|n');
}

head('[7] פער כספי בלבד — בלי שורה חסרה, שורת סכום אחת');
{
  // כל השורות זוכו במלואן, אבל הנייר קטן ב-₪12 ממה שהוחזר
  const r = baseDoc();
  r.items = r.items.map(l => { const c = { ...l }; delete c.noteQty; return c; });
  r.creditNoteTotal = r2(r.totalExVat - 12);
  returns = [r];
  const di0 = returnsDiscrepancyInfo(r);
  ok('אין שורות חסרות', di0.shortItems.length === 0 && di0.overItems.length === 0);
  ok('אבל יש חוב של ₪12', near(di0.owed, 12));
  ok('והתעודה פתוחה בגללו', di0.open === true);
  const plan = retCarryPlan(r);
  ok('התוכנית היא שורת סכום אחת', plan.items.length === 1 && plan.items[0].amountOnly === true);
  ok('בסכום הפער', near(plan.items[0].price, 12) && plan.items[0].qty === 1);
  ok('בשם שמצביע על התעודה המקורית', plan.items[0].name.indexOf('השלמת זיכוי') === 0 && plan.items[0].name.indexOf('8.9.2026') > -1);
  ok('הטקסט לאישור מציג סכום', retCarrySideText(plan.items).indexOf('₪') === 0);
  r.carriedNotes = plan.items.map(x => ({ ...x, at: 1 }));
  const di1 = returnsDiscrepancyInfo(r);
  ok('אחרי ההחזרה — אין חוב', near(di1.owed, 0));
  ok('והתעודה נסגרה', di1.open === false);
  ok('שווי ההחזרה ₪12', near(di1.carriedVal, 12));
}

head('[8] v66 — הפער נמדד על החלק ששייך לחזרות, גם עם החזרה');
{
  // ₪25 מהנייר שויכו לחוסר של תעודת קליטה אחרת
  const r = baseDoc();
  r.creditNoteTotal = r2(pitaUnit * 1 + loafUnit + 25);
  r.creditAllocations = [{ id: 'alloc1', amount: 25, receiptId: 'rc_9_9', receiptDate: '2026-09-09', items: [] }];
  returns = [r];
  const di0 = returnsDiscrepancyInfo(r);
  ok('השיוך לא מנפח את הזיכוי לחזרות', near(di0.owed, shortEx));
  r.carriedNotes = [{ name: PITA.name, barcode: PITA.barcode || 'bc-pita', qty: 3, price: pitaUnit, amountOnly: false, at: 1 }];
  const di1 = returnsDiscrepancyInfo(r);
  ok('ואחרי ההחזרה שני הניכויים חיים יחד', near(di1.owed, 0) && di1.open === false);
  ok('המאזן הכולל נקי', near(returnsBalance().bal, 0));
}

head('[9] השורה שחזרה לרשימה — מסומנת, ולא נספרת שוב כסחורה');
{
  const row = buildReturnRow({ productId: 'carry_123', name: PITA.name, barcode: PITA.barcode || 'bc-pita', qty: 3, unitPrice: pitaUnit, manual: true, carried: true, carriedFrom: 'ret_8_9' });
  ok('הסימון "הוחזר מפער זיכוי" מופיע', row.indexOf('הוחזר מפער זיכוי') > -1);
  ok('ולא הסימון הידני הרגיל', row.indexOf('fa-pen"></i> ידני') === -1);
  ok('מחיר הזיכוי הנעול מוצג', row.indexOf('ליח׳ (ללא מע״מ)') > -1);
  const plain = buildReturnRow({ productId: 'p1', name: LOAF.name, barcode: 'bc-loaf', qty: 2 });
  ok('שורה רגילה נשארה עם כפתור הברקוד', plain.indexOf('data-role="edit-barcode"') > -1);
  ok('שורת החזרה נספרת כסחורה? לא', anIsCarriedLine({ carried: true }) === true);
  ok('גם לפי מזהה carry_', anIsCarriedLine({ productId: 'carry_9' }) === true);
  ok('שורה רגילה כן נספרת', anIsCarriedLine({ productId: 'code_401', qty: 3 }) === false);
  ok('ופיקדון ממשיך להיות מסונן בנפרד', anIsDepositLine({ isDeposit: true }) === true && anIsDepositLine({ qty: 1 }) === false);
}

head('[10] החיווט — כל תפקיד שנפלט חייב מטפל');
{
  const src = fs.readFileSync(APP_PATH, 'utf8');
  const emitted = ['ret-carry', 'ret-carry-undo'];
  emitted.forEach(role => {
    ok('נפלט data-role="' + role + '"', src.indexOf('data-role="' + role + '"') > -1);
    ok('ול-' + role + ' יש מטפל בקוד', new RegExp("role === '" + role + "'").test(src));
  });
  ok('הכפתור יושב על כרטיס התעודה בשני המסכים', (src.match(/retCarryBtnHtml\(r\)/g) || []).length >= 2);
  ok('גם ההערה עם הביטול', (src.match(/retCarryBoxHtml\(r\)/g) || []).length >= 2);
  ok('אימות שסוגר את הפער מוריד את השורות מהרשימה', /undoReturnCarry\(id, \{ silent: true \}\)/.test(src));
  ok('שורת החזרה נשלחת מסומנת בתעודה', /line\.carried = true;/.test(src));
  ok('והניתוח מדלג עליה', (src.match(/anIsDepositLine\(l\) \|\| anIsCarriedLine\(l\)/g) || []).length === 2);
}

// ===== מקצה לקצה: לחיצה אמיתית על הכפתור, במודול האפליקציה המלא =====
// כאן לא נשלפת פונקציה בודדת — רץ כל index.html, ורק גבולות הדפדפן, Firebase
// והרשת מוחלפים. הלחיצה עוברת דרך אותו מאזין שרץ בטלפון.
const { runtime } = await import('./receipt-scan-harness.mjs');

head('[11] מקצה לקצה — הכפתור, האישור, הרשימה והביטול');
{
  const rt = runtime();
  rt.context.testDoc = JSON.parse(JSON.stringify(baseDoc()));
  rt.run(`returns = [testDoc]; returnsList = []; returnsSlots = { weekly: returnsList, daily: [] };
    returnsSlot = 'weekly'; currentView = 'returnsHistory'; renderReturnsHistory();`);
  const card = rt.node('app').innerHTML;
  ok('הכרטיס האדום מציע להחזיר את הפריטים', card.indexOf('החזר את הפריטים לרשימת החזרות') > -1);
  ok('עם התפקיד שהמאזין מכיר', card.indexOf('data-role="ret-carry" data-id="ret_8_9"') > -1);

  rt.click('ret-carry', 'ret_8_9');
  ok('נפתח אישור', rt.node('confirmMsg').textContent.indexOf('רשימת החזרות הפתוחה') > -1);
  ok('והוא מפרט מה בדיוק חוזר', rt.node('confirmMsg').textContent.indexOf('3 × ') > -1);

  await rt.events.get('confirmOk:click')();
  const write = rt.writes[rt.writes.length - 1];
  ok('נכתב רישום ההחזרה על התעודה', !!write && write.path.slice(-2).join('/') === 'returns/ret_8_9' && write.data.carriedNotes.length === 1);
  ok('הרישום נושא כמות, מחיר וברקוד', write.data.carriedNotes[0].qty === 3 && near(write.data.carriedNotes[0].price, pitaUnit));
  const listed = rt.run('JSON.parse(JSON.stringify(returnsList))');
  ok('הפריטים עומדים ברשימת החזרות הפתוחה', listed.length === 1 && listed[0].qty === 3);
  ok('מסומנים כמוחזרים מפער, עם התעודה שמהן באו', listed[0].carried === true && listed[0].carriedFrom === 'ret_8_9');
  ok('ובמחיר הזיכוי הנעול', near(listed[0].unitPrice, pitaUnit) && listed[0].manual === true);
  ok('הרשימה עדיין אותו מערך שיושב בסלוט', rt.run('returnsSlots.weekly === returnsList'));
  ok('הטיוטה נשמרה במכשיר', !!rt.storage.get('bermanReturnsDraft_v1') || [...rt.storage.keys()].some(k => /returns/i.test(k)));

  const sent = rt.run('openReturnsSend(); JSON.parse(JSON.stringify(sendCtx.items))');
  ok('התעודה הבאה נושאת את השורה שחזרה', sent.length === 1 && sent[0].qty === 3);
  ok('במחיר הזיכוי המקורי ולא במחיר היום', near(sent[0].unitPrice, pitaUnit) && near(sent[0].lineTotal, shortEx));
  ok('מסומנת כתביעת פער — הניתוח לא יספור את היחידות פעמיים', sent[0].carried === true && sent[0].carriedFrom === 'ret_8_9');
  ok('ואין עליה שורת פיקדון נוספת', sent.filter(l => l.isDeposit).length === 0);

  const after = rt.run('renderReturnsHistory(); document.getElementById("app").innerHTML');
  ok('התעודה נסגרה — אין יותר "נותר פער בזיכוי"', after.indexOf('נותר פער בזיכוי') === -1);
  ok('ובמקומה הערה שקטה על מה שהוחזר', after.indexOf('הוחזר לרשימת החזרות הפתוחה') > -1);
  ok('הכפתור להחזרה כבר לא מוצע', after.indexOf('data-role="ret-carry" ') === -1);

  rt.click('ret-carry-undo', 'ret_8_9');
  ok('הביטול מבקש אישור', rt.node('confirmMsg').textContent.indexOf('לתעודה המקורית') > -1);
  await rt.events.get('confirmOk:click')();
  ok('הרישום נמחק מהתעודה', (rt.writes[rt.writes.length - 1].data.carriedNotes || []).length === 0);
  ok('והשורות ירדו מרשימת החזרות', rt.run('returnsList.length') === 0);
  ok('בלי להחליף את המערך שבסלוט', rt.run('returnsSlots.weekly === returnsList'));
  ok('התעודה חזרה להיות אדומה', rt.run('renderReturnsHistory(); document.getElementById("app").innerHTML').indexOf('נותר פער בזיכוי') > -1);
}

console.log('\n' + (fail ? '✗ נכשלו ' + fail : '✓ הכל עבר') + ' (' + pass + '/' + (pass + fail) + ')' +
  (backupArg ? ' · מול הגיבוי' : ' · מול fixture.json'));
process.exit(fail ? 1 : 0);
