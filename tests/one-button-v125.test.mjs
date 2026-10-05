// v126 מול v125 על אותה קליטה משותפת (בזמן שהטלפונים מתעדכנים). המטען נבנה כאן ב-v126,
// ותהליך-בן מריץ עליו את index.html של v125 בדיוק כפי שמוזג (git show dceb89c).
// מה שנבדק: v125 רואה את הסבב כ"פענוח שרץ בטלפון אחר" (ספינר, הסיום מחכה), "הפעל שוב"
// שלו לא שולח בקשה (אין עמודים); את התעודה שנכנסה הוא מאמץ כקריאה שלו — בלי בקשה, גם
// אחרי ריענון — ועריכה שלו לא מוחקת את מקור הנייר.
// הרצה: node --test tests/one-button-v125.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const REPO = path.dirname(path.dirname(SELF));
const V125 = 'dceb89c';

if (!process.env.ONE_BUTTON_V125_PAYLOADS) {
  test('טלפון ב-v125 על קליטה של v126: ספינר וסיום שמחכה, "הפעל שוב" בלי בקשה, התעודה שנכנסה — כקריאה שלו', async t => {
    let source;
    try { source = execFileSync('git', ['show', V125 + ':index.html'], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { t.skip('אין git או שהגרסה ' + V125 + ' לא קיימת במאגר'); return; }
    const { app, delivery, startRound, until, plain } = await import('./one-button-helpers.mjs');
    const a = app(delivery());
    const release = a.hold();
    const round = startRound(a);
    await until(() => a.requests.length === 1);
    const waiting = plain(a.run('captureSharedReceipt()'));
    release(); await round; await a.run('paperJoinChain');
    const joined = plain(a.run('captureSharedReceipt()'));
    assert.equal(joined.state.receiptPaperScanState, 'ok');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'berman-v125-'));
    fs.writeFileSync(path.join(dir, 'index.html'), source);
    fs.writeFileSync(path.join(dir, 'payloads.json'), JSON.stringify({ waiting, joined, paper: delivery() }));
    const res = spawnSync(process.execPath, [SELF], { cwd: REPO, encoding: 'utf8', timeout: 120000,
      env: { ...process.env, BERMAN_TEST_APP: path.join(dir, 'index.html'), ONE_BUTTON_V125_PAYLOADS: path.join(dir, 'payloads.json') } });
    fs.rmSync(dir, { recursive: true, force: true });
    assert.equal(res.status, 0, (res.stdout || '') + (res.stderr || ''));
    assert.match(res.stdout, /v125 OK/);
  });
} else {
  // תהליך-בן: המודול הוא v125 (BERMAN_TEST_APP)
  const { runtime, fixture } = await import('./receipt-scan-harness.mjs');
  const { waiting, joined, paper } = JSON.parse(fs.readFileSync(process.env.ONE_BUTTON_V125_PAYLOADS, 'utf8'));
  const plain = v => JSON.parse(JSON.stringify(v));
  const v125 = storage => {
    const r = runtime({ data: { ...fixture(), paper }, storage: storage || new Map() });
    r.run(`returns = []; receipts = []; openReceivingScanner = () => {}; aiRunAnalyzer = async () => {};`);
    assert.equal(r.run('APP_VERSION'), '125');
    return r;
  };
  const apply = (r, payload) => { r.context.testIncoming = payload; r.run(`currentView = 'receiving'; mainMode = 'receiving'; applySharedReceipt(testIncoming, { source: 'remote' });`); };
  const banner = r => r.events.get('sharedReceivingBanner:click')({ target: { closest: () => ({ dataset: { sharedReceiving: 'scan-retry' } }) } });
  // 1. הסבב רץ בטלפון של v126
  const w = v125();
  apply(w, waiting);
  assert.equal(w.run('aiScanBusy'), true); assert.equal(w.run('receiptPaperScanState'), 'running'); assert.equal(w.run('receiptOpened'), true);
  w.run('renderReceiving()');
  assert.match(w.node('app').innerHTML, /קורא את הניירות מהנהג/);
  w.run(`receiptList = [{ productId: 'code_101', name: 'x', barcode: '', qty: 1 }]; finishReceipt();`);
  assert.ok(w.toasts.some(t => /עדיין רצה/.test(t)), 'v125: "הקריאה מהתעודה עדיין רצה"');
  assert.equal(w.run('pendingReceipt'), null);
  await banner(w);
  assert.equal(w.run('receiptPaperScanState'), 'failed');
  assert.equal(w.requests.length, 0, '"הפעל שוב" של v125 — אין עמודים, אין בקשה');
  // 2. התעודה נכנסה — v125 מאמץ אותה כקריאה שלו
  const storage = new Map();
  const j = v125(storage);
  apply(j, joined);
  assert.equal(j.run('receiptPaperScanState'), 'ok'); assert.equal(j.run('aiScanBusy'), false);
  assert.deepEqual(plain(j.run('receiptNotes.map(n => [n.units, n.lines])')), [[30, 5]]);
  j.run(`receiptList = testData.paper.scan.documents[0].rows.map(row => { const p = products.find(x => x.code === row.itemCode);
    return { productId: p.id, name: p.name, barcode: p.barcode, qty: Number(row.quantity) }; }); saveReceiptDraft();`);
  assert.equal(j.run('captureSharedReceipt().state.aiScanResponse.perDocument[0].paperId'), 'paper_77001234', 'עריכה של v125 שומרת את מקור הנייר');
  j.run('finishReceipt()');
  assert.ok(j.run('!!pendingReceipt'), 'הספירה תואמת — סיכום');
  assert.equal(j.requests.length, 0);
  // ריענון של הטלפון הישן: הקריאה חוזרת מהמכשיר שלו
  const k = v125(storage);
  assert.equal(k.run('receiptPaperScanState'), 'ok'); assert.equal(k.run('!!aiScanResponse'), true);
  assert.equal(k.requests.length, 0);
  console.log('v125 OK');
}
