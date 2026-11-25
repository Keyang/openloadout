// Playground: a thing's shadow lies under its feet, not under the empty rows between its feet and its pivot (app/play/kinds.js bodyBox gap).
import test from 'node:test';
import assert from 'node:assert/strict';
import { bodyBox } from '../../app/play/kinds.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import { librarySprite } from '../helpers/library.mjs';

test('bodyBox says how many empty rows lie between the feet and the pivot', async () => {
  const sprite = await librarySprite('hero-walker');
  const params = defaultParams(sprite);
  const clip = Object.keys(sprite.clips)[0];
  const low = renderFrame(sprite, clip, 0, params).bounds();
  const box = bodyBox(sprite, clip, params);
  assert.equal(box.gap, Math.max(0, sprite.pivot[1] - (low.y1 + 1)));
  assert.ok(box.gap >= 0);
  // pivot moved up into the art: no gap, never negative
  assert.equal(bodyBox(sprite, clip, params, [sprite.pivot[0], 0]).gap, 0);
});
