// PORT (migration batch E2): a copy of engine/foliage.js with its imports pointed at the port shims (engine/gen/ports/colour.js,
// engine/gen/ports/e2/surface.js), so it draws paint refs on engine/gen/port-surface.js grids. It is the drawing code of migration batch E2's
// effect behaviours (engine/gen/fx-e2.js), so it is NOT temporary: it stays when engine/foliage.js goes and goes only with the last
// generator version that draws with it. A HAND CHANGE note below says where it differs from its source; never change what
// a released generator version draws through it.
// Tree parts (added with batch R04: the oak and the pine of the Hearthvale map). A tree stands up the screen in
// the top-down kits' three-quarter view and in a side view alike: a crown of overlapping leaf masses painted as one
// body, the leaf marks that give each mass its own light and shade, a trunk that flares into roots, the tiers of a
// fir, and the leaves that come down when a tree is shaken. Shape tests return inside(px, py) and go to g.blob or
// g.fill like those of engine/surface.js; the drawing helpers take the Surface first. Everything is repeatable:
// no Math.random(), no state between calls. Suits the pixel style. Worked examples: sprites/tree-oak.js (a crown)
// and sprites/tree-pine.js (tiers).
//
//   import { crownLobes, crownTufts, crownIn, leafMarks, trunkIn, tierIn, leafFall } from '../engine/foliage.js';
//   const leaf = ramp(p.leaf), lobes = crownLobes({ cx: 32, cy: 34, w: 54, h: 42, shape: 'round', sway: 2, t });
//   g.fill(...box, trunkIn(32, 76, 8, 26, { flare: 4 }), ramp(p.wood));          // the trunk first: the crown hides its top
//   const all = [...crownTufts(lobes), ...lobes];                               // small tufts round the outside, behind the masses
//   g.fill(...box, crownIn(all), leaf, { shade: 2 });                           // the crown as one body
//   leafMarks(g, all, { light: leaf.light, dark: leaf.dark });                  // each mass lit at the top right
//   g.outline(INK);
//   leafFall(g, { t, count: 4, x: 32, y: 34, spread: 20, floor: 75, colours: [leaf.light, leaf.base] });   // after the outline

import { hash, TAU } from '../../../motion.js';

// Leaf masses of each crown, [x, y, rx, ry] in a box that runs -1..1 both ways, listed back to front.
const CROWNS = {
  round: [[-0.04, -0.36, 0.6, 0.6], [-0.5, 0.08, 0.5, 0.6], [0.5, 0.0, 0.5, 0.62], [0.04, 0.42, 0.6, 0.56]],
  wide: [[-0.3, -0.34, 0.42, 0.6], [0.32, -0.3, 0.44, 0.66], [-0.66, 0.2, 0.34, 0.6], [0.66, 0.16, 0.34, 0.62], [0.0, 0.36, 0.48, 0.62]],
  layered: [[0.0, -0.64, 0.4, 0.34], [0.0, 0.1, 0.5, 0.5], [-0.36, -0.16, 0.42, 0.34], [0.36, -0.2, 0.44, 0.36], [-0.56, 0.44, 0.44, 0.4], [0.56, 0.4, 0.44, 0.42], [0.0, 0.58, 0.46, 0.4]],
};

/** The crown shapes crownLobes knows: round (a ball of four masses), wide (a low spreading crown), layered (three storeys of masses, taller than wide). No arguments: a frozen list. */
export const CROWN_SHAPES = Object.freeze(Object.keys(CROWNS));

/**
 * The leaf masses of a tree's crown, back to front, fitted to a box: [{ x, y, rx, ry }, ...] to hand to crownIn and leafMarks; with sway each mass moves by whole pixels, out of step with the others.
 * Arguments: o: { cx, cy (the middle of the box), w, h (its size in px), shape (one of CROWN_SHAPES, default 'round'), sway (px a mass moves at most, default 0), t (the clip phase 0..1: a loop closes), cycles (how many times it sways per clip, default 1), seed (changes which mass leads) }.
 */
export function crownLobes({ cx, cy, w, h, shape = 'round', sway = 0, t = 0, cycles = 1, seed = 0 }) {
  const layout = CROWNS[shape] ?? CROWNS.round;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y, rx, ry] of layout) { x0 = Math.min(x0, x - rx); x1 = Math.max(x1, x + rx); y0 = Math.min(y0, y - ry); y1 = Math.max(y1, y + ry); }
  const kx = w / (x1 - x0), ky = h / (y1 - y0), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  return layout.map(([x, y, rx, ry], i) => {
    // every mass leans the same way, each a little later than the one before; the higher ones move furthest
    const phase = 0.11 * i + 0.2 * hash(i, seed * 16 + 5), reach = 0.6 + 0.4 * ((y1 - y) / (y1 - y0));
    const dx = sway ? Math.round(sway * reach * Math.sin(TAU * (cycles * t - phase))) : 0;
    const dy = sway ? Math.round(sway * 0.4 * Math.sin(TAU * (cycles * t - phase - 0.25))) : 0;
    return { x: cx + (x - mx) * kx + dx, y: cy + (y - my) * ky + dy, rx: rx * kx, ry: ry * ky };
  });
}

