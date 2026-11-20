// Build item B4x (docs/data-sprites.md 2.2): the two format features a sprite on a base piece needs to keep exactly the
// clips its code sprite had (the B16a2 review: without them 6 of 7 side-view humanoids cannot be redrawn faithfully).
//   1. a clip list on `extends`: `"clips": ["idle", "walk", { "name": "slash", "from": "swing" }]` names which of the
//      base's clips the sprite takes, in that order, and may rename one; without the list the sprite takes every clip
//      of its base, as before. A clip's `from` may still name any clip of the base, listed or not
//   2. a clip's `from` may pick the base clip by a setting: `{ "from": { "from": "weapon", "pick": { "none": "punch",
//      "sword": "swing" } } }`, checked as any binding is (catalog/sprite-schema.js binding: every option given, each
//      value a clip of the base, a choice or on/off control) and resolved to the clip's name (engine/resolve.js clipsOf)
// Held for the validator (validateSprite: errors and the sprite's clip list) and the resolver (resolveSprite: the
// clips, their keys, frames and the `from` they came from), on a small test base.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSprite } from '../../catalog/sprite-schema.js';
import { resolveSprite } from '../../engine/resolve.js';
import { createPieceStore, pieceRegistry } from '../../engine/pieces.js';
import { makeDataSprite } from '../../engine/data-sprite.js';

/** A base with five clips, each posing the arm at its own angle, so a clip's keys tell where it came from. */
const clip = (frames, angle, extra = {}) => ({ frames, fps: 10, loop: false, keys: [{ t: 0, bones: { arm: angle } }], ...extra });
const BASE = {
  format: 'loadout-piece', version: 1, id: 'base:test-mover', v: 1, name: 'Mover', about: 'A post with an arm and five clips, for tests.',
  slots: [{ id: 'wood', label: 'Wood', default: '#8a5a2a', material: 'wood' }],
  body: {
    rig: {
      size: [32, 32],
      bones: [{ id: 'post', parent: null, at: [16, 28], angle: 180, length: 10 }, { id: 'arm', parent: 'post', from: 1, angle: 90, length: 6 }],
      shapes: [{ id: 'stake', kind: 'limb', on: 'post', width: 3, paint: 'wood', z: 10 }, { id: 'limb', kind: 'limb', on: 'arm', width: 2, paint: 'wood', z: 12 }],
    },
    clips: {
      idle: clip(1, 90, { loop: true }), walk: clip(4, 80, { loop: true }), swing: clip(6, 40), jab: clip(6, 10), punch: clip(6, 130),
    },
  },
};
const store = () => { const s = createPieceStore(); s.add(JSON.stringify(BASE), 'base-test-mover.v1.json'); return s; };
const PIECES = { pieces: pieceRegistry(store()) };
const WEAPON = { key: 'weapon', kind: 'choice', label: 'Weapon', options: ['sword', 'spear', 'none'], default: 'sword' };
const SHIELD = { key: 'shield', kind: 'toggle', label: 'Shield', default: true };
/** A sprite on the test base; ext goes on extends, more on the sprite (controls, clips). */
const sprite = (ext = {}, more = {}) => ({
  format: 'loadout-sprite', version: 2, id: 'mover-test', name: 'Mover', blurb: 'A mover for tests.', size: [32, 32], pivot: [16, 28],
  meta: { type: 'character', role: 'characters/enemy', view: 'side', themes: ['neutral'], gameTypes: ['platformer'], words: ['mover', 'post', 'arm', 'swing', 'jab', 'punch'], license: 'draft' },
  palette: [{ id: 'wood', label: 'Wood', default: '#8a5a2a', material: 'wood' }],
  body: { rig: { extends: { use: 'base:test-mover', v: 1, ...ext } } },
  ...more,
});
const V = (def) => validateSprite(def, PIECES);
const R = (def, settings = {}) => resolveSprite(def, settings, { pieces: store() });
const ok = (r) => assert.equal(r.ok, true, r.errors.join('; '));
const fails = (r, re) => { assert.equal(r.ok, false, 'should fail'); assert.ok(r.errors.some((e) => re.test(e)), `expected ${re}, got: ${r.errors.join(' | ')}`); };
const armOf = (c) => c.keys[0].bones.arm;
const PICK = { from: 'weapon', pick: { sword: 'swing', spear: 'jab', none: 'punch' } };

// ---- 1. the clip list on extends ---------------------------------------------------------------------------------

