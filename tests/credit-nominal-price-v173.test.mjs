// v173 — שורה במחיר אפסי בנייר זיכוי אינה זיכוי.
// המקרה (22.11.2026): בנייר הזיכוי של ההחזרה הודפסה שורה "לחמניות כוסמין" (קוד 1649 — מוצר חדש שעוד לא משווק, ואינו
// במאגר) ×3 במחיר ₪0.01, במקום "6 לחמניות כוסמין" ×3 שהוחזרו. עד 172 הנייר נעצר ב"לא זוהה — בחר מוצר", והדרך הטבעית
// (לבחור את המוצר שהוחזר) רשמה זיכוי שלא ניתן. החלטת בעל העסק: שורה שמודפסת במחיר של עד 5 אג׳ — "כאילו לא קיימת".
// כל ההחזרות והניירות כאן מומצאים (מוצרי הקטלוג מ-tests/ledger-2026-10.json; הגיבוי של המשתמש אינו במאגר), והנייר עובר
// את כל מסלול הצילום של האפליקציה (receipt-scan-harness: רק הרשת, הענן והדפדפן מזויפים).
// מה שנבדק:
// - הכלל עצמו (paperPriceNominal): מעל 0 ועד 0.05; מחיר 0, מחיר שלא נקרא ומחיר גבוה יותר — לא.
// - הצילום: הנייר מאושר לבד, השורה יוצאת אל paper.nominal, העוגנים יורדים (4 שורות / 11 יח׳ → 3 / 8), אין קריאה נוספת
//   בתשלום על קוד שאינו במאגר, ובמאזן "חסר זיכוי על 6 לחמניות כוסמין ×3 — לבקש זיכוי מהנהג" עם ההסבר; הזיכוי האמיתי סוגר.
// - רק נייר זיכוי, ורק כשאין ספק במחיר: נייר חיוב / תעודת משלוח, מחיר במחלוקת, שורה שסומנה, קריאה שלא אומתה — שורה רגילה.
// - מסך הבדיקה: "המספרים בתחתית הנייר" הם המודפס (11, 4); "ספור בכל זאת" ו"מחיר אפסי — לא לספור", לשני הכיוונים;
//   ההסבר כשהמספרים לא תואמים; שינוי סוג הנייר מחזיר את השורה.
// - נייר שכל שורותיו במחיר אפסי: מאושר בלי שורות, "מחיר אפסי — לא נספר", וההחזרה ממשיכה לחכות לזיכוי.
// - אותו נייר שנשמר בגרסה קודמת עם השורה בין השורות — אותה טביעה; נייר בלי שורות כאלה — בדיוק כמו ב-172.
// הרצה: TZ=Asia/Jerusalem node --test tests/credit-nominal-price-v173.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runtime, fixture, html } from './receipt-scan-harness.mjs';

const L = JSON.parse(fs.readFileSync(new URL('./ledger-2026-10.json', import.meta.url), 'utf8'));
const name = code => (L.products.find(p => p.id === 'code_' + code) || {}).name || code;
const strip = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&#039;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const tick = () => new Promise(res => setImmediate(res));
async function until(cond, n = 400) { for (let i = 0; i < n && !cond(); i++) await tick(); assert.ok(cond(), 'התנאי לא התקיים'); }
const PID = 'paper_290099318', RID = 'ret_nominal';

// ההחזרה (מומצאת): ארבעה מוצרים, 11 יח׳ — בהם "6 לחמניות כוסמין" ×3
const ret = (id, rows, date = '2026-10-03') => ({ id, date, docDate: date, credited: false, timestamp: Date.parse(date + 'T08:00:00'), sentTo: 'הנהג',
  items: rows.map(([code, qty]) => ({ productId: 'code_' + code, code, name: name(code), barcode: '', qty })) });
