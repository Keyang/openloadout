// The backdrop generators of build item B14 (docs/data-sprites.md 2.4, 3.3 "backdrop", "place", "colour"; engine/gen/backdrop.js):
// each registered in the site registry in its family, each passing the goldens harness (tests/helpers/gen-harness.mjs:
// pinned primitives at three or more argument sets, determinism, no clock or dice, argument fuzz, cost, loop closure),
// the colour rules pinned by the colours they work out, and the ports drawing what the code helpers they replace drew
// (engine/backdrop.js ridge, litEdge, fillBelow, fillBetween; engine/space.js arch, spaceLook): pixel for pixel.
//
// To pin a NEW version: add its cases to CASES, run once with GEN_GOLDEN_WRITE=1, look at the file in tests/fixtures/gen/.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';
import { workOutColour, COLOUR_WORK, BACKDROP_FRAME_GENERATORS, columnPolys } from '../../engine/gen/backdrop.js';
import { renderList } from '../../engine/draw-list.js';
import { Surface } from '../../engine/surface.js';
import { ridge, litEdge, fillBelow, fillBetween, skyLook, scatter as oldScatter } from '../../engine/backdrop.js';
import { oldReplay } from '../helpers/old-replay.mjs';
import { mix } from '../../engine/color.js';

const OLD = oldReplay('gen-backdrop-goldens');   // what engine/space.js (deleted by R3) drew and answered, recorded in the order of the calls (tests/helpers/old-replay.mjs)
const WIDE = { size: [96, 48] };
const CASES = {
  'scatter@1': [
    { args: { count: 4, seed: 12, stable: true, rows: [8, 30], wrap: true, place: { kind: 'rect', size: [3, 2], paint: 'cloud' } }, ctx: WIDE },
    { args: { count: 3, seed: 5, rows: [10, 20], place: { gen: 'disc', v: 1, r: 3, paint: 'sun' } }, ctx: WIDE },
    { args: { count: 6, seed: 13, jitter: 0.8, rows: [40, 43], drift: 8, show: 0.75, wrap: true, place: { kind: 'rect', size: [3, 2], paint: 'dust' } }, ctx: { ...WIDE, t: 0.25 } },
    { args: { count: 5, seed: 2, margin: 4, gap: 10, wrap: false, rows: [4, 28], place: { kind: 'dot', size: 2, paint: 'soil.dark' } }, ctx: { size: [32, 32] } },
    // docs/data-sprites.md 2.3, a tile's fill version: rows from the frame, the margin on both axes, a gap apart
    { args: { count: 3, seed: 41, margin: 4, gap: 10, place: { kind: 'rect', size: [2, 2], paint: 'soil.dark' } }, ctx: { size: [32, 32] } },
  ],
  'sky.bands@1': [
    { args: { paint: { rule: 'sky.look', v: 1, of: 'sky', time: 0.5 }, bands: 4, horizon: 30 }, ctx: WIDE },
    { args: { paint: 'sky', bands: 3, horizon: 28 }, ctx: WIDE },
    { args: { paint: { rule: 'space.look', v: 1, of: 'sky', deep: 'void' }, bands: 3, horizon: 32 }, ctx: WIDE },
  ],
  'ridge@1': [
    { args: { base: 40, height: 20, seed: 3, peaks: 4, shape: 'jagged', rough: 0.55, paint: 'rock', litEdge: { depth: 0.75, paint: 'rock.light' } }, ctx: WIDE },
    { args: { base: 44, height: 8, seed: 7, peaks: 2, paint: 'back' }, ctx: WIDE },
    { args: { base: 30, height: 12, seed: 1, peaks: 3, paint: 'back', to: 40 }, ctx: WIDE },
  ],
  'swell@1': [
    { args: { base: 44, height: 10, at: 48, paint: 'land', rim: { depth: 3, grow: 2, at: 70, paint: 'land.light' } }, ctx: WIDE },
    { args: { base: 40, height: 6, paint: 'land' }, ctx: WIDE },
    { args: { base: 46, height: 20, at: 10, power: 2, paint: 'land', to: 47 }, ctx: WIDE },
  ],
  'fill.below@1': [
    { args: { ground: { kind: 'swell', base: 44, height: 10, at: 48 }, dx: -12, dy: 6, paint: 'land.dark' }, ctx: WIDE },
    { args: { base: 40, paint: 'land' }, ctx: WIDE },
    { args: { ground: { kind: 'ridge', base: 40, height: 10, seed: 6, peaks: 2, rough: 0.2 }, to: 45, paint: 'dust' }, ctx: WIDE },
  ],
  'fill.between@1': [
    { args: { ground: { kind: 'ridge', base: 40, height: 10, seed: 6, peaks: 2, rough: 0.2 }, from: 0, to: 2, paint: 'dust.light' }, ctx: WIDE },
    { args: { ground: { kind: 'swell', base: 60, height: 40, at: 60 }, from: 2, to: 6, paint: 'ring' }, ctx: WIDE },
    { args: { base: 20, from: -3, to: 3, dx: 5, paint: 'band' }, ctx: WIDE },
  ],
  'mist.band@1': [
    { args: { at: 40, height: 6, paint: 'air' }, ctx: WIDE },
    { args: { at: 30, height: 0, paint: 'air', to: 36 }, ctx: WIDE },
    { args: { at: 44, height: 12, seed: 4, paint: 'air' }, ctx: WIDE },
  ],
  'treeline@1': [
    { args: { ground: { kind: 'ridge', base: 44, height: 14, seed: 7, peaks: 3 }, clumps: 4, tall: 8, seed: 4, paint: 'leaf' }, ctx: WIDE },
    { args: { base: 40, clumps: 3, per: 2, tall: 10, seed: 2, shape: 'pointed', paint: 'leaf', lit: { dx: -2, dy: 2, paint: 'leaf.light' } }, ctx: WIDE },
    { args: { base: 46, clumps: 6, tall: 6, seed: 9, crest: 1, width: 0.8, paint: 'leaf' }, ctx: WIDE },
  ],
  'cloud@1': [
    { args: { at: [40, 20], size: 30, seed: 3, paint: 'cloud', under: 'cloud.dark' }, ctx: WIDE },
    { args: { at: [92, 16], size: 24, paint: 'cloud' }, ctx: WIDE },
    { args: { at: [2, 30], size: 20, vary: 0, seed: 1, wrap: false, paint: 'cloud' }, ctx: WIDE },
  ],
  'disc@1': [
    { args: { at: [70, 12], r: 6, paint: 'sun' }, ctx: WIDE },
    { args: { at: [94, 20], r: 5, paint: 'moon' }, ctx: WIDE },
    { args: { at: [1, 20], r: 4, wrap: false, paint: 'moon' }, ctx: WIDE },
  ],
  'stars@1': [
    { args: { count: 12, seed: 4, top: 2, bottom: 46, paint: 'star', plus: 0.3, big: 0.1 }, ctx: WIDE },
    { args: { count: 8, seed: 9, paint: 'star', dim: 'star.dark', heart: 'shine', plus: 0.45, big: 0.16, twinkle: 0.7 }, ctx: { ...WIDE, t: 0.125 } },
    { args: { count: 0, seed: 1, paint: 'star' }, ctx: WIDE },
  ],
  'nebula@1': [
    { args: { at: [48, 24], size: [60, 30], seed: 3, paint: 'gas', inner: 'gas.light', core: 'shine' }, ctx: WIDE },
    { args: { at: [90, 30], size: [40, 20], seed: 8, lobes: 8, paint: 'gas', inner: 'gas.light' }, ctx: WIDE },
    { args: { at: [20, 20], size: [24, 12], seed: 1, lobes: 3, wrap: false, paint: 'gas', inner: 'gas.light' }, ctx: WIDE },
  ],
  'canopy@1': [
    { args: { at: [40, 30], r: 12, seed: 3, paint: 'leaf', lit: 'leaf.light', dark: 'leaf.dark' }, ctx: WIDE },
    { args: { at: [94, 36], r: 14, seed: 5, paint: 'leaf', lit: 'leaf.light', dark: 'leaf.dark' }, ctx: WIDE },
    { args: { at: [20, 30], r: 6, wrap: false, paint: 'leaf', lit: 'leaf.light', dark: 'leaf.dark' }, ctx: WIDE },
  ],
  'sky.look@1': [
    { args: { of: 'sky' } },
    { args: { of: 'sky', time: 0, what: 'air' } },
    { args: { of: 'sky', time: 1, dark: 0.5, what: 'band', at: 0.7 } },
  ],
  'space.look@1': [
    { args: { of: 'sky', deep: 'void' } },
    { args: { of: 'sky', deep: 'void', at: 1 } },
    { args: { of: 'sky', deep: 'void', what: 'air' } },
  ],
  'haze@1': [
    { args: { of: 'land', air: 'sky.light' } },
    { args: { of: 'land', air: 'sky.light', depth: 1 } },
    { args: { of: 'leaf.dark', air: { rule: 'sky.look', v: 1, of: 'sky', what: 'air' }, depth: 0.4 } },
  ],
  'lit.tone@1': [
    { args: { of: 'rock', air: 'sky.light' } },
    { args: { of: 'rock', air: 'sky.light', amount: 0.55 } },
    { args: { of: 'star', air: 'void', amount: 0.3 } },
  ],
  'clear.of@1': [
    { args: { of: 'rock', behind: ['sky'] } },
    { args: { of: 'land', behind: ['void', 'sky'], way: 'lighter', step: 0.06 } },
    { args: { of: 'land.dark', behind: ['land'], floor: 0.19 } },
  ],
};

