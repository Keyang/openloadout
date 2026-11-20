// PORT (migration batch M9): a copy of engine/inputs-shoulder.js with its imports pointed at the port shims, so it draws paint
// refs on engine/gen/port-surface.js grids (engine/gen/ports/colour.js, surface.js). It is the drawing code of the M9
// port generators (engine/gen/ui-inputs.js, ui-hud.js, ui-bubbles.js, text.js), so it is NOT temporary: it stays when
// engine/inputs-shoulder.js goes (removal items R1 to R4 delete the engine original once its last code caller is gone) and goes
// only with the last generator version that draws with it (review M9 round 2, issue 6). A TRIMMED or HAND CHANGE note
// below says where it differs from its source; never change what a released generator version draws through it.
// ONE HAND CHANGE: the code read the face colour's brightness (`pale`: above 0.76) to pick the face and edge tones, which
// a paint ref has none of; here the caller hands both tones in as `face` and `shine` (the input-shoulder redraw works
// them out with standOut colour rules that make the same choice at every colour), and without them it takes the tones
// of a colour that is not pale.
// A shoulder button with more choices, beside engine/inputs.js (core-sprites-2, batch K16): the same call as
// inputs.js shoulderButton, plus options for a bottom edge that stays put when the face is pressed, a curved-back
// trigger hanging from a pivot, a hand-stepped rounded bumper end, a 1 px light edge along the top, and edges tidied
// the pixel-art way. With none of the new options given it hands the call to inputs.js shoulderButton unchanged, so
// it draws exactly the same pixels. Bodies only, no outline: call g.outline(INK) after it.
//
//   import { shoulderButton } from '../engine/inputs-shoulder.js';
//   shoulderButton(g, 3, 12, 26, 9, { kind: 'bumper', body: p.body, glow: p.glow, down,
//     base: 'fixed', end: 'stepped', rim: true });
//   shoulderButton(g, 9, 5, 14, 22, { kind: 'trigger', body: p.body, glow: p.glow, down,
//     base: 'fixed', back: 'curved', pivot: 3, rim: true, tidy: true });
//
// In the 'fixed' picture the box (x, y, w, h) holds, top to bottom: the pivot (`pivot` px, triggers only), the face
// (h - pivot - depth px) and the dark side under it (`depth` px). Pressed, the face sinks `travel` px onto its side and
// the side's bottom edge (and the pivot) stay where they are.

import { tone } from './colour.js';
import { shoulderButton as plainShoulder } from './inputs.js';

const GREY = '#8a8a9a', LIT = '#e6c545';

// A bumper's rounded outer end, hand-stepped: insets from the left, 3-1-1 down from the top corner, 1-2 down to the
// bottom one. On a face 5 to 7 px tall a traced circle loses one corner pixel only; this reads round at 1x.
const ROUND_TOP = [3, 1, 1], ROUND_FOOT = [2, 1];

// xs: an edge's x on each row. Split it where it turns, and in each stretch sort its runs of equal x so the run
// lengths change one way only (longest next to where the edge is upright).
function tidyRuns(xs) {
  const runs = [];
  for (const x of xs) { const last = runs[runs.length - 1]; if (last && last.x === x) last.n++; else runs.push({ x, n: 1 }); }
  const out = [];
  let k = 0;
  while (k < runs.length) {
    let e = k + 1;
    const dir = e < runs.length ? Math.sign(runs[e].x - runs[k].x) : 0;
    while (e + 1 < runs.length && Math.sign(runs[e + 1].x - runs[e].x) === dir) e++;
    const seg = runs.slice(k, e + 1), n = seg.map((r) => r.n), inner = n.slice(1, -1);
    if (inner.length > 1) {
      const longFirst = n[0] >= n[n.length - 1];
      inner.sort((p, q) => (longFirst ? q - p : p - q));
      for (let t = 0; t < inner.length; t++) seg[t + 1].n = inner[t];
    }
    for (const r of seg) for (let t = 0; t < r.n; t++) out.push(r.x);
    k = e + 1;
  }
  return out;
}

// A face test on pixel centres, w x fh, made row by row from its left and right edges: with `tidy` the front only
// moves forward from the top down to its furthest point, and both edges have their steps put in order.
function rowFace(raw, w, fh, tidy) {
  const L = [], R = [];
  for (let j = 0; j < fh; j++) {
    let lo = w, hi = -1;
    for (let i = 0; i < w; i++) if (raw(i + 0.5, j + 0.5)) { lo = Math.min(lo, i); hi = i; }
    L.push(lo); R.push(hi);
  }
  if (tidy) {
    const tip = L.indexOf(Math.min(...L));
    for (let j = tip - 1; j >= 0; j--) L[j] = Math.max(L[j], L[j + 1]);
  }
  const Lc = tidy ? tidyRuns(L) : L, Rc = tidy ? tidyRuns(R) : R;
  return (u, v) => { const j = Math.floor(v), i = Math.floor(u); return j >= 0 && j < fh && i >= Lc[j] && i <= Rc[j]; };
}

function bumperFace(w, fh, style, end) {
  if (style === 'angled') return (u, v) => u >= 0 && u < w && v >= 0 && v < fh && u >= (fh - v) * 0.8 + 0.4;
  if (end === 'stepped') {
    const inset = (j) => Math.max(ROUND_TOP[j] || 0, ROUND_FOOT[fh - 1 - j] || 0);
    return (u, v) => u >= 0 && u < w && v >= 0 && v < fh && u >= inset(Math.floor(v));
  }
  const r = Math.min(fh / 2, w / 4);
  return (u, v) => u >= 0 && u < w && v >= 0 && v < fh && (u >= r || (u - r) ** 2 + (v - fh / 2) ** 2 <= r * r * 1.05);
}

