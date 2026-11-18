// tools/lib/api.mjs: the framework describes itself (docs/architecture.md, Contract 11).
// The generator finds framework modules by scanning folders; nothing here names a module the project must have,
// except where a test is about the naming rule itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  FRAMEWORK_FOLDERS, isFrameworkSource, findFrameworkModules, shortNames, describeSource, oneLine, splitArgs,
  buildApi, frameworkSource, referenceMarkdown, writeApi, undescribed,
} from '../../tools/lib/api.mjs';

const REAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A scratch project with a tiny framework: two modules, one page-glue file, one name clash. */
function scratch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-api-'));
  const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
  put('engine/shapes.js', `// Shape helpers: the pieces every drawing starts from. More words here.
//
//   import { box } from '../engine/shapes.js';

/** A full turn, in radians. */
export const TURN = Math.PI * 2;

/**
 * Draws a box. A second sentence that is not part of the one line.
 * x, y: the top-left corner.
 */
export function box(g, x, y, { w = 4, h = 4 } = {}) { return [g, x, y, w, h]; }

// Half of a value.
export const half = (v) => v / 2;

export const bare = (a, b) => a + b;

export const SIZES = { small: 1, big: 2 };

/** A drawing surface. */
export class Pad {
  constructor(w, h) { this.w = w; this.h = h; }
  /** Paint one pixel. */
  dot(x, y, c) { return [x, y, c]; }
  clear() { return this; }
}
`);
  put('engine/theme.js', '// Looks for pictures.\n/** The plain look. */\nexport function plain() { return {}; }\n');
  put('sound/theme.js', '// Looks for sounds.\n/** The plain sound look. */\nexport function plainSound() { return {}; }\n');
  put('sound/sfx-engine.js', '// sfx-engine.js — the sound engine. It makes samples.\n/** Render a patch. */\nexport function renderPatch(patch, opts = {}) { return { patch, opts }; }\n');
  put('sound/player.js', '// Plays sounds on the page.\n/** A player. */\nexport function createPlayer() { return new window.AudioContext(); }\n');
  put('sound/worker.js', '// Renders off the main thread.\nself.onmessage = (e) => self.postMessage(e.data);\n');
  put('quality/sprite.js', '// The sprite bar.\n/** Check a sprite. */\nexport function checkSprite(def) { return { errors: [], warnings: [], def }; }\n');
  put('rigs/_draft.js', '// Not ready.\nexport const x = 1;\n');
  put('sprites/.keep', '');
  put('sounds/.keep', '');
  return dir;
}

const root = scratch();
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test('the framework folders are engine, rigs, sound, quality and catalog (the metadata rules)', () => {
  assert.deepEqual(FRAMEWORK_FOLDERS, ['engine', 'rigs', 'sound', 'quality', 'catalog']);
});

test('the module rule: exports something and does not need a page, a worker or Web Audio', () => {
  assert.equal(isFrameworkSource('export const a = 1;').framework, true);
  assert.equal(isFrameworkSource('const a = 1;').framework, false, 'nothing exported');
  assert.equal(isFrameworkSource('export function f() { return window.innerWidth; }').framework, false);
  assert.equal(isFrameworkSource('export function f() { return document.body; }').framework, false);
  assert.equal(isFrameworkSource('export function f() { return new AudioContext(); }').framework, false);
  assert.equal(isFrameworkSource('export const f = 1; self.onmessage = () => {};').framework, false);
  assert.equal(isFrameworkSource('export const f = 1; registerProcessor("x", class extends AudioWorkletProcessor {});').framework, false);
  // words in comments and a variable called self do not count
  assert.equal(isFrameworkSource('// runs in a window, a worker and an AudioWorklet\nexport function f(def, self) { return self === def; }').framework, true);
  // a marker comment in the file header decides, whatever the code looks like
  assert.equal(isFrameworkSource('// loadout: not framework\nexport const a = 1;').framework, false);
  assert.equal(isFrameworkSource('// loadout: framework\nexport function f() { return typeof window === "undefined" ? 0 : window.devicePixelRatio; }').framework, true);
  assert.match(isFrameworkSource('export function f() { return window.x; }').why, /window/);
});

