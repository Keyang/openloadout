// Water helpers (added with batch R10: the Hearthvale shore). What a body of water needs, whoever draws it: its
// tones from one colour, a surface that moves, the line where it laps at a shore, and a pond, river or pool seen
// from above and in front, piece by piece, for a top-down tileset. Plus two things that go with water: a lily pad
// and a plank bridge. Pure functions: Node and browser, no Math.random; everything repeats every 32 px and closes
// over one loop. Worked example: sprites/tiles-shore.json.
//
//   import { waterTones, rippleFill, lapPaint, drawShore, wakeRing, lilyPad, plankBridge } from '../engine/water.js';
//   const W = waterTones(p.water, { foam: p.foam });                    // { body, shallow, light, dark, foam, froth }
//   const body = rippleFill(W.body, t, { light: W.light, count: 5 });   // a tile fill: streaks of light that swell and slide
//   const SHORE = { round: 9, cap: 2, face: 6, lip: [2, 1] };           // made once (a constant): its pieces are worked out once
//   drawShore(g, 'top', SHORE, { body, bank: (b) => (b.part === 'face' ? earth.dark : earth.light), lap: { foam: W.foam, shallow: W.shallow } }, t);
//   liquid.surface = (d, x, t) => lapPaint(d, x, t, { line: null, foam: W.foam, shallow: W.shallow });   // side view: under a liquid's line
//
// A shore in three-quarter view (the camera looks from the south, tilted down). The block's outline is the outer
// edge of the bank; outside it the tile is see-through, so the ground under it shows. Inside it, from the land in:
//   the bank    a cap of `cap` rows under land that lies to the north, with a face of `face` rows hanging under the
//               cap (you look at the north bank's side); to the west, east and south only a lip, `lip` px wide
//   the line    one row of ink on the waterline: water blocks the way
//   the lap     shallow water and a foam line that moves out and back (lapPaint); `laps` gives each shore its own
//               (a south shore, whose waterline is hidden behind its lip, usually gets no foam)
//   the body    the fill
// Every pixel is worked out from where the land is round it, so a bank's face follows a rounded corner, ends in a
// clean line where the land turns a corner, and pieces of one block join in every arrangement a block allows.
// One limit comes from the 20 pieces themselves: a piece with land on one or more sides does not know its diagonal
// neighbours, so where a stream one tile wide bends or forks, the bank at the inside of the bend is not closed by
// its corner piece. Give `thin` profiles that are 0 at both ends (the lip then runs out at every tile corner, and
// the waterlines of the two tiles meet corner to corner); a north bank's face simply ends there.
//
// Styles: these paint flat pixels, which suits the pixel style; a smooth style would want its own shoreline.

import { INK, tone, mix, ramp, col } from './color.js';
import { TAU, hash, fract, clamp } from './motion.js';
import { textureLight, textureTone, pickPiece, pieceOf } from './tiles.js';

const TILE = 32, M = TILE - 1;
const wrap = (v) => ((Math.round(v) % TILE) + TILE) % TILE;

/**
 * The tones of a body of water from one colour: { body, shallow, light, dark, foam, froth }, the body a step darker than the colour so that it stands apart from the ground round it by value under every look.
 * Arguments: colour (the water's colour, '#rrggbb': it becomes the shallows); options { foam (the foam's colour, default cream), depth (how much darker the body is, in steps of tone(); default 0.7) }. light and dark are the tones for marks in the body that no whole-bundle look merges with it; froth is foam thinned with water.
 */
export function waterTones(colour, { foam = '#f0ead8', depth = 0.7 } = {}) {
  const body = tone(colour, -Math.max(0, depth));
  return { body, shallow: colour, light: textureLight(body), dark: textureTone(body), foam, froth: mix(foam, colour, 0.5) };
}

