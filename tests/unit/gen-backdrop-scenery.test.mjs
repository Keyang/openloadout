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
import { battlements as oldBattlements, fillBelow, tidy as oldTidy } from '../../engine/backdrop.js';
import { pavedFloor, groundMarks, farHouse, pillar as oldPillar, wallRing as oldWallRing, lightPatch as oldLightPatch } from '../../engine/scenery.js';
import { wrapped as oldWrapped } from '../../engine/backdrop.js';
import { hash as mhash, wave as mwave, lerp as mlerp } from '../../engine/motion.js';
import { rectIn } from '../../engine/surface.js';
import fs from 'node:fs';
import { tidyPlan, TIDY_LIMITS } from '../../engine/gen/scenery.js';
import { validateSprite } from '../../catalog/sprite-schema.js';
import { makeDataSprite } from '../../engine/data-sprite.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import { standApart, standOutLighter } from '../../engine/scenery.js';
import { recede, standOut } from '../../engine/backdrop.js';
import { workOutColour } from '../../engine/gen/backdrop.js';
import { SCENERY_COLOUR_RULES } from '../../engine/gen/scenery.js';
import { PALETTE as SITE_PALETTE } from '../../engine/palettes.js';

const LAYER = { size: [320, 180] };
const SMALL = { size: [96, 48] };
const GROUND = { kind: 'ridge', base: 30, height: 8, seed: 9, peaks: 2, rough: 0.1 };
const LEAVES = { leaf: 'leaf', lit: 'leaf.light', dark: 'leaf.dark' };
const KINDS = { a: { width: 22, capital: 4, foot: 5, courses: 13 }, b: { width: 16, capital: 5, foot: 4, collar: 30, collar2: 84 }, c: { width: 20, capital: 3, foot: 7, courses: 19, collar: 52 } };
const FLAME = ['fire.light', 'fire', 'fire.dark', 'fire.deep'];

