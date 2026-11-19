// Flat bars and slider (core-sprites-2, batch K13): unlit bars for a progress or health bar and a slider for a
// settings screen, built on engine/ui-skins.js (skin `flat`).
// A game draws `frame` (the empty housing: the flat band round a dark trough), then a fill strip over it, cropped
// from the right to the value: `fill` is health, `fill-b` magic, `fill-c` a gauge. Every strip is plain flat colour
// and fits the housing's opening exactly. `flash` is the health strip turning white and settling back (4 frames at
// a fixed 8 a second). `slider` is a rail a game stretches sideways; `knob` a flat cavern-blue slab on the edge colour.
// Styles: solid, outline (the band set 1 px in from the ink), pill (fully round ends; Corner does nothing, so it is
// hidden for pill). Notches: a 1 px ink notch across the band every 8 px, on the housing and the slider's rail.
//
// Stretching (`slice`; Contract 8): housing and strips { left 8, top 4, right 8, bottom 4, opening }, the opening from
// skinBarOpening with the housing's own options; the slider 8 left and right (8 top and bottom: it stretches
// sideways only); the knob only its `rect`. A notched housing repeats every 8 px: it tiles in 8 px steps.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { Surface } from '../engine/surface.js';
import { PALETTE } from '../engine/palettes.js';
import { INK } from '../engine/color.js';
import { skinBarOpening, skinBarHousing, skinBarFill, skinSlider, skinKnob, skinSwatches, SKIN_STYLES } from '../engine/ui-skins.js';

const P = PALETTE.thornwood, D = PALETTE.derelict, H = PALETTE.hearthvale;
const SIZE = [64, 16];
const BOX = [1, 1, SIZE[0] - 2, SIZE[1] - 2];
const KNOB = 12;
const SW = skinSwatches('flat', { face: [P.cavern, P.soil, D.plate, H.bandit], frame: [P.cream, P.sky, P.goblin, P.steel, P.skin] });

const housing = (p) => ({ style: p.style, frame: p.frame, border: p.border, corner: p.corner, notches: p.notches });
const opening = (p) => skinBarOpening(...BOX, 'flat', housing(p));
// The knob: a flat slab of the skin's default face (cavern) on the edge colour, centred in the frame.
const knob = (g, p) => skinKnob(g, SIZE[0] >> 1, SIZE[1] >> 1, KNOB, 'flat', { style: p.style, face: P.cavern, frame: p.frame, corner: p.corner });

function slice(clip, p) {
  if (clip === 'knob') return { rect: knob(new Surface(...SIZE), p).rect };
  if (clip === 'slider') return { left: 8, top: 8, right: 8, bottom: 8 };
  return { left: 8, top: 4, right: 8, bottom: 4, opening: opening(p) };
}

export default defineSprite({
  id: 'ui-bars-flat',
  name: 'Flat bars and slider',
  kind: 'Item',
  blurb: 'A flat, unlit bar housing with three fill strips (health, magic, a gauge), a white flash, a slider track and its knob; change the style, corners, edge, notches and colours.',
  meta: {
    type: 'ui', role: 'interface/bar', themes: ['neutral', 'city'], gameTypes: ['arcade', 'puzzle', 'card-game', 'racing'], view: 'none',
    words: ['bar', 'health', 'progress', 'gauge', 'meter', 'slider', 'volume', 'settings', 'flat', 'modern', 'fill', 'flash', 'hud', 'loading'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [32, 8],
  grounded: false,
  preview: 'frame',
  slice,
  params: {
    style: choice('Style', 'solid', [...SKIN_STYLES.flat]),
    corner: range('Corner', 0.5, { lo: 'Square', hi: 'Round', when: { style: ['solid', 'outline'] } }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    notches: toggle('Notches', false),
    frame: color('Edge', P.cream, SW.frame),
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
    { name: 'Flat bars', params: {} },
    { name: 'Pill', params: { style: 'pill' } },
    { name: 'Notched', params: { notches: true, frame: P.steel } },
    { name: 'Outline sky', params: { style: 'outline', frame: P.sky, border: 1 } },
  ],

  render(g, { clip, t, p }) {
    if (clip === 'frame') { skinBarHousing(g, ...BOX, 'flat', housing(p)); return; }
    if (clip === 'slider') {
      const { rail } = skinSlider(g, ...BOX, 'flat', housing(p));
      if (p.notches) for (let x = rail.x + 8; x < rail.x + rail.w - 8; x += 8) g.dot(x, rail.y + 1, INK);
      return;
    }
    if (clip === 'knob') { knob(g, p); return; }
    const fill = clip === 'fill-b' ? p.fillB : clip === 'fill-c' ? p.fillC : p.fill;
    skinBarFill(g, opening(p), 1, 'flat', { fill, flash: clip === 'flash' ? 1 - t : 0 });
  },
});
