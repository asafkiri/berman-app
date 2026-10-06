// v134 — מסך הניירות: קודם מצלמים את כל הניירות שהגיעו, אחר כך מחליטים. עד v133 הקריאה רצה מיד אחרי הצילום
// והמסך עבר ל"לספירה" — אסף רצה לצלם עוד תעודה שהגיעה באותו משלוח, ו"זה ישר הוציא נתונים מהתעודה במקום לתת לי
// לעלות את כל התעודות". וגם: "במסך הזה אין לי אופציה לבחור ישירות שספרתי ידנית ושקיבלתי הכל, או שיש חוסר או עודף".
// מה שנבדק:
// - אחרי צילום: "צלם עוד נייר" ו"זה כל הניירות" — בלי "לספירה" ובלי הבחירות. הקריאה רצה ברקע (נייר אחד, בקשה אחת),
//   ותעודת המשלוח כבר בקליטה.
// - "זה כל הניירות": "לספירה" ושלוש הבחירות — כל הכמויות תואמות / יש חוסרים או עודפים / לא הגיע כלום.
// - עוד נייר אחרי "זה כל הניירות": שוב "צלם עוד נייר" / "זה כל הניירות"; תעודה שנייה מאותו יום נכנסת לאותה קליטה,
//   ו"לא הגיע כלום" אומר "מכל 2 התעודות".
// - "כל הכמויות תואמות" ממסך הניירות: לקליטה, וסיכום עם הכמויות שבנייר (שום דבר לא נשמר בלי "שמור").
// - "יש חוסרים או עודפים": לקליטה, ומסך הסימון נפתח עם שורות הנייר.
// - צילום שלא נשלח (בלי רשת): "זה כל הניירות" קורא אותו.
// הרצה: node --test tests/paper-intake-all-in.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { app, delivery, readPapers } from './one-button-helpers.mjs';

const json = (r, expr) => JSON.parse(r.run('JSON.stringify(' + expr + ')'));
const settle = async () => { for (let i = 0; i < 40; i++) await new Promise(res => setImmediate(res)); };
const screen = r => { r.run('renderPaperIntake()'); return r.node('app').innerHTML; };
const has = (html, role) => new RegExp('data-role="' + role + '"').test(html);
// צילום אמיתי דרך המסך (הכנת התמונה — מזויפת)
async function photo(r, name) {
  r.run(`aiCompressInvoiceImage = async () => ({ dataUrl: 'data:image/jpeg;base64,eA==', baseDataUrl: 'data:image/jpeg;base64,eA==', rotation: 0 }); paperFileHash = async f => 'h-' + f.name;`);
  await r.run(`paperIntakeAddFiles([{ name: ${JSON.stringify(name)} }]).then(() => paperIntakeRun())`);
  await r.run('paperJoinChain'); await settle();
}

test('אחרי צילום: "צלם עוד נייר" ו"זה כל הניירות" — בלי "לספירה" ובלי הבחירות; הקריאה רצה ברקע ותעודת המשלוח כבר בקליטה', async () => {
  const r = app(delivery('77001234'));
  r.run(`openPaperIntake({}); setView('paperIntake')`);
  await photo(r, 'a');
  assert.equal(r.requests.length, 1, 'נקרא ברקע — בקשה אחת');
  assert.equal(r.run('receiptPaperScanState'), 'ok', 'תעודת המשלוח בקליטה');
  let html = screen(r);
  assert.ok(has(html, 'paper-photo-more'), '"צלם עוד נייר"');
  assert.ok(has(html, 'paper-all-in'), '"זה כל הניירות"');
  assert.match(html, /צלם עוד נייר[\s\S]*זה כל הניירות/);
  assert.match(html, /צלם את כל הניירות שקיבלת/);
  for (const role of ['paper-count-now', 'paper-quantity-all', 'paper-quantity-differences', 'paper-none-arrived']) assert.ok(!has(html, role), 'עוד לא: ' + role);
  // "זה כל הניירות"
  r.click('paper-all-in');
  html = r.node('app').innerHTML;
  assert.ok(!has(html, 'paper-all-in'));
  const at = role => html.indexOf('data-role="' + role + '"');
  assert.ok(at('paper-count-now') >= 0, '"לספירה"');
  assert.ok(at('paper-quantity-all') > at('paper-count-now') && at('paper-quantity-differences') > at('paper-quantity-all') && at('paper-none-arrived') > at('paper-quantity-differences'), 'שלוש הבחירות, מתחת ל"לספירה"');
  assert.match(html, /בדקת ידנית את הכמויות מול התעודה\?[\s\S]*כל הכמויות תואמות[\s\S]*יש חוסרים או עודפים[\s\S]*לא הגיע כלום — הכל חסר/);
  assert.ok(at('paper-none-arrived') < html.indexOf('id="paperIntakeList"'), 'מעל כרטיסי הניירות');
  assert.equal(r.requests.length, 1, 'בלי קריאה נוספת');
});