const RET = () => ret(RID, [['238', 4], ['450', 3], ['3701', 1], ['649', 3]]);
// נייר הזיכוי כפי שהשרת מחזיר אותו: שלוש שורות אמיתיות, ושורה 4 — קוד 1649 שאינו במאגר, במחיר 0.01
const ROWS = [['497204', '238', 'ברמן אסלי 5 פי', 4, 7.95], ['498393', '450', 'חלה מרובעת ברמן', 3, 5.03], ['4033484', '3701', 'חלומית אישית 3', 1, 11.5], ['4033064', '1649', 'לחמניות כוסמין', 3, 0.01]];
function note(rows = ROWS, extra = {}, verification = {}) {
  const list = rows.map(([barcode, itemCode, description, quantity, unitPriceExVat], i) => ({ sourcePage: 1, lineNumber: i + 1, barcode, itemCode, description, quantity, unitPriceExVat, confidence: 0.95 }));
  return { ok: true, serviceVersion: 8, model: 'fixture', requestId: 'req-nominal', reads: [{ model: 'luna' }, { model: 'luna' }], usage: null,
    verification: { version: 1, status: 'agreed', primaryReads: 2, escalationAttempted: false, reasons: [], issues: [], readCount: 2, ...verification },
    scan: { warnings: [], documents: [{ noteIndex: 0, docNumber: '290099318', docType: 'credit', docDate: '04/10/2026', pageCount: 1,
      totalUnits: list.reduce((a, r) => a + (Number(r.quantity) || 0), 0), printedLines: list.length, netToChargeExVat: 40.11, vatAmountPrinted: 7.22, totalToChargeInclVat: 47.33,
      headerText: 'ת.משלוח החזרה יבש', internalNumber: null, numerator: '99318', printedCheck: list.reduce((a, r) => a + Number(String(r.barcode).slice(-2)), 0),
      otherPapersVisible: false, notDriverStrip: false, confidence: 0.95, warnings: [], rows: list, ...extra }] } };
}
const withRow4 = (over, extra, verification) => note(ROWS.map((r, i) => i === 3 ? over(r.slice()) : r), extra, verification);
function app(paper, opts = {}) {
  const data = { ...fixture(), paper, products: structuredClone(L.products) };
  const r = runtime({ data, storage: opts.storage || new Map() });
  r.context.testL = { returns: opts.returns || [RET()], receipts: opts.receipts || [], papers: opts.papers || [] };
  // הענן המזויף של הניירות: מה שנכתב מגיע ל-papers, כמו המאזין (אותו כלל של "אותו נייר" כמו executePaperCreateTask)
  r.run(`products = testData.products; returns = testL.returns; receipts = testL.receipts; papers = testL.papers; todayStr = () => '${opts.today || '2026-10-05'}';
    runCloudTaskSilent = async (label, task) => { testWrites.push(structuredClone(task)); return true; };
    executePaperCreateTask = async task => { testWrites.push({ paperCreate: structuredClone(task) });
      const cur = papers.find(p => p.id === task.id);
      if (cur && !cur.deleted && cur.captureId === task.paper.captureId) return 'same';
      if (cur && !cur.deleted) { if (!paperSameContent(cur, task.paper)) { const e = new Error('conflict'); e.code = 'paper-conflict'; e.existing = cur; throw e; }
        if (cur.state !== 'accepted' && task.paper.state === 'accepted') { papers = papers.map(p => p.id === task.id ? structuredClone(task.paper) : p); return 'replaced'; }
        return 'duplicate'; }
      papers = papers.filter(p => p.id !== task.id).concat([structuredClone(task.paper)]); return 'created'; };
    ledgerInvalidate();`);
  r.j = expr => JSON.parse(r.run('JSON.stringify(' + expr + ')'));
  r.items = () => r.j(`currentLedger().items.map(i => { const t = ledgerItemText(i, currentLedger(), ledgerAllPapers(currentLedger())); return { kind: i.kind, state: i.state, key: i.key || (i.keys && i.keys[0] && i.keys[0].key) || null, units: i.units, text: t.text, detail: t.detail || '', actions: (t.actions || []).map(a => a.label) }; })`);
  r.open = () => r.items().filter(i => i.state === 'problem' || i.state === 'question');
  r.paper = (id = PID) => r.j(`papers.find(p => p.id === '${id}') || null`);
  r.click = (role, id) => r.run(`paperUiClick({ dataset: ${JSON.stringify(id === undefined ? { role } : { role, id })} })`);
  r.field = (id, value) => r.run(`paperUiInput({ getAttribute: () => null, id: ${JSON.stringify(id)}, dataset: {}, value: ${JSON.stringify(value)} })`);
  r.save = async () => { r.click('review-save'); await until(() => r.run('paperReview') === null); r.run('ledgerInvalidate()'); };
  return r;
}
const page = n => ({ dataUrl: 'data:image/jpeg;base64,cGFwZXI' + n, baseDataUrl: 'data:image/jpeg;base64,cGFwZXI' + n, rotation: 0, orientationConfirmed: true });
async function intake(r, forReturnId = '') {
  r.run(`openPaperIntake({ forReturnId: ${JSON.stringify(forReturnId)} });
    paperIntake.items = [{ captureId: 'cap0', hash: 'h0', page: ${JSON.stringify(page(1))}, status: 'photo' }];`);
  await r.run('paperIntakeRun()');
  r.run('ledgerInvalidate()');
}
const credit = (number, rows, docDay) => ({ schema: 1, state: 'accepted', id: 'paper_' + number, kind: 'credit', kindKnown: true, number, terminalNumber: number, numerator: number.slice(-5), docDay, printedTime: '10:00',
  timestamp: Date.parse(docDay + 'T10:00:00') + Number(number.slice(-2)),
  rows: rows.map(([code, qty], i) => ({ line: i + 1, itemCode: code, barcode: '', description: code, qty, productId: 'code_' + code, matchedBy: 'code' })),
  anchors: { units: rows.reduce((a, x) => a + x[1], 0), lines: rows.length, source: 'printed' }, proof: { unitsOk: true, linesOk: true } });
