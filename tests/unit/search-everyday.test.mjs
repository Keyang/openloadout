// Everyday words ("bad guy", "money", "floor") in plain search: search/everyday-words.js applied by search/core.js
// when an index is built, and the ranking rules that keep unrelated things out of the results.
// Run with: node --test tests/unit/search-everyday.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { EVERYDAY_WORDS } from '../../search/everyday-words.js';
import { createKeywordIndex, everydayWords, keywordFields, searchText, ftsQuery, FTS_WEIGHTS, mergeKeywordRankings, mergeMeaningRanking, AND_WORDS } from '../../search/core.js';
import { buildSearchIndex } from '../../tools/lib/search-index.mjs';
import { matchesExpectation } from '../../tools/search-eval.mjs';

const ids = (rows) => rows.map((r) => r.id);
const fixture = (name) => JSON.parse(fs.readFileSync(new URL(`../fixtures/search/${name}`, import.meta.url), 'utf8'));

// A small made-up catalogue. The enemies and the floor have none of the everyday words in their own text:
// they must get them from their role and type, as a newly added asset would.
const made = [
  { id: 'grub', kind: 'sprite', name: 'Grub', type: 'creature', role: 'characters/enemy', description: 'A wriggling grub that crawls along.', words: ['grub', 'worm', 'crawl'] },
  { id: 'brigand', kind: 'sprite', name: 'Brigand', type: 'character', role: 'characters/enemy', description: 'A masked thief with a club.', words: ['thief', 'club', 'mask'] },
  { id: 'knight', kind: 'sprite', name: 'Knight', type: 'character', role: 'characters/player', description: 'A knight in shining armour.', words: ['knight', 'armour', 'sword'] },
  { id: 'medal', kind: 'sprite', name: 'Star medal', type: 'pickup', role: 'items/pickup', description: 'A star medal that twinkles.', words: ['star', 'medal', 'badge', 'bonus'] },
  { id: 'marks', kind: 'sprite', name: 'Status marks', type: 'ui', role: 'interface/icon', description: 'Small status marks.', words: ['status', 'badge', 'buff'] },
  { id: 'doubloon', kind: 'sprite', name: 'Doubloon', type: 'pickup', role: 'items/pickup', description: 'A spinning round piece.', words: ['doubloon', 'coin', 'spin'] },
  { id: 'flagstones', kind: 'sprite', name: 'Flagstones', type: 'tileset', role: 'world/tile', description: 'Grey flagstones.', words: ['stone', 'flagstone'] },
  { id: 'growl', kind: 'sound', name: 'Growl', type: 'sfx', role: 'characters/voice', description: 'A low growl.', words: ['growl'] },
];
const madeIndex = createKeywordIndex(made);
const madeTop = (q, limit = 5) => ids(madeIndex.search(q, { limit }));

test('the everyday-words table is plain data in the shape search/core.js reads', () => {
  assert.ok(Array.isArray(EVERYDAY_WORDS) && EVERYDAY_WORDS.length >= 20);
  for (const e of EVERYDAY_WORDS) {
    assert.ok(e.when && Object.keys(e.when).length > 0, 'every entry says which assets it is for');
    for (const key of Object.keys(e.when)) assert.ok(['kind', 'type', 'role', 'named'].includes(key), `unknown condition "${key}"`);
    assert.ok(Array.isArray(e.words) && e.words.length > 0);
    for (const w of e.words) assert.match(w, /^[a-z0-9]+( [a-z0-9]+)*$/, `"${w}" is lower case words separated by single spaces`);
  }
});

