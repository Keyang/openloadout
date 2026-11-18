// Writes the search index: one SQLite file the site opens in the browser (docs/architecture.md, Contract 5).
//
//   await buildSearchIndex({ assets, outFile, embed })
//
//   assets   the catalogue's `assets` array (Contract 4)
//   outFile  where to write, normally generated/search.sqlite
//   embed    optional async (texts) -> Float32Array[]; see tools/lib/embed.mjs. Its `.model` property
//            ({ id, dim, pooling, queryPrefix, dtype, minScore }) is stored so the browser loads the same model.
//            Without it the file has no vectors and search works by keyword only.
//
// Tables:
//   meta(key, value)                       version, counts, which model made the vectors
//   assets(rowid, id, kind, name, description, type, role, view, themes, gameTypes, bundles, words, search_text)
//   asset_tags(asset, facet, value)        one row per theme, game type and bundle, for filtering in SQL
//   assets_fts                             FTS5 keyword index: name, words, description, role, type, tags
//   vectors(asset, v)                      one vector per asset as 8-bit bytes (dim bytes, signed)
//   neighbours(asset, rank, other, score)  each asset's most similar assets, best first: by shared words, role and
//                                          bundle, with the vectors breaking ties and filling up
//
// The same input gives the same bytes: nothing here reads the clock.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { searchText, keywordFields, FTS_COLUMNS, FTS_WEIGHTS, quantize, vectorNorms, similarByMeta } from '../../search/core.js';

export const INDEX_VERSION = 1;
export const NEIGHBOURS = 12;

