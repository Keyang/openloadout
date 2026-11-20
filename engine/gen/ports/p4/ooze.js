// PORT (migration batch P4): the puddle and surface-bubble helpers of engine/ooze.js (puddleIn, bubbleSpots,
// surfaceBubbles), copied word for word with their imports pointed at the site's engine/motion.js from here, so they draw
// paint refs on engine/gen/port-surface.js grids (they only call g.dot and g.ellipse). It is the drawing code of the P4
// acid pool (engine/gen/world-p4.js pool.acid@1), so it is NOT temporary: it stays when engine/ooze.js goes and goes only
// with the last generator version that draws with it. HAND CHANGE (P4): only this part of engine/ooze.js is copied (the
// soft walls and veins are not the pool's); never change what a released generator version draws through it.
import { hash, fract, clamp, lerp, TAU } from '../../../motion.js';

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

