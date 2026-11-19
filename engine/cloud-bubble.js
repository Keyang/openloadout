// A thought cloud with round lobes and a trail of separate puffs (added with batch K23, bundles/specs/core-sprites-3.md).
// thoughtBubble (engine/bubbles.js) draws the cloud style's edge bumps as circles that end in a 1 px tip (star points at
// 1x) and its trail as three puffs that touch each other and the cloud (one stick at 1x). thoughtCloud draws the same
// bubble, by the same rules (1 px ink, the band, a flat face; everything not flat in the corner zones; the 2 px drop
// shadow down and to the left), with every lobe's top row at least 3 px wide and the puffs spaced so that each puff,
// its shadow included, is its own island: at least 1 px of background between neighbours and between the trail and
// the cloud. cloudPieces takes it apart for an opening clip; cloudSparkles marks a dream cloud's top corners.
//
//   const t = thoughtCloud(g, 1, 1, 94, 46, { style: 'cloud', trail: 'down-left', face, frame, shadow: true });
//   textArea: (clip, p) => ({ ...t.inner, text: INK, edge: t.edge })        // slice: plus the frame's 1 px
//   const k = cloudPieces(96, 48, 1, 1, 94, 46, opt);                      // k.cloud, k.cloudBox, k.puffs (smallest first)
//   if (style === 'dream') cloudSparkles(g, t.body, accent, box);

import { Surface, ellipseIn } from './surface.js';
import { INK } from './color.js';
import { roundRectIn } from './ui.js';

/** The thought cloud styles: cloud (two round lobes per corner), puff (one big lobe per corner), dream (as cloud; its sparkles are cloudSparkles). No arguments: a frozen list. */
export const CLOUD_STYLES = Object.freeze(['cloud', 'puff', 'dream']);
/** The directions a thought cloud's trail of puffs can run, each in a corner zone: down-left, down-right, up-left, up-right. No arguments: a frozen list. */
export const CLOUD_TRAILS = Object.freeze(['down-left', 'down-right', 'up-left', 'up-right']);

const SH = 2, P = 3;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const bandOf = (border) => 1 + Math.round(clamp01(border ?? 0.5));

// Lobes of each style for the top left corner, in edge units (u right, v down from the body's corner): [cu, cv, rx, ry].
// Every centre on a pixel centre and every radius a little over a whole number, so a lobe's outer row is 3 px or wider.
const LOBES = {
  cloud: [[2, 2, 4.2, 3.2], [7.5, 0.5, 3.2, 3.2]],
  puff: [[4.5, 2.5, 5.5, 4.5]],
};
const LOBE_CORNER = { cloud: 2, puff: 4 };
// The trail of each direction, largest puff first: [cu, cv, d] in edge units from the body's corner on the trail's side
// (u along the top or bottom edge, negative outwards past the side; v outwards past the top or bottom edge, negative
// back along the side); d the face across: 4 a 4x4 less its corners, 3 a 3x3, 2 a 2x2, each inked round. Each runs out
// from its corner at about 40 degrees, every puff with its shadow an island; the four differ because the shadow always
// falls down-left. REACH: how far each reaches past the body, [sideways, down or up] (up-right needs 2 px more).
const TRAIL = {
  'down-left': [[-6, -5, 4], [-11.5, 0.5, 3], [-17, 5, 2]],
  'down-right': [[-7, -2, 4], [-11.5, 2.5, 3], [-16, 7, 2]],
  'up-left': [[-8, -3, 4], [-12.5, 1.5, 3], [-17, 6, 2]],
  'up-right': [[-7, -4, 4], [-12.5, 1.5, 3], [-18, 6, 2]],
};
const REACH = { 'down-left': [18, 8], 'down-right': [18, 8], 'up-left': [18, 8], 'up-right': [20, 8] };
// The puffs' own drop shadow, down and to the left: 1 px, a third of the cloud's size as they are.
const PUFF_SH = 1;

const puffIn = (cx, cy, d) => { const r = d / 2 + 0.05; return (px, py) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r; };

// Depth of every pixel of a mask: 1 on its edge, 2 one pixel in, ... up to cap.
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

// The body rectangle for a box and a trail.
function bodyOf(x, y, w, h, trail, sh) {
  const pad = { left: P, top: P, right: P, bottom: P };
  if (trail !== 'none') {
    const left = trail.endsWith('left'), up = trail.startsWith('up');
    pad[left ? 'left' : 'right'] = Math.max(P, REACH[trail][0]);
    pad[up ? 'top' : 'bottom'] = Math.max(P, REACH[trail][1]);
  }
  return { x: x + sh + pad.left, y: y + pad.top, w: w - sh - pad.left - pad.right, h: h - sh - pad.top - pad.bottom };
}

