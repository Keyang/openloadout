// Three more interface skins drawn over `flat` (added with batch H5b, bundles/specs/core-sprites-3.md): neon (a glowing
// tube on a dark wall), crystal (deep ice in a cut crystal band) and grove (a dark slab in a living vine).
// engine/ui-skins.js knows four skins and refuses any other name, and its exports must not change, so this module
// draws nothing from scratch: a sprite draws each piece with the `flat` skin of engine/ui-skins.js, re-cuts its corners
// with roundSlab (engine/ui-candy-slab.js) and the cut table given here, then calls moreSkinMarks.
//
//   const base = moreSkinBase('neon', p.style);                        // { skin: 'flat', style: 'outline' }
//   const out = skinButton(g, 1, 1, 94, 30, clip, 'flat', { ...look, style: base.style, cornerPx: 0 });
//   roundSlab(g, out.body, moreSkinCuts('neon', p.corner), { below: clip === 'pressed' ? 0 : 2 });
//   const { inner, slice } = moreSkinMarks(g, out.body, 'neon', p.style, { piece: 'button', face, frame, accent, state: clip,
//     extras: p.halo, skip: [out.text], keep: { x: 8, y: 8, w: 80, h: 16 }, rect: { x: 1, y: 1, w: 94, h: 30 }, slice: out.slice });
//   textArea: (clip, p) => ({ ...inner, text: SKIN_TEXT.flat, edge: out.edge })
//
// HOW THE MARKS FIND THE PIECE. moreSkinMarks reads the piece already drawn in `body`: its outline (the ink, never
// changed), its band (the frame colour of moreSkinTones, found from the outline inwards) and the colour just inside the
// band (the face, a well's darker face, a bar's trough or a switch's track). It measures every pixel's depth from the
// outline, so the same marks fit a 96x32 button, a 64x16 bar housing and a 16 px checkbox.
//   neon     the band becomes the tube (a 1 px band grows by the first ring of the inside to 2 px): its middle
//            line the core (the band's light tone; white on hover; none when disabled). The outline style's gap
//            between the ink and the band stays apart from the tube. double: a 1 px tube of `accent` 1 px inside the
//            tube. sign: the tube broken by a 1 px dark gap at each corner bend, a 2x2 mounting clip of the tube's dark
//            tone beside each gap. extras (Glow): a 1 px line of the tube's dark tone all round: the outline style's
//            gap (tube, double), or the ring just inside the tube (sign).
//   crystal  the band lit as a bevel (its outer pixel light along the top and right, dark along the bottom and left).
//            ice: icicles 1 to 3 px hanging from the top band in the top corners. rime: a frost fern growing in from
//            each cut corner (a 4 px diagonal stem of the band's light tone, two side branches each side, its tip pixel
//            `accent`). shard: two upright crystal shards rising over the bottom band in each bottom corner. extras
//            (Glints): a 5 px white plus in each top corner and a 3 px `accent` sparkle in each bottom corner.
//   grove    vine: the band twists in each corner (a 1 px stripe of its dark tone every 2 px). bark: the inner part of
//            the band (and the face's first ring) in the band's dark tone, the outer pixel kept (so the band still
//            holds 3 to 1 against the face), and a 2x2 knot of the face's light tone in each corner. bloom: as vine,
//            with a five-pixel flower of `accent` round a gold middle in each top corner and a 2 px bud in each bottom
//            corner. extras (Leaves): two leaves
//            of `accent` (3x2, their tips in its dark tone) over the band in each corner.
// STRETCHING. Rings (the tube, its core, the glow, the second tube, the bevel, the bark ring) are the same all along
// each side. Everything else (icicles, ferns, shards, glints, gaps, clips, twists, knots, flowers, leaves) is drawn
// only in the corner zones: outside both the columns and the rows of `keep`, the stretched middle. Nothing is drawn
// inside a rectangle of `skip` (text areas). The returned `inner` is the flat face left (the text area to declare).

import { Surface, polyIn } from './surface.js';
import { tone, col, INK } from './color.js';
import { desaturate } from './ui.js';
import { skinTones } from './ui-skins.js';
import { candyCuts } from './ui-candy-slab.js';
import { PALETTE } from './palettes.js';

/** The three skins this module draws over the flat skin of engine/ui-skins.js: neon, crystal and grove. No arguments: a frozen list. */
export const MORE_SKINS = Object.freeze(['neon', 'crystal', 'grove']);

