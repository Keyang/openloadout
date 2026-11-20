// PORT (migration batch E2): a copy of engine/fumes.js with its imports pointed at the port shims (engine/gen/ports/colour.js,
// engine/gen/ports/e2/surface.js), so it draws paint refs on engine/gen/port-surface.js grids. It is the drawing code of migration batch E2's
// effect behaviours (engine/gen/fx-e2.js), so it is NOT temporary: it stays when engine/fumes.js goes and goes only with the last
// generator version that draws with it. A HAND CHANGE note below says where it differs from its source; never change what
// a released generator version draws through it.
// Fumes (added with batch K04: flames, smoke plume, poison haze): things that rise on their own
// repeating timers, the partners of engine/fx.js (`smoke`, `puffs`, `particles`) and
// engine/bursts.js (`driftUp`, which is one-shot):
//   plume          a rising column of puffs, born small at its foot, swelling and drifting downwind as they
//                  climb, coloured by age (young light, old dark); it can stop being fed and die down to a wisp
//   risers         where a few things are while they rise on repeating timers and sway (the looping twin of driftUp)
//   bubble         one round bubble with a glint, or the four droplets it bursts into
//   risingBubbles  bubbles that rise from a band, grow, and burst at the top of their climb, each on its own timer
// Like fx.js: hard pixels, no Math.random, everything stays inside the frame's 1 px empty border (or
// inside `box`), colour lists are lightest (hottest) first with the rim last (fx.steps), and loops close
// at whole `cycles`. Draw these AFTER g.outline(INK): they are rimmed with their own dark tone.
// They draw only through Surface calls (fill, dot).
//
//   import { steps } from '../engine/fx.js';
//   import { plume, risers, risingBubbles } from '../engine/fumes.js';
//   const C = steps(p.edge, { core: p.core, white: false });                         // [light, middle, dark, rim]
//   plume(g, { t, x: 24, y: 44, count: 5, rise: 34, drift: 8, size: 4, colours: C });   // chimney smoke, a loop
//   plume(g, { t, x: 24, y: 44, count: 5, rise: 34, colours: C, stop: 0 });             // the same column dying down
//   risingBubbles(g, { t, x: 24, y: 40, count: 5, rise: 18, spread: 16, size: 2, colours: C });
//   for (const s of risers({ t, x: 24, y: 40, count: 3, rise: 20, spread: 12 })) drawMark(g, 'skull', s.x, s.y, 5, C[0]);

import { stepAt } from './fx.js';
import { hash, fract, clamp, lerp, easeOut, TAU } from '../../../motion.js';

function boxOf(g, box) {
  const b = [1, 1, g.w - 1, g.h - 1];
  if (box) { b[0] = Math.max(b[0], Math.floor(box[0])); b[1] = Math.max(b[1], Math.floor(box[1])); b[2] = Math.min(b[2], Math.floor(box[2])); b[3] = Math.min(b[3], Math.floor(box[3])); }
  return b;
}
const inBox = (B) => (px, py) => px >= B[0] && py >= B[1] && px < B[2] && py < B[3];
function put(g, B, x, y, c) {
  x = Math.floor(x); y = Math.floor(y);
  if (x >= B[0] && y >= B[1] && x < B[2] && y < B[3]) g.dot(x, y, c);
}
const coloursOf = (o, fallback) => (Array.isArray(o.colours) ? o.colours : [o.colour ?? fallback, o.colour ?? fallback]);
const smooth = (v) => { v = clamp(v); return v * v * (3 - 2 * v); };

/**
 * Draws a rising column of puffs from (x, y): chimney smoke, a steam vent, soot from a wreck; each puff is born small, swells and leans downwind as it climbs, light when young and dark when old.
 * Arguments: g (the Surface); o: { t (clip phase; the column repeats `cycles` times a clip), x, y (the foot: puffs are born here), count (puffs in the column, default 5), seed, cycles, rise (px the column climbs, default 30), drift (px the top leans to the right, negative to the left; the lean grows with height), sway (px of side-to-side wander, default 1), size (radius of a grown puff, default 4), shape ('round', 'wispy': puffs stretch sideways and thin as they age, 'lumpy': each puff a cluster of three), stop (leave out for a loop; a time in clips, such as 0: no puff is born after it, so with t running 0 to 1 the column lifts off its foot and dies away), wisp (with stop: true keeps the last puff born as a small wisp near the top instead of letting it vanish, so the last frame is never empty; default true), colour | colours (lightest first, the rim last), box }. Returns how many puffs it drew.
 */
