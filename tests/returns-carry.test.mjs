// v78 — החזרת פריטים מתעודת חזרות פתוחה לרשימת החזרות הפתוחה.
// המקרה: החזרנו 4 יח׳ ברמן אסלי 5 פיתות, הספק זיכה רק 1, והבטיח להשלים
// בהחזרה הבאה. עד היום התעודה נשארה אדומה לנצח ואיש לא זכר לתבוע שוב את
// שלוש היחידות. עכשיו הן חוזרות לרשימת החזרות הפתוחה, נשלחות בתעודה הבאה,
// והתעודה המקורית נסגרת בלי שהיחידות ייספרו פעמיים.
// v123: הכל ביחידות — בלי מחיר זיכוי נעול ובלי "פער כספי בלבד".
//
// הבדיקות רצות על הפונקציות האמיתיות מ-index.html (ראה extract.mjs).
//
// הרצה:            node tests/returns-carry.test.mjs
// מול גיבוי אמיתי: node tests/returns-carry.test.mjs --backup ~/bermanbackup.json
// (התעודות בתרחיש נבנות כאן בכל מקרה — מהגיבוי מגיע רק הקטלוג.)
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
  'creditAllocationList', 'returnsBalance', 'returnCreditNotes', 'consumeReturnLinkedCredit',
  'returnCarriedNotes', 'retCarryKey', 'consumeReturnCarriedNotes', 'returnsDiscrepancyInfo',
  'retCarryPlan', 'retCarrySideText', 'retCarryBoxHtml', 'retCarryBtnHtml', 'buildReturnRow', 'anIsCarriedLine', 'anIsDepositLine'];
