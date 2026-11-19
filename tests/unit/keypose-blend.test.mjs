// S2 (docs/studio.md, section 8): the key blender. Per-track blending, the five eases, loop closure, stepped values.
import test from 'node:test';
import assert from 'node:assert/strict';
import { keys as motionKeys, loopKeys, smooth, easeIn, easeOut } from '../../engine/motion.js';
import { EASES, easeBy, compileKeys, sampleKeys, blendKeys, KEYPOSE_LIMITS } from '../../rigs/keypose.js';
import { EASES as SCHEMA_EASES } from '../../catalog/studio-schema.js';

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);

test('the five eases are named and behave as motion.js', () => {
  assert.deepEqual([...EASES], ['smooth', 'linear', 'in', 'out', 'hold']);
  assert.deepEqual([...EASES], [...SCHEMA_EASES]);   // the validator's list and the blender's must not drift
  for (const x of [0, 0.1, 0.25, 0.5, 0.8, 1]) {
    near(easeBy('smooth', x), smooth(x));
    near(easeBy('linear', x), x);
    near(easeBy('in', x), easeIn(x));
    near(easeBy('out', x), easeOut(x));
    assert.equal(easeBy('hold', x), x >= 1 ? 1 : 0);
  }
  near(easeBy(undefined, 0.3), smooth(0.3));          // no ease = smooth
  near(easeBy('wobble', 0.3), smooth(0.3));           // unknown = smooth, never a throw
  for (const name of EASES) { assert.equal(easeBy(name, 0), 0); assert.equal(easeBy(name, 1), 1); }
  assert.equal(easeBy('linear', -1), 0);              // clamped
  assert.equal(easeBy('linear', 2), 1);
});

test('a key holds only what it changes: each number is its own track', () => {
  // the tail sways on two keys, the root on three: each track blends between the keys that set it
  const ks = [
    { t: 0, root: [0, 0], bones: { tail1: 170 } },
    { t: 0.25, root: [0, -2] },
    { t: 0.5, root: [0, 0], bones: { tail1: 190 } },
  ];
  const at = (t) => blendKeys(ks, t, { loop: false });
  // at t = 0.25 the tail is halfway (smooth at 0.5 = 0.5) between its own keys, unaffected by the root-only key
  near(at(0.25).bones.tail1, 180);
  assert.deepEqual(at(0.25).root, [0, -2]);
  // a track's value at its own key is exact
  assert.equal(at(0).bones.tail1, 170);
  assert.equal(at(0.5).bones.tail1, 190);
  // root between 0 and 0.25: smooth
  near(at(0.125).root[1], -2 * smooth(0.5));
  // the second number of a pair is its own track too
  const pairs = blendKeys([{ t: 0, ik: { footF: [4, 0] } }, { t: 1, ik: { footF: [-4, 0] } }], 0.5, { loop: false });
  assert.deepEqual(pairs.ik.footF, [0, 0]);
});

test('the result has the shape of the keys: maps, pairs and the humanoid pose fields', () => {
  const ks = [
    { t: 0, lean: 0, armF: { a: 0, e: 10 }, footF: { x: 2, y: 0 }, blink: false, stretch: { tail1: 1 } },
    { t: 1, lean: 10, armF: { a: 90, e: 30 }, footF: { x: -2, y: -4 }, blink: true, stretch: { tail1: 1.5 } },
  ];
  const p = blendKeys(ks, 0.5, { loop: false });
  near(p.lean, 5); near(p.armF.a, 45); near(p.armF.e, 20); near(p.footF.x, 0); near(p.footF.y, -2); near(p.stretch.tail1, 1.25);
  assert.equal(p.blink, false);
  assert.ok(Array.isArray(blendKeys([{ t: 0, root: [1, 2] }], 0).root));
  assert.ok(!Array.isArray(p.armF));
  // nothing of t and ease leaks into the pose
  assert.equal('t' in p, false); assert.equal('ease' in p, false);
});

