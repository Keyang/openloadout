// Framework additions made with batch S03 (the station floor: sprites/tiles-station-floor.js), all in engine/plating.js:
//   PLATING_STYLES, platingSeams   the seams of a plated floor (one plate per tile, four per tile, honeycomb), with a lit lip
//   platingSpots                   places for small marks on the plates, clear of the seams and of each other
//   rimPlates                      an edge for drawBlock: bevelled trim plates, one per tile, that leave no notch at a lane's bends
//   drawBolt, drawGrate            a bolt head; a slatted grate
//   PLATE_MARKS, drawPlateMark     marks of use on bare metal: a scratch, a scuff, a pit
//   fanBladesIn, splatIn           shape tests: the blades of a fan seen from above; a splat with droplets
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col } from '../../engine/color.js';
import { TILE, blockClips, drawBlock, patternFill, BLOCK_PIECES, NARROW_PIECES } from '../../engine/tiles.js';
import { PLATING_STYLES, platingSeams, platingSpots, rimPlates, drawBolt, drawGrate, fanBladesIn, splatIn, PLATE_MARKS, drawPlateMark } from '../../engine/plating.js';

const BASE = '#566182', SEAM = '#333564', LIT = '#7c8ca5', LINE = '#222244', FACE = '#6b7896', FILL = '#434d6d';
const count = (g, hex) => { const c = col(hex); return g.data.reduce((n, v) => n + (v === c ? 1 : 0), 0); };
const at = (g, x, y) => g.data[y * g.w + x];
const plated = (style, opts = { seam: SEAM, lit: LIT }) => { const s = new Surface(TILE, TILE); s.rect(0, 0, TILE, TILE, BASE); const boxes = platingSeams(s, style, opts); return { s, boxes }; };

// ---- seams ---------------------------------------------------------------------------------

test('platingSeams: "panels" puts its seams on the tile boundary only, so the tile is one plate', () => {
  const { s } = plated('panels');
  for (let i = 0; i < TILE; i++) { assert.equal(at(s, i, 0), col(SEAM), `row 0, column ${i}`); assert.equal(at(s, 31, i), col(SEAM), `column 31, row ${i}`); }
  assert.equal(count(s, SEAM), 63, 'one row and one column, nothing inside');
  for (let y = 3; y < 29; y++) for (let x = 3; x < 28; x++) assert.equal(at(s, x, y), col(BASE), `the face is bare at ${x},${y}`);
});

test('platingSeams: the lit lip lies under a level seam and to the left of an upright one (light from the top right)', () => {
  const { s } = plated('panels');
  assert.equal(at(s, 10, 1), col(LIT));
  assert.equal(at(s, 30, 10), col(LIT));
  assert.equal(at(s, 0, 1), col(LIT), 'the lip starts at the first column: no gap at the join');
  const bare = plated('panels', { seam: SEAM });
  assert.equal(count(bare.s, LIT), 0, 'no lip colour, no lip');
});

test('platingSeams: "grid" has four plates to a tile and "hex" a honeycomb that repeats every 32 px', () => {
  const grid = plated('grid').s;
  for (let i = 0; i < TILE; i++) { assert.equal(at(grid, i, 16), col(SEAM)); assert.equal(at(grid, 15, i), col(SEAM)); }
  const hex = plated('hex').s;
  assert.equal(at(hex, 4, 0), col(SEAM), 'a flat top');
  assert.equal(at(hex, 12, 4), col(SEAM), 'a slanted side');
  assert.equal(at(hex, 20, 8), col(SEAM), 'the flat top of the next row of cells');
  assert.equal(at(hex, 4, 8), col(BASE), 'the middle of a cell is bare');
  // every seam pixel has a neighbour across each tile edge: the pattern runs on into the next tile
  for (let i = 0; i < TILE; i++) {
    if (at(hex, 31, i) === col(SEAM)) assert.ok([-1, 0, 1].some((d) => at(hex, 0, (i + d + TILE) % TILE) === col(SEAM)), `the seam at 31,${i} carries on`);
    if (at(hex, i, 31) === col(SEAM)) assert.ok([-1, 0, 1].some((d) => at(hex, (i + d + TILE) % TILE, 0) === col(SEAM)), `the seam at ${i},31 carries on`);
  }
});

