#!/usr/bin/env node
// The framework describes itself (docs/architecture.md, Contract 11). Finds the framework modules by scanning
// folders, reads what each exports and the comment above each export, and writes:
//
//   generated/api.json        every module (name, file, one-line purpose) and every export (name, kind, arguments,
//                             one-line description), plus the site's high-level actions as MCP tools
//                             (name, description, inputSchema), copied from ACTIONS in app/api.js
//   generated/framework.js    one module that re-exports every framework module under its short name; the site
//                             loads it as window.loadout.framework
//   generated/api.md          the same description as a page to read: every action, module and export in tables
//                             (docs/framework-api.md is the hand-written guide and points here)
//
//   node tools/lib/api.mjs [--root <dir>]      write the three files (the build does this in its "framework" step)
//   node tools/lib/api.mjs --undescribed       print the exported functions that have no description, as JSON
//
// WHICH FILES ARE FRAMEWORK. There is no list. A `.js` file directly in engine/, rigs/, sound/, quality/ or catalog/
// (the metadata rules) whose name does not start with "_" is a framework module when both are true:
//   1. it exports something, and
//   2. it runs anywhere: its code does not use a page (window. / document.), a worker's message port
//      (self.onmessage, self.postMessage, importScripts) or Web Audio (AudioContext, AudioWorklet*, registerProcessor).
// So the sound engine, looks, analysis and WAV writing are framework; the page's player, its render worker and its
// worklet are not. A file can overrule the test with a comment in its first 12 lines:
//   // loadout: framework          or          // loadout: not framework
//
// SHORT NAMES. One rule: the file name without ".js" and without a trailing "-engine", in camelCase
// (sfx-engine.js -> sfx). Modules in quality/ get the prefix "check" (quality/sprite.js -> checkSprite). If two
// modules would still share a name, the one in the later folder (order: engine, rigs, sound, quality, catalog) gets its
// folder name in front (sound/theme.js -> soundTheme). catalog/schema.js is `schema`.
//
// DESCRIPTIONS. The one line comes from the comment directly above the export (no blank line between):
//   /** One sentence that says what it does. Then its arguments, as many lines as needed. */
// A block of // lines directly above also counts, and so does a // comment at the end of a one-line export.
// The first sentence is the description; the whole comment is kept as "doc". A comment that starts with a
// call form (`name(...)`) is not a sentence and does not count. An export passed on from another framework module
// (export { ramp } from '../engine/color.js') takes the description it has there.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ACTIONS, maskSource } from '../../app/api.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FRAMEWORK_FOLDERS = ['engine', 'rigs', 'sound', 'quality', 'catalog'];
export const API_VERSION = 1;

// ---- which files ------------------------------------------------------------------------------------------