/**
 * A moving water surface as a tile fill: level streaks of light that swell, slide and fade on their own timers over one colour, wrapping round the tile's edges and closing over one loop; returns fill(x, y).
 * Arguments: base (the water's colour); t (clip phase 0..1); options { light (the streaks' colour), dark (a colour for every third streak, a trough; left out: all light), count (streaks in a tile, default 5), length (px of the longest, default 6), stir (px a streak slides in its life, default 2), seed, tips (a colour for the leading pixel of every full-grown streak, where it catches the sun; left out: none), glints ([[x, y, when, size]]: twinkles that flash at phase `when`, size 1 a plus, 2 a big plus), glint (their colour, default white) }.
 */
export function rippleFill(base, t, { light = '#ffffff', dark = null, count = 5, length = 6, stir = 2, seed = 0, tips = null, glints = [], glint = '#ffffff' } = {}) {
  const px = new Uint32Array(TILE * TILE).fill(col(base));
  const put = (x, y, c) => { px[wrap(y) * TILE + wrap(x)] = col(c); };
  const n = Math.max(0, Math.round(count));
  const start = hash(seed, 9);
  for (let i = 0; i < n; i++) {
    // each streak lives three quarters of the loop: it swells from nothing to its length and back, sliding as it goes
    const life = fract(t + hash(i, seed * 7 + 3));
    const full = Math.max(2, length * (0.6 + 0.4 * hash(i, seed + 11)));
    const len = life < 0.75 ? Math.round(full * Math.sin((Math.PI * life) / 0.75)) : 0;
    if (len < 2) continue;
    // rows evenly down the tile, columns a golden step apart: no two streaks line up, and the field has no blotch
    const y = Math.round(((i + 0.5) * TILE) / n + (hash(i, seed + 5) - 0.5) * (TILE / n) * 0.4);
    const x = Math.round(fract(i * 0.618034 + start) * TILE + stir * life - len / 2);
    const c = dark && i % 3 === 2 ? dark : light;
    for (let k = 0; k < len; k++) put(x + k, y, c);
    if (tips && c === light && len >= 4) put(x + len - 1, y, tips);
    if (i % 3 === 0 && len >= 5) for (let k = 0; k < len - 3; k++) put(x + 2 + k, y + 2, c);     // a second, shorter line under it
  }
  for (const [gx, gy, when = 0, big = 1] of glints) {
    const life = fract(t - when);
    const size = life < 0.125 ? big : life < 0.25 ? 1 : life < 0.375 || life >= 0.875 ? 0 : -1;
    if (size < 0) continue;
    for (let k = 1; k <= size; k++) { put(gx - k, gy, glint); put(gx + k, gy, glint); put(gx, gy - k, glint); put(gx, gy + k, glint); }
    put(gx, gy, size ? '#ffffff' : glint);
  }
  return (x, y) => px[wrap(y) * TILE + wrap(x)];
}

/**
 * The colour of one pixel of water lapping at a shore: a line on the waterline, then shallow water with a foam line that moves out and back and breaks into pieces, or null further in, where the deep water shows.
 * Arguments: k (px inside the waterline: 0 is the line itself; with line null, 0 is the first row of water); u (px along the shore: the pattern repeats every 32); t (clip phase 0..1); options { line (the waterline's colour, default the outline colour; null for none), foam (the foam's colour; null for no foam), froth (the foam's thin ends, default the foam), shallow (the shallow water's colour; null for none), reach (px the foam moves out from the shore, default 2), rows (rows of shallow water, default 2; one more here and there), gaps (0..1, the share of the foam line that is broken, default 0.35), waves (how many foam waves lie along 32 px, default 2), seed }.
 */
