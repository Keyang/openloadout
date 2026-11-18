// Space backdrops: what engine/backdrop.js lacks for a background with no ground and no weather (docs/style-guide.md
// section 7). Added with batch S13 (sprites/bg-starfield.js, the worked example). Everything wraps at 320 px the way
// the backdrop helper's own pieces do, and is used with them: scatter, wrapped, recede, standOut, fillBelow, tidy.
//
//   import { fillBands, fillBelow, fillBetween, shifted, litEdge, recede, standOut, tidy } from '../engine/backdrop.js';
//   import { spaceLook, arch, starField, nebula } from '../engine/space.js';
//
//   const sky = spaceLook(p.sky, PALETTE.derelict.void);              // { bands: [top, middle, low], air }
//   fillBands(g, sky.bands, [70, 130]);                               // far: three flat bands of dark, the lightest last
//   const cloud = standOut(recede(p.haze, 0.8, sky.air), [sky.bands[1]]);
//   nebula(g, 90, 60, 150, 70, { base: cloud, light: tone(cloud, 0.5) }, 3);
//   starField(g, { count: 60, seed: 4, bottom: 150, colours: { dim, bright, heart } });           // still stars
//   starField(g, { count: 20, seed: 9, colours, t, plus: 0.5, big: 0.2 });                       // mid: stars that twinkle over the clip
//   const limb = arch({ base: 172, height: 30, at: 200 });            // near: the edge of a planet along the bottom
//   fillBelow(g, limb, planet); fillBetween(g, limb, litEdge(limb), sunlit);
//
// Rules of the style guide these keep for you: a star is never a single pixel (a 2 px dot or a cross), the stars of a
// "Stars" slider are added to the ones already there, and a thing that hangs over the right edge comes back in on the
// left. What they cannot keep: give every shape a tone that standOut has moved clear of the band behind it.
//
// Pure JavaScript, no state: the same input gives the same pixels. They draw with the Surface's own calls only.

import { mix } from './color.js';
import { hash, fract, lerp, TAU } from './motion.js';
import { LAYER, scatter, wrapped } from './backdrop.js';

const [W] = LAYER;

/**
 * The sky of open space from one colour: three flat bands from near-black at the top to the lightest at the bottom, a small step of value apart, and the colour things fade into.
 * Arguments: sky (the colour control: the tint of space); deep (the darkest colour of the kit, which the top band stays close to: PALETTE.derelict.void).
 * Returns { bands: [top, middle, low], air }: bands for backdrop.js fillBands, air (the lowest band) for recede() and standOut(). The bands are too close for every whole-bundle palette to keep all three apart (that would need a bottom band at half brightness, which is no longer space): give the shapes drawn on them (clouds, stars, planets) tones that standOut has moved clear of all three.
 */
export function spaceLook(sky, deep) {
  const bands = [mix(deep, sky, 0.1), mix(deep, sky, 0.3), mix(deep, sky, 0.55)];
  return { bands, air: bands[2] };
}

/**
 * An outline with one broad rise across the 320 px of a backdrop layer, repeating exactly: the limb of a planet along the bottom edge, the arc of its ring, a swell of dust. Returns outline(x) for backdrop.js fillBelow and fillBetween.
 * Arguments: options { base (the row of its lowest point, half the layer away from its top; default 170), height (px it rises, default 24), at (the column of its top, default 160), power (1, the default, is a smooth swell; higher makes the rise narrower and its foot flatter; keep it at 0.75 or more, or the foot turns into a crease) }.
 */
export function arch({ base = 170, height = 24, at = 160, power = 1 } = {}) {
  return (x) => base - height * (0.5 + 0.5 * Math.cos((TAU * (x - at)) / W)) ** power;
}

/**
 * Draws stars across a backdrop layer that keep their places when their number changes: 2 px dots, small crosses and a few big crosses with a bright heart, never a single pixel, wrapping at the edges; some of them can twinkle over a looping clip.
 * Arguments: g (the Surface); options { count (how many; more are added to the ones already there), seed, top, bottom (the rows they lie between, default the whole layer), colours ({ dim, bright, heart }: a dot is bright, a cross has bright arms and a heart; dim is a star at its faintest), t (the clip phase, or null, the default, for stars at rest), plus (the share that are small crosses, default 0.3), big (the share that are big crosses, default 0.1), twinkle (the share that twinkle when t is given, default 0.5: each on its own timer flares for a quarter of the clip, a size bigger, and is dim for another quarter) }.
 */
export function starField(g, { count = 40, seed = 1, top = 0, bottom = g.h, colours = {}, t = null, plus = 0.3, big = 0.1, twinkle = 0.5 } = {}) {
  const { bright, dim = bright, heart = bright } = colours;
  const room = Math.max(0, bottom - top - 7);
  for (const s of scatter(count, seed, { stable: true })) {
    const y = Math.round(top + 3 + s.v * room), id = seed * 31 + s.i;
    const life = t !== null && hash(id, 5) < twinkle ? fract(t + hash(id, 6)) : -1;
    const flare = life >= 0 && life < 0.25, faint = life >= 0.5 && life < 0.75;
    const size = (s.w < big ? 2 : s.w < big + plus ? 1 : 0) + (flare ? 1 : 0);
    const arm = faint ? dim : bright;
    wrapped(s.x, size + 2, (x) => {
      if (!size) { g.rect(x, y, 2, 2, arm); return; }
      g.rect(x - size, y, 2 * size + 1, 1, arm);
      g.rect(x, y - size, 1, 2 * size + 1, arm);
      g.dot(x, y, faint ? arm : heart);
    });
  }
  return g;
}

