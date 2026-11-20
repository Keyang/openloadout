// FROZEN COPY, not a sprite: sprites/ui-score-pop.js as it was on 2026-11-20 (migration batch M9), before the migration redraws it as
// data (docs/data-sprites.md section 7). Kept only for the tests about the framework its code uses (tests/helpers/library.mjs
// codeSprite, codeSpriteSource); imports point at ../../../. Never edit it; the build never scans tests/.
// Score pop (core-sprites-3, batch K22): the points that float up where a coin was taken or an enemy fell, then
// sparkle away. The number is drawn with the pixel font (engine/pixel-font.js), centred on the pivot (24, 24): the
// bottom middle of the number at rest, with 8 rows of room above it for the rise.
//   idle  the number at rest
//   rise  0 white, 1 and 2 popping up (2 then 3 px), 3 to 5 drifting up 1 px a frame, 6 and 7 the characters
//         replaced from the left by sparkles (twinkle of engine/fx.js); the last frame keeps a sparkle per character
// Digits and a small x are drawn here on purpose (a deviation from style guide section 8): that is what it is for.
import { defineSprite, range, choice, color } from '../../../engine/sprite.js';
import { lerp } from '../../../engine/motion.js';
import { PALETTE } from '../../../engine/palettes.js';
import { FONT_STYLES, fontMetrics, fontGlyph } from '../../../engine/pixel-font.js';
import { glyphGrid, rimmed } from '../../../engine/ui.js';
import { Surface } from '../../../engine/surface.js';
import { INK } from '../../../engine/color.js';
import { twinkle } from '../../../engine/fx.js';

const P = PALETTE.thornwood, D = PALETTE.derelict;
const PIVOT = [24, 24];
const NUMBERS = { p10: '+10', p50: '+50', p100: '+100', p500: '+500', p1000: '+1000', x2: 'x2', x5: 'x5' };
// the choice's labels (and so the names of generated versions) say the number in words: a name holds no digits
const SAID = { p10: 'Plus ten', p50: 'Plus fifty', p100: 'Plus hundred', p500: 'Plus five hundred', p1000: 'Plus thousand', x2: 'Times two', x5: 'Times five' };
const RISE = [0, 2, 3, 4, 5, 6, 7, 8];         // px above rest, per frame of `rise`

// The font's '+' is 3 rows tall at the small size (and in serif at the middle one): rimmed, it closes into a
// lozenge. Here it is a cross with arms of 2 px or more each side of the centre: 5x5 with 1 px strokes on the
// small cap, 6x5 with the font's 2 px upright on the larger ones.
function plusGlyph(metrics) {
  const gl = fontGlyph('+', metrics);
  if (gl.h >= 5) return gl;
  const small = metrics.cap < 7, w = small ? 5 : 6, body = glyphGrid(w, 5);
  body.box(0, 2, w - 1, 2);
  if (small) body.box(2, 0, 2, 4); else body.box(2, 0, 3, 4);
  return { body, w, h: 5, rise: small ? metrics.cap : metrics.cap - 1 };
}

// The number as one body on one baseline (the font's glyphs `track` px apart, the plus from plusGlyph):
// { body, w, rise, advances (each character's pen point), glyphs }.
function numberBody(text, metrics) {
  const glyphs = [...text].map((ch) => (ch === '+' ? plusGlyph(metrics) : fontGlyph(ch, metrics)));
  const advances = [];
  let x = 0;
  glyphs.forEach((gl, i) => { if (i) x += metrics.track; advances.push(x); x += gl.w; });
  const rise = Math.max(...glyphs.map((gl) => gl.rise)), down = Math.max(...glyphs.map((gl) => gl.h - gl.rise));
  const body = glyphGrid(x, rise + down);
  glyphs.forEach((gl, i) => {
    for (let j = 0; j < gl.h; j++) for (let k = 0; k < gl.w; k++) if (gl.body.at(k, j)) body.set(advances[i] + k, rise - gl.rise + j);
  });
  return { body, w: x, rise, advances, glyphs };
}

