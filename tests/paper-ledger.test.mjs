// v125 — מאזן הניירות: כל נייר של הנהג נספר לפי מוצר מול מה שנקלט והוחזר.
// הנתונים: tests/ledger-2026-10.json — הקליטות וההחזרות מ-19.8 עד 5.10.2026 מהגיבוי
// (כמויות, תאריכים ומספרי נייר בלבד), ושלושת הניירות של 4.10: 290095141 (חיוב) ו-
// 290095142 (זיכוי) הועתקו מהצילומים; 290095123 ונייר הצד סינתטיים, כי לא צולמו.
// מה שנבדק: בלי ניירות המאזן זהה למרכזת; עם הניירות נשאר בדיוק מה שנכון — 1231 ×2.
// הרצה: node --test tests/paper-ledger.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractSource } from './extract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const F = JSON.parse(fs.readFileSync(path.join(HERE, 'ledger-2026-10.json'), 'utf8'));
const FNS = ['r2', 'todayStr', 'storedReceiptDate', 'productCode', 'productListPrice', 'promoFixedPrice', 'promoActive', 'monthEndPromoForProduct',
  'monthEndUnitRebate', 'mtxQty', 'mtxPromoUnit', 'vatRateForDoc', 'priceAt', 'invoiceUnitAt', 'receiptCreditedShortUnits', 'lineOwnCode', 'rangeProductMatrixData',
  'receiptPaperNumber', 'storedReceiptPaperNumbers', 'priceAuditDate', 'ledgerAddDays', 'ledgerReturnDay', 'ledgerLineKey', 'ledgerDocBase', 'paperRowKey',
  'paperUnits', 'paperFingerprint', 'receiptScanFingerprints', 'paperNumbers', 'paperNumerator', 'paperSameSheet', 'ledgerOffsetIdMatches', 'ledgerPaperStates', 'ledgerDeliveriesSince', 'paperAttach',
  'paperLedger', 'ledgerClassify', 'ledgerCorrectionPair', 'ledgerDayShort', 'ledgerRowsText', 'paperLabel', 'ledgerItemText'];
const CONSTS = ["const LEDGER_FROM_DEFAULT = '2026-09-01';", 'const LEDGER_RETURN_WINDOW_DAYS = 14;', 'const LEDGER_PENDING_DELIVERIES = 3;', "const LEDGER_PAPER_KINDS = ['delivery', 'charge', 'credit', 'declared'];"];
// eslint-disable-next-line no-eval
const api = eval('let VAT = 0.18; let products = F.products; let promos = [];\n' + extractSource(FNS, CONSTS) + '\n({ ' + FNS.join(', ') + ' })');
const { paperLedger, ledgerItemText, rangeProductMatrixData, storedReceiptDate, ledgerReturnDay } = api;

const P = F.papers;
const R1004 = 'returns_43eb7cdd-5e32-4524-aa86-b87ca8e88650', RC1004 = 'receipt_b8c54f15-9ab4-4ad6-9195-d4a9d927d797', RC1005 = 'receipt_92580828-0558-42fc-8e7e-2a4fa1560417';
const R1001 = 'returns_d7ca5e1b-a8b9-45dd-a7de-34fc4fad4378';
const ledger = (papers, extra = {}) => paperLedger({ recs: F.receipts, rets: F.returns, papers, from: '2026-09-01', asOf: '2026-10-05', ...extra });
const brief = lg => lg.items.filter(i => i.state === 'problem' || i.state === 'question').map(i => [i.kind, i.key || (i.paper && i.paper.id), i.units, i.state]);
const text = (lg, papers, i) => ledgerItemText(lg.items[i], lg, papers).text;
const row = (line, code, qty) => ({ line, itemCode: code, barcode: null, description: '', qty, productId: 'code_' + code });
const paper = o => ({ schema: 1, state: 'accepted', timestamp: 1, ...o });
const declared = o => ({ schema: 1, kind: 'declared', state: 'accepted', docDay: '2026-10-05', timestamp: 2, ...o });

