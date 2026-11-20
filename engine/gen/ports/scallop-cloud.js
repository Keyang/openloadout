// PORT (migration batch M9): a copy of engine/scallop-cloud.js with its imports pointed at the port shims, so it draws paint
// refs on engine/gen/port-surface.js grids (engine/gen/ports/colour.js, surface.js). It is the drawing code of the M9
// port generators (engine/gen/ui-inputs.js, ui-hud.js, ui-bubbles.js, text.js), so it is NOT temporary: it stays when
// engine/scallop-cloud.js goes (removal items R1 to R4 delete the engine original once its last code caller is gone) and goes
// only with the last generator version that draws with it (review M9 round 2, issue 6). A TRIMMED or HAND CHANGE note
// below says where it differs from its source; never change what a released generator version draws through it.
// A thought cloud scalloped all the way round (added with batch K23 fix round 2, bundles/specs/core-sprites-3.md).
// thoughtCloud (engine/cloud-bubble.js) puts its lobes at the corners only, so at 96x48 its top and bottom edges run
// straight for about 60 px and it reads as a plaque. scallopCloud draws the same bubble by the same rules (1 px ink,
// the band, a flat face; the 2 px drop shadow down and to the left; a trail of three puffs, each its own island) but
// its outline is a ring of round lobes along every edge, the cusps between them at least 1 px deep, so no straight run
// on the top or bottom edge is longer than a lobe's crown (about 6 px). The three styles differ in outline:
//   cloud  lobes of radius 6 about 11 px apart (the usual thought cloud)
//   puff   fewer, larger lobes (radius 9, about 16 px apart): a rounder, lumpier body
//   dream  small ripples (radius 4, about 8 px apart) between bigger round corners, with sparkles (cloudStars)
// The top and bottom lobes sit on a whole-pixel pitch, so the middle of the cloud repeats exactly: `tile` is one repeat
// (insert whole copies of its columns to lengthen the cloud); `slice` is the border of the flat text area as usual.
//
//   const t = scallopCloud(g, 1, 1, 94, 46, { style: 'cloud', trail: 'down-left', face, frame, shadow: true });
//   textArea: (clip, p) => ({ ...t.inner, text: INK, edge: t.edge })        // slice: plus the frame's 1 px
//   const k = scallopPieces(96, 48, 1, 1, 94, 46, opt);                    // k.cloud, k.cloudBox, k.puffs (smallest first)
//   if (style === 'dream') cloudStars(g, t, accent);                       // two sparkles on the top corners' face

import { Surface } from './surface.js';
import { INK, tone } from './colour.js';
import { CLOUD_STYLES, CLOUD_TRAILS } from './cloud-bubble.js';

export { CLOUD_STYLES, CLOUD_TRAILS };

const SH = 2, P = 3;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const bandOf = (border) => 1 + Math.round(clamp01(border ?? 0.5));

// Each style's lobes: re the edge lobes' radius, rc the corner lobes', S the wanted pitch along an edge (px).
// Radii are 0.4 over a whole number, so every lobe's crown row is 5 px wide or more (never a 1 px tip), and each pitch
// is about 1.7 radii, so the cusps between lobes are 2.5 to 4.5 px deep. inset: how far in from the lobes' centre line
// (C) the text area starts, [x, y], clear of every cusp (a puff's deep cusps leave face beyond C).
const SHAPE = {
  cloud: { re: 6.4, rc: 6.4, S: 11, inset: [3, 2] },
  puff: { re: 9.4, rc: 9.4, S: 16, inset: [3, 0] },
  dream: { re: 4.4, rc: 6.4, S: 8, inset: [3, 2] },
};
// The trail of each direction, largest puff first (as engine/cloud-bubble.js): [cu, cv, d] from the body's corner.
const TRAIL = {
  'down-left': [[-6, -5, 4], [-11.5, 0.5, 3], [-17, 5, 2]],
  'down-right': [[-7, -2, 4], [-11.5, 2.5, 3], [-16, 7, 2]],
  'up-left': [[-8, -3, 4], [-12.5, 1.5, 3], [-17, 6, 2]],
  'up-right': [[-7, -4, 4], [-12.5, 1.5, 3], [-18, 6, 2]],
};
const REACH = { 'down-left': [18, 8], 'down-right': [18, 8], 'up-left': [18, 8], 'up-right': [20, 8] };
const PUFF_SH = 1;

