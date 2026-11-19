// Poison haze: a status effect laid over a poisoned fighter, or a gas left on the ground.
//   loop   (Poisoned) bubbles rise from the bottom third and pop, or a low cloud churns, or small skulls rise and fade
//   burst  (Puff) a lopsided ball of gas billows up and out to the sides, hangs, and thins where it is
// The bubbles and rising marks are engine/fumes.js (`bubble`, `risers`), the cloud and the billow engine/fx.js
// (`puffs`, `steps`), the burst ball engine/bursts.js (`blastBall`, `driftUp`) and
// the skull engine/marks.js (`drawMark`); this file is the layout and the timing.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, PI, easeOut } from '../engine/motion.js';
import { PALETTE } from '../engine/palettes.js';
import { steps, puffs } from '../engine/fx.js';
import { blastBall, driftUp } from '../engine/bursts.js';
import { bubble, risers } from '../engine/fumes.js';
import { drawMark } from '../engine/marks.js';

const P = PALETTE.thornwood;
const CX = 24, FLOOR = 46;                       // the ground row: a gas left on the ground rests its rim on it
const BOX = [1, 1, 47, 47];
// The core sits inside each bubble, puff or mark, so the two lists share no colour.
const CORE = [P.goblin, P.cream, P.gold, P.moss];
const EDGE = [P.thorn, P.ember, P.crimson, P.magic, P.hero, P.leaf, PALETTE.derelict.acid];

// Small skulls at the places given, each by its life: bright when young, the poison colour later, a speck at the end.
function skulls(g, list, C) {
  for (const s of list) {
    const x = Math.floor(s.x), y = Math.floor(s.y);
    if (s.life > 0.9) { g.dot(x, y, C[3]); continue; }
    drawMark(g, 'skull', x, y, 5, s.life < 0.45 ? C[0] : s.life < 0.7 ? C[1] : C[2], { outline: C[3] });
  }
}

// How far a one-shot billow of puffs() may travel and still keep its round top 2 px inside the box.
// up: the most of its distance that points upward (1 straight up); it returns the share of dist and rise to use.
// The worst puff (every random share at its largest) is followed over its whole life: how far up it has gone,
// plus its radius then (it thins as it goes) and the 1 px rim.
function billowFit({ y, dist, rise, size, up }) {
  const room = y - (BOX[1] + 2);
  let fit = 1;
  for (let k = 0.02; k <= 1.0001; k += 0.02) {
    const s = Math.min(1, Math.max(0, (k - 0.35) / 0.65)), thin = 1 - 0.64 * (s * s * (3 - 2 * s)) ** 1.2;
    const top = up * dist * easeOut(k) + rise * k ** 1.5, r = size * 1.2 * thin + 1.5;
    if (top + r > room) fit = Math.min(fit, (room - r) / top);
  }
  return Math.max(0, fit);
}

// Bubbles rising from the bottom third: a speck that swells quickly into a whole bubble, climbs, and pops late,
// so even the fewest and smallest stay whole bubbles most of their climb (at least two on every frame).
function poisonBubbles(g, { t, count, rise, spread, size, colours }) {
  const pad = size + 1.5;
  for (const s of risers({ t, x: CX, y: FLOOR - 6, count, seed: 3, rise, spread, sway: 1.2, box: BOX, pad })) {
    const cx = Math.floor(s.x) + 0.5, cy = Math.floor(s.y) + 0.5;
    if (s.life >= 0.86) { if (s.life < 0.97) bubble(g, cx, cy, size, colours, { pop: (s.life - 0.86) / 0.11, box: BOX }); continue; }
    const r = s.life < 0.04 ? 0.6 : lerp(1.2, size, Math.min(1, (s.life - 0.04) / 0.1));
    bubble(g, cx, cy, r, colours, { box: BOX });
  }
}

