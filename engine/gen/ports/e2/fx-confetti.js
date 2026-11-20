// PORT (migration batch E2): the drawing of the code sprite sprites/confetti.js (its constants, helpers and render), word for
// word, with its imports pointed at the port shims and at the E2 copies of the engine helpers (engine/gen/ports/e2/), so
// it draws paint refs on an engine/gen/port-surface.js grid. It is the drawing of the effect generator effect.confetti@1
// (engine/gen/fx-e2.js), which sprites/confetti.json names; it goes only with the last version that draws with it. Its
// settings (p) are that generator's arguments; its colours are the paint refs the data file names. A HAND CHANGE note
// says where it differs from its source; never change what a released generator version draws through it.
import { lerp, clamp, easeOut, hash, TAU, PI } from '../../../motion.js';
import { tone } from '../colour.js';
import { PALETTE } from './palettes.js';
import { shards, twinkle } from './fx.js';
import { sparkFlash } from './bursts.js';
import { bolt } from './spells.js';

const P = PALETTE.thornwood;
const X = 32, Y = 32;                                   // where the pieces are thrown from
const BOX = [1, 1, 63, 63];
// Pieces of different colours touch in the cloud, so the three lists share no colour.
const BODY = [P.crimson, P.ember, P.thorn, P.soil];
const ACCENT = [P.gold, P.moss, P.goblin, P.grass];
const TRIM = [P.hero, P.magic, P.cream, P.sky];

// The throw for one clip: how far, how wide, how fast the pieces fall (all from the sliders).
function throwOf(p) {
  return {
    dist: lerp(25, 33, p.spread) * lerp(0.9, 1.1, p.size),
    arc: lerp(2.8, 4, p.spread),
    fall: 60,
    piece: lerp(3.6, 5.2, p.size),
  };
}

// Where piece i of colour group j is at phase k (0..1), on the same path shards() gives its triangles,
// plus a flutter from side to side once it has slowed down. Returns { x, y, turn }.
function flight(i, j, k, T) {
  const s = 11 + j * 7, h = (ch) => hash(i, s * 64 + ch);
  const a = PI + (h(2) - 0.5) * T.arc;
  const d = T.dist * (0.5 + 0.5 * h(3)) * easeOut(k);
  const flutter = 1.6 * Math.sin(TAU * (1.6 * k + h(8))) * clamp(k * 2);
  return {
    x: X + Math.sin(a) * d + flutter,
    y: Y + Math.cos(a) * d + T.fall * k * k * (0.6 + 0.4 * h(4)),
    turn: TAU * (h(6) + 2.5 * (h(7) - 0.5) * 2 * k),
  };
}

const inside = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/** Draws one frame of the effect as sprites/confetti.js did: g (a PortSurface), { clip, t, frame, p } (p the settings, colours as paint refs). */
export function render(g, { t, frame, p }) {
  const T = throwOf(p);
  const cols = [p.body, p.accent, p.trim];
  const count = (j) => Math.floor((p.pieces + 2 - j) / 3);               // the pieces shared out over the three colours

  // the pop: biggest on frame 0, gone by frame 3
  const pop = [lerp(7, 11, p.size), lerp(4, 6, p.size), 2][frame];
  if (pop) sparkFlash(g, X - 0.5, Y - 0.5, pop, 'plus', [P.cream, p.accent, tone(p.accent, -1)]);

  if (p.style === 'paper') {
    cols.forEach((c, j) => shards(g, { t, x: X, y: Y, count: count(j), seed: 11 + j * 7, dist: T.dist, gravity: T.fall, size: T.piece, angle: PI, arc: T.arc, spin: 2.5, colour: c, box: BOX }));
    return;
  }

  cols.forEach((c, j) => {
    for (let i = 0; i < count(j); i++) {
      const f = flight(i, j, t, T);
      const x = inside(f.x, 3, 60), y = inside(f.y, 3, 61);
      if (p.style === 'streamers') {
        // a short wavy ribbon trailing its head; it shortens and lies flat as it lands
        const L = lerp(lerp(4, 7, hash(i, j + 40)), 2, clamp((t - 0.7) / 0.3)) * lerp(0.85, 1.15, p.size);
        const lie = clamp((t - 0.75) / 0.25), ang = lerp(f.turn, PI / 2, lie);
        const x1 = inside(x - Math.sin(ang) * L, 2, 61), y1 = inside(y - Math.cos(ang) * L, 2, 61);
        bolt(g, { x0: x, y0: y, x1, y1, kinks: 2, zigzag: lerp(1, 0.3, lie), sway: 0.8, width: 1, forks: 0, seed: i * 3 + j, colours: [c], box: [x - 9, y - 9, x + 10, y + 10] });
      } else {
        // glitter: each grain blinks between a plus and a dot on its own beat; it lands as one pixel
        const big = t < 0.85 && (frame + Math.floor(hash(i, j + 60) * 3)) % 3 !== 0;
        twinkle(g, x, y, big ? (p.size > 0.6 && frame < 4 ? 2 : 1) : 0, big ? c : tone(c, -1), { core: '#ffffff', box: BOX });
      }
    }
  });
}