const NOMINAL = { line: 4, itemCode: '1649', barcode: '4033064', description: 'לחמניות כוסמין', qty: 3, productId: null, matchedBy: null, price: 0.01 };
const MISSING = 'חסר זיכוי על 6 לחמניות כוסמין ×3 מההחזרה של 3.10 — לבקש זיכוי מהנהג';

test('הכלל: מחיר מעל 0 ועד 5 אג׳ הוא "אפסי"; 0, מחיר שלא נקרא ומחיר גבוה יותר — לא', () => {
  const r = app(note());
  const is = v => r.run(`paperPriceNominal(${JSON.stringify(v)})`);
  [0.01, 0.02, 0.05, '0.01', '0.05', 0.049999, 0.0500001].forEach(v => assert.equal(is(v), true, String(v)));
  [0, '0', -0.01, 0.051, 0.06, 0.1, 1, 14.94, null, '', 'abc', '0,01'].forEach(v => assert.equal(is(v), false, String(v)));
  assert.equal(r.run('paperPriceNominal(undefined)'), false);
  assert.equal(r.run('paperPriceNominal(NaN)'), false);
  assert.equal(r.run('PAPER_NOMINAL_PRICE_MAX'), 0.05);
});

test('הצילום: הנייר מאושר לבד, השורה במחיר 0.01 לא נספרת, העוגנים יורדים, בלי קריאה נוספת בתשלום — ובמאזן "חסר זיכוי"', async () => {
  const r = app(note());
  await intake(r);
  assert.equal(r.requests.length, 1, 'קוד 1649 אינו במאגר — אבל על שורה שלא נספרת לא משלמים קריאת אימות');
  assert.equal(r.run('paperIntake.items[0].status'), 'saved', 'בלי "לבדיקה"');
  const p = r.paper();
  assert.equal(p.state, 'accepted'); assert.equal(p.kind, 'credit'); assert.equal(p.docDay, '2026-10-04'); assert.equal(p.review, undefined);
  assert.deepEqual(p.rows.map(x => [x.line, x.productId, x.qty]), [[1, 'code_238', 4], [2, 'code_450', 3], [3, 'code_3701', 1]]);
  assert.deepEqual(p.nominal, [NOMINAL], 'כפי שמודפסת, עם המחיר');
  assert.deepEqual(p.anchors, { units: 8, lines: 3, check: 245, source: 'printed' }, 'מה שהשורות הנספרות מסתכמות אליו; ה"ביקורת" כפי שמודפסת (04+93+84+64)');
  assert.deepEqual(p.proof, { unitsOk: true, linesOk: true, checkOk: true, scanStatus: 'agreed' }, 'הנייר הוכיח את עצמו על כל ארבע השורות');
  assert.deepEqual([p.attach.type, p.attach.id, p.attach.role], ['return', RID, 'main']);
  const create = r.writes.find(w => w.paperCreate).paperCreate;
  assert.deepEqual(JSON.parse(JSON.stringify(create.paper.nominal)), [NOMINAL], 'כך נשמר בענן');
  // המאזן: הנייר נספר, ומה שהוחזר ולא זוכה באמת — חוסר, מיד
  assert.equal(r.run(`currentLedger().states['${PID}']`), 'counted');
  const open = r.open();
  assert.deepEqual(open.map(i => [i.kind, i.key, i.state]), [['returnedNotCredited', 'code_649', 'problem']]);
  assert.equal(open[0].text, MISSING);
  assert.equal(open[0].detail, '6 לחמניות כוסמין: הוחזרו 3, זוכו 0. בנייר הזיכוי 99318 מ-4.10 — שורה במחיר אפסי לא נספרה: לחמניות כוסמין ×3 (₪0.01). אם הנהג הביא עוד תעודת זיכוי — צלם אותה בכפתור "צלם נייר מהנהג" למעלה, וזה ייסגר לבד.');
  assert.ok(!r.items().some(i => i.kind === 'unproven' || i.kind === 'swap' || i.kind === 'creditedNotReturned'));
  assert.equal(r.run(`returnStateNow(returns[0])`), 'open');
  assert.deepEqual(r.j('openIssuesList().map(x => [x.state, x.text])'), [['problem', MISSING]], 'בהתראה העליונה');
  // המרכזת: שום זיכוי על "6 לחמניות כוסמין", ושום שורה למוצר שבמחיר אפסי
  const adj = r.j(`ledgerMatrixAdjust(paperLedger({ recs: receipts, rets: returns, papers, from: ledgerFrom, asOf: todayStr() }), '2026-10-01', '2026-10-31', papers).map(x => [x.key, x.credit])`);
  assert.deepEqual(adj.sort(), [['code_238', 4], ['code_3701', 1], ['code_450', 3]]);
  // כרטיס הצילום: מה נספר, מה לא, והפער — כשהנייר ביד
  const card = strip(r.run('paperIntakeItemHtml(paperIntake.items[0])'));
  assert.match(card, /נייר הזיכוי 99318 מ-4\.10 · 3 שורות · 8 יח׳ — נקרא, ויש פער מול ההחזרה/);
  assert.match(card, /שורה במחיר אפסי לא נספרה: לחמניות כוסמין ×3 \(₪0\.01\)/);
  assert.match(card, /חסר זיכוי על 6 לחמניות כוסמין ×3 מההחזרה של 3\.10 — לבקש זיכוי מהנהג/);
  assert.doesNotMatch(card, /לא נקרא עד הסוף|לבדוק מול הנייר/);
});

