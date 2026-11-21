// Backdrop helper: everything a background needs so that it tiles sideways with no
// seam and its layers read as near and far (docs/style-guide.md, sections 7 and 14).
//
// A background is one sprite, 320x180, with three clips that are its layers: `far`
// (solid: the sky and the most distant shapes), `mid` and `near` (see-through above
// their shapes). A game scrolls them at SCROLL.far / .mid / .near of the camera's speed
// and repeats each one sideways, so the right edge of a layer must continue into its
// own left edge. Three things make that happen without thinking about it:
//
//   1. OUTLINES are functions x -> y (the top edge of a shape) that repeat every 320 px:
//      ridge(), treeline(), battlements(). Fill under one with fillBelow().
//   2. SCATTERED THINGS get their x from scatter(), and are drawn with wrapped() (or with
//      disc / cloud / canopy / stars, which already do it), so one that hangs over the
//      right edge comes back in on the left.
//   3. COLOURS go through recede(colour, depth, air): every colour is mixed toward the
//      air colour, more the farther the layer, so far layers are pale and flat and the
//      game's sprites stand out in front. skyLook(sky, time) gives the sky bands and
//      that air colour for day, dusk and night; hazed(depth, p.haze) is the "Haze" control.
//      Then the main tone of every silhouette goes through standOut(colour, [what is behind it]),
//      which keeps it a clear step of value away, so a ridge cannot melt into the sky band behind
//      it when a visitor recolours the bundle with a palette. litTone() gives a shape's sunlit
//      tone, and tidy(g), called last in each layer, removes stray single pixels.
//
// A background is data (sprites/bg-forest.json, a landscape; sprites/bg-castle.json, buildings): the generators in
// engine/gen/backdrop.js draws its layers with ports of this module's outlines, fills and colour rules, and engine/gen/scenery.js
// imports it. No sprite file imports it.
// tests/unit/backdrop-helper.test.mjs draws a small three-layer backdrop with it (its `example`), so the way the
// pieces fit together is run, not described.
//
// Rules the helper cannot enforce (style guide, section 7): no outline anywhere; at most
// eight landscape colours per layer (stars, sun, moon and lit windows do not count); nothing in
// `mid` or `near` brighter than the horizon band except small lights; nothing as dark as INK;
// no single landmark in `mid` or `near`, and no shape repeated there more often than every
// 160 px; `mid` and `near` draw a strip at least 8 rows high across their whole bottom edge.
//
// Pure JavaScript, no state: the same input gives the same pixels.

import { Surface } from './surface.js';
import { mix, tone, ramp, brightness, col } from './color.js';
import { PALETTES, applyColour } from './theme.js';
import { hash, clamp, lerp, TAU } from './motion.js';

export const LAYER = [320, 180];
export const PIVOT = [160, 180];
/** How fast each layer scrolls, as a share of the camera's speed. Say these in the sprite's blurb. */
export const SCROLL = { far: 0.1, mid: 0.4, near: 0.7 };
export const TIMES = ['day', 'dusk', 'night'];

const [W, H] = LAYER;

/**
 * The three layer clips, farthest first: { far, mid, near }.
 * layerClips() is one still frame each. For drifting clouds or twinkling stars pass
 * { frames: 8, fps: (p) => 4 * lerp(0.65, 1.45, p.speed) }; frames may also be per layer: { frames: { far: 8 } }.
 */
export function layerClips({ frames = 1, fps = 4 } = {}) {
  const n = (k) => (typeof frames === 'object' ? frames[k] ?? 1 : frames);
  return {
    far: { label: 'Far', frames: n('far'), fps, loop: true },
    mid: { label: 'Middle', frames: n('mid'), fps, loop: true },
    near: { label: 'Near', frames: n('near'), fps, loop: true },
  };
}

// ---- wrapping -----------------------------------------------------------------

/** Any x folded into 0..320. */
export const wrapX = (x) => ((x % W) + W) % W;

/** How far a is to the right of b going the short way round the 320 px loop: -160..160. */
export function wrapGap(a, b) {
  const d = wrapX(a - b);
  return d > W / 2 ? d - W : d;
}

/**
 * Draw something that may hang over an edge: draw(x) is called with x folded into 0..320,
 * and once more 320 px to the side when the thing (up to `reach` px either way) crosses the join.
 */
