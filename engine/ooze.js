// Soft, wet, living matter seen from above: a wall of soft mass with a hanging front face (hive growth, a hedge,
// a snow bank, flowstone), a puddle whose edge wobbles, bubbles that swell and burst on a liquid, and veins that
// wander and fork. The shape functions are pure and return inside(px, py) tests for g.fill / g.blob; the drawing
// functions draw on a Surface with hard pixel edges. No Math.random: the same arguments give the same pixels.
// Added with batch S12 (sprites/tiles-hive.json and sprites/acid-pool.json, the worked examples).
//
//   import { drawSoftWall, puddleIn, surfaceBubbles, drawVein } from '../engine/ooze.js';
//
//   // a top-down wall block: the cap pieces are drawSoftBlock's, the bottom row is a face with a wavering foot
//   const wall = { fill, round: 6, top: rim, left: rim, right: rim,
//                  face: { paint: (x, y, t, up) => ..., foot: (u) => LIFT[u], round: 5, shadow: '#333564' } };
//   drawSoftWall(g, pieceOf(clip).piece, wall, t);
//
//   // a pool: three waves round an ellipse; move their phases with the clip and the edge wobbles
//   const pool = puddleIn(24, 16, 15, 9, [[2, 0.08, 0.1], [3, 0.1, 0.4 + 0.05 * wave(t)], [5, 0.06, 0.7]]);
//   g.fill(2, 2, 46, 30, pool, ramp(p.body));
//   surfaceBubbles(g, { t, count: 6, inside: insetIn(pool, 3), box: [4, 4, 44, 28], size: 2, rim: acid.dark, body: acid.light, glint: p.glow });
//
//   // a vein in a floor pattern: it stays inside its box, so a version of a fill keeps its marks off the tile's edge
//   patternFill(base, (s) => drawVein(s, 6, 20, PI * 0.7, 16, dark, { seed: 3, forks: 2, box: [3, 3, 29, 29] }));
//
// Angles use the rig convention of engine/motion.js: 0 = down, PI/2 = picture-right, PI = up.

import { Surface } from './surface.js';
import { INK } from './color.js';
import { hash, fract, clamp, lerp, TAU } from './motion.js';
import { TILE, drawSoftBlock, pieceOf } from './tiles.js';

const M = TILE - 1;
const wrap = (v) => ((Math.floor(v) % TILE) + TILE) % TILE;
const whole = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(v)));
// how far a side's outline is pulled in at u, as drawSoftBlock reads it: 0..8 px, pinned to the boundary at both ends
const pulledIn = (e, u, t) => { u = wrap(u); return e && e.inset ? Math.min(whole(e.inset(u, t), 0, 8), u, M - u) : 0; };

// ---- a wall of soft mass ---------------------------------------------------------------------------------

/** The rows of cap drawn over the face of a soft wall one tile deep (its strip pieces and the single tile): as drawBlock's walls. No arguments: a number. */
export const SOFT_WALL_SLIVER = 8;

// The pieces that are the wall's front face: which ends an outline closes, and the cap piece whose first rows lie over the face.
const WALL_FACES = {
  bottom: {}, 'bottom-l': { W: 1 }, 'bottom-r': { E: 1 }, 'col-b': { W: 1, E: 1 },
  'strip-l': { W: 1, cap: 'left' }, 'strip-m': { cap: 'top' }, 'strip-r': { E: 1, cap: 'right' }, single: { W: 1, E: 1, cap: 'col-t' },
};

