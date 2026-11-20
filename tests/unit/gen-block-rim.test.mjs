// The block family's wall (engine/gen/block.js): block.rim@1, one piece of the wall round a falling-block field, as
// the Gridline kit draws it (bundles/specs/kit-puzzle-gridline.md, `gridline-well`: the look "wellRim" drew, now a
// generator). Pinned by the goldens harness; the tests after it hold what the specification asks of a wall piece.
// To pin: GEN_GOLDEN_WRITE=1 node --test tests/unit/gen-block-rim.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { RIM_PIECES, RIM_STYLES } from '../../engine/gen/block.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';

test('block.rim@1 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('block.rim', 1), { cases: [
    { args: { at: [0, 0], paint: 'frame', lit: 'glow' } },
    { args: { at: [8, 8], piece: 'floor', style: 'plate', edge: 8, texture: 1, paint: 'frame', lit: 'glow' } },
    { args: { at: [-8, -8], piece: 'floor-l', style: 'tube', edge: 10, texture: 0, paint: 'frame', lit: 'glow' } },
    { args: { at: [3, 5], piece: 'cap-r', style: 'dotted', edge: 4, paint: 'frame.light', lit: 'glow', ink: 'frame.deep' } },
    { args: { at: [0, 0], piece: 'r', style: 'dotted', edge: 7, texture: 0.2, paint: { rule: 'mix', of: 'frame', with: 'glow', amount: 0.5 }, lit: 'glow' } },
    { args: { at: [0, 0], piece: 'floor-r', style: 'plate', edge: 5, paint: 'frame', lit: 'glow' } },
    { args: { at: [0, 0], piece: 'cap-l', style: 'tube', edge: 6, texture: 1, paint: 'frame', lit: 'glow' } } ] });
});

/** A call's stamps as { "x,y": paint (as text) }. */
function pixels(more = {}) {
  const r = registry.runGenerator({ gen: 'block.rim', v: 1, at: [0, 0], paint: 'frame', lit: 'glow', ...more }, { size: [16, 16] });
  assert.ok(r.ok, r.errors.join('; '));
  const out = new Map();
  for (const p of r.primitives) {
    assert.equal(p.kind, 'stamp');
    p.rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') out.set(`${p.at[0] + i},${p.at[1] + j}`, JSON.stringify(p.key[ch])); }));
  }
  return out;
}
const differ = (a, b) => { let n = 0; for (const k of new Set([...a.keys(), ...b.keys()])) if (a.get(k) !== b.get(k)) n++; return n; };
const EDGES = [4, 5, 6, 7, 8, 9, 10];

test('the pieces and styles are the specification\'s', () => {
  assert.deepEqual([...RIM_PIECES], ['l', 'r', 'floor', 'floor-l', 'floor-r', 'cap-l', 'cap-r']);
  assert.deepEqual([...RIM_STYLES], ['tube', 'plate', 'dotted']);
});

test('a wall lies on the field side of its tile, exactly `edge` pixels wide, and stays in the tile', () => {
  for (const style of RIM_STYLES) for (const edge of EDGES) for (const texture of [0, 0.5, 1]) {
    const l = pixels({ piece: 'l', style, edge, texture }), floor = pixels({ piece: 'floor', style, edge, texture });
    assert.equal(l.size, 16 * edge, `${style} edge ${edge}: the left wall is ${edge} px wide and 16 tall`);
    assert.equal(floor.size, 16 * edge, `${style} edge ${edge}: the floor is ${edge} px tall and 16 wide`);
    for (const k of l.keys()) assert.ok(Number(k.split(',')[0]) >= 16 - edge, `${style} edge ${edge}: left wall pixel (${k}) is off the field side`);
    for (const k of floor.keys()) assert.ok(Number(k.split(',')[1]) < edge, `${style} edge ${edge}: floor pixel (${k}) is off the field side`);
    for (const piece of RIM_PIECES) for (const k of pixels({ piece, style, edge, texture }).keys()) {
      const [x, y] = k.split(',').map(Number);
      assert.ok(x >= 0 && y >= 0 && x < 16 && y < 16, `${style} ${piece} edge ${edge}: (${k}) is outside the tile`);
    }
  }
});

test('the right-hand pieces are the left-hand ones mirrored', () => {
  for (const style of RIM_STYLES) for (const edge of EDGES) for (const [a, b] of [['l', 'r'], ['floor-l', 'floor-r'], ['cap-l', 'cap-r']]) {
    const left = pixels({ piece: a, style, edge }), right = pixels({ piece: b, style, edge });
    assert.equal(left.size, right.size);
    for (const [k, v] of left) { const [x, y] = k.split(',').map(Number); assert.equal(right.get(`${15 - x},${y}`), v, `${style} ${a} edge ${edge} (${k})`); }
  }
});

test('every wall has its line of light between ink, one pixel from the field (on the field at edge 4)', () => {
  for (const style of RIM_STYLES) for (const edge of EDGES) {
    const l = pixels({ piece: 'l', style, edge }), x = edge === 4 ? 15 : 14;
    for (let y = 0; y < 16; y++) {
      assert.equal(l.get(`${x},${y}`), '"glow"', `${style} edge ${edge}: the light at (${x},${y})`);
      assert.equal(l.get(`${x - 1},${y}`), '"ink"');
      assert.equal(l.get(`${16 - edge},${y}`), '"ink"', `${style} edge ${edge}: the outer ink line`);
    }
  }
});

test('pieces join: the wall meets the corner and the cap, the floor meets the corner, with the same pixels', () => {
  for (const style of RIM_STYLES) for (const edge of EDGES) {
    const l = pixels({ piece: 'l', style, edge, texture: 0 }), floor = pixels({ piece: 'floor', style, edge, texture: 0 });
    const corner = pixels({ piece: 'floor-l', style, edge, texture: 0 }), cap = pixels({ piece: 'cap-l', style, edge, texture: 0 });
    for (let x = 16 - edge; x < 16; x++) {
      assert.equal(corner.get(`${x},0`), l.get(`${x},15`), `${style} edge ${edge}: corner top row against the wall at x ${x}`);
      assert.equal(cap.get(`${x},15`), l.get(`${x},0`), `${style} edge ${edge}: cap bottom row against the wall at x ${x}`);
    }
    for (let y = 0; y < edge; y++) assert.equal(corner.get(`15,${y}`), floor.get(`0,${y}`), `${style} edge ${edge}: corner right column against the floor at y ${y}`);
  }
});

test('texture changes a wall piece by 12 or more pixels between its ends at the default edge, and every style differs from every other', () => {
  for (const style of RIM_STYLES) for (const piece of ['l', 'floor']) {
    assert.ok(differ(pixels({ piece, style, texture: 0 }), pixels({ piece, style, texture: 1 })) >= 12, `${style} ${piece}`);
  }
  for (const a of RIM_STYLES) for (const b of RIM_STYLES) if (a < b) assert.ok(differ(pixels({ style: a }), pixels({ style: b })) >= 12, `${a} and ${b}`);
});

test('a wall repeats: its marks come round every 16 pixels, so a column of one tile shows no seam', () => {
  // the marks of a piece are a function of the pixel's place along the wall taken modulo 16: the same tile laid twice
  for (const style of RIM_STYLES) for (const texture of [0, 0.3, 0.5, 0.7, 1]) {
    const a = pixels({ piece: 'l', style, texture }), b = pixels({ piece: 'l', style, texture, at: [0, 16] });
    for (const [k, v] of a) { const [x, y] = k.split(',').map(Number); assert.equal(b.get(`${x},${y + 16}`), v); }
  }
});
