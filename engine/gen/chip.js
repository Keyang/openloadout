// The credit chip (migration batch M1, docs/data-sprites.md section 9): chip@1, family "shape", draws a flat chip
// (six-sided, round or a bar) turned about its upright axis with its edge, a raised rim round a sunken field, a glint
// band and a lit mark (a circuit or a star); chip.turn@1, family "motion", turns it as the old sprite did (half a turn a
// loop in idle; in a collect it flips while it swells and shrinks). Port of sprites/credit-chip.js render with
// engine/gadgets.js drawToken and drawCircuit, pixel for pixel, as stamps (engine/gen/pixels.js), like token@1.
import { defineGenerator } from './registry.js';
import { point, px, count, angle, word, flag, paint } from './args.js';
import { Pixels, rampOf, tilesFor } from './pixels.js';
import { ellipseIn, polyIn } from '../surface.js';
import { lerp, keys, fract } from '../motion.js';

const even = (v) => 2 * Math.round(v / 2);
// engine/shapes.js hexIn and engine/ui.js cutRectIn, as the old chip called them (copied, so this module keeps no drawing helper alive)
const hexIn = (cx, cy, w, h) => { const a = w / 2, b = h / 2; return (x, y) => { const X = Math.abs(x - cx), Y = Math.abs(y - cy); return X < a && Y + X / 2 < b + 0.25; }; };
const cutRectIn = (x, y, w, h, cut) => (px0, py0) => {
  const ix = Math.floor(px0 - x), iy = Math.floor(py0 - y);
  if (ix < 0 || iy < 0 || ix >= w || iy >= h) return false;
  const rx = w - 1 - ix, ry = h - 1 - iy;
  return ix + iy >= cut && rx + iy >= cut && rx + ry >= cut && ix + ry >= cut;
};
// engine/shapes.js starPoints (five points, inner 0.46) and placedIn's scaling
const starIn = (cx, cy, r) => polyIn(Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5, k = i % 2 ? r * 0.46 : r; return [cx + Math.cos(a) * k, cy + Math.sin(a) * k]; }));
const placed = (test, cx, cy, sx, sy) => (x, y) => test((x - cx) / sx, (y - cy) / sy);

/** The faces chip@1 can have: each a height for a width (whole even pixels) and a shape test around (0, 0). */
const FACES = Object.freeze({
  hex: { h: (w) => even(w * 1.14), face: (w, h) => hexIn(0, 0, w, h) },
  round: { h: (w) => w, face: (w, h) => ellipseIn(0, 0, w / 2, h / 2) },
  bar: { h: (w) => even(w * 1.8), face: (w, h) => cutRectIn(-w / 2, -h / 2, w, h, 2) },
});
/** The faces chip@1 draws, in the order a choice lists them: hex (six sides), round, bar. */
export const CHIP_SHAPES = Object.freeze(Object.keys(FACES));
/** The marks chip@1 prints on its face: a circuit, a star, or none. */
export const CHIP_MARKS = Object.freeze(['circuit', 'star', 'plain']);

const reach = (a) => Math.ceil((even(a.width) * 1.8) / 2 * Math.max(1, a.scale) * 1.6 + a.thick + 4);