test('הזיכוי האמיתי מגיע אחר כך — נסגר לבד, בלי שארית', async () => {
  const r = app(note());
  await intake(r);
  r.context.fix = credit('290099401', [['649', 3]], '2026-10-05');
  r.run('papers = papers.concat([fix]); ledgerInvalidate();');
  assert.deepEqual(r.open(), [], 'אין חוסר, ואין "עודף זיכוי" על המוצר שבמחיר אפסי');
  assert.equal(r.run('returnStateNow(returns[0])'), 'done');
  assert.deepEqual(r.j(`currentLedger().products['code_649'].net`), 0);
});

test('כרטיס ההחזרה וכרטיס הנייר בהיסטוריה: מה לא נספר כתוב, והשורה מוצגת כפי שמודפסת', async () => {
  const r = app(note());
  await intake(r);
  r.run(`currentView = 'receiptsHistory'; receiptHistoryFilter = 'all'; renderReceiptsHistory();`);
  const cards = r.node('app').innerHTML.split(/<details(?! class="ret-fold")/).slice(1).map(c => strip('<details' + c));
  const rc = cards.find(c => /תעודת חזרות/.test(c));
  assert.match(rc, /חסר זיכוי על 3 יח׳/);
  assert.match(rc, /6 לחמניות כוסמין 3 0 חסר 3 — לא בנייר הזיכוי/);
  assert.match(rc, /נייר הזיכוי 99318 מ-4\.10 3 שורות · 8 יח׳ · תעודת הזיכוי של ההחזרה · שורה במחיר אפסי לא נספרה: לחמניות כוסמין ×3 \(₪0\.01\)/);
  const pc = strip(r.run(`paperCardInHistory(papers.find(p => p.id === '${PID}'), fullLedger(), ledgerAllPapers(fullLedger()), true)`));
  assert.match(pc, /זוכו 8 יח׳ · 3 שורות/);
  assert.match(pc, /לחמניות כוסמין קוד 1649 · מחיר אפסי \(₪0\.01\) — לא נספר 3 יח׳/);
});

test('רק נייר זיכוי: אותה שורה בתעודת משלוח קטנה או בנייר חיוב היא סחורה — נשארת שורה, ונשלחת לאימות כמו כל קוד שאינו במאגר', async () => {
  for (const [extra, kind] of [[{ docType: 'invoice', headerText: 'ת.משלוח' }, 'delivery'], [{ docType: 'invoice', headerText: 'תעודת משלוח', docNumber: '244799001', internalNumber: '290099318' }, 'delivery']]) {
    const r = app(note(ROWS, extra));
    await intake(r);
    const s = JSON.parse(r.storage.get('bm_paper_results_v1') || '{}').cap0.paper;
    assert.equal(s.kind, kind);
    assert.equal(s.nominal, undefined, 'אין שורות "לא נספרות" בנייר שאינו זיכוי');
    assert.equal(s.rows.length, 4);
    assert.deepEqual([s.anchors.units, s.anchors.lines], [11, 4], 'העוגנים כפי שמודפסים');
    assert.equal(r.requests.length, 2, 'קוד שאינו במאגר — קריאת האימות נשלחת, כמו עד 172');
  }
});

test('הסף: 0.05 — לא נספרת; 0.06, מחיר 0 ומחיר שלא נקרא — שורה רגילה (גם כשהמוצר מוכר)', async () => {
  // שורה 4 על מוצר שבמאגר ("6 לחמניות כוסמין"), כדי שרק המחיר יקבע
  const known = price => withRow4(row => ['4685447', '649', '6 לחמניות כוסמין', 3, price]);
  const paperOf = async price => { const r = app(known(price)); await intake(r); return { r, p: r.paper() }; };
  const five = await paperOf(0.05);
  assert.equal(five.p.state, 'accepted'); assert.equal(five.p.rows.length, 3);
  assert.deepEqual(five.p.nominal.map(x => [x.itemCode, x.productId, x.qty, x.price]), [['649', 'code_649', 3, 0.05]], 'גם שורה של מוצר מוכר — במחיר אפסי אינה זיכוי');
  assert.deepEqual(five.r.open().map(i => i.text), [MISSING]);
  for (const price of [0.06, 0, null, 14.94]) {
    const { r, p } = await paperOf(price);
    assert.equal(p.state, 'accepted', String(price)); assert.equal(p.nominal, undefined, String(price)); assert.equal(p.rows.length, 4);
    assert.deepEqual([p.anchors.units, p.anchors.lines], [11, 4]);
    assert.deepEqual(r.open(), [], 'השורה נספרת — ההחזרה זוכתה');
  }
});