const SCHEMA = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
CREATE TABLE assets (
  rowid INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL,
  type TEXT NOT NULL, role TEXT NOT NULL, view TEXT NOT NULL, themes TEXT NOT NULL, gameTypes TEXT NOT NULL,
  bundles TEXT NOT NULL, words TEXT NOT NULL, search_text TEXT NOT NULL
);
CREATE INDEX assets_kind ON assets (kind, type);
CREATE INDEX assets_role ON assets (role);
CREATE TABLE asset_tags (asset INTEGER NOT NULL, facet TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (facet, value, asset)) WITHOUT ROWID;
CREATE VIRTUAL TABLE assets_fts USING fts5(${FTS_COLUMNS.join(', ')}, tokenize = 'porter unicode61 remove_diacritics 2');
CREATE TABLE vectors (asset INTEGER PRIMARY KEY, v BLOB NOT NULL);
CREATE TABLE neighbours (asset INTEGER NOT NULL, rank INTEGER NOT NULL, other INTEGER NOT NULL, score REAL NOT NULL, PRIMARY KEY (asset, rank)) WITHOUT ROWID;
`;

const arr = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);

export async function buildSearchIndex({ assets, outFile, embed = null, model = null, neighbours = NEIGHBOURS }) {
  if (!Array.isArray(assets)) throw new Error('buildSearchIndex: `assets` must be the catalogue\'s assets array');
  if (!outFile) throw new Error('buildSearchIndex: `outFile` is required');
  const seen = new Set();
  for (const a of assets) {
    if (!a || !a.id) throw new Error('buildSearchIndex: every asset needs an id');
    if (seen.has(a.id)) throw new Error(`buildSearchIndex: duplicate id "${a.id}"`);
    seen.add(a.id);
  }
  const started = performance.now();
  const texts = assets.map(searchText);
  const N = assets.length;

  // vectors, 8 bits a number
  const spec = embed ? { ...(embed.model || {}), ...(model || {}) } : null;
  let dim = 0, matrix = null;
  if (embed && N) {
    const vectors = await embed(texts);
    if (!Array.isArray(vectors) || vectors.length !== N) throw new Error(`buildSearchIndex: embed returned ${vectors && vectors.length} vectors for ${N} texts`);
    dim = spec.dim || vectors[0].length;
    matrix = new Int8Array(N * dim);
    vectors.forEach((v, i) => {
      if (!v || v.length !== dim) throw new Error(`buildSearchIndex: the vector for "${assets[i].id}" has length ${v && v.length}, expected size ${dim}`);
      matrix.set(quantize(v), i * dim);
    });
  }

  // Nearest neighbours ("similar assets"). What the catalogue says comes first: shared words, role and bundle
  // (similarByMeta). Vectors only order assets the catalogue scores the same, and fill the list when the
  // catalogue runs out. On a small library the vectors alone put a knight next to a coin.
  const near = new Array(N);
  const at = new Map(assets.map((a, i) => [a.id, i]));
  const norms = matrix ? vectorNorms(matrix, dim) : null;
  for (let i = 0; i < N; i++) {
    const cos = new Map();
    if (matrix) {
      for (let j = 0, o = 0, a = i * dim; j < N; j++, o += dim) {
        if (j === i) continue;
        let d = 0;
        for (let k = 0; k < dim; k++) d += matrix[a + k] * matrix[o + k];
        const c = norms[i] && norms[j] ? d / (norms[i] * norms[j]) : 0;
        if (c > 0) cos.set(j, Math.min(1, c));
      }
    }
    const meta = new Map(similarByMeta(assets, assets[i].id, N, { scores: true }).map((r) => [at.get(r.id), r.score]));
    const rows = [];
    for (let j = 0; j < N; j++) {
      if (j === i || (!meta.has(j) && !cos.has(j))) continue;
      // catalogue scores move in steps of 0.1 or more, so 0.09 of similarity can order ties but never overturn a step
      rows.push({ other: j, meta: meta.get(j) || 0, score: (meta.get(j) || 0) + 0.09 * (cos.get(j) || 0) });
    }
    rows.sort((x, y) => y.meta - x.meta || y.score - x.score || x.other - y.other);
    near[i] = rows.slice(0, neighbours).map((r) => ({ other: r.other, score: r.score }));
  }

  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  const tmp = `${outFile}.tmp-${process.pid}`;
  fs.rmSync(tmp, { force: true });
  const db = new DatabaseSync(tmp);
  try {
    db.exec('PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF; PRAGMA page_size = 4096;');
    db.exec(SCHEMA);
    db.exec('BEGIN');
    const insAsset = db.prepare('INSERT INTO assets (rowid, id, kind, name, description, type, role, view, themes, gameTypes, bundles, words, search_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const insTag = db.prepare('INSERT OR IGNORE INTO asset_tags (asset, facet, value) VALUES (?, ?, ?)');
    const insFts = db.prepare(`INSERT INTO assets_fts (rowid, ${FTS_COLUMNS.join(', ')}) VALUES (?, ${FTS_COLUMNS.map(() => '?').join(', ')})`);
    const insVec = db.prepare('INSERT INTO vectors (asset, v) VALUES (?, ?)');
    const insNear = db.prepare('INSERT INTO neighbours (asset, rank, other, score) VALUES (?, ?, ?, ?)');
    assets.forEach((a, i) => {
      const rowid = i + 1;
      insAsset.run(rowid, a.id, a.kind || '', a.name || '', a.description || '', a.type || '', a.role || '', a.view || 'none',
        JSON.stringify(arr(a.themes)), JSON.stringify(arr(a.gameTypes)), JSON.stringify(arr(a.bundles)), arr(a.words).join(' '), texts[i]);
      for (const t of arr(a.themes)) insTag.run(rowid, 'themes', String(t));
      for (const g of arr(a.gameTypes)) insTag.run(rowid, 'gameTypes', String(g));
      for (const b of arr(a.bundles)) insTag.run(rowid, 'bundle', String(b));
      const f = keywordFields(a);
      insFts.run(rowid, ...FTS_COLUMNS.map((c) => f[c]));
      if (matrix) insVec.run(rowid, new Uint8Array(matrix.buffer, matrix.byteOffset + i * dim, dim));
      near[i].forEach((n, rank) => insNear.run(rowid, rank, n.other + 1, Math.round(n.score * 1e4) / 1e4));
    });
    const meta = {
      version: INDEX_VERSION, assets: N, vectors: matrix ? N : 0, dim,
      model: spec ? spec.id || '' : '', pooling: spec ? spec.pooling || '' : '', query_prefix: spec ? spec.queryPrefix || '' : '',
      dtype: spec ? spec.dtype || '' : '', model_kind: spec ? spec.kind || '' : '', min_score: spec ? spec.minScore || 0 : 0,
      neighbours, fts_columns: FTS_COLUMNS.join(','), fts_weights: FTS_WEIGHTS.join(','),
    };
    const insMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
    for (const [k, v] of Object.entries(meta)) insMeta.run(k, String(v));
    db.exec('COMMIT');
    db.exec("INSERT INTO assets_fts (assets_fts) VALUES ('optimize')");
    db.exec('VACUUM');
  } catch (err) {
    try { db.close(); } catch { /* already closed */ }
    fs.rmSync(tmp, { force: true });
    throw err;
  }
  db.close();
  fs.renameSync(tmp, outFile);
  return {
    outFile, bytes: fs.statSync(outFile).size, assets: N, vectors: matrix ? N : 0, dim,
    model: spec ? spec.id || '' : '', ms: Math.round(performance.now() - started),
  };
}
