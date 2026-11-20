// S6 (docs/studio.md, sections 3 and 8): the seam in rigs/humanoid-figure.js. A definition without `keys` draws byte for
// byte as before the seam (the hashes below were taken from the committed module before it was changed); a clip the
// definition gives as key poses is drawn from the blended keys, then kept in the frame (H.fit), with no stance laid over.
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderFrame, frameSockets, defaultParams } from '../../engine/sprite.js';
import { Surface } from '../../engine/surface.js';
import { blendKeys } from '../../rigs/keypose.js';
import * as H from '../../rigs/humanoid.js';
import * as F from '../../rigs/humanoid-figure.js';
import { codeSprite } from '../helpers/library.mjs';

const fnv = (h, x) => Math.imul(h ^ x, 16777619) >>> 0;

/** Every setting a test draws: the defaults, then each range at both ends and each other choice. */
function settings(s) {
  const base = defaultParams(s), out = [['default', base]];
  for (const v of s.versions ?? []) out.push([`version ${v.name}`, { ...base, ...v.params }]);
  for (const [k, c] of Object.entries(s.params)) {
    if (c.kind === 'range') { out.push([`${k}=min`, { ...base, [k]: c.min }]); out.push([`${k}=max`, { ...base, [k]: c.max }]); }
    if (c.kind === 'choice') for (const o of c.options) if (o.value !== base[k]) out.push([`${k}=${o.value}`, { ...base, [k]: o.value }]);
  }
  return out;
}

/** One hash of every frame of every clip, pixels and attach points, at one setting. */
function hashAll(s, p) {
  let h = 2166136261;
  for (const [clip, c] of Object.entries(s.clips)) for (let f = 0; f < c.frames; f++) {
    for (const v of renderFrame(s, clip, f, p).data) h = fnv(h, v);
    for (const ch of JSON.stringify(frameSockets(s, clip, f, p))) h = fnv(h, ch.charCodeAt(0));
  }
  return h.toString(16);
}

// taken 2026-11-19 from rigs/humanoid-figure.js as committed in 5964cd1, before the seam
const BEFORE = {
  'rogue-battler': { default: '3da848d5', 'height=min': 'df963663', 'height=max': 'cc3fcf2e', 'build=min': 'e4f10530', 'build=max': '5071b2be', 'head=min': '48fe118f', 'head=max': 'cc433813', 'weapon=short sword': '5a1b3bcd', 'weapon=claws': '427797a8', 'weapon=none': '46d6d927', 'weaponLength=min': 'b0ecf48f', 'weaponLength=max': '6238c5f2', 'weaponAngle=min': 'aa264d52', 'weaponAngle=max': 'b9fa3f33', 'headgear=bandana': '6a15c67c', 'headgear=mask': '9acc5ee', 'headgear=none': '121df19b', 'headgearSize=min': '31a60a36', 'headgearSize=max': 'c30267f1', 'scarf=short': '812de81f', 'scarf=none': '2db9275a', 'scarfLength=min': '5c208c7d', 'scarfLength=max': '263eb96', 'bounce=min': 'a48bbcb5', 'bounce=max': '20a94b5c', 'stride=min': '66a8d2bd', 'stride=max': '5cdf7f97', 'speed=min': '3da848d5', 'speed=max': '3da848d5' },
  'road-bandit': { default: 'e01a9aa4', 'height=min': '54e22fee', 'height=max': '78c71101', 'build=min': '37beae82', 'build=max': '869ae930', 'head=min': 'abcd05f7', 'head=max': '35ef5446', 'weapon=cutlass': '398bb5e9', 'weapon=sling': '4a9bc4da', 'weapon=none': '3d166f7', 'weaponLength=min': '6598e6ba', 'weaponLength=max': '39d51ce6', 'weaponAngle=min': '363e6b90', 'weaponAngle=max': 'dd779f05', 'headgear=wide hat': 'd263edde', 'headgear=hood': 'af7e7734', 'headgear=none': 'e745d7dc', 'headgearSize=min': '2b4e1e0e', 'headgearSize=max': 'e00ebd28' },
};

for (const id of ['rogue-battler', 'road-bandit']) {
  test(`${id}: with no keys every frame and attach point is byte for byte as before the seam`, async () => {
    const s = await codeSprite(id);      // the converted file as the hashes were taken from, frozen (tests/helpers/library.mjs)
    const want = BEFORE[id];
    const got = {};
    for (const [name, p] of settings(s)) if (name in want) got[name] = hashAll(s, p);
    assert.deepEqual(got, want);
  });
}

