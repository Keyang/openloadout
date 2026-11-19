// Shape generators (docs/data-sprites.md 3.3, family "shape"): things a prop, pickup or icon is made of, each a port
// of the code that drew it, returning primitives. Started by build item B8 with what the first slice draws:
//   token@1      a coin, chip or medal turned about its upright axis (sprites/coin.js drawCoin)
//   container@1  a crate, a barrel or a clay pot, leaned, swollen or split (sprites/crate.js drawBox, drawBarrel,
//                drawPot and its hurt and break clips)
//   leaf@1       a pointed leaf as a polygon (engine/creature.js leafIn), for icon bodies and plants
//   taper@1      a stroke between two points, round at both ends, tapering (engine/surface.js capsule)
//   star@1       a star of sharp straight points as a polygon (engine/shapes.js starPoints)
//   gem.cut@1    a cut gem lit from the top right, faceted or polished (engine/pickups.js drawGem)
// token@1 and container@1 decide each pixel's paint with the code's own shape tests at pixel centres and return stamps
// (engine/gen/pixels.js), so they paint what the code painted, pixel for pixel; leaf@1 returns a shape.
// The rest of the family (ngon, bottle, crown.lobes ...) lands one defineGenerator each, test first.
import { defineGenerator } from './registry.js';
import { point, px, count, angle, share, word, flag, paint } from './args.js';
import { Pixels, rampOf, mixOf, tilted, cropped, tilesFor, workCost, polyTest } from './pixels.js';
import { ellipseIn, rectIn } from '../surface.js';
import { markIn } from '../marks.js';
import { starPoints, gemIn, gemFacets, insetIn, GEM_CUTS } from '../shapes.js';

const RAD = Math.PI / 180;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ---- token@1: sprites/coin.js drawCoin ------------------------------------------------------------------------------

// Outlines in unit space: (u, v) with the rim at about 1.
const OUTLINES = {
  round: (u, v) => u * u + v * v <= 1,
  octagon: (u, v) => { u = Math.abs(u); v = Math.abs(v); return Math.max(u, v, (u + v) * 0.72) <= 0.98; },
  square: (u, v) => Math.abs(u) ** 5 + Math.abs(v) ** 5 <= 0.62,
};
// Emblems in units of the sunken middle: (0, 0) its centre, 1 its edge.
const STAR = Array.from({ length: 10 }, (_, i) => {
  const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 0.45 : 1;
  return [Math.cos(a) * r, Math.sin(a) * r + 0.05];
});
const inPoly = (pts, x, y) => {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};
const HOLE = 0.36;
const EMBLEMS = {
  star: (u, v) => inPoly(STAR, u, v),
  heart: (u, v) => {
    u = Math.abs(u) / 0.72; v = (v - 0.02) / 0.72;
    if (u < 0.25 && v < -0.5) return false;
    return (u - 0.5) ** 2 + (v + 0.35) ** 2 <= 0.27 || (v >= -0.35 && v <= 0.95 && u <= 1 - (v + 0.35) / 1.3);
  },
  gem: (u, v) => Math.abs(u) / 0.62 + Math.abs(v) / 0.88 <= 1,
};

/** The shapes a token's face can have, in the order a choice lists them. */
export const TOKEN_SHAPES = Object.freeze(Object.keys(OUTLINES));
/** What a token's face can carry: nothing, a star, a heart or a gem in its sunken middle, or a hole through it. */
export const TOKEN_EMBLEMS = Object.freeze(['plain', 'star', 'heart', 'gem', 'hole']);

const tokenReach = (a) => (a.size / 2 + 0.1) * a.scale * 1.5 + a.thick + 4;

