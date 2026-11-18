// War machine parts in the three-quarter (top-down) view: what a walking mech, a gun turret or a heavy robot is built
// from, each drawn from a few numbers so a rig can move it from frame to frame without redrawing it. Added with batch
// S10 (sprites/warden-mech.js on rigs/mech-walker.js, the worked example).
//
//   armourBlock     an armour plate with thickness: a lit top face over a front that may have cut corners or taper
//   reactorPort     a round glowing port in a dark housing behind shutter bars: a reactor, a weak point, an engine
//   mechHead        a machine's head (MECH_HEADS: cockpit, sensor, skull plate) with its lit eyes
//   armWeapon       a weapon that hangs from an elbow and points down the picture (ARM_WEAPONS: cannon arms, claws, drills)
//   missileRack     a launcher box with rows of tubes and the noses of the missiles in them; rackTubes: where the tubes are
//   radiatorFins    cooling fins fanned out from a mount
//   risingMissile   a small missile flying straight up the picture on its flame (drawn after the outline)
//
// The camera looks from the south, tilted down (docs/style-guide.md, section 1), so a block shows its top, lit, above
// the face turned to the camera. Light comes from the top right: the left side and the foot of a front are in shade, and
// its right edge catches the light. Draw everything here before g.outline(INK) except risingMissile, which is light.
// Colours are handed in as ramps (ramp() of engine/color.js) so a sprite decides them; lights take a list of colour
// steps, hottest first (steps() of engine/fx.js: [white, core, middle, edge, rim]).
// Pure functions: Node and browser, no Math.random. Everything draws through the Surface's own calls.

import { ramp, tone } from './color.js';
import { polyIn, ellipseIn, rectIn } from './surface.js';
import { seam } from './rock.js';
import { stripesIn } from './solids.js';
import { skullIn, anyIn } from './shapes.js';
import { clamp, lerp } from './motion.js';

const R = Math.round;
const even = (v) => 2 * Math.max(1, R(v / 2));
/** A dark material painted without its darkest tone, which would sink into the outline: base, with a lit edge. */
const flatDark = (K) => ({ light: K.light, base: K.base, dark: K.base });

/**
 * Draws an armour block in three-quarter view: a lit top face above a front that is shaded on its left and foot and catches the light on its right edge; returns its shape tests { front, top, all }.
 * Arguments: g (the Surface); o { x0, x1 (the left and right edges of the front, whole px), top (the row where the top face starts), face (the row where the front starts), bottom (the row after its last), inset (px the far edge of the top face is narrower on each side, default 1), cut ([left, right]: px cut off the lower corners, default none), foot ([x0, x1]: the front tapers to these edges at its bottom) with waist (the row the taper starts on), paint (a ramp), lit (the colour of the top face, default the ramp's light tone), shade (px of shadow band, default 1), seam (a colour: darkens what it sits on along its edge, so it reads as a separate plate) }.
 */
export function armourBlock(g, o) {
  const { x0, x1, top, face, bottom, inset = 1, cut = [0, 0], foot = null, paint, shade = 1 } = o;
  const [cl, cr] = cut;
  const frontPts = foot
    ? [[x0, face], [x1, face], [x1, o.waist ?? face], [foot[1], bottom], [foot[0], bottom], [x0, o.waist ?? face]]
    : [[x0, face], [x1, face], [x1, bottom - cr], [x1 - cr, bottom], [x0 + cl, bottom], [x0, bottom - cl]];
  const front = polyIn(frontPts);
  const topIn = face > top ? polyIn([[x0 + inset, top], [x1 - inset, top], [x1, face], [x0, face]]) : () => false;
  const all = (px, py) => front(px, py) || topIn(px, py);
  const box = [Math.min(x0, foot ? foot[0] : x0) - 1, top - 1, Math.max(x1, foot ? foot[1] : x1) + 1, bottom + 1];
  if (o.seam) seam(g, all, o.seam, { box });
  g.fill(...box, all, paint, { shade, light: 1, clip: front });
  g.fill(...box, topIn, o.lit ?? paint.light, { shade: 0 });
  return { front, top: topIn, all };
}

