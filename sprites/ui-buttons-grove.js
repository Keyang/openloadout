// Vine buttons (core-sprites-3, batch K27): a dark bark button wrapped in a pale living vine, with leaves and flowers
// at its corners, one clip per state, plus a tab and an open tab.
//   normal    the vine (the flat band) round a bark face, on a 2 px lip of the bark's dark tone
//   hover     the vine brightens; the bark lightens by at most tone(face, 0.1)
//   pressed   2 px lower, down onto the lip            disabled  every colour greyed: the vine dry and dead
//   tab       a darker tab standing on an ink line     tab-active  a full-height tab of the bark, open at the bottom
// Styles: vine (the band twists in each corner: a stripe of its dark tone every 2 px), bark (the band's inner part
// and the face's first ring in the band's dark tone, a 2x2 knot of the bark's light tone in each corner), bloom (as
// vine, with a five-pixel flower of the accent round a gold middle in each top corner and a bud in each bottom
// corner). Leaves: two 3x2 leaves of the accent over the band in each corner.
//
// Built the way ui-buttons-neon settled for the skins drawn over `flat` (that file's header): the flat helper of
// engine/ui-skins.js with the style moreSkinBase gives (`solid`) and square corners, the frame minus its 1 px
// border; thickenBand for a Thick border's third pixel; roundSlab with moreSkinCuts (round, candyCuts); then
// moreSkinMarks (moreSkinButtonMarks for a button on its lip). The text area is the `inner` moreSkinMarks returns.
//
// Stretching (`slice`; Contract 8): what moreSkinMarks returns (more where a corner leaf or flower reaches further in)
// plus the frame's 1 px; pressed keeps the flat button's plain bottom row; the open tab's top at least 8.
// Text: white (SKIN_TEXT.flat); the lists pass skinSwatches('flat', ...) unchanged.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { Surface } from '../engine/surface.js';
import { PALETTE } from '../engine/palettes.js';
import { LIP, borderPx } from '../engine/ui.js';
import { skinButton, skinTab, skinSwatches, SKIN_TEXT } from '../engine/ui-skins.js';
import { roundSlab } from '../engine/ui-candy-slab.js';
import { MORE_SKIN_STYLES, moreSkinBase, moreSkinCuts } from '../engine/ui-skins-more.js';
import { thickenBand, moreSkinButtonMarks } from '../engine/ui-skins-more-kit.js';
import { groveMarks } from '../engine/ui-grove-vine.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const SIZE = [96, 32], RECT = { x: 1, y: 1, w: SIZE[0] - 2, h: SIZE[1] - 2 };
const SW = skinSwatches('flat', {
  face: [P.soil, P.cavern, H.bandit, D.plate],
  frame: [P.goblin, H.heal, H.wheat, P.cream],
  accent: [P.grass, P.crimson, P.ember, P.thorn, P.hero],
});
// The stretched middle of each clip (the frame's slice): the corner marks (twists, knots, flowers, leaves) stay out of it.
// The corner zones reach 22 px along the top and bottom and 10 px down the sides: the twist runs the first 10 px from
// each corner along the top and bottom and the whole side zone, and both leaves lie along the top or bottom past it.
const KEEP = { normal: { x: 23, y: 11, w: 50, h: 10 }, pressed: { x: 23, y: 12, w: 50, h: 10 }, tab: { x: 23, y: 11, w: 50, h: 19 }, 'tab-active': { x: 23, y: 11, w: 50, h: 20 } };
const isTab = (clip) => clip === 'tab' || clip === 'tab-active';

