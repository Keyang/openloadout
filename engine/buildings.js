// Building pieces: houses, shops and inns seen from the south in three-quarter view
// (docs/style-guide.md section 1: you see the south wall, and the south slope of the roof above it).
// A building sprite stacks these from the ground up and outlines the whole once:
//
//   import { pitchedRoof, timberWall, plankDoor, paneWindow, chimneyStack, chimneySmoke } from '../engine/buildings.js';
//   timberWall(g, { x: 16, y: 54, w: 64, h: 38, wall: p.wall, wood: p.wood, eave: 57, rails: [80] });
//   paneWindow(g, { x: 22, y: 64, w: 13, h: 13, wood: p.wood, glass: P.slate, lit, glow: p.glow });
//   plankDoor(g, { x: 39, y: 60, w: 18, h: 30, wood: p.wood, open, inside: dark, floor: P.path, knob: P.gold });
//   const roof = pitchedRoof(g, { x: 13, y: 27, w: 70, h: 30, kind: p.roof, colour: p.roofColour });   // over the wall's top rows
//   const top = chimneyStack(g, { x: 62, y: 21, w: 8, h: 16, stone: P.cobble });
//   g.outline(INK);
//   chimneySmoke(g, { t, ...top, colour: P.cobble });                                                  // light and smoke go after the outline
//
// What every house repeats is here too: houseColours(palette) (glass, doorway, floor, and plaster and beam swatches),
// doorSwing(t) (how far open the door is through an `open` clip), doorStep (the slab under the door) and
// litWindow (a paneWindow that glows and flickers at night). sprites/cottage.json and sprites/inn.json are the worked examples.
//
// Rules every piece follows:
//   - Light from the top right (the engine default): a piece is lit along its top and right, dark along its left and bottom.
//   - Three tones per material, all derived from the one colour passed in (ramp). No colour is typed here.
//   - A piece drawn OVER what is already there (a roof over a wall, a chimney on a roof, a sign on a wall) inks its own
//     rim only where it covers drawn pixels (inkOver). The silhouette is left to the sprite's single g.outline(INK),
//     so the outline is never doubled. So draw from the back to the front: wall, windows, door, roof, chimney, sign.
//   - Colours are '#rrggbb'. Coordinates are whole pixels; a box is its top-left corner (x, y), w wide and h tall.

import { ramp, tone, mix, col, INK } from './color.js';
import { hash, clamp } from './motion.js';
import { Surface } from './surface.js';
import { smoke } from './fx.js';
import { wave, keys } from './motion.js';
import { despeckle } from './surface.js';
import { palette, paletteName, swatchesBetween } from './palettes.js';

/** The roof kinds pitchedRoof and roofShape know, in the order a choice control lists them. No arguments: a frozen list. */
export const ROOF_KINDS = Object.freeze(['thatch', 'tile', 'slate']);

// inset: how much narrower the ridge is than the eave on each side (a share of the width, and a least number of pixels);
// round: the radius of the rounded top corners; lip: the rows at the eave that are the roof's full width (its thickness)
const ROOF = {
  thatch: { inset: 0.08, least: 4, round: 7, lip: 6 },
  tile: { inset: 0, least: 2, round: 0, lip: 5 },
  slate: { inset: 0.14, least: 8, round: 0, lip: 4 },
};

/**
 * Inks the rim of a shape only where something is already drawn, so a piece laid over another gets a line and the silhouette is left to the sprite's outline. Returns the number of pixels inked.
 * Arguments: g: the Surface; x0, y0, x1, y1: the box the shape lies in; inside: its shape test (px, py); ink: the line colour.
 */
export function inkOver(g, x0, y0, x1, y1, inside, ink = INK) {
  const c = col(ink);
  const ax = Math.max(0, Math.floor(x0) - 1), ay = Math.max(0, Math.floor(y0) - 1);
  const bx = Math.min(g.w - 1, Math.ceil(x1) + 1), by = Math.min(g.h - 1, Math.ceil(y1) + 1);
  let n = 0;
  for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) {
    if (!g.data[y * g.w + x]) continue;
    const px = x + 0.5, py = y + 0.5;
    if (inside(px, py)) continue;
    if (inside(px + 1, py) || inside(px - 1, py) || inside(px, py + 1) || inside(px, py - 1)) { g.data[y * g.w + x] = c; n++; }
  }
  return n;
}