const puffIn = (cx, cy, d) => { const r = d / 2 + 0.05; return (px, py) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r; };

function depthOf(m, W, H, cap) {
  const d = new Uint8Array(W * H);
  let ring = [];
  for (let i = 0; i < W * H; i++) {
    if (!m[i]) continue;
    const x = i % W, y = (i - x) / W;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1 || !m[i - 1] || !m[i + 1] || !m[i - W] || !m[i + W]) { d[i] = 1; ring.push(i); }
  }
  for (let k = 2; k <= cap && ring.length; k++) {
    const next = [];
    for (const i of ring) for (const n of [i - 1, i + 1, i - W, i + W]) if (m[n] && !d[n]) { d[n] = k; next.push(n); }
    ring = next;
  }
  for (let i = 0; i < W * H; i++) if (m[i] && !d[i]) d[i] = cap;
  return d;
}

// The body rectangle (the cloud's extent less P on every side) for a box and a trail.
// e: how many px further out the trail is moved (both ways), the body giving up that much room to it.
function bodyOf(x, y, w, h, trail, sh, e = 0) {
  const pad = { left: P, top: P, right: P, bottom: P };
  if (trail !== 'none') {
    const left = trail.endsWith('left'), up = trail.startsWith('up');
    pad[left ? 'left' : 'right'] = Math.max(P, REACH[trail][0] + e);
    pad[up ? 'top' : 'bottom'] = Math.max(P, REACH[trail][1] + e);
  }
  return { x: x + sh + pad.left, y: y + pad.top, w: w - sh - pad.left - pad.right, h: h - sh - pad.top - pad.bottom };
}

// The lobes' centre line C (a rectangle) and the lobes on it, for a body B: { C, lobes: [[cx, cy, r]], S, n }.
function layout(B, style) {
  const { re, rc, S: S0 } = SHAPE[style];
  const inset = Math.floor(Math.max(re, rc)) - P;
  let C = { x: B.x + inset, y: B.y + inset, w: Math.max(1, B.w - 2 * inset), h: Math.max(1, B.h - 2 * inset) };
  // top and bottom: a whole-pixel pitch, so the middle repeats; C narrows (centred) to a whole number of pitches
  const n = Math.max(1, Math.ceil((C.w - 1) / S0));
  const S = Math.max(1, Math.floor((C.w - 1) / n));
  const w = n * S + 1, dx = (C.w - w) >> 1;
  C = { ...C, x: C.x + dx, w };
  const lobes = [];
  for (let i = 0; i <= n; i++) {
    const cx = C.x + 0.5 + i * S, r = i === 0 || i === n ? rc : re;
    lobes.push([cx, C.y + 0.5, r], [cx, C.y + C.h - 0.5, r]);
  }
  const m = Math.max(1, Math.ceil((C.h - 1) / S0));
  for (let j = 1; j < m; j++) {
    const cy = C.y + 0.5 + Math.round((j * (C.h - 1)) / m);
    lobes.push([C.x + 0.5, cy, re], [C.x + C.w - 0.5, cy, re]);
  }
  return { C, lobes, S, n };
}

// The cloud alone (no trail) round the body B, clipped to the box: returns its mask and depth map.
function drawCloud(g, B, { style, face, frame, b, ink, shadow }, box) {
  const { C, lobes } = layout(B, style);
  const W = g.w, H = g.h, m = new Uint8Array(W * H);
  const inBox = (px, py) => px >= box.x && py >= box.y && px < box.x + box.w && py < box.y + box.h;
  for (let py = Math.max(0, box.y); py < Math.min(H, box.y + box.h); py++) for (let px = Math.max(0, box.x); px < Math.min(W, box.x + box.w); px++) {
    const X = px + 0.5, Y = py + 0.5;
    let on = X >= C.x && X < C.x + C.w && Y >= C.y && Y < C.y + C.h;
    for (let k = 0; !on && k < lobes.length; k++) { const [cx, cy, r] = lobes[k]; on = (X - cx) ** 2 + (Y - cy) ** 2 <= r * r; }
    if (on) m[py * W + px] = 1;
  }
  if (shadow) for (let i = 0; i < W * H; i++) if (m[i]) { const x = i % W, y = (i - x) / W; if (inBox(x - SH, y + SH) && !m[(y + SH) * W + x - SH]) g.dot(x - SH, y + SH, ink); }
  const d = depthOf(m, W, H, b + 2);
  for (let i = 0; i < W * H; i++) {
    if (!m[i]) continue;
    const x = i % W, y = (i - x) / W;
    g.dot(x, y, d[i] === 1 ? ink : d[i] <= 1 + b ? frame : face);
  }
  return { m, d, C };
}

