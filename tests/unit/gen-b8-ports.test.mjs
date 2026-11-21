// The B8 generators are ports: painted by engine/draw-list.js, what each returns gives the pixels the code it replaces
// drew (docs/data-sprites.md 3.3: "each is a port of one existing function that returns primitives instead of drawing").
//   token@1         sprites/coin.js drawCoin (every frame of the spin clip, every shape, emblem, rim, size, thickness)
//   container@1     sprites/crate.js container(), and the lean and split of its hurt and break clips
//   chunks@1        engine/fx.js chunks           (the crate's boards, staves, sherds and splinters)
//   pickup.burst@1  engine/pickups.js collectBurst
//   gleam@1         engine/pickups.js gleam
//   icon.paint@1, icon.line@1   engine/icons.js iconPaint, iconLine (through the same pen)
//   leaf@1          engine/creature.js leafIn, as a polygon (within a pixel or two)
//   taper@1         engine/surface.js capsule (a stroke tapering from r0 to r1), painted by engine/draw-list.js
//   star@1          engine/shapes.js starPoints (the same corner points)
//   gem.cut@1       engine/pickups.js drawGem (every cut, faceted and polished, small and big)
//   glint@1         engine/pickups.js glint (the slanted band sliding across a shape)
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface, rectIn, ellipseIn, capsuleIn, polyIn } from '../../engine/surface.js';
import { ramp, tone, mix, hexToRgb, INK } from '../../engine/color.js';
import { lerp, fract, PI } from '../../engine/motion.js';
import { chunks as fxChunks } from '../../engine/fx.js';
import { collectBurst, gleam as pickupGleam, drawGem, glint as pickupGlint } from '../../engine/pickups.js';
import { starPoints, GEM_CUTS } from '../../engine/shapes.js';
import { leafIn } from '../../engine/creature.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import { paintColour } from '../../engine/data-rules.js';
import { drawList } from '../../engine/draw-list.js';
import { runGenerator } from '../../engine/gen/index.js';
import coinSprite from '../fixtures/code-sprites/coin.js';     // the code files as they were before P1 redrew them as data
import crateSprite from '../fixtures/code-sprites/crate.js';

import { oldReplay } from '../helpers/old-replay.mjs';
const OLD = oldReplay('gen-b8-ports');   // what engine/icons.js (deleted by R3) drew and answered, recorded in the order of the calls (tests/helpers/old-replay.mjs)
const DEG = 180 / PI;
const run = (node, ctx = {}) => {
  const r = runGenerator(node, ctx);
  assert.ok(r.ok, `${node.gen}: ${r.errors.join('; ')}`);
  return r.primitives;
};
/** Colour rules left in paints worked out to '#rrggbb' at these slot colours (what engine/resolve.js expandFrame does). */
function hexed(prims, palette) {
  const fix = (v) => (v && typeof v === 'object' && v.rule ? paintColour(v, palette) : v);
  return prims.map((p) => ({ ...p, ...(p.key ? { key: Object.fromEntries(Object.entries(p.key).map(([k, v]) => [k, fix(v)])) } : {}), ...(p.paint !== undefined ? { paint: fix(p.paint) } : {}) }));
}
function draw(w, h, prims, palette, { outline = false, tint = false } = {}) {
  const g = new Surface(w, h);
  const list = [...hexed(prims, palette), ...(tint ? [{ kind: 'tint', paint: '#ffffff' }] : []), ...(outline ? [{ kind: 'outline', paint: 'ink' }] : [])];
  drawList(g, list, { palette });
  return g;
}
function differ(a, b) {
  const out = [];
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) out.push([i % a.w, Math.floor(i / a.w)]);
  return out;
}
const same = (a, b, label) => assert.deepEqual(differ(a, b).slice(0, 6), [], `${label}: pixels differ`);
const lum = (hex) => { const [r, g, b] = hexToRgb(hex); return (0.3 * r + 0.59 * g + 0.11 * b) / 255; };

