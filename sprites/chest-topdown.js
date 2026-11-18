// Chest (top-down): the treasure chest of sprites/treasure-chest.js as seen on the map, from above and in front
// (three-quarter view). Closed, the lid's top takes the upper part and the front face with the lock the rest, and a
// glint slides along the lid's metal edge; open, the lid is thrown back and stands behind the box showing its dark
// inside, the mouth of the box lies open on top (lit, or dark when emptied) with treasure heaped in it, and rays
// rise out of it. Same controls, colours and timing as the side-view chest. Box and lid are solids from
// engine/solids.js; light goes on after the outline.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, PI } from '../engine/motion.js';
import { ramp, tone, mix, INK } from '../engine/color.js';
import { ellipseIn, rectIn } from '../engine/surface.js';
import { PALETTE, swatches, swatchesBetween } from '../engine/palettes.js';
import { rays, steps, twinkle } from '../engine/fx.js';
import { insetIn, clippedIn, trimmedIn } from '../engine/shapes.js';
import { squircleIn, extrude, bandIn, wallFill, faceRamps } from '../engine/solids.js';

const HV = PALETTE.hearthvale;
const W = 32, CX = 16, GROUND = 29;       // the lowest body row; its outline lands on the pivot row
// open, frame by frame (the side-view chest's timing). lift: px the shut lid is raised; open: how far the lid stands
// up (1 = at rest); wide / tall: squash and stretch of the box; inside: what shows in its mouth; beam: how far the rays reach
const OPEN = [
  { lift: 0, open: 0, wide: 0, tall: 0 },
  { lift: 0, open: 0, wide: 1, tall: -1 },                                   // squash
  { lift: 3, open: 0, wide: -1, tall: 1, inside: 'white' },                  // the lid jumps, light leaks out
  { open: 1.25, wide: 0, tall: 0, inside: 'white', beam: 1.3 },              // thrown past its rest: the flash
  { open: 0.85, inside: 'glow', beam: 1.15 },
  { open: 1.08, inside: 'glow', beam: 1 },
  { open: 1, inside: 'glow', beam: 0.9 },
  { open: 1, inside: 'glow', beam: 0.8 },                                    // the open chest, glowing
];

// hw: half the width; depth: rows of top face; h: rows of front face; lidH: rows of the lid's front edge;
// boxy: how square the lid's corners are, seen from above
function dims(p) {
  return {
    hw: Math.round(lerp(8, 11, p.size)), depth: Math.round(lerp(5, 7, p.size)), h: Math.round(lerp(6, 8, p.size)),
    lidH: Math.round(lerp(2, 5, p.lid)), boxy: lerp(9, 3, p.lid), feet: p.style === 'royal' ? 1 : 0,
  };
}

