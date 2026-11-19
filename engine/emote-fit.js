// Emote fit (added with sprite batch K24, bundles/specs/core-sprites-3.md, emote-bubbles "Fit"): how far an emote of
// engine/emotes.js reaches over its whole motion, and the biggest one that fits a box with its motion, so a mark set
// inside a balloon, a plate or a slot never touches what is round it. Pure: runs in Node and the browser.
//
//   import { fitEmote } from '../engine/emote-fit.js';
//
//   const f = fitEmote(p.emote, out.inner, { bounce: 0, rim: false, scales: [0.6, 1.15] });   // out: speechBubble's
//   drawEmote(g, p.emote, f.cx, f.by, Math.round(f.size * pop), { t, bounce: 0, rim: false, colour: p.accent });
//
// The reach covers the idle loop (`frames` phases of t at `size`) and one still frame (t = 0) at round(size x s) for
// each scale s (a pop's small and overshooting frames), all drawn the way drawEmote draws them (rim, ink, shadow).

import { Surface } from './surface.js';
import { drawEmote } from './emotes.js';

const SCRATCH = 96, AT_X = 48, AT_Y = 64;   // a scratch surface roomy enough for the biggest emote and its motion

/**
 * How far an emote reaches over its motion, from its centre column and its bottom row: { left, right, up, down } in px, counting every pixel drawEmote draws (ink, rim and shadow included).
 * Arguments: kind (one of EMOTES of engine/emotes.js); size (10 to 20); options { bounce, bold, rim (default false), shadow (default false), frames (idle phases, default 8), scales (extra sizes as factors of size, drawn at t 0; default none) }.
 */
export function emoteReach(kind, size, { bounce = 0.5, bold = false, rim = false, shadow = false, frames = 8, scales = [] } = {}) {
  const shots = [];
  const n = Math.max(1, Math.round(frames));
  for (let i = 0; i < n; i++) shots.push([size, i / n]);
  for (const s of scales) shots.push([Math.round(size * s), 0]);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [sz, t] of shots) {
    const g = new Surface(SCRATCH, SCRATCH);
    drawEmote(g, kind, AT_X, AT_Y, sz, { t, bounce, bold, rim, shadow, colour: '#808080', edge: '#c0c0c0' });
    const b = g.bounds();
    if (!b) continue;
    x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
  }
  if (x1 < x0) return { left: 0, right: 0, up: 0, down: 0 };
  return { left: AT_X - x0, right: x1 - AT_X, up: AT_Y - y0, down: y1 - AT_Y };
}

/**
 * The biggest emote whose every frame (as emoteReach counts them) stays inside a box less a margin, and where to draw it: { size, cx, by, fits }, centred in the box; fits is false when even the smallest size is too big (it is then that size, centred).
 * Arguments: kind; box ({ x, y, w, h }: such as a balloon's inner); options as emoteReach plus { margin (px kept clear inside the box, default 1), min (default 10), max (default 20) }.
 */
export function fitEmote(kind, box, { margin = 1, min = 10, max = 20, ...opt } = {}) {
  const W = box.w - 2 * margin, H = box.h - 2 * margin;
  let size = min, r = emoteReach(kind, min, opt), fits = r.left + r.right + 1 <= W && r.up + r.down + 1 <= H;
  if (fits) {
    for (let s = min + 1; s <= max; s++) {
      const q = emoteReach(kind, s, opt);
      if (q.left + q.right + 1 > W || q.up + q.down + 1 > H) break;
      size = s; r = q;
    }
  }
  const cx = box.x + margin + r.left + Math.floor((W - (r.left + r.right + 1)) / 2);
  const by = box.y + margin + r.up + Math.round((H - (r.up + r.down + 1)) / 2);
  return { size, cx, by, fits };
}
