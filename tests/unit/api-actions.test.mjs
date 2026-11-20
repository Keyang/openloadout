// The high-level actions of window.loadout (docs/architecture.md, Contract 11): what generated/api.json lists
// for an MCP server, and the parts of app/api.js that are plain functions and so run in Node.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApi } from '../../tools/lib/api.mjs';
import { CALLS } from '../../app/api.js';
import { ACTIONS, createLoadout, fail } from '../../app/api-core.js';

const REAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const api = await buildApi({ root: REAL });

// ---- a small checker for the part of JSON Schema the actions use -------------------------------------
const TYPES = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'];
const KEYWORDS = new Set(['type', 'description', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'oneOf', 'anyOf', 'minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'default', 'examples', 'pattern', 'title']);
function schemaProblems(s, where, out = []) {
  if (s === null || typeof s !== 'object' || Array.isArray(s)) { out.push(`${where}: a schema is an object`); return out; }
  for (const k of Object.keys(s)) if (!KEYWORDS.has(k)) out.push(`${where}: "${k}" is not a JSON Schema keyword this project uses`);
  if (s.type !== undefined) for (const t of [].concat(s.type)) if (!TYPES.includes(t)) out.push(`${where}: type "${t}"`);
  if (s.type === undefined && !s.oneOf && !s.anyOf && !s.enum) out.push(`${where}: needs a type (or oneOf, anyOf, enum)`);
  if (s.description !== undefined && (typeof s.description !== 'string' || !s.description.trim())) out.push(`${where}: description must be words`);
  if (s.properties !== undefined) {
    if (s.properties === null || typeof s.properties !== 'object' || Array.isArray(s.properties)) out.push(`${where}: properties must be an object`);
    else for (const [k, v] of Object.entries(s.properties)) schemaProblems(v, `${where}.${k}`, out);
  }
  if (s.required !== undefined) {
    if (!Array.isArray(s.required) || s.required.some((r) => typeof r !== 'string')) out.push(`${where}: required must be a list of names`);
    else for (const r of s.required) if (!s.properties || !(r in s.properties)) out.push(`${where}: required names "${r}", which is not a property`);
    if (Array.isArray(s.required) && new Set(s.required).size !== s.required.length) out.push(`${where}: required lists a name twice`);
  }
  if (s.additionalProperties !== undefined && typeof s.additionalProperties !== 'boolean') schemaProblems(s.additionalProperties, `${where}.additionalProperties`, out);
  if (s.items !== undefined) schemaProblems(s.items, `${where}.items`, out);
  for (const k of ['oneOf', 'anyOf']) if (s[k] !== undefined) { if (!Array.isArray(s[k]) || !s[k].length) out.push(`${where}: ${k} must be a list`); else s[k].forEach((x, i) => schemaProblems(x, `${where}.${k}[${i}]`, out)); }
  if (s.enum !== undefined && (!Array.isArray(s.enum) || !s.enum.length)) out.push(`${where}: enum must be a list`);
  for (const k of ['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems']) if (s[k] !== undefined && typeof s[k] !== 'number') out.push(`${where}: ${k} must be a number`);
  return out;
}

test('the schema checker itself catches a bad schema', () => {
  assert.deepEqual(schemaProblems({ type: 'object', properties: { a: { type: 'string' } }, required: ['a'] }, 's'), []);
  assert.ok(schemaProblems({ type: 'thing' }, 's').length);
  assert.ok(schemaProblems({ type: 'object', required: ['a'] }, 's').length);
  assert.ok(schemaProblems({ type: 'object', properties: { a: {} } }, 's').length);
  assert.ok(schemaProblems({ type: 'object', nonsense: 1 }, 's').length);
});

test('api.json lists the actions in the shape MCP tool listings use', () => {
  assert.ok(api.actions.length >= 10);
  assert.deepEqual(api.actions, JSON.parse(JSON.stringify(ACTIONS)), 'api.json carries the actions exactly as app/api.js declares them');
  const names = new Set();
  for (const a of api.actions) {
    assert.match(a.name, /^[a-z][a-z0-9_]{0,63}$/, `${a.name}: a tool name is lowercase letters, digits and underscores`);
    assert.ok(!names.has(a.name), `${a.name} is listed twice`);
    names.add(a.name);
    assert.ok(typeof a.description === 'string' && a.description.length >= 20, `${a.name}: needs a description an agent can choose a tool by`);
    assert.equal(a.inputSchema?.type, 'object', `${a.name}: inputSchema is an object schema`);
    assert.deepEqual(schemaProblems(a.inputSchema, a.name), [], `${a.name}: inputSchema`);
    assert.equal(a.inputSchema.additionalProperties, false, `${a.name}: no stray inputs`);
    // how to call it on the page: loadout.<call>(...args), each argument one property of the input
    assert.match(a.call, /^[a-z]+(\.[a-zA-Z]+)?$/, `${a.name}: call`);
    assert.deepEqual(Object.keys(a.inputSchema.properties ?? {}), a.args, `${a.name}: the input's properties are the call's arguments, in order`);
    for (const r of a.inputSchema.required ?? []) assert.ok(a.args.indexOf(r) < (a.inputSchema.required.length), `${a.name}: required arguments come first`);
  }
});

test('the Contract 11 members are all there', () => {
  const calls = api.actions.map((a) => a.call);
  for (const c of ['assets.list', 'assets.get', 'assets.search', 'assets.similar', 'assets.remove', 'make.sprite', 'make.sound', 'check', 'render', 'bag.add', 'bag.items', 'bag.remove', 'bag.setLook', 'bag.download', 'go']) assert.ok(calls.includes(c), `${c} is missing`);
});

test('every listed action is a function on the object, and every function on the object is listed', () => {
  const loadout = createLoadout({});
  const found = [];
  const walk = (o, prefix) => {
    for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(o))) {
      if (d.get) continue;                                   // framework and api: loaded on first use
      if (typeof d.value === 'function') found.push(prefix + k);
      else if (d.value && typeof d.value === 'object') walk(d.value, `${prefix}${k}.`);
    }
  };
  walk(loadout, '');
  assert.deepEqual(found.filter((f) => f !== 'call').sort(), api.actions.map((a) => a.call).sort());
  const getters = Object.entries(Object.getOwnPropertyDescriptors(loadout)).filter(([, d]) => d.get).map(([k]) => k).sort();
  assert.deepEqual(getters, ['api', 'framework']);
});

