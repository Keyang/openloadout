// PORT (migration batch E2): the drawing of the code sprite sprites/flames.js (its constants, helpers and render), word for
// word, with its imports pointed at the port shims and at the E2 copies of the engine helpers (engine/gen/ports/e2/), so
// it draws paint refs on an engine/gen/port-surface.js grid. It is the drawing of the effect generator effect.flames@1
// (engine/gen/fx-e2.js), which sprites/flames.json names; it goes only with the last version that draws with it. Its
// settings (p) are that generator's arguments; its colours are the paint refs the data file names. A HAND CHANGE note
// says where it differs from its source; never change what a released generator version draws through it.
import { lerp, wave, clamp, hash, PI } from '../../../motion.js';
import { tone } from '../colour.js';
import { PALETTE } from './palettes.js';
import { steps, flame, particles, puffs, glow } from './fx.js';
import { sparkOrbit } from './bursts.js';

const P = PALETTE.thornwood;
const CX = 16, FOOT = 29.5;                      // the tongues' feet: their lowest pixels sit on row 29, the rim on row 30
const BOX = [1, 1, 31, 31];
// The core sits inside the flame (steps(edge, { core })), so the two lists share no colour.
const CORE = [P.gold, P.cream, P.moss, P.goblin, P.skin];
const EDGE = [P.ember, P.magic, P.crimson, P.thorn, P.hero, PALETTE.derelict.cyan];
const SMOKE = [P.steel, P.stone, P.stone, P.slate];           // a fixed grey: what is left when the fire goes out
// out, frame by frame: how big the flame still is; ignite: how big it has grown (1 = burning)
const SNUFF = [1, 0.62, 0.3, 0.12, 0, 0];
const CATCH = [0, 0.3, 0.7, 1.22, 0.94, 1];

// The tongues for one frame: where each stands, how it leans and how long it is, at loop phase t and `grow` of full size.
function tongues(p, t, grow) {
  const n = p.pieces, wild = p.style === 'wild', magic = p.style === 'magic';
  const H = lerp(12, 21, p.size) * grow;                                  // the tallest tongue
  const spread = lerp(5, 12, p.width) * lerp(0.8, 1.1, p.size) * Math.min(1, 0.4 + grow);
  const half = lerp(2.4, 4, p.width) * lerp(0.85, 1.15, p.size) * (magic ? 0.7 : 1) * Math.min(1, 0.5 + 0.5 * grow);
  const lick = lerp(0.04, 0.17, p.flicker), sway = lerp(0.4, 2, p.flicker) * (wild ? 1.5 : magic ? 0.2 : 1);
  const lean = wild ? -0.32 : 0;                                          // wild fire leans to the right (rig angles: PI is up)
  // tongues stand side by side; the middle ones are the tallest, the outer ones shorter
  const gap = n === 1 ? 0 : (spread / (n - 1)) * (n === 2 ? 0.6 : 1);
  const list = [];
  for (let i = 0; i < n; i++) {
    const dx = (i - (n - 1) / 2) * gap;
    const far = Math.abs(dx) / Math.max(1, spread * 0.5);
    // magic tongues stand straight and thin, each its own height, like a row of candle flames
    const L = Math.min(26, H * (1 - (magic ? 0.3 : 0.38) * far - (magic ? 0.25 : 0.16) * hash(i, 7) * (n > 1)) * (1 + lick * wave(t, 0.31 * i + 0.1)));
    const angle = PI + lean - (magic ? 0 : 0.03 * dx);
    list.push({ angle, length: L, width: half * (1 - 0.2 * far), phase: 0.37 * i, sway, at: [dx, 0] });
    if (wild && L > 7) {
      // wild fire splits: partway up each tongue a second tip tears off and streams with the lean
      const up = L * 0.4;
      list.push({ angle: angle - 0.5, length: L * 0.5, width: half * 0.45, phase: 0.37 * i + 0.5, sway: sway * 0.6, at: [dx + Math.sin(angle) * up, Math.cos(angle) * up] });
    }
  }
  return { list, H, spread };
}

