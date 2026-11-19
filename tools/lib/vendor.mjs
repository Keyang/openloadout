// Copies what the browser needs out of node_modules and the model cache into vendor/: the search files and the
// site's two typefaces (Geist for everything, Pixelify Sans for the wordmark: docs/site-design.md). The site never reads node_modules (docs/architecture.md, hard rule 3) and never asks
// another site for anything (hard rule 1), so the fonts are served from here too.
//
//   await vendorAll()                          -> { dest, files: [{ to, bytes }], bytes, copied }   writes vendor/ in this project
//   await vendorAll({ root })                  writes <root>/vendor/ instead (the sources still come from this project)
//   await vendorAll({ meaning: false })        SQLite only: no model and no model runner (1.5 MB instead of 40 MB)
//   vendorPlan({ ... })                        the same list without copying anything
//
//   vendor/sqlite/index.mjs, sqlite3.wasm                  SQLite's official WebAssembly build (opens generated/search.sqlite)
//   vendor/transformers/transformers.min.js                Transformers.js, one self-contained file
//   vendor/ort/ort-wasm-simd-threaded.{mjs,wasm}           the runtime that runs the model on the processor
//   vendor/ort/ort-wasm-simd-threaded.asyncify.{mjs,wasm}  the same with WebGPU support; only with { webgpu: true }
//   vendor/models/<model id>/...                           the embedding model: config, tokenizer, 8-bit weights
//   vendor/fonts/<family>-latin-<weight>-normal.woff2      Geist (all text) and Pixelify Sans (the wordmark), only the weights the site uses
//   vendor/fonts/fonts.css                                 their @font-face rules; index.html links it
//   vendor/manifest.json                                   what was copied, with sizes (fonts listed apart, under "fonts")
//
// Only the keyword level's files (vendor/sqlite/, 1.5 MB) are fetched by every visitor. The rest is
// fetched the first time someone searches, and only one of the two ort builds is ever fetched.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_MODEL, CACHE_DIR, modelSpec, modelFiles, fetchModel } from './embed.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const NM = path.join(ROOT, 'node_modules');
export const VENDOR_DIR = path.join(ROOT, 'vendor');

/** Whether the WebGPU build of the model runtime is copied by default. See docs/search-eval.md for why not. */
export const VENDOR_WEBGPU = false;

export function vendorPlan({ model = DEFAULT_MODEL, meaning = true, webgpu = VENDOR_WEBGPU, cacheDir = CACHE_DIR } = {}) {
  if (!meaning) model = null;
  const files = [];
  const add = (from, to) => files.push({ from, to });
  const sqlite = path.join(NM, '@sqlite.org', 'sqlite-wasm', 'dist');
  add(path.join(sqlite, 'index.mjs'), 'sqlite/index.mjs');
  add(path.join(sqlite, 'sqlite3.wasm'), 'sqlite/sqlite3.wasm');
  if (model) {
    const spec = modelSpec(model);
    if (spec.kind === 'transformer') {
      add(path.join(NM, '@huggingface', 'transformers', 'dist', 'transformers.min.js'), 'transformers/transformers.min.js');
      const ort = path.join(NM, 'onnxruntime-web', 'dist');
      for (const build of webgpu ? ['', '.asyncify'] : ['']) {
        add(path.join(ort, `ort-wasm-simd-threaded${build}.mjs`), `ort/ort-wasm-simd-threaded${build}.mjs`);
        add(path.join(ort, `ort-wasm-simd-threaded${build}.wasm`), `ort/ort-wasm-simd-threaded${build}.wasm`);
      }
    }
    for (const f of modelFiles(model, cacheDir)) add(f.file, `models/${model}/${f.rel}`);
  }
  const pkg = (name) => JSON.parse(fs.readFileSync(path.join(NM, name, 'package.json'), 'utf8')).version;
  return {
    model, meaning: !!model, webgpu: !!model && webgpu, files,
    versions: { '@sqlite.org/sqlite-wasm': pkg('@sqlite.org/sqlite-wasm'), '@huggingface/transformers': pkg('@huggingface/transformers'), 'onnxruntime-web': pkg('onnxruntime-web') },
  };
}

/** The site's typefaces: only the weights app/css/base.css uses, only the Latin files. Geist is all text; Pixelify Sans is the wordmark alone. */
export const FONTS = [
  { family: 'Geist', pkg: '@fontsource/geist', name: 'geist', weights: [400, 500, 600] },
  { family: 'Pixelify Sans', pkg: '@fontsource/pixelify-sans', name: 'pixelify-sans', weights: [600] },
];

