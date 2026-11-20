// Prop generators of migration batch M3 (docs/data-sprites.md section 9, M1 to M40, and 3.3, family "shape"): the
// library props redrawn as data that a sprite's shapes, stamps and keys cannot draw by themselves name one of these.
// Each is a port of the code that drew the prop (the drawing in its old sprite file and the engine helpers it called),
// with the sprite's colours turned into the paint refs its call names: each pixel takes the paint the code gave it,
// decided by the code's own shape tests at pixel centres (engine/gen/pixels.js), and comes back as stamps.
//
// Shared by all of them:
//   - `at` is the middle of the prop's foot: x its centre column, y the row under its lowest body row (the pivot row);
//     the prop is drawn round it, the same on a node at its origin as in frame pixels;
//   - what changes over a clip is given as TABLES, one number per frame of the clip the call is drawn in (`profile`
//     arguments, read at ctx.frame, the last number holding past the end), so the clip's timing is data in the asset
//     and the generator only draws one state: a table, never a formula;
//   - `layer: "light"` draws only what the code drew after its outline (glints, sparkles), so an asset puts a second
//     call after its { kind: "outline" } and light is never inked;
//   - colour maths (engine/color.js ramp, tone, mix) becomes the colour rules of engine/gen/pixels.js rampOf, toneOf
//     and mixOf and the `tone` rule, worked out per frame by engine/resolve.js.
// Pure: no randomness, no clock, no surface; runs the same in Node and the browser.
import { defineGenerator } from './registry.js';
import { point, px, count, share, word, flag, paint, profile } from './args.js';
import { Pixels, rampOf, colourOf, tilted, cropped, tilesFor, workCost } from './pixels.js';
import { ellipseIn, capsuleIn, polyIn, rectIn } from '../surface.js';
import { spikeIn, insetIn, clippedIn, trimmedIn, edgeIn, archIn, ringIn, boundsOf } from '../shapes.js';
import { archStones } from '../buildings.js';
import { squircleIn, solid, stripesIn, ngonPoints } from '../solids.js';
import { hash, fract, keys, smooth, easeOut, pulse } from '../motion.js';
import { runeSeal } from '../dungeon.js';
import { drawPlateMark } from '../plating.js';
import { puffs, rockIn, glow as fxGlow, ring as fxRing, particles as fxParticles, scorch as fxScorch } from '../fx.js';
import { col } from '../color.js';
import { markIn, drawMark } from '../marks.js';
import { crack, capIn } from '../rock.js';
import { fragments, drawFragment, crumble, rise } from '../breaking.js';

