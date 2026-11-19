// Ready-made versions (docs/site-design.md, section 4): engine/versions.js on small made-up sprites and sounds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defineSprite, range, choice, color, toggle, defaultParams, cleanParams } from '../../engine/sprite.js';
import { versionsOf, soundVersionsOf, cleanVersions, pictureDifference, versionName, VERSION_RULES, onStep, badVersionName, cardPicture } from '../../engine/versions.js';
import { Surface } from '../../engine/surface.js';

const blob = (extra = {}) => defineSprite({
  id: 'test-blob', name: 'Test blob', size: [24, 24], pivot: [12, 22],
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    eyes: choice('Eyes', 'round', ['round', 'sleepy', 'angry']),
    body: color('Body', '#3f6fd1', ['#3f6fd1', '#c9423a', '#4f9d57', '#e6c545']),
    hat: choice('Hat', 'none', ['none', 'cap', 'crown']),
    hatColour: color('Color', '#c9423a', ['#c9423a', '#7a4fc4']),
    glow: toggle('Glow', false),
    bounce: range('Bounce', 0.5, { lo: 'Calm', hi: 'Bouncy', group: 'Motion' }),
  },
  parts: { hat: { label: 'Hat', params: ['hat', 'hatColour'], none: 'none' } },
  clips: { idle: { frames: 4, fps: 6 } },
  render(g, { t, p }) {
    const r = 4 + p.size * 6, cy = 15 - p.bounce * Math.sin(t * 6.28);
    if (p.glow) g.ellipse(12, cy, r + 2, r + 1, '#f0ead8');
    g.ellipse(12, cy, r, r - 1, p.body);
    const ey = Math.round(cy - 2);
    if (p.eyes === 'round') { g.rect(9, ey, 2, 2, '#231b33'); g.rect(13, ey, 2, 2, '#231b33'); }
    else if (p.eyes === 'sleepy') { g.rect(9, ey + 1, 2, 1, '#231b33'); g.rect(13, ey + 1, 2, 1, '#231b33'); }
    else { g.rect(9, ey, 3, 1, '#231b33'); g.rect(13, ey, 3, 1, '#231b33'); g.rect(10, ey + 1, 2, 1, '#231b33'); g.rect(13, ey + 1, 2, 1, '#231b33'); }
    if (p.hat === 'cap') g.rect(8, Math.round(cy - r - 1), 9, 3, p.hatColour);
    if (p.hat === 'crown') { g.rect(8, Math.round(cy - r - 1), 9, 2, p.hatColour); g.rect(8, Math.round(cy - r - 3), 1, 2, p.hatColour); g.rect(12, Math.round(cy - r - 3), 1, 2, p.hatColour); g.rect(16, Math.round(cy - r - 3), 1, 2, p.hatColour); }
  },
  ...extra,
});

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

test('versionsOf is deterministic for a sprite id and seed, and another seed gives other versions', () => {
  const s = blob();
  const a = versionsOf(s, 6), b = versionsOf(blob(), 6);
  assert.ok(a.length >= 4, `only ${a.length} versions`);
  assert.deepEqual(a, b);
  const c = versionsOf(blob(), 6, { seed: 99 });
  assert.ok(!same(a.map((v) => v.params), c.map((v) => v.params)), 'seed 99 gave the same versions');
  assert.deepEqual(versionsOf(blob(), 6, { seed: 99 }), c);
});

test('fewer versions are the first of more: a card (3) shows the first three of the asset page (12)', () => {
  const s = blob();
  assert.deepEqual(versionsOf(s, 3), versionsOf(blob(), 12).slice(0, 3));
});

test('every version is complete, clean, different from the defaults and from each other by the rule', () => {
  const s = blob();
  const list = versionsOf(s, 8);
  const dflt = defaultParams(s);
  for (const v of list) {
    assert.deepEqual(Object.keys(v.params).sort(), Object.keys(dflt).sort(), v.name);
    assert.deepEqual(cleanParams(s, v.params), v.params, `${v.name}: params are not clean`);
    assert.equal(v.made, 'generated');
  }
  const pics = [dflt, ...list.map((v) => v.params)].map((p) => VERSION_RULES.picture(s, p));
  for (let i = 0; i < pics.length; i++) for (let j = i + 1; j < pics.length; j++) {
    const d = pictureDifference(pics[i], pics[j]);
    const need = i === 0 ? VERSION_RULES.fromDefaults : VERSION_RULES.between;
    assert.ok(d >= need, `${i ? list[i - 1].name : 'defaults'} vs ${list[j - 1].name}: ${d.toFixed(3)} < ${need}`);
  }
});

