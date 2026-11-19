// engine/draw-list.js, part 9: areas and shapes that cross the frame's edges, and shapes placed on node and bone
// frames (turned, mirrored). Backdrops (mist or haze running off the frame, wrap seams), tiles and effects draw
// partly off the frame all the time: nothing may throw, and the part inside the frame is the same pixels as the
// same picture drawn on a larger frame and cut down.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../../engine/draw-list.js';

const palette = { skin: '#e0a878', sky: '#6fa3e0', cloth: '#3a6ea5' };
const W = 32, H = 24, PAD = 8;   // PAD is a multiple of every dither pattern's period, so the pattern keeps its phase

/** Every area kind, written round the origin (moved onto each edge below). */
const AREAS = [
  { kind: 'rect', at: [-5, -4], size: [10, 8] },
  { kind: 'ellipse', at: [0, 0], r: [6, 4] },
  { kind: 'ellipse', at: [0, 0], r: [7, 3], turn: 35 },
  { kind: 'capsule', from: [-5, -2], to: [4, 3], r: [3, 2] },
  { kind: 'limb', from: [-6, 1], to: [5, -2], width: 3 },
  { kind: 'poly', points: [[-6, -4], [6, -3], [3, 5], [-4, 4]] },
  { kind: 'poly', points: Array.from({ length: 12 }, (_, i) => [Math.round(7 * Math.sin(i * 0.5236)), Math.round(5 * Math.cos(i * 0.5236))]) },
  { kind: 'dot', at: [0.2, 0.7], size: 2 },
  { kind: 'arc', at: [0, 0], r: 6, a0: 30, a1: 250, thick: 2 },
  { kind: 'ring', at: [0, 0], r: 5, thick: 2 },
];
/** The points the areas are moved to: the four edges, the four corners, and well past each edge. */
const SPOTS = [[0, 12], [W, 12], [16, 0], [16, H], [0, 0], [W, 0], [0, H], [W, H], [-3, 10], [W + 3, 10], [14, -3], [14, H + 3]];

const moved = (area, [x, y]) => D.placeOn(area, D.nodeFrame({ at: [x, y] }));
const sameCut = (small, big) => {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (small.data[y * W + x] !== big.data[(y + PAD) * (W + 2 * PAD) + x + PAD]) return `pixel ${x},${y}`;
  return null;
};

const LISTS = {
  'dither checker': (area) => ({ kind: 'dither', area, amount: 0.5, paint: 'skin' }),
  'dither bayer4': (area) => ({ kind: 'dither', area, pattern: 'bayer4', amount: 0.4, paint: 'skin' }),
  'dither bayer2': (area) => ({ kind: 'dither', area, pattern: 'bayer2', amount: 0.7, paint: 'skin' }),
  'dither lines-h': (area) => ({ kind: 'dither', area, pattern: 'lines-h', amount: 0.5, paint: 'skin' }),
  'dither lines-v': (area) => ({ kind: 'dither', area, pattern: 'lines-v', amount: 0.5, paint: 'skin' }),
  'bands down': (area) => ({ kind: 'bands', area, stops: ['sky.light', 'sky', 'sky.dark'], edges: 'dither' }),
  'bands up': (area) => ({ kind: 'bands', area, dir: 'up', stops: ['sky.light', 'sky', 'sky.dark', 'sky.deep'] }),
  'bands in': (area) => ({ kind: 'bands', area, dir: 'in', stops: ['sky.light', 'sky', 'sky.dark'], edges: 'dither' }),
  'bands out': (area) => ({ kind: 'bands', area, dir: 'out', stops: ['sky.light', 'sky', 'sky.dark'] }),
  shape: (area) => ({ ...area, paint: 'cloth' }),
  'shape in a body': (area) => ({ ...area, paint: 'cloth', group: 'b' }),
  'shape with a cut': (area) => ({ ...area, paint: 'cloth', group: 'c' }),
};

test('draw-list edges: every area kind as dither, bands or a shape, crossing each edge and corner, draws exactly the in-frame part', () => {
  let cases = 0;
  for (const [name, make] of Object.entries(LISTS)) for (const area of AREAS) for (const spot of SPOTS) {
    const at = moved(area, spot), atBig = moved(area, [spot[0] + PAD, spot[1] + PAD]);
    const extra = name === 'shape with a cut' ? (a) => [{ kind: 'cut', from: 'c', shape: { kind: 'rect', at: [a[0] - 1, a[1] - 9], size: [2, 18] } }] : () => [];
    const list = [make(at), ...extra(spot)], big = [make(atBig), ...extra([spot[0] + PAD, spot[1] + PAD])];
    let small;
    assert.doesNotThrow(() => { small = D.renderList(W, H, list, { palette }); }, `${name} ${area.kind} at ${spot}`);
    assert.deepEqual(small.skipped, [], `${name} ${area.kind} at ${spot}`);
    const ref = D.renderList(W + 2 * PAD, H + 2 * PAD, big, { palette });
    // a shaded shape cut by the frame keeps its shade band where the frame cuts it (its test is asked past the edge)
    const bad = sameCut(small.g, ref.g);
    assert.equal(bad, null, `${name} ${area.kind} at ${spot}: ${bad}`);
    cases++;
  }
  assert.equal(cases, Object.keys(LISTS).length * AREAS.length * SPOTS.length);
});

