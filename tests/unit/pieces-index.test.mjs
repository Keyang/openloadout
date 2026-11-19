// B7: the pieces index (tools/lib/pieces-index.mjs). It scans pieces/ (no list to keep), checks every file, and
// writes generated/pieces.json, which the site and the v2 schema read to know which pieces and versions exist.
// Released versions are pinned in pieces/_pins.json by a hash of their content: a pinned version that changes fails
// here, so "a released version never changes" (Contract 15 rule 5) is a test, not a promise.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPiecesIndex, checkPins, pinPieces, readPins, pieceHash, nodePieceReader, nodePieceStore, pieceFilesFor, writePiecesIndex } from '../../tools/lib/pieces-index.mjs';

const REAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIX = path.join(REAL, 'tests', 'fixtures', 'pieces');

function tempRoot(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-pieces-'));
  fs.mkdirSync(path.join(root, 'pieces'));
  for (const [f, t] of Object.entries(files)) fs.writeFileSync(path.join(root, 'pieces', f), t);
  return root;
}
const fixtureFiles = () => Object.fromEntries(fs.readdirSync(path.join(FIX, 'pieces')).map((f) => [f, fs.readFileSync(path.join(FIX, 'pieces', f), 'utf8')]));

test('the index lists every piece file in the folder, sorted, with what the site and the schema need', () => {
  const { index, errors } = buildPiecesIndex({ root: FIX });
  assert.deepEqual(errors, []);
  assert.equal(index.format, 'loadout-pieces');
  assert.equal(index.version, 1);
  const files = fs.readdirSync(path.join(FIX, 'pieces')).filter((f) => f.endsWith('.json') && !f.startsWith('_')).map((f) => `pieces/${f}`).sort();
  assert.deepEqual(index.pieces.map((p) => p.file).sort(), files);
  assert.deepEqual(index.pieces.map((p) => p.ref), ['part:test-tuft@1', 'stamp:test-clod@1']);
  const tuft = index.pieces[0];
  assert.deepEqual(Object.keys(tuft).sort(), ['about', 'args', 'bytes', 'cost', 'file', 'hash', 'id', 'kind', 'latest', 'name', 'ref', 'slots', 'uses', 'v'].sort());
  assert.deepEqual(tuft.slots, [{ id: 'hair', label: 'Tuft', default: '#3a6e2a', material: 'plant' }]);
  assert.deepEqual(tuft.args, { length: { type: 'px', lo: 1, hi: 4, default: 2 } });
  assert.equal(tuft.cost, 3);
  assert.deepEqual(tuft.uses, ['stamp:test-clod@1']);
  assert.equal(tuft.latest, true);
  assert.match(tuft.hash, /^[0-9a-f]{16}$/);
});

test('versions: each is its own file, and only the highest is the latest', () => {
  const files = fixtureFiles();
  const v2 = JSON.parse(files['stamp-test-clod.v1.json']); v2.v = 2; v2.body.rows = ['bb', 'aa'];
  const root = tempRoot({ ...files, 'stamp-test-clod.v2.json': JSON.stringify(v2) });
  const { index } = buildPiecesIndex({ root });
  const clods = index.pieces.filter((p) => p.id === 'stamp:test-clod');
  assert.deepEqual(clods.map((p) => [p.v, p.latest]), [[1, false], [2, true]]);
});

test('a bad file is an error naming it; README and files starting with _ are not pieces', () => {
  const root = tempRoot({ ...fixtureFiles(), 'README.md': '# x', '_notes.json': '{}', 'hair.json': '{}', 'stamp-broken.v1.json': '{ nope' });
  const { index, errors } = buildPiecesIndex({ root });
  assert.equal(index.pieces.length, 2);
  assert.ok(errors.some((e) => e.startsWith('pieces/hair.json')), errors.join('\n'));
  assert.ok(errors.some((e) => e.startsWith('pieces/stamp-broken.v1.json')), errors.join('\n'));
  assert.ok(!errors.some((e) => /README|_notes/.test(e)));
});

test('a piece that uses a piece or version that does not exist is an error of the index', () => {
  const t = JSON.parse(fixtureFiles()['part-test-tuft.v1.json']); t.body.draw[2].v = 9;
  const root = tempRoot({ 'part-test-tuft.v1.json': JSON.stringify(t), 'stamp-test-clod.v1.json': fixtureFiles()['stamp-test-clod.v1.json'] });
  assert.match(buildPiecesIndex({ root }).errors.join(' '), /stamp:test-clod.*version 9/);
});

