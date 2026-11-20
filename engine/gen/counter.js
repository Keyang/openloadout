// Counter generators (family "ui"): the case of a small number counter with its row of digit windows, the digits that
// stand, roll or jump in those windows, and the stat picture beside them. The look of the counters of the Gridline kit
// (bundles/specs/kit-puzzle-gridline.md, `ui-stat-counter`). Ports of engine/counters.js (counterWindows, counterPlate,
// rollDigit), engine/counter-styles.js (styledCounterPlate) and engine/counter-digits.js (windowDigit) that RETURN
// STAMPS, the default pixel for pixel; the pictures are what the specification's statMarkIn ("engine/blocks.js", never
// carried over) drew, written from the reviewed renders.
//
//   { "gen": "ui.counter", "v": 1, "at": [1, 1], "width": 62, "height": 22, "count": 3, "style": "strip", "picture": 13, "face": "face", "frame": "frame" }
//   { "gen": "ui.counter.digits", "v": 1, "at": [1, 1], "width": 62, "height": 22, "count": 3, "style": "strip", "picture": 13, "value": 12, "paint": "glow" }
//   { "gen": "ui.counter.mark", "v": 1, "name": "level", "at": [4, 5], "paint": "glow" }
//
// THE CASE, from the outside in: 1 px ink · the frame band, 1 or 2 px (`band`), lit along the top and right and dark
// along the bottom and left · 1 px ink · the inside, in the frame's dark tone. The digit windows are right-aligned
// inside it, each a digit and 1 px wide and tall all round; `picture` keeps a square window at the left for a picture
// (its top-left pixel is counterLayout().picture), with a row of 2 px studs in the frame's deepest tone between the two.
// THE STYLES: plate (a separate sunken window per digit, a column of the case between them when they fit), strip (one
// unbroken window with a lit top edge), drum (barrel windows two rows taller with cut corners and shaded bands at the
// top and bottom, a lit ridge of the case between drums).
// ui.counter.digits@1 is given the same at, width, height, band, count, big, style and picture as the case it stands in,
// so it finds the same windows (counterLayout); every digit is cropped to its own window, so nothing ever lies on the case.
//
// MEASURE (measureCounter; engine/gen/ui-pieces.js UI_MEASURES): with a `text` paint the case gives its windows as text
// areas (Contract 8): the flat rectangles of face a game prints its own digits into, in that colour.
//
// Pure: no surface, no clock, no randomness. Runs the same in the browser and in Node.
import { defineGenerator } from './registry.js';
import { point, count, share, word, paint } from './args.js';
import { Pixels, rampOf, colourOf, workCost, tilesFor } from './pixels.js';
import { roundRectIn } from '../ui.js';
import { fontMetrics, fontGlyph } from '../pixel-font.js';

/** The looks ui.counter@1 draws: plate (a sunken window per digit), strip (one long window with a lit top edge), drum (barrel windows with shaded bands). */
export const COUNTER_STYLES = Object.freeze(['plate', 'strip', 'drum']);

/** The pictures ui.counter.mark@1 draws: level (two chevrons pointing up), lines (three bars), speed (an arrow falling between speed lines), combo (two linked squares). */
export const STAT_MARKS = Object.freeze(['level', 'lines', 'speed', 'combo']);

/** How the digits of ui.counter.digits@1 move through a clip: rest (standing), roll (up to the next number, a quarter window a frame from frame 1), bump (frame 0 in the flash colour, frame 1 a pixel higher, then at rest). */
export const COUNTER_PLAYS = Object.freeze(['rest', 'roll', 'bump']);

/** The side of ui.counter.mark@1's square window in pixels: an 11 px picture and its 1 px ink line. */
export const STAT_MARK_WINDOW = 13;

// the gaps between windows each style tries, widest first (engine/counter-styles.js GAPS)
const GAPS = { plate: [3, 2, 1], strip: [1], drum: [3, 1] };

