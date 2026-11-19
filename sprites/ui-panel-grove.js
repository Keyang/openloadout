// Vine panels (core-sprites-3, batch K27): dark bark boxes wrapped in a pale living vine, with leaves and flowers at
// their corners, for a seed shop, a crafting list and a tooltip, matching ui-buttons-grove.
//   panel         the bark inside the vine
//   panel-title   the same with a heading strip in the bark's dark tone, under a 2 px vine rule
//   inset         a list well: the bark one tone darker
//   tooltip       a small box (94x40 at the top of the frame) with a 5 px tail under its bottom left corner
// Styles, Leaves and the order of drawing as ui-buttons-grove (and ui-buttons-neon, the pathfinder): the flat helper of
// engine/ui-skins.js (style `solid`, square corners), thickenBand for a Thick border's third pixel, roundSlab with
// moreSkinCuts, then groveMarks (engine/ui-grove-vine.js: moreSkinMarks, then the striped twist, rimmed leaves and flower). The flat panel's focus line (2 px of its accent under a heading, along a well's
// top and a tooltip's top) is not part of this look: the flat helper is given the bark's own colour for it, and the
// heading's rule is drawn by moreSkinHeading (engine/ui-skins-more-kit.js) after the marks.
//
// Stretching (`slice`; Contract 8): what moreSkinMarks returns plus the frame's 1 px; panel-title with its top border
// down to the rule under the heading, so the heading keeps its height; the tooltip round its own rectangle.
// Text: white on `inner` and on the heading strip.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { Surface } from '../engine/surface.js';
import { PALETTE } from '../engine/palettes.js';
import { borderPx } from '../engine/ui.js';
import { tone } from '../engine/color.js';
import { skinPanel, skinTooltip, skinSwatches, SKIN_TEXT } from '../engine/ui-skins.js';
import { roundSlab } from '../engine/ui-candy-slab.js';
import { MORE_SKIN_STYLES, moreSkinBase, moreSkinCuts, moreSkinTones } from '../engine/ui-skins-more.js';
import { thickenBand, moreSkinHeading } from '../engine/ui-skins-more-kit.js';
import { groveMarks } from '../engine/ui-grove-vine.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const SIZE = [96, 64], RECT = { x: 1, y: 1, w: SIZE[0] - 2, h: SIZE[1] - 2 };
const TITLE = 11;                                    // rows of the heading strip
const TIP = { x: 1, y: 1, w: 94, h: 40 };            // the tooltip's rectangle, tail included
const SW = skinSwatches('flat', {
  face: [P.soil, P.cavern, H.bandit, D.plate],
  frame: [P.goblin, H.heal, H.wheat, P.cream],
  accent: [P.grass, P.crimson, P.ember, P.thorn, P.hero],
});
const shrink = (r) => ({ x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 });

