// Dungeon door: a door set in a wall's face on a top-down map, seen from the south. One tile wide and one and a
// half tall, so it stands on the wall's base line and its head overlaps the wall's cap. The stone frame goes from a
// flat lintel to a round arch (the Arch slider). The leaf is drawn once, shut, on a spare Surface with everything
// that is fixed to it (bands, studs, a lock plate, a barred window) and is then shown through the doorway:
//   closed   the resting state
//   open     the leaf jolts, then slides up into the wall; its foot stays in view under the lintel, like a raised gate
//   locked   the leaf is heaved up 2 px and drops back twice; the lock flashes white on the first frame
//   sealed   shut, with a rune seal turning slowly over it (runeSeal in engine/dungeon.js); it is light, so it goes on
//            after the outline
// Three builds share the frame: planks with two bands, a leaf framed and crossed in metal, and a carved slab. The
// slab is stone, so it takes the Stone colour (cracked and chipped, not grained) and only a tint of the Door colour.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { Surface, masked, rectIn } from '../engine/surface.js';
import { lerp, pulse } from '../engine/motion.js';
import { ramp, tone, mix, INK } from '../engine/color.js';
import { PALETTE, swatchesBetween, swatches } from '../engine/palettes.js';
import { archIn, insetIn } from '../engine/shapes.js';
import { archStones } from '../engine/buildings.js';
import { steps, puffs } from '../engine/fx.js';
import { runeSeal } from '../engine/dungeon.js';
import { crack } from '../engine/rock.js';
import { drawPlateMark } from '../engine/plating.js';

const HV = PALETTE.hearthvale;
const W = 32, H = 48, CX = 16, GROUND = 45;       // the lowest body row; its outline lands on the pivot row
const JAMB = 4, HEAD = 5, TOP = 4;                // the stone frame's sides and top in px, and its first row
const OX = 6, LW = 20, OY = TOP + HEAD, FOOT = GROUND - 1;   // the doorway: first column, width, first row, last row
const OPEN = [0, 0.06, 0.34, 0.72, 1.05, 1];      // open, frame by frame: how far the leaf has gone up (1 = at rest, raised)
const HEAVE = [2, 0, 1, 0];                       // locked, frame by frame: px the leaf is lifted
const STAY = 5;                                   // rows of the raised leaf's foot that stay in view under the lintel
const WHITE = { light: '#ffffff', base: '#ffffff', dark: '#ffffff' };

// Where everything is, from the Arch slider. hole: the doorway; frame: the outside of the stone round it.
function dims(p) {
  const ry = Math.round(lerp(0, 9, p.corner)), spring = OY + ry;
  const hole = archIn(OX, OX + LW, OY, spring, FOOT + 1), frame = archIn(OX, OX + LW, OY, spring, FOOT + 1, JAMB, HEAD);
  return { ry, spring, hole, frame, winY: spring + (ry ? -Math.round(ry * 0.3) : 3), lockY: FOOT - 14 };
}

// ---- the stone frame, standing on its threshold -------------------------------------------------------------
function drawFrame(g, D, p) {
  // a step lighter than the wall it stands in (the wall's bricks are the same stone), with joints a step darker
  const stone = ramp(p.stone), face = { light: stone.light, base: mix(p.stone, stone.light, 0.45), dark: p.stone }, joint = stone.dark;
  g.blob([D.frame, rectIn(OX - JAMB, GROUND, LW + 2 * JAMB, 1)], face, { shade: 2, light: 1 });
  g.rect(OX - JAMB + 1, GROUND, LW + 2 * JAMB - 2, 1, stone.light);                             // the worn top of the threshold
  for (let y = D.spring + 4, i = 0; y < FOOT - 2; y += 7, i++) { g.rect(OX - JAMB + 1, y + (i % 2 ? 0 : 3), JAMB - 1, 1, joint); g.rect(OX + LW, y + (i % 2 ? 3 : 0), JAMB - 1, 1, joint); }
  if (D.ry >= 3) archStones(g, CX, D.spring, LW / 2, D.ry, { depth: HEAD, every: 6, colour: joint, keystone: stone.light, clip: D.frame });
  else {
    for (const x of [OX + 3, CX - 3, CX + 2, OX + LW - 4]) g.rect(x, TOP + 1, 1, HEAD - 1 + D.ry, joint, { clip: (px, py) => D.frame(px, py) && !D.hole(px, py) });
    g.rect(CX - 2, TOP, 4, HEAD - 1, stone.light, { clip: D.frame });                            // a keystone in the lintel
  }
}

// The leaf's colour. Wood and the iron-bound leaf are the Door colour. A slab is cut from the frame's own stone:
// it keeps the stone's plain tone, a step darker than the frame it stands back in, and takes a fifth of its
// colour from the Door control, enough to tell one slab from another and never enough to stop it being stone.
const SLAB_TINT = 0.2;
const leafColour = (p) => (p.style === 'stone' ? mix(p.stone, p.body, SLAB_TINT) : p.body);

