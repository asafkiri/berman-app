// v81 — הנעלם היחיד.
// מוצר בלי אחוז הנחה מחויב מחירון מלא, ולכן שורתו אינה ניתנת לבדיקה. אבל
// כשכל שאר השורות בתעודה ידועות, לחשבון של הנייר נשאר נעלם אחד — ומשוואה
// אחת עם נעלם אחד נפתרת. הבדיקות כאן רצות על המתאם האמיתי (bermanAdaptScanPayload)
// ועל השער (bermanPaperAnchorCheck), כדי שהסימונים שהפותר נשען עליהם
// ייווצרו כמו בשטח ולא ייכתבו ביד.
//
// הרצה: node tests/single-unknown-price.test.mjs
//        node tests/single-unknown-price.test.mjs --backup ~/Downloads/bermanbackup.json
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { extractSource, APP_PATH } from './extract.mjs';

const backupAt = process.argv.indexOf('--backup');
const source = JSON.parse(fs.readFileSync(backupAt < 0 ? new URL('./fixture.json', import.meta.url) : process.argv[backupAt + 1], 'utf8'));
const collections = source.collections || source;
// "אחיד פרוס ודש" הוא הנעלם של כל התרחישים כאן, ולכן הוא נקבע במפורש
// כ"אחוז לא נקבע" — גם כשהגיבוי שמריצים מולו כבר קבע לו אחוז.
const UNKNOWN = { id: 'code_111', code: '111', name: 'אחיד פרוס ודש', barcode: '2037163',
  listPrice: 6.24, discountPct: 0, discountSet: false, price: 6.24 };
const products = Object.entries(collections.products).map(([id, p]) => ({ id, ...p }))
  .filter(p => String(p.code) !== '111').concat([{ ...UNKNOWN }]);
const promos = Object.entries(collections.promos).map(([id, p]) => ({ id, ...p }));
let receiptDocDate = '2026-09-14', receiptList = [], receiptPromoOnPaper = [];

const FNS = ['priceAuditCapture', 'makeOperationId', 'r2', 'fmtMoney', 'fmt3', 'normalizeBarcode', 'productCode',
  'productListPrice', 'productDiscountPct', 'productDiscountSet', 'finalUnitPrice', 'recomputeProductFinal',
  'promoFixedPrice', 'promoActive', 'promoForProduct', 'promoTriggered', 'promoUnitPriceOf', 'effectivePrice',
  'lineTotalFromUnit', 'todayStr', 'activeReceiptDate', 'aiMoneyCents', 'aiDocRowUnits', 'bermanBuildCodeIndex',
  'aiActiveFixedPromoFor', 'bermanPriceScanRow', 'bermanRepriceScanRows', 'bermanAdaptScanPayload',
  'bermanFullListMatch', 'bermanPaperAnchorCheck', 'bermanSingleUnknownPrice', 'bermanSingleUnknownPrices',
  'bermanPaperAnchorsFromScan', 'bermanScanDocumentDate'];
const CONSTS = ['const RECEIPT_ROUNDING_TOLERANCE_CENTS = 30;'];
// eslint-disable-next-line no-eval
const api = eval(extractSource(FNS, CONSTS) + '\n({ ' + FNS.join(', ') + ' })');

const byCode = code => products.find(p => p.code === String(code));
const netUnit = code => api.effectivePrice(byCode(code), 1, '2026-09-14');
const paperLine = ([code, qty, printed]) => {
  const p = byCode(code);
  const promo = api.aiActiveFixedPromoFor(p.id, '2026-09-14');
  const onPaper = promo && Math.abs(api.aiMoneyCents(printed) - api.aiMoneyCents(api.promoFixedPrice(promo))) <= 2;
  return api.lineTotalFromUnit(onPaper ? printed : netUnit(code), qty);
};
// שאר התעודה — שורות שכולן ידועות. 1231 מודפסת במחיר המבצע (9ז/v61) ו-339
// מודפסת במחירון בזמן שיש לה מבצע מחיר-קבוע, כלומר "מועמדת לחיוב מלא".
const KNOWN = [[119, 1, 13.59], [1231, 8, 8.5], [339, 8, 17.21], [233, 10, 4.1], [649, 2, 14.94]];
// אותה תעודה בלי אף מועמד לחיוב מלא — כדי לבודד את ההתנהגות שנובעת ממנו.
const KNOWN_PLAIN = KNOWN.filter(row => row[0] !== 339);
const knownMoney = KNOWN.reduce((sum, row) => sum + paperLine(row), 0);

