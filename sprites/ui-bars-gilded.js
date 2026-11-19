// Stone and gold bars (core-sprites-2, batch K14): a boss bar or a health bar in a gold tube with gem end caps,
// and a slider, built on engine/ui-skins.js (skin `gilded`).
// A game draws `frame` (the empty housing), then a fill strip over it, cropped from the right to the value:
// `fill` is health, `fill-b` magic, `fill-c` a gauge. Every strip fits the housing's opening exactly and carries a
// 1 px gold top line (the `frame` colour). `flash` is the health strip turning white and settling back (4 frames
// at a fixed 8 a second). `slider` is a gold rail round the same dark trough, stretched sideways; `knob` a stone
// slab (cavern, the skin's default face) edged in the gold, its gem in the accent when Gems is on.
// End caps: 4 px of solid gold at each end of the housing (`caps` of skinBarOpening), with or without gems, so the
// opening is the same either way. The style marks the caps above and below the gem (engine/ui-gilded.js gildedCaps:
// temple an ink key hook, royal three lit dots, ruin cracks) and the band's corners (ruin: dull gold and chips).
//
// Stretching (`slice`; Contract 8): housing and strips { left, top 4, right, bottom 4, opening }, the opening from
// skinBarOpening with the housing's own options; left and right reach past the caps to the trough (opening.x, as
// skinBarHousing says: 9 px at the default band, 10 with the thick one). The slider stretches sideways only (8 px
// at each end); the knob only its `rect`.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { Surface } from '../engine/surface.js';
import { PALETTE } from '../engine/palettes.js';
import { skinBarOpening, skinBarHousing, skinBarFill, skinSlider, skinKnob, skinSwatches, SKIN_STYLES } from '../engine/ui-skins.js';
import { gildedCorners, gildedCaps } from '../engine/ui-gilded.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const SIZE = [64, 16];
const BOX = [1, 1, SIZE[0] - 2, SIZE[1] - 2];
const CAPS = 4, KNOB = 12;
const SW = skinSwatches('gilded', {
  face: [P.cavern],
  frame: [P.cream, P.steel, P.skin, H.thunder, H.wheat],
  accent: [P.magic, P.crimson, P.moss, P.hero, P.ember],
});

const housing = (p) => ({ style: p.style, frame: p.frame, accent: p.accent, border: p.border, corner: p.corner, caps: CAPS, extras: p.gems });
const opening = (p) => skinBarOpening(...BOX, 'gilded', housing(p));

function slice(clip, p) {
  if (clip === 'knob') return { rect: knob(new Surface(...SIZE), p).rect };
  if (clip === 'slider') return { left: 8, top: 8, right: 8, bottom: 8 };   // stretches sideways only
  const o = opening(p);
  return { left: o.x, top: 4, right: SIZE[0] - (o.x + o.w), bottom: 4, opening: o };
}
// The knob: a stone slab edged in the gold, centred in the frame, its gem in the accent.
const knob = (g, p) => skinKnob(g, SIZE[0] >> 1, SIZE[1] >> 1, KNOB, 'gilded', { style: p.style, face: P.cavern, frame: p.frame, accent: p.accent, corner: p.corner, extras: p.gems });

export default defineSprite({
  id: 'ui-bars-gilded',
  name: 'Stone and gold bars',
  kind: 'Item',
  blurb: 'A gold bar housing with gem end caps and three fill strips (health, magic, a gauge), a white flash, a gold slider track and its stone knob; change the style, corners, band, gems and colours.',
  meta: {
    type: 'ui', role: 'interface/bar', themes: ['neutral', 'fantasy', 'dungeon'], gameTypes: ['arcade', 'turn-based-rpg', 'top-down-rpg', 'card-game'], view: 'none',
    words: ['bar', 'health', 'magic', 'gauge', 'meter', 'boss bar', 'slider', 'volume', 'settings', 'gold', 'gem', 'fill', 'flash', 'hud'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [32, 8],
  grounded: false,
  preview: 'frame',
  slice,
  params: {
    style: choice('Style', 'temple', [...SKIN_STYLES.gilded]),
    corner: range('Corner', 0.5, { lo: 'Square', hi: 'Round' }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    gems: toggle('Gems', true),
    frame: color('Gold', P.cream, SW.frame, { material: 'metal' }),
    accent: color('Gems', P.magic, SW.accent, { when: { gems: [true] } }),
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
    { name: 'Gold bars', params: {} },
    { name: 'Royal bright gold', params: { style: 'royal', frame: H.thunder, accent: P.crimson } },
    { name: 'Plain ruin', params: { style: 'ruin', gems: false } },
    { name: 'Silver', params: { frame: P.steel, accent: P.hero, fill: P.crimson } },
  ],

  render(g, { clip, t, p }) {
    if (clip === 'frame') {
      const o = skinBarHousing(g, ...BOX, 'gilded', housing(p)), s = slice(clip, p);
      // the style on the caps (above and below the gem) and in the band's corners, outside the stretched middle
      gildedCaps(g, o, CAPS, p.style, { frame: p.frame, accent: p.accent });
      gildedCorners(g, { x: BOX[0], y: BOX[1], w: BOX[2], h: BOX[3] }, p.style, {
        frame: p.frame, accent: p.accent, corner: p.corner, gems: false, ring: false,
        keep: { x: s.left, y: s.top, w: SIZE[0] - s.left - s.right, h: SIZE[1] - s.top - s.bottom }, skip: [{ x: o.x - 1, y: o.y - 1, w: o.w + 2, h: o.h + 2 }],
      });
      return;
    }
    if (clip === 'slider') { skinSlider(g, ...BOX, 'gilded', { style: p.style, face: P.cavern, frame: p.frame, border: p.border, corner: p.corner }); return; }
    if (clip === 'knob') { knob(g, p); return; }
    const fill = clip === 'fill-b' ? p.fillB : clip === 'fill-c' ? p.fillC : p.fill;
    skinBarFill(g, opening(p), 1, 'gilded', { fill, gold: p.frame, flash: clip === 'flash' ? 1 - t : 0 });
  },
});