test('an action never throws: junk in, { ok: false, errors } out', async () => {
  const loadout = createLoadout({});      // no page behind it: everything that needs one must still answer, not throw
  for (const a of ACTIONS) {
    const fn = a.call.split('.').reduce((o, k) => o[k], loadout);
    for (const junk of [undefined, null, 42, '', {}, [], () => {}]) {
      const r = await fn(junk, junk);
      assert.equal(typeof r, 'object', `${a.call}(${String(junk)})`);
      assert.equal(typeof r.ok, 'boolean', `${a.call}(${String(junk)}) says ok or not`);
      if (!r.ok) { assert.ok(Array.isArray(r.errors) && r.errors.length && r.errors.every((e) => typeof e === 'string' && e.length > 10), `${a.call}(${String(junk)}): errors an agent can act on, got ${JSON.stringify(r.errors)}`); }
      assert.doesNotThrow(() => JSON.stringify(r), `${a.call}: plain data`);
    }
  }
  const r = await loadout.call('no_such_tool', {});
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /no_such_tool/);
  assert.match(r.errors[0], /make_sprite/, 'the message lists what exists');
});

test('fail() makes the refusal every action uses', () => {
  assert.deepEqual(fail('one thing is wrong'), { ok: false, errors: ['one thing is wrong'] });
  assert.deepEqual(fail(['a problem', 'another'], { id: 'x' }), { ok: false, id: 'x', errors: ['a problem', 'another'] });
});

test('the bag actions for clearing, changing and linking are there', () => {
  const calls = api.actions.map((a) => a.call);
  for (const c of ['bag.update', 'bag.clear', 'bag.link']) assert.ok(calls.includes(c), `${c} is missing`);
  assert.deepEqual([...CALLS].sort(), [...calls].sort(), 'app/api.js, the small file, names the same calls');
});
