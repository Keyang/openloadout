// engine/data-sprite.js and rigs/humanoid-studio.js figureFor, studio item F1: a library body written with the grown
// format becomes the sprite a hand-written figure sprite is (docs/studio.md 2.3): its controls keep their kind, label,
// range, step, group, `when`, `was`, options and swatches, in the order the definition lists them; its parts are
// Contract 3 parts with params, none and socket; its sounds keep `when`; its versions are the sprite's versions; and
// the figure it draws takes each choice and slider in the field it `sets` and each painted colour from body.paint.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { defaultParams, cleanParams, inEffect, cueInEffect, partList, renderFrame, frameSockets } from '../../engine/sprite.js';
import { tone } from '../../engine/color.js';
import { apart } from '../../rigs/humanoid-figure.js';
import * as F from '../../rigs/humanoid-figure.js';
import * as S from '../../rigs/humanoid-studio.js';
import { Surface } from '../../engine/surface.js';
import { dataSprite, makeDataSprite } from '../../engine/data-sprite.js';

const def = JSON.parse(fs.readFileSync(new URL('../fixtures/studio/f1-rogue.json', import.meta.url), 'utf8'));
const s = dataSprite(def);
const P = defaultParams(s);

test('F1 data-sprite: controls in the order the definition lists them, each of its own kind, words and range', () => {
  assert.deepEqual(Object.keys(s.params), ['outfit', 'trim', 'height', 'weapon', 'weaponLength', 'headgear', 'skin', 'metal', 'bounce', 'speed'],
    'colour slots with no colour control first, then the controls as listed');
  assert.deepEqual(s.params.weapon, { kind: 'choice', label: 'Weapon', def: 'daggers', options: ['Daggers', 'Short sword', 'Claws', 'None'].map((label, i) => ({ value: ['daggers', 'short sword', 'claws', 'none'][i], label })), group: 'Look' });
  assert.deepEqual(s.params.headgear.options[2], { value: 'none', label: 'Bare head' });
  assert.deepEqual(s.params.headgear.was, { cowl: 'hood' });
  assert.deepEqual(s.params.weaponLength, { kind: 'range', label: 'Length', def: 1, min: 0.65, max: 1.35, step: 0.05, lo: 'Short', hi: 'Long', group: 'Look' });
  assert.equal(s.params.bounce.group, 'Motion');
  assert.deepEqual(s.params.metal, { kind: 'color', label: 'Metal', def: '#c2c9d6', swatches: ['#c2c9d6', '#f2c230'], group: 'Colors', when: { weapon: ['daggers', 'short sword', 'claws'] } });
  assert.deepEqual(s.params.skin.swatches, ['#f6d3b0', '#e8b088']);
  assert.equal(s.params.skin.material, undefined, 'a colour control has a material only when it says so');
  assert.equal(s.params.outfit.kind, 'color', 'a slot with no colour control still gets one');
  assert.deepEqual(s.params.speed, { kind: 'range', label: 'Speed', def: 0.5, min: 0, max: 1, step: 0.01, lo: 'Slow', hi: 'Fast', group: 'Motion' });
});

test('F1 data-sprite: parts, `when`, sounds with `when`, versions, old choice values', () => {
  assert.deepEqual(partList(s).map((x) => [x.name, x.label, x.params, x.none, x.socket]), [
    ['weapon', 'Weapon', ['weapon', 'weaponLength', 'metal'], 'none', 'hand'],
    ['headgear', 'Headgear', ['headgear'], ['none'], 'head'],
  ]);
  assert.equal(inEffect(s, 'metal', P), true);
  assert.equal(inEffect(s, 'metal', { ...P, weapon: 'none' }), false);
  assert.equal(inEffect(s, 'weaponLength', { ...P, weapon: 'none' }), false);
  const [blade, whoosh] = s.sounds.attack;
  assert.equal(cueInEffect(s, blade, P), true);
  assert.equal(cueInEffect(s, whoosh, P), false);
  assert.equal(cueInEffect(s, whoosh, { ...P, weapon: 'none' }), true);
  assert.deepEqual(s.versions.map((v) => v.name), ['Swordsman', 'Bare hands']);
  assert.equal(cleanParams(s, { headgear: 'cowl' }).headgear, 'hood');
  assert.equal(cleanParams(s, s.versions[1].params).headgear, 'hood', 'a version may hold an old value; it opens as the new one');
});

