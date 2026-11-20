// PORT (migration batch M9): a copy of engine/glyphs.js with its imports pointed at the port shims, so it draws paint
// refs on engine/gen/port-surface.js grids (engine/gen/ports/colour.js, surface.js). It is the drawing code of the M9
// port generators (engine/gen/ui-inputs.js, ui-hud.js, ui-bubbles.js, text.js), so it is NOT temporary: it stays when
// engine/glyphs.js goes (removal items R1 to R4 delete the engine original once its last code caller is gone) and goes
// only with the last generator version that draws with it (review M9 round 2, issue 6). A TRIMMED or HAND CHANGE note
// below says where it differs from its source; never change what a released generator version draws through it.
// Picture glyphs: tiny hand-set pictures for the 16x16 marks of an interface (status marks beside
// a fighter, pips, badges), and the status marks themselves (docs/style-guide.md section 8).
// Pure drawing on a Surface: runs in Node and in the browser.
//
// At ten pixels a picture cannot be computed from shapes: every pixel is placed by hand. So a glyph
// is written as rows of characters, one character per pixel, and each character names a TONE of one
// of two colours (GLYPH_TONES): the main colour (what the mark means: a boost, an ailment) and a
// second colour (a thing it is shown with: a blade, a shield, a wing). The light is already in the
// picture: lit pixels sit to the top right, shadow to the bottom left.
//
//   import { statusMark, drawGlyph, glyphPlate, glyphPicture, glyphOver } from '../engine/glyphs.js';
//
//   const picture = statusMark('attack-up', { bold: p.bold });               // at most 10x10
//   const s = new Surface(16, 16);
//   drawGlyph(s, picture, (16 - picture.w) >> 1, (16 - picture.h) >> 1, { main: p.good, second: P.steel, shine: p.shine });
//   s.outline(INK);                                                          // one line round the picture
//   if (p.backing !== 'none') glyphPlate(g, 1, 1, 14, { shape: p.backing, face: p.face, shine: p.shine });
//   g.blit(s);                                                               // the outlined glyph over the plate
//
//   const heart = glyphPicture(['.#.#.', '##o##', '#####', '.###.', '..#..']);      // a picture of your own
//   const both = glyphOver(heart, statusMark('poison'), 3, 2);                // one laid over another, parted by the outline
//
// A picture is at most 10x10: with its 1 px outline that is the 12x12 inside of a 14 px plate, and
// 14x14 is the most a 16x16 glyph frame may hold. Pictures leave a 1 px gap between parts that
// should be told apart; the outline fills it.

import { ramp, INK } from './colour.js';
import { roundRectIn } from './ui.js';

/** The characters a glyph picture is written in, and what each paints. No arguments: a frozen object of { character: meaning }. */
export const GLYPH_TONES = Object.freeze({
  '.': 'nothing',
  '#': 'the main colour',
  o: 'the main colour, lit (its light tone)',
  x: 'the main colour in shadow (its dark tone)',
  '*': 'a white glint on the main colour (its light tone while Shine is off)',
  '+': 'the second colour',
  '-': 'the second colour in shadow',
  "'": 'the second colour, lit: white while Shine is on, its light tone while it is off',
  i: 'the outline colour: a slit, an eye, a line drawn inside the body',
});

/**
 * Make a glyph picture from rows of characters (GLYPH_TONES): one character is one pixel, a space or a dot is nothing. Rows may differ in length.
 * Arguments: rows: a list of strings, top row first. Returns { w, h, at(x, y) -> the character there ('.' outside), rows (padded to w) }.
 */
export function glyphPicture(rows) {
  const w = Math.max(0, ...rows.map((r) => r.length)), h = rows.length;
  const full = rows.map((r) => r.replace(/ /g, '.').padEnd(w, '.'));
  for (const r of full) for (const c of r) if (!(c in GLYPH_TONES)) throw new Error(`glyphPicture: "${c}" is not one of ${Object.keys(GLYPH_TONES).join(' ')}`);
  return Object.freeze({ w, h, rows: Object.freeze(full), at: (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? full[y][x] : '.') });
}

/**
 * Lay one glyph picture over another: the upper one is pasted at (x, y) and the pixels of the lower one that touch it, corners included, are cleared, so the outline that is drawn later runs between the two.
 * Arguments: under, over: pictures from glyphPicture; x, y: where the top left of `over` goes in `under` (the result grows to hold both; negative values are allowed). Returns a new picture.
 */
