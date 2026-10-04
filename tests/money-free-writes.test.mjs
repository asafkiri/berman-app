// v124 — שלב 6: שום מסלול חי אינו כותב כסף לתעודה חדשה, ושום מסלול אינו מוחק
// רישום קישור מתעודה קיימת. הבדיקות רצות על מודול האפליקציה המלא:
//   • צירוף נייר לקליטה שנשמרה בלי תעודה: הקיזוז מול תעודה אחרת, זיכוי החוסר
//     (ביחידות ובכסף ישן) והשלמת הסחורה נשמרים — אחרת התאום בצד השני נשאר יתום.
//   • "הגיעה השלמה": בתעודה חדשה בלי lineTotal ובלי amount; בתעודה ישנה סכום
//     השורה מחושב מחדש כמו קודם, והרישום הישן עם amount ממשיך להיות מוצג.
//   • מסך התיקון: השורה המקורית נשמרת (קוד פריט), שום מחיר לא נוסף; ביומן — יח׳.
//   • מאזן הקליטות ביחידות; הקיזוז לפי שווי בלי "לפני/אחרי" לתשלום.
// הרצה: node --test tests/money-free-writes.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { runtime, fixture } from './receipt-scan-harness.mjs';

const json = (r, expr) => JSON.parse(r.run('JSON.stringify(' + expr + ')'));
const receiptWrites = r => r.writes.filter(x => /receipts/.test(String(x.path)));

// קליטה שנשמרה בלי נייר (v121+), ועליה רישומי קישור מכל הסוגים
function noDocReceipt(extra) {
  const items = fixture().items.map(l => ({ productId: l.productId, name: l.name, barcode: l.barcode || '', code: l.code || '', qty: Number(l.qty) || 0 }));
  return { id: 'rc_nodoc', schemaVersion: 2, timestamp: Date.UTC(2026, 8, 9, 6, 0), date: '2026-09-09', docDate: '2026-09-09', noDoc: true,
    status: 'open', items, count: items.length, units: items.reduce((a, l) => a + l.qty, 0), noteParts: [], unresolvedUnitsGap: 0, ...(extra || {}) };
}

test('צירוף נייר לקליטה שנשמרה: רישומי הקישור שעליה נשמרים במסמך החדש', async () => {
  const r = runtime();
  const links = {
    externalOffsets: [{ id: 'off1', productId: 'code_238', dir: 'short', qty: 1, otherReceiptId: 'rc_other', source: 'exact' }],
    offsetSchemaVersion: 2, offsetAt: 1,
    shortCreditUnits: [{ id: 'cr1', productId: 'code_101', name: 'אחיד', qty: 1, source: 'returns-note', fromReturnsId: 'ret1', at: 2 }],
    shortCreditNotes: [{ amount: 9.5, at: 3 }],
    shortGoodsNotes: [{ at: 4, items: [{ productId: 'code_2381', name: 'x', qty: 1 }] }]
  };
  r.context.rc = noDocReceipt(links);
  const units = r.context.rc.units, lines = r.context.rc.count;
  r.run(`receipts = [rc]; reopenReceiptForDoc('rc_nodoc');
    receiptEntryMode = 'manual'; receiptOpened = true;
    receiptNotes = [{ amount: 100, units: ${units}, lines: ${lines}, kind: 'charge' }]; recomputeNoteTotal();
    globalThis.confirms = []; showConfirm = (title, text, ok, fn) => confirms.push({ title, text, ok, fn });
    currentView = 'receiving'; mainMode = 'receiving';`);
  assert.equal(r.run('receiptAttachTarget && receiptAttachTarget.id'), 'rc_nodoc');
  r.run('finishReceipt()');
  assert.ok(r.run('!!pendingReceipt'), 'הסיכום מוכן');
  await r.run('confirmReceipt()');
  const w = receiptWrites(r).filter(x => x.op === 'set').pop();
  assert.ok(w, 'התעודה נשמרה');
  assert.match(String(w.path), /rc_nodoc/, 'אותו מסמך — לא תעודה שנייה');
  for (const [k, v] of Object.entries(links)) assert.deepEqual(w.data[k], v, k + ' נשמר');
  assert.equal(w.data.noDoc, true);
  for (const l of w.data.items) assert.ok(!('unitPrice' in l) && !('lineTotal' in l), 'שורה בלי כסף');
});

