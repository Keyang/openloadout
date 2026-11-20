// FROZEN COPY, not a sprite: sprites/crate.js as it was before P1 (2026-11-20), when crate was redrawn as data (sprites/crate.json)
// and the code file deleted. Kept only as the reference the port tests compare with (gen-b8-ports, data-sprite-v2-b8,
// ui-export) and as a stand-in code sprite for the loader tests (tests/helpers/data-sprites.mjs copies it into a scratch
// project's sprites/ with its imports put back to '../engine/'). Never edit it; the build never scans tests/.
// Breakable crate: a box, a barrel or a clay pot that rocks when hit and bursts into pieces.
// The whole container is drawn upright on its own layer; `hurt` leans that layer with tilt()
// (whole rows and columns slide, so nothing goes soft), and `break` splits it in two and then swaps
// it for boards and splinters from engine/fx.js that fall to the ground line.
import { defineSprite, range, choice, color, toggle } from '../../../engine/sprite.js';
import { lerp, clamp, PI } from '../../../engine/motion.js';
import { ramp, tone, pick, INK } from '../../../engine/color.js';
import { Surface, ellipseIn, rectIn, tilt, cropped } from '../../../engine/surface.js';
import { PALETTE, swatches } from '../../../engine/palettes.js';
import { chunks } from '../../../engine/fx.js';
import { drawMark } from '../../../engine/marks.js';

const P = PALETTE.thornwood;
const W = 32, CX = 16, GROUND = 29;       // the lowest body row; its outline lands on the pivot row

// Sizes shared by every style: S is the side of the crate; the barrel and the pot fit the same box.
function dims(p) {
  const S = Math.round(lerp(15, 23, p.size));
  const x0 = CX - Math.ceil(S / 2), y0 = GROUND + 1 - S;
  return { S, x0, y0, x1: x0 + S, cy: y0 + S / 2, mark: S >= 21 ? 9 : S >= 17 ? 7 : 5 };
}

// ---- the three containers, each drawn upright with its foot on the ground row -------------

function drawBox(g, p, d, grow = 0) {
  const wood = ramp(p.wood), metal = ramp(p.metal);
  const x = d.x0 - grow, y = d.y0 - 2 * grow, S = d.S + 2 * grow, b = S >= 19 ? 3 : 2;
  // the frame boards, then the sunken panel of three planks
  g.rect(x, y, S, S, wood, { shade: 2, light: 1 });
  const panel = { base: wood.dark, dark: wood.deep, light: wood.dark };
  g.rect(x + b, y + b, S - 2 * b, S - 2 * b, panel, { shade: 1 });
  const ih = S - 2 * b;
  for (const k of [1, 2]) g.rect(x + b, y + b + Math.round((ih * k) / 3), S - 2 * b, 1, wood.deep);
  // corner joints of the frame
  for (const [jx, jy] of [[x + b - 1, y + b - 1], [x + S - b, y + b - 1], [x + b - 1, y + S - b], [x + S - b, y + S - b]]) g.dot(jx, jy, wood.dark);
  if (p.mark === 'none') {
    // no stamp: a brace board from corner to corner
    g.limb(x + b + 1, y + S - b - 1, x + S - b - 1, y + b + 1, 2, wood, { clip: rectIn(x + b, y + b, S - 2 * b, S - 2 * b) });
  }
  if (p.bands) {
    // metal straps along the top and bottom boards, with rivets
    for (const sy of [y, y + S - b]) {
      g.rect(x, sy, S, b, metal, { light: 1 });
      for (let rx = x + 2; rx < x + S - 1; rx += 4) g.dot(rx, sy + (b >> 1), metal.dark);
    }
  }
  return { mx: x + (S >> 1), my: y + (S >> 1), on: wood.dark };
}