const FAMILY = {
  'scatter@1': 'place', 'sky.bands@1': 'backdrop', 'ridge@1': 'backdrop', 'swell@1': 'backdrop', 'fill.below@1': 'backdrop', 'fill.between@1': 'backdrop',
  'mist.band@1': 'backdrop', 'treeline@1': 'backdrop', 'cloud@1': 'backdrop', 'disc@1': 'backdrop', 'stars@1': 'backdrop', 'nebula@1': 'backdrop',
  'canopy@1': 'backdrop', 'sky.look@1': 'colour', 'space.look@1': 'colour', 'haze@1': 'colour', 'lit.tone@1': 'colour', 'clear.of@1': 'colour',
  'layers@1': 'layout',
};

test('B14 registers its generators in the site registry, each in its family, the placers told when the layer wraps', () => {
  const fam = Object.fromEntries(registry.generators().map((g) => [g.key, g.family]));
  for (const [key, family] of Object.entries(FAMILY)) assert.equal(fam[key], family, key);
  for (const key of ['scatter@1', 'cloud@1', 'disc@1', 'stars@1', 'nebula@1', 'canopy@1']) {
    const g = registry.generators().find((x) => x.key === key);
    assert.equal(g.wraps, true, `${key} is told the layer wraps`);
    assert.equal(g.args.wrap?.type, 'flag', `${key} takes wrap`);
  }
  // they work in frame pixels by design (they wrap across the layer's width): listed with a reason
  for (const key of Object.keys(FAMILY).filter((k) => FAMILY[k] !== 'layout')) {
    assert.ok(typeof registry.FRAME_GENERATORS[key] === 'string' && registry.FRAME_GENERATORS[key].length > 10, `${key} in FRAME_GENERATORS`);
    assert.equal(BACKDROP_FRAME_GENERATORS[key], registry.FRAME_GENERATORS[key]);
  }
});

