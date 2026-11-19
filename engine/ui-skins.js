// Interface skins (added with batch H2, bundles/specs/core-sprites-2.md): the partner of engine/ui.js and
// engine/ui-wood.js for menus in four more looks, and the small controls of a settings screen.
//
//   import { skinPanel, skinButton, skinTab, skinBarHousing, skinBarFill, skinCheck, skinPointer, SKIN_TEXT } from '../engine/ui-skins.js';
//   const { text, edge } = skinButton(g, 1, 1, 94, 30, clip, 'candy', { style: p.style, face: p.face, frame: p.frame, border: p.border, corner: p.corner, shine: p.shine });
//   const box = skinPanel(g, 1, 1, 94, 62, 'paper', { face: p.face, frame: p.frame, accent: p.accent, extras: p.pins, title: 11 });
//   const o = skinBarHousing(g, 1, 1, 62, 14, 'gilded', { frame: p.frame, accent: p.accent, caps: 4, extras: p.gems });
//   skinBarFill(g, o, 1, 'gilded', { fill: p.fill });
//   textArea: (clip, p) => ({ ...text, text: SKIN_TEXT.candy, edge })   // the helpers name the edge pixel to check
//
// THE SKINS (UI_SKINS, SKIN_STYLES), each drawn by depth from its outline inwards:
//   paper    1 px INK · a ruled line of the frame colour (the ink of the rules, 1 to 2 px) · 1 px paper · a second
//            1 px rule · the paper. No bevel, dark text (SKIN_TEXT.paper is INK). Its darker pieces (a list well, an
//            inactive tab) add a 1 px INK line under the top and right rules, the well's sunken edge.
//            sheet (plain), torn (2 px bites along every side, in the corners), card (the top right corner folded
//            down, a 2 px card edge along the bottom). Extras: an inked pin at each top corner.
//   candy    1 px INK · the pale sugar rim (lit along the top and right, darker along the bottom and left) · 1 px INK ·
//            the boiled-sugar face, white text. jelly (a glossy band inside the top rim), striped (diagonal stripes,
//            3 px apart, in the rim's corners), frosted (the top rim iced, icing drips in the top corners). The
//            highlight bubble comes only from opt.shine. Extras: sprinkles in the rim.
//   flat     1 px INK · the band (1 to 2 px, unlit) · the face, white text. solid, outline (the band set 1 px in
//            from the ink), pill (round ends on buttons, knobs and switches; 4 px corners on panels). Hover
//            brightens the band. No extras. A flat panel's `accent` is its focus line: 2 px under the heading,
//            along the top of a list well and along a tooltip's top.
//   gilded   1 px INK · the gold band (lit top and right, dark bottom and left) · 1 px INK · the dark stone face,
//            white text. temple (cut corners, a key pattern of 1 px steps in the band's corners), royal (round
//            corners, three-dot scrolls in the corners), ruin (chipped corners, two short cracks). Extras: a 3x3
//            gem of the accent in each corner (on a bar housing, on each end cap).
//
// STRETCHING. Everything that is not flat lies in the four CORNER ZONES: outside the columns and outside the rows
// of the flat middle (`inner`, or a button's `text`). The rings of the slab are the same all along each side, so
// every column between the left and right slice is the same column and every row between the top and bottom
// slice the same row: a panel nine-slices with SLICE (8) once the frame's 1 px empty border is added
// (`slice` is at most 7 from the rectangle given). Patterns that would change along a side (stripes, the key
// pattern, bites, drips, sprinkles, pins, gems) are kept in the corner zones for that reason. Exceptions, each
// returning the slice it really needs: a pressed button (bottom 5), a flat pill button (its round ends, 10 to 12 px)
// and a bar housing with caps (see skinBarHousing).
//
// CONTRAST (style guide section 8). White-text skins lighten the face on hover by at most tone(face, 0.1), never
// tone(face, 0.85) as `button` of engine/ui.js does (that puts white text at about 2 to 1 on every dark face), and
// brighten the band instead. Paper darkens a well or an inactive tab by at most tone(face, -0.5). Disabled pieces
// lose all colour (INK included) and keep the band apart from the face. Pick swatches with skinSwatches.
// Every piece names `edge`, a pixel of its band (or of the well's sunken line) to give textArea as `edge`.

import { Surface, ellipseIn, polyIn } from './surface.js';
import { ramp, tone, mix, brightness, rgbToHex, col, INK } from './color.js';
import { pulse } from './motion.js';
import { roundRectIn, cutRectIn, cornerPx, borderPx, desaturate, worstContrast, SLICE, EDGE, LIP, BUTTON_STATES } from './ui.js';
import { crack } from './rock.js';

/** The four interface skins this module draws: paper, candy, flat and gilded. No arguments: a frozen list. */
export const UI_SKINS = Object.freeze(['paper', 'candy', 'flat', 'gilded']);

/** The styles of each skin, as { paper: [sheet, torn, card], candy: [jelly, striped, frosted], flat: [solid, outline, pill], gilded: [temple, royal, ruin] }. No arguments: a frozen object. */
export const SKIN_STYLES = Object.freeze({
  paper: Object.freeze(['sheet', 'torn', 'card']),
  candy: Object.freeze(['jelly', 'striped', 'frosted']),
  flat: Object.freeze(['solid', 'outline', 'pill']),
  gilded: Object.freeze(['temple', 'royal', 'ruin']),
});

/** The text colour each skin's text areas are made for: paper INK (dark text on pale paper), the others white. No arguments: a frozen object. */
export const SKIN_TEXT = Object.freeze({ paper: INK, candy: '#ffffff', flat: '#ffffff', gilded: '#ffffff' });