/**
 * The outline of a pitched roof seen from the south: widest at the eave, narrower at the ridge, with the edge of its kind (thatch: rounded corners and a shaggy eave; tile: ridge caps and a scalloped eave; slate: a hipped trapezoid with two finials).
 * Arguments: { x, y, w, h, kind }: the box from the ridge (y) down to the eave (y + h), w wide at the eave; kind: one of ROOF_KINDS.
 * Returns { kind, x, y, w, h, ridge, eave, inset, inside(px, py), at(u, v) }: at(u, v) is the point u of the way across and v of the way down the slope.
 */
export function roofShape({ x, y, w, h, kind = 'tile' }) {
  const K = ROOF[kind];
  if (!K) throw new Error(`buildings: unknown roof kind "${kind}": use ${ROOF_KINDS.join(', ')}`);
  const inset = Math.max(K.least, Math.round(w * K.inset));
  const eave = y + h, x1 = x + w, lip = Math.min(K.lip, h - 2), r = Math.min(K.round, (h - lip) / 2);
  // how far each side is in from the box at row py
  const side = (py) => {
    let s = inset * (1 - clamp((py - y) / (h - lip)));
    const dy = py - y;
    if (r && dy < r) s += r - Math.sqrt(Math.max(0, r * r - (r - dy) ** 2));
    return s;
  };
  const colOf = (px) => Math.floor(px - x);
  // what hangs below the eave line, in rows
  const tuft = (px) => (kind === 'thatch' ? Math.floor(hash(Math.floor(colOf(px) / 2), 5) * 3) : kind === 'tile' ? ([1, 2].includes(colOf(px) % 4) ? 1 : 0) : 0);
  // what stands above the ridge line
  const cap = (px, py) => {
    const k = Math.floor(px - (x + inset)), span = w - 2 * inset;
    if (k < 0 || k >= span) return false;
    if (kind === 'tile') return py >= y - 1 && [1, 2].includes(k % 4);
    if (kind === 'slate') return py >= y - 3 && ((k >= 1 && k < 3) || (k >= span - 3 && k < span - 1));
    return false;
  };
  const inside = (px, py) => {
    if (px < x || px >= x1) return false;
    if (py >= eave) return py < eave + tuft(px);
    if (py < y) return cap(px, py);
    const s = side(py);
    return px >= x + s && px < x1 - s;
  };
  const at = (u, v) => { const py = y + clamp(v) * h, s = side(py); return [x + s + clamp(u) * (w - 2 * s), py]; };
  return { kind, x, y, w, h, ridge: y, eave, inset, inside, at };
}

// 'l' | 'b' | 'd' for a roof pixel: rb is how many rows it is above the eave line, k its column from the left of the box
const ROOF_TEXTURE = {
  // rows of round-ended tiles, each row half a tile along from the one below
  tile(k, rb) {
    if (rb < 0) return 'b';
    const j = Math.floor(rb / 5), row = Math.floor(rb) % 5, c = (k + (j % 2) * 2) % 4;
    if (row === 0) return c === 1 || c === 2 ? 'd' : 'b';
    if (row === 1) return c === 0 || c === 3 ? 'd' : 'b';
    if (row === 3) return c === 1 || c === 2 ? 'l' : 'b';
    return 'b';
  },
  // courses of flat slabs with staggered joints; one slab in five catches the light
  slate(k, rb) {
    if (rb < 0) return 'b';
    const j = Math.floor(rb / 4), row = Math.floor(rb) % 4, c = (k + (j % 2) * 3) % 6;
    if (row === 0 || c === 0) return 'd';
    return hash(Math.floor((k + (j % 2) * 3) / 6), j * 7 + 3) > 0.78 ? 'l' : 'b';
  },
  // three or four layers of straw, each ending in a ragged line, with a bound roll along the ridge
  thatch(k, rb, h) {
    if (rb < 3) return hash(k, 3) > 0.45 ? 'd' : 'b';   // the cut ends of the straw: the thickness of the thatch at the eave
    const up = h - rb;                                  // rows below the ridge line
    if (up < 3) return up >= 2 ? (k % 5 === 2 ? 'b' : 'd') : up < 1 ? 'l' : 'b';
    const ch = Math.max(7, Math.round(h / 3.4)), j = Math.floor(rb / ch), row = Math.floor(rb) % ch;
    if (j > 0 && row === 0) return hash(k, j + 11) > 0.25 ? 'd' : 'b';
    if (j > 0 && row === 1) return hash(k, j + 11) > 0.72 ? 'd' : 'b';
    const ph = (Math.floor(rb) + Math.floor(hash(k, 37) * ch)) % ch;
    if (hash(k, 31) > 0.8 && ph >= 2 && ph < 5) return 'l';
    if (hash(k, 41) > 0.84 && ph >= 3 && ph < 5) return 'd';
    return 'b';
  },
};

