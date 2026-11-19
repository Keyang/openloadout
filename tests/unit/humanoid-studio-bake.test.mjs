// S6 (docs/studio.md, sections 2.2, 3 and 8): baking. A library body's formula clip turned into key poses at every
// frame's phase ("Start from the Hero's walk") draws the same frames, pixel for pixel, as the formula clip; the keys are
// in the studio's units (degrees, pixels) and hold only the pose fields rigs/humanoid-describe.js lists.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { framePhase } from '../../rigs/keypose.js';
import * as H from '../../rigs/humanoid.js';
import * as S from '../../rigs/humanoid-studio.js';
import { RIG } from '../../rigs/humanoid-describe.js';
import { HUMANOID_POSE_FIELDS, HUMANOID_MOVE_FIELDS, STUDIO_LIMITS } from '../../catalog/studio-schema.js';

const SIZES = { idle: [8, true], walk: [8, true], run: [8, true], jump: [8, false], attack: [8, false], shoot: [6, false], cast: [8, false], block: [6, false], hurt: [4, false], die: [8, false], victory: [8, true], talk: [8, true] };

// definitions after the two sprites written on the figure module (sprites/rogue-battler.js, sprites/road-bandit.js),
// with every move, stance, pair and swinging thing in them, and the Hero
const DEFS = {
  rogue: { body: { height: 0.45, build: 0.3, head: 0.5 }, stance: 'crouched', moves: { attack: 'stab', shoot: 'throw', victory: 'toss' }, look: { skin: '#e8b088', top: '#2f8f9d', bottom: '#1d5a63', boots: '#5a5f7a' }, hair: { style: 'short', colour: '#e0b040' }, held: { kind: 'daggers', length: 1, angle: 0, metal: '#c2c9d6', hilt: '#f2c230' }, headgear: { kind: 'hood', size: 1, colour: '#2f8f9d' }, scarf: { kind: 'long', length: 1, colour: '#5a5f7a' }, belt: { colour: '#5a5f7a', buckle: '#c2c9d6' }, thrown: { metal: '#c2c9d6', hilt: '#9a6a3e' } },
  bandit: { body: { height: 0.6, build: 0.8, head: 0.5 }, stance: 'slouched', moves: { attack: 'steal' }, look: { skin: '#c98a5c', top: '#5b3d2e', bottom: '#3a2a20', boots: '#3a2a20' }, held: { kind: 'cutlass', length: 1, angle: 10, metal: '#c2c9d6', hilt: '#f2c230' }, headgear: { kind: 'wide hat', size: 1.2, colour: '#c9a06a', band: '#5b3d2e' }, mask: { colour: '#c9423a', drape: 3 }, coat: { colour: '#5b3d2e', belt: '#c9a06a', ragged: 0.35, length: 0.42 }, pack: { kind: 'loot sack', size: 1, colour: '#c9a06a' }, loot: { colour: '#e0b040' } },
  slinger: { stance: 'upright', held: { kind: 'sling', length: 1.2 }, headgear: { kind: 'bandana' }, pack: { kind: 'quiver' } },
  fists: { stance: 'crouched', moves: { attack: 'stab', victory: 'toss' } },
  hero: S.heroFigure(),
  heroBare: S.heroFigure({ weapon: 'none', headgear: 'none', cape: 'none' }),
};
const CLIPS = Object.keys(SIZES);

const draw = (clip, t, def) => { const g = new Surface(...H.SIZE); S.render(g, clip, t, def); return g; };
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };

