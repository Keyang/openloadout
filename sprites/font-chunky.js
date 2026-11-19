// Chunky pixel letters (core-sprites-3, batch K21, pathfinder for text): a font sheet.
//
// Every frame is one character, drawn by drawText of engine/pixel-font.js in the `chunky`
// style with its pen point (the left edge of the glyph, on the baseline) at (4, 13): the
// pivot. The four clips are the four rows of FONT_CHARS (capitals, small letters, digits,
// punctuation), so frame n of a clip is character n of that row. A game cuts the sheet into
// 16x20 cells, lines glyphs up by the pen point, and trims each cell's empty columns on the
// right (plus 1 px of tracking) for proportional spacing. The clips are rows of pictures,
// not motions: a fixed 2 fps for the playground and no Speed control.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { PALETTE } from '../engine/palettes.js';
import { FONT_CHARS, fontMetrics, drawText } from '../engine/pixel-font.js';

const P = PALETTE.thornwood;

export default defineSprite({
  id: 'font-chunky',
  name: 'Chunky pixel letters',
  kind: 'Item',
  blurb: 'Heavy blocky capitals, small letters, digits and punctuation, one per 16x20 cell on a shared baseline (trim the empty columns on the right for proportional spacing); change the size, outline, shadow, shine and colours.',
  meta: {
    type: 'ui', role: 'interface/icon', themes: ['neutral'], gameTypes: ['arcade', 'puzzle', 'platformer', 'turn-based-rpg'], view: 'none',
    words: ['font', 'letters', 'alphabet', 'text', 'numbers', 'title', 'score', 'pixel', 'bold'],
    license: 'draft',
  },
  size: [16, 20],
  pivot: [4, 13],
  grounded: false,
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    outline: choice('Outline', 'ink', ['none', 'ink', 'rimmed']),
    shadow: toggle('Shadow', false),
    shine: toggle('Shine', false),
    body: color('Letters', P.cream, [P.cream, P.gold, P.sky, P.goblin, P.skin, P.steel], { material: 'paint' }),
    edge: color('Rim', P.cavern, [P.cavern, P.crimson, P.hero, P.thorn, P.leaf, P.soil], { material: 'paint', when: { outline: ['rimmed'] } }),
  },
  clips: {
    upper: { frames: 26, fps: 2, loop: true, label: 'Capitals A to Z' },
    lower: { frames: 26, fps: 2, loop: true, label: 'Small letters a to z' },
    digits: { frames: 10, fps: 2, loop: true, label: 'Digits 0 to 9' },
    marks: { frames: 18, fps: 2, loop: true, label: 'Punctuation' },
  },
  versions: [
    { name: 'Ink letters', params: {} },
    { name: 'Gold title', params: { size: 1, outline: 'rimmed', body: P.gold, edge: P.crimson, shadow: true } },
    { name: 'Small and plain', params: { size: 0, outline: 'none', body: P.sky } },
    { name: 'Two-tone mint', params: { outline: 'rimmed', shine: true, body: P.goblin, edge: P.leaf } },
    { name: 'Big steel', params: { size: 1, body: P.steel, shadow: true } },
  ],

  render(g, { clip, frame, p }) {
    drawText(g, FONT_CHARS[clip][frame], 4, 13, {
      metrics: fontMetrics(p.size, 'chunky'), colour: p.body, outline: p.outline, edge: p.edge, shadow: p.shadow, shine: p.shine,
    });
  },
});