test('"הגיעה השלמה" בתעודה חדשה: כמויות בלבד — בלי lineTotal ובלי amount', async () => {
  const r = runtime();
  r.context.rc = { id: 'rc2', schemaVersion: 2, timestamp: 1, date: '2026-09-10', docDate: '2026-09-10', status: 'open',
    items: [{ productId: 'code_238', name: 'ברמן אסלי 5 פיתות', barcode: '', code: '238', qty: 2, noteQty: 4 }], count: 1, noteParts: [] };
  r.run(`receipts = [rc]; openShortGoodsPrompt('rc2');`);
  assert.doesNotMatch(r.node('shortGoodsLines').innerHTML, /₪/, 'החלון בלי מחיר ליחידה');
  r.run(`document.querySelectorAll = sel => sel === '[data-role="short-goods-qty"]' ? [{ dataset: { idx: '0' }, value: '2' }] : [];`);
  await r.run('confirmShortGoods()');
  const w = receiptWrites(r).pop();
  assert.ok(w, 'נכתב עדכון');
  assert.deepEqual(w.data.items, [{ productId: 'code_238', name: 'ברמן אסלי 5 פיתות', barcode: '', code: '238', qty: 4 }]);
  assert.deepEqual(w.data.shortGoodsNotes.map(n => Object.keys(n).sort()), [['at', 'items']]);
  assert.deepEqual(w.data.shortGoodsNotes[0].items, [{ productId: 'code_238', name: 'ברמן אסלי 5 פיתות', qty: 2 }]);
  assert.equal(w.data.status, 'ok');
});

test('"הגיעה השלמה" בתעודה ישנה: סכום השורה מחושב מחדש כמו קודם, והרישום הישן מוצג בכסף', async () => {
  const r = runtime();
  r.context.rc = { id: 'rc3', timestamp: 1, date: '2026-08-10', status: 'open', totalExVat: 50,
    items: [{ productId: 'code_238', name: 'ברמן אסלי 5 פיתות', barcode: '', qty: 2, noteQty: 4, unitPrice: 10, lineTotal: 20 }],
    shortGoodsNotes: [{ at: 1, amount: 12.5, items: [{ productId: 'code_238', name: 'ברמן אסלי 5 פיתות', qty: 1, unitPrice: 12.5 }] }] };
  r.run(`receipts = [rc]; openShortGoodsPrompt('rc3');
    document.querySelectorAll = sel => sel === '[data-role="short-goods-qty"]' ? [{ dataset: { idx: '0' }, value: '1' }] : [];`);
  await r.run('confirmShortGoods()');
  const w = receiptWrites(r).pop();
  assert.equal(w.data.items[0].qty, 3);
  assert.equal(w.data.items[0].lineTotal, 30, 'השורה הישנה ממשיכה לשאת סכום עקבי');
  assert.equal(w.data.shortGoodsNotes[0].amount, 12.5, 'הרישום הישן לא נכתב מחדש');
  assert.ok(!('amount' in w.data.shortGoodsNotes[1]), 'הרישום החדש בלי סכום');
  r.run(`Object.assign(receipts[0], ${JSON.stringify({})}); receipts[0].shortGoodsNotes = ${JSON.stringify([{ at: 1, amount: 12.5, items: [{ name: 'א', qty: 1 }] }, { at: 2, items: [{ name: 'ב', qty: 2 }] }])};
    receiptHistoryFilter = 'all'; currentView = 'receiptsHistory'; renderReceiptsHistory();`);
  const html = r.node('app').innerHTML;
  assert.match(html, /₪12\.50/, 'הרישום הישן בכסף');
  assert.match(html, /ב ×2<\/span><span class="shrink-0">2 יח׳<\/span>/, 'הרישום החדש ביחידות');
});

