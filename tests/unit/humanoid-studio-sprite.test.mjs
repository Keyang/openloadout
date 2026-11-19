// S6 (docs/studio.md, sections 2.2, 2.3 and 3): a library-body studio sprite drawn as engine/data-sprite.js (S4) draws it.
// figureFor(def, p) is the one mapping from a sprite's colour slots, sliders and parts to the figure the rig draws, with
// keysFor (the figure as stored); drawSprite and spriteSockets draw one frame, frame edits (white flash, nudge) and all;
// refigure moves a sprite's keys when the stored figure changes. The validator takes what bake makes for any figure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { farRamp } from '../../engine/color.js';
import { framePhase } from '../../rigs/keypose.js';
import * as H from '../../rigs/humanoid.js';
import * as S from '../../rigs/humanoid-studio.js';
import { validateStudio } from '../../catalog/studio-schema.js';

const W = H.SIZE[0], FH = H.SIZE[1];
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };
const frameOf = (def, clip, frame, p = {}) => { const g = new Surface(W, FH); S.drawSprite(g, def, { clip, frame, p }); return g; };
const white = (g) => { const w = new Surface(1, 1); w.dot(0, 0, '#ffffff'); const c = w.data[0]; let n = 0, all = 0; for (const v of g.data) if (v) { all++; if (v === c) n++; } return n / all; };

// a sprite of the library body made from the rogue of sprites/rogue-battler.js: its moves bake the figure's own pose fields
const ROGUE = { body: { height: 0.45, build: 0.3, head: 0.5 }, stance: 'crouched', moves: { attack: 'stab', shoot: 'throw', victory: 'toss' }, look: { skin: '#e8b088', top: '#2f8f9d', bottom: '#1d5a63', boots: '#5a5f7a' }, hair: { style: 'short', colour: '#e0b040' }, held: { kind: 'daggers', length: 1, angle: 0, metal: '#c2c9d6', hilt: '#f2c230' }, headgear: { kind: 'hood', size: 1, colour: '#2f8f9d' }, scarf: { kind: 'long', length: 1, colour: '#5a5f7a' }, belt: { colour: '#5a5f7a', buckle: '#c2c9d6' }, thrown: { metal: '#c2c9d6', hilt: '#9a6a3e' } };
function rogueSprite() {
  const table = { idle: { frames: 8, fps: 7, loop: true }, attack: { frames: 8, fps: 12, loop: false }, shoot: { frames: 6, fps: 12, loop: false }, victory: { frames: 8, fps: 8, loop: true }, hurt: { frames: 4, fps: 10, loop: false } };
  return {
    format: 'loadout-sprite', version: 1, id: 'my-rogue', name: 'Rogue', blurb: 'A rogue.',
    meta: { type: 'character', role: 'characters/player', themes: ['fantasy'], gameTypes: ['platformer'], view: 'side', words: ['rogue', 'thief', 'player'], license: 'draft' },
    body: { library: 'humanoid', figure: ROGUE },
    colours: { cloak: '#2f8f9d', skin: '#e8b088' },
    controls: [{ key: 'speed', standard: 'speed' }, { key: 'tall', label: 'Height', lo: 'Short', hi: 'Tall', min: 0, max: 1, default: 0.45, sets: 'height' }],
    parts: { scarf: { label: 'Scarf', default: true }, headgear: { label: 'Hood', default: false } },
    clips: S.bakeClips(ROGUE, table), preview: 'idle', made: { in: 'studio', from: 'library:rogue-battler' },
  };
}

