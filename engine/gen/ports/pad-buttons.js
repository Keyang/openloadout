// PORT (migration batch M9): a copy of engine/pad-buttons.js with its imports pointed at the port shims, so it draws paint
// refs on engine/gen/port-surface.js grids (engine/gen/ports/colour.js, surface.js). It is the drawing code of the M9
// port generators (engine/gen/ui-inputs.js, ui-hud.js, ui-bubbles.js, text.js), so it is NOT temporary: it stays when
// engine/pad-buttons.js goes (removal items R1 to R4 delete the engine original once its last code caller is gone) and goes
// only with the last generator version that draws with it (review M9 round 2, issue 6). A TRIMMED or HAND CHANGE note
// below says where it differs from its source; never change what a released generator version draws through it.
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
// TRIMMED (review M9 round 1, issue 3): the declarations and imports no M9 port reaches are left out, so the copy holds
// only what draws; what is kept is word for word as before.

import { tone } from './colour.js';

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
