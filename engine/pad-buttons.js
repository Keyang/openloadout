// Round controller buttons, beside engine/inputs.js (core-sprites-2, batch K16): a button whose front side is swept
// down from its top (so a deep side never pinches in at the middle, as two stacked discs do), painted in a side
// colour of its own (a lit cap keeps the plastic's side, so the plastic shows even when every button is lit), with a
// 1 px light rim along the upper right of its top (the light comes from the top right, as keyBevel's does). A
// pressed button sinks by its depth and loses its rim. Bodies only, no outline: the sprite calls g.outline(INK).
//
//   import { padCap, padDiamond } from '../engine/pad-buttons.js';
//   const { tops } = padDiamond(g, 16, 16, { r: 5, body: p.body, side: tone(p.body, -0.8), glow: p.glow, lit: 'bottom', depth: 2 });
//   padCap(g, 16, 16, 10, { top: p.glow, side: tone(p.body, -0.8), depth: 2, down });
//   g.outline(INK);

import { tone } from './color.js';

// fill every pixel whose centre passes inside(px, py) within the box round (cx, cy) of half-size r
function fillRound(g, cx, cy, r, inside, c) {
  for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(g.h, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(g.w, Math.ceil(cx + r)); x++) if (inside(x + 0.5, y + 0.5)) g.dot(x, y, c);
  }
}

/**
 * Draws one round controller button within radius r of (cx, cy): a top disc over a front side swept `depth` px down, the side in its own colour, and a light rim on the top's upper right.
 * Arguments: g, cx, cy, r (outer radius), o: { top (top colour), side (side colour; default a darker tone of top), depth (side px, 1 to 4; 2), down (the top sinks by depth, no side, no rim), shine (the light rim; true) }. Returns { top: { cx, cy, r, x, y, w, h } }: the top disc and a flat box inside it for a printed letter.
 */
export function padCap(g, cx, cy, r, { top = '#8a8a9a', side, depth = 2, down = false, shine = true } = {}) {
  const d = Math.max(1, Math.min(4, Math.round(depth))), rt = Math.max(1, r - d / 2), r2 = rt * rt;
  const sideC = side ?? tone(top, -0.8), ty = down ? cy + d / 2 : cy - d / 2;
  if (!down) {
    // the side: every disc from the top's place down to d px lower (a capsule), so the outline runs straight down
    fillRound(g, cx, cy, r, (px, py) => {
      const qy = Math.max(cy - d / 2, Math.min(cy + d / 2, py));
      return (px - cx) ** 2 + (py - qy) ** 2 <= r2;
    }, sideC);
  }
  const inTop = (px, py) => (px - cx) ** 2 + (py - ty) ** 2 <= r2;
  fillRound(g, cx, cy, r, inTop, top);
  if (shine && !down) {
    // the rim: top pixels on the upper right whose pixel above or to the right is off the top
    const lit = tone(top, 0.85);
    fillRound(g, cx, cy, r, (px, py) => inTop(px, py) && px - cx >= -0.5 && py - ty <= 0.5 && (!inTop(px, py - 1) || !inTop(px + 1, py)), lit);
  }
  const half = Math.max(0.5, Math.floor(rt * 0.68));
  return { top: { cx, cy: ty, r: rt, x: Math.ceil(cx - half), y: Math.ceil(ty - half), w: Math.max(1, Math.floor(cx + half) - Math.ceil(cx - half)), h: Math.max(1, Math.floor(ty + half) - Math.ceil(ty - half)) } };
}

/**
 * Draws four alike padCap buttons in a diamond round (cx, cy), the ones named by `lit` with their tops in the glow colour (and pressed with `down`); every side stays the plastic's.
 * Arguments: g, cx, cy, o: { r (each button's radius; 5), gap (px between neighbours; 1), body (top colour of the unlit ones), side (every side; default a darker tone of body), glow, lit ('top' | 'right' | 'bottom' | 'left' | 'all' | 'none'), depth (2), down, shine (true) }. Returns { tops: { top, right, bottom, left } } (padCap's top for each).
 */
export function padDiamond(g, cx, cy, { r = 5, gap = 1, body = '#8a8a9a', side, glow = '#e6c545', lit = 'top', depth = 2, down = false, shine = true } = {}) {
  const D = Math.ceil((2 * r + gap) / Math.SQRT2), sideC = side ?? tone(body, -0.8), tops = {};
  const at = { top: [0, -D], left: [-D, 0], right: [D, 0], bottom: [0, D] };
  for (const k of ['top', 'left', 'right', 'bottom']) {                       // the lower ones drawn last, in front
    const on = lit === 'all' || lit === k;
    tops[k] = padCap(g, cx + at[k][0], cy + at[k][1], r, { top: on ? glow : body, side: sideC, depth, down: on && down, shine }).top;
  }
  return { tops: { top: tops.top, right: tops.right, bottom: tops.bottom, left: tops.left } };
}

const ARM_DIR = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };

/**
 * Draws a direction pad as four separate padCap buttons round (cx, cy), each with a small arrow pointing out in a darker tone of its top; the arms named in `lit` have glowing tops and press with `down`.
 * Arguments: g, cx, cy, o: { reach (px from the centre to the far edge of a button; 12), body (top colour of the unlit ones), side (every side; default a darker tone of body), glow, lit (list of 'up', 'right', 'down', 'left'), depth (2), down, shine (true) }. Returns { arms: { up, right, down, left } } as boxes round each top.
 */
export function padDiscs(g, cx, cy, { reach = 12, body = '#8a8a9a', side, glow = '#e6c545', lit = [], depth = 2, down = false, shine = true } = {}) {
  const on = new Set(Array.isArray(lit) ? lit : [lit]), sideC = side ?? tone(body, -0.8);
  const r = Math.floor((reach / (Math.SQRT2 + 1)) * 2) / 2, D = reach - r, arms = {};
  for (const a of ['up', 'left', 'right', 'down']) {
    const [ux, uy] = ARM_DIR[a], topC = on.has(a) ? glow : body;
    const { top } = padCap(g, cx + ux * D, cy + uy * D, r, { top: topC, side: sideC, depth, down: on.has(a) && down, shine });
    // the arrow: a small triangle round the top's centre, its tip pointing out
    const mark = tone(topC, -0.9), m = Math.max(2, top.r * 0.6);
    fillRound(g, top.cx, top.cy, top.r, (px, py) => {
      const along = (px - top.cx) * ux + (py - top.cy) * uy, across = Math.abs((px - top.cx) * uy - (py - top.cy) * ux);
      return along >= -m * 0.5 && along <= m && across <= (m - along) * 0.75;
    }, mark);
    arms[a] = { x: Math.floor(top.cx - top.r), y: Math.floor(top.cy - top.r), w: Math.ceil(2 * top.r), h: Math.ceil(2 * top.r) };
  }
  return { arms: { up: arms.up, right: arms.right, down: arms.down, left: arms.left } };
}
