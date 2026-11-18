// Station bulkheads: the plated metal wall of a space station seen from the south, and the machines set in it
// (docs/style-guide.md, sections 6 and 14). The hard-surface partner of the stone faces in engine/tiles.js
// (coursedFace) and of the plated floors in engine/plating.js. Added with batch S11: sprites/tiles-station-walls.js
// is the worked example for the wall, sprites/blast-door.js, wall-terminal.js and laser-gate.js for the machines.
//
//   import { patternFill, drawBlock, textureTone, textureLight } from '../engine/tiles.js';
//   import { shadeTo, drawBulkhead, doorLeaves, screenIn, laserBeam, machineTones, drawCasing, hazardBand } from '../engine/bulkhead.js';
//
//   // the front face of a top-down wall block: bands stacked from the foot up, so a low wall is a tall one cut short
//   const face = patternFill(p.hull, (s) => drawBulkhead(s, { rows: 29, style: 'panels', tones, light: { on: p.glow } }));
//   drawBlock(g, piece, { fill, top, left, right, face: { paint: face, shadow } });
//   // a cap darker than anything on the floor, whatever colour was picked for it
//   const cap = shadeTo(p.plate, 0.22);
//   // a sliding door: draw it shut on a spare Surface, then show each leaf where it has slid to
//   for (const leaf of doorLeaves('split', 8, 18, 48, 28, open)) g.blit(masked(shifted(shut, leaf), hole));
//   // what a screen shows, as a shape test inside the screen's box
//   g.fill(x, y, x + w, y + h, screenIn('graph', x, y, w, h, t), p.glow);
//   // a beam of light between two emitters, after g.outline
//   laserBeam(g, { x0: 12, x1: 51, y: 20, thick: 3, colours: steps(p.glow), cut: 0.2, phase: t });
//   // a machine built of boxes: its tones from one colour, each box with a lit top face, warning paint on a foot
//   const T = machineTones(p.body);
//   drawCasing(g, T, 8, 31, 16, 12, 0); drawCasing(g, T, 4, 10, 24, 20);
//   hazardBand(g, 6, 42, 8, 3, { dark: T.dark, paint: p.accent });
//
// Everything here is pure and repeatable (no Math.random, no state between calls) and draws with hard pixel edges
// through Surface.rect and Surface.dot only: it suits the pixel style.

import { hash, clamp, fract } from './motion.js';
import { tone, brightness } from './color.js';
import { rectIn } from './surface.js';
import { stripesIn } from './solids.js';
import { textureTone, textureLight } from './tiles.js';

const T = 32;

// ---- tones ------------------------------------------------------------------------------------

/**
 * Returns a colour darkened or lightened along its own ramp until its brightness is `want`: a wall cap that must stay darker than the floor, a face that must stay lighter than its trim, whatever swatch was picked.
 * Arguments: colour ('#rrggbb'); want (the brightness to reach, 0 to 1; a colour already within 0.005 of it comes back unchanged).
 */
export function shadeTo(colour, want) {
  const b = brightness(colour), goal = clamp(want, 0.02, 0.98);
  if (Math.abs(b - goal) < 0.005) return colour;
  const dir = goal < b ? -1 : 1;
  let lo = 0, hi = dir < 0 ? 3.2 : 2.2;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2, got = brightness(tone(colour, dir * mid));
    if (dir < 0 ? got > goal : got < goal) lo = mid; else hi = mid;
  }
  return tone(colour, (dir * (lo + hi)) / 2);
}

// ---- the face of a wall --------------------------------------------------------------------------

/** The builds of wall face drawBulkhead knows: panels (two flat panels to a tile), ribbed (upright ribs, like a container), plated (riveted plates of three widths). No arguments: a frozen list. */
export const BULKHEAD_STYLES = Object.freeze(['panels', 'ribbed', 'plated']);

