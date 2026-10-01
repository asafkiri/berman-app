// v111 — אותו נייר פעמיים. 1.10.2026: תעודה 244723990 מ־30.9 צולמה שוב
// ונקלטה כתעודה של 1.10, בלי אזהרה, כי בדיקת הכפילות השוותה רק לתעודות
// מאותו יום קליטה. מעכשיו מספר התעודה המודפס מזהה נייר שכבר נקלט — בהודעה
// אדומה בקליטה, ובאישור מפורש לפני השמירה.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, fixture } from './receipt-scan-harness.mjs';

const NUMBER = '244723990';
const prior = (fields = {}) => ({ id: 'yesterday', timestamp: Date.UTC(2026, 8, 30, 15, 8), date: '2026-09-30', docDate: '2026-09-30',
  status: 'ok', noteTotalInc: 691.13, totalExVat: 691.13, count: 16, items: [],
  priceAudit: { documents: [{ number: NUMBER, date: '2026-09-30' }] }, ...fields });
async function scanned(receipts, number = NUMBER) {
  const data = fixture(); data.paper.scan.documents[0].docNumber = number;
  const c = runtime({ data });
  c.context.priorReceipts = receipts;
  c.run("receipts = priorReceipts; currentView='receiving'; mainMode='receiving'; globalThis.confirms = []; showConfirm = (title, text, ok, fn) => confirms.push({ title, text, ok, fn })");
  await c.scan(); c.run('renderReceiving()');
  return c;
}
const confirms = c => JSON.parse(c.run('JSON.stringify(confirms.map(x => [x.title, x.text]))'));

test('a paper whose printed number was already received is flagged in receiving and stopped before saving', async () => {
  const c = await scanned([prior()]);
  const html = c.node('app').innerHTML;
  assert.match(html, /data-duplicate-paper/);
  assert.match(html, /הנייר הזה כבר נקלט/);
  assert.match(html, /תעודה 244723990 כבר נקלטה ב־/);
  assert.match(html, /₪691\.13/);
  c.run('finishReceipt()');
  const [first] = confirms(c);
  assert.equal(first[0], 'התעודה כבר נקלטה');
  assert.match(first[1], /^תעודה 244723990 כבר נקלטה ב־.* \(₪691\.13\)\. קליטה נוספת תספור אותה פעמיים\. לקלוט בכל זאת\?$/);
  assert.equal(c.run('pendingReceipt'), null);
  assert.equal(c.writes.length, 0);
  c.run('confirms[0].fn()');
  assert.equal(c.run('receiptDupConfirmed'), true);
  assert.equal(confirms(c).filter(x => x[0] === 'התעודה כבר נקלטה').length, 1, 'an explicit confirmation is not asked again');
});
test('the number is also found in the stored scan response of an older receipt', async () => {
  const c = await scanned([prior({ priceAudit: null, paperScan: { response: { scan: { documents: [{ docNumber: Number(NUMBER) }] } } } })]);
  assert.match(c.node('app').innerHTML, /תעודה 244723990 כבר נקלטה/);
});
test('a different paper number, or a missing one, is not a duplicate', async () => {
  for (const number of ['244726222', null]) {
    const c = await scanned([prior()], number);
    assert.doesNotMatch(c.node('app').innerHTML, /data-duplicate-paper/);
    c.run('finishReceipt()');
    assert.equal(confirms(c).filter(x => x[0] === 'התעודה כבר נקלטה').length, 0);
  }
});
test('the receipt being saved, or the receipt a paper is attached to, never counts as its own duplicate', async () => {
  const c = await scanned([prior({ id: 'self' })]);
  c.run("receiptDraftId = 'self'; renderReceiving()");
  assert.doesNotMatch(c.node('app').innerHTML, /data-duplicate-paper/);
  c.run("receiptDraftId = null; receiptAttachTarget = { id: 'self', timestamp: 1, date: '2026-09-30' }; renderReceiving()");
  assert.doesNotMatch(c.node('app').innerHTML, /data-duplicate-paper/);
  c.run("receiptAttachTarget = null; pendingReceipt = { operationId: 'self' }");
  assert.equal(c.run('receiptAlreadyReceivedPapers().length'), 0);
});
test('a receipt deleted to the recycle bin no longer blocks receiving the same paper again', async () => {
  const c = await scanned([]);
  assert.doesNotMatch(c.node('app').innerHTML, /data-duplicate-paper/);
  assert.equal(c.run('receiptAlreadyReceivedPapers().length'), 0);
});
