// Tech bars (kit-roguelite-scifi, batch S20): a boss's health, the player's shield and the
// experience bar. Built on the tech pieces of engine/ui.js: cut corners, a lit edge, compartments.
// A game draws `frame` (the empty housing), then a fill strip over it, cropped from the right to
// the value: `fill` is health, `fill-b` shield, `fill-c` experience. Every strip fits the housing's
// opening exactly. `flash` is the health strip turning white and settling back (4 frames at a fixed
// 8 a second); play it when the value changes.
//
// What the export says (`slice` below, Contract 8), the same on the housing and on every strip:
//   opening  the trough: solid 56 to 52 px wide (it follows the border); segmented and slanted always
//            x 8, 48 px wide, so the seven compartments are whole at every border.
//   border   solid without tick marks: 16 px at each end; between them the bar repeats, so a game
//            can make it any length. A bar does not stretch in height.
//   tile     segmented, slanted, and solid with tick marks: no border, because stretching would
//            smear the pattern. Columns tile.x .. tile.x + tile.w - 1 are one repeat (a compartment
//            with its line and ticks: 7 px; or one tick spacing: 8 px); insert whole copies of them
//            into the housing and the strips to lengthen the bar.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { techBarHousing, techBarFill, barOpening, borderPx, cutPx } from '../engine/ui.js';

const P = PALETTE.derelict;
const SIZE = [64, 16];
const COMPARTMENTS = 7;
// Solid frame at each end, per border width, that leaves an opening of 48 px: seven compartments of 6 px and six lines.
const CAPS = { 1: 4, 2: 3, 3: 2 };
const TICK = 8;                                     // solid: pixels from one tick mark to the next

function housing(p) {
  const b = borderPx(p.border), k = cutPx(p.corner), split = p.style !== 'solid';
  return {
    frame: p.frame, border: p.border,
    caps: split ? CAPS[b] : 0,
    segments: split ? COMPARTMENTS : 0,
    slant: p.style === 'slanted' ? 0.5 : 0,
    // slanted: the two corners the lean points at are cut deep, the other two stay square
    cutPx: p.style === 'slanted' ? [k + 2, 0, k + 2, 0] : k,
    ticks: p.ticks ? (split ? COMPARTMENTS : TICK) : 0,
  };
}

function slice(clip, p) {
  const h = housing(p), opening = barOpening(1, 1, SIZE[0] - 2, SIZE[1] - 2, h);
  if (h.segments) { const pitch = (opening.w + 1) / h.segments; return { tile: { x: opening.x + pitch, w: pitch }, opening }; }
  if (h.ticks) return { tile: { x: opening.x + 2 * TICK, w: TICK }, opening };
  return { left: 16, top: 8, right: 16, bottom: 8, opening };
}

export default defineSprite({
  id: 'ui-bars-tech',
  name: 'Tech bars',
  kind: 'Item',
  blurb: 'An angular bar housing with three fill strips (health, shield, experience) and a white flash; change its style, cut corners, border, tick marks and colours.',
  meta: {
    type: 'ui', role: 'interface/bar', themes: ['sci-fi', 'neutral'], gameTypes: ['roguelike-action', 'shooter', 'arcade'], view: 'none',
    words: ['bar', 'health', 'shield', 'experience', 'xp', 'energy', 'gauge', 'meter', 'hud', 'boss', 'fill', 'drain', 'flash', 'segmented'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [32, 8],
  grounded: false,
  preview: 'frame',
  slice,
  params: {
    style: choice('Style', 'solid', ['solid', 'segmented', 'slanted']),
    corner: range('Corner', 0.5, { lo: 'Square', hi: 'Cut' }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    ticks: toggle('Tick marks', false),
    frame: color('Frame', P.hull, swatches('derelict', 'frame', { lead: 'hull' })),
    fill: color('Health', P.heal, [P.heal, P.acid, P.red, P.amber, P.teal, P.cream]),
    fillB: color('Shield', P.shield, [P.shield, P.cyan, P.signal, P.teal, P.steel, P.xp]),
    fillC: color('Experience', P.xp, [P.xp, P.gold, P.cyan, P.flesh, P.amber, P.suit]),
  },
  clips: {
    frame: { frames: 1, fps: 8, loop: true, label: 'Housing' },
    fill: { frames: 1, fps: 8, loop: true, label: 'Health' },
    'fill-b': { frames: 1, fps: 8, loop: true, label: 'Shield' },
    'fill-c': { frames: 1, fps: 8, loop: true, label: 'Experience' },
    flash: { frames: 4, fps: 8, loop: false },
  },

  render(g, { clip, t, p }) {
    const h = housing(p);
    if (clip === 'frame') { techBarHousing(g, 1, 1, SIZE[0] - 2, SIZE[1] - 2, h); return; }
    const o = barOpening(1, 1, SIZE[0] - 2, SIZE[1] - 2, h);
    const fill = clip === 'fill-b' ? p.fillB : clip === 'fill-c' ? p.fillC : p.fill;
    techBarFill(g, o, 1, { fill, segments: h.segments, slant: h.slant, flash: clip === 'flash' ? 1 - t : 0 });
  },
});