export function plume(g, o) {
  const { t = 0, x, y, count = 5, seed = 0, cycles = 1, rise = 30, drift = 0, sway = 1, size = 4, shape = 'round', stop = null, wisp = true } = o;
  const B = boxOf(g, o.box), clip = inBox(B);
  const C = coloursOf(o, '#8f97a8');
  const n = C.length, rim = C[n - 1], body = n > 1 ? C.slice(0, n - 1) : C;
  const h = (i, ch) => hash(i, seed * 64 + ch);
  const tau = cycles * t;
  const list = [];
  let last = null;
  for (let i = 0; i < count; i++) {
    const phase = (i + 0.35 * h(i, 1)) / count;                           // births of puff i fall at whole numbers minus phase
    let k;
    if (stop === null) k = fract(tau + phase);
    else {
      const born = Math.floor(stop * cycles + phase) - phase;             // its last birth no later than stop
      k = tau - born;
      if (!last || born > last.born) last = { i, born };
    }
    list.push({ i, k });
  }
  if (stop !== null && wisp && last) { const L = list.find((q) => q.i === last.i); L.k = Math.min(L.k, 0.94); }
  const drawn = [];
  for (const { i, k } of list) {
    if (k < 0 || k >= 1) continue;
    const grow = 0.3 + 0.9 * easeOut(Math.min(1, k / 0.7));               // the column widens as it climbs
    const r = size * (0.85 + 0.3 * h(i, 2)) * grow * (1 - 0.82 * smooth((k - 0.72) / 0.28));
    const px = x + drift * k * k + sway * k * Math.sin(TAU * (1.2 * k + h(i, 3)));
    const py = y - rise * k * (0.92 + 0.16 * h(i, 4));
    drawn.push({ i, k, r, px, py });
  }
  drawn.sort((a, b) => b.k - a.k);                                       // oldest first, young puffs in front
  const pieces = [];
  for (const D of drawn) {
    const c = stepAt(body, 1 - D.k), dark = stepAt(body, 1 - Math.min(1, D.k + 0.34));
    if (D.r < 0.9) { pieces.push({ speck: true, D, c: D.k > 0.85 ? rim : dark }); continue; }
    let inside;
    if (shape === 'wispy') {
      const rx = D.r * (1 + 0.9 * D.k), ry = Math.max(0.7, D.r * (1 - 0.6 * D.k)), lean = drift >= 0 ? 0.35 : -0.35;
      inside = (px, py) => { const dy = py - D.py, dx = px - D.px + lean * dy; return (dx / rx) ** 2 + (dy / ry) ** 2 <= 1; };
    } else if (shape === 'lumpy') {
      const s = h(D.i, 5) < 0.5 ? 1 : -1, r2 = D.r * 0.68;
      const L = [[D.px, D.py, D.r], [D.px + s * D.r * 0.8, D.py + D.r * 0.35, r2], [D.px - s * D.r * 0.55, D.py - D.r * 0.6, r2 * 0.85]];
      inside = (px, py) => L.some(([cx, cy, rr]) => (px - cx) ** 2 + (py - cy) ** 2 <= rr * rr);
    } else { const rx = D.r * 1.15; inside = (px, py) => ((px - D.px) / rx) ** 2 + ((py - D.py) / D.r) ** 2 <= 1; }
    const pad = D.r * 2 + 2;
    pieces.push({ D, inside, box: [D.px - pad, D.py - pad, D.px + pad, D.py + pad], paint: { light: c, base: c, dark }, shade: D.r >= 2.5 && shape !== 'wispy' ? 1 : 0 });
  }
  // every rim first, then every body: puffs that overlap join into one column with no line between them
  for (const P of pieces) if (!P.speck) g.fill(...P.box, P.inside, rim, { outline: rim, clip });
  for (const P of pieces) {
    if (P.speck) put(g, B, P.D.px, P.D.py, P.c);
    else g.fill(...P.box, P.inside, P.paint, { shade: P.shade, clip });
  }
  return pieces.length;
}

/**
 * Works out where a few things are while they rise from (x, y) on repeating timers and sway: bubbles, skulls over a poisoned fighter, notes, souls; returns [{ i, x, y, life }], life 0 just set off to 1 at the top.
 * Arguments: o: { t (clip phase; each thing rises `cycles` times a clip, evenly staggered, so a loop closes), x, y (where they set off), count, rise (px the highest climbs; each climbs 70 to 100% of it), spread (px across the band they set off from), sway (px of side-to-side drift, default 1), seed, cycles, box ([x0, y0, x1, y1]: every place returned is kept inside it), pad (px kept between a place and each side of the box, default 0) }.
 */
