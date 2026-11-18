// Effects for a game seen from above (the three-quarter view of docs/style-guide.md section 1): what trails
// behind a dash, what is marked on the floor, and what is thrown across it. Added with batch S19 (dodge-trail,
// spawn-warp, debris-burst); it goes with engine/fx.js and follows its rules: hard pixel edges, no Math.random,
// everything inside the frame's 1 px empty border (or inside `box`), and a one-shot never ends on an empty frame.
// Every function draws through the Surface's own calls (fill, dot), so it suits any style that has them.
//
//   import { steps } from '../engine/fx.js';
//   import { afterimages, speedLines, figureIn, streaksIn, smearIn, floorRing, lightShape, riftIn, scrap, splash } from '../engine/fx-floor.js';
//   const C = steps(p.edge, { core: p.core, white: false });                       // [core, middle, edge, rim]
//   afterimages(g, { t, x: 33, y: 24, count: 3, step: 9, colours: C, white: '#ffffff',   // three fading blurs behind a dash to the right
//     smear: 5, shape: (cx, cy, s) => figureIn(cx, cy, 12 * s, 20 * s, { lean: 3 * s }) });
//   speedLines(g, { t, x: 30, y: 24, count: 4, length: 12, spread: 9, colours: C });     // and the lines beside them
//   floorRing(g, { x: 24, y: 24, r: 16, colours: C, heat: 1 });                    // a warning ring lying on the floor
//   floorRing(g, { x: 24, y: 24, r: 20, thick: 2, gaps: 8, open: 0.7, phase: TAU * t / 8, colours: [C[2], C[2]], rim: false });   // tick marks turning round it
//   lightShape(g, riftIn(24, 14, 20, 8, { angle: PI / 2 }), { colours: C, heart: C[0] });   // a jagged tear of light standing over it
//   scrap(g, { t, x: 24, y: 24, count: 6, shape: 'plates', colour: p.body, rim: INK });  // inked metal flung from a wreck
//   splash(g, { t, x: 24, y: 24, count: 6, colour: p.accent });                    // slime that lands and flattens
//
// Shared options: t (clip phase 0..1), seed (another seed, another repeatable pattern), colours (a list, hottest
// first, the last is the rim: usually steps(...)) or colour (one colour, turned into such a list), box
// ([x0, y0, x1, y1]: draw only inside it). A floor seen from above is squashed: `squash` is how tall a circle on it
// looks as a share of its width (1: straight down, the default 0.6: the three-quarter camera).
// Angles that say which way something points or trails use the rig convention (0 = down, PI / 2 = right, PI = up).
// Light (rings, trails) is drawn AFTER g.outline and is rimmed with a dark tone of its own colour; scrap is a solid
// thing: give it rim: INK, or draw it on a scratch Surface and outline that.

import { tone, ramp } from './color.js';
import { hash, clamp, lerp, easeOut, smooth, TAU, PI } from './motion.js';
import { polyIn } from './surface.js';
import { ngonPoints } from './solids.js';
import { splatIn } from './plating.js';
import { insetIn } from './shapes.js';
import { steps, stepAt, lifeOf } from './fx.js';

// ---- shared -------------------------------------------------------------------------------------------------

function boxOf(g, box) {
  const b = [1, 1, g.w - 1, g.h - 1];
  if (box) { b[0] = Math.max(b[0], Math.floor(box[0])); b[1] = Math.max(b[1], Math.floor(box[1])); b[2] = Math.min(b[2], Math.floor(box[2])); b[3] = Math.min(b[3], Math.floor(box[3])); }
  return b;
}
const within = (B) => (px, py) => px >= B[0] && py >= B[1] && px < B[2] && py < B[3];
const put = (g, B, x, y, c) => { x = Math.floor(x); y = Math.floor(y); if (x >= B[0] && y >= B[1] && x < B[2] && y < B[3]) g.dot(x, y, c); };
const coloursOf = (o, fallback) => (Array.isArray(o.colours) && o.colours.length ? o.colours : steps(o.colour ?? fallback, { white: false }));
const keepIn = (v, lo, hi) => (hi <= lo ? (lo + hi) / 2 : Math.min(Math.max(v, lo), hi));
/** Fill a shape test over the whole box (the shapes here have no simple bounds). */
const fillIn = (g, B, test, paint, opt = {}) => g.fill(B[0], B[1], B[2] - 1, B[3] - 1, test, paint, { clip: within(B), ...opt });

