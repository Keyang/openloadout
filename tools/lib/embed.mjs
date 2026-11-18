// Turns text into vectors in Node, with the same library and model files the browser uses,
// so the vectors the build stores match the ones a visitor's search produces.
//
//   const e = await createEmbedder();                 // the chosen model (DEFAULT_MODEL)
//   await buildSearchIndex({ assets, outFile, embed: e.embed });
//   const v = await e.embedQuery('money');            // Float32Array, unit length
//
// Models are downloaded from Hugging Face on first use and kept in .cache/models/.
// Each model has its own rules for queries and passages (taken from its model card):
//   snowflake-arctic-embed-*  query gets the prefix below, passage gets none; the [CLS] vector is used
//   all-MiniLM-L6-v2          no prefix; the mean of all token vectors is used
//   bge-small-en-v1.5         query gets the same prefix as arctic; [CLS] vector
//   potion-* (model2vec)      "static": a table of one vector per word piece, averaged. No prefix. Runs in plain JS
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CACHE_DIR = path.join(ROOT, '.cache', 'models');
const RETRIEVAL_PREFIX = 'Represent this sentence for searching relevant passages: ';
const TOKENIZER_FILES = ['config.json', 'tokenizer.json', 'tokenizer_config.json'];

export const MODELS = {
  'Snowflake/snowflake-arctic-embed-xs': {
    kind: 'transformer', dim: 384, pooling: 'cls', queryPrefix: RETRIEVAL_PREFIX, passagePrefix: '', dtype: 'q8',
    files: [...TOKENIZER_FILES, 'onnx/model_quantized.onnx'], license: 'Apache-2.0',
    // Similarity floor: an asset less similar to the query than this is not a result. Calibrated in docs/search-eval.md:
    // of the right answers this model ranks in its top 5, 2 in 121 fall below it; nonsense input scores 0.48 to 0.53.
    minScore: 0.56,
  },
  'Xenova/all-MiniLM-L6-v2': {
    kind: 'transformer', dim: 384, pooling: 'mean', queryPrefix: '', passagePrefix: '', dtype: 'q8',
    files: [...TOKENIZER_FILES, 'onnx/model_quantized.onnx'], license: 'Apache-2.0',
  },
  'Xenova/bge-small-en-v1.5': {
    kind: 'transformer', dim: 384, pooling: 'cls', queryPrefix: RETRIEVAL_PREFIX, passagePrefix: '', dtype: 'q8',
    files: [...TOKENIZER_FILES, 'onnx/model_quantized.onnx'], license: 'MIT',
  },
  'minishlab/potion-base-8M': {
    kind: 'static', dim: 256, pooling: 'mean', queryPrefix: '', passagePrefix: '', dtype: 'fp32',
    files: [...TOKENIZER_FILES, 'model.safetensors'], license: 'MIT',
  },
};
/** The model the site uses. Chosen by measurement: docs/search-eval.md. */
export const DEFAULT_MODEL = 'Snowflake/snowflake-arctic-embed-xs';

export function modelSpec(id = DEFAULT_MODEL) {
  const m = MODELS[id];
  if (!m) throw new Error(`unknown embedding model "${id}". Known: ${Object.keys(MODELS).join(', ')}`);
  return { id, ...m };
}
export const queryText = (spec, text) => spec.queryPrefix + text;
export const passageText = (spec, text) => spec.passagePrefix + text;

/** Where each of a model's files sits in the cache: [{ rel, file }]. */
export function modelFiles(id = DEFAULT_MODEL, cacheDir = CACHE_DIR) {
  return modelSpec(id).files.map((rel) => ({ rel, file: path.join(cacheDir, id, rel) }));
}
export function isModelCached(id = DEFAULT_MODEL, cacheDir = CACHE_DIR) {
  return modelFiles(id, cacheDir).every((f) => fs.existsSync(f.file));
}

async function download(id, rel, file) {
  const url = `https://huggingface.co/${id}/resolve/main/${rel}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not download ${url}: ${res.status}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.part-${process.pid}`;
  fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  fs.renameSync(tmp, file);
}
/** Make sure every file of a model is in the cache, downloading what is missing. */
export async function fetchModel(id = DEFAULT_MODEL, cacheDir = CACHE_DIR) {
  for (const f of modelFiles(id, cacheDir)) if (!fs.existsSync(f.file)) await download(id, f.rel, f.file);
  return modelFiles(id, cacheDir);
}

async function transformers(cacheDir) {
  const t = await import('@huggingface/transformers');
  t.env.cacheDir = cacheDir;
  t.env.allowLocalModels = true;
  t.env.localModelPath = cacheDir;      // files fetched by fetchModel are found here without a network call
  return t;
}