export function wrapped(x, reach, draw) {
  x = wrapX(x);
  draw(x);
  if (x + reach > W) draw(x - W);
  if (x - reach < 0) draw(x + W);
}

// ---- outlines: x -> y, repeating every 320 px ------------------------------------

const tri = (u) => 1 - 4 * Math.abs(u - Math.floor(u) - 0.5);          // triangle wave, period 1, -1..1, peak at whole u
const sine = (u) => Math.cos(TAU * u);                                 // same peak positions as tri
const asOutline = (base) => (typeof base === 'function' ? base : () => base);

/**
 * A line of hills or mountains. The outline runs between `base` (its lowest valley) and
 * `base - height` (its highest peak), with `peaks` summits across the 320 px, and repeats exactly.
 *   shape 'round'   soft hills                 shape 'jagged'   straight-sided mountains and crags
 *   rough 0..1      small bumps on top of the main shape (0 = none)
 * It is built only from waves with a whole number of cycles across 320 px, which is what makes it wrap.
 */
export function ridge({ base = 140, height = 40, seed = 1, peaks = 4, shape = 'round', rough = 0.35 } = {}) {
  const main = shape === 'jagged' ? tri : sine;
  const p = Math.max(1, Math.round(peaks));
  const ph = (k) => hash(seed, k);
  // slower waves make the summits different heights; they are kept gentle enough never to add a summit
  const slow = p > 1 ? [[1, 0.42], [Math.max(1, p - 1), p > 2 ? 0.3 : 0]] : [];
  const fast = [[p * 2 + 1, 0.2], [p * 3 + 2, 0.12], [p * 5 + 1, 0.07]];
  const raw = (x) => {
    const u = wrapX(x) / W;
    let v = main(u * p + ph(1));
    for (let i = 0; i < slow.length; i++) v += slow[i][1] * (0.6 + 0.4 * ph(10 + i)) * sine(u * slow[i][0] + ph(20 + i));
    if (rough > 0) for (let i = 0; i < fast.length; i++) v += rough * fast[i][1] * main(u * fast[i][0] + ph(30 + i));
    return v;
  };
  let lo = Infinity, hi = -Infinity;
  for (let x = 0; x < W; x++) { const v = raw(x + 0.5); if (v < lo) lo = v; if (v > hi) hi = v; }
  const span = hi - lo || 1;
  return (x) => base - height * clamp((raw(x) - lo) / span);
}

/**
 * The top of a row of trees standing on `base` (a number, or another outline such as a ridge).
 * `count` trees up to `height` px tall are scattered along the 320 px; where there is no tree
 * the outline is the ground itself, so fillBelow(treeline) then fillBelow(ground) gives trees on hills.
 *   shape 'round'    domed crowns          shape 'pointed'   firs
 *   width            a crown's width as a share of its height (default 1.5 round, 0.8 pointed)
 *   at               your own positions in place of count and seed: a scatter() list, filtered or
 *                    grouped as you like (for clumps on the crests: keep the points where the ridge is high)
 */
export function treeline({ base = 150, height = 20, count = 12, seed = 1, shape = 'round', width, at } = {}) {
  const ground = asOutline(base);
  const wide = width ?? (shape === 'pointed' ? 0.8 : 1.5);
  const trees = (at ?? scatter(count, seed, { jitter: 0.8 })).map((t) => {
    const h = height * lerp(0.65, 1, t.u);
    return { x: t.x + 0.5, h, r: Math.max(2, (h * wide * lerp(0.8, 1.15, t.v)) / 2) };
  });
  if (trees.length) trees.reduce((a, b) => (b.h > a.h ? b : a)).h = height;      // the tallest tree is as tall as asked
  for (const t of trees) t.foot = ground(t.x);                                   // a tree stands upright on the ground under its middle
  return (x) => {
    let y = ground(x);
    for (const t of trees) {
      const d = Math.abs(wrapGap(x, t.x));
      if (d >= t.r) continue;
      const k = shape === 'pointed' ? 1 - d / t.r : Math.sqrt(1 - (d / t.r) ** 2);
      if (t.foot - t.h * k < y) y = t.foot - t.h * k;
    }
    return y;
  };
}