test('finds the modules of a scratch project by scanning, and leaves the page glue out', () => {
  const found = findFrameworkModules(root);
  assert.deepEqual(found.map((m) => m.file), ['engine/shapes.js', 'engine/theme.js', 'sound/sfx-engine.js', 'sound/theme.js', 'quality/sprite.js']);
  assert.deepEqual(found.map((m) => m.name), ['shapes', 'theme', 'sfx', 'soundTheme', 'checkSprite']);
});

test('the naming rule', () => {
  const names = shortNames(['engine/sprite.js', 'engine/theme.js', 'engine/big-thing.js', 'rigs/topdown.js', 'sound/sfx-engine.js', 'sound/theme.js', 'sound/wav.js', 'quality/sprite.js', 'quality/sound.js', 'catalog/schema.js']);
  assert.deepEqual(names, {
    'engine/sprite.js': 'sprite', 'engine/theme.js': 'theme', 'engine/big-thing.js': 'bigThing', 'rigs/topdown.js': 'topdown',
    'sound/sfx-engine.js': 'sfx', 'sound/theme.js': 'soundTheme', 'sound/wav.js': 'wav', 'quality/sprite.js': 'checkSprite', 'quality/sound.js': 'checkSound', 'catalog/schema.js': 'schema',
  });
});

test('a module dropped into the project appears with no other edit', async () => {
  const before = await buildApi({ root });
  assert.ok(!before.modules.some((m) => m.name === 'hats'));
  fs.writeFileSync(path.join(root, 'rigs', 'hats.js'), '// Hats for every rig.\n/** A pointed hat. */\nexport function wizardHat(g, at, { tall = 1 } = {}) { return [g, at, tall]; }\n');
  try {
    const api = await buildApi({ root });
    const hats = api.modules.find((m) => m.name === 'hats');
    assert.ok(hats, 'rigs/hats.js is a framework module');
    assert.equal(hats.file, 'rigs/hats.js');
    assert.equal(hats.purpose, 'Hats for every rig.');
    assert.deepEqual(hats.exports, [{ name: 'wizardHat', kind: 'function', args: ['g', 'at', '{ tall = 1 } = {}'], description: 'A pointed hat.' }]);
    assert.match(frameworkSource(api.modules), /export \* as hats from '\.\.\/rigs\/hats\.js';/);
  } finally { fs.rmSync(path.join(root, 'rigs', 'hats.js')); }
});

test('what is written about each export: kind, arguments, one line', async () => {
  const api = await buildApi({ root });
  const shapes = api.modules.find((m) => m.name === 'shapes');
  assert.equal(shapes.purpose, 'Shape helpers: the pieces every drawing starts from.');
  const by = Object.fromEntries(shapes.exports.map((e) => [e.name, e]));
  assert.deepEqual(Object.keys(by).sort(), ['Pad', 'SIZES', 'TURN', 'bare', 'box', 'half']);
  assert.equal(by.TURN.kind, 'constant');
  assert.equal(by.TURN.description, 'A full turn, in radians.');
  assert.equal(by.TURN.value, Math.PI * 2);
  assert.equal(by.box.kind, 'function');
  assert.deepEqual(by.box.args, ['g', 'x', 'y', '{ w = 4, h = 4 } = {}']);
  assert.equal(by.box.description, 'Draws a box.');
  assert.match(by.box.doc, /top-left corner/);
  assert.equal(by.half.kind, 'function');
  assert.deepEqual(by.half.args, ['v']);
  assert.equal(by.half.description, 'Half of a value.');
  assert.equal(by.bare.description, '', 'no comment, no description');
  assert.equal(by.SIZES.kind, 'object');
  assert.deepEqual(by.SIZES.keys, ['small', 'big']);
  assert.equal(by.Pad.kind, 'class');
  assert.deepEqual(by.Pad.args, ['w', 'h']);
  assert.deepEqual(by.Pad.methods, [
    { name: 'dot', args: ['x', 'y', 'c'], description: 'Paint one pixel.' },
    { name: 'clear', args: [], description: '' },
  ]);
  assert.deepEqual(undescribed(api).filter((u) => u.file === 'engine/shapes.js').map((u) => u.name), ['bare']);
});

