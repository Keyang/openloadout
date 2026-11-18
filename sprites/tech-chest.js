// Loot cache: the chest of the station, seen from above and in front (three-quarter view). A box with a
// lid in two halves: `closed`, a status light blinks on its lock; `open`, the halves split down the
// middle and slide apart over the sides, and a beam of light stands in the gap with a small glinting
// prize in it; `empty`, the halves stay apart over a dark inside. Three builds: a footed cache, a
// round-cornered pod and a wide ribbed locker with handles. Box and lid are solids from engine/solids.js;
// everything that is light goes on after the outline. Same timing as treasure-chest.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp } from '../engine/motion.js';
import { tone, mix, INK } from '../engine/color.js';
import { Surface, rectIn, cropped } from '../engine/surface.js';
import { PALETTE, swatches, swatchesBetween } from '../engine/palettes.js';
import { lamp, beam, steps, twinkle } from '../engine/fx.js';
import { insetIn, edgeIn, trimmedIn } from '../engine/shapes.js';
import { extrude, bandIn, wallFill, squircleIn } from '../engine/solids.js';

const P = PALETTE.derelict;
const W = 32, CX = 16, GROUND = 29;        // the lowest body row; its outline lands on the pivot row
const BLINK = [2, 1, 1, 0.5, 0, 0, 0, 0.5];   // closed: the status light, frame by frame (2 flares, 0 is dark)
// open, frame by frame. apart: px each half of the lid has slid, as a share of where it rests (1);
// lift: px the lid has jumped; wide: squash of the box; inside: what shows in the gap; beam: its height
// (1 = to the top of the frame); prize: the size of its glint
const OPEN = [
  { apart: 0, light: 1 },
  { apart: 0, wide: 1, light: 2 },                                               // squash: the lock flares
  { apart: 0.25, lift: 1, inside: 'white', light: 2 },                           // the lid jumps and cracks open
  { apart: 1.25, inside: 'white', beam: 1, hot: true, light: 2 },                // thrown past its rest: the flash
  { apart: 0.8, inside: 'glow', beam: 0.95, light: 1 },
  { apart: 1.05, inside: 'glow', beam: 0.85, prize: 2, light: 1 },               // the prize shows (the payout sound)
  { apart: 1, inside: 'glow', beam: 0.8, prize: 1, light: 1 },
  { apart: 1, inside: 'glow', beam: 0.75, prize: 0, light: 1 },                  // the open cache, glowing
];

// hw: half the width (the box is even, so the lid splits exactly in two); depth: rows of top face;
// h: rows of front face; lidH: rows of lid edge; rest: px each half slides to
function dims(p) {
  const wide = p.style === 'locker' ? 1 : 0;
  const hw = Math.min(10, Math.round(lerp(8, 10, p.size)) + wide);
  return {
    hw, depth: Math.round(hw * 0.62) - wide, h: Math.round(hw * 0.85) - wide,
    lidH: Math.round(lerp(2, 5, p.lid)), boxy: lerp(9, 2.6, p.lid),
    rest: Math.min(5, 13 - hw),
  };
}

// The rarity bars: where they are, as column tests (one pair either side of the lock, or two).
function bars(p, d) {
  const n = p.stripes === 'two' ? 2 : p.stripes === 'one' ? 1 : 0;
  return (px) => { const a = Math.abs(px - CX); for (let i = 0; i < n; i++) if (a >= 3 + i * 3 && a < 5 + i * 3) return true; return false; };
}

function chest(g, p, o) {
  const d = dims(p), wide = o.wide ?? 0, hw = d.hw + wide, h = d.h - wide, x0 = CX - hw, x1 = CX + hw;
  const yF = GROUND + 1 - h;                                       // the first row of the front face
  const cache = p.style === 'cache', pod = p.style === 'pod';
  const stripe = bars(p, d), on = (S, from, thick, a = -Infinity, b = Infinity) => bandIn(S, from, thick, { x0: a, x1: b });

  // ---- the box: its rim on top, its front face below ----
  const boxTop = pod ? squircleIn(CX, yF - d.depth / 2, hw, d.depth / 2, 4) : rectIn(x0, yF - d.depth, 2 * hw, d.depth);
  const S = extrude(g, boxTop, cache ? h - 1 : h, p.body, { lip: 1 });
  const R = S.ramps.wall, T = S.ramps.top;
  if (cache) { g.rect(x0, GROUND, 3, 1, R.dark); g.rect(x1 - 3, GROUND, 3, 1, R.dark); }                     // two feet
  if (pod) { wallFill(g, S, on(S, (h >> 1) - 1, 1), { light: T.light, base: R.light, dark: R.base }); wallFill(g, S, on(S, h >> 1, 1), R.dark, { flat: true }); }   // a belt round it
  if (p.style === 'locker') {
    for (let x = x0 + 2; x < x1 - 1; x += 3) wallFill(g, S, on(S, 1, h - 2, x, x + 1), R.dark, { flat: true });   // ribs
    for (const hx of [x0 - 1, x1]) g.rect(hx, yF + 1, 1, 3, R.light);                                          // a handle at each end
  }
  if (p.stripes !== 'none') wallFill(g, S, (px, py) => stripe(px) && on(S, 1, h - 2)(px, py), p.accent, { flat: true });
  // the lock: a dark plate with the status light in it (the light itself goes on after the outline)
  const lens = [CX - 1, yF + 2, 2, 2];
  wallFill(g, S, on(S, 1, 4, CX - 2, CX + 2), tone(R.dark, -0.5), { flat: true });
  // what shows in the mouth of the box once the lid is out of the way
  const inside = o.inside === 'white' ? '#ffffff' : o.inside === 'glow' ? mix(p.glow, '#ffffff', 0.55) : tone(R.dark, -0.5);
  const mouth = insetIn(S.top, 1);
  g.fill(x0, yF - d.depth, x1, yF, mouth, inside);
  if (o.inside === 'glow') g.fill(x0, yF - d.depth, x1, yF, edgeIn(mouth, 0, -1), p.glow);

  // ---- the lid, drawn whole on its own layer, then cut in two and slid apart ----
  const lidLayer = new Surface(W, W), lift = o.lift ?? 0, ly = yF - d.lidH - lift;                           // the row under the lid's top face
  const lidTop = squircleIn(CX, ly - d.depth / 2, hw, d.depth / 2, pod ? Math.min(d.boxy, 4) : d.boxy);
  const L = extrude(lidLayer, lidTop, d.lidH, p.body, { lip: 1 });
  if (d.lidH >= 4) lidLayer.ellipse(CX + hw * 0.5, ly - d.depth * 0.62, 2, 1, L.ramps.top.light);            // a domed lid shines
  if (p.stripes !== 'none') {
    wallFill(lidLayer, L, (px) => stripe(px), p.accent, { flat: true });
    const flat = trimmedIn(L.top, { top: 1, bottom: 1 });                                                      // the top face without its lit rim
    lidLayer.fill(x0, ly - d.depth, x1, ly, (px, py) => stripe(px) && flat(px, py), tone(p.accent, 0.5));
  }
  // the edge each half shows to the other: a dark seam while the lid is shut, a lit edge once they part
  const slide = Math.round((o.apart ?? 0) * d.rest);
  const inner = (px) => px >= CX - 1 && px < CX + 1, below = trimmedIn(L.top, { top: 1 });
  lidLayer.fill(CX - 1, ly - d.depth, CX + 1, ly, (px, py) => inner(px) && below(px, py), slide ? L.ramps.top.light : R.base);
  wallFill(lidLayer, L, (px) => inner(px), slide ? R.light : R.dark, { flat: true });
  g.blit(cropped(lidLayer, 0, 0, CX, W), -slide, 0).blit(cropped(lidLayer, CX, 0, W, W), slide, 0);
  return { d, yF, lens, slide, top: ly - d.depth };
}

