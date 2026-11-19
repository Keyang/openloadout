// dataSprite, part 2: top-down bone rigs (docs/studio.md section 9, Q4: top-down creatures are in version 1;
// Contract 2: a top-down character has one clip per direction, walk_down, walk_up, walk_side, side facing right).
//
// The data shape (engine/data-sprite.js header): ONE rig with `view: "top-down"` and `directions`, an overlay per
// direction ({ bones: { id: { angle, at, length, from } }, shapes: { id: { z, far, hidden, at, r, ... } } }) that
// re-poses and re-proportions the same bones and shapes for that view; the rig's own values are what a direction
// without an overlay uses. Clips are named `<action>_<down|up|side>` and each holds the key poses for its direction;
// a clip with no direction (hurt, die) is drawn facing down. The beetle fixture is written that way.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderFrame, renderSheet, defaultParams, frameSockets } from '../../engine/sprite.js';
import { describeSheet } from '../../engine/sheet-info.js';
import { Surface } from '../../engine/surface.js';
import { drawRig } from '../../rigs/bones.js';
import { clipPose } from '../../rigs/keypose.js';
import { checkSprite } from '../../quality/sprite.js';
import { validateMeta } from '../../catalog/schema.js';
import * as DS from '../../engine/data-sprite.js';

const beetleJson = JSON.parse(fs.readFileSync(new URL('../fixtures/data-sprite/beetle-topdown.json', import.meta.url), 'utf8'));
const newtJson = JSON.parse(fs.readFileSync(new URL('../fixtures/studio/newt.json', import.meta.url), 'utf8'));
const beetle = DS.dataSprite(beetleJson);
const P = defaultParams(beetle);
const same = (a, b) => a.w === b.w && a.h === b.h && a.data.every((v, i) => v === b.data[i]);
const opaque = (g) => { let n = 0; for (const v of g.data) if (v) n++; return n; };
const clone = () => structuredClone(beetleJson);
const errorsOf = (j) => DS.validateDataSprite(j).errors.join('\n');
const warningsOf = (j) => DS.validateDataSprite(j).warnings.join('\n');

test('data-sprite top-down: the beetle validates and keeps view top-down, its directions and its clip names', () => {
  const v = DS.validateDataSprite(beetleJson);
  assert.equal(v.ok, true, v.errors.join('\n'));
  assert.equal(v.value.body.rig.view, 'top-down');
  assert.equal(v.value.meta.view, 'top-down');
  assert.deepEqual(Object.keys(v.value.body.rig.directions), ['down', 'up']);
  assert.deepEqual(Object.keys(v.value.clips), ['idle_down', 'walk_down', 'walk_up', 'walk_side', 'hurt', 'die']);
  assert.equal(v.value.preview, 'walk_down');
  assert.ok(!/walk-down|"none"/.test(v.warnings.join('\n')), v.warnings.join('\n'));
});

test('data-sprite top-down: directionOf reads a clip name as rigs/topdown.js does; no direction is down', () => {
  assert.equal(DS.directionOf('walk_down'), 'down');
  assert.equal(DS.directionOf('walk_up'), 'up');
  assert.equal(DS.directionOf('attack_side'), 'side');
  assert.equal(DS.directionOf('hurt'), 'down');
  assert.deepEqual(DS.TOPDOWN_DIRECTIONS, ['down', 'up', 'side']);
});

test('data-sprite top-down: directionRig applies a direction\'s overlay to a copy of the rig', () => {
  const rig = beetle.definition.body.rig;
  const down = DS.directionRig(rig, 'down');
  const body = down.bones.find((b) => b.id === 'body');
  assert.deepEqual([body.at, body.angle, body.length], [[24, 24], 0, 10]);
  assert.equal(down.shapes.find((s) => s.id === 'skull').z, 14);
  assert.equal(down.shapes.find((s) => s.id === 'l-legF2').far, false);
  assert.equal(down.shapes.find((s) => s.id === 'eye2').hidden, false);
  assert.equal(down.directions, undefined);
  // the rig itself is not changed, and side (no overlay) is the rig as written
  assert.equal(rig.bones.find((b) => b.id === 'body').angle, 90);
  const side = DS.directionRig(rig, 'side');
  assert.deepEqual(side.bones, rig.bones);
  assert.deepEqual(side.shapes, rig.shapes);
});

test('data-sprite top-down: each direction clip is drawn on its direction\'s rig with its own keys', () => {
  const rig = beetle.definition.body.rig;
  const opt = { colours: { shell: '#2f8f9d', legs: '#5d4a3a', eye: '#f0ead8' }, partsOff: [], scale: { bones: {}, shapes: {} } };
  for (const [clip, dir, f] of [['walk_down', 'down', 2], ['walk_up', 'up', 5], ['walk_side', 'side', 1], ['hurt', 'down', 3], ['die', 'down', 7]]) {
    const want = new Surface(48, 48);
    drawRig(want, DS.directionRig(rig, dir), clipPose(beetle.definition.clips[clip], f), opt);
    assert.ok(same(renderFrame(beetle, clip, f, P), want), `${clip} ${f} on ${dir}`);
  }
});