/** The styles of each skin, as { neon: [tube, double, sign], crystal: [ice, rime, shard], grove: [vine, bark, bloom] }. No arguments: a frozen object. */
export const MORE_SKIN_STYLES = Object.freeze({
  neon: Object.freeze(['tube', 'double', 'sign']),
  crystal: Object.freeze(['ice', 'rime', 'shard']),
  grove: Object.freeze(['vine', 'bark', 'bloom']),
});

// The first colour of each skin's lists in the specification (Thornwood colours by name): what a piece uses when a
// colour is left out.
const TW = PALETTE.thornwood;
const DEFAULTS = {
  neon: { face: TW.cavern, frame: TW.sky, accent: TW.ember },
  crystal: { face: TW.cavern, frame: TW.sky, accent: TW.magic },
  grove: { face: TW.soil, frame: TW.goblin, accent: TW.grass },
};
const GOLD = TW.gold;
const PIECES = ['button', 'tab', 'panel', 'tooltip', 'housing', 'rail', 'knob', 'check', 'radio', 'switch', 'selector'];
const STATES = ['normal', 'hover', 'pressed', 'disabled'];

function checkSkin(fn, skin, style) {
  if (!MORE_SKINS.includes(skin)) throw new Error(`${fn}: skin "${skin}" is not one of ${MORE_SKINS.join(', ')}`);
  const st = style ?? MORE_SKIN_STYLES[skin][0];
  if (!MORE_SKIN_STYLES[skin].includes(st)) throw new Error(`${fn}: style "${st}" is not one of ${MORE_SKIN_STYLES[skin].join(', ')} (skin ${skin})`);
  return st;
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * The flat style of engine/ui-skins.js to draw a piece of this skin and style with: returns { skin: 'flat', style } (neon tube and double: outline; everything else: solid).
 * Arguments: skin (one of MORE_SKINS); style (one of its MORE_SKIN_STYLES; default its first).
 */
export function moreSkinBase(skin, style) {
  const st = checkSkin('moreSkinBase', skin, style);
  return { skin: 'flat', style: skin === 'neon' && st !== 'sign' ? 'outline' : 'solid' };
}

/**
 * The corner cut table to pass to roundSlab for a skin: candyCuts(corner) for neon and grove (round), a 45 degree cut of 2 + round(corner x 3) px for crystal.
 * Arguments: skin (one of MORE_SKINS); corner (0..1, default 0.5).
 */
export function moreSkinCuts(skin, corner = 0.5) {
  checkSkin('moreSkinCuts', skin);
  if (skin !== 'crystal') return candyCuts(corner);
  const n = 2 + Math.round(clamp01(corner) * 3);
  return Object.freeze(Array.from({ length: n }, (_, j) => n - j));
}

/**
 * Every colour a skin's marks use, from the three a sprite gives: skinTones('flat', ...) plus { core, tubeDark } (neon), { facetLight, facetDark } (crystal) or { twist, knot } (grove); disabled loses all colour.
 * Arguments: skin (one of MORE_SKINS); opt { face, frame, accent (default the first of the skin's lists), style, state ('normal', 'hover', 'pressed', 'disabled') }.
 */
export function moreSkinTones(skin, { face, frame, accent, style, state = 'normal' } = {}) {
  const st = checkSkin('moreSkinTones', skin, style);
  if (!STATES.includes(state)) throw new Error(`moreSkinTones: state "${state}" is not one of ${STATES.join(', ')}`);
  const D = DEFAULTS[skin], F = face ?? D.face, R = frame ?? D.frame, A = accent ?? D.accent;
  const T = skinTones('flat', { face: F, frame: R, accent: A, style: moreSkinBase(skin, st).style, state });
  const off = state === 'disabled', grey = (c) => (off ? desaturate(c) : c);
  if (skin === 'neon') {
    T.core = off ? T.band : state === 'hover' ? '#ffffff' : tone(T.band, 0.85);
    T.tubeDark = grey(tone(R, -1));
  } else if (skin === 'crystal') {
    T.facetLight = grey(tone(state === 'hover' ? T.band : R, 0.85));
    T.facetDark = grey(tone(R, -0.6));
  } else {
    T.twist = grey(tone(R, -1));
    T.knot = grey(tone(F, 0.45));
  }
  T.gold = grey(GOLD);
  T.white = grey('#ffffff');
  return T;
}

// ---- reading the piece -------------------------------------------------------------------------------------------

// Depth of every drawn pixel inside `box` from the nearest empty pixel (or the box's edge): 1 on the outline.
function depthIn(g, box, cap = 12) {
  const { x, y, w, h } = box, d = new Uint8Array(w * h);
  const drawn = (px, py) => px >= x && py >= y && px < x + w && py < y + h && g.get(px, py) !== 0;
  let ring = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const px = x + i, py = y + j;
    if (!drawn(px, py)) continue;
    if (!drawn(px - 1, py) || !drawn(px + 1, py) || !drawn(px, py - 1) || !drawn(px, py + 1)) { d[j * w + i] = 1; ring.push(j * w + i); }
  }
  for (let k = 2; k <= cap && ring.length; k++) {
    const next = [];
    for (const n of ring) {
      const i = n % w, j = (n - i) / w;
      for (const [a, b] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) {
        if (a < 0 || b < 0 || a >= w || b >= h) continue;
        const m = b * w + a;
        if (!d[m] && drawn(x + a, y + b)) { d[m] = k; next.push(m); }
      }
    }
    ring = next;
  }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (!d[j * w + i] && drawn(x + i, y + j)) d[j * w + i] = cap;
  return (px, py) => (px < x || py < y || px >= x + w || py >= y + h ? 0 : d[(py - y) * w + px - x]);
}

