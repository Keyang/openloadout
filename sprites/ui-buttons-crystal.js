// Crystal buttons (core-sprites-3, batch K26): a button of deep ice (the Stone colour) in a cut crystal band lit like
// a bevel, one clip per state, plus a tab and an open tab, matching ui-panel-crystal, ui-bars-crystal and
// ui-controls-crystal.
//   normal    the band lit along the top and right, dark along the bottom and left, on a 2 px lip of the stone's dark tone
//   hover     the band brightens (its light facet with it); the stone lightens by at most tone(face, 0.1)
//   pressed   2 px lower, down onto the lip            disabled  no colour, no shine
//   tab       a darker tab standing on an ink line     tab-active  a full-height tab of the stone, open at the bottom
// Styles: ice (icicles hanging inside the top band in the top corners), rime (a frost fern growing in from each cut
// corner, its tip in the accent), shard (upright crystal shards rising over the bottom band in the bottom corners).
// Glints: a white plus in each top corner and an accent sparkle in each bottom corner.
//
// Built the way ui-buttons-neon (that file's header) builds a piece of a skin drawn over `flat`: the flat helper of
// engine/ui-skins.js (solid, square corners) with the frame minus its 1 px border, thickenBand for a Thick border's
// third pixel, roundSlab with moreSkinCuts('crystal') (45 degree cuts, 2 to 5 px), then moreSkinButtonMarks /
// moreSkinMarks. The text area is the `inner` the marks return.
//
// Two finishes from engine/ui-crystal-frost.js: rime's ferns are grown back to the band at the cut
// (crystalFernRoots: a 4 px stem, two branches each side, the accent tip: 9 px), and shard draws three shards 6, 4
// and 3 px tall (crystalShards) from each bottom corner over the small ones moreSkinMarks leaves in the band, so they
// rise over it onto the stone and show at 1x (the accent sparkles stay on top of them). Glints are 16 px on every
// clip: on the tabs the bottom sparkles lie on the stone just above the ink line (no bottom band there).
//
// Stretching (`slice`; Contract 8): what moreSkinMarks returns (the helper's slice, or more where a corner mark
// reaches further in), widened to hold the shards, plus the frame's 1 px; pressed keeps the flat button's 5 px
// bottom; tabs 8 at the open top. The stretched middle (KEEP) and the text area start 12 to 13 px in from the sides.
// Text: white (SKIN_TEXT.flat); the lists pass skinSwatches('flat', ...) unchanged.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { Surface } from '../engine/surface.js';
import { PALETTE } from '../engine/palettes.js';
import { LIP, borderPx, desaturate } from '../engine/ui.js';
import { skinButton, skinTab, skinSwatches, SKIN_TEXT } from '../engine/ui-skins.js';
import { roundSlab } from '../engine/ui-candy-slab.js';
import { MORE_SKIN_STYLES, moreSkinBase, moreSkinCuts, moreSkinMarks, moreSkinTones } from '../engine/ui-skins-more.js';
import { crystalFernRoots, crystalShards, crystalCornerIn } from '../engine/ui-crystal-frost.js';
import { INK, col } from '../engine/color.js';
import { thickenBand, moreSkinButtonMarks, dimDisabled } from '../engine/ui-skins-more-kit.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const SIZE = [96, 32], RECT = { x: 1, y: 1, w: SIZE[0] - 2, h: SIZE[1] - 2 };
const SW = skinSwatches('flat', {
  face: [P.cavern, P.soil, D.plate, H.bandit],
  frame: [P.sky, P.goblin, D.cyan, H.heal],
  accent: [P.magic, P.crimson, P.moss, D.xp, H.thunder],
});
// The stretched middle of each clip (the frame's slice): the corner marks stay out of it. It leaves the corner zones
// 12 px wide and 9 to 10 px tall, so the whole fern (stem, branches, tip), all three shards and both glints fit at
// every Corner (moreSkinMarks drops any mark pixel in these columns or rows).
const KEEP = { normal: { x: 13, y: 10, w: 70, h: 10 }, pressed: { x: 13, y: 12, w: 70, h: 10 }, tab: { x: 13, y: 12, w: 70, h: 10 }, 'tab-active': { x: 13, y: 12, w: 70, h: 10 } };
// The text area starts this far in from each side, clear of the ferns and shards.
const TEXT_X = 12;
const isTab = (clip) => clip === 'tab' || clip === 'tab-active';

