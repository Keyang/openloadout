// catalog/sprite-schema.js: the top-level fields of format v2 (docs/data-sprites.md 2.1, 2.5 controls, 2.6 bindings,
// colour rules, when, variants and parts, 2.8), each field and each cap.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateSprite, SPRITE_LIMITS, PAINT_TONES } from '../../catalog/sprite-schema.js';
import { stubRegistry, stubPieces } from '../fixtures/v2/registry.mjs';

const load = (n) => JSON.parse(fs.readFileSync(new URL(`../fixtures/v2/${n}.json`, import.meta.url), 'utf8'));
const opts = { generators: stubRegistry(), pieces: stubPieces() };
const check = (d, o = opts) => validateSprite(d, o);
const errs = (d, o) => check(d, o).errors.join('\n');
const warns = (d, o) => check(d, o).warnings.join('\n');

test('the caps are the design\'s (2.7 and 3.4)', () => {
  const L = SPRITE_LIMITS;
  assert.equal(L.jsonBytes, 128 * 1024);
  assert.equal(L.nesting, 20);
  assert.equal(L.primitives, 400);
  assert.equal(L.expanded, 4000);
  assert.equal(L.stampPixels, 8192);
  assert.equal(L.generatorCalls, 64);
  assert.equal(L.nodes, 64);
  assert.equal(L.pieces, 24);
  assert.equal(L.frames, 256);
  assert.equal(L.frameWidth, 640); assert.equal(L.frameHeight, 360);
  assert.equal(L.palette, 12); assert.equal(L.controls, 48); assert.equal(L.versions, 24);
  assert.ok(Object.isFrozen(L));
  assert.deepEqual([...PAINT_TONES], ['light', 'base', 'dark', 'deep', 'far']);
});

test('header, id, name, blurb, meta', () => {
  const d = load('coin');
  assert.match(errs({ ...d, format: 'loadout-thing' }), /format/);
  assert.match(errs({ ...d, id: 'Coin' }), /lowercase/);
  assert.match(errs({ ...d, id: 'toString' }), /every object already has/);
  assert.match(errs({ ...d, name: '' }), /name/);
  assert.match(errs({ ...d, name: 'x'.repeat(61) }), /60/);
  assert.match(errs({ ...d, blurb: 'a‮b' }), /invisible/);
  assert.match(errs({ ...d, meta: { ...d.meta, type: 'spaceship' } }), /type/);
  assert.match(errs({ ...d, id: 'coin' }, { ...opts, catalogIds: ['coin'] }), /already used/);
  const gap = { ...d, meta: { ...d.meta, license: undefined } };
  assert.equal(check(gap).ok, true, 'a missing licence is advice');
  assert.equal(check(gap, { ...opts, strict: true }).ok, false, 'and an error for a library file (strict)');
});

test('size, pivot, grounded: any frame up to 640 x 360 in whole pixels; the pivot inside it', () => {
  const d = load('coin');
  assert.equal(check({ ...d, size: [640, 360] }).ok, true);
  assert.match(errs({ ...d, size: [641, 32] }), /640/);
  assert.match(errs({ ...d, size: [32.5, 32] }), /whole/);
  assert.match(errs({ ...d, size: 32 }), /size/);
  assert.match(errs({ ...d, pivot: [40, 10] }), /pivot/);
  const r = check({ ...d, pivot: undefined });
  assert.deepEqual(r.value.pivot, [16, 16], 'not grounded: the frame centre');
  assert.match(errs({ ...d, grounded: 'yes' }), /grounded/);
});

test('palette: at most 12 slots, each with a material, a default, swatches from a palette; derived slots by colour rule', () => {
  const d = load('knight');
  const r = check(d);
  assert.deepEqual(r.value.palette.find((s) => s.id === 'trousers').derive, { rule: 'tone', of: 'outfit', by: -0.6 });
  const many = load('coin'); many.palette = Array.from({ length: 13 }, (_, i) => ({ id: `c${i}`, label: `C${i}`, default: '#102030', material: 'paint' }));
  assert.match(errs(many), /12/);
  const noMat = load('coin'); delete noMat.palette[0].material;
  assert.match(errs(noMat), /material/);
  const badMat = load('coin'); badMat.palette[0].material = 'cheese';
  assert.match(errs(badMat), /cheese/);
  const sw = load('coin'); sw.palette[0].swatches = ['#e8b23a', { palette: 'hearthvale', family: 'metal' }];
  assert.equal(check(sw).ok, true, 'swatches as hex or { palette, family, lead }');
  sw.palette[0].swatches = [{ palette: 'hearthvale', family: 'cheese' }];
  assert.match(errs(sw), /swatch/);
  const loop = load('knight'); loop.palette[1] = { id: 'outfit', derive: { rule: 'tone', of: 'trousers', by: 0.6 }, material: 'cloth' };
  assert.match(errs(loop), /loop/);
  const twice = load('coin'); twice.palette[1].id = 'gold';
  assert.match(errs(twice), /twice/);
  const alias = load('coin'); alias.colours = alias.palette; delete alias.palette;
  assert.equal(check(alias).ok, true, 'v1\'s colours (a list) is kept as an alias');
  const both = load('coin'); both.colours = both.palette;
  assert.match(errs(both), /palette.*colours|colours.*palette/);
  const hexPaint = load('coin'); hexPaint.body.pictures.draw[0].paint = '#ff0000';
  assert.match(errs(hexPaint), /palette/);
  const noSlot = load('coin'); noSlot.body.pictures.draw[0].paint = 'silver.dark';
  assert.match(errs(noSlot), /"silver"/);
  const badTone = load('coin'); badTone.body.pictures.draw[0].paint = 'gold.shiny';
  assert.match(errs(badTone), /shiny/);
});