// ---- trails -------------------------------------------------------------------------------------------------

/**
 * Shape test for the blur of a small figure: a round head on a narrower rounded body, w px wide and h px tall, centred on (cx, cy); it can lean into a run and stand on two legs.
 * Arguments: cx, cy (centre); w, h (size in pixels); options { head (the head's share of the height, default 0.5), waist (the body's width as a share of the head's, default 0.7), lean (px the top of the head is ahead of the feet: positive leans to the right; default 0), legs (px of gap between two legs, measured up from the feet; default 0: one rounded foot) }.
 */
export function figureIn(cx, cy, w, h, { head = 0.5, waist = 0.7, lean = 0, legs = 0 } = {}) {
  const top = cy - h / 2, bottom = cy + h / 2;
  const hx = Math.max(0.6, w / 2), hy = Math.max(0.6, (h * clamp(head, 0.2, 1)) / 2);
  const br = Math.max(0.5, Math.min((w * waist) / 2, h / 2));
  const y0 = Math.min(top + hy, bottom - br), y1 = legs > 0 ? bottom : bottom - br;
  const slope = h > 0 ? lean / h : 0;
  return (px, py) => {
    const qx = px - cx - slope * (cy - py);            // upright again: the head's lean taken out
    if ((qx / hx) ** 2 + ((py - (top + hy)) / hy) ** 2 <= 1) return true;
    if (py > bottom) return false;
    if (legs > 0 && py > bottom - legs && Math.abs(qx) < 0.5) return false;      // the gap between the legs
    const qy = Math.min(Math.max(py, y0), y1);
    return qx ** 2 + (py - qy) ** 2 <= br * br;
  };
}

/**
 * Shape test for the streaks a fast shape drags behind it: thin lines of uneven length that trail from its far side along every other row, without the shape itself.
 * Arguments: test (a shape test); options { reach (px the longest streak trails, default 6), angle (the way they trail, default -PI / 2: to the left), pitch (rows from one streak to the next, default 2), seed }.
 */
export function streaksIn(test, { reach = 6, angle = -PI / 2, pitch = 2, seed = 0 } = {}) {
  const step = Math.max(1, Math.round(pitch)), ux = Math.sin(angle), uy = Math.cos(angle);
  return (px, py) => {
    if (test(px, py)) return false;
    const row = Math.floor(px * uy - py * ux);           // which line, counted across the trail
    if (((row % step) + step) % step) return false;
    const len = Math.round(reach * (0.35 + 0.65 * hash(row, seed * 64 + 3)));
    for (let k = 1; k <= len; k++) if (test(px - ux * k, py - uy * k)) return true;
    return false;
  };
}

/**
 * A shape dragged into a motion blur: the shape itself plus the streaks of streaksIn() trailing from it.
 * Arguments: test (a shape test); options { reach, angle, pitch, seed } as streaksIn().
 */
export function smearIn(test, opt = {}) {
  const tail = streaksIn(test, opt);
  return (px, py) => test(px, py) || tail(px, py);
}

/**
 * Fading copies of a shape left behind something fast: the newest is nearest the mover and hottest, each older one sits further back, smaller and cooler, and the oldest goes first; one-shot over the clip.
 * Arguments: g (the Surface); o: { t, x, y (the middle of the newest copy), count (default 3), step (px from one copy to the next, default 8), angle (the way they trail, default -PI / 2: to the left), shape ((cx, cy, scale, i) => the shape test of copy i, 0 being the newest; required), colours | colour (hottest first, the last is the rim), white (a colour for the heart of the newest copy at t = 0 only; default none), shrink (0..1: how much smaller a copy ends, default 0.55), drift (px every copy slides back over the clip, default 2), smear (px: each copy also drags streaks of its own colour, with no rim, that far behind it; default 0), box }. Each copy is rimmed with the rim colour and has a hotter heart while it is young (the hottest colour is only ever a heart), turns the rim colour all over just before it goes, and the newest is still there at t = 1, so the last frame is never empty.
 */