test('בלי ניירות: המאזן זהה למרכזת בכל מוצר, וכל יום מ-1.9 עד 3.10 נסגר ל-0', () => {
  const recs = F.receipts.filter(r => storedReceiptDate(r) >= '2026-09-01'), rets = F.returns.filter(r => ledgerReturnDay(r) >= '2026-09-01');
  const m = rangeProductMatrixData({ recs, rets }), lg = ledger([]);
  m.list.forEach(r => assert.equal(lg.products[r.key] ? lg.products[r.key].net : 0, r.openUnits, r.key));
  for (let d = '2026-09-01'; d <= '2026-10-03'; d = api.ledgerAddDays(d, 1)) {
    const day = paperLedger({ recs: F.receipts, rets: F.returns, papers: [], from: '2026-09-01', asOf: d });
    assert.deepEqual(Object.values(day.products).filter(p => p.net).map(p => p.key), [], d);
  }
});

test('היום (בלי הניירות החדשים): 233, 238, 344 לטיפול, ושאלה על 1231 שהקיזוז שלו בוטל', () => {
  const lg = ledger([]);
  assert.deepEqual(brief(lg), [['chargedNotReceived', 'code_233', 1, 'problem'], ['returnedNotCredited', 'code_344', 2, 'problem'],
    ['returnedNotCredited', 'code_238', 1, 'problem'], ['canceledOffset', 'code_1231', 2, 'question']]);
  assert.equal(lg.count, 4);
  assert.equal(text(lg, [], 0), "חוסר בקליטה של 4.10: זוג לחמניות אצבע בש' ×1 — חויבת ולא קיבלת. לבקש זיכוי מהנהג");
  assert.equal(text(lg, [], 3), 'עודף לחמניות 10 בשקית ×2 ב-4.10 וחוסר 2 ב-5.10 — ביטלת את הקיזוז ביניהם. יש נייר חיוב על העודף?');
});

test('אחרי 141 ו-142: חיוב כפול על 1231 ×2, ושאלת תיקון על לחם אחיד — ושום דבר אחר', () => {
  const papers = [P.p141, P.p142], lg = ledger(papers);
  assert.deepEqual(brief(lg), [['chargedTwice', 'code_1231', 2, 'problem'], ['correctionPair', 'code_100', 13, 'question']]);
  assert.equal(text(lg, papers, 0), 'חויבת פעמיים על לחמניות 10 בשקית ×2 — לבקש זיכוי מהנהג');
  assert.match(ledgerItemText(lg.items[0], lg, papers).detail, /כבר חויב בנייר החיוב 95141 מ-4\.10/);
  assert.equal(text(lg, papers, 1), 'נייר החיוב 95141 מ-4.10 09:03 מחייב לחם אחיד ברמן ×13 — נראה שתעודת הזיכוי של ההחזרה מ-4.10 זיכתה לחם אחיד ברמן במקום אחיד פרוס ברמן, וזה התיקון');
  const a142 = lg.placed.find(p => p.id === P.p142.id).attach;
  assert.equal(a142.type, 'return'); assert.equal(a142.id, R1004); assert.equal(a142.role, 'side', '3 מתוך 17 שורות — משלים');
  assert.deepEqual(a142.rowTargets.map(t => t.type + ':' + t.id), ['return:' + R1004, 'receipt:' + RC1004, 'return:' + R1004, 'return:' + R1004], '233 לחוסר בקליטה של 4.10');
  assert.deepEqual(lg.placed.find(p => p.id === P.p141.id).attach.rowTargets.map(t => t.type + ':' + t.id), ['null:null', 'receipt:' + RC1004], '1231 ×2 לעודף ב-4.10');
});

test('"כן, זה תיקון" — נשאר רק 1231 ×2; ההצהרה מתבטלת לבד כשהזיכוי הראשון מצולם', () => {
  const corr = declared({ id: 'decl_corr_1', declare: 'correction', rows: [row(1, '100', 13)], standsFor: { returnId: R1004, chargePaperId: P.p141.id } });
  let lg = ledger([P.p141, P.p142, corr]);
  assert.deepEqual(brief(lg), [['chargedTwice', 'code_1231', 2, 'problem']]);
  lg = ledger([P.p141, P.p142, corr, P.p123, P.pSide]);
  assert.equal(lg.states[corr.id], 'superseded');
  assert.deepEqual(brief(lg), [['chargedTwice', 'code_1231', 2, 'problem']]);
});

