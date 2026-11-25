// R3b: no sprite drawing code is left in engine/ (outside engine/gen/) that no live code uses. Keyang's stop rule: "no
// sprite drawing code remains outside the framework's renderers and generators" (docs/data-sprites.md section 5, rows R3
// and R3b). A module directly in engine/ is one of:
//
//   FRAMEWORK   the renderers, the data pipeline and the colour, motion, surface and palette basics (section 5, "What
//               stays framework code"): nothing is asked of its exports here;
//   HELPER      a module that is not framework but has a live caller: a generator or port in engine/gen/, the app, a tool,
//               the quality bar, the catalogue, or another engine module that is itself live.
//
// So for every module that is not FRAMEWORK, every export must be imported (or re-exported, or reached through a
// namespace import or a dynamic import of the module) by a live file: a file that is not a test, not a test fixture and
// not a frozen code copy (tests/fixtures/code-sprites/). An export whose only importers are tests and frozen copies is
// drawing code that nothing draws with any more; it goes, with the tests that were only about it.
//
// The scan has no parser (it reads declarations that start in column 0 and the names each one mentions), so it runs where
// only Node is, and is a floor: it follows a name from a live file through the helper modules (a declaration only another
// dead declaration mentions is dead too) but over-counts a name that is also a word in a string. The same question was
// answered with a babel script by the item's report (declaration by declaration, the test files and frozen copies as
// callers that do not count). KEPT below lists what a frozen copy that a kept test reads still needs; it names the copy
// and the test, and stays as short as it can.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** engine/*.js modules that are framework (docs/data-sprites.md section 5): their exports are not held to a live caller here. */
const FRAMEWORK = new Set(['sprite', 'surface', 'color', 'motion', 'palettes', 'materials', 'theme', 'styles', 'sheet-info', 'versions',
  'tile-rules', 'tiles', 'data-sprite', 'draw-list', 'resolve', 'pieces', 'data-rules', 'data-frames']);

/** Exports kept although only a test or a frozen copy imports them: { 'engine/x.js': { name: 'kept for frozen copy <id> read by <test>' } }. */
const KEPT = {};

const LIVE_DIRS = ['app', 'catalog', 'quality', 'sound', 'rigs', 'tools', 'engine'];
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const stripStrings = (s) => s.replace(/'(?:\\.|[^'\\\n])*'/g, "''").replace(/"(?:\\.|[^"\\\n])*"/g, '""');

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'generated' || e.name === 'vendor') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.m?js$/.test(e.name)) out.push(p);
  }
  return out;
}

