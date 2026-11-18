// tools/lib/search-index.mjs: the SQLite file the build writes for search.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildSearchIndex, INDEX_VERSION } from '../../tools/lib/search-index.mjs';
import { createKeywordIndex, filterAssets, filterSql, ftsQuery, keywordSql, similarByMeta, quantize, cosineInt8 } from '../../search/core.js';

const catalog = JSON.parse(fs.readFileSync(new URL('../fixtures/search/catalog.json', import.meta.url), 'utf8'));
const assets = catalog.assets;
const DIM = 384;

// A stand-in for a real model: a fixed vector per word, summed. Texts that share words land close together.
function wordVector(word) {
  let h = 2166136261;
  const v = new Float32Array(DIM);
  for (let i = 0; i < DIM; i++) {
    for (let j = 0; j < word.length; j++) { h ^= word.charCodeAt(j) + i; h = Math.imul(h, 16777619); }
    v[i] = ((h >>> 0) / 4294967295) - 0.5;
  }
  return v;
}
async function fakeEmbed(texts) {
  return texts.map((t) => {
    const v = new Float32Array(DIM);
    for (const w of t.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) { const wv = wordVector(w); for (let i = 0; i < DIM; i++) v[i] += wv[i]; }
    const n = Math.hypot(...v) || 1;
    return v.map((x) => x / n);
  });
}
fakeEmbed.model = { id: 'test/fake-words', dim: DIM, pooling: 'mean', queryPrefix: '', dtype: 'q8', minScore: 0.42 };

let dir, withVec, noVec, info;
before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-search-'));
  withVec = path.join(dir, 'with.sqlite');
  noVec = path.join(dir, 'without.sqlite');
  info = await buildSearchIndex({ assets, outFile: withVec, embed: fakeEmbed });
  await buildSearchIndex({ assets, outFile: noVec });
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const open = (f) => new DatabaseSync(f, { readOnly: true });
const meta = (db) => Object.fromEntries(db.prepare('SELECT key, value FROM meta').all().map((r) => [r.key, r.value]));

test('writes one SQLite file and reports what is in it', () => {
  assert.ok(fs.statSync(withVec).size > 100_000);
  assert.equal(info.assets, assets.length);
  assert.equal(info.vectors, assets.length);
  assert.equal(info.dim, DIM);
  assert.equal(info.bytes, fs.statSync(withVec).size);
  assert.equal(fs.readFileSync(withVec).subarray(0, 15).toString(), 'SQLite format 3');
  assert.ok(!fs.existsSync(withVec + '-wal') && !fs.existsSync(withVec + '-journal'), 'no side files are left behind');
});

test('asset rows and filter columns', () => {
  const db = open(withVec);
  assert.equal(db.prepare('SELECT count(*) AS n FROM assets').get().n, assets.length);
  const coin = db.prepare("SELECT * FROM assets WHERE id = 'coin'").get();
  assert.equal(coin.kind, 'sprite'); assert.equal(coin.type, 'pickup'); assert.equal(coin.role, 'items/pickup'); assert.equal(coin.view, 'side');
  assert.equal(coin.name, 'Gold coin');
  assert.deepEqual(JSON.parse(coin.themes), ['neutral', 'fantasy']);
  const m = meta(db);
  assert.equal(Number(m.version), INDEX_VERSION);
  assert.equal(Number(m.assets), assets.length);
  assert.equal(m.model, 'test/fake-words');
  assert.equal(Number(m.dim), DIM);
  assert.equal(Number(m.min_score), 0.42, 'the similarity floor for this model travels with the vectors');
  assert.equal(m.built, undefined, 'no dates: the same input gives the same file');
  // every filter the site offers gives the same answer in SQL as in JavaScript
  const cases = [
    { kind: 'sound' }, { type: 'effect' }, { role: 'world' }, { role: 'music/boss' }, { themes: 'space' },
    { themes: ['dungeon', 'farm'], kind: 'sound' }, { gameTypes: 'farming-sim', view: 'top-down' },
    { bundle: 'space-shooter', type: ['pickup', 'sfx'] }, {},
  ];
  for (const filters of cases) {
    const f = filterSql(filters);
    const got = db.prepare(`SELECT a.id FROM assets a WHERE ${f.where} ORDER BY a.id`).all(...f.params).map((r) => r.id);
    const want = filterAssets(assets, filters).map((a) => a.id).sort();
    assert.deepEqual(got, want, JSON.stringify(filters));
    assert.ok(Object.keys(filters).length === 0 || got.length < assets.length);
  }
  db.close();
});

