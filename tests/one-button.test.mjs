// v126 — "כפתור אחד": כל נייר מהנהג נקרא פעם אחת בקליטת הניירות, ותעודת משלוח נכנסת לקליטה
// כשהיא כבר קרואה — בלי בקשת קריאה נוספת, בלי עמודים (שום "הפעל שוב" לא ישלם עליה שוב),
// ובאותה צורה בדיוק שהקליטה בונה אחרי קריאה משלה. המודול המלא (receipt-scan-harness);
// רק הרשת, Firebase והמסך מזויפים.
// הרצה: node --test tests/one-button.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { TODAY, app, confirmLast, countAsPaper, credit, days, delivery, items, join, now, pad, page, plain, printed, readPapers, receive, startRound, state, tick, until } from './one-button-helpers.mjs';

test('מקום אחד: "צלם נייר מהנהג" בפס העליון → "קרא" → "התחל לספור עכשיו" — בקשה אחת, הספירה נפתחת מיד, התעודה נכנסת כאילו הקליטה קראה אותה', async () => {
  const storage = new Map();
  const r = app(delivery(), { storage });
  r.run(`currentView = 'receiving'; mainMode = 'receiving'; renderReceiving(); refreshLedgerBar();`);
  let html = r.node('app').innerHTML;
  assert.match(html, /אין קליטה פתוחה/); assert.match(html, /צלם נייר מהנהג" למעלה/);
  assert.doesNotMatch(html, /type="file"|data-role="rc-open-photo"|data-role="paper-photo"/, 'במסך הקליטה אין מצלמה — רק בפס העליון');
  assert.match(r.node('ledgerBar').innerHTML, /data-role="paper-photo"/); assert.match(r.node('ledgerBar').innerHTML, /צלם נייר מהנהג/);
  assert.match(html, /קבלת סחורה בלי נייר/);
  // מה שלא צריך כדי להתחיל — מקופל: הקלדה, תאריך אחר, תעודה ארוכה; בלי שורת שלבים
  assert.match(html, /<details[^>]*>.*עוד אפשרויות.*rc-entry-manual.*rcDocDate.*rc-entry-photo-multi.*<\/details>/s);
  assert.doesNotMatch(html, /1 · /);
  await receive(r);
  assert.equal(r.requests.length, 1);
  const body = JSON.parse(r.requests[0].body).documents[0];
  assert.equal(body.expectedUnits, null); assert.equal(body.expectedLines, null); assert.equal(body.pages.length, 1);
  const s = state(r);
  assert.equal(s.opened, true); assert.equal(s.source, 'paper'); assert.equal(s.st, 'ok'); assert.equal(s.busy, false);
  assert.deepEqual(s.notes.map(n => [n.units, n.lines]), [[30, 5]]);
  assert.deepEqual(s.docs, [{ noteIndex: 0, amount: s.notes[0].amount, units: 30, lines: 5, kind: 'charge', pages: [], savedPageCount: 1, paperId: 'paper_77001234', captureId: 'cap0' }]);
  assert.equal(s.per[0].source, 'paper'); assert.equal(s.per[0].paperId, 'paper_77001234'); assert.equal(s.per[0].docIndex, 0); assert.equal(s.per[0].pageCount, 1);
  assert.ok(s.basisOk); assert.deepEqual(s.snap, [1]);
  assert.equal(r.run('currentView'), 'receiving');
  assert.equal(r.run('globalThis.__scanner'), 1, 'הסורק נפתח מיד');
  assert.equal(r.run('receiptCountingMode'), 'scan');
  // אותה קריאה כמו שהקליטה הייתה קוראת בעצמה (אותה תשובה, אותו קטלוג)
  const o = app(delivery());
  await o.scan();
  const strip = d => { const x = plain(d); delete x.noteIndex; return x; };
  assert.deepEqual(strip(r.run('aiScanResponse.scan.documents[0]')), strip(o.run('aiScanResponse.scan.documents[0]')));
  assert.deepEqual(plain(r.run('receiptNotes')), plain(o.run('receiptNotes')));
  // הספירה עיוורת: במסך הקליטה אין אף שורה מהנייר
  html = r.node('app').innerHTML;
  r.run('aiScanResponse.scan.documents[0].rows').forEach(row => assert.ok(!html.includes(row.description), row.description));
  assert.match(html, /העוגנים נקראו מהתעודה/);
  assert.doesNotMatch(html, /type="file"/, 'גם במסך הספירה — המצלמה רק בפס');
  r.run('refreshLedgerBar()');
  assert.match(r.node('ledgerBar').innerHTML, /צלם נייר מהנהג/);
  // סיום: הקליטה נשמרת עם מספר הנייר ועם מקור הקריאה; המאזן רואה שהתעודה נקלטה
  countAsPaper(r);
  r.run('finishReceipt()');
  assert.ok(r.run('!!pendingReceipt'), 'הספירה תואמת — סיכום');
  await r.run('confirmReceipt()');
  const saved = r.writes.find(w => w.op === 'set' && w.path && w.path[w.path.length - 2] === 'receipts');
  assert.ok(saved, 'הקליטה נשמרה');
  assert.equal(saved.data.paperDocs[0].number, '77001234');
  assert.equal(saved.data.paperScan.response.perDocument[0].paperId, 'paper_77001234');
  assert.equal(r.requests.length, 1, 'עדיין בקשה אחת');
  r.run(`receipts = [${JSON.stringify({ id: 'x' })}].map(() => ({ id: 'rcSaved', ...testWrites.find(w => w.op === 'set' && w.path[w.path.length - 2] === 'receipts').data })); ledgerInvalidate();`);
  assert.equal(r.run(`currentLedger().states.paper_77001234`), 'in-receipt');
});

test('סופרים בזמן שהניירות נקראים: ספינר, "בדוק וסיים" מחכה, והעוגנים נכנסים בלי לגעת בספירה', async () => {
  const r = app(delivery());
  const release = r.hold();
  const round = startRound(r);
  await until(() => r.requests.length === 1);
  assert.equal(r.run('receiptOpened'), true); assert.equal(r.run('aiScanBusy'), true); assert.equal(r.run('receiptPaperScanState'), 'running');
  assert.equal(r.run('globalThis.__scanner'), 1);
  r.run('renderReceiving()');
  assert.match(r.node('app').innerHTML, /קורא את הניירות מהנהג/);
  countAsPaper(r);
  const counted = plain(r.run('receiptList'));
  r.run('finishReceipt()');
  assert.ok(r.toasts.some(t => /עוד נייר מהנהג נקרא עכשיו/.test(t)));
  assert.equal(r.run('pendingReceipt'), null);
  release();
  await round; await r.run('paperJoinChain');
  assert.equal(r.run('receiptPaperScanState'), 'ok'); assert.equal(r.run('aiScanBusy'), false);
  assert.deepEqual(plain(r.run('receiptList')), counted, 'הספירה לא השתנתה');
});

test('תעודת משלוח וזיכוי באותו סבב (בשני הסדרים): שתי בקשות, הזיכוי למאזן, בקליטה תעודה אחת', async () => {
  for (const order of [['d', 'c'], ['c', 'd']]) {
    const r = app(delivery());
    r.serve(...order.map(k => k === 'd' ? delivery() : credit()));
    await receive(r, 2);
    assert.equal(r.requests.length, 2, order.join());
    const s = state(r);
    assert.equal(s.st, 'ok'); assert.equal(s.docs.length, 1); assert.deepEqual(s.per.map(p => p.paperId), ['paper_77001234']);
    const store = JSON.parse(r.storage.get('bm_paper_results_v1'));
    assert.ok(Object.values(store).some(x => x.paper && x.paper.kind === 'credit' && x.paper.id === 'paper_290095142'), 'הזיכוי נשמר כנייר זיכוי');
  }
});

test('סבב בלי תעודת משלוח: "עוד אין תעודת משלוח בקליטה" — צילום, הקלדה, או המשך בלי נייר', async () => {
  const r = app(credit());
  await receive(r);
  assert.equal(r.requests.length, 1);
  assert.equal(r.run('receiptPaperScanState'), 'failed'); assert.equal(r.run('aiScanBusy'), false);
  assert.equal(r.run('aiScanResponse'), null); assert.deepEqual(plain(r.run('aiScanDocuments')), []);
  assert.match(r.run('receiptPaperScanProblems[0]'), /לא נמצאה תעודת משלוח/);
  r.run('renderReceiving()');
  const html = r.node('app').innerHTML;
  assert.match(html, /עוד אין תעודת משלוח בקליטה/);
  assert.match(html, /צלם את תעודת המשלוח בכפתור "צלם נייר מהנהג" למעלה/); assert.match(html, /data-role="rc-notes-edit"/); assert.match(html, /data-role="rc-nodoc-switch"/);
  assert.doesNotMatch(html, /type="file"/);
  r.click('rc-nodoc-switch');
  assert.equal(r.run('receiptNoDoc'), true); assert.equal(r.run('receiptEntryMode'), 'manual'); assert.equal(r.run('receiptOpened'), true);
});

test('תעודת משלוח שצולמה מחוץ לקליטה, מהיום ובלי קליטה פתוחה — פותחת קליטה לבד; מיום אחר — שואלת', async () => {
  const r = app(delivery());
  await readPapers(r);
  assert.equal(state(r).st, 'ok', 'נפתחה קליטה עם התעודה');
  assert.equal(r.run('currentView'), 'paperIntake', 'בלי לקפוץ למסך אחר');
  assert.match(r.run('paperIntakeItemHtml(paperIntake.items[0])'), /נכנסה לקליטה/);
  assert.match(r.run('paperIntakeItemHtml(paperIntake.items[0])'), /paper-goto-receiving/);
  const y = app(delivery('77001234', { docDate: printed(days(-1)) }));
  await readPapers(y);
  assert.equal(y.run('receiptOpened'), false);
  assert.match(y.run('paperIntakeItemHtml(paperIntake.items[0])'), /פותח לה קליטה/);
  await join(y, 'paper_77001234');
  assert.match(y.run('testConfirms[0].title'), /לפתוח קליטה/);
  await confirmLast(y);
  assert.equal(state(y).st, 'ok');
  assert.equal(y.run('receiptDocDate'), days(-1).toLocaleDateString('en-CA'), 'הקליטה על התאריך של הנייר');
  assert.equal(y.requests.length, 1);
});

test('"לקליטה" אחרי ריענון: מהמכשיר, ואחרי שהענן אישר — מ-paperScans; בלי חיבור — בתור', async () => {
  const storage = new Map();
  const r = app(delivery('77001234', { docDate: printed(days(-1)) }), { storage });
  await readPapers(r);
  const scan = plain(r.run('paperIntake.items[0].scan'));
  assert.equal(r.run(`!!paperLocalResults().cap0.ackedAt && !paperLocalResults().cap0.scan`), true, 'הענן אישר והתשובה הכבדה נמחקה מהמכשיר');
  const r2 = app(delivery(), { storage, cloudScans: { paper_77001234: scan } });
  await join(r2, 'paper_77001234'); await confirmLast(r2);
  assert.equal(r2.requests.length, 0); assert.equal(r2.run('globalThis.__cloudReads'), 1);
  assert.equal(state(r2).st, 'ok');
  const joinedDraft = storage.get('bm_receipt_draft');
  storage.delete('bm_receipt_draft');
  const r3 = app(delivery(), { storage });
  r3.run('navigator.onLine = false');
  await join(r3, 'paper_77001234');
  assert.equal(r3.run('receiptOpened'), false);
  assert.equal(r3.run(`paperJoinPending.has('paper_77001234')`), true);
  assert.ok(r3.toasts.some(t => /לא נמצאה במכשיר/.test(t)));
  assert.equal(r3.requests.length, 0);
  // ריענון אחרי שנכנסה: הקריאה חוזרת מהמכשיר, ו"הפעל שוב" של גרסה ישנה לא שולח כלום (אין עמודים)
  storage.set('bm_receipt_draft', joinedDraft);
  const r5 = app(delivery(), { storage });
  assert.equal(state(r5).st, 'ok'); assert.deepEqual(state(r5).per.map(p => p.paperId), ['paper_77001234']);
  await r5.run('aiScanBusy = false; bermanRunPaperScanInBackground()');
  assert.equal(r5.requests.length, 0);
});

test('תעודה שנייה מאותו משלוח (צולמה באמצע הספירה): מתווספת לבד; תעודה שלא אישרה את עצמה — רק אחרי "כן", ואז כל העוגנים מתאפסים', async () => {
  const storage = new Map();
  const r = app(delivery('77001234'), { storage });
  await receive(r);
  r.serve(delivery('77001235', { rows: delivery().scan.documents[0].rows.slice(0, 4), totalUnits: 27, printedLines: 4 }));
  await receive(r, 1, 1);
  assert.equal(r.requests.length, 2);
  assert.equal(r.run('testConfirms.length'), 0, 'בלי שאלה — צולמה מתוך הקליטה הזאת');
  const s = state(r);
  assert.equal(s.st, 'ok');
  assert.deepEqual(s.docs.map(d => [d.noteIndex, d.paperId, d.savedPageCount, d.pages.length]), [[0, 'paper_77001234', 1, 0], [1, 'paper_77001235', 1, 0]]);
  assert.deepEqual(s.per.map(p => p.docIndex), [0, 1]);
  assert.deepEqual(s.notes.map(n => [n.units, n.lines]), [[30, 5], [27, 4]]);
  assert.ok(s.basisOk); assert.deepEqual(s.snap, [1, 1]);
  const ev = r.run('aiEvaluateInvoiceScan(aiScanResponse)');
  assert.ok(!(ev.errors || []).some(e => /עמודים|לא התקבל פענוח/.test(e)), 'אין שגיאת עמודים או תעודה חסרה');
  const r2 = app(delivery(), { storage });
  assert.equal(state(r2).st, 'ok'); assert.equal(state(r2).docs.length, 2); assert.equal(r2.requests.length, 0);
  r.serve(delivery('77001236', { totalUnits: 99 }));
  await receive(r, 1, 2);
  const before = JSON.stringify(state(r));
  assert.match(r.run(`paperIntakeItemHtml(paperIntake.items.find(x => x.captureId === 'cap2'))`), /לא אישרה את עצמה/);
  await join(r, 'paper_77001236');
  assert.equal(JSON.stringify(state(r)), before, 'לפני "כן" — שום שינוי');
  assert.match(r.run('testConfirms[0].title'), /לא אישרה את עצמה/);
  await confirmLast(r);
  const f = state(r);
  assert.equal(f.st, 'failed'); assert.deepEqual(f.notes, []); assert.equal(f.source, null);
  assert.ok(f.docs.every(d => d.units == null && d.lines == null && d.amount == null));
  assert.ok(f.basisOk); assert.deepEqual(f.snap, [1, 1, 1]);
  const r3 = app(delivery(), { storage });
  assert.equal(state(r3).st, 'failed'); assert.equal(state(r3).docs.length, 3); assert.equal(r3.requests.length, 0);
});

test('אותה תעודה פעמיים — "כבר בקליטה"; תעודה שכבר נקלטה — לא נקלטת פעמיים; צילום חוזר (אפס בקשות) נכנס מהכרטיס שלו', async () => {
  const r = app(delivery());
  await receive(r);
  const before = JSON.stringify(state(r));
  await join(r, 'paper_77001234');
  assert.equal(JSON.stringify(state(r)), before);
  assert.ok(r.toasts.some(t => /כבר בקליטה הפתוחה/.test(t)));
  const saved = [{ id: 'rc1', date: TODAY, paperDocs: [{ number: '77001234' }], items: [] }];
  const r2 = app(delivery(), { receipts: saved });
  await receive(r2);
  assert.equal(r2.run('aiScanResponse'), null);
  assert.match(r2.run('paperIntakeItemHtml(paperIntake.items[0])'), /נקלטה — לא נקלטת פעמיים/);
  // צילום חוזר של אותה תמונה: "כבר נקרא" — ו"לקליטה" מכניס אותו בלי בקשה
  const r3 = app(delivery('77001234', { docDate: printed(days(-1)) }));
  await readPapers(r3);
  r3.run(`paperIntake.items.push({ captureId: 'capDup', hash: 'h0', status: 'dup', paperId: 'paper_77001234', dupCap: 'cap0', target: '' });`);
  const html = r3.run(`paperIntakeItemHtml(paperIntake.items.find(x => x.captureId === 'capDup'))`);
  assert.match(html, /כבר נקרא — לא נשלח שוב/); assert.match(html, /ledger-start-receiving/);
  await join(r3, 'paper_77001234', 'capDup'); await confirmLast(r3);
  assert.equal(state(r3).st, 'ok'); assert.equal(r3.requests.length, 1);
});

test('מספרים שהוקלדו: זהים לנייר — מתחלפים בקריאה; שונים — שאלה, ובלי "כן" לא נוגעים בכלום', async () => {
  const typed = units => `receiptOpened = true; receiptEntryMode = 'photo'; receiptNotes = [{ amount: 0, units: ${units}, lines: 5, kind: 'charge' }]; recomputeNoteTotal(); receiptAnchorSource = null; saveReceiptDraft();`;
  const r = app(delivery());
  r.run(typed(30)); // הקלדה דרך "סיום" של עריכת התעודות — המקור נשאר ריק (לא 'manual')
  await receive(r);
  assert.equal(state(r).source, 'paper'); assert.equal(state(r).st, 'ok');
  const r2 = app(delivery());
  r2.run(typed(31));
  const before = JSON.stringify(state(r2));
  await receive(r2);
  assert.equal(JSON.stringify(state(r2)), before, 'בלי "כן" — שום שינוי');
  await join(r2, 'paper_77001234');
  assert.match(r2.run('testConfirms[0].message'), /הוקלדו 31 יח׳ · 5 שורות; בתעודה: 30 יח׳ · 5 שורות/);
  assert.equal(r2.run('testConfirms[0].label'), 'החלף במספרים מהנייר');
  await confirmLast(r2);
  assert.equal(state(r2).source, 'paper'); assert.deepEqual(state(r2).notes.map(n => n.units), [30]);
  assert.equal(r2.requests.length, 1);
});

test('סירובים: סיכום פתוח, צילום שעוד לא נקרא (טלפון ישן), 4 תעודות — הקליטה לא משתנה', async () => {
  const r = app(delivery('77001234', { docDate: printed(days(-1)) }));
  await readPapers(r);
  r.run(`receiptOpened = true; receiptList = [{ productId: 'code_101', name: 'x', barcode: '', qty: 2 }]; reconcileData = []; saveReceiptDraft();`);
  let before = JSON.stringify(state(r));
  await join(r, 'paper_77001234');
  assert.equal(JSON.stringify(state(r)), before);
  assert.ok(r.toasts.some(t => /כבר בסיכום/.test(t)));
  r.run(`reconcileData = null; bermanSeedPhotoFirstScan(1); aiScanDocuments[0].pages = [{ dataUrl: 'data:image/jpeg;base64,eA==', orientationConfirmed: true }]; saveReceiptDraft();`);
  before = JSON.stringify(state(r));
  await join(r, 'paper_77001234');
  assert.equal(JSON.stringify(state(r)), before, 'הצילום של הטלפון הישן נשאר');
  assert.equal(r.run('aiTotalPages()'), 1);
  assert.ok(r.toasts.some(t => /צילום תעודה שעוד לא נקרא/.test(t)));
  r.run(`aiScanDocuments = [0, 1, 2, 3].map(i => ({ noteIndex: i, amount: null, units: 1, lines: 1, kind: 'charge', pages: [], savedPageCount: 1 }));
    aiScanResponse = { ok: true, scan: { documents: [], warnings: [] }, perDocument: [] }; receiptPaperScanState = 'ok'; receiptAnchorSource = 'paper';`);
  assert.equal(r.run(`receivingDeliveryRoute(paperIntake.items[0].scan, paperFind('paper_77001234').paper, null, {}).reason`), 'full');
  assert.equal(r.requests.length, 1);
});

test('קליטה שנשמרה בלי תעודה מאותו יום — שואל, ואז מצרף אליה (אותו מזהה, אותה ספירה)', async () => {
  const bare = { id: 'rc_bare', date: TODAY, noDoc: true, noteParts: [], items: [{ productId: 'code_101', name: 'אחיד', qty: 12 }], timestamp: 1 };
  const r = app(delivery(), { receipts: [bare] });
  await readPapers(r);
  assert.equal(r.run('receiptOpened'), false);
  assert.match(r.run('paperIntakeItemHtml(paperIntake.items[0])'), /נשמרה בלי תעודה/);
  await join(r, 'paper_77001234');
  assert.match(r.run('testConfirms[0].title'), /בלי תעודה/);
  await confirmLast(r);
  assert.equal(r.run('receiptDraftId'), 'rc_bare'); assert.equal(r.run('receiptAttachTarget.id'), 'rc_bare');
  assert.deepEqual(plain(r.run('receiptList.map(l => [l.productId, l.qty])')), [['code_101', 12]]);
  assert.equal(state(r).st, 'ok'); assert.equal(r.requests.length, 1);
});

test('מספר שתוקן בבדיקת הנייר — הוא המספר שנכנס לקליטה', async () => {
  const r = app(delivery('77001234', { docDate: printed(days(-1)) }));
  r.run('globalThis.__failCloud = true');
  await readPapers(r);
  r.run(`const rec = paperLocalResults().cap0; paperWrite({ ...rec.paper, number: '77001299' }, { local: true, cap: 'cap0' });`);
  assert.equal(r.run(`paperLocalResults().cap0.paper.id`), 'paper_77001299');
  await join(r, 'paper_77001299'); await confirmLast(r);
  assert.deepEqual(state(r).nums, ['77001299']);
  assert.deepEqual(plain(r.run('receiptPaperDocsSnapshot().map(d => d.number)')), ['77001299']);
});

test('אי אפשר לכתוב עכשיו (הקליטה המשותפת לקריאה בלבד) — הניירות נקראים, התעודה ממתינה ונכנסת לבד כשחוזר', async () => {
  const r = app(delivery());
  r.run('canEditSharedReceipt = () => false');
  await receive(r);
  assert.equal(r.requests.length, 1);
  assert.equal(r.run('receiptOpened'), false);
  assert.equal(r.run(`paperJoinPending.has('paper_77001234')`), true);
  assert.match(r.run('paperIntakeItemHtml(paperIntake.items[0])'), /כשיחזור החיבור/);
  r.run('canEditSharedReceipt = () => true');
  await r.run('paperJoinRetryNow()');
  assert.equal(state(r).st, 'ok'); assert.equal(r.run('paperJoinPending.size'), 0); assert.equal(r.requests.length, 1);
});

test('תור: צילום שנוסף בזמן שהסבב קורא נקרא באותו סבב — כל נייר נקרא פעם אחת; "בדוק וסיים" מחכה לו', async () => {
  const r = app(delivery());
  r.serve(delivery(), credit());
  const release = r.hold();
  const round = startRound(r);
  await until(() => r.requests.length === 1);
  r.run(`openPaperIntake({}); paperIntake.items = paperIntake.items.concat(${items(1, 1, '')});`);
  assert.equal(r.run('paperIntake.items.length'), 2, 'אותו סבב');
  await r.run('paperIntakeRun()');
  assert.equal(r.run('paperIntake.items[1].status'), 'queued');
  r.run(`currentView = 'receiving'; receiptList = [{ productId: 'code_101', name: 'x', barcode: '', qty: 1 }]; finishReceipt();`);
  assert.ok(r.toasts.some(t => /עוד נייר מהנהג נקרא עכשיו/.test(t)));
  release();
  await round; await r.run('paperJoinChain');
  assert.equal(r.requests.length, 2);
  assert.equal(r.run('paperIntake.items[0].status'), 'delivery');
  assert.ok(['saved', 'review'].includes(r.run('paperIntake.items[1].status')), 'הזיכוי נקרא');
  assert.equal(state(r).st, 'ok');
});


test('הפענוח נקטע בטלפון השני (אין תמונות): "המשך בלעדיה" — אפס בקשות; גם הכפתור של v125 לא שולח כלום', async () => {
  const r = app(delivery());
  r.run(`receiptOpened = true; receiptEntryMode = 'photo'; aiScanDocuments = []; aiScanBusy = true; receiptPaperScanState = 'running'; aiScanResponse = null;
    sharedReceiptStatus = { ready: true, scan: null, head: { updatedAt: Date.now() - 600000 } }; currentView = 'receiving'; saveReceiptDraft();`);
  r.run('renderSharedReceivingBanner()');
  assert.match(r.node('sharedReceivingBanner').innerHTML, /המשך בלעדיה/);
  await r.events.get('sharedReceivingBanner:click')({ target: { closest: () => ({ dataset: { sharedReceiving: 'scan-retry' } }) } });
  assert.equal(r.run('receiptPaperScanState'), 'failed'); assert.equal(r.run('aiScanBusy'), false);
  assert.equal(r.requests.length, 0);
  r.run(`aiScanBusy = true; receiptPaperScanState = 'running'`);
  await r.run('aiScanBusy = false; bermanRunPaperScanInBackground()');
  assert.equal(r.requests.length, 0, 'v125: "צלם לפחות עמוד אחד" — לפני כל בקשה');
  // כבר יש קריאה — "המשך" רק מאמץ אותה
  const j = app(delivery());
  await receive(j);
  j.run(`aiScanBusy = true; receiptPaperScanState = 'running'; receiptNotes = []; recomputeNoteTotal(); receiptAnchorSource = null;`);
  await j.events.get('sharedReceivingBanner:click')({ target: { closest: () => ({ dataset: { sharedReceiving: 'scan-retry' } }) } });
  assert.equal(j.run('receiptPaperScanState'), 'ok'); assert.equal(j.requests.length, 1);
});

// ===== שני טלפונים על אותה קליטה (מתאם מזויף שרושם כל פעולה) =====
function device(paper, opts = {}) {
  const r = app(paper, { ...opts, shared: true });
  const log = [];
  const status = { ready: true, canEdit: true, busy: false, status: 'synced', error: null, revision: 2, owner: null, dirty: false, conflict: null,
    head: { schema: 2, revision: 2, owner: null, updatedAt: Date.now() }, scan: opts.scan || null };
  let n = 0;
  const coordinator = { ready: true, canEdit: true, busy: false, status, head: status.head, revision: 2, payload: null,
    save: async payload => { const p = plain(payload); log.push(['save', p.state.aiScanBusy, p.state.receiptPaperScanState]); coordinator.payload = p; return { revision: 3 }; },
    flush: async () => { log.push(['flush']); },
    acquireScan: async () => {
      if (status.scan && status.scan.expiresAt > Date.now()) { const e = new Error('הפענוח כבר מתבצע במכשיר אחר.'); e.code = 'scan-busy'; throw e; }
      const token = { id: 'lease' + (++n) }; status.scan = { ...token, expiresAt: Date.now() + 180000 }; log.push(['acquire', token.id]); return token; },
    releaseScan: async t => { log.push(['release', t && t.id]); if (status.scan && t && status.scan.id === t.id) status.scan = null; },
    finish: async () => ({ revision: 4 }), start: async () => true, stop() {} };
  r.context.testSharedCoordinator = coordinator; r.context.testSharedStatus = status;
  r.run('sharedReceiving = testSharedCoordinator; sharedReceiptHooksReady = true; sharedReceivingStatusChanged(testSharedStatus);');
  return Object.assign(r, { log, status, coordinator });
}
function transfer(from, to) {
  to.context.testIncomingReceipt = plain(from.run('captureSharedReceipt()'));
  to.context.testIncomingMeta = { source: 'remote', canEdit: true, head: to.status.head, revision: 2 };
  return to.run('applySharedReceipt(testIncomingReceipt, testIncomingMeta)');
}

test('סבב בקליטה משותפת: "קוראת" נשמר לפני המנעול; המנעול אחד לכל הסבב; סוף הסבב נשמר לפני השחרור', async () => {
  const a = device(delivery());
  a.serve(delivery(), credit());
  await receive(a, 2);
  const kinds = a.log.map(x => x[0]);
  const busyAt = a.log.findIndex(x => x[0] === 'save' && x[1] === true && x[2] === 'running');
  const acquireAt = kinds.indexOf('acquire'), releaseAt = kinds.lastIndexOf('release');
  assert.ok(busyAt >= 0 && acquireAt > busyAt, 'המנעול נלקח אחרי ש"קוראת" נשמר (ואחרי שהקליטה קיבלה מזהה)');
  assert.equal(kinds.filter(k => k === 'acquire').length, 1, 'תעודה שנכנסת בתוך הסבב משתמשת במנעול שלו');
  const lastSave = a.log.map((x, i) => [x, i]).filter(([x]) => x[0] === 'save').pop();
  assert.ok(lastSave[1] < releaseAt, 'המצב האחרון נשמר לפני השחרור'); assert.equal(lastSave[0][1], false);
  assert.equal(a.log[releaseAt][1], 'lease1');
  assert.equal(a.coordinator.payload.state.aiScanResponse.perDocument[0].paperId, 'paper_77001234');
  assert.equal(a.requests.length, 2);
  // סבב בלי תעודת משלוח: 'failed' נשמר לפני השחרור
  const c = device(credit());
  await receive(c);
  const ck = c.log.map(x => x[0]), rel = ck.lastIndexOf('release');
  const failedAt = c.log.findIndex(x => x[0] === 'save' && x[1] === false && x[2] === 'failed');
  assert.ok(failedAt >= 0 && failedAt < rel);
});

test('מנעול של טלפון אחר: התעודה ממתינה בלי לכתוב כלום, ונכנסת אחרי שהוא משתחרר', async () => {
  const a = device(delivery('77001234', { docDate: printed(days(-1)) }));
  await readPapers(a);
  a.run(`receiptOpened = true; receiptEntryMode = 'photo'; receiptPaperScanState = 'failed'; receiptDocDate = '${days(-1).toLocaleDateString('en-CA')}'; saveReceiptDraft();`);
  a.status.scan = { id: 'other-phone', expiresAt: Date.now() + 180000 };
  const saves = a.log.filter(x => x[0] === 'save').length;
  await join(a, 'paper_77001234');
  assert.equal(a.run('aiScanResponse'), null);
  assert.equal(a.run(`paperJoinPending.has('paper_77001234')`), true);
  assert.ok(a.toasts.some(t => /קריאה אחרת רצה בקליטה/.test(t)));
  assert.equal(a.log.filter(x => x[0] === 'save').length, saves, 'בלי כתיבה');
  // הבדיקה של "בדוק וסיים": קריאה בטלפון אחר
  a.run(`receiptList = [{ productId: 'code_101', name: 'x', barcode: '', qty: 1 }]; finishReceipt();`);
  assert.ok(a.toasts.some(t => /נקרא עכשיו בטלפון אחר/.test(t)));
  a.status.scan = null;
  await a.run('paperJoinRetryNow()');
  assert.equal(a.run('receiptPaperScanState'), 'ok');
  const k = a.log.map(x => x[0]);
  assert.ok(k.indexOf('acquire') >= 0 && k.lastIndexOf('release') > k.lastIndexOf('save'), 'מנעול משלו, שוחרר אחרי השמירה');
  assert.equal(a.requests.length, 1);
});

test('טלפון שני: רואה "קורא…" ולא יכול לסיים; אחרי שהתעודה נכנסה — אותה קריאה, בלי בקשה, ואפשר לספור ולסיים', async () => {
  const a = device(delivery());
  const release = a.hold();
  const round = startRound(a);
  await until(() => a.requests.length === 1);
  const b = device(delivery(), { scan: { id: 'lease1', expiresAt: Date.now() + 180000 } });
  await transfer(a, b);
  assert.equal(b.run('aiScanBusy'), true); assert.equal(b.run('receiptPaperScanState'), 'running'); assert.equal(b.run('receiptOpened'), true);
  b.run(`currentView = 'receiving'; renderReceiving();`);
  assert.match(b.node('app').innerHTML, /קורא את הניירות מהנהג/);
  b.run(`receiptList = [{ productId: 'code_101', name: 'x', barcode: '', qty: 1 }]; finishReceipt();`);
  assert.ok(b.toasts.some(t => /בטלפון אחר/.test(t)));
  assert.equal(b.run('pendingReceipt'), null);
  release(); await round; await a.run('paperJoinChain');
  b.status.scan = null;
  await transfer(a, b);
  assert.equal(b.requests.length, 0);
  assert.deepEqual(plain(b.run('aiScanResponse')), plain(a.run('aiScanResponse')));
  assert.equal(b.run('aiScanBusy'), false); assert.equal(b.run('receiptPaperScanState'), 'ok'); assert.equal(b.run('receiptAnchorSource'), 'paper');
  b.run('renderReceiving()');
  assert.doesNotMatch(b.node('app').innerHTML, /data-role="rc-open-photo"|צלם נייר מהנהג<input/);
  // מטען משותף: אותה גרסה, אותם מפתחות; מקור הנייר שורד את השמירה של B
  const back = plain(b.run('captureSharedReceipt()'));
  assert.equal(back.version, 1);
  assert.equal(back.state.aiScanResponse.perDocument[0].paperId, 'paper_77001234');
  assert.equal(back.state.aiScanDocuments[0].paperId, 'paper_77001234');
  assert.deepEqual(Object.keys(plain(b.run('emptySharedReceipt()')).state).sort(), Object.keys(plain(b.run('sharedReceiptBindings()'))).sort());
  assert.equal(Object.keys(back.state).length, 37);
  // מיזוג: B ספר תוך כדי, A הכניס את התעודה — בלי התנגשות
  const base = plain(b.run('captureSharedReceipt()'));
  base.state.aiScanResponse = null; base.state.aiScanDocuments = []; base.state.receiptNotes = []; base.state.receiptPaperScanState = 'running'; base.state.aiScanBusy = true;
  const counted = plain(base); counted.state.receiptList = [{ productId: 'code_101', name: 'x', barcode: '', qty: 3 }];
  const joined = plain(back); joined.state.receiptList = base.state.receiptList;
  b.context.testMerge = { base, counted, joined };
  const merged = plain(b.run('BermanSharedReceiving.merge(testMerge.base, testMerge.counted, testMerge.joined)'));
  assert.deepEqual(merged.state.receiptList, counted.state.receiptList);
  assert.equal(merged.state.aiScanResponse.perDocument[0].paperId, 'paper_77001234');
});

test('ספירה עיוורת: מספר שהקריאה סימנה לא מוצג בזמן הספירה — רק כמה יש; ב"בדוק וסיים" הבדיקה נפתחת', async () => {
  const flagged = () => { const p = delivery(); p.verification = { ...p.verification, status: 'needs_review', escalationAttempted: true, issues: [{ noteIndex: 0, rowIndex: 1, field: 'quantity' }] }; return p; };
  const r = app(flagged());
  await receive(r);
  assert.equal(r.requests.length, 1, 'בלי קריאה שלישית');
  assert.equal(r.run('bermanOcrPendingDocs().length'), 1);
  r.run('renderReceiving()');
  let html = r.node('app').innerHTML;
  assert.match(html, /data-ocr-deferred/); assert.match(html, /הקריאה סימנה מספר אחד לבדיקה מול הנייר/);
  assert.doesNotMatch(html, /data-ocr-key|berman-ocr-confirm/);
  r.run('aiScanResponse.scan.documents[0].rows').forEach(row => assert.ok(!html.includes(row.description), row.description));
  countAsPaper(r);
  r.run('finishReceipt()');
  assert.equal(r.run('pendingReceipt'), null);
  assert.match(r.node('rcOcrReview').innerHTML, /data-ocr-key/, 'ב"בדוק וסיים" — המספר לבדיקה');
  r.run('renderReceiving()');
  assert.match(r.node('app').innerHTML, /data-ocr-key/);
  // ספירה ידנית מול הנייר — הבדיקה מוצגת כמו תמיד
  const m = app(flagged());
  await receive(m);
  m.run(`receiptCountingMode = 'manual'; renderReceiving();`);
  assert.match(m.node('app').innerHTML, /data-ocr-key/);
});

// ===== מקום אחד לכל נייר =====
test('מקום אחד: המצלמה רק בפס העליון — בקליטה, בהחזרות, בניהול, בהיסטוריה, במאזן ובמסך הניירות; בשום כרטיס אין מצלמה', async () => {
  const r = app(delivery());
  r.run(`returns = [{ id: 'ret_a', timestamp: Date.now() - 86400000, date: '${days(-1).toLocaleDateString('en-CA')}', items: [{ productId: 'code_101', name: 'x', qty: 3 }] }]; ledgerInvalidate();`);
  const noCamera = (html, where) => assert.doesNotMatch(html, /type="file"|data-role="(paper-photo|ledger-photo|rc-paper-cam|paper-gallery)"/, where);
  for (const view of ['receiving', 'returns', 'manage', 'receiptsHistory', 'ledger']) {
    r.run(`setView(${JSON.stringify(view)})`);
    noCamera(r.node('app').innerHTML, view);
    const bar = r.node('ledgerBar').innerHTML;
    assert.match(bar, /data-role="paper-photo"[\s\S]*צלם נייר מהנהג/, view); assert.match(bar, /data-role="paper-gallery"/, view);
    assert.equal(/data-role="ledger-open"/.test(bar), view !== 'ledger', view + ': כפתור המאזן — חוץ ממסך המאזן עצמו');
  }
  r.run(`setView('order')`);
  assert.equal(r.node('ledgerBar').innerHTML, '', 'במסך ההזמנה — בלי');
  noCamera(r.run(`retVerifyRowHtml(returns[0])`), 'כרטיס החזרה');
  assert.match(r.run(`retVerifyRowHtml(returns[0])`), /תעודת הזיכוי — צלם אותה בכפתור "צלם נייר מהנהג" למעלה/);
  noCamera(r.run('pendingReturnsBannerHtml()'), 'באנר ההחזרות');
  // קליטה פתוחה, קליטה בלי נייר, תיבת "עוד אין תעודת משלוח"
  await receive(r);
  r.run(`setView('receiving')`); noCamera(r.node('app').innerHTML, 'ספירה');
  r.run(`receiptNoDoc = true; receiptNotes = []; recomputeNoteTotal(); receiptList = [{ productId: 'code_101', name: 'x', barcode: '', qty: 1 }]; renderReceiving();`);
  noCamera(r.node('app').innerHTML, 'קליטה בלי נייר'); assert.match(r.node('app').innerHTML, /מצאתי את התעודה\? צלם אותה בכפתור "צלם נייר מהנהג" למעלה/);
  // מסך הניירות: "קרא" אחד, בלי מצלמה משלו
  r.run(`openPaperIntake({}); paperIntake.items = paperIntake.items.concat(${items(1, 5, '')}); renderPaperIntake();`);
  const tray = r.node('app').innerHTML;
  noCamera(tray, 'מסך הניירות'); assert.match(tray, /data-role="paper-run"/); assert.doesNotMatch(tray, /paper-run-receive/);
  assert.match(r.node('ledgerBar').innerHTML, /צלם נייר מהנהג/);
});

test('הכפתור בפס פותח את המצלמה של כל האפליקציה (קלט קבוע מחוץ למסך), והצילום נכנס למסך הניירות', async () => {
  const r = app(delivery());
  r.run(`setView('returns')`);
  r.context.__clicks = [];
  r.node('paperCamGlobal').click = () => r.context.__clicks.push('cam');
  r.node('paperGalGlobal').click = () => r.context.__clicks.push('gal');
  r.run(`paperUiClick({ dataset: { role: 'paper-photo' } }); paperUiClick({ dataset: { role: 'paper-gallery' } });`);
  assert.deepEqual(plain(r.context.__clicks), ['cam', 'gal']);
  // הקלט מחזיר קובץ — מסך הניירות נפתח עם הצילום (כאן: הכנת התמונה נכשלת בלי דפדפן — וזה מוצג)
  r.node('paperCamGlobal').files = [{ size: 3, lastModified: 3, name: 'p.jpg', type: 'image/jpeg', arrayBuffer: async () => new ArrayBuffer(3) }];
  r.events.get('paperCamGlobal:change')();
  await until(() => r.run('!!paperIntake && paperIntake.items.length === 1 && !paperIntake.preparing'));
  assert.equal(r.run('currentView'), 'paperIntake');
  assert.equal(r.node('paperCamGlobal').value, '');
});

test('תעודה מאותו יום נכנסת לבד לקליטה שמחכה לנייר: קליטה בלי נייר, וצירוף לקליטה שנשמרה בלי תעודה; מיום אחר — שאלה', async () => {
  const r = app(delivery());
  r.run(`receiptCountingMode = 'scan'; receiptNoDoc = true; receiptOpened = true; receiptEntryMode = 'manual'; receiptList = [{ productId: 'code_101', name: 'x', barcode: '', qty: 7 }]; saveReceiptDraft();`);
  await readPapers(r);
  assert.equal(r.run('testConfirms.length'), 0, 'בלי שאלה');
  const s = state(r);
  assert.equal(s.st, 'ok'); assert.equal(r.run('receiptNoDoc'), false); assert.equal(r.run('receiptEntryMode'), 'photo');
  assert.deepEqual(plain(r.run('receiptList.map(l => [l.productId, l.qty])')), [['code_101', 7]], 'הספירה נשארת');
  // צירוף: "התעודה הגיעה — צרף אותה" ואז צילום מהפס
  const bare = { id: 'rc_bare', date: TODAY, noDoc: true, noteParts: [], items: [{ productId: 'code_101', name: 'אחיד', qty: 12 }], timestamp: 1 };
  const a = app(delivery(), { receipts: [bare] });
  a.run(`reopenReceiptForDoc('rc_bare')`);
  assert.match(a.node('app').innerHTML, /צירוף התעודה/);
  await readPapers(a);
  assert.equal(a.run('testConfirms.length'), 0);
  assert.equal(state(a).st, 'ok'); assert.equal(a.run('receiptDraftId'), 'rc_bare'); assert.equal(a.run('receiptAttachTarget.id'), 'rc_bare');
  // קליטה בלי נייר מלפני שבוע — תעודה של היום שואלת
  const o = app(delivery());
  o.run(`receiptNoDoc = true; receiptOpened = true; receiptEntryMode = 'manual'; receiptDocDate = '${days(-7).toLocaleDateString('en-CA')}'; receiptList = [{ productId: 'code_101', name: 'x', barcode: '', qty: 7 }]; saveReceiptDraft();`);
  await readPapers(o);
  assert.equal(o.run('receiptNoDoc'), true, 'לא נכנסה לבד');
  assert.match(o.run('paperIntakeItemHtml(paperIntake.items[0])'), /קליטה פתוחה בלי תעודה/);
});

test('תעודה נוספת מהפס: מאותו יום — מתווספת לבד; מיום אחר — שאלה; צילום חוזר שאישר את עצמו מחליף קריאה שלא אישרה', async () => {
  const r = app(delivery('77001234'));
  await receive(r);
  r.serve(delivery('77001240', { docDate: printed(days(-3)) }));
  await readPapers(r, 1, 1);
  assert.equal(state(r).docs.length, 1, 'מיום אחר — לא נכנסה לבד');
  assert.match(r.run(`paperIntakeItemHtml(paperIntake.items.find(x => x.captureId === 'cap1'))`), /כבר יש תעודה/);
  // קריאה שלא אישרה את עצמה, ואז צילום אחר של אותה תעודה שכן
  const f = app(delivery('77001250', { totalUnits: 99 }));
  await receive(f);
  assert.equal(state(f).st, 'failed');
  f.serve(delivery('77001250'));
  await readPapers(f, 1, 1);
  assert.equal(f.run('testConfirms.length'), 0);
  assert.equal(state(f).st, 'ok'); assert.equal(state(f).docs.length, 1); assert.equal(state(f).per[0].captureId, 'cap1');
  assert.equal(f.requests.length, 2);
});

test('צילום חוזר של תעודת משלוח (אותה תמונה) — נכנס לקליטה מהקריאה הקיימת, בלי בקשה; ביטול קליטה מוריד תעודות שממתינות', async () => {
  const r = app(delivery());
  // הצילום הראשון — אותו hash שמחושב לקובץ בלי דפדפן
  r.run(`openPaperIntake({}); paperIntake.items = [{ captureId: 'cap0', hash: 'f3_3_p.jpg', page: ${JSON.stringify(page(0))}, status: 'photo', target: '', forDraftId: null }];`);
  r.run(`canEditSharedReceipt = () => false`);
  await r.run('paperIntakeRun()'); await r.run('paperJoinChain');
  assert.equal(r.run('receiptOpened'), false);
  r.run(`canEditSharedReceipt = () => true; paperJoinPending.clear();`);
  // אחרי שהענן אישר — הקריאה ב-paperScans (במכשיר נשארת רק הרשומה הקלה)
  r.context.testCloudScans.paper_77001234 = plain(r.run('paperIntake.items[0].scan'));
  r.node('paperCamGlobal').files = [{ size: 3, lastModified: 3, name: 'p.jpg', type: 'image/jpeg', arrayBuffer: async () => new ArrayBuffer(3) }];
  r.events.get('paperCamGlobal:change')();
  await until(() => r.run(`!!paperIntake.items.find(x => x.status === 'dup') && !paperIntake.preparing`));
  await r.run('paperJoinChain');
  assert.equal(state(r).st, 'ok', 'נכנסה מהקריאה הקיימת');
  assert.equal(r.requests.length, 1);
  // ביטול: תעודה שממתינה לא פותחת שוב את מה שבוטל
  const c = app(delivery());
  c.run('canEditSharedReceipt = () => false');
  await readPapers(c);
  assert.equal(c.run(`paperJoinPending.size`), 1);
  c.run(`canEditSharedReceipt = () => true; currentView = 'receiving'; receiptOpened = true; saveReceiptDraft();`);
  c.click('rc-cancel'); c.run('testConfirms[testConfirms.length - 1].cb()');
  assert.equal(c.run(`paperJoinPending.size`), 0);
});

// ===== ממצאי הסקירה =====
test('סקירה: קריאה מהכרטיס הישן (עמוד אחרי עמוד) שאישרה את עצמה — תעודה נוספת מתווספת אליה, בלי קריאה ובלי לגעת בצילומים', async () => {
  const r = app(delivery('77001234'));
  // קריאה של הקליטה עצמה (צילומים בכרטיס הישן) — כמו runtime().scan()
  await r.scan();
  r.run(`receiptDocDate = null; saveReceiptDraft();`);
  assert.equal(r.run('receiptPaperScanState'), 'ok'); assert.equal(r.run('aiTotalPages()'), 1);
  r.serve(delivery('77001235', { rows: delivery().scan.documents[0].rows.slice(0, 4), totalUnits: 27, printedLines: 4 }));
  await readPapers(r, 1, 1);
  const s = state(r);
  assert.equal(s.st, 'ok'); assert.equal(s.docs.length, 2);
  assert.equal(r.run('aiScanDocuments[0].pages.length'), 1, 'הצילום הישן נשאר');
  assert.deepEqual(s.docs.map(d => d.pages.length), [1, 0]);
  assert.equal(r.requests.length, 2, 'קריאה אחת לכל נייר');
});

test('סקירה: "כן" עונה רק על השאלה שנשאלה — אם המצב השתנה, נשאלת השאלה החדשה', async () => {
  const r = app(delivery('77001234', { docDate: printed(days(-1)) }));
  await readPapers(r);
  await join(r, 'paper_77001234');
  assert.match(r.run('testConfirms[0].title'), /לפתוח קליטה/);
  // בינתיים נפתחה קליטה בלי נייר מלפני שבוע (שאלה אחרת: 'nodoc')
  r.run(`receiptNoDoc = true; receiptOpened = true; receiptEntryMode = 'manual'; receiptDocDate = '${days(-7).toLocaleDateString('en-CA')}'; receiptList = [{ productId: 'code_101', name: 'x', barcode: '', qty: 2 }]; saveReceiptDraft();`);
  await confirmLast(r);
  assert.equal(r.run('receiptNoDoc'), true, 'לא נכנסה בלי לשאול');
  assert.match(r.run('testConfirms[testConfirms.length - 1].title'), /בלי תעודה/);
});

test('סקירה: "בדוק וסיים" מחכה גם לתעודה שבדיוק נכנסת (בין הקריאה להכנסה)', async () => {
  const r = app(delivery());
  await receive(r);
  r.run(`paperJoinActive = 1; currentView = 'receiving'; receiptList = [{ productId: 'code_101', name: 'x', barcode: '', qty: 1 }]; finishReceipt();`);
  assert.ok(r.toasts.some(t => /עוד נייר מהנהג נקרא עכשיו/.test(t)));
  assert.equal(r.run('pendingReceipt'), null);
  r.run('paperJoinActive = 0');
});

test('סקירה: טלפון שקורא ניירות כשיש קליטה פתוחה מחזיק את המנעול — בטלפון השני "בדוק וסיים" מחכה', async () => {
  const a = app(delivery());
  a.run(`receiptOpened = true; receiptEntryMode = 'photo'; receiptList = [{ productId: 'code_101', name: 'x', barcode: '', qty: 1 }]; saveReceiptDraft();
    globalThis.__acq = []; globalThis.__rel = [];
    sharedReceiving = { ready: true, canEdit: true, payload: null, save: async () => ({}), flush: async () => {},
      acquireScan: async () => { __acq.push(1); sharedReceiptStatus = { ...sharedReceiptStatus, scan: { id: 'mine1', expiresAt: Date.now() + 180000 } }; return { id: 'mine1' }; },
      releaseScan: async t => { __rel.push(t.id); sharedReceiptStatus = { ...sharedReceiptStatus, scan: null }; } };
    canEditSharedReceipt = () => true; sharedReceiptStatus = { ready: true, scan: null };`);
  a.serve(credit());
  await readPapers(a);
  assert.equal(a.run('__acq.length'), 1, 'נלקח מנעול לזמן הקריאה (טלפון אחר רואה אותו ומחכה)');
  assert.deepEqual(plain(a.run('__rel')), ['mine1'], 'ושוחרר בסוף הסבב');
});

test('סקירה: תעודה מיום אחר לא נכנסת לבד גם לסבב של "התחל לספור" כשכבר יש בו תעודה; תעודה של אתמול כשיש לאתמול קליטה בלי נייר — שאלה', async () => {
  const r = app(delivery('77001234'));
  await receive(r);
  r.serve(delivery('77001240', { docDate: printed(days(-3)) }));
  r.run(`paperIntake.bind = null;`);
  await receive(r, 1, 1);
  assert.equal(state(r).docs.length, 1, 'מיום אחר — לא נכנסה לבד');
  const y = days(-1).toLocaleDateString('en-CA');
  const bare = { id: 'rc_y', date: y, noDoc: true, noteParts: [], items: [{ productId: 'code_101', name: 'x', qty: 3 }], timestamp: 1 };
  const b = app(delivery('77001234', { docDate: printed(days(-1)) }), { receipts: [bare] });
  b.run(`receiptNoDoc = true; receiptOpened = true; receiptEntryMode = 'manual'; receiptList = [{ productId: 'code_101', name: 'x', barcode: '', qty: 7 }]; saveReceiptDraft();`);
  await readPapers(b);
  assert.equal(b.run('receiptNoDoc'), true, 'לא נכנסה לבד לקליטה של היום');
  assert.equal(b.run('receiptDocDate'), null, 'והקליטה של היום לא קיבלה תאריך אחר');
});

test('סקירה: ספירה עיוורת גם ביום שיש בו קליטה שנשמרה בלי נייר — במאזן ובבדיקת הנייר אין כמויות של תעודת המשלוח', async () => {
  const bare = { id: 'rc_bare', date: TODAY, noDoc: true, noteParts: [], items: [{ productId: 'code_101', name: 'x', qty: 3 }], timestamp: 1 };
  const r = app(delivery(), { receipts: [bare] });
  await readPapers(r);
  r.run(`setView('ledger')`);
  const html = r.node('app').innerHTML;
  assert.match(html, /תעודת המשלוח 77001234/);
  assert.doesNotMatch(html, /5 שורות · 30 יח׳/, 'בלי כמויות לפני שנקלטה');
  await r.run(`openPaperReview('paper_77001234')`);
  assert.doesNotMatch(r.node('app').innerHTML, /data-role="review-qty"/);
});