const lerp = (a, b, u) => a + (b - a) * u;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The number a per-frame table gives for this frame: its entry at ctx.frame, the last one past its end (a lone number: itself). */
export function tableAt(table, ctx, d = 0) {
  if (typeof table === 'number') return table;
  if (!Array.isArray(table) || !table.length) return d;
  const f = Number.isInteger(ctx?.frame) && ctx.frame >= 0 ? ctx.frame : 0;
  const v = table[Math.min(f, table.length - 1)];
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

/** The colour rule for a paint ref moved by `by` steps of value (engine/color.js tone). */
export function toneRule(ref, by) { return { rule: 'tone', of: colourOf(ref), by }; }

/** A per-frame table argument: one number per frame of the clip the call is drawn in. */
const frames = (about, d = [0]) => profile({ default: d, about: `${about}: one number per frame of the clip, the last holding past the end` });
/** The `layer` argument: the body (inked by the asset's outline after it) or only the light drawn after the outline. */
const layerArg = () => word(['body', 'light'], { default: 'body', about: 'The body, or only the light the asset draws after its outline' });

/**
 * The cost of a port drawn on a fixed W x H grid with about `passes` shape tests a pixel over the whole run: the stamps
 * it can return plus that work (engine/gen/pixels.js workCost), as M2's prize items are charged (prize-items.js
 * portCost). Each generator's `passes` was measured at its dearest arguments (review M3 round 1, issue 4): under a
 * load average of about 150 a unit of cost took at most about 0.03 ms, as M2's do. tests/unit/gen-shape-world-props
 * holds every call at hostile arguments to its cost.
 */
const gridCost = (W, H, passes) => tilesFor(W, H) + workCost(W * H * passes);
/** True when a per-frame table breaks the prop on some frame (a value of 0 or more); a table by name may: charged. */
const breaks = (table) => !Array.isArray(table) || table.some((v) => typeof v !== 'number' || v >= 0);
/** A share argument for a cost, 0 to 1 (unset: the middle). */
const share01 = (v) => (typeof v === 'number' && Number.isFinite(v) ? clamp01(v) : 0.5);

/** A local grid in the code's own frame coordinates (W x H, the foot's middle at fx, fy) and how to hand it back placed on `at`. */
function local(at, W, H, fx, fy) {
  const g = new Pixels(0, 0, W, H);
  const dx = Math.round(at[0]) - fx, dy = Math.round(at[1]) - fy;
  return { g, out: (grid = g) => grid.stamps().map((s) => ({ ...s, at: [s.at[0] + dx, s.at[1] + dy] })) };
}

/** A four-point sparkle (engine/fx.js twinkle) on a grid: size 0 one pixel, 1 a plus, 2 a big plus; the centre `core` from size 1 up. */
export function sparkle(g, x, y, size, colour, core) {
  const s = Math.max(0, Math.round(size));
  x = Math.floor(x); y = Math.floor(y);
  for (let i = 1; i <= s; i++) { g.set(x - i, y, colour); g.set(x + i, y, colour); g.set(x, y - i, colour); g.set(x, y + i, colour); }
  g.set(x, y, s ? core : colour);
}

// ---- spring.pad@1: sprites/spring-pad.js -----------------------------------------------------------------------------

/** The pads spring.pad@1 draws: a studded wooden plate, a broad curled leaf, a small drum. */
export const SPRING_PADS = Object.freeze(['plate', 'leaf', 'drum']);
const PAD_THICK = { plate: 5, leaf: 5, drum: 7 };
const PAD_CURL = { plate: 0, leaf: 2, drum: 0 };

/** A coil spring between two points (engine/mech.js coil) with paint refs: far half-turns dark, near ones lit along their upper side. */
function coilOf(g, x0, y0, x1, y1, { turns, width, thick = 2, colour }) {
  const n = Math.max(1, Math.round(turns)), R = rampOf(colour);
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1e-6;
  const nx = -dy / len, ny = dx / len, half = Math.max(0.5, width / 2 - thick / 2);
  const at = (s, side) => [x0 + dx * s + nx * half * side, y0 + dy * s + ny * half * side];
  for (let i = 0; i < n; i++) { const a = at(i / n, 1), b = at((i + 0.5) / n, -1); g.limb(a[0], a[1], b[0], b[1], thick, R.dark); }
  const near = { base: R.base, light: R.light, dark: R.base };
  for (let i = 0; i < n; i++) { const a = at((i + 0.5) / n, -1), b = at((i + 1) / n, 1); g.limb(a[0], a[1], b[0], b[1], thick, near, { shade: 0, light: 1 }); }
}

/**
 * spring.pad@1: a pad on a coil spring that throws whoever lands on it (port of sprites/spring-pad.js): a studded
 * wooden plate, a curled leaf or a small drum on a coil standing on a metal foot. How high the pad's top stands above
 * the ground is `rest`, moved each frame by the tables: `lift` (a share of the way up to the top of its throw, which
 * `bounce` sets), `press` (a share of the way down to the coil squeezed flat; 1 also curls a leaf and dents a drum),
 * `sink` (px down, never past squeezed flat) and `bump` (px up). Pulled long the coil gets thinner, squeezed it bulges.
 */
export const springPad = defineGenerator({
  id: 'spring.pad', v: 1, family: 'shape',
  about: 'A pad (plate, leaf or drum) on a coil spring with a metal foot, squeezed or thrown up frame by frame from tables.',
  args: {
    at: point({ default: [16, 30], about: 'The middle of its foot: the row under its lowest row' }),
    style: word(SPRING_PADS, { default: 'plate', about: 'Plate, leaf or drum' }),
    half: count(8, 13, { default: 11, about: 'Half the pad\'s width, in pixels' }),
    rest: count(12, 19, { default: 16, about: 'How high the pad\'s top stands at rest, in pixels' }),
    coils: count(2, 4, { default: 3, about: 'Turns of the coil' }),
    bounce: share({ default: 0.75, about: 'How high a throw goes: calm to bouncy' }),
    lift: frames('A share of the way up to the top of the throw'),
    press: frames('A share of the way down to the coil squeezed flat'),
    sink: frames('Pixels down, never past squeezed flat'),
    bump: frames('Pixels up'),
    body: paint({ about: 'The pad' }),
    metal: paint({ about: 'The spring and its foot' }),
    skin: paint({ default: 'ink', about: 'A drum\'s skin (lightly tinted by the pad)' }),
  },
  cost: () => gridCost(32, 32, 200),
  run(a, ctx) {
    const GROUND = 29, CX = 16, FOOT = 2;
    const { g, out } = local(a.at, 32, 32, CX, GROUND + 1);
    const th = PAD_THICK[a.style], rest = a.rest, low = FOOT + th + 3;
    const topH = Math.min(Math.round(lerp(rest + 4, 27, a.bounce)), 27 - PAD_CURL[a.style]);
    const press = tableAt(a.press, ctx), squeeze = Math.max(0, rest - low);
    const h = rest + Math.round(tableAt(a.lift, ctx) * (topH - rest)) - Math.round(press * squeeze) - Math.min(tableAt(a.sink, ctx), squeeze) + tableAt(a.bump, ctx);
    const pressed = press >= 1 ? 1 : 0, pull = clamp01((h - rest) / Math.max(1, topH - rest));
    const body = rampOf(a.body), metal = rampOf(a.metal);
    const W = 2 * a.half, top = GROUND + 1 - h, under = top + th;
    const fw = 2 * Math.round(W * 0.3);
    g.rect(CX - fw / 2, GROUND + 1 - FOOT, fw, FOOT, metal, { shade: 0 });
    g.rect(CX - fw / 2, GROUND + 1 - FOOT, fw, 1, metal.light);
    const len = GROUND + 1 - FOOT - under, restLen = rest - th - FOOT;
    const cw = Math.round(W * 0.5 * Math.min(1.2, Math.max(0.62, Math.sqrt(restLen / Math.max(1, len)))));
    coilOf(g, CX, under, CX, GROUND + 1 - FOOT, { turns: a.coils, width: cw, colour: a.metal });
    const x0 = CX - W / 2;
    if (a.style === 'plate') {
      g.rect(x0, top, W, th, body, { shade: 0 });
      g.rect(x0, top, W, 1, body.light);
      g.rect(x0, top + th - 2, W, 2, body.dark);
      for (const x of [x0, x0 + W - 3]) { g.rect(x, top, 3, th, metal, { shade: 0 }); g.rect(x, top, 3, 1, metal.light); g.rect(x, top + th - 1, 3, 1, metal.dark); }
      for (let x = x0 + 5; x <= x0 + W - 7; x += 4) g.rect(x, top + 1, 2, 1, metal.light);
      g.rect(CX - 3, under, 6, 1, metal.dark);
    } else if (a.style === 'leaf') {
      const lift = 2 + pressed - Math.round(2.4 * pull), mid = top + th / 2;
      g.blob([
        ellipseIn(CX, mid + 0.2, W / 2 - 1, th / 2 + 0.2),
        capsuleIn(CX + W / 2 - 5, mid, CX + W / 2 - 0.6, mid - lift, 1.8, 0.7),
        capsuleIn(CX - W / 2 + 4, mid + 0.5, CX - W / 2 + 0.8, mid - lift * 0.6, 1.3, 0.8),
      ], body, { shade: 1 });
      g.rect(x0 + 4, top + 1, W - 9, 1, body.light);
      g.rect(x0 + 3, top + 2, W - 7, 1, body.dark);
      for (let x = x0 + 5; x < x0 + W - 5; x += 3) g.dot(x, top + 3, body.dark);
      g.rect(CX - 1, under - 1, 2, 2, body.dark);
    } else {
      const skin = rampOf({ rule: 'mix', of: colourOf(a.skin), with: colourOf(a.body), amount: 0.12 });
      g.rect(x0 + 1, top + 2, W - 2, th - 2, body, { shade: 0 });
      g.rect(x0 + 1, top + th - 2, W - 2, 1, body.dark);
      for (let x = x0 + 2, i = 0; x < x0 + W - 2; x++, i++) g.dot(x, top + 3 + [0, 1, 2, 1][i % 4], skin.base);
      g.rect(x0, top + 1, W, 1, metal.base); g.rect(x0, top + th - 1, W, 1, metal.dark);
      g.rect(x0 + 1, top, W - 2, 1, skin.light);
      if (pressed) g.rect(x0 + 5, top, W - 10, 1, skin.dark);
    }
    return out();
  },
});

// ---- spikes@1: sprites/spike-trap.js ---------------------------------------------------------------------------------

/** What spikes@1's spikes are: straight metal cones, curved bone tusks, hooked thorns or cut crystal points. */
export const SPIKE_STYLES = Object.freeze(['metal', 'bone', 'thorn', 'crystal']);
const SPIKES = {
  metal: { tall: [1, 1, 1, 1, 1], half: (k, hw) => 0.5 + (hw + 0.4) * k, shift: () => 0 },
  bone: { tall: [0.9, 1, 0.84, 1, 0.9], half: (k, hw) => 0.6 + (hw * 0.72 - 0.6) * k ** 0.6, shift: (k, hw, side, lean) => lean * hw * 0.5 * (1 - k) ** 2 },
  thorn: { tall: [1, 0.86, 1, 0.9, 1], half: (k, hw) => 0.9 + (hw - 0.9) * k ** 1.3, shift: (k, hw) => hw * 0.7 * (1 - k) ** 1.6 },
  crystal: { tall: [0.74, 1, 0.66, 0.92, 0.8], half: (k, hw) => (k < 0.3 ? 0.5 + (hw * 0.85 - 0.5) * (k / 0.3) : hw * (0.85 + (0.15 * (k - 0.3)) / 0.7)), shift: (k, hw, side) => side * hw * 0.55 * Math.max(0, 1 - k / 0.3) },
};

/**
 * spikes@1: a row of floor spikes across one 28-pixel tile (port of sprites/spike-trap.js) that slide out of the floor:
 * each spike is drawn whole at its height for the frame and cut at the ground line, lit from the top right, its top
 * rows in the tip colour, over an optional base plate with a slot under each spike. `out` (table) is how far out they
 * are (0: only the tips show), `over` px more while fully out, `odd` and `even` px more for alternate spikes (a
 * twitch). `layer: "light"` draws the glints of two tips on the frames `glint` gives 1.
 */
export const spikes = defineGenerator({
  id: 'spikes', v: 1, family: 'shape',
  about: 'A row of floor spikes (metal, bone, thorn or crystal) that slide out of the floor by tables, over an optional base plate.',
  args: {
    at: point({ default: [16, 30], about: 'The middle of the row on the ground: the row under the lowest row' }),
    style: word(SPIKE_STYLES, { default: 'metal', about: 'Metal cones, bone tusks, hooked thorns or crystal points' }),
    count: count(3, 5, { default: 4, about: 'How many spikes' }),
    length: count(12, 22, { default: 17, about: 'How long a spike is, in pixels' }),
    base: flag({ default: true, about: 'A base plate the spikes come through' }),
    out: frames('How far out they are: 0 only the tips show, 1 fully out', [1]),
    over: frames('Pixels more while fully out'),
    odd: frames('Pixels more for the first, third ... spike'),
    even: frames('Pixels more for the second, fourth ... spike'),
    glint: frames('1 where two tips glint (layer light)'),
    layer: layerArg(),
    body: paint({ about: 'What the spikes are made of' }),
    tip: paint({ about: 'The tips' }),
    plate: paint({ about: 'The base plate' }),
    shine: paint({ default: 'ink', about: 'The core of a glint' }),
  },
  cost: () => gridCost(32, 32, 240),
  run(a, ctx) {
    const GROUND = 29, X0 = 2, WIDTH = 28, PLATE = 4;
    const { g, out } = local(a.at, 32, 32, 16, GROUND + 1);
    const S = SPIKES[a.style], n = a.count, body = rampOf(a.body), tip = rampOf(a.tip);
    const pitch = WIDTH / n, hw = pitch / 2 - 0.4, least = a.base ? PLATE + 3 : 4;
    const reach = tableAt(a.out, ctx, 1), over = tableAt(a.over, ctx), twitch = (i) => tableAt(i % 2 ? a.even : a.odd, ctx);
    const above = (px, py) => px >= X0 && px < X0 + WIDTH && py < GROUND + 1;
    const tops = [];
    for (let i = 0; i < n; i++) {
      const full = Math.max(least + 2, Math.round(a.length * S.tall[(i + (n === 3 ? 1 : 0)) % 5]));
      const shown = Math.round(lerp(least, full, reach)) + (reach === 1 ? over : 0) + twitch(i);
      const xc = X0 + pitch * (i + 0.5), top = GROUND + 1 - shown, side = i % 2 ? -1 : 1;
      const lean = Math.sign(Math.round(16 - xc));
      const red = Math.max(3, Math.round(full * 0.26));
      const half = (k) => S.half(k, hw), shift = (k) => S.shift(k, hw, side, lean);
      const foot = top + full, shank = Math.max(0, GROUND + 1 - foot);
      const spike = spikeIn(xc, top, foot, half, shift, shank);
      const thick = spikeIn(xc, top, foot, (k) => (half(k) >= 2.4 ? half(k) : -1), shift, shank);
      const face = spikeIn(xc, top, foot, (k) => half(k) * 0.425, (k) => shift(k) + half(k) * 0.575, shank);
      const box = [xc - pitch, top, xc + pitch, GROUND + 1];
      const paintRows = (R, rows) => {
        g.fill(...box, spike, R.base, { clip: rows });
        g.fill(...box, thick, R.dark, { clip: (px, py) => rows(px, py) && !spike(px - 1, py) });
        g.fill(...box, face, R.light, { clip: (px, py) => rows(px, py) && spike(px, py) });
      };
      if (a.layer === 'body') {
        paintRows(body, above);
        paintRows(tip, (px, py) => above(px, py) && py < top + red);
      }
      tops.push([Math.round(xc + S.shift(0, hw, side, lean) - 0.5), top]);
    }
    if (a.layer === 'light') {
      if (tableAt(a.glint, ctx) >= 1) for (const i of [0, n - 2]) sparkle(g, tops[i][0], tops[i][1] - 1, 1, body.light, a.shine);
      return out();
    }
    if (a.base) {
      const plate = rampOf(a.plate), y = GROUND + 1 - PLATE;
      g.rect(X0, y, WIDTH, PLATE, plate.base);
      g.rect(X0, y, WIDTH, 1, plate.light);
      g.rect(X0, GROUND, WIDTH, 1, plate.dark);
      for (let i = 0; i < n; i++) g.rect(Math.round(X0 + pitch * (i + 0.5) - hw), y, Math.round(2 * hw), 1, plate.dark);
      for (const x of [X0 + 1, X0 + WIDTH - 3]) g.rect(x, y + 2, 2, 1, plate.light);
    }
    return out();
  },
});

// ---- signpost@1: sprites/signpost.js ----------------------------------------------------------------------------------

/** The builds signpost@1 draws: an arrow board, a plain board nailed off-centre, a board hanging from an arm. */
export const SIGN_STYLES = Object.freeze(['arrow', 'board', 'hanging']);
/** The pictures a signpost's board can carry (engine/marks.js marks). */
export const SIGN_MARKS = Object.freeze(['none', 'arrow', 'skull', 'exclaim']);

/** A copy of a grid leaned by sliding whole rows (engine/surface.js lean): each row moves slope px per px above row py. */
export function leanedRows(src, py, slope) {
  const out = src.blank();
  for (let y = src.y0; y < src.y0 + src.h; y++) {
    const dx = Math.round((py - (y + 0.5)) * slope);
    for (let x = src.x0; x < src.x0 + src.w; x++) { const c = src.get(x - dx, y); if (c !== null) out.set(x, y, c); }
  }
  return out;
}

/** How far a grid's picture may lean before it leaves the frame (engine/surface.js leanRoom): slope per px of height. */
function leanRoomOf(src, py, margin = 2) {
  const b = src.bounds();
  if (!b || py - b.y0 <= 0) return 0;
  return Math.max(0, Math.min(b.x0 - src.x0 - margin, src.x0 + src.w - margin - 1 - b.x1)) / (py - b.y0);
}

/**
 * signpost@1: a wooden sign on a post with a picture instead of words (port of sprites/signpost.js): an arrow board, a
 * plain board of two planks nailed off-centre or a board hanging on two chains from an arm with braces, pointing right,
 * left or both ways; cracked, chipped and hung crooked as `wear` grows; moss at its foot and on its board when
 * `mossy`. `sway` (table: slope per px of height, as far as the frame has room) leans the whole sign from the foot of
 * its post, a hanging board lagging a pixel behind.
 */
export const signpost = defineGenerator({
  id: 'signpost', v: 1, family: 'shape',
  about: 'A wooden signpost (arrow board, plain board or hanging board) with a picture mark, worn, mossy and swaying by a table.',
  args: {
    at: point({ default: [16, 46], about: 'The middle of the post\'s foot: the row under its lowest row' }),
    style: word(SIGN_STYLES, { default: 'arrow', about: 'Arrow board, plain board or hanging board' }),
    points: word(['right', 'left', 'both'], { default: 'right', about: 'Which way it points' }),
    mark: word(SIGN_MARKS, { default: 'none', about: 'The picture on the board' }),
    tall: count(22, 38, { default: 30, about: 'How tall the post is, in pixels' }),
    mossy: flag({ default: false, about: 'Moss at its foot and on its board' }),
    wear: share({ default: 0.25, about: 'New to worn: cracks, a chipped corner, a crooked board' }),
    sway: frames('How far it leans: px sideways per px of height (0.13 the most)'),
    wood: paint({ about: 'The wood' }),
    moss: paint({ about: 'The moss' }),
    chain: paint({ about: 'The chains of a hanging board' }),
    markPaint: paint({ default: 'ink', about: 'The picture: a colour that stands out against the wood' }),
  },
  cost: () => gridCost(32, 48, 224),
  run(a, ctx) {
    const W = 32, H = 48, GROUND = 45;
    const draw = (swing) => {
      const g = new Pixels(0, 0, W, H);
      const tall = a.tall, topY = GROUND + 1 - tall, side = a.points === 'right' ? 1 : a.points === 'left' ? -1 : 0;
      const flip = (x, w = 0) => (side < 0 ? W - x - w : x);
      let L;
      if (a.style === 'hanging') {
        const post = side === 0 ? 15 : flip(7, 3), arm = side === 0 ? [6, 20] : [flip(7, 19), 19], board = side === 0 ? [8, 16] : [flip(11, 15), 15];
        L = { post, arm, bx: board[0], bw: board[1], by: topY + 6, bh: 10, mark: 7 };
      } else if (a.style === 'board') L = { post: 15, bx: side > 0 ? 9 : 5, bw: side === 0 ? 22 : 18, by: topY + 2, bh: 11, mark: 9 };
      else L = { post: 15, bx: side > 0 ? 5 : 9, bw: side === 0 ? 14 : 18, by: topY + 2, bh: 9, mark: 7 };
      const { bx, bw, by, bh } = L, x1 = bx + bw, y1 = by + bh, yc = by + bh / 2;
      const whole = a.style !== 'arrow'
        ? (px, py) => px >= bx && px < x1 && py >= by && py < y1 && !((px < bx + 1 || px >= x1 - 1) && (py < by + 1 || py >= y1 - 1))
        : side > 0 ? polyIn([[bx, by], [x1, by], [x1 + 4.5, yc], [x1, y1], [bx, y1], [bx + 2.5, yc]])
          : side < 0 ? polyIn([[x1, by], [bx, by], [bx - 4.5, yc], [bx, y1], [x1, y1], [x1 - 2.5, yc]])
            : polyIn([[bx, by], [x1, by], [x1 + 4.5, yc], [x1, y1], [bx, y1], [bx - 4.5, yc]]);
      const picture = () => {
        const cx = Math.floor(bx + bw / 2), cy = by + (bh >> 1);
        if (a.mark !== 'arrow') return markIn(a.mark, cx, cy, L.mark);
        if (side !== 0) return markIn('arrow', cx, cy, L.mark, { flip: side < 0 });
        const half = L.mark >= 9 ? 7 : 5, off = L.mark >= 9 ? 2 : 1;
        const right = markIn('arrow', cx + off, cy, half), left = markIn('arrow', cx - off, cy, half, { flip: true });
        return (px, py) => right(px, py) || left(px, py);
      };
      const wood = rampOf(a.wood), moss = rampOf(a.moss), behind = rampOf(toneRule(a.wood, -0.5)), worn = a.wear;
      g.rect(L.post, topY, 3, GROUND + 1 - topY, behind, { light: 1 });
      g.rect(L.post, topY, 3, 1, wood.light);
      if (worn > 0.7) crack(g, L.post + 1, GROUND - 3, Math.PI, 6, wood.deep, { seed: 5, clip: rectIn(L.post, topY, 3, 99), branch: false });
      if (a.style === 'hanging') {
        const [ax, aw] = L.arm, ay = topY + 2;
        g.rect(ax, ay, aw, 2, wood, { light: 1 });
        for (const dir of side === 0 ? [-1, 1] : [side]) g.limb(L.post + 1 + dir * 2, ay + 6, L.post + 1 + dir * 6, ay + 2, 1, wood.dark);
        for (const cx of [bx + 2, bx + bw - 3]) g.rect(cx + swing, ay + 2, 1, 2, a.chain);
      }
      let b = g.blank();
      const chip = worn > 0.45 ? polyIn([[bx + bw - 4, by + bh + 1], [bx + bw + 1, by + bh - 4], [bx + bw + 6, by + bh + 1]]) : null;
      const board = chip && a.style !== 'arrow' ? (px, py) => whole(px, py) && !chip(px, py) : whole;
      b.fill(bx - 6, by, bx + bw + 6, by + bh, board, wood, { shade: 1, light: 1 });
      if (a.style === 'board') b.fill(bx, by + 5, bx + bw, by + 6, (px, py) => py >= by + 5 && py < by + 6 && board(px, py), wood.dark);
      if (worn > 0.15) crack(b, bx + Math.round(bw * 0.3), by, 0.3, lerp(2, 7, worn), wood.dark, { seed: 2, clip: board, branch: worn > 0.6 });
      if (worn > 0.5) crack(b, bx + bw - 5, by + bh - 1, Math.PI - 0.3, lerp(2, 6, worn), wood.deep, { seed: 4, clip: board, branch: false });
      if (worn > 0.45 && a.style === 'arrow') b.fill(bx, by + bh - 2, bx + bw, by + bh, (px, py) => board(px, py) && py >= by + bh - 1 && Math.abs(px - (bx + bw * 0.62)) < 1.5, wood.deep);
      if (a.mark !== 'none') b.fill(bx, by, bx + bw, by + bh, picture(), a.markPaint, { clip: board });
      if (a.mossy) b.fill(bx - 6, by - 2, bx + bw + 6, by + bh, capIn(board, [bx - 6, by - 1, bx + bw + 6, by + bh], { depth: 2, rise: 1, ragged: 2, seed: 3 }), moss);
      if (worn > 0.6) b = tilted(b, bx + bw / 2, by + bh / 2, lerp(0.04, 0.1, (worn - 0.6) / 0.4) * (side < 0 ? -1 : 1));
      g.blit(b, a.style === 'hanging' ? swing : 0, 0);
      if (a.style !== 'hanging') { g.rect(L.post + 1, by + 2, 1, 1, wood.deep); g.rect(L.post + 1, by + bh - 3, 1, 1, wood.deep); }
      if (a.mossy) {
        g.rect(L.post - 2, GROUND - 1, 7, 2, moss); g.rect(L.post - 1, GROUND - 3, 2, 2, moss); g.rect(L.post + 2, GROUND - 2, 2, 1, moss);
        if (a.style !== 'hanging') g.rect(L.post, topY - 1, 2, 1, moss.base);
      }
      return g;
    };
    const sway = tableAt(a.sway, ctx);
    let g;
    if (!sway) g = draw(0);
    else {
      const slope = sway * Math.min(1, leanRoomOf(draw(0), GROUND + 1) / 0.13);
      const s = draw(-Math.sign(sway) * (Math.abs(sway) > 0.06 ? 1 : 0));
      g = slope ? leanedRows(s, GROUND + 1, slope) : s;
    }
    const dx = Math.round(a.at[0]) - 16, dy = Math.round(a.at[1]) - (GROUND + 1);
    return g.stamps().map((st) => ({ ...st, at: [st.at[0] + dx, st.at[1] + dy] }));
  },
});

// ---- light: engine/fx.js steps, stepAt and rays with paint refs ------------------------------------------------------

/** The colour steps of a light, hottest first (engine/fx.js steps): [white, core, mid, edge, rim] as paint refs. */
export function lightSteps(edge, white) {
  const core = toneRule(edge, 1.6);
  return [white, core, { rule: 'mix', of: core, with: colourOf(edge), amount: 0.5 }, edge, toneRule(edge, -1)];
}
const stepOf = (list, heat) => list[Math.round((1 - clamp01(heat)) * (list.length - 1))];

/** Beams of light fanning out from (x, y) (engine/fx.js rays): 1 px dashed lines from r0 to r1, hottest near the point, kept in box. */
function raysOf(g, { x, y, count = 5, angle = Math.PI, arc = Math.PI / 2, r0 = 2, r1 = 12, dash = 3, gap = 2, phase = 0, seed = 0, colours, box }) {
  if (r1 <= r0) return;
  const step = dash + gap, inBox = (px, py) => px >= box[0] && py >= box[1] && px < box[2] && py < box[3];
  for (let i = 0; i < count; i++) {
    const a = angle + (count === 1 ? 0 : (i / (count - 1) - 0.5) * arc), sx = Math.sin(a), sy = Math.cos(a);
    const reachOf = r0 + (r1 - r0) * (0.7 + 0.3 * hash(i, seed * 64 + 2)), shift = hash(i, seed * 64 + 3) * step;
    let last = null;
    for (let d = r0; d <= reachOf; d += 0.5) {
      const px = Math.floor(x + sx * d), py = Math.floor(y + sy * d);
      if (last && last[0] === px && last[1] === py) continue;
      last = [px, py];
      if (gap > 0 && fract((d - shift) / step - phase) >= dash / step) continue;
      if (inBox(px, py)) g.set(px, py, stepOf(colours, 1 - (d - r0) / (r1 - r0)));
    }
  }
}

/** What shows in an open box's mouth, by a table's number: 0 dark (shut, or emptied), 1 white (the flash), 2 its light. */
const INSIDE = ['dark', 'white', 'glow'];
const insideAt = (a, ctx) => INSIDE[Math.max(0, Math.min(2, Math.round(tableAt(a.inside, ctx))))];

// ---- chest@1: sprites/treasure-chest.js -------------------------------------------------------------------------------

/** The chests chest@1 and chest.topdown@1 draw: wooden with straps, iron-bound and riveted, royal with gold corners and feet. */
export const CHEST_STYLES = Object.freeze(['wooden', 'iron', 'royal']);

/**
 * chest@1: a banded treasure chest seen from the front whose lid swings up and back (port of sprites/treasure-chest.js):
 * shut, the domed lid sits on the box with its lock; open, the lid stands behind the box showing its lining, the
 * mouth between them lit (or dark when emptied) with coins and two gems heaped over the front edge when `gems`. Tables:
 * `open` (how far the lid stands up, 1 at rest; 0 shut), `lift` (px a shut lid has jumped), `wide` and `tall` (squash
 * and stretch of the box), `inside` (0 dark, 1 white, 2 lit). Light (`layer: "light"`): `glint` (where the glint along
 * the shut lid's edge is, 0 to 1; below 0 none) and `lock` (1 or 2: the glint crossing the lock), `beam` (how far the
 * rays reach; 0 none), `hot` (1: white-hot rays, the flash), `phase` (the dashes travelling out), `flick` (0 or 1: the
 * two sparkles at the lid's corners trade places).
 */
export const chest = defineGenerator({
  id: 'chest', v: 1, family: 'shape',
  about: 'A banded treasure chest seen from the front whose lid swings open on a lit mouth heaped with treasure, frame by frame from tables.',
  args: {
    at: point({ default: [16, 30], about: 'The middle of its foot: the row under its lowest row' }),
    style: word(CHEST_STYLES, { default: 'wooden', about: 'Wooden, iron-bound or royal' }),
    size: share({ default: 0.5, about: 'Small to big' }),
    lid: share({ default: 0.6, about: 'Flat to domed lid' }),
    gems: flag({ default: true, about: 'Treasure heaped in the open chest' }),
    open: frames('How far the lid stands up: 0 shut, 1 at rest'),
    lift: frames('Pixels a shut lid has jumped'),
    wide: frames('Pixels wider on each side (squash)'),
    tall: frames('Pixels taller (stretch)'),
    inside: frames('What shows in the mouth: 0 dark, 1 white, 2 lit'),
    glint: frames('Where the glint on the shut lid\'s edge is, 0 to 1 (below 0: none)', [-1]),
    lock: frames('The glint crossing the lock: 0 none, 1 or 2'),
    beam: frames('How far the rays reach (0: none)'),
    hot: frames('1: the rays are white-hot'),
    phase: frames('How far the rays\' dashes have travelled'),
    flick: frames('0 or 1: the corner sparkles trade places'),
    layer: layerArg(),
    wood: paint({ about: 'The wood' }),
    metal: paint({ about: 'The bands and the lock' }),
    inner: paint({ about: 'The light inside' }),
    gold: paint({ about: 'The coins' }),
    gem: paint({ about: 'The cut gem' }),
    ruby: paint({ about: 'The red stone (and a royal lock)' }),
    shine: paint({ about: 'White: a flash and the glints' }),
  },
  cost: () => gridCost(32, 32, 150),
  run(a, ctx) {
    const W = 32, CX = 16, GROUND = 29;
    const { g, out } = local(a.at, W, W, CX, GROUND + 1);
    const hw0 = Math.round(lerp(8, 12, a.size)), BH0 = Math.round(lerp(8, 11, a.size));
    const LH = Math.max(3, Math.round(lerp(4, 8, a.lid) * lerp(0.85, 1.1, a.size))), feet = a.style === 'royal' ? 2 : 0, boxy = lerp(7, 2.3, a.lid);
    const openK = tableAt(a.open, ctx), lift = tableAt(a.lift, ctx), wide = tableAt(a.wide, ctx), tall = tableAt(a.tall, ctx), inside = insideAt(a, ctx);
    const wood = rampOf(a.wood), metal = rampOf(a.metal), gold = rampOf(a.gold);
    const x0 = CX - hw0 - wide, bw = 2 * (hw0 + wide), x1 = x0 + bw;
    const BH = BH0 + tall, bottom = GROUND - feet, topY = bottom + 1 - BH;
    const hole = toneRule(a.metal, -1.9), glowing = inside !== 'dark', dark = toneRule(a.wood, -2.3);
    let lidTop = topY, lockTop = topY;
    if (a.layer === 'body') {
      if (openK) {
        const room = topY - 3 - 2, h = Math.min(room, Math.round((LH + 2) * openK));
        lidTop = topY - 3 - h;
        const yb = topY - 3, lidT = clippedIn(squircleIn(CX, yb - 0.5, hw0 + wide, h, boxy), -Infinity, yb - h, Infinity, yb);
        const lining = glowing ? { rule: 'mix', of: toneRule(a.wood, -1.1), with: colourOf(a.inner), amount: 0.3 } : toneRule(a.wood, -1.3);
        g.fill(x0, topY - 3 - h, x1, topY - 3, lidT, metal, { light: 1 });
        g.fill(x0, topY - 3 - h, x1, topY - 3, insetIn(lidT, a.style === 'wooden' ? 1 : 2), { base: lining, dark: toneRule(lining, -0.8), light: lining }, { shade: 1 });
        const mouth = inside === 'white' ? a.shine : inside === 'glow' ? { rule: 'mix', of: colourOf(a.inner), with: colourOf(a.shine), amount: 0.6 } : dark;
        g.rect(x0 + 1, topY - 3, bw - 2, 3, mouth);
        if (inside === 'glow') g.rect(x0 + 1, topY - 3, bw - 2, 1, a.inner);
        if (a.gems && glowing) {
          const r = hw0 - 3;
          g.blob([ellipseIn(CX, topY - 1, r, 3.6), ellipseIn(CX - r * 0.45, topY - 1.5, r * 0.5, 3.4), ellipseIn(CX + r * 0.5, topY - 1, r * 0.45, 2.6)], gold, { light: 1 });
          for (const [dx, dy] of [[-3, -2], [1, -3], [4, -1], [-1, -1]]) g.rect(CX + dx, topY + dy, 2, 1, gold.dark);
          const gx = Math.round(CX - r * 0.55);
          g.fill(gx - 3, topY - 7, gx + 3, topY - 1, polyIn([[gx, topY - 6.5], [gx + 2.5, topY - 4], [gx, topY - 1.5], [gx - 2.5, topY - 4]]), a.gem);
          g.rect(gx, topY - 5, 1, 1, a.shine);
          g.rect(Math.round(CX + r * 0.45), topY - 4, 2, 2, a.ruby);
        }
      } else if (lift) g.rect(x0 + 1, topY - lift, bw - 2, lift, inside === 'white' ? a.shine : dark);
      g.rect(x0, topY, bw, BH, wood, { shade: 2 });
      for (const k of BH >= 10 ? [1 / 3, 2 / 3] : [1 / 2]) g.rect(x0, topY + Math.round(BH * k), bw, 1, wood.dark);
      const straps = [x0 + 2, x1 - 4];
      if (a.style === 'wooden') for (const sx of straps) g.rect(sx, topY, 2, BH, metal, { light: 1 });
      else if (a.style === 'iron') {
        g.rect(x0, topY, 2, BH, metal); g.rect(x1 - 2, topY, 2, BH, metal, { light: 1 }); g.rect(x0, topY, bw, 1, metal.light);
        g.rect(x0 - 1, bottom - 1, bw + 2, 2, metal, { shade: 1 });
        for (const rx of [x0, x1 - 1]) for (const ry of [topY + 2, bottom - 3]) g.dot(rx + (rx === x0 ? 1 : -1), ry, metal.dark);
      } else {
        g.rect(x0, topY, bw, 1, metal.light); g.rect(x0, bottom, bw, 1, metal.dark);
        for (const cxr of [x0, x1 - 3]) { g.rect(cxr, topY, 3, 3, metal, { light: 1 }); g.rect(cxr, bottom - 2, 3, 3, metal, { shade: 1 }); }
        g.rect(x0 + 1, bottom + 1, 3, feet, metal, { shade: 1 }); g.rect(x1 - 4, bottom + 1, 3, feet, metal, { shade: 1 });
      }
      if (!openK) {
        const yb = topY - lift, h = LH, half = hw0 + wide + 1;
        const lidT = clippedIn(squircleIn(CX, yb - 0.5, half, h, boxy), -Infinity, yb - h, Infinity, yb);
        const box = [x0 - 1, yb - h, x1 + 1, yb];
        if (a.style === 'wooden') {
          g.fill(...box, lidT, wood, { shade: 1, light: 1 });
          for (const sx of straps) g.fill(sx, yb - h, sx + 2, yb, clippedIn(lidT, sx, -Infinity, sx + 2, Infinity), metal, { light: 1 });
        } else {
          g.fill(...box, lidT, metal, { shade: 1, light: 1 });
          g.fill(...box, insetIn(lidT, a.style === 'iron' ? 2 : 1), wood, { shade: 0 });
          if (a.style === 'iron') g.fill(CX - 1, yb - h, CX + 1, yb, clippedIn(lidT, CX - 1, -Infinity, CX + 1, Infinity), metal, { light: 1 });
        }
        if (h >= 6 && a.style !== 'iron') g.fill(...box, clippedIn(insetIn(lidT, 2), -Infinity, yb - (h >> 1) - 1, Infinity, yb - (h >> 1)), wood.dark);
        g.fill(x0 - 1, yb - 1, x1 + 1, yb, clippedIn(lidT, -Infinity, yb - 1, Infinity, Infinity), metal, { light: 1 });
        if (a.style === 'royal') { g.rect(CX - 2, yb - h - 1, 4, 1, metal); g.rect(CX - 1, yb - h - 2, 2, 1, metal.light); }
        lockTop = yb - 2;
      }
      g.rect(CX - 2, lockTop, 4, topY + 3 - lockTop + 1, metal, { light: 1, ...(a.style === 'iron' ? { outline: 'ink' } : {}) });
      g.rect(CX - 1, topY + 1, 2, 2, a.style === 'royal' ? a.ruby : hole);
      return out();
    }
    // light, after the asset's outline
    if (!openK) {
      const at = tableAt(a.glint, ctx, -1), lk = tableAt(a.lock, ctx);
      if (at >= 0) {
        g.rect(Math.round(lerp(x0, x1 - 2, at)), topY - 1, 2, 1, a.shine);
        if (lk >= 1) { const k = lk - 1; g.rect(CX - 2 + k * 2, topY - lift - 2, 2, 2, a.shine); sparkle(g, CX - 2 + k * 3, topY - lift - 3, lk, toneRule(a.metal, 0.9), a.shine); }
      }
      return out();
    }
    const beam = tableAt(a.beam, ctx);
    if (!beam) return out();
    const room = topY - 3 - 2, h = Math.min(room, Math.round((LH + 2) * openK));
    lidTop = topY - 3 - h;
    const C = lightSteps(a.inner, a.shine), hot = tableAt(a.hot, ctx) >= 1, flick = tableAt(a.flick, ctx) >= 1 ? 1 : 0;
    const from = topY - 3 - lidTop + 2, reach = from + lerp(4, 7, a.size) * beam;
    raysOf(g, { x: CX, y: topY - 3, count: 5, angle: Math.PI, arc: Math.PI * 0.5, r0: from, r1: reach, dash: 2, gap: hot ? 0 : 1, phase: tableAt(a.phase, ctx), seed: 2, colours: hot ? [a.shine, C[1]] : [C[1], C[2]], box: [1, 1, W - 1, lidTop - 1] });
    sparkle(g, x0 + 1, lidTop + 1 + flick, hot ? 2 : 1, C[1], a.shine);
    sparkle(g, x1 - 2, lidTop + 3 - flick, flick, C[1], a.shine);
    return out();
  },
});

// ---- solids with paint refs: engine/solids.js extrude, bandIn, wallFill -------------------------------------------------

const isRampObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.hasOwn(v, 'base') && !Object.hasOwn(v, 'rule');

/**
 * The two ramps of a solid lit from above (engine/solids.js faceRamps) as paint refs: the top a step lighter than the
 * wall; with no top colour given, both through the faceTone colour rule, so a colour too pale to go lighter keeps the
 * code's fallback (its top in itself, its wall a step darker) under every colour, swatch or not.
 */
export function faceRampsOf(colour, topColour) {
  if (topColour === undefined) {
    const face = (f, t) => ({ rule: 'faceTone', of: colourOf(colour), face: f, tone: t });
    return { wall: { base: face('wall', 'base'), light: face('wall', 'light'), dark: face('wall', 'dark'), deep: face('wall', 'deep') },
      top: { light: face('top', 'light'), base: face('top', 'base'), dark: face('top', 'dark') } };
  }
  return { wall: rampOf(colour), top: { light: toneRule(topColour, 0.8), base: topColour, dark: toneRule(topColour, -0.5) } };
}

/** An upright solid in three-quarter view from its top face (engine/solids.js extrude) on a grid, with paint refs; returns the solid's geometry and ramps. */
export function extrudeOn(g, top, h, colour, { topColour, lip = 0, shade = 1, turn = 0.22, box } = {}) {
  const S = solid(top, h, box ?? [g.x0, g.y0, g.x0 + g.w, g.y0 + g.h]);
  const R = faceRampsOf(colour, topColour);
  S.ramps = R;
  if (!S.box) return S;
  const [x0, y0, x1, y1] = S.box, opt = { shade, turn, shadow: g.shadow };
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const px = x + 0.5, py = y + 0.5;
    if (top(px, py) || !S.wall(px, py)) continue;
    g.set(x, y, R.wall[S.shadeOf(px, py, opt)]);
  }
  g.fill(x0, y0, x1, y1, top, { base: R.top.base, light: R.top.light, dark: R.top.base }, { shade: 0, light: lip > 0 ? 0 : 1 });
  if (lip > 0) g.fill(x0, y0, x1, y1, (px, py) => top(px, py) && !(top(px - lip, py) && top(px + lip, py) && top(px, py - lip) && top(px, py + lip)), R.top.light);
  return S;
}