test('everydayWords gives an asset the words for its kind, type and role, and nothing for an unrelated one', () => {
  assert.ok(everydayWords(made[0]).includes('bad guy'), 'a creature enemy is a bad guy');
  assert.ok(everydayWords(made[1]).includes('baddie'));
  assert.ok(everydayWords(made[2]).includes('good guy'));
  assert.ok(!everydayWords(made[2]).includes('bad guy'), 'the player is not a bad guy');
  assert.ok(everydayWords(made[5]).includes('money'), 'a coin is money');
  assert.ok(!everydayWords(made[3]).includes('money'), 'a medal is a pickup but not money (the "named" condition)');
  assert.ok(everydayWords(made[6]).includes('floor'), 'a tileset is a floor');
  assert.ok(!everydayWords(made[7]).includes('bad guy'), 'a sound is not a bad guy');
  assert.deepEqual(everydayWords({ id: 'x', kind: 'sprite', type: 'unknown', role: 'nothing/here' }), []);
});

test('plain search finds a new asset by everyday words from its role and type alone', () => {
  assert.deepEqual(madeTop('bad guy').sort(), ['brigand', 'grub']);
  assert.deepEqual(madeTop('bad guys').sort(), ['brigand', 'grub']);
  assert.deepEqual(madeTop('baddie').sort(), ['brigand', 'grub']);
  assert.deepEqual(madeTop('good guy'), ['knight']);
  assert.equal(madeTop('money')[0], 'doubloon');
  assert.equal(madeTop('floor')[0], 'flagstones');
});

test('"bad guy" does not find things whose words merely start with "bad" (badge)', () => {
  for (const q of ['bad guy', 'bad guys', 'baddie', 'villain']) {
    const got = madeTop(q, 30);
    assert.ok(!got.includes('medal') && !got.includes('marks'), `${q} -> ${got.join(', ')}`);
  }
});

test('a whole word typed last ranks what has that word above what only starts with it', () => {
  const got = madeTop('bad', 30);
  const firstBadge = Math.min(...['medal', 'marks'].map((id) => got.indexOf(id)).filter((i) => i >= 0), Infinity);
  for (const enemy of ['grub', 'brigand']) assert.ok(got.indexOf(enemy) >= 0 && got.indexOf(enemy) < firstBadge, got.join(', '));
  assert.ok(madeTop('flagst').includes('flagstones'), 'a half-typed last word still finds by its start');
});

test('the parts of an everyday phrase do not each make a match: "bad" and "guy" are not words of a creature', () => {
  const f = keywordFields(made[0]);
  const text = Object.values(f).join(' ').split(/\s+/);
  assert.ok(text.includes('badguy'), 'the phrase is kept as one word');
  assert.ok(!text.includes('guy'), 'its parts are not');
});

test('the index file built at build time holds the everyday words too', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-everyday-'));
  after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'search.sqlite');
  await buildSearchIndex({ assets: made, outFile: file });
  const db = new DatabaseSync(file, { readOnly: true });
  const run = (q) => db.prepare(`SELECT a.id FROM assets_fts JOIN assets a ON a.rowid = assets_fts.rowid WHERE assets_fts MATCH ? ORDER BY bm25(assets_fts, ${FTS_WEIGHTS.join(', ')})`).all(ftsQuery(q)).map((r) => r.id);
  assert.deepEqual(run('baddie').sort(), ['brigand', 'grub']);
  assert.ok(run('bad guy').includes('grub'), 'the phrase is found as one word');
  assert.equal(run('floor')[0], 'flagstones');
  db.close();
});

test('the text the meaning model reads names the everyday words', () => {
  assert.match(searchText(made[0]), /bad guy/);
  assert.match(searchText(made[6]), /floor/);
});

test('a two-word search lists what has both words when anything does; a longer description also takes partial matches', () => {
  assert.equal(AND_WORDS, 2);
  const lib = [
    { id: 'battle', kind: 'music', name: 'Battle theme', type: 'music', role: 'music/battle', words: ['battle'] },
    { id: 'calm', kind: 'music', name: 'Calm theme', type: 'music', role: 'music/exploration', words: ['calm'] },
    { id: 'punch', kind: 'sound', name: 'Punch', type: 'sfx', role: 'actions/hit', words: ['punch', 'fight'] },
  ];
  const idx = createKeywordIndex(lib);
  assert.deepEqual(ids(idx.search('fight music')), ['battle'], 'only the fight music, not every piece of music nor every fight');
  assert.deepEqual(ids(idx.search('opera music')).sort(), ['battle', 'calm'], 'nothing has both words: any one will do');
  assert.ok(ids(idx.search('music for a big fight scene')).includes('punch'), 'a description keeps partial matches');
});