test('כל הניירות (כולל הזיכוי הראשון ונייר הצד): בדיוק 1231 ×2', () => {
  const lg = ledger([P.p141, P.p142, P.p123, P.pSide]);
  assert.deepEqual(brief(lg), [['chargedTwice', 'code_1231', 2, 'problem']]);
  assert.deepEqual(Object.values(lg.products).filter(p => p.net).map(p => p.key + ':' + p.net), ['code_1231:2']);
  assert.equal(lg.placed.find(p => p.id === P.p123.id).attach.role, 'main');
  assert.equal(lg.placed.find(p => p.id === P.pSide.id).attach.id, R1004, 'נייר הצד הולך להחזרה שבה 119 ו-339 עוד פתוחים');
});

test('בלי נייר הצד: שאלה "יש עוד תעודת זיכוי?" על 119 ו-339 — וזה נכון', () => {
  const papers = [P.p141, P.p142, P.p123], lg = ledger(papers);
  assert.deepEqual(brief(lg), [['chargedTwice', 'code_1231', 2, 'problem'], ['returnedNotCredited', 'code_339', 3, 'question']]);
  assert.deepEqual(lg.items[1].keys, [{ key: 'code_339', units: 3 }, { key: 'code_119', units: 1 }], 'שאלה אחת להחזרה, עם שני המוצרים');
  assert.equal(text(lg, papers, 1), 'בתעודות הזיכוי של ההחזרה מ-4.10 חסרים: ברמן אקטיב ×3, לחם מלא בטוב ×1 — יש עוד תעודת זיכוי?');
  const done = declared({ id: 'decl_done', declare: 'complete', returnId: R1004 });
  assert.deepEqual(brief(ledger([...papers, done])).map(x => x[3]), ['problem', 'problem', 'problem'], '"זה הכל" — חסר אמיתי, מוצר-מוצר');
  assert.equal(ledger(papers, { asOf: '2026-10-31' }).items.filter(i => i.state === 'question').length, 1, 'שורות שאושרו וחסרות בניירות נשארות שאלה גם אחרי שבועות — עד "זה הכל"');
});

test('רק הזיכוי הראשון צולם: "ברמן זיכתה לחם אחיד במקום אחיד פרוס" עם "מקבל"; התיקון שמגיע אחר כך סוגר', () => {
  let lg = ledger([P.p123]);
  const sw = lg.items.find(i => i.kind === 'swap');
  assert.ok(sw); assert.equal(sw.state, 'problem');
  assert.equal(ledgerItemText(sw, lg, [P.p123]).text, 'ברמן זיכתה לחם אחיד ברמן ×13 במקום אחיד פרוס ברמן שהחזרת ב-4.10');
  const accept = declared({ id: 'decl_swap', declare: 'accept-swap', pair: { a: 'code_101', b: 'code_100', q: 13 } });
  lg = ledger([P.p123, accept]);
  assert.ok(!lg.items.some(i => i.kind === 'swap'));
  assert.equal(lg.products.code_101.net + lg.products.code_100.net, 0);
  lg = ledger([P.p123, accept, P.p141, P.p142, P.pSide]);
  assert.equal(lg.states[accept.id], 'superseded', 'הנייר האמיתי הגיע — ההסכמה כבר לא נדרשת');
  assert.deepEqual(brief(lg), [['chargedTwice', 'code_1231', 2, 'problem']]);
});

test('B1: נייר הזיכוי של ההחזרה מ-1.10, שצולם כשכבר יש החזרה מ-4.10 עם אותם מוצרים — הולך ל-1.10 ולא משנה דבר', () => {
  const p = paper({ id: 'paper_t1', kind: 'credit', number: '290094990', docDay: '2026-10-02', rows: [row(1, '333', 2), row(2, '2387', 5), row(3, '401', 1), row(4, '238', 2), row(5, '2381', 5)] });
  const lg = ledger([p]);
  const a = lg.placed[0].attach;
  assert.equal(a.id, R1001); assert.equal(a.role, 'main');
  assert.deepEqual(brief(lg), brief(ledger([])));
  const short = paper({ ...p, id: 'paper_t2', rows: p.rows.filter(r => r.itemCode !== '401') });
  const lg2 = ledger([short]);
  assert.ok(lg2.items.some(i => i.kind === 'returnedNotCredited' && i.key === 'code_401' && i.state === 'question' && i.askMore), 'נייר ראשי בלי 401 — שואל אם יש עוד');
});

test('נייר משלים על שורה שכבר אושרה אינו מזכה פעמיים ואינו יוצר "לבקש זיכוי"', () => {
  const side = paper({ id: 'paper_side_t', kind: 'credit', number: '290094991', docDay: '2026-10-02', forReturnId: R1001, rows: [row(1, '2387', 2)] });
  const lg = ledger([side]);
  assert.equal(lg.placed[0].attach.role, 'side');
  assert.deepEqual(brief(lg), brief(ledger([])));
});

