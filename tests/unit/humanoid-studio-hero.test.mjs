// S6 (docs/studio.md, sections 3 and 8): the Hero as a library body. Its cape, headgear, the hair under the helmet and
// its belt are drawn by the rig (rigs/humanoid-studio.js); sprites/knight.js is not changed. The Hero's figure drawn
// by its formula is sprites/knight.js pixel for pixel at every setting; the studio's Hero preset (every clip baked into
// keys at the default settings) differs from it by at most 2% of the drawn pixels on any frame, at the default settings
// and at both ends of each of the preset's controls (its sliders, and each part switched off).
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderFrame, frameSockets, defaultParams, SKIN, HAIR, CLOTH, METAL } from '../../engine/sprite.js';
import { Surface } from '../../engine/surface.js';
import { framePhase } from '../../rigs/keypose.js';
import * as H from '../../rigs/humanoid.js';
import * as S from '../../rigs/humanoid-studio.js';
import { validateStudio } from '../../catalog/studio-schema.js';
import knight from '../../sprites/knight.js';

const draw = (clip, t, def) => { const g = new Surface(...H.SIZE); S.render(g, clip, t, def); return g; };
const count = (g) => { let n = 0; for (const v of g.data) if (v) n++; return n; };
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };
const BASE = defaultParams(knight);

/** Every setting of the Hero: the defaults, each ready-made version, each range at both ends, each other choice. */
function settings() {
  const out = [['default', BASE]];
  for (const v of knight.versions ?? []) out.push([`version ${v.name}`, { ...BASE, ...v.params }]);
  for (const [k, c] of Object.entries(knight.params)) {
    if (c.kind === 'range') { out.push([`${k}=min`, { ...BASE, [k]: c.min }]); out.push([`${k}=max`, { ...BASE, [k]: c.max }]); }
    if (c.kind === 'choice') for (const o of c.options) if (o.value !== BASE[k]) out.push([`${k}=${o.value}`, { ...BASE, [k]: o.value }]);
  }
  return out;
}

test('the Hero\'s parts are the rig\'s: cape, capeOnGround, heroHeadgear (with its rise), napeHair and heroBelt', () => {
  for (const fn of ['cape', 'capeOnGround', 'heroHeadgear', 'napeHair', 'heroBelt']) assert.equal(typeof S[fn], 'function', fn);
  assert.deepEqual([...S.CAPE_KINDS], ['plain', 'tattered']);
  assert.deepEqual([...S.HERO_HEADGEAR], ['plumed helmet', 'gold crown']);
  assert.ok(S.heroHeadgearRise('plumed helmet', 1.8) > S.heroHeadgearRise('plumed helmet', 0.5));
  assert.equal(S.heroHeadgearRise('none'), 0);
});

test('the Hero\'s figure drawn by its formula is sprites/knight.js, pixel for pixel and socket for socket, at every setting', () => {
  let frames = 0;
  for (const [name, p] of settings()) {
    const def = S.heroFigure(p);
    assert.deepEqual(JSON.parse(JSON.stringify(def)), def, `${name}: the figure is plain data`);
    for (const [clip, c] of Object.entries(knight.clips)) for (let f = 0; f < c.frames; f++) {
      const t = framePhase(c, f);
      const n = diff(draw(clip, t, def), renderFrame(knight, clip, f, p));
      assert.equal(n, 0, `${name} ${clip} frame ${f}: ${n} pixels differ`);
      assert.deepEqual(S.sockets(clip, t, def), frameSockets(knight, clip, f, p), `${name} ${clip} frame ${f}: sockets`);
      frames++;
    }
  }
  assert.ok(frames > 1500, `${frames} frames compared`);
});

test('the Hero preset: a studio sprite of the library body, every clip of the Hero baked, plain JSON', () => {
  const def = S.hero();
  assert.deepEqual(JSON.parse(JSON.stringify(def)), def);
  assert.equal(def.format, 'loadout-sprite');
  assert.equal(def.body.library, 'humanoid');
  assert.deepEqual(def.body.figure, S.heroFigure());
  assert.deepEqual(def.size, H.SIZE);
  assert.deepEqual(def.pivot, H.PIVOT);
  assert.deepEqual(def.made, { in: 'studio', from: 'library:knight' });
  assert.deepEqual(Object.keys(def.clips), Object.keys(knight.clips));
  for (const [name, c] of Object.entries(knight.clips)) {
    const own = def.clips[name];
    assert.equal(own.frames, c.frames, name);
    assert.equal(own.loop, c.loop, name);
    assert.equal(own.fps, Math.round(c.fps({ speed: 0.5 }) / 1.05), `${name}: frames a second at the middle speed`);
    assert.equal(own.from, name);
    const ts = own.keys.map((k) => k.t);
    for (let f = 0; f < c.frames; f++) assert.ok(ts.includes(framePhase(c, f)), `${name}: a key on frame ${f}`);
  }
  assert.deepEqual(def.controls.map((c) => c.key), ['speed', 'height', 'build', 'head']);
  assert.deepEqual(Object.keys(def.parts), ['held', 'headgear', 'cape']);
  assert.deepEqual(def.clips.walk.sounds, knight.sounds.walk.map(({ sound, frame, preset }) => ({ sound, frame, preset })));
  assert.equal(def.preview, 'walk');
});

