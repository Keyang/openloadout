// PORT (migration batch C2): a copy of engine/hive.js with its imports pointed at the port shims (engine/gen/ports/c2/colour.js,
// engine/gen/ports/surface.js and migration batch E2's copies in engine/gen/ports/e2/), so it draws paint refs on
// engine/gen/port-surface.js grids. It is the drawing code of migration batch C2's creature generators
// (engine/gen/creatures.js), so it is NOT temporary: it stays when engine/hive.js goes and goes only with the last generator
// version that draws with it. A HAND CHANGE note says where it differs from its source; never change what a released
// generator version draws through it.
// Hive shapes: what swollen, studded, frilled bodies are built from (a brood queen, an egg cluster, a spore pod, a
// warty toad, a barnacled rock). The layout and shape functions are pure and return numbers or inside(px, py)
// tests for g.fill / g.blob; blister() is the one function that draws. Node and browser, no Math.random.
//
//   import { discSpots, segmentRingsIn, antlerIn, frillIn, blister } from '../engine/hive.js';
//   const spots = discSpots(9, { seed: 2 });                                    // [[u, v, h], ...] spread over a round body
//   g.ellipse(48, 44, 26, 22, skin, { shade: 2 });                              // the body
//   g.fill(0, 0, g.w, g.h, segmentRingsIn(48, 44, 26, 22, [0.45, 0.7, 0.9]), skin.dark);     // the furrows between its segments
//   for (const [u, v, h] of spots) blister(g, 48 + u * 24, 44 + v * 20, 3 + h, { skin: P.flesh, core: P.acid, under: skin.dark });
//   const veil = frillIn(48, 44, 26, 22, 8);                                    // a scalloped frill behind the body
//   g.blob([antlerIn(52, 70, PI - 0.9, 14, { curl: 0.7, spread: -1.1 })], bone);              // a branching horn
//
// Angles use the rig convention of engine/motion.js: 0 = down, PI/2 = picture-right, PI = up.

import { clamp, lerp, hash, easeOut, PI, TAU } from '../../../motion.js';
import { ramp, tone } from './colour.js';
import { polyIn } from '../surface.js';
import { hornIn, hornPath } from '../e2/creature.js';

/**
 * Spreads spots evenly over a round surface: each new spot goes where it is furthest from the ones already there, so sacs, warts, rivets or eyes never bunch up.
 * Arguments: count (how many); options { seed, reach (how far from the middle a spot may sit, as a share of the radius; default 0.85), fixed ([[u, v], ...]: spots that are placed first, exactly as given), keepOut ((u, v) => true where no spot may sit, for example under a head), tries (candidates looked at per spot, default 24) }.
 * Returns [[u, v, h], ...]: u and v are shares of the surface's two radii (-1..1, v grows downward), h is a repeatable number 0..1 for varying each spot. A longer list starts with the same spots as a shorter one, so a slider that adds spots leaves the others where they were.
 */
export function discSpots(count, { seed = 0, reach = 0.85, fixed = [], keepOut = null, tries = 24 } = {}) {
  const n = Math.max(0, Math.round(count));
  const out = fixed.slice(0, n).map(([u, v], i) => [u, v, hash(i, seed * 64 + 9)]);
  for (let i = out.length; i < n; i++) {
    let best = [0, 0], far = -1;
    for (let j = 0; j < tries; j++) {
      const a = TAU * hash(i * 131 + j, seed * 64 + 1), r = reach * Math.sqrt(hash(i * 131 + j, seed * 64 + 2));
      const u = Math.sin(a) * r, v = Math.cos(a) * r;
      if (keepOut && keepOut(u, v)) continue;
      let near = Infinity;
      for (const [x, y] of out) near = Math.min(near, Math.hypot(u - x, v - y));
      if (near > far) { far = near; best = [u, v]; }
    }
    out.push([best[0], best[1], hash(i, seed * 64 + 9)]);
  }
  return out;
}

