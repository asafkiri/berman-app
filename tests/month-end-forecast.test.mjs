// v91: התחזית לקיזוז המרכזת, בשלוש צורות החיוב — על המודול המלא.
//
// שאלת הבעלים, ושתי הטעויות שהיא מונעת:
//   "כשהמבצע יורד בתעודה — שלא ירד שוב בסיכום החשבון שלנו."
//   "וכשהוא לא ירד בכלל — שכן ייכנס לחישוב הסופי."
//
// הקיזוז נגזר תמיד מ-monthEndUnitRebate(promo, unitPrice) = המחיר שחויב פחות
// מחיר המבצע. לכן הוא נכון מאליו בכל שלוש הצורות — אבל רק אם unitPrice הוא
// המחיר שחויב בפועל. עד v90 שורה שחויבה במחירון מלא נשמרה דווקא במחיר הרגיל,
// ולכן התחזית חישבה ₪16.38 במקום ₪57.68 (התעודה האמיתית של 1.9.2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './receipt-scan-harness.mjs';

const r2 = n => Math.round(n * 100) / 100;
const BREAD = { id: 'bread', code: '101', barcode: '497112', name: 'לחם פרוס בדיקה',
  listPrice: 6.24, price: 5.7408, discountPct: 8, discountSet: true };
const ACTIVE = { id: 'active', code: '339', barcode: '497044', name: 'לחם מבצע בדיקה',
  listPrice: 17.21, price: 12.047, discountPct: 30, discountSet: true };
const PROMO_UNIT = 10;
const products = [BREAD, ACTIVE];
const promos = [{ id: 'promo-active', name: 'לחם מבצע — ממכתב מבצעים', productIds: [ACTIVE.id],
  fixedPrice: PROMO_UNIT, pct: 0, type: 'receipt', minQty: 1, minUnit: 'unit',
  start: '2026-09-01', end: '2026-10-31' }];
const QTY = 8;

// שלוש הצורות, כפי שהן מודפסות בעמודת "מחיר" של ברמן.
const FORMS = {
  regular: { printed: ACTIVE.listPrice, billed: ACTIVE.price },      // מחירון, ההנחה הקבועה חבויה
  full_list: { printed: ACTIVE.listPrice, billed: ACTIVE.listPrice },// מחירון, בלי שום הנחה
  promo_on_paper: { printed: PROMO_UNIT, billed: PROMO_UNIT }        // מחיר המבצע ירד בתעודה
};

async function delivery(form) {
  const f = FORMS[form];
  const rows = [[BREAD, 30, BREAD.listPrice], [ACTIVE, QTY, f.printed]];
  const total = r2(r2(BREAD.price * 30) + r2(f.billed * QTY));
  const doc = { noteIndex: 0, docType: 'invoice', docNumber: 'ME-1', docDate: '09/09/2026',
    pageCount: 1, netToChargeExVat: total, totalUnits: 30 + QTY, printedLines: 2, warnings: [],
    rows: rows.map(([p, quantity, unitPriceExVat], i) => ({ sourcePage: 1, lineNumber: i + 1,
      itemCode: p.code, barcode: p.barcode, description: p.name, quantity, unitPriceExVat, confidence: 0.99 })) };
  const items = rows.map(([p, qty]) => ({ productId: p.id, name: p.name, barcode: p.barcode, qty }));
  const data = { products, promos, items,
    paper: { ok: true, serviceVersion: 5, model: 'fixture', requestId: 'fixture', scan: { warnings: [], documents: [doc] } } };
  const r = runtime({ data });
  r.run(`receiptOpened = true; receiptDocDate = '2026-09-09'; receiptList = [];
    bermanSeedPhotoFirstScan(1);
    aiScanDocuments[0].pages = [{ dataUrl: 'data:image/jpeg;base64,Zml4dHVyZQ==', orientationConfirmed: true }];`);
  await r.run('bermanRunPaperScanInBackground()');
  r.run(`receiptList = structuredClone(testData.items); saveReceiptDraft(); openReconcile();
    aiRefreshScanEvaluation();
    runCloudTaskSilent = (label, task) => { testWrites.push(structuredClone(task)); return true; };`);
  r.total = total;
  return r;
}
const json = (r, code) => JSON.parse(r.run('JSON.stringify(' + code + ')'));
const forecast = r => json(r, `monthEndSnapshotForLines(reconcileData.map(l => ({ productId: l.productId,
  unitPrice: l.price, noteQty: l.noteQty })), '2026-09-09')`);
const rebateFor = r => {
  const hit = forecast(r).find(g => g.id === 'promo-active');
  return hit ? r2(hit.rebate) : 0;
};

test('promotion already on the paper: no month-end credit is expected a second time', async () => {
  const r = await delivery('promo_on_paper');
  const line = json(r, 'reconcileData.find(l => l.productId === "active")');
  assert.equal(r2(line.price), PROMO_UNIT);
  // שילמת ₪10 — אין מה לקזז. זו הטעות שהבעלים ביקש למנוע: קיזוז כפול.
  assert.equal(rebateFor(r), 0);
  assert.ok(line.promoOnPaper, 'התעודה מתעדת שהמבצע ירד בה');
});