for (const key of Object.keys(CASES)) {
  test(`${key} passes the goldens harness`, () => {
    const [id, v] = key.split('@');
    checkGeneratorContract(registry, registry.generator(id, Number(v)), { cases: CASES[key] });
  });
}

// ---- colour rules: what they work out to -----------------------------------------------------------------------

const PAL = { sky: { hex: '#7fb8e0', material: 'sky' }, void: { hex: '#141a33', material: 'sky' }, land: { hex: '#2fb3a8', material: 'stone' }, rock: { hex: '#6a7280', material: 'stone' } };
const work = (rule) => workOutColour(rule, PAL, {});

test('sky.look is engine/backdrop.js skyLook at day and dusk (and a rosier dawn), blended by the time of day, and goes toward night with dark', () => {
  const day = skyLook('#7fb8e0', 'day'), dusk = skyLook('#7fb8e0', 'dusk'), night = skyLook('#7fb8e0', 'night');
  const look = (a) => work({ rule: 'sky.look', v: 1, of: 'sky', ...a });
  assert.equal(look({ time: 0.5, at: 0 }), day.bands[0]);
  assert.equal(look({ time: 0.5, at: 1 }), day.bands[3]);
  assert.equal(look({ time: 0.5, at: 0.38 }), mix(day.bands[0], day.bands[3], 0.38));
  assert.equal(look({ time: 0.5, what: 'air' }), day.air);
  assert.equal(look({ time: 0.5, what: 'glow' }), day.glow);
  assert.equal(look({ time: 0.5, what: 'cloud' }), day.cloud);
  assert.equal(look({ time: 0.5, what: 'under' }), day.cloudShade);
  assert.equal(look({ time: 1, at: 0 }), dusk.bands[0], 'dusk');
  assert.notEqual(look({ time: 0, at: 1 }), dusk.bands[3], 'dawn is not dusk: a time-of-day slider changes the sky at both ends');
  assert.notEqual(look({ time: 0, at: 1 }), day.bands[3]);
  assert.equal(look({ time: 1, dark: 1, at: 1 }), night.bands[3]);
  // the colours come from the sky slot: change it and they change
  assert.notEqual(workOutColour({ rule: 'sky.look', v: 1, of: 'sky' }, { ...PAL, sky: { hex: '#e0a070' } }, {}), look({}));
});