/**
 * token@1: a flat token (a coin, a chip, a medal) seen turned `spin` degrees about its upright axis: the edge band on
 * the side turning away, the face, a raised rim round a sunken field, a slanted glint band at `sheen` (-1.6 off one
 * side, 0 across the middle, 1.6 off the other) and an emblem (star, heart, gem) or a hole. Port of sprites/coin.js
 * drawCoin, pixel for pixel, as stamps. Odd sizes centre on the pixel at `at`, even ones on the corner nearest it.
 * `scale` shrinks it (nothing is drawn below 2.4 px across), `squash` widens it (+) or makes it taller (-), `bare`
 * leaves the emblem off. Paints: metal (its ramp: face, edge, rim), field (the sunken middle), gleam (the glint band),
 * inlay (the emblem), shine (the gem's white spot).
 */
export const token = defineGenerator({
  id: 'token', v: 1, family: 'shape',
  about: 'A flat coin, chip or medal turned about its upright axis, with its edge, a raised rim, a sliding glint and an emblem.',
  args: {
    at: point({ about: 'The middle of the face' }),
    size: count(4, 31, { about: 'Pixels across, face-on' }),
    thick: count(1, 8, { default: 2, about: 'How thick it is, in pixels' }),
    shape: word(TOKEN_SHAPES, { default: 'round', about: 'The outline of its face' }),
    emblem: word(TOKEN_EMBLEMS, { default: 'plain', about: 'What its face carries' }),
    rim: flag({ default: true, about: 'A raised rim round a sunken field' }),
    spin: angle({ default: 0, about: 'How far it is turned: 0 face-on, 90 edge-on, 180 the back' }),
    sheen: px(-2, 2, { default: 0, about: 'Where the glint band is: -1.6 off one side, 0 across the middle, 1.6 off the other' }),
    squash: px(-0.5, 0.5, { default: 0, about: 'Wider (above 0) or taller (below 0)' }),
    scale: px(0, 2, { default: 1, about: 'Its size as a share of `size`' }),
    bare: flag({ default: false, about: 'Leave the emblem off (small, moving fast)' }),
    metal: paint({ about: 'The metal: face, edge and rim from its ramp' }),
    field: paint({ about: 'The sunken middle inside the rim' }),
    gleam: paint({ about: 'The glint band across the face' }),
    inlay: paint({ default: 'ink', about: 'The emblem' }),
    shine: paint({ about: 'The white spot on a gem' }),
  },
  keyable: ['spin', 'sheen', 'squash', 'scale', 'bare'],
  cost: (a) => tilesFor(2 * tokenReach(a), 2 * tokenReach(a)),
  run(a) {
    const n = a.size;
    const cx = n % 2 ? Math.floor(a.at[0]) + 0.5 : Math.round(a.at[0]);
    const cy = n % 2 ? Math.floor(a.at[1]) + 0.5 : Math.round(a.at[1]);
    const r = (n / 2 + 0.1) * a.scale;
    if (r <= 2.4) return [];
    const R = r * (1 + a.squash), Ry = r * (1 - a.squash), T = Math.max(1, Math.round(a.thick * a.scale));
    const reach = Math.ceil(tokenReach(a));
    const g = new Pixels(Math.floor(cx) - reach, Math.floor(cy) - reach, 2 * reach, 2 * reach);
    const m = rampOf(a.metal), sh = OUTLINES[a.shape];
    const ang = (a.spin * Math.PI) / 180;
    const c = Math.cos(ang), sn = Math.sin(ang);
    const Rx = Math.max(R * Math.abs(c), 0.01);
    const front = cx + (T / 2) * sn, back = cx - (T / 2) * sn;
    const fx = c >= 0 ? front : back, hx = c >= 0 ? back : front;
    const lo = Math.min(front, back), hi = Math.max(front, back);
    const hole = a.emblem === 'hole';
    const holeIn = (x0, x, y) => ((x - x0) / (Rx * HOLE)) ** 2 + ((y - cy) / (Ry * HOLE)) ** 2 <= 1;
    const body = (x, y) => sh((x - clamp(x, lo, hi)) / Rx, (y - cy) / Ry) && !(hole && holeIn(fx, x, y) && holeIn(hx, x, y));
    const face = (x, y) => sh((x - fx) / Rx, (y - cy) / Ry) && !(hole && holeIn(fx, x, y));
    const x0 = lo - Rx - 2, x1 = hi + Rx + 2, y0 = cy - Ry - 2, y1 = cy + Ry + 2;
    g.fill(x0, y0, x1, y1, body, { base: m.dark, dark: m.deep, light: m.base }, { shade: 1, light: 1 });
    g.fill(x0, y0, x1, y1, face, m, { shade: 1, light: 1 });
    const k = (R - (a.rim ? 2 : 1)) / R;
    const inner = (x, y) => face(x, y) && sh((x - fx) / (Rx * k), (y - cy) / (Ry * k));
    const sunk = a.rim && Rx > 2.5;
    if (sunk) {
      g.shadow = [1, -1];
      g.fill(x0, y0, x1, y1, inner, { base: a.field, dark: m.dark, light: m.light }, { shade: 1 });
      g.shadow = [-1, 1];
    }
    const band = (x, y) => Math.abs((x - fx) / R + (0.5 * (y - cy)) / R - a.sheen) < 0.15;
    g.fill(x0, y0, x1, y1, (x, y) => face(x, y) && band(x, y), a.gleam);
    if (sunk) g.fill(x0, y0, x1, y1, (x, y) => inner(x, y) && band(x, y), m.light);
    const E = EMBLEMS[a.emblem];
    if (E && Rx > 2 && !a.bare) {
      const gem = a.emblem === 'gem';
      const em = (x, y) => E((x - fx) / (Rx * k), (y - cy) / (Ry * k));
      g.fill(x0, y0, x1, y1, em, rampOf(a.inlay), { shade: gem ? 1 : 0, light: gem ? 1 : 0, clip: inner });
      if (gem && Rx > 3.5) g.dot(fx + Rx * 0.1, cy - Ry * 0.3, a.shine);
    }
    return g.stamps();
  },
});