// Draws the characters from `from` on, as drawText would ('ink': a 1 px ink line; 'rimmed': a rim of `edge` then ink).
function drawNumber(g, nb, from, x, base, { colour, outline, edge }) {
  const s = new Surface(g.w, g.h), cut = from < nb.advances.length ? nb.advances[from] : nb.w;
  const body = glyphGrid(nb.body.w, nb.body.h);
  for (let j = 0; j < nb.body.h; j++) for (let i = cut; i < nb.body.w; i++) if (nb.body.at(i, j)) body.set(i, j);
  const y0 = base - nb.rise;
  if (outline === 'rimmed') rimmed(s, body, x, y0, { colour, edge, ink: INK });
  else {
    for (let j = 0; j < body.h; j++) for (let i = 0; i < body.w; i++) if (body.at(i, j)) s.dot(x + i, y0 + j, colour);
    s.outline(INK);
  }
  g.blit(s);
}

export default defineSprite({
  id: 'ui-score-pop',
  name: 'Score pop',
  kind: 'Item',
  blurb: 'Points that float up where a coin was taken or an enemy fell, then sparkle away; change the number, letter style, size, outline and colours.',
  meta: {
    type: 'ui', role: 'interface/icon', themes: ['neutral'], gameTypes: ['arcade', 'platformer', 'shooter', 'roguelike-action'], view: 'none',
    words: ['score', 'points', 'bonus', 'popup', 'floating', 'combo', 'multiplier', 'reward'],
    license: 'draft',
  },
  size: [48, 32],
  pivot: PIVOT,
  grounded: false,
  params: {
    number: choice('Number', 'p100', Object.keys(NUMBERS).map((value) => ({ value, label: SAID[value] }))),
    style: choice('Style', 'chunky', [...FONT_STYLES]),
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    outline: choice('Outline', 'rimmed', ['ink', 'rimmed']),
    body: color('Numbers', P.gold, [P.gold, P.cream, P.sky, P.goblin, P.skin, P.steel], { material: 'paint' }),
    edge: color('Rim', P.soil, [P.soil, P.crimson, P.hero, P.thorn, P.leaf, P.cavern], { when: { outline: ['rimmed'] } }),
    glow: color('Sparkles', P.magic, [P.magic, P.ember, D.xp, P.moss, P.water], { material: 'light' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 1, fps: 8, loop: true, label: 'At rest' },
    rise: { frames: 8, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false, label: 'Rise and vanish' },
  },
  sounds: { rise: [{ sound: 'xp-blip', preset: 'XP shard', frame: 0, volume: 0.5 }] },
  versions: [
    { name: 'Plus hundred', params: {} },
    { name: 'Plus ten, small', params: { number: 'p10', size: 0, body: P.cream } },
    { name: 'Plus thousand', params: { number: 'p1000', size: 1, edge: P.crimson } },
    { name: 'Double', params: { number: 'x2', body: P.sky, edge: P.hero, style: 'rounded' } },
    { name: 'Plus fifty serif', params: { number: 'p50', style: 'serif', body: P.goblin, outline: 'ink' } },
  ],

  render(g, { clip, frame, p }) {
    const text = NUMBERS[p.number], metrics = fontMetrics(p.size, p.style), nb = numberBody(text, metrics);
    const x = PIVOT[0] - Math.floor(nb.w / 2);
    const up = clip === 'rise' ? RISE[frame] : 0, base = PIVOT[1] - up;
    // frames 6 and 7: the first characters (half of them, then all) are sparkles
    const gone = clip === 'rise' && frame >= 6 ? (frame === 6 ? Math.ceil(text.length / 2) : text.length) : 0;
    if (gone < text.length) {
      drawNumber(g, nb, gone, x, base, { colour: clip === 'rise' && frame === 0 ? '#ffffff' : p.body, outline: p.outline, edge: p.edge });
    }
    for (let i = 0; i < gone; i++) {
      const gl = nb.glyphs[i], cx = x + nb.advances[i] + Math.floor(gl.w / 2), cy = base - Math.ceil(gl.rise / 2);
      // a big sparkle where the character was, a smaller one as it fades
      twinkle(g, cx, cy - (frame === 7 ? 1 : 0), frame === 6 && i >= gone - 1 ? 2 : 1, p.glow);
    }
  },
});
