// v129 — בלי כפתור "מאזן" בפס: מה שפתוח מול ברמן מוסבר במשפטים, במסך הקליטה ובניהול.
// מה שנבדק:
// - עם 141 ו-142 (4–5.10): "דבר אחד לטיפול מול ברמן" — החיוב הכפול (v130: התיקון של לחם אחיד מזוהה לבד);
//   לחיצה — למאזן. בלי "N תעודות עם הפרש פתוח", ובפס רק המצלמה והגלריה.
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

test('עם 141 ו-142: משפט אחד במסך הקליטה, בלי "תעודות עם הפרש פתוח", ובפס בלי מאזן', () => {
  const r = app([L.papers.p141, L.papers.p142]);
  r.run(`setView('receiving')`);
  const html = r.node('app').innerHTML, text = strip(html);
  assert.match(text, /דבר אחד לטיפול מול ברמן חויבת פעמיים על לחמניות 10 בשקית ×2 — לבקש זיכוי מהנהג ←/);
  assert.doesNotMatch(text, /וזה התיקון|תיקון של ברמן/, 'התיקון שזוהה לבד — לידיעה, לא בשורה האדומה');
  assert.doesNotMatch(text, /תעודות עם הפרש פתוח/);
  assert.equal((html.match(/data-role="ledger-open"/g) || []).length, 1, 'המשפט — למאזן');
  assert.doesNotMatch(r.node('ledgerBar').innerHTML, /ledger-open|מאזן/);
  assert.match(r.node('ledgerBar').innerHTML, /data-role="paper-photo"[\s\S]*data-role="paper-gallery"/);
  // תשובה ישנה "כן, זה תיקון" — אותו דבר
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

// ===== v130: הכל בקליטה — בלי שאלות =====
const tick = () => new Promise(res => setImmediate(res));
const flush = async () => { for (let i = 0; i < 20; i++) await tick(); };
function live(r) {
  r.context.testWrites = [];
  r.run(`runCloudTask = async (label, task) => { testWrites.push(JSON.parse(JSON.stringify(task))); return true; }; runCloudTaskSilent = runCloudTask;`);
  return r;
}
// נייר חיוב קטן שנקרא לפני v130 (238 ×1 — אין עודף כזה בקליטות של אוקטובר)
const charge = (extra = {}) => ({ schema: 1, rev: 1, state: 'accepted', id: 'paper_290095200', kind: 'charge', kindKnown: true, number: '290095200', terminalNumber: '290095200',
  headerText: 'ת.משלוח', docDay: '2026-10-05', printedTime: '10:00', timestamp: Date.parse('2026-10-05T10:00:00'), writtenBy: '129', captureId: 'cap200',
  rows: [{ line: 1, itemCode: '238', barcode: '', description: '238', qty: 1, productId: 'code_238', matchedBy: 'code' }],
  anchors: { units: 1, lines: 1, source: 'printed' }, proof: { unitsOk: true, linesOk: true }, ...extra });
// שאלות שהיו פעם בקליטה ובמאזן — אף אחת מהן לא מוצגת בשורה האדומה
const QUESTION_ROLES = /data-role="(paper-goods-yes|paper-goods-no|ledger-declare-correction|ledger-ack-offset|ledger-attach|ledger-accept-swap|ledger-return-complete)"/;

test('בלי שאלות: בשורה האדומה אין "הגיעה סחורה?", אין "כן, זה תיקון", אין "לאיזו החזרה?" ואין "לקזז?" — רק משפטים', () => {
  const r = live(app([L.papers.p141, L.papers.p142, charge()]));
  const list = JSON.parse(r.run('JSON.stringify(openIssuesList())'));
  assert.ok(!list.some(x => x.state === 'question'), JSON.stringify(list));
  assert.ok(!list.some(x => /הגיעה סחורה|\?$/.test(x.text)), 'אף משפט לא נגמר בשאלה');
  r.run(`setView('receiving')`);
  assert.doesNotMatch(r.node('app').innerHTML, QUESTION_ROLES);
  // נייר חיוב בלי עודף מתאים — עד המשלוח הבא "ממתין" (לא בשורה האדומה); אחר כך — לבקש זיכוי
  assert.ok(!list.some(x => /נייר החיוב 95200/.test(x.text)));
  const later = live(app([charge({ docDay: '2026-10-04' })]));
  assert.ok(JSON.parse(later.run('JSON.stringify(openIssuesList())')).some(x => /נייר החיוב 95200 .*מחייב .* — לבקש זיכוי מהנהג/.test(x.text)));
  // בכרטיס הנייר — בלי "הגיעה סחורה?"
  const card = r.run(`paperIntakeItemHtml({ status: 'saved', paperId: 'paper_290095200', captureId: 'cap200' })`);
  assert.doesNotMatch(card, /הגיעה סחורה|paper-goods/);
});

test('נייר שלא נקרא עד הסוף — "לבדיקה" בתוך המשפט, ו"חזרה" חוזרת לקליטה', async () => {
  const unread = charge({ id: 'paper_x', number: '290095150', terminalNumber: '290095150', state: 'needs-review', kind: 'credit' });
  const r = live(app([L.papers.p141, L.papers.p142, unread]));
  r.run(`setView('receiving')`);
  const html = r.node('app').innerHTML;
  assert.match(html, /data-role="ledger-paper-open"[^>]*data-paper="paper_x"[^>]*>לבדיקה</);
  assert.doesNotMatch(html, />פרטים</, 'בלי "פרטים" בקליטה');
  await r.run(`openPaperReview('paper_290095142')`);
  r.run(`paperUiClick({ dataset: { role: 'review-back' } })`);
  assert.equal(r.run('currentView'), 'receiving');
});
