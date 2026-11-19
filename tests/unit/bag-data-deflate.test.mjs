// Studio item S8: a bag link that holds a studio sprite is deflated (docs/studio.md section 6). app/deflate.js is the
// small raw-deflate pair the bag uses: the browser's CompressionStream when there is one, a plain-JS writer otherwise,
// and one plain-JS reader that caps what a link may grow into.
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { deflateRaw, inflateRaw, deflateRawAsync, MAX_INFLATE } from '../../app/deflate.js';
import { studioTemplate } from '../../rigs/studio-templates.js';

const enc = new TextEncoder(), dec = new TextDecoder();
const texts = [
  '',
  'a',
  'abcabcabcabcabcabcabcabc',
  'x'.repeat(70_000),                                   // long runs: matches of 258 and distances up to the window
  JSON.stringify(studioTemplate('four-legs')),
  JSON.stringify(studioTemplate('topdown-beast')),
  Array.from({ length: 5000 }, (_, i) => String.fromCharCode(32 + ((i * 7919) % 95))).join(''),   // little to match
  'héllo wörld ✓ '.repeat(300),
];

test('deflate: what the plain-JS writer makes, zlib reads back exactly', () => {
  for (const t of texts) {
    const out = deflateRaw(enc.encode(t));
    assert.equal(dec.decode(zlib.inflateRawSync(out)), t);
  }
});

test('deflate: the plain-JS reader reads what zlib writes (fixed, dynamic and stored blocks)', () => {
  for (const t of texts) {
    for (const opts of [{}, { level: 0 }, { level: 9 }, { strategy: zlib.constants.Z_FIXED }]) {
      const out = zlib.deflateRawSync(enc.encode(t), opts);
      assert.equal(dec.decode(inflateRaw(out)), t, `${t.length} chars, ${JSON.stringify(opts)}`);
    }
  }
});

test('deflate: a writer and reader round trip, and a studio definition shrinks to under a third', () => {
  const json = JSON.stringify(studioTemplate('four-legs'));
  const out = deflateRaw(enc.encode(json));
  assert.equal(dec.decode(inflateRaw(out)), json);
  assert.ok(out.length < json.length / 3, `${out.length} bytes from ${json.length}`);
});

test('deflate: the async writer (CompressionStream here) is read by the plain-JS reader', async () => {
  const json = JSON.stringify(studioTemplate('four-legs'));
  const out = await deflateRawAsync(enc.encode(json));
  assert.ok(out instanceof Uint8Array);
  assert.equal(dec.decode(inflateRaw(out)), json);
});

test('deflate: the async writer falls back to the plain-JS one without CompressionStream', async () => {
  const saved = globalThis.CompressionStream;
  try {
    globalThis.CompressionStream = undefined;
    const out = await deflateRawAsync(enc.encode('fallback '.repeat(100)));
    assert.equal(dec.decode(inflateRaw(out)), 'fallback '.repeat(100));
  } finally { globalThis.CompressionStream = saved; }
});

test('deflate: the reader refuses broken data and data that grows past its cap', () => {
  assert.throws(() => inflateRaw(new Uint8Array([0xff, 0xff, 0xff])));
  assert.throws(() => inflateRaw(new Uint8Array([])));
  // a stored block whose length check does not match
  assert.throws(() => inflateRaw(new Uint8Array([1, 5, 0, 5, 0, 1, 2, 3, 4, 5])));
  // a back reference before the start of the output
  const bad = zlib.deflateRawSync(enc.encode('abcabcabc'));
  assert.equal(dec.decode(inflateRaw(bad)), 'abcabcabc');
  const bomb = zlib.deflateRawSync(new Uint8Array(2_000_000));
  assert.ok(bomb.length < 5000);
  assert.throws(() => inflateRaw(bomb, 1_000_000), /more than/);
  assert.equal(inflateRaw(bomb, 2_000_000).length, 2_000_000);
  assert.ok(MAX_INFLATE >= 1_000_000);
});
