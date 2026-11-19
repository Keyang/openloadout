// catalog/studio-schema.js, studio item F1: what a library body's definition may hold so that the library's rig sprites
// can be written as data (docs/studio.md 2.3; Contract 14 rule 2): choice controls that set one field of the figure,
// sliders with their own range, step and group on a fixed figure field, colour controls with their own label and
// swatches, `when` on controls and on sound cues, Contract 3 parts under any name with params, none and socket,
// ready-made versions, and `body.paint`: figure colours drawn from the settings through the fixed registry of
// engine/data-rules.js. The Hero preset and every older definition still pass unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateStudioSprite } from '../../catalog/studio-schema.js';
import { hero } from '../../rigs/humanoid-studio.js';

/** A small rogue (tests/fixtures/studio/f1-rogue.json): the shape of the converted sprites/rogue-battler.js. A new copy every call. */
const ROGUE = fs.readFileSync(new URL('../fixtures/studio/f1-rogue.json', import.meta.url), 'utf8');
const rogue = () => JSON.parse(ROGUE);

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

test('F1 schema: the rogue passes, strict too, and keeps every new field in its cleaned copy', () => {
  const v = passes(rogue(), { strict: true }).value;
  assert.deepEqual(v.body.paint, rogue().body.paint);
  assert.deepEqual(v.controls[1], { key: 'weapon', kind: 'choice', label: 'Weapon', options: ['daggers', 'short sword', 'claws', 'none'], default: 'daggers', sets: 'held.kind' });
  assert.deepEqual(v.controls[2], { key: 'weaponLength', label: 'Length', lo: 'Short', hi: 'Long', min: 0.65, max: 1.35, step: 0.05, default: 1, sets: 'held.length' });
  assert.deepEqual(v.controls[3].options[2], { value: 'none', label: 'Bare head' });
  assert.deepEqual(v.controls[3].was, { cowl: 'hood' });
  assert.deepEqual(v.controls[5], { key: 'metal', kind: 'colour', label: 'Metal', swatches: ['#c2c9d6', '#f2c230'], when: { weapon: ['daggers', 'short sword', 'claws'] } });
  assert.equal(v.controls[6].group, 'Motion');
  assert.deepEqual(v.parts.weapon, { label: 'Weapon', params: ['weapon', 'weaponLength', 'metal'], none: 'none', socket: 'hand' });
  assert.deepEqual(v.clips.attack.sounds[0].when, { weapon: ['daggers', 'short sword', 'claws'] });
  assert.deepEqual(v.versions, rogue().versions);
});

test('F1 schema: the Hero preset and the older library form pass as before (sets a body field, a toggle per part)', () => {
  const h = passes(hero()).value;
  assert.deepEqual(h.parts.held, { label: 'Weapon', default: true });
  assert.equal(h.body.paint, undefined);
  assert.equal(h.versions, undefined);
});

test('F1 schema: a slider sets a number field of the figure, within that field\'s range; a body field stays 0..1', () => {
  const bad = rogue(); bad.controls[2].sets = 'held.kind'; rejects(bad, 'weaponLength', 'held.kind', 'number');
  const none = rogue(); none.controls[2].sets = 'held.reach'; rejects(none, 'held.reach');
  const deep = rogue(); deep.controls[2].sets = 'held.length.x'; rejects(deep, 'held.length.x');
  const proto = rogue(); proto.controls[2].sets = '__proto__.x'; rejects(proto, 'sets');
  const wide = rogue(); wide.controls[2].max = 9;
  assert.equal(warns(wide, 'kept as').value.controls[2].max, 3, 'held.length is 0.25..3');
  const tall = rogue(); tall.controls[0].max = 2;
  assert.equal(warns(tall, 'kept as').value.controls[0].max, 1);
  const twice = rogue(); twice.controls.push({ key: 'reach', label: 'Reach', min: 0.5, max: 2, default: 1, sets: 'held.length' }); rejects(twice, 'held.length', 'twice');
  const step = rogue(); step.controls[2].step = 0; rejects(step, 'step');
  const step2 = rogue(); step2.controls[2].step = 5; rejects(step2, 'step');
  const grp = rogue(); grp.controls[6].group = 'g'.repeat(31); rejects(grp, 'group');
});

