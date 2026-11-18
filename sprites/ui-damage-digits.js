// Damage numbers (kit-rpg-fantasy, batch R20): ten digits, plus, minus, a critical-hit
// burst and a "miss" mark, for a game to string into pop-up numbers and tint
// (red for damage, green for healing).
//
// Sizes and digit shapes come from the interface helper (digitSize, digitBody), and every
// glyph is drawn by its rimmed(): strokes on a small grid make the BODY; a 1 px RIM of the
// edge colour goes all round it (darker below and to the left, away from the light); then
// the INK outline; holes are ink; then, if asked, a 1 px drop shadow down and to the left.
// All glyphs are centred on one box, so a game places digits at a fixed pitch: the digit's
// inked width minus 1 px (9 px at the usual size), so neighbouring ink lines overlap.
// `miss` is a dodge mark, not the word: a rising swoosh with two motion lines under it.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { digitSize, digitBody, glyphGrid, rimmed } from '../engine/ui.js';

const P = PALETTE.hearthvale;

/** A starburst on a 9x9 grid: four long rays and four short ones round a middle. `fat` thickens the middle. */
function burst(fat, round) {
  const b = glyphGrid(9, 9);
  for (let i = 0; i < 9; i++) { b.set(i, 4); b.set(4, i); }                 // the long rays
  for (const d of [1, 2]) for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) b.set(4 + sx * d, 4 + sy * d);   // the short ones
  if (fat) {
    b.box(3, 2, 5, 6); b.box(2, 3, 6, 5);                                    // a solid middle
    if (!round) for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) b.set(4 + sx * 3, 4 + sy * 3);
  }
  return b;
}

/**
 * The miss mark on a 9x8 grid: a swoosh rising to the right (where the blow went past) over two
 * motion lines. Three separate strokes inside one rim. sw: the swoosh's thickness.
 */
function dodge(sw) {
  const b = glyphGrid(9, 8);
  const rise = [3, 3, 2, 2, 1, 1, 1, 0, 0];                                  // the swoosh's top row at each column
  for (let x = 0; x < 9; x++) for (let j = 0; j < sw; j++) if (rise[x] + j <= 3) b.set(x, rise[x] + j);
  b.box(3, 5, 8, 5);                                                         // motion lines, staggered
  b.box(1, 7, 5, 7);
  return b;
}

function glyph(clip, d) {
  const m = /^digit-(\d)$/.exec(clip);
  if (m) return digitBody(Number(m[1]), d);
  if (clip === 'crit') return burst(d.stroke > 1, d.round);
  if (clip === 'miss') return dodge(d.stroke);
  // plus and minus: one size per style, so the arms always sit exactly in the middle (6 px with 2 px arms, or 5 with 1)
  const side = d.stroke + 4, b = glyphGrid(side, side), a0 = (side - d.stroke) / 2;
  b.box(0, a0, side - 1, a0 + d.stroke - 1);
  if (clip === 'plus') b.box(a0, 0, a0 + d.stroke - 1, side - 1);
  return b;
}

export default defineSprite({
  id: 'ui-damage-digits',
  name: 'Damage numbers',
  kind: 'Item',
  blurb: 'Thick outlined digits, plus, minus, a critical-hit burst and a miss mark for pop-up numbers; change their style, lean, size and colours.',
  meta: {
    type: 'ui', role: 'interface/icon', themes: ['fantasy', 'neutral'], gameTypes: ['turn-based-rpg', 'roguelike-action', 'arcade'], view: 'none',
    words: ['digits', 'numbers', 'damage', 'score', 'font', 'counter', 'critical', 'miss', 'dodge', 'heal', 'hit', 'popup'],
    license: 'draft',
  },
  size: [16, 16],
  pivot: [8, 8],
  grounded: false,
  preview: 'digit-7',
  params: {
    style: choice('Style', 'chunky', ['chunky', 'slim', 'rounded']),
    slant: toggle('Slant', false),
    shadow: toggle('Shadow', true),
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    body: color('Body', P.cream, swatches('hearthvale', 'core', { lead: 'cream' })),
    edge: color('Edge', P.fire, swatches('hearthvale', 'edge', { lead: 'fire' })),
  },
  clips: {
    ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`digit-${i}`, { frames: 1, fps: 1, loop: true, label: String(i) }])),
    plus: { frames: 1, fps: 1, loop: true },
    minus: { frames: 1, fps: 1, loop: true },
    crit: { frames: 1, fps: 1, loop: true, label: 'Critical' },
    miss: { frames: 1, fps: 1, loop: true },
  },

  render(g, { clip, p }) {
    const d = digitSize(p.size, p.style), b = glyph(clip, d);
    // leaning: the rows above the middle move 1 px right (digits, plus and minus; the burst and the dodge mark stay)
    const lean = p.slant && clip !== 'crit' && clip !== 'miss';
    const shadow = p.shadow ? 1 : 0, extra = p.slant ? 1 : 0, leanW = lean ? 1 : 0;
    // one box for the ten digits, centred in the 14x14 inside the frame's border; other marks are centred on it
    const inkW = d.w + 4 + extra + shadow, inkH = d.h + 4 + shadow;
    const boxLeft = 1 + Math.floor((14 - inkW) / 2) + shadow + 2, boxTop = 1 + Math.floor((14 - inkH) / 2) + 2;
    let left = boxLeft + Math.floor((d.w + extra - b.w - leanW) / 2), top = boxTop + Math.floor((d.h - b.h) / 2);
    // body, 1 px rim, 1 px ink and the shadow must all stay inside the frame's 1 px border
    left = Math.max(3 + shadow, Math.min(left, 13 - b.w - leanW));
    top = Math.max(3, Math.min(top, 13 - b.h - shadow));
    rimmed(g, b, left, top, { colour: p.body, edge: p.edge, shadow: p.shadow, lean });
  },
});
