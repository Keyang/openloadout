// The texture tones' memo tables (build item F3): engine/tiles.js textureTone and textureLight keep what they worked out
// so a tileset's marks are not searched again every frame, but since build item B15b they are colour rules any data
// sprite's settings reach, so a long session (every slider move, every colour picked) would grow them without end.
// They are small least-recently-used caches (boundedCache): at most TEXTURE_CACHE_LIMIT entries each, the one used
// longest ago dropped first, and a tone worked out again after it was dropped is the same tone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { textureTone, textureLight, textureCacheSizes, TEXTURE_CACHE_LIMIT, boundedCache } from '../../engine/tiles.js';

const hex = (n) => `#${(n & 0xffffff).toString(16).padStart(6, '0')}`;

test('boundedCache keeps at most its limit, dropping the entry used longest ago', () => {
  const c = boundedCache(3);
  c.set('a', 1); c.set('b', 2); c.set('c', 3);
  assert.equal(c.size, 3);
  assert.equal(c.get('a'), 1, 'reading a makes it the newest');
  c.set('d', 4);
  assert.equal(c.size, 3);
  assert.equal(c.get('b'), undefined, 'b was used longest ago: dropped');
  assert.deepEqual(['a', 'c', 'd'].map((k) => c.get(k)), [1, 3, 4]);
  c.set('c', 30);   // setting a kept key updates it in place, never grows the cache
  assert.equal(c.size, 3);
  assert.equal(c.get('c'), 30);
  assert.equal(c.get('missing'), undefined);
  assert.throws(() => boundedCache(0), /limit/);
});

test('textureTone and textureLight keep at most TEXTURE_CACHE_LIMIT colours each, and give the same tones after dropping some', () => {
  assert.ok(Number.isInteger(TEXTURE_CACHE_LIMIT) && TEXTURE_CACHE_LIMIT >= 64 && TEXTURE_CACHE_LIMIT <= 4096, `a small fixed limit (${TEXTURE_CACHE_LIMIT})`);
  const first = [textureTone('#7a5236'), textureLight('#3f6fd1', '#3f6fd1', 0.5)];
  const n = TEXTURE_CACHE_LIMIT + 40;
  for (let i = 0; i < n; i++) {
    textureTone(hex(i * 2654435761));
    textureLight(hex(i * 40503 + 7), hex(i * 977), 1);
  }
  const sizes = textureCacheSizes();
  assert.ok(sizes.tone <= TEXTURE_CACHE_LIMIT, `tone cache ${sizes.tone} <= ${TEXTURE_CACHE_LIMIT}`);
  assert.ok(sizes.light <= TEXTURE_CACHE_LIMIT, `light cache ${sizes.light} <= ${TEXTURE_CACHE_LIMIT}`);
  assert.ok(sizes.tone >= TEXTURE_CACHE_LIMIT - 1, 'the cache is used, not emptied');
  // the first colours were dropped long ago; worked out again they are the same tones
  assert.deepEqual([textureTone('#7a5236'), textureLight('#3f6fd1', '#3f6fd1', 0.5)], first);
});