test('the validator takes what bake makes from the figure\'s own moves: far, glint, prize, knife, null air and knife, a foot\'s up', () => {
  const def = rogueSprite(), v = validateStudio(def);
  assert.deepEqual(v.errors, []);
  assert.deepEqual(v.warnings.filter((w) => /dropped|kept as/.test(w)), []);
  for (const [name, c] of Object.entries(def.clips)) assert.deepEqual(v.value.clips[name].keys, c.keys, `${name}: the keys come back as they went in`);
  const held = new Set(Object.values(def.clips).flatMap((c) => c.keys.flatMap((k) => Object.keys(k))));
  for (const f of ['knife', 'air']) assert.ok(held.has(f), `the rogue's keys hold ${f}`);
  // the bandit's steal (sprites/road-bandit.js) holds the coin bag's fields
  const steal = rogueSprite();
  steal.clips.attack = { frames: 8, fps: 12, loop: false, ...S.bakeClip({ ...ROGUE, moves: { attack: 'steal' }, held: { kind: 'cutlass' } }, 'attack', { frames: 8, loop: false }) };
  const fields = new Set(steal.clips.attack.keys.flatMap((k) => Object.keys(k)));
  for (const f of ['far', 'glint', 'prize']) assert.ok(fields.has(f), `the steal's keys hold ${f}`);
  const vs = validateStudio(steal);
  assert.deepEqual(vs.errors, []);
  assert.deepEqual(vs.value.clips.attack.keys, steal.clips.attack.keys);
  // and refuses what is not one of them
  const bad = rogueSprite(); bad.clips.shoot.keys[0].knife = 'pocket';
  assert.match(validateStudio(bad).errors.join('\n'), /knife/);
  const glint = rogueSprite(); glint.clips.idle.keys[0].glint = 9;
  assert.equal(validateStudio(glint).value.clips.idle.keys[0].glint, 2);
  const up = rogueSprite(); up.clips.idle.keys[0].footF = { x: 1, y: 0, up: 'yes' };
  assert.match(validateStudio(up).errors.join('\n'), /footF/);
});

test('figureFor: a slot recolours every figure colour that is its default or a tone of it; the first slot wins; sliders set body fields; parts switch off', () => {
  const def = rogueSprite();
  const at0 = S.figureFor(def, {});
  assert.equal(at0.headgear.kind, 'none', 'a part whose default is off is off');
  assert.equal(at0.scarf.kind, 'long');
  const f = S.figureFor(def, { cloak: '#c9423a', tall: 1, scarf: false, headgear: true });
  assert.equal(f.look.top, '#c9423a');
  assert.equal(f.headgear.colour, '#c9423a', 'every field at the slot\'s default follows it');
  assert.equal(f.headgear.kind, 'hood');
  assert.equal(f.look.bottom, ROGUE.look.bottom, 'a colour that is not the slot\'s (or a tone of it) stays');
  assert.equal(f.body.height, 1);
  assert.equal(f.scarf.kind, 'none');
  assert.deepEqual(f.keysFor, ROGUE);
  assert.deepEqual(ROGUE.look.top, '#2f8f9d', 'the stored figure is not changed');
  // two slots with one default: the first in the list owns the fields
  const two = { ...def, colours: { cloak: '#2f8f9d', also: '#2f8f9d' } };
  assert.equal(S.figureFor(two, { also: '#ffffff' }).look.top, '#2f8f9d');
  assert.equal(S.figureFor(two, { cloak: '#ffffff' }).look.top, '#ffffff');
  // a clip with no keys but a `from` is drawn by that pose's formula
  const plain = { ...def, clips: { ...def.clips, wave: { frames: 8, fps: 8, loop: true, keys: [], from: 'idle' } } };
  assert.equal(S.figureFor(plain, {}).moves.wave, 'idle');
});

test('drawSprite: the white flash is a frame edit of one frame; deleting keys does not spread it', () => {
  const hero = S.hero();
  assert.ok(white(frameOf(hero, 'die', 0)) > 0.6, 'die frame 0 is white');
  for (const f of [1, 2, 3]) assert.ok(white(frameOf(hero, 'die', f)) < 0.2, `die frame ${f} is not`);
  // the person deletes keys 1..4 of die (studio.md 3: "deletes or moves keys")
  const cut = S.hero(); cut.clips.die.keys = cut.clips.die.keys.filter((k, i) => i === 0 || i > 4);
  assert.ok(white(frameOf(cut, 'die', 0)) > 0.6);
  for (const f of [1, 2, 3]) assert.ok(white(frameOf(cut, 'die', f)) < 0.2, `die frame ${f} with keys deleted is not white`);
  // a flash added on another frame, and taken away from frame 0
  const moved = S.hero(); moved.clips.hurt.frameEdits = { 2: { flash: true } };
  assert.ok(white(frameOf(moved, 'hurt', 0)) < 0.2);
  assert.ok(white(frameOf(moved, 'hurt', 2)) > 0.6);
  assert.ok(white(frameOf(moved, 'hurt', 3)) < 0.2);
});

