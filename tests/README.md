# בדיקות

## v100: שתי תעודות שצולמו ככרטיס אחד

```sh
node tests/paper-anchors.test.mjs
node --test tests/separate-documents.test.mjs
```

המקרה מ-20.9.2026: תעודת משלוח (8 שורות · 63 יח׳ · ₪388.11) ותעודה שנייה
(שורה אחת · 8 יח׳ · ₪39.30) צולמו כשני עמודים של כרטיס אחד, והשער הכריז
"פער של 3908 אג׳ — כמעט תמיד אחוז הנחה שהתיישן".

`paper-anchors` (סעיף 10, על הפונקציות עצמן): התעודה הממוזגת נכשלת בשלושת
העוגנים; העמוד הראשון נסגר לבדו ולכן הפיצול מזוהה מבנית, בלי אזהרה מהמודל;
הודעה אחת שאומרת מה קרה ומה לעשות, בלי הפניה לאחוז ההנחה; שני כרטיסים לצילום
הבא; מפוצל לשניים — שתי התעודות עוברות; פער עיגול בעמוד הראשון אינו מסתיר את
הפיצול; תעודה אמיתית של שני עמודים אינה מפוצלת; שורה שפוספסה בתעודה
דו-עמודית משאירה את ההודעות המספריות; שורות בלי מספרי עמודים — ההתנהגות
הישנה; דיווח `separateDocuments` מהשרת (SERVICE_VERSION 6) מכריע גם כשהעמוד
הראשון אינו נסגר לבדו, ותעודה שדווחה כך לעולם אינה מאומצת בשקט; במקבץ הפיצול
מיוחס לתעודה הנכונה; והערות המודל נאספות למסך הקליטה. אחרי סקירה נוספו:
דיווח על עמוד 1, עמוד שדווח פעמיים, ודיווח שנושא את מספר התעודה עצמה —
אינם פיצול; דיווח שכל השורות סותרות (התעודה נסגרת עם העמוד המדווח) — אינו
פיצול; דיווח בלי שורות בעמוד הנוסף נאמר במילים ולא כ"0 שורות"; אחוז הנחה
חסר אינו מסתיר את הפיצול וההנחה החסרה נשארת משימה; כשהעמוד הראשון אינו נסגר
לבדו ההודעות המספריות נשארות, בלי ההפניה לאחוז ההנחה (עוגן מדויק שנכשל כבר
מסביר את הכסף) ועם רמז לשתי תעודות; עמודים נוספים בלי דיווח הם "תעודה אחרת
אחת לפחות"; ו"לא ניתן לאמת את הקריאה" של השרת נשמט כשהפיצול מסביר אותו.

`separate-documents` (על מודול האפליקציה המלא, כמו v70): לחיצה על "פענח
תעודה — הכמויות נבדקות ידנית" עם שני צילומים בכרטיס אחד מציגה את ההסבר ואת
הערות המודל (שעד כאן לא הוצגו בשום מקום), בלי אחוז הנחה ובלי כפתורי אישור
כמויות; ההסבר שורד טעינה מחדש בלי בקשה נוספת; "צלם את התעודות מחדש" נפתח עם
כרטיס לכל תעודה (ואחרי כשל רגיל — עם כרטיס אחד); אותן שתי תעודות בשני
כרטיסים עוברות את השער כשתי תעודות חיוב; תעודה אמיתית של שני עמודים עוברת;
דיווח שרת על פיצול חוסם גם כשהמודל השמיט את שורות העמוד השני; הפיצול אינו
נבלע במסלול "אשלים מול הספק בהמשך" של אחוז הנחה חסר (הכפתור מוחלף בהפניה
לצילום מחדש, ו-`bermanQuantityPaperState` מחזיר null); מול שרת v5 דיאלוג
אישור העוגנים אינו נפתח לתעודה מפוצלת; ועמוד ראשון שאינו נסגר לבדו משאיר את
ההודעות המספריות בלי ההפניה לאחוז ההנחה ועם רמז לשתי תעודות.

## v91: תחזית המרכזת בשלוש צורות החיוב

```sh
node --test tests/month-end-forecast.test.mjs
```

שתי השאלות שהבדיקה עונה עליהן, בשני הכיוונים:

- **מבצע שירד בתעודה** — שילמת כבר את מחיר המבצע, ולכן הקיזוז הצפוי הוא
  **₪0**. אין קיזוז כפול. (עבד גם קודם, ומאומת כאן.)