function drawBarrel(g, p, d, grow = 0) {
  const wood = ramp(p.wood), metal = ramp(p.metal);
  const H = d.S + 2 * grow, top = GROUND + 1 - H, half = (d.S * 0.42 + grow), cy = top + H / 2;
  const widthAt = (py) => half * (0.8 + 0.2 * Math.cos((PI * (py - cy)) / H));          // staves bulge in the middle
  const body = (px, py) => py >= top && py < top + H && Math.abs(px - CX) <= widthAt(py);
  g.fill(CX - half - 1, top, CX + half + 1, top + H, body, wood, { shade: 2, light: 1 });
  // seams between the staves follow the bulge
  for (let y = top + 1; y < top + H - 1; y++) for (const k of [-0.45, 0.2]) g.dot(Math.floor(CX + widthAt(y + 0.5) * k), y, wood.dark);
  g.rect(CX - half + 2, top, 2 * half - 4, 1, wood.light, { clip: body });                // the rim of the lid
  // two hoops: metal when banded, plain dark lines when not
  for (const k of [0.22, 0.78]) {
    const hy = Math.round(top + H * k) - 1;
    if (p.bands) g.fill(CX - half - 1, hy, CX + half + 1, hy + 2, (px, py) => py >= hy && py < hy + 2 && body(px, py), metal, { light: 1, shade: 1 });
    else g.fill(CX - half - 1, hy, CX + half + 1, hy + 1, (px, py) => py >= hy && py < hy + 1 && body(px, py), wood.dark);
  }
  return { mx: CX, my: Math.round(cy), on: p.wood };
}

function drawPot(g, p, d, grow = 0) {
  const clay = ramp(p.wood), metal = ramp(p.metal);
  const H = d.S + 2 * grow, top = GROUND + 1 - H, rx = d.S * 0.46 + grow, ry = H * 0.36;
  const by = GROUND + 1 - ry - 1;                                                          // the belly's centre
  const neck = Math.round(d.S * 0.24), lip = Math.round(d.S * 0.33), foot = Math.round(d.S * 0.26);
  const body = [ellipseIn(CX, by, rx, ry), rectIn(CX - neck, top + 2, 2 * neck, by - top), rectIn(CX - lip, top, 2 * lip, 2), rectIn(CX - foot, GROUND - 1, 2 * foot, 2)];
  g.blob(body, clay, { shade: 2, light: 1 });
  g.rect(CX - lip + 1, top, 2 * lip - 2, 1, clay.light);                                   // the lit lip
  g.rect(CX - neck + 1, top + 2, 2 * neck - 2, 1, clay.dark);                              // the shadow under it
  const inBody = (px, py) => body.some((f) => f(px, py));
  const ring = (y, h, paint, opt) => g.fill(CX - rx - 1, y, CX + rx + 1, y + h, (px, py) => py >= y && py < y + h && inBody(px, py), paint, opt);
  const shoulder = Math.round(by - ry * 0.62);
  if (p.bands) { ring(top + 3, 2, metal, { light: 1 }); ring(Math.round(by + ry * 0.55), 2, metal, { light: 1, shade: 1 }); }
  else { ring(shoulder, 1, clay.dark); ring(Math.round(by + ry * 0.6), 1, clay.dark); }
  return { mx: CX, my: Math.round(by) - (p.bands ? 1 : 0), on: p.wood };
}

const DRAW = { crate: drawBox, barrel: drawBarrel, pot: drawPot };

// The whole container on its own layer, stamp included, not yet outlined.
function container(p, d, grow = 0) {
  const s = new Surface(W, W);
  const at = DRAW[p.style](s, p, d, grow);
  if (p.mark !== 'none') drawMark(s, p.mark, at.mx, at.my, d.mark, pick(at.on, P.cream, tone(p.wood, -2.2)));
  return s;
}

