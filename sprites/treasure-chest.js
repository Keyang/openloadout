// Treasure chest, seen from the front: a banded box whose lid swings up and back. Closed, the
// lid sits on the box and a glint slides along its metal edge; open, the lid stands behind the
// box showing its dark inside, with the mouth of the box (lit, or dark when emptied) between
// them and treasure heaped up over the front edge. Light goes on after the outline.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, PI } from '../engine/motion.js';
import { ramp, tone, mix, INK } from '../engine/color.js';
import { ellipseIn } from '../engine/surface.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { rays, steps, twinkle } from '../engine/fx.js';
import { insetIn, clippedIn } from '../engine/shapes.js';
import { squircleIn } from '../engine/solids.js';

const P = PALETTE.thornwood;
const W = 32, CX = 16, GROUND = 29;       // the lowest body row; its outline lands on the pivot row
// open, frame by frame. lift: px the shut lid is raised; open: how far the lid stands up (1 = at rest);
// wide / tall: squash and stretch of the box; inside: what shows in its mouth; beam: how far the rays reach
const OPEN = [
  { lift: 0, open: 0, wide: 0, tall: 0 },
  { lift: 0, open: 0, wide: 1, tall: -1 },                                   // squash
  { lift: 3, open: 0, wide: -1, tall: 1, inside: 'white' },                  // the lid jumps, light leaks out
  { open: 1.25, wide: 0, tall: 0, inside: 'white', beam: 1.3 },              // thrown past its rest: the flash
  { open: 0.88, inside: 'glow', beam: 1.15 },
  { open: 1.05, inside: 'glow', beam: 1 },
  { open: 1, inside: 'glow', beam: 0.9 },
  { open: 1, inside: 'glow', beam: 0.8 },                                    // the open chest, glowing
];

function dims(p) {
  const hw = Math.round(lerp(8, 12, p.size));                                // half the width of the box
  return {
    hw, BH: Math.round(lerp(8, 11, p.size)),
    LH: Math.max(3, Math.round(lerp(4, 8, p.lid) * lerp(0.85, 1.1, p.size))),
    feet: p.style === 'royal' ? 2 : 0,
    boxy: lerp(7, 2.3, p.lid),                                               // how square the lid's shoulders are
  };
}

