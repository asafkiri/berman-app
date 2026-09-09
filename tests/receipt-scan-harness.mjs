// Runs the complete application module. Only browser/Firebase/network boundaries
// are faked; scan adaptation, storage, restoration, comparison and HTML are real.
import fs from 'node:fs';
import vm from 'node:vm';

export const appPath = process.env.BERMAN_TEST_APP || new URL('../index.html', import.meta.url);
export const html = fs.readFileSync(appPath, 'utf8');
export const moduleSource = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]
  .replace(/^import[\s\S]*?from "https:\/\/www\.gstatic\.com\/firebasejs\/[^"\n]+";\n/gm, '');

export function fixture() {
  const file = process.env.BERMAN_TEST_BACKUP;
  const source = JSON.parse(fs.readFileSync(file || new URL('./fixture.json', import.meta.url), 'utf8'));
  const collections = source.collections || source;
  const products = Object.entries(collections.products).map(([id, p]) => ({ id, ...p }));
  const promos = Object.entries(collections.promos).map(([id, p]) => ({ id, ...p }));
  // Default public regression data is synthetic. The optional private fixture
  // allows the reported receipt to be replayed without committing user data.
  let paper, items;
  if (process.env.BERMAN_TEST_PAPER) {
    paper = JSON.parse(fs.readFileSync(process.env.BERMAN_TEST_PAPER, 'utf8'));
    items = source.localDrafts.receipt.items;
  } else {
    const quantities = [[101, 12], [1231, 6], [238, 4], [2381, 5], [2387, 3]];
    const rows = quantities.map(([code, quantity], i) => {
      const p = products.find(p => p.code === String(code));
      return { itemCode: String(code), description: p.name, barcode: p.barcode, quantity,
        unitPriceExVat: code === 1231 ? 8.5 : p.listPrice, sourcePage: 1, lineNumber: i + 1 };
    });
    const total = rows.reduce((sum, r) => sum + r.quantity * (r.itemCode === '1231' ? 8.5
      : products.find(p => p.code === r.itemCode).price), 0);
    paper = { ok: true, serviceVersion: 4, model: 'fixture', requestId: 'fixture-scan', scan: {
      warnings: [], documents: [{ noteIndex: 0, docType: 'invoice', docDate: '09/09/2026',
        pageCount: 1, confidence: 0.99, netToChargeExVat: Math.round(total * 100) / 100,
        totalUnits: 30, printedLines: rows.length, rows, warnings: [] }] } };
    items = rows.map(r => {
      const p = products.find(p => p.code === r.itemCode);
      return { productId: p.id, name: p.name, barcode: p.barcode,
        qty: r.quantity + (r.itemCode === '2387' ? 1 : ['238', '2381'].includes(r.itemCode) ? -1 : 0) };
    });
  }
  return { products, promos, paper, items };
}

export function runtime({ storage = new Map(), data = fixture() } = {}) {
  const nodes = new Map(), callbacks = [], events = new Map(), requests = [], writes = [], toasts = [];
  function node(id) {
    if (nodes.has(id)) return nodes.get(id);
    const classes = new Set(['hidden']);
    const n = { id, value: '', style: {}, dataset: {}, innerHTML: '', textContent: '', disabled: false,
      classList: { add: (...vs) => vs.forEach(v => classes.add(v)), remove: (...vs) => vs.forEach(v => classes.delete(v)),
        contains: v => classes.has(v), toggle: v => classes.has(v) ? classes.delete(v) : classes.add(v) },
      addEventListener(type, fn) { events.set(id + ':' + type, fn); },
      setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
      querySelector() { return null; }, querySelectorAll() { return []; }, insertAdjacentHTML() {},
      focus() {}, blur() {}, scrollIntoView() {}, appendChild() {}, remove() {},
      getContext() { return { clearRect() {} }; },
      getBoundingClientRect() { return { top: 0, left: 0, width: 400, height: 600 }; } };
    nodes.set(id, n); return n;
  }
  const currentUser = { getIdToken: async () => 'local-test-token' };
  const context = vm.createContext({ console, URL, TextEncoder, TextDecoder, AbortController, structuredClone,
    crypto: { randomUUID: () => 'local-' + Math.random().toString(36).slice(2) },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    document: { getElementById: node, querySelectorAll: () => [], querySelector: () => null,
      documentElement: node('root'), body: node('body'), createElement: tag => node('new-' + tag),
      addEventListener(type, fn) { events.set(type, fn); }, visibilityState: 'visible' },
    window: { addEventListener() {}, scrollTo() {}, innerWidth: 400, innerHeight: 850 },
    navigator: { onLine: true }, history: { replaceState() {}, pushState() {} }, location: { href: 'http://localhost/test' },
    setTimeout(fn) { callbacks.push(fn); return callbacks.length; }, clearTimeout() {}, setInterval() {}, clearInterval() {},
    requestAnimationFrame() {}, MutationObserver: class { observe() {} },
    initializeApp: () => ({}), getAuth: () => ({ currentUser }), initializeFirestore: () => ({}),
    getFirestore: () => ({}), persistentLocalCache: () => ({}), persistentMultipleTabManager: () => ({}),
    signInAnonymously: async () => ({}), onAuthStateChanged() {},
    fetch: async (url, options) => {
      requests.push({ url: String(url), body: options?.body });
      if (!String(url).endsWith('/scan')) throw new Error('Unexpected network request: ' + url);
      return { ok: true, status: 200, json: async () => structuredClone(data.paper) };
    }
  });
  vm.runInContext(moduleSource, context, { filename: 'index.html', timeout: 5000 });
  context.testData = structuredClone(data); context.testWrites = writes; context.testToasts = toasts;
  const run = script => vm.runInContext(script, context, { timeout: 5000 });
  run(`products = testData.products; promos = testData.promos;
    showToast = text => testToasts.push(text);
    runCloudTask = async (label, task) => { testWrites.push(structuredClone(task)); return true; };
    const auditOriginalAnalyzer = aiRunAnalyzer; aiRunAnalyzer = async () => {};`);
  async function scan() {
    run(`receiptOpened = true; receiptDocDate = '2026-09-09'; receiptList = [];
      bermanSeedPhotoFirstScan(1);
      aiScanDocuments[0].pages = [{ dataUrl: 'data:image/jpeg;base64,Zml4dHVyZQ==', orientationConfirmed: true }];`);
    await run('bermanRunPaperScanInBackground()');
    run('receiptList = structuredClone(testData.items); saveReceiptDraft();');
  }
  function click(role, id) {
    const target = { dataset: { role, id }, closest: selector => selector === '[data-role]' ? target : null };
    return events.get('app:click')({ target });
  }
  return { context, run, scan, click, node, nodes, events, requests, storage, writes, toasts };
}