function chest(g, p, o) {
  const D = dims(p), wood = ramp(p.wood), metal = ramp(p.metal), gold = ramp(HV.gold);
  const hw = D.hw + (o.wide ?? 0), h = D.h + (o.tall ?? 0) - D.feet, x0 = CX - hw, x1 = CX + hw, bw = 2 * hw;
  const bottom = GROUND - D.feet, yF = bottom + 1 - h, yB = yF - D.depth;   // the last and first row of the front face; the box's back edge
  const hole = tone(p.wood, -2.3), glowing = o.inside === 'glow' || o.inside === 'white';
  const strap = (px) => (px >= x0 + 2 && px < x0 + 4) || (px >= x1 - 4 && px < x1 - 2);
  const wooden = p.style === 'wooden', iron = p.style === 'iron';
  // the wood of a face that looks up: a little lighter than the front, but well short of the metal on it
  const lit = faceRamps(p.wood, mix(p.wood, wood.light, 0.3)).top;
  let lidTop = yB, edgeY = yF - 1, lockTop = yF;

  if (o.open) {
    // ---- the lid, thrown back: it stands on the box's back edge and shows its metal rim and its inside ----
    const lh = Math.min(yB - 2, Math.round((D.depth + D.lidH) * 0.85 * o.open));
    lidTop = yB - lh;
    const lid = clippedIn(squircleIn(CX, yB - 0.5, hw, lh, D.boxy), -Infinity, lidTop, Infinity, yB);
    const lining = glowing ? mix(tone(p.wood, -1.1), p.glow, 0.3) : tone(p.wood, -1.3);
    g.fill(x0, lidTop, x1, yB, lid, metal, { light: 1 });
    g.fill(x0, lidTop, x1, yB, insetIn(lid, wooden ? 1 : 2), lining);
  }

  // ---- the box: its front face, and on top either the shut lid or its open mouth ----
  const S = extrude(g, rectIn(x0, yB, bw, D.depth), h, p.wood, { shade: 2 });
  const R = S.ramps.wall, on = (from, thick, a = -Infinity, b = Infinity) => bandIn(S, from, thick, { x0: a, x1: b });
  for (const k of h >= 7 ? [1 / 3, 2 / 3] : [1 / 2]) wallFill(g, S, on(Math.round(h * k), 1), R.dark, { flat: true });   // the boards
  if (wooden) wallFill(g, S, (px) => strap(px), p.metal);
  else if (iron) {
    // iron all round the front, riveted, standing on a wider foot
    wallFill(g, S, (px, py) => px < x0 + 2 || px >= x1 - 2 || on(0, 1)(px, py), p.metal);
    g.rect(x0 - 1, bottom - 1, bw + 2, 2, metal, { shade: 1 });
    for (const rx of [x0, x1 - 1]) for (const ry of [yF + 2, bottom - 3]) g.dot(rx + (rx === x0 ? 1 : -1), ry, metal.dark);
  } else {
    // royal: a fine gold edge, heavy corners and two feet
    wallFill(g, S, on(0, 1), metal.light, { flat: true }); wallFill(g, S, on(h - 1, 1), metal.dark, { flat: true });
    for (const cx of [x0, x1 - 3]) { g.rect(cx, yF, 3, 3, metal, { light: 1 }); g.rect(cx, bottom - 2, 3, 3, metal, { shade: 1 }); }
    g.rect(x0 + 1, bottom + 1, 3, D.feet, metal, { shade: 1 }).rect(x1 - 4, bottom + 1, 3, D.feet, metal, { shade: 1 });
  }

  if (o.open) {
    // the mouth: the inside of the box seen from above, inside its rim
    const mouth = insetIn(S.top, 1);
    const inside = o.inside === 'white' ? '#ffffff' : o.inside === 'glow' ? mix(p.glow, '#ffffff', 0.6) : hole;
    g.fill(x0, yB, x1, yF, mouth, inside);
    if (o.inside === 'dark') g.fill(x0, yB, x1, yF, (px, py) => mouth(px, py) && !mouth(px, py + 1), tone(p.wood, -1.3));   // the far wall of the empty box
    if (p.gems && glowing) {
      // coins heaped in the mouth, with two gems on top
      const r = hw - 3, cy = yB + D.depth / 2;
      g.blob([ellipseIn(CX, cy, r, D.depth / 2 - 0.2), ellipseIn(CX - r * 0.4, cy - 1, r * 0.55, D.depth / 2), ellipseIn(CX + r * 0.5, cy - 0.5, r * 0.45, D.depth / 2 - 0.6)], gold, { light: 1 });
      for (const [dx, dy] of [[-3, 0], [1, -1], [4, 1], [-1, 1]]) g.rect(CX + dx, Math.round(cy) + dy, 2, 1, gold.dark);
      const gx = Math.round(CX - r * 0.5);
      g.poly([[gx, cy - 3.5], [gx + 2.5, cy - 1], [gx, cy + 1.5], [gx - 2.5, cy - 1]], HV.magic);
      g.rect(gx, Math.round(cy) - 2, 1, 1, '#ffffff');
      g.rect(Math.round(CX + r * 0.45), Math.round(cy) - 2, 2, 2, HV.crimson);
    }
  } else {
    // ---- the shut lid: a slab on the box; its top face is what the map shows most of ----
    const lift = o.lift ?? 0, ly = yF - D.lidH - lift;                        // the first row of the lid's front edge
    if (lift) g.rect(x0 + 1, yF - lift, bw - 2, lift, o.inside === 'white' ? '#ffffff' : hole);   // the gap under a lid that has jumped
    const top = squircleIn(CX, ly - D.depth / 2, hw, D.depth / 2, D.boxy);
    const L = extrude(g, top, D.lidH, wooden ? p.wood : p.metal, { topColour: wooden ? lit.base : undefined, shade: 1, box: [x0, ly - D.depth, x1, ly] });
    const T = L.ramps.top, lon = (from, thick) => bandIn(L, from, thick);
    if (wooden) {
      // boards along the lid, and the two straps carried over it and down its front
      g.fill(x0, ly - D.depth, x1, ly, (px, py) => L.top(px, py) && Math.floor(py) === ly - Math.ceil(D.depth / 2), T.dark);
      g.fill(x0, ly - D.depth, x1, ly, (px, py) => L.top(px, py) && strap(px), metal, { light: 1 });
      wallFill(g, L, (px) => strap(px), p.metal);
    } else {
      // a metal lid with a wooden panel let into its top (iron: a wide rim and a bar across; royal: a fine rim)
      const panel = insetIn(L.top, iron ? 2 : 1);
      g.fill(x0, ly - D.depth, x1, ly, panel, lit, { shade: 1 });
      if (iron) g.fill(CX - 1, ly - D.depth, CX + 1, ly, (px, py) => L.top(px, py), metal, { light: 1 });
      wallFill(g, L, insetIn((px, py) => L.wall(px, py), 1), p.wood);
    }
    // a domed lid catches the light along its ridge
    if (D.lidH >= 4) g.fill(x0, ly - D.depth, x1, ly, (px, py) => trimmedIn(L.top, { left: 2, right: 2 })(px, py) && Math.floor(py) === ly - D.depth + 1 && !strap(px), T.light);
    wallFill(g, L, lon(D.lidH - 1, 1), metal.light, { flat: true });          // the metal edge the glint runs along
    if (p.style === 'royal') g.rect(CX - 2, ly - D.depth - 1, 4, 1, metal).rect(CX - 1, ly - D.depth - 2, 2, 1, metal.light);   // a small crest
    lidTop = ly - D.depth; edgeY = yF - 1 - lift; lockTop = yF - 2 - lift;
  }

  // ---- the lock: a plate over the join, with a keyhole (royal: a red stone) ----
  g.rect(CX - 2, lockTop, 4, yF + 3 - lockTop + 1, metal, { light: 1, outline: iron ? INK : undefined });
  g.rect(CX - 1, yF + 1, 2, 2, p.style === 'royal' ? HV.crimson : hole);
  return { x0, x1, yF, yB, lidTop, edgeY, lockY: lockTop };
}

