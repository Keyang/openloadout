// Acid pool: a flat puddle of acid on the floor, seen from above. It boils: bubbles swell and burst, each in its
// own time, and the edge wobbles. `fade` dries it down to a dark stain (the last frame, which a game holds); `spawn`
// starts on a fresh splat the size of that stain and spreads to the full pool. The wobbling edge and the bubbles
// are the framework's (puddleIn and surfaceBubbles in engine/ooze.js); this file is the three shapes, the sizes, the
// colours and the timing. It is what `acid-glob` leaves where it lands, and it matches that glob: inked, the body
// in the acid colour and its dark tone, the shine in cream.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, wave, keys, smooth } from '../engine/motion.js';
import { ramp, mix, INK } from '../engine/color.js';
import { anyIn, insetIn } from '../engine/shapes.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { puddleIn, surfaceBubbles } from '../engine/ooze.js';

const P = PALETTE.derelict;
const CX = 24, CY = 16, BOX = [2, 2, 45, 29];      // the box the body is filled in: its last column and row are 45 and 29, and the outline goes round that
const BODY = swatches('derelict', 'liquid', { lead: 'acid' });
// The shine lies on the body, so the two controls never offer the same colour.
const SHINE = [P.cream, P.suit, P.skin, P.steel].filter((c) => !BODY.includes(c));

// What each shape is: how wide and deep it lies (shares of the size), the waves that give its edge its outline
// ([bulges round the edge, height as a share of the radius, where they start]) and the drops that lie round it
// ([angle in turns, distance as a share of the radius, radius in px]).
const SHAPES = {
  round: { wide: 1, deep: 1, waves: [[2, 0.05, 0.6], [3, 0.06, 0.2], [4, 0.03, 0.85]], drops: [] },
  splat: { wide: 0.84, deep: 0.86, waves: [[5, 0.13, 0.15], [3, 0.07, 0.6], [8, 0.045, 0.35]], drops: [[0.06, 1.34, 2.2], [0.3, 1.4, 1.5], [0.56, 1.32, 2], [0.8, 1.38, 1.4]] },
  long: { wide: 1.14, deep: 0.6, waves: [[2, 0.07, 0.5], [3, 0.07, 0.3], [5, 0.045, 0.6]], drops: [[0.44, 1.3, 1.5]] },
};
// Streaks of deeper acid that slide to and fro in the pool: [x and y as shares of the radii, px long, when in the loop].
const STREAKS = [[-0.45, 0.3, 5, 0], [0.15, -0.35, 4, 0.4], [0.35, 0.45, 4, 0.7]];
const STAIN = 0.4;                       // how big the stain is, as a share of the pool

// The pool this frame: its shape test and what it is made of. `k` is its size as a share of the full pool.
function poolAt(p, t, k, wobble) {
  const S = SHAPES[p.shape];
  // two waves that travel round the edge in opposite ways, once a loop each: that is the wobble
  const live = lerp(0.015, 0.07, p.wobble) * wobble;
  const waves = [...S.waves, [3, live, t + 0.1], [2, live * 0.8, 0.55 - t]];
  // the biggest look still lies inside the frame: the radii give way to the waves and to the drops round the pool
  const reach = 1 + 0.75 * waves.reduce((sum, w) => sum + Math.abs(w[1]), 0), far = S.drops.length ? 1.46 : 1;
  const rx = Math.min(lerp(11, 18.5, p.size) * S.wide * k, 21 / Math.max(reach, far)), ry = Math.min(lerp(6.5, 11, p.size) * S.deep * k, 13 / Math.max(reach, far));
  const body = puddleIn(CX, CY, rx, ry, waves);
  const drops = k > 0.7 ? S.drops.map(([turn, out, r]) => puddleIn(CX + Math.cos(turn * 2 * Math.PI) * rx * out, CY + Math.sin(turn * 2 * Math.PI) * ry * out, r * k + 0.3 * wave(t + turn), r * k * 0.85)) : [];
  return { rx, ry, body, all: anyIn(body, drops) };
}

