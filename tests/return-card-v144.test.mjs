// v144 — כרטיס אחד להחזרה בהיסטוריה. עד v143 נייר הזיכוי וההחזרה היו שני כרטיסים נפרדים ברשימה (עם תעודות אחרות
// ביניהם ואותו משפט בשניהם); בתוך ההחזרה — שורות בלי לדעת מה זוכה, "לטיפול במאזן", "ראה במאזן" ו"בדיקה ידנית" גם
// כשהנייר כבר אומר מה זוכה. כל הנתונים כאן מומצאים (מוצרי הקטלוג מ-tests/ledger-2026-10.json); הגיבוי של המשתמש אינו במאגר.
// מה שנבדק, על האפליקציה כולה:
// - נייר זיכוי שנספר ושייך להחזרה שברשימה — בתוך הכרטיס שלה, עם "פתח" (לא כרטיס נפרד, בשום מסנן); נייר שעוד לא נספר —
//   כרטיס משלו, כמו קודם.
// - הכותרת אומרת מה בדיוק ("חסר זיכוי על 7 יח׳"); בשורת הסיכום "הוחזרו · זוכו" ו"חסר 7"; מתחת לתאריך — באיזה נייר.
// - "מה לעשות" בראש הכרטיס, עם הכפתורים של המאזן; "מקבל את ההחלפה" מתוך הכרטיס נשמר, והכרטיס מתעדכן.
// - טבלת הוחזרו/זוכו: מה שזוכה במלואו מקופל; כמה שורות של אותו מוצר — שורה אחת; פיקדון ו"מפער קודם" — בנפרד.
// - בדיקה ידנית רק כשאין תעודת זיכוי ראשית.
// - מהבאנר "יש פער בזיכוי" ומהמשפט על ההחזרה — להיסטוריה, עם הכרטיס שלה פתוח.
// - תצוגה בלבד: שום תעודה לא נכתבת (חוץ מהתשובה עצמה, כשלוחצים עליה).
// הרצה: TZ=Asia/Jerusalem node --test tests/return-card-v144.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runtime, fixture } from './receipt-scan-harness.mjs';

const L = JSON.parse(fs.readFileSync(new URL('./ledger-2026-10.json', import.meta.url), 'utf8'));
const strip = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&#039;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const name = code => (L.products.find(p => p.id === 'code_' + code) || {}).name || code;

function app(papersList, { returns = [], receipts = [], today = '2026-10-12' } = {}) {
  const r = runtime({ data: { ...fixture(), products: structuredClone(L.products) } });
  r.context.testL = { receipts, returns, papers: papersList };
  r.context.testWrites = [];
  r.run(`receipts = testL.receipts; returns = testL.returns; papers = testL.papers; todayStr = () => '${today}';
    runCloudTask = async (label, task) => { testWrites.push(task); return true; }; runCloudTaskSilent = runCloudTask; ledgerInvalidate();`);
  r.j = expr => JSON.parse(r.run('JSON.stringify(' + expr + ')'));
  r.history = (filter = 'all') => { r.run(`setView('receiptsHistory'); receiptHistoryFilter = '${filter}'; renderReceiptsHistory();`); return r.node('app').innerHTML; };
  // כרטיס ההחזרה בדף (כולל החלק המקופל "עוד N מוצרים")
  r.cardIn = (html, id) => '<details' + (html.split(/<details(?! class="ret-fold")/).find(c => c.includes('data-rc-card="ret:' + id + '"')) || '');
  r.card = id => r.run(`returnCardInReceipts(returns.find(x => x.id === '${id}'))`);
  return r;
}
const ret = (id, date, rows, extra = {}) => ({ id, date, docDate: date, credited: false, timestamp: Date.parse(date + 'T19:30:00'), sentTo: 'קבוצה בוואטסאפ', ...extra,
  items: rows.map(([code, qty]) => ({ productId: 'code_' + code, code, name: name(code), barcode: '', qty })) });
const credit = (number, rows, docDay, extra = {}) => ({ schema: 1, state: 'accepted', id: 'paper_' + number, kind: 'credit', kindKnown: true, number, terminalNumber: number, numerator: number.slice(-5), docDay, printedTime: null,
  timestamp: Date.parse(docDay + 'T08:00:00') + Number(number.slice(-2)), ...extra,
  rows: rows.map(([code, qty], i) => ({ line: i + 1, itemCode: code, barcode: '', description: code, qty, productId: 'code_' + code, matchedBy: 'tnuva_code_exact' })),
  anchors: { units: rows.reduce((a, x) => a + x[1], 0), lines: rows.length, source: 'printed' }, proof: { unitsOk: true, linesOk: true } });

