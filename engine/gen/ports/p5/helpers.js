// PORT (migration batch P5): the engine helpers the eight interactive props of batch P5 drew with that work out
// colours, copied with their colour maths turned into the colour rules of the same functions, so they paint PAINT REFS
// on engine/gen/port-surface.js grids (engine/gen/props-p5.js). The helpers that only test shapes or paint the colours
// they are given are imported from engine/ itself (engine/bulkhead.js doorLeaves, screenIn, laserBeam, drawCasing,
// hazardBand; engine/mech.js toothedIn; engine/crystals.js crystalFaces; engine/pickups.js glint) or from migration
// batch E2's ports (engine/gen/ports/e2/: fx.js, plating.js, orbits.js, fx-floor.js, solids.js geometry, surface.js).
// These copies are the drawing code of the P5 port generators, so they are NOT temporary: they stay when the engine
// originals go and go only with the last generator version that draws with them. A HAND CHANGE note says where a copy
// differs from its source; never change what a released generator version draws through it.
// Pure: no randomness, no clock, no DOM; runs the same in the browser and in Node.
import { ramp, mix } from '../colour.js';
import { rampP, mixP, fixed } from '../../port-surface.js';
import { colourOf } from '../../pixels.js';
import { solid } from '../e2/solids.js';
import { crystalFaces } from '../../../crystals.js';
import { polyIn, ellipseIn } from '../../../surface.js';

const TAU = Math.PI * 2;
/** A paint ref as a colour rule can name it (a written-out colour as its identity rule). */
const ruleRef = (ref) => colourOf(fixed(ref));

// ---- engine/bulkhead.js: the tones of a metal machine ---------------------------------------------------------------

/**
 * engine/bulkhead.js shadeTo(of, max(floor, min(brightness(of), brightness(under) - drop))) as the `shadeTo` colour rule
 * (engine/data-rules.js): a colour taken along its own ramp to a brightness worked out from colours. HAND CHANGE: the
 * code worked the target out from the colours' numbers; a paint ref has none, so the rule carries the sum.
 * Arguments: of (a paint ref), { under (a paint ref, default of), drop, floor }.
 */
export function shadeToP(of, { under, drop, floor }) {
  return { rule: 'shadeTo', of: ruleRef(of), ...(under === undefined ? {} : { under: ruleRef(under) }), drop, floor };
}

/**
 * engine/bulkhead.js machineTones with paint refs: { base, lit, soft, seam, dark, darkLit }, each the colour rule of
 * the function the code called (textureLight, textureTone, shadeTo). Arguments: colour (a paint ref), { drop, floor }.
 */
export function machineTonesP(colour, { drop = 0.2, floor = 0.17 } = {}) {
  const c = ruleRef(colour), dark = shadeToP(colour, { drop, floor });
  return { base: colour, lit: { rule: 'textureLight', of: c }, soft: { rule: 'textureLight', of: c, against: c, from: 0.4 }, seam: { rule: 'textureTone', of: c },
    dark, darkLit: { rule: 'textureLight', of: dark, against: dark, from: 0.4 } };
}

// ---- engine/solids.js: solids lit from above ----------------------------------------------------------------------

/**
 * engine/solids.js faceRamps with paint refs: { wall, top } ramps. HAND CHANGE: the code read the colour's brightness
 * to see whether its top could go a step lighter; that test is the `faceTone` colour rule (migration batch M3), so each
 * tone is that rule (a topColour given is used as it is, as the code did). Arguments: colour, topColour.
 */
export function faceRampsP(colour, topColour) {
  if (topColour !== undefined) return { wall: rampP(colour), top: { light: { rule: 'tone', of: ruleRef(topColour), by: 0.8 }, base: topColour, dark: { rule: 'tone', of: ruleRef(topColour), by: -0.5 } } };
  const c = ruleRef(colour), f = (face, tone) => ({ rule: 'faceTone', of: c, face, tone });
  return { wall: { base: f('wall', 'base'), light: f('wall', 'light'), dark: f('wall', 'dark'), deep: f('wall', 'deep') }, top: { light: f('top', 'light'), base: f('top', 'base'), dark: f('top', 'dark') } };
}

