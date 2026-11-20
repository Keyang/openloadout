// Text generators (family "text"; docs/data-sprites.md 3.3, "text: text primitive + font pieces; glyph ..."): the
// pixel letters of engine/pixel-font.js drawn the ways the library's interface sprites drew them, as stamps of paint
// refs. Started by migration batch M9 (the four font sheets font-chunky, font-rounded, font-serif, font-slim, and the
// score pop and word pop: port generators, engine/gen/port-sprite.js, each the drawing of its code sprite word for word).
//
// The glyphs themselves are framework data: engine/pixel-font.js builds them from its stroke tables and hand-set rows,
// and the font pieces (pieces/font-<style>.v1.json) hold the same rows as data for the `text` primitive. What these
// generators add is what the text primitive cannot do: the three sizes as a slider, the rimmed outline (an inner rim of
// the rim colour, its lower left a tone darker, inside an ink line), the 1 px drop shadow and the shine on the upper
// half of each glyph (engine/pixel-font.js drawText and engine/ui.js rimmed, ported onto engine/gen/port-surface.js).
// Pure: no randomness, no clock, no surface of the site's; Node and browser.
import { defineGenerator } from './registry.js';
import { point, share, word, flag, paint } from './args.js';
import { PortSurface, INK_P, toneP, toneOfP, portTiles, shiftTo } from './port-surface.js';
import { FONT_STYLES, FONT_CHARS, fontMetrics, fontGlyph } from '../pixel-font.js';
import { workCost } from './pixels.js';
import { portGenerator } from './port-sprite.js';
import { Surface } from './ports/surface.js';
import { INK } from './ports/colour.js';
import { PALETTE } from '../palettes.js';
import { lerp, wave, clamp } from '../motion.js';
import { textWidth, drawText } from './ports/pixel-font.js';
import { glyphGrid, rimmed } from './ports/ui.js';
import { twinkle } from './ports/fx.js';
import { textSweepIn, glyphSpots } from '../text-fx.js';

/** The rows of a font sheet, in sheet order: capitals, small letters, digits, punctuation (engine/pixel-font.js FONT_CHARS). */
export const FONT_ROWS = Object.freeze(Object.keys(FONT_CHARS));

/** The outlines a line of pixel text can have: none, a 1 px ink line, or rimmed (engine/pixel-font.js drawText). */
export const TEXT_OUTLINES = Object.freeze(['none', 'ink', 'rimmed']);

/**
 * engine/ui.js rimmed on a PortSurface: the body in `colour`, holes ink, a rim of `edge` round it (corners too) whose
 * pixels not touching the body from the left, below or below-left are a tone darker, then an ink line; with `shadow`
 * the whole 1 px down-left in ink under it. Arguments: g, body (a glyph grid), x, y, opt { colour, edge, shadow, ink }.
 */
export function rimmedOn(g, body, x, y, opt) {
  const ink = opt.ink ?? INK_P, W = g.w, H = g.h;
  const s = g.blank();
  for (let j = 0; j < body.h; j++) for (let i = 0; i < body.w; i++) if (body.at(i, j)) s.dot(x + i, y + j, opt.colour);
  const solid = Uint8Array.from(s.data, (v) => (v ? 1 : 0));
  const was = (px, py) => px >= 0 && py >= 0 && px < W && py < H && solid[py * W + px] === 1;
  const outside = new Uint8Array(W * H), todo = [0];
  outside[0] = 1;
  while (todo.length) {
    const i = todo.pop(), px = i % W, py = (i - px) / W;
    for (const [nx, ny] of [[px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]]) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || outside[ny * W + nx] || solid[ny * W + nx]) continue;
      outside[ny * W + nx] = 1; todo.push(ny * W + nx);
    }
  }
  for (let i = 0; i < W * H; i++) if (!solid[i] && !outside[i]) s.dot(i % W, (i - (i % W)) / W, ink);
  s.outline(opt.edge, { corners: true });
  const dark = toneP(opt.edge, -1);
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    if (!outside[py * W + px] || !s.get(px, py)) continue;
    if (!(was(px - 1, py) || was(px, py + 1) || was(px - 1, py + 1))) s.dot(px, py, dark);
  }
  s.outline(ink);
  if (opt.shadow) for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) if (s.get(px, py)) g.dot(px - 1, py + 1, ink);
  g.blit(s);
  return g;
}