test('without a clip list a sprite takes every clip of its base, as before', () => {
  const v = V(sprite());
  ok(v);
  assert.deepEqual(v.clips, ['idle', 'walk', 'swing', 'jab', 'punch']);
  const r = R(sprite());
  ok(r);
  assert.deepEqual(Object.keys(r.clips), ['idle', 'walk', 'swing', 'jab', 'punch']);
});

test('a clip list takes only the clips it names, in its order, each inheriting its base clip', () => {
  const def = sprite({ clips: ['walk', 'idle', 'swing'] });
  const v = V(def);
  ok(v);
  assert.deepEqual(v.warnings, []);
  assert.deepEqual(v.clips, ['walk', 'idle', 'swing']);
  assert.deepEqual(v.value.body.rig.extends.clips, ['walk', 'idle', 'swing'], 'the cleaned definition keeps the list');
  assert.equal(v.value.preview, 'walk', 'the first clip is the preview');
  const r = R(def);
  ok(r);
  assert.deepEqual(Object.keys(r.clips), ['walk', 'idle', 'swing']);
  assert.deepEqual([r.clips.walk.frames, armOf(r.clips.walk)], [4, 80]);
  assert.deepEqual([r.clips.swing.frames, armOf(r.clips.swing), r.clips.swing.loop], [6, 40, false]);
  assert.equal(r.preview, 'walk');
});

test('a clip list may rename a base clip; the renamed clip is the base clip, under the sprite\'s name', () => {
  const def = sprite({ clips: ['idle', { name: 'attack', from: 'swing' }] });
  const v = V(def);
  ok(v);
  assert.deepEqual(v.clips, ['idle', 'attack']);
  assert.deepEqual(v.value.body.rig.extends.clips, ['idle', { name: 'attack', from: 'swing' }]);
  const r = R(def);
  ok(r);
  assert.deepEqual(Object.keys(r.clips), ['idle', 'attack']);
  assert.deepEqual([r.clips.attack.frames, armOf(r.clips.attack), r.clips.attack.from, r.clips.attack.label], [6, 40, 'swing', 'Attack']);
  const s = makeDataSprite(def, { pieces: store() });
  ok(s);
  assert.deepEqual(Object.keys(s.sprite.clips), ['idle', 'attack']);
});

test('the sprite\'s own clip of a listed name inherits its listed base clip and adds to it (sounds, label); its own from wins', () => {
  const def = sprite({ clips: ['idle', { name: 'attack', from: 'swing' }, 'walk'] }, {
    clips: {
      attack: { label: 'Chop', sounds: [{ sound: 'whoosh', frame: 2 }] },
      walk: { from: 'jab' },
    },
  });
  const v = V(def);
  ok(v);
  assert.deepEqual(v.clips, ['idle', 'attack', 'walk'], 'own clips of listed names keep the list\'s order');
  const r = R(def);
  ok(r);
  assert.deepEqual([r.clips.attack.label, r.clips.attack.frames, armOf(r.clips.attack), r.clips.attack.sounds.map((c) => c.sound)], ['Chop', 6, 40, ['whoosh']]);
  assert.deepEqual([r.clips.walk.frames, armOf(r.clips.walk), r.clips.walk.from], [6, 10, 'jab'], 'its own from names another base clip');
});

test('a clip\'s from may name a base clip the list leaves out; the sprite gets the clips the list and its own clips name, no more', () => {
  const def = sprite({ clips: ['idle'] }, { clips: { attack: { from: 'punch' } } });
  const v = V(def);
  ok(v);
  assert.deepEqual(v.clips, ['idle', 'attack']);
  const r = R(def);
  ok(r);
  assert.deepEqual(Object.keys(r.clips), ['idle', 'attack']);
  assert.deepEqual([r.clips.attack.frames, armOf(r.clips.attack)], [6, 130]);
});

test('an empty clip list takes none: the sprite writes every clip itself', () => {
  const def = sprite({ clips: [] }, { clips: { idle: { from: 'walk' } } });
  ok(V(def));
  assert.deepEqual(Object.keys(R(def).clips), ['idle']);
  fails(V(sprite({ clips: [] })), /give at least one clip/i);
});