export function lapPaint(k, u, t, { line = INK, foam = '#f0ead8', froth = foam, shallow = null, reach = 2, rows = 2, gaps = 0.35, waves = 2, seed = 0 } = {}) {
  k = Math.round(k);
  if (line) { if (k === 0) return line; k -= 1; }
  if (k < 0) return null;
  const s = hash(seed, 31), v = wrap(u) / TILE;
  if (foam) {
    // the foam line: nearest the shore at one moment of the loop, `reach` px out half a loop later, a wave along the shore
    const out = Math.round(Math.max(0, reach) * (0.5 - 0.5 * Math.cos(TAU * (t + Math.round(waves) * v + s))));
    if (k === out) {
      // broken where two slow waves along the shore cancel; the breaks drift as the clip runs
      const w = Math.sin(TAU * (3 * v + s * 5)) + 0.7 * Math.sin(TAU * (5 * v - t + s * 3));
      const cut = (2 * clamp(gaps) - 1) * 1.3;
      if (w > cut + 0.35) return foam;
      if (w > cut) return froth;
    }
  }
  const deep = Math.max(0, Math.round(rows)) + (Math.sin(TAU * (4 * v + s * 7)) > 0.3 ? 1 : 0);
  return shallow && k < deep ? shallow : null;
}

// ---- a pond, river or pool seen from above and in front ---------------------------------------------------------

// Which sides of each block piece have land beyond them, and which lone diagonal an inner corner has. Asked of the
// tile helper's own picker, so the two cannot disagree.
const LAND = (() => {
  const out = {};
  for (let m = 0; m < 16; m++) {
    const N = !!(m & 1), E = !!(m & 2), S = !!(m & 4), W = !!(m & 8);
    const water = (x, y) => !((x === 0 && y === -1 && N) || (x === 1 && y === 0 && E) || (x === 0 && y === 1 && S) || (x === -1 && y === 0 && W));
    out[pickPiece(water, 0, 0)] = { N, E, S, W, inner: null };
  }
  for (const [name, dx, dy] of [['tl', -1, -1], ['tr', 1, -1], ['bl', -1, 1], ['br', 1, 1]]) {
    out[pickPiece((x, y) => !(x === dx && y === dy), 0, 0)] = { N: false, E: false, S: false, W: false, inner: name };
  }
  return out;
})();

const OUT = 0, CAP = 1, FACE = 2, LIP = 3, LINE = 4, LAP = 5, BODY = 6;
const PART = ['outside', 'cap', 'face', 'lip', 'line', 'lap', 'body'];
const SIDE = ['n', 'e', 's', 'w'];
const maps = new WeakMap();
const profile = (p) => (u) => { u = wrap(u); const v = !p ? 0 : typeof p === 'function' ? p(u) : p[u] ?? 0; return Math.max(0, Math.min(Math.round(v), u, M - u)); };
const share = (p) => (u) => { const v = !p ? 1 : typeof p === 'function' ? p(wrap(u)) : p[wrap(u)] ?? 1; return clamp(v); };

/**
 * Works out what every pixel of one piece of a pond, river or pool is, seen from above and in front: outside the outline, the bank's cap, its face, a lip, the waterline, lapping water or open water. Returns { part, a, b, side }, four lists of 1024 numbers (row by row), kept per spec, so a piece is worked out once.
 * Arguments: piece (a name from BLOCK_PIECES or NARROW_PIECES, or a whole clip name); spec (an object made once and passed every time: { round (0..14: radius of the outer corners, default 9), cap (rows of bank top under land to the north, default 2), face (rows of bank face under the cap, default 5), lip ([px to the sides, px at a south shore] of bank top, default [2, 1]), thin ({ h, v }: lists of 32 shares 0..1, or functions of the position, by which the south lip (h, along x) and the side lips (v, along y) are narrower: 0 at both ends closes the bends of a stream one tile wide), inset ({ top, bottom, left, right }: lists of 32 px, or functions, by which the outline is pulled in; pinned to the tile boundary at both ends of every edge), lap (how many px of water from the waterline are marked as lapping, default 5) }). In the result part is 0 outside, 1 cap, 2 face, 3 lip, 4 waterline, 5 lap, 6 body; a is px from the land (cap, lip), the row of the face from its top (face), or px from the waterline (lap; 1 the first); b is rows of face under this one (face) or px along the shore (lap); side is 0 north, 1 east, 2 south, 3 west: where the land or the shore lies.
 */
