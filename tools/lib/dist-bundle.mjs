// The site's generator registry as one file in dist/ (build --dist only; the source stays one module per family).
// engine/gen/index.js imports every generator family, about 220 modules, and the first sprite any page draws loads them
// all: 220 requests arriving one import level at a time. Here, in dist/ only, index.js and the family modules only it
// reaches become one file. What stays a file of its own, at its own address, so every importer shares one instance:
// every module outside engine/gen/ (engine/resolve.js, engine/motion.js ...), the registry itself (registry.js: one
// registry for the whole page), and every engine/gen/ module that a module outside engine/gen/ imports, with what it
// imports (args.js, tiles-clips.js ...). Generators call each other by name at draw time, so loading families on demand
// would need a list of who calls whom; one file that registers them all keeps the registry exactly as the source fills it.
//
//   await bundleGenerators(distDir)   // -> { bundled, kept, before, after } (bytes), or throws
import fs from 'node:fs';
import path from 'node:path';

// a relative import or export in a module (comments stripped first): from './x.js', import './x.js', export ... from
const IMPORT = /(?:^|[\s;])(?:import|export)\s*(?:[\w*{}\s,$]+?\s*from\s*)?["'](\.{1,2}\/[^"']+)["']/gm;
const DYNAMIC = /\bimport\s*\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g;
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** The modules a module names by relative address, static and dynamic, as absolute paths that exist. */
function importsOf(file) {
  const src = strip(fs.readFileSync(file, 'utf8'));
  const out = [];
  for (const re of [IMPORT, DYNAMIC]) for (const m of src.matchAll(re)) {
    const g = path.resolve(path.dirname(file), m[1].split('?')[0]);
    if (fs.existsSync(g)) out.push(g);
  }
  return out;
}

function jsFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'vendor' && e.name !== 'node_modules') jsFiles(f, out); } else if (e.name.endsWith('.js') || e.name.endsWith('.mjs')) out.push(f);
  }
  return out;
}

/** Bundle dist/engine/gen/index.js in place (see the top of this file). Arguments: dist (the dist/ folder). */
export async function bundleGenerators(distDir) {
  const { build } = await import('esbuild');
  const dist = fs.realpathSync(distDir);     // esbuild hands back real paths (macOS: /var is /private/var), so compare real ones
  const gen = path.join(dist, 'engine', 'gen');
  const entry = path.join(gen, 'index.js');
  if (!fs.existsSync(entry)) return { bundled: 0, kept: 0, before: 0, after: 0 };
  // index.js is rewritten in place: it must be a real file of dist/ itself, never a link back to the source
  if (fs.realpathSync(entry) !== entry) throw new Error(`${entry} is not a file of ${distDir} itself (a link?): not bundled`);
  const inGen = (f) => f.startsWith(gen + path.sep);

  // kept: registry.js, the engine/gen/ modules imported from outside engine/gen/ (index.js aside), and all they reach in engine/gen/
  const kept = new Set([path.join(gen, 'registry.js')]);
  for (const f of jsFiles(dist)) if (!inGen(f)) for (const g of importsOf(f)) if (inGen(g) && g !== entry) kept.add(g);
  const queue = [...kept];
  while (queue.length) for (const g of importsOf(queue.shift())) if (inGen(g) && g !== entry && !kept.has(g)) { kept.add(g); queue.push(g); }

  const bundledFiles = new Set();
  const external = {
    name: 'loadout-external',
    setup(b) {
      b.onResolve({ filter: /^\.{1,2}\// }, (a) => {
        const abs = path.resolve(a.resolveDir, a.path);
        if (inGen(abs) && !kept.has(abs) && abs !== entry) { bundledFiles.add(abs); return { path: abs }; }
        if (abs === entry && a.importer && a.importer !== entry) return { path: abs };   // a family importing index.js: the bundle itself
        // the output sits where index.js sits, so the address is rewritten relative to engine/gen/
        let to = path.relative(gen, abs).split(path.sep).join('/');
        if (!to.startsWith('.')) to = './' + to;
        return { path: to, external: true };
      });
    },
  };
  const before = fs.statSync(entry).size;
  const r = await build({ entryPoints: [entry], bundle: true, format: 'esm', target: 'es2022', minify: true, legalComments: 'none', write: false, plugins: [external], logLevel: 'silent' });
  const code = r.outputFiles[0].text;
  fs.writeFileSync(entry, code);
  return { bundled: bundledFiles.size, kept: kept.size, before, after: code.length };
}
