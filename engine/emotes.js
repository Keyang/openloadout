// Emotes: marks that sit over a character's head (an alarm, a question, a heart, anger, a sweat drop, sleep,
// music, delight, dizziness), each with its own idle motion, and the pop with which a mark appears
// (bundles/specs/core-sprites-3.md, helper batch H4c). Pure drawing on a Surface: runs in Node and in the browser.
//
//   import { EMOTES, emoteBody, drawEmote, emotePop } from '../engine/emotes.js';
//
//   const pop = emotePop(frame, 6);                                       // appearing over 6 frames
//   if (pop.dot) g.rect(cx - 1, by - 2, 3, 3, p.colour);                 // frame 0: the dot it grows from
//   else drawEmote(g, 'anger', cx, by + pop.dy, Math.round(16 * pop.size), { t, colour: p.colour, edge: p.edge });
//
// A body is a glyphGrid size + 4 px wide and size + 4 tall: the mark at rest stands on its bottom row,
// centred, and the rows above are room for its motion. drawEmote puts that grid's bottom row on `by` and
// its middle column (floor(w / 2)) on `cx`, then draws it the way damage numbers are drawn (rimmed of
// engine/ui.js), or with a plain ink line. The motion is periodic in t (0..1 is one loop).

import { Surface } from './surface.js';
import { INK } from './color.js';
import { markIn } from './marks.js';
import { heartIn } from './shapes.js';
import { glyphGrid, rimmed } from './ui.js';
import { fontMetrics, fontGlyph } from './pixel-font.js';

/** The emotes emoteBody and drawEmote know: exclaim, question, heart, anger, sweat, sleep, music, spark (delight) and swirl (dizzy). No arguments: a frozen list. */
export const EMOTES = Object.freeze(['exclaim', 'question', 'heart', 'anger', 'sweat', 'sleep', 'music', 'spark', 'swirl']);

const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// fill a grid from a shape test sampled at pixel centres, moved by (dx, dy)
function paint(grid, inside, dx = 0, dy = 0) {
  for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) if (inside(x + 0.5 - dx, y + 0.5 - dy)) grid.set(x, y);
}
// one pixel thicker: every pixel also sets the one to its right
function thicken(grid) {
  const on = [];
  for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) if (grid.at(x, y)) on.push([x, y]);
  for (const [x, y] of on) grid.set(x + 1, y);
}
const seg = (x0, y0, x1, y1, r) => (px, py) => {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / l2));
  return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t)) <= r;
};

// the three Zs of `sleep`: chunky Z, z and a smaller z, chosen so they stack to about `size` rows
function sleepSet(size) {
  const ms = [0, 0.5, 1].map((s) => fontMetrics(s, 'chunky'));
  let best = null;
  for (let a = 0; a < 3; a++) for (let b = 0; b <= a; b++) for (let c = 0; c <= b; c++) {
    const total = ms[a].cap + ms[b].x + ms[c].x, d = Math.abs(total - size);
    if (!best || d < best.d || (d === best.d && total > best.total)) best = { d, total, set: [fontGlyph('Z', ms[a]), fontGlyph('z', ms[b]), fontGlyph('z', ms[c])] };
  }
  return best.set;
}

