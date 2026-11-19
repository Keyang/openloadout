// Arrow: flies point first to the right with its fletching fluttering; on a hit it stops dead,
// the head sinks in and the shaft quivers until it is still. The arrow is so small that it is
// laid out pixel column by pixel column; a tilt slides each column up or down by whole pixels,
// so the shaft stays one clean line. Trail and splinters are the framework's (engine/fx.js).
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, PI } from '../engine/motion.js';
import { tone, INK } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { streaks, particles } from '../engine/fx.js';

const P = PALETTE.thornwood;
const ROW = 7;                                           // the shaft's row; the pivot line runs along its lower edge
// Shaft, head and feathers touch, so no two of these controls offer the same colour.
const WOOD = swatches('thornwood', 'wood');
const METAL = swatches('thornwood', 'metal').filter((c) => !WOOD.includes(c));
const ACCENT = swatches('thornwood', 'accent', { lead: 'crimson' }).filter((c) => !WOOD.includes(c) && !METAL.includes(c));

// Heads, as half-heights column by column from the tip backward (0 = just the shaft's row).
// `barbs` are extra columns behind the head that only have their outermost pixels: the hooks.
const HEADS = {
  broad: { cols: [0, 1, 1, 2, 2] },
  needle: { cols: [0, 0, 0, 1, 1, 1] },
  barbed: { cols: [0, 1, 2, 3], barbs: [3, 3] },
  blunt: { cols: [1, 2, 2, 2, 1] },
};
// How the quiver dies away after the hit, frame by frame (share of the full swing at the tail).
const QUIVER = [0, -1, 1, -0.6, 0.34, 0];

// One feather: rows of pixels above (side = -1) or below (side = 1) the shaft, swept back.
// state: -1 pressed flat, 0 at rest, 1 flared.
function vane(spans, xT, side, state, colour) {
  const row = (k) => ROW + side * k;
  spans.push([xT + 1, row(1), 4, colour]);
  if (state >= 0) spans.push([xT, row(2), 3, colour]); else spans.push([xT + 1, row(2), 2, colour]);
  if (state > 0) spans.push([xT - 1, row(3), 2, colour]);
}

export default defineSprite({
  id: 'arrow',
  name: 'Arrow',
  kind: 'Item',
  blurb: 'An arrow that flies to the right and sticks, quivering, where it hits. Change its length, head, feathers, trail and colours.',
  meta: { type: 'projectile', role: 'effects/projectile', themes: ['fantasy', 'forest'], gameTypes: ['platformer', 'arcade', 'shooter'], view: 'side',
    words: ['arrow', 'bolt', 'dart', 'bow', 'archer', 'shot', 'shoot', 'fly', 'hit', 'stuck', 'ranged attack', 'feather', 'wooden'], license: 'draft' },
  size: [32, 16],
  pivot: [16, 8],
  grounded: false,
  preview: 'fly',
  params: {
    length: range('Length', 0.5, { lo: 'Short', hi: 'Long' }),
    style: choice('Style', 'broad', ['broad', 'needle', 'barbed', 'blunt']),
    trail: toggle('Trail', true),
    wood: color('Wood', P.wood, WOOD),
    metal: color('Metal', P.steel, METAL),
    accent: color('Feathers', P.crimson, ACCENT, { material: 'cloth' }),      // fletching: dyed, any colour
    wobble: range('Wobble', 0.5, { lo: 'Firm', hi: 'Wobbly', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    fly: { frames: 4, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: true },
    hit: { frames: 6, fps: (p) => 16 * lerp(0.65, 1.45, p.speed), loop: false },
  },

  render(g, { clip, t, frame, p }) {
    const L = 2 * Math.round(lerp(7, 11, p.length));     // tail to tip, in pixels
    const head = HEADS[p.style], hl = head.cols.length;
    const hit = clip === 'hit';
    // on a hit the arrow has gone on into the target: everything from column `wall` on is hidden
    const sink = hit ? Math.max(2, Math.round(hl * 0.6)) : 0;
    const xT = 16 - L / 2 + sink, xH = 16 + L / 2 + sink, wall = hit ? 16 + L / 2 : 32;

    // ---- the arrow lying level: [x, row, width, colour] ----
    const spans = [];
    const wood = p.wood, steel = { hi: tone(p.metal, 0.85), mid: p.metal, lo: tone(p.metal, -1) };
    const flap = hit ? [0, 0] : [[0, 1, 0, -1][frame], [1, 0, -1, 0][frame]];     // the two feathers flutter out of step
    spans.push([xT, ROW, xH - hl - xT, wood]);
    vane(spans, xT, -1, flap[0], p.accent);
    vane(spans, xT, 1, flap[1], tone(p.accent, -1));
    head.cols.forEach((k, i) => {
      const x = xH - 1 - i;
      if (k > 0) spans.push([x, ROW - k, 1, steel.mid, k], [x, ROW + 1, 1, steel.lo, k]);
      spans.push([x, ROW, 1, steel.hi]);
    });
    (head.barbs ?? []).forEach((k, i) => {
      const x = xH - 1 - hl - i;
      spans.push([x, ROW - k, 1, steel.mid], [x, ROW + k, 1, steel.lo]);
    });

    // ---- the tilt: the tail swings up and down, each column slid by whole pixels ----
    let swing, still;                                    // px the tail is off the level; the column that stays put
    if (hit) { swing = Math.round(QUIVER[frame] * Math.round(lerp(1, 3, p.wobble))); still = wall - 1; }
    else { swing = Math.round(lerp(0, 1.7, p.wobble) * [1, 0, -1, 0][frame]); still = 16 + Math.round(L / 6); }
    const slide = (x) => Math.round((swing * (still - x)) / (still - xT));
    for (const [x, row, w, colour, h = 1] of spans) {
      for (let c = x; c < x + w; c++) if (c < wall) g.rect(c, row + slide(c), 1, h, colour);
    }
    g.outline(INK);

    if (hit) {
      // splinters jump back from where it went in, and are gone before it stops quivering
      if (t < 0.7) particles(g, { t: t / 0.7, x: wall - 1, y: ROW + 0.5, loop: false, count: 5, seed: 2, stagger: 0.2, angle: -PI / 2, arc: 2.6, dist: 6, gravity: 2, size: 1.6, spread: 1.5, colours: ['#ffffff', wood], box: [1, 1, wall, 15] });
    } else if (p.trail) {
      // white speed lines: one straight behind the nock, two streaming back past the feathers
      streaks(g, { t, x: xT - 2, y: ROW + 0.5, count: 1, seed: 1, length: 5, reach: 3, colour: '#ffffff' });
      streaks(g, { t, x: xT + 2, y: ROW + 0.5, count: 2, seed: 2, length: 6, reach: 4, spread: 4, colour: '#ffffff' });
    }
  },
});