// The first colour of each skin's lists in the specification: what a piece draws when a colour is left out.
const DEFAULTS = {
  paper: { face: '#f0ead8', frame: '#3f5068', accent: '#c9423a' },   // cream, cavern, crimson
  candy: { face: '#7a4f33', frame: '#f0ead8', accent: '#4fd8ee' },   // soil, cream, magic
  flat: { face: '#3f5068', frame: '#f0ead8', accent: '#4fd8ee' },    // cavern, cream, magic
  gilded: { face: '#3f5068', frame: '#f0ead8', accent: '#4fd8ee' },  // cavern, cream (pale gold leaf), magic
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const hexOf = (v) => rgbToHex(v & 255, (v >>> 8) & 255, (v >>> 16) & 255);

function checkSkin(fn, skin, style) {
  if (!UI_SKINS.includes(skin)) throw new Error(`${fn}: skin "${skin}" is not one of ${UI_SKINS.join(', ')}`);
  const st = style ?? SKIN_STYLES[skin][0];
  if (!SKIN_STYLES[skin].includes(st)) throw new Error(`${fn}: style "${st}" is not one of ${SKIN_STYLES[skin].join(', ')} (skin ${skin})`);
  return st;
}

/**
 * Every colour a skin draws, worked out from the three a sprite gives: returns { face, faceLight, faceDark, band, bandLight, bandDark, lip, trough, accent, accentDark, text }.
 * Arguments: skin (one of UI_SKINS); options { face, frame, accent (colours; default the first of the skin's lists), style, state ('normal', 'hover': paper one tone lighter, the others at most tone(face, 0.1) with a brighter band, 'pressed', 'disabled': no colour) }.
 */
export function skinTones(skin, { face, frame, accent, style, state = 'normal' } = {}) {
  checkSkin('skinTones', skin, style);
  if (!BUTTON_STATES.includes(state)) throw new Error(`skinTones: state "${state}" is not one of ${BUTTON_STATES.join(', ')}`);
  const D = DEFAULTS[skin];
  const F = face ?? D.face, R = frame ?? D.frame, A = accent ?? D.accent;
  const hover = state === 'hover', off = state === 'disabled';
  let T;
  if (skin === 'paper') {
    const f = hover ? tone(F, 0.85) : F;
    // disabled rules are a little darker, so the grey rule still stands 3 to 1 off the grey paper
    const rule = off ? tone(R, -0.5) : R;
    T = { face: f, faceLight: tone(f, 0.85), faceDark: tone(f, -0.5), band: rule, bandLight: rule, bandDark: tone(rule, -1), lip: mix(INK, R, 0.35), trough: F };
  } else {
    const f = hover ? tone(F, 0.1) : F;
    // hover and disabled brighten the band: the pale band then keeps 3 to 1 off the lighter (or greyed) face
    const band = hover ? tone(R, 0.45) : off ? tone(R, 0.3) : R;
    const flat = skin === 'flat';
    T = {
      face: f, faceLight: tone(f, 0.45), faceDark: tone(f, -1),
      band, bandLight: flat ? band : hover ? mix(tone(R, 0.85), '#ffffff', 0.4) : tone(R, 0.85),
      bandDark: flat || off ? band : skin === 'gilded' ? tone(R, -1) : tone(R, -0.5),
      lip: flat ? tone(F, -1) : tone(R, -1), trough: mix(F, INK, 0.55),
    };
  }
  T.accent = A; T.accentDark = tone(A, -1); T.text = SKIN_TEXT[skin];
  if (off) for (const k of Object.keys(T)) if (k !== 'text') T[k] = desaturate(T[k]);
  return T;
}

/**
 * The swatch lists of a skin's sprite, filtered without inventing colours: returns { face, frame, accent, failing, dropped }, every colour one it was given, in the order given.
 * Arguments: skin (one of UI_SKINS); lists { face, frame, accent } (each a list of colours, the default first). A face stays if SKIN_TEXT keeps 4.5 to 1 on it, a frame if it keeps 3 to 1 off every kept face (paper: darker, others: lighter), an accent if it is not also a face or frame.
 */
export function skinSwatches(skin, { face = [], frame = [], accent = [] } = {}) {
  checkSkin('skinSwatches', skin);
  const text = SKIN_TEXT[skin], darkFrame = skin === 'paper';
  const r2 = (v) => Math.round(v * 100) / 100, same = (a, b) => a.toLowerCase() === b.toLowerCase();
  const failing = [], dropped = [];
  const faces = [];
  face.forEach((f, i) => {
    const ratio = worstContrast(text, f);
    if (ratio >= 4.5) faces.push(f);
    else if (i === 0) { faces.push(f); failing.push({ rule: 'text', list: 'face', colour: f, ratio: r2(ratio) }); }
    else dropped.push({ list: 'face', colour: f, ratio: r2(ratio) });
  });
  const frames = [];
  frame.forEach((fr, i) => {
    let worst = Infinity, wrongSide = false;
    for (const f of faces) {
      worst = Math.min(worst, worstContrast(fr, f));
      if (darkFrame ? brightness(fr) >= brightness(f) : brightness(fr) <= brightness(f)) wrongSide = true;
    }
    if (worst >= 3 && !wrongSide) frames.push(fr);
    else if (i === 0) { frames.push(fr); failing.push({ rule: wrongSide ? (darkFrame ? 'frame darker' : 'frame lighter') : 'frame', list: 'frame', colour: fr, ratio: r2(worst) }); }
    else dropped.push({ list: 'frame', colour: fr, ratio: r2(worst) });
  });
  const accents = [];
  accent.forEach((a, i) => {
    const clash = [...face, ...frame].find((x) => same(x, a));
    if (!clash) accents.push(a);
    else if (i === 0) { accents.push(a); failing.push({ rule: 'accent', list: 'accent', colour: a, ratio: 1 }); }
    else dropped.push({ list: 'accent', colour: a, ratio: 1 });
  });
  return { face: faces, frame: frames, accent: accents, failing, dropped };
}

// ---- the slab: shapes, depths and the rings of each skin ------------------------------------------------------

// A pill: a rectangle with fully round ends, as a shape test.
function pillIn(x, y, w, h) {
  const r = h / 2, cy = y + r;
  return (px, py) => {
    if (px < x || px >= x + w || py < y || py >= y + h) return false;
    if (px < x + r) return (px - (x + r)) ** 2 + (py - cy) ** 2 <= r * r;
    if (px > x + w - r) return (px - (x + w - r)) ** 2 + (py - cy) ** 2 <= r * r;
    return true;
  };
}

// The outline of a piece of this skin and style. k: the corner in pixels (0 to 4). full: round ends for a pill.
function shapeOf(skin, style, x, y, w, h, k, full = false) {
  if (skin === 'flat' && style === 'pill') return full ? pillIn(x, y, w, h) : roundRectIn(x, y, w, h, 4);
  if (skin === 'gilded' && style === 'temple') return cutRectIn(x, y, w, h, Math.min(4, k + 1));
  if (skin === 'gilded' && style === 'ruin') return cutRectIn(x, y, w, h, [Math.min(4, k + 2), Math.max(1, k), Math.min(4, k + 1), Math.max(0, k - 1)]);
  return roundRectIn(x, y, w, h, k);
}

// Depth of every pixel of a shape inside a box: 0 outside, 1 on its edge, 2 one pixel in, ... up to max.
// The box is padded, so a shape that runs past its bottom (an open tab) is not given an edge there.
function depths(x0, y0, w, h, inside, max, openBottom = false) {
  const W = w + 2, H = h + 2 + (openBottom ? max : 0), d = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (inside(x0 + i - 1 + 0.5, y0 + j - 1 + 0.5)) d[j * W + i] = 1;
  for (let k = 1; k < max; k++) {
    const next = [];
    for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
      const n = j * W + i;
      if (d[n] === k && d[n - 1] >= k && d[n + 1] >= k && d[n - W] >= k && d[n + W] >= k) next.push(n);
    }
    for (const n of next) d[n] = k + 1;
  }
  return (px, py) => { const i = px - x0 + 1, j = py - y0 + 1; return i < 0 || j < 0 || i >= W || j >= H ? 0 : d[j * W + i]; };
}