function document(rows, amount, overrides) {
  return Object.assign({
    noteIndex: 0, docNumber: '244683220', docType: 'invoice', docDate: '14/09/2026', pageCount: 1,
    netToChargeExVat: amount,
    totalUnits: rows.reduce((sum, r) => sum + r[1], 0),
    printedLines: rows.length,
    rows: rows.map(([code, quantity, unitPriceExVat], i) => {
      const p = byCode(code);
      return { sourcePage: 1, lineNumber: i + 2, itemCode: String(code), barcode: p ? p.barcode : String(code),
        description: p ? p.name : 'מוצר לא מוכר', quantity, unitPriceExVat, confidence: 1 };
    })
  }, overrides || {});
}
function adapt(doc) { return api.bermanAdaptScanPayload({ scan: { documents: [structuredClone(doc)], warnings: [] } }); }
function adapted(doc) { return adapt(doc).scan.documents[0]; }
// תעודה שבה 111 חויב באמת ב-truePct, ושאר השורות במחיר הקטלוג. "נטו לחיוב"
// נבנה כמו שברמן מחשבת אותו: עיגול לשורה, וסכימה של השורות המעוגלות.
function build(rows, qty, truePct, gapAgorot) {
  const money = rows.reduce((sum, row) => sum + paperLine(row), 0);
  const unknownLine = api.lineTotalFromUnit(api.finalUnitPrice(UNKNOWN.listPrice, truePct), qty);
  return adapted(document([[111, qty, 6.24]].concat(rows), api.r2(money + unknownLine + (Number(gapAgorot) || 0) / 100)));
}
const withTrueDiscount = (truePct, qty, gapAgorot) => build(KNOWN, qty, truePct, gapAgorot);

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (error) { failed++; console.error('  ✗ ' + name + ': ' + error.message); }
}
function section(t) { console.log('\n' + t); }

const catalogBefore = JSON.stringify({ products, promos });

section('[1] נעלם אחד — התעודה גוזרת אותו');
const base = withTrueDiscount(8, 30);
const baseCheck = api.bermanPaperAnchorCheck(base);
const solved = api.bermanSingleUnknownPrice(base, baseCheck);
check('הפתרון הוחזר ומזוהה עם המוצר הנכון', () => {
  assert.equal(solved && solved.status, 'solved');
  assert.equal(solved.productId, 'code_111');
});
check('הכמות נספרה מכל שורות המוצר', () => assert.equal(solved.quantity, 30));
check('שאר השורות נספרו כידועות', () => assert.equal(solved.knownRows, KNOWN.length));
check('מחיר היחידה שנגזר הוא המחיר האמיתי עד אגורה', () =>
  assert.ok(Math.abs(solved.impliedUnitPrice - api.finalUnitPrice(6.24, 8)) <= 0.01, String(solved.impliedUnitPrice)));
check('האחוז שהוצע — 8%', () => assert.equal(solved.suggestedPct, 8));
check('הפער שנשאר אחרי ההצעה נכנס בסיבולת', () =>
  assert.ok(Math.abs(solved.residualCents) <= solved.tolCents, String(solved.residualCents)));
check('סכום השורות הידועות מדווח כמו שהוא', () => assert.equal(solved.knownLineCents, api.aiMoneyCents(knownMoney)));
check('העדות התומכת — "אחיד פרוס ברמן" באותו מחירון', () =>
  assert.deepEqual(solved.corroboration.map(o => o.pct), [8]));

section('[2] הפתרון אינו פותח את השער');
check('בדיקת הכסף נשארת נכשלת', () => assert.equal(baseCheck.money, false));
check('והשער סגור', () => assert.equal(api.bermanPaperAnchorsFromScan({ scan: { documents: [base] } }).ok, false));
check('הקטלוג לא נגע', () => assert.equal(JSON.stringify({ products, promos }), catalogBefore));

