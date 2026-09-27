import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const script = readFileSync(new URL('../shared-receiving.js', import.meta.url), 'utf8');
const copy = x => x === undefined ? x : JSON.parse(JSON.stringify(x));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function until(predicate) { for (let i = 0; i < 100 && !predicate(); i++) await tick(); assert.ok(predicate(), 'Timed out waiting for shared state'); }
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const headPath = 'artifacts/test/public/data/drafts/receiving';
function server() {
  const data = new Map(), listeners = new Set(), writes = [], reads = [];
  let queue = Promise.resolve(), gate = null, readGate = null, transactionGate = null;
  const snapshot = (path, value = data.get(path), metadata = { fromCache: false, hasPendingWrites: false }) => ({
    exists: () => value !== undefined, data: () => copy(value), metadata
  });
  const publish = () => { const snap = snapshot(headPath); for (const cb of listeners) queueMicrotask(() => cb(snap)); };
  function client(name, extra = {}) {
    const states = [], statuses = []; let connected = true;
    const runtime = vm.createContext({ crypto: webcrypto, TextEncoder, console, setTimeout, clearTimeout });
    vm.runInContext(script, runtime);
    const options = {
      db: {}, clientId: name, rootPath: ['artifacts', 'test', 'public', 'data'],
      doc: (_db, ...path) => path.join('/'),
      isOnline: () => connected,
      getDoc: async path => {
        reads.push({ name, path });
        const value = copy(data.get(path));
        if (readGate && path.includes('receiving_chunk_')) await readGate.promise;
        return snapshot(path, value);
      },
      onSnapshot: (_ref, _opts, next) => { listeners.add(next); queueMicrotask(() => next(snapshot(headPath))); return () => listeners.delete(next); },
      runTransaction: async (_db, body) => {
        const result = queue.then(async () => {
          if (!connected) throw Object.assign(new Error('offline'), { code: 'offline' });
          const updates = [];
          await body({ get: async path => { const snap = snapshot(path); if (transactionGate) await transactionGate.promise; return snap; },
            set: (path, value) => updates.push([path, copy(value)]), delete: path => updates.push([path, undefined]) });
          if (!connected) throw Object.assign(new Error('offline'), { code: 'offline' });
          updates.forEach(([path, value]) => { value === undefined ? data.delete(path) : data.set(path, value); writes.push({ name, path, value }); });
          if (updates.some(([path]) => path === headPath)) publish();
        });
        queue = result.catch(() => {}); return result;
      },
      writeBatch: () => {
        const updates = [];
        return { set: (path, value) => updates.push([path, copy(value)]), commit: async () => {
          if (gate) await gate.promise;
          if (!connected) throw Object.assign(new Error('offline'), { code: 'offline' });
          updates.forEach(([path, value]) => { data.set(path, value); writes.push({ name, path, value }); });
        } };
      },
      onState: (value, meta) => states.push({ value: copy(value), meta: copy(meta) }),
      onStatus: status => statuses.push({ ...copy(status), error: status.error }),
      ...extra
    };
    return { engine: runtime.BermanSharedReceiving.create(options), states, statuses,
      offline() { connected = false; }, online() { connected = true; } };
  }
  return { data, writes, reads, client, publish, snapshot,
    setGate(value) { gate = value; }, setReadGate(value) { readGate = value; },
    setTransactionGate(value) { transactionGate = value; },
    deliver(value, metadata) { for (const callback of listeners) callback(snapshot(headPath, value, metadata)); }
  };
}

test('all devices can edit immediately and receive each other without ownership', async () => {
  const s = server(), a = s.client('a'), b = s.client('b');
  await Promise.all([a.engine.start(), b.engine.start()]);
  assert.equal(a.engine.canEdit, true); assert.equal(b.engine.canEdit, true);
  await a.engine.save({ qty: 1 }); await a.engine.flush(); await until(() => b.engine.payload?.qty === 1);
  await b.engine.save({ qty: 2 }); await b.engine.flush(); await until(() => a.engine.payload?.qty === 2);
  const c = s.client('c'); await c.engine.start(); assert.equal(c.engine.payload.qty, 2);
  assert.equal(s.data.get(headPath).owner, null); assert.equal(s.data.get(headPath).schema, 2);
});