test('B2: שורה שהועברה וזיכוי ביתר — בלי ניירות זהה למרכזת', () => {
  const rets = F.returns.concat([{ id: 'ret_carry', date: '2026-10-02', docDate: '2026-10-02', timestamp: 3, credited: true, creditStatus: 'ok',
    items: [{ productId: 'code_238', code: '238', name: 'ברמן אסלי 5 פיתות', qty: 3 }, { productId: 'carry_x', code: '238', name: 'ברמן אסלי 5 פיתות', qty: 1, carried: true },
      { productId: 'code_2381', code: '2381', name: 'פיתות פרימיום 10', qty: 2, noteQty: 3 }] }]);
  const recs = F.receipts.filter(r => storedReceiptDate(r) >= '2026-09-01'), inRange = rets.filter(r => ledgerReturnDay(r) >= '2026-09-01');
  const m = rangeProductMatrixData({ recs, rets: inRange });
  const lg = paperLedger({ recs: F.receipts, rets, papers: [], from: '2026-09-01', asOf: '2026-10-05' });
  m.list.forEach(r => assert.equal(lg.products[r.key] ? lg.products[r.key].net : 0, r.openUnits, r.key));
});

test('נייר שכבר נכלל בקליטה, תעודת משלוח שלא נקלטה, נייר כפול, ונייר שלא הוכח — אף אחד מהם לא נספר', () => {
  const inBundle = paper({ id: 'paper_290094585', kind: 'charge', number: '290094585', docDay: '2026-09-20', rows: [row(1, '238', 8)] });
  const delivered = paper({ id: 'paper_244734757', kind: 'delivery', number: '244734757', docDay: '2026-10-05', rows: [row(1, '101', 20)] });
  const pendingNote = paper({ id: 'paper_244799999', kind: 'delivery', number: '244799999', docDay: '2026-10-04', rows: [row(1, '101', 5)] });
  const copy141 = { ...P.p141, id: 'paper_290095171', number: '290095171', terminalNumber: '290095171', timestamp: P.p141.timestamp + 60000 };
  const unread = paper({ id: 'paper_x', kind: 'credit', number: '290095150', docDay: '2026-10-05', state: 'needs-review', rows: [row(1, '101', 1)] });
  const lg = ledger([inBundle, delivered, pendingNote, P.p141, P.p142, copy141, unread]);
  assert.equal(lg.states[inBundle.id], 'in-receipt');
  assert.equal(lg.states[delivered.id], 'in-receipt');
  assert.equal(lg.states[pendingNote.id], 'awaiting-receipt');
  assert.equal(lg.states[copy141.id], 'duplicate', 'אותו נייר עם ספרה אחרת במספר');
  assert.equal(lg.states[unread.id], 'unproven');
  assert.deepEqual(brief(lg), [['chargedTwice', 'code_1231', 2, 'problem'], ['deliveryNotReceived', pendingNote.id, undefined, 'problem'],
    ['unproven', unread.id, undefined, 'question'], ['correctionPair', 'code_100', 13, 'question']]);
});

test('נייר זיכוי שלא ברור לאיזו החזרה הוא שייך — לא נספר עד שעונים', () => {
  const p = paper({ id: 'paper_amb', kind: 'credit', number: '290094992', docDay: '2026-10-02', rows: [row(1, '2381', 1)] });
  const lg = ledger([p]);
  assert.equal(lg.states[p.id], 'needs-attach');
  const it = lg.items.find(i => i.kind === 'needsAttach');
  const t = ledgerItemText(it, lg, [p]);
  assert.equal(t.text, 'לאיזו החזרה שייך נייר הזיכוי 94992 מ-2.10?');
  assert.ok(t.actions.slice(0, -1).every(a => /^ההחזרה מ-\d+\.\d+ · (שורה אחת|\d+ שורות) · /.test(a.label)), 'כל כפתור אומר גם כמה שורות ומה הגדול שבהן');
  assert.ok(t.actions.length >= 3 && t.actions.at(-1).label === 'לא שייך להחזרה');
  const chosen = { ...p, attach: { type: 'return', id: R1001, role: 'side', rowTargets: [{ line: 0, type: 'return', id: R1001 }], by: 'user' } };
  assert.equal(ledger([chosen]).states[p.id], 'counted');
});

