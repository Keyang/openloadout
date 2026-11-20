// Landing effects of a thing dropped straight down (family "fx"): the light it leaves above it and the dust where it
// lands. The look of the Gridline kit's drop streaks (bundles/specs/kit-puzzle-gridline.md, `drop-streak`: what the
// specification's lightColumn of "engine/fx-columns.js" and chips of "engine/fx.js" drew; those helpers were never
// carried over, so these are written from the specification and the reviewed renders).
//   light.columns@1  upright lines of light standing on a row, hottest at the foot, that shorten from the top and thin
//   drop.motes@1     square motes on a row, half to each side, that slide apart, lift and cool
// Both read the clip phase ctx.t (fract(t) in a looping clip, so a loop closes) and return whole-pixel rects only, never
// cut to the frame: they draw the same on a node at its origin as in frame pixels, as an emitter or in a draw list.
// `paints` is hottest first (engine/gen/fx-burst.js COLOURS: white, core, middle, edge, rim).
// Pure: no randomness but `seed` through engine/motion.js hash, no clock, no DOM; runs the same in the browser and Node.
//
//   { "gen": "light.columns", "v": 1, "at": [32, 62], "count": 3, "span": 38, "height": 48, "style": "lines", "paints": ["shine", "core", "mid", "edge", "rim"] }
//   { "gen": "drop.motes", "v": 1, "at": [32, 62], "count": 3, "reach": 8, "paints": ["shine", "core", "mid", "edge", "rim"] }
import { defineGenerator } from './registry.js';
import { point, px, count, seed, word, paints } from './args.js';
import { hash, fract, clamp, lerp, keys, easeOut } from '../motion.js';

/** The ways light.columns@1 cuts a streak: lines (unbroken), dashes (3 px lit, 2 dark), blocks (squares as wide as the streak, 2 px apart). */
export const COLUMN_STYLES = Object.freeze(['lines', 'dashes', 'blocks']);

const phase = (ctx) => (ctx.loop ? fract(ctx.t) : clamp(ctx.t));
// how much of its height a streak still has at phase k: it shortens from the top, fast then slow
const LEFT = [[0, 1], [0.2, 0.8], [0.4, 0.58], [0.6, 0.36], [0.8, 0.16], [1, 0]];
const THIN = [[0, 0], [0.3, 0], [0.7, 1], [1, 1]];
// light is flat: no shadow band, no highlight band
const FLAT = Object.freeze({ shade: 0, light: 0 });

/** Which of m paints a row at share u of a streak's full height takes (0 the hottest), `cool` steps cooler. */
function bandOf(u, m, cool) {
  let b = 0;
  for (let j = 0; j < m - 1; j++) if (u >= ((j + 1) / m) ** 1.25) b++;
  return Math.min(m - 1, b + cool);
}

/**
 * light.columns@1: `count` upright lines of light standing on the row `at`[1], shared out over `span` pixels about
 * `at`[0] (2 to `thick` px wide: thinner when they would touch), the middle one `height` tall and the others a little
 * shorter (by `seed`). Each is lit in bands from the hottest paint at its foot to the last at its top, with a hotter
 * line up its middle. Over the clip (ctx.t) each shortens from the top, thins to 2 px and cools, the outer ones a
 * moment ahead; at the end a 2 x 2 tip is left at the foot of each. `style`: lines, dashes or blocks (COLUMN_STYLES);
 * a dash or block is one colour and is never cut. Written from the Gridline specification (see the header).
 */
