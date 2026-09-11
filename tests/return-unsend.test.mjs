// v80 — שני מסלולים חדשים בכרטיס תעודת חזרות שטרם אומתה:
//
//   [א] "אישור" — הספק זיכה בדיוק את מה שהוחזר. זה המצב הרגיל, ועד v79 הוא
//       חייב הקלדה של מספר שהאפליקציה כבר יודעת. עכשיו לחיצה אחת.
//   [ב] "החזר את הפריטים לרשימת החזרות" — התעודה נשלחה מוקדם מדי (הנהג לא
//       לקח, או נשלחה בטעות). הסחורה לא יצאה, ולכן הפריטים חוזרים לרשימה
//       הפתוחה והתעודה נמחקת לגמרי. אילו הייתה נשארת, אותן יחידות היו
//       נספרות פעמיים במרכזת החודשית — פעם כאן ופעם בתעודה הבאה.
//
// זה ההפך מ-v78 (returns-carry.test.mjs), ולכן קובץ נפרד: שם הסחורה כן יצאה
// והתעודה נשארת בהיסטוריה; כאן היא לא יצאה והתעודה נעלמת.
//
// הרצה:            node tests/return-unsend.test.mjs
// מול גיבוי אמיתי: node tests/return-unsend.test.mjs --backup ~/bermanbackup.json
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
// htmlEscape נכתב כאן ולא נשלף — ראה ההסבר ב-returns-carry.test.mjs.
let products = productList, returns = [], returnsList = [], VAT = 0.18;
const htmlEscape = v => String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
// גבולות הענן והמסך — בדיוק אלה שהרצת הדפדפן מספקת ולנו אין.
let draftSaves = 0, refreshes = 0, restored = null;
function saveReturnsDraft() { draftSaves++; }
function refreshAfterReturnCarry() { refreshes++; }
function restoreDoc(name, obj) { restored = { name, obj }; }

const FNS = ['r2', 'fmtMoney', 'lineTotalFromUnit', 'vatRateForDoc', 'amountIncForDoc', 'returnTotals',
  'creditAllocationList', 'creditAllocatedEx', 'anIsDepositLine', 'anIsCarriedLine',
  'retVerifyAmount', 'retVerifyRowHtml', 'retUnsendLineKind', 'retUnsendPlan', 'retUnsendSameLine',
  'retUnsendNewId', 'applyReturnUnsend', 'undoReturnUnsend', 'retUnsendBtnHtml'];
// eslint-disable-next-line no-eval
const api = eval(extractSource(FNS, []) + '\n({ ' + FNS.join(', ') + ' })');
const { r2, returnTotals, retVerifyAmount, retVerifyRowHtml, retUnsendLineKind, retUnsendPlan,
  retUnsendSameLine, applyReturnUnsend, undoReturnUnsend, retUnsendBtnHtml } = api;

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (detail ? '  — ' + detail : '')); } };
const near = (a, b, eps = 0.011) => Math.abs(Number(a) - Number(b)) <= eps;
const head = t => console.log('\n' + t);

// ===== התפאורה: תעודה שנשלחה הבוקר ועדיין לא אומתה =====
const PITA = byCode('401');   // פיתות כוסמין 10 בשקית
const LOAF = byCode('101');   // אחיד פרוס ברמן
const pitaUnit = r2(Number(PITA.price) || 0);
const loafUnit = r2(Number(LOAF.price) || 0);

function line(p, qty, unit) { return { name: p.name, barcode: p.barcode || ('bc-' + p.code), productId: p.id, qty, unitPrice: unit, lineTotal: r2(unit * qty) }; }
function openDoc(extra) {
  const items = [line(PITA, 4, pitaUnit), line(LOAF, 1, loafUnit)];
  const ex = r2(items.reduce((a, l) => a + l.lineTotal, 0));
  return Object.assign({
    id: 'ret_open', timestamp: Date.UTC(2026, 8, 10, 4, 26), date: '2026-09-10', docDate: '2026-09-10',
    items, totalExVat: ex, totalIncVat: r2(ex * 1.18), vatPct: 18, credited: false
  }, extra || {});
}
const openEx = r2(pitaUnit * 4 + loafUnit);

