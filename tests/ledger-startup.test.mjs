// נתוני הפתיחה מגיעים במאזיני Firestore נפרדים. זיכוי שמגיע אחרי הקליטה
// חייב להסיר את ההתראה המוצגת בלי לחייב מעבר למסך אחר.
// כל הרשומות בבדיקה מומצאות; הגיבוי של המשתמש אינו נשמר כאן.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, fixture } from './receipt-scan-harness.mjs';

const SOURCES = ['products', 'receipts', 'returns', 'papers', 'config'];
const baseData = fixture();
const product = { ...baseData.products.find(p => p.id === 'code_101'), name: 'מוצר בדיקה' };
const item = (qty, noteQty = qty) => ({ productId: product.id, code: '101', name: product.name, qty, noteQty });
const receipt = (id, date, qty = 1, noteQty = qty) => ({ id, date, timestamp: Date.parse(date + 'T12:00:00Z'), items: [item(qty, noteQty)] });
const shortage = receipt('receipt_shortage', '2026-10-04', 1, 2);
const later = receipt('receipt_later', '2026-10-06');
const credit = {
  id: 'paper_999001', schema: 1, kind: 'credit', state: 'accepted',
  docDay: '2026-10-06', number: '999001', timestamp: Date.parse('2026-10-06T13:00:00Z'),
  rows: [{ line: 1, productId: product.id, itemCode: '101', qty: 1 }]
};
const shortReturn = { id: 'return_shortage', date: '2026-10-04', timestamp: Date.parse('2026-10-04T13:00:00Z'), credited: true, items: [item(2, 1)] };
const config = { ledgerFrom: '2026-09-01', ledgerClosedThrough: '' };
const records = (extra = {}) => ({ products: [product], receipts: [shortage, later], returns: [], papers: [credit], config, ...extra });
const strip = html => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

function startup(data = records()) {
  const listeners = new Map(), failures = new Map(), errors = [];
  const r = runtime({ data: { ...baseData, products: [product] }, globals: {
    console: { ...console, error: (...args) => errors.push(args) },
    collection: (_db, ...parts) => parts.join('/'),
    doc: (_db, ...parts) => parts.join('/'),
    query: ref => ref, orderBy: () => null, limit: () => null, where: () => null,
    onSnapshot(ref, opts, next, error) {
      listeners.set(ref, typeof opts === 'function' ? opts : next);
      failures.set(ref, typeof opts === 'function' ? next : error);
      return () => { listeners.delete(ref); failures.delete(ref); };
    }
  } });
  r.run(`startSharedReceiving = () => {}; startReturnsEvents = () => {};
    todayStr = () => '2026-10-06'; startListeners(); setView('receiving');`);
  function emit(source, value = data[source], fromCache = false) {
    const suffix = source === 'config' ? '/config/app' : '/' + source;
    const next = [...listeners].find(([ref]) => ref.endsWith(suffix))?.[1];
    assert.equal(typeof next, 'function', 'Real application registered ' + source + ' listener');
    const docs = source === 'config' ? [] : structuredClone(value).map(({ id, ...body }) => ({ id, data: () => body }));
    next({ docs, empty: docs.length === 0, metadata: { fromCache }, data: () => structuredClone(value) });
  }
  function load() { SOURCES.forEach(source => emit(source)); }
  function fail(source) {
    const suffix = source === 'config' ? '/config/app' : '/' + source;
    const failure = [...failures].find(([ref]) => ref.endsWith(suffix))?.[1];
    assert.equal(typeof failure, 'function', 'המאזין מטפל בכשל של ' + source);
    failure(new Error('שגיאת טעינה מכוונת בבדיקה: ' + source));
  }
  function show(view, { focused = false, compact = false } = {}) {
    r.run(`setView(${JSON.stringify(view)})`);
    // סביבת הבדיקה שומרת מחרוזות HTML ואינה בונה מהן רכיבי DOM.
    // מגדירים פעם אחת את הרכיב שכבר הוצג, ואז המאזינים האמיתיים מעדכנים אותו.
    r.node('openIssuesBanner').dataset.compact = compact ? '1' : '0';
    r.run('refreshOpenIssuesBanner()');
    if (focused) {
      const input = r.node('syntheticActiveInput');
      input.tagName = 'INPUT'; input.value = '37';
      r.context.document.activeElement = input;
      r.node('app').contains = candidate => candidate === input;
    }
  }
  return { r, emit, load, fail, show, errors, banner: () => strip(r.node('openIssuesBanner').innerHTML) };
}

