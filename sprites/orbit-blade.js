// Orbit blade: a blade that circles the player and cuts what it touches. Seen from straight above:
// an inked metal disc with two, three or four blades, turning by one blade per loop (so the loop
// closes), its cutting edge lit in the glow colour. It looks the same whichever way a game turns
// it. `hit` knocks it back a pixel and throws three sparks from where it bit. The blade shapes are
// the framework's (engine/mech.js `toothedIn`, engine/shapes.js, engine/shots.js `crescentIn` and
// `hotEdge`); this file is the three styles, sizes and timing.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, PI, TAU } from '../engine/motion.js';
import { ellipseIn } from '../engine/surface.js';
import { ramp, tone, INK } from '../engine/color.js';
import { anyIn, starIn, spunIn } from '../engine/shapes.js';
import { toothedIn } from '../engine/mech.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { starburst } from '../engine/fx.js';
import { crescentIn, hotEdge } from '../engine/shots.js';

const P = PALETTE.derelict;
const C = 16;
const COUNT = { two: 2, three: 3, four: 4 };
const METAL = swatches('derelict', 'metal');
// The lit edge runs along the metal, so the two controls never offer the same colour.
const GLOW = swatches('derelict', 'glow').filter((c) => !METAL.includes(c));

// The blade's outline for one style: n blades reaching R px from (x, y), turned by `turn` (clockwise on screen).
function bladesIn(style, x, y, R, n, turn) {
  const hub = ellipseIn(x, y, R * 0.42, R * 0.42);
  if (style === 'star') return anyIn(starIn(x, y, R + 0.5, n, { inner: n === 2 ? 0.3 : n === 3 ? 0.3 : 0.4, angle: turn }), ellipseIn(x, y, R * 0.36, R * 0.36));   // straight points: a throwing star
  if (style === 'crescent') {
    // sickles hooked round the hub, their points trailing
    const sickle = crescentIn(-R * 0.16, -R * 0.44, R * 0.56, { bite: 0.9, shift: 0.52, angle: -PI / 2 - 0.5 });
    return anyIn(spunIn(sickle, x, y, n, turn), hub);
  }
  return toothedIn(x, y, R, n, R * 0.5, turn, 'saw');                                                              // saw: hooked teeth, the upright face leading
}

export default defineSprite({
  id: 'orbit-blade',
  name: 'Orbit blade',
  kind: 'Item',
  blurb: 'A spinning blade that circles its owner, seen from above, with a lit cutting edge; it throws sparks where it bites. Change its size, style, number of blades, motion arcs and colours.',
  meta: { type: 'projectile', role: 'effects/projectile', themes: ['sci-fi', 'space'], gameTypes: ['roguelike-action', 'shooter', 'arcade'], view: 'top-down',
    words: ['blade', 'saw', 'shuriken', 'disc', 'orbit', 'spinning', 'circle', 'spin', 'cut', 'hit', 'upgrade', 'horde survival', 'sharp'], license: 'draft' },
  size: [32, 32],
  pivot: [C, C],
  grounded: false,
  preview: 'fly',
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    style: choice('Style', 'saw', ['saw', 'star', 'crescent']),
    blades: choice('Blades', 'three', ['two', 'three', 'four']),
    trail: toggle('Trail', true),
    metal: color('Metal', P.steel, METAL),
    glow: color('Edge', P.cyan, GLOW),
    wobble: range('Wobble', 0.5, { lo: 'Firm', hi: 'Wobbly', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    fly: { frames: 8, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: true, label: 'Spin' },
    hit: { frames: 4, fps: (p) => 16 * lerp(0.65, 1.45, p.speed), loop: false },
  },

  render(g, { clip, t, frame, p }) {
    const hit = clip === 'hit';
    const n = COUNT[p.blades];
    const R = lerp(6.5, 8.8, p.size);                    // to the blade tips; the ink and the lit edge lie outside it
    const metal = ramp(p.metal), dim = tone(p.glow, -1);
    // the axle is a little off centre, so the whole blade goes round in a small circle; a hit knocks it back and it returns
    const sway = lerp(0, 1.3, p.wobble);
    const x = C + sway * Math.cos(TAU * t) - (hit ? [2, 1, 1, 0][frame] : 0);
    const y = C + sway * Math.sin(TAU * t);
    const turn = (hit ? 0.5 * t : t) * (TAU / n);        // one blade per loop: the next blade ends where this one began
    const body = bladesIn(p.style, x, y, R, n, turn);

    g.fill(1, 1, 31, 31, body, metal, { shade: R >= 8 ? 2 : 1, light: 1 });
    // the hub: a dark cap with a bright bolt, which does not turn
    g.ellipse(x, y, 2, 2, metal.dark, { shade: 0 });
    g.rect(Math.round(x), Math.round(y) - 1, 1, 1, metal.light);
    g.outline(INK);

    // after the ink, the light: the cutting edge, then the motion arcs or the sparks
    hotEdge(g, body, p.glow, { where: (px, py) => (px - x) ** 2 + (py - y) ** 2 > (R * 0.8 + 1) ** 2 });     // only out at the tips, where it cuts
    if (hit) {
      // three sparks fly from where it bit: a white flash, then three lines that thin, cool and are gone
      const bx = Math.min(22, Math.round(x + R)) + 0.5, by = Math.round(y) + 0.5;
      const sparks = (o) => { for (const a of [-0.85, 0, 0.85]) starburst(g, { x: bx, y: by, count: 1, turn: PI / 2 + a, ...o }); };
      if (frame === 0) starburst(g, { x: bx, y: by, count: 4, r1: 3.6, width: 1.5, turn: PI / 4, colour: '#ffffff', rim: p.glow });
      else if (frame === 1) sparks({ r0: 1.5, r1: 5.5, width: 1.5, colour: '#ffffff', rim: p.glow });
      else if (frame === 2) sparks({ r0: 4, r1: 7.5, width: 0.4, colour: p.glow });
      else sparks({ r0: 6.8, r1: 8.2, width: 0.4, colour: dim });
    } else if (p.trail) {
      // two motion arcs just outside the tips, opposite each other, going round once per loop: bright at the head, dim behind
      const far = Math.min(R + 4, 13.4);                 // about the pivot, not the wobbling axle: the arcs show the true circle
      for (const k of [0, 1]) {
        const head = PI / 2 - (TAU * t + k * PI);        // an arc is asked for in rig angles, which run the other way round
        g.arc(C, C, far, head + 0.5, head + 1.1, 1, dim);
        g.arc(C, C, far, head, head + 0.5, 1, p.glow);
      }
    }
  },
});
