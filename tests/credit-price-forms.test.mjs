import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, fixture } from './receipt-scan-harness.mjs';

// v116: אימות זיכוי — עיגול לפי שורה כמו ברמן, ומחיר המבצע כצורת מחיר לשורה.
// הנתונים סינתטיים (fixture.json): אותם קודים ומחירים כמו במאגר, בלי נתוני לקוח.
const { products } = fixture();
const r2 = n => Math.round(n * 100) / 100;
const product = code => products.find(p => p.code === String(code));
// שורת החזרה כפי שהיא נשלחת מ-v116: מחיר מדויק, ולצידו המחיר שנשלח
function line(code, qty, extra) {
  const p = product(code);
  return { name: p.name, barcode: p.barcode, code: p.code, productId: p.id, qty,
    unitPrice: p.price, sentUnitPrice: p.price, lineTotal: r2(qty * p.price), ...(extra || {}) };
}
// השורה כפי שברמן מחשבים אותה: מחיר × כמות, עיגול פעם אחת
const berman = (unit, qty) => r2(unit * qty);
const sum = arr => r2(arr.reduce((a, b) => a + b, 0));
function doc(items, date, extra) {
  return { id: 'test-return', date, docDate: date, timestamp: Date.UTC(2026, 9, 4), vatPct: 18, returnKind: 'weekly',
    credited: false, items, totalExVat: sum(items.map(l => l.lineTotal)), ...(extra || {}) };
}
function open(d, preset, before) {
  const rt = runtime();
  rt.context.testReturn = structuredClone(d);
  if (before) rt.run(before);
  rt.run(`returns = [testReturn]; receipts = []; receiptHistoryFilter = 'all'; currentView = 'receiptsHistory';
    openReturnVerify('test-return', ${preset == null ? 'null' : preset});`);
  return rt;
}
const state = rt => JSON.parse(rt.run('JSON.stringify(returnVerify)'));
const summary = rt => JSON.parse(rt.run('JSON.stringify(rvCreditSummary())'));
const solution = rt => JSON.parse(rt.run('JSON.stringify(solveCreditPriceForms())'));
const row = (rt, i) => rt.run(`rvRowHtml(returnVerify.items[${i}], ${i})`);
// הסיכום נבנה מחדש בכל רענון — קוראים את הפונקציה עצמה ולא את הצומת, שאינו מתעדכן אחרי ציור מלא
const summaryHtml = rt => rt.run('rvSummaryHtml()');
async function checkAll(rt) {
  const n = state(rt).items.length;
  for (let i = 0; i < n; i++) if (!state(rt).items[i].checked) await rt.click('rv-check', String(i));
}
async function saveClick(rt) { await rt.click('rv-save'); await rt.run('Promise.resolve()'); }
function typePrice(rt, idx, value) {
  const field = { dataset: { role: 'rv-price', id: String(idx) }, value, getAttribute: key => key === 'data-role' ? 'rv-price' : null };
  rt.events.get('app:input')({ target: field });
}

test('כל שורה מעוגלת בנפרד כמו אצל ברמן — תעודה שסגרה אצל הספק נסגרת גם כאן, בלי פערי אגורות', async () => {
  // 7 × 5.7408 = 40.1856 → 40.19 אצל ברמן; עד v115 האפליקציה עיגלה קודם ל-5.74 וקיבלה 40.18
  const items = [line(101, 7), line(349, 5), line(458, 2), line(2387, 3), line(238, 4)];
  const paper = sum(items.map(l => berman(l.unitPrice, l.qty)));
  const oldWay = sum(items.map(l => r2(l.qty * r2(l.unitPrice))));
  assert.equal(paper, 162.19);
  assert.equal(oldWay, 162.17, 'the pre-v116 arithmetic was two agorot short');
  const rt = open(doc(items, '2026-09-20'), paper);
  assert.equal(summary(rt).creditedEx, 162.19);
  assert.equal(summary(rt).gap, 0);
  assert.match(summaryHtml(rt), /סכום התעודה תואם לכמויות הזיכוי/);
  assert.match(summaryHtml(rt), /כל שורה מעוגלת בנפרד/);
  assert.match(row(rt, 0), /שורה ₪40.19/);
  await checkAll(rt);
  await saveClick(rt);
  assert.equal(rt.node('confirmTitle').textContent, '');
  const saved = rt.writes[0].data;
  assert.equal(saved.creditStatus, 'ok');
  assert.equal(saved.totalExVat, 162.19);
  assert.equal(saved.items[0].unitPrice, 5.7408, 'the exact price is kept, not rounded away');
  assert.equal(saved.items[0].lineTotal, 40.19);
  assert.equal(Object.hasOwn(saved.items[0], 'priceForm'), false);
  assert.equal(Object.hasOwn(saved.items[0], 'promoOnPaper'), false);
});

