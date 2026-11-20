// The five library backgrounds are written by project code, never by hand (migration batch M10b; review of M10 round 3,
// issue 5: the writers lived only in a scratch folder). tools/backdrops/<id>.mjs gives each definition and
// tools/backdrops/write.mjs writes it; each file on disk must be exactly what its writer gives, so a hand edit (or a
// writer changed without rewriting its file) fails here. Also: every file within the caps a definition has (128 KB,
// nesting 20), and no colour named as a tone moved by the steps the code took at the defaults: the main tones are the
// code's rules (stand.apart@1 and clear.of@1), worked out at every setting.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../helpers/library.mjs';
import { BACKDROP_IDS, format, hz, apart, perTime, TIMES } from '../../tools/backdrops/lib.mjs';
import { writtenText, checkedText } from '../../tools/backdrops/write.mjs';
import { validateSprite } from '../../catalog/sprite-schema.js';

/** How deep lists and objects nest in a value (the definition itself counts as 1). */
const depthOf = (v) => (v && typeof v === 'object' ? 1 + Math.max(0, ...Object.values(v).map(depthOf)) : 0);
/** Every colour rule in a value: [rule, ...] by name. */
function rulesIn(v, out = []) {
  if (Array.isArray(v)) { for (const x of v) rulesIn(x, out); return out; }
  if (v && typeof v === 'object') { if (typeof v.rule === 'string') out.push(v); for (const x of Object.values(v)) rulesIn(x, out); }
  return out;
}

test('there is a writer for each of the five backgrounds, and nothing else is written by them', () => {
  assert.deepEqual([...BACKDROP_IDS].sort(), ['bg-battle-dungeon', 'bg-battle-field', 'bg-castle', 'bg-forest', 'bg-starfield']);
  for (const id of BACKDROP_IDS) assert.ok(fs.existsSync(path.join(ROOT, 'tools', 'backdrops', `${id}.mjs`)), `tools/backdrops/${id}.mjs`);
});

for (const id of BACKDROP_IDS) {
  test(`sprites/${id}.json is exactly what tools/backdrops/${id}.mjs writes, a valid definition within the caps`, async () => {
    const text = await writtenText(id, ROOT);
    const file = fs.readFileSync(path.join(ROOT, 'sprites', `${id}.json`), 'utf8');
    assert.equal(file, text, `sprites/${id}.json differs from its writer: change tools/backdrops/${id}.mjs and run node tools/backdrops/write.mjs ${id}`);
    const def = JSON.parse(text);
    assert.ok(Buffer.byteLength(text) <= 128 * 1024, `${Buffer.byteLength(text)} bytes`);
    assert.ok(depthOf(def) <= 20, `nested ${depthOf(def)} deep`);
    const v = validateSprite(def);
    assert.ok(v.ok, (v.errors ?? []).slice(0, 5).join('; '));
    // the main tones name the code's rules: a tone of a colour moved by a fixed number of steps (a `tone` whose amount
    // is a binding on the Time of day, the stand-ins of M10's third round) is gone
    for (const r of rulesIn(def)) if (r.rule === 'tone') assert.ok(typeof r.by === 'number', `${id}: a tone moved by ${JSON.stringify(r.by).slice(0, 60)}`);
  });
}

test('the writers\' helpers: hz is the code\'s hazed on the Haze slider, apart leaves out the rule\'s defaults, perTime shows each copy at its time', () => {
  // engine/backdrop.js hazed(depth, haze) = clamp(depth + lerp(-0.1, 0.3, haze))
  assert.deepEqual(hz(0.4), { from: 'haze', map: [[0, 0.3], [1, 0.7]] });
  assert.deepEqual(hz(0), { from: 'haze', map: [[0, 0], [0.25, 0], [1, 0.3]] });
  assert.deepEqual(hz(0.9), { from: 'haze', map: [[0, 0.8], [0.5, 1], [1, 1]] });
  assert.deepEqual(apart('land', { behind: ['sky'], night: false }), { rule: 'stand.apart', v: 1, of: 'land', behind: ['sky'] });
  assert.deepEqual(apart('land', { air: 'air', depth: 0.2, night: 'night', way: 'lighter' }), { rule: 'stand.apart', v: 1, of: 'land', air: 'air', depth: 0.2, night: true, way: 'lighter' });
  assert.deepEqual(apart('land', {}).night, { from: 'time', pick: { day: false, dusk: false, night: true } });
  const copies = perTime((t) => [{ kind: 'rect', paint: t }]);
  assert.deepEqual(copies.map((x) => [x.paint, x.when.time]), TIMES.map((t) => [t, [t]]));
  // the file form: one item a line, parses back to the definition
  const def = { format: 'loadout-sprite', id: 'x', palette: [{ id: 'a' }], body: { layers: [{ name: 'far', label: 'Far', scroll: 0.1, draw: [{ kind: 'rect' }, { kind: 'dot' }] }] }, clips: { far: { frames: 1 } } };
  assert.deepEqual(JSON.parse(format(def)), def);
  assert.equal(format(def).split('\n').filter((l) => l.includes('"kind"')).length, 2);
});

test('the writers own their inputs: they read nothing under tests/, their heads and controls are in tools/backdrops/heads.json (review of M10b, issue 2)', () => {
  const dir = path.join(ROOT, 'tools', 'backdrops');
  for (const f of fs.readdirSync(dir).filter((x) => /\.m?js$/.test(x))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/^\s*(\/\/|\*|\/\*\*).*$/gm, '');
    assert.doesNotMatch(src, /tests\/|fixtures/, `tools/backdrops/${f} reads a test file`);
  }
  const heads = JSON.parse(fs.readFileSync(path.join(dir, 'heads.json'), 'utf8'));
  assert.deepEqual(Object.keys(heads).sort(), [...BACKDROP_IDS].sort());
  for (const [id, h] of Object.entries(heads)) {
    for (const k of ['name', 'blurb', 'meta', 'size', 'pivot', 'preview', 'params']) assert.ok(h[k] !== undefined, `${id}: ${k}`);
    for (const k of ['frozen', 'source', 'sha256']) assert.equal(h[k], undefined, `${id}: ${k} belongs to the frozen record, not the writer`);
  }
});

test('write.mjs refuses to write, or to pass in --check, a definition that is not valid (review of M10b, issue 6)', async () => {
  const w = await import('../../tools/backdrops/bg-battle-dungeon.mjs');
  const def = w.definition(ROOT);
  assert.equal(checkedText('bg-battle-dungeon', def), await writtenText('bg-battle-dungeon', ROOT));
  // a writer's slip: a clear.of keeping clear of nothing
  const bad = JSON.parse(JSON.stringify(def));
  const first = rulesIn(bad).find((r) => r.rule === 'clear.of');
  assert.ok(first, 'the dungeon names a clear.of');
  first.also = [];
  assert.throws(() => checkedText('bg-battle-dungeon', bad), /not a valid definition/);
});