/**
 * A wall top with teeth: `tooth` px up, `gap` px down, `depth` px deep, standing on `base`
 * (a number or an outline). A whole number of teeth always fits the 320 px; choose tooth + gap
 * from 8, 10, 16, 20, 32, 40 to get teeth that are all exactly the same width.
 */
export function battlements(base = 100, { tooth = 8, gap = 8, depth = 6 } = {}) {
  const ground = asOutline(base);
  const n = Math.max(1, Math.round(W / (tooth + gap)));
  const period = W / n, share = tooth / (tooth + gap), lead = (1 - share) / 2;
  return (x) => {
    const u = wrapX(x) / period, v = u - Math.floor(u);      // each period is half a gap, a tooth, half a gap: the join falls in a gap
    return ground(x) - (v >= lead && v < lead + share ? depth : 0);
  };
}

/** The upper edge of several outlines together (whichever is highest at each x). */
export const highest = (...outlines) => (x) => { let y = Infinity; for (const f of outlines) { const v = f(x); if (v < y) y = v; } return y; };

/** An outline moved dx px to the right and dy px down. */
export const shifted = (outline, dx = 0, dy = 0) => (x) => outline(x - dx) + dy;

/**
 * Where the sunlit part of a ridge ends. The light comes from the top right, so the faces that
 * fall away to the right are lit: fillBetween(g, outline, litEdge(outline), lightTone) paints a
 * wedge on each of them that starts at the summit and widens downhill, and leaves the faces
 * that climb toward the right in the base tone. `depth` is how thick the wedge gets (0.5 thin, 1.5 broad).
 */
export function litEdge(outline, { depth = 0.8 } = {}) {
  const y = new Float64Array(W), drop = new Float64Array(W);
  let top = 0;
  for (let x = 0; x < W; x++) { y[x] = outline(x + 0.5); if (y[x] < y[top]) top = x; }
  // walk right once round from the highest summit (where nothing is lit yet), so the join is like any other column
  for (let i = 1; i < W; i++) {
    const x = (top + i) % W, before = (top + i - 1) % W;
    const fall = y[x] - y[before];
    drop[x] = x === top ? 0 : Math.max(0, fall >= 0 ? drop[before] + fall : drop[before] + fall * 3);
  }
  return (x) => { const i = Math.floor(wrapX(x)); return y[i] + drop[i] * depth; };
}

// ---- scattered positions ---------------------------------------------------------

/**
 * `count` positions across the 320 px for trees, clouds, stars, towers, windows:
 * [{ x, i, u, v, w }], left to right. x is a whole pixel in 0..319; u, v, w are three steady
 * random numbers 0..1 for that thing (its size, its row, its kind). Things are spread out, one
 * per slot of 320 / count px, so there are no piles and no holes, across the join as well.
 *   jitter  0 = evenly spaced (columns, arches), 1 = anywhere in its slot. Default 0.6.
 *   stable  true: the things keep their places when `count` changes, so a "Density" slider
 *           adds and removes them instead of reshuffling everything. A little less even.
 * Draw each with wrapped(), or with disc / cloud / canopy, so one near an edge shows on both sides.
 */
export function scatter(count, seed = 1, { jitter = 0.6, stable = false } = {}) {
  const n = Math.max(0, Math.floor(count));
  const out = [];
  if (stable) {
    const start = hash(seed, 77);
    for (let i = 0; i < n; i++) {
      const u01 = start + i * 0.6180339887498949;
      out.push({ x: Math.floor((u01 - Math.floor(u01)) * W) % W, i, u: hash(seed * 31 + i, 1), v: hash(seed * 31 + i, 2), w: hash(seed * 31 + i, 3) });
    }
    return out.sort((a, b) => a.x - b.x || a.i - b.i);
  }
  const slot = W / (n || 1);
  for (let i = 0; i < n; i++) {
    const at = (i + 0.5 + (hash(seed * 31 + i, 0) - 0.5) * jitter) * slot;
    out.push({ x: Math.min(W - 1, Math.max(0, Math.round(at))), i, u: hash(seed * 31 + i, 1), v: hash(seed * 31 + i, 2), w: hash(seed * 31 + i, 3) });
  }
  return out;
}

// ---- colour -------------------------------------------------------------------------

