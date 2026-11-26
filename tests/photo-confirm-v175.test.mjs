// v175 — מסך האישור גם לצילום של נייר מהנהג; חלוקת תעודה ארוכה גם במסלול הזה; צילום שוכב מיושר לבד; נתוני הצילום נשמרים.
// 26.11.2026, בעל העסק: תעודת משלוח יצאה בצילום שוכבת, נשלחה כך לקריאה, וחזרה עם שלוש שורות לבדיקה — "אצל ברמן אין את
// מנגנון האישור של המשתמש או החיתוך במקרה הצורך, וזה ישר לוקח את התמונה שצילמת ושולח אותה למודל. צריך קודם להופיע
// למשתמש, כמו אצל יטבתה ותנובה, ואז לשלוח"; ו"גם מסך החיתוך במקרה של תעודה ארוכה לא פועל על ברמן".
// מה שנבדק (הכול בקוד של האפליקציה; המצלמה, הכנת התמונה והשרת — מזויפים):
// - צילום לא נשלח לפני אישור: מסך האישור נפתח, "קרא" ו"זה כל הניירות" לא שולחים אותו, ו"אשר" מתחיל את הקריאה לבד.
// - "מחק צילום" מוריד את הצילום בלי בקשה; סיבוב במסך — מה שנשלח הוא התמונה המסובבת.
// - נייר קודם שנקרא ברקע ונכנס לקליטה לא סוגר את מסך האישור של הצילום הבא.
// - בלי רשת: הצילום מאושר ומחכה ("מוכן לקריאה"); "בדוק שוב" מוריד את האישור עד שמאשרים מחדש.
// - קריאה שנכשלה: "בדוק תמונה" ואישור אינם קריאה נוספת בתשלום — רק "קרא שוב".
// - תעודה ארוכה: שני חלקים בצילום אחד, אישור אחד, בקשה אחת עם שני עמודים, והקליטה סופרת שני עמודים (ולא נכשלת על
//   "מספר העמודים"); 180° הופך את סדר החלקים; "השאר תמונה מלאה" מחזיר עמוד אחד; בבדיקת הנייר רואים את שני החלקים.
// - נתוני הצילום (חיתוך, חלוקה, איכות, סיבוב) נשמרים עם הקריאה ועם הקליטה.
// - צילום שוכב: לא נמצא טקסט, ובסיבוב נמצא — הצילום מסובב לפני החיתוך (ימינה; תג כיוון 3 — שמאלה), והמסך אומר זאת.
//   צילום שאינו שוכב, כשל בסיבוב ומסלול השחזור — בלי שינוי. קריאת תג הכיוון מקובץ JPEG.
// הרצה: TZ=Asia/Jerusalem node --test tests/photo-confirm-v175.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { app, delivery, credit, state } from './one-button-helpers.mjs';

const json = (r, expr) => JSON.parse(r.run('JSON.stringify(' + expr + ')'));
const settle = async () => { for (let i = 0; i < 40; i++) await new Promise(res => setImmediate(res)); };
// הקריאה רצה ברקע אחרי "אשר" — מחכים שהסבב יסתיים ושתעודת המשלוח תיכנס לקליטה
const idle = async r => {
  for (let i = 0; i < 400 && r.run('!!(paperIntake && paperIntake.busy)'); i++) await new Promise(res => setImmediate(res));
  await r.run('paperJoinChain'); await settle();
};
const screen = r => { r.run('renderPaperIntake()'); return r.node('app').innerHTML; };
const has = (html, role) => new RegExp('data-role="' + role + '"').test(html);
const reviewOpen = r => r.run('!!(aiOrientationSession && aiOrientationSession.paper)');
const sent = (r, i) => JSON.parse(r.requests[i].body).documents[0].pages;
// הכנת התמונה (מזויפת) כפי שהצינור האמיתי מחזיר אותה: עמוד אחד שנחתך, או חלקים של תעודה ארוכה שחולקה.
function camera(r, parts = 1, extra = {}) {
  r.context.testParts = parts; r.context.testExtra = extra;
  r.run(`aiCompressInvoiceImage = async file => {
      const made = Array.from({ length: testParts }, (unused, i) => Object.assign({
        dataUrl: 'data:image/jpeg;base64,' + file.name + (i + 1), baseDataUrl: 'data:image/jpeg;base64,' + file.name + (i + 1), rotation: 0,
        orientationConfirmed: false, cropped: true, autoCropped: true,
        cropInfo: testParts > 1 ? { v: 166, reason: 'split', part: i + 1, parts: testParts, pitch: 30, value: 40 } : { v: 180, reason: 'cropped', value: 40, splitReason: 'pitch_ok' },
        quality: { v: 1, paperPx: 1850, sharpness: 0.6, contrast: 80, glarePct: 0, darkPct: 0, paperLuma: 215 }, qualityAdvice: null,
        originalImage: { dataUrl: 'data:image/jpeg;base64,' + file.name + 'full', region: { x: 0, y: 0, width: 3000, height: 4000 }, scale: 0.46, rotationOffset: 0 },
        name: file.name + '.jpg', bytes: 100 }, testParts > 1 ? { split: { group: 'g-' + file.name, index: i, count: testParts } } : {}, testExtra));
      return made.length === 1 ? made[0] : made;
    };
    paperFileHash = async f => 'h-' + f.name;
    aiRenderInvoiceRotation = async (url, turns) => ({ dataUrl: turns ? url + '@' + turns : url, bytes: 100 });`);
}
const shoot = (r, name) => r.run(`paperPhotoFiles([{ name: ${JSON.stringify(name)} }])`);