// The rings of a skin: how many pixels from the edge the flat face starts on each side ({ left, top, right, bottom }),
// and the colour of a pixel at depth d. dark: paper's sunken line under the top and right rules.
function rings(skin, style, b, T, ink, dark) {
  const t = Math.min(2, b);
  if (skin === 'paper') {
    const f = 3 + t, sunk = dark ? 1 : 0;
    return {
      flat: { left: f, top: f + sunk, right: f + sunk, bottom: f },
      edgeRow: dark ? f : 1,
      colour(d, topRight, lowLeft, topSide, rightSide) {
        if (d === 1) return ink;
        if (d <= 1 + t || d === 3 + t) return T.band;
        if (dark && d === 4 + t && (topSide || rightSide)) return ink;
        return T.face;
      },
    };
  }
  if (skin === 'flat') {
    const bb = Math.min(2, b), out = style === 'outline' ? 1 : 0, f = 1 + bb + out;
    return {
      flat: { left: f, top: f, right: f, bottom: f }, edgeRow: 1 + out,
      colour(d) { return d === 1 ? ink : d === 2 && out ? T.face : d <= 1 + bb + out ? T.band : T.face; },
    };
  }
  // candy and gilded: ink, the band (lit outer pixel along the top and right), ink, the face
  const f = 2 + b, gloss = skin === 'candy' && style === 'jelly' ? 1 : 0;
  return {
    flat: { left: f, top: f + gloss, right: f, bottom: f }, edgeRow: 1,
    colour(d, topRight, lowLeft, topSide) {
      if (d === 1 || d === 2 + b) return ink;
      if (d <= 1 + b) {
        if (skin === 'candy' && style === 'frosted' && topSide) return T.bandLight;
        if (lowLeft) return T.bandDark;
        return d === 2 && topRight ? T.bandLight : T.band;
      }
      if (gloss && d === 3 + b && topSide) return T.faceLight;
      return T.face;
    },
  };
}

// Paints a slab of a skin into the layer s, filling the shape at (x, y, w, h). Returns its depth map and rings.
function paintSlab(s, skin, style, x, y, w, h, k, b, T, ink, { dark = false, full = false, openBottom = false } = {}) {
  const R = rings(skin, style, b, T, ink, dark);
  const inside = shapeOf(skin, style, x, y, w, h + (openBottom ? 12 : 0), k, full);
  const at = depths(x, y, w, h, inside, 8, openBottom);
  for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) {
    const d = at(px, py);
    if (!d) continue;
    const lowLeft = at(px - 1, py + 1) < d, topSide = at(px, py - 1) < d;
    const rightSide = at(px + 1, py) < d, topRight = !lowLeft && (topSide || rightSide);
    s.dot(px, py, R.colour(d, topRight, lowLeft, topSide, rightSide));
  }
  return { at, R, inside };
}

// Draws only in the corner zones of `flat` (outside its columns and outside its rows) and inside the shape.
function cornerPen(s, flat, inside) {
  const ok = (px, py) => (px < flat.x || px >= flat.x + flat.w) && (py < flat.y || py >= flat.y + flat.h) && inside(px + 0.5, py + 0.5);
  return { ok, dot: (px, py, c) => { if (ok(px, py)) s.dot(px, py, c); } };
}

// The four corners of a body: [corner x, corner y, step x, step y] (top left, top right, bottom right, bottom left).
const corners = (x, y, w, h) => [[x, y, 1, 1], [x + w - 1, y, -1, 1], [x + w - 1, y + h - 1, -1, -1], [x, y + h - 1, 1, -1]];

// The decorations of each style and the extras, all in the corner zones.
function decorate(s, skin, style, body, flat, slab, T, ink, opt) {
  const { x, y, w, h } = body, { at, inside } = slab;
  const pen = cornerPen(s, flat, inside);
  const b = opt.b;
  const isBand = (px, py) => { const d = at(px, py); return skin === 'flat' ? d >= 2 && d <= slab.R.flat.top : d >= 2 && d <= 1 + (skin === 'paper' ? Math.min(2, b) : b); };
  const local = (cx, cy, sx, sy, u, v) => [cx + sx * u, cy + sy * v];
  if (skin === 'paper' && style === 'torn') {
    // bites 2 px deep, two along each side next to every corner; the edge of each bite is inked again
    const gone = new Set();
    for (const [cx, cy, sx, sy] of corners(x, y, w, h)) for (const [u0, v0, du, dv] of [[2, 0, 2, 2], [0, 3, 2, 2]]) {
      for (let v = 0; v < dv; v++) for (let u = 0; u < du; u++) { const [px, py] = local(cx, cy, sx, sy, u0 + u, v0 + v); if (pen.ok(px, py)) gone.add(`${px},${py}`); }
    }
    for (const key of gone) { const [px, py] = key.split(',').map(Number); s.data[py * s.w + px] = 0; }
    for (const key of gone) {
      const [px, py] = key.split(',').map(Number);
      for (const [nx, ny] of [[px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]]) if (!gone.has(`${nx},${ny}`) && s.get(nx, ny) && pen.ok(nx, ny)) s.dot(nx, ny, ink);
    }
  }
  if (skin === 'paper' && style === 'card') {
    // the card edge: 2 px of the paper's dark tone along the bottom, inside the ink
    for (let px = x; px < x + w; px++) for (const py of [y + h - 2, y + h - 3]) if (at(px, py) >= 2) s.dot(px, py, tone(T.face, -1));
    // the top right corner folded down: the corner cut off, the flap lying on the sheet
    const F = 4, cx = x + w - 1, cy = y;
    for (let v = 0; v <= F; v++) for (let u = 0; u <= F; u++) {
      const px = cx - u, py = cy + v;
      if (!pen.ok(px, py)) continue;
      if (u + v < F) s.data[py * s.w + px] = 0;
      else if (u + v === F || u === F || v === F) s.dot(px, py, ink);
      else s.dot(px, py, T.faceDark);
    }
  }
  if (skin === 'candy' && style === 'striped') {
    for (const [cx, cy, sx, sy] of corners(x, y, w, h)) for (let v = 0; v < 7; v++) for (let u = 0; u < 7; u++) {
      const [px, py] = local(cx, cy, sx, sy, u, v);
      if ((u + v) % 3 === 0 && isBand(px, py)) pen.dot(px, py, T.bandDark);
    }
  }
  if (skin === 'candy' && style === 'frosted') {
    // icing drips hanging from the iced top rim, in the two top corners
    for (const [cx, sx] of [[x, 1], [x + w - 1, -1]]) for (const [u, len] of [[2, 2], [4, 1], [5, 2]]) {
      const px = cx + sx * u;
      let py = y; while (py < y + h && (at(px, py) < 2 || isBand(px, py))) py++;
      for (let i = 0; i < len; i++) pen.dot(px, py + i, T.bandLight);
    }
  }
  if (skin === 'gilded' && style === 'temple') {
    for (const [cx, cy, sx, sy] of corners(x, y, w, h)) for (let v = 0; v < 7; v++) for (let u = 0; u < 7; u++) {
      const [px, py] = local(cx, cy, sx, sy, u, v);
      if ((u + v) % 3 === 0 && (u + v) > 3 && isBand(px, py)) pen.dot(px, py, ink);
    }
  }
  if (skin === 'gilded' && style === 'royal') {
    for (const [cx, cy, sx, sy] of corners(x, y, w, h)) for (const [u, v] of [[4, 1], [1, 4], [3, 3]]) pen.dot(...local(cx, cy, sx, sy, u, v), T.bandLight);
  }
  if (skin === 'gilded' && style === 'ruin') {
    const clip = (px, py) => pen.ok(Math.floor(px), Math.floor(py));
    crack(s, x + 1, y + 2, 0.6, 5, ink, { seed: 3, clip, branch: false });
    crack(s, x + w - 2, y + h - 3, Math.PI + 0.6, 5, ink, { seed: 7, clip, branch: false });
  }
  if (opt.extras) {
    if (skin === 'paper') {
      // a round inked pin 4x4 at each top corner
      for (const [cx, sx] of [[x, 1], [x + w - 1, -1]]) for (let v = 0; v < 4; v++) for (let u = 0; u < 4; u++) {
        if ((u === 0 || u === 3) && (v === 0 || v === 3)) continue;
        const c = v === 0 || (sx > 0 ? u === 3 : u === 0) ? (v === 0 && (sx > 0 ? u === 2 : u === 1) ? tone(T.accent, 0.85) : T.accent) : v === 3 ? T.accentDark : T.accent;
        pen.dot(cx + sx * (1 + u), y + 1 + v, c);
      }
    }
    if (skin === 'candy') {
      // two-pixel sprinkles in the rim: one along each side of every corner
      let n = 0;
      for (const [cx, cy, sx, sy] of corners(x, y, w, h)) for (const along of ['x', 'y']) {
        const col = n++ % 2 ? tone(T.accent, 0.85) : T.accent;
        for (const a of [3, 4]) {
          // the deepest rim pixel at this place along the side
          let best = null;
          for (let o = 0; o < 4; o++) { const [px, py] = along === 'x' ? local(cx, cy, sx, sy, a, o) : local(cx, cy, sx, sy, o, a); if (isBand(px, py)) best = [px, py]; }
          if (best) pen.dot(best[0], best[1], col);
        }
      }
    }
    if (skin === 'gilded') {
      for (const [cx, cy, sx, sy] of corners(x, y, w, h)) for (let v = 0; v < 3; v++) for (let u = 0; u < 3; u++) {
        const c = u === 1 && v === 1 ? T.accent : (sx > 0 ? u === 2 : u === 0) && (sy > 0 ? v === 0 : v === 2) ? tone(T.accent, 0.85) : (sx > 0 ? u === 0 : u === 2) && (sy > 0 ? v === 2 : v === 0) ? T.accentDark : T.accent;
        pen.dot(...local(cx, cy, sx, sy, 2 + u, 2 + v), c);
      }
    }
  }
  if (skin === 'candy' && opt.shine) {
    // the highlight bubble inside the top right of the rim
    const cx = x + w - 1;
    for (const [v, us, c] of [[1, [2, 3, 4], '#ffffff'], [2, [1, 2, 3, 4], '#ffffff'], [3, [1, 2, 3], T.bandLight], [4, [1, 2], T.bandLight]]) for (const u of us) pen.dot(cx - u, y + v, c);
  }
}

