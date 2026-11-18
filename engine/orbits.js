// Things that go round other things (added with batch R10, fix round 1: the Hearthvale save crystal): a halo, a
// ring of light rising round a crystal, an orbiting rune, a planet's ring, the hoop of a warp pad or a heal spell.
// What they share is depth: the half of the ring that is further from the camera passes BEHIND the thing it goes
// round, and the half that is nearer passes IN FRONT of it. The flat rings of fx.js (ring) and shapes.js (hoopIn,
// ringIn) know nothing of that; `around` gives it to any of them. Pure functions: Node and browser.
// Worked example: sprites/save-crystal.js.
//
//   import { around, orbitHoop } from '../engine/orbits.js';
//   const body = new Surface(32, 48);                      // the thing in the middle, on its own layer, inked
//   drawCrystal(body, 16, cy, rx, ry, p.body); body.outline(INK);
//   around(g, body, [
//     { y: cy + 4, draw: (layer) => ring(layer, { t, x: 16, y: cy + 4, r0: 12, r1: 12, squash: 0.3, colours }) },   // any flat effect, split at its row
//     orbitHoop({ cx: 16, cy, rx: 11, ry: 2.6, back: dim, front: bright, bead: { turn: t, colour: bright } }),      // a hoop that draws its own halves
//   ]);
//
// A ring is { y, draw(layer, half) }. `draw` is called twice, with half 'far' and then 'near', each time on an empty
// layer the size of the frame. With `y` (a row), whatever it paints above that row is kept from the far pass and
// whatever it paints on that row and below from the near pass, so a ring drawn the same both times is cut in two
// at the row where it crosses the body. Without `y`, `draw` paints each half itself (orbitHoop does: its near
// half is brighter, and its bead is bigger in front).
// List the rings from the innermost outwards: behind the body an outer ring lies under an inner one, in front of
// it an outer ring lies over an inner one.
//
// Styles: the halves are cut on pixel layers, so this suits the pixel style; a style that keeps shapes would
// sort the two halves as two shapes instead.

import { Surface, cropped } from './surface.js';
import { hoopIn } from './shapes.js';
import { twinkle } from './fx.js';
import { TAU } from './motion.js';

/**
 * Draws a body with rings round it in the right depth: the far half of every ring first, then the body over them, then the near halves over the body. Returns g.
 * Arguments: g (the Surface to draw on); body (a Surface with the thing in the middle, pasted between the halves); rings (a list, innermost first, of { y (the row where the ring crosses the body: what `draw` paints above it is the far half, the rest the near half; left out: `draw` paints each half itself), draw(layer, half) (paints the ring on an empty layer the size of g; half is 'far' or 'near') }); options { dx, dy (where the body is pasted, default 0 and 0) }.
 */
export function around(g, body, rings = [], { dx = 0, dy = 0 } = {}) {
  const half = (r, which) => {
    const layer = new Surface(g.w, g.h);
    r.draw(layer, which);
    if (typeof r.y !== 'number') return layer;
    return which === 'far' ? cropped(layer, 0, 0, g.w, r.y) : cropped(layer, 0, r.y, g.w, g.h);
  };
  for (let i = rings.length - 1; i >= 0; i--) g.blit(half(rings[i], 'far'));
  g.blit(body, dx, dy);
  for (const r of rings) g.blit(half(r, 'near'));
  return g;
}

/**
 * A thin hoop seen at an angle, as a ring for around(): its far half (above its middle) in one colour, its near half in a brighter one, and an optional bead of light that runs round it, one pixel at the back and a small cross in front.
 * Arguments: o: { cx, cy (the hoop's middle; the row cy and below is the near half), rx, ry (its outer radii across and down), thick (width of the band, default 1), back (the far half's colour), front (the near half's colour, default the same), bead (left out or null: none; else { turn (0 to 1, once round: 0 at the right, 0.25 nearest the camera, 0.75 at the back), colour, core (the heart of the cross in front, default white) }) }. Returns { draw(layer, half) }.
 */
export function orbitHoop({ cx, cy, rx, ry, thick = 1, back, front = back, bead = null }) {
  const hoop = hoopIn(cx, cy, rx, ry, thick);
  const angle = bead ? TAU * bead.turn : 0, near = Math.sin(angle) >= 0;
  // the bead rides the middle of the band
  const bx = cx + Math.cos(angle) * (rx - thick / 2), by = cy + Math.sin(angle) * (ry - thick / 2);
  return {
    draw(layer, half) {
      const far = half === 'far';
      layer.fill(1, 1, layer.w - 2, layer.h - 2, (px, py) => (far ? py < cy : py >= cy) && hoop(px, py), far ? back : front);
      if (bead && near !== far) twinkle(layer, bx, by, far ? 0 : 1, bead.colour, bead.core ? { core: bead.core } : {});
      return layer;
    },
  };
}
