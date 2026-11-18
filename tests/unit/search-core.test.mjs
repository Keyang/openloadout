// search/core.js: the pure search library (no Node or browser APIs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  normalize, tokenize, stem, queryTokens, editDistance, searchText,
  createKeywordIndex, matchesFilters, filterAssets, countFacets,
  mergeRankings, quantize, cosineInt8, topKVectors, similarByMeta, ftsQuery, filterSql,
} from '../../search/core.js';

const catalog = JSON.parse(fs.readFileSync(new URL('../fixtures/search/catalog.json', import.meta.url), 'utf8'));
const assets = catalog.assets;
const index = createKeywordIndex(assets);
const ids = (rows) => rows.map((r) => r.id);
const top = (q, opts) => ids(index.search(q, { limit: 5, ...opts }));

test('core uses no Node or browser APIs', () => {
  const src = fs.readFileSync(new URL('../../search/core.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\bimport\b[^;]*\bfrom\b/, 'core.js imports nothing');
  for (const banned of ['window', 'document', 'process.', 'require(', 'fetch(', 'navigator']) {
    assert.ok(!src.includes(banned), `core.js must not use ${banned}`);
  }
});

test('normalize lowercases, strips accents and punctuation', () => {
  assert.equal(normalize('  Sci-Fi  Café!! '), 'sci fi cafe');
  assert.equal(normalize('Level-Up'), 'level up');
  assert.equal(normalize(null), '');
});

test('tokenize splits into stemmed words', () => {
  assert.deepEqual(tokenize('Footsteps on Snow'), ['footstep', 'on', 'snow']);
  assert.equal(stem('chopping'), stem('chop'));
  assert.equal(stem('boxes'), 'box');
  assert.equal(stem('dies'), stem('die'));
  assert.equal(stem('falling'), stem('fall'));
  assert.equal(stem('glass'), 'glass');
});

test('queryTokens drops filler words but never returns nothing for a real query', () => {
  assert.deepEqual(queryTokens('something for when the player dies'), ['player', 'die']);
  assert.deepEqual(queryTokens('the'), ['the']);
  assert.deepEqual(queryTokens('   '), []);
});

test('editDistance counts swaps as one edit and gives up past the limit', () => {
  assert.equal(editDistance('sword', 'sword', 2), 0);
  assert.equal(editDistance('sowrd', 'sword', 2), 1);
  assert.equal(editDistance('explotion', 'explosion', 2), 1);
  assert.ok(editDistance('cat', 'elephant', 2) > 2);
});

test('searchText holds the name, description, role and words', () => {
  const t = searchText(assets.find((a) => a.id === 'coin'));
  for (const part of ['Gold coin', 'spinning gold piece', 'money', 'pickup']) assert.ok(t.includes(part), `missing ${part} in: ${t}`);
});

test('basic keyword search: exact names come first', () => {
  assert.equal(top('Hero knight')[0], 'knight');
  assert.equal(top('treasure chest')[0], 'chest');
  assert.equal(top('wizard')[0], 'wizard');
});

test('basic keyword search: verbs, events and synonyms from the words list', () => {
  assert.ok(top('chop').includes('axe-chop'));
  assert.ok(top('level up').includes('jingle-level-up'));
  assert.ok(top('money').some((id) => ['coin', 'coin-pickup'].includes(id)));
});

test('basic keyword search tolerates typos and works as you type', () => {
  assert.ok(top('sowrd').some((id) => ['sword', 'sword-swing', 'equip-sword'].includes(id)));
  assert.ok(top('explotion').some((id) => id.includes('explosion')));
  assert.equal(top('wizzard')[0], 'wizard');
  assert.ok(top('skel').includes('skeleton'), 'a prefix finds the word being typed');
});

test('basic keyword search returns scores in descending order and respects limit', () => {
  const rows = index.search('fire', { limit: 7 });
  assert.equal(rows.length, 7);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].score >= rows[i].score);
  for (const r of rows) assert.ok(typeof r.id === 'string' && r.score > 0);
});

test('an empty query with filters lists what the filters allow', () => {
  const rows = index.search('', { filters: { role: 'music/boss' }, limit: 50 });
  assert.deepEqual(ids(rows).sort(), ['music-boss', 'music-final-boss', 'music-mothership']);
  assert.deepEqual(index.search('zzzzqqqq', {}), []);
});