test('מסך התיקון: השורה המקורית נשמרת, מוצר שנוסף בלי מחיר, וביומן — יח׳', async () => {
  const r = runtime();
  r.context.rc = { id: 'rc4', schemaVersion: 2, timestamp: 1, date: '2026-09-10', docDate: '2026-09-10', status: 'open',
    items: [{ productId: 'code_238', name: 'ברמן אסלי 5 פיתות', barcode: '', code: '238', qty: 3, noteQty: 4 }], count: 1, noteParts: [] };
  r.run(`receipts = [rc]; openReceiptFix('rc4');`);
  const html = r.node('app').innerHTML;
  assert.match(html, /קוד פריט 238/);
  assert.doesNotMatch(html, /ליח׳ · מחיר התעודה|₪0\.000/);
  assert.deepEqual(Object.keys(json(r, 'receiptFixTotals()')).sort(), ['billed', 'lines', 'units']);
  r.run(`receiptFix.items[0].qty = 4; receiptFixAddItem('code_101');`);
  await r.run('saveReceiptFix()');
  const w = receiptWrites(r).pop();
  assert.deepEqual(w.data.items[0], { productId: 'code_238', name: 'ברמן אסלי 5 פיתות', barcode: '', code: '238', qty: 4 });
  const added = w.data.items.find(l => l.productId === 'code_101');
  assert.ok(added && added.noteQty === 1 && added.qty === 0 && !('unitPrice' in added), JSON.stringify(added));
  r.context.task = { data: w.data, path: ['receipts', 'rc4'] };
  const text = r.run("actionDetailsFromCloud('save receipt fix', task)");
  assert.match(text, /שורות: 2 · 4 יח׳ · סטטוס:/);
  assert.doesNotMatch(text, /₪/);
});

test('מאזן הקליטות ביחידות; "ממתינות לזיכוי" — רק תעודות חזרות', () => {
  const r = runtime();
  r.context.list = [
    { id: 'a', schemaVersion: 2, timestamp: 2, date: '2026-09-10', status: 'open', items: [{ productId: 'code_238', name: 'פיתות', qty: 1, noteQty: 3 }], noteParts: [] },
    { id: 'b', schemaVersion: 2, timestamp: 1, date: '2026-09-09', status: 'open', items: [{ productId: 'code_101', name: 'אחיד', qty: 2, noteQty: 1 }], noteParts: [] }];
  r.run(`receipts = list; returns = []; receiptHistoryFilter = 'all'; currentView = 'receiptsHistory'; renderReceiptsHistory();`);
  assert.deepEqual(json(r, 'receiptsBalance()'), { n: 2, shortUnits: 2, overUnits: 1, shortDocs: 1 });
  const html = r.node('app').innerHTML;
  assert.match(html, /חסרות 2 יח׳ בתעודה אחת/);
  assert.match(html, /ועוד 1 יח׳ בעודף/);
  assert.doesNotMatch(html, /הספק חייב לך|בסחורה מעבר לתעודות|זיכויי מבצע/);
  r.run(`receiptHistoryFilter = 'credit'; renderReceiptsHistory();`);
  assert.doesNotMatch(r.node('app').innerHTML, /data-rc-card=/, 'אין קליטה ב"ממתינות לזיכוי"');
});

test('הקיזוז לפי שווי: בלי "לפני / יתווסף / אחרי" לתשלום, ובלי "נוספו לתשלום"', () => {
  const r = runtime();
  assert.equal(r.run('typeof receiptPayableBaseEx'), 'undefined', 'receiptPayableBaseEx הוסרה');
  const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('function renderManualOffsetConfirm('), src.indexOf('async function applyManualValueOffset('));
  assert.ok(fn.length > 100);
  assert.doesNotMatch(fn, />לפני<|>יתווסף<|>אחרי<|ומוסיף את שווי הקיזוז לתשלום/);
  assert.match(fn, /המרכזת החודשית לא משתנה/);
  assert.doesNotMatch(src, /נוספו לתשלום במודע/);
});