test('צילום של נייר לא נשלח לפני אישור: מסך האישור נפתח, "קרא" ו"זה כל הניירות" לא שולחים אותו, ו"אשר" מתחיל את הקריאה לבד', async () => {
  const r = app(delivery('77001234'));
  camera(r);
  await shoot(r, 'a');
  assert.equal(r.run('currentView'), 'paperIntake');
  assert.equal(r.requests.length, 0, 'שום דבר לא נשלח');
  assert.equal(reviewOpen(r), true, 'מסך האישור נפתח על הצילום');
  assert.equal(r.node('aiOrientationModal').classList.contains('hidden'), false);
  assert.match(r.node('aiOrientationLabel').textContent, /^נייר מהנהג · v180 · חיתוך אוטומטי · הוסרו 40% מהשוליים$/);
  assert.match(r.node('aiOrientationNote').textContent, /לא תישלח ל-AI לפני האישור\. אחרי האישור הקריאה מתחילה לבד\./);
  assert.match(r.node('aiOrientationConfirm').innerHTML, /אשר תמונה חתוכה/);
  assert.deepEqual(json(r, 'paperIntake.items.map(x => [x.status, paperItemConfirmed(x), x.pages.length])'), [['photo', false, 1]]);
  let html = screen(r);
  assert.match(html, /מחכה לאישור התמונה[\s\S]*לא נשלח לקריאה לפני שתאשר/);
  assert.ok(has(html, 'paper-photo-review') && has(html, 'paper-photo-review-next'), '"בדוק ואשר" בכרטיס ובראש המסך');
  assert.ok(!has(html, 'paper-run'), 'בלי "קרא" — אין צילום מאושר שמחכה');
  assert.ok(!has(html, 'paper-rotate'), 'כפתור "סובב" שבכרטיס הוחלף במסך האישור');
  // "קרא" (גם אם נקרא מקוד אחר) ו"זה כל הניירות" לא שולחים צילום שלא אושר
  await r.run('paperIntakeRun()');
  r.click('paper-all-in');
  assert.equal(r.requests.length, 0);
  assert.equal(r.run('!!paperIntake.allIn'), false, '"זה כל הניירות" מחכה לאישור התמונה');
  assert.equal(r.run('paperIntake.items[0].status'), 'photo');
  // "אשר" — המסך נסגר, והקריאה מתחילה לבד
  await r.run('aiConfirmOrientationReview()');
  assert.equal(r.run('aiOrientationSession'), null);
  assert.equal(r.node('aiOrientationModal').classList.contains('hidden'), true);
  await idle(r);
  assert.equal(r.requests.length, 1, 'בקשה אחת, אחרי האישור');
  assert.deepEqual(sent(r, 0), ['data:image/jpeg;base64,a1']);
  assert.equal(r.run('receiptPaperScanState'), 'ok', 'תעודת המשלוח נכנסה לקליטה');
  html = screen(r);
  assert.ok(has(html, 'paper-photo-more') && has(html, 'paper-all-in'));
  assert.ok(!has(html, 'paper-photo-review-next'));
  assert.match(html, /כל נייר בצילום משלו, ואשר כל תמונה/);
  // עכשיו "זה כל הניירות" פועל
  r.click('paper-all-in');
  assert.equal(r.run('paperIntake.allIn'), true);
  assert.equal(r.requests.length, 1, 'בלי קריאה נוספת');
});

test('"מחק צילום" מוריד את הצילום בלי בקשה; סיבוב במסך האישור — התמונה המסובבת היא שנשלחת, והסיבוב נשמר עם הקריאה', async () => {
  const r = app(delivery('77001234'));
  camera(r);
  await shoot(r, 'a');
  r.run('aiCancelOrientationReview()');
  assert.equal(r.run('aiOrientationSession'), null);
  assert.equal(r.run('paperIntake.items.length'), 0, 'הצילום ירד ממסך הניירות');
  await idle(r);
  assert.equal(r.requests.length, 0);
  // צילום חדש: סיבוב ימינה, ואז אישור
  await shoot(r, 'b');
  await r.run('aiRotateOrientationReview(1)');
  assert.deepEqual(json(r, 'paperIntake.items[0].pages.map(p => [p.rotation, p.dataUrl, p.orientationConfirmed])'), [[90, 'data:image/jpeg;base64,b1@1', false]]);
  assert.match(r.node('aiOrientationLabel').textContent, /^נייר מהנהג · סיבוב 90° · /);
  assert.equal(reviewOpen(r), true, 'אחרי סיבוב המסך נשאר פתוח — עוד לא אושר');
  assert.equal(r.requests.length, 0);
  await r.run('aiConfirmOrientationReview()');
  await idle(r);
  assert.deepEqual(sent(r, 0), ['data:image/jpeg;base64,b1@1'], 'נשלחה התמונה המסובבת');
  const cap = r.run('paperIntake.items[0].captureId');
  assert.deepEqual(json(r, `paperLocalResults()[${JSON.stringify(cap)}].scan.photo`), { pageCount: 1, cropReasons: ['cropped'], splitReasons: ['pitch_ok'],
    photoQuality: [{ v: 1, paperPx: 1850, sharpness: 0.6, contrast: 80, glarePct: 0, darkPct: 0, paperLuma: 215 }], qualityAdvice: ['ok'], rotations: [90], autoRotated: [0] });
  // בקליטה: אותם שדות שהקליטה שומרת לצילום שלה, בלי אובייקט נפרד
  const per = state(r).per[0];
  assert.equal(per.source, 'paper'); assert.equal(per.pageCount, 1);
  assert.deepEqual([per.cropReasons, per.splitReasons, per.qualityAdvice, per.rotations, per.autoRotated], [['cropped'], ['pitch_ok'], ['ok'], [90], [0]]);
  assert.equal(per.photoQuality[0].paperPx, 1850);
  assert.equal('photo' in per, false);
});

