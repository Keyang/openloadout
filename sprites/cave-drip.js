// Cave drip (core-sprites-1, batch K07): an area loop to place under a cave ceiling. In each column a drop swells
// on the bead of water that hangs from a wet stub of rock at row 2, stretches, falls and lands on row 61: one drop per loop per column,
// each column on its own phase. Where it lands it throws a tiny crown, opens a ring on a pool, or swells a puddle.
// The stub, bead and drop are one body (`dropIn`, engine/shots.js, joined to the stub) lit from the right; the crown is
// `spikesIn` (engine/blast.js), the ring is `ring` with a squash and the spray is one-shot `particles`
// (engine/fx.js), each called with the landing's own phase; the colours are the `steps` chain. Light only: no ink.
// This file is the columns, the timing and the three landings.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, clamp, fract, easeIn, easeOut, PI } from '../engine/motion.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { tone } from '../engine/color.js';
import { steps, particles, ring } from '../engine/fx.js';
import { spikesIn } from '../engine/blast.js';
import { dropIn, lightShape } from '../engine/shots.js';

const P = PALETTE.thornwood;
const LAND = 61;                                     // the row a drop lands on
const BOX = [1, 1, 63, LAND + 1];
const inBox = (px, py) => px >= BOX[0] && px < BOX[2] && py >= BOX[1] && py < BOX[3];
// Where the columns hang, by how many there are, and each one's phase (the first starts the loop swelling).
const COLUMNS = { 1: [32], 2: [24, 41], 3: [16, 32, 48] };
const PHASE = [0, 0.43, 0.71];
// The foam sits on the drop and the splash, so the two lists share no colour.
const WATER = [...swatches('thornwood', 'water'), P.goblin];
const FOAM = [P.cream, P.gold, P.sky, P.steel];

// Where one column's drop is at phase u: swelling under the bead (0 .. 0.22), stretching (0.22 .. 0.3), falling (0.3 .. 0.74), landed (0.74 .. 1).
// The fall speeds up only a little, so at 8 frames the last frame before the landing shows the drop in the lower half.
const SWELL = 0.22, STRETCH = 0.3, FALL = 0.74;
function dropAt(u, top, R) {
  if (u < SWELL) { const r = lerp(0.8, R, easeOut(u / SWELL)); return { y: top + 1 + r, r, tail: r + 1 }; }
  if (u < STRETCH) { const k = (u - SWELL) / (STRETCH - SWELL), y = top + 1 + R + lerp(1, 3, k); return { y, r: R, tail: y - top }; }
  if (u < FALL) { const k0 = (u - STRETCH) / (FALL - STRETCH), k = lerp(k0, easeIn(k0), 0.3), y = lerp(top + R + 5, LAND - R, k); return { y, r: R, tail: R + lerp(2, 5, k), falling: true }; }
  return null;
}