test('an ease says how the motion leaves its key toward the next', () => {
  const two = (ease) => [{ t: 0, ease, lift: 0 }, { t: 1, lift: 10 }];
  for (const [name, f] of [['smooth', smooth], ['linear', (x) => x], ['in', easeIn], ['out', easeOut]]) {
    for (const t of [0.1, 0.3, 0.5, 0.9]) near(blendKeys(two(name), t, { loop: false }).lift, 10 * f(t));
  }
  // hold: a step that stays until the next key
  for (const t of [0, 0.3, 0.99]) assert.equal(blendKeys(two('hold'), t, { loop: false }).lift, 0);
  assert.equal(blendKeys(two('hold'), 1, { loop: false }).lift, 10);
  // the ease of the key at the start of the segment counts, not the one at its end
  const mixed = [{ t: 0, ease: 'linear', lift: 0 }, { t: 0.5, ease: 'hold', lift: 10 }, { t: 1, lift: 20 }];
  near(blendKeys(mixed, 0.25, { loop: false }).lift, 5);
  assert.equal(blendKeys(mixed, 0.75, { loop: false }).lift, 10);
});

test('a one-shot equals motion.keys and holds its end values', () => {
  const pairs = [[0.2, 10], [0.5, 20], [0.8, 0]];
  const ks = pairs.map(([t, v]) => ({ t, lift: v }));
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    near(blendKeys(ks, t, { loop: false }).lift, motionKeys(t, pairs));
  }
  assert.equal(blendKeys(ks, -1, { loop: false }).lift, 10);
  assert.equal(blendKeys(ks, 2, { loop: false }).lift, 0);
});

test('a loop closes: it equals motion.loopKeys, and the end runs into the start', () => {
  const pairs = [[0.1, 3], [0.4, 9], [0.7, -2]];
  const ks = pairs.map(([t, v]) => ({ t, ease: 'linear', sway: v }));
  for (let i = 0; i <= 64; i++) {
    const t = i / 64;
    near(blendKeys(ks, t, { loop: true }).sway, loopKeys(t, pairs, (x) => Math.min(1, Math.max(0, x))));
    near(blendKeys(pairs.map(([kt, v]) => ({ t: kt, sway: v })), t).sway, loopKeys(t, pairs));   // loop is the default; smooth
  }
  near(blendKeys(ks, 0).sway, blendKeys(ks, 1).sway);
  near(blendKeys(ks, 0.999999).sway, blendKeys(ks, 0).sway, 1e-4);
  // the closing segment uses the last key's ease
  const held = [{ t: 0, sway: 0 }, { t: 0.5, ease: 'hold', sway: 8 }];
  assert.equal(blendKeys(held, 0.9).sway, 8);
  assert.equal(blendKeys(held, 0).sway, 0);
  // one key: it stands still
  for (const t of [0, 0.3, 0.99]) assert.equal(blendKeys([{ t: 0.6, sway: 4 }], t).sway, 4);
  // phases outside 0..1 wrap round the loop
  near(blendKeys(ks, 1.25).sway, blendKeys(ks, 0.25).sway);
  near(blendKeys(ks, -0.75).sway, blendKeys(ks, 0.25).sway);
});

test('angles pass 180 for a spin: no shortest-way wrapping', () => {
  const spin = [{ t: 0, ease: 'linear', bones: { body: 0 } }, { t: 1, bones: { body: 720 } }];
  near(blendKeys(spin, 0.5, { loop: false }).bones.body, 360);
  near(blendKeys(spin, 0.25, { loop: false }).bones.body, 180);
});

test('flags, words, show and hide are stepped, never blended', () => {
  const ks = [
    { t: 0, blink: false, mouth: 'shut', show: ['eyeOpen'], hide: [] },
    { t: 0.5, blink: true, show: ['eyeShut'], hide: ['eyeOpen'] },
    { t: 0.75, mouth: 'open' },
  ];
  const at = (t, loop) => blendKeys(ks, t, { loop });
  assert.equal(at(0.49, false).blink, false);
  assert.equal(at(0.5, false).blink, true);
  assert.equal(at(0.99, false).blink, true);
  assert.deepEqual(at(0.3, false).show, ['eyeOpen']);
  assert.deepEqual(at(0.6, false).show, ['eyeShut']);
  assert.deepEqual(at(0.6, false).hide, ['eyeOpen']);
  assert.equal(at(0.7, false).mouth, 'shut');
  assert.equal(at(0.8, false).mouth, 'open');
  // in a loop, before a track's first key it holds the last key's value (it wrapped round)
  const late = [{ t: 0.5, blink: true }, { t: 0.8, blink: false }];
  assert.equal(blendKeys(late, 0.2).blink, false);
  assert.equal(blendKeys(late, 0.6).blink, true);
  // in a one-shot, before a stepped track's first key the key has no say yet: the field is unset, or the base's
  // (studio.md 2.1: a hidden shape is not drawn unless a key shows it; a flag changes at its key)
  assert.equal('blink' in blendKeys(late, 0.2, { loop: false }), false);
  assert.equal(blendKeys(late, 0.2, { loop: false, base: { blink: false } }).blink, false);
  assert.equal(blendKeys(late, 0.5, { loop: false, base: { blink: false } }).blink, true);
  // numbers keep motion.keys's behaviour: the first key's value before it
  assert.equal(blendKeys([{ t: 0.5, lift: 4 }, { t: 1, lift: 0 }], 0.2, { loop: false }).lift, 4);
  // a returned list is a copy: changing it does not change the key
  const out = at(0.6, false).show; out.push('x');
  assert.deepEqual(ks[1].show, ['eyeShut']);
});

