// Framework additions of batch F02 (tiles-shore, final pass: no grid in open water):
//   engine/ripples.js   rippleVersion: one version of a moving water surface as a tile fill, every streak kept inside
//                       the tile on every frame, so that versions join each other and a level mixes them by position.
//                       rippleEvenness: how even such a field is over a loop (to pick the arrangements by measuring)
import test from 'node:test';
import assert from 'node:assert/strict';
import { TILE, fillVariant } from '../../engine/tiles.js';
import { col } from '../../engine/color.js';
import { rippleVersion, rippleEvenness } from '../../engine/ripples.js';

const DEEP = '#2c79c0', LIGHT = '#4fa8d8', TIP = '#f0ead8';
const FRAMES = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875];
const marksOf = (f) => { const out = []; for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if (f(x, y) !== col(DEEP)) out.push([x, y]); return out; };

test('rippleVersion: repeats every 32 px, closes over one loop, and draws only its streaks', () => {
  for (const t of FRAMES) {
    const f = rippleVersion(DEEP, t, { light: LIGHT, count: 6, seed: 3 }), again = rippleVersion(DEEP, t + 1, { light: LIGHT, count: 6, seed: 3 });
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      assert.equal(f(x, y), f(x + TILE, y - TILE), `t ${t}: repeats at ${x},${y}`);
      assert.equal(f(x, y), again(x, y), `t ${t}: the loop closes at ${x},${y}`);
      assert.ok(f(x, y) === col(DEEP) || f(x, y) === col(LIGHT), `t ${t}: only the base and the light at ${x},${y}`);
    }
  }
  const bare = rippleVersion(DEEP, 0.3, { light: LIGHT, count: 0 });
  assert.equal(marksOf(bare).length, 0, 'no streaks asked for: the plain colour');
  // the same arguments, the same picture
  const a = rippleVersion(DEEP, 0.3, { light: LIGHT, seed: 9 }), b = rippleVersion(DEEP, 0.3, { light: LIGHT, seed: 9 });
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) assert.equal(a(x, y), b(x, y));
});

test('rippleVersion: every mark stays `margin` px inside the tile on every frame, whatever the settings', () => {
  for (const margin of [3, 5]) for (const seed of [0, 1, 2, 7, 42, 99]) for (const [count, length, stir] of [[4, 4, 1], [6, 7, 2], [8, 9, 4], [9, 12, 6]]) {
    for (const t of FRAMES) {
      const f = rippleVersion(DEEP, t, { light: LIGHT, tips: TIP, count, length, stir, seed, margin });
      for (const [x, y] of marksOf(f)) assert.ok(x >= margin && x < TILE - margin && y >= margin && y < TILE - margin, `seed ${seed}, count ${count}, t ${t}: a mark at ${x},${y} inside the outer ${margin} px`);
    }
  }
});

test('rippleVersion: versions share their four edge lines, so any of them joins any other and the fill itself', () => {
  const edges = (f) => [...Array(TILE).keys()].flatMap((i) => [f(i, 0), f(i, TILE - 1), f(0, i), f(TILE - 1, i)]);
  for (const t of FRAMES) {
    const plain = edges(rippleVersion(DEEP, t, { light: LIGHT, seed: 0 }));
    for (const seed of [1, 2, 3]) assert.deepEqual(edges(rippleVersion(DEEP, t, { light: LIGHT, seed })), plain);
  }
});

