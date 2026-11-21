// The scenery generators of migration batch M10 (engine/gen/scenery.js; docs/data-sprites.md 2.4, 3.3 "backdrop"): what
// the five code backdrops (sprites/bg-forest, bg-castle, bg-battle-field, bg-battle-dungeon, bg-starfield) drew with
// engine/scenery.js and by hand, as named generators. Each is registered in the site registry in the backdrop family as
// a frame generator, passes the goldens harness (tests/helpers/gen-harness.mjs: pinned primitives at three or more
// argument sets, determinism, no clock or dice, argument fuzz, cost, loop closure), wraps across the layer's join, and
// the ports draw what the code helpers drew where they are ports (engine/scenery.js pavedFloor, groundMarks, farHouse;
// engine/backdrop.js battlements).
//
// To pin a NEW version: add its cases to CASES, run once with GEN_GOLDEN_WRITE=1, look at the file in tests/fixtures/gen/.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';
import { SCENERY_GENERATORS } from '../../engine/gen/scenery.js';
import { SCENERY_FRAME_GENERATORS } from '../../engine/gen/scenery-frame.js';
import { renderList } from '../../engine/draw-list.js';
import { Surface } from '../../engine/surface.js';
import { rectIn } from '../../engine/surface.js';
import fs from 'node:fs';
import { tidyPlan, TIDY_LIMITS } from '../../engine/gen/scenery.js';
import { validateSprite } from '../../catalog/sprite-schema.js';
import { makeDataSprite } from '../../engine/data-sprite.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import { workOutColour } from '../../engine/gen/backdrop.js';
import { SCENERY_COLOUR_RULES } from '../../engine/gen/scenery.js';
import { PALETTE as SITE_PALETTE } from '../../engine/palettes.js';

const LAYER = { size: [320, 180] };
const SMALL = { size: [96, 48] };
const GROUND = { kind: 'ridge', base: 30, height: 8, seed: 9, peaks: 2, rough: 0.1 };
const LEAVES = { leaf: 'leaf', lit: 'leaf.light', dark: 'leaf.dark' };
const KINDS = { a: { width: 22, capital: 4, foot: 5, courses: 13 }, b: { width: 16, capital: 5, foot: 4, collar: 30, collar2: 84 }, c: { width: 20, capital: 3, foot: 7, courses: 19, collar: 52 } };
const FLAME = ['fire.light', 'fire', 'fire.dark', 'fire.deep'];

const solid = (g) => g.data.filter((v) => v >>> 24).length;
/** Primitives drawn onto a frame, every paint one grey: what is covered. */
const cover = (prims, [w, h]) => renderList(w, h, prims.map((p) => ({ ...p, paint: 'x' })), { palette: { x: '#808080' } }).g;

/**
 * What a call covers, folded onto one tile: its primitives drawn in the frame as they are, moved a frame left and moved
 * a frame right, a pixel covered where any of the three covers it. A layer that wraps shows the same as this fold; a
 * shape cut at the join (drawn once, past an edge) is in the fold but not in the frame.
 */
function folded(prims, [w, h]) {
  const out = new Uint8Array(w * h);
  for (const dx of [-w, 0, w]) { const g = cover(prims.map((p) => moveRight(p, dx)), [w, h]); for (let i = 0; i < w * h; i++) if (g.data[i] >>> 24) out[i] = 1; }
  return out;
}
/** A primitive moved dx px right (every point it has). */
function moveRight(p, dx) {
  const q = { ...p };
  for (const f of ['at', 'from', 'to']) if (Array.isArray(p[f])) q[f] = [p[f][0] + dx, p[f][1]];
  if (Array.isArray(p.points)) q.points = p.points.map(([x, y]) => [x + dx, y]);
  return q;
}