// the pictures, 11 x 11 each (# is the picture)
const MARK_ROWS = {
  level: ['...........', '.....#.....', '...#####...', '.####.####.', '###.....###', '#.........#', '.....#.....', '...#####...', '.####.####.', '###.....###', '#.........#'],
  lines: ['...........', '###########', '###########', '...........', '...........', '###########', '###########', '...........', '...........', '###########', '###########'],
  speed: ['.#..###..#.', '.#..###..#.', '.#..###..#.', '.#..###..#.', '....###....', '....###....', '.#########.', '..#######..', '...#####...', '....###....', '.....#.....'],
  combo: ['#######....', '#######....', '##...##....', '##...##....', '##..#######', '###########', '#######..##', '....##...##', '....##...##', '....#######', '....#######'],
};

const toned = (ref, by) => ({ rule: 'tone', of: colourOf(ref), by });

/**
 * Where a counter's parts are, without drawing (engine/counters.js counterWindows, engine/counter-styles.js): { box (the
 * inside of the case), windows ([{ x, y, w, h }] left to right, right-aligned in the box, centred up and down),
 * picture (the square picture window, or null), fits (false when the windows reach over the picture or out of the box),
 * metrics (the digits' font), text (the flat rectangles of face inside the windows), edge (one pixel of the frame band) }.
 * Arguments: a ({ at, width, height, band, count, big, style, picture }: the arguments ui.counter@1 and ui.counter.digits@1 share).
 */
export function counterLayout(a) {
  const x = Math.floor(a.at[0]), y = Math.floor(a.at[1]), w = a.width, h = a.height;
  const inner = a.band + 1;
  const box = { x: x + inner + 1, y: y + inner + 1, w: w - 2 * (inner + 1), h: h - 2 * (inner + 1) };
  const metrics = fontMetrics(a.big, 'chunky');
  const side = Math.max(0, a.picture), lead = side > 0 ? side + 2 : 0;
  const ww = metrics.digitW + 2, wh = metrics.cap + 2;
  const laid = (gap) => {
    const out = [];
    let wx = box.x + box.w - 1 - (a.count * ww + (a.count - 1) * gap);
    const wy = box.y + 1 + Math.floor((box.h - 2 - wh) / 2);
    for (let i = 0; i < a.count; i++) { out.push({ x: wx, y: wy, w: ww, h: wh }); wx += ww + gap; }
    return out;
  };
  const fit = (ws) => ws.every((r) => r.x - 1 >= box.x + lead && r.x + r.w + 1 <= box.x + box.w && r.y - 1 >= box.y && r.y + r.h + 1 <= box.y + box.h);
  let windows = null;
  for (const gap of GAPS[a.style] ?? [1]) { const ws = laid(gap); if (fit(ws)) { windows = ws; break; } }
  const fits = windows !== null;
  if (!windows) windows = laid(1);
  const picture = side > 0 ? { x: box.x, y: box.y + Math.floor((box.h - side) / 2), w: side, h: side } : null;
  const text = windows.map((r) => (a.style === 'drum' ? { x: r.x, y: r.y + 1, w: r.w, h: r.h - 2 } : { ...r }));
  return { box, windows, picture, fits, metrics, text, edge: { x: x + Math.floor(w / 2), y: y + 1 } };
}

/**
 * The text areas of a ui.counter@1 call (Contract 8; the panel layout writes them to the sheet): { textArea: [{ x, y, w,
 * h, colour, edge }] }, one per digit window, when the call names a `text` paint; {} when it does not (text "clear").
 * Arguments: a (the call's arguments with the generator's defaults).
 */
export function measureCounter(a) {
  if (a.text === undefined || a.text === 'clear') return {};
  const L = counterLayout(a);
  return { textArea: L.text.filter((r) => r.w > 0 && r.h > 0).map((r) => ({ ...r, colour: a.text, edge: { ...L.edge } })) };
}

// the arguments the case and its digits share, so both find the same windows
const geometry = () => ({
  at: point({ default: [1, 1], about: 'The top-left pixel of the case, its ink line included' }),
  width: count(16, 128, { default: 30, about: 'The case\'s width in pixels (the frame less its 1 px border)' }),
  height: count(10, 48, { default: 22, about: 'The case\'s height in pixels' }),
  band: count(1, 2, { default: 1, about: 'The frame band\'s width in pixels' }),
  count: count(1, 8, { default: 2, about: 'How many digit windows' }),
  big: share({ default: 0.5, about: 'How big the digits are (a Size slider): 5 px tall below a third, 7, then 9 from two thirds' }),
  style: word(COUNTER_STYLES, { default: 'strip', about: 'The windows: plate (one per digit), strip (one long window), drum (barrels)' }),
  picture: count(0, 24, { default: 0, about: 'The side of a square picture window kept at the left (0: none; 13 for ui.counter.mark)' }),
});