test('a base pose fills what no key sets, and keys override it', () => {
  const base = { lean: 3, crouch: 0.2, footF: { x: 1, y: 0 }, armF: { a: 10, e: 20 }, blink: false };
  const ks = [{ t: 0, footF: { x: 4 } }, { t: 1, footF: { x: -4 } }];
  const p = blendKeys(ks, 0.5, { loop: false, base });
  assert.equal(p.lean, 3); assert.equal(p.crouch, 0.2); assert.equal(p.footF.y, 0); near(p.footF.x, 0);
  assert.deepEqual(p.armF, { a: 10, e: 20 });
  // the base is not changed
  assert.deepEqual(base.footF, { x: 1, y: 0 });
  p.armF.a = 99; assert.equal(base.armF.a, 10);
  // no keys: a copy of the base; no base and no keys: an empty pose
  assert.deepEqual(blendKeys([], 0.3, { base }), base);
  assert.deepEqual(blendKeys([], 0.3), {});
});

test('keys out of order are blended in time order; at a shared time the later key wins', () => {
  const sorted = [{ t: 0, lift: 0 }, { t: 0.5, lift: 10 }, { t: 1, lift: 0 }];
  const shuffled = [sorted[2], sorted[0], sorted[1]];
  for (const t of [0, 0.2, 0.5, 0.7, 1]) assert.equal(blendKeys(shuffled, t, { loop: false }).lift, blendKeys(sorted, t, { loop: false }).lift);
  const twin = [{ t: 0.5, lift: 1 }, { t: 0.5, lift: 2 }];
  assert.equal(blendKeys(twin, 0.5, { loop: false }).lift, 2);
});

test('hostile or broken data never throws and never reaches the prototype', () => {
  const bad = JSON.parse('[{"t":0,"__proto__":{"polluted":1},"bones":{"constructor":5,"prototype":6,"tail":1}},{"t":1,"bones":{"tail":3}}]');
  const p = blendKeys(bad, 0.5, { loop: false });
  assert.equal(({}).polluted, undefined);
  assert.equal(p.polluted, undefined);
  assert.equal(Object.keys(p.bones).join(), 'tail');
  // non-finite numbers are dropped; a key with no t, a null key, a string are skipped
  const odd = [{ t: 0, lift: 1 }, { t: 0.5, lift: Infinity }, null, 'x', { lift: 7 }, { t: NaN, lift: 9 }, { t: 1, lift: 3 }];
  near(blendKeys(odd, 0.5, { loop: false }).lift, 2);
  assert.deepEqual(blendKeys(undefined, 0.5), {});
  assert.equal(blendKeys([{ t: 0, lift: 1 }], NaN).lift, 1);
  // deep nesting is cut off, not followed forever
  let deep = { v: 1 }; for (let i = 0; i < 200; i++) deep = { d: deep };
  assert.doesNotThrow(() => blendKeys([{ t: 0, deep }], 0));
});

test('compiled keys sample the same as blending each time, and are deterministic', () => {
  const ks = [{ t: 0, root: [0, 0], bones: { a: 0 }, blink: false }, { t: 0.4, ease: 'out', root: [1, -2], bones: { a: 30 } }, { t: 0.8, blink: true, bones: { a: -10 } }];
  const c = compileKeys(ks);
  for (let i = 0; i < 16; i++) {
    const t = i / 16;
    assert.deepEqual(sampleKeys(c, t), blendKeys(ks, t));
    assert.deepEqual(sampleKeys(c, t, { loop: false }), blendKeys(ks, t, { loop: false }));
    assert.deepEqual(blendKeys(ks, t), blendKeys(ks, t));
  }
  // compiling copies: changing the keys afterwards does not change the compiled tracks
  const before = sampleKeys(c, 0.2);
  ks[1].bones.a = 1000;
  assert.deepEqual(sampleKeys(c, 0.2), before);
  // the compiled form is plain data, listing its tracks by path
  assert.deepEqual(c.tracks.map((tr) => tr.path.join('.')).sort(), ['blink', 'bones.a', 'root.0', 'root.1']);
  assert.doesNotThrow(() => JSON.stringify(c));
});