test('חודש שנסגר מול החשבונית יוצא מהמאזן', () => {
  const lg = ledger([P.p141, P.p142], { closedThrough: '2026-10-04' });
  assert.equal(lg.start, '2026-10-05');
  assert.equal(lg.states[P.p141.id], 'outside');
  assert.ok(!Object.values(lg.products).some(p => p.parts.some(x => x.day < '2026-10-05')));
});

// ===== ממצאי הסקירה של v125 — כל אחד מוצמד =====
const nets = lg => Object.fromEntries(Object.values(lg.products).filter(p => p.net).map(p => [p.key, p.net]));
const BASE_NETS = { code_233: 1, code_344: 2, code_238: 1 };

test('B1: נייר זיכוי לחוסר בקליטה שכבר זוכה ברישום (כסף ישן) — לא נספר פעמיים ולא מסתיר בעיה אחרת', () => {
  const p = paper({ id: 'paper_t_b1', kind: 'credit', number: '290094400', docDay: '2026-09-02', rows: [row(1, '233', 1), row(2, '3604', 1)] });
  const lg = ledger([p]);
  assert.deepEqual(nets(lg), BASE_NETS);
  assert.ok(!lg.items.some(i => i.kind === 'creditedNotReturned'));
  const p29 = paper({ id: 'paper_t_b1b', kind: 'credit', number: '290094990', docDay: '2026-09-30', rows: [row(1, '3604', 1)] });
  assert.deepEqual(nets(ledger([p29])), BASE_NETS);
});

test('M1: חלק מזיכוי של ההחזרה מ-1.10 שהודפס ב-4.10 — הולך ל-1.10 לפי הכמויות, לא ל-4.10', () => {
  const a = paper({ id: 'paper_t_m1', kind: 'credit', number: '290095130', docDay: '2026-10-04', rows: [row(1, '238', 2), row(2, '2387', 5), row(3, '2381', 5)] });
  const lg = ledger([a]);
  assert.equal(lg.placed[0].attach.id, R1001);
  assert.ok(!lg.items.some(i => i.kind === 'creditedNotReturned'));
  // רק חלק א' צולם: השאלה היחידה החדשה היא על החלק השני של אותה החזרה (333, 401)
  const extra = lg.items.filter(i => i.kind === 'returnedNotCredited' && i.askMore);
  assert.equal(extra.length, 1); assert.equal(extra[0].part.id, R1001);
  assert.deepEqual(extra[0].keys.map(k => k.key).sort(), ['code_333', 'code_401']);
  const b = paper({ id: 'paper_t_m1b', kind: 'credit', number: '290095131', docDay: '2026-10-04', rows: [row(1, '333', 2), row(2, '401', 1)] });
  assert.deepEqual(nets(ledger([a, b])), BASE_NETS, 'שני החלקים — חזרה בדיוק למצב שלפני');
});

test('M2: שני ניירות אמיתיים עם אותו תוכן באותו יום (מספרים שונים שתואמים לנומרטור) — שניהם נספרים', () => {
  const p1 = paper({ id: 'paper_290095150', kind: 'credit', number: '290095150', numerator: '95150', docDay: '2026-10-05', forReturnId: R1004, rows: [row(1, '344', 1)] });
  const p2 = paper({ ...p1, id: 'paper_290095163', number: '290095163', numerator: '95163', timestamp: 2 });
  const lg = ledger([p1, p2]);
  assert.equal(lg.states[p2.id], 'counted');
  assert.equal(lg.products.code_344.net, 0);
  const misread = { ...p1, id: 'paper_290095170', number: '290095170', numerator: '95150', timestamp: 3 }; // ספרה שגויה במספר, הנומרטור מסגיר
  const lg2 = ledger([p1, misread]);
  assert.equal(lg2.states[misread.id], 'duplicate');
  assert.ok(lg2.items.some(i => i.kind === 'duplicatePaper' && i.state === 'info'), 'הכפילות מוצגת, לא נעלמת בשקט');
});