// Draws one clip and returns { inner (the text area), slice (from RECT), edge }.
function piece(g, clip, p) {
  const base = moreSkinBase('crystal', p.style), cuts = moreSkinCuts('crystal', p.corner), bp = borderPx(p.border);
  const opt = { style: base.style, face: p.face, frame: p.frame, accent: p.accent, borderPx: Math.min(2, bp), cornerPx: 0 };
  const tab = isTab(clip);
  const out = tab ? skinTab(g, RECT.x, RECT.y, RECT.w, RECT.h, clip === 'tab-active', 'flat', opt)
    : skinButton(g, RECT.x, RECT.y, RECT.w, RECT.h, clip, 'flat', opt);
  // the open tab's text starts under its 8 px top slice
  let text = clip === 'tab-active' ? { ...out.text, y: Math.max(out.text.y, 8), h: Math.min(out.text.h, SIZE[1] - 2 - Math.max(out.text.y, 8)) } : out.text;
  if (text.x < TEXT_X) text = { ...text, x: TEXT_X, w: text.w - 2 * (TEXT_X - text.x) };
  if (bp > 2) {
    text = clip === 'tab-active' ? { ...text, h: text.h - 1 } : { ...text, y: text.y + 1, h: text.h - 2 };
    thickenBand(g, out.body, { skip: [text] });
  }
  roundSlab(g, out.body, cuts, tab ? { corners: [true, true, false, false], openBottom: true } : { below: clip === 'pressed' ? 0 : LIP, bottomCuts: cuts });
  const opts = {
    piece: tab ? 'tab' : 'button', face: p.face, frame: p.frame, accent: p.accent, state: tab ? 'normal' : clip,
    extras: p.glints, skip: [text], keep: KEEP[clip] ?? KEEP.normal, rect: RECT, slice: clip === 'pressed' ? { ...out.slice, bottom: 4 } : out.slice,
  };
  const m = tab ? moreSkinMarks(g, out.body, 'crystal', p.style, opts) : moreSkinButtonMarks(g, out.body, 'crystal', p.style, opts);
  const T = moreSkinTones('crystal', { face: p.face, frame: p.frame, accent: p.accent, style: p.style, state: tab ? 'normal' : clip });
  const face = g.get(text.x + (text.w >> 1), text.y + (text.h >> 1));
  const added = [];
  // each fern grows from the band at its cut corner: a 4 px stem, its accent tip and two branches each side (9 px)
  if (p.style === 'rime') added.push(...crystalFernRoots(g, out.body, { inside: face, stem: T.facetLight, tip: T.accent }));
  if (p.style === 'shard') {
    // three shards 6, 4 and 3 px tall standing on the bottom bevel (the open bottom of the active tab) and rising over
    // the band onto the stone, over the small ones moreSkinMarks draws there, so they are seen at 1x
    const inks = new Set([col(INK), col(desaturate(INK))]);
    const glint = p.glints ? col(T.accent) : -1;   // the bottom sparkles stay on top of the shards
    const can = (px, py) => { const c = g.get(px, py); return !!c && !inks.has(c) && c !== glint && !(px >= text.x && px < text.x + text.w && py >= text.y && py < text.y + text.h); };
    const base = out.body.y + out.body.h - (clip === 'tab-active' ? 1 : 2);
    for (const c of [2, 3]) {
      const k = crystalCornerIn(g, out.body, c, face);
      if (k < 0) continue;
      const x0 = c === 3 ? out.body.x + k : out.body.x + out.body.w - 1 - k;
      added.push(...crystalShards(g, x0, base, c === 3 ? 1 : -1, [6, 4, 3], { light: T.facetLight, dark: T.facetDark, tip: T.white, gap: [1, 0], can }));
    }
  }
  // the slice holds every pixel added here as well as the marks
  const S = { ...m.slice };
  for (const [px, py] of added) {
    if (px < RECT.x + RECT.w / 2) S.left = Math.max(S.left, px - RECT.x + 1); else S.right = Math.max(S.right, RECT.x + RECT.w - px);
    if (py < RECT.y + RECT.h / 2) S.top = Math.max(S.top, py - RECT.y + 1); else S.bottom = Math.max(S.bottom, RECT.y + RECT.h - py);
  }
  return { inner: m.inner, slice: S, edge: out.edge };
}
const plus1 = (s) => ({ left: s.left + 1, top: s.top + 1, right: s.right + 1, bottom: s.bottom + 1 });
function slice(clip, p) {
  const s = plus1(piece(new Surface(...SIZE), clip, p).slice);
  if (clip === 'tab-active') return { ...s, top: Math.max(8, s.top) };
  return s;
}

