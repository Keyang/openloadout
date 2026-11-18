// The search test set (FIND-10): a stand-in catalogue and searches with known answers,
// and the level the always-available keyword search must reach on it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createKeywordIndex, matchesFilters } from '../../search/core.js';
import { runQueries, summarize } from '../../tools/search-eval.mjs';

const read = (f) => JSON.parse(fs.readFileSync(new URL('../fixtures/search/' + f, import.meta.url), 'utf8'));
const catalog = read('catalog.json');
const { queries } = read('queries.json');
const byId = new Map(catalog.assets.map((a) => [a.id, a]));

const TYPES = {
  sprite: ['character', 'creature', 'tileset', 'prop', 'pickup', 'projectile', 'effect', 'background', 'ui', 'icon'],
  sound: ['sfx', 'ambience', 'jingle'],
  music: ['music'],
};
const ROLE_TOPS = ['characters', 'actions', 'items', 'world', 'effects', 'environment', 'interface', 'music'];

test('the stand-in catalogue has 300 to 500 entries in the catalogue shape', () => {
  assert.equal(catalog.version, 1);
  assert.ok(catalog.assets.length >= 300 && catalog.assets.length <= 500, `${catalog.assets.length} entries`);
  assert.equal(byId.size, catalog.assets.length, 'ids are unique');
  for (const a of catalog.assets) {
    assert.match(a.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, a.id);
    assert.ok(TYPES[a.kind], `${a.id}: kind ${a.kind}`);
    assert.ok(TYPES[a.kind].includes(a.type), `${a.id}: type ${a.type} for a ${a.kind}`);
    assert.ok(a.name && a.description && a.description.length > 10, `${a.id}: name and description`);
    const [top, leaf, extra] = a.role.split('/');
    assert.ok(ROLE_TOPS.includes(top) && leaf && !extra, `${a.id}: role ${a.role}`);
    assert.ok(Array.isArray(a.themes) && a.themes.length > 0, `${a.id}: themes`);
    assert.ok(Array.isArray(a.gameTypes) && a.gameTypes.length > 0, `${a.id}: gameTypes`);
    assert.ok(['side', 'top-down', 'front', 'none'].includes(a.view), `${a.id}: view`);
    if (a.kind !== 'sprite') assert.equal(a.view, 'none');
    assert.ok(Array.isArray(a.words) && a.words.length >= 2, `${a.id}: words`);
    for (const w of a.words) assert.equal(w, w.toLowerCase());
    assert.ok(Array.isArray(a.bundles));
  }
  const kinds = new Set(catalog.assets.map((a) => a.kind));
  assert.deepEqual([...kinds].sort(), ['music', 'sound', 'sprite']);
  for (const top of ROLE_TOPS) assert.ok(catalog.assets.some((a) => a.role.startsWith(top + '/')), `some ${top}`);
  for (const b of catalog.bundles) {
    for (const id of [...b.sprites, ...b.sounds, ...b.music]) assert.ok(byId.get(id).bundles.includes(b.id));
  }
});

test('the question set has 60 to 100 searches of every kind, with answers that exist', () => {
  assert.ok(queries.length >= 60 && queries.length <= 100, `${queries.length} searches`);
  const kinds = {};
  for (const q of queries) {
    kinds[q.kind] = (kinds[q.kind] || 0) + 1;
    assert.ok(Array.isArray(q.expect) && q.expect.length > 0, q.q);
    for (const id of q.expect) {
      assert.ok(byId.has(id), `"${q.q}" expects ${id}, which is not in the catalogue`);
      if (q.filters) assert.ok(matchesFilters(byId.get(id), q.filters), `"${q.q}": ${id} does not pass its own filters`);
    }
    if (q.kind === 'filtered') assert.ok(q.filters, `"${q.q}" needs filters`);
  }
  for (const k of ['exact', 'verb', 'synonym', 'description', 'misspelling', 'filtered']) {
    assert.ok(kinds[k] >= 8, `at least 8 ${k} searches (found ${kinds[k] || 0})`);
  }
});

test('basic keyword search reaches its floor on the question set', () => {
  const index = createKeywordIndex(catalog.assets);
  const rows = runQueries(queries, (q, opts) => index.search(q, opts));
  const s = summarize(rows);
  // Measured 2026-11-18: exact 100%, verb 93%, synonym 76%, description 79%, misspelling 100%, filtered 100%, all 89%.
  // Each floor allows one search fewer than that, no more.
  const floor = { exact: 0.92, verb: 0.85, synonym: 0.7, description: 0.75, misspelling: 0.92, filtered: 0.92, all: 0.87 };
  for (const [kind, min] of Object.entries(floor)) {
    assert.ok(s[kind].top5 >= min, `${kind}: top-5 rate ${s[kind].top5.toFixed(2)} is under ${min}`);
  }
  assert.ok(s.all.top1 >= 0.74, `first place overall ${s.all.top1.toFixed(2)} (measured 0.78)`);
  // filters are never broken by ranking
  for (const q of queries.filter((x) => x.filters)) {
    for (const r of index.search(q.q, { filters: q.filters, limit: 20 })) {
      assert.ok(matchesFilters(byId.get(r.id), q.filters), `"${q.q}" returned ${r.id} outside its filters`);
    }
  }
});