test('POSE_FIELDS: the pose numbers a key may hold, the same in the rig, its description and the studio validator', () => {
  const kinds = new Set(['px', 'angle', 'share', 'signed', 'point', 'arm', 'flag', 'count', 'word']);
  for (const [k, f] of Object.entries(S.POSE_FIELDS)) {
    assert.ok(kinds.has(f.kind), `${k}: kind ${f.kind}`);
    if ('min' in f) assert.ok(f.min < f.max, `${k}: min < max`);
  }
  // every field the validator (catalog/studio-schema.js) lets a key hold is one of them, with the same kind
  const checked = { ...HUMANOID_POSE_FIELDS, ...HUMANOID_MOVE_FIELDS };
  for (const [k, kind] of Object.entries(checked)) assert.equal(S.POSE_FIELDS[k]?.kind, kind, `${k}: the validator says ${kind}`);
  assert.deepEqual(Object.keys(checked).sort(), Object.keys(S.POSE_FIELDS).sort(), 'and it checks every one of them');
  // rigs/humanoid-describe.js lists them one for one, with the same kinds and ranges
  const listed = Object.fromEntries(RIG.poseFields.map(({ name, kind, min, max }) => [name, { kind, ...(min === undefined ? {} : { min, max }) }]));
  const code = Object.fromEntries(Object.entries(S.POSE_FIELDS).map(([k, { kind, min, max }]) => [k, { kind, ...(min === undefined ? {} : { min, max }) }]));
  assert.deepEqual(listed, code);
});

test('studio keys and the rig\'s units: degrees one side, radians the other, everything else as it is', () => {
  const P = { lean: 0.3, item: -1.2, armF: { a: 2, e: 0.4 }, footF: { x: 1.5, y: -2 }, rootX: 3, sway: -0.5, blink: true, knife: 'air', air: null, notAField: 7 };
  const k = S.toStudioKey(P, 0.25);
  assert.equal(k.t, 0.25);
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  assert.ok(near(k.lean, 0.3 * 180 / Math.PI));
  assert.ok(near(k.armF.a, 2 * 180 / Math.PI) && near(k.armF.e, 0.4 * 180 / Math.PI));
  assert.deepEqual(k.footF, { x: 1.5, y: -2 });
  assert.equal(k.blink, true);
  assert.equal(k.knife, 'air');
  assert.equal(k.air, null);
  assert.equal('notAField' in k, false, 'only the pose fields');
  const back = S.fromStudioKey(k);
  for (const f of ['lean', 'item']) assert.ok(Math.abs(back[f] - P[f]) < 1e-12, f);
  assert.equal(back.ease, undefined);
  const fk0 = S.fromStudioKey({ t: 0.5, ease: 'hold', headTilt: 90, footB: { x: -0, y: 2 } });
  assert.deepEqual(Object.keys(fk0), ['t', 'ease', 'headTilt', 'footB']);
  assert.ok(near(fk0.headTilt, Math.PI / 2));
  assert.ok(Object.is(S.toStudioKey({ sway: -0, footF: { x: -0, y: -0 } }, 0).sway, 0), '-0 is written 0, as JSON writes it');
  // studio clips to the figure's keys: { clip: { loop, keys } }, with nothing else carried over
  const fk = S.figureKeys({ walk: { frames: 8, fps: 10, loop: true, keys: [{ t: 0, lean: 10 }], sounds: [] }, idle: { frames: 8, loop: true } });
  assert.deepEqual(Object.keys(fk), ['walk']);
  assert.equal(fk.walk.loop, true);
  assert.ok(near(fk.walk.keys[0].lean, 10 * Math.PI / 180));
});

