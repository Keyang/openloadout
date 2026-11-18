// Sneak gear for the top-down character rig (rigs/topdown.js): what a rogue, a thief or a ninja wears and holds.
// Everything here is drawn and posed for the three directions of that rig and is called from its hooks, the same way
// its own parts are; nothing in rigs/topdown.js was changed for it. Added by batch F01 (rogue-walker).
//
//   scarfTail(g, J, P, d, { kind, length, colour, action, t })   the tail of a scarf as cloth, for the `behind` hook: it
//                                                    narrows from the neck to a forked tip, hangs when the body rests,
//                                                    streams back when it moves, and a wave runs down it (SCARF_FLY says
//                                                    how in each action; SCARF_TAILS how long each kind is; scarfLine()
//                                                    is its centre line, for a part or a test of your own)
//   headCloth(g, J, P, d, { kind, size, colour })    cloth headgear by name, for the `head` hook: hood, bandana or mask
//                                                    (HEAD_CLOTHS), each with the same Size setting; sizedHood is the hood
//   headRise({ headgear, size, hairStyle })          what frame()'s `rise` needs: how far the headgear, or the hair when
//                                                    there is none, stands above the skull
//   blade(g, J, P, d, { weapon, length, hand })      a rogue's weapon by name (BLADES: daggers, short sword, claws), for
//                                                    the `item` hook (hand: 'main') and the `offhand` hook (hand: 'off':
//                                                    the second one of a pair, a tone darker on the far side);
//                                                    bladeSize(weapon, length) is what frame()'s `item` needs
//
//   import * as T from '../rigs/topdown.js';
//   import * as S from '../rigs/topdown-sneak.js';
//   const F = T.frameWith(clip, t, p, { item: S.bladeSize(p.weapon, p.weaponLength), carry: 'low', manner: T.dashManner,
//                                       rise: S.headRise({ headgear: p.headgear, size: p.headgearSize, hairStyle: p.hairStyle }) });
//   F.draw(g, look, {
//     behind(g, J, P, d)  { S.scarfTail(g, J, P, d, { kind: p.scarf, length: p.scarfLength, colour: p.trim, action: F.action, t }); },
//     head(g, J, P, d)    { S.headCloth(g, J, P, d, { kind: p.headgear, size: p.headgearSize, colour: p.outfit }); },
//     offhand(g, J, P, d) { S.blade(g, J, P, d, { weapon: p.weapon, length: p.weaponLength, hand: 'off' }); },
//     item(g, J, P, d)    { S.blade(g, J, P, d, { weapon: p.weapon, length: p.weaponLength, hand: 'main' }); },
//   });
//
// Pure functions: Node and browser, no Math.random. Angles are frame angles: 0 = down the picture, PI/2 = right, PI = up.

import { lerp, clamp, smooth, PI, TAU } from '../engine/motion.js';
import { ramp, tone, brightness } from '../engine/color.js';
import { capsuleIn } from '../engine/surface.js';
import * as T from './topdown.js';

const turnTo = (a, b, k) => a + ((((b - a + PI) % TAU) + TAU) % TAU - PI) * k;      // from angle a towards b by k, the short way round

// ---- the scarf ----------------------------------------------------------------------------------------------

/** The length in pixels of each kind of scarf tail at Length 1: { short, long }. No arguments: a frozen object. */
export const SCARF_TAILS = Object.freeze({ short: 6, long: 12 });

/**
 * How a scarf tail flies in each action: flow (0 hanging to 1 streaming straight back), beats (waves that run down it per loop) and whip (how hard the wave throws it, 1 = a full run).
 * Keys are the rig's actions; `other` is every action not listed. No arguments: a frozen object.
 */
export const SCARF_FLY = Object.freeze({
  idle: Object.freeze({ flow: 0.15, beats: 1, whip: 0.45 }),
  walk: Object.freeze({ flow: 0.55, beats: 2, whip: 0.7 }),
  run: Object.freeze({ flow: 1, beats: 2, whip: 1 }),
  other: Object.freeze({ flow: 0.4, beats: 1, whip: 0.6 }),
});

// where the cloth points, per direction: streaming behind a moving body (out) and at rest (rest)
const SCARF_WAYS = {
  side: { out: -PI / 2 - 0.12, rest: -0.1 },                 // straight back and a touch up; down the back
  down: { out: PI / 2 + 0.15, rest: 0.42 },                  // past one shoulder; down beside the arm, clear of the hand
  up: { out: 0.1, rest: 0.04 },                              // facing away it lies on the back either way
};
const SCARF_STEPS = 8;