const CASES = {
  'tidy@1': [
    { args: { draw: [{ kind: 'rect', at: [0, 0], size: [96, 48], paint: 'sky' }, { gen: 'ridge', v: 1, base: 40, height: 20, seed: 3, peaks: 4, shape: 'jagged', rough: 0.55, paint: 'rock', litEdge: { depth: 0.75, paint: 'rock.light' } }] }, ctx: SMALL },
    { args: { draw: [{ kind: 'ellipse', at: [20, 20], r: [8, 8], paint: 'leaf' }, { kind: 'ellipse', at: [27, 18], r: [6, 5], paint: 'leaf.light' }, { kind: 'dot', at: [40, 10], paint: 'leaf' }] }, ctx: SMALL },
    { args: { most: 16, draw: [{ kind: 'poly', points: [[0, 40], [96, 30], [96, 48], [0, 48]], paint: 'land' }, { kind: 'arc', at: [48, 60], r: 30, a0: 140, a1: 220, thick: 3, paint: 'ring' }] }, ctx: SMALL },
    { args: { most: 300, draw: [{ gen: 'tall.trees', v: 1, count: 2, seed: 7, foot: 48, ...LEAVES, bark: 'bark', barkLit: 'bark.light', barkDark: 'bark.dark' }, { kind: 'ring', at: [80, 12], r: 6, paint: 'ring' }, { kind: 'line', from: [2, 4], to: [60, 20], thick: 1, paint: 'land' }] }, ctx: SMALL },
  ],
  'castle.wall@1': [
    { args: { top: 107, bays: 4, lit: 0.45, bright: 'stone.light', base: 'stone', dark: 'stone.dark', deep: 'stone.deep', lamp: 'lamp' }, ctx: LAYER },
    { args: { top: 92, bays: 2, lit: 1, seed: 2, bright: 'stone.light', base: 'stone', dark: 'stone.dark', deep: 'stone.deep', lamp: 'lamp' }, ctx: LAYER },
    { args: { top: 122, bays: 6, lit: 0, wrap: false, bright: 'stone.light', base: 'stone', dark: 'stone.dark', deep: 'stone.deep', lamp: 'lamp' }, ctx: LAYER },
  ],
  'tall.trees@1': [
    { args: { count: 4, seed: 31, ...LEAVES, bark: 'bark', barkLit: 'bark.light', barkDark: 'bark.dark' }, ctx: LAYER },
    { args: { count: 2, seed: 7, foot: 48, ...LEAVES, bark: 'bark', barkLit: 'bark.light', barkDark: 'bark.dark' }, ctx: SMALL },
    { args: { count: 6, seed: 31, wrap: false, bushes: 11, ...LEAVES, bark: 'bark', barkLit: 'bark.light', barkDark: 'bark.dark' }, ctx: LAYER },
  ],
  'round.trees@1': [
    { args: { ground: GROUND, count: 3, seed: 31, tall: 20, vary: 6, ...LEAVES, wood: 'bark', woodDark: 'bark.dark' }, ctx: SMALL },
    { args: { base: 120, count: 5, ...LEAVES, wood: 'bark', woodDark: 'bark.dark' }, ctx: LAYER },
    { args: { ground: { ...GROUND, base: 114, height: 5 }, count: 8, sink: 4, ...LEAVES, wood: 'bark', woodDark: 'bark.dark', wrap: false }, ctx: LAYER },
  ],
  'towers@1': [
    { args: { ground: { kind: 'ridge', base: 128, height: 36, seed: 11, peaks: 5, shape: 'jagged', rough: 0.5 }, count: 9, seed: 6, lit: 5, stone: 'stone', lamp: 'lamp' }, ctx: LAYER },
    { args: { base: 40, count: 3, seed: 2, jitter: 0, stone: 'stone', lamp: 'lamp' }, ctx: SMALL },
    { args: { base: 40, count: 4, seed: 9, lit: 4, sink: 0, stone: 'stone', lamp: 'lamp', wrap: false }, ctx: SMALL },
  ],
  'far.house@1': [
    { args: { at: [40, 30], walls: 'wall', tiles: 'roof' }, ctx: SMALL },
    { args: { at: [92, 30], width: 15, chimney: true, window: true, walls: 'wall', tiles: 'roof', lamp: 'lamp' }, ctx: SMALL },
    { args: { at: [4, 40], width: 11, wall: 4, roof: 5, window: true, walls: 'wall', tiles: 'roof' }, ctx: SMALL },
  ],
  'battlements@1': [
    { args: { base: 30, tooth: 10, gap: 6, depth: 7, paint: 'stone' }, ctx: SMALL },
    { args: { base: 107, tooth: 10, gap: 6, depth: 7, paint: 'stone' }, ctx: LAYER },
    { args: { base: 20, to: 40, paint: 'stone' }, ctx: SMALL },
  ],
  'arcade@1': [
    { args: { count: 4, width: 52, crown: 70, spring: 96, paint: 'dark' }, ctx: LAYER },
    { args: { count: 3, width: 14, crown: 10, spring: 30, offset: 0.5, side: 'above', to: 44, paint: 'stone' }, ctx: SMALL },
    { args: { count: 3, width: 14, crown: 10, spring: 30, offset: 0.5, side: 'above', depth: 3, paint: 'stone.dark' }, ctx: SMALL },
    { args: { count: 2, width: 30, crown: 12, spring: 24, depth: 2, paint: 'trim' }, ctx: SMALL },
  ],
  'pillars@1': [
    { args: { count: 3, top: 0, bottom: 121, ...KINDS, turns: 'three', seed: 1, bright: 'stone.light', base: 'stone', dark: 'stone.dark' }, ctx: LAYER },
    { args: { count: 2, offset: 0.5, top: 4, bottom: 44, a: { width: 10, courses: 6 }, seed: 3, bright: 'stone.light', base: 'stone', dark: 'stone.dark' }, ctx: SMALL },
    { args: { count: 4, top: 54, bottom: 168, ...KINDS, turns: 'two', bright: 'stone.light', base: 'stone', dark: 'stone.dark' }, ctx: LAYER },
  ],
  'banners@1': [
    { args: { count: 3, offset: 0.5, cloth: 'cloth', dark: 'cloth.dark', trim: 'cloth.light' }, ctx: LAYER },
    { args: { count: 2, width: 12, length: 20, short: 14, cloth: 'cloth', dark: 'cloth.dark', trim: 'cloth.light' }, ctx: SMALL },
    { args: { count: 4, top: 4, cloth: 'cloth', dark: 'cloth.dark', trim: 'cloth.light', wrap: false }, ctx: LAYER },
  ],
  'wall.torches@1': [
    { args: { count: 3, lit: 0.5, y: 50, flame: FLAME, iron: 'iron', ironLit: 'fire' }, ctx: { ...LAYER, t: 0.25, loop: true, frames: 8, frame: 2 } },
    { args: { count: 3, lit: 0.5, y: 50, show: 'glow', warm: ['wall.light', 'wall.light'], flame: FLAME, iron: 'iron', ironLit: 'fire' }, ctx: { ...LAYER, t: 0.5, loop: true, frames: 8, frame: 4 } },
    { args: { count: 4, lit: 0.5, y: 40, face: 16, faceWarm: ['stone.light', 'fire.light'], flame: FLAME, iron: 'iron', ironLit: 'fire' }, ctx: { ...LAYER, t: 0.75, loop: true, frames: 8, frame: 6 } },
    { args: { count: 2, offset: 0.5, lit: 1, y: 24, size: 0.8, flame: FLAME, iron: 'iron', ironLit: 'fire' }, ctx: SMALL },
  ],
  'ground.marks@1': [
    { args: { top: 144, bottom: 172, count: 13, seed: 6, keep: [145, 153], pebbles: 0.3, dark: 'soil.dark', stone: 'soil.light' }, ctx: LAYER },
    { args: { top: 20, bottom: 46, count: 5, seed: 2, dark: 'soil.dark' }, ctx: SMALL },
    { args: { top: 148, bottom: 176, count: 7, seed: 12, keep: [146, 154], dark: 'joint', wrap: false }, ctx: LAYER },
  ],
  'paved.course@1': [
    { args: { top: 132, h: 6, period: 32, seed: 87, body: 'floor', joint: 'joint', lit: 'floor.light', dark: 'floor.dark' }, ctx: LAYER },
    { args: { top: 145, h: 13, period: 64, calm: true, seed: 89, body: 'floor', joint: 'joint', lit: 'floor.light', dark: 'floor.dark' }, ctx: LAYER },
    { args: { top: 20, h: 10, period: 48, shift: 9, joints: [4, 20], seed: 2, body: 'floor', joint: 'joint' }, ctx: SMALL },
  ],
  'edge.band@1': [
    { args: { ground: { kind: 'ridge', base: 150, height: 32, seed: 7, peaks: 3, rough: 0.15 }, paint: 'land.light' }, ctx: LAYER },
    { args: { ground: { kind: 'ridge', base: 120, height: 40, seed: 5, peaks: 3, rough: 0.12 }, also: { kind: 'ridge', base: 120, height: 29, seed: 5, peaks: 3, rough: 0.2, dx: 53 }, dx: -4, dy: 3, paint: 'land.light' }, ctx: LAYER },
    { args: { ground: { ...GROUND }, dx: 2, dy: 2, paint: 'land.light', wrap: false }, ctx: SMALL },
  ],
  'tufts@1': [
    { args: { base: 132, count: 30, seed: 3, height: 6, paint: 'grass' }, ctx: LAYER },
    { args: { base: 132, count: 30, seed: 3, height: 6, from: 4, to: 139, paint: 'grass.dark' }, ctx: LAYER },
    { args: { base: 40, count: 8, seed: 8, height: 7, paint: 'grass', wrap: false }, ctx: SMALL },
  ],
  'castle.columns@1': [
    { args: { count: 3, bright: 'stone.light', base: 'stone', dark: 'stone.dark' }, ctx: LAYER },
    { args: { count: 2, offset: 0.25, spring: 12, shaft: 10, foot: 36, bright: 'stone.light', base: 'stone', dark: 'stone.dark' }, ctx: SMALL },
    { args: { count: 4, spring: 40, foot: 150, wrap: false, bright: 'stone.light', base: 'stone', dark: 'stone.dark' }, ctx: LAYER },
  ],
  'rail.fence@1': [
    { args: { ground: { kind: 'ridge', base: 114, height: 5, seed: 9, peaks: 2, rough: 0.1, dy: 17 }, height: 10, open: [4, 11], missing: 3, seed: 4, wood: 'wood', lit: 'wood.light', shadow: 'wood.dark' }, ctx: LAYER },
    { args: { base: 40, posts: 6, wood: 'wood' }, ctx: SMALL },
    { args: { ground: GROUND, posts: 5, height: 8, rails: [1, 5], thick: 1, open: [2, -1], seed: 1, wood: 'wood', lit: 'wood.light' }, ctx: SMALL },
  ],
};