test('a clip list is checked: base clips only, each name once, clip names, the list\'s form', () => {
  fails(V(sprite({ clips: ['idle', 'fly'] })), /"fly" is not a clip of base:test-mover/);
  fails(V(sprite({ clips: ['idle', 'idle'] })), /"idle" is listed twice/);
  fails(V(sprite({ clips: ['idle', { name: 'idle', from: 'walk' }] })), /"idle" is listed twice/);
  fails(V(sprite({ clips: [{ name: 'Big Swing', from: 'swing' }] })), /clip name "Big Swing"/);
  fails(V(sprite({ clips: [{ name: 'constructor', from: 'swing' }] })), /cannot be a clip name/);
  fails(V(sprite({ clips: [{ name: 'attack', from: 'fly' }] })), /"fly" is not a clip of base:test-mover/);
  fails(V(sprite({ clips: [{ name: 'attack' }] })), /\{ "name": "<clip>", "from": "<base clip>" \}/);
  fails(V(sprite({ clips: [{ name: 'attack', from: { from: 'weapon', pick: {} } }] })), /\{ "name": "<clip>", "from": "<base clip>" \}/);
  fails(V(sprite({ clips: [42] })), /\{ "name": "<clip>", "from": "<base clip>" \}/);
  fails(V(sprite({ clips: 'idle' })), /extends: clips must be a list/);
  fails(V(sprite({ clips: Array.from({ length: 65 }, (_, i) => `c${i}`) })), /clips/);
  // a when naming a clip the sprite does not take is refused, as for any clip it does not have
  const shapes = [{ id: 'flag', kind: 'rect', on: 'post', at: [0, 0], size: [2, 2], paint: 'wood', z: 20, when: { clip: ['swing'] } }];
  fails(V({ ...sprite({ clips: ['idle'] }), body: { rig: { extends: { use: 'base:test-mover', v: 1, clips: ['idle'] }, shapes } } }), /"swing" is not a clip of the sprite/);
});

test('a listed clip and the sprite\'s own clip of another name never collide: an own clip of a renamed clip\'s base name is its own', () => {
  const def = sprite({ clips: [{ name: 'attack', from: 'swing' }] }, { clips: { swing: { from: 'jab' } } });
  ok(V(def));
  const r = R(def);
  ok(r);
  assert.deepEqual(Object.keys(r.clips), ['attack', 'swing']);
  assert.deepEqual([armOf(r.clips.attack), armOf(r.clips.swing)], [40, 10]);
});

// ---- 2. from picks the base clip by a setting -------------------------------------------------------------------

test('from may pick the base clip by a choice: resolved to the picked clip\'s name, keys and frames at each setting', () => {
  const def = sprite({ clips: ['idle', 'walk'] }, { controls: [WEAPON], clips: { attack: { from: PICK } } });
  const v = V(def);
  ok(v);
  assert.deepEqual(v.warnings, []);
  assert.deepEqual(v.clips, ['idle', 'walk', 'attack']);
  assert.deepEqual(v.value.clips.attack.from, PICK, 'the cleaned definition keeps the binding');
  for (const [weapon, name, frames, arm] of [['sword', 'swing', 6, 40], ['spear', 'jab', 6, 10], ['none', 'punch', 6, 130]]) {
    const r = R(def, { weapon });
    ok(r);
    const c = r.clips.attack;
    assert.deepEqual([c.from, c.frames, armOf(c), c.loop], [name, frames, arm, false], weapon);
  }
  // the default setting picks the default option's clip
  assert.equal(R(def).clips.attack.from, 'swing');
  // the drawn sprite plays the picked clip: as many frames as it has
  const s = makeDataSprite(def, { pieces: store() });
  ok(s);
  assert.equal(s.sprite.clips.attack.frames, 6);
});

test('from may pick by an on/off, and the sprite\'s own fields stay over the picked clip\'s', () => {
  const def = sprite({ clips: ['idle'] }, {
    controls: [SHIELD],
    clips: { block: { from: { from: 'shield', pick: { true: 'jab', false: 'punch' } }, label: 'Guard', loop: true } },
  });
  ok(V(def));
  const on = R(def, { shield: true }).clips.block, off = R(def, { shield: false }).clips.block;
  assert.deepEqual([on.from, armOf(on), on.label, on.loop], ['jab', 10, 'Guard', true]);
  assert.deepEqual([off.from, armOf(off), off.frames], ['punch', 130, 6]);
});

test('a control named only by a clip\'s from pick is in use: no "nothing uses it" error', () => {
  const def = sprite({ clips: ['idle'] }, { controls: [WEAPON], clips: { attack: { from: PICK } } });
  const v = V(def);
  ok(v);
  assert.ok(!v.errors.concat(v.warnings).some((m) => /nothing uses it/.test(m)));
});

