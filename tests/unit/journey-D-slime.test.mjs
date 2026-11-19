// J2.1 (docs/user-journeys.md): searching "slime" lists slime-like things (Slime, Acid glob, Acid pool) above Debris.
// Debris used to rank second because its description (sprites/debris-burst.js, `blurb`) said "slime" as well as its
// words, so the keyword search counted it twice. Its description now says "bug goo", and generated/catalog.json was
// rebuilt from it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createKeywordIndex } from '../../search/core.js';

const catalog = JSON.parse(fs.readFileSync(new URL('../../generated/catalog.json', import.meta.url), 'utf8'));

test('Debris\'s description no longer says "slime"', () => {
  const debris = catalog.assets.find((a) => a.id === 'debris-burst');
  assert.ok(debris, 'debris-burst is in the catalogue');
  assert.doesNotMatch(debris.description ?? '', /\bslime\b/i);
});

test('"slime" puts Slime, Acid glob and Acid pool above Debris', () => {
  const order = createKeywordIndex(catalog.assets).search('slime', { limit: 50 }).map((r) => r.id);
  assert.equal(order[0], 'slime');
  for (const id of ['acid-glob', 'acid-pool']) assert.ok(order.indexOf(id) < order.indexOf('debris-burst'), `${id} before debris-burst: ${order.join(', ')}`);
});
