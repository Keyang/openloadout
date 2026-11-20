// PORT (migration batch E2): a copy of engine/marks.js with its imports pointed at the port shims (engine/gen/ports/colour.js,
// engine/gen/ports/e2/surface.js), so it draws paint refs on engine/gen/port-surface.js grids. It is the drawing code of migration batch E2's
// effect behaviours (engine/gen/fx-e2.js), so it is NOT temporary: it stays when engine/marks.js goes and goes only with the last
// generator version that draws with it. A HAND CHANGE note below says where it differs from its source; never change what
// a released generator version draws through it.
// Picture marks: small one-colour pictures for a stamp on a crate, a sign on a board, an
// emblem on a flag or a shield (docs/style-guide.md sections 8 and 9: no words, only pictures).
// Each mark is a rule over a grid of whole pixels, written for 5, 7 and 9 px across and still
// right at any larger odd size, so it stays a deliberate cluster of pixels and never a blur.
// For big smooth shapes (a 20 px star or heart) use the shape tests of engine/shapes.js instead.
//
//   import { MARKS, markIn, drawMark } from '../engine/marks.js';
//   drawMark(g, 'skull', 16, 12, 7, tone(p.wood, -1.5));          // a 7 px skull whose centre pixel is (16, 12)
//   g.fill(0, 0, 32, 32, markIn('arrow', 16, 12, 9, { flip: true }), ramp(P.cream));   // the test alone: an arrow pointing left
//   flag(g, { ..., marks: [{ inside: markIn('star', 18, 10, 7), paint: p.emblemColour }] });   // as a print on cloth
//
// A mark has no outline of its own: draw it on a body before g.outline(INK), in a colour that
// differs from the body by value (pick() from engine/color.js helps).

const abs = Math.abs;

// Each entry: (n) -> (i, j) -> is this pixel part of the mark? i and j count pixels right and
// down from the centre pixel; n is how far the mark reaches from the centre (7 px across: n = 3).
const RULES = {
  // five points, the top one on the centre column: a spike, a bar, a body that narrows, two legs
  star(n) {
    if (n <= 2) return (i, j) => (i === 0 && j <= 0) || j === 0 || (j === 1 && abs(i) <= 1) || (j === 2 && abs(i) === 1);
    const bar = -Math.floor(n / 3);
    return (i, j) => {
      const a = abs(i);
      if (j < bar) return a <= Math.round(((j + n) * 1.2) / (bar + n));
      if (j === bar) return true;
      if (j === n) return a >= Math.max(2, n - 2) && a <= n - 1;
      if (j === n - 1) return a >= 1 && a <= n - 1;
      return a <= Math.max(n - (j - bar), n - 2);
    };
  },
  // a round head with two square eyes, a nose and a row of teeth
  skull(n) {
    if (n <= 2) return (i, j) => (j === -2 ? abs(i) <= 1 : j === 0 ? abs(i) !== 1 : j === 2 ? abs(i) === 1 : true);
    const cut = Math.round(n / 2.5), teeth = 2 * Math.floor((n - 1) / 2);
    const eyeOut = n >= 5 ? n - 2 : 2, eyeTop = n >= 5 ? -2 : -1;
    return (i, j) => {
      const a = abs(i);
      if (j >= 3) return a <= teeth && a % 2 === 0;                       // the teeth
      if (j === 2) return a <= n - 1;                                      // the jaw
      if (a > Math.min(n, n - cut + (j + n))) return false;                // the round top of the head
      if (a >= 1 && a <= eyeOut && j >= eyeTop && j <= 0) return false;    // the eyes
      return !(a === 0 && j === 1);                                        // the nose
    };
  },
  // a pointed leaf leaning up to the right, with a stalk and (from 7 px) a vein
  leaf(n) {
    const wide = n <= 2 ? n * 0.38 : n * 0.5;
    return (i, j) => {
      const along = (i - j) / 2, across = i + j;                           // along the leaf, and off its middle line
      if (across === 0 && i <= -n + 1) return true;                        // the stalk, bottom left
      if (abs(across) / 2 > wide * (1 - (along / n) ** 2) + 0.2) return false;
      return !(n >= 3 && across === 0 && along > -n + 1.5 && along < n - 0.9);   // the vein
    };
  },
  // a disc with eight short rays
  sun(n) {
    if (n <= 2) return (i, j) => abs(i) + abs(j) <= 1 || (abs(i) === 2 && abs(j) === 2) || (abs(i) + abs(j) === 2 && i * j === 0);
    const R = n - 2;
    return (i, j) => {
      const a = abs(i), b = abs(j);
      if (i * i + j * j <= R * R + R) return true;                         // the disc
      if (a * b === 0) return a + b === n;                                 // up, down, left, right
      return a === b && a === n - 1;                                       // the four diagonals
    };
  },
  // an arrow pointing right (flip it for left, turn it for down or up)
  arrow(n) {
    const shaft = n >= 4 ? 1 : 0;
    return (i, j) => (i >= 1 ? abs(j) <= n - i : abs(j) <= shaft);
  },
  // an exclamation mark
  exclaim(n) {
    if (n <= 2) return (i, j) => i === 0 && j !== 1;
    return (i, j) => {
      const a = abs(i);
      if (j >= n - 1) return a <= 1;                                       // the dot
      if (j === n - 2) return false;
      return a <= (j === n - 3 ? 0 : 1);                                   // the bar, ending in a point
    };
  },
  // a diamond standing on its point
  diamond(n) { return (i, j) => abs(i) + abs(j) <= n; },
};

