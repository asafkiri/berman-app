// Independent migration attacks against the complete application module.
// Browser/storage/Firebase boundaries are doubles; no production service is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import {runtime} from './receipt-scan-harness.mjs';

function phone(storage=new Map()) {
  const p=runtime({storage});
  for(const node of p.nodes.values()) {
    let value=String(node.value??'');
    Object.defineProperty(node,'value',{get:()=>value,set:v=>{value=String(v??'');},configurable:true});
    node.select=()=>{};
  }
  p.context.queueMicrotask=queueMicrotask;
  p.run("currentView='receiving';mainMode='receiving';openReceivingScanner=()=>{};autoApplyExactOffsets=async()=>[];");
  p.json=expr=>JSON.parse(p.run('JSON.stringify('+expr+')'));
  p.seed=(id='legacy-receipt',qty=17)=>p.run(`receiptOpened=true;receiptEntryMode='manual';receiptDraftId=${JSON.stringify(id)};receiptList=[{productId:products[0].id,name:products[0].name,barcode:products[0].barcode,qty:${qty}}];receiptNotes=[normNote({amount:85,units:${qty},lines:1})];recomputeNoteTotal();saveReceiptDraft();`);
  return p;
}
function sideStorage({manual=false}={}) {
  const p=phone();p.seed('legacy-side',23);
  if(manual)p.run("openReconcile();reconcileSetRecvLive(products[0].id,'0');reconcileSetNoteLive(products[0].id,'9');reconcileData[0].checked=true;");
  return new Map([['bm_handoff_receiving_side',JSON.stringify([{sessionId:'legacy-side',recordId:'legacy-side',payload:p.run('JSON.stringify(captureSharedReceipt())')}])]]);
}

test('legacy local side keeps original ID, quantities and source copy',()=>{
  const p=phone(sideStorage());assert.equal(p.run('localReceivingRestore(0)'),true);
  assert.equal(p.run('receiptDraftId'),'legacy-side');assert.equal(p.run('receiptList[0].qty'),23);
  assert.ok(p.storage.has('bm_handoff_receiving_side'));
});
test('legacy side cannot replace an active local receipt',()=>{
  const p=phone(sideStorage());p.seed('active',17);const before=p.storage.get('bm_receipt_draft');
  assert.equal(p.run('localReceivingRestore(0)'),false);assert.equal(p.storage.get('bm_receipt_draft'),before);
});
test('recovery quota failure does not change memory or report success',()=>{
  const p=phone(sideStorage()),set=p.context.localStorage.setItem;
  p.context.localStorage.setItem=(k,v)=>{if(k==='bm_receipt_draft')throw Error('quota');return set(k,v);};
  assert.equal(p.run('localReceivingRestore(0)'),false);assert.equal(p.run('receiptDraftId'),null);
  assert.equal(p.storage.has('bm_receipt_draft'),false);assert.ok(p.storage.has('bm_handoff_receiving_side'));
});
test('a barcode detection started before closing cannot enter the next receipt',async()=>{
  const p=phone();p.seed('old',17);let reply;p.context.__oldDetection=new Promise(r=>{reply=r;});
  p.run("scanPurpose='receiving';scanStream={getTracks:()=>[]};barcodeDetector={detect:()=>__oldDetection};scanUsingWasm=false;$('scanVideo').readyState=3;scanTick();");
  p.run("fenceLocalReceivingUI();receiptDraftId='next';receiptList=[];scanPurpose='receiving';scanStream={getTracks:()=>[]};");
  reply([{rawValue:p.run('products[1].barcode')}]);await new Promise(r=>setImmediate(r));
  assert.equal(p.run('qtyProduct'),null);assert.equal(p.run('receiptDraftId'),'next');
});
test('old getUserMedia result is stopped and cannot replace the new camera stream',async()=>{
  const p=phone();p.seed('old',17);let oldResolve,newResolve,calls=0,oldStopped=0,newStopped=0;
  const oldStream={name:'old',getTracks:()=>[{stop:()=>oldStopped++}],getVideoTracks:()=>[]};
  const newStream={name:'new',getTracks:()=>[{stop:()=>newStopped++}],getVideoTracks:()=>[]};
  p.context.window.BarcodeDetector=class{};
  p.context.navigator.mediaDevices={getUserMedia:()=>++calls===1?new Promise(r=>oldResolve=r):new Promise(r=>newResolve=r)};
  p.node('scanVideo').play=async()=>{};p.node('scanVideo').pause=()=>{};
  p.run("nativeScanSupported=()=>true;isIOSDevice=()=>false;isSamsungDevice=async()=>false;scanPurpose='receiving'");
  const oldStart=p.run('openScanner()');p.run("closeScanner();receiptDraftId='next';scanPurpose='receiving'");
  const newStart=p.run('openScanner()');newResolve(newStream);await newStart;oldResolve(oldStream);await oldStart;
  assert.equal(p.run('scanStream.name'),'new');assert.equal(oldStopped,1);assert.equal(newStopped,0);
});
test('legacy side recovery keeps manual paper counts and explicit received zero',()=>{
  const p=phone(sideStorage({manual:true}));p.run('localReceivingRestore(0);openReconcile()');
  const row=p.json('reconcileData.find(r=>r.productId===products[0].id)');
  assert.equal(row.received,0);assert.equal(row.noteQty,9);assert.equal(row.checked,true);
});

