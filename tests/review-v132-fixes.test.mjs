// v135 — תיקוני הסקירה של v132–v134 ("לא הגיע כלום" והבחירות הידניות במסך הניירות ובמסך הקליטה).
// מה שנבדק:
// - אימות קריאה ממתין: אף בחירה ידנית (גם "לא הגיע כלום") לא פותחת את מסך ההשוואה — הוא מראה את כמויות הנייר לפני
//   הספירה. מוצגים רק המספרים המסומנים לבדיקה, ובמסך הניירות הבחירות לא מוצגות.
// - השאלה המשותפת לטלפון השני חוזרת על הבחירה הנכונה גם כשנלחצה במסך הניירות (ולא על הלחיצה האחרונה במסך הקליטה).
// - במסך הניירות הבחירות מוצגות רק כשנייר שבמסך הזה נמצא בקליטה הפתוחה.
// - לחיצה כשהמצב השתנה מאז הציור (למשל סיכום שנפתח) — לא מבוצעת; המסך מצויר מחדש.
// - מסך הניירות מצויר מחדש כשמצב הקליטה המשותפת משתנה וכשהכנסה של תעודה נגמרת.
// - "לא הגיע כלום" אומר באילו תעודות מדובר (במספר).
// - תעודה שנקראה ומחכה להיכנס — הבחירה מחכה לה.
// - כל אחד מתנאי הבחירות במסך הניירות נבדק בנפרד.
// הרצה: node --test tests/review-v132-fixes.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { app, days, delivery, printed, readPapers } from './one-button-helpers.mjs';

const small = (number = '290095141', d = days(0)) => delivery(number, { internalNumber: null, headerText: 'ת.משלוח', docDate: printed(d) });
const json = (r, expr) => JSON.parse(r.run('JSON.stringify(' + expr + ')'));
const panel = r => { r.run('renderPaperIntake()'); return /data-role="paper-none-arrived"/.test(r.node('app').innerHTML); };
async function ready() {
  const r = app(small());
  await readPapers(r);
  r.click('paper-all-in');
  assert.equal(panel(r), true, 'מוכן — הבחירות מוצגות');
  return r;
}

test('אימות קריאה ממתין: אף בחירה לא פותחת את מסך ההשוואה (כמויות הנייר לפני הספירה); מוצגים רק המספרים לבדיקה', async () => {
  for (const role of ['rc-quantity-none', 'rc-quantity-all', 'rc-quantity-differences']) {
    const r = await ready();
    r.run(`aiScanResponse.scan.documents[0].__bermanOcrVerification = { status: 'needs_review', issues: [] }; setView('receiving'); rcOcrReviewRevealed = false;`);
    assert.equal(r.run('bermanOcrPendingDocs().length'), 1);
    const toasts = r.toasts.length;
    r.click(role);
    assert.equal(r.run('currentView'), 'receiving', role + ': לא למסך ההשוואה');
    assert.equal(r.run('reconcileData'), null, role);
    assert.equal(r.run('testConfirms.length'), 0, role + ': בלי שאלה');
    assert.deepEqual(json(r, 'receiptList'), [], role + ': הספירה לא השתנתה');
    assert.equal(r.run('rcOcrReviewRevealed'), true, role + ': המספרים לבדיקה מוצגים');
    assert.match(r.toasts[toasts], /קודם בדוק מול הנייר את המספרים המסומנים/, role);
  }
  // ובמסך הניירות — הבחירות לא מוצגות
  const r = await ready();
  r.run(`aiScanResponse.scan.documents[0].__bermanOcrVerification = { status: 'needs_review', issues: [] }`);
  assert.equal(panel(r), false);
});

test('השאלה המשותפת לטלפון השני: הבחירה מהמסך הניירות — לא הלחיצה האחרונה שנרשמה במסך הקליטה', async () => {
  for (const [role, expect] of [['paper-none-arrived', 'rc-quantity-none'], ['paper-quantity-all', 'rc-quantity-all'], ['paper-quantity-differences', 'rc-quantity-differences']]) {
    const r = await ready();
    r.run(`sharedReceiptLastAction = { id: '', dataset: { role: '${expect === 'rc-quantity-all' ? 'rc-scan' : 'rc-quantity-all'}' } };`);
    r.click(role);
    assert.equal(r.run('sharedReceiptLastAction.dataset.role'), expect, role);
  }
});