export function afterimages(g, o) {
  const { t = 0, x, y, count = 3, step = 8, angle = -PI / 2, shape, white = null, shrink = 0.55, drift = 2, smear = 0 } = o;
  if (typeof shape !== 'function') throw new Error('fx-floor afterimages: pass shape: (cx, cy, scale, i) => a shape test');
  const B = boxOf(g, o.box), clip = within(B);
  const C = coloursOf(o, '#5fe0f0'), n = C.length, rim = C[n - 1];
  const k = clamp(t), ux = Math.sin(angle), uy = Math.cos(angle);
  const N = Math.max(1, Math.round(count));
  for (let i = N - 1; i >= 0; i--) {                     // the oldest first, the newest in front
    const age = N === 1 ? 0 : i / (N - 1);
    const ki = clamp(k / lerp(1, 0.45, age));             // the oldest is gone before half the clip
    if (ki >= 1 && i > 0) continue;
    const back = step * i + drift * k;
    const cx = x + ux * back, cy = y + uy * back;
    const test = shape(cx, cy, (1 - 0.14 * age) * (1 - clamp(shrink) * ki ** 1.5), i);
    let drew = false;
    const seen = (px, py) => { const on = test(px, py); if (on && clip(px, py)) drew = true; return on; };
    if (ki > 0.8) {                                      // going: one dark colour, no rim, so it is thinner too
      fillIn(g, B, seen, rim);
    } else {
      // the body takes the colours after the hottest; the hottest is only ever a young copy's heart
      const heat = (1 - ki) * clamp(1 - 1.1 * age);
      const idx = n <= 2 ? 0 : heat >= 0.5 ? 1 : Math.min(n - 2, 1 + Math.ceil((0.5 - heat) * 2 * (n - 3)));
      if (smear > 0) fillIn(g, B, streaksIn(test, { reach: smear, angle, seed: i + 1 }), C[idx]);
      fillIn(g, B, seen, C[idx], { outline: rim });
      const heart = i === 0 && k === 0 && white ? white : idx > 0 && heat > 0.2 && ki < 0.55 ? C[idx - 1] : null;
      if (heart) fillIn(g, B, insetIn(test, 2), heart);
    }
    if (!drew) { put(g, B, keepIn(cx, B[0], B[2] - 1), keepIn(cy, B[1], B[3] - 2), rim); put(g, B, keepIn(cx, B[0], B[2] - 1), keepIn(cy, B[1], B[3] - 2) + 1, rim); }
  }
}

/**
 * Speed lines left behind something fast, for a one-shot: straight 1 px lines side by side that slide back, shorten and cool over the clip, each after a short delay of its own; the last frame keeps a pixel or two of each.
 * Arguments: g (the Surface); o: { t, x, y (the middle of their leading ends), count (default 4), length (px, the longest at t = 0, default 10), spread (px from the middle to the outermost line, default 8), reach (px they slide back over the clip, default 5), angle (the way they trail, default -PI / 2: to the left), stagger (0..1: how far apart their delays are, default 0.3), colours | colour (hottest first, the last is the rim), seed, box }.
 */
export function speedLines(g, o) {
  const { t = 0, x, y, count = 4, length = 10, spread = 8, reach = 5, angle = -PI / 2, stagger = 0.3, seed = 0 } = o;
  const B = boxOf(g, o.box);
  const C = coloursOf(o, '#5fe0f0');
  const ux = Math.sin(angle), uy = Math.cos(angle);
  const N = Math.max(1, Math.round(count));
  const h = (i, ch) => hash(i, seed * 64 + ch);
  for (let i = 0; i < N; i++) {
    const k = lifeOf(t, i, { seed, loop: false, stagger });
    const side = N === 1 ? 0 : Math.round(((i + 0.5) / N - 0.5) * 2 * spread);
    const full = length * (0.55 + 0.45 * h(i, 2));
    const len = Math.max(k >= 1 ? 1 : 2, Math.round(full * (1 - 0.85 * k)));
    const d = (length - full) * 0.6 + 3 * h(i, 3) + reach * easeOut(k);
    const hot = stepAt(C, 1 - 0.8 * k), cool = stepAt(C, 0.6 * (1 - k));
    for (let j = 0; j < len; j++) {
      // kept inside the box along its own row or column, so a long line near the edge is shortened, never lost
      const px = keepIn(x + ux * (d + j) - uy * side, B[0], B[2] - 1), py = keepIn(y + uy * (d + j) + ux * side, B[1], B[3] - 1);
      put(g, B, px, py, j < len * 0.4 ? hot : cool);
    }
  }
}

