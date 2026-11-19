// Crystal bars and slider (core-sprites-3, batch K26): health and mana bars in a tube of cut crystal, and a slider,
// matching ui-buttons-crystal.
// A game draws `frame` (the empty housing: the crystal band lit as a bevel round a dark trough), then a fill strip over
// it, cropped from the right to the value: `fill` is health, `fill-b` magic, `fill-c` a gauge. Every strip is plain
// flat colour and fits the housing's opening exactly. `flash` is the health strip turning white and settling back
// (4 frames at a fixed 8 a second). `slider` is a rail a game stretches sideways; `knob` a slab of deep ice (cavern,
// the skin's default stone) in the crystal band.
// Styles and Glints as ui-buttons-crystal. The housing, rail and knob are drawn by the flat helpers of
// engine/ui-skins.js (style from moreSkinBase) and finished by moreSkinMarks (pieces 'housing', 'rail', 'knob'). As in
// ui-bars-neon they are not re-cut with roundSlab: the flat bar helpers round their own corners from Corner (a 14 px
// housing has no room for roundSlab's 7 px corner square), and skinBarHousing already draws Border's band 1 to 3 px.
//
// The housing's band lies between two ink lines and the rail's is 1 px, so moreSkinMarks only lights their bands as
// a bevel here; the style's icicles, frost and shards and the Glints are drawn at fixed places in each end with
// engine/ui-crystal-frost.js (housingMarks, railMarks, knobMarks below): in the trough's ends (a full fill strip
// covers them), over the rail's ends and on the knob. Glints are 16 px on the housing, the rail and the knob.
//
// Stretching (`slice`; Contract 8): housing and strips { left, top, right, bottom, opening }: at least 8 left and
// right and 4 top and bottom, more where a mark reaches further in (10 to 13 px at the ends, the trough's rows when a
// mark lies in them), the opening from skinBarOpening with the housing's own options; the slider 19 left and right
// (its marks and glints), 8 top and bottom; the knob only its `rect`.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { Surface } from '../engine/surface.js';
import { PALETTE } from '../engine/palettes.js';
import { skinBarOpening, skinBarHousing, skinBarFill, skinSlider, skinKnob, skinSwatches } from '../engine/ui-skins.js';
import { MORE_SKIN_STYLES, moreSkinBase, moreSkinMarks, moreSkinTones } from '../engine/ui-skins-more.js';
import { borderPx } from '../engine/ui.js';
import { crystalFern, crystalShards, crystalIcicles, crystalGlint, crystalOnPiece } from '../engine/ui-crystal-frost.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const SIZE = [64, 16];
const BOX = [1, 1, SIZE[0] - 2, SIZE[1] - 2];
const KNOB = 12;
const SW = skinSwatches('flat', {
  face: [P.cavern],
  frame: [P.sky, P.goblin, D.cyan, H.heal],
  accent: [P.magic, P.crimson, P.moss, D.xp, H.thunder],
});
// The housing's band is 2 px (Thin and the middle) or 3 px (Thick): a bevel needs a lit and a dark pixel.
const look = (p) => ({ style: moreSkinBase('crystal', p.style).style, face: P.cavern, frame: p.frame, accent: p.accent, borderPx: Math.max(2, borderPx(p.border)), corner: p.corner });
const opening = (p) => skinBarOpening(...BOX, 'flat', look(p));
// moreSkinMarks lights the band as a bevel; its corner marks are left out (keep is the whole piece), because a bar
// housing's band lies between two ink lines and a rail's is 1 px, so they would land cut short or on the ink. The
// corner marks are drawn here instead, at fixed places, with engine/ui-crystal-frost.js.
const bevel = (g, body, piece, p, slice, skip = []) => moreSkinMarks(g, body, 'crystal', p.style, { piece, face: P.cavern, frame: p.frame, accent: p.accent, extras: false, rect: body, slice, keep: body, skip });
const tones = (p) => moreSkinTones('crystal', { face: P.cavern, frame: p.frame, accent: p.accent, style: p.style });

