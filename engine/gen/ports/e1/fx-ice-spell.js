// PORT (build item E1, after its first review): the drawing of the code sprite sprites/fx-ice-spell.js (its constants, helpers
// and render), word for word, with its imports pointed at the port shims and at migration batch E2's copies of the
// engine helpers (engine/gen/ports/e2/; engine/rock.js crack at engine/gen/ports/e1/rock.js), so it draws paint refs on
// an engine/gen/port-surface.js grid. It is the drawing of the effect generator effect.fx-ice-spell@1
// (engine/gen/fx-e1-effects.js), which sprites/fx-ice-spell.json names; it goes only with the last version that draws with it.
// Its settings (p) are that generator's arguments; its colours are the paint refs the data file names. A HAND CHANGE
// note says where it differs from its source; never change what a released generator version draws through it.
// The code file's own summary:
// Ice spell: a battle effect in two clips. `burst` is for the target: sharp ice juts up from the
// ground (frames 0 to 3), holds with a glint (4 and 5) and shatters into shards that fly outward
// (6 to 9). `cast` is small, for the caster's hand: frost motes spiral inward and freeze into a
// crystal. No ink outline: ice is rimmed with its own dark tone. The crystals, the snowflake and the
// spiral are the framework's (engine/spells.js); shards, mist and glints are engine/fx.js. This file
// is the three styles and the timing.
import { lerp, clamp, hash, PI } from '../../../motion.js';
import { PALETTE, swatches } from '../e2/palettes.js';
import { steps, shards, puffs, glow, twinkle, starburst } from '../e2/fx.js';
import { crystal, snowflake, swirl } from '../e2/spells.js';

const P = PALETTE.hearthvale;
const CX = 32, FLOOR = 58;                               // the ground row: the ice stands on the row above it
const ABOVE = [1, 1, 63, FLOOR];
// The highlight sits inside the edge colour, so the two controls never offer the same colour.
const EDGE = swatches('hearthvale', 'edge', { lead: 'ice' });
const CORE = [P.cream, P.thunder, P.skin, P.sky].filter((c) => !EDGE.includes(c));

// How much of its full height the ice has on each frame of `burst`: it juts up with a small
// overshoot, holds, then only stumps are left under the flying shards.
const TALL = [0.22, 0.62, 0.96, 1.07, 1, 1, 0.5, 0.3, 0.14, 0];