/**
 * Draws one piece of a top-down wall of soft mass (hive growth, a hedge, a snow bank): the cap pieces as drawSoftBlock draws them, and the bottom row as a front face that ends in a foot line which may waver, with round foot corners.
 * Arguments: g: a 32x32 Surface. piece: a name from BLOCK_PIECES or NARROW_PIECES, or a whole clip name ('wall-bottom-l').
 * material: what drawSoftBlock takes (fill, top, left, right or side, ink, round: here 0..8), plus `face`:
 *   face.paint(x, y, t, up)   the face's colour at column x (0..31), y px below the face's first row; `up` is how many px
 *                             the pixel is above the foot line (1: the row resting on it). Null shows material.fill there
 *   face.foot(u, t)           0..6: how many px the foot line is lifted at column u; the same at u = 0 and u = 31 or
 *                             the foot shows a step where two tiles join. Left out: a level foot on row 29
 *   face.round                0..8: the radius in px of the foot's two outer corners (bottom-l, bottom-r, col-b, the ends of a strip)
 *   face.base                 the colour of the face's outline (default: material.ink, or the outline colour)
 *   face.shadow               the colour of the two rows under the foot line (the wall's shadow on the floor); left out: see-through
 * t: the clip phase, handed on. Returns g. Without `face` this is drawSoftBlock.
 * As with drawBlock's walls, the strip pieces and the single tile are the face under SOFT_WALL_SLIVER rows of cap, and the
 * two lower inner corners are drawn as the cap's side pieces, with the neighbouring face carried on behind their outline.
 */
export function drawSoftWall(g, piece, material, t = 0) {
  const name = pieceOf(piece)?.piece ?? piece;
  const face = material.face;
  if (!face) return drawSoftBlock(g, name, material, t);
  const mat = { ...material, round: Math.min(SOFT_WALL_SLIVER, Math.max(0, Number(material.round) || 0)) };
  const ink = material.ink === undefined ? INK : material.ink, line = face.base ?? ink ?? INK;
  const eL = material.left ?? material.side, eR = material.right ?? material.side;
  const R = whole(face.round ?? 0, 0, 8);
  const corner = (d) => (d < R ? Math.max(0, Math.round(R - Math.sqrt(Math.max(0, R * R - (R - d - 0.5) ** 2)))) : 0);
  const lift = (x) => whole(face.foot ? face.foot(wrap(x), t) : 0, 0, 6);
  const F = WALL_FACES[name];

  if (!F) {
    if (name !== 'inner-bl' && name !== 'inner-br') return drawSoftBlock(g, name, mat, t);
    // where the wall turns towards the camera the cap's edge runs on beside the face of the cell next door: that
    // face is carried on behind the cap's outline, down to its foot and its shadow
    const behind = (x, y) => {
      const foot = M - 2 - lift(x);
      return y < foot ? face.paint(x, y, t, foot - y) ?? material.fill(x, y, t, 0) : y === foot ? line : y <= foot + 2 ? face.shadow ?? null : null;
    };
    return drawSoftBlock(g, name === 'inner-bl' ? 'side-l' : 'side-r', { ...mat, outside: behind }, t);
  }

  const y0 = F.cap ? SOFT_WALL_SLIVER : 0;
  let cap = null;
  if (F.cap) {
    cap = new Surface(TILE, TILE);
    drawSoftBlock(cap, F.cap, mat, t);
    for (let y = 0; y < y0; y++) for (let x = 0; x < TILE; x++) { const v = cap.data[y * TILE + x]; if (v) g.dot(x, y, v); }
  }
  const footRow = (x) => M - 2 - lift(x) - (F.W ? corner(x) : 0) - (F.E ? corner(M - x) : 0);
  const solid = (x, y) => {
    if ((F.W && x < 0) || (F.E && x > M)) return false;
    if (y < y0) return !cap || x < 0 || x > M || cap.data[Math.max(0, y) * TILE + x] !== 0;      // more of the wall above, or the cap over the face
    if (F.W && x < pulledIn(eL, y, t)) return false;
    if (F.E && x > M - pulledIn(eR, y, t)) return false;
    return y <= footRow(x);
  };
  for (let x = 0; x < TILE; x++) {
    const foot = footRow(x);
    for (let y = y0; y <= foot; y++) {
      if (!solid(x, y)) continue;
      if (!solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y + 1) || !solid(x, y - 1)) { g.dot(x, y, line); continue; }
      g.dot(x, y, face.paint(x, y - y0, t, foot - y) ?? material.fill(x, y, t, 0));
    }
    if (face.shadow && solid(x, foot)) for (let y = foot + 1; y <= Math.min(M, foot + 2); y++) g.dot(x, y, face.shadow);
  }
  return g;
}

// ---- a puddle ------------------------------------------------------------------------------------------