export default defineSprite({
  id: 'tech-chest',
  name: 'Loot cache',
  kind: 'Item',
  blurb: 'A station loot cache whose lid splits and slides apart round a beam of light, then stands empty. Change its size, build, lid, rarity bars, light and colours.',
  meta: { type: 'prop', role: 'world/prop', themes: ['sci-fi', 'space'], gameTypes: ['roguelike-action', 'shooter'], view: 'top-down',
    words: ['chest', 'cache', 'loot', 'container', 'pod', 'locker', 'treasure', 'open', 'reward', 'credits', 'rarity', 'metal', 'tech'], license: 'draft' },
  size: [W, W],
  pivot: [CX, GROUND + 1],
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    style: choice('Style', 'cache', ['cache', 'pod', 'locker']),
    lid: range('Lid', 0.5, { lo: 'Flat', hi: 'Domed' }),
    stripes: choice('Rarity bars', 'one', ['none', 'one', 'two']),
    body: color('Body', P.hull, swatchesBetween('derelict', ['wall', 'outfit'], { lead: 'hull', max: 0.6 })),
    // the bars only exist when one or two are chosen
    accent: color('Bar colour', P.amber, swatchesBetween('derelict', ['accent', 'core', 'gem'], { lead: 'amber', min: 0.62 }), { when: { stripes: ['one', 'two'] } }),
    glow: color('Light', P.cyan, swatches('derelict', 'glow')),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    closed: { frames: 8, fps: (p) => 8 * lerp(0.65, 1.45, p.speed), loop: true },
    open: { frames: 8, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false },
    empty: { frames: 1, fps: 8, loop: true },
  },
  sounds: {
    open: [
      { sound: 'door-hiss', preset: 'Loot cache', frame: 0, volume: 0.8 },
      { sound: 'credit-pickup', preset: 'Big payout', frame: 5, volume: 0.7 },
    ],
  },

  render(g, { clip, frame, p }) {
    if (clip === 'empty') {
      const c = chest(g, p, { apart: 1, inside: 'dark' });
      g.outline(INK);
      lamp(g, ...c.lens, p.glow, 0);
      return;
    }
    if (clip === 'closed') {
      const c = chest(g, p, OPEN[0]);
      g.outline(INK);
      lamp(g, ...c.lens, p.glow, BLINK[frame]);
      return;
    }

    const o = OPEN[frame] ?? OPEN[7];
    const c = chest(g, p, o);
    g.outline(INK);
    lamp(g, ...c.lens, o.light === 2 ? '#ffffff' : p.glow, o.light);
    if (!o.beam) return;
    // the beam stands in the gap between the halves: white-hot on the flash, then the colour of the light
    const C = steps(p.glow), foot = c.yF - 1, tall = (foot - 2) * o.beam, wide = Math.max(2, 2 * c.slide - 2);
    beam(g, { x: CX, y: foot, w: wide, h: tall, phase: frame * 0.25, dash: 3, gap: 1, solid: o.hot ? 0.8 : 0.5, colours: o.hot ? ['#ffffff', '#ffffff', C[1], C[2]] : C });
    // the prize: a small bright chip that rises in the beam and glints
    if (o.prize !== undefined) {
      const py = Math.round(foot - tall * (0.45 + 0.08 * (2 - o.prize)));
      g.rect(CX - 1, py - 2, 2, 4, '#ffffff').rect(CX - 2, py - 1, 4, 2, '#ffffff');
      g.dot(CX - 2, py - 2, C[2]).dot(CX + 1, py + 1, C[2]);
      if (o.prize) twinkle(g, CX + 2, py - 3, o.prize, C[1]);
    }
  },
});
