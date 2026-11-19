// Neon bars and slider (core-sprites-3, batch K25): health and energy bars in a glowing neon tube, and a slider,
// matching ui-buttons-neon.
// A game draws `frame` (the empty housing: the tube round a dark trough), then a fill strip over it, cropped from the
// right to the value: `fill` is health, `fill-b` magic, `fill-c` a gauge. Every strip is plain flat colour and fits
// the housing's opening exactly. `flash` is the health strip turning white and settling back (4 frames at a fixed 8
// a second). `slider` is a rail a game stretches sideways; `knob` a wall-coloured (cavern) slab in the tube.
// Styles and Glow as ui-buttons-neon. The housing, rail and knob are drawn by the flat helpers of engine/ui-skins.js
// and finished by moreSkinMarks (pieces 'housing', 'rail', 'knob'). They are not re-cut with roundSlab: the flat
// bar helpers round their own corners from Corner (a 14 px housing has no room for roundSlab's 7 px corner square),
// and skinBarHousing already draws Border's band 1 to 3 px.
//
// Stretching (`slice`; Contract 8): housing and strips { left 8, top 4, right 8, bottom 4, opening } (more where a
// mark reaches further in), the opening from skinBarOpening with the housing's own options; the slider 8 left and
// right; the knob only its `rect`.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { Surface } from '../engine/surface.js';
import { PALETTE } from '../engine/palettes.js';
import { skinBarOpening, skinBarHousing, skinBarFill, skinSlider, skinKnob, skinSwatches } from '../engine/ui-skins.js';
import { MORE_SKIN_STYLES, moreSkinBase, moreSkinMarks } from '../engine/ui-skins-more.js';
import { neonBarTube } from '../engine/ui-neon-tube.js';
import { borderPx } from '../engine/ui.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const SIZE = [64, 16];
const BOX = [1, 1, SIZE[0] - 2, SIZE[1] - 2];
const KNOB = 12;
const SW = skinSwatches('flat', {
  face: [P.cavern],
  frame: [P.sky, P.goblin, P.steel, D.cyan, H.heal],
  accent: [P.ember, P.thorn, P.gold, D.xp, D.chitin],
});
// The housing's band is 2 px (Thin and the middle) or 3 px (Thick): a lit tube needs a band and a core.
const look = (p) => ({ style: moreSkinBase('neon', p.style).style, face: P.cavern, frame: p.frame, accent: p.accent, borderPx: Math.max(2, borderPx(p.border)), corner: p.corner });
const opening = (p) => skinBarOpening(...BOX, 'flat', look(p));
// keep: the stretched middle (the housing's 8 px left and right, 4 top and bottom; the rail's columns), where the
// sign's gaps and clips may not go
const marks = (g, body, piece, p, slice, keep = null) => moreSkinMarks(g, body, 'neon', p.style, { piece, face: P.cavern, frame: p.frame, accent: p.accent, extras: p.halo, rect: body, slice, keep });
const KEEP = { x: 8, y: 4, w: SIZE[0] - 16, h: SIZE[1] - 8 };

// The flat housing's band lies between two ink lines and the rail is all band, so moreSkinMarks finds no inside to
// light a core from: neonBarTube (engine/ui-neon-tube.js) lights the tube, the second tube and the Glow after the marks.
const tube = (g, body, piece, p, opening) => neonBarTube(g, body, piece, { face: P.cavern, frame: p.frame, accent: p.accent, style: p.style, extras: p.halo, opening });

// Draws the housing, the rail or the knob and returns the slice moreSkinMarks says it needs (from its rectangle).
function piece(g, clip, p) {
  if (clip === 'frame') {
    const o = skinBarHousing(g, ...BOX, 'flat', look(p));
    const body = { x: BOX[0], y: BOX[1], w: BOX[2], h: BOX[3] };
    const m = marks(g, body, 'housing', p, { left: 7, top: 3, right: 7, bottom: 3 }, KEEP);
    tube(g, body, 'housing', p, o);
    return { body, slice: m.slice };
  }
  if (clip === 'slider') {
    const { rail, slice } = skinSlider(g, ...BOX, 'flat', look(p));
    const m = marks(g, rail, 'rail', p, slice, { x: KEEP.x, y: 0, w: KEEP.w, h: 0 });
    tube(g, rail, 'rail', p);
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
  id: 'ui-bars-neon',
  name: 'Neon bars and slider',
  kind: 'Item',
  blurb: 'A bar housing outlined in a glowing neon tube with three fill strips (health, magic, a gauge), a white flash, a slider track and its knob; change the style, corners, tube thickness, glow and colours.',
  meta: {
    type: 'ui', role: 'interface/bar', themes: ['neutral', 'sci-fi', 'city'], gameTypes: ['arcade', 'shooter', 'racing', 'roguelike-action'], view: 'none',
    words: ['bar', 'health', 'energy', 'slider', 'meter', 'progress', 'neon', 'glow', 'tube', 'night'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [32, 8],
  grounded: false,
  preview: 'frame',
  slice,
  params: {
    style: choice('Style', 'tube', [...MORE_SKIN_STYLES.neon]),
    corner: range('Corner', 0.5, { lo: 'Square', hi: 'Round' }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    halo: toggle('Glow', true),
    frame: color('Tube', P.sky, SW.frame, { material: 'light' }),
    accent: color('Second tube', P.ember, SW.accent, { material: 'light', when: { style: ['double'] } }),
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
    { name: 'Sky bars', params: {} },
    { name: 'Double', params: { style: 'double', accent: P.thorn } },
    { name: 'Cyan sign', params: { style: 'sign', frame: D.cyan } },
    { name: 'Mint, no glow', params: { halo: false, frame: P.goblin, fill: P.magic } },
  ],
  render(g, { clip, t, p }) {
    if (clip === 'frame' || clip === 'slider' || clip === 'knob') { piece(g, clip, p); return; }
    const fill = clip === 'fill-b' ? p.fillB : clip === 'fill-c' ? p.fillC : p.fill;
    skinBarFill(g, opening(p), 1, 'flat', { fill, flash: clip === 'flash' ? 1 - t : 0 });
  },
});
