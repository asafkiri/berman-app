// v120 — תעודה שמורה נפתחת ונסגרת לפי כמויות בלבד.
// הרגרסיה רצה על צמצום מנוקה של 38 תעודות הקליטה האמיתיות (אוגוסט–אוקטובר
// 2026, tests/receipts-2026-08-10.json) ומצמידה את הסטטוס של כל אחת:
//   • תעודות שהיו "פתוחות" רק בגלל כסף (17.9, 28.9: אגורות; 1.9: פער 41.31
//     ממחירון מלא) נסגרות מעצמן.
//   • שש תעודות עם חוסר שזוכה בכסף (21.8, 25.8, 27.8, 1.9, 6.9, 29.9) סגורות
//     בכלל הירושה: Σ הזיכוי מכסה את החוסר במחיר התעודה, בסיבולת עיגול.
//   • תעודת 4.10 נשארת פתוחה: לחמניות 10 בשקית נספרו 10 מול 8 בנייר (עודף 2),
//     זוג לחמניות אצבע 9 מול 10 (חוסר 1).
// הרצה:            node --test tests/receipt-status-regression.test.mjs
// מול גיבוי אמיתי: node --test tests/receipt-status-regression.test.mjs -- --backup ~/backup.json
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runtime } from './receipt-scan-harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const backupArg = (() => { const i = process.argv.indexOf('--backup'); return i > -1 ? process.argv[i + 1] : null; })();

function load() {
  if (backupArg) {
    const bk = JSON.parse(fs.readFileSync(backupArg, 'utf8'));
    const col = bk.collections || bk;
    const raw = col.products;
    const products = Array.isArray(raw) ? raw.map(v => ({ id: 'code_' + v.code, ...v })) : Object.entries(raw).map(([id, v]) => ({ id, ...v }));
    const receipts = Object.entries(col.receipts).map(([id, v]) => ({ id, ...v }));
    return { products, receipts };
  }
  const fx = JSON.parse(fs.readFileSync(path.join(HERE, 'receipts-2026-08-10.json'), 'utf8'));
  return { products: fx.products, receipts: fx.receipts };
}

function create() {
  const r = runtime();
  const { products, receipts } = load();
  r.context.__products = products; r.context.__receipts = receipts;
  r.run('products = __products; receipts = __receipts; promos = [];');
  return r;
}
const statuses = r => JSON.parse(r.run(`JSON.stringify(receipts.map(rc => {
  const di = receiptDiscrepancyInfo(rc);
  return { id: rc.id, day: storedReceiptDate(rc), oldStatus: rc.status || '', open: di.open,
    short: di.shortItems.map(x => [x.name, x.n]), over: di.overItems.map(x => [x.name, x.n]),
    credited: di.shortFullyCredited, creditEx: di.shortCreditEx, shortValRaw: di.shortValRaw, unitsGap: di.unresolvedUnitsGap,
    storedAmountGap: Number(rc.unresolvedAmountGap) || 0 };
}))`));
const byDay = (list, day) => list.filter(x => x.day === day);

test('38 תעודות: רק תעודת 4.10 פתוחה, ורק בגלל כמויות', () => {
  const r = create();
  const all = statuses(r);
  if (!backupArg) assert.equal(all.length, 38);
  const open = all.filter(x => x.open);
  assert.deepEqual(open.map(x => x.day), ['2026-10-04'], JSON.stringify(open));
  const [oct4] = open;
  assert.deepEqual(oct4.short, [["זוג לחמניות אצבע בש'", 1]]);
  assert.deepEqual(oct4.over, [['לחמניות 10 בשקית', 2]]);
  assert.equal(oct4.unitsGap, 0);
  // המאזן בבאנר: תעודה אחת, חוסר 1 יח׳, עודף 2 יח׳
  const bal = JSON.parse(r.run('JSON.stringify(receiptsBalance())'));
  assert.equal(bal.n, 1);
  assert.equal(bal.shortUnits, 1);
  assert.equal(bal.overUnits, 2);
});

test('תעודות שהיו פתוחות רק בגלל כסף נסגרות מעצמן', () => {
  const all = statuses(create());
  for (const day of ['2026-09-17', '2026-09-28']) {
    const [rc] = byDay(all, day);
    assert.ok(rc, day);
    assert.equal(rc.oldStatus, 'open', day + ' הייתה פתוחה ב-v119');
    assert.deepEqual([rc.short, rc.over], [[], []], day + ': אין הפרש כמויות');
    assert.equal(rc.open, false, day);
  }
  const [sep1] = byDay(all, '2026-09-01');
  assert.equal(sep1.storedAmountGap, 41.31, 'פער הכסף השמור של 1.9 (מחירון מלא) נשאר במסמך');
  assert.equal(sep1.open, false, 'אבל אינו פותח את התעודה');
});