/**
 * Shape test for a puddle seen from above: an ellipse whose edge is pushed out and in by waves running round it (a pool, a stain, a patch of moss, a scorch); move the waves' phases or sizes with the clip and the edge wobbles.
 * Arguments: cx, cy (its middle); rx, ry (its radii before the waves); waves ([[count, amount, phase], ...]: count is how many
 * bulges the wave makes round the edge, a whole number; amount is their height as a share of the radius, 0.1 for a tenth;
 * phase is 0..1, a whole turn of the wave round the edge; none gives a plain ellipse).
 * The edge never comes nearer the middle than a fifth of the radius, whatever the waves add up to.
 */
export function puddleIn(cx, cy, rx, ry, waves = []) {
  const list = (waves ?? []).map(([n, amount, phase = 0]) => [Math.round(n), amount, TAU * phase]);
  return (px, py) => {
    if (!(rx > 0) || !(ry > 0)) return false;
    const dx = (px - cx) / rx, dy = (py - cy) / ry, d = dx * dx + dy * dy;
    if (d > 4) return false;
    const a = Math.atan2(dy, dx);
    let k = 1;
    for (const [n, amount, ph] of list) k += amount * Math.sin(n * a + ph);
    k = Math.max(0.2, k);
    return d <= k * k;
  };
}

// ---- bubbles on a surface ------------------------------------------------------------------------------

/**
 * Works out where the bubbles of surfaceBubbles sit: `count` places inside a shape, spread so that none crowds another, the same every time; a longer list starts with the places of a shorter one.
 * Arguments: count (how many); inside (the shape test they must lie in); box ([x0, y0, x1, y1]: where to look); options { seed, tries (candidates looked at per place, default 24) }.
 * Returns [[x, y, h], ...]: whole-number pixel positions and a repeatable number 0..1 for varying each bubble. Fewer than `count` when the shape has no room.
 */
export function bubbleSpots(count, inside, box, { seed = 0, tries = 24 } = {}) {
  const out = [], [x0, y0, x1, y1] = box, n = Math.max(0, Math.round(count));
  for (let i = 0; i < n; i++) {
    let best = null, far = -1;
    for (let j = 0; j < tries; j++) {
      const x = Math.floor(lerp(x0, x1, hash(i * 131 + j, seed * 64 + 1))), y = Math.floor(lerp(y0, y1, hash(i * 131 + j, seed * 64 + 2)));
      if (!inside(x + 0.5, y + 0.5)) continue;
      let near = 1e9;
      for (const [bx, by] of out) near = Math.min(near, Math.hypot(x - bx, (y - by) * 1.5));
      if (near > far) { far = near; best = [x, y]; }
    }
    if (best) out.push([best[0], best[1], hash(i, seed * 64 + 9)]);
  }
  return out;
}

/**
 * Draws bubbles on a liquid seen from above: each swells from a speck to a dome with a glint, bursts into a ring of droplets and comes back in its own time (boiling acid, lava, tar, a cauldron, a swamp).
 * Arguments: g (the Surface); o { t (the clip phase; every bubble repeats `cycles` times a clip, so a loop closes), count (how many, default 5),
 * inside (the shape test they are placed in: give the liquid at rest, pulled in by the largest bubble, so they do not move when its edge does),
 * box ([x0, y0, x1, y1]: where to look for places; default the frame less 3 px), spots (places from bubbleSpots, in place of count, inside and box),
 * keep (a shape test: a bubble is drawn only while its middle is inside it, for a pool that shrinks), size (px: the radius of the biggest dome, default 2),
 * rim (the colour of a dome's edge: a dark tone of the liquid), body (the colour of the dome: a light tone of it), glint (the colour of the glint and of the droplets, default white),
 * seed, cycles (default 1) }.
 * A bubble is nothing for the first tenth of its life, a speck, then a growing dome whose edge is broken by a glint toward the light, then four droplets flung out, then nothing again. Returns the places used.
 */