const solid = (g) => g.data.filter((v) => v >>> 24).length;
/** Primitives drawn onto a frame, every paint one grey: what is covered. */
const cover = (prims, [w, h]) => renderList(w, h, prims.map((p) => ({ ...p, paint: 'x' })), { palette: { x: '#808080' } }).g;

test('each scenery generator is registered in the backdrop family, as a frame generator, with a one-line about', () => {
  for (const key of Object.keys(CASES)) {
    const [id, v] = key.split('@');
    const e = registry.generator(id, Number(v));
    assert.ok(e, `${key} is registered`);
    assert.equal(e.family, 'backdrop', key);
    if (key !== 'tidy@1') assert.equal(e.wraps, true, `${key} wraps`);      // tidy@1 draws what its calls draw, each told to wrap or not
    assert.ok(SCENERY_GENERATORS[key], `${key} is listed by engine/gen/scenery.js`);
    assert.ok(registry.FRAME_GENERATORS[key] && SCENERY_FRAME_GENERATORS[key], `${key} is a frame generator`);
    assert.ok(typeof e.about === 'string' && e.about.length > 30 && !e.about.includes('\n'), `${key} about`);
  }
  assert.deepEqual(Object.keys(SCENERY_GENERATORS).sort(), Object.keys(CASES).sort());
});

for (const key of Object.keys(CASES)) {
  test(`${key} passes the goldens harness`, () => {
    const [id, v] = key.split('@');
    checkGeneratorContract(registry, registry.generator(id, Number(v)), { cases: CASES[key] });
  });
}

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

test('each draws something at its golden cases, and what wraps closes across the join', () => {
  let crossing = 0;
  for (const [key, cases] of Object.entries(CASES)) {
    const [id, v] = key.split('@');
    for (const c of cases) {
      const r = registry.runGenerator({ gen: id, v: Number(v), ...c.args }, c.ctx);
      assert.ok(r.ok, `${key}: ${r.errors.join('; ')}`);
      const g = cover(r.primitives, c.ctx.size);
      assert.ok(solid(g) > 4, `${key} draws at ${JSON.stringify(c.args).slice(0, 80)}`);
      if (c.args.wrap === false || key === 'tidy@1') continue;      // tidy@1 draws what its calls draw, each told to wrap or not
      // the layer drawn next to itself: every pixel a shape covers past an edge is drawn again inside the frame across
      // the join, and the frame covers nothing the fold does not
      const [w, h] = c.ctx.size, fold = folded(r.primitives, [w, h]);
      let cut = 0;
      for (let i = 0; i < w * h; i++) if (fold[i] !== (g.data[i] >>> 24 ? 1 : 0)) cut++;
      assert.equal(cut, 0, `${key} at ${JSON.stringify(c.args).slice(0, 80)}: ${cut} pixels differ from the layer folded across the join`);
      if (r.primitives.some((p) => { const xs = [p.at?.[0], p.from?.[0], p.to?.[0], ...(p.points ?? []).map((q) => q[0])].filter((x) => typeof x === 'number'); return xs.some((x) => x < 0 || x > w); })) crossing++;
    }
  }
  assert.ok(crossing >= 10, `the cases put shapes across the join (${crossing} of them do)`);
});

test('battlements@1 fills what engine/backdrop.js battlements and fillBelow filled, pixel for pixel', () => {
  for (const [base, o] of [[107, { tooth: 10, gap: 6, depth: 7 }], [60, { tooth: 8, gap: 8, depth: 6 }]]) {
    const old = new Surface(320, 180);
    fillBelow(old, oldBattlements(base, o), '#808080');
    const r = registry.runGenerator({ gen: 'battlements', v: 1, base, ...o, paint: 'x' }, LAYER);
    assert.deepEqual([...cover(r.primitives, [320, 180]).data], [...old.data], `base ${base}`);
  }
});

