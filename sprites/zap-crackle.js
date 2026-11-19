// Electric crackle: electricity crawling over a stunned machine or a shocked fighter. `loop` is short
// jagged arcs that jump to a new place on every frame (seeded by the frame, so the loop closes), with
// twinkles where they touch; `burst` is one bright zap across the frame that breaks up while a ring
// of sparks flies out. The arcs are the framework's lightning (engine/spells.js `bolt`), the sparks
// engine/bursts.js and engine/fx.js; this file is where they go and when.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, hash, clamp, TAU, PI } from '../engine/motion.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { steps, twinkle, ring } from '../engine/fx.js';
import { bolt } from '../engine/spells.js';
import { sparkMark, sparkRing } from '../engine/bursts.js';

const P = PALETTE.thornwood;
const M = 15.5;                                          // the middle, on a pixel centre
// The core runs inside each arc, so the two controls never offer the same colour.
const EDGE = [...swatches('thornwood', 'glow', { lead: 'magic' }), PALETTE.derelict.cyan];
const CORE = [P.cream, P.sky, P.goblin, P.steel, P.skin].filter((c) => !EDGE.includes(c));

export default defineSprite({
  id: 'zap-crackle',
  name: 'Electric crackle',
  kind: 'Effect',
  blurb: 'Electricity crackling over something shocked, or one bright zap with a ring of sparks. Change its size, the arcs, their style and forks, the flicker and colours.',
  meta: { type: 'effect', role: 'effects/spark', themes: ['neutral', 'sci-fi', 'fantasy'], gameTypes: ['shooter', 'roguelike-action', 'turn-based-rpg', 'platformer'], view: 'none',
    words: ['electric', 'electricity', 'shock', 'zap', 'spark', 'lightning', 'stun', 'shocked', 'static', 'short circuit', 'crackle', 'energy'], license: 'draft' },
  size: [32, 32],
  pivot: [16, 16],
  grounded: false,
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    pieces: range('Arcs', 3, { min: 2, max: 5, step: 1, lo: 'Few', hi: 'Many' }),
    style: choice('Style', 'arcs', ['arcs', 'sparks', 'ring']),
    forks: toggle('Forks', false, { when: { style: ['arcs'] } }),
    core: color('Core', P.cream, CORE),
    edge: color('Light', P.magic, EDGE),
    flicker: range('Flicker', 0.5, { lo: 'Steady', hi: 'Wild', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    loop: { label: 'Shocked', frames: 8, fps: (p) => 10 * lerp(0.65, 1.45, p.speed), loop: true },
    burst: { label: 'Zap', frames: 6, fps: (p) => 16 * lerp(0.65, 1.45, p.speed), loop: false },
  },
  sounds: { burst: [{ sound: 'thunder-crack', preset: 'Small spark', frame: 0, volume: 0.8 }] },
  versions: [
    { name: 'Shocked', params: {} },
    { name: 'Overcharged', params: { size: 1, pieces: 5, forks: true } },
    { name: 'Static', params: { style: 'sparks', edge: P.gold } },
    { name: 'Short circuit', params: { style: 'ring', edge: P.crimson } },
    { name: 'Faint buzz', params: { size: 0, pieces: 2, flicker: 0 } },
  ],

  render(g, { clip, t, frame, p }) {
    const C = steps(p.edge, { core: p.core });           // [white, core, middle, edge, rim]
    const [white, core, mid, edge, rim] = C;
    const R = lerp(9, 13.5, p.size);                     // how far from the middle the crackle reaches
    const n = p.pieces;
    const jag = lerp(1.8, 3.6, p.flicker);                 // how far each corner of an arc steps aside
    const arc = (o) => bolt(g, { kinks: 3, zigzag: jag, ...o });
    const at = (a, r) => [M + Math.sin(a) * r, M + Math.cos(a) * r];

    if (clip === 'burst') {
      // one zap across the frame, low left to high right, breaking up from its ends; sparks fly out in a ring
      const L = lerp(11, 14, p.size), tilt = 0.3;
      const [x0, y0] = [M - L * Math.cos(tilt), M + L * Math.sin(tilt)], [x1, y1] = [M + L * Math.cos(tilt), M - L * Math.sin(tilt)];
      const zap = { x0, y0, x1, y1, kinks: 5, zigzag: lerp(2.5, 4, p.flicker), seed: 3, forks: p.style === 'arcs' && p.forks ? 2 : 0, forkLength: 0.28 };
      const style = p.style === 'sparks' ? 'diamond' : 'plus';
      const sparks = { t: clamp(t * 1.15), x: M, y: M, count: n * 2, r0: 3, r1: R, style, reach: p.size > 0.5 && style === 'plus' ? 3 : 2, turn: 0.4, seed: 2, colours: [core, edge, rim] };
      if (frame === 0) {
        arc({ ...zap, width: lerp(2.6, 3.4, p.size), colours: [white, core, edge, rim] });
      } else if (frame === 1) {
        arc({ ...zap, width: 1.6, colours: [core, edge, rim] });
        sparkRing(g, sparks);
      } else if (frame === 2) {
        arc({ ...zap, width: 1, from: 0.12, to: 0.88, colours: [core, rim] });
        sparkRing(g, sparks);
      } else {
        if (frame === 3) for (const [a, b] of [[0.2, 0.36], [0.6, 0.78]]) arc({ ...zap, width: 1, from: a, to: b, colours: [edge, rim] });
        sparkRing(g, sparks);
      }
      if (p.style === 'ring' && frame >= 1) ring(g, { t: (frame - 1) / 4, x: M, y: M, r0: 4, r1: R + 0.5, thick: 2, seed: 5, colours: C.slice(1) });
      return;
    }

    // ---- loop: everything jumps to a new place every frame ----
    const f = frame;
    const h = (i, ch) => hash(i + 16 * f, 97 + ch);
    if (p.style === 'ring') {
      // a crackling ring round the thing, broken into `n` arcs that move round it from frame to frame
      const rr = R - 2, spin = h(0, 1);
      for (let i = 0; i < n; i++) {
        const a0 = TAU * ((i + 0.15 + 0.2 * h(i, 2)) / n + spin), a1 = a0 + TAU * (0.6 + 0.15 * h(i, 3)) / n;
        const pts = [];
        for (let k = 0; k <= 4; k++) pts.push(at(lerp(a0, a1, k / 4), rr + (k % 4 ? (h(i * 5 + k, 4) - 0.5) * 2 * jag : 0)));
        arc({ path: pts, width: 1, colours: [core, edge] });
        const [ex, ey] = at(a1, rr);
        twinkle(g, ex, ey, h(i, 5) < p.flicker ? 2 : 1, edge, { core: white });
      }
      return;
    }
    if (p.style === 'sparks') {
      // a fizz of small sparks with tiny kinked ticks between some of them
      for (let i = 0; i < n * 2; i++) {
        const a = TAU * (i / (n * 2) + h(i, 1)), r = R * (0.25 + 0.7 * h(i, 2));
        const [x, y] = at(a, r);
        if (i % 2) sparkMark(g, x, y, h(i, 3) < 0.4 + 0.4 * p.flicker ? 2 : 1, 'plus', [core, edge, rim]);
        else {
          const b = a + PI / 2 + (h(i, 4) - 0.5) * 2, len = lerp(3, 5, p.size);
          arc({ x0: x, y0: y, x1: x + Math.sin(b) * len, y1: y + Math.cos(b) * len, kinks: 1, zigzag: jag * 0.8, width: 1, seed: i + 8 * f, colours: [core, rim] });
          twinkle(g, x, y, 0, white);
        }
      }
      return;
    }
    // arcs: from near the middle out to where they touch, each a different way every frame
    for (let i = 0; i < n; i++) {
      const a0 = TAU * ((i + 0.6 * h(i, 1)) / n), a1 = a0 + (h(i, 2) - 0.5) * 1.4;
      const [x0, y0] = at(a0, R * (0.08 + 0.25 * h(i, 3))), [x1, y1] = at(a1, R * (0.78 + 0.22 * h(i, 4)));
      const len = Math.hypot(x1 - x0, y1 - y0);          // a short arc gets fewer, smaller kinks, so it stays a line
      arc({ x0, y0, x1, y1, kinks: Math.max(2, Math.round(len / 3.2)), zigzag: Math.min(jag, len / 4), width: 1, seed: i + 8 * f, forks: p.forks ? 1 : 0, forkLength: 0.4, forkAngle: 1.1, colours: [core, edge] });
      twinkle(g, x1, y1, h(i, 5) < p.flicker ? 2 : 1, edge, { core: white });
    }
  },
});
