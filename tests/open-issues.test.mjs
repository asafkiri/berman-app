// v129 — בלי כפתור "מאזן" בפס: מה שפתוח מול ברמן מוסבר במשפטים, במסך הקליטה ובניהול.
// מה שנבדק:
// - עם 141 ו-142 (4–5.10): "2 דברים לטיפול מול ברמן" — קודם חיוב כפול, אחר כך שאלת התיקון; לחיצה — למאזן.
//   בלי "N תעודות עם הפרש פתוח", ובפס רק המצלמה והגלריה.
// - בזמן ספירה — שורה אחת קצרה.
// - קליטה פתוחה שהמאזן לא רואה (לפני תחילת המאזן): "בקליטה של 20.8: חסר …, עודף …" — לחיצה להיסטוריה.
// - אין מה לטפל — אין כלום; גם בניהול.
// הרצה: node --test tests/open-issues.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runtime, fixture } from './receipt-scan-harness.mjs';

const L = JSON.parse(fs.readFileSync(new URL('./ledger-2026-10.json', import.meta.url), 'utf8'));
const strip = h => h.replace(/<[^>]+>/g, ' ').replace(/&#039;/g, "'").replace(/\s+/g, ' ');
function app(papersList, opts = {}) {
  const r = runtime({ data: { ...fixture(), products: L.products } });
  r.context.testL = { receipts: opts.receipts || L.receipts.slice().reverse(), returns: opts.returns || L.returns.slice().reverse(), papers: papersList };
  r.run(`receipts = testL.receipts; returns = testL.returns; papers = testL.papers; todayStr = () => '2026-10-05'; ledgerInvalidate();`);
  return r;
}

test('עם 141 ו-142: שני משפטים במסך הקליטה, בלי "תעודות עם הפרש פתוח", ובפס בלי מאזן', () => {
  const r = app([L.papers.p141, L.papers.p142]);
  r.run(`setView('receiving')`);
  const html = r.node('app').innerHTML, text = strip(html);
  assert.match(text, /2 דברים לטיפול מול ברמן חויבת פעמיים על לחמניות 10 בשקית ×2 — לבקש זיכוי מהנהג ← נייר החיוב 95141 .* וזה התיקון ←/);
  assert.doesNotMatch(text, /תעודות עם הפרש פתוח/);
  assert.equal((html.match(/data-role="ledger-open"/g) || []).length, 2, 'כל משפט — למאזן');
  assert.doesNotMatch(r.node('ledgerBar').innerHTML, /ledger-open|מאזן/);
  assert.match(r.node('ledgerBar').innerHTML, /data-role="paper-photo"[\s\S]*data-role="paper-gallery"/);
  // "כן, זה תיקון" — נשאר רק החיוב הכפול
  r.context.decl = { schema: 1, kind: 'declared', state: 'accepted', docDay: '2026-10-04', timestamp: 2, id: 'decl_corr_1', declare: 'correction',
    rows: [{ line: 1, itemCode: '100', productId: 'code_100', qty: 13 }], standsFor: { returnId: L.returns.find(x => (x.docDate || x.date) === '2026-10-04').id, chargePaperId: L.papers.p141.id } };
  r.run(`papers = papers.concat([decl]); ledgerInvalidate(); setView('receiving')`);
  assert.match(strip(r.node('app').innerHTML), /דבר אחד לטיפול מול ברמן חויבת פעמיים/);
  // בזמן ספירה — שורה אחת
  const compact = r.run(`openIssuesBannerHtml({ compact: true })`);
  assert.match(strip(compact), /^ ?דבר אחד לטיפול מול ברמן ←/);
  assert.equal((compact.match(/<button/g) || []).length, 1);
});

test('קליטה פתוחה מלפני תחילת המאזן — המשפט אומר מה חסר ומה בעודף; לחיצה להיסטוריה', () => {
  const rc = { id: 'rc_old', date: '2026-08-20', timestamp: 1, items: [
    { productId: 'code_344', name: 'לחם כוסמין', qty: 3, noteQty: 5 }, { productId: 'code_101', name: 'אחיד פרוס', qty: 4, noteQty: 3 }] };
  const r = app([], { receipts: [rc], returns: [] });
  const list = JSON.parse(r.run('JSON.stringify(openIssuesList())'));
  assert.deepEqual(list, [{ state: 'problem', text: 'בקליטה של 20.8: חסר לחם כוסמין ×2 · עודף אחיד פרוס ×1', role: 'rc-history' }]);
  r.run(`setView('manage')`);
  assert.match(strip(r.node('app').innerHTML), /דבר אחד לטיפול מול ברמן בקליטה של 20\.8: חסר לחם כוסמין ×2 · עודף אחיד פרוס ×1/);
  assert.match(r.node('app').innerHTML, /data-role="rc-history"/);
});

test('אין מה לטפל — אין שורה', () => {
  const r = app([], { receipts: [{ id: 'rc_ok', date: '2026-10-04', timestamp: 1, items: [{ productId: 'code_101', name: 'x', qty: 3, noteQty: 3 }] }], returns: [] });
  assert.equal(r.run('openIssuesBannerHtml({})'), '');
  r.run(`setView('receiving')`);
  assert.doesNotMatch(r.node('app').innerHTML, /לטיפול מול ברמן/);
});