// Ink silhouette of `layer`, moved (dx, dy), painted on g under it.
function dropShadow(g, layer, dx, dy, ink) {
  for (let py = 0; py < layer.h; py++) for (let px = 0; px < layer.w; px++) if (layer.data[py * layer.w + px]) g.dot(px + dx, py + dy, ink);
}

// Copies a layer onto g; a disabled piece has every pixel greyed, its ink too.
function finish(g, layer, grey) {
  if (grey) for (let i = 0; i < layer.data.length; i++) if (layer.data[i]) layer.data[i] = col(desaturate(hexOf(layer.data[i])));
  g.blit(layer);
}

const bandOf = (skin, opt, cap) => Math.max(1, Math.min(cap, opt.borderPx ?? borderPx(opt.border)));
const kOf = (opt) => Math.max(0, Math.min(4, opt.cornerPx ?? cornerPx(opt.corner ?? 0.5)));

// ---- panels, buttons, tabs, tooltips ----------------------------------------------------------------------------

/**
 * Draws a stretchable panel of a skin filling exactly (x, y, w, h), its ink outline and drop shadow included: returns { body, inner, title, slice, tones, edge, join }.
 * Arguments: g; x, y, w, h (a sprite passes its frame minus the 1 px empty border); skin; opt { style, face, frame, accent, border (0..1), corner (0..1), state, shadow (2 px down-left), extras (pins, sprinkles or gems), title (rows of a heading strip), inset (a darker list well), focusTop (flat: the accent's focus line along the top, as a tooltip has), shine (candy bubble), ink }.
 * `inner` is the flat one-colour middle, `title` the flat heading strip (or null), `slice` how far everything else reaches in from each side of the rectangle (at most 7), `edge` a pixel of the band to check contrast against, `join` the first row of plain face under the top border (where an active skinTab's bottom row goes).
 */
export function skinPanel(g, x, y, w, h, skin, opt = {}) {
  const style = checkSkin('skinPanel', skin, opt.style);
  const ink = opt.ink ?? INK, state = opt.state ?? 'normal';
  const T0 = skinTones(skin, { ...opt, style, state });
  const inset = !!opt.inset;
  const T = { ...T0, face: inset ? T0.faceDark : T0.face };
  const b = bandOf(skin, opt, 3), k = kOf(opt);
  const sh = opt.shadow ? 2 : 0;
  const body = { x: x + sh, y, w: w - sh, h: h - sh };
  const s = new Surface(g.w, g.h);
  const slab = paintSlab(s, skin, style, body.x, body.y, body.w, body.h, k, b, T, ink, { dark: inset && skin === 'paper' });
  const fl = slab.R.flat;
  // the flat middle: at least EDGE px in from the body on every side, so the corner zones hold the decorations
  // a drop shadow's own corners lie 2 px further in, along the top (its top left) and the right (its bottom right)
  const shc = sh ? sh + 4 : 0;
  let top = Math.max(EDGE, fl.top, shc);
  const left = Math.max(EDGE, fl.left), right = Math.max(EDGE, fl.right, shc), bottom = Math.max(EDGE, fl.bottom);
  const faceX = body.x + fl.left, faceW = body.w - fl.left - fl.right;
  const focus = skin === 'flat' && (inset || opt.focusTop);
  if (focus) {
    // the focus line along the top of a list well (and a tooltip's top edge): 2 px of the accent
    for (const py of [body.y + fl.top, body.y + fl.top + 1]) s.rect(faceX, py, faceW, 1, T.accent);
    top = Math.max(top, fl.top + 2);
  }
  let title = null;
  const rows = Math.max(0, Math.round(opt.title ?? 0));
  if (rows) {
    const ty = body.y + Math.max(fl.top, focus ? fl.top + 2 : 0);
    const stripC = skin === 'paper' ? T.face : T.faceDark;
    s.rect(faceX, ty, faceW, rows, stripC);
    // the line under the strip: a rule of the ink (paper), the rim (candy), the focus (flat, 2 px), a gold rule (gilded)
    const lineC = skin === 'flat' ? T.accent : T.band, lineH = skin === 'flat' ? 2 : 1;
    s.rect(faceX, ty + rows, faceW, lineH, lineC);
    title = { x: body.x + left, y: ty, w: body.w - left - right, h: rows };
    top = ty + rows + lineH - body.y;
  }
  const inner = { x: body.x + left, y: body.y + top, w: body.w - left - right, h: body.h - top - bottom };
  decorate(s, skin, style, body, inner, slab, T, ink, { b, extras: opt.extras, shine: opt.shine });
  if (sh) dropShadow(g, s, -sh, sh, state === 'disabled' ? desaturate(ink) : ink);
  finish(g, s, state === 'disabled');
  const midX = body.x + (body.w >> 1);
  return {
    body, inner, title,
    slice: { left: inner.x - x, top: inner.y - y, right: x + w - (inner.x + inner.w), bottom: y + h - (inner.y + inner.h) },
    tones: T,
    edge: { x: midX, y: body.y + slab.R.edgeRow },
    join: body.y + fl.top,
  };
}