/**
 * Draws a round glowing port in a dark housing: a reactor, an engine, a weak point. Shut, shutter bars lie across it; open, the housing draws back and the whole core shows; burnt out, it is a dark hole with soot round it. Returns { r (the radius of the core), housing (the radius of the housing) }.
 * Arguments: g (the Surface); x, y (its middle: whole numbers); r (the core's radius when shut, px); o { level (how brightly it burns: 0 dark, 0.5 dim, 1 lit, 1.5 bright, 2 white hot), open (0 shut .. 1 open: the core grows by a quarter and the bars are gone from 0.5), bars (shutter bars across a shut port, default 2), burnt (true: blown out, a dead socket with no lit rim; or the shape test of the armour it sits in: streaks of soot are then drawn on that armour round it), housing (a ramp: the dark ring it sits in), colours (colour steps hottest first, as steps() gives them: [white, core, middle, edge, rim]) }.
 */
export function reactorPort(g, x, y, r, o = {}) {
  const { level = 1, open = 0, bars = 2, burnt = false } = o;
  const K = o.housing ?? ramp('#434d6d'), L = o.colours ?? ['#ffffff', '#f0ead8', '#e98c8c', '#e2473f', tone('#e2473f', -1)];
  const grow = R(clamp(open) * Math.max(1, r * 0.25)), rc = r + grow, rh = rc + 2.4;
  if (typeof burnt === 'function') {
    // soot thrown out of it: short streaks all round, on the armour only
    const n = 7, streak = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.4, len = rh + 2.5 + (i % 3) * 1.6;
      streak.push(polyIn([[x + Math.cos(a - 0.22) * rh, y + Math.sin(a - 0.22) * rh], [x + Math.cos(a) * len, y + Math.sin(a) * len], [x + Math.cos(a + 0.22) * rh, y + Math.sin(a + 0.22) * rh]]));
    }
    const soot = anyIn(streak);
    g.fill(x - rh - 8, y - rh - 8, x + rh + 8, y + rh + 8, (px, py) => soot(px, py) && burnt(px, py), K.base, { shade: 0 });
  }
  g.ellipse(x, y, rh, rh, flatDark(K), { shade: 0, light: burnt ? 0 : 1 });
  g.ellipse(x, y, rc + 1, rc + 1, K.dark, { shade: 0 });                        // the crease round the core
  if (level < 0.25) {
    // dark: an empty socket, its far wall catching a little light
    g.ellipse(x, y + 1, rc * 0.7, rc * 0.55, K.base, { shade: 0 });
    g.ellipse(x, y, rc * 0.7, rc * 0.55, K.dark, { shade: 0 });
    return { r: rc, housing: rh };
  }
  // three nested discs, hotter towards the middle; how hot they are is the level
  const tones = level < 0.75 ? [L[4], L[3], L[3]] : level < 1.25 ? [L[3], L[2], L[1]] : level < 1.75 ? [L[2], L[1], L[0]] : [L[1], L[0], L[0]];
  g.ellipse(x, y, rc, rc, tones[0], { shade: 0 });
  g.ellipse(x, y, rc * 0.72, rc * 0.72, tones[1], { shade: 0 });
  g.ellipse(x, y, Math.max(1, rc * 0.42), Math.max(1, rc * 0.42), tones[2], { shade: 0 });
  if (open < 0.5 && bars > 0) {
    const core = ellipseIn(x, y, rc + 1, rc + 1), n = Math.max(1, R(bars));
    for (let i = 0; i < n; i++) {
      const by = R(y - rc + ((i + 1) * 2 * rc) / (n + 1)) - (n % 2 ? 1 : 0);
      g.fill(x - rc - 1, by, x + rc + 1, by + 1, (px, py) => core(px, py) && Math.floor(py) === by, K.base, { shade: 0 });
    }
  }
  return { r: rc, housing: rh };
}

/** The heads mechHead() can draw: cockpit (an armoured hood with a lit canopy), sensor (a narrow tower with one big lens and an aerial), skull plate (a pale face plate with two lit sockets and a grille of teeth). No arguments: a frozen list. */
export const MECH_HEADS = Object.freeze(['cockpit', 'sensor', 'skull plate']);

/**
 * Draws the head of a machine facing the camera, standing on the row `y`: one of MECH_HEADS. Returns { top (the row of its highest pixel), eyes ([[x, y], ...]: the middle of each light, for a flare drawn after the outline) }.
 * Arguments: g (the Surface); kind (one of MECH_HEADS); x (its middle, a whole number), y (the row after its last: its chin); o { w, h (px wide and tall, default 14 and 11), body, metal, dark (ramps: the armour, bright metal, dark fittings), colours (the light's colour steps, hottest first), level (the lights: 0 off, 0.5 dim, 1 lit, 2 flaring), look (-1..1: where the lens looks, sideways), seam (a colour: darkens what it sits on) }.
 */
