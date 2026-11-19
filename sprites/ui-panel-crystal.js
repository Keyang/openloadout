// Crystal panels (core-sprites-3, batch K26): frozen boxes of deep ice (the Stone colour) in a cut crystal band lit
// like a bevel, for a spell list, a shop and a tooltip, matching ui-buttons-crystal.
//   panel         the stone inside the band
//   panel-title   the same with a heading strip in the stone's dark tone, under a 3 px crystal rule (lit, band, shadow)
//   inset         a list well: the stone one tone darker
//   tooltip       a small box (94x40 at the top of the frame) with a 5 px tail under its bottom left corner
// Styles and Glints as ui-buttons-crystal; built in the order ui-buttons-neon's header gives: the flat helper of
// engine/ui-skins.js (solid, square corners), thickenBand for a Thick border's third pixel, roundSlab with
// moreSkinCuts('crystal'), then moreSkinMarks. The flat panel's focus line (2 px of its accent) is not part of this
// look: the flat helper is given the stone's own colour for it, so it vanishes, and the heading's rule is drawn by
// moreSkinHeading (engine/ui-skins-more-kit.js) after the marks. Two finishes from engine/ui-crystal-frost.js:
// rime's ferns are grown back to the band at the cut (crystalFernRoots: a 4 px stem, two branches each side, the
// accent tip: 9 px), and shard draws three shards 7, 5 and 4 px tall (crystalShards) over the small ones
// moreSkinMarks leaves in the band, so they rise over it onto the stone and show at 1x.
//
// Stretching (`slice`; Contract 8): the text area and the stretched middle start 12 px in from every side, so the
// corner marks have room at every Corner; the slice is what the marks and shards reach (about 9 to 12 px); panel-title with its top border
// down to the rule under the heading, so the heading keeps its height; the tooltip round its own rectangle.
// Text: white on `inner` and on the heading strip.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { Surface } from '../engine/surface.js';
import { PALETTE } from '../engine/palettes.js';
import { borderPx, desaturate } from '../engine/ui.js';
import { tone, INK, col } from '../engine/color.js';
import { skinPanel, skinTooltip, skinSwatches, SKIN_TEXT } from '../engine/ui-skins.js';
import { roundSlab } from '../engine/ui-candy-slab.js';
import { MORE_SKIN_STYLES, moreSkinBase, moreSkinCuts, moreSkinMarks, moreSkinTones } from '../engine/ui-skins-more.js';
import { thickenBand, moreSkinHeading } from '../engine/ui-skins-more-kit.js';
import { crystalFernRoots, crystalShards, crystalCornerIn } from '../engine/ui-crystal-frost.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const SIZE = [96, 64], RECT = { x: 1, y: 1, w: SIZE[0] - 2, h: SIZE[1] - 2 };
const TITLE = 11;                                    // rows of the heading strip
const TIP = { x: 1, y: 1, w: 94, h: 40 };            // the tooltip's rectangle, tail included
const SW = skinSwatches('flat', {
  face: [P.cavern, P.soil, D.plate, H.bandit],
  frame: [P.sky, P.goblin, D.cyan, H.heal],
  accent: [P.magic, P.crimson, P.moss, D.xp, H.thunder],
});
const shrink = (r) => ({ x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 });
const within = (a, b) => { const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y); return { x, y, w: Math.min(a.x + a.w, b.x + b.w) - x, h: Math.min(a.y + a.h, b.y + b.h) - y }; };
// From the piece's rectangle to the stretched middle and the text area: the corner zones are 12 px square, so the
// whole fern (stem, branches, tip), all three shards and both glints fit at every Corner (moreSkinMarks drops any
// mark pixel in the middle's columns or rows).
const MARGIN = 12;