/**
 * Draws a pitched roof seen from the south, with the texture of its kind (straw layers, rows of round tiles, staggered slabs) in three tones of one colour, and an ink line where its eave lies over a wall.
 * Arguments: g: the Surface; { x, y, w, h, kind, colour, ink }: the box from ridge to eave as roofShape takes it; kind: one of ROOF_KINDS; colour: the roof colour; ink: the line colour, or null for no line.
 * Returns the roofShape, so a chimney or a dormer can be placed with its at(u, v).
 */
export function pitchedRoof(g, { x, y, w, h, kind = 'tile', colour, ink = INK }) {
  const S = roofShape({ x, y, w, h, kind }), R = ramp(colour), tex = ROOF_TEXTURE[kind];
  const tones = { l: col(R.light), b: col(R.base), d: col(R.dark) };
  if (ink) inkOver(g, x, y - 4, x + w, y + h + 3, S.inside, ink);
  const ay = Math.max(0, y - 4), by = Math.min(g.h - 1, y + h + 3);
  for (let py = ay; py <= by; py++) for (let px = Math.max(0, x); px < Math.min(g.w, x + w); px++) {
    const cx = px + 0.5, cy = py + 0.5;
    if (!S.inside(cx, cy)) continue;
    let c = tex(px - x, S.eave - cy, h);
    if (!S.inside(cx - 1, cy) || !S.inside(cx - 1, cy + 1)) c = 'd';            // the left and the underside: away from the light
    else if (!S.inside(cx + 1, cy) || !S.inside(cx + 1, cy - 1)) c = 'l';       // the ridge and the right: they catch it
    g.data[py * g.w + px] = tones[c];
  }
  return S;
}

/**
 * Draws a half-timbered wall face: plaster framed by corner posts and a sill beam, with extra posts, rails and diagonal braces where asked, the shadow each beam casts and the shadow under the eave.
 * Arguments: g: the Surface; { x, y, w, h, wall, wood, beam, posts, rails, braces, eave, shade, flecks }: the box; wall: the plaster colour; wood: the beam colour; beam: beam thickness in px (3);
 * posts: a list of x, or [x, y0, y1]; rails: a list of y, or [y, x0, x1]; braces: a list of [x0, y0, x1, y1]; eave: the row the roof's eave ends on (shade rows below it are in shadow); flecks: true adds a few short weathering marks to the plaster.
 */
export function timberWall(g, { x, y, w, h, wall, wood, beam = 3, posts = [], rails = [], braces = [], eave = null, shade = 2, flecks = false }) {
  const P = ramp(wall), W = ramp(wood), x1 = x + w, y1 = y + h;
  g.rect(x, y, w, h, P.base);
  if (eave !== null && eave + shade > y) g.rect(x, y, w, Math.min(h, eave + shade - y), P.dark);
  if (flecks) {
    // a few short marks where the plaster has weathered; the same ones whatever is drawn over them
    const n = Math.floor((w * h) / 240);
    for (let i = 0; i < n; i++) g.rect(x + beam + 2 + Math.floor(hash(i, 61) * (w - 2 * beam - 6)), y + 4 + Math.floor(hash(i, 67) * (h - beam - 8)), 2, 1, P.dark);
  }
  const post = (px, y0, y2) => {
    for (let i = 0; i < beam; i++) g.rect(px + i, y0, 1, y2 - y0, i === 0 ? W.dark : W.base);
  };
  const rail = (py, x0, x2) => {
    for (let i = 0; i < beam; i++) g.rect(x0, py + i, x2 - x0, 1, i === beam - 1 && beam > 1 ? W.dark : i === 0 ? W.light : W.base);
  };
  const postList = posts.map((q) => (Array.isArray(q) ? q : [q, y, y1]));
  const railList = rails.map((q) => (Array.isArray(q) ? q : [q, x, x1]));
  // shadows on the plaster: to the left of every post and under every rail
  for (const [px, y0, y2] of [...postList, [x1 - beam, y, y1]]) g.rect(px - 1, y0, 1, y2 - y0, P.dark);
  for (const [py, x0, x2] of railList) g.rect(x0, py + beam, x2 - x0, 1, P.dark);
  for (const [bx0, by0, bx1, by1] of braces) {
    g.limb(bx0, by0, bx1, by1, 2, W.base);
  }
  for (const [py, x0, x2] of railList) rail(py, x0, x2);
  for (const [px, y0, y2] of postList) post(px, y0, y2);
  rail(y1 - beam, x, x1);
  post(x, y, y1);
  post(x1 - beam, y, y1);
}