/**
 * Shape test for a whole crown: true inside any of its leaf masses, so g.fill or g.blob paints them as one body with one shadow band.
 * Arguments: lobes (from crownLobes, or any list of { x, y, rx, ry }); grow (px added to every radius, default 0: a negative number shrinks the crown).
 */
export function crownIn(lobes, grow = 0) {
  const list = lobes.map((l) => ({ x: l.x, y: l.y, rx: Math.max(0.1, l.rx + grow), ry: Math.max(0.1, l.ry + grow) }));
  return (px, py) => { for (const l of list) if (((px - l.x) / l.rx) ** 2 + ((py - l.y) / l.ry) ** 2 <= 1) return true; return false; };
}

/**
 * Small leaf masses along the outside of a crown, so its outline is tufted instead of smooth: [{ x, y, rx, ry }, ...] to put in front of the list from crownLobes; each moves with the mass it grows on.
 * Arguments: lobes (from crownLobes); o: { count (how many are tried round each mass, default 7; those that would lie inside another mass are left out), size (their radius in px, default 4), seed }.
 */
export function crownTufts(lobes, { count = 7, size = 4, seed = 0 } = {}) {
  const out = [];
  lobes.forEach((l, i) => {
    for (let j = 0; j < count; j++) {
      const a = (TAU * (j + 0.2 + 0.6 * hash(i * 16 + j, seed + 21))) / count;
      const x = l.x + Math.round(Math.cos(a) * (l.rx - size * 0.35)), y = l.y + Math.round(Math.sin(a) * (l.ry - size * 0.35));
      const px = l.x + Math.cos(a) * (l.rx + 1), py = l.y + Math.sin(a) * (l.ry + 1);
      if (lobes.some((m, k) => k !== i && ((px - m.x) / m.rx) ** 2 + ((py - m.y) / m.ry) ** 2 <= 1)) continue;
      const r = size * (0.75 + 0.45 * hash(i * 16 + j, seed + 33));
      out.push({ x, y, rx: r, ry: r * 0.9 });
    }
  });
  return out;
}

// Clumps of lit leaves on a mass: [x, y, r] with x, y in the mass's own radii and r in its smaller radius.
const CLUMPS = [[0.16, -0.46, 0.36], [0.5, -0.12, 0.27], [-0.3, -0.5, 0.25], [0.44, -0.56, 0.2], [-0.08, -0.06, 0.2]];

/**
 * Paint the light and shade of each leaf mass over a crown already filled with its base colour: clumps of lit leaves at the top right of every mass, and a dark crease where a mass overlaps the one behind it.
 * Arguments: g (the Surface); lobes (from crownLobes, back to front); o: { light, dark (colours: the leaf ramp's light and dark), amount (0..1 how much of each mass is lit, default 1), shade (px width of the dark crease, default 2), seed, clip (an extra test (px, py) limiting where marks land) }.
 */
export function leafMarks(g, lobes, { light, dark, amount = 1, shade = 2, seed = 0, clip } = {}) {
  const inLobe = (l, px, py) => ((px - l.x) / l.rx) ** 2 + ((py - l.y) / l.ry) ** 2 <= 1;
  const clumps = lobes.map((l, i) => {
    const r = Math.min(l.rx, l.ry), n = Math.max(0, Math.min(CLUMPS.length, Math.round(amount * (r > 9 ? 5 : r > 6 ? 4 : 3))));
    return CLUMPS.slice(0, n).map(([x, y, k], j) => ({ x: l.x + x * l.rx + Math.round(2 * hash(i * 8 + j, seed) - 1), y: l.y + y * l.ry, r: Math.max(1.6, k * r * (0.85 + 0.3 * hash(i * 8 + j, seed + 9))) }));
  });
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const l of lobes) { x0 = Math.min(x0, l.x - l.rx); x1 = Math.max(x1, l.x + l.rx); y0 = Math.min(y0, l.y - l.ry); y1 = Math.max(y1, l.y + l.ry); }
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(g.h - 1, Math.ceil(y1)); y++) for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(g.w - 1, Math.ceil(x1)); x++) {
    const px = x + 0.5, py = y + 0.5;
    let top = -1;
    for (let i = lobes.length - 1; i >= 0; i--) if (inLobe(lobes[i], px, py)) { top = i; break; }
    if (top < 0 || (clip && !clip(px, py))) continue;
    const l = lobes[top];
    // the crease where this mass overlaps the one behind it: its upper rim, wherever more crown lies beyond it.
    // The rim that is the crown's own outline stays in the light
    if (shade && dark && !inLobe(l, px + shade, py - shade) && lobes.some((m) => m !== l && inLobe(m, px + shade, py - shade))) { g.dot(x, y, dark); continue; }
    if (!light) continue;
    for (const c of clumps[top]) {
      const d2 = (px - c.x) ** 2 + (py - c.y) ** 2;
      // a clump is a disc with a bite out of its lower left, so it reads as a tuft of leaves and not as a ball
      if (d2 <= c.r * c.r && (c.r < 2.6 || (px - c.x + c.r * 0.9) ** 2 + (py - c.y - c.r * 0.9) ** 2 > c.r * c.r * 0.5)) { g.dot(x, y, light); break; }
    }
  }
  return g;
}

