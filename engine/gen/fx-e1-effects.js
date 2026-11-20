// Effect ports added by build item E1 after its first review (docs/data-sprites.md section 9, row E1; 2.5c; family
// "fx"): eleven library effects whose drawing was their own code, ported whole as migration batch E2 ported its 21
// (engine/gen/fx-e2.js effectPort) and M9 the interface pictures (engine/gen/port-sprite.js). The behaviour redraws of
// E1's first round drew these at "close" rather than at least as good (review E1, issues 4 to 6: the shockwave's dust,
// the spawn warp's third ring and Flicker, the fire spell's low flame, the teleport pad, the thunder chain's braided
// strand, the charge-up's star, the hit flash's splat, the guard dome's bands; after the second, muzzle-flash's shock
// ring and last prongs), and two (fx-ice-spell, explosion-large) were not drawn at all (crystals, snowflakes, a frame-filling fireball). Each port runs the code sprite's render, word
// for word, on a paint-ref grid (engine/gen/ports/e1/fx-<id>.js, which imports E2's copies of the engine helpers), its
// arguments the old settings, its colours the paint refs the data file names, so the data file keeps every control,
// clip and colour and draws what the code drew, pixel for pixel (tests/fixtures/redraw-pixels/<id>.json).
//
// One frame is bigger than a frame's stamp cap: explosion-large is 96 x 96 (9,216 pixels; 8,836 inside its border)
// against SHAPE_CAPS.stampPixels 8,192. Its port gives the middle 90 x 90 of its frame as stamps (8,100 at most: its
// stamp bound) and the few pixels it paints round that (its fireball and sparks reach 46 px from the middle) as
// whole-pixel rects, one a run of a row, which hold no stamp pixels; the same pixels either way.
// Pure: no randomness, no clock, no DOM; runs the same in the browser and Node.
import { defineGenerator } from './registry.js';
import { point, word, share, count, flag, paint } from './args.js';
import { portGenerator, portPhase } from './port-sprite.js';
import { PortSurface, withPaintTable, portTiles, shiftTo } from './port-surface.js';
import { workCost } from './pixels.js';
import { render as shockwaveRender } from './ports/e1/fx-shockwave.js';
import { render as spawnWarpRender } from './ports/e1/fx-spawn-warp.js';
import { render as fxFireSpellRender } from './ports/e1/fx-fire-spell.js';
import { render as teleportBeamRender } from './ports/e1/fx-teleport-beam.js';
import { render as fxThunderSpellRender } from './ports/e1/fx-thunder-spell.js';
import { render as chargeUpRender } from './ports/e1/fx-charge-up.js';
import { render as hitFlashRender } from './ports/e1/fx-hit-flash.js';
import { render as guardFlashRender } from './ports/e1/fx-guard-flash.js';
import { render as fxIceSpellRender } from './ports/e1/fx-ice-spell.js';
import { render as explosionLargeRender } from './ports/e1/fx-explosion-large.js';
import { render as muzzleFlashRender } from './ports/e1/fx-muzzle-flash.js';

/** The stamp bound of every effect port here: its old frame's area, or its stamp box's when it has one. */
const BOUNDS = {};
/** The shape tests a pixel of an effect port's frame is priced at (port-sprite.js's default). */
const WORK = 64;

/**
 * Declares an effect port: portGenerator (engine/gen/port-sprite.js) with family fx and version 1, drawing `render`
 * (the ported code sprite's render) on a grid of the old frame `size`, `origin` the point `at` names, `states` its
 * clips. With `stampBox` ([x0, y0, x1, y1) in the old frame's pixels) the pixels inside it come back as stamps and
 * those outside it (and inside the frame's 1 px border, which stays clear) as one-row whole-pixel rects (a frame bigger than a frame's stamp cap); its stamp bound is that box's
 * area, else the frame's. `units` is the measured work of its heaviest call in cost units of about 0.01 ms (1.5 times
 * what it took, as E2's ports: tests/unit/gen-e1-safety.test.mjs holds each port's heaviest call to its cost; review
 * E1 round 2, issue 1). Returns the frozen registry entry.
 */