/**
 * Draws a plank door in its frame, shut or swinging inwards: as `open` goes from 0 to 1 each leaf turns on its hinge, gets narrower and darker, and shows the dark doorway with a strip of floor at the threshold.
 * Arguments: g: the Surface; { x, y, w, h, wood, open, leaves, hinge, frame, inside, floor, knob }: the box with its frame; wood: the door colour; open: 0 shut to 1 wide open;
 * leaves: 1, or 2 for a double door that parts in the middle; hinge: 'left' or 'right' (one leaf); frame: frame thickness in px (2); inside: the doorway colour; floor: the floor colour seen inside; knob: the handle colour (none when left out).
 * Returns the opening { x, y, w, h } inside the frame.
 */
export function plankDoor(g, { x, y, w, h, wood, open = 0, leaves = 1, hinge = 'left', frame = 2, inside, floor, knob }) {
  const W = ramp(wood);
  const dark = inside ?? mix(W.deep, INK, 0.5), ground = floor ?? W.dark;
  const ox = x + frame, oy = y + frame, ow = w - 2 * frame, oh = h - frame;
  // the frame: a lintel and two jambs
  g.rect(x, y, w, h, W.base);
  g.rect(x, y, 1, h, W.dark);
  g.rect(x + 1, y, w - 1, 1, W.light);                              // the top of the lintel looks up at the light
  const lw = ow / leaves, turn = clamp(open, 0, 1.1) * (75 * Math.PI / 180);
  const vis = open <= 0 ? lw : Math.max(2, lw * Math.cos(turn)), lift = lw * Math.sin(turn) * 0.4;
  const face = open < 0.3 ? { base: W.base, seam: W.dark, band: W.dark } : { base: W.dark, seam: W.deep, band: W.deep };
  const planks = Math.max(2, Math.round(lw / 4.5)), pw = lw / planks, step = lw / vis;
  const b0 = Math.round(oh * 0.2), b1 = Math.round(oh * 0.72), kn = Math.round(oh * 0.5);
  for (let py = oy; py < oy + oh; py++) for (let px = ox; px < ox + ow; px++) {
    const cx = px + 0.5, cy = py + 0.5;
    // the doorway: dark, with the floor showing in its lowest rows, narrower the further in it is
    const fr = oy + oh - py;                                      // 1 on the lowest row
    let c = fr <= 3 && px - ox >= fr - 1 && ox + ow - 1 - px >= fr - 1 ? ground : dark;
    for (let i = 0; i < leaves; i++) {
      const left = leaves === 2 ? i === 0 : hinge !== 'right';
      const d = left ? cx - ox : ox + ow - cx;
      if (d < 0 || d >= vis) continue;
      const s = d / vis, u = s * lw, ly = cy - oy + lift * s;
      if (ly >= oh) continue;
      const plank = Math.floor(u / pw), lyi = Math.floor(ly);
      c = face.base;
      if (open <= 0 && (lyi === 0 || px === ox + ow - 1)) c = face.seam;           // the frame's shadow on a shut door
      if ((lyi >= b0 && lyi < b0 + 2) || (lyi >= b1 && lyi < b1 + 2)) c = face.band;
      if (plank < planks - 1 && Math.floor((u + step) / pw) !== plank) c = face.seam;
      if (leaves === 2 && i === 0 && u + step >= lw) c = face.seam;                // where two shut leaves meet
      if (knob && u >= lw - 4 && u < lw - 2 && lyi >= kn && lyi < kn + 2) c = knob;
    }
    g.data[py * g.w + px] = col(c);
  }
  return { x: ox, y: oy, w: ow, h: oh };
}