export function mechHead(g, kind, x, y, o = {}) {
  if (!MECH_HEADS.includes(kind)) throw new Error(`warmachine.mechHead: no head "${kind}"; heads: ${MECH_HEADS.join(', ')}`);
  const w = even(o.w ?? 14), h = Math.max(8, R(o.h ?? 11)), a = w / 2;
  const H = o.body ?? ramp('#6b7896'), M = o.metal ?? ramp('#c2c9d6'), K = o.dark ?? ramp('#434d6d');
  const L = o.colours ?? ['#ffffff', '#f0ead8', '#e98c8c', '#e2473f', tone('#e2473f', -1)];
  const level = o.level ?? 1, on = level >= 0.75, lit = on ? L[3] : level >= 0.25 ? L[4] : K.dark, hot = level >= 1.5 ? L[1] : L[2];
  const look = R(clamp(o.look ?? 0, -1, 1));
  const eyes = [];
  let top = y - h;
  if (kind === 'cockpit') {
    const hood = polyIn([[x - a + 2, y - h], [x + a - 2, y - h], [x + a, y - h + 3], [x + a, y], [x - a, y], [x - a, y - h + 3]]);
    if (o.seam) seam(g, hood, o.seam);
    g.fill(x - a, y - h, x + a, y, hood, H, { shade: 1, light: 1 });
    g.fill(x - a, y - h, x + a, y - h + 2, (px, py) => hood(px, py) && py < y - h + 2, H.light, { shade: 0 });
    // the canopy: dark framing, glass in the colour of the light, a bar down its middle
    const gy0 = y - h + 3, gy1 = y - 2;
    const frame = polyIn([[x - a + 2, gy0], [x + a - 2, gy0], [x + a - 3, gy1], [x - a + 3, gy1]]);
    const glass = polyIn([[x - a + 3, gy0 + 1], [x + a - 3, gy0 + 1], [x + a - 4, gy1 - 1], [x - a + 4, gy1 - 1]]);
    g.fill(x - a, gy0, x + a, gy1, frame, K.base, { shade: 0 });
    g.fill(x - a, gy0, x + a, gy1, glass, lit, { shade: 0 });
    if (on) {
      g.fill(x - a, gy0, x + a, gy1, (px, py) => glass(px, py) && py < gy0 + 2, hot, { shade: 0 });      // the lit upper edge of the glass
      g.rect(x + a - 6 + look, gy0 + 1, 2, 1, L[0]);
    }
    g.rect(x - 1, gy0 + 1, 2, gy1 - gy0 - 2, K.base);
    eyes.push([x - a / 2, (gy0 + gy1) / 2], [x + a / 2, (gy0 + gy1) / 2]);
  } else if (kind === 'sensor') {
    const b = Math.max(4, a - 2), tall = h + 1;
    top = y - tall;
    const tower = polyIn([[x - b + 1, y - tall], [x + b - 1, y - tall], [x + b, y - tall + 2], [x + b, y], [x - b, y], [x - b, y - tall + 2]]);
    if (o.seam) seam(g, tower, o.seam);
    // the two pods at its sides, then the tower
    for (const s of [-1, 1]) g.rect(s < 0 ? x - b - 2 : x + b, y - R(tall * 0.62), 2, 4, flatDark(K), { shade: 0, light: 1 });
    g.fill(x - b, y - tall, x + b, y, tower, H, { shade: 1, light: 1 });
    g.fill(x - b, y - tall, x + b, y - tall + 2, (px, py) => tower(px, py) && py < y - tall + 2, H.light, { shade: 0 });
    // one big lens
    const ly = y - R(tall * 0.48), lr = Math.max(2.4, b * 0.72);
    g.ellipse(x, ly, lr + 1, lr + 1, K.base, { shade: 0 });
    g.ellipse(x, ly, lr, lr, lit, { shade: 0 });
    if (on) {
      g.ellipse(x + look, ly, lr * 0.5, lr * 0.5, hot, { shade: 0 });
      g.dot(x + look, ly - 1, L[0]);
    } else g.rect(x - 1 + look, ly - 1, 2, 2, K.dark);
    // the aerial, with a light on its tip
    g.rect(x - b + 1, y - tall - 4, 1, 4, M.base);
    g.rect(x - b + 1, y - tall - 5, 1, 1, on ? L[3] : K.base);
    top = y - tall - 5;
    eyes.push([x, ly]);
  } else {
    // skull plate: a pale plate in the shape of a skull, bolted to a hood of the body's colour
    const S = skullIn(x, y - h / 2, w, h, { teeth: w >= 14 ? 4 : 3 });
    const hood = polyIn([[x - a - 1 + 2, y - h - 1], [x + a + 1 - 2, y - h - 1], [x + a + 1, y - h + 2], [x + a + 1, y - 3], [x - a - 1, y - 3], [x - a - 1, y - h + 2]]);
    if (o.seam) seam(g, anyIn(hood, S.bone), o.seam);
    g.fill(x - a - 1, y - h - 1, x + a + 1, y, hood, H, { shade: 1 });
    g.fill(x - a - 1, y - h - 1, x + a + 1, y - h + 1, (px, py) => hood(px, py) && py < y - h, H.light, { shade: 0 });
    g.blob([S.bone], M, { shade: 1, minus: [S.gaps] });
    g.fill(x - a, y - h, x + a, y, S.sockets, K.dark, { shade: 0 });
    g.fill(x - a, y - h, x + a, y, S.nose, K.base, { shade: 0 });
    for (const [ex, ey] of S.eyes) {
      if (level >= 0.25) { g.rect(Math.floor(ex) + (look > 0 ? 0 : -1) + (look === 0 ? 0 : 0), Math.floor(ey), 2, 1, lit); if (on) g.dot(Math.floor(ex) + look, Math.floor(ey) - 1, hot); }
      eyes.push([ex, ey]);
    }
    top = y - h - 1;
  }
  return { top, eyes };
}

