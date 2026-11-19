// Rain on water (core-sprites-1, batch K07): an area loop of raindrops striking a pond, a puddle or a flooded floor,
// seen from above. Each drop opens a flat ring that runs out and breaks into arcs, leaving a faint lasting ring, or
// throws a tiny crown of four pixels, or both. Every drop has its own place and its own timer, spread evenly round
// the loop so the patch never goes still. Rings are the framework's one-shot `ring` with a squash (engine/fx.js),
// each called with fract(t + the drop's phase) so the loop closes; the lasting rings are `wakeRing`
// (engine/water.js); the colours are the `steps` chain. Drawn with no water under it: lay it over a water tile.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, fract, hash, TAU } from '../engine/motion.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { steps, ring } from '../engine/fx.js';
import { wakeRing } from '../engine/water.js';

const P = PALETTE.thornwood;
const CX = 32, CY = 32;
const BOX = [1, 1, 63, 63];
// The foam sits on each ring, so the two lists share no colour.
const FOAM = [P.cream, P.sky, P.steel, '#d8d8e0'];
const WATER = swatches('thornwood', 'water');

// Where drop i strikes: spread over a disc of radius `reach` round the middle (sunflower order, so none crowd), flattened for the view.
function spot(i, n, reach, R) {
  const a = i * 2.39996 + hash(i, 3) * 0.6, d = reach * Math.sqrt((i + 0.5) / n) * (0.8 + 0.2 * hash(i, 4));
  const room = 30 - R - 4;                           // the lasting ring reaches 3.5 px past the ring
  return { x: Math.round(CX + Math.max(-room, Math.min(room, Math.cos(a) * d))), y: Math.round(CY + Math.max(-room * 1.2, Math.min(room * 1.2, Math.sin(a) * d * 0.8))) };
}

export default defineSprite({
  id: 'rain-ripples',
  name: 'Rain on water',
  kind: 'Effect',
  blurb: 'Raindrops striking a pond, a puddle or a flooded floor, seen from above: each opens a flat ring that breaks into arcs, as a patch to lay over water. Change the ring size, how many drops, how wide they fall, rings or splashes, and the colours.',
  meta: { type: 'effect', role: 'effects/weather', themes: ['neutral'], gameTypes: ['top-down-rpg', 'farming-sim', 'puzzle', 'platformer'], view: 'top-down',
    words: ['rain', 'raindrops', 'ripples', 'rings', 'puddle', 'pond', 'drizzle', 'downpour', 'storm', 'wet', 'weather', 'splash'], license: 'draft' },
  size: [64, 64],
  pivot: [32, 32],
  grounded: false,
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    pieces: range('Drops', 5, { min: 3, max: 10, step: 1, lo: 'Few', hi: 'Many' }),
    spread: range('Spread', 0.5, { lo: 'Tight', hi: 'Wide' }),
    style: choice('Style', 'rings', ['rings', 'splashes', 'both']),
    core: color('Foam', P.cream, FOAM),
    edge: color('Water', P.water, WATER),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    loop: { frames: 8, fps: (p) => 10 * lerp(0.65, 1.45, p.speed), loop: true },
  },
  versions: [
    { name: 'Drizzle', params: {} },
    { name: 'Downpour', params: { pieces: 10, style: 'both' } },
    { name: 'Puddle', params: { spread: 0, size: 0 } },
    { name: 'Big drops', params: { size: 1, pieces: 3 } },
    { name: 'Night rain', params: { core: P.sky, edge: P.hero } },
  ],

  render(g, { t, p }) {
    const C = steps(p.edge, { core: p.core });                          // [white, foam, middle, water, dark water]
    const [white, foam, , water, rim] = C;
    const n = p.pieces, R = lerp(6, 9.5, p.size), reach = lerp(15, 25, p.spread);
    const rings = p.style !== 'splashes', splashes = p.style !== 'rings';
    for (let i = 0; i < n; i++) {
      const { x, y } = spot(i, n, reach, R);
      const life = fract(t + (i + 0.35 * hash(i, 9)) / n);             // evenly round the loop: the drops never strike together
      const r = R * (0.75 + 0.25 * hash(i, 5));
      if (rings) {
        ring(g, { t: life, x, y, r0: 2.5, r1: r, thick: 2, squash: 0.5, seed: i, colours: [white, foam, water, rim], box: BOX });
        // the faint ring that lingers after the first one has broken up
        if (life > 0.55) wakeRing(g, { x: x + 0.5, y: y + 0.5, rx: r + 1.5, ry: (r + 1.5) * 0.5, t: life, grow: 1, colour: rim, gaps: 0.55, seed: i });
      }
      if (splashes && life < 0.6) {
        // a tiny crown of four pixels round the strike, flung out a step and falling back as single drops
        const k = life / 0.6, d = (k < 0.3 ? 1 : k < 0.7 ? 2 : 3) * lerp(1, 1.8, p.size);
        const c = k < 0.3 ? white : k < 0.7 ? foam : water;
        if (k < 0.3) g.dot(x, y, foam);
        for (let j = 0; j < 4; j++) { const a = TAU * (j + 0.5) / 4; g.dot(Math.round(x + Math.cos(a) * d * 1.2), Math.round(y + Math.sin(a) * d * 0.7), c); }
      }
    }
  },
});
