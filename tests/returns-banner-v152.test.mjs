// v152 — הבאנר "יש פער בזיכוי" בפתיחת האפליקציה: לא מסיק מנתונים חלקיים, ומתרענן במקום כשהניירות מגיעים.
// המקרה מ-2.11.2026: בכל פתיחה "יש פער בזיכוי ב-7 תעודות חזרות" במסך הקליטה, גם כשהכל זוכה; נעלם רק אחרי
// כניסה להיסטוריה ויציאה. הסיבה: ההחזרות והקליטות מגיעות מהענן לפני הניירות, המסך מצטייר, ובלי ניירות כל
// החזרה ישנה היא "חסר זיכוי" (4 ביקורים בלי תעודת זיכוי). כשהניירות מגיעים המאזן מחושב מחדש, אבל הבאנר היה
// HTML סטטי בתוך המסך, ורק תיבת "דברים לטיפול" התרעננה. כאן משחזרים את סדר המאזינים כפי שהוא בקוד.
// הרצה: TZ=Asia/Jerusalem node --test tests/returns-banner-v152.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runtime, fixture } from './receipt-scan-harness.mjs';

const L = JSON.parse(fs.readFileSync(new URL('./ledger-2026-10.json', import.meta.url), 'utf8'));
const name = code => (L.products.find(p => p.id === 'code_' + code) || {}).name || code;
// נתונים מומצאים, באותו מבנה כמו המקרה: החזרות מאמצע אוקטובר, ביקורים כמעט כל יום, ונייר זיכוי לכל החזרה
const ret = (id, date, time, rows) => ({ id, date, docDate: date, credited: false, timestamp: Date.parse(date + 'T' + time + ':00'), sentTo: 'קבוצה בוואטסאפ',
  items: rows.map(([code, qty]) => ({ productId: 'code_' + code, code, name: name(code), barcode: '', qty })) });
const credit = (number, rows, docDay) => ({ schema: 1, state: 'accepted', id: 'paper_' + number, kind: 'credit', kindKnown: true, number, terminalNumber: number, numerator: number.slice(-5), docDay, printedTime: null,
  headerText: 'ח.משלוח החזרה יבש', timestamp: Date.parse(docDay + 'T08:00:00'),
  rows: rows.map(([code, qty], i) => ({ line: i + 1, itemCode: code, barcode: '', description: name(code), qty, productId: 'code_' + code, matchedBy: 'tnuva_code_exact' })),
  anchors: { units: rows.reduce((a, x) => a + x[1], 0), lines: rows.length, source: 'printed' }, proof: { unitsOk: true, linesOk: true, checkOk: true, scanStatus: 'verified' } });
const rc = (date, n) => ({ id: 'rc_' + date, date, docDate: date, timestamp: Date.parse(date + 'T07:00:00'), status: 'ok', noteParts: [], paperDocs: [{ number: '24470000' + n }],
  items: [{ productId: 'code_101', code: '101', name: name('101'), qty: 5, noteQty: 5 }] });