head('[1] אישור מהיר — הסכום שנרשם הוא מה שהוחזר');
{
  const r = openDoc();
  ok('הסכום שווה לסך התעודה', near(retVerifyAmount(r), openEx), String(retVerifyAmount(r)));
  ok('והוא בדיוק מה שמוצג בכרטיס', near(retVerifyAmount(r), returnTotals(r).ex));
  const html = retVerifyRowHtml(r);
  ok('שורת האימות מציעה גם הקלדה וגם אישור', html.indexOf('data-role="rv-verify-inline"') > -1 && html.indexOf('data-role="rv-approve"') > -1);
  ok('ושתיהן נושאות את מזהה התעודה', (html.match(/data-id="ret_open"/g) || []).length === 2);
  ok('הסכום לאישור נאמר מראש', html.indexOf('כל מה שהוחזר') > -1 && html.indexOf('₪' + api.fmtMoney(openEx)) > -1);
  ok('שדה ההקלדה מצטמצם ואינו דוחף את הכפתורים', html.indexOf('flex-1 min-w-0') > -1 && (html.match(/shrink-0/g) || []).length === 2);
}

head('[2] אישור כשחלק מהנייר שויך לחוסר בקליטה (v66)');
{
  // הנייר מכסה גם ₪21.88 של חוסר בתעודת קליטה. "אישור" אומר שהחלק של
  // החזרות תואם במדויק — ולכן הסכום הנרשם חייב לכלול גם את השיוך, אחרת
  // returnsCreditForReturns היה יוצא נמוך בדיוק בגובהו ונוצר פער מדומה.
  const r = openDoc({ creditAllocations: [{ receiptId: 'rc_1', amount: 21.88 }] });
  ok('הסכום כולל את השיוך', near(retVerifyAmount(r), r2(openEx + 21.88)), String(retVerifyAmount(r)));
  ok('ומה שנשאר לחזרות הוא בדיוק מה שהוחזר', near(r2(retVerifyAmount(r) - 21.88), openEx));
  ok('שיוך אפס אינו משנה דבר', near(retVerifyAmount(openDoc({ creditAllocations: [] })), openEx));
}

head('[3] תוכנית ההחזרה — מה חוזר לרשימה ומה לא');
{
  const r = openDoc();
  const plan = retUnsendPlan(r);
  ok('שתי השורות חוזרות', plan && plan.items.length === 2);
  ok('הכמות הכוללת נאמרת', plan.units === 5, String(plan.units));
  ok('והכסף תואם לסך התעודה', near(plan.val, openEx), String(plan.val));
  ok('שורת קטלוג מזוהה ככזאת', plan.items.every(x => x.kind === 'catalog'));

  // שורת פיקדון נגזרת לבד בכל שליחה — החזרתה הייתה מכפילה אותה בתעודה הבאה.
  const withDeposit = openDoc();
  withDeposit.items = withDeposit.items.concat([{ name: 'פיקדון · ' + PITA.name, barcode: '', qty: 4, unitPrice: 1.2, lineTotal: 4.8, isDeposit: true }]);
  const depPlan = retUnsendPlan(withDeposit);
  ok('שורת פיקדון אינה חוזרת לרשימה', depPlan.items.length === 2 && depPlan.units === 5);

  ok('תעודה מאומתת אינה מציעה החזרה', retUnsendPlan(openDoc({ credited: true })) === null);
  ok('תעודה בלי שורות אינה מציעה החזרה', retUnsendPlan(openDoc({ items: [] })) === null);
  ok('שורה בכמות אפס אינה חוזרת', retUnsendPlan(openDoc({ items: [line(PITA, 0, pitaUnit)] })) === null);
  ok('הכפתור נפלט רק כשיש מה להחזיר', retUnsendBtnHtml(r).indexOf('data-role="ret-unsend"') > -1 && retUnsendBtnHtml(openDoc({ credited: true })) === '');
  ok('והוא אומר כמה יחידות חוזרות', retUnsendBtnHtml(r).indexOf('(5 יח׳)') > -1);
}

head('[4] סוג השורה — קטלוג, ידנית, הוחזר-מפער, ומוצר שנמחק');
{
  ok('שורת קטלוג', retUnsendLineKind({ productId: PITA.id }) === 'catalog');
  ok('שורה ידנית', retUnsendLineKind({ productId: 'manual_17' }) === 'manual');
  ok('שורה שהוחזרה מפער זיכוי', retUnsendLineKind({ productId: 'carry_17' }) === 'carried');
  ok('גם לפי הדגל ולא רק לפי המזהה', retUnsendLineKind({ productId: PITA.id, carried: true }) === 'carried');
  // מוצר שנמחק מהקטלוג מאז — השורה חוזרת כידנית עם המחיר ששמור בה, כדי
  // שהכמות והכסף לא ייעלמו רק מפני שהכרטיס כבר לא קיים.
  ok('מוצר שכבר לא בקטלוג חוזר כידני', retUnsendLineKind({ productId: 'code_gone' }) === 'manual');
}