test('controls: range, choice, toggle, colour and speed; at most 48; keys once', () => {
  const d = load('knight');
  const r = check(d);
  assert.equal(r.value.controls.find((c) => c.key === 'height').scales.by[0], 0.85);
  const many = load('coin');
  many.controls = Array.from({ length: 49 }, (_, i) => ({ key: `k${i}`, kind: 'range', label: `K${i}` }));
  assert.match(errs(many), /48/);
  const dup = load('coin'); dup.controls.push({ key: 'size', kind: 'toggle', label: 'Again' });
  assert.match(errs(dup), /twice/);
  const slotKey = load('coin'); slotKey.controls.push({ key: 'gold', kind: 'toggle', label: 'Gold' });
  assert.match(errs(slotKey), /"gold".*twice|used twice/);
  const kind = load('coin'); kind.controls[0].kind = 'knob';
  assert.match(errs(kind), /knob/);
  const choice = load('knight'); choice.controls[1].default = 'hat';
  assert.match(errs(choice), /default/);
  const one = load('knight'); one.controls[4].options = ['sword'];
  assert.match(errs(one), /options/);
  const tog = load('coin'); tog.controls[1].default = 'on';
  assert.match(errs(tog), /true or false/);
  const rng = load('coin'); rng.controls[0].min = 1; rng.controls[0].max = 0;
  assert.match(errs(rng), /min/);
  const sets = load('coin'); sets.controls[0].sets = 'body.height';
  assert.match(errs(sets), /library bod/i);
  const reserved = load('coin'); reserved.controls.push({ key: 'clip', kind: 'toggle', label: 'Clip' });
  assert.match(errs(reserved), /"clip"/);
  const colour = load('coin'); colour.controls.push({ key: 'gold', kind: 'colour', label: 'Coin colour', swatches: ['#e8b23a', '#c0c0c0'] });
  assert.equal(check(colour).ok, true, 'a colour control gives a slot its label and swatches');
  colour.controls.push({ key: 'nothing', kind: 'colour' });
  assert.match(errs(colour), /"nothing"/);
  const look = load('coin'); look.controls[0].look = 'keep'; look.controls[1].look = 'vary';
  assert.equal(check(look).ok, true);
  look.controls[0].look = 'wild';
  assert.match(errs(look), /look/);
});

test('a control nothing names is refused: it would do nothing', () => {
  const d = load('coin'); d.controls.push({ key: 'wobble', kind: 'range', label: 'Wobble' });
  assert.match(errs(d), /"wobble".*nothing/);
  const t = load('coin'); t.controls.push({ key: 'sparkle', kind: 'toggle', label: 'Sparkle' });
  assert.match(errs(t), /"sparkle".*nothing/);
  const c = load('coin'); c.palette.push({ id: 'unused', label: 'Unused', default: '#123456', material: 'paint' });
  assert.match(errs(c), /"unused".*paints nothing|nothing paints/);
  // named only in another control's `when`: that does something (it shows or hides the other control)
  const w = load('coin'); w.controls.push({ key: 'fancy', kind: 'toggle', label: 'Fancy' }); w.controls[0].when = { fancy: [true] };
  assert.equal(check(w).ok, true);
  // a part's selector is named by the part
  const k = load('knight');
  assert.equal(check(k).ok, true, 'weapon is the selector of the weapon part');
});

