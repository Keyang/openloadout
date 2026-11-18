// Framework additions made with batch S11 (the station walls and the machines set in them: sprites/tiles-station-walls.js,
// blast-door.js, wall-terminal.js, laser-gate.js), all in engine/bulkhead.js:
//   shadeTo                         a colour taken along its own ramp to a given brightness
//   BULKHEAD_STYLES, drawBulkhead   the front face of a plated metal wall, in bands counted from its foot
//   DOOR_STYLES, doorLeaves         the leaves of a sliding door (split, iris, shutter) at one moment of its opening
//   SCREEN_PICTURES, screenIn       what a small screen shows: text, a graph, a map, a skull, a tick
//   laserBeam                       a level beam of light that can thin, break and go out
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, brightness } from '../../engine/color.js';
import { TILE, patternFill, drawBlock } from '../../engine/tiles.js';
import { shadeTo, BULKHEAD_STYLES, drawBulkhead, DOOR_STYLES, doorLeaves, SCREEN_PICTURES, screenIn, laserBeam } from '../../engine/bulkhead.js';

const TONES = { base: '#6b7896', lit: '#9db2c5', soft: '#7f8fa9', seam: '#424672', skirt: '#575f84', dark: '#2f3059' };
const GLOW = '#2fb3a8', OFF = '#101020';
const at = (g, x, y) => g.data[y * g.w + x];
const count = (g, hex) => { const c = col(hex); return g.data.reduce((n, v) => n + (v === c ? 1 : 0), 0); };
const face = (opts) => { const s = new Surface(TILE, TILE); const rows = drawBulkhead(s, { tones: TONES, ...opts }); return { s, rows }; };

// ---- tones -----------------------------------------------------------------------------------

test('shadeTo: reaches the brightness asked for, darker or lighter, and leaves a colour that is already there alone', () => {
  for (const c of ['#434d6d', '#6b7896', '#a87894', '#6660b6']) {
    for (const want of [0.2, 0.35, 0.6]) assert.ok(Math.abs(brightness(shadeTo(c, want)) - want) < 0.02, `${c} to ${want}: ${brightness(shadeTo(c, want)).toFixed(3)}`);
  }
  assert.equal(shadeTo('#6b7896', brightness('#6b7896')), '#6b7896');
  assert.equal(shadeTo('#434d6d', 0.22), shadeTo('#434d6d', 0.22), 'the same every time');
});

// ---- the face of a wall ------------------------------------------------------------------------

test('drawBulkhead: the bands are counted from the foot, so the lower 21 rows of a tall face are the low face', () => {
  for (const style of BULKHEAD_STYLES) {
    const tall = face({ rows: 29, style, light: { on: GLOW }, bolts: 1, grime: 1 }), low = face({ rows: 21, style, light: { on: GLOW }, bolts: 1, grime: 1 });
    for (let y = 1; y < 21; y++) for (let x = 0; x < TILE; x++) assert.equal(at(tall.s, x, y + 8), at(low.s, x, y), `${style}: row ${y}, column ${x}`);
    assert.equal(tall.rows.pipe[0] - low.rows.pipe[0], 8);
    assert.equal(tall.rows.skirt[1], 28); assert.equal(low.rows.skirt[1], 20);
  }
});

test('drawBulkhead: draws nothing below its rows, a lit lip on the first row of the lower face, and a strip of light two rows under it', () => {
  const { s, rows } = face({ rows: 21, light: { on: GLOW } });
  for (let y = 21; y < TILE; y++) for (let x = 0; x < TILE; x++) assert.equal(at(s, x, y), 0, `nothing at ${x},${y}`);
  for (let x = 0; x < TILE; x++) assert.equal(at(s, x, rows.lip), col(TONES.lit));
  assert.equal(rows.strip, rows.lip + 2);
  assert.equal(count(s, GLOW), 24, 'two dashes of twelve px');
  assert.equal(count(face({ rows: 21 }).s, GLOW), 0, 'no light given, no strip');
  assert.equal(count(face({ rows: 21, light: { on: GLOW, off: OFF, dead: 1 } }).s, GLOW), 12, 'one dash is out');
});