function permutations(items) {
  return items.length ? items.flatMap((item, i) => permutations(items.filter((_, j) => i !== j)).map(rest => [item, ...rest])) : [[]];
}

test('פתיחה: כל 120 סדרי הגעת המקורות ממתינים לכל הנתונים, גם מהמטמון וגם מהשרת', () => {
  for (const fromCache of [false, true]) for (const order of permutations(SOURCES)) {
    const { r, emit } = startup();
    const context = (fromCache ? 'cache' : 'server') + ': ' + order.join(', ');
    assert.equal(r.run('ledgerSourcesReady()'), false, context);
    order.forEach((source, index) => {
      emit(source, undefined, fromCache);
      const ready = index === order.length - 1;
      assert.equal(r.run('ledgerSourcesReady()'), ready, context + ' after ' + source);
      const banner = r.run('openIssuesBannerHtml({})');
      assert.match(banner, /id="openIssuesBanner"/, context);
      assert.doesNotMatch(banner, /לטיפול מול ברמן/, context + ': partial streams cannot imply a debt');
      r.run('renderLedger()');
      if (ready) assert.match(r.node('app').innerHTML, /הכל מאוזן/, context);
      else assert.doesNotMatch(r.node('app').innerHTML, /הכל מאוזן|לבקש זיכוי/, context + ': partial streams cannot imply a balance');
    });
    assert.equal(r.run('openIssuesList().length'), 0, context);
  }
});

test('תשובות ריקות לקליטות, להחזרות ולניירות משלימות גם הן את הטעינה', () => {
  const app = startup(records({ receipts: [], returns: [], papers: [] }));
  app.load();
  assert.equal(app.r.run('ledgerSourcesReady()'), true);
  assert.equal(app.r.run('openIssuesList().length'), 0);
  app.r.run("setView('ledger')");
  assert.match(app.r.node('app').innerHTML, /הכל מאוזן/);
});

test('חוסר אמיתי מוצג לאחר שהגיעו כל מקורות הנתונים', () => {
  const app = startup(records({ papers: [] }));
  app.load();
  app.show('receiving');
  assert.equal(app.r.run('openIssuesList().length'), 1);
  assert.match(app.banner(), /דבר אחד לטיפול מול ברמן/);
  assert.match(app.banner(), /חויבת ולא קיבלת/);
  app.r.run("setView('ledger')");
  assert.doesNotMatch(app.r.node('app').innerHTML, /הכל מאוזן/);
  assert.match(app.r.node('app').innerHTML, /חויבת ולא קיבלת/);
});

test('באנר ריק שומר את הרכיב ואת מצב התצוגה המקוצר בשביל העדכון הבא', () => {
  const app = startup();
  app.load();
  for (const compact of [false, true]) {
    const html = app.r.run(`openIssuesBannerHtml({ compact: ${compact} })`);
    assert.match(html, /id="openIssuesBanner"/);
    assert.match(html, new RegExp('data-compact="' + (compact ? '1' : '0') + '"'));
    assert.doesNotMatch(html, /לטיפול מול ברמן/);
  }
  app.show('receiving', { compact: true, focused: true });
  app.emit('papers', []);
  assert.match(app.banner(), /דבר אחד לטיפול מול ברמן/);
  assert.doesNotMatch(app.banner(), /חויבת ולא קיבלת/, 'compact warning stays a single line');
  app.emit('papers', [credit]);
  assert.doesNotMatch(app.banner(), /לטיפול מול ברמן/);
});