test('נייר קודם שנקרא ברקע ונכנס לקליטה לא סוגר את מסך האישור של הצילום הבא', async () => {
  const r = app(delivery('77001234'));
  camera(r);
  const release = r.hold();
  await shoot(r, 'a');
  await r.run('aiConfirmOrientationReview()');
  assert.equal(r.run('paperIntake.busy'), true, 'הנייר הראשון נקרא');
  for (let i = 0; i < 400 && r.requests.length < 1; i++) await new Promise(res => setImmediate(res));
  assert.equal(r.requests.length, 1, 'הבקשה של הנייר הראשון יצאה (ומחכה לתשובה)');
  r.serve(credit('290095142'));
  await shoot(r, 'b');
  assert.equal(reviewOpen(r), true, 'הצילום השני במסך האישור בזמן שהראשון נקרא');
  release();
  await idle(r);
  assert.equal(r.run('receiptPaperScanState'), 'ok', 'התעודה הראשונה נכנסה לקליטה');
  assert.equal(r.requests.length, 1, 'הצילום השני לא נשלח');
  assert.equal(reviewOpen(r), true, 'מסך האישור של הצילום השני נשאר פתוח');
  assert.match(r.node('aiOrientationLabel').textContent, /^נייר מהנהג/);
  // איפוסים אחרים של הקליטה גם הם לא סוגרים אותו, ומסך אישור של עמוד בקליטה לא נפתח מעליו
  r.run('aiCloseOrientationReview()');
  assert.equal(reviewOpen(r), true);
  assert.equal(r.run('aiOpenOrientationReview(0, 0, true)'), false);
  // גם כשמסך הקליטה הוא שמצויר מאחור — הצילום של הנייר לא נרשם כ"מסך אישור פתוח" של הקליטה
  assert.equal(r.run(`(() => { const view = currentView; currentView = 'receiving'; try { return captureSharedReceipt().ui.orientation; } finally { currentView = view; } })()`), null, 'לא נרשם כמסך של הקליטה');
  await r.run('aiConfirmOrientationReview()');
  await idle(r);
  assert.equal(r.requests.length, 2);
  assert.deepEqual(sent(r, 1), ['data:image/jpeg;base64,b1']);
  assert.equal(r.run('aiOrientationSession'), null);
});