- **מבצע שלא ירד כלל, מחירון מלא** — הקיזוז הצפוי הוא **כל הדרך** ממחיר
  המחירון למחיר המבצע.

הקיזוז נגזר תמיד מ־`monthEndUnitRebate` = המחיר שחויב פחות מחיר המבצע, ולכן
הוא נכון מאליו בשלוש הצורות — **אבל רק אם `unitPrice` הוא המחיר שחויב
בפועל**. עד v90 שורה שחויבה במחירון מלא נשמרה דווקא במחיר הרגיל, ולכן:

| | v90 | v91 |
|---|---|---|
| מחיר השורה | ₪12.05 | ₪17.21 |
| סכום התעודה מול הנייר | פער פתוח ₪41.30 | נסגר |
| קיזוז צפוי במרכזת | ₪16.38 | ₪57.68 |

(תעודת 1.9.2026 האמיתית.) שים לב ל־`aiPaperPriceOnly`: בלעדיו המחירון המלא
היה נכתב בחזרה אל מחיר המוצר במאגר ומרעיל כל תעודה הבאה — יש בדיקה ייעודית.

`monthEndPendingCorrections` משלים את ההפרש בתעודות שנשמרו לפני התיקון,
מתוך הרשומה ששמורה בתעודה עצמה. ההשלמה נמדדת מול המחיר שרשום בשורה, ולכן
בתעודה שנשמרה אחרי התיקון היא יוצאת אפס מעצמה — אין ספירה כפולה.

## v89: שלוש צורות המחיר מוכרעות לפי שורה, וזיכוי במקבץ

```sh
node tests/promo-credit-form.test.mjs
node --test tests/promo-credit-receiving.test.mjs
```

שתי הבדיקות סוגרות את התקלה מ־16.9.2026: תעודת משלוח שבה מוצר הגיע כבר
במחיר המבצע, ולצידה תעודת זיכוי שמבטלת מוצר אחר במלואו. המסך הראה "עודף
₪34.21" ונעל את הסגירה, בזמן שכל שורה בתעודה חויבה נכון.

שני שורשים, ושניהם מכוסים:

1. **הצורה לא הגיעה לכסף.** "מבצע שירד בתעודה" חי רק בשדה צדדי
   (`__bermanPaperLineTotalExVat`), בזמן שבדיקת סכום המסמך קוראת את
   `lineTotalExVat`. מעכשיו `bermanPriceForm` מכריע פעם אחת, לפי שורה, וכל
   צרכני הכסף קוראים ממנו. "מחירון מלא" נשאר מוכרע מהחשבון ברמת המסמך —
   אצל ברמן עמודת "מחיר" מדפיסה את המחירון בכל שורה, ולכן היא אינה ראיה.
2. **זיכוי נספר בסימן הפוך.** `aiPriceGapContext` חיבר שורות זיכוי בזמן
   ש"נטו הנייר" הפחית אותן, ולכן זיכוי הזיז את הפער בכפל ערכו.

`promo-credit-form` רץ על הפונקציות עצמן (מתאם → שער הצילום → הסבר הפער);
`promo-credit-receiving` רץ על המודול המלא, כולל ההחלה ותיעוד המבצע על
השורה. שתיהן בודקות גם את הכיוון ההפוך: חוסר כסף אמיתי, זיכוי בסכום שאינו
נתמך בנייר, ומחירון מלא שעדיין שומר על קיזוז המרכזת.

**v90** סוגר את השארית שנראתה על המסך: `openReconcile` תמחר את השורות לפי
המאגר גם אחרי שהסריקה הכריעה אחרת, ולכן הפאנל העליון הכריז "עודף ₪34.21"
בדיוק מעל "הכול תקין". הכלל שנכתב ב-v61 עבור ההכרעה הידנית — "מסך ההשוואה
חייב לעבוד על אותו מחיר, אחרת הוא ימציא מחדש את אותו פער שנסגר רגע קודם" —
חל מעכשיו גם על הכרעת הסריקה. `bermanRepriceReconcileFromScan` נוגע במחיר
בלבד: לא בכמויות, לא בסימוני הבדיקה, ולא בשורות שהסריקה לא הכריעה.

## v84: מחירי מבצע מהנייר בלי שאלת חיוב נוספת