/**
 * A colour as it looks through the air: mixed toward `sky` (pass skyLook().air), from 35% of
 * the way at depth 0 (the near layer) to 86% at depth 1 (the horizon). No colour of a
 * background is used without it. Typical depths: near 0.1, mid 0.5, far 0.85; add to all three
 * for a "Haze" control.
 */
export function recede(colour, depth, sky) {
  return mix(colour, sky, lerp(0.35, 0.86, clamp(depth)));
}

/**
 * A layer's depth with the "Haze" control (0..1) applied: clear air pulls every layer a little
 * nearer, mist pushes it toward the horizon. Use it for every layer so the slider always shows:
 *   recede(colour, hazed(0.5, p.haze), sky.air)
 * A quarter of the way up the slider (0.25) leaves the depth as written.
 */
export const hazed = (depth, haze) => clamp(depth + lerp(-0.1, 0.3, clamp(haze)));

// What each colour becomes under each of the site's colour palettes (engine/theme.js), worked out once.
const underPalette = PALETTES.map(() => new Map());
function inPalettes(hex) {
  return PALETTES.map((pal, i) => {
    let v = underPalette[i].get(hex);
    if (v === undefined) { v = applyColour(new Uint32Array([col(hex)]), { palette: pal.name })[0]; underPalette[i].set(hex, v); }
    return v;
  });
}
const stoodOut = new Map();

/**
 * A shape's colour, moved far enough in value from everything it is drawn against that it
 * cannot merge with it: at least `step` of brightness away (default 0.08), AND still a
 * different colour when a visitor recolours the whole bundle with any of the site's palettes
 * ("Sunset", "Mono", the four-green "Handheld" ...), which snap every colour to the nearest
 * of a dozen. Without it a pale ridge turns into the sky band behind it and only its lit
 * faces are left floating.
 *   behind   the colours the shape is seen against: the sky bands it crosses, and the main
 *            colour of every layer behind it. Build a chain, farthest first:
 *              const ridgeTone = standOut(recede(p.land, 0.6, sky.air), [sky.bands[2], sky.air]);
 *              const hill = standOut(recede(p.land, 0.4, sky.air), [sky.air, ridgeTone]);
 *   also     { also: [...] }: colours it only has to keep the brightness step from. Surviving
 *            every palette costs about 0.15 of brightness a layer, so ask it of each layer against
 *            the one thing it must never melt into, and list the rest here.
 * The colour goes darker: a shape in front of the air is darker than the air. Only against a
 * dark sky (night), a colour that is already lighter than everything behind it goes lighter.
 * A colour that already stands out comes back unchanged.
 * Use it for the main tone of every silhouette; light and shadow tones inside a shape do not need it.
 */
export function standOut(colour, behind = [], { step = 0.08, also = [] } = {}) {
  if (!behind.length && !also.length) return colour;
  const key = `${colour}|${behind.join('|')}|${also.join('|')}|${step}`;
  let out = stoodOut.get(key);
  if (out !== undefined) return out;
  const b0 = brightness(colour), theirs = behind.map(inPalettes), all = [...behind, ...also];
  // dir -1: a full step darker than every one of them; dir 1: a full step lighter
  const clear = (c, dir) => {
    const v = brightness(c), mine = inPalettes(c);
    for (const o of all) if ((v - brightness(o)) * dir < step - 1e-9) return false;
    for (const t of theirs) for (let k = 0; k < mine.length; k++) if (mine[k] === t[k]) return false;
    return true;
  };
  const move = (dir) => { let c = colour; for (let k = 1; k <= 48 && !clear(c, dir); k++) c = tone(colour, dir * k * 0.06); return clear(c, dir) ? c : null; };
  const lighter = all.every((o) => brightness(o) < Math.min(b0, 0.5));
  out = move(lighter ? 1 : -1) ?? move(lighter ? -1 : 1) ?? colour;
  stoodOut.set(key, out);
  return out;
}

/**
 * The sunlit tone of a shape whose main tone is `base`: part of the way (`k`, default 0.4) to the
 * air colour, so it is lighter than the base but never lighter than the air: nothing in a layer
 * may outshine the sky behind it. Under a dark sky (the base already lighter than the air) it is a
 * plain lighter tone. Use it for rims, lit faces and the light clumps of leaves.
 */