test('data-sprite top-down: the three walks are three different pictures, each one moving', () => {
  const at = (clip, f) => renderFrame(beetle, clip, f, P);
  assert.ok(!same(at('walk_down', 0), at('walk_up', 0)));
  assert.ok(!same(at('walk_down', 0), at('walk_side', 0)));
  assert.ok(!same(at('walk_up', 0), at('walk_side', 0)));
  for (const clip of ['walk_down', 'walk_up', 'walk_side']) assert.ok(!same(at(clip, 0), at(clip, 2)), `${clip} moves`);
  // eyes show facing down, not facing up
  const eyesDown = DS.directionRig(beetle.definition.body.rig, 'down').shapes.filter((s) => /^eye/.test(s.id) && !s.hidden).length;
  const eyesUp = DS.directionRig(beetle.definition.body.rig, 'up').shapes.filter((s) => /^eye/.test(s.id) && !s.hidden).length;
  assert.deepEqual([eyesDown, eyesUp], [2, 0]);
});

test('data-sprite top-down: every frame draws something, inside the frame, the same every time', () => {
  for (const [name, c] of Object.entries(beetle.clips)) for (let f = 0; f < c.frames; f++) {
    const a = renderFrame(beetle, name, f, P);
    assert.ok(opaque(a) > 80, `${name} ${f}`);
    assert.ok(same(a, renderFrame(beetle, name, f, P)));
  }
});

test('data-sprite top-down: renderSheet and describeSheet: a row per direction, said as down / up / right', () => {
  const sheet = renderSheet(beetle, P);
  assert.equal(sheet.h, 6 * 48);
  const d = describeSheet(beetle, sheet.meta, P);
  assert.equal(d.kind, 'creature');
  assert.equal(d.view, 'top-down');
  assert.equal(d.grounded, true);
  assert.deepEqual(Object.fromEntries(Object.entries(d.animations).map(([n, a]) => [n, a.direction])),
    { idle_down: 'down', walk_down: 'down', walk_up: 'up', walk_side: 'right', hurt: 'any', die: 'any' });
  for (const fr of sheet.meta.frames) assert.deepEqual(Object.keys(fr.sockets), ['head', 'back', 'feet']);
});

test('data-sprite top-down: sockets follow the direction (the head is low facing down, high facing up)', () => {
  const down = frameSockets(beetle, 'walk_down', 0, P).head, up = frameSockets(beetle, 'walk_up', 0, P).head, side = frameSockets(beetle, 'walk_side', 0, P).head;
  assert.ok(down.y > up.y + 8, `head y facing down ${down.y}, facing up ${up.y}`);
  assert.ok(side.x > 30, `head x facing right ${side.x}`);
});

test('data-sprite top-down: controls and parts work in every direction', () => {
  for (const clip of ['walk_down', 'walk_up', 'walk_side']) {
    const base = renderFrame(beetle, clip, 0, P);
    for (const [k, v] of [['shell', '#c9423a'], ['legLength', 1.2], ['shellSize', 1.2], ['horn', false]]) {
      assert.ok(!same(renderFrame(beetle, clip, 0, { ...P, [k]: v }), base), `${clip}: ${k} = ${v}`);
    }
  }
});

test('data-sprite top-down: checkSprite runs on it', () => {
  const sounds = new Map(['footstep-leaves', 'bug-splat'].map((id) => [id, JSON.parse(fs.readFileSync(new URL(`../../sounds/${id}.json`, import.meta.url), 'utf8'))]));
  const r = checkSprite(beetle, { validateMeta, soundIndex: sounds });
  assert.ok(Array.isArray(r.errors) && Array.isArray(r.warnings));
  assert.ok(!r.errors.some((e) => /never changes the picture|nothing drawn|throws/.test(e)), r.errors.join('\n'));
});

// ---- what the overlay may hold ------------------------------------------------------------------------------

test('data-sprite top-down: an overlay may name only down, up and side', () => {
  const j = clone();
  j.body.rig.directions.left = { bones: {} };
  assert.match(errorsOf(j), /directions.*"left".*down, up, side/);
});

test('data-sprite top-down: an overlay\'s bones and shapes must be the rig\'s own', () => {
  const j = clone();
  j.body.rig.directions.down.bones.wing = { angle: 10 };
  j.body.rig.directions.up.shapes.halo = { z: 3 };
  const e = errorsOf(j);
  assert.match(e, /"wing".*not a bone/);
  assert.match(e, /"halo".*not a shape/);
});