/** A band round a solid's wall `from` rows below its top's front edge (engine/solids.js bandIn). */
export function bandOf(S, from, thick = 1, { x0 = -Infinity, x1 = Infinity } = {}) {
  return (px, py) => { if (px < x0 || px >= x1 || !S.wall(px, py)) return false; const d = S.drop(px, py); return d >= from && d < from + thick; };
}

/** Part of a solid's wall painted another colour, shaded like the wall (engine/solids.js wallFill), with paint refs. */
export function wallFillOn(g, S, inside, colour, { shade = 1, turn = 0.22, flat = false } = {}) {
  if (!S.box) return g;
  const R = isRampObj(colour) ? colour : rampOf(colour), opt = { shade, turn, shadow: g.shadow };
  const [x0, y0, x1, y1] = S.box;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const px = x + 0.5, py = y + 0.5;
    if (!S.wall(px, py) || !inside(px, py)) continue;
    g.set(x, y, flat ? R.base : R[S.shadeOf(px, py, opt)]);
  }
  return g;
}

// ---- chest.topdown@1: sprites/chest-topdown.js -------------------------------------------------------------------------

/**
 * chest.topdown@1: the treasure chest of chest@1 seen on a top-down map, from above and in front (port of
 * sprites/chest-topdown.js): shut, the lid's top face takes the upper part and the front face with the lock the rest;
 * open, the lid is thrown back and stands behind the box showing its lining, the mouth lies open on top (lit, or dark
 * when emptied) with treasure heaped in it. The same tables and light layer as chest@1.
 */
export const chestTopdown = defineGenerator({
  id: 'chest.topdown', v: 1, family: 'shape',
  about: 'A banded treasure chest seen from above and in front whose lid is thrown back on a lit mouth heaped with treasure, frame by frame from tables.',
  args: { ...chest.args },
  cost: () => gridCost(32, 32, 260),
  run(a, ctx) {
    const W = 32, CX = 16, GROUND = 29;
    const { g, out } = local(a.at, W, W, CX, GROUND + 1);
    const D = { hw: Math.round(lerp(8, 11, a.size)), depth: Math.round(lerp(5, 7, a.size)), h: Math.round(lerp(6, 8, a.size)),
      lidH: Math.round(lerp(2, 5, a.lid)), boxy: lerp(9, 3, a.lid), feet: a.style === 'royal' ? 1 : 0 };
    const openK = tableAt(a.open, ctx), lift = tableAt(a.lift, ctx), inside = insideAt(a, ctx);
    const wood = rampOf(a.wood), metal = rampOf(a.metal), gold = rampOf(a.gold);
    const hw = D.hw + tableAt(a.wide, ctx), h = D.h + tableAt(a.tall, ctx) - D.feet, x0 = CX - hw, x1 = CX + hw, bw = 2 * hw;
    const bottom = GROUND - D.feet, yF = bottom + 1 - h, yB = yF - D.depth;
    const hole = toneRule(a.wood, -2.3), glowing = inside !== 'dark';
    const strap = (px) => (px >= x0 + 2 && px < x0 + 4) || (px >= x1 - 4 && px < x1 - 2);
    const wooden = a.style === 'wooden', iron = a.style === 'iron';
    const lit = faceRampsOf(a.wood, { rule: 'mix', of: colourOf(a.wood), with: colourOf(wood.light), amount: 0.3 }).top;
    const lidTopOpen = () => yB - Math.min(yB - 2, Math.round((D.depth + D.lidH) * 0.85 * openK));
    if (a.layer === 'light') {
      if (!openK) {
        const at = tableAt(a.glint, ctx, -1), lk = tableAt(a.lock, ctx);
        if (at >= 0) {
          g.rect(Math.round(lerp(x0, x1 - 2, at)), yF - 1 - lift, 2, 1, a.shine);
          if (lk >= 1) { const k = lk - 1, lockY = yF - 2 - lift; g.rect(CX - 2 + k * 2, lockY, 2, 2, a.shine); sparkle(g, CX - 2 + k * 3, lockY - 1, lk, toneRule(a.metal, 0.9), a.shine); }
        }
        return out();
      }
      const beam = tableAt(a.beam, ctx);
      if (!beam) return out();
      const lidTop = lidTopOpen(), C = lightSteps(a.inner, a.shine), hot = tableAt(a.hot, ctx) >= 1, flick = tableAt(a.flick, ctx) >= 1 ? 1 : 0;
      const reach = yB - lidTop + lerp(5, 8, a.size) * beam;
      raysOf(g, { x: CX, y: yB + 2, count: 5, angle: Math.PI, arc: Math.PI * 0.55, r0: yB - lidTop + 3, r1: reach + 3, dash: 2, gap: hot ? 0 : 1, phase: tableAt(a.phase, ctx), seed: 2, colours: hot ? [a.shine, C[1]] : [C[1], C[2]], box: [1, 1, W - 1, lidTop] });
      sparkle(g, x0 + 1, lidTop + 1 + flick, hot ? 2 : 1, C[1], a.shine);
      sparkle(g, x1 - 2, lidTop + 3 - flick, flick, C[1], a.shine);
      return out();
    }
    let lockTop = yF;
    if (openK) {
      const lidTop = lidTopOpen();
      const lidT = clippedIn(squircleIn(CX, yB - 0.5, hw, yB - lidTop, D.boxy), -Infinity, lidTop, Infinity, yB);
      const lining = glowing ? { rule: 'mix', of: toneRule(a.wood, -1.1), with: colourOf(a.inner), amount: 0.3 } : toneRule(a.wood, -1.3);
      g.fill(x0, lidTop, x1, yB, lidT, metal, { light: 1 });
      g.fill(x0, lidTop, x1, yB, insetIn(lidT, wooden ? 1 : 2), lining);
    }
    const S = extrudeOn(g, (px, py) => px >= x0 && px < x0 + bw && py >= yB && py < yB + D.depth, h, a.wood, { shade: 2 });
    const R = S.ramps.wall, on = (from, thick, l = -Infinity, r = Infinity) => bandOf(S, from, thick, { x0: l, x1: r });
    for (const k of h >= 7 ? [1 / 3, 2 / 3] : [1 / 2]) wallFillOn(g, S, on(Math.round(h * k), 1), R.dark, { flat: true });
    if (wooden) wallFillOn(g, S, (px) => strap(px), a.metal);
    else if (iron) {
      wallFillOn(g, S, (px, py) => px < x0 + 2 || px >= x1 - 2 || on(0, 1)(px, py), a.metal);
      g.rect(x0 - 1, bottom - 1, bw + 2, 2, metal, { shade: 1 });
      for (const rx of [x0, x1 - 1]) for (const ry of [yF + 2, bottom - 3]) g.dot(rx + (rx === x0 ? 1 : -1), ry, metal.dark);
    } else {
      wallFillOn(g, S, on(0, 1), metal.light, { flat: true }); wallFillOn(g, S, on(h - 1, 1), metal.dark, { flat: true });
      for (const cx of [x0, x1 - 3]) { g.rect(cx, yF, 3, 3, metal, { light: 1 }); g.rect(cx, bottom - 2, 3, 3, metal, { shade: 1 }); }
      g.rect(x0 + 1, bottom + 1, 3, D.feet, metal, { shade: 1 }); g.rect(x1 - 4, bottom + 1, 3, D.feet, metal, { shade: 1 });
    }
    if (openK) {
      const mouth = insetIn(S.top, 1);
      const fillIn = inside === 'white' ? a.shine : inside === 'glow' ? { rule: 'mix', of: colourOf(a.inner), with: colourOf(a.shine), amount: 0.6 } : hole;
      g.fill(x0, yB, x1, yF, mouth, fillIn);
      if (inside === 'dark') g.fill(x0, yB, x1, yF, (px, py) => mouth(px, py) && !mouth(px, py + 1), toneRule(a.wood, -1.3));
      if (a.gems && glowing) {
        const r = hw - 3, cy = yB + D.depth / 2;
        g.blob([ellipseIn(CX, cy, r, D.depth / 2 - 0.2), ellipseIn(CX - r * 0.4, cy - 1, r * 0.55, D.depth / 2), ellipseIn(CX + r * 0.5, cy - 0.5, r * 0.45, D.depth / 2 - 0.6)], gold, { light: 1 });
        for (const [dx, dy] of [[-3, 0], [1, -1], [4, 1], [-1, 1]]) g.rect(CX + dx, Math.round(cy) + dy, 2, 1, gold.dark);
        const gx = Math.round(CX - r * 0.5);
        g.fill(gx - 3, cy - 4, gx + 3, cy + 2, polyIn([[gx, cy - 3.5], [gx + 2.5, cy - 1], [gx, cy + 1.5], [gx - 2.5, cy - 1]]), a.gem);
        g.rect(gx, Math.round(cy) - 2, 1, 1, a.shine);
        g.rect(Math.round(CX + r * 0.45), Math.round(cy) - 2, 2, 2, a.ruby);
      }
    } else {
      const ly = yF - D.lidH - lift;
      if (lift) g.rect(x0 + 1, yF - lift, bw - 2, lift, inside === 'white' ? a.shine : hole);
      const topT = squircleIn(CX, ly - D.depth / 2, hw, D.depth / 2, D.boxy);
      const L = extrudeOn(g, topT, D.lidH, wooden ? a.wood : a.metal, { topColour: wooden ? lit.base : undefined, shade: 1, box: [x0, ly - D.depth, x1, ly] });
      const T = L.ramps.top;
      if (wooden) {
        g.fill(x0, ly - D.depth, x1, ly, (px, py) => L.top(px, py) && Math.floor(py) === ly - Math.ceil(D.depth / 2), T.dark);
        g.fill(x0, ly - D.depth, x1, ly, (px, py) => L.top(px, py) && strap(px), metal, { light: 1 });
        wallFillOn(g, L, (px) => strap(px), a.metal);
      } else {
        g.fill(x0, ly - D.depth, x1, ly, insetIn(L.top, iron ? 2 : 1), lit, { shade: 1 });
        if (iron) g.fill(CX - 1, ly - D.depth, CX + 1, ly, (px, py) => L.top(px, py), metal, { light: 1 });
        wallFillOn(g, L, insetIn((px, py) => L.wall(px, py), 1), a.wood);
      }
      if (D.lidH >= 4) g.fill(x0, ly - D.depth, x1, ly, (px, py) => trimmedIn(L.top, { left: 2, right: 2 })(px, py) && Math.floor(py) === ly - D.depth + 1 && !strap(px), T.light);
      wallFillOn(g, L, bandOf(L, D.lidH - 1, 1), metal.light, { flat: true });
      if (a.style === 'royal') { g.rect(CX - 2, ly - D.depth - 1, 4, 1, metal); g.rect(CX - 1, ly - D.depth - 2, 2, 1, metal.light); }
      lockTop = yF - 2 - lift;
    }
    g.rect(CX - 2, lockTop, 4, yF + 3 - lockTop + 1, metal, { light: 1, ...(iron ? { outline: 'ink' } : {}) });
    g.rect(CX - 1, yF + 1, 2, 2, a.style === 'royal' ? a.ruby : hole);
    return out();
  },
});

// ---- lamp and beam: engine/fx.js lamp and beam with paint refs ----------------------------------------------------------

/** Paints a pixel when it is inside the frame's 1 px border (engine/fx.js put with its default box). */
const putIn = (g, x, y, c) => { x = Math.floor(x); y = Math.floor(y); if (x >= g.x0 + 1 && y >= g.y0 + 1 && x < g.x0 + g.w - 1 && y < g.y0 + g.h - 1) g.set(x, y, c); };

/** A small light on a machine (engine/fx.js lamp): level 0 off, 0.5 dim, 1 lit with a white glint, 2 flaring white with a halo of `halo`. */
export function lampOn(g, x, y, w, h, colour, level, { white, halo = colour } = {}) {
  const lv = level >= 1.5 ? 2 : level >= 0.75 ? 1 : level >= 0.25 ? 0.5 : 0;
  const lens = lv === 2 ? white : lv === 1 ? colour : toneRule(colour, lv === 0.5 ? -0.9 : -1.9);
  if (lv === 2) {
    for (let i = 0; i < w; i++) { putIn(g, x + i, y - 1, halo); putIn(g, x + i, y + h, halo); }
    for (let j = 0; j < h; j++) { putIn(g, x - 1, y + j, halo); putIn(g, x + w, y + j, halo); }
  }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) putIn(g, x + i, y + j, lens);
  if (lv === 1 && w * h >= 2) putIn(g, x + w - 1, y, white);
}

/** A column of light standing on row y (engine/fx.js beam): solid at its foot, dashes travelling up and cooling, the sides dimmer and shorter. */
function beamOn(g, { x, y, w = 4, h = 12, phase = 0, dash = 2, gap = 2, solid: firmShare = 0.4, seed = 0, colours }) {
  const n = Math.max(1, Math.round(w)), half = n / 2, step = dash + gap, left = Math.round(x - half);
  for (let i = 0; i < n; i++) {
    const cx = left + i, d = Math.abs(cx + 0.5 - x) / Math.max(0.5, half);
    const hc = Math.max(1, Math.round(h * (1 - 0.45 * d * d) * (0.85 + 0.15 * hash(i, seed * 64 + 1))));
    const firm = hc * firmShare * (1 - 0.6 * d), shift = hash(i, seed * 64 + 2) * step;
    for (let k = 0; k < hc; k++) {
      if (k >= firm && gap > 0 && fract((k - shift) / step - phase) >= dash / step) continue;
      putIn(g, cx, y - 1 - k, stepOf(colours, 1 - 0.75 * d - 0.6 * (k / Math.max(1, h))));
    }
  }
}

// ---- cache@1: sprites/tech-chest.js -------------------------------------------------------------------------------------

/** The builds cache@1 draws: a footed cache, a round-cornered pod, a wide ribbed locker with handles. */
export const CACHE_STYLES = Object.freeze(['cache', 'pod', 'locker']);