// Rows of the lower face, counted from its first row: what every wall has, whatever its height.
const LOW = 21, LIP = 0, CHANNEL = 1, STRIP = 2, BAND = 4, BAND_ROWS = 9, PIPE = 13, SKIRT = 16;
// where the bolts of each build sit: [column, row of the lower face]; the first so many show
const BOLTS = {
  panels: [[2, 5], [18, 5], [11, 10], [27, 10], [11, 5], [27, 5], [2, 10], [18, 10]],
  ribbed: [[2, 17], [18, 17], [10, 17], [26, 17], [14, 17], [29, 17]],
  plated: [[1, 5], [22, 5], [6, 10], [28, 10], [11, 5], [17, 10], [28, 5], [1, 10]],
};
// dirt at the foot of the wall: how many px it stands up at each column (it leads from the last column into the first)
const FOOT = [0, 1, 1, 2, 1, 0, 0, 0, 1, 0, 0, 1, 2, 2, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1, 2, 3, 2, 1, 1, 0, 0];
// the two brackets that hold the pipe: their first column
const CLAMPS = [6, 22];
// the lit dashes of the light strip: [first column, last column]
const DASHES = [[2, 13], [18, 29]];

/**
 * Draws the front face of a plated metal wall on the top rows of a 32 px wide Surface: a lit lip, a strip of light in a dark channel, a band of panels, a pipe on two brackets and a kick plate; returns the rows of each band.
 * The bands repeat every 32 px across; a face taller than 21 rows adds a recessed header above them.
 * Arguments: s (the Surface, as patternFill hands it over); options { rows (the height of the face: 21, a wall one tile deep, to 32; default 29), style (one of BULKHEAD_STYLES), tones ({ base, lit, soft, seam, skirt, dark }: the wall, its brightest edge, the softer light of a lip, the grooves, the kick plate, the recess of the header; lit and seam default to base), light ({ on, off, dead }: the colours of a lit and an unlit dash of the strip and how many dashes are out; left out: no strip, the channel is bare wall), bolts (0 to 1: how many rivets), grime (0 to 1: dirt at the foot and streaks under the brackets) }.
 * Returns { rows, lip, strip, band: [first, last], pipe: [first, last], skirt: [first, last] }, all rows of the Surface. The bands are counted from the foot, so the lower 21 rows of every height are the same.
 */
export function drawBulkhead(s, { rows = 29, style = 'panels', tones = {}, light = null, bolts = 0, grime = 0 } = {}) {
  if (!BULKHEAD_STYLES.includes(style)) throw new Error(`drawBulkhead: "${style}" is not a wall build (${BULKHEAD_STYLES.join(', ')})`);
  const base = tones.base, lit = tones.lit ?? base, soft = tones.soft ?? lit, seam = tones.seam ?? base, skirt = tones.skirt ?? base, dark = tones.dark ?? seam;
  const R = clamp(Math.round(rows), LOW, T), F = R - LOW, row = (k) => F + k;
  s.rect(0, 0, T, R, base);
  // the header of a tall wall: its own lit edge, then a recess with a lit sill
  if (F >= 6) {
    s.rect(0, 0, T, 1, lit);
    s.rect(0, 2, T, 1, seam);
    s.rect(0, 3, T, F - 5, dark);
    s.rect(0, F - 2, T, 1, soft);
  } else if (F > 0) s.rect(0, 0, T, 1, lit);
  // the lip, and the channel that holds the strip of light
  s.rect(0, row(LIP), T, 1, lit);
  if (light) {
    s.rect(0, row(CHANNEL), T, 3, seam);
    DASHES.forEach(([a, b], i) => s.rect(a, row(STRIP), b - a + 1, 1, i < (light.dead ?? 0) ? light.off ?? seam : light.on));
  }
  // the band of panels
  const y = row(BAND), h = BAND_ROWS;
  const groove = (x) => { s.rect(x, y, 1, h, seam); s.rect(x - 1, y, 1, h, soft); };
  if (style === 'panels') { groove(15); groove(31); }
  if (style === 'ribbed') for (let x = 0; x < T; x += 4) { s.rect(x + 1, y, 1, h, soft); s.rect(x + 3, y, 1, h, seam); }
  if (style === 'plated') {
    groove(9); groove(20); groove(31);
    s.rect(10, y + 4, 10, 1, seam); s.rect(10, y + 5, 9, 1, soft);
  }
  // the kick plate, then the pipe that runs along its top on two brackets
  s.rect(0, row(SKIRT), T, LOW - SKIRT, skirt);
  s.rect(0, row(PIPE), T, 1, lit); s.rect(0, row(PIPE + 1), T, 1, soft); s.rect(0, row(PIPE + 2), T, 1, seam);
  for (const x of CLAMPS) { s.rect(x, row(PIPE - 1), 1, 5, seam); s.rect(x + 1, row(PIPE - 1), 1, 5, soft); s.dot(x + 1, row(PIPE - 1), lit); }
  // rivets: lit at the top right, dark at the lower left
  const list = BOLTS[style];
  for (const [x, k] of list.slice(0, Math.round(clamp(bolts) * list.length))) {
    s.dot(x, row(k), soft); s.dot(x + 1, row(k + 1), soft); s.dot(x + 1, row(k), lit); s.dot(x, row(k + 1), seam);
  }
  // dirt: it creeps up from the foot, and runs down from the brackets
  const g = clamp(grime);
  if (g > 0) {
    for (let x = 0; x < T; x++) { const up = Math.min(LOW - SKIRT, Math.round(FOOT[x] * g * 1.4)); if (up) s.rect(x, R - up, 1, up, seam); }
    CLAMPS.forEach((x, i) => { const run = Math.round(g * (4 - i)); if (run) s.rect(x + 1, row(SKIRT), 1, Math.min(run, LOW - SKIRT), seam); });
  }
  return { rows: R, lip: row(LIP), strip: row(STRIP), band: [y, y + h - 1], pipe: [row(PIPE), row(PIPE + 2)], skirt: [row(SKIRT), R - 1] };
}