/**
 * Draws a framed window with glazing bars: dark glass with a glint by day, or panes that glow from the middle outwards when `lit` is above 0 (the bars then show dark against the light).
 * Arguments: g: the Surface; { x, y, w, h, wood, glass, lit, glow, cols, rows, frame, sill }: the box with its frame; wood: the frame colour; glass: the unlit glass colour;
 * lit: 0 dark to 1 brightest (vary it over a loop for a flicker); glow: the light colour; cols, rows: panes across and down (2, 2); frame: frame thickness in px (2); sill: false leaves out the ledge drawn one row below the box.
 */
export function paneWindow(g, { x, y, w, h, wood, glass, lit = 0, glow, cols = 2, rows = 2, frame = 2, sill = true }) {
  const W = ramp(wood), G = ramp(glass);
  g.rect(x, y, w, h, W, { shade: 1 });
  const ix = x + frame, iy = y + frame, iw = w - 2 * frame, ih = h - 2 * frame;
  const on = lit > 0 && glow;
  const hot = on ? tone(glow, 1.2) : null, dim = on ? tone(glow, -0.7) : null;
  const barX = (k) => { for (let i = 1; i < cols; i++) if (k === Math.round((iw * i) / cols - 0.5)) return true; return false; };
  const barY = (k) => { for (let i = 1; i < rows; i++) if (k === Math.round((ih * i) / rows - 0.5)) return true; return false; };
  for (let j = 0; j < ih; j++) for (let i = 0; i < iw; i++) {
    let c;
    if (barX(i) || barY(j)) c = on ? W.dark : W.light;
    else if (on) {
      const d = Math.max(Math.abs(i + 0.5 - iw / 2) / (iw / 2), Math.abs(j + 0.5 - ih / 2) / (ih / 2));
      c = d < 0.15 + 0.5 * lit ? hot : d < 0.5 + 0.5 * lit ? glow : dim;
    } else {
      // the frame shades the top and left of the glass; a streak of sky crosses the upper panes
      c = j === 0 || i === 0 ? G.dark : (i + j === iw - 2 || i + j === iw - 3) && j < ih / 2 ? G.light : G.base;
    }
    g.data[(iy + j) * g.w + ix + i] = col(c);
  }
  if (sill) g.rect(x - 1, y + h, w + 2, 1, W.light);
}

/**
 * Tints the pixels of one colour within `r` px of a box, so a lit window or a lantern throws its light on the wall around it and on nothing else.
 * Arguments: g: the Surface; { x, y, w, h, r, over, colour, amount }: the box of the light; r: how far the light reaches in px; over: the wall colour to tint (only pixels of exactly this colour change); colour: the light colour; amount: how strong, 0 to 1 (0.45).
 */
export function lampGlow(g, { x, y, w, h, r = 2, over, colour, amount = 0.45 }) {
  const from = col(over), to = col(mix(over, colour, amount));
  const R = Math.ceil(r);
  for (let py = Math.max(0, y - R); py < Math.min(g.h, y + h + R); py++) for (let px = Math.max(0, x - R); px < Math.min(g.w, x + w + R); px++) {
    if (g.data[py * g.w + px] !== from) continue;
    const dx = Math.max(x - px, 0, px - (x + w - 1)), dy = Math.max(y - py, 0, py - (y + h - 1));
    if (dx * dx + dy * dy <= r * r) g.data[py * g.w + px] = to;
  }
}

/**
 * Draws a stone chimney stack with a wider cap, inked where it stands on the roof behind it. Returns { x, y }: the middle of its top, where smoke starts.
 * Arguments: g: the Surface; { x, y, w, h, stone, ink }: x: the middle of the stack; y: its top; w: its width (even); h: its height down to where it meets the roof; stone: its colour; ink: the line colour, or null.
 */
