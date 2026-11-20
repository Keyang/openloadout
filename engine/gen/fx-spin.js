// A whirling ring of sparks (family "fx"): the flourish over a piece spun into a tight slot. The look of the Gridline
// kit's `spin-sparkle` (bundles/specs/kit-puzzle-gridline.md: what the code sprite drew with spinRing and spinTrails of
// "engine/spin-ring.js", chips of "engine/fx.js" and sparkMark and sparkFlash of engine/bursts.js; the first three
// were never carried over, so this is written from the specification and the reviewed renders).
//   spark.swirl@1   a white core, then a ring of sparks (squares, four-point stars or short arcs) that turns round the
//                   middle while it widens, short arcs trailing, each spark ending as a 2 x 2
//
//   { "gen": "spark.swirl", "v": 1, "at": [24, 24], "count": 6, "r0": 6, "r1": 18, "turn": 0.5, "mark": "square", "size": 4, "core": 3, "paints": ["shine", "core", "mid", "edge", "rim"] }
//
// It returns rects of whole pixels (no stamps, nothing turned: an arc is laid pixel by pixel), reads the clip phase
// ctx.t (fract(t) in a looping clip, so a loop closes) and nothing of the frame: no pixel is farther than `room` px
// from `at`, so it draws the same on a node as in frame pixels, in a draw list or named as an emitter. `paints` is
// hottest first: white, the core, then cooler, the last the dark rim. Pure: no randomness, no clock, no DOM.
import { defineGenerator } from './registry.js';
import { point, px, count, share, word, paints } from './args.js';
import { fract, clamp, lerp, easeOut, keys, TAU } from '../motion.js';

/** The sparks spark.swirl@1 turns: square chips, four-point stars, short arcs along the ring. */
export const SWIRL_MARKS = Object.freeze(['square', 'star', 'arc']);

const FLAT = { shade: 0 };
const LINE = (k) => k;
// a star's reach over the ring's life, as a share of its biggest: full, then a pixel at a time down to one
const STAR = (m) => [[0, m], [0.3, m], [0.5, m - 1], [0.7, Math.min(2, m)], [0.9, 1], [1, 1]];
// the four-point flash a star ring starts with: a star with hollow sides (engine/bursts.js sparkFlash)
const HOLLOW = 0.62;

/**
 * spark.swirl@1: frame by frame over the clip (ctx.t). Until `begin` (a share of the clip: one frame) only the core
 * shows, centred on `at`: 2 x `core` px across in the first paint (white), lined with the second and rimmed with the
 * colour before the last; a square for mark "square", a four-point flash for "star", a disc for "arc". It shrinks
 * over the next two frames and is gone. From `begin` a ring of `count` sparks turns clockwise by `turn` of a full
 * circle while it widens from radius `r0` to `r1`, both fast at first. "square": chips `size` px across with an L of
 * the last paint on the two sides away from the light, stepping down to 2 px and cooling. "star": plus signs reaching
 * `size` px (4 at most) from their middle, filled with the core colour, their tips in the last paint, stepping down to
 * one pixel of reach. "arc": strokes 2 x `size` px long lying along the ring, 2 px thick, the leading end hot, that
 * shorten to a bead. While the ring is fast, `trails` thin arcs follow that many of the sparks, evenly round the
 * ring, never touching a spark. At the end of the clip each spark is a 2 x 2 of the last paint. No pixel is farther
 * than `room` px from `at`, across or down. Arguments: at, count, r0, r1, turn, mark, size, core, trails, begin, room, paints.
 */