test('a from pick is checked like any binding: every option given, each a clip of the base, a choice or on/off, a known control', () => {
  const withFrom = (from, controls = [WEAPON]) => sprite({ clips: ['idle'] }, { controls, clips: { attack: { from } } });
  fails(V(withFrom({ from: 'weapon', pick: { sword: 'swing', spear: 'jab' } })), /gives no value for "none"/);
  fails(V(withFrom({ from: 'weapon', pick: { sword: 'swing', spear: 'jab', none: 'fly' } })), /"fly" is not one of/);
  fails(V(withFrom({ from: 'weapon', pick: { sword: 'swing', spear: 'jab', none: 7 } })), /is not one of/);
  fails(V(withFrom({ from: 'weapon', pick: { sword: 'swing', spear: 'jab', none: 'punch', axe: 'swing' } })), /names "axe", which "weapon" never is/);
  fails(V(withFrom({ from: 'mood', pick: { a: 'swing' } })), /"mood", which is not one of the sprite's controls/);
  const reach = { key: 'reach', kind: 'range', label: 'Reach', default: 0.5 };
  fails(V(withFrom({ from: 'reach', map: [[0, 1], [1, 2]] }, [reach])), /a table \(map\)|bound to the slider|with a table/);
  fails(V(withFrom({ from: 'reach', pick: { a: 'swing' } }, [reach])), /bound to the slider "reach" with pick/);
  // a bare { from } naming a choice whose every option is a clip of the base is the setting itself
  const style = { key: 'style', kind: 'choice', label: 'Style', options: ['swing', 'jab'], default: 'jab' };
  const bare = withFrom({ from: 'style' }, [style]);
  ok(V(bare));
  assert.equal(R(bare, { style: 'swing' }).clips.attack.from, 'swing');
  fails(V(withFrom({ from: 'weapon' })), /can also be|bind it with pick/);
});

test('a from pick whose clips differ in length is refused unless the clip gives its own frames: a sheet has one length a clip', () => {
  const pick = { from: 'weapon', pick: { sword: 'swing', spear: 'swing', none: 'walk' } };   // 6 and 4 frames
  fails(V(sprite({ clips: ['idle'] }, { controls: [WEAPON], clips: { attack: { from: pick } } })), /clips of different lengths \(swing 6, walk 4 frames\)/);
  const def = sprite({ clips: ['idle'] }, { controls: [WEAPON], clips: { attack: { from: pick, frames: 6 } } });
  ok(V(def));
  for (const weapon of ['sword', 'none']) assert.equal(R(def, { weapon }).clips.attack.frames, 6, weapon);
});

test('a from pick on a body that extends no base is dropped with a warning, as a from string is', () => {
  const def = {
    format: 'loadout-sprite', version: 2, id: 'post-test', name: 'Post', blurb: 'A post.', size: [32, 32], pivot: [16, 28],
    meta: { type: 'prop', role: 'world/prop', view: 'side', themes: ['neutral'], gameTypes: ['platformer'], words: ['post'], license: 'draft' },
    palette: [{ id: 'wood', label: 'Wood', default: '#8a5a2a', material: 'wood' }],
    controls: [WEAPON, { key: 'size', kind: 'range', label: 'Size', default: 0.5, scales: { bones: ['post'], by: [0.8, 1.2] } }],
    body: { rig: { bones: [{ id: 'post', parent: null, at: [16, 28], angle: 180, length: 10 }], shapes: [{ id: 'stake', kind: 'limb', on: 'post', width: 3, paint: 'wood', z: 10, when: { weapon: ['sword', 'spear'] } }] } },
    clips: { idle: { frames: 1, fps: 4, keys: [{ t: 0 }], from: PICK } },
  };
  const v = V(def);
  ok(v);
  assert.ok(v.warnings.some((w) => /extends none, so it was dropped/.test(w)), v.warnings.join('; '));
});

test('a from pick never runs anything: a pick holding an object or a prototype word is refused', () => {
  const withFrom = (from) => sprite({ clips: ['idle'] }, { controls: [WEAPON], clips: { attack: { from } } });
  fails(V(withFrom({ from: 'weapon', pick: { sword: { gen: 'x' }, spear: 'jab', none: 'punch' } })), /is not one of/);
  fails(V(withFrom({ from: 'weapon', pick: { sword: 'toString', spear: 'jab', none: 'punch' } })), /is not one of/);
  fails(V(withFrom(['swing'])), /from/);
});