test('כשיש ספק לא מכריעים לבד: מחיר במחלוקת, שורה שסומנה, קריאה שלא אומתה — שורה רגילה; העובד מכריע במסך הבדיקה', async () => {
  const doubts = [
    ['מחיר במחלוקת בין הקריאות', { status: 'needs_review', escalationAttempted: true, readCount: 3, issues: [{ noteIndex: 0, field: 'unitPriceExVat', reason: 'disagreement', sourcePage: 1, lineNumber: 4 }] }, false],
    ['השורה סומנה לבדיקה (קוד פריט)', { status: 'needs_review', escalationAttempted: true, readCount: 3, issues: [{ noteIndex: 0, field: 'itemCode', reason: 'disagreement', sourcePage: 1, lineNumber: 4 }] }, true],
    ['הקריאה לא אומתה כולה', { status: 'needs_review', escalationAttempted: true, readCount: 3, issues: [] }, true]];
  for (const [label, verification, mustCheck] of doubts) {
    const r = app(note(ROWS, {}, verification));
    await intake(r);
    assert.equal(r.requests.length, 1, label);
    const p = r.paper();
    assert.equal(p.state, 'needs-review', label); assert.equal(p.nominal, undefined, label); assert.equal(p.rows.length, 4, label);
    assert.deepEqual([p.anchors.units, p.anchors.lines], [11, 4], label);
    assert.equal(r.run(`currentLedger().states['${PID}']`), 'unproven', label);
    // במסך הבדיקה: "מחיר אפסי — לא לספור" על השורה, ואישור
    await r.run(`openPaperReview('${PID}')`);
    assert.equal(r.run('paperReviewState().ok'), false);
    r.click('review-row-nominal', '3');
    if (mustCheck) r.click('review-checked');
    assert.deepEqual(r.j('[paperReview.units, paperReview.lines, paperReview.paper.rows.length, paperReview.paper.nominal.length]'), [11, 4, 3, 1], label);
    assert.equal(r.run('paperReviewState().ok'), true, label + ': ' + r.j('paperReviewBlockers()').join(' | '));
    await r.save();
    const saved = r.paper();
    assert.equal(saved.state, 'accepted'); assert.deepEqual([saved.anchors.units, saved.anchors.lines, saved.anchors.source], [8, 3, 'typed']);
    assert.deepEqual(saved.nominal.map(x => [x.line, x.itemCode, x.qty, x.flag]), [[4, '1649', 3, undefined]], label);
    assert.deepEqual(r.open().map(i => i.text), [MISSING], label);
  }
});

