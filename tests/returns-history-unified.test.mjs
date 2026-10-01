// v114 — היסטוריית החזרות אוחדה לתוך מסך התעודות.
//
// עד v113 היו שני מסכי היסטוריה: "היסטוריית חזרות" (תעודות חזרה בלבד) ו"תעודות
// קליטה" (כל התעודות — קליטות וחזרות יחד). המשתמש ביקש מסך אחד: כל לחיצה על
// "היסטוריית חזרות" פותחת את מסך התעודות, והמסך הנפרד נעלם. התנאי: שום פעולה
// שהמסך הישן הציע לא אובדת — כולן יושבות על כרטיס החזרה שבתוך המסך המאוחד.
//
// הבדיקות כאן מריצות את מודול האפליקציה המלא (receipt-scan-harness.mjs) ומוכיחות:
//   [א] setView('returnsHistory') הוא רק כינוי — נוחתים ב-receiptsHistory, עם הכותרת החדשה.
//   [ב] במסך המאוחד יש כרטיס לכל תעודת חזרה — ממתינה, מאומתת, ועם פער פתוח — עם
//       המצב, הכפתורים, שורות המצב בראש המסך, באנר מאזן הזיכויים ובלוק "ניהול תעודות".
//   [ג] כל נקודת כניסה ל"היסטוריית חזרות" (הכפתור בלשונית החזרות, הבאנר האדום,
//       כפתור ההיסטוריה בסרגל, ביטול אימות/עריכה) נוחתת במסך המאוחד.
//   [ד] renderReturnsHistory נעלמה מהקוד, ואין יותר rvOrigin.
//   [ה] קליטות וחזרות באותה רשימה: סדר לפי תאריך, שני המאזנים, בלוק ניקוי אחד; פירוט
//       הפער לשני הכיוונים ועם "הוחזר לחזרות"; והזרימות שחזרו למסך הישן (שמירת אימות,
//       שמירה בלי שליחה, שליחה בוואטסאפ) נוחתות במסך המאוחד.
//   [ו] שרשראות הציור-מחדש שהצביעו על המסך הישן (אישור, "בדוק", ביטול אימות) מציירות
//       עכשיו את המסך המאוחד במקום — בלי לעזוב אותו ובלי לאבד את הכרטיסים האחרים.
//
// הרצה: node --test tests/returns-history-unified.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runtime, appPath } from './receipt-scan-harness.mjs';

// ===== התפאורה: שלוש תעודות חזרה, בשלושת המצבים, עם חותמות זמן קבועות =====
// תעודה שנשלחה ועדיין לא אומתה (יומית — כדי לראות את התג "יומית" בכרטיס).
function pendingReturn(id = 'ret_pending', ts = Date.UTC(2026, 8, 22, 5, 30)) {
  return { id, timestamp: ts, date: '2026-09-22', docDate: '2026-09-22', returnKind: 'daily', sentTo: 'הנהג',
    vatPct: 18, credited: false, totalExVat: 30, totalIncVat: 35.4,
    items: [{ name: 'פיתות כוסמין 10 בשקית', barcode: '7290001001', productId: 'code_401', qty: 3, unitPrice: 10, lineTotal: 30 }] };
}
// תעודה שאומתה בדיוק — הספק זיכה את כל מה שהוחזר.
function verifiedReturn(extra) {
  return Object.assign({ id: 'ret_ok', timestamp: Date.UTC(2026, 8, 15, 5, 30), date: '2026-09-15', docDate: '2026-09-15',
    returnKind: 'weekly', sentTo: 'הנהג', vatPct: 18, credited: true, creditedAt: Date.UTC(2026, 8, 16, 7, 0),
    creditStatus: 'ok', creditNoteTotal: 40, totalExVat: 40, totalIncVat: 47.2,
    items: [{ name: 'אחיד פרוס ברמן', barcode: '7290001002', productId: 'code_101', qty: 4, unitPrice: 10, lineTotal: 40 }] }, extra || {});
}
// תעודה שאומתה עם פער פתוח: הוחזרו ₪55, בנייר ₪30 — שורת הכוסמין (2 יח׳) לא זוכתה כלל.
function openGapReturn() {
  return { id: 'ret_gap', timestamp: Date.UTC(2026, 8, 8, 5, 30), date: '2026-09-08', docDate: '2026-09-08',
    returnKind: 'weekly', sentTo: 'הנהג', vatPct: 18, credited: true, creditedAt: Date.UTC(2026, 8, 9, 7, 0),
    creditStatus: 'open', creditNoteTotal: 30, totalExVat: 55, totalIncVat: 64.9,
    items: [{ name: 'חלה מתוקה', barcode: '7290001003', productId: 'code_238', qty: 3, unitPrice: 10, lineTotal: 30, noteQty: 3 },
      { name: 'לחם מקמח כוסמין E-FREE', barcode: '7290001004', productId: 'code_2381', qty: 2, unitPrice: 12.5, lineTotal: 25, noteQty: 0 }] };
}
// תעודת קליטה פתוחה (יחידה אחת חסרה, ₪12.31) — כדי לראות את שתי הקולקציות באותה רשימה ואת שני המאזנים.
function openReceipt() {
  return { id: 'rc_intake', timestamp: Date.UTC(2026, 8, 10, 6, 0), date: '2026-09-10', docDate: '2026-09-10', status: 'open',
    items: [{ name: 'אחיד פרוס ברמן', productId: 'code_101', barcode: '7290001002', qty: 0, noteQty: 1, unitPrice: 12.31 }] };
}

