// Studio item F2: a new library body is its own module plus ONE line in engine/library-bodies.js, and nothing else.
// This test makes that change for real on a copy of the list: it adds the single line `export * from '<the stub>';`
// for tests/fixtures/studio-bodies/body-stub.js (a 32 by 32 blob, "creature:stub"), loads the copy, and hands the
// registry it makes to the schema, dataSprite and the library file reader (opts.bodies, the same registry the real list
// gives them by default). The real list does not know the stub, so the site never sees it.
//   - the schema checks the stub's figure, sizes, pivot, keys, poses, settings, colours and parts from its descriptor;
//   - dataSprite builds a sprite drawn and given sockets only by the stub's own draw and socketsAt;
//   - the library file form takes it (write, read back), and refuses it when the body is not registered.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { libraryBodies, isLibraryBodies } from '../../engine/library-body.js';
import { validateStudioSprite, defaultPivot } from '../../catalog/studio-schema.js';
import { dataSprite, makeDataSprite } from '../../engine/data-sprite.js';
import { defaultParams, renderFrame, renderSheet, frameSockets, partList } from '../../engine/sprite.js';
import { writeDataFile, readDataFile } from '../../catalog/data-file.js';

const LIST_FILE = new URL('../../engine/library-bodies.js', import.meta.url);
const STUB = new URL('../fixtures/studio-bodies/body-stub.js', import.meta.url);

// ---- the one-line change, made on a copy of the list ---------------------------------------------------------------
const SRC = fs.readFileSync(LIST_FILE, 'utf8');
const ADDED = `${SRC.replace(/\n*$/, '\n')}export * from '../rigs/body-stub.js';\n`;
// the copy lives in a temporary folder, so each relative path is made absolute (and the stub's is the fixture's)
const COPY = ADDED.replace(/from '(\.\.\/[^']+)'/g, (m, rel) => `from '${rel === '../rigs/body-stub.js' ? STUB.href : new URL(rel, LIST_FILE).href}'`);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-f2-'));
fs.writeFileSync(path.join(dir, 'library-bodies.js'), COPY);
const WITH_STUB = libraryBodies(await import(pathToFileURL(path.join(dir, 'library-bodies.js')).href));
fs.rmSync(dir, { recursive: true, force: true });
const O = { bodies: WITH_STUB };

const stub = (more = {}) => ({
  format: 'loadout-sprite', version: 1, id: 'stub-blob', name: 'Stub blob', blurb: 'A blob for the tests.',
  body: {
    library: 'creature:stub',
    figure: { mood: 'calm', moves: { attack: 'hop' }, look: { colour: '#4f9d57', eye: '#231b33', size: 1 }, hat: { colour: '#c9423a' } },
    paint: { 'look.colour': 'body' },
  },
  size: [32, 32],
  colours: { body: '#4f9d57' },
  controls: [
    { key: 'size', label: 'Size', lo: 'Small', hi: 'Big', min: 0.5, max: 1.5, default: 1, sets: 'look.size' },
    { key: 'mood', kind: 'choice', label: 'Mood', options: ['calm', 'cross'], default: 'calm', sets: 'mood' },
    { key: 'speed', standard: 'speed' },
  ],
  parts: { hat: { label: 'Hat', default: true } },
  clips: {
    idle: { frames: 4, fps: 6, loop: true, keys: [{ t: 0, bob: 0 }, { t: 0.5, bob: -2, squash: 0.4 }] },
    attack: { frames: 4, fps: 10, loop: false, from: 'hop', keys: [{ t: 0, bob: 0 }, { t: 1, bob: -4, blink: true }] },
    hurt: { frames: 2, fps: 8, loop: false, keys: [{ t: 0 }], frameEdits: { 0: { flash: true, nudge: [1, 0] } } },
  },
  preview: 'idle',
  made: { in: 'studio', from: 'new' },
  ...more,
});
const errs = (r) => r.errors.join('\n');
const pixels = (g) => { let n = 0; for (const v of g.data) if (v) n++; return n; };

test('F2 stub: the change is exactly one line, and the copy registers the stub beside every real body', () => {
  const lines = (s) => s.split('\n').filter((l) => l.trim());
  assert.equal(lines(ADDED).length, lines(SRC).length + 1);
  assert.ok(isLibraryBodies(WITH_STUB));
  assert.ok(WITH_STUB.names.includes('humanoid') && WITH_STUB.names.includes('creature:stub'));
});

test('F2 stub: the real list does not know the stub; the schema says which bodies there are', () => {
  const r = validateStudioSprite(stub());
  assert.equal(r.ok, false);
  assert.match(errs(r), /creature:stub/);
  assert.match(errs(r), /humanoid/);
  assert.throws(() => dataSprite(stub()), /creature:stub/);
});