test('space.look, haze, lit.tone and clear.of are the code helpers they port', () => {
  const s = OLD.value();
  assert.equal(work({ rule: 'space.look', v: 1, of: 'sky', deep: 'void', at: 0 }), s.bands[0]);
  assert.equal(work({ rule: 'space.look', v: 1, of: 'sky', deep: 'void', at: 1 }), s.bands[2]);
  assert.equal(work({ rule: 'space.look', v: 1, of: 'sky', deep: 'void', what: 'air' }), s.air);
  assert.equal(work({ rule: 'haze', v: 1, of: 'land', air: 'sky', depth: 0 }), mix('#2fb3a8', '#7fb8e0', 0.35));
  assert.equal(work({ rule: 'haze', v: 1, of: 'land', air: 'sky', depth: 1 }), mix('#2fb3a8', '#7fb8e0', 0.86));
  assert.equal(work({ rule: 'lit.tone', v: 1, of: 'rock', air: 'sky', amount: 0.4 }), mix('#6a7280', '#7fb8e0', 0.4));
  const out = work({ rule: 'clear.of', v: 1, of: 'rock', behind: ['sky'] });
  assert.match(out, /^#[0-9a-f]{6}$/);
  // nested: a colour rule of engine/data-rules.js round a backdrop rule, and the other way round
  assert.equal(work({ rule: 'tone', of: { rule: 'haze', v: 1, of: 'land', air: 'sky', depth: 0 }, by: 0 }), mix('#2fb3a8', '#7fb8e0', 0.35));
  assert.equal(work({ rule: 'haze', v: 1, of: { rule: 'mix', of: 'land', with: 'rock', amount: 0 }, air: 'sky', depth: 0 }), mix('#2fb3a8', '#7fb8e0', 0.35));
  assert.equal(work({ rule: 'haze', v: 1, of: 'nothere', air: 'sky' }), null, 'a slot the palette has not: nothing');
  assert.deepEqual(Object.keys(COLOUR_WORK).sort(), ['clear.of@1', 'haze@1', 'lit.tone@1', 'sky.look@1', 'space.look@1']);
});

// ---- ports: pixel for pixel ----------------------------------------------------------------------------------------

const PALETTE = { rock: '#6a7280', lit: '#a0a8b8', air: '#c8d8e8', land: '#2fb3a8' };
const draw = (gen, args, size = [320, 180]) => {
  const r = registry.runGenerator({ gen, v: 1, ...args }, { size });
  assert.ok(r.ok, r.errors.join('; '));
  return renderList(size[0], size[1], r.primitives, { palette: PALETTE }).g;
};
const same = (a, b) => a.w === b.w && a.h === b.h && a.data.every((v, i) => v === b.data[i]);

test('ridge@1 fills exactly what backdrop.js ridge + fillBelow + litEdge + fillBetween fill', () => {
  for (const a of [{ base: 156, height: 64, seed: 3, peaks: 4, shape: 'jagged', rough: 0.55 }, { base: 150, height: 30, seed: 7, peaks: 3, shape: 'round', rough: 0.15 }]) {
    const old = new Surface(320, 180);
    const o = ridge(a);
    fillBelow(old, o, '#6a7280');
    fillBetween(old, o, litEdge(o, { depth: 0.75 }), '#a0a8b8');
    assert.ok(same(draw('ridge', { ...a, paint: 'rock', litEdge: { depth: 0.75, paint: 'lit' } }), old), JSON.stringify(a));
  }
});

test('swell@1 and fill.below@1 fill exactly what space.js arch with fillBelow and fillBetween fill', () => {
  const old = OLD.surface(320, 180);
  const r1 = registry.runGenerator({ gen: 'swell', v: 1, base: 156, height: 13, at: 160, paint: 'land', rim: { depth: 5, grow: 4, at: 232, paint: 'lit' } }, { size: [320, 180] });
  const r2 = registry.runGenerator({ gen: 'fill.below', v: 1, ground: { kind: 'swell', base: 156, height: 13, at: 160 }, dx: -40, dy: 23, paint: 'rock' }, { size: [320, 180] });
  assert.ok(r1.ok && r2.ok, [...r1.errors, ...r2.errors].join('; '));
  assert.ok(same(renderList(320, 180, [...r1.primitives, ...r2.primitives], { palette: PALETTE }).g, old));
});

test('columns become stair polygons of at most 64 points, never more than 46 for the widest frame, and paint each column exactly', () => {
  const W = 640, H = 360;
  const y0 = new Int32Array(W), y1 = new Int32Array(W);
  for (let x = 0; x < W; x++) { y0[x] = (x * 7919) % 300; y1[x] = x % 3 === 0 ? y0[x] : y0[x] + 1 + ((x * 104729) % 50); }
  const polys = columnPolys(y0, y1, 'rock');
  assert.ok(polys.length <= 46, `${polys.length} polygons`);
  assert.ok(polys.every((p) => p.kind === 'poly' && p.points.length <= 64 && p.points.length >= 3 && p.shade === 0));
  const g = renderList(W, H, polys, { palette: PALETTE }).g;
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) assert.equal(!!(g.get(x, y) >>> 24), y >= y0[x] && y < y1[x], `column ${x} row ${y}`);
});

test('scatter@1 puts things where backdrop.js scatter does, across the layer', () => {
  const r = registry.runGenerator({ gen: 'scatter', v: 1, count: 6, seed: 12, stable: true, rows: [14, 59], place: { kind: 'dot', paint: 'rock' } }, { size: [320, 180] });
  assert.ok(r.ok, r.errors.join('; '));
  const xs = r.primitives.map((p) => p.at[0]).filter((x) => x >= 0 && x < 320).sort((a, b) => a - b);      // copies across the join left out
  assert.deepEqual(xs, oldScatter(6, 12, { stable: true }).map((c) => c.x).sort((a, b) => a - b));
});
