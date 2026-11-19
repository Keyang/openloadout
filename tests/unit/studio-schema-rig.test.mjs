// catalog/studio-schema.js: every field and every cap of a rig as data (loadout-rig, docs/studio.md 2.1).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateStudioRig, STUDIO_LIMITS as L } from '../../catalog/studio-schema.js';

const newtRig = () => JSON.parse(fs.readFileSync(new URL('../fixtures/studio/newt.json', import.meta.url), 'utf8')).body.rig;

/** expects an error mentioning every fragment (case-insensitive) */
function rejects(rig, ...fragments) {
  const r = validateStudioRig(rig);
  assert.equal(r.ok, false, 'expected an error');
  assert.equal(r.value, null);
  const text = r.errors.join('\n').toLowerCase();
  for (const f of fragments) assert.ok(text.includes(String(f).toLowerCase()), `errors should mention "${f}", got:\n${r.errors.join('\n')}`);
  return r;
}
/** expects it to pass with a warning mentioning every fragment */
function warns(rig, ...fragments) {
  const r = validateStudioRig(rig);
  assert.equal(r.ok, true, r.errors.join('\n'));
  const text = r.warnings.join('\n').toLowerCase();
  for (const f of fragments) assert.ok(text.includes(String(f).toLowerCase()), `warnings should mention "${f}", got:\n${r.warnings.join('\n')}`);
  return r;
}
const passes = (rig) => { const r = validateStudioRig(rig); assert.equal(r.ok, true, r.errors.join('\n')); return r; };
const bone = (rig, id) => rig.bones.find((b) => b.id === id);
const shape = (rig, id) => rig.shapes.find((s) => s.id === id);

// ---- the header -------------------------------------------------------------------------------------------

test('format and version', () => {
  rejects({ ...newtRig(), format: 'loadout-sprite' }, 'loadout-rig');
  rejects({ ...newtRig(), version: 2 }, 'newer');
  rejects({ ...newtRig(), version: '1' }, 'version');
  const r = newtRig(); delete r.version; rejects(r, 'version');
});

test('id: the pattern, at most 40 characters, not a reserved word', () => {
  rejects({ ...newtRig(), id: 'Newt' }, 'id');
  rejects({ ...newtRig(), id: 'n'.repeat(41) }, 'id');
  rejects({ ...newtRig(), id: 'constructor' }, 'constructor');
  passes({ ...newtRig(), id: 'n'.repeat(40) });
});

test('name: text of 1 to 60 characters', () => {
  rejects({ ...newtRig(), name: '' }, 'name');
  rejects({ ...newtRig(), name: '   ' }, 'name');
  rejects({ ...newtRig(), name: 'x'.repeat(61) }, '60');
  rejects({ ...newtRig(), name: 42 }, 'name');
  assert.equal(passes({ ...newtRig(), name: '  Newt  ' }).value.name, 'Newt');
});

test('view: side, front or none; top-down is not in version 1', () => {
  for (const v of ['side', 'front', 'none']) passes({ ...newtRig(), view: v });
  rejects({ ...newtRig(), view: 'top-down' }, 'top-down');
  rejects({ ...newtRig(), view: 'back' }, 'view');
});

test('size: one of the style guide\'s frame sizes', () => {
  passes({ ...newtRig(), size: [64, 48] });
  passes({ ...newtRig(), size: [128, 96] });
  rejects({ ...newtRig(), size: [50, 50] }, 'frame size');
  rejects({ ...newtRig(), size: [320, 180] }, 'frame size');
  rejects({ ...newtRig(), size: [48] }, 'size');
  rejects({ ...newtRig(), size: '48x48' }, 'size');
});

test('unknown fields are dropped with a warning', () => {
  const r = warns({ ...newtRig(), script: 'alert(1)', onload: 'x' }, 'script', 'onload');
  assert.equal(r.value.script, undefined);
  const rig = newtRig(); rig.bones[0].evil = 1; rig.shapes[0].html = '<b>';
  const v = warns(rig, 'evil', 'html').value;
  assert.equal(v.bones[0].evil, undefined);
  assert.equal(v.shapes[0].html, undefined);
});

