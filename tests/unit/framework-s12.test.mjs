// Framework additions made with batch S12 (hive growth and the acid pool: sprites/tiles-hive.js, sprites/acid-pool.js),
// all in engine/ooze.js:
//   drawSoftWall, SOFT_WALL_SLIVER   a top-down wall of soft mass: drawSoftBlock's cap pieces and a front face with a wavering foot
//   puddleIn                         shape test: an ellipse whose edge is pushed in and out by waves running round it
//   bubbleSpots, surfaceBubbles      bubbles on a liquid seen from above: where they sit; swelling, bursting, coming back
//   drawVein                         a vein that wanders and forks, kept inside a box
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, INK } from '../../engine/color.js';
import { TILE, BLOCK_PIECES, NARROW_PIECES, blockJoins, drawSoftBlock } from '../../engine/tiles.js';
import { drawSoftWall, SOFT_WALL_SLIVER, puddleIn, bubbleSpots, surfaceBubbles, drawVein } from '../../engine/ooze.js';

const CAP = '#b04a8a', RIM = '#dd80a5', FACE = '#901f7e', SHADE = '#333564', LIQUID = '#9fe040';
const at = (g, x, y) => g.data[y * g.w + x];
const count = (g, hex) => { const c = col(hex); return g.data.reduce((n, v) => n + (v === c ? 1 : 0), 0); };
const digits = (s) => [...s].map(Number);
const DIPS = digits('00001122333221100000112233210000');
const LIFT = digits('00011222110000012233322110000000');
const rim = { depth: 3, inset: (u) => DIPS[u], paint: (d) => (d === 1 ? RIM : null) };
const wall = (extra = {}) => ({ fill: () => CAP, round: 6, top: rim, left: rim, right: rim, face: { paint: () => FACE, foot: (u) => LIFT[u], round: 5, shadow: SHADE, ...extra } });
const draw = (piece, m = wall()) => drawSoftWall(new Surface(TILE, TILE), piece, m, 0);
const FRONT = ['bottom', 'bottom-l', 'bottom-r', 'col-b', 'strip-l', 'strip-m', 'strip-r', 'single'];

// ---- drawSoftWall ----------------------------------------------------------------------------------

test('drawSoftWall: the cap pieces are exactly drawSoftBlock\'s', () => {
  for (const piece of ['fill', 'top', 'left', 'right', 'side-l', 'side-r', 'inner-tl', 'inner-tr', 'col-t', 'col-m']) {
    const mine = draw(piece), m = wall(), theirs = drawSoftBlock(new Surface(TILE, TILE), piece, { ...m, face: undefined }, 0);
    assert.deepEqual([...mine.data], [...theirs.data], piece);
  }
  const plain = { fill: () => CAP, round: 6, top: rim };
  assert.deepEqual([...drawSoftWall(new Surface(TILE, TILE), 'bottom', plain).data], [...drawSoftBlock(new Surface(TILE, TILE), 'bottom', plain).data], 'no face: drawSoftBlock');
});

test('drawSoftWall: the face runs from the first row down to a foot line that follows `foot`, with two rows of shadow under it', () => {
  const g = draw('bottom');
  for (let x = 0; x < TILE; x++) {
    const foot = 29 - LIFT[x];
    assert.equal(at(g, x, 0), col(FACE), `the face starts on row 0 (column ${x})`);
    assert.equal(at(g, x, foot), col(INK), `the foot line at column ${x}`);
    assert.equal(at(g, x, foot + 1), col(SHADE)); assert.equal(at(g, x, foot + 2), col(SHADE));
    if (foot + 3 < TILE) assert.equal(at(g, x, foot + 3), 0, 'see-through under the shadow');
  }
  assert.equal(count(draw('bottom', wall({ shadow: undefined })), SHADE), 0, 'no shadow colour, no shadow');
});

