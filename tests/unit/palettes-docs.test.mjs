// Contract 11: every export of the two helper modules has a doc comment right above it that says
// what it does and names each of its arguments (option keys of a destructured argument included).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

export function exportsWithDocs(file) {
  const src = readFileSync(new URL(`../../engine/${file}`, import.meta.url), 'utf8');
  const out = [];
  const re = /(\/\*\*([\s\S]*?)\*\/\s*)?export (?:function (\w+)\s*\(([^)]*)\)|const (\w+)\s*=\s*(?:\(([^)]*)\)\s*=>)?)/g;
  for (const m of src.matchAll(re)) {
    const name = m[3] ?? m[5];
    const params = m[4] ?? m[6] ?? '';
    // argument names: top-level identifiers and the keys of a destructured { ... }
    const args = [...params.replace(/=\s*[^,{}]+/g, '').matchAll(/[A-Za-z_]\w*/g)].map((x) => x[0]);
    out.push({ name, doc: (m[2] ?? '').replace(/^\s*\*\s?/gm, ' ').trim(), args });
  }
  return out;
}

for (const file of ['palettes.js', 'fx.js']) {
  test(`${file}: every export has a doc comment naming what it does and its arguments`, () => {
    const list = exportsWithDocs(file);
    assert.ok(list.length >= 6, `found ${list.length} exports`);
    for (const { name, doc, args } of list) {
      assert.ok(doc.length >= 20, `${file} ${name}: needs a /** one-line description */ right above it`);
      for (const a of args) assert.ok(new RegExp(`\\b${a}\\b`).test(doc), `${file} ${name}: doc comment does not mention argument "${a}"`);
    }
  });
}