test('castle.columns@1 draws the columns of sprites/bg-castle.js near layer pixel for pixel, at 2, 3 and 4 columns', () => {
  const tones = { light: '#c0c0c0', base: '#808080', dark: '#404040' };
  for (const n of [2, 3, 4]) {
    // the code's columns (sprites/bg-castle.js render, near: the column of each span, wrapped at the join)
    const old = new Surface(320, 180), span = 320 / n, shaft = 18, SPRING = 56;
    for (let k = 0; k < n; k++) {
      const x = Math.round(k * span);
      for (const cx of x + 20 > 320 ? [x, x - 320] : x - 20 < 0 ? [x, x + 320] : [x]) {
        const l = cx - shaft / 2;
        old.rect(l, SPRING, 4, 180 - SPRING, tones.dark).rect(l + shaft - 4, SPRING, 3, 180 - SPRING, tones.light);
        old.rect(l - 4, SPRING - 2, shaft + 8, 6, tones.base).rect(l - 4, SPRING - 2, shaft + 8, 3, tones.light).rect(l - 2, SPRING + 4, shaft + 4, 3, tones.dark);
        old.rect(l - 3, 154, shaft + 6, 5, tones.base).rect(l - 3, 154, shaft + 6, 3, tones.light);
        old.rect(l - 7, 159, shaft + 14, 180 - 159, tones.base).rect(l - 7, 159, shaft + 14, 3, tones.light);
      }
    }
    const r = registry.runGenerator({ gen: 'castle.columns', v: 1, count: n, bright: 'light', base: 'base', dark: 'dark' }, LAYER);
    assert.ok(r.ok, r.errors.join('; '));
    const g = renderList(320, 180, r.primitives, { palette: Object.fromEntries(Object.entries(tones).map(([k, hex]) => [k, { hex }])) }).g;
    assert.deepEqual([...g.data], [...old.data], `${n} columns`);
  }
});

const PAL = { palette: { sky: { hex: '#80b0d0' }, rock: { hex: '#608090' }, lit: { hex: '#90b0c0' }, leaf: { hex: '#3f8a4f' }, bark: { hex: '#6a4a30' }, land: { hex: '#7a9a50' }, ring: { hex: '#c0a040' } } };
const TIDY_LAYERS = [
  [{ kind: 'rect', at: [0, 0], size: [320, 180], paint: 'sky' }, { gen: 'ridge', v: 1, base: 156, height: 84, seed: 3, peaks: 4, shape: 'jagged', rough: 0.55, paint: 'rock', litEdge: { depth: 0.75, paint: 'lit' } },
    { gen: 'mist.band', v: 1, at: 156, height: 9, seed: 21, paint: 'sky' }],
  [{ gen: 'ridge', v: 1, base: 172, height: 6, seed: 23, peaks: 7, rough: 0.4, paint: 'leaf.dark' },
    { gen: 'tall.trees', v: 1, count: 10, seed: 31, leaf: 'leaf', lit: 'leaf.light', dark: 'leaf.dark', bark: 'bark', barkLit: 'bark.light', barkDark: 'bark.dark', bushes: 11 }],      // trees 7 to 10 have side branches (limbs)
  [{ kind: 'poly', points: [[0, 140], [320, 120], [320, 180], [0, 180]], paint: 'land' }, { kind: 'arc', at: [160, 200], r: 90, a0: 140, a1: 220, thick: 3, paint: 'ring' },
    { kind: 'ring', at: [40, 60], r: 12, thick: 1, paint: 'ring' }, { kind: 'line', from: [10, 10], to: [300, 40], thick: 1, paint: 'rock' }, { kind: 'dot', at: [100, 100], paint: 'lit' }, { kind: 'ellipse', at: [319, 90], r: [9, 5], paint: 'leaf' }],
  // thin lines are drawn as engine/draw-list.js linePixels draws them (a stepped 1 px line, not a capsule): steep, shallow,
  // a diagonal, a line with no thick, a half-pixel end, one reaching far off the frame (clipped first) and a thick one
  [{ kind: 'rect', at: [0, 0], size: [320, 180], paint: 'sky' }, { kind: 'line', from: [40, 170], to: [200, 10], thick: 1, paint: 'rock' },
    { kind: 'line', from: [12.7, 3.2], to: [30.4, 160.9], paint: 'lit' }, { kind: 'line', from: [300, 20.5], to: [100.5, 60], thick: 1, paint: 'leaf' },
    { kind: 'line', from: [-1800, 90], to: [250, 140], thick: 1, paint: 'bark' }, { kind: 'line', from: [60, 100], to: [140, 120], thick: 2, paint: 'ring' }],
];

// Milliseconds a unit of cost may take, with a wide margin for a loaded machine (as gen-b12-safety.test.mjs).
const msFor = (cost) => 30 + cost * 0.1;
/** The quickest of three runs (the first a warm-up), so a busy machine does not fail a sound bound. */
function quickest(fn) {
  fn();
  let best = Infinity, out;
  for (let i = 0; i < 3; i++) { const t0 = performance.now(); out = fn(); best = Math.min(best, performance.now() - t0); }
  return [out, best];
}

