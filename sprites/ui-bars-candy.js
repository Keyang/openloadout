// Candy bars and slider (core-sprites-2, batch K12): glossy bars like sticks of rock in a sugar tube, and a slider,
// built on engine/ui-skins.js (skin `candy`) with the style marks of engine/ui-candy.js.
// A game draws `frame` (the empty housing), then a fill strip over it, cropped from the right to the value: `fill`
// is health, `fill-b` magic, `fill-c` a gauge. Every strip fits the housing's opening exactly. `flash` is the health
// strip turning white and settling back (4 frames at a fixed 8 a second). `slider` is a track a game stretches
// sideways; `knob` the toffee slab that slides on it (a glossy `soil` knob in the sugar rim).
// Styles on the housing and the rail: jelly (a glossy line along the top of the trough), striped (toffee stripes
// across the rim's ends, 3 px apart), frosted (the top rim iced). Shine: the glossy line and bubble on every strip.
//
// Stretching (`slice`; Contract 8): housing and strips { left 8, top 4, right 8, bottom 4, opening }, the opening
// from skinBarOpening with the housing's own options; the slider 8 left and right; the knob only its `rect`.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { Surface } from '../engine/surface.js';
import { PALETTE } from '../engine/palettes.js';
import { skinBarOpening, skinBarHousing, skinBarFill, skinSlider, skinKnob, skinSwatches, SKIN_STYLES } from '../engine/ui-skins.js';
import { candyMarks } from '../engine/ui-candy.js';

const P = PALETTE.thornwood, D = PALETTE.derelict;
const SIZE = [64, 16];
const BOX = [1, 1, SIZE[0] - 2, SIZE[1] - 2];
const KNOB = 12;
const KEEP = { x: 8, y: 4, w: SIZE[0] - 16, h: SIZE[1] - 8 };   // the housing's stretched middle: stripes stay out of it
const SW = skinSwatches('candy', { face: [P.soil], frame: [P.cream, P.skin, P.sky, P.goblin] });

const housing = (p) => ({ style: p.style, frame: p.frame, border: p.border, corner: p.corner });
const opening = (p) => skinBarOpening(...BOX, 'candy', housing(p));

function slice(clip, p) {
  if (clip === 'knob') return { rect: knob(new Surface(...SIZE), p).rect };
  if (clip === 'slider') return { left: 8, top: 8, right: 8, bottom: 8 };   // stretches sideways only
  return { left: 8, top: 4, right: 8, bottom: 4, opening: opening(p) };
}
// The knob: a glossy toffee slab in the sugar rim, centred in the frame (the helper glosses it in jelly and ices it
// in frosted; the stripes come from candyMarks).
function knob(g, p) {
  const out = skinKnob(g, SIZE[0] >> 1, SIZE[1] >> 1, KNOB, 'candy', { style: p.style, face: P.soil, frame: p.frame, corner: p.corner });
  const r = out.rect;
  candyMarks(g, r.x, r.y, r.w, r.h, p.style, { frame: p.frame, stripe: P.soil, gloss: false });
  return out;
}

export default defineSprite({
  id: 'ui-bars-candy',
  name: 'Candy bars and slider',
  kind: 'Item',
  blurb: 'A glossy sugar-rimmed bar housing with three candy fill strips (health, magic, a gauge), a white flash, a slider track and its toffee knob; change the style, corners, rim, shine and colours.',
  meta: {
    type: 'ui', role: 'interface/bar', themes: ['neutral', 'candy'], gameTypes: ['arcade', 'puzzle', 'card-game', 'racing'], view: 'none',
    words: ['bar', 'health', 'magic', 'gauge', 'meter', 'slider', 'volume', 'settings', 'candy', 'sugar', 'glossy', 'fill', 'flash', 'hud'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [32, 8],
  grounded: false,
  preview: 'frame',
  slice,
  params: {
    style: choice('Style', 'jelly', [...SKIN_STYLES.candy]),
    corner: range('Corner', 0.75, { lo: 'Square', hi: 'Round' }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    shine: toggle('Shine', true),
    frame: color('Sugar', P.cream, SW.frame, { material: 'paint' }),
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
    { name: 'Sugar bars', params: {} },
    { name: 'Striped', params: { style: 'striped' } },
    { name: 'Frosted', params: { style: 'frosted', frame: P.sky } },
    { name: 'Matte mint', params: { shine: false, frame: P.goblin, fill: P.magic } },
  ],

  render(g, { clip, t, p }) {
    if (clip === 'frame') {
      skinBarHousing(g, ...BOX, 'candy', housing(p));
      candyMarks(g, ...BOX, p.style, { frame: p.frame, stripe: P.soil, keep: KEEP });
      return;
    }
    if (clip === 'slider') {
      const { rail } = skinSlider(g, ...BOX, 'candy', housing(p));
      candyMarks(g, rail.x, rail.y, rail.w, rail.h, p.style, { frame: p.frame, stripe: P.soil, keep: { x: 8, y: 0, w: SIZE[0] - 16, h: SIZE[1] } });
      return;
    }
    if (clip === 'knob') { knob(g, p); return; }
    const fill = clip === 'fill-b' ? p.fillB : clip === 'fill-c' ? p.fillC : p.fill;
    skinBarFill(g, opening(p), 1, 'candy', { fill, shine: p.shine, flash: clip === 'flash' ? 1 - t : 0 });
  },
});