/**
 * ui.counter@1: the case of a counter filling the box `width` x `height` whose top-left pixel is `at`, with `count`
 * digit windows in `style`, right-aligned, sized by `big`, a square `picture` window at the left and studs between the
 * two. Colours: `frame` (the band's ramp; the inside is its dark tone, the studs its deepest), `face` (the windows;
 * the strip's lit edge and the drum's bands are tones of it), `ink`. `text`, a paint, makes the windows text areas in
 * that colour (measureCounter). The frame of a clip never changes it. Port of counterPlate and styledCounterPlate.
 */
export const uiCounter = defineGenerator({
  id: 'ui.counter', v: 1, family: 'ui',
  about: 'A counter\'s case with a row of digit windows (separate plates, one strip or barrel drums), a square window for a picture at the left and studs between them.',
  args: {
    ...geometry(),
    corner: count(0, 3, { default: 2, about: 'How round the case\'s corners are, in pixels' }),
    face: paint({ about: 'The windows' }),
    frame: paint({ about: 'The case (its ramp gives the band, the inside and the studs)' }),
    ink: paint({ default: 'ink', about: 'The lines round the case and the windows' }),
    text: paint({ default: 'clear', about: 'The colour a game prints its own digits in: makes each window a text area (clear: none, the windows show sample digits)' }),
  },
  cost: (a) => tilesFor(a.width, a.height) + workCost(a.width * a.height * 12),
  run(a) {
    const x = Math.floor(a.at[0]), y = Math.floor(a.at[1]), w = a.width, h = a.height;
    const g = new Pixels(x, y, w, h), F = rampOf(a.frame), L = counterLayout(a), { box, windows } = L;
    const rr = (d) => roundRectIn(x + d, y + d, w - 2 * d, h - 2 * d, Math.max(0, a.corner - d));
    const rect = (rx, ry, rw, rh, c) => { for (let py = ry; py < ry + rh; py++) for (let px = rx; px < rx + rw; px++) g.set(px, py, c); };
    // the case: ink, the band lit along the top and right, ink, the inside
    g.fill(x, y, x + w, y + h, rr(0), a.ink);
    for (let d = 1; d <= a.band; d++) {
      const inside = rr(d);
      g.fill(x, y, x + w, y + h, inside, F.base);
      g.fill(x, y, x + w, y + h, (px, py) => inside(px, py) && (!inside(px, py - 1) || !inside(px + 1, py)), F.light);
      g.fill(x, y, x + w, y + h, (px, py) => inside(px, py) && (!inside(px, py + 1) || !inside(px - 1, py)) && inside(px, py - 1) && inside(px + 1, py), F.dark);
    }
    g.fill(x, y, x + w, y + h, rr(a.band + 1), a.ink);
    rect(box.x, box.y, box.w, box.h, F.dark);
    // everything inside the case stays inside it, however many digits are asked for
    const keep = new Pixels(box.x, box.y, box.w, box.h), put = rect;
    const inner = (rx, ry, rw, rh, c) => { for (let py = ry; py < ry + rh; py++) for (let px = rx; px < rx + rw; px++) if (keep.inside(px, py)) g.set(px, py, c); };
    const n = windows.length;
    if (a.style === 'plate') {
      for (const r of windows) { inner(r.x - 1, r.y - 1, r.w + 2, r.h + 2, a.ink); inner(r.x, r.y, r.w, r.h, a.face); }
    } else if (a.style === 'strip') {
      const first = windows[0], last = windows[n - 1], sx = first.x, sw = last.x + last.w - first.x;
      inner(sx - 1, first.y - 2, sw + 2, first.h + 3, a.ink);
      inner(sx, first.y - 1, sw, 1, toned(a.face, 0.6));
      inner(sx, first.y, sw, first.h, a.face);
    } else {
      const dark = toned(a.face, -1), deep = toned(dark, -1);
      for (const r of windows) {
        const X0 = r.x - 1, X1 = r.x + r.w, Y0 = r.y - 2, Y1 = r.y + r.h + 1;
        for (let py = Y0; py <= Y1; py++) for (let px = X0; px <= X1; px++) {
          if ((px === X0 || px === X1) && (py === Y0 || py === Y1)) continue;       // the outer corners stay case
          inner(px, py, 1, 1, a.ink);
        }
        for (let py = r.y - 1; py <= r.y + r.h; py++) {
          const k = py - (r.y - 1), end = r.h + 1;
          const c = k === 0 || k === end ? deep : k === 1 || k === end - 1 ? dark : a.face;
          for (let px = r.x; px < r.x + r.w; px++) {
            if ((k === 0 || k === end) && (px === r.x || px === r.x + r.w - 1)) continue;   // the inner corners: ink
            inner(px, py, 1, 1, c);
          }
        }
      }
      for (let i = 1; i < n; i++) {                                                 // a lit ridge of the case between two drums
        const p = windows[i - 1], q = windows[i], left = p.x + p.w, right = q.x - 1;
        if (right === left) inner(left, p.y - 2, 1, p.h + 4, F.light);
        else for (let px = left + 1; px < right; px++) inner(px, p.y - 1, 1, p.h + 2, F.light);
      }
    }
    if (L.picture) {
      const P = L.picture;
      inner(P.x - 1, P.y - 1, P.w + 2, P.h + 2, a.ink);
      put(P.x - 1, P.y, 1, P.h, a.ink);                                             // its left line is the case's inner ink
      inner(P.x, P.y, P.w, P.h, a.face);
      // the studs: 2 x 2, 4 px apart, centred between the picture and the first window; none when the gap is too small
      const x0 = P.x + P.w + 2, x1 = windows[0].x - 3, m = Math.floor((x1 - x0 + 2) / 4);
      const start = x0 + Math.floor((x1 - x0 - (4 * m - 2)) / 2), sy = box.y + Math.floor(box.h / 2) - 1;
      for (let i = 0; i < m; i++) inner(start + 4 * i, sy, 2, 2, F.deep);
    }
    return g.stamps();
  },
});

