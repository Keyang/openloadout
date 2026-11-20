// The mode signs of a falling-block game (the Gridline kit; bundles/specs/kit-puzzle-gridline.md, `icons-gridline-modes`):
// icon.mode@1 draws one of the eight pictures of a mode-select screen, made of puzzle cells (block.cell@2 of
// engine/gen/block.js: the one block face) and thin marks in one colour. Port of the layouts of the code sprite
// sprites/icons-gridline-modes.js and of what it used of engine/icons.js (iconFit, iconLine, iconHoop, iconArrow,
// iconStreaks, iconBold, iconOver, iconGlint, iconTidy) and engine/counters.js (clockIn).
//
//   { "gen": "icon.mode", "v": 1, "name": "endless", "at": [16, 16], "size": { "from": "size", "map": [[0, 0], [1, 1]] },
//     "span": { "from": "backing", "pick": { "none": [20, 26], "hex": [18, 22], "circle": [18, 22] } },
//     "bold": { "from": "bold", "pick": { "true": true, "false": false } }, "cell": "body", "paint": "accent" }
//
// THE SIGNS, so no two are told apart by colour alone: endless (a column of three cells with an arrow looping round
// it), sprint (a cell with speed lines behind it and a tick above), timed (a cell in front of a clock), versus (two
// stacks with a zigzag between), calm (a cell on two wave lines), daily (a calendar card holding a cell), puzzle (a
// four-cell piece above a dotted slot of its shape), practice (a cell inside a target ring).
// HOW ONE IS DRAWN. Every length is a whole number of pixels worked out from one scale, so cells stay square and marks
// stay exactly 1 px thick (2 with `bold`) at every size; the scale is searched, as iconFit searches it, until the
// sign's longer side with its ink line is what `size` asks of `span`, and the sign is centred on `at`. The marks go on
// first and take one ink line; the cells go on after it, each with its own ink line; what passes in front of a cell
// (the near half of the endless loop) and the glints (`shine`) go on last. Nothing leans: a cell is a square of the
// grid. The frame of a clip never changes it.
// Pure: no surface, no clock, no randomness. Runs the same in the browser and in Node.
import { defineGenerator } from './registry.js';
import { point, share, word, flag, paint } from './args.js';
import { Pixels, rampOf, tidied, workCost, tilesFor } from './pixels.js';
import { blockCell2 } from './block.js';
import { hoopIn, arrowIn } from '../shapes.js';
import { capsuleIn } from '../surface.js';

/** The signs icon.mode@1 draws, in the order of the specification's clips. */
export const MODE_SIGNS = Object.freeze(['endless', 'sprint', 'timed', 'versus', 'calm', 'daily', 'puzzle', 'practice']);

/** How many block cells each sign of icon.mode@1 holds. */
export const MODE_SIGN_CELLS = Object.freeze({ endless: 3, sprint: 1, timed: 1, versus: 4, calm: 1, daily: 1, puzzle: 4, practice: 1 });

/** How many times icon.mode@1 may lay a sign out while it searches for the scale (engine/icons.js iconFit). */
export const MODE_FIT_PASSES = 6;

/** The side, in pixels, of the square icon.mode@1 lays a sign out in, round its own middle. */
export const MODE_ROOM = 64;

const HALF = MODE_ROOM / 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const TEE = [[0, 0], [1, 0], [2, 0], [1, 1]];                             // three across, the stem pointing down

// engine/counters.js clockIn: a ring 1 px thick and two hands from the middle (0 straight up, clockwise, in turns)
function clockIn(cx, cy, r, hour, minute) {
  const hand = (turn, len) => capsuleIn(cx, cy, cx + Math.sin(turn * 2 * Math.PI) * len, cy - Math.cos(turn * 2 * Math.PI) * len, 0.5);
  const hourHand = hand(hour, Math.max(1.5, r * 0.5)), minuteHand = hand(minute, Math.max(2, r - 1.5));
  return (px, py) => { const d = Math.hypot(px - cx, py - cy); return (d > r - 1 && d <= r) || hourHand(px, py) || minuteHand(px, py) || d < 0.75; };
}

// engine/icons.js iconBold: a shape test grown by `by` pixels on every side, corners included
function grown(f, by) {
  const d = by * Math.SQRT1_2;
  return (px, py) => f(px, py) || f(px - by, py) || f(px + by, py) || f(px, py - by) || f(px, py + by) || f(px - d, py - d) || f(px + d, py - d) || f(px - d, py + d) || f(px + d, py + d);
}

