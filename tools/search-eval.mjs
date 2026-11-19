#!/usr/bin/env node
// Measures search on the test set in tests/fixtures/search/ (FIND-10) and decides the embedding model.
//
//   node tools/search-eval.mjs                 run everything and print the tables
//   node tools/search-eval.mjs --write         also put the tables into docs/search-eval.md
//   node tools/search-eval.mjs --models Snowflake/snowflake-arctic-embed-xs
//   node tools/search-eval.mjs --misses        list the searches each method got wrong
//   node tools/search-eval.mjs --everyday      everyday searches ("bad guy", "money") on the real catalogue; see evaluateEveryday
//
// For every search it asks: is one of the right assets in the top 5? It asks that of
//   basic      keyword search from the catalogue alone (search/core.js)
//   FTS5       keyword search inside the SQLite index file
//   each model alone (query vector against every asset vector, 8 bits a number)
//   keyword + each model (the two rankings merged)
// and records model size, time per query, index size and the cost of comparing 10,000 vectors.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import {
  createKeywordIndex, matchesFilters, keywordSql, mergeRankings, mergeKeywordRankings, mergeMeaningRanking, quantize, vectorNorms, topKVectors, searchText, hasRealWords,
} from '../search/core.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'tests', 'fixtures', 'search');
const WORK = path.join(ROOT, '.cache', 'search-eval');
export const KINDS = ['exact', 'verb', 'synonym', 'description', 'misspelling', 'filtered'];
export const PASS_MARK = { gain: 15, maxModelBytes: 35e6 };   // docs/search-design.md section 6
/** How the keyword ranking and the vector ranking are weighed when merged: [keyword, vector]. search/client.js uses the same. */
export const FUSION = [1, 1];
/** Input that means nothing, for seeing how similar the model thinks it is to the nearest asset. */
export const NONSENSE = ['xxxxxxxxxxxx', 'asdfghjkl', 'qwrtp zxcvb', 'zzzz qqqq', '12345', 'kjhgfd'];

/** Run every search through `search(q, { filters, limit })` and mark whether a right answer is in the top `limit`. */
export function runQueries(queries, search, { limit = 5 } = {}) {
  return queries.map((query) => {
    const got = search(query.q, { filters: query.filters || null, limit }).slice(0, limit).map((r) => r.id);
    const rank = got.findIndex((id) => query.expect.includes(id));
    return { q: query.q, kind: query.kind, expect: query.expect, got, rank, hit: rank >= 0 };
  });
}

/** { exact: { n, hits, top5, top1 }, ..., all: {...} } */
export function summarize(rows) {
  const out = {};
  const add = (key, r) => {
    const s = out[key] || (out[key] = { n: 0, hits: 0, first: 0 });
    s.n++; if (r.hit) s.hits++; if (r.rank === 0) s.first++;
  };
  for (const r of rows) { add(r.kind, r); add('all', r); }
  for (const s of Object.values(out)) { s.top5 = s.hits / s.n; s.top1 = s.first / s.n; }
  return out;
}

const median = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const mb = (bytes) => (bytes / 1e6).toFixed(1) + ' MB';
const kb = (bytes) => Math.round(bytes / 1e3) + ' KB';
const pct = (x) => Math.round(x * 100) + '%';
const gz = (file) => zlib.gzipSync(fs.readFileSync(file), { level: 9 }).length;

export function loadTestSet() {
  const catalog = JSON.parse(fs.readFileSync(path.join(FIX, 'catalog.json'), 'utf8'));
  const { queries } = JSON.parse(fs.readFileSync(path.join(FIX, 'queries.json'), 'utf8'));
  const blindFile = path.join(FIX, 'queries-blind.json');
  const blind = fs.existsSync(blindFile) ? JSON.parse(fs.readFileSync(blindFile, 'utf8')).queries.map((q) => ({ kind: 'blind', ...q })) : [];
  return { assets: catalog.assets, queries, blind };
}