function chest(g, p, o) {
  const D = dims(p), wood = ramp(p.wood), metal = ramp(p.metal), gold = ramp(P.gold);
  const wide = o.wide ?? 0, tall = o.tall ?? 0;
  const x0 = CX - D.hw - wide, bw = 2 * (D.hw + wide), x1 = x0 + bw;
  const BH = D.BH + tall, bottom = GROUND - D.feet, top = bottom + 1 - BH;
  const hole = tone(p.metal, -1.9);
  const glowing = o.inside === 'glow' || o.inside === 'white';
  let lidTop = top;

  if (o.open) {
    // ---- the lid, standing up behind the box: its metal edge and its inside ----
    const room = top - 3 - 2;                                                // rows left above the mouth, keeping the border
    const h = Math.min(room, Math.round((D.LH + 2) * o.open));
    lidTop = top - 3 - h;
    const yb = top - 3;                                                      // the lid stands on this row: the upper half of a rounded box
    const lid = clippedIn(squircleIn(CX, yb - 0.5, D.hw + wide, h, D.boxy), -Infinity, yb - h, Infinity, yb);
    const lining = glowing ? mix(tone(p.wood, -1.1), p.glow, 0.3) : tone(p.wood, -1.3);
    g.fill(x0, top - 3 - h, x1, top - 3, lid, metal, { light: 1 });
    g.fill(x0, top - 3 - h, x1, top - 3, insetIn(lid, p.style === 'wooden' ? 1 : 2), { base: lining, dark: tone(lining, -0.8), light: lining }, { shade: 1 });
    // ---- the mouth of the box ----
    const inside = o.inside === 'white' ? '#ffffff' : o.inside === 'glow' ? mix(p.glow, '#ffffff', 0.6) : tone(p.wood, -2.3);
    g.rect(x0 + 1, top - 3, bw - 2, 3, inside);
    if (o.inside === 'glow') g.rect(x0 + 1, top - 3, bw - 2, 1, p.glow);
    if (p.gems && glowing) {
      // coins heaped over the front edge, with two gems on top
      const r = D.hw - 3;
      g.blob([ellipseIn(CX, top - 1, r, 3.6), ellipseIn(CX - r * 0.45, top - 1.5, r * 0.5, 3.4), ellipseIn(CX + r * 0.5, top - 1, r * 0.45, 2.6)], gold, { light: 1 });
      for (const [dx, dy] of [[-3, -2], [1, -3], [4, -1], [-1, -1]]) g.rect(CX + dx, top + dy, 2, 1, gold.dark);
      const gx = Math.round(CX - r * 0.55);
      g.poly([[gx, top - 6.5], [gx + 2.5, top - 4], [gx, top - 1.5], [gx - 2.5, top - 4]], P.magic);
      g.rect(gx, top - 5, 1, 1, '#ffffff');
      g.rect(Math.round(CX + r * 0.45), top - 4, 2, 2, P.crimson);
    }
  } else if (o.lift) {
    g.rect(x0 + 1, top - o.lift, bw - 2, o.lift, o.inside === 'white' ? '#ffffff' : tone(p.wood, -2.3));   // the gap under a lid that has jumped
  }

  // ---- the box ----
  g.rect(x0, top, bw, BH, wood, { shade: 2 });
  for (const k of BH >= 10 ? [1 / 3, 2 / 3] : [1 / 2]) g.rect(x0, top + Math.round(BH * k), bw, 1, wood.dark);
  const straps = [x0 + 2, x1 - 4];
  if (p.style === 'wooden') {
    for (const sx of straps) g.rect(sx, top, 2, BH, metal, { light: 1 });
  } else if (p.style === 'iron') {
    // iron all round the edge, riveted, standing on a wider foot
    g.rect(x0, top, 2, BH, metal).rect(x1 - 2, top, 2, BH, metal, { light: 1 }).rect(x0, top, bw, 1, metal.light);
    g.rect(x0 - 1, bottom - 1, bw + 2, 2, metal, { shade: 1 });
    for (const rx of [x0, x1 - 1]) for (const ry of [top + 2, bottom - 3]) g.dot(rx + (rx === x0 ? 1 : -1), ry, metal.dark);
  } else {
    // royal: a fine gold edge, heavy corners and two feet
    g.rect(x0, top, bw, 1, metal.light).rect(x0, bottom, bw, 1, metal.dark);
    for (const cxr of [x0, x1 - 3]) { g.rect(cxr, top, 3, 3, metal, { light: 1 }); g.rect(cxr, bottom - 2, 3, 3, metal, { shade: 1 }); }
    g.rect(x0 + 1, bottom + 1, 3, D.feet, metal, { shade: 1 }).rect(x1 - 4, bottom + 1, 3, D.feet, metal, { shade: 1 });
  }

  // ---- the shut lid ----
  let lockTop = top;
  if (!o.open) {
    const yb = top - (o.lift ?? 0), h = D.LH, half = D.hw + wide + 1;
    const lid = clippedIn(squircleIn(CX, yb - 0.5, half, h, D.boxy), -Infinity, yb - h, Infinity, yb);   // the upper half of a rounded box, `h` px tall, its bottom row yb - 1
    const box = [x0 - 1, yb - h, x1 + 1, yb];
    if (p.style === 'wooden') {
      g.fill(...box, lid, wood, { shade: 1, light: 1 });
      for (const sx of straps) g.fill(sx, yb - h, sx + 2, yb, clippedIn(lid, sx, -Infinity, sx + 2, Infinity), metal, { light: 1 });
    } else {
      g.fill(...box, lid, metal, { shade: 1, light: 1 });
      g.fill(...box, insetIn(lid, p.style === 'iron' ? 2 : 1), wood, { shade: 0 });
      if (p.style === 'iron') g.fill(CX - 1, yb - h, CX + 1, yb, clippedIn(lid, CX - 1, -Infinity, CX + 1, Infinity), metal, { light: 1 });
    }
    if (h >= 6 && p.style !== 'iron') g.fill(...box, clippedIn(insetIn(lid, 2), -Infinity, yb - (h >> 1) - 1, Infinity, yb - (h >> 1)), wood.dark);
    g.fill(x0 - 1, yb - 1, x1 + 1, yb, clippedIn(lid, -Infinity, yb - 1, Infinity, Infinity), metal, { light: 1 });   // the metal edge the glint runs along
    if (p.style === 'royal') g.rect(CX - 2, yb - h - 1, 4, 1, metal).rect(CX - 1, yb - h - 2, 2, 1, metal.light);   // a small crest
    lockTop = yb - 2;
  }

  // ---- the lock: a plate over the join, with a keyhole (royal: a red stone) ----
  const lockH = top + 3 - lockTop + 1;
  g.rect(CX - 2, lockTop, 4, lockH, metal, { light: 1, outline: p.style === 'iron' ? INK : undefined });
  if (p.style === 'royal') g.rect(CX - 1, top + 1, 2, 2, P.crimson);
  else g.rect(CX - 1, top + 1, 2, 2, hole);
  return { x0, x1, top, D, lockY: lockTop, lidTop };
}

