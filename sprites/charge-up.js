// Charge up: the charge of a big shot or a special move. `loop` is sparks gathering into a pulsing core
// in the middle (spiralling in, riding rings that close on it, or streaking straight in); `burst` is the
// release: the core flashes white and fires a ring and a star outward, ending on a few sparks.
// The gathering is the framework's (engine/spells.js `swirl`, engine/fx.js `streaks`), the core, ring
// and star are engine/fx.js; this file is the timing and the three styles.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, pulse, fract, hash, TAU, PI } from '../engine/motion.js';
import { PALETTE } from '../engine/palettes.js';
import { steps, stepAt, glow, ring, streaks, starburst, particles } from '../engine/fx.js';
import { swirl } from '../engine/spells.js';
import { ringIn } from '../engine/shapes.js';
import { sparkMark } from '../engine/bursts.js';

const P = PALETTE.thornwood;
const X = 24, Y = 24;                                    // the core: a whole-pixel centre, so its discs have even widths
const S = 23.5;                                          // the star's centre: a pixel centre, so its tips are 1 px
// The core sits inside its edge glow, so the two controls never offer the same colour.
const EDGE = [P.magic, P.ember, P.thorn, P.moss, P.hero, P.gold, PALETTE.derelict.cyan];
const CORE = [P.cream, P.crimson, P.sky, P.steel, P.skin].filter((c) => !EDGE.includes(c));

export default defineSprite({
  id: 'charge-up',
  name: 'Charge up',
  kind: 'Effect',
  blurb: 'Energy gathering into a pulsing core before a big shot or special move, then released in a flash. Change its size, the sparks, how they gather, the twist, the pulse and colours.',
  meta: { type: 'effect', role: 'effects/magic', themes: ['neutral', 'fantasy', 'sci-fi'], gameTypes: ['shooter', 'turn-based-rpg', 'platformer', 'roguelike-action'], view: 'none',
    words: ['charge', 'charging', 'power up', 'energy', 'gather', 'release', 'special move', 'super', 'charge shot', 'focus', 'spark', 'glow'], license: 'draft' },
  size: [48, 48],
  pivot: [24, 24],
  grounded: false,
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    pieces: range('Sparks', 8, { min: 4, max: 12, step: 1, lo: 'Few', hi: 'Many' }),
    style: choice('Style', 'spiral', ['spiral', 'rings', 'pull']),
    twist: range('Twist', 0.5, { lo: 'Straight', hi: 'Turned', when: { style: ['spiral'] } }),
    core: color('Core', P.cream, CORE),
    edge: color('Edge', P.magic, EDGE),
    flicker: range('Flicker', 0.5, { lo: 'Steady', hi: 'Wild', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    loop: { label: 'Charge', frames: 8, fps: (p) => 10 * lerp(0.65, 1.45, p.speed), loop: true },
    burst: { label: 'Release', frames: 8, fps: (p) => 16 * lerp(0.65, 1.45, p.speed), loop: false },
  },
  sounds: { burst: [{ sound: 'magic-spell', preset: 'Quick zap', frame: 0, volume: 0.8 }] },
  versions: [
    { name: 'Charging', params: {} },
    { name: 'Full power', params: { size: 1, pieces: 12, edge: P.gold } },
    { name: 'Dark charge', params: { core: P.crimson, edge: P.thorn } },
    { name: 'Ring charge', params: { style: 'rings', edge: P.hero } },
    { name: 'Pull', params: { style: 'pull', twist: 0 } },
  ],

  render(g, { clip, t, frame, p }) {
    const C = steps(p.edge, { core: p.core });           // [white, core, middle, edge, rim]
    const [white, core, mid, edge, rim] = C;
    const n = p.pieces;
    const out = lerp(13, 20, p.size);                    // where the sparks come from (and where the release reaches)
    const R = lerp(3.5, 5.5, p.size);                      // the core's resting radius
    const turns = lerp(0.05, 0.7, p.twist);

    if (clip === 'burst') {
      // 0: the core at its brightest, white, with a star of rays; then a ring and the rays fly out and thin
      const k = frame / 7;
      if (frame === 0) {
        starburst(g, { x: S, y: S, count: 8, r1: out * 0.8, width: lerp(3, 4.5, p.size), turn: PI, colour: core, rim: edge });
        glow(g, X, Y, R + 4, [white, white, core, edge, rim]);
        return;
      }
      ring(g, { t: k, x: X, y: Y, r0: R + 2, r1: out, thick: 3, seed: 3, colours: C.slice(1) });
      if (p.style === 'rings') ring(g, { t: Math.max(0, k - 0.2) / 0.8, x: X, y: Y, r0: R, r1: out * 0.7, thick: 2, seed: 4, colours: C.slice(1) });
      const reach = lerp(R + 3, out + 1, Math.min(1, k * 1.4)), long = p.style === 'pull' ? 5 : 3;
      if (frame <= 4) starburst(g, { x: S, y: S, count: 8, r0: Math.max(0, reach - long - (4 - frame)), r1: reach, width: frame <= 2 ? 1.6 : 0.4, turn: PI, colour: frame <= 2 ? core : edge, rim: frame <= 2 ? edge : null });
      if (p.style === 'spiral') swirl(g, { t: k, x: X, y: Y, count: n, r0: R, r1: out - 1, turns, stagger: 0.25, seed: 6, colours: [white, core, edge, rim] });
      else particles(g, { t: k, x: X, y: Y, count: n, seed: 6, loop: false, stagger: 0.2, arc: TAU, dist: out - 2, size: 2, colours: C });
      if (frame <= 3) glow(g, X, Y, [0, R + 1, R, R - 1.5][frame], C.slice(0, 4));
      return;
    }

    // ---- loop: sparks gather, the core pulses (twice per loop) ----
    if (p.style === 'spiral') {
      swirl(g, { t, x: X, y: Y, count: n, loop: true, r0: out, r1: R + 1, turns, stagger: 0, seed: 5, colours: [white, core, edge, rim] });
    } else if (p.style === 'rings') {
      // three rings close on the core one after another, sparks riding on them
      for (let j = 0; j < 3; j++) {
        const life = fract(t + j / 3), r = lerp(out, R + 2, life), c = stepAt([core, mid, edge, rim], life);
        g.fill(X - r - 1, Y - r - 1, X + r + 1, Y + r + 1, ringIn(X, Y, r, 1), c);
      }
      for (let i = 0; i < n; i++) {
        const life = fract(t + (i % 3) / 3), r = lerp(out, R + 2, life), a = TAU * (i / n + 0.13 * (i % 3));
        sparkMark(g, X + Math.sin(a) * r, Y + Math.cos(a) * r, life > 0.5 ? 1 : 0, 'plus', [core, edge, rim]);
      }
    } else {
      // streaks drawn straight in from all round, each on its own timer
      for (let i = 0; i < n; i++) {
        const a = TAU * (i + 0.3 * hash(i, 41)) / n, sx = X + Math.sin(a) * out, sy = Y + Math.cos(a) * out;
        streaks(g, { t: fract(t + hash(i, 42)), x: sx, y: sy, count: 1, seed: i, angle: a + PI, length: lerp(4, 7, p.size), reach: out - R - 3, colours: [rim, edge, core, white] });
      }
    }
    const beat = pulse(fract(2 * t));
    glow(g, X, Y, R + lerp(0.5, 2.5, p.flicker) * beat, C);
  },
});
