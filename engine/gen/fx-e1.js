// Effect behaviours of build item E1 (docs/data-sprites.md 2.5c and 3.3, family "fx"): what the library's hits, blasts
// and spells need beyond B12 and B12c to be redrawn as data. Two kinds:
//   - B12c behaviours whose clip keys follow a slider: a keyable `scale` (as glow@1 has) times their size, so one
//     emitter grows and shrinks through a clip at any size, and (blast.grow) a keyable `cool` that drops its hottest
//     paints frame by frame (as starburst@1 and glow@1 have). Each draws the behaviour it extends where they overlap.
//     They are new ids, not new versions, so the library sprites that name the old ones (fireball, plasma-orb, ...)
//     still name the newest version of what they use.
//       blast.grow@1   blast.ball@1 with scale, a hole as a share of its radius, and cool
//       beam.lift@1    beam@1 with scale (its height), across (its width), and its foot lifted off the row (lift, reach)
//       flame.grow@1   flame@1 with tall (its tongues' length) and wide (their width, spread and head)
//       bolt.grow@1    bolt@1 with thin (its width), forks keyed by their length, and cool
//   - ports of the engine helpers those effects drew with that no generator had yet, pixel for pixel:
//       crescent@1     engine/spells.js crescent   a curved blade of light, tapered at both ends, that sweeps and thins
//       spike.fan@1    engine/blast.js spikesIn    a fan of pointed prongs from a point, with a round flash on it: a muzzle flash
//       floor.ring@1   engine/fx-floor.js floorRing   a ring of light lying on the floor, round or many-sided, whole or broken
//       rift@1         engine/fx-floor.js riftIn and lightShape   a jagged tear of light that gapes and closes
// Angles are degrees (rig convention: 0 down, 90 right, 180 up). Shared rules: engine/gen/fx-common.js. Pure: no
// randomness but `seed` through engine/motion.js hash, no clock, no DOM; runs the same in the browser and Node.
import { defineGenerator } from './registry.js';
import { point, px, count, share, seed, flag, angle, paints } from './args.js';
import { areaOf, charge, boxPixels, areaArg, boxOf, boxIn, emptyBox, gridOf, layered, innerOf, leafIn, clipOf } from './fx-common.js';
import { hash, fract, clamp, lerp, PI, TAU } from '../motion.js';

const RAD = PI / 180;
import { blastBall, flame } from './fx-fire.js';
import { beam } from './fx-glints.js';
import { bolt } from './fx-spells.js';

/** The paints left when the hottest `cool` of them have gone (rounded); the last (the rim) always stays. */
const cooled = (list, cool) => list.slice(Math.min(list.length - 1, Math.max(0, Math.round(cool))));

// ---- blast.grow@1 --------------------------------------------------------------------------------------------------

/**
 * blast.grow@1: blast.ball@1 whose keys follow a Size slider: it draws at `r` times `scale` (keys swell and shrink the
 * ball while r follows the slider), its empty middle `hole` a share of that radius (so an opening ring stays in
 * proportion), and `cool` drops its hottest paints (the rim stays), so one emitter can flash, boil, open and cool
 * through a clip. Draws blast.ball@1 at r x scale, hole x r x scale and the paints left.
 */
export const blastBall2 = defineGenerator({
  id: 'blast.grow', v: 1, family: 'fx',
  about: 'A cartoon blast that swells, opens into a broken ring and cools as keys say, at any size: a scalloped or spiked ball in nested hot tones.',
  args: {
    at: point({ about: 'The middle of the blast' }),
    r: px(0, 160, { default: 8, about: 'The radius to the tips of its edge at scale 1' }),
    scale: px(0, 4, { default: 1, about: 'Times the radius: keys swell or shrink the ball while r follows a slider' }),
    hole: share({ default: 0, about: 'Its empty middle, as a share of its radius (0: a ball)' }),
    bumps: count(0, 32, { default: 7, about: 'How many scallops or spikes round its edge' }),
    bump: px(0, 0.6, { default: 0.15, about: 'How deep they are, as a share of r (0: a plain disc)' }),
    points: flag({ default: false, about: 'Straight spikes, a star (off: round scallops)' }),
    turn: angle({ default: 0, about: 'Turns its edge, in degrees, so it can boil from frame to frame' }),
    heat: share({ default: 0.5, about: 'How far the hot paints reach' }),
    gaps: share({ default: 0, about: 'A ring only: the share of it broken away, as it thins out' }),
    cool: px(0, 7, { default: 0, about: 'How many of the hottest paints it has lost (rounded; the rim always stays): keys cool it frame by frame' }),
    seed: seed({ default: 0, about: 'Where a ring breaks' }),
    paints: paints(8, { about: 'Hottest first; the last is the rim round it' }),
    area: areaArg(),
  },
  keyable: ['r', 'scale', 'hole', 'bump', 'turn', 'heat', 'gaps', 'cool'],
  // blast.ball@1's price at the radius it draws
  cost: (a) => { const side = 2 * a.r * a.scale + 5; return charge(side, side, 20 * areaOf(side, side)); },
  run(a, ctx) {
    const r = a.r * a.scale;
    return blastBall.run({ ...a, r, hole: a.hole * r, paints: cooled(a.paints, a.cool) }, ctx);
  },
});

// ---- beam.lift@1 --------------------------------------------------------------------------------------------------------

/** The width and height beam.lift@1 draws at: its width x across and its height x scale. */
const beamSize = (a) => [Math.max(1, a.width * a.across), a.height * a.scale];