const APART_CASES = {
  'stand.apart@1': [
    { args: { of: 'rock', behind: ['sky'] } },
    { args: { of: 'land', air: 'sky', depth: 0.4, behind: ['rock'], also: ['sky'], night: true } },
    { args: { of: 'land.dark', air: 'sky', depth: 0, behind: ['rock', 'land'], darkest: 0.26 } },
    { args: { of: 'land', air: 'void', depth: 0.2, behind: ['rock'], also: ['sky'], way: 'lighter' } },
  ],
};

test('stand.apart@1 is registered as a colour rule of engine/gen/scenery.js, a frame generator (its sample is a swatch), with a one-line about', () => {
  for (const key of Object.keys(APART_CASES)) {
    const [id, v] = key.split('@');
    const e = registry.generator(id, Number(v));
    assert.ok(e, `${key} is registered`);
    assert.equal(e.family, 'colour', key);
    assert.ok(SCENERY_COLOUR_RULES[key], `${key} is listed by engine/gen/scenery.js`);
    assert.ok(registry.FRAME_GENERATORS[key] && SCENERY_FRAME_GENERATORS[key], `${key} is a frame generator`);
    assert.ok(typeof e.about === 'string' && e.about.length > 30 && !e.about.includes('\n'), `${key} about`);
  }
  assert.deepEqual(Object.keys(SCENERY_COLOUR_RULES).sort(), Object.keys(APART_CASES).sort());
});

for (const key of Object.keys(APART_CASES)) {
  test(`${key} passes the goldens harness`, () => {
    const [id, v] = key.split('@');
    checkGeneratorContract(registry, registry.generator(id, Number(v)), { cases: APART_CASES[key] });
  });
}

test('stand.apart@1 lets a chain of a backdrop\'s tones name each link exactly within the nesting of 6 (bg-forest at night with a Hills swatch)', () => {
  // the forest's main tones as the code works them out (tests/fixtures/code-sprites/bg-forest.js mainTones), at night,
  // land #3f8a4f: the leaf tone is two links further on than the trees it stands in front of
  const air = { rule: 'sky.look', v: 1, of: 'sky', time: 0.5, dark: 1, what: 'air' };
  const band = { ...air, what: 'band', at: 0.7 };
  const at = (of, depth, behind, also) => ({ rule: 'stand.apart', v: 1, of, air, depth, behind, also, night: true });
  const rock = at({ rule: 'tone', of: 'land', by: -0.4 }, 0.55 - 0.1 + 0.4 * 0.35, [air], [band]);
  const back = at({ rule: 'tone', of: 'land', by: -0.3 }, 0.4 - 0.1 + 0.4 * 0.35, [air], [rock]);
  const front = at({ rule: 'tone', of: 'land', by: -0.3 }, 0.15 - 0.1 + 0.4 * 0.35, [back], [rock]);
  const leaf = at('leaf.dark', 0 - 0.1 + 0.4 * 0.35, [back], [front]);
  const lit = { rule: 'lit.tone', v: 1, of: leaf, air, amount: 0.3 };
  const def = { format: 'loadout-sprite', version: 2, id: 'chain-test', name: 'Chain', blurb: 'A test.', size: [32, 32], pivot: [16, 32],
    meta: { type: 'background', role: 'environment/background', view: 'side', themes: ['fantasy'], gameTypes: ['platformer'], words: ['test'], license: 'draft' },
    palette: [{ id: 'sky', label: 'Sky', default: '#7fb0b8', material: 'sky' }, { id: 'land', label: 'Hills', default: '#3f8a4f', material: 'earth' }, { id: 'leaf', label: 'Trees', default: '#6aa83e', material: 'plant' }],
    body: { layers: [{ name: 'far', scroll: 0.1, draw: [{ kind: 'rect', at: [0, 0], size: [32, 32], paint: lit, shade: 0 }] }] }, clips: { far: { frames: 1, fps: 4 } } };
  const v = validateSprite(def);
  assert.ok(v.ok, (v.errors ?? []).join('; '));
});

