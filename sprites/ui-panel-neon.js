// Neon panels (core-sprites-3, batch K25): boxes outlined in a glowing neon tube on a dark wall, for a pause menu, a
// high-score table, a list and a tooltip, matching ui-buttons-neon.
//   panel         the wall inside the tube
//   panel-title   the same with a heading strip in the wall's dark tone, under a 3 px tube line (band, core, band)
//   inset         a list well: the wall one tone darker
//   tooltip       a small box (94x40 at the top of the frame) with a 5 px tail of the tube under its bottom left corner
// Styles, Glow and the order of drawing as ui-buttons-neon (that file's header): the flat helper of engine/ui-skins.js
// (square corners), thickenBand for a Thick border's third pixel, roundSlab with moreSkinCuts, then moreSkinMarks.
// The flat panel's focus line (2 px of its accent under a heading, along a well's top and a tooltip's top) is not
// part of this look: the flat helper is given the wall's own colour for it, so it vanishes into the wall, and the
// heading's line is drawn as a tube by moreSkinHeading (engine/ui-skins-more-kit.js) after the marks.
//
// Stretching (`slice`; Contract 8): what moreSkinMarks returns plus the frame's 1 px (8 on every side); panel-title
// with its top border down to the tube line under the heading, so the heading keeps its height; the tooltip round
// its own rectangle, the tail inside the left 8 px and the bottom 5 px deeper.
// Text: white on `inner` and on the heading strip.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { Surface } from '../engine/surface.js';
import { PALETTE } from '../engine/palettes.js';
import { borderPx } from '../engine/ui.js';
import { tone } from '../engine/color.js';
import { skinPanel, skinTooltip, skinSwatches, SKIN_TEXT } from '../engine/ui-skins.js';
import { roundSlab } from '../engine/ui-candy-slab.js';
import { MORE_SKIN_STYLES, moreSkinBase, moreSkinCuts, moreSkinMarks, moreSkinTones } from '../engine/ui-skins-more.js';
import { thickenBand, moreSkinHeading } from '../engine/ui-skins-more-kit.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const SIZE = [96, 64], RECT = { x: 1, y: 1, w: SIZE[0] - 2, h: SIZE[1] - 2 };
const TITLE = 11;                                    // rows of the heading strip
const TIP = { x: 1, y: 1, w: 94, h: 40 };            // the tooltip's rectangle, tail included
const SW = skinSwatches('flat', {
  face: [P.cavern, P.soil, D.plate, H.bandit],
  frame: [P.sky, P.goblin, P.steel, D.cyan, H.heal],
  accent: [P.ember, P.thorn, P.gold, D.xp, D.chitin],
});
const shrink = (r) => ({ x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 });