/**
 * beam.lift@1: beam@1 whose keys follow a slider: it is `height` x `scale` px tall and `width` x `across` px wide (keys narrow
 * it or let it grow while the sliders set its full size), and its foot can leave the row: `lift` (a share of its full
 * height) raises the foot, `reach` (a share) lowers the top, so a column can lift off the floor and rise away, or come
 * down onto it. Draws beam@1 with its foot `lift` of its height above `at` and as tall as is left up to `reach`.
 */
export const beam2 = defineGenerator({
  id: 'beam.lift', v: 1, family: 'fx',
  about: 'A column of light rising from a row, solid at its foot and breaking into rising dashes, that keys can narrow, shorten and lift off the row: a teleporter or a heal.',
  args: {
    at: point({ about: 'Its middle across, and the row just under its foot' }),
    width: px(1, 64, { default: 4, about: 'Pixels across at across 1' }),
    height: px(0, 360, { default: 12, about: 'Pixels tall at scale 1' }),
    across: px(0, 4, { default: 1, about: 'Times the width: keys narrow it while width follows a slider' }),
    scale: px(0, 4, { default: 1, about: 'Times the height: keys shorten it while height follows a slider' }),
    lift: share({ default: 0, about: 'How far its foot has left the row, as a share of its height' }),
    reach: share({ default: 1, about: 'Where its top is, as a share of its height' }),
    dash: px(0, 64, { default: 2, about: 'Pixels lit in each dash above the solid foot' }),
    gap: px(0, 64, { default: 2, about: 'Pixels unlit between dashes (0: unbroken)' }),
    solid: share({ default: 0.4, about: 'The share of its height that is unbroken, from the foot' }),
    phase: px(0, 8, { default: 0, about: 'Steps the dashes have moved up (keys move it)' }),
    cycles: count(0, 8, { default: 0, about: 'Steps the dashes move up per loop of the clip' }),
    seed: seed({ default: 0, about: 'The columns\' heights and where their dashes start' }),
    paints: paints(8, { about: 'Hottest (the middle of its foot) first' }),
  },
  keyable: ['height', 'scale', 'across', 'lift', 'reach', 'solid', 'phase'],
  // beam@1's price at its full size (lift and reach only take rows away)
  cost: (a) => { const [w0, h] = beamSize(a), w = w0 + 3, hh = h + 3; return charge(w, hh, (Math.round(w0) + 1) * (h + 1) + 3 * areaOf(w, hh)); },
  run(a, ctx) {
    const [w, H] = beamSize(a);
    const foot = Math.round(H * a.lift), top = Math.round(H * a.reach);
    if (top - foot < 1) return [];
    return beam.run({ ...a, at: [a.at[0], a.at[1] - foot], width: w, height: top - foot }, ctx);
  },
});

// ---- flame.grow@1 -------------------------------------------------------------------------------------------------------

/** flame@1's arguments as flame.grow@1 draws them: its length times tall, its width, spread and head times wide. */
const flameScaled = (a) => ({ ...a, length: a.length * a.tall, width: a.width * a.wide, spread: a.spread * a.wide, head: a.head * a.wide });
/** How far from `at` a flame.grow@1's pixels can reach (flame@1's reach at its scaled arguments): its head, spread, longest tongue, width, sway and a margin. */
const flameReach2 = (a) => { const b = flameScaled(a); return 1.3 * b.head + b.spread + b.length + 1.15 * b.width + b.sway + 5; };

/**
 * flame.grow@1: flame@1 whose keys follow sliders: its tongues are `length` x `tall` long, and `width`, `spread` and `head`
 * x `wide` across, so a fire can erupt, hold and fall through a clip while Height and Size set its full size (keys
 * scale it down from what the emitter sets). Draws flame@1 at the scaled arguments.
 */
export const flame2 = defineGenerator({
  id: 'flame.grow', v: 1, family: 'fx',
  about: 'A flame in nested layers of fire licking from a point, that keys can make taller, shorter, wider or narrower at any size: an eruption, a torch, a fireball.',
  args: {
    at: point({ about: 'The foot of the flame (the middle of its head, when it has one)' }),
    head: px(0, 64, { default: 0, about: 'The radius of a round head the tongues stream from (0: none, a torch flame)' }),
    angle: angle({ default: 180, about: 'The way the main tongue streams: 180 up, -90 left, 90 right' }),
    length: px(0, 128, { default: 12, about: 'How long the main tongue is at tall 1' }),
    width: px(0, 32, { default: 4, about: 'Half the main tongue\'s width at its widest, at wide 1' }),
    tall: px(0, 2, { default: 1, about: 'Times the tongues\' length: keys grow and shrink the fire while length follows a slider' }),
    wide: px(0, 2, { default: 1, about: 'Times their width, how far they spread and the head: keys widen or narrow it' }),
    sway: px(0, 16, { default: 1.5, about: 'How far a tongue\'s tip ripples sideways' }),
    cycles: count(1, 8, { default: 1, about: 'Ripples per loop of the clip' }),
    heat: share({ default: 0.5, about: 'How far the hotter layers reach into the flame' }),
    tongues: count(1, 9, { default: 1, about: 'How many tongues: the main one and licks on alternate sides of it' }),
    fan: angle({ default: 30, about: 'How far the outermost licks lean out from the main one, in degrees (below 0: in)' }),
    spread: px(0, 64, { default: 0, about: 'How far across from the main tongue\'s foot the outermost licks stand, at wide 1' }),
    shorten: share({ default: 0.3, about: 'How much shorter the outermost licks are' }),
    slim: share({ default: 0.4, about: 'How much narrower the outermost licks are' }),
    paints: paints(8, { about: 'Hottest first; the last is the 1 px rim' }),
    area: areaArg(),
  },
  keyable: ['length', 'width', 'tall', 'wide', 'sway', 'head', 'spread', 'angle', 'fan', 'heat', 'shorten', 'slim'],
  // flame@1's price at the arguments it draws with
  cost: (a) => { const side = 2 * flameReach2(a) + 2; return charge(side, side, Math.max(1, a.paints.length - 1) * (8 * a.tongues + 12) * areaOf(side, side)); },
  run(a, ctx) {
    return flame.run(flameScaled(a), ctx);
  },
});