/** engine/solids.js extrude on a paint-ref grid (migration batch E2's port, word for word), its ramps from faceRampsP. Arguments: g, top, h, colour, { topColour, lip, shade, turn, box }. */
export function extrudeP(g, top, h, colour, { topColour, lip = 0, shade = 1, turn = 0.22, box } = {}) {
  const S = solid(top, h, box ?? [0, 0, g.w, g.h]);
  const R = faceRampsP(colour, topColour);
  S.ramps = R;
  if (!S.box) return S;
  const [x0, y0, x1, y1] = S.box;
  const packed = { light: g.table.id(R.wall.light), base: g.table.id(R.wall.base), dark: g.table.id(R.wall.dark) };
  const opt = { shade, turn, shadow: g.shadow };
  for (let y = Math.max(0, y0); y < Math.min(g.h, y1); y++) for (let x = Math.max(0, x0); x < Math.min(g.w, x1); x++) {
    const px = x + 0.5, py = y + 0.5;
    if (top(px, py) || !S.wall(px, py)) continue;
    g.data[y * g.w + x] = packed[S.shadeOf(px, py, opt)];
  }
  g.fill(x0, y0, x1, y1, top, { base: R.top.base, light: R.top.light, dark: R.top.base }, { shade: 0, light: lip > 0 ? 0 : 1 });
  if (lip > 0) {
    const ring = (px, py) => top(px, py) && !(top(px - lip, py) && top(px + lip, py) && top(px, py - lip) && top(px, py + lip));
    g.fill(x0, y0, x1, y1, ring, R.top.light);
  }
  return S;
}

/**
 * engine/solids.js wallFill on a paint-ref grid. HAND CHANGE: the code took any object for a ramp; a colour rule is an
 * object too, so only an object with a base and no `rule` is a ramp here. Arguments: g, S, inside, colour, { shade, turn, flat }.
 */
export function wallFillP(g, S, inside, colour, { shade = 1, turn = 0.22, flat = false } = {}) {
  if (!S.box) return g;
  const R = colour && typeof colour === 'object' && !Object.hasOwn(colour, 'rule') ? colour : ramp(colour);
  const packed = { light: g.table.id(R.light), base: g.table.id(R.base), dark: g.table.id(R.dark) };
  const opt = { shade, turn, shadow: g.shadow };
  const [x0, y0, x1, y1] = S.box;
  for (let y = Math.max(0, y0); y < Math.min(g.h, y1); y++) for (let x = Math.max(0, x0); x < Math.min(g.w, x1); x++) {
    const px = x + 0.5, py = y + 0.5;
    if (!S.wall(px, py) || !inside(px, py)) continue;
    g.data[y * g.w + x] = flat ? packed.base : packed[S.shadeOf(px, py, opt)];
  }
  return g;
}

// ---- engine/mech.js: a chain ----------------------------------------------------------------------------------------

/** engine/mech.js chain with paint refs (its ramp the paint ref's tones), word for word. Arguments: g, x0, y0, x1, y1, { colour, link, bow }. */
export function chainP(g, x0, y0, x1, y1, { colour = '#c2c9d6', link = 4, bow = 0 } = {}) {
  const R = ramp(colour);
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.round(len));
  const nx = len ? -dy / len : 1, ny = len ? dx / len : 0;   // across the chain
  const period = Math.max(3, Math.round(link)) + 1;
  const lit = nx - ny > 0 ? 1 : -1;                          // the side of a flat link that faces the light (top right)
  for (let s = 0; s <= steps; s++) {
    const k = s / steps, out = bow * Math.sin(Math.PI * k);
    const cx = x0 + dx * k + nx * out, cy = y0 + dy * k + ny * out;
    const j = s % period;
    const end = s === 0 || s === steps;
    if (!end && j > 0 && j < period - 2) {                   // the two sides of a flat link
      g.dot(Math.round(cx + nx * lit), Math.round(cy + ny * lit), R.light);
      g.dot(Math.round(cx - nx * lit), Math.round(cy - ny * lit), R.base);
    } else g.dot(Math.round(cx), Math.round(cy), !end && j === period - 1 ? R.dark : R.base);   // a link's end, or the link seen edge on
  }
  return g;
}