// How far a drawn piece reaches in from each side of (x, y, w, h): the run of identical columns round the middle
// column and the run of identical rows round row `my`, measured on the layer itself.
function measureSlice(s, x, y, w, h, my) {
  const colAt = (px) => { let k = ''; for (let py = y; py < y + h; py++) k += s.get(px, py) + ','; return k; };
  const rowAt = (py) => { let k = ''; for (let px = x; px < x + w; px++) k += s.get(px, py) + ','; return k; };
  const mx = x + (w >> 1), mc = colAt(mx), mr = rowAt(my);
  let l = mx, r = mx, t = my, b = my;
  while (l > x && colAt(l - 1) === mc) l--;
  while (r < x + w - 1 && colAt(r + 1) === mc) r++;
  while (t > y && rowAt(t - 1) === mr) t--;
  while (b < y + h - 1 && rowAt(b + 1) === mr) b++;
  return { left: l - x, top: t - y, right: x + w - 1 - r, bottom: y + h - 1 - b };
}

/**
 * Draws a button of a skin in one of BUTTON_STATES in (x, y, w, h), standing on a 2 px lip (or, with opt.shadow, on its drop shadow): returns { text, body, slice, tones, edge }.
 * Arguments: g; x, y, w, h (a 96x32 frame: 1, 1, 94, 30); state; skin; opt as skinPanel (border is 1 or 2 px here). `text` is the flat middle 78x18 of a 96x32 frame, 2 px lower when pressed; `edge` a band pixel.
 * `slice` (from the rectangle given; add the frame's 1 px): 7 on every side; pressed top 8 and bottom 5 (the body sits 2 px
 * lower, and its bottom corner decorations reach 5 rows up). Every decoration stays outside the slice's middle columns
 * and rows, a drop shadow's included. A flat `pill` has fully round ends that do not fit in 7 px: its slice is measured
 * from the ends as drawn (10 to 12 px on every side of a 96x32 frame), so
 * a pill stretches freely sideways and only by its few straight middle rows up and down.
 */
export function skinButton(g, x, y, w, h, state = 'normal', skin, opt = {}) {
  if (!BUTTON_STATES.includes(state)) throw new Error(`skinButton: state "${state}" is not one of ${BUTTON_STATES.join(', ')}`);
  const style = checkSkin('skinButton', skin, opt.style);
  const ink = opt.ink ?? INK, T = skinTones(skin, { ...opt, style, state });
  const off = state === 'disabled', pressed = state === 'pressed';
  const b = bandOf(skin, opt, 2), k = kOf(opt), sh = opt.shadow ? 2 : 0;
  const bx = x + sh, bw = w - sh, bh = h - LIP;
  const by = pressed ? y + LIP : y;
  const full = true;
  const s = new Surface(g.w, g.h);
  // the lip: the slab's side, under the body (when there is no shadow to stand on)
  if (!pressed && !sh) {
    // inked on its own edge, inside the rectangle (an outline round the shape would land on the frame's empty border)
    const lipAt = depths(bx, y + LIP, bw, bh, shapeOf(skin, style, bx, y + LIP, bw, bh, k, full), 2);
    for (let py = y + LIP; py < y + LIP + bh; py++) for (let px = bx; px < bx + bw; px++) { const d = lipAt(px, py); if (d) s.dot(px, py, d === 1 ? ink : T.lip); }
  }
  const slab = paintSlab(s, skin, style, bx, by, bw, bh, k, b, T, ink, { full });
  if (!pressed && !sh) {
    // the body's own bottom line joins the lip, so the lip shows 2 px of colour
    const row = y + bh - 1, lipC = s.get(bx + (bw >> 1), row + 1);
    for (let px = bx + 1; px < bx + bw - 1; px++) if (s.get(px, row + 1) === lipC && slab.at(px, row) === 1) s.dot(px, row, T.lip);
  }
  const text = { x: x + 8, y: by + 5, w: w - 16, h: bh - 10 };
  const fb = slab.R.flat.bottom;
  let slice = pressed ? { left: 7, top: 8, right: 7, bottom: Math.max(5, fb) } : { left: 7, top: 7, right: 7, bottom: 7 };
  // the corner zones: outside both the text area and the slice's middle, so no decoration lies in a stretched column or row
  const zx = Math.min(text.x, x + slice.left), zy = Math.min(text.y, y + slice.top);
  const zone = { x: zx, y: zy, w: Math.max(text.x + text.w, x + w - slice.right) - zx, h: Math.max(text.y + text.h, y + h - slice.bottom) - zy };
  decorate(s, skin, style, { x: bx, y: by, w: bw, h: bh }, zone, slab, T, ink, { b, extras: opt.extras, shine: opt.shine && !off && !pressed });
  const out = new Surface(g.w, g.h);
  if (sh && !pressed) dropShadow(out, s, -sh, sh, off ? desaturate(ink) : ink);
  finish(out, s, off);
  if (skin === 'flat' && style === 'pill') slice = measureSlice(out, x, y, w, h, by + (bh >> 1));
  g.blit(out);
  return {
    text, body: { x: bx, y: by, w: bw, h: bh },
    slice,
    tones: T,
    edge: { x: bx + (bw >> 1), y: by + slab.R.edgeRow },
  };
}

/**
 * Draws a tab of a skin in (x, y, w, h): a button with no bottom edge that opens into a panel's top below it. Returns { text, body, slice, tones, edge }.
 * Arguments: g; x, y, w, h; active (true: full height, the panel's face, so it joins the panel when its bottom row lies on the panel's first row of face; false: 2 px lower, one tone darker, standing on an ink line); skin; opt as skinPanel.
 */