export function shoreMap(piece, spec = {}) {
  const name = LAND[piece] ? piece : /^fill-[b-z]$/.test(piece) ? 'fill' : pieceOf(piece)?.piece?.replace(/^fill-[b-z]$/, 'fill');
  const L = LAND[name];
  if (!L) throw new Error(`shoreMap: "${piece}" is not a block piece (${Object.keys(LAND).join(', ')})`);
  let made = maps.get(spec);
  if (!made) maps.set(spec, made = new Map());
  if (made.has(name)) return made.get(name);

  const R = Math.min(14, Math.max(0, Number(spec.round ?? 9) || 0));
  const cap = Math.max(0, Math.round(spec.cap ?? 2)), face = Math.max(0, Math.round(spec.face ?? 5));
  const [lx, ly] = spec.lip ?? [2, 1];
  const thinH = share(spec.thin?.h), thinV = share(spec.thin?.v);
  const iN = profile(spec.inset?.top), iS = profile(spec.inset?.bottom), iW = profile(spec.inset?.left), iE = profile(spec.inset?.right);
  const reach = Math.max(1, Math.round(spec.lap ?? 5));
  const P = Math.max(cap + face, lx, ly) + reach + 3, S = TILE + 2 * P;

  // where the land is: this tile inside its outline is water; a side with land has land all along it; a corner cell
  // has land when a side beside it has (the land carries straight on) or when it is the piece's inner corner
  const corner = (cx, cy) => (cy < 0 ? L.N : L.S) || (cx < 0 ? L.W : L.E) || L.inner === `${cy < 0 ? 't' : 'b'}${cx < 0 ? 'l' : 'r'}`;
  const isLand = (x, y) => {
    const cx = x < 0 ? -1 : x > M ? 1 : 0, cy = y < 0 ? -1 : y > M ? 1 : 0;
    if (cx && cy) return corner(cx, cy);
    // under an inner corner the north bank runs one column on into this tile, so that its end is this piece's to
    // draw (the bank's last column, then the line that closes it) and the two tiles join on bank, not on a line
    if (cy < 0 && !cx && ((L.inner === 'tl' && x === 0) || (L.inner === 'tr' && x === M))) return true;
    if (cy) return (cy < 0 ? L.N : L.S) || (L.W && x < iW(y)) || (L.E && M - x < iE(y));
    if (cx && (cx < 0 ? L.W : L.E)) return true;
    const rN = L.N ? y + 0.5 - iN(x) : 1e9, rS = L.S ? M - y + 0.5 - iS(x) : 1e9;
    if (cx) return rN < 0 || rS < 0;                          // a neighbour along a straight shore: its outline carries on
    const rW = L.W ? x + 0.5 - iW(y) : 1e9, rE = L.E ? M - x + 0.5 - iE(y) : 1e9;
    if (rN < 0 || rS < 0 || rW < 0 || rE < 0) return true;
    if (R) for (const [p, q] of [[rN, rW], [rN, rE], [rS, rW], [rS, rE]]) if (p < R && q < R && R - Math.hypot(R - p, R - q) < 0) return true;
    return false;
  };
  const land = new Uint8Array(S * S), kind = new Uint8Array(S * S), da = new Uint8Array(S * S), db = new Uint8Array(S * S), ds = new Uint8Array(S * S);
  const at = (x, y) => (y + P) * S + x + P;
  const inside = (x, y) => x >= -P && y >= -P && x < TILE + P && y < TILE + P;
  for (let y = -P; y < TILE + P; y++) for (let x = -P; x < TILE + P; x++) land[at(x, y)] = isLand(x, y) ? 1 : 0;
  const landAt = (x, y) => inside(x, y) && land[at(x, y)] === 1;

  // the bank: lips beside and above land, then the cap and the face under land that lies to the north
  for (let y = -P; y < TILE + P; y++) for (let x = -P; x < TILE + P; x++) {
    const i = at(x, y);
    if (land[i]) continue;
    kind[i] = BODY;
    let up = 0;
    for (let k = 1; k <= cap + face; k++) if (landAt(x, y - k)) { up = k; break; }
    if (up && up <= cap) { kind[i] = CAP; da[i] = up; ds[i] = 0; continue; }
    const wide = Math.round(lx * thinV(y)), tall = Math.round(ly * thinH(x));
    let lip = 0, side = 0;
    for (let k = 1; k <= Math.max(wide, tall) && !lip; k++) {
      if (k <= wide && landAt(x - k, y)) { lip = k; side = 3; } else if (k <= wide && landAt(x + k, y)) { lip = k; side = 1; } else if (k <= tall && landAt(x, y + k)) { lip = k; side = 2; }
    }
    if (lip) { kind[i] = LIP; da[i] = lip; ds[i] = side; continue; }
    if (up) { kind[i] = FACE; da[i] = up - cap; }
  }
  const bank = (x, y) => { if (!inside(x, y)) return false; const k = kind[at(x, y)]; return land[at(x, y)] === 1 || k === CAP || k === FACE || k === LIP; };
  // rows of face under each face pixel (0: it stands on the waterline)
  for (let x = -P; x < TILE + P; x++) for (let y = TILE + P - 1; y >= -P; y--) {
    const i = at(x, y);
    if (kind[i] === FACE) db[i] = inside(x, y + 1) && kind[at(x, y + 1)] === FACE ? Math.min(255, db[at(x, y + 1)] + 1) : 0;
  }
  // the waterline: water that touches the bank or the land
  const lines = [];
  for (let y = -P + 1; y < TILE + P - 1; y++) for (let x = -P + 1; x < TILE + P - 1; x++) {
    const i = at(x, y);
    if (kind[i] !== BODY) continue;
    if (bank(x, y - 1)) { lines.push([i, 0]); } else if (bank(x - 1, y)) { lines.push([i, 3]); } else if (bank(x + 1, y)) { lines.push([i, 1]); } else if (bank(x, y + 1)) { lines.push([i, 2]); }
  }
  for (const [i, s] of lines) { kind[i] = LINE; ds[i] = s; }
  // the lap: how far each pixel of water is from the waterline, which shore it belongs to and how far along it
  const offsets = [];
  for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) { const d = Math.hypot(dx, dy); if (d > 0 && d <= reach + 0.5) offsets.push([dx, dy, d]); }
  offsets.sort((p, q) => p[2] - q[2] || Math.abs(q[1]) - Math.abs(p[1]));
  const part = new Uint8Array(TILE * TILE), a = new Uint8Array(TILE * TILE), b = new Uint8Array(TILE * TILE), side = new Uint8Array(TILE * TILE);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const i = at(x, y), o = y * TILE + x;
    if (land[i]) { part[o] = OUT; continue; }
    part[o] = kind[i]; a[o] = da[i]; b[o] = db[i]; side[o] = ds[i];
    if (kind[i] !== BODY) continue;
    for (const [dx, dy, d] of offsets) {
      const j = at(x + dx, y + dy);
      if (kind[j] !== LINE) continue;
      const level = Math.abs(dy) >= Math.abs(dx);                  // the shore runs across the screen here
      part[o] = LAP; a[o] = Math.max(1, Math.round(d)); side[o] = ds[j];
      b[o] = level ? wrap(x) : wrap(y);
      break;
    }
  }
  const map = { part, a, b, side };
  made.set(name, map);
  return map;
}

