// Neon buttons (core-sprites-3, batch K25, the pathfinder for the skins drawn over `flat`): a glowing tube round a
// dark wall, one clip per state, plus a tab and an open tab.
//   normal    the tube (the flat band, its middle line lit in the band's light tone) on a 2 px lip of the wall's dark tone
//   hover     the tube's core turns white and the band brightens; the wall lightens by at most tone(face, 0.1)
//   pressed   2 px lower, down onto the lip            disabled  the tube unlit: no core, no colour
//   tab       a darker tab standing on an ink line     tab-active  a full-height tab of the wall, open at the bottom
// Styles: tube (one tube), double (a second, thinner tube of the accent 1 px inside the first), sign (the tube broken
// by a dark gap at each corner bend, with a 2x2 mounting clip beside each gap). Glow: a 1 px line of the tube's dark
// tone between the ink and the tube (tube, double), or just inside it (sign).
//
// How a piece of a skin drawn over `flat` is built (the order K26 and K27 follow): the flat helper of
// engine/ui-skins.js with the style moreSkinBase gives and square corners (cornerPx 0), the frame minus its 1 px
// border; roundSlab (engine/ui-candy-slab.js) with moreSkinCuts re-cuts the corners (and the lip under them); then
// moreSkinMarks (engine/ui-skins-more.js; moreSkinButtonMarks of engine/ui-skins-more-kit.js for a button on its lip)
// turns the flat band into the tube, kept out of the text area (`skip`) and
// out of the stretched middle (`keep`). The text area is the `inner` moreSkinMarks returns.
//
// Stretching (`slice`; Contract 8): what moreSkinMarks returns (the helper's slice, or more where a corner mark
// reaches further in) plus the frame's 1 px: 8 px on every side; pressed top 9 and bottom 5 (as ui-buttons-flat:
// the pressed body's last row of wall is a plain row); tabs 8 left, right and top, 1 or 2 at the open bottom.
// Text: white (SKIN_TEXT.flat); the lists pass skinSwatches('flat', ...) unchanged.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { Surface } from '../engine/surface.js';
import { PALETTE } from '../engine/palettes.js';
import { LIP, borderPx } from '../engine/ui.js';
import { skinButton, skinTab, skinSwatches, SKIN_TEXT } from '../engine/ui-skins.js';
import { roundSlab } from '../engine/ui-candy-slab.js';
import { MORE_SKIN_STYLES, moreSkinBase, moreSkinCuts, moreSkinMarks } from '../engine/ui-skins-more.js';
import { neonGapGlow } from '../engine/ui-neon-tube.js';
import { thickenBand, moreSkinButtonMarks } from '../engine/ui-skins-more-kit.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const SIZE = [96, 32], RECT = { x: 1, y: 1, w: SIZE[0] - 2, h: SIZE[1] - 2 };
const SW = skinSwatches('flat', {
  face: [P.cavern, P.soil, D.plate, H.bandit],
  frame: [P.sky, P.goblin, P.steel, D.cyan, H.heal],
  accent: [P.ember, P.thorn, P.gold, D.xp, D.chitin],
});
// The stretched middle of each clip (the frame's slice): the corner marks (sign gaps and clips) stay out of it.
const KEEP = { normal: { x: 8, y: 8, w: 80, h: 16 }, pressed: { x: 8, y: 9, w: 80, h: 18 }, tab: { x: 8, y: 8, w: 80, h: 22 }, 'tab-active': { x: 8, y: 8, w: 80, h: 23 } };
const isTab = (clip) => clip === 'tab' || clip === 'tab-active';

