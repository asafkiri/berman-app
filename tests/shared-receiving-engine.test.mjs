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

test('two devices hydrate the same receipt, reload resumes, and only one initial claim wins', async () => {
  const s = server(), a = s.client('a'), b = s.client('b');
  await Promise.all([a.engine.start(), b.engine.start()]);
  const claims = await Promise.allSettled([a.engine.claim(), b.engine.claim()]);
  assert.deepEqual(claims.map(x => x.status), ['fulfilled', 'rejected']);
  assert.equal(a.engine.isOwner, true); assert.equal(b.engine.isOwner, false);
  await a.engine.save({ items: [{ id: 'bread', qty: 7 }], stage: 'counting' });
  await until(() => b.engine.payload?.stage === 'counting');
  assert.deepEqual(b.states.at(-1).value, { items: [{ id: 'bread', qty: 7 }], stage: 'counting' });
  const c = s.client('reload'); await c.engine.start();
  assert.deepEqual(copy(c.engine.payload), b.states.at(-1).value);
  assert.equal(c.engine.isOwner, false);
  await c.engine.claim(true);
  assert.equal(c.engine.isOwner, true); assert.equal(a.engine.isOwner, false);
  await assert.rejects(a.engine.save({ items: [] }), { code: 'not-owner' });
});

test('takeover fences an upload that started on the old device', async () => {
  const s = server(), a = s.client('a'), b = s.client('b');
  await Promise.all([a.engine.start(), b.engine.start()]); await a.engine.claim();
  await a.engine.save({ qty: 2 }); await tick();
  const gate = deferred(); s.setGate(gate);
  const pending = a.engine.save({ qty: 99 }); pending.catch(() => {}); await tick();
  await b.engine.claim(true);
  assert.equal(a.engine.isOwner, false, 'Owner must be fenced before image hydration completes');
  s.setGate(null); gate.resolve();
  await assert.rejects(pending, { code: 'not-owner' });
  await b.engine.save({ qty: 3 }); await tick();
  const c = s.client('c'); await c.engine.start();
  assert.deepEqual(copy(c.engine.payload), { qty: 3 });
});

test('large multi-page state shares photos once, supports Unicode and deduplicates base image', async () => {
  const s = server(), a = s.client('a'), b = s.client('b');
  await Promise.all([a.engine.start(), b.engine.start()]); await a.engine.claim();
  const photo = 'data:image/jpeg;base64,' + 'abcdefghi'.repeat(290000);
  const payload = { pages: [{ dataUrl: photo, baseDataUrl: photo }], note: '🥖לחם'.repeat(40000), qty: 1 };
  await a.engine.save(payload); await tick(); await tick();
  assert.deepEqual(b.states.at(-1).value, payload);
  const photoWrites = s.writes.filter(w => w.path.includes('receiving_chunk_') && w.value);
  assert.ok(photoWrites.length < 25, 'Identical image fields must share chunks');
  assert.ok(photoWrites.every(w => Buffer.byteLength(JSON.stringify(w.value)) < 950000));
  const count = photoWrites.length, bReads = s.reads.filter(r => r.name === 'b').length;
  await a.engine.save({ ...payload, qty: 2 }); await tick(); await tick();
  assert.equal(s.writes.filter(w => w.path.includes('receiving_chunk_') && w.value).length - count, 1, 'Only the new manifest uploads');
  assert.equal(s.reads.filter(r => r.name === 'b').length - bReads, 1, 'Only the new manifest downloads');
  assert.equal(b.states.at(-1).value.qty, 2);
});

test('coalesced saves do not replay own old payload over newer local edits', async () => {
  const s = server(), a = s.client('a'); await a.engine.start(); await a.engine.claim();
  const previousStates = a.states.length;
  const gate = deferred(); s.setGate(gate);
  const first = a.engine.save({ qty: 1 }); await tick();
  const second = a.engine.save({ qty: 2 }); const third = a.engine.save({ qty: 3 });
  s.setGate(null); gate.resolve(); await Promise.all([first, second, third]); await a.engine.flush();
  assert.deepEqual(copy(a.engine.payload), { qty: 3 });
  assert.equal(a.states.length, previousStates, 'Local saves only update status');
  const b = s.client('b'); await b.engine.start(); assert.deepEqual(copy(b.engine.payload), { qty: 3 });
});

