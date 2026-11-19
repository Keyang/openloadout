// Debris: what flies off a dead enemy, seen from above. `burst` (Scrap) is for machines: inked metal pieces fly out
// of a puff of dust, hop, tumble and come to rest, and three of them stay on the floor. `goo` is for bugs: blobs and
// droplets of slime splash out, land and flatten into puddles. The pieces and the slime are the framework's
// (engine/fx-floor.js: scrap, splash), the dust and the first flash are engine/fx.js's (puffs, glow); this file is
// the sizes and the timing.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp } from '../engine/motion.js';
import { INK } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { steps, puffs, glow } from '../engine/fx.js';
import { scrap, splash, SCRAP_SHAPES } from '../engine/fx-floor.js';

const D = PALETTE.derelict;
const CX = 24, CY = 24;
const DUST = steps(D.panel, { core: D.steel, white: false });           // the dust a wreck throws up: a rim of its own, no ink
const fps = (base) => (p) => base * lerp(0.65, 1.45, p.speed);

export default defineSprite({
  id: 'debris-burst',
  name: 'Debris',
  kind: 'Effect',
  blurb: 'What flies off a dead enemy: metal scrap that tumbles and comes to rest, or bug goo that splashes and flattens. Change its size, number of pieces, spread, kind of scrap, tumbling and colours.',
  meta: { type: 'effect', role: 'effects/dust', themes: ['sci-fi', 'space'], gameTypes: ['roguelike-action', 'shooter'], view: 'top-down',
    words: ['debris', 'scrap', 'wreckage', 'shrapnel', 'metal', 'bolts', 'goo', 'slime', 'splat', 'gibs', 'break', 'destroy', 'death', 'remains'], license: 'draft' },
  size: [48, 48],
  pivot: [CX, CY],
  grounded: false,
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    pieces: range('Pieces', 6, { min: 3, max: 9, step: 1, lo: 'Few', hi: 'Many' }),
    spread: range('Spread', 0.5, { lo: 'Tight', hi: 'Wide' }),
    style: choice('Style', 'plates', [...SCRAP_SHAPES]),
    spin: toggle('Tumble', true),
    body: color('Scrap', D.panel, swatches('derelict', 'body', { lead: 'panel' })),
    accent: color('Goo', D.acid, swatches('derelict', 'liquid', { lead: 'acid' })),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    burst: { label: 'Scrap', frames: 8, fps: fps(14), loop: false },
    goo: { frames: 8, fps: fps(14), loop: false },
  },

  render(g, { clip, t, frame, p }) {
    const far = lerp(10, 18, p.spread);                                 // how far the farthest piece is thrown, across
    if (clip === 'goo') {
      splash(g, { t, x: CX, y: CY, count: p.pieces, seed: 2, dist: far, hop: lerp(3, 6, p.size), size: lerp(4, 6.6, p.size), pool: lerp(8, 14, p.size), from: 0.08, colour: p.accent });
      return;
    }
    // scrap: a pale flash and a puff of dust where it broke, and the pieces over them
    const dust = Math.min(1, t * 1.75);                                 // the dust is gone before the pieces have settled
    if (dust < 1) puffs(g, { t: dust, x: CX, y: CY, count: 4, seed: 3, stagger: 0.18, angle: 0, arc: 6.2, dist: far * 0.5, rise: 2, size: lerp(2.2, 3.4, p.size), lobes: 3, colours: DUST });
    if (frame === 0) glow(g, CX, CY, lerp(8, 11, p.size), ['#ffffff', '#ffffff', D.cream, D.steel]);
    scrap(g, { t, x: CX, y: CY, count: p.pieces, keep: 3, seed: 1, shape: p.style, dist: far, hop: lerp(4, 7, p.size), size: lerp(5.4, 8.6, p.size), spin: p.spin ? 1 : 0, from: 0.2, colour: p.body, rim: INK, box: [2, 2, 46, 46] });
  },
});
