// Paper checkboxes and cursor (core-sprites-2, batch K11): the small pieces of a settings screen in paper and ink,
// built on engine/ui-skins.js (skin `paper`) and engine/ui-paper.js (the torn and card marks on the box and switch).
//   check-on, check-off   a 20x20 paper box, ticked in the accent or empty (one outline for both)
//   radio-on, radio-off   a round paper option, with an inked dot of the accent or empty
//   switch-on, switch-off a 28x16 switch: the knob right on a track of the accent, or left on darker paper
//   pointer               an inked nib-shaped arrow 20 px long that nudges 2 px towards what it points at; its
//                         hot spot is the `tip` socket (angle PI/2: pointing right)
//   selector              four corner brackets (engine/ui-skins.js skinSelector: L-shaped, arms 4 px of the ink colour,
//                         inked round) round the whole frame; all four step in 1 px together mid-loop and back out,
//                         a pulse round the chosen slot
// Torn: the box and the switch are bitten 2 px deep along their straight sides (engine/paper-tear.js), every
// bite inside the outline; card: the corner fold of engine/ui-paper.js.
// A deliberate deviation from style guide section 8, as the specification says: this is a sheet of controls, so
// there is no `idle` clip; `check-on` comes first (the measured still) and the cursor clip is named `pointer`.
// `selector` nine-slices round any slot (slice9); no other clip stretches. No clip carries text.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, pulse, fract } from '../engine/motion.js';
import { PALETTE } from '../engine/palettes.js';
import { slice9 } from '../engine/ui.js';
import { Surface } from '../engine/surface.js';
import { skinCheck, skinRadio, skinSwitch, skinPointer, skinSelector, skinTones, skinSwatches, SKIN_STYLES } from '../engine/ui-skins.js';
import { paperMarks } from '../engine/ui-paper.js';
import { tearEdges } from '../engine/paper-tear.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const SIZE = [32, 32], C = 16;
const BOX = 20, SWITCH = { x: 2, y: 8, w: 28, h: 16 }, POINTER = { x: 4, y: 16, len: 20 };
const SW = skinSwatches('paper', {
  face: [P.cream, H.wheat, P.skin, P.steel, P.goblin],
  frame: [P.cavern, P.soil, D.plate, H.bandit],
  accent: [P.crimson, P.ember, P.gold, P.magic, P.moss, P.hero],
});

const look = (p) => ({ style: p.style, face: p.face, frame: p.frame, accent: p.accent, border: p.border, corner: p.corner });
// The pointer's loop starts a quarter in, so its first and last frames differ: it goes 1, 2, 2, 2, 1, 0, 0, 0 px
// towards its tip.
const phase = (t) => fract(t + 0.25);
const bob = (t) => Math.round(2 * pulse(phase(t)));
// Draws the pointer and returns its hot spot (shared by render and sockets, so the socket follows the arrow).
const pointer = (g, t, p) => skinPointer(g, POINTER.x, POINTER.y, POINTER.len, 'paper', { ...look(p), bob: bob(t) });
const fps = (p) => 8 * lerp(0.65, 1.45, p.speed);
// The selector: skinSelector's four brackets round the frame (1 px in from its edge), all stepping in 1 px together
// mid-loop and back out (in on frames 3-6 of 8, out on 7, 0, 1 and 2), so frame 7 runs straight on into frame 0.
// Two poses over 8 frames: the check's repeat and first-equals-last warnings are expected for a pulse.
const selector = (g, t, p) => skinSelector(g, 1, 1, SIZE[0] - 2, SIZE[1] - 2, t, 'paper', look(p));
// switch-on: the accent track shows in the gap between the round knob and the ink band at the rounded right end.
// The switch's right half (from the knob's centre column) is drawn again with the band's colour as its track, on a
// surface shifted left so the left half falls off it, and laid over: the knob sits in the band, no accent beside it.
function switchGap(g, knob, p) {
  const c = Math.ceil(knob.x + knob.w / 2), T = skinTones('paper', look(p)), s = new Surface(g.w - c, g.h);
  skinSwitch(s, SWITCH.x - c, SWITCH.y, SWITCH.w, SWITCH.h, true, 'paper', { ...look(p), accent: T.band });
  g.blit(s, c, 0);
}
// Torn bites along the straight sides: the box two a side, the switch two in its top and two in its bottom.
const boxBites = (n) => ['top', 'right', 'bottom', 'left'].flatMap((side, k) => [{ side, at: 5 + (k % 2), w: 2 }, { side, at: n - 8 + (k % 2), w: 2 }]);
const SWITCH_BITES = [{ side: 'top', at: 8, w: 2 }, { side: 'top', at: 15, w: 2 }, { side: 'bottom', at: 11, w: 2 }, { side: 'bottom', at: 18, w: 2 }];

