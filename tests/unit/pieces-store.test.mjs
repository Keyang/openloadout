// B7: the loader. A store reads piece files through a reader (fetch in the browser, the disk in Node), checks each
// once, keeps it frozen for the rest of the visit (a released version never changes, so it never goes stale), loads
// what a piece uses in turn, and then hands pieces out synchronously to the resolver (B4) and dataSprite (B6).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPieceStore, sitePieces, siteReader } from '../../engine/pieces.js';

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'pieces');
const text = (rel) => fs.readFileSync(path.join(FIX, rel), 'utf8');

/** A reader over a map of files, counting reads; `delay` lets two loads overlap. */
function memReader(files, { delay = 0 } = {}) {
  const reads = [];
  const read = async (rel) => {
    reads.push(rel);
    if (delay) await new Promise((r) => setTimeout(r, delay));
    if (!(rel in files)) throw new Error(`${rel}: not found (404)`);
    return files[rel];
  };
  return { read, reads };
}
const FIXTURES = () => ({
  'pieces/stamp-test-clod.v1.json': text('pieces/stamp-test-clod.v1.json'),
  'pieces/part-test-tuft.v1.json': text('pieces/part-test-tuft.v1.json'),
});

test('load reads a piece and what it uses, once each, and get hands them out synchronously', async () => {
  const m = memReader(FIXTURES(), { delay: 5 });
  const store = createPieceStore({ read: m.read });
  assert.equal(store.get('part:test-tuft@1'), undefined);
  const [a, b] = await Promise.all([store.load('part:test-tuft@1'), store.load({ use: 'part:test-tuft', v: 1 })]);
  assert.equal(a, b, 'the same frozen object');
  assert.equal(a.id, 'part:test-tuft');
  assert.ok(Object.isFrozen(a.body.draw[0]));
  assert.equal(store.get('stamp:test-clod@1').id, 'stamp:test-clod', 'what it uses came too');
  assert.equal(store.has('stamp:test-clod', 1), true);
  assert.deepEqual(m.reads.sort(), ['pieces/part-test-tuft.v1.json', 'pieces/stamp-test-clod.v1.json']);
  await store.load('stamp:test-clod@1');
  assert.equal(m.reads.length, 2, 'cached: no second read');
  assert.deepEqual(store.list(), ['part:test-tuft@1', 'stamp:test-clod@1']);
});

test('loadFor loads every piece a definition names and never throws', async () => {
  const store = createPieceStore({ read: memReader(FIXTURES()).read });
  const def = { body: { pictures: { draw: [{ kind: 'use', use: 'part:test-tuft', v: 1, paint: { hair: 'leaf' } }] } } };
  const r = await store.loadFor(def);
  assert.equal(r.ok, true, r.errors.join(' '));
  assert.deepEqual(r.refs, ['part:test-tuft@1', 'stamp:test-clod@1']);
  const bad = await store.loadFor({ body: { pictures: { draw: [{ kind: 'use', use: 'part:nope', v: 1 }, { kind: 'use', use: 'part:x' }] } } });
  assert.equal(bad.ok, false);
  assert.match(bad.errors.join(' '), /part:nope@1/);
  assert.match(bad.errors.join(' '), /version/);
});

test('a failed read is not kept: the next load tries again', async () => {
  const files = {};
  const m = memReader(files);
  const store = createPieceStore({ read: m.read });
  await assert.rejects(store.load('stamp:test-clod@1'), /stamp-test-clod\.v1\.json.*not found/);
  files['pieces/stamp-test-clod.v1.json'] = text('pieces/stamp-test-clod.v1.json');
  assert.equal((await store.load('stamp:test-clod@1')).v, 1);
});