/**
 * Shape test for the furrows between the segments of a swollen body seen from beyond its far end: thin rings, each a smaller copy of the body's outline hanging from the same top point, so they crowd together toward the tip.
 * Arguments: cx, cy, rx, ry (the body, an ellipse); shares (the size of each ring as a share of the body, each 0..1); options { thick (pixels across a furrow, default 1), from (how much of the top of each ring is left out, as a share of its height, so the furrows do not pile up at the tip; default 0.3) }.
 * Paint it over the body in the body's dark tone.
 */
export function segmentRingsIn(cx, cy, rx, ry, shares, { thick = 1, from = 0.3 } = {}) {
  const top = cy - ry;
  const rings = [...shares].map((f) => ({ y: top + ry * f, rx: rx * f, ry: ry * f, cut: top + 2 * ry * f * from }));
  return (px, py) => {
    for (const R of rings) {
      if (py < R.cut || R.rx <= 0 || R.ry <= 0) continue;
      const x = px - cx, y = py - R.y;
      if ((x / R.rx) ** 2 + (y / R.ry) ** 2 > 1) continue;
      const ix = R.rx - thick, iy = R.ry - thick;
      if (ix <= 0 || iy <= 0 || (x / ix) ** 2 + (y / iy) ** 2 > 1) return true;
    }
    return false;
  };
}

/**
 * Shape test for an antler: a curved main beam that tapers to a point, with shorter tines branching off one side of it, as on a stag, a beetle or a thorn bush.
 * Arguments: x, y (the root); angle (the way the beam sets off: 0 = down, PI/2 = picture-right, PI = up); length (pixels along the beam); options { curl (radians the beam turns in all, as hornPath()), width (pixels across at the root, default 3), tip (pixels across at every point, default 0.9), tines (how many, default 2), spread (radians a tine sets off away from the beam; its sign picks the side; default 1), tineLength (the first tine's length as a share of the beam's, default 0.4), steps (straight pieces of the beam, default 5) }.
 */
export function antlerIn(x, y, angle, length, { curl = 0, width = 3, tip = 0.9, tines = 2, spread = 1, tineLength = 0.4, steps = 5 } = {}) {
  const n = Math.max(1, Math.round(steps)), path = hornPath(x, y, angle, length, { curl, steps: n });
  const tests = [hornIn(x, y, angle, length, { curl, steps: n, width, tip })];
  const count = Math.max(0, Math.round(tines));
  for (let i = 0; i < count; i++) {
    const share = (i + 1) / (count + 1.2), at = share * n, j = Math.min(n - 1, Math.floor(at)), f = at - j;
    const bx = lerp(path[j][0], path[j + 1][0], f), by = lerp(path[j][1], path[j + 1][1], f);
    tests.push(hornIn(bx, by, angle + curl * share + spread, length * tineLength * (1 - 0.25 * i), { curl: -spread * 0.45, steps: 3, width: Math.max(tip, lerp(width, tip, share) * 0.9), tip }));
  }
  return (px, py) => { for (const t of tests) if (t(px, py)) return true; return false; };
}

/**
 * A scalloped frill standing out round an ellipse: ribs fanned along part of its rim with skin stretched between their tips: a veil of wing skin behind a body, a collar, a fin crest, a ruff, the petals round a flower head.
 * Arguments: cx, cy, rx, ry (the ellipse it stands round); reach (pixels the middle rib stands out beyond the rim); options { from, to (the angles of the first and last rib round the ellipse: 0 = its bottom, PI/2 = its right, PI = its top; default PI - 2 and PI + 2), ribs (how many, default 9), scoop (0 a smooth edge .. 1 the skin dips back to the rim between ribs; default 0.5), taper (0..1: how much shorter the first and last ribs are than the middle one, default 0.4), ripple ((i) => pixels added to rib i's reach, to make it wave) }.
 * Returns { inside (the shape test: the frill and everything it encloses, so paint the body over it), tips ([[x, y], ...], one per rib), roots ([[x, y], ...]: where each rib leaves the rim) }.
 */
