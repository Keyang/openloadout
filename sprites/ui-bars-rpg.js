// Health and magic bars (kit-rpg-fantasy, batch R20), built on engine/ui.js.
// A game draws `frame` (the empty housing), then a fill strip over it, cropped from
// the right to the value: `fill` is health, `fill-b` magic, `fill-c` a turn or limit
// gauge. Every strip fits the housing's opening exactly. `flash` is the health strip
// turning white and settling back (4 frames at a fixed 8 a second); play it when the value changes.
//
// What the export says (`slice` below, Contract 8), the same on the housing and on every strip:
//   opening  the trough, which moves with the border and the style (x 4 to 11, 44 to 56 px wide)
//   border   solid and ornate: 16 px at each end; between them the bar repeats, so a game can make
//            it any length (housing and strip stretched alike). A bar does not stretch in height.
//   tile     segmented: no border, because stretching would smear the compartments. Columns
//            tile.x .. tile.x + tile.w - 1 are one compartment with its dividing line; insert whole
//            copies of them into the housing and the strips to lengthen the bar.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { ramp, INK } from '../engine/color.js';
import { PALETTE } from '../engine/palettes.js';
import { barHousing, barOpening, barFill, borderPx, panelSwatches } from '../engine/ui.js';

const P = PALETTE.hearthvale;
// Face and frame swatches come from the helper: it keeps only colours on which white text holds 4.5 to 1 and
// against which the frame holds 3 to 1 under every whole-bundle look (the defaults, panel and cream, stay as they are).
const SW = panelSwatches('hearthvale', { face: 'panel', frame: 'cream', faces: ['slate', 'bandit', 'mage', 'rogue'], frames: ['skin', 'steel', 'thunder', 'sky'] });
const SIZE = [64, 16];
const CAPS = 5;                                     // ornate: solid frame at each end, with a rivet
// Segmented: five compartments. The opening must hold them exactly, so each border width gets the
// end caps that make (opening + 1) a multiple of five: [caps, compartments].
const SEGMENTED = { 1: [1, 5], 2: [0, 5], 3: [4, 5] };

function housing(p) {
  const seg = p.style === 'segmented' ? SEGMENTED[borderPx(p.border)] : null;
  return { frame: p.frame, border: p.border, corner: p.corner, caps: p.style === 'ornate' ? CAPS : seg ? seg[0] : 0, segments: seg ? seg[1] : 0 };
}

function slice(clip, p) {
  const h = housing(p), opening = barOpening(1, 1, SIZE[0] - 2, SIZE[1] - 2, h);
  if (!h.segments) return { left: 16, top: 8, right: 16, bottom: 8, opening };
  const pitch = (opening.w + 1) / h.segments;
  return { tile: { x: opening.x + pitch, w: pitch }, opening };   // the second compartment: the first carries the glint
}

export default defineSprite({
  id: 'ui-bars-rpg',
  name: 'Health and magic bars',
  kind: 'Item',
  blurb: 'A bar housing with three fill strips (health, magic, a turn gauge) and a white flash; change its style, corners, border and colours.',
  meta: {
    type: 'ui', role: 'interface/bar', themes: ['fantasy', 'neutral'], gameTypes: ['turn-based-rpg', 'top-down-rpg', 'arcade'], view: 'none',
    words: ['bar', 'health', 'life', 'magic', 'mana', 'gauge', 'meter', 'hud', 'status', 'fill', 'drain', 'flash'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [32, 8],
  grounded: false,
  preview: 'frame',
  slice,
  params: {
    style: choice('Style', 'solid', ['solid', 'segmented', 'ornate']),
    corner: range('Corner', 0.5, { lo: 'Square', hi: 'Round' }),
    border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
    shine: toggle('Shine', true),
    frame: color('Frame', P.cream, SW.frame),
    fill: color('Health', P.heal, [P.heal, P.meadow, P.crimson, P.roof, P.thunder, P.magic]),
    fillB: color('Magic', P.hero, [P.hero, P.mage, P.water, P.rogue, P.magic, P.ice]),
    fillC: color('Gauge', P.gold, [P.gold, P.fire, P.thunder, P.wheat, P.cream, P.steel]),
  },
  clips: {
    frame: { frames: 1, fps: 8, loop: true, label: 'Housing' },
    fill: { frames: 1, fps: 8, loop: true, label: 'Health' },
    'fill-b': { frames: 1, fps: 8, loop: true, label: 'Magic' },
    'fill-c': { frames: 1, fps: 8, loop: true, label: 'Gauge' },
    flash: { frames: 4, fps: 8, loop: false },
  },

  render(g, { clip, t, p }) {
    const h = housing(p);
    if (clip === 'frame') {
      const o = barHousing(g, 1, 1, SIZE[0] - 2, SIZE[1] - 2, h);
      if (p.style === 'ornate') {
        // ornate ends: a rivet in each cap
        const r = ramp(p.frame), b = borderPx(p.border), cy = o.y + (o.h >> 1) - 1;
        for (const cx of [1 + 1 + b + 1, o.x + o.w + 2]) {
          g.rect(cx, cy, 2, 2, r.dark);
          g.dot(cx, cy + 1, INK);
        }
      }
      return;
    }
    const o = barOpening(1, 1, SIZE[0] - 2, SIZE[1] - 2, h);
    const fill = clip === 'fill-b' ? p.fillB : clip === 'fill-c' ? p.fillC : p.fill;
    barFill(g, o, 1, { fill, shine: p.shine, segments: h.segments, flash: clip === 'flash' ? 1 - t : 0 });
  },
});
