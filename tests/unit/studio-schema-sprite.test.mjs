// catalog/studio-schema.js: every field and every cap of a sprite as data (loadout-sprite, docs/studio.md 2.2 and 2.3).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateStudioSprite, STUDIO_LIMITS as L } from '../../catalog/studio-schema.js';

const load = (name) => JSON.parse(fs.readFileSync(new URL(`../fixtures/studio/${name}.json`, import.meta.url), 'utf8'));
const newt = () => load('newt');
const hero = () => load('waving-hero');

function rejects(def, opts, ...fragments) {
  if (typeof opts === 'string') { fragments.unshift(opts); opts = {}; }
  const r = validateStudioSprite(def, opts);
  assert.equal(r.ok, false, 'expected an error');
  assert.equal(r.value, null);
  const text = r.errors.join('\n').toLowerCase();
  for (const f of fragments) assert.ok(text.includes(String(f).toLowerCase()), `errors should mention "${f}", got:\n${r.errors.join('\n')}`);
  return r;
}
function warns(def, opts, ...fragments) {
  if (typeof opts === 'string') { fragments.unshift(opts); opts = {}; }
  const r = validateStudioSprite(def, opts);
  assert.equal(r.ok, true, r.errors.join('\n'));
  const text = r.warnings.join('\n').toLowerCase();
  for (const f of fragments) assert.ok(text.includes(String(f).toLowerCase()), `warnings should mention "${f}", got:\n${r.warnings.join('\n')}`);
  return r;
}
const passes = (def, opts = {}) => { const r = validateStudioSprite(def, opts); assert.equal(r.ok, true, r.errors.join('\n')); return r; };

// ---- the header -------------------------------------------------------------------------------------------

test('format and version', () => {
  rejects({ ...newt(), format: 'loadout-rig' }, 'loadout-sprite');
  rejects({ ...newt(), version: 3 }, 'newer');
});

test('id: lowercase with dashes, at most 40 characters, not reserved, not a catalogue id', () => {
  rejects({ ...newt(), id: 'MossNewt' }, 'id');
  rejects({ ...newt(), id: 'moss_newt' }, 'id');
  rejects({ ...newt(), id: 'm'.repeat(41) }, 'id');
  rejects({ ...newt(), id: 'constructor' }, 'constructor');
  rejects({ ...newt(), id: 'knight' }, { catalogIds: ['knight', 'coin'] }, 'knight', 'library');
  rejects({ ...newt(), id: 'knight' }, { catalogIds: new Set(['knight']) }, 'knight');
  passes({ ...newt(), id: 'knight' });             // no catalogue given: not checked
});

test('name at most 60 characters, blurb at most 300', () => {
  rejects({ ...newt(), name: 'n'.repeat(61) }, '60');
  rejects({ ...newt(), name: undefined }, 'name');
  rejects({ ...newt(), blurb: 'b'.repeat(301) }, '300');
  rejects({ ...newt(), blurb: 7 }, 'blurb');
  passes({ ...newt(), blurb: 'b'.repeat(300) });
});

test('meta: checked by catalog/schema.js; gaps are advice on a draft and errors when strict', () => {
  const d = newt(); d.meta.words = ['newt'];
  warns(d, 'words');
  rejects(d, { strict: true }, 'words');
  const m = newt(); delete m.meta; warns(m, 'meta'); rejects(m, { strict: true }, 'meta');
  const top = newt(); top.meta.view = 'top-down'; rejects(top, 'top-down');
  const diff = newt(); diff.meta.view = 'front'; warns(diff, 'view');
  const bad = newt(); bad.meta = 'creature'; rejects(bad, 'meta');
  const long = newt(); long.meta.words = ['newt', 'w'.repeat(31), 'a', 'b', 'c', 'd']; rejects(long, '30');
  const junk = newt(); junk.meta.secret = 'x'; assert.equal(warns(junk, 'secret').value.meta.secret, undefined);
});