test('receipt and empty draft finalize atomically and repeated finish is idempotent', async () => {
  const s = server(), a = s.client('a'), b = s.client('b');
  await Promise.all([a.engine.start(), b.engine.start()]); await a.engine.claim();
  await a.engine.save({ qty: 2 });
  await a.engine.finish('receipt-one', { total: 70, qty: 2 }, { qty: 0 }); await tick();
  assert.deepEqual(s.data.get('artifacts/test/public/data/receipts/receipt-one'), { total: 70, qty: 2 });
  assert.equal(s.data.get(headPath).closed, true); assert.deepEqual(b.states.at(-1).value, { qty: 0 });
  await a.engine.finish('receipt-one', { total: 900 }, { qty: 0 });
  assert.equal(s.writes.filter(w => w.path.endsWith('/receipts/receipt-one')).length, 1);
  await a.engine.save({ qty: 4 });
  await assert.rejects(a.engine.finish('receipt-one', { total: 800 }, { qty: 0 }), { code: 'receipt-exists' });
  assert.deepEqual(copy(a.engine.payload), { qty: 4 });
});

test('takeover while finalizing cannot create a receipt or clear the shared draft', async () => {
  const s = server(), a = s.client('a'), b = s.client('b');
  await Promise.all([a.engine.start(), b.engine.start()]); await a.engine.claim(); await a.engine.save({ qty: 2 });
  const gate = deferred(); s.setGate(gate);
  const finish = a.engine.finish('must-not-exist', { qty: 2 }, { qty: 0 }); finish.catch(() => {}); await tick();
  await b.engine.claim(true); s.setGate(null); gate.resolve();
  await assert.rejects(finish, { code: 'not-owner' });
  assert.equal(s.data.has('artifacts/test/public/data/receipts/must-not-exist'), false);
  assert.deepEqual(copy(b.engine.payload), { qty: 2 });
});

test('offline commits never publish a head, and unsent edits can be retried after reconnect', async () => {
  const s = server(), a = s.client('a'); await a.engine.start(); await a.engine.claim(); await a.engine.save({ qty: 1 });
  const revision = a.engine.revision;
  const gate = deferred(); s.setGate(gate);
  const save = a.engine.save({ qty: 4 }); save.catch(() => {}); await tick(); a.offline(); gate.resolve(); s.setGate(null);
  await assert.rejects(save, { code: 'offline' });
  assert.equal(a.engine.revision, revision); assert.equal(a.engine.status.dirty, true);
  a.online(); await a.engine.flush();
  const b = s.client('b'); await b.engine.start(); assert.deepEqual(copy(b.engine.payload), { qty: 4 });
});

test('cache-only snapshots do not enable editing or resolve initial readiness', async () => {
  const s = server(); let callback;
  const a = s.client('a', { onSnapshot: (_ref, _opts, next) => { callback = next; next(s.snapshot(headPath, undefined, { fromCache: true })); return () => {}; } });
  let resolved = false; const start = a.engine.start().then(() => { resolved = true; }); await tick();
  assert.equal(resolved, false); assert.equal(a.engine.ready, false);
  await assert.rejects(a.engine.save({ qty: 9 }), { code: 'not-owner' });
  await callback(s.snapshot(headPath)); await start; assert.equal(a.engine.ready, true);
});

test('missing chunks retain previous good payload and block editing', async () => {
  const s = server(), a = s.client('a'), b = s.client('b');
  await Promise.all([a.engine.start(), b.engine.start()]); await a.engine.claim(); await a.engine.save({ qty: 1 }); await tick();
  const old = copy(b.engine.payload), oldHead = s.data.get(headPath);
  const corrupt = { ...oldHead, revision: oldHead.revision + 1, snapshot: { id: 'broken', chunks: ['missing'], length: 100 } };
  s.data.set(headPath, corrupt); s.publish(); await tick();
  assert.deepEqual(copy(b.engine.payload), old); assert.equal(b.engine.ready, false);
  assert.equal(b.engine.status.error.code, 'missing-chunk');
});

test('late hydration cannot replace the newer head', async () => {
  const s = server(), a = s.client('a'); await a.engine.start(); await a.engine.claim(); await a.engine.save({ qty: 1 });
  const oldHead = copy(s.data.get(headPath));
  await a.engine.save({ qty: 2 }); const newHead = copy(s.data.get(headPath));
  const gate = deferred(); s.setReadGate(gate);
  const b = s.client('b'); const start = b.engine.start(); start.catch(() => {}); await tick();
  // The newer load is pending, then an old network callback arrives.
  s.deliver(oldHead); s.setReadGate(null); gate.resolve(); await tick(); await tick();
  assert.deepEqual(copy(b.engine.payload), { qty: 2 });
  assert.equal(b.engine.revision, newHead.revision);
  await start;
});