// ---- container@1: sprites/crate.js ---------------------------------------------------------------------------------

/** The containers container@1 draws: a framed crate of planks, a bulging barrel of staves, a clay pot. */
export const CONTAINER_STYLES = Object.freeze(['crate', 'barrel', 'pot']);
/** The stamps a container may carry (engine/marks.js marks): none, leaf, skull, star. */
export const CONTAINER_MARKS = Object.freeze(['none', 'leaf', 'skull', 'star']);

function drawBox(g, a, d, grow) {
  const wood = rampOf(a.wood), metal = rampOf(a.metal);
  const x = d.x0 - grow, y = d.y0 - 2 * grow, S = d.S + 2 * grow, b = S >= 19 ? 3 : 2;
  g.rect(x, y, S, S, wood, { shade: 2, light: 1 });
  g.rect(x + b, y + b, S - 2 * b, S - 2 * b, { base: wood.dark, dark: wood.deep, light: wood.dark }, { shade: 1 });
  const ih = S - 2 * b;
  for (const k of [1, 2]) g.rect(x + b, y + b + Math.round((ih * k) / 3), S - 2 * b, 1, wood.deep);
  for (const [jx, jy] of [[x + b - 1, y + b - 1], [x + S - b, y + b - 1], [x + b - 1, y + S - b], [x + S - b, y + S - b]]) g.dot(jx, jy, wood.dark);
  if (a.mark === 'none') g.limb(x + b + 1, y + S - b - 1, x + S - b - 1, y + b + 1, 2, wood, { clip: rectIn(x + b, y + b, S - 2 * b, S - 2 * b) });
  if (a.bands) {
    for (const sy of [y, y + S - b]) {
      g.rect(x, sy, S, b, metal, { light: 1 });
      for (let rx = x + 2; rx < x + S - 1; rx += 4) g.dot(rx, sy + (b >> 1), metal.dark);
    }
  }
  return { mx: x + (S >> 1), my: y + (S >> 1) };
}

