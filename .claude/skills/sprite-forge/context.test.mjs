// Tests of context.mjs's verify helpers on fake registries and texts: node --test skills/sprite-forge/context.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bodyStates, bodyTableIssues, agentIssues, supersededIssues, generatorNotes, codeExamples } from './context.mjs';

const KINDS = ['rig', 'tiles', 'layers', 'panel', 'emitters', 'pictures'];
const NOT_BUILT = { tiles: 'B15', layers: 'B14', panel: 'B13', emitters: 'B12' };
const run = () => ({ list: [] });
const today = [{ id: 'pictures', v: 1, family: 'layout', run }, { id: 'token', v: 1, family: 'pickup', run }];
const skill = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'SKILL.md'), 'utf8');

test('a body is built by a rig, or by a family-layout generator with its id, as layoutFor decides', () => {
  const s = Object.fromEntries(bodyStates(KINDS, today, NOT_BUILT).map((b) => [b.kind, b]));
  assert.equal(s.rig.built, true);
  assert.equal(s.pictures.built, true);
  assert.equal(s.emitters.built, false);
  assert.equal(s.emitters.item, 'B12');
  // B12 registers emitters@1 in engine/gen/fx.js: the frozen NOT_BUILT table still lists it, the engine draws it
  const after = Object.fromEntries(bodyStates(KINDS, [...today, { id: 'emitters', v: 1, family: 'layout', run }], NOT_BUILT).map((b) => [b.kind, b]));
  assert.equal(after.emitters.built, true);
  assert.equal(after.emitters.by, 'emitters@1');
  // not a layout: a generator of another family, or without run, does not build a body
  const fake = bodyStates(KINDS, [...today, { id: 'panel', v: 1, family: 'ui', run }, { id: 'tiles', v: 1, family: 'layout' }], NOT_BUILT);
  assert.deepEqual(fake.filter((b) => b.built).map((b) => b.kind), ['rig', 'pictures']);
});

test('pictures still counts as built with no registry entry (the engine has a built-in layout)', () => {
  assert.equal(bodyStates(['pictures'], [], {})[0].built, true);
});

test('the committed SKILL.md body table matches today and goes STALE when a coming body lands', () => {
  // (layers@1, build item B14, is built: SKILL.md's row says so since migration M10's third review)
  const layers = { id: 'layers', v: 1, family: 'layout', run };
  assert.deepEqual(bodyTableIssues(skill, bodyStates(KINDS, [...today, layers], NOT_BUILT)), []);
  const issues = bodyTableIssues(skill, bodyStates(KINDS, [...today, layers, { id: 'emitters', v: 1, family: 'layout', run }], NOT_BUILT));
  assert.equal(issues.length, 1);
  assert.match(issues[0], /`emitters` row says coming, but the engine draws it now/);
});

test('a row that says built for a body nothing lays out is flagged, and a coming row must name its item', () => {
  const text = '| `emitters` | effects | built |\n| `panel` | interface | coming |';
  const issues = bodyTableIssues(text, bodyStates(['emitters', 'panel'], [], NOT_BUILT));
  assert.ok(issues.some((l) => /`emitters` row says built/.test(l)));
  assert.ok(issues.some((l) => /`panel` row does not name its build item B13/.test(l)));
});

test('the maker agent is flagged when it says to write sprites/<id>.js, forbids the redraw rename or names missing paths', () => {
  const old = 'Touch only: your new `sprites/<id>.js`. Never edit, rename or reformat other assets. Read `generated/api.json`.';
  const issues = agentIssues(old, (p) => p !== 'generated/api.json');
  assert.equal(issues.length, 3);
  assert.deepEqual(agentIssues('Touch only `sprites/<id>.json`; a redraw renames sprites/<id>.js to sprites/_was-<id>.js. Never edit, rename others.'), []);
});

test('the maker agent is flagged for missing tools run as `node tools/x.mjs`, for tools/rig.mjs as the rig source and for the pixel-fingerprint check', () => {
  const has = (p) => p !== 'tools/gone.mjs';
  assert.match(agentIssues('Run `node tools/gone.mjs --all` first.', has).join('\n'), /names tools\/gone\.mjs, which does not exist/);
  assert.deepEqual(agentIssues('Run `node tools/check.mjs <id>`.', has), []);
  assert.match(agentIssues('read them from `docs/architecture.md`, `node tools/rig.mjs`)', has).join('\n'), /rigs\/studio-templates\.js/);
  assert.match(agentIssues('with tests first, and the before/after pixel-fingerprint check', has).join('\n'), /golden/);
  // the same words in a line that already points at the data way are fine
  assert.deepEqual(agentIssues('Rigs start from rigs/studio-templates.js (not node tools/rig.mjs); goldens, not a pixel-fingerprint check.', has), []);
});

test('the coin in SKILL.md section 2 is the committed fixture tests/fixtures/v2/pictures/coin.json, whole', () => {
  const block = /## 2\. The file[\s\S]*?```json\n([\s\S]*?)\n```/.exec(skill)?.[1];
  assert.ok(block, 'section 2 has a json block');
  const fixture = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../tests/fixtures/v2/pictures/coin.json');
  assert.deepEqual(JSON.parse(block), JSON.parse(fs.readFileSync(fixture, 'utf8')));
});

// B10b: a released version that loses what lies left of or above a node's origin is superseded (engine/gen/index.js
// ORIGIN_FIXED); the skill never writes a call to it, and `context.mjs generators` says which version to name instead.
const FIXED = { 'gem.cut@1': 2, 'glint@1': 2 };
const FRAME = { 'pickup.burst@1': 'an effect that keeps to the frame' };

test('a call written to a superseded version is STALE; naming it in prose is not', () => {
  const issues = supersededIssues('line one\n{ "gen": "gem.cut", "v": 1, "at": [0, 0] }\n`gem.cut@1` drew a quarter', FIXED);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /line 2: .*gem\.cut@1.*gem\.cut@2/);
  assert.deepEqual(supersededIssues('{ "gen": "gem.cut", "v": 2 }', FIXED), []);
});

test('the committed SKILL.md writes no call to a superseded version, and the small gem example is the file in examples/', async () => {
  const reg = await import('../../../engine/gen/index.js');
  assert.deepEqual(supersededIssues(skill, reg.ORIGIN_FIXED), []);
  const block = /## 2\. The file[\s\S]*?```json\n[\s\S]*?\n```[\s\S]*?```json\n([\s\S]*?)\n```/.exec(skill)?.[1];
  assert.ok(block, 'section 2 has a second json block: the small gem');
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'examples/small-gem.json');
  assert.deepEqual(JSON.parse(block), JSON.parse(fs.readFileSync(file, 'utf8')));
});

test('generatorNotes marks superseded versions and frame-pixel generators', () => {
  assert.match(generatorNotes('gem.cut@1', FIXED, FRAME), /use gem\.cut@2/);
  assert.match(generatorNotes('pickup.burst@1', FIXED, FRAME), /frame pixels/);
  assert.equal(generatorNotes('token@1', FIXED, FRAME), '');
});

test('there are no frozen code sprites left to redraw from (R3b): the listing is empty', () => {
  assert.deepEqual(codeExamples(), {});
  assert.deepEqual(codeExamples('no-such-type'), { 'no-such-type': [] });
});