test('F2 stub: with the registry, the schema takes it: size and pivot from the body, other sizes too', () => {
  const v = validateStudioSprite(stub(), O);
  assert.equal(v.ok, true, errs(v));
  assert.deepEqual(v.value.size, [32, 32]);
  assert.deepEqual(v.value.pivot, [16, 30], 'the pivot the body gives for 32 by 32');
  assert.deepEqual(v.value.body.figure.look, { colour: '#4f9d57', eye: '#231b33', size: 1 });
  const big = validateStudioSprite(stub({ size: [48, 48] }), O);
  assert.equal(big.ok, true, errs(big));
  assert.deepEqual(big.value.size, [48, 48]);
  assert.deepEqual(big.value.pivot, defaultPivot([48, 48]), 'no pivot given for 48 by 48: the style guide\'s');
  const none = validateStudioSprite(stub({ size: undefined }), O);
  assert.deepEqual(none.value.size, [32, 32], 'no size: the body\'s first');
  const odd = validateStudioSprite(stub({ size: [64, 64] }), O);
  assert.equal(odd.ok, true);
  assert.deepEqual(odd.value.size, [32, 32]);
  assert.match(odd.warnings.join('\n'), /32 by 32/);
});

test('F2 stub: its keys, poses, settings, colours and parts are the stub\'s, not the person\'s', () => {
  const keyed = validateStudioSprite(stub({ clips: { idle: { frames: 4, fps: 6, keys: [{ t: 0, bob: 0, lean: 10, squash: 3 }] } } }), O);
  assert.equal(keyed.ok, true, errs(keyed));
  assert.deepEqual(keyed.value.clips.idle.keys[0], { t: 0, bob: 0, squash: 1 }, 'lean is the person\'s, dropped; squash is a share, clamped');
  assert.match(keyed.warnings.join('\n'), /lean/);
  const walk = validateStudioSprite(stub({ clips: { walk: { frames: 8, fps: 10, from: 'walk', keys: [] } } }), O);
  assert.equal(walk.ok, false);
  assert.match(errs(walk), /hop/);
  const held = stub();
  held.controls[0].sets = 'held.length';
  assert.match(errs(validateStudioSprite(held, O)), /look\.size/);
  const top = stub();
  top.body.paint = { 'look.top': 'body' };
  assert.match(errs(validateStudioSprite(top, O)), /look\.colour/);
  const cape = stub({ parts: { cape: { label: 'Cape' } } });
  assert.match(errs(validateStudioSprite(cape, O)), /hat/);
  const fig = stub();
  fig.body.figure.stance = 'crouched';
  fig.body.figure.mood = 'sleepy';
  const f = validateStudioSprite(fig, O);
  assert.match(errs(f), /mood "sleepy"/);
  assert.match(f.warnings.join('\n'), /stance/);
});

test('F2 stub: dataSprite builds a sprite drawn only by the stub\'s draw and socketsAt', () => {
  const m = makeDataSprite(stub(), O);
  assert.equal(m.ok, true, m.errors.join('\n'));
  const s = m.sprite;
  assert.deepEqual(s.size, [32, 32]);
  assert.deepEqual(Object.keys(s.params), ['body', 'size', 'mood', 'speed', 'hat']);
  assert.equal(s.params.body.label, 'Body', 'the label the body gives its slot');
  assert.equal(s.params.body.material, 'skin');
  assert.deepEqual(partList(s).map((p) => [p.name, p.socket]), [['hat', 'head']]);
  const P = defaultParams(s);
  const g = renderFrame(s, 'idle', 0, P);
  assert.deepEqual([g.w, g.h], [32, 32]);
  const base = pixels(g);
  assert.ok(base > 40, `the blob is drawn (${base} pixels)`);
  assert.ok(pixels(renderFrame(s, 'idle', 0, { ...P, size: 1.5 })) > base, 'the Size slider sets look.size');
  assert.ok(pixels(renderFrame(s, 'idle', 0, { ...P, hat: false })) < base, 'the hat can be switched off');
  const other = renderFrame(s, 'idle', 0, { ...P, body: '#e6c545' });
  assert.notDeepEqual([...other.data], [...g.data], 'the body colour paints look.colour (body.paint)');
  const so = frameSockets(s, 'idle', 0, P), hurt = frameSockets(s, 'hurt', 0, P);
  assert.deepEqual(Object.keys(so), ['head', 'feet']);
  assert.equal(hurt.feet.x, so.feet.x + 1, 'the frame\'s nudge moves the sockets');
  const sheet = renderSheet(s, P);
  assert.ok(sheet.w >= 32 * 4 && sheet.h >= 32);
});

test('F2 stub: the library file form takes it with the registry, and refuses it without', () => {
  const w = writeDataFile(stub(), O);
  assert.equal(w.ok, true, w.errors.join('\n'));
  const back = readDataFile(w.text, { ...O, file: 'sprites/stub-blob.js' });
  assert.equal(back.ok, true, back.errors.join('\n'));
  assert.equal(back.value.body.library, 'creature:stub');
  assert.equal(readDataFile(w.text, { file: 'sprites/stub-blob.js' }).ok, false);
});