// ---- bolt.grow@1 ---------------------------------------------------------------------------------------------------

/** The side of the square box a bolt.grow@1 lies in (bolt@1's at its full width and fork length): its length and twice its margin. */
const strikeSide = (a) => a.length + 2 * (a.sway + 1.6 * a.zigzag + a.length * a.forkLength + a.width / 2 + 4) + 2;

/**
 * bolt.grow@1: bolt@1 whose keys can change it from frame to frame through a strike: `thin` (a share) narrows it from
 * `width`, `forkLength` keyed down to 0 hides its forks, and `cool` drops its hottest paints (the rim stays), so one
 * emitter is the leader, the white flash, the bolt with its forks, its flicker and what is left of the channel. Draws
 * bolt@1 at width x thin and the paints left.
 */
export const boltGrow = defineGenerator({
  id: 'bolt.grow', v: 1, family: 'fx',
  about: 'A jagged lightning bolt in nested layers of light, with forks, that keys thin, cool and strip of its forks through a strike.',
  args: {
    at: point({ about: 'Where the bolt starts' }),
    length: px(0, 640, { default: 32, about: 'How far it reaches, in pixels' }),
    angle: angle({ default: 0, about: 'The way it strikes: 0 down, 90 right, 180 up' }),
    kinks: count(0, 16, { default: 6, about: 'Corners between its ends' }),
    zigzag: px(0, 32, { default: 3, about: 'Pixels each corner steps off the line, to alternate sides' }),
    sway: px(0, 64, { default: 0, about: 'Pixels the whole path wanders in a slow bend' }),
    width: px(1, 16, { default: 3, about: 'Pixels thick at thin 1' }),
    thin: share({ default: 1, about: 'Its width as a share of width (never under 1 px): keys thin it' }),
    lead: share({ default: 1, about: 'How far down it has reached, 0 to 1 (a leader creeping down)' }),
    fade: share({ default: 0, about: 'The share gone from its start, as it fades away' }),
    taper: share({ default: 0, about: 'How much it thins towards its far end' }),
    forks: count(0, 8, { default: 0, about: 'How many forks leave its corners' }),
    forkLength: share({ default: 0.3, about: 'A fork\'s length, as a share of the bolt\'s: keys shorten or hide them' }),
    forkAngle: angle({ default: 40, about: 'How far a fork turns off the bolt\'s way, in degrees' }),
    cool: px(0, 7, { default: 0, about: 'How many of the hottest paints it has lost (rounded; the rim always stays): keys cool it frame by frame' }),
    seed: seed({ default: 0, about: 'Which path' }),
    paints: paints(8, { about: 'Hottest (its core) first; the last is the rim' }),
    area: areaArg(),
  },
  keyable: ['thin', 'lead', 'fade', 'taper', 'forkLength', 'cool'],
  // bolt@1's price at its full width and fork length
  cost: (a) => { const side = strikeSide(a), pieces = Math.round(a.kinks) + 2 + 6 * a.forks; return charge(side, side, (pieces + 8 * a.paints.length) * areaOf(side, side) + 4 * (side + 2) * (1 + a.forks)); },
  run(a, ctx) {
    return bolt.run({ ...a, width: Math.max(1, a.width * clamp(a.thin)), paints: cooled(a.paints, a.cool), flicker: 0 }, ctx);
  },
});

// ---- crescent@1 ----------------------------------------------------------------------------------------------------

/** The ends of a crescent@1 stroke: `length` px through `at` along `angle`, moved `off` px across it (to its left). */
function strokeEnds(a, len, off) {
  const A = a.angle * RAD, ux = Math.sin(A), uy = Math.cos(A), h = (a.length * len) / 2;
  const cx = a.at[0] - uy * off, cy = a.at[1] + ux * off;
  return [cx - ux * h, cy - uy * h, cx + ux * h, cy + uy * h];
}
/** The circle a stroke lies on: { cx, cy, R, a0, A, turn } (A its angle in radians), or null when its ends meet (engine/spells.js crescent). */
function crescentArc(x0, y0, x1, y1, bulge) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
  if (L < 1) return null;
  const side = bulge < 0 ? -1 : 1, s = clamp(Math.abs(bulge), 0.6, L / 2);
  const R = (L * L / 4 + s * s) / (2 * s);
  const nx = (side * dy) / L, ny = (-side * dx) / L;
  const cx = (x0 + x1) / 2 - nx * (R - s), cy = (y0 + y1) / 2 - ny * (R - s);
  const a0 = Math.atan2(y0 - cy, x0 - cx), A = 2 * Math.asin(Math.min(1, L / (2 * R)));
  const turn = Math.sign((x0 - cx) * (y1 - cy) - (y0 - cy) * (x1 - cx)) || 1;
  return { cx, cy, R, a0, A, turn };
}
/** How far a crescent@1's pixels can lie from its middle `at`: half its length, its bow, its outermost claw, its band and barbs, and a margin. */
const crescentReach = (a) => a.length / 2 + a.bulge + a.gap * Math.floor(a.claws / 2) + a.width + 1.5 * a.jag + 4;
/** The strokes of a crescent@1: [off, length share, width share], the middle one first, then its claws in pairs, left then right. */
function strokesOf(a) {
  const n = Math.max(1, Math.round(a.claws)), out = [];
  for (let i = 1; i < n; i++) { const rank = Math.ceil(i / 2); out.push([(i % 2 ? -1 : 1) * a.gap * rank, 1 - 0.17 * rank, 0.87]); }
  out.push([0, 1, 1]);   // the middle stroke last, so it reads in front (engine/spells.js order in fx-slash's claw)
  return out;
}