test('filters: kind, type, role prefix, themes, gameTypes, view, bundle', () => {
  const coin = assets.find((a) => a.id === 'coin');
  assert.ok(matchesFilters(coin, {}));
  assert.ok(matchesFilters(coin, { kind: 'sprite', type: 'pickup', view: 'side' }));
  assert.ok(!matchesFilters(coin, { kind: 'sound' }));
  assert.ok(matchesFilters(coin, { role: 'items' }), 'top level of the role tree');
  assert.ok(matchesFilters(coin, { role: 'items/pickup' }));
  assert.ok(!matchesFilters(coin, { role: 'item' }), 'a role prefix must end at a slash');
  assert.ok(matchesFilters(coin, { themes: 'fantasy' }));
  assert.ok(matchesFilters(coin, { themes: ['space', 'fantasy'] }), 'a list means any of');
  assert.ok(!matchesFilters(coin, { themes: 'space' }));
  assert.ok(matchesFilters(coin, { gameTypes: 'platformer' }));
  assert.ok(matchesFilters(coin, { bundle: 'fantasy-platformer' }));
  assert.ok(!matchesFilters(coin, { bundle: 'space-shooter' }));
  assert.ok(matchesFilters(coin, { kind: '', themes: [], role: null }), 'empty filters are ignored');
  for (const a of filterAssets(assets, { kind: 'sound', role: 'world' })) {
    assert.equal(a.kind, 'sound');
    assert.ok(a.role.startsWith('world/'));
  }
  for (const id of top('door', { filters: { kind: 'sound' } })) assert.equal(assets.find((a) => a.id === id).kind, 'sound');
});

test('counts per filter value', () => {
  const all = countFacets(assets, {});
  assert.equal(all.total, assets.length);
  assert.equal(all.kind.sprite + all.kind.sound + all.kind.music, assets.length);
  assert.equal(all.type.music, assets.filter((a) => a.type === 'music').length);
  assert.equal(all.themes.farm, assets.filter((a) => a.themes.includes('farm')).length);
  assert.equal(all.role.music, assets.filter((a) => a.role.startsWith('music/')).length);
  assert.equal(all.bundle['space-shooter'], assets.filter((a) => a.bundles.includes('space-shooter')).length);

  const sprites = countFacets(assets, { kind: 'sprite' });
  assert.equal(sprites.total, all.kind.sprite);
  assert.equal(sprites.type.character, assets.filter((a) => a.type === 'character').length);
  assert.equal(sprites.type.sfx, undefined);
  assert.equal(sprites.kind.sound, all.kind.sound, 'a filter does not hide the other choices in its own group');
  assert.ok(sprites.view['top-down'] > 0);

  const some = countFacets(assets, {}, ['coin', 'coin-pickup']);
  assert.equal(some.total, 2);
  assert.deepEqual(some.kind, { sprite: 1, sound: 1 });
});

test('mergeRankings: an item high in both lists beats one high in only one', () => {
  const merged = mergeRankings([
    [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    [{ id: 'c' }, { id: 'b' }, { id: 'd' }],
  ]);
  assert.deepEqual(ids(merged).slice().sort(), ['a', 'b', 'c', 'd']);
  assert.ok(['b', 'c'].includes(ids(merged)[0]));
  assert.ok(ids(merged).indexOf('b') < ids(merged).indexOf('a'));
  assert.ok(ids(merged).indexOf('c') < ids(merged).indexOf('d'));
  for (let i = 1; i < merged.length; i++) assert.ok(merged[i - 1].score >= merged[i].score);
  assert.deepEqual(ids(mergeRankings([[{ id: 'x' }], []])), ['x']);
  const weighted = mergeRankings([[{ id: 'a' }], [{ id: 'z' }]], { weights: [1, 3] });
  assert.equal(weighted[0].id, 'z');
  assert.equal(mergeRankings([[{ id: 'a' }, { id: 'b' }]], { limit: 1 }).length, 1);
});

test('8-bit vectors: quantise and compare', () => {
  const unit = (v) => { const n = Math.hypot(...v); return Float32Array.from(v, (x) => x / n); };
  const a = unit([1, 2, 3, 4]), b = unit([1, 2, 3, 4.2]), c = unit([-4, 1, -2, 0.5]);
  const qa = quantize(a), qb = quantize(b), qc = quantize(c);
  assert.ok(qa instanceof Int8Array && qa.length === 4);
  assert.ok(Math.abs(cosineInt8(qa, qa) - 1) < 1e-6);
  assert.ok(cosineInt8(qa, qb) > 0.99);
  assert.ok(cosineInt8(qa, qc) < 0);
  // a float query against a block of stored 8-bit vectors
  const matrix = new Int8Array(12);
  matrix.set(qc, 0); matrix.set(qb, 4); matrix.set(qa, 8);
  const hits = topKVectors(a, matrix, 4, 2);
  assert.deepEqual(hits.map((h) => h.index), [2, 1]);
  assert.ok(hits[0].score > 0.99 && hits[0].score <= 1.0001);
  const allowed = topKVectors(a, matrix, 4, 3, { allow: (i) => i !== 2 });
  assert.deepEqual(allowed.map((h) => h.index), [1, 0]);
});

test('8-bit vectors keep the order of full-precision ones closely enough', () => {
  // deterministic pseudo-random unit vectors
  let s = 7; const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) - 0.5;
  const dim = 384, n = 200;
  const vecs = Array.from({ length: n }, () => { const v = Float32Array.from({ length: dim }, rnd); const m = Math.hypot(...v); return v.map((x) => x / m); });
  const matrix = new Int8Array(n * dim);
  vecs.forEach((v, i) => matrix.set(quantize(v), i * dim));
  const q = vecs[17];
  const exact = vecs.map((v, i) => ({ i, d: v.reduce((acc, x, j) => acc + x * q[j], 0) })).sort((x, y) => y.d - x.d).slice(0, 5).map((x) => x.i);
  const approx = topKVectors(q, matrix, dim, 5).map((h) => h.index);
  assert.equal(approx[0], 17);
  assert.ok(approx.filter((i) => exact.includes(i)).length >= 4);
});

