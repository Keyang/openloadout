// Supply crate: a metal box to shoot open, seen from above and in front (three-quarter view): the lid
// on top, lit, and the front face below it with a hazard label. Three builds share one label and one
// pair of straps: a square crate, a round canister and a tall locker. Each is one solid from
// engine/solids.js (the shape of its top face dropped down the screen). `hurt` rocks it on its foot;
// `break` pops the lid, throws the four side panels out and leaves the floor plate and scraps.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, clamp, keys, smooth, easeOut, PI } from '../engine/motion.js';
import { tone, pick, INK } from '../engine/color.js';
import { Surface, ellipseIn, rectIn, tilt, cropped } from '../engine/surface.js';
import { PALETTE, swatchesBetween } from '../engine/palettes.js';
import { shards } from '../engine/fx.js';
import { fragments, drawFragment, hitWobble } from '../engine/breaking.js';
import { drawMark } from '../engine/marks.js';
import { insetIn, edgeIn } from '../engine/shapes.js';
import { extrude, bandIn, wallFill } from '../engine/solids.js';

const P = PALETTE.derelict;
const W = 32, CX = 16, GROUND = 29;       // the lowest body row; its outline lands on the pivot row

// hw: columns to each side of the centre column (the box is 2 * hw + 1 wide, so a label can sit dead centre);
// depth: rows of top face; h: rows of front face; mark: px across the picture on the label
function dims(p) {
  const half = Math.round(lerp(7, 11, p.size));
  const mark = half >= 9 ? 7 : 5;
  if (p.style === 'canister') { const hw = half - 1; return { hw, depth: 2 * Math.max(2, Math.round(hw * 0.36)), h: Math.round(half * 1.65), mark }; }
  if (p.style === 'locker') return { hw: half - 2, depth: Math.round(half * 0.55), h: Math.round(half * 1.9), mark };
  return { hw: half, depth: Math.round(half * 0.67), h: Math.round(half * 1.65), mark };
}

// The top face (also the lid, and the floor plate) of a build: centred on column CX, its far edge on row y.
// squash < 1 flattens it, as a lid looks while it tumbles.
function face(p, d, y, squash = 1, dx = 0) {
  const rows = Math.max(1, Math.round(d.depth * squash));
  if (p.style === 'canister') return ellipseIn(CX + 0.5 + dx, y + rows / 2, d.hw + 0.5, rows / 2);
  return rectIn(CX - d.hw + dx, y, 2 * d.hw + 1, rows);
}

const on = (S, from, thick, a = -Infinity, b = Infinity) => bandIn(S, from, thick, { x0: a, x1: b });