// The four corners of a box: [corner x, corner y, step x, step y] (top left, top right, bottom right, bottom left).
const cornersOf = (b) => [[b.x, b.y, 1, 1], [b.x + b.w - 1, b.y, -1, 1], [b.x + b.w - 1, b.y + b.h - 1, -1, -1], [b.x, b.y + b.h - 1, 1, -1]];

/**
 * Turns a flat piece already drawn in `body` into a skin's look (its rings, then its corner marks): returns { inner, slice }, `inner` the flat face left (the text area to declare) and `slice` what the piece now needs from `rect`.
 * Arguments: g; body ({ x, y, w, h }: the piece's slab, as the helper returns it); skin; style; opt { piece (button, tab, panel, tooltip, housing, rail, knob, check, radio, switch, selector), face, frame, accent, state, extras (neon Glow, crystal Glints, grove Leaves), keep (the stretched middle: corner marks stay outside its columns and rows), skip (rectangles never drawn on), rect and slice (the helper's rectangle and slice: the slice returned is at least that), gold, ink }.
 */
export function moreSkinMarks(g, body, skin, style, { piece, face, frame, accent, state = 'normal', extras = false, keep = null, skip = [], rect = null, slice = null, gold, ink = INK } = {}) {
  const st = checkSkin('moreSkinMarks', skin, style);
  if (!PIECES.includes(piece)) throw new Error(`moreSkinMarks: piece "${piece}" is not one of ${PIECES.join(', ')}`);
  const T = moreSkinTones(skin, { face, frame, accent, style: st, state });
  const off = state === 'disabled';
  const goldC = gold ? (off ? desaturate(gold) : gold) : T.gold;
  const box = { x: Math.max(0, body.x), y: Math.max(0, body.y), w: Math.min(g.w, body.x + body.w) - Math.max(0, body.x), h: Math.min(g.h, body.y + body.h) - Math.max(0, body.y) };
  const depth = depthIn(g, box);
  const orig = g.data.slice();
  const at = (px, py) => (px < 0 || py < 0 || px >= g.w || py >= g.h ? 0 : orig[py * g.w + px]);
  const inks = new Set([col(ink), col(desaturate(ink))]);
  const bandC = col(T.band);
  const inSkip = (px, py) => skip.some((r) => r && px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h);
  const inKeepCols = (px) => !!keep && px >= keep.x && px < keep.x + keep.w;
  const inKeepRows = (py) => !!keep && py >= keep.y && py < keep.y + keep.h;
  // a ring mark may lie anywhere inside the outline; a corner mark only in the corner zones
  const ringOk = (px, py) => depth(px, py) >= 2 && !inks.has(at(px, py)) && !inSkip(px, py);
  const cornerOk = (px, py) => ringOk(px, py) && !inKeepCols(px) && !inKeepRows(py);
  const varying = [];
  const ring = (px, py, c) => { if (ringOk(px, py)) g.data[py * g.w + px] = col(c); };
  const mark = (px, py, c) => { if (cornerOk(px, py)) { g.data[py * g.w + px] = col(c); varying.push([px, py]); } };

  // the band: band-coloured pixels joined to the outline, found from the outermost ones inwards
  const band = new Set(), key = (px, py) => py * g.w + px;
  const todo = [];
  for (let py = box.y; py < box.y + box.h; py++) for (let px = box.x; px < box.x + box.w; px++) if (at(px, py) === bandC && depth(px, py) <= 3) { band.add(key(px, py)); todo.push([px, py]); }
  while (todo.length) {
    const [px, py] = todo.pop();
    for (const [nx, ny] of [[px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]]) if (!band.has(key(nx, ny)) && at(nx, ny) === bandC && depth(nx, ny) >= 2 && depth(nx, ny) <= 5) { band.add(key(nx, ny)); todo.push([nx, ny]); }
  }
  const isBand = (px, py) => band.has(key(px, py));
  const isInk = (px, py) => inks.has(at(px, py));
  const n4 = (px, py) => [[px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]];
  const nextTo = (set) => (px, py) => n4(px, py).some(([x, y]) => set.has(key(x, y)));
  const nextToBand = nextTo(band);
  // the colour just inside the band, down the middle column (a face, a well, a trough, a track)
  const mx = box.x + (box.w >> 1);
  let insideC = 0, bandRows = 0;
  { let passed = false; for (let py = box.y; py < box.y + box.h; py++) { if (isBand(mx, py)) { passed = true; bandRows++; continue; } const c = at(mx, py); if (passed && c && !inks.has(c)) { insideC = c; break; } } }
  if (!insideC) insideC = col(T.face);
  const isInside = (px, py) => at(px, py) === insideC;
  // the outline style's gap: inside-coloured pixels between the outline ink and the band
  const gap = new Set();
  for (const k of band) { const px = k % g.w, py = (k - px) / g.w; for (const [x, y] of n4(px, py)) if (isInside(x, y) && n4(x, y).some(([a, b]) => isInk(a, b) || depth(a, b) === 0)) gap.add(key(x, y)); }
  const outer = (px, py) => isInk(px, py) || depth(px, py) === 0 || gap.has(key(px, py));
  // the layers of the inside going inwards from a set of pixels: [[pixels next to it], [next to those], ...]
  const layersIn = (from, n) => {
    const seen = new Set([...from, ...gap]), out = [];
    let edge = [...from];
    for (let i = 0; i < n; i++) {
      const next = [];
      for (const k of edge) { const px = k % g.w, py = (k - px) / g.w; for (const [x, y] of n4(px, py)) { const kk = key(x, y); if (!seen.has(kk) && isInside(x, y) && depth(x, y) >= 2) { seen.add(kk); next.push(kk); } } }
      out.push(next.map((k) => [k % g.w, (k - (k % g.w)) / g.w]));
      edge = next;
    }
    return out;
  };
  // the layers of a set itself, from its outer edge inwards: Map key -> 0, 1, ...
  const layersOf = (set) => {
    const L = new Map(); let edge = [];
    for (const k of set) { const px = k % g.w, py = (k - px) / g.w; if (n4(px, py).some(([x, y]) => outer(x, y))) { L.set(k, 0); edge.push(k); } }
    for (let i = 1; edge.length; i++) {
      const next = [];
      for (const k of edge) { const px = k % g.w, py = (k - px) / g.w; for (const [x, y] of n4(px, py)) { const kk = key(x, y); if (set.has(kk) && !L.has(kk)) { L.set(kk, i); next.push(kk); } } }
      edge = next;
    }
    for (const k of set) if (!L.has(k)) L.set(k, 0);
    return L;
  };
  // per corner: the first pixel of the inside on the diagonal, past the band
  const firstInside = (c, du, dv, u0 = 0, v0 = 0) => {
    let passed = false;
    for (let i = 0; i < Math.max(box.w, box.h); i++) {
      const [px, py] = local(c, u0 + du * i, v0 + dv * i);
      if (isBand(px, py)) passed = true;
      else if (passed && isInside(px, py)) return i;
    }
    return 2;
  };
  const local = (c, u, v) => { const [cx, cy, sx, sy] = cornersOf(box)[c]; return [cx + sx * u, cy + sy * v]; };
  const diag = [0, 1, 2, 3].map((c) => firstInside(c, 1, 1));

  // a ring is drawn whole or not at all: one that would cross a text area is left out, so every side stays the same
  const wholeRing = (px, c) => { if (px.length && px.every(([x, y]) => ringOk(x, y))) for (const [x, y] of px) ring(x, y, c); };

  if (skin === 'neon') {
    // the tube: the band (grown by the inside's first layer when the band is 1 px), its middle line the core
    const tube = new Set(band);
    if (bandRows < 2) for (const [px, py] of layersIn(band, 1)[0]) tube.add(key(px, py));
    const TL = layersOf(tube);
    let t = 0; for (let py = box.y; py < box.y + (box.h >> 1); py++) if (tube.has(key(mx, py))) t++;
    const coreAt = t >= 2 ? Math.max(1, Math.floor((t - 1) / 2)) : -1;
    for (const k of tube) { const px = k % g.w, py = (k - px) / g.w; ring(px, py, TL.get(k) === coreAt ? T.core : T.band); }
    const inTube = (px, py) => tube.has(key(px, py));
    const inward = layersIn(tube, 2);
    // Glow: the outline style's gap between the ink and the tube, or (sign) the layer just inside the tube
    if (extras) wholeRing(st === 'sign' ? inward[0] : [...gap].map((k) => [k % g.w, (k - (k % g.w)) / g.w]), T.tubeDark);
    // the second tube: 1 px of the accent just inside the first
    if (st === 'double') wholeRing(inward[0], T.accent);
    if (st === 'sign') for (let c = 0; c < 4; c++) {
      // the gap where the tube bends (its pixels on the corner's diagonal, and one beside them), the clip just inside it
      for (let i = 0; i <= Math.max(box.w, box.h); i++) for (const [u, v] of [[i, i], [i + 1, i]]) { const [px, py] = local(c, u, v); if (inTube(px, py)) mark(px, py, T.faceDark); }
      let m = 0, passed = false;
      while (m < Math.min(box.w, box.h) >> 1) { const [px, py] = local(c, m, m); if (inTube(px, py)) passed = true; else if (passed && isInside(px, py)) break; m++; }
      for (const [u, v] of [[m, m], [m + 1, m], [m, m + 1], [m + 1, m + 1]]) mark(...local(c, u, v), T.tubeDark);
    }
  } else if (skin === 'crystal') {
    // the band lit as a bevel: its outer pixel light along the top and right, dark along the bottom and left
    const BL = layersOf(band);
    for (const k of band) {
      const px = k % g.w, py = (k - px) / g.w, d = depth(px, py);
      if (BL.get(k) !== 0) continue;
      const lowLeft = depth(px - 1, py + 1) < d, topRight = depth(px, py - 1) < d || depth(px + 1, py) < d;
      if (lowLeft) ring(px, py, T.facetDark); else if (topRight) ring(px, py, T.facetLight);
    }
    for (let c = 0; c < 4; c++) {
      const m = diag[c], top = c < 2;
      if (st === 'ice' && top) for (const [u, len] of [[m + 1, 2], [m + 2, 3], [m + 4, 1]]) {
        // hanging from the top band: the first rows of the inside under it
        const v = firstInside(c, 0, 1, u, 0);
        for (let i = 0; i < len; i++) mark(...local(c, u, v + i), i === len - 1 ? T.white : T.facetLight);
      }
      if (st === 'rime') {
        for (let i = 0; i < 4; i++) mark(...local(c, m + i, m + i), i === 3 ? T.accent : T.facetLight);
        for (const i of [1, 2]) { mark(...local(c, m + i + 1, m + i - 1), T.facetLight); mark(...local(c, m + i - 1, m + i + 1), T.facetLight); }
      }
      if (st === 'shard' && !top) for (const [u, hgt] of [[m, 4], [m + 3, 3], [m + 5, 2]]) {
        // a shard 2 px wide standing on the bottom band (just inside the ink), lit on its right, dark on its left
        let v = 0; while (v < box.h && depth(...local(c, u, v)) < 2) v++;
        for (let i = 0; i < hgt; i++) {
          const [lx, ly] = local(c, u, v + i), [rx, ry] = local(c, u + 1, v + i);
          if (i < hgt - 1) mark(lx, ly, c === 3 ? T.facetDark : T.facetLight);
          mark(rx, ry, i === hgt - 1 ? T.white : c === 3 ? T.facetLight : T.facetDark);
        }
      }
      if (extras) {
        // on the band beside the corner's cut, 2 px in from the outline, so even a button's short corner zone holds it
        if (top) for (const [u, v] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) mark(...local(c, m + 1 + u, 2 + v), T.white);
        else for (const [u, v] of [[0, 0], [1, 1], [-1, -1]]) mark(...local(c, m + 1 + u, 2 + v), T.accent);
      }
    }
  } else {
    if (st === 'bark') {
      // the inner part of the band and the face's first ring in the band's dark tone; the outer pixel stays the band
      const BL = layersOf(band);
      for (const k of band) { const px = k % g.w, py = (k - px) / g.w; if (BL.get(k) > 0) ring(px, py, T.twist); }
      wholeRing(layersIn(band, 1)[0], T.twist);
      for (let c = 0; c < 4; c++) { const m = diag[c] + 1; for (const [u, v] of [[m, m], [m + 1, m], [m, m + 1], [m + 1, m + 1]]) mark(...local(c, u, v), T.knot); }
    } else {
      // vine and bloom: the band twists in the corners
      for (let c = 0; c < 4; c++) for (let v = 0; v < box.h >> 1; v++) for (let u = 0; u < box.w >> 1; u++) {
        const [px, py] = local(c, u, v);
        if (isBand(px, py) && (u + v) % 2 === 0) mark(px, py, T.twist);
      }
    }
    if (st === 'bloom') for (let c = 0; c < 4; c++) {
      const m = diag[c] + 1;
      if (c < 2) {
        mark(...local(c, m, m), goldC);
        for (const [u, v] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) mark(...local(c, m + u, m + v), T.accent);
      } else {
        // a bud on the vine in each bottom corner, so the style shows at the bottom too: the accent over its dark tone
        mark(...local(c, m, 2), T.accent); mark(...local(c, m, 1), off ? desaturate(tone(T.accent, -1)) : tone(T.accent, -1));
      }
    }
    if (extras) for (let c = 0; c < 4; c++) {
      // two leaves over the band: one along the top or bottom, one along the side
      const v0 = 1, D = tone(T.accent, -1);
      const along = [[0, 0, D], [1, 0, T.accent], [2, 0, T.accent], [0, 1, T.accent], [1, 1, T.accent], [2, 1, D]];
      for (const [u, v, k] of along) mark(...local(c, 5 + u, v0 + v), off ? desaturate(k) : k);
      for (const [u, v, k] of along) mark(...local(c, v0 + v, 5 + u), off ? desaturate(k) : k);
    }
  }

  // the flat face left: the first text area (or the middle), with any edge that holds another colour left out
  let a = skip[0] ? { ...skip[0] } : (() => { const m = bandRows + 5; return { x: box.x + m, y: box.y + m, w: box.w - 2 * m, h: box.h - 2 * m }; })();
  {
    const c = g.get(a.x + (a.w >> 1), a.y + (a.h >> 1));
    const rowOk = (py) => { for (let px = a.x; px < a.x + a.w; px++) if (g.get(px, py) !== c) return false; return true; };
    const colOk = (px) => { for (let py = a.y; py < a.y + a.h; py++) if (g.get(px, py) !== c) return false; return true; };
    let guard = 400;
    while (a.w > 0 && a.h > 0 && guard--) {
      if (!rowOk(a.y)) { a.y++; a.h--; } else if (!rowOk(a.y + a.h - 1)) a.h--; else if (!colOk(a.x)) { a.x++; a.w--; } else if (!colOk(a.x + a.w - 1)) a.w--; else break;
    }
  }
  // the slice: the helper's, or more where a corner mark reaches further in
  const R = rect ?? body, S = slice ? { ...slice } : { left: 0, top: 0, right: 0, bottom: 0 };
  for (const [px, py] of varying) {
    if (px < R.x + R.w / 2) S.left = Math.max(S.left, px - R.x + 1); else S.right = Math.max(S.right, R.x + R.w - px);
    if (py < R.y + R.h / 2) S.top = Math.max(S.top, py - R.y + 1); else S.bottom = Math.max(S.bottom, R.y + R.h - py);
  }
  return { inner: a, slice: S };
}