test('paved.course@1 courses, back to front, draw what engine/scenery.js pavedFloor drew', () => {
  const courses = [{ h: 6, period: 32 }, { h: 7, period: 40, shift: 9 }, { h: 13, period: 64 }, { h: 22, period: 80, shift: 23 }];
  const colours = { body: '#7e84a0', joint: '#3a3d4f', lit: '#a8aec4', shade: '#6a7088' };
  const old = new Surface(320, 180);
  pavedFloor(old, { top: 132, courses, joints: [[10, 29], [4, 20]], colours, shaded: 0.22, clear: [146, 154], seed: 3 });
  const prims = [];
  let y = 132;
  courses.forEach((c, k) => {
    const calm = y <= 154 && y + c.h > 146;
    const r = registry.runGenerator({ gen: 'paved.course', v: 1, top: y, h: c.h, period: c.period, shift: c.shift ?? 0, joints: k % 2 ? [4, 20] : [10, 29], shaded: 0.22, calm, seed: 3 * 29 + k, body: 'body', joint: 'joint', lit: 'lit', dark: 'shade' }, LAYER);
    assert.ok(r.ok, r.errors.join('; '));
    prims.push(...r.primitives);
    y += c.h;
  });
  const g = renderList(320, 180, prims, { palette: Object.fromEntries(Object.entries(colours).map(([k, hex]) => [k, { hex }])) }).g;
  for (let row = 132; row < y; row++) for (let x = 0; x < 320; x++) assert.equal(g.get(x, row), old.get(x, row), `${x},${row}`);
});

test('ground.marks@1 and far.house@1 put their marks and walls where engine/scenery.js groundMarks and farHouse did', () => {
  const old = new Surface(320, 180);
  groundMarks(old, { top: 144, bottom: 172, count: 13, seed: 6, clear: [145, 153], pebbles: 0.3, colours: { dark: '#808080', stone: '#808080', light: '#808080' } });
  const r = registry.runGenerator({ gen: 'ground.marks', v: 1, top: 144, bottom: 172, count: 13, seed: 6, keep: [145, 153], pebbles: 0.3, dark: 'x', stone: 'x', gleam: 'x' }, LAYER);
  assert.deepEqual([...cover(r.primitives, [320, 180]).data], [...old.data]);
  const house = new Surface(96, 48);
  farHouse(house, 40, 30, { width: 15, wall: 5, roof: 6, chimney: true, tones: { wall: '#808080', roof: '#808080', window: '#808080' } });
  const h = registry.runGenerator({ gen: 'far.house', v: 1, at: [40, 30], width: 15, chimney: true, window: true, walls: 'x', tiles: 'x', lamp: 'x' }, { size: [96, 48] });
  assert.deepEqual([...cover(h.primitives, [96, 48]).data].map((v) => !!v), [...house.data].map((v) => !!v));
});

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

test('pillars@1 and wall.torches@1 draw the pillars, rings, lit faces, glow and cups of sprites/bg-battle-dungeon.js mid layer pixel for pixel (the flames apart)', () => {
  // the code's mid layer (tests/fixtures/code-sprites/bg-battle-dungeon.js): engine/scenery.js lightPatch, pillar, wallRing,
  // wallTorch's cup; KINDS by turns, pillar i with seed i + 1, the face patch clipped to its pillar's shaft
  const KINDS3 = [{ width: 22, capital: 4, foot: 5, courses: 13, collars: [] }, { width: 16, capital: 5, foot: 4, courses: 0, collars: [30, 84] }, { width: 20, capital: 3, foot: 7, courses: 19, collars: [52] }];
  const C = { warm0: '#402020', warm1: '#603030', light: '#c0c0c0', base: '#808080', dark: '#404040', iron: '#202060', ironLit: '#e0c040', face0: '#a06040', face1: '#c08050', f1: '#ffff00', f2: '#ffcc00', f3: '#ff8800', f4: '#cc4400' };
  const pal = { palette: Object.fromEntries(Object.entries(C).map(([k, hex]) => [k, { hex }])) };
  const tones = { light: C.light, base: C.base, dark: C.dark };
  let cases = 0;
  for (const n of [2, 3, 4, 5]) for (const torches of [0, 0.5, 1]) for (const t of [0, 0.375]) {
    const y = n % 2 ? 60 : 49, span = 320 / n, at = (i) => Math.round(i * span);
    const order = [...Array(n).keys()].sort((a, b) => (b % 2) - (a % 2) || a - b);
    const lit = new Set(order.slice(0, Math.max(1, Math.floor(mlerp(1, n, torches) + 1e-6))));
    const flick = (i) => 0.75 + 0.15 * mwave(t, mhash(i, 3)) + 0.1 * mwave(2 * t, mhash(i, 4));
    const old = new Surface(320, 180);
    for (const i of lit) oldLightPatch(old, at(i), y - 5, 25, [C.warm0, C.warm1], { level: flick(i), seed: i });
    for (let i = 0; i < n; i++) {
      const kind = KINDS3[n % 2 && i === n - 1 ? 2 : i % 2];
      const box = oldPillar(old, at(i), { top: 0, bottom: 121, ...kind, seed: i + 1, tones });
      if (!lit.has(i)) { oldWallRing(old, at(i), y - 4, { links: 2 + (i % 3), colour: C.iron }); continue; }
      oldWrapped(at(i), kind.width, (x) => oldLightPatch(old, x, y - 3, 13, [C.face0, C.face1], { level: flick(i), squash: 1.4, seed: i + 9, clip: rectIn(x - kind.width / 2, box.top + 3, kind.width, box.bottom - box.top - 3) }));
      oldWrapped(at(i), 13, (cx) => { old.rect(cx - 1, y + 3, 3, 7, C.iron).rect(cx - 4, y + 8, 6, 2, C.iron).rect(cx - 3, y, 7, 4, C.iron).rect(cx - 3, y, 7, 1, C.ironLit); });
    }
    const ctx = { ...LAYER, t, loop: true, frames: 8, frame: 0 };
    const common = { count: n, lit: torches, y, flame: ['f1', 'f2', 'f3', 'f4'], iron: 'iron', ironLit: 'ironLit' };
    const glow = registry.runGenerator({ gen: 'wall.torches', v: 1, ...common, show: 'glow', reach: 25, warm: ['warm0', 'warm1'] }, ctx);
    const pill = registry.runGenerator({ gen: 'pillars', v: 1, count: n, top: 0, bottom: 121, turns: 'three', seed: 1, a: { width: 22, capital: 4, foot: 5, courses: 13 }, b: { width: 16, capital: 5, foot: 4, collar: 30, collar2: 84 },
      c: { width: 20, capital: 3, foot: 7, courses: 19, collar: 52 }, bright: 'light', base: 'base', dark: 'dark' }, LAYER);
    const torch = registry.runGenerator({ gen: 'wall.torches', v: 1, ...common, show: 'torch', face: 16, faces: { a: 22, b: 16, c: 20 }, faceWarm: ['face0', 'face1'] }, ctx);
    for (const r of [glow, pill, torch]) assert.ok(r.ok, r.errors.join('; '));
    const flames = new Set(['f1', 'f2', 'f3', 'f4']);
    const g = renderList(320, 180, [...glow.primitives, ...pill.primitives, ...torch.primitives.filter((p) => !flames.has(p.paint))], pal).g;
    let differ = 0;
    for (let k = 0; k < g.data.length; k++) if (g.data[k] !== old.data[k]) differ++;
    assert.equal(differ, 0, `${n} pillars, torches ${torches}, t ${t}: ${differ} pixels differ`);
    cases++;
  }
  assert.equal(cases, 24);
});

