// Muzzle flash: the flash at a gun's tip, spreading to the right from the pivot (the muzzle).
// Frame 0 is the big white flash; the prongs then fly off the barrel and thin, and the last frame
// is three pixels. The prongs are the framework's fanned spikes (engine/blast.js `spikesIn`), the
// shock ring is engine/fx.js `ring`; this file is the timing, the three styles and the sizes.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { ellipseIn } from '../engine/surface.js';
import { lerp, PI } from '../engine/motion.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { steps, ring } from '../engine/fx.js';
import { spikesIn } from '../engine/blast.js';

const P = PALETTE.derelict;
const MX = 8.5, MY = 15.5;                               // the muzzle: the pixel centre beside the pivot, so prongs are the same above and below
const RIGHT = PI / 2;
const FAR = 22;                                          // the farthest a prong tip goes from the muzzle (column 30)
const SIDE = 13.5;                                       // the farthest one goes above or below it
const PRONGS = { one: 1, three: 3, five: 5 };
const inFrame = (px, py) => px >= 1 && py >= 1 && px < 31 && py < 31;
// The core sits inside the edge colour, so the two controls never offer the same colour.
const EDGE = swatches('derelict', 'edge', { lead: 'cyan' });
const CORE = [P.cream, P.suit, P.skin, P.gold].filter((c) => !EDGE.includes(c));

// What each style's prongs are: how wide the fan opens for three and five prongs, how long the outer
// ones are, how wide a prong is (as a share of the Size width) and where it is widest.
const STYLES = {
  star: { arc: { 1: 0, 3: PI, 5: PI }, short: 0.68, wide: 1, belly: 0.3, ball: 0.8 },           // sharp kites: a long one ahead, shorter ones straight out to the sides
  cone: { arc: { 1: 0, 3: 1.3, 5: 1.6 }, short: 1, wide: 1.25, belly: 0.74, ball: 0.4 },       // fat petals that join into one cone, its point on the muzzle
  ring: { arc: { 1: 0, 3: 0.7, 5: 1.1 }, short: 0.7, wide: 0.6, belly: 0.3, ball: 0.8 },       // thin lances through a shock ring
};

export default defineSprite({
  id: 'muzzle-flash',
  name: 'Muzzle flash',
  kind: 'Effect',
  blurb: 'The flash at the tip of a gun, spreading to the right from the muzzle. Change its size, reach, style, number of prongs and colours.',
  meta: { type: 'effect', role: 'effects/spark', themes: ['sci-fi', 'space'], gameTypes: ['roguelike-action', 'shooter', 'arcade'], view: 'top-down',
    words: ['muzzle', 'flash', 'gun', 'gunfire', 'shot', 'shoot', 'fire', 'blast', 'barrel', 'spark', 'laser', 'bright'], license: 'draft' },
  size: [32, 32],
  pivot: [8, 16],
  grounded: false,
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    length: range('Length', 0.5, { lo: 'Short', hi: 'Long' }),
    style: choice('Style', 'star', ['star', 'cone', 'ring']),
    pieces: choice('Prongs', 'three', ['one', 'three', 'five']),
    core: color('Core', P.cream, CORE),
    edge: color('Edge', P.cyan, EDGE),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    burst: { frames: 4, fps: (p) => 20 * lerp(0.65, 1.45, p.speed), loop: false },
  },

  render(g, { t, frame, p }) {
    const C = steps(p.edge, { core: p.core });           // [white, core, middle, edge, rim]
    const [white, core, mid, edge, rim] = C;
    const n = PRONGS[p.pieces], S = STYLES[p.style];
    const L = lerp(13, 19.5, p.length);                  // how far the middle prong reaches on frame 0
    const far = Math.min(FAR, L + 2.5);                  // where its tip ends up
    const W = lerp(4, 7, p.size) * S.wide;               // px across the middle prong on frame 0
    const ball = lerp(3, 5, p.size) * S.ball;            // the round flash on the muzzle itself
    // the outermost prongs are kept short enough to stay inside the frame above and below
    const shortFor = (r0, r1) => Math.min(S.short, (SIDE / Math.max(0.01, Math.sin(S.arc[n] / 2)) - r0) / (r1 - r0));
    const fan = (o) => spikesIn(MX, MY, { count: n, angle: RIGHT, arc: S.arc[n], short: shortFor(o.r0 ?? 0, o.r1), belly: S.belly, ...o });
    const disc = (r) => ellipseIn(MX, MY, r, r);
    const body = (tests, colour, rimColour) => g.blob(tests, colour, { shade: 0, clip: inFrame, ...(rimColour ? { outline: rimColour } : {}) });
    // the shock ring of the ring style stands across the barrel, a little ahead of the muzzle
    const ringX = MX + ball + 2, tall = 2.2, ry = lerp(8, 12.5, p.size);
    const shock = () => { if (p.style === 'ring') ring(g, { t, x: ringX, y: MY, r0: (ry / tall) * 0.62, r1: ry / tall, thick: 3, squash: tall, seed: 4, colours: [white, core, mid, edge, edge] }); };

    if (frame === 0) {
      // the whole flash, white inside a line of the core colour
      body([fan({ r1: L, width: W }), disc(ball)], core, edge);
      body([fan({ r1: L - 1.6, width: W - 2.2, hair: false }), disc(ball - 1.1)], white);
      shock();
    } else if (frame === 1) {
      shock();
      // the prongs leave the barrel and thin; the ball on the muzzle is going out
      body([fan({ r0: L * 0.28, r1: lerp(L, far, 0.6), width: W * 0.55 }), disc(ball * 0.55)], core, edge);
      body([fan({ count: 1, r0: L * 0.45, r1: lerp(L, far, 0.6) - 2, width: 0.4 })], white);     // a white line down the middle prong
    } else if (frame === 2) {
      shock();
      body([fan({ r0: L * 0.62, r1: far, width: p.style === 'cone' ? W * 0.28 : 0.4 })], edge);
    } else {
      // three pixels: the tips of the middle prong and of the outermost two (one prong: three along it)
      const side = L * 0.62 + (far - L * 0.62) * shortFor(L * 0.62, far) - 0.5;       // where the outermost prongs ended on frame 2
      const tips = n === 1 ? [[far - 0.5, 0], [far - 2.5, 0], [far - 5.5, 0]] : [[far - 0.5, 0], [side, S.arc[n] / 2], [side, -S.arc[n] / 2]];
      const dots = p.style === 'ring' ? [[MX + far - 0.5, MY], [ringX, MY - ry + 0.5], [ringX, MY + ry - 0.5]] : tips.map(([d, a]) => [MX + Math.sin(RIGHT + a) * d, MY + Math.cos(RIGHT + a) * d]);
      for (const [x, y] of dots) g.dot(x, y, rim);
    }
  },
});