export function surfaceBubbles(g, o) {
  const { t = 0, count = 5, keep = null, size = 2, rim = '#4fbd0d', body = '#e6ff76', glint = '#ffffff', seed = 0, cycles = 1 } = o;
  const box = o.box ?? [3, 3, g.w - 3, g.h - 3];
  const spots = o.spots ?? bubbleSpots(count, o.inside ?? (() => true), box, { seed });
  spots.forEach(([x, y, h], i) => {
    if (keep && !keep(x + 0.5, y + 0.5)) return;
    const life = fract(cycles * t + hash(i, seed * 64 + 5)), r = Math.max(1, Math.round(size * (0.6 + 0.4 * h)));
    if (life < 0.1) return;
    if (life < 0.25) { g.dot(x, y, body); return; }                                    // a speck
    if (life < 0.8) {
      // a dome that swells: its edge, its body and, once it is big enough, a glint on the side of the light
      const k = Math.min(r, Math.max(1, Math.round(lerp(0.6, r + 0.4, clamp((life - 0.25) / 0.4)))));
      if (k < 2) { g.dot(x, y, body); g.dot(x - 1, y, rim); g.dot(x, y + 1, rim); return; }      // a small one: a lit pixel with its shaded side
      g.ellipse(x + 0.5, y + 0.5, k + 0.4, k + 0.4, rim, { shade: 0 });
      g.ellipse(x + 0.5, y + 0.5, k - 0.6, k - 0.6, body, { shade: 0 });
      g.dot(x + k - 1, y - k + 1, glint);                                              // the glint breaks the edge on the side of the light
      return;
    }
    if (life < 0.92) {
      // burst: four droplets flung out, and the ring it leaves in the liquid
      const d = r + (life < 0.86 ? 0 : 1);
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const px = x + sx * d, py = y + sy * d; if (!keep || keep(px + 0.5, py + 0.5)) g.dot(px, py, glint); }
      g.dot(x, y, rim);
    }
  });
  return spots;
}

// ---- veins ---------------------------------------------------------------------------------------------

/**
 * Draws a vein one pixel wide that wanders smoothly from a point and forks into shorter side branches (a blood vessel, a root, a crack in ice, a river on a map), and returns the paths it drew.
 * Arguments: g (the Surface); x, y (where it starts); angle (the way it sets off: 0 = down, PI/2 = right, PI = up); length (px along the main line); colour;
 * options { seed (another seed, another vein), forks (how many side branches, default 2; they leave the main line on alternate sides), wander (how far it swings from its heading, radians, default 0.6),
 * spread (the angle a branch leaves at, radians, default 0.9), branch (a branch's length as a share of the main line's, default 0.5), box ([x0, y0, x1, y1]: a line stops where it would leave it; default the Surface) }.
 * Returns [[[x, y], ...], ...]: the pixels of the main line first, then of each branch, in the order drawn from its root. More forks never move the main line.
 */
export function drawVein(g, x, y, angle, length, colour, { seed = 0, forks = 2, wander = 0.6, spread = 0.9, branch = 0.5, box = null } = {}) {
  const B = box ?? [0, 0, g.w, g.h];
  const run = (sx, sy, a0, len, sd) => {
    const pts = [], heads = [];
    const f = 0.22 + 0.2 * hash(sd, 1), p1 = TAU * hash(sd, 2), p2 = TAU * hash(sd, 3);
    let px = sx, py = sy;
    for (let s = 0; s < len; s++) {
      const ix = Math.floor(px), iy = Math.floor(py);
      if (ix < B[0] || iy < B[1] || ix >= B[2] || iy >= B[3]) break;
      const a = a0 + wander * Math.min(1, s / 4) * (Math.sin(s * f + p1) + 0.5 * Math.sin(s * f * 2.3 + p2));      // it sets off straight, then swings either side of its heading
      const last = pts[pts.length - 1];
      if (!last || last[0] !== ix || last[1] !== iy) { pts.push([ix, iy]); heads.push(a); }
      const dx = Math.sin(a), dy = Math.cos(a), m = Math.max(Math.abs(dx), Math.abs(dy));
      px += dx / m; py += dy / m;
    }
    return { pts, heads };
  };
  const main = run(x + 0.5, y + 0.5, angle, Math.max(1, Math.round(length)), seed * 16 + 1);
  const paths = [main.pts], n = Math.max(0, Math.round(forks));
  for (let k = 0; k < n; k++) {
    const at = Math.min(main.pts.length - 1, Math.round(main.pts.length * (k + 1) / (n + 1.4)));
    if (at < 1) break;
    const side = (k + Math.round(hash(seed, 7))) % 2 ? 1 : -1;
    const from = main.pts[at], len = Math.max(2, Math.round(length * branch * (1 - 0.18 * k)));
    const twig = run(from[0] + 0.5, from[1] + 0.5, main.heads[at] + side * spread, len + 1, seed * 16 + 2 + k);
    paths.push(twig.pts.slice(1));
  }
  for (const path of paths) for (const [px, py] of path) g.dot(px, py, colour);
  return paths;
}