test('drawBulkhead: bolts and grime add marks and never move the ones there; the three builds differ', () => {
  const bare = face({ rows: 29 }).s, bolted = face({ rows: 29, bolts: 1 }).s, half = face({ rows: 29, bolts: 0.5 }).s, dirty = face({ rows: 29, grime: 1 }).s, some = face({ rows: 29, grime: 0.4 }).s;
  const differs = (a, b) => a.data.reduce((n, v, i) => n + (v !== b.data[i] ? 1 : 0), 0);
  assert.ok(differs(bare, bolted) >= 16, 'eight bolts of four px (some pixels keep the wall colour)');
  assert.ok(differs(bare, half) > 0 && differs(bare, half) < differs(bare, bolted));
  for (let i = 0; i < bare.data.length; i++) if (half.data[i] !== bare.data[i]) assert.equal(half.data[i], bolted.data[i], 'a bolt of the half-bolted wall is a bolt of the fully bolted one');
  assert.ok(differs(bare, dirty) > differs(bare, some) && differs(bare, some) > 8);
  const [a, b, c] = BULKHEAD_STYLES.map((style) => face({ rows: 29, style }).s);
  assert.ok(differs(a, b) > 20 && differs(a, c) > 20 && differs(b, c) > 20);
  assert.throws(() => drawBulkhead(new Surface(TILE, TILE), { style: 'bricks', tones: TONES }), /not a wall build/);
});

test('drawBulkhead: as the face of a wall block it repeats across tiles (the last column leads into the first)', () => {
  const paint = patternFill(TONES.base, (s) => drawBulkhead(s, { rows: 29, tones: TONES, light: { on: GLOW }, grime: 1 }));
  const material = { fill: () => TONES.dark, face: { paint, shadow: OFF } };
  const a = new Surface(TILE, TILE), b = new Surface(TILE, TILE);
  drawBlock(a, 'bottom', material); drawBlock(b, 'bottom', material);
  assert.deepEqual([...a.data], [...b.data]);
  for (let x = 0; x < TILE; x++) assert.equal(at(a, x, 29), col('#231b33'), 'the base line');
  assert.equal(at(a, 0, 28), col(TONES.skirt), 'no dirt on the first column'); assert.equal(at(a, 31, 28), col(TONES.skirt), 'nor on the last');
});

// ---- doors -------------------------------------------------------------------------------------

const cover = (leaves, x, y, w, h, pick) => { let n = 0; for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) n += leaves.filter((l) => l[pick](i + 0.5, j + 0.5)).length; return n; };

test('doorLeaves: shut, the leaves of every door tile the doorway exactly once', () => {
  for (const style of DOOR_STYLES) {
    const leaves = doorLeaves(style, 8, 14, 48, 32, 0, { teeth: 2 });
    for (let j = 14; j < 46; j++) for (let i = 8; i < 56; i++) assert.equal(leaves.filter((l) => l.rest(i + 0.5, j + 0.5)).length, 1, `${style}: ${i},${j}`);
    assert.equal(cover(leaves, 0, 0, 64, 48, 'seen'), 48 * 32, `${style}: nothing shows outside the doorway`);
    for (const l of leaves) { assert.equal(l.dx, 0); assert.equal(l.dy, 0); }
  }
  assert.deepEqual(doorLeaves('split', 0, 0, 8, 8).map((l) => l.name), ['left', 'right']);
  assert.deepEqual(doorLeaves('iris', 0, 0, 8, 8).map((l) => l.name), ['top', 'bottom', 'left', 'right']);
  assert.deepEqual(doorLeaves('shutter', 0, 0, 8, 8).map((l) => l.name), ['curtain']);
  assert.throws(() => doorLeaves('swing', 0, 0, 8, 8), /not a way a door opens/);
});

test('doorLeaves: opening uncovers more and more; fully open, only the stubs are left, and with no stub nothing', () => {
  for (const style of DOOR_STYLES) {
    let last = Infinity;
    for (const k of [0, 0.25, 0.5, 0.75, 1]) { const n = cover(doorLeaves(style, 8, 14, 48, 32, k), 8, 14, 48, 32, 'seen'); assert.ok(n < last, `${style} at ${k}: ${n} < ${last}`); last = n; }
    assert.ok(last > 0 && last < 48 * 32 * 0.15, `${style}: stubs only (${last})`);
    assert.equal(cover(doorLeaves(style, 8, 14, 48, 32, 1, { stub: 0 }), 8, 14, 48, 32, 'seen'), 0, `${style}: gone with no stub`);
  }
  const [l, r] = doorLeaves('split', 8, 14, 48, 32, 1);
  assert.equal(l.dx, -22); assert.equal(r.dx, 22); assert.equal(l.dy, 0);
  assert.equal(doorLeaves('shutter', 8, 14, 48, 32, 1)[0].dy, -30);
});

test('doorLeaves: teeth make the seam of a split door step from one side of the middle to the other', () => {
  const [l] = doorLeaves('split', 8, 14, 48, 32, 0, { teeth: 2, pitch: 16 });
  assert.equal(l.rest(33.5, 14.5), true, 'the first tooth reaches two px past the middle'); assert.equal(l.rest(34.5, 14.5), false);
  assert.equal(l.rest(29.5, 22.5), true); assert.equal(l.rest(30.5, 22.5), false, 'the next one stops two px short of it');
  const [flat] = doorLeaves('split', 8, 14, 48, 32, 0);
  assert.equal(flat.rest(31.5, 14.5), true); assert.equal(flat.rest(32.5, 22.5), false);
});