test('tall.trees@1 given the air shades its crowns and trunks as the code did (lit 0.3 towards the air, dark a tone of -0.45), so a layer names each chain of tones once', () => {
  const base = { count: 4, seed: 31, bushes: 11, leaf: 'leaf', bark: 'bark' };
  const named = registry.runGenerator({ gen: 'tall.trees', v: 1, ...base, lit: { rule: 'lit.tone', v: 1, of: 'leaf', air: 'air', amount: 0.3 }, dark: { rule: 'tone', of: 'leaf', by: -0.45 },
    barkLit: { rule: 'lit.tone', v: 1, of: 'bark', air: 'air', amount: 0.3 }, barkDark: { rule: 'tone', of: 'bark', by: -0.45 } }, LAYER);
  const derived = registry.runGenerator({ gen: 'tall.trees', v: 1, ...base, air: 'air' }, LAYER);
  assert.ok(named.ok && derived.ok, [...named.errors, ...derived.errors].join('; '));
  assert.deepEqual(derived.primitives, named.primitives);
  // a tone named wins over the one it would make
  const own = registry.runGenerator({ gen: 'tall.trees', v: 1, ...base, air: 'air', dark: 'leaf.dark' }, LAYER);
  assert.ok(own.primitives.some((p) => p.paint === 'leaf.dark'));
  // with neither the air nor its tones, those tones are not drawn (clear)
  const none = registry.runGenerator({ gen: 'tall.trees', v: 1, ...base }, LAYER);
  assert.ok(none.ok);
  assert.deepEqual([...new Set(none.primitives.map((p) => p.paint))].sort(), ['bark', 'clear', 'leaf']);
});

test('stand.apart@1 is weighed as two clear.of in a frame\'s colour work, and a chain named in several paints is worked out once', () => {
  const pal = { sky: { hex: '#7fb8e0' }, land: { hex: '#2fb3a8' }, rock: { hex: '#6a7280' } };
  const chainOf = (base, d) => (d === 0 ? base : { rule: 'stand.apart', v: 1, of: chainOf(base, d - 1), air: 'sky', depth: 0.3, behind: ['rock'], also: ['sky'] });
  const chain = (d) => chainOf('land', d);
  // 12 different ones (each 120, two of clear.of's 60) fit the 1,500 of a frame; a 13th does not
  const fits = { left: 1500, memo: new Map() };
  for (const base of ['land', 'rock']) assert.match(workOutColour(chainOf(base, 6), pal, {}, null, 0, fits) ?? '', /^#[0-9a-f]{6}$/);
  assert.equal(fits.left, 1500 - 12 * 120);
  assert.equal(workOutColour(chainOf('sky', 1), pal, {}, null, 0, fits), null);
  assert.equal(fits.over, true);
  // the same chain inside a lit tone and a tone of it: charged once
  const once = { left: 1500, memo: new Map() };
  for (const p of [chain(6), { rule: 'lit.tone', v: 1, of: chain(6), air: 'sky', amount: 0.3 }, { rule: 'tone', of: chain(6), by: -0.45 }]) assert.ok(workOutColour(p, pal, {}, null, 0, once));
  assert.equal(1500 - once.left, 6 * 120 + 1 + 1);
});

test('workOutColour\'s memo gives what working out without it gives, in any order, at any depth (review of M10b, issue 8)', async () => {
  const { workOutColour } = await import('../../engine/gen/backdrop.js');
  const palette = { land: { hex: '#3f8a4f' }, air: { hex: '#9fb8d8' } };
  // eight hazes inside one another: worked out at depth 0 the slot is read at depth 8 (in reach), at depth 1 it is not
  let chain = 'land';
  for (let k = 0; k < 8; k++) chain = { rule: 'haze', v: 1, of: chain, air: 'air', depth: 0.1 };
  const plain = (d) => workOutColour(chain, palette, {}, null, d, null);
  assert.match(plain(0), /^#[0-9a-f]{6}$/);
  assert.equal(plain(1), null);
  for (const order of [[0, 1, 0, 1], [1, 0, 1, 0], [2, 0, 1]]) {
    const budget = { left: 1e6, memo: new Map() };
    for (const d of order) assert.equal(workOutColour(chain, palette, {}, null, d, budget), plain(d), `order ${order}: at depth ${d}`);
    // and what lies inside: the inner hazes at the depths they are met
    const b2 = { left: 1e6, memo: new Map() };
    workOutColour(chain, palette, {}, null, 1, b2);
    assert.equal(workOutColour(chain.of, palette, {}, null, 1, b2), workOutColour(chain.of, palette, {}, null, 1, null));
  }
});