test('drawSoftWall: a step in the foot line is closed by the outline, so the face has no gap in its edge', () => {
  const g = draw('bottom');
  for (let x = 0; x < TILE - 1; x++) {
    const a = 29 - LIFT[x], b = 29 - LIFT[x + 1];
    for (let y = Math.min(a, b) + 1; y <= Math.max(a, b); y++) assert.equal(at(g, a > b ? x : x + 1, y), col(INK), `between columns ${x} and ${x + 1}, row ${y}`);      // the lower column's side
  }
});

test('drawSoftWall: paint is told how far above the foot line a pixel is', () => {
  const seen = [];
  draw('bottom', wall({ paint: (x, y, t, up) => { if (x === 4) seen.push([y, up]); return FACE; } }));
  const foot = 29 - LIFT[4];
  assert.deepEqual(seen[0], [0, foot]);
  assert.deepEqual(seen.at(-1), [foot - 1, 1], 'the last painted row rests on the line');
});

test('drawSoftWall: the ends of a face are closed by an outline and the foot corners are round', () => {
  const l = draw('bottom-l'), r = draw('bottom-r'), b = draw('col-b');
  assert.equal(at(l, 0, 0), col(INK)); assert.equal(at(r, 31, 0), col(INK));
  assert.equal(at(l, 0, 29), 0, 'the corner is cut'); assert.equal(at(r, 31, 29), 0); assert.equal(at(b, 0, 29), 0); assert.equal(at(b, 31, 29), 0);
  assert.notEqual(at(l, 31, 0), col(INK), 'the open end has no line');
  // square corners when the radius is 0
  assert.equal(at(draw('bottom-l', wall({ round: 0, foot: null })), 0, 29), col(INK));
});

test('drawSoftWall: every pair of pieces that can touch has outlines that meet (the checker\'s exact test)', () => {
  const pics = Object.fromEntries([...BLOCK_PIECES, ...NARROW_PIECES].map((p) => [p, draw(p)]));
  for (const [a, axis, b] of blockJoins({ narrow: true })) {
    if (FRONT.includes(a) !== FRONT.includes(b) && axis === 'x') continue;      // a face beside a cap: the face simply ends
    if (a.startsWith('inner-b') || b.startsWith('inner-b')) continue;           // drawn as side pieces with the face behind
    const A = pics[a], B = pics[b];
    for (let i = 0; i < TILE; i++) {
      const pa = axis === 'x' ? at(A, 31, i) : at(A, i, 31), pb = axis === 'x' ? at(B, 0, i) : at(B, i, 0);
      assert.equal(pa !== 0, pb !== 0, `${a} ${axis} ${b} at ${i}`);
    }
  }
});

test('drawSoftWall: a wall one tile deep is the face under a sliver of cap', () => {
  const strip = draw('strip-m'), top = drawSoftBlock(new Surface(TILE, TILE), 'top', { ...wall(), face: undefined });
  for (let y = 0; y < SOFT_WALL_SLIVER; y++) for (let x = 0; x < TILE; x++) assert.equal(at(strip, x, y), at(top, x, y), `cap at ${x},${y}`);
  assert.equal(at(strip, 16, SOFT_WALL_SLIVER), col(FACE));
  const single = draw('single');
  assert.equal(at(single, 0, 0), 0, 'round cap corner'); assert.equal(at(single, 0, 29), 0, 'round foot corner');
  assert.ok(count(single, FACE) > 200);
});

test('drawSoftWall: a lower inner corner is the cap\'s side with the neighbouring face behind its outline', () => {
  const g = draw('inner-bl');
  const side = drawSoftBlock(new Surface(TILE, TILE), 'side-l', { ...wall(), face: undefined });
  let behind = 0;
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    if (at(side, x, y)) assert.equal(at(g, x, y), at(side, x, y));
    else if (at(g, x, y)) behind++;
  }
  assert.ok(behind > 10, 'the face shows in the bays of the cap\'s edge');
  assert.equal(at(g, 0, 14), col(FACE));
});

// ---- puddleIn --------------------------------------------------------------------------------------