test('F1 figureFor: each choice and slider in the field it sets; each painted colour from the settings; nothing else follows a colour', () => {
  const at = (p) => { const { keys, keysFor, ...fig } = S.figureFor(s.definition, p); return fig; };
  const fig = at(P);
  assert.equal(fig.held.kind, 'daggers');
  assert.equal(fig.held.length, 1);
  assert.equal(fig.motion.bounce, 0.5);
  const other = { ...P, weapon: 'claws', weaponLength: 1.3, headgear: 'none', bounce: 0.9, height: 0.1, outfit: '#c9423a', trim: '#c9423a', skin: '#e8b088', metal: '#f2c230' };
  const o = at(other);
  assert.deepEqual([o.held.kind, o.held.length, o.headgear.kind, o.motion.bounce, o.body.height], ['claws', 1.3, 'none', 0.9, 0.1]);
  assert.equal(o.look.skin, '#e8b088');
  assert.equal(o.look.top, '#c9423a');
  assert.equal(o.look.bottom, tone('#c9423a', -0.6));
  assert.equal(o.look.boots, apart('#c9423a', '#c9423a', 0.05));
  assert.notEqual(o.look.boots, '#c9423a', 'the trim stands clear of the cloth when both are the same colour');
  assert.equal(o.held.metal, '#f2c230');
  assert.equal(o.scarf.colour, apart('#c9423a', [['#c9423a', 0.05]]));
  assert.equal(at({ ...other, weapon: 'none' }).scarf.colour, '#c9423a', 'choose follows the weapon');
  // with paint, a figure colour no rule names is kept, even when it equals a slot's default (no matching by value)
  const fixed = { ...s.definition, body: { ...s.definition.body, figure: { ...s.definition.body.figure, hair: { style: 'short', colour: '#5a5f7a' } } } };
  assert.equal(S.figureFor(fixed, { ...P, trim: '#c9423a' }).hair.colour, '#5a5f7a');
  // a choice's map puts the field's own value in the figure for an option that stands for it
  const mapped = JSON.parse(JSON.stringify(s.definition)); mapped.controls[3].map = { hood: 'plumed helmet' };
  assert.equal(S.figureFor(mapped, P).headgear.kind, 'plumed helmet');
  assert.equal(S.figureFor(mapped, { ...P, headgear: 'bandana' }).headgear.kind, 'bandana');
  // missing settings are the defaults
  assert.deepEqual(at({}), at(P));
});

test('F1 data-sprite: every frame is the figure module drawing figureFor at those settings; sockets too', () => {
  const other = cleanParams(s, { weapon: 'short sword', weaponLength: 1.3, headgear: 'bandana', outfit: '#7a4fc4', trim: '#7a4fc4', height: 0.8 });
  for (const p of [P, other]) for (const [clip, c] of Object.entries(s.clips)) for (let f = 0; f < c.frames; f++) {
    const t = c.loop ? f / c.frames : f / (c.frames - 1);
    const { keys, keysFor, ...fig } = S.figureFor(s.definition, p);
    const g = new Surface(64, 64); F.render(g, clip, t, fig);
    assert.deepEqual(renderFrame(s, clip, f, p).data, g.data, `${clip} ${f}`);
    assert.equal(JSON.stringify(frameSockets(s, clip, f, p)), JSON.stringify(F.sockets(clip, t, fig)), `${clip} ${f} sockets`);
  }
});

test('F1 data-sprite: a definition the format refuses is never built; makeDataSprite says why', () => {
  const bad = JSON.parse(JSON.stringify(def)); bad.body.paint['look.top'] = { rule: 'eval' };
  const r = makeDataSprite(bad);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /eval/);
  assert.throws(() => dataSprite(bad), /eval/);
});

test('F1 figureFor (review issue 4): a control never brings in a part the stored figure has not; a block with defaults (motion) it does', () => {
  const gone = JSON.parse(JSON.stringify(s.definition)); delete gone.body.figure.held;
  assert.equal(S.figureFor(gone, P).held, undefined, 'no held without a held in the figure, as paint never adds one');
  assert.equal(S.figureFor(gone, { ...P, weapon: 'claws', weaponLength: 1.3 }).held, undefined);
  const still = JSON.parse(JSON.stringify(s.definition)); delete still.body.figure.motion;
  assert.equal(S.figureFor(still, { ...P, bounce: 0.9 }).motion.bounce, 0.9);
});

test('F1 figureFor (review issue 3): the painted figure is worked out once per settings, and every call gets its own copy', () => {
  // a heavy but legal paint (under the node cap): standOut rules two deep on every painted field
  const heavy = JSON.parse(JSON.stringify(def));
  const e1 = { rule: 'standOut', against: 'outfit', from: ['trim', 'skin', { rule: 'tone', of: 'trim', by: 1 }] };
  const e = { rule: 'standOut', against: e1, from: [e1, e1, 'trim'] };
  for (const k of Object.keys(heavy.body.paint)) heavy.body.paint[k] = e;
  const h = dataSprite(heavy);
  const first = S.figureFor(h.definition, P);
  const time = (fn) => { const t0 = performance.now(); for (let i = 0; i < 40; i++) fn(i); return performance.now() - t0; };
  time((i) => S.figureFor(h.definition, { ...P, outfit: `#${(0x100000 + i * 0x31).toString(16)}` }));      // warm up
  const misses = time((i) => S.figureFor(h.definition, { ...P, outfit: `#${(0x200000 + i * 0x2f).toString(16)}` }));
  const hits = time(() => S.figureFor(h.definition, P));
  assert.ok(hits < misses * 0.5, `40 calls at one setting (${hits.toFixed(2)} ms) cost well under 40 at new settings (${misses.toFixed(2)} ms)`);
  const a = S.figureFor(h.definition, P), b = S.figureFor(h.definition, P);
  assert.deepEqual(a, first);
  a.look.top = '#000000';
  assert.notEqual(b.look.top, '#000000', 'callers do not share one figure');
  assert.notEqual(S.figureFor(h.definition, P).look.top, '#000000');
  // other settings are worked out again
  assert.deepEqual(S.figureFor(h.definition, { ...P, outfit: '#c9423a' }).look, S.figureFor(JSON.parse(JSON.stringify(h.definition)), { ...P, outfit: '#c9423a' }).look);
});