test('M3/M7: שיוך אוטומטי ששמור על הנייר אינו נאמן — מחושב מחדש; רק בחירה של המשתמש נשמרת', () => {
  const stale = { ...P.pSide, attach: { type: null, id: null, ask: [R1004, 'returns_2c14e178-xx'], by: 'auto' } };
  assert.deepEqual(brief(ledger([P.p141, P.p142, P.p123, stale])), [['chargedTwice', 'code_1231', 2, 'problem']]);
  const wrongMain = { ...P.p142, attach: { type: 'return', id: R1004, role: 'main', rowTargets: [0, 1, 2, 3].map(i => ({ line: i, type: 'return', id: R1004 })), by: 'auto' } };
  assert.deepEqual(brief(ledger([P.p141, wrongMain])), [['chargedTwice', 'code_1231', 2, 'problem'], ['correctionPair', 'code_100', 13, 'question']]);
});

test('M4: שורה שהועברה (carry) ונייר משלים עליה — לא מסתיר את החסר האמיתי של 4.10', () => {
  const rets = F.returns.concat([{ id: 'ret_carry_t', date: '2026-10-02', docDate: '2026-10-02', timestamp: 5, credited: true, creditStatus: 'ok',
    items: [{ productId: 'carry_x', code: '238', name: 'ברמן אסלי 5 פיתות', qty: 1, carried: true }, { productId: 'code_2381', code: '2381', name: 'פיתות פרימיום 10', qty: 2 }] }]);
  const side = paper({ id: 'paper_t_m4', kind: 'credit', number: '290094995', docDay: '2026-10-02', forReturnId: 'ret_carry_t', rows: [row(1, '238', 1)] });
  const before = paperLedger({ recs: F.receipts, rets, papers: [], from: '2026-09-01', asOf: '2026-10-05' }).products.code_238.net;
  const lg = paperLedger({ recs: F.receipts, rets, papers: [side], from: '2026-09-01', asOf: '2026-10-05' });
  assert.equal(lg.products.code_238.net, before, 'הנייר הוא אותו זיכוי שכבר אושר על השורה שהועברה — לא נספר פעמיים');
});

test('M5: "כן, זה תיקון" מתבטל כשנייר החיוב שבגללו נשאל נמחק או בוטל', () => {
  const corr = declared({ id: 'decl_corr_t', declare: 'correction', docDay: '2026-10-04', rows: [row(1, '100', 13)], standsFor: { returnId: R1004, chargePaperId: P.p141.id } });
  const lg = ledger([{ ...P.p141, state: 'void' }, P.p142, corr]);
  assert.equal(lg.states[corr.id], 'superseded');
  assert.ok(!lg.items.some(i => i.key === 'code_100'));
});

test('M6: "מקבל את ההחלפה" לא מתבטל בגלל החזרה חדשה ולא קשורה של אותו מוצר', () => {
  const accept = declared({ id: 'decl_swap_t', declare: 'accept-swap', pair: { a: 'code_101', b: 'code_100', q: 13 } });
  const rets = F.returns.concat([{ id: 'ret_101_t', date: '2026-10-05', docDate: '2026-10-05', timestamp: 6, credited: false, items: [{ productId: 'code_101', code: '101', name: 'אחיד פרוס ברמן', qty: 2 }] }]);
  const lg = paperLedger({ recs: F.receipts, rets, papers: [P.p123, accept], from: '2026-09-01', asOf: '2026-10-05' });
  assert.equal(lg.states[accept.id], 'counted');
  assert.ok(!lg.items.some(i => i.kind === 'creditedNotReturned' || i.kind === 'swap'));
});

test('M7: בהחזרה קטנה (4 שורות) נייר הזיכוי שליד נייר החיוב נשאר משלים — שאלת התיקון נשארת', () => {
  const small = { id: R1004, date: '2026-10-04', docDate: '2026-10-04', timestamp: 7, credited: true, creditStatus: 'open',
    items: [{ productId: 'code_101', code: '101', name: 'אחיד פרוס ברמן', qty: 13 }, { productId: 'code_344', code: '344', name: 'לחם מקמח כוסמין E-FREE', qty: 2, noteQty: 0 },
      { productId: 'code_238', code: '238', name: 'ברמן אסלי 5 פיתות', qty: 1, noteQty: 0 }, { productId: 'code_450', code: '450', name: 'חלה מרובעת ברמן', qty: 7 }] };
  const rets = F.returns.filter(r => r.id !== R1004).concat([small]);
  const lg = paperLedger({ recs: F.receipts, rets, papers: [P.p142, P.p141], from: '2026-09-01', asOf: '2026-10-05' });
  assert.equal(lg.placed.find(p => p.id === P.p142.id).attach.role, 'side');
  assert.deepEqual(brief(lg), [['chargedTwice', 'code_1231', 2, 'problem'], ['correctionPair', 'code_100', 13, 'question']]);
});

