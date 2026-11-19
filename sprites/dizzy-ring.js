// Dizzy ring: a stunned or dazed status, placed by a game over a head. Small marks (stars, pluses or dots)
// run round a flattened ring once per loop; the ring's faint track is drawn in two halves, the far half
// behind the marks at the back and the near half under the marks in front. Marks at the back are a size
// smaller and a tone darker. The track is engine/orbits.js `orbitHoop`, the marks engine/marks.js (stars),
// engine/bursts.js `sparkMark` (pluses, dots) and engine/shots.js `lightShape`; this file is the choreography.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { Surface, masked } from '../engine/surface.js';
import { lerp } from '../engine/motion.js';
import { PALETTE } from '../engine/palettes.js';
import { steps } from '../engine/fx.js';
import { orbitHoop } from '../engine/orbits.js';
import { sparkMark } from '../engine/bursts.js';
import { markIn } from '../engine/marks.js';
import { lightShape } from '../engine/shots.js';
import { ellipseTurn } from '../engine/ellipse-path.js';

const P = PALETTE.thornwood;
const CX = 16, CY = 16;
// The core sits inside each mark, so the two controls never offer the same colour.
const EDGE = [P.gold, P.crimson, P.thorn, P.magic, P.moss, P.hero, P.ember];
const CORE = [P.cream, P.sky, P.goblin, P.steel, P.skin].filter((c) => !EDGE.includes(c));
// The flattest the ring goes (its smallest ry) for each number of marks, small and big: a flat ring has no room at
// its ends for three or five marks going round them, so those rings never go quite as flat. Found by checking every
// style, size and frame for marks drawn over each other; 2 and 4 marks can lie flat because the phase below keeps
// a front mark and a back mark from ever sharing an x.
const FLAT = { 2: [2.5, 2.75], 3: [3, 3.5], 4: [2.75, 3.75], 5: [3.5, 4.5] };
// A quarter of a frame's step: with 8 frames and up to 5 marks, no frame puts a front and a back mark at the same x.
const PHASE = 1 / 16;

export default defineSprite({
  id: 'dizzy-ring',
  name: 'Dizzy ring',
  kind: 'Effect',
  blurb: 'A dazed status: little stars, pluses or dots running round a flattened ring over a stunned head. Change its size, how many marks, their style, how round the ring is and colours.',
  meta: { type: 'effect', role: 'effects/spark', themes: ['neutral'], gameTypes: ['platformer', 'arcade', 'roguelike-action', 'turn-based-rpg'], view: 'side',
    words: ['dizzy', 'dazed', 'stunned', 'stun', 'stars', 'seeing stars', 'confused', 'knocked out', 'spin', 'circle', 'status', 'head'], license: 'draft' },
  size: [32, 32],
  pivot: [16, 16],
  grounded: false,
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    pieces: range('Marks', 3, { min: 2, max: 5, step: 1, lo: 'Few', hi: 'Many' }),
    style: choice('Style', 'stars', ['stars', 'pluses', 'dots']),
    depth: range('Ring depth', 0.75, { lo: 'Flat', hi: 'Round' }),
    core: color('Core', P.cream, CORE),
    edge: color('Edge', P.gold, EDGE),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    loop: { frames: 8, fps: (p) => 10 * lerp(0.65, 1.45, p.speed), loop: true },
  },
  versions: [
    { name: 'Seeing stars', params: {} },
    { name: 'Sleepy dots', params: { style: 'dots', edge: P.hero } },
    { name: 'Big daze', params: { size: 1, pieces: 5 } },
    { name: 'Stunned sparks', params: { style: 'pluses', edge: P.crimson } },
    { name: 'Wide loop', params: { depth: 1 } },
  ],

  render(g, { t, p }) {
    const [core, mid, edge, rim] = steps(p.edge, { core: p.core, white: false });
    const big = p.size > 0.7 ? 1 : 0;                    // every mark is one size bigger on a big ring
    const n = Math.round(p.pieces), flat = FLAT[n][big];
    const rx = lerp(8, 11, p.size), ry = lerp(flat, Math.max(flat, rx / 2), p.depth);   // default depth 0.75: ry is 4 px or more, so the ring's round ends show beside the side marks
    const hoop = orbitHoop({ cx: CX, cy: CY, rx, ry, thick: 1.4, back: rim, front: mid });
    const marks = [];
    for (let i = 0; i < n; i++) {
      // one turn per loop, the marks evenly spaced by distance along the ring (by angle they would bunch at its ends); sin(a) < 0 is the far side
      const a = ellipseTurn(rx - 0.5, ry - 0.5, t + i / n + PHASE);
      marks.push({ x: CX + Math.cos(a) * (rx - 0.5), y: CY + Math.sin(a) * (ry - 0.5), back: Math.sin(a) < 0 });
    }
    const mark = (layer, m) => {
      const s = (m.back ? 0 : 1) + big;                  // 0, 1 or 2: the mark's size step
      const list = m.back ? [mid, edge, rim] : [core, edge, rim];
      if (p.style === 'stars') lightShape(layer, markIn('star', Math.floor(m.x), Math.floor(m.y), 3 + 2 * s), list);
      else sparkMark(layer, m.x, m.y, s + 2, p.style === 'pluses' ? 'plus' : 'dot', list);
    };
    // The back marks first, then the far half of the track over them, with a gap left under each back mark's
    // pixels and one pixel either side: the track passes behind the mark without a line crossing its middle, so a small star keeps its shape.
    const backs = new Surface(g.w, g.h);
    marks.filter((m) => m.back).forEach((m) => mark(backs, m));
    g.blit(backs);
    const under = (x, y) => [-1, 0, 1].some((d) => backs.get(x + d, y));   // the mark and one pixel either side of it
    g.blit(masked(hoop.draw(new Surface(g.w, g.h), 'far'), (x, y) => !under(Math.floor(x), Math.floor(y))));
    hoop.draw(g, 'near');
    marks.filter((m) => !m.back).forEach((m) => mark(g, m));
  },
});