function puffsOf(B, trail, e = 0) {
  const left = trail.endsWith('left'), up = trail.startsWith('up');
  return TRAIL[trail].map(([cu, cv, d]) => ({ cx: left ? B.x + cu - e : B.x + B.w - cu + e, cy: up ? B.y - cv - e : B.y + B.h + cv + e, d }));
}

// 8-connected islands of everything drawn on g.
function islandsOf(g) {
  const W = g.w, H = g.h, seen = new Uint8Array(W * H);
  let n = 0;
  for (let i = 0; i < W * H; i++) {
    if (!g.data[i] || seen[i]) continue;
    n++; seen[i] = 1;
    const st = [i];
    while (st.length) {
      const j = st.pop(), x = j % W, y = (j - x) / W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy, k = Y * W + X;
        if (X >= 0 && Y >= 0 && X < W && Y < H && g.data[k] && !seen[k]) { seen[k] = 1; st.push(k); }
      }
    }
  }
  return n;
}

// The smallest trail offset (0 to 3 px) at which every puff, its shadow included, is its own island.
function trailOffset(W, H, x, y, w, h, o) {
  if (o.trail === 'none') return 0;
  for (let e = 0; e < 3; e++) {
    const s = new Surface(W, H), B = bodyOf(x, y, w, h, o.trail, o.sh, e);
    drawCloud(s, B, o, { x, y, w, h });
    for (const p of puffsOf(B, o.trail, e)) drawPuff(s, p, o, { x, y, w, h });
    if (islandsOf(s) === 4) return e;
  }
  return 3;
}

function drawPuff(g, { cx, cy, d }, { face, ink, shadow }, box) {
  const s = new Surface(g.w, g.h);
  s.fill(cx - d, cy - d, cx + d, cy + d, puffIn(cx, cy, d), face, { outline: ink });
  const inBox = (px, py) => px >= box.x && py >= box.y && px < box.x + box.w && py < box.y + box.h;
  if (shadow) for (let i = 0; i < s.data.length; i++) {
    if (!s.data[i]) continue;
    const px = i % s.w - PUFF_SH, py = (i - i % s.w) / s.w + PUFF_SH;
    if (inBox(px, py) && !s.get(px, py)) g.dot(px, py, ink);
  }
  for (let i = 0; i < s.data.length; i++) if (s.data[i] && inBox(i % s.w, (i - i % s.w) / s.w)) g.data[i] = s.data[i];
}

function options(fn, { style = 'cloud', trail = 'down-left', face, frame, border = 0.5, shadow = false, ink = INK } = {}) {
  if (!CLOUD_STYLES.includes(style)) throw new Error(`${fn}: style "${style}" is not one of ${CLOUD_STYLES.join(', ')}`);
  if (trail !== 'none' && !CLOUD_TRAILS.includes(trail)) throw new Error(`${fn}: trail "${trail}" is not one of ${CLOUD_TRAILS.join(', ')}, none`);
  if (!face || !frame) throw new Error(`${fn}: needs a face and a frame colour`);
  return { style, trail, face, frame, b: bandOf(border), ink, shadow: !!shadow, sh: shadow ? SH : 0 };
}

/**
 * Draws a thought cloud filling the box (x, y, w, h), scalloped with round lobes along every edge, with a trail of three separate puffs: returns { body, lobes, inner, edge, slice, tile, tip, puffs, corners }.
 * `lobes` is the lobes' centre line (a rectangle); `inner` the flat face for text; `tile` { x, w } one repeat of the middle columns; `corners` the centres of the top left and top right corner lobes ({ x, y } pixels, for cloudStars); `puffs` largest first.
 * Arguments: g; x, y, w, h; opt { style (CLOUD_STYLES), trail (CLOUD_TRAILS or 'none'), face, frame (colours), border (0..1: the band 1 to 2 px), shadow (2 px down and to the left), ink }.
 */