// The container without its outline. grow: px bigger all round (the flash before it bursts);
// open: the lid is off and the dark inside shows.
function container(p, d0, { grow = 0, open = false } = {}) {
  const g = new Surface(W, W);
  const d = { ...d0, hw: d0.hw + grow, h: d0.h + grow };
  const { hw, depth, h } = d, x0 = CX - hw, x1 = CX + hw + 1, y0 = GROUND + 1 - d0.h - depth - grow;
  const S = extrude(g, face(p, d, y0), h, p.body, { lip: 1 });
  const R = S.ramps.wall, sunk = tone(R.base, -0.4);
  const front = S.front(CX) + 1;            // the first row of the front face, in the middle
  let labelRow;                             // the drop at which the label starts

  if (p.style === 'crate') {
    // a frame of two pixels all round a sunken panel; a grip slot in the lid
    wallFill(g, S, on(S, 2, h - 4, x0 + 2, x1 - 2), sunk, { flat: true });
    wallFill(g, S, (px, py) => on(S, 2, 1, x0 + 2, x1 - 2)(px, py) || on(S, 2, h - 4, x0 + 2, x0 + 3)(px, py), R.dark, { flat: true });
    for (const rx of [x0, x1 - 1]) for (const dr of [0, h - 2]) g.dot(rx, front + dr, R.dark);                 // corner bolts
    if (!open) g.rect(CX - 2, y0 + (depth >> 1), 5, 1, R.base);
    labelRow = 2 + Math.max(0, (h - 4 - (d.mark + 2)) >> 1);
    if (p.mark === 'none') for (const dr of [0, 2, 4]) wallFill(g, S, on(S, (h >> 1) - 2 + dr, 1, CX - 3, CX + 4), R.dark, { flat: true });   // no label: three grooves
  } else if (p.style === 'canister') {
    // a drum: a raised rib under the lid and another above the foot, which follow its curve
    for (const from of [1, h - 4]) { wallFill(g, S, on(S, from, 1), R.light, { flat: true }); wallFill(g, S, on(S, from + 1, 1), R.dark, { flat: true }); }
    if (!open) g.rect(CX - 1, y0 + (depth >> 1) - 1, 3, 2, R.base);                                            // the cap in the lid
    labelRow = 3 + Math.max(0, (h - 7 - (d.mark + 2)) >> 1);
  } else {
    // a locker: a door with its own dark edge, three vent slits and a handle
    const door = (px, py) => on(S, 1, h - 3, x0 + 2, x1 - 2)(px, py);
    wallFill(g, S, door, sunk, { flat: true });
    wallFill(g, S, (px, py) => on(S, 1, 1, x0 + 2, x1 - 2)(px, py) || on(S, 1, h - 3, x0 + 2, x0 + 3)(px, py), R.dark, { flat: true });
    for (const dr of [3, 5]) wallFill(g, S, on(S, dr, 1, x0 + 4, x1 - 4), R.dark, { flat: true });
    wallFill(g, S, on(S, 7, 3, x1 - 4, x1 - 3), R.light, { flat: true });
    if (!open) g.rect(CX - 2, y0 + (depth >> 1), 5, 1, R.base);
    labelRow = Math.min(h - 3 - (d.mark + 2), 7 + Math.max(0, (h - 10 - (d.mark + 2)) >> 1));
  }

  // the label: a plate of the accent colour with a dark picture on it, edged with the body's dark tone
  if (p.mark !== 'none') {
    const m = d.mark, lx = CX - ((m + 1) >> 1), plate = on(S, labelRow, m + 2, lx, lx + m + 2);
    wallFill(g, S, (px, py) => on(S, labelRow - 1, m + 4, lx - 1, lx + m + 3)(px, py) && !plate(px, py), R.dark, { flat: true });
    wallFill(g, S, plate, p.accent, { flat: true });
    drawMark(g, p.mark, CX, front + labelRow + ((m + 1) >> 1), m, pick(p.accent, P.plate, P.cream), { clip: plate });
  }

  // two straps over the lid and down the front, each with a buckle
  if (p.straps) {
    const strap = pick(R.base, P.steel, P.plate), off = Math.max(3, Math.round(hw * 0.62));
    for (const sx of [CX - off - 1, CX + off]) {
      const cols = (px) => px >= sx && px < sx + 2;
      wallFill(g, S, (px) => cols(px), { light: strap, base: strap, dark: R.dark });
      if (!open) g.fill(sx, y0, sx + 2, y0 + depth + 2, (px, py) => cols(px) && S.top(px, py), strap);
      wallFill(g, S, (px, py) => cols(px) && on(S, 0, 1)(px, py), R.dark, { flat: true });               // the buckle
    }
  }

  if (open) {
    // the lid is gone: the rim stays lit, the inside is dark
    const inner = insetIn(S.top, 1);
    g.fill(x0, y0, x1, y0 + depth + 1, inner, R.dark);
    g.fill(x0, y0, x1, y0 + depth + 1, edgeIn(inner, 0, -1), tone(R.dark, -0.8));
  }
  return g;
}

// The lid by itself, a slab two rows thick, with its far edge on row y.
function lid(g, p, d, y, squash, dx) {
  extrude(g, face(p, d, y, squash, dx), squash < 0.5 ? 1 : 2, p.body, { lip: 1, shade: 0 });
}