/** The names of the picture marks markIn and drawMark know: star, skull, leaf, sun, arrow, exclaim, diamond. No arguments: a frozen list. */
export const MARKS = Object.freeze(Object.keys(RULES));

/**
 * Shape test for a small picture mark (a name from MARKS) whose centre pixel is (x, y) and which is `size` pixels across: returns inside(px, py) for g.fill, g.blob or a flag's marks.
 * Arguments: name (one of MARKS); x, y (whole numbers: the centre pixel); size (odd, 5 or more; an even size is taken one smaller); options { flip (true mirrors it left to right), turn (quarter turns clockwise: 1 makes the arrow point down, 3 up) }.
 */
export function markIn(name, x, y, size, { flip = false, turn = 0 } = {}) {
  if (!Object.hasOwn(RULES, name)) throw new Error(`marks: no mark "${name}". Marks: ${MARKS.join(', ')}`);
  const n = Math.max(1, Math.floor((Math.round(size) - 1) / 2));
  const rule = RULES[name](n);
  const q = ((Math.round(turn) % 4) + 4) % 4;
  x = Math.floor(x); y = Math.floor(y);
  return (px, py) => {
    let i = Math.floor(px) - x, j = Math.floor(py) - y;
    for (let k = 0; k < q; k++) [i, j] = [j, -i];              // undo the quarter turns
    if (flip) i = -i;
    if (abs(i) > n || abs(j) > n) return false;
    return !!rule(i, j);
  };
}

/**
 * Draws a small picture mark (a name from MARKS) with its centre pixel at (x, y), `size` pixels across, in one colour or a ramp; it has no outline of its own.
 * Arguments: g (the Surface); name; x, y (the centre pixel); size (odd, 5 or more); paint (a colour or a ramp); options { flip, turn (as markIn), clip, shade, light (as Surface.fill) }.
 */
export function drawMark(g, name, x, y, size, paint, { flip, turn, ...opt } = {}) {
  const n = Math.max(1, Math.floor((Math.round(size) - 1) / 2));
  x = Math.floor(x); y = Math.floor(y);
  return g.fill(x - n, y - n, x + n + 1, y + n + 1, markIn(name, x, y, size, { flip, turn }), paint, { shade: 0, ...opt });
}

// ---- added with batch S14 (station props): cross, bolt ----
// The two rules below join the table after MARKS was made, so MARKS keeps listing the first seven and
// LABEL_MARKS lists these; markIn and drawMark know all of them by name.

// a plus with thick arms: first aid, repair, supplies
RULES.cross = (n) => { const arm = n >= 3 ? 1 : 0; return (i, j) => abs(i) <= arm || abs(j) <= arm; };
// a lightning bolt: a stroke down to the left, a bar, and a second stroke down to the left from the bar's right end
RULES.bolt = (n) => (i, j) => (j === 0 ? abs(i) <= n - 1 : j < 0 ? i === -j - 2 || i === -j - 1 : i === n - 1 - j || i === n - j);

/** The names of the label marks added for station props, which markIn and drawMark also know: cross (a plus with thick arms) and bolt (a lightning bolt). No arguments: a frozen list. */
export const LABEL_MARKS = Object.freeze(['cross', 'bolt']);

// ---- added with batch S20 (roguelite HUD): question ----
// Joins the table after MARKS and LABEL_MARKS were made, so those two lists are unchanged and
// SIGN_MARKS lists it; markIn and drawMark know it by name like every other mark.

// a question mark, the partner of `exclaim`: a hook open to the lower left, a stem that slants in under it, a gap, a dot
// (one pixel thick up to 9 px across, three from 11 px; at 7 px it is the classic 5x7 sign)
RULES.question = (n) => {
  if (n <= 2) return (i, j) => (j === -2 ? i === -1 || i === 0 : j === -1 ? i === 1 : j === 0 || j === 2 ? i === 0 : false);
  const bold = n >= 5 ? 1 : 0, w = n - 1 - bold, tip = Math.max(1, Math.round(n / 3)) + bold;
  const line = (i, j) => {
    if (j === -n) return abs(i) <= w - 1;                                  // the top of the hook
    if (j < 0) return i === w || (i === -w && j <= -n + tip);              // its right side, and the short end on the left
    return j <= w - 1 && i === w - 1 - j;                                  // the stem, slanting in to the middle
  };
  if (!bold) return (i, j) => (j === n ? i === 0 : line(i, j));
  return (i, j) => (j >= n - 1 ? abs(i) <= 1 : line(i - 1, j) || line(i, j) || line(i + 1, j) || (j === -n + 1 && abs(i) <= w));
};

/** The names of the sign marks added for map and HUD glyphs, which markIn and drawMark also know: question (a question mark: something unknown, a mystery room, a hint). No arguments: a frozen list. */
export const SIGN_MARKS = Object.freeze(['question']);