export function frillIn(cx, cy, rx, ry, reach, { from = PI - 2, to = PI + 2, ribs = 9, scoop = 0.5, taper = 0.4, ripple = null } = {}) {
  const n = Math.max(2, Math.round(ribs)), tips = [], roots = [], edge = [];
  const at = (a, out) => [cx + Math.sin(a) * (rx + out), cy + Math.cos(a) * (ry + out)];
  const outAt = (u) => reach * (1 - clamp(taper) * (2 * u - 1) ** 2);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), a = lerp(from, to, u), out = Math.max(0, outAt(u) + (ripple ? ripple(i) : 0));
    tips.push(at(a, out)); roots.push(at(a, 0));
    edge.push(tips[i]);
    if (i < n - 1) { const um = (i + 0.5) / (n - 1); edge.push(at(lerp(from, to, um), outAt(um) * (1 - clamp(scoop)))); }
  }
  const hull = polyIn([...edge, [cx, cy]]);
  const body = (px, py) => ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1;
  return { inside: (px, py) => hull(px, py) || (body(px, py) && inFan(px - cx, py - cy, from, to)), tips, roots };
}

// Is the direction (dx, dy) between the angles a0 and a1 (rig convention), going round the way the ribs do?
function inFan(dx, dy, a0, a1) {
  const lo = Math.min(a0, a1), span = Math.abs(a1 - a0);
  if (span >= TAU) return true;
  const a = Math.atan2(dx, dy) - lo;
  return ((a % TAU) + TAU) % TAU <= span;
}

/**
 * Draws an egg sac, blister, pustule or pod sitting on a surface: a small dome of skin with something lit showing through it, a line of shade where it meets the surface, and, once burst, a dark hole with a torn rim.
 * Arguments: g (the Surface); x, y (its middle); r (its radius in pixels); options { skin (the colour of the dome, or a ramp), core (the colour of what glows inside; null for a plain dome), level (how brightly the core burns: 0 dark, 1 lit, 2 flaring to white; default 1), under (the colour of the line of shade beside it, away from the light; default none), squash (its height as a share of its width, default 0.9), open (true: burst, a hole in place of the core) }.
 * Draw it BEFORE g.outline(): it is part of the body it sits on. It never reads pixels back.
 */
export function blister(g, x, y, r, { skin = '#b04a8a', core = '#9fe040', level = 1, under = null, squash = 0.9, open = false } = {}) {
  const S = typeof skin === 'object' ? skin : ramp(skin), ry = r * squash;
  if (r < 0.75) { g.dot(x, y, S.base); return g; }
  if (under) g.ellipse(x + g.shadow[0], y + g.shadow[1], r, ry, under, { shade: 0 });
  g.ellipse(x, y, r, ry, S, { shade: r >= 2.5 ? 1 : 0 });
  if (open) {
    // the hole, and a lit lip on the side of the light
    const deep = S.deep ?? S.dark;
    if (r >= 2) { g.ellipse(x, y, r - 1, Math.max(0.8, ry - 1), deep, { shade: 0 }); g.dot(x - g.shadow[0] * (r - 1), y - g.shadow[1] * (ry - 1), S.light); }
    return g;
  }
  if (!core) return g;
  const C = ramp(core), n = Math.max(1, Math.round(r * 0.62));
  const x0 = Math.round(x - n / 2 + 0.2), y0 = Math.round(y - n / 2 - 0.2);
  const lv = level >= 1.5 ? 2 : level >= 0.75 ? 1 : level >= 0.25 ? 0.5 : 0;
  const body = lv === 2 ? C.light : lv === 1 ? C.base : lv === 0.5 ? C.dark : (C.deep ?? C.dark);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (n >= 3 && (i === 0 || i === n - 1) && (j === 0 || j === n - 1)) continue;        // a round core, not a square one
    g.dot(x0 + i, y0 + j, body);
  }
  // the glint, toward the light; a flaring core is white-hot in the middle
  if (lv === 2) { if (n >= 3) g.rect(x0 + 1, y0 + 1, n - 2, n - 2, '#ffffff'); else g.dot(x0 + n - 1, y0, '#ffffff'); }
  else if (lv === 1 && n >= 2) g.dot(x0 + n - 1 - (n >= 3 ? 1 : 0), y0 + (n >= 3 ? 1 : 0), C.light);
  return g;
}

