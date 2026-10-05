// v123 — כל מאזין ברמת המודול נרשם על אלמנט שקיים ב-HTML.
// `$('X').addEventListener(...)` רץ פעם אחת בטעינת המודול, בלי בדיקת null. אלמנט
// שנמחק מה-HTML בלי המאזין שלו זורק שגיאה בטעינה והאפליקציה כולה נשארת לבנה
// בטלפון. ההארנס של הבדיקות (receipt-scan-harness) מייצר כל id שמבקשים ממנו,
// ולכן שום בדיקה אחרת לא תתפוס את זה — כאן בודקים את הקוד עצמו.
// (כך ירדו ב-v123 #mr_price ו-#shortCreditAmount — יחד עם המאזינים שלהם.)
// הרצה: node --test tests/listener-ids.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { html } from './receipt-scan-harness.mjs';

test('every top-level $(id).addEventListener has an element with that id in the page', () => {
  const ids = [...new Set([...html.matchAll(/^(?:\$|document\.getElementById)\('([A-Za-z0-9_-]+)'\)\.addEventListener/gm)].map(m => m[1]))];
  assert.ok(ids.length > 50, 'found the module-level listeners (' + ids.length + ')');
  const missing = ids.filter(id => !html.includes('id="' + id + '"'));
  assert.deepEqual(missing, []);
});

test('the money inputs removed in v123 are gone together with their listeners', () => {
  for (const id of ['mr_price', 'mr_total', 'shortCreditAmount', 'creditSplitSurplus', 'creditSplitReturned', 'creditSplitPaper']) {
    assert.ok(!html.includes('id="' + id + '"'), 'element ' + id);
    assert.ok(!html.includes("$('" + id + "')"), 'reference ' + id);
  }
});

test('v124: the price prompt and the discount field are gone together with their listeners', () => {
  for (const id of ['newProductModal', 'npr_price', 'npr_ok', 'npr_cancel', 'npr_name', 'npr_discNote', 'npr_recHint', 'prod_discount']) {
    assert.ok(!html.includes('id="' + id + '"'), 'element ' + id);
    assert.ok(!html.includes("$('" + id + "')"), 'reference ' + id);
  }
  for (const id of ['prod_invoicePrice', 'prod_priceFrom']) assert.ok(html.includes('id="' + id + '"'), 'new field ' + id);
});