/**
 * Works out the centre line of a scarf tail for one frame: where it is tied, where it ends, and how wide it is on the way.
 * J, P, d: what a hook gets. opt: { kind: 'short' | 'long' (SCARF_TAILS), length (a multiplier, 0.65 to 1.35), action (the rig's action, for SCARF_FLY), t (the clip phase, 0..1), flow, beats, whip (each replaces the action's own) }.
 * Returns null for no tail, or { root: [x, y], tip: [x, y], length (pixels along the cloth, shortened when the frame or the ground is in its way), flow, points: [[x, y, halfWidth], ...] from the neck to where it forks, fork: [[x, y], [x, y]] the ends of its two strands }.
 */
export function scarfLine(J, P, d, opt = {}) {
  const { kind = 'long', length = 1, action = 'idle', t = 0 } = opt;
  const full = (SCARF_TAILS[kind] ?? 0) * length;
  if (!(full > 0) || P.lie) return null;
  const fly = SCARF_FLY[action] ?? SCARF_FLY.other;
  const flow = clamp(opt.flow ?? fly.flow), beats = opt.beats ?? fly.beats, whip = opt.whip ?? fly.whip;
  const dir = J.dir, top = J.shoulderY + d.chin, way = SCARF_WAYS[dir];
  const root = dir === 'side' ? [J.neck[0] - d.chestR * 0.6, top + 0.5] : dir === 'up' ? [J.bx + 1, top + 1] : [J.bx + d.chestR - 1, top + 0.5];
  // the cloth leaves the knot pointing away from the neck, then turns to where it settles: down when it hangs, back when it streams
  const settle = turnTo(way.rest, way.out, smooth(flow)), leave = turnTo(settle, way.out, 0.7);
  // a wave runs from the neck to the tip, so each part of the tail follows the one before it; the tip is thrown furthest
  const angle = (k) => turnTo(leave, settle, smooth(k / 0.45)) + whip * (0.16 + 0.5 * k) * Math.sin(TAU * (beats * t - 0.7 * k));
  const line = (L) => {
    const pts = [[root[0], root[1]]];
    for (let i = 0; i < SCARF_STEPS; i++) { const a = angle((i + 0.5) / SCARF_STEPS), [x, y] = pts[i]; pts.push([x + Math.sin(a) * L / SCARF_STEPS, y + Math.cos(a) * L / SCARF_STEPS]); }
    return pts;
  };
  // too long for the room it has: it is drawn shorter
  const fits = (pts) => pts.every(([x, y], i) => !i || (x >= 3.5 && x <= T.SIZE[0] - 3.5 && y >= 3.5 && y <= T.GROUND - 2.5));
  let L = full, pts = line(L);
  while (L > 2 && !fits(pts)) { L -= 1; pts = line(L); }
  // it forks for its last quarter (at least 2.5 px): two strands a pixel wide, one a little shorter than the other
  const forkAt = clamp(1 - Math.max(2.5, 0.27 * L) / L, 0.3, 0.8), at = (k) => { const u = clamp(k) * SCARF_STEPS, i = Math.min(SCARF_STEPS - 1, Math.floor(u)); return [lerp(pts[i][0], pts[i + 1][0], u - i), lerp(pts[i][1], pts[i + 1][1], u - i)]; };
  const points = [];
  for (let i = 0; i <= SCARF_STEPS; i++) { const k = (i / SCARF_STEPS) * forkAt; points.push([...at(k), lerp(1.75, 1, i / SCARF_STEPS)]); }
  const tip = at(1), a1 = angle(1), nx = Math.cos(a1), ny = -Math.sin(a1), short = at(1 - 1.2 / L);
  const fork = [[tip[0] + nx, tip[1] + ny], [short[0] - nx, short[1] - ny]];
  return { root, tip, length: L, flow, points, fork };
}

/**
 * Draws the tail of a scarf as cloth, for the `behind` hook: it narrows from the neck to a forked tip, hangs when the body rests, streams back when it moves (left facing sideways, past one shoulder facing down, down the back facing away), and a wave runs down it.
 * J, P, d: what the hook gets. opt: { colour, kind: 'short' | 'long' | 'none' (SCARF_TAILS), length (a multiplier, 0.65 to 1.35), action (the frame's action: SCARF_FLY says how it flies in each), t (the clip phase, 0..1), flow, beats, whip (each replaces the action's own) }.
 * Never leaves the frame or goes under the ground line; draws nothing for 'none' and while the body lies down. Returns scarfLine()'s answer.
 */
