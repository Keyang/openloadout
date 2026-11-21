// Pixel font: letters, digits and punctuation in four styles (chunky, slim, rounded, serif) at three
// sizes, and lines of text on one baseline (bundles/specs/core-sprites-3.md, helper batch H4a).
// Pure drawing on a Surface: runs in Node and in the browser.
//
//   import { fontMetrics, fontGlyph, textBody, textWidth, drawText } from '../engine/pixel-font.js';
//
//   const m = fontMetrics(p.size, p.style);                                 // cap 5, 7 or 9 px
//   drawText(g, 'SCORE', 4, 20, { metrics: m, colour: p.colour, outline: 'rimmed', edge: p.edge, shadow: true });
//   const w = textWidth('GAME OVER', m);                                     // centre it: x = (W - w) >> 1
//
// HOW A GLYPH IS MADE. Letters are built the way digitBody (engine/ui.js) builds digits: strokes in box
// units, x 0 (left) to 1 (right) across the glyph, y on named lines (the cap line, the x-height, the
// middle, the baseline, the descender line), filled on a glyphGrid by the style's rules. Diagonal
// strokes are even pixel stairs of the stroke width. The digits ARE digitBody, given the font's own
// size; the serif style adds its feet to the 4 and the 7. A glyph the rules cannot draw well enough
// is hand-set in FONT_HAND. No glyph is copied from any existing pixel typeface.
//
// WHERE A GLYPH SITS. By its pen point: the left edge of its body and the baseline (the first row under
// the capitals' feet). `rise` is the rows above the baseline; `h - rise` hang below it.
//
// ROOM. drawText draws nothing outside the surface; keep 2 px round the body for 'ink', 3 for
// 'rimmed', and one more down and to the left for `shadow`.



import { glyphGrid, digitBody } from './ui.js';

/** The font's four styles: chunky (heavy 2 px uprights), slim (1 px everywhere), rounded (chunky with every turn rounded) and serif (feet on uprights). No arguments: a frozen list. */
export const FONT_STYLES = Object.freeze(['chunky', 'slim', 'rounded', 'serif']);

/** The characters the font draws, in font-sheet order: { upper, lower, digits, marks } (18 marks). A space is no glyph, only an advance. No arguments: a frozen object. */
export const FONT_CHARS = Object.freeze({
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789',
  marks: '.,:;!?\'"-+=/()%#*&',
});

const ALL = FONT_CHARS.upper + FONT_CHARS.lower + FONT_CHARS.digits + FONT_CHARS.marks;

/**
 * Hand-set glyphs, by '<style>/<cap>/<char>', as rows of '#' (body) and '.' (nothing), top row first: the glyphs the stroke rules cannot draw well enough. No arguments: a frozen object.
 * Mostly the 3-row small letters (an open counter in 3 rows needs a hand), the diagonal letters of slim and serif (open
 * stairs that cross or meet at one point, feet only at the ends of strokes and never within 2 px of the next stroke, so
 * X, K, N and M keep their own bottom rows), V and v from cap 7 (arms 2 px apart or more until the point, so the ink
 * line does not fill the wedge), and '#', '*' and '&' at every size (a hash whose uprights stand 3 px apart under bars
 * that overhang them, a star of open spokes, a looped ampersand with an open tail: the stroke tables drew a boxed H,
 * an hourglass and a B).
 * Round 2 added: W and w of 5 rows (three strokes and two points), the rounded O, D, C and Q of 5 rows (open counters),
 * a 0 slashed wherever it is as wide as O (chunky 5 and 9) and a D that turns in wherever it is
 * as wide as 0, ? of 5 rows (an open curl), X that crosses at one row, U with a flat bottom (slim 5, rounded 7), the serif
 * l (a tail, no foot) and 1 (a sloped flag), serif R on P's stem, the slim R's 1 px leg, the serif Q's open counter, and
 * s, z and e of 3 rows (s's spine under the left end of its top bar, e's crossbar to the right wall over an open corner).
 * Round 3 added: s and e of 4 rows at cap 5 (an S turn; a bottom bar, without which e read as r), the chunky G of 5 rows (no 6), a slashed 0 at every size of the 2 px
 * styles, S of 9 rows with an unbroken spine, and the chunky and rounded % of 5 rows (dots apart from the slash).
 * Round 4 added: M and N of 5 rows in chunky and rounded (a V two rows deep, an open diagonal: with a bar across both
 * read as H), U of 5 and 7 rows (2 px uprights to the top), the rounded F (no lump in its corner), rounded m and w of 3
 * rows (open middle rows), C of 5 rows open over 3 rows, a marked 0 in slim and serif too (a slash, or at 3 px wide the
 * opposite corners off), a serif l with a foot and no flag (the flag is the 1's), 2 px legs and uprights on R and M,
 * z, Z and / with an even stair, the serif + of 7 rows with longer arms, and brackets of 9 rows the same top and bottom.
 * Round 6 added: s of 5 and 6 rows (cap 7 and 9) with an S turn (square ones were a small 5), a serif l with a head flag and
 * a centred foot (it read as L) and a serif I with wider slabs to keep it apart from that l, the rounded W of 5 rows with
 * 2 px tops (it matched M), the serif N of 7 rows with even 2 px uprights, and the slim V of 7 rows 5 px wide (on a flat U).
 * Each entry also says where it sits: { rows, rise } (rise: rows above the baseline).
 */