test('puddleIn: no waves gives a plain ellipse, and waves push the edge out and in', () => {
  const plain = puddleIn(24, 16, 12, 8);
  assert.ok(plain(24, 16) && plain(35.5, 16) && !plain(36.5, 16) && plain(24, 23.5) && !plain(24, 24.5));
  const wavy = puddleIn(24, 16, 12, 8, [[4, 0.2, 0.25]]);      // sin(4a + 90 deg): out at a = 0, in at a = 45 deg
  assert.ok(wavy(24 + 13.5, 16), 'pushed out along the x axis');
  assert.ok(!wavy(24 + 12 * 0.68, 16 + 8 * 0.68), 'pulled in on the diagonal');
  assert.ok(plain(24 + 12 * 0.68, 16 + 8 * 0.68));
});

test('puddleIn: a phase of one whole turn is the same shape, and the middle is always inside', () => {
  const a = puddleIn(20, 20, 9, 7, [[3, 0.15, 0.2], [5, 0.1, 0.7]]), b = puddleIn(20, 20, 9, 7, [[3, 0.15, 1.2], [5, 0.1, 1.7]]);
  for (let y = 8; y < 32; y++) for (let x = 6; x < 34; x++) assert.equal(a(x + 0.5, y + 0.5), b(x + 0.5, y + 0.5));
  assert.ok(puddleIn(20, 20, 9, 7, [[2, 3, 0]])(20.5, 20.5), 'even with waves far too big');
  assert.ok(!puddleIn(20, 20, 0, 7)(20, 20), 'no radius, no puddle');
});

// ---- bubbles -----------------------------------------------------------------------------------------

test('bubbleSpots: places lie inside the shape, apart from each other, and a longer list starts with the shorter one', () => {
  const pool = puddleIn(24, 16, 16, 9), box = [4, 4, 44, 28];
  const five = bubbleSpots(5, pool, box, { seed: 3 }), eight = bubbleSpots(8, pool, box, { seed: 3 });
  assert.equal(five.length, 5); assert.equal(eight.length, 8);
  assert.deepEqual(eight.slice(0, 5), five);
  for (const [x, y] of eight) assert.ok(pool(x + 0.5, y + 0.5) && Number.isInteger(x) && Number.isInteger(y));
  for (let i = 0; i < 5; i++) for (let j = 0; j < i; j++) assert.ok(Math.hypot(five[i][0] - five[j][0], five[i][1] - five[j][1]) >= 4, 'not on top of each other');
  assert.deepEqual(bubbleSpots(4, () => false, box), [], 'no room, no bubbles');
});

test('surfaceBubbles: a loop closes, every bubble has its own timing, and nothing is drawn outside `keep`', () => {
  const pool = puddleIn(24, 16, 16, 9);
  const frame = (t, extra = {}) => { const g = new Surface(48, 32); surfaceBubbles(g, { t, count: 6, inside: pool, box: [4, 4, 44, 28], size: 3, seed: 2, ...extra }); return g; };
  assert.deepEqual([...frame(0).data], [...frame(1).data]);
  const drawn = Array.from({ length: 8 }, (_, i) => frame(i / 8).data.reduce((n, v) => n + (v ? 1 : 0), 0));
  assert.ok(drawn.every((n) => n > 0), `bubbles on every frame: ${drawn}`);
  assert.ok(new Set(Array.from({ length: 8 }, (_, i) => frame(i / 8).data.join(''))).size === 8, 'eight different frames');
  const small = puddleIn(24, 16, 5, 3);
  for (let i = 0; i < 8; i++) { const g = frame(i / 8, { keep: small }); for (let y = 0; y < 32; y++) for (let x = 0; x < 48; x++) if (at(g, x, y)) assert.ok(Math.hypot(x - 24, y - 16) < 12, `${x},${y}`); }
});

