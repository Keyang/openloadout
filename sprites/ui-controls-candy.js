// Candy checkboxes and cursor (core-sprites-2, batch K12): round candy checkboxes and options, a jelly switch, a
// glossy drop-shaped pointer and sugar brackets round a slot, built on engine/ui-skins.js (skin `candy`) with the style
// marks of engine/ui-candy.js.
//   check-on, check-off   a 20x20 candy box in a sugar rim, ticked in the accent or empty (one outline for both)
//   radio-on, radio-off   a round candy option, with a dot of the accent or empty
//   switch-on, switch-off a 28x16 jelly switch: the knob right on a track of the accent, or left on the face's dark tone
//   pointer               a glossy drop-headed arrow 20 px long that nudges 2 px towards what it points at; its hot
//                         spot is the `tip` socket (angle PI/2: pointing right)
//   selector              four sugar corner brackets round the whole frame that step in 1 px and back out, through a
//                         thicker between-pose
// Styles show on the box, the option and the switch: jelly (a glossy band under the top rim), striped (stripes in a
// darker tone of the rim across its top half only: never a red and white cane round a closed rim), frosted (the top
// rim iced, with drips).
// A deliberate deviation from style guide section 8, as the specification says: this is a sheet of controls, so
// there is no `idle` clip; `check-on` comes first (the measured still) and the cursor clip is named `pointer`.
// `selector` nine-slices round any slot (slice9); no other clip stretches. No clip carries text.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, pulse, fract } from '../engine/motion.js';
import { PALETTE } from '../engine/palettes.js';
import { slice9 } from '../engine/ui.js';
import { Surface } from '../engine/surface.js';
import { skinCheck, skinRadio, skinSwitch, skinPointer, skinSelector, skinSwatches, skinTones, SKIN_STYLES } from '../engine/ui-skins.js';
import { candyMarks } from '../engine/ui-candy.js';
import { candyStripe, unionInked } from '../engine/ui-candy-slab.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const SIZE = [32, 32], C = 16;
const SELECTOR = ['between', 0, 0, 0, 'between', 1, 1, 1];   // the selector's 8 frames: 0 out, 1 stepped in
const BOX = 20, SWITCH = { x: 2, y: 8, w: 28, h: 16 }, POINTER = { x: 4, y: 16, len: 20 };
const SW = skinSwatches('candy', {
  face: [P.soil, P.cavern, H.bandit, D.plate],
  frame: [P.cream, P.skin, P.sky, P.goblin],
  accent: [P.magic, P.ember, P.steel, P.grass, P.moss],
});

const look = (p) => ({ style: p.style, face: p.face, frame: p.frame, accent: p.accent, border: p.border, corner: p.corner });
// The pointer's loop starts a quarter in, so its first and last frames differ: it goes 1, 2, 2, 2, 1, 0, 0, 0 px
// towards its tip.
const bob = (t) => Math.round(2 * pulse(fract(t + 0.25)));
// Draws the pointer and returns its hot spot (shared by render and sockets, so the socket follows the arrow).
const pointer = (g, t, p) => skinPointer(g, POINTER.x, POINTER.y, POINTER.len, 'candy', { ...look(p), bob: bob(t) });
const fps = (p) => 8 * lerp(0.65, 1.45, p.speed);
// The lower half of a piece: the style's marks stay out of it, so a striped rim is striped across its top only.
const lower = (r) => ({ x: r.x, y: r.y + (r.h >> 1), w: r.w, h: r.h - (r.h >> 1) });
// The stripes in a darker tone of the sugar rim (never the candy colour): with the bottom half plain, a striped piece
// never reads as a red and white cane round a closed rim.
const stripeOf = (p) => candyStripe(skinTones('candy', { face: p.face, frame: p.frame }).band);
// The style's marks on a small piece; the helper already glosses jelly.
const marks = (g, r, p, opt = {}) => candyMarks(g, r.x, r.y, r.w, r.h, p.style, { frame: p.frame, stripe: stripeOf(p), gloss: false, ...opt, skip: [lower(r), ...(opt.skip ?? [])] });

