// Flat panels (core-sprites-2, batch K13): flat boxes for a pause menu, a results card, a list and a tooltip that
// match the flat buttons, built on engine/ui-skins.js (skin `flat`).
//   panel         one flat colour inside the band, no light and no bevel
//   panel-title   the same with a heading strip in the face's dark tone, a 2 px focus line of the accent under it
//   inset         a list well: the face one tone darker, the focus line along its top
//   tooltip       a small box (94x40 at the top of the frame) with the focus line along its top edge and a 5 px
//                 tail under its bottom left corner
// Styles: solid (the band right inside the ink), outline (the band set 1 px in from the ink), pill (corners rounded
// by 4 px; Corner does nothing, so it is hidden for pill). Shadow: a flat 2 px drop shadow down and to the left.
//
// Stretching (`slice`; Contract 8): panel and inset nine-slice with 8 px; panel-title the same with its top border
// down to the focus line under the heading, so the heading keeps its height; tooltip 8 px round its own rectangle,
// the tail inside the left 8 px.
// Text: white on `inner` and on the heading strip; skinSwatches keeps only faces on which white holds 4.5 to 1 and
// edges that hold 3 to 1 against them, under every whole-bundle look.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { Surface } from '../engine/surface.js';
import { PALETTE } from '../engine/palettes.js';
import { slice9 } from '../engine/ui.js';
import { skinPanel, skinTooltip, skinSwatches, SKIN_STYLES, SKIN_TEXT } from '../engine/ui-skins.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const SIZE = [96, 64];
const TITLE = 11;                                    // rows of the heading strip
const TIP = { x: 1, y: 1, w: 94, h: 40 };            // the tooltip's rectangle, tail included
const SW = skinSwatches('flat', {
  face: [P.cavern, P.soil, D.plate, H.bandit],
  frame: [P.cream, P.sky, P.goblin, P.steel, P.skin],
  accent: [P.magic, P.ember, P.moss, P.grass, D.cyan],
});

const look = (p) => ({ style: p.style, face: p.face, frame: p.frame, accent: p.accent, border: p.border, corner: p.corner, shadow: p.shadow });
function piece(g, clip, p) {
  if (clip === 'tooltip') return skinTooltip(g, TIP.x, TIP.y, TIP.w, TIP.h, 'flat', look(p));
  return skinPanel(g, 1, 1, SIZE[0] - 2, SIZE[1] - 2, 'flat', { ...look(p), title: clip === 'panel-title' ? TITLE : 0, inset: clip === 'inset' });
}

function slice(clip, p) {
  if (clip === 'tooltip') return slice9(TIP);
  if (clip === 'panel-title') return { ...slice9(), top: piece(new Surface(...SIZE), clip, p).inner.y };
  return slice9();
}

export default defineSprite({
  id: 'ui-panel-flat',
  name: 'Flat panels',
  kind: 'Item',
  blurb: 'Stretchable flat boxes with no light or bevel for menus and results: a plain panel, one with a heading, a list well and a tooltip, each with a coloured focus line; change the style, corners, edge, shadow and colours.',
  meta: {
    type: 'ui', role: 'interface/panel', themes: ['neutral', 'city'], gameTypes: ['arcade', 'puzzle', 'card-game', 'racing'], view: 'none',
    words: ['panel', 'window', 'box', 'menu', 'flat', 'modern', 'pause', 'results', 'tooltip', 'list', 'popup', 'card', 'clean', 'minimal'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [48, 32],
  grounded: false,
  preview: 'panel',
  slice,
  params: {
    style: choice('Style', 'solid', [...SKIN_STYLES.flat]),
    corner: range('Corner', 0.5, { lo: 'Square', hi: 'Round', when: { style: ['solid', 'outline'] } }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    shadow: toggle('Shadow', false),
    face: color('Face', P.cavern, SW.face),
    frame: color('Edge', P.cream, SW.frame),
    accent: color('Focus', P.magic, SW.accent),
  },
  clips: {
    panel: { frames: 1, fps: 8, loop: true, label: 'Panel' },
    'panel-title': { frames: 1, fps: 8, loop: true, label: 'With heading' },
    inset: { frames: 1, fps: 8, loop: true, label: 'List well' },
    tooltip: { frames: 1, fps: 8, loop: true, label: 'Tooltip' },
  },
  versions: [
    { name: 'Blue panel', params: {} },
    { name: 'Outlined', params: { style: 'outline', border: 1 } },
    { name: 'Rounded wine', params: { style: 'pill', face: H.bandit, accent: P.moss } },
    { name: 'Brown with shadow', params: { face: P.soil, shadow: true } },
    { name: 'Night', params: { face: D.plate, accent: D.cyan, frame: P.sky } },
  ],
  // Where text goes (white text), and one pixel of the band to check it against.
  textArea(clip, p) {
    const out = piece(new Surface(...SIZE), clip, p), text = SKIN_TEXT.flat;
    const main = { ...out.inner, text, edge: out.edge };
    return out.title ? [main, { ...out.title, text, edge: out.edge }] : main;
  },

  render(g, { clip, p }) {
    piece(g, clip, p);
  },
});
