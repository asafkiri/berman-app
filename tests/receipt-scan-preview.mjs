// Isolated manual/browser replay of the actual application. Never connects to
// Firebase or an AI provider. Optional private data stays on this local server.
// node tests/receipt-scan-preview.mjs [port]
import http from 'node:http';
import { html, moduleSource, fixture } from './receipt-scan-harness.mjs';
const data = fixture();
const port = Number(process.argv[2]) || 8766;
const setup = `
const initializeApp = () => ({}), getAuth = () => ({currentUser:{getIdToken:async()=> 'test'}});
const initializeFirestore = () => ({}), getFirestore = () => ({});
const persistentLocalCache = () => ({}), persistentMultipleTabManager = () => ({});
const signInAnonymously = async () => ({}), onAuthStateChanged = () => {};
`;
const replay = `
const testData = await (await fetch('/fixture')).json();
products = testData.products; promos = testData.promos;
aiRunAnalyzer = async () => {};
runCloudTask = async (label, task) => { document.getElementById('testSaved').textContent = JSON.stringify(task); return true; };
const realTestFetch = window.fetch.bind(window);
window.fetch = async (url, options) => {
  if (String(url) === AI_SCAN_WORKER_URL) {
    localStorage.setItem('testScanRequests', String(Number(localStorage.getItem('testScanRequests') || 0) + 1));
    document.getElementById('testRequests').textContent = localStorage.getItem('testScanRequests');
    return realTestFetch('/mock-scan', options);
  }
  if (/run.app|googleapis.com/.test(String(url))) throw new Error('External service blocked in local replay');
  return realTestFetch(url, options);
};
document.getElementById('testRequests').textContent = localStorage.getItem('testScanRequests') || '0';
document.getElementById('testStart').onclick = async () => {
  receiptList = []; receiptNotes = []; recomputeNoteTotal(); receiptDraftId = null;
  receiptOpened = true; receiptDocDate = '2026-09-09'; receiptEntryMode = 'photo'; receiptAnchorSource = null;
  receiptNoDoc = false; receiptAttachTarget = null; receiptPromoOnPaper = [];
  bermanSeedPhotoFirstScan(1);
  aiScanDocuments[0].pages = [{dataUrl:'data:image/jpeg;base64,Zml4dHVyZQ==',orientationConfirmed:true}];
  await bermanRunPaperScanInBackground();
  receiptList = structuredClone(testData.items); saveReceiptDraft(); renderReceiving();
};
renderReceiving();
`;
const toolbar = `<aside style="background:#fff7d6;padding:10px;font:14px sans-serif;direction:rtl">
בדיקה מקומית בלבד · קריאות פענוח: <b id="testRequests">0</b>
<button id="testStart" style="background:#222;color:white;padding:8px;margin:4px">שחזר צילום וספירה</button>
<pre id="testSaved" hidden></pre></aside>`;
const page = html.replace(/<script type="module">[\s\S]*?<\/script>/,
  () => '<script type="module">' + setup + moduleSource + replay + '</script>')
  .replace(/(<body[^>]*>)/, '$1' + toolbar);
http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.url === '/fixture' || req.url === '/mock-scan') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(req.url === '/fixture' ? data : data.paper));
  } else if (req.url === '/' || req.url === '/index.html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', "connect-src 'self'; worker-src 'none'");
    res.end(page);
  } else { res.statusCode = 404; res.end('Not found'); }
}).listen(port, '0.0.0.0', () => console.log('Local receipt replay: http://localhost:' + port));
