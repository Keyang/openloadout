// Loadout search in the browser (docs/architecture.md, Contract 5). Everything runs in the visitor's
// browser from static files; there is no server.
//
//   import { createSearch } from './search/client.js';
//   const s = await createSearch({ catalog });                 // usable at once
//   await s.search('money', { filters: { kind: 'sound', bundle: 'fantasy-platformer' }, limit: 30 })   // [{ id, score }]
//   await s.similar('coin', 6)                                  // [id]
//   await s.counts({ kind: 'sprite' })                          // { total, kind: {...}, type: {...}, role, themes, gameTypes, view, bundle }
//   s.level                                                     // 'basic' -> 'keywords' -> 'meaning'
//   s.onLevel((level) => ...)                                   // called each time the level changes; returns a function that stops it
//   await s.enableMeaning()                                     // the visitor's "search by meaning" switch; true once the model is ready
//   s.disableMeaning()                                          // and off again
//
// Three levels, each better than the last, none of which a search ever waits for:
//   basic     keyword search from the catalogue alone. Ready as soon as createSearch returns.
//   keywords  adds the index file (generated/search.sqlite) opened with SQLite's WebAssembly build:
//             a second keyword ranking, and stored "similar asset" lists. Starts loading at once.
//   meaning   adds the embedding model in a Worker, so a search is also matched by what it means.
//             OFF unless asked for: it is a 38 MB download. With it off, no model file is fetched,
//             no worker is started and the vectors in the index file are not even read.
// A failure on the way up leaves the level below working; s.status says what happened.
//
// What a search returns: an empty search lists what the filters allow, in catalogue order. Input with
// no words in it ('"', '*', an emoji) returns []. At the meaning level an asset has to be similar
// enough to the query to count (the floor stored in the index file), so nonsense returns nothing
// and a small library is not padded out with unrelated assets.
//
// Options
//   catalog      the catalogue object ({ assets: [...] }) or its assets array                      required
//   dbUrl        the index file. Default '../generated/search.sqlite' next to this folder. null: stay at 'basic'
//   vendorBase   folder written by tools/lib/vendor.mjs. Default '../vendor/' next to this folder
//   meaning      'off' (default; s.enableMeaning() turns it on later) | 'on-search' (load the model at the
//                first search, unless the browser asks sites to save data) | 'eager' (load it straight away)
//   device       'wasm' (default: the processor, one thread) | 'auto' (WebGPU when the browser has it and vendor/ holds
//                that build, see vendorAll({ webgpu: true })) | 'webgpu'. The processor is the default because it was
//                measured 3 to 4 times faster than WebGPU for this small 8-bit model (docs/search-eval.md)
//   meaningTimeoutMs       how long a search waits for the model to read the query before answering with keywords only. Default 1200
//   meaningLoadTimeoutMs   how long the model may take to download and start before it is given up on. Default 180000
import {
  createKeywordIndex, countFacets, similarByMeta, matchesFilters, keywordSql, mergeRankings, vectorNorms, topKVectors,
  normalize, hasRealWords, MAX_QUERY_CHARS,
} from './core.js';

export const LEVELS = ['basic', 'keywords', 'meaning'];
/** The newest index layout this client reads (INDEX_VERSION in tools/lib/search-index.mjs). */
export const INDEX_VERSION = 1;
const POOL = 50;      // how many results each ranking contributes before they are merged