function effectPort({ id, size, origin, states, about, args, render, stampBox, units }) {
  if (!(Number.isInteger(units) && units > 0)) throw new Error(`${id}: an effect port needs its measured units (tests/unit/gen-e1-safety.test.mjs)`);
  const [W, H] = size;
  if (!stampBox) {
    BOUNDS[`${id}@1`] = () => W * H;
    return portGenerator({ id, v: 1, family: 'fx', about, size, origin, states, args, work: WORK, units,
      draw: (g, { clip, t, frame, frames, loop, p }) => render(g, { clip, t, frame, frames, loop, p }) });
  }
  // the old frame's 1 px border is never drawn (a frame's border stays clear: tests/unit/gen-fx-e1-effects.test.mjs
  // holds the render to it at every setting), so the rects hold at most the pixels inside it and round the box
  const [bx0, by0, bx1, by1] = stampBox, inner = (bx1 - bx0) * (by1 - by0), ring = (W - 2) * (H - 2) - inner;
  BOUNDS[`${id}@1`] = () => inner;
  const names = Object.keys(states);
  return defineGenerator({
    id, v: 1, family: 'fx', about,
    args: {
      at: point({ about: `Where the middle of its ${W} x ${H} picture goes (the old frame's point ${origin[0]}, ${origin[1]})` }),
      picture: word(names, { default: names[0], about: 'Which of its pictures it draws: the clip of the same name' }),
      ...args,
    },
    // the stamps of its box's tiles, a rect for every pixel inside the border round the box at most, and the shape tests of its frame or
    // its measured work, whichever is more (as portGenerator)
    cost: () => portTiles(bx1 - bx0, by1 - by0) + ring + Math.max(workCost(W * H * WORK), units),
    run(a, ctx) {
      const st = states[a.picture], frames = st.frames, loop = st.loop !== false;
      const frame = Number.isInteger(ctx.frame) ? Math.max(0, Math.min(frames - 1, ctx.frame)) : 0;
      return withPaintTable(() => {
        const g = new PortSurface(W, H);
        render(g, { clip: a.picture, frame, frames, loop, t: portPhase(frame, frames, loop), p: a });
        const [dx, dy] = shiftTo(a.at, origin[0], origin[1]);
        // the box's pixels on a grid of their own (the same paint table), given as stamps
        const mid = g.blank(W, H), rects = [];
        for (let y = 1; y < H - 1; y++) {
          let x = 1;
          while (x < W - 1) {
            const c = g.data[y * W + x];
            if (!c) { x++; continue; }
            if (x >= bx0 && x < bx1 && y >= by0 && y < by1) { mid.data[y * W + x] = c; x++; continue; }
            // a run of one paint along the row, outside the box
            let e = x + 1;
            while (e < W - 1 && g.data[y * W + e] === c && !(e >= bx0 && e < bx1 && y >= by0 && y < by1)) e++;
            rects.push({ kind: 'rect', at: [x + dx, y + dy], size: [e - x, 1], paint: g.table.ref(c), shade: 0 });
            x = e;
          }
        }
        return [...mid.stamps([dx, dy]), ...rects];
      });
    },
  });
}

// ---- effect.shockwave@1 (sprites/shockwave.json) --------------------------------------------------------------------

/** effect.shockwave@1: A ground shockwave from a heavy landing or a slam: a white flash, a flat ring racing out along the ground, dust and flying chips. Port of sprites/shockwave.js (engine/gen/ports/e1/fx-shockwave.js), pixel for pixel. */
export const shockwaveEffect = effectPort({
  id: 'effect.shockwave', units: 300, size: [64,64], origin: [32,62], states: {"burst":{"frames":10,"loop":false}},
  about: "A ground shockwave from a heavy landing or a slam: a white flash, a flat ring racing out along the ground, dust and flying chips.",
  args: {
    size: share({ default: 0.5, about: "Size: Small to Big" }),
    pieces: count(2, 8, { default: 4, about: "Rocks: Few to Many" }),
    spread: share({ default: 0.5, about: "Spread: Tight to Wide" }),
    height: share({ default: 0.5, about: "Height: Short to Tall" }),
    style: word(["dust","energy","quake"], { default: "dust", about: "Style" }),
    core: paint({ about: "Core" }),
    edge: paint({ about: "Edge" }),
  },
  render: shockwaveRender,
});

// ---- effect.spawn-warp@1 (sprites/spawn-warp.json) ------------------------------------------------------------------