/**
 * cache@1: a station loot cache seen from above and in front (port of sprites/tech-chest.js): a box whose lid in two
 * halves splits down the middle and slides apart over its sides, rarity bars on box and lid, a lock plate with a
 * status light. Tables: `apart` (how far each half has slid, 1 at rest), `lift` (px the lid jumps), `wide` (squash),
 * `inside` (0 dark, 1 white, 2 lit). Light (`layer: "light"`): `lamp` (the status light: 0 off, 0.5 dim, 1 lit, 2
 * flaring), `flare` (1: its halo is white), `beam` (the column of light in the gap, its height as a share of the frame;
 * 0 none), `hot` (1: white-hot), `phase` (its dashes), `prize` (a chip rising in the beam with a glint of this size;
 * below 0 none).
 */
export const cache = defineGenerator({
  id: 'cache', v: 1, family: 'shape',
  about: 'A sci-fi loot cache whose split lid slides apart round a beam of light with a prize in it, frame by frame from tables.',
  args: {
    at: point({ default: [16, 30], about: 'The middle of its foot: the row under its lowest row' }),
    style: word(CACHE_STYLES, { default: 'cache', about: 'A footed cache, a round pod or a ribbed locker' }),
    size: share({ default: 0.5, about: 'Small to big' }),
    lid: share({ default: 0.5, about: 'Flat to domed lid' }),
    stripes: word(['none', 'one', 'two'], { default: 'one', about: 'Rarity bars either side of the lock' }),
    apart: frames('How far each half of the lid has slid: 0 shut, 1 at rest'),
    lift: frames('Pixels the lid has jumped'),
    wide: frames('Pixels wider on each side (squash)'),
    inside: frames('What shows in the mouth: 0 dark, 1 white, 2 lit'),
    lamp: frames('The status light: 0 off, 0.5 dim, 1 lit, 2 flaring'),
    flare: frames('1: the flaring light\'s halo is white'),
    beam: frames('The beam\'s height, a share of the frame (0: none)'),
    hot: frames('1: the beam is white-hot'),
    phase: frames('How far the beam\'s dashes have travelled'),
    prize: frames('The prize in the beam: the size of its glint (below 0: no prize)', [-1]),
    layer: layerArg(),
    body: paint({ about: 'The box and the lid' }),
    accent: paint({ about: 'The rarity bars' }),
    inner: paint({ about: 'The light' }),
    shine: paint({ about: 'White: a flash and the glints' }),
  },
  cost: () => gridCost(32, 32, 1000),
  run(a, ctx) {
    const W = 32, CX = 16, GROUND = 29;
    const { g, out } = local(a.at, W, W, CX, GROUND + 1);
    const wideL = a.style === 'locker' ? 1 : 0, hw0 = Math.min(10, Math.round(lerp(8, 10, a.size)) + wideL);
    const d = { hw: hw0, depth: Math.round(hw0 * 0.62) - wideL, h: Math.round(hw0 * 0.85) - wideL, lidH: Math.round(lerp(2, 5, a.lid)), boxy: lerp(9, 2.6, a.lid), rest: Math.min(5, 13 - hw0) };
    const wide = tableAt(a.wide, ctx), hw = d.hw + wide, h = d.h - wide, x0 = CX - hw, x1 = CX + hw, yF = GROUND + 1 - h;
    const slide = Math.round(tableAt(a.apart, ctx) * d.rest), lens = [CX - 1, yF + 2, 2, 2];
    if (a.layer === 'light') {
      const flare = tableAt(a.flare, ctx) >= 1;
      lampOn(g, ...lens, flare ? a.shine : a.inner, tableAt(a.lamp, ctx), { white: a.shine });
      const beam = tableAt(a.beam, ctx);
      if (beam) {
        const C = lightSteps(a.inner, a.shine), hot = tableAt(a.hot, ctx) >= 1, foot = yF - 1, tall = (foot - 2) * beam;
        beamOn(g, { x: CX, y: foot, w: Math.max(2, 2 * slide - 2), h: tall, phase: tableAt(a.phase, ctx), dash: 3, gap: 1, solid: hot ? 0.8 : 0.5, colours: hot ? [a.shine, a.shine, C[1], C[2]] : C });
        const prize = tableAt(a.prize, ctx, -1);
        if (prize >= 0) {
          const py = Math.round(foot - tall * (0.45 + 0.08 * (2 - prize)));
          g.rect(CX - 1, py - 2, 2, 4, a.shine); g.rect(CX - 2, py - 1, 4, 2, a.shine);
          g.dot(CX - 2, py - 2, C[2]); g.dot(CX + 1, py + 1, C[2]);
          if (prize) sparkle(g, CX + 2, py - 3, prize, C[1], a.shine);
        }
      }
      return out();
    }
    const cacheB = a.style === 'cache', pod = a.style === 'pod', inside = insideAt(a, ctx);
    const n = a.stripes === 'two' ? 2 : a.stripes === 'one' ? 1 : 0;
    const stripe = (px) => { const q = Math.abs(px - CX); for (let i = 0; i < n; i++) if (q >= 3 + i * 3 && q < 5 + i * 3) return true; return false; };
    const on = (S, from, thick, l = -Infinity, r = Infinity) => bandOf(S, from, thick, { x0: l, x1: r });
    const boxTop = pod ? squircleIn(CX, yF - d.depth / 2, hw, d.depth / 2, 4) : (px, py) => px >= x0 && px < x0 + 2 * hw && py >= yF - d.depth && py < yF;
    const S = extrudeOn(g, boxTop, cacheB ? h - 1 : h, a.body, { lip: 1 });
    const R = S.ramps.wall, T = S.ramps.top;
    if (cacheB) { g.rect(x0, GROUND, 3, 1, R.dark); g.rect(x1 - 3, GROUND, 3, 1, R.dark); }
    if (pod) { wallFillOn(g, S, on(S, (h >> 1) - 1, 1), { light: T.light, base: R.light, dark: R.base }); wallFillOn(g, S, on(S, h >> 1, 1), R.dark, { flat: true }); }
    if (a.style === 'locker') {
      for (let x = x0 + 2; x < x1 - 1; x += 3) wallFillOn(g, S, on(S, 1, h - 2, x, x + 1), R.dark, { flat: true });
      for (const hx of [x0 - 1, x1]) g.rect(hx, yF + 1, 1, 3, R.light);
    }
    if (n) wallFillOn(g, S, (px, py) => stripe(px) && on(S, 1, h - 2)(px, py), a.accent, { flat: true });
    wallFillOn(g, S, on(S, 1, 4, CX - 2, CX + 2), toneRule(R.dark, -0.5), { flat: true });
    const fillIn = inside === 'white' ? a.shine : inside === 'glow' ? { rule: 'mix', of: colourOf(a.inner), with: colourOf(a.shine), amount: 0.55 } : toneRule(R.dark, -0.5);
    const mouth = insetIn(S.top, 1);
    g.fill(x0, yF - d.depth, x1, yF, mouth, fillIn);
    if (inside === 'glow') g.fill(x0, yF - d.depth, x1, yF, edgeIn(mouth, 0, -1), a.inner);
    const lidG = g.blank(), lift = tableAt(a.lift, ctx), ly = yF - d.lidH - lift;
    const lidTop = squircleIn(CX, ly - d.depth / 2, hw, d.depth / 2, pod ? Math.min(d.boxy, 4) : d.boxy);
    const L = extrudeOn(lidG, lidTop, d.lidH, a.body, { lip: 1 });
    if (d.lidH >= 4) lidG.ellipse(CX + hw * 0.5, ly - d.depth * 0.62, 2, 1, L.ramps.top.light);
    if (n) {
      wallFillOn(lidG, L, (px) => stripe(px), a.accent, { flat: true });
      const flat = trimmedIn(L.top, { top: 1, bottom: 1 });
      lidG.fill(x0, ly - d.depth, x1, ly, (px, py) => stripe(px) && flat(px, py), toneRule(a.accent, 0.5));
    }
    const inner = (px) => px >= CX - 1 && px < CX + 1, below = trimmedIn(L.top, { top: 1 });
    lidG.fill(CX - 1, ly - d.depth, CX + 1, ly, (px, py) => inner(px) && below(px, py), slide ? L.ramps.top.light : R.base);
    wallFillOn(lidG, L, (px) => inner(px), slide ? R.light : R.dark, { flat: true });
    g.blit(cropped(lidG, 0, 0, CX, W), -slide, 0);
    g.blit(cropped(lidG, CX, 0, W, W), slide, 0);
    return out();
  },
});

// ---- grids as engine/breaking.js reads them -------------------------------------------------------------------------------

/** A grid at origin 0 seen as the Surface engine/breaking.js reads and writes (w, h, data, bounds): its cells are paint ids. */
const asSurface = (g) => ({ w: g.w, h: g.h, data: g.cells, bounds: () => g.bounds(), shadow: g.shadow });
/** A new empty grid over the same box sharing src's paint ids, so cells copied from src keep their paints. */
function sharing(src) { const g = src.blank(); g.paints = src.paints; g.index = src.index; return g; }
/** An arc of a circle (engine/surface.js arc): degrees as the code's radians, measured from straight down towards the right. */
function arcOn(g, cx, cy, r, a0, a1, thick, c, opt = {}) {
  const lo = Math.min(a0, a1), span = Math.abs(a1 - a0), TAU = Math.PI * 2;
  const inside = (px, py) => {
    const dx = px - cx, dy = py - cy;
    if (Math.abs(Math.hypot(dx, dy) - r) > thick / 2) return false;
    let q = Math.atan2(dx, dy) - lo; q = ((q % TAU) + TAU) % TAU;
    return q <= span;
  };
  return g.fill(cx - r - thick, cy - r - thick, cx + r + thick, cy + r + thick, inside, c, { shade: 0, ...opt });
}

// ---- crumble.block@1: sprites/crumble-block.js ----------------------------------------------------------------------------

/** What crumble.block@1's block is: cut stone, nailed planks, clear ice, a puff of cloud. */
export const CRUMBLE_STYLES = Object.freeze(['stone', 'wood', 'ice', 'cloud']);

/**
 * crumble.block@1: a 28 x 26 block that shakes apart, crumbles and grows back (port of sprites/crumble-block.js): three
 * courses of cut stone, three nailed planks, a block of ice or a cloud, with cracks that grow one after another with
 * `wear`; the block is drawn whole and every piece that moves is a piece of it (engine/breaking.js). Tables: `shake`
 * (the step of the shake, 0 to 5: its chunks come loose from the top and rattle; below 0 still), `crumble` (how far it
 * has fallen to a row of crumbs, 0 to 1; below 0 whole), `rise` (how much of it stands out of the ground line, 0 to 1;
 * below 0 not rising), `hop` (px it is lifted while rising), `crumbs` (1: the crumbs it grows from show too).
 */
export const crumbleBlock = defineGenerator({
  id: 'crumble.block', v: 1, family: 'shape',
  about: 'A block of stone, wood, ice or cloud with growing cracks that shakes apart, crumbles to crumbs and grows back, by tables.',
  args: {
    at: point({ default: [16, 30], about: 'The middle of its foot: the row under its lowest row' }),
    style: word(CRUMBLE_STYLES, { default: 'stone', about: 'Stone, wood, ice or cloud' }),
    wear: share({ default: 0.4, about: 'New to worn: how many cracks and how long' }),
    pieces: count(4, 8, { default: 6, about: 'How many chunks it breaks into' }),
    wobble: count(1, 2, { default: 1, about: 'Pixels a loose chunk rattles' }),
    shake: frames('The step of the shake, 0 to 5 (below 0: still)', [-1]),
    crumble: frames('How far it has crumbled, 0 to 1 (below 0: whole)', [-1]),
    rise: frames('How much of it stands out of the ground, 0 to 1 (below 0: not rising)', [-1]),
    hop: frames('Pixels it is lifted while rising'),
    crumbs: frames('1: the crumbs it grows from show too'),
    body: paint({ about: 'The block' }),
    edge: paint({ about: 'Joints, cracks and edges' }),
    shine: paint({ about: 'White: the shine on ice' }),
  },
  cost: () => gridCost(32, 32, 220),
  run(a, ctx) {
    const SIZE = 32, X0 = 2, Y0 = 4, BW = 28, BH = 26, GROUND = 29;
    const src = new Pixels(0, 0, SIZE, SIZE), B = rampOf(a.body), A = a.edge;
    let on;
    if (a.style === 'stone') {
      on = (px, py) => { const c = Math.floor(px) - X0, r = Math.floor(py) - Y0, c1 = BW - 1 - c, r1 = BH - 1 - r; return c >= 0 && c1 >= 0 && r >= 0 && r1 >= 0 && c + r >= 2 && c1 + r1 >= 2 && c1 + r >= 1; };
      const o = { clip: on };
      src.fill(X0, Y0, X0 + BW, Y0 + BH, on, B.base);
      src.rect(X0, Y0, BW, 1, B.light, o); src.rect(X0, Y0 + 1, 1, BH - 1, B.dark, o); src.rect(X0, GROUND - 1, BW, 2, B.dark, o);
      src.rect(X0, 10, BW, 1, A, o); src.rect(X0, 20, BW, 1, A, o);
      src.rect(15, 11, 1, 9, A); src.rect(10, 21, 1, 7, A); src.rect(21, 21, 1, 7, A);
      for (const [x, y, w] of [[3, 11, 12], [16, 11, 13], [3, 21, 7], [11, 21, 10], [22, 21, 7]]) src.rect(x, y, w, 1, B.light);
      for (const [x, y] of [[6, 7], [20, 6], [7, 15], [23, 16], [14, 24], [25, 25]]) src.rect(x, y, 2, 1, B.dark);
    } else if (a.style === 'wood') {
      const planks = [[2, 28, 4], [3, 29, 13], [2, 29, 22]];
      planks.forEach(([l, r, y], i) => {
        src.rect(l, y, r - l + 1, 8, B.base); src.rect(l, y, r - l + 1, 1, B.light); src.rect(l, y + 7, r - l + 1, 1, B.dark);
        src.rect(l + 7 + i * 3, y + 3, 7, 1, B.dark); src.rect(l + 15 - i * 4, y + 5, 5, 1, B.dark);
        for (const x of [l + 2, r - 2]) src.rect(x, y + 3, 1, 2, A);
      });
      src.rect(3, 12, 26, 1, A); src.rect(3, 21, 27, 1, A);
      const parts = [...planks.map(([l, r, y]) => rectIn(l, y, r - l + 1, 8)), rectIn(3, 12, 26, 1), rectIn(3, 21, 27, 1)];
      on = (px, py) => parts.some((f) => f(px, py));
    } else if (a.style === 'ice') {
      const cut = (r) => Math.max(0, 3 - r, 3 - (BH - 1 - r));
      on = (px, py) => { const r = Math.floor(py) - Y0; return r >= 0 && r < BH && px >= X0 + cut(r) && px < X0 + BW - cut(r); };
      src.fill(X0, Y0, X0 + BW, Y0 + BH, on, B, { shade: 2, light: 1 });
      for (let i = 0; i < 9; i++) { src.dot(9 + i, 20 - i, a.shine); if (i < 6) src.dot(15 + i, 23 - i, B.light); if (i > 1 && i < 8) src.dot(10 + i, 20 - i, B.light); }
      src.rect(5, 23, 9, 1, A); src.rect(22, 9, 1, 6, A); src.rect(18, 26, 6, 1, A);
    } else {
      const box = rectIn(X0, Y0, BW, BH);
      const lobes = [ellipseIn(16, 20.5, 14, 9.5), ellipseIn(9, 12, 6.5, 6.5), ellipseIn(18, 10.5, 7.5, 6.5), ellipseIn(24.5, 15, 5, 5.5)];
      on = (px, py) => box(px, py) && lobes.some((f) => f(px, py));
      src.blob(lobes, B, { shade: 2, light: 1, clip: box });
      arcOn(src, 10, 13, 3.5, Math.PI * 0.1, Math.PI * 0.6, 1, A, { clip: on });
      arcOn(src, 20, 12, 4, Math.PI * 0.05, Math.PI * 0.5, 1, A, { clip: on });
      arcOn(src, 15, 22, 5, -Math.PI * 0.45, Math.PI * 0.25, 1, A, { clip: on });
    }
    const CRACKS = [[8, 4, 0.35, 11], [29, 15, -Math.PI / 2 - 0.3, 9], [20, 29, Math.PI - 0.4, 10], [23, 4, -0.25, 8]];
    CRACKS.forEach(([x, y, angle, len], i) => {
      const grown = clamp01(a.wear * CRACKS.length - i);
      if (grown > 0) crack(src, x, y, angle, Math.max(3, Math.round(len * grown)), A, { seed: 7 + i, clip: on, branch: grown === 1 });
    });
    const g = sharing(src), S = asSurface(src), G = asSurface(g), seed = 3;
    const shake = tableAt(a.shake, ctx, -1), fall = tableAt(a.crumble, ctx, -1), up = tableAt(a.rise, ctx, -1);
    if (shake >= 0) {
      const F = fragments(S, a.pieces, { seed }), loose = 1 + Math.floor((shake / 6) * F.length);
      F.forEach((f, i) => {
        if (i >= loose) return drawFragment(G, f);
        const beat = (shake + i) % 3;
        drawFragment(G, f, beat === 1 ? (f.x < 16 ? a.wobble : -a.wobble) : 0, beat === 2 ? -a.wobble : 0, { cut: true });
      });
    } else if (fall >= 0) crumble(G, S, { t: fall, pieces: a.pieces, seed, floor: GROUND });
    else if (up >= 0) {
      if (tableAt(a.crumbs, ctx) >= 1) crumble(G, S, { t: 1, pieces: a.pieces, seed, floor: GROUND });
      rise(G, S, { shown: Math.round(BH * up), floor: GROUND, hop: tableAt(a.hop, ctx) });
    } else g.blit(src);
    const dx = Math.round(a.at[0]) - 16, dy = Math.round(a.at[1]) - (GROUND + 1);
    return g.stamps().map((st) => ({ ...st, at: [st.at[0] + dx, st.at[1] + dy] }));
  },
});

// ---- shards: engine/fx.js shards with paint refs -------------------------------------------------------------------------