// מסך התעודות המאוחד מצייר לתוך #app — אותו צומת שהמסך הישן צייר אליו.
function open(docs, receipts = []) {
  const rt = runtime();
  rt.context.testReturns = structuredClone(docs);
  rt.context.testReceipts = structuredClone(receipts);
  rt.run(`returns = structuredClone(testReturns); receipts = structuredClone(testReceipts); receiptHistoryFilter = 'all';
    returnsList = []; returnsSlots = { weekly: returnsList, daily: [] }; returnsSlot = 'weekly';`);
  return rt;
}
const html = rt => rt.node('app').innerHTML;
// כרטיס החזרה של תעודה אחת — מפתיחת ה-<details> שלו ועד הכרטיס הבא
const cardOf = (page, id) => page.split('<details class="bg-white rounded-2xl border-2 ').find(c => c.includes('data-id="' + id + '"')) || '';
const money = (rt, n) => rt.run('fmtMoney(' + n + ')');
const roleCount = (s, role) => (s.match(new RegExp('data-role="' + role + '"', 'g')) || []).length;
const roleFor = (role, id) => 'data-role="' + role + '" data-id="' + id + '"';

test('setView("returnsHistory") is only a compatibility alias — it lands on the unified documents screen', () => {
  const rt = open([pendingReturn()]);
  assert.equal(rt.run("setView('returnsHistory'); currentView"), 'receiptsHistory');
  // גם כניסה מהיסטוריית הדפדפן (popstate של גרסה ישנה) נוחתת שם
  assert.equal(rt.run("currentView = 'returns'; setView('returnsHistory', { fromPop: true }); currentView"), 'receiptsHistory');
  assert.equal(rt.run("currentView = 'returns'; setView('receiptsHistory'); currentView"), 'receiptsHistory');
  const page = html(rt);
  assert.match(page, /<h2 class="[^"]*">היסטוריית תעודות<\/h2>/);
  assert.match(page, /קליטות וחזרות יחד · פתח קודם את מה שדורש טיפול/);
  assert.doesNotMatch(page, /<h2[^>]*>תעודות קליטה<\/h2>/, 'the old receipts-only heading is gone');
  // ההיסטוריה המאוחדת היא מסך משני — סרגל "חזרה" מוצג, לשוניות המצב לא
  assert.equal(rt.node('modeTabs').style.display, 'none');
  assert.equal(rt.node('backBar').classList.contains('hidden'), false);
});