/** effect.spawn-warp@1: A warning ring on the floor where an enemy is about to appear: it pulses, snaps open with a column of light, and closes to a dot. Port of sprites/spawn-warp.js (engine/gen/ports/e1/fx-spawn-warp.js), pixel for pixel. */
export const spawnWarpEffect = effectPort({
  id: 'effect.spawn-warp', units: 150, size: [48,48], origin: [24,24], states: {"warn":{"frames":8},"burst":{"frames":8,"loop":false},"close":{"frames":6,"loop":false}},
  about: "A warning ring on the floor where an enemy is about to appear: it pulses, snaps open with a column of light, and closes to a dot.",
  args: {
    size: share({ default: 0.5, about: "Size: Small to Big" }),
    style: word(["ring","hex","rift"], { default: "ring", about: "Style" }),
    rings: word(["one","two","three"], { default: "two", about: "Rings" }),
    pieces: count(4, 12, { default: 8, about: "Ticks: Few to Many" }),
    core: paint({ about: "Core" }),
    edge: paint({ about: "Edge" }),
    flicker: share({ default: 0.5, about: "Flicker: Steady to Wild" }),
  },
  render: spawnWarpRender,
});

// ---- effect.fx-fire-spell@1 (sprites/fx-fire-spell.json) ------------------------------------------------------------

/** effect.fx-fire-spell@1: A fire spell for a battle screen: flames erupt under the target, and sparks gather into a flame in the caster's hand. Port of sprites/fx-fire-spell.js (engine/gen/ports/e1/fx-fire-spell.js), pixel for pixel. */
export const fxFireSpellEffect = effectPort({
  id: 'effect.fx-fire-spell', units: 1210, size: [64,64], origin: [32,58], states: {"burst":{"frames":10,"loop":false},"cast":{"frames":8,"loop":false}},
  about: "A fire spell for a battle screen: flames erupt under the target, and sparks gather into a flame in the caster's hand.",
  args: {
    size: share({ default: 0.5, about: "Size: Small to Big" }),
    height: share({ default: 0.5, about: "Height: Short to Tall" }),
    pieces: count(3, 7, { default: 5, about: "Tongues: Few to Many" }),
    style: word(["pillar","ball","ring"], { default: "pillar", about: "Style" }),
    sparks: flag({ default: true, about: "Embers" }),
    core: paint({ about: "Core" }),
    edge: paint({ about: "Edge" }),
    flicker: share({ default: 0.5, about: "Flicker: Steady to Wild" }),
  },
  render: fxFireSpellRender,
});

// ---- effect.teleport-beam@1 (sprites/teleport-beam.json) ------------------------------------------------------------

/** effect.teleport-beam@1: A column of light that carries a character away or sets one down: it lifts off and breaks into rising dashes, hoops or sparks, then comes back down with a flash. Port of sprites/teleport-beam.js (engine/gen/ports/e1/fx-teleport-beam.js), pixel for pixel. */
export const teleportBeamEffect = effectPort({
  id: 'effect.teleport-beam', units: 310, size: [64,64], origin: [32,62], states: {"burst":{"frames":10,"loop":false},"arrive":{"frames":10,"loop":false}},
  about: "A column of light that carries a character away or sets one down: it lifts off and breaks into rising dashes, hoops or sparks, then comes back down with a flash.",
  args: {
    size: share({ default: 0.5, about: "Size: Small to Big" }),
    width: share({ default: 0.5, about: "Width: Narrow to Wide" }),
    style: word(["column","rings","sparks"], { default: "column", about: "Style" }),
    pieces: count(3, 8, { default: 5, about: "Pieces: Few to Many" }),
    core: paint({ about: "Core" }),
    edge: paint({ about: "Edge" }),
    flicker: share({ default: 0.5, about: "Flicker: Steady to Wild" }),
  },
  render: teleportBeamRender,
});

// ---- effect.fx-thunder-spell@1 (sprites/fx-thunder-spell.json) ------------------------------------------------------