// Draws one clip and returns { inner, title, slice (from its rectangle), edge }.
function piece(g, clip, p) {
  const base = moreSkinBase('grove', p.style), cuts = moreSkinCuts('grove', p.corner), bp = borderPx(p.border);
  const tip = clip === 'tooltip', inset = clip === 'inset';
  // the flat focus line is given the colour of the wall it lies on, so it is not seen
  const opt = { style: base.style, face: p.face, frame: p.frame, accent: inset ? tone(p.face, -1) : p.face, borderPx: Math.min(2, bp), cornerPx: 0 };
  const out = tip ? skinTooltip(g, TIP.x, TIP.y, TIP.w, TIP.h, 'flat', opt) : skinPanel(g, RECT.x, RECT.y, RECT.w, RECT.h, 'flat', { ...opt, inset });
  const body = tip ? { x: TIP.x, y: TIP.y, w: TIP.w, h: TIP.h - 5 } : out.body;
  // a Thick border's third pixel; the text area then gives the bark ring its row
  let text = out.inner;
  if (bp > 2) { text = shrink(text); thickenBand(g, body, { skip: [text] }); }
  roundSlab(g, body, cuts, { corners: [true, true, true, !tip] });
  const rect = tip ? TIP : RECT, s = out.slice;
  // the stretched middle starts 18 px in (14 on the tooltip's short sides), not at the flat helper's 5 px: the twist
  // runs the first 10 px from each corner along every side, then a leaf lies on the top or bottom and one on the side
  const side = Math.min(18, (rect.h >> 1) - 6);
  const k = { left: Math.max(18, s.left), top: Math.max(side, s.top), right: Math.max(18, s.right), bottom: Math.max(side, s.bottom) };
  const keep = { x: rect.x + k.left, y: rect.y + k.top, w: rect.w - k.left - k.right, h: rect.h - k.top - k.bottom };
  const m = groveMarks(g, body, p.style, {
    piece: tip ? 'tooltip' : 'panel', face: p.face, frame: p.frame, accent: p.accent, leaves: p.leaves, leafAt: 10, skip: [text], keep, rect, slice: s,
  });
  let inner = m.inner, title = null;
  if (clip === 'panel-title') {
    const T = moreSkinTones('grove', { face: p.face, frame: p.frame, accent: p.accent, style: p.style });
    // the strip starts right under the top band (no row of bark between the vine and the heading)
    const mx = inner.x + (inner.w >> 1), faceC = g.get(mx, inner.y);
    let top = inner.y; while (top > body.y && g.get(mx, top - 1) === faceC) top--;
    const from = { ...inner, y: top, h: inner.h + inner.y - top };
    ({ title, inner } = moreSkinHeading(g, body, from, TITLE, { strip: T.faceDark, rule: [T.band, T.band] }));  }
  return { inner, title, slice: m.slice, edge: out.edge };
}
const plus1 = (s) => ({ left: s.left + 1, top: s.top + 1, right: s.right + 1, bottom: s.bottom + 1 });
function slice(clip, p) {
  const out = piece(new Surface(...SIZE), clip, p), s = plus1(out.slice);
  if (clip === 'panel-title') return { ...s, top: Math.max(s.top, out.inner.y) };
  return s;
}

export default defineSprite({
  id: 'ui-panel-grove',
  name: 'Vine panels',
  kind: 'Item',
  blurb: 'Stretchable dark bark boxes wrapped in a pale living vine for shops, crafting lists and tips: a panel, one with a heading, a list well and a tooltip; change the style, corners, vine thickness, leaves and colours.',
  meta: {
    type: 'ui', role: 'interface/panel', themes: ['neutral', 'forest', 'farm'], gameTypes: ['arcade', 'farming-sim', 'top-down-rpg', 'puzzle'], view: 'none',
    words: ['panel', 'window', 'box', 'popup', 'menu', 'tooltip', 'list', 'vine', 'leaf', 'bark', 'forest', 'nature'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [48, 32],
  grounded: false,
  preview: 'panel',
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
    panel: { frames: 1, fps: 8, loop: true, label: 'Plain panel' },
    'panel-title': { frames: 1, fps: 8, loop: true, label: 'With heading' },
    inset: { frames: 1, fps: 8, loop: true, label: 'List well' },
    tooltip: { frames: 1, fps: 8, loop: true, label: 'Tooltip with a tail' },
  },
  versions: [
    { name: 'Vine', params: {} },
    { name: 'Berry bloom', params: { style: 'bloom', accent: P.thorn, face: H.bandit, frame: H.heal } },
    { name: 'Old bark', params: { style: 'bark', frame: H.wheat, border: 1 } },
    { name: 'Mint at night', params: { face: P.cavern, frame: H.heal, accent: P.hero } },
    { name: 'Bare', params: { leaves: false, corner: 0.25, face: D.plate } },
  ],
  // Where text goes (white text), and one pixel of the vine to check it against.
  textArea(clip, p) {
    const out = piece(new Surface(...SIZE), clip, p), text = SKIN_TEXT.flat;
    const main = { ...out.inner, text, edge: out.edge };
    return out.title ? [main, { ...out.title, text, edge: out.edge }] : main;
  },
  render(g, { clip, p }) {
    piece(g, clip, p);
  },
});
