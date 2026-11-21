// Build item R4c part 4: `--from <code file>` in tools/redraw-pixels.mjs, redraw-pixels-c2.mjs, redraw-boxes.mjs and
// tools/projectiles/counts.mjs records a new comparison from a FROZEN COPY in tests/fixtures/code-sprites/ (the only
// code sprites left: sprites/ holds data only). Each tool is run as the command line it documents, with `--out <dir>`
// so that the pinned records in tests/fixtures/ are never touched. counts.mjs used to need all eight projectile code
// files in one folder (the frozen copies hold boulder-chunk only), so it could not run and would have overwritten
// the pinned record; it now records the ids named, or the ids the folder has a file for, and merges them in.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FROZEN = 'tests/fixtures/code-sprites';
const run = (...args) => spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout: 250_000 });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'redraw-from-'));
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

test('redraw-pixels.mjs record --from a frozen copy writes a pixel record to --out', () => {
  const out = tmp();
  try {
    const r = run('tools/redraw-pixels.mjs', 'record', 'coin', '--from', `${FROZEN}/coin.js`, '--out', out);
    assert.equal(r.status, 0, r.stderr);
    const rec = readJson(path.join(out, 'coin.json'));
    assert.equal(rec.id, 'coin');
    assert.ok(rec.cases > 0 && rec.frames.length > 0, 'frames recorded');
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('redraw-pixels-c2.mjs record --from a frozen copy writes a c2 record to --out', () => {
  const out = tmp();
  try {
    const r = run('tools/redraw-pixels-c2.mjs', 'record', 'bat', '--from', `${FROZEN}/bat.js`, '--out', out);
    assert.equal(r.status, 0, r.stderr);
    const rec = readJson(path.join(out, 'bat.json'));
    assert.equal(rec.id, 'bat');
    assert.ok(rec.cases > 0 && rec.frames.length > 0);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('redraw-boxes.mjs record --from a frozen copy writes a box record to --out', () => {
  const out = tmp();
  try {
    const r = run('tools/redraw-boxes.mjs', 'record', 'bat', '--from', `${FROZEN}/bat.js`, '--hashes', '--out', out);
    assert.equal(r.status, 0, r.stderr);
    const rec = readJson(path.join(out, 'bat.json'));
    assert.equal(rec.id, 'bat');
    assert.ok(rec.cases > 0 && rec.boxes && rec.frames);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('projectiles/counts.mjs record --from a folder of frozen copies records the ids it has a file for, and merges', () => {
  const out = tmp(), file = path.join(out, 'projectiles.json');
  try {
    fs.writeFileSync(file, JSON.stringify({ recorded: '2000-01-01', fields: ['stray'], sprites: { arrow: { kept: true } } }));
    const r = run('tools/projectiles/counts.mjs', 'record', '--from', FROZEN, '--out', file);
    assert.equal(r.status, 0, r.stderr);
    const rec = readJson(file);
    assert.deepEqual(Object.keys(rec.sprites).sort(), ['arrow', 'boulder-chunk'], 'boulder-chunk added (its is the only projectile frozen), arrow kept');
    assert.deepEqual(rec.sprites.arrow, { kept: true }, 'a record the folder has no file for is not touched');
    assert.ok(Object.keys(rec.sprites['boulder-chunk']).includes('defaults'));
    assert.deepEqual(rec.fields, ['stray', 'uninked', 'ink', 'moss', 'mossLine'], 'the field list is the tool\'s');
    const named = run('tools/projectiles/counts.mjs', 'record', 'acid-glob', '--from', FROZEN, '--out', file);
    assert.equal(named.status, 2, 'an id named but without a file is refused');
    assert.match(named.stderr, /acid-glob/);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('check reads the record that record --out wrote (--out <dir>), and a missing record is one sentence, not a stack trace', () => {
  const cases = [['redraw-pixels', ['bat']], ['redraw-pixels-c2', ['bat']], ['redraw-boxes', ['bat', '--hashes']]];
  for (const [tool, extra] of cases) {
    const out = tmp();
    try {
      const rec = run(`tools/${tool}.mjs`, 'record', extra[0], '--from', `${FROZEN}/bat.js`, ...extra.slice(1), '--out', out);
      assert.equal(rec.status, 0, `${tool} record: ${rec.stderr}`);
      const chk = run(`tools/${tool}.mjs`, 'check', 'bat', '--out', out);
      assert.equal(chk.status, 0, `${tool} check --out: ${chk.stdout}${chk.stderr}`);
      const none = run(`tools/${tool}.mjs`, 'check', 'bat', '--out', path.join(out, 'nothing-here'));
      assert.equal(none.status, 2, tool);
      assert.match(none.stderr, /no record of bat/, tool);
      assert.doesNotMatch(none.stderr, /ENOENT|at .*\(node:/, `${tool}: no stack`);
    } finally { fs.rmSync(out, { recursive: true, force: true }); }
  }
});

test('counts.mjs record keeps the provenance of a record that exists: top-level date and source stay, the ids recorded now are listed under rerecorded', () => {
  const out = tmp(), file = path.join(out, 'projectiles.json');
  try {
    fs.writeFileSync(file, JSON.stringify({ recorded: '2000-01-01', from: 'the first source', fields: ['stray'], sprites: { arrow: { kept: true } } }));
    const r = run('tools/projectiles/counts.mjs', 'record', '--from', FROZEN, '--out', file);
    assert.equal(r.status, 0, r.stderr);
    const rec = readJson(file);
    assert.equal(rec.recorded, '2000-01-01');
    assert.equal(rec.from, 'the first source');
    assert.deepEqual(Object.keys(rec.rerecorded), ['boulder-chunk']);
    assert.match(rec.rerecorded['boulder-chunk'].from, /frozen copies/);
    assert.match(rec.rerecorded['boulder-chunk'].recorded, /^\d{4}-\d{2}-\d{2}$/);
    // a new file gets its date and source at the top
    const fresh = path.join(out, 'new.json');
    assert.equal(run('tools/projectiles/counts.mjs', 'record', '--from', FROZEN, '--out', fresh).status, 0);
    const f = readJson(fresh);
    assert.ok(f.recorded && f.from && !f.rerecorded);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('a --from file that does not exist is refused in one sentence naming the frozen copies, not a stack trace', () => {
  for (const tool of ['redraw-pixels', 'redraw-pixels-c2', 'redraw-boxes']) {
    const r = run(`tools/${tool}.mjs`, 'record', 'bat', '--from', 'sprites/bat.js', '--out', os.tmpdir());
    assert.equal(r.status, 2, tool);
    assert.match(r.stderr, /tests\/fixtures\/code-sprites/, tool);
    assert.doesNotMatch(r.stderr, /at .*\(node:|ERR_MODULE_NOT_FOUND/, `${tool}: no stack`);
  }
});

test('the four tools say where --from comes from (a frozen copy), not a copy of the project', () => {
  for (const f of ['tools/redraw-pixels.mjs', 'tools/redraw-pixels-c2.mjs', 'tools/redraw-boxes.mjs', 'tools/projectiles/counts.mjs']) {
    const head = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').filter((l) => l.startsWith('//')).join('\n');
    assert.match(head, /tests\/fixtures\/code-sprites/, f);
    assert.doesNotMatch(head, /copy of the project whose engine|_was-/, f);
  }
});

test('every frozen copy loads and draws, so a --from can record from any of them', async () => {
  const { pathToFileURL } = await import('node:url');
  const { renderFrame, defaultParams } = await import('../../engine/sprite.js');
  const dir = path.join(ROOT, FROZEN), bad = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js')).sort()) {
    try { const s = (await import(pathToFileURL(path.join(dir, f)).href)).default; const p = defaultParams(s); renderFrame(s, s.preview, 0, p); } catch (e) { bad.push(`${f}: ${e.message}`); }
  }
  assert.deepEqual(bad, [], 'a frozen copy that imports a module removed in R3 cannot run: remove the copy (and say so in docs/data-sprites.md); a record already taken from it stays valid');
});