export function scallopCloud(g, x, y, w, h, opt = {}) {
  const o = options('scallopCloud', opt);
  const box = { x, y, w, h };
  const e = trailOffset(g.w, g.h, x, y, w, h, o);
  const B = bodyOf(x, y, w, h, o.trail, o.sh, e);
  const { d, C } = drawCloud(g, B, o, box);
  const { S, n } = layout(B, o.style);
  const puffs = o.trail === 'none' ? [] : puffsOf(B, o.trail, e);
  for (const p of puffs) drawPuff(g, p, o, box);
  const centres = puffs.map((p) => ({ x: Math.floor(p.cx), y: Math.floor(p.cy) }));
  const [ix, iy] = SHAPE[o.style].inset;
  const inner = { x: C.x + ix, y: C.y + iy, w: Math.max(0, C.w - 2 * ix), h: Math.max(0, C.h - 2 * iy) };
  const slice = { left: Math.max(0, inner.x - x), top: Math.max(0, inner.y - y), right: Math.max(0, x + w - (inner.x + inner.w)), bottom: Math.max(0, y + h - (inner.y + inner.h)) };
  // one repeat of the middle: the pitch's worth of columns starting at the middle lobe's centre
  const k = Math.max(0, Math.floor(n / 2) - (n % 2 ? 0 : 1));
  const tile = { x: C.x + k * S, w: S };
  // a band pixel straight above the text area's middle: the colour the text sits beside
  const ex = inner.x + (inner.w >> 1);
  let ey = inner.y;
  while (ey > 0 && d[ey * g.w + ex] > 1 + o.b) ey--;
  return {
    body: B, lobes: C, inner, edge: { x: ex, y: ey }, slice, tile,
    tip: centres.at(-1) ?? null, puffs: centres,
    corners: [{ x: C.x, y: C.y }, { x: C.x + C.w - 1, y: C.y }], trailOffset: e,
  };
}

/**
 * Draws a scallop cloud on scratch surfaces and takes it apart: returns { full, cloud, cloudBox, puffs, out }; `puffs` smallest first, each { surface, centre } with its own shadow; the cloud with every puff blitted on it is `full`.
 * Arguments: W, H (the frame size); x, y, w, h and opt (exactly as for scallopCloud). `cloudBox` is the box that draws the same cloud with trail 'none'; `out` is what scallopCloud returned.
 */
export function scallopPieces(W, H, x, y, w, h, opt = {}) {
  const o = options('scallopPieces', opt);
  const full = new Surface(W, H), out = scallopCloud(full, x, y, w, h, opt);
  const B = out.body;
  const cloudBox = { x: B.x - o.sh - P, y: B.y - P, w: B.w + o.sh + 2 * P, h: B.h + o.sh + 2 * P };
  const cloud = new Surface(W, H);
  drawCloud(cloud, B, o, { x, y, w, h });
  const puffs = (o.trail === 'none' ? [] : puffsOf(B, o.trail, out.trailOffset)).map((p, i) => {
    const s = new Surface(W, H);
    drawPuff(s, p, o, { x, y, w, h });
    return { surface: s, centre: out.puffs[i] };
  }).reverse();
  return { full, cloud, cloudBox, puffs, out };
}

/**
 * Draws a dream cloud's two sparkles: a 5x5 plus of the accent with a light centre and an ink rim, on the face of each top corner lobe (outside `inner`, so never under the words).
 * Arguments: g; out (what scallopCloud returned); accent (the sparkle colour); opt { ink }.
 */
export function cloudStars(g, out, accent, { ink = INK } = {}) {
  const core = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-2, 0], [2, 0], [0, -2], [0, 2]];
  const light = tone(accent, 0.85);
  for (const c of out.corners) {
    // on the corner lobe's centre column, one pixel down: its rim stays above and beside the text area
    const cx = c.x, cy = c.y + 1;
    const isCore = (x, y) => core.some(([dx, dy]) => cx + dx === x && cy + dy === y);
    for (const [dx, dy] of core) for (const [ex, ey] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const px = cx + dx + ex, py = cy + dy + ey;
      if (!isCore(px, py) && g.get(px, py)) g.dot(px, py, ink);
    }
    for (const [dx, dy] of core) g.dot(cx + dx, cy + dy, dx === 0 && dy === 0 ? light : accent);

  }
}