/** Keyword search inside an index file, the way the browser client does it. */
export function ftsSearcher(dbFile, basic) {
  const db = new DatabaseSync(dbFile, { readOnly: true });
  const search = (q, { filters, limit }) => {
    const { sql, params } = keywordSql(q, { filters, limit, expand: basic.correct });
    return db.prepare(sql).all(...params);
  };
  search.close = () => db.close();
  return search;
}

/** Time to compare one query with n stored 8-bit vectors in plain JavaScript (median of several runs, ms). */
export function timeVectorScan(n = 10000, dim = 384, k = 50) {
  let s = 12345; const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  const matrix = new Int8Array(n * dim);
  for (let i = 0; i < matrix.length; i++) matrix[i] = Math.round(rnd() * 127);
  const norms = vectorNorms(matrix, dim);
  const q = Float32Array.from({ length: dim }, rnd);
  for (let i = 0; i < 5; i++) topKVectors(q, matrix, dim, k, { norms });
  const times = [];
  for (let i = 0; i < 25; i++) { const t = performance.now(); topKVectors(q, matrix, dim, k, { norms }); times.push(performance.now() - t); }
  return median(times);
}

async function evalModel(id, { assets, queries, blind, basic, keyword, bits = 32, weights = FUSION, buildSearchIndex, createEmbedder, modelFiles }) {
  const t0 = performance.now();
  const e = await createEmbedder(id, { bits });
  const loadMs = performance.now() - t0;
  const dim = e.spec.dim;
  const texts = assets.map(searchText);
  const t1 = performance.now();
  const passages = await e.embedPassages(texts);
  const passagesMs = performance.now() - t1;
  const matrix = new Int8Array(assets.length * dim);
  passages.forEach((v, i) => matrix.set(quantize(v), i * dim));
  const norms = vectorNorms(matrix, dim);

  await e.embedQuery('warm up');
  const qvec = new Map(), times = [];
  for (const query of [...queries, ...blind]) {
    if (!query.q) continue;
    const t = performance.now();
    qvec.set(query.q, await e.embedQuery(query.q));
    times.push(performance.now() - t);
    // the site corrects spelling against the catalogue's words before it asks the model (real words are left alone)
    const fixed = basic.respell(query.q, e.isWord);
    if (!qvec.has(fixed)) qvec.set(fixed, await e.embedQuery(fixed));
  }
  // The similarity floor: how similar the right answers are, and how similar nonsense is.
  const rightScores = [];
  for (const query of [...queries, ...blind]) {
    if (!query.q || query.kind === 'misspelling') continue;
    const hit = topKVectors(qvec.get(basic.respell(query.q, e.isWord)), matrix, dim, 5, { norms }).find((h) => query.expect.includes(assets[h.index].id));
    if (hit) rightScores.push(hit.score);
  }
  rightScores.sort((a, b) => a - b);
  const nonsense = [];
  for (const text of NONSENSE) nonsense.push(topKVectors(await e.embedQuery(text), matrix, dim, 1, { norms })[0].score);
  let autoFloor = 0;
  for (let f = 0.2; f < 0.95; f += 0.01) if (rightScores.filter((x) => x < f).length <= 0.02 * rightScores.length) autoFloor = Math.round(f * 100) / 100;
  const floor = e.spec.minScore || autoFloor;
  const surviving = (text) => topKVectors(qvec.get(text), matrix, dim, 50, { norms }).filter((h) => h.score >= floor).length;
  const realQs = [...queries, ...blind].filter((x) => x.q && x.kind !== 'misspelling');
  const calibration = {
    floor, autoFloor, fromSpec: !!e.spec.minScore, right: rightScores.length,
    min: rightScores[0], p5: rightScores[Math.floor(rightScores.length * 0.05)], median: rightScores[Math.floor(rightScores.length / 2)],
    lost: rightScores.filter((x) => x < floor).length, nonsenseMax: Math.max(...nonsense), nonsenseMin: Math.min(...nonsense),
    keptPerSearch: realQs.reduce((acc, x) => acc + surviving(basic.respell(x.q, e.isWord)), 0) / realQs.length,
  };
  const vector = (q, { filters, limit }) => {
    if (!q) return basic.search(q, { filters, limit });
    const allow = filters ? (i) => matchesFilters(assets[i], filters) : null;
    return topKVectors(qvec.get(q), matrix, dim, limit, { norms, allow }).map((h) => ({ id: assets[h.index].id, score: h.score }));
  };
  const hybrid = (q, { filters, limit }) => {
    if (!q) return keyword(q, { filters, limit });
    // As search/client.js does: the model is not asked about input with no real words in it, spelling is corrected
    // against the catalogue's words first, and assets less similar than the floor are not results.
    const kw = keyword(q, { filters, limit: 50 });
    if (!hasRealWords(q)) return kw.slice(0, limit);
    const byMeaning = vector(basic.respell(q, e.isWord), { filters, limit: 50 }).filter((r) => r.score >= floor);
    return mergeMeaningRanking(q, kw, byMeaning, { limit, weights });
  };
  // how much is lost by storing 8 bits a number instead of 32
  const full = (q, { filters, limit }) => {
    if (!q) return basic.search(q, { filters, limit });
    const v = qvec.get(q);
    return passages.map((p, i) => ({ id: assets[i].id, i, score: p.reduce((acc, x, j) => acc + x * v[j], 0) }))
      .filter((r) => !filters || matchesFilters(assets[r.i], filters)).sort((a, b) => b.score - a.score).slice(0, limit);
  };

  const outFile = path.join(WORK, id.replace(/[^a-z0-9]+/gi, '-') + '.sqlite');
  const built = await buildSearchIndex({ assets, outFile, embed: Object.assign(async () => passages, { model: e.embed.model }) });
  const files = modelFiles(id).map((f) => ({ rel: f.rel, bytes: fs.statSync(f.file).size, gzip: gz(f.file) }));
  let bytes = files.reduce((s, f) => s + f.bytes, 0), gzip = files.reduce((s, f) => s + f.gzip, 0), note = '';
  if (e.spec.kind === 'static') {
    const table = files.find((f) => f.rel === 'model.safetensors');
    const rows = Math.round((table.bytes) / (dim * 4));
    note = `the table is ${mb(table.bytes)} as 32-bit numbers; as 8-bit it would be ${mb(rows * dim)} (${rows} rows of ${dim})`;
    if (bits === 8) { bytes = bytes - table.bytes + rows * dim; gzip = null; }
  }
  return {
    id: bits === 8 ? `${id} (8-bit table)` : id, model: id, kind: e.spec.kind, dim, license: e.spec.license, bytes, gzip, files, note,
    calibration, loadMs, passagesMs, queryMs: median(times), queryMsMax: Math.max(...times), indexBytes: built.bytes,
    vector: runQueries(queries, vector), hybrid: runQueries(queries, hybrid), full: summarize(runQueries(queries, full)),
    blindVector: runQueries(blind, vector), blindHybrid: runQueries(blind, hybrid),
  };
}