test('bake: a key on every frame, at the frame\'s phase, plain JSON in the studio\'s units', () => {
  for (const [clip, [frames, loop]] of Object.entries(SIZES)) {
    const keys = S.bake(DEFS.rogue, clip, { frames, loop }), ts = keys.map((k) => k.t);
    for (let f = 0; f < frames; f++) assert.ok(ts.includes(framePhase({ frames, loop }, f)), `${clip}: a key on frame ${f}`);
    assert.deepEqual(ts, [...ts].sort((a, b) => a - b), `${clip}: in order`);
    // a pose whose light looks back between frames (the rogue's attack is a stab) has a key there too; the others none
    if (clip === 'attack') assert.ok(keys.length > frames && keys.length < 2 * frames, `attack: ${keys.length} keys`);
    else assert.equal(keys.length, frames, clip);
    assert.deepEqual(JSON.parse(JSON.stringify(keys)), keys, `${clip}: survives JSON`);
    for (const k of keys) for (const f of Object.keys(k)) assert.ok(f === 't' || f in S.POSE_FIELDS, `${clip}: ${f} is a pose field`);
    for (const k of keys) assert.equal('flash' in k, false, `${clip}: the white flash is a frame edit, not a key`);
    const P = S.frame(clip, 0, DEFS.rogue).P;
    assert.ok(Math.abs(keys[0].lean - P.lean * 180 / Math.PI) < 1e-9, `${clip}: lean in degrees`);
  }
  // the clip's own frames and looping come from the rig's table when not given
  assert.equal(S.bake(DEFS.rogue, 'hurt').length, 4);
  assert.equal(S.bake(DEFS.rogue, 'hurt')[3].t, 1);
  // a pose to bake from that is not the clip's own (the studio's `from`: "Wave starts as a copy of Idle")
  assert.deepEqual(S.bake(DEFS.hero, 'wave', { frames: 8, loop: true, from: 'idle' }), S.bake(DEFS.hero, 'idle', { frames: 8, loop: true }));
  // bakeClips: a whole table, each with `from`
  const all = S.bakeClips(DEFS.hero, { idle: { frames: 8, fps: 7, loop: true }, wave: { frames: 8, fps: 8, loop: true, from: 'idle' } });
  assert.deepEqual(Object.keys(all), ['idle', 'wave']);
  assert.equal(all.wave.from, 'idle');
  assert.equal(all.idle.from, 'idle');
  assert.equal(all.wave.keys.length, 8);
  // the white flash of hurt and die goes to frameEdits (studio.md 2.2): delete a key and the flash does not spread
  for (const [clip, frames] of [['hurt', 4], ['die', 8]]) {
    const c = S.bakeClip(DEFS.rogue, clip, { frames, loop: false });
    assert.deepEqual(c.frameEdits, { 0: { flash: true } }, clip);
    assert.equal(c.from, clip);
  }
  assert.equal(S.bakeClip(DEFS.rogue, 'walk', { frames: 8, loop: true }).frameEdits, undefined, 'no flash, no frame edits');
  // bakeClips keeps a clip's other frame edits and sets the flash of every frame from the formula
  const kept = S.bakeClips(DEFS.hero, { hurt: { frames: 4, fps: 8, loop: false, frameEdits: { 1: { nudge: [1, 0], flash: true }, 2: { flash: true } } } });
  assert.deepEqual(kept.hurt.frameEdits, { 0: { flash: true }, 1: { nudge: [1, 0] } });
});

test('bake: frames are capped to 1..64 (STUDIO_LIMITS.framesPerClip) and must be a number; between: false keys the frames only', () => {
  assert.equal(S.MOST_FRAMES, STUDIO_LIMITS.framesPerClip);
  assert.equal(S.bake(DEFS.hero, 'walk', { frames: 2e5, loop: true }).length, 64);
  assert.equal(S.bake(DEFS.hero, 'walk', { frames: 0, loop: true }).length, 1);
  assert.equal(S.bake(DEFS.hero, 'walk', { frames: 7.9, loop: true }).length, 7);
  for (const bad of [NaN, Infinity, -Infinity, '8', null, {}]) assert.throws(() => S.bake(DEFS.hero, 'walk', { frames: bad }), /frames/, String(bad));
  assert.throws(() => S.bakeClip(DEFS.hero, 'walk', { frames: NaN }), /frames/);
  // the swing's light looks back between frames: by default bake keys those phases too; between: false only the frames
  const on = S.bake(DEFS.hero, 'attack', { frames: 8, loop: false }), off = S.bake(DEFS.hero, 'attack', { frames: 8, loop: false, between: false });
  assert.equal(off.length, 8);
  assert.ok(on.length > 8);
  assert.deepEqual(off, on.filter((k) => off.some((o) => o.t === k.t)));
});