// ---- colours ----------------------------------------------------------------------------------------------

test('colours: 1 to 8 slots, unique ids, #rrggbb, a known material, detail is true or false', () => {
  const nine = newtRig(); nine.colours = Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, label: `C${i}`, default: '#808080' }));
  nine.colours[0].id = 'skin'; nine.colours[1].id = 'belly'; nine.colours[2].id = 'eye';
  rejects(nine, String(L.colours));
  const none = newtRig(); none.colours = []; rejects(none, 'colour');
  const dup = newtRig(); dup.colours[1].id = 'skin'; rejects(dup, 'twice');
  const hex = newtRig(); hex.colours[0].default = 'green'; rejects(hex, '#rrggbb');
  const short = newtRig(); short.colours[0].default = '#4f9'; rejects(short, '#rrggbb');
  const upper = newtRig(); upper.colours[0].default = '#4F9D57'; assert.equal(passes(upper).value.colours[0].default, '#4f9d57');
  const mat = newtRig(); mat.colours[0].material = 'cheese'; rejects(mat, 'material');
  const det = newtRig(); det.colours[2].detail = 'yes'; rejects(det, 'detail');
  const lab = newtRig(); lab.colours[0].label = 'x'.repeat(61); rejects(lab, '60');
});

// ---- bones ------------------------------------------------------------------------------------------------

test('bones: at least one, at most 48, unique ids', () => {
  const none = newtRig(); none.bones = []; none.shapes = []; none.ik = []; none.points = []; rejects(none, 'bone');
  const many = newtRig();
  for (let i = many.bones.length; i < L.bones + 1; i++) many.bones.push({ id: `extra${i}`, parent: 'body', angle: 0, length: 2 });
  rejects(many, String(L.bones));
  const dup = newtRig(); dup.bones[3].id = 'tail1'; rejects(dup, 'twice');
});

test('bones: parents come before children, every parent is a bone, no loops', () => {
  const late = newtRig(); const [t2] = late.bones.splice(3, 1); late.bones.splice(1, 0, t2); rejects(late, 'tail2', 'after');
  const lost = newtRig(); bone(lost, 'head').parent = 'neck'; rejects(lost, 'neck', 'not a bone');
});

test('bones: a root needs at [x, y]; a child\'s at is dropped', () => {
  const r = newtRig(); delete bone(r, 'body').at; rejects(r, 'at');
  const c = newtRig(); bone(c, 'head').at = [1, 2];
  assert.equal(warns(c, 'at').value.bones[1].at, undefined);
  const two = newtRig(); two.bones.push({ id: 'stalk', parent: null, at: [30, 20], angle: 180, length: 5 });
  passes(two);
});

test('bones: depth at most 16', () => {
  const r = newtRig();
  let parent = 'tail2';
  for (let i = 0; i < 13; i++) { r.bones.push({ id: `seg${i}`, parent, angle: 5, length: 1 }); parent = `seg${i}`; }
  passes(r);                      // body > tail1 > tail2 > 13 more = 16
  r.bones.push({ id: 'seg13', parent, angle: 5, length: 1 });
  rejects(r, String(L.boneDepth));
});

test('bones: numbers are clamped to their ranges with a warning', () => {
  const r = newtRig();
  bone(r, 'tail1').from = 1.5;
  bone(r, 'head').angle = 900;
  bone(r, 'head').length = 500;
  bone(r, 'body').at = [1000, -1000];
  const v = warns(r, 'kept as').value;
  assert.equal(v.bones[2].from, 1);
  assert.equal(v.bones[1].angle, 720);
  assert.equal(v.bones[1].length, 48);
  assert.deepEqual(v.bones[0].at, [96, -48]);
});