`node --test tests/verified-promotion-finish.test.mjs` בודק את מסלול הסיום
במודול המלא: כל תשעת הצירופים של מחיר מלא, הנחה קבועה ומחיר מבצע עבור
שני מוצרים; אישור כמויות ידני, סריקת מוצרים ושחזור טיוטה. המחיר המודפס,
המחירים במאגר והסכומים בכל תעודה חייבים לתמוך בחיוב. סכום תואם לבדו אינו
עוקף מחיר שונה, הנחה חסרה, מבצע שפג או הפרש בכמויות. קיזוז המרכזת נשמר
לפי החיוב בפועל, בלי קיזוז נוסף על מבצע שכבר ירד בתעודה.

הבדיקה הפרטית האופציונלית משתמשת ב־`BERMAN_DISCOUNT_BACKUP` ומדמה הנחה
של 8% שנמסרה מהספק. היא אינה מסיקה הנחה ואינה משנה נתוני משתמש אמיתיים.

## v83: תעודה פתוחה עד להשלמת הנחה מהספק

`node --test tests/missing-discount.test.mjs tests/manual-quantities.test.mjs`
בודק את מודול האפליקציה המלא: הזנת אחוז שאושר מול הספק או דחיית הבירור,
בדיקת כמויות עצמאית, שמירה פתוחה בסימון סגול, שחזור טיוטה והשלמה בהיסטוריה.
המחירים והמבצעים שנשמרו עם התעודה משמשים לחישוב המאוחר; הכמויות שנבדקו
נשמרות. חוסר, עודף או פער כספי אמיתי ממשיכים להשאיר את התעודה פתוחה.
שמירת ההנחה בכרטיס המוצר ועדכון התעודה הם פעולת ענן אטומית אחת.

הבדיקות החליפו את מסלול ההסקה והשאלות על חיוב המבצעים של v81–v82,
שהוסר בעקבות שינוי הדרישה: המשתמש מזין מידע מהספק ואינו מתבקש לנחש
איזה חישוב של המבצע בוצע. אחוז חסר אינו אפס ואינו מחיר מאומת.

לשחזור המקרה מגיבוי פרטי, בלי להעלות את תוכנו לריפו:

```sh
BERMAN_DISCOUNT_BACKUP=/path/to/backup.json node --test tests/missing-discount.test.mjs
```

בדיקת דפדפן חזותית לא הושלמה בסביבת הפיתוח: פתיחת התצוגה המקומית נחסמה
ב־`ERR_BLOCKED_BY_CLIENT`. בדיקות המסכים, הבחירה, הכפתורים והשמירה רצות
ב־harness הקיים; הן אינן בדיקה במכשיר iPhone או Android אמיתי.

```
node tests/promo-on-paper.test.mjs
```

אין תלויות ואין שלב בנייה — רק Node. הבדיקות שולפות את הפונקציות **בשמן מתוך
`index.html`** ומריצות אותן כמו שהן (`extract.mjs`), כדי שלא ייווצר עותק של
הלוגיקה שמתיישן בשקט. פונקציה שנמחקה או שונתה מפילה את הריצה עם `חסר ב-index.html`.

## למה אין כאן גיבוי אמיתי

הריפו ציבורי. `fixture.json` מכיל **מוצרים ומבצעים בלבד** — המחירים שבו כבר
מפורסמים בטבלה שב-README הראשי — ואין בו תעודות, כמויות או אנשי קשר. הכמויות
של כל תרחיש כתובות בתוך קובץ הבדיקה.

כדי לאמת מול נתונים אמיתיים בלי לפרסם אותם, מריצים את אותן בדיקות על קובץ גיבוי
מקומי:

```
node tests/promo-on-paper.test.mjs --backup ~/Downloads/bermanbackup.json
```

במצב הזה שורות התעודה נלקחות מהתעודה האמיתית של אותו תאריך. שווה להריץ כך אחרי
כל שינוי בחישוב הכסף, ובמיוחד אחרי חודש שבו ברמן שינו משהו במבצעים.

## מה מכוסה

`credit-split.test.mjs` — תעודת זיכוי אחת שסוגרת גם חזרות וגם חוסר של תעודת
קליטה אחרת (v66): סיבולת העיגול של זיכוי חוסר על גבולותיה, הבלש שמחפש לאיזה
חוסר שייך העודף שעל הנייר (ומתי הוא מסרב לנחש), הכיוון ההפוך מכרטיס החוסר,
חשבון הכסף אחרי השיוך, ושתי הרשומות התאומות. בסופו גם בדיקת חיווט סטטית: כל
`data-role` שנפלט חייב מטפל, וחלון שיושב מחוץ ל-`#app` חייב מאזין משלו.
המסמכים בתרחיש נבנים בקובץ עצמו; `--backup` מזרים לתוכם את מחירי הקטלוג
האמיתיים.