async function transformerRunner(spec, cacheDir) {
  const { pipeline } = await transformers(cacheDir);
  const extractor = await pipeline('feature-extraction', spec.id, { dtype: spec.dtype });
  const run = async (texts) => {
    const out = [];
    for (let i = 0; i < texts.length; i += 16) {
      const batch = texts.slice(i, i + 16);
      const t = await extractor(batch, { pooling: spec.pooling, normalize: true });
      for (let j = 0; j < batch.length; j++) out.push(Float32Array.from(t.data.subarray(j * spec.dim, (j + 1) * spec.dim)));
    }
    return out;
  };
  return { run, tokenizer: extractor.tokenizer };
}

/** The table of a model2vec model: { rows, dim, data: Float32Array }. */
export function readStaticTable(file) {
  const buf = fs.readFileSync(file);
  const headerLen = Number(buf.readBigUInt64LE(0));
  const header = JSON.parse(buf.subarray(8, 8 + headerLen).toString('utf8'));
  const key = Object.keys(header).find((k) => k !== '__metadata__' && header[k].shape.length === 2);
  const t = header[key];
  if (t.dtype !== 'F32') throw new Error(`${file}: expected 32-bit floats, found ${t.dtype}`);
  const [rows, dim] = t.shape;
  const start = 8 + headerLen + t.data_offsets[0];
  const data = new Float32Array(rows * dim);
  Buffer.from(data.buffer).set(buf.subarray(start, start + rows * dim * 4));
  return { rows, dim, data };
}

async function staticRunner(spec, cacheDir, { bits = 32 } = {}) {
  const { AutoTokenizer } = await transformers(cacheDir);
  const tokenizer = await AutoTokenizer.from_pretrained(spec.id);
  const table = readStaticTable(path.join(cacheDir, spec.id, 'model.safetensors'));
  let data = table.data;
  if (bits === 8) {
    // what an 8-bit copy of the table would give: each row scaled to -127..127 and rounded
    data = new Float32Array(table.data.length);
    for (let r = 0; r < table.rows; r++) {
      let max = 0;
      for (let j = 0; j < table.dim; j++) max = Math.max(max, Math.abs(table.data[r * table.dim + j]));
      const s = max ? 127 / max : 0;
      for (let j = 0; j < table.dim; j++) data[r * table.dim + j] = max ? Math.round(table.data[r * table.dim + j] * s) / s : 0;
    }
  }
  const run = async (texts) => texts.map((text) => {
    const ids = tokenizer.encode(text, { add_special_tokens: false }).slice(0, 512);
    const v = new Float32Array(table.dim);
    for (const id of ids) { const o = Number(id) * table.dim; for (let j = 0; j < table.dim; j++) v[j] += data[o + j]; }
    let n = 0;
    for (let j = 0; j < table.dim; j++) n += v[j] * v[j];
    n = Math.sqrt(n) || 1;
    for (let j = 0; j < table.dim; j++) v[j] /= n;
    return v;
  });
  return { run, tokenizer };
}

/**
 * Load a model. Returns
 *   embed(texts)          passages -> Float32Array[]; pass this to buildSearchIndex (it carries `.model`)
 *   embedPassages(texts)  the same
 *   embedQuery(text)      one search -> Float32Array, with the model's query prefix
 *   embedQueries(texts)
 *   isWord(word)          true when the model's own word list has the word whole (used to tell typos from real words)
 */
export async function createEmbedder(id = DEFAULT_MODEL, { cacheDir = CACHE_DIR, bits = 32 } = {}) {
  const spec = modelSpec(id);
  await fetchModel(id, cacheDir);
  const { run, tokenizer } = spec.kind === 'static' ? await staticRunner(spec, cacheDir, { bits }) : await transformerRunner(spec, cacheDir);
  // A word the model's tokenizer keeps in one piece is a real word. search/embed-worker.js asks the same question in the browser.
  const isWord = (word) => tokenizer.encode(String(word), { add_special_tokens: false }).length === 1;
  const embedPassages = (texts) => run(texts.map((t) => passageText(spec, t)));
  const embedQueries = (texts) => run(texts.map((t) => queryText(spec, t)));
  const embed = Object.assign((texts) => embedPassages(texts), {
    model: { id, dim: spec.dim, pooling: spec.pooling, queryPrefix: spec.queryPrefix, dtype: spec.dtype, kind: spec.kind, minScore: spec.minScore || 0 },
  });
  return { spec, embed, embedPassages, embedQueries, isWord, embedQuery: async (text) => (await embedQueries([text]))[0] };
}