section('[3] רצועת הדיוק נגזרת מהכמות');
check('30 יח׳ מול סיבולת 30 אג׳ — אגורה ליחידה', () => assert.ok(Math.abs(solved.unitBand - 0.01) < 1e-9, String(solved.unitBand)));
check('הרצועה סימטרית סביב האחוז שנגזר', () =>
  assert.ok(solved.pctMin < solved.impliedPct && solved.impliedPct < solved.pctMax,
    JSON.stringify([solved.pctMin, solved.impliedPct, solved.pctMax])));
const one = api.bermanSingleUnknownPrice(withTrueDiscount(8, 1));
check('יחידה אחת — אותה סיבולת נופלת כולה על היחידה', () => assert.ok(Math.abs(one.unitBand - 0.30) < 1e-9, String(one.unitBand)));
check('ולכן הרצועה רחבה בהרבה, והיא נאמרת', () =>
  assert.ok((one.pctMax - one.pctMin) > (solved.pctMax - solved.pctMin) * 20,
    JSON.stringify([one.pctMin, one.pctMax])));

section('[4] סולם הפשטות — שלם קודם, ומאית כשרק היא נכנסת');
check('אחוז לא עגול נגזר במדויק כשהכמות גדולה', () => {
  const s = api.bermanSingleUnknownPrice(withTrueDiscount(46.65, 500));
  assert.equal(s.suggestedPct, 46.65);
});
check('כשהרצועה מכילה שלם — הוא זה שנבחר', () => {
  const s = api.bermanSingleUnknownPrice(withTrueDiscount(30.02, 150));
  assert.ok(s.pctMin < 30 && 30 < s.pctMax, JSON.stringify([s.pctMin, s.impliedPct, s.pctMax]));
  assert.equal(s.suggestedPct, 30);
});
check('גם חצי אחוז הוא תשובה לגיטימית', () => {
  const s = api.bermanSingleUnknownPrice(withTrueDiscount(12.5, 500));
  assert.equal(s.suggestedPct, 12.5);
});

section('[5] קביעת האחוז הופכת את הבדיקה לבדיקה אמיתית');
check('אחרי תמחור מחדש השער נפתח, והנעלם נעלם', () => {
  const payload = { scan: { documents: [structuredClone(base)] } };
  const p = byCode(111);
  p.discountPct = 8; p.discountSet = true; api.recomputeProductFinal(p);
  try {
    api.bermanRepriceScanRows(payload);
    const doc = payload.scan.documents[0];
    assert.equal(api.bermanPaperAnchorCheck(doc).ok, true);
    assert.equal(api.bermanSingleUnknownPrice(doc), null);
  } finally { Object.assign(p, { ...UNKNOWN }); }
});
check('והקטלוג חזר למה שהיה', () => assert.equal(JSON.stringify({ products, promos }), catalogBefore));

section('[6] כל נעלם שני מחזיר null');
check('שני מוצרים בלי אחוז', () => {
  const second = { id: 'code_3101', code: '3101', name: 'אחיד פרוס חן', barcode: '2661184',
    listPrice: 6.24, discountPct: 0, discountSet: false, price: 6.24 };
  products.push(second);
  try {
    const doc = adapted(document([[111, 30, 6.24], [3101, 4, 6.24]].concat(KNOWN), api.r2(knownMoney + 172.22 + 22.96)));
    assert.equal(api.bermanSingleUnknownPrice(doc), null);
  } finally { products.pop(); }
});
check('שורה שלא זוהתה', () => {
  const doc = adapted(document([[111, 30, 6.24]].concat(KNOWN), api.r2(knownMoney + 172.22 + 9.9)));
  doc.rows[doc.rows.length - 1].__tnuvaProductId = null;
  assert.equal(api.bermanSingleUnknownPrice(doc), null);
});
check('עוגן היחידות אינו מדויק', () => {
  const doc = withTrueDiscount(8, 30);
  doc.printedUnits = doc.printedUnits + 1;
  assert.equal(api.bermanSingleUnknownPrice(doc), null);
});
check('עוגן השורות אינו מדויק', () => {
  const doc = withTrueDiscount(8, 30);
  doc.printedLines = doc.printedLines + 1;
  assert.equal(api.bermanSingleUnknownPrice(doc), null);
});
check('"נטו לחיוב" לא נקרא', () => {
  const doc = withTrueDiscount(8, 30);
  doc.subtotalExVat = null;
  assert.equal(api.bermanSingleUnknownPrice(doc), null);
});
check('כמות חסרה בשורת הנעלם', () => {
  const doc = withTrueDiscount(8, 30);
  doc.rows[0].quantity = null;
  assert.equal(api.bermanSingleUnknownPrice(doc), null);
});
check('לנעלם עצמו יש מבצע מחיר-קבוע — שני מחירים לגיטימיים, אין פתרון יחיד', () => {
  promos.push({ id: 'promo_test_111', name: 'מבצע 111', type: 'receipt', pct: 0, fixedPrice: 5,
    minQty: 1, minUnit: 'unit', start: '2026-09-01', end: '2026-10-31', productIds: ['code_111'] });
  try { assert.equal(api.bermanSingleUnknownPrice(withTrueDiscount(8, 30)), null); }
  finally { promos.pop(); }
});

