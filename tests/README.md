# בדיקות

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

`paper-anchors.test.mjs` — שער האמון של זרימת הצילום-תחילה (v62): מתי מותר
לקבל את שלושת העוגנים מהנייר עצמו, ומה נאמר כשלא. רץ על תשובות סריקה
סינתטיות (בגרסאות שלפני v70 גיבוי לא שמר את גוף התשובה של הפענוח).


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


`node tests/paper-prices.test.mjs` — 14 בדיקות v67 של המתאם ושער האימות יחד, החל משורות בפורמט שהשרת באמת מחזיר. מחיר מבצע שכבר מודפס מחליף את המחיר הרגיל לצורך אימות הנייר בלבד; הבדיקה מכסה גם תעודות מעורבות, תוקף לפי תאריך הנייר והמשך מניעת קיזוז כפול. הנתונים סינתטיים ומשתמשים במחירון הקיים ב-fixture.

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