test('מסך האישור של צילום נייר אינו חלק מהקליטה: קליטה שנשמרת עכשיו לא חוסמת את הכפתורים שלו', async () => {
  const r = app(delivery('77001234'));
  camera(r);
  const inModal = { closest: selector => /#aiOrientationModal/.test(selector) ? {} : null };
  await shoot(r, 'a');
  assert.equal(r.run('sharedReceiptEventTouchesWorkflow')(inModal), false);
  r.run('aiCancelOrientationReview()');
  // מסך אישור של עמוד בקליטה — כמו תמיד
  r.run(`bermanSeedPhotoFirstScan(1); aiScanDocuments[0].pages = [{ dataUrl: 'data:image/jpeg;base64,eA==', baseDataUrl: 'data:image/jpeg;base64,eA==', rotation: 0, orientationConfirmed: false }]; aiOpenOrientationReview(0, 0, true);`);
  assert.equal(r.run('!!aiOrientationSession && !aiOrientationSession.paper'), true);
  assert.equal(r.run('sharedReceiptEventTouchesWorkflow')(inModal), true);
  assert.match(r.node('aiOrientationLabel').textContent, /^תעודה 1 · עמוד 1/);
  assert.equal(r.node('aiOrientationNote').textContent, 'התמונה לא תישלח ל-AI לפני האישור.');
  r.run('aiCloseOrientationReview()');
  assert.equal(r.run('aiOrientationSession'), null, 'איפוס של הקליטה סוגר את המסך שלה');
});

test('בלי רשת: הצילום מאושר ומחכה ("מוכן לקריאה"); "בדוק שוב" מוריד את האישור, והצילום לא נקרא עד שמאשרים מחדש', async () => {
  const r = app(delivery('77001234'));
  camera(r);
  r.run('navigator.onLine = false');
  await shoot(r, 'a');
  await r.run('aiConfirmOrientationReview()');
  await idle(r);
  assert.equal(r.requests.length, 0);
  assert.deepEqual(json(r, 'paperIntake.items.map(x => [x.status, paperItemConfirmed(x)])'), [['photo', true]]);
  let html = screen(r);
  assert.match(html, /מוכן לקריאה[\s\S]*התמונה אושרה\./);
  assert.match(html, /data-role="paper-run"[^>]*>[^<]*<i[^>]*><\/i> קרא \(1\)/);
  assert.match(html, /data-role="paper-photo-review"[^>]*>בדוק שוב</);
  assert.ok(!has(html, 'paper-photo-review-next'));
  // "בדוק שוב" — המסך נפתח והאישור יורד
  const cap = r.run('paperIntake.items[0].captureId');
  r.click('paper-photo-review', cap);
  assert.equal(reviewOpen(r), true);
  assert.equal(r.run('paperItemConfirmed(paperIntake.items[0])'), false);
  r.run('navigator.onLine = true');
  await r.run('paperIntakeRun()');
  assert.equal(r.requests.length, 0, 'הרשת חזרה — אבל הצילום עוד במסך האישור');
  await r.run('aiConfirmOrientationReview()');
  await idle(r);
  assert.equal(r.requests.length, 1);
});

test('קריאה שנכשלה: "בדוק תמונה" ואישור אינם קריאה נוספת בתשלום — רק "קרא שוב"', async () => {
  let calls = 0, fail = true;
  const paper = delivery('77001234');
  const fetch = async url => { calls++; if (fail) throw new TypeError('Failed to fetch'); return { ok: true, status: 200, json: async () => structuredClone(paper) }; };
  const r = app(paper, { globals: { fetch } });
  camera(r);
  await shoot(r, 'a');
  await r.run('aiConfirmOrientationReview()');
  await idle(r);
  assert.equal(calls, 1);
  assert.equal(r.run('paperIntake.items[0].status'), 'error');
  const cap = r.run('paperIntake.items[0].captureId');
  let html = screen(r);
  assert.match(html, /data-role="paper-retry"[^>]*>קרא שוב \(בתשלום\)</);
  assert.match(html, /data-role="paper-photo-review"[^>]*>בדוק תמונה</);
  r.click('paper-photo-review', cap);
  assert.equal(reviewOpen(r), true);
  await r.run('aiRotateOrientationReview(1)');
  await r.run('aiConfirmOrientationReview()');
  await idle(r);
  assert.equal(calls, 1, 'האישור לבדו לא קורא שוב');
  assert.equal(r.run('paperIntake.items[0].status'), 'error');
  fail = false;
  r.click('paper-retry', cap);
  await idle(r);
  assert.equal(calls, 2);
  assert.equal(r.run('paperIntake.items[0].status'), 'delivery');
});

// תעודה ארוכה: השרת מחזיר ב-pageCount את מספר התמונות שקיבל, ושורות מכל חלק
function longDelivery(number = '77001234') {
  const p = delivery(number);
  const doc = p.scan.documents[0];
  doc.pageCount = 2;
  doc.rows.forEach((row, i) => { row.sourcePage = i < 3 ? 1 : 2; });
  return p;
}

test('תעודה ארוכה במסלול הניירות: שני חלקים בצילום אחד, אישור אחד, בקשה אחת עם שני עמודים — והקליטה סופרת שני עמודים', async () => {
  const r = app(longDelivery());
  camera(r, 2);
  await shoot(r, 'a');
  assert.deepEqual(json(r, 'paperIntake.items.map(x => [x.status, x.pages.length, x.page === x.pages[0]])'), [['photo', 2, true]]);
  assert.match(r.node('aiOrientationLabel').textContent, /^נייר מהנהג · חלק 1 מתוך 2 · v166 · תעודה ארוכה · חלק 1 מתוך 2/);
  assert.match(r.node('aiOrientationHint').textContent, /התעודה ארוכה, ולכן חולקה ל-2 חלקים/);
  assert.match(screen(r), /מחכה לאישור התמונה[\s\S]*התעודה ארוכה — חולקה ל-2 חלקים\./);
  await r.run('aiConfirmOrientationReview()');
  assert.equal(r.run('aiOrientationSession'), null, 'אישור אחד מאשר את שני החלקים');
  await idle(r);
  assert.equal(r.requests.length, 1);
  assert.deepEqual(sent(r, 0), ['data:image/jpeg;base64,a1', 'data:image/jpeg;base64,a2'], 'שני החלקים כעמודים של אותה תעודה, לפי הסדר');
  const s = state(r);
  assert.equal(s.st, 'ok', 'הקריאה אישרה את עצמה — בלי "מספר העמודים שפוענחו אינו זהה"');
  assert.equal(s.docs[0].savedPageCount, 2);
  assert.equal(s.per[0].pageCount, 2);
  assert.deepEqual(s.snap, [2], 'הטיוטה השמורה נושאת שני עמודים');
  assert.deepEqual([s.per[0].cropReasons, s.per[0].splitReasons], [['split', 'split'], ['split', 'split']]);
  assert.equal((r.run('aiScanEvaluation').errors || []).some(e => /מספר העמודים/.test(e)), false);
  // איפה השורה בנייר: בתעודה שחולקה "עמוד 2" הוא החלק השני של אותו נייר
  assert.equal(r.run('aiRowPageText(aiScanResponse.scan.documents[0], aiScanResponse.scan.documents[0].rows[4])'), 'חלק 2');
  assert.equal(r.run('aiRowPageText(aiScanResponse.scan.documents[0], aiScanResponse.scan.documents[0].rows[0])'), 'חלק 1');
  // תעודה נוספת של שני חלקים — התקרה של 8 עמודים נספרת לפי החלקים
  r.context.testFull = { doc: { pageCount: 3, rows: [] } };
  assert.equal(r.run('paperScanPageCount(testFull)'), 3);
  assert.equal(r.run('paperScanPageCount({ doc: { rows: [] } })'), 1, 'קריאה שנשמרה לפני 175 — עמוד אחד');
});

test('חלקי תעודה ארוכה במסך האישור של נייר: 180° הופך את סדרם, ו"השאר תמונה מלאה" מחזיר עמוד אחד', async () => {
  const r = app(longDelivery());
  camera(r, 2);
  await shoot(r, 'a');
  await r.run('aiRotateOrientationReview(1)');
  await r.run('aiRotateOrientationReview(1)');
  assert.deepEqual(json(r, 'paperIntake.items[0].pages.map(p => [p.split.index, p.rotation, p.dataUrl])'),
    [[1, 180, 'data:image/jpeg;base64,a2@2'], [0, 180, 'data:image/jpeg;base64,a1@2']], 'ראש התעודה נשאר העמוד הראשון שנשלח');
  assert.equal(r.run('paperIntake.items[0].page === paperIntake.items[0].pages[0]'), true, 'התמונה הממוזערת — החלק הראשון');
  await r.run('aiConfirmOrientationReview()');
  await idle(r);
  assert.deepEqual(sent(r, 0), ['data:image/jpeg;base64,a2@2', 'data:image/jpeg;base64,a1@2']);
  // "השאר תמונה מלאה": הפריים המלא מחליף את החלקים
  const b = app(delivery('77001234'));
  camera(b, 2);
  await shoot(b, 'a');
  await b.run('aiRestoreOriginalImage()');
  assert.deepEqual(json(b, 'paperIntake.items[0].pages.map(p => [p.dataUrl, p.split, p.cropInfo.reason, p.orientationConfirmed])'), [['data:image/jpeg;base64,afull', null, 'full_image', false]]);
  assert.equal(b.run('paperIntake.items[0].page === paperIntake.items[0].pages[0]'), true);
  assert.equal(reviewOpen(b), true);
  await b.run('aiConfirmOrientationReview()');
  await idle(b);
  assert.deepEqual(sent(b, 0), ['data:image/jpeg;base64,afull']);
  assert.equal(state(b).per[0].pageCount, 1);
});

test('נייר שלא אישר את עצמו: כל חלקי הצילום נשמרים בטלפון, ובבדיקת הנייר רואים את כולם', async () => {
  const bad = credit('290095142');
  bad.scan.documents[0].pageCount = 2;
  bad.scan.documents[0].rows[0].quantity = 12; // לא נסגר מול "סה״כ כללי"
  const r = app(bad);
  r.run(`const imgs = {}; paperImgPut = async (k, v) => { imgs[k] = v; }; paperImgGet = async k => imgs[k] || null; globalThis.__imgs = imgs;`);
  camera(r, 2);
  await shoot(r, 'a');
  await r.run('aiConfirmOrientationReview()');
  await idle(r);
  const item = json(r, 'paperIntake.items.map(x => [x.status, x.paperId, x.captureId])')[0];
  assert.equal(item[0], 'review');
  assert.deepEqual(json(r, `globalThis.__imgs[${JSON.stringify(item[2])}]`), ['data:image/jpeg;base64,a1', 'data:image/jpeg;base64,a2']);
  await r.run(`openPaperReview(${JSON.stringify(item[1])}, ${JSON.stringify(item[2])})`);
  assert.deepEqual(json(r, '[paperReview.img, paperReview.imgs.length]'), ['data:image/jpeg;base64,a1', 2]);
  const html = r.node('app').innerHTML;
  assert.match(html, /alt="צילום הנייר — חלק 1 מתוך 2"[\s\S]*alt="צילום הנייר — חלק 2 מתוך 2"/);
  // תמונה שנשמרה לפני 175 (מחרוזת אחת) — מוצגת כמו קודם
  r.run(`globalThis.__imgs[${JSON.stringify(item[2])}] = 'data:image/jpeg;base64,old'`);
  await r.run(`openPaperReview(${JSON.stringify(item[1])}, ${JSON.stringify(item[2])})`);
  assert.deepEqual(json(r, '[paperReview.img, paperReview.imgs]'), ['data:image/jpeg;base64,old', ['data:image/jpeg;base64,old']]);
  assert.match(r.node('app').innerHTML, /alt="צילום הנייר" /);
});

test('צילום שנבנה בלי נתוני צילום (קריאה ישנה, בדיקות) — בלי שדות חדשים; צילום ישן עם page בלבד נקרא כמו קודם', async () => {
  const r = app(delivery('77001234'));
  r.run(`openPaperIntake({}); paperIntake.items = [{ captureId: 'cap0', hash: 'h0', page: { dataUrl: 'data:image/jpeg;base64,cGFwZXIw', baseDataUrl: 'data:image/jpeg;base64,cGFwZXIw', rotation: 0, orientationConfirmed: true }, status: 'photo' }];`);
  await r.run('paperIntakeRun()');
  await idle(r);
  assert.equal(r.requests.length, 1);
  assert.deepEqual(sent(r, 0), ['data:image/jpeg;base64,cGFwZXIw']);
  assert.equal('photo' in json(r, `paperLocalResults().cap0.scan`), false);
  const per = state(r).per[0];
  assert.equal(per.pageCount, 1);
  assert.equal('cropReasons' in per, false);
  assert.equal(r.run('aiRowPageText(aiScanResponse.scan.documents[0], aiScanResponse.scan.documents[0].rows[4])'), 'עמוד 1', 'תעודה רגילה — "עמוד", כמו תמיד');
});

// ===== צילום שוכב: aiCompressInvoiceImage האמיתי, עם קנבס מזויף וזיהוי שתלוי בכיוון =====
const htmlSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function source(name) {
  const m = new RegExp('^(?:async )?function ' + name + '\\(', 'm').exec(htmlSource);
  assert.ok(m, 'Missing function: ' + name);
  const eol = htmlSource.indexOf('\n', m.index);
  const end = htmlSource.slice(m.index, eol).trimEnd().endsWith('}') ? eol : htmlSource.indexOf('\n}', eol) + 2;
  return htmlSource.slice(m.index, end);
}
function constant(name) {
  const m = new RegExp('^const ' + name + ' = ([^;]+);', 'm').exec(htmlSource);
  assert.ok(m, 'Missing constant: ' + name);
  return Number(m[1]);
}
// קובץ JPEG מזערי עם תג כיוון (EXIF Orientation) — סדר בתים קטן או גדול, ואפשר עם מקטע JFIF לפני ה-EXIF
function jpegBytes(orientation, { little = true, jfif = false, exif = true } = {}) {
  const u16 = v => little ? [v & 255, v >> 8] : [v >> 8, v & 255];
  const u32 = v => little ? [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255] : [(v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255];
  const bytes = [0xFF, 0xD8];
  if (jfif) bytes.push(0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0);
  if (exif) {
    const tiff = [...(little ? [0x49, 0x49] : [0x4D, 0x4D]), ...u16(42), ...u32(8), ...u16(2),
      ...u16(0x010F), ...u16(2), ...u32(1), ...u32(0),
      ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), ...u16(0), ...u32(0)];
    const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff], length = payload.length + 2;
    bytes.push(0xFF, 0xE1, length >> 8, length & 255, ...payload);
  }
  bytes.push(0xFF, 0xDA, 0, 2, 1, 2, 3);
  return new Uint8Array(bytes).buffer;
}
const photoFile = (orientation, options) => ({ name: 'paper.jpg', slice: () => ({ arrayBuffer: async () => jpegBytes(orientation, options) }) });

