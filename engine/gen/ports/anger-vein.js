// PORT (migration batch M9): a copy of engine/anger-vein.js with its imports pointed at the port shims, so it draws paint
// refs on engine/gen/port-surface.js grids (engine/gen/ports/colour.js, surface.js). It is the drawing code of the M9
// port generators (engine/gen/ui-inputs.js, ui-hud.js, ui-bubbles.js, text.js), so it is NOT temporary: it stays when
// engine/anger-vein.js goes (removal items R1 to R4 delete the engine original once its last code caller is gone) and goes
// only with the last generator version that draws with it (review M9 round 2, issue 6). A TRIMMED or HAND CHANGE note
// below says where it differs from its source; never change what a released generator version draws through it.
// Anger vein (added with sprite batch K24 fix round 4, bundles/specs/core-sprites-3.md, emote-bubbles): the anger
// mark for a small balloon, 10 to 13 px nominal, that keeps reading as anger on every frame. engine/emote-small.js's
// anger throbs by shortening its arms, so half its loop is four 3 px stubs (four dots at game size), and its four
// straight inward-cornered Ls look like an "exit fullscreen" icon. Here each of the four strokes is an L whose bend
// points in at a plus-shaped gap, with both arms 3 px or longer: one runs straight out along the gap, the other's
// end turns 1 px diagonally away from it (a bent vein end). The strokes are a quarter turn apart, a pinwheel, so the
// four do not make a frame's corners or four arrowheads. The gap between neighbouring strokes is always 2 px of
// background once the 1 px ink line is round them. The throb never shortens an arm: on half the loop each straight
// arm swells to 2 px thick on its outer side (away from the gap), so the gap and the arm lengths stay.
//
//   import { drawAngerVein, angerVeinBody } from '../engine/anger-vein.js';
//
//   drawAngerVein(g, cx, by, 12, { t, colour: p.accent });     // body's bottom row on `by`, centred on `cx`
//
// The body is 12 px square at sizes 10 and 11 and 14 px at 12 and 13 (16 at 14 and over): each stroke fills a
// q x q quarter (q 4, 5 or 6) and the gap is 4 px of body (ink, 2 px of background, ink).
// TRIMMED (review M9 round 1, issue 3): the declarations and imports no M9 port reaches are left out, so the copy holds
// only what draws; what is kept is word for word as before.

import { Surface } from './surface.js';
import { INK } from './colour.js';
import { glyphGrid } from './ui.js';

const fract = (v) => ((v % 1) + 1) % 1;
// a stroke's quarter size for a nominal mark size
const quarter = (size) => Math.max(4, Math.min(6, Math.floor((Math.round(size) - 2) / 2)));

// One stroke in the top-left quarter (0..q-1 each way, the bend at (q-1, q-1)): [x, y] pixels. The arm along the
// top of the gap runs q-1 px out from the bend and its end turns up, 1 px diagonally away from the gap; the arm along
// the side of the gap runs straight to the quarter's edge (q px). On the throb that straight arm swells to 2 px on
// its outer side from 2 px past the bend to its end (a club, clear of the bend: no solid wedge), so the vein bulges and its arms and the gap stay as they are.
function stroke(q, thick) {
  const b = q - 1, out = [];
  for (let i = 0; i < q - 1; i++) out.push([b - i, b]);
  out.push([0, b - 1]);
  for (let i = 1; i < q; i++) out.push([b, b - i]);
  if (thick) for (let i = 2; i < q; i++) out.push([b - 1, b - i]);
  return out;
}

/**
 * The body pixels of the anger vein at loop phase t: a glyphGrid as wide and tall as the mark (12, 14 or 16 px) plus 2, the four strokes on its bottom row less 1, centred.
 * Arguments: size (nominal mark size, 10 to 16 px); options { t (0..1, one loop; on its second half the strokes swell) }.
 */
export function angerVeinBody(size, { t = 0 } = {}) {
  const q = quarter(size), B = 2 * q + 4, g = glyphGrid(B + 2, B + 2);
  const thick = fract(t) >= 0.5;
  for (const [x, y] of stroke(q, thick)) {
    // the four strokes a quarter turn apart (a pinwheel: each turned end leads into the next stroke's quarter)
    for (const [u, v] of [[x, y], [B - 1 - y, x], [B - 1 - x, B - 1 - y], [y, B - 1 - x]]) g.set(1 + u, 1 + v);
  }
  return g;
}

/**
 * Draws the anger vein in a colour with a 1 px ink line, centred on cx with the body's bottom row on by: returns { box } (the drawn pixels, ink included).
 * Arguments: g (the Surface); cx, by; size (10 to 16); options { t (0..1), colour (required), ink (default INK) }.
 */