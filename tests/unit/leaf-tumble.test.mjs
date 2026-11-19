// engine/leaf-tumble.js: hand-made leaf pictures that are always a pointed leaf, and a wrapping field of them on
// weather.js's lattice (core-sprites-2, batch K19 fix round: falling-leaves).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { LEAF_LENGTHS, leafCells, leafField } from '../../engine/leaf-tumble.js';

const C = ['#c0502e', '#e6c545'];
const field = (t, o = {}) => { const g = new Surface(64, 64); leafField(g, { t, cols: 6, rows: 2, colours: C, sway: 3, ...o }); return g; };
const angles = Array.from({ length: 32 }, (_, i) => (i / 32) * Math.PI * 2);
const turns = [0, 0.17, 0.25, 0.5, 0.67, 0.75, 0.9];

// extent of a cell set along and across the direction it is drawn in (one of 8)
function extents(cells, angle) {
  const k = ((Math.round(Math.atan2(Math.cos(angle), Math.sin(angle)) / (Math.PI / 4)) % 8) + 8) % 8;
  const [ux, uy] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]][k];
  const along = cells.map(([x, y]) => x * ux + y * uy), across = cells.map(([x, y]) => x * uy - y * ux);
  const span = (v) => Math.max(...v) - Math.min(...v);
  return { along: span(along), across: span(across) };
}
const isPlus = (cells) => {
  const s = new Set(cells.map(([x, y]) => `${x},${y}`));
  return cells.some(([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, b]) => s.has(`${x + a},${y + b}`)) && cells.length <= 5);
};
const isBar = (cells) => new Set(cells.map(([x]) => x)).size === 1 || new Set(cells.map(([, y]) => y)).size === 1;

test('LEAF_LENGTHS is 3, 4, 5 and frozen', () => {
  assert.deepEqual([...LEAF_LENGTHS], [3, 4, 5]);
  assert.ok(Object.isFrozen(LEAF_LENGTHS));
});

test('every pose at size 4 and 5 is a pointed leaf: longer than wide, never a plus or a bar', () => {
  for (const size of [4, 5]) for (const angle of angles) for (const turn of turns) {
    const cells = leafCells({ size, angle, turn, colour: C[0] });
    const { along, across } = extents(cells, angle);
    assert.ok(along > across, `size ${size} angle ${angle.toFixed(2)} turn ${turn}: along ${along} across ${across}`);
    assert.ok(cells.length >= size + 2, `size ${size}: ${cells.length} cells`);
    assert.ok(!isPlus(cells), 'a plus');
    assert.ok(!isBar(cells), 'a straight bar');
  }
});

test('the back face is the front face mirrored, in darker tones, with the same cell count', () => {
  for (const size of [3, 4, 5]) for (const angle of angles) {
    const f = leafCells({ size, angle, turn: 0.1, colour: C[0] }), b = leafCells({ size, angle, turn: 0.6, colour: C[0] });
    assert.equal(f.length, b.length);
    assert.notDeepEqual(f.map((c) => c[2]).sort(), b.map((c) => c[2]).sort());
    assert.ok(f.some((c) => c[2] === C[0]), 'front shows the leaf colour');
  }
});

test('the outer rows and columns stay empty and the loop closes', () => {
  for (const slant of [-1, 0, 1]) for (const laps of [1, 2]) for (const tn of [1, 2, 3]) for (const size of [3, 4, 5]) {
    const o = { slant, laps, turns: tn, size, swayCycles: tn };
    assert.deepEqual(field(1, o).data, field(0, o).data, `slant ${slant} laps ${laps} turns ${tn} size ${size}`);
    for (let f = 0; f < 8; f++) {
      const g = field(f / 8, o);
      for (let k = 0; k < 64; k++) for (const [x, y] of [[k, 0], [k, 63], [0, k], [63, k]]) assert.equal(g.get(x, y), 0);
    }
  }
});

test('it wraps: shift [31, 31] is the inner square rolled by 31 both ways', () => {
  const a = field(0.25), b = field(0.25, { shift: [31, 31] });
  for (let y = 0; y < 62; y++) for (let x = 0; x < 62; x++) {
    assert.equal(b.get(1 + ((x + 31) % 62), 1 + ((y + 31) % 62)), a.get(1 + x, 1 + y));
  }
});

test('same arguments give the same pixels; another seed other pixels', () => {
  assert.deepEqual(field(0.4).data, field(0.4).data);
  assert.notDeepEqual(field(0.4).data, field(0.4, { seed: 3 }).data);
});