function triggerFace(w, fh, back, tidy) {
  let raw;
  if (back === 'curved') {
    // the back one convex arc, the front a concave hollow for the finger, the tip cut square to the curl
    const RB = fh * 0.95, ub = w - 2.2 - RB, vb = fh * 0.3;
    const RF = RB * 0.75, uf = ub - w * 0.2, vf = fh * 0.3;
    const cut = fh - 1.2 + w * 0.08;
    raw = (u, v) => (u - ub) ** 2 + (v - vb) ** 2 <= RB * RB && (u - uf) ** 2 + (v - vf) ** 2 > RF * RF && v - u * 0.55 <= cut - w * 0.15;
  } else {
    // inputs.js's paddle: a straight back leaning a little
    const bk = (v) => w * 0.9 - (v / fh) * w * 0.14;
    const front = (v) => { const k = v / fh; return w * 0.08 + w * 0.2 * Math.sin(Math.PI * Math.min(1, k * 1.1)) ** 0.8 - (k > 0.8 ? (k - 0.8) * w * 0.6 : 0); };
    raw = (u, v) => v >= 0 && v < fh && u >= Math.max(0, front(v)) && u <= bk(v) && !(v < fh * 0.12 && u < w * 0.3) && !(v > fh * 0.88 && u > bk(v) - (v - fh * 0.88) * 2.2);
  }
  return rowFace(raw, w, fh, tidy);
}

/**
 * Draws a controller's shoulder button as inputs.js shoulderButton does, with options for a fixed bottom edge, a curved-back trigger on a pivot, a stepped round end, a light top edge and tidied edges.
 * Arguments: g, x, y, w, h (the box), o: { kind, side, style, body, glow, lit, down (as inputs.js), base ('moves' | 'fixed': the side's bottom edge stays put when pressed), back ('straight' | 'curved', triggers), end ('arc' | 'stepped', rounded bumpers), rim (1 px light top edge), tidy (ordered edge steps, triggers), pivot (trigger pivot px; 0), depth (side px; 3), travel (press px; 2) }. Returns { face: { x, y, w, h } }.
 */
export function shoulderButton(g, x, y, w, h, opts = {}) {
  const { kind = 'bumper', side = 'left', style = 'rounded', body = GREY, glow = LIT, lit = true, down = false,
    base = 'moves', back = 'straight', end = 'arc', rim = false, tidy = false, pivot = 0, depth = 3, travel = 2 } = opts;
  const extra = base !== 'moves' || back !== 'straight' || end !== 'arc' || rim || tidy || pivot > 0 || 'depth' in opts || 'travel' in opts;
  if (!extra) return plainShoulder(g, x, y, w, h, opts);
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const trigger = kind === 'trigger', top = trigger ? Math.max(0, Math.round(pivot)) : 0;
  const fixed = base === 'fixed', fh = h - top - depth - (fixed ? 0 : travel);
  const inFace = trigger ? triggerFace(w, fh, back, tidy) : bumperFace(w, fh, style, end);
  // the light edge is a lighter tone of the face; a face already near white has no lighter tone to show, so there the
  // edge keeps the chosen colour and the rest of the face takes a shade darker
  const pick = lit ? glow : body, sideC = tone(body, -0.8);
  const face = rim && opts.face ? opts.face : pick, shine = rim && opts.shine ? opts.shine : tone(pick, 0.85);
  const mir = side === 'right';
  const put = (i, j, c) => g.dot(x + (mir ? w - 1 - i : i), y + j, c);
  const at = (i, j) => inFace(i + 0.5, j + 0.5);
  if (trigger && top > 0) {
    // the controller's edge it hangs from: a bar across the box, its top corners cut, and a 3 px pin down to the
    // paddle, reaching past the face's lowest position so the two never part
    let lo = w, hi = -1;
    for (let i = 0; i < w; i++) if (at(i, 0)) { lo = Math.min(lo, i); hi = i; }
    for (let j = 0; j < Math.min(2, top); j++) for (let i = j ? 0 : 1; i < w - (j ? 0 : 1); i++) put(i, j, sideC);
    const n0 = Math.round((lo + hi) / 2) - 1;
    for (let j = 2; j < top + travel + 1; j++) for (let i = n0; i < n0 + 3; i++) put(i, j, sideC);
  }
  const oy = top + (down ? travel : 0);
  if (fixed) {
    // the side: the face swept down to the fixed bottom edge
    for (let k = down ? travel : 0; k <= depth; k++) for (let j = 0; j < fh; j++) for (let i = 0; i < w; i++) if (at(i, j)) put(i, top + j + k, sideC);
  } else {
    // the side: the face swept `depth` px down, the whole picture moving `travel` px when pressed
    for (let k = 1; k <= depth; k++) for (let j = 0; j < fh; j++) for (let i = 0; i < w; i++) if (at(i, j)) put(i, oy + j + k, sideC);
  }
  // the light edge: every pixel open to the top, and on a trigger its whole front too (the hollow faces the light)
  const edge = (i, j) => rim && (!at(i, j - 1) || (trigger && !at(i - 1, j)));
  for (let j = 0; j < fh; j++) for (let i = 0; i < w; i++) if (at(i, j)) put(i, oy + j, edge(i, j) ? shine : face);
  return { face: { x, y: y + oy, w, h: fh } };
}
