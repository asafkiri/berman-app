// v144 — סימולציה של חודשי עבודה שלמים מול המאזן, על האפליקציה כולה (harness), עם תשובה ידועה מראש.
// כל הנתונים מומצאים (מוצרי הקטלוג מ-tests/ledger-2026-10.json, ומבצע מחיר קבוע על ברמן אקטיב כמו אצל המשתמש);
// הגיבוי של המשתמש אינו במאגר.
// כל תרחיש: משלוח בכל יום חוץ משבת; החזרה כל כמה ימים מהמוצרים שחוזרים בפועל; הנהג לוקח בביקור הבא (לפעמים מדלג
// ביקור) ומדפיס נייר זיכוי לכל החזרה — לפעמים בשני ניירות (השלמה באותו יום או בביקור הבא), ולפעמים מזכה מוצר דומה
// במקום (חלה מרובעת/קלועה, אחיד פרוס ברמן/ודש, חלומית אישית/בייגל באותו מחיר; דגני קלות/ברמן אקטיב — מחיר שונה
// במבצע). מצלמים במנות, באותו יום או אחרי יום-יומיים. "לאיזו החזרה?" — עונים מיד ונכון (כמו המשתמש).
// נבדק בכל יום של החודש:
// - כשהכל זוכה (גם בהחלפה): אין שום דבר "לטיפול" במאזן — חוץ מהחלפה במחיר שונה (עם "מקבל את ההחלפה"), והחזרה
//   שנייר ההשלמה שלה עוד לא צולם (חוסר מיד, בכוונה — v141). החזרה שממתינה לנייר — ממתינה לכל מה שהוחזר בה.
// - כשבנייר חסרה שורה או חלק משורה: החוסר מוצג על ההחזרה הנכונה, במוצר ובכמות הנכונים, ולא שום דבר אחר.
// עד v143: ב-37% מהחודשים שבהם הכל זוכה הופיעה התראת שווא באדום (החלפה שחוזרת, החלפות הפוכות, החזרה מאותו יום).
// הרצה: TZ=Asia/Jerusalem node --test tests/ledger-sim.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { app, month, replay } from './ledger-sim-helpers.mjs';

const SEEDS = n => Array.from({ length: n }, (_, i) => 1 + i * 7);
test('חודשים שבהם הכל זוכה (גם בשני ניירות ובהחלפה באותו מחיר) — אין שום התראת שווא, באף יום', () => {
  const bad = SEEDS(40).map(seed => [seed, replay(month(seed, 0))]).filter(([, w]) => w.length);
  assert.deepEqual(bad.map(([seed, w]) => 'חודש ' + seed + ' — ' + w.slice(0, 3).join(' | ')), []);
});

test('חודשים שבהם לחלק מהניירות חסרה שורה — כל חוסר מוצג על ההחזרה, המוצר והכמות הנכונים, ושום דבר אחר', () => {
  let shorts = 0;
  const bad = SEEDS(40).map(seed => { const S = month(seed + 3, 0.5); shorts += S.truth.shorts.length; return [seed, replay(S)]; }).filter(([, w]) => w.length);
  assert.ok(shorts > 30, 'נבדקו ' + shorts + ' חוסרים');
  assert.deepEqual(bad.map(([seed, w]) => 'חודש ' + seed + ' — ' + w.slice(0, 3).join(' | ')), []);
  assert.equal(app.context.testWrites.length, 0, 'תצוגה בלבד');
});

// v150 — אותם חודשים בדיוק, אבל בחצי מהביקורים שבהם ממתינות כמה החזרות הנהג מדפיס להן נייר אחד (כמו נייר 95955 מ-22.10,
// שזיכה את ההחזרות מ-20.10 ומ-21.10). עד v149: ב-18 מ-40 החודשים שבהם הכל זוכה — התראת שווא, "לאיזו החזרה?", או החזרה
// שנשארה "ממתינה לזיכוי" אחרי שהנייר שלה צולם (הבדיקה הזו נוספה ב-v150: replay)
test('נייר אחד לכמה החזרות, כשהכל זוכה (גם בהחלפות) — כל ההחזרות שבו "זוכתה", בלי שאלה ובלי התראת שווא', () => {
  let combined = 0;
  const bad = SEEDS(40).map(seed => { const S = month(seed, 0, { combine: 0.5 }); combined += S.papers.filter(p => p.rids.length > 1).length; return [seed, replay(S)]; }).filter(([, w]) => w.length);
  assert.ok(combined > 15, 'נבדקו ' + combined + ' ניירות של כמה החזרות');
  assert.deepEqual(bad.map(([seed, w]) => 'חודש ' + seed + ' — ' + w.slice(0, 3).join(' | ')), []);
});

// כשבנייר של כמה החזרות חסרה שורה: החוסר מוצג נכון (מוצר שמשותף לכמה מהן — על אחת מהן, בסכום הנכון). מה שעוד לא נפתר
// לבד — רק נייר שיש בהחזרות שלו שני דברים לפחות (חוסר והחלפה, או כמה חוסרים): עד v149 נכשלו 13 מ-40 החודשים, עכשיו 3
test('נייר אחד לכמה החזרות, כשחסרה בו שורה — החוסר מוצג נכון; מה שלא נפתר לבד — רק נייר עם שני חוסרים או החלפות לפחות', () => {
  let combined = 0;
  const hard = S => S.papers.some(p => p.rids.length > 1 && S.truth.shorts.concat(S.truth.swaps).filter(x => p.rids.indexOf(x.ret) !== -1).length >= 2);
  const bad = SEEDS(40).map(seed => { const S = month(seed + 3, 0.5, { combine: 0.5 }); combined += S.papers.filter(p => p.rids.length > 1).length; return [seed, replay(S), S]; }).filter(([, w]) => w.length);
  assert.ok(combined > 15, 'נבדקו ' + combined + ' ניירות של כמה החזרות');
  assert.deepEqual(bad.filter(([, , S]) => !hard(S)).map(([seed, w]) => 'חודש ' + seed + ' — ' + w.slice(0, 3).join(' | ')), []);
  assert.ok(bad.length <= 3, bad.length + ' חודשים');
  assert.equal(app.context.testWrites.length, 0, 'תצוגה בלבד');
});