// ההחזרה מ-10.10: נייר הזיכוי מ-11.10 זיכה הכל חוץ מחלומית ארוזה ×7. ההחזרה מ-12.10 עוד מחכה לתעודת זיכוי.
const R1 = () => ret('ret_r1', '2026-10-10', [['450', 1], ['451', 2], ['458', 7], ['238', 6], ['344', 3]]);
const P1 = () => credit('290099501', [['450', 1], ['451', 2], ['238', 6], ['344', 3]], '2026-10-11');
const R2 = () => ret('ret_r2', '2026-10-12', [['101', 2], ['100', 1]]);

test('נייר זיכוי שנספר — בתוך הכרטיס של ההחזרה שלו, עם "פתח"; לא כרטיס נפרד בשום מסנן. נייר שעוד לא נספר — כרטיס משלו', () => {
  const unread = credit('290099502', [['101', 2]], '2026-10-12', { state: 'review' }); // לא נקרא עד הסוף
  const r = app([P1(), unread], { returns: [R1(), R2()] });
  const html = r.history();
  const c1 = r.cardIn(html, 'ret_r1');
  assert.match(strip(c1), /נייר הזיכוי מהנהג של ההחזרה הזו נייר הזיכוי 99501 מ-11\.10 4 שורות · 12 יח׳ · תעודת הזיכוי של ההחזרה פתח/);
  assert.match(c1, /data-role="paper-open" data-id="paper_290099501"/);
  for (const f of ['all', 'open', 'credit', 'done']) {
    const page = r.history(f);
    assert.ok(!page.includes('data-rc-card="paper:paper_290099501"'), f + ': אין כרטיס נפרד לנייר שבתוך ההחזרה');
  }
  // הנייר שלא נקרא עד הסוף — עדיין כרטיס משלו, "לבדיקה"
  assert.match(html, /data-rc-card="paper:paper_290099502"/);
  assert.match(strip(r.history('open')), /נייר זיכוי מהנהג .*לבדיקה — עוד לא נספר/);
  assert.equal(r.j('testWrites.length'), 0, 'תצוגה בלבד');
});