export function risers(o) {
  const { t = 0, x, y, count = 3, rise = 16, spread = 8, sway = 1, seed = 0, cycles = 1, box = null, pad = 0 } = o;
  const h = (i, ch) => hash(i, seed * 64 + ch);
  const out = [];
  for (let i = 0; i < count; i++) {
    const life = fract(cycles * t + (i + 0.4 * h(i, 1)) / count);
    const lane = count === 1 ? 0 : ((i * 0.618034 + h(0, 2)) % 1) - 0.5;   // golden-ratio lanes: they never bunch on one side
    let px = x + lane * spread + sway * Math.sin(TAU * (life + h(i, 3)));
    let py = y - rise * (0.7 + 0.3 * h(i, 4)) * life;
    if (box) { px = clamp(px, box[0] + pad, box[2] - pad); py = clamp(py, box[1] + pad, box[3] - pad); }
    out.push({ i, x: px, y: py, life });
  }
  return out;
}

/**
 * Draws one round bubble centred at (x, y) with radius r, rimmed and lit from the top right, or, with pop above 0, the four droplets it has burst into.
 * Arguments: g (the Surface); x, y (the middle: .5 for a pixel centre); r (radius in px: under 1.2 one pixel; from 1.9 a skin round a middle of the first colour, shaded toward the bottom left by the second); colours (lightest first, the rim last: [middle, middle shade, skin, rim] as steps() gives them); options { pop (0..1: how far the droplets have flown, 0 = not burst), glint (the colour of the glint, default white), box }.
 */
export function bubble(g, x, y, r, colours, { pop = 0, glint = '#ffffff', box } = {}) {
  const B = boxOf(g, box), clip = inBox(B), C = colours, n = C.length;
  const rim = C[n - 1], skin = C[Math.max(0, n - 2)], mid = C[Math.min(1, n - 1)], core = C[0];
  if (pop > 0) {
    const d = r + 0.5 + 2 * pop, c = pop < 0.5 ? skin : rim;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(g, B, x + sx * d * 0.75, y + sy * d * 0.75, c);
    return;
  }
  if (r < 1.2) { put(g, B, x, y, r < 0.8 ? rim : skin); return; }
  g.fill(x - r - 2, y - r - 2, x + r + 2, y + r + 2, (px, py) => (px - x) ** 2 + (py - y) ** 2 <= r * r, skin, { outline: rim, clip });
  if (r >= 1.9) g.fill(x - r, y - r, x + r, y + r, (px, py) => (px - x) ** 2 + (py - y) ** 2 <= (r - 1) * (r - 1), { light: core, base: core, dark: mid }, { shade: r >= 2.9 ? 1 : 0, clip });
  put(g, B, x + r * 0.45, y - r * 0.45, glint);
}

/**
 * Draws bubbles rising from a band around (x, y), each on its own repeating timer: a speck that grows into a bubble, climbs and sways, then bursts into four droplets at the top of its climb (poison, a swamp, a boiling pot, air under water).
 * Arguments: g (the Surface); o: { t (clip phase; each bubble repeats `cycles` times a clip, so a loop closes), x, y (the middle of the band they rise from), count (default 5), seed, cycles, rise (px the highest climbs), spread (px across the band), sway (px, default 1), size (radius of a grown bubble, default 2), colour | colours (lightest first, the rim last), box }. Returns how many whole bubbles it drew.
 */
export function risingBubbles(g, o) {
  const { size = 2 } = o;
  const B = boxOf(g, o.box);
  const C = coloursOf(o, '#9bd18a');
  const pad = size + 1.5;
  let whole = 0;
  for (const s of risers({ ...o, box: B, pad })) {
    const cx = Math.floor(s.x) + 0.5, cy = Math.floor(s.y) + 0.5;
    if (s.life >= 0.8) { if (s.life < 0.97) bubble(g, cx, cy, size, C, { pop: (s.life - 0.8) / 0.17, box: B }); continue; }
    const r = s.life < 0.08 ? 0.6 : lerp(1, size, Math.min(1, (s.life - 0.08) / 0.3));
    bubble(g, cx, cy, r, C, { box: B });
    if (r >= size - 0.01) whole++;
  }
  return whole;
}