test('תעודה שנשמרה לפני v116 עם מחירים מעוגלים חוזרת לדיוק המלא — רק לפי מזהה או ברקוד, ורק כשהאגורות תואמות', () => {
  const items = [
    { name: 'אחיד פרוס ברמן', barcode: '497112', productId: 'code_101', qty: 13, unitPrice: 5.74, lineTotal: 74.62 },
    { name: 'חלומית ארוזה ברמן', barcode: '497358', qty: 2, unitPrice: 10.41, lineTotal: 20.82 },
    { name: 'לחם מקמח כוסמין E-FREE', barcode: 'no-such-barcode', productId: 'no-such-product', qty: 1, unitPrice: 12.31, lineTotal: 12.31 },
    { name: 'אחיד פרוס ברמן', barcode: '497112', productId: 'code_101', qty: 1, unitPrice: 5.65, lineTotal: 5.65 },
    { name: 'לחמניות 10 בשקית', barcode: '498256', productId: 'code_1231', qty: 1, unitPrice: 8.5, lineTotal: 8.5, priceForm: 'promo_on_paper', sentUnitPrice: 10.399818 },
  ];
  const rt = open(doc(items, '2026-10-04'), null);
  const s = state(rt);
  assert.equal(s.items[0].unitPrice, 5.7408, 'productId match: 5.74 is the rounded 5.7408');
  assert.equal(s.items[0].sentUnitPrice, 5.7408);
  assert.equal(s.items[1].unitPrice, product(458).price, 'barcode match');
  assert.equal(s.items[2].unitPrice, 12.31, 'a name-only match is not evidence');
  assert.equal(Object.hasOwn(s.items[2], 'sentUnitPrice'), false);
  assert.equal(s.items[3].unitPrice, 5.65, 'a price that differs by agorot was chosen on purpose');
  assert.equal(Object.hasOwn(s.items[3], 'sentUnitPrice'), false);
  assert.equal(s.items[4].unitPrice, 8.5, 'a line already credited at the promo price keeps it');
  assert.match(row(rt, 4), /data-role="rv-form-promo" data-id="4" aria-pressed="true"/);
  assert.match(row(rt, 4), /מחיר רגיל ₪10.40/);
  assert.equal(summary(rt).creditedEx, sum([74.63, 20.81, 12.31, 5.65, 8.5]));
});

