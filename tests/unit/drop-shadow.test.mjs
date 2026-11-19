// engine/drop-shadow.js (added with batch K23, bundles/specs/core-sprites-3.md): a drop shadow cast by a scratch surface.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, INK } from '../../engine/color.js';
import { dropShadow } from '../../engine/drop-shadow.js';

test('casts the silhouette offset in ink under the source, inside the box only', () => {
  const src = new Surface(10, 10).rect(3, 2, 3, 3, '#ffffff');
  const g = dropShadow(new Surface(10, 10), src, { dx: -2, dy: 1, box: { x: 2, y: 0, w: 8, h: 10 } });
  assert.equal(g.get(4, 3), col('#ffffff'));          // the source on top
  assert.equal(g.get(2, 5), col(INK));                // shadow 2 left, 1 down
  assert.equal(g.get(1, 4), 0);                       // outside the box
  assert.equal(g.get(3, 1), 0);
});

test('default offset is 2 px down and to the left', () => {
  const src = new Surface(8, 8).rect(4, 1, 1, 1, '#ffffff');
  const g = dropShadow(new Surface(8, 8), src);
  assert.equal(g.get(2, 3), col(INK));
  assert.equal([...g.data].filter(Boolean).length, 2);
});