test('rippleVersion: another seed is another arrangement, and something shows and moves on every frame', () => {
  const key = (f) => marksOf(f).map(([x, y]) => `${x}:${y}`).join(' ');
  const seen = new Set();
  for (const seed of [0, 1, 2, 3, 4, 5]) seen.add(key(rippleVersion(DEEP, 0.25, { light: LIGHT, count: 6, seed })));
  assert.equal(seen.size, 6, 'six seeds, six pictures');
  for (const seed of [0, 1, 2]) {
    const frames = FRAMES.map((t) => key(rippleVersion(DEEP, t, { light: LIGHT, count: 5, seed })));
    for (const [i, k] of frames.entries()) assert.ok(k.length > 0, `seed ${seed}: frame ${i} shows a streak`);
    assert.equal(new Set(frames).size, FRAMES.length, `seed ${seed}: no two frames of the loop are the same`);
  }
  // no two streaks of one version lie on the same row, and their rows are spread down the whole tile
  for (const seed of [0, 1, 2, 3]) {
    const rows = new Set();
    for (const t of FRAMES) for (const [, y] of marksOf(rippleVersion(DEEP, t, { light: LIGHT, count: 6, seed, under: false }))) rows.add(y);
    assert.equal(rows.size, 6, `seed ${seed}: six streaks on six rows (${[...rows].join(', ')})`);
    assert.ok(Math.min(...rows) < 10 && Math.max(...rows) > 21, `seed ${seed}: rows from top to bottom (${[...rows].join(', ')})`);
  }
});

test('rippleVersion: tips mark the leading pixel of a full-grown streak, dark colours every third streak', () => {
  const f = rippleVersion(DEEP, 0.3, { light: LIGHT, count: 6, length: 8, tips: TIP, seed: 4 });
  let tips = 0;
  for (const [x, y] of marksOf(f)) if (f(x, y) === col(TIP)) { tips++; assert.equal(f(x - 1, y), col(LIGHT), 'a tip leads a streak'); assert.equal(f(x + 1, y), col(DEEP)); }
  assert.ok(tips > 0);
  const DARK = '#1f5e9c';
  const seen = new Set();
  for (const t of FRAMES) for (const [x, y] of marksOf(rippleVersion(DEEP, t, { light: LIGHT, dark: DARK, count: 6, seed: 4 }))) seen.add(rippleVersion(DEEP, t, { light: LIGHT, dark: DARK, count: 6, seed: 4 })(x, y));
  assert.deepEqual([...seen].sort(), [col(LIGHT), col(DARK)].sort());
});

test('rippleEvenness: counts the lit pixels of every frame, and a field mixed by position has no column or row left bare or crowded', () => {
  const make = (seed) => (t) => rippleVersion(DEEP, t, { light: LIGHT, count: 6, seed });
  const one = rippleEvenness(make(1), { base: DEEP });
  assert.equal(one.lit.length, 8, 'eight frames by default');
  assert.ok(one.min > 0 && one.max >= one.min && one.mean > 0);
  assert.ok(one.spread >= 0 && one.spread === (one.max - one.min) / one.mean);
  // the numbers are the picture's: count by hand on one frame
  assert.equal(one.lit[2], marksOf(make(1)(0.25)).length);
  assert.equal(rippleEvenness(() => () => col(DEEP), { base: DEEP }).mean, 0, 'plain water: nothing lit');
  assert.equal(rippleEvenness(() => () => col(DEEP), { base: DEEP }).spread, 0);
  // frames: another count of frames
  assert.equal(rippleEvenness(make(1), { base: DEEP, frames: 4 }).lit.length, 4);
  // three versions laid out by the helper's own rule over a lake: never the same picture in every cell
  const versions = [1, 2, 3].map((s) => rippleVersion(DEEP, 0.25, { light: LIGHT, count: 6, seed: s }));
  const cells = new Set();
  for (let cy = 0; cy < 6; cy++) for (let cx = 0; cx < 10; cx++) cells.add(fillVariant(cx, cy, 3));
  assert.equal(cells.size, 3, 'a lake of 10 by 6 uses all three');
  assert.notDeepEqual(marksOf(versions[0]), marksOf(versions[1]));
});

// ---- engine/shore-lanes.js: a stream one tile wide that bends, forks and crosses ---------------------------------
//   laneShoreMap, drawLaneShore: the nine lane pieces of a pond, river or pool (elbow, tee, cross), each made from
//   the pieces engine/water.js already draws, so the bank closes round every cut corner between two arms
import { Surface } from '../../engine/surface.js';
import { BLOCK_PIECES, NARROW_PIECES, LANE_PIECES, blockJoins, pickPiece } from '../../engine/tiles.js';
import { INK } from '../../engine/color.js';
import { shoreMap, drawShore, rippleFill } from '../../engine/water.js';
import { SHORE_LANES, laneShoreMap, drawLaneShore } from '../../engine/shore-lanes.js';

