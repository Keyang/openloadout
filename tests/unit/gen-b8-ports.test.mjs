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
import { glint as pickupGlint } from '../../engine/pickups.js';
import { starPoints, GEM_CUTS } from '../../engine/shapes.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import { paintColour } from '../../engine/data-rules.js';
import { drawList } from '../../engine/draw-list.js';
import { runGenerator } from '../../engine/gen/index.js';
     // the code files as they were before P1 redrew them as data

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

const ICON_LEAN = Math.atan(0.5);   // the lean of an icon, as engine/icons.js had it (deleted by R3)

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
