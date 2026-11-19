// Crumbling block: a 30x28 block that falls apart when stood on and grows back.
// The four clips are one cycle, in the order a game steps through them: `idle` (whole), `shake`
// (its chunks come loose one after another, from the top, and rattle), `break` (the chunks fall
// and end as a row of crumbs on the ground line), `respawn` (starts on that same row of crumbs,
// then the block rises out of the ground line and settles on `idle`).
//
// The block is drawn once per frame on a spare Surface, without its outline, and everything else
// is made from that picture: the breaking helper splits it into the block's own chunks, so the
// pieces that fall are pieces of this block, in this style, with these cracks. No frame is ever
// empty: the last frame of `break` and the first of `respawn` keep one crumb per chunk.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { Surface, ellipseIn, rectIn } from '../engine/surface.js';
import { lerp, clamp, PI } from '../engine/motion.js';
import { ramp, mix, INK } from '../engine/color.js';
import { PALETTE } from '../engine/palettes.js';
import { crack } from '../engine/rock.js';
import { fragments, drawFragment, crumble, rise } from '../engine/breaking.js';

const P = PALETTE.thornwood;
const SIZE = 32, X0 = 2, Y0 = 4, BW = 28, BH = 26, GROUND = 29;   // the block without its outline: columns 2..29, rows 4..29
// Cracks and edges are drawn on the body: the two lists share no colour, and every crack colour is
// darker than every body colour.
const BODY = [P.stone, P.cream, P.moss, P.haze, P.wood];
const ACCENT = [P.slate, P.cavern, P.soil, P.thorn, P.leaf, P.crimson];

// What each style is made of, from the two colour controls, so both matter in every style.
const MATERIAL = {
  stone: (body, accent) => [body, accent],
  wood: (body, accent) => [mix(body, P.wood, 0.65), mix(accent, P.soil, 0.6)],
  ice: (body, accent) => [mix(body, P.sky, 0.7), mix(accent, P.water, 0.55)],
  cloud: (body, accent) => [mix(body, P.cream, 0.75), mix(accent, P.haze, 0.5)],
};

// ---- the four blocks, each filling columns 2..29 and rows 4..29 --------------------------------
// Each draws its block and returns the block's shape test, which keeps the cracks on the block.

// The cut stone block: its box with three corners knocked off (two steps at the top left and the
// bottom right, one at the top right).
function stoneIn(px, py) {
  const c = Math.floor(px) - X0, r = Math.floor(py) - Y0, c1 = BW - 1 - c, r1 = BH - 1 - r;
  return c >= 0 && c1 >= 0 && r >= 0 && r1 >= 0 && c + r >= 2 && c1 + r1 >= 2 && c1 + r >= 1;
}

function stone(s, B, A) {
  // three courses of cut stone: a cap, two stones, three stones
  const on = { clip: stoneIn };
  s.fill(X0, Y0, X0 + BW, Y0 + BH, stoneIn, B.base);
  s.rect(X0, Y0, BW, 1, B.light, on);
  s.rect(X0, Y0 + 1, 1, BH - 1, B.dark, on);
  s.rect(X0, GROUND - 1, BW, 2, B.dark, on);
  s.rect(X0, 10, BW, 1, A, on); s.rect(X0, 20, BW, 1, A, on);                  // the bed joints
  s.rect(15, 11, 1, 9, A); s.rect(10, 21, 1, 7, A); s.rect(21, 21, 1, 7, A);    // the upright joints
  for (const [x, y, w] of [[3, 11, 12], [16, 11, 13], [3, 21, 7], [11, 21, 10], [22, 21, 7]]) s.rect(x, y, w, 1, B.light);   // each stone's lit top
  for (const [x, y] of [[6, 7], [20, 6], [7, 15], [23, 16], [14, 24], [25, 25]]) s.rect(x, y, 2, 1, B.dark);                // pits
  return stoneIn;
}

function wood(s, B, A) {
  // three thick planks, their ends not quite in line, nailed at each end
  const planks = [[2, 28, 4], [3, 29, 13], [2, 29, 22]];
  planks.forEach(([a, b, y], i) => {
    s.rect(a, y, b - a + 1, 8, B.base);
    s.rect(a, y, b - a + 1, 1, B.light);
    s.rect(a, y + 7, b - a + 1, 1, B.dark);
    s.rect(a + 7 + i * 3, y + 3, 7, 1, B.dark); s.rect(a + 15 - i * 4, y + 5, 5, 1, B.dark);   // the grain
    for (const x of [a + 2, b - 2]) s.rect(x, y + 3, 1, 2, A);                                   // nails
  });
  s.rect(3, 12, 26, 1, A); s.rect(3, 21, 27, 1, A);                             // the gaps between planks
  const parts = [...planks.map(([a, b, y]) => rectIn(a, y, b - a + 1, 8)), rectIn(3, 12, 26, 1), rectIn(3, 21, 27, 1)];
  return (px, py) => parts.some((f) => f(px, py));
}

function ice(s, B, A) {
  // a clear block with cut corners, lit from the top right, with two streaks of shine
  const cut = (r) => Math.max(0, 3 - r, 3 - (BH - 1 - r));
  const inside = (px, py) => { const r = Math.floor(py) - Y0; return r >= 0 && r < BH && px >= X0 + cut(r) && px < X0 + BW - cut(r); };
  s.fill(X0, Y0, X0 + BW, Y0 + BH, inside, B, { shade: 2, light: 1 });
  for (let i = 0; i < 9; i++) { s.dot(9 + i, 20 - i, '#ffffff'); if (i < 6) s.dot(15 + i, 23 - i, B.light); if (i > 1 && i < 8) s.dot(10 + i, 20 - i, B.light); }
  s.rect(5, 23, 9, 1, A); s.rect(22, 9, 1, 6, A); s.rect(18, 26, 6, 1, A);       // flaws frozen inside
  return inside;
}

