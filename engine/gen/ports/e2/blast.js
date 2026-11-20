// PORT (migration batch E2): a copy of engine/blast.js with its imports pointed at the port shims (engine/gen/ports/colour.js,
// engine/gen/ports/e2/surface.js), so it draws paint refs on engine/gen/port-surface.js grids. It is the drawing code of migration batch E2's
// effect behaviours (engine/gen/fx-e2.js), so it is NOT temporary: it stays when engine/blast.js goes and goes only with the last
// generator version that draws with it. A HAND CHANGE note below says where it differs from its source; never change what
// a released generator version draws through it.
// Blast helpers: the two shapes a gun flash and an explosion need that engine/fx.js does not have
// (docs/style-guide.md sections 4 and 14). Spikes fanned inside a cone, the middle one the longest
// (the prongs of a muzzle flash, a spray, the drops of a splash), and a fireball of overlapping
// lobes in nested tones that can tear open from its middle into a ring. Pure functions: no
// Math.random, the same seed always gives the same shape. Everything else a blast is made of
// (glow, ring, particles, shards, puffs, starburst) is in engine/fx.js.
//
//   import { spikesIn, fireballIn, fireball } from '../engine/blast.js';
//   g.fill(1, 1, 31, 31, spikesIn(8.5, 15.5, { count: 3, r1: 18, width: 5 }), '#ffffff', { outline: p.edge });   // a muzzle flash
//   fireball(g, { x: 48, y: 48, r: 36, lobes: 6, boil: t, colours: steps(p.edge, { core: p.core, white: false }) });   // the body of an explosion
//   fireball(g, { x: 48, y: 48, r: 40, lobes: 6, hole: 22, band: 5, colours: [mid, edge, rim] });                      // later: torn open into a ring
//
// Angles use the rig convention: 0 = down, PI / 2 = right, PI = up. These draw light, so draw them
// AFTER g.outline(INK): a fireball is rimmed with the last colour of its list, never with ink.
// Both suit the pixel style: they are shape tests of pixel centres, painted through g.fill.

import { steps } from './fx.js';
import { leafIn } from './creature.js';
import { hash, clamp, lerp, PI, TAU } from '../../../motion.js';

/**
 * Shape test for spikes fanned inside a cone from a point, the middle one the longest: the prongs of a muzzle flash, a spray, the drops of a splash, a crest of spines; returns inside(px, py).
 * Arguments: x, y (the point; end both in .5 for spikes that are the same on both sides of the middle one); options { count (how many spikes), angle (the way the middle one points: 0 down, PI / 2 right, PI up), arc (the angle from the first spike to the last, radians; with TAU * (count - 1) / count and short 1 they go all round), r0, r1 (px from the point to the start and to the tip of the middle spike), short (0..1: how long the outermost spikes are as a share of the middle one, default 0.6), width (px across a spike at its widest), belly (where it is widest: 0 at its start .. 1 at its tip; default 0.3, a sharp kite; 0.7 a petal or a drop), blunt (its width at the start as a share of the widest, default 0: a point), hair (true, the default: a spike thinner than a pixel is still an unbroken line one pixel wide) }.
 */
export function spikesIn(x, y, { count = 3, angle = PI / 2, arc = PI / 2, r0 = 0, r1 = 10, short = 0.6, width = 3, belly = 0.3, blunt = 0, hair = true } = {}) {
  const n = Math.max(1, Math.round(count)), spikes = [];
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;                   // -1 .. 1 across the fan
    const a = angle + (u * arc) / 2, len = (r1 - r0) * lerp(1, clamp(short), Math.abs(u));
    if (len <= 0) continue;
    const ux = Math.sin(a), uy = Math.cos(a);
    const ax = x + ux * r0, ay = y + uy * r0, tx = ax + ux * len, ty = ay + uy * len;
    spikes.push({ ax, ay, ux, uy, len, flat: Math.abs(ux) >= Math.abs(uy), body: leafIn(ax, ay, tx, ty, width, { belly, blunt }) });
  }
  return (px, py) => {
    for (const S of spikes) {
      if (S.body(px, py)) return true;
      if (!hair) continue;
      // the spine: exactly one pixel for every step along the spike's longer direction
      const dx = px - S.ax, dy = py - S.ay, along = dx * S.ux + dy * S.uy;
      if (along < 0 || along > S.len - 0.25) continue;
      if (S.flat ? Math.floor(py) === Math.floor(S.ay + (dx * S.uy) / S.ux) : Math.floor(px) === Math.floor(S.ax + (dy * S.ux) / S.uy)) return true;
    }
    return false;
  };
}

/** The discs a fireball is made of, [[x, y, r], ...]: one in the middle and one for each lobe (big and small in turn, unevenly spaced), none reaching past r from the centre. */
function fireballDiscs(x, y, r, lobes, seed, boil, bulge, turn) {
  const n = Math.max(3, Math.min(12, Math.round(lobes))), b = clamp(bulge);
  const top = r * lerp(0.3, 0.5, b);                                 // the radius of the biggest lobe
  const discs = [[x, y, r * lerp(0.97, 0.52, b)]];                   // the middle: nearly the whole ball when the lobes barely stand out
  const first = Math.floor(hash(seed, 9) * n);                       // which lobe is the one that reaches r
  for (let i = 0; i < n; i++) {
    const a = turn + (TAU * (i + 0.8 * (hash(i, seed * 64 + 1) - 0.5))) / n;
    const lr = top * (0.5 + 0.5 * hash(i, seed * 64 + 2)) * (0.88 + 0.12 * Math.sin(TAU * (boil + hash(i, seed * 64 + 3))));
    const reach = r * (i === first ? 1 : 1 - 0.2 * b * hash(i, seed * 64 + 4));     // how far this lobe gets from the centre
    discs.push([x + Math.sin(a) * (reach - lr), y + Math.cos(a) * (reach - lr), lr]);
  }
  return discs;
}