export function chimneyStack(g, { x, y, w, h, stone, ink = INK }) {
  const S = ramp(stone), x0 = x - w / 2, x1 = x + w / 2;
  const inside = (px, py) => (py >= y && py < y + 2 ? px >= x0 - 1 && px < x1 + 1 : py >= y + 2 && py < y + h && px >= x0 && px < x1);
  if (ink) inkOver(g, x0 - 1, y, x1 + 1, y + h, inside, ink);
  for (let py = y + 2; py < y + h; py++) for (let px = x0; px < x1; px++) {
    const row = py - y - 2, course = Math.floor(row / 4);
    let c = S.base;
    if (row % 4 === 3 || (px - x0 + (course % 2) * 3) % 6 === 2) c = S.dark;      // mortar: courses of stone with staggered joints
    if (row === 0) c = S.dark;                                                     // the cap's shadow
    if (px === x0) c = S.dark;
    else if (px === x1 - 1) c = S.light;
    g.dot(px, py, c);
  }
  g.rect(x0 - 1, y, w + 2, 1, S.light);
  g.rect(x0 - 1, y + 1, w + 2, 1, S.base);
  g.dot(x0 - 1, y + 1, S.dark);
  return { x, y };
}

/**
 * Draws smoke puffs rising from a chimney top in a loop that closes (engine/fx.js smoke with a chimney's settings); call it after the outline.
 * Arguments: g: the Surface; { t, x, y, colour, size, rise, drift, count, seed, cycles, box, minSize }: t: clip phase 0 to 1; x, y: the chimney top (as chimneyStack returns it); colour: the smoke colour; size: the biggest puff's radius;
 * rise: px a puff climbs; drift: px it moves sideways (negative: to the left); count: puffs; seed, cycles, box: as in engine/fx.js;
 * minSize: leaves out every wisp of smoke smaller than this many pixels, so a puff being born or fading is never a stray pixel (0, the default, draws them all; 4 is a good value).
 */
export function chimneySmoke(g, { t, x, y, colour, size = 3.5, rise = 14, drift = -4, count = 4, seed = 0, cycles = 1, box, minSize = 0 }) {
  const o = { t, x, y: y - 1, count, seed, loop: true, cycles, rise, drift, size, colour, box };
  if (!(minSize > 1)) { smoke(g, o); return; }
  // on a layer of its own, so a wisp is judged by the smoke it touches and not by the roof behind it
  const layer = new Surface(g.w, g.h);
  layer.shadow = g.shadow;
  smoke(layer, o);
  g.blit(despeckle(layer, minSize));
}

/**
 * Draws a picture sign hanging by two chains from an iron wall bracket, inked against the wall behind it; `swing` pushes its bottom edge sideways so it sways from the bracket.
 * Arguments: g: the Surface; { x, y, arm, side, drop, w, h, swing, iron, board, frame, picture, ink }: x, y: where the bracket meets the wall; arm: the bracket's length; side: 1 reaches right, -1 left; drop: chain length;
 * w, h: the board; swing: px the bottom edge moves (signed); iron, board, frame: the bracket, face and border colours; picture(s, cx, cy, w, h): draws the picture on Surface s around the face's middle (cx, cy), the face being w by h; ink: line colour or null.
 */
export function hangingSign(g, { x, y, arm = 10, side = 1, drop = 3, w = 11, h = 10, swing = 0, iron, board, frame, picture, ink = INK }) {
  const S = new Surface(g.w, g.h), F = ramp(frame);
  const shift = (below) => Math.round((swing * below) / (drop + h));
  const left = x + (side > 0 ? arm - w : -arm), top = y + 1 + drop;
  // the bracket: a wall plate, an arm with a turned-down end and a strut under it
  S.rect(x, y - 1, 1, 5, iron);
  S.rect(Math.min(x, x + side * arm), y, arm + 1, 1, iron);
  S.dot(x + side * arm, y + 1, iron);
  S.line(x + side, y + 3, x + side * 3, y + 1, iron);
  for (let i = 1; i <= drop; i++) { S.dot(left + 1 + shift(i), y + i, iron); S.dot(left + w - 2 + shift(i), y + i, iron); }
  // the board, row by row, each row pushed sideways by the swing
  const face = new Surface(g.w, g.h);
  face.rect(left, top, w, h, F.base);
  face.rect(left, top, w, 1, F.light);
  face.rect(left, top + h - 1, w, 1, F.dark);
  face.rect(left + 1, top + 1, w - 2, h - 2, board);
  if (picture) {
    const pic = new Surface(g.w, g.h);
    picture(pic, left + Math.floor(w / 2), top + Math.floor(h / 2), w - 2, h - 2);
    for (let py = top + 1; py < top + h - 1; py++) for (let px = left + 1; px < left + w - 1; px++) { const v = pic.get(px, py); if (v) face.data[py * g.w + px] = v; }
  }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const tx = left + i + shift(drop + 1 + j), ty = top + j;
    if (tx >= 0 && tx < g.w && ty >= 0 && ty < g.h) S.data[ty * g.w + tx] = face.data[(top + j) * g.w + left + i];
  }
  if (ink) {
    const c = col(ink);
    for (let py = 0; py < g.h; py++) for (let px = 0; px < g.w; px++) {
      if (S.data[py * g.w + px] || !g.data[py * g.w + px]) continue;
      if (S.get(px - 1, py) || S.get(px + 1, py) || S.get(px, py - 1) || S.get(px, py + 1)) g.data[py * g.w + px] = c;
    }
  }
  g.blit(S);
}

