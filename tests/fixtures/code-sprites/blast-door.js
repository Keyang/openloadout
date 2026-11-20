// FROZEN COPY, not a sprite: sprites/blast-door.js as it was on 2026-11-20 (migration batch P5), before the migration redraws it as
// data (docs/data-sprites.md section 7). Kept only for the tests about the framework its code uses (tests/helpers/library.mjs
// codeSprite, codeSpriteSource); imports point at ../../../. Never edit it; the build never scans tests/.
// Blast door: the heavy door of the Derelict Station, two tiles wide, standing in a wall's face on a top-down map
// (seen from the south). It stands on the two doorway cells of sprites/tiles-station-walls.js, its feet on the
// wall's base line, its head above the wall. A dark frame (two posts and a lintel with a top face) holds the leaves:
//   closed   shut, the status light in the Light colour
//   open     the light goes from red to the Light colour and flares, the leaves jolt, then draw back into the frame
//            with a hiss of vapour; the last frame is the open doorway. The doorway is SEE-THROUGH, so the floor
//            behind shows and a character sorted behind the door is seen walking through it; only the stubs of the
//            leaves stay in view
//   locked   shut, a clamp across the seam, every light blinking red
// Three doors share the frame (doorLeaves in engine/bulkhead.js moves their leaves): two halves with teeth that
// lock (split), four blades that meet in the middle (iris), a slatted curtain that rolls up (shutter). The shut
// door is drawn once on a spare Surface; each leaf is that picture's part, moved and cut to the doorway.
import { defineSprite, range, choice, color, toggle } from '../../../engine/sprite.js';
import { Surface, masked } from '../../../engine/surface.js';
import { lerp } from '../../../engine/motion.js';
import { brightness, INK } from '../../../engine/color.js';
import { PALETTE, swatches } from '../../../engine/palettes.js';
import { drawBolt } from '../../../engine/plating.js';
import { lamp, puffs } from '../../../engine/fx.js';
import { DOOR_STYLES, doorLeaves, shadeTo, machineTones, hazardBand } from '../../../engine/bulkhead.js';

const D = PALETTE.derelict;
const W = 64, H = 48, CX = 32, GROUND = 45;        // the lowest body row; its outline lands on the pivot row
const X0 = 2, FW = 60, TOP = 3, HEAD = 9, POST = 6;    // the frame: first column, width, first row of its top face and of its front
const HX = X0 + POST, HY = 14, HW = FW - 2 * POST, HH = GROUND - HY + 1;   // the doorway: 48 by 32, so a Ranger (30 px) walks under the lintel
// the same steels as the walls; the frame is drawn darker than the leaves whatever the two are
const BODIES = [D.hull, D.panel, D.steel, D.deck, D.nebula, D.membrane];
const FRAMES = [D.plate, D.deck, D.hull, D.nebula, D.membrane];
// open, frame by frame: how far the leaves have drawn back (1 = at rest, open; it overshoots), the status light
// (its level, and whether it is still red), and how far the vapour has got (0 to 1; none when left out)
const OPEN = [
  { k: 0, red: true, light: 1 },
  { k: 0, light: 2 },                          // the light changes and flares
  { k: 0.06, light: 2, steam: 0 },             // the leaves jolt: a crack
  { k: 0.32, light: 1, steam: 0.3 },
  { k: 0.7, light: 1, steam: 0.6 },
  { k: 1.06, light: 1, steam: 0.85 },          // thrown into the frame
  { k: 0.95, light: 1, steam: 1 },
  { k: 1, light: 1 },                          // the open doorway
];
const BLINK = [1, 2, 2, 1, 0.5, 0, 0, 0.5];    // locked: the lights, frame by frame (2 flares, 0 is dark)

// The tones of the leaves, and of the frame: the Frame colour taken darker than the leaves, whatever the two are.
function tones(p) {
  const B = machineTones(p.body), F = machineTones(shadeTo(p.hull, Math.max(0.16, Math.min(brightness(p.hull), brightness(p.body) - 0.15))));
  return { body: B.base, lit: B.lit, soft: B.soft, seam: B.seam, frame: F.base, ftop: F.soft, flit: F.lit, fseam: F.seam };
}
// the iris draws right back (a stub of its lower blade would lie in the walkway); the others leave their edges in view
const leavesOf = (p, k) => doorLeaves(p.style, HX, HY, HW, HH, k, { teeth: 2, pitch: 16, stub: p.style === 'iris' ? 0 : 2 });

