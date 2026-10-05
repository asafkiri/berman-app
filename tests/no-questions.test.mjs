// v130 — הכל בקליטה, בלי שאלות. נייר "ת.משלוח" קטן מהמסופון (מספר 2900, בלי מספר פנימי) הוא חלק מהקליטה,
// כמו תעודת המשלוח הגדולה: נכנס לבד לקליטה הפתוחה (גם מיום אחר בשבוע האחרון) או פותח קליטה, בלי לשאול.
// סופרים מה שהגיע (או "לא הגיע כלום"), ובסוף — המאזן במשפט אחד.
// מה שנבדק:
// - הנייר הקטן נקרא כתעודת משלוח (small), לא כנייר חיוב.
// - בלי קליטה פתוחה: פותח קליטה לבד, בלי "לפתוח קליטה לתעודה?" — גם כשהוא מלפני 3 ימים.
// - עם קליטה פתוחה מהיום: מתווסף לבד (תעודה גדולה מיום אחר — עדיין שאלה, כמו קודם).
// - נייר קטן ישן מדי (יותר משבוע) — כמו כל תעודה: שאלה.
// - אחרי השמירה: "התעודה נקלטה ✓ · במאזן: …" / "הכל מאוזן מול ברמן".
// הרצה: node --test tests/no-questions.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { app, days, delivery, printed, readPapers, receive, state } from './one-button-helpers.mjs';
import { runtime, fixture } from './receipt-scan-harness.mjs';

// נייר "ת.משלוח" קטן כפי שהשרת (v7) מחזיר אותו
const small = (number = '290095177', d = days(-3)) => delivery(number, { internalNumber: null, headerText: 'ת.משלוח', docDate: printed(d) });

test('נייר "ת.משלוח" קטן — תעודת משלוח קטנה; בלי קליטה פתוחה הוא פותח קליטה לבד, גם מלפני 3 ימים', async () => {
  const r = app(small());
  await readPapers(r);
  const p = JSON.parse(r.run(`JSON.stringify(paperFind('paper_290095177').paper)`));
  assert.equal(p.kind, 'delivery'); assert.equal(p.small, true);
  assert.equal(r.run(`paperLabel(paperFind('paper_290095177').paper)`).startsWith('נייר המשלוח הקטן 95177'), true);
  assert.equal(r.run('testConfirms.length'), 0, 'בלי שאלה');
  assert.equal(r.run('receiptOpened'), true, 'נפתחה קליטה עם הנייר');
  assert.match(r.run('paperIntakeItemHtml(paperIntake.items[0])'), /נכנסה לקליטה/);
  assert.equal(state(r).st, 'ok'); assert.equal(state(r).docs.length, 1);
  assert.equal(r.requests.length, 1, 'בלי קריאה נוספת');
  // תעודה גדולה מאותו יום — עדיין שואלת (כמו קודם)
  const b = app(delivery('77001234', { docDate: printed(days(-3)) }));
  await readPapers(b);
  assert.equal(b.run(`receivingDeliveryRoute(paperIntake.items[0].scan, paperFind('paper_77001234').paper, null, {}).reason`), 'date-new');
});

test('עם קליטה פתוחה מהיום — הנייר הקטן מלפני יומיים מתווסף לבד; נייר קטן מלפני 9 ימים — שאלה', async () => {
  const r = app(delivery('77001234'));
  await receive(r);
  r.serve(small('290095180', days(-2)));
  await readPapers(r, 1, 1);
  assert.equal(r.run('testConfirms.length'), 0, 'בלי שאלה');
  assert.deepEqual(state(r).nums, ['77001234', '290095180']);
  const o = app(delivery('77001234'));
  await receive(o);
  o.serve(small('290095181', days(-9)));
  await readPapers(o, 1, 1);
  assert.equal(o.run(`receivingDeliveryRoute(paperIntake.items.find(x => x.captureId === 'cap1').scan, paperFind('paper_290095181').paper, null, {}).reason`), 'other-receiving');
  assert.equal(state(o).docs.length, 1, 'מיום רחוק — לא נכנס לבד');
});

test('אחרי השמירה — המאזן במשפט אחד', () => {
  const L = JSON.parse(fs.readFileSync(new URL('./ledger-2026-10.json', import.meta.url), 'utf8'));
  const r = runtime({ data: { ...fixture(), products: L.products } });
  r.context.testL = { receipts: L.receipts.slice().reverse(), returns: L.returns.slice().reverse(), papers: [L.papers.p141, L.papers.p142] };
  r.run(`receipts = testL.receipts; returns = testL.returns; papers = testL.papers; todayStr = () => '2026-10-05'; ledgerInvalidate();`);
  assert.equal(r.run('receivingBalanceLine()'), 'במאזן: חויבת פעמיים על לחמניות 10 בשקית ×2 — לבקש זיכוי מהנהג · תיקון של ברמן התקזז: לחם אחיד ברמן ×13');
  r.run(`todayStr = () => '2026-10-20'; ledgerInvalidate();`);
  assert.doesNotMatch(r.run('receivingBalanceLine()'), /תיקון של ברמן/, 'תיקון ישן — לא חוזר בכל שמירה');
  r.run(`todayStr = () => '2026-10-05'; ledgerInvalidate();`);
  r.run(`receipts = [{ id: 'rc_ok', date: '2026-10-04', timestamp: 1, items: [{ productId: 'code_101', name: 'x', qty: 3, noteQty: 3 }] }]; returns = []; papers = []; ledgerInvalidate();`);
  assert.equal(r.run('receivingBalanceLine()'), 'הכל מאוזן מול ברמן');
});

test('סקירה 8: נייר קטן מחודש אחר — לא נכנס לבד (ברמן מחייבת אותו בחודש שהודפס); מאותו חודש — כן', async () => {
  const r = app(small('290095177', days(-3)));
  await readPapers(r);
  // הקליטה של היום (מדומה) בתחילת חודש, והנייר מסוף החודש הקודם — 3 ימים אחורה
  const p = JSON.parse(r.run(`JSON.stringify(paperFind('paper_290095177').paper)`));
  r.context.testP = { ...p, docDay: '2026-10-30' };
  r.run(`todayStr = () => '2026-11-02'; receiptDocDate = null;`);
  const scan = `paperIntake.items[0].scan`;
  r.run(`receiptOpened = false; receiptList = []; aiScanResponse = null; receiptNotes = []; aiScanDocuments = []; receiptPaperScanState = null; reconcileData = null; pendingReceipt = null;`);
  assert.equal(r.run(`receivingDraftEmpty()`), true);
  assert.equal(r.run(`receivingDeliveryRoute(${scan}, testP, null, { fresh: true }).reason`), 'date-new', 'חודש אחר — שואלים');
  r.context.testP = { ...p, docDay: '2026-11-01' };
  assert.equal(r.run(`receivingDeliveryRoute(${scan}, testP, null, { fresh: true }).action`), 'new', 'אותו חודש — נכנס לבד');
});