function drawBarrel(g, a, d, grow) {
  const wood = rampOf(a.wood), metal = rampOf(a.metal), CX = d.cx;
  const H = d.S + 2 * grow, top = d.ground + 1 - H, half = d.S * 0.42 + grow, cy = top + H / 2;
  const widthAt = (py) => half * (0.8 + 0.2 * Math.cos((Math.PI * (py - cy)) / H));
  const body = (px, py) => py >= top && py < top + H && Math.abs(px - CX) <= widthAt(py);
  g.fill(CX - half - 1, top, CX + half + 1, top + H, body, wood, { shade: 2, light: 1 });
  for (let y = top + 1; y < top + H - 1; y++) for (const k of [-0.45, 0.2]) g.dot(Math.floor(CX + widthAt(y + 0.5) * k), y, wood.dark);
  g.rect(CX - half + 2, top, 2 * half - 4, 1, wood.light, { clip: body });
  for (const k of [0.22, 0.78]) {
    const hy = Math.round(top + H * k) - 1;
    if (a.bands) g.fill(CX - half - 1, hy, CX + half + 1, hy + 2, (px, py) => py >= hy && py < hy + 2 && body(px, py), metal, { light: 1, shade: 1 });
    else g.fill(CX - half - 1, hy, CX + half + 1, hy + 1, (px, py) => py >= hy && py < hy + 1 && body(px, py), wood.dark);
  }
  return { mx: CX, my: Math.round(cy) };
}

function drawPot(g, a, d, grow) {
  const clay = rampOf(a.wood), metal = rampOf(a.metal), CX = d.cx, G = d.ground;
  const H = d.S + 2 * grow, top = G + 1 - H, rx = d.S * 0.46 + grow, ry = H * 0.36;
  const by = G + 1 - ry - 1;
  const neck = Math.round(d.S * 0.24), lip = Math.round(d.S * 0.33), foot = Math.round(d.S * 0.26);
  const body = [ellipseIn(CX, by, rx, ry), rectIn(CX - neck, top + 2, 2 * neck, by - top), rectIn(CX - lip, top, 2 * lip, 2), rectIn(CX - foot, G - 1, 2 * foot, 2)];
  g.blob(body, clay, { shade: 2, light: 1 });
  g.rect(CX - lip + 1, top, 2 * lip - 2, 1, clay.light);
  g.rect(CX - neck + 1, top + 2, 2 * neck - 2, 1, clay.dark);
  const inBody = (px, py) => body.some((f) => f(px, py));
  const ring = (y, h, p, opt) => g.fill(CX - rx - 1, y, CX + rx + 1, y + h, (px, py) => py >= y && py < y + h && inBody(px, py), p, opt);
  const shoulder = Math.round(by - ry * 0.62);
  if (a.bands) { ring(top + 3, 2, metal, { light: 1 }); ring(Math.round(by + ry * 0.55), 2, metal, { light: 1, shade: 1 }); }
  else { ring(shoulder, 1, clay.dark); ring(Math.round(by + ry * 0.6), 1, clay.dark); }
  return { mx: CX, my: Math.round(by) - (a.bands ? 1 : 0) };
}

const DRAW = { crate: drawBox, barrel: drawBarrel, pot: drawPot };

/**
 * container@1: a breakable container standing on the ground: a framed crate of planks with a corner brace, a barrel of
 * bulging staves, or a clay pot; metal bands (straps with rivets, hoops, rings) or plain; a stamp (engine/marks.js:
 * leaf, skull, star) in the middle. `lean` (degrees, + to the right) rocks it on the foot corner it leans over, sliding
 * whole rows and columns so nothing goes soft; `grow` swells it (the flash before it breaks); `split` draws it split
 * down the middle, each half falling away on its outer foot. Port of sprites/crate.js, pixel for pixel, as stamps.
 * `at` is the middle of its foot: x its centre, y the row under its lowest body row. Paints: wood (its ramp: wood or
 * clay), metal (bands), markPaint (the stamp: a colour that stands out against what it sits on).
 */