test('show and hide resolve per shape: the latest key that names a shape decides, never both lists', () => {
  const vis = (ks, t, o) => { const p = blendKeys(ks, t, o); return { show: p.show, hide: p.hide }; };
  // the review's case: hidden at 0, shown at 0.5
  assert.deepEqual(vis([{ t: 0, hide: ['eyeShut'] }, { t: 0.5, show: ['eyeShut'] }], 0.6), { show: ['eyeShut'], hide: [] });
  assert.deepEqual(vis([{ t: 0, hide: ['eyeShut'] }, { t: 0.5, show: ['eyeShut'] }], 0.3), { show: [], hide: ['eyeShut'] });
  // shapes named on different keys keep their own decisions (a later key does not clear an earlier key's other shapes)
  const blinkAndTalk = [
    { t: 0, show: ['eyeOpen'], hide: ['eyeShut', 'mouthOpen'] },
    { t: 0.25, show: ['mouthOpen'] },
    { t: 0.5, show: ['eyeShut'], hide: ['eyeOpen'] },
    { t: 0.75, hide: ['mouthOpen'] },
  ];
  assert.deepEqual(vis(blinkAndTalk, 0.3), { show: ['eyeOpen', 'mouthOpen'], hide: ['eyeShut'] });
  assert.deepEqual(vis(blinkAndTalk, 0.6), { show: ['eyeShut', 'mouthOpen'], hide: ['eyeOpen'] });
  assert.deepEqual(vis(blinkAndTalk, 0.8), { show: ['eyeShut'], hide: ['eyeOpen', 'mouthOpen'] });
  for (let i = 0; i <= 32; i++) for (const loop of [true, false]) {
    const p = blendKeys(blinkAndTalk, i / 32, { loop });
    for (const id of p.show) assert.ok(!p.hide.includes(id), `t ${i / 32}: ${id} in both`);
  }
  // a loop wraps: before a shape's first key the last key that named it decides
  assert.deepEqual(vis([{ t: 0.5, show: ['spark'] }, { t: 0.8, hide: ['spark'] }], 0.2), { show: [], hide: ['spark'] });
  // a one-shot: before a shape's first key no key has a say; the shape keeps its own `hidden` (neither list)
  const bite = [{ t: 0, bones: { jaw: 0 } }, { t: 0.8, show: ['mouthOpen'] }];
  assert.deepEqual(vis(bite, 0.4, { loop: false }), { show: [], hide: [] });
  assert.deepEqual(vis(bite, 0.8, { loop: false }), { show: ['mouthOpen'], hide: [] });
  // inside one key a shape in both lists (the validator refuses it) is hidden
  assert.deepEqual(vis([{ t: 0, show: ['x'], hide: ['x'] }], 0.5), { show: [], hide: ['x'] });
  // the base's lists stand for shapes no key has a say on yet, and keys override them shape by shape
  const base = { show: ['a', 'b'], hide: ['c'] };
  assert.deepEqual(vis([{ t: 0.5, hide: ['a'], show: ['c'] }], 0.7, { loop: false, base }), { show: ['b', 'c'], hide: ['a'] });
  assert.deepEqual(vis([{ t: 0.5, hide: ['a'], show: ['c'] }], 0.2, { loop: false, base }), { show: ['a', 'b'], hide: ['c'] });
  assert.deepEqual(base, { show: ['a', 'b'], hide: ['c'] });
  // no key and no base mentions visibility: neither list appears
  const plain = blendKeys([{ t: 0, lift: 1 }], 0.5);
  assert.equal('show' in plain, false); assert.equal('hide' in plain, false);
  // ids that are not text, and prototype names, are skipped; a list that is not a list is ignored
  assert.deepEqual(vis([{ t: 0, show: ['a', 3, null, '__proto__', { x: 1 }], hide: 'b' }], 0.5), { show: ['a'], hide: [] });
});