test('hand-made versions come first, cleaned over the defaults, and generated ones fill the rest', () => {
  const s = blob({ versions: [{ name: 'Royal', params: { hat: 'crown', hatColour: '#7a4fc4' } }, { name: 'Plain', params: {} }] });
  const list = versionsOf(s, 5);
  assert.equal(list.length, 5);
  assert.deepEqual(list.slice(0, 2).map((v) => [v.name, v.made]), [['Royal', 'hand'], ['Plain', 'hand']]);
  assert.deepEqual(list[0].params, { ...defaultParams(s), hat: 'crown', hatColour: '#7a4fc4' });
  assert.deepEqual(list[1].params, defaultParams(s));
  assert.ok(list.slice(2).every((v) => v.made === 'generated'));
  // asking for fewer than the hand-made ones gives the first of them
  assert.deepEqual(versionsOf(s, 1).map((v) => v.name), ['Royal']);
});

test('cleanVersions refuses unknown controls, impossible values, missing names and repeated names', () => {
  const bad = (versions) => () => cleanVersions(blob({ versions }));
  assert.throws(bad({}), /must be a list/);
  assert.throws(bad([{ params: {} }]), /needs a name/);
  assert.throws(bad([{ name: 'A', params: { tail: 1 } }]), /"tail", which is not one of/);
  assert.throws(bad([{ name: 'A', params: { eyes: 'square' } }]), /eyes.*can never be/);
  assert.throws(bad([{ name: 'A', params: { size: 3 } }]), /size.*can never be/);
  assert.throws(bad([{ name: 'A', params: { body: 'blue' } }]), /body.*can never be/);
  assert.throws(bad([{ name: 'A', params: { glow: 'yes' } }]), /glow.*can never be/);
  assert.throws(bad([{ name: 'A', params: {} }, { name: 'a', params: { glow: true } }]), /twice/);
  assert.throws(bad([{ name: 'A', params: {}, colour: 'red' }]), /takes name and params/);
  assert.deepEqual(cleanVersions(blob()), []);
});

test('cleanVersions accepts an old option name that a choice\'s `was` maps, and cleans it to the new one', () => {
  const s = blob({ params: { ...blob().params, cape: choice('Cape', 'plain', ['plain', 'none'], { was: { false: 'none', true: 'plain' } }) }, versions: [{ name: 'Bare', params: { cape: false } }] });
  assert.equal(cleanVersions(s)[0].params.cape, 'none');
});

test('onStep puts a slider value on its steps without floating-point tails', () => {
  const d = range('Length', 1, { min: 0.65, max: 1.35, step: 0.05 });
  assert.equal(onStep(d, 0.65 + 0.05 * 7), 1);
  assert.equal(onStep(d, 0.351 + 0.65), 1);
  assert.equal(onStep(d, 2), 1.35);
  assert.equal(onStep(range('A', 0, { min: -10, max: 40, step: 1 }), 7.4), 7);
  for (const v of versionsOf(blob(), 8)) assert.equal(String(v.params.size).length <= 4, true, `${v.name}: size ${v.params.size}`);
});

test('badVersionName catches a doubled word, a part taken off and changed, and long names', () => {
  assert.equal(badVersionName('Long hair, axe'), null);
  assert.equal(badVersionName('Cap, purple hat'), null);
  assert.match(badVersionName('Green hills, high hills'), /twice/);
  assert.match(badVersionName('Greyish sky blue sky'), /twice/);
  assert.match(badVersionName('No wings, tan belly and wings'), /twice|off/);
  assert.match(badVersionName('No hat, purple hat'), /twice|off/);
  assert.match(badVersionName('Big head, long neck, tall staff'), /four/);
  assert.match(badVersionName('Light grey belly and wings'), /four/);
  assert.match(badVersionName('Duller brightness'), /echoes/);
  assert.match(badVersionName('Brighter brightness, more grit'), /echoes/);
  assert.equal(badVersionName('Duller, more grit'), null);
});

