// Paper bars and slider (core-sprites-2, batch K11): a health, magic and gauge bar drawn as an ink-ruled strip of
// paper, filled with hatched colour like a hand-coloured chart, and a slider track with its knob, built on
// engine/ui-skins.js (skin `paper`) and engine/ui-paper.js (the torn and card marks on the small pieces).
// A game draws `frame` (the empty housing), then a fill strip over it, cropped from the right to the value:
// `fill` is health, `fill-b` magic, `fill-c` a gauge. Every strip fits the housing's opening exactly. `flash` is the
// health strip turning white and settling back (4 frames at a fixed 8 a second). `slider` is a track a game
// stretches sideways; `knob` the slab that slides on it (a cream paper knob ruled in the ink).
// Hatching: 1 px diagonal lines in the ink (the `frame` colour), 4 px apart, over the whole strip, as a
// hand-coloured chart is hatched (engine/paper-tear.js hatchLines); they turn white with the strip in `flash`.
// The slider's torn style bites the rail's long sides inside its end zones (engine/paper-tear.js), never its round
// ends, so every pixel stays joined to the rail.
//
// Stretching (`slice`; Contract 8): housing and strips { left 8, top 4, right 8, bottom 4, opening }, the opening
// from skinBarOpening with the housing's own options; the slider 8 left and right (8 top and bottom: its
// rail stretches sideways only); the knob only its `rect`. The trough is the pale paper, so every fill swatch stands darker than it.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { Surface } from '../engine/surface.js';
import { PALETTE } from '../engine/palettes.js';
import { skinBarOpening, skinBarHousing, skinBarFill, skinSlider, skinKnob, skinSwatches, SKIN_STYLES } from '../engine/ui-skins.js';
import { paperMarks } from '../engine/ui-paper.js';
import { mix } from '../engine/color.js';
import { tearEdges, hatchLines } from '../engine/paper-tear.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const SIZE = [64, 16];
const BOX = [1, 1, SIZE[0] - 2, SIZE[1] - 2];
const KNOB = 12;
const KEEP = { x: 8, y: 4, w: SIZE[0] - 16, h: SIZE[1] - 8 };   // the housing's stretched middle: marks stay out of it
const SW = skinSwatches('paper', { face: [P.cream], frame: [P.cavern, P.soil, D.plate, H.bandit] });

const housing = (p) => ({ style: p.style, frame: p.frame, border: p.border, corner: p.corner });
const opening = (p) => skinBarOpening(...BOX, 'paper', housing(p));

function slice(clip, p) {
  if (clip === 'knob') return { rect: knob(new Surface(...SIZE), p).rect };
  if (clip === 'slider') return { left: 8, top: 8, right: 8, bottom: 8 };   // stretches sideways only
  return { left: 8, top: 4, right: 8, bottom: 4, opening: opening(p) };
}
// The knob: a cream paper slab ruled in the ink, centred in the frame, with the style's marks.
function knob(g, p) {
  const out = skinKnob(g, SIZE[0] >> 1, SIZE[1] >> 1, KNOB, 'paper', { style: p.style, face: P.cream, frame: p.frame, corner: p.corner });
  const r = out.rect;
  paperMarks(g, r.x, r.y, r.w, r.h, p.style, { face: P.cream, fold: 3 });
  return out;
}

export default defineSprite({
  id: 'ui-bars-paper',
  name: 'Paper bars and slider',
  kind: 'Item',
  blurb: 'An ink-ruled paper bar housing with three hatched fill strips (health, magic, a gauge), a white flash, a slider track and its knob; change the style, corners, rule, hatching and colours.',
  meta: {
    type: 'ui', role: 'interface/bar', themes: ['neutral'], gameTypes: ['arcade', 'puzzle', 'card-game', 'farming-sim'], view: 'none',
    words: ['bar', 'health', 'magic', 'gauge', 'meter', 'slider', 'volume', 'settings', 'paper', 'ink', 'hatched', 'fill', 'flash', 'hud'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [32, 8],
  grounded: false,
  preview: 'frame',
  slice,
  params: {
    style: choice('Style', 'sheet', [...SKIN_STYLES.paper]),
    corner: range('Corner', 0.5, { lo: 'Square', hi: 'Round' }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    hatch: toggle('Hatching', true),
    frame: color('Ink', P.cavern, SW.frame),
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
    { name: 'Ink bars', params: {} },
    { name: 'Torn strip', params: { style: 'torn', frame: H.bandit } },
    { name: 'Clean fill', params: { hatch: false, border: 1, corner: 1, frame: D.plate, style: 'card' } },
    { name: 'Brown ink', params: { frame: P.soil, fill: P.crimson, style: 'card' } },
  ],

  render(g, { clip, t, p }) {
    if (clip === 'frame') {
      skinBarHousing(g, ...BOX, 'paper', housing(p));
      paperMarks(g, ...BOX, p.style, { face: P.cream, keep: KEEP });
      return;
    }
    if (clip === 'slider') {
      const { rail } = skinSlider(g, ...BOX, 'paper', housing(p));
      if (p.style === 'torn') {
        // a bite in the top at the left end and in the bottom at the right, between the round end and the stretch
        tearEdges(g, rail, [{ side: 'top', at: 4, w: 2 }, { side: 'bottom', at: rail.w - 6, w: 2 }]);
      } else paperMarks(g, rail.x, rail.y, rail.w, rail.h, p.style, { face: P.cream, keep: { x: 8, y: 0, w: SIZE[0] - 16, h: 0 }, fold: 2 });
      return;
    }
    if (clip === 'knob') { knob(g, p); return; }
    const fill = clip === 'fill-b' ? p.fillB : clip === 'fill-c' ? p.fillC : p.fill;
    const o = opening(p), flash = clip === 'flash' ? 1 - t : 0;
    skinBarFill(g, o, 1, 'paper', { fill, flash });
    if (p.hatch) hatchLines(g, o, flash ? mix(p.frame, '#ffffff', flash) : p.frame, { pitch: 4, phase: 1 });
  },
});