export const container = defineGenerator({
  id: 'container', v: 1, family: 'shape',
  about: 'A crate, barrel or clay pot standing on the ground, with metal bands and a stamp, that can lean, swell or split.',
  args: {
    at: point({ default: [16, 30], about: 'The middle of its foot: the row under its lowest body row' }),
    style: word(CONTAINER_STYLES, { about: 'Crate, barrel or pot' }),
    size: count(15, 23, { about: 'How tall it is (and how wide a crate is), in pixels' }),
    bands: flag({ default: true, about: 'Metal bands: straps with rivets, hoops or rings' }),
    mark: word(CONTAINER_MARKS, { default: 'none', about: 'The stamp in its middle' }),
    wood: paint({ about: 'Wood, staves or clay' }),
    metal: paint({ about: 'The metal bands' }),
    markPaint: paint({ default: 'ink', about: 'The stamp' }),
    grow: count(0, 2, { default: 0, about: 'Pixels it swells by on each side' }),
    lean: angle({ default: 0, about: 'Degrees it rocks to the right (above 0) or left, on the foot corner it leans over' }),
    split: flag({ default: false, about: 'Split down the middle, the halves falling apart' }),
  },
  keyable: ['lean'],
  cost: () => tilesFor(64, 48),
  run(a) {
    const CX = Math.round(a.at[0]), ground = Math.round(a.at[1]) - 1, S = a.size;
    const x0 = CX - Math.ceil(S / 2);
    const d = { S, x0, x1: x0 + S, y0: ground + 1 - S, cx: CX, ground, mark: S >= 21 ? 9 : S >= 17 ? 7 : 5 };
    const box = () => new Pixels(CX - 32, ground - 45, 64, 48);
    const whole = () => {
      const g = box();
      const at = DRAW[a.style](g, a, d, a.grow);
      if (a.mark !== 'none') {
        const nn = Math.max(1, Math.floor((Math.round(d.mark) - 1) / 2)), x = Math.floor(at.mx), y = Math.floor(at.my);
        g.fill(x - nn, y - nn, x + nn + 1, y + nn + 1, markIn(a.mark, x, y, d.mark, {}), a.markPaint, { shade: 0 });
      }
      return g;
    };
    const lean = a.lean * RAD;
    if (a.split) {
      const all = whole(), out = box();
      for (const side of [-1, 1]) {
        const half = side < 0 ? cropped(all, all.x0, all.y0, CX, all.y0 + all.h) : cropped(all, CX, all.y0, all.x0 + all.w, all.y0 + all.h);
        out.blit(tilted(half, side < 0 ? d.x0 : d.x1 - 1, ground + 1, side * Math.min(0.17, (d.x0 - 2.5) / S)));
      }
      return out.stamps();
    }
    const g = whole();
    return (lean ? tilted(g, lean > 0 ? d.x1 - 1 : d.x0, ground + 1, lean) : g).stamps();
  },
});

// ---- leaf@1: engine/creature.js leafIn -----------------------------------------------------------------------------

const LEAF_STEPS = 24;
/** The most points leaf@1's polygon has (both sides, the tip and the belly point): what a shape test of it costs. */
export const LEAF_POINTS = 2 * (LEAF_STEPS + 1) + 1;

/**
 * leaf@1: a pointed leaf from `from` (its stalk end) to `to` (its tip), `width` pixels across at its widest: it swells
 * from a blunt base (`blunt`, a share of the full width) to its widest at `belly` (a share of its length) and narrows to
 * the tip. One polygon of 2 x 24 + 1 points tracing engine/creature.js leafIn; draw it as any shape (paint, shade, z,
 * group), or put it in an icon body (icon.paint@1).
 */
