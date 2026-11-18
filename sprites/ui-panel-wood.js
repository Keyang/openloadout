// Wooden panels (kit-platformer-fantasy, batch P13): boxes for menus and pop-ups that match the wooden
// buttons, built on engine/ui-wood.js and engine/ui.js.
//   panel         a framed board
//   panel-title   the same with a lighter strip across the top for a heading (dark text goes on the strip)
//   panel-scroll  a parchment sheet between two wooden rolls, for story text (dark text)
//
// Stretching (`slice` below; the export writes it as `border`, Contract 8): all three are nine-slice with an
// 8 px border; `panel-title` has a deeper top border (16 to 18 px) that holds the strip, so the strip keeps
// its height when the panel is made taller.
// Text: the board is stained (woodTones in the helper), so white text keeps 4.5 to 1 on every face colour
// and the pale carved edge keeps 3 to 1 against it for every frame colour; dark text keeps 4.5 to 1 on
// every colour offered for the strip and the parchment. All of it under every whole-bundle look.
import { defineSprite, range, color, toggle } from '../engine/sprite.js';
import { PALETTE } from '../engine/palettes.js';
import { panel9, slice9, borderPx } from '../engine/ui.js';
import { woodPanel } from '../engine/ui-wood.js';

const P = PALETTE.thornwood;
const SIZE = [96, 64];
const STRIP = 11;                                    // rows of the heading strip

const board = (p) => ({ face: p.face, frame: p.frame, border: p.border, corner: p.corner, texture: p.texture, nails: p.nails, nail: P.steel });
// the scroll: the parchment in the accent colour, its rolls in the board's wood, their knobs in the frame's
const scroll = (g, p) => panel9(g, 1, 1, SIZE[0] - 2, SIZE[1] - 2, { style: 'scroll', face: p.accent, frame: p.face, accent: p.frame, border: p.border, corner: p.corner });

// Every clip keeps the 8 px border. (For the scroll the helper's own `slice` stops short of the knobs on the
// rolls, which reach 6 px in; 8 px holds them and the rolls.)
function slice(clip, p) {
  return clip === 'panel-title' ? { ...slice9(), top: 1 + 2 + borderPx(p.border) + STRIP + 1 } : slice9();
}

export default defineSprite({
  id: 'ui-panel-wood',
  name: 'Wooden panels',
  kind: 'Item',
  blurb: 'Stretchable wooden boxes for menus and pop-ups: a framed board, a board with a heading strip and a parchment scroll; change the corners, border, nails, grain and colours.',
  meta: {
    type: 'ui', role: 'interface/panel', themes: ['fantasy', 'neutral'], gameTypes: ['platformer', 'turn-based-rpg', 'top-down-rpg', 'arcade', 'puzzle'], view: 'none',
    words: ['panel', 'window', 'box', 'menu', 'pause', 'popup', 'wood', 'wooden', 'board', 'frame', 'scroll', 'parchment', 'title', 'story'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [48, 32],
  grounded: false,
  preview: 'panel',
  slice,
  params: {
    corner: range('Corner', 0.5, { lo: 'Square', hi: 'Round' }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    nails: toggle('Nails', true),
    texture: range('Texture', 0.5, { lo: 'Plain', hi: 'Busy' }),
    // the board is stained from this colour; every one of them keeps white text readable
    face: color('Face', P.wood, [P.wood, P.soil, P.slate, P.cavern, P.crimson, P.thorn, P.hero]),
    frame: color('Frame', P.soil, [P.soil, P.gold, P.steel, P.slate, P.crimson, P.cream]),
    // pale colours only: dark text goes on the strip and on the parchment
    accent: color('Parchment', P.cream, [P.cream, P.skin, P.steel, P.goblin, P.sky]),
  },
  clips: {
    panel: { frames: 1, fps: 8, loop: true, label: 'Panel' },
    'panel-title': { frames: 1, fps: 8, loop: true, label: 'Titled panel' },
    'panel-scroll': { frames: 1, fps: 8, loop: true, label: 'Scroll' },
  },

  render(g, { clip, p }) {
    if (clip === 'panel-scroll') { scroll(g, p); return; }
    woodPanel(g, 1, 1, SIZE[0] - 2, SIZE[1] - 2, { ...board(p), strip: clip === 'panel-title' ? p.accent : null, stripRows: STRIP });
  },
});
