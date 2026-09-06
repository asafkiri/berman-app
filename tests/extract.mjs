// שולף פונקציות בשמן מתוך index.html, כדי שהבדיקות ירוצו על הקוד עצמו ולא
// על עותק שלו. האפליקציה היא קובץ HTML אחד בלי שלב בנייה, ולכן אין כאן
// import — סופרים סוגריים מתולתלים מהפונקציה עד סופה, תוך דילוג על מחרוזות.
// אם הבדיקה נופלת על "MISSING" — הפונקציה שונתה או נמחקה, וזה בדיוק מה
// שהבדיקה אמורה לתפוס.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const APP_PATH = path.join(HERE, '..', 'index.html');

function extractOne(src, name) {
  const head = new RegExp('^function ' + name + '\\(', 'm').exec(src);
  if (!head) return null;
  let i = src.indexOf('{', head.index + head[0].length - 1);
  let depth = 0, quote = null, escaped = false;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return src.slice(head.index, j + 1);
  }
  return null;
}

// מחזיר את קוד המקור של הפונקציות והקבועים המבוקשים, מוכן להערכה בהקשר
// שבו כבר הוגדרו המשתנים הגלובליים שהן נשענות עליהם.
export function extractSource(names, constants) {
  const src = fs.readFileSync(APP_PATH, 'utf8');
  const missing = [];
  const parts = names.map(n => {
    const body = extractOne(src, n);
    if (!body) missing.push(n);
    return body;
  }).filter(Boolean);
  (constants || []).forEach(c => {
    if (src.includes(c)) parts.push(c);
    else missing.push(c);
  });
  if (missing.length) {
    console.error('חסר ב-index.html: ' + missing.join(', '));
    process.exit(1);
  }
  return parts.join('\n');
}