/** Sharp chips thrown from (x, y) that fly, fall and land as a pixel or two (engine/fx.js shards), kept inside box. */
function shardsOn(g, { t = 0, x, y, count = 6, seed = 0, dist = 14, gravity = 8, size = 3, angle = Math.PI, arc = 2 * Math.PI, spin = 1.5, colour, box }) {
  const B = [Math.max(g.x0 + 1, Math.floor(box[0])), Math.max(g.y0 + 1, Math.floor(box[1])), Math.min(g.x0 + g.w - 1, Math.floor(box[2])), Math.min(g.y0 + g.h - 1, Math.floor(box[3]))];
  const R = rampOf(colour), rim = toneRule(colour, -1), k = clamp01(t), hh = (i, ch) => hash(i, seed * 64 + ch), [sx, sy] = g.shadow;
  const within = (v, lo, hi) => Math.min(Math.max(v, lo + 0.01), hi - 0.01);
  const put = (px, py, c) => { px = Math.floor(px); py = Math.floor(py); if (px >= B[0] && py >= B[1] && px < B[2] && py < B[3]) g.set(px, py, c); };
  for (let i = 0; i < count; i++) {
    const a = angle + (hh(i, 2) - 0.5) * arc, d = dist * (0.5 + 0.5 * hh(i, 3)) * easeOut(k);
    const cx = within(x + Math.sin(a) * d, B[0] + 0.5, B[2] - 0.5), cy = within(y + Math.cos(a) * d + gravity * k * k * (0.6 + 0.4 * hh(i, 4)), B[1] + 0.5, B[3] - 0.5);
    const L = Math.max(1, size * (0.7 + 0.6 * hh(i, 5)) * (1 - 0.6 * k));
    if (L < 2) { put(cx, cy, k > 0.9 ? rim : R.base); continue; }
    const rot = 2 * Math.PI * (hh(i, 6) + spin * (hh(i, 7) - 0.5) * 2 * k), ux = Math.cos(rot), uy = Math.sin(rot), wd = Math.max(1.4, L * 0.6);
    const pts = [[cx + (ux * L) / 2, cy + (uy * L) / 2], [cx - (ux * L) / 2 - (uy * wd) / 2, cy - (uy * L) / 2 + (ux * wd) / 2], [cx - (ux * L) / 2 + (uy * wd) / 2, cy - (uy * L) / 2 - (ux * wd) / 2]];
    const inside = (px, py) => { let hit = false; for (let p = 0, q = 2; p < 3; q = p++) { const [xi, yi] = pts[p], [xj, yj] = pts[q]; if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit; } return hit; };
    let drew = false;
    const ax = Math.max(B[0], Math.floor(cx - L)), ay = Math.max(B[1], Math.floor(cy - L)), bx = Math.min(B[2] - 1, Math.ceil(cx + L)), by = Math.min(B[3] - 1, Math.ceil(cy + L));
    for (let py = ay; py <= by; py++) for (let px = ax; px <= bx; px++) {
      const qx = px + 0.5, qy = py + 0.5;
      if (!inside(qx, qy)) continue;
      drew = true;
      g.set(px, py, L >= 5 && !inside(qx + sx, qy + sy) ? rim : L >= 5 && !inside(qx - sx, qy - sy) ? R.light : R.base);
    }
    if (!drew) put(cx, cy, R.base);
  }
}

// ---- supply.crate@1: sprites/supply-crate.js ------------------------------------------------------------------------------

/** The builds supply.crate@1 draws: a square crate, a round canister, a tall locker. */
export const SUPPLY_STYLES = Object.freeze(['crate', 'canister', 'locker']);
/** The hazard labels it can carry (engine/marks.js marks). */
export const SUPPLY_MARKS = Object.freeze(['none', 'cross', 'bolt', 'skull']);

/**
 * supply.crate@1: a metal crate, canister or locker seen from above and in front (port of sprites/supply-crate.js): a
 * lit lid over a front face with a hazard label and two buckled straps. Tables: `squash` (px wider and shorter, below 0
 * narrower and taller) and `shift` (px knocked sideways) for a hit; `stage` (0 whole, 1 swollen a pixel all round, 2
 * cracked into its four panels with the lid jumping off, 3 bursting: the lid goes up and over, the panels are thrown out
 * and shrink to scraps round the floor plate it leaves) with `fly` (how far the burst has gone, 0 to 1) and `flat` (how
 * flat the tumbling lid looks). `layer: "light"` draws the scraps and sparks of a burst, which are never inked.
 */
export const supplyCrate = defineGenerator({
  id: 'supply.crate', v: 1, family: 'shape',
  about: 'A sci-fi supply crate, canister or locker with a hazard label and straps that rocks when hit and bursts into panels, by tables.',
  args: {
    at: point({ default: [16, 30], about: 'The middle of its foot: the row under its lowest row' }),
    style: word(SUPPLY_STYLES, { default: 'crate', about: 'Crate, canister or locker' }),
    size: share({ default: 0.5, about: 'Small to big' }),
    straps: flag({ default: true, about: 'Two straps over the lid' }),
    mark: word(SUPPLY_MARKS, { default: 'bolt', about: 'The hazard label' }),
    scraps: count(3, 10, { default: 7, about: 'How many scraps fly when it bursts' }),
    squash: frames('Pixels wider and shorter (below 0: narrower and taller)'),
    shift: frames('Pixels knocked sideways'),
    stage: frames('0 whole, 1 swollen, 2 cracked, 3 bursting'),
    fly: frames('How far the burst has gone, 0 to 1'),
    flat: frames('How flat the tumbling lid looks', [0.5]),
    layer: layerArg(),
    body: paint({ about: 'The crate' }),
    accent: paint({ about: 'The label' }),
    labelInk: paint({ about: 'The picture on the label' }),
    strap: paint({ about: 'The straps' }),
  },
  cost: () => gridCost(32, 32, 520),
  run(a, ctx) {
    const W = 32, CX = 16, GROUND = 29;
    const half = Math.round(lerp(7, 11, a.size)), markSize = half >= 9 ? 7 : 5;
    const d0 = a.style === 'canister' ? (() => { const hw = half - 1; return { hw, depth: 2 * Math.max(2, Math.round(hw * 0.36)), h: Math.round(half * 1.65), mark: markSize }; })()
      : a.style === 'locker' ? { hw: half - 2, depth: Math.round(half * 0.55), h: Math.round(half * 1.9), mark: markSize } : { hw: half, depth: Math.round(half * 0.67), h: Math.round(half * 1.65), mark: markSize };
    const face = (d, y, squash = 1, dx = 0) => {
      const rows = Math.max(1, Math.round(d.depth * squash));
      if (a.style === 'canister') return ellipseIn(CX + 0.5 + dx, y + rows / 2, d.hw + 0.5, rows / 2);
      return rectIn(CX - d.hw + dx, y, 2 * d.hw + 1, rows);
    };
    const on = (S, from, thick, l = -Infinity, r = Infinity) => bandOf(S, from, thick, { x0: l, x1: r });
    const box = (dd, { grow = 0, open = false } = {}) => {
      const g = new Pixels(0, 0, W, W), d = { ...dd, hw: dd.hw + grow, h: dd.h + grow };
      const { hw, depth, h } = d, x0 = CX - hw, x1 = CX + hw + 1, y0 = GROUND + 1 - dd.h - depth - grow;
      const S = extrudeOn(g, face(d, y0), h, a.body, { lip: 1 });
      const R = S.ramps.wall, sunk = toneRule(R.base, -0.4), front = S.front(CX) + 1;
      let labelRow;
      if (a.style === 'crate') {
        wallFillOn(g, S, on(S, 2, h - 4, x0 + 2, x1 - 2), sunk, { flat: true });
        wallFillOn(g, S, (px, py) => on(S, 2, 1, x0 + 2, x1 - 2)(px, py) || on(S, 2, h - 4, x0 + 2, x0 + 3)(px, py), R.dark, { flat: true });
        for (const rx of [x0, x1 - 1]) for (const dr of [0, h - 2]) g.dot(rx, front + dr, R.dark);
        if (!open) g.rect(CX - 2, y0 + (depth >> 1), 5, 1, R.base);
        labelRow = 2 + Math.max(0, (h - 4 - (d.mark + 2)) >> 1);
        if (a.mark === 'none') for (const dr of [0, 2, 4]) wallFillOn(g, S, on(S, (h >> 1) - 2 + dr, 1, CX - 3, CX + 4), R.dark, { flat: true });
      } else if (a.style === 'canister') {
        for (const from of [1, h - 4]) { wallFillOn(g, S, on(S, from, 1), R.light, { flat: true }); wallFillOn(g, S, on(S, from + 1, 1), R.dark, { flat: true }); }
        if (!open) g.rect(CX - 1, y0 + (depth >> 1) - 1, 3, 2, R.base);
        labelRow = 3 + Math.max(0, (h - 7 - (d.mark + 2)) >> 1);
      } else {
        wallFillOn(g, S, (px, py) => on(S, 1, h - 3, x0 + 2, x1 - 2)(px, py), sunk, { flat: true });
        wallFillOn(g, S, (px, py) => on(S, 1, 1, x0 + 2, x1 - 2)(px, py) || on(S, 1, h - 3, x0 + 2, x0 + 3)(px, py), R.dark, { flat: true });
        for (const dr of [3, 5]) wallFillOn(g, S, on(S, dr, 1, x0 + 4, x1 - 4), R.dark, { flat: true });
        wallFillOn(g, S, on(S, 7, 3, x1 - 4, x1 - 3), R.light, { flat: true });
        if (!open) g.rect(CX - 2, y0 + (depth >> 1), 5, 1, R.base);
        labelRow = Math.min(h - 3 - (d.mark + 2), 7 + Math.max(0, (h - 10 - (d.mark + 2)) >> 1));
      }
      if (a.mark !== 'none') {
        const m = d.mark, lx = CX - ((m + 1) >> 1), plate = on(S, labelRow, m + 2, lx, lx + m + 2);
        wallFillOn(g, S, (px, py) => on(S, labelRow - 1, m + 4, lx - 1, lx + m + 3)(px, py) && !plate(px, py), R.dark, { flat: true });
        wallFillOn(g, S, plate, a.accent, { flat: true });
        drawMark(g, a.mark, CX, front + labelRow + ((m + 1) >> 1), m, a.labelInk, { clip: plate });
      }
      if (a.straps) {
        const off = Math.max(3, Math.round(hw * 0.62));
        for (const sx of [CX - off - 1, CX + off]) {
          const cols = (px) => px >= sx && px < sx + 2;
          wallFillOn(g, S, (px) => cols(px), { light: a.strap, base: a.strap, dark: R.dark });
          if (!open) g.fill(sx, y0, sx + 2, y0 + depth + 2, (px, py) => cols(px) && S.top(px, py), a.strap);
          wallFillOn(g, S, (px, py) => cols(px) && on(S, 0, 1)(px, py), R.dark, { flat: true });
        }
      }
      if (open) {
        const inner = insetIn(S.top, 1);
        g.fill(x0, y0, x1, y0 + depth + 1, inner, R.dark);
        g.fill(x0, y0, x1, y0 + depth + 1, edgeIn(inner, 0, -1), toneRule(R.dark, -0.8));
      }
      return g;
    };
    const lid = (g, d, y, squash, dx) => extrudeOn(g, face(d, y, squash, dx), squash < 0.5 ? 1 : 2, a.body, { lip: 1, shade: 0 });
    const stage = Math.round(tableAt(a.stage, ctx)), sq = tableAt(a.squash, ctx), shift = tableAt(a.shift, ctx);
    const dx0 = Math.round(a.at[0]) - CX, dy0 = Math.round(a.at[1]) - (GROUND + 1);
    const placed = (g) => g.stamps().map((st) => ({ ...st, at: [st.at[0] + dx0, st.at[1] + dy0] }));
    const k = clamp01(tableAt(a.fly, ctx)), cy = GROUND - d0.h * 0.5;
    if (a.layer === 'light') {
      const g = new Pixels(0, 0, W, W);
      if (stage === 3) shardsOn(g, { t: k, x: CX, y: cy, count: a.scraps, seed: 11, dist: 12, gravity: GROUND - cy + 2, size: 3, arc: Math.PI * 1.6, colour: toneRule(a.body, 0.85), box: [1, 1, W - 1, GROUND + 1] });
      return placed(g);
    }
    if (stage <= 1) {
      const g = new Pixels(0, 0, W, W);
      g.blit(box({ ...d0, hw: d0.hw + sq, h: d0.h - sq }, { grow: stage === 1 ? 1 : 0 }), shift, 0);
      return placed(g);
    }
    const g = new Pixels(0, 0, W, W), topY = GROUND + 1 - d0.h - d0.depth, plateY = GROUND - d0.depth;
    const opened = box(d0, { open: true }), panels = fragments(asSurface(opened), 4, { seed: 5 });
    if (stage === 2) {
      const pieces = sharing(opened);
      for (const f of panels) drawFragment(asSurface(pieces), f, Math.sign(f.x - CX - 0.5), 0, { cut: true });
      g.blit(pieces);
      lid(g, d0, Math.max(2, topY - 5), 0.85, 0);
      return placed(g);
    }
    const ly = keys(k, [[0, topY - 7], [0.25, topY - 9], [0.6, plateY - 5], [1, plateY - 5]]);
    const flat = k >= 0.6 ? 0.6 : tableAt(a.flat, ctx, 0.5);
    const lidNow = () => lid(g, d0, Math.min(Math.max(Math.round(ly), 2), GROUND - 4), flat, Math.round(lerp(0, Math.min(3, 12 - d0.hw), k)));
    if (k >= 0.6) lidNow();
    const tray = extrudeOn(g, face(d0, plateY - 1), 2, a.body, { lip: 1, shade: 0 });
    g.fill(CX - d0.hw, plateY - 1, CX + d0.hw + 1, GROUND, insetIn(tray.top, 1), tray.ramps.wall.dark);
    if (k < 0.6) lidNow();
    for (const f of panels) {
      const side = f.x < CX + 0.5 ? -1 : 1, far = f.y < cy;
      const tx = CX + 0.5 + side * (d0.hw + (far ? 1 : 3)), ty = far ? plateY - 3 : GROUND - 1;
      const dx = Math.round((tx - f.x) * easeOut(k)), dy = Math.round((ty - f.y) * k - (far ? 5 : 3) * Math.sin(Math.PI * k));
      const keep = lerp(f.r, 1.6, smooth(k * 1.4));
      const piece = sharing(opened);
      drawFragment(asSurface(piece), f, Math.min(Math.max(dx, 2 - f.x0), W - 3 - f.x1), Math.min(Math.max(dy, 2 - f.y0), GROUND - f.y1), { keep, box: [2, 2, W - 2, GROUND + 1] });
      const turned = k < 0.9 ? tilted(piece, f.x + dx, f.y + dy, side * 0.28 * Math.sin(Math.PI * k)) : piece;
      g.blit(cropped(turned, 2, 2, W - 2, GROUND + 1));
    }
    return placed(g);
  },
});

// ---- doors: engine/surface.js swing and masked on grids ---------------------------------------------------------------------

/** A copy of a grid keeping only the pixels a shape test allows, each where it was (engine/surface.js masked). */
function maskedOf(src, inside) {
  const out = src.blank();
  for (let y = src.y0; y < src.y0 + src.h; y++) for (let x = src.x0; x < src.x0 + src.w; x++) { const c = src.get(x, y); if (c !== null && inside(x + 0.5, y + 0.5)) out.set(x, y, c); }
  return out;
}

/** A door leaf on a grid seen turning away on its hinge (engine/surface.js swing): whole columns and rows left out, so every pixel stays hard. */
function swingOf(src, hinge, width, k, lift = 0, drop = 0) {
  const out = src.blank(), dir = width < 0 ? -1 : 1, W = Math.max(1, Math.abs(Math.round(width)));
  const vis = Math.max(1, Math.round(W * Math.min(1, Math.max(0, k))));
  let top = src.y0 + src.h, bottom = src.y0 - 1;
  for (let i = 0; i < W; i++) for (let y = src.y0; y < src.y0 + src.h; y++) if (src.has(hinge + dir * i, y)) { if (y < top) top = y; if (y > bottom) bottom = y; }
  if (bottom < top) return out;
  const H = bottom - top + 1;
  for (let d = 0; d < vis; d++) {
    const f = vis > 1 ? d / (vis - 1) : 0, x = hinge + dir * d, sx = hinge + dir * Math.min(W - 1, Math.floor(((d + 0.5) * W) / vis));
    const a = top + Math.round(drop * f), b = Math.max(a, bottom - Math.round(lift * f)), h = b - a + 1;
    for (let y = a; y <= b; y++) { const c = src.get(sx, top + Math.min(H - 1, Math.floor(((y - a + 0.5) * H) / h))); if (c !== null) out.set(x, y, c); }
  }
  return out;
}

// ---- door.wood@1: sprites/wooden-door.js -----------------------------------------------------------------------------------

/** The builds door.wood@1 draws: plain planks under a flat lintel, an arched door, an iron-bound door under a cornice. */
export const WOOD_DOORS = Object.freeze(['plank', 'arched', 'iron-bound']);
/** The locks a wooden door can carry: none, a padlock on the jamb, a keyhole plate, a bolt across. */
export const DOOR_LOCKS = Object.freeze(['none', 'padlock', 'keyhole', 'bar']);

/** Where everything of a wooden door is (sprites/wooden-door.js dims): the doorway, the frame round it, the lock's row. */
export function woodDoorDims(a) {
  const CX = 24, GROUND = 61, JAMB = 4, HEAD = 5, SILL = 2;
  const w = 2 * Math.round(lerp(13, 19, a.width)), h = Math.round(lerp(40, 52, a.height));
  const x0 = CX - w / 2, top = GROUND - h + 1, ox = x0 + JAMB, lw = w - 2 * JAMB;
  const ry = a.style === 'arched' ? Math.round(lw * 0.38) : 0, oy = top + HEAD, spring = oy + ry, bottom = GROUND - SILL;
  return { w, h, x0, x1: x0 + w - 1, top, ox, lw, ry, oy, spring, bottom, hole: archIn(ox, ox + lw, oy, spring, bottom + 1), frame: archIn(ox, ox + lw, oy, spring, bottom + 1, JAMB, HEAD), lockY: Math.round((spring + bottom) / 2) + 3 };
}

/**
 * door.wood@1: a plank door in a dressed stone frame on a stone threshold, seen from the front (port of
 * sprites/wooden-door.js): plain planks under a flat lintel, an arched door under a ring of arch stones, or an
 * iron-bound door under a cornice; ledges with strap hinges or iron bands, a ring handle, a barred window, and a lock
 * (a padlock on the jamb, a keyhole plate or a bolt into a keeper). Tables: `open` (the share of the leaf's width still
 * seen as it turns on its hinge; 1 shut), `rattle` (px the leaf is pushed sideways), `flash` (1: the lock, or the
 * handle when there is none, is white).
 */