/** The digits a counter of `count` windows shows for a number: its last `count` digits right-aligned, null in the empty windows before them. */
function shown(value, n) {
  const s = String(Math.max(0, Math.floor(value))).slice(-n);
  return [...Array(n - s.length).fill(null), ...s];
}

/** Paints one digit into window `win` of grid g, its top row `dy` px from where it stands at rest, cropped to the window (engine/counter-digits.js windowPen and windowDigit). */
function digitIn(g, win, ch, metrics, dy, ref) {
  if (ch === null) return;
  const gl = fontGlyph(String(ch), metrics);
  const x0 = win.x + Math.floor((win.w - gl.w) / 2), top = win.y + Math.floor((win.h - metrics.cap) / 2) + metrics.cap - gl.rise + dy;
  for (let j = 0; j < gl.h; j++) for (let i = 0; i < gl.w; i++) {
    const px = x0 + i, py = top + j;
    if (gl.body.at(i, j) && px >= win.x && px < win.x + win.w && py >= win.y && py < win.y + win.h) g.set(px, py, ref);
  }
}

/**
 * ui.counter.digits@1: the number `value` standing in the windows of the ui.counter@1 with the same at, width, height,
 * band, count, big, style and picture: its last `count` digits, right-aligned, the windows before them left empty, in
 * the chunky pixel font, each cropped to its window. `play` moves them by the clip's frame: rest (standing); roll (every
 * digit that differs in value + 1 rolls up a quarter of its window a frame from frame 1, the next digit following from
 * below, at rest on the next number from frame 4); bump (frame 0 in the `flash` colour, frame 1 a pixel higher, then at
 * rest). Port of windowDigit and rollDigit.
 */