test('concurrent changes to different products merge without dropping either change', async () => {
  const s = server(), a = s.client('a'), b = s.client('b'); await Promise.all([a.engine.start(), b.engine.start()]);
  const base = { state: { receiptDraftId: 'one', receiptList: [{productId:'a',qty:1},{productId:'b',qty:2}] }, ui:{} };
  await a.engine.save(base); await a.engine.flush(); await until(() => !!b.engine.payload);
  const left = copy(base), right = copy(base); left.state.receiptList[0].qty = 3; right.state.receiptList[1].qty = 4;
  await Promise.all([a.engine.save(left), b.engine.save(right)]); await Promise.all([a.engine.flush(), b.engine.flush()]);
  await until(() => a.engine.payload.state.receiptList[1].qty === 4 && b.engine.payload.state.receiptList[0].qty === 3);
});

test('same-field collision preserves local and remote versions until an explicit choice', async () => {
  const s = server(), a = s.client('a'), b = s.client('b'); await Promise.all([a.engine.start(), b.engine.start()]);
  await a.engine.save({ qty:1 }); await a.engine.flush(); await until(() => b.engine.payload?.qty === 1);
  const gate = deferred(); s.setGate(gate);
  const x=a.engine.save({qty:2}), y=b.engine.save({qty:3}); x.catch(()=>{});y.catch(()=>{}); await tick();
  s.setGate(null); gate.resolve(); const results=await Promise.allSettled([x,y]);
  assert.equal(results.filter(r=>r.status==='rejected').length,1);
  const loser=a.engine.status.conflict?a:b, winner=loser===a?b:a;
  assert.equal(loser.engine.canEdit,false); assert.notEqual(loser.engine.payload.qty,loser===a?2:3);
  await loser.engine.resolveConflict(true); await until(()=>winner.engine.payload.qty===(loser===a?2:3));
  assert.equal(loser.engine.canEdit,true);
  assert.equal([...s.data.keys()].filter(p=>p.includes('receiving_conflict_')).length,1);
});

test('same simultaneous value is idempotent rather than duplicated', async () => {
  const s=server(),a=s.client('a'),b=s.client('b');await Promise.all([a.engine.start(),b.engine.start()]);
  await a.engine.save({qty:2});await a.engine.flush();await until(()=>b.engine.payload?.qty===2);
  await Promise.all([a.engine.save({qty:5}),b.engine.save({qty:5})]);await Promise.all([a.engine.flush(),b.engine.flush()]);
  assert.equal(a.engine.payload.qty,5);assert.equal(b.engine.payload.qty,5);
});

test('typing before the debounce fires is merged when a remote snapshot arrives', async () => {
  const s=server();let local=null;
  const a=s.client('a',{getLocal:()=>local,onState:value=>{local=copy(value);}}),b=s.client('b');
  await Promise.all([a.engine.start(),b.engine.start()]); local={left:1,right:1};await a.engine.save(local);await a.engine.flush();await until(()=>!!b.engine.payload);
  local.left=2;await b.engine.save({left:1,right:3});await b.engine.flush();await until(()=>local.right===3);await a.engine.flush();
  assert.deepEqual(local,{left:2,right:3});assert.deepEqual(copy(a.engine.payload),local);
});