// ---- screens ------------------------------------------------------------------------------------

const lit = (kind, phase, w = 16, h = 9) => { const f = screenIn(kind, 4, 3, w, h, phase), out = []; for (let y = 0; y < h + 6; y++) for (let x = 0; x < w + 8; x++) if (f(x + 0.5, y + 0.5)) out.push(`${x},${y}`); return out; };

test('screenIn: every picture lights something and stays inside the screen', () => {
  for (const kind of SCREEN_PICTURES) {
    for (const [w, h] of [[16, 9], [8, 10], [14, 9]]) {
      const on = lit(kind, 0.3, w, h);
      assert.ok(on.length >= 6, `${kind} ${w}x${h}: ${on.length} px`);
      assert.ok(on.length < w * h * 0.8, `${kind}: not a filled box`);
      for (const k of on) { const [x, y] = k.split(',').map(Number); assert.ok(x >= 4 && x < 4 + w && y >= 3 && y < 3 + h, `${kind}: ${k} is outside`); }
    }
  }
  assert.throws(() => screenIn('logo', 0, 0, 8, 8), /not a screen picture/);
});

test('screenIn: text, graph and map move and their loops close; the skull and the tick stand still; all five differ', () => {
  for (const kind of ['text', 'graph', 'map']) {
    assert.notDeepEqual(lit(kind, 0), lit(kind, 0.5), `${kind} moves`);
    assert.deepEqual(lit(kind, 0), lit(kind, 1), `${kind}: the loop closes`);
  }
  for (const kind of ['skull', 'tick']) assert.deepEqual(lit(kind, 0), lit(kind, 0.5));
  const all = SCREEN_PICTURES.map((k) => lit(k, 0).join(' '));
  assert.equal(new Set(all).size, SCREEN_PICTURES.length);
  // the text climbs one row per eighth of the loop
  const rowsOf = (list) => [...new Set(list.map((k) => Number(k.split(',')[1])))];
  assert.notDeepEqual(rowsOf(lit('text', 0)), rowsOf(lit('text', 0.125)));
});

// ---- the beam -------------------------------------------------------------------------------------

const C = ['#ffffff', '#ffb0a0', '#f07060', '#e2473f', '#901030'];
const beam = (o) => { const g = new Surface(48, 16); const n = laserBeam(g, { x0: 4, x1: 43, y: 8, colours: C, ...o }); return { g, n }; };

test('laserBeam: a white core between rows of its colour, with a dark rim from five px up; one px is a pale line', () => {
  const column = (g) => Array.from({ length: 16 }, (_, y) => at(g, 20, y)).filter(Boolean);
  assert.deepEqual(column(beam({ thick: 1 }).g), [col(C[1])]);
  assert.deepEqual(column(beam({ thick: 3 }).g), [C[3], C[0], C[3]].map(col));
  assert.deepEqual(column(beam({ thick: 5 }).g), [C[4], C[3], C[0], C[3], C[4]].map(col));
  assert.deepEqual(column(beam({ thick: 7 }).g), [C[4], C[3], C[1], C[0], C[1], C[3], C[4]].map(col));
  const { g, n } = beam({ thick: 3 });
  assert.equal(n, 40 * 3);
  assert.deepEqual(g.bounds(), { x0: 4, y0: 7, x1: 43, y1: 9 });
});

test('laserBeam: cut breaks it away piece by piece until nothing is left; phase slides the breaks', () => {
  let last = Infinity;
  for (const cut of [0, 0.3, 0.6, 0.9]) { const { n } = beam({ thick: 1, cut }); assert.ok(n <= last, `cut ${cut}`); last = n; }
  assert.ok(beam({ thick: 1, cut: 0.5 }).n > 0 && beam({ thick: 1, cut: 0.5 }).n < 40);
  assert.equal(beam({ thick: 5, cut: 1 }).n, 0);
  assert.equal(count(beam({ thick: 5, cut: 1 }).g, C[0]), 0);
  assert.notDeepEqual([...beam({ thick: 1, cut: 0.5, phase: 0 }).g.data], [...beam({ thick: 1, cut: 0.5, phase: 0.5 }).g.data]);
  assert.deepEqual([...beam({ thick: 1, cut: 0.5, seed: 2 }).g.data], [...beam({ thick: 1, cut: 0.5, seed: 2 }).g.data], 'the same every time');
});