const NEEDS_A_PAGE = [
  [/\bwindow\s*\./, 'it uses window (a page)'],
  [/\bdocument\s*\./, 'it uses document (a page)'],
  [/\bself\s*\.\s*(?:onmessage|postMessage|addEventListener)\b|\bimportScripts\s*\(/, 'it uses self.onmessage / postMessage (a worker)'],
  [/\b(?:webkit)?AudioContext\b|\bAudioWorklet(?:Processor|Node)\b|\bregisterProcessor\s*\(/, 'it uses Web Audio'],
];

/** Is this source text a framework module? Returns { framework, why }. See "WHICH FILES ARE FRAMEWORK" above. */
export function isFrameworkSource(text) {
  const head = String(text).split('\n').slice(0, 12).join('\n');
  const marker = /^\s*\/\/\s*loadout:\s*(not\s+)?framework\b/m.exec(head);
  if (marker) return { framework: !marker[1], why: `its header says "loadout: ${marker[1] ? 'not ' : ''}framework"` };
  const { code } = maskSource(text);
  if (!/^\s*export\b/m.test(code)) return { framework: false, why: 'it exports nothing' };
  for (const [re, why] of NEEDS_A_PAGE) if (re.test(code)) return { framework: false, why };
  return { framework: true, why: 'it exports something and runs anywhere' };
}

const camel = (s) => s.replace(/-+([a-z0-9])/gi, (_, c) => c.toUpperCase());
const capital = (s) => s[0].toUpperCase() + s.slice(1);

/** The short name of each file: { 'sound/sfx-engine.js': 'sfx', ... }. See "SHORT NAMES" above. */
export function shortNames(files) {
  const order = (f) => { const i = FRAMEWORK_FOLDERS.indexOf(f.split('/')[0]); return i < 0 ? FRAMEWORK_FOLDERS.length : i; };
  const sorted = [...files].sort((a, b) => order(a) - order(b) || (a < b ? -1 : a > b ? 1 : 0));
  const out = {}, taken = new Set();
  for (const f of sorted) {
    const [folder, file] = [f.split('/')[0], f.split('/').pop()];
    let name = camel(file.replace(/\.js$/, '').replace(/-engine$/, ''));
    if (folder === 'quality') name = `check${capital(name)}`;
    if (taken.has(name)) name = `${camel(folder)}${capital(name)}`;
    if (taken.has(name)) throw new Error(`${f}: no free short name ("${name}" is taken); rename the file`);
    taken.add(name);
    out[f] = name;
  }
  return out;
}

/** The framework modules of a project, in folder order then by file name: [{ file, folder, name }]. */
export function findFrameworkModules(root = ROOT) {
  const files = [];
  for (const folder of FRAMEWORK_FOLDERS) {
    const dir = path.join(root, folder);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js') && !x.startsWith('_')).sort()) {
      if (!fs.statSync(path.join(dir, f)).isFile()) continue;
      if (isFrameworkSource(fs.readFileSync(path.join(dir, f), 'utf8')).framework) files.push(`${folder}/${f}`);
    }
  }
  const names = shortNames(files);
  return files.map((file) => ({ file, folder: file.split('/')[0], name: names[file] }));
}

// ---- reading comments -----------------------------------------------------------------------------------------

const RULER = /^[-=─━#*\s]{3,}|[-=─━]{4,}\s*$/;

/**
 * The first sentence of a comment, as one line: the first paragraph, up to the first full stop that ends a
 * sentence, with a "file.js — " lead-in dropped and the first letter made a capital. '' when there is nothing.
 */
export function oneLine(text) {
  const lines = String(text ?? '').split('\n');
  const para = [];
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) { if (para.length) break; continue; }
    if (para.length && /^\s{2,}\S/.test(raw)) break;         // an indented line under the sentence: a code sample or a list
    para.push(l);
  }
  let s = para.join(' ').replace(/\s+/g, ' ').replace(/^[\w.-]+\.m?js\s+[—–-]\s+/, '').replace(/^@\w+\s+/, '').trim();
  const end = /[.!?](?=\s+[A-Z("'`]|$)/.exec(s);
  if (end) s = s.slice(0, end.index + 1);
  if (s.length > 240) s = `${s.slice(0, 237).replace(/\s+\S*$/, '')}…`;
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

/** Split an argument list at its top-level commas: 'a, { b, c } = {}' -> ['a', '{ b, c } = {}']. */
export function splitArgs(inner) {
  const out = [];
  let depth = 0, quote = '', cur = '';
  const s = String(inner);
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) { cur += c; if (c === '\\') cur += s[++i] ?? ''; else if (c === quote) quote = ''; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; cur += c; continue; }
    if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) depth--;
    if (c === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map((a) => a.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/** The text between a "(" at `open` and the ")" that closes it. */
function insideParens(s, open) {
  let depth = 0, quote = '';
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return s.slice(open + 1, i);
  }
  return '';
}

/** A function's arguments as written, from the function itself. */
function argsOf(fn) {
  const s = Function.prototype.toString.call(fn);
  const single = /^(?:async\s+)?([A-Za-z_$][\w$]*)\s*=>/.exec(s);
  if (single) return [single[1]];
  if (/^class\b/.test(s)) { const m = /\bconstructor\s*\(/.exec(s); return m ? splitArgs(insideParens(s, m.index + m[0].length - 1)) : []; }
  const open = s.indexOf('(');
  return open < 0 ? [] : splitArgs(insideParens(s, open));
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The comment that describes the declaration on line `i`: directly above it, or at the end of a one-line export. */
function commentFor(lines, masked, i) {
  let j = i - 1;
  const text = [];
  if (j >= 0 && /\*\/\s*$/.test(lines[j]) && !masked[j].trim()) {
    const end = j;
    while (j >= 0 && !/\/\*/.test(lines[j])) j--;
    if (j >= 0) for (let k = j; k <= end; k++) text.push(lines[k].replace(/^\s*\/\*+\s?/, '').replace(/\s*\*+\/\s*$/, '').replace(/^\s*\*\s?/, ''));
  } else {
    while (j >= 0 && /^\s*\/\//.test(lines[j]) && !RULER.test(lines[j].replace(/^\s*\/\/\s?/, ''))) j--;
    for (let k = j + 1; k < i; k++) text.push(lines[k].replace(/^\s*\/\/ ?/, ''));
  }
  if (text.join('').trim()) return text.join('\n').replace(/^\n+|\s+$/g, '');
  // nothing above: a comment after the code on the same line, when the export is that one line
  const code = masked[i].replace(/\s+$/, '');
  const tail = lines[i].slice(code.length).trim();
  if (/[;}]$/.test(code) && tail.startsWith('//')) return tail.replace(/^\/\/\s?/, '');
  return '';
}

/**
 * A comment's one line, or '' when its first words are a call form such as `make({` and not a sentence.
 * A lead-in that only names the export ("seam(): how big the jump is") is dropped and the rest is the sentence.
 */
function descriptionOf(comment, name) {
  comment = comment.replace(new RegExp(`^\\s*${esc(name)}\\s*\\([^()\\n]*\\)\\s*(?::|[—–-])\\s+(?=\\S)`), '');
  const first = comment.split('\n').find((l) => l.trim()) ?? '';
  if (new RegExp(`^\\s*(?:[\\w$.]+\\.)?${esc(name)}\\s*\\(`).test(first) || /^\s*[\w$.]+\s*\([^)]*$/.test(first)) return '';
  const line = oneLine(comment);
  return /\S\s+\S/.test(line) ? line : '';
}

const kindOf = (v) => (typeof v === 'function' ? (/^class\b/.test(Function.prototype.toString.call(v)) ? 'class' : 'function') : v !== null && typeof v === 'object' && !Array.isArray(v) ? 'object' : 'constant');

/**
 * What a module's source says about each of its exports.
 * text: the module's source; real: the module itself (its exports, by name), which decides what exists and of what kind.
 * Returns [{ name, kind, args?, description, doc?, value?, keys?, methods? }] in the order the source declares them.
 */
export function describeSource(text, real) {
  const lines = String(text).split('\n');
  const masked = maskSource(text).code.split('\n');
  const lineOfDecl = (name) => {
    const n = esc(name);
    const tries = name === 'default'
      ? [/^export\s+default\b/]
      : [new RegExp(`^export\\s+(?:async\\s+)?(?:function\\s*\\*?|class|const|let|var)\\s+${n}(?![\\w$])`), new RegExp(`^(?:async\\s+)?(?:function\\s*\\*?|class|const|let|var)\\s+${n}(?![\\w$])`), new RegExp(`^export\\s*\\{[^}]*(?<![\\w$])${n}(?![\\w$])`)];
    for (const re of tries) { const i = masked.findIndex((l) => re.test(l)); if (i >= 0) return i; }
    return -1;
  };
  const out = [];
  for (const name of Object.keys(real)) {
    const v = real[name], kind = kindOf(v), at = lineOfDecl(name);
    const comment = at >= 0 ? commentFor(lines, masked, at) : '';
    const e = { name, kind };
    if (kind === 'function' || kind === 'class') e.args = argsOf(v);
    e.description = descriptionOf(comment, name);
    if (comment && comment.replace(/\s+/g, ' ').trim().replace(/\.$/, '').toLowerCase() !== e.description.replace(/\.$/, '').toLowerCase()) e.doc = comment;
    if (kind === 'constant') {
      const json = JSON.stringify(v);
      if (json !== undefined && json.length <= 200 && !(typeof v === 'number' && !Number.isFinite(v))) e.value = v;
    }
    if (kind === 'object') e.keys = (v instanceof Map || v instanceof Set ? [...v.keys()] : Object.keys(v)).slice(0, 60).map(String);
    if (kind === 'class') {
      e.methods = [];
      for (const m of Object.getOwnPropertyNames(v.prototype)) {
        const d = Object.getOwnPropertyDescriptor(v.prototype, m);
        if (m === 'constructor' || m.startsWith('_') || typeof d.value !== 'function') continue;
        const re = new RegExp(`^\\s+(?:async\\s+)?\\*?\\s*${esc(m)}\\s*\\(`);
        const i = masked.findIndex((l, k) => k > at && re.test(l));
        e.methods.push({ name: m, args: argsOf(d.value), description: i >= 0 ? descriptionOf(commentFor(lines, masked, i), m) : '' });
      }
    }
    out.push({ at, e });
  }
  // the order the source declares them in; anything not found in the source goes last, by name
  out.sort((a, b) => (a.at < 0 ? Infinity : a.at) - (b.at < 0 ? Infinity : b.at) || (a.e.name < b.e.name ? -1 : 1));
  return out.map((x) => x.e);
}

/** What a file is for: the first sentence of the comment it opens with. */
function purposeOf(text) {
  const lines = text.split('\n');
  let i = 0;
  if (lines[0]?.startsWith('#!')) i++;
  while (i < lines.length && !lines[i].trim()) i++;
  const head = [];
  if (/^\s*\/\*/.test(lines[i] ?? '')) {
    for (; i < lines.length; i++) { head.push(lines[i].replace(/^\s*\/\*+\s?/, '').replace(/\s*\*+\/\s*$/, '').replace(/^\s*\*\s?/, '')); if (/\*\//.test(lines[i])) break; }
  } else for (; i < lines.length && /^\s*\/\//.test(lines[i]); i++) head.push(lines[i].replace(/^\s*\/\/ ?/, ''));
  return oneLine(head.join('\n'));
}

// ---- the whole description ------------------------------------------------------------------------------------

/**
 * Describe a project's framework: { version, window, modules: [{ name, file, purpose, exports }], actions }.
 * Every module is loaded for real, so what is listed is what exists. One that cannot be loaded is left out
 * and listed under `notLoaded` ([{ file, why }]), which is only there when there is one.
 */
export async function buildApi({ root = ROOT } = {}) {
  const modules = [], notLoaded = [];
  for (const m of findFrameworkModules(root)) {
    const abs = path.join(root, m.file);
    const text = fs.readFileSync(abs, 'utf8');
    let real;
    // A module that cannot be loaded (a partial copy of the project, where a file it imports is missing) is left out
    // and named in `notLoaded`, so the rest is still described. In the real project the unit test allows none.
    try { real = await import(pathToFileURL(abs).href); } catch (e) { notLoaded.push({ file: m.file, why: String(e.message).split('\n')[0].replace(root, '.') }); continue; }
    modules.push({ name: m.name, file: m.file, purpose: purposeOf(text), exports: describeSource(text, real), real });
  }
  // an export that is another module's export passed on (export { ramp } from '../engine/color.js') is described where it is defined
  const home = new Map();
  for (const m of modules) for (const e of m.exports) { const v = m.real[e.name]; if (e.description && (typeof v === 'function' || (v !== null && typeof v === 'object')) && !home.has(v)) home.set(v, { m, e }); }
  for (const m of modules) {
    for (const e of m.exports) {
      const from = e.description ? null : home.get(m.real[e.name]);
      if (from && from.m !== m) { e.description = from.e.description; e.sameAs = `${from.m.name}.${from.e.name}`; }
    }
    delete m.real;
  }
  return {
    version: API_VERSION,
    about: 'Loadout\'s framework and actions (docs/architecture.md, Contract 11). modules: everything on window.loadout.framework, as loadout.framework.<module>.<export>. actions: the high-level actions on window.loadout, as MCP tools; call one with loadout.<call>(...args) or loadout.call(name, input). Written by the build; see docs/framework-api.md.',
    window: 'loadout',
    modules,
    ...(notLoaded.length ? { notLoaded } : {}),
    actions: JSON.parse(JSON.stringify(ACTIONS)),
  };
}

/** The exported functions and classes that have no description: [{ file, module, name }]. */
export function undescribed(api) {
  return api.modules.flatMap((m) => m.exports.filter((e) => (e.kind === 'function' || e.kind === 'class') && !e.description).map((e) => ({ file: m.file, module: m.name, name: e.name })));
}

/** The text of generated/framework.js: every framework module re-exported under its short name. */
export function frameworkSource(modules) {
  return [
    '// Written by the build (tools/lib/api.mjs) from the framework folders. Do not edit: every build rewrites it.',
    '// The site loads it as window.loadout.framework (app/api.js). What each export does is in generated/api.json.',
    ...modules.map((m) => `export * as ${m.name} from '../${m.file}';`),
    '',
  ].join('\n');
}

const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const code = (s) => `\`${String(s).replace(/`/g, "'")}\``;

/** The text of generated/api.md: the description as a page to read, written from the description alone. */
export function referenceMarkdown(api) {
  const out = ['# Loadout framework reference', '', 'Written by the build (`tools/lib/api.mjs`) from the code; every build rewrites it. The guide is `docs/framework-api.md`.', ''];
  const nExports = api.modules.reduce((n, m) => n + m.exports.length, 0);
  out.push(`${api.modules.length} framework modules, ${nExports} exports, ${api.actions.length} actions.`, '');
  out.push('### Actions', '', 'Each is on `window.loadout` and in `generated/api.json` under `actions` with its full input schema.', '');
  out.push('| Tool name | On the page | What it does |', '|---|---|---|');
  for (const a of api.actions) out.push(`| ${code(a.name)} | ${code(`loadout.${a.call}(${a.args.join(', ')})`)} | ${cell(a.description)} |`);
  out.push('', '### Framework modules', '');
  out.push('| Module | File | What it is |', '|---|---|---|');
  for (const m of api.modules) out.push(`| ${code(`loadout.framework.${m.name}`)} | ${code(m.file)} | ${cell(m.purpose)} |`);
  for (const m of api.modules) {
    out.push('', `#### ${code(`loadout.framework.${m.name}`)} (${code(m.file)})`, '', cell(m.purpose), '', '| Export | Kind | Arguments or value | What it does |', '|---|---|---|---|');
    for (const e of m.exports) {
      const what = e.args ? code(`(${e.args.join(', ')})`) : e.value !== undefined ? code(JSON.stringify(e.value)) : e.keys ? cell(`keys: ${e.keys.slice(0, 12).join(', ')}${e.keys.length > 12 ? ', …' : ''}`) : '';
      out.push(`| ${code(e.name)} | ${e.kind} | ${cell(what)} | ${cell(e.description || '*(not described yet)*')} |`);
      for (const x of e.methods ?? []) out.push(`| ${code(`${e.name}#${x.name}`)} | method | ${cell(code(`(${x.args.join(', ')})`))} | ${cell(x.description)} |`);
    }
  }
  return out.join('\n');
}

/**
 * Write generated/api.json, generated/framework.js and generated/api.md for a project.
 * Returns one line for the build's summary.
 */
export async function writeApi({ root = ROOT } = {}) {
  const api = await buildApi({ root });
  const dir = path.join(root, 'generated');
  fs.mkdirSync(dir, { recursive: true });
  const put = (file, text) => { if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) fs.writeFileSync(file, text); };
  const json = JSON.stringify(api, null, 1) + '\n';
  put(path.join(dir, 'api.json'), json);
  put(path.join(dir, 'framework.js'), frameworkSource(api.modules));
  put(path.join(dir, 'api.md'), referenceMarkdown(api) + '\n');
  const nExports = api.modules.reduce((n, m) => n + m.exports.length, 0);
  const waiting = undescribed(api).length;
  const left = api.notLoaded ? `, ${api.notLoaded.length} left out (could not be loaded: ${api.notLoaded.map((n) => n.file).join(', ')})` : '';
  return `${api.modules.length} modules${left}, ${nExports} exports${waiting ? ` (${waiting} functions not described yet)` : ''}, ${api.actions.length} actions -> generated/api.json (${(json.length / 1024).toFixed(1)} KB), generated/framework.js, generated/api.md`;
}

// ---- command line -----------------------------------------------------------------------------------------------

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const r = args.indexOf('--root');
  const root = r >= 0 && args[r + 1] ? path.resolve(args[r + 1]) : ROOT;
  if (args.includes('--undescribed')) {
    const byFile = {};
    for (const u of undescribed(await buildApi({ root }))) (byFile[u.file] ??= []).push(u.name);
    console.log(JSON.stringify(byFile, null, 1));
  } else console.log(await writeApi({ root }));
}
