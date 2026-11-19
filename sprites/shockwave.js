// Shockwave: a heavy landing, a boss slam or a stomp power, seen from the side. Frame 0 is a white flash at the
// impact point; a flattened ring then races out along the ground, dust rises at its ends, chips fly, and it ends
// on dust specks (and, for a quake, two short cracks along the ground). The ring, the dust, the chips and the
// flash are the framework's (engine/fx.js: ring, puffs, shards, glow, particles), the cracks engine/rock.js's
// crack; this file is the timing and the three styles.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, keys, PI } from '../engine/motion.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { steps, ring, puffs, shards, glow, particles, starburst } from '../engine/fx.js';
import { crack } from '../engine/rock.js';

const P = PALETTE.thornwood;
const CX = 32, GROUND = 61;                              // the impact point and the ground row: nothing goes below it
const BOX = [1, 1, 63, GROUND + 1];
// The core runs inside the ring, so the two controls never offer the same colour.
const EDGE = swatches('thornwood', 'edge', { lead: 'stone' });
const CORE = [P.cream, P.gold, P.sky, P.steel, P.skin].filter((c) => !EDGE.includes(c));

export default defineSprite({
  id: 'shockwave',
  name: 'Shockwave',
  kind: 'Effect',
  blurb: 'A ground shockwave from a heavy landing or a slam: a white flash, a flat ring racing out along the ground, dust and flying chips. Change its size, chips, spread, height, style and colours.',
  meta: { type: 'effect', role: 'effects/dust', themes: ['neutral'], gameTypes: ['platformer', 'roguelike-action', 'arcade', 'top-down-rpg'], view: 'side',
    words: ['shockwave', 'slam', 'stomp', 'quake', 'impact', 'landing', 'ground pound', 'shock', 'ring', 'dust', 'rocks', 'tremor', 'heavy'], license: 'draft' },
  size: [64, 64],
  pivot: [32, 62],
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    pieces: range('Rocks', 4, { min: 2, max: 8, step: 1, lo: 'Few', hi: 'Many' }),
    spread: range('Spread', 0.5, { lo: 'Tight', hi: 'Wide' }),
    height: range('Height', 0.5, { lo: 'Short', hi: 'Tall' }),
    style: choice('Style', 'dust', ['dust', 'energy', 'quake']),
    core: color('Core', P.cream, CORE),
    edge: color('Edge', P.stone, EDGE),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    burst: { frames: 10, fps: (p) => 16 * lerp(0.65, 1.45, p.speed), loop: false },
  },
  sounds: { burst: [{ sound: 'land-thud', preset: 'Heavy landing', frame: 0, volume: 0.8 }] },
  versions: [
    { name: 'Ground slam', params: {} },
    { name: 'Energy wave', params: { style: 'energy', edge: P.magic } },
    { name: 'Quake', params: { style: 'quake', pieces: 8 } },
    { name: 'Low ripple', params: { height: 0, spread: 1 } },
    { name: 'Small thump', params: { size: 0 } },
  ],

  render(g, { t, frame, p }) {
    const C = steps(p.edge, { core: p.core });                       // [white, core, mid, edge, rim]
    const dustC = steps(p.edge, { core: p.core, white: false });      // [core, mid, edge, rim]
    const energy = p.style === 'energy', quake = p.style === 'quake';
    const s = lerp(0.7, 1.15, p.size);
    const reach = Math.min(30, lerp(17, 30, p.spread) * s);          // how far the ring's ends race out
    const squash = lerp(0.18, 0.5, p.height) * (quake ? 0.8 : 1);  // how high the ring stands, as a share of its width
    const thick = Math.round(lerp(3, 5, p.size)) + (energy ? 1 : 0);

    // the ring: an ellipse lying on the ground, its lowest edge always on the ground row
    const r = lerp(lerp(7, 11, p.size), reach, 1 - (1 - t) ** 2.2);
    const ry = Math.max(1, r * squash);
    ring(g, { t, x: CX, y: GROUND + 0.5 - ry, r0: r, r1: r, thick, squash, seed: 3, colours: energy ? C : C.slice(1), box: BOX });

    // the cracks of a quake run out along the ground from the impact, left and right
    if (quake) {
      const len = Math.round(lerp(4, lerp(9, 15, p.size), keys(t, [[0, 0], [0.3, 1], [1, 1]])));
      const along = (px, py) => py >= GROUND - 2 && py < GROUND + 1;
      crack(g, CX + 1, GROUND - 1, PI / 2 - 0.15, len, dustC.at(-1), { seed: 2, clip: along, jag: 0.9, branch: false });
      crack(g, CX - 2, GROUND - 1, -PI / 2 + 0.15, len, dustC.at(-1), { seed: 5, clip: along, jag: 0.9, branch: false });
    }

    // dust (or, for energy, sparks) thrown up at the ring's two ends as they race out
    const rise = lerp(5, 16, p.height) * s;
    if (energy) {
      for (const side of [-1, 1]) particles(g, { t, x: CX + side * 3, y: GROUND - 1, count: 5, seed: side > 0 ? 7 : 8, loop: false, stagger: 0.3, angle: side * PI * 0.62, arc: 0.5, dist: reach * 0.95, gravity: -rise, size: 2.5, colours: C, box: BOX });
    } else {
      const common = { t, y: GROUND - 2, floor: GROUND, colours: dustC, lobes: 3, stagger: 0.15, arc: 0.25, dist: reach * 0.85, rise, size: lerp(3, 5, p.size), shape: quake ? 'chunky' : 'round', box: BOX };
      puffs(g, { ...common, x: CX - 2, count: 2, seed: 1, angle: -PI / 2 });
      puffs(g, { ...common, x: CX + 2, count: 2, seed: 2, angle: PI / 2 });
    }

    // chips flung up and out from the impact, falling back by the end
    const throwUp = lerp(30, 44, p.height) * s;
    shards(g, { t, x: CX, y: GROUND - 3, count: p.pieces, seed: 11, dist: throwUp, gravity: throwUp * 1.25, size: lerp(4.5, 6.5, p.size), angle: PI, arc: lerp(0.5, 0.9, p.spread) * PI, spin: 1.2, colour: p.edge, box: BOX });

    // frame 0 is the brightest moment: a white flash with short rays rising off the impact point; frame 1 its afterglow
    const fr = lerp(8, 12, p.size) * (energy ? 1.15 : 1), ray = lerp(15, 23, p.size);
    const rays = (o) => starburst(g, { x: CX + 0.5, y: GROUND + 0.5, count: 10, turn: PI / 2, box: BOX, ...o });
    if (frame === 0) { rays({ r1: ray, width: 3, colour: C[1], rim: C[3] }); glow(g, CX, GROUND, fr, C, { box: BOX }); }
    else if (frame === 1) { rays({ r0: ray * 0.7, r1: ray + 3, width: 1, colour: C[2] }); glow(g, CX, GROUND, fr * 0.55, C.slice(1), { box: BOX }); }
  },
});
