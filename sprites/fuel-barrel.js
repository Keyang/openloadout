// Fuel barrel: the one bright red body in the kit, so it reads as danger. Seen from above and in front
// (three-quarter view): a lit lid with a warning lamp on it, over a round wall with hazard tape.
// Three builds: a ribbed drum, a domed gas tank with a valve, and a six-sided fuel cell with a glowing
// window. Each is one solid from engine/solids.js. `hurt` knocks it and starts a leak, `fuse` swells and
// flashes faster and faster, `break` (Explode) splits it and leaves a scorch ring and two fragments;
// the game plays explosion-large over that.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, clamp, PI } from '../engine/motion.js';
import { tone, mix, pick, INK } from '../engine/color.js';
import { Surface, ellipseIn, polyIn, tilt, cropped } from '../engine/surface.js';
import { PALETTE, swatches, swatchesBetween } from '../engine/palettes.js';
import { lamp, glow, steps, ring, chunks, shards, particles, scorch } from '../engine/fx.js';
import { hitWobble } from '../engine/breaking.js';
import { drawMark } from '../engine/marks.js';
import { edgeIn } from '../engine/shapes.js';
import { extrude, bandIn, wallFill, stripesIn, ngonPoints, wallWear } from '../engine/solids.js';

const P = PALETTE.derelict;
const W = 32, H = 48, CX = 16, GROUND = 45;      // the lowest body row; its outline lands on the pivot row
const BLINK = [2, 2, 1, 0.5, 0, 0, 0, 0.5];      // idle: the warning lamp, frame by frame (2 flares, 0 is dark)
const FLASH = [1, 0, 0, 1, 0, 1, 0, 1];          // fuse: the frames on which the whole body flashes hot
const SWELL = [0, 0, 0, 1, 1, 1, 2, 2];          // fuse: px it has swollen

// rx: columns to each side of the centre column; ry: half the rows of the top face; h: rows of wall
function dims(p) {
  const r = Math.round(lerp(7, 10, p.size));
  if (p.style === 'tank') { const rx = r - 1; return { rx, ry: Math.round(rx * 0.6), h: Math.round(r * 1.9) }; }
  if (p.style === 'cell') return { rx: r, ry: Math.max(3, Math.round(r * 0.42)), h: Math.round(r * 2.1) };
  return { rx: r, ry: Math.max(2, Math.round(r * 0.36)), h: Math.round(r * 2.3) };
}