test('similarByMeta suggests neighbours from the catalogue alone', () => {
  const near = similarByMeta(assets, 'footstep-snow', 6);
  assert.equal(near.length, 6);
  assert.ok(!near.includes('footstep-snow'));
  assert.ok(near.filter((id) => id.startsWith('footstep-')).length >= 4);
  assert.deepEqual(similarByMeta(assets, 'no-such-id', 6), []);
});

test('ftsQuery builds a safe FTS5 expression', () => {
  assert.equal(ftsQuery(''), null);
  const q = ftsQuery('level "up" OR (x)');
  assert.ok(!/[()]/.test(q.replace(/"[^"]*"/g, '')), 'no bare brackets');
  assert.match(q, /"level"/);
  assert.match(ftsQuery('skel'), /"skel"\s*\*/, 'the word being typed is a prefix search');
});

test('filterSql gives the same assets as matchesFilters, for every kind of filter', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE assets (rowid INTEGER PRIMARY KEY, id TEXT, kind TEXT, type TEXT, role TEXT, view TEXT); CREATE TABLE asset_tags (asset INTEGER, facet TEXT, value TEXT);');
  const insA = db.prepare('INSERT INTO assets VALUES (?, ?, ?, ?, ?, ?)'), insT = db.prepare('INSERT INTO asset_tags VALUES (?, ?, ?)');
  assets.forEach((a, i) => {
    insA.run(i + 1, a.id, a.kind, a.type, a.role, a.view);
    for (const t of a.themes) insT.run(i + 1, 'themes', t);
    for (const g of a.gameTypes) insT.run(i + 1, 'gameTypes', g);
    for (const b of a.bundles) insT.run(i + 1, 'bundle', b);
  });
  const cases = [
    {}, { kind: 'sound' }, { kind: ['sound', 'music'] }, { type: 'effect' }, { type: ['pickup', 'sfx'] }, { view: 'top-down' },
    { role: 'world' }, { role: 'world/' }, { role: 'music/boss' }, { role: ['music/boss', 'interface'] }, { role: 'wor' }, { role: 'world/pro' },
    { themes: 'space' }, { themes: ['dungeon', 'farm'] }, { gameTypes: 'farming-sim' }, { gameTypes: ['puzzle', 'card-game'], kind: 'sound' },
    { bundle: 'space-shooter' }, { bundle: ['space-shooter', 'farming-sim-starter'], type: 'pickup' },
    { kind: 'sprite', type: 'prop', role: 'world', themes: 'dungeon', gameTypes: 'platformer', view: 'side', bundle: 'fantasy-platformer' },
    { kind: 'nothing' }, { themes: 'nowhere' }, { kind: '', themes: [], role: null, type: undefined },
    { constructor: 'x', hasOwnProperty: 'y', nonsense: 'z', kind: 'music' }, { role: "it's", themes: '%' }, { type: "a' OR '1'='1" },
  ];
  for (const filters of cases) {
    const f = filterSql(filters);
    assert.equal(f.params.length, (f.where.match(/\?/g) || []).length, 'one value per question mark: ' + f.where);
    const got = db.prepare(`SELECT a.id FROM assets a WHERE ${f.where} ORDER BY a.rowid`).all(...f.params).map((r) => r.id);
    const want = assets.filter((a) => matchesFilters(a, filters)).map((a) => a.id);
    assert.deepEqual(got, want, JSON.stringify(filters));
  }
  assert.ok(db.prepare(`SELECT count(*) AS n FROM assets a WHERE ${filterSql({ role: 'world' }).where}`).get(...filterSql({ role: 'world' }).params).n > 20);
  assert.deepEqual(filterSql({}), { where: '1', params: [] });
  db.close();
});

test('filter names that are not filters are ignored, even ones every object has', () => {
  const coin = assets.find((a) => a.id === 'coin');
  const odd = { constructor: 'x', hasOwnProperty: 'x', toString: 'y', __proto__: 'z', valueOf: ['q'] };
  assert.ok(matchesFilters(coin, odd));
  assert.equal(countFacets(assets, odd).total, assets.length);
  assert.equal(index.search('wizard', { filters: odd, limit: 1 })[0].id, 'wizard');
  assert.equal(filterAssets(assets, odd).length, assets.length);
  assert.deepEqual(filterSql(odd), { where: '1', params: [] });
});

test('input with no searchable words finds nothing; only an empty search lists everything', () => {
  for (const junk of ['"', '*', '(', ')', '😀', '日本', '%_', ' - ', '"" ()', '...']) {
    assert.deepEqual(index.search(junk, { limit: 30 }), [], `"${junk}"`);
    assert.deepEqual(index.search(junk, { filters: { kind: 'sound' }, limit: 30 }), [], `"${junk}" with filters`);
    assert.equal(ftsQuery(junk), null);
  }
  assert.equal(index.search('', { limit: 30 }).length, 30);
  assert.equal(index.search('   ', { limit: 12 }).length, 12);
  assert.equal(index.search(null, { filters: { kind: 'music' }, limit: 500 }).length, assets.filter((a) => a.kind === 'music').length);
  assert.deepEqual(index.search('xxxxxxxxxxxx', { limit: 30 }), []);
  assert.deepEqual(index.search('a OR b', { limit: 30 }), [], 'single letters are not treated as the start of a word');
});

test('one-letter words are never prefix searches, and very long input is cut short', () => {
  assert.doesNotMatch(ftsQuery('a OR b'), /\*/);
  assert.doesNotMatch(ftsQuery('level u'), /\*/);
  assert.match(ftsQuery('level up'), /"up" \*/);
  assert.ok(queryTokens('sword '.repeat(5000)).length <= 16);
  assert.ok(ftsQuery('sword shield '.repeat(5000)).length < 1000);
  const t = performance.now();
  const rows = index.search('wizard ' + 'x'.repeat(200000) + ' sword '.repeat(20000), { limit: 5 });
  assert.ok(performance.now() - t < 200, 'a huge query is answered quickly');
  assert.equal(rows[0].id, 'wizard');
});

test('respell fixes typos but leaves real words alone', () => {
  assert.equal(index.respell('sowrd'), 'sword');
  assert.equal(index.respell('Tresure chest!'), 'treasure chest');
  assert.equal(index.respell('robber'), 'robber', 'a different first letter is not a typo of "bobber"');
  assert.equal(index.respell('hero knight'), 'hero knight');
  // with a dictionary (the model's own word list), a real word is never swapped
  assert.equal(index.respell('wizzard sowrd', (w) => w === 'wizzard'), 'wizzard sword');
  assert.deepEqual(index.corrections('sowrd attack wizzard'), { sowrd: 'sword', wizzard: 'wizard' });
  assert.deepEqual(index.corrections('hero knight'), {});
});

test('similarByMeta counts a shared bundle', () => {
  const a = (id, extra) => ({ id, kind: 'sprite', type: 'prop', role: 'world/prop', name: id, words: [], themes: ['neutral'], gameTypes: [], bundles: [], ...extra });
  const few = [a('lamp', { bundles: ['camp'] }), a('zebra'), a('tent', { bundles: ['camp'] }), a('apple')];
  assert.equal(similarByMeta(few, 'lamp', 3)[0], 'tent');
});