// Draws one clip (flat base, Border's third pixel, corners re-cut, neon marks) and returns { inner (the text area),
// slice (from RECT), edge }. The flat button and tab stop at a 2 px band, so a Thick border's third pixel is grown
// by thickenBand; the text area then loses a row at its top and bottom, where the second tube or the sign's glow runs.
function piece(g, clip, p) {
  const base = moreSkinBase('neon', p.style), cuts = moreSkinCuts('neon', p.corner), bp = borderPx(p.border);
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
  // pressed keeps the flat button's 5 px bottom slice (its last row of wall is a plain row)
  const opts = {
    piece: tab ? 'tab' : 'button', face: p.face, frame: p.frame, accent: p.accent, state: tab ? 'normal' : clip,
    extras: p.halo, skip: [text], keep: KEEP[clip] ?? KEEP.normal, rect: RECT, slice: clip === 'pressed' ? { ...out.slice, bottom: 4 } : out.slice,
  };
  const m = tab ? moreSkinMarks(g, out.body, 'neon', p.style, opts) : moreSkinButtonMarks(g, out.body, 'neon', p.style, opts);
  // the open tab's gap runs out at its open bottom, so the marks leave its Glow out: neonGapGlow paints it
  if (clip === 'tab-active' && p.halo && p.style !== 'sign') neonGapGlow(g, out.body, { face: p.face, frame: p.frame, accent: p.accent, style: p.style });
  return { inner: m.inner, slice: m.slice, edge: out.edge };
}
const plus1 = (s) => ({ left: s.left + 1, top: s.top + 1, right: s.right + 1, bottom: s.bottom + 1 });
function slice(clip, p) {
  const s = plus1(piece(new Surface(...SIZE), clip, p).slice);
  if (clip === 'tab-active') return { ...s, top: Math.max(8, s.top) };
  return s;
}

export default defineSprite({
  id: 'ui-buttons-neon',
  name: 'Neon buttons',
  kind: 'Item',
  blurb: 'A stretchable menu button outlined in a glowing neon tube on a dark wall, in four states (normal, hover, pressed, disabled) plus a tab and an open tab; change the style, corners, tube thickness, glow and colours.',
  meta: {
    type: 'ui', role: 'interface/button', themes: ['neutral', 'sci-fi', 'city'], gameTypes: ['arcade', 'shooter', 'racing', 'roguelike-action'], view: 'none',
    words: ['button', 'neon', 'glow', 'tube', 'menu', 'sign', 'night', 'retro'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [48, 16],
  grounded: false,
  preview: 'normal',
  slice,
  params: {
    style: choice('Style', 'tube', [...MORE_SKIN_STYLES.neon]),
    corner: range('Corner', 0.5, { lo: 'Square', hi: 'Round' }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),   // the tube 2 px, Thick 3 px (moreSkinMarks makes a 1 px band 2 px)
    halo: toggle('Glow', true),
    face: color('Wall', P.cavern, SW.face, { material: 'paint' }),
    frame: color('Tube', P.sky, SW.frame, { material: 'light' }),
    accent: color('Second tube', P.ember, SW.accent, { material: 'light', when: { style: ['double'] } }),
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
    { name: 'Sky tube', params: {} },
    { name: 'Double pink', params: { style: 'double', accent: D.chitin, frame: P.steel, face: D.plate } },
    { name: 'Green sign', params: { style: 'sign', frame: P.goblin, face: P.soil } },
    { name: 'Mint on wine', params: { face: H.bandit, frame: H.heal } },
    { name: 'Square cyan, no glow', params: { halo: false, corner: 0, frame: D.cyan } },
  ],
  // Where the label goes in each clip (white text), and one pixel of the tube to check it against the wall.
  textArea(clip, p) {
    const out = piece(new Surface(...SIZE), clip, p);
    return { ...out.inner, text: SKIN_TEXT.flat, edge: out.edge };
  },
  sounds: {
    pressed: [{ sound: 'menu-console-confirm', preset: 'Select', frame: 0, volume: 0.6 }],
    'tab-active': [{ sound: 'menu-console-move', preset: 'Tab', frame: 0, volume: 0.6 }],
  },

  render(g, { clip, p }) {
    piece(g, clip, p);
  },
});