export default defineSprite({
  id: 'ui-controls-paper',
  name: 'Paper checkboxes and cursor',
  kind: 'Item',
  blurb: 'The small pieces of a settings screen in paper and ink: a ticked and an empty box, a round option, an on/off switch, an inked arrow pointer and corner brackets round a chosen slot; change the style, corners, rule, colours and speed.',
  meta: {
    type: 'ui', role: 'interface/cursor', themes: ['neutral'], gameTypes: ['arcade', 'puzzle', 'card-game', 'farming-sim'], view: 'none',
    words: ['checkbox', 'tick', 'option', 'radio', 'switch', 'toggle', 'pointer', 'cursor', 'arrow', 'select', 'settings', 'paper', 'ink'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [16, 16],
  grounded: false,
  preview: 'check-on',
  slice: { selector: slice9() },
  params: {
    style: choice('Style', 'sheet', [...SKIN_STYLES.paper]),
    corner: range('Corner', 0.5, { lo: 'Square', hi: 'Round' }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    face: color('Paper', P.cream, SW.face, { material: 'paint' }),
    frame: color('Ink', P.cavern, SW.frame),
    accent: color('Tick', P.crimson, SW.accent),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    'check-on': { frames: 1, fps: 8, loop: true, label: 'Ticked box, while the option is on', noText: true },
    'check-off': { frames: 1, fps: 8, loop: true, label: 'Empty box, while the option is off', noText: true },
    'radio-on': { frames: 1, fps: 8, loop: true, label: 'Chosen dot, for the one option picked', noText: true },
    'radio-off': { frames: 1, fps: 8, loop: true, label: 'Empty dot, for each option not picked', noText: true },
    'switch-on': { frames: 1, fps: 8, loop: true, label: 'Switch, while the setting is on', noText: true },
    'switch-off': { frames: 1, fps: 8, loop: true, label: 'Switch, while the setting is off', noText: true },
    pointer: { frames: 8, fps, loop: true, label: 'Pointer, beside the item the player is on', noText: true },
    selector: { frames: 8, fps, loop: true, label: 'Selector, round the slot the player is on', noText: true },
  },
  versions: [
    { name: 'Notebook', params: {} },
    { name: 'Torn', params: { style: 'torn', accent: P.moss } },
    { name: 'Index card', params: { style: 'card', face: H.wheat } },
    { name: 'Brown ink', params: { frame: P.soil, accent: P.ember } },
    { name: 'Mint and blue', params: { face: P.goblin, accent: P.hero } },
  ],
  sounds: {
    'check-on': [{ sound: 'ui-click', preset: 'Soft tap', frame: 0, volume: 0.6 }],
    'switch-on': [{ sound: 'ui-click', preset: 'Soft tap', frame: 0, volume: 0.6 }],
  },
  sockets: (clip, t, p) => {
    if (clip !== 'pointer') return {};
    const { tip } = pointer(new Surface(...SIZE), t, p);
    return { tip: { x: tip.x, y: tip.y + 0.5, angle: Math.PI / 2 } };
  },

  render(g, { clip, t, p }) {
    const [kind, state] = clip.split('-'), on = state === 'on';
    if (kind === 'check') {
      const { box } = skinCheck(g, C, C, BOX, on, 'paper', look(p));
      if (p.style === 'torn') tearEdges(g, box, boxBites(BOX));
      else paperMarks(g, box.x, box.y, box.w, box.h, p.style, { face: p.face });
    } else if (kind === 'radio') {
      skinRadio(g, C, C, BOX, on, 'paper', look(p));
    } else if (kind === 'switch') {
      const { knob } = skinSwitch(g, SWITCH.x, SWITCH.y, SWITCH.w, SWITCH.h, on, 'paper', look(p));
      if (on) switchGap(g, knob, p);
      if (p.style === 'torn') tearEdges(g, SWITCH, SWITCH_BITES);
      else paperMarks(g, SWITCH.x, SWITCH.y, SWITCH.w, SWITCH.h, p.style, { face: p.face, fold: 3 });
    } else if (clip === 'pointer') {
      pointer(g, t, p);
    } else {
      selector(g, t, p);
    }
  },
});