export default defineSprite({
  id: 'cave-drip',
  name: 'Cave drip',
  kind: 'Effect',
  blurb: 'Water dripping from a cave ceiling: a drop swells, stretches, falls and lands with a small splash, ring or puddle, as a patch to place under a ceiling. Change the drop size, the fall, how many drips, what happens where it lands and the colours.',
  meta: { type: 'effect', role: 'effects/weather', themes: ['neutral', 'dungeon'], gameTypes: ['platformer', 'roguelike-action', 'puzzle'], view: 'side',
    words: ['drip', 'drop', 'water', 'leak', 'cave', 'ceiling', 'stalactite', 'damp', 'puddle', 'splash', 'slime', 'falling'], license: 'draft' },
  size: [64, 64],
  pivot: [32, 62],
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    fall: range('Fall', 0.5, { lo: 'Short', hi: 'Long' }),
    pieces: range('Drips', 1, { min: 1, max: 3, step: 1, lo: 'Few', hi: 'Many' }),
    style: choice('Style', 'splash', ['splash', 'ripple', 'puddle']),
    body: color('Water', P.water, WATER),
    core: color('Foam', P.cream, FOAM),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    loop: { frames: 8, fps: (p) => 10 * lerp(0.65, 1.45, p.speed), loop: true },
  },
  sounds: { loop: [{ sound: 'bubbles', preset: 'Slow drips', frame: 0, volume: 0.35 }] },
  versions: [
    { name: 'Water drip', params: {} },
    { name: 'Slime drip', params: { style: 'puddle', body: P.goblin } },
    { name: 'Lava drip', params: { body: P.ember, core: P.gold } },
    { name: 'Steady drips', params: { pieces: 3 } },
    { name: 'Long fall', params: { fall: 1, size: 0 } },
  ],

  render(g, { t, p }) {
    const C = steps(p.body, { core: p.core });                          // [white, foam, middle, water, dark water]
    const [white, foam, mid, water, rim] = C;
    const top = Math.round(lerp(18, 3, p.fall));                        // the row the bead hangs from (Fall sets where the drop lets go)
    const R = lerp(1.6, 3.1, p.size);                                   // the radius of a grown drop
    const xs = COLUMNS[p.pieces] ?? COLUMNS[1];
    xs.forEach((x0, i) => {
      const cx = x0 + 0.5, u = fract(t + PHASE[i]);
      // the pool or puddle under the column, always there (it swells as a drop lands in it)
      const landed = u >= FALL ? (u - FALL) / (1 - FALL) : -1;
      if (p.style === 'splash') {
        // a wet spot on the floor where the drops land, so the patch shows where they fall on every frame
        const rx = lerp(2.5, 4, p.size);
        lightShape(g, (px, py) => py >= LAND && py < LAND + 1 && Math.abs(px - cx) <= rx, [water, rim], { box: BOX });
      } else {
        const swell = landed >= 0 && p.style === 'puddle' ? 2.2 * Math.sin(PI * landed) : 0;
        const rx = (p.style === 'puddle' ? lerp(4, 7, p.size) : lerp(5, 9, p.size)) + swell, ry = p.style === 'puddle' ? 2.2 + swell * 0.4 : 1.4;
        lightShape(g, (px, py) => py < LAND + 1 && ((px - cx) / rx) ** 2 + ((py - LAND - 0.5) / ry) ** 2 <= 1, [mid, water, rim], { box: BOX });
      }
      // the landing, on the landing's own phase
      if (landed >= 0) {
        if (p.style === 'ripple') ring(g, { t: landed, x: x0, y: LAND - 1, r0: 2, r1: lerp(6, 10, p.size), thick: 2, squash: 0.3, seed: i, colours: [white, foam, water, rim], box: BOX });
        if (p.style === 'splash' || landed < 0.45) {
          const k = p.style === 'splash' ? landed : landed / 0.45;
          if (k < 0.6) {
            const h = lerp(R * 2 + 3, 1.5, k / 0.6);
            lightShape(g, spikesIn(cx, LAND + 3.5, { count: 3, angle: PI, arc: 1.3, r0: 3, r1: 3 + h, short: 0.75, width: lerp(2.6, 1.6, k), belly: 0.5, blunt: 0.6 }), [foam, water, rim], { box: BOX });
          }
          particles(g, { t: k, x: cx, y: LAND - R, count: p.style === 'splash' ? 4 : 2, seed: 3 + i, loop: false, stagger: 0.1, angle: PI, arc: 2.4, dist: R * 2 + 4,
            gravity: R * 3 + 8, size: 2, colours: [foam, water, rim], box: BOX });
        }
      }
      // the stub, the bead and the drop (forming, or falling) as one body: one outer rim, no rim line inside the water.
      // The stub tapers from the ceiling (its rim on row 2) to the bead, so every Fall hangs from row 2; the light comes from
      // the right, so its right edge is lit, its middle the water and its left edge a step darker.
      const stub = (px, py) => py >= 3 && py <= top + 1 && Math.abs(px - cx) <= 1.3 + 2.1 * (1 - clamp((py - 3) / Math.max(1, top - 2))) ** 1.6;
      const bead = (px, py) => ((px - cx) / 1.9) ** 2 + ((py - top - 0.5) / 1.8) ** 2 <= 1;
      const d = dropAt(u, top, R), head = d ? dropIn(cx, d.y, d.r, d.tail, PI) : () => false;
      // while it still hangs, the neck between bead and drop is filled out to the drop's width: no notch in the rim
      const neck = d && !d.falling ? Math.min(1.5, d.r - 0.5) : 0;
      const drop = (px, py) => head(px, py) || (neck > 0 && py >= top && py <= d.y && Math.abs(px - cx) <= neck);
      const wet = (px, py) => stub(px, py) || bead(px, py) || drop(px, py);
      const side = g.shadow;
      g.shadow = [-1, 0];
      g.fill(cx - 6, 2, cx + 6, LAND, wet, { light: mid, base: water, dark: tone(water, -0.45) }, { shade: 1, light: 1, outline: rim, clip: inBox });
      g.shadow = side;
      if (d && d.r >= 1.5) g.dot(Math.floor(cx + d.r * 0.45), Math.floor(d.y - d.r * 0.45), white);       // the glint, toward the light
    });
  },
});