test('token@1 paints sprites/coin.js\'s spinning coin, frame for frame, at every shape, emblem, rim, size and thickness', () => {
  const base = { ...defaultParams(coinSprite), sparkle: false, bob: 0 };
  let compared = 0;
  for (const size of [0, 0.3, 0.5, 0.8, 1]) for (const thickness of [0, 0.4, 1]) for (const shape of ['round', 'octagon', 'square']) {
    for (const emblem of ['star', 'heart', 'plain', 'hole', 'gem']) for (const rim of [true, false]) {
      const p = { ...base, size, thickness, shape, emblem, rim, metal: size > 0.5 ? '#c9ced9' : '#f2c230', inlay: emblem === 'gem' ? '#3f86e0' : '#c76a16' };
      const m = ramp(p.metal), field = rim ? tone(p.metal, -0.25) : p.metal;
      let inlay = p.inlay;
      const gap = lum(inlay) - lum(field);
      if (Math.abs(gap) < 0.2) inlay = tone(inlay, gap > 0 ? 1.2 : -1.2);
      const palette = { metal: p.metal, field, gleam: mix(m.light, '#ffffff', 0.6), emblem: inlay, shine: '#ffffff' };
      const n = Math.round(lerp(10, 19, size)), T = Math.round(lerp(2, 5, thickness));
      for (const f of (size === 0.5 && thickness === 0.4 ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 2, 3])) {
        const t = f / 8;
        const want = renderFrame(coinSprite, 'spin', f, p);
        const prims = run({ gen: 'token', v: 1, at: [16, 16.5], size: n, thick: T, shape, emblem, rim, spin: t * 180, sheen: lerp(-1.6, 1.6, fract(t + 0.5)), metal: 'metal', field: 'field', gleam: 'gleam', inlay: 'emblem', shine: 'shine' });
        same(draw(32, 32, prims, palette, { outline: true }), want, `size ${size} thick ${thickness} ${shape} ${emblem} rim ${rim} frame ${f}`);
        compared++;
      }
    }
  }
  assert.ok(compared > 400);
});

test('container@1 paints sprites/crate.js\'s crate, barrel and pot: idle, every hurt lean, the swollen flash and the split', () => {
  const leans = [0.15, -0.1, 0.05, 0];
  for (const style of ['crate', 'barrel', 'pot']) for (const size of [0, 0.25, 0.5, 0.75, 1]) for (const bands of [true, false]) for (const mark of ['none', 'leaf', 'skull', 'star']) {
    const p = { ...defaultParams(crateSprite), style, size, bands, mark, wood: size > 0.5 ? '#7a4f33' : '#a06a3c', metal: '#c2c9d6' };
    const S = Math.round(lerp(15, 23, size));
    const on = style === 'crate' ? ramp(p.wood).dark : p.wood;
    const stamp = [p.wood, '#f0ead8', tone(p.wood, -2.2)];
    // engine/color.js pick: whichever of the two stands out more against what the stamp sits on
    const markHex = paintColour({ rule: 'standOut', against: 'on', from: ['cream', 'deep'] }, { on, cream: stamp[1], deep: stamp[2] });
    const palette = { wood: p.wood, metal: p.metal, stamp: markHex };
    const args = { gen: 'container', v: 1, at: [16, 30], style, size: S, bands, mark, wood: 'wood', metal: 'metal', markPaint: 'stamp' };
    const label = `${style} size ${size} bands ${bands} mark ${mark}`;
    same(draw(32, 32, run(args), palette, { outline: true }), renderFrame(crateSprite, 'idle', 0, p), `${label} idle`);
    leans.forEach((lean, f) => same(draw(32, 32, run({ ...args, lean: lean * DEG }), palette, { outline: true, tint: f === 0 }), renderFrame(crateSprite, 'hurt', f, p), `${label} hurt ${f}`));
    same(draw(32, 32, run({ ...args, grow: 1 }), palette, { outline: true, tint: true }), renderFrame(crateSprite, 'break', 0, p), `${label} break 0`);
    same(draw(32, 32, run({ ...args, split: true }), palette, { outline: true }), renderFrame(crateSprite, 'break', 1, p), `${label} break 1`);
  }
});