// ---- engine/crystals.js: a standing crystal and the glow round it --------------------------------------------------

/** engine/crystals.js drawCrystal with paint refs (its ramp and its hard highlight the colour rules of ramp and mix), word for word. Arguments: g, cx, cy, rx, ry, colour, { cut, turn }. */
export function drawCrystalP(g, cx, cy, rx, ry, colour, { cut = 'shard', turn = 0 } = {}) {
  const R = rampP(colour), { outline, faces } = crystalFaces(cx, cy, rx, ry, cut, turn);
  const box = [cx - rx - 2, cy - ry - 2, cx + rx + 2, cy + ry + 2];
  const tones = { 2: mixP(R.light, '#ffffff', 0.55), 1: R.light, 0: R.base, [-1]: R.dark };
  if (cut === 'orb') {
    // a polished ball: a dark side, a window of light that drifts a little as it turns, a white spot in it
    g.fill(...box, outline, R, { shade: Math.min(rx, ry) >= 6 ? 2 : 1 });
    const a = TAU * turn, wx = cx + rx * (0.28 + 0.1 * Math.cos(a)), wy = cy - ry * (0.3 + 0.08 * Math.sin(a));
    const keep = (px, py) => outline(px, py) && outline(px + 1, py) && outline(px, py - 1);
    g.fill(...box, ellipseIn(wx, wy, rx * 0.42, ry * 0.42), R.light, { clip: keep });
    g.fill(...box, ellipseIn(wx + rx * 0.12, wy - ry * 0.1, Math.max(1, rx * 0.18), Math.max(1, ry * 0.18)), tones[2], { clip: keep });
    g.fill(...box, (px, py) => outline(px, py) && !outline(px + 1.5, py - 1.5) && px < cx && py > cy, R.dark);
    return outline;
  }
  g.fill(...box, outline, R.base);
  for (const f of faces) g.fill(...box, polyIn(f.pts), tones[f.tone] ?? R.base, { clip: outline });
  return outline;
}

/** engine/crystals.js drawAura on a paint-ref grid. HAND CHANGE: col(c) packed a colour into a pixel; here a pixel holds its paint ref's cell (g.table.id). Arguments: g, src, { reach, colours, dx, dy, box }. */
export function drawAuraP(g, src, { reach = 2, colours = ['#ffffff'], dx = 0, dy = 0, box } = {}) {
  const r = Math.max(0, Math.round(reach));
  if (!r) return g;
  const [x0, y0, x1, y1] = box ?? [1, 1, g.w - 1, g.h - 1];
  const b = src.bounds();
  if (!b) return g;
  for (let y = Math.max(y0, b.y0 + dy - r); y < Math.min(y1, b.y1 + dy + r + 1); y++) for (let x = Math.max(x0, b.x0 + dx - r); x < Math.min(x1, b.x1 + dx + r + 1); x++) {
    if (src.get(x - dx, y - dy)) continue;
    let near = Infinity;
    for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) if (src.get(x - dx + ox, y - dy + oy)) near = Math.min(near, Math.hypot(ox, oy));
    const ring = Math.round(near);
    if (ring >= 1 && ring <= r) g.data[y * g.w + x] = g.table.id(colours[Math.min(ring, colours.length) - 1]);
  }
  return g;
}

/** engine/color.js mix for paint refs (the `mix` rule), re-exported for the port generators that blend two refs. Arguments: a, b, t. */
export const mixRef = (a, b, t) => mix(a, b, t);