// sideways: הזיהוי מוצא שורות דפוס רק כשהתמונה שהוא מקבל גבוהה מרוחבה (המקור 4000×3000 שוכב; אחרי רבע סיבוב — 3000×4000).
// textWhen: באיזה פריים הזיהוי "רואה" שורות דפוס — 'portrait' (התמונה גבוהה מרוחבה; תעודה ארוכה ששוכבת בפריים לרוחב) או
// 'landscape' (תעודה ישרה שהעמודות שלה נראות כשורות רק בעותק המסובב). box — המסגרת שעוגן הדיו מוצא (שברים של הפרוקסי),
// cropBox — המסגרת של עוגן המחזוריות (ברירת מחדל: אותה מסגרת).
function straightenContext({ sideways = true, encode = true, blank = false, size = [4000, 3000], textWhen = 'portrait', box = [0.3, 0.1, 0.4, 0.8], cropBox = null } = {}) {
  // התמונה המסובבת נקראת בגודל שבו נבנתה (rotatedSize — לפי הקנבס שקודד)
  const images = new Map([['source', { naturalWidth: size[0], naturalHeight: size[1] }], ['rotated', { naturalWidth: size[1], naturalHeight: size[0] }]]);
  const rotations = [], blobs = [], canvases = [];
  let seq = 0;
  const names = ['aiCompressInvoiceImage', 'aiStraightenSideways', 'aiRotatedSourceCanvas', 'aiExifOrientation', 'aiExifOrientationFromBytes', 'aiRenderInvoiceRegion',
    'aiDetectPaperRegion', 'aiMeasurePageQuality', 'aiQualityAdvice', 'aiNormalizeQuarterTurns', 'aiPlanLongReceiptSplit', 'aiUpdateOrientationControls', 'aiDrawCropMap', 'aiSplitSkipText'];
  const frac = (b, pw, ph) => ({ x: Math.round(pw * b[0]), y: Math.round(ph * b[1]), width: Math.round(pw * b[2]), height: Math.round(ph * b[3]) });
  const nodes = new Map();
  const node = id => { if (!nodes.has(id)) nodes.set(id, { id, textContent: '', innerHTML: '', width: 84, height: 63, classList: { toggle() {}, add() {}, remove() {} }, getContext: () => null }); return nodes.get(id); };
  class FakeFile { constructor(parts, name, options) { this.parts = parts; this.name = name; this.type = options && options.type; this.rotated = true; } }
  const c = vm.createContext({ console, Number, Math, Array, Object, String, Promise, Date, DataView, File: FakeFile,
    Uint8ClampedArray, Uint8Array, Uint32Array, Float32Array, Float64Array,
    AI_INVOICE_MAX_SIDE: constant('AI_INVOICE_MAX_SIDE'), AI_CROP_PROXY_SIDE: constant('AI_CROP_PROXY_SIDE'), AI_STRAIGHTEN_MAX_SIDE: constant('AI_STRAIGHTEN_MAX_SIDE'), AI_STRAIGHTEN_MAX_PIXELS: constant('AI_STRAIGHTEN_MAX_PIXELS'),
    AI_STRAIGHTEN_MIN_ASPECT: constant('AI_STRAIGHTEN_MIN_ASPECT'),
    AI_SPLIT_MIN_PITCH: constant('AI_SPLIT_MIN_PITCH'), AI_SPLIT_MAX_PARTS: constant('AI_SPLIT_MAX_PARTS'), AI_SPLIT_MIN_SOURCE_GAIN: constant('AI_SPLIT_MIN_SOURCE_GAIN'),
    aiOrientationSession: null, $: node,
    aiReadFile: async file => file && file.rotated ? 'rotated' : 'source',
    aiLoadImage: async url => { assert.ok(images.has(url), url); return images.get(url); },
    aiEnhanceDocumentPixels: () => false,
    aiCanvasToInvoiceJpeg: canvas => { const dataUrl = 'encoded-' + (++seq) + '-' + canvas.width + 'x' + canvas.height; return { dataUrl, bytes: 100 }; },
    // שני העוגנים מסכימים על מסגרת הנייר — רק כשהתמונה זקופה (גבוהה מרוחבה). בלי מרווח שורות (P), ולכן בלי חלוקה.
    // blank: הצילום המסובב המלא יצא ריק (הזיהוי רואה את הפיקסלים שלו — כולם לבנים) — רק העותק המוקטן הראה טקסט
    aiTextAnchorBox: (luma, pw, ph) => sideways && (textWhen === 'portrait' ? ph > pw : pw > ph) && !(blank && luma[0] === 255) ? frac(box, pw, ph) : null,
    aiTextCropBox: (luma, pw, ph) => sideways && (textWhen === 'portrait' ? ph > pw : pw > ph) && !(blank && luma[0] === 255) ? { box: frac(cropBox || box, pw, ph) } : null,
    document: { createElement: tag => {
      assert.equal(tag, 'canvas');
      const canvas = { width: 0, height: 0, draws: [], turns: [] };
      canvases.push(canvas);
      canvas.getContext = () => ({ fillRect() {}, translate() {}, putImageData() {},
        rotate: angle => { canvas.turns.push(angle); rotations.push({ angle, width: canvas.width, height: canvas.height }); },
        drawImage: (...args) => canvas.draws.push(args),
        // הפיקסלים של קנבס שצויר מהצילום המסובב ("rotated") לבנים לגמרי כש-blank — כך הזיהוי מבדיל ביניהם
        getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(canvas.draws.some(args => args[0] === images.get('rotated')) && blank ? 255 : 200) }) });
      canvas.toBlob = (done, type, quality) => { const blob = encode ? { type, quality, width: canvas.width, height: canvas.height } : null; if (blob) blobs.push(blob); done(blob); };
      return canvas;
    } }
  });
  vm.runInContext(names.map(source).join('\n'), c);
  return { c, rotations, blobs, canvases, node };
}