test('coalesced local edits during an upload survive a concurrent remote edit', async()=>{
  const s=server(),a=s.client('a'),b=s.client('b');await Promise.all([a.engine.start(),b.engine.start()]);
  await a.engine.save({left:1,right:1});await a.engine.flush();await until(()=>!!b.engine.payload);
  const gate=deferred();s.setGate(gate);const first=a.engine.save({left:2,right:1});await tick();
  const second=a.engine.save({left:3,right:1}),other=b.engine.save({left:1,right:4});
  s.setGate(null);gate.resolve();await Promise.all([first,second,other]);await Promise.all([a.engine.flush(),b.engine.flush()]);
  await until(()=>a.engine.payload.right===4&&b.engine.payload.left===3);
});

test('large photos deduplicate across edits and obsolete chunks are cleaned safely',async()=>{
  const s=server(),a=s.client('a'),b=s.client('b');await Promise.all([a.engine.start(),b.engine.start()]);
  const photo='data:image/jpeg;base64,'+'abcdef'.repeat(300000),payload={pages:[{dataUrl:photo,baseDataUrl:photo}],qty:1};
  await a.engine.save(payload);await a.engine.flush();await until(()=>b.engine.payload?.qty===1);
  const count=s.writes.filter(w=>w.path.includes('receiving_chunk_')&&w.value).length;
  await b.engine.save({...payload,qty:2});await b.engine.flush();await until(()=>a.engine.payload?.qty===2);
  assert.equal(s.writes.filter(w=>w.path.includes('receiving_chunk_')&&w.value).length-count,1);
  assert.deepEqual(copy(a.engine.payload.pages),payload.pages);
  assert.ok(s.writes.filter(w=>w.value).every(w=>Buffer.byteLength(JSON.stringify(w.value))<950000));
  assert.equal([...s.data.keys()].filter(k=>k.includes('receiving_chunk_')).length,s.data.get(headPath).snapshot.refs.length);
});

test('offline retry merges independent newer server edits',async()=>{
  const s=server(),a=s.client('a'),b=s.client('b');await Promise.all([a.engine.start(),b.engine.start()]);
  await a.engine.save({left:1,right:1});await a.engine.flush();await until(()=>!!b.engine.payload);
  a.offline();await assert.rejects(a.engine.save({left:2,right:1}),{code:'offline'});
  await b.engine.save({left:1,right:3});await b.engine.flush();a.online();await a.engine.flush();
  await until(()=>b.engine.payload.left===2);assert.deepEqual(copy(a.engine.payload),{left:2,right:3});
});

test('a closed receipt cannot be resurrected by an old device pending upload',async()=>{
  const s=server(),a=s.client('a'),b=s.client('b');await Promise.all([a.engine.start(),b.engine.start()]);
  const base={state:{receiptDraftId:'one',receiptList:[{productId:'a',qty:1}]},ui:{}};
  const empty={state:{receiptDraftId:null,receiptList:[]},ui:{}};
  await a.engine.save(base);await a.engine.flush();await until(()=>!!b.engine.payload);
  a.offline();await assert.rejects(a.engine.save({...base,state:{...base.state,receiptList:[{productId:'a',qty:2}]}}),{code:'offline'});
  await b.engine.finish('one',{qty:1},empty);a.online();await assert.rejects(a.engine.flush(),{code:'conflict'});
  assert.equal(s.data.get(headPath).closed,true);assert.equal(s.data.get('artifacts/test/public/data/receipts/one').qty,1);
});

test('finalization rejects a receipt changed after the summary was reviewed',async()=>{
  const s=server(),a=s.client('a'),b=s.client('b');await Promise.all([a.engine.start(),b.engine.start()]);
  await a.engine.save({qty:1});await a.engine.flush();await until(()=>!!b.engine.payload);
  const gate=deferred();s.setGate(gate);const finishing=a.engine.finish('one',{qty:1},{qty:0});finishing.catch(()=>{});await tick();
  // Let B publish before A's empty manifest is ready.
  s.setGate(null);await b.engine.save({qty:2});await b.engine.flush();gate.resolve();
  await assert.rejects(finishing,{code:'revision-changed'});assert.equal(s.data.has('artifacts/test/public/data/receipts/one'),false);
});

