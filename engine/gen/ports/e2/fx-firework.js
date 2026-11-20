// PORT (migration batch E2): the drawing of the code sprite sprites/firework.js (its constants, helpers and render), word for
// word, with its imports pointed at the port shims and at the E2 copies of the engine helpers (engine/gen/ports/e2/), so
// it draws paint refs on an engine/gen/port-surface.js grid. It is the drawing of the effect generator effect.firework@1
// (engine/gen/fx-e2.js), which sprites/firework.json names; it goes only with the last version that draws with it. Its
// settings (p) are that generator's arguments; its colours are the paint refs the data file names. A HAND CHANGE note
// says where it differs from its source; never change what a released generator version draws through it.
import { lerp, clamp, PI } from '../../../motion.js';
import { tone } from '../colour.js';
import { PALETTE } from './palettes.js';
import { steps, glow, streaks, twinkle } from './fx.js';
import { embers, sparkRing } from './bursts.js';

const P = PALETTE.thornwood;
const X = 32, Y = 30;                                    // the bloom's middle
const BOX = [1, 1, 63, 63];
const OPEN = 5;                                          // launch: the frame the bloom opens on
// The white heart (core) meets both rings, so Core shares no colour with Edge or Inner sparks.
// The inner ring keeps 2 px or more from the outer beads, so Edge and Inner sparks may share colours.
const CORE = [P.cream, P.sky, P.goblin, P.steel, P.skin];
const EDGE = [P.crimson, P.ember, P.magic, P.thorn, P.moss, P.hero, P.gold];
const ACCENT = [P.gold, P.crimson, P.thorn, P.magic, P.moss, P.ember];
const fps = (base) => (p) => base * lerp(0.65, 1.45, p.speed);

// The bloom at phase k (0 = the flash, 1 = the last falling pixels); i: frames since it opened.
function bloom(g, p, k, i, x, y) {
  const n = p.pieces, R = lerp(17, 25, p.size);
  const willow = p.style === 'willow', ring = p.style === 'ring';
  const G = willow ? lerp(12, 15, p.size) : ring ? 5 : 8;                 // px the outer beads fall by the end
  const OUT = steps(p.edge, { white: false }), IN = steps(p.accent, { white: false });
  const rim = OUT.at(-1);
  const r0 = R * (ring ? 0.46 : 0.38), inR = R * 0.3;                                    // where the outer beads start; the inner ring's widest
  const drop = G * k * k;                                                // the inner ring falls with the outer beads
  const outer = (kk, o = {}) => ring
    ? sparkRing(g, { t: kk, x, y: y + G * kk * kk, count: n, r0, r1: R, style: 'dot', reach: 2, seed: 3, colours: OUT, box: BOX, ...o })
    : embers(g, { t: kk, x, y, count: n, r0, r1: R, size: 2, hold: willow ? 0.7 : 0.55, tail: p.trail ? 3 : 0, gravity: G, seed: 3, colours: OUT, box: BOX, ...o });

  // tails: the beads a moment ago, as single pixels in the rim colour (willow's are long and droop)
  if (p.trail && k > 0) {
    const back = willow ? [0.05, 0.1, 0.15, 0.2, 0.25] : [0.04, 0.08, 0.12];
    for (const d of back) if (k - d > 0.02) outer(k - d, ring ? { reach: 0, colours: [rim, rim] } : { hold: 0, colours: [rim, rim] });
  }
  if (i <= 2) glow(g, x, y, [lerp(8, 11, p.size), lerp(5, 7, p.size), 3][i], ['#ffffff', '#ffffff', p.core, tone(p.core, -1)], { box: BOX });
  if (i > 0) sparkRing(g, { t: k, x, y: y + drop, count: Math.max(4, Math.round(n / 2)), r0: 2, r1: inR, style: 'plus', reach: 1, turn: PI / n, seed: 5, colours: IN, box: BOX });
  outer(k);
}

/** Draws one frame of the effect as sprites/firework.js did: g (a PortSurface), { clip, t, frame, p } (p the settings, colours as paint refs). */
export function render(g, { clip, frame, frames, p }) {
  if (clip === 'burst') return bloom(g, p, frame / (frames - 1), frame, X, Y);
  if (frame >= OPEN) return bloom(g, p, (frame - OPEN) / (frames - 1 - OPEN), frame - OPEN, X, Y);
  // launch: the rocket climbs from the bottom to the bloom's middle, slowing as it goes, with a trail of sparks under it
  const k = frame / (OPEN - 1), head = lerp(57, Y + 2, 1 - (1 - k) ** 2);
  const wob = Math.round(Math.sin(frame * 1.7)) * 0.5, tail = Math.min(lerp(11, 17, p.size), 61 - head);
  const hot = [p.core, p.accent, tone(p.accent, -1)];
  const tx = Math.floor(X + wob);
  g.line(tx, Math.floor(head) + 1, tx, Math.floor(head + tail), hot[1]);                           // the trail: hot under the rocket,
  g.line(tx, Math.floor(head) + 1, tx, Math.floor(head + tail * 0.35), hot[0]);                    // cooling further down
  g.dot(tx, Math.floor(head + tail), hot[2]);
  streaks(g, { t: frame / OPEN, x: X + wob, y: head + 2, count: 2, angle: 0, length: tail * 0.5, reach: tail * 0.5, spread: 1, colours: hot, box: BOX });   // sparks falling off it
  twinkle(g, X + wob, head, frame % 2 ? 1 : 0, p.accent, { core: '#ffffff', box: BOX });
}