export const litTone = (base, air, k = 0.4) => (brightness(air) > brightness(base) ? mix(base, air, k) : tone(base, k));

const CREAM = '#f0ead8', VIOLET = '#7a4fc4', EMBER = '#e08a2c', GOLD = '#f2c230', NIGHT = '#1f2452', MOONLIT = '#3d4a8a';

/**
 * The sky of a time of day from one sky colour (the colour of the daytime sky):
 *   bands       four flat colours from the top of the sky down to the horizon, the lightest last
 *   air         the colour things fade into with distance: pass it to recede() as `sky`
 *   glow        the sun (day), the low sun (dusk) or the moon (night)
 *   cloud, cloudShade   a cloud and its underside. The underside is the third band's colour (one colour
 *               fewer in the layer), so keep clouds in the two upper bands, where it shows
 *   time        'day' | 'dusk' | 'night', as given
 * Every layer of a background calls this with the same two controls, so the layers always agree.
 */
export function skyLook(sky, time = 'day') {
  let top, horizon, glow, cloud;
  if (time === 'day') {
    top = mix(sky, tone(sky, -1.2), 0.75);
    horizon = mix(tone(sky, 0.75), CREAM, 0.3);
    glow = mix(CREAM, GOLD, 0.22);
  } else if (time === 'dusk') {
    top = mix(mix(sky, VIOLET, 0.62), NIGHT, 0.18);
    horizon = mix(mix(sky, EMBER, 0.5), CREAM, 0.5);
    glow = mix(EMBER, CREAM, 0.42);
  } else if (time === 'night') {
    top = mix(sky, NIGHT, 0.88);
    horizon = mix(sky, MOONLIT, 0.78);
    glow = mix(CREAM, sky, 0.22);
  } else throw new Error(`skyLook: time must be one of day, dusk, night (got ${JSON.stringify(time)})`);
  const bands = [top, mix(top, horizon, 0.38), mix(top, horizon, 0.7), horizon];
  if (time === 'night') cloud = mix(horizon, CREAM, 0.14);
  else cloud = mix(horizon, CREAM, 0.6);
  return { time, bands, air: horizon, glow, cloud, cloudShade: bands[2] };
}

// ---- drawing ----------------------------------------------------------------------------

/** Flat bands across the whole layer, top to bottom. `edges` are the rows where each next band starts. */
export function fillBands(g, colours, edges = [46, 84, 114]) {
  let from = 0;
  for (let i = 0; i < colours.length; i++) {
    const to = i < edges.length ? edges[i] : g.h;
    if (to > from) g.rect(0, from, g.w, to - from, colours[i]);
    from = Math.max(from, to);
  }
  return g;
}

/** Fill every column from the outline down to the bottom of the layer (or to row `to`, not included). */
export function fillBelow(g, outline, colour, { to = g.h } = {}) {
  return fillBetween(g, outline, () => to, colour);
}

/** Fill every column between two outlines: from `top` down to `bottom` (not included). */
export function fillBetween(g, top, bottom, colour) {
  for (let x = 0; x < g.w; x++) {
    const y0 = Math.max(0, Math.round(top(x + 0.5))), y1 = Math.min(g.h, Math.round(bottom(x + 0.5)));
    if (y1 > y0) g.rect(x, y0, 1, y1 - y0, colour);
  }
  return g;
}

/** A flat disc (sun, moon, a round bush) that wraps. */
export function disc(g, x, y, r, colour) {
  wrapped(x, r + 1, (cx) => g.ellipse(cx, y, r, r, colour));
  return g;
}

/**
 * A flat-bottomed cartoon cloud that wraps: `y` is its flat underside, `w` its width.
 * `shade` (optional) colours the bottom rows. `seed` varies its bumps.
 */