// Draws one clip and returns { inner, title, slice (from its rectangle), edge }.
function piece(g, clip, p) {
  const base = moreSkinBase('neon', p.style), cuts = moreSkinCuts('neon', p.corner), bp = borderPx(p.border);
  const tip = clip === 'tooltip', inset = clip === 'inset';
  // the flat focus line is given the colour of the wall it lies on, so it is not seen
  const opt = { style: base.style, face: p.face, frame: p.frame, accent: inset ? tone(p.face, -1) : p.face, borderPx: Math.min(2, bp), cornerPx: 0 };
  const out = tip ? skinTooltip(g, TIP.x, TIP.y, TIP.w, TIP.h, 'flat', opt) : skinPanel(g, RECT.x, RECT.y, RECT.w, RECT.h, 'flat', { ...opt, inset });
  const body = tip ? { x: TIP.x, y: TIP.y, w: TIP.w, h: TIP.h - 5 } : out.body;
  // a Thick border's third pixel; the text area then gives the second tube or the sign's glow its row
  let text = out.inner;
  if (bp > 2) { text = shrink(text); thickenBand(g, body, { skip: [text] }); }
  roundSlab(g, body, cuts, { corners: [true, true, true, !tip] });
  const rect = tip ? TIP : RECT, s = out.slice;
  const keep = { x: rect.x + s.left, y: rect.y + s.top, w: rect.w - s.left - s.right, h: rect.h - s.top - s.bottom };
  const m = moreSkinMarks(g, body, 'neon', p.style, {
    piece: tip ? 'tooltip' : 'panel', face: p.face, frame: p.frame, accent: p.accent, extras: p.halo, skip: [text], keep, rect, slice: s,
  });
  let inner = m.inner, title = null;
  if (clip === 'panel-title') {
    const T = moreSkinTones('neon', { face: p.face, frame: p.frame, accent: p.accent, style: p.style });
    ({ title, inner } = moreSkinHeading(g, body, inner, TITLE, { strip: T.faceDark, rule: [T.band, T.core, T.band] }));
  }
  return { inner, title, slice: m.slice, edge: out.edge };
}
const plus1 = (s) => ({ left: s.left + 1, top: s.top + 1, right: s.right + 1, bottom: s.bottom + 1 });
function slice(clip, p) {
  const out = piece(new Surface(...SIZE), clip, p), s = plus1(out.slice);
  if (clip === 'panel-title') return { ...s, top: Math.max(s.top, out.inner.y) };
  return s;
}

export default defineSprite({
  id: 'ui-panel-neon',
  name: 'Neon panels',
  kind: 'Item',
  blurb: 'Stretchable dark boxes outlined in a glowing neon tube for menus, score tables and tips: a panel, one with a heading, a list well and a tooltip; change the style, corners, tube thickness, glow and colours.',
  meta: {
    type: 'ui', role: 'interface/panel', themes: ['neutral', 'sci-fi', 'city'], gameTypes: ['arcade', 'shooter', 'racing', 'roguelike-action'], view: 'none',
    words: ['panel', 'window', 'box', 'popup', 'menu', 'tooltip', 'list', 'neon', 'glow', 'tube', 'sign', 'night'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [48, 32],
  grounded: false,
  preview: 'panel',
  slice,
  params: {
    style: choice('Style', 'tube', [...MORE_SKIN_STYLES.neon]),
    corner: range('Corner', 0.5, { lo: 'Square', hi: 'Round' }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),   // the tube 2 px, Thick 3 px
    halo: toggle('Glow', true),
    face: color('Wall', P.cavern, SW.face, { material: 'paint' }),
    frame: color('Tube', P.sky, SW.frame, { material: 'light' }),
    accent: color('Second tube', P.ember, SW.accent, { material: 'light', when: { style: ['double'] } }),
  },
  clips: {
    panel: { frames: 1, fps: 8, loop: true, label: 'Plain panel' },
    'panel-title': { frames: 1, fps: 8, loop: true, label: 'With heading' },
    inset: { frames: 1, fps: 8, loop: true, label: 'List well' },
    tooltip: { frames: 1, fps: 8, loop: true, label: 'Tooltip with a tail' },
  },
  versions: [
    { name: 'Sky box', params: {} },
    { name: 'Double on cyan', params: { style: 'double', frame: D.cyan, face: D.plate } },
    { name: 'Green sign', params: { style: 'sign', frame: P.goblin, face: P.soil } },
    { name: 'Mint wine', params: { face: H.bandit, frame: H.heal, border: 1 } },
    { name: 'Square steel', params: { corner: 0, frame: P.steel, halo: false } },
  ],
  // Where text goes (white text), and one pixel of the tube to check it against.
  textArea(clip, p) {
    const out = piece(new Surface(...SIZE), clip, p), text = SKIN_TEXT.flat;
    const main = { ...out.inner, text, edge: out.edge };
    return out.title ? [main, { ...out.title, text, edge: out.edge }] : main;
  },
  render(g, { clip, p }) {
    piece(g, clip, p);
  },
});