function table(head, rows) {
  return ['| ' + head.join(' | ') + ' |', '|' + head.map((_, i) => (i ? '---:' : '---')).join('|') + '|', ...rows.map((r) => '| ' + r.join(' | ') + ' |')].join('\n');
}

export async function evaluate({ models, weights = FUSION, log = () => {} } = {}) {
  const { buildSearchIndex } = await import('./lib/search-index.mjs');
  const { createEmbedder, modelFiles, MODELS, DEFAULT_MODEL } = await import('./lib/embed.mjs');
  const { assets, queries, blind } = loadTestSet();
  fs.mkdirSync(WORK, { recursive: true });
  const basic = createKeywordIndex(assets);
  const basicRows = runQueries(queries, (q, o) => basic.search(q, o));

  const plain = path.join(WORK, 'keywords-only.sqlite');
  const plainInfo = await buildSearchIndex({ assets, outFile: plain });
  const fts = ftsSearcher(plain, basic);
  const ftsRows = runQueries(queries, fts);
  const ftsNoFix = ftsSearcher(plain, { correct: () => [] });
  const ftsNoFixRows = runQueries(queries, ftsNoFix);
  // the keyword ranking the site uses once the index file has loaded: both keyword searches merged
  const keyword = (q, { filters, limit }) => (q ? mergeKeywordRankings(q, basic.search(q, { filters, limit: 50 }), fts(q, { filters, limit: 50 }), { limit }) : basic.search(q, { filters, limit }));
  const keywordRows = runQueries(queries, keyword);
  const blindRows = { basic: runQueries(blind, (q, o) => basic.search(q, o)), fts: runQueries(blind, fts), keyword: runQueries(blind, keyword) };

  const ids = models && models.length ? models : Object.keys(MODELS);
  const results = [];
  for (const id of ids) {
    log(`embedding with ${id} ...`);
    results.push(await evalModel(id, { assets, queries, blind, basic, keyword, weights, buildSearchIndex, createEmbedder, modelFiles }));
    if (MODELS[id].kind === 'static') results.push(await evalModel(id, { assets, queries, blind, basic, keyword, bits: 8, weights, buildSearchIndex, createEmbedder, modelFiles }));
  }
  fts.close(); ftsNoFix.close();

  // timings that do not depend on the model
  const kwTimes = [], ftsTimes = [];
  const fts2 = ftsSearcher(plain, basic);
  for (let rep = 0; rep < 5; rep++) for (const q of queries) {
    let t = performance.now(); basic.search(q.q, { filters: q.filters, limit: 30 }); kwTimes.push(performance.now() - t);
    t = performance.now(); fts2(q.q, { filters: q.filters, limit: 30 }); ftsTimes.push(performance.now() - t);
  }
  fts2.close();
  const tb = performance.now(); createKeywordIndex(assets); const basicBuildMs = performance.now() - tb;
  const scanMs = timeVectorScan(10000, 384, 50);
  const sqliteDir = path.join(ROOT, 'node_modules', '@sqlite.org', 'sqlite-wasm', 'dist');
  const sqliteFiles = ['index.mjs', 'sqlite3.wasm'].map((f) => ({ rel: f, bytes: fs.statSync(path.join(sqliteDir, f)).size, gzip: gz(path.join(sqliteDir, f)) }));

  return {
    counts: { assets: assets.length, queries: queries.length, blind: blind.length, byKind: Object.fromEntries(KINDS.map((k) => [k, queries.filter((q) => q.kind === k).length])) },
    basic: basicRows, fts: ftsRows, ftsNoFix: ftsNoFixRows, keyword: keywordRows, blind: blindRows, weights, models: results, defaultModel: DEFAULT_MODEL,
    timing: { basicMs: median(kwTimes), ftsMs: median(ftsTimes), basicBuildMs, scanMs },
    sizes: { indexNoVectors: plainInfo.bytes, sqlite: sqliteFiles },
    node: process.version,
  };
}