test('מסך הבדיקה: המספרים בתחתית הם המודפס; "ספור בכל זאת" ו"מחיר אפסי — לא לספור" לשני הכיוונים; שום שינוי — שום "תיקונים שלא נשמרו"', async () => {
  const r = app(note());
  await intake(r);
  await r.run(`openPaperReview('${PID}')`);
  assert.deepEqual(r.j('[paperReview.units, paperReview.lines]'), [11, 4], 'מה שמודפס בתחתית הנייר — לא 8 ו-3');
  assert.deepEqual(r.j('paperReviewState()'), { units: 11, lineCount: 4, nominal: 1, nominalUnits: 3, unitsOk: true, linesOk: true, mapped: true, dayOk: true, kindOk: true, mustCheck: false, conflictBlocked: false, ok: true });
  assert.equal(r.run('paperReviewDirty(paperReview)'), false);
  let page1 = r.node('app').innerHTML;
  assert.match(strip(page1), /שורה במחיר אפסי — לא נספרת כזיכוי שורה שמודפסת במחיר של עד 5 אג׳ אינה זיכוי\. מה שהחזרת ולא זוכה באמת יופיע במאזן כ"חסר זיכוי"\. לחמניות כוסמין ×3 \(₪0\.01\) שורה 4 · קוד 1649 · ברקוד 4033064 ספור בכל זאת/);
  assert.match(strip(page1), /✓ שורות הנייר: 11 יח׳ · ✓ 4 שורות · ✓ תואם לנייר — אפשר לאשר נספר כזיכוי: 8 יח׳ · 3 שורות \(בלי השורה במחיר אפסי\)/);
  assert.match(page1, /id="reviewUnits"[^>]*value="11"/); assert.match(page1, /id="reviewLines"[^>]*value="4"/);
  assert.equal((page1.match(/data-role="review-row-nominal"/g) || []).length, 3, 'בנייר זיכוי — כפתור בכל שורה נספרת');
  assert.doesNotMatch(page1, /יש תיקונים שעוד לא נשמרו/);
  assert.match(page1, /id="reviewSave"[^>]*aria-disabled="false"/);
  // מספרים שלא תואמים — ההסבר כולל את השורה במחיר אפסי
  r.field('reviewUnits', '12'); r.field('reviewLines', '5');
  assert.deepEqual(r.j('paperReviewBlockers()'), [
    'הכמויות בשורות מסתכמות ל-11 (כולל 3 יח׳ במחיר אפסי), ובתחתית הנייר "סה״כ כללי" 12. חסר 1: תקן את הכמות בשורה, או את "סה״כ כללי" אם הועתק לא נכון.',
    'כאן 4 שורות (כולל שורה אחת במחיר אפסי), ובתחתית הנייר "סהכ שורות" 5. חסרה שורה: הוסף אותה ב"שורה שלא נקראה", או תקן את "סהכ שורות" אם הועתק לא נכון.']);
  r.field('reviewUnits', '11'); r.field('reviewLines', '4');
  // "ספור בכל זאת": השורה חוזרת למקומה, בלי מוצר — צריך לבחור; אחרי האישור היא נספרת וההחזרה נסגרת
  r.click('review-nominal-count', '0');
  assert.deepEqual(r.j('paperReview.paper.rows.map(x => [x.line, x.itemCode, x.productId, x.qty])'), [[1, '238', 'code_238', 4], [2, '450', 'code_450', 3], [3, '3701', 'code_3701', 1], [4, '1649', null, 3]]);
  assert.deepEqual(r.j('paperReview.paper.nominal'), []);
  assert.deepEqual(r.j('paperReviewBlockers()'), ['יש שורה בלי מוצר — "בחר מוצר" בשורה המסומנת.']);
  assert.doesNotMatch(r.node('app').innerHTML, /data-review-nominal|data-review-counted/);
  r.click('review-pick', '3'); r.click('review-pick-product', 'code_649');
  assert.equal(r.run('paperReviewState().ok'), true);
  await r.save();
  let p = r.paper();
  assert.deepEqual([p.rows.length, p.anchors.units, p.anchors.lines, p.anchors.source, p.nominal], [4, 11, 4, 'typed', []], 'השדה מתרוקן בענן');
  assert.deepEqual(r.open(), []);
  assert.equal(r.run('returnStateNow(returns[0])'), 'done');
  // ובחזרה: "מחיר אפסי — לא לספור" על שורה שכבר נבחר לה מוצר — השורה עוברת כמו שהיא, ומוצגת כפי שמודפסת
  await r.run(`openPaperReview('${PID}')`);
  assert.deepEqual(r.j('[paperReview.units, paperReview.lines]'), [11, 4]);
  r.click('review-row-nominal', '3');
  assert.match(r.node('app').innerHTML, /יש תיקונים שעוד לא נשמרו/, 'שיוך משנים רק אחרי האישור');
  assert.equal(r.run('paperReviewState().ok'), true);
  await r.save();
  p = r.paper();
  assert.deepEqual([p.rows.length, p.anchors.units, p.anchors.lines], [3, 8, 3]);
  assert.deepEqual(p.nominal.map(x => [x.line, x.itemCode, x.productId, x.matchedBy, x.qty, x.price]), [[4, '1649', 'code_649', 'user', 3, 0.01]]);
  assert.equal(r.run(`paperNominalNote(papers.find(p => p.id === '${PID}'))`), 'שורה במחיר אפסי לא נספרה: לחמניות כוסמין ×3 (₪0.01)', 'השם המודפס — לא שם המוצר שנבחר לה');
  assert.deepEqual(r.open().map(i => i.text), [MISSING]);
});

test('מסך הבדיקה: שינוי הסוג לנייר חיוב מחזיר את השורה לשורות; הכפתור "מחיר אפסי — לא לספור" רק בנייר זיכוי', async () => {
  const r = app(note());
  await intake(r);
  await r.run(`openPaperReview('${PID}')`);
  r.run(`paperUiClick({ dataset: { role: 'review-kind', kind: 'charge' } })`);
  assert.deepEqual(r.j('[paperReview.paper.kind, paperReview.paper.rows.length, paperReview.paper.nominal.length]'), ['charge', 4, 0]);
  assert.deepEqual(r.j('paperReview.paper.rows[3]'), NOMINAL, 'כמו שהייתה');
  const page1 = r.node('app').innerHTML;
  assert.doesNotMatch(page1, /review-row-nominal|data-review-nominal/);
  assert.deepEqual(r.j('paperReviewBlockers()'), ['יש שורה בלי מוצר — "בחר מוצר" בשורה המסומנת.']);
  // לחיצה על הכפתור בנייר שאינו זיכוי (מסך שהתיישן) — לא עושה כלום
  r.click('review-row-nominal', '3');
  assert.deepEqual(r.j('[paperReview.paper.rows.length, paperReview.paper.nominal.length]'), [4, 0]);
  // חזרה לזיכוי — השורה נשארת רגילה עד שהעובד מכריע
  r.run(`paperUiClick({ dataset: { role: 'review-kind', kind: 'credit' } })`);
  assert.deepEqual(r.j('[paperReview.paper.rows.length, paperReview.paper.nominal.length]'), [4, 0]);
  assert.equal((r.node('app').innerHTML.match(/data-role="review-row-nominal"/g) || []).length, 4);
});