export default defineSprite({
  id: 'acid-pool',
  name: 'Acid pool',
  kind: 'Item',
  blurb: 'A boiling puddle of acid on the floor, seen from above: bubbles swell and burst and its edge wobbles; it can dry to a dark stain and spread again. Change its size, shape, bubbles, rim and colours.',
  meta: {
    type: 'prop', role: 'world/hazard', themes: ['sci-fi', 'space', 'horror'], gameTypes: ['roguelike-action', 'shooter'], view: 'top-down',
    words: ['acid', 'pool', 'puddle', 'goo', 'slime', 'hazard', 'bubble', 'boil', 'spread', 'fade', 'stain', 'damage', 'toxic', 'floor'], license: 'draft',
  },
  size: [48, 32],
  pivot: [CX, CY],
  grounded: false,
  preview: 'idle',
  sounds: { idle: [{ sound: 'bubbles', preset: 'Boiling', frame: 0, volume: 0.35 }] },
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    shape: choice('Shape', 'round', ['round', 'splat', 'long']),
    pieces: range('Bubbles', 0.5, { lo: 'Few', hi: 'Many' }),
    crust: toggle('Dark rim', true),
    body: color('Body', P.acid, BODY, { material: 'warning' }),
    glow: color('Shine', P.cream, SHINE),
    wobble: range('Wobble', 0.5, { lo: 'Firm', hi: 'Wobbly', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 8, fps: (p) => 8 * lerp(0.65, 1.45, p.speed), loop: true, label: 'Bubbling' },
    fade: { frames: 8, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false, label: 'Dry up' },
    spawn: { frames: 8, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false, label: 'Spread' },
  },

  render(g, { clip, t, frame, p }) {
    const A = ramp(p.body);
    // how big the pool is, how much of its life is left in it (1 boiling, 0 dried to a stain) and how hard it wobbles
    let k = 1, alive = 1, wobble = 1, tt = t;
    if (clip === 'fade') { k = lerp(1, STAIN, smooth(t)); alive = 1 - t; wobble = 1 - t; tt = 0; }
    if (clip === 'spawn') { k = keys(t, [[0, STAIN], [0.3, 0.8], [0.6, 1.07], [0.85, 0.98], [1, 1]]); wobble = frame === 7 ? 1 : 1.3 * (1 - t) + 0.6; tt = 0; }
    const pool = poolAt(p, tt, k, wobble), rest = poolAt(p, 0, 1, 0);
    const dried = alive < 0.15, drying = alive < 0.5;
    const body = dried ? mix(A.deep, INK, 0.35) : drying ? A.dark : A.base;
    const rimTone = dried ? mix(A.deep, INK, 0.6) : drying ? A.deep : A.dark;

    g.fill(...BOX, pool.all, body, { shade: 0 });
    // the rim: a band of thicker, darker acid just inside the edge (a stain keeps its own, whatever the setting)
    if (p.crust || dried) g.fill(...BOX, (x, y) => pool.all(x, y) && !insetIn(pool.all, dried ? 1 : 2)(x, y), rimTone, { shade: 0 });
    const inner = insetIn(pool.body, 3);
    if (!dried) {
      // streaks of deeper acid, sliding to and fro
      const deep = drying ? A.deep : mix(A.base, A.dark, 0.7);
      for (const [u, v, n, when] of STREAKS) {
        const x0 = Math.round(CX + u * pool.rx + 1.5 * wave(tt + when)), y = Math.round(CY + v * pool.ry);
        for (let i = 0; i < n; i++) if (inner(x0 + i + 0.5, y + 0.5)) g.dot(x0 + i, y, deep);
      }
      // the shine: the far edge of the pool catches the light on the side it comes from
      const lit = insetIn(pool.body, p.crust ? 3 : 2);
      g.fill(...BOX, (x, y) => lit(x, y) && !lit(x + 1, y - 1) && x > CX + pool.rx * 0.2 && y < CY - pool.ry * 0.15, drying ? A.base : p.glow, { shade: 0 });
    } else {
      // what the acid ate into the floor: a few pale pits in the stain
      for (const [dx, dy] of [[-2, 0], [1, -1], [2, 1]]) if (insetIn(pool.body, 1)(CX + dx + 0.5, CY + dy + 0.5)) g.dot(CX + dx, CY + dy, A.dark);
    }
    if (alive > 0.3 && clip !== 'spawn' || (clip === 'spawn' && frame >= 4)) {
      // bubbles: placed in the pool at rest, so they stay put while its edge wobbles; fewer as it dries
      const count = Math.round(lerp(4, 11, p.pieces) * (clip === 'fade' ? alive : 1));
      surfaceBubbles(g, { t: clip === 'idle' ? t : frame / 8, count, inside: insetIn(rest.body, 4), keep: insetIn(pool.body, 3), box: [6, 5, 42, 27], size: lerp(1.5, 2.6, p.size), rim: A.dark, body: A.light, glint: p.glow, seed: 4 });
    }
    g.outline(INK);
  },
});