/**
 * engine/pixel-font.js drawText for one glyph on a PortSurface, pen point (x, base): outline none, ink or rimmed, a drop
 * shadow, the shine (the rows above the glyph's middle in the colour's light tone). Arguments: g, ch, x, base, opt
 * { metrics, colour, outline, edge, shadow, shine, ink }.
 */
export function glyphOn(g, ch, x, base, { metrics, colour, outline = 'ink', edge, shadow = false, shine = false, ink = INK_P }) {
  if (ch === ' ') return g;
  const gl = fontGlyph(ch, metrics);
  const x0 = Math.round(x), y0 = Math.round(base) - gl.rise;
  const s = g.blank();
  if (outline === 'rimmed') rimmedOn(s, gl.body, x0, y0, { colour, edge, shadow, ink });
  else {
    for (let j = 0; j < gl.h; j++) for (let i = 0; i < gl.w; i++) if (gl.body.at(i, j)) s.dot(x0 + i, y0 + j, colour);
    if (outline === 'ink') s.outline(ink);
  }
  if (shine) {
    const light = toneOfP(colour, 'light'), mid = Math.floor((gl.h - 1) / 2);
    for (let j = 0; j < mid; j++) for (let i = 0; i < gl.w; i++) if (gl.body.at(i, j)) s.dot(x0 + i, y0 + j, light);
  }
  if (shadow && outline !== 'rimmed') {
    const under = g.blank();
    for (let py = 0; py < g.h; py++) for (let px = 0; px < g.w; px++) if (s.get(px, py)) under.dot(px - 1, py + 1, ink);
    under.blit(s);
    s.data.set(under.data);
  }
  g.blit(s);
  return g;
}

const CELL = [16, 20], PEN = [4, 13];

/**
 * font.cell@1: one character of a pixel font in its 16 x 20 font-sheet cell, the character chosen by the frame: frame n
 * of the call draws character n of its row (capitals, small letters, digits or punctuation), pen point (the glyph's
 * left edge on the baseline) at `at`. Port of the library font sheets' drawing (tests/fixtures/code-sprites/font-chunky.js and its three
 * siblings: engine/pixel-font.js drawText with the style, size, outline, rim colour, shadow and shine). A frame past the
 * row's last character draws nothing.
 */
export const fontCell = defineGenerator({
  id: 'font.cell', v: 1, family: 'text',
  about: 'One character of a pixel font in a 16 x 20 font-sheet cell, frame n drawing character n of a row (capitals, small letters, digits, punctuation): size, outline, rim, shadow and shine.',
  args: {
    at: point({ about: 'The pen point: the glyph\'s left edge on the baseline' }),
    style: word([...FONT_STYLES], { default: 'chunky', about: 'The letters: chunky, slim, rounded or serif' }),
    row: word([...FONT_ROWS], { default: 'upper', about: 'Which characters: capitals, small letters, digits or punctuation; frame n draws the row\'s character n' }),
    size: share({ default: 0.5, about: 'Small (5 px capitals), middle (7) or big (9)' }),
    outline: word([...TEXT_OUTLINES], { default: 'ink', about: 'No outline, an ink line, or a rim of the rim colour inside an ink line' }),
    paint: paint({ about: 'The letters\' colour' }),
    edge: paint({ default: 'ink', about: 'The rim\'s colour (rimmed only)' }),
    shadow: flag({ default: false, about: 'A 1 px ink drop shadow down and to the left' }),
    shine: flag({ default: false, about: 'The upper half of each glyph in the colour\'s light tone' }),
  },
  cost: () => portTiles(...CELL) + 30,   // review M9 round 1, issue 5: its heaviest call measured (tests/unit/gen-m9-safety.test.mjs); was 4 for the shape tests alone
  run(a, ctx) {
    const chars = FONT_CHARS[a.row];
    const n = Number.isInteger(ctx.frame) ? ctx.frame : 0;
    if (n < 0 || n >= chars.length) return [];
    const g = new PortSurface(...CELL);
    glyphOn(g, chars[n], PEN[0], PEN[1], {
      metrics: fontMetrics(a.size, a.style), colour: a.paint, outline: a.outline, edge: a.edge, shadow: a.shadow, shine: a.shine,
    });
    return g.stamps(shiftTo(a.at, ...PEN));
  },
});

