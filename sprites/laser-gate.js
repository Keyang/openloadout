// Laser gate: two posts with beams of light between them, across a corridor two tiles wide on a top-down map (seen
// from the south). The posts are solid things and are outlined; the beams are light and go on after the outline: a
// white core between rows of the Beam colour, rimmed with its dark tone (laserBeam in engine/bulkhead.js). The posts
// are boxes seen from the south (drawCasing, in the tones machineTones gives) with warning paint on the foot (hazardBand).
//   idle (On)          the beams burn; a bright swelling runs along each one, and the Flicker control makes the
//                      whole beam swell and thin on some frames
//   open (Power down)  the beams thin to a line, break into pieces and go out; the last frame is `off`
//   off                the two posts, their emitters and warning lights dark
//   warn               about to switch on: a thin broken line blinks between the emitters, the warning lights flash
// The posts are in every frame, so no frame is ever empty. Three posts: a pylon on a plinth, a pedestal that
// carries a glowing orb, and a slim rail that stands against a wall.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp } from '../engine/motion.js';
import { tone, INK } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { lamp, steps, twinkle } from '../engine/fx.js';
import { laserBeam, machineTones, drawCasing, hazardBand } from '../engine/bulkhead.js';

const D = PALETTE.derelict;
const W = 64, H = 48, CX = 32, GROUND = 45;      // the lowest body row; its outline lands on the pivot row
const BODIES = [D.hull, D.panel, D.steel, D.deck, D.nebula, D.membrane];
// the rows the beams lie on, by how many there are; with the orb the first leaves the orb and the others its pedestal
const ROWS = { one: [26], two: [20, 32], three: [17, 26, 35] };
const ORB_ROWS = { one: [21], two: [21, 34], three: [21, 32, 38] };
// idle: the frames on which the beams swell (+1) or thin (-1), and how much Flicker each needs
const SWELL = { 4: [0.15, 1], 6: [0.5, -1], 1: [0.8, 1] };
// open, frame by frame: how thick the beams are, how much of them has gone, and the emitters (2 flares, 0 is dark)
const DOWN = [
  { thick: 5, cut: 0, lens: 1 },
  { thick: 3, cut: 0, lens: 2 },               // they thin (the click)
  { thick: 1, cut: 0.3, lens: 1 },             // break
  { thick: 1, cut: 0.62, lens: 0.5, spark: true },
  { thick: 1, cut: 0.88, lens: 0.5 },
  { thick: 0, cut: 1, lens: 0 },               // off
];
// warn, frame by frame: is the thin line there, and the warning lights
const WARN = [{ line: true, light: 2 }, { line: true, light: 1 }, { line: false, light: 0.5 }, { line: true, light: 2 }, { line: false, light: 1 }, { line: false, light: 0 }];

// Where the two posts stand, from the Width control: the gap between them, and the column each one's middle is on.
function dims(p) {
  const gap = 2 * Math.round(lerp(13, 20, p.width)), half = p.style === 'wall mount' ? 3 : 5;
  return { gap, half, xs: [CX - gap / 2 - half, CX + gap / 2 + half], rows: (p.style === 'orb' ? ORB_ROWS : ROWS)[p.beams] };
}

// One post. side: -1 the left one, 1 the right one (its emitters point the other way). Returns what goes on after
// the outline: lenses [[x, y, w, h]] (the emitters), lights [[x, y, w, h]] (the warning lights), tips [x per beam].
function post(g, p, T, d, side) {
  const cx = d.xs[side < 0 ? 0 : 1], inner = -side, lenses = [], lights = [], tips = [];
  const paint = { dark: T.dark, paint: p.accent };              // warning paint on the foot of a post
  // an emitter: a dark nozzle that sticks out towards the other post, the lens at its tip
  const nozzle = (from, y) => {
    const x = inner > 0 ? from : from - 3;
    g.rect(x, y - 2, 3, 5, T.dark); g.rect(x, y - 2, 3, 1, T.darkLit);
    lenses.push([inner > 0 ? x + 2 : x, y - 1, 1, 3]);
    tips.push(inner > 0 ? x + 3 : x - 1);
  };
  if (p.style === 'pylon') {
    drawCasing(g, T, cx - 3, 14, 6, 28, 0);
    drawCasing(g, T, cx - 4, 9, 8, 7, 2);                                   // the head
    drawCasing(g, T, cx - 5, 39, 10, 7, 2);                                 // the plinth
    hazardBand(g, cx - 4, 42, 8, 3, paint);
    lights.push([cx - 1, 12, 2, 2]);
    for (const y of d.rows) nozzle(inner > 0 ? cx + 3 : cx - 3, y);
  } else if (p.style === 'orb') {
    drawCasing(g, T, cx - 3, 30, 6, 12, 0);
    drawCasing(g, T, cx - 5, 27, 10, 4, 2);                                 // the dish the orb rests in
    drawCasing(g, T, cx - 5, 40, 10, 6, 2);
    hazardBand(g, cx - 4, 43, 8, 2, paint);
    lights.push([cx - 1, 34, 2, 2]);
    const dim = tone(p.glow, -1.9);
    g.ellipse(cx, 21, 5, 5, { light: tone(p.glow, -1.2), base: dim, dark: dim }, { shade: 0, light: 1 });      // dark glass; its light goes on after the outline
    lenses.push('orb');
    tips.push(inner > 0 ? cx + 5 : cx - 6);
    for (const y of d.rows.slice(1)) nozzle(inner > 0 ? cx + 3 : cx - 3, y);
  } else {
    // a slim rail on a back plate that stands against the wall
    g.rect(cx - side * 2 - 2, 9, 4, 37, T.dark); g.rect(cx - side * 2 - 2, 9, 4, 1, T.darkLit);
    drawCasing(g, T, cx - 2 + inner, 11, 4, 35, 1);
    hazardBand(g, cx - 1 + inner, 39, 2, 6, paint);
    lights.push([cx - 1 + inner, 13, 2, 2]);
    for (const y of d.rows) nozzle(inner > 0 ? cx + 2 + inner : cx - 2 + inner, y);
  }
  return { cx, lenses, lights, tips };
}

