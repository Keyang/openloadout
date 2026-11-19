// Stone and gold panels (core-sprites-2, batch K14): stone plates in carved gold frames for an inventory, a shop,
// a quest board and a tooltip, matching the stone and gold buttons, built on engine/ui-skins.js (skin `gilded`).
//   panel         a dark stone plate in a lit gold band, a gem set in each corner
//   panel-title   the same with a heading plaque: the stone's dark tone under a 1 px gold rule
//   inset         a list well: the stone one tone darker, in the same gold band
//   tooltip       a small plate (94x40 at the top of the frame) with a gold tail under its bottom left corner
// Styles (engine/ui-gilded.js, over the helper): a gold corner plate with a gem in each corner; temple (cut corners,
// a gold fillet inside the band, a key pattern of 1 px steps carved along the top and bottom band, repeating every
// 4 px from the slice line), royal (round corners, three-dot scrolls, a cushioned stone edge; at most 10 colours),
// ruin (dull gold, chipped corners, two cracks through the top and bottom band into the stone); the key and the
// cracks come from engine/ui-gilded-carve.js.
//
// Stretching (`slice`; Contract 8): panel and inset nine-slice with 8 px; panel-title the same with its top border
// down to the gold rule under the heading, so the heading keeps its height; tooltip round its own rectangle, the
// tail inside the left 8 px.
// Text: white on `inner` and on the heading plaque; skinSwatches keeps only stones on which white holds 4.5 to 1
// and golds that hold 3 to 1 against them, under every whole-bundle look.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { Surface } from '../engine/surface.js';
import { PALETTE } from '../engine/palettes.js';
import { slice9 } from '../engine/ui.js';
import { skinPanel, skinTooltip, skinSwatches, skinTones, SKIN_STYLES, SKIN_TEXT } from '../engine/ui-skins.js';
import { gildedCorners } from '../engine/ui-gilded.js';
import { gildedKey, gildedCracks } from '../engine/ui-gilded-carve.js';
import { tone, col } from '../engine/color.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const SIZE = [96, 64];
const TITLE = 11;                                    // rows of the heading plaque
const TIP = { x: 1, y: 1, w: 94, h: 40 };            // the tooltip's rectangle, tail included
const SW = skinSwatches('gilded', {
  face: [P.cavern, P.soil, D.plate, H.bandit],
  frame: [P.cream, P.steel, P.skin, H.thunder, H.wheat],
  accent: [P.magic, P.crimson, P.moss, P.hero, P.ember],
});

// the ruin's cracks, as depths from the ink line inside the band (negative: into the gold; 1: the stone): a split zigzagging through the gold, then
// down through the ink line into the 1 px of stone outside the text plate
const CRACKS = [
  { side: 'top', at: 0.2, dir: 1, path: [-1, -2, -2, -2, -1, -1, -2, -2, -2, -1, -1, -1, 0, 1, 1] },
  { side: 'bottom', at: 0.76, dir: -1, path: [-1, -2, -2, -1, -1, -2, -2, -2, -1, -1, 0, 1, 1] },
];
const look = (p) => ({ style: p.style, face: p.face, frame: p.frame, accent: p.accent, border: p.border, corner: p.corner, extras: false });
// The helper draws the plate; engine/ui-gilded.js then sets a gold corner plate with the style's motif and a gem in
// each corner (temple adds a gold fillet inside the band, royal a cushioned stone edge, ruin dull gold, chips and
// cracks), outside the stretched middle, the text plate and the heading.
function drawn(g, clip, p) {
  if (clip === 'tooltip') return skinTooltip(g, TIP.x, TIP.y, TIP.w, TIP.h, 'gilded', look(p));
  return skinPanel(g, 1, 1, SIZE[0] - 2, SIZE[1] - 2, 'gilded', { ...look(p), title: clip === 'panel-title' ? TITLE : 0, inset: clip === 'inset' });
}
function sliceOf(clip, out) {
  if (clip === 'tooltip') return slice9(TIP);
  if (clip === 'panel-title') return { ...slice9(), top: out.inner.y };
  return slice9();
}
function piece(g, clip, p) {
  const out = drawn(g, clip, p), s = sliceOf(clip, out);
  const r = s.rect ?? { x: 0, y: 0, w: SIZE[0], h: SIZE[1] };
  const keep = { x: r.x + s.left, y: r.y + s.top, w: r.w - s.left - s.right, h: r.h - s.top - s.bottom };
  const body = out.body ?? { x: TIP.x, y: TIP.y, w: TIP.w, h: TIP.h - 5 };
  gildedCorners(g, body, p.style, {
    face: p.face, frame: p.frame, accent: p.accent, corner: p.corner, border: p.border, gems: p.gems,
    keep, skip: [out.inner, out.title].filter(Boolean),
  });
  const skip = [out.inner, out.title].filter(Boolean);
  // temple: the key of 1 px steps carved along the top and bottom band, repeating every 4 px from the slice line;
  // ruin: two cracks from the gold through the ink line into the stone border (top band and bottom band)
  if (p.style === 'temple') gildedKey(g, body, { keep, skip });
  if (p.style === 'ruin') gildedCracks(g, body, CRACKS, { skip });
  // royal: the cushion round the heading plaque reuses the stone's own two tones (the face lit, the plaque dark), so
  // the clip keeps to 10 colours
  if (p.style === 'royal' && out.title) {
    const T = skinTones('gilded', { face: p.face, frame: p.frame, accent: p.accent, style: p.style });
    const swap = new Map([[col(tone(T.faceDark, 0.45)), col(T.face)], [col(tone(T.faceDark, -1)), col(T.faceDark)]]);
    for (let py = out.title.y; py < out.title.y + out.title.h; py++) for (let px = 0; px < g.w; px++) {
      const c = swap.get(g.get(px, py));
      if (c) g.data[py * g.w + px] = c;
    }
  }
  return out;
}