export const leaf = defineGenerator({
  id: 'leaf', v: 1, family: 'shape',
  about: 'A pointed leaf from its stalk end to its tip, swelling from a blunt base to its widest and narrowing to the tip.',
  args: {
    from: point({ about: 'The stalk end' }),
    to: point({ about: 'The tip' }),
    width: px(0.5, 32, { about: 'Pixels across at its widest' }),
    belly: share({ default: 0.4, about: 'Where it is widest, as a share of its length' }),
    blunt: share({ default: 0.3, about: 'How wide its base is, as a share of its widest' }),
    paint: paint({ about: 'Its colour' }),
  },
  cost: () => 1,
  run(a) {
    const [x0, y0] = a.from, [x1, y1] = a.to;
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1e-6, ux = dx / len, uy = dy / len;
    const b = clamp(a.belly, 0.05, 0.95);
    const k = (s) => (s < b ? a.blunt + (1 - a.blunt) * Math.sin((Math.PI / 2) * (s / b)) : 1 - ((s - b) / (1 - b)) ** 1.6);
    const ss = [...new Set([...Array.from({ length: LEAF_STEPS }, (_, i) => i / LEAF_STEPS), b])].sort((p, q) => p - q);
    const at = (s, side) => {
      const w = (a.width / 2) * k(s) * side;
      return [x0 + ux * s * len + uy * w, y0 + uy * s * len - ux * w];
    };
    const left = ss.map((s) => at(s, 1)), right = ss.map((s) => at(s, -1)).reverse();
    const points = [...left, [x1, y1], ...right].map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]);
    return [{ kind: 'poly', points, paint: a.paint }];
  },
});

// ---- taper@1: engine/surface.js capsule ----------------------------------------------------------------------------

/**
 * taper@1: a stroke between two points, round at both ends, `r0` pixels in radius at `from` tapering to `r1` at `to`
 * (r1 left out: as r0): a stalk, a leaf blade, a sprig, a bone. One capsule shape in frame coordinates (a written
 * capsule is a bone's, from and to along it); draw it as any shape, or put it in an icon body (icon.paint@1).
 * engine/surface.js capsule, which engine/draw-list.js paints.
 */
export const taper = defineGenerator({
  id: 'taper', v: 1, family: 'shape',
  about: 'A stroke between two points, round at both ends, tapering from one width to another: a stalk, a blade, a sprig.',
  args: {
    from: point({ about: 'Where it starts' }),
    to: point({ about: 'Where it ends' }),
    r0: px(0, 32, { about: 'Its radius at the start' }),
    r1: px(-1, 32, { default: -1, about: 'Its radius at the end (below 0: as at the start)' }),
    paint: paint({ about: 'Its colour' }),
  },
  cost: () => 1,
  run: (a) => [{ kind: 'capsule', from: [...a.from], to: [...a.to], r: [a.r0, a.r1 < 0 ? a.r0 : a.r1], paint: a.paint }],
});

// ---- star@1: engine/shapes.js starPoints ---------------------------------------------------------------------------

/**
 * star@1: a star with sharp straight points, the first pointing up (turned `angle` degrees clockwise), `r` pixels to
 * its tips; `inner` is how far in its inside corners are, as a share of r (below 0: the usual for its number of points,
 * engine/shapes.js STAR_INNER). One polygon of twice its points, engine/shapes.js starPoints; draw it as any shape.
 */
export const star = defineGenerator({
  id: 'star', v: 1, family: 'shape',
  about: 'A star with sharp straight points, the first pointing up, as one polygon.',
  args: {
    at: point({ about: 'Its centre' }),
    r: px(0.5, 64, { about: 'Pixels from its centre to its tips' }),
    points: count(3, 12, { default: 5, about: 'How many points' }),
    inner: px(-1, 1, { default: -1, about: 'Its inside corners as a share of r (below 0: the usual for its points)' }),
    angle: angle({ default: 0, about: 'Degrees it is turned clockwise' }),
    paint: paint({ about: 'Its colour' }),
  },
  cost: () => 1,
  run: (a) => [{ kind: 'poly', points: starPoints(a.at[0], a.at[1], a.r, a.points, { ...(a.inner >= 0 ? { inner: a.inner } : {}), angle: a.angle * RAD }), paint: a.paint }],
});

