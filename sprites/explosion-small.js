// Small explosion (kit-platformer-fantasy, batch P13): a cartoon blast. Frame 0 a white disc; 1 to 2 a
// ball in three tones with a bumpy edge that boils; 3 to 5 its middle opens into a ring while embers
// fly out ahead of it; 6 to 7 a thin ring of smoke and a few embers. Built from the framework:
// blastBall, embers and puffRing (engine/bursts.js), ring and starburst (engine/fx.js); this file is
// the timing and the three styles.
// Pure white is on frame 0 only. The smoke is the kit's cave-rock grey, rimmed with its own dark tone.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, clamp, PI } from '../engine/motion.js';
import { mix, tone } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { steps, ring, starburst } from '../engine/fx.js';
import { blastBall, puffRing, embers } from '../engine/bursts.js';

const P = PALETTE.thornwood;
const CX = 24, CY = 24;
// The hot middle sits inside the edge colour, so the two controls never offer the same colour.
const EDGE = swatches('thornwood', 'edge', { lead: 'ember' });
const CORE = [P.cream, P.skin, P.sky, P.goblin, P.steel].filter((c) => !EDGE.includes(c));
// lightest first, the last is the rim: a soft rim, so a thinning puff reads as smoke and not as a stone
const SMOKE = [P.stone, mix(P.stone, P.slate, 0.5), P.slate, tone(P.slate, -0.45)];
// The phase of the smoke ring on frames 5, 6 and 7.
const SMOKE_AT = [0, 0.45, 1];

export default defineSprite({
  id: 'explosion-small',
  name: 'Small explosion',
  kind: 'Effect',
  blurb: 'A cartoon blast: a white flash, a boiling ball that opens into a ring, flying embers and a ring of smoke. Change its size, embers, spread, style, smoke and colours.',
  meta: { type: 'effect', role: 'effects/explosion', themes: ['fantasy', 'forest'], gameTypes: ['platformer', 'turn-based-rpg', 'roguelike-action', 'shooter', 'arcade'], view: 'none',
    words: ['explosion', 'blast', 'boom', 'bomb', 'explode', 'burst', 'fire', 'smoke', 'embers', 'destroy', 'bang', 'hot'], license: 'draft' },
  size: [48, 48],
  pivot: [CX, CY],
  grounded: false,
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    pieces: range('Pieces', 8, { min: 4, max: 12, step: 1, lo: 'Few', hi: 'Many' }),
    spread: range('Spread', 0.5, { lo: 'Tight', hi: 'Wide' }),
    style: choice('Style', 'round', ['round', 'star', 'ring']),
    smoke: toggle('Smoke', true),
    core: color('Core', P.cream, CORE),
    edge: color('Edge', P.ember, EDGE),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    burst: { frames: 8, fps: (p) => 16 * lerp(0.65, 1.45, p.speed), loop: false },
  },

  render(g, { frame, p }) {
    const C = steps(p.edge, { core: p.core, white: false });      // [core, middle, edge, rim]
    const [core, mid, edge, rim] = C;
    const R = lerp(8.5, 11, p.size);                              // the ball at its fullest
    const wide = lerp(0.92, 1.1, p.spread);                       // how far the ring opens
    const star = p.style === 'star';
    const ball = (o) => blastBall(g, { x: CX, y: CY, bumps: star ? 8 : 7, bump: star ? 0.42 : 0.17, points: star, turn: frame * 0.7, ...o });

    // the smoke ring, under the last of the fire: it starts once the fire ring has opened (frame 5), on a
    // ring as wide as the fire's hole, so the middle stays see-through; with the embers it is all that is left
    if (p.smoke && frame >= 5) puffRing(g, { t: SMOKE_AT[frame - 5], x: CX, y: CY, count: 7, r0: R * 1.2 * wide, r1: R * 1.45 * wide, size: lerp(2.5, 3.1, p.size), end: 1.3, hold: 0.3, rise: 2, cool: 0.4, uneven: 1, lobes: 2, seed: 2, colours: SMOKE });

    // embers: thrown on frame 3 from just outside the fire, and they outrun the ring as it opens; rimmed
    // beads on frames 3 to 5, single pixels on 6 and 7
    const sparks = () => frame >= 3 && embers(g, { t: (frame - 3) / 4, x: CX, y: CY, count: p.pieces, r0: R * 1.18 * wide + 3, r1: R * 1.18 * wide + lerp(7, 9, p.spread), size: 2, hold: 0.55, gravity: 1.5, seed: 4, colours: C });

    if (p.style === 'ring') {
      // a smaller ball inside a shock ring that runs ahead of it
      ring(g, { t: clamp(frame / 6.5), x: CX, y: CY, r0: R * 0.7, r1: R * 1.25 * wide, thick: 4, seed: 4, colours: C });
      if (frame === 0) ball({ r: R * 0.62, bump: 0, colours: ['#ffffff', '#ffffff', core, edge] });
      else if (frame === 1) ball({ r: R * 0.74, colours: C, heat: 0.65 });
      else if (frame === 2) ball({ r: R * 0.7, colours: C, heat: 0.4 });
      else if (frame === 3) ball({ r: R * 0.52, colours: [mid, edge, rim] });
      else if (frame === 4) ball({ r: R * 0.3, colours: [edge, rim] });
      sparks();
      return;
    }
    if (frame === 0) {
      // the flash: a white disc (with white rays for the star)
      if (star) starburst(g, { x: CX, y: CY, count: 8, r1: R * 1.25, width: R * 0.5, turn: PI / 8, colour: '#ffffff', rim: core });
      ball({ r: R * 0.92, bump: 0, colours: ['#ffffff', '#ffffff', core, edge] });
    } else if (frame === 1) ball({ r: R * (star ? 1.12 : 1), colours: C, heat: 0.7 });
    else if (frame === 2) ball({ r: R * (star ? 1.2 : 1.1), colours: C, heat: 0.4 });
    else if (frame === 3) ball({ r: R * 1.18 * wide, hole: R * 0.38, colours: [mid, edge, rim], heat: 0.5 });
    else if (frame === 4) ball({ r: R * 1.26 * wide, hole: R * 0.74 * wide, colours: [mid, edge, rim], heat: 0.2 });
    else if (frame === 5) ball({ r: R * 1.32 * wide, hole: R * 1.06 * wide, colours: [edge, rim], gaps: 0.3, seed: 2 });
    else if (frame === 6 && !p.smoke) ring(g, { t: 0.82, x: CX, y: CY, r0: R, r1: R * 1.4 * wide, thick: 2, seed: 3, colours: C });   // without smoke: the last thin arcs of the fire
    sparks();
  },
});