/**
 * Shape test for a tree trunk standing on a ground row: straight above, flaring out into roots over its lowest rows.
 * Arguments: cx (its centre line); base (the ground row: the lowest drawn row is base - 1); w (px across the straight part); h (px tall); options { flare (px the foot spreads to each side, default 3), foot (how many rows the flare takes, default about a third of h), lean (px the top stands to the right of the foot, default 0) }.
 */
export function trunkIn(cx, base, w, h, { flare = 3, foot = Math.max(3, Math.min(8, Math.round(h * 0.35))), lean = 0 } = {}) {
  return (px, py) => {
    if (py >= base || py < base - h) return false;
    const up = base - py, k = up < foot ? ((foot - up) / foot) ** 2 : 0;          // 0 above the foot, 1 on the ground
    const mid = cx + lean * Math.min(1, up / h);
    return Math.abs(px - mid) <= w / 2 + Math.round(flare * k);
  };
}

/**
 * Shape test for one tier of a fir tree: a skirt with its point at the top, straight sides, and a jagged lower edge that hangs lowest in the middle.
 * Arguments: cx (its centre line); top (the row of its point); bottom (the row just under its lowest tooth); half (px from the centre line to its widest); options { teeth (how many points along the lower edge, default 5), jag (px each tooth is long, default 3), droop (0..0.6: how much higher the lower edge is at the sides than in the middle, as a share of the height, default 0.25), seed (changes the teeth) }.
 */
export function tierIn(cx, top, bottom, half, { teeth = 5, jag = 3, droop = 0.25, seed = 0 } = {}) {
  const H = Math.max(1, bottom - top), rise = Math.max(0, Math.min(0.6, droop)) * H, n = Math.max(1, Math.round(teeth));
  return (px, py) => {
    if (py < top || py >= bottom) return false;
    const u = (px - cx) / half;
    if (Math.abs(u) > 1) return false;
    if (Math.abs(u) > ((py - top) / Math.max(1, H - rise)) ** 0.9) return false;                 // the sides
    // the lower edge: an arc that hangs lowest in the middle, cut into teeth of uneven length
    const s = ((u + 1) / 2) * n, i = Math.min(n - 1, Math.floor(s)), f = s - i;
    const tooth = (1 - Math.abs(2 * f - 1)) * jag * (0.7 + 0.6 * hash(i, seed * 16 + 3));
    return py < bottom - rise * u * u - jag * 1.3 + tooth;
  };
}

/**
 * Leaves (or needles, petals, snow) coming down from a shaken tree in a one-shot clip: they leave one after another, flutter down, and lie on the ground at the end, so the last frame is never empty.
 * Arguments: g (the Surface: call it after g.outline); o: { t (clip phase 0..1), count (default 4), x, y (the middle of the crown they leave from), spread (px they start and land to either side, default 12), floor (the lowest row a leaf may rest on), colours (list: leaf i takes colours[i % length]), seed, box ([x0, y0, x1, y1] to stay inside, default the frame less 1 px) }.
 */
export function leafFall(g, { t = 0, count = 4, x, y, spread = 12, floor, colours = ['#4f9d57'], seed = 0, box } = {}) {
  const B = box ?? [1, 1, g.w - 2, g.h - 2], ground = Math.min(floor ?? B[3], B[3]);
  for (let i = 0; i < count; i++) {
    const h = (ch) => hash(i, seed * 64 + ch);
    const start = 0.04 + 0.3 * (i / Math.max(1, count)), life = (t - start) / 0.62;
    if (life <= 0) continue;
    const k = Math.min(1, life), side = i % 2 ? 1 : -1;
    const from = { x: x + side * spread * (0.25 + 0.6 * h(1)), y: y + spread * 0.5 * (h(2) - 0.5) };
    const rest = ground - Math.round(2 * h(3));
    const lx = Math.round(Math.min(B[2] - 1, Math.max(B[0], from.x + side * 3 * k + 2.4 * Math.sin(TAU * (1.25 * k + h(4))) * (1 - k * k))));
    const ly = Math.round(Math.min(rest, Math.max(B[1], from.y + (rest - from.y) * k * k)));
    const c = colours[i % colours.length];
    // a leaf is three pixels: in a row when it lies flat, bent while it tumbles
    const flat = k >= 1 || Math.floor(k * 5 + h(5) * 2) % 2 === 0;
    g.dot(lx, ly, c);
    g.dot(lx + 1, flat ? ly : Math.max(B[1], ly - 1), c);
    g.dot(Math.max(B[0], lx - 1), flat ? ly : Math.min(rest, ly + 1), c);
  }
  return g;
}