export default defineSprite({
  id: 'supply-crate',
  name: 'Supply crate',
  kind: 'Item',
  blurb: 'A metal crate, canister or locker that rocks when shot and bursts open. Change its size, straps, hazard label, the number of scraps and its colours.',
  meta: { type: 'prop', role: 'world/prop', themes: ['sci-fi', 'space'], gameTypes: ['roguelike-action', 'shooter'], view: 'top-down',
    words: ['crate', 'box', 'container', 'canister', 'locker', 'supplies', 'cargo', 'break', 'shoot', 'destroy', 'loot', 'metal', 'obstacle', 'cover'], license: 'draft' },
  size: [W, W],
  pivot: [CX, GROUND + 1],
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    style: choice('Style', 'crate', ['crate', 'canister', 'locker']),
    straps: toggle('Straps', true),
    mark: choice('Label', 'bolt', ['none', 'cross', 'bolt', 'skull']),
    pieces: range('Pieces', 0.5, { lo: 'Few', hi: 'Many' }),
    body: color('Body', P.hull, swatchesBetween('derelict', ['wall', 'outfit'], { lead: 'hull', max: 0.6 })),
    // the label only exists when a picture is chosen for it
    accent: color('Label colour', P.amber, swatchesBetween('derelict', ['accent', 'core', 'gem'], { lead: 'amber', min: 0.62 }), { when: { mark: ['cross', 'bolt', 'skull'] } }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 1, fps: 8, loop: true },
    hurt: { frames: 4, fps: (p) => 9 * lerp(0.65, 1.45, p.speed), loop: false },
    break: { frames: 8, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false },
  },
  sounds: {
    hurt: [{ sound: 'bolt-impact', preset: 'On metal', frame: 0, volume: 0.9 }],
    break: [{ sound: 'shield-break', preset: 'Small crack', frame: 0, volume: 0.8 }],
  },

  render(g, { clip, frame, p }) {
    const d = dims(p);

    if (clip === 'idle') { g.blit(container(p, d)); g.outline(INK); return; }

    if (clip === 'hurt') {
      // the hit: squashed and knocked a pixel to the right, then it springs up narrow, squashes a little and settles
      const [squash, shift] = hitWobble(frame);
      g.blit(container(p, { ...d, hw: d.hw + squash, h: d.h - squash }), shift, 0);
      if (frame === 0) g.tint('#ffffff');
      g.outline(INK);
      return;
    }

    // ---- break ----
    if (frame === 0) {                                       // a white, swollen flash
      g.blit(container(p, d, { grow: 1 }));
      g.tint('#ffffff');
      g.outline(INK);
      return;
    }
    const top = GROUND + 1 - d.h - d.depth;                  // the row of the lid's far edge while it is shut
    const plateY = GROUND - d.depth;                         // the floor plate's far edge: what stays where it stood
    const panels = fragments(container(p, d, { open: true }), 4, { seed: 5 });
    if (frame === 1) {
      // the lid jumps off and the box cracks into its four panels
      for (const f of panels) drawFragment(g, f, Math.sign(f.x - CX - 0.5), 0, { cut: true });
      lid(g, p, d, Math.max(2, top - 5), 0.85, 0);
      g.outline(INK);
      return;
    }
    const k = clamp((frame - 1.7) / 5.3);                    // the pieces: just off on frame 2, at rest on the last frame
    const box = [1, 1, W - 1, GROUND + 1], cy = GROUND - d.h * 0.5;
    // the lid goes straight up, turning over, and comes down behind where the box stood
    const ly = keys(k, [[0, top - 7], [0.25, top - 9], [0.6, plateY - 5], [1, plateY - 5]]);
    const flat = k >= 0.6 ? 0.6 : [0.6, 0.25, 0.7][frame - 2] ?? 0.5;
    const lidNow = () => lid(g, p, d, clamp(Math.round(ly), 2, GROUND - 4), flat, Math.round(lerp(0, Math.min(3, 12 - d.hw), k)));
    if (k >= 0.6) lidNow();
    // what stays where it stood: the floor of the box as a shallow tray, its walls torn off
    const tray = extrude(g, face(p, d, plateY - 1), 2, p.body, { lip: 1, shade: 0 });
    g.fill(CX - d.hw, plateY - 1, CX + d.hw + 1, GROUND, insetIn(tray.top, 1), tray.ramps.wall.dark);
    if (k < 0.6) lidNow();
    // the four panels are thrown outward, the far pair over the top, shrinking to scraps that lie round the plate
    for (const f of panels) {
      const side = f.x < CX + 0.5 ? -1 : 1, far = f.y < cy;
      const tx = CX + 0.5 + side * (d.hw + (far ? 1 : 3)), ty = far ? plateY - 3 : GROUND - 1;
      const dx = Math.round((tx - f.x) * easeOut(k)), dy = Math.round((ty - f.y) * k - (far ? 5 : 3) * Math.sin(PI * k));
      const keep = lerp(f.r, 1.6, smooth(k * 1.4));
      const piece = new Surface(W, W);
      drawFragment(piece, f, clamp(dx, 2 - f.x0, W - 3 - f.x1), clamp(dy, 2 - f.y0, GROUND - f.y1), { keep, box: [2, 2, W - 2, GROUND + 1] });
      const turned = k < 0.9 ? tilt(piece, f.x + dx, f.y + dy, side * 0.28 * Math.sin(PI * k)) : piece;
      g.blit(cropped(turned, 2, 2, W - 2, GROUND + 1));         // a turned piece stays in the frame
    }
    g.outline(INK);
    // scraps and sparks are small and light: no ink round them
    shards(g, { t: k, x: CX, y: cy, count: Math.round(lerp(3, 10, p.pieces)), seed: 11, dist: 12, gravity: GROUND - cy + 2, size: 3, arc: PI * 1.6, colour: tone(p.body, 0.85), box });
  },
});
