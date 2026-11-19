// Crystal checkboxes and cursor (core-sprites-3, batch K26): the small pieces of a settings screen in the crystal skin,
// matching ui-buttons-crystal.
//   check-on, check-off   a 20x20 box of deep ice in a crystal band lit like a bevel, ticked in the Tick colour or empty
//   radio-on, radio-off   a round option in the band, with a dot of the Tick colour or empty
//   switch-on, switch-off a 28x16 switch: the knob right on a lit track of the Tick colour, or left on the dark stone
//   pointer               a faceted crystal shard, 20 px long, that nudges 2 px towards what it points at
//                         (moreSkinPointer), its ridge cored with 10 px of the Tick colour; its hot spot is the `tip` socket (angle PI/2: pointing right). Never a hand
//   selector              four crystal brackets round the whole frame that step in 1 px together and back out
//                         (two poses, four frames each, as ui-controls-flat: the checker's repeat warnings stay)
// Each piece is drawn by the flat helper of engine/ui-skins.js (style from moreSkinBase) and finished by moreSkinMarks
// (pieces 'check', 'radio', 'switch', 'selector'). As in ui-controls-neon they are not re-cut with roundSlab: a 20 px
// box has no room for its 7 px corner square, and the flat helpers round these pieces themselves from Corner.
// Rime: moreSkinMarks' ferns do not fit a 20 px piece (they came out as 5 px X clusters), so for rime it only lights
// the band and small ferns are drawn with engine/ui-crystal-frost.js: from each corner of the box and the option,
// and from the two corners of the switch's track away from the knob, a 3 px stem out of the band, one branch at each
// of its next pixels on alternate sides, and the Tick-coloured tip.
// A deliberate deviation from style guide section 8, as part 2 settled: a sheet of controls has no `idle` clip;
// `check-on` comes first and the cursor clip is named `pointer`. `selector` nine-slices round any slot (slice9); no
// other clip stretches. No clip carries text.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, pulse, fract } from '../engine/motion.js';
import { PALETTE } from '../engine/palettes.js';
import { slice9 } from '../engine/ui.js';
import { Surface } from '../engine/surface.js';
import { skinCheck, skinRadio, skinSwitch, skinSelector, skinSwatches } from '../engine/ui-skins.js';
import { MORE_SKIN_STYLES, moreSkinBase, moreSkinMarks, moreSkinPointer, moreSkinTones } from '../engine/ui-skins-more.js';
import { crystalCornerFern, crystalOnColours, crystalRecolour } from '../engine/ui-crystal-frost.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const SIZE = [32, 32], C = 16;
const BOX = 20, SWITCH = { x: 2, y: 8, w: 28, h: 16 }, POINTER = { x: 4, y: 16, len: 20 };
const SW = skinSwatches('flat', {
  face: [P.cavern, P.soil, D.plate, H.bandit],
  frame: [P.sky, P.goblin, D.cyan, H.heal],
  accent: [P.magic, P.crimson, P.moss, D.xp, H.thunder],
});
const look = (p) => ({ style: moreSkinBase('crystal', p.style).style, face: p.face, frame: p.frame, accent: p.accent, border: p.border, corner: p.corner });
// rime: moreSkinMarks only lights the band (keep is the whole piece, so it draws no corner mark: its ferns do not fit a
// 20 px piece and come out as X clusters); ferns() draws them instead
const marks = (g, body, piece, p, skip = []) => moreSkinMarks(g, body, 'crystal', p.style, { piece, face: p.face, frame: p.frame, accent: p.accent, rect: body, skip, keep: p.style === 'rime' ? body : null });
// rime: a small frost fern growing in from the band at each of `corners` of `box` along its diagonal, onto `inside`:
// a 3 px stem starting `back` px out on the band, one 1 px branch at its 2nd and 3rd pixels on alternate sides, and
// its tip in the Tick colour (6 px; the pairs of branches the larger pieces use would make an X on a 20 px piece). It
// lies only on `inside` and the band's tones, never on the tick, the dot or the knob.
function ferns(g, box, inside, p, corners, back) {
  const T = moreSkinTones('crystal', { face: p.face, frame: p.frame, accent: p.accent, style: p.style });
  const can = crystalOnColours(g, [inside, T.band, T.facetLight, T.facetDark]);
  for (const c of corners) crystalCornerFern(g, box, c, inside, { stem: T.facetLight, tip: T.accent, len: 3, branches: 2, alternate: true, back, can });
}
// The pointer's loop starts a quarter in, so its first and last frames differ: 1, 2, 2, 2, 1, 0, 0, 0 px.
const bob = (t) => Math.round(2 * pulse(fract(t + 0.25)));
// Draws the pointer and returns its hot spot (shared by render and sockets, so the socket follows the shard). The
// shard's ridge (its middle row, in the Crystal colour) is given a core of the Tick colour along its middle 10 px,
// so the pointer shows its Tick colour at 1x.
function pointer(g, t, p) {
  const out = moreSkinPointer(g, POINTER.x, POINTER.y, POINTER.len, 'crystal', p.style, { frame: p.frame, accent: p.accent, bob: bob(t), t });
  const x0 = POINTER.x + 1 + bob(t);
  crystalRecolour(g, x0 + 4, x0 + 13, POINTER.y, p.frame, p.accent);
  return out;
}
const fps = (p) => 8 * lerp(0.65, 1.45, p.speed);