// ---- doors that slide ----------------------------------------------------------------------------

/** The ways doorLeaves opens a doorway: split (two halves slide apart sideways), iris (four blades that meet in the middle draw back up, down and to the sides), shutter (one curtain rolls up). No arguments: a frozen list. */
export const DOOR_STYLES = Object.freeze(['split', 'iris', 'shutter']);

/**
 * The leaves of a sliding door at one moment of its opening: for each leaf the part of the shut door it is and how far it has moved, so a door drawn once, shut, is shown open by moving each part and cutting it to the doorway.
 * Arguments: style (one of DOOR_STYLES); x, y, w, h (the doorway, in whole pixels: its top-left corner and size); open (0 shut to 1 fully open; a little over 1 overshoots); options { stub (px of every leaf that stay in view when fully open, so the open door still shows its edges; default 2), slant (iris only: rows the seams between the blades fall per column from the middle, default 0.5), teeth (split only: px each half reaches past the middle in square teeth that lock into the other half, default 0: a straight seam), pitch (rows from one tooth to the next of the same half, default 14) }.
 * Returns [{ name, rest, dx, dy, seen }]: rest(px, py) is true where the leaf lies in the shut door; dx, dy are whole pixels to move it; seen(px, py) is true where it shows now (moved, and inside the doorway). name: 'left', 'right', 'top', 'bottom' or 'curtain'.
 */