/**
 * Shape test for a fireball: a round middle with lobes bulging out of it all round, and an optional ragged hole torn in its middle that turns it into a ring and then into loose clumps; returns inside(px, py, inset).
 * Arguments: o: { x, y (the centre), r (px: no part reaches further than this), lobes (how many bulges, 3 to 12, default 6), seed (another seed, another fireball), boil (0..1: the lobes swell and sink in turn; a whole number closes a loop), bulge (0..1: how far the lobes stand out, default 0.6; 0 is nearly a disc), turn (radians: turns the lobes round the centre), hole (px: how far the hole in the middle reaches, default 0: none; at 1.4 r and more nothing is left) }. The test takes a third argument, inset (px, default 0): the same shape shrunk towards its centre by that much at its longest lobe, and the hole grown by as much, for a tone nested inside it.
 */
export function fireballIn(o) {
  const { x, y, r = 10, lobes = 6, seed = 0, boil = 0, bulge = 0.6, turn = 0, hole = 0 } = o;
  if (!(r > 0)) return () => false;
  const body = fireballDiscs(x, y, r, lobes, seed, boil, bulge, turn);
  // the hole: the same kind of lumpy shape, turned half a lobe so its tears run out between the lobes
  const gap = hole > 0 ? fireballDiscs(x, y, hole, lobes, seed + 17, boil + 0.5, 0.5, turn + PI / Math.max(3, Math.round(lobes))) : [];
  const inBody = (px, py) => { for (const [bx, by, br] of body) if ((px - bx) ** 2 + (py - by) ** 2 <= br * br) return true; return false; };
  return (px, py, inset = 0) => {
    for (const [hx, hy, hr] of gap) if ((px - hx) ** 2 + (py - hy) ** 2 < (hr + inset) ** 2) return false;
    if (!inBody(px, py)) return false;
    if (inset <= 0) return true;
    // shrunk towards the centre, so an inner tone keeps the lobes of the outline and stays joined to the middle
    const k = 1 - inset / r;
    return k > 0 && inBody(x + (px - x) / k, y + (py - y) / k);
  };
}

/**
 * Paints a fireball in nested tones: the lobed body of fireballIn in its outer colour with a rim, then each hotter colour one band further in, so the hottest sits in the middle of the body (or of the ring, once a hole is torn).
 * Arguments: g (the Surface); o: { x, y, r, lobes, seed, boil, bulge, turn, hole (all as fireballIn), band (px between one tone and the next, default r / 5, at least 1.5: a thin band is a hot ball, a wide one has cooled to its outer colour), lift ([dx, dy] px each inner tone is moved, default [0, 0]: [1, -1] puts the heat towards the top right), colours (hottest first, the last is the rim, as steps() gives them) | colour (one colour, turned into steps(colour, { white: false })), box }.
 */
export function fireball(g, o) {
  const { x, y, r = 10, lift = [0, 0] } = o;
  if (!(r > 0)) return;
  const C = Array.isArray(o.colours) && o.colours.length ? o.colours : steps(o.colour ?? '#f2a030', { white: false });
  const tones = C.length > 1 ? C.slice(0, -1) : C, rim = C.length > 1 ? C[C.length - 1] : null;
  const band = Math.max(1.5, o.band ?? r / 5);
  const B = [1, 1, g.w - 1, g.h - 1];
  if (o.box) { B[0] = Math.max(B[0], Math.floor(o.box[0])); B[1] = Math.max(B[1], Math.floor(o.box[1])); B[2] = Math.min(B[2], Math.floor(o.box[2])); B[3] = Math.min(B[3], Math.floor(o.box[3])); }
  // work on a grid of the pixels the ball can reach (and one more all round for the rim), so each tone is tested once per pixel
  const x0 = Math.max(B[0], Math.floor(x - r) - 1), y0 = Math.max(B[1], Math.floor(y - r) - 1);
  const x1 = Math.min(B[2], Math.ceil(x + r) + 1), y1 = Math.min(B[3], Math.ceil(y + r) + 1);
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return;
  const inside = fireballIn(o);
  const clip = (px, py) => px >= x0 && py >= y0 && px < x1 && py < y1;
  let prev = null;
  for (let k = 0; k < tones.length; k++) {
    const m = new Uint8Array(w * h), was = prev;
    const on = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && was[yy * w + xx] === 1;
    let any = false;
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      // an inner tone always has the tone round it on all four sides, so no tone is ever skipped at an edge
      if (was && !(on(xx, yy) && on(xx - 1, yy) && on(xx + 1, yy) && on(xx, yy - 1) && on(xx, yy + 1))) continue;
      if (inside(x0 + xx + 0.5 - lift[0] * k, y0 + yy + 0.5 - lift[1] * k, band * k)) { m[yy * w + xx] = 1; any = true; }
    }
    if (!any) break;
    const test = (px, py) => { const xx = Math.floor(px) - x0, yy = Math.floor(py) - y0; return xx >= 0 && yy >= 0 && xx < w && yy < h && m[yy * w + xx] === 1; };
    g.fill(x0, y0, x1 - 1, y1 - 1, test, tones[tones.length - 1 - k], { shade: 0, clip, ...(k === 0 && rim ? { outline: rim } : {}) });
    prev = m;
  }
}