/** The font files to copy and the stylesheet that names them: { files: [{ from, to }], css, versions }. */
export function fontPlan() {
  const files = [], rules = [], versions = {};
  for (const font of FONTS) {
    const dir = path.join(NM, ...font.pkg.split('/'));
    if (!fs.existsSync(path.join(dir, 'package.json'))) throw new Error(`${font.pkg} is not installed (the site's ${font.family} typeface). Run "npm install".`);
    versions[font.pkg] = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
    for (const weight of font.weights) {
      const file = `${font.name}-latin-${weight}-normal.woff2`;
      const from = path.join(dir, 'files', file);
      if (!fs.existsSync(from)) throw new Error(`${font.pkg} has no ${file}: the ${font.family} typeface does not come in weight ${weight}`);
      files.push({ from, to: `fonts/${file}` });
      // the characters the Latin file holds, as the package's own stylesheet states them
      const sheet = fs.readFileSync(path.join(dir, `${weight}.css`), 'utf8');
      const block = sheet.split('@font-face').find((b) => b.includes(file)) || '';
      const range = (block.match(/unicode-range:\s*([^;]+);/) || [])[1];
      rules.push(`@font-face { font-family: '${font.family}'; font-style: normal; font-weight: ${weight}; font-display: swap; src: url(./${file}) format('woff2');${range ? ` unicode-range: ${range.trim()};` : ''} }`);
    }
  }
  const css = `/* Written by tools/lib/vendor.mjs: the site's typefaces, served from this site. */\n${rules.join('\n')}\n`;
  return { files, css, versions };
}

export async function vendorAll({ root = ROOT, model = DEFAULT_MODEL, meaning = true, webgpu = VENDOR_WEBGPU, cacheDir = CACHE_DIR, log = null } = {}) {
  const dest = path.join(path.resolve(root), 'vendor');
  if (!meaning) model = null;
  if (model) await fetchModel(model, cacheDir);       // downloads from Hugging Face the first time
  const plan = vendorPlan({ model, meaning, webgpu, cacheDir });
  let copied = 0, bytes = 0;
  const files = [];
  for (const f of plan.files) {
    const to = path.join(dest, f.to);
    const src = fs.statSync(f.from);
    const have = fs.existsSync(to) ? fs.statSync(to) : null;
    if (!have || have.size !== src.size || have.mtimeMs < src.mtimeMs) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      const tmp = `${to}.tmp-${process.pid}`;
      fs.copyFileSync(f.from, tmp);
      fs.renameSync(tmp, to);
      copied++;
      if (log) log(`vendor/${f.to}  ${(src.size / 1e6).toFixed(2)} MB`);
    }
    files.push({ to: f.to, bytes: src.size });
    bytes += src.size;
  }
  // the typefaces: listed apart, so `files` and `bytes` stay what search needs
  const fontSet = fontPlan();
  const fonts = [];
  for (const f of fontSet.files) {
    const to = path.join(dest, f.to);
    const src = fs.statSync(f.from);
    if (!fs.existsSync(to) || fs.statSync(to).size !== src.size) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      const tmp = `${to}.tmp-${process.pid}`;
      fs.copyFileSync(f.from, tmp);
      fs.renameSync(tmp, to);
      copied++;
      if (log) log(`vendor/${f.to}  ${(src.size / 1e3).toFixed(0)} KB`);
    }
    fonts.push({ to: f.to, bytes: src.size });
  }
  const sheet = path.join(dest, 'fonts', 'fonts.css');
  if (!fs.existsSync(sheet) || fs.readFileSync(sheet, 'utf8') !== fontSet.css) { fs.mkdirSync(path.dirname(sheet), { recursive: true }); fs.writeFileSync(sheet, fontSet.css); }
  const manifest = { model: plan.model, meaning: plan.meaning, webgpu: plan.webgpu, versions: { ...plan.versions, ...fontSet.versions }, bytes, files, fonts };
  const text = JSON.stringify(manifest, null, 1) + '\n';
  const mf = path.join(dest, 'manifest.json');
  if (!fs.existsSync(mf) || fs.readFileSync(mf, 'utf8') !== text) fs.writeFileSync(mf, text);
  return { dest, model: plan.model, meaning: plan.meaning, webgpu: plan.webgpu, files, bytes, fonts, copied };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = await vendorAll({ webgpu: process.argv.includes('--webgpu') || VENDOR_WEBGPU, meaning: !process.argv.includes('--no-meaning'), log: (m) => console.log(m) });
  console.log(`vendor/: ${r.files.length} files, ${(r.bytes / 1e6).toFixed(1)} MB (${r.copied} copied)`);
}