// ---- score.pop@1 (tests/fixtures/code-sprites/ui-score-pop.js) ---------------------------------------------------------

/** score.pop@1: Points that float up where a coin was taken or an enemy fell, then sparkle away (port of tests/fixtures/code-sprites/ui-score-pop.js). */
export const scorePopPort = (() => {
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
  return portGenerator({
    id: 'score.pop', family: 'text', units: 100, size: [48, 32], origin: [24, 16],
    states: { idle: { frames: 1 }, rise: { frames: 8, loop: false } },
    about: 'Points that float up where a coin was taken or an enemy fell, then sparkle away.',
    args: {
      number: word(['p10', 'p50', 'p100', 'p500', 'p1000', 'x2', 'x5'], { default: 'p100', about: 'Number' }),
      style: word(['chunky', 'slim', 'rounded', 'serif'], { default: 'chunky', about: 'Style' }),
      size: share({ default: 0.5, about: 'Size: Small to Big' }),
      outline: word(['ink', 'rimmed'], { default: 'rimmed', about: 'Outline' }),
      body: paint({ about: 'Numbers' }),
      edge: paint({ about: 'Rim' }),
      lit: paint({ about: 'Sparkles' }),
    },
    draw(g, { clip, frame, p }) {
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
      twinkle(g, cx, cy - (frame === 7 ? 1 : 0), frame === 6 && i >= gone - 1 ? 2 : 1, p.lit);
    }
  },
  });
})();


// ---- word.pop@1 (tests/fixtures/code-sprites/ui-word-pop.js) -----------------------------------------------------------