test('cardPicture averages a big frame down to card size; a small one is measured as drawn', () => {
  const big = new Surface(128, 96);
  big.rect(0, 0, 64, 96, '#ff0000');
  const c = cardPicture(big, 64);
  assert.deepEqual([c.w, c.h], [64, 48]);
  assert.ok(c.data[0] && !c.data[63]);
  const small = new Surface(24, 24);
  assert.equal(cardPicture(small, 64).data, small.data);
});

test('names are everyday words: no control keys, no colour codes, no numbers, unique, capitalised', () => {
  const s = blob();
  const keys = Object.keys(s.params).filter((k) => k !== k.toLowerCase() || k.length > 4);   // hatColour; short keys like "eyes" are words too
  const list = versionsOf(s, 8);
  assert.equal(new Set(list.map((v) => v.name)).size, list.length, 'two versions share a name');
  for (const v of list) {
    assert.equal(badVersionName(v.name), null, v.name);
    assert.match(v.name, /^[A-Z][a-z]*( [a-z]+)*(, [a-z]+( [a-z]+)*)*$/, v.name);
    assert.ok(!/#|\d/.test(v.name), v.name);
    for (const k of keys) assert.ok(!v.name.includes(k), `${v.name} names the key ${k}`);
  }
});

test('versionName says what changed in words, most visible change first', () => {
  const s = blob();
  const p = { ...defaultParams(s), hat: 'crown', body: '#c9423a' };
  const name = versionName(s, p);
  assert.match(name, /crown/i);
  assert.match(name, /red body/i);
  assert.equal(versionName(s, { ...defaultParams(s), hat: 'cap' }), 'Cap');
  assert.equal(versionName(s, { ...defaultParams(s), eyes: 'sleepy' }), 'Sleepy eyes');
  assert.equal(versionName(s, { ...defaultParams(s), size: 1 }), 'Big');
  assert.equal(versionName(s, { ...defaultParams(s), glow: true }), 'Glow');
  assert.equal(versionName(s, { ...defaultParams(s), hat: 'cap', hatColour: '#7a4fc4' }).toLowerCase(), 'cap, purple hat');
  assert.equal(versionName(s, defaultParams(s)), 'Standard');
  assert.equal(versionName(s, { ...defaultParams(s), bounce: 0 }), 'Less bounce');
});

test('pictureDifference counts clearly different pixels over the drawn area only', () => {
  const a = new Surface(4, 4), b = new Surface(4, 4);
  assert.equal(pictureDifference([a], [b]), 0);
  a.dot(0, 0, '#ff0000'); b.dot(0, 0, '#ff0000');
  a.dot(1, 0, '#ff0000'); b.dot(1, 0, '#fe0101');     // too close to see
  assert.equal(pictureDifference([a], [b]), 0);
  b.dot(2, 0, '#00ff00');                              // drawn in one only
  assert.equal(pictureDifference([a], [b]), 1 / 3);
});

test('pictureDifference sees a change of hue on a dark colour as clearly as on a light one', () => {
  const a = new Surface(4, 4), b = new Surface(4, 4), c = new Surface(4, 4);
  a.rect(0, 0, 4, 4, '#3a2a4a');   // dark purple
  b.rect(0, 0, 4, 4, '#2a4a3a');   // dark green: no channel moves 40
  c.rect(0, 0, 4, 4, '#3b2b4b');   // the same, one step off
  assert.equal(pictureDifference([a], [b]), 1);
  assert.equal(pictureDifference([a], [c]), 0);
});

test('a pale, nearly colourless sky is never among the first three versions', () => {
  const sky = defineSprite({ id: 'test-sky', name: 'Sky', size: [16, 16], pivot: [8, 15], meta: { type: 'background' },
    params: { sky: color('Sky', '#4f7fe0', ['#4f7fe0', '#f0ead8', '#e08a2c', '#7a4fc4', '#2f8f9d', '#c9423a']) },
    clips: { far: { frames: 1, fps: 1 } }, render(g, { p }) { g.rect(0, 0, 16, 16, p.sky); } });
  const list = versionsOf(sky, 6);
  assert.ok(list.length >= 4, list.map((v) => v.name).join(', '));
  assert.ok(!list.slice(0, 3).some((v) => v.params.sky === '#f0ead8'), list.map((v) => v.name).join(', '));
});

test('a sprite with nothing to change gets no generated versions, and a small control set gives fewer than asked', () => {
  const still = defineSprite({ id: 'test-still', name: 'Still', size: [8, 8], pivot: [4, 7], params: {}, clips: { idle: { frames: 1, fps: 1 } }, render(g) { g.rect(2, 2, 4, 4, '#c9423a'); } });
  assert.deepEqual(versionsOf(still, 5), []);
  const two = defineSprite({ id: 'test-two', name: 'Two', size: [8, 8], pivot: [4, 7], params: { c: color('Colour', '#c9423a', ['#c9423a', '#3f6fd1']) }, clips: { idle: { frames: 1, fps: 1 } }, render(g, { p }) { g.rect(2, 2, 4, 4, p.c); } });
  const list = versionsOf(two, 5);
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'Blue');
});

