// The quality libraries must run in a browser as well as in Node: they and every
// module they import may only import other project files by relative path.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// (no quote before `from`: `export const X = { a: ['from'] }` is not an import)
const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s[^;'"`]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;

function walk(file, seen = new Map()) {
  if (seen.has(file)) return seen;
  const text = fs.readFileSync(file, 'utf8');
  const specs = [...text.matchAll(IMPORT_RE)].map((m) => m[1] || m[2] || m[3]);
  seen.set(file, { text, specs });
  for (const s of specs) if (s.startsWith('.')) walk(path.resolve(path.dirname(file), s), seen);
  return seen;
}

for (const lib of ['quality/sprite.js', 'quality/sound.js']) {
  test(`${lib} imports nothing from Node, directly or through its imports`, () => {
    const all = walk(path.join(ROOT, lib));
    assert.ok(all.size >= 2, 'it imports the engine');
    for (const [file, { text, specs }] of all) {
      const rel = path.relative(ROOT, file);
      for (const s of specs) {
        assert.ok(!s.startsWith('node:') && !builtinModules.includes(s), `${rel} imports Node module "${s}"`);
        assert.ok(s.startsWith('.'), `${rel} imports "${s}", which is not a project file (browsers cannot resolve bare names)`);
      }
      assert.ok(!/\brequire\(|\bprocess\.|\bBuffer\./.test(text), `${rel} uses require, process or Buffer`);
    }
  });
}

test('the libraries load and export the contract functions', async () => {
  const s = await import('../../quality/sprite.js');
  const a = await import('../../quality/sound.js');
  assert.equal(typeof s.checkSprite, 'function');
  assert.equal(typeof a.checkSound, 'function');
  assert.equal(typeof s.THRESHOLDS, 'object');
  assert.equal(typeof a.THRESHOLDS, 'object');
});