`returns-carry.test.mjs` — החזרת פריטים מתעודת חזרות שנותר בה פער אל רשימת
החזרות הפתוחה (v78): מה נכנס לתוכנית ההחזרה ובאיזה מחיר, מתי אין מה להחזיר,
צריכת הרישום משורות החוסר (מלאה, חלקית ולא-תואמת), פער כספי בלי שורה חסרה,
החיים המשותפים עם שיוך הזיכוי של v66, הסימון ברשימה ואי-הספירה בניתוח,
וחיווט התפקידים. הסעיף האחרון רץ **על מודול האפליקציה המלא** (harness של
v70): הלחיצה על הכפתור, האישור, הכתיבה לענן, השורה שנכנסה לרשימה, התעודה
הבאה שנושאת אותה, והביטול.

`paper-anchors.test.mjs` — שער האמון של זרימת הצילום-תחילה (v62): מתי מותר
לקבל את שלושת העוגנים מהנייר עצמו, ומה נאמר כשלא. רץ על תשובות סריקה
סינתטיות (בגרסאות שלפני v70 גיבוי לא שמר את גוף התשובה של הפענוח).
**v79** הוסיף כאן את סיבולת העיגול על כל גבולותיה: 30 אג' עוברות ו-31 נדחות
כששני העוגנים המדויקים סגורים, עוגן פתוח (יחידות, שורות, או שדה שלא נקרא)
מחזיר את סיבולת הבסיס של 2 אג' לשורה, הפער של 21 אג' על 10 שורות שהוליד
את הגרסה עובר ונשמר לתצוגה, וההודעה על חריגה נוקבת בפער, בסף שנחרג
ובאחוז ההנחה כסיבה.


`return-unsend.test.mjs` — שני המסלולים החדשים בכרטיס תעודת חזרות שטרם
אומתה (v80): "אישור" שרושם את מה שהוחזר בלי הקלדה (כולל המקרה שבו חלק
מהנייר שויך לחוסר בקליטה), ו"החזר את הפריטים לרשימת החזרות" שמוחק את
התעודה ומחזיר את שורותיה — האיחוד לשורה אחת, שורת הפיקדון שאינה חוזרת,
שורה ידנית ושורת פער ששומרות את מחירן וסימונן, הביטול שמוריד בדיוק את מה
שנוסף, החיווט, ושלושה תרחישי מקצה-לקצה במודול האפליקציה המלא.

`no-doc-receipt.test.mjs` — קליטה בלי תעודה (v63): מתי תעודה נחשבת "ממתינה
לנייר", שהיא אינה ממציאה הפרשים משל עצמה, ושברגע שהנייר מצורף כל מכונת
ההשוואה חוזרת לעבוד עליה בדיוק כמו על כל תעודה אחרת.

`product-matrix.test.mjs` — הפירוט לפי מוצר × ימים במרכזת (v64, הורחב
ב-v65): מבנה העמודות ואות היום, מיון הקודים כמחרוזת כמו בחשבונית, ההחזרה
שיושבת בתא של אותו יום, הכסף היומי לכל פריט שנפתח מתחת למוצר, מה לא נכנס
לטבלה (פיקדון, שורה כפולה למוצר בלי מזהה), סגירת הסכומים בשורות
ובעמודות, סימוני המבצע ושינוי המחיר, ותקופה ריקה.

`promo-on-paper.test.mjs` — המחיר הדו-ערכי של מוצר במבצע מחיר-קבוע (v61):
זיהוי המוצר הנכון, אי-הצעת הסבר לתעודה שנסגרת לבד, שני מוצרים בתעודה אחת,
פער בכיוון ההפוך שאינו מתחפש למבצע, מבצע שאינו פעיל בתאריך התעודה, סיבולת
העיגול משני צדדיה, וצירוף דו-משמעי שמוחזר כ-null במקום ניחוש.


`node tests/paper-prices.test.mjs` — 19 בדיקות (v67, הורחב ב-v79) של המתאם ושער האימות יחד, החל משורות בפורמט שהשרת באמת מחזיר. מחיר מבצע שכבר מודפס מחליף את המחיר הרגיל לצורך אימות הנייר בלבד; הבדיקה מכסה גם תעודות מעורבות, תוקף לפי תאריך הנייר, המשך מניעת קיזוז כפול, ואת סיבולת העיגול של v79 על תעודה של עשר שורות — כולל האישור שהמוצר הזול בקטלוג רחוק בסדר גודל מהסיבולת. הנתונים סינתטיים ומשתמשים במחירון הקיים ב-fixture.