test('drawSprite and spriteSockets: a nudge moves the whole frame and its attach points by whole pixels', () => {
  const hero = S.hero(), moved = S.hero();
  moved.clips.walk.frameEdits = { 3: { nudge: [2, -1] } };
  const a = frameOf(hero, 'walk', 3), b = frameOf(moved, 'walk', 3);
  for (let y = 0; y < FH; y++) for (let x = 0; x < W; x++) {
    const sx = x - 2, sy = y + 1;
    const want = sx >= 0 && sy >= 0 && sx < W && sy < FH ? a.data[sy * W + sx] : 0;
    assert.equal(b.data[y * W + x], want, `pixel ${x},${y}`);
  }
  assert.equal(diff(frameOf(hero, 'walk', 2), frameOf(moved, 'walk', 2)), 0, 'other frames stay');
  const t = framePhase(hero.clips.walk, 3);
  const s0 = S.spriteSockets(hero, { clip: 'walk', t, p: {} }), s1 = S.spriteSockets(moved, { clip: 'walk', t, p: {} });
  for (const k of Object.keys(s0)) { assert.equal(s1[k].x, s0[k].x + 2, k); assert.equal(s1[k].y, s0[k].y - 1, k); }
  // an unknown clip draws nothing and has no sockets
  assert.equal(frameOf(hero, 'moonwalk', 0).bounds(), null);
  assert.equal(S.spriteSockets(hero, { clip: 'moonwalk', t: 0 }), null);
});

test('refigure: a change to the stored figure moves every clip\'s keys by what its formula moves; a dragged value keeps its offset', () => {
  const def = S.hero();
  def.clips.walk.keys[2] = { ...def.clips.walk.keys[2], lean: def.clips.walk.keys[2].lean + 10 };     // dragged by hand
  const crouched = { ...def.body.figure, body: { ...def.body.figure.body, height: 0.9 }, motion: { bounce: 1, stride: 1 } };
  const out = S.refigure(def, crouched);
  assert.deepEqual(out.body.figure, crouched);
  assert.deepEqual(def.body.figure, S.heroFigure(), 'the definition given is not changed');
  const fresh = S.bake(crouched, 'walk', { frames: 8, loop: true });
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  for (const [i, k] of out.clips.walk.keys.entries()) {
    assert.ok(near(k.lean, fresh[i].lean + (i === 2 ? 10 : 0)), `walk key ${i}: lean`);
    assert.ok(near(k.footF.x, fresh[i].footF.x), `walk key ${i}: foot`);
  }
  assert.deepEqual(out.clips.walk.sounds, def.clips.walk.sounds);
  assert.deepEqual(JSON.parse(JSON.stringify(out)), out, 'plain JSON');
  assert.equal(validateStudio(out).ok, true);
});

test('the cape follows a lean posed by hand', { todo: 'the cape is copied from sprites/knight.js and hangs from the neck\'s x: it shrinks behind a leaning torso; fix when knight.js is converted (R3)' }, () => {
  const hero = S.hero(), leant = S.hero();
  leant.clips.walk.keys = leant.clips.walk.keys.map((k) => ({ ...k, lean: k.lean + 15 }));
  const cloth = new Set(); { const g = new Surface(1, 1); const r = farRamp(S.HERO_SETTINGS.trim); for (const c of [r.base, r.light, r.dark, r.deep]) { g.dot(0, 0, c); cloth.add(g.data[0]); } }
  const capePx = (g) => g.data.filter((v) => cloth.has(v)).length;
  for (let f = 0; f < 8; f++) assert.ok(capePx(frameOf(leant, 'walk', f)) >= 0.8 * capePx(frameOf(hero, 'walk', f)), `walk frame ${f}`);
});
