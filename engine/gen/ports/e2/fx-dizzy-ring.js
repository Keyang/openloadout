// PORT (migration batch E2): the drawing of the code sprite sprites/dizzy-ring.js (its constants, helpers and render), word for
// word, with its imports pointed at the port shims and at the E2 copies of the engine helpers (engine/gen/ports/e2/), so
// it draws paint refs on an engine/gen/port-surface.js grid. It is the drawing of the effect generator effect.dizzy-ring@1
// (engine/gen/fx-e2.js), which sprites/dizzy-ring.json names; it goes only with the last version that draws with it. Its
// settings (p) are that generator's arguments; its colours are the paint refs the data file names. A HAND CHANGE note
// says where it differs from its source; never change what a released generator version draws through it.
import { Surface, masked } from './surface.js';
import { lerp } from '../../../motion.js';
import { PALETTE } from './palettes.js';
import { steps } from './fx.js';
import { orbitHoop } from './orbits.js';
import { sparkMark } from './bursts.js';
import { markIn } from './marks.js';
import { lightShape } from './shots.js';
import { ellipseTurn } from './ellipse-path.js';

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

/** Draws one frame of the effect as sprites/dizzy-ring.js did: g (a PortSurface), { clip, t, frame, p } (p the settings, colours as paint refs). */
export function render(g, { t, p }) {
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
}