test('tidy@1 takes off every single pixel of what it draws (as engine/backdrop.js tidy did) and keeps the rest', () => {
  const lone = (g) => { let n = 0; const W = g.w, H = g.h, at = (x, y) => (y < 0 || y >= H ? -1 : g.data[y * W + ((x + W) % W)]);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = at(x, y); if (v !== at(x - 1, y) && v !== at(x + 1, y) && v !== at(x, y - 1) && v !== at(x, y + 1)) n++; } return n; };
  const ridge = { gen: 'ridge', v: 1, base: 156, height: 84, seed: 3, peaks: 4, shape: 'jagged', rough: 0.55, paint: 'rock', litEdge: { depth: 0.75, paint: 'lit' } };
  const sky = { kind: 'rect', at: [0, 0], size: [320, 180], paint: 'sky' };
  const pal = { palette: { sky: { hex: '#80b0d0' }, rock: { hex: '#608090' }, lit: { hex: '#90b0c0' } } };
  const plain = renderList(320, 180, [sky, ...registry.runGenerator(ridge, LAYER).primitives], pal).g;
  const tidied = renderList(320, 180, registry.runGenerator({ gen: 'tidy', v: 1, draw: [sky, ridge] }, LAYER).primitives, pal).g;
  assert.ok(lone(plain) > 0, 'the ridge alone leaves single pixels');
  assert.equal(lone(tidied), 0, 'tidied, none');
  let differ = 0;
  for (let i = 0; i < plain.data.length; i++) if (plain.data[i] !== tidied.data[i]) differ++;
  assert.ok(differ > 0 && differ <= 320 * 180 * 0.01, `only the single pixels and what they leave change (${differ} of ${320 * 180})`);
  // past its most it gives the drawing back untidied, within its cost
  const r = registry.runGenerator({ gen: 'tidy', v: 1, most: 16, draw: [sky, ridge] }, LAYER);
  assert.ok(r.primitives.length <= r.cost);
});

/** What tidy@1 is given to draw: its written shapes and what its calls return, flat, in order. */
const flatInput = (draw, ctx) => draw.flatMap((x) => (x.gen ? registry.runGenerator(x, ctx).primitives : [x])).map((p) => { const { z, group, ...q } = p; void z; void group; return { ...q, shade: 0, light: 0 }; });
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

test('tidy@1 gives back what it draws, flat, then one-pixel patches (or, where a pixel it drew is lost, its grid); drawn, the same pixels as engine/backdrop.js tidy on the drawing', () => {
  const forms = new Set();
  for (const [k, draw] of [...TIDY_LAYERS.entries(), ['ridge alone', TIDY_LAYERS[0].slice(1)]]) {
    const flat = flatInput(draw, LAYER);
    const r = registry.runGenerator({ gen: 'tidy', v: 1, most: 1000, draw }, LAYER);
    assert.ok(r.ok, r.errors.join('; '));
    let patches;
    if (JSON.stringify(r.primitives.slice(0, flat.length)) === JSON.stringify(flat)) {
      // the things themselves, flat, in order, then one-pixel-high patches of the colours pixels became
      patches = r.primitives.slice(flat.length);
      assert.ok(patches.every((p) => p.kind === 'rect' && p.size[1] === 1 && p.shade === 0 && p.paint !== 'clear'), `layer ${k}: then one-pixel-high patches`);
      forms.add('patches');
    } else {
      // a pixel it drew became see-through: its grid as flat stair polygons, see-through pixels not drawn
      assert.ok(r.primitives.every((p) => p.kind === 'poly' && p.shade === 0), `layer ${k}: the drawing's grid in flat polygons`);
      patches = r.primitives;
      forms.add('grid');
    }
    // the code's way: the whole drawing on a surface, then its single pixels taken off (engine/backdrop.js tidy)
    const old = renderList(320, 180, flat, PAL).g;
    oldTidy(old);
    const now = renderList(320, 180, r.primitives, PAL).g;
    let differ = 0;
    for (let i = 0; i < old.data.length; i++) if (old.data[i] !== now.data[i]) differ++;
    assert.equal(differ, 0, `layer ${k}: ${differ} pixels differ from engine/backdrop.js tidy (${patches.length} patches)`);
    assert.ok(k === 2 || patches.length > 0, `layer ${k} had single pixels to take off`);
  }
  assert.deepEqual([...forms].sort(), ['grid', 'patches'], 'both forms are tried');
});

