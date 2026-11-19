// Gilded corner plates (added with batch K14, bundles/specs/core-sprites-2.md): the temple, royal and ruin styles of
// the `gilded` skin of engine/ui-skins.js, drawn as a gold plate in each corner of a piece that module has already
// drawn. skinPanel and skinButton draw each style only as a few pixels in a 1 to 2 px band, mostly under the gems,
// so the three styles read the same: use this after the helper, on the piece's body, so each style shows its motif.
//
//   const out = skinButton(g, 1, 1, 94, 30, clip, 'gilded', { ...look, extras: false });
//   gildedCorners(g, out.body, p.style, { face: p.face, frame: p.frame, accent: p.accent, corner: p.corner, state: clip, gems: p.gems, keep });
//
// Each corner gets a plate up to 6x6 px inside the outline (the outline itself is never touched), its outer row and
// column bevelled (lit along the top and right, dark along the bottom and left), with a 3x3 gem set in it:
//   temple   bright gold, a key line of 1 px steps in ink round the gem's inner side
//   royal    bright gold, a dark scroll groove round the gem and three lit dots outside it
//   ruin     tarnished (the band's dark tone), the outer corner chipped away and a crack running past the gem
// Without gems the gem's place is plain plate with a mark in its middle (temple ink, royal a lit dot, ruin ink).
// `keep` is the stretched middle ({ x, y, w, h }, as a nine-slice repeats it): plates stay outside both its columns
// and its rows, so a plate is cropped (a button's bottom corners keep 4 of its 6 rows); `skip` lists rectangles
// never drawn on (text areas). `size` crops every plate to its first size x size cells (small pieces).
// `lit` lights the gems (a hover). A disabled state draws everything without colour, as the helper does.

import { tone, col, INK } from './color.js';
import { desaturate, cutRectIn, roundRectIn, cornerPx, borderPx } from './ui.js';
import { skinTones } from './ui-skins.js';

/** The gilded styles gildedCorners knows: temple, royal and ruin. No arguments: a frozen list. */
export const GILDED_STYLES = Object.freeze(['temple', 'royal', 'ruin']);

// Plates for the top left corner, row j (from the outline inwards) by column i. T: the outer row's bevel; S: the
// outer column's; G gold; L lit; D dark; o ink; g gem; x a chip (ink, and the outline outside it cleared); '.' left.
const PLATES = {
  temple: [
    'TTTTTT',
    'SgggGG',
    'SgggGG',
    'SgggGo',
    'SGGGoo',
    'SGGo..',
  ],
  royal: [
    'TTTTTT',
    'SgggDL',
    'SgggDD',
    'SgggDL',
    'SDDDDD',
    'SLDLD.',
  ],
  ruin: [
    'xx.xx.',
    'xgggDo',
    '.gggDD',
    '.ggg.o',
    'xD.o..',
    'xoD...',
  ],
};
const BASE = { temple: 'G', royal: 'G', ruin: 'D' };
const MARK = { temple: 'o', royal: 'L', ruin: 'o' };

/** The plate pattern of a style, top left corner, as rows of characters (see the comment above PLATES). */
export const gildedPlate = (style) => PLATES[style].slice();

// The outline of a gilded piece, as engine/ui-skins.js draws it (temple cut, ruin uneven cuts, royal round).
export function gildedShape(style, x, y, w, h, k) {
  if (style === 'temple') return cutRectIn(x, y, w, h, Math.min(4, k + 1));
  if (style === 'ruin') return cutRectIn(x, y, w, h, [Math.min(4, k + 2), Math.max(1, k), Math.min(4, k + 1), Math.max(0, k - 1)]);
  return roundRectIn(x, y, w, h, k);
}

/**
 * Draws a gold plate with the style's motif (and a gem) in each corner of a gilded piece already drawn in `body`.
 * Arguments: g; body ({ x, y, w, h }: the piece's own box, as the helper returns it); style; opt { face, frame, accent, state (as skinTones), corner (0..1, as given to the helper) or cornerPx, gems (default true), lit (gems lit), shape (the piece's outline as inside(px, py), when it is not the panel's), ring (false: no temple fillet or royal cushion), dull (false: ruin keeps its lit line), bandPx or border with bandCap (the band's width, for the ring), openBottom (a tab), keep, skip, size (1..6), corners (which: 'tl', 'tr', 'br', 'bl'; default all), ink }.
 * Returns g. Only pixels inside the piece's outline, outside `keep`'s middle and `skip`, are changed.
 */