// Draws one clip (flat base, Border's third pixel, corners re-cut, grove marks) and returns { inner (the text area),
// slice (from RECT), edge }.
function piece(g, clip, p) {
  const base = moreSkinBase('grove', p.style), cuts = moreSkinCuts('grove', p.corner), bp = borderPx(p.border);
  const opt = { style: base.style, face: p.face, frame: p.frame, accent: p.accent, borderPx: Math.min(2, bp), cornerPx: 0 };
  const tab = isTab(clip);
  const out = tab ? skinTab(g, RECT.x, RECT.y, RECT.w, RECT.h, clip === 'tab-active', 'flat', opt)
    : skinButton(g, RECT.x, RECT.y, RECT.w, RECT.h, clip, 'flat', opt);
  // the open tab's text starts under its 8 px top slice
  let text = clip === 'tab-active' ? { ...out.text, y: Math.max(out.text.y, 8), h: Math.min(out.text.h, SIZE[1] - 2 - Math.max(out.text.y, 8)) } : out.text;
  if (bp > 2) {
    text = clip === 'tab-active' ? { ...text, h: text.h - 1 } : { ...text, y: text.y + 1, h: text.h - 2 };
    thickenBand(g, out.body, { skip: [text] });
  }
  roundSlab(g, out.body, cuts, tab ? { corners: [true, true, false, false], openBottom: true } : { below: clip === 'pressed' ? 0 : LIP, bottomCuts: cuts.slice(0, 3) });
  const opts = {
    piece: tab ? 'tab' : 'button', face: p.face, frame: p.frame, accent: p.accent, state: tab ? 'normal' : clip,
    leaves: p.leaves, leafAt: 10, sideLeaf: false, skip: [text], keep: KEEP[clip] ?? KEEP.normal, rect: RECT, slice: clip === 'pressed' ? { ...out.slice, bottom: 4 } : out.slice,
  };
  const m = groveMarks(g, out.body, p.style, { ...opts, base: tab ? undefined : moreSkinButtonMarks });
  return { inner: m.inner, slice: m.slice, edge: out.edge };
}
const plus1 = (s) => ({ left: s.left + 1, top: s.top + 1, right: s.right + 1, bottom: s.bottom + 1 });
function slice(clip, p) {
  const s = plus1(piece(new Surface(...SIZE), clip, p).slice);
  if (clip === 'tab-active') return { ...s, top: Math.max(8, s.top) };
  return s;
}

export default defineSprite({
  id: 'ui-buttons-grove',
  name: 'Vine buttons',
  kind: 'Item',
  blurb: 'A stretchable dark bark menu button wrapped in a pale living vine with leaves and flowers at its corners, in four states (normal, hover, pressed, disabled) plus a tab and an open tab; change the style, corners, vine thickness, leaves and colours.',
  meta: {
    type: 'ui', role: 'interface/button', themes: ['neutral', 'forest', 'farm'], gameTypes: ['arcade', 'farming-sim', 'top-down-rpg', 'puzzle'], view: 'none',
    words: ['button', 'vine', 'leaf', 'forest', 'nature', 'garden', 'bark', 'flower'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [48, 16],
  grounded: false,
  preview: 'normal',
  slice,
  params: {
    style: choice('Style', 'vine', [...MORE_SKIN_STYLES.grove]),
    corner: range('Corner', 0.75, { lo: 'Square', hi: 'Round' }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    leaves: toggle('Leaves', true),
    face: color('Bark', P.soil, SW.face, { material: 'wood' }),
    frame: color('Vine', P.goblin, SW.frame, { material: 'plant' }),
    accent: color('Leaves and flowers', P.grass, SW.accent, { material: 'plant', when: [{ leaves: [true] }, { style: ['bloom'] }] }),
  },
  clips: {
    normal: { frames: 1, fps: 8, loop: true, label: 'At rest, not pointed at' },
    hover: { frames: 1, fps: 8, loop: true, label: 'Pointed at by the cursor' },
    pressed: { frames: 1, fps: 8, loop: true, label: 'Held down while pressed' },
    disabled: { frames: 1, fps: 8, loop: true, label: 'Greyed out, not available now' },
    tab: { frames: 1, fps: 8, loop: true, label: 'Tab, for a page that is not open' },
    'tab-active': { frames: 1, fps: 8, loop: true, label: 'Open tab, for the page on view' },
  },
  versions: [
    { name: 'Vine', params: {} },
    { name: 'Straw bark', params: { style: 'bark', leaves: false, frame: H.wheat } },
    { name: 'Bloom', params: { style: 'bloom', accent: P.crimson, frame: H.heal } },
    { name: 'Birch at night', params: { face: P.cavern, frame: P.cream, accent: P.hero } },
    { name: 'Berry', params: { face: H.bandit, accent: P.ember, corner: 0.25 } },
  ],
  // Where the label goes in each clip (white text), and one pixel of the vine to check it against the bark.
  textArea(clip, p) {
    const out = piece(new Surface(...SIZE), clip, p);
    return { ...out.inner, text: SKIN_TEXT.flat, edge: out.edge };
  },
  sounds: {
    pressed: [{ sound: 'menu-wood-confirm', preset: 'Select', frame: 0, volume: 0.6 }],
    'tab-active': [{ sound: 'menu-wood-move', preset: 'Tab', frame: 0, volume: 0.6 }],
  },

  render(g, { clip, p }) {
    piece(g, clip, p);
  },
});