export default defineSprite({
  id: 'treasure-chest',
  name: 'Treasure chest',
  kind: 'Item',
  blurb: 'A banded chest that bursts open with rays of light, then stands empty. Change its size, style, lid, treasure, light and colours.',
  meta: { type: 'prop', role: 'world/prop', themes: ['fantasy', 'forest'], gameTypes: ['platformer'], view: 'side',
    words: ['chest', 'treasure', 'loot', 'box', 'trunk', 'open', 'reward', 'gold', 'coins', 'gems', 'secret', 'wooden', 'lock'], license: 'draft' },
  size: [W, W],
  pivot: [CX, GROUND + 1],
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    style: choice('Style', 'wooden', ['wooden', 'iron', 'royal']),
    lid: range('Lid', 0.6, { lo: 'Flat', hi: 'Domed' }),
    gems: toggle('Treasure', true),
    wood: color('Wood', P.wood, swatches('thornwood', 'wood')),
    metal: color('Metal', P.gold, swatches('thornwood', 'metal', { lead: 'gold' })),
    glow: color('Light', P.gold, swatches('thornwood', 'glow', { lead: 'gold' })),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    closed: { frames: 8, fps: (p) => 8 * lerp(0.65, 1.45, p.speed), loop: true },
    open: { frames: 8, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false },
    empty: { frames: 1, fps: 8, loop: true },
  },
  sounds: { open: [{ sound: 'chest-open', preset: 'Treasure chest', frame: 0, volume: 0.8 }] },

  render(g, { clip, frame, p }) {
    if (clip === 'empty') { chest(g, p, { open: 1, inside: 'dark' }); g.outline(INK); return; }

    if (clip === 'closed') {
      const c = chest(g, p, OPEN[0]);
      g.outline(INK);
      // a glint slides along the lid's metal edge from frame 3, and crosses the lock on frames 5 and 6
      if (frame >= 3) {
        const gx = Math.round(lerp(c.x0, c.x1 - 2, (frame - 3) / 4));
        g.rect(gx, c.top - 1, 2, 1, '#ffffff');
        if (frame === 5 || frame === 6) { g.rect(CX - 2 + (frame - 5) * 2, c.lockY, 2, 2, '#ffffff'); twinkle(g, CX - 2 + (frame - 5) * 3, c.lockY - 1, frame === 5 ? 1 : 2, tone(p.metal, 0.9)); }
      }
      return;
    }

    const o = OPEN[frame] ?? OPEN[7];
    const c = chest(g, p, o);
    g.outline(INK);
    if (!o.beam) return;
    // rays rise out of the box and show above the lid: white-hot on the flash, then the colour of the light
    const C = steps(p.glow);
    const from = c.top - 3 - c.lidTop + 2, reach = from + lerp(4, 7, p.size) * o.beam;
    rays(g, { x: CX, y: c.top - 3, count: 5, angle: PI, arc: PI * 0.5, r0: from, r1: reach, dash: 2, gap: frame === 3 ? 0 : 1, phase: frame * 0.34, seed: 2, colours: frame === 3 ? ['#ffffff', C[1]] : [C[1], C[2]], box: [1, 1, W - 1, c.lidTop - 1] });
    twinkle(g, c.x0 + 1, c.lidTop + 1 + (frame % 2), frame === 3 ? 2 : 1, C[1]);
    twinkle(g, c.x1 - 2, c.lidTop + 3 - (frame % 2), frame % 2 ? 1 : 0, C[1]);
  },
});