test('במסך הניירות הבחירות רק כשנייר שבמסך נמצא בקליטה הפתוחה; "לא הגיע כלום" אומר באיזו תעודה', async () => {
  const r = await ready();
  // המסך מראה נייר אחר (למשל תעודה מיום אחר שלא נכנסה) — בלי הבחירות
  r.run(`paperIntake.items = [{ captureId: 'capZ', status: 'delivery', paperId: 'paper_77999999' }];`);
  assert.equal(panel(r), false, 'הנייר שבמסך לא בקליטה');
  r.click('paper-none-arrived');
  assert.equal(r.run('testConfirms.length'), 0, 'לחיצה ישנה — לא מבוצעת');
  assert.equal(r.run('currentView'), 'paperIntake');
  // הנייר שבקליטה — במסך
  r.run(`paperIntake.items = [{ captureId: 'cap0', status: 'delivery', paperId: 'paper_290095141' }];`);
  assert.equal(panel(r), true);
  r.click('paper-none-arrived');
  assert.match(r.run('testConfirms[0].message'), /\(290095141\)/, 'במספר');
});

test('לחיצה כשהמצב השתנה מאז הציור (סיכום נפתח, טלפון שצופה) — לא מבוצעת, והמסך מצויר מחדש', async () => {
  for (const change of ['pendingReceipt = {}', 'canEditSharedReceipt = () => false', 'reconcileData = []']) {
    const r = await ready();
    r.run(change);
    const toasts = r.toasts.length;
    r.click('paper-none-arrived');
    assert.equal(r.run('testConfirms.length'), 0, change);
    assert.equal(r.run('currentView'), 'paperIntake', change);
    assert.match(r.toasts[toasts] || '', /הקליטה השתנתה/, change);
    assert.equal(/data-role="paper-none-arrived"/.test(r.node('app').innerHTML), false, change + ': צויר מחדש בלי הכפתור');
  }
});

test('מסך הניירות מצויר מחדש כשמצב הקליטה המשותפת משתנה וכשהכנסה של תעודה נגמרת', async () => {
  const r = await ready();
  r.run(`globalThis.__renders = 0; const __orig = renderPaperIntake; renderPaperIntake = () => { globalThis.__renders++; return __orig(); };`);
  r.run(`sharedReceivingStatusChanged({ status: 'synced' })`);
  assert.ok(r.run('globalThis.__renders') >= 1, 'מצב משותף');
  const before = r.run('globalThis.__renders');
  // הכנסה של תעודה (כבר בקליטה) — כשנגמרת
  await r.run(`receivingJoinDelivery({ paperId: 'paper_290095141', cap: 'cap0', item: paperIntake.items[0], explicit: false })`);
  await new Promise(res => setImmediate(res));
  assert.equal(r.run('paperJoinActive'), 0);
  assert.ok(r.run('globalThis.__renders') > before, 'אחרי שהמונה ירד');
});

test('תעודה שנקראה ומחכה להיכנס (בלי קליטה מסוימת) — הבחירה מחכה לה', async () => {
  const r = await ready();
  r.run(`setView('receiving'); paperJoinRetry = () => {}; paperJoinPending.set('paper_x', { paperId: 'paper_x', item: { forDraftId: null } });`);
  const toasts = r.toasts.length;
  r.click('rc-quantity-none');
  assert.equal(r.run('testConfirms.length'), 0);
  assert.match(r.toasts[toasts], /עוד נייר מהנהג נקרא עכשיו/);
  r.run(`paperJoinPending.clear()`);
  r.click('rc-quantity-none');
  assert.equal(r.run('testConfirms.length'), 1);
});

test('כל תנאי של הבחירות במסך הניירות — בנפרד: הוסר תנאי, הבדיקה נכשלת', async () => {
  for (const [label, set, undo] of [
    ['צירוף לקליטה שנשמרה', `receiptAttachTarget = { id: 'x' }`, `receiptAttachTarget = null`],
    ['הנייר לא אישר את עצמו', `receiptPaperScanState = 'failed'`, `receiptPaperScanState = 'ok'`],
    ['קריאה רצה', `aiScanBusy = true`, `aiScanBusy = false`],
    ['נייר נקרא בטלפון אחר', `globalThis.__lease = scanLeaseOther; scanLeaseOther = () => true`, `scanLeaseOther = globalThis.__lease`],
    ['שמירה בטלפון אחר', `sharedReceiptFinalizing = true`, `sharedReceiptFinalizing = false`],
    ['בלי נייר', `receiptNoDoc = true`, `receiptNoDoc = false`],
    ['אין קריאה', `globalThis.__resp = aiScanResponse; aiScanResponse = null`, `aiScanResponse = globalThis.__resp`]]) {
    const r = await ready();
    r.run(set);
    assert.equal(panel(r), false, label);
    r.run(undo);
    assert.equal(panel(r), true, label + ' — וחוזר');
  }
});