for (const [name, def] of Object.entries(DEFS)) {
  test(`bake: ${name}: every baked clip draws the same frames and attach points as the formula clip`, () => {
    for (const clip of CLIPS) {
      const [frames, loop] = SIZES[clip];
      // the keys and the frame edits (the white flash) bakeClip gives, as figureKeys hands them to the seam
      const keyed = { ...def, keys: S.figureKeys({ [clip]: { frames, loop, ...S.bakeClip(def, clip, { frames, loop }) } }) };
      for (let f = 0; f < frames; f++) {
        const t = framePhase({ frames, loop }, f);
        const n = diff(draw(clip, t, def), draw(clip, t, keyed));
        assert.equal(n, 0, `${name} ${clip} frame ${f}: ${n} pixels differ`);
        const a = S.sockets(clip, t, keyed), b = S.sockets(clip, t, def);
        assert.deepEqual(Object.keys(a), Object.keys(b), `${name} ${clip} frame ${f}: the same sockets`);
        for (const [k, at] of Object.entries(b)) for (const c of ['x', 'y', 'angle']) assert.ok(Math.abs(a[k][c] - at[c]) < 1e-9, `${name} ${clip} frame ${f}: socket ${k}.${c} ${a[k][c]} vs ${at[c]}`);
      }
    }
  });
}

test('bake: deterministic, and it starts over from the formula: the clip\'s own keys are not what it bakes', () => {
  const a = S.bake(DEFS.bandit, 'attack', { frames: 8, loop: false });
  assert.deepEqual(S.bake(DEFS.bandit, 'attack', { frames: 8, loop: false }), a);
  const edited = { ...DEFS.bandit, keys: S.figureKeys({ attack: { frames: 8, loop: false, keys: [{ t: 0, lean: 40 }] } }) };
  assert.deepEqual(S.bake(edited, 'attack', { frames: 8, loop: false }), a);
});

test('keysFor: keys made for one figure follow the formula to another; a dragged foot keeps its offset; without keysFor they are drawn as made', () => {
  const made = S.heroFigure(), tall = S.heroFigure({ height: 1, weapon: 'axe' });
  const keys = S.bake(made, 'walk', { frames: 8, loop: true });
  keys[2] = { ...keys[2], footF: { ...keys[2].footF, x: keys[2].footF.x + 2 } };        // the near foot dragged 2 px forward on frame 2
  const fk = S.figureKeys({ walk: { frames: 8, loop: true, from: 'walk', keys } });
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const formula = (t) => S.frame('walk', t, tall).P, settled = (t) => S.frame('walk', t, { ...tall, keys: fk, keysFor: made }).P;
  assert.ok(near(settled(2 / 8).footF.x, formula(2 / 8).footF.x + 2), 'the drag rides on the formula at the new settings');
  assert.ok(near(settled(2 / 8).footB.x, formula(2 / 8).footB.x), 'what was not dragged is the formula');
  for (const f of [0, 4, 6]) {
    const want = formula(f / 8), got = settled(f / 8);
    for (const k of Object.keys(want)) assert.deepEqual(got[k], want[k], `frame ${f}: ${k}: a key no one changed is the formula at the new settings`);
  }
  // the same figure: nothing to follow; no keysFor: the keys as they are
  assert.ok(near(S.frame('walk', 2 / 8, { ...made, keys: fk, keysFor: made }).P.footF.x, keys[2].footF.x));
  assert.ok(near(S.frame('walk', 2 / 8, { ...tall, keys: fk }).P.footF.x, keys[2].footF.x));
  // and the rogue's keys follow its formula too (no Hero parts: drawn by the figure module)
  const rogueKeys = S.figureKeys({ attack: { frames: 8, loop: false, from: 'stab', keys: S.bake(DEFS.rogue, 'attack') } });
  const short = { ...DEFS.rogue, body: { height: 0, build: 1, head: 1 } };
  for (const f of [0, 3, 5]) {
    const a = draw('attack', f / 7, { ...short, keys: rogueKeys, keysFor: DEFS.rogue }), b = draw('attack', f / 7, short);
    assert.equal(diff(a, b), 0, `rogue attack frame ${f} on another body`);
  }
});