export function gildedCorners(g, body, style, opt = {}) {
  if (!GILDED_STYLES.includes(style)) throw new Error(`gildedCorners: style "${style}" is not one of ${GILDED_STYLES.join(', ')}`);
  const { x, y, w, h } = body;
  const state = opt.state ?? 'normal', off = state === 'disabled', gems = opt.gems ?? true, lit = !!opt.lit;
  const ink = opt.ink ?? INK, size = Math.max(1, Math.min(6, opt.size ?? 6));
  const T = skinTones('gilded', { face: opt.face, frame: opt.frame, accent: opt.accent, style, state: off ? 'disabled' : state === 'hover' ? 'hover' : 'normal' });
  const k = Math.max(0, Math.min(4, opt.cornerPx ?? cornerPx(opt.corner ?? 0.5)));
  const inside = opt.shape ?? gildedShape(style, x, y, w, h, k);
  const isIn = (px, py) => inside(px + 0.5, py + 0.5);
  const interior = (px, py) => isIn(px, py) && isIn(px - 1, py) && isIn(px + 1, py) && isIn(px, py - 1) && isIn(px, py + 1);
  const keep = opt.keep, skip = opt.skip ?? [];
  const onGrid = (px, py) => px >= 0 && py >= 0 && px < g.w && py < g.h;
  const skipped = (px, py) => skip.some((r) => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h);
  const inMiddle = (px, py) => !!keep && ((px >= keep.x && px < keep.x + keep.w) || (py >= keep.y && py < keep.y + keep.h));
  const free = (px, py) => onGrid(px, py) && !inMiddle(px, py) && !skipped(px, py);
  const grey = (c) => col(off ? desaturate(c) : c);
  const A = lit ? tone(T.accent, 0.45) : T.accent;
  const gemHi = lit ? '#ffffff' : tone(T.accent, 0.85), gemLo = lit ? T.accent : T.accentDark;
  if (style !== 'ruin' && opt.ring !== false) {
    // the ring on the first row of stone inside the band, the same in every column and row of the stretched middle
    // (so the piece still stretches): temple a 1 px gold fillet that the corner plates step into the band; royal a
    // cushion, the stone's light tone along the top and right and its dark tone along the bottom and left
    const b = Math.max(1, Math.min(opt.bandCap ?? 3, opt.bandPx ?? borderPx(opt.border ?? 0.5))), f = b + 2;
    const stone = new Set([T.face, T.faceDark].map(grey));
    for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) {
      const u = px - x, v = py - y, ru = x + w - 1 - px, rv = opt.openBottom ? Infinity : y + h - 1 - py;
      if (Math.min(u, v, ru, rv) !== f || !onGrid(px, py) || !interior(px, py) || skipped(px, py)) continue;
      const here = g.get(px, py);
      if (!stone.has(here)) continue;
      let c = T.band;
      if (style === 'royal') c = v === f || ru === f ? tone(here === grey(T.face) ? T.face : T.faceDark, 0.45) : tone(here === grey(T.face) ? T.face : T.faceDark, -1);
      g.data[py * g.w + px] = grey(c);
    }
  }
  if (style === 'ruin' && opt.dull !== false) {
    // the ruin's gold has lost its shine: the band's lit line along the top and right turns to the plain band (the
    // same in every column and row, so the piece still stretches)
    const lit = grey(T.bandLight), plain = grey(T.band);
    for (let py = Math.max(0, y); py < Math.min(g.h, y + h); py++) for (let px = Math.max(0, x); px < Math.min(g.w, x + w); px++) {
      if (g.data[py * g.w + px] === lit && !skipped(px, py)) g.data[py * g.w + px] = plain;
    }
  }
  const which = opt.corners ?? ['tl', 'tr', 'br', 'bl'];
  const C = { tl: [x, y, 1, 1], tr: [x + w - 1, y, -1, 1], br: [x + w - 1, y + h - 1, -1, -1], bl: [x, y + h - 1, 1, -1] };
  for (const name of which) {
    const [cx, cy, sx, sy] = C[name];
    const rows = PLATES[style];
    const gem = [];
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      let ch = rows[j][i];
      if (ch === '.') continue;
      const px = cx + sx * (i + 1), py = cy + sy * (j + 1);
      if (!free(px, py) || !interior(px, py)) continue;
      if (ch === 'g' && !gems) ch = i === 2 && j === 2 ? MARK[style] : BASE[style];
      if (ch === 'g') { gem.push([px, py]); continue; }
      if (ch === 'x') {
        g.data[py * g.w + px] = grey(ink);
        // the outline just outside a chip goes, where it is the piece's silhouette
        for (const [ox, oy] of [[px - sx, py], [px, py - sy], [px - sx, py - sy]]) {
          if (!free(ox, oy) || !g.get(ox, oy) || interior(ox, oy)) continue;
          const open = !g.get(ox - sx, oy) || !g.get(ox, oy - sy);
          if (open) g.data[oy * g.w + ox] = 0;
        }
        continue;
      }
      const c = ch === 'T' ? (sy > 0 ? T.bandLight : T.bandDark)
        : ch === 'S' ? (sx > 0 ? T.bandDark : T.bandLight)
        : ch === 'G' ? T.band : ch === 'L' ? T.bandLight : ch === 'D' ? T.bandDark : ink;
      g.data[py * g.w + px] = grey(c);
    }
    if (gem.length) {
      // the gem: its top right pixel catches the light, its bottom left is in shadow, whatever corner it sits in
      const xs = gem.map((q) => q[0]), ys = gem.map((q) => q[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      for (const [px, py] of gem) {
        const c = px === x1 && py === y0 ? gemHi : px === x0 && py === y1 ? gemLo : A;
        g.data[py * g.w + px] = grey(c);
      }
    }
  }
  return g;
}