const changes = [
  { source: 'papers', initial: records({ papers: [] }), value: [credit] },
  { source: 'receipts', initial: records({ papers: [] }), value: [receipt('receipt_shortage', '2026-10-04'), later] },
  { source: 'returns', initial: records({ receipts: [later], papers: [], returns: [shortReturn] }), value: [{ ...shortReturn, items: [item(2, 2)] }] },
  { source: 'config', initial: records({ receipts: [later], papers: [], returns: [shortReturn] }), value: { ...config, ledgerClosedThrough: '2026-10-06' } }
];

for (const view of ['receiving', 'manage']) for (const focused of [false, true]) for (const change of changes) {
  test(`${view}: עדכון ${change.source} מסיר את ההתראה ללא ניווט${focused ? ', גם כשהסמן בתוך שדה' : ''}`, () => {
    const app = startup(change.initial);
    app.load(); app.show(view, { focused });
    assert.match(app.banner(), /לטיפול מול ברמן/, 'precondition: an actual unresolved item');
    const originalScreen = app.r.node('app').innerHTML;
    app.emit(change.source, change.value);
    assert.equal(app.r.run('currentView'), view);
    assert.equal(app.r.run('openIssuesList().length'), 0);
    assert.doesNotMatch(app.banner(), /לטיפול מול ברמן/, 'the listener updates the existing slot');
    if (focused) {
      assert.equal(app.r.node('syntheticActiveInput').value, '37', 'typed quantity remains intact');
      assert.equal(app.r.node('app').innerHTML, originalScreen, 'refresh does not rebuild the active form');
    }
  });
}

for (const view of ['receiving', 'manage']) {
  test(`${view}: עדכון הקטלוג מעדכן את טקסט ההתראה גם כשהסמן בתוך שדה`, () => {
    const app = startup(records({ papers: [] }));
    app.load(); app.show(view, { focused: true });
    assert.match(app.banner(), /מוצר בדיקה/);
    app.emit('products', [{ ...product, name: 'שם בדיקה מעודכן' }]);
    assert.equal(app.r.run('openIssuesList().length'), 1, 'a name change does not clear a real shortage');
    assert.match(app.banner(), /שם בדיקה מעודכן/);
    assert.doesNotMatch(app.banner(), /מוצר בדיקה/);
    assert.equal(app.r.node('syntheticActiveInput').value, '37');
  });
}

for (const change of changes) {
  test(`מאזן: עדכון ${change.source} מעדכן את מסך המאזן שכבר פתוח`, () => {
    const app = startup(change.initial);
    app.load(); app.show('ledger');
    assert.doesNotMatch(app.r.node('app').innerHTML, /הכל מאוזן/);
    app.emit(change.source, change.value);
    assert.equal(app.r.run('currentView'), 'ledger');
    assert.match(app.r.node('app').innerHTML, /הכל מאוזן/);
  });
}

test('כשל בכל אחד מהמאזינים מציג הודעת בדיקה שנכשלה, ואפשר להתאושש לאחר קבלת הנתונים', () => {
  for (const source of SOURCES) for (const wasReady of [false, true]) {
    const app = startup();
    if (wasReady) app.load();
    else SOURCES.filter(name => name !== source).forEach(name => app.emit(name));
    app.show('receiving');
    app.fail(source);
    assert.equal(app.errors.length, 1);
    assert.equal(app.r.run('ledgerSourcesReady()'), false);
    assert.match(app.banner(), /לא הצלחתי לבדוק את המאזן/);
    assert.doesNotMatch(app.banner(), /לטיפול מול ברמן|הכל מאוזן/);
    app.r.run("setView('ledger')");
    assert.match(app.r.node('app').innerHTML, /לא הצלחתי לבדוק את המאזן/);
    assert.doesNotMatch(app.r.node('app').innerHTML, /הכל מאוזן|לבקש זיכוי/);
    app.emit(source);
    assert.equal(app.r.run('ledgerSourcesReady()'), true);
    assert.match(app.r.node('app').innerHTML, /הכל מאוזן/);
    assert.doesNotMatch(app.r.node('app').innerHTML, /לא הצלחתי לבדוק את המאזן/);
  }
});