// The whole fire at loop phase t and `grow` of full size, with its sparks and (magic) pluses.
function fire(g, p, t, grow, C, { extras = true } = {}) {
  if (grow <= 0) return;
  const pump = 1 + lerp(0.02, 0.1, p.flicker) * (0.6 * wave(2 * t) + 0.4 * wave(3 * t, 0.3));   // whole cycles: the loop closes
  const { list, H, spread } = tongues(p, t, grow * pump);
  if (extras && p.sparks) particles(g, { t, x: CX, y: FOOT - H * 0.45, count: 4, seed: 4, angle: PI - (p.style === 'wild' ? 0.3 : 0), arc: 0.9, dist: Math.min(H * 0.75, FOOT - H * 0.45 - 3), gravity: -2, size: 2.4, spread: spread * 0.3, wobble: 1.2, lifespan: 0.8, colours: [C[0], C[1], C[2]], box: BOX });
  flame(g, { t, x: CX, y: FOOT, tongues: list, cycles: 1, heat: p.style === 'magic' ? 0.7 : 0.55, colours: C, box: BOX });
  if (extras && p.style === 'magic') sparkOrbit(g, { t, x: CX - 0.5, y: Math.max(7, FOOT - H * 0.7), count: 4, r: spread * 0.5 + 4, rise: 5, squash: 0.6, style: 'plus', reach: 1, share: 0.6, seed: 2, colours: C, box: BOX });
}

// The two embers the fire leaves on the ground (and catches from again): `heat` 1 glowing, 0.5 dull.
function embers(g, C, heat) {
  const hot = heat > 0.75 ? C[0] : C[1];
  for (const x of [CX - 6, CX + 3]) { g.rect(x, 28, 3, 2, C[2]); g.dot(x + 1, 28, hot); g.dot(x, 29, C[3]); g.dot(x + 2, 29, C[3]); }
}

/** Draws one frame of the effect as sprites/flames.js did: g (a PortSurface), { clip, t, frame, p } (p the settings, colours as paint refs). */
export function render(g, { clip, t, frame, p }) {
  // [core, middle, flame, rim]: hottest first; the rim a step darker than steps() makes, so a whole-bundle look cannot merge it with the flame
  const C = steps(p.edge, { core: p.core, white: false }).with(3, tone(p.edge, -1.6));
  if (clip === 'loop') return fire(g, p, t, 1, C);

  if (clip === 'out') {
    // it shrinks down onto two embers, and a wisp of smoke rises from where it was
    const ti = frame * 0.125;
    if (frame >= 2) embers(g, C, frame >= 4 ? 0.5 : 1);
    if (frame >= 2) puffs(g, { t: clamp((frame - 2) / 3), loop: false, x: CX, y: FOOT - 3, count: 3, seed: 3, stagger: 0.35, angle: PI + 0.3, arc: 1, dist: lerp(8, 13, p.size), rise: lerp(4, 8, p.size), size: lerp(1.6, 2.4, p.size), shape: 'wispy', colours: SMOKE, box: BOX });
    fire(g, p, ti, SNUFF[frame], C, { extras: frame === 0 });
    return;
  }

  // ---- ignite: from the two embers it catches with a white flash, flares past full size and settles on the first frame of loop
  const ti = frame >= 5 ? 0 : frame * 0.125;
  if (frame <= 2) embers(g, C, 1);
  fire(g, p, ti, CATCH[frame], C, { extras: frame >= 4 });
  if (frame === 1) glow(g, CX, FOOT - 2, lerp(2.5, 3.5, p.size), steps(p.edge, { core: p.core }), { box: BOX });
  if (frame === 2 || frame === 3) particles(g, { t: (frame - 1) / 3, x: CX, y: FOOT - 3, loop: false, count: 5, seed: 9, stagger: 0.1, angle: PI, arc: 2.2, dist: lerp(8, 12, p.size), gravity: 2, size: 1.8, colours: [C[0], C[1], C[2]], box: BOX });
}
