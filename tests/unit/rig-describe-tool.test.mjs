// Where the rig descriptions are used: generated/api.json (a `rigs` section, built by tools/lib/api.mjs from
// rigs/<rig>-describe.js) and tools/rig.mjs (a table to read, and a contact sheet of every part and held kind).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildApi, referenceMarkdown, findFrameworkModules, frameworkSource, undescribed, ROOT } from '../../tools/lib/api.mjs';
import { RIG_IDS, loadRig, table, sheets } from '../../tools/rig.mjs';

const api = await buildApi();
const run = (...args) => execFileSync(process.execPath, [path.join(ROOT, 'tools', 'rig.mjs'), ...args], { encoding: 'utf8' });

test('api: the description modules are framework modules with names a program can use', () => {
  const found = findFrameworkModules().filter((m) => m.file.endsWith('-describe.js'));
  assert.deepEqual(found.map((m) => [m.file, m.name]), [['rigs/humanoid-describe.js', 'humanoidDescribe'], ['rigs/kiosk-describe.js', 'kioskDescribe'], ['rigs/topdown-describe.js', 'topdownDescribe']]);
  // the names are identifiers, so generated/framework.js stays a module that loads
  assert.doesNotThrow(() => new Function(frameworkSource(found).replace(/export \* as (\w+) from '[^']+';/g, 'var $1;')));
  assert.deepEqual(undescribed(api).filter((u) => u.file.endsWith('-describe.js')), []);
});

test('api: generated/api.json has a `rigs` section, one entry per described rig, equal to the description', async () => {
  assert.deepEqual(api.rigs.map((r) => r.id).sort(), [...RIG_IDS].sort());
  for (const r of api.rigs) {
    const { rig } = await loadRig(r.id);
    assert.equal(r.describedIn, `rigs/${r.id}-describe.js`);
    assert.equal(r.module, `${r.id}Describe`);
    const { describedIn, module, ...rest } = r;
    assert.deepEqual(rest, JSON.parse(JSON.stringify(rig)));
  }
  assert.match(api.about, /rigs:/);
  assert.doesNotThrow(() => JSON.stringify(api));
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

test('docs/framework-api.md has a Rigs section that points at the descriptions', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'docs', 'framework-api.md'), 'utf8');
  assert.match(doc, /^## Rigs$/m);
  for (const s of ['generated/api.json', 'tools/rig.mjs', '-describe.js', 'rig-describe-']) assert.ok(doc.includes(s), `it mentions ${s}`);
});

for (const id of RIG_IDS) {
  test(`tools/rig.mjs ${id}: the table names every pose, part and held kind with its options`, async () => {
    const { rig } = await loadRig(id), text = table(rig);
    for (const section of ['poses', 'parts', 'held', 'hair', 'sockets']) for (const e of rig[section]) assert.ok(text.includes(e.name), `${id}: "${e.name}" (${section}) is in the table`);
    for (const p of rig.parts) for (const key of Object.keys(p.options ?? {})) assert.ok(text.includes(key), `${id}: option ${key} of ${p.name}`);
    assert.ok(text.split('\n').every((l) => l.length < 400), 'no line runs away');
    assert.equal(run(id).trim(), text.trim(), 'the command prints the same table');
  });

  test(`tools/rig.mjs ${id} --sheet: one picture of every part and one of every held kind, each on the body in every direction`, async () => {
    const L = await loadRig(id), made = sheets(L);
    assert.deepEqual(Object.keys(made).sort(), ['held', 'parts']);
    for (const [name, s] of Object.entries(made)) {
      assert.ok(s.rows.length >= L.rig[name].length, `${id} ${name}: a row for each (${s.rows.length} rows for ${L.rig[name].length})`);
      for (const e of L.rig[name]) assert.ok(s.rows.some((r) => r.name === e.name), `${id} ${name}: a row for "${e.name}"`);
      for (const r of s.rows) assert.equal(r.cells.length, L.rig.directions.length, `${id} ${name} ${r.label}: a cell per direction`);
      // a part with kinds has a row for each kind
      if (name === 'parts') for (const e of L.rig.parts) for (const v of e.options?.kind?.choices ?? []) assert.ok(s.rows.some((r) => r.label === `${e.name}: ${v}`), `${id}: a row for ${e.name}: ${v}`);
      assert.ok(s.width > 0 && s.height > 0 && s.png.length > 100 && s.png[1] === 0x50, `${id} ${name}: a PNG`);
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-rig-sheet-'));
    const out = run(id, '--sheet', '--out', dir);
    for (const name of ['parts', 'held']) assert.ok(fs.statSync(path.join(dir, `rig-${id}-${name}.png`)).size > 100 && out.includes(`rig-${id}-${name}.png`), `${name} sheet written and named`);
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

test('tools/rig.mjs: no rig, or an unknown one, lists the rigs there are and fails', () => {
  assert.throws(() => execFileSync(process.execPath, [path.join(ROOT, 'tools', 'rig.mjs'), 'nosuchrig'], { encoding: 'utf8', stdio: 'pipe' }), /humanoid, topdown, kiosk|humanoid|topdown/);
});