test('הכותרת אומרת מה בדיוק; "הוחזרו · זוכו" ו"חסר"; מתחת לתאריך — באיזה נייר; כשהכרטיס פתוח — "מה לעשות" במקום המשפט', () => {
  const r = app([P1()], { returns: [R1(), R2()] });
  const c1 = r.card('ret_r1'), s1 = strip(c1);
  assert.match(s1, /^ ?תעודת חזרות \/ זיכוי חסר זיכוי על 7 יח׳ 10\.10\.2026 · 19:30 זוכתה בנייר 99501 מ-11\.10/);
  assert.match(s1, /חסר זיכוי על חלומית ארוזה ברמן ×7 מההחזרה של 10\.10 — לבקש זיכוי מהנהג הוחזרו · זוכו 19 · 12 חסר 7/);
  assert.doesNotMatch(s1, /לטיפול במאזן|ראה במאזן|במאזן: \d+ לטיפול|נשלח אל/);
  // המשפט שבסיכום — רק כשהכרטיס סגור (פתוח: "מה לעשות" אומר אותו)
  assert.match(c1, /<div class="ret-when-closed"><div class="text-xs font-black leading-snug mt-1 text-rose-700">/);
  assert.match(s1, /מה לעשות לבקש מהנהג זיכוי על חלומית ארוזה ברמן ×7 מההחזרה של 10\.10\. הנהג הביא עוד נייר זיכוי\? צלם אותו בכפתור "צלם נייר מהנהג" למעלה — וזה ייסגר לבד\./);
  // ההחזרה בלי נייר — כמו קודם
  const s2 = strip(r.card('ret_r2'));
  assert.match(s2, /ממתינה לאימות זיכוי 12\.10\.2026 · 19:30 נשלח אל קבוצה בוואטסאפ .*הוחזרו 3 יח׳ · 2 שורות/);
  assert.doesNotMatch(r.card('ret_r2'), /ret-when-closed|<\/i> מה לעשות<\/div>/);
  // נייר משלים שזיכה רק חלק — "ממתינה", "זוכתה חלקית", ו"טרם זוכה" (לא "חסר")
  const side = app([credit('290099503', [['101', 2]], '2026-10-13')], { returns: [ret('ret_s', '2026-10-12', [['101', 2], ['100', 1], ['238', 6], ['344', 3]])], today: '2026-10-13' });
  const ss = strip(side.card('ret_s'));
  assert.match(ss, /ממתינה לתעודת זיכוי 12\.10\.2026 · 19:30 זוכתה חלקית בנייר 99503 מ-13\.10/);
  assert.match(ss, /הוחזרו · זוכו 12 · 2 טרם זוכה 10/);
  assert.match(ss, /לחם אחיד ברמן 1 0 טרם זוכה 1 — ממתינה לתעודת זיכוי/);
  assert.doesNotMatch(ss, /חסר/);
  // שני ניירות שזיכו הכל — בכותרת כמה, המספרים מתחת לתאריך
  const two = app([credit('290099504', [['450', 1], ['451', 2], ['238', 6], ['344', 3]], '2026-10-11'), credit('290099505', [['458', 7]], '2026-10-12')], { returns: [R1()] });
  const st = strip(two.card('ret_r1'));
  assert.match(st, /זוכתה — 2 ניירות 10\.10\.2026 · 19:30 זוכתה בניירות 99504 מ-11\.10, 99505 מ-12\.10 הוחזרו · זוכו 19 · 19/);
  assert.match(st, /✓ ניירות 99504, 99505 מהנהג זיכו את כל מה שהוחזר — ההחזרה זוכתה\. אין מה לעשות\./);
  // נייר אחד שזיכה הכל — "זוכתה — נייר …" בכותרת, ובלי לחזור עליו מתחת לתאריך
  const one = app([credit('290099506', [['450', 1], ['451', 2], ['458', 7], ['238', 6], ['344', 3]], '2026-10-11')], { returns: [R1()] });
  assert.match(strip(one.card('ret_r1')), /זוכתה — נייר 99506 10\.10\.2026 · 19:30 נשלח אל קבוצה בוואטסאפ הוחזרו · זוכו 19 · 19 ✓ נייר הזיכוי 99506 מ-11\.10 צולם ומתאים — ההחזרה זוכתה\. אין מה לעשות\./);
});

test('טבלת הוחזרו/זוכו: מה שקרה בו משהו — למעלה; מה שזוכה במלואו — מקופל; אותו מוצר בכמה שורות — שורה אחת; פיקדון — בנפרד', () => {
  const R = ret('ret_t', '2026-10-10', [['450', 1], ['451', 2], ['458', 7], ['238', 4], ['344', 3]]);
  R.items.push({ productId: 'code_238', code: '238', name: name('238'), barcode: '', qty: 2 }); // עוד שורה של אותו מוצר
  R.items.push({ productId: 'deposit-238', name: 'פיקדון · ' + name('238'), barcode: '', qty: 6, isDeposit: true });
  const r = app([P1()], { returns: [R] });
  const s = strip(r.card('ret_t'));
  assert.match(s, /מוצר הוחזרו זוכו חלומית ארוזה ברמן 7 0 חסר 7 — לא בנייר הזיכוי עוד 4 מוצרים — זוכו במלואם הצג הסתר/);
  assert.match(s, /חלה מרובעת ברמן 1 1 חלה קלועה ברמן 2 2 ברמן אסלי 5 פיתות 6 6 לחם מקמח כוסמין E-FREE 3 3/, 'אותו מוצר בשתי שורות — שורה אחת, 6');
  assert.match(s, /פיקדון · ברמן אסלי 5 פיתות ×6 — פיקדון, לא נבדק בזיכוי/);
  assert.equal((r.card('ret_t').match(/<details class="ret-fold">/g) || []).length, 1);
  // הכל זוכה — "כל N המוצרים זוכו במלואם"
  const all = app([credit('290099507', [['450', 1], ['451', 2]], '2026-10-11')], { returns: [ret('ret_a', '2026-10-10', [['450', 1], ['451', 2]])] });
  assert.match(strip(all.card('ret_a')), /מוצר הוחזרו זוכו כל 2 המוצרים זוכו במלואם/);
  // שורה "מפער קודם" (v78, מהחזרה שאומתה ידנית) — במאזן היא של ההחזרה שממנה הועברה; בכרטיס: זוכתה כאן, או שהחוסר שם
  const OLD = ret('ret_old', '2026-10-05', [['451', 2], ['450', 1]], { credited: true, creditStatus: 'open', carriedNotes: [{ id: 'cn1', productId: 'code_451', code: '451', name: name('451'), barcode: '', qty: 2, at: 1 }] });
  OLD.items[0].noteQty = 0; OLD.items[1].noteQty = 1;
  const C = ret('ret_c', '2026-10-10', [['450', 1]]);
  C.items.push({ productId: 'carry_1', code: '451', name: name('451'), barcode: '', qty: 2, carried: true, carriedFrom: 'ret_old' });
  const carried = app([credit('290099508', [['450', 1], ['451', 2]], '2026-10-11', { forReturnId: 'ret_c' })], { returns: [OLD, C] });
  assert.match(strip(carried.card('ret_c')), /הוחזרו · זוכו 3 · 3 .*חלה קלועה ברמן מפער קודם 2 2 מפער קודם: 2 זוכו כאן/);
  assert.equal(carried.j('openIssuesList().length'), 0);
  const notYet = app([credit('290099509', [['450', 1]], '2026-10-11', { forReturnId: 'ret_c' })], { returns: [OLD, C] });
  assert.match(strip(notYet.card('ret_c')), /הוחזרו · זוכו 3 · 1 .*חלה קלועה ברמן מפער קודם 2 0 מפער קודם: 2 — החוסר רשום בהחזרה שממנה הועבר/);
  assert.match(strip(notYet.card('ret_old')), /מה לעשות לבקש מהנהג זיכוי על חלה קלועה ברמן ×2 מההחזרה של 5\.10\./);
});