/**
 * What a sign is drawn with at scale k: `marks` (a Pixels grid round (0, 0), the sign's middle before it is centred),
 * the cells asked for (`cells`: [{ x, y, n }]), what goes over them (`over`: jobs run once the cells are known) and
 * whole-pixel lengths: u (a length of the 22-unit design), n (the side of a cell, 4 at the least).
 */
function tools(k, a) {
  const marks = new Pixels(-HALF, -HALF, MODE_ROOM, MODE_ROOM), bold = a.bold, th = bold ? 2 : 1, mark = a.paint;
  // a shape test painted flat inside the box x0..x1, y0..y1 (the whole room when none is given)
  const paintIn = (test, ref = mark, box = [-HALF, -HALF, HALF, HALF]) => marks.fill(box[0], box[1], box[2], box[3], test, ref);
  // a 1 px line through whole-pixel points (iconLine)
  const thin = (pts) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      let x0 = Math.floor(pts[i][0]), y0 = Math.floor(pts[i][1]);
      const x1 = Math.floor(pts[i + 1][0]), y1 = Math.floor(pts[i + 1][1]);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      for (let err = dx + dy, guard = 0; guard < 4 * MODE_ROOM; guard++) {
        marks.set(x0, y0, mark);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    }
  };
  return {
    marks, bold, th, mark, cells: [], over: [], paintIn,
    u: (v) => Math.round(v * k),
    n: (v) => Math.max(4, Math.round(v * k)),
    // a line through points; Bold lays a second one beside it, moved by (dx, dy)
    line(pts, dx = 0, dy = 1) { thin(pts); if (bold) thin(pts.map(([x, y]) => [x + dx, y + dy])); },
    box: (x, y, w, h, ref = mark) => { if (w > 0 && h > 0) marks.rect(Math.floor(x), Math.floor(y), w, h, ref); },
    hoop: (cx, cy, rx, ry) => paintIn(hoopIn(cx, cy, rx, ry, th), mark, [cx - rx - 1, cy - ry - 1, cx + rx + 1, cy + ry + 1]),
    cell(x, y, n) { this.cells.push({ x: Math.floor(x), y: Math.floor(y), n }); },
  };
}