test('renderReturnsHistory and rvOrigin are gone; the only "returnsHistory" left in the source is the alias inside setView', () => {
  const rt = open([]);
  assert.equal(rt.run('typeof renderReturnsHistory'), 'undefined');
  assert.equal(rt.run('typeof rvOrigin'), 'undefined');
  const src = fs.readFileSync(appPath, 'utf8');
  const mentions = src.match(/returnsHistory/g) || [];
  assert.equal(mentions.length, 1, 'exactly one mention: the alias line');
  assert.match(src, /function setView\(v, navOpts\) \{\n  navOpts = navOpts \|\| \{\};\n  if \(v === 'returnsHistory'\) v = 'receiptsHistory';/);
  assert.doesNotMatch(src, /renderReturnsHistory|rvOrigin/);
  // renderView מצייר את המסך המאוחד — ואין לו יותר ענף למסך הנפרד
  assert.match(src, /else if \(currentView === 'receiptsHistory'\) renderReceiptsHistory\(\);/);
  // שומר הציור-מחדש של תמונת הענן: רק לשונית החזרות והמסך המאוחד
  assert.match(src, /if \(currentView === 'returns' \|\| currentView === 'receiptsHistory'\) rerender\(\);/);
  // גיבוי "היסטוריית חזרות" הוא קולקציה, לא מסך — נשאר
  assert.match(src, /\{ name: 'returns', label: 'היסטוריית חזרות' \}/);
  // README: הגרסה מתועדת, חדשה-ראשונה
  const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const v114 = readme.indexOf('\n## v114 — '), v113 = readme.indexOf('\n## v113 — ');
  assert.ok(v114 > -1 && v113 > v114, 'README has a v114 section before v113');
});

test('the unified screen carries a card for every return — pending, verified and open gap — with status, actions and prices', () => {
  const rt = open([pendingReturn(), verifiedReturn(), openGapReturn()]);
  rt.run("currentView = 'receiptsHistory'; renderReceiptsHistory();");
  const page = html(rt);

  // שלושה כרטיסי חזרה, מהחדש לישן
  assert.equal((page.match(/תעודת חזרות \/ זיכוי/g) || []).length, 3);
  const at = id => page.indexOf('data-id="' + id + '"');
  assert.ok(at('ret_pending') > -1 && at('ret_ok') > -1 && at('ret_gap') > -1);
  assert.ok(at('ret_pending') < at('ret_ok') && at('ret_ok') < at('ret_gap'), 'sorted by date, newest first');

  // --- ממתינה לאימות ---
  const pendingCard = cardOf(page, 'ret_pending');
  assert.match(pendingCard, /^border-amber-300 /);
  assert.match(page, /<i class="fa-solid fa-hourglass-half"><\/i> ממתינה לאימות זיכוי/);
  assert.doesNotMatch(page, /לא אומתה/, 'old pending wording is gone');
  assert.doesNotMatch(page, /ממתין לאימות זיכוי(?!<)/, 'old screen wording is gone');
  ['ret-resend', 'rv-verify-inline', 'rv-approve', 'ret-edit-items', 'ret-edit-date', 'ret-unsend', 'ret-delete'].forEach(role =>
    assert.ok(page.includes(roleFor(role, 'ret_pending')), 'pending card offers ' + role));
  assert.match(pendingCard, /<i class="fa-brands fa-whatsapp"><\/i> שלח שוב בוואטסאפ/);
  assert.equal(roleCount(page, 'del-return'), 0, 'berman has one delete button: ret-delete');
  assert.equal(roleCount(page, 'ret-merge'), 0, 'merge is offered only with two pending documents');
  assert.match(pendingCard, /rounded px-1">יומית<\/span>/, 'daily tag on the date line');
  assert.match(pendingCard, /id="rvNote_ret_pending"/);
  assert.match(pendingCard, /3 יח׳<\/div><div class="text-\[11px\] text-slate-400 mt-0\.5">₪30\.00<\/div>/, 'line total (3 × ₪10) under the qty badge');
  assert.match(pendingCard, /<i class="fa-solid fa-barcode"><\/i> 7290001001/);

  // --- אומתה ---
  const okCard = cardOf(page, 'ret_ok');
  assert.match(okCard, /^border-emerald-300 /);
  assert.doesNotMatch(okCard, /יומית/, 'weekly document has no daily tag');
  assert.match(okCard, /<i class="fa-solid fa-circle-check"><\/i> אומתה · /);
  assert.doesNotMatch(page, /הזיכוי אומת/, 'old verified wording is gone');
  assert.ok(okCard.includes(roleFor('rv-open', 'ret_ok')));
  assert.match(okCard, /ערוך אימות/);
  assert.ok(okCard.includes(roleFor('uncredit', 'ret_ok')));
  ['ret-resend', 'rv-approve', 'rv-verify-inline', 'ret-unsend', 'ret-carry'].forEach(role =>
    assert.ok(!okCard.includes(roleFor(role, 'ret_ok')), 'verified card does not offer ' + role));
  assert.doesNotMatch(okCard, /פירוט הפער|הספק חייב לך עוד/);

  // --- אומתה עם פער פתוח ---
  const gapCard = cardOf(page, 'ret_gap');
  assert.match(gapCard, /^border-rose-300 /);
  assert.match(gapCard, /<i class="fa-solid fa-triangle-exclamation"><\/i> פתוח — חסר זיכוי/);
  assert.match(gapCard, /הספק חייב לך עוד ₪25\.00 בזיכוי!/);
  assert.match(gapCard, /החזרת ₪55\.00 · בתעודת הזיכוי ₪30\.00/);
  assert.match(gapCard, /פירוט הפער/);
  assert.match(gapCard, /<span>חסר זיכוי: לחם מקמח כוסמין E-FREE<\/span><span class="shrink-0">2 יח׳<\/span>/);
  assert.doesNotMatch(gapCard, /חסר זיכוי על:/, 'the partial berman box was replaced, not duplicated');
  assert.doesNotMatch(gapCard, /זוכה יתר:/);
  assert.ok(gapCard.includes(roleFor('rv-open', 'ret_gap')));
  assert.match(gapCard, /תקן פער/);
  assert.ok(gapCard.includes(roleFor('ret-carry', 'ret_gap')), 'carry-forward still offered');
  assert.ok(gapCard.includes(roleFor('uncredit', 'ret_gap')));
  assert.ok(gapCard.includes(roleFor('ret-edit-items', 'ret_gap')));
  assert.ok(gapCard.includes(roleFor('ret-delete', 'ret_gap')));

  // שורות הפריטים מראות ברקוד וכסף
  assert.match(gapCard, /<i class="fa-solid fa-barcode"><\/i> 7290001004/);
  assert.match(gapCard, /2 יח׳<\/div><div class="text-\[11px\] text-slate-400 mt-0\.5">₪25\.00<\/div>/, 'qty badge with the line total (2 × ₪12.50) under it');
  assert.match(gapCard, /3 יח׳<\/div><div class="text-\[11px\] text-slate-400 mt-0\.5">₪30\.00<\/div>/);

  // שורות המצב בראש המסך
  assert.match(page, /<div class="px-1 mb-2 text-sm font-bold text-amber-600"><i class="fa-solid fa-hourglass-half"><\/i> תעודת חזרה אחת ממתינה לאימות זיכוי<\/div>/);
  assert.match(page, /<div class="px-1 mb-2 text-sm font-bold text-rose-700"><i class="fa-solid fa-triangle-exclamation"><\/i> תעודת חזרה אחת עם פער פתוח בזיכוי<\/div>/);
  const bodyStart = page.indexOf('<div class="space-y-2.5');
  assert.ok(page.indexOf('ממתינה לאימות זיכוי</div>') < bodyStart, 'status lines sit above the cards');

  // באנר מאזן הזיכויים — בדיוק מה ש-returnsBalanceBannerHtml מחזיר, ולפני המרכזת החודשית
  const banner = rt.run('returnsBalanceBannerHtml()');
  assert.match(banner, /הספק חייב לך ₪25\.00<\/div>/);
  assert.match(banner, /מאזן מצטבר מכל הזיכויים/);
  assert.ok(page.includes(banner), 'the balance banner is on the unified screen');
  assert.ok(page.indexOf(banner) < page.indexOf('מרכזת חודשית'), 'banner before the monthly range box');
  assert.ok(page.indexOf(banner) < bodyStart);

  // "ניהול תעודות": מחיקת היסטוריית החזרות — ובלי כפתור לתעודות קליטה כשאין כאלה
  assert.match(page, /<details class="mb-3"><summary class="cursor-pointer text-xs font-bold text-slate-400 px-1">ניהול תעודות<\/summary>/);
  assert.match(page, /<button data-role="clear-returns-history"[^>]*><i class="fa-solid fa-trash-can"><\/i> מחק את כל היסטוריית החזרות<\/button>/);
  assert.equal(roleCount(page, 'clear-receipts'), 0);
  assert.equal(roleCount(page, 'clear-returns-history'), 1);

  // והכרטיס עצמו (returnCardInReceipts) הוא בדיוק מה שמצויר במסך
  const card = rt.run('returnCardInReceipts(returns[2])');
  assert.ok(page.includes(card));
  assert.match(card, /פירוט הפער/);
  assert.match(rt.run('returnCardInReceipts(returns[0])'), /ממתינה לאימות זיכוי/);
  assert.match(rt.run('returnCardInReceipts(returns[0])'), /data-role="ret-resend"/);
});

test('status lines count in plural and vanish when nothing needs attention; the balance banner has its three states', () => {
  // שתי ממתינות: לשון רבים, מיזוג מוצע, ואין מאזן (אין תעודה מאומתת)
  const two = open([pendingReturn(), pendingReturn('ret_pending2', Date.UTC(2026, 8, 21, 5, 30))]);
  two.run("currentView = 'receiptsHistory'; renderReceiptsHistory();");
  assert.match(html(two), /2 תעודות חזרה ממתינות לאימות זיכוי/);
  assert.doesNotMatch(html(two), /פער פתוח בזיכוי/);
  assert.equal(two.run('returnsBalanceBannerHtml()'), '');
  assert.doesNotMatch(html(two), /מאזן הזיכויים|הספק חייב לך ₪|זוכית ₪/);
  assert.equal(roleCount(html(two), 'ret-merge'), 2);
  assert.equal(roleCount(html(two), 'ret-resend'), 2);

  // מאומתת בדיוק: מאוזן, ובלי שורות מצב
  const ok = open([verifiedReturn()]);
  ok.run("currentView = 'receiptsHistory'; renderReceiptsHistory();");
  assert.match(html(ok), /מאזן הזיכויים מול הספק מאוזן ✓/);
  assert.doesNotMatch(html(ok), /ממתינ(ה|ות) לאימות זיכוי|פער פתוח בזיכוי/);
  assert.match(html(ok), /ניהול תעודות/);

  // זוכתה יותר מדי: הבאנר הכחול
  const over = open([verifiedReturn({ creditNoteTotal: 50 })]);
  over.run("currentView = 'receiptsHistory'; renderReceiptsHistory();");
  assert.match(html(over), new RegExp('זוכית ₪' + money(over, 10).replace('.', '\\.') + ' יותר מסך הכל'));

  // שני פערים פתוחים: לשון רבים
  const gaps = open([openGapReturn(), { ...openGapReturn(), id: 'ret_gap2', timestamp: Date.UTC(2026, 8, 1, 5, 30) }]);
  gaps.run("currentView = 'receiptsHistory'; renderReceiptsHistory();");
  assert.match(html(gaps), /2 תעודות חזרה עם פער פתוח בזיכוי/);
  assert.match(html(gaps), new RegExp('הספק חייב לך ₪' + money(gaps, 50).replace('.', '\\.') + '</div>'));

  // ריק: אין שורות מצב, אין "ניהול תעודות"
  const empty = open([]);
  empty.run("currentView = 'receiptsHistory'; renderReceiptsHistory();");
  assert.match(html(empty), /היסטוריית תעודות/);
  assert.match(html(empty), /אין תעודות עדיין/);
  assert.doesNotMatch(html(empty), /ניהול תעודות|clear-returns-history|לאימות זיכוי/);
});

test('the "ממתינות לזיכוי" filter chip keeps the pending return card (with its actions) while the status lines count every return', () => {
  const rt = open([pendingReturn(), verifiedReturn(), openGapReturn()]);
  rt.run("currentView = 'receiptsHistory'; receiptHistoryFilter = 'credit'; renderReceiptsHistory();");
  assert.equal((html(rt).match(/תעודת חזרות \/ זיכוי/g) || []).length, 1);
  assert.ok(html(rt).includes(roleFor('ret-resend', 'ret_pending')));
  assert.match(html(rt), /תעודת חזרה אחת ממתינה לאימות זיכוי/, 'status lines count all returns, not only the filtered ones');
  assert.match(html(rt), /תעודת חזרה אחת עם פער פתוח בזיכוי/);
  assert.doesNotMatch(html(rt), /אין תעודות במסנן הזה/);
  rt.run("receiptHistoryFilter = 'all'; renderReceiptsHistory();");
  assert.equal((html(rt).match(/תעודת חזרות \/ זיכוי/g) || []).length, 3);
});

test('every "returns history" entry point lands on the unified screen', async () => {
  // הכפתור בלשונית החזרות, כשאין תעודה ממתינה: התווית החדשה
  const rt = open([verifiedReturn()]);
  rt.run("setView('returns')");
  assert.equal(rt.run('currentView'), 'returns');
  assert.match(html(rt), /<button data-role="ret-history"[^>]*><i class="fa-solid fa-clock-rotate-left text-blue-600"><\/i> היסטוריית תעודות — קליטות וחזרות<\/button>/);
  assert.doesNotMatch(html(rt), />היסטוריית חזרות</);
  await rt.click('ret-history');
  assert.equal(rt.run('currentView'), 'receiptsHistory');
  assert.match(html(rt), /היסטוריית תעודות/);
  assert.ok(html(rt).includes(roleFor('rv-open', 'ret_ok')));

  // הבאנר האדום "לאימות ←" כשיש תעודה ממתינה — אותו תפקיד, אותו יעד
  const red = open([pendingReturn()]);
  red.run("setView('returns')");
  assert.match(html(red), /<button data-role="ret-history"[^>]*bg-rose-600[^>]*>.*יש תעודת חזרות פתוחה לאימות.*לאימות ←/);
  await red.click('ret-history');
  assert.equal(red.run('currentView'), 'receiptsHistory');
  assert.ok(html(red).includes(roleFor('rv-approve', 'ret_pending')));

  // כפתור ההיסטוריה בסרגל העליון: חזרות / קליטה / ניהול — למסך המאוחד; הזמנה — להיסטוריית ההזמנות
  const bar = open([pendingReturn()]);
  const btnHistory = bar.events.get('btnHistory:click');
  assert.equal(typeof btnHistory, 'function');
  for (const mode of ['returns', 'receiving', 'manage']) {
    bar.run("currentView = 'returns'; mainMode = '" + mode + "'");
    await btnHistory();
    assert.equal(bar.run('currentView'), 'receiptsHistory', 'btnHistory in mode ' + mode);
  }
  bar.run("currentView = 'order'; mainMode = 'order'");
  await btnHistory();
  assert.equal(bar.run('currentView'), 'history', 'order mode keeps the orders history');

  // ביטול אימות (rv-cancel) — בלי rvOrigin, תמיד חזרה למסך המאוחד
  const rv = open([pendingReturn()]);
  rv.run("openReturnVerify('ret_pending')");
  assert.equal(rv.run('currentView'), 'returnReconcile');
  await rv.click('rv-cancel');
  assert.equal(rv.run('currentView'), 'receiptsHistory');
  assert.equal(rv.run('returnVerify'), null);

  // עריכת פריטים (re-cancel) — המקור הוא תמיד המסך המאוחד
  const re = open([pendingReturn()]);
  re.run("currentView = 'receiptsHistory'; renderReceiptsHistory();");
  await re.click('ret-edit-items', 'ret_pending');
  assert.equal(re.run('currentView'), 'returnItemsEdit');
  assert.equal(re.run('returnEdit.origin'), 'receiptsHistory');
  await re.click('re-cancel');
  assert.equal(re.run('currentView'), 'receiptsHistory');
  assert.equal(re.run('returnEdit'), null);
  // גם בלי returnEdit (לחיצה כפולה) אין נפילה למסך שכבר אינו קיים
  re.run("currentView = 'returnItemsEdit'; returnEdit = null;");
  await re.click('re-cancel');
  assert.equal(re.run('currentView'), 'receiptsHistory');
});

test('"שלח שוב בוואטסאפ" on the unified card opens the resend modal with the document lines', async () => {
  const rt = open([pendingReturn()]);
  rt.run("currentView = 'receiptsHistory'; renderReceiptsHistory();");
  await rt.click('ret-resend', 'ret_pending');
  const ctx = JSON.parse(rt.run('JSON.stringify(sendCtx)'));
  assert.equal(ctx.type, 'returns');
  assert.equal(ctx.resendExisting, true);
  assert.deepEqual(ctx.items, [{ name: 'פיתות כוסמין 10 בשקית', barcode: '7290001001', qty: 3 }]);
  assert.equal(rt.requests.length, 0, 'no network');
});

test('receipts and returns share one list, one order, both balance banners and one clearing block', async () => {
  const rt = open([openGapReturn()], [openReceipt()]);
  // clearAllDocs מוחק ישירות ב-Firestore (לא דרך runCloudTask) — גבול ענן, מוחלף כמו בשאר ההארנס
  rt.run('globalThis.testCleared = []; clearAllDocs = name => { testCleared.push(name); return Promise.resolve(true); };');
  rt.run("currentView = 'receiptsHistory'; renderReceiptsHistory();");
  const page = html(rt);

  // כרטיס קליטה וכרטיס חזרה באותה רשימה, מהחדש לישן: הקליטה (10.9) לפני החזרה (8.9)
  assert.match(page, /<i class="fa-solid fa-file-invoice"><\/i> תעודת קליטה<\/span>/);
  assert.equal((page.match(/תעודת חזרות \/ זיכוי/g) || []).length, 1);
  const rcAt = page.indexOf('data-rc-card="rc_intake"'), retAt = page.indexOf('data-id="ret_gap"');
  assert.ok(rcAt > -1 && retAt > rcAt, 'receipt card first, return card after it');

  // שני המאזנים: סחורה (קליטות) ואז זיכויים (חזרות) — שניהם לפני המרכזת החודשית ולפני הרשימה
  const goods = page.indexOf('<i class="fa-solid fa-scale-unbalanced"></i> הספק חייב לך ₪' + money(rt, 12.31) + ' בסחורה');
  const credits = page.indexOf(rt.run('returnsBalanceBannerHtml()'));
  assert.ok(goods > -1, 'goods balance banner');
  assert.ok(credits > goods, 'credits balance banner right after the goods balance');
  assert.match(page, /הספק חייב לך ₪25\.00<\/div><div class="text-xs text-white\/90 mt-1">מאזן מצטבר מכל הזיכויים/);
  assert.ok(credits < page.indexOf('מרכזת חודשית') && credits < page.indexOf('<div class="space-y-2.5'));

  // "ניהול תעודות": בלוק אחד, שני הכפתורים — קליטות ואז חזרות — כל אחד בשורה משלו
  const manage = (page.match(/<details class="mb-3"><summary class="cursor-pointer text-xs font-bold text-slate-400 px-1">ניהול תעודות<\/summary>[\s\S]*?<\/details>/) || [''])[0];
  assert.ok(manage, 'one management block');
  assert.equal((page.match(/ניהול תעודות<\/summary>/g) || []).length, 1);
  assert.match(manage, /<button data-role="clear-receipts" class="btn-tap mt-2 text-xs font-bold text-red-500 bg-red-50 px-3 py-2 rounded-lg"><i class="fa-solid fa-trash-can"><\/i> מחק את כל תעודות הקליטה<\/button>/);
  assert.match(manage, /<button data-role="clear-returns-history" class="btn-tap mt-2 text-xs font-bold text-red-500 bg-red-50 px-3 py-2 rounded-lg"><i class="fa-solid fa-trash-can"><\/i> מחק את כל היסטוריית החזרות<\/button>/);
  assert.ok(manage.indexOf('clear-receipts') < manage.indexOf('clear-returns-history'));
  assert.doesNotMatch(manage, /<\/button><button/, 'each clearing button on its own line');
  assert.equal(roleCount(page, 'clear-receipts'), 1);
  assert.equal(roleCount(page, 'clear-returns-history'), 1);

  // הכפתור עדיין מנקה את היסטוריית החזרות — ורק אותה — אחרי אישור
  await rt.click('clear-returns-history');
  assert.match(rt.node('confirmMsg').textContent, /למחוק את כל היסטוריית החזרות\?/);
  assert.equal(rt.run('testCleared.length'), 0, 'nothing is deleted before the confirmation');
  await rt.events.get('confirmOk:click')();
  assert.equal(rt.run('JSON.stringify(testCleared)'), '["returns"]');
});

test('the gap breakdown on the card has both directions, the carried-forward note, and escaped names', () => {
  // זוכה יתר: הספק זיכה 5 חלות במקום 3 — הבאנר "זיכה יותר מדי", השורה הכתומה והמאזן הכחול
  const over = open([{ ...openGapReturn(), id: 'ret_over', creditNoteTotal: 75,
    items: [{ name: 'חלה מתוקה', barcode: '7290001003', productId: 'code_238', qty: 3, unitPrice: 10, lineTotal: 30, noteQty: 5 },
      { name: 'לחם מקמח כוסמין E-FREE', barcode: '7290001004', productId: 'code_2381', qty: 2, unitPrice: 12.5, lineTotal: 25, noteQty: 2 }] }]);
  over.run("currentView = 'receiptsHistory'; renderReceiptsHistory();");
  const overCard = cardOf(html(over), 'ret_over');
  assert.match(overCard, /^border-rose-300 /);
  assert.match(overCard, /<i class="fa-solid fa-triangle-exclamation"><\/i> פתוח — פער בזיכוי/);
  assert.match(overCard, /<i class="fa-solid fa-triangle-exclamation"><\/i> הספק זיכה ₪20\.00 יותר מדי<\/div><div class="text-\[11px\] text-white\/90 mt-1">החזרת ₪55\.00 · בתעודת הזיכוי ₪75\.00<\/div>/);
  assert.match(overCard, /פירוט הפער<\/div><div class="flex justify-between text-amber-600"><span>זוכה יתר: חלה מתוקה<\/span><span>2 יח׳<\/span><\/div>/);
  assert.doesNotMatch(overCard, /חסר זיכוי:|הספק חייב לך עוד/);
  assert.match(html(over), /זוכית ₪20\.00 יותר מסך הכל/);
  assert.match(html(over), /תעודת חזרה אחת עם פער פתוח בזיכוי/);

  // הוחזר לחזרות: יחידה אחת מהחוסר כבר עברה לרשימת החזרות הפתוחה — יורדת מהחוב ונאמרת בשורה
  const carried = open([{ ...openGapReturn(), id: 'ret_carried',
    carriedNotes: [{ name: 'לחם מקמח כוסמין E-FREE', barcode: '7290001004', qty: 1, price: 12.5, amountOnly: false, at: Date.UTC(2026, 8, 10, 8, 0) }] }]);
  carried.run("currentView = 'receiptsHistory'; renderReceiptsHistory();");
  const carriedCard = cardOf(html(carried), 'ret_carried');
  assert.match(carriedCard, /הספק חייב לך עוד ₪12\.50 בזיכוי!/);
  assert.match(carriedCard, /החזרת ₪55\.00 · בתעודת הזיכוי ₪30\.00 · הוחזר לחזרות ₪12\.50<\/div>/);
  assert.match(carriedCard, /<span>חסר זיכוי: לחם מקמח כוסמין E-FREE<\/span><span class="shrink-0">1 יח׳<\/span>/);
  assert.match(html(carried), new RegExp('הספק חייב לך ₪' + money(carried, 12.5).replace('.', '\\.') + '</div>'), 'the balance banner also drops what was carried');

  // סכום ששויך לחוסר בקליטה (v66): לחזרות נשארו ₪20 מתוך ₪30 שעל הנייר — החוב גדל בהתאם, והשיוך נראה בתיבה שלו
  const split = open([{ ...openGapReturn(), id: 'ret_split', creditAllocations: [{ receiptId: 'rc_1', amount: 10 }] }]);
  split.run("currentView = 'receiptsHistory'; renderReceiptsHistory();");
  const splitCard = cardOf(html(split), 'ret_split');
  assert.match(splitCard, /הספק חייב לך עוד ₪35\.00 בזיכוי!/);
  assert.match(splitCard, /החזרת ₪55\.00 · בתעודת הזיכוי ₪20\.00<\/div>/);
  assert.match(splitCard, /מהתעודה שויכו ₪10\.00 להשלמת זיכוי בתעודות אחרות/);
  // נייר שהורכב משני חלקים (₪20 + ₪10): החלקים נאמרים בסוגריים, כמו במסך הישן
  const parts = open([{ ...openGapReturn(), id: 'ret_parts', creditNoteParts: [20, 10] }]);
  parts.run("currentView = 'receiptsHistory'; renderReceiptsHistory();");
  assert.match(cardOf(html(parts), 'ret_parts'), /החזרת ₪55\.00 · בתעודת הזיכוי ₪30\.00 \(₪20\.00 \+ ₪10\.00\)<\/div>/);

  // שמות וברקודים עוברים htmlEscape — תו "<" בשם אינו הופך לתגית, לא בשורה ולא בפירוט הפער
  const esc = open([{ ...openGapReturn(), id: 'ret_esc', creditNoteTotal: 0, totalExVat: 5, totalIncVat: 5.9,
    items: [{ name: 'לחם "מיוחד" <b>&co</b>', barcode: '<123>', productId: 'manual_1', qty: 1, unitPrice: 5, lineTotal: 5, noteQty: 0 }] }]);
  esc.run("currentView = 'receiptsHistory'; renderReceiptsHistory();");
  const escCard = cardOf(html(esc), 'ret_esc');
  assert.match(escCard, /truncate">לחם &quot;מיוחד&quot; &lt;b&gt;&amp;co&lt;\/b&gt;<\/div><div class="text-\[11px\] text-slate-400"><i class="fa-solid fa-barcode"><\/i> &lt;123&gt;<\/div>/);
  assert.match(escCard, /<span>חסר זיכוי: לחם &quot;מיוחד&quot; &lt;b&gt;&amp;co&lt;\/b&gt;<\/span>/);
  assert.ok(!escCard.includes('<b>&co</b>') && !escCard.includes('> <123>'));
});

test('the flows that used to go back to the returns screen — a saved verification, a document saved without sending, a WhatsApp send — land on the unified screen', async () => {
  // אימות שנשמר (ולא בוטל): המסך המאוחד, והכרטיס כבר ירוק
  const rv = open([pendingReturn()]);
  rv.run("currentView = 'receiptsHistory'; renderReceiptsHistory(); openReturnVerify('ret_pending', 30); returnVerify.items.forEach(l => { l.checked = true; });");
  assert.equal(rv.run('currentView'), 'returnReconcile');
  await rv.run('saveReturnVerify()');
  assert.equal(rv.run('currentView'), 'receiptsHistory');
  assert.equal(rv.run('returnVerify'), null);
  assert.equal(rv.run('returns[0].credited'), true);
  assert.match(cardOf(html(rv), 'ret_pending'), /<i class="fa-solid fa-circle-check"><\/i> אומתה/);
  assert.doesNotMatch(html(rv), /לאימות זיכוי/, 'nothing pending any more');
  assert.deepEqual(rv.toasts, ['הזיכוי אומת ✓']);

  // תעודה חדשה שנשמרה בלי שליחה: הרשימה מתרוקנת ונוחתים במסך המאוחד
  const line = "returnsList.push({ productId: 'code_401', name: 'פיתות כוסמין 10 בשקית', barcode: '7290001001', qty: 2 }); setView('returns'); openReturnsSend();";
  const saved = open([]);
  saved.run('Date.now = () => ' + Date.UTC(2026, 8, 23, 6, 0) + '; ' + line);
  assert.equal(saved.run('sendCtx.type'), 'returns');
  await saved.run('saveReturnsWithoutSending()');
  assert.equal(saved.run('currentView'), 'receiptsHistory');
  assert.equal(saved.run('returnsList.length'), 0);
  assert.equal(saved.run('sendCtx'), null);
  const write = saved.writes[saved.writes.length - 1];
  assert.equal(write.op, 'set');
  assert.equal(write.path.slice(-2)[0], 'returns');
  assert.equal(write.data.credited, false);
  assert.equal(write.data.sentTo, 'נמסר ידנית');
  assert.equal(write.data.returnKind, 'weekly');
  assert.equal(write.data.timestamp, Date.UTC(2026, 8, 23, 6, 0));
  // הענן מחזיר את התעודה החדשה לרשימה (גבול שההארנס אינו מדמה) — והמסך מצייר אותה כממתינה, עם כל הפעולות
  const newId = write.path.slice(-1)[0];
  saved.context.testNewDoc = structuredClone(write.data);
  saved.run("returns = [{ id: '" + newId + "', ...testNewDoc }]; renderReceiptsHistory();");
  assert.match(html(saved), /תעודת חזרה אחת ממתינה לאימות זיכוי/);
  ['ret-resend', 'rv-verify-inline', 'rv-approve', 'ret-edit-items', 'ret-delete'].forEach(role =>
    assert.ok(html(saved).includes(roleFor(role, newId)), 'new pending card offers ' + role));

  // שליחה בוואטסאפ לנהג: אותה נחיתה, והקישור נפתח
  const sent = open([]);
  sent.run("window.location = { href: '' }; " + line);
  await sent.run("performSend({ name: 'הנהג', phone: '050-1234567' })");
  assert.equal(sent.run('currentView'), 'receiptsHistory');
  assert.equal(sent.run('returnsList.length'), 0);
  assert.equal(sent.writes[sent.writes.length - 1].data.sentTo, 'הנהג');
  assert.match(sent.run('window.location.href'), /^https:\/\/wa\.me\/972501234567\?text=/);
  assert.equal(sent.requests.length, 0, 'no network');
});

test('approving, checking and un-verifying on the unified screen redraw it in place — the chains that used to redraw the old screen', async () => {
  // אישור מהיר (rv-approve → חלון אישור → markReturnVerified): נשארים במסך, הכרטיס ירוק, שורת ההמתנה נעלמת, המאזן מאוזן
  const rt = open([pendingReturn(), openGapReturn()]);
  rt.run("currentView = 'receiptsHistory'; renderReceiptsHistory();");
  assert.match(html(rt), /תעודת חזרה אחת ממתינה לאימות זיכוי/);
  await rt.click('rv-approve', 'ret_pending');
  assert.equal(rt.node('confirmTitle').textContent, 'אישור תעודת זיכוי');
  assert.match(rt.node('confirmMsg').textContent, /לאשר שהספק זיכה בדיוק ₪30\.00/);
  assert.equal(rt.run('returns[0].credited'), false, 'nothing changes before the confirmation');
  await rt.events.get('confirmOk:click')();
  await rt.run('Promise.resolve()');
  assert.equal(rt.run('currentView'), 'receiptsHistory', 'still on the unified screen');
  assert.equal(rt.run('returns[0].credited'), true);
  assert.equal(rt.run('returns[0].creditNoteTotal'), 30);
  let page = html(rt);
  assert.match(cardOf(page, 'ret_pending'), /^border-emerald-300 /, 'the card was redrawn green');
  assert.match(cardOf(page, 'ret_pending'), /<i class="fa-solid fa-circle-check"><\/i> אומתה/);
  assert.doesNotMatch(page, /ממתינ(ה|ות) לאימות זיכוי/, 'the amber status line is gone');
  assert.match(page, /תעודת חזרה אחת עם פער פתוח בזיכוי/, 'the other card is still counted');
  assert.match(cardOf(page, 'ret_gap'), /פירוט הפער/, 'the other card is still drawn in full');
  assert.equal(roleCount(page, 'ret-resend'), 0);
  assert.ok(page.includes(roleFor('uncredit', 'ret_pending')));
  const write = rt.writes[rt.writes.length - 1];
  assert.equal(write.op, 'update');
  assert.equal(write.path.slice(-1)[0], 'ret_pending');
  assert.deepEqual([write.data.credited, write.data.creditNoteTotal, write.data.creditStatus], [true, 30, 'ok']);

  // ביטול אימות (uncredit → חלון אישור → clearReturnVerification): הכרטיס חוזר להיות כתום, עם כל הפעולות
  await rt.click('uncredit', 'ret_pending');
  assert.equal(rt.node('confirmTitle').textContent, 'ביטול אימות');
  await rt.events.get('confirmOk:click')();
  await rt.run('Promise.resolve()');
  assert.equal(rt.run('currentView'), 'receiptsHistory');
  assert.equal(rt.run('returns[0].credited'), false);
  page = html(rt);
  assert.match(cardOf(page, 'ret_pending'), /^border-amber-300 /);
  assert.match(page, /תעודת חזרה אחת ממתינה לאימות זיכוי/);
  ['ret-resend', 'rv-verify-inline', 'rv-approve', 'ret-edit-items', 'ret-delete'].forEach(role =>
    assert.ok(page.includes(roleFor(role, 'ret_pending')), 'reopened card offers ' + role));
  assert.deepEqual([rt.writes[rt.writes.length - 1].data.credited, rt.writes[rt.writes.length - 1].data.creditNoteTotal], [false, null]);

  // "בדוק" עם סכום שהוקלד בשדה שעל הכרטיס (rv-verify-inline → markReturnVerified): סכום תואם סוגר בלי חלון
  rt.node('rvNote_ret_pending').value = '30';
  await rt.click('rv-verify-inline', 'ret_pending');
  await rt.run('Promise.resolve()');
  assert.equal(rt.run('currentView'), 'receiptsHistory');
  assert.equal(rt.run('returns[0].credited'), true);
  assert.match(cardOf(html(rt), 'ret_pending'), /^border-emerald-300 /);
  assert.doesNotMatch(html(rt), /ממתינ(ה|ות) לאימות זיכוי/);
  assert.equal(rt.requests.length, 0, 'no network');
});

test('a filter chip chosen earlier never hides the returns the entry points promise: the returns-side entries and the post-send landings reset to "הכול"', async () => {
  // המסך הישן הראה תמיד את כל החזרות; במסך המאוחד המסנן האחרון דביק, ו"פתוחות" מעולם לא כלל חזרות
  const rt = open([pendingReturn(), verifiedReturn(), openGapReturn()]);
  rt.run("receiptHistoryFilter = 'open'; setView('receiptsHistory')");
  assert.equal((html(rt).match(/תעודת חזרות \/ זיכוי/g) || []).length, 0, 'under "פתוחות" no return card is listed — the chips themselves did not change');
  assert.match(html(rt), /תעודת חזרה אחת ממתינה לאימות זיכוי/, 'but the status line still counts it');
  rt.run("setView('returns')");
  await rt.click('ret-history');
  assert.equal(rt.run('currentView'), 'receiptsHistory');
  assert.equal(rt.run('receiptHistoryFilter'), 'all', 'the returns-tab button / red banner reset the chip');
  assert.equal((html(rt).match(/תעודת חזרות \/ זיכוי/g) || []).length, 3, 'all three return cards are back');
  rt.run("receiptHistoryFilter = 'done'; currentView = 'returns'; mainMode = 'returns'");
  await rt.events.get('btnHistory:click')();
  assert.equal(rt.run('receiptHistoryFilter'), 'all', 'the history button from the returns tab resets too');
  assert.ok(html(rt).includes(roleFor('rv-approve', 'ret_pending')));
  rt.run("receiptHistoryFilter = 'open'; currentView = 'receiving'; mainMode = 'receiving'");
  await rt.events.get('btnHistory:click')();
  assert.equal(rt.run('currentView'), 'receiptsHistory');
  assert.equal(rt.run('receiptHistoryFilter'), 'open', 'from receiving (and manage) the chip stays as it was — unchanged behaviour');

  // תעודה חדשה שנשמרה בלי שליחה — נוחתת על הרשימה המלאה, לא מאחורי "הושלמו"
  const line = "returnsList.push({ productId: 'code_401', name: 'פיתות כוסמין 10 בשקית', barcode: '7290001001', qty: 2 }); setView('returns'); openReturnsSend();";
  const saved = open([]);
  saved.run("receiptHistoryFilter = 'done'; Date.now = () => " + Date.UTC(2026, 8, 23, 6, 0) + '; ' + line);
  await saved.run('saveReturnsWithoutSending()');
  assert.equal(saved.run('currentView'), 'receiptsHistory');
  assert.equal(saved.run('receiptHistoryFilter'), 'all');
  // וגם שליחה בוואטסאפ
  const sent = open([]);
  sent.run("receiptHistoryFilter = 'done'; window.location = { href: '' }; " + line);
  await sent.run("performSend({ name: 'הנהג', phone: '050-1234567' })");
  assert.equal(sent.run('currentView'), 'receiptsHistory');
  assert.equal(sent.run('receiptHistoryFilter'), 'all');
});
