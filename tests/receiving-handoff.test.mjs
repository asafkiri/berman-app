// v140 replaces cross-device draft handoff with local persistence and final-only commits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { app, delivery, readPapers, credit } from './one-button-helpers.mjs';
import { createCloud } from './fake-firestore.mjs';
const ROOT = 'artifacts/berman-app-classic/public/data/';
const json = (r, expr) => JSON.parse(r.run('JSON.stringify(' + expr + ')'));
function phone(cloud, opts = {}) {
 const r = app(opts.paper || delivery(), opts), c = cloud.client(); r.context.__fs = c.fs;
 r.run("for (const k of ['doc', 'collection', 'query', 'where', 'onSnapshot', 'runTransaction', 'getDocFromServer']) globalThis[k] = __fs[k]; currentView = 'receiving'; mainMode = 'receiving'; startSharedReceiving();");
 r.client = c; return r;
}
const seed = (r, id='receipt-local') => r.run(`receiptDraftId=${JSON.stringify(id)};receiptOpened=true;receiptNoDoc=true;receiptList=[{productId:products[0].id,name:products[0].name,qty:9}];saveReceiptDraft();pendingReceipt={lines:receiptList.slice(),noDoc:true,status:'ok'};`);

test('two phones: counting stays local, old live flag cannot start any shared engine', async () => {
 const cloud=createCloud(), a=phone(cloud,{storage:new Map([['bm_shared_receiving_live','1']])}), b=phone(cloud);
 seed(a); a.run('scheduleReceivingHandoff({user:true});scheduleSharedReceiptSave()');
 assert.equal(a.run('sharedReceivingOff'),true);assert.equal(a.run('draftHandoff'),null);assert.equal(a.run('sharedReceiving'),null);
 assert.deepEqual(cloud.paths(),[]);assert.equal(b.run('receiptList.length'),0);
 const reload=phone(cloud,{storage:a.storage});assert.equal(reload.run('receiptList[0].qty'),9);
});
test('final receipt is transactionally created once and local draft clears after acknowledgement',async()=>{
 const cloud=createCloud(),r=phone(cloud);seed(r);await r.run('confirmReceipt()');
 assert.equal(cloud.get(ROOT+'receipts/receipt-local').items[0].qty,9);assert.equal(r.run('receiptList.length'),0);
 assert.equal(cloud.paths('/drafts/').length,0);assert.equal(cloud.paths('/receipts/').length,1);
 await r.run('confirmReceipt()');assert.equal(cloud.paths('/receipts/').length,1);
});
test('offline finish keeps current counts and sends no queue task',async()=>{
 const cloud=createCloud(),r=phone(cloud);seed(r);r.run('navigator.onLine=false');r.client.setOnline(false);await r.run('confirmReceipt()');
 assert.equal(r.run('receiptList[0].qty'),9);assert.deepEqual(cloud.paths(),[]);assert.equal(r.run('cloudFailedWrites.length'),0);
});
test('lost commit response resolves via server read and does not duplicate',async()=>{
 const cloud=createCloud(),r=phone(cloud);seed(r);cloud.loseReplyAfterCommit=true;await r.run('confirmReceipt()');
 assert.equal(cloud.paths('/receipts/').length,1);assert.equal(r.run('receiptList.length'),0);
});
test('existing receipt is never overwritten by a stale local draft',async()=>{
 const cloud=createCloud(),r=phone(cloud);seed(r);cloud.put(ROOT+'receipts/receipt-local',{items:[{qty:17}],status:'ok'});await r.run('confirmReceipt()');
 assert.equal(cloud.get(ROOT+'receipts/receipt-local').items[0].qty,17);assert.equal(r.run('receiptList[0].qty'),9);
});
test('late acknowledgement cannot erase edits made while save waited',async()=>{
 const cloud=createCloud(),r=phone(cloud);seed(r);let release;cloud.commitGate=new Promise(res=>release=res);
 const save=r.run('confirmReceipt()');await new Promise(res=>setImmediate(res));r.run('receiptList[0].qty=23;saveReceiptDraft()');release();await save;
 assert.equal(cloud.get(ROOT+'receipts/receipt-local').items[0].qty,9);assert.equal(r.run('receiptList[0].qty'),23);
});
test('delivery paper and paid OCR stay local until receipt finalization, then commit together',async()=>{
 const cloud=createCloud(),r=phone(cloud);await readPapers(r);assert.equal(r.run('receiptOpened'),true);assert.equal(r.writes.filter(x=>x.paperCreate).length,0);
 assert.equal(cloud.paths('/papers/').length,0);assert.equal(cloud.paths('/paperScans/').length,0);
 r.run("receiptList=[{productId:products[0].id,name:products[0].name,qty:30}];saveReceiptDraft();pendingReceipt={lines:receiptList.slice(),status:'ok'}");
 const id=r.run('receiptDraftId');await r.run('confirmReceipt()');assert.ok(cloud.get(ROOT+'receipts/'+id));assert.equal(cloud.paths('/papers/').length,1);assert.equal(cloud.paths('/paperScans/').length,1);
});
test('credit paper continues syncing during receiving',async()=>{
 const cloud=createCloud(),r=phone(cloud,{paper:credit()});await readPapers(r);assert.equal(r.writes.filter(x=>x.paperCreate).length,1);
});
test('guarded attach preserves links and rejects concurrently changed receipt',async()=>{
 const cloud=createCloud(),r=phone(cloud);const old={items:[{productId:r.run('products[0].id'),qty:9}],noDoc:true,timestamp:1,date:'2026-10-08',shortCreditNotes:[{id:'credit-link'}]};
 cloud.put(ROOT+'receipts/old',old);r.context.__old=old;r.run("receipts=[{id:'old',...__old}];reopenReceiptForDoc('old');pendingReceipt={lines:receiptList.slice(),status:'ok'}");
 await r.run('confirmReceipt()');assert.deepEqual(cloud.get(ROOT+'receipts/old').shortCreditNotes,old.shortCreditNotes);
 const b=phone(cloud);b.context.__old=old;b.run("receipts=[{id:'old',...__old}];reopenReceiptForDoc('old');pendingReceipt={lines:receiptList.slice(),status:'ok'}");await b.run('confirmReceipt()');assert.ok(b.run('receiptList.length'));
});
test('legacy side remains accessible despite history containing same receipt ID',()=>{
 const cloud=createCloud(),r=phone(cloud);seed(r,'same');const payload=json(r,'receivingHandoffPayload()');r.storage.set('bm_handoff_receiving_side',JSON.stringify([{sessionId:'same',payload:JSON.stringify(payload)}]));
 r.run("receiptList=[];receiptOpened=false;receiptNoDoc=false;receiptDraftId=null;receipts=[{id:'same'}]");assert.equal(r.run('localReceivingRestore(0)'),true);assert.equal(r.run('receiptDraftId'),'same');assert.equal(r.run('receiptList[0].qty'),9);assert.ok(r.storage.has('bm_handoff_receiving_side'));
});
test('legacy queued blind receipt write is archived and cannot be replayed',async()=>{
 const cloud=createCloud(),r=phone(cloud);r.run("cloudFailedWrites=[{id:'q',actionName:'save receipt',task:{op:'set',path:dataPath('receipts','old'),data:{items:[{qty:99}]}}}];migrateLocalReceivingQueues()");
 assert.equal(r.run('cloudFailedWrites.length'),0);assert.equal(JSON.parse(r.storage.get('bm_local_receiving_legacy_queue')).length,1);assert.deepEqual(cloud.paths(),[]);
});
test('old quantity modal cannot create a new receipt after final save',async()=>{
 const cloud=createCloud(),r=phone(cloud);seed(r);r.run("qtyProduct=products[0];qtyTarget='receipt';qtyReceiptEpoch=localReceivingEpoch;$('qtyVal').value='99'");await r.run('confirmReceipt()');r.run('commitQty(false)');assert.equal(r.run('receiptList.length'),0);
});

test('queued OCR pages from a canceled round cannot reopen receiving after cancellation',async()=>{
 const cloud=createCloud(),r=phone(cloud);const release=r.hold();const task=readPapers(r,2);
 for(let i=0;i<40&&!r.requests.length;i++)await new Promise(res=>setImmediate(res));
 r.run('fenceLocalReceivingUI();receivingHandoffEmpty()');release();await task;
 assert.equal(r.run('receivingDraftEmpty()'),true);assert.equal(cloud.paths('/receipts/').length,0);
 assert.ok(r.run('Object.values(paperLocalResults()).some(r=>r&&r.scan)'),'paid result retained locally');
});
