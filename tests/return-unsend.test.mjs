// v80 — שני מסלולים חדשים בכרטיס תעודת חזרות שטרם אומתה:
//
//   [א] "אישור" — הספק זיכה על כל מה שהוחזר. זה המצב הרגיל, ועד v79 הוא
//       חייב הקלדה של מספר שהאפליקציה כבר יודעת. עכשיו לחיצה אחת.
//       v123: האישור הוא ביחידות ("כל 5 היחידות"); סכום שהוקלד — לזיהוי בלבד.
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

const FNS = ['r2', 'fmtMoney', 'lineTotalFromUnit', 'anIsDepositLine', 'anIsCarriedLine',
  'returnSentUnits', 'returnItemsSignature', 'retVerifyRowHtml', 'retUnsendLineKind', 'retUnsendPlan', 'retUnsendSameLine',
  'retUnsendNewId', 'applyReturnUnsend', 'undoReturnUnsend', 'retUnsendBtnHtml'];
// eslint-disable-next-line no-eval
const api = eval(extractSource(FNS, []) + '\n({ ' + FNS.join(', ') + ' })');
const { r2, returnSentUnits, returnItemsSignature, retVerifyRowHtml, retUnsendLineKind, retUnsendPlan,
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

head('[1] אישור מהיר — כל היחידות שהוחזרו זוכו');
{
  const r = openDoc();
  ok('5 יחידות הוחזרו', returnSentUnits(r) === 5);
  const html = retVerifyRowHtml(r);
  ok('שורת האימות מציעה גם בדיקה וגם אישור', html.indexOf('data-role="rv-verify-inline"') > -1 && html.indexOf('data-role="rv-approve"') > -1);
  ok('ושתיהן נושאות את מזהה התעודה — וגם כפתור צילום תעודת הזיכוי (v125)', (html.match(/data-id="ret_open"/g) || []).length === 3 && html.indexOf('data-role="paper-photo" data-id="ret_open"') > -1);
  ok('האישור נאמר ביחידות', html.indexOf('כל 5 היחידות') > -1);
  ok('בלי ₪ ובלי סכום מחושב', html.indexOf('₪') === -1 && html.indexOf(api.fmtMoney(openEx)) === -1);
  ok('הסכום — רשות, לזיהוי בלבד', html.indexOf('לזיהוי בלבד') > -1 && html.indexOf('(רשות)') > -1);
  ok('שדה ההקלדה מצטמצם ואינו דוחף את הכפתורים', html.indexOf('flex-1 min-w-0') > -1 && (html.match(/shrink-0/g) || []).length === 2);
}

head('[2] שורת פיקדון אינה נספרת ביחידות; חתימת השורות מזהה שינוי');
{
  const withDeposit = openDoc();
  withDeposit.items = withDeposit.items.concat([{ name: 'פיקדון · ' + PITA.name, barcode: '', qty: 4, isDeposit: true }]);
  ok('פיקדון אינו יחידה שהוחזרה', returnSentUnits(withDeposit) === 5);
  ok('אותה תעודה — אותה חתימה', returnItemsSignature(openDoc()) === returnItemsSignature(openDoc()));
  const changed = openDoc(); changed.items[0].qty = 5;
  ok('כמות שהשתנתה — חתימה אחרת', returnItemsSignature(changed) !== returnItemsSignature(openDoc()));
  ok('כסף שהשתנה אינו משנה את החתימה', returnItemsSignature(openDoc({ totalExVat: 1 })) === returnItemsSignature(openDoc()));
}

head('[3] תוכנית ההחזרה — מה חוזר לרשימה ומה לא');
{
  const r = openDoc();
  const plan = retUnsendPlan(r);
  ok('שתי השורות חוזרות', plan && plan.items.length === 2);
  ok('הכמות הכוללת נאמרת', plan.units === 5, String(plan.units));
  ok('בלי כסף בתוכנית', !('val' in plan) && plan.items.every(x => !('unitPrice' in x)));
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
  // מוצר שנמחק מהקטלוג מאז — השורה חוזרת כידנית, כדי שהכמות לא תיעלם רק
  // מפני שהכרטיס כבר לא קיים.
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

head('[6] שורה ידנית ושורה שהוחזרה מפער — הסימון נשמר, בלי מחיר');
{
  returnsList = [];
  const r = openDoc({ items: [
    { name: 'לחם מיוחד', barcode: '', productId: 'manual_9', qty: 3, unitPrice: 7.5, lineTotal: 22.5 },
    { name: PITA.name, barcode: PITA.barcode || 'bc-401', productId: 'carry_9', code: '401', qty: 3, carried: true, carriedFrom: 'ret_8_9' }
  ] });
  applyReturnUnsend(retUnsendPlan(r));
  const manual = returnsList.find(x => x.name === 'לחם מיוחד');
  ok('השורה הידנית חזרה כידנית', manual && manual.manual === true && manual.qty === 3);
  ok('בלי המחיר הישן שהיה עליה', !('unitPrice' in manual));
  ok('ומזהה חדש שאינו מתנגש', manual.productId.indexOf('manual_') === 0 && manual.productId !== 'manual_9');
  const carried = returnsList.find(x => x.carried);
  ok('שורת הפער חזרה מסומנת', carried && carried.carried === true && carried.carriedFrom === 'ret_8_9');
  ok('עם הכמות והקוד, בלי מחיר', carried.qty === 3 && carried.code === '401' && !('unitPrice' in carried));
  ok('ומזהה carry_ כדי שהניתוח ידלג עליה', carried.productId.indexOf('carry_') === 0);

  // איחוד: ידנית מתאחדת עם ידנית באותו שם; שורת פער רק עם שורת פער מאותה תעודה,
  // באותו שם וברקוד (v123: המחיר כבר אינו חלק מהזהות).
  ok('ידנית באותו שם — מתאחדת', retUnsendSameLine({ manual: true, name: 'לחם מיוחד' }, { kind: 'manual', name: 'לחם מיוחד' }) === true);
  ok('ידנית ישנה במחיר אחר — גם מתאחדת', retUnsendSameLine({ manual: true, name: 'לחם מיוחד', unitPrice: 8 }, { kind: 'manual', name: 'לחם מיוחד' }) === true);
  ok('שורת פער מתעודה אחרת — לא', retUnsendSameLine({ manual: true, carried: true, carriedFrom: 'ret_x', name: PITA.name, barcode: 'b' }, { kind: 'carried', carriedFrom: 'ret_8_9', name: PITA.name, barcode: 'b' }) === false);
  ok('שורת פער מאותה תעודה — מתאחדת', retUnsendSameLine({ manual: true, carried: true, carriedFrom: 'ret_8_9', name: PITA.name, barcode: 'b', unitPrice: 4.5 }, { kind: 'carried', carriedFrom: 'ret_8_9', name: PITA.name, barcode: 'b' }) === true);
  ok('שורת קטלוג אינה מתאחדת עם ידנית באותו שם', retUnsendSameLine({ manual: true, name: PITA.name }, { kind: 'catalog', productId: PITA.id, name: PITA.name }) === false);
  // מוצר שנמחק מהקטלוג חוזר כידני — עם קוד הפריט, כדי שהשליחה הבאה תאמר אותו
  returnsList = [];
  applyReturnUnsend(retUnsendPlan(openDoc({ items: [{ name: 'מוצר שנמחק', barcode: '7290001', productId: 'code_555_gone', code: '555', qty: 2 }] })));
  ok('שורה של מוצר שנמחק שומרת את הקוד', returnsList.length === 1 && returnsList[0].manual === true && returnsList[0].code === '555');
  // ported from credit-price-forms: a carried unsend merges into the identical carried row (2 + 13 = 15)
  returnsList = [{ productId: 'carry_1', name: LOAF.name, barcode: 'bc-l', qty: 2, manual: true, carried: true, carriedFrom: 'older' }];
  applyReturnUnsend(retUnsendPlan(openDoc({ items: [{ productId: 'carry_2', name: LOAF.name, barcode: 'bc-l', qty: 13, carried: true, carriedFrom: 'older' }] })));
  ok('שורת פער זהה מתאחדת לשורה אחת של 15', returnsList.length === 1 && returnsList[0].qty === 15);
}

head('[7] החיווט — כל תפקיד שנפלט חייב מטפל, ובכרטיס החזרה שבמסך התעודות המאוחד');
{
  const src = fs.readFileSync(APP_PATH, 'utf8');
  ['rv-approve', 'ret-unsend'].forEach(role => {
    ok('נפלט data-role="' + role + '"', src.indexOf('data-role="' + role + '"') > -1);
    ok('ול-' + role + ' יש מטפל בקוד', new RegExp("role === '" + role + "'").test(src));
  });
  // הקריאה נספרת בשרשור בלבד — ההגדרה עצמה נראית זהה ואינה קריאה.
  // v114: מסך היסטוריית החזרות אוחד לתוך מסך התעודות — נשאר כרטיס חזרה אחד, והוא חייב לשאת את שניהם.
  ok('שורת האימות יושבת בכרטיס החזרה המאוחד (ורק בו)', (src.match(/retVerifyRowHtml\(r\) \+/g) || []).length === 1);
  ok('וכפתור ההחזרה יושב בו גם', (src.match(/retUnsendBtnHtml\(r\) \+/g) || []).length === 1);
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
    returnsSlot = 'weekly'; receipts = []; receiptHistoryFilter = 'all'; currentView = 'receiptsHistory'; renderReceiptsHistory();`);
  const card = rt.node('app').innerHTML;
  ok('הכרטיס מציע אישור לצד ההקלדה', card.indexOf('data-role="rv-approve" data-id="ret_open"') > -1 && card.indexOf('data-role="rv-verify-inline" data-id="ret_open"') > -1);

  rt.click('rv-approve', 'ret_open');
  ok('נפתח אישור ביחידות', rt.node('confirmMsg').textContent.indexOf('כל 5 היחידות') > -1);
  ok('בלי סכום מחושב', rt.node('confirmMsg').textContent.indexOf('₪') === -1);

  await rt.events.get('confirmOk:click')();
  const write = rt.writes[rt.writes.length - 1];
  ok('התעודה סומנה מאומתת', !!write && write.data.credited === true && write.data.creditStatus === 'ok');
  ok('בלי סכום שהאפליקציה "יודעת"', !('creditNoteTotal' in write.data), JSON.stringify(write.data.creditNoteTotal));
  ok('האישור הוא טרנזקציה על התעודה הטרייה, עם חתימת השורות שאושרו', write.op === 'return-approve' && write.returnsId === 'ret_open' && typeof write.signature === 'string' && write.signature.length > 2);
  ok('בתעודה בלי כמויות זיכוי ישנות — השורות כלל אינן נכתבות', !('items' in write.data));
  ok('הכרטיס הפך ירוק', rt.run('renderReceiptsHistory(); document.getElementById("app").innerHTML').indexOf('<i class="fa-solid fa-circle-check"></i> אומתה') > -1);
  ok('ואין יותר פער פתוח', rt.run('JSON.stringify(returnsDiscrepancyInfo(returns[0]).open)') === 'false');
}

head('[9] מקצה לקצה — "החזר לרשימה" מוחק את התעודה ומחזיר את הפריטים');
{
  const rt = stubbedRuntime();
  rt.context.testDoc = JSON.parse(JSON.stringify(openDoc()));
  rt.run(`returns = [testDoc]; returnsList = []; returnsSlots = { weekly: returnsList, daily: [] };
    returnsSlot = 'weekly'; receipts = []; receiptHistoryFilter = 'all'; currentView = 'receiptsHistory'; renderReceiptsHistory();`);
  ok('הכפתור מוצע על תעודה שלא אומתה', rt.node('app').innerHTML.indexOf('data-role="ret-unsend" data-id="ret_open"') > -1);

  rt.click('ret-unsend', 'ret_open');
  const msg = rt.node('confirmMsg').textContent;
  ok('האישור אומר כמה חוזר — ביחידות', msg.indexOf('5 יח׳') > -1 && msg.indexOf('₪') === -1);
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
    returnsSlot = 'weekly'; receipts = []; receiptHistoryFilter = 'all'; currentView = 'receiptsHistory'; renderReceiptsHistory();`);
  const card = rt.node('app').innerHTML;
  ok('אין כפתור אישור', card.indexOf('data-role="rv-approve"') === -1);
  ok('ואין כפתור החזרה לרשימה', card.indexOf('data-role="ret-unsend"') === -1);
  rt.run('openReturnUnsendConfirm("ret_open")');
  ok('וגם קריאה ישירה נעצרת', rt.run('returnsList.length') === 0 && rt.run('testDeletes.length') === 0);
}

head('[11] v103 — כפתור "מחק תעודה" אחד בכל כרטיס, לא שניים');
{
  // עד v102 כרטיס תעודה שלא אומתה בהיסטוריית החזרות הציג שני כפתורי "מחק
  // תעודה" זה מתחת לזה (ret-delete ו-del-return) שעושים אותו דבר.
  const deletes = html => (html.match(/<i class="fa-solid fa-trash-can"><\/i> מחק תעודה<\/button>/g) || []).length;
  const rt = stubbedRuntime();
  rt.context.testDoc = JSON.parse(JSON.stringify(openDoc()));
  rt.run(`returns = [testDoc]; returnsList = []; returnsSlots = { weekly: returnsList, daily: [] };
    returnsSlot = 'weekly'; receipts = []; receiptHistoryFilter = 'all'; currentView = 'receiptsHistory'; renderReceiptsHistory();`);
  const card = rt.node('app').innerHTML;
  ok('היסטוריית תעודות: כפתור מחיקה אחד', deletes(card) === 1, String(deletes(card)));
  ok('והוא אותו כפתור שבשאר הכרטיסים', card.indexOf('data-role="ret-delete" data-id="ret_open"') > -1 && card.indexOf('data-role="del-return"') === -1);
  ok('תעודות: כפתור מחיקה אחד', deletes(rt.run('returnCardInReceipts(returns[0])')) === 1);
  rt.context.testDoc2 = JSON.parse(JSON.stringify(openDoc({ credited: true, creditedAt: Date.UTC(2026, 8, 10, 6, 0), creditStatus: 'ok', creditNoteTotal: openEx })));
  ok('ותעודה מאומתת — גם אחד', deletes(rt.run('returns = [testDoc2]; renderReceiptsHistory(); document.getElementById("app").innerHTML')) === 1);

  rt.run('returns = [testDoc]; renderReceiptsHistory();');
  rt.click('ret-delete', 'ret_open');
  ok('המחיקה שואלת לפני', rt.node('confirmMsg').textContent.indexOf('למחוק את תעודת החזרה') > -1);
  await rt.events.get('confirmOk:click')();
  const del = rt.run('JSON.parse(JSON.stringify(testDeletes))');
  ok('ומוחקת עם גיבוי לסל המחזור', del.length === 1 && del[0].name === 'returns' && del[0].id === 'ret_open' && (del[0].data.items || []).length === 2);
}

head('[12] "אישור" עם סכום שהוקלד, "בדוק", ותעודה שהשתנתה בזמן החלון');
{
  // v123: הסכום שהוקלד הוא לזיהוי בלבד. "אישור" = כל היחידות זוכו, והסכום נשמר איתו;
  // "בדוק" פותח את מסך האימות עם אותו סכום.
  const fresh = () => {
    const rt = stubbedRuntime();
    rt.context.testDoc = JSON.parse(JSON.stringify(openDoc()));
    rt.run(`returns = [testDoc]; returnsList = []; returnsSlots = { weekly: returnsList, daily: [] };
      returnsSlot = 'weekly'; receipts = []; receiptHistoryFilter = 'all'; currentView = 'receiptsHistory'; renderReceiptsHistory();`);
    return rt;
  };
  const short = r2(openEx - 5);
  const a = fresh();
  a.node('rvNote_ret_open').value = String(short);
  a.click('rv-approve', 'ret_open');
  ok('האישור מזכיר את הסכום שהוקלד כזיהוי', a.node('confirmMsg').textContent.indexOf('לזיהוי') > -1);
  await a.events.get('confirmOk:click')();
  const aw = a.writes[a.writes.length - 1];
  ok('סכום שהוקלד + אישור — נסגר עם הסכום שהוקלד', !!aw && aw.data.credited === true && aw.data.creditStatus === 'ok' && near(aw.data.creditNoteTotal, short));
  const b = fresh();
  b.node('rvNote_ret_open').value = String(short);
  b.click('rv-verify-inline', 'ret_open');
  ok('"בדוק" פותח את מסך האימות עם הסכום שהוקלד', b.run('currentView') === 'returnReconcile' && near(b.run('returnVerify.noteTotal'), short));
  const e = fresh();
  e.click('rv-verify-inline', 'ret_open');
  ok('"בדוק" בלי סכום — פותח בכל זאת', e.run('currentView') === 'returnReconcile' && e.run('returnVerify.noteTotal') === null);

  // התעודה נערכה ממכשיר אחר בזמן שחלון האישור היה פתוח — היא כבר אינה "כל מה
  // שהוחזר", ולכן אינה נסגרת בשמו.
  const c = fresh();
  c.click('rv-approve', 'ret_open');
  const cw = c.writes.length;
  c.run('returns[0].items[0].qty = 7;');
  await c.events.get('confirmOk:click')();
  ok('תעודה שהשתנתה אינה נסגרת', c.writes.length === cw && c.run('returns[0].credited') === false);
  ok('והמשתמש שומע על זה', c.run('testToasts2[testToasts2.length - 1].text').indexOf('השתנתה') > -1);

  const html = fresh().run('retVerifyRowHtml(returns[0])');
  const input = (html.match(/<input id="rvNote_ret_open"[^>]*>/) || [''])[0];
  ok('שדה הסכום 16px — בלי זום באייפון', /\btext-base\b/.test(input) && !/\btext-sm\b/.test(input));
}

console.log('\n' + (fail ? '✗ נכשלו ' + fail : '✓ הכל עבר') + ' (' + pass + '/' + (pass + fail) + ')' +
  (backupArg ? ' · מול הגיבוי' : ' · מול fixture.json'));
process.exit(fail ? 1 : 0);
