// PORT (migration batch M9): a copy of engine/dizzy-swirl.js with its imports pointed at the port shims, so it draws paint
// refs on engine/gen/port-surface.js grids (engine/gen/ports/colour.js, surface.js). It is the drawing code of the M9
// port generators (engine/gen/ui-inputs.js, ui-hud.js, ui-bubbles.js, text.js), so it is NOT temporary: it stays when
// engine/dizzy-swirl.js goes (removal items R1 to R4 delete the engine original once its last code caller is gone) and goes
// only with the last generator version that draws with it (review M9 round 2, issue 6). A TRIMMED or HAND CHANGE note
// below says where it differs from its source; never change what a released generator version draws through it.
// Dizzy swirl (added with sprite batch K24 fix round 6, bundles/specs/core-sprites-3.md, emote-bubbles): the small
// swirl of engine/emote-small.js (a 1 px spiral of one and a half turns, its inner end open, and a separate four-point
// star at the upper right) held in one pose, the outer end pointing left. emote-small's swirl turns a quarter turn
// every quarter of the loop, and in two of its four poses the spiral reads as a character: outer end up, it is a bowl
// with a stem rising from it (the digit 6); outer end right, a G. Its rest pose (t = 0) is the 6, so a balloon that
// settles on it shows a 6 and a star. Here the spiral never turns: its outer end stays on the left, the outer arm
// wrapping the curl evenly round the bottom and up the right, and the mark wobbles instead: over the four quarters
// of the loop, at rest, the spiral 1 px up, at rest, the star 1 px down. Both moves stay inside the box the turning
// swirl filled (that pose leaves the spiral's square 2 rows clear at the top; the star is the top), so a balloon
// sized for emote-small's swirl holds this one, and the star never comes nearer the spiral than at rest. The pixels
// are drawn by hand for each spiral radius (emote-small's own sizes: 9 px across below size 12, 11 at 12 and 13,
// 13 from 14), from emote-small's quarter-turn pose with the outer end left, with the 1 px break in the 11 px one's
// inner arm closed.
//
//   import { drawDizzySwirl, dizzySwirlBody, dizzyWobble } from '../engine/dizzy-swirl.js';
//
//   drawDizzySwirl(g, cx, by, 12, { t, colour: p.accent });   // bottom row on `by`, centred on `cx`
//
// The body is a glyphGrid size + 6 square, emote-small's swirl grid, the spiral's square on its bottom row and the
// star at the same place as emote-small's, so a mark measured with emote-fit-style reach code works unchanged.

import { Surface } from './surface.js';
import { INK } from './colour.js';
import { glyphGrid } from './ui.js';

const fract = (v) => ((v % 1) + 1) % 1;

// The spiral at radius R, (2R + 1) px square, centre in the middle: from the outer end (left), down and round the
// bottom at R, up the right, over the top narrowing to R - 4 on the left, then the inner half turn under the middle.
const SPIRALS = {
  4: [
    '.........',
    '.........',
    '....####.',
    '...#...##',
    '#...#...#',
    '#.......#',
    '##.....##',
    '.##...##.',
    '..#####..',
  ],
  5: [
    '...........',
    '...........',
    '.....####..',
    '....#....#.',
    '....#.....#',
    '#...#.#...#',
    '#...###...#',
    '#.........#',
    '.#.......#.',
    '..#.....#..',
    '...#####...',
  ],
  6: [
    '.............',
    '.............',
    '.....#####...',
    '....##....#..',
    '....#......#.',
    '....#.......#',
    '#...#...#...#',
    '#...#...#...#',
    '#....###....#',
    '.#.........#.',
    '.##.......##.',
    '..##.....##..',
    '....#####....',
  ],
};

/** The wobble at loop phase t: { spiral, star }, each a row offset (down positive), one quarter of the loop each: at rest, the spiral up 1, at rest, the star down 1. Arguments: t (0..1). */
export function dizzyWobble(t) {
  const q = Math.floor(fract(t) * 4) % 4;
  return { spiral: q === 1 ? -1 : 0, star: q === 3 ? 1 : 0 };
}

/**
 * The body pixels at loop phase t: a glyphGrid size + 6 square, the spiral (outer end left) standing on its bottom row and a 1 px plus star at its upper right, each moved by dizzyWobble(t).
 * Arguments: size (nominal mark size, 10 to 16 px); options { t (0..1, one loop; default 0) }.
 */
export function dizzySwirlBody(size, { t = 0 } = {}) {
  const s = Math.max(10, Math.min(16, Math.round(size)));
  const g = glyphGrid(s + 6, s + 6);
  const W = g.w, base = g.h - 1;
  const R = Math.max(4, Math.min(6, Math.floor(s / 2) - 1));
  const D = Math.ceil((R + 2) / Math.SQRT2 + (R >= 5 ? 2 : 1));
  const wob = dizzyWobble(t);
  const cx = Math.floor(W / 2) - Math.floor((D + 1 - R) / 2), cy = base - R;   // the spiral's middle pixel at rest
  SPIRALS[R].forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') g.set(cx - R + i, cy - R + j + wob.spiral); });
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) g.set(cx + D + dx, cy - D + dy + wob.star);
  return g;
}

/**
 * Draws the dizzy swirl in a colour with a 1 px ink line, centred on cx with the body's bottom row on by: returns { box } (the drawn pixels, ink included).
 * Arguments: g (the Surface); cx, by; size (10 to 16); options { t (0..1), colour (required), ink (default INK) }.
 */
export function drawDizzySwirl(g, cx, by, size, { t = 0, colour, ink = INK } = {}) {
  if (!colour) throw new Error('drawDizzySwirl: needs a colour');
  const b = dizzySwirlBody(size, { t });
  const x0 = Math.round(cx) - Math.floor(b.w / 2), y0 = Math.round(by) - (b.h - 1);
  const s = new Surface(g.w, g.h);
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.at(x, y)) s.dot(x0 + x, y0 + y, colour);
  s.outline(ink);
  const bb = s.bounds();
  g.blit(s);
  return { box: bb ? { x: bb.x0, y: bb.y0, w: bb.x1 - bb.x0 + 1, h: bb.y1 - bb.y0 + 1 } : { x: x0, y: y0, w: 0, h: 0 } };
}