test('M8: נייר של החזרה מחודש שנסגר — יוצא מהמאזן, לא נספר כזיכוי בלי שיוך', () => {
  const p = paper({ id: 'paper_t_m8', kind: 'credit', number: '290094996', docDay: '2026-10-02', rows: [row(1, '333', 2), row(2, '2387', 5), row(3, '401', 1), row(4, '238', 2), row(5, '2381', 5)] });
  const lg = ledger([p], { closedThrough: '2026-10-01' });
  assert.equal(lg.states[p.id], 'outside');
  assert.ok(!lg.items.some(i => i.kind === 'creditedNotReturned'));
});

test('שורת חיוב לא נצמדת לעודף קטן ממנה; מזהה קיזוז מושווה במדויק; סוג נייר לא מוכר לא נספר; תעודת משלוח של יום עם קליטה בלי מספר', () => {
  const recs = F.receipts.concat([{ id: 'rc_over_t', date: '2026-10-02', docDate: '2026-10-02', timestamp: 8, items: [{ productId: 'code_100', code: '100', name: 'לחם אחיד ברמן', qty: 1, noteQty: 0 }] }]);
  const lg = paperLedger({ recs, rets: F.returns, papers: [P.p141, P.p142], from: '2026-09-01', asOf: '2026-10-05' });
  assert.ok(lg.items.some(i => i.kind === 'correctionPair' && i.key === 'code_100'), 'עודף של 1 לא בולע חיוב של 13');
  assert.equal(api.ledgerOffsetIdMatches('xo2|A|B|code_2381', 'A', 'B', 'code_238'), false);
  assert.equal(api.ledgerOffsetIdMatches('xo2|A|B|code_238~code_239', 'A', 'B', 'code_238'), true);
  const future = paper({ id: 'paper_future', kind: 'invoice-month', number: '1539902', docDay: '2026-10-01', rows: [row(1, '101', 5)] });
  assert.equal(ledger([future]).states[future.id], 'unsupported');
  const bare = F.receipts.find(r => !api.storedReceiptPaperNumbers(r).length && api.storedReceiptDate(r) >= '2026-09-01');
  const note = paper({ id: 'paper_t_del', kind: 'delivery', number: '244600000', docDay: api.storedReceiptDate(bare), rows: [row(1, '101', 5)] });
  assert.equal(ledger([note]).states[note.id], 'in-receipt', 'יש באותו יום קליטה שנשמרה בלי מספר — כנראה זו');
});

test('סוג שלא נקרא — "לבדיקה", לא נספר כחיוב; תעודת משלוח שלא נקראה עד הסוף עדיין מזכירה שלא נקלטה; קליטה מאותו יום במספר אחר — שאלה עם פרטים', () => {
  const unknown = paper({ id: 'paper_cap_x', kind: null, kindKnown: false, state: 'needs-review', docDay: '2026-10-05', rows: [row(1, '344', 2)] });
  let lg = ledger([unknown]);
  assert.equal(lg.states.paper_cap_x, 'unproven');
  assert.deepEqual(brief(lg).filter(b => b[1] === 'paper_cap_x'), [['unproven', 'paper_cap_x', undefined, 'question']]);
  assert.equal(lg.products.code_344.net, 2, 'לא נספר כחיוב או כזיכוי');
  const dn = paper({ id: 'paper_244799999', kind: 'delivery', state: 'needs-review', number: '244799999', docDay: '2026-10-05', rows: [row(1, '100', 3)], anchors: { units: 3, lines: 1 } });
  lg = ledger([dn]);
  assert.equal(lg.states.paper_244799999, 'awaiting-receipt');
  const it = lg.items.find(i => i.kind === 'deliveryNotReceived');
  assert.equal(it.sameDay, true, 'יש קליטה מ-5.10 עם מספר אחר');
  const t = ledgerItemText(it, lg, [dn]);
  assert.match(t.text, /לא נמצאה בקליטה של 5\.10/);
  assert.deepEqual(t.actions.map(a => a.role), ['ledger-paper-open', 'ledger-start-receiving']);
  assert.match(t.detail, /3 יח׳ ו-שורה אחת/);
});