test('body: a rig or a library body, not both and not neither', () => {
  const both = newt(); both.body.library = 'humanoid'; both.body.figure = {}; rejects(both, 'body');
  const neither = newt(); neither.body = {}; rejects(neither, 'body');
  const lib = hero(); lib.body.library = 'quadruped'; rejects(lib, 'humanoid');
  const rig = newt(); rig.body.rig.version = 9; rejects(rig, 'newer');
  const rigBad = newt(); rigBad.body.rig.bones[1].parent = 'neck'; rejects(rigBad, 'neck');
});

test('size comes from the body; pivot inside the frame, whole pixels; grounded true or false', () => {
  const s = newt(); s.size = [64, 64]; assert.deepEqual(warns(s, 'size').value.size, [48, 48]);
  const h = hero(); h.size = [48, 48]; assert.deepEqual(warns(h, 'size').value.size, [64, 64]);
  const p = newt(); p.pivot = [100, -5]; assert.deepEqual(warns(p, 'kept as').value.pivot, [48, 0]);
  const w = newt(); w.pivot = [24.5, 42]; assert.deepEqual(warns(w, 'whole').value.pivot, [25, 42]);
  const bad = newt(); bad.pivot = [24]; rejects(bad, 'pivot');
  const g = newt(); g.grounded = 'yes'; rejects(g, 'grounded');
  const f = newt(); f.grounded = false; assert.equal(passes(f).value.grounded, false);
});

test('colours: a value per slot of the rig, #rrggbb', () => {
  const u = newt(); u.colours.fur = '#ffffff'; rejects(u, 'fur', 'colour slot');
  const h = newt(); h.colours.skin = 'red'; rejects(h, '#rrggbb');
  const l = hero(); l.colours = { skin: '#ffffff' }; assert.deepEqual(passes(l).value.colours, { skin: '#ffffff' });
});

// ---- controls ---------------------------------------------------------------------------------------------

test('controls: a scale of named bones or shapes, a standard speed, or (library) a body field', () => {
  const b = newt(); b.controls[1].scales = { bones: ['wing'] }; rejects(b, 'wing', 'not a bone');
  const s = newt(); s.controls[2].scales = { shapes: ['horn'] }; rejects(s, 'horn', 'not a shape');
  const both = newt(); both.controls[1].scales = { bones: ['tail1'], shapes: ['torso'] }; rejects(both, 'scales');
  const empty = newt(); empty.controls[1].scales = { bones: [] }; rejects(empty, 'scales');
  const path = newt(); path.controls[1].scales = { 'body.rig.bones': ['tail1'] }; rejects(path, 'scales');
  const none = newt(); delete none.controls[1].scales; rejects(none, 'scales');
  const sp = newt(); sp.controls[0] = { key: 'speed', standard: 'turbo' }; rejects(sp, 'standard');
  const spk = newt(); spk.controls[0] = { key: 'fast', standard: 'speed' }; rejects(spk, 'speed');
  const set = hero(); set.controls[1].sets = 'wingspan'; rejects(set, 'wingspan');
  const setOnRig = newt(); setOnRig.controls[1] = { key: 'h', label: 'H', min: 0, max: 1, default: 0.5, sets: 'height' }; rejects(setOnRig, 'scales');
});

test('controls: min below max, default clamped between them, end words short text', () => {
  const m = newt(); m.controls[1].min = 2; m.controls[1].max = 1; rejects(m, 'min');
  const d = newt(); d.controls[1].default = 9; assert.equal(warns(d, 'kept as').value.controls[1].default, 1.5);
  const r = newt(); r.controls[1].max = 50; assert.equal(warns(r, 'kept as').value.controls[1].max, 4);
  const lo = newt(); lo.controls[1].lo = 'x'.repeat(31); rejects(lo, '30');
  const lab = newt(); delete lab.controls[1].label; rejects(lab, 'label');
});

