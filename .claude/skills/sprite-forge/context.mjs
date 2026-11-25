#!/usr/bin/env node
// Live context for the sprite-forge skill: everything that changes as Loadout grows is READ from the project at run
// time, never copied into SKILL.md. Run from anywhere:
//
//   node skills/sprite-forge/context.mjs            overview: contracts, bodies, generators, pieces, data examples, drift
//   node skills/sprite-forge/context.mjs contracts  every contract heading in docs/architecture.md (read the ones that touch your asset)
//   node skills/sprite-forge/context.mjs bodies     the six kinds of body: built (a layout draws it: rig, or a family-'layout' generator
//                                                   with that id in the registry, as engine/data-sprite.js layoutFor) or coming, with its build item
//   node skills/sprite-forge/context.mjs generators [family]   every named generator (id@v, family, what it draws), from the live registry
//   node skills/sprite-forge/context.mjs pieces     every shared piece in pieces/ (bases, parts, held things, skins, materials, fonts, stamps)
//   node skills/sprite-forge/context.mjs examples [type]       data sprites to copy from (sprites/*.json and tests/fixtures/v2), with their body and whether they draw today
//   node skills/sprite-forge/context.mjs examples --code [type]  the frozen code sprites (tests/fixtures/code-sprites/*.js; sprites/ holds data only) by type: what a redraw starts from
//   node skills/sprite-forge/context.mjs verify     every path, tool, generator and body status SKILL.md names is still true, and the
//                                                   loadout-maker agent does not contradict it; DRIFT if the docs moved on
//   node --test skills/sprite-forge/context.test.mjs   the verify helpers on fake registries and texts
//
// The project is the folder given with --root <dir>, else the current folder when it is a Loadout project (it has
// engine/gen/registry.js and tools/check.mjs: a scratch copy works), else the repository root, three folders above this file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const ri = argv.indexOf('--root');
const isLoadout = (d) => fs.existsSync(path.join(d, 'engine/gen/registry.js')) && fs.existsSync(path.join(d, 'tools/check.mjs'));
const root = ri >= 0 ? path.resolve(argv[ri + 1]) : isLoadout(process.cwd()) ? process.cwd() : path.resolve(here, '../../..');
const args = argv.filter((a, i) => a !== '--root' && argv[i - 1] !== '--root');
const rel = (p) => path.join(root, p);
const read = (p) => (fs.existsSync(rel(p)) ? fs.readFileSync(rel(p), 'utf8') : '');
const mtime = (p) => (fs.existsSync(p) ? fs.statSync(p).mtimeMs : 0);
const day = (ms) => new Date(ms).toISOString().slice(0, 10);
const load = (p) => import(pathToFileURL(rel(p)).href);