function body(kind, size, t, bounce, bold) {
  const W = size + 4, H = size + 4, g = glyphGrid(W, H);
  const A = 1 + Math.round(clamp01(bounce) * 2), ph = TAU * (((t % 1) + 1) % 1), s = Math.sin(ph);
  const cx = Math.floor(W / 2), base = H - 1;                        // centre column, bottom row at rest
  const th = size >= 15 ? 1 : 0.5;                                  // half the stroke of the drawn marks
  switch (kind) {
    case 'exclaim': {
      const n = Math.floor((size - 1) / 2);
      paint(g, markIn('exclaim', cx, base - n, size), Math.round(A * s), 0);
      if (bold) thicken(g);
      return g;
    }
    case 'question': {
      const n = Math.floor((size - 1) / 2), test = markIn('question', cx, base - n, size), mid = base - n;
      // the top tilts: rows above the middle lean side to side, the most at the top
      paint(g, (px, py) => test(px + Math.round((A * s * Math.max(0, mid - py)) / Math.max(1, n)), py));
      if (bold) thicken(g);
      return g;
    }
    case 'heart': {
      const beat = s > 0.5 ? A : 0, w = size + beat;
      paint(g, heartIn(cx + 0.5, base + 1 - size / 2, w, size, 'classic'));
      return g;
    }
    case 'anger': {
      // four corner strokes bowing towards the middle, with a gap there; they throb (shrink and grow)
      const throb = Math.round(A * (0.5 - 0.5 * Math.cos(ph)));
      const R = size / 2 - throb, gap = Math.max(1, Math.round(size / 8)), mx = cx + 0.5, my = base + 1 - size / 2;
      const r = th + (bold ? 0.5 : 0);
      const parts = [];
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const ox = mx + sx * gap, oy = my + sy * gap, arm = R - gap - 0.5;
        parts.push(seg(ox + sx * arm * 0.35, oy, ox + sx * arm, oy - sy * arm * 0.15, r + 0.01));      // along x, curling away
        parts.push(seg(ox, oy + sy * arm * 0.35, ox - sx * arm * 0.15, oy + sy * arm, r + 0.01));      // along y
        parts.push(seg(ox + sx * arm * 0.35, oy, ox, oy + sy * arm * 0.35, r + 0.01));               // the bend
      }
      paint(g, (px, py) => parts.some((f) => f(px, py)));
      return g;
    }
    case 'sweat': {
      // a teardrop, point up, resting on the bottom row: it lifts up to A px and slides back down to rest
      // (it rises rather than sinks so the whole drop stays inside the grid; the rows above are its room)
      const slide = Math.round(A * (0.5 - 0.5 * Math.cos(ph))), rr = Math.max(2.5, size * 0.3), tipY = base + 1 - size;
      const cy = base + 1 - rr, ccx = cx + 0.5;
      paint(g, (px, py) => {
        const y = py + slide;
        if ((px - ccx) ** 2 + (y - cy) ** 2 <= rr * rr) return true;
        return y >= tipY && y <= cy && Math.abs(px - ccx) <= (rr * (y - tipY)) / (cy - tipY) - 0.15;
      });
      return g;
    }
    case 'sleep': {
      // three Zs climbing to the upper right, large to small; they drift up, and the top one goes and comes back
      const set = sleepSet(size), rise = Math.round(A * (((t % 1) + 1) % 1)), hideTop = (((t % 1) + 1) % 1) >= 0.75;
      const tight = set.reduce((n, gl) => n + gl.w, 0) > W;          // too wide side by side: they share a column
      let x = 0, top = base + 1;
      const placed = set.map((gl) => { const at = { gl, x, y: top - gl.rise }; top -= gl.rise; x += gl.w - (tight ? 1 : 0); return at; });
      const width = placed.reduce((n, p) => Math.max(n, p.x + p.gl.w), 0), x0 = Math.floor((W - width) / 2);
      placed.forEach((p, i) => {
        if (i === 2 && hideTop) return;
        const lift = i === 0 ? 0 : rise;
        for (let y = 0; y < p.gl.h; y++) for (let xx = 0; xx < p.gl.w; xx++) if (p.gl.body.at(xx, y)) g.set(x0 + p.x + xx, p.y + y - lift);
      });
      if (bold) thicken(g);
      return g;
    }
    case 'music': {
      // two notes joined by a beam; they bob in turn
      const hx = Math.max(2, size * 0.17), hy = Math.max(1.5, size * 0.12), gapX = Math.round(size * 0.45);
      const x1 = cx - Math.floor(gapX / 2), x2 = x1 + gapX, r = th + (bold ? 0.5 : 0);
      const b1 = Math.round(A * Math.max(0, s)), b2 = Math.round(A * Math.max(0, -s));
      const head = (x, lift) => (px, py) => ((px - (x - hx + 1)) / hx) ** 2 + ((py - (base + 1 - hy - lift)) / hy) ** 2 <= 1;
      const top1 = base + 1 - size - b1 + 0.5, top2 = base + 1 - size - b2 + 0.5 + Math.round(size * 0.1);
      const stem = (x, lift, topY) => seg(x + 0.5, base + 1 - hy - lift, x + 0.5, topY, r);
      const beam = seg(x1 + 0.5, top1 + r, x2 + 0.5, top2 + r, r + (size >= 15 ? 0.5 : 0.25));
      paint(g, (px, py) => head(x1 + 1, b1)(px, py) || head(x2 + 1, b2)(px, py) || stem(x1, b1, top1)(px, py) || stem(x2, b2, top2)(px, py) || beam(px, py));
      return g;
    }
    case 'spark': {
      // a 2x2 core, four rays that grow and shrink in turn, a 1 px spark in each gap between them
      const L = Math.floor((size - 2) / 2), wv = Math.round(A * (0.5 - 0.5 * Math.cos(ph))), wh = Math.round(A * (0.5 + 0.5 * Math.cos(ph)));
      const Lv = L - wv, Lh = L - wh, ray = bold ? 3 : 2, my = base - L - 1, mx = cx - 1;
      for (let i = -Lv; i <= Lv + 1; i++) for (let k = 0; k < ray; k++) g.set(mx + k, my + i);
      for (let i = -Lh; i <= Lh + 1; i++) for (let k = 0; k < ray; k++) g.set(mx + i, my + k);
      const d = Math.max(2, Math.round(L * 0.55));
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.set(mx + (sx < 0 ? -d : d + 1), my + (sy < 0 ? -d : d + 1));
      return g;
    }
    case 'swirl': {
      // a 1 px spiral of one and a half turns, turning an eighth of a turn a frame; a 1 px star circles it
      // the first turn opens from the middle to the full radius, the last half turn runs round at it
      // with more bounce the star swings wider and the spiral bobs
      // the star's widest circle (bounce 1) just fits the grid; the spiral bobs inside it
      const R = (size - 3) / 2, orbit = R + 0.5 + 0.5 * A, mx = cx + 0.5, bob = Math.round((A - 1) * 0.5 * s);
      const sy0 = base + 1 - (R + 3.5), my = sy0 + bob;
      const off = -Math.PI / 2 - 3 * Math.PI + ph;                   // the outer end points up at t = 0
      paint(g, (px, py) => {
        const dx = px - mx, dy = py - my, d = Math.hypot(dx, dy);
        const a = ((Math.atan2(dy, dx) - off) % TAU + TAU) % TAU;
        for (let k = 0; k < 2; k++) {
          const th2 = a + TAU * k;
          if (th2 < Math.PI * 0.6 || th2 > 3 * Math.PI) continue;
          if (Math.abs(d - R * Math.min(1, 0.2 + (0.8 * th2) / TAU)) <= 0.5) return true;
        }
        return false;
      });
      const sa = -Math.PI / 2 + 0.5 + ph;
      const sx = Math.floor(mx + Math.cos(sa) * orbit), sy = Math.floor(sy0 + Math.sin(sa) * orbit);
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) g.set(sx + dx, sy + dy);
      if (bold) thicken(g);
      return g;
    }
    default:
      throw new Error(`emotes: no emote "${kind}". Emotes: ${EMOTES.join(', ')}`);
  }
}