export const doorWood = defineGenerator({
  id: 'door.wood', v: 1, family: 'shape',
  about: 'A wooden door in a stone frame (plank, arched or iron-bound) with a lock, window and handle that swings open or rattles, by tables.',
  args: {
    at: point({ default: [24, 62], about: 'The middle of its threshold: the row under its lowest row' }),
    style: word(WOOD_DOORS, { default: 'plank', about: 'Plank, arched or iron-bound' }),
    width: share({ default: 0.5, about: 'Narrow to wide' }),
    height: share({ default: 0.5, about: 'Short to tall' }),
    window: flag({ default: false, about: 'A small barred window' }),
    lock: word(DOOR_LOCKS, { default: 'keyhole', about: 'The lock' }),
    lockSize: px(0.65, 1.35, { default: 1, about: 'How big the lock is' }),
    open: frames('The share of the leaf\'s width still seen as it turns (1: shut)', [1]),
    rattle: frames('Pixels the leaf is pushed sideways'),
    flash: frames('1: the lock (or the handle) is white'),
    wood: paint({ about: 'The leaf' }),
    metal: paint({ about: 'Straps, bands, handle and lock' }),
    stone: paint({ about: 'The frame and threshold' }),
    hole: paint({ about: 'The dark of the doorway' }),
    shine: paint({ about: 'White: the flash' }),
  },
  cost: () => gridCost(48, 64, 190),
  run(a, ctx) {
    const W = 48, H = 64, CX = 24, GROUND = 61, JAMB = 4, HEAD = 5, SILL = 2;
    const g = new Pixels(0, 0, W, H), D = woodDoorDims(a);
    const k = Math.min(1, tableAt(a.open, ctx, 1)), dxR = tableAt(a.rattle, ctx), flash = tableAt(a.flash, ctx) >= 1, shut = k >= 1;
    const WHITE = { light: a.shine, base: a.shine, dark: a.shine }, HOLE = a.hole;
    // the frame
    const stone = rampOf(a.stone), joint = stone.dark, heavy = a.style === 'iron-bound';
    const parts = [D.frame, rectIn(D.x0 - 2, D.bottom + 1, D.w + 4, SILL)];
    if (heavy) parts.push(rectIn(D.x0 - 2, D.top, D.w + 4, 3));
    g.blob(parts, stone, { shade: 2, light: 1 });
    g.rect(D.x0 - 2, D.bottom + 1, D.w + 4, 1, stone.light);
    if (heavy) g.rect(D.x0 - 1, D.top, D.w + 3, 1, stone.light);
    for (let y = D.spring + 5, i = 0; y < D.bottom - 2; y += 8, i++) { g.rect(D.x0 + 1, y + (i % 2 ? 0 : 3), JAMB - 1, 1, joint); g.rect(D.x1 - JAMB + 1, y + (i % 2 ? 3 : 0), JAMB - 1, 1, joint); }
    if (D.ry) archStones(g, CX, D.spring, D.lw / 2, D.ry, { depth: HEAD, colour: joint, keystone: stone.light, clip: D.frame });
    else {
      for (const x of [D.x0 + JAMB + 2, D.x1 - JAMB - 2]) g.rect(x, D.top + (heavy ? 3 : 1), 1, HEAD - (heavy ? 3 : 1), joint);
      g.rect(D.x0 + JAMB, D.top + HEAD - 1, D.lw, 1, joint);
    }
    const inside = D.hole;
    g.fill(D.ox - 1, D.oy - 1, D.ox + D.lw + 1, D.bottom + 1, inside, HOLE, { outline: 'ink', clip: (px, py) => py < D.bottom + 1 });
    for (let i = 0; i < 3; i++) g.rect(D.ox + 1 + i, D.bottom - i, D.lw - 2 - 2 * i, 1, toneRule(HOLE, 1.1 - 0.3 * i));
    // the leaf, shut, with what is fixed to it
    const leaf = g.blank(), vis = Math.max(1, Math.round(D.lw * k)), far = k < 0.75, edge = shut ? null : Math.floor(((vis - 0.5) * D.lw) / vis);
    const wood = rampOf(far ? toneRule(a.wood, -0.55) : a.wood), metal = rampOf(far ? toneRule(a.metal, -0.5) : a.metal), clip = { clip: inside };
    const { ox, lw, oy, bottom } = D, lh = bottom - oy + 1;
    leaf.fill(ox, oy, ox + lw, bottom + 1, inside, wood.base);
    const n = Math.max(3, Math.round(lw / 5.2)), pale = { rule: 'mix', of: colourOf(wood.base), with: colourOf(wood.light), amount: 0.35 }, at = (i) => ox + Math.round((i * lw) / n);
    for (let i = 0; i < n; i++) {
      if (i % 2) leaf.rect(at(i), oy, at(i + 1) - at(i), lh, pale, clip);
      if (i) leaf.rect(at(i), oy, 1, lh, wood.dark, clip);
      leaf.rect(at(i) + 2 + (i % 2), oy + Math.round(lh * (0.28 + 0.2 * ((i * 7) % 3))), 1, 4, wood.dark, clip);
    }
    leaf.rect(ox, oy, lw, 1, wood.dark, clip); leaf.rect(ox + lw - 1, oy, 1, lh, wood.dark, clip);
    if (D.ry) leaf.fill(ox, oy, ox + lw, D.spring, (px, py) => inside(px, py) && !inside(px, py - 1), wood.dark);
    const rows = [D.spring + Math.round((bottom - D.spring) * 0.14), D.spring + Math.round((bottom - D.spring) * 0.8)];
    if (heavy) {
      for (const y of [rows[0] - 1, Math.round((rows[0] + rows[1]) / 2), rows[1]]) {
        leaf.rect(ox, y - 1, lw, 4, metal, { light: 1, clip: inside });
        leaf.rect(ox, y - 2, lw, 1, 'ink', clip); leaf.rect(ox, y + 3, lw, 1, 'ink', clip);
        for (let x = ox + 2; x < ox + lw - 1; x += 4) leaf.rect(x, y, 1, 2, metal.dark, clip);
      }
    } else {
      for (const y of rows) {
        leaf.rect(ox, y - 1, lw, 4, { light: wood.light, base: wood.base, dark: wood.dark }, { light: 1, shade: 1, clip: inside });
        leaf.rect(ox, y + 3, lw, 1, wood.dark, clip);
        const len = Math.round(lw * (a.style === 'arched' ? 0.7 : 0.55));
        leaf.rect(ox, y, len, 2, metal, { light: 1, clip: inside });
        leaf.rect(ox + len, y, 1, 1, metal.base, clip); leaf.rect(ox + len - 1, y - 1, 1, 4, metal.dark, clip);
        if (a.style === 'arched') { leaf.dot(ox + len + 1, y - 1, metal.base); leaf.dot(ox + len + 1, y + 2, metal.base); }
        for (let x = ox + 2; x < ox + len - 2; x += 4) leaf.dot(x, y, metal.dark);
      }
    }
    if (a.window) {
      const wy = D.spring + (heavy ? 4 : 0) + Math.round((rows[0] - D.spring) * 0.2) + (D.ry ? -Math.round(D.ry * 0.45) : 2);
      const wx = CX - 4, wh = Math.max(6, Math.min(8, rows[0] - 3 - wy));
      leaf.rect(wx - 1, wy - 1, 10, wh + 2, wood.dark, clip); leaf.rect(wx, wy, 8, wh, HOLE, clip);
      for (const x of [wx + 2, wx + 5]) leaf.rect(x, wy, 1, wh, metal.base, clip);
      leaf.rect(wx - 1, wy + wh, 10, 1, wood.light, clip);
    }
    const hx = ox + lw - 5, hy = D.lockY - 11, ring = flash && a.lock === 'none' ? WHITE : metal;
    leaf.rect(hx - 1, hy - 3, 3, 2, ring.base, { outline: 'ink' });
    leaf.fill(hx - 4, hy - 3, hx + 4, hy + 4, ringIn(hx + 0.5, hy + 0.5, 2.5, 1), ring.light, { outline: 'ink' });
    const ks = a.lockSize, lx = D.ox + D.lw - 5, ly = D.lockY;
    if (a.lock === 'keyhole') {
      const lm = flash ? WHITE : metal, pw = Math.max(3, Math.round(5 * ks)), ph = Math.max(5, Math.round(8 * ks)), qx = lx - Math.floor(pw / 2), qy = ly - Math.floor(ph / 2);
      leaf.rect(qx, qy, pw, ph, lm, { light: 1, outline: 'ink' });
      leaf.rect(lx, qy + Math.floor(ph / 2) - 1, 1, 3, HOLE); leaf.dot(lx - (pw > 3 ? 1 : 0), qy + Math.floor(ph / 2) - 1, HOLE);
    } else if (a.lock === 'bar') {
      const lm = flash ? WHITE : metal, bar = flash ? WHITE : { light: metal.base, base: metal.dark, dark: toneRule(a.metal, -1.8) };
      const bh = Math.max(3, Math.round(4 * ks)), by = ly - Math.floor(bh / 2), from = D.ox + 2, to = shut ? D.x1 - 1 : D.ox + D.lw - 2;
      leaf.rect(from, by, to - from + 1, bh, bar, { outline: 'ink' });
      leaf.rect(from, by, to - from + 1, 1, bar.light);
      for (const gx of [D.ox + 4, D.ox + D.lw - 8]) leaf.rect(gx, by - 1, 3, bh + 2, lm, { light: 1, outline: 'ink' });
    }
    if (edge !== null) leaf.rect(ox + edge, oy, lw - edge, lh, rampOf(a.wood).light, clip);
    const turn = Math.acos(Math.min(1, k));
    const seen = shut ? leaf : swingOf(leaf, D.ox, D.lw, k, Math.round(D.lw * Math.sin(turn) * 0.2), Math.round(D.lw * Math.sin(turn) * 0.1));
    g.blit(maskedOf(seen, (px, py) => inside(px + dxR, py)), dxR, 0);
    // fixed to the frame: hinge pins, and the frame's half of the lock
    const fixed = flash ? WHITE : rampOf(a.metal);
    for (const fy of [0.14, 0.8]) g.rect(D.ox - 2, D.spring + Math.round((D.bottom - D.spring) * fy) - 1, 2, 4, rampOf(a.metal), { light: 1, outline: 'ink' });
    const jx = D.x1 - JAMB + 1;
    if (a.lock === 'padlock') {
      // the code hung it 5 rows under the staple; a big padlock on a short arched door then reached the frame's edge, so it
      // now hangs no lower than the doorway's foot (the only change from the code)
      const bw = Math.max(4, Math.round(6 * ks)), bh = Math.max(4, Math.round(5 * ks)), bx = jx + 1 - Math.floor(bw / 2), by = Math.min(ly + 5, D.bottom + 1 - bh);
      if (shut) g.rect(jx - 6, ly - 1, 8, 3, fixed, { light: 1, outline: 'ink' });
      g.fill(bx - 1, by - 5, bx + bw + 1, by, ringIn(bx + bw / 2, by, bw / 2 - 0.5, 1), fixed.dark, { outline: 'ink', clip: (px, py) => py < by });
      g.rect(bx, by, bw, bh, fixed, { light: 1, outline: 'ink' });
      g.rect(bx + Math.floor((bw - 1) / 2), by + Math.floor(bh / 2) - 1, bw % 2 ? 1 : 2, 2, HOLE);
    } else if (a.lock === 'bar') {
      const bh = Math.max(3, Math.round(4 * ks));
      g.rect(jx, ly - Math.floor(bh / 2) - 1, 3, bh + 2, fixed, { light: 1, outline: 'ink' });
    }
    const dx = Math.round(a.at[0]) - CX, dy = Math.round(a.at[1]) - (GROUND + 1);
    return g.stamps().map((st) => ({ ...st, at: [st.at[0] + dx, st.at[1] + dy] }));
  },
});

// ---- door.dungeon@1: sprites/dungeon-door.js --------------------------------------------------------------------------------

/** The leaves door.dungeon@1 draws: planks with two bands, a leaf framed and crossed in iron, a carved stone slab. */
export const DUNGEON_DOORS = Object.freeze(['wood', 'iron', 'stone']);

/**
 * door.dungeon@1: a door set in a dungeon wall's face on a top-down map, seen from the south (port of
 * sprites/dungeon-door.js): a stone frame from a flat lintel to a round arch (`corner`), and a leaf of planks, of iron
 * or a stone slab with bands, a lock plate and a barred window, shown through the doorway. Tables: `raise` (how far
 * the leaf has slid up into the wall, a share of the way; its iron shoe stays in view), `heave` (px it is lifted), `flash`
 * (1: the lock is white), `locked` (0: no lock plate, as under a seal). Light (`layer: "light"`): `dust` (how far the
 * grit puffs from its foot have gone, 0 to 1; below 0 none) and `seal` (1: a rune seal turns over it, a third of a turn
 * a loop, pulsing).
 */
export const doorDungeon = defineGenerator({
  id: 'door.dungeon', v: 1, family: 'shape',
  about: 'A top-down dungeon door (wood, iron or stone slab) in an arched stone frame that slides up, heaves against its lock or is held by a rune seal.',
  args: {
    at: point({ default: [16, 46], about: 'The middle of its threshold: the row under its lowest row' }),
    style: word(DUNGEON_DOORS, { default: 'wood', about: 'Wood, iron-bound or a stone slab' }),
    corner: share({ default: 0.6, about: 'Square to round-topped arch' }),
    bars: flag({ default: false, about: 'A barred window' }),
    raise: frames('How far the leaf has slid up, a share of the way'),
    heave: frames('Pixels the leaf is lifted'),
    flash: frames('1: the lock is white'),
    locked: frames('0: no lock plate', [1]),
    dust: frames('How far the dust at its foot has gone, 0 to 1 (below 0: none)', [-1]),
    seal: frames('1: a rune seal turns over it'),
    layer: layerArg(),
    leaf: paint({ about: 'The leaf' }),
    metal: paint({ about: 'Bands, studs, lock and bars' }),
    stone: paint({ about: 'The frame' }),
    inner: paint({ about: 'The seal\'s light' }),
    hole: paint({ about: 'The dark of the doorway and the window' }),
    inkTone: paint({ about: 'The ink colour, for the leaf\'s darkest tone' }),
    shine: paint({ about: 'White: the flash and the seal\'s heart' }),
  },
  cost: () => gridCost(32, 48, 300),
  run(a, ctx) {
    const W = 32, H = 48, CX = 16, GROUND = 45, JAMB = 4, HEAD = 5, TOP = 4, OX = 6, LW = 20, OY = TOP + HEAD, FOOT = GROUND - 1, STAY = 5;
    const g = new Pixels(0, 0, W, H), ry = Math.round(lerp(0, 9, a.corner)), spring = OY + ry;
    const hole = archIn(OX, OX + LW, OY, spring, FOOT + 1), frame = archIn(OX, OX + LW, OY, spring, FOOT + 1, JAMB, HEAD);
    const D = { ry, spring, hole, frame, winY: spring + (ry ? -Math.round(ry * 0.3) : 3), lockY: FOOT - 14 };
    const dx0 = Math.round(a.at[0]) - CX, dy0 = Math.round(a.at[1]) - (GROUND + 1);
    const placed = () => g.stamps().map((st) => ({ ...st, at: [st.at[0] + dx0, st.at[1] + dy0] }));
    if (a.layer === 'light') {
      const dust = tableAt(a.dust, ctx, -1);
      if (dust >= 0) {
        const grit = rampOf(a.stone);
        for (const [x, side] of [[OX + 1, -1], [OX + LW - 2, 1]]) puffs(g, { t: dust, x, y: FOOT, count: 2, seed: 3 + side, angle: side * 1.2, arc: 0.5, dist: 3, rise: 3, size: 1.6, floor: GROUND, colours: [grit.light, toneRule(a.stone, 0.4), grit.dark], box: [1, 20, W - 1, GROUND + 1] });
      }
      if (tableAt(a.seal, ctx) >= 1) {
        const C = lightSteps(a.inner, a.shine), t = Number.isFinite(ctx?.t) ? ctx.t : 0;
        runeSeal(g, CX + 0.5, Math.round((D.spring + FOOT) / 2) + 0.5, 9, t / 3, C, { marks: 6, heat: pulse(t * 2), box: [1, 1, W - 1, GROUND] });
      }
      return placed();
    }
    const stone = rampOf(a.stone), face = { light: stone.light, base: { rule: 'mix', of: colourOf(a.stone), with: colourOf(stone.light), amount: 0.45 }, dark: a.stone }, joint = stone.dark;
    g.blob([D.frame, rectIn(OX - JAMB, GROUND, LW + 2 * JAMB, 1)], face, { shade: 2, light: 1 });
    g.rect(OX - JAMB + 1, GROUND, LW + 2 * JAMB - 2, 1, stone.light);
    for (let y = D.spring + 4, i = 0; y < FOOT - 2; y += 7, i++) { g.rect(OX - JAMB + 1, y + (i % 2 ? 0 : 3), JAMB - 1, 1, joint); g.rect(OX + LW, y + (i % 2 ? 3 : 0), JAMB - 1, 1, joint); }
    if (D.ry >= 3) archStones(g, CX, D.spring, LW / 2, D.ry, { depth: HEAD, every: 6, colour: joint, keystone: stone.light, clip: D.frame });
    else {
      for (const x of [OX + 3, CX - 3, CX + 2, OX + LW - 4]) g.rect(x, TOP + 1, 1, HEAD - 1 + D.ry, joint, { clip: (px, py) => D.frame(px, py) && !D.hole(px, py) });
      g.rect(CX - 2, TOP, 4, HEAD - 1, stone.light, { clip: D.frame });
    }
    g.fill(OX - 1, OY - 1, OX + LW + 1, FOOT + 1, D.hole, a.hole, { outline: 'ink', clip: (px, py) => py < FOOT + 1 });
    for (let i = 0; i < 3; i++) g.rect(OX + 1 + i, FOOT - i, LW - 2 - 2 * i, 1, toneRule(a.hole, 1.2 - 0.35 * i));
    // the leaf, shut, with what is fixed to it
    const s = g.blank(), flash = tableAt(a.flash, ctx) >= 1, locked = tableAt(a.locked, ctx, 1) >= 1;
    const body = rampOf(a.leaf), metal = rampOf(a.metal), clip = { clip: hole };
    const dark = { rule: 'mix', of: colourOf(body.dark), with: colourOf(a.inkTone), amount: 0.5 }, lh = FOOT - OY + 1;
    const bandY = [D.winY + 9, FOOT - 6];
    const band = (y, h = 3) => { s.rect(OX, y, LW, h, metal, { light: 1, clip: hole }); s.rect(OX, y + h, LW, 1, dark, clip); for (let x = OX + 2; x < OX + LW - 1; x += 4) s.rect(x, y + 1, 1, 1, metal.dark, clip); };
    s.fill(OX, OY, OX + LW, FOOT + 1, hole, body.base);
    if (a.style === 'wood') {
      const pale = { rule: 'mix', of: colourOf(body.base), with: colourOf(body.light), amount: 0.35 };
      for (let i = 0; i < 4; i++) {
        if (i % 2) s.rect(OX + i * 5, OY, 5, lh, pale, clip);
        if (i) s.rect(OX + i * 5, OY, 1, lh, body.dark, clip);
        s.rect(OX + i * 5 + 2 + (i % 2), OY + Math.round(lh * (0.5 + 0.12 * ((i * 7) % 3))), 1, 4, body.dark, clip);
      }
      for (const y of bandY) band(y);
    } else if (a.style === 'iron') {
      s.fill(OX, OY, OX + LW, FOOT + 1, (px, py) => hole(px, py) && !insetIn(hole, 2)(px, py), metal, { light: 1 });
      s.fill(OX, OY, OX + LW, FOOT + 1, (px, py) => insetIn(hole, 2)(px, py) && !insetIn(hole, 3)(px, py), dark);
      s.rect(CX - 1, OY, 2, lh, metal.base, clip); s.rect(CX - 2, OY + 2, 1, lh - 4, dark, clip); s.rect(CX + 1, OY + 2, 1, lh - 4, dark, clip);
      band(bandY[0]); band(bandY[1], 2);
      for (const y of [bandY[0] + 1, bandY[1]]) for (const x of [OX + 1, CX - 1, OX + LW - 2]) s.rect(x, y, 1, 1, metal.light, clip);
    } else {
      s.fill(OX, OY, OX + LW, FOOT + 1, hole, body, { shade: 2, light: 1 });
      const panel = (px, py) => insetIn(hole, 3)(px, py) && py >= bandY[0] + 5 && py < bandY[1] - 2;
      s.fill(OX, OY, OX + LW, FOOT + 1, panel, body.dark);
      s.fill(OX, OY, OX + LW, FOOT + 1, (px, py) => panel(px, py) && panel(px + 1, py) && panel(px, py - 1), { rule: 'mix', of: colourOf(body.base), with: colourOf(body.dark), amount: 0.5 });
      band(bandY[0], 2); band(bandY[1], 2);
      crack(s, OX + 5, OY + 1, 0.35, bandY[0] - OY - 2, body.dark, { seed: 4, clip: hole, jag: 0.5, branch: false });
      for (const [x, y] of [[OX + 12, bandY[0] - 6], [OX + 4, bandY[1] - 7]]) drawPlateMark(s, 'pit', x, y, y > bandY[0] ? dark : body.dark);
    }
    s.fill(OX, OY, OX + LW, D.spring + 2, (px, py) => hole(px, py) && !hole(px, py - 1), dark);
    if (a.bars) {
      const wx = CX - 5, wy = D.winY, wh = 6;
      s.rect(wx - 1, wy - 1, 12, wh + 2, body.dark, clip); s.rect(wx, wy, 10, wh, a.hole, clip);
      for (const x of [wx + 2, wx + 5, wx + 8]) { s.rect(x, wy, 1, wh, metal.base, clip); s.rect(x, wy, 1, 1, metal.light, clip); }
    }
    const lock = flash ? { light: a.shine, base: a.shine, dark: a.shine } : metal, lx = OX + LW - 7, ly = D.lockY;
    if (locked) s.rect(lx, ly, 5, 6, lock, { light: 1, outline: 'ink' });
    if (locked && !flash) { s.rect(lx + 1, ly + 1, 3, 2, dark); s.rect(lx + 2, ly + 3, 1, 2, dark); }
    s.rect(OX, FOOT - 1, LW, 2, metal, { light: 1, clip: hole });
    s.rect(OX, FOOT - 2, LW, 1, dark, clip);
    const up = Math.round(tableAt(a.raise, ctx) * (FOOT - OY + 1 - STAY)) + tableAt(a.heave, ctx);
    g.blit(maskedOf(s, (px, py) => hole(px, py - up)), 0, -up);
    if (up > 0 && up < FOOT - OY) g.rect(OX, FOOT - up + 1, LW, 1, 'ink', { clip: hole });
    return placed();
  },
});

