// Leaf burst: what flies when a bush is cut, a tree is shaken or grass is mown. `burst` opens on a clump of
// leaves bursting apart; in the burst style they are thrown up and out from the middle and tumble down, in
// the shower style they let go one after another from above and flutter down, with small bits among them.
// Either way the last frame keeps every leaf lying on the bottom rows. The leaves are engine/fx.js `leaves`
// (a shower calls it once per leaf, each on its own delay), the small bits engine/foliage.js `leafFall`.
// This file is the throw and the timing.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, clamp, hash } from '../engine/motion.js';
import { PALETTE } from '../engine/palettes.js';
import { leaves } from '../engine/fx.js';
import { leafFall } from '../engine/foliage.js';

const P = PALETTE.thornwood;
const X = 24, Y = 33;                                    // burst: where the leaves are thrown from
const BOX = [1, 1, 47, 46];                              // the leaves come to rest with their lowest pixels on row 45
// Leaves of the two colours touch in the cloud, so the two lists share no colour.
const BODY = [P.leaf, P.moss, P.ember, P.cream];
const ACCENT = [P.grass, P.gold, P.thorn, P.goblin];

export default defineSprite({
  id: 'leaf-burst',
  name: 'Leaf burst',
  kind: 'Effect',
  blurb: 'Leaves flying from a cut bush or a shaken tree and settling on the ground. Change its size, how many leaves, the spread, burst or shower, and the two leaf colours.',
  meta: { type: 'effect', role: 'effects/dust', themes: ['neutral', 'forest', 'farm'], gameTypes: ['top-down-rpg', 'platformer', 'farming-sim', 'arcade'], view: 'side',
    words: ['leaves', 'leaf', 'bush', 'cut', 'shake', 'tree', 'mow', 'grass', 'hedge', 'foliage', 'autumn', 'scatter', 'burst'], license: 'draft' },
  size: [48, 48],
  pivot: [24, 46],
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    pieces: range('Leaves', 8, { min: 4, max: 12, step: 1, lo: 'Few', hi: 'Many' }),
    spread: range('Spread', 0.5, { lo: 'Tight', hi: 'Wide' }),
    style: choice('Style', 'burst', ['burst', 'shower']),
    body: color('Leaves', P.leaf, BODY),
    accent: color('Sunlit leaves', P.grass, ACCENT),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    burst: { frames: 12, fps: (p) => 14 * lerp(0.65, 1.45, p.speed), loop: false },
  },
  sounds: { burst: [{ sound: 'bush-rustle', preset: 'Small bush', frame: 0, volume: 0.8 }] },
  versions: [
    { name: 'Cut bush', params: {} },
    { name: 'Autumn', params: { body: P.ember, accent: P.gold } },
    { name: 'Blossom', params: { body: P.cream, accent: P.thorn } },
    { name: 'Tree shake', params: { style: 'shower', spread: 1, pieces: 12 } },
    { name: 'A few leaves', params: { size: 0, pieces: 4 } },
  ],

  render(g, { t, p }) {
    const n = p.pieces, size = lerp(4.5, 7, p.size), paints = [p.body, p.accent];

    if (p.style === 'shower') {
      // the leaves come from above one after another (the first already on frame 0), each tumbling down
      const wide = lerp(9, 17, p.spread);
      for (let i = 0; i < n; i++) {
        const order = (i * 5 + 2) % n;                                       // not left to right
        const life = clamp((t - 0.45 * order / n) / 0.55);
        if (order > 0 && life <= 0) continue;                                // not let go yet: still up in the tree
        const x = X + (n === 1 ? 0 : (i / (n - 1) - 0.5) * 2 * wide) + (hash(i, 31) - 0.5) * 3;
        const y = 6 + 4 * hash(i, 32);
        leaves(g, { t: life, x, y, count: 1, seed: 40 + i, dist: 3, gravity: 46, size, paints: [paints[i % 2]], box: BOX });
      }
      leafFall(g, { t, count: Math.round(n / 2), x: X, y: 12, spread: wide, floor: 45, colours: [p.accent, p.body], seed: 5, box: BOX });
      return;
    }

    // burst: frame 0 is the clump breaking open; every leaf gets its own launch angle, throw and weight, so they
    // fly up and out as a loose cloud, the light ones drifting longer, and all tumble down to the ground
    const far = lerp(14, 21, p.spread) * lerp(0.9, 1.1, p.size), k = lerp(0.1, 1, t), floor = 45 - size * 0.4;
    for (let i = 0; i < n; i++) {
      const at = throwOf(i, n, k, far, floor);
      leaves(g, { t: clamp(k * at.turn), x: at.x, y: at.y, count: 1, seed: 3 + 7 * i, dist: 0, gravity: 0, size, paints: [paints[i % 2]], box: BOX });
    }
  },
});

// Where leaf i of n is at time k. Each leaf is thrown at its own spot of an oval cloud above the bush (sunflower
// order, so the spots sit evenly apart and the leaves do not pile up), at its own launch speed, and has its own
// weight, which sets when it starts to come down and when it lands on the floor row (always before the last frame).
// On the way down it drifts to its own place on the ground, in the same left-to-right order, so they lie spread out.
function throwOf(i, n, k, far, floor) {
  const spot = (j) => { const r = Math.sqrt((j + 0.6) / n), a = j * 2.39996 + 2.4; return [Math.cos(a) * r * far * 1.15, -far * 0.7 + Math.sin(a) * r * far * 0.95]; };
  const [tx, ty] = spot(i);                                                 // golden angle: evenly spread spots
  let rank = 0;
  for (let j = 0; j < n; j++) if (spot(j)[0] < tx) rank++;
  const gx = (rank / Math.max(1, n - 1) - 0.5) * Math.min(42, far * 2.3);   // its place on the ground
  const fly = 1 - (1 - k) ** lerp(2, 3.2, hash(i, 72));                  // fast off the mark, slowing in the air
  const fall = lerp(0.55, 0.67, hash(i, 75)), land = lerp(0.78, 0.92, hash(i, 73)), down = clamp((k - fall) / (land - fall));
  const drop = (floor - Y - ty) * down ** 2;
  return { x: X + lerp(tx * fly, gx, down), y: Math.min(floor, Y + ty * fly + drop), turn: lerp(0.8, 1.2, hash(i, 74)) };
}