test('נייר שכל שורותיו במחיר אפסי: מאושר בלי שורות, "מחיר אפסי — לא נספר" (לא "לבדיקה"), וההחזרה ממשיכה לחכות לזיכוי', async () => {
  const only = [['4033064', '1649', 'לחמניות כוסמין', 2, 0.01]];
  const r = app(note(only), { returns: [ret(RID, [['649', 2]])] });
  await intake(r);
  assert.equal(r.requests.length, 1);
  const p = r.paper();
  assert.deepEqual([p.state, p.rows.length, p.anchors.units, p.anchors.lines], ['accepted', 0, 0, 0]);
  assert.deepEqual(p.nominal.map(x => [x.itemCode, x.qty, x.price]), [['1649', 2, 0.01]]);
  assert.equal(r.run(`currentLedger().states['${PID}']`), 'nominal');
  assert.equal(r.run(`ledgerPaperStateLabel('nominal')`), 'מחיר אפסי — לא נספר');
  assert.deepEqual(r.items().map(i => [i.kind, i.state]), [['returnNotCreditedYet', 'pending']], 'הנייר אינו זיכוי של ההחזרה — היא ממתינה, ואין שאלה על הנייר');
  assert.equal(r.items()[0].text, 'ההחזרה מ-3.10 (6 לחמניות כוסמין ×2) — ממתינה לתעודת זיכוי');
  const card = strip(r.run('paperIntakeItemHtml(paperIntake.items[0])'));
  assert.match(card, /^נייר הזיכוי 99318 מ-4\.10 כל השורות בנייר במחיר אפסי — הנייר לא נספר כזיכוי\. שורה במחיר אפסי לא נספרה: לחמניות כוסמין ×2 \(₪0\.01\)/);
  assert.doesNotMatch(card, /0 שורות|תואם לנייר/);
  const pc = strip(r.run(`paperCardInHistory(papers.find(p => p.id === '${PID}'), fullLedger(), ledgerAllPapers(fullLedger()), true)`));
  assert.match(pc, /נייר זיכוי מהנהג מחיר אפסי — לא נספר/);
  assert.match(pc, /לחמניות כוסמין קוד 1649 · מחיר אפסי \(₪0\.01\) — לא נספר 2 יח׳/);
  // אחרי 4 ביקורים של הנהג בלי זיכוי אמיתי — חוסר, כמו כל החזרה שלא זוכתה
  const deliveries = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].map((d, i) => ({ id: 'rc' + i, date: d, docDate: d, timestamp: Date.parse(d + 'T06:00:00'), items: [{ productId: 'code_238', code: '238', name: name('238'), qty: 1, noteQty: 1 }] }));
  r.context.dl = deliveries; r.run(`receipts = dl; todayStr = () => '2026-10-08'; ledgerInvalidate();`);
  assert.deepEqual(r.open().map(i => i.text), ['חסר זיכוי על ההחזרה מ-3.10 (6 לחמניות כוסמין ×2) — לא הגיעה תעודת זיכוי. לבקש זיכוי מהנהג']);
  // מסך הבדיקה נפתח גם לנייר בלי שורות נספרות; אישור בלי שינוי משאיר אותו כמו שהוא, ו"ספור בכל זאת" מחזיר את השורה
  await r.run(`openPaperReview('${PID}')`);
  assert.deepEqual(r.j('[paperReview.units, paperReview.lines, paperReviewState().ok]'), [2, 1, true]);
  await r.save();
  assert.deepEqual(r.j(`(p => [p.state, p.rows.length, p.anchors.units, p.anchors.lines, p.nominal.length])(papers.find(p => p.id === '${PID}'))`), ['accepted', 0, 0, 0, 1]);
  assert.equal(r.run(`currentLedger().states['${PID}']`), 'nominal');
  await r.run(`openPaperReview('${PID}')`);
  r.click('review-nominal-count', '0');
  assert.deepEqual(r.j('[paperReview.paper.rows.length, paperReview.paper.nominal.length, paperReviewState().ok]'), [1, 0, false]);
});