/** What one file takes from each module it imports: Map(abs module path -> { names: Map(local -> imported), whole: bool }); whole = a namespace, `export *` or dynamic import (all of the module). */
function importsOf(file, code) {
  const out = new Map();
  const at = (spec) => { if (!spec.startsWith('.')) return null; const abs = path.resolve(path.dirname(file), spec.split('?')[0]); if (!out.has(abs)) out.set(abs, { names: new Map(), whole: false }); return out.get(abs); };
  for (const m of code.matchAll(/(?:import|export)\s*(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) { const e = at(m[2]); if (e) for (const part of m[1].split(',')) { const [a, b] = part.trim().split(/\s+as\s+/); if (a) e.names.set(b ?? a, a); } }
  for (const m of code.matchAll(/import\s*\*\s*as\s+[\w$]+\s+from\s*['"]([^'"]+)['"]/g)) { const e = at(m[1]); if (e) e.whole = true; }
  for (const m of code.matchAll(/export\s*\*(?:\s*as\s+[\w$]+)?\s*from\s*['"]([^'"]+)['"]/g)) { const e = at(m[1]); if (e) e.whole = true; }
  for (const m of code.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) { const e = at(m[1]); if (e) e.whole = true; }
  for (const m of code.matchAll(/^import\s*['"]([^'"]+)['"]/gm)) { const e = at(m[1]); if (e) e.whole = true; }
  return out;
}

/** A module read as declarations: { decls: Map(name -> { exported: [names], text }), top: text of the statements that are no declaration }. */
function declsOf(text) {
  const code = stripStrings(stripComments(text)), lines = code.split('\n'), decls = new Map(), tops = [];
  let cur = null;
  const flush = () => { if (!cur) return; const t = cur.lines.join('\n'); if (cur.names.length) for (const n of cur.names) decls.set(n, { exported: cur.exp ? [n] : [], text: t }); else if (!/^\s*import\b/.test(t)) tops.push(t); cur = null; };
  for (const line of lines) {
    if (/^[A-Za-z_$]/.test(line)) {
      flush();
      const m = line.match(/^(export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/);
      cur = { lines: [line], names: m ? [m[2]] : [], exp: !!(m && m[1]) };
      const multi = line.match(/^(?:export\s+)?(?:const|let|var)\s+\{([^}]*)\}\s*=/);
      if (multi) cur.names = multi[1].split(',').map((x) => x.trim().split(/[:\s=]+/).pop()).filter(Boolean);
    } else if (cur) cur.lines.push(line);
  }
  flush();
  for (const m of code.matchAll(/^export\s*\{([^}]*)\}\s*(?!from)/gm)) for (const part of m[1].split(',')) { const [a, b] = part.trim().split(/\s+as\s+/); if (decls.has(a)) decls.get(a).exported.push(b ?? a); }
  return { decls, top: tops.join('\n') };
}

const words = (text) => new Set(text.match(/[A-Za-z_$][\w$]*/g) ?? []);

const engineDir = path.join(ROOT, 'engine');
const modules = fs.readdirSync(engineDir).filter((f) => f.endsWith('.js')).map((f) => f.replace(/\.js$/, '')).sort();
const helperFiles = new Set(modules.filter((m) => !FRAMEWORK.has(m)).map((m) => path.join(engineDir, m + '.js')));
const read = new Map();
const code = (f) => { if (!read.has(f)) read.set(f, stripComments(fs.readFileSync(f, 'utf8'))); return read.get(f); };

// the files that count as live callers: everything but tests, fixtures and frozen copies (the tests/ folder is not walked)
const liveFiles = LIVE_DIRS.flatMap((d) => walk(path.join(ROOT, d))).filter((f) => !/\.test\.m?js$/.test(f));
const mod = new Map([...helperFiles].map((f) => [f, { ...declsOf(fs.readFileSync(f, 'utf8')), imports: importsOf(f, code(f)) }]));

/** Which declarations of each helper module a live caller reaches: Map(abs file -> Set(name)), followed through the helper modules. */
function reached() {
  const live = new Map([...helperFiles].map((f) => [f, new Set()])), touched = new Set(), queue = [];
  const want = (f, name) => { if (!live.has(f)) return; if (name === '*') { for (const n of mod.get(f).decls.keys()) want(f, n); touch(f); return; } if (!mod.get(f).decls.has(name) || live.get(f).has(name)) return; live.get(f).add(name); queue.push([f, name]); touch(f); };
  const useFrom = (importer, words_, imports) => { for (const [abs, e] of imports) { if (!live.has(abs)) continue; if (e.whole) want(abs, '*'); for (const [local, imported] of e.names) if (words_.has(local)) want(abs, imported); } };
  const touch = (f) => { if (touched.has(f)) return; touched.add(f); const m = mod.get(f); useFrom(f, words(m.top), m.imports); for (const n of words(m.top)) if (m.decls.has(n)) want(f, n); };
  for (const f of liveFiles) {
    if (helperFiles.has(f)) continue;
    const imports = importsOf(f, code(f));
    for (const [abs, e] of imports) { if (!live.has(abs)) continue; if (e.whole) want(abs, '*'); else for (const imported of e.names.values()) want(abs, imported); }
  }
  while (queue.length) {
    const [f, name] = queue.pop(), m = mod.get(f), w = words(m.decls.get(name).text);
    for (const n of w) if (n !== name && m.decls.has(n)) want(f, n);
    useFrom(f, w, m.imports);
  }
  return { live, touched };
}
const { live, touched } = reached();

test('engine/ holds only framework modules and modules a live file reaches', () => {
  const idle = [...helperFiles].filter((f) => !touched.has(f)).map((f) => path.relative(ROOT, f));
  assert.deepEqual(idle, [], `modules in engine/ that nothing live uses (drawing code nothing draws with): ${idle.join(', ')}`);
});

test('every declaration of a helper module in engine/ is reached from a live file, not only from tests and frozen copies', () => {
  const dead = [];
  for (const f of helperFiles) {
    const rel = path.relative(ROOT, f);
    for (const [name] of mod.get(f).decls) {
      if (live.get(f).has(name) || KEPT[rel]?.[name]) continue;
      dead.push(`${rel} ${name}`);
    }
  }
  assert.deepEqual(dead, [], `declarations that only tests, frozen copies and other dead declarations use: ${dead.join('; ')}`);
});

test('KEPT names a frozen copy and a test for each declaration it keeps, and every declaration it names still exists', () => {
  for (const [file, names] of Object.entries(KEPT)) {
    const m = mod.get(path.join(ROOT, file));
    assert.ok(m, `${file} is not a helper module in engine/: take it out of KEPT`);
    for (const [name, why] of Object.entries(names)) {
      assert.ok(m.decls.has(name), `${file} no longer has ${name}: take it out of KEPT`);
      assert.match(why, /frozen copy \S+ read by \S+/, `${file} ${name}: say which frozen copy and which test keep it`);
    }
  }
});

/** Every file directly in engine/ and why it is there. A new file here is drawing code creeping back unless it is a framework module: put drawing in engine/gen/ (a generator) or pieces/ (data) instead, or add the file here with its reason. */
const ALLOWED = {
  // framework (section 5)
  'sprite': 'framework', 'surface': 'framework', 'color': 'framework', 'motion': 'framework', 'palettes': 'framework', 'materials': 'framework',
  'theme': 'framework', 'styles': 'framework', 'flat': 'framework (the flat style: rewrites a draw list for the renderer)', 'sheet-info': 'framework', 'versions': 'framework', 'tile-rules': 'framework', 'tiles': 'framework (picker) and what generators draw tiles with',
  'data-sprite': 'framework', 'draw-list': 'framework', 'resolve': 'framework', 'pieces': 'framework', 'data-rules': 'framework', 'data-frames': 'framework',
  // used by the app, the tools or the quality bar
  'maptext': 'helper: app/tools', 'fences': 'helper: generators', 'backdrop': 'helper: tools/app', 'fx': 'helper: generators', 'creature': 'helper: generators', 'pixel-font': 'helper: font generators',
  'ui': 'helper: pixel-font and generators', 'text-fx': 'helper: tools', 'shapes': 'helper: generators', 'marks': 'helper: rules',
  // colour helpers named by engine/data-rules.js
  'tones': 'colour rule', 'ground': 'colour rule', 'hue-tones': 'colour rule', 'look-tones': 'colour rule', 'paving': 'colour rule', 'solids': 'helper', 'bulkhead': 'helper',
  // generator-only helpers
  'ooze': 'generators', 'shafts': 'generators', 'plating': 'generators', 'ripples': 'generators', 'rock': 'generators', 'water': 'generators', 'crystals': 'generators',
  'pickups': 'generators', 'mech': 'generators', 'breaking': 'generators', 'buildings': 'generators', 'dungeon': 'generators',
};
test('engine/ has no file that is not listed in ALLOWED, and every listed file exists', () => {
  assert.deepEqual(modules.filter((m) => !(m in ALLOWED)), [], 'a new module directly in engine/: sprite drawing code belongs in engine/gen/ or in a data file');
  assert.deepEqual(Object.keys(ALLOWED).filter((m) => !modules.includes(m)), [], 'a module that went: take it out of ALLOWED');
});

test('the framework modules are the ones docs/data-sprites.md section 5 lists, and each exists', () => {
  for (const m of FRAMEWORK) assert.ok(fs.existsSync(path.join(engineDir, m + '.js')), `engine/${m}.js is on the framework list but missing`);
});
