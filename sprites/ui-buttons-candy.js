// Candy buttons (core-sprites-2, batch K12): a glossy sugar button, one clip per state, plus a candy tab and an open
// tab, built on engine/ui-skins.js (skin `candy`).
//   normal    a deep boiled-sugar slab in a pale sugar rim, standing on a 2 px lip of the rim's dark tone
//   hover     the face lightened a little (at most tone(face, 0.1): white text stays 5 to 1 or more), the rim brightened
//   pressed   2 px lower, squashed down onto its lip      disabled  no colour and no shine
//   tab       a darker candy tab standing on an ink line  tab-active  a full-height tab of the face, open at the bottom
// The helper draws it square; engine/ui-candy-slab.js rounds its corners (Corner 0.75 cuts 5, 3, 2, 1 px at the top
// and 4, 2, 1 at the bottom, so the pressed clip's bottom slice stays 5) and adds the style: jelly (a 2 px glossy band
// under the top rim, across its whole width), striped (diagonal stripes 3 px apart all along the band, in a darker
// tone of the rim), frosted (the top rim iced down onto the face, with drips in the top corners). Shine: a 12 to 16 px
// highlight bubble inside the top right of the rim, in every style (no style draws one of its own). Nothing but the
// flat face lies in the clear middle 78x18 (2 px lower when pressed).
//
// Stretching (`slice`; the export writes it as `border`, Contract 8): the helper's slice plus the frame's 1 px: 8 px
// on every side; pressed top 9 and bottom 5, as ui-buttons-wood; tabs 8 left, right and top, and 1 (open tab) or 2
// (the tab on its ink line) at the bottom. Everything but the stripes stays out of the stretched middle; the stripes
// repeat every 3 px along it (tiled, the 80 px run shows one 2 px step a run). The open tab's text starts under its 8 px top slice.
// Text: white. skinSwatches keeps only faces on which white holds 4.5 to 1 and rims that hold 3 to 1 against every
// kept face, under every whole-bundle look.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { Surface } from '../engine/surface.js';
import { PALETTE } from '../engine/palettes.js';
import { BUTTON_STATES, LIP } from '../engine/ui.js';
import { tone } from '../engine/color.js';
import { skinButton, skinTab, skinSwatches, SKIN_STYLES, SKIN_TEXT } from '../engine/ui-skins.js';
import { roundSlab, candyCuts, candyStyle, candyBubble, candyStripe } from '../engine/ui-candy-slab.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const SIZE = [96, 32], WHITE = '#ffffff';
const SW = skinSwatches('candy', { face: [P.soil, P.cavern, H.bandit, D.plate], frame: [P.cream, P.skin, P.sky, P.goblin] });