const ROGUE = { body: { height: 0.45, build: 0.3, head: 0.5 }, stance: 'crouched', moves: { attack: 'stab' }, held: { kind: 'daggers', length: 1, angle: 0 }, headgear: { kind: 'hood', size: 1, colour: '#2f8f9d' }, scarf: { kind: 'long', length: 1, colour: '#5a5f7a' } };
const draw = (clip, t, def) => { const g = new Surface(...H.SIZE); F.render(g, clip, t, def); return g; };
const same = (a, b) => a.data.every((v, i) => v === b.data[i]);

test('keys: an empty keys object, or keys for another clip, change nothing', () => {
  for (const [clip, n, loop] of [['walk', 8, true], ['attack', 8, false]]) for (let f = 0; f < n; f++) {
    const t = loop ? f / n : f / (n - 1);
    const plain = draw(clip, t, ROGUE);
    assert.ok(same(plain, draw(clip, t, { ...ROGUE, keys: {} })), `${clip} ${f}: keys {}`);
    assert.ok(same(plain, draw(clip, t, { ...ROGUE, keys: { idle: [{ t: 0, lean: 0.5 }] } })), `${clip} ${f}: keys for idle only`);
    assert.ok(same(plain, draw(clip, t, { ...ROGUE, keys: { [clip]: [] } })), `${clip} ${f}: an empty key list is no keys`);
  }
});

test('keys: a keyed clip is the blend of its keys over the rest pose, fitted, with no stance laid over it', () => {
  const keys = [
    { t: 0, lean: 0.2, crouch: 1, armF: { a: 1, e: 0.5 }, footF: { x: 2, y: 0 } },
    { t: 0.5, lean: -0.1, crouch: 3, armF: { a: 2, e: 0.2 }, footF: { x: -2, y: -1 }, blink: true },
  ];
  const def = { ...ROGUE, keys: { walk: { loop: true, keys } } };
  const rest = F.frame('idle', 0, ROGUE).P;
  for (const t of [0, 0.125, 0.25, 0.5, 0.75]) {
    const P = F.frame('walk', t, def).P, want = blendKeys(keys, t, { loop: true });
    for (const k of ['lean', 'crouch']) assert.equal(P[k], want[k], `t ${t}: ${k}`);
    assert.deepEqual(P.armF, want.armF, `t ${t}: armF`);
    assert.deepEqual(P.footF, want.footF, `t ${t}: footF`);
    // what no key sets is the rest pose: idle at 0 with the stance in it
    assert.deepEqual(P.footB, rest.footB, `t ${t}: footB from the rest pose`);
    assert.equal(P.headTilt, rest.headTilt, `t ${t}: headTilt from the rest pose (the crouched stance's)`);
  }
  assert.equal(F.frame('walk', 0.5, def).P.blink, true, 'a flag is stepped');
  assert.equal(F.frame('walk', 0.25, def).P.blink, true, 'a loop wraps a flag round: before its only key, that key holds');
  // the trail and the sockets use the same keys
  assert.deepEqual(F.sockets('walk', 0.5, def).hand, H.sockets(H.solve(F.frame('walk', 0.5, def).P, H.dims(ROGUE.body)), F.frame('walk', 0.5, def).P, H.dims(ROGUE.body)).hand);
});

test('keys: a one-shot holds its first and last keys; { keys, loop } decides, a bare list follows the pose', () => {
  const keys = [{ t: 0.25, lean: 0.3 }, { t: 0.75, lean: -0.3 }];
  const once = (t, own) => F.frame('attack', t, { ...ROGUE, keys: { attack: own } }).P.lean;
  assert.equal(once(0, keys), 0.3, 'attack is a one-shot: before the first key it holds');
  assert.equal(once(1, keys), -0.3);
  assert.equal(once(0, { loop: true, keys }), blendKeys(keys, 0, { loop: true }).lean, 'loop: true closes it');
  assert.notEqual(once(0, { loop: true, keys }), 0.3);
});

test('keys: the frame still keeps a long thing and the headgear in the picture (fit)', () => {
  // a key that throws the sword straight up from a jump: fit turns it toward level, as it does for the rig's own poses
  const def = { held: { kind: 'sword', length: 1.35 }, keys: { jump: [{ t: 0, lift: 30, item: Math.PI }] } };
  const P = F.frame('jump', 0, def).P, d = H.dims();
  const J = H.solve(P, d), tip = H.itemTip(J, P, F.heldSize('sword', 1.35).length);
  assert.ok(tip[1] >= 2 - 1e-9, `the tip stays in the frame (y ${tip[1].toFixed(2)})`);
  assert.notEqual(P.item, Math.PI);
});