// ---- marks on the floor ---------------------------------------------------------------------------------------

/**
 * A steady ring of light lying on a floor seen from above: round or with straight sides, whole or broken into arcs, squashed as the camera sees a floor, with a hotter inner line and a dark rim of its own colour outside.
 * Arguments: g (the Surface); o: { x, y (centre), r (px from the centre to its outer edge, across), squash (default 0.6), thick (px of the band, default 2), sides (0: round, the default; 3 or more: a polygon with that many sides), turn (radians: turns a polygon about its upright axis), gaps (how many breaks, default 0), open (0..1: the share of the ring the breaks take, default 0.3), phase (radians: moves the breaks round), heat (0..1: above 0.66 the inner line is the hottest colour, above 0.33 the next, below that the band is one colour; default 1), colours | colour (hottest first; the band takes the last but one, the rim the last), rim (false: no rim), box }. A ring too small to show is one pixel pair at its centre.
 */
export function floorRing(g, o) {
  const { x, y, r = 12, squash = 0.6, thick = 2, sides = 0, turn = 0, gaps = 0, open = 0.3, phase = 0, heat = 1 } = o;
  const B = boxOf(g, o.box);
  const C = coloursOf(o, '#e2473f'), n = C.length, rim = C[n - 1], band = C[Math.max(0, n - 2)];
  const sq = Math.max(0.1, squash), th = Math.max(1, Math.round(thick));
  const rx = r, ry = r * sq;
  if (rx < 1.2 || ry < 0.8) { put(g, B, x - 1, y, band); put(g, B, x, y, band); return; }
  const N = Math.round(sides);
  const shapeAt = (d) => {                               // the ring's outline pulled in by d px across and down
    const ax = rx - d, ay = ry - d;
    if (ax <= 0 || ay <= 0) return () => false;
    return N >= 3 ? polyIn(ngonPoints(x, y, ax, ay, N, turn)) : (px, py) => ((px - x) / ax) ** 2 + ((py - y) / ay) ** 2 <= 1;
  };
  const G = Math.max(0, Math.round(gaps));
  const whole = (px, py) => {
    if (!G) return true;
    const u = ((Math.atan2((py - y) / sq, px - x) - phase) / TAU) * G;
    return u - Math.floor(u) >= clamp(open);
  };
  const outer = shapeAt(0), inner = shapeAt(th), line = shapeAt(th - 1), halo = shapeAt(-1);
  if (o.rim !== false) fillIn(g, B, (px, py) => halo(px, py) && !outer(px, py) && whole(px, py), rim);
  fillIn(g, B, (px, py) => outer(px, py) && !inner(px, py) && whole(px, py), band);
  const hot = heat > 0.66 ? C[0] : heat > 0.33 ? C[Math.min(1, n - 1)] : null;
  if (hot && th >= 2) fillIn(g, B, (px, py) => line(px, py) && !inner(px, py) && whole(px, py), hot);
}

/**
 * Paints any shape as a thing made of light: the shape in one colour, a rim of a darker colour round it in place of an ink line, and a hotter heart a pixel or two inside. Draw it after g.outline.
 * Arguments: g (the Surface); test (a shape test); options { colours | colour (the shape takes the last colour but one, the rim the last), heart (a colour for the inside, for example the core colour, or white on the first frame of a burst; default none), inset (px the heart lies inside the shape's edge, default 1), rim (false: no rim), box }.
 */
export function lightShape(g, test, o = {}) {
  const B = boxOf(g, o.box);
  const C = coloursOf(o, '#e2473f'), n = C.length;
  fillIn(g, B, test, C[Math.max(0, n - 2)], o.rim === false ? {} : { outline: C[n - 1] });
  if (o.heart) fillIn(g, B, insetIn(test, Math.max(1, Math.round(o.inset ?? 1))), o.heart);
}