export const sparkSwirl = defineGenerator({
  id: 'spark.swirl', v: 1, family: 'fx',
  about: 'A white core, then a ring of sparks (squares, stars or short arcs) that turns round the middle while it widens, short arcs trailing, each ending as a 2 x 2: a spin flourish.',
  args: {
    at: point({ about: 'The middle (a pixel corner: 24, 24 in a 48 px frame)' }),
    count: count(3, 12, { default: 6, about: 'How many sparks in the ring' }),
    r0: px(0, 64, { default: 6, about: 'The ring\'s radius when it appears' }),
    r1: px(0, 64, { default: 18, about: 'The ring\'s radius at the end' }),
    turn: share({ default: 0.5, about: 'How far round the ring turns over the clip, as a share of a full circle' }),
    mark: word(SWIRL_MARKS, { default: 'square', about: 'What a spark is: a square chip, a four-point star or a short arc along the ring' }),
    size: count(2, 6, { default: 4, about: 'A square\'s side, a star\'s reach from its middle (4 at most) or half an arc\'s length, in pixels, when the ring appears' }),
    core: count(0, 8, { default: 3, about: 'Half the width of the white core the clip starts with (0: none)' }),
    trails: count(0, 4, { default: 2, about: 'How many sparks a thin arc trails behind while the ring is fast' }),
    begin: share({ default: 0.1111, about: 'When in the clip the ring appears, as a share of the clip: one frame of it' }),
    room: px(4, 320, { default: 23, about: 'How far from the middle a pixel may be, each way: 1 px less than half the frame' }),
    paints: paints(8, { about: 'Its colours hottest first: white, the core, then cooler, the last its dark rim' }),
  },
  keyable: [],
  cost: (a) => 12 + 24 * a.core + a.count * (16 + 8 * a.size) + 16 * a.trails,
  run(a, ctx) {
    const t = ctx.loop ? fract(ctx.t) : clamp(ctx.t);
    const C = a.paints, heat = C.length > 1 ? 1 : 0, n = C.length - heat;      // C[heat ...] are the heat steps
    const H = (i) => heat + Math.max(0, Math.min(n - 1, i));
    const RIM = H(n - 1), EDGE = H(n - 2), CORE = H(0), MID = H(1), WHITE = 0;
    const [ax, ay] = a.at, cx = Math.round(ax), cy = Math.round(ay);
    const x0 = Math.ceil(ax - a.room), x1 = Math.floor(ax + a.room) - 1, y0 = Math.ceil(ay - a.room), y1 = Math.floor(ay + a.room) - 1;
    const map = new Map();
    const put = (x, y, i) => { if (x >= x0 && x <= x1 && y >= y0 && y <= y1) map.set(`${x},${y}`, [x, y, i]); };
    const fill = (x, y, w, h, i) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) put(xx, yy, i); };
    // every pixel whose middle lies in the band `thick` wide about radius r, between the angles a0 and a1 (0 up, clockwise)
    const arc = (r, a0, a1, thick, i, taken) => {
      if (!(a1 > a0)) return;
      const R = Math.ceil(r + thick) + 1;
      for (let yy = cy - R; yy < cy + R; yy++) for (let xx = cx - R; xx < cx + R; xx++) {
        const dx = xx + 0.5 - cx, dy = yy + 0.5 - cy;
        if (Math.abs(Math.hypot(dx, dy) - r) > thick / 2) continue;
        if (fract((Math.atan2(dx, -dy) - a0) / TAU) * TAU > a1 - a0) continue;
        if (taken && near(xx, yy)) continue;
        put(xx, yy, i);
      }
    };
    let sparks = map;                                                            // the pixels a trail may not touch
    const near = (x, y) => { for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (sparks.has(`${x + i},${y + j}`)) return true; return false; };

    if (t >= a.begin - 1e-9) {
      const u = a.begin < 1 ? clamp((t - a.begin) / (1 - a.begin) + 1e-9) : 1, e = easeOut(u), last = u >= 1 - 1e-6;
      const s = Math.round(lerp(a.size, 2, u ** 1.7) + 0.02);                         // a square's side now
      const reach = Math.max(1, Math.round(keys(u, STAR(Math.min(4, a.size)), LINE)));   // a star's reach now
      const margin = last ? 1 : a.mark === 'square' ? s / 2 : a.mark === 'star' ? reach + 0.5 : 1.5;
      const r = Math.max(0, Math.min(lerp(a.r0, a.r1, e), a.room - margin));
      const angle = a.turn * TAU * e, step = TAU / a.count;
      const len = Math.min(lerp(2 * a.size, 3, u) / Math.max(1, r), 0.6 * step);       // an arc spark, in radians
      const spots = Array.from({ length: a.count }, (_, i) => angle + i * step);
      const at = (an) => [ax + Math.sin(an) * r, ay - Math.cos(an) * r];
      for (const an of spots) {
        const [x, y] = at(an);
        if (last) { fill(Math.round(x - 1), Math.round(y - 1), 2, 2, RIM); continue; }
        if (a.mark === 'square') {
          const k = u ** 1.7, body = H(k < 0.25 ? 0 : k < 0.7 ? 1 : n - 2), left = Math.round(x - s / 2), top = Math.round(y - s / 2);
          if (s >= 3 && body !== RIM) { fill(left, top, s, s, RIM); fill(left + 1, top, s - 1, s - 1, body); } else fill(left, top, s, s, body);
        } else if (a.mark === 'star') {
          const mx = Math.floor(x), my = Math.floor(y), mid = u < 0.5 ? CORE : MID;
          for (let i = 1; i <= reach; i++) {
            const c = i < reach ? mid : reach >= 2 ? RIM : EDGE;
            put(mx - i, my, c); put(mx + i, my, c); put(mx, my - i, c); put(mx, my + i, c);
          }
          if (reach >= 3) for (const [i, j] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(mx + i, my + j, EDGE);
          put(mx, my, mid);
        } else {
          const head = Math.min(len, 3 / Math.max(1, r));
          arc(r, an - len / 2, an + len / 2, 2.2, EDGE);
          arc(r, an + len / 2 - head, an + len / 2, 2.2, u < 0.6 ? CORE : MID);
        }
      }
      // thin arcs trail some of the sparks while the ring is fast: as long as the ring went in the last moments, 3 to 8 px
      if (!last && a.trails > 0 && u >= 0.2 && r >= 4) {
        const went = a.turn * TAU * (e - easeOut(Math.max(0, u - 0.15))) * r;
        const gap = (a.mark === 'square' ? s / 2 + 1.5 : a.mark === 'star' ? 2.5 : 2.5 + (len * r) / 2) / r;
        const free = step - 2 * gap - (a.mark === 'arc' ? 0 : 0.5 / r);
        const long = Math.min(clamp(went, 3, 8) / r, free);
        sparks = new Map(map);
        if (long * r >= 2) for (let j = 0; j < Math.min(a.trails, a.count); j++) {
          const an = spots[Math.floor((j * a.count) / Math.min(a.trails, a.count))];
          arc(r, an - gap - long, an - gap, 1.2, u < 0.3 ? MID : EDGE, true);
        }
      }
    }

    // the core, over the ring: whole on the first frame, smaller on the next two, then gone
    const stage = a.begin > 0 ? Math.round(t / a.begin) : t <= 0 ? 0 : 3, h = a.core - stage;
    if (a.core > 0 && stage <= 2 && h >= 1) {
      const body = stage === 0 ? WHITE : CORE, lining = stage === 0 ? CORE : MID;
      if (a.mark === 'square') {
        fill(cx - h - 1, cy - h - 1, 2 * h + 2, 2 * h + 2, EDGE);
        fill(cx - h, cy - h, 2 * h, 2 * h, h >= 2 ? lining : body);
        if (h >= 2) fill(cx - h + 1, cy - h + 1, 2 * h - 2, 2 * h - 2, body);
      } else {
        const R = a.mark === 'star' && stage === 0 ? 2 * h + 1 : h + 0.5;
        const inside = a.mark === 'star' ? (dx, dy) => Math.abs(dx) ** HOLLOW + Math.abs(dy) ** HOLLOW <= R ** HOLLOW : (dx, dy) => dx * dx + dy * dy <= R * R;
        const is = (x, y) => inside(x + 0.5 - cx, y + 0.5 - cy);
        const B = Math.ceil(R) + 2;
        for (let y = cy - B; y < cy + B; y++) for (let x = cx - B; x < cx + B; x++) {
          const round = is(x - 1, y) && is(x + 1, y) && is(x, y - 1) && is(x, y + 1);
          if (is(x, y)) put(x, y, round ? body : lining);
          else if (is(x - 1, y) || is(x + 1, y) || is(x, y - 1) || is(x, y + 1)) put(x, y, EDGE);
        }
      }
    }

    // the pixels as rects: runs of one paint along each row
    const rows = new Map();
    for (const [x, y, i] of map.values()) { if (!rows.has(y)) rows.set(y, []); rows.get(y).push([x, i]); }
    const out = [];
    for (const y of [...rows.keys()].sort((p, q) => p - q)) {
      const row = rows.get(y).sort((p, q) => p[0] - q[0]);
      let from = 0;
      for (let k = 1; k <= row.length; k++) {
        if (k < row.length && row[k][0] === row[k - 1][0] + 1 && row[k][1] === row[from][1]) continue;
        out.push({ kind: 'rect', at: [row[from][0], y], size: [row[k - 1][0] - row[from][0] + 1, 1], paint: C[row[from][1]], ...FLAT });
        from = k;
      }
    }
    return out;
  },
});

/** The most stamp pixels the generator here can return ("<id>@<v>" -> (args, size) -> pixels): none, it returns rects (engine/gen/index.js STAMP_BOUNDS). */
export const SPIN_STAMP_BOUNDS = Object.freeze({ 'spark.swirl@1': () => 0 });

/** The keyable arguments of the generator here that its cost or stamp bound reads: none, nothing is keyable (engine/gen/index.js SIZE_KEYS). */
export const SPIN_SIZE_KEYS = Object.freeze({ 'spark.swirl@1': Object.freeze([]) });