export function scarfTail(g, J, P, d, opt = {}) {
  const S = scarfLine(J, P, d, opt);
  if (!S) return null;
  const colour = opt.colour ?? '#5a5f7a', c = ramp(colour), parts = [], last = S.points[S.points.length - 1];
  for (let i = 0; i + 1 < S.points.length; i++) { const [x0, y0, r0] = S.points[i], [x1, y1, r1] = S.points[i + 1]; parts.push(capsuleIn(x0, y0, x1, y1, r0, r1)); }
  for (const [x, y] of S.fork) parts.push(capsuleIn(last[0], last[1], x, y, 0.75, 0.55));
  const xs = [...S.points, ...S.fork].map((q) => q[0]), ys = [...S.points, ...S.fork].map((q) => q[1]);
  const keep = (px, py) => px > 2 && px < T.SIZE[0] - 2 && py > 2 && py < T.GROUND - 1;
  // a dark cloth carries its form with its light and base tones (its shadow tone is as dark as the outline): style guide section 3, rule 4
  const paint = brightness(colour) < 0.4 ? { isRamp: true, light: c.light, base: c.light, dark: c.base, deep: c.dark } : c;
  g.fill(Math.min(...xs) - 3, Math.min(...ys) - 3, Math.max(...xs) + 3, Math.max(...ys) + 3, (px, py) => keep(px, py) && parts.some((s) => s(px, py)), paint);
  return S;
}

// ---- cloth headgear -----------------------------------------------------------------------------------------

/** The cloth headgear headCloth() draws, by name: hood, bandana, mask. No arguments: a frozen list. */
export const HEAD_CLOTHS = Object.freeze(['hood', 'bandana', 'mask']);

/** Draws a hood with a Size setting, for the `head` hook (set look.hairStyle 'bald' or look.hatted): small is pushed back off the face, big is pulled low over the brow. opt: { colour, size (0.5 to 1.8; 1 = the brow just covered) }. */
export function sizedHood(g, J, P, d, opt = {}) {
  const { colour, size = 1 } = opt;
  T.hood(g, J, P, d, { ...(colour ? { colour } : {}), depth: lerp(0, 2, clamp((size - 0.5) / 1.3)) });
}

/** Draws cloth headgear by name, for the `head` hook: a hood (sizedHood), a bandana or a mask, each with the same Size setting; any other name draws nothing. opt: { kind: one of HEAD_CLOTHS, size (0.5 to 1.8), colour }. */
export function headCloth(g, J, P, d, opt = {}) {
  const { kind, size = 1, colour } = opt, o = { size, ...(colour ? { colour } : {}) };
  if (kind === 'hood') sizedHood(g, J, P, d, o);
  else if (kind === 'bandana') T.bandana(g, J, P, d, o);
  else if (kind === 'mask') T.mask(g, J, P, d, o);
}

/** Returns how far a head stands above its skull, in pixels, for frame()'s `rise`: the headgear's rise (headgearRise()) when one is worn that hides the hair, otherwise the hair's own (spiky hair stands 3 px up). opt: { headgear (a kind headgearRise() knows, or anything else for none), size (its Size setting), hairStyle (one of HAIR_STYLES) }. */
export function headRise(opt = {}) {
  const { headgear, size = 1, hairStyle } = opt;
  const worn = T.headgearRise(headgear, size);
  return worn > 0 ? worn : hairStyle === 'spiky' ? 3 : 0;
}

// ---- blades -------------------------------------------------------------------------------------------------

/** What each rogue's weapon is on the rig, by name: { kind (the held kind smallItem() draws), scale (its size against the rig's standard), pair (one in each hand) } for daggers, short sword and claws. No arguments: a frozen object. */
export const BLADES = Object.freeze({
  daggers: Object.freeze({ kind: 'dagger', scale: 1, pair: true }),
  'short sword': Object.freeze({ kind: 'sword', scale: 0.85, pair: false }),
  claws: Object.freeze({ kind: 'claws', scale: 1, pair: true }),
});

/** Returns the size { length, back, pad } of a rogue's weapon for frame()'s `item`, or null for a name BLADES does not have ('none'). weapon: a key of BLADES; length: its Length setting (1 = standard). */
export const bladeSize = (weapon, length = 1) => (BLADES[weapon] ? T.smallItemSize(BLADES[weapon].kind, BLADES[weapon].scale * length) : null);

/**
 * Draws a rogue's weapon in one hand, for the `item` hook (hand: 'main') or the `offhand` hook (hand: 'off'): the off hand holds the second one of a pair and nothing otherwise, and facing sideways that far one is a tone darker.
 * J, P, d: what the hook gets. opt: { weapon (a key of BLADES; anything else draws nothing), length (its Length setting), hand: 'main' | 'off', metal, hilt (colours) }.
 */
export function blade(g, J, P, d, opt = {}) {
  const { weapon, length = 1, hand = 'main', metal = '#c2c9d6', hilt = '#f2c230' } = opt;
  const held = BLADES[weapon], off = hand === 'off';
  if (!held || (off && !held.pair)) return;
  const at = off ? T.offGrip(J, P) : T.sockets(J, P, d).hand;
  T.smallItem(g, J.dir, at, { kind: held.kind, length: bladeSize(weapon, length).length, metal: off && J.dir === 'side' ? tone(metal, -1) : metal, hilt });
}