export default defineSprite({
  id: 'ui-buttons-crystal',
  name: 'Crystal buttons',
  kind: 'Item',
  blurb: 'A stretchable menu button of deep ice in a cut crystal band lit like a bevel, with icicles, frost ferns or shards, in four states (normal, hover, pressed, disabled) plus a tab and an open tab; change the style, corners, band, glints and colours.',
  meta: {
    type: 'ui', role: 'interface/button', themes: ['neutral', 'fantasy'], gameTypes: ['arcade', 'turn-based-rpg', 'puzzle', 'top-down-rpg'], view: 'none',
    words: ['button', 'crystal', 'ice', 'frost', 'frozen', 'menu', 'shard', 'glass'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [48, 16],
  grounded: false,
  preview: 'normal',
  slice,
  params: {
    style: choice('Style', 'ice', [...MORE_SKIN_STYLES.crystal]),
    corner: range('Corner', 0.5, { lo: 'Square', hi: 'Round' }),   // the cut corners 2 to 5 px
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    glints: toggle('Glints', true),
    face: color('Stone', P.cavern, SW.face, { material: 'stone' }),
    frame: color('Crystal', P.sky, SW.frame, { material: 'magic' }),
    accent: color('Sparkles and frost tips', P.magic, SW.accent, { material: 'magic', when: [{ glints: [true] }, { style: ['rime'] }] }),
  },
  clips: {
    normal: { frames: 1, fps: 8, loop: true, label: 'At rest, not pointed at' },
    hover: { frames: 1, fps: 8, loop: true, label: 'Pointed at by the cursor' },
    pressed: { frames: 1, fps: 8, loop: true, label: 'Held down while pressed' },
    disabled: { frames: 1, fps: 8, loop: true, label: 'Greyed out, not available now' },
    tab: { frames: 1, fps: 8, loop: true, label: 'Tab, for a page that is not open' },
    'tab-active': { frames: 1, fps: 8, loop: true, label: 'Open tab, for the page on view' },
  },
  // Ruby frost and Jade shard carry settings beyond the specification's (face, border): as written they measured 0.04
  // and 0.18 from Ice at card size (VERSION_RULES.between 0.2), since derelict.plate is nearly cavern there
  versions: [
    { name: 'Ice', params: {} },
    { name: 'Ruby frost', params: { style: 'rime', frame: D.cyan, accent: P.crimson, face: H.bandit, border: 0 } },
    { name: 'Jade shard', params: { style: 'shard', frame: P.goblin, face: D.plate, border: 1 } },
    { name: 'Mint garnet', params: { frame: H.heal, face: H.bandit, glints: false } },
    { name: 'Amber', params: { face: P.soil, accent: H.thunder, corner: 1 } },
  ],
  // Where the label goes in each clip (white text), and one pixel of the band to check it against the stone.
  textArea(clip, p) {
    const out = piece(new Surface(...SIZE), clip, p);
    return { ...out.inner, text: SKIN_TEXT.flat, edge: out.edge };
  },
  sounds: {
    pressed: [{ sound: 'menu-glass-confirm', preset: 'Select', frame: 0, volume: 0.6 }],
    'tab-active': [{ sound: 'menu-glass-move', preset: 'Tab', frame: 0, volume: 0.6 }],
  },

  render(g, { clip, p }) {
    piece(g, clip, p);
    if (clip === 'disabled') dimDisabled(g);   // one step darker, so a pale band and its grey stay two tones under every look
  },
});