test('mergeKeywordRankings: for a short search the index file only reorders what the catalogue search found', () => {
  const cat = [{ id: 'a' }, { id: 'b' }];
  const idx = [{ id: 'c' }, { id: 'b' }, { id: 'a' }];
  assert.deepEqual(ids(mergeKeywordRankings('bad guy', cat, idx)).sort(), ['a', 'b'], '"c" is not added');
  assert.deepEqual(ids(mergeKeywordRankings('bad guy', [], idx)), ['c', 'b', 'a'], 'it answers alone when the catalogue search found nothing');
  assert.ok(ids(mergeKeywordRankings('music for a big fight scene', cat, idx)).includes('c'), 'a description takes both');
  assert.deepEqual(ids(mergeKeywordRankings('x', cat, idx, { limit: 1 })).length, 1);
});

test('mergeMeaningRanking: the model reorders a short search the words answered, and adds to the rest', () => {
  const kw = [{ id: 'a' }, { id: 'b' }];
  const byMeaning = [{ id: 'z' }, { id: 'b' }];
  assert.deepEqual(ids(mergeMeaningRanking('mouse pointer', kw, byMeaning)), ['b', 'a'], 'b is in both, z is left out');
  assert.deepEqual(ids(mergeMeaningRanking('kitty', [], byMeaning)), ['z', 'b'], 'the words found nothing: the model answers');
  assert.ok(ids(mergeMeaningRanking('noise for picking up a gold piece', kw, byMeaning)).includes('z'), 'a description takes both');
});

// ---- the real catalogue and the stand-in: expectations by role and type (tests/fixtures/search/queries-everyday.json)

const everyday = fixture('queries-everyday.json').queries;
const catalogues = [['the stand-in catalogue', fixture('catalog.json').assets]];
const real = new URL('../../generated/catalog.json', import.meta.url);
if (fs.existsSync(real)) catalogues.push(['the real catalogue', JSON.parse(fs.readFileSync(real, 'utf8')).assets]);

for (const [label, assets] of catalogues) {
  const index = createKeywordIndex(assets);
  const byId = new Map(assets.map((a) => [a.id, a]));
  const rightIn = (q, n) => {
    const x = everyday.find((y) => y.q === q);
    return ids(index.search(q, { limit: n })).map((id) => matchesExpectation(byId.get(id), x.expect));
  };
  const possible = (q) => assets.some((a) => matchesExpectation(a, everyday.find((y) => y.q === q).expect));

  test(`${label}: "bad guy" and "baddie" find only enemies and bosses`, () => {
    for (const q of ['bad guy', 'bad guys', 'baddie']) {
      if (!possible(q)) continue;
      const right = rightIn(q, 5);
      assert.ok(right.length > 0, `${q} finds something`);
      assert.ok(right.every(Boolean), `${q}: every result in the top 5 is an enemy or a boss`);
    }
  });

  test(`${label}: everyday words put a right result first`, () => {
    // (not "wall" or "trap": an asset named "Wall torch" or "Spike trap" sound is a fair first answer)
    const qs = ['good guy', 'hero', 'money', 'floor', 'ground', 'boom', 'footsteps', 'win music', 'fight music', 'mouse pointer'];
    const wrong = qs.filter((q) => possible(q) && !rightIn(q, 1)[0]);
    assert.deepEqual(wrong, []);
  });

  test(`${label}: everyday searches find a right result in the top 5 for at least 9 in 10`, () => {
    const usable = everyday.filter((x) => possible(x.q));
    const found = usable.filter((x) => rightIn(x.q, 5).some(Boolean));
    assert.ok(found.length >= 0.9 * usable.length, `${found.length} of ${usable.length}: missed ${usable.filter((x) => !found.includes(x)).map((x) => x.q).join(', ')}`);
  });
}
