// engine/weather.js: a screen-wide field of falling pieces that wraps round the inner 62x62 square of a 64x64 frame
// and closes its loop (core-sprites-2, helper batch H1a).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { WEATHER_PIECES, fallLattice, fallAt, fallPiece, fallField } from '../../engine/weather.js';

const C = ['#9fd3e6', '#f0ead8', '#c98a4a'];
const field = (t, o = {}) => { const g = new Surface(64, 64); fallField(g, { t, cols: 6, rows: 3, colours: C, ...o }); return g; };
const opaque = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const frames = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => i / 8);
const sizeOf = { dot: 2, streak: 5, flake: 3, leaf: 5, petal: 4, seed: 1, ash: 3, grain: 4 };

test('WEATHER_PIECES lists the eight shapes and is frozen', () => {
  assert.deepEqual([...WEATHER_PIECES], ['dot', 'streak', 'flake', 'leaf', 'petal', 'seed', 'ash', 'grain']);
  assert.ok(Object.isFrozen(WEATHER_PIECES));
});

test('(1) the outer rows and columns stay empty for every shape, slant, axis and frame', () => {
  for (const shape of WEATHER_PIECES) for (const slant of [-1, 0, 1]) for (const axis of ['y', 'x']) for (const t of frames) {
    const g = field(t, { shape, slant, axis, size: sizeOf[shape], sway: 3, rows: 4, cols: 10, laps: 2, rim: '#7a3b2e', core: '#e6c545', coreEvery: 2 });
    for (let k = 0; k < 64; k++) {
      for (const [x, y] of [[k, 0], [k, 63], [0, k], [63, k]]) assert.equal(g.get(x, y), 0, `${shape} slant ${slant} axis ${axis} t ${t}: (${x}, ${y})`);
    }
  }
});

test('(2) the loop closes: t = 0 and t = 1 give the same pixels', () => {
  for (const laps of [1, 2, 3]) for (const rows of [1, 2, 3, 4, 5]) for (const turns of [1, 2, 3]) {
    for (const shape of ['leaf', 'ash']) {
      const o = { shape, laps, rows, turns, size: 4, sway: 2, swayCycles: 2, coreEvery: 2, core: '#e6c545', slant: rows % 2 ? 1 : 0 };
      assert.deepEqual(field(1, o).data, field(0, o).data, `${shape} laps ${laps} rows ${rows} turns ${turns}`);
    }
  }
  // every far layer of the Weather section: half the columns rounded up, far laps, shift [17, 23]
  const far = (cols, o) => ({ cols: Math.ceil(cols / 2), shift: [17, 23], ...o });
  const layers = {
    'rain drizzle': far(8, { shapes: ['dot', { shape: 'streak', size: 2 }], rows: 3, laps: 1, size: 1 }),
    'rain rain': far(8, { shape: 'streak', rows: 2, laps: 3, size: 4 }),
    'rain storm': far(12, { shape: 'streak', rows: 2, laps: 3, slant: 1, size: 5 }),
    'snow soft': far(7, { shape: 'flake', rows: 4, laps: 1, size: 1, sway: 1.5, swayCycles: 2 }),
    'snow blizzard': far(12, { shape: 'flake', rows: 3, laps: 2, slant: 1, size: 2, sway: 3, swayCycles: 2 }),
    'snow sleet': far(9, { shapes: [{ shape: 'streak', size: 3 }, 'dot'], rows: 3, laps: 1, sway: 1, swayCycles: 2 }),
  };
  for (const [name, o] of Object.entries(layers)) assert.deepEqual(field(1, o).data, field(0, o).data, name);
  assert.throws(() => field(0, { turns: 1.5 }), /turns/);
});

test('(3) it wraps: shift [31, 31] is the inner square rolled by 31 both ways', () => {
  for (const shape of WEATHER_PIECES) for (const t of [0, 0.375]) {
    const o = { shape, size: sizeOf[shape], slant: 1, sway: 2, cols: 9 };
    const a = field(t, o), b = field(t, { ...o, shift: [31, 31] });
    for (let y = 0; y < 62; y++) for (let x = 0; x < 62; x++) {
      assert.equal(b.get(1 + ((x + 31) % 62), 1 + ((y + 31) % 62)), a.get(1 + x, 1 + y), `${shape} t ${t} (${x}, ${y})`);
    }
  }
});