test('reading a doc comment', () => {
  assert.equal(oneLine('Draws a box. And more.'), 'Draws a box.');
  assert.equal(oneLine('Fill under an outline (docs/style-guide.md section 7), up to y1.\nMore.'), 'Fill under an outline (docs/style-guide.md section 7), up to y1.');
  assert.equal(oneLine('sfx-engine.js — the sound engine. It makes samples.'), 'The sound engine.');
  assert.equal(oneLine('two words'), 'Two words');
  assert.equal(oneLine(''), '');
  assert.deepEqual(splitArgs('a, b = [1, 2], { c, d = (x, y) => x } = {}, ...rest'), ['a', 'b = [1, 2]', '{ c, d = (x, y) => x } = {}', '...rest']);
  // a comment that is only a call form is not a description
  const d = describeSource('/**\n * make({\n *   id, name,\n * })\n */\nexport function make(def) { return def; }\n', { make() {} });
  assert.equal(d.find((e) => e.name === 'make').description, '');
  // a section ruler above an export is not its description; a comment on the same line is
  const e = describeSource('// ---- colours ----\nexport const RED = "#f00";   // the red of every heart\n', { RED: '#f00' });
  assert.equal(e[0].description, 'The red of every heart');
});

test('generated/framework.js re-exports every module under its short name, and loads', async () => {
  const note = await writeApi({ root });
  assert.equal(typeof note, 'string');
  const api = JSON.parse(fs.readFileSync(path.join(root, 'generated', 'api.json'), 'utf8'));
  const fw = await import(pathToFileURL(path.join(root, 'generated', 'framework.js')).href + `?t=${Date.now()}`);
  assert.deepEqual(Object.keys(fw).sort(), api.modules.map((m) => m.name).sort());
  assert.equal(typeof fw.shapes.box, 'function');
  assert.equal(typeof fw.soundTheme.plainSound, 'function');
  assert.equal(typeof fw.checkSprite.checkSprite, 'function');
});

test('the same input writes the same files, byte for byte', async () => {
  await writeApi({ root });
  const a = fs.readFileSync(path.join(root, 'generated', 'api.json'), 'utf8') + fs.readFileSync(path.join(root, 'generated', 'framework.js'), 'utf8');
  await writeApi({ root });
  const b = fs.readFileSync(path.join(root, 'generated', 'api.json'), 'utf8') + fs.readFileSync(path.join(root, 'generated', 'framework.js'), 'utf8');
  assert.equal(a, b);
  assert.ok(!/\d{4}-\d{2}-\d{2}T/.test(a), 'no dates in the output');
});

test('a project with no framework folders still builds', async () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-api-empty-'));
  try {
    const api = await buildApi({ root: empty });
    assert.deepEqual(api.modules, []);
    assert.ok(api.actions.length > 0, 'the actions come from the site code, not the folders');
    await writeApi({ root: empty });
    assert.ok(fs.existsSync(path.join(empty, 'generated', 'framework.js')));
  } finally { fs.rmSync(empty, { recursive: true, force: true }); }
});

test('a module that cannot be loaded is left out and named, and the rest is still described', async () => {
  fs.writeFileSync(path.join(root, 'engine', 'broken.js'), "// Needs a file this copy does not have.\nimport { gone } from '../nowhere/gone.js';\n/** Uses it. */\nexport const use = () => gone;\n");
  try {
    const made = await buildApi({ root });
    assert.deepEqual(made.notLoaded.map((n) => n.file), ['engine/broken.js']);
    assert.match(made.notLoaded[0].why, /gone\.js/);
    assert.ok(!made.modules.some((m) => m.file === 'engine/broken.js'));
    assert.ok(made.modules.some((m) => m.name === 'shapes'));
    assert.match(await writeApi({ root }), /1 left out \(could not be loaded: engine\/broken\.js\)/);
    assert.ok(!fs.readFileSync(path.join(root, 'generated', 'framework.js'), 'utf8').includes('broken'));
  } finally { fs.rmSync(path.join(root, 'engine', 'broken.js')); }
  await writeApi({ root });
});

