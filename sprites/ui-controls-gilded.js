// Stone and gold checkboxes (core-sprites-2, batch K14): the small pieces of a settings screen in carved stone and
// gold, built on engine/ui-skins.js (skin `gilded`).
//   check-on, check-off   a 20x20 stone box in a gold band, a gem-coloured tick in it or empty (one outline for both)
//   radio-on, radio-off   a round stone option in a gold ring, a gem in it or empty
//   switch-on, switch-off a 28x16 switch: the gold knob right on a track of the accent, or left on dark stone
//   pointer               a gold arrow 20 px long with a gem in its head that nudges 2 px towards what it points
//                         at; its hot spot is the `tip` socket (angle PI/2: pointing right)
//   selector              four gold corner brackets round the whole frame, a gem at each corner, all stepping in 1 px
//                         together mid-loop and back out: a pulse round the chosen slot
// The style shapes the box and the switch (temple and ruin cut corners, royal round ones) and marks them with
// engine/ui-gilded.js: temple gold corner blocks and a gold fillet, royal a cushioned stone edge, ruin dull gold,
// chipped corners and two cracks (box and switch).
// The selector steps out, out, in, in, in, in, out, out, its gems glinting on frames 1, 4 and 7, so it never repeats
// its first frame.
// A deliberate deviation from style guide section 8, as the specification says: this is a sheet of controls, so
// there is no `idle` clip; `check-on` comes first (the measured still) and the cursor clip is named `pointer`.
// `selector` nine-slices round any slot (slice9); no other clip stretches. No clip carries text.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, pulse, fract } from '../engine/motion.js';
import { tone } from '../engine/color.js';
import { cutRectIn, cornerPx } from '../engine/ui.js';
import { gildedCorners } from '../engine/ui-gilded.js';
import { crack } from '../engine/rock.js';
import { INK } from '../engine/color.js';
import { PALETTE } from '../engine/palettes.js';
import { slice9 } from '../engine/ui.js';
import { Surface } from '../engine/surface.js';
import { skinCheck, skinRadio, skinSwitch, skinPointer, skinSelector, skinSwatches, SKIN_STYLES } from '../engine/ui-skins.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const SIZE = [32, 32], C = 16;
const BOX = 20, SWITCH = { x: 2, y: 8, w: 28, h: 16 }, POINTER = { x: 4, y: 16, len: 20 };
const SW = skinSwatches('gilded', {
  face: [P.cavern, P.soil, D.plate, H.bandit],
  frame: [P.cream, P.steel, P.skin, H.thunder, H.wheat],
  accent: [P.magic, P.crimson, P.moss, P.hero, P.ember],
});

const look = (p) => ({ style: p.style, face: p.face, frame: p.frame, accent: p.accent, border: p.border, corner: p.corner, extras: true });
// The pointer's loop starts a quarter in, so its first and last frames differ: it goes 1, 2, 2, 2, 1, 0, 0, 0 px
// towards its tip.
const bob = (t) => Math.round(2 * pulse(fract(t + 0.25)));
// Draws the pointer and returns its hot spot (shared by render and sockets, so the socket follows the arrow).
const pointer = (g, t, p) => skinPointer(g, POINTER.x, POINTER.y, POINTER.len, 'gilded', { ...look(p), bob: bob(t) });
const fps = (p) => 8 * lerp(0.65, 1.45, p.speed);
// The selector's eight frames: the brackets out, out, in, in, in, in, out, out (the helper steps 1 px when its own t
// passes the middle, so t 0 or 0.5 picks the step), and the corner gems glinting on the frames before each move and
// at the top of the pulse, so the last frame leads into the first instead of repeating it.
const SEL_IN = [0, 0, 1, 1, 1, 1, 0, 0], SEL_GLINT = [0, 1, 0, 0, 1, 0, 0, 1];
// The style on a box or a switch, after the helper: corner plates (cropped to 4x4), the temple fillet or the royal
// cushion inside the band, the ruin's dull gold, chips and cracks.
const marks = (g, body, p, opt = {}) => gildedCorners(g, body, p.style, {
  face: p.face, frame: p.frame, accent: p.accent, corner: p.corner, border: p.border, bandCap: 2, gems: false, size: 4, ...opt,
});

