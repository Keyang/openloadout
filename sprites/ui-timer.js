// Timer (core-sprites-3, batch K22): a HUD strip one row of digits tall. A case with a small clock at its left and
// a row of digit windows (engine/counters.js), showing a sample time (30, 1:30 or 01:30 by format):
//   idle   the sample time at rest
//   tick   the colon blinks (off on frames 4 to 7); in seconds the last digit's top row is lit white on frames 0 to 3
//          (white stands 0.19 or more in OKLab off every Digits swatch; their own light tones are as close as 0.08)
//   warn   time is short: the digits in danger red, white on frames 0 and 1, shaken 1 px left (2) and right (6)
//   frame  the empty case, for the game's own digits: its windows are the text areas (white text)
// The case never moves: counterPlate always gets the frame less its 1 px border (x 1 to 62, y 1 to 22). Only the
// digits move, inside their windows. Digits are drawn here on purpose (a deviation from style guide section 8):
// idle, tick and warn are samples (noText); the frame clip draws none. The colon (minutes, clock): the two windows
// either side are joined by a bridge of the window inside (engine/counter-colon.js), in every clip, and the colon's
// dots are 2 px wide with face on each side, so '1:30' does not read as '130' at game size.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp } from '../engine/motion.js';
import { ramp, INK } from '../engine/color.js';
import { PALETTE } from '../engine/palettes.js';
import { Surface } from '../engine/surface.js';
import { skinSwatches, SKIN_TEXT } from '../engine/ui-skins.js';
import { fontMetrics, fontGlyph } from '../engine/pixel-font.js';
import { COUNTER_STYLES, clockIn } from '../engine/counters.js';
import { windowDigit, windowPen } from '../engine/counter-digits.js';
import { bridgeColonGap, wideCounterColon } from '../engine/counter-colon.js';
import { styledCounterPlate } from '../engine/counter-styles.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const SIZE = [64, 24];
const CASE = { x: 1, y: 1, w: 62, h: 22 };     // the frame less its 1 px border, in every clip and format
const BORDER = 0.5;                            // a 2 px band
const INSIDE = 1 + (1 + Math.round(BORDER)) + 1;   // ink, band, ink: where the case's inside starts
const LEAD = 11;                               // the clock: its ink circle shares the case's inner ink on the left
const FORMATS = { seconds: { sample: '30', colon: -1 }, minutes: { sample: '130', colon: 1 }, clock: { sample: '0130', colon: 2 } };
const FACES = skinSwatches('flat', { face: [P.cavern, P.soil, D.plate, H.bandit] }).face;

function plate(g, p) {
  const f = FORMATS[p.format];
  const out = styledCounterPlate(g, CASE.x, CASE.y, CASE.w, CASE.h, {
    count: f.sample.length, metrics: fontMetrics(p.size, 'chunky'), style: p.style, face: p.face, frame: p.frame,
    border: BORDER, colon: f.colon, lead: p.icon ? LEAD : 0,
  });
  if (f.colon > 0) bridgeColonGap(g, out.windows, f.colon);
  return out;
}

// The clock: a 1 px ink circle, the dial in the Windows colour, the ring and hands (a quarter past twelve) in cream.
function clock(g, p) {
  const cx = CASE.x + INSIDE + 5, cy = CASE.y + INSIDE + 7;
  g.ellipse(cx, cy, 6, 6, INK, { shade: 0 });
  g.ellipse(cx, cy, 5, 5, p.face, { shade: 0 });
  g.fill(cx - 5, cy - 5, cx + 5, cy + 5, clockIn(cx, cy, 5, { hour: 0.25 / 12, minute: 0.25 }), P.cream);
}

// Crimson alone is about 1.5 to 1 on the Windows colours, so the warn digits get a lit edge: every body pixel with
// no body pixel above it or to its left in the crimson's light tone (3.1 to 1 or more on every Windows swatch).
// Drawn from the glyph's body (engine/pixel-font.js), at the place windowDigit puts it, clipped to the window.
function warnDigit(g, win, ch, metrics, dx, colour, light) {
  const gl = fontGlyph(ch, metrics), pen = windowPen(win, ch, metrics), x0 = pen.x + dx, y0 = pen.base - gl.rise;
  for (let j = 0; j < gl.h; j++) for (let i = 0; i < gl.w; i++) {
    const x = x0 + i, y = y0 + j;
    if (!gl.body.at(i, j) || x < win.x || y < win.y || x >= win.x + win.w || y >= win.y + win.h) continue;
    g.dot(x, y, !gl.body.at(i, j - 1) || !gl.body.at(i - 1, j) ? light : colour);
  }
}