test('the build writes the reference to generated/api.md, never into docs/', async () => {
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  const guide = '# Guide\n\nWritten by hand.\n';
  fs.writeFileSync(path.join(root, 'docs', 'framework-api.md'), guide);
  await writeApi({ root });
  const made = await buildApi({ root });
  assert.equal(fs.readFileSync(path.join(root, 'generated', 'api.md'), 'utf8'), referenceMarkdown(made) + '\n');
  assert.equal(fs.readFileSync(path.join(root, 'docs', 'framework-api.md'), 'utf8'), guide, 'the hand-written guide is left alone');
});

// ---- the real project ---------------------------------------------------------------------------

const api = await buildApi({ root: REAL });

test('the real project: every entry is a real export and every real export has an entry', async () => {
  assert.equal(api.notLoaded, undefined, `every framework module of the real project loads: ${JSON.stringify(api.notLoaded)}`);
  assert.ok(api.modules.length >= 15, `found ${api.modules.length} modules`);
  for (const m of api.modules) {
    const real = await import(pathToFileURL(path.join(REAL, m.file)).href);
    assert.deepEqual(m.exports.map((e) => e.name).sort(), Object.keys(real).sort(), `${m.file}: api.json and the module disagree`);
    assert.ok(m.purpose, `${m.file}: the file needs a first comment line that says what it is for`);
    for (const e of m.exports) {
      const v = real[e.name];
      const kind = typeof v === 'function' ? (/^class\b/.test(Function.prototype.toString.call(v)) ? 'class' : 'function') : (v !== null && typeof v === 'object' && !Array.isArray(v) ? 'object' : 'constant');
      assert.equal(e.kind, kind, `${m.file}: ${e.name}`);
      if (kind === 'function') { assert.ok(Array.isArray(e.args), `${m.file}: ${e.name} has an argument list`); assert.ok(e.args.length >= v.length, `${m.file}: ${e.name} lists ${e.args.length} arguments, the function takes at least ${v.length}`); }
      assert.equal(typeof e.description, 'string');
    }
  }
});

test('the real project: the names an asset maker expects are there, and no page glue', () => {
  const names = api.modules.map((m) => m.name);
  for (const n of ['sprite', 'surface', 'color', 'motion', 'theme', 'sfx', 'soundTheme', 'analyze', 'wav', 'checkSprite', 'checkSound', 'schema']) assert.ok(names.includes(n), `${n} is missing from ${names.join(', ')}`);
  assert.equal(new Set(names).size, names.length, 'every module has its own name');
  for (const m of api.modules) assert.ok(!/player|worklet|worker/.test(m.file), `${m.file} is page glue`);
  const files = new Set(api.modules.map((m) => m.file));
  for (const folder of FRAMEWORK_FOLDERS) {
    for (const f of fs.readdirSync(path.join(REAL, folder)).filter((x) => x.endsWith('.js') && !x.startsWith('_'))) {
      const rel = `${folder}/${f}`;
      const verdict = isFrameworkSource(fs.readFileSync(path.join(REAL, rel), 'utf8'));
      assert.equal(files.has(rel), verdict.framework, `${rel}: ${verdict.why}`);
    }
  }
});

test('the reference table is made from api.json and names every module and export', () => {
  const md = referenceMarkdown(api);
  for (const m of api.modules) {
    assert.ok(md.includes(`loadout.framework.${m.name}`), m.name);
    for (const e of m.exports) assert.ok(md.includes(`\`${e.name}\``), `${m.name}.${e.name}`);
  }
  for (const a of api.actions) assert.ok(md.includes(a.name), a.name);
});

test('the hand-written guide points at the generated reference and holds no generated table', () => {
  const doc = fs.readFileSync(path.join(REAL, 'docs', 'framework-api.md'), 'utf8');
  assert.match(doc, /generated\/api\.md/);
  assert.ok(!/\| Export \| Kind \|/.test(doc), 'the export tables belong in generated/api.md');
});