const look = (p) => ({ style: p.style, face: p.face, frame: p.frame, border: p.border, corner: p.corner, shine: p.shine });
// The stretched middle of each clip (the frame's slice): the style marks and the glint stay out of it.
const KEEP = { normal: { x: 8, y: 8, w: 80, h: 16 }, pressed: { x: 8, y: 9, w: 80, h: 18 }, tab: { x: 8, y: 8, w: 80, h: 22 }, 'tab-active': { x: 8, y: 8, w: 80, h: 23 } };
// Draws one clip with the helper (square corners, no marks of its own), then rounds it and adds the style's marks,
// the bubble (engine/ui-candy-slab.js). Returns what the helper says (text area, slice, rim pixel).
function piece(g, clip, p) {
  const tab = clip === 'tab' || clip === 'tab-active';
  const opt = { ...look(p), cornerPx: 0, shine: false };
  const out = tab ? skinTab(g, 1, 1, SIZE[0] - 2, SIZE[1] - 2, clip === 'tab-active', 'candy', opt)
    : skinButton(g, 1, 1, SIZE[0] - 2, SIZE[1] - 2, clip, 'candy', opt);
  const slab = roundSlab(g, out.body, candyCuts(p.corner), tab ? { corners: [true, true, false, false], openBottom: true } : { below: clip === 'pressed' ? 0 : LIP, bottomCuts: candyCuts(p.corner, 3) });
  const T = out.tones, keep = KEEP[clip] ?? KEEP.normal, gloss = tone(T.face, 0.85);
  candyStyle(g, slab, p.style, { keep, stripe: candyStripe(T.band), glossHi: gloss, glossLo: T.faceLight, icing: T.bandLight });
  if (p.shine && clip !== 'pressed' && clip !== 'disabled') candyBubble(g, slab, { keep, white: WHITE, soft: gloss });
  return out;
}
const plus1 = (s) => ({ left: s.left + 1, top: s.top + 1, right: s.right + 1, bottom: s.bottom + 1 });
function slice(clip, p) {
  const s = plus1(piece(new Surface(...SIZE), clip, p).slice);
  if (clip === 'pressed') return { ...s, top: 9, bottom: 5 };   // as ui-buttons-wood: the lip is gone, every mark ends above row 27
  if (clip === 'tab-active') return { ...s, top: 8 };
  return s;
}
// The open tab's text area starts under its 8 px top slice; every other clip keeps the helper's.
function textOf(clip, out) {
  if (clip !== 'tab-active') return out.text;
  const t = out.text, y = Math.max(t.y, 8);
  return { ...t, y, h: Math.min(t.h, SIZE[1] - 2 - y) };
}

export default defineSprite({
  id: 'ui-buttons-candy',
  name: 'Candy buttons',
  kind: 'Item',
  blurb: 'A stretchable glossy sugar button and tab, a deep toffee, cherry or blueberry slab in a pale sugar rim, in four states (normal, hover, pressed, disabled) plus a tab and an open tab; change its style, corners, rim, shine and colours.',
  meta: {
    type: 'ui', role: 'interface/button', themes: ['neutral', 'candy'], gameTypes: ['arcade', 'puzzle', 'card-game', 'racing'], view: 'none',
    words: ['button', 'menu', 'candy', 'sweet', 'sugar', 'glossy', 'jelly', 'tab', 'press', 'click', 'hover', 'start', 'casual', 'toffee'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [48, 16],
  grounded: false,
  preview: 'normal',
  slice,
  params: {
    style: choice('Style', 'jelly', [...SKIN_STYLES.candy]),
    corner: range('Corner', 0.75, { lo: 'Square', hi: 'Round' }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    shine: toggle('Shine', true),
    face: color('Candy', P.soil, SW.face, { material: 'paint' }),
    frame: color('Sugar', P.cream, SW.frame, { material: 'paint' }),
  },
  clips: {
    ...Object.fromEntries(BUTTON_STATES.map((s) => [s, { frames: 1, fps: 8, loop: true }])),
    tab: { frames: 1, fps: 8, loop: true, label: 'Tab, for a page that is not open' },
    'tab-active': { frames: 1, fps: 8, loop: true, label: 'Open tab, for the page on view' },
  },
  versions: [
    { name: 'Toffee drop', params: {} },
    { name: 'Cherry stripe', params: { style: 'striped', face: H.bandit } },
    { name: 'Blueberry frost', params: { style: 'frosted', face: P.cavern, frame: P.sky } },
    { name: 'Liquorice mint', params: { face: D.plate, frame: P.goblin } },
    { name: 'Matte caramel', params: { frame: P.skin, shine: false } },
  ],
  // Where the label goes in each clip (white text), and one pixel of the sugar rim to check against the face.
  textArea(clip, p) {
    const out = piece(new Surface(...SIZE), clip, p);
    return { ...textOf(clip, out), text: SKIN_TEXT.candy, edge: out.edge };
  },
  sounds: {
    pressed: [{ sound: 'ui-click', preset: 'Glass tick', frame: 0, volume: 0.6 }],
    'tab-active': [{ sound: 'menu-move', preset: 'Tab', frame: 0, volume: 0.6 }],
  },

  render(g, { clip, p }) {
    piece(g, clip, p);
  },
});