// ---- the leaf, shut, with everything that is fixed to it ----------------------------------------------------
// flash: its lock is white this frame. lock: false leaves the lock plate off (the seal lies where it is).
function drawLeaf(s, D, p, { flash = false, lock: locked = true } = {}) {
  const body = ramp(leafColour(p)), metal = ramp(p.metal), hole = D.hole, clip = { clip: hole };
  const dark = mix(body.dark, INK, 0.5), lh = FOOT - OY + 1;
  const bandY = [D.winY + 9, FOOT - 6];                                                          // the two bands across the leaf
  const band = (y, h = 3) => { s.rect(OX, y, LW, h, metal, { light: 1, clip: hole }); s.rect(OX, y + h, LW, 1, dark, clip); for (let x = OX + 2; x < OX + LW - 1; x += 4) s.rect(x, y + 1, 1, 1, metal.dark, clip); };
  s.fill(OX, OY, OX + LW, FOOT + 1, hole, body.base);
  if (p.style === 'wood') {
    // planks: every other one a little paler, a seam between each pair, a short line of grain on each
    const pale = mix(body.base, body.light, 0.35);
    for (let i = 0; i < 4; i++) {
      if (i % 2) s.rect(OX + i * 5, OY, 5, lh, pale, clip);
      if (i) s.rect(OX + i * 5, OY, 1, lh, body.dark, clip);
      s.rect(OX + i * 5 + 2 + (i % 2), OY + Math.round(lh * (0.5 + 0.12 * ((i * 7) % 3))), 1, 4, body.dark, clip);
    }
    for (const y of bandY) band(y);
  } else if (p.style === 'iron') {
    // a metal frame all round the leaf, an upright down its middle and a band across it, riveted where they meet
    s.fill(OX, OY, OX + LW, FOOT + 1, (px, py) => hole(px, py) && !insetIn(hole, 2)(px, py), metal, { light: 1 });
    s.fill(OX, OY, OX + LW, FOOT + 1, (px, py) => insetIn(hole, 2)(px, py) && !insetIn(hole, 3)(px, py), dark);
    s.rect(CX - 1, OY, 2, lh, metal.base, clip); s.rect(CX - 2, OY + 2, 1, lh - 4, dark, clip); s.rect(CX + 1, OY + 2, 1, lh - 4, dark, clip);
    band(bandY[0]); band(bandY[1], 2);
    for (const y of [bandY[0] + 1, bandY[1]]) for (const x of [OX + 1, CX - 1, OX + LW - 2]) s.rect(x, y, 1, 1, metal.light, clip);
  } else {
    // a slab: lit along its top and right, a sunk panel cut into it, and a thin band of metal top and bottom
    s.fill(OX, OY, OX + LW, FOOT + 1, hole, body, { shade: 2, light: 1 });
    const panel = (px, py) => insetIn(hole, 3)(px, py) && py >= bandY[0] + 5 && py < bandY[1] - 2;
    s.fill(OX, OY, OX + LW, FOOT + 1, panel, body.dark);
    s.fill(OX, OY, OX + LW, FOOT + 1, (px, py) => panel(px, py) && panel(px + 1, py) && panel(px, py - 1), mix(body.base, body.dark, 0.5));
    band(bandY[0], 2); band(bandY[1], 2);
    // what tells stone from a painted board: a hairline crack down from the head, and chisel chips where the mason slipped
    crack(s, OX + 5, OY + 1, 0.35, bandY[0] - OY - 2, body.dark, { seed: 4, clip: hole, jag: 0.5, branch: false });
    for (const [x, y] of [[OX + 12, bandY[0] - 6], [OX + 4, bandY[1] - 7]]) drawPlateMark(s, 'pit', x, y, y > bandY[0] ? dark : body.dark);
  }
  s.fill(OX, OY, OX + LW, D.spring + 2, (px, py) => hole(px, py) && !hole(px, py - 1), dark);   // the frame's shadow along the top
  if (p.bars) {
    // a barred window: dark, in a rim of the leaf's own dark, with three bars
    const wx = CX - 5, wy = D.winY, wh = 6;
    s.rect(wx - 1, wy - 1, 12, wh + 2, body.dark, clip);
    s.rect(wx, wy, 10, wh, mix(HV.slate, INK, 0.7), clip);
    for (const x of [wx + 2, wx + 5, wx + 8]) { s.rect(x, wy, 1, wh, metal.base, clip); s.rect(x, wy, 1, 1, metal.light, clip); }
  }
  // the lock: a plate on the leaf's right, where it latches, with a keyhole
  const lock = flash ? WHITE : metal, lx = OX + LW - 7, ly = D.lockY;
  if (locked) s.rect(lx, ly, 5, 6, lock, { light: 1, outline: INK });
  if (locked && !flash) { s.rect(lx + 1, ly + 1, 3, 2, dark); s.rect(lx + 2, ly + 3, 1, 2, dark); }       // the keyhole
  s.rect(OX, FOOT - 1, LW, 2, metal, { light: 1, clip: hole });                                  // an iron shoe along the foot: it is what stays in view when the door is up
  s.rect(OX, FOOT - 2, LW, 1, dark, clip);
}