/**
 * Lifts a gilded piece's dark gold (the band's left and bottom sides and the lip, tone(frame, -1)) to tone(frame, -0.35) inside a box: the hover signal of a pale gold that has no room left to brighten.
 * Arguments: g; box ({ x, y, w, h }); frame (the gold the piece was drawn with). Returns g.
 */
export function gildedLift(g, box, frame) {
  const dark = col(tone(frame, -1)), lift = col(tone(frame, -0.35));
  for (let py = Math.max(0, box.y); py < Math.min(g.h, box.y + box.h); py++) for (let px = Math.max(0, box.x); px < Math.min(g.w, box.x + box.w); px++) {
    if (g.data[py * g.w + px] === dark) g.data[py * g.w + px] = lift;
  }
  return g;
}

// The end-cap marks of a bar housing, outer column first, the row next to the gem last (the block under the gem is
// the same block flipped): temple an ink key hook, royal three lit dots on a dark groove, ruin a crack and a dull patch.
const CAPS = {
  temple: ['ooo.', '..o.', 'o.o.'],
  royal: ['DLD.', 'LDL.', 'DDD.'],
  ruin: ['.o..', 'Do..', '.oD.'],
};

/**
 * Marks the solid gold end caps of a gilded bar housing (skinBarHousing with `caps`) with the style's motif, above and below the cap's gem: only gold pixels of the caps change.
 * Arguments: g; opening (the housing's trough, from skinBarOpening); caps (px, as given to the housing); style; opt { frame, accent, state, ink }. Returns g.
 */
export function gildedCaps(g, opening, caps, style, opt = {}) {
  if (!GILDED_STYLES.includes(style)) throw new Error(`gildedCaps: style "${style}" is not one of ${GILDED_STYLES.join(', ')}`);
  const off = opt.state === 'disabled', ink = opt.ink ?? INK;
  const T = skinTones('gilded', { frame: opt.frame, accent: opt.accent, style, state: off ? 'disabled' : 'normal' });
  const grey = (c) => col(off ? desaturate(c) : c);
  const gold = new Set([T.band, T.bandLight].map(grey));
  const o = opening, cy = o.y + (o.h >> 1) - 1, rows = CAPS[style];
  const ends = [[o.x - 1 - caps, 1], [o.x + o.w + caps, -1]];
  for (const [x0, sx] of ends) for (const [y0, sy] of [[cy - 1, -1], [cy + 3, 1]]) {
    rows.forEach((row, r) => [...row].forEach((ch, i) => {
      if (ch === '.' || i >= caps) return;
      const px = x0 + sx * i, py = y0 + sy * (rows.length - 1 - r);
      if (!gold.has(g.get(px, py))) return;
      g.data[py * g.w + px] = grey(ch === 'o' ? ink : ch === 'L' ? T.bandLight : ch === 'D' ? T.bandDark : T.band);
    }));
  }
  return g;
}
