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
  'paperUnits', 'paperFingerprint', 'receiptScanFingerprints', 'paperNumbers', 'paperIsCredit', 'ledgerPaperStates', 'ledgerDeliveriesSince', 'paperAttach',
  'paperLedger', 'ledgerClassify', 'ledgerCorrectionPair', 'ledgerDayShort', 'paperLabel', 'ledgerItemText'];
const CONSTS = ["const LEDGER_FROM_DEFAULT = '2026-09-01';", 'const LEDGER_RETURN_WINDOW_DAYS = 14;', 'const LEDGER_PENDING_DELIVERIES = 3;'];
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
  assert.equal(text(lg, [], 0), "חויבת על זוג לחמניות אצבע בש' ×1 שלא הגיעו בקליטה של 4.10 — לבקש זיכוי מהנהג");
  assert.equal(text(lg, [], 3), 'עודף לחמניות 10 בשקית ×2 ב-4.10 וחוסר 2 ב-5.10 — ביטלת את הקיזוז ביניהם. יש נייר חיוב על העודף?');
});

test('אחרי 141 ו-142: חיוב כפול על 1231 ×2, ושאלת תיקון על לחם אחיד — ושום דבר אחר', () => {
  const papers = [P.p141, P.p142], lg = ledger(papers);
  assert.deepEqual(brief(lg), [['chargedTwice', 'code_1231', 2, 'problem'], ['correctionPair', 'code_100', 13, 'question']]);
  assert.equal(text(lg, papers, 0), 'חויבת פעמיים על לחמניות 10 בשקית ×2 — לבקש זיכוי מהנהג');
  assert.match(ledgerItemText(lg.items[0], lg, papers).detail, /כבר חויב בנייר החיוב מ-4\.10 09:03/);
  assert.equal(text(lg, papers, 1), 'נייר החיוב מ-4.10 09:03 מחייב לחם אחיד ברמן ×13 — נראה שזה תיקון לזיכוי של ההחזרה מ-4.10, שנרשם על לחם אחיד ברמן במקום אחיד פרוס ברמן');
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
  assert.deepEqual(brief(lg), [['chargedTwice', 'code_1231', 2, 'problem'], ['returnedNotCredited', 'code_339', 3, 'question'], ['returnedNotCredited', 'code_119', 1, 'question']]);
  assert.equal(text(lg, papers, 1), 'בתעודת הזיכוי של ההחזרה מ-4.10 חסר ברמן אקטיב ×3 — יש עוד תעודת זיכוי?');
  const done = declared({ id: 'decl_done', declare: 'complete', returnId: R1004 });
  assert.deepEqual(brief(ledger([...papers, done])).map(x => x[3]), ['problem', 'problem', 'problem'], '"זה הכל" — חסר אמיתי');
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
  assert.equal(t.text, 'לאיזו החזרה שייך נייר הזיכוי מ-2.10?');
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
