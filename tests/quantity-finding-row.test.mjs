// v100: the shortage/surplus row shows billed · scanned · gap — but only when the
// arithmetic closes; otherwise it falls back to the plain one-line row.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, fixture } from './receipt-scan-harness.mjs';

const strip = s => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const cells = h => Object.fromEntries([...h.matchAll(/<div class="text-\[10px\] font-bold text-slate-500">([^<]*)<\/div><div class="text-base font-black [^"]*">([^<]*)<\/div>/g)].map(m => [m[1], m[2]]));
const ROW = '<div class="py-2 border-t border-black/5 first:border-t-0">';
function rowCells(html, name) {
  const start = html.indexOf(name, html.indexOf('אלה הבעיות שנמצאו'));
  assert.ok(start > 0, name);
  const end = html.indexOf(ROW, start);
  return cells(html.slice(start, end < 0 ? undefined : end));
}
function row(r, { billed, scanned, finding, type = 'shortage', basketComplete = true, hasAgg = billed != null }) {
  r.context.rowFinding = finding;
  return r.run(`aiScanEvaluation = { aggregates: new Map(${hasAgg ? `[['p1', { qty: ${billed} }]]` : '[]'}), basketComplete: ${basketComplete} };
    reconcileData = ${scanned == null ? '[]' : `[{ productId: 'p1', received: ${scanned} }]`};
    aiQuantityFindingRowHtml(rowFinding, '${type}', 'head')`);
}

test('engine shortage: three cells and a sentence that closes', () => {
  const h = row(runtime(), { billed: 24, scanned: 12, finding: { type: 'shortage', productId: 'p1', name: 'לחם אחיד', qty: 12 } });
  assert.deepEqual(cells(h), { 'חויב בתעודה': '24', 'נסרק בפועל': '12', 'חסר': '12' });
  assert.ok(strip(h).includes('נסרקו 12 יח׳ מתוך 24 שחויבו בתעודה'));
  assert.ok(strip(h).startsWith('לחם אחיד חסר 12 יח׳'));
});

test('surplus on the paper: wording does not say "out of"', () => {
  const h = row(runtime(), { billed: 12, scanned: 15, type: 'surplus', finding: { type: 'surplus', productId: 'p1', name: 'חלה', qty: 3 } });
  assert.deepEqual(cells(h), { 'חויב בתעודה': '12', 'נסרק בפועל': '15', 'עודף': '3' });
  assert.ok(strip(h).includes('חויבו 12 יח׳ בתעודה ונסרקו 15'));
});

test('surplus not on the paper: billed 0', () => {
  const h = row(runtime(), { billed: null, scanned: 4, type: 'surplus', finding: { type: 'surplus', productId: 'p1', name: 'פיתות', qty: 4 } });
  assert.deepEqual(cells(h), { 'חויב בתעודה': '0', 'נסרק בפועל': '4', 'עודף': '4' });
  assert.ok(strip(h).includes('המוצר לא מופיע בתעודה, ונסרקו 4 יח׳'));
});

test('a finding whose qty is not billed − scanned (analyzer claim) keeps the plain row', () => {
  const h = row(runtime(), { billed: 6, scanned: 6, finding: { type: 'shortage', productId: 'p1', name: 'חלה', qty: 1, claimId: 'claim-0' } });
  assert.deepEqual(cells(h), {});
  assert.equal(strip(h), 'חלה חסר 1 יח׳');
});

test('partial basket: "billed" is labelled as resolved rows only', () => {
  const h = row(runtime(), { billed: 12, scanned: 10, basketComplete: false, finding: { type: 'shortage', productId: 'p1', name: 'לחם', qty: 2 } });
  assert.deepEqual(cells(h), { 'חויב (שורות שזוהו)': '12', 'נסרק בפועל': '10', 'חסר': '2' });
  assert.ok(strip(h).includes('לא כל התעודה נקראה'));
});

test('degenerate states never throw and never leak NaN/undefined', () => {
  const r = runtime();
  const f = JSON.stringify({ type: 'shortage', productId: 'p1', name: 'x', qty: 2 });
  for (const setup of [
    'aiScanEvaluation = null; reconcileData = null;',
    'aiScanEvaluation = {}; reconcileData = undefined;',
    "aiScanEvaluation = { aggregates: { p1: { qty: 3 } } }; reconcileData = [];",
    "aiScanEvaluation = { aggregates: new Map([['p1', { qty: 3 }]]) }; reconcileData = [null, { productId: 'p1', received: 1 }];",
    "aiScanEvaluation = { aggregates: new Map([['p1', { qty: '3' }]]) }; reconcileData = [{ productId: 'p1', received: '1' }];"
  ]) {
    const h = r.run(setup + ' aiCompactFindingGroupHtml("shortage", "חוסרים", [' + f + '])');
    assert.ok(h.includes('חסר 2 יח׳'), setup);
    assert.ok(!/NaN|undefined|null/.test(strip(h)), setup);
  }
  assert.equal(r.run("aiScanEvaluation = null; aiQuantityFindingRowHtml(null, 'shortage', 'h').includes('חסר 0 יח׳')"), true);
});

test('real scan: every rendered row closes against the engine numbers', async () => {
  const data = fixture();
  const extra = data.products.find(p => p.code === '119');
  data.items.push({ productId: extra.id, name: extra.name, barcode: extra.barcode, qty: 3 });
  const r = runtime({ data });
  await r.scan();
  r.run('openReconcile()');
  assert.equal(r.run('rcStep'), 'ai');
  r.run('aiDetailsOpen = true; renderReconcile();');
  const html = r.node('app').innerHTML;
  assert.ok(!/התצוגה נכשלה/.test(html));
  const findings = JSON.parse(r.run('JSON.stringify(aiScanEvaluation.findings.filter(f => f.type === "shortage" || f.type === "surplus").map(f => ({ type: f.type, name: f.name, qty: f.qty, billed: (aiScanEvaluation.aggregates.get(f.productId) || { qty: 0 }).qty, scanned: (reconcileData.find(l => l.productId === f.productId) || { received: 0 }).received })))'));
  assert.ok(findings.some(f => f.type === 'surplus' && f.name === extra.name), 'surplus for the product not on the paper');
  for (const f of findings) {
    const label = f.type === 'shortage' ? 'חסר' : 'עודף';
    const c = rowCells(html, f.name);
    assert.equal(Number(c['חויב בתעודה']), f.billed, f.name);
    assert.equal(Number(c['נסרק בפועל']), f.scanned, f.name);
    assert.equal(Number(c[label]), f.qty, f.name);
  }
});