export function doorLeaves(style, x, y, w, h, open = 0, { stub = 2, slant = 0.5, teeth = 0, pitch = 14 } = {}) {
  if (!DOOR_STYLES.includes(style)) throw new Error(`doorLeaves: "${style}" is not a way a door opens (${DOOR_STYLES.join(', ')})`);
  const k = Math.max(0, open), cx = x + w / 2, cy = y + h / 2;
  const hole = (px, py) => px >= x && px < x + w && py >= y && py < y + h;
  const leaf = (name, rest, dx, dy) => ({ name, rest, dx, dy, seen: (px, py) => hole(px, py) && rest(px - dx, py - dy) });
  const go = (span) => Math.round(k * Math.max(0, span - stub));
  if (style === 'split') {
    // the seam: straight, or stepping from one side of the middle to the other every half pitch
    const half = Math.max(1, Math.round(pitch / 2)), reach = Math.max(0, Math.round(teeth));
    const seam = (py) => cx + (Math.floor((Math.floor(py) - y) / half) % 2 === 0 ? reach : -reach);
    return [
      leaf('left', (px, py) => hole(px, py) && px < seam(py), 0 - go(w / 2 + reach), 0),
      leaf('right', (px, py) => hole(px, py) && px >= seam(py), go(w / 2 + reach), 0),
    ];
  }
  if (style === 'shutter') return [leaf('curtain', hole, 0, 0 - go(h))];
  // iris: the two seams cross in the middle; above and below them lie the top and bottom blades, beside them the others
  const upper = (px, py) => py - cy < -Math.abs(px - cx) * slant, lower = (px, py) => py - cy >= Math.abs(px - cx) * slant;
  return [
    leaf('top', (px, py) => hole(px, py) && upper(px, py), 0, 0 - go(h / 2)),
    leaf('bottom', (px, py) => hole(px, py) && lower(px, py), 0, go(h / 2)),
    leaf('left', (px, py) => hole(px, py) && !upper(px, py) && !lower(px, py) && px < cx, 0 - go(w / 2), 0),
    leaf('right', (px, py) => hole(px, py) && !upper(px, py) && !lower(px, py) && px >= cx, go(w / 2), 0),
  ];
}

// ---- what a screen shows ---------------------------------------------------------------------------

// The four lines of text a screen scrolls: [how much of the width the line takes, where along it the gap between its
// two words falls (0 to 1)]. A fixed list, so the lines differ in length on a screen of any width (8 px: 6, 4, 5, 3).
const TEXT_LINES = [[1, 0.6], [0.62, 0.4], [0.85, 0.5], [0.45, 0.5]];

/** The pictures screenIn knows: text (lines of writing that scroll), graph (bars that rise and fall), map (rooms joined by corridors, one marked), skull (a warning), tick (accepted). No arguments: a frozen list. */
export const SCREEN_PICTURES = Object.freeze(['text', 'graph', 'map', 'skull', 'tick']);

/**
 * Shape test for what a small computer screen shows, drawn in whole pixels inside the screen's box: lines of text, a bar graph, a floor map, a skull or a tick; returns inside(px, py).
 * Arguments: kind (one of SCREEN_PICTURES); x, y, w, h (the lit part of the screen, in whole pixels; 8 by 6 or more); phase (0 to 1, once round a loop: the text scrolls up eight rows, which is four lines of four different lengths, and is then where it began; the bars of the graph rise and fall; the marker of the map blinks; the skull and the tick do not move).
 */