export default defineSprite({
  id: 'ui-controls-candy',
  name: 'Candy checkboxes and cursor',
  kind: 'Item',
  blurb: 'The small pieces of a settings screen in boiled sugar: a ticked and an empty box, a round option, a jelly on/off switch, a glossy drop pointer and sugar brackets round a chosen slot; change the style, corners, rim, colours and speed.',
  meta: {
    type: 'ui', role: 'interface/cursor', themes: ['neutral', 'candy'], gameTypes: ['arcade', 'puzzle', 'card-game', 'racing'], view: 'none',
    words: ['checkbox', 'tick', 'option', 'radio', 'switch', 'toggle', 'pointer', 'cursor', 'arrow', 'select', 'settings', 'candy', 'sugar', 'glossy'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [16, 16],
  grounded: false,
  preview: 'check-on',
  slice: { selector: slice9() },
  params: {
    style: choice('Style', 'jelly', [...SKIN_STYLES.candy]),
    corner: range('Corner', 0.75, { lo: 'Square', hi: 'Round' }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    face: color('Candy', P.soil, SW.face, { material: 'paint' }),
    frame: color('Sugar', P.cream, SW.frame, { material: 'paint' }),
    accent: color('Tick', P.magic, SW.accent),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    'check-on': { frames: 1, fps: 8, loop: true, label: 'Ticked box', noText: true },
    'check-off': { frames: 1, fps: 8, loop: true, label: 'Empty box', noText: true },
    'radio-on': { frames: 1, fps: 8, loop: true, noText: true },
    'radio-off': { frames: 1, fps: 8, loop: true, noText: true },
    'switch-on': { frames: 1, fps: 8, loop: true, noText: true },
    'switch-off': { frames: 1, fps: 8, loop: true, noText: true },
    pointer: { frames: 8, fps, loop: true, noText: true },
    selector: { frames: 8, fps, loop: true, noText: true },
  },
  versions: [
    { name: 'Toffee', params: {} },
    { name: 'Cherry stripe', params: { style: 'striped', face: H.bandit } },
    { name: 'Blueberry frost', params: { style: 'frosted', face: P.cavern, frame: P.sky } },
    { name: 'Liquorice', params: { face: D.plate, accent: P.ember } },
    { name: 'Caramel', params: { frame: P.skin, accent: P.grass } },
  ],
  sounds: {
    'check-on': [{ sound: 'ui-click', preset: 'Glass tick', frame: 0, volume: 0.6 }],
    'switch-on': [{ sound: 'ui-click', preset: 'Glass tick', frame: 0, volume: 0.6 }],
  },
  sockets: (clip, t, p) => {
    if (clip !== 'pointer') return {};
    const { tip } = pointer(new Surface(...SIZE), t, p);
    return { tip: { x: tip.x, y: tip.y + 0.5, angle: Math.PI / 2 } };
  },

  render(g, { clip, t, p }) {
    const [kind, state] = clip.split('-'), on = state === 'on';
    if (kind === 'check') {
      const { box } = skinCheck(g, C, C, BOX, on, 'candy', look(p));
      marks(g, box, p);
    } else if (kind === 'radio') {
      const { box } = skinRadio(g, C, C, BOX, on, 'candy', look(p));
      marks(g, box, p);
    } else if (kind === 'switch') {
      const { knob } = skinSwitch(g, SWITCH.x, SWITCH.y, SWITCH.w, SWITCH.h, on, 'candy', look(p));
      // the switch is drawn with no style of its own: jelly's gloss comes from candyMarks here; the knob stays plain
      marks(g, SWITCH, p, { gloss: true, skip: [knob] });
    } else if (clip === 'pointer') {
      pointer(g, t, p);
    } else {
      // the brackets step in and out through a between-pose (both steps drawn: a bracket 1 px thicker), starting on
      // it as the pointer starts a quarter in, so the loop's seam is a small step like any other: between, out x3, between, in x3
      const pose = SELECTOR[Math.floor(fract(t) * SELECTOR.length + 1e-6)];
      const at = (step) => { const s = new Surface(...SIZE); skinSelector(s, 1, 1, SIZE[0] - 2, SIZE[1] - 2, step ? 0.5 : 0, 'candy', look(p)); return s; };
      if (pose !== 'between') { g.blit(at(pose)); return; }
      // the between-pose: both steps as one bracket, its sugar where either has sugar, inked only round the outside
      unionInked(g, [at(1), at(0)]);
    }
  },
});
