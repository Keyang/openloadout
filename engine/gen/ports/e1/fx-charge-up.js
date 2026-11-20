// PORT (build item E1, after its first review): the drawing of the code sprite sprites/charge-up.js (its constants, helpers
// and render), word for word, with its imports pointed at the port shims and at migration batch E2's copies of the
// engine helpers (engine/gen/ports/e2/; engine/rock.js crack at engine/gen/ports/e1/rock.js), so it draws paint refs on
// an engine/gen/port-surface.js grid. It is the drawing of the effect generator effect.charge-up@1
// (engine/gen/fx-e1-effects.js), which sprites/charge-up.json names; it goes only with the last version that draws with it.
// Its settings (p) are that generator's arguments; its colours are the paint refs the data file names. A HAND CHANGE
// note says where it differs from its source; never change what a released generator version draws through it.
// The code file's own summary:
// Charge up: the charge of a big shot or a special move. `loop` is sparks gathering into a pulsing core
// in the middle (spiralling in, riding rings that close on it, or streaking straight in); `burst` is the
// release: the core flashes white and fires a ring and a star outward, ending on a few sparks.
// The gathering is the framework's (engine/spells.js `swirl`, engine/fx.js `streaks`), the core, ring
// and star are engine/fx.js; this file is the timing and the three styles.
import { lerp, pulse, fract, hash, TAU, PI } from '../../../motion.js';
import { PALETTE } from '../e2/palettes.js';
import { steps, stepAt, glow, ring, streaks, starburst, particles } from '../e2/fx.js';
import { swirl } from '../e2/spells.js';
import { ringIn } from '../e2/shapes.js';
import { sparkMark } from '../e2/bursts.js';

const P = PALETTE.thornwood;
const X = 24, Y = 24;                                    // the core: a whole-pixel centre, so its discs have even widths
const S = 23.5;                                          // the star's centre: a pixel centre, so its tips are 1 px
// The core sits inside its edge glow, so the two controls never offer the same colour.
const EDGE = [P.magic, P.ember, P.thorn, P.moss, P.hero, P.gold, PALETTE.derelict.cyan];
const CORE = [P.cream, P.crimson, P.sky, P.steel, P.skin].filter((c) => !EDGE.includes(c));

/** Draws one frame of the effect as sprites/charge-up.js did: g (a PortSurface), { clip, t, frame, p } (p the settings, colours as paint refs). */
export function render(g, { clip, t, frame, p }) {
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
}