/** word.pop@1: Words a game flashes at the player (Ready, Go!, Level up, Clear, Combo, Bonus, Perfect, Game over) that drop in letter by letter, bob while they show and break into sparkles (port of tests/fixtures/code-sprites/ui-word-pop.js). */
export const wordPopPort = (() => {
  const P = PALETTE.thornwood, D = PALETTE.derelict;
  const W = 96, MID = 16;
  const WORDS = { ready: 'READY', go: 'GO!', 'level-up': 'LEVEL UP', clear: 'CLEAR', combo: 'COMBO', bonus: 'BONUS', perfect: 'PERFECT', 'game-over': 'GAME OVER' };
  const WHITE = '#ffffff';

  // The line for this look: its text, metrics, pen point and baseline, and each letter's spot.
  function line(p) {
    const text = WORDS[p.word], m = fontMetrics(p.size, p.style), w = textWidth(text, m);
    const x = (W >> 1) - (w >> 1), base = MID + Math.ceil(m.cap / 2);
    return { text, m, w, x, base, spots: glyphSpots(text, m) };
  }
  const draw = (g, L, p, text, x, offsets) => drawText(g, text, x, L.base, {
    metrics: L.m, colour: p.body, outline: p.outline, edge: p.edge, shadow: p.shadow, offsets,
  });
  // rises per character (spaces included, as drawText counts them) from a rise per letter
  const perChar = (L, rise) => { const o = new Array(L.text.length).fill(0); L.spots.forEach((s, j) => { o[s.index] = rise(j); }); return o; };
  return portGenerator({
    id: 'word.pop', family: 'text', units: 200, size: [96, 32], origin: [48, 16],
    states: { idle: { frames: 8 }, pop: { frames: 8, loop: false }, leave: { frames: 6, loop: false } },
    about: 'Words a game flashes at the player (Ready, Go!, Level up, Clear, Combo, Bonus, Perfect, Game over) that drop in letter by letter, bob while they show and break into sparkles.',
    args: {
      word: word(['ready', 'go', 'level-up', 'clear', 'combo', 'bonus', 'perfect', 'game-over'], { default: 'ready', about: 'Word' }),
      style: word(['chunky', 'slim', 'rounded', 'serif'], { default: 'chunky', about: 'Style' }),
      size: share({ default: 1, about: 'Size: Small to Big' }),
      outline: word(['ink', 'rimmed'], { default: 'rimmed', about: 'Outline' }),
      shadow: flag({ default: true, about: 'Shadow' }),
      body: paint({ about: 'Letters' }),
      edge: paint({ about: 'Rim' }),
      lit: paint({ about: 'Sparkles' }),
      bounce: share({ default: 0.5, about: 'Bounce: Calm to Bouncy' }),
    },
    draw(g, { clip, frame, t, p }) {
    const L = line(p), n = L.spots.length;
    if (clip === 'idle') {
      // each letter on its own phase, 1 px (Calm) to 2 px (Bouncy) up from the baseline
      const A = lerp(1, 2, p.bounce);
      draw(g, L, p, L.text, L.x, perChar(L, (j) => Math.round(A * (0.5 + 0.5 * wave(t, j / Math.max(n, 1) + 0.25)))));
      return;
    }
    if (clip === 'pop') {
      if (frame === 0) {
        // a white twinkle where the word will stand, four sparkles round it
        const cx = W >> 1, cy = L.base - Math.ceil(L.m.cap / 2);
        twinkle(g, cx, cy, 2, WHITE);
        for (const [dx, dy] of [[-3, -2], [3, -2], [-3, 2], [3, 2]]) g.dot(cx + dx, cy + dy, p.lit);
        return;
      }
      if (frame <= 4) {
        // two letters a frame, each arriving 3 px up; the pair before drops to 1 px, the rest stand on the baseline
        const shown = Math.min(n, 2 * frame), last = L.spots[shown - 1];
        const rise = (j) => (j >= 2 * frame - 2 ? 3 : j >= 2 * frame - 4 ? 1 : 0);
        draw(g, L, p, L.text.slice(0, last.index + 1), L.x, perChar(L, rise).slice(0, last.index + 1));
        return;
      }
      // settled: a 2 px glint runs across the word, left to right, over frames 5 to 7
      draw(g, L, p, L.text, L.x);
      const at = Math.round(lerp(0, L.w + Math.ceil(L.m.cap / 2), (frame - 4.5) / 3)) - 1;
      g.fill(L.x - 1, 0, L.x + L.w + 1, 32, textSweepIn(L.text, L.m, L.x, L.base, at, { width: 2 }), WHITE);
      return;
    }
    // leave: letter j starts dropping at its turn, falls 1 to 4 px, then breaks into a twinkle of sparkles
    const life = (j) => clamp((t - (0.45 * j) / Math.max(n - 1, 1)) / 0.55, 0, 1);
    const gone = L.spots.filter((s, j) => life(j) >= 0.5).length;
    if (gone < n) {
      const first = L.spots[gone], drop = (j) => (life(j) > 0 ? -Math.round(lerp(1, 4, life(j) / 0.5)) : 0);
      draw(g, L, p, L.text.slice(first.index), L.x + first.x, perChar(L, drop).slice(first.index));
    }
    L.spots.forEach((s, j) => {
      const u = life(j);
      if (u < 0.5) return;
      // a twinkle that shrinks from 2 to 1, and a spark beside it while it is big
      const x = L.x + Math.floor(s.cx), y = L.base + Math.floor(s.cy) + 4, big = u < 0.8;
      twinkle(g, x, y, big ? 2 : 1, p.lit);
      if (big) g.dot(x + (j % 2 ? -3 : 3), y - 3, p.lit);
    });
  },
  });
})();

