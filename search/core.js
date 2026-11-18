// Loadout search: the pure part. No Node or browser APIs, so the same code runs in the
// site, in the build and in tests.
//
//   text        normalize, tokenize, stem, queryTokens, hasRealWords, editDistance, searchText
//   keywords    createKeywordIndex(assets).search(query, { filters, limit })   <- the "basic" level
//               keywordFields, FTS_COLUMNS, FTS_WEIGHTS, ftsQuery, keywordSql  <- the same search inside the index file
//   filters     matchesFilters, filterAssets, countFacets, filterSql
//   meaning     quantize, cosineInt8, vectorNorms, topKVectors, mergeRankings
//   other       similarByMeta, applyCorrections, MAX_QUERY_CHARS, MAX_QUERY_WORDS
//
// An asset is one entry of generated/catalog.json (docs/architecture.md, Contract 4).

// ---------------------------------------------------------------- text

const STOP_WORDS = new Set((
  'a an the for when of on in to with and or my that is it its something thing things you your some at from by as are be this ' +
  'i me we what how who which where like there their them they these those can do does into than then so if while'
).split(' '));

/** Lowercase, accents removed, everything but letters and digits turned into single spaces. */
export function normalize(text) {
  return String(text ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const hasVowel = (w) => /[aeiouy]/.test(w);
function undouble(w) {
  const n = w.length;
  return n > 2 && w[n - 1] === w[n - 2] && !'lsz'.includes(w[n - 1]) && !'aeiou'.includes(w[n - 1]) ? w.slice(0, -1) : w;
}

/** A light stemmer: plurals, -ing and -ed. It only has to treat a query and the catalogue the same way. */
export function stem(word) {
  let w = word;
  if (w.length <= 3) return w;
  if (w.endsWith('ies') && w.length > 4) w = w.slice(0, -3) + 'y';
  else if (/(s|x|z|ch|sh)es$/.test(w)) w = w.slice(0, -2);
  else if (w.endsWith('s') && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith('ing') && hasVowel(w.slice(0, -3))) w = undouble(w.slice(0, -3));
  else if (w.length > 4 && w.endsWith('ed') && !w.endsWith('eed') && hasVowel(w.slice(0, -2))) w = undouble(w.slice(0, -2));
  return w;
}

const rawTokens = (text) => { const n = normalize(text); return n ? n.split(' ') : []; };

/** A search is cut to this many characters and words before anything else looks at it. */
export const MAX_QUERY_CHARS = 200;
export const MAX_QUERY_WORDS = 16;
const clip = (query) => String(query ?? '').slice(0, MAX_QUERY_CHARS);
/** True when nothing was typed (as opposed to something typed that holds no searchable words). */
const isBlank = (query) => String(query ?? '').trim() === '';

/** Stemmed words of a text, in order. */
export function tokenize(text) {
  return rawTokens(text).map(stem);
}

function meaningful(raw) {
  const kept = raw.filter((t) => !STOP_WORDS.has(t));
  return (kept.length ? kept : raw).slice(0, MAX_QUERY_WORDS);
}
/** The words of a search as typed (not stemmed), filler words dropped, cut to the limits above. */
const queryWords = (query) => meaningful(rawTokens(clip(query)));

/**
 * Is there anything in this search worth asking the embedding model about? Not when it is only filler
 * words and single letters ("a OR b", "the"): the model would still return its nearest assets, all unrelated.
 */
export function hasRealWords(query) {
  return rawTokens(clip(query)).some((w) => w.length >= 2 && !STOP_WORDS.has(w));
}

/** The words of a search that carry meaning. Filler words go, unless they are all there is. */
export function queryTokens(query) {
  return queryWords(query).map(stem);
}

/** Edit distance where swapping two neighbouring letters counts once. Returns max + 1 as soon as the limit is passed. */
export function editDistance(a, b, max = 2) {
  if (a === b) return 0;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  let prev2 = null, prev = new Array(lb + 1), cur = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    cur[0] = i;
    let rowMin = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= lb; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && ca === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    const t = prev2 || new Array(lb + 1);
    prev2 = prev; prev = cur; cur = t;
  }
  return prev[lb];
}

// What people call each type of asset, so "boss fight music" or "explosion sound" can use the type.
const TYPE_WORDS = {
  character: 'character sprite', creature: 'creature monster sprite', tileset: 'tileset tiles ground level sprite',
  prop: 'prop object sprite', pickup: 'pickup collectible item sprite', projectile: 'projectile shot sprite',
  effect: 'effect vfx animation sprite', background: 'background backdrop scenery sprite', ui: 'ui interface hud menu sprite',
  icon: 'icon item sprite', sfx: 'sfx sound effect noise audio', ambience: 'ambience ambient loop sound noise atmosphere audio',
  music: 'music song track tune soundtrack audio', jingle: 'jingle stinger fanfare short music sound audio',
};
const TYPE_LABEL = {
  character: 'Character sprite', creature: 'Creature sprite', tileset: 'Tileset', prop: 'Prop sprite', pickup: 'Pickup sprite',
  projectile: 'Projectile sprite', effect: 'Visual effect', background: 'Background', ui: 'Interface piece', icon: 'Icon',
  sfx: 'Sound effect', ambience: 'Ambience loop', music: 'Music track', jingle: 'Short jingle',
};
const list = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);
const roleWords = (role) => String(role || '').replace(/[/-]/g, ' ');