test('צילום שוכב: לא נמצא טקסט, ובסיבוב נמצא — הצילום מסובב לפני החיתוך (ימינה), נחתך, ומסומן שיושר לבד', async () => {
  const { c, rotations, blobs, node } = straightenContext();
  const file = photoFile(1);
  const page = await c.aiCompressInvoiceImage(file);
  assert.equal(Array.isArray(page), false);
  assert.equal(page.autoRotated, 90, 'רבע סיבוב ימינה (תג כיוון 1 — המצלמה חשבה "לרוחב")');
  assert.equal(page.sourceBlob.rotated, true, 'המקור לכל המשך (חיתוך ידני, שחזור) הוא הצילום המסובב');
  assert.equal(page.sourceBlob.name, 'paper.jpg');
  assert.deepEqual([page.autoCropped, page.cropInfo.reason], [true, 'cropped'], 'אחרי הסיבוב הנייר זוהה ונחתך');
  assert.deepEqual(JSON.parse(JSON.stringify(page.sourceRegion)), { x: 901, y: 400, width: 1200, height: 3200 }, 'המסגרת בצירים של הצילום המסובב (3000×4000)');
  // הבדיקה על עותק מוקטן (1125×1500), ואז הצילום המלא (3000×4000) — שניהם ברבע סיבוב ימינה
  assert.deepEqual(rotations.map(x => [Math.round(x.angle / (Math.PI / 2)), x.width, x.height]), [[1, 1125, 1500], [1, 3000, 4000]]);
  assert.deepEqual(blobs, [{ type: 'image/jpeg', quality: 0.97, width: 3000, height: 4000 }]);
  // מסך האישור אומר זאת ראשון
  c.aiOrientationSession = { page, reviewOnly: false, cropMode: false, paper: true };
  c.aiUpdateOrientationControls();
  assert.match(node('aiOrientationHint').textContent, /^הצילום יצא שוכב ויושר לבד — ודא שהכותרת למעלה \(הפוך\? סובב פעמיים\)\. השוליים נחתכו אוטומטית\./);
  // צילום שלא יושר — בלי המשפט
  c.aiOrientationSession = { page: { ...page, autoRotated: 0 }, reviewOnly: false, cropMode: false, paper: true };
  c.aiUpdateOrientationControls();
  assert.match(node('aiOrientationHint').textContent, /^השוליים נחתכו אוטומטית\./);
});