/**
 * Draws a fan of liquid sprayed from a point: jets that shoot out one after another, let go of the mouth, thin as they fly and end as single drops (acid, venom, water from a hose, sparks from a grinder).
 * Arguments: g (the Surface); o { t (0..1 over the spray), x, y (the mouth), angle (the middle of the fan: 0 = down, PI/2 = right, PI = up), arc (the width of the fan in radians, default 1.2), reach (pixels the longest jet travels, default 18), jets (how many, default 5), width (pixels across the head of a jet, default 3), seed, colour (of the liquid) or colours (a list, hottest first, the last one the rim, as steps() gives), box ([x0, y0, x1, y1] nothing is drawn outside; default the frame less its 1 px border) }.
 * Draw it AFTER g.outline(): it is rimmed with its own dark tone, not with ink. At t = 1 every jet is one rim-coloured pixel, so the frame is never empty.
 */
export function sprayFan(g, o) {
  const { t = 0, x, y, angle = 0, arc = 1.2, reach = 18, jets = 5, width = 3, seed = 0 } = o;
  const C = Array.isArray(o.colours) && o.colours.length ? o.colours : [tone(o.colour ?? '#9fe040', 1.4), o.colour ?? '#9fe040', tone(o.colour ?? '#9fe040', -1)];
  const B = o.box ?? [1, 1, g.w - 1, g.h - 1];
  const clip = (px, py) => px >= B[0] && py >= B[1] && px < B[2] && py < B[3];
  const hold = (v, lo, hi) => Math.min(Math.max(v, lo + 0.5), hi - 0.5);
  const n = Math.max(1, Math.round(jets)), rim = C[C.length - 1], body = C[Math.max(0, C.length - 2)], hot = C[Math.min(1, C.length - 1)];
  const list = [];
  for (let i = 0; i < n; i++) {
    const a = angle + arc * ((i + 0.5) / n - 0.5) + ((hash(i, seed * 64 + 1) - 0.5) * arc * 0.3) / n;
    const delay = 0.3 * hash(i, seed * 64 + 2), u = clamp((clamp(t) - delay) / (1 - delay));
    if (u <= 0 && t < 1) continue;
    // a jet stops short of the box, so it never slides along its edge
    const sx = Math.sin(a), sy = Math.cos(a);
    const room = Math.min(sx > 1e-6 ? (B[2] - 1 - x) / sx : sx < -1e-6 ? (B[0] + 1 - x) / sx : Infinity, sy > 1e-6 ? (B[3] - 1 - y) / sy : sy < -1e-6 ? (B[1] + 1 - y) / sy : Infinity);
    const far = Math.max(1, Math.min(reach * (0.7 + 0.3 * hash(i, seed * 64 + 3)), room));
    const head = far * easeOut(clamp(u * 1.7)), tail = far * easeOut(clamp(u * 1.7 - 0.6));
    list.push({
      u, r: (width / 2) * (1 - 0.7 * clamp((u - 0.5) / 0.5)),
      hx: hold(x + Math.sin(a) * head, B[0], B[2]), hy: hold(y + Math.cos(a) * head, B[1], B[3]),
      tx: hold(x + Math.sin(a) * tail, B[0], B[2]), ty: hold(y + Math.cos(a) * tail, B[1], B[3]),
    });
  }
  // every rim first, then every body, so jets that touch join without a line between them
  for (const J of list) if (J.r >= 1) g.capsule(J.tx, J.ty, J.hx, J.hy, 1.4, J.r + 1, rim, { shade: 0, clip });
  for (const J of list) {
    if (J.r < 1) { g.dot(J.hx, J.hy, J.u > 0.9 ? rim : body); continue; }
    g.capsule(J.tx, J.ty, J.hx, J.hy, 0.6, J.r, body, { shade: 0, clip });
    if (J.u < 0.7) g.ellipse(J.hx, J.hy, J.r * 0.62, J.r * 0.62, hot, { shade: 0, clip });
  }
  return g;
}
