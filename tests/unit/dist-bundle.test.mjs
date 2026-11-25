// build --dist bundles engine/gen/index.js and the families only it reaches into one file (tools/lib/dist-bundle.mjs).
// The bundle must fill the registry exactly as the source does and draw the same pixels; the shared modules stay files;
// and a dist/ whose index.js is a link back to the source is refused, never written through.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bundleGenerators } from '../../tools/lib/dist-bundle.mjs';
import { nodePieceReader } from '../../tools/lib/pieces-index.mjs';

const REAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CODE = ['engine', 'catalog', 'rigs', 'sound'];
// a spread of bodies, generator families and pieces: characters, creatures, effects, a tileset, a backdrop, interface, icons
const SAMPLE = 14;

/** Registry listing and a hash of frames drawn from sprites/ by the engine under root. */
async function drawAll(root) {
  const at = (f) => import(pathToFileURL(path.join(root, f)).href);
  const [G, D, S, P] = await Promise.all([at('engine/gen/index.js'), at('engine/data-sprite.js'), at('engine/sprite.js'), at('engine/pieces.js')]);
  P.sitePieces().useReader(nodePieceReader(REAL));
  const files = fs.readdirSync(path.join(REAL, 'sprites')).filter((f) => /^[a-z0-9-]+\.json$/.test(f)).sort();
  const step = Math.max(1, Math.floor(files.length / SAMPLE));
  const h = crypto.createHash('sha256');
  for (const f of files.filter((_, i) => i % step === 0)) {
    const data = JSON.parse(fs.readFileSync(path.join(REAL, 'sprites', f), 'utf8'));
    const got = await P.sitePieces().loadFor(data);
    assert.ok(got.ok, `${f}: ${got.errors?.join('; ')}`);
    const sp = D.dataSprite(data);
    for (const clip of Object.keys(sp.clips)) { const g = S.renderFrame(sp, clip, 0, sp.defaults ?? {}); h.update(f + clip); h.update(g.bytes()); }
  }
  return { list: JSON.stringify(G.describeGenerators()), frames: h.digest('hex') };
}

test('the bundled registry holds the same generators and draws the same pixels as the source', async () => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-bundle-'));
  try {
    for (const d of CODE) fs.cpSync(path.join(REAL, d), path.join(dist, d), { recursive: true, dereference: true });
    const r = await bundleGenerators(dist);
    assert.ok(r.bundled > 50, `bundled ${r.bundled} modules`);
    const code = fs.readFileSync(path.join(dist, 'engine', 'gen', 'index.js'), 'utf8');
    // the registry and the modules imported from outside engine/gen/ stay files at their own addresses
    assert.match(code, /from\s*"\.\/registry\.js"/);
    assert.match(code, /from\s*"\.\.\/resolve\.js"|from\s*"\.\.\/motion\.js"/);
    assert.doesNotMatch(code, /from\s*"\.\/fx\.js"/);
    const [a, b] = [await drawAll(REAL), await drawAll(dist)];
    assert.equal(b.list, a.list);
    assert.equal(b.frames, a.frames);
  } finally { fs.rmSync(dist, { recursive: true, force: true }); }
});

test('a dist/ whose engine is a link to the source is refused, and the source is left as it was', async () => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-bundle-link-'));
  const index = path.join(REAL, 'engine', 'gen', 'index.js');
  const before = fs.readFileSync(index);
  try {
    fs.symlinkSync(path.join(REAL, 'engine'), path.join(dist, 'engine'), 'dir');
    await assert.rejects(bundleGenerators(dist), /not a file of/);
    assert.deepEqual(fs.readFileSync(index), before);
  } finally { fs.rmSync(dist, { recursive: true, force: true }); }
});
