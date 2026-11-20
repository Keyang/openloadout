// FROZEN COPY, not a sprite: sprites/ui-buttons-wood.js as it was on 2026-11-20 (build item T1), before the migration redraws it as
// data (docs/data-sprites.md section 7). Kept only for the tests about the framework its code uses (tests/helpers/library.mjs
// codeSprite, codeSpriteSource); imports point at ../../../. Never edit it; the build never scans tests/.
// Wooden buttons (kit-platformer-fantasy, batch P13): a menu button like a plank in a darker frame,
// one clip per state, built on the wooden pieces of engine/ui-wood.js.
//   normal    the board stands on a 2 px lip          hover     a lighter stain and a brighter carved edge
//   pressed   2 px lower, down onto the lip           disabled  no colour
// Styles: plank (round corners, grain), carved (cut corners, a sunken board, chisel marks), stone (a grey slab
// with specks). Grain, chisel marks, specks and nails stay out of the clear middle: the flat text area
// covers the middle 78x18 of the frame in every state (it moves down 2 px when pressed).
//
// Stretching (`slice` below; the export writes it as `border`, Contract 8): 8 px left and right; 7 px top
// and bottom, or 9 and 5 while pressed, because the board has moved down. The bottom border holds the lip.
// Text: the board is stained (woodTones in the helper), so white text keeps 4.5 to 1 on every face colour
// in every state, and the pale carved edge keeps 3 to 1 against it for every frame colour, under every
// whole-bundle look.
import { defineSprite, range, choice, color, toggle } from '../../../engine/sprite.js';
import { Surface } from '../../../engine/surface.js';
import { PALETTE } from '../../../engine/palettes.js';
import { buttonClips, LIP } from '../../../engine/ui.js';
import { WOOD_STYLES, woodButton } from '../../../engine/ui-wood.js';

const P = PALETTE.thornwood;
const SIZE = [96, 32];
const REST = { left: 8, top: 7, right: 8, bottom: 7 };
const board = (p) => ({ style: p.style, face: p.face, frame: p.frame, border: p.border, corner: p.corner, texture: p.texture, nails: p.nails, nail: P.steel });

export default defineSprite({
  id: 'ui-buttons-wood',
  name: 'Wooden buttons',
  kind: 'Item',
  blurb: 'A stretchable wooden menu button in four states (normal, hover, pressed, disabled); change its style, corners, border, nails, grain and colours.',
  meta: {
    type: 'ui', role: 'interface/button', themes: ['fantasy', 'neutral'], gameTypes: ['platformer', 'turn-based-rpg', 'top-down-rpg', 'arcade', 'puzzle'], view: 'none',
    words: ['button', 'menu', 'wood', 'wooden', 'plank', 'board', 'press', 'click', 'hover', 'start', 'pause', 'sign', 'carved', 'stone'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [48, 16],
  grounded: false,
  preview: 'normal',
  slice: { normal: REST, hover: REST, pressed: { left: 8, top: 9, right: 8, bottom: 5 }, disabled: REST },
  params: {
    style: choice('Style', 'plank', WOOD_STYLES),
    corner: range('Corner', 0.5, { lo: 'Square', hi: 'Round' }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    nails: toggle('Nails', true),
    texture: range('Texture', 0.5, { lo: 'Plain', hi: 'Busy' }),
    // the board is stained from this colour; every one of them keeps white text readable
    face: color('Face', P.wood, [P.wood, P.soil, P.slate, P.cavern, P.crimson, P.thorn, P.hero]),
    frame: color('Frame', P.soil, [P.soil, P.gold, P.steel, P.slate, P.crimson, P.cream]),
  },
  clips: buttonClips(),
  // Where the label goes in each state, and one pixel of the frame where it is drawn: the pale carved edge
  // just inside the ink line along the top (the contrast rules are checked there: engine/ui.js, CONTRAST).
  textArea(clip, p) {
    const { text } = woodButton(new Surface(...SIZE), 1, 1, SIZE[0] - 2, SIZE[1] - 2, clip, board(p));
    return { ...text, edge: { x: SIZE[0] >> 1, y: 2 + (clip === 'pressed' ? LIP : 0) } };
  },
  sounds: { pressed: [{ sound: 'ui-click', preset: 'Soft tap', frame: 0, volume: 0.6 }] },

  render(g, { clip, p }) {
    woodButton(g, 1, 1, SIZE[0] - 2, SIZE[1] - 2, clip, board(p));
  },
});
