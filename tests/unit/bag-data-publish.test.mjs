// Studio item S8, review round 3 (issue 1): what the bag, the catalogue and the download load must be on the published
// site. `npm run build -- --dist` copies only the folders the browser loads (tools/build.mjs DIST); tools/ is not one of
// them, so a module there that the export imports is a 404 on the published site and the whole download fails. The
// library file writer the download uses for a studio sprite is catalog/data-file.js (tools/lib/data-file.mjs
// re-exports it: there is one copy of the code).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importGraph } from '../../tools/lib/imports.mjs';
import { studioTemplate, STUDIO_TEMPLATE_IDS } from '../../rigs/studio-templates.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');

/** The folders and files --dist publishes, read from tools/build.mjs (const DIST = [...]). */
function published() {
  const text = fs.readFileSync(path.join(ROOT, 'tools', 'build.mjs'), 'utf8');
  const m = /const DIST = \[([^\]]*)\]/.exec(text);
  assert.ok(m, 'tools/build.mjs names what it publishes (DIST)');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}
const isPublished = (dist, file) => dist.includes(rel(file).split('/')[0]) && !rel(file).startsWith('..');

const MINE = ['app/bag.js', 'app/catalog.js', 'app/bundle.js', 'catalog/plain-data.js', 'catalog/data-file.js', 'app/deflate.js'];

test('publish: every module the bag, the catalogue and the download name (also loaded on demand) is published', () => {
  const dist = published();
  assert.ok(!dist.includes('tools'), 'tools/ is not published');
  const g = importGraph({ root: ROOT });
  const out = [];
  for (const f of MINE) {
    const file = path.join(ROOT, f);
    assert.ok(fs.existsSync(file), `${f} is there`);
    const s = g.direct(file);
    for (const d of [...s.deps, ...s.missing]) if (!isPublished(dist, d)) out.push(`${f} -> ${rel(d)}`);
  }
  assert.deepEqual(out, [], 'not published');
});

test('publish: what the download reaches, through every module, is published', () => {
  const dist = published();
  const g = importGraph({ root: ROOT });
  const reach = g.closure(['app/bundle.js', 'app/bag.js', 'app/catalog.js'].map((f) => path.join(ROOT, f)));
  const out = [];
  for (const file of reach.files) for (const d of g.direct(file).deps) if (!isPublished(dist, d)) out.push(`${rel(file)} -> ${rel(d)}`);
  assert.deepEqual(out, []);
});

/** A file's code after its imports (its own top comment and import lines differ by folder; the rest must not). */
function body(f) {
  const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
  let last = -1;
  lines.forEach((l, i) => { if (/^import\s.*from\s+'[^']+';$/.test(l)) last = i; });
  assert.ok(last >= 0, `${f} imports something`);
  return lines.slice(last + 1).join('\n');
}

test('publish: catalog/data-file.js is the same code as tools/lib/data-file.mjs (after the imports)', () => {
  // (once tools/lib/data-file.mjs is only `export * from '../../catalog/data-file.js';` there is one copy, and nothing to compare)
  if (/^\s*export \* from '\.\.\/\.\.\/catalog\/data-file\.js';\s*$/m.test(fs.readFileSync(path.join(ROOT, 'tools/lib/data-file.mjs'), 'utf8'))) return;
  assert.equal(body('catalog/data-file.js'), body('tools/lib/data-file.mjs'), 'the two copies of the library file form have drifted apart: change both, or make tools/lib/data-file.mjs re-export catalog/data-file.js');
});

test('publish: both write the same library file for every template, and read each other\'s', async () => {
  const [A, B] = await Promise.all([import('../../catalog/data-file.js'), import('../../tools/lib/data-file.mjs')]);
  for (const k of ['STUDIO_MARK', 'STUDIO_HEADER', 'STUDIO_IMPORT', 'STUDIO_CALL', 'FILE_CHARS']) assert.equal(A[k], B[k], k);
  assert.deepEqual(Object.keys(A).sort(), Object.keys(B).sort());
  const ids = STUDIO_TEMPLATE_IDS;
  assert.ok(ids.length >= 3, `templates: ${ids.join(', ')}`);
  for (const id of ids) {
    const def = { ...studioTemplate(id), id: `t-${id}`.slice(0, 40), name: `T ${id}` };
    const a = A.writeDataFile(def), b = B.writeDataFile(def);
    assert.equal(a.ok, true, `${id}: ${a.errors?.[0]}`);
    assert.deepEqual(a, b, id);
    assert.equal(B.checkDataFile(a.text, `sprites/${a.name}`, { strict: false })?.id, def.id, `${id}: the build reads the published writer's file`);
    assert.deepEqual(A.readDataFile(b.text).value, B.readDataFile(a.text).value);
  }
});