test('צילום שוכב עם תג כיוון 3 (המצלמה חשבה "לרוחב" לצד השני) — רבע סיבוב שמאלה; בלי תג — ימינה', async () => {
  const left = straightenContext();
  const page = await left.c.aiCompressInvoiceImage(photoFile(3, { little: false, jfif: true }));
  assert.equal(page.autoRotated, 270);
  assert.deepEqual(left.rotations.map(x => Math.round(x.angle / (Math.PI / 2))), [1, 3], 'הבדיקה תמיד ימינה; הצילום המלא — שמאלה');
  const none = straightenContext();
  assert.equal((await none.c.aiCompressInvoiceImage({ name: 'gallery.jpg' })).autoRotated, 90, 'קובץ בלי תג (גלריה, צילום מסך)');
  const portrait = straightenContext();
  assert.equal((await portrait.c.aiCompressInvoiceImage(photoFile(6))).autoRotated, 90, 'תג אחר — ברירת המחדל');
});

test('צילום שאינו שוכב, סיבוב שנכשל ומסלול השחזור — הצילום נשאר כפי שצולם', async () => {
  // לא נמצא טקסט גם אחרי הסיבוב (דפוס חיוור, לא תעודה): תמונה מלאה, בלי סיבוב ובלי קידוד נוסף
  const plain = straightenContext({ sideways: false });
  const page = await plain.c.aiCompressInvoiceImage(photoFile(1));
  assert.deepEqual([page.autoRotated, page.cropInfo.reason, page.autoCropped, !!page.sourceBlob.rotated], [undefined, 'no_text', false, false]);
  assert.deepEqual(plain.blobs, []);
  assert.deepEqual(plain.rotations.map(x => [x.width, x.height]), [[1125, 1500]], 'רק הבדיקה על העותק המוקטן');
  // הצילום המסובב לא נבנה (אין זיכרון): ממשיכים עם הצילום כפי שהוא
  const failed = straightenContext({ encode: false });
  const kept = await failed.c.aiCompressInvoiceImage(photoFile(1));
  assert.deepEqual([kept.autoRotated, kept.cropInfo.reason, !!kept.sourceBlob.rotated], [undefined, 'no_text', false]);
  // מסלול השחזור (forceFullFrame) לא בודק ולא מסובב
  const restore = straightenContext();
  const full = await restore.c.aiCompressInvoiceImage(photoFile(1), true);
  assert.deepEqual([full.autoRotated, full.cropInfo.reason], [undefined, 'full_image']);
  assert.deepEqual(restore.rotations, []);
  // הצילום המסובב יצא ריק (קנבס גדול מדי בדפדפן, קידוד שנכשל בשקט): בו עצמו לא נמצא טקסט — נשארים עם הצילום כפי שצולם
  const empty = straightenContext({ blank: true });
  const asShot = await empty.c.aiCompressInvoiceImage(photoFile(1));
  assert.deepEqual([asShot.autoRotated, asShot.cropInfo.reason, !!asShot.sourceBlob.rotated], [undefined, 'no_text', false]);
  assert.equal(empty.blobs.length, 1, 'הצילום המסובב נבנה, נבדק, ונזנח');
});

test('צילום ענק: הצילום המסובב מוקטן כך שהקנבס שלו לא עובר את מגבלת השטח של הדפדפן', async () => {
  const huge = straightenContext({ size: [8000, 6000] });
  const page = await huge.c.aiCompressInvoiceImage(photoFile(1));
  assert.equal(page.autoRotated, 90);
  const blob = huge.blobs[0];
  assert.ok(blob.width * blob.height <= 4096 * 4096, 'מתחת למגבלת הקנבס של Safari (16.7 מיליון פיקסלים): ' + blob.width + '×' + blob.height);
  assert.ok(Math.max(blob.width, blob.height) <= 5600);
  assert.ok(Math.abs(blob.width / blob.height - 6000 / 8000) < 0.01, 'היחס נשמר');
  assert.ok(blob.height >= 4600, 'ועדיין מספיק לשני חלקים של 1850 פיקסל (' + blob.height + ')');
});