export default defineSprite({
  id: 'poison-haze',
  name: 'Poison haze',
  kind: 'Effect',
  blurb: 'Poison hanging over a fighter or the ground: rising bubbles, a churning cloud or small skulls, and a puff of gas. Change its size, how many, spread, rise, style and colours.',
  meta: { type: 'effect', role: 'effects/magic', themes: ['neutral', 'fantasy', 'horror'], gameTypes: ['top-down-rpg', 'turn-based-rpg', 'roguelike-action', 'platformer'], view: 'side',
    words: ['poison', 'poisoned', 'toxic', 'gas', 'haze', 'bubbles', 'venom', 'curse', 'sick', 'cloud', 'fumes', 'status', 'puff'], license: 'draft' },
  size: [48, 48],
  pivot: [24, 46],
  grounded: false,                               // it hangs over a fighter; only the cloud rests on the ground row
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    pieces: range('Pieces', 5, { min: 3, max: 8, step: 1, lo: 'Few', hi: 'Many' }),
    spread: range('Spread', 0.5, { lo: 'Tight', hi: 'Wide' }),
    rise: range('Rise', 0.5, { lo: 'Low', hi: 'High' }),
    style: choice('Style', 'bubbles', ['bubbles', 'cloud', 'skulls']),
    core: color('Core', P.goblin, CORE),
    edge: color('Poison', P.thorn, EDGE, { material: 'warning' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    loop: { label: 'Poisoned', frames: 8, fps: (p) => 10 * lerp(0.65, 1.45, p.speed), loop: true },
    burst: { label: 'Puff', frames: 8, fps: (p) => 16 * lerp(0.65, 1.45, p.speed), loop: false },
  },
  sounds: {
    loop: [{ sound: 'bubbles', preset: 'Slow drips', frame: 0, volume: 0.35, when: { style: ['bubbles'] } }],
    burst: [{ sound: 'whoosh', preset: 'Quick swipe', frame: 0, volume: 0.7 }],
  },
  versions: [
    { name: 'Poisoned', params: {} },
    { name: 'Toxic cloud', params: { style: 'cloud', spread: 1 } },
    { name: 'Curse', params: { style: 'skulls', core: P.cream, edge: P.crimson } },
    { name: 'Swamp gas', params: { style: 'cloud', core: P.moss, edge: P.leaf } },
    { name: 'Faint', params: { size: 0, pieces: 3 } },
  ],

  render(g, { clip, t, frame, p }) {
    const C = steps(p.edge, { core: p.core, white: false });            // [core, middle, poison, rim]
    const n = p.pieces;
    const wide = lerp(18, 32, p.spread) * lerp(0.9, 1.1, p.size);       // the band the poison spreads over
    const up = lerp(18, 30, p.rise);                                    // how high it climbs

    if (clip === 'loop') {
      if (p.style === 'bubbles') {
        poisonBubbles(g, { t, count: n, rise: up, spread: wide, size: lerp(2.4, 3.6, p.size), colours: C });
      } else if (p.style === 'cloud') {
        // a low cloud that rolls outward both ways from the middle and rises a little as it thins
        const o = { t, loop: true, y: FLOOR - 3, arc: 0.7, dist: wide * 0.45, rise: up * 0.35, size: lerp(3, 5, p.size), lobes: 3, floor: FLOOR, colours: C, box: BOX };
        puffs(g, { ...o, x: CX - 1, count: Math.ceil(n / 2), seed: 2, angle: -PI / 2 });
        puffs(g, { ...o, x: CX + 1, count: Math.floor(n / 2), seed: 6, angle: PI / 2 });
      } else {
        skulls(g, risers({ t, x: CX, y: FLOOR - 5, count: n, seed: 4, rise: up, spread: wide, sway: 1.5, box: BOX, pad: 3 }), C);
      }
      return;
    }

    // ---- burst: a lopsided ball of gas, brightest on frame 0, billows up and out to the sides (never down),
    // leaning one way, hangs there and thins in place: gas, not a defeat poof's even ring ----
    const k = frame / 7, CY = FLOOR - lerp(14, 18, p.size), R = lerp(8, 12, p.size);
    if (frame === 0) { blastBall(g, { x: CX - 1, y: CY - 1, r: R, bumps: 6, bump: 0.16, points: false, heat: 0.6, colours: steps(p.edge, { core: p.core }), seed: 3, box: BOX }); return; }
    const big = lerp(5.2, 7.6, p.size) * (p.style === 'cloud' ? 1.1 : 1), lobes = p.style === 'cloud' ? 3 : 2;
    const many = Math.ceil(n * 0.6);
    // the bigger cloud climbs up and to the right (angle: 0 = down, PI = up), the smaller hangs low to the left
    // each billow travels only as far as keeps its round top 2 px inside the box (high rise with wide spread and
    // a big size would otherwise carry it into the border, where the box would cut it off flat)
    const A = { y: CY, dist: wide * 0.6, rise: up * 0.5 + 4, size: big, up: 1 };                       // arc 1.1 reaches straight up
    const B = { y: CY - 1, dist: wide * 0.45, rise: up * 0.3 + 3, size: big * 0.85, up: -Math.cos(PI + 1.05 - 0.3) };
    const fa = billowFit(A), fb = billowFit(B);
    puffs(g, { t: k, x: CX - 1, y: A.y, count: many, seed: 5, loop: false, stagger: 0.2, angle: PI - 0.5, arc: 1.1, dist: A.dist * fa, rise: A.rise * fa, size: big, lobes, colours: C, box: BOX });
    puffs(g, { t: k, x: CX - 2, y: B.y, count: n - many, seed: 11, loop: false, stagger: 0.3, angle: PI + 1.05, arc: 0.6, dist: B.dist * fb, rise: B.rise * fb, size: big * 0.85, lobes, colours: C, box: BOX });
    if (p.style === 'skulls') skulls(g, driftUp({ t: k, x: CX, y: CY - 2, count: Math.min(3, n - 1), rise: up * 0.6, spread: wide * 0.4, sway: 1, from: 0.15, seed: 2, box: BOX, pad: 3 }).map((s) => ({ ...s, life: s.life * 0.8 })), C);
  },
});
