// Shared by the fixture tilesets: the 13 pieces of a block (docs/style-guide.md section 6), drawn very simply.
// (The real helper is engine/tiles.js; fixtures keep their own so the playground tests do not depend on it.)
export const PIECES = ['left', 'top', 'right', 'side-l', 'fill', 'side-r', 'bottom-l', 'bottom', 'bottom-r', 'inner-tl', 'inner-tr', 'inner-bl', 'inner-br'];
const one = () => ({ frames: 1, fps: 1, loop: true });

/** The 13 clip entries of a block: { '<prefix>-left': {...}, ... }. */
export const blockClips = (prefix) => Object.fromEntries(PIECES.map((p) => [`${prefix}-${p}`, one()]));
export const clip = one;

/**
 * Draw one piece. c: { base, edge, dark, face } colours. face: a top-down wall, whose bottom row is its front face.
 * Each piece is marked on the sides where the block ends, so a wrong piece in a level is easy to see.
 */
export function drawPiece(g, piece, c) {
  const T = 32, E = 4;
  if (c.face && piece.startsWith('bottom')) {
    g.rect(0, 0, T, T, c.face); g.rect(0, T - 3, T, 1, c.dark); g.rect(0, T - 2, T, 2, '#231b33');
    if (piece === 'bottom-l') g.rect(0, 0, 2, T, c.dark);
    if (piece === 'bottom-r') g.rect(T - 2, 0, 2, T, c.dark);
    return;
  }
  g.rect(0, 0, T, T, c.base);
  g.dot(9, 12, c.dark); g.dot(22, 20, c.dark); g.dot(14, 26, c.dark);
  const top = ['left', 'top', 'right'].includes(piece), bottom = piece.startsWith('bottom');
  const left = ['left', 'side-l', 'bottom-l'].includes(piece), right = ['right', 'side-r', 'bottom-r'].includes(piece);
  if (top) g.rect(0, 0, T, E, c.edge);
  if (bottom) g.rect(0, T - E, T, E, c.dark);
  if (left) g.rect(0, 0, E, T, top ? c.edge : c.dark);
  if (right) g.rect(T - E, 0, E, T, top ? c.edge : c.dark);
  if (piece === 'inner-tl') g.rect(0, 0, E, E, c.edge);
  if (piece === 'inner-tr') g.rect(T - E, 0, E, E, c.edge);
  if (piece === 'inner-bl') g.rect(0, T - E, E, E, c.dark);
  if (piece === 'inner-br') g.rect(T - E, T - E, E, E, c.dark);
}
