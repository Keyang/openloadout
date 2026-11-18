// Wooden door: a plank door in a dressed stone frame, standing on a stone threshold, seen from the front.
// Three builds share one leaf: plain planks under a flat lintel, an arched door under a ring of arch stones,
// and an iron-bound door under a heavy lintel with a cornice. The leaf is drawn once, shut, on a spare Surface
// with everything that is fixed to it (hinge straps, studs, the ring handle, a barred window, a lock plate or
// a bolt); `open` then turns that picture on its hinge (swing in engine/surface.js), so the fittings ride the
// leaf, and what is fixed to the frame (hinge pins, a padlock on its staple, the bolt's keeper) stays put.
//   closed   the resting state
//   open     the handle side comes away, the leaf narrows to a sliver against the hinge and the dark doorway shows
//   locked   the leaf rattles 1 px each way against its lock, which flashes white on the first frame
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { Surface, swing, masked, rectIn } from '../engine/surface.js';
import { lerp } from '../engine/motion.js';
import { ramp, tone, mix, INK } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { ringIn, archIn } from '../engine/shapes.js';
import { archStones } from '../engine/buildings.js';

const P = PALETTE.thornwood;
const W = 48, H = 64, CX = 24, GROUND = 61;       // the lowest body row; its outline lands on the pivot row
const JAMB = 4, HEAD = 5, SILL = 2;               // the stone frame's sides and top, and the threshold, in px
const OPEN = [1, 0.9, 0.58, 0.28, 0.08, 0.14];    // open, frame by frame: the share of the leaf's width still seen (it overshoots, then settles)
const RATTLE = [1, -1, 1, 0];                     // locked, frame by frame: px the leaf is pushed sideways
const HOLE = mix(P.cavern, INK, 0.55);            // the dark of the doorway
const WHITE = { light: '#ffffff', base: '#ffffff', dark: '#ffffff' };

// Where everything is, from the Width and Height controls. Shared by render() and sockets().
// hole: the doorway, straight-sided under an arch or a flat top; frame: the outside of the stone frame round it.
function dims(p) {
  const w = 2 * Math.round(lerp(13, 19, p.width)), h = Math.round(lerp(40, 52, p.height));
  const x0 = CX - w / 2, top = GROUND - h + 1, ox = x0 + JAMB, lw = w - 2 * JAMB;
  const ry = p.style === 'arched' ? Math.round(lw * 0.38) : 0;                 // how high the arch rises over its springing line
  const oy = top + HEAD, spring = oy + ry, bottom = GROUND - SILL;
  const hole = archIn(ox, ox + lw, oy, spring, bottom + 1), frame = archIn(ox, ox + lw, oy, spring, bottom + 1, JAMB, HEAD);
  return { w, h, x0, x1: x0 + w - 1, top, ox, lw, ry, oy, spring, bottom, hole, frame, lockY: Math.round((spring + bottom) / 2) + 3 };
}

// ---- the lock: drawn from where it attaches and its own settings -----------------------------------------
// The part of each lock that is fixed to the leaf (it rides the leaf when the door opens).
function lockOnLeaf(s, D, o) {
  const x = D.ox + D.lw - 5, y = D.lockY, k = o.size;
  if (o.kind === 'keyhole') {
    // a lock plate with a keyhole
    const pw = Math.max(3, Math.round(5 * k)), ph = Math.max(5, Math.round(8 * k)), px = x - Math.floor(pw / 2), py = y - Math.floor(ph / 2);
    s.rect(px, py, pw, ph, o.metal, { light: 1, outline: INK });
    s.rect(x, py + Math.floor(ph / 2) - 1, 1, 3, HOLE); s.dot(x - (pw > 3 ? 1 : 0), py + Math.floor(ph / 2) - 1, HOLE);
  } else if (o.kind === 'bar') {
    // a bolt: a bar across the leaf in two iron guides; shot, its end sits in the keeper on the jamb
    const bh = Math.max(3, Math.round(4 * k)), by = y - Math.floor(bh / 2);
    const from = D.ox + 2, to = o.shot ? D.x1 - 1 : D.ox + D.lw - 2;
    s.rect(from, by, to - from + 1, bh, o.bar, { outline: INK });
    s.rect(from, by, to - from + 1, 1, o.bar.light);
    for (const gx of [D.ox + 4, D.ox + D.lw - 8]) s.rect(gx, by - 1, 3, bh + 2, o.metal, { light: 1, outline: INK });
  }
}
// The part that is fixed to the frame, drawn over the leaf: a padlock on its staple, the keeper of the bolt.
function lockOnFrame(g, D, o) {
  const jx = D.x1 - JAMB + 1, y = D.lockY, k = o.size;                       // the first column of the right jamb
  if (o.kind === 'padlock') {
    // a padlock hanging from a staple on the jamb; while the door is shut the hasp on the leaf is hooked over it
    const bw = Math.max(4, Math.round(6 * k)), bh = Math.max(4, Math.round(5 * k)), bx = jx + 1 - Math.floor(bw / 2), by = y + 5;
    if (o.shot) g.rect(jx - 6, y - 1, 8, 3, o.metal, { light: 1, outline: INK });
    g.fill(bx - 1, by - 5, bx + bw + 1, by, ringIn(bx + bw / 2, by, bw / 2 - 0.5, 1), o.metal.dark, { outline: INK, clip: (px, py) => py < by });      // the shackle
    g.rect(bx, by, bw, bh, o.metal, { light: 1, outline: INK });
    g.rect(bx + Math.floor((bw - 1) / 2), by + Math.floor(bh / 2) - 1, bw % 2 ? 1 : 2, 2, HOLE);
  } else if (o.kind === 'bar') {
    const bh = Math.max(3, Math.round(4 * k));
    g.rect(jx, y - Math.floor(bh / 2) - 1, 3, bh + 2, o.metal, { light: 1, outline: INK });
  }
}

