// Small plasma blast: a small, clean explosion for rockets, drones and crates. A white disc, a ball
// with a hard-edged rim, a ring that opens and breaks into arcs, and a few sparks. Everything is the
// framework's glow, ring, particles, starburst and puffs (engine/fx.js); this file is the
// timing, the three styles and the sizes.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, clamp, easeOut, PI, TAU } from '../engine/motion.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { steps, glow, ring, particles, starburst, puffs } from '../engine/fx.js';

const P = PALETTE.derelict;
const M = 23.5;                                          // a pixel centre, so the ball is the same on every side
const REACH = 21;                                        // the farthest a spark goes from the middle
// The core sits inside the edge colour, so the two controls never offer the same colour.
const EDGE = swatches('derelict', 'edge', { lead: 'amber' });
const CORE = [P.cream, P.suit, P.skin, P.gold].filter((c) => !EDGE.includes(c));
const SMOKE = [P.steel, P.panel, P.hull];                // pale smoke: its light top, its body, its rim

export default defineSprite({
  id: 'plasma-burst',
  name: 'Small plasma blast',
  kind: 'Effect',
  blurb: 'A small, clean explosion: a white disc, a hard-rimmed ball, a ring that opens and breaks up, and a few sparks. Change its size, sparks, spread, style, smoke and colours.',
  meta: { type: 'effect', role: 'effects/explosion', themes: ['sci-fi', 'space'], gameTypes: ['roguelike-action', 'shooter', 'arcade'], view: 'none',
    words: ['explosion', 'blast', 'plasma', 'burst', 'boom', 'explode', 'rocket', 'grenade', 'shockwave', 'ring', 'sparks', 'destroy', 'energy'], license: 'draft' },
  size: [48, 48],
  pivot: [24, 24],
  grounded: false,
  sounds: { burst: [{ sound: 'explosion', preset: 'Fireworks pop', frame: 0, volume: 0.8 }] },
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    pieces: range('Pieces', 6, { min: 3, max: 10, step: 1, lo: 'Few', hi: 'Many' }),
    spread: range('Spread', 0.5, { lo: 'Tight', hi: 'Wide' }),
    style: choice('Style', 'round', ['round', 'ring', 'shards']),
    smoke: toggle('Smoke', true),
    core: color('Core', P.cream, CORE),
    edge: color('Edge', P.amber, EDGE),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    burst: { frames: 8, fps: (p) => 16 * lerp(0.65, 1.45, p.speed), loop: false },
  },

  render(g, { t, frame, p }) {
    const [white, core, mid, edge, rim] = steps(p.edge, { core: p.core });
    const n = p.pieces, style = p.style;
    const B = lerp(7.5, 11, p.size) * (style === 'round' ? 1 : 0.8);      // the ball
    const R1 = Math.min(REACH - 1, lerp(7.5, 11, p.size) + lerp(4, 9.5, p.spread));   // how far the ring opens
    const reach = Math.min(REACH, R1 * 1.35);            // how far the sparks fly
    const after = (t0) => clamp((t - t0) / (1 - t0));    // a later start inside the clip

    // smoke first, behind everything: it shows once the ball has gone
    if (p.smoke && frame >= 2) puffs(g, { t: after(0.25), x: M, y: M + 1, count: 5, seed: 3, stagger: 0.3, angle: PI, arc: TAU, dist: R1 * 0.62, rise: 3, size: lerp(2.6, 3.6, p.size), lobes: 2, colours: SMOKE });

    // the ring: it starts as the rim of the ball and opens (the shards style has none: its shards are the show)
    if (frame >= 1 && style !== 'shards') {
      ring(g, { t: after(0.1), x: M, y: M, r0: B * 0.9, r1: R1, thick: style === 'ring' ? 5 : 3, seed: 2, colours: [core, mid, edge, edge, rim] });
      if (style === 'ring' && frame >= 3) ring(g, { t: after(0.36), x: M, y: M, r0: B * 0.4, r1: R1 * 0.6, thick: 3, seed: 7, colours: [core, mid, edge, edge, rim] });
    }

    // what flies out: round sparks, or (drawn last, in front of the ball) straight-edged shards
    if (style !== 'shards') particles(g, { t, x: M, y: M, loop: false, count: n, seed: 5, stagger: 0.15, angle: PI, arc: TAU, dist: reach, size: 3.6, colours: [core, mid, edge, edge, rim] });

    // the ball: a white disc, then a ball with a hard rim that cools and shrinks as the ring leaves it
    if (frame === 0) {
      if (style === 'shards') starburst(g, { x: M, y: M, count: n + 2, turn: PI + 0.3, r1: B * 1.7, width: B * 0.5, colour: white, rim: edge });
      glow(g, M, M, B * 1.1, [white, white, core, edge]);
    } else if (frame === 1) glow(g, M, M, B, [white, core, mid, edge, rim]);
    else if (frame === 2) glow(g, M, M, B * 0.9, [core, mid, edge, rim]);
    else if (frame === 3) glow(g, M, M, B * 0.66, [mid, edge, rim]);
    else if (frame === 4) glow(g, M, M, B * 0.4, [edge, rim]);
    if (style === 'shards' && frame >= 1) {
      // straight shards of light fly out of the ball, shortening and cooling as they go
      const from = lerp(B * 0.7, reach - 3, easeOut(t)), long = lerp(8, 2, t) * lerp(0.85, 1.15, p.size);
      const [body, line] = t < 0.3 ? [core, edge] : t < 0.6 ? [mid, rim] : t < 0.9 ? [edge, null] : [rim, null];
      starburst(g, { x: M, y: M, count: n + 2, turn: PI + 0.3, r0: from, r1: Math.min(REACH, from + long), width: lerp(3.2, 0.4, Math.min(1, t * 1.6)), colour: body, rim: line });
    }
  },
});