test('bones: angle, length are numbers; min must not be over max', () => {
  const a = newtRig(); bone(a, 'head').angle = '10'; rejects(a, 'angle');
  const l = newtRig(); bone(l, 'head').length = -1; assert.equal(warns(l, 'kept as').value.bones[1].length, 1);
  const m = newtRig(); bone(m, 'head').min = 40; bone(m, 'head').max = -40; rejects(m, 'min');
  const p = newtRig(); bone(p, 'head').parent = 5; rejects(p, 'parent');
});

// ---- shapes -----------------------------------------------------------------------------------------------

test('shapes: at most 160, unique ids, a bone, a colour slot, a known kind', () => {
  const many = newtRig();
  for (let i = many.shapes.length; i < L.shapes + 1; i++) many.shapes.push({ id: `x${i}`, bone: 'body', kind: 'dot', at: [1, 1], size: 1, paint: 'eye' });
  rejects(many, String(L.shapes));
  const dup = newtRig(); dup.shapes[1].id = 'torso'; rejects(dup, 'twice');
  const b = newtRig(); shape(b, 'torso').bone = 'chest'; rejects(b, 'chest', 'not a bone');
  const p = newtRig(); shape(p, 'torso').paint = '#ff0000'; rejects(p, 'colour slot');
  const k = newtRig(); shape(k, 'torso').kind = 'star'; rejects(k, 'kind');
  const none = newtRig(); none.shapes = []; warns(none, 'nothing');
});

test('shapes: limb width is whole pixels, warned under 2 and refused under 1', () => {
  const w1 = newtRig(); shape(w1, 'legF1').width = 1; warns(w1, 'thin');
  const w0 = newtRig(); shape(w0, 'legF1').width = 0.5; rejects(w0, 'thin');
  const w25 = newtRig(); shape(w25, 'legF1').width = 2.5; assert.equal(warns(w25, 'whole').value.shapes[5].width, 3);
  const none = newtRig(); delete shape(none, 'legF1').width; rejects(none, 'width');
});

test('shapes: capsule from/to along the bone, two radii, radii at most 32, thin warned and refused (a taper to a point is fine)', () => {
  const r = newtRig(); shape(r, 'torso').r = [4]; rejects(r, 'r');
  const big = newtRig(); shape(big, 'torso').r = [40, 3.5]; assert.equal(warns(big, 'kept as').value.shapes[0].r[0], 32);
  const taper = newtRig(); shape(taper, 'tailTip').r = [1.8, 0.2]; assert.deepEqual(passes(taper).warnings, []);
  const thin = newtRig(); shape(thin, 'tailTip').r = [0.8, 0.8]; warns(thin, 'thin');
  const thinner = newtRig(); shape(thinner, 'tailTip').r = [0.4, 0.4]; rejects(thinner, 'thin');
  const ft = newtRig(); shape(ft, 'torso').from = -1; shape(ft, 'torso').to = 2;
  const v = warns(ft, 'kept as').value.shapes[0]; assert.equal(v.from, 0); assert.equal(v.to, 1);
  const off = newtRig(); shape(off, 'belly').offset = 'x'; rejects(off, 'offset');
});

test('shapes: ellipse needs at and r; thin across is warned', () => {
  const r = newtRig(); delete shape(r, 'skull').at; rejects(r, 'at');
  const t = newtRig(); shape(t, 'skull').r = [4, 0.6]; warns(t, 'thin');
});

test('shapes: poly has 3 to 24 points', () => {
  const few = newtRig(); shape(few, 'frill').points = [[0, 0], [1, 1]]; rejects(few, '3');
  const many = newtRig(); shape(many, 'frill').points = Array.from({ length: 25 }, (_, i) => [i % 5, i % 3]); rejects(many, String(L.polyPoints));
  const bad = newtRig(); shape(bad, 'frill').points = [[0, 0], [1, 'a'], [2, 2]]; rejects(bad, 'point');
});

test('shapes: dot size is 1 or 2', () => {
  const r = newtRig(); shape(r, 'eye').size = 3; rejects(r, 'size');
  const d = newtRig(); delete shape(d, 'eye').size; assert.equal(passes(d).value.shapes.find((s) => s.id === 'eye').size, 1);
});

