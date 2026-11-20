// PORT (migration batch E2): the drawing of the code sprite sprites/leaf-burst.js (its constants, helpers and render), word for
// word, with its imports pointed at the port shims and at the E2 copies of the engine helpers (engine/gen/ports/e2/), so
// it draws paint refs on an engine/gen/port-surface.js grid. It is the drawing of the effect generator effect.leaf-burst@1
// (engine/gen/fx-e2.js), which sprites/leaf-burst.json names; it goes only with the last version that draws with it. Its
// settings (p) are that generator's arguments; its colours are the paint refs the data file names. A HAND CHANGE note
// says where it differs from its source; never change what a released generator version draws through it.
import { lerp, clamp, hash } from '../../../motion.js';
import { PALETTE } from './palettes.js';
import { leaves } from './fx.js';
import { leafFall } from './foliage.js';

const P = PALETTE.thornwood;
const X = 24, Y = 33;                                    // burst: where the leaves are thrown from
const BOX = [1, 1, 47, 46];                              // the leaves come to rest with their lowest pixels on row 45
// Leaves of the two colours touch in the cloud, so the two lists share no colour.
const BODY = [P.leaf, P.moss, P.ember, P.cream];
const ACCENT = [P.grass, P.gold, P.thorn, P.goblin];

/** Draws one frame of the effect as sprites/leaf-burst.js did: g (a PortSurface), { clip, t, frame, p } (p the settings, colours as paint refs). */
export function render(g, { t, p }) {
  const n = p.pieces, size = lerp(4.5, 7, p.size), paints = [p.body, p.accent];

  if (p.style === 'shower') {
    // the leaves come from above one after another (the first already on frame 0), each tumbling down
    const wide = lerp(9, 17, p.spread);
    for (let i = 0; i < n; i++) {
      const order = (i * (n % 5 ? 5 : 3) + 2) % n;   // HAND CHANGE (E2): steps of 5 visit every leaf only when n is not a multiple of 5 (the code let none go on frame 0 with 5 or 10 leaves); then steps of 3                                       // not left to right
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
}


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