export default defineSprite({
  id: 'chest-topdown',
  name: 'Chest (top-down)',
  kind: 'Item',
  blurb: 'A banded chest for a top-down map that bursts open with rays of light, then stands empty. Change its size, style, lid, treasure, light and colours.',
  meta: { type: 'prop', role: 'world/prop', themes: ['fantasy'], gameTypes: ['turn-based-rpg', 'top-down-rpg'], view: 'top-down',
    words: ['chest', 'treasure', 'loot', 'box', 'trunk', 'open', 'reward', 'gold', 'coins', 'gems', 'secret', 'wooden', 'lock'], license: 'draft' },
  size: [W, W],
  pivot: [CX, GROUND + 1],
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    style: choice('Style', 'wooden', ['wooden', 'iron', 'royal']),
    lid: range('Lid', 0.6, { lo: 'Flat', hi: 'Domed' }),
    gems: toggle('Treasure', true),
    // the box keeps to darker colours and its fittings to light ones, so no pair of swatches merges them
    wood: color('Wood', HV.wood, swatchesBetween('hearthvale', ['wood', 'outfit'], { lead: 'wood', max: 0.52 })),
    metal: color('Metal', HV.gold, swatchesBetween('hearthvale', 'metal', { lead: 'gold', min: 0.62 })),
    glow: color('Light', HV.gold, swatches('hearthvale', 'glow', { lead: 'gold' })),
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
        g.rect(gx, c.edgeY, 2, 1, '#ffffff');
        if (frame === 5 || frame === 6) { g.rect(CX - 2 + (frame - 5) * 2, c.lockY, 2, 2, '#ffffff'); twinkle(g, CX - 2 + (frame - 5) * 3, c.lockY - 1, frame === 5 ? 1 : 2, tone(p.metal, 0.9)); }
      }
      return;
    }

    const o = OPEN[frame] ?? OPEN[7];
    const c = chest(g, p, o);
    g.outline(INK);
    if (!o.beam) return;
    // rays rise out of the mouth and show above the lid: white-hot on the flash, then the colour of the light
    const C = steps(p.glow);
    const reach = c.yB - c.lidTop + lerp(5, 8, p.size) * o.beam;
    rays(g, { x: CX, y: c.yB + 2, count: 5, angle: PI, arc: PI * 0.55, r0: c.yB - c.lidTop + 3, r1: reach + 3, dash: 2, gap: frame === 3 ? 0 : 1, phase: frame * 0.34, seed: 2, colours: frame === 3 ? ['#ffffff', C[1]] : [C[1], C[2]], box: [1, 1, W - 1, c.lidTop] });
    twinkle(g, c.x0 + 1, c.lidTop + 1 + (frame % 2), frame === 3 ? 2 : 1, C[1]);
    twinkle(g, c.x1 - 2, c.lidTop + 3 - (frame % 2), frame % 2 ? 1 : 0, C[1]);
  },
});
