// Shine generators (docs/data-sprites.md 3.3, family "shine"): the glints and gleams that make a pickup or an icon
// catch the eye, each a port returning primitives. Started by build item B8 with gleam@1 (the coin's sparkle) and
// glint@1 (the band sliding across a coin, a gem or a blade); icon.glint@1 is in the icon family (engine/gen/icon.js).
import { defineGenerator } from './registry.js';
import { point, count, share, px, paint, primitives } from './args.js';
import { Pixels, tilesFor, workCost, shapeTest } from './pixels.js';
import { fract } from '../motion.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * gleam@1: a twinkle that flares up once a loop and is gone the rest of it, the sparkle on a corner of something shiny:
 * at its biggest (`big`: 1 a plus, 2 a big plus) within 0.07 of the clip phase `peak`, one size smaller within 0.19,
 * nothing otherwise. Port of engine/pickups.js gleam; the twinkle is twinkle@1 (its arms `paint`, its centre `core`).
 * Draw it after the outline: it is light.
 */
export const gleam = defineGenerator({
  id: 'gleam', v: 1, family: 'shine',
  about: 'A twinkle that flares up once a loop at a point and is gone the rest of it.',
  args: {
    at: point({ about: 'Where it flares' }),
    paint: paint({ about: 'Its arms' }),
    core: paint({ about: 'Its centre: a light slot such as "shine"' }),
    peak: share({ default: 0, about: 'The clip phase it is biggest at' }),
    big: count(1, 2, { default: 2, about: 'Its biggest size: 1 a plus, 2 a big plus' }),
  },
  cost: () => 1,
  run(a, ctx, { call }) {
    const d = Math.abs(fract(ctx.t - a.peak + 0.5) - 0.5);
    const size = d < 0.07 ? a.big : d < 0.19 ? a.big - 1 : -1;
    if (size < 0) return [];
    return call({ gen: 'twinkle', v: 1, at: [...a.at], size, paint: a.paint, core: a.core }, ctx);
  },
});

/**
 * glint@1: a slanted bright band that slides across a shape, the glint on a coin, a gem or a blade: the pixels of the
 * box at ± (r + 2) round `at` where |(x - at) / r + slant (y - at) / r - phase| < width, kept inside the plain shapes of
 * `within` (ellipse, poly, capsule, limb, rect, in frame pixels; none: the whole box). `phase` runs from -1.6 (off one
 * side) through 0 (across the middle) to 1.6 (off the other); keys and motions may set it. Port of engine/pickups.js
 * glint, as stamps; draw it before the outline.
 */
export const glint = defineGenerator({
  id: 'glint', v: 1, family: 'shine',
  about: 'A slanted bright band that slides across a shape: the glint on a coin, a gem or a blade.',
  args: {
    at: point({ about: 'The middle of the shape' }),
    r: px(1, 32, { about: 'Half the shape\'s size, in pixels' }),
    phase: px(-2, 2, { default: 0, about: 'Where the band is: -1.6 off one side, 0 across the middle, 1.6 off the other' }),
    slant: px(-2, 2, { default: 0.5, about: 'How much it leans (0: upright)' }),
    width: px(0.01, 1, { default: 0.15, about: 'Half its width, as a share of r' }),
    within: primitives({ default: [], about: 'The shapes it is kept inside, in frame pixels (none: its whole box)' }),
    paint: paint({ about: 'Its colour: a light tone or a light slot' }),
  },
  keyable: ['phase'],
  // its stamps, and a band test and the `within` shapes' tests at each pixel of its box
  cost: (a) => {
    const side = 2 * a.r + 6;
    let tests = 3;
    for (const p of Array.isArray(a.within) ? a.within : []) tests += isObj(p) && p.kind === 'poly' && Array.isArray(p.points) ? p.points.length : 1;
    return Math.max(tilesFor(side, side), workCost(side * side * tests));
  },
  run(a, ctx) {
    const [x, y] = a.at, r = a.r, [W, H] = ctx.size;
    const tests = a.within.map(shapeTest).filter(Boolean);
    const test = tests.length ? (px, py) => tests.some((f) => f(px, py)) : () => true;
    const band = (px, py) => Math.abs((px - x) / r + (a.slant * (py - y)) / r - a.phase) < a.width && test(px, py);
    const x0 = Math.max(0, Math.floor(x - r - 2)), y0 = Math.max(0, Math.floor(y - r - 2));
    const g = new Pixels(x0, y0, Math.min(W, Math.ceil(x + r + 2) + 1) - x0, Math.min(H, Math.ceil(y + r + 2) + 1) - y0);
    if (!g.w || !g.h) return [];
    g.fill(x - r - 2, y - r - 2, x + r + 2, y + r + 2, band, a.paint);
    return g.stamps();
  },
});

