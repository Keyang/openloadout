// PORT (build item E1, after its first review): the drawing of the code sprite sprites/explosion-large.js (its constants, helpers
// and render), word for word, with its imports pointed at the port shims and at migration batch E2's copies of the
// engine helpers (engine/gen/ports/e2/; engine/rock.js crack at engine/gen/ports/e1/rock.js), so it draws paint refs on
// an engine/gen/port-surface.js grid. It is the drawing of the effect generator effect.explosion-large@1
// (engine/gen/fx-e1-effects.js), which sprites/explosion-large.json names; it goes only with the last version that draws with it.
// Its settings (p) are that generator's arguments; its colours are the paint refs the data file names. A HAND CHANGE
// note says where it differs from its source; never change what a released generator version draws through it.
// The code file's own summary:
// Large explosion: the kit's biggest effect, for barrels and bosses. A white flash, a fireball of
// overlapping lobes that grows to most of the frame, tears open from the middle into a ring, and
// leaves smoke, scrap and falling sparks; `smoke` is the column that keeps rising from the wreck.
// The fireball is the framework's `fireball` (engine/blast.js); the rest is engine/fx.js. This file
// is the timing, the three styles and the sizes.
import { tone } from '../colour.js';
import { lerp, clamp, pulse, PI, TAU } from '../../../motion.js';
import { PALETTE, swatches } from '../e2/palettes.js';
import { steps, glow, ring, particles, shards, puffs, flame } from '../e2/fx.js';
import { fireball } from '../e2/blast.js';

const P = PALETTE.derelict;
const CX = 48, CY = 48;
const EDGE_ROOM = 46;                                    // the farthest anything goes from the middle
// The core sits inside the edge colour, so the two controls never offer the same colour.
const EDGE = swatches('derelict', 'edge', { lead: 'amber' });
const CORE = [P.cream, P.suit, P.skin, P.gold].filter((c) => !EDGE.includes(c));
const SOOT = [P.hull, P.plate, tone(P.plate, -1)];       // dark smoke: its top, its body, its rim
const HAZE = [P.steel, P.panel, P.hull];                 // pale smoke
const SCRAP = P.panel;                                   // the bits of metal thrown out

// How the three styles differ: how far the lobes stand out, how big the fireball is, how hard the sparks fall.
const STYLES = {
  fire: { bulge: 0.7, ball: 1, fall: 16, scrap: 1 },
  plasma: { bulge: 0.12, ball: 0.92, fall: 0, scrap: 0.5 },
  'shock-ring': { bulge: 0.5, ball: 0.7, fall: 8, scrap: 1 },
};