/** effect.fx-thunder-spell@1: A lightning bolt that strikes the target from above and leaves sparks skittering on the ground. Port of sprites/fx-thunder-spell.js (engine/gen/ports/e1/fx-thunder-spell.js), pixel for pixel. */
export const fxThunderSpellEffect = effectPort({
  id: 'effect.fx-thunder-spell', units: 1090, size: [64,96], origin: [32,90], states: {"burst":{"frames":8,"loop":false}},
  about: "A lightning bolt that strikes the target from above and leaves sparks skittering on the ground.",
  args: {
    width: share({ default: 0.5, about: "Width: Narrow to Wide" }),
    pieces: count(1, 5, { default: 3, about: "Forks: Few to Many" }),
    wobble: share({ default: 0.5, about: "Zigzag: Smooth to Jagged" }),
    style: word(["bolt","chain","pillar"], { default: "bolt", about: "Style" }),
    sparks: flag({ default: true, about: "Sparks" }),
    core: paint({ about: "Core" }),
    edge: paint({ about: "Edge" }),
  },
  render: fxThunderSpellRender,
});

// ---- effect.charge-up@1 (sprites/charge-up.json) --------------------------------------------------------------------

/** effect.charge-up@1: Energy gathering into a pulsing core before a big shot or special move, then released in a flash. Port of sprites/charge-up.js (engine/gen/ports/e1/fx-charge-up.js), pixel for pixel. */
export const chargeUpEffect = effectPort({
  id: 'effect.charge-up', units: 130, size: [48,48], origin: [24,24], states: {"loop":{"frames":8},"burst":{"frames":8,"loop":false}},
  about: "Energy gathering into a pulsing core before a big shot or special move, then released in a flash.",
  args: {
    size: share({ default: 0.5, about: "Size: Small to Big" }),
    pieces: count(4, 12, { default: 8, about: "Sparks: Few to Many" }),
    style: word(["spiral","rings","pull"], { default: "spiral", about: "Style" }),
    twist: share({ default: 0.5, about: "Twist: Straight to Turned" }),
    core: paint({ about: "Core" }),
    edge: paint({ about: "Edge" }),
    flicker: share({ default: 0.5, about: "Flicker: Steady to Wild" }),
  },
  render: chargeUpRender,
});

// ---- effect.hit-flash@1 (sprites/hit-flash.json) --------------------------------------------------------------------

/** effect.hit-flash@1: The flash where an energy shot lands: a white dot, a thin ring that opens, and shards flying off it. Port of sprites/hit-flash.js (engine/gen/ports/e1/fx-hit-flash.js), pixel for pixel. */
export const hitFlashEffect = effectPort({
  id: 'effect.hit-flash', units: 80, size: [32,32], origin: [16,16], states: {"burst":{"frames":5,"loop":false}},
  about: "The flash where an energy shot lands: a white dot, a thin ring that opens, and shards flying off it.",
  args: {
    size: share({ default: 0.5, about: "Size: Small to Big" }),
    pieces: count(4, 8, { default: 6, about: "Pieces: Few to Many" }),
    style: word(["ring","cross","splash"], { default: "ring", about: "Style" }),
    twist: share({ default: 0, about: "Twist: Straight to Turned" }),
    core: paint({ about: "Core" }),
    edge: paint({ about: "Edge" }),
  },
  render: hitFlashRender,
});

// ---- effect.guard-flash@1 (sprites/guard-flash.json) ----------------------------------------------------------------

/** effect.guard-flash@1: The flash of a blocked or parried hit: a crescent, a six-sided barrier or a cross of light that bursts white, throws sparks back at the attacker and breaks apart. Port of sprites/guard-flash.js (engine/gen/ports/e1/fx-guard-flash.js), pixel for pixel. */
export const guardFlashEffect = effectPort({
  id: 'effect.guard-flash', units: 110, size: [32,32], origin: [16,16], states: {"burst":{"frames":6,"loop":false}},
  about: "The flash of a blocked or parried hit: a crescent, a six-sided barrier or a cross of light that bursts white, throws sparks back at the attacker and breaks apart.",
  args: {
    size: share({ default: 0.5, about: "Size: Small to Big" }),
    pieces: count(3, 8, { default: 5, about: "Sparks: Few to Many" }),
    spread: share({ default: 0.5, about: "Spread: Tight to Wide" }),
    style: word(["arc","dome","cross"], { default: "arc", about: "Style" }),
    core: paint({ about: "Core" }),
    edge: paint({ about: "Edge" }),
  },
  render: guardFlashRender,
});

// ---- effect.fx-ice-spell@1 (sprites/fx-ice-spell.json) --------------------------------------------------------------