export const lightColumns = defineGenerator({
  id: 'light.columns', v: 1, family: 'fx',
  about: 'Upright lines of light standing on a row, hottest at the foot, that shorten from the top, thin and leave a tip: the streaks above a dropped piece.',
  args: {
    at: point({ about: 'The middle of the row they stand on: their lowest lit pixels are on this row' }),
    count: count(1, 8, { default: 3, about: 'How many lines' }),
    span: px(4, 128, { default: 38, about: 'How wide they all stand, edge to edge, in pixels' }),
    height: px(4, 128, { default: 48, about: 'How tall the middle one starts, in pixels' }),
    thick: count(2, 6, { default: 4, about: 'The most pixels across one line starts' }),
    style: word(COLUMN_STYLES, { default: 'lines', about: 'Unbroken lines, 3 px dashes or a column of squares' }),
    seed: seed({ default: 0, about: 'Which of the outer lines are shorter, and by how much' }),
    paints: paints(8, { about: 'Foot to top, hottest first; the last is the rim at the top' }),
  },
  keyable: [],
  cost: (a) => a.count * (2 * Math.ceil(a.height) + 2),
  run(a, ctx) {
    const t = phase(ctx), n = a.count, C = a.paints, m = C.length;
    const span = Math.max(4, Math.round(a.span)), Y = Math.floor(a.at[1]);
    const step = n > 1 ? (span - 4) / (n - 1) : span;
    const wide = Math.min(a.thick, step >= 6 ? 4 : step >= 4 ? 3 : 2);
    const mid = Math.floor(n / 2);
    const out = [];
    for (let i = 0; i < n; i++) {
      const own = i === mid ? 1 : lerp(0.74, 0.94, hash(i, a.seed * 64 + 31 + n));
      const k = clamp(t + (i === mid || t <= 0 || t >= 1 ? 0 : 0.06 * hash(i, a.seed * 64 + 47)));
      const full = Math.max(2, Math.round(a.height * own));
      const width = Math.max(2, Math.round(wide - (wide - 2) * keys(k, THIN)));
      const length = Math.max(2, Math.min(full, Math.round(full * keys(k, LEFT))));
      const left0 = n > 1 ? Math.round(a.at[0] - span / 2 + (i / (n - 1)) * (span - wide)) : Math.round(a.at[0] - wide / 2);
      const left = left0 + Math.floor((wide - width) / 2);
      const cool = k < 0.3 ? 0 : k < 0.85 ? 1 : 2;
      const [dash, gap] = a.style === 'dashes' ? [3, 2] : a.style === 'blocks' ? [width, 2] : [0, 0];
      // runs of rows of one colour, from the foot up: [first row, last row, paint index]
      const runs = [];
      if (!dash) {
        for (let h = 0; h < length; h++) {
          const b = bandOf(h / full, m, cool), last = runs[runs.length - 1];
          if (last && last[2] === b) last[1] = h; else runs.push([h, h, b]);
        }
      } else {
        const period = dash + gap;
        for (let d = 0; d * period < length; d++) {
          const h0 = d * period, h1 = h0 + dash - 1;
          if (d > 0 && h1 >= length) break;                    // a dash is never cut, but the first always shows
          const top = Math.min(h1, length - 1);
          runs.push([h0, top, bandOf((h0 + top) / 2 / full, m, cool)]);
        }
      }
      for (const [h0, h1, b] of runs) {
        out.push({ kind: 'rect', at: [left, Y - h1], size: [width, h1 - h0 + 1], paint: C[b], ...FLAT });
        if (width >= 3 && b >= 1 && b <= m - 2) out.push({ kind: 'rect', at: [left + 1, Y - h1], size: [width - 2, h1 - h0 + 1], paint: C[b - 1], ...FLAT });
      }
    }
    return out;
  },
});

/**
 * drop.motes@1: square motes on the row `at`[1], `count` to each side of `at`[0], 3 x 3 and 2 x 2 by turns and `gap` apart.
 * Over the clip (ctx.t) each slides away from the middle (the outer ones farther, up to `reach`, so no two cross),
 * lifts `rise` pixels and cools through `paints`; a 3 x 3 one has the last paint down its shaded left and bottom. From half
 * way all are 2 x 2. The inner `keep` a side last to the end; the rest are quicker and gone after 0.7 of the clip. Written from the
 * Gridline specification (see the header).
 */
export const dropMotes = defineGenerator({
  id: 'drop.motes', v: 1, family: 'fx',
  about: 'Square motes on a row, half to each side, that slide apart, lift and cool, a few 2 x 2 ones left at the end: the dust of a landing.',
  args: {
    at: point({ about: 'The middle of the row they lie on: their lowest pixels start on this row' }),
    count: count(1, 8, { default: 3, about: 'How many to each side' }),
    reach: px(0, 64, { default: 8, about: 'How far the outermost slides, in pixels' }),
    rise: px(0, 16, { default: 2, about: 'How far they lift by the end, in pixels' }),
    gap: px(3, 16, { default: 4, about: 'How far apart they start, middle to middle, in pixels' }),
    keep: count(0, 8, { default: 2, about: 'How many a side last to the end' }),
    paints: paints(8, { about: 'Its colours as it cools, hottest first; the last is the shaded rim' }),
  },
  keyable: [],
  cost: (a) => 4 * a.count,
  run(a, ctx) {
    const t = phase(ctx), n = a.count, C = a.paints, m = C.length;
    const Y = Math.floor(a.at[1]);
    const out = [];
    for (let side = -1; side <= 1; side += 2) for (let j = 0; j < n; j++) {
      const stays = j < a.keep;
      if (!stays && t > 0.7) continue;
      const k = stays ? t : clamp(t / 0.6);
      const s = j % 2 === 0 && t < 0.5 ? 3 : 2;
      const x = a.at[0] + side * (2.5 + a.gap * j + a.reach * (0.5 + (0.5 * (j + 1)) / n) * easeOut(k));
      const left = Math.round(x - s / 2), bottom = Y - Math.round(a.rise * k);
      const b = m > 1 ? Math.round(k * (m - 2)) : 0;
      if (s === 3 && m > 1) {
        out.push({ kind: 'rect', at: [left, bottom - 2], size: [3, 3], paint: C[m - 1], ...FLAT });
        out.push({ kind: 'rect', at: [left + 1, bottom - 2], size: [2, 2], paint: C[b], ...FLAT });
      } else out.push({ kind: 'rect', at: [left, bottom - s + 1], size: [s, s], paint: C[b], ...FLAT });
    }
    return out;
  },
});