test('shapes: z clamped to -100..100; flags are true or false; shade and light clamped; fields of another kind dropped', () => {
  const z = newtRig(); shape(z, 'torso').z = 500; assert.equal(warns(z, 'kept as').value.shapes[0].z, 100);
  for (const f of ['far', 'glow', 'hidden']) { const r = newtRig(); shape(r, 'torso')[f] = 'yes'; rejects(r, f); }
  const sh = newtRig(); shape(sh, 'torso').shade = 9; shape(sh, 'torso').light = -3;
  const v = warns(sh, 'kept as').value.shapes[0]; assert.equal(v.shade, 2); assert.equal(v.light, 0);
  const other = newtRig(); shape(other, 'eye').width = 3; assert.equal(warns(other, 'width').value.shapes.find((s) => s.id === 'eye').width, undefined);
});

test('shapes: group and part are ids; a group that mixes colours is warned', () => {
  const g = newtRig(); shape(g, 'torso').group = 'Body Group'; rejects(g, 'group');
  const p = newtRig(); shape(p, 'frill').part = 'a b'; rejects(p, 'part');
  const mix = newtRig(); shape(mix, 'skull').paint = 'belly'; warns(mix, 'body', 'colour');
});

test('shapes: light on a material that is not shiny is warned (style guide 2)', () => {
  const r = newtRig(); shape(r, 'torso').light = 1; warns(r, 'light');
});

// ---- IK chains --------------------------------------------------------------------------------------------

test('ik: at most 8, two bones where the second hangs from the first, bend 1 or -1, a bone in one chain only', () => {
  const many = newtRig();
  for (let i = 0; i < L.ik + 1; i++) {
    many.bones.push({ id: `u${i}`, parent: 'body', angle: 0, length: 2 }, { id: `l${i}`, parent: `u${i}`, angle: 0, length: 2 });
    many.ik.push({ id: `k${i}`, label: `K${i}`, bones: [`u${i}`, `l${i}`], bend: 1 });
  }
  rejects(many, String(L.ik));
  const chain = newtRig(); chain.ik[0].bones = ['thighF', 'shinB']; rejects(chain, 'parent');
  const lost = newtRig(); lost.ik[0].bones = ['thighF', 'toe']; rejects(lost, 'toe');
  const one = newtRig(); one.ik[0].bones = ['thighF']; rejects(one, 'two bones');
  const bend = newtRig(); bend.ik[0].bend = 0; rejects(bend, 'bend');
  const twice = newtRig(); twice.ik[1].bones = ['thighF', 'shinF']; rejects(twice, 'thighF', 'two');
  const dup = newtRig(); dup.ik[1].id = 'footF'; rejects(dup, 'twice');
});

// ---- attach points ----------------------------------------------------------------------------------------

test('points: at most 16, on a bone at [u, v] with an optional angle, or a ground point', () => {
  const many = newtRig();
  for (let i = 0; i < L.points; i++) many.points.push({ id: `p${i}`, bone: 'body', at: [0, 0] });
  rejects(many, String(L.points));
  const b = newtRig(); b.points[0].bone = 'neck'; rejects(b, 'neck');
  const at = newtRig(); delete at.points[0].at; rejects(at, 'at');
  const dup = newtRig(); dup.points[1].id = 'head'; rejects(dup, 'twice');
  const g = newtRig(); g.points[2] = { id: 'feet', ground: true, bone: 'body' };
  assert.equal(warns(g, 'bone').value.points[2].bone, undefined);
  const ang = newtRig(); ang.points[1].angle = 1000; assert.equal(warns(ang, 'kept as').value.points[1].angle, 720);
});

test('optional lists may be left out', () => {
  const r = newtRig(); delete r.ik; delete r.points;
  // the rig alone is fine without IK; the sprite's walk would need it, which the sprite tests cover
  const v = passes(r).value;
  assert.deepEqual(v.ik, []);
  assert.deepEqual(v.points, []);
});