export default defineSprite({
  id: 'ui-timer',
  name: 'Timer',
  kind: 'Item',
  blurb: 'A countdown or lap timer for the screen: a small clock beside the time, a colon that blinks and red digits that flash and shake when time is short, plus the empty case for the game\'s own digits; change the style, format, size, clock and colours.',
  meta: {
    type: 'ui', role: 'interface/panel', themes: ['neutral'], gameTypes: ['arcade', 'racing', 'puzzle', 'platformer'], view: 'none',
    words: ['timer', 'clock', 'countdown', 'time', 'seconds', 'hud', 'hurry', 'stopwatch'],
    license: 'draft',
  },
  size: SIZE,
  pivot: [32, 12],
  grounded: false,
  params: {
    style: choice('Style', 'plate', [...COUNTER_STYLES]),
    format: choice('Format', 'minutes', ['seconds', 'minutes', 'clock']),
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    icon: toggle('Clock face', true),
    face: color('Windows', P.cavern, FACES),
    frame: color('Case', P.cream, [P.cream, P.sky, P.goblin, P.steel, P.skin], { material: 'paint' }),
    glow: color('Digits', P.magic, [P.magic, P.gold, P.moss, D.cyan, H.heal], { material: 'light' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 1, fps: 8, loop: true, label: 'Showing a time', noText: true },
    tick: { frames: 8, fps: (p) => 8 * lerp(0.65, 1.45, p.speed), loop: true, label: 'Ticking', noText: true },
    warn: { frames: 8, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: true, label: 'Running out', noText: true },
    frame: { frames: 1, fps: 8, loop: true, label: "Empty, for the game's own digits" },
  },
  sounds: {
    tick: [{ sound: 'timer-tick', preset: 'Clock', frame: 0, volume: 0.45 }],
    warn: [{ sound: 'timer-tick', preset: 'Bomb timer', frame: 0, volume: 0.6 }],
  },
  versions: [
    { name: 'Clock', params: {} },
    { name: 'Seconds', params: { format: 'seconds', size: 1 } },
    { name: 'Long clock', params: { format: 'clock', icon: false, style: 'strip' } },
    { name: 'Mint drum', params: { style: 'drum', glow: H.heal, face: P.soil } },
    { name: 'Wine and rose', params: { face: H.bandit, frame: P.skin, glow: P.gold } },
  ],
  // The empty windows of the frame clip: where a game prints its time, white, checked against the band.
  textArea(clip, p) {
    if (clip !== 'frame') return null;
    const out = plate(new Surface(...SIZE), p);
    return out.text.map((r) => ({ ...r, text: SKIN_TEXT.flat, edge: out.edge }));
  },

  render(g, { clip, frame, p }) {
    const { windows } = plate(g, p), metrics = fontMetrics(p.size, 'chunky'), f = FORMATS[p.format];
    if (p.icon) clock(g, p);
    if (clip === 'frame') return;
    const warn = clip === 'warn';
    const colour = warn ? (frame <= 1 ? '#ffffff' : P.crimson) : p.glow;
    const dx = warn ? (frame === 2 ? -1 : frame === 6 ? 1 : 0) : 0;
    const lit = clip === 'tick' && p.format === 'seconds' && frame <= 3 ? '#ffffff' : undefined;
    if (warn && frame > 1) {
      // the danger red, with a lit edge; the colon's dots are in the light tone
      const light = ramp(P.crimson).light;
      windows.forEach((win, i) => warnDigit(g, win, f.sample[i], metrics, dx, colour, light));
      if (f.colon > 0) wideCounterColon(g, windows, f.colon, metrics, { colour: light });
      return;
    }
    windows.forEach((win, i) => windowDigit(g, win, f.sample[i], metrics, { colour, dx, lit: i === windows.length - 1 ? lit : undefined }));
    if (f.colon > 0 && !(clip === 'tick' && frame >= 4)) wideCounterColon(g, windows, f.colon, metrics, { colour });
  },
});