/**
 * Draws a menu pointer of a skin pointing right, `size` px long from its tail at (x, y) to its tip, moved `bob` px towards its tip: neon a hollow tube arrow whose core goes dark on one frame in eight, crystal a faceted shard, grove a leaf. Never a hand. Returns { tip }: its rightmost pixel.
 * Arguments: g; x, y (the tail end, on the middle row); size (px, 10 or more); skin; style; opt { frame, accent (neon: the core; crystal: a glint; grove: the vein), bob, t (0..1 of the loop), ink }.
 */
export function moreSkinPointer(g, x, y, size, skin, style, { frame, accent, bob = 0, t = 0, ink = INK } = {}) {
  checkSkin('moreSkinPointer', skin, style);
  const D = DEFAULTS[skin], R = frame ?? D.frame, A = accent ?? D.accent;
  const L = Math.max(10, Math.round(size)) - 2, x0 = x + 1 + Math.round(bob), tipX = x0 + L - 1;
  const s = new Surface(g.w, g.h);
  if (skin === 'neon') {
    // a hollow chevron of tube, 3 px thick: its edges the tube colour, its middle line the core
    const hh = Math.max(3, Math.round(L * 0.4)), bx = tipX - hh - 1;
    const m = new Surface(g.w, g.h);
    m.limb(bx, y - hh + 0.5, tipX - 1, y + 0.5, 3, '#ffffff');
    m.limb(tipX - 1, y + 0.5, bx, y + hh + 0.5, 3, '#ffffff');
    m.rect(x0, y - 1, Math.max(2, bx - x0 - 1), 3, '#ffffff');
    const frameNo = Math.floor(((t % 1) + 1) % 1 * 8 + 1e-9) % 8;
    const core = frameNo === 7 ? tone(R, -1) : A;
    for (let py = 0; py < g.h; py++) for (let px = 0; px < g.w; px++) {
      if (!m.get(px, py)) continue;
      const edge = !m.get(px - 1, py) || !m.get(px + 1, py) || !m.get(px, py - 1) || !m.get(px, py + 1);
      s.dot(px, py, edge ? R : core);
    }
  } else if (skin === 'crystal') {
    // a faceted shard: a long diamond, its upper facet light, its lower facet dark, a lit ridge and a glint
    const hh = Math.max(3, Math.round(L * 0.3)), mx = x0 + Math.round(L * 0.35);
    s.fill(x0, y - hh, tipX + 1, y + hh + 1, polyIn([[x0, y + 0.5], [mx, y - hh + 0.5], [tipX + 1, y + 0.5], [mx, y + hh + 1.5]]), tone(R, -0.6));
    s.fill(x0, y - hh, tipX + 1, y + 1, (px, py) => polyIn([[x0, y + 0.5], [mx, y - hh + 0.5], [tipX + 1, y + 0.5], [mx, y + hh + 1.5]])(px, py) && py < y + 0.5, tone(R, 0.85));
    for (let px = x0 + 1; px < tipX; px++) if (s.get(px, y)) s.dot(px, y, R);
    s.dot(mx, y - hh + 2, A);
  } else {
    // a leaf: a lens of the vine colour pointing right, a vein of the accent along its middle, a stalk at the back
    const hh = Math.max(2, Math.round(L * 0.25)), lx = x0 + 2, len = tipX - lx + 1;
    s.fill(lx, y - hh, tipX + 1, y + hh + 1, (px, py) => {
      const k = (px - lx) / len; if (k < 0 || k > 1) return false;
      const half = hh * Math.sin(Math.PI * Math.min(1, k * 1.15)) + 0.35;
      return Math.abs(py - (y + 0.5)) <= half && (k < 0.97 || Math.abs(py - (y + 0.5)) < 0.5);
    }, R);
    for (let px = lx + 1; px < tipX - 1; px++) if (s.get(px, y)) s.dot(px, y, A);
    s.rect(x0, y, 2, 1, tone(R, -1));
    for (let px = lx; px < lx + Math.round(len * 0.4); px++) if (s.get(px, y + 1) && !s.get(px, y + 2)) s.dot(px, y + 1, tone(R, -0.6));
  }
  s.outline(ink);
  g.blit(s);
  let tx = -1, ty = y;
  for (let px = g.w - 1; px >= 0 && tx < 0; px--) if (s.get(px, y)) { tx = px; ty = y; }
  if (tx < 0) { const b = s.bounds(); tx = b.x1; ty = y; }
  return { tip: { x: tx, y: ty } };
}