// ---- scalloped edges -----------------------------------------------------------------------------------

/**
 * Makes the profile of a scalloped edge that repeats every 32 px: a list of 32 whole numbers that is 0 along the crown of each round lobe and climbs to `deep` in the notch between two lobes; for an edge's inset or ragged, or a soft wall's foot.
 * Arguments: notches (the positions 0..31 of the notches along the edge; keep them 4 px or more from 0 and 31, so the profile is 0 where two tiles join); deep (px a notch is deep, default 2);
 * options { width (px from a notch's middle to where its side reaches 0, default 3), sharp (1 a straight-sided V, more a narrower cusp with rounder lobes; default 1.6) }.
 * Use it as `inset: (u) => profile[u]`. Distances wrap round the tile, so a notch near one end also shows at the other.
 */
export function scallops(notches, deep = 2, { width = 3, sharp = 1.6 } = {}) {
  const out = new Array(TILE).fill(0), w = Math.max(1, width) + 1;
  for (let u = 0; u < TILE; u++) for (const n of notches ?? []) {
    const d = Math.min(Math.abs(u - n), TILE - Math.abs(u - n));
    if (d < w) out[u] = Math.max(out[u], Math.round(deep * (1 - d / w) ** sharp));
  }
  return out;
}

// ---- veins that stand proud, pulses and pores (added in S12's fix round) -------------------------------

/**
 * Works out the pixels of a vein without drawing it: the paths drawVein would draw, for laying out several veins before any is drawn (drawVeins).
 * Arguments: x, y (where it starts); angle (the way it sets off: 0 = down, PI/2 = right, PI = up); length (px along the main line); options (drawVein's: seed, forks, wander, spread, branch, box; the box defaults to one 32 px tile).
 * Returns [[[x, y], ...], ...]: the main line first, then each branch.
 */
export function veinPaths(x, y, angle, length, options = {}) {
  return drawVein({ w: TILE, h: TILE, dot() {} }, x, y, angle, length, null, options);
}

/**
 * Draws veins that stand proud of a surface lit from the top right (veins in a membrane, roots, cables, the lips of a crack): each line in its colour, an unbroken line of shade beside it on the side away from the light, a wet glint every few pixels, and tips that fade into the surface.
 * Arguments: g (the Surface); veins (a list of veins, each the paths drawVein or veinPaths returns); colour (of the lines);
 * options { shade (the colour of the shade line; left out: none), dx, dy (where the shade lies from its line, default -1, 1: down and to the left), run (the shortest run of shade that is kept, in px, default 2: a shorter one would be a stray speck),
 * shine (the colour of the glints on each vein's main line; left out: none), shineEvery (px from one glint to the next, default 5), shineFrom (the first glint's place along the line, default 2),
 * tip (the colour of the last pixels of every line, where it thins into the surface; left out: none), tipLength (how many pixels, default 2; never more than half a line),
 * keep (a shape test: only pixels whose centre is inside are drawn), box ([x0, y0, x1, y1]: nothing is drawn outside; default the Surface) }.
 * Shade never lands on a line, its own or another vein's, so veins may cross. Returns g.
 */