// The Zs of `sleep` one grid each, placed exactly as body() places them (their union is body('sleep', ...)): for
// drawEmote's `apart`, which inks each letter on its own. Added with sprite batch K24 (emote-bubbles).
function sleepLetters(size, t, bounce, bold) {
  const W = size + 4, H = size + 4, base = H - 1;
  const A = 1 + Math.round(clamp01(bounce) * 2);
  const set = sleepSet(size), rise = Math.round(A * (((t % 1) + 1) % 1)), hideTop = (((t % 1) + 1) % 1) >= 0.75;
  const tight = set.reduce((n, gl) => n + gl.w, 0) > W;
  let x = 0, top = base + 1;
  const placed = set.map((gl) => { const at = { gl, x, y: top - gl.rise }; top -= gl.rise; x += gl.w - (tight ? 1 : 0); return at; });
  const width = placed.reduce((n, p) => Math.max(n, p.x + p.gl.w), 0), x0 = Math.floor((W - width) / 2);
  const out = [];
  placed.forEach((p, i) => {
    if (i === 2 && hideTop) return;
    const g = glyphGrid(W, H), lift = i === 0 ? 0 : rise;
    for (let y = 0; y < p.gl.h; y++) for (let xx = 0; xx < p.gl.w; xx++) if (p.gl.body.at(xx, y)) g.set(x0 + p.x + xx, p.y + y - lift);
    if (bold) thicken(g);
    out.push(g);
  });
  return out;
}

/**
 * The body pixels of an emote at loop phase t: a glyphGrid size + 4 wide and tall, the mark size px tall standing on its bottom row, centred, its idle motion built in.
 * Arguments: kind (one of EMOTES); size (10 to 20, px tall); options { t (0..1, one loop; default 0), bounce (0..1: how far it moves, 1 px to 3 px; default 0.5), bold (strokes 1 px thicker; heart and sweat ignore it) }.
 */