test('chunks@1 paints engine/fx.js chunks: thrown, spinning, landed, held, inked or not', () => {
  const sets = [
    { x: 16, y: 20.5, count: 6, seed: 2, dist: 10.5, rise: 10, size: 8.74, thick: 3, spread: 7.98, spin: 0.5, floor: 29, land: 0.95, shrink: 0.3, colour: '#a06a3c', box: [2, 2, 30, 30] },
    { x: 16, y: 21, count: 7, seed: 11, dist: 13.5, rise: 11.5, size: 2.6, thick: 1, spread: 5.7, spin: 1.5, floor: 29, land: 0.88, shrink: 0.1, colour: '#d39a68', box: [1, 1, 31, 30] },
    { x: 12.2, y: 23, count: 3, seed: 5, dist: 8.5, rise: 8, size: 6.25, thick: 2, spread: 2, spin: 0.8, floor: 29, land: 0.95, shrink: 0.25, colour: '#7a4f33', box: [2, 2, 30, 30] },
  ];
  for (const o of sets) for (const t of [0, 0.04, 0.2, 0.43, 0.62, 0.81, 0.95, 1]) {
    const want = new Surface(32, 32);
    fxChunks(want, { ...o, t });
    const prims = run({ gen: 'chunks', v: 1, at: [o.x, o.y], amount: t, count: o.count, seed: o.seed, dist: o.dist, rise: o.rise, size: o.size, thick: o.thick, spread: o.spread, spin: o.spin, floor: o.floor, land: o.land, shrink: o.shrink, paint: 'c', area: { x0: o.box[0], y0: o.box[1], x1: o.box[2], y1: o.box[3] } }, { size: [32, 32] });
    same(draw(32, 32, prims, { c: o.colour }), want, `chunks seed ${o.seed} at t ${t}`);
  }
  // inked: the pieces outlined by themselves, with the outline the generator adds
  const want = new Surface(32, 32);
  const o = sets[0];
  fxChunks(want, { ...o, t: 0.6 });
  want.outline(INK);
  const prims = run({ gen: 'chunks', v: 1, at: [o.x, o.y], amount: 0.6, count: o.count, seed: o.seed, dist: o.dist, rise: o.rise, size: o.size, thick: o.thick, spread: o.spread, spin: o.spin, floor: o.floor, land: o.land, shrink: o.shrink, paint: 'c', area: { x0: 2, y0: 2, x1: 30, y1: 30 }, ink: true }, { size: [32, 32] });
  assert.equal(prims.at(-1).kind, 'outline');
  same(draw(32, 32, prims, { c: o.colour }), want, 'inked chunks');
});

test('pickup.burst@1 paints engine/pickups.js collectBurst; gleam@1 paints engine/pickups.js gleam', () => {
  const C = ramp('#f2c230'), light = mix(C.light, '#ffffff', 0.35);
  for (const [x, y, r] of [[16, 11, 7.6], [16.5, 9, 5.1], [16, 16, 9.6]]) for (const burst of [0.05, 0.2, 0.36, 0.5, 0.68, 0.8, 1]) for (const sparkle of [true, false]) {
    const want = new Surface(32, 32);
    collectBurst(want, { burst, x, y, r, colour: C.base, sparkle });
    const prims = run({ gen: 'pickup.burst', v: 1, at: [x, y], amount: burst, reach: r + 3, sparkle, paint: 'gold', bright: 'glow', core: 'shine' }, { size: [32, 32] });
    same(draw(32, 32, prims, { gold: C.base, glow: light, shine: '#ffffff' }), want, `burst ${burst} at ${x},${y} sparkle ${sparkle}`);
  }
  for (const t of [0, 0.05, 0.125, 0.2, 0.25, 0.5, 0.875, 0.97]) for (const [peak, big] of [[0, 2], [0.5, 1], [0.25, 2]]) {
    const want = new Surface(32, 32);
    pickupGleam(want, 22.4, 10.6, t, '#fff4c0', { at: peak, big });
    const prims = run({ gen: 'gleam', v: 1, at: [22.4, 10.6], paint: 'light', core: 'shine', peak, big }, { t, loop: true });
    same(draw(32, 32, prims, { light: '#fff4c0', shine: '#ffffff' }), want, `gleam t ${t} peak ${peak}`);
  }
});

const ICON_LEAN = Math.atan(0.5);   // the lean of an icon, as engine/icons.js had it (deleted by R3)