/**
 * crescent@1: a curved blade of light `length` px long through `at` along `angle` (0 down, 90 right), bowing `bulge` px
 * to its left (`flip`: its right), `width` px across at its widest (`head` of the way along) and tapering to points at
 * both ends, painted in nested `paints` (hottest inside, the last its 1 px rim); `jag` px of barbs (`teeth` of them)
 * rag its edges, and `claws` 2 to 5 add strokes beside it, `gap` px apart, a little shorter and thinner: a claw mark.
 * Only the part from `start` to `end` (shares of the way) is drawn, so keys sweep it in and let its tail go first; `thin`
 * narrows it and `cool` drops its hottest paints (the rim stays). Port of engine/spells.js crescent (x0..x1 its ends,
 * from start, to end, width width x thin; each claw another crescent beside it), pixel for pixel.
 */
export const crescent = defineGenerator({
  id: 'crescent', v: 1, family: 'fx',
  about: 'A curved blade of light, pointed at both ends, that sweeps in, thins and cools: a sword slash, a claw mark or a parry arc.',
  args: {
    at: point({ about: 'The middle of the blade (of the straight line between its ends)' }),
    length: px(0, 320, { default: 24, about: 'How far apart its ends are, in pixels' }),
    angle: angle({ default: 0, about: 'The way it runs from its start to its end: 0 down, 90 right, 180 up' }),
    bulge: px(0, 160, { default: 6, about: 'How far its middle bows off the straight line, in pixels' }),
    flip: flag({ default: false, about: 'Bow to the right of the way it runs (off: to its left)' }),
    width: px(0, 32, { default: 5, about: 'Pixels across at its widest' }),
    thin: share({ default: 1, about: 'Its width as a share of width: keys thin it frame by frame' }),
    start: share({ default: 0, about: 'Where the drawn part starts, as a share of the way: keys let its tail go' }),
    end: share({ default: 1, about: 'Where the drawn part ends, as a share of the way: keys sweep it in' }),
    head: share({ default: 0.65, about: 'Where along it is widest (0.2 to 0.9)' }),
    jag: px(0, 8, { default: 0, about: 'Pixels of barbs on its outside and its inside (0: smooth)' }),
    teeth: count(1, 32, { default: 7, about: 'How many barbs along it' }),
    claws: count(1, 5, { default: 1, about: 'How many strokes side by side: 1 a blade, 3 a claw mark' }),
    gap: px(0, 32, { default: 6, about: 'Pixels between the middles of strokes side by side' }),
    cool: px(0, 7, { default: 0, about: 'How many of the hottest paints it has lost (rounded; the rim always stays): keys cool it frame by frame' }),
    seed: seed({ default: 0, about: 'Where the barbs fall' }),
    paints: paints(8, { about: 'Hottest (its middle) first; the last is the 1 px rim' }),
    area: areaArg(),
  },
  keyable: ['thin', 'start', 'end', 'cool'],
  // every pixel of its box tested against its circle, and the layers' passes over that box, for each stroke
  cost: (a) => { const side = 2 * crescentReach(a) + 2; return charge(side, side, Math.max(1, Math.round(a.claws)) * (2 + 6 * a.paints.length) * areaOf(side, side)); },
  run(a, ctx) {
    const C = cooled(a.paints, a.cool), from = clamp(a.start), to = clamp(a.end);
    if (to <= from) return [];
    const B = boxOf(ctx, a.area), e = crescentReach(a);
    const S = boxIn(B, a.at[0] - e, a.at[1] - e, a.at[0] + e + 1, a.at[1] + e + 1);
    if (emptyBox(S)) return [];
    const g = gridOf(S);
    const k = Math.log(0.5) / Math.log(clamp(a.head, 0.2, 0.9));
    const p1 = hash(a.seed, 3), p2 = hash(a.seed, 5), jag = a.jag, teeth = a.teeth;
    for (const [off, len, wide] of strokesOf(a)) {
      const [x0, y0, x1, y1] = strokeEnds(a, len, off);
      const c = crescentArc(x0, y0, x1, y1, a.flip ? -a.bulge : a.bulge);
      if (!c) continue;
      const { cx, cy, R, a0, A, turn } = c, width = a.width * wide * clamp(a.thin);
      const inside = (px0, py0) => {
        const vx = px0 - cx, vy = py0 - cy;
        let an = fract(((Math.atan2(vy, vx) - a0) * turn) / TAU) * TAU;
        if (an > A + (TAU - A) / 2) an -= TAU;
        const u = an / A;
        if (u < from || u > to) return false;
        const v = (u - from) / (to - from);
        const tp = Math.sin(PI * v ** k) ** 0.7;
        const w = width * tp;
        let out = 0.25 * w, inn = 0.75 * w;
        if (jag > 0) {
          const bite = Math.sqrt(tp);
          out += jag * bite * (1.7 * fract(u * teeth + p1) - 0.5);
          inn += jag * bite * 0.6 * (Math.abs(2 * fract(u * teeth * 0.73 + p2) - 1) - 0.5);
        }
        if (out + inn < 1) { out = 0.5; inn = 0.5; }
        const r = Math.hypot(vx, vy);
        return r <= R + out && r >= R - inn;
      };
      layered(g, S, inside, C);
    }
    return g.stamps();
  },
});

