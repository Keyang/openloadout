// PORT (migration batch E2): the drawing of the code sprite sprites/bubble-stream.js (its constants, helpers and render), word for
// word, with its imports pointed at the port shims and at the E2 copies of the engine helpers (engine/gen/ports/e2/), so
// it draws paint refs on an engine/gen/port-surface.js grid. It is the drawing of the effect generator effect.bubble-stream@1
// (engine/gen/fx-e2.js), which sprites/bubble-stream.json names; it goes only with the last version that draws with it. Its
// settings (p) are that generator's arguments; its colours are the paint refs the data file names. A HAND CHANGE note
// says where it differs from its source; never change what a released generator version draws through it.
import { lerp, hash, clamp } from '../../../motion.js';
import { mix } from '../colour.js';
import { PALETTE, swatches } from './palettes.js';
import { steps } from './fx.js';
import { risers, bubble } from './fumes.js';

const P = PALETTE.thornwood;
const CX = 32, ROOT = 60.5;                          // bubbles set off from row 60, round the middle
const BOX = [1, 1, 63, 62];
// The shine sits on each bubble, so the two lists share no colour.
const BUBBLES = swatches('thornwood', 'water', { lead: 'sky' });
const SHINE = [P.cream, P.gold, P.steel, '#d8d8e0', P.goblin];

// Radii whose pixel discs read round: between them a disc comes out square (2.9), pointed (3.0, 5.0) or with a square
// middle (2.5 .. 2.8), so a grown bubble steps from one of these to the next.
const ROUND = [2.3, 3.3, 3.7, 4.3, 4.6];
const roundBelow = (r) => { let k = r < ROUND[0] ? 1 : ROUND[0]; for (const v of ROUND) if (v <= r + 1e-6) k = v; return k; };

// One grown bubble round the pixel (X, Y): a rim, a see-through body a step darker than the skin, a crescent of skin
// on the lower left (the light caught on the far side) and the one-pixel shine at the top right, which only body
// pixels touch, so it stands out on every colour.
function grownBubble(g, X, Y, r, C, glint) {
  const [, , skin, rim] = C, body = mix(skin, rim, 0.6);
  const n = Math.ceil(r) + 1, inDisc = (dx, dy) => dx * dx + dy * dy <= r * r;
  const put = (x, y, c) => { if (x >= BOX[0] && x < BOX[2] && y >= BOX[1] && y < BOX[3]) g.dot(x, y, c); };
  for (let dy = -n; dy <= n; dy++) for (let dx = -n; dx <= n; dx++) {
    if (inDisc(dx, dy)) {
      const ring = dx * dx + dy * dy > (r - 1) * (r - 1);
      put(X + dx, Y + dy, ring && dy - dx >= 2 ? skin : body);
    } else if (inDisc(dx - 1, dy) || inDisc(dx + 1, dy) || inDisc(dx, dy - 1) || inDisc(dx, dy + 1)) put(X + dx, Y + dy, rim);
  }
  put(X + 1, Y - 1, glint);
}

// The radius bubble i grows to, by style: fizz is all small beads, big is a few large ones, mixed is some of each.
function grown(style, i, s) {
  const h = hash(i, 11);
  if (style === 'fizz') return h < lerp(0.75, 0.3, s) ? 1 : 2.3;   // bigger fizz: more of the beads are bubbles
  if (style === 'big') return lerp(2.9, 4.6, s) + 0.6 * h;
  return h < 0.4 ? lerp(3.2, 4.6, s) : lerp(2.3, 3.4, s);
}

// The pop takes the last eighth of a bubble's life: one frame step of the 8-frame loop, so every bubble shows its burst
// on exactly one frame before it is gone, whatever its timer.
const POP = 0.875;
// Small nudges that keep the rims of two bubbles from touching: at most 2 px sideways and 1 px up, never down, so each
// bubble stays on its riser's track and climbs evenly. Where no nudge clears it, the younger bubble is drawn a size smaller.
const NUDGE = [];
for (let dy = -1; dy <= 0; dy++) for (let dx = -2; dx <= 2; dx++) NUDGE.push([dx, dy, dx * dx + 0.6 * dy * dy]);
NUDGE.sort((a, b) => a[2] - b[2]);

// Where every bubble is this frame and what it is: a speck growing into a bubble, or one bursting.
function layout(t, p) {
  const up = lerp(32, 56, p.rise), wide = lerp(6, 34, p.spread), sway = lerp(0.4, 3.5, p.wobble);
  const list = risers({ t, x: CX, y: ROOT, count: p.pieces, rise: up, spread: wide, sway, seed: 7, box: [1, 1, 63, 66.5], pad: 5.5 });   // kept 5.5 px off the sides and top; free to start low
  list.sort((a, b) => b.life - a.life);                               // the high, old ones behind the young ones
  // what each one is this frame, and how far its pixels reach from its middle (rim and droplets included)
  const items = list.map((s) => {
    const R = roundBelow(grown(p.style, s.i, p.size));
    let r = 0, reach, pop = 0;
    if (s.life >= POP) { pop = 0.15 + 0.85 * (s.life - POP) / (1 - POP); reach = R + 0.5 + 2 * pop; }
    else {
      const grow = s.life < 0.06 ? 0.7 : lerp(Math.min(R, 2.3), R, Math.min(1, (s.life - 0.06) / 0.5));   // a speck that grows a little as it climbs
      r = grow < 2.3 ? Math.min(grow, 1) : roundBelow(grow);
      reach = r >= 2 ? r + 1 : 0.5;
    }
    return { s, R, r, pop, reach, x: Math.floor(s.x), y: Math.floor(s.y), x0: Math.floor(s.x), y0: Math.floor(s.y) };
  });
  const lo = BOX[0] + 5, hi = BOX[2] - 6;
  const clear = (b, j, x, y, gap) => items.slice(0, j).every((a) => (x - a.x) ** 2 + (y - a.y) ** 2 >= (a.reach + b.reach + gap) ** 2);
  const fits = (b, j, gap) => NUDGE.find(([dx, dy]) => { const x = b.x0 + dx, y = b.y0 + dy; return x >= lo && x <= hi && y >= BOX[1] + 4 && clear(b, j, x, y, gap); });
  items.forEach((b, j) => {
    let at = fits(b, j, 2) ?? fits(b, j, 1);
    // still crowded (many bubbles in a narrow stream): the younger bubble is squeezed a size smaller rather than pushed off its track
    if (!at && b.pop === 0) {
      for (const r of [...ROUND.filter((v) => v < b.r).reverse(), 1, 0.7]) {
        Object.assign(b, { r, reach: r >= 2 ? r + 1 : 0.5 });
        if ((at = fits(b, j, 1))) break;
      }
    }
    if (at) { b.x = b.x0 + at[0]; b.y = b.y0 + at[1]; }
  });
  return items;
}

/** Draws one frame of the effect as sprites/bubble-stream.js did: g (a PortSurface), { clip, t, frame, p } (p the settings, colours as paint refs). */
export function render(g, { t, p }) {
  const C = steps(p.body, { white: false });                         // [inside, inside shade, skin, rim]
  const items = layout(t, p);
  for (const b of items) {
    const cx = b.x + 0.5, cy = b.y + 0.5;
    if (b.pop > 0) bubble(g, cx, cy, b.R, C, { pop: b.pop, glint: p.core, box: BOX });
    else if (b.r >= 2) grownBubble(g, b.x, b.y, b.r, C, p.core);
    else bubble(g, cx, cy, b.r, C, { glint: p.core, box: BOX });
  }
}