for(const scenario of ['manual-zero','manual-missing-product','add-other-physical-row','change-physical-keeps-paper','remove-physical-keeps-paper']) {
  test('local comparison survives reload: '+scenario,()=>{
    const p=phone();p.seed('manual',17);p.run("openReconcile();reconcileSetRecvLive(products[0].id,'0');reconcileSetNoteLive(products[0].id,'9');reconcileData[0].checked=true;saveReceiptDraft();");
    const id=p.run('products[0].id'),second=p.run('products[1].id');
    if(scenario==='manual-missing-product')p.run("reconcileAddItem(products[1].id);reconcileSetNoteLive(products[1].id,'4');saveReceiptDraft()");
    if(scenario==='add-other-physical-row')p.run("setView('receiving');addReceiptQtyToTop(products[1],3);saveReceiptDraft()");
    if(scenario==='change-physical-keeps-paper')p.run("setView('receiving');setReceiptQty(products[0].id,23);saveReceiptDraft()");
    if(scenario==='remove-physical-keeps-paper')p.run("setView('receiving');receiptList=[];saveReceiptDraft()");
    const q=phone(new Map(p.storage));q.run('openReconcile()');const rows=q.json('reconcileData'),a=rows.find(r=>r.productId===id),b=rows.find(r=>r.productId===second);
    assert.ok(a);assert.equal(a.noteQty,9);assert.equal(a.received,scenario==='change-physical-keeps-paper'?23:0);
    if(scenario==='manual-missing-product'){assert.equal(b?.received,0);assert.equal(b?.noteQty,4);}
    if(scenario==='add-other-physical-row')assert.equal(b?.received,3);
    if(scenario==='manual-zero')assert.equal(a.checked,true);
    assert.equal(q.requests.length,0);
  });
}
test('unchanged comparison approvals and audit survive reload with a stable final fingerprint',()=>{
  const p=phone();p.seed('manual',17);p.run("openReconcile();reconcileAiAudit={verified:true,claims:[{type:'shortage',accepted:true}]};reconcilePaperEntered=true;reconcileCheckMode=true;saveReceiptDraft()");
  const before=p.run('localReceivingFingerprint()'),q=phone(new Map(p.storage));q.run('openReconcile()');
  assert.equal(q.run('reconcileAiAudit.verified'),true);assert.equal(q.run('reconcilePaperEntered'),true);assert.equal(q.run('reconcileCheckMode'),true);
  assert.equal(q.run('localReceivingFingerprint()'),before);
});
test('OCR row user decision reloads without a new paid scan',async()=>{
  const p=phone();await p.scan();p.run("aiScanResponse.scan.documents[0].rows[0].userConfirmedAt=123;aiScanResponse.scan.documents[0].rows[0].userConfirmedBarcode='7290000000008';saveReceiptDraft()");
  const q=phone(new Map(p.storage));const row=q.json('aiScanResponse.scan.documents[0].rows[0]');
  assert.equal(row.userConfirmedAt,123);assert.equal(row.userConfirmedBarcode,'7290000000008');assert.equal(q.requests.length,0);
});
test('quota while closing an acknowledged receipt keeps the durable draft visible',async()=>{
  const p=phone();p.seed('saved',17);const before=p.storage.get('bm_receipt_draft'),set=p.context.localStorage.setItem;
  p.context.localStorage.setItem=(k,v)=>{if(k==='bm_receipt_draft')throw Error('quota');return set(k,v);};
  p.run("localReceivingSavedFence={id:'saved',fingerprint:localReceivingFingerprint()};receivingBalanceLine=()=>''");
  await p.run("receiptAfterSave('saved',{items:[]},null,false)");
  assert.equal(p.run('receiptDraftId'),'saved');assert.equal(p.run('receiptList[0].qty'),17);assert.equal(p.storage.get('bm_receipt_draft'),before);
});

for(const shape of ['direct-draft','batch-draft','tasks-batch-draft','legacy-final-set']) {
  test('quota cannot let a legacy receiving queue escape: '+shape,async()=>{
    const p=phone(),writes=[];
    p.context.doc=(_db,...parts)=>({path:parts.join('/')});
    p.context.setDoc=async(r,d)=>writes.push({path:r.path,data:d});p.context.updateDoc=p.context.setDoc;p.context.deleteDoc=async r=>writes.push({path:r.path});
    p.context.writeBatch=()=>{const staged=[];return{set:(r,d)=>staged.push({path:r.path,data:d}),update:(r,d)=>staged.push({path:r.path,data:d}),delete:r=>staged.push({path:r.path}),commit:async()=>writes.push(...staged)};};
    p.context.runTransaction=async(_db,fn)=>fn({get:async()=>({exists:()=>false,data:()=>null}),set:(r,d)=>writes.push({path:r.path,data:d})});
    p.run('showCloudBusy=()=>{};hideCloudBusy=()=>{};logCloudActionIfNeeded=()=>{};logSilentCloudActionIfNeeded=()=>{}');
    const draft={op:'set',path:p.json("dataPath('drafts','receiving_handoff')"),data:{items:[{productId:'milk',qty:17}]}},safe={op:'update',path:p.json("dataPath('products','milk')"),data:{price:5}};
    const task=shape==='direct-draft'?draft:shape==='batch-draft'?{op:'batch',writes:[safe,draft]}:shape==='tasks-batch-draft'?{tasks:[safe,{op:'batch',writes:[draft]}]}:{op:'set',path:p.json("dataPath('receipts','old-final')"),data:{items:[{productId:'milk',qty:17}]}};
    p.context.__oldQueue=[{id:'old-write',actionName:shape==='legacy-final-set'?'save receipt before clearing draft':'autosave receiving',task}];p.run('cloudFailedWrites=structuredClone(__oldQueue);saveCloudFailedWrites()');
    const set=p.context.localStorage.setItem;p.context.localStorage.setItem=(k,v)=>{if(k==='bm_local_receiving_legacy_queue')throw Error('quota');return set(k,v);};
    await p.run('retryCloudFailedWrites()');assert.deepEqual(writes,[]);assert.equal(p.run('cloudFailedWrites.some(x=>x.id==="old-write")'),true);
  });
}
