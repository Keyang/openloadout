// Build item F5 (docs/data-sprites.md 2.2 "Motion sliders"): engine/resolve.js applies a clip's `travel` at the
// person's settings, so every resolved clip's keys already move as far as the sliders say before rigs/keypose.js blends
// them (engine/data-sprite.js draws the resolved keys). Held to here:
//   - each entry's `by` binding worked out at the settings and its tracks scaled (rigs/keypose.js travelKeys)
//   - at a factor of exactly 1 the resolved keys are the clip's own, value for value
//   - a clip inherited from a base (by name, by extends.clips, or picked by a setting) is scaled the same way
//   - what comes out is held to the key fields' own ranges (root and IK in the frame, angles, stretch)
//   - a definition that skipped the validator (validated: true) with junk in travel resolves, never throws
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveSprite } from '../../engine/resolve.js';
import { makeDataSprite } from '../../engine/data-sprite.js';
import { renderFrame } from '../../engine/sprite.js';
import { createPieceStore } from '../../engine/pieces.js';

const ROOT = new URL('../../', import.meta.url);
const json = (rel) => JSON.parse(fs.readFileSync(new URL(rel, ROOT), 'utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);

const MINI = {
  format: 'loadout-sprite', version: 2, id: 'hopper', name: 'Hopper', blurb: 'A small hopping thing.', size: [32, 32], pivot: [16, 30],
  meta: { type: 'creature', role: 'characters/animal', view: 'side', themes: ['forest'], gameTypes: ['platformer'], words: ['hopper', 'frog', 'hop', 'jump', 'animal', 'critter'], license: 'draft' },
  palette: [{ id: 'body', label: 'Body', default: '#4f9d57', material: 'skin' }],
  body: { rig: {
    bones: [{ id: 'root', parent: null, at: [16, 20], angle: 180, length: 6 }, { id: 'leg', parent: 'root', angle: 0, length: 4 }, { id: 'foot', parent: 'leg', angle: 0, length: 3 }, { id: 'tail', parent: 'root', angle: -90, length: 4 }],
    ik: [{ id: 'step', bones: ['leg', 'foot'], bend: 1 }],
    shapes: [{ id: 'torso', kind: 'ellipse', on: 'root', at: [0, -3], r: [5, 4], paint: 'body' }, { id: 'shin', kind: 'limb', bone: 'leg', width: 2, paint: 'body' }, { id: 'tip', kind: 'limb', bone: 'tail', width: 1, paint: 'body' }] } },
  controls: [{ key: 'bounce', kind: 'range', label: 'Bounce', lo: 'Calm', hi: 'Bouncy', default: 0.5 }, { key: 'look', kind: 'choice', label: 'Look', options: ['calm', 'wild'], default: 'calm' }, { key: 'speed', standard: 'speed' }],
  clips: { idle: { frames: 8, fps: 6, keys: [{ t: 0, root: [0, 0], bones: { tail: -90 }, ik: { step: [1, 3] }, stretch: { leg: 1 } }, { t: 0.5, root: [0, 2], bones: { tail: -80 }, ik: { step: [2, 3] }, stretch: { leg: 1.1 } }],
    travel: [
      { tracks: ['root.1'], about: 'least', by: { from: 'bounce', map: [[0, 0.5], [0.5, 1], [1, 1.5]] } },
      { tracks: ['bones.tail', 'ik.step', 'stretch.leg'], about: 'mid', by: { from: 'look', pick: { calm: 1, wild: 2 } } },
    ] } },
};
const plain = (() => { const d = clone(MINI); delete d.clips.idle.travel; d.controls = d.controls.filter((c) => c.key === 'speed'); return d; })();

test('the travel is worked out at the settings and scales the resolved keys', () => {
  const at = (s) => { const r = resolveSprite(MINI, s); assert.ok(r.ok, r.errors.join('; ')); return r.clips.idle.keys; };
  assert.deepEqual(at({ bounce: 1 }).map((k) => k.root), [[0, 0], [0, 3]]);
  assert.deepEqual(at({ bounce: 0 }).map((k) => k.root), [[0, 0], [0, 1]]);
  near(at({ bounce: 0.75 })[1].root[1], 2.5);
  const wild = at({ look: 'wild' });
  assert.deepEqual(wild.map((k) => k.bones.tail), [-95, -75]);
  assert.deepEqual(wild.map((k) => k.ik.step), [[0.5, 3], [2.5, 3]]);
  near(wild[0].stretch.leg, 0.95); near(wild[1].stretch.leg, 1.15);
  assert.deepEqual(wild.map((k) => k.root), [[0, 0], [0, 2]], 'Look does not name the root');
});

test('at a factor of exactly 1 the resolved keys are the clip\'s own, value for value', () => {
  const mid = resolveSprite(MINI, { bounce: 0.5, look: 'calm' });
  const none = resolveSprite(plain, {});
  assert.ok(mid.ok && none.ok, [...mid.errors, ...none.errors].join('; '));
  assert.deepEqual(mid.clips.idle.keys, none.clips.idle.keys);
  assert.deepEqual(mid.clips.idle.keys, MINI.clips.idle.keys);
});

test('what comes out is held to the key fields\' ranges', () => {
  const d = clone(MINI);
  d.clips.idle.keys = [{ t: 0, root: [0, 0], bones: { tail: 0 }, stretch: { leg: 1 } }, { t: 0.5, root: [0, 30], bones: { tail: 400 }, stretch: { leg: 1.4 } }];
  d.clips.idle.travel = [{ tracks: ['root.1', 'bones.tail'], about: 'first', by: 3 }, { tracks: ['stretch.leg'], about: 'first', by: { from: 'bounce', map: [[0, 1], [1, 3]] } }];
  d.controls = d.controls.filter((c) => c.key !== 'look');
  const r = resolveSprite(d, { bounce: 1 });
  assert.ok(r.ok, r.errors.join('; '));
  const k = r.clips.idle.keys[1];
  assert.equal(k.root[1], 32, 'root down at most the frame height');
  assert.equal(k.bones.tail, 720, 'an angle at most 720');
  assert.equal(k.stretch.leg, 1.5, 'stretch at most 1.5');
});

test('a definition that skipped the validator: junk in travel does nothing and never throws', () => {
  for (const travel of ['junk', [null], [{ tracks: 'root', by: 2 }], [{ tracks: ['__proto__.x'], by: 2 }], [{ tracks: ['root.1'], by: { from: 'nope', map: 3 } }], [{ tracks: ['root.1'], by: { from: 'bounce', map: [[0, 1e9], [1, 1e9]] }, about: 'least' }]]) {
    const d = clone(MINI);
    d.clips.idle.travel = travel;
    const r = resolveSprite(d, {}, { validated: true });
    assert.ok(r.ok, `${JSON.stringify(travel)}: ${r.errors.join('; ')}`);
    for (const k of r.clips.idle.keys) assert.ok(Math.abs(k.root[1]) <= 32, JSON.stringify(travel));
  }
});

test('the drawn frames move: Bounce changes the idle, its middle draws as the sprite without travel', () => {
  const m = makeDataSprite(MINI);
  const p = makeDataSprite(plain);
  assert.ok(m.ok && p.ok, [...m.errors, ...p.errors].join('; '));
  const px = (s, f, params) => Array.from(renderFrame(s, 'idle', f, params).data);
  for (let f = 0; f < 8; f++) assert.deepEqual(px(m.sprite, f, { bounce: 0.5 }), px(p.sprite, f, {}), `frame ${f}`);
  assert.notDeepEqual(px(m.sprite, 4, { bounce: 1 }), px(m.sprite, 4, { bounce: 0 }));
});

test('clips inherited from a base are scaled: by name, taken by extends.clips, picked by a setting', async () => {
  const hero = json('tests/fixtures/person-side/knight.json');
  const store = createPieceStore({ read: (f) => fs.readFileSync(new URL(f, ROOT), 'utf8') });
  assert.ok((await store.loadFor(hero)).ok);
  const base = json('pieces/base-person-side.v7.json').body.clips;
  const h = clone(hero);
  h.controls.splice(h.controls.length - 1, 0, { key: 'stride', kind: 'range', label: 'Stride', lo: 'Small steps', hi: 'Big steps', default: 0.5, group: 'Motion' });
  const legs = { tracks: ['ik.legF.0', 'ik.legB.0'], about: 'mid', by: { from: 'stride', map: [[0, 0.5], [0.5, 1], [1, 2]] } };
  h.clips.walk.travel = [legs];                 // walk: picked by Weapon (walk or walk-unarmed)
  h.clips.hurt = { travel: [legs] };            // hurt: taken by extends.clips, written only for its travel (no from)
  const at = (s) => { const r = resolveSprite(h, s, { pieces: store }); assert.ok(r.ok, r.errors.join('; ')); return r.clips; };
  const mid = (xs) => (Math.max(...xs) + Math.min(...xs)) / 2;
  for (const [weapon, from] of [['sword', 'walk'], ['none', 'walk-unarmed']]) {
    const own = base[from].keys;
    assert.deepEqual(at({ weapon }).walk.keys, own, `${weapon}: the middle is the base clip`);
    const big = at({ weapon, stride: 1 }).walk;
    assert.equal(big.from, from);
    const xs = own.filter((k) => k.ik?.legF).map((k) => k.ik.legF[0]), m = mid(xs);
    own.forEach((k, i) => {
      if (!k.ik?.legF) return;
      near(big.keys[i].ik.legF[0], m + (k.ik.legF[0] - m) * 2, 1e-9);
      assert.equal(big.keys[i].ik.legF[1], k.ik.legF[1], 'the feet\'s height is not named');
      assert.deepEqual(big.keys[i].bones, k.bones, 'bones are not named');
    });
  }
  const hurt = at({ stride: 0 }).hurt;
  assert.equal(hurt.frames, base.hurt.frames, 'hurt is still the base\'s');
  const hk = base.hurt.keys.filter((k) => k.ik?.legF);
  if (hk.length > 1 && new Set(hk.map((k) => k.ik.legF[0])).size > 1) assert.notDeepEqual(hurt.keys, base.hurt.keys);
  assert.deepEqual(at({}).hurt.keys, base.hurt.keys);
});

// Review fix (F5 round 2), issue 3: the schema cannot check a base's IK chain ids (a base's summary lists its bones,
// not its chains), so a mistyped "ik.lefF" validated and silently scaled nothing. The resolver now warns, naming the
// clip and the path, for every path no key of the clip moves; a side keeps an entry to one side of its pivot.
test('a travel path that no key of the clip moves is warned of, naming the clip and the path', () => {
  const HERO = json('tests/fixtures/person-side/knight-travel.json');
  const st = createPieceStore({ read: (f) => fs.readFileSync(new URL(f, ROOT), 'utf8') });
  return st.loadFor(HERO).then(() => {
    const good = resolveSprite(HERO, {}, { pieces: st });
    assert.ok(good.ok, good.errors.join('; '));
    assert.ok(!good.warnings.some((w) => /travel/.test(w)), good.warnings.join('; '));
    const typo = clone(HERO);
    typo.clips.idle.travel = [...typo.clips.idle.travel, { tracks: ['ik.lefF', 'ik.legF.1'], by: 2 }];
    for (const s of [{}, { bounce: 0 }]) {
      const r = resolveSprite(typo, s, { pieces: st });
      assert.ok(r.ok, r.errors.join('; '));
      const w = r.warnings.filter((x) => /travel/.test(x));
      assert.equal(w.length, 1, w.join('; '));
      assert.match(w[0], /Clip "idle".*"ik\.lefF".*no key of the clip moves/);
    }
  });
});

test('side: an entry keeps to one side of its pivot when resolved', () => {
  const d = clone(MINI);
  d.clips.idle.keys = [{ t: 0, root: [0, 0] }, { t: 0.25, root: [0, 2] }, { t: 0.5, root: [0, -4] }];
  d.controls = d.controls.filter((c) => c.key !== 'look');
  d.clips.idle.travel = [{ tracks: ['root.1'], about: 0, side: 'below', by: { from: 'bounce', map: [[0, 0.5], [0.5, 1], [1, 1.5]] } }];
  const r = resolveSprite(d, { bounce: 0 });
  assert.ok(r.ok, r.errors.join('; '));
  assert.deepEqual(r.clips.idle.keys.map((k) => k.root[1]), [0, 2, -2]);
});