export default defineSprite({
  id: 'crate',
  name: 'Breakable crate',
  kind: 'Item',
  blurb: 'A crate, barrel or clay pot that rocks when hit and smashes into pieces. Change its size, stamp, metal bands and colours.',
  meta: { type: 'prop', role: 'world/prop', themes: ['fantasy', 'forest'], gameTypes: ['platformer'], view: 'side',
    words: ['crate', 'box', 'barrel', 'pot', 'vase', 'container', 'break', 'smash', 'destroy', 'hit', 'loot', 'wooden', 'obstacle'], license: 'draft' },
  size: [W, W],
  pivot: [CX, GROUND + 1],
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    style: choice('Style', 'crate', ['crate', 'barrel', 'pot']),
    bands: toggle('Metal bands', true),
    mark: choice('Stamp', 'none', ['none', 'leaf', 'skull', 'star']),
    pieces: range('Pieces', 0.5, { lo: 'Few', hi: 'Many' }),
    wood: color('Wood', P.wood, swatches('thornwood', 'wood')),
    metal: color('Metal', P.steel, swatches('thornwood', 'metal'), { when: { bands: [true] } }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 1, fps: 8, loop: true },
    hurt: { frames: 4, fps: (p) => 9 * lerp(0.65, 1.45, p.speed), loop: false },
    break: { frames: 8, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false },
  },
  sounds: {
    hurt: [{ sound: 'punch', preset: 'Light jab', frame: 0, volume: 0.9 }],
    break: [{ sound: 'crate-break', preset: 'Crate', frame: 0, volume: 0.8 }],
  },

  render(g, { clip, t, frame, p }) {
    const d = dims(p);

    if (clip === 'idle') { g.blit(container(p, d)); g.outline(INK); return; }

    if (clip === 'hurt') {
      // knocked to the right, rocks back past upright, settles: each lean turns on the corner it leans over
      const lean = [0.15, -0.1, 0.05, 0][frame] ?? 0;
      const body = container(p, d);
      g.blit(lean ? tilt(body, lean > 0 ? d.x1 - 1 : d.x0, GROUND + 1, lean) : body);
      if (frame === 0) g.tint('#ffffff');
      g.outline(INK);
      return;
    }

    // break: a white, swollen flash, then the pieces fly up and out, fall and break up where they land
    if (frame === 0) {
      g.blit(container(p, d, 1));
      g.tint('#ffffff');
      g.outline(INK);
      return;
    }
    if (frame === 1) {
      // it splits down the middle: the two halves fall apart, each turning on its outer foot
      const whole = container(p, d);
      for (const side of [-1, 1]) {
        const half = side < 0 ? cropped(whole, 0, 0, CX, W) : cropped(whole, CX, 0, W, W);
        g.blit(tilt(half, side < 0 ? d.x0 : d.x1 - 1, GROUND + 1, side * Math.min(0.17, (d.x0 - 2.5) / d.S)));
      }
      g.outline(INK);
      return;
    }
    const k = clamp((frame - 1.8) / 5.2);                      // the pieces: just off on frame 2, all at rest on the last frame
    const held = k >= 1;                                       // the frame a game holds: what is left lies on the ground
    const many = Math.round(lerp(3, 8, p.pieces));
    const box = [1, 1, W - 1, GROUND + 1], solid = [2, 2, W - 2, GROUND + 1];   // pieces that get the ink line keep 1 px more
    const far = lerp(9, 12, p.size);
    // splinters, small and light, with no ink round them: thin slivers that spin away and come down flat on the ground
    chunks(g, { t: k, x: CX, y: d.cy, count: many + 1, seed: 11, dist: far + 3, rise: lerp(9, 14, p.size), size: 2.6, thick: 1, spread: d.S * 0.3, spin: 1.5, floor: GROUND, land: 0.88, shrink: 0.1, colour: tone(p.wood, 0.7), box });
    // the big pieces lie over them, on their own layer so the ink line goes round the pieces only
    const pile = new Surface(W, W);
    // boards for a crate, long staves for a barrel, sherds for a pot: where each one lands it stays, and on the held frame a shorter, thinner bit of it is left
    if (p.style === 'pot') {
      const n = Math.ceil((many + 3) / 3);
      for (const [i, dx, dy] of [[0, -4, 1], [1, 4, 1], [2, 0, -4]]) chunks(pile, { t: k, x: CX + dx * d.S / 19, y: d.cy + dy, count: n, seed: 4 + i, dist: far - 2, rise: lerp(6, 10, p.size), size: lerp(5, 7.5, p.size), thick: held ? 3 : 2, spread: 2, spin: 0.8, floor: GROUND, land: 0.95, shrink: held ? 0.5 : 0.25, colour: p.wood, box: solid });
    } else {
      chunks(pile, { t: k, x: CX, y: d.cy, count: many, seed: 2, dist: far, rise: lerp(8, 12, p.size), size: d.S * (p.style === 'barrel' ? 0.55 : 0.46), thick: held || p.style === 'crate' ? 3 : 2, spread: d.S * 0.42, spin: 0.5, floor: GROUND, land: 0.95, shrink: held ? 0.6 : 0.3, colour: p.wood, box: solid });
    }
    if (p.bands) chunks(pile, { t: k, x: CX, y: d.cy - 2, count: 2, seed: 7, dist: far * 0.8, rise: 10, size: d.S * 0.34, thick: 2, spread: d.S * 0.3, floor: GROUND, land: 0.8, shrink: held ? 0.55 : 0.3, colour: p.metal, box: solid });
    // crumbs that depend on no setting
    if (k > 0.6) for (const [dx, w] of [[-7, 2], [1, 3], [7, 2]]) pile.rect(CX + dx, GROUND, w, 1, tone(p.wood, -0.4));
    pile.outline(INK);
    g.blit(pile);
  },
});