function pose(clip, frame) {
  const travel = FOOT - OY + 1 - STAY;
  const up = clip === 'open' ? Math.round((OPEN[frame] ?? 1) * travel) : clip === 'locked' ? HEAVE[frame] ?? 0 : 0;
  return { up, flash: clip === 'locked' && frame === 0 };
}

export default defineSprite({
  id: 'dungeon-door',
  name: 'Dungeon door',
  kind: 'Item',
  blurb: 'A door in a dungeon wall that slides up into the stone, heaves against its lock, or is held by a turning rune seal. Make it wooden, iron-bound or a stone slab, square or arched, with a barred window, and change its colours.',
  meta: {
    type: 'prop',
    role: 'world/door',
    themes: ['fantasy', 'dungeon'],
    gameTypes: ['turn-based-rpg', 'top-down-rpg'],
    view: 'top-down',
    words: ['door', 'gate', 'doorway', 'entrance', 'exit', 'open', 'locked', 'sealed', 'seal', 'rune', 'key', 'stone', 'boss room', 'crypt'],
    license: 'draft',
  },
  size: [W, H],
  pivot: [CX, GROUND + 1],
  params: {
    style: choice('Style', 'wood', [{ value: 'wood', label: 'Wood' }, { value: 'iron', label: 'Iron-bound' }, { value: 'stone', label: 'Stone slab' }]),
    corner: range('Arch', 0.6, { lo: 'Square', hi: 'Round top' }),
    bars: toggle('Barred window', false),
    // the leaf keeps to darker colours and its fittings to light ones, so no pair of swatches merges them (a slab,
    // four parts Stone to one part Door, stays under the darkest Metal too)
    body: color('Door', HV.wood, swatchesBetween('hearthvale', ['wood', 'outfit'], { lead: 'wood', max: 0.52 }), { material: 'wood' }),
    metal: color('Metal', HV.steel, swatchesBetween('hearthvale', 'metal', { min: 0.6 })),
    stone: color('Stone', HV.slate, swatchesBetween('hearthvale', 'stone', { lead: 'slate', max: 0.6 })),
    glow: color('Seal', HV.mage, swatches('hearthvale', 'glow', { lead: 'mage' })),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    closed: { frames: 1, fps: 8, loop: true },
    open: { frames: 6, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false },
    locked: { frames: 4, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false },
    sealed: { frames: 8, fps: (p) => 8 * lerp(0.65, 1.45, p.speed), loop: true },
  },
  sounds: {
    open: [{ sound: 'stone-door', preset: 'Dungeon door', frame: 0, volume: 0.8 }],
    locked: [{ sound: 'error-buzz', preset: 'Soft no', frame: 0, volume: 0.6 }],
  },

  render(g, { clip, frame, t, p }) {
    const D = dims(p), { up, flash } = pose(clip, frame);
    const dark = mix(HV.slate, INK, 0.7);                                                        // the dark of the doorway
    drawFrame(g, D, p);
    // the doorway: dark, with a strip of floor inside the threshold; its rim is the frame's inner line
    g.fill(OX - 1, OY - 1, OX + LW + 1, FOOT + 1, D.hole, dark, { outline: INK, clip: (px, py) => py < FOOT + 1 });
    for (let i = 0; i < 3; i++) g.rect(OX + 1 + i, FOOT - i, LW - 2 - 2 * i, 1, tone(dark, 1.2 - 0.35 * i));
    // the leaf, shut, then shown through the doorway as far up as it has gone
    const leaf = new Surface(W, H);
    drawLeaf(leaf, D, p, { flash, lock: clip !== 'sealed' });
    g.blit(masked(leaf, (px, py) => D.hole(px, py - up)), 0, -up);
    if (up > 0 && up < FOOT - OY) g.rect(OX, FOOT - up + 1, LW, 1, INK, { clip: D.hole });       // the line under its foot
    g.outline(INK);

    // light and dust go on after the outline
    if (clip === 'open' && frame >= 1 && frame <= 3) {
      const grit = ramp(p.stone);
      for (const [x, side] of [[OX + 1, -1], [OX + LW - 2, 1]]) puffs(g, { t: (frame - 1) / 3, x, y: FOOT, count: 2, seed: 3 + side, angle: side * 1.2, arc: 0.5, dist: 3, rise: 3, size: 1.6, floor: GROUND, colours: [grit.light, tone(p.stone, 0.4), grit.dark], box: [1, 20, W - 1, GROUND + 1] });
    }
    if (clip === 'sealed') {
      const C = steps(p.glow), beat = pulse(t * 2);
      runeSeal(g, CX + 0.5, Math.round((D.spring + FOOT) / 2) + 0.5, 9, t / 3, C, { marks: 6, heat: beat, box: [1, 1, W - 1, GROUND] });   // a third of a turn per loop: six marks of two kinds, so the loop closes
    }
  },
});
