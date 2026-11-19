// catalog/studio-schema.js knows top-down bodies (studio item S4b; docs/studio.md 2.1 and section 9, Q4: top-down
// creatures are in version 1). S4 introduced the format inside engine/data-sprite.js behind a shim; the validator now
// reads it itself: a rig with view "top-down" and an optional `directions` overlay (down, up, side), clips named
// <action>_<down|up|side>, and meta view "top-down". Its plain-copy wall is exported (plainStudioData), and
// engine/data-sprite.js validateDataSprite is a pass-through to validateStudioSprite (plus a cap on the messages).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { types } from 'node:util';
import * as S from '../../catalog/studio-schema.js';
import * as DS from '../../engine/data-sprite.js';
import * as T from '../../rigs/studio-templates.js';
import { hero } from '../../rigs/humanoid-studio.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const beetle = read('../fixtures/data-sprite/beetle-topdown.json');
const newt = read('../fixtures/studio/newt.json');
const clone = (v) => structuredClone(v);

test('studio-schema top-down: the views of version 1 include top-down', () => {
  assert.deepEqual([...S.STUDIO_VIEWS], ['side', 'front', 'top-down', 'none']);
  assert.deepEqual([...S.TOPDOWN_DIRECTIONS], ['down', 'up', 'side']);
  assert.deepEqual(Object.keys(S.DIRECTION_FIELDS), ['bone', 'shape', 'kinds']);
});

test('studio-schema top-down: validateStudioSprite takes the beetle as written: view, directions, clip names, labels, preview', () => {
  const v = S.validateStudioSprite(beetle);
  assert.equal(v.ok, true, v.errors.join('\n'));
  assert.equal(v.value.body.rig.view, 'top-down');
  assert.equal(v.value.meta.view, 'top-down');
  assert.deepEqual(Object.keys(v.value.body.rig.directions), ['down', 'up']);
  assert.deepEqual(Object.keys(v.value.clips), ['idle_down', 'walk_down', 'walk_up', 'walk_side', 'hurt', 'die']);
  assert.equal(v.value.preview, 'walk_down');
  for (const [name, c] of Object.entries(v.value.clips)) {
    const given = beetle.clips[name].label;
    const [action, dir] = name.split('_');
    assert.equal(c.label, given ?? (dir ? `${action[0].toUpperCase()}${action.slice(1)} (${dir})` : `${action[0].toUpperCase()}${action.slice(1)}`), name);
  }
  assert.ok(!/walk-down|"none"/.test(v.warnings.join('\n')), v.warnings.join('\n'));
  // validateStudio picks the format and says the same
  assert.deepEqual(S.validateStudio(beetle).value, v.value);
  assert.deepEqual(S.validateStudio(JSON.stringify(beetle)).value, v.value);
});

test('studio-schema top-down: a direction clip with no label is named after its action and direction', () => {
  const j = clone(beetle);
  delete j.clips.walk_up.label;
  assert.equal(S.validateStudioSprite(j).value.clips.walk_up.label, 'Walk (up)');
});

test('studio-schema top-down: validateStudioRig takes a top-down rig and keeps its directions; without them it says so', () => {
  const r = S.validateStudioRig(beetle.body.rig);
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.equal(r.value.view, 'top-down');
  assert.deepEqual(r.value.directions, S.validateStudioSprite(beetle).value.body.rig.directions);
  const bare = clone(beetle.body.rig); delete bare.directions;
  const b = S.validateStudioRig(bare);
  assert.equal(b.ok, true, b.errors.join('\n'));
  assert.match(b.warnings.join('\n'), /no directions/);
  assert.equal(b.value.directions, undefined);
});

test('studio-schema top-down: directions, direction clips and meta view top-down need a top-down body', () => {
  const d = clone(newt); d.body.rig.directions = { down: { bones: {} } };
  const v = S.validateStudioSprite(d);
  assert.equal(v.ok, true, v.errors.join('\n'));
  assert.match(v.warnings.join('\n'), /directions.*top-down/);
  assert.equal(v.value.body.rig.directions, undefined);
  const c = clone(newt); c.clips.walk_down = c.clips.walk;
  assert.match(S.validateStudioSprite(c).errors.join('\n'), /"walk_down".*top-down body/);
  const m = clone(newt); m.meta.view = 'top-down';
  assert.match(S.validateStudioSprite(m).errors.join('\n'), /meta: view "top-down".*top-down body/);
  // a library body is seen from the side
  const h = hero(); h.clips.walk_down = h.clips.walk;
  assert.match(S.validateStudioSprite(h).errors.join('\n'), /"walk_down".*top-down body/);
});

test('studio-schema top-down: style guide advice applies to the action of a direction clip', () => {
  const j = clone(beetle);
  j.clips.walk_side.frames = 6;
  j.clips.hurt_up = { ...j.clips.hurt, frameEdits: {} };
  j.clips.bite_down = clone(j.clips.idle_down);
  const w = S.validateStudioSprite(j).warnings.join('\n');
  assert.match(w, /"walk_side".*walk has 8 frames/);
  assert.match(w, /"hurt_up".*white flash/);
  assert.match(w, /"bite_down".*attack_down/);
  const k = clone(beetle); delete k.clips.walk_up;
  assert.match(S.validateStudioSprite(k).warnings.join('\n'), /walks in three directions.*walk_up/);
});