test('sampleKeys survives a hostile or broken compiled form: no throw, no prototype pollution', () => {
  const hostile = [
    { tracks: [{ path: ['__proto__', 'pwned'], numeric: true, keys: [{ t: 0, v: 1, ease: 'linear' }] }] },
    { tracks: [{ path: ['constructor', 'prototype', 'pwned'], numeric: true, keys: [{ t: 0, v: 1 }] }] },
    { tracks: [null] },
    { tracks: [null, 5, 'x', [], { path: null }, { path: [], keys: [{ t: 0, v: 1 }] }, { path: ['a'] }, { path: ['a'], keys: null }] },
    { tracks: [{ path: ['a'], numeric: true, keys: [null, { t: 0, v: 1 }] }] },
    { tracks: [{ path: ['a'], numeric: true, keys: [{ t: 0, v: 'x' }, { t: 1, v: 2 }] }] },
    { tracks: [{ path: ['a'], numeric: true, keys: [{ t: NaN, v: 1 }] }] },
    { tracks: [{ path: ['a', 1e9], numeric: true, keys: [{ t: 0, v: 1 }] }] },
    { tracks: [{ path: ['a', -1], numeric: true, keys: [{ t: 0, v: 1 }] }] },
    { tracks: [{ path: [{}], numeric: true, keys: [{ t: 0, v: 1 }] }] },
    { tracks: 'nope', shapes: [null, { id: '__proto__', keys: [{ t: 0, v: true }] }, { id: 'a', keys: [null] }, { id: 7, keys: [] }] },
    null, undefined, 5,
  ];
  for (const c of hostile) {
    for (const loop of [true, false]) assert.doesNotThrow(() => sampleKeys(c, 0.5, { loop }));
  }
  assert.equal(({}).pwned, undefined);
  assert.equal(Object.prototype.pwned, undefined);
  // a malformed track is skipped, its good neighbours still sampled
  const p = sampleKeys({ tracks: [null, { path: ['lift'], numeric: true, keys: [{ t: 0, v: 2, ease: 'linear' }, { t: 1, v: 4 }] }] }, 0.5, { loop: false });
  assert.deepEqual(p, { lift: 3 });
  // a list index beyond the caps is skipped, not a giant sparse list
  assert.deepEqual(sampleKeys(hostile[7], 0), {});
});

test('the blender caps what it takes, even when data skips the validator', () => {
  // one key with a million-number list: cut to the list cap, quickly
  const huge = new Array(1e6).fill(1);
  const t0 = Date.now();
  const c = compileKeys([{ t: 0, root: huge }]);
  assert.ok(Date.now() - t0 < 500, `took ${Date.now() - t0} ms`);
  assert.ok(c.tracks.length <= KEYPOSE_LIMITS.list);
  // tracks in all are capped
  const wide = {}; for (let i = 0; i < 5000; i++) wide['b' + i] = i;
  assert.ok(compileKeys([{ t: 0, bones: wide }, { t: 1, bones: wide }]).tracks.length <= KEYPOSE_LIMITS.tracks);
  // at most 64 keys are used, the first ones in the list
  const many = Array.from({ length: 1000 }, (_, i) => ({ t: i / 999, lift: i }));
  const ks = compileKeys(many).tracks[0].keys;
  assert.equal(ks.length, KEYPOSE_LIMITS.keys);
  assert.equal(KEYPOSE_LIMITS.keys, 64);
  assert.equal(ks.at(-1).v, 63);
  // a stepped list is capped too
  assert.ok(blendKeys([{ t: 0, tags: new Array(1e5).fill('x') }], 0).tags.length <= KEYPOSE_LIMITS.list);
});

test('a key time outside 0..1 is clamped to it', () => {
  const outside = [{ t: 0.2, ease: 'linear', lift: 0 }, { t: 1.5, lift: 10 }];
  const inside = [{ t: 0.2, ease: 'linear', lift: 0 }, { t: 1, lift: 10 }];
  for (let i = 0; i <= 20; i++) for (const loop of [true, false]) {
    assert.equal(blendKeys(outside, i / 20, { loop }).lift, blendKeys(inside, i / 20, { loop }).lift);
  }
  near(blendKeys(outside, 0.5).lift, 10 * 0.3 / 0.8);       // not 1.35: the key stands at t = 1
  assert.deepEqual(compileKeys([{ t: -3, lift: 1 }]).tracks[0].keys[0].t, 0);
});