export function screenIn(kind, x, y, w, h, phase = 0) {
  if (!SCREEN_PICTURES.includes(kind)) throw new Error(`screenIn: "${kind}" is not a screen picture (${SCREEN_PICTURES.join(', ')})`);
  const inBox = (i, j) => i >= 0 && j >= 0 && i < w && j < h;
  const t = fract(phase);
  let at;
  if (kind === 'text') {
    // lines two rows apart, each of its own length; a line of five px or more is two words with a gap between them.
    // Four different lines come round, and they climb all four (eight rows) in one loop, so the loop closes
    const LINES = TEXT_LINES.length, step = Math.floor(t * 2 * LINES + 1e-6), most = Math.max(4, w - 2);
    at = (i, j) => {
      const v = j + step, [share, split] = TEXT_LINES[Math.floor(v / 2) % LINES];
      if (v % 2 || i < 1) return false;
      const len = Math.max(2, Math.round(most * share));
      const gap = len >= 5 ? 2 + Math.round((len - 4) * split) : 0;
      return i <= len && i !== gap;
    };
  } else if (kind === 'graph') {
    // bars two px wide standing on a base line, each swinging on its own timing
    const n = Math.max(2, Math.floor((w - 1) / 3));
    at = (i, j) => {
      if (j === h - 1) return true;
      const b = Math.floor((i - 1) / 3);
      if (i < 1 || (i - 1) % 3 === 2 || b >= n) return false;
      const tall = 1 + Math.round((h - 3) * (0.5 + 0.5 * Math.sin(2 * Math.PI * (t + hash(b, 3))) * (0.4 + 0.6 * hash(b, 7))));
      return h - 1 - j <= tall;
    };
  } else if (kind === 'map') {
    // three rooms as outlines, joined by corridors; a marker blinks in one of them
    const rooms = [[0, 0, Math.floor(w * 0.42), Math.floor(h * 0.5)], [Math.floor(w * 0.58), 1, w - Math.floor(w * 0.58), Math.floor(h * 0.42)], [Math.floor(w * 0.3), Math.floor(h * 0.62), Math.floor(w * 0.5), h - Math.floor(h * 0.62)]];
    const edge = (i, j, [rx, ry, rw, rh]) => i >= rx && i < rx + rw && j >= ry && j < ry + rh && (i === rx || i === rx + rw - 1 || j === ry || j === ry + rh - 1);
    const mx = rooms[2][0] + (rooms[2][2] >> 1), my = rooms[2][1] + (rooms[2][3] >> 1);
    at = (i, j) => rooms.some((r) => edge(i, j, r))
      || (j === rooms[1][1] + 1 && i >= rooms[0][0] + rooms[0][2] && i < rooms[1][0])
      || (i === rooms[2][0] + 1 && j >= rooms[0][1] + rooms[0][3] && j < rooms[2][1])
      || (t < 0.5 && Math.abs(i - mx) + Math.abs(j - my) <= (rooms[2][3] >= 5 ? 1 : 0));
  } else if (kind === 'skull') {
    // a round head with two eyes and a nose, on a jaw with gaps for teeth
    const cx = (w - 1) / 2, top = Math.max(0, Math.floor((h - 8) / 2)), r = Math.min(4, Math.floor((w - 1) / 2));
    at = (i, j) => {
      const a = Math.abs(i - cx), v = j - top;
      if (v < 0 || v > 7) return false;
      if (v <= 4) {
        if (a > r + 0.5 - (v === 0 ? 1.5 : v === 4 ? 1 : 0)) return false;
        if ((v === 2 || v === 3) && a >= 1 && a <= 2.5) return false;                 // the eyes
        return !(v === 4 && a < 0.6);                                                 // the nose
      }
      return a <= r - 1.5 && (v === 5 || Math.floor(a) % 2 === 0);                    // the jaw and its teeth
    };
  } else {
    // a tick: a short stroke down to the right, then a long one up to the right, two px thick
    const n = Math.min(h - 2, Math.floor((w - 2) * 0.6)), low = Math.floor((h + n) / 2), turn = Math.floor((w - n * 1.5) / 2) + Math.floor(n / 2);
    at = (i, j) => {
      const up = i - turn, d = up >= 0 ? low - up : low - (turn - i);
      return (j === d || j === d - 1) && (up >= 0 ? up <= n : turn - i <= Math.floor(n / 2));
    };
  }
  return (px, py) => { const i = Math.floor(px) - x, j = Math.floor(py) - y; return inBox(i, j) && at(i, j); };
}

// ---- light between two emitters ----------------------------------------------------------------------

/**
 * A level beam of light between two emitters: a white-hot core between rows of its own colour and a darker rim, which can thin to a line, break into pieces and go out; returns the number of pixels lit.
 * Draw it after g.outline. It returns 0 when it is out.
 * Arguments: g (the Surface); o: { x0, x1 (its first and last column), y (the row of its middle), thick (px across, an odd number: 1 is a thin line of the light's pale colour; 3 the core with a row of colour above and below; 5 adds the dark rim; 7 a paler row beside the core as well), colours (hottest first, as steps() gives them: [white, core, mid, edge, rim]; the first two and the last two are used), cut (0 whole to 1 gone: the share of its length that is broken away, piece by piece, each going out at a moment of its own), dash (px of the pieces it breaks into, default 4), phase (0 to 1: slides the breaks along, so a broken beam crackles), seed }.
 */