export default defineSprite({
  id: 'ui-controls-gilded',
  name: 'Stone and gold checkboxes',
  kind: 'Item',
  blurb: 'The small pieces of a settings screen in carved stone and gold: a ticked and an empty box, a round gem option, an on/off switch, a gold arrow pointer with a gem and corner brackets round a chosen slot; change the style, corners, band, colours and speed.',
  meta: {
    type: 'ui', role: 'interface/cursor', themes: ['neutral', 'fantasy', 'dungeon'], gameTypes: ['arcade', 'turn-based-rpg', 'top-down-rpg', 'card-game'], view: 'none',
    words: ['checkbox', 'tick', 'option', 'radio', 'switch', 'toggle', 'pointer', 'cursor', 'arrow', 'select', 'settings', 'stone', 'gold', 'gem'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [16, 16],
  grounded: false,
  preview: 'check-on',
  slice: { selector: slice9() },
  params: {
    style: choice('Style', 'temple', [...SKIN_STYLES.gilded]),
    corner: range('Corner', 0.5, { lo: 'Square', hi: 'Round' }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    face: color('Stone', P.cavern, SW.face),
    frame: color('Gold', P.cream, SW.frame, { material: 'metal' }),
    accent: color('Gems and tick', P.magic, SW.accent),
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
    { name: 'Temple', params: {} },
    { name: 'Royal ruby', params: { style: 'royal', accent: P.crimson } },
    { name: 'Ruin', params: { style: 'ruin', face: P.soil, frame: H.wheat } },
    { name: 'Silver', params: { frame: P.steel, accent: P.hero } },
    { name: 'Bright gold', params: { frame: H.thunder, accent: P.moss } },
  ],
  sounds: {
    'check-on': [{ sound: 'menu-confirm', preset: 'Soft tick', frame: 0, volume: 0.6 }],
    'switch-on': [{ sound: 'menu-confirm', preset: 'Soft tick', frame: 0, volume: 0.6 }],
  },
  sockets: (clip, t, p) => {
    if (clip !== 'pointer') return {};
    const { tip } = pointer(new Surface(...SIZE), t, p);
    return { tip: { x: tip.x, y: tip.y + 0.5, angle: Math.PI / 2 } };
  },

  render(g, { clip, t, p }) {
    const [kind, state] = clip.split('-'), on = state === 'on';
    if (kind === 'check') {
      skinCheck(g, C, C, BOX, on, 'gilded', look(p));
      const x = C - (BOX >> 1);
      marks(g, { x, y: x, w: BOX, h: BOX }, p, { cornerPx: Math.min(2, cornerPx(p.corner)) });
      if (p.style === 'ruin') {
        // two short cracks from the band into the stone, in the corners the tick leaves free (offsets from the box)
        for (const [u, v] of [[7, 1], [7, 2], [6, 3], [6, 4], [5, 5], [5, 6], [4, 7], [18, 13], [17, 13], [16, 14], [15, 14], [14, 15], [13, 15]]) g.dot(x + u, x + v, INK);
        // the lit lip of each crack in the stone, so it reads on dark stone
        for (const [u, v] of [[7, 4], [6, 5], [6, 6], [5, 7], [15, 13], [14, 14], [13, 14]]) g.dot(x + u, x + v, tone(p.face, 0.45));
      }
    }
    else if (kind === 'radio') skinRadio(g, C, C, BOX, on, 'gilded', look(p));
    else if (kind === 'switch') {
      skinSwitch(g, SWITCH.x, SWITCH.y, SWITCH.w, SWITCH.h, on, 'gilded', look(p));
      // the switch's band is 1 px and its knob rides on the track: only the plates' outer cells and the dull line
      const shape = cutRectIn(SWITCH.x, SWITCH.y, SWITCH.w, SWITCH.h, 3);
      if (p.style !== 'royal') marks(g, SWITCH, p, { shape, ring: false, size: 3 });
      if (p.style === 'ruin') {
        // two cracks across the band, top right and bottom left, into the track (and over the knob when it is there)
        const { x, y, w, h } = SWITCH, clip = (px, py) => shape(px + 0.5, py + 0.5);
        crack(g, x + w - 8, y + 1, 0.3, 5, INK, { seed: 4, branch: false, clip });
        crack(g, x + 7, y + h - 2, Math.PI + 0.3, 5, INK, { seed: 8, branch: false, clip });
      }
    }
    else if (clip === 'pointer') pointer(g, t, p);
    else {
      const i = Math.round(t * 8) % 8;
      skinSelector(g, 1, 1, SIZE[0] - 2, SIZE[1] - 2, SEL_IN[i] ? 0.5 : 0, 'gilded', { ...look(p), accent: SEL_GLINT[i] ? tone(p.accent, 0.85) : p.accent });
    }
  },
});