// The barrel without its outline, on its own layer. o: grow (px swollen), squash (px wider and shorter), heat (0..1: how far its colours go
// white-hot), lamp (0 dark, 0.5 dim, 1 lit), leak (rows of fuel running down from a hole).
// Returns { g, lamp: [x, y, w, h], mid: the row of its middle, d }.
function barrel(p, o = {}) {
  const g = new Surface(W, H), d = dims(p), grow = o.grow ?? 0;
  const hot = (c) => (o.heat ? mix(c, tone(p.glow, 1.6), o.heat) : c);
  const body = hot(p.body), accent = hot(p.accent), tape = hot(P.plate);
  const rx = d.rx + grow + (o.squash ?? 0), ry = d.ry, h = d.h + (grow > 1 ? 1 : 0) - (o.squash ?? 0);
  const cy = GROUND + 1 - h - ry, x0 = CX - rx, x1 = CX + rx + 1;
  const on = (from, thick, a = -Infinity, b = Infinity) => bandIn(S, from, thick, { x0: a, x1: b });
  let S, lens;

  if (p.style === 'tank') {
    // a gas tank: a dome on top, collars round it, a valve with a hand wheel, a plate with a warning mark
    S = extrude(g, ellipseIn(CX + 0.5, cy, rx + 0.5, ry), h, body);
    const R = S.ramps.wall, T = S.ramps.top;
    g.ellipse(CX + 0.5 + rx * 0.4, cy - ry * 0.4, 2, 1.3, T.light);                                // the shine on the dome
    g.fill(x0, cy, x1, cy + ry + 1, edgeIn(S.top, 0, 1), R.light);       // where the dome meets the wall
    if (p.bands) for (const from of [1, h - 5]) { wallFill(g, S, on(from, 2), { light: T.light, base: R.light, dark: R.base }); wallFill(g, S, on(from + 2, 1), R.dark, { flat: true }); }
    const top = cy - ry;
    g.rect(CX - 1, top - 2, 3, 3, hot(P.steel));
    g.rect(CX - 3, top - 3, 7, 1, hot(P.plate));
    lens = [CX - 1, top - 5, 3, 2];
    const m = rx >= 8 ? 7 : 5, from = Math.max(4, Math.round(h * 0.5) - ((m + 2) >> 1)), lx = CX - ((m + 1) >> 1), plate = on(from, m + 2, lx, lx + m + 2);
    wallFill(g, S, (px, py) => on(from - 1, m + 4, lx - 1, lx + m + 3)(px, py) && !plate(px, py), R.dark, { flat: true });
    wallFill(g, S, plate, accent, { flat: true });
    drawMark(g, 'exclaim', CX, S.front(CX) + 1 + from + ((m + 1) >> 1), m, pick(accent, tape, P.cream), { clip: plate });
  } else if (p.style === 'cell') {
    // a fuel cell: six sides, pale end caps, hazard tape inside each cap and a window that shows the fuel
    S = extrude(g, polyIn(ngonPoints(CX + 0.5, cy, rx + 0.5, ry, 6)), h, body, { topColour: hot(P.panel), lip: 1 });
    const R = S.ramps.wall, cap = hot(P.panel);
    if (p.bands) for (const from of [0, h - 3]) wallFill(g, S, on(from, 3), cap);
    for (const from of [3, h - 6]) { wallFill(g, S, on(from, 3), { light: accent, base: accent, dark: tone(accent, -1) }); wallFill(g, S, stripesIn(on(from, 3), { pitch: 4 }), tape, { flat: true }); }
    const wy = 8, wh = Math.max(3, h - 16);
    wallFill(g, S, on(wy - 1, wh + 2, CX - 2, CX + 3), R.dark, { flat: true });
    wallFill(g, S, on(wy, wh, CX - 1, CX + 2), hot(p.glow), { flat: true });
    wallFill(g, S, on(wy, wh, CX, CX + 1), tone(hot(p.glow), 0.9), { flat: true });
    g.rect(CX - 2, cy - 1, 5, 2, hot(P.plate));
    lens = [CX - 1, cy - 3, 3, 2];
  } else {
    // a drum: a lid with a raised rim, two ribs, hazard tape round the middle
    S = extrude(g, ellipseIn(CX + 0.5, cy, rx + 0.5, ry), h, body, { lip: 1, turn: 0.3 });
    const R = S.ramps.wall, T = S.ramps.top;
    wallFill(g, S, on(1, 1), R.dark, { flat: true });                                              // the shadow under the lid's rim
    const from = Math.round(h * 0.38), thick = Math.max(4, Math.round(h * 0.28));
    if (p.bands) for (const rib of [from - 4, from + thick + 2]) { wallFill(g, S, on(rib, 1), { light: T.light, base: R.light, dark: R.base }, { turn: 0.3 }); wallFill(g, S, on(rib + 1, 1), R.dark, { flat: true }); }
    wallFill(g, S, on(from, thick), { light: accent, base: accent, dark: tone(accent, -1) }, { turn: 0.3 });
    wallFill(g, S, stripesIn(on(from, thick), { pitch: 4 }), tape, { flat: true });
    g.rect(x0 + 3, cy, 2, 1, R.base);                                                              // the bung
    g.rect(CX - 2, cy - 1, 5, 2, hot(P.plate));
    lens = [CX - 1, cy - 3, 3, 2];
  }
  const R = S.ramps.wall, front = (x) => S.front(x) + 1;

  // wear: dents and scratches, then grime along the foot (measured from the barrel's own width: the cell's corners make its wall a pixel narrower)
  wallWear(g, S, p.wear, R, { mid: CX, half: rx });

  // the leak: a hole left of the middle, and fuel running down from it
  if (o.leak) {
    const lx = CX - Math.round(rx * 0.5), ly = front(lx) + Math.round(h * 0.5), fuel = hot(p.glow);
    g.rect(lx - 1, ly - 1, 3, 2, tape);
    for (let i = 0; i < o.leak; i++) if (ly + 1 + i <= front(lx) + h - 1) g.dot(lx, ly + 1 + i, fuel);
  }
  // the warning lamp (its flare, a halo outside the body, is drawn by render after the outline)
  lamp(g, ...lens, p.glow, Math.min(o.lamp ?? 0, 1));
  return { g, lamp: lens, mid: Math.round(cy + ry + h / 2), d };
}