const RETS = () => [ret('ret_1010', '2026-10-10', '07:05', [['233', 2], ['238', 1]]), ret('ret_1310', '2026-10-13', '07:02', [['349', 2]])];
const PAPERS = () => [credit('290095436', [['233', 2], ['238', 1]], '2026-10-11'), credit('290095594', [['349', 2]], '2026-10-14')];
const RECS = () => ['2026-10-11', '2026-10-12', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-18'].map((d, i) => rc(d, i));

// אפליקציה "רגע אחרי הפתיחה": המאזינים עוד לא הגיעו (כמו startListeners: כל המקורות ברשימת ההמתנה)
function app() {
  const r = runtime({ data: { ...fixture(), products: structuredClone(L.products) } });
  r.context.T = { RETS: RETS(), PAPERS: PAPERS(), RECS: RECS() };
  r.run(`products = testData.products; todayStr = () => '2026-10-23'; returns = []; receipts = []; papers = [];
    ledgerLoadingSources = new Set(['products', 'receipts', 'returns', 'papers', 'config']); ledgerFailedSources = new Set();
    ledgerSourceLoaded('products'); ledgerSourceLoaded('config');`);
  // בדיוק מה שהמאזינים עושים (index.html, startListeners): החזרות, קליטות (שמציירות את מסך הקליטה), ניירות (שלא)
  r.returnsArrive = () => r.run(`returns = T.RETS; ledgerInvalidate(); refreshLedgerBar(); ledgerSourceLoaded('returns'); if (currentView === 'returns') rerender();`);
  r.receiptsArrive = () => r.run(`receipts = T.RECS; ledgerInvalidate(); refreshLedgerBar(); ledgerSourceLoaded('receipts'); if (currentView === 'receiving') rerender();`);
  r.papersArrive = list => r.run(`papers = ${list}; ledgerSourceLoaded('papers'); refreshLedgerBar();`);
  r.banner = () => r.run('pendingReturnsBannerHtml()');
  r.box = () => r.node('pendingReturnsBanner').innerHTML; // מה שהריענון במקום כתב למיכל
  return r;
}
const strip = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('הפתיחה כמו בטלפון: החזרות וקליטות לפני הניירות — בלי "יש פער" על נתונים חלקיים; כשהניירות מגיעים הבאנר מתעדכן במקום, בלי ציור מחדש', () => {
  const r = app();
  r.run(`setView('receiving')`);
  r.returnsArrive();
  r.receiptsArrive();
  const html = r.node('app').innerHTML;
  assert.match(html, /id="pendingReturnsBanner"/, 'המיכל במסך הקליטה');
  assert.doesNotMatch(html, /יש פער בזיכוי/, 'ב-151: "יש פער בזיכוי ב-2 תעודות חזרות" — כי בלי ניירות שתי ההחזרות "חסר זיכוי"');
  assert.doesNotMatch(html, /פתוח(ה|ות) לאימות/);
  assert.equal(r.banner(), '', 'עד שהניירות הגיעו — אין מסקנה');
  assert.match(r.run('openIssuesBannerContentHtml({})'), /בודק את המאזן/, 'תיבת "דברים לטיפול" כבר נהגה כך');
  // הניירות מגיעים — המאזין מרענן בלי לצייר את מסך הקליטה מחדש. שתי ההחזרות זוכו: אין באנר
  r.papersArrive('T.PAPERS');
  assert.equal(r.banner(), '');
  assert.equal(r.box(), '', 'המיכל רוקן במקום');
  assert.equal(r.run(`JSON.stringify(returns.map(returnStateNow))`), '["done","done"]');
  // ואם באמת יש פער (נייר רק להחזרה הראשונה) — הבאנר מופיע באותו מיכל, בלי שאף אחד צייר את המסך
  r.run(`papers = [T.PAPERS[0]]; ledgerInvalidate(); refreshLedgerBar();`);
  assert.match(r.box(), /bg-rose-600[\s\S]*יש פער בזיכוי בתעודת חזרות[\s\S]*לפרטים ←/);
  assert.equal(r.run(`returnStateNow(returns[1])`), 'open');
});

test('מסך החזרות: בזמן הטעינה כפתור ההיסטוריה במיכל, אחרי הטעינה הבאנר במקומו, וכשהכל זוכה — שוב הכפתור', () => {
  const r = app();
  r.run(`setView('returns')`);
  r.returnsArrive();
  r.receiptsArrive();
  const html = r.node('app').innerHTML;
  assert.match(html, /id="pendingReturnsBanner"><button data-role="ret-history"[^>]*>[\s\S]*?היסטוריית תעודות/, 'בלי מסקנה — כפתור ההיסטוריה');
  assert.doesNotMatch(html, /יש פער בזיכוי/);
  r.papersArrive('[T.PAPERS[0]]');
  assert.match(r.box(), /יש פער בזיכוי בתעודת חזרות/);
  assert.doesNotMatch(r.box(), /היסטוריית תעודות/);
  r.run(`papers = T.PAPERS; ledgerInvalidate(); refreshLedgerBar();`);
  assert.match(r.box(), /data-role="ret-history"[^>]*>[\s\S]*?היסטוריית תעודות/);
  assert.doesNotMatch(r.box(), /יש פער/);
});

test('מקור שנכשל — אין מסקנה ואין באנר; כשכל המקורות הגיעו באמת ואין ניירות — הפער אמיתי ומוצג', () => {
  const r = app();
  r.run(`setView('receiving')`);
  r.returnsArrive(); r.receiptsArrive();
  r.run(`ledgerSourceFailed('papers', new Error('offline'))`);
  assert.equal(r.banner(), '');
  assert.match(r.run('openIssuesBannerContentHtml({})'), /לא הצלחתי לבדוק את המאזן/);
  // הניירות הגיעו, ובאמת אין אף נייר: שתי ההחזרות פתוחות — והבאנר אומר זאת, במקום
  r.papersArrive('[]');
  assert.match(r.box(), /יש פער בזיכוי ב-2 תעודות חזרות/);
  // בלי מאזינים בכלל (בדיקות ישנות, ledgerLoadingSources ריק) — הבאנר מחושב מיד כמו תמיד
  const w = runtime({ data: { ...fixture(), products: structuredClone(L.products) } });
  w.context.T = { RETS: RETS(), RECS: RECS() };
  w.run(`products = testData.products; todayStr = () => '2026-10-23'; returns = T.RETS; receipts = T.RECS; papers = []; ledgerInvalidate();`);
  assert.match(w.run('pendingReturnsBannerHtml()'), /יש פער בזיכוי ב-2 תעודות חזרות/);
});