test('data-sprite top-down: overlay numbers are checked and clamped like the rig\'s; unknown fields dropped', () => {
  const j = clone();
  j.body.rig.directions.down.bones.head = { angle: 9000, colour: 'red' };
  j.body.rig.directions.down.shapes.shell = { z: 500, r: [7, 99] };
  const v = DS.validateDataSprite(j);
  assert.equal(v.ok, true, v.errors.join('\n'));
  assert.equal(v.value.body.rig.directions.down.bones.head.angle, 720);
  assert.equal(v.value.body.rig.directions.down.bones.head.colour, undefined);
  assert.equal(v.value.body.rig.directions.down.shapes.shell.z, 100);
  assert.deepEqual(v.value.body.rig.directions.down.shapes.shell.r, [7, 32]);
  assert.match(v.warnings.join('\n'), /colour/);
  const bad = clone();
  bad.body.rig.directions.down.bones.head = { angle: 'up' };
  bad.body.rig.directions.down.shapes.shell = { hidden: 'yes' };
  const e = errorsOf(bad);
  assert.match(e, /angle must be a number/);
  assert.match(e, /hidden must be true or false/);
});

test('data-sprite top-down: `at` is only for a root bone; a shape override must fit its kind', () => {
  const j = clone();
  j.body.rig.directions.down.bones.head = { at: [1, 2] };
  j.body.rig.directions.down.shapes['l-legF'] = { r: [2, 2] };
  const v = DS.validateDataSprite(j);
  assert.equal(v.ok, true, v.errors.join('\n'));
  assert.match(v.warnings.join('\n'), /"head".*at.*root/);
  assert.match(v.warnings.join('\n'), /"l-legF".*r/);
  assert.equal(v.value.body.rig.directions.down.bones.head, undefined);
});

test('data-sprite top-down: a top-down sprite without the three walks is told which are missing (a warning)', () => {
  const j = clone();
  delete j.clips.walk_up;
  const v = DS.validateDataSprite(j);
  assert.equal(v.ok, true);
  assert.match(v.warnings.join('\n'), /walk_up/);
});

test('data-sprite top-down: clip-name advice of the style guide is given for the action of a direction clip', () => {
  const j = clone();
  j.clips.walk_side.frames = 6;
  j.clips.walk_side.keys = j.clips.walk_side.keys.map((k) => k);
  delete j.clips.walk_side.sounds;
  assert.match(warningsOf(j), /walk_side.*8 frames/);
});

test('data-sprite top-down: errors about a direction clip name it as written (walk_down, not walk-down)', () => {
  const j = clone();
  j.clips.walk_down.keys[0].bones.nope = 3;
  const e = errorsOf(j);
  assert.match(e, /"walk_down"/);
  assert.ok(!/walk-down/.test(e));
});

test('data-sprite top-down: directions and direction clips are refused on a rig that is not top-down', () => {
  const j = structuredClone(newtJson);
  j.body.rig.directions = { down: { bones: {} } };
  assert.match(warningsOf(j), /directions.*top-down/);
  const k = structuredClone(newtJson);
  k.clips.walk_down = k.clips.walk;
  assert.match(errorsOf(k), /walk_down/);
  const m = clone();
  m.meta.view = 'side';
  assert.match(warningsOf(m), /view/);
});

test('data-sprite top-down: a clip name may not exist in both spellings', () => {
  const j = clone();
  j.clips['walk-down'] = j.clips.walk_down;
  assert.match(errorsOf(j), /walk-down.*walk_down|walk_down.*walk-down/);
});

test('data-sprite top-down: hostile input is still refused by the validator (prototype keys, getters, huge text)', () => {
  const j = clone();
  const evil = JSON.parse(JSON.stringify(j));
  let ran = 0;
  Object.defineProperty(evil.body.rig, 'directions', { get() { ran++; throw new Error('ran code'); }, enumerable: true });
  const r = DS.validateDataSprite(evil);
  assert.equal(r.ok, false);
  assert.equal(ran, 0, 'the getter ran');
  assert.doesNotMatch(r.errors.join('\n'), /ran code/);
  assert.match(r.errors.join('\n'), /getter/);
  // deeper getters, bulk and objects that are not plain data inside an overlay: tests/unit/data-sprite-hostile.test.mjs
  const proto = JSON.stringify(j).replace('"directions":{', '"directions":{"__proto__":{"polluted":1},');
  const p = DS.validateDataSprite(proto);
  assert.equal(p.ok, true, p.errors.join('\n'));
  assert.equal({}.polluted, undefined);
  assert.equal(DS.validateDataSprite('x'.repeat(70 * 1024)).ok, false);
});