head('[5] איחוד לשורה אחת — הכרעת המשתמש');
{
  returnsList = [];
  const slot = returnsList; // הרשימה היא אותו מערך שיושב ב-returnsSlots
  returnsList.push({ productId: PITA.id, name: PITA.name, barcode: PITA.barcode || 'bc-401', qty: 2 });
  const applied = applyReturnUnsend(retUnsendPlan(openDoc()));
  ok('הפיתות התאחדו לשורה אחת', returnsList.filter(x => x.productId === PITA.id).length === 1);
  ok('והכמות נצברה (2 + 4)', returnsList.find(x => x.productId === PITA.id).qty === 6);
  ok('הלחם נוסף כשורה חדשה', returnsList.some(x => x.productId === LOAF.id && x.qty === 1));
  ok('בלי להחליף את המערך שבסלוט', returnsList === slot);
  ok('הדיווח מבדיל בין שורה שנוצרה לשורה שנצברה', applied.length === 2 &&
    applied.some(x => x.productId === PITA.id && x.qty === 4 && x.created === false) &&
    applied.some(x => x.productId === LOAF.id && x.qty === 1 && x.created === true));

  // "בטל" מוריד בדיוק את מה שנוסף, ולא את מה שכבר ישב שם קודם.
  restored = null;
  undoReturnUnsend({ id: 'ret_open' }, applied);
  ok('השורה שנצברה חזרה לכמות המקורית', returnsList.find(x => x.productId === PITA.id).qty === 2);
  ok('והשורה שנוצרה נמחקה', !returnsList.some(x => x.productId === LOAF.id));
  ok('גם אחרי הביטול זה אותו מערך', returnsList === slot);
  ok('הטיוטה נשמרה והמסך רוענן', draftSaves > 0 && refreshes > 0);
  ok('והתעודה שוחזרה מהגיבוי', restored && restored.name === 'returns' && restored.obj.id === 'ret_open');
}

head('[6] שורה ידנית ושורה שהוחזרה מפער — המחיר והסימון נשמרים');
{
  returnsList = [];
  const r = openDoc({ items: [
    { name: 'לחם מיוחד', barcode: '', productId: 'manual_9', qty: 3, unitPrice: 7.5, lineTotal: 22.5 },
    { name: PITA.name, barcode: PITA.barcode || 'bc-401', productId: 'carry_9', qty: 3, unitPrice: pitaUnit, lineTotal: r2(pitaUnit * 3), carried: true, carriedFrom: 'ret_8_9' }
  ] });
  applyReturnUnsend(retUnsendPlan(r));
  const manual = returnsList.find(x => x.name === 'לחם מיוחד');
  ok('השורה הידנית חזרה עם המחיר שלה', manual && manual.manual === true && near(manual.unitPrice, 7.5) && manual.qty === 3);
  ok('ומזהה חדש שאינו מתנגש', manual.productId.indexOf('manual_') === 0 && manual.productId !== 'manual_9');
  const carried = returnsList.find(x => x.carried);
  ok('שורת הפער חזרה מסומנת', carried && carried.carried === true && carried.carriedFrom === 'ret_8_9');
  ok('עם מחיר הזיכוי הנעול', near(carried.unitPrice, pitaUnit) && carried.qty === 3);
  ok('ומזהה carry_ כדי שהניתוח ידלג עליה', carried.productId.indexOf('carry_') === 0);

  // איחוד נכון: ידנית מתאחדת רק עם ידנית בעלת אותו שם ומחיר, ושורת פער רק
  // עם שורת פער מאותה תעודה — מחיר שונה הוא בפירוש תביעה אחרת.
  ok('ידנית באותו שם ומחיר — מתאחדת', retUnsendSameLine({ manual: true, name: 'לחם מיוחד', unitPrice: 7.5 }, { kind: 'manual', name: 'לחם מיוחד', unitPrice: 7.5 }) === true);
  ok('ידנית במחיר אחר — לא', retUnsendSameLine({ manual: true, name: 'לחם מיוחד', unitPrice: 8 }, { kind: 'manual', name: 'לחם מיוחד', unitPrice: 7.5 }) === false);
  ok('שורת פער מתעודה אחרת — לא', retUnsendSameLine({ manual: true, carried: true, carriedFrom: 'ret_x', name: PITA.name, unitPrice: pitaUnit }, { kind: 'carried', carriedFrom: 'ret_8_9', name: PITA.name, unitPrice: pitaUnit }) === false);
  ok('שורת קטלוג אינה מתאחדת עם ידנית באותו שם', retUnsendSameLine({ manual: true, name: PITA.name, unitPrice: pitaUnit }, { kind: 'catalog', productId: PITA.id, name: PITA.name }) === false);
}