export default defineSprite({
  id: 'laser-gate',
  name: 'Laser gate',
  kind: 'Item',
  blurb: 'Two posts with beams of light between them that bar a corridor, power down, stand dark or warn before they switch on. Change the gap, the posts, the number of beams, the flicker and the colours.',
  meta: {
    type: 'prop',
    role: 'world/hazard',
    themes: ['sci-fi', 'space'],
    gameTypes: ['roguelike-action', 'shooter'],
    view: 'top-down',
    words: ['laser', 'gate', 'beam', 'barrier', 'fence', 'trap', 'hazard', 'security', 'switch off', 'warn', 'block', 'corridor', 'energy'],
    license: 'draft',
  },
  size: [W, H],
  pivot: [CX, GROUND + 1],
  params: {
    width: range('Width', 0.6, { lo: 'Narrow', hi: 'Wide' }),
    style: choice('Style', 'pylon', [{ value: 'pylon', label: 'Pylon' }, { value: 'orb', label: 'Orb' }, { value: 'wall mount', label: 'Wall mount' }]),
    beams: choice('Beams', 'two', [{ value: 'one', label: 'One' }, { value: 'two', label: 'Two' }, { value: 'three', label: 'Three' }]),
    body: color('Posts', D.hull, BODIES),
    accent: color('Warning paint', D.amber, swatches('derelict', 'accent', { lead: 'amber' })),
    glow: color('Beam', D.red, swatches('derelict', 'glow', { lead: 'red' })),
    flicker: range('Flicker', 0.5, { lo: 'Steady', hi: 'Wild', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 8, fps: (p) => 10 * lerp(0.65, 1.45, p.speed), loop: true, label: 'On' },
    open: { frames: 6, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false, label: 'Power down' },
    off: { frames: 1, fps: 8, loop: true },
    warn: { frames: 6, fps: (p) => 8 * lerp(0.65, 1.45, p.speed), loop: true },
  },
  sounds: {
    idle: [{ sound: 'spaceship-hum', preset: 'Idle', frame: 0, volume: 0.35 }],
    open: [{ sound: 'tech-click', preset: 'Confirm', frame: 0, volume: 0.6 }],
  },

  render(g, { clip, frame, t, p }) {
    const T = machineTones(p.body), d = dims(p);
    const left = post(g, p, T, d, -1), right = post(g, p, T, d, 1);
    g.outline(INK);

    // everything that is light goes on after the outline
    const C = steps(p.glow);
    const down = clip === 'open' ? DOWN[frame] ?? DOWN[5] : null, warn = clip === 'warn' ? WARN[frame % 6] : null;
    const lens = clip === 'off' ? 0 : down ? down.lens : warn ? (warn.line ? 1 : 0.5) : frame % 2 ? 1 : 2;
    const light = clip === 'off' ? 0 : warn ? warn.light : down ? Math.min(1, down.lens) : 1;
    for (const P of [left, right]) {
      for (const L of P.lenses) {
        if (L !== 'orb') { lamp(g, ...L, p.glow, lens); continue; }
        if (lens <= 0) continue;                                     // the orb: lit from inside
        g.ellipse(P.cx, 21, 3, 3, lens >= 2 ? '#ffffff' : lens >= 1 ? C[1] : C[3], { shade: 0 });
        if (lens >= 1) g.ellipse(P.cx, 21, 1.5, 1.5, '#ffffff', { shade: 0 });
      }
      for (const L of P.lights) lamp(g, ...L, p.accent, light);
    }
    if (clip === 'off') return;
    d.rows.forEach((y, i) => {
      const x0 = left.tips[i], x1 = right.tips[i], span = x1 - x0 + 1;
      if (warn) { if (warn.line) laserBeam(g, { x0, x1, y, thick: 1, colours: C, cut: 0.45, dash: 3, phase: frame / 6, seed: i }); return; }
      if (down) {
        if (down.thick) laserBeam(g, { x0, x1, y, thick: down.thick, colours: C, cut: down.cut, dash: 4, phase: frame * 0.37, seed: i });
        if (down.spark) twinkle(g, i % 2 ? x1 - 2 : x0 + 2, y, 2, C[2]);
        return;
      }
      // on: the beam, and a swelling that runs along it from one emitter to the other, once per loop
      const swell = SWELL[frame] && p.flicker >= SWELL[frame][0] ? SWELL[frame][1] : 0;
      laserBeam(g, { x0, x1, y, thick: 5 + 2 * swell, colours: C });
      const at = x0 + Math.floor(((t + i / d.rows.length) % 1) * span), bump = Math.min(x1, at + 3);
      laserBeam(g, { x0: at, x1: bump, y, thick: 7 + 2 * swell, colours: C });
    });
  },
});
