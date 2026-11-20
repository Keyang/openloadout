// B16b: the top-down person as a base piece (docs/data-sprites.md section 9, row B16; sections 2.2 and 7).
// base:person-topdown@1 is a bone rig baked from rigs/topdown.js (tools/bake-topdown.mjs): one rig, overlays for down,
// up and side, and EVERY standard clip of the code rig as key poses (idle, walk, run, attack, shoot, cast, block,
// dodge and talk in three directions; hurt and die facing down, as the code rig names them). Held here to its code rig:
// at rest and through every frame of every clip, at most 2% of the drawn pixels differ (the Hero preset's measure:
// pixels that differ, over the pixels the code rig draws), with the default body, a bald head and nothing worn or held.
// The keys are sparse (a track is written only where it changes), so the whole base fits one piece file.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validatePiece, PIECE_LIMITS } from '../../engine/pieces.js';
import { dataSprite } from '../../engine/data-sprite.js';
import { renderFrame, frameSockets } from '../../engine/sprite.js';
import { clipPose } from '../../rigs/keypose.js';
import { nodePieceStore } from '../../tools/lib/pieces-index.mjs';
import * as B from '../../tools/bake-topdown.mjs';

const FILE = new URL('../../pieces/base-person-topdown.v1.json', import.meta.url);
const store = nodePieceStore();
const DIRS = ['down', 'up', 'side'];
const ALL_CLIPS = [...['idle', 'walk', 'run', 'attack', 'shoot', 'cast', 'block', 'dodge', 'talk'].flatMap((a) => DIRS.map((d) => `${a}_${d}`)), 'hurt', 'die'];

let bareSprite = null;
/** A sprite that is the base and nothing else, coloured as the code look B.LOOK: it inherits every base clip. */
async function bare() {
  if (bareSprite) return bareSprite;
  const def = B.bareSprite();
  const r = await store.loadFor(def);
  assert.ok(r.ok, r.errors.join('; '));
  bareSprite = dataSprite(def, { pieces: store, strict: true });
  return bareSprite;
}
const opaque = (g) => { let n = 0; for (const v of g.data) if (v) n++; return n; };

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
  for (const name of ALL_CLIPS) {
    const want = B.STANDARD_OF(name);
    const c = r.piece.body.clips[name];
    assert.deepEqual([c.frames, c.fps, c.loop], [want.frames, want.fps, want.loop], `${name}: the code rig's frames, fps and loop`);
  }
  // data only: no code anywhere in it
  assert.ok(!/function|=>|\$\{/.test(text));
  assert.equal(r.piece.made.from, 'rigs/topdown.js');
});

test('the whole base, every clip included, fits one piece file (PIECE_LIMITS.jsonBytes) with room to spare', () => {
  const bytes = fs.statSync(FILE).size;
  assert.ok(bytes <= PIECE_LIMITS.jsonBytes * 0.92, `${bytes} bytes; a piece is at most ${PIECE_LIMITS.jsonBytes} (and 8% is kept for later clips)`);
});

test('the file in pieces/ is exactly what the baker makes now (it is generated, never edited by hand)', () => {
  assert.deepEqual(JSON.parse(fs.readFileSync(FILE, 'utf8')), JSON.parse(JSON.stringify(B.basePiece())));
});

test('the sparse keys give every frame exactly the pose of a key written on every frame (what the code rig solved)', () => {
  // a helper bone that carries only shapes the frame hides (the short sleeve, a rim, the short side leg) is free on that
  // frame (dense.free): its value is whatever the blend gives. Every other track is exact on every frame.
  let free = 0;
  for (const name of ALL_CLIPS) {
    const dense = B.bakeClip(name, { dense: true }), sparse = B.bakeClip(name);
    assert.ok(sparse.keys.length <= dense.keys.length, name);
    assert.ok(JSON.stringify(sparse).length < JSON.stringify(dense).length, `${name}: sparse keys are smaller`);
    for (let f = 0; f < dense.frames; f++) {
      const a = clipPose(dense, f), b = clipPose(sparse, f);
      const loose = new Set(dense.free[f]);
      for (const id of loose) assert.ok(/^(armI|rimA|rimI|rimS|legI|ank)[FB]$/.test(id), `${name}#${f}: ${id} is no helper bone; parts hang on it`);
      for (const fld of ['bones', 'stretch']) {
        for (const [id, v] of Object.entries(a[fld] ?? {})) {
          if (loose.has(id)) { free++; continue; }
          assert.ok(Math.abs((b[fld]?.[id] ?? NaN) - v) < 1e-6, `${name}#${f} ${fld}.${id}: ${b[fld]?.[id]} vs ${v}`);
        }
      }
      assert.deepEqual(b.root ?? [0, 0], a.root ?? [0, 0], `${name}#${f} root`);
      assert.deepEqual(b.swap ?? {}, a.swap ?? {}, `${name}#${f} swap`);
      assert.deepEqual([...(b.show ?? [])].sort(), [...(a.show ?? [])].sort(), `${name}#${f} show`);
      assert.deepEqual([...(b.hide ?? [])].sort(), [...(a.hide ?? [])].sort(), `${name}#${f} hide`);
    }
  }
  assert.ok(free > 0, 'some helper tracks are free');
});