/**
 * Draws one piece of a pond, river or pool on a 32x32 Surface, seen from above and in front: see-through outside the outline, a bank with a face along the north shore and a lip elsewhere, an ink waterline, water lapping with foam, and the body.
 * Arguments: g (the Surface); piece (a name from BLOCK_PIECES or NARROW_PIECES, or a whole clip name); spec (the geometry, as shoreMap takes it: make it once); paints: { body(x, y) (the colour of open water, such as rippleFill gives), bank(b) (the colour of a bank pixel: b is { part: 'cap' | 'face' | 'lip', d (px from the land, or the row of the face from its top, 1 the first), under (rows of face below this one), side ('n', 'e', 's', 'w': where the land lies), x, y }), line (the waterline's colour, default the outline colour), lap (the options of lapPaint, without `line`), laps ({ n, e, s, w }: options that replace `lap`'s for the shore on that side, for example { s: { foam: null } }) }; t (the clip phase 0..1). Returns g.
 */
export function drawShore(g, piece, spec, paints, t = 0) {
  const m = shoreMap(piece, spec);
  const line = paints.line === undefined ? INK : paints.line;
  const laps = SIDE.map((s) => ({ ...(paints.lap ?? {}), ...(paints.laps?.[s] ?? {}), line: null }));
  const info = { part: '', d: 0, under: 0, side: 'n', x: 0, y: 0 };
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const o = y * TILE + x, k = m.part[o];
    if (k === OUT) continue;
    let c = null;
    if (k === CAP || k === FACE || k === LIP) {
      info.part = PART[k]; info.d = m.a[o]; info.under = m.b[o]; info.side = SIDE[m.side[o]]; info.x = x; info.y = y;
      c = paints.bank ? paints.bank(info) : null;
    } else if (k === LINE) c = line;
    else if (k === LAP) c = lapPaint(m.a[o] - 1, m.b[o] + (m.side[o] % 2 ? 11 : 0), t, laps[m.side[o]]);
    g.dot(x, y, c ?? paints.body(x, y));
  }
  return g;
}

