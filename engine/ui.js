// Interface helper: nine-slice panels, button states, bars, highlight rows, arrow heads and
// digits (docs/style-guide.md sections 8 and 14). Pure drawing on a Surface: runs in Node
// and in the browser. Every piece draws its own INK outline, so a piece made only
// of these does not call g.outline(). An interface piece is data (sprites/ui-dialogue.json, ui-buttons-wood.json); no sprite
// file imports this module. The interface generators (engine/gen/ui*.js) draw with the port copy of it, engine/gen/ports/ui.js;
// engine/gen/counter.js and engine/pixel-font.js import the few helpers they need from here. The calls, with the colours a
// piece's controls give (face, frame, border, corner, shine, fill, accent):
//
//   // a 96x48 dialogue box: pass the frame minus its 1 px empty border
//   const box = panel9(g, 1, 1, 94, 46, { face: p.face, frame: p.frame, border: p.border, corner: p.corner });
//   triangle(g, box.inner.x + box.inner.w - 6, box.inner.y + box.inner.h - 4, 7, 'down', p.accent);   // "more text"
//
//   // a 96x32 button, one clip per state; write the label inside `text`
//   const { text } = button(g, 1, 1, 94, 30, clip, { face: p.face, frame: p.frame, border: p.border, corner: p.corner, shine: p.shine });
//
//   // a 64x16 bar: the housing clip and the fill clip share one opening
//   const opening = barHousing(g, 1, 1, 62, 14, { frame: p.frame, border: p.border, corner: p.corner });
//   barFill(g, opening, 0.6, { fill: p.fill, shine: p.shine });              // 60% full; a `fill` clip passes 1
//
// THE BEVEL (the same on panels, buttons and bars), from the outside in:
//   1 px INK  ·  the frame band, 1 to 3 px (`border`), lit along the top and right, dark along the
//   bottom and left  ·  1 px INK  ·  the face. A panel's face is sunken: a 1 px shadow under the top
//   and right of the frame. A button's face is flat, so text sits on one colour.
//
// STRETCHING. Everything that is not flat lies within EDGE (5) px of the panel's left and bottom
// edges and EDGE + 1 of its top and right (the face's shadow under the frame). With the 1 px empty
// border of a frame and the 2 px drop shadow (which falls left and down), that is the 8 px
// nine-slice border of the style guide (SLICE): cut 8 px off each side of the frame, keep the
// corners, repeat the edges along their length and the middle both ways.
//
// TELLING THE GAME (docs/architecture.md, Contract 8). A piece has a `slice`, one entry per
// stretchable clip (the `panel` layout, engine/gen/ui.js, works it out from the piece's data), and the exported sheet JSON then carries, on that clip and on each of its frames:
//   border   { left, bottom, right, top }   Unity's order, in sheet pixels: how far the corners reach in
//            from each side of `rect` (or of the frame when there is no rect)
//   rect     { x, y, w, h }                 where the piece sits in its frame, when it does not fill it
//   opening  { x, y, w, h }                 the trough of a bar housing, and where its fill strips lie
//   tile     { x, w }                       instead of a border, for a middle that repeats a pattern (a
//            segmented bar): columns x .. x + w - 1 are one repeat; insert whole copies to lengthen
// The sprite object's `slice` (engine/sprite.js clipStretch) has this shape:
//   slice: {
//     box: slice9(),                                         // a panel that fills its frame: 8 px each side
//     'name-tag': slice9({ x: 20, y: 14, w: 56, h: 20 }),    // a piece drawn in its own rectangle: rect + 7 px
//     frame: (p) => ({ left: 16, top: 8, right: 16, bottom: 8, opening: barOpening(1, 1, 62, 14, p) }),   // may follow the settings
//   },
// A cursor exports its hot spot as a `tip` socket (a `points` entry in its data: { "id": "tip", "on": "ui", "at": [0, 0], "angle": 0 }).
//
// CONTRAST (style guide, section 8). White text must keep 4.5 to 1 on a text face, and a frame 3 to 1
// against its face, under every whole-bundle look. Do not pick face and frame swatches by eye:
//   const SW = panelSwatches('hearthvale', { face: 'panel', frame: 'cream' });
//   face: color('Face', SW.face[0], SW.face),  frame: color('Frame', SW.frame[0], SW.frame),
// The two defaults are kept as given; every other swatch is kept only if it holds both rules under
// every look, a near miss comes back as a darker (face) or lighter (frame) tone of itself, and the
// rest are dropped. SW.failing names any rule the defaults themselves break (it should be empty).
// The rules are checked on the drawn pixels by contrastFaults(sprite), which tests/unit/ui-contrast.test.mjs
// runs over every sprite of type `ui` it finds. So a sprite with a colour control named `face` says
// where its text goes and where its frame (or lit edge) is:
//   textArea: (clip, p) => ({ x, y, w, h, edge: { x, y } })   // the text rectangle; one pixel of the frame band or lit edge
// (a list of these for a clip with several text areas; `text: '#231b33'` on an area meant for dark text, such as parchment)
// (`edge` may be left out for a piece with no frame, such as a highlight row), and a clip that never
// carries text says so in its clip entry: `cursor: { frames: 8, fps, loop: true, noText: true }`.
// noText is for arrows, cursors and markers, and for a plate that only sits behind a glyph (the
// plate of a status mark is not a text area, so its colour is free). A sprite with no `face` control
// (a glyph set, a bar) is not checked. A frame is measured where it is drawn: a sci-fi panel's frame
// is its thin lit edge, a lighter tone of the frame colour, and that is the pixel `edge` names.
//
// DIGITS. digitSize(size, style) gives the three sizes every digit set uses; digitBody(n, size) the
// strokes of a digit; rimmed(g, body, x, y, { colour, edge, shadow }) draws any small glyph as body,
// rim, ink (and inks its holes). Every digit differs from every other by more than 2 body pixels.
//
// `corner` and `border` are the 0..1 values of the sprite's sliders (Square / Round, Thin / Thick).
// Pass `cornerPx` (0 to 4) or `borderPx` (1 to 3) instead to give pixels directly.