test('הספק זיכה במחיר המבצע: הצירוף היחיד שסוגר את הנייר מוחל מעצמו, נרשם על השורה, ואין קיזוז כפול במרכזת', async () => {
  const items = [line(1231, 1), line(3701, 2), line(101, 7)];
  const regular = sum([10.40, 23, 40.19]);
  const paper = sum([8.5, 23, 40.19]);
  assert.equal(regular, 73.59); assert.equal(paper, 71.69);
  const rt = open(doc(items, '2026-10-04'), paper);
  const s = state(rt);
  assert.equal(s.items[0].unitPrice, 8.5);
  assert.equal(s.items[0].sentUnitPrice, 10.399818, 'the regular price is remembered for the way back');
  assert.deepEqual(s.autoForms, [0]);
  assert.equal(summary(rt).creditedEx, 71.69);
  assert.equal(summary(rt).gap, 0);
  const html = summaryHtml(rt);
  assert.match(html, /מבצע בתעודה/);
  assert.match(html, /הוחל מעצמו/);
  assert.match(html, /לחמניות 10 בשקית · 1 יח׳ · ₪8.50 במקום ₪10.40/);
  assert.match(html, /−₪1.90/);
  assert.doesNotMatch(html, /הסבר אפשרי לפער/);
  assert.match(row(rt, 0), /data-role="rv-form-promo" data-id="0" aria-pressed="true"/);
  assert.match(row(rt, 0), /data-role="rv-form-regular" data-id="0" aria-pressed="false"/);
  assert.doesNotMatch(row(rt, 1), /rv-form-promo/, 'a product without an active fixed promo has no chips');
  assert.equal(rt.run('rvSaveLabel()'), 'שמור אימות');
  await checkAll(rt);
  await saveClick(rt);
  assert.equal(rt.node('confirmTitle').textContent, '');
  const saved = rt.writes[0].data;
  assert.equal(saved.creditStatus, 'ok');
  assert.equal(saved.totalExVat, 71.69);
  assert.equal(saved.items[0].unitPrice, 8.5);
  assert.equal(saved.items[0].lineTotal, 8.5);
  assert.equal(saved.items[0].priceForm, 'promo_on_paper');
  assert.equal(saved.items[0].sentUnitPrice, 10.399818);
  assert.equal(saved.items[0].promoOnPaper.expectedNet, 10.4);
  assert.equal(saved.items[0].promoOnPaper.promoFixedPrice, 8.5);
  assert.match(saved.items[0].promoOnPaper.promoName, /לחמניות 10 בשקית/);
  assert.equal(Object.hasOwn(saved.items[1], 'priceForm'), false);
  assert.equal(saved.items[2].unitPrice, 5.7408);
  assert.equal(rt.run('returnsDiscrepancyInfo(returns[0]).open'), false);
  assert.match(rt.run('returnCardInReceipts(returns[0])'), /מבצע בתעודה/);
  // v118: המרכזת מתמחרת את הזיכוי ממחיר הלקוח ומבצע המרכזת של אותו יום (₪8.50),
  // ולא ממחיר השורה — ולכן המחיר שנשמר על השורה אינו משנה את החודש
  const monthRow = () => rt.run("receiptRangeData('2026-10-01', '2026-10-31').matrix.list.find(r => r.code === '1231').amount");
  assert.equal(monthRow(), -8.5);
  rt.run('returns[0].items[0].unitPrice = 10.399818');
  assert.equal(monthRow(), -8.5);
  // פתיחה מחדש: השורה נשארת במחיר המבצע, והצ'יפ מסומן
  rt.run('returns[0].items[0].unitPrice = 8.5; openReturnVerify("test-return")');
  assert.equal(state(rt).items[0].unitPrice, 8.5);
  assert.match(row(rt, 0), /rv-form-promo" data-id="0" aria-pressed="true"/);
});

test('התרחיש של 4.10.2026: הסבר חלקי מוצע רק אחרי שכל השורות נבדקו, ומה שאינו מחיר מבצע נשאר פער פתוח', async () => {
  // 13 × אחיד פרוס זוכו כקוד 100 (₪5.65) — החלפת מוצר אצל הספק, לא צורת מחיר;
  // לחמניות 10 בשקית זוכו במחיר המבצע ₪8.50; ארבעה מוצרים לא זוכו כלל.
  const items = [line(101, 13), line(3701, 2), line(1231, 1), line(1220, 1), line(349, 5), line(458, 2), line(2387, 3), line(2381, 1), line(333, 1),
    line(238, 1), line(119, 1), line(339, 3), line(344, 2)];
  const paper = sum([berman(5.65, 13), 23, 8.5, 14.28, 49.42, 20.81, 32.12, 9.65, 12.05]);
  assert.equal(paper, 243.28);
  const rt = open(doc(items, '2026-10-04'), paper);
  // לפני בדיקת הכמויות: הפער ענק, הפותר לא מחיל כלום ולא מציע כלום
  assert.equal(summary(rt).gap, r2(243.28 - 319.27));
  assert.equal(state(rt).items[2].unitPrice, 10.399818);
  assert.equal(solution(rt).kind, 'partial');
  assert.deepEqual(solution(rt).ids, [2, 11], 'both promo products would lower the sum, but nothing is shown yet');
  assert.doesNotMatch(summaryHtml(rt), /הסבר אפשרי לפער|מבצע בתעודה/);
  for (const i of [9, 10, 11, 12]) await rt.click('rv-not-credited', String(i));
  assert.equal(summary(rt).gap, -3.08);
  assert.deepEqual(solution(rt).ids, [2], 'a product marked not credited is no longer a price-form candidate');
  assert.doesNotMatch(summaryHtml(rt), /הסבר אפשרי לפער/, 'rows still unchecked');
  await checkAll(rt);
  let html = summaryHtml(rt);
  assert.match(html, /הסבר אפשרי לפער/);
  assert.match(html, /לחמניות 10 בשקית · 1 יח׳ במחיר המבצע ₪8.50 \(−₪1.90\)/);
  assert.match(html, /יישאר פער ₪1.18 שאינו מוסבר במחירי מבצע/);
  assert.match(html, /data-role="rv-apply-forms"/);
  // שמירה לפני ההחלה: הדיאלוג מזכיר את ההצעה
  await saveClick(rt);
  assert.equal(rt.writes.length, 0);
  assert.equal(rt.node('confirmTitle').textContent, 'נותר פער בסכום');
  assert.match(rt.node('confirmMsg').textContent, /3.08/);
  assert.match(rt.node('confirmMsg').textContent, /ייתכן שחלק מהפער הוא מחיר מבצע/);
  await rt.click('rv-apply-forms');
  assert.equal(state(rt).items[2].unitPrice, 8.5);
  assert.equal(state(rt).items[0].unitPrice, 5.7408, 'the substituted bread line is never re-priced by the solver');
  assert.equal(summary(rt).gap, -1.18);
  html = summaryHtml(rt);
  assert.match(html, /מבצע בתעודה/);
  assert.doesNotMatch(html, /הוחל מעצמו/);
  assert.doesNotMatch(html, /הסבר אפשרי לפער/);
  assert.match(html, /פער נוסף בסכום/);
  assert.equal(rt.run('rvSaveLabel()'), 'שמור חוסר בזיכוי');
  await saveClick(rt);
  assert.equal(rt.node('confirmTitle').textContent, 'נותר פער בסכום');
  assert.match(rt.node('confirmMsg').textContent, /1.18/);
  assert.doesNotMatch(rt.node('confirmMsg').textContent, /3.0|ייתכן שחלק מהפער/);
  await rt.run('saveReturnVerify({ skipChecked: true, skipGap: true })');
  const saved = rt.writes[0].data;
  assert.equal(saved.creditStatus, 'open');
  assert.equal(saved.items[2].priceForm, 'promo_on_paper');
  assert.equal(saved.items[2].lineTotal, 8.5);
  assert.equal(saved.items[11].noteQty, 0);
  assert.equal(saved.totalExVat, r2(319.27 - 1.9));
  assert.equal(rt.run('returnsDiscrepancyInfo(returns[0]).owed'), r2(317.37 - 243.28));
  assert.equal(rt.run('returnsDiscrepancyInfo(returns[0]).shortItems.length'), 4);
});

test('מבצע פעיל אבל הספק זיכה במחיר הרגיל — שום דבר לא זז', async () => {
  const items = [line(339, 3), line(3701, 2)];
  const rt = open(doc(items, '2026-10-04'), sum([36.14, 23]));
  assert.equal(solution(rt).kind, 'none');
  assert.equal(state(rt).items[0].unitPrice, 12.047);
  assert.equal(summary(rt).gap, 0);
  assert.doesNotMatch(summaryHtml(rt), /מבצע בתעודה|הסבר אפשרי/);
  assert.match(row(rt, 0), /rv-form-regular" data-id="0" aria-pressed="true"/);
  assert.match(row(rt, 0), /מבצע חודשי ₪10.00/);
  await checkAll(rt); await saveClick(rt);
  assert.equal(rt.writes[0].data.creditStatus, 'ok');
  assert.equal(Object.hasOwn(rt.writes[0].data.items[0], 'priceForm'), false);
});

test('מבצע שאינו בתוקף בתאריך הנייר אינו מועמד — הפער נשאר פער', async () => {
  const items = [line(1231, 1), line(3701, 2)];
  const rt = open(doc(items, '2026-11-05'), sum([8.5, 23]));
  assert.equal(solution(rt), null);
  assert.equal(state(rt).items[0].unitPrice, 10.399818);
  assert.equal(summary(rt).gap, -1.9);
  assert.doesNotMatch(row(rt, 0), /rv-form-promo/);
  await checkAll(rt);
  assert.doesNotMatch(summaryHtml(rt), /הסבר אפשרי/);
  await saveClick(rt);
  assert.equal(rt.node('confirmTitle').textContent, 'נותר פער בסכום');
  assert.match(rt.node('confirmMsg').textContent, /1.90/);
  assert.doesNotMatch(rt.node('confirmMsg').textContent, /ייתכן שחלק מהפער/);
});

test('שני מוצרים עם אותו חיסכון: לא מנחשים — המשתמש בוחר בשורה, והסכום נסגר', async () => {
  const items = [line(1231, 1), line(3604, 1), line(3701, 2)];
  const paper = r2(sum([10.40, 9.03, 23]) - 1.9);
  const before = "promos.push({ id: 'test-promo', name: 'פרנה — מבצע', fixedPrice: 7.13, pct: 0, start: '2026-09-01', end: '2026-10-31', productIds: ['code_3604'], type: 'receipt' });";
  const rt = open(doc(items, '2026-10-04'), paper, before);
  assert.equal(solution(rt).kind, 'ambiguous');
  assert.equal(state(rt).items[0].unitPrice, 10.399818);
  assert.equal(state(rt).items[1].unitPrice, 9.03);
  assert.doesNotMatch(summaryHtml(rt), /יותר מצירוף אחד/, 'only after the rows are reviewed');
  await checkAll(rt);
  assert.match(summaryHtml(rt), /יותר מצירוף אחד של מחירי מבצע/);
  assert.doesNotMatch(summaryHtml(rt), /rv-apply-forms/);
  await rt.click('rv-form-promo', '1');
  assert.equal(state(rt).items[1].unitPrice, 7.13);
  assert.equal(summary(rt).gap, 0);
  assert.match(summaryHtml(rt), /מבצע בתעודה/);
  assert.doesNotMatch(summaryHtml(rt), /הוחל מעצמו|יותר מצירוף אחד/);
  await saveClick(rt);
  const saved = rt.writes[0].data;
  assert.equal(saved.creditStatus, 'ok');
  assert.equal(saved.items[1].priceForm, 'promo_on_paper');
  assert.equal(Object.hasOwn(saved.items[0], 'priceForm'), false);
});

test('חזרה למחיר הרגיל משחזרת את המחיר המדויק שנשלח ומוחקת את תיעוד המבצע בשמירה', async () => {
  const items = [line(1231, 1), line(3701, 2), line(101, 7)];
  const rt = open(doc(items, '2026-10-04'), 71.69);
  assert.equal(state(rt).items[0].unitPrice, 8.5);
  await rt.click('rv-form-regular', '0');
  assert.equal(state(rt).items[0].unitPrice, 10.399818);
  assert.equal(summary(rt).gap, -1.9);
  assert.equal(state(rt).autoForms, null);
  let html = summaryHtml(rt);
  assert.doesNotMatch(html, /מבצע בתעודה/);
  assert.match(html, /הסבר אפשרי לפער/);
  assert.match(html, /סוגר את סכום התעודה/);
  await rt.click('rv-apply-forms');
  assert.equal(state(rt).items[0].unitPrice, 8.5);
  assert.doesNotMatch(summaryHtml(rt), /הוחל מעצמו/);
  await rt.click('rv-form-regular', '0');
  await checkAll(rt);
  await rt.run('saveReturnVerify({ skipGap: true })');
  const saved = rt.writes[0].data;
  assert.equal(saved.creditStatus, 'open');
  assert.equal(saved.items[0].unitPrice, 10.399818);
  assert.equal(saved.items[0].sentUnitPrice, 10.399818);
  assert.equal(Object.hasOwn(saved.items[0], 'priceForm'), false);
  assert.equal(Object.hasOwn(saved.items[0], 'promoOnPaper'), false);
});

test('מחיר שהוקלד ידנית נשאר ידני: הפותר לא נוגע בו, והוא נשמר עד 4 ספרות', async () => {
  const items = [line(1231, 1), line(3701, 2), line(101, 7)];
  const rt = open(doc(items, '2026-10-04'), 71.69);
  typePrice(rt, 0, '9.125');
  assert.equal(state(rt).items[0].unitPrice, 9.125);
  assert.match(row(rt, 0), /מחיר ידני/);
  assert.equal(rt.run('rvFormCandidates().length'), 0);
  assert.equal(solution(rt), null);
  await checkAll(rt);
  assert.doesNotMatch(summaryHtml(rt), /הסבר אפשרי|מבצע בתעודה/);
  await rt.run('saveReturnVerify({ skipGap: true })');
  const saved = rt.writes[0].data;
  assert.equal(saved.items[0].unitPrice, 9.125);
  assert.equal(saved.items[0].lineTotal, 9.13);
  assert.equal(saved.items[0].priceForm, 'manual');
  assert.equal(Object.hasOwn(saved.items[0], 'promoOnPaper'), false);
  assert.equal(saved.items[0].sentUnitPrice, 10.399818);
});

test('שורות פיקדון ושורות שהועברו מפער אינן צורות מחיר; "לא זוכה" מוריד מוצר מרשימת המועמדים', async () => {
  const items = [line(1231, 2),
    { name: 'פיקדון · משהו', barcode: '', qty: 2, unitPrice: 1.2, lineTotal: 2.4, isDeposit: true },
    { name: 'פיתות כוסמין 10 בשקית', barcode: '4685478', productId: 'carry_1', qty: 1, unitPrice: 4.5, lineTotal: 4.5, manual: true, carried: true, carriedFrom: 'older' }];
  const rt = open(doc(items, '2026-10-04'), sum([17, 2.4, 4.5]));
  assert.equal(state(rt).items[0].unitPrice, 8.5, 'auto-applied: 2 × 8.50 closes the paper');
  assert.equal(summary(rt).gap, 0);
  assert.doesNotMatch(row(rt, 1), /rv-form-/);
  assert.doesNotMatch(row(rt, 2), /rv-form-/);
  await rt.click('rv-not-credited', '0');
  assert.equal(rt.run('rvFormCandidates().length'), 0);
  assert.equal(summary(rt).gap, 17);
  assert.equal(state(rt).items[0].unitPrice, 10.399818, 'not credited: back to the regular price');
  assert.deepEqual(summary(rt).shortItems, [{ name: 'לחמניות 10 בשקית', qty: 2, total: 20.8 }], 'the claim is valued at the regular price');
  await checkAll(rt);
  await rt.run('saveReturnVerify({ skipGap: true })');
  const saved = rt.writes[0].data;
  assert.equal(saved.items[1].isDeposit, true);
  assert.equal(saved.items[1].unitPrice, 1.2);
  assert.equal(saved.items[2].carried, true);
  assert.equal(saved.items[2].unitPrice, 4.5);
  assert.equal(Object.hasOwn(saved.items[2], 'priceForm'), false);
});

test('עורך הפריטים שומר על הדיוק ועל צורת המחיר כל עוד השורה לא נגעה', async () => {
  const items = [line(1231, 1), line(3701, 2), line(101, 7)];
  const rt = open(doc(items, '2026-10-04'), 71.69);
  await checkAll(rt); await saveClick(rt);
  rt.run("openReturnItemsEdit('test-return')");
  assert.equal(rt.run('returnEdit.items[2].unitPrice'), 5.7408);
  assert.equal(rt.run('retEditEx()'), 71.69);
  await rt.run('saveReturnItemsEdit()');
  let saved = rt.writes[1].data;
  assert.equal(saved.items[0].unitPrice, 8.5);
  assert.equal(saved.items[0].priceForm, 'promo_on_paper');
  assert.equal(saved.items[0].sentUnitPrice, 10.399818);
  assert.equal(saved.items[0].promoOnPaper.promoFixedPrice, 8.5);
  assert.equal(saved.items[2].unitPrice, 5.7408);
  assert.equal(saved.items[2].lineTotal, 40.19);
  assert.equal(saved.totalExVat, 71.69);
  assert.equal(saved.creditStatus, 'ok');
  rt.run("openReturnItemsEdit('test-return'); retEditSetPriceLive(0, '9.9')");
  await rt.run('saveReturnItemsEdit()');
  saved = rt.writes[2].data;
  assert.equal(saved.items[0].unitPrice, 9.9);
  assert.equal(Object.hasOwn(saved.items[0], 'priceForm'), false, 'a changed price no longer describes the promo form');
  assert.equal(Object.hasOwn(saved.items[0], 'promoOnPaper'), false);
  assert.equal(saved.creditStatus, 'open');
});

test('תעודת חזרה שנשלחת עכשיו נושאת על כל שורה את המחיר המדויק שנשלח ואת המחירון שמאחוריו', () => {
  const rt = runtime();
  rt.run(`returns = []; returnsList = []; returnsSlots = { weekly: returnsList, daily: [] }; returnsSlot = 'weekly'; returnsDocDate = '2026-10-04';
    returnsList.push({ productId: 'code_1231', name: 'לחמניות 10 בשקית', barcode: '498256', qty: 1 });
    returnsList.push({ productId: 'carry_x', name: 'ידני', barcode: '', qty: 1, unitPrice: 4.5, manual: true, carried: true, carriedFrom: 'older' });
    openReturnsSend();`);
  const sent = JSON.parse(rt.run('JSON.stringify(sendCtx.items)'));
  assert.equal(sent[0].unitPrice, 10.399818, 'a return is claimed at the regular price; the promo form is decided against the credit note');
  assert.equal(sent[0].sentUnitPrice, 10.399818);
  assert.equal(sent[0].listPrice, 20.46);
  assert.equal(sent[0].discountPct, 49.17);
  assert.equal(sent[0].lineTotal, 10.4);
  assert.equal(Object.hasOwn(sent[1], 'sentUnitPrice'), false, 'a manual line has no catalog price behind it');
  assert.equal(sent[1].unitPrice, 4.5);
});

// ===== השלמות אחרי הסקירה =====

test('חוסר שהוחזר לרשימת החזרות נתבע במחיר המדויק — החוב נסגר לאגורה והתעודה הבאה נושאת אותו מחיר', async () => {
  const items = [line(101, 13), line(3701, 2)];
  const rt = open(doc(items, '2026-10-04'), 23, "returnsList = []; returnsSlots = { weekly: returnsList, daily: [] }; returnsSlot = 'weekly';");
  await rt.click('rv-not-credited', '0');
  await checkAll(rt);
  assert.equal(summary(rt).gap, 0);
  await saveClick(rt);
  assert.equal(rt.writes[0].data.creditStatus, 'open');
  assert.equal(rt.run('returnsDiscrepancyInfo(returns[0]).shortVal'), 74.63);
  assert.equal(rt.run('returnsDiscrepancyInfo(returns[0]).owed'), 74.63);
  const plan = JSON.parse(rt.run('JSON.stringify(retCarryPlan(returns[0]))'));
  assert.equal(plan.items[0].price, 5.7408);
  assert.equal(plan.val, 74.63);
  await rt.run("saveReturnCarry('test-return', retCarryPlan(returns[0]))");
  assert.equal(rt.run('returnsDiscrepancyInfo(returns[0]).owed'), 0);
  assert.equal(rt.run('returnsBalance().bal'), 0);
  assert.equal(rt.run('returnsList[0].unitPrice'), 5.7408);
  assert.equal(rt.run('returnsList[0].carried'), true);
  const sent = JSON.parse(rt.run('openReturnsSend(); JSON.stringify(sendCtx.items)'));
  assert.equal(sent[0].unitPrice, 5.7408);
  assert.equal(sent[0].lineTotal, 74.63);
  assert.equal(sent[0].carried, true);
  // שורה מועברת שנייה באותו מחיר מתאחדת לשורה אחת
  await rt.run("saveReturnCarry('test-return', { items: [{ name: 'אחיד פרוס ברמן', barcode: '497112', qty: 1, price: 5.7408, amountOnly: false }], val: 5.74 })");
  assert.equal(rt.run('returnsList.length'), 1);
  assert.equal(rt.run('returnsList[0].qty'), 14);
});

test('"לא זוכה" על שורה שעמדה על מחיר המבצע מחזיר אותה למחיר הרגיל — החוסר נתבע במחיר המלא ואין "מבצע בתעודה"', async () => {
  const items = [line(1231, 1), line(3701, 2), line(101, 7)];
  const rt = open(doc(items, '2026-10-04'), 71.69);
  assert.equal(state(rt).items[0].unitPrice, 8.5);
  await rt.click('rv-not-credited', '0');
  assert.equal(state(rt).items[0].unitPrice, 10.399818);
  assert.doesNotMatch(row(rt, 0), /rv-form-/);
  assert.deepEqual(summary(rt).shortItems, [{ name: 'לחמניות 10 בשקית', qty: 1, total: 10.4 }]);
  assert.doesNotMatch(summaryHtml(rt), /מבצע בתעודה/);
  await checkAll(rt);
  await rt.run('saveReturnVerify({ skipGap: true })');
  const saved = rt.writes[0].data;
  assert.equal(saved.items[0].unitPrice, 10.399818);
  assert.equal(saved.items[0].noteQty, 0);
  assert.equal(Object.hasOwn(saved.items[0], 'priceForm'), false);
  assert.equal(Object.hasOwn(saved.items[0], 'promoOnPaper'), false);
  // גם דרך כפתור המינוס
  const rt2 = open(doc(items, '2026-10-04'), 71.69);
  await rt2.click('rv-minus', '0');
  assert.equal(state(rt2).items[0].noteQty, 0);
  assert.equal(state(rt2).items[0].unitPrice, 10.399818);
  await rt2.click('rv-plus', '0');
  assert.match(row(rt2, 0), /rv-form-regular" data-id="0" aria-pressed="true"/, 'back to one unit: chips return, at the regular price');
});

test('שורה שנשמרה לפני v116 כבר במחיר המבצע (בלי דגל) מזוהה כצורת מחיר: צ\'יפ מבצע, מחיר רגיל משוחזר, ותיעוד בשמירה', async () => {
  const items = [{ name: 'לחמניות 10 בשקית', barcode: '498256', code: '1231', productId: 'code_1231', qty: 1, unitPrice: 8.5, lineTotal: 8.5 }, line(3701, 2)];
  const rt = open(doc(items, '2026-10-04'), 31.5);
  const s = state(rt);
  assert.equal(s.items[0].unitPrice, 8.5, 'the stored promo price is not overwritten at open');
  assert.equal(s.items[0].sentUnitPrice, 10.399818, 'the regular price comes from the catalog');
  assert.match(row(rt, 0), /rv-form-promo" data-id="0" aria-pressed="true"/);
  assert.match(summaryHtml(rt), /מבצע בתעודה/);
  assert.equal(summary(rt).gap, 0);
  await checkAll(rt); await saveClick(rt);
  const saved = rt.writes[0].data;
  assert.equal(saved.creditStatus, 'ok');
  assert.equal(saved.items[0].priceForm, 'promo_on_paper');
  assert.equal(saved.items[0].promoOnPaper.expectedNet, 10.4);
  assert.equal(saved.items[0].sentUnitPrice, 10.399818);
});

test('שורה שמורה במחיר המבצע כשהנייר מתאים דווקא למחיר הרגיל: ההצעה היא לחזור לרגיל, והיא סוגרת', async () => {
  const items = [line(1231, 1, { unitPrice: 8.5, lineTotal: 8.5, priceForm: 'promo_on_paper' }), line(3701, 2)];
  const rt = open(doc(items, '2026-10-04'), 33.4);
  const sol = solution(rt);
  assert.equal(sol.kind, 'close');
  assert.equal(sol.applied, false);
  assert.deepEqual(sol.ids, []);
  assert.equal(sol.revertLines.length, 1);
  assert.equal(summary(rt).gap, 1.9);
  const html = summaryHtml(rt);
  assert.match(html, /הסבר אפשרי לפער/);
  assert.match(html, /לחמניות 10 בשקית · 1 יח׳ חזרה למחיר הרגיל ₪10.40 \(\+₪1.90\) — סוגר את סכום התעודה/);
  assert.match(html, /חזור למחיר הרגיל/);
  await rt.click('rv-apply-forms');
  assert.equal(state(rt).items[0].unitPrice, 10.399818);
  assert.equal(summary(rt).gap, 0);
  await checkAll(rt); await saveClick(rt);
  assert.equal(rt.writes[0].data.creditStatus, 'ok');
  assert.equal(Object.hasOwn(rt.writes[0].data.items[0], 'priceForm'), false);
});

test('מחיר שהוקלד קרוב למחיר המבצע באגורה הוא "ידני"; בדיוק מחיר המבצע הוא "מבצע"', async () => {
  const items = [line(1231, 1), line(3701, 2), line(101, 7)];
  const rt = open(doc(items, '2026-10-04'), 71.69);
  typePrice(rt, 0, '8.504');
  assert.equal(rt.run('rvLineForm(returnVerify.items[0], rvLineForms(returnVerify.items[0], returnVerify.day))'), 'manual');
  await checkAll(rt);
  await rt.run('saveReturnVerify({ skipGap: true })');
  assert.equal(rt.writes[0].data.items[0].priceForm, 'manual');
  assert.equal(Object.hasOwn(rt.writes[0].data.items[0], 'promoOnPaper'), false);
  rt.run("openReturnVerify('test-return')");
  assert.equal(state(rt).items[0].unitPrice, 8.504);
  typePrice(rt, 0, '8.50');
  assert.match(rt.node('rvForms_0').innerHTML, /rv-form-promo" data-id="0" aria-pressed="true"/, 'chips refresh while typing');
  assert.equal(rt.node('rvLineTot_0').textContent, 'שורה ₪8.50');
  await checkAll(rt);
  await rt.run('saveReturnVerify({ skipGap: true })');
  assert.equal(rt.writes[1].data.items[0].priceForm, 'promo_on_paper');
});

test('מבצע שהחיסכון שלו אינו גדול מהסיבולת אינו מועמד — ולא חוסם הכרעה אוטומטית של מבצע אמיתי', async () => {
  const items = [line(1231, 1), line(3604, 1), line(3701, 2)];
  const before = "promos.push({ id: 'tiny', name: 'פרנה — אגורות', fixedPrice: 9.01, pct: 0, start: '2026-09-01', end: '2026-10-31', productIds: ['code_3604'], type: 'receipt' });";
  const rt = open(doc(items, '2026-10-04'), sum([8.5, 9.03, 23]), before);
  assert.deepEqual(state(rt).autoForms, [0]);
  assert.equal(state(rt).items[0].unitPrice, 8.5);
  assert.equal(state(rt).items[1].unitPrice, 9.03);
  assert.equal(rt.run('rvFormCandidates().length'), 1);
  assert.match(row(rt, 1), /מבצע חודשי ₪9.01/, 'the chip is still offered for a manual decision');
});

test('מבצע שנמחק מהמאגר אחרי האימות: התיעוד על השורה נשאר בשמירה חוזרת', async () => {
  const items = [line(1231, 1), line(3701, 2), line(101, 7)];
  const rt = open(doc(items, '2026-10-04'), 71.69);
  await checkAll(rt); await saveClick(rt);
  rt.run("promos = promos.filter(p => !(p.productIds || []).includes('code_1231')); openReturnVerify('test-return')");
  assert.equal(state(rt).items[0].unitPrice, 8.5);
  assert.doesNotMatch(row(rt, 0), /rv-form-/);
  assert.equal(summary(rt).gap, 0);
  await checkAll(rt); await saveClick(rt);
  const saved = rt.writes[1].data;
  assert.equal(saved.creditStatus, 'ok');
  assert.equal(saved.items[0].priceForm, 'promo_on_paper');
  assert.equal(saved.items[0].promoOnPaper.promoFixedPrice, 8.5);
});

test('עורך הפריטים שומר את צורת המחיר גם לשורה ישנה שיש לה ברקוד בלי מזהה מוצר', async () => {
  const items = [{ name: 'לחמניות 10 בשקית', barcode: '498256', qty: 1, unitPrice: 8.5, lineTotal: 8.5, priceForm: 'promo_on_paper', sentUnitPrice: 10.399818,
    promoOnPaper: { expectedNet: 10.4, promoFixedPrice: 8.5, promoName: 'x', recordedAt: 1 } }, line(3701, 2)];
  const rt = open(doc(items, '2026-10-04', { credited: true, creditNoteTotal: 31.5, creditStatus: 'ok' }), null);
  rt.run("openReturnItemsEdit('test-return'); retEditSetQtyLive(1, '3')");
  await rt.run('saveReturnItemsEdit()');
  const saved = rt.writes[0].data;
  assert.equal(saved.items[0].priceForm, 'promo_on_paper');
  assert.equal(saved.items[0].sentUnitPrice, 10.399818);
  assert.equal(saved.items[0].promoOnPaper.promoFixedPrice, 8.5);
  assert.equal(saved.items[1].qty, 3);
});

test('סכום נייר אפס או שלילי (נמוך מהשיוכים) אינו מצב של צורת מחיר', async () => {
  const items = [line(1231, 1), line(3701, 2), line(101, 7)];
  const rt = open(doc(items, '2026-10-04', { creditAllocations: [{ id: 'a', amount: 80, receiptId: 'x' }] }), 71.69);
  assert.equal(state(rt).noteTotal, r2(71.69 - 80));
  assert.equal(solution(rt), null);
  assert.equal(state(rt).items[0].unitPrice, 10.399818);
  await checkAll(rt);
  assert.doesNotMatch(summaryHtml(rt), /הסבר אפשרי לפער/);
});

test('שורה עם קידומת carry_ בלי דגל, או manual_, אינה מקבלת מוצר וצורות מחיר', () => {
  const items = [{ productId: 'carry_123', name: 'לחמניות 10 בשקית', barcode: '498256', qty: 1, unitPrice: 8.5, lineTotal: 8.5 },
    { productId: 'manual_9', name: 'ידני', barcode: '498256', qty: 1, unitPrice: 3, lineTotal: 3 }, line(3701, 2)];
  const rt = open(doc(items, '2026-10-04'), 34.5);
  assert.equal(rt.run('rvLineProduct(returnVerify.items[0])'), null);
  assert.equal(rt.run('rvLineProduct(returnVerify.items[1])'), null);
  assert.equal(state(rt).autoForms, undefined);
  assert.doesNotMatch(row(rt, 0), /rv-form-/);
  assert.equal(Object.hasOwn(state(rt).items[0], 'sentUnitPrice'), false);
});

test('ביטול שליחה מחזיר שורה מועברת במחיר המדויק ומאחד אותה עם שורה זהה ברשימה', () => {
  const rt = runtime();
  rt.run(`returns = []; returnsList = [{ productId: 'carry_1', name: 'אחיד פרוס ברמן', barcode: '497112', qty: 2, unitPrice: 5.7408, manual: true, carried: true, carriedFrom: 'older' }];
    returnsSlots = { weekly: returnsList, daily: [] }; returnsSlot = 'weekly';
    testDoc = { id: 'r1', date: '2026-10-04', docDate: '2026-10-04', credited: false, totalExVat: 97.63,
      items: [{ productId: 'carry_2', name: 'אחיד פרוס ברמן', barcode: '497112', qty: 13, unitPrice: 5.7408, lineTotal: 74.63, carried: true, carriedFrom: 'older' },
              { productId: 'code_3701', name: 'חלומית אישית 3 יח׳', barcode: '4033484', qty: 2, unitPrice: 11.5, lineTotal: 23 }] };
    returns = [testDoc];`);
  const plan = JSON.parse(rt.run('JSON.stringify(retUnsendPlan(returns[0]))'));
  assert.equal(plan.items[0].unitPrice, 5.7408);
  assert.equal(plan.val, 97.63);
  rt.run('applyReturnUnsend(retUnsendPlan(returns[0]))');
  assert.equal(rt.run('returnsList.length'), 2, 'the carried line merged into the existing identical row');
  assert.equal(rt.run('returnsList[0].qty'), 15);
});