test('tidy@1 lays out a thin line as the renderer draws it: 400 random backgrounds with a line, the same pixels as engine/backdrop.js tidy', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const at = (far) => [Math.round((rnd() * (far ? 4000 : 360) - (far ? 2000 : 20)) * 2) / 2, Math.round((rnd() * (far ? 4000 : 220) - (far ? 2000 : 20)) * 2) / 2];
  let bad = 0;
  const first = [];
  for (let i = 0; i < 400; i++) {
    const line = { kind: 'line', from: at(i % 10 === 0), to: at(false), paint: i % 2 ? 'rock' : 'leaf' };
    if (i % 3) line.thick = 1;
    const draw = [{ kind: 'rect', at: [0, 0], size: [320, 180], paint: 'sky' }, line];
    const r = registry.runGenerator({ gen: 'tidy', v: 1, most: 1000, draw }, LAYER);
    assert.ok(r.ok, r.errors.join('; '));
    const old = renderList(320, 180, flatInput(draw, LAYER), PAL).g;
    oldTidy(old);
    const now = renderList(320, 180, r.primitives, PAL).g;
    let differ = 0;
    for (let k = 0; k < old.data.length; k++) if (old.data[k] !== now.data[k]) differ++;
    if (differ) { bad++; if (first.length < 3) first.push(`${JSON.stringify(line)}: ${differ} px`); }
  }
  assert.equal(bad, 0, `${bad} of 400 differ, e.g. ${first.join('; ')}`);
});

test('tidy@1 refuses a limb or a capsule written in its draw (in a data file they are drawn along a bone), when checked, never at draw time', () => {
  const draw = [{ kind: 'rect', at: [0, 0], size: [320, 180], paint: 'sky' }];
  for (const bad of [{ kind: 'limb', from: [20, 20], to: [120, 60], width: 5, paint: 'rock' }, { kind: 'capsule', from: [20, 20], to: [120, 60], r: 3, paint: 'rock' }]) {
    const c = registry.checkCall({ gen: 'tidy', v: 1, draw: [...draw, bad] });
    assert.equal(c.ok, false, bad.kind);
    assert.match(c.errors.join(' '), new RegExp(`a ${bad.kind} cannot be written in tidy's draw`), bad.kind);
    const r = registry.runGenerator({ gen: 'tidy', v: 1, draw: [...draw, bad] }, LAYER);
    assert.equal(r.ok, false, bad.kind);
    // in a sprite: the file is refused when it is checked (catalog/sprite-schema.js), not drawn magenta or crashed later
    const j = JSON.parse(fs.readFileSync(new URL('../../sprites/bg-forest.json', import.meta.url), 'utf8'));
    j.body.layers[0].draw.find((x) => x.gen === 'tidy').draw.push({ ...bad, paint: 'soil', shade: 0 });
    assert.equal(validateSprite(j).ok, false, `${bad.kind} in bg-forest's far tidy`);
  }
  // a line is drawn in frame pixels and is tidied; limbs a generator gives (tall.trees@1's branches) are too
  assert.equal(registry.checkCall({ gen: 'tidy', v: 1, draw: [...draw, { kind: 'line', from: [20, 20], to: [120, 60], thick: 2, paint: 'rock' }] }).ok, true);
  const trees = { ...TIDY_LAYERS[1][1], count: 10 };      // trees 7 to 10 have side branches (limbs)
  const tidied = registry.runGenerator({ gen: 'tidy', v: 1, most: 2000, draw: [{ kind: 'rect', at: [0, 0], size: [320, 180], paint: 'sky' }, trees] }, LAYER);
  assert.ok(tidied.ok, tidied.errors.join('; '));
  assert.ok(tidied.primitives.some((p) => p.kind === 'limb'), 'the branches are drawn');
});

// Milliseconds a unit of cost may take, with a wide margin for a loaded machine (as gen-b12-safety.test.mjs).
const msFor = (cost) => 30 + cost * 0.1;
/** The quickest of three runs (the first a warm-up), so a busy machine does not fail a sound bound. */
function quickest(fn) {
  fn();
  let best = Infinity, out;
  for (let i = 0; i < 3; i++) { const t0 = performance.now(); out = fn(); best = Math.min(best, performance.now() - t0); }
  return [out, best];
}

