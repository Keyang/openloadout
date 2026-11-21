// Build item R4c part 1 (docs/data-sprites.md section 9, row R4c): `check`, `render`, `make.sprite` and the background
// worker take sprite DATA only. The dynamic imports of a code sprite are gone: `checkSpriteAt(... ?? sprites/<id>.js)` in
// app/api-core.js, `(await import(m.url)).default` and the page-only `def` job in app/api-worker.js, and the page-built
// `{ render() }` object that `check` used to run on the page. Anything that is not a data sprite gets the one clear
// answer, which starts "Loadout sprites are data:". Runs in Node, with the catalogue's request answered by a stub.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runJob } from '../../app/api-worker.js';
import { ACTIONS } from '../../app/api-actions.js';
import { goodData } from '../fixtures/api/data.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const SAY = /Loadout sprites are data:/;

const CATALOG = {
  version: 1,
  assets: [
    { id: 'old-code', kind: 'sprite', name: 'Old code', src: 'sprites/old-code.js', bundles: [], tech: {} },
    { id: 'upper-code', kind: 'sprite', name: 'Upper', src: 'sprites/upper-code.MJS', bundles: [], tech: {} },
    { id: 'query-code', kind: 'sprite', name: 'Query', src: 'sprites/query-code.js?a.json', bundles: [], tech: {} },
    { id: 'a-data-file', kind: 'sprite', name: 'Data', src: 'sprites/a-data-file.json', bundles: [], tech: {} },
  ],
  bundles: [],
};
const realFetch = globalThis.fetch;
test.beforeEach(() => { globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => CATALOG }); });
test.afterEach(() => { globalThis.fetch = realFetch; });

async function loadout(env = {}) {
  const { createLoadout } = await import('../../app/api-core.js');
  return createLoadout(env);
}

// ---- the worker ---------------------------------------------------------------------------------------------------

test('the worker refuses a sprite object that is code, and a sprite file that is not a .json data file, with the data answer', async () => {
  await assert.rejects(runJob({ type: 'checkSprite', def: { id: 'x', render() {} } }), SAY, 'a def (a sprite object with a render function) is never run');
  for (const url of ['https://example.test/sprites/x.js', 'file:///sprites/x.js', 'https://example.test/sprites/x.MJS', 'https://example.test/sprites/x.jsx', 'https://example.test/sprites/x']) {
    await assert.rejects(runJob({ type: 'checkSprite', url }), SAY, url);
  }
  await assert.rejects(runJob({ type: 'checkSprite' }), SAY, 'a job that names nothing is refused the same way');
});

test('the worker still takes a definition as data, and a data file only from this site', async () => {
  const good = await runJob({ type: 'checkSprite', data: goodData() });
  assert.deepEqual(good.errors, []);
  await assert.rejects(runJob({ type: 'checkSprite', url: 'https://example.test/sprites/x.json' }), /Only a sprite file of this site/, 'a .json file of another site is not loaded');
});

test('app/api-worker.js and app/api-core.js contain no way to run a code sprite', () => {
  const worker = read('app/api-worker.js');
  assert.doesNotMatch(worker, /import\(\s*m\.url\s*\)/, 'no dynamic import of a sprite file');
  assert.doesNotMatch(worker, /\)\.default\b/, 'no module default is read');
  assert.doesNotMatch(worker, /=\s*m\.def\b/, 'no page-built sprite object is checked (m.def is only refused)');
  const core = read('app/api-core.js');
  assert.doesNotMatch(core, /sprites\/\$\{[^}]*\}\.js/, 'no sprites/<id>.js fallback');
  assert.doesNotMatch(core, /runJob\(\{ type: 'checkSprite', def/, 'no page-built { render() } object is run on the page');
  assert.doesNotMatch(core, /def: what/, 'no page-built object is handed to the worker');
});

// ---- window.loadout.check -----------------------------------------------------------------------------------------