head('[7] החיווט — כל תפקיד שנפלט חייב מטפל, ובשני המסכים');
{
  const src = fs.readFileSync(APP_PATH, 'utf8');
  ['rv-approve', 'ret-unsend'].forEach(role => {
    ok('נפלט data-role="' + role + '"', src.indexOf('data-role="' + role + '"') > -1);
    ok('ול-' + role + ' יש מטפל בקוד', new RegExp("role === '" + role + "'").test(src));
  });
  // הקריאה נספרת בשרשור בלבד — ההגדרה עצמה נראית זהה ואינה קריאה.
  ok('שורת האימות משותפת לשני הכרטיסים', (src.match(/retVerifyRowHtml\(r\) \+/g) || []).length === 2);
  ok('וכפתור ההחזרה יושב בשניהם', (src.match(/retUnsendBtnHtml\(r\) \+/g) || []).length === 2);
  ok('אין יותר שתי העתקות של שדה סכום הזיכוי', (src.match(/id="rvNote_/g) || []).length === 1);
  ok('המחיקה קודמת להוספה לרשימה', src.indexOf('const deleted = await hardDeleteDocWithBackup') < src.indexOf('const applied = applyReturnUnsend(plan)'));
  ok('שיוך זיכוי פתוח חוסם את ההחזרה', /returnHasCreditAllocations\(id\)\) return;\n  const plan = retUnsendPlan/.test(src));
}

// ===== מקצה לקצה: לחיצה אמיתית, במודול האפליקציה המלא =====
const { runtime } = await import('./receipt-scan-harness.mjs');
function stubbedRuntime() {
  const rt = runtime();
  // גבול הענן: hardDeleteDocWithBackup כותב ישירות ב-Firestore ואינו עובר
  // דרך runCloudTask, ולכן הוא מוחלף כאן כמו כל גבול רשת אחר בהארנס.
  rt.run(`globalThis.testDeletes = [];
    hardDeleteDocWithBackup = async (name, id, data) => { testDeletes.push({ name, id, data }); return true; };
    globalThis.testToasts2 = [];
    showToast = (text, label, cb) => { testToasts2.push({ text, label, cb }); };`);
  return rt;
}

head('[8] מקצה לקצה — "אישור" סוגר את התעודה בלי הקלדה');
{
  const rt = stubbedRuntime();
  rt.context.testDoc = JSON.parse(JSON.stringify(openDoc()));
  rt.run(`returns = [testDoc]; returnsList = []; returnsSlots = { weekly: returnsList, daily: [] };
    returnsSlot = 'weekly'; currentView = 'returnsHistory'; renderReturnsHistory();`);
  const card = rt.node('app').innerHTML;
  ok('הכרטיס מציע אישור לצד ההקלדה', card.indexOf('data-role="rv-approve" data-id="ret_open"') > -1 && card.indexOf('data-role="rv-verify-inline" data-id="ret_open"') > -1);

  rt.click('rv-approve', 'ret_open');
  ok('נפתח אישור עם הסכום', rt.node('confirmMsg').textContent.indexOf('₪' + api.fmtMoney(openEx)) > -1);
  ok('והוא מסביר שאין צורך להקליד', rt.node('confirmMsg').textContent.indexOf('בלי להקליד') > -1);

  await rt.events.get('confirmOk:click')();
  const write = rt.writes[rt.writes.length - 1];
  ok('התעודה סומנה מאומתת', !!write && write.data.credited === true && write.data.creditStatus === 'ok');
  ok('עם סכום הנייר שהאפליקציה ידעה', near(write.data.creditNoteTotal, openEx), String(write.data.creditNoteTotal));
  ok('הכרטיס הפך ירוק', rt.run('renderReturnsHistory(); document.getElementById("app").innerHTML').indexOf('הזיכוי אומת') > -1);
  ok('ואין יותר פער פתוח', rt.run('JSON.stringify(returnsDiscrepancyInfo(returns[0]).open)') === 'false');
}

head('[9] מקצה לקצה — "החזר לרשימה" מוחק את התעודה ומחזיר את הפריטים');
{
  const rt = stubbedRuntime();
  rt.context.testDoc = JSON.parse(JSON.stringify(openDoc()));
  rt.run(`returns = [testDoc]; returnsList = []; returnsSlots = { weekly: returnsList, daily: [] };
    returnsSlot = 'weekly'; currentView = 'returnsHistory'; renderReturnsHistory();`);
  ok('הכפתור מוצע על תעודה שלא אומתה', rt.node('app').innerHTML.indexOf('data-role="ret-unsend" data-id="ret_open"') > -1);

  rt.click('ret-unsend', 'ret_open');
  const msg = rt.node('confirmMsg').textContent;
  ok('האישור אומר כמה חוזר', msg.indexOf('5 יח׳') > -1 && msg.indexOf('₪' + api.fmtMoney(openEx)) > -1);
  ok('ואומר במפורש שהתעודה תימחק', msg.indexOf('תימחק') > -1 && msg.indexOf('כאילו לא נשלחה') > -1);

  await rt.events.get('confirmOk:click')();
  const del = rt.run('JSON.parse(JSON.stringify(testDeletes))');
  ok('התעודה נמחקה עם גיבוי לסל המחזור', del.length === 1 && del[0].name === 'returns' && del[0].id === 'ret_open');
  ok('והגיבוי נושא את השורות', (del[0].data.items || []).length === 2);
  const list = rt.run('JSON.parse(JSON.stringify(returnsList))');
  ok('שתי השורות חזרו לרשימה', list.length === 2);
  ok('בכמויות המקוריות', list.find(x => x.productId === PITA.id).qty === 4 && list.find(x => x.productId === LOAF.id).qty === 1);
  ok('כשורות קטלוג רגילות — לא ידניות ולא מסומנות', list.every(x => !x.manual && !x.carried));
  ok('הרשימה נשארה אותו מערך שבסלוט', rt.run('returnsSlots.weekly === returnsList'));

  const sent = rt.run('openReturnsSend(); JSON.parse(JSON.stringify(sendCtx.items))');
  ok('התעודה הבאה נושאת את שתי השורות', sent.length >= 2);
  ok('ואף אחת מהן אינה מסומנת כתביעת פער', sent.every(l => !l.carried));

  // "בטל" בטוסט מחזיר את שני הצדדים: התעודה חוזרת והרשימה מתרוקנת.
  const toast = rt.run('JSON.parse(JSON.stringify(testToasts2.map(t => ({ text: t.text, label: t.label }))))');
  ok('הוצע ביטול מיידי', toast.some(t => t.label === 'בטל' && t.text.indexOf('חזרו לרשימת החזרות') > -1));
  await rt.run('testToasts2[testToasts2.length - 1].cb()');
  ok('הרשימה התרוקנה בחזרה', rt.run('returnsList.length') === 0);
  ok('גם אחרי הביטול זה אותו מערך', rt.run('returnsSlots.weekly === returnsList'));
  const restore = rt.writes[rt.writes.length - 1];
  ok('והתעודה שוחזרה מהגיבוי', !!restore && restore.path.slice(-2).join('/') === 'returns/ret_open');
}

head('[10] מקצה לקצה — תעודה מאומתת אינה מציעה את המסלולים החדשים');
{
  const rt = stubbedRuntime();
  rt.context.testDoc = JSON.parse(JSON.stringify(openDoc({ credited: true, creditedAt: Date.UTC(2026, 8, 10, 6, 0), creditStatus: 'ok', creditNoteTotal: openEx })));
  rt.run(`returns = [testDoc]; returnsList = []; returnsSlots = { weekly: returnsList, daily: [] };
    returnsSlot = 'weekly'; currentView = 'returnsHistory'; renderReturnsHistory();`);
  const card = rt.node('app').innerHTML;
  ok('אין כפתור אישור', card.indexOf('data-role="rv-approve"') === -1);
  ok('ואין כפתור החזרה לרשימה', card.indexOf('data-role="ret-unsend"') === -1);
  rt.run('openReturnUnsendConfirm("ret_open")');
  ok('וגם קריאה ישירה נעצרת', rt.run('returnsList.length') === 0 && rt.run('testDeletes.length') === 0);
}

console.log('\n' + (fail ? '✗ נכשלו ' + fail : '✓ הכל עבר') + ' (' + pass + '/' + (pass + fail) + ')' +
  (backupArg ? ' · מול הגיבוי' : ' · מול fixture.json'));
process.exit(fail ? 1 : 0);