test('surfaceBubbles: a full dome is a rim round a lighter body with a glint', () => {
  const g = new Surface(24, 24);
  // one bubble at a known place, found at the time of its life when it is full
  let best = null;
  for (let i = 0; i < 64; i++) {
    const s = new Surface(24, 24);
    surfaceBubbles(s, { t: i / 64, spots: [[12, 12, 1]], size: 3, rim: '#4fbd0d', body: '#e6ff76', glint: '#ffffff' });
    if (!best || count(s, '#e6ff76') > count(best, '#e6ff76')) best = s;
  }
  assert.ok(count(best, '#4fbd0d') >= 12, 'a ring'); assert.ok(count(best, '#e6ff76') >= 6, 'a body'); assert.equal(count(best, '#ffffff'), 1, 'one glint');
  assert.deepEqual(surfaceBubbles(g, { t: 0, spots: [[12, 12, 1]] }), [[12, 12, 1]], 'returns the places');
});

// ---- drawVein ------------------------------------------------------------------------------------------

test('drawVein: a main line and one path per fork, each joined pixel to pixel, all inside the box', () => {
  const g = new Surface(TILE, TILE), box = [3, 3, 29, 29];
  const paths = drawVein(g, 6, 20, Math.PI * 0.7, 18, LIQUID, { seed: 3, forks: 2, box });
  assert.equal(paths.length, 3);
  assert.deepEqual(paths[0][0], [6, 20]);
  for (const path of paths) for (let i = 1; i < path.length; i++) assert.ok(Math.max(Math.abs(path[i][0] - path[i - 1][0]), Math.abs(path[i][1] - path[i - 1][1])) === 1, 'no gap in a line');
  for (const path of paths.slice(1)) assert.ok(paths[0].some(([x, y]) => Math.max(Math.abs(x - path[0][0]), Math.abs(y - path[0][1])) <= 1), 'a branch starts on the main line');
  let drawn = 0;
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if (at(g, x, y)) { drawn++; assert.ok(x >= 3 && y >= 3 && x < 29 && y < 29, `${x},${y} is inside the box`); }
  assert.equal(drawn, new Set(paths.flat().map(([x, y]) => `${x},${y}`)).size, 'it returns exactly what it drew');
  assert.ok(paths[0].length >= 12, 'the main line runs its length');
});

test('drawVein: repeatable; another seed is another vein; more forks never move the main line', () => {
  const run = (o) => { const g = new Surface(TILE, TILE); return { g, paths: drawVein(g, 16, 28, Math.PI, 20, LIQUID, o) }; };
  assert.deepEqual([...run({ seed: 1 }).g.data], [...run({ seed: 1 }).g.data]);
  assert.notDeepEqual([...run({ seed: 1 }).g.data], [...run({ seed: 2 }).g.data]);
  assert.deepEqual(run({ seed: 1, forks: 0 }).paths[0], run({ seed: 1, forks: 3 }).paths[0]);
  assert.equal(run({ seed: 1, forks: 0 }).paths.length, 1);
  const straight = run({ seed: 1, forks: 0, wander: 0 }).paths[0];
  assert.ok(straight.every(([x]) => x === 16), 'no wander: straight up');
});

// ---- scallops ------------------------------------------------------------------------------------------

test('scallops: 0 on the lobes, `deep` in each notch, the same on both sides of it, and 0 where two tiles join', async () => {
  const { scallops } = await import('../../engine/ooze.js');
  const p = scallops([10, 22], 3);
  assert.equal(p.length, TILE);
  assert.equal(p[10], 3); assert.equal(p[22], 3);
  assert.deepEqual(p.slice(7, 14), [...p.slice(7, 14)].reverse(), 'a notch is even-sided');
  assert.ok(p[9] >= 1 && p[9] < 3 && p[6] === 0 && p[14] === 0 && p[16] === 0);
  assert.equal(p[0], 0); assert.equal(p[31], 0);
  assert.ok(p.every((v) => Number.isInteger(v) && v >= 0 && v <= 3));
  assert.deepEqual(scallops([], 3), new Array(TILE).fill(0));
  assert.equal(scallops([1], 2)[31] > 0, true, 'a notch at the end wraps round to the other end');
  assert.ok(scallops([16], 4, { width: 6 }).filter((v) => v > 0).length > scallops([16], 4, { width: 3 }).filter((v) => v > 0).length, 'a wider notch');
});