export function glyphOver(under, over, x = 0, y = 0) {
  const x0 = Math.min(0, x), y0 = Math.min(0, y), w = Math.max(under.w, x + over.w) - x0, h = Math.max(under.h, y + over.h) - y0;
  const top = (px, py) => over.at(px + x0 - x, py + y0 - y), rows = [];
  for (let py = 0; py < h; py++) {
    let row = '';
    for (let px = 0; px < w; px++) {
      const t = top(px, py);
      if (t !== '.') { row += t; continue; }
      let near = false;
      for (let j = -1; j <= 1 && !near; j++) for (let i = -1; i <= 1; i++) if (top(px + i, py + j) !== '.') { near = true; break; }
      row += near ? '.' : under.at(px + x0, py + y0);
    }
    rows.push(row);
  }
  return glyphPicture(rows);
}

/**
 * A glyph picture mirrored or turned upside down: an arrow that points down, a boot that faces left.
 * Arguments: picture: from glyphPicture; options { x (true: mirror left to right), y (true: top to bottom) }. Returns a new picture.
 */
export function glyphFlip(picture, { x = false, y = false } = {}) {
  let rows = [...picture.rows];
  if (y) rows.reverse();
  if (x) rows = rows.map((r) => [...r].reverse().join(''));
  return glyphPicture(rows);
}

/**
 * Paint a glyph picture, one pixel per character, with its top left at (x, y). It draws no outline: call outline(INK) afterwards, so pictures laid side by side or over a plate get one line round them.
 * Arguments: g: the Surface; picture: from glyphPicture; x, y (whole pixels); options { main, second (colours; second defaults to main), shine (false: the white glints fall back to the light tones; default true), ink (the colour of 'i'; default INK) }.
 */
export function drawGlyph(g, picture, x, y, { main, second = main, shine = true, ink = INK } = {}) {
  if (!main) throw new Error('drawGlyph: needs a main colour');
  const M = ramp(main), S = ramp(second);
  const paint = { '#': M.base, o: M.light, x: M.dark, '*': shine ? '#ffffff' : M.light, '+': S.base, '-': S.dark, "'": shine ? '#ffffff' : S.light, i: ink };
  for (let j = 0; j < picture.h; j++) for (let i = 0; i < picture.w; i++) {
    const c = picture.rows[j][i];
    if (c !== '.') g.dot(Math.floor(x) + i, Math.floor(y) + j, paint[c]);
  }
  return g;
}

/** The shapes of plate glyphPlate draws behind a glyph: round, square. No arguments: a frozen list. */
export const PLATE_SHAPES = Object.freeze(['round', 'square']);

/**
 * A small flat plate to put behind a glyph: an outline, then a face in one colour, with a lit line inside its top and right edge while Shine is on. Draw the plate first and the outlined glyph over it.
 * Arguments: g: the Surface; x, y, size: its top left and its width and height in whole pixels (14 in a 16x16 glyph frame); options { shape (one of PLATE_SHAPES, default 'round'), face (colour), shine (default true), ink (default INK) }.
 * Returns { x, y, w, h }: the box, 2 px in from every side, that a glyph's body may fill (its own outline then meets the plate's).
 */
export function glyphPlate(g, x, y, size, { shape = 'round', face, shine = true, ink = INK } = {}) {
  if (!PLATE_SHAPES.includes(shape)) throw new Error(`glyphPlate: shape "${shape}" is not one of ${PLATE_SHAPES.join(', ')}`);
  if (!face) throw new Error('glyphPlate: needs a face colour');
  const inside = roundRectIn(x, y, size, size, shape === 'round' ? 4 : 1), F = ramp(face);
  const at = (px, py) => inside(px + 0.5, py + 0.5), deep = (px, py) => at(px, py) && at(px - 1, py) && at(px + 1, py) && at(px, py - 1) && at(px, py + 1);
  for (let py = y; py < y + size; py++) for (let px = x; px < x + size; px++) {
    if (!at(px, py)) continue;
    g.dot(px, py, !deep(px, py) ? ink : shine && !(deep(px + 1, py) && deep(px, py - 1)) ? F.light : F.base);
  }
  return { x: x + 2, y: y + 2, w: size - 4, h: size - 4 };
}

// ---- status marks ---------------------------------------------------------------------------
// The marks a game shows beside a fighter. Each is written twice, by hand: a regular picture and
// a bold one with thicker strokes and fuller forms; neither is wider or taller than 10 pixels, so
// with its outline it fits the 12x12 inside of a 14 px plate. The ailment or boost itself is in
// the main colour; a thing it is shown with (a blade, a shield, a wing) is in the second colour.

