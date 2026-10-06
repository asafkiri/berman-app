// v132 — "לא הגיע כלום" גלוי וגדול: במסך הקליטה ובמסך הניירות, לא מקופל.
// מה שנבדק:
// - מסך הניירות: נייר קטן נכנס לקליטה → "לא הגיע כלום" מתחת ל"לספירה", באותו גודל. לחיצה → מסך הקליטה ושאלת
//   האישור הרגילה; רק אחרי "לא הגיע כלום" — כל שורות הנייר חוסר, בלי קריאה נוספת.
// - הכפתור לא מוצג כשאין עדיין תעודה בקליטה, כשעוד נייר נקרא, בקליטה בלי נייר, בזמן בדיקה/סיכום, ובטלפון שרק צופה.
// - מסך הקליטה: לפני שנספר משהו — שלוש הבחירות פתוחות (לא מקופלות), ו"לא הגיע כלום" גדול מעל "סרוק פריט לתעודה".
//   אחרי שנספרה שורה — מתקפל לשורה אחת, והבחירה עדיין שם.
// - בזמן שעוד נייר מהנהג נקרא לקליטה (אולי עוד תעודת משלוח) — הבחירה מחכה לו, בשני המסכים.
// הרצה: node --test tests/none-arrived-visible.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { app, days, delivery, printed, readPapers } from './one-button-helpers.mjs';

const small = (number = '290095141', d = days(0)) => delivery(number, { internalNumber: null, headerText: 'ת.משלוח', docDate: printed(d) });
const json = (r, expr) => JSON.parse(r.run('JSON.stringify(' + expr + ')'));
const btnClasses = (html, role) => { const m = html.match(new RegExp('<button data-role="' + role + '" class="([^"]+)"')); assert.ok(m, 'אין כפתור ' + role); return m[1].split(/\s+/); };
// נייר אחר מהנהג עוד נקרא בטלפון הזה (למשל תעודת המשלוח הגדולה, אחרי הקטנה)
const readingAnother = `paperIntake.busy = true; paperIntake.items = paperIntake.items.concat([{ captureId: 'capX', hash: 'hX', status: 'reading', target: '', forDraftId: receiptDraftId }]);`;

async function smallInReceiving() {
  const r = app(small());
  await readPapers(r);
  assert.equal(r.run('receiptPaperScanState'), 'ok', 'הנייר הקטן נכנס לקליטה');
  assert.equal(r.run('currentView'), 'paperIntake');
  return r;
}