test('controls: every key once across controls, colour slots and parts; at most 48 in all', () => {
  const dup = newt(); dup.controls[2].key = 'tailLength'; rejects(dup, 'tailLength', 'twice');
  const slot = newt(); slot.controls[1].key = 'skin'; rejects(slot, 'skin', 'twice');
  const part = newt(); part.controls[1].key = 'frill'; rejects(part, 'frill', 'twice');
  const bad = newt(); bad.controls[1].key = 'tail length'; rejects(bad, 'key');
  const many = newt();
  // 2 colour controls (the eye is a detail) + 1 part + speed + 2 = 6 already
  for (let i = 0; i < L.controls - 5; i++) many.controls.push({ key: `extra${i}`, label: `Extra ${i}`, min: 0.5, max: 1.5, default: 1, scales: { bones: ['tail1'] } });
  rejects(many, String(L.controls));
});

test('a sprite with animated clips and no speed control is advised to add one', () => {
  const d = newt(); d.controls.shift(); warns(d, 'speed');
});

// ---- parts ------------------------------------------------------------------------------------------------

test('parts: a label, shapes of the rig, a default; every shape.part names a part; a shape in one part only', () => {
  const s = newt(); s.parts.frill.shapes = ['crest']; rejects(s, 'crest');
  const l = newt(); delete l.parts.frill.label; rejects(l, 'label');
  const d = newt(); d.parts.frill.default = 'on'; rejects(d, 'default');
  const orphan = newt(); delete orphan.parts.frill; rejects(orphan, 'frill', 'part');
  const two = newt(); two.parts.spots = { label: 'Spots', shapes: ['frill'], default: true }; rejects(two, 'frill', 'two parts');
  const def = newt(); delete def.parts.frill.default; assert.equal(passes(def).value.parts.frill.default, true);
  const lib = hero(); lib.parts.wings = { label: 'Wings', default: true }; rejects(lib, 'wings');
});

// ---- clips ------------------------------------------------------------------------------------------------

test('clips: at least one, at most 32, names are ids', () => {
  const none = newt(); none.clips = {}; none.preview = undefined; rejects(none, 'clip');
  const many = newt();
  for (let i = 0; i < L.clips; i++) many.clips[`move${i}`] = { label: `Move ${i}`, frames: 1, fps: 1, loop: true, keys: [] };
  rejects(many, String(L.clips));
  const bad = newt(); bad.clips['Big Jump'] = { label: 'Big jump', frames: 1, fps: 1, loop: false, keys: [] }; rejects(bad, 'Big Jump');
});

test('clips: frames are whole, 1 to 64, and 256 in all; fps clamped to 1..30; loop true or false', () => {
  const f = newt(); f.clips.walk.frames = 65; rejects(f, String(L.framesPerClip));
  const z = newt(); z.clips.walk.frames = 0; rejects(z, 'frames');
  const w = newt(); w.clips.walk.frames = 7.5; rejects(w, 'whole');
  const all = newt();
  for (let i = 0; i < 4; i++) all.clips[`move${i}`] = { label: `Move ${i}`, frames: 60, fps: 10, loop: true, keys: [] };
  rejects(all, String(L.frames));
  const fps = newt(); fps.clips.walk.fps = 120; assert.equal(warns(fps, 'kept as').value.clips.walk.fps, 30);
  const lp = newt(); lp.clips.walk.loop = 1; rejects(lp, 'loop');
  const lb = newt(); delete lb.clips.walk.label; assert.equal(passes(lb).value.clips.walk.label, 'Walk');
});

test('clips: names checked against style guide 4 (advice)', () => {
  const syn = newt(); syn.clips.bite = syn.clips.attack; delete syn.clips.attack; warns(syn, 'bite', 'attack');
  const fr = newt(); fr.clips.walk.frames = 6; fr.clips.walk.sounds[1].frame = 3; warns(fr, 'walk', '8');
  const lp = newt(); lp.clips.attack.loop = true; warns(lp, 'attack', 'loop');
  const hurt = newt(); delete hurt.clips.hurt.frameEdits; warns(hurt, 'hurt', 'white');
  passes({ ...newt(), clips: { ...newt().clips, slam: { label: 'Slam', frames: 10, fps: 11, loop: false, keys: [] } } });
});