// The housing's two ends (mirrored): in the trough's first 8 columns, the style (ice: three 1 px icicles 2, 3 and 1
// px long hanging from its top row, a column apart, from its 4th column, clear of the plus over the ring; rime: a frost fern from its top corner, a 4 px stem with two
// branches each side and its accent tip; shard: two upright shards, the trough's height less 1 and less 3, a column
// apart, standing on its bottom row); on the band over that end, a white plus (its lower arm on the ring) and an
// accent sparkle on the bottom band (one pixel on the ring): 16 px of glints in all. Returns the pixels painted.
function housingMarks(g, o, p) {
  const T = tones(p), can = crystalOnPiece(g), out = [];
  const inTrough = (px, py) => px >= o.x && px < o.x + o.w && py >= o.y && py < o.y + o.h;
  for (const [x, sx] of [[o.x, 1], [o.x + o.w - 1, -1]]) {
    if (p.style === 'ice') out.push(...crystalIcicles(g, x + sx * 3, o.y, sx, [2, Math.min(3, o.h - 1), 1], { light: T.facetLight, tip: T.white, can }));
    if (p.style === 'rime') out.push(...crystalFern(g, x, o.y, sx, 1, { stem: T.facetLight, tip: T.accent, len: Math.min(4, o.h - 1), can }));
    if (p.style === 'shard') out.push(...crystalShards(g, x, o.y + o.h - 1, sx, [o.h - 1, Math.max(2, o.h - 3)], { light: T.facetLight, dark: T.facetDark, tip: T.white, can }));
    if (p.glints) {
      // never in the trough itself: a fill strip covers it
      const off = crystalOnPiece(g, (px, py) => !inTrough(px, py));
      out.push(...crystalGlint(g, x + sx, o.y - 2, 'plus', { color: T.white, can: off }));
      out.push(...crystalGlint(g, x + sx, o.y + o.h + 1, 'sparkle', { color: T.accent, sx, sy: -1, can: off }));
    }
  }
  return out;
}

// The rail's two ends (mirrored), in its columns 4 to 12 from the end: the style over the 2 px track and the bands
// (ice: two icicles 2 and 1 px long; rime: frost creeping in from the bottom and the top corner, two ferns each a
// 3 px stem with two branches each side and an accent tip on the far band; shard: two shards 4 and 3 px tall
// standing on the bottom band), then in columns 13 to 18 a white plus and, lower, an accent sparkle: 16 px of
// glints. Returns the pixels painted.
function railMarks(g, r, p) {
  const T = tones(p), can = crystalOnPiece(g), out = [];
  for (const [x, sx] of [[r.x + 3, 1], [r.x + r.w - 4, -1]]) {
    if (p.style === 'ice') out.push(...crystalIcicles(g, x + sx, r.y + 2, sx, [2, 1], { light: T.facetLight, tip: T.white, can }));
    if (p.style === 'rime') {
      out.push(...crystalFern(g, x, r.y + 4, sx, -1, { stem: T.facetLight, tip: T.accent, len: 3, can }));
      out.push(...crystalFern(g, x + sx * 5, r.y + 1, sx, 1, { stem: T.facetLight, tip: T.accent, len: 3, can }));
    }
    if (p.style === 'shard') out.push(...crystalShards(g, x, r.y + 4, sx, [4, 3], { light: T.facetLight, dark: T.facetDark, tip: T.white, can }));
    if (p.glints) {
      out.push(...crystalGlint(g, x + sx * 11, r.y + 2, 'plus', { color: T.white, can }));
      out.push(...crystalGlint(g, x + sx * 13, r.y + 3, 'sparkle', { color: T.accent, sx, sy: -1, can }));
    }
  }
  return out;
}

// The knob (a 12 px slab, its face 8 px wide): a white plus in each top corner and an accent sparkle in each bottom
// corner (16 px, where moreSkinMarks puts them), and the style in the free middle (ice: two icicles 3 and 2 px
// hanging between the pluses; rime: one fern growing up across the face from the bottom left corner, a 4 px stem
// with two branches each side and its accent tip (two would meet in a V on an 8 px face); shard: two shards 5 and 3 px tall). The glints are drawn last, over the style.
function knobMarks(g, k, p) {
  const T = tones(p), can = crystalOnPiece(g);
  const L = k.x + 2, R = k.x + k.w - 3, top = k.y + 2, bot = k.y + k.h - 3;   // the face's corner pixels
  if (p.style === 'ice') crystalIcicles(g, L + 3, top, 1, [3, 2], { light: T.facetLight, tip: T.white, gap: 0, can });
  if (p.style === 'rime') crystalFern(g, L, bot - 1, 1, -1, { stem: T.facetLight, tip: T.accent, len: 4, can });
  if (p.style === 'shard') crystalShards(g, L + 2, bot, 1, [5, 3], { light: T.facetLight, dark: T.facetDark, tip: T.white, can });
  if (p.glints) for (const [x, sx] of [[L, 1], [R, -1]]) {
    crystalGlint(g, x + sx, top, 'plus', { color: T.white, can });
    crystalGlint(g, x + sx, bot, 'sparkle', { color: T.accent, sx, sy: -1, can });
  }
}

// The slice a piece needs from its rectangle `r`: `base`, or more where a pixel of `pts` lies further in.
function reach(base, pts, r) {
  const S = { ...base };
  for (const [px, py] of pts) {
    if (px < r.x + r.w / 2) S.left = Math.max(S.left, px - r.x + 1); else S.right = Math.max(S.right, r.x + r.w - px);
    if (py < r.y + r.h / 2) S.top = Math.max(S.top, py - r.y + 1); else S.bottom = Math.max(S.bottom, r.y + r.h - py);
  }
  return S;
}