// ---- the leaf, shut, with everything that is fixed to it ---------------------------------------------------
// far: the leaf has turned away from the light. flash: its lock (or, with no lock, its handle) is white this frame.
// shot: the bolt is across. edge: the first of the leaf's columns that will show as its free edge once it is turned.
function drawLeaf(s, D, p, { far = false, flash = false, shot = true, edge = null } = {}) {
  const wood = ramp(far ? tone(p.wood, -0.55) : p.wood), metal = ramp(far ? tone(p.metal, -0.5) : p.metal);
  const inside = D.hole, clip = { clip: inside };
  const { ox, lw, oy, bottom } = D, lh = bottom - oy + 1;
  s.fill(ox, oy, ox + lw, bottom + 1, inside, wood.base);
  // planks: every other one a little paler, a seam between each pair, and a short line of grain on each
  const n = Math.max(3, Math.round(lw / 5.2)), pale = mix(wood.base, wood.light, 0.35), at = (i) => ox + Math.round((i * lw) / n);
  for (let i = 0; i < n; i++) {
    if (i % 2) s.rect(at(i), oy, at(i + 1) - at(i), lh, pale, clip);
    if (i) s.rect(at(i), oy, 1, lh, wood.dark, clip);
    s.rect(at(i) + 2 + (i % 2), oy + Math.round(lh * (0.28 + 0.2 * ((i * 7) % 3))), 1, 4, wood.dark, clip);
  }
  s.rect(ox, oy, lw, 1, wood.dark, clip); s.rect(ox + lw - 1, oy, 1, lh, wood.dark, clip);        // the frame's shadow along the top and the right
  if (D.ry) s.fill(ox, oy, ox + lw, D.spring, (px, py) => inside(px, py) && !inside(px, py - 1), wood.dark);   // and under the arch
  const rows = [D.spring + Math.round((bottom - D.spring) * 0.14), D.spring + Math.round((bottom - D.spring) * 0.8)];
  if (p.style === 'iron-bound') {
    // three iron bands across the leaf, studded, and an iron kick plate
    for (const y of [rows[0] - 1, Math.round((rows[0] + rows[1]) / 2), rows[1]]) {
      s.rect(ox, y - 1, lw, 4, metal, { light: 1, clip: inside });
      s.rect(ox, y - 2, lw, 1, INK, clip); s.rect(ox, y + 3, lw, 1, INK, clip);
      for (let x = ox + 2; x < ox + lw - 1; x += 4) s.rect(x, y, 1, 2, metal.dark, clip);
    }
  } else {
    // two ledges nailed across the planks, and a strap hinge on each
    for (const y of rows) {
      s.rect(ox, y - 1, lw, 4, { light: wood.light, base: wood.base, dark: wood.dark }, { light: 1, shade: 1, clip: inside });
      s.rect(ox, y + 3, lw, 1, wood.dark, clip);
      const len = Math.round(lw * (p.style === 'arched' ? 0.7 : 0.55));
      s.rect(ox, y, len, 2, metal, { light: 1, clip: inside });
      s.rect(ox + len, y, 1, 1, metal.base, clip); s.rect(ox + len - 1, y - 1, 1, 4, metal.dark, clip);   // the strap's shaped end
      if (p.style === 'arched') { s.dot(ox + len + 1, y - 1, metal.base); s.dot(ox + len + 1, y + 2, metal.base); }
      for (let x = ox + 2; x < ox + len - 2; x += 4) s.dot(x, y, metal.dark);                           // nails
    }
  }
  if (p.window) {
    // a small barred window: dark, in a wooden surround, with two iron bars
    const wy = D.spring + (p.style === 'iron-bound' ? 4 : 0) + Math.round((rows[0] - D.spring) * 0.2) + (D.ry ? -Math.round(D.ry * 0.45) : 2);
    const wx = CX - 4, wh = Math.max(6, Math.min(8, rows[0] - 3 - wy));
    s.rect(wx - 1, wy - 1, 10, wh + 2, wood.dark, clip);
    s.rect(wx, wy, 8, wh, HOLE, clip);
    for (const x of [wx + 2, wx + 5]) s.rect(x, wy, 1, wh, metal.base, clip);
    s.rect(wx - 1, wy + wh, 10, 1, wood.light, clip);
  }
  // the ring handle, on the side away from the hinge
  const hx = ox + lw - 5, hy = D.lockY - 11, ring = flash && p.lock === 'none' ? WHITE : metal;
  s.rect(hx - 1, hy - 3, 3, 2, ring.base, { outline: INK });
  s.fill(hx - 4, hy - 3, hx + 4, hy + 4, ringIn(hx + 0.5, hy + 0.5, 2.5, 1), ring.light, { outline: INK });
  if (p.lock !== 'none') lockOnLeaf(s, D, { kind: p.lock, size: p.lockSize, metal: flash ? WHITE : metal, bar: flash ? WHITE : { light: metal.base, base: metal.dark, dark: tone(p.metal, -1.8) }, shot });
  if (edge !== null) s.rect(ox + edge, oy, lw - edge, lh, ramp(p.wood).light, clip);              // the thickness of the leaf, catching the light
}