/** The weapons armWeapon() can draw: cannon arms (a housing and a thick barrel with an open muzzle), claws (three steel talons that open and close), drills (a ribbed cone that turns). No arguments: a frozen list. */
export const ARM_WEAPONS = Object.freeze(['cannon arms', 'claws', 'drills']);

/**
 * Draws a weapon that hangs from an elbow and points down the picture, toward the camera: one of ARM_WEAPONS. Returns { tip: [x, y] (the middle of its far end) }.
 * Arguments: g (the Surface); kind (one of ARM_WEAPONS); x (its middle, a whole number), y (its first row: the elbow); length (px from the elbow to its tip); o { k (the scale of its width, default 1), side (-1 on the picture's left, 1 on its right: which way claws and grooves lean), body, metal, dark, accent (ramps: armour, bright metal, dark fittings, the hazard colour), work (a whole number that goes up by one each frame: the drill turns one groove a step, the claws open and close every four), seam (a colour: darkens what it sits on) }.
 */
export function armWeapon(g, kind, x, y, length, o = {}) {
  if (!ARM_WEAPONS.includes(kind)) throw new Error(`warmachine.armWeapon: no weapon "${kind}"; weapons: ${ARM_WEAPONS.join(', ')}`);
  const k = o.k ?? 1, side = o.side ?? 1, work = R(o.work ?? 0), L = Math.max(8, R(length)), end = y + L;
  const H = o.body ?? ramp('#6b7896'), M = o.metal ?? ramp('#c2c9d6'), K = o.dark ?? ramp('#434d6d'), A = o.accent ?? ramp('#f2a030');
  if (kind === 'cannon arms') {
    const a = Math.max(4, R(5 * k)), b = a - 1, box = Math.max(5, R(L * 0.42));
    // the barrel first: a steel tube with a band of the hazard colour, ending in a muzzle that faces the camera
    g.rect(x - b, y + box - 1, 2 * b, L - box - 1, M, { shade: 1, light: 1 });
    g.rect(x - b, y + box + 1, 2 * b, 2, A.base, { shade: 0 });
    g.rect(x - b, y + box + 1, 1, 2, A.dark, { shade: 0 });
    g.ellipse(x, end - 2.5, b + 0.5, 2.5, M.light, { shade: 0 });
    g.ellipse(x, end - 2.5, b - 1.2, 1.5, K.dark, { shade: 0 });
    armourBlock(g, { x0: x - a, x1: x + a, top: y, face: y + 2, bottom: y + box, inset: 1, cut: [1, 1], paint: H, seam: o.seam });
    g.rect(x - 1, y + 3, 2, 2, K.base);                                           // a bolt on the housing
  } else if (kind === 'claws') {
    const a = Math.max(3, R(4 * k)), wrist = Math.max(4, R(L * 0.32)), grip = [0, 1, 2, 1][((Math.floor(work / 2) % 4) + 4) % 4];
    const span = L - wrist, back = { light: M.base, base: M.dark, dark: M.dark };
    // the short middle talon behind, then two heavy pincers that bow out and hook in, opening and closing
    g.limb(x, y + wrist - 1, x, end - R(span * 0.4), 3, back, { shade: 0 });
    for (const s of [-1, 1]) {
      const kx = x + s * (a - 1), mx = x + s * (a + 1.5 + grip), my = y + wrist + span * 0.55, tx = x + s * (1.5 + grip * 0.7), ty = end - 1.5;
      g.limb(kx, y + wrist - 1, mx, my, 4, M, { shade: 1, light: 1 });
      g.limb(mx, my, tx, ty, 3, M, { shade: 1 });
    }
    armourBlock(g, { x0: x - a - 1, x1: x + a + 1, top: y, face: y + 2, bottom: y + wrist, inset: 1, cut: [1, 1], paint: H, seam: o.seam });
    g.rect(x - a - 1, y + wrist - 2, 2 * a + 2, 1, A.base, { shade: 0 });
  } else {
    const a = Math.max(4, R(5 * k)), collar = Math.max(4, R(L * 0.28));
    const cone = polyIn([[x - a + 1, y + collar - 1], [x + a - 1, y + collar - 1], [x + 1, end], [x - 1, end]]);
    g.fill(x - a, y + collar - 1, x + a, end, cone, M, { shade: 1, light: 1 });
    // the grooves wind round the cone and step down it as it turns
    g.fill(x - a, y + collar - 1, x + a, end, stripesIn(cone, { pitch: 4, slant: -side, duty: 0.25, phase: -side * work + x }), M.dark, { shade: 0 });
    g.rect(x - 1, end - 2, 2, 2, M.light);
    armourBlock(g, { x0: x - a, x1: x + a, top: y, face: y + 2, bottom: y + collar, inset: 1, cut: [1, 1], paint: H, seam: o.seam });
    g.rect(x - a, y + collar - 2, 2 * a, 1, A.base, { shade: 0 });
  }
  return { tip: [x, end] };
}