/**
 * Draws a nebula: one big ragged patch of glowing gas in two or three flat tones, lighter towards its heart, made of many overlapping lobes inside a box w px wide and h px high round (x, y), wrapping at the edges.
 * Arguments: g (the Surface); x, y (its middle); w, h (the box it stays in; 60 by 30 or more keeps its lobes above the 3 px a backdrop needs; make it big, a third of the layer or more: a small one reads as a cloud); tones ({ base, light, core }: already receded and moved clear of the band behind them; core, the brightest knot near the heart, may be left out); seed (another seed, another nebula); options { lobes (how many, default 11: more makes it denser and rounder) }.
 */
export function nebula(g, x, y, w, h, tones, seed = 0, { lobes = 11 } = {}) {
  const n = Math.max(3, Math.round(lobes)), list = [];
  for (let i = 0; i < n; i++) {
    // spread round the middle, more of them near it; every lobe stays inside the box
    const a = TAU * hash(seed, 50 + i), far = 0.28 * Math.sqrt((i + hash(seed, 60 + i)) / n);
    const rx = Math.max(2, w * lerp(0.11, 0.2, hash(seed, 70 + i))), ry = Math.max(2, h * lerp(0.1, 0.2, hash(seed, 80 + i)));
    list.push([Math.cos(a) * far * w, Math.sin(a) * far * h, rx, ry]);
  }
  const cy = Math.round(y);
  wrapped(Math.round(x), w / 2 + 2, (cx) => {
    for (const [dx, dy, rx, ry] of list) g.ellipse(cx + dx, cy + dy, rx, ry, tones.base);
    list.slice(0, Math.ceil(n * 0.6)).forEach(([dx, dy, rx, ry]) => g.ellipse(cx + dx * 0.8 + rx * 0.1, cy + dy * 0.8 - ry * 0.1, Math.max(1.5, rx * 0.62), Math.max(1.5, ry * 0.6), tones.light));
    if (tones.core) list.slice(0, Math.ceil(n * 0.25)).forEach(([dx, dy, rx, ry]) => g.ellipse(cx + dx * 0.6, cy + dy * 0.6, Math.max(1.5, rx * 0.36), Math.max(1.5, ry * 0.34), tones.core));
  });
  return g;
}

// ---- added with batch S13, fix round 1: tones for a backdrop that is lit against the dark ---------------------
// backdrop.js standOut moves a shape's colour darker whenever anything behind it is as light as it is, which is
// right under a daytime sky and wrong in space: there the dark is behind everything, a shape in front of it is lit,
// and a tone pushed darker ends up as dark as the outline ink (style guide section 7: nothing as dark as INK).
//
//   const dust = lighterThan(recede(p.haze, 0.5, sky.air), [sky.bands[2]]);                   // a band of dust on the lowest band of space
//   const land = lighterThan(recede(p.land, 0.1, sky.air), [sky.bands[2], dust]);             // a planet in front of both
//   const shade = noDarkerThan(tone(land, -1));                                               // its night side: dark, never ink

import { tone as toneOf, brightness as brightnessOf, col as colOf, hexToRgb, rgbToHsl, hsl as hslOf } from './color.js';
import { PALETTES, applyColour } from './theme.js';

const lifted = new Map();
const underPalettes = (hex) => PALETTES.map((pal) => applyColour(new Uint32Array([colOf(hex)]), { palette: pal.name })[0]);

/**
 * A shape's colour, moved lighter until it is a clear step of value above everything it is drawn against and still a different colour under every palette of the site: backdrop.js standOut for a shape that must be the lighter one (a sunlit planet, dust or a cloud against dark space), which never goes darker.
 * Arguments: colour (the shape's own colour, already receded); behind (the colours it is seen against: it stays `step` of brightness above each and a different colour from each under every site palette); options { step (the least difference in brightness, default 0.08), also (colours it only has to keep the brightness step above) }.
 * A colour that is already clear comes back unchanged. When no lighter tone is clear (everything behind it is near white) the lightest tone tried comes back.
 */
export function lighterThan(colour, behind = [], { step = 0.08, also = [] } = {}) {
  if (!behind.length && !also.length) return colour;
  const key = `${colour}|${behind.join('|')}|${also.join('|')}|${step}`;
  let out = lifted.get(key);
  if (out !== undefined) return out;
  const theirs = behind.map(underPalettes), all = [...behind, ...also];
  const clear = (c) => {
    const v = brightnessOf(c);
    if (all.some((o) => v - brightnessOf(o) < step - 1e-9)) return false;
    const mine = underPalettes(c);
    return theirs.every((t) => mine.every((m, k) => m !== t[k]));
  };
  out = colour;
  for (let k = 1; k <= 48 && !clear(out); k++) out = toneOf(colour, k * 0.06);
  lifted.set(key, out);
  return out;
}

/**
 * A colour lifted, if it has to be, until it is at least `least` bright: for the darkest tone of a backdrop shape (a night side, a shaded face, a window slot), which may be dark but never as dark as the outline ink.
 * Arguments: colour (the tone wanted); least (the brightness it must reach, 0 to 1; default 0.18, the darkest a swatch may be, clear of INK at 0.13).
 * A colour that is bright enough comes back unchanged; a lifted one keeps its hue.
 */
export function noDarkerThan(colour, least = 0.18) {
  if (brightnessOf(colour) >= least) return colour;
  const [h, s, l] = rgbToHsl(...hexToRgb(colour));
  let out = colour;
  for (let k = 1; k <= 100 && brightnessOf(out) < least; k++) out = hslOf(h, s, Math.min(1, l + k * 0.01));
  return out;
}
