// v151 — בדיקת נייר: כשאי אפשר לאשר, כתוב במילים מה לא תואם ומה לתקן, והכפתור האפור מסביר בלחיצה.
// המקרה מ-2.11.2026: נייר זיכוי 0000008447 — שורה אחת שנקראה עם כמות 2 ומוצר לא מזוהה (קוד 283 במקום 233).
// העובד הסיר את השורה, הוסיף "שורה שלא נקראה" (נפתחת עם כמות 1), בחר את המוצר וסימן "בדקתי". הכפתור
// נשאר אפור בלי הסבר: 1 בשורה מול "סה״כ כללי" 2. עכשיו זה כתוב בדיוק כך, ולחיצה על הכפתור אומרת את זה.
// הרצה: TZ=Asia/Jerusalem node --test tests/paper-review-why-v151.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runtime, fixture } from './receipt-scan-harness.mjs';

const L = JSON.parse(fs.readFileSync(new URL('./ledger-2026-10.json', import.meta.url), 'utf8'));

// נייר 8447 כפי שנשמר בענן (מהגיבוי של 2.11, בלי התמונה): שורה אחת, כמות 2, קוד שנקרא לא נכון, בלי מוצר
function paper8447() {
  return { schema: 1, id: 'paper_0000008447', number: '0000008447', numerator: '88447', kind: 'credit', kindKnown: true, state: 'needs-review',
    docDay: '2026-11-02', headerText: 'ת.משלוח החזרה יבש', capturedAt: 1793599466745, timestamp: 1793599526334, rev: 1, writtenBy: '150', deviceName: '',
    rows: [{ line: 1, itemCode: '283', barcode: '407287', description: 'דג לחמניה אצבע', qty: 2, productId: null, matchedBy: null, flag: true }],
    anchors: { units: 2, lines: 1, check: 87, source: 'printed' },
    proof: { unitsOk: true, linesOk: true, checkOk: true, scanStatus: 'needs_review' },
    review: { mustCheck: true, notes: ['הקריאה סימנה שורה אחת לבדיקה — היא מסומנת בצהוב', 'שורה אחת לא זוהתה — בחר מוצר'] },
    attach: { type: null, id: null, role: null, by: 'auto', rowTargets: [{ id: null, type: null, line: 0 }] }, forReturnId: null };
}
function app(paper) {
  const r = runtime({ data: fixture() });
  r.run(`products = ${JSON.stringify(L.products)}; returns = []; receipts = []; papers = [${JSON.stringify(paper)}]; ledgerInvalidate();`);
  return r;
}
const json = (r, expr) => JSON.parse(r.run('JSON.stringify(' + expr + ')'));
const click = (r, role, id) => r.run(`paperUiClick({ dataset: ${JSON.stringify(id === undefined ? { role } : { role, id })} })`);
// הקלדה בשדה כמות של שורה, או באחד משדות "המספרים בתחתית הנייר"
const qty = (r, i, value) => r.run(`paperUiInput({ getAttribute: () => 'review-qty', dataset: { id: '${i}' }, value: ${JSON.stringify(value)} })`);
const field = (r, id, value) => r.run(`paperUiInput({ getAttribute: () => null, id: ${JSON.stringify(id)}, dataset: {}, value: ${JSON.stringify(value)} })`);
const tick = () => new Promise(res => setImmediate(res));
async function until(cond, n = 200) { for (let i = 0; i < n && !cond(); i++) await tick(); assert.ok(cond(), 'התנאי לא התקיים'); }