// ---- sounds and music ----

const PATCH = {
  id: 'test-ding', name: 'Ding',
  params: [
    { id: 'pitch', label: 'Pitch', min: 200, max: 2000, default: 800, unit: 'Hz', scale: 'log' },
    { id: 'ring', label: 'Ring', min: 0.1, max: 0.6, default: 0.3, unit: 's' },
    { id: 'shine', label: 'Shine', min: 0, max: 1, default: 0.5 },
    { id: 'bars', label: 'Length', min: 8, max: 32, default: 8, unit: 'bars', step: 8 },
    { id: 'inst', label: 'Melody instrument', min: 0, max: 2, default: 0, options: ['Synth lead', 'Flute', 'Bell'] },
  ],
  presets: { Gem: { pitch: 1250, shine: 1 }, 'Dull token': { pitch: 300, shine: 0 } },
};

test('soundVersionsOf: one version per style first, then seeded settings, deterministic and distinct', () => {
  const list = soundVersionsOf(PATCH, 8);
  assert.equal(list.length, 8);
  assert.deepEqual(list.slice(0, 2).map((v) => [v.name, v.made, v.style]), [['Gem', 'hand', 'Gem'], ['Dull token', 'hand', 'Dull token']]);
  assert.deepEqual(list[0].params, { pitch: 1250, ring: 0.3, shine: 1, bars: 8, inst: 0 });
  assert.deepEqual(soundVersionsOf(PATCH, 8), list);
  assert.deepEqual(soundVersionsOf(PATCH, 3), list.slice(0, 3));
  assert.ok(!same(soundVersionsOf(PATCH, 8, { seed: 5 }), list));
  for (const v of list.slice(2)) {
    assert.equal(v.made, 'generated');
    assert.equal(v.style, null);
    for (const d of PATCH.params) {
      const x = v.params[d.id];
      assert.ok(x >= d.min && x <= d.max, `${v.name}: ${d.id} = ${x}`);
      if (d.step) assert.equal((x - d.min) % d.step, 0, `${v.name}: ${d.id} off its step`);
      if (d.options) assert.ok(Number.isInteger(x));
    }
  }
  assert.equal(new Set(list.map((v) => v.name)).size, list.length);
  for (const v of list) assert.ok(!/\d|#|Hz|bpm/.test(v.name) && /^[A-Z]/.test(v.name), v.name);
});

test('sound version names use the words of each control', () => {
  const list = soundVersionsOf(PATCH, 12);
  const words = list.slice(2).map((v) => v.name.toLowerCase()).join(' | ');
  assert.match(words, /higher pitch|lower pitch|longer ring|shorter ring|more shine|less shine|longer|shorter|flute|bell/);
  assert.ok(!/\binst\b|\bbars\b/.test(words), words);
});

test('a sound with no styles and no controls has no versions', () => {
  assert.deepEqual(soundVersionsOf({ id: 'test-x', params: [] }, 4), []);
});