// ---- spike.fan@1 ---------------------------------------------------------------------------------------------------

/** How far from `at` a spike.fan@1's pixels can lie: its prongs, half their width, its disc, its rim and a margin. */
const fanReach = (a) => Math.max(a.length * a.grow + a.width / 2, a.disc) + 3;

/**
 * spike.fan@1: `count` pointed prongs fanning out from `at` round `angle` (0 down, 90 right) over `arc` degrees, the
 * middle one `length` x `grow` px long and the outermost `short` as long, each `width` x `thin` px across and widest at
 * `belly`, with a 1 px spine (`hair`), and a round flash `disc` px across the point: all one body in its first paint,
 * outlined in the paint `rim` steps cooler (past the last: no outline). `from` (a share of the length) cuts the prongs
 * away from the point, so keys fling them off and thin them; `cool` drops the hottest paints. Port of engine/blast.js
 * spikesIn (its r0 from x length x grow, its r1 length x grow) and a disc painted as one blob, pixel for pixel.
 */
export const spikeFan = defineGenerator({
  id: 'spike.fan', v: 1, family: 'fx',
  about: 'A fan of pointed prongs from a point with a round flash on it, that keys fling off and thin: a muzzle flash.',
  args: {
    at: point({ about: 'The point the prongs fan out from' }),
    count: count(1, 9, { default: 3, about: 'How many prongs' }),
    angle: angle({ default: 90, about: 'The way the middle prong points: 0 down, 90 right, 180 up' }),
    arc: angle({ default: 90, about: 'How wide the fan is, in degrees, from the outermost prong to the other' }),
    length: px(0, 160, { default: 12, about: 'How long the middle prong is, in pixels, at grow 1' }),
    grow: px(0, 2, { default: 1, about: 'Times the length: keys stretch the prongs out while length follows a slider' }),
    from: share({ default: 0, about: 'Where the prongs start, as a share of their length: keys fling them off the point' }),
    short: share({ default: 0.6, about: 'The outermost prongs\' length, as a share of the middle one\'s' }),
    width: px(0, 32, { default: 3, about: 'Pixels across a prong at its widest' }),
    thin: share({ default: 1, about: 'Their width as a share of width: keys thin them' }),
    belly: share({ default: 0.3, about: 'Where along a prong it is widest' }),
    hair: flag({ default: true, about: 'A 1 px spine down every prong, so a thin one never breaks' }),
    disc: px(0, 32, { default: 0, about: 'The radius of the round flash on the point (0: none)' }),
    rim: count(1, 7, { default: 1, about: 'How many paints cooler than the body its outline is (past the last paint: no outline)' }),
    cool: px(0, 7, { default: 0, about: 'How many of the hottest paints it has lost (rounded; the last always stays): keys cool it frame by frame' }),
    paints: paints(8, { about: 'Hottest first: the body takes the first left, its outline the one `rim` steps cooler' }),
    area: areaArg(),
  },
  keyable: ['grow', 'from', 'thin', 'disc', 'cool', 'angle'],
  // every pixel of its box tested against each prong and the disc, and the outline pass
  cost: (a) => { const side = 2 * fanReach(a) + 1; return charge(side, side, (Math.round(a.count) + 3) * areaOf(side, side)); },
  run(a, ctx) {
    const C = cooled(a.paints, a.cool), body = C[0], rim = C[Math.round(a.rim)];
    const [x, y] = a.at, n = Math.max(1, Math.round(a.count)), A = a.angle * RAD, arc = a.arc * RAD;
    const r1 = a.length * a.grow, r0 = r1 * clamp(a.from), width = a.width * clamp(a.thin);
    const spikes = [];
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0 : (i / (n - 1)) * 2 - 1, an = A + (u * arc) / 2, len = (r1 - r0) * lerp(1, clamp(a.short), Math.abs(u));
      if (len <= 0) continue;
      const ux = Math.sin(an), uy = Math.cos(an), ax = x + ux * r0, ay = y + uy * r0;
      spikes.push({ ax, ay, ux, uy, len, flat: Math.abs(ux) >= Math.abs(uy), body: leafIn(ax, ay, ax + ux * len, ay + uy * len, width, { belly: a.belly, blunt: 0 }) });
    }
    const disc = a.disc > 0 ? a.disc : 0;
    const inside = (px0, py0) => {
      if (disc && ((px0 - x) / disc) ** 2 + ((py0 - y) / disc) ** 2 <= 1) return true;
      for (const S of spikes) {
        if (S.body(px0, py0)) return true;
        if (!a.hair) continue;
        const dx = px0 - S.ax, dy = py0 - S.ay, along = dx * S.ux + dy * S.uy;
        if (along < 0 || along > S.len - 0.25) continue;
        if (S.flat ? Math.floor(py0) === Math.floor(S.ay + (dx * S.uy) / S.ux) : Math.floor(px0) === Math.floor(S.ax + (dy * S.ux) / S.uy)) return true;
      }
      return false;
    };
    if (!spikes.length && !disc) return [];
    const B = boxOf(ctx, a.area), e = fanReach(a);
    const S = boxIn(B, x - e, y - e, x + e + 1, y + e + 1);
    if (emptyBox(S)) return [];
    const g = gridOf(S);
    g.fill(S[0], S[1], S[2], S[3], inside, body, { shade: 0, clip: clipOf(B), ...(rim ? { outline: rim } : {}) });
    return g.stamps();
  },
});