test('icon.paint@1 and icon.line@1 paint what engine/icons.js iconPaint and iconLine paint through the same pen', () => {
  const hex = { body: '#c9423a', cap: '#7a4f33', leaf: '#3f8a4f' };
  const cases = [
    { tests: [ellipseIn(1.5, 0, 9.6, 5.4)], shapes: [{ kind: 'ellipse', at: [1.5, 0], r: [9.6, 5.4] }], opt: { soft: 1 }, args: { soft: 1 } },
    { tests: [ellipseIn(0, -1.2, 11.5, 9.4)], shapes: [{ kind: 'ellipse', at: [0, -1.2], r: [11.5, 9.4] }], opt: { soft: 2, minus: rectIn(-12, -1.2, 24, 11.2) }, args: { soft: 2, minus: [{ kind: 'rect', at: [-12, -1.2], size: [24, 11.2] }] } },
    { tests: [polyIn([[-4.6, -4.4], [4.6, -4.4], [0.7, 11.5], [-0.7, 11.5]]), ellipseIn(0, -4.4, 4.6, 1.6)], shapes: [{ kind: 'poly', points: [[-4.6, -4.4], [4.6, -4.4], [0.7, 11.5], [-0.7, 11.5]] }, { kind: 'ellipse', at: [0, -4.4], r: [4.6, 1.6] }], opt: { soft: 1 }, args: { soft: 1 } },
    { tests: [capsuleIn(0, -4.6, -4.6, -12, 1.6, 0.8), capsuleIn(0, -4.6, 5, -11.4, 1.6, 0.8)], shapes: [{ kind: 'capsule', from: [0, -4.6], to: [-4.6, -12], r: [1.6, 0.8] }, { kind: 'capsule', from: [0, -4.6], to: [5, -11.4], r: [1.6, 0.8] }], opt: { soft: 0 }, args: { soft: 0 }, paint: 'leaf' },
    { tests: [ellipseIn(1.5, 0, 9.6, 5.4)], shapes: [{ kind: 'ellipse', at: [1.5, 0], r: [9.6, 5.4] }], opt: { soft: 0, light: 0, clip: rectIn(-6, 1.4, 20, 10) }, args: { soft: 0, lit: 0, within: [{ kind: 'rect', at: [-6, 1.4], size: [20, 10] }] } },
    { tests: [ellipseIn(0, -1, 11.5, 3.6)], shapes: [{ kind: 'ellipse', at: [0, -1], r: [11.5, 3.6] }], opt: { flat: true }, args: { flat: true }, paint: 'cap' },
  ];
  for (const [i, c] of cases.entries()) for (const [angle, scale, shade, shine] of [[ICON_LEAN, 1, true, true], [-ICON_LEAN / 2, 0.83, false, true], [0, 1.17, true, false]]) {
    const paint = c.paint ?? 'body';
    const want = OLD.surface(32, 32);
    const prims = run({ gen: 'icon.paint', v: 1, shapes: c.shapes, paint, ...c.args, scale, turn: angle * DEG, soften: shade, shiny: shine }, { size: [32, 32] });
    same(draw(32, 32, prims, hex), want, `icon.paint case ${i} angle ${angle.toFixed(2)} scale ${scale}`);
  }
  for (const pts of [[[4.4, -3.6], [3.6, 0], [4.4, 3.4]], [[-3.2, -0.6], [-0.2, 0]], [[-7, -0.4], [-4.9, 1]]]) {
    const want = OLD.surface(32, 32);
    const prims = run({ gen: 'icon.line', v: 1, path: pts.flat(), paint: 'crease', scale: 1.05, turn: ICON_LEAN * DEG }, { size: [32, 32] });
    same(draw(32, 32, prims, { crease: '#5a2a2a' }), want, `icon.line ${JSON.stringify(pts)}`);
  }
});