test('(4) no band: every quarter of the inner square holds 15% to 35% of the pixels over 8 frames', () => {
  for (const cols of [4, 12]) for (const axis of ['y', 'x']) {
    const q = [0, 0, 0, 0];
    for (const t of frames) {
      const g = field(t, { cols, rows: 3, laps: 2, shape: 'streak', size: 4, axis });
      for (let y = 1; y < 63; y++) for (let x = 1; x < 63; x++) if (g.get(x, y)) q[(x >= 32 ? 1 : 0) + (y >= 32 ? 2 : 0)]++;
    }
    const all = q.reduce((a, b) => a + b, 0);
    for (const n of q) assert.ok(n / all >= 0.15 && n / all <= 0.35, `cols ${cols} axis ${axis}: quarters ${q.join(', ')}`);
  }
});

test('(5) a piece keeps itself: fixed shapes keep their pixel count, leaves and petals stay over half their widest', () => {
  const alone = (t, o) => opaque(field(t, { cols: 1, rows: 1, laps: 1, ...o }));
  for (const shape of ['dot', 'streak', 'flake', 'seed', 'ash', 'grain']) for (const slant of [0, 1]) for (const size of [1, 2, 3, 5]) {
    const counts = frames.map((t) => alone(t, { shape, size, slant, turns: 2, sway: 2 }));
    assert.equal(new Set(counts).size, 1, `${shape} size ${size} slant ${slant}: ${counts.join(', ')}`);
  }
  for (const shape of ['leaf', 'petal']) for (const size of [2, 3, 4, 5]) for (const turns of [1, 3]) {
    for (const seed of [0, 1, 2, 3, 4]) {
      const counts = [];
      for (let k = 0; k < 64; k++) counts.push(alone(k / 64, { shape, size, turns, seed }));
      assert.ok(Math.min(...counts) >= Math.max(...counts) / 2, `${shape} size ${size} seed ${seed}: ${Math.min(...counts)} of ${Math.max(...counts)}`);
    }
  }
  for (const axis of ['y', 'x']) for (const slant of [-1, 0, 1]) for (const size of [2, 4, 6]) for (const t of frames) {
    const g = field(t, { cols: 1, rows: 1, shape: 'grain', size, axis, slant, sway: 2 });
    const px = [];
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (g.get(x, y)) px.push([x, y]);
    assert.equal(px.length, size, `grain ${size} axis ${axis} slant ${slant}`);
    const line = new Set(px.map(([x, y]) => (axis === 'x' ? y : x)));
    assert.equal(line.size, 1, `grain ${size} axis ${axis} slant ${slant}: not one line`);
  }
});

test('(6) fallLattice keeps every column gap of at least gap x period / cols, across the wrap too', () => {
  for (const cols of [1, 3, 4, 8, 12]) for (const seed of [0, 1, 2, 7]) for (const gap of [0.3, 0.6, 0.9]) {
    const L = fallLattice({ cols, rows: 3, seed, gap });
    assert.equal(L.length, cols * 3);
    const xs = [...new Set(L.map((p) => p.x))].sort((a, b) => a - b);
    assert.equal(xs.length, cols);
    if (cols < 2) continue;
    for (let i = 0; i < cols; i++) {
      const d = i === cols - 1 ? xs[0] + 62 - xs[i] : xs[i + 1] - xs[i];
      assert.ok(d >= (gap * 62) / cols - 1e-9, `cols ${cols} seed ${seed} gap ${gap}: ${d}`);
    }
    for (const p of L) assert.ok(p.x >= 0 && p.x < 62 && p.y >= 0 && p.y < 62);
  }
});

test('(7) same arguments, same pixels; another seed, other pixels', () => {
  const o = { shape: 'flake', size: 2, sway: 2 };
  assert.deepEqual(field(0.25, o).data, field(0.25, o).data);
  assert.notDeepEqual(field(0.25, { ...o, seed: 3 }).data, field(0.25, o).data);
});