export async function createSearch({
  catalog, dbUrl, vendorBase, meaning = 'off', device = 'wasm', meaningTimeoutMs = 1200, meaningLoadTimeoutMs = 180000,
} = {}) {
  const assets = Array.isArray(catalog) ? catalog : catalog && catalog.assets;
  if (!Array.isArray(assets)) throw new Error('createSearch: `catalog` must be the catalogue or its assets array');
  const here = import.meta.url;
  // defaults sit next to this folder; a path you pass in is read the way the page would read it
  const abs = (u, fallback) => (u == null ? new URL(fallback, here) : new URL(u, globalThis.location ? globalThis.location.href : here)).href;
  const vendor = abs(vendorBase, '../vendor/').replace(/\/?$/, '/');
  const dbHref = dbUrl === null ? null : abs(dbUrl, '../generated/search.sqlite');

  const byId = new Map(assets.map((a) => [a.id, a]));
  const basic = createKeywordIndex(assets);
  const listeners = new Set();
  let mode = ['off', 'on-search', 'eager'].includes(meaning) ? meaning : 'off';
  const status = {
    level: 'basic', keywords: dbHref ? 'loading' : 'off', meaning: !dbHref ? 'unavailable' : mode === 'off' ? 'off' : 'waiting',
    device: null, model: null, error: null, timings: { modelQueries: 0 },
  };
  let closed = false;
  let db = null, meta = {}, dim = 0, minScore = 0, hasVectors = false;
  let matrix = null, norms = null, rowIds = null;                       // read from the index file only when the model is wanted
  let worker = null, giveUp = null, nextId = 1, inFlight = null, queued = null, meaningWanted = mode === 'eager';
  const vectorCache = new Map();
  const keywordsDone = deferred();
  let meaningDone = deferred();
  if (!dbHref) { keywordsDone.resolve(false); meaningDone.resolve(false); }

  function setLevel(level) {
    if (level === status.level) return;
    status.level = level;
    for (const fn of [...listeners]) { try { fn(level); } catch (err) { console.error(err); } }
  }
  const warn = (stage, err) => {
    status.error = `${stage}: ${(err && err.message) || err}`;
    console.warn(`Loadout search: the "${stage}" level is not available, search carries on without it.`, err);
  };

  // ---- level 2: the index file
  async function loadKeywords() {
    const t0 = performance.now();
    const [mod, bytes] = await Promise.all([
      import(vendor + 'sqlite/index.mjs'),
      fetch(dbHref).then((r) => { if (!r.ok) throw new Error(`${dbHref}: ${r.status}`); return r.arrayBuffer(); }),
    ]);
    if (closed) return;
    const sqlite3 = await mod.default({ print: () => {}, printErr: () => {} });
    if (closed) return;
    const data = new Uint8Array(bytes);
    const handle = new sqlite3.oo1.DB();
    try {
      const p = sqlite3.wasm.allocFromTypedArray(data);
      const rc = sqlite3.capi.sqlite3_deserialize(handle.pointer, 'main', p, data.length, data.length,
        sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite3.capi.SQLITE_DESERIALIZE_READONLY);
      if (rc) throw new Error(`the index file could not be opened (${rc})`);
      for (const row of handle.selectObjects('SELECT key, value FROM meta')) meta[row.key] = row.value;
      if (Number(meta.version) > INDEX_VERSION) throw new Error(`the index file is version ${meta.version}; this page reads up to ${INDEX_VERSION}`);
      handle.selectValue("SELECT count(*) FROM assets_fts WHERE assets_fts MATCH '\"a\"'");   // proves the keyword index works here
    } catch (err) { handle.close(); throw err; }
    db = handle;
    dim = Number(meta.dim) || 0;
    minScore = Number(meta.min_score) || 0;
    hasVectors = Number(meta.vectors) > 0 && dim > 0 && !!meta.model && (!meta.model_kind || meta.model_kind === 'transformer');
    status.keywords = 'ready';
    status.model = meta.model || null;
    status.timings.keywordsMs = Math.round(performance.now() - t0);
    status.timings.indexBytes = data.length;
    setLevel('keywords');
    keywordsDone.resolve(true);
    if (!hasVectors) { if (status.meaning !== 'off') status.meaning = 'unavailable'; meaningDone.resolve(false); }
    else if (meaningWanted) startMeaning();
  }
  function failKeywords(err) {
    if (closed) return;
    status.keywords = 'failed';
    warn('keywords', err);
    keywordsDone.resolve(false);
    if (status.meaning !== 'off') status.meaning = 'unavailable';
    meaningDone.resolve(false);
  }

  // ---- level 3: the model
  function stopWorker() {
    clearTimeout(giveUp);
    if (worker) worker.terminate();
    worker = null;
    const waiting = [...(inFlight ? inFlight.waiters : []), ...(queued ? queued.waiters : [])];
    inFlight = null; queued = null;
    for (const finish of waiting) finish(null);        // searches in progress answer with keywords at once
  }
  function failMeaning(err) {
    stopWorker();
    status.meaning = 'failed';
    status.device = null;
    warn('meaning', err);
    if (status.level === 'meaning') setLevel('keywords');
    meaningDone.resolve(false);
  }

  function startMeaning() {
    if (closed || mode === 'off' || worker || ['ready', 'loading', 'failed', 'unavailable'].includes(status.meaning)) return;
    meaningWanted = true;
    if (!db) return;                                  // picked up when the index file has loaded
    if (!hasVectors) { status.meaning = 'unavailable'; meaningDone.resolve(false); return; }
    const saveData = globalThis.navigator && navigator.connection && navigator.connection.saveData;
    if (saveData && mode === 'on-search') {
      status.meaning = 'unavailable'; status.error = 'meaning: skipped because the browser asks sites to save data';
      meaningDone.resolve(false);
      return;
    }
    const t0 = performance.now();
    let w;
    try {
      if (!matrix) {
        const rows = db.selectArrays('SELECT a.id, v.v FROM vectors v JOIN assets a ON a.rowid = v.asset ORDER BY v.asset');
        const m = new Int8Array(rows.length * dim);
        rowIds = rows.map(([id, blob], i) => { m.set(new Int8Array(blob.buffer, blob.byteOffset, dim), i * dim); return id; });
        matrix = m;
        norms = vectorNorms(matrix, dim);
      }
      w = new Worker(new URL('./embed-worker.js', here), { type: 'module' });
    } catch (err) { failMeaning(err); return; }
    worker = w;
    status.meaning = 'loading';
    giveUp = setTimeout(() => {
      if (w === worker && status.meaning === 'loading') failMeaning(`the model did not load within ${Math.round(meaningLoadTimeoutMs / 1000)} seconds`);
    }, meaningLoadTimeoutMs);
    // an error in the worker at any time, while loading or long after: back to keywords, and nobody is left waiting
    w.onerror = (e) => { if (w === worker) failMeaning((e && e.message) || 'the model worker stopped'); };
    w.onmessage = (e) => {
      if (w !== worker || closed) { w.terminate(); return; }        // switched off or closed while this was on its way
      const m = e.data || {};
      if (m.type === 'ready') {
        clearTimeout(giveUp);
        status.meaning = 'ready'; status.device = m.device; status.timings.meaningMs = Math.round(performance.now() - t0);
        setLevel('meaning');
        meaningDone.resolve(true);
      } else if (m.type === 'error') {
        failMeaning(m.message);
      } else if (m.type === 'vector' && inFlight && m.id === inFlight.id) {
        const job = inFlight;
        inFlight = null;
        if (m.vector) {
          if (vectorCache.size >= 200) vectorCache.delete(vectorCache.keys().next().value);
          vectorCache.set(job.key, m.vector);
          status.timings.lastQueryMs = m.ms;
        }
        for (const finish of job.waiters) finish(m.vector || null);
        if (queued) { const next = queued; queued = null; send(next); }
      }
    };
    w.postMessage({ type: 'init', vendorBase: vendor, model: meta.model, pooling: meta.pooling, dtype: meta.dtype || 'q8', queryPrefix: meta.query_prefix || '', device });
  }

  function send(job) {
    inFlight = job;
    job.id = nextId++;
    status.timings.modelQueries++;
    worker.postMessage({ type: 'embed', id: job.id, text: job.text, fixes: job.fixes });
  }
  /**
   * The query as a vector, or null when the model does not answer in time (its answer is kept for next time).
   * The model reads one query at a time. While it is busy only the newest waiting query is kept: the ones
   * typed before it are dropped and their searches answer with keywords.
   */
  function embed(text, fixes) {
    if (vectorCache.has(text)) return Promise.resolve(vectorCache.get(text));
    return new Promise((resolve) => {
      let done = false;
      const finish = (vector) => { if (done) return; done = true; clearTimeout(timer); resolve(vector); };
      const timer = setTimeout(() => finish(null), meaningTimeoutMs);
      if (inFlight && inFlight.key === text) inFlight.waiters.push(finish);
      else if (queued && queued.key === text) queued.waiters.push(finish);
      else {
        const job = { key: text, text, fixes, waiters: [finish] };
        if (!inFlight) send(job);
        else { if (queued) for (const stale of queued.waiters) stale(null); queued = job; }
      }
    });
  }

  const known = (rows) => rows.filter((r) => byId.has(r.id));

  function keywordRanking(query, filters, limit) {
    const fromCatalogue = basic.search(query, { filters, limit: Math.max(limit, POOL) });
    if (!db || !normalize(query)) return fromCatalogue;
    try {
      const { sql, params } = keywordSql(query, { filters, limit: Math.max(limit, POOL), expand: basic.correct });
      const fromIndex = known(db.selectObjects(sql, params));
      return mergeRankings([fromCatalogue, fromIndex]);
    } catch (err) {
      console.warn('Loadout search: the index file could not answer, using the catalogue.', err);
      return fromCatalogue;
    }
  }

  async function search(query, { filters = null, limit = 30 } = {}) {
    const q = String(query ?? '').slice(0, MAX_QUERY_CHARS);
    const text = normalize(q);
    if (text && mode === 'on-search') startMeaning();
    const keywords = keywordRanking(q, filters, limit);
    if (status.level !== 'meaning' || !worker || !hasRealWords(q)) return keywords.slice(0, limit);
    // the worker fixes spelling against the catalogue's words, leaving alone any word the model knows
    const vector = await embed(text, basic.corrections(q));
    if (!vector || !matrix) return keywords.slice(0, limit);
    const allow = filters ? (i) => { const a = byId.get(rowIds[i]); return !!a && matchesFilters(a, filters); } : (i) => byId.has(rowIds[i]);
    const byMeaning = [];
    for (const h of topKVectors(vector, matrix, dim, POOL, { norms, allow })) {
      if (h.score < minScore) break;                    // not similar enough to be a result
      byMeaning.push({ id: rowIds[h.index], score: h.score });
    }
    return mergeRankings([keywords, byMeaning], { limit });
  }

  async function similar(id, n = 6) {
    if (db) {
      try {
        const ids = db.selectValues(
          'SELECT b.id FROM neighbours n JOIN assets a ON a.rowid = n.asset JOIN assets b ON b.rowid = n.other WHERE a.id = ? ORDER BY n.rank', [id]).filter((x) => byId.has(x));
        if (ids.length) return ids.slice(0, n);
      } catch (err) { console.warn('Loadout search: similar() fell back to the catalogue.', err); }
    }
    return similarByMeta(assets, id, n);
  }

  /** Counts per filter value. `ids` (optional) limits the count to those assets, for example the results of a search. */
  async function counts(filters = {}, { ids = null } = {}) {
    return countFacets(assets, filters || {}, ids);
  }

  /** Resolves true when the level is reached, false when it will not be (off, unavailable, failed or closed). Never rejects. */
  function whenLevel(level) {
    if (level === 'basic') return Promise.resolve(true);
    if (closed) return Promise.resolve(false);
    if (LEVELS.indexOf(status.level) >= LEVELS.indexOf(level)) return Promise.resolve(true);
    if (level === 'keywords') return keywordsDone.promise;
    if (level !== 'meaning' || mode === 'off') return Promise.resolve(false);
    startMeaning();
    return meaningDone.promise;
  }

  /** Switch search by meaning on: loads the model now. Resolves true when it is ready, false if it cannot be. */
  function enableMeaning() {
    if (closed) return Promise.resolve(false);
    if (mode === 'off') mode = 'eager';
    if (status.meaning === 'off' || status.meaning === 'failed') {
      meaningDone = deferred();
      status.error = null;
      if (status.keywords === 'failed' || status.keywords === 'off' || (db && !hasVectors)) { status.meaning = 'unavailable'; meaningDone.resolve(false); }
      else status.meaning = 'waiting';
    }
    return whenLevel('meaning');
  }
  /** Switch search by meaning off: stops the model and frees it. Searches go back to keywords. */
  function disableMeaning() {
    mode = 'off';
    meaningWanted = false;
    stopWorker();
    matrix = null; norms = null; rowIds = null;
    vectorCache.clear();
    if (status.meaning !== 'unavailable') status.meaning = 'off';
    status.device = null;
    meaningDone.resolve(false);
    if (status.level === 'meaning') setLevel('keywords');
  }

  function close() {
    if (closed) return;
    closed = true;
    stopWorker();
    if (db) db.close();
    db = null; matrix = null; norms = null; rowIds = null;
    status.level = 'basic';
    if (status.keywords !== 'off') status.keywords = 'closed';
    status.meaning = 'off';
    keywordsDone.resolve(false);
    meaningDone.resolve(false);
  }

  if (dbHref) loadKeywords().catch(failKeywords);

  return {
    search, similar, counts, whenLevel, enableMeaning, disableMeaning, close,
    onLevel(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** Start loading the model now instead of at the first search. Does nothing while meaning is 'off'. */
    warm() { return whenLevel('meaning'); },
    get level() { return status.level; },
    get status() { return { ...status, timings: { ...status.timings } }; },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}