// ---- things on the water ---------------------------------------------------------------------------------------

/**
 * A broken ring of light on the water round something that stands in it or floats on it (a rock, a post, a lily pad): arcs of an ellipse that swell out and close in once per loop.
 * Arguments: g (the Surface); o: { x, y (centre), rx, ry (radii when it is closest in), t (clip phase), grow (px it swells out, default 1), colour, gaps (0..1 share of the ring left open, default 0.4), seed, front (true: only the half nearer the camera, below the centre) }.
 */
export function wakeRing(g, { x, y, rx, ry, t = 0, grow = 1, colour = '#ffffff', gaps = 0.4, seed = 0, front = false }) {
  const k = Math.round(Math.max(0, grow) * (0.5 - 0.5 * Math.cos(TAU * t)));
  const ax = rx + k, ay = ry + k, steps = Math.max(12, Math.ceil(TAU * Math.max(ax, ay) * 1.5));
  const SECT = 12;
  for (let i = 0; i < steps; i++) {
    const ang = (i / steps) * TAU;
    if (front && Math.sin(ang) < 0.1) continue;
    if (hash(Math.floor((ang / TAU) * SECT), seed * 13 + 5) < gaps) continue;
    g.dot(Math.floor(x + Math.cos(ang) * ax), Math.floor(y + Math.sin(ang) * ay), colour);
  }
  return g;
}

/**
 * Draws a lily pad lying on water, seen from above and in front: a flat round leaf with a wedge cut out of it, lit along its far right rim and dark along its near left one, with veins and an optional flower; returns its shape test.
 * Arguments: g (the Surface); x, y (centre); rx, ry (half its width and height on screen); colour (the leaf); options { notch (the angle the wedge opens at, radians: 0 right, PI / 2 towards the camera; default -0.6), flower (a petal colour for a small open flower on the pad, or null), heart (the colour of the flower's middle, default yellow) }. It has no outline: a pad lies flat.
 */