test('בדיקה ידנית רק כשאין תעודת זיכוי ראשית: עם נייר שחסרה בו שורה — "מה לעשות", בלי "ראה במאזן" ובלי בדיקה ידנית', () => {
  const r = app([P1()], { returns: [R1(), R2()] });
  const c1 = r.card('ret_r1');
  assert.doesNotMatch(c1, /data-role="rv-verify-inline"|id="rvNote_|ראה במאזן|בדיקה ידנית/);
  assert.match(c1, /data-role="ret-edit-items"[\s\S]*data-role="ret-edit-date"[\s\S]*data-role="ret-delete"/);
  assert.doesNotMatch(c1, /data-role="ret-unsend"|data-role="ret-merge"|data-role="ret-resend"/, 'v143: הנהג כבר זיכה בנייר');
  const c2 = r.card('ret_r2');
  assert.match(c2, /data-role="rv-verify-inline" data-id="ret_r2"/);
  assert.match(c2, /תעודת הזיכוי — צלם אותה בכפתור "צלם נייר מהנהג" למעלה/);
});

test('"מקבל את ההחלפה" מתוך הכרטיס — התשובה נשמרת, והכרטיס מתעדכן במקום', async () => {
  // ברמן אקטיב ×2 הוחזרו, ובנייר זוכו דגני קלות ×2 — במחיר שונה (מבצע): לטיפול
  const R = ret('ret_sw', '2026-10-10', [['339', 2], ['238', 6]]);
  const r = app([credit('290099510', [['333', 2], ['238', 6]], '2026-10-11')], { returns: [R] });
  let html = r.history();
  let s = strip(r.cardIn(html, 'ret_sw'));
  assert.match(s, /זוכה מוצר אחר — לבדוק/);
  assert.match(s, /מה לעשות ברמן זיכתה דגני קלות ×2 במקום ברמן אקטיב שהחזרת ב-10\.10 .*מקבל את ההחלפה פרטים/);
  assert.match(s, /ברמן אקטיב 2 0 במקומן זוכו דגני קלות ×2 — לא נסגר לבד \(מחיר שונה\)/);
  assert.match(s, /דגני קלות לא הוחזר 0 2 במקום ברמן אקטיב — לא נסגר לבד \(מחיר שונה\)/);
  const item = (r.cardIn(html, 'ret_sw').match(/data-role="ledger-accept-swap" data-item="([^"]+)"/) || [])[1];
  assert.ok(item, 'הכפתור נושא את הפריט במאזן');
  r.run(`paperUiClick({ dataset: { role: 'ledger-accept-swap', item: ${JSON.stringify(item)} } })`);
  for (let i = 0; i < 5; i++) await new Promise(res => setImmediate(res)); // השמירה (המדומה) והציור מחדש
  const w = r.j('testWrites');
  assert.equal(w.length, 1);
  assert.match(w[0].path.join('/'), /papers\/decl_swap_/);
  assert.equal(w[0].data.declare, 'accept-swap');
  assert.equal(r.run('currentView'), 'receiptsHistory');
  html = r.node('app').innerHTML;
  s = strip(r.cardIn(html, 'ret_sw'));
  assert.match(s, /זוכתה — נייר 99510/);
  assert.match(s, /ברמן אקטיב 2 0 זוכו כ״דגני קלות״ ×2 — קיבלת את ההחלפה/);
});

test('מהבאנרים — להיסטוריה, עם הכרטיס של ההחזרה פתוח (ורק הוא)', () => {
  const r = app([P1()], { returns: [R1(), R2()] });
  // המשפט בהתראה העליונה — לכרטיס של ההחזרה
  const list = r.j('openIssuesList()');
  assert.deepEqual(list.map(x => [x.role, x.returnId]), [['ret-card', 'ret_r1']]);
  r.run(`setView('manage')`);
  assert.match(r.node('app').innerHTML, /<button data-role="ret-card" data-id="ret_r1" class="btn-tap w-full min-h-\[44px\][^>]*>[\s\S]*חסר זיכוי על חלומית ארוזה ברמן ×7/);
  r.run(`receiptHistoryFilter = 'done'`);
  r.click('ret-card', 'ret_r1');
  assert.equal(r.run('currentView'), 'receiptsHistory');
  assert.equal(r.run('receiptHistoryFilter'), 'all', 'מסנן ישן לא מסתיר את הכרטיס');
  let html = r.node('app').innerHTML;
  assert.match(html, /data-rc-card="ret:ret_r1" open>/);
  assert.doesNotMatch(html, /data-rc-card="ret:ret_r2" open>/);
  assert.equal(r.run('receiptHistoryFocus'), null, 'רק בציור הראשון');
  // הבאנר "יש פער בזיכוי" בלשונית החזרות — ההחזרה עם הפער פתוחה; זו שרק ממתינה — לא
  const fresh = app([P1()], { returns: [R1(), R2()] });
  assert.match(fresh.run('pendingReturnsBannerHtml()'), /data-role="ret-history"[\s\S]*יש פער בזיכוי בתעודת חזרות/);
  fresh.click('ret-history');
  html = fresh.node('app').innerHTML;
  assert.match(html, /data-rc-card="ret:ret_r1" open>/);
  assert.doesNotMatch(html, /data-rc-card="ret:ret_r2" open>/);
  // בלי פער — הממתינות פתוחות
  const wait = app([], { returns: [R2()] });
  wait.click('ret-history');
  assert.match(wait.node('app').innerHTML, /data-rc-card="ret:ret_r2" open>/);
  // שורה אחת בזמן ספירה, כשיש כמה דברים — למאזן (שבו כולם)
  const many = app([P1(), credit('290099511', [['333', 2], ['238', 6]], '2026-10-11')], { returns: [R1(), ret('ret_sw', '2026-10-10', [['339', 2], ['238', 6]], { timestamp: 1 })] });
  assert.ok(many.j('openIssuesList().length') >= 2);
  assert.match(many.run('openIssuesBannerHtml({ compact: true })'), /<button data-role="ledger-open" class=/);
  assert.equal(r.j('testWrites.length'), 0, 'תצוגה בלבד');
});

test('כרטיס שהיה פתוח נשאר פתוח בציור מחדש (כמו הקליטות)', () => {
  const r = app([P1()], { returns: [R1(), R2()] });
  r.history();
  // הדפדפן פותח את הכרטיס בלחיצה; המסך זוכר אותו לציור הבא (כמו בכרטיסי הקליטה)
  r.run(`app.querySelectorAll = sel => sel === 'details[data-rc-card][open]' ? [{ dataset: { rcCard: 'ret:ret_r2' } }] : [];`);
  const html = r.history();
  assert.match(html, /data-rc-card="ret:ret_r2" open>/);
  assert.doesNotMatch(html, /data-rc-card="ret:ret_r1" open>/);
});