// ---- floor.ring@1 --------------------------------------------------------------------------------------------------

/** engine/solids.js ngonPoints: the corners of an n-sided polygon round (cx, cy), rx across and ry down, turned by angle (radians). */
function ngonPoints(cx, cy, rx, ry, sides, angle) {
  const n = Math.max(3, Math.round(sides)), pts = [];
  for (let i = 0; i < n; i++) { const an = angle + PI / 2 - PI / n + (i * TAU) / n; pts.push([cx + Math.cos(an) * rx, cy + Math.sin(an) * ry]); }
  return pts;
}
/** engine/surface.js polyIn: the shape test of a polygon. */
function polyIn(pts) {
  const n = pts.length;
  return (px0, py0) => {
    let hit = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > py0) !== (yj > py0) && px0 < ((xj - xi) * (py0 - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
}
/** How far from `at` a floor.ring@1's pixels can lie, across: its radius, its rim and a margin. */
const floorReach = (a) => a.r * a.scale + 3;

/**
 * floor.ring@1: a ring of light lying on a floor seen from above, `r` x `scale` px from `at` to its outer edge across and
 * `squash` of that down, round or with `sides` straight sides turned `turn` degrees, `thick` px across, whole or broken
 * into `gaps` arcs that take `open` of it, the breaks moved round by `phase` degrees; its band the last paint but one, a
 * hotter inner line when `heat` is high (above 0.66 the first paint, above 0.33 the second), and a 1 px rim of the last
 * paint outside it (`rim` off: none). A ring too small to show is a pair of pixels. Keys swell or shrink it (`scale`),
 * thin it, break it, turn it and cool it. Port of engine/fx-floor.js floorRing, pixel for pixel.
 */
export const floorRing = defineGenerator({
  id: 'floor.ring', v: 1, family: 'fx',
  about: 'A ring of light lying on the floor, round or many-sided, whole or broken into arcs: a spawn warning, a teleporter pad, a barrier.',
  args: {
    at: point({ about: 'The middle of the ring' }),
    r: px(0, 160, { default: 12, about: 'Pixels from the middle to its outer edge, across, at scale 1' }),
    scale: px(0, 4, { default: 1, about: 'Times the radius: keys swell or shrink it while r follows a slider' }),
    squash: px(0.1, 1, { default: 0.6, about: 'How much of its width it is tall: a floor seen from above' }),
    thick: px(1, 16, { default: 2, about: 'Pixels across its band' }),
    sides: count(0, 12, { default: 0, about: 'Straight sides (0: round)' }),
    turn: angle({ default: 0, about: 'Turns a many-sided ring about its upright axis, in degrees' }),
    gaps: count(0, 16, { default: 0, about: 'How many breaks' }),
    open: share({ default: 0.3, about: 'The share of the ring the breaks take' }),
    phase: angle({ default: 0, about: 'Moves the breaks round, in degrees' }),
    heat: share({ default: 1, about: 'How hot its inner line is: above 0.66 the first paint, above 0.33 the second, else none' }),
    rim: flag({ default: true, about: 'A 1 px rim of the last paint outside it' }),
    paints: paints(8, { about: 'Hottest first: the band takes the last but one, the rim the last' }),
    area: areaArg(),
  },
  keyable: ['scale', 'thick', 'turn', 'gaps', 'open', 'phase', 'heat'],
  // each pixel of its box tested against four outlines (polygon edges when it has sides), three fills
  cost: (a) => { const side = 2 * floorReach(a) + 1; return charge(side, side, (4 * Math.max(4, Math.round(a.sides)) + 6) * areaOf(side, side)); },
  run(a, ctx) {
    const B = boxOf(ctx, a.area), [x, y] = a.at, C = a.paints, n = C.length, rim = C[n - 1], band = C[Math.max(0, n - 2)];
    const r = a.r * a.scale, sq = Math.max(0.1, a.squash), th = Math.max(1, Math.round(a.thick));
    const e = floorReach(a), S = boxIn(B, x - e, y - e, x + e + 1, y + e + 1);
    if (emptyBox(S)) return [];
    const g = gridOf(S), rx = r, ry = r * sq;
    const put = (px0, py0, c) => { px0 = Math.floor(px0); py0 = Math.floor(py0); if (px0 >= B[0] && py0 >= B[1] && px0 < B[2] && py0 < B[3]) g.set(px0, py0, c); };
    if (rx < 1.2 || ry < 0.8) { put(x - 1, y, band); put(x, y, band); return g.stamps(); }
    const N = Math.round(a.sides), turn = a.turn * RAD, phase = a.phase * RAD;
    const shapeAt = (d) => {
      const ax = rx - d, ay = ry - d;
      if (ax <= 0 || ay <= 0) return () => false;
      return N >= 3 ? polyIn(ngonPoints(x, y, ax, ay, N, turn)) : (px0, py0) => ((px0 - x) / ax) ** 2 + ((py0 - y) / ay) ** 2 <= 1;
    };
    const G = Math.max(0, Math.round(a.gaps));
    const whole = (px0, py0) => {
      if (!G) return true;
      const u = ((Math.atan2((py0 - y) / sq, px0 - x) - phase) / TAU) * G;
      return u - Math.floor(u) >= clamp(a.open);
    };
    // each outline and the breaks worked out once a pixel over the box (the fills below look them up)
    const W = S[2] - S[0], H = S[3] - S[1], mask = new Uint8Array(W * H);
    const tests = [shapeAt(-1), shapeAt(0), shapeAt(th - 1), shapeAt(th)];
    for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
      const px0 = S[0] + xx + 0.5, py0 = S[1] + yy + 0.5;
      if (!tests[0](px0, py0) || !whole(px0, py0)) continue;
      let m = 1;
      for (let k = 1; k < 4 && tests[k](px0, py0); k++) m |= 1 << k;
      mask[yy * W + xx] = m;
    }
    const at = (px0, py0) => { const xx = Math.floor(px0) - S[0], yy = Math.floor(py0) - S[1]; return xx >= 0 && yy >= 0 && xx < W && yy < H ? mask[yy * W + xx] : 0; };
    // halo 1, outer 2, line 4, inner 8: the rim is in the halo and not the outline, the band in the outline and not inside it
    const fill = (test, c) => g.fill(B[0], B[1], B[2] - 1, B[3] - 1, test, c, { clip: clipOf(B) });
    // the rim: halo and not outer. The shapes nest (a pixel inside one is inside every bigger one), and the band is
    // painted next over every pixel in the outer shape, so a looser test here (halo and not line) would paint pixels
    // the band then covers and draw the same: no output can tell the two apart (review E1, issue 8). This one paints
    // only the rim, as engine/fx-floor.js floorRing's rim fill did.
    if (a.rim) fill((px0, py0) => { const m = at(px0, py0); return (m & 1) && !(m & 2); }, rim);
    fill((px0, py0) => { const m = at(px0, py0); return (m & 2) && !(m & 8); }, band);
    const hot = a.heat > 0.66 ? C[0] : a.heat > 0.33 ? C[Math.min(1, n - 1)] : null;
    if (hot && th >= 2) fill((px0, py0) => { const m = at(px0, py0); return (m & 4) && !(m & 8); }, hot);
    return g.stamps();
  },
});

// ---- rift@1 --------------------------------------------------------------------------------------------------------

/** How far from `at` a rift@1's pixels can lie: half its length or across, its rim and a margin. */
const riftReach = (a) => Math.max(a.length, a.across) * a.scale / 2 + 3;

/**
 * rift@1: a jagged tear of light standing at `at`: `length` x `scale` px long along `angle` (0 across, 90 standing up),
 * zigzagging `teeth` times about `across` x `scale` px wide (`jag` of that the zigzag, the rest its opening, `open`
 * closing it to a hairline), painted as a thing of light: the tear in the last paint but one with a 1 px rim of the last
 * (`rim` off: none) and, with three paints or more, a heart of the first a pixel inside. Keys open and close it, swell it
 * and cool its heart away. Port of engine/fx-floor.js riftIn painted with lightShape (its heart the first paint), pixel
 * for pixel.
 */
export const rift = defineGenerator({
  id: 'rift', v: 1, family: 'fx',
  about: 'A jagged tear of light that gapes and closes: a portal opening, a crack in the air, a spawn rift.',
  args: {
    at: point({ about: 'The middle of the tear' }),
    length: px(0, 160, { default: 16, about: 'How long it is, in pixels, at scale 1' }),
    across: px(0, 64, { default: 8, about: 'How far it reaches across with its zigzag, in pixels, at scale 1' }),
    scale: px(0, 4, { default: 1, about: 'Times its length and width: keys swell or shrink it while they follow sliders' }),
    angle: angle({ default: 90, about: 'The way it lies, in degrees: 0 across, 90 standing up' }),
    teeth: count(1, 12, { default: 3, about: 'How many times it turns' }),
    jag: share({ default: 0.5, about: 'How much of its width is zigzag (the rest is its opening)' }),
    open: share({ default: 1, about: 'How far open it is (0: a hairline)' }),
    rim: flag({ default: true, about: 'A 1 px rim of the last paint round it' }),
    cool: px(0, 7, { default: 0, about: 'How many of the hottest paints it has lost (rounded; the rim always stays): keys cool its heart away' }),
    seed: seed({ default: 0, about: 'Where its zigzag starts' }),
    paints: paints(8, { about: 'Its heart first (with three or more), then the tear, then its rim' }),
    area: areaArg(),
  },
  keyable: ['scale', 'open', 'cool', 'angle'],
  // each pixel of its box (and a 1 px ring round it) tested once for the tear, a test with a power in it priced as
  // four; then the outline, the fill and the heart's five look-ups each pixel makes in that mask (review E1, issue 2)
  cost: (a) => { const side = 2 * riftReach(a) + 3; return charge(side, side, 16 * areaOf(side, side)); },
  run(a, ctx) {
    const B = boxOf(ctx, a.area), [cx, cy] = a.at, C = cooled(a.paints, a.cool), n = C.length;
    const w = a.length * a.scale, h = a.across * a.scale, A = a.angle * RAD;
    const c = Math.cos(A), sn = Math.sin(A), half = Math.max(0.5, w / 2), ph = hash(a.seed, 1), j = clamp(a.jag), teeth = a.teeth, open = clamp(a.open);
    const tri = (v) => Math.abs(((v % 1) + 1) % 1 - 0.5) * 4 - 1;
    const test = (px0, py0) => {
      const dx = px0 - cx, dy = py0 - cy;
      const lx = dx * c + dy * sn, ly = dy * c - dx * sn;
      const u = lx / half;
      if (u < -1 || u > 1) return false;
      const taper = (1 - Math.abs(u)) ** 0.7;
      const mid = (h / 2) * j * taper * tri(((u + 1) / 2) * teeth + ph);
      return Math.abs(ly - mid) <= Math.max(0.5, (h / 2) * (1 - j) * open * taper);
    };
    const e = riftReach(a), S = boxIn(B, cx - e, cy - e, cx + e + 1, cy + e + 1);
    if (emptyBox(S)) return [];
    const g = gridOf(S), clip = clipOf(B);
    // the tear worked out once a pixel over its box and a 1 px ring round it (the outline and the heart look one pixel
    // out); every pass below asks at pixel centres, one pixel apart, so it reads the mask (the same answers, review E1
    // issue 2: the passes made some eleven tests a pixel)
    const mx = S[0] - 1, my = S[1] - 1, MW = S[2] - S[0] + 2, MH = S[3] - S[1] + 2, mask = new Uint8Array(MW * MH);
    for (let yy = 0; yy < MH; yy++) for (let xx = 0; xx < MW; xx++) mask[yy * MW + xx] = test(mx + xx + 0.5, my + yy + 0.5) ? 1 : 0;
    const tear = (px0, py0) => {
      const xx = px0 - 0.5 - mx, yy = py0 - 0.5 - my;
      return Number.isInteger(xx) && Number.isInteger(yy) && xx >= 0 && yy >= 0 && xx < MW && yy < MH ? mask[yy * MW + xx] === 1 : test(px0, py0);
    };
    g.fill(B[0], B[1], B[2] - 1, B[3] - 1, tear, C[Math.max(0, n - 2)], a.rim ? { clip, outline: C[n - 1] } : { clip });
    if (n >= 3) {
      const inset = (px0, py0) => tear(px0, py0) && tear(px0 - 1, py0) && tear(px0 + 1, py0) && tear(px0, py0 - 1) && tear(px0, py0 + 1);
      g.fill(B[0], B[1], B[2] - 1, B[3] - 1, inset, C[0], { clip });
    }
    return g.stamps();
  },
});

// ---- stamp bounds, size keys, frame pixels --------------------------------------------------------------------------

/** The most stamp pixels each behaviour of this file can return in a frame of `size`: "<id>@<v>" -> (args, size) -> pixels (engine/gen/index.js STAMP_BOUNDS). */
export const E1_STAMP_BOUNDS = Object.freeze({
  'blast.grow@1': (a, size) => boxPixels(2 * a.r * a.scale + 5, 2 * a.r * a.scale + 5, size),
  'beam.lift@1': (a, size) => { const [w, h] = beamSize(a); return boxPixels(w + 3, h + 3, size); },
  'flame.grow@1': (a, size) => { const side = 2 * flameReach2(a) + 2; return boxPixels(side, side, size); },
  'crescent@1': (a, size) => { const side = 2 * crescentReach(a) + 2; return boxPixels(side, side, size); },
  'spike.fan@1': (a, size) => { const side = 2 * fanReach(a) + 2; return boxPixels(side, side, size); },
  'bolt.grow@1': (a, size) => boxPixels(strikeSide(a), strikeSide(a), size),
  'floor.ring@1': (a, size) => { const side = 2 * floorReach(a) + 2; return boxPixels(side, side, size); },
  'rift@1': (a, size) => { const side = 2 * riftReach(a) + 2; return boxPixels(side, side, size); },
});

/** The keyable arguments of each behaviour of this file that its cost or stamp bound reads (engine/gen/index.js SIZE_KEYS). */
export const E1_SIZE_KEYS = Object.freeze({
  'blast.grow@1': Object.freeze(['r', 'scale']),
  'beam.lift@1': Object.freeze(['height', 'scale', 'across']),
  'flame.grow@1': Object.freeze(['length', 'width', 'tall', 'wide', 'sway', 'head', 'spread']),
  'crescent@1': Object.freeze([]),
  'spike.fan@1': Object.freeze(['grow', 'disc']),
  'bolt.grow@1': Object.freeze(['forkLength']),
  'floor.ring@1': Object.freeze(['scale']),
  'rift@1': Object.freeze(['scale']),
});

/** Why each behaviour of this file works in frame pixels (engine/gen/index.js FRAME_GENERATORS). */
export const E1_FRAME_GENERATORS = Object.freeze({
  'blast.grow@1': 'a blast clipped to the frame\'s 1 px border: name it as an emitter, not in a draw list on a node',
  'beam.lift@1': 'a column of light clipped to the frame\'s 1 px border: name it as an emitter, not in a draw list on a node',
  'flame.grow@1': 'a flame clipped to the frame\'s 1 px border: name it as an emitter, not in a draw list on a node',
  'crescent@1': 'a blade of light clipped to the frame\'s 1 px border: name it as an emitter, not in a draw list on a node',
  'spike.fan@1': 'a flash clipped to the frame\'s 1 px border: name it as an emitter, not in a draw list on a node',
  'bolt.grow@1': 'a bolt clipped to the frame\'s 1 px border: name it as an emitter, not in a draw list on a node',
  'floor.ring@1': 'a ring clipped to the frame\'s 1 px border: name it as an emitter, not in a draw list on a node',
  'rift@1': 'a tear clipped to the frame\'s 1 px border: name it as an emitter, not in a draw list on a node',
});
