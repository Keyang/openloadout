// Neon checkboxes and cursor (core-sprites-3, batch K25): the small pieces of a settings screen in the neon skin,
// matching ui-buttons-neon.
//   check-on, check-off   a 20x20 box outlined in the tube, ticked in the Tick colour or empty (one outline for both)
//   radio-on, radio-off   a round option in the tube, with a dot of the Tick colour or empty
//   switch-on, switch-off a 28x16 switch: the knob right on a lit track of the Tick colour, or left on the dark wall
//   pointer               a hollow tube arrow, 20 px long, its core in the Tick colour, that nudges 2 px towards what it
//                         points at and flickers dark on one frame in eight (moreSkinPointer); its hot spot is the
//                         `tip` socket (angle PI/2: pointing right). Never a hand
//   selector              four tube brackets round the whole frame that step in 1 px together and back out
//                         (two poses, four frames each, as ui-controls-flat: the checker's repeat warnings stay)
// Each piece is drawn by the flat helper of engine/ui-skins.js (style from moreSkinBase) and finished by moreSkinMarks
// (pieces 'check', 'radio', 'switch', 'selector'). They are not re-cut with roundSlab: a 20 px box has no room for
// its 7 px corner square, and the flat helpers round these pieces themselves from Corner.
// A deliberate deviation from style guide section 8, as part 2 settled: a sheet of controls has no `idle` clip;
// `check-on` comes first and the cursor clip is named `pointer`. `selector` nine-slices round any slot (slice9); no
// other clip stretches. No clip carries text.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, pulse, fract } from '../engine/motion.js';
import { PALETTE } from '../engine/palettes.js';
import { slice9, borderPx } from '../engine/ui.js';
import { Surface } from '../engine/surface.js';
import { skinCheck, skinRadio, skinSwitch, skinSelector, skinSwatches } from '../engine/ui-skins.js';
import { MORE_SKIN_STYLES, moreSkinBase, moreSkinMarks, moreSkinPointer, moreSkinTones } from '../engine/ui-skins-more.js';
import { neonGrowBand, neonBrackets } from '../engine/ui-neon-tube.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const SIZE = [32, 32], C = 16;
const BOX = 20, SWITCH = { x: 2, y: 8, w: 28, h: 16 }, POINTER = { x: 4, y: 16, len: 20 };
const SW = skinSwatches('flat', {
  face: [P.cavern, P.soil, D.plate, H.bandit],
  frame: [P.sky, P.goblin, P.steel, D.cyan, H.heal],
  accent: [P.ember, P.thorn, P.gold, D.xp, D.chitin],
});
const look = (p) => ({ style: moreSkinBase('neon', p.style).style, face: p.face, frame: p.frame, accent: p.accent, border: p.border, corner: p.corner });
const marks = (g, body, piece, p) => moreSkinMarks(g, body, 'neon', p.style, { piece, face: p.face, frame: p.frame, accent: p.accent, rect: body });
// Border: the flat box and option stop at a 2 px band and the flat switch at 1 px, and moreSkinMarks grows a 1 px band
// to the same 2 px tube, so Thin and the middle look alike; Thick grows the band inwards (neonGrowBand) to 3 px, and
// the tube becomes band, core, band. The selector's brackets get their core, Thick's third line and double's second
// tube from neonBrackets (moreSkinMarks looks for the tube across the middle of a piece, where a selector has none).
const tone = (p) => ({ face: p.face, frame: p.frame, accent: p.accent, style: p.style });
const thick = (p) => borderPx(p.border) >= 3;
// The pointer's loop starts a quarter in, so its first and last frames differ: 1, 2, 2, 2, 1, 0, 0, 0 px.
const bob = (t) => Math.round(2 * pulse(fract(t + 0.25)));
// Draws the pointer and returns its hot spot (shared by render and sockets, so the socket follows the arrow).
const pointer = (g, t, p) => moreSkinPointer(g, POINTER.x, POINTER.y, POINTER.len, 'neon', p.style, { frame: p.frame, accent: p.accent, bob: bob(t), t });
const fps = (p) => 8 * lerp(0.65, 1.45, p.speed);

export default defineSprite({
  id: 'ui-controls-neon',
  name: 'Neon checkboxes and cursor',
  kind: 'Item',
  blurb: 'The small pieces of a settings screen in glowing neon tube: a ticked and an empty box, a round option, an on/off switch, a hollow tube arrow that nudges and flickers and tube brackets round a chosen slot; change the style, corners, tube, colours and speed.',
  meta: {
    type: 'ui', role: 'interface/cursor', themes: ['neutral', 'sci-fi', 'city'], gameTypes: ['arcade', 'shooter', 'racing', 'roguelike-action'], view: 'none',
    words: ['checkbox', 'radio', 'switch', 'cursor', 'pointer', 'toggle', 'selector', 'neon', 'glow', 'tube'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [16, 16],
  grounded: false,
  preview: 'check-on',
  slice: { selector: slice9() },
  params: {
    style: choice('Style', 'tube', [...MORE_SKIN_STYLES.neon]),
    corner: range('Corner', 0.5, { lo: 'Square', hi: 'Round' }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    face: color('Wall', P.cavern, SW.face, { material: 'paint' }),
    frame: color('Tube', P.sky, SW.frame, { material: 'light' }),
    accent: color('Tick', P.ember, SW.accent, { material: 'light' }),
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
    { name: 'Sky', params: {} },
    { name: 'Pink tick', params: { style: 'double', accent: D.chitin } },
    { name: 'Cyan sign', params: { style: 'sign', frame: D.cyan } },
    { name: 'Wine mint', params: { face: H.bandit, frame: H.heal, accent: P.thorn } },
    { name: 'Square steel', params: { corner: 0, frame: P.steel } },
  ],
  sounds: {
    'check-on': [{ sound: 'menu-console-toggle', preset: 'Switch on', frame: 0, volume: 0.6 }],
    'switch-on': [{ sound: 'menu-console-toggle', preset: 'Switch on', frame: 0, volume: 0.6 }],
  },
  sockets: (clip, t, p) => {
    if (clip !== 'pointer') return {};
    const { tip } = pointer(new Surface(...SIZE), t, p);
    return { tip: { x: tip.x, y: tip.y + 0.5, angle: Math.PI / 2 } };
  },
  render(g, { clip, t, p }) {
    const [kind, state] = clip.split('-'), on = state === 'on';
    if (kind === 'check' || kind === 'radio') {
      const { box } = (kind === 'check' ? skinCheck : skinRadio)(g, C, C, BOX, on, 'flat', look(p));
      if (thick(p)) neonGrowBand(g, box, p.face, 1, tone(p));
      marks(g, box, kind, p);
    } else if (kind === 'switch') {
      skinSwitch(g, SWITCH.x, SWITCH.y, SWITCH.w, SWITCH.h, on, 'flat', look(p));
      // over the track: the accent when on, the wall's dark tone when off
      if (thick(p)) { const T = moreSkinTones('neon', tone(p)); neonGrowBand(g, SWITCH, on ? T.accent : T.faceDark, 2, tone(p)); }
      marks(g, SWITCH, 'switch', p);
    } else if (clip === 'pointer') pointer(g, t, p);
    else { skinSelector(g, 1, 1, SIZE[0] - 2, SIZE[1] - 2, t, 'flat', look(p)); marks(g, { x: 1, y: 1, w: 30, h: 30 }, 'selector', p); neonBrackets(g, { x: 1, y: 1, w: 30, h: 30 }, { ...tone(p), thick: thick(p) }); }
  },
});