test('draw-list edges: bands keep their size as their area slides off the frame (a sky scrolled up, a wrap seam)', () => {
  const area = { kind: 'rect', at: [0, -20], size: [W, 40] };
  const g = D.renderList(W, H, [{ kind: 'bands', area, stops: ['sky.light', 'sky', 'sky.dark', 'sky.deep'] }], { palette }).g;
  // 40 rows in 4 bands of 10, starting 20 rows above the frame: rows 0..9 of the frame are the third band
  const dark = g.get(5, 0), deep = g.get(5, 10);
  assert.notEqual(dark, deep);
  for (let y = 0; y < 10; y++) assert.equal(g.get(5, y), dark, `row ${y}`);
  for (let y = 10; y < 20; y++) assert.equal(g.get(5, y), deep, `row ${y}`);
  for (let y = 20; y < H; y++) assert.equal(g.get(5, y), 0, `row ${y}`);
});

test('draw-list edges: a 1 px line whose ends lie far off the frame still draws the part that crosses it', () => {
  const near = D.renderList(W, H, [{ kind: 'line', from: [-10, 5], to: [W + 10, 5], paint: 'cloth' }], { palette }).g;
  for (const [a, b] of [[[-1e6, 5], [1e6, 5]], [[-5000, 5], [40, 5]], [[-1e9, 5.5], [W + 1e9, 5.5]]]) {
    const out = D.renderList(W, H, [{ kind: 'line', from: a, to: b, paint: 'cloth' }], { palette });
    assert.deepEqual(out.skipped, []);
    for (let x = 0; x < W; x++) assert.equal(out.g.get(x, 5), near.get(x, 5), `line from ${a} to ${b}, x ${x}`);
  }
  // a steep far line crosses the frame on the right column
  const steep = D.renderList(W, H, [{ kind: 'line', from: [10, -1e7], to: [10, 1e7], paint: 'cloth' }], { palette }).g;
  for (let y = 0; y < H; y++) assert.notEqual(steep.get(10, y), 0, `row ${y}`);
  // a line near the frame is still exactly Surface.line (Bresenham from its own ends)
  const diag = D.renderList(W, H, [{ kind: 'line', from: [-30, -7], to: [40, 20], paint: 'cloth' }], { palette }).g;
  const ref = D.renderList(W + 2 * PAD, H + 2 * PAD, [{ kind: 'line', from: [-30 + PAD, -7 + PAD], to: [40 + PAD, 20 + PAD], paint: 'cloth' }], { palette }).g;
  assert.equal(sameCut(diag, ref), null);
});

// ---- shapes on frames ------------------------------------------------------------------------------------------

/** The local test of a primitive (rig-convention angles: 0 down, 90 right; turn clockwise on screen) and how far a local point is from its edge. */
function local(p) {
  if (p.kind === 'arc' || p.kind === 'ring') {
    const lo = p.kind === 'ring' ? 0 : Math.min(p.a0, p.a1) * Math.PI / 180, span = p.kind === 'ring' ? 2 * Math.PI : Math.abs(p.a1 - p.a0) * Math.PI / 180, t = (p.thick ?? 1) / 2;
    return (x, y) => {
      const d = Math.hypot(x - p.at[0], y - p.at[1]);
      let a = Math.atan2(x - p.at[0], y - p.at[1]) - lo;
      a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const edge = Math.min(Math.abs(Math.abs(d - p.r) - t), p.kind === 'ring' ? Infinity : Math.min(Math.abs(a - span), a, 2 * Math.PI - a) * d);
      return { inside: Math.abs(d - p.r) <= t && a <= span, edge };
    };
  }
  const [rx, ry] = Array.isArray(p.r) ? p.r : [p.r, p.r], tr = (p.turn ?? 0) * Math.PI / 180, ct = Math.cos(tr), st = Math.sin(tr);
  return (x, y) => {
    const dx = x - p.at[0], dy = y - p.at[1], u = dx * ct + dy * st, v = dy * ct - dx * st, q = (u / rx) ** 2 + (v / ry) ** 2;
    return { inside: q <= 1, edge: Math.abs(Math.sqrt(q) - 1) * Math.min(rx, ry) };
  };
}