test('atomic finalization from two devices writes one receipt only',async()=>{
  const s=server(),a=s.client('a'),b=s.client('b');await Promise.all([a.engine.start(),b.engine.start()]);
  await a.engine.save({qty:1});await a.engine.flush();await until(()=>!!b.engine.payload);
  await Promise.all([a.engine.finish('one',{qty:1},{qty:0}),b.engine.finish('one',{qty:1},{qty:0})]);
  assert.equal(s.writes.filter(w=>w.path.endsWith('/receipts/one')).length,1);
});

test('only paid scans are claimed, and other edits continue while a scan runs',async()=>{
  const s=server(),a=s.client('a'),b=s.client('b');await Promise.all([a.engine.start(),b.engine.start()]);
  await a.engine.save({state:{receiptDraftId:'one',qty:1}});await a.engine.flush();await until(()=>!!b.engine.payload);
  const outcomes=await Promise.allSettled([a.engine.acquireScan(),b.engine.acquireScan()]);
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(a.engine.canEdit,true);assert.equal(b.engine.canEdit,true);
  await b.engine.save({state:{receiptDraftId:'one',qty:2}});await b.engine.flush();await until(()=>a.engine.payload.state.qty===2);
  const owner=outcomes[0].status==='fulfilled'?a:b,token=outcomes.find(r=>r.status==='fulfilled').value;
  await owner.engine.releaseScan(token);const next=await b.engine.acquireScan();assert.ok(next.id);await b.engine.releaseScan(next);
});

test('v101 snapshots restore without claiming and the next edit upgrades their schema',async()=>{
  const s=server(),a=s.client('a');await a.engine.start();await a.engine.save({qty:1});await a.engine.flush();
  const head=s.data.get(headPath);s.data.set(headPath,{...head,schema:1,owner:'old-device',epoch:'old-epoch'});
  const b=s.client('b');await b.engine.start();assert.equal(b.engine.canEdit,true);assert.equal(b.engine.payload.qty,1);
  await b.engine.save({qty:1});await b.engine.flush();assert.equal(s.data.get(headPath).schema,2);assert.equal(s.data.get(headPath).owner,null);
});

test('cached snapshots never enable writes before authoritative hydration',async()=>{
  const s=server();let callback;const a=s.client('a',{onSnapshot:(_r,_o,next)=>{callback=next;next(s.snapshot(headPath,undefined,{fromCache:true}));return()=>{};}});
  let resolved=false;const started=a.engine.start().then(()=>resolved=true);await tick();assert.equal(resolved,false);assert.equal(a.engine.canEdit,false);
  callback(s.snapshot(headPath));await started;assert.equal(a.engine.canEdit,true);
});

test('a missing image chunk retains the previous local state',async()=>{
  const s=server(),a=s.client('a');await a.engine.start();await a.engine.save({qty:1});await a.engine.flush();
  const broken={...s.data.get(headPath),mutationId:'another-device',revision:a.engine.revision+1,snapshot:{id:'missing',chunks:['missing'],length:10}};
  s.deliver(broken);await until(()=>a.engine.status.error?.code==='missing-chunk');assert.equal(a.engine.payload.qty,1);
});

test('a content upload preserves a scan lease acquired while that upload was pending',async()=>{
  const s=server(),a=s.client('a'),b=s.client('b');await Promise.all([a.engine.start(),b.engine.start()]);
  await a.engine.save({state:{receiptDraftId:'one',qty:1}});await a.engine.flush();await until(()=>!!b.engine.payload);
  const gate=deferred();s.setGate(gate);
  const saving=a.engine.save({state:{receiptDraftId:'one',qty:2}});await tick();
  const token=await b.engine.acquireScan();
  s.setGate(null);gate.resolve();await saving;await a.engine.flush();
  assert.equal(s.data.get(headPath).scanLock.id,token.id);
  await assert.rejects(a.engine.acquireScan(),{code:'scan-busy'});
  await b.engine.releaseScan(token);
});
