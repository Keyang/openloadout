// Framework additions of batch P13 (effects and interface of the platformer kit):
//   engine/bursts.js    SPARK_STYLES, sparkMark, sparkRing, sparkOrbit, blastBall, driftUp,
//                       and from the first fix round: sparkFlash, embers, puffRing, the `full` option of the
//                       spark marks and the `box` option of driftUp
//   engine/slots.js     socketTones, levelIn, slotFill (first fix round: the HUD's full, half and empty marks)
//   engine/ui-wood.js   WOOD_STYLES, woodTones, woodPanel, woodButton
// and what the six sprites of the batch promise in their headers (clips, slices, flat text areas, contrast).
// R3 (2026-11-21): engine/bursts.js, slots.js and ui-wood.js went with the tests of their functions; what stays are the checks of the frozen code effects and HUD sprites (now replayed: tests/fixtures/code-replay/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { col } from '../../engine/color.js';
import { PALETTE } from '../../engine/palettes.js';
import { renderFrame, defaultParams, cleanParams } from '../../engine/sprite.js';
import { validateMeta } from '../../catalog/schema.js';
import { codeSprite } from '../helpers/library.mjs';   // the code, frozen first (tests/helpers/library.mjs): a test about the framework it uses
const sparkle = await codeSprite('pickup-sparkle');
const poof = await codeSprite('enemy-poof');
const boom = await codeSprite('explosion-small');
const hud = await codeSprite('ui-hud-platformer');
const buttons = await codeSprite('ui-buttons-wood');
const panels = await codeSprite('ui-panel-wood');

const P = PALETTE.thornwood;
const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const count = (g, hex) => { const c = col(hex); return g.data.reduce((n, v) => n + (v === c ? 1 : 0), 0); };
const diff = (a, b) => a.data.reduce((n, v, i) => n + (v !== b.data[i] ? 1 : 0), 0);
const draw = (s, clip, over = {}, f = 0) => renderFrame(s, clip, f, cleanParams(s, { ...defaultParams(s), ...over }));
const borderEmpty = (g) => { for (let i = 0; i < g.w; i++) if (g.get(i, 0) || g.get(i, g.h - 1)) return false; for (let j = 0; j < g.h; j++) if (g.get(0, j) || g.get(g.w - 1, j)) return false; return true; };


// ---- the six sprites ---------------------------------------------------------------------------

test('P13 sprites: meta passes, and frames, pivots and clips are the specification\'s', () => {
  const clipList = (s) => Object.entries(s.clips).map(([n, c]) => `${n} ${c.frames}${c.frames > 1 ? (c.loop ? ' loop' : '') : ''}`);
  for (const s of [sparkle, poof, boom, hud, buttons, panels]) assert.deepEqual(validateMeta(s.meta, 'sprite'), { ok: true, errors: [] }, s.id);
  assert.deepEqual([sparkle.size, sparkle.pivot, clipList(sparkle)], [[32, 32], [16, 16], ['burst 8', 'loop 8 loop']]);
  assert.deepEqual([poof.size, poof.pivot, clipList(poof)], [[48, 48], [24, 24], ['burst 8']]);
  assert.deepEqual([boom.size, boom.pivot, clipList(boom)], [[48, 48], [24, 24], ['burst 8']]);
  assert.deepEqual([hud.size, hud.pivot, clipList(hud)], [[16, 16], [8, 8], ['heart-full 1', 'heart-half 1', 'heart-empty 1', 'coin 1', 'key 1', 'key-empty 1', 'star 1', 'star-empty 1', 'gem 1', 'heart-lose 4', 'heart-gain 4']]);
  assert.deepEqual([buttons.size, buttons.pivot, clipList(buttons)], [[96, 32], [48, 16], ['normal 1', 'hover 1', 'pressed 1', 'disabled 1']]);
  assert.deepEqual([panels.size, panels.pivot, clipList(panels)], [[96, 64], [48, 32], ['panel 1', 'panel-title 1', 'panel-scroll 1']]);
  assert.deepEqual(Object.keys(sparkle.params), ['size', 'pieces', 'spread', 'style', 'rise', 'core', 'edge', 'speed']);
  assert.deepEqual(Object.keys(poof.params), ['size', 'pieces', 'spread', 'style', 'core', 'edge', 'speed']);
  assert.deepEqual(Object.keys(boom.params), ['size', 'pieces', 'spread', 'style', 'smoke', 'core', 'edge', 'speed']);
  assert.deepEqual(Object.keys(hud.params), ['shape', 'shine', 'shadow', 'body', 'accent', 'metal', 'speed']);
  assert.deepEqual(Object.keys(buttons.params), ['style', 'corner', 'border', 'nails', 'texture', 'face', 'frame']);
  assert.deepEqual(Object.keys(panels.params), ['corner', 'border', 'nails', 'texture', 'face', 'frame', 'accent']);
  assert.deepEqual(buttons.sounds, { pressed: [{ sound: 'ui-click', preset: 'Soft tap', frame: 0, volume: 0.6 }] });
});