test('a piece that fails its check, or sits in the wrong file, is refused with the file named', async () => {
  const wrong = JSON.parse(text('pieces/stamp-test-clod.v1.json')); wrong.v = 2;
  const store = createPieceStore({ read: memReader({ 'pieces/stamp-test-clod.v1.json': JSON.stringify(wrong) }).read });
  await assert.rejects(store.load('stamp:test-clod@1'), /pieces\/stamp-test-clod\.v1\.json/);
  const hooked = createPieceStore({ read: memReader(FIXTURES()).read, check: (p) => (p.id === 'stamp:test-clod' ? ['rows: too wide'] : []) });
  await assert.rejects(hooked.load('part:test-tuft@1'), /stamp:test-clod@1.*too wide/);
  assert.equal(hooked.get('stamp:test-clod@1'), undefined);
});

test('a loop between pieces and a chain too deep are refused, and nothing hangs', async () => {
  const piece = (id, uses) => JSON.stringify({ format: 'loadout-piece', version: 1, id, v: 1, name: 'x', about: 'A test piece.', slots: [],
    body: { draw: uses.map((u) => ({ kind: 'use', use: u, v: 1 })) } });
  const loop = createPieceStore({ read: memReader({ 'pieces/part-a.v1.json': piece('part:a', ['part:b']), 'pieces/part-b.v1.json': piece('part:b', ['part:a']) }).read });
  await assert.rejects(Promise.all([loop.load('part:a@1'), loop.load('part:b@1')]), /loop/);
  const files = {};
  for (let i = 0; i < 8; i++) files[`pieces/part-c${i}.v1.json`] = piece(`part:c${i}`, i < 7 ? [`part:c${i + 1}`] : []);
  await assert.rejects(createPieceStore({ read: memReader(files).read }).load('part:c0@1'), /deep/);
});

test('add puts a checked piece in by hand (Node preloading, the studio, tests)', () => {
  const store = createPieceStore();
  const p = store.add(text('pieces/stamp-test-clod.v1.json'));
  assert.equal(store.get('stamp:test-clod@1'), p);
  assert.throws(() => store.add({ format: 'loadout-piece' }), /id/);
});

test('the index comes from the reader (generated/pieces.json) or from an option, once', async () => {
  let n = 0;
  const idx = { format: 'loadout-pieces', version: 1, pieces: [] };
  const s1 = createPieceStore({ read: async (rel) => { n++; assert.equal(rel, 'generated/pieces.json'); return JSON.stringify(idx); } });
  assert.deepEqual(await s1.index(), idx);
  await s1.index();
  assert.equal(n, 1);
  const s2 = createPieceStore({ index: () => idx });
  assert.equal(await s2.index(), idx);
});

test('the site store reads by fetch from the site folder, and can be given another reader', async () => {
  const urls = [];
  const fakeFetch = async (u) => { urls.push(String(u)); return { ok: true, status: 200, text: async () => text('pieces/stamp-test-clod.v1.json') }; };
  const read = siteReader('https://example.test/loadout/', fakeFetch);
  assert.equal(await read('pieces/stamp-test-clod.v1.json'), text('pieces/stamp-test-clod.v1.json'));
  assert.deepEqual(urls, ['https://example.test/loadout/pieces/stamp-test-clod.v1.json']);
  const notFound = siteReader('https://example.test/', async () => ({ ok: false, status: 404, text: async () => '' }));
  await assert.rejects(notFound('pieces/x-y.v1.json'), /404/);
  // in Node the site folder is a file: address and fetch cannot read it: the message says what to do
  await assert.rejects(siteReader()('pieces/stamp-test-clod.v1.json'), /tools\/lib\/pieces-index\.mjs/);
  const store = sitePieces();
  assert.equal(sitePieces(), store, 'one store per page');
  store.useReader(memReader(FIXTURES()).read);
  assert.equal((await store.load('stamp:test-clod@1')).id, 'stamp:test-clod');
});

// ---- review fixes (B7 round 2): only pieces whose whole closure passed are handed out; one cap per loadFor ----

