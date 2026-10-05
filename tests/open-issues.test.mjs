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

// ===== v130: הכל בקליטה — "הגיעה סחורה עם הנייר הזה?", והתשובות בתוך המשפט =====
const tick = () => new Promise(res => setImmediate(res));
const flush = async () => { for (let i = 0; i < 20; i++) await tick(); };
function live(r) {
  r.context.testWrites = []; r.context.testJoins = [];
  r.run(`runCloudTask = async (label, task) => { testWrites.push(JSON.parse(JSON.stringify(task))); return true; }; runCloudTaskSilent = runCloudTask;
    receivingJoinDelivery = async o => { testJoins.push(JSON.parse(JSON.stringify(o))); return 'joined'; };`);
  return r;
}
// נייר חיוב קטן שנקרא ב-v130: 238 ×1 — אין עודף כזה בקליטות של אוקטובר
const charge = (extra = {}) => ({ schema: 1, rev: 1, state: 'accepted', id: 'paper_290095200', kind: 'charge', kindKnown: true, number: '290095200', terminalNumber: '290095200',
  headerText: 'ת.משלוח', docDay: '2026-10-05', printedTime: '10:00', timestamp: Date.parse('2026-10-05T10:00:00'), writtenBy: '130', captureId: 'cap200',
  rows: [{ line: 1, itemCode: '238', barcode: '', description: '238', qty: 1, productId: 'code_238', matchedBy: 'code' }],
  anchors: { units: 1, lines: 1, source: 'printed' }, proof: { unitsOk: true, linesOk: true }, ...extra });

test('נייר חיוב חדש ששורה בו לא מתאימה לעודף — "הגיעה סחורה?" בקליטה ובמסך הניירות; במקום מה שהמאזן אומר עליו', () => {
  const r = live(app([charge()]));
  const list = JSON.parse(r.run('JSON.stringify(openIssuesList())'));
  const q = list.find(x => /הגיעה סחורה/.test(x.text));
  assert.ok(q, JSON.stringify(list));
  assert.match(q.text, /^הגיעה סחורה עם נייר החיוב 95200 מ-5\.10 10:00 \(.* ×1\)\?$/);
  assert.deepEqual(q.actions.map(a => a.role), ['paper-goods-yes', 'paper-goods-no']);
  assert.ok(!list.some(x => /נייר החיוב 95200 .*מחייב/.test(x.text)), 'בלי המשפט של המאזן על אותו נייר, עד שעונים');
  r.run(`setView('receiving')`);
  assert.match(r.node('app').innerHTML, /data-role="paper-goods-yes"[^>]*data-paper="paper_290095200"[\s\S]*כן — לספור בקליטה[\s\S]*data-role="paper-goods-no"[\s\S]*לא — רק לאיזון/);
  // ובמסך הניירות, על הכרטיס של הנייר
  const card = r.run(`paperIntakeItemHtml({ status: 'saved', paperId: 'paper_290095200', captureId: 'cap200' })`);
  assert.match(strip(card), /הגיעה סחורה עם נייר החיוב 95200/);
  assert.match(card, /data-role="paper-goods-no"/);
});

test('"לא — רק לאיזון": השאלה יורדת, והמאזן אומר מה שאמר; "כן — לספור": הנייר הופך לתעודת משלוח ונכנס לקליטה', async () => {
  const r = live(app([charge()]));
  r.run(`setView('receiving')`);
  await r.click('paper-goods-no', 'paper_290095200'); await flush();
  assert.deepEqual(JSON.parse(JSON.stringify(r.context.testWrites.at(-1).data)), { goods: 'no', rev: 2 });
  const list = JSON.parse(r.run('JSON.stringify(openIssuesList())'));
  assert.ok(!list.some(x => /הגיעה סחורה/.test(x.text)));
  assert.ok(list.some(x => /נייר החיוב 95200 .*מחייב/.test(x.text)), 'עכשיו — המשפט של המאזן');
  const s = live(app([charge()]));
  await s.click('paper-goods-yes', 'paper_290095200'); await flush();
  assert.deepEqual(JSON.parse(JSON.stringify(s.context.testWrites.at(-1).data)), { goods: 'yes', kind: 'delivery', kindKnown: true, attach: null, rev: 2 });
  assert.equal(s.run(`papers[0].kind`), 'delivery');
  assert.deepEqual(JSON.parse(JSON.stringify(s.context.testJoins.map(j => [j.paperId, j.cap, j.explicit]))), [['paper_290095200', 'cap200', true]], 'נכנס לקליטה כפי שנקרא — בלי קריאה נוספת');
});

test('בלי שאלה: נייר חיוב שכל שורותיו הן עודף שכבר נספר, ונייר ישן (כמו 141)', () => {
  // עודף 1231 ×2 בקליטה של 4.10 — נייר חיוב חדש בדיוק עליו
  const exact = charge({ docDay: '2026-10-04', rows: [{ line: 1, itemCode: '1231', barcode: '', description: '1231', qty: 2, productId: 'code_1231', matchedBy: 'code' }], anchors: { units: 2, lines: 1, source: 'printed' } });
  assert.ok(!JSON.parse(live(app([exact])).run('JSON.stringify(openIssuesList())')).some(x => /הגיעה סחורה/.test(x.text)));
  const old = live(app([L.papers.p141, L.papers.p142]));
  assert.ok(!JSON.parse(old.run('JSON.stringify(openIssuesList())')).some(x => /הגיעה סחורה/.test(x.text)), '141 נקרא לפני v130');
});

test('התשובה למאזן — בתוך המשפט שבקליטה: "כן, זה תיקון" בלי לעבור למסך המאזן', async () => {
  const r = live(app([L.papers.p141, L.papers.p142]));
  r.run(`setView('receiving')`);
  const html = r.node('app').innerHTML;
  assert.match(html, /data-role="ledger-declare-correction" data-item="[^"]+"[^>]*>כן, זה תיקון<\/button>/);
  r.context.testItem = (html.match(/data-role="ledger-declare-correction" data-item="([^"]+)"/) || [])[1];
  await r.run(`paperUiClick({ dataset: { role: 'ledger-declare-correction', item: testItem } })`);
  await flush();
  assert.equal(r.run('currentView'), 'receiving', 'נשארים בקליטה');
  assert.match(r.context.testWrites.at(-1).path.join('/'), /papers\/decl_corr_/);
  assert.match(strip(r.node('app').innerHTML), /דבר אחד לטיפול מול ברמן חויבת פעמיים/);
  assert.doesNotMatch(r.node('app').innerHTML, />פרטים</, 'בלי "פרטים" בקליטה');
});

test('"לבדיקה" מתוך הקליטה — "חזרה" חוזרת לקליטה', async () => {
  const r = live(app([L.papers.p141, L.papers.p142]));
  r.run(`setView('receiving')`);
  await r.run(`openPaperReview('paper_290095142')`);
  r.run(`paperUiClick({ dataset: { role: 'review-back' } })`);
  assert.equal(r.run('currentView'), 'receiving');
});