test('עוד נייר אחרי "זה כל הניירות" — שוב מצלמים; תעודה שנייה מאותו יום נכנסת לאותה קליטה, ו"לא הגיע כלום" חל על שתיהן', async () => {
  const r = app(delivery('77001234'));
  r.run(`openPaperIntake({}); setView('paperIntake')`);
  await photo(r, 'a');
  r.click('paper-all-in');
  r.serve(delivery('77001299'));
  await photo(r, 'b');
  let html = screen(r);
  assert.ok(has(html, 'paper-all-in') && !has(html, 'paper-none-arrived'), 'עוד נייר — שוב "זה כל הניירות"');
  assert.deepEqual(json(r, 'aiScanResponse.scan.documents.map(d => d.docNumber)'), ['77001234', '77001299'], 'אותה קליטה');
  assert.equal(r.run('testConfirms.length'), 0, 'בלי שאלה');
  r.click('paper-all-in');
  html = r.node('app').innerHTML;
  assert.ok(has(html, 'paper-none-arrived'));
  r.click('paper-none-arrived');
  assert.equal(r.run('currentView'), 'receiving');
  assert.match(r.run('testConfirms[testConfirms.length - 1].message'), /לא הגיע כלום מכל 2 התעודות בקליטה/);
  assert.equal(r.requests.length, 2, 'כל נייר נקרא פעם אחת');
});

test('"כל הכמויות תואמות" ממסך הניירות — לקליטה, וסיכום עם הכמויות שבנייר; בלי "שמור" שום דבר לא נשמר', async () => {
  const r = app(delivery('77001234'));
  await readPapers(r);
  r.click('paper-all-in');
  const rows = json(r, 'receiptQuantityPaperRows()');
  r.click('paper-quantity-all');
  assert.ok(r.run('!!pendingReceipt'), 'הסיכום');
  assert.equal(r.node('receiptSummaryModal').classList.contains('hidden'), false);
  assert.deepEqual(json(r, 'receiptList.map(l => [l.productId, l.qty])').sort(), rows.map(x => [x.productId, x.paperQty]).sort(), 'כל שורה כמו בנייר');
  assert.equal(r.run('receiptQuantityCheckAudit().method'), 'manual');
  assert.deepEqual(json(r, `testWrites.filter(w => w.op === 'set' && w.path && w.path[w.path.length - 2] === 'receipts')`), [], 'לא נשמר לפני "שמור"');
  await r.run('confirmReceipt()');
  assert.equal(json(r, `testWrites.filter(w => w.op === 'set' && w.path && w.path[w.path.length - 2] === 'receipts')`).length, 1);
});

test('"יש חוסרים או עודפים" ממסך הניירות — לקליטה, ומסך הסימון נפתח עם שורות הנייר', async () => {
  const r = app(delivery('77001234'));
  await readPapers(r);
  r.click('paper-all-in');
  r.click('paper-quantity-differences');
  assert.equal(r.run('currentView'), 'receiving');
  assert.ok(r.run('!!receiptQuantityReview'), 'מסך הסימון');
  assert.equal(r.node('receiptQuantityModal').classList.contains('hidden'), false);
  assert.equal(r.run('receiptQuantityReview.rows.length'), json(r, 'receiptQuantityPaperRows()').length);
  assert.equal(r.run('receiptCountingMode'), 'manual');
});

test('צילום שלא נשלח (בלי רשת) — "זה כל הניירות" קורא אותו', async () => {
  const r = app(delivery('77001234'));
  r.run(`openPaperIntake({}); setView('paperIntake'); navigator.onLine = false;`);
  await photo(r, 'a');
  assert.equal(r.requests.length, 0);
  assert.equal(r.run(`paperIntake.items[0].status`), 'photo');
  r.run('navigator.onLine = true');
  r.click('paper-all-in');
  await r.run('paperJoinChain'); await settle();
  assert.equal(r.requests.length, 1, 'נקרא');
  assert.equal(r.run('receiptPaperScanState'), 'ok');
});