test('נייר 8447: שורה חדשה עם 1 מול "סה״כ כללי" 2 — כתוב מה לא תואם ומה לתקן; הכפתור האפור מסביר בלחיצה ולא שומר', async () => {
  const r = app(paper8447());
  await r.run(`openPaperReview('paper_0000008447')`);
  assert.equal(r.run('currentView'), 'paperReview');
  // כמו העובד: הסיר את השורה שלא זוהתה, הוסיף "שורה שלא נקראה" (כמות 1), בחר את המוצר, סימן "בדקתי"
  click(r, 'review-row-del', '0');
  click(r, 'review-row-add');
  click(r, 'review-pick-product', 'code_233');
  click(r, 'review-checked');
  assert.deepEqual(json(r, 'paperReview.paper.rows.map(x => [x.productId, x.qty])'), [['code_233', 1]]);
  assert.equal(r.run('paperReviewState().ok'), false);
  const why = json(r, 'paperReviewBlockers()');
  assert.equal(why.length, 1, 'בעיה אחת בלבד: הכמות');
  assert.match(why[0], /^בשורה רשומה כמות 1, ובתחתית הנייר "סה״כ כללי" 2\. חסר 1: תקן את הכמות בשורה, או את "סה״כ כללי" אם הועתק לא נכון\.$/);
  const html = r.node('app').innerHTML;
  assert.match(html, /עוד אי אפשר לאשר:/); assert.match(html, /בשורה רשומה כמות 1/);
  assert.match(html, /✗<\/span> שורות הנייר: 1 יח׳/); assert.match(html, /✓<\/span> שורה אחת/);
  assert.match(html, /id="reviewSave"[^>]*aria-disabled="true"/, 'אפור');
  assert.doesNotMatch(html, /id="reviewSave"[^>]*\sdisabled/, 'אבל לא מושבת — לחיצה מסבירה');
  // לחיצה על הכפתור האפור: טוסט עם הסיבה, בלי שמירה, נשארים במסך
  click(r, 'review-save');
  await tick();
  assert.match(r.toasts.at(-1) || '', /^עוד אי אפשר לאשר: בשורה רשומה כמות 1, ובתחתית הנייר "סה״כ כללי" 2\./);
  assert.equal(r.writes.length, 0, 'לא נשמר');
  assert.equal(r.run('paperReview && paperReview.id'), 'paper_0000008447');
  // תיקון הכמות ל-2 — הכל תואם: בלי הסבר, "אפשר לאשר", הכפתור כחול, והאישור נשמר
  qty(r, 0, '2');
  assert.equal(r.run('paperReviewState().ok'), true);
  assert.deepEqual(json(r, 'paperReviewBlockers()'), []);
  const status = r.node('reviewStatus').innerHTML;
  assert.match(status, /✓<\/span> שורות הנייר: 2 יח׳/); assert.match(status, /אפשר לאשר/); assert.doesNotMatch(status, /עוד אי אפשר/);
  assert.match(r.node('reviewSave').className, /bg-blue-600/);
  click(r, 'review-save');
  await until(() => r.run('paperReview') === null); // האישור נשמר ויצאנו מהמסך
  const upd = r.writes.find(w => w.op === 'update' && w.path && w.path.at(-1) === 'paper_0000008447');
  assert.ok(upd, 'עדכון הנייר בענן');
  assert.equal(upd.data.state, 'accepted'); assert.equal(upd.data.review, null);
  assert.deepEqual(JSON.parse(JSON.stringify(upd.data.rows.map(x => [x.productId, x.qty]))), [['code_233', 2]]);
  assert.equal(upd.data.anchors.units, 2); assert.equal(upd.data.anchors.lines, 1);
  assert.equal(r.run('paperReview'), null, 'יצאנו מהמסך');
});