function slice(clip, p) {
  return sliceOf(clip, drawn(new Surface(...SIZE), clip, p));
}

export default defineSprite({
  id: 'ui-panel-gilded',
  name: 'Stone and gold panels',
  kind: 'Item',
  blurb: 'Stretchable stone plates in carved gold frames for an inventory, a shop or a quest board: a plain plate, a plate with a heading, a list well and a tooltip; change the style, corners, band, gems and colours.',
  meta: {
    type: 'ui', role: 'interface/panel', themes: ['neutral', 'fantasy', 'dungeon'], gameTypes: ['arcade', 'turn-based-rpg', 'top-down-rpg', 'card-game'], view: 'none',
    words: ['panel', 'window', 'box', 'menu', 'stone', 'gold', 'gem', 'plaque', 'inventory', 'shop', 'tooltip', 'list', 'popup', 'carved'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [48, 32],
  grounded: false,
  preview: 'panel',
  slice,
  params: {
    style: choice('Style', 'temple', [...SKIN_STYLES.gilded]),
    corner: range('Corner', 0.5, { lo: 'Square', hi: 'Round' }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    gems: toggle('Gems', true),
    face: color('Stone', P.cavern, SW.face),
    frame: color('Gold', P.cream, SW.frame, { material: 'metal' }),
    accent: color('Gems', P.magic, SW.accent, { when: { gems: [true] } }),
  },
  clips: {
    panel: { frames: 1, fps: 8, loop: true, label: 'Panel' },
    'panel-title': { frames: 1, fps: 8, loop: true, label: 'With heading' },
    inset: { frames: 1, fps: 8, loop: true, label: 'List well' },
    tooltip: { frames: 1, fps: 8, loop: true, label: 'Tooltip' },
  },
  versions: [
    { name: 'Temple', params: {} },
    // each version measures 0.2 or more at card size against Temple and every other version (VERSION_RULES)
    { name: 'Royal', params: { style: 'royal', face: P.soil, accent: P.crimson, border: 1, corner: 1 } },
    { name: 'Ruin', params: { style: 'ruin', gems: false, face: P.soil, frame: H.wheat } },
    { name: 'Silver', params: { face: H.bandit, frame: P.steel, accent: P.hero, border: 1 } },
    { name: 'Wine vault', params: { face: H.bandit, frame: H.thunder } },
  ],
  // Where text goes (white text), and one pixel of the gold band to check against.
  textArea(clip, p) {
    const out = piece(new Surface(...SIZE), clip, p), text = SKIN_TEXT.gilded;
    const main = { ...out.inner, text, edge: out.edge };
    return out.title ? [main, { ...out.title, text, edge: out.edge }] : main;
  },

  render(g, { clip, p }) {
    piece(g, clip, p);
  },
});