export function emoteBody(kind, size, { t = 0, bounce = 0.5, bold = false } = {}) {
  if (!EMOTES.includes(kind)) throw new Error(`emoteBody: no emote "${kind}". Emotes: ${EMOTES.join(', ')}`);
  return body(kind, Math.max(10, Math.min(20, Math.round(size))), t, bounce, bold);
}

/**
 * Draws an emote centred on cx with its bottom row on by and returns the box drawn: { box: { x, y, w, h } }. With rim, the body in colour, a 1 px rim of edge, ink and holes inked (rimmed of engine/ui.js); without, the body and a 1 px ink line.
 * Arguments: g (the Surface); kind (one of EMOTES); cx, by (centre column and bottom row); size (10 to 20); options { t, bounce, bold (as emoteBody), colour, edge (the rim colour), rim (default true), shadow (a 1 px ink drop shadow down-left), ink, apart (rim false and sleep only, default false: each Z gets its own ink line, the biggest first, so letters that touch at small sizes stay apart; the outline round the whole mark is unchanged; added with sprite batch K24) }.
 */
export function drawEmote(g, kind, cx, by, size, { t = 0, bounce, bold, colour, edge, rim = true, shadow = false, ink = INK, apart = false } = {}) {
  if (!colour) throw new Error('drawEmote: needs a colour');
  const b = emoteBody(kind, size, { t, bounce, bold });
  const x0 = Math.round(cx) - Math.floor(b.w / 2), y0 = Math.round(by) - (b.h - 1);
  const s = new Surface(g.w, g.h);
  if (rim) rimmed(s, b, x0, y0, { colour, edge: edge ?? colour, shadow, ink });
  else {
    if (apart && kind === 'sleep') {
      // where a letter touches a later (smaller) one, side or corner, its touching pixels are ink: one ink pixel
      // parts them, and nothing outside the mark's body changes
      const ls = sleepLetters(Math.max(10, Math.min(20, Math.round(size))), t, bounce ?? 0.5, !!bold);
      const later = (i, x, y) => ls.some((l, j) => j > i && l.at(x, y));
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
        if (!b.at(x, y)) continue;
        const i = ls.findIndex((l) => l.at(x, y));
        let touch = false;
        for (let dy = -1; dy <= 1 && !touch; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && later(i, x + dx, y + dy)) { touch = true; break; }
        s.dot(x0 + x, y0 + y, touch ? ink : colour);
      }
    } else for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.at(x, y)) s.dot(x0 + x, y0 + y, colour);
    s.outline(ink);
    if (shadow) {
      const under = new Surface(g.w, g.h);
      for (let py = 0; py < g.h; py++) for (let px = 0; px < g.w; px++) if (s.get(px, py)) under.dot(px - 1, py + 1, ink);
      under.blit(s);
      s.data.set(under.data);
    }
  }
  const bb = s.bounds();
  g.blit(s);
  return { box: bb ? { x: bb.x0, y: bb.y0, w: bb.x1 - bb.x0 + 1, h: bb.y1 - bb.y0 + 1 } : { x: x0, y: y0, w: 0, h: 0 } };
}

const POP = [
  { size: 0, dy: 0, dot: true },
  { size: 0.6, dy: 0, dot: false },
  { size: 1.15, dy: -1, dot: false },
  { size: 1, dy: 0, dot: false },
  { size: 1, dy: 1, dot: false },
  { size: 1, dy: 0, dot: false },
];

/**
 * The pop-in of an emote as whole steps: { size (a factor of the mark's size: redraw the shape at that size, never scale pixels), dy (px, up is negative), dot (true: draw a 3x3 dot where the mark will stand) }.
 * Arguments: frame (0 to frames - 1); frames (how many frames the pop takes, default 6): the dot, 0.6, 1.15 one px high, 1, 1 one px low, 1.
 * Note: emoteBody and drawEmote clamp size to 10..20, so round(size * pop.size) is clamped too: the 1.15 overshoot
 * shows only for marks of size 17 or less (1.15 x 18 = 21 comes back to 20), and the 0.6 frame of a mark of size 16
 * or less is drawn at 10. The dy steps still show at every size.
 */
export function emotePop(frame, frames = 6) {
  const n = Math.max(1, Math.round(frames)), f = Math.max(0, Math.min(n - 1, Math.round(frame)));
  const i = n <= 1 ? POP.length - 1 : Math.round((f * (POP.length - 1)) / (n - 1));
  return { ...POP[i] };
}