// ---- the stone frame and its threshold ---------------------------------------------------------------------
function drawFrame(g, D, p) {
  const stone = ramp(p.stone), joint = stone.dark, { x0, x1, w, top, bottom } = D;
  const outer = D.frame, heavy = p.style === 'iron-bound';
  const parts = [outer, rectIn(x0 - 2, bottom + 1, w + 4, SILL)];
  if (heavy) parts.push(rectIn(x0 - 2, top, w + 4, 3));                                        // a cornice over the lintel
  g.blob(parts, stone, { shade: 2, light: 1 });
  g.rect(x0 - 2, bottom + 1, w + 4, 1, stone.light);                                           // the worn top of the threshold
  if (heavy) g.rect(x0 - 1, top, w + 3, 1, stone.light);
  // the joints: level ones down the jambs, and the stones of the head
  for (let y = D.spring + 5, i = 0; y < bottom - 2; y += 8, i++) { g.rect(x0 + 1, y + (i % 2 ? 0 : 3), JAMB - 1, 1, joint); g.rect(x1 - JAMB + 1, y + (i % 2 ? 3 : 0), JAMB - 1, 1, joint); }
  if (D.ry) {
    // arch stones: joints square to the curve, and a keystone on the crown
    archStones(g, CX, D.spring, D.lw / 2, D.ry, { depth: HEAD, colour: joint, keystone: stone.light, clip: outer });
  } else {
    for (const x of [x0 + JAMB + 2, x1 - JAMB - 2]) g.rect(x, top + (heavy ? 3 : 1), 1, HEAD - (heavy ? 3 : 1), joint);
    g.rect(x0 + JAMB, top + HEAD - 1, D.lw, 1, joint);                                         // the lintel's underside, in shade
  }
}

function pose(clip, frame) {
  const k = clip === 'open' ? OPEN[frame] ?? OPEN[5] : 1;
  return { k, dx: clip === 'locked' ? RATTLE[frame] ?? 0 : 0, flash: clip === 'locked' && frame === 0 };
}

