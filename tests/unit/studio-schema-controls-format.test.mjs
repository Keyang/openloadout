// catalog/studio-schema.js, the grown format of studio item F1 that outlives the library bodies (build item R1 removed
// them): colour controls with their own label, swatches, material and group, `when` on controls and on sound cues,
// ready-made versions, a slider's step and group. The checks are the ones studio-schema-library-format.test.mjs made on a
// library body's definition, kept on a bone rig (tests/fixtures/studio/newt.json). The forms that only a library body
// could hold (a choice control, `sets`, a part with params, `body.paint`, a clip's `from`, `body.library`) are refused or
// dropped, and a definition that still names a library body is refused with the words that say what to do.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateStudioSprite, validateStudio, usedLibraryBody, LIBRARY_BODY_GONE } from '../../catalog/studio-schema.js';

const NEWT = fs.readFileSync(new URL('../fixtures/studio/newt.json', import.meta.url), 'utf8');
const newt = () => JSON.parse(NEWT);
const LIBRARY_DRAFT = fs.readFileSync(new URL('../fixtures/studio/f1-rogue.json', import.meta.url), 'utf8');

function rejects(def, ...fragments) {
  const r = validateStudioSprite(def);
  assert.equal(r.ok, false, 'expected an error');
  const text = r.errors.join('\n').toLowerCase();
  for (const f of fragments) assert.ok(text.includes(String(f).toLowerCase()), `errors should mention "${f}", got:\n${r.errors.join('\n')}`);
  return r;
}
const passes = (def, opts = {}) => { const r = validateStudioSprite(def, opts); assert.equal(r.ok, true, r.errors.join('\n')); return r; };
const warns = (def, ...fragments) => {
  const r = passes(def);
  const text = r.warnings.join('\n').toLowerCase();
  for (const f of fragments) assert.ok(text.includes(String(f).toLowerCase()), `warnings should mention "${f}", got:\n${r.warnings.join('\n')}`);
  return r;
};
const control = (d, key) => d.controls.find((c) => c.key === key);

/** The newt with the grown forms of F1 on its own controls: a colour control with swatches, a step and a group on a slider, `when`, versions, a sound cue with `when`. */
function grown() {
  const d = newt();
  d.controls.push({ key: 'belly', kind: 'colour', label: 'Belly colour', swatches: ['#e6c545', '#f2f2a0'], material: 'skin', group: 'Colours', when: { frill: [true] } });
  Object.assign(control(d, 'tailLength'), { step: 0.05, group: 'Shape' });
  control(d, 'chunk').when = { tailLength: [1.2] };
  d.clips.attack.sounds[0].when = { frill: [true] };
  d.versions = [{ name: 'Plain', params: { frill: false, tailLength: 0.8 } }, { name: 'Long', params: { tailLength: 1.5, skin: '#8CC4A0' } }];
  return d;
}

test('F1 schema on a bone rig: the grown forms pass, strict too, and are kept in the cleaned copy', () => {
  const v = passes(grown(), { strict: true }).value;
  const belly = control(v, 'belly');
  assert.deepEqual(belly, { key: 'belly', kind: 'colour', label: 'Belly colour', swatches: ['#e6c545', '#f2f2a0'], material: 'skin', group: 'Colours', when: { frill: [true] } });
  assert.equal(control(v, 'tailLength').step, 0.05);
  assert.equal(control(v, 'tailLength').group, 'Shape');
  assert.deepEqual(control(v, 'chunk').when, { tailLength: [1.2] });
  assert.deepEqual(v.clips.attack.sounds[0].when, { frill: [true] });
  assert.deepEqual(v.versions[1].params, { tailLength: 1.5, skin: '#8cc4a0' }, 'a colour in a version is kept in lower case');
  // the definition as it was before the grown forms is unchanged
  const plain = passes(newt()).value;
  assert.equal(plain.versions, undefined);
  assert.ok(!plain.controls.some((c) => c.kind === 'colour'));
});

test('F1 schema on a bone rig: a colour control refines a colour slot (label, swatches, material, group, when) and is placed where it stands', () => {
  const stray = grown(); stray.controls.push({ key: 'cape', kind: 'colour', label: 'Cape' }); rejects(stray, 'cape', 'colour');
  const twice = grown(); twice.controls.push({ key: 'belly', kind: 'colour', label: 'Again' }); rejects(twice, 'belly', 'twice');
  const detail = grown(); detail.controls.push({ key: 'eye', kind: 'colour', label: 'Eyes' }); rejects(detail, 'eye', 'colour');
  const sw = grown(); control(sw, 'belly').swatches = ['red']; rejects(sw, '#rrggbb');
  const many = grown(); control(many, 'belly').swatches = Array.from({ length: 17 }, (_, i) => `#0000${(10 + i).toString(16).padStart(2, '0')}`); rejects(many, '16');
  const mat = grown(); control(mat, 'belly').material = 'lava-rock'; rejects(mat, 'material');
  const ok = grown(); control(ok, 'belly').material = 'metal'; assert.equal(passes(ok).value.controls.find((c) => c.key === 'belly').material, 'metal');
  const extra = grown(); control(extra, 'belly').scales = { bones: ['tail1'] }; warns(extra, 'scales');
  const at = passes(grown()).value.controls.map((c) => c.key);
  assert.deepEqual(at, ['speed', 'tailLength', 'chunk', 'belly'], 'in the order the definition lists them');
});