/** The headings of docs/architecture.md that a maker reads (contracts, hard rules, mission, layout). */
function contracts() {
  return read('docs/architecture.md').split('\n').filter((l) => /^## (Contract|Hard rules|Mission|Layout)/.test(l)).map((l) => l.slice(3));
}

/** Which bodies draw, decided as engine/data-sprite.js layoutFor does: a rig always; any other kind once the registry
 *  holds a generator of family "layout" with that id and a run (pictures also has a built-in layout). The build item
 *  comes from NOT_BUILT_BODIES for the message only, never for the decision: that table is frozen and owned by no layout
 *  builder. Pure, so context.test.mjs can feed it a fake registry. Returns [{ kind, built, item, by }]. */
export function bodyStates(kinds, generators, notBuilt = {}) {
  const layouts = new Map();
  for (const g of Array.isArray(generators) ? generators : []) {
    if (g && g.family === 'layout' && typeof g.id === 'string' && Number.isFinite(g.v) && typeof g.run === 'function' && !(layouts.get(g.id)?.v > g.v)) layouts.set(g.id, g);
  }
  return kinds.map((kind) => {
    const L = layouts.get(kind);
    const by = kind === 'rig' ? 'bones' : L ? `${kind}@${L.v}` : kind === 'pictures' ? 'built-in' : null;
    return { kind, built: by !== null, item: by ? null : notBuilt[kind] ?? '?', by };
  });
}

/** The six bodies with their state, from catalog/sprite-schema.js and the live registry (bodyStates). */
async function bodies() {
  const { BODY_KINDS } = await load('catalog/sprite-schema.js');
  let notBuilt = {};
  try { ({ NOT_BUILT_BODIES: notBuilt = {} } = await load('engine/data-sprite.js')); } catch { /* names only */ }
  return bodyStates(BODY_KINDS, (await load('engine/gen/index.js')).generators(), notBuilt);
}

/** Every generator of the live registry: [{ key, id, v, family, about, note }] (note: generatorNotes, '' for most). */
async function generatorList() {
  const reg = await load('engine/gen/index.js');
  const fixed = reg.ORIGIN_FIXED ?? {}, frame = reg.FRAME_GENERATORS ?? {};
  return reg.generators().map((g) => { const key = g.key ?? `${g.id}@${g.v}`; return { key, id: g.id, v: g.v, family: g.family, about: g.about, note: generatorNotes(key, fixed, frame) }; });
}

/** What a maker must know about one generator version beyond its about line: superseded (engine/gen/index.js ORIGIN_FIXED: it loses what lies left of or above a node's origin) or frame pixels only (FRAME_GENERATORS). '' otherwise. Pure. */
export function generatorNotes(key, originFixed = {}, frameGenerators = {}) {
  if (Object.hasOwn(originFixed, key)) return `[old: draws only at 0 and up, so not centred on a node; use ${key.split('@')[0]}@${originFixed[key]}]`;
  if (Object.hasOwn(frameGenerators, key)) return `[frame pixels only: ${frameGenerators[key]}]`;
  return '';
}

/** Calls written in a text ("gen": "<id>", "v": <n>) to a version ORIGIN_FIXED supersedes, as STALE lines; a version named in prose (`gem.cut@1`) is fine. Pure. */
export function supersededIssues(text, originFixed = {}) {
  const bad = [];
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/"gen":\s*"([a-z][a-zA-Z0-9.-]*)",\s*"v":\s*(\d+)/g)) {
      const key = `${m[1]}@${m[2]}`;
      if (Object.hasOwn(originFixed, key)) bad.push(`SKILL.md line ${i + 1}: a call to ${key}, which draws only at 0 and up: write ${m[1]}@${originFixed[key]}`);
    }
  });
  return bad;
}

/** Every piece file in pieces/: [{ ref, kind, file }] from the file names (pieces/<kind>-<name>.v<v>.json). */
function pieceList() {
  if (!fs.existsSync(rel('pieces'))) return [];
  return fs.readdirSync(rel('pieces')).map((f) => /^([a-z]+)-([a-z0-9-]+)\.v(\d+)\.json$/.exec(f)).filter(Boolean)
    .map((m) => ({ ref: `${m[1]}:${m[2]}@${m[3]}`, kind: m[1], file: `pieces/${m[0]}` })).sort((a, b) => a.ref.localeCompare(b.ref));
}

/** Data sprites to copy from: sprites/*.json, then the committed fixtures tests/fixtures/v2/**. Each { file, id, type, body, draws, why }. */
async function dataExamples(only) {
  const files = [];
  if (fs.existsSync(rel('sprites'))) files.push(...fs.readdirSync(rel('sprites')).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort().map((f) => 'sprites/' + f));
  const walk = (d) => { if (!fs.existsSync(rel(d))) return; for (const f of fs.readdirSync(rel(d)).sort()) { const p = d + '/' + f; if (fs.statSync(rel(p)).isDirectory()) walk(p); else if (f.endsWith('.json')) files.push(p); } };
  walk('tests/fixtures/v2');
  let loadDataSprite = null;
  try { ({ loadDataSprite } = await load('tools/lib/assets.mjs')); } catch { /* an older project: no data loader */ }
  const out = [];
  for (const file of files) {
    let d; try { d = JSON.parse(read(file)); } catch { continue; }
    if (d?.format !== 'loadout-sprite') continue;
    const type = d.meta?.type ?? '?';
    if (only && type !== only) continue;
    const body = d.body && typeof d.body === 'object' ? Object.keys(d.body)[0] : '?';
    let draws = false, why = '';
    if (loadDataSprite) { try { await loadDataSprite(root, rel(file)); draws = true; } catch (e) { why = String(e.message).replace(/^[^:]*: /, '').slice(0, 140); } }
    out.push({ file, id: d.id, type, body, draws, why });
  }
  return out;
}