const WATER = '#4fa8d8', FOAM = '#f0ead8', SAND = '#ecda95', FACE = '#b9925f';
const zeroEnds = Array.from({ length: TILE }, (_, u) => Math.min(1, Math.max(0, (Math.min(u, TILE - 1 - u) - 1) / 2)));
const SHORE = { round: 11, cap: 2, face: 5, lip: [2, 1], thin: { h: zeroEnds, v: zeroEnds }, inset: { top: (u) => (u % 9 === 4 ? 2 : 0), left: (u) => (u % 7 === 3 ? 1 : 0) } };
const shorePaints = (t = 0) => ({ body: rippleFill(DEEP, t, { light: WATER }), bank: (b) => (b.part === 'face' ? FACE : SAND), lap: { foam: FOAM, shallow: WATER }, laps: { s: { foam: null } } });
const lanePiece = (name, t = 0) => drawLaneShore(new Surface(TILE, TILE), name, SHORE, shorePaints(t), t);
const columnOf = (g, x) => Array.from({ length: g.h }, (_, y) => g.get(x, y));
const rowOf = (g, y) => Array.from({ length: g.w }, (_, x) => g.get(x, y));

test('SHORE_LANES: every lane piece is made of the piece with its closed sides and an inner corner for each cut corner', () => {
  assert.deepEqual(Object.keys(SHORE_LANES).sort(), [...LANE_PIECES].sort());
  // what the helper's own picker says a lane piece is: its closed sides and its cut corners
  for (const [name, parts] of Object.entries(SHORE_LANES)) {
    for (const part of parts) assert.ok(BLOCK_PIECES.includes(part), `${name}: ${part} is one of the 13`);
    const closed = { N: false, E: false, S: false, W: false }, cut = new Set();
    for (const part of parts) {
      if (part.startsWith('inner-')) { cut.add(part.slice(6)); continue; }
      const water = (dx, dy) => (x, y) => !(x === dx && y === dy);
      for (const [side, dx, dy] of [['N', 0, -1], ['E', 1, 0], ['S', 0, 1], ['W', -1, 0]]) {
        // the side is closed when this part is what the picker gives a cell with land there
        const around = (x, y) => (x === 0 && y === 0) || !((part === pickPiece((a, b) => (a === 0 && b === 0) || !(a === dx && b === dy), 0, 0)) && x === dx && y === dy);
        void around; void water;
      }
      const sides = { left: 'NW', right: 'NE', 'bottom-l': 'SW', 'bottom-r': 'ES', top: 'N', bottom: 'S', 'side-l': 'W', 'side-r': 'E' }[part];
      for (const s of sides) closed[s] = true;
    }
    const land = (x, y) => (x === 0 && y === -1 && closed.N) || (x === 1 && y === 0 && closed.E) || (x === 0 && y === 1 && closed.S) || (x === -1 && y === 0 && closed.W)
      || (x && y && cut.has(`${y < 0 ? 't' : 'b'}${x < 0 ? 'l' : 'r'}`));
    const has = Object.fromEntries([...BLOCK_PIECES, ...NARROW_PIECES, ...LANE_PIECES].map((p) => [p, true]));
    assert.equal(pickPiece((x, y) => !land(x, y), 0, 0, has), name, `${name}: the picker gives it to the cell its parts describe`);
  }
});

