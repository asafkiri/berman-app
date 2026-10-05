// v127 — ההיסטוריה מהמאזן: הניירות מהנהג כתעודות לכל דבר, והסטטוס של תעודה שנייר נוגע בה בא מהמאזן.
// על הנתונים של 4–5.10.2026 (tests/ledger-2026-10.json) ועל החזרות קטנות סינתטיות.
// מה שנבדק:
// - בלי ניירות — כל קליטה וכל החזרה מסווגות בדיוק כמו קודם (פתוחה/ממתינה/הושלמה).
// - עם 141 ו-142: שני כרטיסי נייר; הקליטה של 4.10 "אומתה — ניירות 95141, 95142"; הקליטה של 5.10 אומרת
//   "חויבת פעמיים"; ההחזרה של 4.10 — שאלת התיקון; המסננים והבאנרים בהתאם; אין הצעת קיזוז על 1231.
// - "כן, זה תיקון" — ההחזרה של 4.10 "זוכתה — נייר 95142".
// - החזרה שתעודת הזיכוי שלה צולמה (ראשי) — "זוכתה" גם בלי "אישור", ולא בבאנר; נייר משלים — עדיין ממתינה.
// - תעודת משלוח שצולמה ועוד לא נקלטה — כרטיס בלי כמויות, עם "לקליטה".
// - "פרטים" מכרטיס בהיסטוריה — "חזרה" חוזרת להיסטוריה.
// - שום תעודה שמורה לא נכתבת.
// הרצה: node --test tests/history-ledger.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runtime, fixture } from './receipt-scan-harness.mjs';