// Per sign: where its parts go (lay), its marks (before the ink line) and its cells (after it). Both read the same layout.
const SIGNS = {
  endless: {
    lay(t) { const n = t.n(7), x = -Math.ceil(n / 2), y = -Math.floor((3 * n) / 2); return { n, x, y, cx: x + n / 2, cy: y + (3 * n) / 2 + (n % 2 ? 0.5 : 0), rx: Math.max(n / 2 + 4, t.u(10.5)), ry: Math.max(3, t.u(4.4)) }; },
    marks(t, at) {
      t.hoop(at.cx, at.cy, at.rx, at.ry);
      const hx = Math.floor(at.cx + at.rx) - (t.bold ? 0.5 : 1) + 0.5, hy = Math.floor(at.cy);
      t.paintIn(arrowIn(hx, hy + 1, hx, hy - (t.bold ? 4 : 3), { shaft: 0, head: t.bold ? 7 : 5, long: t.bold ? 4 : 3 }), t.mark, [hx - 5, hy - 6, hx + 5, hy + 3]);
    },
    cells(t, at) {
      for (let i = 0; i < 3; i++) t.cell(at.x, at.y + i * at.n, at.n);
      t.over.push({ test: hoopIn(at.cx, at.cy, at.rx, at.ry, t.th), clip: (px, py) => py >= at.cy, box: [at.cx - at.rx - 2, at.cy - 1, at.cx + at.rx + 2, at.cy + at.ry + 2] });   // the near half of the loop passes in front of the column
    },
  },
  sprint: {
    lay(t) { const n = t.n(9); return { n, x: t.u(1), y: -t.u(2) }; },
    marks(t, { n, x, y }) {
      const rows = [[y, t.u(9)], [y + Math.floor((n - t.th) / 2), t.u(11)], [y + n - t.th, t.u(7)]];
      if (t.bold && n < 8) rows.splice(1, 1);                              // three thick lines would run together on a small cell
      const h = t.th / 2;
      for (const [row, len] of rows) t.paintIn(capsuleIn(x - 2 - len + 0.7, row + h, x - 1 - h, row + h, 0.7, h), t.mark, [x - 4 - len, row - 2, x + 1, row + 4]);
      const a = t.u(2), b = Math.max(3, t.u(5));
      t.line([[x + 1, y - 2 - a], [x + 1 + a, y - 2], [x + 1 + a + b, y - 2 - b]], 0, -1);
    },
    cells(t, { n, x, y }) { t.cell(x, y, n); },
  },
  timed: {
    lay(t) { const n = t.n(9), r = Math.max(4, t.u(7)); return { n, r, x: -t.u(11), y: t.u(1), cx: t.u(4) + 0.5, cy: -t.u(3) + 0.5 }; },
    marks(t, { r, cx, cy }) {
      const face = clockIn(cx, cy, r + 0.4, 0.29, 0);
      t.paintIn(t.bold ? grown(face, 0.5) : face, t.mark, [cx - r - 3, cy - r - 3, cx + r + 3, cy + r + 3]);
      t.box(Math.floor(cx) - (t.bold ? 1 : 0), Math.floor(cy) - r - 2 - (t.bold ? 1 : 0), t.bold ? 3 : 1, 2);   // the winder on top
    },
    cells(t, { n, x, y }) { t.cell(x, y, n); },
  },
  versus: {
    lay(t) { const n = t.n(7), d = Math.max(3, t.u(4)); return { n, d, xl: -d - n, xr: d, y: -n + t.u(2) }; },
    marks(t, { n, y }) {
      const top = y - Math.max(2, t.u(4)), mid = y + n - 1, end = y + 2 * n - 1;
      t.line([[0, top], [-2, mid], [1, mid], [-1, end]], 1, 0);
    },
    cells(t, { n, xl, xr, y }) { for (const x of [xl, xr]) for (let i = 0; i < 2; i++) t.cell(x, y + i * n, n); },
  },
  calm: {
    lay(t) { const n = t.n(10); return { n, x: -Math.floor(n / 2), y: -t.u(9) }; },
    marks(t, { n, y }) {
      const wave = (yw, half, shift) => {
        const pts = [];
        for (let x = -half; x <= half; x++) { const q = (((x + shift) % 8) + 8) % 8; pts.push([x, yw + (q < 3 ? 0 : q === 3 || q === 7 ? 1 : 2)]); }
        if (pts.length > 1) t.line(pts, 0, 1);
      };
      wave(y + n + 1, t.u(11), 1);
      wave(y + n + 5 + (t.bold ? 1 : 0), t.u(7), 5);
    },
    cells(t, { n, x, y }) { t.cell(x, y, n); },
  },
  daily: {
    lay(t) { const n = t.n(8), w = 2 * Math.max(1, t.u(9)), h = Math.max(2, t.u(19)), x = -w / 2, y = -Math.floor(h / 2) + 1, head = Math.max(3, t.u(4)) + (t.bold ? 1 : 0); return { n, w, h, x, y, head }; },
    marks(t, { w, h, x, y, head }) {
      const R = rampOf(t.mark), peg = Math.max(2, t.u(4));
      t.marks.rect(x, y, w, h, R);                                         // the card, a dark band along its left and bottom
      t.box(x, y, w, Math.min(head, h), R.dark);
      for (const px of [x + peg, x + w - peg - t.th]) t.box(px, y - 2, t.th, 2 + Math.min(2, head - 1), R.light);   // the two binding rings
    },
    cells(t, { n, w, h, x, y, head }) { t.cell(x + (w - n) / 2, y + head + Math.max(1, Math.floor((h - head - n) / 2)), n); },
  },
  puzzle: {
    lay(t) { const n = t.n(5.4), gap = Math.max(2, t.u(2)), x = -Math.floor((3 * n) / 2), y = -2 * n - Math.floor(gap / 2); return { n, x, y, sy: y + 2 * n + gap }; },
    marks(t, { n, x, sy }) {
      const d = t.th, rects = TEE.map(([c, r]) => [x + c * n, sy + r * n]);
      const whole = (px, py) => rects.some(([a, b]) => px >= a && px < a + n && py >= b && py < b + n);
      const rim = (px, py) => whole(px, py) && !(whole(px - d, py) && whole(px + d, py) && whole(px, py - d) && whole(px, py + d) && whole(px - d, py - d) && whole(px + d, py - d) && whole(px - d, py + d) && whole(px + d, py + d));
      const dash = (px, py) => Math.floor((px - x + py - sy) / 2) % 2 === 0;
      const box = [x - 1, sy - 1, x + 3 * n + 1, sy + 2 * n + 1];
      t.paintIn(whole, t.ink, box);                                       // the hollow, and round it the dashed line
      t.paintIn((px, py) => dash(px, py) && rim(px, py), t.mark, box);
    },
    cells(t, { n, x, y }) { for (const [c, r] of TEE) t.cell(x + c * n, y + r * n, n); },
  },
  practice: {
    lay(t) { const n = 2 * Math.max(2, Math.round(t.u(8) / 2)), r = Math.max(n / 2 + 4, t.u(11)); return { n, r }; },
    marks(t, { n, r }) {
      t.hoop(0, 0, r, r);
      const len = Math.max(2, Math.min(r - n / 2 - 3, t.u(3))), h = t.th, o = Math.floor(-(t.bold ? 1 : 0.5));   // where a nub starts across its width
      t.box(o, -r, h, len + h); t.box(o, r - len - h, h, len + h);
      t.box(-r, o, len + h, h); t.box(r - len - h, o, len + h, h);
    },
    cells(t, { n }) { t.cell(-n / 2, -n / 2, n); },
  },
};