test('tidy@1 runs within its cost however big its shapes are (its work is counted before it starts, past it the drawing comes back untidied)', () => {
  const BIG = { size: [640, 360] };
  const ellipses = Array.from({ length: 300 }, (_, i) => ({ kind: 'ellipse', at: [320, 180], r: [400, 400], paint: i % 2 ? 'sky' : 'rock' }));
  const arcs = (n, r) => Array.from({ length: n }, (_, i) => ({ kind: 'arc', at: [320, 180], r, a0: 0, a1: 360, thick: 8, paint: i % 2 ? 'sky' : 'rock' }));
  let inner = { gen: 'tidy', v: 1, most: 2000, draw: ellipses.slice(0, 60) };
  for (let k = 0; k < 3; k++) inner = { gen: 'tidy', v: 1, most: 2000, draw: [inner, inner, inner] };
  const calls = [{ gen: 'tidy', v: 1, draw: ellipses }, { gen: 'tidy', v: 1, most: 2000, draw: ellipses }, { gen: 'tidy', v: 1, draw: arcs(300, 600) },
    { gen: 'tidy', v: 1, draw: arcs(97, 300) }, { gen: 'tidy', v: 1, most: 2000, draw: arcs(97, 300) }, inner, { gen: 'tidy', v: 1, draw: TIDY_LAYERS[0] }];
  for (const call of calls) {
    const [r, ms] = quickest(() => registry.runGenerator(call, BIG));
    assert.ok(r.ok || /over the budget/.test(r.errors.join(' ')), r.errors.join('; '));
    if (!r.ok) continue;
    assert.ok(ms <= msFor(r.cost), `${JSON.stringify(call).slice(0, 80)}: ${ms.toFixed(1)} ms for cost ${r.cost} (allowed ${msFor(r.cost).toFixed(1)})`);
  }
  // the work it counts: what it lays out and passes over, within TIDY_LIMITS.work a primitive of its cost, or nothing laid out
  const room = 400;
  const over = tidyPlan(arcs(97, 300), 640, 360, room, TIDY_LIMITS.work * room);
  assert.equal(over.tidied, false);
  assert.ok(over.work > TIDY_LIMITS.work * room, 'counted, and found over');
  const ok = tidyPlan(flatInput(TIDY_LAYERS[0], LAYER), 320, 180, room, TIDY_LIMITS.work * room);
  assert.equal(ok.tidied, true);
  assert.ok(ok.work <= TIDY_LIMITS.work * room, `a library layer's work ${ok.work}`);
  // a sprite that asks for the most a frame may cost, all of it in tidy calls of big arcs: one frame within the budget's time
  const j = JSON.parse(fs.readFileSync(new URL('../../sprites/bg-forest.json', import.meta.url), 'utf8'));
  j.size = [640, 360]; j.pivot = [320, 360];
  j.body.layers = [{ name: 'far', label: 'Far', scroll: 0.1, draw: Array.from({ length: 4 }, () => ({ gen: 'tidy', v: 1, draw: arcs(97, 300).map((a) => ({ ...a, paint: 'land', shade: 0 })) })).concat([{ kind: 'rect', at: [0, 0], size: [640, 360], paint: 'sky', shade: 0 }, { kind: 'rect', at: [0, 300], size: [640, 60], paint: 'leaf', shade: 0 }]) },
    { name: 'mid', label: 'Middle', scroll: 0.4, draw: [{ kind: 'rect', at: [0, 300], size: [640, 60], paint: 'leaf', shade: 0 }] }, { name: 'near', label: 'Near', scroll: 0.7, draw: [{ kind: 'rect', at: [0, 330], size: [640, 30], paint: 'leaf', shade: 0 }] }];
  delete j.controls;      // its layers are replaced, so bg-forest's controls would be unused and the file refused
  const m = makeDataSprite(j);
  assert.ok(m.ok, (m.errors ?? []).join('; '));
  const [out, ms] = quickest(() => { try { return renderFrame(m.sprite, 'far', 0, defaultParams(m.sprite)); } catch (e) { return e; } });
  assert.ok(!(out instanceof Error), String(out));
  assert.ok(ms <= msFor(registry.GEN_LIMITS.primitives), `one frame took ${ms.toFixed(0)} ms (was 1,175 ms)`);
});

test('wall.torches@1: the flames flicker over a looping clip, every frame differs, and t = 0 and 1 are the same', () => {
  const args = { count: 4, lit: 1, y: 60, face: 16, faceWarm: ['stone.light', 'fire.light'], flame: FLAME, iron: 'iron', ironLit: 'fire' };
  const frames = Array.from({ length: 8 }, (_, f) => JSON.stringify(registry.runGenerator({ gen: 'wall.torches', v: 1, ...args }, { ...LAYER, t: f / 8, loop: true, frames: 8, frame: f }).primitives));
  assert.equal(new Set(frames).size, 8);
  // the loop closes: the phase one whole cycle on (t = 1) draws what frame 0 drew, at every share of torches lit
  for (const lit of [0, 0.5, 1]) for (const show of ['torch', 'glow']) {
    const at = (t) => JSON.stringify(registry.runGenerator({ gen: 'wall.torches', v: 1, ...args, lit, show, warm: ['stone.light', 'fire.light'] }, { ...LAYER, t, loop: true, frames: 8, frame: 0 }).primitives);
    assert.equal(at(1), at(0), `lit ${lit}, ${show}: t = 1 draws what t = 0 drew`);
    assert.notEqual(at(0.5), at(0), `lit ${lit}, ${show}: it moves`);
  }
  const lit = (share, n) => registry.runGenerator({ gen: 'wall.torches', v: 1, ...args, face: 0, count: n, lit: share }, LAYER).primitives.filter((p) => p.kind === 'poly' && p.paint === 'fire.light' && p.points[0][0] >= 0 && p.points[0][0] < 320).length;
  assert.equal(lit(0, 4), 1, 'at least one burns');
  assert.equal(lit(0.5, 4), 2, 'every second one at the middle');
  assert.equal(lit(1, 4), 4, 'all of them at the top');
});

// ---- stand.apart@1: engine/scenery.js standApart as a colour rule (migration batch M10b) -----------------------------
// The backdrops' main tones are each the code's standApart (or standOutLighter) of a colour receded into the air, each
// kept clear of the tone before it. Named as one rule, with the recede inside it, the whole chain of a backdrop's tones
// fits the nesting of 6 colour rules, so a data file names the code's rules at every colour, never a tone moved by the
// steps the code took at the defaults (review of M10, round 3: bg-forest at night with a Hills swatch).

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