export const uiCounterDigits = defineGenerator({
  id: 'ui.counter.digits', v: 1, family: 'ui',
  about: 'A number standing in the windows of a ui.counter: at rest, rolling up to the next number, or flashing and jumping a pixel; every digit cropped to its window.',
  args: {
    ...geometry(),
    value: count(0, 99999, { default: 12, about: 'The number shown (its last digits when it has more than there are windows)' }),
    play: word(COUNTER_PLAYS, { default: 'rest', about: 'How the digits move through the clip: rest, roll (to the next number) or bump (a flash, then a 1 px jump)' }),
    paint: paint({ about: 'The digits\' colour' }),
    flash: paint({ default: 'clear', about: 'Their colour on frame 0 of a bump: a light slot such as "shine" (clear: their own colour)' }),
  },
  cost: (a) => tilesFor(a.width, a.height) + workCost(a.width * a.height * 4),
  run(a, ctx) {
    const x = Math.floor(a.at[0]), y = Math.floor(a.at[1]);
    const g = new Pixels(x, y, a.width, a.height), L = counterLayout(a), frame = ctx.frame ?? 0;
    const now = shown(a.value, a.count), next = shown(a.value + 1, a.count);
    const bump = a.play === 'bump', lift = bump && frame === 1 ? -1 : 0;
    const ref = bump && frame === 0 && a.flash !== 'clear' ? a.flash : a.paint;
    const k = a.play === 'roll' ? Math.min(1, frame / 4) : 0;
    L.windows.forEach((win, i) => {
      if (k > 0 && now[i] !== next[i]) {
        const shift = Math.round(k * win.h);
        if (shift < win.h) digitIn(g, win, now[i], L.metrics, -shift, ref);
        digitIn(g, win, next[i], L.metrics, win.h - shift, ref);
      } else digitIn(g, win, now[i], L.metrics, lift, ref);
    });
    return g.stamps();
  },
});

/**
 * ui.counter.mark@1: the picture of a stat counter in the square window of STAT_MARK_WINDOW (13) px whose top-left pixel
 * is `at` (counterLayout().picture of a ui.counter with picture 13): one of STAT_MARKS, 11 px across in `paint`, with a
 * 1 px `ink` line round it, cropped to the window; the window itself is the case's. `play` bump shows it in the `flash`
 * colour on frame 0 and a pixel higher on frame 1. The look of the specification's statMarkIn.
 */
export const uiCounterMark = defineGenerator({
  id: 'ui.counter.mark', v: 1, family: 'ui',
  about: 'The picture beside a stat counter\'s digits, 11 px with an ink line in a 13 px window: level chevrons, line bars, a speed arrow or combo links.',
  args: {
    name: word(STAT_MARKS, { default: 'level', about: 'Which picture' }),
    at: point({ default: [0, 0], about: 'The top-left pixel of its 13 px window' }),
    play: word(['rest', 'bump'], { default: 'rest', about: 'rest, or bump: the flash colour on frame 0, a pixel higher on frame 1' }),
    paint: paint({ about: 'The picture\'s colour' }),
    flash: paint({ default: 'clear', about: 'Its colour on frame 0 of a bump (clear: its own colour)' }),
    ink: paint({ default: 'ink', about: 'The line round it' }),
  },
  cost: () => 1 + workCost(STAT_MARK_WINDOW * STAT_MARK_WINDOW * 10),
  run(a, ctx) {
    const S = STAT_MARK_WINDOW, x0 = Math.floor(a.at[0]), y0 = Math.floor(a.at[1]);
    const g = new Pixels(x0, y0, S, S), rows = MARK_ROWS[a.name], frame = ctx.frame ?? 0;
    const bump = a.play === 'bump', dy = bump && frame === 1 ? -1 : 0;
    const ref = bump && frame === 0 && a.flash !== 'clear' ? a.flash : a.paint;
    const on = (i, j) => rows[j - 1 - dy]?.[i - 1] === '#';                         // window pixel (i, j): the picture sits 1 px in
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      if (on(i, j)) { g.set(x0 + i, y0 + j, ref); continue; }
      let near = false;
      for (let v = -1; v <= 1 && !near; v++) for (let u = -1; u <= 1; u++) if (on(i + u, j + v)) { near = true; break; }
      if (near) g.set(x0 + i, y0 + j, a.ink);
    }
    return g.stamps();
  },
});