/** Does keyword + this model beat keyword alone on description searches by the pass mark, with a small enough model? */
export function verdict(r, m) {
  const kw = summarize(r.keyword).description.top5, hy = summarize(m.hybrid).description.top5;
  const gain = Math.round((hy - kw) * 100);
  const blind = r.counts.blind ? Math.round((summarize(m.blindHybrid).all.top5 - summarize(r.blind.keyword).all.top5) * 100) : null;
  const small = m.bytes <= PASS_MARK.maxModelBytes;
  return { gain, blind, small, pass: gain >= PASS_MARK.gain && small, passBlind: blind != null && blind >= PASS_MARK.gain && small };
}

export function report(r) {
  const S = { basic: summarize(r.basic), fts: summarize(r.fts), ftsNoFix: summarize(r.ftsNoFix), keyword: summarize(r.keyword) };
  const short = (id) => id.split('/').pop();
  const cols = [['Basic keyword', S.basic], ['FTS5 keyword', S.fts], ['Both keyword searches', S.keyword]];
  for (const m of r.models) cols.push([`${short(m.id)} alone`, summarize(m.vector)]);
  for (const m of r.models) cols.push([`keyword + ${short(m.id)}`, summarize(m.hybrid)]);
  const kinds = [...KINDS, 'all'];
  const label = (k) => (k === 'all' ? '**All**' : k) + ` (${k === 'all' ? r.counts.queries : r.counts.byKind[k]})`;
  const lines = [];
  lines.push(`Test set: ${r.counts.assets} catalogue entries, ${r.counts.queries} searches. Node ${r.node}. A search counts as found when a right answer is in the first 5 results.`);
  lines.push('', '### Right asset in the top 5', '');
  lines.push(table(['Method', ...kinds.map(label)], cols.map(([name, s]) => [name, ...kinds.map((k) => pct(s[k].top5))])));
  lines.push('', '### Right asset in first place', '');
  lines.push(table(['Method', ...kinds.map(label)], cols.map(([name, s]) => [name, ...kinds.map((k) => pct(s[k].top1))])));
  lines.push('', '### The pass mark', '');
  lines.push(`Keyword plus model must find the right asset in the top 5 at least ${PASS_MARK.gain} points more often than keyword alone on description searches, with a model under ${mb(PASS_MARK.maxModelBytes)}. Keyword alone on description searches: ${pct(S.keyword.description.top5)}.`, '');
  const sign = (n) => (n >= 0 ? '+' : '') + n;
  if (r.counts.blind) lines.push(`On the ${r.counts.blind} held-out description searches (\`queries-blind.json\`, written without sight of the descriptions and words), keyword alone finds ${pct(summarize(r.blind.keyword).all.top5)}.`, '');
  lines.push(table(['Model', 'Keyword + model, description', 'Gain (points)', 'Keyword + model, held-out', 'Gain, held-out (points)', 'Model download', 'Passed on the main set', 'Passed on the held-out set'],
    r.models.map((m) => { const v = verdict(r, m); return [m.id, pct(summarize(m.hybrid).description.top5), sign(v.gain), r.counts.blind ? pct(summarize(m.blindHybrid).all.top5) : '', v.blind == null ? '' : sign(v.blind), mb(m.bytes), v.pass ? 'yes' : 'no', v.passBlind ? 'yes' : 'no']; })));
  if (r.counts.blind) {
    lines.push('', `### The held-out description searches (${r.counts.blind})`, '');
    const b = [['Basic keyword', summarize(r.blind.basic)], ['FTS5 keyword', summarize(r.blind.fts)], ['Both keyword searches', summarize(r.blind.keyword)]];
    for (const m of r.models) b.push([`${short(m.id)} alone`, summarize(m.blindVector)]);
    for (const m of r.models) b.push([`keyword + ${short(m.id)}`, summarize(m.blindHybrid)]);
    lines.push(table(['Method', 'In the top 5', 'In first place'], b.map(([name, s]) => [name, pct(s.all.top5), pct(s.all.top1)])));
  }
  lines.push('', '### Models', '');
  lines.push(table(['Model', 'Kind', 'Numbers per vector', 'Licence', 'Download', 'Download, gzip', 'One query in Node (median)', 'Slowest query', `All ${r.counts.assets} assets`, 'Index file'],
    r.models.map((m) => [m.id, m.kind, m.dim, m.license, mb(m.bytes), m.gzip == null ? 'not measured' : mb(m.gzip), m.queryMs.toFixed(1) + ' ms', m.queryMsMax.toFixed(1) + ' ms', (m.passagesMs / 1000).toFixed(1) + ' s', kb(m.indexBytes)])));
  lines.push('');
  for (const m of r.models) {
    lines.push(`- ${m.id}: ${m.files.map((f) => `\`${f.rel}\` ${f.bytes.toLocaleString('en-US')} bytes`).join(', ')}.${m.note ? ' Note: ' + m.note + '.' : ''} Top 5 with full-precision vectors instead of 8-bit: ${pct(m.full.all.top5)} overall (8-bit: ${pct(summarize(m.vector).all.top5)}).`);
  }
  lines.push('', '### The similarity floor', '');
  lines.push('At the meaning level an asset less similar to the query than the floor is not a result, so nonsense finds nothing and a small library is not padded with unrelated assets. "Right answers" are the right assets the model ranks in its own top 5, over the main and held-out searches (misspellings left out). The floor for the chosen model is fixed in `tools/lib/embed.mjs`; for the others it is the highest value that loses at most 2% of the right answers. It was set on these same searches, so it is fitted to them.', '');
  lines.push(table(['Model', 'Right answers', 'Lowest', '5th percentile', 'Median', `Nonsense input (${NONSENSE.length} strings), nearest asset`, 'Floor', 'Right answers under the floor', 'Results over the floor per search (of 50)'],
    r.models.map((m) => { const c = m.calibration; return [m.id, c.right, c.min.toFixed(3), c.p5.toFixed(3), c.median.toFixed(3), `${c.nonsenseMin.toFixed(3)} to ${c.nonsenseMax.toFixed(3)}`, c.floor.toFixed(2) + (c.fromSpec ? '' : ' (by the 2% rule)'), `${c.lost} of ${c.right}`, c.keptPerSearch.toFixed(1)]; })));
  lines.push('', '### Other measurements', '');
  const sq = r.sizes.sqlite;
  lines.push(table(['What', 'Measured'], [
    ['Basic keyword search, one query (median)', r.timing.basicMs.toFixed(2) + ' ms'],
    ['Building the basic keyword search from the catalogue', r.timing.basicBuildMs.toFixed(0) + ' ms'],
    ['FTS5 keyword search in Node, one query (median)', r.timing.ftsMs.toFixed(2) + ' ms'],
    ['Comparing one query with 10,000 stored vectors (384 numbers, 8-bit) in plain JavaScript', r.timing.scanMs.toFixed(1) + ' ms'],
    [`Index file without vectors (${r.counts.assets} assets)`, kb(r.sizes.indexNoVectors)],
    ...r.models.filter((m) => !m.id.includes('8-bit')).map((m) => [`Index file with ${short(m.id)} vectors`, kb(m.indexBytes)]),
    ...sq.map((f) => [`SQLite WebAssembly build: \`${f.rel}\``, `${kb(f.bytes)} (${kb(f.gzip)} gzip)`]),
    ['FTS5 keyword search without spelling help: misspelling searches found', pct(S.ftsNoFix.misspelling.top5)],
  ]));
  return lines.join('\n');
}