test('stand.apart@1 is engine/scenery.js standApart (and standOutLighter) of engine/backdrop.js recede, at every colour', () => {
  // every colour a library swatch list offers, as the shape, the air and what it stands against
  const hexes = [...new Set(Object.values(SITE_PALETTE).flatMap((b) => Object.values(b)).filter((h) => /^#[0-9a-f]{6}$/i.test(h)))].sort();
  assert.ok(hexes.length > 40, `${hexes.length} colours`);
  const pick = (i, k) => hexes[(i * 7 + k * 13) % hexes.length].toLowerCase();
  let n = 0;
  for (let i = 0; i < 160; i++) {
    const [of, air, b1, b2, a1] = [0, 1, 2, 3, 4].map((k) => pick(i, k));
    const depth = (i % 11) / 10, night = i % 3 === 2, darkest = i % 4 === 1 ? 0.26 : 0;
    const pal = { of: { hex: of }, air: { hex: air }, b1: { hex: b1 }, b2: { hex: b2 }, a1: { hex: a1 } };
    const rule = { rule: 'stand.apart', v: 1, of: 'of', air: 'air', depth, behind: ['b1', 'b2'], also: ['a1'], night, darkest };
    const want = standApart(night, darkest)(recede(of, depth, air), [b1, b2], [a1]);
    assert.equal(workOutColour(rule, pal, {}), want, `${JSON.stringify({ of, air, b1, b2, a1, depth, night, darkest })}`);
    // with no air: the colour itself, not receded
    assert.equal(workOutColour({ ...rule, air: 'clear' }, pal, {}), standApart(night, darkest)(of, [b1, b2], [a1]));
    // way lighter: engine/scenery.js standOutLighter (the dungeon's tones), by day
    if (!night) assert.equal(workOutColour({ rule: 'stand.apart', v: 1, of: 'of', air: 'air', depth, behind: ['b1'], also: ['a1'], way: 'lighter' }, pal, {}), standOutLighter(recede(of, depth, air), [b1], { also: [a1] }));
    // one behind and nothing else, by day: engine/backdrop.js standOut
    assert.equal(workOutColour({ rule: 'stand.apart', v: 1, of: 'of', behind: ['b1'] }, pal, {}), standOut(of, [b1]));
    n++;
  }
  assert.equal(n, 160);
});

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

test('edge.band@1 fills what engine/backdrop.js fillBetween(outline, shifted(outline, dx, dy)) fills: the lit tops of the forest\'s and the field\'s hills', async () => {
  const { ridge, highest, shifted, fillBetween: oldFillBetween } = await import('../../engine/backdrop.js');
  const cases = [
    [{ kind: 'ridge', base: 150, height: 32, seed: 7, peaks: 3, rough: 0.15 }, null, -3, 3],
    [{ kind: 'ridge', base: 172, height: 25.6, seed: 15, peaks: 2, rough: 0.2 }, null, -3, 3],
    [{ kind: 'ridge', base: 120, height: 40, seed: 5, peaks: 3, shape: 'round', rough: 0.12 }, { kind: 'ridge', base: 120, height: 28.8, seed: 5, peaks: 3, shape: 'round', rough: 0.2, dx: 53 }, -4, 3],
  ];
  for (const [g, also, dx, dy] of cases) {
    const old = new Surface(320, 180);
    const r = (x) => ridge({ base: x.base, height: x.height, seed: x.seed, peaks: x.peaks, shape: x.shape ?? 'round', rough: x.rough });
    const o = also ? highest(r(g), shifted(r(also), also.dx, 0)) : r(g);
    oldFillBetween(old, o, shifted(o, dx, dy), '#a0a8b8');
    const out = registry.runGenerator({ gen: 'edge.band', v: 1, ground: g, ...(also ? { also } : {}), dx, dy, paint: 'lit' }, LAYER);
    assert.ok(out.ok, out.errors.join('; '));
    const now = renderList(320, 180, out.primitives, { palette: { lit: '#a0a8b8' } }).g;
    let off = 0;
    for (let i = 0; i < old.data.length; i++) if (old.data[i] !== now.data[i]) off++;
    assert.equal(off, 0, `${JSON.stringify(g).slice(0, 60)}: ${off} pixels differ`);
  }
});

test('tufts@1 fills what the field\'s code filled under engine/scenery.js tufts: the grass edge, the dark band under it, the fringe along the bottom', async () => {
  const { tufts: oldTufts } = await import('../../engine/scenery.js');
  const { fillBelow: oldBelow, fillBetween: oldBetween, shifted: oldShifted } = await import('../../engine/backdrop.js');
  for (const [a, draw] of [
    [{ base: 132, count: 30, seed: 3, height: 6 }, (g, o) => oldBelow(g, o, '#40a040')],
    [{ base: 132, count: 30, seed: 3, height: 6, from: 4, to: 139 }, (g, o) => oldBetween(g, oldShifted(o, 0, 4), () => 139, '#40a040')],
    [{ base: 177, count: 22, seed: 8, height: 7 }, (g, o) => oldBelow(g, o, '#40a040')],
  ]) {
    const old = new Surface(320, 180);
    draw(old, oldTufts({ base: a.base, count: a.count, seed: a.seed, height: a.height }));
    const out = registry.runGenerator({ gen: 'tufts', v: 1, ...a, paint: 'grass' }, LAYER);
    assert.ok(out.ok, out.errors.join('; '));
    const now = renderList(320, 180, out.primitives, { palette: { grass: '#40a040' } }).g;
    let off = 0;
    for (let i = 0; i < old.data.length; i++) if (old.data[i] !== now.data[i]) off++;
    assert.equal(off, 0, `${JSON.stringify(a)}: ${off} pixels differ`);
  }
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