export function lilyPad(g, x, y, rx, ry, colour, { notch = -0.6, flower = null, heart = '#f2c230' } = {}) {
  const L = ramp(colour);
  const cut = (px, py) => { const d = Math.atan2((py - y) / ry, (px - x) / rx) - notch; return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) < 0.32 && (px - x) ** 2 + (py - y) ** 2 > 1.5; };
  const pad = (px, py) => ((px - x) / rx) ** 2 + ((py - y) / ry) ** 2 <= 1 && !cut(px, py);
  // the thickness of the leaf shows as one dark row under its near edge
  g.fill(x - rx - 1, y - ry - 1, x + rx + 1, y + ry + 2, (px, py) => pad(px, py - 1), L.deep);
  g.fill(x - rx - 1, y - ry - 1, x + rx + 1, y + ry + 1, pad, { base: L.base, dark: L.dark, light: L.light }, { shade: 1, light: 1 });
  // veins from the middle towards the rim
  const far = Math.max(rx, ry);
  for (const ang of [notch + 1.3, notch + 2.6, notch - 1.5]) {
    for (let k = 2; k < far; k++) {
      const vx = Math.floor(x + Math.cos(ang) * k * (rx / far) * 0.8), vy = Math.floor(y + Math.sin(ang) * k * (ry / far) * 0.8);
      if (pad(vx + 0.5, vy + 0.5) && pad(vx + 1.5, vy - 0.5) && pad(vx - 0.5, vy + 1.5)) g.dot(vx, vy, L.dark);
    }
  }
  if (flower) {
    const F = ramp(flower), fx = Math.round(x - rx * 0.35), fy = Math.round(y - ry * 0.2);
    g.rect(fx - 1, fy - 2, 3, 1, F.light); g.rect(fx - 2, fy - 1, 5, 1, F.base); g.rect(fx - 1, fy, 3, 1, F.dark);
    g.dot(fx - 2, fy - 1, F.light); g.dot(fx + 2, fy - 1, F.dark);
    g.dot(fx, fy - 1, heart);
  }
  return pad;
}

/**
 * Draws one tile of a plank bridge that repeats along its length, seen from above and in front, see-through beside it so the water under it shows: boards with seams and nails between two beams, and for a bridge that runs across the screen its near side as a face.
 * Arguments: g (a 32x32 Surface); run ('h': the bridge runs left to right; 'v': it runs up the screen); wood (its colour); options { from, to (the first and last row, or column for 'v', of the bridge, default 4 and 28), board (px from seam to seam, a divisor of 32, default 8), face (px of side face under a bridge that runs left to right, default 3), ink (the colour of the lines along its two long sides, default the outline colour; null for none), nails (false: none) }.
 */
export function plankBridge(g, run, wood, { from = 4, to = 28, board = 8, face = 3, ink = INK, nails = true } = {}) {
  const R = ramp(wood);
  const along = run === 'v';
  const put = (p, q, c) => (along ? g.dot(q, p, c) : g.dot(p, q, c));       // p: along the bridge, q: across it
  const f = along ? 0 : Math.max(0, Math.round(face));
  const deckA = from + (ink ? 1 : 0), faceB = to - (ink ? 1 : 0), deckB = faceB - f;
  const under = mix(R.dark, INK, 0.4);                                      // the side face, in the bridge's own shade
  for (let p = 0; p < TILE; p++) {
    const seam = p % board === board - 1;
    for (let q = deckA; q <= deckB; q++) {
      let c = R.base;
      if (q < deckA + 2 || q > deckB - 2) {
        // the two beams the boards are nailed to: lit along the side the light comes from (the top, or the right)
        c = (along ? q === deckB || q === deckA + 1 : q === deckA || q === deckB - 1) ? R.light : R.dark;
      } else if (seam) c = R.dark;
      else if (p % board === 0) c = R.light;                                  // each board catches the light along one edge
      put(p, q, c);
    }
    for (let q = deckB + 1; q <= faceB; q++) put(p, q, q === deckB + 1 ? R.dark : under);
    if (ink) { put(p, from, ink); put(p, to, ink); }
    if (nails && p % board === Math.floor(board / 2)) { put(p, deckA + 3, R.dark); put(p, deckB - 3, R.dark); }
  }
  return g;
}