// ---- added in fix round 1: veinPaths, drawVeins, drawVeinPulse, drawPore -------------------------------

const VEIN = '#d7b3c6', SHADOW = '#7a4a68', WET = '#ffffff', FADE = '#c09cb0';
const ooze = await import('../../engine/ooze.js');
const pixels = (g, hex) => { const c = col(hex), out = []; for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (at(g, x, y) === c) out.push([x, y]); return out; };
const touches = (list, [x, y]) => list.some(([a, b]) => (a !== x || b !== y) && Math.abs(a - x) <= 1 && Math.abs(b - y) <= 1);

test('veinPaths: the paths drawVein would draw, with nothing drawn; the box defaults to one tile', () => {
  const g = new Surface(TILE, TILE), o = { seed: 5, forks: 1, box: [3, 3, 29, 29] };
  assert.deepEqual(ooze.veinPaths(8, 20, Math.PI * 0.6, 12, o), drawVein(g, 8, 20, Math.PI * 0.6, 12, LIQUID, o));
  const far = ooze.veinPaths(16, 16, Math.PI / 2, 60, { wander: 0, forks: 0 });
  assert.equal(far[0].at(-1)[0], TILE - 1, 'it stops at the edge of a tile');
});

test('drawVeins: the lines in their colour, and a line of shade one step down and to the left that never covers a line', () => {
  const g = new Surface(TILE, TILE), box = [3, 3, 29, 29];
  const veins = [ooze.veinPaths(6, 22, Math.PI * 0.62, 16, { seed: 21, forks: 1, box }), ooze.veinPaths(20, 9, Math.PI * 0.3, 8, { seed: 4, forks: 0, box })];
  assert.equal(ooze.drawVeins(g, veins, VEIN, { shade: SHADOW, box }), g);
  const line = pixels(g, VEIN), shade = pixels(g, SHADOW), all = veins.flat(2);
  assert.equal(line.length, new Set(all.map(([x, y]) => `${x},${y}`)).size, 'every pixel of every path is a line pixel');
  assert.ok(shade.length >= 6);
  for (const [x, y] of shade) {
    assert.ok(all.some(([a, b]) => a - 1 === x && b + 1 === y), `shade at ${x},${y} lies under a line pixel`);
    assert.ok(x >= 3 && y >= 3 && x < 29 && y < 29, 'inside the box');
    assert.ok(touches(shade, [x, y]), `shade at ${x},${y} is not a speck on its own`);
  }
});

test('drawVeins: runs of shade shorter than `run` are left out, and no shade colour means no shade', () => {
  // a line running down and to the left hides its own shade, but for one pixel under its sideways step and one past its end
  const box = [0, 0, TILE, TILE], steps = [[[10, 4], [9, 5], [8, 6], [7, 6], [6, 7], [5, 8]]];
  const a = ooze.drawVeins(new Surface(TILE, TILE), [steps], VEIN, { shade: SHADOW, box });
  assert.equal(count(a, SHADOW), 0, 'a lone pixel of shade is dropped');
  const b = ooze.drawVeins(new Surface(TILE, TILE), [steps], VEIN, { shade: SHADOW, run: 1, box });
  assert.deepEqual(pixels(b, SHADOW), [[7, 7], [4, 9]]);
  const flat = [[[4, 10], [5, 10], [6, 10], [7, 10], [8, 10]]];
  assert.equal(count(ooze.drawVeins(new Surface(TILE, TILE), [flat], VEIN, { shade: SHADOW, box }), SHADOW), 5, 'under a level line the shade is one unbroken run');
  assert.equal(count(ooze.drawVeins(new Surface(TILE, TILE), [flat], VEIN, { shade: SHADOW, dx: 1, dy: -1, box }), SHADOW), 5, 'on the other side when asked');
  const none = ooze.drawVeins(new Surface(TILE, TILE), [flat], VEIN);
  assert.equal(none.data.filter((v) => v).length, 5);
});