/**
 * Shape test for a tear: a jagged crack with pointed ends that zigzags from side to side, w px long and about h px across where it is widest; `open` closes it down to a hairline that is still one pixel thick.
 * Arguments: cx, cy (centre); w, h (its length, and how far it reaches across with its zigzag, in pixels); options { seed, teeth (how many times it turns, default 3), jag (0..1: how much of h is zigzag and how little is opening, default 0.5), open (0..1, default 1), angle (radians, clockwise on screen; default 0: lying across; PI / 2: standing up) }.
 */
export function riftIn(cx, cy, w, h, { seed = 0, teeth = 3, jag = 0.5, open = 1, angle = 0 } = {}) {
  const c = Math.cos(angle), s = Math.sin(angle), half = Math.max(0.5, w / 2);
  const ph = hash(seed, 1), j = clamp(jag);
  const tri = (v) => Math.abs(((v % 1) + 1) % 1 - 0.5) * 4 - 1;       // -1..1..-1, once per whole number
  return (px, py) => {
    const dx = px - cx, dy = py - cy;
    const lx = dx * c + dy * s, ly = dy * c - dx * s;
    const u = lx / half;
    if (u < -1 || u > 1) return false;
    const taper = (1 - Math.abs(u)) ** 0.7;                           // both the zigzag and the opening die away to the ends
    const mid = (h / 2) * j * taper * tri(((u + 1) / 2) * teeth + ph);
    return Math.abs(ly - mid) <= Math.max(0.5, (h / 2) * (1 - j) * clamp(open) * taper);
  };
}

// ---- thrown across the floor ---------------------------------------------------------------------------------

/** The piece shapes scrap() knows: flat plates with a torn corner, pointed shards, and bolts with a head. No arguments: a frozen list. */
export const SCRAP_SHAPES = Object.freeze(['plates', 'shards', 'bolts']);

/** Where piece i of a throw is at clip phase k: on the floor (gx, gy), how high it is (z) and how far through its flight (a: 1 once landed, at T). */
function thrown(i, k, { x, y, count, seed, dist, squash, hop, land, from = 0 }) {
  const h = (ch) => hash(i, seed * 64 + ch);
  const a0 = (TAU * (i + 0.4 * (h(2) - 0.5))) / count + TAU * hash(seed, 91);
  const far = dist * (i % 2 ? 0.5 + 0.25 * h(3) : 0.78 + 0.22 * h(3));          // near and far in turn, so the floor between fills
  const T = Math.max(0.15, land * (0.7 + 0.3 * h(4)));
  const a = Math.min(1, lerp(clamp(from), 1, k / T)), e = easeOut(a);
  return { a, T, gx: x + Math.cos(a0) * far * e, gy: y + Math.sin(a0) * far * squash * e, z: hop * (0.5 + 0.5 * h(5)) * 4 * a * (1 - a), h };
}

/**
 * Solid pieces flung across a floor seen from above: they fly out all round, hop, tumble and come to rest; `keep` of them stay where they land and the rest dwindle away, so the last frame is never empty. One-shot over the clip.
 * Arguments: g (the Surface); o: { t, x, y, count (default 6), keep (how many stay to the end, default 3), seed, shape (one of SCRAP_SHAPES, default 'plates'), dist (px the farthest flies, across; default 14), squash (how much shorter a throw up or down the screen is, default 0.75), hop (px the highest rises off the floor, default 5), size (px long, default 6), spin (turns a piece makes before it rests, default 1; 0: they slide out without turning, lying as they will rest), from (0..1: how far through the throw they already are at t = 0, default 0: all in one heap), land (0..1: when the last one lands, default 0.7), colour (shaded with its ramp, lit edge and dark edge), rim (a colour to rim every piece with, for example the outline colour; default none), box }.
 */