export function misses(r) {
  const out = [];
  const show = (name, rows) => { for (const x of rows.filter((y) => !y.hit)) out.push(`${name.padEnd(34)} [${x.kind}] "${x.q}" -> ${x.got.join(', ')}`); };
  show('basic', r.basic); show('fts5', r.fts); show('keyword', r.keyword);
  for (const m of r.models) { show(m.id.split('/').pop() + ' alone', m.vector); show('keyword + ' + m.id.split('/').pop(), m.hybrid); }
  show('blind: basic', r.blind.basic); show('blind: keyword', r.blind.keyword);
  for (const m of r.models) { show('blind: ' + m.id.split('/').pop() + ' alone', m.blindVector); show('blind: keyword + ' + m.id.split('/').pop(), m.blindHybrid); }
  return out.join('\n');
}

// ---------------------------------------------------------------- everyday searches
// tests/fixtures/search/queries-everyday.json: what a non-artist would type ("bad guy", "money", "floor"), with the
// right results stated by kind, type and role rather than by id, so the same set scores any catalogue.
//
//   node tools/search-eval.mjs --everyday                       the real catalogue (generated/catalog.json)
//   node tools/search-eval.mjs --everyday --catalog <file>      another one (the stand-in: tests/fixtures/search/catalog.json)
//   add --no-model to leave out smarter search, --misses to list what each level got wrong