// Draws one clip and returns { inner, title, slice (from its rectangle), edge }.
function piece(g, clip, p) {
  const base = moreSkinBase('crystal', p.style), cuts = moreSkinCuts('crystal', p.corner), bp = borderPx(p.border);
  const tip = clip === 'tooltip', inset = clip === 'inset';
  // the flat focus line is given the colour of the stone it lies on, so it is not seen
  const opt = { style: base.style, face: p.face, frame: p.frame, accent: inset ? tone(p.face, -1) : p.face, borderPx: Math.min(2, bp), cornerPx: 0 };
  const out = tip ? skinTooltip(g, TIP.x, TIP.y, TIP.w, TIP.h, 'flat', opt) : skinPanel(g, RECT.x, RECT.y, RECT.w, RECT.h, 'flat', { ...opt, inset });
  const body = tip ? { x: TIP.x, y: TIP.y, w: TIP.w, h: TIP.h - 5 } : out.body;
  // the text area and the stretched middle stay inside the frame's 8 px slice, so the corner marks (glints, icicles,
  // ferns, shards) have the corner zones to themselves at every Corner
  const rect = tip ? TIP : RECT, s = out.slice;
  const keep = within(out.inner, { x: rect.x + MARGIN, y: rect.y + MARGIN, w: rect.w - 2 * MARGIN, h: body.h - 2 * MARGIN });
  let text = keep;
  if (bp > 2) { text = within(shrink(out.inner), keep); thickenBand(g, body, { skip: [text] }); }
  roundSlab(g, body, cuts, { corners: [true, true, true, !tip] });
  const m = moreSkinMarks(g, body, 'crystal', p.style, {
    piece: tip ? 'tooltip' : 'panel', face: p.face, frame: p.frame, accent: p.accent, extras: p.glints, skip: [text], keep, rect, slice: s,
  });
  const T = moreSkinTones('crystal', { face: p.face, frame: p.frame, accent: p.accent, style: p.style });
  const face = g.get(text.x + (text.w >> 1), text.y + (text.h >> 1));
  const added = [];
  // each fern grows from the band at its cut corner: a 4 px stem, its accent tip and two branches each side (9 px)
  if (p.style === 'rime') added.push(...crystalFernRoots(g, body, { inside: face, stem: T.facetLight, tip: T.accent }));
  if (p.style === 'shard') {
    // three shards 7, 5 and 4 px tall standing on the bottom bevel and rising over the band onto the stone, over the
    // small ones moreSkinMarks draws there, so they are seen at 1x
    const inks = new Set([col(INK), col(desaturate(INK))]);
    const glint = p.glints ? col(T.accent) : -1;   // the bottom sparkles stay on top of the shards
    const can = (px, py) => { const c = g.get(px, py); return !!c && !inks.has(c) && c !== glint && !(px >= text.x && px < text.x + text.w && py >= text.y && py < text.y + text.h); };
    const base = body.y + body.h - 2;
    for (const c of [2, 3]) {
      const k = crystalCornerIn(g, body, c, face);
      if (k < 0) continue;
      const x0 = c === 3 ? body.x + k : body.x + body.w - 1 - k;
      added.push(...crystalShards(g, x0, base, c === 3 ? 1 : -1, [7, 5, 4], { light: T.facetLight, dark: T.facetDark, tip: T.white, gap: [1, 0], can }));
    }
  }
  const S = { ...m.slice };
  for (const [px, py] of added) {
    if (px < rect.x + rect.w / 2) S.left = Math.max(S.left, px - rect.x + 1); else S.right = Math.max(S.right, rect.x + rect.w - px);
    if (py < rect.y + rect.h / 2) S.top = Math.max(S.top, py - rect.y + 1); else S.bottom = Math.max(S.bottom, rect.y + rect.h - py);
  }
  let inner = m.inner, title = null;
  if (clip === 'panel-title') {
    const T = moreSkinTones('crystal', { face: p.face, frame: p.frame, accent: p.accent, style: p.style });
    // the strip starts right under the band (the face's first row), not at the text area's 8 px inset
    const mx = inner.x + (inner.w >> 1), faceC = g.get(mx, inner.y + (inner.h >> 1));
    let top = body.y; while (top < inner.y && g.get(mx, top) !== faceC) top++;
    const from = { ...inner, y: top, h: inner.h + inner.y - top };
    ({ title, inner } = moreSkinHeading(g, body, from, TITLE, { strip: T.faceDark, rule: [T.facetLight, T.band, T.facetDark] }));
  }
  return { inner, title, slice: S, edge: out.edge };
}
const plus1 = (s) => ({ left: s.left + 1, top: s.top + 1, right: s.right + 1, bottom: s.bottom + 1 });
function slice(clip, p) {
  const out = piece(new Surface(...SIZE), clip, p), s = plus1(out.slice);
  if (clip === 'panel-title') return { ...s, top: Math.max(s.top, out.inner.y) };
  return s;
}

export default defineSprite({
  id: 'ui-panel-crystal',
  name: 'Crystal panels',
  kind: 'Item',
  blurb: 'Stretchable boxes of deep ice in a cut crystal band for spell lists, shops and tips: a panel, one with a heading, a list well and a tooltip, with icicles, frost ferns or shards; change the style, corners, band, glints and colours.',
  meta: {
    type: 'ui', role: 'interface/panel', themes: ['neutral', 'fantasy'], gameTypes: ['arcade', 'turn-based-rpg', 'puzzle', 'top-down-rpg'], view: 'none',
    words: ['panel', 'window', 'box', 'popup', 'menu', 'tooltip', 'list', 'crystal', 'ice', 'frost', 'frozen', 'shard'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [48, 32],
  grounded: false,
  preview: 'panel',
  slice,
  params: {
    style: choice('Style', 'ice', [...MORE_SKIN_STYLES.crystal]),
    corner: range('Corner', 0.5, { lo: 'Square', hi: 'Round' }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    glints: toggle('Glints', true),
    face: color('Stone', P.cavern, SW.face, { material: 'stone' }),
    frame: color('Crystal', P.sky, SW.frame, { material: 'magic' }),
    accent: color('Sparkles and frost tips', P.magic, SW.accent, { material: 'magic', when: [{ glints: [true] }, { style: ['rime'] }] }),
  },
  clips: {
    panel: { frames: 1, fps: 8, loop: true, label: 'Plain panel' },
    'panel-title': { frames: 1, fps: 8, loop: true, label: 'With heading' },
    inset: { frames: 1, fps: 8, loop: true, label: 'List well' },
    tooltip: { frames: 1, fps: 8, loop: true, label: 'Tooltip with a tail' },
  },
  // Frost, Shard and Jade carry settings beyond the specification's (frame, border, face, corner): as written they
  // measured 0.02 to 0.16 apart at card size (VERSION_RULES.between 0.2); a panel's card is mostly its face
  versions: [
    { name: 'Ice', params: {} },
    { name: 'Frost', params: { style: 'rime', accent: P.crimson, face: D.plate, frame: H.heal, border: 1 } },
    { name: 'Shard', params: { style: 'shard', frame: D.cyan, border: 1, face: P.soil, corner: 0 } },
    { name: 'Garnet', params: { face: H.bandit, frame: H.heal, glints: false } },
    { name: 'Jade', params: { frame: P.goblin, accent: P.moss, corner: 1, face: P.soil } },
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
