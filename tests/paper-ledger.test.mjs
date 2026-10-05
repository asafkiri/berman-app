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
  'paperLedger', 'ledgerClassify', 'ledgerCorrectionCandidates', 'ledgerDayShort', 'ledgerRowsText', 'paperLabel', 'ledgerItemText', 'ledgerMatrixAdjust'];
const CONSTS = ["const LEDGER_PHOTO_HINT = ' כשיש נייר — צלם אותו בכפתור \"צלם נייר מהנהג\" למעלה.';", "const LEDGER_FROM_DEFAULT = '2026-09-01';", 'const LEDGER_RETURN_WINDOW_DAYS = 14;', 'const LEDGER_PENDING_DELIVERIES = 3;', "const LEDGER_PAPER_KINDS = ['delivery', 'charge', 'credit', 'declared'];"];
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

// v130: בלי שאלות — עודף בקליטה אחת וחוסר באחרת של אותו מוצר מתקזזים, גם כשפעם בוטל ביניהם קיזוז
test('היום (בלי הניירות החדשים): 233, 238, 344 לטיפול; 1231 (עודף 4.10, חוסר 5.10) מתקזז לבד — בלי שאלה', () => {
  const lg = ledger([]);
  assert.deepEqual(brief(lg), [['chargedNotReceived', 'code_233', 1, 'problem'], ['returnedNotCredited', 'code_344', 2, 'problem']]);
  assert.deepEqual(lg.items[1].keys, [{ key: 'code_344', units: 2 }, { key: 'code_238', units: 1 }], 'החזרה אחת — פריט אחד עם שני המוצרים');
  assert.equal(lg.count, 2);
  assert.equal(text(lg, [], 0), "חוסר בקליטה של 4.10: זוג לחמניות אצבע בש' ×1 — חויבת ולא קיבלת. לבקש זיכוי מהנהג");
  assert.match(text(lg, [], 1), /^החזרת .*×2, .*×1 ב-4\.10 ולא זוכית — לבקש זיכוי מהנהג$/);
  const net = lg.items.find(i => i.key === 'code_1231');
  assert.equal(net.kind, 'netted'); assert.equal(net.state, 'info'); assert.ok(net.offsetId, 'הקיזוז שבוטל — רק לידיעה');
  assert.equal(ledgerItemText(net, lg, []).text, 'לחמניות 10 בשקית: עודף ב-4.10 וחוסר ב-5.10 התקזזו');
  assert.ok(!lg.items.some(i => i.state === 'question'));
});

test('אחרי 141 ו-142: רק חיוב כפול על 1231 ×2; התיקון של לחם אחיד מזוהה לבד ומתקזז — בלי שאלה', () => {
  const papers = [P.p141, P.p142], lg = ledger(papers);
  assert.deepEqual(brief(lg), [['chargedTwice', 'code_1231', 2, 'problem']]);
  assert.equal(text(lg, papers, 0), 'חויבת פעמיים על לחמניות 10 בשקית ×2 — לבקש זיכוי מהנהג');
  assert.match(ledgerItemText(lg.items[0], lg, papers).detail, /כבר חויב בנייר החיוב 95141 מ-4\.10/);
  const auto = lg.items.find(i => i.kind === 'autoCorrection');
  assert.deepEqual([auto.key, auto.units, auto.state], ['code_100', 13, 'info']);
  assert.equal(ledgerItemText(auto, lg, papers).text, 'תיקון של ברמן בנייר החיוב 95141 מ-4.10 09:03: לחם אחיד ברמן ×13 — מבטל זיכוי שניתן על לחם אחיד ברמן במקום אחיד פרוס ברמן. התקזז, אין מה לבקש');
  assert.equal(lg.products.code_100.net, 0);
  assert.deepEqual(lg.autoDeclared.map(d => [d.declare, d.standsFor.chargePaperId, d.standsFor.creditPaperId, d.standsFor.other]), [['correction', P.p141.id, P.p142.id, 'code_101']]);
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

test('בלי נייר הצד: 119 ו-339 "ממתין לתעודת זיכוי נוספת" — בלי שאלה; "זה הכל" הופך אותם ללטיפול', () => {
  const papers = [P.p141, P.p142, P.p123], lg = ledger(papers);
  assert.deepEqual(brief(lg), [['chargedTwice', 'code_1231', 2, 'problem']]);
  const more = lg.items.find(i => i.kind === 'returnedNotCredited');
  assert.equal(more.state, 'pending'); assert.ok(more.askMore);
  assert.deepEqual(more.keys, [{ key: 'code_339', units: 3 }, { key: 'code_119', units: 1 }], 'פריט אחד להחזרה, עם שני המוצרים');
  assert.equal(ledgerItemText(more, lg, papers).text, 'בתעודות הזיכוי של ההחזרה מ-4.10 חסרים: ברמן אקטיב ×3, לחם מלא בטוב ×1 — ממתין לתעודת זיכוי נוספת');
  const done = declared({ id: 'decl_done', declare: 'complete', returnId: R1004 });
  const lgDone = ledger([...papers, done]);
  assert.deepEqual(brief(lgDone).map(x => x[3]), ['problem', 'problem'], '"זה הכל" — חסר אמיתי');
  assert.deepEqual(lgDone.items.find(i => i.kind === 'returnedNotCredited').keys.map(z => z.key), ['code_339', 'code_119'], 'פריט אחד להחזרה, גם אחרי "זה הכל"');
  const late = ledger(papers, { asOf: '2026-10-31' });
  assert.equal(late.items.filter(i => i.state === 'question').length, 0);
  assert.equal(late.items.find(i => i.kind === 'returnedNotCredited').state, 'pending', 'שורות שאושרו ברישום וחסרות בניירות — ממתין (במסך המאזן), לא נעלמות');
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
  assert.ok(lg2.items.some(i => i.kind === 'returnedNotCredited' && i.key === 'code_401' && i.state === 'pending' && i.askMore), 'נייר ראשי בלי 401 — ממתין לנייר נוסף (בלי שאלה)');
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
    ['unproven', unread.id, undefined, 'question']]);
});