test('F1 schema on a bone rig: `when` names controls of the sprite and values they can take, never itself, never a loop', () => {
  const unknown = grown(); control(unknown, 'chunk').when = { blade: [1] }; rejects(unknown, 'blade');
  const value = grown(); control(value, 'chunk').when = { frill: ['laser'] }; rejects(value, 'laser');
  const range = grown(); control(range, 'chunk').when = { tailLength: [9] }; rejects(range, 'tailLength');
  const self = grown(); control(self, 'chunk').when = { chunk: [1] }; rejects(self, 'itself');
  const alt = grown(); control(alt, 'chunk').when = [{ frill: [true] }, { tailLength: [1.5] }]; passes(alt);
  const empty = grown(); control(empty, 'chunk').when = {}; rejects(empty, 'when');
  const loop = grown(); control(loop, 'tailLength').when = { chunk: [1] }; control(loop, 'chunk').when = { tailLength: [1] }; rejects(loop, 'loop');
  const sound = grown(); sound.clips.attack.sounds[0].when = { blade: ['x'] }; rejects(sound, 'sound', 'blade');
  const sv = grown(); sv.clips.attack.sounds[0].when = { frill: ['laser'] }; rejects(sv, 'laser');
});

test('F1 schema on a bone rig: versions are named settings of the sprite\'s own controls', () => {
  const key = grown(); key.versions[0].params.blade = 'x'; rejects(key, 'blade');
  const val = grown(); val.versions[0].params.tailLength = 9; rejects(val, 'tailLength');
  const tog = grown(); tog.versions[0].params.frill = 'yes'; rejects(tog, 'frill');
  const col = grown(); col.versions[0].params.skin = 'pink'; rejects(col, 'skin');
  const name = grown(); name.versions[0].name = ' '; rejects(name, 'name');
  const dup = grown(); dup.versions[1].name = 'plain'; rejects(dup, 'twice');
  const extra = grown(); extra.versions[0].look = 'x'; warns(extra, 'look');
  const many = grown(); many.versions = Array.from({ length: 25 }, (_, i) => ({ name: `V${i}`, params: { tailLength: 1 } })); rejects(many, '24');
});

test('R1: what only a library body could hold is refused or dropped on a bone rig', () => {
  const choice = newt(); choice.controls.push({ key: 'pick', kind: 'choice', label: 'Pick', options: ['a', 'b'], default: 'a', sets: 'held.kind' });
  rejects(choice, 'kind', 'choice');
  const sets = newt(); control(sets, 'tailLength').sets = 'held.length'; warns(sets, 'sets');
  const params = newt(); params.parts.frill.params = ['frill']; warns(params, 'params');
  const from = newt(); from.clips.walk.from = 'walk'; warns(from, 'from');
  const paint = newt(); paint.body.paint = { 'look.top': 'skin' }; warns(paint, 'paint');
});

test('R1: a definition that names a library body is refused in the words that say what to do; usedLibraryBody finds it without running anything', () => {
  const r = validateStudioSprite(LIBRARY_DRAFT);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes(LIBRARY_BODY_GONE)), r.errors.join('\n'));
  assert.match(LIBRARY_BODY_GONE, /library body, which is gone: open the library sprite and edit a copy/);
  assert.equal(validateStudio(LIBRARY_DRAFT).ok, false);
  const both = newt(); both.body.library = 'humanoid'; rejects(both, 'library body');
  const bare = JSON.parse(LIBRARY_DRAFT); bare.body = { library: 'topdown' }; rejects(bare, 'library body');
  assert.equal(usedLibraryBody(JSON.parse(LIBRARY_DRAFT)), true);
  assert.equal(usedLibraryBody(newt()), false);
  for (const v of [null, undefined, 3, 'x', [], {}, { body: null }, { body: [] }, { body: { rig: {} } }]) assert.equal(usedLibraryBody(v), false);
  let ran = false;
  const trap = { get body() { ran = true; return { library: 'humanoid' }; } };
  assert.equal(usedLibraryBody(trap), false, 'a getter is not run');
  assert.equal(ran, false);
});