test('keyword index (FTS5) over name, words, description, role and type', () => {
  const db = open(withVec);
  const run = (q) => db.prepare(
    'SELECT a.id FROM assets_fts JOIN assets a ON a.rowid = assets_fts.rowid WHERE assets_fts MATCH ? ORDER BY bm25(assets_fts, 10, 6, 2, 3, 3, 1) LIMIT 5',
  ).all(ftsQuery(q)).map((r) => r.id);
  assert.equal(run('wizard')[0], 'wizard');
  assert.ok(run('money').some((id) => id.startsWith('coin')), 'words are searched');
  assert.ok(run('swaggering').includes('pirate'), 'descriptions are searched');
  assert.ok(run('footsteps').every((id) => id.startsWith('footstep-')), 'plural and singular match');
  assert.ok(run('jingle').length > 0, 'type is searched');
  assert.ok(run('skel').includes('skeleton'), 'prefix search');
  const cols = db.prepare('SELECT * FROM assets_fts LIMIT 1').get();
  for (const c of ['name', 'words', 'description', 'role', 'type']) assert.ok(c in cols, `column ${c}`);
  db.close();
});

test('one 384-number vector per asset, stored as bytes', () => {
  const db = open(withVec);
  const rows = db.prepare('SELECT a.id, v.v FROM vectors v JOIN assets a ON a.rowid = v.asset ORDER BY v.asset').all();
  assert.equal(rows.length, assets.length);
  for (const r of rows) assert.equal(r.v.byteLength, DIM);
  // the stored bytes are the quantised embedding of the asset's search text
  const coinText = db.prepare("SELECT search_text FROM assets WHERE id = 'coin'").get().search_text;
  const stored = rows.find((r) => r.id === 'coin').v;
  const int8 = new Int8Array(stored.buffer, stored.byteOffset, DIM);
  return fakeEmbed([coinText]).then(([v]) => {
    assert.ok(cosineInt8(int8, quantize(v)) > 0.999);
    db.close();
  });
});

test("each asset's nearest neighbours", () => {
  const db = open(withVec);
  const near = (id, n = 8) => db.prepare(
    'SELECT b.id, n.score FROM neighbours n JOIN assets a ON a.rowid = n.asset JOIN assets b ON b.rowid = n.other WHERE a.id = ? ORDER BY n.rank LIMIT ?',
  ).all(id, n);
  const snow = near('footstep-snow');
  assert.ok(snow.length >= 6);
  assert.ok(!snow.some((r) => r.id === 'footstep-snow'));
  assert.ok(snow.filter((r) => r.id.startsWith('footstep-')).length >= 4, 'similar things are neighbours');
  for (let i = 1; i < snow.length; i++) assert.ok(snow[i - 1].score >= snow[i].score);
  assert.equal(db.prepare('SELECT count(DISTINCT asset) AS n FROM neighbours').get().n, assets.length);
  // shared words, role and bundle decide the order; vectors only break ties and fill up
  for (const id of ['coin', 'chest', 'footstep-snow', 'music-boss', 'ui-button']) {
    const got = near(id, 12).map((r) => r.id);
    const meta = new Map(similarByMeta(assets, id, assets.length, { scores: true }).map((r) => [r.id, r.score]));
    const scores = got.map((x) => meta.get(x) || 0);
    for (let i = 1; i < scores.length; i++) assert.ok(scores[i - 1] >= scores[i] - 1e-9, `${id}: ${got[i - 1]} (${scores[i - 1]}) before ${got[i]} (${scores[i]})`);
    assert.ok(scores[0] >= Math.max(...meta.values()) - 1e-9, `${id}: the closest by words and role comes first`);
  }
  assert.ok(near('coin', 6).some((r) => r.id === 'coin-pickup'), 'the coin sound is among the coin sprite\'s neighbours');
  db.close();
});