const L = JSON.parse(fs.readFileSync(new URL('./ledger-2026-10.json', import.meta.url), 'utf8'));
const day = d => x => (x.docDate || x.date) === d;
const R410 = L.receipts.find(day('2026-10-04')).id, R510 = L.receipts.find(day('2026-10-05')).id;
const RET410 = L.returns.find(day('2026-10-04')).id;
const strip = h => h.replace(/<[^>]+>/g, ' ').replace(/&#039;/g, "'").replace(/\s+/g, ' ');

function app(papersList, opts = {}) {
  const r = runtime({ data: { ...fixture(), products: L.products } });
  r.context.testL = { receipts: opts.receipts || L.receipts.slice().reverse(), returns: opts.returns || L.returns.slice().reverse(), papers: papersList };
  r.context.testWrites = [];
  r.run(`receipts = testL.receipts; returns = testL.returns; papers = testL.papers; todayStr = () => '2026-10-05';
    runCloudTask = async (label, task) => { testWrites.push(task); return true; }; runCloudTaskSilent = runCloudTask; ledgerInvalidate();`);
  r.history = (filter = 'all') => { r.run(`currentView = 'receiptsHistory'; receiptHistoryFilter = '${filter}'; renderReceiptsHistory();`); return r.node('app').innerHTML; };
  // כרטיס לפי מה שכתוב בו
  r.card = (html, re) => (html.split('<details').slice(1).map(c => '<details' + c).find(c => re.test(strip(c))) || '');
  return r;
}
const declared = o => ({ schema: 1, kind: 'declared', state: 'accepted', docDay: '2026-10-05', timestamp: 2, ...o });

test('בלי ניירות — כל תעודה מסווגת בדיוק כמו קודם, ואין כרטיסי נייר', () => {
  const r = app([]);
  const recs = r.run(`receipts.map(rc => [rc.id, receiptOpenNow(rc), receiptDiscrepancyInfo(rc).open])`);
  recs.forEach(([id, now, before]) => assert.equal(now, before, id));
  const rets = r.run(`returns.map(x => [x.id, returnStateNow(x), !x.credited ? 'credit' : returnsDiscrepancyInfo(x).open ? 'open' : 'done'])`);
  rets.forEach(([id, now, before]) => assert.equal(now, before, id));
  const html = r.history();
  assert.doesNotMatch(html, /מהנהג<\/span>/, 'אין כרטיס נייר');
  assert.doesNotMatch(html, /נסגרה בנייר|זוכתה —/);
});

test('עם 141 ו-142: כרטיסי נייר, וסטטוס הקליטות וההחזרה מהמאזן', () => {
  const r = app([L.papers.p141, L.papers.p142]);
  const html = r.history();
  // הניירות עצמם
  const c142 = r.card(html, /נייר זיכוי מהנהג/), c141 = r.card(html, /נייר חיוב מהנהג/);
  assert.match(strip(c142), /נספר במאזן[\s\S]*4\.10\.2026 · 09:04 · 290095142[\s\S]*זיכוי משלים להחזרה מ-4\.10[\s\S]*זוכו 17 יח׳ · 4 שורות/);
  assert.match(strip(c142), /אחיד פרוס ברמן[\s\S]*13 יח׳/);
  assert.match(c142, /data-role="paper-open" data-id="paper_290095142"/);
  // v130: התיקון של ברמן מזוהה לבד — בלי "שאלה במאזן"
  assert.match(strip(c141), /נספר במאזן[\s\S]*עודף לחמניות 10 בשקית ×2 בקליטה מ-4\.10 · תיקון של ברמן: לחם אחיד ברמן ×13 \(התקזז\)[\s\S]*חויבו 15 יח׳ · 2 שורות/);
  assert.doesNotMatch(strip(c141), /שאלה במאזן|בלי עודף מתאים/);
  // הקליטות
  assert.match(strip(r.card(html, /תעודת קליטה.*4\.10\.2026/)), /אומתה — ניירות 95141, 95142/);
  const c510raw = r.card(html, /תעודת קליטה.*5\.10\.2026/), c510 = strip(c510raw);
  assert.match(c510, /לטיפול במאזן[\s\S]*חויבת פעמיים על לחמניות 10 בשקית ×2 — לבקש זיכוי מהנהג/);
  // המאזן מחזיק את התעודה: בלי תיבת ההפרשים הישנה ובלי קיזוז/זיכוי ידני שלא יודעים על 141
  assert.doesNotMatch(c510raw, /data-role="rc-offset-choose"|data-role="rc-short-credit"|הפרשים מול התעודה/);
  assert.equal(r.run(`receiptOpenNow(receipts.find(x => x.id === '${R510}'))`), true);
  assert.equal(r.run(`receiptOpenNow(receipts.find(x => x.id === '${R410}'))`), false, '4.10 — הניירות הסבירו את ההפרש');
  assert.equal(r.run(`receiptDiscrepancyInfo(receipts.find(x => x.id === '${R410}')).open`), true, '...אף שבתעודה עצמה עדיין רשום הפרש (לא נכתבה מחדש)');
  // ההחזרה של 4.10 — התיקון זוהה לבד, 142 זיכה את השאר: סגורה (כמו אחרי "כן, זה תיקון")
  assert.equal(r.run(`returnStateNow(returns.find(x => x.id === '${RET410}'))`), 'done');
  const cRet = r.card(html, /תעודת חזרות.*4\.10\.2026/);
  assert.match(strip(cRet), /זוכתה — נייר 95142/);
  assert.doesNotMatch(strip(cRet), /שאלה במאזן/);
  // 344 ו-238 זוכו ב-142 — לא "חסר זיכוי", ולא מועברים להחזרה הבאה (זה היה תובע אותם מהנהג שוב)
  assert.doesNotMatch(cRet, /פירוט הפער|data-role="ret-carry"/);
  // מסננים
  const open = strip(r.history('open')), done = strip(r.history('done'));
  assert.doesNotMatch(open, /נייר חיוב מהנהג|נייר זיכוי מהנהג/, 'שני הניירות הוסברו — לא "פתוחות"');
  assert.match(open, /חויבת פעמיים/); assert.doesNotMatch(open, /אומתה — ניירות 95141/);
  assert.match(done, /נייר זיכוי מהנהג/); assert.match(done, /נייר חיוב מהנהג/); assert.match(done, /אומתה — ניירות 95141, 95142/);
  // באנרים: החוסר של 5.10 נשאר; מה ש-142 זיכה בהחזרה של 4.10 כבר לא "חסר זיכוי"
  const rb = r.run('receiptsBalance()'), tb = r.run('returnsBalance()');
  assert.equal(rb.shortUnits, 2); assert.equal(rb.shortDocs, 1);
  assert.equal(tb.shortUnits, 0, 'הזיכוי על 344 ו-238 בא ב-142');
  assert.doesNotMatch(r.run('returnsBalanceBannerHtml()'), /חסר זיכוי/);
  // לא מציעים ולא מקזזים לבד את העודף של 4.10 (שכבר חויב ב-141) מול החוסר של 5.10
  assert.equal(r.run(`findOffsetMatch(receipts.find(x => x.id === '${R510}'))`), null);
  const pair = r.run('findAutoOffsetPair()');
  assert.ok(!pair || pair.productId !== 'code_1231');
  assert.doesNotMatch(c510, /קיזוז מזוהה/);
  assert.deepEqual(r.context.testWrites, [], 'שום תעודה לא נכתבה');
});

test('"כן, זה תיקון" — ההחזרה של 4.10 זוכתה בנייר 95142, ונייר החיוב נספר', () => {
  const corr = declared({ id: 'decl_corr_1', declare: 'correction', docDay: '2026-10-04', rows: [{ line: 1, itemCode: '100', productId: 'code_100', qty: 13 }], standsFor: { returnId: RET410, chargePaperId: L.papers.p141.id } });
  const r = app([L.papers.p141, L.papers.p142, corr]);
  const html = r.history();
  assert.equal(r.run(`returnStateNow(returns.find(x => x.id === '${RET410}'))`), 'done');
  assert.match(strip(r.card(html, /תעודת חזרות.*4\.10\.2026/)), /זוכתה — נייר 95142/);
  assert.match(strip(r.card(html, /נייר חיוב מהנהג/)), /נספר במאזן/);
  assert.doesNotMatch(html, /התשובה שלך/, 'התשובה עצמה אינה כרטיס');
});

const ret = (id, rows, credited = false) => ({ id, date: '2026-10-03', credited, timestamp: Date.parse('2026-10-03T08:00:00'), sentTo: 'הנהג',
  items: rows.map(([code, qty]) => ({ productId: 'code_' + code, code, name: (L.products.find(p => p.id === 'code_' + code) || {}).name || code, barcode: '', qty })) });
const creditPaper = (number, rows) => ({ schema: 1, state: 'accepted', id: 'paper_' + number, kind: 'credit', number, terminalNumber: number, docDay: '2026-10-04', printedTime: '10:00', timestamp: Date.parse('2026-10-04T10:00:00'),
  rows: rows.map(([code, qty], i) => ({ line: i + 1, itemCode: code, barcode: '', description: code, qty, productId: 'code_' + code, matchedBy: 'code' })),
  anchors: { units: rows.reduce((a, x) => a + x[1], 0), lines: rows.length, source: 'printed' }, proof: { unitsOk: true, linesOk: true } });

test('החזרה שתעודת הזיכוי שלה צולמה — "זוכתה" גם בלי "אישור", ולא בבאנר ההחזרות הפתוחות', () => {
  const R = ret('ret_t1', [['101', 2], ['344', 1]]);
  const r = app([creditPaper('290099001', [['101', 2], ['344', 1]])], { receipts: [], returns: [R] });
  assert.equal(r.run(`returnStateNow(returns[0])`), 'done');
  assert.equal(r.run('pendingReturnsBannerHtml()'), '');
  const html = r.history();
  assert.match(strip(r.card(html, /תעודת חזרות/)), /זוכתה — נייר 99001/);
  assert.doesNotMatch(strip(r.history('credit')), /תעודת חזרות/, 'לא ב"ממתינות לזיכוי"');
  assert.match(strip(r.history('done')), /תעודת חזרות/);
  assert.equal(r.run('returns[0].credited'), false, 'ההחזרה עצמה לא נכתבה');
  // ניירות משלימים בלבד שזיכו הכל — אותו "זוכתה", ובכרטיס: לסגירה — "אישור" (בלי "צלם את תעודת הזיכוי")
  const R3 = ret('ret_t3', [['101', 2], ['344', 1], ['238', 1], ['233', 1]]);
  const q = app([creditPaper('290099003', [['101', 2]]), creditPaper('290099004', [['344', 1]]), creditPaper('290099005', [['238', 1]]), creditPaper('290099006', [['233', 1]])].map((p, i) => ({ ...p, timestamp: p.timestamp + i })), { receipts: [], returns: [R3] });
  assert.equal(q.run(`returnStateNow(returns[0])`), 'done');
  const c3 = strip(q.card(q.history(), /תעודת חזרות/));
  assert.match(c3, /זוכתה — ניירות 99003, 99004, 99005, 99006[\s\S]*מהנהג זיכו את כל מה שהוחזר/);
  assert.doesNotMatch(c3, /תעודת הזיכוי — צלם/);
  // נייר משלים על שורה אחת מתוך שלוש — השאר עדיין ממתין לתעודת זיכוי
  const R2 = ret('ret_t2', [['101', 2], ['344', 1], ['238', 1]]);
  const s = app([creditPaper('290099002', [['238', 1]])], { receipts: [], returns: [R2] });
  assert.equal(s.run(`returnStateNow(returns[0])`), 'credit');
  assert.match(s.run('pendingReturnsBannerHtml()'), /פתוחה לאימות/);
  assert.match(strip(s.card(s.history(), /תעודת חזרות/)), /ממתינה לתעודת זיכוי[\s\S]*ממתינה לתעודת זיכוי/);
  assert.match(strip(s.card(s.history(), /נייר זיכוי מהנהג/)), /נספר במאזן[\s\S]*זיכוי משלים להחזרה מ-3\.10/);
});

test('תעודת משלוח שצולמה ועוד לא נקלטה — כרטיס בלי כמויות, עם "לקליטה"; אחרי הקליטה — רק כרטיס הקליטה', () => {
  const del = { schema: 1, state: 'accepted', id: 'paper_244799999', kind: 'delivery', number: '244799999', docDay: '2026-10-05', timestamp: Date.parse('2026-10-05T09:00:00'),
    rows: [{ line: 1, itemCode: '101', productId: 'code_101', qty: 7 }, { line: 2, itemCode: '344', productId: 'code_344', qty: 3 }], anchors: { units: 10, lines: 2, source: 'printed' } };
  const r = app([del], { receipts: [], returns: [] });
  const card = r.card(r.history(), /תעודת משלוח מהנהג/);
  assert.match(strip(card), /ממתינה לקליטה[\s\S]*244799999[\s\S]*צולמה/);
  assert.doesNotMatch(strip(card), /יח׳/, 'הספירה עיוורת — בלי כמויות');
  assert.match(card, /data-role="ledger-start-receiving" data-paper="paper_244799999"/);
  assert.match(strip(r.history('open')), /תעודת משלוח מהנהג/);
  const rc = { id: 'receipt_t', date: '2026-10-05', timestamp: Date.parse('2026-10-05T10:00:00'), noteParts: [{ number: '244799999', units: 10, lines: 2 }],
    items: [{ productId: 'code_101', name: 'x', qty: 7, noteQty: 7 }, { productId: 'code_344', name: 'y', qty: 3, noteQty: 3 }] };
  const s = app([del], { receipts: [rc], returns: [] });
  assert.doesNotMatch(s.history(), /תעודת משלוח מהנהג/);
});

test('"פרטים" מכרטיס בהיסטוריה — "חזרה" ו"אשר" חוזרים להיסטוריה', async () => {
  const r = app([L.papers.p141, L.papers.p142]);
  r.history();
  await r.run(`openPaperReview('paper_290095142')`);
  assert.equal(r.run('currentView'), 'paperReview');
  assert.match(r.node('app').innerHTML, /data-role="review-back"/);
  r.run(`paperUiClick({ dataset: { role: 'review-back' } })`);
  assert.equal(r.run('currentView'), 'receiptsHistory');
  await r.run(`openPaperReview('paper_290095142')`);
  await r.run('savePaperReview()');
  assert.equal(r.run('currentView'), 'receiptsHistory', '"אשר את הנייר" — חזרה להיסטוריה');
  // מהמאזן — חוזרים למאזן
  r.run(`setView('ledger')`);
  await r.run(`openPaperReview('paper_290095142')`);
  r.run(`paperUiClick({ dataset: { role: 'review-back' } })`);
  assert.equal(r.run('currentView'), 'ledger');
});