test('keys: at most 64, t clamped to 0..1, sorted (advice), no two at the same t, a known ease', () => {
  const many = newt(); many.clips.walk.keys = Array.from({ length: L.keysPerClip + 1 }, (_, i) => ({ t: i / 100 })); rejects(many, String(L.keysPerClip));
  const t = newt(); t.clips.walk.keys[0].t = -0.5; t.clips.walk.keys[3].t = 1.5;
  const v = warns(t, 'kept as').value.clips.walk.keys; assert.equal(v[0].t, 0); assert.equal(v[3].t, 1);
  const order = newt(); order.clips.walk.keys.reverse();
  assert.deepEqual(warns(order, 'order').value.clips.walk.keys.map((k) => k.t), [0, 0.25, 0.5, 0.75]);
  const same = newt(); same.clips.walk.keys[1].t = 0; rejects(same, 'same');
  const nt = newt(); delete nt.clips.walk.keys[1].t; rejects(nt, 't');
  const e = newt(); e.clips.walk.keys[0].ease = 'bouncy'; rejects(e, 'ease');
});

test('bone-rig keys: root, bones, ik, stretch, show and hide, each resolved and clamped', () => {
  const b = newt(); b.clips.walk.keys[0].bones.wing = 10; rejects(b, 'wing', 'not a bone');
  const ik = newt(); ik.clips.walk.keys[0].ik.hand = [0, 0]; rejects(ik, 'hand', 'ik');
  const st = newt(); st.clips.walk.keys[0].stretch = { tail1: 3 }; assert.equal(warns(st, 'kept as').value.clips.walk.keys[0].stretch.tail1, 1.5);
  const sb = newt(); sb.clips.walk.keys[0].stretch = { claw: 1 }; rejects(sb, 'claw');
  const a = newt(); a.clips.walk.keys[0].bones.tail1 = 1000; assert.equal(warns(a, 'kept as').value.clips.walk.keys[0].bones.tail1, 720);
  const spin = newt(); spin.clips.walk.keys[0].bones.tail1 = 540; assert.equal(passes(spin).value.clips.walk.keys[0].bones.tail1, 540);
  const root = newt(); root.clips.walk.keys[0].root = [500, 0]; assert.deepEqual(warns(root, 'kept as').value.clips.walk.keys[0].root, [48, 0]);
  const rootBad = newt(); rootBad.clips.walk.keys[0].root = [1]; rejects(rootBad, 'root');
  const sh = newt(); sh.clips.idle.keys[2].show = ['halo']; rejects(sh, 'halo');
  const both = newt(); both.clips.idle.keys[2].show = ['eye']; rejects(both, 'eye', 'show', 'hide');
  const ikb = newt(); ikb.clips.walk.keys[0].bones.thighF = 10; warns(ikb, 'thighF', 'ik');
  const lib = newt(); lib.clips.walk.keys[0].lean = 5; assert.equal(warns(lib, 'lean').value.clips.walk.keys[0].lean, undefined);
  const from = newt(); from.clips.walk.from = 'walk'; assert.equal(warns(from, 'from').value.clips.walk.from, undefined);
});

test('library-body keys: the pose fields, numbers clamped, pairs and flags of the right shape', () => {
  const u = hero(); u.clips.wave.keys[0].wings = 3; assert.equal(warns(u, 'wings').value.clips.wave.keys[0].wings, undefined);
  const arm = hero(); arm.clips.wave.keys[1].armF = { a: 160 }; rejects(arm, 'armF');
  const foot = hero(); foot.clips.wave.keys[1].footF = [1, 2]; rejects(foot, 'footF');
  const flag = hero(); flag.clips.idle.keys[2].blink = 'yes'; rejects(flag, 'blink');
  const lean = hero(); lean.clips.wave.keys[0].lean = 5000; assert.equal(warns(lean, 'kept as').value.clips.wave.keys[0].lean, 720);
  const share = hero(); share.clips.wave.keys[0].glow = 3; assert.equal(warns(share, 'kept as').value.clips.wave.keys[0].glow, 1);
  const bones = hero(); bones.clips.wave.keys[0].bones = { head: 3 }; warns(bones, 'bones');
  const from = hero(); from.clips.wave.from = 'moonwalk'; rejects(from, 'moonwalk');
});