/** Draws one frame of the effect as sprites/explosion-large.js did: g (a PortSurface), { clip, t, frame, p } (p the settings, colours as paint refs). */
export function render(g, { clip, t, frame, p }) {
  const [white, core, mid, edge, rim] = steps(p.edge, { core: p.core });
  const S = STYLES[p.style], n = p.pieces;
  const smokeTones = p.soot ? SOOT : HAZE;

  if (clip === 'smoke') {
    // a loose column of puffs rising from the wreck, with embers, over what is still burning
    const base = CY + 10, top = lerp(36, 46, p.size);
    puffs(g, { t, x: CX, y: base - 4, loop: true, count: p.soot ? 8 : 6, seed: 8, angle: PI + 0.25, arc: lerp(0.1, 0.9, p.spread), dist: top * 0.5, rise: top * 0.5, size: lerp(4, 6.5, p.size) * (p.soot ? 1 : 0.8), lobes: 2, colours: smokeTones });
    particles(g, { t, x: CX, y: base - 2, count: n, seed: 9, angle: PI, arc: lerp(0.5, 1.3, p.spread), dist: top * 0.7, gravity: -5, size: 2.4, wobble: 1.5, lifespan: 0.8, colours: [core, mid, edge, rim] });
    if (p.style === 'fire') flame(g, { t, x: CX, y: base, angle: PI, length: lerp(9, 14, p.size), width: lerp(3.5, 5, p.size), cycles: 2, tongues: [{}, { angle: PI - 0.5, length: lerp(6, 9, p.size), width: 2.5, phase: 0.4, at: [-4, 0] }, { angle: PI + 0.45, length: lerp(5, 8, p.size), width: 2.5, phase: 0.7, at: [4, 0] }], colours: [core, mid, edge, rim] });
    else if (p.style === 'plasma') glow(g, CX, base - 3, lerp(4, 6, p.size) + pulse(2 * t), [core, mid, edge, rim]);
    else { ring(g, { t: (t * 2) % 1, x: CX, y: base - 1, r0: 3, r1: lerp(12, 18, p.size), thick: 2, squash: 0.45, seed: 2, colours: [core, mid, edge, edge, rim] }); glow(g, CX, base - 2, 2.5, [core, edge, rim]); }
    return;
  }

  // ---- burst ----
  const R = lerp(33, 45, p.size) * S.ball;             // the fireball at its biggest
  const wide = lerp(0.8, 1.2, p.spread);
  const after = (t0, t1 = 1) => clamp((t - t0) / (t1 - t0));   // a part of the clip, as its own 0..1

  // smoke, behind the fire: it is there once the fireball tears open, and lingers
  if (frame >= 4) puffs(g, { t: after(0.34), x: CX, y: CY + 2, count: p.soot ? 12 : 7, seed: 3, stagger: 0.35, angle: PI, arc: TAU, dist: R * 0.62 * wide, rise: R * 0.2, size: R * (p.soot ? 0.2 : 0.14), lobes: 2, colours: smokeTones });

  // scrap, thrown out from behind the fire: it tumbles and falls
  if (frame >= 2) shards(g, { t: after(0.16), x: CX, y: CY, count: Math.max(2, Math.round(n * 0.6 * S.scrap)), seed: 4, dist: Math.min(EDGE_ROOM - 6, R * 1.1 * wide), gravity: S.fall * 0.6, size: lerp(10, 14, p.size), spin: 1.2, colour: SCRAP });

  // the shock ring of that style races out ahead of the fire
  if (p.style === 'shock-ring') ring(g, { t: after(0, 0.9), x: CX, y: CY, r0: R * 0.6, r1: EDGE_ROOM, thick: 7, seed: 5, colours: [white, core, mid, edge, rim] });
  if (p.style === 'fire' && frame <= 4) ring(g, { t: after(0, 0.42), x: CX, y: CY, r0: R * 0.74, r1: Math.min(EDGE_ROOM, R * 1.16), thick: 1, seed: 5, colours: [white, core, mid, edge, rim] });
  if (p.style === 'plasma' && frame >= 2) ring(g, { t: after(0.16), x: CX, y: CY, r0: R * 0.92, r1: Math.min(EDGE_ROOM, R * 1.24), thick: 3, seed: 6, colours: [core, mid, edge, edge, rim] });

  // sparks thrown out from under the fireball
  if (frame >= 3) particles(g, { t: after(0.26), x: CX, y: CY, loop: false, count: Math.round(n * 1.5), seed: 7, stagger: 0.25, angle: PI, arc: TAU, dist: Math.min(EDGE_ROOM, R * 1.2 * wide), gravity: S.fall, size: 4.6, colours: [core, mid, edge, edge, rim] });

  // the fire itself
  const ball = (o) => fireball(g, { x: CX, y: CY, lobes: p.lobes, seed: 1, bulge: S.bulge, boil: t * 1.5, ...o });
  const F = lerp(33, 45, p.size);                      // the flash is as big in every style
  if (frame === 0) ball({ r: F * 0.54, bulge: S.bulge * 0.6, band: 2.5, colours: [white, white, core, edge] });
  else if (frame === 1) ball({ r: F * 0.62, band: 2, colours: [white, white, core, edge] });
  else if (frame === 2) ball({ r: R * 0.74, band: R * 0.12, colours: [white, core, mid, edge, rim] });
  else if (frame === 3) ball({ r: R * 0.86, band: R * 0.17, colours: [core, mid, edge, rim] });
  else if (frame === 4) ball({ r: R * 0.94, band: R * 0.21, colours: [core, mid, edge, rim] });
  else if (frame === 5) ball({ r: R, band: R * 0.26, colours: [core, mid, edge, rim] });
  else if (frame === 6) ball({ r: R, hole: R * 0.36, band: R * 0.13, colours: [core, mid, edge, rim] });
  else if (frame === 7) ball({ r: R, hole: R * 0.6, band: R * 0.1, colours: [mid, edge, rim] });
  else if (frame === 8) ball({ r: R, hole: R * 0.8, band: R * 0.06, colours: [mid, edge, rim] });
}