test('bindings: one control, a table (map) or a pick, never a formula', () => {
  const ok = load('coin');
  const ell = ok.body.pictures.draw[0];
  ell.r[0] = { from: 'size', map: [[0, 5], [0.5, 6], [1, 8]], round: 'half' };
  assert.equal(check(ok).ok, true);
  const cases = [
    [{ from: 'size', map: [[0, 5]] }, /2/],
    [{ from: 'size', map: [[1, 5], [0, 8]] }, /ascending|order/],
    [{ from: 'size', map: [[0, 5], [2, 8]] }, /outside/],
    [{ from: 'nope', map: [[0, 5], [1, 8]] }, /"nope"/],
    [{ from: 'size', map: [[0, 5], [1, 8]], round: 'up' }, /round/],
    [{ from: 'size', expr: 'size * 3' }, /dropped|expr/],
    [{ from: 'shine', map: [[0, 5], [1, 8]] }, /pick/],
    [{ from: 'size', pick: { small: 5 } }, /pick/],
    ['size * 3', /number/],
    [{ from: 'size', map: Array.from({ length: 40 }, (_, i) => [i / 40, 5]) }, /32/],
  ];
  for (const [b, re] of cases) {
    const d = load('coin');
    d.body.pictures.draw[0].r[0] = b;
    const r = check(d);
    assert.match([...r.errors, ...r.warnings].join('\n'), re, JSON.stringify(b));
  }
  const pick = load('knight');
  pick.body.rig.shapes[2].args.style.pick = { short: 'crop' };
  assert.match(errs(pick), /"long"/, 'a pick gives every option a value');
  const tog = load('coin');
  tog.body.pictures.draw[0].r[1] = { from: 'shine', pick: { true: 8, false: 5 } };
  tog.controls.splice(0, 1);
  tog.body.pictures.draw[0].r[0] = 6;
  assert.equal(check(tog).ok, true, 'a toggle picks with "true" and "false"');
});

test('colour rules: the framework\'s named rules only, nested at most 6 deep, arguments checked', () => {
  const d = load('knight');
  d.palette[2].derive = { rule: 'mix', of: 'outfit', with: { rule: 'ramp', of: 'skin', tone: 'dark' }, amount: 0.5 };
  assert.equal(check(d).ok, true);
  d.palette[2].derive = { rule: 'blend', of: 'outfit' };
  assert.match(errs(d), /"blend"/);
  d.palette[2].derive = { rule: 'tone', of: 'outfit', by: 9 };
  assert.match(errs(d), /by/);
  d.palette[2].derive = { rule: 'tone', of: 'outfit' };
  assert.match(errs(d), /by/);
  let deep = 'outfit';
  for (let i = 0; i < 8; i++) deep = { rule: 'tone', of: deep, by: 0.1 };
  d.palette[2].derive = deep;
  assert.match(errs(d), /deep|nested/);
  d.palette[2].derive = { rule: 'choose', when: { headgear: ['helmet'] }, then: 'metal', else: 'outfit' };
  assert.equal(check(d).ok, true, 'choose reads the settings with a when');
});

test('when: on controls, shapes and sound cues; clip and direction on shapes; loops refused', () => {
  const d = load('knight');
  d.controls[2].when = { headgear: ['cap'] };
  assert.match(errs(d), /"cap"/);
  const self = load('knight'); self.controls[2].when = { hair: ['short'] };
  assert.match(errs(self), /itself/);
  const loop = load('knight'); loop.controls[1].when = { hair: ['short'] };
  assert.match(errs(loop), /loop/);
  const clip = load('coin'); clip.body.pictures.draw[1].when = { clip: ['spin'] };
  assert.equal(check(clip).ok, true);
  clip.body.pictures.draw[1].when = { clip: ['roll'] };
  assert.match(errs(clip), /"roll"/);
  const dir = load('coin'); dir.body.pictures.draw[1].when = { direction: ['north'] };
  assert.match(errs(dir), /north/);
  const ctrlClip = load('coin'); ctrlClip.controls[0].when = { clip: ['spin'] };
  assert.match(errs(ctrlClip), /clip/);
  const many = load('coin'); many.controls[0].when = Array.from({ length: 9 }, () => ({ shine: [true] }));
  assert.match(errs(many), /8/);
});

test('parts (Contract 3): selector first, none among its options, shapes that exist, a socket', () => {
  const d = load('knight');
  const r = check(d);
  assert.deepEqual(r.value.parts.weapon, { label: 'Weapon', params: ['weapon', 'swordLength'], none: 'none', socket: 'hand', shapes: ['sword'] });
  const bad = load('knight'); bad.parts.weapon.shapes = ['axe'];
  assert.match(errs(bad), /"axe"/);
  const none = load('knight'); none.parts.weapon.none = 'unarmed';
  assert.match(errs(none), /unarmed/);
  const sel = load('knight'); sel.parts.weapon.params = ['swordLength', 'weapon'];
  assert.match(errs(sel), /choice|on\/off/);
  const sock = load('knight'); sock.parts.weapon.socket = 'tail';
  assert.match(errs(sock), /socket/);
  const two = load('knight'); two.parts.shield = { label: 'Shield', params: ['weapon'], shapes: ['sword'] };
  assert.match(errs(two), /two parts/);
  const many = load('knight');
  for (let i = 0; i < 17; i++) many.parts[`p${i}`] = { label: 'P', shapes: [] };
  assert.match(errs(many), /16/);
});