export default defineSprite({
  id: 'ui-controls-crystal',
  name: 'Crystal checkboxes and cursor',
  kind: 'Item',
  blurb: 'The small pieces of a settings screen in cut crystal: a ticked and an empty box, a round option, an on/off switch, a faceted shard pointer that nudges and crystal brackets round a chosen slot; change the style, corners, band, colours and speed.',
  meta: {
    type: 'ui', role: 'interface/cursor', themes: ['neutral', 'fantasy'], gameTypes: ['arcade', 'turn-based-rpg', 'puzzle', 'top-down-rpg'], view: 'none',
    words: ['checkbox', 'radio', 'switch', 'cursor', 'pointer', 'toggle', 'selector', 'crystal', 'ice', 'frost'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [16, 16],
  grounded: false,
  preview: 'check-on',
  slice: { selector: slice9() },
  params: {
    style: choice('Style', 'ice', [...MORE_SKIN_STYLES.crystal]),
    corner: range('Corner', 0.5, { lo: 'Square', hi: 'Round' }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    face: color('Stone', P.cavern, SW.face, { material: 'stone' }),
    frame: color('Crystal', P.sky, SW.frame, { material: 'magic' }),
    accent: color('Tick', P.magic, SW.accent, { material: 'magic' }),
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
  // Ruby frost and Shard carry an amber stone beyond the specification's settings: as written they measured 0.15 and
  // 0.18 from Ice at card size (VERSION_RULES.between 0.2)
  versions: [
    { name: 'Ice', params: {} },
    { name: 'Ruby frost', params: { style: 'rime', accent: P.crimson, face: P.soil } },
    { name: 'Shard', params: { style: 'shard', frame: D.cyan, face: P.soil } },
    { name: 'Garnet', params: { face: H.bandit, frame: H.heal, accent: H.thunder } },
    { name: 'Jade', params: { frame: P.goblin, accent: P.moss } },
  ],
  sounds: {
    'check-on': [{ sound: 'menu-glass-toggle', preset: 'Switch on', frame: 0, volume: 0.6 }],
    'switch-on': [{ sound: 'menu-glass-toggle', preset: 'Switch on', frame: 0, volume: 0.6 }],
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
      // the middle (the tick, the dot) stays clear: on a 20 px piece the four corners' frost would meet over it
      marks(g, box, kind, p, [{ x: box.x + 5, y: box.y + 5, w: box.w - 10, h: box.h - 10 }]);
      if (p.style === 'rime') ferns(g, box, p.face, p, [0, 1, 2, 3], kind === 'check' ? 1 : 2);
    } else if (kind === 'switch') {
      skinSwitch(g, SWITCH.x, SWITCH.y, SWITCH.w, SWITCH.h, on, 'flat', look(p));
      marks(g, SWITCH, 'switch', p);
      // the ferns grow onto the track, at the two corners away from the knob (lit track: the Tick colour; dark: the stone's)
      if (p.style === 'rime') {
        const T = moreSkinTones('crystal', { face: p.face, frame: p.frame, accent: p.accent, style: p.style });
        ferns(g, SWITCH, on ? T.accent : T.faceDark, p, on ? [0, 3] : [1, 2], 1);
      }
    } else if (clip === 'pointer') pointer(g, t, p);
    else { skinSelector(g, 1, 1, SIZE[0] - 2, SIZE[1] - 2, t, 'flat', look(p)); marks(g, { x: 1, y: 1, w: 30, h: 30 }, 'selector', p); }
  },
});