export default defineSprite({
  id: 'fuel-barrel',
  name: 'Fuel barrel',
  kind: 'Item',
  blurb: 'A red barrel that leaks when shot, swells, flashes and explodes. Make it a drum, a gas tank or a fuel cell, and change its size, dents, ribs and colours.',
  meta: { type: 'prop', role: 'world/hazard', themes: ['sci-fi', 'space'], gameTypes: ['roguelike-action', 'shooter'], view: 'top-down',
    words: ['barrel', 'fuel', 'drum', 'tank', 'canister', 'explosive', 'explode', 'shoot', 'hazard', 'danger', 'bomb', 'trap', 'red', 'warning'], license: 'draft' },
  size: [W, H],
  pivot: [CX, GROUND + 1],
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    style: choice('Style', 'barrel', ['barrel', 'tank', 'cell']),
    wear: range('Wear', 0.35, { lo: 'New', hi: 'Worn' }),
    bands: toggle('Ribs', true),
    body: color('Body', P.red, swatchesBetween('derelict', ['red', 'wall'], { lead: 'red', max: 0.6 })),
    accent: color('Hazard label', P.amber, swatchesBetween('derelict', ['accent', 'core', 'gem'], { lead: 'amber', min: 0.62 })),
    glow: color('Light', P.amber, swatches('derelict', 'glow', { lead: 'amber' })),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 8, fps: (p) => 8 * lerp(0.65, 1.45, p.speed), loop: true },
    hurt: { frames: 4, fps: (p) => 9 * lerp(0.65, 1.45, p.speed), loop: false },
    fuse: { frames: 8, fps: (p) => 8 * lerp(0.65, 1.45, p.speed), loop: true },
    break: { label: 'Explode', frames: 8, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false },
  },
  sounds: {
    hurt: [{ sound: 'bolt-impact', preset: 'On metal', frame: 0, volume: 0.9 }],
    break: [{ sound: 'explosion', preset: 'Grenade', frame: 0 }],
  },

  render(g, { clip, frame, p }) {
    const flare = (B) => lamp(g, ...B.lamp, p.glow, 2);
    // fuel that has run down the wall pools at its foot (a light, so it is rimmed with its own dark tone)
    const puddle = (B, size) => g.ellipse(CX - B.d.rx * 0.55, GROUND - 0.5, size, 1.3, p.glow, { outline: tone(p.glow, -1) });

    if (clip === 'idle') {
      const B = barrel(p, { lamp: BLINK[frame] });
      g.blit(B.g).outline(INK);
      if (BLINK[frame] === 2) flare(B);
      return;
    }

    if (clip === 'hurt') {
      // the hit: squashed and knocked a pixel to the right, then it springs up narrow and settles; fuel runs from the hole
      const [squash, shift] = hitWobble(frame);
      const B = barrel(p, { lamp: 1, squash, leak: [0, 2, 5, 8][frame] });
      g.blit(B.g, shift, 0);
      if (frame === 0) g.tint('#ffffff');
      g.outline(INK);
      if (frame === 3) puddle(B, 1.6);
      return;
    }

    if (clip === 'fuse') {
      // on a flash the whole body is one pale colour of its own light, as things blink before they blow
      const B = barrel(p, { lamp: 1, leak: 99, grow: SWELL[frame] });
      g.blit(B.g);
      if (FLASH[frame]) g.tint(tone(p.glow, 1.6));
      g.outline(INK);
      flare(B);
      puddle(B, 2.4 + (frame % 2) * 0.6);
      return;
    }

    // ---- break (Explode) ----
    if (frame === 0) {                                        // swollen and white
      g.blit(barrel(p, { grow: 2 }).g).tint('#ffffff').outline(INK);
      return;
    }
    const C = steps(p.glow), B0 = barrel(p, { grow: 1 }), d = B0.d, mid = B0.mid;
    if (frame === 1) {
      // it splits down the middle: the halves jump apart, white fire between them
      const room = 12 - d.rx, apart = clamp(room - 2, 0, 2);           // px free beside it: some to jump apart, the rest to lean
      for (const side of [-1, 1]) {
        const half = side < 0 ? cropped(B0.g, 0, 0, CX + 1, H) : cropped(B0.g, CX + 1, 0, W, H);
        g.blit(tilt(half, CX + side * d.rx, GROUND + 1, side * Math.min(0.06, (room - apart) / (d.h + 2 * d.ry + 4))), side * apart, 0);
      }
      g.outline(INK);
      glow(g, CX + 0.5, mid, d.rx * 0.9, C);
      return;
    }
    const k = clamp((frame - 1.6) / 5.4);                     // just blown on frame 2, at rest on the last frame
    const base = GROUND - d.ry;                               // the middle of where it stood
    // the scorch ring it leaves on the floor (a ground mark with no ink round it), full size by k = 0.45, and embers cooling in it
    scorch(g, { x: CX + 0.5, y: base, rx: Math.min(d.rx + 3, 13), ry: d.ry + 2, t: k / 0.45, colour: tone(P.plate, -0.9), colours: C, heat: 1 - k, flicker: frame });
    // two big fragments land on it and stay; three more fly off and are gone (solid things: inked, on their own layer)
    const bits = new Surface(W, H);
    chunks(bits, { t: k, x: CX, y: mid, count: 2, seed: 5, dist: 9, rise: 12, size: d.rx * 1.1, thick: 3, spread: 3, spin: 0.7, floor: GROUND, land: 0.8, shrink: 0.4, colour: p.body, box: [2, 2, W - 2, GROUND + 1] });
    if (k < 0.75) chunks(bits, { t: k / 0.75, x: CX, y: mid - 4, count: 3, seed: 9, dist: 11, rise: 14, size: d.rx * 0.8, thick: 2, spread: 4, spin: 1, floor: base - 2, land: 0.95, shrink: 0.6, rest: false, colour: p.body, box: [2, 2, W - 2, GROUND + 1] });
    g.blit(bits.outline(INK));
    // the blast: a white ball that is gone in two frames, a ring racing out, sparks
    if (frame === 2) glow(g, CX + 0.5, mid, d.rx * 1.1, C);
    if (frame === 3) glow(g, CX + 0.5, mid - 1, d.rx * 0.55, C);
    if (k < 0.8) ring(g, { t: k / 0.8, x: CX, y: mid, r0: d.rx * 0.6, r1: 14, thick: 3, colours: C });
    if (k < 0.9) particles(g, { t: k / 0.9, x: CX, y: mid, count: 9, seed: 2, loop: false, stagger: 0.2, arc: PI * 2, dist: 14, gravity: 6, size: 2, colours: C });
    if (k < 0.9) shards(g, { t: k, x: CX, y: mid, count: 4, seed: 13, dist: 13, gravity: GROUND - mid, size: 3, colour: p.body, box: [1, 1, W - 1, GROUND + 1] });
  },
});
