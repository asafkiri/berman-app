// v121 — קליטה ידנית וסורק בלי כסף: התעודה הנשמרת היא כמויות בלבד (סכמה 2).
// שלב 3 מתוך 6 במעבר ל"כמויות בקליטה, כסף רק במרכזת". הבדיקות רצות על מודול
// האפליקציה המלא (receipt-scan-harness):
//   • סיום עם עוגנים תואמים שומר {schemaVersion: 2, items בלי מחיר, units, count,
//     noteParts, paperDocs, unresolvedUnitsGap, status} — בלי totalExVat, lineTotal,
//     supplierDiscount, monthEndRebates, priceAudit, unresolvedAmountGap.
//   • פער יחידות מול "סה"כ כללי" מנתב למסך ההשוואה (שלב 'units'); ההשוואה
//     כותבת noteQty, והתעודה נשמרת פתוחה עם חוסר ביחידות.
//   • products לא נכתב אחרי שמירה (אין כתיבה חוזרת של מחירי שורה).
//   • כפילות מזוהה לפי תאריך, מספר שורות ויחידות — לא לפי סכום.
//   • במסלול הצילום: הנייר שנקרא נשמר ב-paperDocs (מספר, עוגנים, סכום מודפס
//     לזיהוי), ו-storedReceiptPaperNumbers קורא משם; ממצאי הסריקה שנשמרים הם
//     חוסר/עודף בלבד.
// הרצה: node --test tests/receiving-quantities.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, fixture } from './receipt-scan-harness.mjs';

const MONEY_KEYS = ['totalExVat', 'totalIncVat', 'receivedExVat', 'calculatedExVat', 'grossExVat', 'roundingAdjustment', 'supplierDiscount',
  'supplierPromoItems', 'supplierPromoMismatchItems', 'supplierCreditClaim', 'monthEndRebates', 'monthEndPending', 'promoOnPaper',
  'unresolvedAmountGap', 'priceAudit', 'discountReview'];
const LINE_MONEY_KEYS = ['unitPrice', 'basePrice', 'lineTotal', 'promoPct', 'promoPrice', 'listPrice', 'promoOnPaper'];
const json = (r, expr) => JSON.parse(r.run('JSON.stringify(' + expr + ')'));
const savedReceipt = r => { const w = r.writes.filter(x => x.op === 'set' && /receipts/.test(x.path)).pop(); assert.ok(w, 'the receipt was saved'); return w.data; };
const productWrites = r => r.writes.filter(x => /products/.test(String(x.path)) || (Array.isArray(x.writes) && x.writes.some(w => /products/.test(String(w.path)))));

// קליטה ידנית: העוגנים הוקלדו, הפריטים נספרו, אין צילום
function manual(items, { units, lines = 5, amount = 219.92 } = {}) {
  const r = runtime();
  r.context.testItems = items || fixture().items;
  r.run(`receiptEntryMode = 'manual'; receiptOpened = true; receiptDocDate = '2026-09-09';
    receiptNotes = [{ amount: ${amount}, units: ${units}, lines: ${lines}, kind: 'charge' }]; recomputeNoteTotal();
    receiptList = structuredClone(testItems); saveReceiptDraft();
    globalThis.confirms = []; showConfirm = (title, text, ok, fn) => confirms.push({ title, text, ok, fn });
    currentView = 'receiving'; mainMode = 'receiving'; renderReceiving();`);
  return r;
}

test('מסך הקליטה: יחידות ושורות מול הנייר, בלי סכום ובלי מחיר לשורה', () => {
  const r = manual(null, { units: 29 });
  const html = r.node('app').innerHTML;
  assert.match(html, /29\/29 יח׳/, 'סרגל ההתקדמות מונה יחידות מול העוגן');
  assert.match(html, /הכמויות תואמות ✓/);
  assert.ok(!/פער ₪|ליח׳<\/span>|data-linetotal|חיסכון ₪|קיזוז צפוי במרכזת/.test(html), 'אין כסף בשורות ובסרגל');
  assert.match(html, /הכסף מחושב במרכזת/);
  const t = json(r, 'receiptTotals()');
  assert.deepEqual(t, { units: 29, lines: 5, depositUnits: 0 });
});