## v68: Three monthly-promotion billing modes

`node tests/monthly-billing.test.mjs` runs 19 integration cases through the real
adapter, paper anchor gate, price-gap explanation and pending monthly rebate.
It covers the reported 759.32 / 91 / 15 invoice, all nine combinations of regular,
full and promotional billing for two products, multiple pending rows, ambiguity,
expired promotions and real mismatches. No live OCR request is made.

To repeat against a private backup without committing it:
`node tests/monthly-billing.test.mjs --backup /path/to/backup.json`.

## v70: Receipt scan persistence

`node --test tests/receipt-scan-persistence.test.mjs` runs 26 cases against the
**complete application module**, with only DOM, Firebase and HTTP boundaries
replaced. It exercises the actual Finish click handler, scan pipeline, adapter,
anchor gate, local-storage serialization/startup restore, findings renderer,
image/reset/cancel handlers and final receipt write. It checks that reload renders
the same shortages/surplus instead of the capture form, with zero new scan requests.

Coverage includes edits to counted quantities and supplier anchors, matching
receipts, multiple pages/documents, credit documents, partial/failed scans,
legacy/corrupt/wrong-receipt snapshots, storage exhaustion, failed final writes,
and late responses after a new capture. Photos are not persisted; page count is
stored separately and still checked independently against the returned count.

Private incident replay (neither file is committed):

```sh
BERMAN_TEST_BACKUP=/path/to/backup.json BERMAN_TEST_PAPER=/path/to/transcribed-scan.json node --test tests/receipt-scan-persistence.test.mjs
```

The paper file is a manually transcribed response in the server's output schema,
not the lost original OCR response. No live OCR or production database writes run.
Set `BERMAN_TEST_APP` to an older `index.html` to reproduce the old behavior.

For browser verification, run `node tests/receipt-scan-preview.mjs 8766`, open
`http://localhost:8766`, click **שחזר צילום וספירה**, reload, and click **בדיקה וסיום**.
The isolated preview uses the same application module and real localStorage;
Firebase and AI are replaced, and external API connections are blocked by CSP.
The same two private-fixture environment variables can be used locally.

Browser verification remains pending in the authoring environment: its remote
browser rejected the localhost preview with `ERR_BLOCKED_BY_CLIENT`. Rendered
HTML/event-handler assertions passed, but they are not an iPhone/Safari test.
# v85: Dual scan and bounded price verification

`node --test tests/dual-scan.test.mjs` exercises the full app with mocked network
boundaries: 14.84/14.94, agreement with a catalog mismatch, all nine combinations
of two promotion products, missing discounts, unexplained totals, failed
verification, manual correction preserving raw OCR, and persistence without
repeating paid requests. Backend comparison and parallelism tests live in
`asafkiri/berman-ai-scan`. These are regression tests, not live OCR accuracy or
cost measurements.

## v87: Link a later return credit to a previous unpaid return

`node --test tests/return-credit-link.test.mjs` exercises the complete app,
including the real cloud task runner with an atomic Firestore boundary fake.
It covers amount entry and confirmation, both history views, original quantities
and paper totals, balance conservation, reload, partial and multi-product credits,
ambiguous equal-value claims, old debts beyond 14 days, carried/closed/future
exclusions, cancellation, stale multi-device choices, retries and failure recovery.
It also checks that the existing intake-shortage allocation remains available.
Incoming `returnCreditNotes` pair with source `creditAllocations` entries whose
`targetType` is `return`. Linked quantities resolve the old claim without changing
its original `items` or counting another physical return. Editing/deleting linked
records requires undoing the link; open or linked returns are retained by pruning.

## v86: Explicit missing return credits

`node --test tests/return-credit-review.test.mjs` runs the complete app module
with browser and persistence boundaries mocked. It replays the reported
217.96 / 205.69 totals with synthetic return rows: an explicit **לא זוכה**
action preserves the returned quantity, records zero credited units, marks the
row reviewed, and leaves an identified product shortage plus a separate 0.04
residual. It checks saving/reopening, both history views, partial and surplus
credits, correcting a mistaken selection, genuine remaining money gaps,
allocated credit, row metadata and failed saves. No production data is changed.
