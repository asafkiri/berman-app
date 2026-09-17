// מי עונה על הפער: הנייר או הבלש.
// בשטח הוצג הבלש גם כשהתעודה צולמה ונקראה שורה-שורה. על פער של ₪20.84 ושתי
// יחידות הוא הציע מוצר אחר לגמרי שסגר את הסכום עד 3 אגורות ואת היחידות בדיוק
// — התאמה מתמטית מצוינת, ופשוט לא מה שקרה. הנייר ידע את התשובה האמיתית.
// הכלל: פענוח מאומת עונה; פענוח שאינו מאומת אינו יודע, ושם הבלש עדיין נחוץ.
// הבדיקה השנייה היא זו שנושאת את האמינות — קריאה שאיבדה שורה מייחסת "עודף"
// שמעולם לא קרה, ו-basketComplete אינו מבדיל אותה מקריאה תקינה.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, fixture } from './receipt-scan-harness.mjs';

const json = (r, expr) => JSON.parse(r.run('JSON.stringify(' + expr + ')'));
function shortOneUnit(data) {
  const doc = data.paper.scan.documents[0];
  data.items = doc.rows.map(row => {
    const product = data.products.find(p => p.code === row.itemCode);
    return { productId: product.id, name: product.name, barcode: product.barcode,
      qty: row.quantity - (row.itemCode === '101' ? 1 : 0) };
  });
  return doc;
}

test('a verified paper read answers the gap itself — the detective never appears', async () => {
  const data = fixture();
  shortOneUnit(data);
  const r = runtime({ data });
  await r.scan();
  r.run('openReconcile()');
  assert.equal(r.run('aiScanEvaluation.valid'), true);
  assert.equal(r.run('rcStep'), 'ai');
  const html = r.node('app').innerHTML;
  assert.ok(!/data-role="detective-solution"/.test(html), 'no guessed suspects when the paper knows');
  assert.ok(/data-role="ai-apply"/.test(html), 'the paper answer must be applicable in one tap');
  assert.deepEqual(json(r, '(aiScanEvaluation.findings||[]).map(f => f.type + ":" + f.qty)'), ['shortage:1']);
});

test('the paper answer resolves the gap per product, and the receipt closes', async () => {
  const data = fixture();
  shortOneUnit(data);
  const r = runtime({ data });
  await r.scan();
  r.run('openReconcile()');
  r.click('ai-apply');
  assert.equal(r.run('reconcileIsBalanced()'), true);
  assert.equal(r.run('reconcilePaperEntered'), true);
  assert.equal(r.run('!!reconcileAiAudit'), true, 'the paper route also leaves an audit trail');
  const line = json(r, 'reconcileData.find(l => l.productId === "code_101")');
  assert.equal(line.noteQty, 12);
});

test('an unverified read does NOT answer the gap — the detective is still the route', async () => {
  const data = fixture();
  const doc = shortOneUnit(data);
  const total = doc.netToChargeExVat, units = doc.totalUnits, lines = doc.printedLines;
  doc.rows = doc.rows.filter(row => row.itemCode !== '101'); // a line the scan never read
  const r = runtime({ data });
  r.run('receiptOpened = true; receiptDocDate = "2026-09-09"; receiptEntryMode = "manual";'
    + 'receiptNotes = [normNote({amount:' + total + ',units:' + units + ',lines:' + lines + ',kind:"charge"})];'
    + 'recomputeNoteTotal(); receiptAnchorSource = "manual";'
    + 'receiptList = structuredClone(testData.items); saveReceiptDraft(); openReconcile();');
  r.click('ai-rescan');
  r.run('aiScanDocuments[0].pages = [{ dataUrl: "data:image/jpeg;base64,Zml4dHVyZQ==", orientationConfirmed: true }];');
  await r.run('aiRunInvoiceScan()');
  r.run('currentView="receiving"; reconcileData=null;');
  r.run('openReconcile()');
  assert.equal(r.run('aiScanEvaluation.valid'), false);
  // basketComplete cannot tell this read apart from a good one — that is why it
  // must not be the gate. Its own finding here is a surplus that never happened.
  assert.equal(r.run('!!aiScanEvaluation.basketComplete'), true);
  assert.deepEqual(json(r, '(aiScanEvaluation.findings||[]).map(f => f.type)'), ['surplus']);
  assert.equal(r.run('rcStep'), 'detective');
  assert.ok(/data-role="detective-solution"/.test(r.node('app').innerHTML));
});

test('the question ladder cannot bring the detective back once the paper has answered', async () => {
  const data = fixture();
  shortOneUnit(data);
  const r = runtime({ data });
  await r.scan();
  r.run('receiptNoteUnits = null; rcStep = null;');
  r.run('openReconcile()');
  assert.notEqual(r.run('rcStep'), 'detective-question');
  assert.equal(r.run('rcStep'), 'ai');
});