/** chip@1: a credit chip turned `spin` degrees about its upright axis, its glint at `sheen` and its mark lit (port of sprites/credit-chip.js). */
export const chip = defineGenerator({
  id: 'chip', v: 1, family: 'shape',
  about: 'A flat credit chip (six-sided, round or a bar) turned about its upright axis: edge, raised rim, glint band and a lit circuit or star.',
  args: {
    at: point({ about: 'The middle of the face (an even width sits on the pixel corner nearest it)' }),
    shape: word(CHIP_SHAPES, { default: 'hex', about: 'The outline of its face' }),
    width: count(4, 24, { about: 'Pixels across face-on (made even)' }),
    thick: count(1, 8, { default: 3, about: 'How thick it is, in pixels' }),
    mark: word(CHIP_MARKS, { default: 'circuit', about: 'What its face carries, lit' }),
    spin: angle({ default: 0, about: 'How far it is turned: 0 face-on, 90 edge-on, 180 the back' }),
    sheen: px(-2, 2, { default: 0, about: 'Where the glint band is: -1.6 off one side, 1.6 off the other' }),
    glint: flag({ default: false, about: 'Draw the glint band' }),
    scale: px(0, 2, { default: 1, about: 'Its size as a share of `width`' }),
    squash: px(-0.5, 0.5, { default: 0, about: 'Wider (above 0) or taller (below 0)' }),
    bare: flag({ default: false, about: 'Leave the mark off (small, moving fast)' }),
    metal: paint({ about: 'The metal: face, edge and rim from its ramp' }),
    field: paint({ about: 'The sunken middle inside the rim' }),
    gleam: paint({ about: 'The glint band on the face' }),
    lit: paint({ about: 'The lit mark' }),
    pad: paint({ about: 'The bright node at the heart of the circuit: a light slot such as "shine"' }),
  },
  keyable: ['spin', 'sheen', 'glint', 'scale', 'squash', 'bare'],
  cost: (a) => tilesFor(2 * reach(a), 2 * reach(a)),
  run(a) {
    const S = FACES[a.shape], w = even(a.width), h = S.h(w);
    const sx = a.scale * (1 + a.squash), sy = a.scale * (1 - a.squash);
    if (a.scale <= 0.3) return [];
    const cx = Math.round(a.at[0]), cy = Math.round(a.at[1]);
    const R = reach(a);
    const g = new Pixels(cx - R, cy - R, 2 * R, 2 * R);
    const B = [cx - R, cy - R, cx + R, cy + R];
    const M = rampOf(a.metal);
    // drawToken: the badge turned (shapes.js turnedIn), its edge, its face, the sunken field and the rim's shadow
    const ang = (a.spin * Math.PI) / 180, thick = Math.max(1, a.thick * a.scale);
    const c = Math.cos(ang), s = Math.sin(ang), k = Math.max(Math.abs(c), 1e-3);
    const f = (thick / 2) * s, lo = Math.min(-f, f), hi = Math.max(-f, f), tx = c >= 0 ? f : -f;
    const badge = S.face(w, h);
    const put = (test) => placed(test, cx, cy, sx, sy);
    const body = put((x, y) => badge((x - Math.min(Math.max(x, lo), hi)) / k, y)), face = put((x, y) => badge((x - tx) / k, y));
    g.fill(...B, body, { base: M.dark, dark: M.deep, light: M.base }, { shade: 1, light: 1 });
    g.fill(...B, face, M, { shade: 1, light: 1 });
    const sunk = (x, y) => face(x, y) && face(x - 1, y) && face(x + 1, y) && face(x, y - 1) && face(x, y + 1);
    const [dx, dy] = g.shadow;
    g.fill(...B, sunk, a.field);
    g.fill(...B, (x, y) => sunk(x, y) && !sunk(x - dx, y - dy), M.dark);
    if (a.glint) {
      const bx = cx + tx * sx, r = h / 2;
      const band = (test, colour) => g.fill(bx - r - 2, cy - r - 2, bx + r + 2, cy + r + 2, (x, y) => Math.abs((x - bx) / r + (0.5 * (y - cy)) / r - a.sheen) < 0.13 && test(x, y), colour);
      band(face, a.gleam);
      band(sunk, M.base);
    }
    if (!a.bare && Math.abs(c) > 0.6) {
      const at = (u, v) => [cx + (tx + u * k) * sx, cy + v * sy];
      if (a.mark === 'circuit') {
        // drawCircuit: a square chip outline with two pins each side and a bright node in the middle
        const H = Math.max(3, Math.round(w / 2 - 2)), V = Math.max(3, Math.round(h / 2 - 3));
        const bx = Math.max(2, H - (H >= 5 ? 2 : 1)), by = Math.max(2, V - (V >= 5 ? 2 : 1));
        const px0 = Math.max(1, Math.round(bx / 2)), py0 = Math.max(1, Math.round(by / 2));
        const dot = (i, j, col) => { const [x, y] = at(i + 0.5, j + 0.5); g.dot(Math.floor(x), Math.floor(y), col); };
        for (let i = -bx; i < bx; i++) { dot(i, -by, a.lit); dot(i, by - 1, a.lit); }
        for (let j = -by; j < by; j++) { dot(-bx, j, a.lit); dot(bx - 1, j, a.lit); }
        for (let j = by; j < V; j++) for (const i of [-px0, px0 - 1]) { dot(i, -j - 1, a.lit); dot(i, j, a.lit); }
        for (let i = bx; i < H; i++) for (const j of [-py0, py0 - 1]) { dot(-i - 1, j, a.lit); dot(i, j, a.lit); }
        for (const [i, j] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) dot(i, j, a.pad);
      } else if (a.mark === 'star') {
        const star = starIn(0, 0.5, Math.min(w, h) / 2 - 2);
        g.fill(...B, put((x, y) => badge((x - tx) / k, y) && star((x - tx) / k, y)), a.lit, { clip: sunk });
      }
    }
    return g.stamps();
  },
});

const FLIP = [[0.14, 0], [0.29, 0.34], [0.43, 0.5], [0.57, 1]];
const linear = (x) => x;
/** chip.turn@1: turns the chip@1 calls on its node: `spin` half a turn a loop with the glint sliding across (idle), or `flip` as a collected chip flips, swells and shrinks (with pickup.collect@1 moving it). */
export const chipTurn = defineGenerator({
  id: 'chip.turn', v: 1, family: 'motion',
  about: 'Turns a credit chip: half a turn a loop with its glint sliding across, or the flip, swell and shrink of a collect.',
  args: { mode: word(['spin', 'flip'], { default: 'spin', about: 'spin: the idle turn; flip: the collect' }) },
  cost: () => 0,
  run(a, ctx) {
    const t = ctx.t;
    if (a.mode === 'flip') {
      const scale = keys(t, [[0, 1], [0.5, 1], [0.58, 1.1], [0.75, 0.5], [0.86, 0]]);
      const squash = keys(t, [[0, 0], [0.14, 0.2], [0.3, -0.18], [0.5, 0], [1, 0]]);
      return [{ move: [0, 0], args: { 'chip.spin': 180 * keys(t, FLIP, linear), 'chip.glint': false, 'chip.scale': scale, 'chip.squash': squash, 'chip.bare': scale < 0.9 } }];
    }
    const u = fract(t);
    return [{ move: [0, 0], args: { 'chip.spin': 180 * u, 'chip.sheen': lerp(-1.6, 1.6, fract(u + 0.5)), 'chip.glint': true } }];
  },
});
