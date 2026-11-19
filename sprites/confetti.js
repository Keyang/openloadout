// Confetti: a win, a level clear, a new record. `burst` opens on a white pop in the middle with the pieces
// bunched in it; they are thrown up and out, turn as they flutter down, and settle as single pixels along the
// bottom third. Three styles: paper (small spinning triangles, engine/fx.js `shards`, one call per colour),
// streamers (short wavy 1 px ribbons, engine/spells.js `bolt`) and glitter (twinkles, engine/fx.js `twinkle`).
// The pop is engine/bursts.js `sparkFlash`. This file is the throw, the flutter and the timing.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, clamp, easeOut, hash, TAU, PI } from '../engine/motion.js';
import { tone } from '../engine/color.js';
import { PALETTE } from '../engine/palettes.js';
import { shards, twinkle } from '../engine/fx.js';
import { sparkFlash } from '../engine/bursts.js';
import { bolt } from '../engine/spells.js';

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

export default defineSprite({
  id: 'confetti',
  name: 'Confetti',
  kind: 'Effect',
  blurb: 'A burst of confetti for a win or a level clear: a white pop, then paper, streamers or glitter thrown up and fluttering down. Change its size, the pieces, the spread, the style and the three colours.',
  meta: { type: 'effect', role: 'effects/spark', themes: ['neutral', 'candy'], gameTypes: ['arcade', 'puzzle', 'card-game', 'racing'], view: 'none',
    words: ['confetti', 'celebration', 'party', 'streamers', 'glitter', 'win', 'victory', 'level clear', 'new record', 'hooray', 'burst', 'paper'], license: 'draft' },
  size: [64, 64],
  pivot: [32, 32],
  grounded: false,
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    pieces: range('Pieces', 12, { min: 6, max: 18, step: 1, lo: 'Few', hi: 'Many' }),
    spread: range('Spread', 0.5, { lo: 'Tight', hi: 'Wide' }),
    style: choice('Style', 'paper', ['paper', 'streamers', 'glitter']),
    body: color('Main colour', P.crimson, BODY),
    accent: color('Accent colour', P.gold, ACCENT),
    trim: color('Trim colour', P.hero, TRIM),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    burst: { frames: 12, fps: (p) => 14 * lerp(0.65, 1.45, p.speed), loop: false },
  },
  sounds: { burst: [{ sound: 'chime-success', preset: 'Quick confirm', frame: 0, volume: 0.8 }] },
  versions: [
    { name: 'Party', params: {} },
    { name: 'Gold shower', params: { body: P.ember, trim: P.cream } },
    { name: 'Streamers', params: { style: 'streamers' } },
    { name: 'Glitter', params: { style: 'glitter', body: P.thorn, accent: P.goblin, trim: P.magic } },
    { name: 'Small pop', params: { size: 0, pieces: 6, spread: 0 } },
  ],

  render(g, { t, frame, p }) {
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
  },
});