test('platingSeams: returns for every style boxes of bare plate that keep 3 px off the tile edge', () => {
  assert.deepEqual([...PLATING_STYLES], ['panels', 'grid', 'hex']);
  for (const style of PLATING_STYLES) {
    const { s, boxes } = plated(style);
    assert.ok(boxes.length >= 1, style);
    for (const b of boxes) {
      assert.ok(b.x0 >= 3 && b.y0 >= 3 && b.x1 <= 28 && b.y1 <= 28, `${style}: ${JSON.stringify(b)}`);
      for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) assert.equal(at(s, x, y), col(BASE), `${style}: ${x},${y} is plate`);
    }
  }
  assert.throws(() => platingSeams(new Surface(TILE, TILE), 'bricks', { seam: SEAM }), /panels, grid, hex/);
});

test('platingSeams works as the drawing of a patternFill', () => {
  const fill = patternFill(BASE, (s) => platingSeams(s, 'grid', { seam: SEAM, lit: LIT }));
  assert.equal(fill(40, 16), col(SEAM), 'x and y wrap round');
  assert.equal(fill(5, 5), col(BASE));
});

// ---- spots ---------------------------------------------------------------------------------

test('platingSpots: marks lie inside the boxes, clear of each other and of what they are told to avoid, the same every time', () => {
  for (const style of PLATING_STYLES) {
    const { boxes } = plated(style);
    const avoid = [[3, 4, 2, 2]];
    const spots = platingSpots(boxes, { w: 5, h: 4, seed: 2, avoid });
    assert.ok(spots.length >= 3, `${style}: ${spots.length} spots`);
    assert.deepEqual(spots, platingSpots(boxes, { w: 5, h: 4, seed: 2, avoid }));
    spots.forEach(([x, y], i) => {
      assert.ok(boxes.some((b) => x >= b.x0 && y >= b.y0 && x + 4 <= b.x1 && y + 3 <= b.y1), `${style}: spot ${x},${y} is inside a box`);
      assert.ok(!(x < 3 + 2 + 1 && x + 5 > 3 - 1 && y < 4 + 2 + 1 && y + 4 > 4 - 1), `${style}: spot ${x},${y} keeps off the bolt`);
      spots.slice(i + 1).forEach(([u, v]) => assert.ok(Math.abs(u - x) > 5 || Math.abs(v - y) > 4, `${style}: ${x},${y} and ${u},${v} keep apart`));
    });
  }
  const { boxes } = plated('panels');
  assert.notDeepEqual(platingSpots(boxes, { seed: 1 }).slice(0, 3), platingSpots(boxes, { seed: 2 }).slice(0, 3), 'another seed, another order');
});

// ---- rim plates ----------------------------------------------------------------------------

const rimMaterial = (depth, extra = {}) => {
  const rim = rimPlates({ depth, line: LINE, face: FACE, ...extra });
  return { ink: null, fill: () => col(FILL), top: rim, bottom: rim, left: rim, right: rim };
};
const piece = (name, material) => drawBlock(new Surface(TILE, TILE), name, material);

test('rimPlates: a line along the outline and a band whose ends are cut at 45 degrees', () => {
  const g = piece('top', rimMaterial(4));
  for (let x = 0; x < TILE; x++) assert.equal(at(g, x, 0), col(LINE), `the line at ${x}`);
  assert.equal(at(g, 16, 1), col(FACE)); assert.equal(at(g, 16, 3), col(FACE)); assert.equal(at(g, 16, 4), col(FILL), 'the band is 4 px with its line');
  assert.equal(at(g, 0, 1), col(FILL), 'gone at the end of the edge');
  assert.equal(at(g, 2, 1), col(FACE)); assert.equal(at(g, 2, 2), col(FILL));
  assert.equal(at(g, 3, 2), col(FACE)); assert.equal(at(g, 3, 3), col(FILL));
  assert.equal(at(g, 28, 2), col(FACE)); assert.equal(at(g, 29, 2), col(FILL), 'the same at the other end');
});