// The door, shut, on a Surface of its own: only the doorway is drawn.
function shutDoor(p, T) {
  const s = new Surface(W, H), leaves = leavesOf(p, 0);
  const which = (x, y) => leaves.findIndex((l) => l.rest(x + 0.5, y + 0.5));
  s.rect(HX, HY, HW, HH, T.body);
  if (p.style === 'split') {
    // level seams across each half, each with a lit lip, and a grip let into each half beside the middle
    const n = Math.round(lerp(1, 4, p.pieces));
    for (let i = 1; i <= n; i++) { const y = HY + Math.round((i * HH) / (n + 1)) - 1; s.rect(HX, y, HW, 1, T.seam); s.rect(HX, y + 1, HW, 1, T.soft); }
    for (const x of [CX - 8, CX + 6]) { s.rect(x, HY + 10, 2, 5, T.seam); s.rect(x - 1, HY + 10, 1, 5, T.soft); }
  } else if (p.style === 'iris') {
    // ridges across each blade, square to the way it moves: level on the upper and lower blades, upright on the two at the sides
    const n = Math.round(lerp(1, 3, p.pieces));
    for (let y = HY; y < HY + HH; y++) for (let x = HX; x < HX + HW; x++) {
      const name = leaves[which(x, y)].name;
      const d = name === 'top' ? y - HY : name === 'bottom' ? GROUND - y : name === 'left' ? x - HX : HX + HW - 1 - x;
      const pitch = name === 'top' || name === 'bottom' ? 4 : 6;
      if (d % pitch === pitch - 1 && Math.floor(d / pitch) < n) s.dot(x, y, T.seam);
      else if (d % pitch === 0 && d > 0 && Math.floor(d / pitch) <= n) s.dot(x, y, T.soft);
    }
  } else {
    // slats, each lit along its top, and a heavy rail along the foot with a bar to lift it by
    const n = Math.round(lerp(4, 8, p.pieces));
    for (let i = 0; i < n; i++) { const y = HY + Math.round((i * (HH - 3)) / n); s.rect(HX, y, HW, 1, T.lit); if (i) s.rect(HX, y - 1, HW, 1, T.seam); }
    s.rect(HX, GROUND - 2, HW, 3, T.frame); s.rect(HX, GROUND - 3, HW, 1, T.seam);
    s.rect(CX - 5, GROUND - 1, 10, 1, T.flit);
  }
  if (p.stripes) {
    // warning paint across the foot of the door; it rides whichever leaf it is on
    hazardBand(s, HX, GROUND - (p.style === 'shutter' ? 9 : 6), HW, 5, { dark: T.fseam, paint: p.accent, pitch: 8 });
  }
  // where two leaves meet: the edge that faces the light (right, up) is lit, the one that faces away is dark
  for (let y = HY; y < HY + HH; y++) for (let x = HX; x < HX + HW; x++) {
    const me = which(x, y);
    if (x + 1 < HX + HW && which(x + 1, y) !== me) { s.dot(x, y, T.lit); s.dot(x + 1, y, INK); }
    if (y + 1 < HY + HH && which(x, y + 1) !== me) { s.dot(x, y, INK); s.dot(x, y + 1, T.lit); }
  }
  return s;
}

// The frame: a top face, lit along its edges, over a lintel and two posts.
function drawFrame(g, T) {
  g.rect(X0, TOP, FW, HEAD - TOP, T.ftop);
  g.rect(X0, TOP, FW, 1, T.flit); g.rect(X0, HEAD - 1, FW, 1, T.flit); g.rect(X0 + FW - 1, TOP, 1, HEAD - TOP, T.flit);
  g.rect(X0, HEAD, FW, HY - HEAD, T.frame);
  for (const x of [X0, X0 + FW - POST]) {
    g.rect(x, HY, POST, HH, T.frame);
    g.rect(x + POST - 1, HEAD, 1, GROUND - HEAD + 1, T.ftop);                 // the edge that faces the light
    g.rect(x + 1, GROUND - 1, POST - 2, 1, T.ftop);                           // a foot plate
    drawBolt(g, x + 2, HEAD + 1, { lit: T.flit, dark: T.fseam, face: T.ftop });
  }
  g.rect(HX, HY - 1, HW, 1, T.fseam);                                         // the slot the leaves run in
  g.rect(CX - 5, HEAD + 1, 10, 3, T.fseam);                                   // the housing of the status light
}