const FROZEN = 'tests/fixtures/code-sprites';
/** The frozen code sprites (tests/fixtures/code-sprites/*.js: sprites/ holds data only) by meta.type, with the rigs they import: the sources a redraw starts from. */
export function codeExamples(only) {
  const by = {};
  if (!fs.existsSync(rel(FROZEN))) return only ? { [only]: [] } : by;
  for (const f of fs.readdirSync(rel(FROZEN)).filter((f) => f.endsWith('.js')).sort()) {
    const src = read(`${FROZEN}/${f}`), t = /type: '([a-z-]+)'/.exec(src)?.[1] ?? '?', rigUse = [...src.matchAll(/from '(?:\.\.\/)+rigs\/([a-z-]+)\.js'/g)].map((m) => m[1]);
    (by[t] ??= []).push(f.slice(0, -3) + (rigUse.length ? ` [${[...new Set(rigUse)].join('+')}]` : ''));
  }
  return only ? { [only]: by[only] ?? [] } : by;
}

/** Rule documents newer than SKILL.md: a maker reads them and trusts them over the skill. */
function drift() {
  const skill = path.join(here, 'SKILL.md'), warn = [];
  for (const d of ['docs/architecture.md', 'docs/data-sprites.md', 'docs/style-guide.md', 'docs/quality-bar.md']) {
    if (mtime(rel(d)) > mtime(skill)) warn.push(`${d} changed ${day(mtime(rel(d)))}, after SKILL.md (${day(mtime(skill))}): read it, and trust it over SKILL.md`);
  }
  return warn;
}

/** The fenced blocks of a markdown text: [{ lang, body, line }]. */
function fenced(text) {
  const out = [], lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^```(\w*)\s*$/.exec(lines[i]);
    if (!m) continue;
    const start = i, body = [];
    for (i++; i < lines.length && !/^```\s*$/.test(lines[i]); i++) body.push(lines[i]);
    out.push({ lang: m[1], body: body.join('\n'), line: start + 1 });
  }
  return out;
}

/** What in SKILL.md / SOUND.md is no longer true: missing paths and tools, unknown generators, JSON that does not parse, body states that changed. */
async function verify() {
  const bad = [];
  const gens = new Set((await generatorList()).map((g) => g.key));
  const state = Object.fromEntries((await bodies()).map((b) => [b.kind, b]));
  const bases = pieceList().filter((p) => p.kind === 'base');
  for (const file of ['SKILL.md', 'SOUND.md']) {
    const text = fs.readFileSync(path.join(here, file), 'utf8');
    for (const m of text.matchAll(/`((?:docs|engine|rigs|sound|quality|tools|sprites|sounds|bundles|catalog|tests|generated|pieces)\/[A-Za-z0-9_./@-]+\.(?:md|js|mjs|json))`/g)) {
      if (m[1].includes('<')) continue;
      if (!fs.existsSync(rel(m[1]))) bad.push(`${file}: \`${m[1]}\` does not exist`);
    }
    for (const m of text.matchAll(/node (tools\/[a-z-]+(?:\/[a-z-]+)?\.mjs)/g)) if (!fs.existsSync(rel(m[1]))) bad.push(`${file}: tool ${m[1]} does not exist`);
    if (file !== 'SKILL.md') continue;
    // generators named as calls or as id@v must be in the registry, unless the line says they are coming
    text.split('\n').forEach((line, i) => {
      if (/coming|not built|not yet|illustration/i.test(line)) return;
      const named = [...line.matchAll(/"gen":\s*"([a-z][a-zA-Z0-9.-]*)",\s*"v":\s*(\d+)/g)].map((m) => `${m[1]}@${m[2]}`)
        .concat([...line.matchAll(/`([a-z][a-zA-Z0-9.-]*@\d+)`/g)].map((m) => m[1]).filter((k) => !/^(base|part|held|skin|material|font|stamp):/.test(k)));
      for (const k of named) if (!gens.has(k)) bad.push(`SKILL.md line ${i + 1}: generator ${k} is not in the registry (node tools/gen.mjs lists them)`);
    });
    // every json block parses (a fragment of fields is read inside braces)
    for (const b of fenced(text).filter((b) => b.lang === 'json')) {
      let ok = false;
      for (const t of [b.body, `{${b.body}}`]) { try { JSON.parse(t); ok = true; break; } catch { /* next */ } }
      if (!ok) bad.push(`SKILL.md line ${b.line}: the json block does not parse`);
    }
    bad.push(...bodyTableIssues(text, Object.values(state)));
    bad.push(...supersededIssues(text, (await load('engine/gen/index.js')).ORIGIN_FIXED ?? {}));
    if (bases.length && /bases?[^\n]{0,80}coming[^\n]{0,40}B16/i.test(text)) bad.push(`SKILL.md: says base pieces are coming (B16), but pieces/ has ${bases.map((b) => b.ref).join(', ')}`);
  }
  // the agent every maker is sent through (.claude/agents/loadout-maker.md in the workspace) must not contradict the skill
  const agent = path.resolve(here, '../../agents/loadout-maker.md');
  if (fs.existsSync(agent)) bad.push(...agentIssues(fs.readFileSync(agent, 'utf8'), (p) => fs.existsSync(rel(p))).map((l) => `.claude/agents/loadout-maker.md: ${l}`));
  return bad;
}