test('full list price, no discount at all: the whole credit is expected at month end', async () => {
  const r = await delivery('full_list');
  const line = json(r, 'reconcileData.find(l => l.productId === "active")');
  // השורה נשמרת במחיר ששולם בפועל, לא במחיר הרגיל.
  assert.equal(r2(line.price), ACTIVE.listPrice);
  assert.equal(rebateFor(r), r2((ACTIVE.listPrice - PROMO_UNIT) * QTY));
  assert.equal(line.promoOnPaper, undefined);
});

test('regular discount only: the credit is the rest of the way down to the promotion price', async () => {
  const r = await delivery('regular');
  const line = json(r, 'reconcileData.find(l => l.productId === "active")');
  assert.equal(r2(line.price), r2(ACTIVE.price));
  assert.equal(rebateFor(r), r2((ACTIVE.price - PROMO_UNIT) * QTY));
});

test('every form lands on the same final unit price once the credit arrives', async () => {
  for (const form of ['regular', 'full_list', 'promo_on_paper']) {
    const r = await delivery(form);
    const line = json(r, 'reconcileData.find(l => l.productId === "active")');
    const paid = r2(Number(line.price) * QTY);
    const credit = rebateFor(r);
    assert.equal(r2(paid - credit), r2(PROMO_UNIT * QTY), form + ': המחיר הסופי חייב להיות מחיר המבצע');
  }
});

test('a full-list receipt closes on the printed total instead of staying open on a gap', async () => {
  const r = await delivery('full_list');
  // v90 שמר ₪268.60 מול ₪309.90 בנייר והשאיר פער פתוח של ₪41.30.
  assert.equal(r.run('reconcileNoteInc()'), r.total);
  assert.equal(r.run('reconcileGap()'), 0);
  assert.equal(r.run('reconcileIsBalanced()'), true);
});

test('the full list price never leaks into the product catalogue', async () => {
  const r = await delivery('full_list');
  r.click(r.run('aiScanEvaluation.valid') ? 'ai-apply' : 'ai-close-receipt');
  // בלי ההגנה הזאת מחיר המוצר היה נדרס ל-17.21 וכל תעודה הבאה הייתה שגויה.
  assert.equal(r.run('products.find(p => p.id === "active").price'), ACTIVE.price);
  const priceWrites = r.writes.filter(w => String((w && w.path) || []).includes('products'));
  assert.deepEqual(priceWrites, []);
});

// תעודה שנשמרה לפני v91: השורה נושאת את המחיר הרגיל, והרשומה יודעת את האמת.
function legacyReceipt(unitPrice) {
  return { id: 'r1', date: '2026-09-01', docDate: '2026-09-01', status: 'open', vatPct: 18,
    items: [{ productId: ACTIVE.id, name: ACTIVE.name, qty: QTY, unitPrice, lineTotal: r2(unitPrice * QTY) }],
    monthEndRebates: [{ id: 'promo-active', name: promos[0].name, pct: 0, fixedPrice: PROMO_UNIT,
      baseEx: r2(unitPrice * QTY), rebate: r2(Math.max(0, unitPrice - PROMO_UNIT) * QTY) }],
    monthEndPending: { productId: ACTIVE.id, name: ACTIVE.name, qty: QTY, listPrice: ACTIVE.listPrice,
      expectedNet: ACTIVE.price, promoFixedPrice: PROMO_UNIT, finalUnitPrice: PROMO_UNIT,
      expectedRebate: r2((ACTIVE.listPrice - PROMO_UNIT) * QTY), gap: r2((ACTIVE.listPrice - ACTIVE.price) * QTY),
      promoName: promos[0].name } };
}
test('a receipt saved before the fix has its understated credit completed at read time', async () => {
  const r = await delivery('regular');
  r.context.legacy = legacyReceipt(ACTIVE.price); // ₪12.047 — מה ש-v90 שמר
  const corr = json(r, '[...monthEndPendingCorrections(legacy).entries()]');
  assert.deepEqual(corr, [['promo-active', r2((ACTIVE.listPrice - ACTIVE.price) * QTY)]]);
  const frozen = r2(legacyReceipt(ACTIVE.price).monthEndRebates[0].rebate);
  assert.equal(r2(frozen + corr[0][1]), r2((ACTIVE.listPrice - PROMO_UNIT) * QTY));
});
test('a receipt saved after the fix gets no completion, so nothing is counted twice', async () => {
  const r = await delivery('regular');
  r.context.legacy = legacyReceipt(ACTIVE.listPrice); // ₪17.21 — מה ש-v91 שומר
  assert.deepEqual(json(r, '[...monthEndPendingCorrections(legacy).entries()]'), []);
});
test('a receipt with no pending record is never touched', async () => {
  const r = await delivery('regular');
  r.context.legacy = { id: 'r2', date: '2026-09-01', items: [], monthEndRebates: [] };
  assert.deepEqual(json(r, '[...monthEndPendingCorrections(legacy).entries()]'), []);
});

test('the receipt still records what the month end owes, for the card that explains it', async () => {
  const r = await delivery('full_list');
  const pending = json(r, 'aiMonthEndPendingRecord(aiScanEvaluation)');
  assert.equal(pending.productId, ACTIVE.id);
  assert.equal(r2(pending.expectedRebate), r2((ACTIVE.listPrice - PROMO_UNIT) * QTY));
  assert.equal(r2(pending.finalUnitPrice), PROMO_UNIT);
});