// ---- rocks: engine/fx.js rock and rockBreak, engine/rock.js seam, with paint refs -----------------------------------------

/** Ink on every empty pixel of a grid beside a painted one (engine/surface.js outline). */
function inkRound(g, ink = 'ink') {
  const hits = [];
  for (let y = g.y0; y < g.y0 + g.h; y++) for (let x = g.x0; x < g.x0 + g.w; x++) if (!g.has(x, y) && (g.has(x - 1, y) || g.has(x + 1, y) || g.has(x, y - 1) || g.has(x, y + 1))) hits.push([x, y]);
  for (const [x, y] of hits) g.set(x, y, ink);
  return g;
}

/** A dark line where a nearer shape lies over what is already painted (engine/rock.js seam). */
function seamOn(g, inside, colour) {
  const hits = [];
  for (let y = g.y0 + 0; y < g.y0 + g.h; y++) for (let x = g.x0; x < g.x0 + g.w; x++) {
    if (!g.has(x, y)) continue;
    const px = x + 0.5, py = y + 0.5;
    if (inside(px, py)) continue;
    if (inside(px + 1, py) || inside(px - 1, py) || inside(px, py + 1) || inside(px, py - 1)) hits.push([x, y]);
  }
  for (const [x, y] of hits) g.set(x, y, colour);
}

/** A rigid rock (engine/fx.js rock) on a grid with paint refs: a shaded lump with a lit facet, cracks, chips and a patch. Returns its shape test. */
function rockOn(g, { x, y, r = 8, angle = 0, seed = 0, sides = 8, jag = 0.2, squash = 1, colour, cracks = 0, chips = 0, patch = null, box }) {
  const B = [Math.max(1, Math.floor(box[0])), Math.max(1, Math.floor(box[1])), Math.min(g.w - 1, Math.floor(box[2])), Math.min(g.h - 1, Math.floor(box[3]))];
  const R = rampOf(colour), c = Math.cos(angle), s = Math.sin(angle), h = (i, ch) => hash(i, seed * 64 + ch);
  const at = (u, v) => [x + u * c - v * s, y + u * s + v * c], polar = (a, d) => at(Math.cos(a) * d, Math.sin(a) * d * squash);
  const whole = rockIn(x, y, r, { seed, sides, jag, squash, angle }), bites = [];
  for (let i = 0; i < chips; i++) { const [bx, by] = polar(2 * Math.PI * h(i, 21), r * 0.96); bites.push([bx, by, r * (0.16 + 0.08 * h(i, 22))]); }
  const body = (px, py) => { if (!whole(px, py)) return false; for (const [bx, by, br] of bites) if ((px - bx) ** 2 + (py - by) ** 2 <= br * br) return false; return true; };
  const clip = (px, py) => px >= B[0] && py >= B[1] && px < B[2] && py < B[3];
  g.fill(x - r - 1, y - r - 1, x + r + 1, y + r + 1, body, R, { shade: r >= 7 ? 2 : 1, clip });
  const [sx, sy] = g.shadow, k = 0.56, fx0 = x - sx * r * 0.2, fy0 = y - sy * r * 0.2;
  const facet = (px, py) => body(x + (px - fx0) / k, y + (py - fy0) / k) && body(px - 1, py) && body(px + 1, py) && body(px, py - 1) && body(px, py + 1);
  if (r >= 4) g.fill(x - r - 1, y - r - 1, x + r + 1, y + r + 1, facet, R.light, { clip });
  if (patch) {
    const pr = r * (patch.size ?? 0.6), pa = patch.at ?? 0;
    const lobes = [[...polar(pa, r * 0.62), pr], [...polar(pa + 0.9, r * 0.7), pr * 0.55], [...polar(pa - 0.8, r * 0.74), pr * 0.5]];
    const inPatch = (px, py) => body(px, py) && lobes.some(([lx, ly, lr]) => (px - lx) ** 2 + (py - ly) ** 2 <= lr * lr);
    g.fill(x - r - 1, y - r - 1, x + r + 1, y + r + 1, inPatch, rampOf(patch.colour), { shade: 1, outline: toneRule(patch.colour, -1), clip: (px, py) => clip(px, py) && body(px, py) });
  }
  for (let i = 0; i < cracks; i++) {
    const a = 2 * Math.PI * (i / cracks + 0.13 + 0.12 * h(i, 31));
    const pts = [polar(a, r), polar(a + (h(i, 32) - 0.5) * 0.7, r * 0.55), polar(a + (h(i, 33) - 0.5) * 1.4, r * (0.12 + 0.2 * h(i, 34)))];
    for (let q = 0; q < 2; q++) {
      const [ax, ay] = pts[q], [bx, by] = pts[q + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
      for (let e = 0; e <= n; e++) {
        const px = ax + ((bx - ax) * e) / n, py = ay + ((by - ay) * e) / n, cxp = Math.floor(px) + 0.5, cyp = Math.floor(py) + 0.5;
        if (body(cxp, cyp) && body(cxp + sx, cyp + sy) && clip(Math.floor(px), Math.floor(py))) g.set(Math.floor(px), Math.floor(py), R.dark);
      }
    }
  }
  return body;
}

/** A rock coming apart in wedges that fly, tumble and shrink (engine/fx.js rockBreak) on a grid with paint refs. */
function rockBreakOn(g, { t = 0, x, y, r = 8, angle = 0, seed = 0, sides = 8, jag = 0.2, squash = 1, colour, chips = 0, patch = null, pieces = 4, turn = 0.5, uneven = 0.5, dist = 8, gravity = 5, spin = 0.15, shrink = 0.6, seam = null, box }) {
  const B = [Math.max(1, Math.floor(box[0])), Math.max(1, Math.floor(box[1])), Math.min(g.w - 1, Math.floor(box[2])), Math.min(g.h - 1, Math.floor(box[3]))];
  const R = rampOf(colour), k = clamp01(t), n = Math.max(2, Math.min(8, Math.round(pieces))), h = (i, ch) => hash(i, seed * 64 + ch), TAU = 2 * Math.PI;
  const [sx, sy] = g.shadow, c = Math.cos(angle), s = Math.sin(angle);
  const whole = rockIn(0, 0, r, { seed, sides, jag, squash }), bites = [];
  for (let i = 0; i < chips; i++) { const a = TAU * h(i, 21); bites.push([Math.cos(a) * r * 0.96, Math.sin(a) * r * 0.96 * squash, r * (0.16 + 0.08 * h(i, 22))]); }
  const body = (u, v) => whole(u, v) && !bites.some(([bx, by, br]) => (u - bx) ** 2 + (v - by) ** 2 <= br * br);
  const lobes = [];
  if (patch) { const pr = r * (patch.size ?? 0.6), pa = patch.at ?? 0; for (const [da, d, sz] of [[0, 0.62, 1], [0.9, 0.7, 0.55], [-0.8, 0.74, 0.5]]) lobes.push([Math.cos(pa + da) * r * d, Math.sin(pa + da) * r * d * squash, pr * sz]); }
  const cuts = [];
  for (let i = 0; i < n; i++) cuts.push(turn + (TAU * (i + (h(i, 41) - 0.5) * 0.8 * clamp01(uneven))) / n);
  const wedgeOf = (u, v) => { const a = cuts[0] + fract((Math.atan2(v, u) - cuts[0]) / TAU) * TAU; let w = 0; for (let i = 1; i < n; i++) if (a >= cuts[i]) w = i; return w; };
  const clip = (px, py) => px >= B[0] && py >= B[1] && px < B[2] && py < B[3];
  const within = (v, lo, hi) => Math.min(Math.max(v, lo + 0.01), hi - 0.01);
  const sc = 1 - clamp01(shrink) * k ** 1.5, ext = r * 0.5 * sc;
  for (let i = 0; i < n; i++) {
    const m = (cuts[i] + (i + 1 < n ? cuts[i + 1] : cuts[0] + TAU)) / 2;
    const gu = Math.cos(m) * r * 0.5, gv = Math.sin(m) * r * 0.5 * squash, hx = gu * c - gv * s, hy = gu * s + gv * c, hl = Math.hypot(hx, hy) || 1;
    const d = dist * (0.55 + 0.45 * h(i, 42)) * easeOut(k);
    const cx = within(x + hx + (hx / hl) * d, B[0] + ext, B[2] - ext), cy = within(y + hy + (hy / hl) * d + gravity * k * k * (0.6 + 0.4 * h(i, 43)), B[1] + ext, B[3] - ext);
    const A = angle + TAU * spin * (h(i, 44) - 0.5) * 2 * k, ca = Math.cos(A), sa = Math.sin(A);
    const toRock = (px, py) => { const qx = px - cx, qy = py - cy; return [gu + (qx * ca + qy * sa) / sc, gv + (qy * ca - qx * sa) / sc]; };
    let drew = false;
    const inside = (px, py) => { const [u, v] = toRock(px, py); return body(u, v) && wedgeOf(u, v) === i; };
    const reach = r * sc * 1.2 + 1, bx = [cx - reach, cy - reach, cx + reach, cy + reach];
    g.fill(...bx, (px, py) => { const on = inside(px, py); if (on && clip(px, py)) drew = true; return on; }, R, { shade: 1, clip });
    if (!drew) { if (clip(Math.floor(cx), Math.floor(cy))) g.set(Math.floor(cx), Math.floor(cy), R.base); continue; }
    if (r * sc >= 5) {
      const kf = 0.5, fx0 = cx - sx * r * sc * 0.12, fy0 = cy - sy * r * sc * 0.12;
      g.fill(...bx, (px, py) => inside(cx + (px - fx0) / kf, cy + (py - fy0) / kf) && inside(px - 1, py) && inside(px + 1, py) && inside(px, py - 1) && inside(px, py + 1), R.light, { clip });
    }
    if (patch) {
      const inPatch = (px, py) => { const [u, v] = toRock(px, py); return body(u, v) && wedgeOf(u, v) === i && lobes.some(([lx, ly, lr]) => (u - lx) ** 2 + (v - ly) ** 2 <= lr * lr); };
      g.fill(...bx, inPatch, rampOf(patch.colour), { shade: 1, outline: toneRule(patch.colour, -1), clip: (px, py) => clip(px, py) && inside(px, py) });
    }
  }
  if (seam && k === 0) {
    const at = (px, py) => { const dx = px - x, dy = py - y, u = dx * c + dy * s, v = dy * c - dx * s; return body(u, v) ? wedgeOf(u, v) : -1; };
    for (let py = Math.max(B[1], Math.floor(y - r - 1)); py <= Math.min(B[3] - 1, Math.ceil(y + r + 1)); py++) for (let px = Math.max(B[0], Math.floor(x - r - 1)); px <= Math.min(B[2] - 1, Math.ceil(x + r + 1)); px++) {
      const qx = px + 0.5, qy = py + 0.5, w = at(qx, qy), e = at(qx + 1, qy), q = at(qx, qy + 1);
      if (w >= 0 && ((e >= 0 && e !== w) || (q >= 0 && q !== w))) g.set(px, py, seam);
    }
  }
}

// ---- boulder@1: sprites/boulder.js ------------------------------------------------------------------------------------------

/** The shapes boulder@1 draws: one big stone, a low slab, a cluster of three. */
export const BOULDER_SHAPES = Object.freeze(['round', 'slab', 'cluster']);
const STONES = {
  round: [{ dx: 0, dy: 0, k: 1, squash: 0.86, seed: 5, sides: 8, jag: 0.2, moss: -1.9, share: 1 }],
  slab: [{ dx: 0, dy: 0, k: 1.1, squash: 0.58, seed: 11, sides: 7, jag: 0.12, moss: -1.9, share: 1 }],
  cluster: [
    { dx: -0.22, dy: -0.25, k: 0.78, squash: 0.9, seed: 5, sides: 8, jag: 0.16, moss: -2.0, share: 0.6 },
    { dx: 0.58, dy: 0.22, k: 0.5, squash: 0.85, seed: 23, sides: 7, jag: 0.14, moss: -1.2, share: 0.25 },
    { dx: -0.62, dy: 0.34, k: 0.38, squash: 0.8, seed: 31, sides: 6, jag: 0.12, moss: -2.4, share: 0.15 },
  ],
};

/**
 * boulder@1: a boulder that blocks a path on a map, seen from above and in front (port of sprites/boulder.js): one big
 * stone, a low slab or a cluster of three leaning on each other, moss on top when `mossy`, chips and cracks that grow
 * with `wear` along the lines it will break on. Tables: `squash` and `shift` (a hit's wobble, px); `burst` (how far it
 * has come apart, 0 to 1, each stone splitting into wedges that fly, tumble and wear down to rubble, every stone inked
 * on its own: draw this call after the asset's outline; below 0 whole). Light (`layer: "light"`): `dust` (the dust of
 * the break, 0 to 1; below 0 none).
 */
export const boulder = defineGenerator({
  id: 'boulder', v: 1, family: 'shape',
  about: 'A round, slab or clustered boulder, mossy and cracked, that wobbles when hit and splits into tumbling wedges, by tables.',
  args: {
    at: point({ default: [24, 44], about: 'The middle of its foot: the row under its lowest row' }),
    shape: word(BOULDER_SHAPES, { default: 'round', about: 'Round, slab or cluster' }),
    size: share({ default: 0.5, about: 'Small to big' }),
    mossy: flag({ default: true, about: 'Moss on its top' }),
    wear: share({ default: 0.5, about: 'New to worn: chips and cracks' }),
    pieces: share({ default: 0.5, about: 'Few to many pieces when it breaks' }),
    squash: frames('Pixels wider and shorter (a hit)'),
    shift: frames('Pixels knocked sideways'),
    burst: frames('How far it has come apart, 0 to 1 (below 0: whole)', [-1]),
    dust: frames('How far the dust of the break has gone, 0 to 1 (below 0: none)', [-1]),
    layer: layerArg(),
    stone: paint({ about: 'The stone' }),
    moss: paint({ about: 'The moss' }),
    shine: paint({ about: 'White: the cut lines as it splits' }),
  },
  cost: (a) => gridCost(48, 48, 180) + (breaks(a.burst) ? workCost(48 * 48 * (300 + 900 * share01(a.pieces)) * (0.6 + 0.4 * share01(a.size))) : 0),
  run(a, ctx) {
    const W = 48, CX = 24, GROUND = 43, BOX = [1, 1, W - 1, GROUND + 1], TURN = 0.45;
    const g = new Pixels(0, 0, W, W);
    const dx0 = Math.round(a.at[0]) - CX, dy0 = Math.round(a.at[1]) - (GROUND + 1);
    const placed = () => g.stamps().map((st) => ({ ...st, at: [st.at[0] + dx0, st.at[1] + dy0] }));
    const layout = (squash = 0, shift = 0) => {
      const R = lerp(12, 17, a.size) + squash * 0.5;
      const parts = STONES[a.shape].map((s) => ({ ...s, x: CX + s.dx * R, y: 24 + s.dy * R, r: R * s.k, squash: s.squash * (1 - squash * 0.06) }));
      const b = boundsOf(parts.map((s) => rockIn(s.x, s.y, s.r, s)), W);
      const dx = Math.round(CX - (b.x0 + b.x1 + 1) / 2) + shift, dy = GROUND - b.y1;
      return parts.map((s) => ({ ...s, x: s.x + dx, y: s.y + dy }));
    };
    const look = (s, i) => ({ x: s.x, y: s.y, r: s.r, squash: s.squash, seed: s.seed, sides: s.sides, jag: s.jag, colour: a.stone,
      chips: i === 0 ? Math.round(a.wear * 2) : 0, patch: a.mossy ? { colour: a.moss, size: i ? 0.5 : 0.42, at: s.moss } : null, box: BOX });
    const piecesOf = (s) => Math.max(2, Math.round(lerp(3, 7, a.pieces) * s.share));
    const burst = tableAt(a.burst, ctx, -1);
    if (a.layer === 'light') {
      const dust = tableAt(a.dust, ctx, -1);
      if (dust >= 0) {
        const R = layout()[0].r, stone = rampOf(a.stone);
        puffs(g, { t: dust, x: CX, y: GROUND - 3, count: 3, seed: 4, angle: Math.PI, arc: 2.6, dist: R * 0.9, rise: 3, size: 2.2, floor: GROUND, colours: [toneRule(a.stone, 0.45), a.stone, stone.dark], box: BOX });
      }
      return placed();
    }
    if (burst >= 0) {
      const parts = layout(), R = parts[0].r;
      parts.forEach((s, i) => {
        const bits = new Pixels(0, 0, W, W);
        rockBreakOn(bits, { ...look(s, i), t: burst, pieces: piecesOf(s), turn: TURN + i, uneven: 0, dist: R * (i ? 0.45 : 0.6), gravity: 3, spin: 0.18, shrink: 0.55, seam: a.shine });
        g.blit(inkRound(bits));
      });
      return placed();
    }
    const parts = layout(tableAt(a.squash, ctx), tableAt(a.shift, ctx)), stone = rampOf(a.stone), cracks = Math.round(a.wear * 3);
    parts.forEach((s, i) => {
      const body = rockOn(g, look(s, i));
      if (i) seamOn(g, body, stone.deep);
      if (i) return;
      const n = piecesOf(s);
      for (let c = 0; c < Math.min(cracks, n); c++) {
        const ang = TURN + (2 * Math.PI * c) / n, away = Math.atan2(Math.cos(ang), Math.sin(ang) * s.squash);
        crack(g, s.x + Math.cos(ang) * s.r * 0.18, s.y + Math.sin(ang) * s.r * 0.18 * s.squash, away, Math.round(s.r * 0.7), stone.dark, { seed: 3 + c, clip: body, jag: 0.5, branch: a.wear >= 0.8 });
      }
    });
    return placed();
  },
});

// ---- light effects of engine/fx.js that paint only the colours they are given ----------------------------------------------

/**
 * A stand-in Surface for engine/fx.js effects that paint only the colours they are handed (glow, ring, particles,
 * scorch): each paint ref is handed to them as a code colour of its own, and what they paint is read back into a grid
 * as the refs. An effect that worked out a colour of its own would leave a code with no ref: that throws, so a test
 * catches it.
 */
class Coded {
  constructor(w, h) { this.w = w; this.h = h; this.data = new Int32Array(w * h); this.shadow = [-1, 1]; this.refs = new Map(); this.codes = new Map(); }
  /** The code colour standing for a paint ref. */
  code(ref) {
    const k = typeof ref === 'string' ? ref : JSON.stringify(ref);
    if (!this.codes.has(k)) { const hex = `#${(0x100000 + this.codes.size * 7 + 1).toString(16).padStart(6, '0')}`; this.codes.set(k, hex); this.refs.set(col(hex), ref); }
    return this.codes.get(k);
  }
  /** One pixel (engine/surface.js dot). */
  dot(x, y, c) { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.data[y * this.w + x] = col(c); return this; }
  /** What was painted, onto a grid at origin 0, as paint refs. */
  onto(g) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const v = this.data[y * this.w + x] >>> 0;   // the grid holds signed numbers, engine/color.js col unsigned ones
      if (!v) continue;
      if (!this.refs.has(v)) throw new Error('an effect painted a colour it was not given');
      g.set(x, y, this.refs.get(v));
    }
    return g;
  }
}