test('סיום עם עוגנים תואמים: סכמה 2, שורות בלי כסף, בלי כתיבה למוצרים', async () => {
  const r = manual(null, { units: 29 });
  r.run('finishReceipt()');
  assert.equal(r.run('currentView'), 'receiving', 'אין פער — לא עוברים למסך ההשוואה');
  const pending = json(r, 'pendingReceipt');
  assert.equal(pending.status, 'ok');
  assert.equal(pending.units, 29);
  assert.ok(!('ex' in pending) && !('calculatedEx' in pending), 'הסיכום בלי כסף');
  const summary = r.node('rsBody').innerHTML;
  assert.match(summary, /29 יח׳ · 5 שורות/);
  assert.match(summary, /סכום מודפס בתעודה: ₪219.92 · לזיהוי בלבד/);
  assert.ok(!/נטו לחיוב \(ללא מע"מ\)<\/span><span>₪/.test(summary));
  await r.run('confirmReceipt()');
  const saved = savedReceipt(r);
  assert.equal(saved.schemaVersion, 2);
  assert.equal(saved.status, 'ok');
  assert.equal(saved.units, 29);
  assert.equal(saved.count, 5);
  assert.equal(saved.unresolvedUnitsGap, 0);
  assert.deepEqual(saved.noteParts, [{ amount: 219.92, units: 29, lines: 5, kind: 'charge' }]);
  assert.equal(saved.noteTotalInc, 219.92, 'הסכום המודפס נשמר לזיהוי בלבד');
  assert.deepEqual(saved.paperDocs, [], 'בלי צילום אין ניירות שנקראו');
  for (const k of MONEY_KEYS) assert.ok(!(k in saved), k + ' is not written since v121');
  for (const l of saved.items) {
    for (const k of LINE_MONEY_KEYS) assert.ok(!(k in l), k + ' on line ' + l.productId);
    assert.ok(l.productId && l.name && typeof l.qty === 'number');
  }
  assert.deepEqual(saved.items.map(l => [l.productId, l.qty]), [['code_101', 12], ['code_1231', 6], ['code_238', 3], ['code_2381', 4], ['code_2387', 4]]);
  assert.equal(productWrites(r).length, 0, 'products לא נכתב');
  // התעודה השמורה נסגרת לפי כמויות ומוצגת בהיסטוריה עם שווי מהקטלוג (תצוגה)
  r.context.saved = { id: 'r1', ...saved };
  r.run('receipts = [saved]; receiptHistoryFilter = "all"; currentView = "receiptsHistory"; renderReceiptsHistory();');
  const html = r.node('app').innerHTML;
  assert.ok(!/התצוגה נכשלה/.test(html));
  assert.equal(r.run('receiptDiscrepancyInfo(saved).open'), false);
  assert.match(html, /שווי לפי מחירי האפליקציה: ₪[1-9]/, 'השווי לתצוגה נקרא מהקטלוג כשאין מחיר על השורה');
});

test('פער יחידות מול "סה"כ כללי": מסך ההשוואה בשלב units, noteQty נכתב, התעודה נשמרת פתוחה', async () => {
  const items = fixture().items.map(it => it.productId === 'code_238' ? { ...it, qty: 2 } : it); // 28 נספרו, 29 בנייר
  const r = manual(items, { units: 29 });
  r.run('finishReceipt()');
  assert.equal(r.run('currentView'), 'reconcile');
  assert.equal(r.run('rcStep'), 'units', 'בלי צילום — הנייר נבדק ידנית, לפי כמויות');
  const html = r.node('app').innerHTML;
  assert.match(html, /חסרות 1 יח׳ מול "סה"כ כללי"/);
  assert.ok(/data-role="rc-recon-note"/.test(html) && !/data-role="rc-recon-price"|rc-recon-promo|הבלש/.test(html), 'שורות עם כמות בנייר, בלי מחיר ובלי בלש');
  assert.match(html, /28 \/ 29 יח׳/);
  // הנייר אומר 3 פיתות; הגיעו 2
  r.run("reconcileSetNoteLive('code_238', '3');");
  assert.equal(r.run('reconcileUnitsGap()'), 0);
  r.run('saveReconciledReceipt()');
  const pending = json(r, 'pendingReceipt');
  assert.equal(pending.status, 'open');
  assert.deepEqual(pending.lines.find(l => l.productId === 'code_238'), { productId: 'code_238', name: 'ברמן אסלי 5 פיתות', barcode: '497204', qty: 2, noteQty: 3 });
  assert.ok(!('ex' in pending) && !('unresolvedAmountGap' in pending));
  const summary = r.node('rsBody').innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(summary, /ברמן אסלי 5 פיתות חויב בתעודה 3 · נסרק בפועל 2 · חסר 1/);
  assert.ok(!/₪4\.91|לתשלום ללא מע״מ/.test(summary));
  await r.run('confirmReceipt()');
  const saved = savedReceipt(r);
  assert.equal(saved.status, 'open');
  assert.equal(saved.units, 28);
  assert.equal(saved.unresolvedUnitsGap, 0);
  for (const k of MONEY_KEYS) assert.ok(!(k in saved), k);
  r.context.saved = { id: 'r2', ...saved };
  const di = json(r, '(function () { const d = receiptDiscrepancyInfo(saved); return { open: d.open, short: d.shortItems.map(x => [x.productId, x.n]), over: d.overItems.length }; })()');
  assert.deepEqual(di, { open: true, short: [['code_238', 1]], over: 0 });
  assert.equal(productWrites(r).length, 0);
});

test('כפילות: אותו יום, אותן שורות ואותן יחידות — אישור לפני שמירה; סכום שונה אינו מבדיל', () => {
  const r = manual(null, { units: 29 });
  r.context.prior = { id: 'old', docDate: '2026-09-09', date: '2026-09-09', timestamp: Date.now(), status: 'ok', count: 5, units: 29,
    items: fixture().items.map(it => ({ productId: it.productId, name: it.name, qty: it.qty })), noteTotalInc: 300 };
  r.run('receipts = [prior]; finishReceipt();');
  const confirms = json(r, 'confirms.map(c => [c.title, c.text])');
  assert.equal(confirms.length, 1);
  assert.equal(confirms[0][0], 'אולי כפילות');
  assert.match(confirms[0][1], /29 יח׳ · 5 שורות/);
  assert.ok(!/₪/.test(confirms[0][1]), 'הכפילות נמדדת ביחידות, לא בכסף');
  assert.equal(r.run('pendingReceipt'), null);
});

test('מסלול הצילום: paperDocs עם מספר ועוגנים, ממצאי AI של כמות בלבד, ומספר הנייר מזוהה לכפילות', async () => {
  const data = fixture();
  data.paper.scan.documents[0].docNumber = '244723990';
  const r = runtime({ data });
  await r.scan();
  r.run('finishReceipt()');
  assert.equal(r.run('currentView'), 'reconcile', 'הסריקה מצאה חוסר/עודף מול הספירה');
  assert.equal(r.run('rcStep'), 'ai');
  r.click('ai-apply');
  const pending = json(r, 'pendingReceipt');
  assert.ok(pending && pending.aiAudit, 'תיעוד הסריקה נשמר');
  assert.ok(pending.aiAudit.findings.every(f => ['shortage', 'surplus'].includes(f.type)), 'ממצאי כמות בלבד');
  assert.equal(pending.aiAudit.hasDiscrepancy, true);
  await r.run('confirmReceipt()');
  const saved = savedReceipt(r);
  assert.equal(saved.schemaVersion, 2);
  assert.deepEqual(saved.paperDocs, [{ number: '244723990', date: '09/09/2026', units: 30, lines: 5, printedNetEx: 219.92, kind: 'charge' }]);
  assert.ok(saved.paperScan && saved.paperScan.response, 'תשובת הסריקה נשמרת כמו קודם');
  for (const k of MONEY_KEYS) assert.ok(!(k in saved), k);
  for (const l of saved.items) for (const k of LINE_MONEY_KEYS) assert.ok(!(k in l), k + ' on ' + l.productId);
  assert.deepEqual(saved.items.filter(l => l.noteQty != null).map(l => [l.productId, l.qty, l.noteQty]).sort(), [['code_238', 3, 4], ['code_2381', 4, 5], ['code_2387', 4, 3]]);
  r.context.saved = { id: 'r3', ...saved };
  assert.deepEqual(json(r, 'storedReceiptPaperNumbers(saved)').slice(0, 1), ['244723990']);
  assert.equal(productWrites(r).length, 0, 'ההחלה לא כותבת מחירים למוצרים');
});

test('מסלול הצילום: ספירה שתואמת לנייר נסגרת בלי מסך השוואה, ושינוי ספירה מחזיר אליו', () => {
  const data = fixture();
  data.items = data.paper.scan.documents[0].rows.map(row => { const p = data.products.find(x => x.code === row.itemCode); return { productId: p.id, name: p.name, barcode: p.barcode, qty: row.quantity }; });
  const r = runtime({ data });
  return r.scan().then(() => {
    r.run('finishReceipt()');
    assert.equal(r.run('currentView'), 'receiving');
    assert.ok(r.run('pendingReceipt && pendingReceipt.status === "ok"'));
    assert.equal(r.run('reconcileData'), null);
    r.run("hideReceiptSummary(); pendingReceipt = null; receiptList.find(x => x.productId === 'code_238').qty = 2; saveReceiptDraft(); finishReceipt();");
    assert.equal(r.run('currentView'), 'reconcile', 'עוגן היחידות כבר לא נסגר');
    assert.equal(r.requests.length, 1, 'בלי קריאה נוספת לשרת הסריקה');
  });
});

// v122: "נטו לחיוב" הוא רשות — שני העוגנים (סה"כ כללי, סה"כ שורות) מספיקים
// לפתיחה מהעורך, לסיום ולשמירה. הסכום, אם הוקלד, נשמר לזיהוי בלבד.
test('v122: בלי "נטו לחיוב" — פתיחה, סיום ושמירה עם שני העוגנים בלבד', async () => {
  const r = runtime();
  r.run(`receiptEntryMode = 'manual'; receiptOpened = false; receiptDocDate = '2026-09-09'; openReceivingScanner = () => {};
    globalThis.toasts = []; showToast = t => toasts.push(t); currentView = 'receiving'; mainMode = 'receiving'; renderReceiving();`);
  assert.match(r.node('app').innerHTML, /שני העוגנים/);
  // רק שורות — חסר "סה"כ כללי": נעצר
  r.node('rcNoteLines').value = '5';
  r.click('rc-open');
  assert.equal(r.run('receiptOpened'), false);
  assert.match(r.run('toasts.at(-1)'), /סה״כ כללי/);
  // יחידות ושורות, בלי סכום: נפתח
  r.node('rcNoteUnits').value = '29';
  r.click('rc-open');
  assert.equal(r.run('receiptOpened'), true);
  assert.deepEqual(json(r, 'receiptNotes'), [{ amount: 0, units: 29, lines: 5, kind: 'charge' }]);
  assert.deepEqual(json(r, '[receiptNoteUnits, receiptNoteLines, receiptNoteTotal]'), [29, 5, 0]);
  r.context.testItems = fixture().items;
  r.run('receiptList = structuredClone(testItems); saveReceiptDraft(); renderReceiving();');
  assert.match(r.node('app').innerHTML, /29 יח׳ · 5 שורות/);
  assert.ok(!/₪0\.00/.test(r.node('app').innerHTML), 'סכום שלא הוקלד אינו מוצג כאפס');
  r.run('finishReceipt()');
  assert.ok(r.run('pendingReceipt && pendingReceipt.status === "ok"'), JSON.stringify(json(r, 'toasts')));
  assert.ok(!/סכום מודפס בתעודה/.test(r.node('rsBody').innerHTML));
  await r.run('confirmReceipt()');
  const saved = savedReceipt(r);
  assert.equal(saved.status, 'ok');
  assert.equal(saved.noteTotalInc, null, 'בלי סכום — אין מה לשמור לזיהוי');
  assert.deepEqual(saved.noteParts, [{ amount: 0, units: 29, lines: 5, kind: 'charge' }]);
  // סכום שאינו מספר נעצר; סכום תקין נשמר לזיהוי בלבד
  const s = runtime();
  s.run(`receiptEntryMode = 'manual'; receiptOpened = false; openReceivingScanner = () => {}; globalThis.toasts = []; showToast = t => toasts.push(t);
    currentView = 'receiving'; mainMode = 'receiving'; renderReceiving();`);
  s.node('rcNoteUnits').value = '29'; s.node('rcNoteLines').value = '5'; s.node('rcNoteInput').value = 'abc';
  s.click('rc-open');
  assert.equal(s.run('receiptOpened'), false);
  assert.match(s.run('toasts.at(-1)'), /לזיהוי בלבד/);
  s.node('rcNoteInput').value = '219.92';
  s.click('rc-open');
  assert.deepEqual(json(s, 'receiptNotes'), [{ amount: 219.92, units: 29, lines: 5, kind: 'charge' }]);
});