test('input with no searchable words finds nothing in the index file either', () => {
  const db = open(withVec);
  const run = (q, filters) => { const { sql, params } = keywordSql(q, { filters, limit: 30 }); return db.prepare(sql).all(...params); };
  for (const junk of ['"', '*', '(', '😀', '日本', '%_', 'a OR b', 'xxxxxxxxxxxx']) {
    assert.deepEqual(run(junk), [], `"${junk}"`);
    assert.deepEqual(run(junk, { kind: 'sound' }), [], `"${junk}" with filters`);
  }
  assert.equal(run('', null).length, 30);
  assert.equal(run('', { role: 'music/boss' }).length, 3);
  assert.equal(run('wizard', { constructor: 'x' })[0].id, 'wizard');
  db.close();
});

test('without an embed function there are no vectors and keyword search still works', () => {
  const db = open(noVec);
  assert.equal(db.prepare('SELECT count(*) AS n FROM vectors').get().n, 0);
  const m = meta(db);
  assert.equal(m.model, '');
  assert.equal(Number(m.vectors), 0);
  const hit = db.prepare('SELECT a.id FROM assets_fts JOIN assets a ON a.rowid = assets_fts.rowid WHERE assets_fts MATCH ? ORDER BY rank LIMIT 3').all(ftsQuery('dragon'));
  assert.equal(hit[0].id, 'dragon');
  // neighbours fall back to what the catalogue says
  assert.equal(db.prepare('SELECT count(DISTINCT asset) AS n FROM neighbours').get().n, assets.length);
  db.close();
  assert.ok(fs.statSync(noVec).size < fs.statSync(withVec).size);
});

test('the same input gives the same file', async () => {
  const again = path.join(dir, 'again.sqlite');
  await buildSearchIndex({ assets, outFile: again, embed: fakeEmbed });
  assert.ok(fs.readFileSync(again).equals(fs.readFileSync(withVec)));
  // rebuilding over an existing file replaces it
  await buildSearchIndex({ assets: assets.slice(0, 10), outFile: again });
  const db = open(again);
  assert.equal(db.prepare('SELECT count(*) AS n FROM assets').get().n, 10);
  db.close();
});

test('rejects vectors of the wrong size and duplicate ids', async () => {
  const bad = Object.assign(async (texts) => texts.map(() => new Float32Array(10)), { model: { id: 'x', dim: 384 } });
  await assert.rejects(buildSearchIndex({ assets: assets.slice(0, 3), outFile: path.join(dir, 'bad.sqlite'), embed: bad }), /384|size|length/i);
  await assert.rejects(buildSearchIndex({ assets: [assets[0], assets[0]], outFile: path.join(dir, 'dup.sqlite') }), /duplicate|unique/i);
});

test('the browser build of SQLite opens the file and its keyword index', async () => {
  // The site uses @sqlite.org/sqlite-wasm; this is the same WebAssembly build running in Node.
  const { default: init } = await import('@sqlite.org/sqlite-wasm');
  const sqlite3 = await init({ print: () => {}, printErr: () => {} });
  const bytes = new Uint8Array(fs.readFileSync(withVec));
  const db = new sqlite3.oo1.DB();
  const p = sqlite3.wasm.allocFromTypedArray(bytes);
  const rc = sqlite3.capi.sqlite3_deserialize(db.pointer, 'main', p, bytes.length, bytes.length,
    sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite3.capi.SQLITE_DESERIALIZE_READONLY);
  assert.equal(rc, 0);
  const options = db.selectValues('PRAGMA compile_options');
  assert.ok(options.includes('ENABLE_FTS5'), 'FTS5 is switched on in the official WebAssembly build');
  const idsFound = db.selectValues(
    'SELECT a.id FROM assets_fts JOIN assets a ON a.rowid = assets_fts.rowid WHERE assets_fts MATCH ? ORDER BY rank LIMIT 3', [ftsQuery('wizard')]);
  assert.equal(idsFound[0], 'wizard');
  const blob = db.selectValue("SELECT v.v FROM vectors v JOIN assets a ON a.rowid = v.asset WHERE a.id = 'coin'");
  assert.equal(blob.byteLength, DIM);
  db.close();
  // the keyword search that needs no database agrees on the easy cases
  assert.equal(createKeywordIndex(assets).search('wizard', { limit: 1 })[0].id, 'wizard');
});