test('drawVeins: glints every few pixels of the main line, a tip colour at the end of every line, and nothing outside `keep`', () => {
  const main = Array.from({ length: 14 }, (_, i) => [4 + i, 12]), twig = [[9, 11], [9, 10], [9, 9], [9, 8]];
  const g = ooze.drawVeins(new Surface(TILE, TILE), [[main, twig]], VEIN, { shine: WET, shineEvery: 5, tip: FADE, tipLength: 2 });
  assert.deepEqual(pixels(g, WET), [[6, 12], [11, 12]], 'on pixels 2 and 7 of the main line; 12 is in the tip');
  assert.deepEqual(pixels(g, FADE), [[9, 8], [9, 9], [16, 12], [17, 12]]);
  assert.equal(count(g, VEIN), 14 + 4 - 2 - 4);
  const half = ooze.drawVeins(new Surface(TILE, TILE), [[main, twig]], VEIN, { shade: SHADOW, keep: (px) => px < 10 });
  for (let y = 0; y < TILE; y++) for (let x = 10; x < TILE; x++) assert.equal(at(half, x, y), 0);
  assert.ok(count(half, VEIN) > 0 && count(half, SHADOW) > 0);
});

test('drawVeinPulse: a short run of light at a place along the main line, head first, never nearer the root than `from`', () => {
  const main = Array.from({ length: 10 }, (_, i) => [4 + i, 12]), paths = [main, [[8, 11], [8, 10]]];
  const g = new Surface(TILE, TILE);
  assert.equal(ooze.drawVeinPulse(g, paths, 6.2, [WET, LIQUID]), 2);
  assert.equal(at(g, 10, 12), col(WET)); assert.equal(at(g, 9, 12), col(LIQUID));
  assert.equal(g.data.filter((v) => v).length, 2, 'only the main line is lit');
  const early = new Surface(TILE, TILE);
  assert.equal(ooze.drawVeinPulse(early, paths, 3, [WET, LIQUID], { from: 3 }), 1, 'the tail would lie under the heart');
  assert.equal(at(early, 7, 12), col(WET));
  assert.equal(ooze.drawVeinPulse(new Surface(TILE, TILE), paths, 10, [WET, LIQUID]), 1, 'the head has left the line, its tail has not');
  assert.equal(ooze.drawVeinPulse(new Surface(TILE, TILE), paths, 14, [WET, LIQUID]), 0);
});

test('drawPore: a cluster of three or more dark pixels that touch, with a lit lip on the side away from the light', () => {
  for (const size of [2, 3]) {
    const g = new Surface(16, 16);
    assert.equal(ooze.drawPore(g, 6, 6, SHADOW, VEIN, { size }), g);
    const dark = pixels(g, SHADOW), lip = pixels(g, VEIN);
    assert.ok(dark.length >= 3, `size ${size}: ${dark.length} dark pixels`);
    for (const p of dark) { assert.ok(touches(dark, p)); assert.ok(p[0] >= 6 && p[0] < 6 + size && p[1] >= 6 && p[1] < 6 + size, 'the pit is `size` px across from x, y'); }
    assert.ok(lip.length >= 2);
    for (const p of lip) { assert.ok(touches(lip, p), 'the lip is not a speck'); assert.ok(touches(dark, p), 'the lip lies against the pit'); }
    const mean = (list, k) => list.reduce((n, p) => n + p[k], 0) / list.length;
    assert.ok(mean(lip, 0) < mean(dark, 0) + 0.01 && mean(lip, 1) > mean(dark, 1), 'the lip is below and not to the right: light comes from the top right');
  }
  const bare = ooze.drawPore(new Surface(16, 16), 6, 6, SHADOW);
  assert.equal(count(bare, SHADOW), bare.data.filter((v) => v).length, 'no lip colour, no lip');
});