export function skinTab(g, x, y, w, h, active, skin, opt = {}) {
  const style = checkSkin('skinTab', skin, opt.style);
  const ink = opt.ink ?? INK, T0 = skinTones(skin, { ...opt, style });
  const T = active ? T0 : { ...T0, face: T0.faceDark };
  const b = bandOf(skin, opt, 2), k = kOf(opt);
  const ty = active ? y : y + 2, th = active ? h : h - 2;
  const s = new Surface(g.w, g.h);
  const slab = paintSlab(s, skin, style, x, ty, w, th, k, b, T, ink, { openBottom: true, dark: !active && skin === 'paper' });
  if (!active) s.rect(x, y + h - 1, w, 1, ink);
  const fl = slab.R.flat, top = Math.max(EDGE, fl.top);
  const text = { x: x + 8, y: ty + top, w: w - 16, h: Math.min(18, th - top - (active ? 1 : 2)) };
  decorate(s, skin, style, { x, y: ty, w, h: th + 20 }, { x: text.x, y: text.y, w: text.w, h: h + 40 }, slab, T, ink, { b, extras: opt.extras, shine: opt.shine });
  g.blit(s);
  return {
    text, body: { x, y: ty, w, h: th },
    slice: { left: 7, top: ty - y + top, right: 7, bottom: active ? 0 : 1 },
    tones: T,
    edge: { x: x + (w >> 1), y: ty + slab.R.edgeRow },
  };
}

/**
 * Draws a small panel of a skin with a 5 px tail under its bottom left corner, inside the left 8 px so stretching never repeats it: returns { inner, slice, rect, edge }.
 * Arguments: g; x, y, w, h (the whole rectangle, tail included); skin; opt as skinPanel (flat: the accent runs along its top edge).
 */
export function skinTooltip(g, x, y, w, h, skin, opt = {}) {
  const style = checkSkin('skinTooltip', skin, opt.style);
  const ink = opt.ink ?? INK, T = skinTones(skin, { ...opt, style });
  const p = skinPanel(g, x, y, w, h - 5, skin, { ...opt, style, shadow: false, title: 0, inset: false, focusTop: true });
  // the tail: a small inked wedge pointing down from under the bottom left corner, in the left 8 px
  const tail = new Surface(g.w, g.h), top = y + h - 6;
  tail.fill(x, top, x + 8, y + h, polyIn([[x + 2, top], [x + 6.5, top], [x + 2, y + h - 1]]), skin === 'paper' ? T.face : T.band, { outline: ink });
  for (let py = top + 1; py < y + h; py++) for (let px = x; px < x + 8; px++) if (tail.get(px, py)) g.dot(px, py, hexOf(tail.get(px, py)));
  return { inner: p.inner, slice: { ...p.slice, bottom: p.slice.bottom + 5 }, rect: { x, y, w, h }, edge: p.edge };
}

// ---- bars and the slider ----------------------------------------------------------------------------------------

/**
 * The trough of a skin's bar housing drawn in (x, y, w, h), worked out without drawing: { x, y, w, h }.
 * Arguments: x, y, w, h; skin; opt { border (0..1) or borderPx, corner, caps (px of solid band at each end, default 0) }.
 */
export function skinBarOpening(x, y, w, h, skin, { border, borderPx: bp, corner, caps = 0 } = {}) {
  checkSkin('skinBarOpening', skin);
  const b = Math.max(1, Math.min(3, bp ?? borderPx(border))), i = 2 + b, c = Math.max(0, caps ?? 0);
  return { x: x + i + c, y: y + i, w: w - 2 * (i + c), h: h - 2 * i };
}

/**
 * Draws the empty housing of a skin's bar (a 64x16 frame: 1, 1, 62, 14): the skin's band round a trough. Returns the opening, exactly skinBarOpening of the same arguments.
 * Arguments: g; x, y, w, h; skin; opt { style, frame, accent, face (paper: the paper), border, corner, caps, extras (gilded: a gem on each end cap), notches (a notch in the band every 8 px), ink }.
 * Stretching: the housing nine-slices sideways with left and right `opening.x - x + 1` (3 + the band + caps; the
 * corner reaches 1 px past the band), which is more than SLICE with caps: up to 10 px with caps 4 and a 3 px band.
 * A notched housing does not stretch one column: its notches repeat every 8 px, so it tiles in 8 px steps.
 */
export function skinBarHousing(g, x, y, w, h, skin, opt = {}) {
  const style = checkSkin('skinBarHousing', skin, opt.style);
  const ink = opt.ink ?? INK, T = skinTones(skin, { ...opt, style });
  const b = Math.max(1, Math.min(3, opt.borderPx ?? borderPx(opt.border))), k = Math.min(kOf(opt), (h - 1) >> 1);
  const o = skinBarOpening(x, y, w, h, skin, { borderPx: b, caps: opt.caps });
  const at = depths(x, y, w, h, shapeOf(skin, style, x, y, w, h, k, true), 2 + b);
  const s = new Surface(g.w, g.h);
  for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) {
    const d = at(px, py);
    if (!d) continue;
    const lowLeft = at(px - 1, py + 1) < d, topRight = !lowLeft && (at(px, py - 1) < d || at(px + 1, py) < d);
    let c;
    if (d === 1) c = ink;
    else if (skin === 'paper') c = d === 2 ? T.band : T.face;
    else if (skin === 'flat') c = T.band;
    else c = d <= 1 + b ? (lowLeft ? T.bandDark : d === 2 && topRight ? T.bandLight : T.band) : T.band;
    s.dot(px, py, c);
  }
  // the ring round the trough: ink (paper: a rule of the frame colour), then the trough with a shadow under its top
  s.rect(o.x - 1, o.y - 1, o.w + 2, o.h + 2, skin === 'paper' ? T.band : ink);
  s.rect(o.x, o.y, o.w, o.h, T.trough);
  s.rect(o.x, o.y, o.w, 1, skin === 'paper' ? tone(T.trough, -0.5) : tone(T.trough, -1));
  if (opt.notches) for (let px = x + 8; px < x + w - 8; px += 8) for (let py = y + 1; py < y + h - 1; py++) if (at(px, py) >= 2 && (py < o.y - 1 || py > o.y + o.h)) s.dot(px, py, ink);
  const caps = Math.max(0, opt.caps ?? 0);
  if (opt.extras && skin === 'gilded' && caps >= 3) {
    const cy = o.y + (o.h >> 1) - 1;
    for (const gx of [o.x - 1 - caps + ((caps - 3) >> 1), o.x + o.w + 1 + ((caps - 3) >> 1)]) for (let v = 0; v < 3; v++) for (let u = 0; u < 3; u++) s.dot(gx + u, cy + v, u === 2 && v === 0 ? tone(T.accent, 0.85) : u === 0 && v === 2 ? T.accentDark : T.accent);
  }
  g.blit(s);
  return o;
}