/** The text that stands for an asset when it is turned into a vector. One or two sentences in plain words. */
export function searchText(asset) {
  const a = asset;
  const what = TYPE_LABEL[a.type] || a.type || a.kind || '';
  const parts = [`${a.name}.`, a.description || ''];
  parts.push(`${what} for ${roleWords(a.role)}.`.replace(/\s+/g, ' '));
  const words = list(a.words);
  if (words.length) parts.push(`Also: ${words.join(', ')}.`);
  const themes = list(a.themes).filter((t) => t !== 'neutral');
  if (themes.length) parts.push(`Theme: ${themes.join(', ')}.`);
  return parts.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------- filters

const FILTERS = {
  kind: (a) => [a.kind], type: (a) => [a.type], view: (a) => [a.view],
  themes: (a) => list(a.themes), gameTypes: (a) => list(a.gameTypes), bundle: (a) => list(a.bundles),
};
const roleMatches = (role, want) => { const w = want.replace(/\/+$/, ''); return role === w || String(role || '').startsWith(w + '/'); };
const active = (filters) => Object.entries(filters || {}).filter(([k, v]) => (k === 'role' || Object.hasOwn(FILTERS, k)) && list(v).length > 0);

/** Does this asset pass every filter? Within one filter a list means "any of"; a role matches itself and everything under it. */
export function matchesFilters(asset, filters) {
  for (const [key, value] of active(filters)) {
    const wanted = list(value);
    if (key === 'role') { if (!wanted.some((w) => roleMatches(asset.role, w))) return false; continue; }
    const have = FILTERS[key](asset);
    if (!wanted.some((w) => have.includes(w))) return false;
  }
  return true;
}

export function filterAssets(assets, filters) {
  return active(filters).length ? assets.filter((a) => matchesFilters(a, filters)) : assets.slice();
}

/**
 * How many assets each filter value would give: { total, kind: {sprite: 12}, type, role, themes, gameTypes, view, bundle }.
 * A group's own filter is left out of its own counts, so the other choices in that group stay visible.
 * `role` counts both levels ("music" and "music/boss"). `ids` (optional) limits the count to those assets, for example search results.
 */
export function countFacets(assets, filters = {}, ids = null) {
  const only = ids ? new Set(ids) : null;
  const pool = only ? assets.filter((a) => only.has(a.id)) : assets;
  const out = { total: 0, kind: {}, type: {}, role: {}, themes: {}, gameTypes: {}, view: {}, bundle: {} };
  const bump = (group, value) => { if (value != null && value !== '') out[group][value] = (out[group][value] || 0) + 1; };
  const groups = ['kind', 'type', 'role', 'themes', 'gameTypes', 'view', 'bundle'];
  const without = Object.fromEntries(groups.map((g) => { const f = { ...filters }; delete f[g]; return [g, f]; }));
  for (const a of pool) {
    if (matchesFilters(a, filters)) out.total++;
    for (const g of groups) {
      if (!matchesFilters(a, without[g])) continue;
      if (g === 'role') { const role = String(a.role || ''); bump('role', role.split('/')[0]); if (role.includes('/')) bump('role', role); }
      else for (const v of FILTERS[g](a)) bump(g, v);
    }
  }
  return out;
}

/** The same filters as a SQL condition on the index file (table `assets` as `a`, table `asset_tags`). */
export function filterSql(filters) {
  const where = [], params = [];
  const marks = (n) => new Array(n).fill('?').join(', ');
  for (const [key, value] of active(filters)) {
    const wanted = list(value).map(String);
    if (key === 'role') {
      where.push('(' + wanted.map(() => "(a.role = ? OR substr(a.role, 1, length(?) + 1) = ? || '/')").join(' OR ') + ')');
      for (const w of wanted) { const r = w.replace(/\/+$/, ''); params.push(r, r, r); }
    } else if (key === 'kind' || key === 'type' || key === 'view') {
      where.push(`a.${key} IN (${marks(wanted.length)})`);
      params.push(...wanted);
    } else {
      where.push(`EXISTS (SELECT 1 FROM asset_tags t WHERE t.asset = a.rowid AND t.facet = '${key}' AND t.value IN (${marks(wanted.length)}))`);
      params.push(...wanted);
    }
  }
  return { where: where.length ? where.join(' AND ') : '1', params };
}

// ---------------------------------------------------------------- keyword search (the basic level)

const FIELD_WEIGHT = { name: 4, words: 3, id: 1.5, role: 1.5, type: 1.5, tags: 1, description: 1 };

/**
 * The text of an asset split into the columns keyword search looks at. The index file's FTS5 table
 * has these columns in this order (FTS_COLUMNS), so the two keyword searches read the same text.
 */
export function keywordFields(asset) {
  const pair = (text) => { const raw = rawTokens(text); const out = raw.slice(); for (let i = 0; i + 1 < raw.length; i++) out.push(raw[i] + raw[i + 1]); return out.join(' '); };
  return {
    name: `${asset.name || ''} ${pair(asset.name)}`.trim(),
    words: list(asset.words).map((w) => { const r = rawTokens(w); return r.length > 1 ? `${r.join(' ')} ${r.join('')}` : r.join(''); }).join(' '),
    description: asset.description || '',
    role: `${roleWords(asset.role)} ${rawTokens(asset.id).join(' ')}`.trim(),
    type: `${asset.type || ''} ${asset.kind || ''} ${TYPE_WORDS[asset.type] || ''}`.trim(),
    tags: `${list(asset.themes).join(' ')} ${list(asset.gameTypes).join(' ')}`.trim(),
  };
}
export const FTS_COLUMNS = ['name', 'words', 'description', 'role', 'type', 'tags'];
/** bm25() weights for FTS_COLUMNS, in order. */
export const FTS_WEIGHTS = [10, 6, 2, 3, 3, 1];

function fieldTokens(asset) {
  const f = keywordFields(asset);
  return {
    name: rawTokens(f.name), words: rawTokens(f.words), id: rawTokens(asset.id), role: rawTokens(asset.role),
    type: rawTokens(f.type), tags: rawTokens(f.tags), description: rawTokens(f.description),
  };
}

/**
 * Keyword search that needs nothing but the catalogue. It is what the site uses before anything
 * else has loaded, and what it falls back to if nothing else ever loads.
 *   index.search(query, { filters, limit }) -> [{ id, score }]   best first
 *   index.correct(word) -> [word]   real catalogue words close to a mistyped one
 *   index.respell(query, isWord) -> string   the search with mistyped words swapped for real ones (used before the query is turned into a vector)
 *   index.corrections(query) -> { typed: fix }   the swaps respell would make
 */
export function createKeywordIndex(assets) {
  const N = assets.length;
  const postings = new Map();      // stem -> Map(doc -> weight)
  const surfaces = new Map();      // word as written -> stem
  const names = assets.map((a) => normalize(a.name));
  assets.forEach((asset, doc) => {
    const fields = fieldTokens(asset);
    for (const [field, raw] of Object.entries(fields)) {
      // a word found in a short name counts for more than one found in a long name
      const nameLen = field === 'name' ? rawTokens(asset.name).length : 1;
      const w = FIELD_WEIGHT[field] / (1 + 0.25 * (nameLen - 1));
      const seen = new Set();
      for (const r of raw) {
        const s = stem(r);
        if (!surfaces.has(r)) surfaces.set(r, s);
        if (seen.has(s)) continue;
        seen.add(s);
        let p = postings.get(s);
        if (!p) postings.set(s, (p = new Map()));
        p.set(doc, (p.get(doc) || 0) + w);
      }
    }
  });
  const stems = [...postings.keys()].sort();
  const surfaceList = [...surfaces.keys()];
  const idf = (s) => { const df = postings.get(s).size; return Math.log(1 + (N - df + 0.5) / (df + 0.5)); };

  function fuzzy(raw) {
    const max = raw.length < 4 ? 0 : raw.length < 8 ? 1 : 2;
    if (!max) return [];
    const found = [];
    for (const word of surfaceList) {
      if (Math.abs(word.length - raw.length) > max) continue;
      const d = editDistance(raw, word, max);
      if (d <= max) found.push({ word, stem: surfaces.get(word), d });
    }
    found.sort((x, y) => x.d - y.d || (x.word[0] === raw[0] ? 0 : 1) - (y.word[0] === raw[0] ? 0 : 1) || postings.get(y.stem).size - postings.get(x.stem).size);
    return found.slice(0, 4);
  }

  // Which catalogue words a typed word may stand for, each with how much to trust the match.
  function candidates(raw, isLast) {
    const s = stem(raw);
    const out = new Map();
    const put = (term, w) => { if (postings.has(term) && (out.get(term) || 0) < w) out.set(term, w); };
    put(s, 1); put(raw, 1);
    const exact = out.size > 0;
    if (raw.length >= 2 && (isLast || !exact)) {
      for (const term of stems) {
        if (term.length > raw.length && term.startsWith(raw)) put(term, (exact ? 0.35 : 0.55) + 0.3 * (raw.length / term.length));
      }
    }
    if (!exact) for (const f of fuzzy(raw)) put(f.stem, f.d === 1 ? 0.6 : 0.4);
    return out;
  }

  function search(query, { filters, limit = 30 } = {}) {
    const raw = queryWords(query);
    const pass = active(filters).length ? (doc) => matchesFilters(assets[doc], filters) : null;
    if (!raw.length) {
      if (!isBlank(query)) return [];      // something typed, but no words in it ('"', '*', an emoji): nothing matches
      // nothing typed: list what the filters allow, in catalogue order
      const rows = [];
      for (let doc = 0; doc < N && rows.length < limit; doc++) if (!pass || pass(doc)) rows.push({ id: assets[doc].id, score: 0 });
      return rows;
    }
    const score = new Float64Array(N), hits = new Uint8Array(N);
    raw.forEach((r, i) => {
      const best = new Map();
      for (const [term, trust] of candidates(r, i === raw.length - 1)) {
        const weight = trust * idf(term);
        for (const [doc, w] of postings.get(term)) { const v = weight * w; if ((best.get(doc) || 0) < v) best.set(doc, v); }
      }
      for (const [doc, v] of best) { score[doc] += v; hits[doc]++; }
    });
    // two words typed apart that the catalogue writes as one ("level up" and "levelup"): a bonus, never a requirement
    for (let i = 0; i + 1 < raw.length; i++) {
      const joined = raw[i] + raw[i + 1];
      const p = postings.get(stem(joined)) || postings.get(joined);
      if (p) { const w = idf(postings.has(stem(joined)) ? stem(joined) : joined) * 0.5; for (const [doc, v] of p) score[doc] += w * v; }
    }
    const phrase = normalize(clip(query));
    const rows = [];
    for (let doc = 0; doc < N; doc++) {
      if (!hits[doc] || (pass && !pass(doc))) continue;
      let s = score[doc] * (0.4 + 0.6 * (hits[doc] / raw.length));
      if (names[doc] === phrase) s *= 1.6;
      else if (phrase.length >= 3 && (' ' + names[doc] + ' ').includes(' ' + phrase + ' ')) s *= 1.2;
      rows.push({ id: assets[doc].id, score: s });
    }
    rows.sort((x, y) => y.score - x.score || (x.id < y.id ? -1 : 1));
    return rows.slice(0, limit);
  }

  /** Real words from the catalogue that a mistyped word probably means. Empty when the word is fine or nothing is close. */
  function correct(word) {
    const raw = normalize(word);
    if (!raw || postings.has(stem(raw)) || postings.has(raw)) return [];
    return fuzzy(raw).map((f) => f.word);
  }

  /**
   * Which words of a search look mistyped, and the catalogue word each most likely means: { sowrd: 'sword' }.
   * A fix must start with the same letter as what was typed: "robber" is not a slip of the finger for "bobber".
   */
  function corrections(query) {
    const out = {};
    for (const r of rawTokens(clip(query)).slice(0, MAX_QUERY_WORDS * 2)) {
      if (STOP_WORDS.has(r) || Object.hasOwn(out, r)) continue;
      const fix = correct(r).find((w) => w[0] === r[0]);
      if (fix) out[r] = fix;
    }
    return out;
  }

  /**
   * The search with each mistyped word swapped for the catalogue word it most likely means ("sowrd" -> "sword").
   * `isWord(word)` (optional) is a dictionary: a word it accepts is real and is left alone. The embedding model's
   * own word list is used for this where the model runs.
   */
  function respell(query, isWord = null) {
    return applyCorrections(normalize(clip(query)), corrections(query), isWord);
  }

  return { size: N, search, correct, corrections, respell, has: (word) => postings.has(stem(normalize(word))) };
}

/** Swap the words listed in `fixes` ({ typed: fix }) in a normalised search, except words `isWord` says are real. */
export function applyCorrections(text, fixes, isWord = null) {
  return String(text || '').split(' ').map((w) => (Object.hasOwn(fixes || {}, w) && !(isWord && isWord(w)) ? fixes[w] : w)).join(' ');
}

// ---------------------------------------------------------------- keyword search in the index file (FTS5)

/**
 * An FTS5 MATCH expression for a search, or null when there is nothing to search for.
 * Words are OR-ed (ranking favours rows with more of them), the last word also matches as a prefix (unless it is one letter),
 * and `expand(word)` may add stand-ins for a word, for example spelling corrections.
 */
export function ftsQuery(query, { expand } = {}) {
  const raw = queryWords(query);
  if (!raw.length) return null;
  const terms = [];
  raw.forEach((r, i) => {
    terms.push(i === raw.length - 1 && r.length >= 2 ? `"${r}" *` : `"${r}"`);
    if (expand) for (const alt of expand(r) || []) { const a = normalize(alt).replace(/ /g, ''); if (a) terms.push(`"${a}"`); }
  });
  for (let i = 0; i + 1 < raw.length; i++) terms.push(`"${raw[i]}${raw[i + 1]}"`);
  return terms.join(' OR ');
}

/**
 * The SQL for a keyword search in the index file: { sql, params } giving rows of { id, score }, best first.
 * An empty search lists what the filters allow, in catalogue order; input with no words in it ('"', '*') finds nothing.
 */
export function keywordSql(query, { filters = null, limit = 30, expand = null } = {}) {
  const match = ftsQuery(query, { expand });
  const f = filterSql(filters);
  if (!match) {
    // something typed with no words in it finds nothing; nothing typed lists what the filters allow
    if (!isBlank(query)) return { sql: 'SELECT a.id AS id, 0.0 AS score FROM assets a WHERE 0', params: [] };
    return { sql: `SELECT a.id AS id, 0.0 AS score FROM assets a WHERE ${f.where} ORDER BY a.rowid LIMIT ?`, params: [...f.params, limit] };
  }
  return {
    sql: `SELECT a.id AS id, -bm25(assets_fts, ${FTS_WEIGHTS.join(', ')}) AS score FROM assets_fts JOIN assets a ON a.rowid = assets_fts.rowid ` +
      `WHERE assets_fts MATCH ? AND ${f.where} ORDER BY score DESC, a.rowid LIMIT ?`,
    params: [match, ...f.params, limit],
  };
}

// ---------------------------------------------------------------- merging rankings

/**
 * Merge several best-first lists of { id } into one (reciprocal rank fusion): an item scores
 * weight / (k + position) in each list it appears in. No list's own scores are compared, only positions.
 */
export function mergeRankings(lists, { k = 60, weights = null, limit = Infinity } = {}) {
  const score = new Map();
  lists.forEach((rows, li) => {
    const w = weights ? weights[li] ?? 1 : 1;
    (rows || []).forEach((row, pos) => { score.set(row.id, (score.get(row.id) || 0) + w / (k + pos + 1)); });
  });
  const out = [...score].map(([id, s]) => ({ id, score: s }));
  out.sort((x, y) => y.score - x.score);
  return out.length > limit ? out.slice(0, limit) : out;
}

// ---------------------------------------------------------------- 8-bit vectors

/** A vector as 8-bit numbers (-127..127), scaled so its largest value uses the full range. Direction is kept; length is not. */
export function quantize(vector) {
  let max = 0;
  for (let i = 0; i < vector.length; i++) { const v = Math.abs(vector[i]); if (v > max) max = v; }
  const out = new Int8Array(vector.length);
  if (!max) return out;
  const s = 127 / max;
  for (let i = 0; i < vector.length; i++) out[i] = Math.round(vector[i] * s);
  return out;
}

/** Cosine similarity of two vectors of any number type (two 8-bit vectors, or a full-precision query against an 8-bit one). */
export function cosineInt8(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i], y = b[i]; dot += x * y; na += x * x; nb += y * y; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** The length of every row of a block of 8-bit vectors. Work it out once and hand it to topKVectors. */
export function vectorNorms(matrix, dim) {
  const n = Math.floor(matrix.length / dim), norms = new Float32Array(n);
  for (let i = 0, o = 0; i < n; i++, o += dim) {
    let s = 0;
    for (let j = 0; j < dim; j++) { const v = matrix[o + j]; s += v * v; }
    norms[i] = Math.sqrt(s);
  }
  return norms;
}

/**
 * The k rows of `matrix` (rows of `dim` 8-bit numbers, back to back) closest to `query`.
 * -> [{ index, score }] best first; score is cosine similarity. `allow(index)` can leave rows out.
 */
export function topKVectors(query, matrix, dim, k, { norms = null, allow = null } = {}) {
  const n = Math.floor(matrix.length / dim);
  const rowNorms = norms || vectorNorms(matrix, dim);
  let qn = 0;
  for (let j = 0; j < dim; j++) qn += query[j] * query[j];
  qn = Math.sqrt(qn);
  if (!qn || k <= 0) return [];
  const best = [];            // kept sorted, at most k long
  let floor = -Infinity;
  const tail = dim - (dim % 4);
  for (let i = 0, o = 0; i < n; i++, o += dim) {
    if (allow && !allow(i)) continue;
    let d = 0, j = 0;
    for (; j < tail; j += 4) d += query[j] * matrix[o + j] + query[j + 1] * matrix[o + j + 1] + query[j + 2] * matrix[o + j + 2] + query[j + 3] * matrix[o + j + 3];
    for (; j < dim; j++) d += query[j] * matrix[o + j];
    const s = rowNorms[i] ? d / (qn * rowNorms[i]) : 0;
    if (best.length < k || s > floor) {
      let p = best.length;
      while (p > 0 && best[p - 1].score < s) p--;
      best.splice(p, 0, { index: i, score: s });
      if (best.length > k) best.pop();
      if (best.length === k) floor = best[k - 1].score;
    }
  }
  return best;
}

// ---------------------------------------------------------------- similar assets from the catalogue alone

/** Ids of the n assets most like this one, judged by shared words, role, bundle, type and themes. Used until the index file has loaded. `{ scores: true }` gives [{ id, score }]. */
export function similarByMeta(assets, id, n = 6, { scores = false } = {}) {
  const self = assets.find((a) => a.id === id);
  if (!self) return [];
  const bag = (a) => {
    let b = BAGS.get(a);
    if (!b) BAGS.set(a, (b = new Set([...tokenize(a.name), ...list(a.words).flatMap((w) => tokenize(w))].filter((t) => !STOP_WORDS.has(t)))));
    return b;
  };
  const mine = bag(self), myThemes = new Set(list(self.themes)), top = String(self.role || '').split('/')[0];
  const rows = [];
  for (const a of assets) {
    if (a.id === id) continue;
    let s = 0;
    if (a.role === self.role) s += 3; else if (String(a.role || '').split('/')[0] === top) s += 1;
    if (a.type === self.type) s += 0.5;
    for (const t of bag(a)) if (mine.has(t)) s += 1.5;
    for (const t of list(a.themes)) if (myThemes.has(t)) s += 0.3;
    for (const b of list(a.bundles)) if (list(self.bundles).includes(b)) s += 0.5;
    for (const g of list(a.gameTypes)) if (list(self.gameTypes).includes(g)) s += 0.1;
    if (s > 0) rows.push({ id: a.id, score: s });
  }
  rows.sort((x, y) => y.score - x.score || (x.id < y.id ? -1 : 1));
  return scores ? rows.slice(0, n) : rows.slice(0, n).map((r) => r.id);
}
const BAGS = new WeakMap();