test('library figure: known parts with values of the right kind', () => {
  const k = hero(); k.body.figure.held.kind = 'banana'; rejects(k, 'banana');
  const c = hero(); c.body.figure.look.skin = 'pink'; rejects(c, '#rrggbb');
  const st = hero(); st.body.figure.stance = 'dancing'; rejects(st, 'dancing');
  const n = hero(); n.body.figure.body.height = 7; assert.equal(warns(n, 'kept as').value.body.figure.body.height, 1);
  const x = hero(); x.body.figure.render = 'code'; assert.equal(warns(x, 'render').value.body.figure.render, undefined);
  const mv = hero(); mv.body.figure.moves.wave = 'fly'; rejects(mv, 'fly');
  const hs = hero(); hs.body.figure.hair.style = 'mohawk'; rejects(hs, 'mohawk');
});

test('frameEdits: a frame of the clip, nudge in whole pixels, show and hide shapes, flash', () => {
  const out = newt(); out.clips.hurt.frameEdits['9'] = { flash: true };
  assert.equal(warns(out, 'frame 9').value.clips.hurt.frameEdits['9'], undefined);
  const nan = newt(); nan.clips.hurt.frameEdits.first = { flash: true }; warns(nan, 'first');
  const n = newt(); n.clips.hurt.frameEdits['0'].nudge = [1.6, 0]; assert.deepEqual(warns(n, 'whole').value.clips.hurt.frameEdits['0'].nudge, [2, 0]);
  const big = newt(); big.clips.hurt.frameEdits['0'].nudge = [99, 0]; assert.deepEqual(warns(big, 'kept as').value.clips.hurt.frameEdits['0'].nudge, [48, 0]);
  const s = newt(); s.clips.hurt.frameEdits['1'] = { show: ['wing'] }; rejects(s, 'wing');
  const f = newt(); f.clips.hurt.frameEdits['0'].flash = 'white'; rejects(f, 'flash');
  const lib = hero(); lib.clips.wave.frameEdits['2'].show = ['eye']; rejects(lib, 'show');
});

test('sounds: an id, a frame of the clip, an optional preset and volume', () => {
  const ids = ['footstep-grass', 'whoosh', 'punch', 'monster-fade'];
  passes(newt(), { soundIds: ids });
  const u = newt(); u.clips.walk.sounds[0].sound = 'footstep-lava'; rejects(u, { soundIds: ids }, 'footstep-lava');
  passes(u);                                         // no sound list given: the id is only checked for its form
  const bad = newt(); bad.clips.walk.sounds[0].sound = 'Foot Step'; rejects(bad, 'sound');
  const fr = newt(); fr.clips.walk.sounds[0].frame = 8; assert.equal(warns(fr, 'frame 8').value.clips.walk.sounds.length, 1);
  const v = newt(); v.clips.walk.sounds[0].volume = 4; assert.equal(warns(v, 'kept as').value.clips.walk.sounds[0].volume, 1);
  const many = newt(); many.clips.walk.sounds = Array.from({ length: L.soundsPerClip + 1 }, () => ({ sound: 'whoosh', frame: 0 })); rejects(many, String(L.soundsPerClip));
  const pr = newt(); pr.clips.walk.sounds[0].preset = 'p'.repeat(61); rejects(pr, '60');
});

test('preview is a clip; made says where it came from', () => {
  rejects({ ...newt(), preview: 'swim' }, 'preview');
  rejects({ ...newt(), made: { in: 'studio', from: 'a car park' } }, 'made');
  rejects({ ...newt(), made: { in: 'photoshop', from: 'new' } }, 'made');
  for (const from of ['new', 'template:four-legs', 'library:knight']) assert.equal(passes({ ...newt(), made: { in: 'studio', from } }).value.made.from, from);
  rejects({ ...newt(), made: { in: 'studio', from: 'new', by: 'b'.repeat(61) } }, '60');
});