export const FONT_HAND = Object.freeze({
  'chunky/5/M': { rows: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#'], rise: 5 },
  'chunky/5/N': { rows: ['##..#', '###.#', '#.#.#', '#.###', '#..##'], rise: 5 },
  'chunky/5/Y': { rows: ['##.##', '##.##', '.###.', '.###.', '.###.'], rise: 5 },
  'chunky/5/a': { rows: ['.####', '##.##', '.####'], rise: 3 },
  'chunky/5/k': { rows: ['##...', '##...', '##.##', '####.', '##.##'], rise: 5 },
  'chunky/5/m': { rows: ['#####', '#.#.#', '#.#.#'], rise: 3 },
  'chunky/5/#': { rows: ['.#.#.', '#####', '.#.#.', '#####', '.#.#.'], rise: 5 },
  'chunky/5/&': { rows: ['.#...', '#.#..', '.##.#', '#..#.', '.##.#'], rise: 5 },
  'chunky/5/*': { rows: ['..#..', '#####', '.###.', '.#.#.'], rise: 5 },
  'chunky/7/#': { rows: ['.#...#.', '.#...#.', '#######', '.#...#.', '#######', '.#...#.', '.#...#.'], rise: 7 },
  'chunky/7/*': { rows: ['...#...', '#..#..#', '.#####.', '..###..', '.#####.', '#..#..#', '...#...'], rise: 7 },
  'chunky/7/&': { rows: ['.##....', '#..#...', '#..#...', '.##..#.', '#..#.#.', '#...#..', '.###.##'], rise: 7 },
  'chunky/9/#': { rows: ['.##...##.', '.##...##.', '#########', '.##...##.', '.##...##.', '.##...##.', '#########', '.##...##.', '.##...##.'], rise: 9 },
  'chunky/9/*': { rows: ['....#....', '##..#..##', '..#.#.#..', '...###...', '#########', '...###...', '..#.#.#..', '##..#..##', '....#....'], rise: 9 },
  'chunky/9/&': { rows: ['..###....', '.##.##...', '.##.##...', '..###....', '.####..##', '##..##.#.', '##...###.', '##....##.', '.####..##'], rise: 9 },
  'chunky/7/v': { rows: ['##..##', '##..##', '##..##', '.####.', '..##..'], rise: 5 },
  'chunky/9/v': { rows: ['##...##', '##...##', '##...##', '.##.##.', '..###..', '...#...'], rise: 6 },
  'chunky/9/V': { rows: ['##.....##', '##.....##', '##.....##', '.##...##.', '.##...##.', '.##...##.', '..##.##..', '...###...', '....#....'], rise: 9 },
  'rounded/5/A': { rows: ['..#..', '.###.', '##.##', '#####', '##.##'], rise: 5 },
  'rounded/5/B': { rows: ['###..', '##.##', '####.', '##.##', '###..'], rise: 5 },
  'rounded/5/G': { rows: ['.###.', '##...', '##.##', '##.##', '.####'], rise: 5 },
  'rounded/5/M': { rows: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#'], rise: 5 },
  'rounded/5/N': { rows: ['##..#', '###.#', '#.#.#', '#.###', '#..##'], rise: 5 },
  'rounded/5/P': { rows: ['###..', '##.##', '####.', '##...', '##...'], rise: 5 },
  'rounded/5/R': { rows: ['###..', '##.##', '####.', '##.#.', '##..#'], rise: 5 },
  'rounded/5/Y': { rows: ['##.##', '##.##', '.###.', '.###.', '.###.'], rise: 5 },
  'rounded/5/a': { rows: ['.###.', '#..##', '.####'], rise: 3 },
  'rounded/5/b': { rows: ['##...', '##...', '###..', '##.##', '###..'], rise: 5 },
  'rounded/5/g': { rows: ['.####', '##.##', '.####', '...##', '.###.'], rise: 3 },
  'rounded/5/h': { rows: ['##...', '##...', '###..', '##.##', '##.##'], rise: 5 },
  'rounded/5/k': { rows: ['##...', '##...', '##.##', '####.', '##.##'], rise: 5 },
  'rounded/5/o': { rows: ['.###.', '#...#', '.###.'], rise: 3 },
  'rounded/5/#': { rows: ['.#.#.', '#####', '.#.#.', '#####', '.#.#.'], rise: 5 },
  'rounded/5/&': { rows: ['.#...', '#.#..', '.##.#', '#..#.', '.##.#'], rise: 5 },
  'rounded/5/*': { rows: ['..#..', '#####', '.###.', '.#.#.'], rise: 5 },
  'rounded/7/b': { rows: ['##....', '##....', '####..', '##..##', '##..##', '##..##', '####..'], rise: 7 },
  'rounded/7/g': { rows: ['..##..', '##..##', '##..##', '##..##', '..####', '....##', '.####.'], rise: 5 },
  'rounded/7/o': { rows: ['..##..', '##..##', '##..##', '##..##', '..##..'], rise: 5 },
  'rounded/9/b': { rows: ['##.....', '##.....', '##.....', '#####..', '##...##', '##...##', '##...##', '##...##', '.#####.'], rise: 9 },
  'rounded/9/g': { rows: ['.#####.', '##...##', '##...##', '##...##', '##...##', '.######', '.....##', '.....##', '.####..'], rise: 6 },
  'rounded/9/o': { rows: ['..###..', '.#...#.', '##...##', '##...##', '.#...#.', '..###..'], rise: 6 },
  'rounded/7/C': { rows: ['..###.', '##..##', '##....', '##....', '##....', '##..##', '..###.'], rise: 7 },
  'rounded/7/Q': { rows: ['..###..', '.#...#.', '##...##', '##...##', '##.#.##', '.#..##.', '..#####', '.....##'], rise: 7 },
  'rounded/7/#': { rows: ['.#...#.', '.#...#.', '#######', '.#...#.', '#######', '.#...#.', '.#...#.'], rise: 7 },
  'rounded/7/*': { rows: ['...#...', '#..#..#', '.#####.', '..###..', '.#####.', '#..#..#', '...#...'], rise: 7 },
  'rounded/7/&': { rows: ['.##....', '#..#...', '#..#...', '.##..#.', '#..#.#.', '#...#..', '.###.##'], rise: 7 },
  'rounded/9/#': { rows: ['.##...##.', '.##...##.', '#########', '.##...##.', '.##...##.', '.##...##.', '#########', '.##...##.', '.##...##.'], rise: 9 },
  'rounded/9/*': { rows: ['....#....', '##..#..##', '..#.#.#..', '...###...', '#########', '...###...', '..#.#.#..', '##..#..##', '....#....'], rise: 9 },
  'rounded/9/&': { rows: ['..###....', '.##.##...', '.##.##...', '..###....', '.####..##', '##..##.#.', '##...###.', '##....##.', '.####..##'], rise: 9 },
  'rounded/7/v': { rows: ['##...##', '##...##', '.##.##.', '..###..', '...#...'], rise: 5 },
  'rounded/9/v': { rows: ['##...##', '##...##', '##...##', '.##.##.', '..###..', '...#...'], rise: 6 },
  'rounded/9/V': { rows: ['##.....##', '##.....##', '##.....##', '.##...##.', '.##...##.', '.##...##.', '..##.##..', '...###...', '....#....'], rise: 9 },
  'slim/5/K': { rows: ['#..#', '#.#.', '##..', '#.#.', '#..#'], rise: 5 },
  'slim/5/X': { rows: ['#.#', '#.#', '.#.', '#.#', '#.#'], rise: 5 },
  'slim/5/a': { rows: ['.##', '#.#', '.##'], rise: 3 },
  'slim/5/g': { rows: ['.##', '#.#', '.##', '..#', '##.'], rise: 3 },
  'slim/5/k': { rows: ['#..', '#..', '#.#', '##.', '#.#'], rise: 5 },
  'slim/5/o': { rows: ['.##.', '#..#', '.##.'], rise: 3 },
  'slim/5/v': { rows: ['#.#', '#.#', '.#.'], rise: 3 },
  'slim/5/w': { rows: ['#...#', '#.#.#', '.#.#.'], rise: 3 },
  'slim/5/6': { rows: ['.##', '#..', '###', '#.#', '###'], rise: 5 },
  'slim/5/9': { rows: ['###', '#.#', '###', '..#', '##.'], rise: 5 },
  'slim/5/#': { rows: ['.#.#.', '#####', '.#.#.', '#####', '.#.#.'], rise: 5 },
  'slim/5/&': { rows: ['.#...', '#.#..', '.##.#', '#..#.', '.##.#'], rise: 5 },
  'slim/5/*': { rows: ['..#..', '#.#.#', '.###.', '#.#.#', '..#..'], rise: 5 },
  'slim/7/K': { rows: ['#..#', '#..#', '#.#.', '##..', '#.#.', '#..#', '#..#'], rise: 7 },
  'slim/7/S': { rows: ['.###', '#...', '#...', '.##.', '...#', '...#', '###.'], rise: 7 },
  // round 6: 5 px wide, as the slim W of 7 rows (7 px left a hole in VW or AVE); a 1 px point in 2 rows, as test (12) asks
  'slim/7/V': { rows: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'], rise: 7 },
  'slim/7/X': { rows: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'], rise: 7 },
  'slim/7/k': { rows: ['#...', '#...', '#..#', '#.#.', '##..', '#.#.', '#..#'], rise: 7 },
  'slim/7/v': { rows: ['#...#', '#...#', '#...#', '.#.#.', '..#..'], rise: 5 },
  'slim/7/x': { rows: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'], rise: 5 },
  'slim/7/#': { rows: ['.#...#.', '.#...#.', '#######', '.#...#.', '#######', '.#...#.', '.#...#.'], rise: 7 },
  'slim/7/*': { rows: ['..#..', '#.#.#', '.###.', '#.#.#', '..#..'], rise: 7 },
  'slim/7/&': { rows: ['.##...', '#..#..', '.##...', '#.#..#', '#..##.', '#..#..', '.##.##'], rise: 7 },
  'slim/9/k': { rows: ['#...', '#...', '#...', '#..#', '#.#.', '##..', '#.#.', '#..#', '#..#'], rise: 9 },
  'slim/9/#': { rows: ['.#...#.', '.#...#.', '#######', '.#...#.', '.#...#.', '.#...#.', '#######', '.#...#.', '.#...#.'], rise: 9 },
  'slim/9/*': { rows: ['...#...', '#..#..#', '.#.#.#.', '..###..', '.#.#.#.', '#..#..#', '...#...'], rise: 9 },
  'slim/9/&': { rows: ['.##....', '#..#...', '#..#...', '.##....', '.#.#..#', '#...#.#', '#....#.', '#...#.#', '.###...#'], rise: 9 },
  'slim/5/V': { rows: ['#...#', '#...#', '#...#', '.#.#.', '..#..'], rise: 5 },
  'slim/9/V': { rows: ['#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '.#...#.', '.#...#.', '..#.#..', '...#...'], rise: 9 },
  'slim/9/v': { rows: ['#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'], rise: 6 },
  'slim/5/Z': { rows: ['####', '..#.', '.#..', '#...', '####'], rise: 5 },
  'serif/5/K': { rows: ['.#..#', '.#.#.', '.##..', '.#.#.', '##..#'], rise: 5 },
  'serif/5/N': { rows: ['.#..#', '.##.#', '.#.##', '.#..#', '##..#'], rise: 5 },
  'serif/5/T': { rows: ['#####', '#.#.#', '..#..', '..#..', '.###.'], rise: 5 },
  'serif/5/V': { rows: ['##.##', '.#.#.', '.#.#.', '.#.#.', '..#..'], rise: 5 },
  'serif/5/X': { rows: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'], rise: 5 },
  'serif/5/Y': { rows: ['##.##', '.#.#.', '..#..', '..#..', '.###.'], rise: 5 },
  'serif/5/a': { rows: ['.##.', '#..#', '.###'], rise: 3 },
  'serif/5/k': { rows: ['##...', '.#...', '.#..#', '.###.', '##..#'], rise: 5 },
  'serif/5/n': { rows: ['####.', '.#..#', '##..#'], rise: 3 },
  'serif/5/o': { rows: ['###', '#.#', '###'], rise: 3 },
  'serif/5/v': { rows: ['##.##', '.#.#.', '..#..'], rise: 3 },
  'serif/5/x': { rows: ['#..#', '.##.', '#..#'], rise: 3 },
  'serif/5/6': { rows: ['.###', '#...', '####', '#..#', '####'], rise: 5 },
  'serif/5/9': { rows: ['####', '#..#', '####', '...#', '###.'], rise: 5 },
  'serif/5/#': { rows: ['.#.#.', '#####', '.#.#.', '#####', '.#.#.'], rise: 5 },
  'serif/5/&': { rows: ['.#...', '#.#..', '.##.#', '#..#.', '.##.#'], rise: 5 },
  'serif/5/*': { rows: ['..#..', '#####', '.###.', '.#.#.'], rise: 5 },
  'serif/7/G': { rows: ['.#####', '##...#', '##....', '##.###', '##..##', '##..##', '.####.'], rise: 7 },
  'serif/7/K': { rows: ['###..##', '.##.##.', '.####..', '.###...', '.####..', '.##.##.', '###..##'], rise: 7 },
  // round 6: 2 px uprights on every row and a 1 px diagonal between them, as the serif N of 9 rows; the right upright
  // stands in the same two columns on every row (a serif stuck out at the top right only)
  'serif/7/N': { rows: ['.##..##', '.###.##', '.###.##', '.##.###', '.##.###', '.##..##', '###..##'], rise: 7 },
  'serif/7/X': { rows: ['##...##', '.##.##.', '..###..', '...#...', '..###..', '.##.##.', '##...##'], rise: 7 },
  'serif/7/k': { rows: ['###....', '.##....', '.##..##', '.##.##.', '.####..', '.##.##.', '###..##'], rise: 7 },
  'serif/7/v': { rows: ['##...##', '##...##', '.##.##.', '..###..', '...#...'], rise: 5 },
  'serif/7/x': { rows: ['##...##', '.##.##.', '..###..', '.##.##.', '##...##'], rise: 5 },
  'serif/7/#': { rows: ['.#...#.', '.#...#.', '#######', '.#...#.', '#######', '.#...#.', '.#...#.'], rise: 7 },
  'serif/7/*': { rows: ['...#...', '#..#..#', '.#####.', '..###..', '.#####.', '#..#..#', '...#...'], rise: 7 },
  'serif/7/&': { rows: ['.##....', '#..#...', '#..#...', '.##..#.', '#..#.#.', '#...#..', '.###.##'], rise: 7 },
  'serif/9/K': { rows: ['###...##', '.##..##.', '.##.##..', '.####...', '.###....', '.####...', '.##.##..', '.##..##.', '###...##'], rise: 9 },
  'serif/9/X': { rows: ['###...###', '.##...##.', '..##.##..', '...###...', '....#....', '...###...', '..##.##..', '.##...##.', '###...###'], rise: 9 },
  'serif/9/k': { rows: ['###....', '.##....', '.##....', '.##..##', '.##.##.', '.####..', '.##.##.', '.##..##', '###..##'], rise: 9 },
  'serif/9/x': { rows: ['###...###', '..##.##..', '...###...', '...###...', '..##.##..', '###...###'], rise: 6 },
  'serif/9/#': { rows: ['.##...##.', '.##...##.', '#########', '.##...##.', '.##...##.', '.##...##.', '#########', '.##...##.', '.##...##.'], rise: 9 },
  'serif/9/*': { rows: ['....#....', '##..#..##', '..#.#.#..', '...###...', '#########', '...###...', '..#.#.#..', '##..#..##', '....#....'], rise: 9 },
  'serif/9/&': { rows: ['..###....', '.##.##...', '.##.##...', '..###....', '.####..##', '##..##.#.', '##...###.', '##....##.', '.####..##'], rise: 9 },
  'serif/5/h': { rows: ['##...', '.#...', '.###.', '.#..#', '##..#'], rise: 5 },
  'serif/7/n': { rows: ['######.', '.##..##', '.##..##', '.##..##', '###..##'], rise: 5 },
  'serif/7/h': { rows: ['###....', '.##....', '.#####.', '.##..##', '.##..##', '.##..##', '###..##'], rise: 7 },
  'serif/5/Z': { rows: ['#####', '...#.', '..#..', '.#...', '#####'], rise: 5 },
  'serif/5/S': { rows: ['.###', '#...', '.##.', '...#', '###.'], rise: 5 },
  'serif/7/V': { rows: ['##...##', '##...##', '##...##', '##...##', '.##.##.', '..###..', '...#...'], rise: 7 },
  'serif/9/V': { rows: ['###...###', '.##...##.', '.##...##.', '.##...##.', '.##...##.', '.##...##.', '..##.##..', '...###...', '....#....'], rise: 9 },
  'serif/9/v': { rows: ['###...###', '.##...##.', '.##...##.', '..##.##..', '...###...', '....#....'], rise: 6 },
  // round 2 of the font sheets. W and w: three strokes and two points, no solid bottom block
  'chunky/5/W': { rows: ['##.##', '##.##', '#.#.#', '#.#.#', '.#.#.'], rise: 5 },
  'chunky/5/w': { rows: ['##.##', '#.#.#', '.#.#.'], rise: 3 },
  // round 6: the rounded W of 5 rows keeps 2 px tops, as its U and V (1 px tips made its top two rows the rounded M's);
  // its middle stroke rises 2 rows, chunky's 3
  'rounded/5/W': { rows: ['##.##', '##.##', '##.##', '#.#.#', '.#.#.'], rise: 5 },
  // O, D, C and Q of the rounded style: an open counter, never a 1 px pinhole between solid rows
  'rounded/5/O': { rows: ['.###.', '##.##', '#...#', '##.##', '.###.'], rise: 5 },
  'rounded/5/Q': { rows: ['.###.', '##.##', '#...#', '##.#.', '.##.#'], rise: 5 },
  'rounded/5/D': { rows: ['###..', '##.##', '##.##', '##.##', '###..'], rise: 5 },
  'rounded/5/C': { rows: ['.####', '##...', '##...', '##...', '.####'], rise: 5 },
  // a 0 slashed where it is as wide as O or D: a ring alone is the O (the rounded 0s are with round 3 below)
  'chunky/5/0': { rows: ['#####', '#..##', '#.#.#', '##..#', '#####'], rise: 5 },
  'chunky/9/0': { rows: ['#######', '#######', '##...##', '##..###', '##.#.##', '###..##', '##...##', '#######', '#######'], rise: 9 },
  // D where it is as wide as 0 (slim at every size, chunky at cap 7): its right side turns in, so it is no box with two corners off
  'slim/5/D': { rows: ['##..', '#.#.', '#..#', '#.#.', '##..'], rise: 5 },
  'slim/7/D': { rows: ['##..', '#.#.', '#..#', '#..#', '#..#', '#.#.', '##..'], rise: 7 },
  'slim/9/D': { rows: ['###..', '#..#.', '#...#', '#...#', '#...#', '#...#', '#...#', '#..#.', '###..'], rise: 9 },
  'chunky/7/D': { rows: ['####..', '##.##.', '##..##', '##..##', '##..##', '##.##.', '####..'], rise: 7 },
  // ? : a hook with an open counter, a stem, a gap and the dot
  'chunky/5/?': { rows: ['####.', '#..##', '..##.', '.....', '..##.'], rise: 5 },
  'rounded/5/?': { rows: ['.###.', '#..##', '..##.', '.....', '..##.'], rise: 5 },
  // X: the strokes cross at one narrow row
  'chunky/5/X': { rows: ['##.##', '.###.', '..#..', '.###.', '##.##'], rise: 5 },
  'rounded/5/X': { rows: ['##.##', '.###.', '..#..', '.###.', '##.##'], rise: 5 },
  'chunky/9/X': { rows: ['##...##', '##...##', '.##.##.', '.##.##.', '..###..', '.##.##.', '.##.##.', '##...##', '##...##'], rise: 9 },
  'rounded/9/X': { rows: ['##...##', '##...##', '.##.##.', '.##.##.', '..###..', '.##.##.', '.##.##.', '##...##', '##...##'], rise: 9 },
  'slim/9/X': { rows: ['#...#', '#...#', '.#.#.', '.#.#.', '..#..', '.#.#.', '.#.#.', '#...#', '#...#'], rise: 9 },
  // U: a flat bottom, never the point of V
  'slim/5/U': { rows: ['#..#', '#..#', '#..#', '#..#', '####'], rise: 5 },
  // round 6: the slim U of 7 rows on a flat bottom too, now that the slim V of 7 rows is no wider than it by more than 1 px
  // (a U that turned in on its last row was a V with its point cut off)
  'slim/7/U': { rows: ['#..#', '#..#', '#..#', '#..#', '#..#', '#..#', '####'], rise: 7 },
  // serif l, I and 1. Round 6: l has a flat head flag on the left, as b, d, h and k, and a foot centred on its stem (a
  // plain stem on a right-heavy foot read as L); I has slabs 2 px past its stem each side, so it is no l with a second
  // flag; 1 has a sloped flag under its top row and a foot both sides
  'serif/5/l': { rows: ['##.', '.#.', '.#.', '.#.', '###'], rise: 5 },
  'serif/7/l': { rows: ['###.', '.##.', '.##.', '.##.', '.##.', '.##.', '####'], rise: 7 },
  'serif/9/l': { rows: ['###.', '.##.', '.##.', '.##.', '.##.', '.##.', '.##.', '.##.', '####'], rise: 9 },
  // (the serif I is therefore the I with slabs that chunky and slim already draw: FONT_SAME)
  'serif/5/I': { rows: ['#####', '..#..', '..#..', '..#..', '#####'], rise: 5 },
  'serif/7/I': { rows: ['######', '..##..', '..##..', '..##..', '..##..', '..##..', '######'], rise: 7 },
  'serif/9/I': { rows: ['######', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '######'], rise: 9 },
  'serif/5/1': { rows: ['..#.', '.##.', '..#.', '..#.', '.###'], rise: 5 },
  'serif/7/1': { rows: ['..##.', '.###.', '#.##.', '..##.', '..##.', '..##.', '.####'], rise: 7 },
  'serif/9/1': { rows: ['..##.', '.###.', '#.##.', '..##.', '..##.', '..##.', '..##.', '..##.', '.####'], rise: 9 },
  // R built on the stem of P and B, with a leg
  'serif/5/R': { rows: ['.###.', '.#..#', '.###.', '.#.#.', '##..#'], rise: 5 },
  'serif/7/R': { rows: ['.####..', '.##.##.', '.##.##.', '.#####.', '.####..', '.##.##.', '###..##'], rise: 7 },
  'slim/7/R': { rows: ['###.', '#..#', '#..#', '###.', '#.#.', '#..#', '#..#'], rise: 7 },
  // Q: an O with a tail, one counter
  'serif/7/Q': { rows: ['.####.', '##..##', '##..##', '##..##', '##..##', '##.###', '.#####', '....##'], rise: 7 },
  // s at cap 5: 3 rows have no room for an S turn (every 3-row s read as c, r or a slanted bar), so it stands
  // 4 rows tall, as tall as t: a top bar, a join under its left end, a join over the right end of the bottom bar
  'chunky/5/s': { rows: ['.####', '###..', '..###', '####.'], rise: 4 },
  'rounded/5/s': { rows: ['.###.', '###..', '..###', '.###.'], rise: 4 },
  'slim/5/s': { rows: ['.###', '##..', '..##', '###.'], rise: 4 },
  // round 6: the serif s of 4 rows has its corners off as well (with square corners it was the 5 less a row, 2 px off),
  // which makes it the slim s: 4 rows of a 1 px stroke have no room for a terminal (FONT_SAME)
  'serif/5/s': { rows: ['.###', '##..', '..##', '###.'], rise: 4 },
  // s of 5 and 6 rows (round 6): an S turn, a join under the top bar's left end, a spine that steps down to the right
  // and a join over the bottom bar's right end, the corners off where the S's are. Square ones (bar, wall, bar, wall,
  // bar) were the 5 with two rows taken out and read as a small 5 beside digits
  'chunky/7/s': { rows: ['.#####', '###...', '.####.', '...###', '#####.'], rise: 5 },
  'rounded/7/s': { rows: ['.####.', '###...', '..##..', '...###', '.####.'], rise: 5 },
  'slim/7/s': { rows: ['.###', '#...', '.##.', '...#', '###.'], rise: 5 },
  'serif/7/s': { rows: ['.####', '##...', '.###.', '...##', '####.'], rise: 5 },
  'chunky/9/s': { rows: ['.######', '###....', '.####..', '..####.', '....###', '######.'], rise: 6 },
  'rounded/9/s': { rows: ['.#####.', '##.....', '.####..', '..####.', '.....##', '.#####.'], rise: 6 },
  'slim/9/s': { rows: ['.####', '#....', '.##..', '...#.', '....#', '####.'], rise: 6 },
  'serif/9/s': { rows: ['.#####', '##....', '.###..', '..###.', '....##', '#####.'], rise: 6 },
  'chunky/5/z': { rows: ['#####', '..##.', '#####'], rise: 3 },
  'rounded/5/z': { rows: ['#####', '..##.', '#####'], rise: 3 },
  'slim/5/z': { rows: ['####', '..#.', '####'], rise: 3 },
  // the serif z of 3 rows: 5 px wide, so its one diagonal pixel stands right of the middle and clear of the left wall
  // (4 px wide, the pixel stood next to the wall and z read as c or =). It is chunky's z with a 1 px diagonal: z has no
  // foot to add, and 3 rows have no room for more (FONT_SAME)
  'serif/5/z': { rows: ['#####', '...#.', '#####'], rise: 3 },
  // e: a counter, a crossbar to the right wall, an open lower right and a bottom bar. Round 3: at 3 rows it had no
  // bottom bar and read as r ("Scorr", "trst"). Round 5: at 4 rows its top bar sat on the crossbar with no counter
  // between them and it read as a lump over a c, so at cap 5 it stands 5 rows tall, the one small letter that does
  'chunky/5/e': { rows: ['.####', '##.##', '#####', '##...', '.####'], rise: 5 },
  'rounded/5/e': { rows: ['.###.', '##.##', '#####', '##...', '.###.'], rise: 5 },
  'slim/5/e': { rows: ['.##', '#.#', '###', '#..', '.##'], rise: 5 },
  'serif/5/e': { rows: ['.##.', '#..#', '####', '#...', '.###'], rise: 5 },
  // round 3 of the font sheets. G: its inward bar stops short of the stem (a bar from the stem across is the 6)
  'chunky/5/G': { rows: ['.####', '##...', '##.##', '##.##', '.###.'], rise: 5 },
  // 0 slashed at every size in the 2 px styles (a box or ring alone, or one with a dot in it, reads as O). Across the
  // 2 px counter of cap 7 the slash is a 3-row stair
  'chunky/7/0': { rows: ['######', '##..##', '##.###', '##.###', '###.##', '##..##', '######'], rise: 7 },
  'rounded/5/0': { rows: ['.###.', '#..##', '#.#.#', '##..#', '.###.'], rise: 5 },
  'rounded/7/0': { rows: ['.####.', '##..##', '##.###', '##.###', '###.##', '##..##', '.####.'], rise: 7 },
  'rounded/9/0': { rows: ['.#####.', '#######', '##...##', '##..###', '##.#.##', '###..##', '##...##', '#######', '.#####.'], rise: 9 },
  // S at cap 9: the spine is one unbroken stair from the left wall to the right wall
  'chunky/9/S': { rows: ['.######', '#######', '##.....', '.##....', '..###..', '....##.', '.....##', '#######', '######.'], rise: 9 },
  'rounded/9/S': { rows: ['..#####', '.######', '##.....', '.##....', '..###..', '....##.', '.....##', '######.', '#####..'], rise: 9 },
  'slim/9/S': { rows: ['.####', '#....', '#....', '.#...', '..#..', '...#.', '....#', '....#', '####.'], rise: 9 },
  // %: two dots apart from the slash (a 2 px slash at cap 5 ran into both dots and read as X)
  'chunky/5/%': { rows: ['##..#', '##.#.', '..#..', '.#.##', '#..##'], rise: 5 },
  'rounded/5/%': { rows: ['##..#', '##.#.', '..#..', '.#.##', '#..##'], rise: 5 },
  // round 4 of the font sheets. M of 5 rows: a V two rows deep down to the middle row, no bar across (with one it read as H)
  // N of 5 rows: an open 2 px diagonal from top left to bottom right, no bar across
  // (both are set with the round 1 entries at the top of this table)
  // U of 5 and 7 rows: in chunky a flat bottom (as its u, J and d), in rounded the corners cut; the uprights keep 2 px to the top
  'chunky/5/U': { rows: ['##.##', '##.##', '##.##', '##.##', '#####'], rise: 5 },
  'chunky/7/U': { rows: ['##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '######'], rise: 7 },
  'rounded/5/U': { rows: ['##.##', '##.##', '##.##', '##.##', '.###.'], rise: 5 },
  'rounded/7/U': { rows: ['##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '.####.'], rise: 7 },
  // rounded F: E without its bottom bar and a middle bar 1 px shorter, no lump inside the corner
  'rounded/5/F': { rows: ['.####', '##...', '###..', '##...', '##...'], rise: 5 },
  'rounded/7/F': { rows: ['.#####', '##....', '##....', '####..', '##....', '##....', '##....'], rise: 7 },
  'rounded/9/F': { rows: ['.######', '#######', '##.....', '##.....', '#####..', '##.....', '##.....', '##.....', '##.....'], rise: 9 },
  // rounded m and w of 3 rows: open middle rows, w rounded at the bottom, m peaked at the top (with a bar across both were blobs)
  'rounded/5/m': { rows: ['.#.#.', '#.#.#', '#.#.#'], rise: 3 },
  'rounded/5/w': { rows: ['#.#.#', '#.#.#', '.###.'], rise: 3 },
  // C of 5 rows: open on the right over 3 rows (a 1 px notch read as O); chunky's is square, as its c
  'chunky/5/C': { rows: ['#####', '##...', '##...', '##...', '#####'], rise: 5 },
  'slim/5/C': { rows: ['.##', '#..', '#..', '#..', '.##'], rise: 5 },
  'serif/5/C': { rows: ['.###', '#...', '#...', '#...', '.###'], rise: 5 },
  // 0 marked in the 1 px styles and serif too: a slash across the counter, or where the counter is under 3 px wide in a
  // 1 px style (slim at cap 5: a slash there fills it into a B or an 8) the two opposite corners off, the slash's ends.
  // Round 5: the serif 0 of cap 5 with its corners off alone was a D without its foot, so it has the corners off and a
  // 2-pixel slash, which leaves it 4 px or more from D, O and 8
  'slim/5/0': { rows: ['.##', '#.#', '#.#', '#.#', '##.'], rise: 5 },
  'slim/7/0': { rows: ['####', '#..#', '#.##', '#.##', '##.#', '#..#', '####'], rise: 7 },
  'slim/9/0': { rows: ['#####', '#...#', '#...#', '#..##', '#.#.#', '##..#', '#...#', '#...#', '#####'], rise: 9 },
  'serif/5/0': { rows: ['.###', '#..#', '#.##', '##.#', '###.'], rise: 5 },
  'serif/7/0': { rows: ['#####', '##.##', '#..##', '#.#.#', '##..#', '##.##', '#####'], rise: 7 },
  'serif/9/0': { rows: ['######', '##..##', '##..##', '##.###', '##.###', '###.##', '##..##', '##..##', '######'], rise: 9 },
  // serif M of 7 rows: 2 px uprights (it had 1 px ones between 2 px serifs) and a V from the second row, deeper than
  // chunky's, so it is no H with a bar gone
  'serif/7/M': { rows: ['##...##', '###.###', '##.#.##', '##...##', '##...##', '##...##', '##...##'], rise: 7 },
  // R of the 2 px styles at 9 rows: a 2 px leg
  'chunky/9/R': { rows: ['######.', '#######', '##...##', '##...##', '#######', '##.##..', '##..##.', '##...##', '##...##'], rise: 9 },
  'rounded/9/R': { rows: ['#####..', '######.', '##...##', '##...##', '#######', '##.##..', '##..##.', '##...##', '##...##'], rise: 9 },
  // z and Z: an even stair from the top bar's right end to the bottom bar's left end (at 9 rows Z is 1 px wider for it)
  'slim/7/z': { rows: ['####', '..#.', '.#..', '#...', '####'], rise: 5 },
  'slim/9/z': { rows: ['#####', '...#.', '..#..', '.#...', '#....', '#####'], rise: 6 },
  'serif/7/z': { rows: ['#####', '..##.', '.##..', '##...', '#####'], rise: 5 },
  'serif/9/z': { rows: ['######', '...##.', '..##..', '.##...', '##....', '######'], rise: 6 },
  'slim/9/Z': { rows: ['#######', '......#', '.....#.', '....#..', '...#...', '..#....', '.#.....', '#......', '#######'], rise: 9 },
  'serif/9/Z': { rows: ['########', '......##', '.....##.', '....##..', '...##...', '..##....', '.##.....', '##......', '########'], rise: 9 },
  // the slash: an even stair, no run of 3 rows down one column in its middle (the slim 5 one read as an integral sign)
  'slim/5//': { rows: ['..#', '..#', '.#.', '#..', '#..'], rise: 5 },
  'slim/7//': { rows: ['...#', '..#.', '..#.', '.#..', '.#..', '#...', '#...'], rise: 7 },
  'slim/9//': { rows: ['....#', '....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....', '#....'], rise: 9 },
  'serif/7//': { rows: ['...##', '..##.', '..##.', '.##..', '.##..', '##...', '##...'], rise: 7 },
  'serif/9//': { rows: ['....##', '....##', '...##.', '...##.', '..##..', '.##...', '.##...', '##....', '##....'], rise: 9 },
  // the serif + of 7 rows: arms 2 rows long, as chunky's (1 row of arm read as a dash with a knot in it)
  'serif/7/+': { rows: ['..##..', '..##..', '######', '..##..', '..##..'], rise: 6 },
  // brackets of 9 rows with 2 px bars: the same curve top and bottom
  'chunky/9/(': { rows: ['.##', '##.', '##.', '##.', '##.', '##.', '##.', '##.', '.##'], rise: 9 },
  'chunky/9/)': { rows: ['##.', '.##', '.##', '.##', '.##', '.##', '.##', '.##', '##.'], rise: 9 },
  'rounded/9/(': { rows: ['.##', '##.', '##.', '##.', '##.', '##.', '##.', '##.', '.##'], rise: 9 },
  'rounded/9/)': { rows: ['##.', '.##', '.##', '.##', '.##', '.##', '.##', '.##', '##.'], rise: 9 },
});

const SIZES = [
  { cap: 5, x: 3, descent: 2, maxW: 5, space: 2, digitW: { chunky: 5, rounded: 5, slim: 3, serif: 4 } },
  { cap: 7, x: 5, descent: 2, maxW: 7, space: 3, digitW: { chunky: 6, rounded: 6, slim: 4, serif: 5 } },
  { cap: 9, x: 6, descent: 3, maxW: 9, space: 4, digitW: { chunky: 7, rounded: 7, slim: 5, serif: 6 } },
];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * The measures of one font style at one of its three sizes: { style, cap, x, descent, stroke, bar, round, serif, space, track, maxW, digitW }.
 * Arguments: size (0..1, a Size slider: small below 1/3, large from 2/3, as digitSize picks); style (one of FONT_STYLES, default 'chunky'; anything else throws).
 */
export function fontMetrics(size = 0.5, style = 'chunky') {
  if (!FONT_STYLES.includes(style)) throw new Error(`fontMetrics: style "${style}" is not one of ${FONT_STYLES.join(', ')}`);
  const s = SIZES[Math.min(2, Math.floor(clamp01(size) * 3))];
  const stroke = style === 'slim' ? 1 : style === 'serif' ? (s.cap === 5 ? 1 : 2) : 2;
  const bar = style === 'chunky' || style === 'rounded' ? (s.cap < 9 ? 1 : 2) : 1;
  return Object.freeze({
    style, cap: s.cap, x: s.x, descent: s.descent, stroke, bar, round: style === 'rounded', serif: style === 'serif',
    space: s.space, track: 1, maxW: s.maxW, digitW: s.digitW[style],
  });
}

// ---- the stroke tables ------------------------------------------------------------------------------------
// Each entry: (k) -> { w, paths, dots, ... }. k gives the widths: k.n (normal: the digit width), k.m (one
// wider), k.w (two wider), k.k (one narrower), all within k.maxW; k.sw is the stroke, k.dot a mark's dot.
// A path is a list of points [u, line]: u 0..1 across, line one of
//   T cap line · X x-height · A the top of t · M the middle of the capitals · m the middle of the x-height
//   B baseline (the bottom row) · D descender line · P the dot of i and j      (an offset: 'T+1', 'B-1')
// Consecutive points joined straight across or straight down are bars and uprights; any other pair is
// a diagonal stair. A stroke at u 0.5 is centred: 1 px narrower (or wider) when the width cannot centre it.
// dots: [u, line, rows, cols] a block standing on that line (default: the band's rows, a stroke wide).
// cut: rounds the glyph a step in every style (1: the outer pixel off each turn; 2 in the rounded style on
//   capitals of 7 rows and more: three). par: the width is nudged so a centred stroke keeps its width.
// thin: a wide letter whose middle stroke is 1 px (an odd width under 2 px strokes, an odd width of 1 px ones).
// notch: 'l' / 'r' takes the outer pixel off that side at the middle (as digitBody's 3 and 8).
// head: serif heads on free uprights at the cap line ('left': on the left only); xflag: a serif flag at the
//   top of a stem on the x-height. nofeet: no serif feet (the wide letters have no room for them).
//   SPEC DEVIATION (core-sprites-3.md asks for "a 1 px foot each side of every upright's foot on the
//   baseline"): M, m, W and w are nofeet. M and m are already maxW wide; their feet need 2 px more, and
//   narrowing the letter to make room fills M's V and m's two counters at cap 5 and 7 (m becomes a solid
//   block). W and w stand on a closed bottom bar, so their uprights have no free foot to add one to. These
//   four are therefore in FONT_SAME as chunky/slim/rounded = serif, and test (4) passes for them only
//   because nofeet keeps the feet off.
// sym: the glyph is one of the mirror-image ones (the tests check it).

const P = (...pts) => pts;
const box = (l, t, r, b) => P([l, t], [r, t], [r, b], [l, b], [l, t]);

const LETTERS = {
  A: (k) => ({ w: k.n, sym: true, cut: 1, paths: [P([0, 'B'], [0, 'T'], [1, 'T'], [1, 'B']), P([0, 'M'], [1, 'M'])] }),
  B: (k) => ({ w: k.n, cut: 1, paths: [P([0, 'T'], [0, 'B']), P([0, 'T'], [1, 'T'], [1, 'B'], [0, 'B']), P([0, 'M'], [1, 'M'])], notch: ['r'] }),
  C: (k) => ({ w: k.n, cut: 1, paths: [P([1, 'T+1'], [1, 'T'], [0, 'T'], [0, 'B'], [1, 'B'], [1, 'B-1'])] }),
  D: (k) => ({ w: k.n, cut: 1, paths: [P([0, 'T'], [0, 'B']), P([0, 'T'], [1, 'T'], [1, 'B'], [0, 'B'])] }),
  E: (k) => ({ w: k.n, paths: [P([1, 'T'], [0, 'T'], [0, 'B'], [1, 'B']), P([0, 'M'], [0.75, 'M'])] }),
  F: (k) => ({ w: k.n, paths: [P([1, 'T'], [0, 'T'], [0, 'B']), P([0, 'M'], [0.75, 'M'])] }),
  G: (k) => ({ w: k.m, cut: 1, paths: [P([1, 'T'], [0, 'T'], [0, 'B'], [1, 'B'], [1, 'M'], [0.6, 'M'])] }),
  H: (k) => ({ w: k.n, sym: true, paths: [P([0, 'T'], [0, 'B']), P([1, 'T'], [1, 'B']), P([0, 'M'], [1, 'M'])] }),
  I: (k) => (k.serif
    ? { w: k.sw, head: true, paths: [P([0, 'T'], [0, 'B'])] }
    : { w: k.sw + 2 * (k.cap === 5 && k.sw === 1 ? 2 : 1 + (k.cap > 5 && k.sw > 1 ? 1 : 0)), sym: true, par: true, paths: [P([0, 'T'], [1, 'T']), P([0.5, 'T'], [0.5, 'B']), P([0, 'B'], [1, 'B'])] }),
  J: (k) => ({ w: k.k, head: true, paths: [P([1, 'T'], [1, 'B'], [0, 'B'], [0, 'B-1'])] }),
  K: (k) => ({ w: k.n, paths: [P([0, 'T'], [0, 'B']), P([1, 'T'], [0, 'M']), P([0, 'M'], [1, 'B'])] }),
  L: (k) => ({ w: k.m, paths: [P([0, 'T'], [0, 'B'], [1, 'B'])] }),
  M: (k) => ({ w: k.w, sym: true, thin: true, nofeet: true, paths: [P([0, 'B'], [0, 'T']), P([1, 'T'], [1, 'B']), P([0, 'T'], [0.5, 'M']), P([1, 'T'], [0.5, 'M'])] }),
  N: (k) => ({ w: k.m, paths: [P([0, 'B'], [0, 'T']), P([0, 'T'], [1, 'B']), P([1, 'B'], [1, 'T'])] }),
  O: (k) => ({ w: k.m, sym: true, cut: 1, paths: [box(0, 'T', 1, 'B')] }),
  P: (k) => ({ w: k.n, cut: 1, paths: [P([0, 'T'], [0, 'B']), P([0, 'T'], [1, 'T'], [1, 'M'], [0, 'M'])] }),
  Q: (k) => ({ w: k.m, cut: 1, paths: [box(0, 'T', 1, 'B'), P([0.5, 'M+1'], [1, 'B+1'])] }),
  R: (k) => ({ w: k.n, cut: 1, paths: [P([0, 'T'], [0, 'B']), P([0, 'T'], [1, 'T'], [1, 'M'], [0, 'M']), P([0.5, 'M'], [1, 'B'])] }),
  S: (k) => ({ w: k.n, cut: 1, paths: [P([1, 'T'], [0, 'T'], [0, 'M-1'], [1, 'M+1'], [1, 'B'], [0, 'B'])] }),
  T: (k) => ({ w: k.n, sym: true, par: true, head: true, paths: [P([0, 'T'], [1, 'T']), P([0.5, 'T'], [0.5, 'B'])] }),
  U: (k) => ({ w: k.n, sym: true, cut: 1, paths: [P([0, 'T'], [0, 'B'], [1, 'B'], [1, 'T'])] }),
  V: (k) => ({ w: k.n, sym: true, paths: [P([0, 'T'], [0, 'M'], [0.5, 'B']), P([1, 'T'], [1, 'M'], [0.5, 'B'])] }),
  W: (k) => ({ w: k.w, sym: true, thin: true, nofeet: true, paths: [P([0, 'T'], [0, 'B'], [1, 'B'], [1, 'T']), P([0.5, 'M'], [0.5, 'B'])] }),
  X: (k) => ({ w: k.n, sym: true, paths: [P([0, 'T'], [1, 'B']), P([1, 'T'], [0, 'B'])] }),
  Y: (k) => ({ w: k.n, sym: true, par: true, paths: [P([0, 'T'], [0, 'T+1'], [0.5, 'M']), P([1, 'T'], [1, 'T+1'], [0.5, 'M']), P([0.5, 'M'], [0.5, 'B'])] }),
  Z: (k) => ({ w: k.m, paths: [P([0, 'T'], [1, 'T']), P([1, 'T+1'], [0, 'B-1']), P([0, 'B'], [1, 'B'])] }),

  a: (k) => ({ w: k.n, paths: [P([0, 'X'], [1, 'X'], [1, 'B']), P([1, 'm'], [0, 'm'], [0, 'B'], [1, 'B'])] }),
  b: (k) => ({ w: k.n, head: true, cut: 1, paths: [P([0, 'T'], [0, 'B']), P([0, 'X'], [1, 'X'], [1, 'B'], [0, 'B'])] }),
  c: (k) => ({ w: k.n, paths: [P([1, 'X'], [0, 'X'], [0, 'B'], [1, 'B'])] }),
  d: (k) => ({ w: k.n, head: true, paths: [P([1, 'T'], [1, 'B'], [0, 'B'], [0, 'X'], [1, 'X'])] }),
  e: (k) => ({ w: k.n, paths: [P([1, 'B'], [0, 'B'], [0, 'X'], [1, 'X'], [1, 'm'], [0, 'm'])] }),
  f: (k) => ({ w: k.k, paths: [P([1, 'T'], [0.3, 'T'], [0.3, 'B']), P([0, 'X'], [1, 'X'])] }),
  g: (k) => ({ w: k.n, cut: 1, paths: [P([1, 'B'], [0, 'B'], [0, 'X'], [1, 'X'], [1, 'D'], [0, 'D'])] }),
  h: (k) => ({ w: k.n, head: true, paths: [P([0, 'T'], [0, 'B']), P([0, 'X'], [1, 'X'], [1, 'B'])] }),
  i: (k) => ({ w: k.sw, paths: [P([0, 'X'], [0, 'B'])], dots: [[0, 'P']] }),
  j: (k) => ({ w: k.sw + (k.serif ? 3 : 2), xflag: true, paths: [P([1, 'X'], [1, 'D'], [0, 'D'])], dots: [[1, 'P']] }),
  k: (k) => ({ w: k.k, head: true, paths: [P([0, 'T'], [0, 'B']), P([1, 'X'], [0, 'm']), P([0, 'm'], [1, 'B'])] }),
  l: (k) => ({ w: k.serif ? k.sw + 2 : k.sw + 1, head: 'left', paths: [P([0, 'T'], [0, 'B'], [1, 'B'])] }),
  m: (k) => ({ w: k.w, sym: true, thin: true, nofeet: true, paths: [P([0, 'B'], [0, 'X'], [1, 'X'], [1, 'B']), P([0.5, 'X'], [0.5, 'B'])] }),
  n: (k) => ({ w: k.n, paths: [P([0, 'B'], [0, 'X'], [1, 'X'], [1, 'B'])] }),
  o: (k) => ({ w: k.n, sym: true, cut: 1, paths: [box(0, 'X', 1, 'B')] }),
  p: (k) => ({ w: k.n, paths: [P([0, 'D'], [0, 'X'], [1, 'X'], [1, 'B'], [0, 'B'])] }),
  q: (k) => ({ w: k.n, paths: [P([1, 'D'], [1, 'X'], [0, 'X'], [0, 'B'], [1, 'B'])] }),
  r: (k) => ({ w: k.k, paths: [P([0, 'B'], [0, 'X'], [1, 'X'])] }),
  s: (k) => ({ w: k.n, paths: [P([1, 'X'], [0, 'X'], [0, 'm'], [1, 'm'], [1, 'B'], [0, 'B'])] }),
  t: (k) => ({ w: k.n, paths: [P([0.3, 'A'], [0.3, 'B'], [1, 'B']), P([0, 'X'], [1, 'X'])] }),
  u: (k) => ({ w: k.n, paths: [P([0, 'X'], [0, 'B'], [1, 'B'], [1, 'X'])] }),
  v: (k) => ({ w: k.n, sym: true, paths: [P([0, 'X'], [0.5, 'B']), P([1, 'X'], [0.5, 'B'])] }),
  w: (k) => ({ w: k.w, sym: true, thin: true, nofeet: true, paths: [P([0, 'X'], [0, 'B'], [1, 'B'], [1, 'X']), P([0.5, 'm'], [0.5, 'B'])] }),
  x: (k) => ({ w: k.n, sym: true, paths: [P([0, 'X'], [1, 'B']), P([1, 'X'], [0, 'B'])] }),
  y: (k) => ({ w: k.n, paths: [P([0, 'X'], [0, 'B'], [1, 'B']), P([1, 'X'], [1, 'D'], [0, 'D'])] }),
  z: (k) => ({ w: k.n, paths: [P([0, 'X'], [1, 'X'], [0, 'B'], [1, 'B'])] }),
};

const MARKS = {
  // the stops are a stroke wide (k.pt): 1 px in the 1 px styles, as the dots of ! and ?
  '.': (k) => ({ w: k.pt, dots: [[0, 'B', k.pt, k.pt]] }),
  ',': (k) => ({ w: k.pt + 1, dots: [[1, 'B', k.pt, k.pt], [0, 'B+1', 1, 1]] }),
  // from cap 7 the two dots stand 3 rows apart, so the ink line round each (outline 'ink') leaves a clear row between them
  ':': (k) => ({ w: k.pt, dots: [[0, 'B', k.pt, k.pt], [0, `B-${k.pt + (k.cap > 5 ? 3 : 1)}`, k.pt, k.pt]] }),
  ';': (k) => ({ w: k.pt + 1, dots: [[1, 'B', k.pt, k.pt], [0, 'B+1', 1, 1], [1, `B-${k.pt + (k.cap > 5 ? 3 : 1)}`, k.pt, k.pt]] }),
  '!': (k) => ({ w: k.sw, paths: [P([0, 'T'], [0, `B-${k.bar + 1}`])], dots: [[0, 'B']] }),
  '?': (k) => ({ w: k.n, par: true, paths: [P([0, 'T+1'], [0, 'T'], [1, 'T'], [1, 'M'], [0.5, 'M'], [0.5, `B-${k.bar + 1}`])], dots: [[0.5, 'B']] }),
  "'": (k) => ({ w: k.sw, paths: [P([0, 'T'], [0, k.cap > 5 ? 'T+2' : 'T+1'])] }),
  '"': (k) => ({ w: 2 * k.sw + 1, paths: [P([0, 'T'], [0, k.cap > 5 ? 'T+2' : 'T+1']), P([1, 'T'], [1, k.cap > 5 ? 'T+2' : 'T+1'])] }),
  '-': (k) => ({ w: k.k, sym: true, paths: [P([0, 'M'], [1, 'M'])] }),
  '+': (k) => ({ w: k.n, sym: true, par: true, paths: [P([0, 'M'], [1, 'M']), P([0.5, `M-${k.r}`], [0.5, `M+${k.r}`])] }),
  '=': (k) => ({ w: k.k, sym: true, paths: [P([0, 'M-1'], [1, 'M-1']), P([0, 'M+1'], [1, 'M+1'])] }),
  '/': (k) => ({ w: k.n, paths: [P([0, 'B'], [1, 'T'])] }),
  '(': (k) => ({ w: k.sw + 1, paths: [P([1, 'T'], [0, 'T+1'], [0, 'B-1'], [1, 'B'])] }),
  ')': (k) => ({ w: k.sw + 1, paths: [P([0, 'T'], [1, 'T+1'], [1, 'B-1'], [0, 'B'])] }),
  '%': (k) => ({ w: k.maxW, paths: [P([0, 'B'], [1, 'T'])], dots: [[0, `T+${k.dot - 1}`, k.dot, k.dot], [1, 'B', k.dot, k.dot]] }),
  '#': (k) => ({ w: k.n, sym: true, paths: [P([0, 'T'], [0, 'B']), P([1, 'T'], [1, 'B']), P([0, 'T+1'], [1, 'T+1']), P([0, 'B-1'], [1, 'B-1'])] }),
  '*': (k) => ({ w: k.n, sym: true, par: true, paths: [P([0.5, 'T'], [0.5, 'M']), P([0, 'T'], [1, 'M']), P([1, 'T'], [0, 'M'])] }),
  '&': (k) => ({ w: k.m, paths: [P([0.7, 'M'], [0.7, 'T'], [0, 'T'], [0, 'B'], [0.8, 'B'], [1, 'm'])], dots: [] }),
};

// digits whose right upright stands free on the baseline: the serif style gives it a foot
const DIGIT_FEET = { 4: true, 7: true };

// ---- building a glyph -------------------------------------------------------------------------------------

function kitFor(m) {
  const n = m.digitW;
  return {
    sw: m.stroke, bar: m.bar, dot: Math.max(2, m.stroke), pt: m.stroke, cap: m.cap, serif: m.serif, maxW: m.maxW, r: Math.max(1, Math.floor(n / 2) - (m.stroke > 1 ? 1 : 0)),
    n, m: Math.min(m.maxW, n + 1), w: Math.min(m.maxW, n + 2), k: Math.max(m.stroke * 2 + 1, n - 1),
  };
}

// the rows of a named line, [first, last]
function band(m, name) {
  const mm = /^([TXAMmBDP])([+-]\d+)?$/.exec(name);
  if (!mm) throw new Error(`pixel-font: no line "${name}"`);
  const C = m.cap, X = m.x, D = m.descent, b = m.bar, d = Number(mm[2] ?? 0);
  const mid = Math.floor((C - 1) / 2), xm = C - X + Math.floor((X - 1) / 2);
  const r = { T: [0, b - 1], X: [C - X, C - X + b - 1], A: [1, b], M: [mid, mid], m: [xm, xm], B: [C - b, C - 1], D: [C + D - b, C + D - 1], P: [C - X - 1 - b, C - X - 2] }[mm[1]];
  return [r[0] + d, r[1] + d];
}
const single = (name) => /^[Mm]/.test(name);

// a half-up rounding that is the same seen from either side, so mirror-image strokes come out mirror-image
const symRound = (v, k) => (v <= k / 2 ? Math.floor(v + 0.5) : k - Math.floor(k - v + 0.5));

function draw(m, def, w, PAD) {
  const sw = m.stroke, rows = m.cap + m.descent;
  const g = glyphGrid(w + 2 * PAD, rows);
  const set = (x, y, v = 1) => g.set(x + PAD, y, v);
  const at = (x, y) => g.at(x + PAD, y);
  const centre = (w - sw) % 2 === 0 ? sw : sw > 1 ? sw - 1 : sw + 1;
  const thick = (u) => (u === 0.5 ? centre : sw);
  const left = (u, t = thick(u)) => symRound(u * (w - t), w - t);
  const right = (u, t = thick(u)) => left(u, t) + t - 1;
  const top = (l) => band(m, l)[0], bottom = (l) => band(m, l)[1];
  const fill = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y); };
  const feet = [], heads = [], turns = [];

  for (const path of def.paths ?? []) {
    for (let i = 0; i + 1 < path.length; i++) {
      const [au, al] = path[i], [bu, bl] = path[i + 1];
      if (al === bl) fill(Math.min(left(au), left(bu)), top(al), Math.max(right(au), right(bu)), bottom(al));
      else if (au === bu) fill(left(au), Math.min(top(al), top(bl)), right(au), Math.max(bottom(al), bottom(bl)));
      else {
        const [hu, hl, lu, ll] = top(al) <= top(bl) ? [au, al, bu, bl] : [bu, bl, au, al];
        const t = hu === 0.5 || lu === 0.5 ? centre : sw, k = w - t;
        const ra = top(hl), rb = bottom(ll), v1 = hu * k, v2 = lu * k;
        for (let y = ra; y <= rb; y++) {
          const v = v1 + ((v2 - v1) * (y - ra)) / Math.max(1, rb - ra);
          const x = v1 <= v2 ? symRound(v, k) : k - symRound(k - v, k);   // a stroke leaning left is the mirror image of one leaning right
          fill(x, y, x + t - 1, y);
        }
      }
    }
    const len = path.length, closed = len > 2 && path[0][0] === path[len - 1][0] && path[0][1] === path[len - 1][1];
    // free ends: feet on the baseline and the descender line, heads on the cap line
    if (!closed) for (const [end, next] of [[path[0], path[1]], [path[len - 1], path[len - 2]]]) {
      if (!next) continue;
      const [u, l] = end, [nu, nl] = next;
      if (nl === l) { if (/^T/.test(l)) heads.push({ bar: true, u, l, nu }); continue; }
      if (/^[BD]$/.test(l) && top(nl) < top(l) && (nu === u || u !== 0.5)) feet.push({ u, l, nu, nl });
      if (l === 'T' && top(nl) > top(l) && nu === u) heads.push({ u, l });
    }
    for (let i = closed ? 0 : 1; i < len - 1; i++) {
      const a = path[i === 0 ? len - 2 : i - 1], v = path[i], c = path[i + 1];
      if (single(v[1])) continue;
      const px = (p) => left(p[0]), py = (p) => top(p[1]);
      const d1 = [Math.sign(px(v) - px(a)), Math.sign(py(v) - py(a))], d2 = [Math.sign(px(c) - px(v)), Math.sign(py(c) - py(v))];
      if ((d1[0] && d1[1]) || (d2[0] && d2[1])) continue;                // a diagonal: no right angle
      if (d1[0] * d2[0] + d1[1] * d2[1] !== 0) continue;
      const ox = d1[0] - d2[0] > 0 ? right(v[0]) : left(v[0]), oy = d1[1] - d2[1] > 0 ? bottom(v[1]) : top(v[1]);
      const ix = d1[0] - d2[0] > 0 ? -1 : 1, iy = d1[1] - d2[1] > 0 ? -1 : 1;
      const inX = d1[0] - d2[0] > 0 ? left(v[0]) - 1 : right(v[0]) + 1, inY = d1[1] - d2[1] > 0 ? top(v[1]) - 1 : bottom(v[1]) + 1;
      turns.push({ ox, oy, ix, iy, inX, inY });
    }
  }
  for (const [u, l, rowsTall, wide = sw] of def.dots ?? []) {
    const b = band(m, l), y1 = b[1], y0 = rowsTall ? y1 - rowsTall + 1 : b[0];
    fill(left(u, wide), y0, right(u, wide), y1);
  }
  return { g, set, at, turns, feet, heads, left, right, top, bottom, PAD, w };
}

function trim(g) {
  let x0 = g.w, x1 = -1, y0 = g.h, y1 = -1;
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.at(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 < 0) return { body: glyphGrid(0, 0), top: 0 };
  const body = glyphGrid(x1 - x0 + 1, y1 - y0 + 1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (g.at(x, y)) body.set(x - x0, y - y0);
  return { body, top: y0 };
}

function letterGlyph(ch, m) {
  const k = kitFor(m), base = (LETTERS[ch] ?? MARKS[ch])({ ...k, serif: m.serif });
  const isLetter = !!LETTERS[ch];
  // the digitSize rule on the x-height: a lowercase letter is under 9 rows tall, so its bars are 1 px
  const lm = /[a-z]/.test(ch) ? { ...m, bar: 1 } : m;
  let w = base.w;
  if (base.par && (w - m.stroke) % 2 !== 0) w = w - 1 >= m.stroke * 2 + 1 || w + 1 > m.maxW ? w - 1 : w + 1;
  // a wide letter with a middle stroke: 1 px in the middle of 2 px strokes, or 1 px strokes on an odd width
  if (base.thin && (w - m.stroke) % 2 === (m.stroke > 1 ? 0 : 1)) w = m.stroke > 1 && w + 1 <= m.maxW ? w + 1 : w - 1;
  const footed = build(ch, m, lm, base, isLetter, w, true);
  // feet that leave a gap under 2 px between two strokes on their row read as one solid bar (H, N, n at
  // cap 7 and every two-legged capital at cap 5): such a letter goes without feet and spends their 2 px
  // on its counter instead
  if (!footed.cramped) return footed;
  return build(ch, m, lm, base, isLetter, Math.min(m.maxW, footed.w + 2), false);
}

// a row's gaps between ink, as [first, last] columns
function gaps(g, y) {
  const out = [];
  let start = -1, seen = false;
  for (let x = 0; x < g.w; x++) {
    if (g.at(x, y)) { if (seen && start >= 0) out.push([start, x - 1]); start = -1; seen = true; }
    else if (seen && start < 0) start = x;
  }
  return out;
}

function build(ch, m, lm, base, isLetter, w, feetOn) {
  for (;;) {
    const d = draw(lm, base, w, 1);
    let cramped = false;
    const short = /[a-z]/.test(ch) || m.cap < 7, cut = base.cut ?? 0;
    const chamfer = (dd, level) => {
      for (const t of dd.turns) {
        if (level > 0) dd.set(t.ox, t.oy, 0);
        if (level > 1) { dd.set(t.ox + t.ix, t.oy, 0); dd.set(t.ox, t.oy + t.iy, 0); }
      }
    };
    if (!m.round) chamfer(d, cut);
    else {
      // what the chunky style draws, which the rounded style must differ from
      const ref = draw(lm, base, w, 1);
      chamfer(ref, cut);
      // a second step of rounding only on capitals of 7 rows or more: anything shorter is too short for it
      chamfer(d, short ? 1 : 1 + cut);
      // still too close to chunky (a single turn, or a letter chunky already rounds): fill the inside of
      // each turn as well, unless that would close a counter
      if (isLetter && differ(trim(ref.g).body, trim(d.g).body) < 2) for (const t of d.turns) {
        if (d.at(t.inX, t.inY)) continue;
        const before = counters(d.g);
        d.set(t.inX, t.inY, 1);
        if (counters(d.g) < before) d.set(t.inX, t.inY, 0);
      }
    }
    for (const side of base.notch ?? []) d.set(side === 'l' ? 0 : w - 1, band(lm, 'M')[0], 0);
    if (m.serif && isLetter) {
      // feet: a 1 px foot each side of each free foot. One that would close a gap to the next stroke, or leave
      // 1 px of it (the 1 or 2 px gap between the legs of A, H, N), is left off
      const toes = [];
      if (feetOn && !base.nofeet) d.feet.forEach((f, n) => {
        const y = d.bottom(f.l);
        let x0 = d.left(f.u), x1 = d.right(f.u);
        if (f.u !== f.nu) {                                      // a diagonal leg: its pixels on that row, at its side
          const row = []; for (let x = -1; x <= w; x++) if (d.at(x, y)) row.push(x); const near = f.u < 0.5 ? row.filter((x) => x <= Math.min(...row) + m.stroke) : row.filter((x) => x >= Math.max(...row) - m.stroke); x0 = Math.min(...near); x1 = Math.max(...near); }
        toes.push({ x: x0 - 1, y, n, dir: -1 }, { x: x1 + 1, y, n, dir: 1 });
      });
      // a toe is left off when the next stroke on its row (or the row above) lies 2 px or less beyond the
      // upright: the foot would close that gap, or leave 1 px of it
      const near = (t) => [0, 1, 2].some((i) => d.at(t.x + i * t.dir, t.y) || (i > 0 && d.at(t.x + i * t.dir, t.y - 1)));
      const keep = toes.filter((t) => !near(t) && !toes.some((o) => o.n !== t.n && o.y === t.y && Math.abs(o.x - t.x) <= 1));
      for (const t of keep) d.set(t.x, t.y);
      // cramped: a foot stands next to a gap of 1 px on its row
      for (const t of keep) for (const [a, b] of gaps(d.g, t.y)) if (b === a && Math.abs(t.x + d.PAD - a) <= m.stroke + 2 && Math.abs(t.x + d.PAD - a) > 0) cramped = true;
      if (base.xflag) for (const path of base.paths) for (const [u, l] of [path[0]]) if (l === 'X') d.set(d.left(u) - 1, d.top(l));
      if (base.head) for (const h of d.heads) {
        if (h.bar) { const x = h.u > h.nu ? d.right(h.u) : d.left(h.u); d.set(x, d.bottom(h.l) + 1); }
        else { d.set(d.left(h.u) - 1, d.top(h.l)); if (base.head !== 'left') d.set(d.right(h.u) + 1, d.top(h.l)); }
      }
    }
    const { body, top } = trim(d.g);
    if (body.w <= m.maxW || w <= m.stroke) return { body, top, w, cramped };
    w -= 1;
  }
}

// how many closed counters (holes the outside cannot reach) a grid has
function counters(g) {
  const W = g.w + 2, H = g.h + 2, seen = new Uint8Array(W * H), solid = (x, y) => g.at(x - 1, y - 1);
  const flood = (start) => {
    const todo = [start]; seen[start] = 1;
    while (todo.length) {
      const i = todo.pop(), x = i % W, y = (i - x) / W;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny * W + nx] || solid(nx, ny)) continue;
        seen[ny * W + nx] = 1; todo.push(ny * W + nx);
      }
    }
  };
  flood(0);
  let n = 0;
  for (let i = 0; i < W * H; i++) if (!seen[i] && !solid(i % W, (i - (i % W)) / W)) { n++; flood(i); }
  return n;
}

function differ(a, b) {
  let n = 0;
  for (let y = 0; y < Math.max(a.h, b.h); y++) for (let x = 0; x < Math.max(a.w, b.w); x++) n += a.at(x, y) !== b.at(x, y) ? 1 : 0;
  return n;
}

function digitGlyph(ch, m) {
  const n = Number(ch), body = digitBody(n, { w: m.digitW, h: m.cap, stroke: m.stroke, bar: m.bar, round: m.round });
  if (!m.serif || !DIGIT_FEET[n]) return { body, top: 0 };
  const out = glyphGrid(body.w + 1, body.h), y = body.h - 1;
  for (let j = 0; j < body.h; j++) for (let i = 0; i < body.w; i++) if (body.at(i, j)) out.set(i, j);
  out.set(body.w - m.stroke - 1, y); out.set(body.w, y);
  return { body: out, top: 0 };
}

function handGlyph(rows, rise) {
  const body = glyphGrid(Math.max(...rows.map((r) => r.length)), rows.length);
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') body.set(x, y); }));
  return { body, rise };
}

const cache = new Map();
function made(ch, m) {
  const key = `${m.style}/${m.cap}/${m.stroke}/${m.bar}/${m.round}/${m.serif}/${m.digitW}/${m.maxW}/${m.x}/${m.descent}/${ch}`;
  if (cache.has(key)) return cache.get(key);
  let out;
  const hand = FONT_HAND[`${m.style}/${m.cap}/${ch}`];
  if (hand) out = handGlyph(hand.rows, hand.rise);
  else {
    const { body, top } = /[0-9]/.test(ch) ? digitGlyph(ch, m) : letterGlyph(ch, m);
    out = { body, rise: m.cap - top };
  }
  cache.set(key, out);
  return out;
}

const copyGrid = (g) => { const c = glyphGrid(g.w, g.h); for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.at(x, y)) c.set(x, y); return c; };

function known(ch, who) {
  if (typeof ch !== 'string' || ch.length !== 1 || !ALL.includes(ch)) throw new Error(`${who}: no glyph for ${JSON.stringify(ch)}. The font draws: ${ALL} (and a space)`);
}

/**
 * One character of the font: { body (a glyphGrid of its body pixels, no rim, no ink), w, h, rise (rows above the baseline; h - rise hang below) }.
 * Arguments: ch (one character of FONT_CHARS; anything else throws, naming it); metrics (from fontMetrics). The body's left edge is the pen point.
 */
export function fontGlyph(ch, metrics) {
  known(ch, 'fontGlyph');
  const { body, rise } = made(ch, metrics);
  return { body: copyGrid(body), w: body.w, h: body.h, rise };
}

// where each character's pen point goes, and the line's measures
function layout(text, metrics, track) {
  const items = [];
  let x = 0, glyphs = 0;
  for (const ch of String(text)) {
    if (ch === ' ') { items.push({ ch, x }); x += metrics.space; continue; }
    known(ch, 'textBody');
    if (glyphs > 0) x += track;                               // between two glyphs, whatever spaces lie between
    const gl = made(ch, metrics);
    items.push({ ch, x, gl });
    x += gl.body.w;
    glyphs++;
  }
  return { items, w: x };
}

/**
 * A line of text as one glyphGrid on one baseline: { body, w, h, rise, advances }. Glyphs sit `track` px apart and a space adds metrics.space px; advances is the x of each character's pen point.
 * Arguments: text (characters of FONT_CHARS and spaces; anything else throws); metrics (from fontMetrics); options { track (px between glyphs, default metrics.track) }.
 */
export function textBody(text, metrics, { track = metrics.track } = {}) {
  const { body, w, h, rise, advances } = lineBody(text, metrics, track, null);
  return { body, w, h, rise, advances };
}

function lineBody(text, metrics, track, offsets) {
  const { items, w } = layout(text, metrics, track);
  const off = (i) => Math.round(offsets?.[i] ?? 0);
  let up = 0, down = 0;
  items.forEach((it, i) => { if (!it.gl) return; up = Math.max(up, it.gl.rise + off(i)); down = Math.max(down, it.gl.body.h - it.gl.rise - off(i)); });
  const h = Math.max(0, up + down), body = glyphGrid(w, h);
  items.forEach((it, i) => {
    if (!it.gl) return;
    const y0 = up - it.gl.rise - off(i), b = it.gl.body;
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.at(x, y)) body.set(it.x + x, y0 + y);
  });
  return { body, w, h, rise: up, advances: items.map((it) => it.x), items, offsetOf: off };
}