test('(8) a slant other than -1, 0 or 1 throws and says why', () => {
  assert.throws(() => field(0, { slant: 0.5 }), /slant 0\.5 must be -1, 0 or 1/);
  assert.throws(() => fallAt({ col: 0, x: 0, y: 0 }, 0, { rows: 2, slant: 2 }), /whole number of periods/);
});

test('(9) shapes: mixed columns by name or { shape, size }', () => {
  // which columns drew what: draw each column's pieces alone by comparing against single-shape fields
  const mixed = field(0.25, { cols: 6, shapes: ['dot', { shape: 'streak', size: 2 }], size: 1, colours: ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666'] });
  const count = (g, hex) => { const v = new Surface(1, 1).dot(0, 0, hex).data[0]; return g.data.reduce((n, p) => n + (p === v ? 1 : 0), 0); };
  const cols6 = ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666'];
  // 3 rows a column: dots of size 1 are 1 px each, 2 px streaks 2 px each
  cols6.forEach((hex, i) => assert.equal(count(mixed, hex), i % 2 ? 6 : 3, `column ${i}`));
  const third = field(0.25, { cols: 6, shapes: ['grain', 'grain', 'leaf'], size: 3, colours: cols6 });
  const leafOnly = field(0.25, { cols: 6, shape: 'leaf', size: 3, colours: cols6 });
  const grainOnly = field(0.25, { cols: 6, shape: 'grain', size: 3, colours: cols6 });
  cols6.forEach((hex, i) => assert.equal(count(third, hex), count(i % 3 === 2 ? leafOnly : grainOnly, hex), `column ${i}`));
  for (const s of ['dot', 'leaf', { shape: 'streak', size: 3 }]) {
    const one = typeof s === 'string' ? { shape: s } : { shape: s.shape, size: s.size };
    assert.deepEqual(field(0.5, { shapes: [s] }).data, field(0.5, one).data, JSON.stringify(s));
  }
});

test('fallAt is a function of height: pieces of one column follow one path, and axis x swaps the axes', () => {
  const [p] = fallLattice({ cols: 1, rows: 2, seed: 4 });
  const o = { rows: 2, laps: 1, sway: 2, swayCycles: 2, slant: 1 };
  const a = fallAt(p, 0.5, o), b = fallAt({ ...p, row: 1, y: (p.y + 15.5) % 62 }, 0, o);   // half a loop: half a row gap on
  assert.ok(Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.turn - b.turn) < 1e-6);
  const x = fallAt(p, 0.3, { ...o, axis: 'x' }), y = fallAt(p, 0.3, o);
  assert.equal(x.x, y.y); assert.equal(x.y, y.x);
  assert.throws(() => fallAt(p, 0, { rows: 2, turns: 0 }), /turns/);
});

test('fallPiece draws inside its box and throws on an unknown shape', () => {
  for (const shape of WEATHER_PIECES) {
    const g = new Surface(16, 16);
    fallPiece(g, shape, 4, 4, { size: 5, colour: '#f0ead8', core: '#e6c545', box: [3, 3, 9, 9] });
    const b = g.bounds();
    assert.ok(b && b.x0 >= 3 && b.y0 >= 3 && b.x1 < 9 && b.y1 < 9, `${shape}: ${JSON.stringify(b)}`);
  }
  assert.throws(() => fallPiece(new Surface(8, 8), 'hail', 4, 4), /not one of/);
  // the ash core lights only while the turn is under 0.5, and the count stays the same
  const lit = (turn) => { const g = new Surface(8, 8); fallPiece(g, 'ash', 4, 4, { size: 3, colour: '#888888', core: '#e6c545', turn }); return g; };
  const core = new Surface(1, 1).dot(0, 0, '#e6c545').data[0];
  assert.ok(lit(0.1).data.includes(core));
  assert.ok(!lit(0.6).data.includes(core));
  assert.equal(opaque(lit(0.1)), opaque(lit(0.6)));
});