test('rimPlates: outer, inner and cast colour the first row, the last row and a row of shadow beyond it', () => {
  const rim = rimPlates({ depth: 5, line: LINE, face: FACE, outer: LIT, inner: SEAM, cast: '#111122' });
  assert.equal(rim.depth, 6, 'the cast row is one more');
  assert.equal(rim.paint(1, 16), LINE);
  assert.equal(rim.paint(2, 16), LIT);
  assert.equal(rim.paint(3, 16), FACE);
  assert.equal(rim.paint(5, 16), SEAM);
  assert.equal(rim.paint(6, 16), '#111122');
  assert.equal(rim.paint(4, 4), SEAM, 'the inner row follows the cut end');
  assert.equal(rim.paint(5, 4), null, 'and no shadow is cast there');
  assert.equal(rim.paint(2, 1), null);
});

test('rimPlates: an inner corner holds only its corner pixel, so the 13 pieces turn a lane with no notch', () => {
  const m = rimMaterial(6, { outer: LIT, inner: SEAM, cast: '#111122' });
  for (const [name, x, y] of [['inner-tl', 0, 0], ['inner-tr', 31, 0], ['inner-bl', 0, 31], ['inner-br', 31, 31]]) {
    const g = piece(name, m);
    assert.equal(at(g, x, y), col(LINE), `${name}: the corner pixel is line`);
    assert.equal(count(g, FILL), TILE * TILE - 1, `${name}: everything else is the plate`);
  }
  // every piece: the last 1 px of each open edge's band is only the line, so two pieces always meet in the same way
  for (const name of [...BLOCK_PIECES, ...NARROW_PIECES]) {
    const g = piece(name, m);
    for (const [x, y] of [[0, 1], [1, 0], [31, 1], [30, 0], [0, 30], [1, 31], [31, 30], [30, 31]]) assert.ok(at(g, x, y) === col(LINE) || at(g, x, y) === col(FILL), `${name}: ${x},${y} is line or plate`);
  }
  assert.equal(Object.keys(blockClips('plate', { narrow: true, fills: 3 })).length, 22);
});

test('rimPlates: at an outer corner the two bands meet in a mitre', () => {
  const g = piece('left', rimMaterial(5));
  assert.equal(at(g, 3, 1), col(FACE), 'the top band');
  assert.equal(at(g, 1, 3), col(FACE), 'the left band');
  for (const k of [1, 2, 3, 4]) assert.equal(at(g, k, k), col(FILL), `the joint between them at ${k},${k}`);
});

// ---- fittings ------------------------------------------------------------------------------

test('drawBolt: two pixels square, lit at the top right and dark at the lower left', () => {
  const g = new Surface(8, 8);
  drawBolt(g, 3, 3, { lit: LIT, dark: SEAM, face: FACE });
  assert.equal(at(g, 4, 3), col(LIT)); assert.equal(at(g, 3, 4), col(SEAM));
  assert.equal(at(g, 3, 3), col(FACE)); assert.equal(at(g, 4, 4), col(FACE));
  assert.deepEqual(g.bounds(), { x0: 3, y0: 3, x1: 4, y1: 4 });
});

test('drawGrate: a frame, with slats inside that repeat every `pitch` rows', () => {
  const g = new Surface(TILE, TILE);
  const inner = drawGrate(g, 6, 8, 20, 14, { frame: LINE, bar: FACE, slot: '#111122', lit: LIT, pitch: 3 });
  assert.deepEqual(inner, { x0: 7, y0: 9, x1: 24, y1: 20 });
  assert.deepEqual(g.bounds(), { x0: 6, y0: 8, x1: 25, y1: 21 });
  for (let x = 6; x < 26; x++) { assert.equal(at(g, x, 8), col(LINE)); assert.equal(at(g, x, 21), col(LINE)); }
  assert.equal(at(g, 10, 9), col(LIT)); assert.equal(at(g, 10, 10), col(FACE)); assert.equal(at(g, 10, 11), col('#111122'));
  assert.equal(at(g, 10, 12), col(LIT), 'the slats repeat');
  const up = new Surface(TILE, TILE);
  drawGrate(up, 6, 8, 14, 20, { frame: LINE, bar: FACE, slot: '#111122', pitch: 2, upright: true });
  assert.equal(at(up, 7, 12), col(FACE)); assert.equal(at(up, 8, 12), col('#111122'), 'upright slats run down the grate');
});