// ---- gem.cut@1: engine/pickups.js drawGem --------------------------------------------------------------------------

/** The cuts gem.cut@1 draws: engine/shapes.js GEM_CUTS (diamond, emerald, round, shard, heart). */
export const GEM_CUT_NAMES = GEM_CUTS;

/**
 * gem.cut@1: a cut gem filling the box at ± r ([rx, ry], pixels), lit from the top right: its stone shaded with the
 * ramp of `paint` (two pixels of dark when it is 6 or more across), then flat facets in four tones (the hard highlight
 * a mix of its light tone and `shine`), or with `facets` off a polished stone with one bright window and a `shine`
 * spot. Port of engine/pickups.js drawGem, pixel for pixel, as stamps; draw the outline after it.
 */
export const gemCut = defineGenerator({
  id: 'gem.cut', v: 1, family: 'shape',
  about: 'A cut gem lit from the top right: shaded facets of a diamond, emerald, round, shard or heart cut, or a polished stone.',
  args: {
    at: point({ about: 'Its centre' }),
    r: point({ lo: 1, hi: 32, about: 'Half its width and half its height, in pixels' }),
    cut: word(GEM_CUTS, { default: 'diamond', about: 'Its cut' }),
    facets: flag({ default: true, about: 'Flat facets in four tones (off: a polished stone)' }),
    paint: paint({ about: 'The stone (its ramp gives the facets\' tones)' }),
    shine: paint({ about: 'The white of its hardest highlight: a light slot such as "shine"' }),
  },
  // its stamps, and the shape tests over its box: the outline (shade and light), up to ten facets, the clip
  cost: (a) => {
    const w = 2 * a.r[0] + 5, h = 2 * a.r[1] + 5;
    return Math.max(tilesFor(w, h), workCost(w * h * 160));
  },
  run(a, ctx) {
    const [cx, cy] = a.at, [rx, ry] = a.r, [W, H] = ctx.size;
    const x0 = Math.max(0, Math.floor(cx - rx - 2)), y0 = Math.max(0, Math.floor(cy - ry - 2));
    const g = new Pixels(x0, y0, Math.min(W, Math.ceil(cx + rx + 3)) - x0, Math.min(H, Math.ceil(cy + ry + 3)) - y0);
    if (!g.w || !g.h) return [];
    const R = rampOf(a.paint), stone = gemIn(cx, cy, rx, ry, a.cut);
    const box = [cx - rx - 1, cy - ry - 1, cx + rx + 1, cy + ry + 1];
    g.fill(...box, stone, R, { shade: Math.min(rx, ry) >= 6 ? 2 : 1, light: 1 });
    if (!a.facets) {
      const wx = cx + 0.24 * rx, wy = cy - 0.3 * ry, keep = insetIn(stone, 1);
      g.fill(...box, gemIn(wx, wy, rx * 0.48, ry * 0.48, a.cut), R.light, { clip: keep });
      g.fill(...box, gemIn(wx + 0.14 * rx, wy - 0.12 * ry, Math.max(1, rx * 0.2), Math.max(1, ry * 0.2), 'round'), a.shine, { clip: keep });
    } else {
      const tones = { 2: mixOf(R.light, a.shine, 0.55), 1: R.light, 0: R.base, [-1]: R.dark };
      for (const f of gemFacets(cx, cy, rx, ry, a.cut)) g.fill(...box, polyTest(f.pts), tones[f.tone] ?? R.base, { clip: stone });
    }
    return g.stamps();
  },
});