/**
 * Works out where the tubes of a missile rack are: returns [{ x, y, w, h, cx, cy }], row by row from the top left, each the top-left pixel and size of a tube's mouth and its middle.
 * Arguments: x0, y0 (the top-left pixel of the rack's front); o { cols, rows (tubes across and down, default 2 and 2), tube (px across one mouth, default 4), gap (px between mouths and round them, default 2 across and 1 down) }. The front is cols * (tube + gap) + gap wide and rows * (tube + 1) + 1 tall.
 */
export function rackTubes(x0, y0, { cols = 2, rows = 2, tube = 4, gap = 2 } = {}) {
  const out = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = x0 + gap + i * (tube + gap), y = y0 + 1 + j * (tube + 1);
    out.push({ x, y, w: tube, h: tube, cx: x + tube / 2, cy: y + tube / 2 });
  }
  return out;
}

/**
 * Draws a missile rack in three-quarter view: an armoured box whose front is rows of dark tubes, each with the lit nose of a missile in it unless that tube has fired. Returns { tubes (as rackTubes), x0, y0, w, h (its box), top (its first row) }.
 * Arguments: g (the Surface); x (its middle, a whole number), y (the row after its last); o { cols, rows, tube, gap (as rackTubes), lid (rows of lit top face, default 3), paint (a ramp), dark (a ramp: the tubes), nose (the colour of a missile's nose), glint (a colour for the one bright pixel on each nose, or null), empty ([index, ...]: the tubes that have fired), seam (a colour: darkens what it sits on) }.
 */
export function missileRack(g, x, y, o = {}) {
  const { cols = 2, rows = 2, tube = 4, gap = 2, lid = 3 } = o;
  const w = cols * (tube + gap) + gap, h = rows * (tube + 1) + 1, x0 = R(x - w / 2), y0 = y - h;
  const K = o.dark ?? ramp('#434d6d'), paint = o.paint ?? ramp('#6b7896'), empty = o.empty ?? [];
  armourBlock(g, { x0, x1: x0 + w, top: y0 - lid, face: y0, bottom: y, inset: 1, paint, seam: o.seam });
  const tubes = rackTubes(x0, y0, { cols, rows, tube, gap });
  tubes.forEach((T, i) => {
    g.rect(T.x, T.y, T.w, T.h, K.dark, { shade: 0 });
    if (empty.includes(i)) return;
    const n = Math.max(1, T.w - 2);
    g.rect(T.x + 1, T.y + 1, n, n, o.nose ?? '#e2473f', { shade: 0 });
    if (o.glint && n >= 2) g.dot(T.x + n, T.y + 1, o.glint);
  });
  return { tubes, x0, y0, w, h, top: y0 - lid };
}