/**
 * Draws the fill strip of a skin's bar, cropped to `value` (0 empty .. 1 full), never outside `opening` (from skinBarHousing or skinBarOpening).
 * Arguments: g; opening; value; skin; opt { fill (colour; required), hatch (paper: diagonal 1 px lines of its dark tone every 3 px), shine (candy: a glossy line and a bubble; default true), flash (0..1: how far it has turned white), gold (gilded: the colour of its top line) }.
 */
export function skinBarFill(g, opening, value, skin, { fill, hatch = false, shine = true, flash = 0, gold = '#f2c230' } = {}) {
  checkSkin('skinBarFill', skin);
  if (!fill) throw new Error('skinBarFill: needs a fill colour');
  const o = opening, n = Math.round(o.w * clamp01(value));
  if (n <= 0 || o.h <= 0) return g;
  const r = ramp(fill), fl = clamp01(flash);
  const lit = (c) => (fl ? mix(c, '#ffffff', fl) : c);
  for (let i = 0; i < n; i++) for (let j = 0; j < o.h; j++) {
    let c = r.base;
    if (skin !== 'flat' && o.h >= 3 && j === o.h - 1) c = r.dark;
    if (skin === 'paper' && hatch && (i + j) % 3 === 0) c = r.dark;
    if (skin === 'candy' && shine) { if (j === 0) c = r.light; if ((j === 0 && i >= 2 && i <= 4) || (j === 1 && i >= 2 && i <= 3)) c = '#ffffff'; }
    if (skin === 'gilded' && j === 0) c = gold;
    g.dot(o.x + i, o.y + j, lit(c));
  }
  return g;
}

/**
 * Draws a slider's track in a skin's look: a rail 4 to 6 px tall across the box, its band round a trough, stretchable sideways. Returns { rail, slice }.
 * Arguments: g; x, y, w, h (the box; the rail is centred in it); skin; opt { style, face, frame, border, corner, ink }.
 */
export function skinSlider(g, x, y, w, h, skin, opt = {}) {
  const style = checkSkin('skinSlider', skin, opt.style);
  const ink = opt.ink ?? INK, T = skinTones(skin, { ...opt, style });
  const rh = Math.max(4, Math.min(6, Math.round(h * 0.4))), ry = y + ((h - rh) >> 1);
  const k = Math.min(kOf(opt), 2);
  const at = depths(x, ry, w, rh, shapeOf(skin, style, x, ry, w, rh, k, true), 3);
  for (let py = ry; py < ry + rh; py++) for (let px = x; px < x + w; px++) {
    const d = at(px, py);
    if (!d) continue;
    const lit = d === 2 && at(px, py - 1) < d && skin !== 'flat' && skin !== 'paper';
    g.dot(px, py, d === 1 ? ink : d === 2 ? (lit ? T.bandLight : T.band) : T.trough);
  }
  return { rail: { x, y: ry, w, h: rh }, slice: { left: SLICE - 1, top: 0, right: SLICE - 1, bottom: 0 } };
}

/**
 * Draws a slider's knob: a slab of the skin `size` px across (10 to 14) and 2 px taller, centred on (cx, cy). Returns { rect }.
 * Arguments: g; cx, cy; size; skin; opt { style, face (its body), frame (its edge), accent (gilded: its gem), extras, corner, ink }.
 */
export function skinKnob(g, cx, cy, size, skin, opt = {}) {
  const style = checkSkin('skinKnob', skin, opt.style);
  const ink = opt.ink ?? INK, T = skinTones(skin, { ...opt, style });
  const w = Math.max(10, Math.min(14, Math.round(size))), h = w + 2, x = cx - (w >> 1), y = cy - (h >> 1);
  const k = skin === 'candy' ? 3 : Math.min(2, kOf(opt));
  const s = new Surface(g.w, g.h);
  const slab = paintSlab(s, skin, style, x, y, w, h, k, 1, T, ink);
  const fl = slab.R.flat, mid = y + (h >> 1);
  if (skin === 'paper') for (const py of [mid - 2, mid + 1]) for (let px = x + fl.left; px < x + w - fl.right; px++) s.dot(px, py, T.band);
  if (skin === 'candy') { s.dot(x + w - 4, y + 3, '#ffffff'); s.dot(x + w - 5, y + 3, T.faceLight); s.dot(x + w - 4, y + 4, T.faceLight); }
  if (skin === 'gilded' && opt.extras) for (let v = 0; v < 3; v++) for (let u = 0; u < 3; u++) s.dot(cx - 1 + u, mid - 1 + v, u === 2 && v === 0 ? tone(T.accent, 0.85) : T.accent);
  g.blit(s);
  return { rect: { x, y, w, h } };
}

// ---- small controls ---------------------------------------------------------------------------------------------

/**
 * Draws a checkbox `size` px square centred on (cx, cy) in a skin's look; `on` draws a tick of opt.accent (2 px strokes, inked) inside it. Off and on share one outline. Returns { box }.
 * Arguments: g; cx, cy; size; on; skin; opt { style, face, frame, accent, border, corner, ink }.
 */
export function skinCheck(g, cx, cy, size, on, skin, opt = {}) {
  const style = checkSkin('skinCheck', skin, opt.style);
  const ink = opt.ink ?? INK, T = skinTones(skin, { ...opt, style });
  const x = cx - (size >> 1), y = cy - (size >> 1);
  const s = new Surface(g.w, g.h);
  paintSlab(s, skin, style, x, y, size, size, Math.min(2, kOf(opt)), bandOf(skin, opt, 2), T, ink, { full: false });
  if (on) {
    const t = new Surface(g.w, g.h), P = (u, v) => [x + Math.round(u * size), y + Math.round(v * size)];
    const [a, b2, c2] = [P(0.27, 0.5), P(0.43, 0.68), P(0.73, 0.3)];
    t.limb(a[0], a[1], b2[0], b2[1], 2, T.accent);
    t.limb(b2[0], b2[1], c2[0], c2[1], 2, T.accent);
    t.outline(ink);
    s.blit(t);
  }
  g.blit(s);
  return { box: { x, y, w: size, h: size } };
}

/**
 * Draws a round option button `size` px across centred on (cx, cy) in a skin's look; `on` puts a dot of the accent in it (at least 4x4). Off and on share one outline. Returns { box }.
 * Arguments: g; cx, cy; size; on; skin; opt { style, face, frame, accent, border, ink }.
 */