test('the Hero preset is a valid loadout-sprite: the validator passes it, drops nothing, and its cleaned copy is the preset', (t) => {
  const h = S.hero(), v = validateStudio(h);
  assert.deepEqual(v.errors, [], 'no errors');
  assert.equal(v.ok, true);
  assert.deepEqual(v.warnings.filter((w) => /dropped|kept as|rounded|not a frame/.test(w)), [], 'nothing dropped, clamped or rounded');
  t.diagnostic(`advice: ${v.warnings.length ? v.warnings.join(' | ') : 'none'}`);
  assert.deepEqual(v.value, h, 'the cleaned copy is the preset, so it still draws the Hero');
  // the white flash of hurt and die is a frame edit on frame 0 (studio.md 2.2), not a flag held by a key
  for (const clip of ['hurt', 'die']) {
    assert.deepEqual(h.clips[clip].frameEdits, { 0: { flash: true } }, clip);
    for (const k of h.clips[clip].keys) assert.equal('flash' in k, false, `${clip}: no key holds the flash`);
  }
});

/** The preset's own settings (its colour slots, sliders and parts, as engine/data-sprite.js gives them) for a setting of sprites/knight.js. */
const presetParams = (p) => ({
  skin: p.skin, hair: p.hair, outfit: p.outfit, trim: p.trim, metal: p.metal, speed: p.speed,
  height: p.height, build: p.build, head: p.head, held: p.weapon !== 'none', headgear: p.headgear !== 'none', cape: p.cape !== 'none',
});
const COLOURS = { skin: SKIN[2], hair: HAIR[3], outfit: CLOTH[3], trim: CLOTH[6], metal: METAL[2] };
const ENDS = [
  ['default', {}],
  ['height 0', { height: 0 }], ['height 1', { height: 1 }],
  ['build 0', { build: 0 }], ['build 1', { build: 1 }],
  ['head 0', { head: 0 }], ['head 1', { head: 1 }],
  ['no weapon', { weapon: 'none' }], ['no headgear', { headgear: 'none' }], ['no cape', { cape: 'none' }],
  ['nothing worn or held', { weapon: 'none', headgear: 'none', cape: 'none' }],
  ['other colours', COLOURS], ['other colours, no weapon', { ...COLOURS, weapon: 'none' }],
  ['other colours, nothing worn or held', { ...COLOURS, weapon: 'none', headgear: 'none', cape: 'none' }],
  ['tall, stocky, big head, no cape', { height: 1, build: 1, head: 1, cape: 'none' }],
];

test('the Hero preset differs from sprites/knight.js by at most 2% of the drawn pixels, at the defaults and at the ends of its controls', (t) => {
  // drawn the way engine/data-sprite.js draws a library body: drawSprite(g, definition, { clip, frame, p })
  const preset = S.hero();
  const worst = {};
  for (const [name, over] of ENDS) {
    const p = { ...BASE, ...over }, q = presetParams(p);
    for (const [clip, c] of Object.entries(knight.clips)) for (let f = 0; f < c.frames; f++) {
      const want = renderFrame(knight, clip, f, p), got = new Surface(...H.SIZE);
      S.drawSprite(got, preset, { clip, frame: f, t: framePhase(c, f), p: q });
      const share = diff(got, want) / count(want);
      if (!worst[clip] || share > worst[clip].share) worst[clip] = { share, at: `${name}, frame ${f}` };
      if (name === 'default') assert.equal(diff(got, want), 0, `default ${clip} frame ${f}: the preset is the Hero at the defaults`);
    }
  }
  const lines = Object.entries(worst).map(([clip, w]) => `${clip}: ${(w.share * 100).toFixed(2)}% (${w.at})`);
  t.diagnostic(`worst case per clip: ${lines.join('; ')}`);
  if (process.env.S6_SHOW) console.log(JSON.stringify(worst, null, 1));
  for (const [clip, w] of Object.entries(worst)) assert.ok(w.share <= 0.02, `${clip}: ${(w.share * 100).toFixed(2)}% of the drawn pixels differ (${w.at})`);
});

test('figureFor: the preset at a setting is the Hero\'s figure at that setting (colours, sliders and parts mapped), with its keys and keysFor', () => {
  const preset = S.hero();
  const at0 = S.figureFor(preset, presetParams(BASE));
  assert.deepEqual(at0.keysFor, preset.body.figure, 'keysFor: the figure as stored');
  assert.deepEqual(at0.keys, S.figureKeys(preset.clips));
  for (const [name, over] of ENDS) {
    const p = { ...BASE, ...over }, { keys, keysFor, ...fig } = S.figureFor(preset, presetParams(p)), want = S.heroFigure(p);
    // one known difference: with nothing metal worn or held, sprites/knight.js gives the buckle plain steel's light tone, the slot rule the metal's
    if (name === 'other colours, nothing worn or held') { assert.notEqual(fig.belt.buckle, want.belt.buckle); fig.belt.buckle = want.belt.buckle; }
    assert.deepEqual(fig, want, name);
  }
});

test('HERO_SETTINGS are the defaults of sprites/knight.js', () => {
  assert.deepEqual({ ...S.HERO_SETTINGS }, BASE);
});