// A clamp across the middle of a locked door.
function drawClamp(g, T) {
  const y = HY + 9;
  g.rect(CX - 7, y, 14, 7, T.frame);
  g.rect(CX - 7, y, 14, 1, T.flit); g.rect(CX + 6, y, 1, 7, T.ftop);
  g.rect(CX - 7, y + 6, 14, 1, T.fseam);
  g.rect(CX - 3, y + 2, 6, 3, T.fseam);
  for (const x of [CX - 6, CX + 4]) drawBolt(g, x, y + 2, { lit: T.flit, dark: T.fseam, face: T.ftop });
}

export default defineSprite({
  id: 'blast-door',
  name: 'Blast door',
  kind: 'Item',
  blurb: 'A heavy station door two tiles wide whose leaves draw back into the frame with a hiss, or stay clamped shut with red lights blinking. Make it split, iris or shutter, and change its seams, warning stripes, lights and colours.',
  meta: {
    type: 'prop',
    role: 'world/door',
    themes: ['sci-fi', 'space'],
    gameTypes: ['roguelike-action', 'shooter'],
    view: 'top-down',
    words: ['door', 'gate', 'airlock', 'bulkhead', 'hatch', 'entrance', 'exit', 'open', 'locked', 'slide', 'room cleared', 'metal', 'heavy'],
    license: 'draft',
  },
  size: [W, H],
  pivot: [CX, GROUND + 1],
  params: {
    style: choice('Style', 'split', DOOR_STYLES.map((value) => ({ value, label: { split: 'Split', iris: 'Iris', shutter: 'Shutter' }[value] }))),
    pieces: range('Panels', 0.5, { lo: 'Few', hi: 'Many' }),
    stripes: toggle('Hazard stripes', true),
    body: color('Door', D.hull, BODIES, { material: 'metal' }),
    accent: color('Stripes', D.amber, swatches('derelict', 'accent', { lead: 'amber' }), { when: { stripes: [true] }, material: 'warning' }),
    glow: color('Light', D.teal, swatches('derelict', 'glow', { lead: 'teal' }).filter((c) => c !== D.red)),
    hull: color('Frame', D.plate, FRAMES),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    closed: { frames: 1, fps: 8, loop: true },
    open: { frames: 8, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false },
    locked: { frames: 8, fps: (p) => 8 * lerp(0.65, 1.45, p.speed), loop: true },
  },
  sounds: {
    open: [{ sound: 'door-hiss', preset: 'Blast door', frame: 0, volume: 0.8 }],
  },

  render(g, { clip, frame, p }) {
    const T = tones(p), o = clip === 'open' ? OPEN[frame] ?? OPEN[7] : { k: 0, light: clip === 'locked' ? BLINK[frame % 8] : 1, red: clip === 'locked' };
    drawFrame(g, T);
    // the leaves: the shut door's parts, each moved to where it has got to and cut to the doorway
    const shut = shutDoor(p, T);
    for (const leaf of leavesOf(p, o.k)) {
      const moved = new Surface(W, H).blit(masked(shut, leaf.rest), leaf.dx, leaf.dy);
      g.blit(masked(moved, leaf.seen));
    }
    if (clip === 'locked') drawClamp(g, T);
    g.outline(INK);

    // light and vapour go on after the outline
    const colour = o.red ? D.red : p.glow;
    lamp(g, CX - 3, HEAD + 2, 6, 1, colour, o.light);
    for (const x of [X0 + 2, X0 + FW - POST + 2]) lamp(g, x, HY + 6, 2, 2, colour, o.light);
    if (clip === 'locked') lamp(g, CX - 2, HY + 12, 4, 1, D.red, o.light);
    if (o.steam !== undefined) {
      for (const [x, side] of [[HX + 3, 1], [HX + HW - 4, -1]]) {
        puffs(g, { t: o.steam, x, y: GROUND - 2, count: 3, seed: 5 + side, angle: side * 1.1, arc: 0.7, dist: 7, rise: 9, size: 2.4, lobes: 2, floor: GROUND + 1, colours: [D.suit, D.steel, D.panel], box: [HX, HY + 6, HX + HW, GROUND + 1] });
      }
    }
  },
});