test('P13 effects: pure white is on frame 0 only, and no frame of any look is empty', () => {
  for (const [s, clip] of [[sparkle, 'burst'], [poof, 'burst'], [boom, 'burst']]) {
    for (const style of s.params.style.options.map((o) => o.value)) {
      assert.ok(count(draw(s, clip, { style }, 0), '#ffffff') > 0, `${s.id} ${style}: frame 0 has a white core`);
      for (let f = 1; f < 8; f++) assert.equal(count(draw(s, clip, { style }, f), '#ffffff'), 0, `${s.id} ${style}: no pure white on frame ${f}`);
      for (const low of [true, false]) for (let f = 0; f < 8; f++) {
        const o = { style, size: low ? 0 : 1, pieces: low ? s.params.pieces.min : s.params.pieces.max, spread: low ? 0 : 1, smoke: !low, rise: low ? 0 : 1 };
        assert.ok(lit(draw(s, clip, o, f)) >= 2, `${s.id} ${style} ${low ? 'low' : 'high'} frame ${f}: at least two pixels`);
      }
    }
  }
  for (let f = 0; f < 8; f++) assert.ok(lit(draw(sparkle, 'loop', { pieces: 4, size: 0, spread: 0, rise: 0 }, f)) >= 2, `shimmer frame ${f}`);
});

test('P13 HUD: full, half and empty share one outline; the two heart clips end on the resting glyphs', () => {
  const outline = (g) => g.data.map((v) => (v ? 1 : 0)).join('');
  for (const shape of hud.params.shape.options.map((o) => o.value)) for (const shadow of [false, true]) for (const shine of [false, true]) {
    const o = { shape, shadow, shine }, label = JSON.stringify(o);
    assert.equal(outline(draw(hud, 'heart-full', o)), outline(draw(hud, 'heart-empty', o)), `${label}: heart full and empty`);
    assert.equal(outline(draw(hud, 'heart-full', o)), outline(draw(hud, 'heart-half', o)), `${label}: heart full and half`);
    assert.equal(outline(draw(hud, 'key', o)), outline(draw(hud, 'key-empty', o)), `${label}: key`);
    assert.equal(outline(draw(hud, 'star', o)), outline(draw(hud, 'star-empty', o)), `${label}: star`);
    assert.deepEqual(draw(hud, 'heart-lose', o, 3).data, draw(hud, 'heart-empty', o).data, `${label}: heart-lose ends on the empty heart`);
    assert.deepEqual(draw(hud, 'heart-gain', o, 3).data, draw(hud, 'heart-full', o).data, `${label}: heart-gain ends on the full heart`);
    assert.deepEqual(draw(hud, 'heart-gain', o, 0).data, draw(hud, 'heart-empty', o).data, `${label}: heart-gain starts on the empty heart`);
    for (const clip of Object.keys(hud.clips)) for (let f = 0; f < hud.clips[clip].frames; f++) {
      const g = draw(hud, clip, o, f), b = g.bounds();
      assert.ok(borderEmpty(g), `${label} ${clip} ${f}: a 1 px empty border`);
      assert.ok(b.x1 - b.x0 + 1 <= 14 && b.y1 - b.y0 + 1 <= 14, `${label} ${clip} ${f}: at most 14x14`);
    }
  }
  assert.ok(diff(draw(hud, 'heart-full'), draw(hud, 'heart-empty')) > 40, 'full and empty differ in most of their pixels');
});