export function cloud(g, x, y, w, colour, shade, seed = 0) {
  x = Math.round(x); y = Math.round(y);
  const r = Math.max(3, Math.round(w * 0.13));
  const bumps = [
    [-w * lerp(0.2, 0.28, hash(seed, 41)), w * lerp(0.15, 0.2, hash(seed, 42))],
    [w * lerp(-0.04, 0.06, hash(seed, 43)), w * lerp(0.22, 0.27, hash(seed, 44))],
    [w * lerp(0.2, 0.28, hash(seed, 45)), w * lerp(0.14, 0.19, hash(seed, 46))],
  ];
  const above = (px, py) => py < y;
  wrapped(x, w / 2 + 2, (cx) => {
    g.capsule(cx - w / 2 + r, y - 1, cx + w / 2 - r, y - 1, r, r, colour, { clip: above });
    for (const [dx, br] of bumps) g.ellipse(Math.round(cx + dx), y - Math.round(br * 0.45), br, br, colour, { clip: above });
    if (shade) g.capsule(cx - w / 2 + r, y - 1, cx + w / 2 - r, y - 1, r, r, shade, { clip: (px, py) => py < y && py > y - 3 });
  });
  return g;
}

/**
 * A mass of leaves about `r` px in radius around (x, y), made of overlapping round clumps in
 * three tones: tones = { light, base, dark } (already receded). Light from the top right. Wraps.
 * `r` should be at least about 12: below that the clumps are too small to keep their three
 * tones and the mass turns into speckle. For smaller bushes use disc() or a treeline().
 */
export function canopy(g, x, y, r, tones, seed = 0) {
  const clumps = [[0, 0, r * 0.62]];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = TAU * ((i + hash(seed, 50 + i) * 0.7) / n) + hash(seed, 49) * TAU;
    const d = r * lerp(0.42, 0.55, hash(seed, 60 + i));
    clumps.push([Math.cos(a) * d * 1.1, Math.sin(a) * d * 0.8, r * lerp(0.36, 0.5, hash(seed, 70 + i))]);
  }
  wrapped(Math.round(x), r * 1.1 + 3, (cx) => {
    const cy = Math.round(y);
    for (const [dx, dy, cr] of clumps) g.ellipse(cx + dx, cy + dy, cr, cr, tones.dark);
    for (const [dx, dy, cr] of clumps) g.ellipse(cx + dx + 1.5, cy + dy - 2, cr - 1.5, cr - 2, tones.base);
    for (const [dx, dy, cr] of clumps) g.ellipse(cx + dx + cr * 0.3, cy + dy - cr * 0.38, cr * 0.5, cr * 0.42, tones.light);
  });
  return g;
}

/**
 * Mist lying on the ground: a band of the air colour with a softly waving top, `thickness` px
 * deep above row `y`, across the whole width. At the foot of a far ridge it lifts the ridge off
 * the layer in front and hides the flat bottom of its fill. { to } stops it at a row.
 */
export function mistBand(g, y, thickness, colour, seed = 1, { to = g.h } = {}) {
  return fillBelow(g, shifted(ridge({ base: y, height: 5, seed, peaks: 3, rough: 0.2 }), 0, -thickness), colour, { to });
}

/**
 * Removes isolated single pixels (a pixel with no neighbour of its own colour above, below, left
 * or right; the left and right edges count as neighbours): each takes the colour under it, or
 * beside it. Thin lit edges on a jagged ridge leave a few; call tidy(g) last in every layer.
 */
export function tidy(g) {
  const { w, h, data } = g;
  for (let pass = 0; pass < 3; pass++) {
    let changed = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = data[y * w + x];
      const l = data[y * w + ((x + w - 1) % w)], r = data[y * w + ((x + 1) % w)];
      const u = y > 0 ? data[(y - 1) * w + x] : -1, d = y < h - 1 ? data[(y + 1) * w + x] : -1;
      if (v === l || v === r || v === u || v === d) continue;
      data[y * w + x] = d !== -1 && (d === l || d === r || d === u) ? d : l === r || l === u ? l : d !== -1 ? d : l;
      changed++;
    }
    if (!changed) break;
  }
  return g;
}

/** `count` stars between rows `top` and `bottom`: 2x2 dots and a few 3 px crosses. Wraps. */
export function stars(g, count, seed, colour, { top = 0, bottom = 100 } = {}) {
  for (const s of scatter(count, seed, { jitter: 1 })) {
    const y = Math.round(top + 1 + s.v * Math.max(0, bottom - top - 4));
    wrapped(s.x, 2, (x) => {
      if (s.w > 0.75) { g.rect(x - 1, y, 3, 1, colour); g.rect(x, y - 1, 1, 3, colour); } else g.rect(x, y, 2, 2, colour);
    });
  }
  return g;
}