/**
 * Draws cooling fins fanned out from a mount, the first nearly upright and each next one leaning further out; returns [[x, y], ...], the tip of each fin.
 * Arguments: g (the Surface); x, y (the mount: the foot of the first fin); o { side (-1: they fan to the picture's left, 1: to its right), count (default 3), length (px, default 12), spread (radians from the first fin to the last, default 0.9), lean (radians the first fin leans out, default 0.2), width (px, default 3), paint (a ramp), slat (a colour for a line along the middle of each fin, or null), hot (a colour for the last third of each fin, glowing with heat, or null), step (px from one fin's foot to the next, default 3) }.
 */
export function radiatorFins(g, x, y, o = {}) {
  const { side = 1, count = 3, length = 12, spread = 0.9, lean = 0.2, width = 3, step = 3 } = o;
  const paint = o.paint ?? ramp('#c2c9d6'), tips = [];
  // the outermost fin first: it lies furthest back
  for (let i = count - 1; i >= 0; i--) {
    const a = lean + (count > 1 ? (spread * i) / (count - 1) : 0), len = length * (1 - 0.12 * i);
    const fx = x + side * i * step, tx = fx + side * Math.sin(a) * len, ty = y - Math.cos(a) * len;
    g.limb(fx, y, tx, ty, width, paint, { shade: 1, light: 1 });
    if (o.slat && width >= 3) g.line(lerp(fx, tx, 0.15), lerp(y, ty, 0.15), lerp(fx, tx, 0.8), lerp(y, ty, 0.8), o.slat);
    if (o.hot) g.limb(lerp(fx, tx, 0.66), lerp(y, ty, 0.66), tx, ty, Math.max(1, width - 2), o.hot, { shade: 0 });
    tips[i] = [tx, ty];
  }
  return tips;
}

/**
 * Draws a small missile flying straight up the picture on its flame, as light: a pale body with a coloured nose and a tapering flame under it, rimmed with their own dark tones. Draw it after g.outline; nothing is drawn outside the box.
 * Arguments: g (the Surface); x (the column of its middle), y (the row of its nose); o { length (px of body, default 5), flame (px of flame, default 5), body (its colour), nose (the nose's colour), colours (the flame's colour steps, hottest first, the last the rim), box ([x0, y0, x1, y1], default the frame less its 1 px border) }. Returns the number of pixels drawn.
 */
export function risingMissile(g, x, y, o = {}) {
  const { length = 5, flame = 5, body = '#f0ead8', nose = '#e2473f' } = o;
  const C = o.colours ?? ['#ffffff', '#f0ead8', '#f8c884', '#f2a030', tone('#f2a030', -1)];
  const B = o.box ?? [1, 1, g.w - 1, g.h - 1], cx = Math.floor(x), top = Math.floor(y);
  let n = 0;
  const put = (px, py, c) => { if (px >= B[0] && py >= B[1] && px < B[2] && py < B[3]) { g.dot(px, py, c); n++; } };
  const rim = tone(body, -1.4), L = Math.max(3, R(length)), F = Math.max(0, R(flame));
  // the flame: widest under the tail, a point at its end
  for (let i = 0; i < F; i++) {
    const half = i < F * 0.5 ? 1 : 0, yy = top + L + i;
    for (let dx = -half - 1; dx <= half + 1; dx++) put(cx + dx, yy, Math.abs(dx) > half ? C[C.length - 1] : dx === 0 ? (i < F * 0.35 ? C[0] : C[1]) : C[C.length - 2]);
  }
  if (F) put(cx, top + L + F, C[C.length - 1]);
  // the body, three pixels wide, with a pointed nose
  for (let i = 0; i < L; i++) {
    const yy = top + i, half = i === 0 ? 0 : 1;
    for (let dx = -half - 1; dx <= half + 1; dx++) put(cx + dx, yy, Math.abs(dx) > half ? rim : i < 2 ? nose : dx > 0 ? tone(body, -0.5) : body);
  }
  put(cx, top - 1, rim);
  return n;
}
