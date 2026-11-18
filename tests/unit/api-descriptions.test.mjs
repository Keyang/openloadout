// Contract 11: every exported framework function says in one line what it does.
// The generator (tools/lib/api.mjs) reads the comment above the export; this test fails when there is none.
//
// tests/fixtures/api/still-to-describe.json lists the exports that had no description when the rule came in
// (2026-11-18), in files other builders were editing at the time. The list can only shrink: an entry that is
// described now, or that no longer exists, fails the test until it is taken off the list.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApi, undescribed } from '../../tools/lib/api.mjs';

const REAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LIST = path.join(REAL, 'tests', 'fixtures', 'api', 'still-to-describe.json');

const api = await buildApi({ root: REAL });
const waiting = JSON.parse(fs.readFileSync(LIST, 'utf8'));
const listed = new Set(Object.entries(waiting.exports).flatMap(([file, names]) => names.map((n) => `${file}: ${n}`)));
const missing = undescribed(api).map((u) => `${u.file}: ${u.name}`);

test('every exported framework function and class has a one-line description', () => {
  const fresh = missing.filter((m) => !listed.has(m));
  assert.deepEqual(fresh, [], `no description for:\n  ${fresh.join('\n  ')}\nWrite a comment directly above the export: /** One line that says what it does. Then its arguments. */ (docs/framework-api.md)`);
});

test('the "still to describe" list only shrinks', () => {
  const stale = [...listed].filter((l) => !missing.includes(l));
  assert.deepEqual(stale, [], `these are described now, or no longer exist: take them off tests/fixtures/api/still-to-describe.json:\n  ${stale.join('\n  ')}`);
  for (const [file, names] of Object.entries(waiting.exports)) {
    assert.ok(api.modules.some((m) => m.file === file), `${file} is not a framework module: take it off the list`);
    assert.ok(names.length > 0, `${file}: an empty entry; delete it`);
    assert.equal(new Set(names).size, names.length, `${file}: a name is listed twice`);
  }
});

test('a description is one line of words, not code', () => {
  for (const m of api.modules) for (const e of m.exports) {
    if (!e.description) continue;
    assert.ok(!e.description.includes('\n'), `${m.file}: ${e.name}: more than one line`);
    assert.ok(e.description.length <= 240, `${m.file}: ${e.name}: ${e.description.length} characters; say it in one line`);
    assert.ok(/^[A-Z0-9"'`({[]/.test(e.description), `${m.file}: ${e.name}: "${e.description}"`);
  }
});