/** Draws one frame of the effect as sprites/fx-ice-spell.js did: g (a PortSurface), { clip, t, frame, p } (p the settings, colours as paint refs). */
export function render(g, { clip, t, frame, p }) {
  const C = steps(p.edge, { core: p.core, white: false });            // [highlight, lit facet, shaded facet, rim]
  const hot = steps(p.edge, { core: p.core });
  const n = p.pieces;

  if (clip === 'cast') {
    // frost motes spiral in over the hand (0 to 5); from frame 4 a crystal freezes out of them and rings (6)
    const fx = CX + 0.5, fy = 46.5, k = [0.45, 0.8, 1.1, 1][frame - 4] ?? 0;
    if (frame <= 5) swirl(g, { t: clamp(frame / 5), x: fx, y: fy, count: n + 3, seed: 4, r0: lerp(13, 19, p.size), r1: 2, turns: 0.85, size: 3, tail: 3, colours: C });
    if (k > 0) {
      if (p.style === 'snowflake') snowflake(g, { x: fx, y: fy, r: lerp(7, 10, p.size) * k, twigs: 1, colours: C });
      else {
        // a floating crystal with a point at both ends: a long one up and a short one down from its waist
        const L = lerp(15, 23, p.height) * lerp(0.9, 1.1, p.size) * k, wd = lerp(6.5, 10, p.size) * Math.min(1, k + 0.1) * (p.style === 'crystal' ? 1.2 : 1);
        const shape = p.style === 'crystal' ? 'prism' : 'spike', wy = fy + L * 0.2;
        crystal(g, { x: fx, y: wy, angle: 0, length: L * 0.34, width: wd, colours: C, shine: false });
        crystal(g, { x: fx, y: wy + 1, length: L * 0.66 + 1, width: wd, shape, colours: C });
      }
      if (frame >= 6) twinkle(g, fx + 3, fy - 4, 8 - frame, C[0]);
    }
    return;
  }

  // ---- burst ----
  const W = lerp(10, 17, p.size);                          // half the width of the ground it covers
  const H = lerp(27, 43, p.height) * lerp(0.94, 1.06, p.size);
  const tall = TALL[frame];
  const flake = p.style === 'snowflake';
  // every spike: where its foot is, which way it leans, how long and how wide (the middle one is the tallest)
  const spikes = [];
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;                      // -1 at the left .. 1 at the right
    const reach = flake ? 0.34 : p.style === 'crystal' ? 0.86 : 1;      // a snowflake stands over a low bed of ice
    spikes.push({
      u, x: CX + u * W * (flake ? 0.9 : 0.72), angle: PI - u * (p.style === 'crystal' ? 0.34 : 0.5),
      length: H * reach * (1 - 0.48 * Math.abs(u) ** 1.2) * (0.88 + 0.2 * hash(i, 3)),
      width: lerp(6.5, 10, p.size) * (p.style === 'crystal' ? 1.45 : 1) * (1 - 0.22 * Math.abs(u)),
    });
  }
  spikes.sort((a, b) => Math.abs(b.u) - Math.abs(a.u));                 // the outer ones first, the middle one in front
  const fy = FLOOR - H * 0.6, fr = Math.min(lerp(13, 19, p.size), H * 0.52);   // the snowflake's middle and reach

  if (tall > 0) {
    const tips = [];
    for (const s of spikes) tips.push(crystal(g, { x: s.x, y: FLOOR + 1, angle: s.angle, length: s.length * tall + 1, width: s.width * Math.min(1, 0.55 + tall * 0.5), shape: p.style === 'crystal' ? 'prism' : 'spike', colours: C, box: ABOVE }));
    if (flake && frame <= 5) snowflake(g, { x: CX + 0.5, y: Math.floor(fy) + 0.5, r: fr * Math.min(1.05, tall + 0.08), twigs: 2, thick: 1.3, turn: (PI / 6) * (1 - Math.min(1, tall)), colours: C, box: ABOVE });
    // the glint while it holds: on the tallest tip, then on a second one
    if (frame === 4 || frame === 5) {
      const [tx, ty] = flake ? [CX + fr * 0.5, fy - fr * 0.55] : tips[tips.length - 1];
      twinkle(g, tx + (flake ? 0 : 1), ty + 3, frame === 4 ? 2 : 1, C[0]);
      if (frame === 5 && tips.length > 2) twinkle(g, tips[tips.length - 3][0], tips[tips.length - 3][1] + 3, 2, C[0]);
    }
  }
  // the shatter: a flash of cracks (6), then every spike throws its splinters outward and they fall to the ground
  if (frame >= 6) {
    const k = (frame - 6 + 0.6) / 3.6, my = flake ? fy : FLOOR - H * 0.42, big = lerp(5.5, 8, p.size);
    if (frame <= 7) starburst(g, { x: CX + 0.5, y: Math.floor(my) + 0.5, count: 8, turn: PI + 0.3, r0: H * (frame === 6 ? 0.12 : 0.42), r1: H * (frame === 6 ? 0.5 : 0.62), width: frame === 6 ? 2.4 : 0.4, colour: frame === 6 ? C[0] : C[2], rim: frame === 6 ? C[2] : null, box: ABOVE });
    for (const [j, s] of spikes.entries()) {
      const up = s.length * 0.55;
      shards(g, { t: k, x: s.x + Math.sin(s.angle) * up, y: FLOOR + Math.cos(s.angle) * up, count: flake ? 1 : 3, seed: j + 2, dist: H * 0.5, gravity: H * 0.45, size: big, angle: s.angle, arc: 2.8, colour: p.edge, box: ABOVE });
    }
    if (flake) shards(g, { t: k, x: CX, y: fy, count: 9, seed: 9, dist: fr * 1.5, gravity: H * 0.4, size: big, colour: p.edge, box: ABOVE });
  }
  // frame 0: the white flash where the frost breaks the ground
  if (frame === 0) glow(g, CX, FLOOR, W * 0.8, hot, { box: ABOVE });
  // a low frost cloud that rolls out along the ground and thins
  if (p.mist) for (const side of [-1, 1]) puffs(g, { t, x: CX + side * 2, y: FLOOR - 2, count: 3, seed: side + 3, stagger: 0.25, angle: side * PI / 2, arc: 0.3, dist: W * 1.3, rise: 2, size: lerp(2.4, 3.4, p.size), lobes: 3, floor: FLOOR, colours: C });
}
