// Flat checkboxes and cursor (core-sprites-2, batch K13): the small pieces of a settings screen in the flat skin,
// built on engine/ui-skins.js (skin `flat`): no light, no bevel, one band.
//   check-on, check-off   a 20x20 flat box, ticked in the accent or empty (one outline for both)
//   radio-on, radio-off   a round flat option, with a dot of the accent or empty
//   switch-on, switch-off a 28x16 switch: the knob right on a track of the accent, or left on the face's dark tone
//   pointer               a solid triangle on a short tail, 20 px long, that nudges 2 px towards what it points at;
//                         its hot spot is the `tip` socket (angle PI/2: pointing right)
//   selector              four flat corner brackets round the whole frame that step in 1 px together and back out
// Styles: solid, outline (the band set 1 px in from the ink), pill (round box corners; Corner does nothing, so it is
// hidden for pill).
// A deliberate deviation from style guide section 8, as the specification says: this is a sheet of controls, so
// there is no `idle` clip; `check-on` comes first (the measured still) and the cursor clip is named `pointer`.
// `selector` nine-slices round any slot (slice9); no other clip stretches. No clip carries text.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, pulse, fract } from '../engine/motion.js';
import { PALETTE } from '../engine/palettes.js';
import { slice9 } from '../engine/ui.js';
import { Surface } from '../engine/surface.js';
import { skinCheck, skinRadio, skinSwitch, skinPointer, skinSelector, skinSwatches, SKIN_STYLES } from '../engine/ui-skins.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const SIZE = [32, 32], C = 16;
const BOX = 20, SWITCH = { x: 2, y: 8, w: 28, h: 16 }, POINTER = { x: 4, y: 16, len: 20 };
const SW = skinSwatches('flat', {
  face: [P.cavern, P.soil, D.plate, H.bandit],
  frame: [P.cream, P.sky, P.goblin, P.steel, P.skin],
  accent: [P.magic, P.ember, P.moss, P.grass, D.cyan],
});

const look = (p) => ({ style: p.style, face: p.face, frame: p.frame, accent: p.accent, border: p.border, corner: p.corner });
// The pointer's loop starts a quarter in, so its first and last frames differ: 1, 2, 2, 2, 1, 0, 0, 0 px.
const bob = (t) => Math.round(2 * pulse(fract(t + 0.25)));
// Draws the pointer and returns its hot spot (shared by render and sockets, so the socket follows the arrow).
const pointer = (g, t, p) => skinPointer(g, POINTER.x, POINTER.y, POINTER.len, 'flat', { ...look(p), bob: bob(t) });
const fps = (p) => 8 * lerp(0.65, 1.45, p.speed);

export default defineSprite({
  id: 'ui-controls-flat',
  name: 'Flat checkboxes and cursor',
  kind: 'Item',
  blurb: 'The small pieces of a settings screen with no light or bevel: a ticked and an empty box, a round option, an on/off switch, a solid triangle pointer and corner brackets round a chosen slot; change the style, corners, edge, colours and speed.',
  meta: {
    type: 'ui', role: 'interface/cursor', themes: ['neutral', 'city'], gameTypes: ['arcade', 'puzzle', 'card-game', 'racing'], view: 'none',
    words: ['checkbox', 'tick', 'option', 'radio', 'switch', 'toggle', 'pointer', 'cursor', 'arrow', 'select', 'settings', 'flat', 'modern'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [16, 16],
  grounded: false,
  preview: 'check-on',
  slice: { selector: slice9() },
  params: {
    style: choice('Style', 'solid', [...SKIN_STYLES.flat]),
    corner: range('Corner', 0.5, { lo: 'Square', hi: 'Round', when: { style: ['solid', 'outline'] } }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    face: color('Face', P.cavern, SW.face),
    frame: color('Edge', P.cream, SW.frame),
    accent: color('Tick', P.magic, SW.accent),
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
    { name: 'Blue', params: {} },
    { name: 'Outline', params: { style: 'outline' } },
    { name: 'Round wine', params: { style: 'pill', face: H.bandit } },
    { name: 'Green tick', params: { face: P.soil, accent: P.grass } },
    { name: 'Square sky', params: { corner: 0, frame: P.sky, accent: P.ember } },
  ],
  sounds: {
    'check-on': [{ sound: 'tech-click', preset: 'Select', frame: 0, volume: 0.6 }],
    'switch-on': [{ sound: 'tech-click', preset: 'Select', frame: 0, volume: 0.6 }],
  },
  sockets: (clip, t, p) => {
    if (clip !== 'pointer') return {};
    const { tip } = pointer(new Surface(...SIZE), t, p);
    return { tip: { x: tip.x, y: tip.y + 0.5, angle: Math.PI / 2 } };
  },

  render(g, { clip, t, p }) {
    const [kind, state] = clip.split('-'), on = state === 'on';
    if (kind === 'check') skinCheck(g, C, C, BOX, on, 'flat', look(p));
    else if (kind === 'radio') skinRadio(g, C, C, BOX, on, 'flat', look(p));
    else if (kind === 'switch') skinSwitch(g, SWITCH.x, SWITCH.y, SWITCH.w, SWITCH.h, on, 'flat', look(p));
    else if (clip === 'pointer') pointer(g, t, p);
    else skinSelector(g, 1, 1, SIZE[0] - 2, SIZE[1] - 2, t, 'flat', look(p));
  },
});