const ARROW = {
  regular: ['..o..', '.#oo.', '##ooo', '..o..', '..o..', '..o..'],
  bold: ['..o..', '.#oo.', '##ooo', '.#oo.', '.#oo.', '.#oo.'],
};
const BLADE = {
  regular: ["..'..", ".'+-.", ".'+-.", ".'+-.", ".'+-.", "-----", "..+..", ".-+-."],
  bold: ["..'..", ".'+-.", ".'+-.", ".'+-.", ".'+-.", ".'+-.", "-+++-", "..+..", "..+..", ".-+-."],
};
const SHIELD = {
  regular: ["-++++", "-+''+", "-+''+", "-++++", "-++++", ".-++.", "..+.."],
  bold: ["-+++++", "-++''+", "-++''+", "-+++++", "-+++++", "-+++++", "-+++++", ".-+++.", "..-+.."],
};
const PICTURES = {
  drop: {
    regular: ['...o...', '...o...', '..#oo..', '..#oo..', '.x#ooo.', '.x#o*o.', '.x##oo.', '..xx#..'],
    bold: ['...oo...', '...oo...', '..#ooo..', '..#ooo..', '.x#oo*o.', 'x##oo*oo', 'x##ooooo', 'x###oooo', '.x###oo.', '..xx##..'],
  },
  zz: {
    regular: ['.....oo*', '......o.', '.....###', 'oooo*...', '...oo...', '..oo....', '.oo.....', '#####...'],
    bold: ['......ooo*', '........oo', '......oo..', '......####', 'ooooo*....', 'oooooo....', '...ooo....', '.ooo......', '######....', '######....'],
  },
  stars: {
    regular: ['...o....', '..o*o...', '...#....', '........', '......o.', '.o...o*o', 'o*o...#.', '.#......'],
    bold: ['..o.......', '..o.....o.', 'oo*oo..o*o', '..#.....#.', '..#.......', '.......o..', '.o.....o..', 'o*o..oo*oo', '.#.....#..', '.......#..'],
  },
  flame: {
    regular: ['..o....', '..oo...', '.#oo.o.', '.#oooo.', '##o*ooo', '##**ooo', 'x#***o#', '.x#oo#.'],
    bold: ['...o.....', '...oo....', '..#oo....', '..#oo..o.', '.##oo.oo.', '.#oooooo.', '##oo*oooo', '##o**oooo', 'x#o***oo#', '.x#ooo##.'],
  },
  snowflake: {
    regular: ['...o...', 'o..o..o', '.o.o.o.', '..o*o..', '.#.o.o.', '#..#..o', '...#...'],
    bold: ['....oo....', 'o...oo...o', 'oo..oo..oo', '.oo.oo.oo.', '..oo**oo..', '..#o**oo..', '.##.oo.oo.', '##..#o..oo', '#...##...o', '....##....'],
  },
  boot: {
    regular: [".....#o..", "+'''.#o..", "...+.#o..", ".+++.#o..", "...+.#oo.", "..++.#ooo", ".....xxxx"],
    bold: [".....#oo..", "+'''.#oo..", "...+.#oo..", ".+++.#oo..", "...+.#ooo.", "..++.#oooo", ".....##ooo", ".....xxxxx"],
  },
};

/** The names statusMark knows: poison, sleep, stun, burn, freeze, attack-up, defence-up, attack-down, defence-down, haste. No arguments: a frozen list. */
export const STATUS_MARKS = Object.freeze(['poison', 'sleep', 'stun', 'burn', 'freeze', 'attack-up', 'defence-up', 'attack-down', 'defence-down', 'haste']);

/**
 * The picture of a status mark, at most 10x10 pixels: a drop (poison), two letters z (sleep), stars in a ring (stun), a flame (burn), a snowflake (freeze), a blade or a shield with an arrow up or down, a winged boot (haste).
 * Arguments: name (one of STATUS_MARKS); options { bold (true: the thicker picture) }. Returns a picture for drawGlyph: the status is in the main colour, the blade, shield or wing in the second.
 */
export function statusMark(name, { bold = false } = {}) {
  const weight = bold ? 'bold' : 'regular';
  const simple = { poison: 'drop', sleep: 'zz', stun: 'stars', burn: 'flame', freeze: 'snowflake', haste: 'boot' }[name];
  if (simple) return glyphPicture(PICTURES[simple][weight]);
  const m = /^(attack|defence)-(up|down)$/.exec(name);
  if (!m) throw new Error(`statusMark: no mark "${name}". Marks: ${STATUS_MARKS.join(', ')}`);
  const thing = glyphPicture((m[1] === 'attack' ? BLADE : SHIELD)[weight]), arrow = glyphFlip(glyphPicture(ARROW[weight]), { y: m[2] === 'down' });
  // beside the thing: an arrow up starts at its top, an arrow down ends at its foot, so the two differ in outline too
  return glyphOver(thing, arrow, 5, m[2] === 'down' ? Math.max(0, thing.h - arrow.h) : 0);
}