export function scrap(g, o) {
  const { t = 0, x, y, count = 6, keep = 3, seed = 0, shape = 'plates', dist = 14, squash = 0.75, hop = 5, size = 6, spin = 1, land = 0.7, from = 0, colour = '#9aa6c0', rim = null } = o;
  if (!SCRAP_SHAPES.includes(shape)) throw new Error(`fx-floor scrap: shape "${shape}" is not one of ${SCRAP_SHAPES.join(', ')}`);
  const B = boxOf(g, o.box), clip = within(B);
  const R = ramp(colour);
  const k = clamp(t), N = Math.max(1, Math.round(count)), K = Math.min(N, Math.max(1, Math.round(keep)));
  const list = [];
  for (let i = 0; i < N; i++) {
    const P = thrown(i, k, { x, y, count: N, seed, dist, squash, hop, land, from }), h = P.h;
    const stays = Math.floor((i * K) / N) !== Math.floor(((i - 1) * K) / N);            // the keepers are spread round the circle
    const fade = stays ? 1 : 1 - smooth((k - P.T) / Math.max(0.05, 0.97 - P.T));
    const L = size * (0.75 + 0.5 * h(6)) * (shape === 'bolts' ? 0.85 : 1) * fade;
    if (L < 1.4) continue;                                                              // dwindled away
    const way = h(8) < 0.5 ? -1 : 1;
    const rest = (PI / 4) * Math.floor(h(7) * 4);                                       // it comes to rest square to the grid or at 45 degrees, so its edges stay crisp
    const rot = rest + TAU * spin * way * (0.6 + 0.4 * h(9)) * (1 - easeOut(P.a));
    const fly = clamp((P.a - clamp(from)) / Math.max(1e-6, 1 - clamp(from)));
    const flip = spin ? 0.3 + 0.7 * Math.abs(Math.cos(PI * Math.max(1, Math.round(spin)) * fly + 2.4 * (h(10) - 0.5) * Math.sin(PI * fly))) : 1;   // a plate turning over shows more of its edge, each in its own time; flat when thrown and when it lands
    const pad = L / 2 + 1.5;
    list.push({ L, rot, flip, z: P.z, cx: keepIn(P.gx, B[0] + pad, B[2] - pad), cy: keepIn(P.gy - P.z, B[1] + pad, B[3] - pad) });
  }
  list.sort((p, q) => p.z - q.z);                          // the ones on the floor first, the ones in the air in front
  for (const P of list) {
    const c = Math.cos(P.rot), s = Math.sin(P.rot), L = P.L, hl = L / 2;
    const hw = Math.max(0.8, (Math.max(2.4, L * 0.62) / 2) * (shape === 'bolts' ? 1 : P.flip));
    const piece = shape === 'shards'
      ? (u, v) => u >= -hl && u <= hl && Math.abs(v) <= Math.max(0.5, hw * (hl - u) / L)
      : shape === 'bolts'
        ? (u, v) => (u >= -hl && u <= hl - 1.6 && Math.abs(v) <= 0.95) || (u > hl - 2.2 && u <= hl && Math.abs(v) <= Math.max(1.9, hw))
        : (u, v) => Math.abs(u) <= hl && Math.abs(v) <= hw && !(L >= 5 && u - v > hl + hw - 1.7);
    let drew = false;
    const inside = (px, py) => { const dx = px - P.cx, dy = py - P.cy; const on = piece(dx * c + dy * s, dy * c - dx * s); if (on && clip(px, py)) drew = true; return on; };
    g.fill(P.cx - L, P.cy - L, P.cx + L, P.cy + L, inside, R, { shade: L >= 3.5 ? 1 : 0, light: L >= 5 ? 1 : 0, clip, ...(rim ? { outline: rim } : {}) });
    if (!drew) { g.fill(P.cx - 1, P.cy - 1, P.cx + 1, P.cy + 1, (px, py) => Math.abs(px - P.cx) <= 1 && Math.abs(py - P.cy) <= 0.75, R, { shade: 0, clip, ...(rim ? { outline: rim } : {}) }); }
  }
}

/**
 * Blobs of something wet thrown across a floor seen from above: they fly out as round drops, land, and flatten into lumpy puddles round a bigger puddle where it burst. One-shot over the clip; the puddles stay to the end.
 * Arguments: g (the Surface); o: { t, x, y, count (default 6), seed, dist (px the farthest flies, across; default 14), squash (default 0.75), hop (px the highest rises off the floor, default 4), size (px across a flying blob, default 5), pool (px across the middle puddle at the end, default 1.7 * size; 0: none), drops (how many single-pixel droplets fly past the blobs, default count), land (0..1: when the last blob lands, default 0.65), from (0..1: how far through the throw the blobs already are at t = 0, default 0: all in one ball), colour (the liquid: round and shaded in the air, flat once it lies), rim (default: a dark tone of the colour), glint (the colour of the wet highlight on a flying blob; default its light tone; null: none), box }.
 */