test('כלל הירושה: חוסר שזוכה בכסף (שש תעודות) סגור כשהזיכוי מכסה את מחיר התעודה', () => {
  const all = statuses(create());
  const expected = {
    '2026-08-21': { short: [['חלומית ארוזה ברמן', 4]], creditEx: 41.62 },
    '2026-08-25': { short: [["לחם עננים בסגנון בריוש עם פ' עבות", 1]], creditEx: 9.88 },
    '2026-08-27': { short: [['אחיד פרוס ברמן', 1], ["לחמנ' עננים בריוש 10", 6]], creditEx: 91.42 },
    '2026-09-01': { short: [["זוג לחמניות אצבע בש'", 1], ['פרנה - 4 בשקית 400 גר', 1]], creditEx: 11.2 },
    '2026-09-06': { short: [['פיתות כוסמין 10 בשקית', 2]], creditEx: 21.88 }, // 21.88 מול 21.92 — בסיבולת
    '2026-09-29': { short: [['פרנה - 4 בשקית 400 גר', 1]], creditEx: 9.03 }
  };
  for (const [day, exp] of Object.entries(expected)) {
    const [rc] = byDay(all, day);
    assert.ok(rc, day);
    assert.deepEqual(rc.short, exp.short, day);
    assert.equal(rc.creditEx, exp.creditEx, day);
    assert.equal(rc.credited, true, day + ': הזיכוי מכסה');
    assert.equal(rc.open, false, day);
  }
  // ובלי הזיכוי אותן תעודות היו פתוחות — החוסר עצמו לא נעלם
  const r = create();
  r.run("receipts.forEach(rc => { delete rc.shortCreditNotes; })");
  const bare = statuses(r);
  for (const day of Object.keys(expected)) assert.equal(byDay(bare, day)[0].open, true, day + ' בלי זיכוי');
});

test('שדות הכסף של v119 הם תמיד "לא פתוח" — קוראים ישנים לא נופלים', () => {
  const r = create();
  const flags = JSON.parse(r.run(`JSON.stringify(receipts.map(rc => { const di = receiptDiscrepancyInfo(rc);
    return [di.discountPending, di.discountPriceCheck, di.monthEndWaiting, di.amountGapOpen, di.unresolvedAmountGap, di.aiAuditOpen]; }))`));
  for (const f of flags) assert.deepEqual(f, [false, false, false, false, 0, false]);
});

test('ההיסטוריה מציירת את כל התעודות ביחידות, בלי שורות כסף', () => {
  const r = create();
  r.run('receiptHistoryFilter = "all"; currentView = "receiptsHistory"; renderReceiptsHistory();');
  const html = r.node('app').innerHTML;
  assert.ok(!/התצוגה נכשלה/.test(html));
  assert.ok(html.includes('נספר / חויב'), 'כותרת הכרטיס ביחידות');
  assert.ok(html.includes('שווי לפי מחירי האפליקציה'), 'הכסף שנשאר הוא תצוגה');
  assert.ok(html.includes('סכום מודפס') && html.includes('(לזיהוי בלבד)'), 'הסכום המודפס מסומן כזיהוי');
  for (const gone of ['לתשלום ללא מע"מ', 'ממתינה למרכזת', 'מבצע ירד בתעודה', 'ממתין לזיכוי ספק', 'פער סכום שטרם שויך', 'המחיר ממתין לבירור']) {
    assert.ok(!html.includes(gone), 'ירד: ' + gone);
  }
  // התעודה הפתוחה: החוסר והעודף ביחידות עם המספרים של הנייר
  assert.match(html, /עודף: לחמניות 10 בשקית/);
  assert.match(html, /חסר: זוג לחמניות אצבע בש/);
});

test('מסך התיקון: יחידות בלבד, והשמירה כותבת רק כמויות וסטטוס', async () => {
  const r = create();
  const openId = statuses(r).find(x => x.open).id;
  r.context.openId = openId;
  r.run('openReceiptFix(openId)');
  const t = JSON.parse(r.run('JSON.stringify(receiptFixTotals())'));
  assert.deepEqual(Object.keys(t).sort(), ['billed', 'ex', 'lines', 'units']);
  assert.equal(t.billed - t.units, -1, 'נספר יחידה אחת יותר ממה שחויב (עודף 2 − חוסר 1)');
  const html = r.node('app').innerHTML;
  assert.ok(html.includes('נספר בפועל') && html.includes('חויב בתעודה'), 'כותרת ביחידות');
  assert.ok(!html.includes('rc-fix-price') && !html.includes('rc-fix-promo') && !html.includes('rc-fix-note-total'), 'אין שדות מחיר/סכום');
  assert.ok(html.includes('מחיר התעודה, לתצוגה'));
  // ספירה חוזרת: 8 לחמניות כמו בנייר, ו-10 זוגות — עוגן היחידות של הנייר לא זז
  r.run("receiptFix.items.find(l => l.name === 'לחמניות 10 בשקית').qty = 8; receiptFix.items.find(l => l.name.indexOf('זוג לחמניות') === 0).qty = 10;");
  assert.equal(r.run('receiptFixEffectiveInfo().open'), false);
  await r.run('saveReceiptFix()');
  const w = r.writes.filter(x => x.op === 'update' && /receipts/.test(x.path)).pop();
  assert.ok(w, 'נכתב עדכון לתעודה');
  assert.deepEqual(Object.keys(w.data).sort(), ['aiAudit', 'count', 'items', 'status', 'unresolvedUnitsGap']);
  assert.equal(w.data.status, 'ok');
  for (const l of w.data.items) {
    assert.deepEqual(Object.keys(l).filter(k => !['productId', 'name', 'barcode', 'qty', 'noteQty', 'unitPrice', 'isDeposit'].includes(k)), [], 'שורה בלי שדות כסף: ' + Object.keys(l));
    assert.ok(!('lineTotal' in l));
  }
});