import { PIECE_LIMITS } from '../../engine/pieces.js';
const testPiece = (id, uses, kind = 'part') => JSON.stringify({ format: 'loadout-piece', version: 1, id, v: 1, name: 'x', about: 'A test piece.', slots: [],
  body: kind === 'stamp' ? { rows: ['a'] } : { draw: uses.map((u) => ({ kind: 'use', use: u, v: 1 })) } });

test('a refused load hands nothing out: get, has and list never see a loop', async () => {
  const loop = createPieceStore({ read: memReader({ 'pieces/part-a.v1.json': testPiece('part:a', ['part:b']), 'pieces/part-b.v1.json': testPiece('part:b', ['part:a']) }).read });
  await assert.rejects(loop.load('part:a@1'), /loop/);
  assert.equal(loop.get('part:a@1'), undefined);
  assert.equal(loop.get('part:b@1'), undefined);
  assert.equal(loop.has('part:a', 1), false);
  assert.deepEqual(loop.list(), []);
  const r = await loop.loadFor({ x: { kind: 'use', use: 'part:b', v: 1 } });
  assert.equal(r.ok, false);
  assert.deepEqual(r.refs, []);
  assert.deepEqual(loop.list(), []);
});

test('a chain too deep: the top is refused, the pieces deep enough on their own are kept', async () => {
  const files = {};
  for (let i = 0; i < 8; i++) files[`pieces/part-c${i}.v1.json`] = testPiece(`part:c${i}`, i < 7 ? [`part:c${i + 1}`] : []);
  const store = createPieceStore({ read: memReader(files).read });
  await assert.rejects(store.load('part:c0@1'), /deep/);
  assert.equal(store.get('part:c0@1'), undefined);
  assert.equal(store.has('part:c3@1'), true, `c3 uses ${PIECE_LIMITS.depth} more: within the cap`);
  assert.equal(store.has('part:c2@1'), false);
});

test('loadFor shares one cap across the whole definition and stops reading when it is reached', async () => {
  const files = {};
  const parts = Array.from({ length: PIECE_LIMITS.usesPerAsset }, (_, i) => `part:p${i}`);
  parts.forEach((p, i) => {
    const stamps = Array.from({ length: 20 }, (_, j) => `stamp:s${i}-${j}`);
    files[`pieces/part-p${i}.v1.json`] = testPiece(p, stamps);
    for (const s of stamps) files[`pieces/${s.replace(':', '-')}.v1.json`] = testPiece(s, [], 'stamp');
  });
  const m = memReader(files);
  const store = createPieceStore({ read: m.read });
  const r = await store.loadFor({ body: { pictures: { draw: parts.map((p) => ({ kind: 'use', use: p, v: 1 })) } } });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), new RegExp(`${PIECE_LIMITS.closure}`));
  assert.ok(m.reads.length <= PIECE_LIMITS.closure, `${m.reads.length} reads`);
  assert.deepEqual(store.list(), [], 'nothing of a refused definition is handed out');
});

test('loadFor keeps the good pieces of a definition when another of its pieces fails', async () => {
  const store = createPieceStore({ read: memReader(FIXTURES()).read });
  const r = await store.loadFor({ a: { kind: 'use', use: 'part:test-tuft', v: 1 }, b: { kind: 'use', use: 'part:nope', v: 1 } });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /part:nope@1/);
  assert.deepEqual(r.refs, ['part:test-tuft@1', 'stamp:test-clod@1']);
  assert.equal(store.has('part:test-tuft@1'), true);
});

test('add by hand hands a piece out once everything it uses is handed out', async () => {
  const store = createPieceStore({ read: memReader(FIXTURES()).read });
  const t = store.add(text('pieces/part-test-tuft.v1.json'));
  assert.equal(store.get('part:test-tuft@1'), undefined, 'what it uses is not loaded yet');
  assert.equal(await store.load('part:test-tuft@1'), t, 'load finishes it without a second read of it');
  assert.equal(store.has('stamp:test-clod@1'), true);
});
