// Rail fences for top-down maps, seen from the south in three-quarter view (docs/style-guide.md, section 1): three
// tiles that a level builder places by hand. They are not a block: a fence is a line, and it stands on whatever
// ground is under it, so everything outside the wood is see-through. Worked example: sprites/tiles-village.json.
//
//   The village tileset's clips are 'fence-h', 'fence-v' and 'fence-post'; engine/gen/ports/tiles-village.js draws each with
//   drawFence(g, clip.slice(6), { wood }). No sprite file imports this module.
//
// WHERE THE POST STANDS. Every piece has its post in the same place: the bottom right of its cell (FENCE.post).
//   'h'     two rails right across the tile, and the post in front of them: it repeats sideways
//   'v'     the rails of a fence that runs up the map, seen end on as one upright strip, and the post: it repeats
//           up and down
//   'post'  the post alone
// So a run of 'h' has a post at the right end of every cell and is closed on its left by a 'post' in the cell before
// it; a column of 'v' has a post at the foot of every cell and is closed at its top by a 'post' in the cell above.
// Where a run and a column meet, one cell holds both ('h' and 'v' share their post). A fenced yard from column c0 to
// c1 and row r0 to r1 is: 'post' at (c0, r0); 'h' along row r0 from c0 + 1 to c1; 'v' down columns c0 and c1 from
// r0 + 1 to r1; 'h' along row r1 from c0 + 1 to c1 (the cell (c1, r1) holds 'v' and 'h').
//
// Light from the top right, three tones of the one colour passed in, and an ink line round the wood (you bump into a
// fence), which is left open where a rail runs on into the next tile.

import { Surface } from './surface.js';
import { ramp, INK } from './color.js';
import { TILE } from './tiles.js';

/** The fence pieces drawFence knows: 'h' (rails and a post, repeats sideways), 'v' (repeats up and down), 'post' (the post alone). No arguments: a frozen list. */
export const FENCE_PIECES = Object.freeze(['h', 'v', 'post']);

/**
 * Where a fence's wood lies in its 32 px tile, for placing things against it: post [x0, x1, y0, y1] (first and last column and row of the post's wood), rails (the first row of each rail of an 'h' piece; a rail is `thick` px), strip [x0, x1] (the columns of a 'v' piece's rails). No arguments: a frozen object.
 */
export const FENCE = Object.freeze({ post: Object.freeze([27, 30, 9, 30]), rails: Object.freeze([14, 22]), thick: 3, strip: Object.freeze([28, 29]) });

/**
 * Draws one piece of a rail fence on a 32x32 Surface: rails in three tones of the wood with the post in front of them, each with an ink line of its own; returns the Surface.
 * Arguments: g (the Surface); piece (one of FENCE_PIECES, or a whole clip name that ends in one: 'fence-h'); options { wood (the colour, '#rrggbb'), ink (the line colour, default INK; null for no line), worn (0 to 1: from 0.5 a split shows in the top rail of 'h', from 0.8 a nick in the post too; default 0) }.
 * Rails run off the tile's edges with no line across their ends, so pieces join; the post is closed all round.
 */
export function drawFence(g, piece, { wood, ink = INK, worn = 0 } = {}) {
  const kind = FENCE_PIECES.includes(piece) ? piece : FENCE_PIECES.find((k) => String(piece).endsWith(`-${k}`));
  if (!kind) throw new Error(`drawFence: "${piece}" is not a fence piece (${FENCE_PIECES.join(', ')})`);
  const W = ramp(wood), [px0, px1, py0, py1] = FENCE.post;
  const layer = () => { const s = new Surface(TILE, TILE); s.shadow = g.shadow; return s; };

  // the rails, behind the post
  const rails = layer();
  if (kind === 'h') {
    for (const y of FENCE.rails) {
      rails.rect(0, y, TILE, 1, W.light);
      rails.rect(0, y + 1, TILE, FENCE.thick - 2, W.base);
      rails.rect(0, y + FENCE.thick - 1, TILE, 1, W.dark);
    }
    if (worn >= 0.5) { rails.rect(9, FENCE.rails[0] + 1, 5, 1, W.dark); rails.dot(14, FENCE.rails[0] + 1, W.light); }
    if (worn >= 0.65) rails.rect(15, FENCE.rails[1] + 1, 4, 1, W.dark);
  }
  if (kind === 'v') {
    const [sx0, sx1] = FENCE.strip;
    rails.rect(sx0, 0, sx1 - sx0, TILE, W.base);
    rails.rect(sx1, 0, 1, TILE, W.light);
  }
  if (ink && kind !== 'post') rails.outline(ink);
  g.blit(rails);

  // the post: a rounded top that catches the light, a lit right side and a dark left one
  const post = layer();
  const w = px1 - px0 + 1;
  post.rect(px0, py0 + 1, w, py1 - py0, W.base);
  post.rect(px0 + 1, py0, w - 2, 1, W.light);
  post.rect(px0, py0 + 1, w, 1, W.light);
  post.rect(px0, py0 + 2, 1, py1 - py0 - 1, W.dark);
  post.rect(px1, py0 + 2, 1, py1 - py0 - 1, W.light);
  post.rect(px0 + 1, py1, w - 1, 1, W.dark);                       // the foot, in its own shade
  if (worn >= 0.8) { post.rect(px0 + 1, py0 + 8, 2, 1, W.dark); post.dot(px0 + 1, py0 + 9, W.dark); }
  if (ink) post.outline(ink);
  g.blit(post);
  return g;
}