/** Every pixel the placed primitive covers is one whose centre, taken back into the frame, is inside the local shape (bar float ties on its edge). */
function coversExactly(p, frame, label) {
  const size = 64, g = D.renderList(size, size, [D.placeOn({ ...p, paint: '#3a6ea5' }, frame)], { palette }).g, test = local(p);
  const { at, u, v } = frame;
  const n2 = u[0] * u[0] + u[1] * u[1];
  let drawn = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x + 0.5 - at[0], dy = y + 0.5 - at[1];
    // the frame is orthogonal (u and v the same length): local = (d . u, d . v) / |u|^2
    const lx = (dx * u[0] + dy * u[1]) / n2, ly = (dx * v[0] + dy * v[1]) / n2;
    const want = test(lx, ly), got = g.get(x, y) !== 0;
    if (got) drawn++;
    if (got !== want.inside) assert.ok(want.edge < 1e-6, `${label}: pixel ${x},${y} drawn ${got}, local shape says ${want.inside}`);
  }
  assert.ok(drawn > 4, `${label} drew`);
}

test('draw-list frames: an arc, a ring and a turned ellipse on turned, mirrored and scaled node frames cover exactly the placed shape', () => {
  const shapes = [
    { kind: 'arc', at: [3, -2], r: 9, a0: 20, a1: 140, thick: 2 },
    { kind: 'arc', at: [0, 0], r: 12, a0: 200, a1: 330, thick: 3 },
    { kind: 'ring', at: [-4, 3], r: 6, thick: 2 },
    { kind: 'ellipse', at: [5, 2], r: [9, 3], turn: 30 },
    { kind: 'ellipse', at: [-3, 4], r: [4, 8], turn: -65 },
  ];
  for (const p of shapes) for (const turn of [0, 25, 90, -140]) for (const mirror of [false, true]) for (const scale of [1, 1.5]) {
    const frame = D.nodeFrame({ at: [32.5, 31], turn, mirror, scale });
    const q = scale === 1 ? p : { ...p, r: Array.isArray(p.r) ? p.r.map((r) => r * scale) : p.r * scale, at: p.at.map((c) => c * scale), ...(p.thick ? { thick: p.thick } : {}) };
    // scaling is checked on the unscaled frame with scaled numbers: radii and positions scale, a stroke's thickness does not
    coversExactly(scale === 1 ? p : q, scale === 1 ? frame : D.nodeFrame({ at: [32.5, 31], turn, mirror }), `${p.kind} turn ${turn} mirror ${mirror} scale ${scale}`);
    if (scale !== 1) {
      const a = D.renderList(64, 64, [D.placeOn({ ...p, paint: 'cloth' }, frame)], { palette }).g;
      const b = D.renderList(64, 64, [D.placeOn({ ...q, paint: 'cloth' }, D.nodeFrame({ at: [32.5, 31], turn, mirror }))], { palette }).g;
      assert.ok(a.data.every((c, i) => c === b.data[i]), `${p.kind} turn ${turn} mirror ${mirror}: a scaled frame is the same as scaled numbers`);
    }
  }
});

test('draw-list frames: an arc and a turned ellipse on a bone frame (every direction) cover exactly the placed shape', () => {
  const shapes = [
    { kind: 'arc', at: [6, 0], r: 8, a0: 10, a1: 100, thick: 2 },
    { kind: 'arc', at: [4, 2], r: 10, a0: -60, a1: 60, thick: 1 },
    { kind: 'ellipse', at: [7, 0], r: [8, 3], turn: 20 },
  ];
  for (const p of shapes) for (let k = 0; k < 16; k++) {
    const a = (k * Math.PI) / 8 + 0.13;
    coversExactly(p, D.boneFrame([31.3, 30.8], a), `${p.kind} on a bone at ${a.toFixed(2)} rad`);
  }
});

test('draw-list frames: a mirrored node draws the left-right flip of the unmirrored node (arc, turned ellipse, stamp, rect)', () => {
  const shapes = [
    { kind: 'ellipse', at: [8, 3], r: [7, 2], turn: 30, paint: '#4f9d57' },
    { kind: 'arc', at: [0, 0], r: 12, a0: 30, a1: 120, thick: 2, paint: '#3a6ea5' },
    { kind: 'stamp', at: [-10, 5], rows: ['ab', 'a.'], key: { a: '#ff0000', b: '#0000ff' } },
    { kind: 'rect', at: [-12, -12], size: [5, 3], paint: '#aa00aa' },
  ];
  for (const turn of [0, 25, -70]) for (const s of shapes) {
    const a = D.renderList(64, 64, [D.placeOn(s, D.nodeFrame({ at: [32, 32], turn }))], { palette }).g;
    const b = D.renderList(64, 64, [D.placeOn(s, D.nodeFrame({ at: [32, 32], turn: -turn, mirror: true }))], { palette }).g;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      // silhouettes match exactly; the shade band stays on the side away from the top-right light, so colours may not
      assert.equal(a.get(x, y) !== 0, b.get(63 - x, y) !== 0, `${s.kind} turn ${turn}: pixel ${x},${y}`);
    }
  }
});