function cloud(s, B, A) {
  // a puff of cloud: three lobes over a wide body
  const box = rectIn(X0, Y0, BW, BH);
  const lobes = [ellipseIn(16, 20.5, 14, 9.5), ellipseIn(9, 12, 6.5, 6.5), ellipseIn(18, 10.5, 7.5, 6.5), ellipseIn(24.5, 15, 5, 5.5)];
  const inside = (px, py) => box(px, py) && lobes.some((f) => f(px, py));
  s.blob(lobes, B, { shade: 2, light: 1, clip: box });
  s.arc(10, 13, 3.5, PI * 0.1, PI * 0.6, 1, A, { clip: inside });                // the curls that say cloud
  s.arc(20, 12, 4, PI * 0.05, PI * 0.5, 1, A, { clip: inside });
  s.arc(15, 22, 5, -PI * 0.45, PI * 0.25, 1, A, { clip: inside });
  return inside;
}

const DRAW = { stone, wood, ice, cloud };
// Where the cracks of a worn block start, which way they run (0 = down, PI/2 = right, PI = up) and how long they get.
const CRACKS = [[8, 4, 0.35, 11], [29, 15, -PI / 2 - 0.3, 9], [20, 29, PI - 0.4, 10], [23, 4, -0.25, 8]];

// The whole block on a spare Surface, without its outline.
function whole(p) {
  const s = new Surface(SIZE, SIZE);
  const [body, accent] = MATERIAL[p.style](p.body, p.accent);
  const on = DRAW[p.style](s, ramp(body), accent);                               // cracks stay on the block
  CRACKS.forEach(([x, y, angle, len], i) => {
    const grown = clamp(p.wear * CRACKS.length - i);                             // one crack after another as Wear goes up
    if (grown > 0) crack(s, x, y, angle, Math.max(3, Math.round(len * grown)), accent, { seed: 7 + i, clip: on, branch: grown === 1 });
  });
  return s;
}

export default defineSprite({
  id: 'crumble-block',
  name: 'Crumbling block',
  kind: 'Item',
  blurb: 'A block that shakes, falls to pieces when stood on and grows back; change what it is made of, how cracked it is, how many pieces it breaks into, its colours and how hard it shakes.',
  meta: {
    type: 'prop',
    role: 'world/platform',
    themes: ['fantasy', 'forest'],
    gameTypes: ['platformer'],
    view: 'side',
    words: ['block', 'crumble', 'crumbling', 'falling', 'platform', 'break', 'shake', 'respawn', 'collapse', 'brick', 'trap', 'cracked', 'fragile'],
    license: 'draft',
  },
  size: [SIZE, SIZE],
  pivot: [16, 30],
  params: {
    style: choice('Style', 'stone', ['stone', 'wood', 'ice', 'cloud']),
    wear: range('Wear', 0.4, { lo: 'New', hi: 'Worn' }),
    pieces: range('Pieces', 0.5, { lo: 'Few', hi: 'Many' }),
    body: color('Body', P.stone, BODY, { material: 'stone' }),
    accent: color('Cracks and edges', P.slate, ACCENT, { material: 'stone' }),
    wobble: range('Wobble', 0.4, { lo: 'Firm', hi: 'Wobbly', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 1, fps: 8, loop: true },
    shake: { frames: 6, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: true },
    break: { frames: 8, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false },
    respawn: { frames: 6, fps: (p) => 10 * lerp(0.65, 1.45, p.speed), loop: false, label: 'Grow back' },
  },
  sounds: {
    shake: [{ sound: 'crate-break', preset: 'Twig snap', frame: 0, volume: 0.5 }],
    break: [{ sound: 'crate-break', preset: 'Crate', frame: 0, volume: 0.8 }],
  },

  render(g, { clip, t, frame, p }) {
    const src = whole(p);
    const pieces = 4 + Math.round(p.pieces * 4);                // 4 to 8 chunks
    const seed = 3;

    if (clip === 'shake') {
      // the chunks come loose one after another from the top, and each loose one rattles: a step in
      // towards the middle, a step up, back. Nothing moves outward, so the block stays in its tile
      const F = fragments(src, pieces, { seed });
      const loose = 1 + Math.floor((frame / 6) * F.length);
      const amp = Math.round(lerp(1, 2, p.wobble));
      F.forEach((f, i) => {
        if (i >= loose) return drawFragment(g, f);
        const beat = (frame + i) % 3;
        drawFragment(g, f, beat === 1 ? (f.x < 16 ? amp : -amp) : 0, beat === 2 ? -amp : 0, { cut: true });
      });
    } else if (clip === 'break') {
      crumble(g, src, { t, pieces, seed, floor: GROUND });
    } else if (clip === 'respawn') {
      // out of the crumbs: the block rises from the ground line, overshoots by a pixel and settles
      const up = [0, 0.3, 0.62, 0.9, 1, 1][frame], hop = frame === 4 ? 1 : 0;
      if (frame < 2) crumble(g, src, { t: 1, pieces, seed, floor: GROUND });
      rise(g, src, { shown: Math.round(BH * up), floor: GROUND, hop });
    } else g.blit(src);
    g.outline(INK);
  },
});
