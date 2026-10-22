// v148: the received quantity is corrected from the shortage/surplus row of the
// main card ("יש הבדלים מול הנייר"). "חסר 80" → type 64 → the row says "חסר 16";
// type 80 (or "הגיע הכול") → the shortage is gone. The edit is the same count:
// it reaches the comparison row, the scan list and the saved draft, and the
// findings are rebuilt locally without a paid call. Reopening the comparison
// keeps the edit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, fixture } from './receipt-scan-harness.mjs';

const strip = s => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const cells = h => Object.fromEntries([...h.matchAll(/<div class="text-\[10px\] font-bold text-slate-500">([^<]*)<\/div><div class="text-base font-black [^"]*">([^<]*)<\/div>/g)].map(m => [m[1], m[2]]));
const MAIN_ROW = '<div class="bg-white rounded-xl px-3 py-2.5 mt-2">';
function mainCard(html) {
  const start = html.indexOf('יש הבדלים מול הנייר');
  return start < 0 ? '' : html.slice(start, html.indexOf('רוצה הסבר מה קרה בתעודה', start));
}
function mainRow(html, name) {
  const card = mainCard(html);
  const start = card.indexOf(name);
  if (start < 0) return '';
  const end = card.indexOf(MAIN_ROW, start);
  return card.slice(start, end < 0 ? undefined : end);
}
const editors = html => (html.match(/data-role="ai-recv-input"/g) || []).length;
const inputValue = (html, pid) => { const m = html.match(new RegExp('data-role="ai-recv-input" data-id="' + pid + '"[^>]*value="(\\d+)"')); return m ? Number(m[1]) : null; };
const quickButton = (html, pid) => { const m = html.match(new RegExp('<button type="button" data-role="ai-recv-set" data-id="' + pid + '" data-qty="(\\d+)"[^>]*>([^<]*)<')); return m ? { qty: Number(m[1]), text: m[2] } : null; };
const findings = r => JSON.parse(r.run('JSON.stringify((aiScanEvaluation.findings || []).filter(f => f.type === "shortage" || f.type === "surplus").map(f => [f.type, f.productId, f.qty]))'));
const counts = r => JSON.parse(r.run('JSON.stringify({ list: receiptList.map(l => [l.productId, l.qty]), rows: reconcileData.filter(l => !l.isDeposit).map(l => [l.productId, l.received]), source: localReconcileSource })'));

// The fixture paper: 238 ×4, 2381 ×5, 2387 ×3 (and two clean lines). The count
// is one short on 238 and 2381 and one over on 2387.
async function differencesScreen() {
  const data = fixture();
  const r = runtime({ data });
  await r.scan();
  r.run('openReconcile()');
  assert.equal(r.run('rcStep'), 'ai');
  const ids = JSON.parse(r.run('JSON.stringify(Object.fromEntries(["238", "2381", "2387"].map(code => [code, products.find(p => p.code === code).id])))'));
  return { r, ids };
}
function change(r, pid, value) {
  const target = { dataset: { id: pid }, value: String(value), getAttribute: n => n === 'data-role' ? 'ai-recv-input' : null };
  return r.events.get('app:change')({ target });
}
// The harness click carries role and id only; the editor's buttons also carry delta / qty.
function click(r, role, id, dataset) {
  const target = { dataset: { role, id, ...dataset }, closest: selector => selector === '[data-role]' ? target : null };
  return r.events.get('app:click')({ target });
}

test('typing a received quantity on the main card row updates the shortage at once', async () => {
  const { r, ids } = await differencesScreen();
  let html = r.node('app').innerHTML;
  const name = r.run('products.find(p => p.code === "238").name');
  assert.deepEqual(findings(r).filter(f => f[1] === ids['238']), [['shortage', ids['238'], 1]]);
  assert.deepEqual(cells(mainRow(html, name)), { 'חויב בתעודה': '4', 'נסרק בפועל': '3', 'חסר': '1' });
  assert.equal(editors(html), 3, 'one editor per difference row, in the main card');
  assert.equal(inputValue(html, ids['238']), 3);
  assert.deepEqual(quickButton(html, ids['238']), { qty: 4, text: 'הגיע הכול (4)' });

  change(r, ids['238'], '1');
  html = r.node('app').innerHTML;
  assert.deepEqual(findings(r).filter(f => f[1] === ids['238']), [['shortage', ids['238'], 3]]);
  assert.deepEqual(cells(mainRow(html, name)), { 'חויב בתעודה': '4', 'נסרק בפועל': '1', 'חסר': '3' });
  assert.equal(inputValue(html, ids['238']), 1);
  const after = counts(r);
  assert.deepEqual(after.list.find(l => l[0] === ids['238']), [ids['238'], 1]);
  assert.deepEqual(after.rows.find(l => l[0] === ids['238']), [ids['238'], 1]);
  assert.deepEqual(after.source.find(l => l[0] === ids['238']), [ids['238'], 1], 'the comparison baseline moved with the count');
  assert.ok(r.toasts.at(-1).includes('התקבלו 1 יח׳') && r.toasts.at(-1).includes('עדיין חסר 3'), r.toasts.at(-1));
  assert.equal(r.requests.length, 1, 'no paid call for an edit');
});

test('"הגיע הכול" and "כמו בתעודה" close every difference; the paper then closes against the count', async () => {
  const { r, ids } = await differencesScreen();
  assert.deepEqual(quickButton(r.node('app').innerHTML, ids['2387']), { qty: 3, text: 'כמו בתעודה (3)' });
  click(r, 'ai-recv-set', ids['238'], { qty: '4' });
  click(r, 'ai-recv-set', ids['2381'], { qty: '5' });
  click(r, 'ai-recv-set', ids['2387'], { qty: '3' });
  const html = r.node('app').innerHTML;
  assert.deepEqual(findings(r), []);
  assert.equal(mainCard(html), '', 'no differences card any more');
  assert.equal(editors(html), 0);
  assert.equal(r.run('aiScanEvaluation.valid'), true);
  assert.ok(r.toasts.at(-1).includes('אין חוסר או עודף'), r.toasts.at(-1));
});

test('plus and minus step the received quantity by one unit, never below zero', async () => {
  const { r, ids } = await differencesScreen();
  click(r, 'ai-recv-step', ids['238'], { delta: '1' });
  assert.deepEqual(findings(r).filter(f => f[1] === ids['238']), []);
  click(r, 'ai-recv-step', ids['238'], { delta: '1' });
  assert.deepEqual(findings(r).filter(f => f[1] === ids['238']), [['surplus', ids['238'], 1]]);
  for (let i = 0; i < 6; i++) click(r, 'ai-recv-step', ids['238'], { delta: '-1' });
  assert.deepEqual(findings(r).filter(f => f[1] === ids['238']), [['shortage', ids['238'], 4]]);
  assert.ok(new RegExp('data-role="ai-recv-step" data-id="' + ids['238'] + '" data-delta="-1"[^>]* disabled>').test(r.node('app').innerHTML));
  assert.equal(counts(r).list.some(l => l[0] === ids['238']), false, 'a zero count leaves the scan list');
});

test('the edit survives reopening the comparison from the count', async () => {
  const { r, ids } = await differencesScreen();
  change(r, ids['238'], '2');
  assert.deepEqual(findings(r).filter(f => f[1] === ids['238']), [['shortage', ids['238'], 2]]);
  r.run("setView('receiving')");
  r.run('openReconcile()');
  assert.equal(r.run('rcStep'), 'ai');
  assert.deepEqual(findings(r).filter(f => f[1] === ids['238']), [['shortage', ids['238'], 2]]);
  assert.deepEqual(counts(r).rows.find(l => l[0] === ids['238']), [ids['238'], 2]);
});

test('the edit is in the saved draft: a restart restores the corrected count and findings', async () => {
  const { r, ids } = await differencesScreen();
  change(r, ids['238'], '2');
  const again = runtime({ storage: r.storage, data: fixture() });
  assert.deepEqual(JSON.parse(again.run('JSON.stringify(receiptList.map(l => [l.productId, l.qty]))')).find(l => l[0] === ids['238']), [ids['238'], 2]);
  again.run('openReconcile()');
  assert.deepEqual(findings(again).filter(f => f[1] === ids['238']), [['shortage', ids['238'], 2]]);
});

test('bad input is refused without touching the count; a stale analyzer answer is dropped', async () => {
  const { r, ids } = await differencesScreen();
  change(r, ids['238'], 'abc');
  assert.deepEqual(findings(r).filter(f => f[1] === ids['238']), [['shortage', ids['238'], 1]]);
  assert.ok(r.toasts.at(-1).includes('הקלד מספר'), r.toasts.at(-1));
  assert.equal(r.run("aiSetFindingReceived('deposit-recv-x', 3)"), false);
  assert.equal(r.run("aiSetFindingReceived('', 3)"), false);
  r.run("aiAnalyzeResult = { accepted: true, claims: [], findings: [], closure: { ok: true } }; aiScanEvaluation.analyzerLed = true;");
  change(r, ids['238'], '0');
  assert.equal(r.run('aiAnalyzeResult'), null);
  assert.equal(r.run('aiScanEvaluation.analyzerLed === true'), false);
  assert.deepEqual(findings(r).filter(f => f[1] === ids['238']), [['shortage', ids['238'], 4]]);
});

test('details open: the engine rows behind "רוצה הסבר" carry no second editor', async () => {
  const { r } = await differencesScreen();
  r.run('aiDetailsOpen = true; renderReconcile();');
  const html = r.node('app').innerHTML;
  assert.ok(html.includes('אלה הבעיות שנמצאו'), 'engine rows are shown');
  assert.equal(editors(html), 3, 'still one editor per product');
  assert.equal(editors(mainCard(html)), 3, 'all of them in the main card');
});

test('no editor when the receipt is read-only or there is no saved read', () => {
  const r = runtime();
  r.run("aiScanEvaluation = { aggregates: new Map([['p1', { qty: 10 }]]), basketComplete: true }; reconcileData = [{ productId: 'p1', received: 2 }];");
  assert.equal(r.run("aiScanResponse = null; aiQuantityFindingEditorHtml('p1', true)"), '');
  assert.ok(r.run("aiScanResponse = { scan: { documents: [] } }; aiQuantityFindingEditorHtml('p1', true)").includes('ai-recv-input'));
  assert.equal(r.run("canEditSharedReceipt = () => false; aiQuantityFindingEditorHtml('p1', true)"), '');
  assert.equal(r.run("aiQuantityFindingEditorHtml('deposit-recv-p1', true)"), '');
});