const asList = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const roleUnder = (role, want) => role === want || String(role || '').startsWith(want + '/');

/** Is this asset a right answer for an expectation ({ kind, type, role, named } or a list of them, any one)? */
export function matchesExpectation(asset, expect) {
  return asList(expect).some((e) => {
    if (e.kind && !asList(e.kind).includes(asset.kind)) return false;
    if (e.type && !asList(e.type).includes(asset.type)) return false;
    if (e.role && !asList(e.role).some((r) => roleUnder(asset.role, r))) return false;
    if (e.named) {
      const words = new Set(`${asset.name || ''} ${asList(asset.words).join(' ')}`.toLowerCase().split(/[^a-z0-9]+/));
      if (!asList(e.named).some((w) => words.has(w))) return false;
    }
    return true;
  });
}

export function loadEveryday() {
  return JSON.parse(fs.readFileSync(path.join(FIX, 'queries-everyday.json'), 'utf8')).queries;
}

/** Run each everyday search: { q, got, first, found, clean } where clean is how many of the top 5 are right (0 to 1). */
export function runEveryday(queries, search, assets, { limit = 5 } = {}) {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const possible = (e) => assets.some((a) => matchesExpectation(a, e));
  return queries.filter((x) => possible(x.expect)).map((x) => {
    const got = search(x.q, { limit }).slice(0, limit).map((r) => r.id);
    const right = got.map((id) => byId.has(id) && matchesExpectation(byId.get(id), x.expect));
    return { q: x.q, got: got.map((id) => (byId.get(id) || { name: id }).name), right, first: !!right[0], found: right.some(Boolean), clean: got.length ? right.filter(Boolean).length / Math.min(limit, got.length) : 0 };
  });
}

