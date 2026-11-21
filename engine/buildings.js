// Building pieces: houses, shops and inns seen from the south in three-quarter view
// (docs/style-guide.md section 1: you see the south wall, and the south slope of the roof above it).
// A building sprite stacks these from the ground up and outlines the whole once:
//
//   import { pitchedRoof, timberWall, plankDoor, paneWindow, chimneyStack, chimneySmoke } from '../engine/buildings.js';
//   timberWall(g, { x: 16, y: 54, w: 64, h: 38, wall: p.wall, wood: p.wood, eave: 57, rails: [80] });
//   paneWindow(g, { x: 22, y: 64, w: 13, h: 13, wood: p.wood, glass: P.slate, lit, glow: p.glow });
//   plankDoor(g, { x: 39, y: 60, w: 18, h: 30, wood: p.wood, open, inside: dark, floor: P.path, knob: P.gold });
//   const roof = pitchedRoof(g, { x: 13, y: 27, w: 70, h: 30, kind: p.roof, colour: p.roofColour });   // over the wall's top rows
//   const top = chimneyStack(g, { x: 62, y: 21, w: 8, h: 16, stone: P.cobble });
//   g.outline(INK);
//   chimneySmoke(g, { t, ...top, colour: P.cobble });                                                  // light and smoke go after the outline
//
// What every house repeats is here too: houseColours(palette) (glass, doorway, floor, and plaster and beam swatches),
// doorSwing(t) (how far open the door is through an `open` clip), doorStep (the slab under the door) and
// litWindow (a paneWindow that glows and flickers at night). sprites/cottage.json and sprites/inn.json are the worked examples.
//
// Rules every piece follows:
//   - Light from the top right (the engine default): a piece is lit along its top and right, dark along its left and bottom.
//   - Three tones per material, all derived from the one colour passed in (ramp). No colour is typed here.
//   - A piece drawn OVER what is already there (a roof over a wall, a chimney on a roof, a sign on a wall) inks its own
//     rim only where it covers drawn pixels (inkOver). The silhouette is left to the sprite's single g.outline(INK),
//     so the outline is never doubled. So draw from the back to the front: wall, windows, door, roof, chimney, sign.
//   - Colours are '#rrggbb'. Coordinates are whole pixels; a box is its top-left corner (x, y), w wide and h tall.

import { INK } from './color.js';







/**
 * Draws the joints between the stones of an arch ring: straight lines square to the curve, an odd number of stones so that one sits on the crown, and if wanted a lit keystone there; returns how many stones the ring has.
 * Arguments: g: the Surface, with the ring already painted; cx, spring: the middle of the arch's springing line (the column, and the row the curve starts from); rx, ry: half the width of the opening and how high it rises over the springing line;
 * { depth, every, colour, keystone, keyWide, clip }: depth: how far the joints run out from the opening, in px (default 5); every: about how many px each stone takes along the curve (default 5; there are never fewer than five stones); colour: the joints' colour;
 * keystone: the colour of a keystone on the crown, `depth` rows tall, with a joint down each side from its second row (left out: none); keyWide: its width in px (default 4); clip: a shape test the joints stay inside (the ring's own shape, for example archIn grown by the frame's thickness).
 * Joints are drawn above the springing line only: the jambs below it take level joints, which the sprite draws.
 */
export function archStones(g, cx, spring, rx, ry, { depth = 5, every = 5, colour = INK, keystone = null, keyWide = 4, clip = null } = {}) {
  // 1.5625 is near PI / 2 (the curve is about that many times rx + ry long) and exact in binary, so a count never falls on a rounding edge
  const n = Math.max(5, Math.round(((rx + ry) * 1.5625) / every) | 1);
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / n;
    for (let r = 0; r <= depth; r += 0.5) {
      const x = Math.floor(cx + (rx + r) * Math.sin(a)), y = Math.floor(spring - (ry + r) * Math.cos(a));
      if (y < spring && (!clip || clip(x + 0.5, y + 0.5))) g.dot(x, y, colour);
    }
  }
  if (keystone) {
    const top = Math.round(spring - ry - depth), x = Math.round(cx - keyWide / 2);
    g.rect(x, top, keyWide, depth, keystone);
    g.rect(x - 1, top + 1, 1, depth - 1, colour);
    g.rect(x + keyWide, top + 1, 1, depth - 1, colour);
  }
  return n;
}