/** effect.fx-ice-spell@1: An ice spell for a battle screen: spikes jut up under the target, glint and shatter, and frost gathers into a crystal in the caster's hand. Port of sprites/fx-ice-spell.js (engine/gen/ports/e1/fx-ice-spell.js), pixel for pixel. */
export const fxIceSpellEffect = effectPort({
  id: 'effect.fx-ice-spell', units: 1100, size: [64,64], origin: [32,58], states: {"burst":{"frames":10,"loop":false},"cast":{"frames":8,"loop":false}},
  about: "An ice spell for a battle screen: spikes jut up under the target, glint and shatter, and frost gathers into a crystal in the caster's hand.",
  args: {
    size: share({ default: 0.5, about: "Size: Small to Big" }),
    height: share({ default: 0.5, about: "Height: Short to Tall" }),
    pieces: count(3, 7, { default: 5, about: "Spikes: Few to Many" }),
    style: word(["spikes","crystal","snowflake"], { default: "spikes", about: "Style" }),
    mist: flag({ default: true, about: "Mist" }),
    core: paint({ about: "Core" }),
    edge: paint({ about: "Edge" }),
  },
  render: fxIceSpellRender,
});

// ---- effect.explosion-large@1 (sprites/explosion-large.json) --------------------------------------------------------

/** effect.explosion-large@1: A big explosion for barrels and bosses: a white flash, a fireball that tears open into a ring, then smoke, scrap and sparks, plus a smoke column for the wreck. Port of sprites/explosion-large.js (engine/gen/ports/e1/fx-explosion-large.js), pixel for pixel. */
export const explosionLargeEffect = effectPort({
  id: 'effect.explosion-large', units: 1160, size: [96,96], origin: [48,48], states: {"burst":{"frames":12,"loop":false},"smoke":{"frames":8}},
  stampBox: [3, 3, 93, 93],   // its 96 x 96 frame holds more than a frame's 8,192 stamp pixels: the middle 90 x 90 as stamps, the rest as rects
  about: "A big explosion for barrels and bosses: a white flash, a fireball that tears open into a ring, then smoke, scrap and sparks, plus a smoke column for the wreck.",
  args: {
    size: share({ default: 0.5, about: "Size: Small to Big" }),
    pieces: count(4, 12, { default: 8, about: "Pieces: Few to Many" }),
    spread: share({ default: 0.5, about: "Spread: Tight to Wide" }),
    lobes: count(4, 9, { default: 6, about: "Bulges: Few to Many" }),
    style: word(["fire","plasma","shock-ring"], { default: "fire", about: "Style" }),
    soot: flag({ default: true, about: "Soot" }),
    core: paint({ about: "Core" }),
    edge: paint({ about: "Edge" }),
  },
  render: explosionLargeRender,
});


// ---- effect.muzzle-flash@1 (sprites/muzzle-flash.json) --------------------------------------------------------

/** effect.muzzle-flash@1: The flash at the tip of a gun, spreading to the right from the muzzle. Port of sprites/muzzle-flash.js (engine/gen/ports/e1/fx-muzzle-flash.js), pixel for pixel (review E1 round 2, issue 4: its behaviour redraw broke the ring style's shock ring early and outlined the last prongs). */
export const muzzleFlashEffect = effectPort({
  id: 'effect.muzzle-flash', units: 140, size: [32,32], origin: [8,16], states: {"burst":{"frames":4,"loop":false}},
  about: "The flash at the tip of a gun, spreading to the right from the muzzle.",
  args: {
    size: share({ default: 0.5, about: "Size: Small to Big" }),
    length: share({ default: 0.5, about: "Length: Short to Long" }),
    style: word(["star","cone","ring"], { default: "star", about: "Style" }),
    pieces: word(["one","three","five"], { default: "three", about: "Prongs" }),
    core: paint({ about: "Core" }),
    edge: paint({ about: "Edge" }),
  },
  render: muzzleFlashRender,
});

/** The stamp bound of each effect port of this file (engine/gen/index.js STAMP_BOUNDS): its old frame's area, or its stamp box's. */
export const E1_EFFECT_STAMP_BOUNDS = Object.freeze({ ...BOUNDS });

/** The keyable arguments of each effect port of this file that its cost or stamp bound reads (engine/gen/index.js SIZE_KEYS): none, a port keys nothing. */
export const E1_EFFECT_SIZE_KEYS = Object.freeze(Object.fromEntries(Object.keys(BOUNDS).map((k) => [k, Object.freeze([])])));