test('F1 schema: a choice sets a word field of the figure; its options are values that field takes', () => {
  const bad = rogue(); bad.controls[1].options = ['daggers', 'laser']; rejects(bad, 'laser', 'held.kind');
  const num = rogue(); num.controls[1].sets = 'held.length'; rejects(num, 'held.length', 'word');
  const def = rogue(); def.controls[1].default = 'axe'; rejects(def, 'default', 'axe');
  const one = rogue(); one.controls[1].options = ['daggers']; rejects(one, 'at least 2');
  const dup = rogue(); dup.controls[1].options = ['daggers', 'daggers', 'none']; rejects(dup, 'twice');
  const lab = rogue(); lab.controls[1].options = ['daggers', { value: 'none' }]; rejects(lab, 'label');
  const was = rogue(); was.controls[3].was = { cowl: 'helmet' }; rejects(was, 'helmet');
  const stance = rogue(); stance.controls.push({ key: 'carry', kind: 'choice', label: 'Carry', options: ['upright', 'crouched'], default: 'crouched', sets: 'stance' }); passes(stance);
  const noSets = rogue(); delete noSets.controls[1].sets; rejects(noSets, 'sets');
  // map: an option that stands for another value of the field (the Hero's "helmet" is the figure's "plumed helmet")
  const map = rogue(); map.controls[3].options = ['hood', 'helmet', 'none']; map.controls[3].map = { helmet: 'plumed helmet' };
  assert.deepEqual(passes(map).value.controls[3].map, { helmet: 'plumed helmet' });
  const mapBad = rogue(); mapBad.controls[3].map = { hood: 'turban' }; rejects(mapBad, 'turban');
  const mapKey = rogue(); mapKey.controls[3].map = { cowl: 'hood' }; rejects(mapKey, 'cowl', 'option');
  const unmapped = rogue(); unmapped.controls[3].options = ['hood', 'tiara', 'none']; rejects(unmapped, 'tiara', 'map');
  const rig = { ...rogue(), body: { rig: {} } };
  assert.equal(validateStudioSprite(rig).ok, false);
});

test('F1 schema: a colour control refines a colour slot (label, swatches, material, group, when) and is placed where it stands', () => {
  const stray = rogue(); stray.controls.push({ key: 'cape', kind: 'colour', label: 'Cape' }); rejects(stray, 'cape', 'colour');
  const twice = rogue(); twice.controls.push({ key: 'skin', kind: 'colour', label: 'Skin again' }); rejects(twice, 'skin', 'twice');
  const sw = rogue(); sw.controls[4].swatches = ['red']; rejects(sw, '#rrggbb');
  const many = rogue(); many.controls[4].swatches = Array.from({ length: 17 }, (_, i) => `#0000${(10 + i).toString(16).padStart(2, '0')}`); rejects(many, '16');
  const mat = rogue(); mat.controls[4].material = 'lava-rock'; rejects(mat, 'material');
  const ok = rogue(); ok.controls[4].material = 'skin'; assert.equal(passes(ok).value.controls[4].material, 'skin');
});

test('F1 schema: `when` names controls of the sprite and values they can take, never itself, never a loop', () => {
  const unknown = rogue(); unknown.controls[5].when = { blade: ['daggers'] }; rejects(unknown, 'blade');
  const value = rogue(); value.controls[5].when = { weapon: ['laser'] }; rejects(value, 'laser');
  const self = rogue(); self.controls[5].when = { metal: ['#c2c9d6'] }; rejects(self, 'itself');
  const range = rogue(); range.controls[5].when = { weaponLength: [5] }; rejects(range, 'weaponLength');
  const alt = rogue(); alt.controls[5].when = [{ weapon: ['daggers'] }, { headgear: ['hood'] }]; passes(alt);
  const empty = rogue(); empty.controls[5].when = {}; rejects(empty, 'when');
  const loop = rogue();
  loop.controls[1].when = { headgear: ['hood'] }; loop.controls[3].when = { weapon: ['daggers'] };
  rejects(loop, 'loop');
  const viaPart = rogue(); viaPart.controls[1].when = { weaponLength: [1] }; rejects(viaPart, 'loop');
  const sound = rogue(); sound.clips.attack.sounds[0].when = { blade: ['x'] }; rejects(sound, 'sound', 'blade');
  const sv = rogue(); sv.clips.attack.sounds[1].when = { weapon: ['laser'] }; rejects(sv, 'laser');
});

test('F1 schema: a part under any name lists its controls, selector first (a choice); none is an option of it; socket is one the body gives', () => {
  const sel = rogue(); sel.parts.weapon.params = ['weaponLength', 'weapon']; rejects(sel, 'weapon', 'choice');
  const missing = rogue(); missing.parts.weapon.params = ['weapon', 'reach']; rejects(missing, 'reach');
  const shared = rogue(); shared.parts.headgear.params = ['headgear', 'weaponLength']; rejects(shared, 'weaponLength', 'two parts');
  const none = rogue(); none.parts.weapon.none = 'nothing'; rejects(none, 'nothing');
  const socket = rogue(); socket.parts.weapon.socket = 'tail'; rejects(socket, 'tail');
  const muzzle = rogue(); muzzle.parts.weapon.socket = 'muzzle'; rejects(muzzle, 'muzzle');
  const thrown = rogue(); thrown.parts.weapon.socket = 'muzzle'; thrown.body.figure.thrown = { metal: '#c2c9d6', hilt: '#9a6a3e' }; passes(thrown);
  const both = rogue(); both.parts.weapon.default = true; warns(both, 'default');
  // a part named like a control does not take its key; an older toggle part still does
  const toggle = rogue(); toggle.parts.cape = { label: 'Cape', default: true }; toggle.body.figure.cape = { kind: 'plain', length: 1, colour: '#c9423a' }; passes(toggle);
  const clash = rogue(); clash.parts.held = { label: 'Held', default: true }; clash.controls.push({ key: 'held', kind: 'choice', label: 'x', options: ['daggers', 'none'], default: 'none', sets: 'scarf.kind' });
  rejects(clash, 'held');
});