/**
 * How far open a door is at phase t of its opening clip: it creaks, gathers speed, swings a little too far and settles. Pass the result to plankDoor as `open`.
 * Arguments: t: clip phase, 0 to 1. Returns 0 (shut) to 1 (open), a little above 1 on the way.
 */
export function doorSwing(t) {
  return keys(t, [[0, 0], [0.2, 0.27], [0.6, 0.82], [0.8, 1.08], [1, 1]]);
}

/**
 * Draws a doorstep: one stone slab two rows deep on the ground line under a door, a little wider than the door and lit along its top.
 * Arguments: g: the Surface; { x, w, ground, stone, out }: x, w: the door's box with its frame; ground: the row the sprite's outline lands on (the slab is the two rows above it); stone: its colour; out: px it reaches past the door on each side (2).
 */
export function doorStep(g, { x, w, ground, stone, out = 2 }) {
  const S = ramp(stone);
  g.rect(x - out, ground - 2, w + 2 * out, 1, S.light);
  g.rect(x - out, ground - 1, w + 2 * out, 1, S.base);
}

/**
 * How bright a candle-lit window is at phase t of a looping night clip: it flickers between 0.56 and 1, two whole beats per loop so the loop closes, and each window on a beat of its own.
 * Arguments: t: clip phase, 0 to 1; beat: which window this is (0, 1, 2, ...): windows with different numbers flicker out of step.
 */
export function candleFlicker(t, beat = 0) {
  return 0.78 + 0.22 * wave(2 * t, beat * 0.37);
}

/**
 * Draws a window by day or by night: by day a plain paneWindow; at night its panes glow with a candle's flicker and the light falls on the wall round it (lampGlow), reaching further on the bright beats.
 * Arguments: g: the Surface; { x, y, w, h, wood, glass, glow, over, night, t, beat, sill, cols, rows, frame }: the box and colours as paneWindow takes them; over: the wall colour the light falls on; night: true lights it;
 * t: clip phase, 0 to 1; beat: which window this is, as candleFlicker takes it; sill, cols, rows, frame: as paneWindow. Returns how bright it is: 0 by day, up to 1 at night.
 */
export function litWindow(g, { x, y, w, h, wood, glass, glow, over, night = false, t = 0, beat = 0, sill = true, cols, rows, frame }) {
  const lit = night ? candleFlicker(t, beat) : 0;
  if (night && over) lampGlow(g, { x, y, w, h: h + (sill ? 1 : 0), r: lit > 0.8 ? 2 : 1, over, colour: glow });
  paneWindow(g, { x, y, w, h, wood, glass, lit, glow, cols, rows, frame, sill });
  return lit;
}

/**
 * The fixed colours and swatch lists of a timber-framed building, all from one palette: dark window glass, the doorway and the floor seen through it, and swatches for plaster and beams that never share a colour or a value.
 * Arguments: bundle: a palette key or alias ('hearthvale'); { dark, ground, plaster, timber, wall, beam }: dark: the palette colour the glass and doorway come from ('slate'); ground: the one the floor comes from ('path');
 * plaster, timber: material words for the two swatch lists (['stone', 'haze'], ['wood', 'roof']); wall, beam: the colour each list starts with ('cream', 'wood').
 * Returns a new { glass, doorway, floor, walls, beams }: three colours, then the swatch lists for the plaster and the beams (plaster 0.6 or lighter, beams 0.5 or darker).
 */
