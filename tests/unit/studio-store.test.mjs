// app/studio-store.js: the one place that reads and writes the studio's drafts in localStorage (`loadout-studio-v1`),
// for window.loadout.studio (app/api-studio.js) and the studio page. What it promises: a store it cannot read whole is
// never saved over, entries it does not understand are carried through untouched, every change is one synchronous
// read-change-write of one entry (so two writers on one storage do not undo each other), and a failed save waits in
// memory as that one entry, on top of whatever storage holds, until the next save that succeeds.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDraftStore, STUDIO_KEY, STORE_LIMITS, StoreRefused } from '../../app/studio-store.js';

function mem(text = null) {
  const m = new Map();
  if (text !== null) m.set(STUDIO_KEY, text);
  return { m, refuse: false, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem(k, v) { if (this.refuse) throw new Error('QuotaExceededError'); m.set(k, String(v)); }, removeItem: (k) => m.delete(k) };
}
const raw = (st) => JSON.parse(st.m.get(STUDIO_KEY));

test('studio-store: the key, the caps, and a fresh store', () => {
  assert.equal(STUDIO_KEY, 'loadout-studio-v1');
  assert.deepEqual({ ...STORE_LIMITS }, { drafts: 40, storeChars: 2 * 1024 * 1024, readChars: 8 * 1024 * 1024 });
  const st = mem();
  const s = createDraftStore(st);
  assert.deepEqual(s.read(), { entries: {}, problems: [], whole: true, over: false });
  assert.deepEqual(s.commit('a', () => ({ definition: { x: 1 }, savedAt: 1 })), { saved: true, warnings: [] });
  assert.deepEqual(raw(st), { version: 1, drafts: { a: { definition: { x: 1 }, savedAt: 1 } } });
});

test('studio-store: commit changes one entry and carries every other through, whatever it holds', () => {
  const st = mem(JSON.stringify({ version: 1, drafts: { odd: 'text', '<x>': [1], a: { definition: 1, mine: true } } }));
  const s = createDraftStore(st);
  s.commit('b', () => ({ definition: 2 }));
  s.commit('a', (was) => ({ ...was, definition: 3 }));
  assert.deepEqual(raw(st).drafts, { odd: 'text', '<x>': [1], a: { definition: 3, mine: true }, b: { definition: 2 } });
  s.commit('odd', () => undefined);
  assert.deepEqual(Object.keys(raw(st).drafts), ['<x>', 'a', 'b']);
});

test('studio-store: a store it cannot read whole refuses every commit and is left as it was', () => {
  for (const text of ['{"version":1,"drafts":{', '[]', '{"drafts":5}', '"x"', `{"drafts":{"a":"${'x'.repeat(STORE_LIMITS.readChars)}"}}`]) {
    const st = mem(text);
    const s = createDraftStore(st);
    const r = s.read();
    assert.equal(r.whole, false, text.slice(0, 20));
    assert.ok(r.problems.length);
    assert.throws(() => s.commit('a', () => ({ definition: 1 })), (e) => e instanceof StoreRefused && /loadout-studio-v1/.test(e.message));
    assert.equal(st.m.get(STUDIO_KEY), text);
  }
  const st = mem();
  st.getItem = () => { throw new Error('blocked'); };
  assert.throws(() => createDraftStore(st).commit('a', () => ({})), StoreRefused);
});

test('studio-store: over the size cap, a commit that does not shrink the store is refused; one that does is allowed', () => {
  const limits = { storeChars: 200 };
  const st = mem(JSON.stringify({ version: 1, drafts: { a: { t: 'x'.repeat(150) }, b: { t: 'y'.repeat(150) } } }));
  const s = createDraftStore(st, { limits });
  assert.equal(s.read().over, true);
  assert.equal(s.read().whole, true);
  assert.throws(() => s.commit('c', () => ({ t: 1 })), (e) => e instanceof StoreRefused && /room/.test(e.message));
  assert.deepEqual(s.commit('a', () => undefined).saved, true);
  assert.deepEqual(Object.keys(raw(st).drafts), ['b']);
});

test('studio-store: a failed save waits as that entry only, over what storage holds now', () => {
  const st = mem();
  const s = createDraftStore(st);
  s.commit('a', () => ({ v: 1 }));
  st.refuse = true;
  const w = s.commit('b', () => ({ v: 2 }));
  assert.equal(w.saved, false);
  assert.match(w.warnings[0], /could not be saved/);
  assert.equal(s.pending(), true);
  // another writer changes a and adds c, straight to storage
  st.m.set(STUDIO_KEY, JSON.stringify({ version: 1, drafts: { a: { v: 'theirs' }, c: { v: 3 } } }));
  assert.deepEqual(s.read().entries, { a: { v: 'theirs' }, c: { v: 3 }, b: { v: 2 } });
  st.refuse = false;
  assert.equal(s.commit('d', () => ({ v: 4 })).saved, true);
  assert.equal(s.pending(), false);
  assert.deepEqual(raw(st).drafts, { a: { v: 'theirs' }, c: { v: 3 }, b: { v: 2 }, d: { v: 4 } });
  // a removal can wait too
  st.refuse = true;
  s.commit('c', () => undefined);
  assert.equal('c' in s.read().entries, false);
  st.refuse = false;
  s.commit('e', () => ({ v: 5 }));
  assert.deepEqual(Object.keys(raw(st).drafts), ['a', 'b', 'd', 'e']);
});

test('studio-store: prototype keys in stored text are dropped and touch nothing', () => {
  const st = mem('{"version":1,"drafts":{"__proto__":{"polluted":1},"a":{"constructor":{"x":1},"v":1}}}');
  const s = createDraftStore(st);
  const r = s.read();
  assert.deepEqual(Object.keys(r.entries), ['a']);
  assert.equal(({}).polluted, undefined);
  s.commit('b', () => ({ v: 2 }));
  assert.deepEqual(raw(st).drafts, { a: { v: 1 }, b: { v: 2 } });
});

test('studio-store: runs in the browser and in Node, and every export says what it is for', () => {
  const src = fs.readFileSync(new URL('../../app/studio-store.js', import.meta.url), 'utf8');
  assert.ok(!/from ['"]node:|import\(['"]node:|^import /m.test(src), 'no imports at all');
  const lines = src.split('\n');
  lines.forEach((l, i) => { if (/^export /.test(l)) assert.ok(/\*\/\s*$|^\s*\/\//.test(lines[i - 1] ?? ''), `line ${i + 1} has a comment above it`); });
});