test('כל סיבה במילים: שורה בלי מוצר, "בדקתי", מספרים ריקים, שורה חסרה מול "סהכ שורות", יותר מדי בשורות, כמות 0', async () => {
  const r = app(paper8447());
  await r.run(`openPaperReview('paper_0000008447')`);
  // כפי שנפתח: שורה בלי מוצר, ו"בדקתי" עוד לא סומן — המספרים (2 יח׳, שורה אחת) תואמים
  let why = json(r, 'paperReviewBlockers()');
  assert.equal(why.length, 2);
  assert.match(why[0], /יש שורה בלי מוצר — "בחר מוצר"/); assert.match(why[1], /סמן "בדקתי מול הנייר"/);
  // שדות ריקים
  field(r, 'reviewUnits', ''); field(r, 'reviewLines', '');
  why = json(r, 'paperReviewBlockers()');
  assert.ok(why.some(t => /^מלא את "סה״כ כללי" מתחתית הנייר\.$/.test(t)), why.join(' | '));
  assert.ok(why.some(t => /^מלא את "סהכ שורות" מתחתית הנייר\.$/.test(t)), why.join(' | '));
  // שורה חסרה: בנייר 2 שורות ו-5 יח׳, כאן שורה אחת של 2
  field(r, 'reviewUnits', '5'); field(r, 'reviewLines', '2');
  why = json(r, 'paperReviewBlockers()');
  assert.ok(why.some(t => /^בשורה רשומה כמות 2, ובתחתית הנייר "סה״כ כללי" 5\. חסר 3: תקן את הכמות בשורה/.test(t)), why.join(' | '));
  assert.ok(why.some(t => /^כאן שורה אחת, ובתחתית הנייר "סהכ שורות" 2\. חסרה שורה: הוסף אותה ב"שורה שלא נקראה", או תקן את "סהכ שורות" אם הועתק לא נכון\.$/.test(t)), why.join(' | '));
  // יותר מדי: שתי שורות, 4 יח׳ יחד, מול 3 יח׳ ושורה אחת בתחתית הנייר
  click(r, 'review-row-add'); click(r, 'review-pick-product', 'code_233'); qty(r, 1, '2');
  field(r, 'reviewUnits', '3'); field(r, 'reviewLines', '1');
  why = json(r, 'paperReviewBlockers()');
  assert.ok(why.some(t => /^הכמויות בשורות מסתכמות ל-4, ובתחתית הנייר "סה״כ כללי" 3\. יש 1 יותר מדי: תקן את הכמות בשורה/.test(t)), why.join(' | '));
  assert.ok(why.some(t => /^כאן 2 שורות, ובתחתית הנייר "סהכ שורות" 1\. יש שורה מיותרת: הסר אותה, או תקן/.test(t)), why.join(' | '));
  // כמות 0 בשורה — סיבה משלה
  qty(r, 1, '0');
  assert.ok(json(r, 'paperReviewBlockers()').some(t => /^יש שורה עם כמות 0 — רשום את הכמות מהנייר, או הסר את השורה\.$/.test(t)));
  // ההסבר מצויר גם בכרטיס (refreshPaperReviewStatus), לא רק בחישוב
  assert.match(r.node('reviewStatus').innerHTML, /עוד אי אפשר לאשר:/);
  assert.match(r.node('reviewStatus').innerHTML, /כמות 0/);
});

test('בלי שורות בכלל, ובלי סוג נייר — כתוב מה חסר, ואין כפילות עם "סהכ שורות"', async () => {
  const r = app(paper8447());
  await r.run(`openPaperReview('paper_0000008447')`);
  click(r, 'review-row-del', '0');
  r.run(`paperReview.paper.kind = null; paperReview.paper.kindKnown = false;`);
  const why = json(r, 'paperReviewBlockers()');
  assert.ok(why.some(t => /^בחר למעלה מה הנייר: חיוב, זיכוי \/ החזרה או תעודת משלוח\.$/.test(t)), why.join(' | '));
  assert.ok(why.some(t => /^אין שורות — הוסף כל שורה מהנייר ב"שורה שלא נקראה"\.$/.test(t)), why.join(' | '));
  assert.ok(!why.some(t => /סהכ שורות" 1/.test(t)), 'בלי שורות — "אין שורות" מספיק: ' + why.join(' | '));
  assert.equal(r.run('paperReviewState().ok'), false);
});
