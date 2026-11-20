// PORT (migration batch C3): a copy of engine/rock.js with its imports pointed at the port shims (engine/gen/ports/colour.js,
// engine/gen/ports/c3/surface.js) and the other port copies (engine/gen/ports/e2/, engine/gen/ports/c3/), so it draws paint refs on
// engine/gen/port-surface.js grids. It is the drawing code of migration batch C3's robot ports (engine/gen/robots.js), so it
// is NOT temporary: it stays when engine/rock.js goes and goes only with the last generator version that draws with it. A HAND
// CHANGE note below says where it differs from its source; never change what a released generator version draws through it.
// Stone helpers that go with the boulder painter rock() in engine/fx.js: the dark seam between
// stacked stones, the layer that lies on top of a shape (moss, snow, icing, slime), and cracks.
// For anything built from several stones or with something growing on it: golems, rubble, ruins,
// statues, snowy roofs. Pure functions of their arguments: no Math.random, the same seed always
// gives the same result.
//
//   import { rock } from '../engine/fx.js';
//   import { seam, capIn, crack } from '../engine/rock.js';
//   const stone = ramp(p.stone);
//   const chest = rock(g, { x: 48, y: 54, r: 15, squash: 0.9, colour: p.stone, seed: 3 });   // a boulder; returns its shape test
//   const shoulder = rock(g, { x: 44, y: 44, r: 8, colour: p.stone, seed: 4 });              // a second one stacked on it
//   seam(g, shoulder, stone.deep);                                             // the dark line where it sits on the first
//   crack(g, 50, 50, 0.4, 8, stone.deep, { seed: 2, clip: chest });            // a long crack that stays on the first boulder
//   const moss = capIn(shoulder, [36, 34, 52, 44], { depth: 3, rise: 1, ragged: 2 });
//   g.fill(34, 32, 54, 46, moss, ramp(p.growthColour));                        // moss lying on top of the shoulder
//
// crack() uses the rig convention for its direction: 0 = down, PI/2 = right, PI = up.

import { hash } from '../../../motion.js';
// HAND CHANGE (C3): engine/color.js col packs a colour into a pixel's number; on a paint-ref grid a pixel's number is
// its paint ref's cell in the grid's table, so col(c) below is g.table.id(c) (the same pixel, its paint kept).

/**
 * Darkens the already-drawn pixels that touch a shape from outside: the contact line between a thing and what it is stacked on or stuck to (stacked stones, armour plates, scales), so the two read as separate pieces.
 * Arguments: g (the Surface), inside (the shape test of the thing on top, drawn already or about to be), colour (the seam's colour, usually the material's deep tone), options { box ([x0, y0, x1, y1] to look in; default the whole Surface), clip (extra test limiting where the seam may land) }.
 */
export function seam(g, inside, colour, { box, clip } = {}) {
  const x0 = Math.max(0, Math.floor(box ? box[0] : 0)), y0 = Math.max(0, Math.floor(box ? box[1] : 0));
  const x1 = Math.min(g.w - 1, Math.ceil(box ? box[2] : g.w - 1)), y1 = Math.min(g.h - 1, Math.ceil(box ? box[3] : g.h - 1));
  const cc = g.table.id(colour);
  const hits = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!g.data[y * g.w + x]) continue;
    const px = x + 0.5, py = y + 0.5;
    if (inside(px, py) || (clip && !clip(px, py))) continue;
    if (inside(px + 1, py) || inside(px - 1, py) || inside(px, py + 1) || inside(px, py - 1)) hits.push(y * g.w + x);
  }
  for (const i of hits) g.data[i] = cc;
  return g;
}

/**
 * Shape test for the layer lying on top of a shape (moss, snow, icing, slime): the top `depth` px of `inside` in each column, with a ragged lower edge and lumps that rise above it.
 * Arguments: inside (the shape test it lies on), box ([x0, y0, x1, y1]: only columns x0..x1 whose top edge is between y0 and y1 are covered), options { depth (px into the shape, default 3), rise (px the lumps stand above the top edge, default 1), ragged (extra px the lower edge hangs down in places, default 2), seed }.
 */
export function capIn(inside, box, { depth = 3, rise = 1, ragged = 2, seed = 0 } = {}) {
  const x0 = Math.floor(box[0]), y0 = Math.floor(box[1]), x1 = Math.ceil(box[2]), y1 = Math.ceil(box[3]);
  const tops = new Map();
  const topOf = (cx) => {
    let t = tops.get(cx);
    if (t === undefined) {
      t = Infinity;
      for (let y = y0; y <= y1; y++) if (inside(cx + 0.5, y + 0.5)) { t = y; break; }
      tops.set(cx, t);
    }
    return t;
  };
  return (px, py) => {
    const cx = Math.floor(px), cy = Math.floor(py);
    if (cx < x0 || cx > x1) return false;
    const t = topOf(cx);
    if (t === Infinity) return false;
    const d = cy - t;
    if (d < 0) return rise > 0 && -d <= Math.round(rise * hash(Math.floor(cx / 3), seed * 17 + 5) + 0.15);
    const hang = Math.round(ragged * hash(Math.floor((cx + 1) / 2), seed * 17 + 9) ** 1.5);
    return d < depth + hang && inside(px, py);
  };
}

/**
 * Draws a jagged crack one pixel wide from (x, y), with a short side branch on long ones.
 * Arguments: g (the Surface), x, y (where it starts), angle (the way it runs: 0 = down, PI/2 = right, PI = up), length (px), colour, options { seed, clip (shape test it must stay inside), jag (how far it zigzags, radians, default 0.7), branch (false = no side branch) }.
 */
export function crack(g, x, y, angle, length, colour, { seed = 0, clip, jag = 0.7, branch = true } = {}) {
  const put = (px, py) => {
    const ix = Math.floor(px), iy = Math.floor(py);
    if (ix < 0 || iy < 0 || ix >= g.w || iy >= g.h) return;
    if (clip && !clip(ix + 0.5, iy + 0.5)) return;
    g.dot(ix, iy, colour);
  };
  const run = (sx, sy, a0, len, sd) => {
    let px = sx, py = sy, done = 0, i = 0, fork = null;
    while (done < len) {
      const seg = Math.min(len - done, 2 + Math.floor(hash(i, sd * 13 + 1) * 3));
      const a = a0 + (i % 2 ? 1 : -1) * jag * (0.5 + 0.5 * hash(i, sd * 13 + 2));
      const dx = Math.sin(a), dy = Math.cos(a), m = Math.max(Math.abs(dx), Math.abs(dy));
      const n = Math.max(1, Math.round(seg * m));
      for (let s = 0; s < n; s++) { put(px, py); px += dx / m; py += dy / m; }
      done += seg;
      if (!fork && done >= len * 0.45) fork = [px, py, a0 + (i % 2 ? -1 : 1) * 1.1];
      i++;
    }
    put(px, py);
    return fork;
  };
  const fork = run(x + 0.5, y + 0.5, angle, length, seed);
  if (branch && fork && length >= 7) run(fork[0], fork[1], fork[2], Math.max(2, Math.round(length * 0.35)), seed + 101);
  return g;
}