/** What the body table of SKILL.md (rows "| `kind` | for | today |") says wrongly against states from bodyStates. */
export function bodyTableIssues(text, states) {
  const bad = [];
  for (const { kind, built, item, by } of states) {
    const row = text.split('\n').find((l) => l.startsWith(`| \`${kind}\` |`));
    if (!row) { bad.push(`SKILL.md: no row "| \`${kind}\` |" in the body table`); continue; }
    const saysComing = /^coming/i.test(row.split('|').map((c) => c.trim()).filter(Boolean).at(-1) ?? '');
    if (built && saysComing) bad.push(`SKILL.md: the \`${kind}\` row says coming, but the engine draws it now (layout ${by} is in the registry): write its recipe and mark it built`);
    if (!built && !saysComing) bad.push(`SKILL.md: the \`${kind}\` row says built, but no layout draws it (build item ${item})`);
    if (!built && !row.includes(item)) bad.push(`SKILL.md: the \`${kind}\` row does not name its build item ${item}`);
  }
  return bad;
}

/** What the loadout-maker agent prompt says that the data-sprite skill contradicts: writing sprites/<id>.js, a ban on
 *  renaming that a redraw needs, and paths that do not exist. `exists(p)` answers for a project path. */
export function agentIssues(text, exists = () => true) {
  const bad = [];
  if (text.split('\n').some((l) => /sprites\/<id>\.js/.test(l) && !/_was-|sprites\/<id>\.json/.test(l))) bad.push('tells makers to write sprites/<id>.js; the skill writes sprites/<id>.json and never a .js');
  if (/never edit, rename/i.test(text) && !/_was-/.test(text)) bad.push('forbids renaming assets, but a redraw renames sprites/<id>.js to sprites/_was-<id>.js (SKILL.md section 8)');
  const named = new Set();
  for (const m of text.matchAll(/`((?:tools|generated|engine|docs|pieces|rigs)\/[A-Za-z0-9_./-]+\.(?:mjs|js|json|md))`/g)) named.add(m[1]);
  for (const m of text.matchAll(/`node (tools\/[A-Za-z0-9_./-]+\.mjs)\b[^`]*`/g)) named.add(m[1]);
  for (const p of named) if (!exists(p)) bad.push(`names ${p}, which does not exist`);
  const lines = text.split('\n');
  if (lines.some((l) => /tools\/rig\.mjs/.test(l) && !/studio-templates/.test(l))) bad.push('sends makers to `node tools/rig.mjs` for rigs; a data sprite starts its rig from rigs/studio-templates.js and the bases in pieces/ (SKILL.md section 5)');
  if (lines.some((l) => /pixel-fingerprint/i.test(l) && !/golden/i.test(l))) bad.push('asks for the before/after pixel-fingerprint check; a framework addition is a new generator version with a golden output (Contracts 11 and 15, SKILL.md section 9)');
  return bad;
}

const main = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const [cmd, ...rest] = main ? args : ['--imported'];
const arg = rest.find((a) => !a.startsWith('--'));
if (!main) { /* imported by context.test.mjs: the pure helpers only */ }
else if (cmd === 'contracts') console.log(contracts().join('\n'));
else if (cmd === 'bodies') for (const b of await bodies()) console.log(`${b.kind.padEnd(9)} ${b.built ? `built (layout ${b.by})` : `coming (build item ${b.item})`}`);
else if (cmd === 'generators') {
  const by = {};
  for (const g of await generatorList()) if (!arg || g.family === arg) (by[g.family] ??= []).push(g);
  for (const [fam, list] of Object.entries(by)) { console.log(fam); for (const g of list) console.log(`  ${g.key.padEnd(18)} ${g.about}${g.note ? `\n  ${''.padEnd(18)} ${g.note}` : ''}`); }
  console.log('\nnode tools/gen.mjs <gen> for its arguments, --sheet to see it');
} else if (cmd === 'pieces') {
  const list = pieceList();
  console.log(list.length ? list.map((p) => `${p.ref.padEnd(28)} ${p.file}`).join('\n') : 'no pieces yet (pieces/ holds only README.md and _pins.json)');
  console.log('\nnode tools/piece.mjs <kind:name> for one, --sheet to see it');
} else if (cmd === 'examples') {
  if (rest.includes('--code')) for (const [t, l] of Object.entries(codeExamples(arg))) console.log(`${t} (${l.length}): ${l.join(', ')}`);
  else for (const e of await dataExamples(arg)) console.log(`${e.file.padEnd(40)} ${e.type.padEnd(10)} body ${e.body.padEnd(9)} ${e.draws ? 'draws today' : 'does not draw yet: ' + e.why}`);
} else if (cmd === 'verify') {
  const bad = await verify(), warn = drift();
  [...bad.map((l) => 'STALE  ' + l), ...warn.map((l) => 'DRIFT  ' + l)].forEach((l) => console.log(l));
  console.log(bad.length ? `\n${bad.length} stale reference(s): fix SKILL.md / SOUND.md (lines marked .claude/agents/loadout-maker.md: fix the maker agent)` : '\nAll named paths, tools, generators and body states hold.');
  process.exit(bad.length ? 1 : 0);
} else {
  console.log(`PROJECT ${root}`);
  console.log('\nCONTRACTS (docs/architecture.md; read each that touches your asset)\n  ' + contracts().join('\n  '));
  console.log('\nBODIES: ' + (await bodies()).map((b) => `${b.kind} ${b.built ? 'built' : 'coming ' + b.item}`).join(', '));
  const gens = await generatorList(), fams = {};
  for (const g of gens) fams[g.family] = (fams[g.family] ?? 0) + 1;
  console.log(`\nGENERATORS (${gens.length}): ` + Object.entries(fams).map(([f, n]) => `${f} ${n}`).join(', ') + '   [list: context.mjs generators]');
  console.log(`\nPIECES (${pieceList().length}): ` + (pieceList().map((p) => p.ref).join(', ') || 'none yet') + '   [context.mjs pieces]');
  const data = await dataExamples();
  console.log(`\nDATA EXAMPLES (${data.length}): ` + data.map((e) => `${e.file} (${e.type}, ${e.body}${e.draws ? '' : ', not drawn yet'})`).join(', ') + '   [context.mjs examples <type>]');
  console.log('\nFROZEN CODE SPRITES BY TYPE (tests/fixtures/code-sprites: what redraws start from): ' + Object.entries(codeExamples()).map(([t, l]) => `${t} ${l.length}`).join(', ') + '   [context.mjs examples --code <type>]');
  const w = drift();
  console.log('\nDRIFT: ' + (w.length ? '\n  ' + w.join('\n  ') : 'none'));
}
