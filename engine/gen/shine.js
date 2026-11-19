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