test('מהסקירה: תעודה ישרה לעולם לא מסובבת — פריים לאורך, נייר קצר, עוגנים שלא הסכימו', async () => {
  // תעודה ישרה וקצרה בצילום לאורך: בה עצמה לא נמדדו שורות (מעט מדי), ובעותק המסובב העמודות של הדפוס נראות כשורות.
  // עד התיקון היא סובבה לצד ונשלחה למודל שוכבת.
  const portrait = straightenContext({ size: [3000, 4000], textWhen: 'landscape' });
  const kept = await portrait.c.aiCompressInvoiceImage(photoFile(1));
  assert.deepEqual([kept.autoRotated, kept.cropInfo.reason], [undefined, 'no_text'], 'פריים לאורך — המצלמה ידעה איפה למעלה');
  assert.deepEqual(portrait.blobs, []); assert.deepEqual(portrait.rotations, [], 'אפילו בלי לבדוק עותק מסובב');
  // פריים לרוחב, אבל המסגרת שנמצאה בעותק המסובב אינה רצועה ארוכה (נייר קצר: גבוה בערך כרוחבו) — בלי סיבוב
  const short = straightenContext({ box: [0.2, 0.25, 0.6, 0.5] });
  const shortPage = await short.c.aiCompressInvoiceImage(photoFile(1));
  assert.deepEqual([shortPage.autoRotated, shortPage.cropInfo.reason], [undefined, 'no_text']);
  assert.deepEqual(short.blobs, [], 'הצילום המסובב לא נבנה בכלל');
  // בעותק המסובב שני העוגנים לא מסכימים על המסגרת — בלי סיבוב
  const disagree = straightenContext({ cropBox: [0.05, 0.05, 0.3, 0.9] });
  const disagreePage = await disagree.c.aiCompressInvoiceImage(photoFile(1));
  assert.deepEqual([disagreePage.autoRotated, disagreePage.cropInfo.reason], [undefined, 'no_text']);
  assert.deepEqual(disagree.blobs, []);
  // רצועה ארוכה ששוכבת בפריים לרוחב — כן (1.4 ומעלה)
  const tall = straightenContext({ box: [0.3, 0.1, 0.4, 0.6] });
  assert.equal((await tall.c.aiCompressInvoiceImage(photoFile(1))).autoRotated, 90);
});

test('מהסקירה: הקשה כפולה על "אשר" לא מאשרת את הצילום הבא שנפתח מתחת לאצבע (וגם לא "מחק צילום")', async () => {
  const r = app(delivery('77001234'));
  camera(r);
  await r.run(`paperPhotoFiles([{ name: 'a' }, { name: 'b' }])`);
  assert.equal(reviewOpen(r), true);
  const confirmTap = r.events.get('aiOrientationConfirm:click'), cancelTap = r.events.get('aiOrientationCancel:click');
  const opened = () => json(r, 'aiOrientationSession && paperIntake.items.findIndex(x => paperItemPages(x).includes(aiOrientationSession.page))');
  assert.equal(opened(), 0);
  await confirmTap({});
  // הצילום הבא נפתח מיד (setTimeout) — ההקשה השנייה של אותה הקשה כפולה נוחתת עליו
  r.callbacks.splice(0).forEach(fn => fn());
  assert.equal(opened(), 1, 'הצילום השני פתוח');
  await confirmTap({});
  await cancelTap({});
  assert.equal(opened(), 1, 'ההקשה השנייה לא נחשבה — לא אישור ולא מחיקה');
  assert.deepEqual(json(r, 'paperIntake.items.map(x => paperItemConfirmed(x))'), [true, false]);
  // אחרי שעבר זמן (אדם שהסתכל על הצילום) — הלחיצה נחשבת
  r.run('aiOrientationClosedAt -= 1000');
  await confirmTap({});
  assert.deepEqual(json(r, 'paperIntake.items.map(x => paperItemConfirmed(x))'), [true, true]);
  assert.equal(r.run('aiOrientationSession'), null);
});

test('הגרסה 175 ומעלה, כולל ההערה ב-service worker', () => {
  const v = htmlSource.match(/const APP_VERSION = '(\d+)'/)[1];
  assert.ok(Number(v) >= 175, v);
  assert.match(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), new RegExp('גרסת אפליקציה ' + v));
});

test('תג הכיוון נקרא מקובץ JPEG: שני סדרי הבתים, מקטע JFIF לפניו, קובץ בלי EXIF וקובץ שאינו JPEG', async () => {
  const { c } = straightenContext();
  const read = (orientation, options) => c.aiExifOrientationFromBytes(new DataView(jpegBytes(orientation, options)));
  for (const value of [1, 3, 6, 8]) {
    assert.equal(read(value), value);
    assert.equal(read(value, { little: false }), value);
    assert.equal(read(value, { jfif: true }), value);
  }
  assert.equal(read(9), 0, 'ערך שאינו כיוון');
  assert.equal(read(1, { exif: false }), 0);
  assert.equal(c.aiExifOrientationFromBytes(new DataView(new Uint8Array([0x89, 0x50, 0x4E, 0x47, 1, 2, 3, 4]).buffer)), 0, 'PNG');
  assert.equal(c.aiExifOrientationFromBytes(new DataView(new ArrayBuffer(0))), 0);
  assert.equal(await c.aiExifOrientation(photoFile(3)), 3);
  assert.equal(await c.aiExifOrientation({ name: 'no-slice' }), 0);
  assert.equal(await c.aiExifOrientation({ slice: () => ({ arrayBuffer: async () => { throw new Error('read'); } }) }), 0);
});
