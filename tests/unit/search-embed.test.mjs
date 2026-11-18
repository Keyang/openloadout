// tools/lib/embed.mjs and tools/lib/vendor.mjs: the embedding model in Node and the files the browser needs.
// Tests that need a downloaded model are skipped when it is not in .cache/models/ (run tools/search-eval.mjs once to fetch it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MODELS, DEFAULT_MODEL, modelSpec, queryText, passageText, isModelCached, createEmbedder } from '../../tools/lib/embed.mjs';
import { vendorPlan, vendorAll } from '../../tools/lib/vendor.mjs';

test('each model has its own query and passage handling', () => {
  const arctic = modelSpec('Snowflake/snowflake-arctic-embed-xs');
  assert.equal(arctic.dim, 384);
  assert.equal(arctic.pooling, 'cls');
  assert.equal(queryText(arctic, 'coin'), 'Represent this sentence for searching relevant passages: coin');
  assert.equal(passageText(arctic, 'A coin.'), 'A coin.', 'passages get no prefix');
  const mini = modelSpec('Xenova/all-MiniLM-L6-v2');
  assert.equal(mini.pooling, 'mean');
  assert.equal(queryText(mini, 'coin'), 'coin');
  assert.ok(MODELS[DEFAULT_MODEL], 'the default model is one of the candidates');
  assert.ok(Object.keys(MODELS).length >= 3);
  assert.ok(arctic.minScore > 0.3 && arctic.minScore < 0.9, 'the chosen model has a similarity floor');
  for (const [id, m] of Object.entries(MODELS)) {
    assert.ok(m.dim > 0 && m.license && m.kind, id);
    assert.ok(['transformer', 'static'].includes(m.kind), id);
  }
  assert.throws(() => modelSpec('nobody/nothing'), /unknown/i);
});

test('the chosen model embeds a query and passages into unit vectors', { skip: !isModelCached(DEFAULT_MODEL) && 'model not downloaded' }, async () => {
  const e = await createEmbedder(DEFAULT_MODEL);
  const spec = modelSpec(DEFAULT_MODEL);
  const [coin, wolf] = await e.embedPassages(['A spinning gold coin to collect.', 'A grey wolf that howls.']);
  const q = await e.embedQuery('money');
  assert.ok(coin instanceof Float32Array && coin.length === spec.dim);
  const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  assert.ok(Math.abs(dot(coin, coin) - 1) < 1e-3, 'unit length');
  assert.ok(dot(q, coin) > dot(q, wolf), 'money is closer to the coin than to the wolf');
  assert.equal(e.embed.model.id, DEFAULT_MODEL, 'the function handed to buildSearchIndex says which model made the vectors');
  assert.equal(e.embed.model.minScore, spec.minScore);
  assert.equal(e.isWord('robber'), true, 'the model knows real words');
  assert.equal(e.isWord('sowrd'), false);
  assert.equal((await e.embed(['x', 'y', 'z'])).length, 3);
});

test('the vendor plan lists the SQLite and model-runner files with sizes', () => {
  const plan = vendorPlan();
  const names = plan.files.map((f) => f.to);
  assert.ok(names.includes('sqlite/index.mjs') && names.includes('sqlite/sqlite3.wasm'));
  assert.ok(names.some((n) => n.startsWith('transformers/')));
  assert.ok(names.some((n) => n.startsWith('ort/') && n.endsWith('.wasm')));
  assert.ok(names.some((n) => n.startsWith('models/' + DEFAULT_MODEL + '/') && n.endsWith('.onnx')));
  for (const f of plan.files) assert.ok(path.isAbsolute(f.from) && !f.to.startsWith('/') && !f.to.includes('..'));
  assert.ok(!names.some((n) => n.endsWith('.map') || n.endsWith('.d.mts')), 'nothing the browser does not load');
});

test('vendorAll copies the files into <root>/vendor and reports the total size', { skip: !isModelCached(DEFAULT_MODEL) && 'model not downloaded' }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-vendor-'));
  try {
    const r = await vendorAll({ root });
    assert.equal(r.dest, path.join(root, 'vendor'));
    let total = 0;
    for (const f of r.files) {
      const st = fs.statSync(path.join(root, 'vendor', f.to));
      assert.equal(st.size, f.bytes);
      total += st.size;
    }
    assert.equal(r.bytes, total);
    assert.ok(fs.existsSync(path.join(root, 'vendor', 'sqlite/sqlite3.wasm')));
    assert.ok(fs.existsSync(path.join(root, 'vendor', 'models', DEFAULT_MODEL, 'tokenizer.json')));
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'vendor', 'manifest.json'), 'utf8')).meaning, true);
    const again = await vendorAll({ root });
    assert.equal(again.copied, 0, 'a second run copies nothing');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('vendorAll({ meaning: false }) copies SQLite only: no model, no model runner', async () => {
  const plan = vendorPlan({ meaning: false });
  assert.deepEqual(plan.files.map((f) => f.to).sort(), ['sqlite/index.mjs', 'sqlite/sqlite3.wasm']);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-vendor-'));
  try {
    const r = await vendorAll({ root, meaning: false });
    assert.equal(r.dest, path.join(root, 'vendor'));
    assert.deepEqual(fs.readdirSync(path.join(root, 'vendor')).sort(), ['fonts', 'manifest.json', 'sqlite']);      // fonts: the site's typefaces, always copied
    assert.ok(r.bytes < 2_000_000, `${r.bytes} bytes`);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'vendor', 'manifest.json'), 'utf8'));
    assert.equal(manifest.meaning, false);
    assert.equal(manifest.model, null);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