// eslint-disable-next-line no-eval
const api = eval(extractSource(FNS, []) + '\n({ ' + FNS.join(', ') + ' })');
const { r2, returnsDiscrepancyInfo, returnsBalance, retCarryPlan, retCarrySideText,
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

head('[1] הפער לפני ההחזרה — התעודה אדומה, 3 יח׳ לא זוכו');
{
  const r = baseDoc();
  returns = [r];
  const di = returnsDiscrepancyInfo(r);
  ok('התעודה פתוחה', di.open === true);
  ok('שורה אחת חסרה', di.shortItems.length === 1);
  ok('שלוש יחידות', di.shortItems[0].n === 3 && di.shortUnits === 3);
  ok('הברקוד נשמר לשורה — לפיו נצרך רישום ישן', di.shortItems[0].barcode === (PITA.barcode || 'bc-pita'));
  ok('גם המוצר עצמו — לפיו נצרך רישום חדש', di.shortItems[0].productId === PITA.id);
  ok('בלי מחיר ובלי "הספק חייב"', !('price' in di.shortItems[0]) && !('owed' in di) && !('shortVal' in di));
  ok('אין עדיין מה שהועבר', di.carried.length === 0);
  const bal = returnsBalance();
  ok('המאזן הכולל: 3 יח׳ בתעודה אחת', bal.shortUnits === 3 && bal.openDocs === 1 && bal.overUnits === 0);
}

head('[2] התוכנית — בדיוק אותם מוצרים וכמויות');
{
  const r = baseDoc();
  returns = [r];
  const plan = retCarryPlan(r);
  ok('יש תוכנית', !!plan);
  ok('שורה אחת', plan.items.length === 1);
  ok('שלוש יחידות פיתה', plan.items[0].qty === 3 && plan.units === 3);
  ok('עם המוצר', plan.items[0].productId === PITA.id && plan.items[0].name === PITA.name);
  ok('בלי מחיר', !('price' in plan.items[0]) && !('val' in plan) && !('amountOnly' in plan.items[0]));
  ok('הטקסט לאישור מזכיר כמות ושם', retCarrySideText(plan.items).indexOf('3 × ') === 0);
}

head('[3] אין מה להחזיר — תעודה שממתינה לאימות, ותעודה שנסגרה');
{
  const pending = baseDoc({ credited: false, creditStatus: null, creditNoteTotal: null });
  ok('תעודה שטרם אומתה — אין תוכנית', retCarryPlan(pending) === null);
  const exact = baseDoc();
  exact.items = exact.items.map(l => { const c = { ...l }; delete c.noteQty; return c; });
  exact.creditStatus = 'ok';
  ok('תעודה שזוכתה במלואה — אין תוכנית', retCarryPlan(exact) === null);
  ok('וגם הכפתור לא נפלט', retCarryBtnHtml(exact) === '');
  ok('אבל על תעודה עם פער הכפתור כן נפלט', retCarryBtnHtml(baseDoc()).indexOf('data-role="ret-carry"') > -1);
  // v123: סכום נייר שונה ממה שהוחזר כבר אינו פער
  const moneyOnly = { ...exact, creditStatus: 'open', creditNoteTotal: r2(exact.totalExVat - 12) };
  ok('פער כספי בלבד אינו פותח תעודה ואינו מציע החזרה', returnsDiscrepancyInfo(moneyOnly).open === false && retCarryPlan(moneyOnly) === null);
}

head('[4] אחרי ההחזרה — התעודה נסגרת, והיחידות לא נספרות בה פעמיים');
{
  const r = baseDoc({ carriedNotes: [{ productId: PITA.id, name: PITA.name, barcode: PITA.barcode || 'bc-pita', qty: 3, at: Date.UTC(2026, 8, 9, 8, 0) }] });
  returns = [r];
  const di = returnsDiscrepancyInfo(r);
  ok('אין יותר שורת חוסר פתוחה', di.shortItems.length === 0 && di.shortUnits === 0);
  ok('הרישום נצרך', di.carried.length === 1 && di.carried[0].qty === 3);
  ok('התעודה נסגרה — לא אדומה', di.open === false);
  ok('גם המאזן הכולל התאפס', returnsBalance().shortUnits === 0 && returnsBalance().openDocs === 0);
  ok('אין תוכנית שנייה על אותו פער', retCarryPlan(r) === null);
  const box = retCarryBoxHtml(r);
  ok('ההערה מספרת לאן הלכו הפריטים', box.indexOf('3 יח׳ הוחזרו לרשימת החזרות הפתוחה') > -1);
  ok('בלי ₪', box.indexOf('₪') === -1);
  ok('ואפשר לבטל מתוכה', box.indexOf('data-role="ret-carry-undo"') > -1);
  // רישום ישן (לפני v123) בלי מזהה מוצר נצרך לפי ברקוד ושם
  const legacy = baseDoc({ carriedNotes: [{ name: PITA.name, barcode: PITA.barcode || 'bc-pita', qty: 3, price: pitaUnit, amountOnly: false, at: 1 }] });
  ok('רישום ישן לפי ברקוד ושם — נצרך באותה מידה', returnsDiscrepancyInfo(legacy).open === false);
}

head('[5] החזרה חלקית — מה שלא הוחזר נשאר פתוח');
{
  const r = baseDoc({ carriedNotes: [{ productId: PITA.id, name: PITA.name, barcode: PITA.barcode || 'bc-pita', qty: 2, at: 1 }] });
  returns = [r];
  const di = returnsDiscrepancyInfo(r);
  ok('נשארה יחידה אחת חסרה', di.shortItems.length === 1 && di.shortItems[0].n === 1);
  ok('שתי יחידות נצרכו', di.carried[0].qty === 2);
  ok('התעודה עדיין פתוחה', di.open === true);
  ok('ותוכנית ההחזרה הבאה היא על היחידה שנשארה', retCarryPlan(r).items[0].qty === 1);
}

head('[6] רישום שאינו מתאים לשום שורה — לא נצרך ולא מקזז');
{
  const r = baseDoc({ carriedNotes: [{ productId: 'code_zzz', name: 'מוצר אחר לגמרי', barcode: 'bc-zzz', qty: 3, at: 1 }] });
  returns = [r];
  const di = returnsDiscrepancyInfo(r);
  ok('שורת החוסר נשארה שלמה', di.shortItems.length === 1 && di.shortItems[0].n === 3);
  ok('שום דבר לא נספר כהועבר', di.carried.length === 0);
  ok('רישום בכמות אפס נזרק', returnCarriedNotes({ carriedNotes: [{ name: 'x', qty: 0 }] }).length === 0);
  ok('המפתח לרישום ישן הוא ברקוד+שם', retCarryKey({ barcode: 'b', name: 'n' }) === 'b|n');
  // אותו שם וברקוד אבל מוצר אחר — רישום חדש לא נצרך מהשורה
  const sameKeyOtherProduct = baseDoc({ carriedNotes: [{ productId: 'code_zzz', name: PITA.name, barcode: PITA.barcode || 'bc-pita', qty: 3, at: 1 }] });
  ok('רישום חדש נצרך לפי המוצר, לא לפי השם', returnsDiscrepancyInfo(sameKeyOtherProduct).shortItems[0].n === 3);
}

head('[7] רישום ישן של "השלמת סכום" — אינו פותח ואינו נצרך');
{
  // לפני v123: תעודה שכל שורותיה זוכו אבל הנייר היה קטן — הועברה שורת סכום אחת
  const r = baseDoc();
  r.items = r.items.map(l => { const c = { ...l }; delete c.noteQty; return c; });
  r.carriedNotes = [{ name: 'השלמת זיכוי · חזרות 8.9.2026', barcode: '', qty: 1, price: 12, amountOnly: true, at: 1 }];
  const di = returnsDiscrepancyInfo(r);
  ok('התעודה סגורה', di.open === false && di.shortItems.length === 0);
  ok('הרישום מוצג בכרטיס', di.carried.length === 1);
  const box = retCarryBoxHtml(r);
  ok('כהערה ניטרלית, בלי ₪', box.indexOf('השלמת זיכוי (רישום ישן)') > -1 && box.indexOf('₪') === -1);
  // גם כשיש חוסר אמיתי — רישום הסכום אינו נצרך ממנו
  const both = baseDoc({ carriedNotes: [{ name: 'השלמת זיכוי', barcode: '', qty: 1, price: 12, amountOnly: true, at: 1 }] });
  ok('ואינו מכסה חוסר ביחידות', returnsDiscrepancyInfo(both).shortItems[0].n === 3);
}

head('[8] שיוך זיכוי לחוסר בקליטה אינו משנה את הפער של החזרות');
{
  const r = baseDoc();
  r.creditAllocations = [{ id: 'alloc1', receiptId: 'rc_9_9', receiptDate: '2026-09-09', items: [{ productId: 'code_349', name: 'x', qty: 2 }] }];
  returns = [r];
  ok('החוסר נשאר 3 יח׳', returnsDiscrepancyInfo(r).shortUnits === 3);
  r.carriedNotes = [{ productId: PITA.id, name: PITA.name, barcode: PITA.barcode || 'bc-pita', qty: 3, at: 1 }];
  ok('ואחרי ההחזרה התעודה נסגרת', returnsDiscrepancyInfo(r).open === false);
  ok('המאזן הכולל נקי', returnsBalance().shortUnits === 0);
}

head('[9] השורה שחזרה לרשימה — מסומנת, בלי מחיר, ולא נספרת שוב כסחורה');
{
  const row = buildReturnRow({ productId: 'carry_123', name: PITA.name, barcode: PITA.barcode || 'bc-pita', qty: 3, manual: true, carried: true, carriedFrom: 'ret_8_9' });
  ok('הסימון "הוחזר מפער זיכוי" מופיע', row.indexOf('הוחזר מפער זיכוי') > -1);
  ok('ולא הסימון הידני הרגיל', row.indexOf('מוצר ידני') === -1);
  ok('בלי מחיר', row.indexOf('₪') === -1 && row.indexOf('ללא מע״מ') === -1);
  const manual = buildReturnRow({ productId: 'manual_1', name: 'לחמניה משקית', qty: 2, manual: true });
  ok('שורה ידנית — בלי מחיר', manual.indexOf('מוצר ידני') > -1 && manual.indexOf('₪') === -1);
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
    returnsSlot = 'weekly'; receipts = []; receiptHistoryFilter = 'all'; currentView = 'receiptsHistory'; renderReceiptsHistory();`);
  const card = rt.node('app').innerHTML;
  ok('הכרטיס האדום מציע להחזיר את הפריטים', card.indexOf('החזר את הפריטים לרשימת החזרות') > -1);
  ok('עם התפקיד שהמאזין מכיר', card.indexOf('data-role="ret-carry" data-id="ret_8_9"') > -1);

  rt.click('ret-carry', 'ret_8_9');
  ok('נפתח אישור', rt.node('confirmMsg').textContent.indexOf('רשימת החזרות הפתוחה') > -1);
  ok('והוא מפרט מה בדיוק חוזר', rt.node('confirmMsg').textContent.indexOf('3 × ') > -1);

  await rt.events.get('confirmOk:click')();
  const write = rt.writes[rt.writes.length - 1];
  ok('נכתב רישום ההחזרה על התעודה', !!write && write.path.slice(-2).join('/') === 'returns/ret_8_9' && write.data.carriedNotes.length === 1);
  ok('הרישום נושא מוצר, כמות וברקוד — בלי מחיר', write.data.carriedNotes[0].qty === 3 && write.data.carriedNotes[0].productId === PITA.id && !('price' in write.data.carriedNotes[0]) && !('amountOnly' in write.data.carriedNotes[0]));
  const listed = rt.run('JSON.parse(JSON.stringify(returnsList))');
  ok('הפריטים עומדים ברשימת החזרות הפתוחה', listed.length === 1 && listed[0].qty === 3);
  ok('מסומנים כמוחזרים מפער, עם התעודה שמהן באו', listed[0].carried === true && listed[0].carriedFrom === 'ret_8_9');
  ok('בלי מחיר על השורה', !('unitPrice' in listed[0]) && listed[0].manual === true);
  ok('הרשימה עדיין אותו מערך שיושב בסלוט', rt.run('returnsSlots.weekly === returnsList'));
  ok('הטיוטה נשמרה במכשיר', !!rt.storage.get('bermanReturnsDraft_v1') || [...rt.storage.keys()].some(k => /returns/i.test(k)));

  const sent = rt.run('openReturnsSend(); JSON.parse(JSON.stringify(sendCtx.items))');
  ok('התעודה הבאה נושאת את השורה שחזרה', sent.length === 1 && sent[0].qty === 3);
  ok('בלי מחיר — רק כמות', !('unitPrice' in sent[0]) && !('lineTotal' in sent[0]) && !('sentUnitPrice' in sent[0]));
  ok('מסומנת כתביעת פער — הניתוח לא יספור את היחידות פעמיים', sent[0].carried === true && sent[0].carriedFrom === 'ret_8_9');
  ok('ואין עליה שורת פיקדון נוספת', sent.filter(l => l.isDeposit).length === 0);

  const after = rt.run('renderReceiptsHistory(); document.getElementById("app").innerHTML');
  ok('התעודה נסגרה — אין יותר חוסר זיכוי פתוח', !rt.run('returnsDiscrepancyInfo(returns[0]).open') && after.indexOf('פתוח — חסר זיכוי') === -1);
  ok('ובמקומה הערה שקטה על מה שהוחזר', after.indexOf('3 יח׳ הוחזרו לרשימת החזרות הפתוחה') > -1);
  ok('הכפתור להחזרה כבר לא מוצע', after.indexOf('data-role="ret-carry" ') === -1);

  rt.click('ret-carry-undo', 'ret_8_9');
  ok('הביטול מבקש אישור', rt.node('confirmMsg').textContent.indexOf('לתעודה המקורית') > -1);
  await rt.events.get('confirmOk:click')();
  ok('הרישום נמחק מהתעודה', (rt.writes[rt.writes.length - 1].data.carriedNotes || []).length === 0);
  ok('והשורות ירדו מרשימת החזרות', rt.run('returnsList.length') === 0);
  ok('בלי להחליף את המערך שבסלוט', rt.run('returnsSlots.weekly === returnsList'));
  ok('התעודה חזרה להיות אדומה', rt.run('returnsDiscrepancyInfo(returns[0]).open') && rt.run('renderReceiptsHistory(); document.getElementById("app").innerHTML').indexOf('פתוח — חסר זיכוי') > -1);
}

console.log('\n' + (fail ? '✗ נכשלו ' + fail : '✓ הכל עבר') + ' (' + pass + '/' + (pass + fail) + ')' +
  (backupArg ? ' · מול הגיבוי' : ' · מול fixture.json'));
process.exit(fail ? 1 : 0);