// The cloud alone (no trail) round the body B: returns its depth map.
function drawCloud(g, B, { style, face, frame, b, ink, shadow }) {
  const shape = style === 'puff' ? 'puff' : 'cloud';
  const m = new Uint8Array(g.w * g.h);
  const add = (x0, y0, x1, y1, inside) => {
    for (let py = Math.max(0, Math.floor(y0)); py < Math.min(g.h, Math.ceil(y1)); py++) for (let px = Math.max(0, Math.floor(x0)); px < Math.min(g.w, Math.ceil(x1)); px++) if (inside(px + 0.5, py + 0.5)) m[py * g.w + px] = 1;
  };
  add(B.x, B.y, B.x + B.w, B.y + B.h, roundRectIn(B.x, B.y, B.w, B.h, LOBE_CORNER[shape]));
  const local = [
    (px, py) => [px - B.x, py - B.y], (px, py) => [B.x + B.w - px, py - B.y],
    (px, py) => [B.x + B.w - px, B.y + B.h - py], (px, py) => [px - B.x, B.y + B.h - py],
  ];
  for (const toLocal of local) for (const [cu, cv, rx, ry] of LOBES[shape]) {
    const test = ellipseIn(cu, cv, rx, ry);
    add(B.x - P, B.y - P, B.x + B.w + P, B.y + B.h + P, (px, py) => test(...toLocal(px, py)));
  }
  const W = g.w, H = g.h;
  if (shadow) for (let i = 0; i < W * H; i++) if (m[i]) { const x = i % W, y = (i - x) / W; g.dot(x - SH, y + SH, ink); }
  const d = depthOf(m, W, H, b + 2);
  for (let i = 0; i < W * H; i++) {
    if (!m[i]) continue;
    const x = i % W, y = (i - x) / W;
    g.dot(x, y, d[i] === 1 ? ink : d[i] <= 1 + b ? frame : face);
  }
  return d;
}

// The puffs of a trail round the body B, largest first: [{ cx, cy, d }].
function puffsOf(B, trail) {
  const left = trail.endsWith('left'), up = trail.startsWith('up');
  return TRAIL[trail].map(([cu, cv, d]) => ({ cx: left ? B.x + cu : B.x + B.w - cu, cy: up ? B.y - cv : B.y + B.h + cv, d }));
}

// One puff with its own 1 px drop shadow, on g, inside the box.
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
 * Draws a thought cloud filling the box (x, y, w, h) with round lobes and a trail of three separate puffs (each casting a 1 px shadow): returns { body, inner, edge, slice, tip, puffs } (`puffs` largest first, each { x, y } its centre pixel; `tip` the smallest).
 * Arguments: g; x, y, w, h; opt { style (CLOUD_STYLES), trail (CLOUD_TRAILS or 'none'), face, frame (colours), border (0..1: the band 1 to 2 px), shadow (2 px down and to the left), ink }.
 */
export function thoughtCloud(g, x, y, w, h, opt = {}) {
  const o = options('thoughtCloud', opt);
  const B = bodyOf(x, y, w, h, o.trail, o.sh);
  drawCloud(g, B, o);
  const puffs = o.trail === 'none' ? [] : puffsOf(B, o.trail);
  for (const p of puffs) drawPuff(g, p, o, { x, y, w, h });
  const centres = puffs.map((p) => ({ x: Math.floor(p.cx), y: Math.floor(p.cy) }));
  const ins = { left: 13, top: Math.max(8, o.sh ? o.sh + 6 : 0), right: 13 + o.sh, bottom: 8 };
  const inner = { x: B.x + ins.left, y: B.y + ins.top, w: Math.max(0, B.w - ins.left - ins.right), h: Math.max(0, B.h - ins.top - ins.bottom) };
  const slice = { left: inner.x - x, top: inner.y - y, right: Math.max(0, x + w - (inner.x + inner.w)), bottom: Math.max(0, y + h - (inner.y + inner.h)) };
  return { body: B, inner, edge: { x: B.x + (B.w >> 1), y: B.y + 1 }, slice, tip: centres.at(-1) ?? null, puffs: centres };
}

/**
 * Draws a thought cloud on scratch surfaces and takes it apart: returns { full, cloud, cloudBox, puffs, out }; `puffs` smallest first, each { surface, centre } with its own shadow; the cloud with every puff blitted on it is `full`.
 * Arguments: W, H (the frame size); x, y, w, h and opt (exactly as for thoughtCloud). `cloudBox` is the box that draws the same cloud with trail 'none'; `out` is what thoughtCloud returned.
 */
export function cloudPieces(W, H, x, y, w, h, opt = {}) {
  const o = options('cloudPieces', opt);
  const full = new Surface(W, H), out = thoughtCloud(full, x, y, w, h, opt);
  const B = out.body;
  const cloudBox = { x: B.x - o.sh - P, y: B.y - P, w: B.w + o.sh + 2 * P, h: B.h + o.sh + 2 * P };
  const cloud = new Surface(W, H);
  drawCloud(cloud, B, o);
  const puffs = (o.trail === 'none' ? [] : puffsOf(B, o.trail)).map((p, i) => {
    const s = new Surface(W, H);
    drawPuff(s, p, o, { x, y, w, h });
    return { surface: s, centre: out.puffs[i] };
  }).reverse();
  return { full, cloud, cloudBox, puffs, out };
}

/**
 * Draws a 5 px plus sparkle of the accent beside each top corner of a dream cloud, on empty pixels inside the box only: big enough to see at 1x, and none at the bottom corners.
 * Arguments: g; body (the `body` thoughtCloud returned); accent (the sparkle colour); box ({ x, y, w, h }: the box the cloud was drawn in; nothing is drawn outside it).
 */
export function cloudSparkles(g, body, accent, box) {
  const B = body, R = B.x + B.w - 1;
  for (const [cx, cy] of [[B.x - 3, B.y - 2], [R + 2, B.y - 2]]) for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const px = cx + dx, py = cy + dy;
    if (px >= box.x && py >= box.y && px < box.x + box.w && py < box.y + box.h && !g.get(px, py)) g.dot(px, py, accent);
  }
}
