// B16b: the top-down person as a base piece (docs/data-sprites.md section 9, row B16; sections 2.2 and 7).
// base:person-topdown@1 is a bone rig that was baked from rigs/topdown.js (tools/bake-topdown.mjs): one rig, overlays for
// down, up and side, and every standard clip of the code rig as key poses (idle, walk, run, attack, shoot, cast, block,
// dodge and talk in three directions; hurt and die facing down). The keys are sparse (a track is written only where it
// changes), so the whole base fits one piece file.
// R2 deleted the rig and the baker. What this file held against them went: that the file is what the baker makes, that
// every frame of every clip is within 2% of the code rig's pixels, that sparse keys equal full keys, the attach points
// near the code's, and the frames, fps and loop of the code's standard clips. The piece is pinned data now.
// Held here, about the pinned files: the size limit, the bone nodes and clip names, key phases and the stretch range, and
// the walker base against the full base.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validatePiece, PIECE_LIMITS } from '../../engine/pieces.js';

const FILE = new URL('../../pieces/base-person-topdown.v1.json', import.meta.url);
const DIRS = ['down', 'up', 'side'];
const ALL_CLIPS = [...['idle', 'walk', 'run', 'attack', 'shoot', 'cast', 'block', 'dodge', 'talk'].flatMap((a) => DIRS.map((d) => `${a}_${d}`)), 'hurt', 'die'];

test('the base piece is a valid top-down bone rig with down, up and side overlays and every standard clip of the code rig', () => {
  const text = fs.readFileSync(FILE, 'utf8');
  const r = validatePiece(text, { file: 'base-person-topdown.v1.json' });
  assert.ok(r.ok, r.errors.join('; '));
  const rig = r.piece.body.rig;
  assert.equal(rig.view, 'top-down');
  assert.deepEqual(Object.keys(rig.directions).sort(), ['down', 'side', 'up']);
  for (const id of ['root', 'hip', 'spine', 'neck', 'head', 'chest', 'waist', 'shoulderF', 'armF', 'handF', 'armB', 'handB', 'fistF', 'cuffF', 'legF', 'footF', 'legB', 'footB']) {
    assert.ok([...rig.bones, ...(rig.nodes ?? [])].some((b) => b.id === id), `the base has a bone or node "${id}" for parts to hang on`);
  }
  assert.deepEqual(Object.keys(r.piece.body.clips).sort(), [...ALL_CLIPS].sort());
  // data only: no code anywhere in it
  assert.ok(!/function|=>|\$\{/.test(text));
  assert.equal(r.piece.made.from, 'rigs/topdown.js');
});

test('the whole base, every clip included, fits one piece file (PIECE_LIMITS.jsonBytes) with room to spare', () => {
  const bytes = fs.statSync(FILE).size;
  assert.ok(bytes <= PIECE_LIMITS.jsonBytes * 0.92, `${bytes} bytes; a piece is at most ${PIECE_LIMITS.jsonBytes} (and 8% is kept for later clips)`);
});

test('the keys are plain data at the frames\' own phases, and every stretch stays inside what the renderer draws (0.5 to 1.5)', () => {
  const clips = JSON.parse(fs.readFileSync(FILE, 'utf8')).body.clips;
  for (const [name, c] of Object.entries(clips)) {
    assert.ok(Array.isArray(c.keys) && c.keys.length >= 1 && c.keys.length <= c.frames, `${name}: at most one key a frame`);
    const phases = new Set(Array.from({ length: c.frames }, (_, f) => (c.loop ? f / c.frames : f / (c.frames - 1))));
    for (const k of c.keys) {
      assert.ok(phases.has(k.t), `${name}: key at ${k.t}, a frame's own phase`);
      for (const v of Object.values(k.stretch ?? {})) assert.ok(v >= 0.5 && v <= 1.5, `${name} t ${k.t}: stretch ${v}`);
      for (const v of Object.values(k.bones ?? {})) assert.ok(Number.isFinite(v));
    }
  }
});

test('base:person-topdown-walker is the same rig with idle, walk and talk only, keyed exactly as the full base', () => {
  const file = new URL('../../pieces/base-person-topdown-walker.v1.json', import.meta.url);
  const text = fs.readFileSync(file, 'utf8');
  const r = validatePiece(text, { file: 'base-person-topdown-walker.v1.json' });
  assert.ok(r.ok, r.errors.join('; '));
  const full = JSON.parse(fs.readFileSync(FILE, 'utf8')), walker = JSON.parse(text);
  assert.deepEqual(walker.body.rig, full.body.rig, 'the very same rig');
  assert.deepEqual(walker.slots, full.slots);
  const WALKER_CLIPS = ['idle_down', 'idle_up', 'idle_side', 'walk_down', 'walk_up', 'walk_side', 'talk'];   // as the baker listed them before R2
  assert.deepEqual(Object.keys(walker.body.clips), WALKER_CLIPS);
  // talk is the code rig's plain talk (drawn facing down): the full base's talk_down under its own name
  for (const c of WALKER_CLIPS) {
    const want = JSON.parse(JSON.stringify(full.body.clips[c === 'talk' ? 'talk_down' : c]));
    if (c === 'talk') want.label = 'Talk';
    assert.deepEqual(walker.body.clips[c], want, c);
  }
});