export function laserBeam(g, o) {
  const { x0, x1, y, thick = 3, cut = 0, dash = 4, phase = 0, seed = 0 } = o;
  const C = Array.isArray(o.colours) && o.colours.length ? o.colours : ['#ffffff', '#ff9c77', '#ee7158', '#e2473f', '#bf0b2a'];
  const hot = C[0], pale = C[Math.min(1, C.length - 1)], edge = C[Math.max(0, C.length - 2)], rim = C[C.length - 1];
  const half = Math.max(0, (Math.max(1, Math.round(thick)) - 1) >> 1), gone = clamp(cut);
  const a = Math.round(Math.min(x0, x1)), b = Math.round(Math.max(x0, x1)), step = Math.max(2, Math.round(dash));
  const slide = Math.floor(fract(phase) * step);
  let count = 0;
  for (let x = a; x <= b; x++) {
    // each piece of the beam goes out at a moment of its own; none is left at cut = 1
    if (gone > 0 && hash(Math.floor((x - a + slide) / step), seed * 64 + 3) < gone * 1.02) continue;
    for (let j = -half; j <= half; j++) {
      const d = Math.abs(j);
      g.dot(x, Math.round(y) + j, half === 0 ? pale : d === 0 ? hot : d === half && half >= 2 ? rim : d === half - 1 || half < 2 ? edge : pale);
      count++;
    }
  }
  return count;
}

// ---- added with batch S11, fix round 1: the casing of a machine, and warning paint -------------------------

/**
 * The six tones a metal machine is drawn in, all from its one colour: the body, its brightest edge, a softer light for top faces and lit sides, the grooves, and a darker metal for recesses (a bezel, a nozzle, the band under warning paint) with that metal's own lit edge.
 * Arguments: colour ('#rrggbb': the body); options { drop (how much darker than the body the recess metal is, in brightness, default 0.2), floor (the darkest the recess metal may get, so it stays clear of the outline; default 0.17) }.
 * Returns { base, lit, soft, seam, dark, darkLit }. base, lit, soft and seam are what drawCasing takes; they are also the tones drawBulkhead and drawGrate ask for.
 */
export function machineTones(colour, { drop = 0.2, floor = 0.17 } = {}) {
  const dark = shadeTo(colour, Math.max(floor, brightness(colour) - drop));
  return { base: colour, lit: textureLight(colour), soft: textureLight(colour, colour, 0.4), seam: textureTone(colour), dark, darkLit: textureLight(dark, dark, 0.4) };
}

/**
 * Draws a box of a machine seen from the south, in whole pixels: a lit top face over a front that is lit down its right edge and dark down its left. Stack several for a cabinet, a pillar, a post; draw the ones behind first.
 * Arguments: g (the Surface); tones ({ base, lit, soft, seam }, as machineTones gives them: the front, the far edge of the top face, the top face and the lit side, the dark side); x, y, w, h (the box: its top-left corner and its size, the top face included); top (rows of top face, default 2; 0: a front alone, for a box that stands under another).
 */
export function drawCasing(g, tones, x, y, w, h, top = 2) {
  g.rect(x, y, w, top, tones.soft); g.rect(x, y, w, 1, tones.lit);
  g.rect(x, y + top, w, h - top, tones.base);
  g.rect(x + w - 1, y + top, 1, h - top, tones.soft);
  g.rect(x, y + top, 1, h - top, tones.seam);
  return g;
}

/**
 * Paints a band of warning stripes in whole pixels: a dark band with slanted stripes of the warning colour across it (the foot of a post, the bottom of a door, a door post).
 * Arguments: g (the Surface); x, y, w, h (the band: its top-left corner and its size); options { dark (the colour between the stripes), paint (the stripes' colour), pitch (px from one stripe to the next, default 4), slant (px a stripe moves sideways per row down, default 1; negative leans the other way), duty (the share of the pitch that is stripe, default 0.5), phase (px to slide the stripes sideways, default 0) }.
 */
export function hazardBand(g, x, y, w, h, { dark, paint, pitch = 4, slant = 1, duty = 0.5, phase = 0 } = {}) {
  const band = rectIn(x, y, w, h);
  g.fill(x, y, x + w, y + h, band, dark);
  g.fill(x, y, x + w, y + h, stripesIn(band, { pitch, slant, duty, phase }), paint);
  return g;
}