test('reopened receipt only replaces exactly the receipt version that was reopened', async () => {
  const s = server(), a = s.client('a'); await a.engine.start(); await a.engine.claim();
  const path = 'artifacts/test/public/data/receipts/reopened', old = { noDoc: true, qty: 3, timestamp: 123 };
  s.data.set(path, old); await a.engine.save({ qty: 3 });
  await a.engine.finish('reopened', { noDoc: false, qty: 3, amount: 45 }, { qty: 0 }, { expectedReceipt: { timestamp: 123, qty: 3, noDoc: true } });
  assert.equal(s.data.get(path).amount, 45);
  await a.engine.save({ qty: 4 });
  await assert.rejects(a.engine.finish('reopened', { qty: 4 }, { qty: 0 }, { expectedReceipt: old }), { code: 'receipt-exists' });
  assert.deepEqual(s.data.get(path), { noDoc: false, qty: 3, amount: 45 });
});

test('latest edit made while offline survives an older upload failure', async () => {
  const s = server(), a = s.client('a'); await a.engine.start(); await a.engine.claim(); await a.engine.save({ qty: 1 }); await a.engine.flush();
  const gate = deferred(); s.setGate(gate);
  const save = a.engine.save({ qty: 2 }); save.catch(() => {}); await tick();
  a.offline(); await assert.rejects(a.engine.save({ qty: 3 }), { code: 'offline' });
  gate.resolve(); s.setGate(null); await assert.rejects(save, { code: 'offline' });
  a.online(); await a.engine.flush();
  const b = s.client('b'); await b.engine.start(); assert.deepEqual(copy(b.engine.payload), { qty: 3 });
});

test('timed-out transaction cannot publish later when its delayed read completes', async () => {
  const s = server(), a = s.client('a', { timeoutMs: 20 });
  await a.engine.start(); await a.engine.claim(); await a.engine.save({ qty: 1 }); await a.engine.flush();
  const previous = s.data.get(headPath).revision, gate = deferred(); s.setTransactionGate(gate);
  await assert.rejects(a.engine.save({ qty: 2 }), { code: 'timeout' });
  s.setTransactionGate(null); gate.resolve(); await tick(); await tick();
  assert.equal(s.data.get(headPath).revision, previous);
  await a.engine.flush(); assert.equal(s.data.get(headPath).revision, previous + 1);
});

test('garbage collection bounds remote chunks and cached old photos are reuploaded when reused', async () => {
  const s = server(), a = s.client('a'), b = s.client('b');
  await Promise.all([a.engine.start(), b.engine.start()]); await a.engine.claim();
  const firstPhoto = 'first-photo'.repeat(20000), secondPhoto = 'second-photo'.repeat(20000);
  await a.engine.save({ photo: firstPhoto, qty: 1 }); await a.engine.flush();
  await until(() => b.engine.payload?.photo === firstPhoto);
  const oldKeys = new Set(s.data.get(headPath).snapshot.refs);
  for (let qty = 2; qty < 7; qty++) { await a.engine.save({ photo: secondPhoto, qty }); await a.engine.flush(); }
  assert.equal(s.data.get(headPath).garbage.length, 0);
  assert.equal([...s.data.keys()].filter(path => path.includes('receiving_chunk_')).length, s.data.get(headPath).snapshot.refs.length);
  assert.ok([...oldKeys].every(key => !s.data.has('artifacts/test/public/data/drafts/receiving_chunk_' + key)));
  await until(() => b.engine.payload?.qty === 6); await b.engine.claim(true);
  await b.engine.save({ photo: firstPhoto, qty: 7 }); await b.engine.flush();
  const c = s.client('c'); await c.engine.start(); assert.deepEqual(copy(c.engine.payload), { photo: firstPhoto, qty: 7 });
  await b.engine.finish('done', { qty: 7 }, { qty: 0 });
  assert.equal([...s.data.keys()].filter(path => path.includes('receiving_chunk_')).length, 1, 'Finalization removes all live photo chunks');
});