test('at rest, each direction is within 2% of the code rig', async () => {
  const s = await bare();
  for (const dir of DIRS) {
    const want = B.codeFrame(`idle_${dir}`, 0), got = renderFrame(s, `idle_${dir}`, 0, {});
    const d = B.pixelDiff(want, got);
    assert.ok(d.share <= 0.02, `${dir} at rest: ${d.differ} of ${d.drawn} pixels differ (${(100 * d.share).toFixed(2)}%)`);
    assert.ok(opaque(got) > 250, 'it draws a whole body');
  }
});

test('every frame of every base clip (die included) is within 2% of the code rig', async () => {
  const s = await bare();
  const worst = [];
  for (const clip of ALL_CLIPS) {
    assert.ok(s.clips[clip], `the sprite inherits ${clip}`);
    for (let f = 0; f < s.clips[clip].frames; f++) {
      const d = B.pixelDiff(B.codeFrame(clip, f), renderFrame(s, clip, f, {}));
      worst.push([d.share, `${clip}#${f}: ${d.differ}/${d.drawn}`]);
    }
  }
  worst.sort((a, b) => b[0] - a[0]);
  assert.ok(worst[0][0] <= 0.02, `worst frames: ${worst.slice(0, 8).map((w) => w[1]).join(', ')}`);
});

test('the keys are plain data at the frames\' own phases, and every stretch stays inside what the renderer draws (0.5 to 1.5)', () => {
  const clips = B.basePiece().body.clips;
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

test('the attach points follow the code rig: hand, offhand, head and feet within a pixel', async () => {
  const s = await bare();
  for (const clip of ['idle_down', 'walk_side', 'walk_up', 'cast_down', 'shoot_side', 'attack_up', 'run_side', 'hurt']) {
    for (let f = 0; f < s.clips[clip].frames; f++) {
      const want = B.codeSockets(clip, f), got = frameSockets(s, clip, f, {});
      for (const name of ['hand', 'offhand', 'head', 'feet']) {
        assert.ok(got[name], `${clip}#${f}: ${name}`);
        assert.ok(Math.abs(got[name].x - want[name].x) <= 1 && Math.abs(got[name].y - want[name].y) <= 1,
          `${clip}#${f} ${name}: ${got[name].x},${got[name].y} vs ${want[name].x},${want[name].y}`);
      }
      const da = Math.abs(((got.hand.angle - want.hand.angle + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
      assert.ok(da < 0.02, `${clip}#${f} hand angle ${got.hand.angle} vs ${want.hand.angle}`);
    }
  }
});

test('base:person-topdown-walker is the same rig with idle, walk and talk only, keyed exactly as the full base', () => {
  const file = new URL('../../pieces/base-person-topdown-walker.v1.json', import.meta.url);
  const text = fs.readFileSync(file, 'utf8');
  const r = validatePiece(text, { file: 'base-person-topdown-walker.v1.json' });
  assert.ok(r.ok, r.errors.join('; '));
  const full = B.basePiece(), walker = JSON.parse(text);
  assert.deepEqual(walker, JSON.parse(JSON.stringify(B.basePiece('walker'))), 'generated by the baker');
  assert.deepEqual(walker.body.rig, JSON.parse(JSON.stringify(full.body.rig)), 'the very same rig');
  assert.deepEqual(walker.slots, JSON.parse(JSON.stringify(full.slots)));
  assert.deepEqual(Object.keys(walker.body.clips), [...B.WALKER_CLIPS]);
  // talk is the code rig's plain talk (drawn facing down): the full base's talk_down under its own name
  for (const c of B.WALKER_CLIPS) {
    const want = JSON.parse(JSON.stringify(full.body.clips[c === 'talk' ? 'talk_down' : c]));
    if (c === 'talk') want.label = 'Talk';
    assert.deepEqual(walker.body.clips[c], want, c);
  }
});
