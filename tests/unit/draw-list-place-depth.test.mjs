// placeOn's nesting (build item F3, B3's review note): a dither's or bands' `area` and a cut's `shape` are placed by
// placeOn calling itself. A real area is one shape (depth 1); a hostile or broken list could nest them thousands deep
// and overflow the stack. placeOn places nested areas only to PLACE_DEPTH and drops anything deeper (area or shape
// null), so drawList then skips that primitive with a reason instead of the page or the build crashing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { placeOn, nodeFrame, renderList, PLACE_DEPTH } from '../../engine/draw-list.js';

const F = nodeFrame({ at: [5, 3] });
const chain = (kind, depth, field = 'area') => {
  let p = { kind: 'rect', at: [0, 0], size: [2, 2] };
  for (let i = 0; i < depth; i++) p = { kind, [field]: p, paint: '#ff0000', amount: 0.5, stops: ['#ff0000'] };
  return p;
};
const depthOf = (p, field = 'area') => { let n = 0; while (p && p[field]) { p = p[field]; n++; } return n; };

test('PLACE_DEPTH is a small fixed depth that a real area (one shape) never reaches', () => {
  assert.ok(Number.isInteger(PLACE_DEPTH) && PLACE_DEPTH >= 1 && PLACE_DEPTH <= 16);
  const d = placeOn({ kind: 'dither', area: { kind: 'rect', at: [1, 1], size: [4, 4] }, amount: 0.5, paint: '#ff0000' }, F);
  assert.deepEqual(d.area.at, [6, 4], 'one level: placed as before');
  const c = placeOn({ kind: 'cut', shape: { kind: 'ellipse', at: [0, 0], r: 2 } }, F);
  assert.deepEqual(c.shape.at, [5, 3]);
});

test('placeOn refuses areas and shapes nested past PLACE_DEPTH instead of recursing without end', () => {
  for (const [kind, field] of [['dither', 'area'], ['bands', 'area'], ['cut', 'shape']]) {
    const deep = chain(kind, 200000, field);
    let out;
    assert.doesNotThrow(() => { out = placeOn(deep, F); }, `${kind}: no stack overflow`);
    assert.equal(depthOf(out, field), PLACE_DEPTH, `${kind}: placed down to PLACE_DEPTH, nothing deeper`);
    let p = out;
    for (let i = 0; i < PLACE_DEPTH; i++) p = p[field];
    assert.equal(p.kind, kind, `${kind}: the last one placed`);
    assert.equal(p[field], null, `${kind}: what it holds, past the depth, is dropped`);
    assert.equal(depthOf(deep, field), 200000, 'the input is not changed');
  }
  // right at the depth, nothing is dropped
  const ok = placeOn(chain('dither', PLACE_DEPTH), F);
  let p = ok;
  for (let i = 0; i < PLACE_DEPTH; i++) p = p.area;
  assert.equal(p.kind, 'rect');
  assert.deepEqual(p.at, [5, 3]);
});

test('a list holding such a primitive draws the rest and reports it skipped', () => {
  const r = renderList(16, 16, [placeOn(chain('dither', 5000), F), placeOn({ kind: 'rect', at: [0, 0], size: [2, 2], paint: '#00ff00' }, F)]);
  assert.equal(r.drawn, 1);
  assert.equal(r.skipped.length, 1);
  assert.equal(r.skipped[0].index, 0);
  assert.match(r.skipped[0].why, /area/);
});