test('P13 poof: it never shrinks from frame 0 to frame 4, and its stars and skulls stay apart', () => {
  for (const o of [{}, { size: 0, pieces: 4, spread: 0 }, { size: 1, pieces: 8, spread: 1 }, { size: 0, pieces: 6 }, { size: 1, pieces: 5, spread: 0 }]) {
    let last = null;
    for (let f = 0; f <= 4; f++) {
      const g = draw(poof, 'burst', o, f), bb = g.bounds(), cur = [bb.x1 - bb.x0 + 1, bb.y1 - bb.y0 + 1, lit(g)];
      if (last) assert.ok(cur[0] >= last[0] && cur[1] >= last[1] && cur[2] >= last[2], `${JSON.stringify(o)} frame ${f}: ${cur} after ${last}`);
      last = cur;
    }
  }
  // the marks: on frames 5 to 7 the core colour is in the stars or skulls only (the puffs have cooled), and
  // between two marks there is a column with none of it at least 3 px wide (their two outlines and a gap)
  for (const style of ['stars', 'skulls']) for (const o of [{}, { size: 1, pieces: 8, spread: 1 }, { size: 0, pieces: 4, spread: 0 }]) for (let f = 5; f <= 7; f++) {
    const g = draw(poof, 'burst', { style, ...o }, f), core = col(poof.params.core.default ?? P.cream);
    const cols = []; for (let x = 0; x < 48; x++) { let n = 0; for (let y = 0; y < 48; y++) if (g.get(x, y) === core) n++; cols.push(n > 0); }
    const runs = []; let start = -1;
    for (let x = 0; x <= 48; x++) { if (cols[x] && start < 0) start = x; if (!cols[x] && start >= 0) { runs.push([start, x - 1]); start = -1; } }
    const want = (o.pieces ?? 6) >= 6 ? 3 : 2;
    assert.equal(runs.length, want, `${style} ${JSON.stringify(o)} frame ${f}: ${want} separate marks, found ${JSON.stringify(runs)}`);
    for (let i = 1; i < runs.length; i++) assert.ok(runs[i][0] - runs[i - 1][1] - 1 >= 3, `${style} frame ${f}: a clear gap between marks ${i - 1} and ${i}`);
  }
});

test('P13 explosion: embers fly outside the fire on frames 3 to 5, and the smoke is a late ring that leaves the middle clear', () => {
  const core = col(P.cream), R = (size) => 8.5 + 2.5 * size, wide = (spread) => 0.92 + 0.18 * spread;
  for (const [o, size, spread, pieces] of [[{}, 0.5, 0.5, 8], [{ size: 0, pieces: 4, spread: 0 }, 0, 0, 4], [{ style: 'star' }, 0.5, 0.5, 8]]) {
    // frame 4: the fire ring holds no core colour, so every pixel of it is the lit corner of one ember
    const g = draw(boom, 'burst', o, 4), outer = R(size) * 1.26 * wide(spread);
    let out = 0;
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) if (g.get(x, y) === core && Math.hypot(x + 0.5 - 24, y + 0.5 - 24) > outer + 1) out++;
    assert.equal(out, pieces, `${JSON.stringify(o)}: every ember is outside the ring on frame 4`);
  }
  const most = Math.max(...[0, 1, 2, 3, 4, 5, 6, 7].map((f) => diff(draw(boom, 'burst', { pieces: 4 }, f), draw(boom, 'burst', { pieces: 12 }, f))));
  assert.ok(most >= 40, `Pieces changes ${most} pixels on one frame`);
  for (const style of ['round', 'star', 'ring']) for (const size of [0, 0.5, 1]) for (const spread of [0, 1]) for (let f = 0; f < 8; f++) {
    const on = draw(boom, 'burst', { style, size, spread, smoke: true }, f), off = draw(boom, 'burst', { style, size, spread, smoke: false }, f);
    if (f <= 4) { assert.deepEqual(on.data, off.data, `${style} size ${size} frame ${f}: no smoke before frame 5`); continue; }
    assert.ok(diff(on, off) > 20, `${style} size ${size} frame ${f}: the smoke shows`);
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) if (on.get(x, y) !== off.get(x, y) && on.get(x, y)) {
      assert.ok(Math.hypot(x + 0.5 - 24, y + 0.5 - 24) >= R(size) * 0.5, `${style} size ${size} spread ${spread} frame ${f}: smoke at ${x},${y} is inside half the ball's radius`);
    }
  }
});