section('[7] שורת מבצע שמודפסת במחירון');
check('היא מדווחת כהסתייגות כשהמודפס נמוך מהמחושב', () =>
  assert.deepEqual(solved.promoCandidates, [byCode(339).name]));
check('ובכיוון שבו היא יכולה לסגור את הפער — הפותר נסוג', () => {
  const doc = withTrueDiscount(8, 30, 2000);
  assert.ok(api.bermanPaperAnchorCheck(doc).gapCents > 30, String(api.bermanPaperAnchorCheck(doc).gapCents));
  assert.equal(api.bermanSingleUnknownPrice(doc), null);
});
check('בלי שורת מבצע כזאת אין הסתייגות', () =>
  assert.deepEqual(api.bermanSingleUnknownPrice(build(KNOWN_PLAIN, 30, 8)).promoCandidates, []));

section('[8] מחיר שנגזר מחוץ לתחום אינו הצעה');
check('מעל המחירון — נאמר, בלי אחוז מוצע', () => {
  const s = api.bermanSingleUnknownPrice(build(KNOWN_PLAIN, 30, 8, 6000));
  assert.equal(s.status, 'out_of_range');
  assert.equal(s.suggestedPct, null);
  assert.ok(s.impliedUnitPrice > UNKNOWN.listPrice, String(s.impliedUnitPrice));
});
check('מחיר אפס או שלילי — אותו סירוב', () => {
  const doc = withTrueDiscount(8, 30);
  doc.subtotalExVat = api.r2(knownMoney);
  const s = api.bermanSingleUnknownPrice(doc);
  assert.equal(s.status, 'out_of_range');
  assert.equal(s.suggestedPct, null);
});

section('[9] כל התעודות שבסריקה');
check('תעודה בלי נעלם אינה מופיעה, ותעודה עם נעלם — כן', () => {
  const withUnknown = withTrueDiscount(8, 30);
  const clean = adapted(document(KNOWN, api.r2(knownMoney), { noteIndex: 1 }));
  clean.noteIndex = 1;
  const all = api.bermanSingleUnknownPrices({ scan: { documents: [withUnknown, clean] } });
  assert.equal(all.length, 1);
  assert.equal(all[0].documentIndex, 0);
  assert.equal(all[0].productId, 'code_111');
});

