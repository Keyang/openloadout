// Playground: the ground it paints itself when the bag has no side-view tileset (app/play/draw.js, plainGround).
// A floating block once had two thin dirt lines hanging under its bottom corners, like little legs: the darker line
// down each open side started under the grass but was still drawn a whole tile long.
// The painter only uses fillStyle and fillRect, so it is run here on a sheet of plain cells, with no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { plainGround } from '../../app/play/draw.js';
import { makeLevel, CELL } from '../../app/play/level.js';

const C = { dirt: 'dirt', dirtSpeck: 'speck', grass: 'grass', grassEdge: 'edge' };
const BLADE = 2;                    // a blade of grass stands this many pixels above a top

/** A sheet that remembers the last colour put on each pixel, and takes the same calls as a canvas. */
function sheet(w, h) {
  const px = new Array(w * h).fill(null);
  return {
    w, h, fillStyle: null,
    fillRect(x, y, rw, rh) { for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) if (i >= 0 && j >= 0 && i < w && j < h) px[j * w + i] = this.fillStyle; },
    at: (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? null : px[y * w + x]),
  };
}

/** A small level from rows of text: # ground, / a slope going up to the right, \ a slope going down, anything else empty. */
function levelOf(rows, tile = 32) {
  const cols = rows[0].length, cells = new Uint8Array(cols * rows.length);
  rows.forEach((row, r) => [...row].forEach((ch, c) => { cells[r * cols + c] = ch === '#' ? CELL.SOLID : ch === '/' ? CELL.UP : ch === '\\' ? CELL.DOWN : CELL.EMPTY; }));
  return { mode: 'side', tile, cols, rows: rows.length, cells, width: cols * tile, height: rows.length * tile, thins: [] };
}

const paint = (level) => { const g = sheet(level.width, level.height); plainGround(g, level, C); return g; };
const cellAt = (level, c, r) => (c < 0 || r < 0 || c >= level.cols || r >= level.rows ? CELL.EMPTY : level.cells[r * level.cols + c]);
/** Is this pixel part of the ground of the level: inside a block, or on or under the line of a slope? */
function inGround(level, x, y) {
  const T = level.tile, c = Math.floor(x / T), r = Math.floor(y / T), v = cellAt(level, c, r);
  if (v === CELL.SOLID) return true;
  if (v === CELL.UP) return y - r * T >= T - 1 - (x - c * T);
  if (v === CELL.DOWN) return y - r * T >= x - c * T;
  return false;
}

/** Every pixel that was painted where there is no ground: [x, y, colour]. */
function strays(level, g) {
  const out = [];
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const colour = g.at(x, y);
    if (colour === null || inGround(level, x, y)) continue;
    // a blade of grass: just above the top of a block, in the colour of the grass's edge
    const blade = colour === C.grassEdge && inGround(level, x, y + BLADE) && cellAt(level, Math.floor(x / level.tile), Math.floor((y + BLADE) / level.tile)) === CELL.SOLID;
    if (!blade) out.push([x, y, colour]);
  }
  return out;
}

const SHAPES = {
  'one block on its own': ['.....', '..#..', '.....', '.....', '#####'],
  'a ledge one high': ['......', '.###..', '......', '......', '######'],
  'a block two tall': ['....', '.#..', '.#..', '....', '....', '####'],
  'a block in the top row of the level': ['.#.', '...', '...', '###'],
  'a block at each side edge of the level': ['#..#', '....', '....', '####'],
  'a step with a slope up and a slope down': ['.......', '.......', './##\\..', '#######'],
  'an overhang: a block with ground beside it but nothing under it': ['.....', '.##..', '.#...', '#####'],
};

test('plain ground: under a floating block there is nothing, not even a line at its corners', () => {
  for (const [name, rows] of Object.entries(SHAPES)) {
    const level = levelOf(rows), g = paint(level), T = level.tile;
    for (let r = 0; r < level.rows; r++) for (let c = 0; c < level.cols; c++) {
      if (cellAt(level, c, r) !== CELL.SOLID || r + 1 >= level.rows || cellAt(level, c, r + 1) !== CELL.EMPTY) continue;
      // the whole cell under it, from one pixel left of the block to one pixel right of it
      for (let y = (r + 1) * T; y < (r + 2) * T - BLADE; y++) for (let x = c * T; x < (c + 1) * T; x++) assert.equal(g.at(x, y), null, `${name}: a ${g.at(x, y)} pixel hangs ${y - (r + 1) * T + 1} px under the block at column ${c}, row ${r} (x ${x - c * T} of the block)`);
    }
  }
});

test('plain ground: nothing is painted outside the cells that hold ground, except blades of grass above a top', () => {
  const levels = Object.entries(SHAPES).map(([name, rows]) => [name, levelOf(rows)]);
  levels.push(['the side-view level of the playground', makeLevel('side')]);
  for (const [name, level] of levels) {
    const out = strays(level, paint(level));
    assert.deepEqual(out.slice(0, 5), [], `${name}: ${out.length} pixels painted where there is no ground`);
  }
});

test('plain ground: every block is painted whole, with grass on an open top and a darker line on each open side and underside', () => {
  for (const [name, rows] of Object.entries(SHAPES)) {
    const level = levelOf(rows), g = paint(level), T = level.tile;
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (inGround(level, x, y)) assert.notEqual(g.at(x, y), null, `${name}: a hole in the ground at ${x}, ${y}`);
    for (let r = 0; r < level.rows; r++) for (let c = 0; c < level.cols; c++) {
      if (cellAt(level, c, r) !== CELL.SOLID) continue;
      // open: empty and inside the level (past its side edges and under it the ground is taken to carry on)
      const x = c * T, y = r * T, open = (dc, dr) => c + dc >= 0 && c + dc < level.cols && r + dr < level.rows && cellAt(level, c + dc, r + dr) === CELL.EMPTY;
      const where = `${name}: the block at column ${c}, row ${r}`;
      if (open(0, -1)) for (let i = 0; i < T; i++) assert.equal(g.at(x + i, y), C.grass, `${where} has grass along its top`);
      // the side lines run from under the grass (or from the top) down to the bottom of the block, and stop there
      const from = open(0, -1) ? 6 : 0;
      if (open(-1, 0)) for (let j = from; j < T; j++) assert.equal(g.at(x, y + j), C.dirtSpeck, `${where} has a line down its left side at ${j}`);
      if (open(1, 0)) for (let j = from; j < T; j++) assert.equal(g.at(x + T - 1, y + j), C.dirtSpeck, `${where} has a line down its right side at ${j}`);
      if (open(0, 1)) for (let i = 0; i < T; i++) assert.equal(g.at(x + i, y + T - 1), C.dirtSpeck, `${where} has a line along its underside`);
    }
  }
});

test('plain ground: the side-view level has floating blocks one high, so the checks above look at the real thing', () => {
  const level = makeLevel('side');
  let oneHigh = 0;
  for (let r = 1; r < level.rows - 1; r++) for (let c = 0; c < level.cols; c++) if (cellAt(level, c, r) === CELL.SOLID && cellAt(level, c, r - 1) === CELL.EMPTY && cellAt(level, c, r + 1) === CELL.EMPTY) oneHigh++;
  assert.ok(oneHigh >= 1);
});
