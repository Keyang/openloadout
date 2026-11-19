// Effect generators for pickups and props (docs/data-sprites.md 3.3, family "fx"), added by build item B8 for the
// first slice: what a collected pickup leaves and what a broken crate scatters. Emitters (2.5c) name them; a clip's keys
// give their `amount` (how far through the effect it is), and the pictures layout (engine/gen/pictures.js) runs an
// emitter placed on a node in frame pixels, so each knows where the frame's edges are. They are kept out of
// engine/gen/fx.js only because build item B12 owns that file; B12 may move them in (the ids and versions stay).
//   pickup.burst@1  engine/pickups.js collectBurst   the ring of sparkles a collected pickup leaves
//   chunks@1        engine/fx.js chunks              boards, staves, sherds and splinters thrown up and landing
import { defineGenerator } from './registry.js';
import { point, px, count, share, seed, flag, paint, struct } from './args.js';
import { lerp, clamp, easeOut, hash, TAU, PI } from '../motion.js';

/**
 * pickup.burst@1: the burst a collected pickup leaves (engine/pickups.js collectBurst): a twinkle where it was and six
 * sparkles that spread `reach` pixels out (kept 3 pixels inside the frame), twinkles of `paint` between dots of `bright`
 * while `sparkle` is on; from amount 0.8 only three pixels are left, whatever the settings. amount: how far through
 * the burst (0 draws nothing). Draw it after the outline.
 */
export const pickupBurst = defineGenerator({
  id: 'pickup.burst', v: 1, family: 'fx',
  about: 'The burst a collected pickup leaves: a twinkle where it was and a spreading ring of sparkles.',
  args: {
    at: point({ about: 'Where the pickup was' }),
    amount: share({ default: 0, about: 'How far through the burst: 0 nothing yet, 1 the three pixels left' }),
    reach: px(3, 64, { default: 10, about: 'How far the sparkles spread, in pixels (half the pickup plus 3)' }),
    sparkle: flag({ default: true, about: 'The ring of twinkles (off: only the centre and the three pixels)' }),
    paint: paint({ about: 'The pickup\'s main colour: the twinkles in the ring' }),
    bright: paint({ about: 'A light tone of it: the dots and the centre twinkle' }),
    core: paint({ about: 'The twinkles\' centres: a light slot such as "shine"' }),
  },
  // keys always reach `amount` (and `at`): it is not listed again among the keyable arguments
  keyable: [],
  cost: () => 7,
  run(a, ctx, { call }) {
    const burst = a.amount;
    if (burst <= 0) return [];
    const [x, y] = a.at, [W, H] = ctx.size;
    const out = [];
    // a sparkle more than 4 px off the frame cannot show (engine/fx.js twinkle keeps to the frame): it is left out
    const near = (px0, py0) => px0 >= -4 && py0 >= -4 && px0 < W + 4 && py0 < H + 4;
    const twinkle = (px0, py0, size, p) => { if (near(px0, py0)) out.push(...call({ gen: 'twinkle', v: 1, at: [px0, py0], size, paint: p, core: a.core }, ctx)); };
    const dot = (px0, py0) => { if (near(px0, py0)) out.push({ kind: 'dot', at: [Math.floor(px0), Math.floor(py0)], paint: a.bright }); };
    const far = Math.max(3, Math.min(a.reach, x - 3, W - 3 - x, y - 3, H - 3 - y));
    const d = lerp(3, far, easeOut(burst));
    const last = burst >= 0.8;
    for (let i = 0; i < 6; i++) {
      const an = (i + 0.5) * (PI / 3);
      const px0 = x + Math.cos(an) * d, py0 = y + Math.sin(an) * d * 0.9;
      if (i % 2 === 0) {
        if (last || !a.sparkle || burst <= 0.2) dot(px0, py0);
        else twinkle(px0, py0, 1, a.paint);
      } else if (a.sparkle && !last && burst > 0.2) dot(px0, py0);
    }
    if (!last) twinkle(x, y, burst < 0.5 ? 2 : 1, a.bright);
    return out;
  },
});