/** Solid chunks thrown from a point that spin up, fall and land on the floor (engine/fx.js chunks) on a grid with paint refs. */
function chunksOn(g, { t = 0, x, y, count = 6, seed = 0, dist = 12, rise = 10, size = 6, thick = 2, spread = 3, spin = 1, land = 0.85, shrink = 0.45, rest = true, colour, floor: fl, box }) {
  const B = [Math.max(1, Math.floor(box[0])), Math.max(1, Math.floor(box[1])), Math.min(g.w - 1, Math.floor(box[2])), Math.min(g.h - 1, Math.floor(box[3]))];
  const R = rampOf(colour), floor = Math.min(fl ?? B[3] - 1, B[3] - 1), k = clamp01(t), h = (i, ch) => hash(i, seed * 64 + ch), TAU = 2 * Math.PI;
  const within = (v, lo, hi) => Math.min(Math.max(v, lo + 0.01), hi - 0.01);
  const put = (px, py, c) => { px = Math.floor(px); py = Math.floor(py); if (px >= B[0] && py >= B[1] && px < B[2] && py < B[3]) g.set(px, py, c); };
  for (let i = 0; i < count; i++) {
    const side = i % 2 ? -1 : 1, x0 = x + (h(i, 2) - 0.5) * 2 * spread, y0 = Math.min(y + (h(i, 3) - 0.5) * 2 * spread, floor - 1);
    const T = Math.max(0.2, land * (0.6 + 0.4 * h(i, 4))), up = rise * (0.45 + 0.55 * h(i, 5)), drop = floor - y0;
    const sq = (Math.sqrt(up) + Math.sqrt(up + drop)) / T, v = 2 * sq * Math.sqrt(up), kk = Math.min(k, T), a = kk / T;
    const L = Math.max(1, size * (0.7 + 0.6 * h(i, 6)) * (1 - shrink * a)), th = L < 3 ? 1 : thick;
    const cx = within(x0 + side * dist * (0.35 + 0.65 * h(i, 7)) * easeOut(a), B[0] + 0.5, B[2] - 0.5), landed = k >= T;
    if (landed && !rest) continue;
    const cy = landed ? floor + 1 - th / 2 : within(y0 - v * kk + sq * sq * kk * kk, B[1] + 0.5, floor + 1 - th / 2);
    const rot = landed ? 0 : TAU * spin * side * (0.5 + h(i, 8)) * (1 - a) + (h(i, 9) - 0.5);
    if (L < 2) { put(cx, Math.min(cy, floor), R.base); continue; }
    const ux = (Math.cos(rot) * L) / 2, uy = (Math.sin(rot) * L) / 2, wx = (-Math.sin(rot) * th) / 2, wy = (Math.cos(rot) * th) / 2;
    let pts = [[cx - ux - wx, cy - uy - wy], [cx + ux - wx, cy + uy - wy], [cx + ux + wx, cy + uy + wy], [cx - ux + wx, cy - uy + wy]];
    if (landed) { const l = Math.round(cx - L / 2), w = Math.max(2, Math.round(L)); pts = [[l, floor + 1 - th], [l + w, floor + 1 - th], [l + w, floor + 1], [l, floor + 1]]; }
    let drew = false;
    const inside = (px, py) => {
      if (px < B[0] || py < B[1] || px >= B[2] || py >= floor + 1) return false;
      let hit = false;
      for (let p = 0, q = 3; p < 4; q = p++) { const [xi, yi] = pts[p], [xj, yj] = pts[q]; if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit; }
      if (hit) drew = true;
      return hit;
    };
    g.fill(cx - L, cy - L, cx + L, cy + L, inside, R, { shade: th >= 2 ? 1 : 0, clip: (px, py) => px >= B[0] && py >= B[1] && px < B[2] && py < B[3] });
    if (!drew) put(cx, Math.min(cy, floor), R.base);
  }
}

/** Dents, scratches and grime on a solid's wall (engine/solids.js wallWear) with paint refs. */
function wallWearOn(g, S, amount, R, { spots = 6, grime = 2, mid, half }) {
  if (!S.box || !(amount > 0)) return;
  const SPOTS = [[-0.5, 0.16, 'd'], [0.5, 0.74, 'd'], [0.15, 0.45, 's'], [-0.3, 0.86, 's'], [0.62, 0.3, 'd'], [-0.66, 0.58, 's']];
  const reach = half - 1, mark = (x, y, c) => { if (S.wall(x + 0.5, y + 0.5)) g.dot(x, y, c); };
  const worn = Math.round(Math.min(1, amount) * spots);
  for (let i = 0; i < Math.min(worn, SPOTS.length); i++) {
    const [u, v, kind] = SPOTS[i], x = Math.round(mid + u * reach), top = S.front(x);
    if (top === null) continue;
    const y = top + 2 + Math.round(v * Math.max(0, S.h - 4));
    if (kind === 'd') { mark(x, y, R.dark); mark(x + 1, y, R.dark); mark(x, y + 1, R.dark); mark(x + 1, y + 1, R.light); }
    else { mark(x, y, R.light); mark(x + 1, y - 1, R.light); mark(x + 2, y - 2, R.light); }
  }
  if (grime > 0 && amount > 0.5) {
    const foot = bandOf(S, S.h - 1 - grime, grime);
    wallFillOn(g, S, (px, py) => foot(px, py) && hash(Math.floor(px), Math.floor(py) + 31) < amount * 0.7, R.dark, { flat: true });
  }
}

// ---- fuel.barrel@1: sprites/fuel-barrel.js ----------------------------------------------------------------------------------

/** The builds fuel.barrel@1 draws: a ribbed drum, a domed gas tank with a valve, a six-sided fuel cell with a window. */
export const BARREL_STYLES = Object.freeze(['barrel', 'tank', 'cell']);

/**
 * fuel.barrel@1: an explosive barrel seen from above and in front (port of sprites/fuel-barrel.js): a ribbed drum with
 * hazard tape, a domed gas tank with a valve and a warning plate, or a six-sided fuel cell with a glowing window; a
 * warning lamp, wear. Tables: `lamp` (0 off, 0.5 dim, 1 lit), `leak` (rows of fuel run from a hole), `grow` (px it has
 * swollen), `squash`, `shift` (a hit), `tint` (1: the whole body flashes the hot colour of its light), `stage` (0 whole,
 * 1 split in two halves jumping apart, 2 blown: a scorch ring and two inked fragments on the floor, three more flying;
 * below 0 nothing) with `blast` (how far the blast has gone, 0 to 1). Light (`layer: "light"`): `flare` (1: the lamp
 * flares), `puddle` (the radius of the fuel pooled at its foot; 0 none), `ball` (the white ball: 1 as it splits, 2 just
 * blown, 3 fading) and, at stage 2, the ring, sparks and shards of the blast.
 */
export const fuelBarrel = defineGenerator({
  id: 'fuel.barrel', v: 1, family: 'shape',
  about: 'An explosive fuel drum, gas tank or fuel cell that leaks when hit, swells and flashes on its fuse and blows apart, by tables.',
  args: {
    at: point({ default: [16, 46], about: 'The middle of its foot: the row under its lowest row' }),
    style: word(BARREL_STYLES, { default: 'barrel', about: 'Drum, gas tank or fuel cell' }),
    size: share({ default: 0.5, about: 'Small to big' }),
    wear: share({ default: 0.35, about: 'New to worn: dents, scratches and grime' }),
    bands: flag({ default: true, about: 'Ribs, collars or end caps' }),
    lamp: frames('The warning lamp: 0 off, 0.5 dim, 1 lit'),
    leak: frames('Rows of fuel running from a hole'),
    grow: frames('Pixels it has swollen'),
    squash: frames('Pixels wider and shorter (a hit)'),
    shift: frames('Pixels knocked sideways'),
    tint: frames('1: the whole body flashes the hot colour of its light'),
    stage: frames('0 whole, 1 split, 2 blown (below 0: nothing)'),
    blast: frames('How far the blast has gone, 0 to 1'),
    flare: frames('1: the lamp flares (light)'),
    puddle: frames('The radius of the pooled fuel (light; 0 none)'),
    ball: frames('The white ball of the blast: 0 none, 1 splitting, 2 just blown, 3 fading (light)'),
    layer: layerArg(),
    body: paint({ about: 'The barrel' }),
    accent: paint({ about: 'The hazard label and tape' }),
    inner: paint({ about: 'The fuel and the light' }),
    tape: paint({ about: 'The tape stripes, plates and the scorch' }),
    steel: paint({ about: 'The tank\'s valve' }),
    panel: paint({ about: 'The fuel cell\'s end caps' }),
    cream: paint({ about: 'The warning mark on a dark plate' }),
    shine: paint({ about: 'White: glints and the flash' }),
  },
  cost: () => gridCost(32, 48, 530),
  run(a, ctx) {
    const W = 32, H = 48, CX = 16, GROUND = 45;
    const r0 = Math.round(lerp(7, 10, a.size));
    const d = a.style === 'tank' ? { rx: r0 - 1, ry: Math.round((r0 - 1) * 0.6), h: Math.round(r0 * 1.9) }
      : a.style === 'cell' ? { rx: r0, ry: Math.max(3, Math.round(r0 * 0.42)), h: Math.round(r0 * 2.1) } : { rx: r0, ry: Math.max(2, Math.round(r0 * 0.36)), h: Math.round(r0 * 2.3) };
    const dx0 = Math.round(a.at[0]) - CX, dy0 = Math.round(a.at[1]) - (GROUND + 1);
    const placed = (g) => g.stamps().map((st) => ({ ...st, at: [st.at[0] + dx0, st.at[1] + dy0] }));
    const C = lightSteps(a.inner, a.shine);
    const barrel = (o = {}) => {
      const g = new Pixels(0, 0, W, H), grow = o.grow ?? 0;
      const rx = d.rx + grow + (o.squash ?? 0), ry = d.ry, h = d.h + (grow > 1 ? 1 : 0) - (o.squash ?? 0);
      const cy = GROUND + 1 - h - ry, x0 = CX - rx, x1 = CX + rx + 1;
      let S, lens;
      const on = (from, thick, l = -Infinity, r = Infinity) => bandOf(S, from, thick, { x0: l, x1: r });
      if (a.style === 'tank') {
        S = extrudeOn(g, ellipseIn(CX + 0.5, cy, rx + 0.5, ry), h, a.body);
        const R = S.ramps.wall, T = S.ramps.top;
        g.ellipse(CX + 0.5 + rx * 0.4, cy - ry * 0.4, 2, 1.3, T.light);
        g.fill(x0, cy, x1, cy + ry + 1, edgeIn(S.top, 0, 1), R.light);
        if (a.bands) for (const from of [1, h - 5]) { wallFillOn(g, S, on(from, 2), { light: T.light, base: R.light, dark: R.base }); wallFillOn(g, S, on(from + 2, 1), R.dark, { flat: true }); }
        const top = cy - ry;
        g.rect(CX - 1, top - 2, 3, 3, a.steel); g.rect(CX - 3, top - 3, 7, 1, a.tape);
        lens = [CX - 1, top - 5, 3, 2];
        const m = rx >= 8 ? 7 : 5, from = Math.max(4, Math.round(h * 0.5) - ((m + 2) >> 1)), lx = CX - ((m + 1) >> 1), plate = on(from, m + 2, lx, lx + m + 2);
        wallFillOn(g, S, (px, py) => on(from - 1, m + 4, lx - 1, lx + m + 3)(px, py) && !plate(px, py), R.dark, { flat: true });
        wallFillOn(g, S, plate, a.accent, { flat: true });
        drawMark(g, 'exclaim', CX, S.front(CX) + 1 + from + ((m + 1) >> 1), m, { rule: 'standOut', against: colourOf(a.accent), from: [colourOf(a.tape), colourOf(a.cream)] }, { clip: plate });
      } else if (a.style === 'cell') {
        S = extrudeOn(g, polyIn(ngonPoints(CX + 0.5, cy, rx + 0.5, ry, 6)), h, a.body, { topColour: a.panel, lip: 1 });
        const R = S.ramps.wall;
        if (a.bands) for (const from of [0, h - 3]) wallFillOn(g, S, on(from, 3), a.panel);
        for (const from of [3, h - 6]) { wallFillOn(g, S, on(from, 3), { light: a.accent, base: a.accent, dark: toneRule(a.accent, -1) }); wallFillOn(g, S, stripesIn(on(from, 3), { pitch: 4 }), a.tape, { flat: true }); }
        const wy = 8, wh = Math.max(3, h - 16);
        wallFillOn(g, S, on(wy - 1, wh + 2, CX - 2, CX + 3), R.dark, { flat: true });
        wallFillOn(g, S, on(wy, wh, CX - 1, CX + 2), a.inner, { flat: true });
        wallFillOn(g, S, on(wy, wh, CX, CX + 1), toneRule(a.inner, 0.9), { flat: true });
        g.rect(CX - 2, cy - 1, 5, 2, a.tape);
        lens = [CX - 1, cy - 3, 3, 2];
      } else {
        S = extrudeOn(g, ellipseIn(CX + 0.5, cy, rx + 0.5, ry), h, a.body, { lip: 1, turn: 0.3 });
        const R = S.ramps.wall, T = S.ramps.top;
        wallFillOn(g, S, on(1, 1), R.dark, { flat: true });
        const from = Math.round(h * 0.38), thick = Math.max(4, Math.round(h * 0.28));
        if (a.bands) for (const rib of [from - 4, from + thick + 2]) { wallFillOn(g, S, on(rib, 1), { light: T.light, base: R.light, dark: R.base }, { turn: 0.3 }); wallFillOn(g, S, on(rib + 1, 1), R.dark, { flat: true }); }
        wallFillOn(g, S, on(from, thick), { light: a.accent, base: a.accent, dark: toneRule(a.accent, -1) }, { turn: 0.3 });
        wallFillOn(g, S, stripesIn(on(from, thick), { pitch: 4 }), a.tape, { flat: true });
        g.rect(x0 + 3, cy, 2, 1, R.base);
        g.rect(CX - 2, cy - 1, 5, 2, a.tape);
        lens = [CX - 1, cy - 3, 3, 2];
      }
      const R = S.ramps.wall, front = (x) => S.front(x) + 1;
      wallWearOn(g, S, a.wear, R, { mid: CX, half: rx });
      if (o.leak) {
        const lx = CX - Math.round(rx * 0.5), ly = front(lx) + Math.round(h * 0.5);
        g.rect(lx - 1, ly - 1, 3, 2, a.tape);
        for (let i = 0; i < o.leak; i++) if (ly + 1 + i <= front(lx) + h - 1) g.dot(lx, ly + 1 + i, a.inner);
      }
      lampOn(g, ...lens, a.inner, Math.min(o.lamp ?? 0, 1), { white: a.shine });
      return { g, lamp: lens, mid: Math.round(cy + ry + h / 2) };
    };
    const stage = Math.round(tableAt(a.stage, ctx)), k = clamp01(tableAt(a.blast, ctx));
    if (a.layer === 'light') {
      const g = new Pixels(0, 0, W, H);
      const B = barrel({ grow: stage >= 1 ? 1 : tableAt(a.grow, ctx) }), mid = B.mid;
      if (tableAt(a.flare, ctx) >= 1) lampOn(g, ...B.lamp, a.inner, 2, { white: a.shine });
      const pud = tableAt(a.puddle, ctx);
      if (pud > 0) g.ellipse(CX - d.rx * 0.55, GROUND - 0.5, pud, 1.3, a.inner, { outline: toneRule(a.inner, -1) });
      const fx = new Coded(W, H), steps = C.map((c) => fx.code(c)), ball = Math.round(tableAt(a.ball, ctx));
      if (ball === 1) fxGlow(fx, CX + 0.5, mid, d.rx * 0.9, steps);
      if (ball === 2) fxGlow(fx, CX + 0.5, mid, d.rx * 1.1, steps);
      if (ball === 3) fxGlow(fx, CX + 0.5, mid - 1, d.rx * 0.55, steps);
      if (stage === 2) {
        if (k < 0.8) fxRing(fx, { t: k / 0.8, x: CX, y: mid, r0: d.rx * 0.6, r1: 14, thick: 3, colours: steps });
        if (k < 0.9) fxParticles(fx, { t: k / 0.9, x: CX, y: mid, count: 9, seed: 2, loop: false, stagger: 0.2, arc: Math.PI * 2, dist: 14, gravity: 6, size: 2, colours: steps });
      }
      fx.onto(g);
      if (stage === 2 && k < 0.9) shardsOn(g, { t: k, x: CX, y: mid, count: 4, seed: 13, dist: 13, gravity: GROUND - mid, size: 3, colour: a.body, box: [1, 1, W - 1, GROUND + 1] });
      return placed(g);
    }
    if (stage < 0) return [];
    if (stage === 0) {
      const B = barrel({ lamp: tableAt(a.lamp, ctx), squash: tableAt(a.squash, ctx), leak: tableAt(a.leak, ctx), grow: tableAt(a.grow, ctx) });
      const g = new Pixels(0, 0, W, H);
      g.blit(B.g, tableAt(a.shift, ctx), 0);
      if (tableAt(a.tint, ctx) >= 1) { const hot = toneRule(a.inner, 1.6); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g.has(x, y)) g.set(x, y, hot); }
      return placed(g);
    }
    const B0 = barrel({ grow: 1 }), mid = B0.mid, g = new Pixels(0, 0, W, H);
    if (stage === 1) {
      const room = 12 - d.rx, apart = Math.min(Math.max(room - 2, 0), 2);
      for (const side of [-1, 1]) {
        const half = side < 0 ? cropped(B0.g, 0, 0, CX + 1, H) : cropped(B0.g, CX + 1, 0, W, H);
        g.blit(tilted(half, CX + side * d.rx, GROUND + 1, side * Math.min(0.06, (room - apart) / (d.h + 2 * d.ry + 4))), side * apart, 0);
      }
      return placed(g);
    }
    const base = GROUND - d.ry, fx = new Coded(W, H);
    fxScorch(fx, { x: CX + 0.5, y: base, rx: Math.min(d.rx + 3, 13), ry: d.ry + 2, t: k / 0.45, colour: fx.code(toneRule(a.tape, -0.9)), colours: C.map((c) => fx.code(c)), heat: 1 - k, flicker: Number.isInteger(ctx?.frame) ? ctx.frame : 0 });
    fx.onto(g);
    const bits = new Pixels(0, 0, W, H), box = [2, 2, W - 2, GROUND + 1];
    chunksOn(bits, { t: k, x: CX, y: mid, count: 2, seed: 5, dist: 9, rise: 12, size: d.rx * 1.1, thick: 3, spread: 3, spin: 0.7, floor: GROUND, land: 0.8, shrink: 0.4, colour: a.body, box });
    if (k < 0.75) chunksOn(bits, { t: k / 0.75, x: CX, y: mid - 4, count: 3, seed: 9, dist: 11, rise: 14, size: d.rx * 0.8, thick: 2, spread: 4, spin: 1, floor: base - 2, land: 0.95, shrink: 0.6, rest: false, colour: a.body, box });
    g.blit(inkRound(bits));
    return placed(g);
  },
});