export function houseColours(bundle = 'hearthvale', { dark = 'slate', ground = 'path', plaster = ['stone', 'haze'], timber = ['wood', 'roof'], wall = 'cream', beam = 'wood' } = {}) {
  const P = palette(bundle);
  const named = (key) => {
    if (!P[key]) throw new Error(`buildings: "${key}" is not a ${paletteName(bundle)} colour`);
    return P[key];
  };
  return {
    glass: tone(named(dark), -0.5),
    doorway: mix(tone(named(dark), -1.6), INK, 0.35),
    floor: tone(named(ground), -1.2),
    walls: swatchesBetween(bundle, plaster, { lead: wall, min: 0.6 }),
    beams: swatchesBetween(bundle, timber, { lead: beam, max: 0.5 }),
  };
}

// ---- pieces laid over one another, and the stones of an arch (batch P04, fix round 1: wall torch, wooden door) ----
//
//   layOver(g, rectIn(12, 28, 8, 13), metal, { light: 1 });        // a wall plate
//   layOver(g, capsuleIn(15.5, 42, 16.5, 26, 1.5), wood);          // a handle over it: a line where it crosses the plate, none where it sticks out
//   g.outline(INK);                                                // the silhouette, once
//
//   const frame = archIn(x0, x1, top, spring, bottom, 4, 5);       // engine/shapes.js
//   g.blob([frame], stone, { shade: 2, light: 1 });
//   archStones(g, (x0 + x1) / 2, spring, (x1 - x0) / 2, spring - top, { depth: 5, colour: stone.dark, keystone: stone.light, clip: frame });

/**
 * Paints a piece over what is already drawn: it gets an ink line only where it covers something (inkOver) and none along the silhouette, which is left to the sprite's one outline at the end; returns the Surface.
 * Arguments: g: the Surface; inside: the piece's shape test (px, py); paint: a colour or a ramp, as g.fill takes it; opt: g.fill's options { shade, light, clip, outline }, and ink: the line colour (default the standard outline colour).
 * Draw from the back to the front. The whole Surface is searched, so the shape may lie anywhere on it.
 */
export function layOver(g, inside, paint, opt = {}) {
  inkOver(g, 0, 0, g.w, g.h, inside, opt.ink ?? INK);
  return g.fill(0, 0, g.w, g.h, inside, paint, opt);
}

/**
 * Draws the joints between the stones of an arch ring: straight lines square to the curve, an odd number of stones so that one sits on the crown, and if wanted a lit keystone there; returns how many stones the ring has.
 * Arguments: g: the Surface, with the ring already painted; cx, spring: the middle of the arch's springing line (the column, and the row the curve starts from); rx, ry: half the width of the opening and how high it rises over the springing line;
 * { depth, every, colour, keystone, keyWide, clip }: depth: how far the joints run out from the opening, in px (default 5); every: about how many px each stone takes along the curve (default 5; there are never fewer than five stones); colour: the joints' colour;
 * keystone: the colour of a keystone on the crown, `depth` rows tall, with a joint down each side from its second row (left out: none); keyWide: its width in px (default 4); clip: a shape test the joints stay inside (the ring's own shape, for example archIn grown by the frame's thickness).
 * Joints are drawn above the springing line only: the jambs below it take level joints, which the sprite draws.
 */
export function archStones(g, cx, spring, rx, ry, { depth = 5, every = 5, colour = INK, keystone = null, keyWide = 4, clip = null } = {}) {
  // 1.5625 is near PI / 2 (the curve is about that many times rx + ry long) and exact in binary, so a count never falls on a rounding edge
  const n = Math.max(5, Math.round(((rx + ry) * 1.5625) / every) | 1);
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / n;
    for (let r = 0; r <= depth; r += 0.5) {
      const x = Math.floor(cx + (rx + r) * Math.sin(a)), y = Math.floor(spring - (ry + r) * Math.cos(a));
      if (y < spring && (!clip || clip(x + 0.5, y + 0.5))) g.dot(x, y, colour);
    }
  }
  if (keystone) {
    const top = Math.round(spring - ry - depth), x = Math.round(cx - keyWide / 2);
    g.rect(x, top, keyWide, depth, keystone);
    g.rect(x - 1, top + 1, 1, depth - 1, colour);
    g.rect(x + keyWide, top + 1, 1, depth - 1, colour);
  }
  return n;
}