test('F1 schema: versions are named settings of the sprite\'s own controls', () => {
  const key = rogue(); key.versions[0].params.blade = 'x'; rejects(key, 'blade');
  const val = rogue(); val.versions[0].params.weaponLength = 9; rejects(val, 'weaponLength');
  const ch = rogue(); ch.versions[0].params.weapon = 'laser'; rejects(ch, 'laser');
  const col = rogue(); col.versions[0].params.skin = 'pink'; rejects(col, 'skin');
  const name = rogue(); name.versions[0].name = ' '; rejects(name, 'name');
  const dup = rogue(); dup.versions[1].name = 'swordsman'; rejects(dup, 'twice');
  const extra = rogue(); extra.versions[0].look = 'x'; warns(extra, 'look');
  const many = rogue(); many.versions = Array.from({ length: 25 }, (_, i) => ({ name: `V${i}`, params: { height: i / 30 } })); rejects(many, '24');
  const old = rogue(); assert.deepEqual(passes(old).value.versions[1].params, { weapon: 'none', headgear: 'cowl' }, 'an old value a choice still takes (was) is kept as written');
});

test('F1 schema: paint names colour fields of the figure, colour slots, colours, and rules of the registry only', () => {
  const field = rogue(); field.body.paint['held.kind'] = 'trim'; rejects(field, 'held.kind', 'colour');
  const path = rogue(); path.body.paint['wings.colour'] = 'trim'; rejects(path, 'wings.colour');
  const slot = rogue(); slot.body.paint['look.top'] = 'cape'; rejects(slot, 'cape');
  const hexOk = rogue(); hexOk.body.paint['look.top'] = '#123456'; passes(hexOk);
  const rule = rogue(); rule.body.paint['look.top'] = { rule: 'eval', code: 'alert(1)' }; rejects(rule, 'eval', 'apart');
  const arg = rogue(); arg.body.paint['look.top'] = { rule: 'tone', of: 'outfit' }; rejects(arg, 'by');
  const range = rogue(); range.body.paint['look.top'] = { rule: 'tone', of: 'outfit', by: 7 };
  assert.equal(warns(range, 'kept as').value.body.paint['look.top'].by, 3);
  const extra = rogue(); extra.body.paint['look.top'] = { rule: 'tone', of: 'outfit', by: 0.2, code: 'x' }; warns(extra, 'code');
  const word = rogue(); word.body.paint['look.top'] = { rule: 'ramp', of: 'outfit', tone: 'neon' }; rejects(word, 'neon');
  const pickWhen = rogue(); pickWhen.body.paint['look.top'] = { rule: 'choose', when: { blade: ['x'] }, then: 'trim', else: 'outfit' }; rejects(pickWhen, 'blade');
  let deep = 'outfit';
  for (let i = 0; i < 9; i++) deep = { rule: 'tone', of: deep, by: 0.1 };
  const tooDeep = rogue(); tooDeep.body.paint['look.top'] = deep; rejects(tooDeep, 'deep');
  const absent = rogue(); absent.body.paint['mask.colour'] = 'trim'; warns(absent, 'mask');
  // review F1, issue 3: a paint tree is capped by its number of nodes, not only by how deep it nests
  let wide = 'outfit';
  for (let i = 0; i < 4; i++) wide = { rule: 'standOut', against: wide, from: [wide, wide, wide] };
  const many = rogue(); many.body.paint['look.top'] = wide; rejects(many, 'paint', 'rules and colours');
  const fine = rogue(); fine.body.paint['look.top'] = { rule: 'standOut', against: 'outfit', from: ['trim', 'skin', { rule: 'tone', of: 'trim', by: 1 }] }; passes(fine);
  const onRig = { ...rogue() }; onRig.body = { ...onRig.body, paint: 'x' }; rejects(onRig, 'paint');
});

test('F1 schema (review issue 4): a control that sets a field of a part the figure does not have is warned about, as paint is; body, motion, look and hair have defaults', () => {
  const gone = rogue(); delete gone.body.figure.held;
  const w = warns(gone, 'held', 'changes nothing').warnings.filter((x) => /changes nothing/.test(x));
  assert.ok(w.some((x) => x.includes('"weapon"')) && w.some((x) => x.includes('"weaponLength"')), `the choice and the slider are both named:\n${w.join('\n')}`);
  const motion = rogue(); delete motion.body.figure.motion;
  const r = passes(motion);
  assert.ok(!r.warnings.some((w) => /motion/.test(w)), `a slider on motion needs no motion block: ${r.warnings.join('\n')}`);
  const fine = passes(rogue());
  assert.ok(!fine.warnings.some((w) => /changes nothing/.test(w)), fine.warnings.join('\n'));
});