test('אותו נייר שנשמר בגרסה קודמת עם השורה בין השורות — אותה טביעה, והצילום החדש מחליף אותו; נייר בלי שורות כאלה — בדיוק כמו ב-172', async () => {
  // כך נשמר ב-172: ארבע שורות, האחרונה לא זוהתה, "לבדיקה"
  const old = { schema: 1, rev: 1, id: PID, kind: 'credit', kindKnown: true, number: '290099318', terminalNumber: '290099318', numerator: '99318', docDay: '2026-10-04', state: 'needs-review', captureId: 'cap_old', timestamp: 5, writtenBy: '172',
    rows: [{ line: 1, itemCode: '238', barcode: '497204', description: 'ברמן אסלי 5 פי', qty: 4, productId: 'code_238', matchedBy: 'tnuva_code_exact' }, { line: 2, itemCode: '450', barcode: '498393', description: 'חלה מרובעת ברמן', qty: 3, productId: 'code_450', matchedBy: 'tnuva_code_exact' },
      { line: 3, itemCode: '3701', barcode: '4033484', description: 'חלומית אישית 3', qty: 1, productId: 'code_3701', matchedBy: 'tnuva_code_exact' }, { line: 4, itemCode: '1649', barcode: '4033064', description: 'לחמניות כוסמין', qty: 3, productId: null, matchedBy: null }],
    anchors: { units: 11, lines: 4, check: 245, source: 'printed' }, proof: { unitsOk: true, linesOk: true, checkOk: true, scanStatus: 'verified' }, review: { notes: ['שורה אחת לא זוהתה — בחר מוצר'], mustCheck: false } };
  const r = app(note(), { papers: [old] });
  assert.equal(r.run(`currentLedger().states['${PID}']`), 'unproven');
  await intake(r);
  const p = r.paper();
  assert.equal(p.captureId, 'cap0', 'הצילום החדש החליף את השמור (אותו נייר, נקרא עד הסוף) — בלי "נייר אחר כבר שמור עם המספר הזה"');
  assert.equal(p.state, 'accepted'); assert.equal(p.rows.length, 3);
  assert.equal(r.run(`paperFingerprint(${JSON.stringify(old)}) === paperFingerprint(papers.find(p => p.id === '${PID}'))`), true);
  assert.equal(r.run('paperLocalConflicts().length'), 0);
  assert.deepEqual(r.open().map(i => i.text), [MISSING]);
  // טביעה של נייר רגיל — אותה מחרוזת כמו עד 172
  const plain = credit('290099777', [['238', 4], ['450', 3]], '2026-10-04');
  assert.equal(r.run(`paperFingerprint(${JSON.stringify(plain)})`), '2026-10-04|7|2|238:4,450:3');
  assert.equal(r.run(`paperFingerprint(${JSON.stringify({ ...plain, nominal: [{ line: 3, itemCode: '1649', qty: 3, price: 0.01 }] })})`), '2026-10-04|10|3|1649:3,238:4,450:3');
});

test('נייר בלי שורות במחיר אפסי: שום שדה חדש, אותם עוגנים, ואותם משפטים במסך הבדיקה', async () => {
  const plainRows = ROWS.slice(0, 3).concat([['4685447', '649', '6 לחמניות כוסמין', 3, 14.94]]);
  const r = app(note(plainRows));
  await intake(r);
  const p = r.paper();
  assert.equal('nominal' in p, false);
  assert.deepEqual(p.anchors, { units: 11, lines: 4, check: 228, source: 'printed' });
  assert.deepEqual(r.open(), []);
  await r.run(`openPaperReview('${PID}')`);
  assert.deepEqual(r.j('[paperReview.units, paperReview.lines, paperReview.nom0]'), [11, 4, { units: 0, lines: 0 }]);
  assert.match(strip(r.node('app').innerHTML), /✓ שורות הנייר: 11 יח׳ · ✓ 4 שורות · ✓ תואם לנייר — אפשר לאשר/);
  assert.doesNotMatch(r.node('app').innerHTML, /data-review-nominal|data-review-counted/);
  r.field('reviewUnits', '12');
  assert.deepEqual(r.j('paperReviewBlockers()'), ['הכמויות בשורות מסתכמות ל-11, ובתחתית הנייר "סה״כ כללי" 12. חסר 1: תקן את הכמות בשורה, או את "סה״כ כללי" אם הועתק לא נכון.']);
  r.field('reviewUnits', '11');
  // אישור בלי שינוי: לא נכתב שדה nominal
  await r.save();
  const upd = r.writes.filter(w => w.op === 'update' && w.path && w.path.at(-1) === PID).at(-1);
  assert.equal('nominal' in upd.data, false);
  assert.deepEqual(JSON.parse(JSON.stringify(upd.data.anchors)), { units: 11, lines: 4, check: 228, source: 'typed' });
});

test('הגרסה 173, כולל ההערה ב-service worker', () => {
  assert.match(html, /const APP_VERSION = '173'/);
  assert.match(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), /גרסת אפליקציה 173/);
});