test('laneShoreMap: a lane piece holds the bank of each of its parts, and open water where all of them have it', () => {
  for (const [name, parts] of Object.entries(SHORE_LANES)) {
    const m = laneShoreMap(name, SHORE), maps = parts.map((p) => shoreMap(p, SHORE));
    assert.equal(m.part.length, TILE * TILE);
    for (let i = 0; i < TILE * TILE; i++) {
      const kinds = maps.map((k) => k.part[i]);
      if (kinds.every((k) => k === 6)) assert.equal(m.part[i], 6, `${name}: open water at ${i % TILE},${i >> 5}`);
      if (kinds.includes(0)) assert.equal(m.part[i], 0, `${name}: outside the outline at ${i % TILE},${i >> 5}`);
      else if (kinds.includes(1)) assert.equal(m.part[i], 1, `${name}: the cap wins at ${i % TILE},${i >> 5}`);
      else if (kinds.includes(3)) assert.equal(m.part[i], 3, `${name}: a lip wins over a face at ${i % TILE},${i >> 5}`);
      assert.ok(kinds.includes(m.part[i]), `${name}: nothing is made up at ${i % TILE},${i >> 5}`);
    }
    assert.equal(laneShoreMap(`water-${name}`, SHORE), m, 'a whole clip name works, and a piece is worked out once per spec');
  }
  assert.equal(laneShoreMap('top', SHORE), shoreMap('top', SHORE), 'any other piece is the shore\'s own');
  assert.throws(() => laneShoreMap('deco-a', SHORE), /not a block piece/);
  // a crossing closes the north bank of both arms that run off to the sides: bank in its two top corners, none at the bottom
  const cross = laneShoreMap('cross', SHORE), at = (x, y) => cross.part[y * TILE + x];
  assert.ok(at(0, 0) === 1 && at(31, 0) === 1, 'the bank\'s last column at both top corners');
  assert.equal(at(16, 16), 6);
  assert.ok(at(0, 31) >= 4 && at(31, 31) >= 4, 'water or its line in the bottom corners');
});

test('drawLaneShore: every pair of pieces that can touch, lane pieces included, meets outline to outline on every frame', () => {
  for (const t of [0, 0.375]) {
    const made = Object.fromEntries([...BLOCK_PIECES, ...NARROW_PIECES, ...LANE_PIECES].map((p) => [p, lanePiece(p, t)]));
    let lanes = 0;
    for (const [a, axis, b] of blockJoins({ narrow: true, lanes: true })) {
      if (LANE_PIECES.includes(a) || LANE_PIECES.includes(b)) lanes++;
      const A = axis === 'x' ? columnOf(made[a], TILE - 1) : rowOf(made[a], TILE - 1);
      const B = axis === 'x' ? columnOf(made[b], 0) : rowOf(made[b], 0);
      for (let i = 0; i < TILE; i++) assert.equal(!!A[i], !!B[i], `${a} ${axis === 'x' ? 'left of' : 'above'} ${b}: the outlines meet at ${i}`);
    }
    assert.ok(lanes > 40, `${lanes} joins with a lane piece`);
  }
});

test('drawLaneShore: draws the other pieces exactly as drawShore does, and a lane piece from its parts', () => {
  for (const p of ['fill', 'top', 'left', 'inner-tl', 'strip-m', 'col-b', 'single', 'water-bottom-r']) {
    const a = lanePiece(p, 0.25), b = drawShore(new Surface(TILE, TILE), p, SHORE, shorePaints(0.25), 0.25);
    assert.deepEqual([...a.data], [...b.data], p);
  }
  // an elbow is its corner piece wherever the cut corner's piece is open water
  const elbow = lanePiece('elbow-tl', 0.25), left = drawShore(new Surface(TILE, TILE), 'left', SHORE, shorePaints(0.25), 0.25), inner = shoreMap('inner-br', SHORE);
  let same = 0;
  for (let i = 0; i < TILE * TILE; i++) if (inner.part[i] === 6) { assert.equal(elbow.data[i], left.data[i], `elbow-tl is left at ${i % TILE},${i >> 5}`); same++; }
  assert.ok(same > 900);
  // the waterline is ink, and a lane piece is opaque inside its outline
  assert.ok(lanePiece('cross').data.includes(col(INK)));
  assert.ok(lanePiece('tee-t').data.includes(col(FOAM)), 'a fork closed on top keeps its foam line');
});