// v130: בלי "לאיזו החזרה?" — המאזן לפי מוצר לא תלוי בבחירה; [שנה] נשאר בבדיקת הנייר
test('נייר זיכוי שמתאים לכמה החזרות — משויך לבד להחזרה מתקופת המאזן, בלי שאלה; המאזן לא משתנה; בחירה של המשתמש נשמרת', () => {
  const p = paper({ id: 'paper_amb', kind: 'credit', number: '290094992', docDay: '2026-10-02', rows: [row(1, '2381', 1)] });
  const lg = ledger([p]);
  assert.equal(lg.states[p.id], 'counted');
  assert.ok(!lg.items.some(i => i.kind === 'needsAttach' || i.state === 'question'));
  const at = lg.placed.find(x => x.id === p.id).attach;
  assert.equal(at.type, 'return'); assert.ok(lg.docDays[at.id] >= '2026-09-01');
  assert.deepEqual(nets(lg), nets(ledger([])), 'נייר משלים על שורה שאושרה — לא מזכה פעמיים');
  const chosen = { ...p, attach: { type: 'return', id: R1001, role: 'side', rowTargets: [{ line: 0, type: 'return', id: R1001 }], by: 'user' } };
  const lc = ledger([chosen]);
  assert.equal(lc.states[p.id], 'counted');
  assert.equal(lc.placed.find(x => x.id === p.id).attach.id, R1001);
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
  const lw = ledger([P.p141, wrongMain]);
  assert.equal(lw.placed.find(p => p.id === P.p142.id).attach.role, 'side', 'השיוך השמור (ראשי) לא נאמן — מחושב מחדש');
  assert.deepEqual(brief(lw), [['chargedTwice', 'code_1231', 2, 'problem']]);
  assert.ok(lw.items.some(i => i.kind === 'autoCorrection' && i.key === 'code_100'));
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

// v130 (סקירה): בלי שאלות לא מניחים תיקון כשהנייר שצולם נראה כמו הנייר הראשי של ההחזרה — חוסר אמיתי לא נבלע.
// הצד הבטוח: לחם אחיד ×13 "לבקש זיכוי", ו-450 שחסר בנייר — ממתין; צילום תעודת הזיכוי הראשונה סוגר.
test('M7: בהחזרה קטנה (4 שורות) נייר הזיכוי שליד נייר החיוב הוא הראשי — אין תיקון אוטומטי, החיוב "לבקש זיכוי"', () => {
  const small = { id: R1004, date: '2026-10-04', docDate: '2026-10-04', timestamp: 7, credited: true, creditStatus: 'open',
    items: [{ productId: 'code_101', code: '101', name: 'אחיד פרוס ברמן', qty: 13 }, { productId: 'code_344', code: '344', name: 'לחם מקמח כוסמין E-FREE', qty: 2, noteQty: 0 },
      { productId: 'code_238', code: '238', name: 'ברמן אסלי 5 פיתות', qty: 1, noteQty: 0 }, { productId: 'code_450', code: '450', name: 'חלה מרובעת ברמן', qty: 7 }] };
  const rets = F.returns.filter(r => r.id !== R1004).concat([small]);
  const lg = paperLedger({ recs: F.receipts, rets, papers: [P.p142, P.p141], from: '2026-09-01', asOf: '2026-10-05' });
  assert.equal(lg.placed.find(p => p.id === P.p142.id).attach.role, 'main', '3 מתוך 4 שורות — ראשי, גם ליד נייר חיוב');
  assert.deepEqual(brief(lg), [['chargedTwice', 'code_1231', 2, 'problem'], ['paperChargeNotReceived', 'code_100', 13, 'problem']]);
  assert.deepEqual(lg.autoDeclared, []);
  assert.ok(lg.items.some(i => i.kind === 'returnedNotCredited' && i.state === 'pending' && (i.keys || []).some(k => k.key === 'code_450')), '450 חסר בנייר הראשי — ממתין');
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
  assert.ok(lg.items.some(i => i.kind === 'autoCorrection' && i.key === 'code_100' && i.units === 13), 'עודף של 1 לא בולע חיוב של 13');
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
  // v126: התעודה כבר נקראה — "לקליטה" מכניס אותה כפי שנקראה; לא שולחים להקליד
  assert.doesNotMatch(t.detail, /הקלד את המספרים/);
  assert.equal(t.actions.find(a => a.role === 'ledger-start-receiving').paperId, 'paper_244799999');
  const far = ledgerItemText({ ...it, sameDay: false }, lg, [dn]);
  assert.match(far.text, /צולמה ועוד לא נקלטה/);
  assert.match(far.detail, /כבר נקראה \(3 יח׳ ו-שורה אחת מהתחתית\)/);
  assert.doesNotMatch(far.detail, /הקלד את המספרים/);
});

// ===== סבב סקירה שני =====
test('נייר חיוב רגיל באותו ביקור (עודף שהגיע) ליד נייר הזיכוי הראשי — לא הופך אותו ל"משלים"', () => {
  const charge = n => paper({ id: 'paper_2900' + n, kind: 'charge', number: '2900' + n, terminalNumber: '2900' + n, numerator: n, docDay: '2026-10-04', rows: [row(1, '1231', 2)] });
  for (const n of ['95124', '95141']) {
    const set = [P.p123, charge(n)], lg = ledger(set);
    assert.equal(lg.placed.find(x => x.id === P.p123.id).attach.role, 'main', n);
    assert.equal(lg.products.code_119.net, 1, n + ': 119 שלא זוכה נשאר שאלה');
    assert.equal(lg.products.code_339.net, 3, n);
  }
  // נייר החיוב 141 (100 ×13 בלי עודף בקליטה) הוא סבב תיקונים — 142 שלידו נשאר משלים (M7)
  const lg = ledger([P.p141, P.p142]);
  assert.equal(lg.placed.find(x => x.id === P.p142.id).attach.role, 'side');
});

test('נייר מוקדם לחודש: כל ההחזרות המתאימות לפני תחילת המאזן — "מחוץ לתקופה", לא זיכוי שמסתיר חוסר אמיתי', () => {
  const p = paper({ id: 'paper_290090300', kind: 'credit', number: '290090300', numerator: '90300', docDay: '2026-09-09', rows: [row(1, '233', 1)] });
  const lg = ledger([p]);
  assert.equal(lg.states[p.id], 'outside');
  assert.equal(lg.products.code_233.net, 1, 'החוסר של 4.10 על 233 נשאר');
  // v130 (סקירה 2): בחודש סגור, כשההחזרות שמתאימות הכי טוב (בשוויון) כולן לפני הסגירה — הנייר שייך לשם ("מחוץ
  // לתקופה"), גם כשיש בתקופה החזרה שמתאימה פחות טוב: לא מצמידים אותה לבד (זה היה בולע את החוסר שלה)
  const q = paper({ id: 'paper_290094800', kind: 'credit', number: '290094800', numerator: '94800', docDay: '2026-10-01', rows: [row(1, '2381', 2)] });
  const lc = ledger([q], { closedThrough: '2026-09-30' });
  assert.equal(lc.states[q.id], 'outside');
  assert.deepEqual(nets(lc), nets(ledger([], { closedThrough: '2026-09-30' })));
  const full = ledger([q]);
  assert.ok(full.docDays[full.placed.find(x => x.id === q.id).attach.id] < '2026-10-01', 'במאזן המלא — לאחת ההחזרות של ספטמבר, כמו במאזן החי');
});

test('החלפה (100 במקום 101) לא בולעת חוסר אחר של 101 בקליטה; אחרי "מקבל" החוסר נשאר על הקליטה שלו', () => {
  const rc = F.receipts.find(r => r.id.startsWith('receipt_83b2692c'));
  const recs = F.receipts.map(r => r === rc ? { ...rc, items: rc.items.concat([{ productId: 'code_101', code: '101', name: 'x', qty: 3, noteQty: 5 }]) } : r);
  const run = ps => paperLedger({ recs, rets: F.returns, papers: ps, from: '2026-09-01', asOf: '2026-10-05' });
  let lg = run([P.p123, P.pSide]);
  assert.deepEqual(brief(lg).filter(b => b[1] === 'code_101'), [['swap', 'code_101', 13, 'problem'], ['chargedNotReceived', 'code_101', 2, 'problem']]);
  const accept = declared({ id: 'decl_swap', declare: 'accept-swap', pair: { a: 'code_101', b: 'code_100', q: 13 }, standsFor: { returnId: R1004 } });
  lg = run([P.p123, P.pSide, accept]);
  const it = lg.items.find(i => i.key === 'code_101');
  assert.equal(it.kind, 'chargedNotReceived'); assert.equal(it.part.type, 'receipt');
  assert.equal(lg.products.code_100.net, 0);
});

test('החלפה לא ודאית (כמה מוצרים חסרים באותה כמות) — לא מנחשים איזה; כל צד מוצג בשמו', () => {
  const p = paper({ id: 'paper_290095150', kind: 'credit', number: '290095150', numerator: '95150', docDay: '2026-10-04', forReturnId: R1004,
    rows: [row(1, '101', 13), row(2, '459', 1)] });
  const lg = ledger([P.p123, p]);
  assert.ok(!lg.items.some(i => i.kind === 'swap' && i.swap.b === 'code_459'), 'אין "זיכתה חלומית במקום X" שנבחר באקראי');
  assert.ok(lg.items.some(i => i.kind === 'creditedNotReturned' && i.key === 'code_459'));
});

test('צילום חוזר של אותו נייר עם ספרה שגויה בתחילת המספר — אותו נומרטור, נספר פעם אחת', () => {
  const a = { ...P.p142, numerator: '95142' };
  const b = { ...P.p142, id: 'paper_280095142', number: '280095142', terminalNumber: null, numerator: '95142', timestamp: 9 };
  const lg = ledger([P.p123, P.pSide, P.p141, a, b]);
  assert.deepEqual([lg.states[a.id], lg.states[b.id]].sort(), ['counted', 'duplicate']);
  assert.deepEqual(Object.values(lg.products).filter(x => x.net).map(x => [x.key, x.net]), [['code_1231', 2]]);
  // "אלה שני ניירות שונים" — שניהם נספרים
  const lg2 = ledger([P.p123, P.pSide, P.p141, a, { ...b, distinctFrom: [a.id] }]);
  assert.equal(lg2.states[b.id], 'counted');
});

test('חודש סגור: שורה לחוסר בקליטה מלפני הסגירה לא מוציאה את כל נייר הזיכוי מהמאזן', () => {
  const rets = F.returns.map(r => r.id === R1001 ? { ...r, credited: false, creditStatus: null } : r);
  const lines = [row(1, '333', 2), row(2, '2387', 5), row(3, '401', 1), row(4, '238', 2), row(5, '2381', 5), row(6, '3604', 1)];
  const p = paper({ id: 'paper_290090900', kind: 'credit', number: '290090900', numerator: '90900', docDay: '2026-10-02', forReturnId: R1001, rows: lines });
  const lg = paperLedger({ recs: F.receipts, rets, papers: [p], from: '2026-09-01', closedThrough: '2026-09-30', asOf: '2026-10-05' });
  assert.equal(lg.states[p.id], 'counted');
  assert.ok(!lg.items.some(i => i.kind === 'returnNotCreditedYet' && i.part.id === R1001), 'ההחזרה מ-1.10 זוכתה בנייר');
});

test('התיקון מזוהה על כל שורת נייר החיוב (×13) גם כשעודף קטן אחר של אותו מוצר קיים; ולא מעלים את העודף', () => {
  const rc = F.receipts.find(r => r.id.startsWith('receipt_83b2692c'));
  const recs = F.receipts.map(r => r === rc ? { ...rc, items: rc.items.concat([{ productId: 'code_100', code: '100', name: 'לחם אחיד', qty: 1, noteQty: 0 }]) } : r);
  const run = ps => paperLedger({ recs, rets: F.returns, papers: ps, from: '2026-09-01', asOf: '2026-10-05' });
  const set = [P.p141, P.p142];
  let lg = run(set);
  assert.deepEqual(lg.items.filter(i => i.key === 'code_100').map(i => [i.kind, i.units, i.state]), [['receivedNotCharged', 1, 'pending'], ['autoCorrection', 13, 'info']]);
  assert.match(ledgerItemText(lg.items.find(i => i.kind === 'autoCorrection'), lg, set).text, /×13/);
  // תשובה ישנה "כן, זה תיקון" (מלפני v130) — במקום הזיהוי האוטומטי, לא בנוסף
  const decl = declared({ id: 'decl_corr_x', declare: 'correction', docDay: P.p141.docDay, rows: [{ line: 1, itemCode: '100', productId: 'code_100', qty: 13 }], standsFor: { returnId: R1004, chargePaperId: P.p141.id } });
  lg = run(set.concat([decl]));
  assert.deepEqual(lg.items.filter(i => i.key === 'code_100').map(i => [i.kind, i.units]), [['receivedNotCharged', 1]]);
  assert.deepEqual(lg.autoDeclared, []);
});

test('נתונים פגומים (שיוך משתמש שאינו רשימה, שורה ריקה, פריטים שאינם רשימה) — המאזן לא נופל', () => {
  const bad = [
    paper({ id: 'p1', kind: 'credit', docDay: '2026-10-04', rows: [row(1, '101', 1)], attach: { by: 'user', type: null, rowTargets: 'x' } }),
    paper({ id: 'p2', kind: 'credit', docDay: '2026-10-04', rows: [row(1, '101', 1)], attach: { by: 'user', type: null, rowTargets: [null] } }),
    declared({ id: 'd1', declare: 'correction', rows: [null], standsFor: {} })
  ];
  const recs = F.receipts.concat([{ id: 'rc_bad', docDate: '2026-10-03', items: { a: 1 } }]);
  const rets = F.returns.concat([{ id: 'rt_bad', docDate: '2026-10-03', items: 'x' }]);
  assert.doesNotThrow(() => paperLedger({ recs, rets, papers: bad, from: '2026-09-01', asOf: '2026-10-05' }));
});


// ===== סבב סקירה שלישי =====
test('נייר זיכוי לחוסרים בקליטה, כשרק החזרות מלפני תחילת המאזן חולקות איתו מוצר — נספר על הקליטה (לא "מחוץ לתקופה")', () => {
  const p = paper({ id: 'paper_290090056', kind: 'credit', number: '290090056', numerator: '90056', docDay: '2026-09-01', rows: [row(1, '233', 1), row(2, '3604', 1)] });
  const lg = ledger([p]);
  assert.equal(lg.states[p.id], 'counted');
  assert.deepEqual(lg.placed.find(x => x.id === p.id).attach.rowTargets.map(t => t.type), ['receipt', 'receipt']);
  const base = ledger([]);
  assert.deepEqual(Object.values(lg.products).filter(x => x.net).map(x => [x.key, x.net]), Object.values(base.products).filter(x => x.net).map(x => [x.key, x.net]));
});

test('תיקון שמזוהה לבד סוגר את ההחזרה; החלפה פתוחה גם על ההחזרה שהיא מדברת עליה (כרטיס ההחזרה לא אומר "מוסבר")', () => {
  const lg = ledger([P.p141, P.p142]);
  assert.deepEqual([lg.docViews[R1004].open, lg.docViews[R1004].gap], [[], 0], 'התיקון התקזז — אין מה לבקש על ההחזרה');
  const rets = F.returns.map(r => r.id === R1004 ? { ...r, credited: false } : r);
  const lg2 = paperLedger({ recs: F.receipts, rets, papers: [P.p123, P.pSide], from: '2026-09-01', asOf: '2026-10-05' });
  const sw = lg2.items.find(i => i.kind === 'swap');
  assert.ok(sw && lg2.docViews[R1004].open.indexOf(sw.id) !== -1);
  assert.deepEqual(lg2.docViews[R1004].mainIds, [P.p123.id], 'הנייר הראשי לפי התפקיד, לא לפי הסדר');
});

// v130 (סקירה 2): נייר שרוב שורותיו לא מתאימות לאף החזרה — בלי שאלה ובלי לנחש החזרה: כל שורה לפי היעד שלה.
// 458 שלא נמצא לו מקום — "ברמן זיכתה שלא החזרת — לבדוק" (התראה, לא בליעה); בחירה של המשתמש נשמרת וסוגרת
test('נייר מעורב (רוב השורות חוסרים בקליטה) — נספר לפי השורות, בלי שיוך מנוחש; בחירה של המשתמש נשמרת', () => {
  const rows = [row(1, '233', 1), row(2, '1231', 2), row(3, '458', 2)];
  const p = paper({ id: 'paper_290090238', kind: 'credit', number: '290090238', numerator: '90238', docDay: '2026-10-05', rows });
  const lg = ledger([p]);
  assert.equal(lg.states[p.id], 'counted', 'בלי שאלה');
  assert.equal(lg.placed.find(x => x.id === p.id).attach.type, null);
  assert.equal(lg.products.code_233.net, 0, '233 — החוסר בקליטה של 4.10 זוכה');
  assert.ok(lg.items.some(i => i.kind === 'creditedNotReturned' && i.key === 'code_458' && i.state === 'problem'), '458 — לבדוק');
  const base = api.ledgerDocBase(F.receipts.filter(r => storedReceiptDate(r) >= '2026-09-21'), F.returns.filter(r => ledgerReturnDay(r) >= '2026-09-21' && ledgerReturnDay(r) <= '2026-10-05'));
  const at = api.paperAttach({ ...p, forReturnId: R1004, userPick: true }, base, [], [p], '2026-09-01');
  assert.equal(at.type, 'return'); assert.equal(at.id, R1004);
  const lg2 = ledger([{ ...p, forReturnId: R1004, attach: { ...at, by: 'user' } }]);
  assert.equal(lg2.states[p.id], 'counted');
  assert.ok(!lg2.items.some(i => i.kind === 'creditedNotReturned' && i.key === 'code_458'), '458 נשלח בהחזרה של 4.10 — לא "זיכתה שלא החזרת"');
});

// ===== v130: הכל בקליטה, בלי שאלות =====
// נייר "ת.משלוח" קטן (141) נקלט כמו תעודת משלוח: "לא הגיע כלום" — כל שורותיו חוסר בקליטה. המאזן משייך:
// 1231 ×2 מול העודף של 4.10, ו-100 ×13 מזוהה לבד כתיקון של ברמן (נייר הזיכוי 142 שלידו זיכה 101 במקום).
const SMALL = { ...P.p141, kind: 'delivery', small: true };
const RC_SMALL = { id: 'rc_small_t', date: '2026-10-04', docDate: '2026-10-04', timestamp: 9, paperDocs: [{ kind: 'charge', number: '290095141', date: '04/10/2026', units: 15, lines: 2 }],
  items: [{ productId: 'code_100', code: '100', name: 'לחם אחיד ברמן', qty: 0, noteQty: 13 }, { productId: 'code_1231', code: '1231', name: 'לחמניות 10 בשקית', qty: 0, noteQty: 2 }] };

test('נייר קטן שנקלט ("לא הגיע כלום") עם 142: נשאר רק חוסר 1231 ×2; לחם אחיד מתקזז לבד כתיקון', () => {
  const papers = [SMALL, P.p142];
  const lg = paperLedger({ recs: F.receipts.concat([RC_SMALL]), rets: F.returns, papers, from: '2026-09-01', asOf: '2026-10-05' });
  assert.equal(lg.states[SMALL.id], 'in-receipt', 'הנייר הקטן נספר בקליטה, לא כנייר חיוב');
  assert.deepEqual(brief(lg), [['chargedNotReceived', 'code_1231', 2, 'problem']]);
  assert.equal(text(lg, papers, 0), 'חוסר בקליטה של 5.10: לחמניות 10 בשקית ×2 — חויבת ולא קיבלת. לבקש זיכוי מהנהג');
  const auto = lg.items.find(i => i.kind === 'autoCorrection');
  assert.deepEqual([auto.key, auto.units, auto.decl.standsFor.receiptId], ['code_100', 13, RC_SMALL.id]);
  assert.equal(ledgerItemText(auto, lg, papers).text, 'תיקון של ברמן בנייר המשלוח הקטן 95141 מ-4.10: לחם אחיד ברמן ×13 — מבטל זיכוי שניתן על לחם אחיד ברמן במקום אחיד פרוס ברמן. התקזז, אין מה לבקש');
  assert.deepEqual(nets(lg), { code_1231: 2 });
  assert.equal(lg.placed.find(p => p.id === P.p142.id).attach.role, 'side', 'הנייר הקטן שלא הגיע לידו — 142 משלים, כמו ליד נייר חיוב');
});

test('נייר קטן שצורף לקליטה של 5.10 — אותה תוצאה; בלי 142 — לחם אחיד ×13 "חויבת ולא קיבלת"; כשהסחורה שלו הגיעה — אין תיקון', () => {
  const RC1005 = 'receipt_92580828-0558-42fc-8e7e-2a4fa1560417';
  const recs = F.receipts.map(r => r.id !== RC1005 ? r : { ...r, paperDocs: r.paperDocs.concat([{ kind: 'charge', number: '290095141' }]),
    items: r.items.map(i => i.productId === 'code_1231' ? { ...i, noteQty: 22 } : i).concat([{ productId: 'code_100', code: '100', name: 'לחם אחיד ברמן', qty: 0, noteQty: 13 }]) });
  const lg = paperLedger({ recs, rets: F.returns, papers: [SMALL, P.p142], from: '2026-09-01', asOf: '2026-10-05' });
  assert.deepEqual(brief(lg), [['chargedNotReceived', 'code_1231', 2, 'problem']]);
  assert.deepEqual(nets(lg), { code_1231: 2 });
  const alone = paperLedger({ recs: F.receipts.concat([RC_SMALL]), rets: F.returns, papers: [SMALL], from: '2026-09-01', asOf: '2026-10-05' });
  assert.ok(alone.items.some(i => i.kind === 'chargedNotReceived' && i.key === 'code_100' && i.units === 13 && i.state === 'problem'), 'אין נייר זיכוי סמוך — חוסר אמיתי');
  assert.deepEqual(alone.autoDeclared, []);
  const got = { ...RC_SMALL, items: RC_SMALL.items.map(i => ({ ...i, qty: i.noteQty })) };
  const lgot = paperLedger({ recs: F.receipts.concat([got]), rets: F.returns, papers: [SMALL, P.p142], from: '2026-09-01', asOf: '2026-10-05' });
  assert.deepEqual(lgot.autoDeclared, [], 'הסחורה הגיעה — אין מה לתקן');
  assert.equal(lgot.products.code_100.net, 0);
});

// ===== v130 — ממצאי הסקירה: בלי שאלות, אבל חוסר אמיתי לא נבלע =====
const R1001_LINES = [row(1, '333', 2), row(2, '2387', 5), row(3, '401', 1), row(4, '238', 2), row(5, '2381', 5)];
const smallRc = (id, day, num, items) => ({ id, date: day, docDate: day, timestamp: 9, paperDocs: [{ kind: 'charge', number: num }], items });

test('סקירה 1: נייר קטן שלא הגיע, ליד הנייר הראשי של החזרה — לא "תיקון"; החוסר נשאר "חויבת ולא קיבלת"', () => {
  const sm = paper({ id: 'paper_290094991', kind: 'delivery', small: true, number: '290094991', terminalNumber: '290094991', docDay: '2026-10-02', rows: [row(1, '101', 2)] });
  const rc = smallRc('rc_small_r1', '2026-10-02', '290094991', [{ productId: 'code_101', code: '101', name: 'אחיד פרוס', qty: 0, noteQty: 2 }]);
  const cred = paper({ id: 'paper_290094990', kind: 'credit', number: '290094990', terminalNumber: '290094990', docDay: '2026-10-02', rows: R1001_LINES });
  const lg = paperLedger({ recs: F.receipts.concat([rc]), rets: F.returns, papers: [sm, cred], from: '2026-09-01', asOf: '2026-10-05' });
  assert.equal(lg.placed.find(p => p.id === cred.id).attach.role, 'main', 'נייר חיוב סמוך לא הופך את הנייר הראשי ל"משלים"');
  assert.deepEqual(lg.autoDeclared, []);
  assert.ok(brief(lg).some(b => b[0] === 'chargedNotReceived' && b[1] === 'code_101' && b[2] === 2));
});

test('סקירה 1ב: שורה של נייר קטן שיש לה עודף בקליטה סמוכה — אינה מועמדת לתיקון (גם כש-344 ×2 אושר ברישום)', () => {
  const rets = F.returns.map(r => r.id !== R1004 ? r : { ...r, items: r.items.map(i => i.productId === 'code_344' ? (({ noteQty, ...rest }) => rest)(i) : i) });
  const lg = paperLedger({ recs: F.receipts.concat([RC_SMALL]), rets, papers: [SMALL, P.p142], from: '2026-09-01', asOf: '2026-10-05' });
  assert.deepEqual(nets(lg), { code_1231: 2 }, 'החוסר האמיתי של 1231 ×2 נשאר');
  assert.deepEqual(lg.autoDeclared.map(d => [d.rows[0].productId, d.rows[0].qty, d.standsFor.other]), [['code_100', 13, 'code_101']]);
});

test('סקירה 2: שורת זיכוי אחת לא מסבירה שני חיובים — זוג לא חד-משמעי לא מתקזז, שני החיובים "לבקש זיכוי"', () => {
  const ch = { ...P.p141, rows: [row(1, '100', 13), row(2, '1220', 13)] };
  const lg = ledger([ch, P.p142]);
  assert.deepEqual(lg.autoDeclared, []);
  assert.deepEqual(nets(lg), { code_100: 13, code_1220: 13 });
  assert.ok(!lg.items.some(i => i.state === 'question'));
});

test('סקירה 3: נייר קטן מיום שיש בו קליטה בלי נייר — לא נחשב כנקלט; "צולמה ועוד לא נקלטה"', () => {
  const bare = { id: 'rc_bare_1003', date: '2026-10-03', docDate: '2026-10-03', timestamp: 20, noDoc: true, items: [{ productId: 'code_101', code: '101', name: 'x', qty: 10 }] };
  const sm = paper({ id: 'paper_290094950', kind: 'delivery', small: true, number: '290094950', terminalNumber: '290094950', docDay: '2026-10-03', rows: [row(1, '458', 3)] });
  const big = { ...sm, id: 'paper_244700000', small: undefined, number: '244700000', terminalNumber: null };
  const lg = paperLedger({ recs: F.receipts.concat([bare]), rets: F.returns, papers: [sm, big], from: '2026-09-01', asOf: '2026-10-05' });
  assert.equal(lg.states[sm.id], 'awaiting-receipt');
  assert.ok(lg.items.some(i => i.kind === 'deliveryNotReceived' && i.paper.id === sm.id && i.state === 'problem'));
  assert.equal(lg.states[big.id], 'in-receipt', 'תעודה גדולה — כמו קודם: הקליטה בלי נייר מאותו יום היא כנראה היא');
});

test('סקירה 4+5: נייר ראשי שחסרה בו שורה (שאושרה ברישום) — ממתין, ואחרי 3 משלוחים "לבקש זיכוי"; נייר קטן סמוך לא מסתיר', () => {
  const cred = paper({ id: 'paper_290094990', kind: 'credit', number: '290094990', terminalNumber: '290094990', docDay: '2026-10-02', rows: R1001_LINES.filter(r => r.itemCode !== '401') });
  const sm = paper({ id: 'paper_290094991', kind: 'delivery', small: true, number: '290094991', terminalNumber: '290094991', docDay: '2026-10-02', rows: [row(1, '101', 7)] });
  const rc = smallRc('rc_small_r4', '2026-10-02', '290094991', [{ productId: 'code_101', code: '101', name: 'x', qty: 0, noteQty: 7 }]);
  const run = (recs, asOf) => paperLedger({ recs, rets: F.returns, papers: [sm, cred], from: '2026-09-01', asOf });
  const lg = run(F.receipts.concat([rc]), '2026-10-05');
  assert.equal(lg.placed.find(p => p.id === cred.id).attach.role, 'main');
  const it = lg.items.find(i => i.kind === 'returnedNotCredited' && (i.keys || []).some(k => k.key === 'code_401'));
  assert.equal(it.state, 'pending');
  const later = ['2026-10-06', '2026-10-07', '2026-10-08'].map((d, i) => ({ id: 'rc_later_' + i, date: d, docDate: d, timestamp: 30 + i, items: [{ productId: 'code_101', code: '101', name: 'x', qty: 1, noteQty: 1 }] }));
  const lg2 = run(F.receipts.concat([rc], later), '2026-10-08');
  const it2 = lg2.items.find(i => i.kind === 'returnedNotCredited' && (i.keys || []).some(k => k.key === 'code_401'));
  assert.equal(it2.state, 'problem', 'אחרי 3 משלוחים — לבקש זיכוי, גם כשהאישור הרשום כלל את 401');
  assert.match(ledgerItemText(it2, lg2, [sm, cred]).text, /ולא זוכית — לבקש זיכוי מהנהג$/);
});

// סבב 2: התפקיד לפי הכיסוי גם בבחירה לבד — בחירה לא נכונה נותנת לכל היותר התראת שווא (220), ולא מעלימה כלום
test('סקירה 6: החזרה שנבחרה לבד בשוויון — התפקיד לפי הכיסוי; שום מוצר לא "נסגר" לעומת המצב בלי הנייר', () => {
  const R1 = { id: 'ret_r1', date: '2026-10-02', docDate: '2026-10-02', timestamp: 11, credited: true, items: [{ productId: 'code_450', code: '450', name: 'חלה', qty: 2 }, { productId: 'code_349', code: '349', name: 'z', qty: 4 }] };
  const R2 = { id: 'ret_r2', date: '2026-10-03', docDate: '2026-10-03', timestamp: 12, credited: true, items: [{ productId: 'code_450', code: '450', name: 'חלה', qty: 2 }, { productId: 'code_220', code: '220', name: 'y', qty: 1 }] };
  const rets = F.returns.concat([R1, R2]);
  const p = paper({ id: 'paper_290095000', kind: 'credit', number: '290095000', terminalNumber: '290095000', docDay: '2026-10-03', rows: [row(1, '450', 2)] });
  const base = paperLedger({ recs: F.receipts, rets, papers: [], from: '2026-09-01', asOf: '2026-10-05' });
  const lg = paperLedger({ recs: F.receipts, rets, papers: [p], from: '2026-09-01', asOf: '2026-10-05' });
  assert.equal(lg.placed.find(x => x.id === p.id).attach.role, 'main', '1 מתוך 2 שורות — ראשי לפי הכיסוי');
  const nb = nets(base), nl = nets(lg);
  Object.keys(nb).forEach(k => assert.ok((nl[k] || 0) >= nb[k], k + ': לא נסגר בגלל הבחירה'));
  assert.ok(lg.items.some(i => i.state === 'pending' && (i.keys || []).some(k => k.key === 'code_220')), '220 — ממתין (התראת שווא אפשרית, בטוחה)');
});

// ===== v130 — סבב סקירה 2 =====
const RC1002 = 'receipt_83b2692c-09e3-467f-91c0-05eddd06bc38';
// 2.10: החזרה של 2387 ×q, נייר הזיכוי שלה (95201), ובמספר הבא נייר "ת.משלוח" קטן (95202) על 458 ×q שלא הגיעו
function tieScene(q, smallKind = 'delivery') {
  const RX = { id: 'returns_rx_1002', date: '2026-10-02', docDate: '2026-10-02', timestamp: 5, credited: true, items: [{ productId: 'code_2387', code: '2387', name: 'x', qty: q }] };
  const C = paper({ id: 'paper_290095201', kind: 'credit', number: '290095201', terminalNumber: '290095201', docDay: '2026-10-02', rows: [row(1, '2387', q)] });
  const S = paper({ id: 'paper_290095202', kind: smallKind, ...(smallKind === 'delivery' ? { small: true } : {}), number: '290095202', terminalNumber: '290095202', docDay: '2026-10-02', rows: [row(1, '458', q)] });
  const recs = smallKind !== 'delivery' ? F.receipts : F.receipts.map(r => r.id !== RC1002 ? r : { ...r, paperDocs: [{ kind: 'delivery', number: '244700111' }, { kind: 'delivery', number: '290095202' }],
    items: r.items.map(i => i.productId === 'code_458' ? { ...i, noteQty: (Number(i.noteQty ?? i.qty) || 0) + q } : i) });
  return paperLedger({ recs, rets: F.returns.concat([RX]), papers: [C, S], from: '2026-09-01', asOf: '2026-10-05' });
}

test('סבב 2 א: נייר זיכוי שמכסה את כל ההחזרה (גם כשיש לה "שוות" ישנות) אינו "זיכוי משלים" — החוסר ב-458 לא מתקזז', () => {
  for (const kind of ['delivery', 'charge']) {
    const lg = tieScene(2, kind);
    assert.deepEqual(lg.autoDeclared, [], kind);
    assert.ok(brief(lg).some(b => b[1] === 'code_458' && b[2] === 2), kind + ': 458 ×2 — לבקש זיכוי');
  }
  assert.deepEqual(tieScene(7).autoDeclared, [], 'בלי שוויון — אותו דבר');
});

test('סבב 2 ב: שורת זיכוי ש"כן, זה תיקון" (מגרסה קודמת) כבר הסבירה — לא מסבירה חיוב נוסף', () => {
  const R = { id: 'ret_4l', date: '2026-10-02', docDate: '2026-10-02', timestamp: 6, credited: true, items: ['450', '349', '220', '119'].map(c => ({ productId: 'code_' + c, code: c, name: c, qty: 2 })) };
  const side = paper({ id: 'paper_290095201', kind: 'credit', number: '290095201', terminalNumber: '290095201', docDay: '2026-10-02', forReturnId: 'ret_4l', rows: [row(1, '450', 2)] });
  const a = paper({ id: 'paper_290095202', kind: 'charge', number: '290095202', terminalNumber: '290095202', docDay: '2026-10-02', rows: [row(1, '101', 2)] });
  const b = paper({ id: 'paper_290095203', kind: 'charge', number: '290095203', terminalNumber: '290095203', docDay: '2026-10-02', rows: [row(1, '458', 2)] });
  const yes = declared({ id: 'decl_corr_a', declare: 'correction', docDay: '2026-10-02', rows: [row(1, '101', 2)], standsFor: { returnId: 'ret_4l', chargePaperId: a.id } });
  const run = ps => paperLedger({ recs: F.receipts, rets: F.returns.concat([R]), papers: ps, from: '2026-09-01', asOf: '2026-10-05' });
  assert.equal(run([side, b]).autoDeclared.length, 1, 'לבד — זוג חד-משמעי');
  const lg = run([side, a, b, yes]);
  assert.deepEqual(lg.autoDeclared, [], 'השורה כבר הסבירה את 101');
  assert.ok(brief(lg).some(x => x[1] === 'code_458' && x[2] === 2), '458 ×2 — לבקש זיכוי');
});

test('סבב 2 ג: שיוך משתמש שנשמר בגרסה קודמת עם "משלים" (בגלל נייר חיוב סמוך) — התפקיד מחושב מחדש לפי הכיסוי', () => {
  const small = { id: R1004, date: '2026-10-04', docDate: '2026-10-04', timestamp: 7, credited: true, creditStatus: 'open',
    items: [{ productId: 'code_101', code: '101', name: 'אחיד פרוס ברמן', qty: 13 }, { productId: 'code_344', code: '344', name: 'x', qty: 2, noteQty: 0 },
      { productId: 'code_238', code: '238', name: 'y', qty: 1, noteQty: 0 }, { productId: 'code_450', code: '450', name: 'חלה', qty: 7 }] };
  const rets = F.returns.filter(r => r.id !== R1004).concat([small]);
  const stored = { ...P.p142, attach: { type: 'return', id: R1004, role: 'side', rowTargets: [{ line: 0, type: 'return', id: R1004 }, { line: 1, type: null, id: null }, { line: 2, type: 'return', id: R1004 }, { line: 3, type: 'return', id: R1004 }], by: 'user' } };
  const lg = paperLedger({ recs: F.receipts, rets, papers: [stored, P.p141], from: '2026-09-01', asOf: '2026-10-05' });
  assert.equal(lg.placed.find(p => p.id === P.p142.id).attach.role, 'main');
  assert.deepEqual(lg.autoDeclared, []);
  assert.ok(brief(lg).some(b => b[1] === 'code_100' && b[2] === 13));
});

test('סבב 2 ד: תיקון מול חוסר בקליטה נרשם במרכזת ביום של הקליטה; ומוצג לפי הנייר הקטן, לא כ"תשובה שלך"', () => {
  const rc = { ...RC_SMALL, date: '2026-10-05', docDate: '2026-10-05' };
  const lg = paperLedger({ recs: F.receipts.concat([rc]), rets: F.returns, papers: [SMALL, P.p142], from: '2026-09-01', asOf: '2026-10-05' });
  assert.equal(lg.autoDeclared.length, 1);
  const adj = api.ledgerMatrixAdjust(lg, '2026-10-05', '2026-10-05', [SMALL, P.p142]).filter(x => x.key === 'code_100');
  assert.deepEqual(adj.map(x => [x.day, x.credit]), [['2026-10-05', 13]], 'באותו יום כמו החיוב של הקליטה');
  assert.deepEqual(api.ledgerMatrixAdjust(lg, '2026-10-04', '2026-10-04', [SMALL, P.p142]).filter(x => x.key === 'code_100'), []);
  assert.deepEqual(lg.docViews[rc.id].papers.filter(id => /^auto_corr/.test(id)), [], 'לא מזהה פנימי של תיקון');
  assert.ok(lg.docViews[rc.id].papers.includes(SMALL.id));
});

test('סבב 2 ה: שני ניירות קטנים שונים עם אותו תוכן — השני לא "נקלט" בגלל התוכן של הראשון; חיוב כפול נשאר', () => {
  const mk = n => paper({ id: 'paper_2900' + n, kind: 'delivery', small: true, number: '2900' + n, terminalNumber: '2900' + n, docDay: '2026-10-04', rows: [row(1, '1231', 2)] });
  const A = mk('95150'), B = mk('95153');
  const doc = { docNumber: A.number, docDate: '04/10/2026', rows: [{ itemCode: '1231', quantity: 2 }] };
  const rc = { id: 'rc_a', date: '2026-10-04', docDate: '2026-10-04', timestamp: 9, paperDocs: [{ number: A.number }], paperScan: { response: { scan: { documents: [doc] } } },
    items: [{ productId: 'code_1231', code: '1231', name: 'x', qty: 2, noteQty: 2 }] };
  const lg = paperLedger({ recs: F.receipts.concat([rc]), rets: F.returns, papers: [A, B], from: '2026-09-01', asOf: '2026-10-05' });
  assert.equal(api.paperFingerprint(B), api.receiptScanFingerprints(rc)[0], 'אותו תוכן בדיוק');
  assert.equal(lg.states[A.id], 'in-receipt');
  assert.equal(lg.states[B.id], 'awaiting-receipt');
  assert.ok(lg.items.some(i => i.kind === 'deliveryNotReceived' && i.paper.id === B.id && i.state === 'problem'));
  assert.equal(ledgerItemText(lg.items.find(i => i.kind === 'deliveryNotReceived'), lg, [A, B]).text, 'נייר המשלוח הקטן 95153 מ-4.10 צולם ועוד לא נקלט');
});

test('סבב 2 ו: בחודש סגור לא מצמידים נייר לבד להחזרה מדורגת נמוך שבתקופה — החוסר של אוקטובר לא נבלע', () => {
  const two = (id, d) => ({ id, date: d, docDate: d, timestamp: 40, credited: true, items: [{ productId: 'code_450', code: '450', name: 'חלה', qty: 2 }, { productId: 'code_349', code: '349', name: 'z', qty: 1 }] });
  const rets = F.returns.concat([two('ret_sepA', '2026-09-28'), two('ret_sepB', '2026-09-29'),
    { id: 'ret_oct', date: '2026-10-01', docDate: '2026-10-01', timestamp: 41, credited: true, items: [{ productId: 'code_450', code: '450', name: 'חלה', qty: 2 }] }]);
  const recs = F.receipts.concat([{ id: 'rc_oct_short349', date: '2026-10-02', docDate: '2026-10-02', timestamp: 42, items: [{ productId: 'code_349', code: '349', name: 'z', qty: 0, noteQty: 1 }] }]);
  const p = paper({ id: 'paper_290095400', kind: 'credit', number: '290095400', terminalNumber: '290095400', docDay: '2026-10-01', rows: [row(1, '450', 2), row(2, '349', 1)] });
  const live = paperLedger({ recs, rets, papers: [p], from: '2026-09-01', closedThrough: '2026-09-30', asOf: '2026-10-05' });
  assert.equal(live.states[p.id], 'outside');
  assert.ok(brief(live).some(b => b[1] === 'code_349' && b[2] === 1), 'החוסר של 349 ב-2.10 נשאר');
});

test('סבב 2 ז: כרטיס הנייר — רק השורה שזוהתה כתיקון מסומנת "(התקזז)"', () => {
  const ch = { ...P.p141, rows: [row(1, '100', 13), row(2, '1231', 2), row(3, '100', 2)] };
  const lg = ledger([ch, P.p142]);
  assert.deepEqual(lg.autoDeclared.map(d => [d.standsFor.line, d.rows[0].qty]), [[0, 13]]);
  assert.ok(brief(lg).some(b => b[0] === 'paperChargeNotReceived' && b[1] === 'code_100' && b[2] === 2), 'השורה השנייה של 100 — לבקש זיכוי');
});