test('מסך הניירות: "לא הגיע כלום" מתחת ל"לספירה" ובאותו גודל — לחיצה, שאלת אישור, וכל השורות חוסר', async () => {
  const r = await smallInReceiving();
  r.run('renderPaperIntake()');
  const html = r.node('app').innerHTML;
  const count = html.indexOf('data-role="paper-count-now"'), none = html.indexOf('data-role="paper-none-arrived"');
  assert.ok(count >= 0, 'יש "לספירה"');
  assert.ok(none > count, '"לא הגיע כלום" מתחת ל"לספירה"');
  assert.ok(none < html.indexOf('id="paperIntakeList"'), 'מעל כרטיסי הניירות');
  assert.match(html, /data-role="paper-none-arrived"[^>]*>(<i[^>]*><\/i> )?לא הגיע כלום — הכל חסר<\/button>/);
  const big = btnClasses(html, 'paper-count-now'), mine = btnClasses(html, 'paper-none-arrived');
  for (const c of ['w-full', 'min-h-[48px]', 'rounded-2xl', 'py-3', 'font-black']) {
    assert.ok(big.includes(c), '"לספירה": ' + c); assert.ok(mine.includes(c), '"לא הגיע כלום" באותו גודל: ' + c);
  }
  assert.ok(!mine.some(c => /^text-(xs|sm|\[)/.test(c)), 'לא בכתב קטן');
  const before = r.requests.length;
  r.click('paper-none-arrived');
  assert.equal(r.run('currentView'), 'receiving', 'עוברים לקליטה');
  assert.equal(r.run('testConfirms.length'), 1, 'שאלת אישור אחת');
  assert.equal(r.run('testConfirms[0].title'), 'לא הגיע כלום?');
  assert.match(r.run('testConfirms[0].message'), /^כל השורות שבתעודה יירשמו כחוסר \(0 התקבלו\)/);
  assert.equal(r.run('testConfirms[0].label'), 'לא הגיע כלום — שמור', 'v133: האישור גם שומר');
  assert.deepEqual(json(r, 'receiptList'), [], 'כלום לא נרשם לפני האישור');
  assert.equal(r.run('receiptQuantityReview'), null);
  r.run('testConfirms[0].cb()');
  const rows = json(r, 'receiptList.map(l => [l.productId, l.qty])');
  assert.equal(rows.length, json(r, 'receiptQuantityPaperRows()').length, 'כל שורות הנייר');
  assert.ok(rows.length > 0 && rows.every(x => x[1] === 0), 'כל שורה — 0 התקבלו: ' + JSON.stringify(rows));
  assert.equal(r.run('receiptCountingMode'), 'manual');
  assert.equal(r.run('receiptQuantityCheckAudit().method'), 'manual');
  assert.equal(r.requests.length, before, 'בלי קריאה בתשלום');
});

test('מסך הניירות: בלי תעודה בקליטה, כשעוד נייר נקרא, בלי נייר, בבדיקה, ובטלפון שרק צופה — אין "לא הגיע כלום"', async () => {
  const has = r => { r.run('renderPaperIntake()'); return /data-role="paper-none-arrived"/.test(r.node('app').innerHTML); };
  // לפני שנקרא משהו — אין קליטה
  const empty = app(small());
  empty.run(`openPaperIntake({}); setView('paperIntake')`);
  assert.equal(has(empty), false, 'אין עדיין תעודה בקליטה');
  // עוד נייר נקרא — אולי עוד תעודת משלוח של אותו משלוח
  const reading = await smallInReceiving();
  assert.equal(has(reading), true);
  reading.run(readingAnother);
  assert.equal(has(reading), false, 'עוד נייר נקרא');
  // קליטה בלי נייר / בבדיקה / בסיכום / טלפון שצופה
  for (const [label, set, undo] of [
    ['בלי נייר', 'receiptNoDoc = true', 'receiptNoDoc = false'],
    ['בבדיקה', 'reconcileData = []', 'reconcileData = null'],
    ['בסיכום', 'pendingReceipt = {}', 'pendingReceipt = null'],
    ['צופה בלבד', 'globalThis.__canEdit = canEditSharedReceipt; canEditSharedReceipt = () => false', 'canEditSharedReceipt = globalThis.__canEdit']]) {
    const r = await smallInReceiving();
    assert.equal(has(r), true);
    r.run(set);
    assert.equal(has(r), false, label);
    r.run(undo);
    assert.equal(has(r), true, label + ' — וחוזר');
  }
});

test('מסך הקליטה: לפני שנספר משהו — שלוש הבחירות פתוחות, ו"לא הגיע כלום" גדול מעל "סרוק פריט לתעודה"', async () => {
  const r = await smallInReceiving();
  r.run(`setView('receiving')`);
  assert.equal(r.run('receiptCountingMode'), 'scan');
  const html = r.node('app').innerHTML;
  assert.doesNotMatch(html, /<details data-quantity-picker/, 'לא מקופל');
  assert.match(html, /data-quantity-first/);
  assert.match(html, /בדקת ידנית את הכמויות מול התעודה\?/);
  for (const role of ['rc-quantity-all', 'rc-quantity-differences', 'rc-quantity-none']) assert.match(html, new RegExp('data-role="' + role + '"'));
  const none = html.indexOf('data-role="rc-quantity-none"'), scan = html.indexOf('data-role="rc-scan"');
  assert.ok(none >= 0 && scan > none, 'מעל "סרוק פריט לתעודה"');
  const mine = btnClasses(html, 'rc-quantity-none'), scanBtn = btnClasses(html, 'rc-scan');
  for (const c of ['w-full', 'rounded-2xl', 'py-4', 'font-black', 'text-lg']) {
    assert.ok(scanBtn.includes(c), '"סרוק פריט": ' + c); assert.ok(mine.includes(c), '"לא הגיע כלום" כמו כפתור הספירה: ' + c);
  }
  assert.ok(mine.includes('bg-rose-600') && mine.includes('text-white'), 'מלא, לא רק מסגרת');
  assert.match(html, /data-role="rc-quantity-none"[^>]*>(<i[^>]*><\/i> )?לא הגיע כלום — הכל חסר<\/button>/);
  // הלחיצה — אותה שאלת אישור ואותה תוצאה
  r.click('rc-quantity-none');
  assert.equal(r.run('testConfirms.length'), 1);
  assert.equal(r.run('testConfirms[0].title'), 'לא הגיע כלום?');
  assert.deepEqual(json(r, 'receiptList'), []);
  r.run('testConfirms[0].cb()');
  assert.ok(json(r, 'receiptList').every(l => l.qty === 0));
  assert.equal(r.run('receiptCountingMode'), 'manual');
});

test('מסך הקליטה: אחרי שנספרה שורה — מתקפל לשורה אחת, ו"לא הגיע כלום" עדיין בתוכו', async () => {
  const r = await smallInReceiving();
  r.run(`receiptList = [{ productId: products[0].id, name: products[0].name, barcode: products[0].barcode, qty: 1 }]; saveReceiptDraft(); setView('receiving')`);
  const html = r.node('app').innerHTML;
  assert.match(html, /<details data-quantity-picker class=/, 'מקופל (סגור)');
  assert.doesNotMatch(html, /data-quantity-first/);
  assert.match(html, /<details data-quantity-picker[\s\S]*data-role="rc-quantity-none"[\s\S]*<\/details>/, 'הבחירה עדיין שם');
  // הספירה נמחקה (בטעות, או ביטול שורה) — שוב פתוח
  r.run(`receiptList = []; saveReceiptDraft(); renderReceiving()`);
  assert.match(r.node('app').innerHTML, /data-quantity-first/);
});

test('עוד נייר מהנהג נקרא לקליטה — "לא הגיע כלום" (וגם שתי הבחירות האחרות) מחכים לו; אחרי הקריאה — אפשר', async () => {
  for (const role of ['rc-quantity-none', 'rc-quantity-all', 'rc-quantity-differences']) {
    const r = await smallInReceiving();
    r.run(`setView('receiving'); ${readingAnother}`);
    const toasts = r.toasts.length;
    r.click(role);
    assert.equal(r.run('testConfirms.length'), 0, role + ': בלי שאלה');
    assert.equal(r.run('receiptQuantityReview'), null, role + ': בלי בדיקה');
    assert.deepEqual(json(r, 'receiptList'), [], role + ': בלי שינוי');
    assert.equal(r.run('receiptCountingMode'), 'scan', role);
    assert.equal(r.toasts.length, toasts + 1, role + ': אומרים למה');
    assert.match(r.toasts[r.toasts.length - 1], /עוד נייר מהנהג נקרא עכשיו — עוד רגע הוא ייכנס לבד, ואז אפשר לבחור/);
    // הקריאה נגמרה
    r.run(`paperIntake.busy = false; paperIntake.items = paperIntake.items.filter(x => x.captureId !== 'capX')`);
    r.click(role);
    assert.ok(r.run('testConfirms.length') + (r.run('!!receiptQuantityReview') ? 1 : 0) + (r.run('receiptCountingMode') === 'manual' ? 1 : 0) > 0, role + ': עכשיו אפשר');
  }
  // נייר שנקרא בטלפון אחר
  const o = await smallInReceiving();
  o.run(`setView('receiving'); scanLeaseOther = () => true`);
  o.click('rc-quantity-none');
  assert.equal(o.run('testConfirms.length'), 0);
  assert.match(o.toasts[o.toasts.length - 1], /נייר מהנהג נקרא עכשיו בטלפון אחר/);
});