test('check refuses a page-built sprite object (a render function) and sprite source text, saying sprites are data', async () => {
  const L = await loadout();
  const built = await L.check({ id: 'x', name: 'X', size: [8, 8], render() {} });
  assert.equal(built.ok, false);
  assert.match(built.errors[0], SAY);
  assert.match(built.errors[0], /render\(\)/);
  assert.match(built.errors[0], /"loadout-sprite"/);
  const source = await L.check("import { defineSprite } from '../engine/sprite.js';\nexport default defineSprite({ id: 'gem' });\n");
  assert.equal(source.ok, false);
  assert.match(source.errors[0], /Loadout sprites are data:/);
  assert.match(source.errors[0], /no longer taken/);
});

test('check by id refuses a catalogue row whose file is code, without loading it', async () => {
  const L = await loadout();
  for (const id of ['old-code', 'upper-code']) {
    const r = await L.check(id);
    assert.equal(r.ok, false, id);
    assert.match(r.errors[0], new RegExp(`"${id}" is not a data sprite`), r.errors[0]);
    assert.match(r.errors[0], /Loadout sprites are data:/);
  }
});

test('check by id of a row with a .json data file is handed to the worker (here it stops at the origin check: Node has no site)', async () => {
  const L = await loadout();
  const r = await L.check('a-data-file');
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /Only a sprite file of this site/, 'it got as far as the worker, which loads data files only');
});

// ---- window.loadout.render ----------------------------------------------------------------------------------------

test('render refuses a catalogue row whose file is code, saying sprites are data', async () => {
  const L = await loadout({ window: { document: {} } });
  const r = await L.render('old-code');
  assert.equal(r.ok, false);
  assert.match(r.errors[0], SAY);
  assert.match(r.errors[0], /"old-code" is not a data sprite/);
});

// ---- review of R4c: one shape, one text, the path of the src ------------------------------------------------------

test('every check refusal has the shape of a check answer: id, kind "sprite", ok false, errors, warnings []', async () => {
  const L = await loadout();
  const answers = {
    object: await L.check({ id: 'made-in-page', name: 'X', render() {} }),
    nameless: await L.check({ name: 'X', render() {} }),
    source: await L.check("export default defineSprite({ id: 'gem' });"),
    code: await L.check('old-code'),
    query: await L.check('query-code'),
  };
  for (const [what, r] of Object.entries(answers)) {
    assert.equal(r.kind, 'sprite', what);
    assert.equal(r.ok, false, what);
    assert.deepEqual(r.warnings, [], what);
    assert.equal(r.errors.length, 1, what);
    assert.match(r.errors[0], SAY, what);
    assert.ok('id' in r, what);
  }
  assert.equal(answers.object.id, 'made-in-page', 'the id a page-built object named is kept');
  assert.equal(answers.nameless.id, null);
  assert.equal(answers.code.id, 'old-code');
});

test('a catalogue src is judged by its path: sprites/x.js?a.json is code, the caller gets the "is not a data sprite" answer', async () => {
  const L = await loadout();
  const r = await L.check('query-code');
  assert.match(r.errors[0], /"query-code" is not a data sprite/);
  const d = await loadout({ window: { document: {} } });
  const rr = await d.render('query-code');
  assert.equal(rr.ok, false);
  assert.match(rr.errors[0], /"query-code" is not a data sprite/);
});

test('the refusal text is one constant: api-core imports DATA_ONLY from api-worker, it defines none of its own', async () => {
  const core = read('app/api-core.js');
  assert.match(core, /import \{ DATA_ONLY \} from '\.\/api-worker\.js'/);
  assert.doesNotMatch(core, /const DATA_ONLY\b/, 'no second copy that could drift');
  const { DATA_ONLY } = await import('../../app/api-worker.js');
  const L = await loadout();
  assert.ok((await L.check({ id: 'x', render() {} })).errors[0].includes(DATA_ONLY), 'the core answers with the worker\'s very text');
});

// ---- the descriptions ---------------------------------------------------------------------------------------------

test('the check and render descriptions say a sprite is data and take no code', () => {
  const check = ACTIONS.find((a) => a.name === 'check');
  assert.match(check.description, /sprites are data/i);
  assert.doesNotMatch(check.description, /source text/);
  assert.doesNotMatch(ACTIONS.find((a) => a.name === 'render').description, /\.js\b|source/);
});