/** The `within` items of a glint@2 as pixel tests: plain shapes as shape tests, generator calls as the pixels their output paints (stamps, dots, and plain shapes they return). */
function withinTests(list, ctx, call) {
  const tests = [];
  for (const p of list) {
    if (!isObj(p)) continue;
    if (!Object.hasOwn(p, 'gen')) { const t = shapeTest(p); if (t) tests.push(t); continue; }
    const painted = new Set(), shapes = [];
    const { on, ...own } = p;
    for (const q of call(own, ctx)) {
      if (q.kind === 'dot') { const s = q.size ?? 1; for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) painted.add(`${Math.floor(q.at[0]) + i},${Math.floor(q.at[1]) + j}`); continue; }
      if (q.kind === 'stamp') {
        const w = Math.max(0, ...q.rows.map((r) => r.length)), h = q.rows.length, an = q.anchor ?? 'tl';
        const ox = an.endsWith('r') ? -w : an.endsWith('c') || an === 'c' ? -Math.floor(w / 2) : 0;
        const oy = an.startsWith('b') ? -h : an.startsWith('c') ? -Math.floor(h / 2) : 0;
        const x0 = Math.round(q.at[0]) + ox, y0 = Math.round(q.at[1]) + oy;
        q.rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] !== '.' && row[i] !== ' ') painted.add(`${q.mirror === 'x' ? x0 + w - 1 - i : x0 + i},${y0 + j}`); });
        continue;
      }
      const t = shapeTest(q);
      if (t) shapes.push(t);
    }
    tests.push((px0, py0) => painted.has(`${Math.floor(px0)},${Math.floor(py0)}`) || shapes.some((f) => f(px0, py0)));
  }
  return tests;
}

/**
 * glint@2: glint@1's band (the same arguments, the same pixels inside the frame), also where it lies left of or above
 * the frame's corner (a glint on a node centred at its origin), and `within` may also hold generator calls: the band is
 * then kept to the pixels the call paints, so a glint runs across a generated stone (`within: [the gem.cut@2 call]`,
 * written again with the same arguments, in the glint's own coordinates). Draw it after the stone and before the outline.
 */
export const glint2 = defineGenerator({
  id: 'glint', v: 2, family: 'shine',
  about: 'A slanted bright band that slides across a shape, kept inside plain shapes or a generated one such as a gem.cut@2 stone; draws centred on a node.',
  args: {
    ...glint.args,
    within: primitives({ default: [], about: 'The shapes it is kept inside, in the call\'s own coordinates: plain shapes or generator calls (a gem.cut@2 call written again); none: its whole box' }),
  },
  keyable: ['phase'],
  // its stamps, a band test and the `within` tests at each pixel of its box, and the generator calls in `within`
  cost: (a, { costOf }) => {
    const side = 2 * a.r + 6;
    let tests = 3, calls = 0;
    for (const p of Array.isArray(a.within) ? a.within : []) {
      if (isObj(p) && Object.hasOwn(p, 'gen')) { tests += 2; calls += costOf(p); } else tests += isObj(p) && p.kind === 'poly' && Array.isArray(p.points) ? p.points.length : 1;
    }
    return Math.max(tilesFor(side, side), workCost(side * side * tests)) + calls;
  },
  run(a, ctx, { call }) {
    const [x, y] = a.at, r = a.r;
    const tests = withinTests(a.within, ctx, call);
    const test = tests.length ? (px0, py0) => tests.some((f) => f(px0, py0)) : () => true;
    const band = (px0, py0) => Math.abs((px0 - x) / r + (a.slant * (py0 - y)) / r - a.phase) < a.width && test(px0, py0);
    const x0 = Math.floor(x - r - 2), y0 = Math.floor(y - r - 2);
    const g = new Pixels(x0, y0, Math.ceil(x + r + 2) + 1 - x0, Math.ceil(y + r + 2) + 1 - y0);
    g.fill(x - r - 2, y - r - 2, x + r + 2, y + r + 2, band, a.paint);
    return g.stamps();
  },
});