export function summarizeEveryday(rows) {
  const n = rows.length || 1;
  return { n: rows.length, first: rows.filter((r) => r.first).length / n, found: rows.filter((r) => r.found).length / n, clean: rows.reduce((s, r) => s + r.clean, 0) / n };
}

/** Plain search (catalogue only, then with the index file) and smarter search on the everyday set. */
export async function evaluateEveryday({ catalogFile = path.join(ROOT, 'generated', 'catalog.json'), model = true, log = () => {} } = {}) {
  const { buildSearchIndex } = await import('./lib/search-index.mjs');
  const assets = JSON.parse(fs.readFileSync(catalogFile, 'utf8')).assets;
  const queries = loadEveryday();
  fs.mkdirSync(WORK, { recursive: true });
  const basic = createKeywordIndex(assets);
  const plainFile = path.join(WORK, 'everyday-keywords.sqlite');
  await buildSearchIndex({ assets, outFile: plainFile });
  const fts = ftsSearcher(plainFile, basic);
  // what the site does once the index file has loaded: both keyword searches merged
  const keyword = (q, { limit }) => mergeKeywordRankings(q, basic.search(q, { limit: 50 }), fts(q, { limit: 50 }), { limit });
  const out = { catalog: path.relative(ROOT, catalogFile), assets: assets.length, queries: queries.length, levels: {} };
  out.levels.basic = runEveryday(queries, (q, o) => basic.search(q, o), assets);
  out.levels.keywords = runEveryday(queries, keyword, assets);
  if (model) {
    const { createEmbedder, DEFAULT_MODEL } = await import('./lib/embed.mjs');
    log(`embedding ${assets.length} assets with ${DEFAULT_MODEL} ...`);
    const e = await createEmbedder(DEFAULT_MODEL);
    const dim = e.spec.dim;
    const passages = await e.embedPassages(assets.map(searchText));
    const matrix = new Int8Array(assets.length * dim);
    passages.forEach((v, i) => matrix.set(quantize(v), i * dim));
    const norms = vectorNorms(matrix, dim);
    const floor = e.spec.minScore || 0;
    const qvec = new Map();
    for (const x of queries) { const t = basic.respell(x.q, e.isWord); if (!qvec.has(t)) qvec.set(t, await e.embedQuery(t)); }
    // as search/client.js does: keywords merged with what the model finds above the similarity floor
    const smarter = (q, { limit }) => {
      const kw = keyword(q, { limit: 50 });
      if (!hasRealWords(q)) return kw.slice(0, limit);
      const byMeaning = topKVectors(qvec.get(basic.respell(q, e.isWord)), matrix, dim, 50, { norms })
        .filter((h) => h.score >= floor).map((h) => ({ id: assets[h.index].id, score: h.score }));
      return mergeMeaningRanking(q, kw, byMeaning, { limit, weights: FUSION });
    };
    out.levels.smarter = runEveryday(queries, smarter, assets);
  }
  fts.close();
  return out;
}