// Draws the housing, the rail or the knob and returns the slice it needs (from its rectangle).
function piece(g, clip, p) {
  if (clip === 'frame') {
    const o = skinBarHousing(g, ...BOX, 'flat', look(p));
    const body = { x: BOX[0], y: BOX[1], w: BOX[2], h: BOX[3] };
    // the opening stays the trough: a fill strip covers it exactly, so the bevel never lies in it
    const m = bevel(g, body, 'housing', p, { left: 7, top: 3, right: 7, bottom: 3 }, [o]);
    return { body, slice: reach(m.slice, housingMarks(g, o, p), body) };
  }
  if (clip === 'slider') {
    const { rail, slice } = skinSlider(g, ...BOX, 'flat', look(p));
    const m = bevel(g, rail, 'rail', p, slice);
    return { body: rail, slice: reach(m.slice, railMarks(g, rail, p), rail) };
  }
  const { rect } = skinKnob(g, SIZE[0] >> 1, SIZE[1] >> 1, KNOB, 'flat', look(p));
  bevel(g, rect, 'knob', p, null);
  knobMarks(g, rect, p);
  return { body: rect };
}
function slice(clip, p) {
  if (clip === 'knob') return { rect: piece(new Surface(...SIZE), clip, p).body };
  const out = piece(new Surface(...SIZE), clip === 'slider' ? 'slider' : 'frame', p);
  const s = { left: Math.max(8, out.slice.left + 1), right: Math.max(8, out.slice.right + 1) };
  if (clip === 'slider') return { ...s, top: 8, bottom: 8 };
  return { ...s, top: Math.max(4, out.slice.top + 1), bottom: Math.max(4, out.slice.bottom + 1), opening: opening(p) };
}

export default defineSprite({
  id: 'ui-bars-crystal',
  name: 'Crystal bars and slider',
  kind: 'Item',
  blurb: 'A bar housing in a tube of cut crystal lit like a bevel, with three fill strips (health, mana, a gauge), a white flash, a slider track and its knob; change the style, corners, band, glints and colours.',
  meta: {
    type: 'ui', role: 'interface/bar', themes: ['neutral', 'fantasy'], gameTypes: ['arcade', 'turn-based-rpg', 'puzzle', 'top-down-rpg'], view: 'none',
    words: ['bar', 'health', 'mana', 'slider', 'meter', 'progress', 'crystal', 'ice', 'frost', 'frozen'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [32, 8],
  grounded: false,
  preview: 'frame',
  slice,
  params: {
    style: choice('Style', 'ice', [...MORE_SKIN_STYLES.crystal]),
    corner: range('Corner', 0.5, { lo: 'Square', hi: 'Round' }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    glints: toggle('Glints', true),
    frame: color('Crystal', P.sky, SW.frame, { material: 'magic' }),
    accent: color('Sparkles and frost tips', P.magic, SW.accent, { material: 'magic', when: [{ glints: [true] }, { style: ['rime'] }] }),
    fill: color('Health', P.grass, [P.grass, P.leaf, P.crimson, P.ember, P.magic, P.gold]),
    fillB: color('Magic', P.hero, [P.hero, P.water, P.magic, P.sky, D.shield]),
    fillC: color('Gauge', P.gold, [P.gold, P.ember, P.moss, P.wood, P.steel]),
  },
  clips: {
    frame: { frames: 1, fps: 8, loop: true, label: 'Housing' },
    fill: { frames: 1, fps: 8, loop: true, label: 'Health' },
    'fill-b': { frames: 1, fps: 8, loop: true, label: 'Magic' },
    'fill-c': { frames: 1, fps: 8, loop: true, label: 'Gauge' },
    flash: { frames: 4, fps: 8, loop: false },
    slider: { frames: 1, fps: 8, loop: true, label: 'Slider track' },
    knob: { frames: 1, fps: 8, loop: true, label: 'Slider knob' },
  },
  // Frost ends and Shard, plain carry a Thick border beyond the specification's settings: as written they measured
  // 0.13 and 0.17 from the others at card size (VERSION_RULES.between 0.2)
  versions: [
    { name: 'Ice bars', params: {} },
    { name: 'Frost ends', params: { style: 'rime', accent: P.crimson, frame: D.cyan, border: 1 } },
    { name: 'Shard, plain', params: { style: 'shard', glints: false, frame: P.goblin, border: 1 } },
    { name: 'Mint', params: { frame: H.heal, fill: P.magic } },
  ],
  render(g, { clip, t, p }) {
    if (clip === 'frame' || clip === 'slider' || clip === 'knob') { piece(g, clip, p); return; }
    const fill = clip === 'fill-b' ? p.fillB : clip === 'fill-c' ? p.fillC : p.fill;
    skinBarFill(g, opening(p), 1, 'flat', { fill, flash: clip === 'flash' ? 1 - t : 0 });
  },
});