export default defineSprite({
  id: 'wooden-door',
  name: 'Wooden door',
  kind: 'Item',
  blurb: 'A wooden door in a stone frame that swings open or rattles when it is locked. Make it plain, arched or iron-bound, and change its size, window, lock and colours.',
  meta: {
    type: 'prop',
    role: 'world/door',
    themes: ['fantasy', 'dungeon'],
    gameTypes: ['platformer'],
    view: 'side',
    words: ['door', 'gate', 'doorway', 'entrance', 'exit', 'open', 'locked', 'lock', 'castle', 'wooden', 'level end', 'key'],
    license: 'draft',
  },
  size: [W, H],
  pivot: [CX, GROUND + 1],
  params: {
    style: choice('Style', 'plank', [{ value: 'plank', label: 'Plank' }, { value: 'arched', label: 'Arched' }, { value: 'iron-bound', label: 'Iron-bound' }]),
    width: range('Width', 0.5, { lo: 'Narrow', hi: 'Wide' }),
    height: range('Height', 0.5, { lo: 'Short', hi: 'Tall' }),
    window: toggle('Barred window', false),
    lock: choice('Lock', 'keyhole', [{ value: 'none', label: 'None' }, { value: 'padlock', label: 'Padlock' }, { value: 'keyhole', label: 'Keyhole' }, { value: 'bar', label: 'Bar' }]),
    lockSize: range('Size', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Small', hi: 'Big' }),
    wood: color('Wood', P.wood, swatches('thornwood', 'wood')),
    metal: color('Metal', P.steel, swatches('thornwood', 'metal')),
    stone: color('Stone', P.stone, swatches('thornwood', 'stone')),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  parts: { lock: { label: 'Lock', params: ['lock', 'lockSize'], none: 'none', socket: 'lock' } },
  clips: {
    closed: { frames: 1, fps: 8, loop: true },
    open: { frames: 6, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false },
    locked: { frames: 4, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false },
  },
  sounds: {
    open: [{ sound: 'door-creak', preset: 'Wooden door', frame: 0, volume: 0.8 }],
    locked: [{ sound: 'lever-clank', preset: 'Switch', frame: 0, volume: 0.7 }],
  },
  // where the lock sits: on the leaf's free edge, which moves towards the hinge as the door opens
  sockets(clip, t, p) {
    const D = dims(p), frames = clip === 'open' ? 6 : clip === 'locked' ? 4 : 1;
    const { k, dx } = pose(clip, Math.round(t * (frames - 1)));
    return { lock: { x: D.ox + Math.max(1, Math.round(D.lw * k) - 5) + dx, y: D.lockY, angle: 0 } };
  },

  render(g, { clip, frame, p }) {
    const D = dims(p), { k, dx, flash } = pose(clip, frame), shut = k >= 1;
    const metal = flash ? WHITE : ramp(p.metal), inside = D.hole;
    drawFrame(g, D, p);
    // the doorway: dark, with a strip of floor inside the threshold; its rim is the frame's inner line
    g.fill(D.ox - 1, D.oy - 1, D.ox + D.lw + 1, D.bottom + 1, inside, HOLE, { outline: INK, clip: (px, py) => py < D.bottom + 1 });
    for (let i = 0; i < 3; i++) g.rect(D.ox + 1 + i, D.bottom - i, D.lw - 2 - 2 * i, 1, tone(HOLE, 1.1 - 0.3 * i));
    // the leaf: drawn shut, then turned on its hinge (the left jamb) or pushed sideways by the rattle
    const leaf = new Surface(W, H), vis = Math.max(1, Math.round(D.lw * k));
    drawLeaf(leaf, D, p, { far: k < 0.75, flash, shot: shut, edge: shut ? null : Math.floor(((vis - 0.5) * D.lw) / vis) });
    const turn = Math.acos(Math.min(1, k));
    const seen = shut ? leaf : swing(leaf, D.ox, D.lw, k, Math.round(D.lw * Math.sin(turn) * 0.2), Math.round(D.lw * Math.sin(turn) * 0.1));
    g.blit(masked(seen, (px, py) => inside(px + dx, py)), dx, 0);                              // only what shows through the doorway
    // what is fixed to the frame: the hinge pins on the left jamb, and the frame's half of the lock
    for (const fy of [0.14, 0.8]) g.rect(D.ox - 2, D.spring + Math.round((D.bottom - D.spring) * fy) - 1, 2, 4, ramp(p.metal), { light: 1, outline: INK });
    if (p.lock !== 'none') lockOnFrame(g, D, { kind: p.lock, size: p.lockSize, metal, shot: shut });
    g.outline(INK);
  },
});
