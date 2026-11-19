// Vine bars and slider (core-sprites-3, batch K27): a stamina or growth bar in a pale living vine round a dark
// trough, and a slider, matching ui-buttons-grove.
// A game draws `frame` (the empty housing), then a fill strip over it, cropped from the right to the value: `fill` is
// health, `fill-b` magic, `fill-c` a gauge. Every strip is plain flat colour and fits the housing's opening exactly.
// `flash` is the health strip turning white and settling back (4 frames at a fixed 8 a second). `slider` is a rail a
// game stretches sideways; `knob` a bark-coloured (soil) slab in the vine.
// Styles and Leaves as ui-buttons-grove. The housing, rail and knob are drawn by the flat helpers of
// engine/ui-skins.js and finished by moreSkinMarks (pieces 'housing', 'rail', 'knob'). They are not re-cut with
// roundSlab, as ui-bars-neon settled: the flat bar helpers round their own corners from Corner (a 14 px housing has no
// room for roundSlab's 7 px corner square), and skinBarHousing already draws Border's band 1 to 3 px.
//
// Stretching (`slice`; Contract 8): housing and strips { left 8, top 4, right 8, bottom 4, opening } (more where a
// mark reaches further in), the opening from skinBarOpening with the housing's own options; the slider 8 left and
// right; the knob only its `rect`.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { Surface } from '../engine/surface.js';
import { PALETTE } from '../engine/palettes.js';
import { skinBarOpening, skinBarHousing, skinBarFill, skinSlider, skinKnob, skinSwatches } from '../engine/ui-skins.js';
import { MORE_SKIN_STYLES, moreSkinBase } from '../engine/ui-skins-more.js';
import { groveMarks } from '../engine/ui-grove-vine.js';
import { borderPx } from '../engine/ui.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const SIZE = [64, 16];
const BOX = [1, 1, SIZE[0] - 2, SIZE[1] - 2];
const KNOB = 12;
const SW = skinSwatches('flat', {
  face: [P.soil],
  frame: [P.goblin, H.heal, H.wheat, P.cream],
  accent: [P.grass, P.crimson, P.ember, P.thorn, P.hero],
});
// The housing's band is 2 px (Thin and the middle) or 3 px (Thick), so the bark ring and the twist have room.
const look = (p) => ({ style: moreSkinBase('grove', p.style).style, face: P.soil, frame: p.frame, accent: p.accent, borderPx: Math.max(2, borderPx(p.border)), corner: p.corner });
const opening = (p) => skinBarOpening(...BOX, 'flat', look(p));
// keep: the stretched middle (the housing's 8 px left and right, 4 top and bottom; the rail's columns), where the
// twists, knots, flowers and leaves may not go
// groveMarks (engine/ui-grove-vine.js): moreSkinMarks, then the striped twist, the rimmed leaves and the bloom flower;
// the band is all the housing has outside its opening, so leaves and flower may cover the ink ring round the trough
// (overInk), never the opening itself (skip)
const marks = (g, body, piece, p, slice, keep = null, skip = [], at = body) => groveMarks(g, at, p.style, { piece, face: P.soil, frame: p.frame, accent: p.accent, leaves: p.leaves, leafAt: 6, sideLeaf: false, overInk: true, rect: body, slice, keep, skip });
// the corner zones reach 16 px along the housing: the twist, the flower and both leaves
const KEEP = { x: 17, y: 5, w: SIZE[0] - 34, h: SIZE[1] - 10 };


// Draws the housing, the rail or the knob and returns the slice moreSkinMarks says it needs (from its rectangle).
function piece(g, clip, p) {
  if (clip === 'frame') {
    const o = skinBarHousing(g, ...BOX, 'flat', look(p));
    const body = { x: BOX[0], y: BOX[1], w: BOX[2], h: BOX[3] };
    const o2 = opening(p), op = { x: o2.x, y: o2.y, w: o2.w, h: o2.h };
    // the flat housing draws its outline round BOX, so the marks read the piece from the whole frame
    const m = marks(g, body, 'housing', p, { left: 7, top: 3, right: 7, bottom: 3 }, KEEP, [op], { x: 0, y: 0, w: SIZE[0], h: SIZE[1] });
    return { body, slice: m.slice };
  }
  if (clip === 'slider') {
    const { rail, slice } = skinSlider(g, ...BOX, 'flat', look(p));
    // on the thin rail the leaves lie only along its top run (its lower half kept clear), so they do not close it off
    const m = groveMarks(g, rail, p.style, { piece: 'rail', face: P.soil, frame: p.frame, accent: p.accent, leaves: p.leaves, leafAt: 6, sideLeaf: false,
      rect: rail, slice, keep: { x: KEEP.x, y: 0, w: KEEP.w, h: 0 }, clear: [{ x: rail.x, y: rail.y + (rail.h >> 1), w: rail.w, h: rail.h }] });
    return { body: rail, slice: m.slice };
  }
  const { rect } = skinKnob(g, SIZE[0] >> 1, SIZE[1] >> 1, KNOB, 'flat', look(p));
  marks(g, rect, 'knob', p);
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
  id: 'ui-bars-grove',
  name: 'Vine bars and slider',
  kind: 'Item',
  blurb: 'A bar housing wrapped in a pale living vine with three fill strips (health, magic, a gauge), a white flash, a slider track and its knob; change the style, corners, vine thickness, leaves and colours.',
  meta: {
    type: 'ui', role: 'interface/bar', themes: ['neutral', 'forest', 'farm'], gameTypes: ['arcade', 'farming-sim', 'top-down-rpg', 'puzzle'], view: 'none',
    words: ['bar', 'health', 'stamina', 'slider', 'meter', 'progress', 'vine', 'leaf', 'bark', 'nature'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [32, 8],
  grounded: false,
  preview: 'frame',
  slice,
  params: {
    style: choice('Style', 'vine', [...MORE_SKIN_STYLES.grove]),
    corner: range('Corner', 0.75, { lo: 'Square', hi: 'Round' }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    leaves: toggle('Leaves', true),
    frame: color('Vine', P.goblin, SW.frame, { material: 'plant' }),
    accent: color('Leaves and flowers', P.grass, SW.accent, { material: 'plant', when: [{ leaves: [true] }, { style: ['bloom'] }] }),
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
  versions: [
    { name: 'Vine bars', params: {} },
    { name: 'Bloom', params: { style: 'bloom', accent: P.crimson } },
    { name: 'Bark, bare', params: { style: 'bark', leaves: false } },
    { name: 'Birch', params: { frame: P.cream, fill: P.magic } },
  ],
  render(g, { clip, t, p }) {
    if (clip === 'frame' || clip === 'slider' || clip === 'knob') { piece(g, clip, p); return; }
    const fill = clip === 'fill-b' ? p.fillB : clip === 'fill-c' ? p.fillC : p.fill;
    skinBarFill(g, opening(p), 1, 'flat', { fill, flash: clip === 'flash' ? 1 - t : 0 });
  },
});