// Pixels cut from each row of a corner, outermost row first: the quarter circles pixel artists use.
const CUTS = [[], [1], [2, 1], [3, 1, 1], [4, 2, 1, 1]];

/**
 * Shape test for a rectangle with pixel-art round corners (use with g.fill or g.blob).
 * k is the corner size in pixels, 0 (square) to 4; it is reduced to fit small rectangles.
 */
export function roundRectIn(x, y, w, h, k = 0) {
  const cuts = CUTS[Math.max(0, Math.min(k, 4, Math.floor((Math.min(w, h) - 1) / 2)))];   // one row and one column always reach the sides
  return (px, py) => {
    const ix = Math.floor(px - x), iy = Math.floor(py - y);
    if (ix < 0 || iy < 0 || ix >= w || iy >= h) return false;
    const dx = Math.min(ix, w - 1 - ix), dy = Math.min(iy, h - 1 - iy);
    return !(dy < cuts.length && dx < cuts[dy]);
  };
}

/** A small grid of on/off cells: { w, h, at(x, y), set(x, y, v), box(x0, y0, x1, y1) }. The body of a glyph. */
export function glyphGrid(w, h) {
  const cells = new Uint8Array(w * h);
  return {
    w, h,
    at: (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? cells[y * w + x] : 0),
    set(x, y, v = 1) { if (x >= 0 && y >= 0 && x < w && y < h) cells[y * w + x] = v ? 1 : 0; },
    box(x0, y0, x1, y1) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y); },
  };
}

const MID = 'mid';
// Strokes in box units: x 0 (left) .. 1 (right), y 0 (top) .. 1 (bottom), or MID for the middle bar.
const DIGIT_STROKES = [
  [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
  [[[0.2, 0], [0.5, 0], [0.5, 1]], [[0, 1], [1, 1]]],
  [[[0, 0], [1, 0], [1, MID], [0, MID], [0, 1], [1, 1]]],
  [[[0, 0], [1, 0], [1, 1], [0, 1]], [[0.4, MID], [1, MID]]],
  [[[0, 0], [0, MID], [1, MID]], [[1, 0], [1, 1]]],
  [[[1, 0], [0, 0], [0, MID], [1, MID], [1, 1], [0, 1]]],
  [[[1, 0], [0, 0], [0, 1], [1, 1], [1, MID], [0, MID]]],
  [[[0, 0], [1, 0], [1, 1]]],
  [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]], [[0, MID], [1, MID]]],
  [[[1, MID], [0, MID], [0, 0], [1, 0], [1, 1], [0, 1]]],
];
// Digits with a waist: the outer pixel is taken off these sides at the middle bar, so an 8 is two
// bowls and not a 0 with a line through it (that line alone is only 2 px of difference).
const WAIST = { 3: ['right'], 8: ['left', 'right'] };

/**
 * The body of digit n (0 to 9) as a glyphGrid, for a size from digitSize(). The middle bar is
 * always 1 px, which keeps both counters at least two rows tall. size.round takes the outside
 * pixel off every right-angle turn (never off a stroke's end).
 */
export function digitBody(n, size) {
  const paths = DIGIT_STROKES[n];
  if (!paths) throw new Error(`digitBody: ${n} is not a digit (0 to 9)`);
  const { w, h, stroke: sw, bar, round } = size;
  const b = glyphGrid(w, h);
  const midRow = Math.floor((h - 1) / 2);
  const left = (u) => Math.round(u * (w - sw)), right = (u) => left(u) + sw - 1;
  const top = (v) => (v === MID ? midRow : v === 0 ? 0 : h - bar), bottom = (v) => (v === MID ? midRow : v === 0 ? bar - 1 : h - 1);
  for (const path of paths) for (let i = 0; i + 1 < path.length; i++) {
    const [au, av] = path[i], [bu, bv] = path[i + 1];
    if (av === bv) b.box(Math.min(left(au), left(bu)), top(av), Math.max(right(au), right(bu)), bottom(av));
    else b.box(left(au), Math.min(top(av), top(bv)), right(au), Math.max(bottom(av), bottom(bv)));
  }
  for (const side of WAIST[n] ?? []) b.set(side === 'left' ? 0 : w - 1, midRow, 0);
  if (round && sw >= 2) for (const path of paths) {
    const len = path.length, closed = len > 2 && path[0][0] === path[len - 1][0] && path[0][1] === path[len - 1][1];
    const num = (v) => (v === MID ? 0.5 : v);
    for (let i = closed ? 0 : 1; i < len - 1; i++) {
      const a = path[i === 0 ? len - 2 : i - 1], v = path[i], c = path[i + 1];
      if (v[1] === MID) continue;                               // the middle bar is 1 px: nothing to round there
      const d1 = [Math.sign(v[0] - a[0]), Math.sign(num(v[1]) - num(a[1]))], d2 = [Math.sign(c[0] - v[0]), Math.sign(num(c[1]) - num(v[1]))];
      if (d1[0] * d2[0] + d1[1] * d2[1] !== 0) continue;
      b.set(d1[0] - d2[0] > 0 ? right(v[0]) : left(v[0]), d1[1] - d2[1] > 0 ? bottom(v[1]) : top(v[1]), 0);
    }
  }
  return b;
}
