// Where the rig descriptions are used: generated/api.json (a `rigs` section, built by tools/lib/api.mjs from
// rigs/<rig>-describe.js). R2 deleted tools/rig.mjs and the topdown and kiosk descriptions (rigs/humanoid-describe.js stays with rigs/humanoid.js),
// and with them the tests that drew every description through the tool (rig-describe-data, rig-describe-draw).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApi, referenceMarkdown, findFrameworkModules, frameworkSource, undescribed } from '../../tools/lib/api.mjs';

const api = await buildApi();

test('api: the description modules are framework modules with names a program can use', () => {
  const found = findFrameworkModules().filter((m) => m.file.endsWith('-describe.js'));
  assert.deepEqual(found.map((m) => [m.file, m.name]), [['rigs/humanoid-describe.js', 'humanoidDescribe']]);
  // the names are identifiers, so generated/framework.js stays a module that loads
  assert.doesNotThrow(() => new Function(frameworkSource(found).replace(/export \* as (\w+) from '[^']+';/g, 'var $1;')));
  assert.deepEqual(undescribed(api).filter((u) => u.file.endsWith('-describe.js')), []);
});

test('api: a project with no rig descriptions has an empty `rigs` list', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-rigs-'));
  fs.mkdirSync(path.join(dir, 'engine'));
  fs.writeFileSync(path.join(dir, 'engine', 'one.js'), '/** Adds one. Arguments: n. */\nexport const one = (n) => n + 1;\n');
  const small = await buildApi({ root: dir });
  assert.deepEqual(small.rigs, []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('api: generated/api.md lists the rigs with their counts', () => {
  const md = referenceMarkdown(api);
  assert.match(md, /### Rigs/);
  for (const r of api.rigs) assert.ok(md.includes(`\`${r.id}\``) && md.includes(`${r.poses.length} poses`), `${r.id} is in the page`);
});