test('studio-schema top-down: a direction clip name is at most 40 characters, its action an id', () => {
  const j = clone(beetle);
  j.clips[`${'a'.repeat(36)}_down`] = clone(j.clips.idle_down);
  j.clips['Walk_down'] = clone(j.clips.idle_down);
  const e = S.validateStudioSprite(j).errors.join('\n');
  assert.match(e, /a{30}.*40 characters/);
  assert.match(e, /Walk_down/);
  const ok = clone(beetle); ok.clips[`${'a'.repeat(35)}_down`] = clone(ok.clips.idle_down);
  assert.equal(S.validateStudioSprite(ok).ok, true);
});

test('studio-schema top-down: the overlay is checked as engine/data-sprite.js checked it (now in the validator)', () => {
  const j = clone(beetle);
  j.body.rig.directions.left = { bones: {} };
  j.body.rig.directions.down.bones.wing = { angle: 10 };
  j.body.rig.directions.down.bones.head = { angle: 9000 };
  const v = S.validateStudioSprite(j);
  assert.match(v.errors.join('\n'), /directions.*"left".*down, up, side/);
  assert.match(v.errors.join('\n'), /"wing".*not a bone/);
  const k = clone(beetle);
  k.body.rig.directions.down.bones.head = { angle: 9000 };
  k.body.rig.directions.down.shapes['l-legF'] = { width: 1 };
  const w = S.validateStudioSprite(k);
  assert.equal(w.ok, true, w.errors.join('\n'));
  assert.equal(w.value.body.rig.directions.down.bones.head.angle, 720);
  assert.match(w.warnings.join('\n'), /[Ff]acing down.*l-legF.*1 pixel/);
});

test('studio-schema top-down: more than 8 unknown fields are named as 8 and "and N more"', () => {
  const r = clone(newt.body.rig);
  for (let i = 0; i < 20; i++) r['x' + i] = 1;
  const w = S.validateStudioRig(r).warnings.join('\n');
  assert.match(w, /x0, x1, x2, x3, x4, x5, x6, x7 and 12 more/);
});

// ---- the wall, exported --------------------------------------------------------------------------------------

test('studio-schema plainStudioData: text or an object in, a plain copy out, nothing in it run', () => {
  const t = S.plainStudioData(JSON.stringify(beetle));
  assert.equal(t.ok, true);
  assert.deepEqual(t.value, beetle);
  const o = S.plainStudioData(beetle);
  assert.deepEqual(o.value, beetle);
  assert.notEqual(o.value, beetle, 'a copy');
  let ran = 0;
  const g = clone(beetle);
  Object.defineProperty(g.body.rig.directions.down, 'bones', { get() { ran++; return {}; }, enumerable: true });
  const rg = S.plainStudioData(g);
  assert.equal(rg.ok, false); assert.equal(rg.value, null); assert.match(rg.errors.join('\n'), /getter/);
  // a Proxy (an object or a list) is read once through its descriptors: its get trap never runs, nothing of it is kept
  const p = clone(beetle);
  let gets = 0;
  p.body.rig.directions = new Proxy(clone(beetle.body.rig.directions), { get(x, k) { gets++; return x[k]; } });
  p.body.rig.bones = new Proxy(clone(beetle.body.rig.bones), { get(x, k) { gets++; return x[k]; } });
  const rp = S.plainStudioData(p);
  assert.equal(rp.ok, true, rp.errors.join('\n'));
  assert.equal(gets, 0, 'a get trap ran');
  assert.ok(!types.isProxy(rp.value.body.rig.directions) && !types.isProxy(rp.value.body.rig.bones));
  // a class whose prototype answers "constructor" with code: the name is read without running it
  class Odd {}
  Object.defineProperty(Odd.prototype, 'constructor', { get() { ran++; return Object; } });
  const c = clone(beetle); c.meta = new Odd();
  assert.match(S.plainStudioData(c).errors.join('\n'), /not plain data/);
  assert.equal(ran, 0, 'a getter ran');
  // a 10 MB string stops the walk early
  const big = clone(beetle); big.blurb = 'x'.repeat(10_000_000);
  const t0 = Date.now();
  assert.match(S.plainStudioData(big).errors.join('\n'), /64 KB/);
  assert.ok(Date.now() - t0 < 500);
  const proto = S.plainStudioData('{"a":{"__proto__":{"polluted":1}}}');
  assert.equal(proto.ok, true);
  assert.match(proto.warnings.join('\n'), /__proto__/);
  assert.equal({}.polluted, undefined);
});

// ---- engine/data-sprite.js is a pass-through --------------------------------------------------------------

test('studio-schema top-down: engine/data-sprite.js passes the top-down helpers on from the validator', () => {
  for (const k of ['directionRig', 'directionOf', 'TOPDOWN_DIRECTIONS', 'DIRECTION_FIELDS']) assert.equal(DS[k], S[k], k);
});

test('studio-schema top-down: validateDataSprite says what validateStudioSprite says, for every kind of definition', () => {
  const evil = clone(beetle);
  Object.defineProperty(evil.body.rig.directions.up, 'shapes', { get() { throw new Error('ran'); }, enumerable: true });
  const inputs = [newt, beetle, hero(), read('../fixtures/studio/waving-hero.json'), ...T.STUDIO_TEMPLATE_IDS.map((id) => T.studioTemplate(id)),
    JSON.stringify(beetle), evil, { ...newt, clips: {} }, null, '{', 'x'.repeat(70 * 1024)];
  for (const input of inputs) {
    const a = DS.validateDataSprite(input), b = S.validateStudioSprite(input);
    assert.deepEqual(a, b, typeof input === 'object' && input ? input.id : String(input).slice(0, 20));
  }
});