export function reportEveryday(r, { misses: showMisses = false } = {}) {
  const names = { basic: 'Plain search, catalogue only', keywords: 'Plain search with the index file', smarter: 'Smarter search' };
  const lines = [`Everyday searches: ${r.levels.basic.length} of ${r.queries} apply to ${r.catalog} (${r.assets} assets).`, ''];
  lines.push(table(['Level', 'First result right', 'A right result in the top 5', 'Share of the top 5 that is right'],
    Object.entries(r.levels).map(([k, rows]) => { const s = summarizeEveryday(rows); return [names[k], pct(s.first), pct(s.found), pct(s.clean)]; })));
  if (showMisses) {
    for (const [k, rows] of Object.entries(r.levels)) {
      lines.push('', `${names[k]}: searches with a wrong result in the top 5`);
      for (const x of rows.filter((y) => y.clean < 1)) lines.push(`  "${x.q}" -> ${x.got.map((g, i) => (x.right[i] ? g : `[${g}]`)).join(', ') || '(nothing)'}`);
    }
  }
  return lines.join('\n');
}

const START = '<!-- measured:start (written by tools/search-eval.mjs --write) -->', END = '<!-- measured:end -->';

async function main() {
  const args = process.argv.slice(2);
  const opt = (n) => { const i = args.indexOf('--' + n); return i < 0 ? null : args[i + 1]; };
  if (args.includes('--everyday')) {
    const e = await evaluateEveryday({ catalogFile: opt('catalog') ? path.resolve(opt('catalog')) : undefined, model: !args.includes('--no-model'), log: (m) => console.error(m) });
    console.log(reportEveryday(e, { misses: args.includes('--misses') }));
    return;
  }
  const r = await evaluate({ models: opt('models') ? opt('models').split(',') : null, weights: opt('weights') ? opt('weights').split(',').map(Number) : FUSION, log: (m) => console.error(m) });
  const text = report(r);
  console.log(text);
  if (args.includes('--misses')) console.log('\n' + misses(r));
  fs.writeFileSync(path.join(WORK, 'results.json'), JSON.stringify(r, null, 1));
  if (args.includes('--write')) {
    const doc = path.join(ROOT, 'docs', 'search-eval.md');
    const old = fs.existsSync(doc) ? fs.readFileSync(doc, 'utf8') : `# Search evaluation\n\n${START}\n${END}\n`;
    const a = old.indexOf(START), b = old.indexOf(END);
    if (a < 0 || b < 0) throw new Error('docs/search-eval.md has no measured block to replace');
    fs.writeFileSync(doc, old.slice(0, a) + START + '\n\n' + text + '\n\n' + old.slice(b));
    console.error('wrote docs/search-eval.md');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