export function drawVeins(g, veins, colour, { shade = null, dx = -1, dy = 1, run = 2, shine = null, shineEvery = 5, shineFrom = 2, tip = null, tipLength = 2, keep = null, box = null } = {}) {
  const B = box ?? [0, 0, g.w, g.h];
  const ok = (x, y) => x >= B[0] && y >= B[1] && x < B[2] && y < B[3] && (!keep || keep(x + 0.5, y + 0.5));
  const key = (x, y) => `${x},${y}`;
  const line = new Set();
  for (const paths of veins ?? []) for (const path of paths) for (const [x, y] of path) if (ok(x, y)) line.add(key(x, y));
  if (shade) {
    const cast = new Map();
    for (const paths of veins) for (const path of paths) for (const [x, y] of path) {
      const sx = x + dx, sy = y + dy;
      if (ok(x, y) && ok(sx, sy) && !line.has(key(sx, sy))) cast.set(key(sx, sy), [sx, sy]);
    }
    // the shade in runs of pixels that touch; a run shorter than `run` is left out
    const seen = new Set();
    for (const [k, start] of cast) {
      if (seen.has(k)) continue;
      const group = [], todo = [start];
      seen.add(k);
      while (todo.length) {
        const [x, y] = todo.pop();
        group.push([x, y]);
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const n = key(x + ox, y + oy); if (cast.has(n) && !seen.has(n)) { seen.add(n); todo.push(cast.get(n)); } }
      }
      if (group.length >= Math.max(1, run)) for (const [x, y] of group) g.dot(x, y, shade);
    }
  }
  const tipped = (path) => (tip ? Math.max(path.length - Math.max(0, Math.round(tipLength)), Math.ceil(path.length / 2)) : path.length);
  for (const paths of veins ?? []) for (const path of paths) { const from = tipped(path); path.forEach(([x, y], k) => { if (ok(x, y)) g.dot(x, y, k >= from ? tip : colour); }); }
  if (shine) for (const paths of veins ?? []) {
    const main = paths[0] ?? [], from = tipped(main), every = Math.max(1, Math.round(shineEvery));
    main.forEach(([x, y], k) => { if (k >= shineFrom && k < from && (k - shineFrom) % every === 0 && ok(x, y)) g.dot(x, y, shine); });
  }
  return g;
}

/**
 * Lights a short run of pixels at one place along a vein's main line: move the place with the clip and a pulse travels down it (a heartbeat in a vessel, a signal along a cable, a spark along a fuse).
 * Arguments: g (the Surface); paths (one vein, as drawVein or veinPaths returns it); at (how many px along the main line the head of the run is; a fraction is rounded); colours ([head, the pixel behind it, ...]: one colour per pixel of the run);
 * options { from (no pixel nearer the root than this place is lit, default 0: for a root hidden under something), keep (a shape test: only pixels whose centre is inside are lit) }.
 * Returns how many pixels it lit: 0 once the whole run has left the line.
 */
export function drawVeinPulse(g, paths, at, colours, { from = 0, keep = null } = {}) {
  const main = paths?.[0] ?? [], head = Math.round(at);
  let lit = 0;
  (colours ?? []).forEach((colour, i) => {
    const k = head - i;
    if (k < Math.max(0, from) || k >= main.length || !colour) return;
    const [x, y] = main[k];
    if (keep && !keep(x + 0.5, y + 0.5)) return;
    g.dot(x, y, colour);
    lit++;
  });
  return lit;
}

/**
 * Draws a pore or small pit in a soft surface lit from the top right: a cluster of dark pixels that touch (never fewer than three, so it does not read as a stray speck) with a lit lip against its lower left side.
 * Arguments: g (the Surface); x, y (the top left pixel of the pit's square); dark (the colour of the pit); lit (the colour of the lip; left out: no lip); options { size (2 or 3: px across the pit, default 2) }.
 * The lip lies one row below the pit and one column to its left, so the whole mark is size + 1 px each way. Returns g.
 */
export function drawPore(g, x, y, dark, lit = null, { size = 2 } = {}) {
  if (size >= 3) {
    g.rect(x + 1, y, 2, 1, dark); g.rect(x, y + 1, 3, 1, dark); g.rect(x, y + 2, 2, 1, dark);
    if (lit) { g.dot(x - 1, y + 2, lit); g.rect(x, y + 3, 2, 1, lit); }
    return g;
  }
  g.rect(x, y, 2, 1, dark); g.dot(x + 1, y + 1, dark);
  if (lit) { g.dot(x, y + 1, lit); g.rect(x, y + 2, 2, 1, lit); }
  return g;
}
