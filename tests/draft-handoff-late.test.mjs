// v137 — שמירה שנכנסה מאוחר (אחרי "לא נשמרה") והעבודה שנעשתה אחריה; עותקים בצד של קליטה שנשמרה בטלפון אחר.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createCloud, memoryStorage } from './fake-firestore.mjs';

const source = fs.readFileSync(new URL('../draft-handoff.js', import.meta.url), 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));
const settle = async (ms = 40) => { for (let i = 0; i < 6; i++) { await new Promise(r => setImmediate(r)); } await wait(ms); for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r)); };
const T = { backup: 250, take: 250, finish: 250, close: 250, read: 250, debounce: 5, retry: 60, grace: 10, settleCap: 400 };
const j = x => JSON.parse(JSON.stringify(x));
const docPath = sid => 'root/drafts/handoff_test_receiving_' + sid;
const recPath = id => 'root/records/' + id;
const alive = [];
test.afterEach(() => { while (alive.length) { try { alive.pop().stop(); } catch (e) {} } });
function phone(cloud, name, opts = {}) {
  const client = cloud.client({ cache: opts.cache });
  const storage = opts.storage || memoryStorage();
  const ctx = vm.createContext({ console, TextEncoder, crypto: globalThis.crypto, setTimeout, clearTimeout });
  vm.runInContext(source, ctx);
  const p = { name, client, storage, notices: [], finished: [], applied: [],
    d: opts.draft ? JSON.parse(JSON.stringify(opts.draft)) : { sessionId: null, recordId: null, items: {}, scan: false, expected: null, big: '' } };
  const adapter = {
    getDraft: () => ({ sessionId: p.d.sessionId, recordId: p.d.recordId || p.d.sessionId, empty: !p.d.sessionId,
      payload: p.d.sessionId ? JSON.stringify({ v: 1, sessionId: p.d.sessionId, recordId: p.d.recordId, items: p.d.items, expected: p.d.expected, big: p.d.big }) : null,
      summary: { lines: Object.keys(p.d.items).length }, scanRunning: !!p.d.scan, expected: p.d.expected }),
    validatePayload: (x, doc) => x && x.v === 1 && x.sessionId === doc.sessionId,
    applyPayload: text => { const x = JSON.parse(text); p.applied.push(x.sessionId); p.d = { sessionId: x.sessionId, recordId: x.recordId, items: x.items, scan: false, expected: x.expected || null, big: x.big || '' }; p.h && p.h.changed(); },
    emptyDraft: () => { p.d = { sessionId: null, recordId: null, items: {}, scan: false, expected: null, big: '' }; p.h && p.h.changed(); },
    recordSaved: id => !!cloud.get(recPath(id)),
    deviceName: () => name,
    onNotice: code => p.notices.push(code),
    finishedLate: sid => { p.finished.push(sid); adapter.emptyDraft(); }
  };
  p.h = ctx.DraftHandoff.create({ app: 'test', kind: 'receiving', prefix: 'tt', db: client.db, fs: client.fs, rootPath: ['root'],
    recordCollection: 'records', storage, isOnline: client.isOnline, appVersion: 't1', maxScanMs: opts.maxScanMs || 300,
    lifecycle: false, timeouts: opts.timeouts || T, adapter, now: opts.now });
  alive.push(p.h);
  p.start = () => p.h.start();
  p.newDraft = (sid, expected = null, recordId = null) => { p.d = { sessionId: sid, recordId: recordId || sid, items: {}, scan: false, expected, big: '' }; p.h.changed({ user: true }); };
  p.set = (product, qty, user = true) => { p.d.items[product] = qty; p.h.changed({ user }); };
  p.state = () => j(p.h.state());
  p.debug = () => j(p.h._debug());
  return p;
}
const doc = (cloud, sid) => cloud.get(docPath(sid));
const empty = () => ({ sessionId: null, recordId: null, items: {}, scan: false, expected: null, big: '' });


test('L1 stuck save lands after "not saved": the edit made after the failure message must not vanish', async () => {
  const cloud = createCloud();
  const a = phone(cloud, 'A'); a.start(); await settle();
  a.newDraft('r1'); a.set('bread', 3); await settle();
  cloud.commitDelayMs = 1000;            // commit sent, stuck past the settle cap (400) — lands at ~1000ms
  const f = await a.h.finish('r1', { items: { ...a.d.items } });
  cloud.commitDelayMs = 0;
  assert.equal(f.unknown, true);
  await settle(450);
  assert.ok(a.notices.includes('finish-not-saved'), 'decided "not saved"');
  assert.equal(a.state().readOnly, false);
  a.client.setOnline(false);             // weak network: the backup of the next edit does not get through
  a.set('milk', 2);                      // the user keeps working after "not saved"
  await settle(450);                     // the stuck commit lands now
  a.client.setOnline(true); await settle(120);
  assert.equal(a.state().away.away, 'saved');            // "כבר נשמרה — כאן היא עותק ישן"
  assert.deepEqual(cloud.get(recPath('r1')).items, { bread: 3 });
  a.h.clear();
  const kept = a.debug().side.some(x => JSON.parse(x.payload).items.milk === 2);
  assert.ok(kept, 'the edit made after "not saved" survives somewhere');   // FAILS on v137
});

test('S1 ping-pong: a "same" side copy of a receipt saved on the other phone is still offered with "פתח אותה"', async () => {
  const cloud = createCloud();
  const a = phone(cloud, 'A'), b = phone(cloud, 'B'); a.start(); b.start(); await settle();
  a.newDraft('r1'); a.set('bread', 3); await settle();
  await b.h.take('r1'); await settle();
  a.d.items.local = 1;
  assert.equal((await a.h.take('r1')).ok, true); await settle();
  assert.equal((await b.h.take('r1')).ok, true); await settle();
  assert.equal((await b.h.finish('r1', { items: b.d.items })).ok, true); await settle();
  a.h.clear(); await settle();
  assert.deepEqual(a.state().side, [], 'record exists -> not offered (spec 5.8)');   // FAILS on v137
});