test('the hash is of the content, not of the spacing', () => {
  const p = JSON.parse(fixtureFiles()['stamp-test-clod.v1.json']);
  assert.equal(pieceHash(p), pieceHash(JSON.parse(JSON.stringify(p, null, 4))));
  const reordered = { body: p.body, ...p };
  assert.equal(pieceHash(p), pieceHash(reordered));
  assert.notEqual(pieceHash(p), pieceHash({ ...p, body: { ...p.body, rows: ['a.', 'aa'] } }));
});

test('pins: the fixture folder is pinned and matches', () => {
  const { index } = buildPiecesIndex({ root: FIX });
  const r = checkPins(index, readPins(FIX));
  assert.deepEqual(r, { changed: [], unpinned: [], gone: [] });
});

test('pins: a changed pinned version is caught, a new one is unpinned, a deleted one is remembered', () => {
  const files = fixtureFiles();
  const root = tempRoot(files);
  fs.writeFileSync(path.join(root, 'pieces', '_pins.json'), fs.readFileSync(path.join(FIX, 'pieces', '_pins.json')));
  const changed = JSON.parse(files['stamp-test-clod.v1.json']); changed.body.rows = ['a.', 'aa'];
  fs.writeFileSync(path.join(root, 'pieces', 'stamp-test-clod.v1.json'), JSON.stringify(changed));
  fs.rmSync(path.join(root, 'pieces', 'part-test-tuft.v1.json'));
  const v2 = { ...changed, v: 2 };
  fs.writeFileSync(path.join(root, 'pieces', 'stamp-test-clod.v2.json'), JSON.stringify(v2));
  const r = checkPins(buildPiecesIndex({ root }).index, readPins(root));
  assert.deepEqual(r, { changed: ['stamp:test-clod@1'], unpinned: ['stamp:test-clod@2'], gone: ['part:test-tuft@1'] });
  // pinning adds the new version and never rewrites an old pin, nor drops a deleted one
  const before = readPins(root);
  const added = pinPieces({ root });
  assert.deepEqual(added, ['stamp:test-clod@2']);
  const after = readPins(root);
  assert.equal(after['stamp:test-clod@1'], before['stamp:test-clod@1']);
  assert.equal(after['part:test-tuft@1'], before['part:test-tuft@1']);
  assert.deepEqual(checkPins(buildPiecesIndex({ root }).index, after).changed, ['stamp:test-clod@1']);
});

test('the real pieces/ folder: every file indexed, valid and pinned, and no pinned version changed', () => {
  const { index, errors } = buildPiecesIndex({ root: REAL });
  assert.deepEqual(errors, []);
  const files = fs.readdirSync(path.join(REAL, 'pieces')).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
  assert.equal(index.pieces.length, files.length);
  const r = checkPins(index, readPins(REAL));
  assert.deepEqual(r.changed, [], 'a released piece version changed: make a new version instead (pieces/README.md)');
  assert.deepEqual(r.unpinned, [], 'pin new versions with: node tools/lib/pieces-index.mjs --pin');
});

test('writePiecesIndex writes generated/pieces.json', () => {
  const root = tempRoot(fixtureFiles());
  const r = writePiecesIndex({ root });
  assert.equal(r.count, 2);
  const written = JSON.parse(fs.readFileSync(path.join(root, 'generated', 'pieces.json'), 'utf8'));
  assert.deepEqual(written, buildPiecesIndex({ root }).index);
});

test('in Node: a reader over the disk, and a store whose index is always the folder as it is now', async () => {
  const read = nodePieceReader(FIX);
  assert.equal(JSON.parse(await read('pieces/stamp-test-clod.v1.json')).id, 'stamp:test-clod');
  await assert.rejects(read('../../package.json'), /outside/);
  await assert.rejects(read('pieces/none-x.v1.json'), /pieces\/none-x\.v1\.json/);
  const store = nodePieceStore({ root: FIX });
  assert.equal((await store.load('part:test-tuft@1')).id, 'part:test-tuft');
  assert.deepEqual((await store.index()).pieces.map((p) => p.ref), ['part:test-tuft@1', 'stamp:test-clod@1']);
});

test('pieceFilesFor: the files a definition loads, for the quality cache key (B9)', () => {
  const def = { body: { pictures: { draw: [{ kind: 'use', use: 'part:test-tuft', v: 1 }, { kind: 'use', use: 'part:gone', v: 1 }] } } };
  const r = pieceFilesFor(def, { root: FIX });
  assert.deepEqual(r.files, ['pieces/part-test-tuft.v1.json', 'pieces/stamp-test-clod.v1.json']);
  assert.deepEqual(r.missing, ['pieces/part-gone.v1.json']);
});