section('[10] חיווט');
const appSrc = fs.readFileSync(APP_PATH, 'utf8');
check('הכפתור נפלט עם מזהה המוצר והאחוז', () =>
  assert.ok(/data-role="price-derive-apply" data-product="' \+ htmlEscape\(solved\.productId\)/.test(appSrc)));
check('ל-price-derive-apply יש מטפל בהאצלה של #app', () =>
  assert.ok(/role === 'price-derive-apply'/.test(appSrc)));
check('ולחלון הסריקה, שיושב מחוץ ל-#app, יש מאזין משלו', () =>
  assert.ok(/rsBody'\)\.addEventListener\('click'/.test(appSrc) && /price-derive-apply"\]/.test(appSrc)));
check('הכרטיס מוצג בשער הצילום שנחסם', () =>
  assert.ok(/bermanSingleUnknownPrices\(aiScanResponse\)\.map\(bermanSingleUnknownHtml\)/.test(appSrc)));
check('ובבדיקת המחירים', () => assert.ok(/bermanSingleUnknownHtml\(r\.derived\)/.test(appSrc)));

section('[11] מקצה לקצה — על מודול האפליקציה המלא');
// הצינור האמיתי: סריקת רקע, מתאם, שער שנחסם, מסך שנצבע, לחיצה על הכפתור,
// כתיבה לענן, תמחור מחדש, ושער שנפתח. רק גבולות הדפדפן והרשת מוחלפים.
{
  const { runtime } = await import('./receipt-scan-harness.mjs');
  const rows = [[111, 30, 6.24]].concat(KNOWN);
  const paperDoc = document(rows, api.r2(knownMoney + api.lineTotalFromUnit(api.finalUnitPrice(6.24, 8), 30)));
  const rt = runtime({ data: {
    products: structuredClone(products), promos: structuredClone(promos), items: [],
    paper: { ok: true, serviceVersion: 4, model: 'fixture', requestId: 'single-unknown',
      scan: { warnings: [], documents: [structuredClone(paperDoc)] } }
  } });
  rt.run("currentView = 'receiving'; mainMode = 'receiving'; receiptDupConfirmed = true;");
  await rt.scan();
  const blocked = rt.node('app').innerHTML;
  check('השער נחסם ואמר את הפער', () => {
    assert.equal(rt.run('receiptPaperScanState'), 'failed');
    assert.ok(/הנייר לא אישר את עצמו/.test(blocked));
  });
  check('כרטיס הנעלם היחיד מוצג במסך, עם האחוז והכפתור', () => {
    assert.ok(/נעלם אחד — והתעודה גוזרת אותו/.test(blocked), 'אין כרטיס');
    assert.ok(blocked.includes('data-role="price-derive-apply" data-product="code_111" data-pct="8"'), 'אין כפתור');
    assert.ok(/רצועת הדיוק 7\.84%–8\.16%/.test(blocked), 'אין רצועה');
  });
  check('לפני האישור לא נקבע דבר', () => {
    assert.equal(rt.run('products.find(p => p.id === "code_111").discountSet'), false);
    assert.equal(rt.run('testWrites.length'), 0);
  });
  rt.run('bermanApplyDerivedDiscount("code_111", "8")');
  check('נפתח אישור שאומר שהאחוז יחול על כל תעודה', () =>
    assert.ok(/יחול מעכשיו על כל תעודה/.test(rt.node('confirmMsg').textContent), rt.node('confirmMsg').textContent));
  rt.run('const cb = confirmCb; hideConfirm(); cb();');
  check('האחוז נקבע בכרטיס המוצר והמחיר הסופי נגזר איתו', () => {
    assert.equal(rt.run('products.find(p => p.id === "code_111").discountPct'), 8);
    assert.equal(rt.run('products.find(p => p.id === "code_111").discountSet'), true);
    assert.equal(rt.run('products.find(p => p.id === "code_111").price'), api.finalUnitPrice(6.24, 8));
  });
  check('ועכשיו השער נפתח — הפעם כבדיקה אמיתית', () => {
    assert.equal(rt.run('receiptPaperScanState'), 'ok');
    assert.equal(rt.run('receiptNoteTotal'), paperDoc.netToChargeExVat);
    assert.equal(rt.run('receiptNoteUnits'), paperDoc.totalUnits);
  });
  check('הכרטיס ירד מהמסך, ואין עוד נעלם', () => {
    const after = rt.run('renderReceiving(); document.getElementById("app").innerHTML');
    assert.ok(!/נעלם אחד — והתעודה גוזרת אותו/.test(after));
    assert.equal(rt.run('bermanSingleUnknownPrices(aiScanResponse).length'), 0);
  });
}

console.log('\n' + (failed ? '✗ נכשלו ' + failed : '✓ הכל עבר') + ' (' + passed + '/' + (passed + failed) + ')' +
  (backupAt < 0 ? ' · מול fixture.json' : ' · מול גיבוי מקומי'));
process.exit(failed ? 1 : 0);