test('versions: ready-made settings, each value one the control takes', () => {
  const d = load('knight');
  d.versions = [{ name: 'Bare head', params: { headgear: 'none' } }, { name: 'Old helmet', params: { headgear: 'plumed helmet' } }];
  assert.equal(check(d).ok, true);
  d.versions.push({ name: 'Bare head', params: {} });
  assert.match(errs(d), /twice/);
  const bad = load('knight'); bad.versions = [{ name: 'Odd', params: { headgear: 'cap' } }];
  assert.match(errs(bad), /cap/);
  const many = load('knight'); many.versions = Array.from({ length: 25 }, (_, i) => ({ name: `V${i}`, params: {} }));
  assert.match(errs(many), /24/);
});

test('clips: frames, fps, loop, keys, frame edits, sounds; at most 256 frames in all', () => {
  const d = load('coin');
  d.clips.spin.frames = 65;
  assert.match(errs(d), /64/);
  const all = load('coin');
  for (let i = 0; i < 5; i++) all.clips[`c${i}`] = { frames: 60, fps: 10 };
  assert.match(errs(all), /256/);
  const fe = load('coin'); fe.clips.collect.frameEdits = { 0: { flash: true, nudge: [0, -1], hide: ['mark'], swap: { mark: null } } };
  assert.equal(check(fe).ok, true);
  fe.clips.collect.frameEdits = { 0: { hide: ['ghost'] } };
  assert.match(errs(fe), /"ghost"/);
  const snd = load('coin'); snd.clips.collect.sounds[0].sound = 'no-such';
  assert.match(errs(snd, { ...opts, soundIds: ['coin-pickup'] }), /no-such/);
  const keys = load('coin'); keys.clips.spin.keys = [{ t: 0.5 }, { t: 0.5 }];
  assert.match(errs(keys), /same point/);
  const keyBad = load('coin'); keyBad.clips.spin.keys = [{ t: 0, bones: { coin: 10 } }];
  assert.match(warns(keyBad), /dropped.*bones/);
  const noFrames = load('coin'); delete noFrames.clips.spin.frames;
  assert.match(errs(noFrames), /frames/);
  const name = load('coin'); name.clips['Spin It'] = { frames: 1 };
  assert.match(errs(name), /clip name/);
  const prev = load('coin'); prev.preview = 'bounce';
  assert.match(errs(prev), /preview/);
});

test('points, slice, text area, materials, made, styles, rev and renamed controls', () => {
  const d = load('coin');
  d.points = [{ id: 'hand', on: 'coin', at: [0, 2] }, { id: 'feet', ground: true }];
  d.materials = { rest: 'metal' };
  d.made = { in: 'studio', from: 'library:coin' };
  d.rev = 'a1b2c3d4';
  d.was = { controls: { scale: 'size' } };
  d.stylesWhy = 'Only pixels for now.';
  const r = check(d);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.value.was, { controls: { scale: 'size' } });
  assert.match(errs({ ...d, points: [{ id: 'hand', on: 'ghost', at: [0, 0] }] }), /"ghost"/);
  assert.match(errs({ ...d, materials: { rest: 'cheese' } }), /cheese/);
  assert.match(errs({ ...d, made: { in: 'sandbox', from: 'source' } }), /made/);
  assert.match(errs({ ...d, styles: ['pixel', 'pixel'] }), /twice/);
  assert.match(errs({ ...d, styles: ['oil-paint'] }), /oil-paint/);
  assert.match(errs({ ...d, styles: [] }), /styles/);
  assert.match(errs({ ...d, was: { controls: { scale: 'nothing' } } }), /"nothing"/);
  assert.match(errs({ ...d, was: { controls: { size: 'size' } } }), /"size"/);
  assert.match(errs({ ...d, rev: 'x'.repeat(80) }), /rev/);
  const sl = { ...d, slice: { spin: { left: 2, top: 2, right: 2, bottom: 2 } } };
  assert.equal(check(sl).ok, true, 'slice per clip');
  assert.match(errs({ ...d, slice: { roll: { left: 2, top: 2, right: 2, bottom: 2 } } }), /"roll"/);
  assert.match(errs({ ...d, textArea: { x: 0, y: 0, w: 99, h: 4 } }), /text area|textArea/);
});