export function skinRadio(g, cx, cy, size, on, skin, opt = {}) {
  const style = checkSkin('skinRadio', skin, opt.style);
  const ink = opt.ink ?? INK, T = skinTones(skin, { ...opt, style });
  const x = cx - (size >> 1), y = cy - (size >> 1), r = size / 2, mx = x + r, my = y + r;
  const b = bandOf(skin, opt, 2), R = rings(skin, style, b, T, ink, false);
  const at = depths(x, y, size, size, ellipseIn(mx, my, r, r), 8);
  for (let py = y; py < y + size; py++) for (let px = x; px < x + size; px++) {
    const d = at(px, py);
    if (!d) continue;
    const lowLeft = at(px - 1, py + 1) < d, topSide = at(px, py - 1) < d;
    const rightSide = at(px + 1, py) < d;
    g.dot(px, py, R.colour(d, !lowLeft && (topSide || rightSide), lowLeft, topSide, rightSide));
  }
  if (on) {
    const rr = Math.max(2.5, size * 0.2);
    const t = new Surface(g.w, g.h);
    t.ellipse(mx, my, rr, rr, T.accent);
    t.dot(Math.floor(mx + rr / 2), Math.floor(my - rr / 2), tone(T.accent, 0.85));
    t.outline(ink);
    g.blit(t);
  }
  return { box: { x, y, w: size, h: size } };
}

/**
 * Draws an on/off switch in (x, y, w, h): a rounded track and a knob that sits left (off, the track in the face's dark tone) or right (on, the track in the accent). Returns { knob }.
 * Arguments: g; x, y, w, h; on; skin; opt { style, face, frame (the knob and the track's edge), accent, ink }.
 */
export function skinSwitch(g, x, y, w, h, on, skin, opt = {}) {
  const style = checkSkin('skinSwitch', skin, opt.style);
  const ink = opt.ink ?? INK, T = skinTones(skin, { ...opt, style });
  const inside = skin === 'gilded' && style !== 'royal' ? cutRectIn(x, y, w, h, 3) : pillIn(x, y, w, h);
  const at = depths(x, y, w, h, inside, 3);
  const track = on ? T.accent : T.faceDark;
  for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) {
    const d = at(px, py);
    if (d) g.dot(px, py, d === 1 ? ink : d === 2 ? T.band : track);
  }
  const kh = h - 4, kx = on ? x + w - 2 - kh : x + 2, ky = y + 2;
  const t = new Surface(g.w, g.h);
  const kShape = skin === 'gilded' && style !== 'royal' ? cutRectIn(kx + 1, ky + 1, kh - 2, kh - 2, 2) : ellipseIn(kx + kh / 2, ky + kh / 2, kh / 2 - 1, kh / 2 - 1);
  t.fill(kx, ky, kx + kh, ky + kh, kShape, skin === 'paper' ? T.face : T.band, { outline: ink });
  if (skin === 'candy' || skin === 'gilded') t.dot(kx + kh - 4, ky + 3, T.bandLight);
  g.blit(t);
  return { knob: { x: kx, y: ky, w: kh, h: kh } };
}

/**
 * Draws a menu pointer exactly `size` px long from its inked tail end at (x, y) to its inked tip, pointing right, moved `bob` px towards its tip: an inked nib (paper), a glossy drop (candy), a solid triangle (flat) or a gold arrow with a gem (gilded). Never a hand. Returns { tip }: its outermost pixel.
 * Arguments: g; x, y; size (px, 12 or more: a smaller size draws 12 long, the shortest head that holds the nib, drop or gem); skin; opt { bob, style, face, frame, accent, ink }.
 */
export function skinPointer(g, x, y, size, skin, { bob = 0, ink = INK, ...opt } = {}) {
  const style = checkSkin('skinPointer', skin, opt.style);
  const T = skinTones(skin, { ...opt, style });
  // the colour inside is 2 px shorter than `size`: the ink outline adds the last pixel at each end
  const L = Math.max(12, Math.round(size)) - 2, x0 = x + 1 + Math.round(bob);
  const hl = Math.round(L * 0.5), hh = Math.max(3, Math.round(L * 0.3)), tt = Math.max(1, Math.round(L * 0.1));
  const hx = x0 + L - hl, tipX = x0 + L - 1;
  const t = new Surface(g.w, g.h);
  // the head: rows shrink to a single pixel at the tip
  const head = (px, py) => { const i = Math.floor(px) - hx, dy = Math.abs(Math.floor(py) - y); return i >= 0 && i < hl && dy <= Math.round(hh * (1 - i / (hl - 1)) - 0.01); };
  const headC = skin === 'gilded' ? T.band : T.accent, tailC = skin === 'paper' ? T.band : skin === 'gilded' ? T.bandDark : T.band;
  t.rect(x0, y - tt, L - hl + 1, 2 * tt + 1, tailC);
  if (skin === 'candy') t.ellipse(hx + 1.5, y + 0.5, hh - 0.5, hh - 0.5, headC);
  t.fill(hx, y - hh, hx + hl, y + hh + 1, head, headC);
  if (skin === 'paper') {
    // the nib's slit and its vent hole
    for (let px = hx + Math.round(hl * 0.35); px < tipX - 1; px++) t.dot(px, y, ink);
    t.dot(hx + Math.round(hl * 0.3), y, ink);
    t.dot(hx + 1, y - 1, T.accentDark); t.dot(hx + 1, y + 1, T.accentDark);
  }
  if (skin === 'candy') { t.dot(hx + 1, y - 2, '#ffffff'); t.dot(hx + 2, y - 2, tone(T.accent, 0.85)); }
  if (skin === 'gilded') { for (let v = -1; v <= 1; v++) for (let u = 0; u < 3; u++) t.dot(hx + 1 + u, y + v, u === 2 && v === -1 ? tone(T.accent, 0.85) : T.accent); t.dot(hx + 4, y - 2, T.bandLight); }
  if (skin === 'flat') t.dot(hx, y - hh, T.accentDark);
  t.outline(ink);
  g.blit(t);
  return { tip: { x: tipX + 1, y } };
}

/**
 * Draws four corner brackets round a slot (x, y, w, h) that step in by 1 px and back over the loop (t, 0..1): a selection mark that nine-slices round any slot. Returns { slice }.
 * Arguments: g; x, y, w, h; t; skin; opt { style, frame, accent, ink }.
 */
export function skinSelector(g, x, y, w, h, t, skin, opt = {}) {
  const style = checkSkin('skinSelector', skin, opt.style);
  const ink = opt.ink ?? INK, T = skinTones(skin, { ...opt, style });
  const step = pulse(t) >= 0.5 ? 1 : 0, a = Math.max(3, Math.min(4, Math.round(Math.min(w, h) * 0.15)));
  const s = new Surface(g.w, g.h);
  for (const [cx, cy, sx, sy] of corners(x, y, w, h)) {
    const ox = cx + sx * (1 + step), oy = cy + sy * (1 + step);
    for (let i = 0; i < a; i++) for (let j = 0; j < 2; j++) {
      const lit = skin !== 'flat' && skin !== 'paper' && j === 0 && i < 2;
      const c = lit ? T.bandLight : T.band;
      s.dot(ox + sx * i, oy + sy * j, c);
      s.dot(ox + sx * j, oy + sy * i, c);
    }
    if (skin === 'gilded' && opt.extras) s.dot(ox, oy, T.accent);
  }
  s.outline(ink);
  g.blit(s);
  return { slice: { left: SLICE - 1, top: SLICE - 1, right: SLICE - 1, bottom: SLICE - 1 } };
}