test('leaf@1 is engine/creature.js leafIn as a polygon: within two pixels of it, filled', () => {
  for (const [x0, y0, x1, y1, w, belly, blunt] of [[8, 20, 22, 12, 6, 0.45, 0.25], [16, 28, 16, 6, 5, 0.4, 0.3], [6, 8, 26, 22, 9, 0.6, 0.1]]) {
    const want = new Surface(32, 32);
    want.fill(0, 0, 32, 32, leafIn(x0, y0, x1, y1, w, { belly, blunt }), '#3f8a4f');
    const got = draw(32, 32, run({ gen: 'leaf', v: 1, from: [x0, y0], to: [x1, y1], width: w, belly, blunt, paint: 'leaf' }).map((p) => ({ ...p, shade: 0 })), { leaf: { hex: '#3f8a4f', detail: true } });
    assert.ok(differ(got, want).length <= 2, `leaf ${x0},${y0} -> ${x1},${y1}: ${differ(got, want).length} pixels differ`);
  }
});

test('taper@1 is engine/surface.js capsule: the same pixels, shaded the same', () => {
  for (const [x0, y0, x1, y1, r0, r1] of [[6, 20, 24, 8, 1.6, 0.8], [16, 6, 16, 26, 3, 1], [8.5, 9.2, 23.7, 21.1, 2.2, 2.2]]) {
    const want = new Surface(32, 32);
    want.capsule(x0, y0, x1, y1, r0, r1, ramp('#3f8a4f'));
    const got = draw(32, 32, run({ gen: 'taper', v: 1, from: [x0, y0], to: [x1, y1], r0, r1, paint: 'leaf' }), { leaf: '#3f8a4f' });
    same(got, want, `taper ${x0},${y0} -> ${x1},${y1}`);
  }
});

test('star@1 is engine/shapes.js starPoints: the same corner points, as one polygon', () => {
  for (const [at, r, points, inner, angle] of [[[16, 16], 7, 5, -1, 0], [[10.5, 12], 4.5, 4, 0.5, 30], [[20, 9], 11, 8, -1, -12.5], [[3, 3], 2, 3, 0.2, 90]]) {
    const [p] = run({ gen: 'star', v: 1, at, r, points, inner, angle, paint: 'gold' });
    assert.equal(p.kind, 'poly');
    assert.equal(p.paint, 'gold');
    assert.deepEqual(p.points, starPoints(at[0], at[1], r, points, { ...(inner >= 0 ? { inner } : {}), angle: (angle * PI) / 180 }), `${points} points`);
  }
});

test('gem.cut@1 paints engine/pickups.js drawGem: every cut, faceted and polished, small and big', () => {
  const hex = { stone: '#3f86e0', shine: '#ffffff' };
  for (const cut of GEM_CUTS) for (const facets of [true, false]) for (const [cx, cy, rx, ry] of [[16, 16, 7, 8], [15.5, 16, 4, 5], [16, 15, 10, 12]]) {
    const want = new Surface(32, 32);
    drawGem(want, cx, cy, rx, ry, hex.stone, { cut, facets });
    const prims = run({ gen: 'gem.cut', v: 1, at: [cx, cy], r: [rx, ry], cut, facets, paint: 'stone', shine: 'shine' }, { size: [32, 32] });
    same(draw(32, 32, prims, hex), want, `${cut} ${facets ? 'faceted' : 'polished'} ${rx}x${ry}`);
  }
});

test('glint@1 paints engine/pickups.js glint: the band slides across the shape it is kept inside', () => {
  for (const phase of [-1.6, -0.8, 0, 0.4, 1.2, 1.6]) for (const [slant, width] of [[0.5, 0.15], [0, 0.3], [1, 0.1]]) {
    const want = new Surface(32, 32);
    pickupGlint(want, ellipseIn(16, 16, 9, 7), { x: 16, y: 16, r: 9, phase, slant, width, colour: '#fff4c0' });
    const prims = run({ gen: 'glint', v: 1, at: [16, 16], r: 9, phase, slant, width, within: [{ kind: 'ellipse', at: [16, 16], r: [9, 7] }], paint: 'light' }, { size: [32, 32] });
    same(draw(32, 32, prims, { light: '#fff4c0' }), want, `phase ${phase} slant ${slant}`);
  }
  // with nothing to keep it inside, the band crosses its whole box
  const open = run({ gen: 'glint', v: 1, at: [16, 16], r: 6, phase: 0, paint: 'light' }, { size: [32, 32] });
  assert.ok(open.length >= 1);
});