/** One sign laid out at scale k: its marks with their ink line, its cells, what goes over them, and the box of it all (null when nothing is drawn). */
function laid(k, a) {
  const t = tools(k, a), sign = SIGNS[a.name];
  t.ink = a.ink;
  const at = sign.lay(t);
  sign.marks(t, at);
  tidied(t.marks);
  const g = t.marks, hits = [];
  for (let y = g.y0; y < g.y0 + g.h; y++) for (let x = g.x0; x < g.x0 + g.w; x++) {
    if (!g.has(x, y) && (g.has(x - 1, y) || g.has(x + 1, y) || g.has(x, y - 1) || g.has(x, y + 1))) hits.push([x, y]);
  }
  for (const [x, y] of hits) g.set(x, y, a.ink);
  sign.cells(t, at);
  const b = g.bounds() ?? { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const c of t.cells) { b.x0 = Math.min(b.x0, c.x); b.y0 = Math.min(b.y0, c.y); b.x1 = Math.max(b.x1, c.x + c.n - 1); b.y1 = Math.max(b.y1, c.y + c.n - 1); }
  return { t, box: Number.isFinite(b.x0) ? b : null };
}

/**
 * icon.mode@1: one sign of a falling-block game's mode-select screen (`name`, one of MODE_SIGNS), centred on `at`, its
 * longer side with the ink line round(span[0] + (span[1] - span[0]) * size) pixels (searched as engine/icons.js iconFit
 * searches it, in at most MODE_FIT_PASSES layouts; a sign whose whole-pixel steps miss that size takes the nearest it
 * has, the smaller of two as near). Its cells are block.cell@2 bevel cells in `cell`; its marks (arrows, rings, lines,
 * the clock, the card) are `paint` with one `ink` line, 1 px thick or 2 with `bold`; `shine` (a paint; clear for none)
 * puts a white stroke on every cell and, on cells 7 px and more, the cell's own corner L. Arguments: name, at, size,
 * span, bold, cell, paint, shine, ink.
 */