test('fanBladesIn: as many blades as asked, a clear hub, and a turn of one blade step gives the same picture', () => {
  const lit = (test) => { let n = 0; const rows = []; for (let y = 0; y < TILE; y++) { let r = ''; for (let x = 0; x < TILE; x++) { const v = test(x + 0.5, y + 0.5); r += v ? '#' : '.'; n += v ? 1 : 0; } rows.push(r); } return { n, rows }; };
  const a = lit(fanBladesIn(16, 16, 8, { blades: 3 }));
  assert.ok(a.n > 40 && a.n < 150, `${a.n} px of blade`);
  assert.equal(fanBladesIn(16, 16, 8, { blades: 3, hub: 2 })(16.5, 16.5), false, 'the hub is left clear');
  assert.equal(fanBladesIn(16, 16, 8, { blades: 3 })(26.5, 16.5), false, 'nothing beyond the radius');
  const b = lit(fanBladesIn(16, 16, 8, { blades: 3, angle: (Math.PI * 2) / 3 }));
  assert.deepEqual(b.rows, a.rows, 'a third of a turn of a three-bladed fan');
  const c = lit(fanBladesIn(16, 16, 8, { blades: 3, angle: Math.PI / 12 }));
  assert.notDeepEqual(c.rows, a.rows, 'a small turn moves it');
  // count the blades on a circle half way out
  const four = fanBladesIn(16, 16, 8, { blades: 4, sweep: 0 }), ring = [];
  for (let i = 0; i < 360; i++) { const t = ((i + 0.5) * Math.PI) / 180; ring.push(four(16 + 5 * Math.cos(t), 16 + 5 * Math.sin(t))); }
  assert.equal(ring.filter((v, i) => v && !ring[(i + 359) % 360]).length, 4);
});

test('splatIn: one body about the centre with droplets round it, inside its reach, the same for the same seed', () => {
  const test1 = splatIn(16, 16, 7, { seed: 3, drops: 4 }), again = splatIn(16, 16, 7, { seed: 3, drops: 4 }), other = splatIn(16, 16, 7, { seed: 4, drops: 4 });
  let n = 0, differs = 0;
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const v = test1(x + 0.5, y + 0.5);
    assert.equal(v, again(x + 0.5, y + 0.5));
    if (v) { n++; assert.ok(Math.hypot(x + 0.5 - 16, y + 0.5 - 16) <= 7 * 1.6 + 2, `${x},${y} is within reach`); }
    if (v !== other(x + 0.5, y + 0.5)) differs++;
  }
  assert.equal(test1(16.5, 16.5), true, 'the middle is covered');
  assert.ok(n > 60 && n < 200, `${n} px`);
  assert.ok(differs > 10, 'another seed, another splat');
  const none = splatIn(16, 16, 7, { seed: 3, drops: 0 });
  let extra = 0;
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if (test1(x + 0.5, y + 0.5) && !none(x + 0.5, y + 0.5)) extra++;
  assert.ok(extra >= 4, `the droplets add pixels (${extra})`);
});

test('drawPlateMark: every mark stays inside its place of 5 px by 4, and no two marks are the same', () => {
  const seen = new Set();
  for (const kind of PLATE_MARKS) {
    const g = drawPlateMark(new Surface(16, 16), kind, 4, 6, LIT), b = g.bounds();
    assert.ok(b.x0 >= 4 && b.y0 >= 6 && b.x1 <= 8 && b.y1 <= 9, `${kind}: ${JSON.stringify(b)}`);
    assert.ok(count(g, LIT) >= 4, `${kind}: big enough to see`);
    seen.add(g.data.join(''));
  }
  assert.equal(seen.size, PLATE_MARKS.length);
  assert.throws(() => drawPlateMark(new Surface(16, 16), 'dent', 4, 6, LIT), /scratch, scuff, pit/);
});