export function splash(g, o) {
  const { t = 0, x, y, count = 6, seed = 0, dist = 14, squash = 0.75, hop = 4, size = 5, land = 0.65, from = 0, colour = '#9fe040' } = o;
  const B = boxOf(g, o.box), clip = within(B);
  const R = ramp(colour), rim = o.rim ?? tone(colour, -1), glint = o.glint === undefined ? R.light : o.glint;
  const round = { base: colour, light: R.light, dark: tone(colour, -0.5) };       // a flying blob's shade is softer than its rim
  const k = clamp(t), N = Math.max(0, Math.round(count));
  const pool = o.pool ?? 1.7 * size, drops = Math.max(0, Math.round(o.drops ?? N));
  const shapes = [];                                       // { test, flat, cx, cy, r }
  // the middle: a ball that bursts, sinks and spreads into the big puddle
  if (pool > 0 || k < 0.25) {
    const ball = size * 1.15 * (1 - smooth(k / 0.3));
    const spreadR = (Math.max(pool, 2) / 2) * lerp(0.55, 1, easeOut(k));
    if (ball > spreadR * 0.8 || pool <= 0) { if (ball >= 0.8) shapes.push({ flat: false, cx: x, cy: y, r: ball, test: (px, py) => (px - x) ** 2 + (py - y) ** 2 <= ball * ball }); }
    else shapes.push({ flat: true, cx: x, cy: y, r: spreadR, test: splatIn(x, y, spreadR / 0.85, { seed: seed * 7 + 1, lobes: 5, drops: 0, squash }) });
  }
  for (let i = 0; i < N; i++) {
    const P = thrown(i, k, { x, y, count: N, seed: seed + 3, dist, squash, hop, land, from }), h = P.h;
    const r0 = (size / 2) * (0.7 + 0.5 * h(6));
    if (P.a < 1) {
      const r = Math.max(0.8, r0 * lerp(0.75, 1, P.a)), cx = keepIn(P.gx, B[0] + r + 1, B[2] - r - 1), cy = keepIn(P.gy - P.z, B[1] + r + 1, B[3] - r - 1);
      shapes.push({ flat: false, cx, cy, r, test: (px, py) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r });
    } else {
      const grow = smooth((k - P.T) / Math.max(0.05, 1 - P.T)), r = r0 * lerp(1.1, 1.45, grow);
      const cx = keepIn(P.gx, B[0] + r * 1.7 + 1, B[2] - r * 1.7 - 1), cy = keepIn(P.gy, B[1] + r * 1.7 * squash + 1, B[3] - r * 1.7 * squash - 1);
      shapes.push({ flat: true, cx, cy, r, test: splatIn(cx, cy, r / 0.85, { seed: seed * 7 + i + 2, lobes: 2, drops: grow > 0.4 ? 1 : 0, squash }) });
    }
  }
  // every rim first, then every body: puddles that touch run into one
  for (const S of shapes) fillIn(g, B, S.test, rim, { outline: rim });
  for (const S of shapes) {
    if (S.flat) { fillIn(g, B, S.test, R.base); if (glint && S.r >= 2.5) put(g, B, S.cx + S.r * 0.3, S.cy - S.r * 0.25 * squash, R.light); }
    else {
      g.fill(S.cx - S.r, S.cy - S.r, S.cx + S.r, S.cy + S.r, S.test, round, { shade: S.r >= 2 ? 1 : 0, clip });
      if (glint && S.r >= 2) put(g, B, S.cx + S.r * 0.35, S.cy - S.r * 0.45, glint);
    }
  }
  // droplets: single pixels that fly further and lie where they fall
  for (let i = 0; i < drops; i++) {
    const P = thrown(i, k, { x, y, count: Math.max(1, drops), seed: seed + 11, dist: dist * 1.25, squash, hop: hop * 1.4, land: Math.min(1, land * 1.15) });
    put(g, B, keepIn(P.gx, B[0], B[2] - 1), keepIn(P.gy - P.z, B[1], B[3] - 1), P.a < 1 ? R.base : rim);
  }
}