export const iconMode = defineGenerator({
  id: 'icon.mode', v: 1, family: 'icon',
  about: 'A sign for a falling-block game\'s mode-select screen in whole pixels: block cells with thin marks (endless, sprint, timed, versus, calm, daily, puzzle, practice), fitted to a size.',
  args: {
    name: word(MODE_SIGNS, { default: 'endless', about: 'Which sign' }),
    at: point({ default: [16, 16], about: 'Its middle (the frame\'s middle for an icon)' }),
    size: share({ default: 0.5, about: 'Small to Big: the longer side from span[0] to span[1] pixels' }),
    span: point({ default: [20, 26], lo: 8, hi: 32, about: 'The longer side at Small and at Big, ink line included ([18, 22] fits inside a plate)' }),
    bold: flag({ default: false, about: 'Arrows, rings, lines and the clock 2 px thick instead of 1' }),
    cell: paint({ about: 'The block cells (its ramp gives the bevel)' }),
    paint: paint({ about: 'The marks: arrows, rings, lines, the clock, the card' }),
    shine: paint({ default: 'clear', about: 'A glint on every cell: a light slot such as "shine" (clear: none)' }),
    ink: paint({ default: 'ink', about: 'The line round the marks and the cells' }),
  },
  // the marks' stamps and the lights' (the room each), a stamp a cell, and every layout's shape tests over the room
  // (measured warm: 1 to 5 ms a call, so charged at 32 tests a pixel of the room a layout)
  cost: () => 2 * tilesFor(MODE_ROOM, MODE_ROOM) + 4 + workCost(MODE_FIT_PASSES * MODE_ROOM * MODE_ROOM * 32),
  run(a, ctx) {
    const want = Math.max(4, Math.round(a.span[0] + (a.span[1] - a.span[0]) * clamp01(a.size)));
    let scale = (want - 2) / 22, best = null, lo = 0, hi = Infinity;
    for (let pass = 0; pass < MODE_FIT_PASSES; pass++) {
      const d = laid(scale, a);
      if (!d.box) return [];
      const side = Math.max(d.box.x1 - d.box.x0 + 1, d.box.y1 - d.box.y0 + 1);
      if (!best || Math.abs(side - want) < Math.abs(best.side - want) || (Math.abs(side - want) === Math.abs(best.side - want) && side < best.side)) best = { ...d, side };
      if (side === want) break;
      if (side < want) lo = Math.max(lo, scale); else hi = Math.min(hi, scale);
      // first a proportional step; once the answer is bracketed, halve the bracket
      scale = lo > 0 && hi < Infinity ? (lo + hi) / 2 : (scale * (want - 1.5)) / Math.max(0.5, side - 1.5);
    }
    const { t, box } = best, w = box.x1 - box.x0 + 1, h = box.y1 - box.y0 + 1;
    const dx = Math.floor(a.at[0]) - Math.ceil(w / 2) - box.x0, dy = Math.floor(a.at[1]) - Math.ceil(h / 2) - box.y0;
    const out = new Pixels(-HALF + dx, -HALF + dy, MODE_ROOM, MODE_ROOM).blit(t.marks, dx, dy).stamps();
    const inCell = (x, y) => t.cells.some((c) => x >= c.x && x < c.x + c.n && y >= c.y && y < c.y + c.n);
    const top = new Pixels(-HALF + dx, -HALF + dy, MODE_ROOM, MODE_ROOM), lit = a.shine !== 'clear';
    for (const c of t.cells) {
      out.push(...blockCell2.run({ at: [c.x + dx, c.y + dy], size: c.n, style: 'bevel', edge: c.n >= 10 ? 2 : 1, symbol: 'none', paint: a.cell, shine: lit && c.n >= 7 ? a.shine : 'clear', ink: a.ink }, ctx));
      if (!lit) continue;
      // a white stroke on the flat of the cell, where it shows against the colour (the corner L alone sits on the lit band)
      const gx = c.x + c.n - (c.n >= 7 ? 3 : 2), gy = c.y + (c.n >= 7 ? 2 : 1), len = c.n > 4 ? 2 : 1;
      for (let i = 0; i < len; i++) top.set(gx + dx, gy + i + dy, a.shine);
      if (c.n >= 9) top.set(gx - 1 + dx, gy + len + 1 + dy, a.shine);
    }
    // what passes in front of the cells (iconOver): the mark, and its ink line only on what is already painted
    for (const job of t.over) {
      const inside = (px, py) => job.test(px, py) && job.clip(px, py);
      const [bx0, by0, bx1, by1] = job.box.map((v, i) => Math.max(-HALF, Math.min(HALF - 1, i < 2 ? Math.floor(v) : Math.ceil(v))));
      for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
        const px = x + 0.5, py = y + 0.5;
        if (inside(px, py)) top.set(x + dx, y + dy, a.paint);
        else if (job.clip(px, py) && (t.marks.has(x, y) || inCell(x, y)) && (inside(px + 1, py) || inside(px - 1, py) || inside(px, py + 1) || inside(px, py - 1))) top.set(x + dx, y + dy, a.ink);
      }
    }
    out.push(...top.stamps());
    return out;
  },
});