const inside01 = (v, lo, hi) => Math.min(Math.max(v, lo + 0.01), hi - 0.01);
const inPoly = (pts, px0, py0) => {
  let hit = false;
  for (let p = 0, q = pts.length - 1; p < pts.length; q = p++) {
    const [xi, yi] = pts[p], [xj, yj] = pts[q];
    if ((yi > py0) !== (yj > py0) && px0 < ((xj - xi) * (py0 - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};
/** A polygon cut to the box x0 <= x < x1, y0 <= y < y1 (Sutherland-Hodgman), so its pixel centres are the polygon's inside the box. */
function clipped(pts, [x0, y0, x1, y1]) {
  const edges = [[(p) => p[0] - x0, 0], [(p) => x1 - p[0], 0], [(p) => p[1] - y0, 1], [(p) => y1 - p[1], 1]];
  let out = pts;
  for (const [f] of edges) {
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i++) {
      const a = src[i], b = src[(i + 1) % src.length], fa = f(a), fb = f(b);
      if (fa >= 0) out.push(a);
      if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    if (out.length < 3) return [];
  }
  return out;
}

/**
 * chunks@1: solid chunks thrown from `at` (planks, boards, staves, sherds, splinters, pieces of a band): each a spinning
 * bar `size` long and `thick` across that flies up (`rise`) and out (`dist`, every other one the other way), falls and
 * comes to rest lying flat on the `floor` row, a little shorter (`shrink`); `amount` is how far through the throw (0 at
 * the mark, 1 all landed: the frame a game holds, where they are `restThick` thick and shrunk by `restShrink` when
 * those are given). Kept inside `area`. `ink`: the chunks are outlined by themselves (an outline op of their own).
 * Port of engine/fx.js chunks: polygons in the ramp of `paint` (shaded when 2 px or thicker), a dot for a sliver.
 */
export const chunks = defineGenerator({
  id: 'chunks', v: 1, family: 'fx',
  about: 'Solid chunks thrown from a point: boards, staves, sherds or splinters that spin up, fall and land on the floor.',
  args: {
    at: point({ about: 'Where they are thrown from' }),
    amount: share({ default: 0, about: 'How far through the throw: 0 at the mark, 1 all landed' }),
    count: count(1, 24, { default: 6, about: 'How many' }),
    seed: seed({ default: 0, about: 'Which scatter' }),
    dist: px(0, 64, { default: 12, about: 'How far sideways they fly' }),
    rise: px(0, 64, { default: 10, about: 'How high they fly' }),
    size: px(0.5, 32, { default: 6, about: 'How long each is' }),
    thick: count(1, 4, { default: 2, about: 'How thick each is' }),
    spread: px(0, 32, { default: 3, about: 'How far apart they start' }),
    spin: px(0, 4, { default: 1, about: 'How many turns they make' }),
    floor: px(0, 360, { about: 'The row they land on' }),
    land: share({ default: 0.85, about: 'When the last one lands, as a share of the throw' }),
    shrink: share({ default: 0.45, about: 'How much shorter they end' }),
    restThick: count(0, 4, { default: 0, about: 'How thick they are once all have landed (0: as thick)' }),
    restShrink: px(-1, 1, { default: -1, about: 'How much shorter they are once all have landed (below 0: as shrink)' }),
    rest: flag({ default: true, about: 'A chunk stays where it lands (off: it is gone)' }),
    paint: paint({ about: 'Their colour (its ramp shades them)' }),
    area: struct({ x0: px(0, 640), y0: px(0, 360), x1: px(0, 640), y1: px(0, 360) }, { default: { x0: 0, y0: 0, x1: 640, y1: 360 }, about: 'The box they stay in' }),
    ink: flag({ default: false, about: 'Outline the chunks by themselves' }),
  },
  // keys always reach `amount` (and `at`): it is not listed again among the keyable arguments
  keyable: [],
  cost: (a) => a.count + 1,
  run(a, ctx) {
    const [W, H] = ctx.size;
    const B = [Math.max(1, Math.floor(a.area.x0)), Math.max(1, Math.floor(a.area.y0)), Math.min(W - 1, Math.floor(a.area.x1)), Math.min(H - 1, Math.floor(a.area.y1))];
    const floor = Math.min(a.floor, B[3] - 1);
    const k = clamp(a.amount), held = k >= 1;
    const thick = held && a.restThick > 0 ? a.restThick : a.thick, shrink = held && a.restShrink >= 0 ? a.restShrink : a.shrink;
    const [x, y] = a.at, s = a.seed;
    const h = (i, ch) => hash(i, s * 64 + ch);
    const tag = a.ink ? { id: 'chunks' } : {};
    const out = [];
    const put = (px0, py0) => {
      const X = Math.floor(px0), Y = Math.floor(py0);
      if (X < B[0] || Y < B[1] || X >= B[2] || Y >= B[3]) return;
      out.push({ kind: 'dot', at: [X, Y], paint: a.paint, ...tag });
    };
    for (let i = 0; i < a.count; i++) {
      const side = i % 2 ? -1 : 1;
      const x0 = x + (h(i, 2) - 0.5) * 2 * a.spread, y0 = Math.min(y + (h(i, 3) - 0.5) * 2 * a.spread, floor - 1);
      const T = Math.max(0.2, a.land * (0.6 + 0.4 * h(i, 4)));
      const up = a.rise * (0.45 + 0.55 * h(i, 5)), drop = floor - y0;
      const sq = (Math.sqrt(up) + Math.sqrt(up + drop)) / T;
      const v = 2 * sq * Math.sqrt(up);
      const kk = Math.min(k, T), aa = kk / T;
      const L = Math.max(1, a.size * (0.7 + 0.6 * h(i, 6)) * (1 - shrink * aa));
      const th = L < 3 ? 1 : thick;
      const cx = inside01(x0 + side * a.dist * (0.35 + 0.65 * h(i, 7)) * easeOut(aa), B[0] + 0.5, B[2] - 0.5);
      const landed = k >= T;
      if (landed && !a.rest) continue;
      const cy = landed ? floor + 1 - th / 2 : inside01(y0 - v * kk + sq * sq * kk * kk, B[1] + 0.5, floor + 1 - th / 2);
      const rot = landed ? 0 : TAU * a.spin * side * (0.5 + h(i, 8)) * (1 - aa) + (h(i, 9) - 0.5);
      if (L < 2) { put(cx, Math.min(cy, floor)); continue; }
      const ux = (Math.cos(rot) * L) / 2, uy = (Math.sin(rot) * L) / 2, wx = (-Math.sin(rot) * th) / 2, wy = (Math.cos(rot) * th) / 2;
      let pts = [[cx - ux - wx, cy - uy - wy], [cx + ux - wx, cy + uy - wy], [cx + ux + wx, cy + uy + wy], [cx - ux + wx, cy - uy + wy]];
      if (landed) { const l = Math.round(cx - L / 2), w = Math.max(2, Math.round(L)); pts = [[l, floor + 1 - th], [l + w, floor + 1 - th], [l + w, floor + 1], [l, floor + 1]]; }
      // a sliver that falls between pixel centres still shows (engine/fx.js chunks): look for one centre inside first
      const ax = Math.max(0, Math.floor(cx - L)), ay = Math.max(0, Math.floor(cy - L)), bx = Math.min(W - 1, Math.ceil(cx + L)), by = Math.min(H - 1, Math.ceil(cy + L));
      let drew = false;
      for (let py0 = ay; py0 <= by && !drew; py0++) for (let px0 = ax; px0 <= bx; px0++) {
        const qx = px0 + 0.5, qy = py0 + 0.5;
        if (qx < B[0] || qy < B[1] || qx >= B[2] || qy >= floor + 1) continue;
        if (inPoly(pts, qx, qy)) { drew = true; break; }
      }
      if (!drew) { put(cx, Math.min(cy, floor)); continue; }
      const cut = clipped(pts, [B[0], B[1], B[2], floor + 1]);
      out.push({ kind: 'poly', points: cut, paint: a.paint, shade: th >= 2 ? 1 : 0, light: 0, ...tag });
    }
    if (a.ink && out.length) out.push({ kind: 'outline', paint: 'ink', only: 'chunks' });
    return out;
  },
});
