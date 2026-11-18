// The whole-bundle look controls (W2-D2, features EDIT-6): the pure helpers in app/theme-controls.js.
// The look travels in the address bar, so a copied link must give back exactly the same look.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultTheme, normalizeTheme, randomTheme, THEME_PRESETS, PALETTES, applyColour } from '../../engine/theme.js';
import { rng } from '../../engine/motion.js';
import {
  themeToQuery, themeFromQuery, lookSearch, matchPreset, isSurprise, newSeed,
  previewSwatches, indexPixels, recolourIndexed,
} from '../../app/theme-controls.js';

const roundTrip = (t) => themeFromQuery(themeToQuery(t));
const viaText = (t) => themeFromQuery(Object.fromEntries(new URLSearchParams(lookSearch(t))));

test('the original look writes nothing into the address', () => {
  assert.deepEqual(themeToQuery(defaultTheme()), {});
  assert.equal(lookSearch(defaultTheme()), '');
  assert.deepEqual(themeFromQuery({}), defaultTheme());
  assert.deepEqual(themeFromQuery(undefined), defaultTheme());
});

test('every named look is one short word in the address and comes back exactly', () => {
  for (const p of THEME_PRESETS) {
    const q = themeToQuery(p.theme);
    if (p.id === 'original') assert.deepEqual(q, {});
    else assert.deepEqual(q, { look: p.id }, p.id);
    assert.deepEqual(roundTrip(p.theme), normalizeTheme(p.theme), p.id);
    assert.deepEqual(viaText(p.theme), normalizeTheme(p.theme), p.id);
    assert.equal(matchPreset(p.theme), p.id);
  }
});

test('50 "Surprise me" looks, with and without shapes, are kept as their number and come back exactly', () => {
  for (let i = 0; i < 50; i++) {
    const seed = 1 + i * 7919;
    for (const shapes of [false, true]) {
      const t = randomTheme(seed, { shapes });
      const q = themeToQuery(t);
      assert.equal(q.surprise, String(seed));
      assert.equal(q.shapes, shapes ? '1' : undefined);
      assert.ok(isSurprise(t));
      assert.deepEqual(roundTrip(t), normalizeTheme(t), `seed ${seed} shapes ${shapes}`);
      assert.deepEqual(viaText(t), normalizeTheme(t), `seed ${seed} shapes ${shapes} as text`);
    }
  }
});

test('hand-tuned looks (every field) come back exactly', () => {
  const r = rng(12345);
  const pick = (list) => list[Math.floor(r() * list.length)];
  for (let i = 0; i < 80; i++) {
    const base = normalizeTheme(pick([defaultTheme(), ...THEME_PRESETS.map((p) => p.theme), randomTheme(i + 1)]));
    const t = JSON.parse(JSON.stringify(base));
    if (r() < 0.5) t.colour.hue = Math.round((r() * 2 - 1) * 180);
    if (r() < 0.5) t.colour.saturation = Math.round(r() * 200) / 100;
    if (r() < 0.5) t.colour.contrast = 0.5 + Math.round(r() * 100) / 100;
    if (r() < 0.3) { t.colour.tint = pick(['#ffb040', '#5aa8ff', '#6a4ac0']); t.colour.tintAmount = Math.round(r() * 100) / 100; }
    if (r() < 0.3) t.colour.palette = r() < 0.2 ? null : pick(PALETTES).name;
    if (r() < 0.3) t.colour.outline = r() < 0.2 ? null : pick(['#000000', '#1a1020', '#0e1a2a']);
    if (r() < 0.5) t.sound.pitch = Math.round((r() * 2 - 1) * 12);
    if (r() < 0.5) t.sound.brightness = Math.round((r() * 2 - 1) * 100) / 100;
    if (r() < 0.5) t.music.tempo = 0.5 + Math.round(r() * 100) / 100;
    if (r() < 0.3) t.music.intensity = r() < 0.3 ? null : Math.round(r() * 100) / 100;
    if (r() < 0.3) t.shapes = !t.shapes;
    if (r() < 0.3) t.seed = Math.floor(r() * 1e6);
    assert.deepEqual(roundTrip(t), normalizeTheme(t), JSON.stringify(t));
    assert.deepEqual(viaText(t), normalizeTheme(t), JSON.stringify(t));
  }
  // a hand-tuned look is not mistaken for the named look it started from, but its link stays short
  const frost = normalizeTheme(THEME_PRESETS.find((p) => p.id === 'frost').theme);
  frost.sound.pitch = 5;
  assert.equal(matchPreset(frost), null);
  assert.deepEqual(themeToQuery(frost), { look: 'frost', pitch: '5' });
  assert.equal(isSurprise(frost), false);
  frost.colour.palette = null;
  assert.deepEqual(themeFromQuery(themeToQuery(frost)), frost);
});

test('a damaged or hostile address gives a sensible look and never throws', () => {
  const bad = [
    { look: 'nope' }, { surprise: 'abc' }, { shift: 'x', colourful: '-3', contrast: 'Infinity' },
    { tint: 'red', outline: '#12', colours: 'Nowhere' }, { pitch: '1e9' }, { intensity: 'loud' }, { speed: '0' },
    { look: '__proto__' }, { colours: 'constructor' },
  ];
  for (const q of bad) {
    const t = themeFromQuery(q);
    assert.deepEqual(Object.keys(t).sort(), ['colour', 'music', 'seed', 'shapes', 'sound']);
    assert.ok(Number.isFinite(t.colour.saturation) && t.colour.saturation >= 0);
    assert.ok(Number.isFinite(t.colour.contrast) && t.colour.contrast >= 0);
    assert.ok(t.music.tempo > 0);
    assert.ok(Math.abs(t.sound.pitch) <= 24);
    assert.ok(t.colour.palette === null || PALETTES.some((p) => p.name === t.colour.palette));
  }
  assert.deepEqual(themeFromQuery({ look: 'nope' }), defaultTheme());
});

test('newSeed never repeats the one before it', () => {
  let s = 0;
  for (let i = 0; i < 200; i++) { const n = newSeed(s); assert.notEqual(n, s); assert.ok(Number.isInteger(n) && n >= 1); s = n; }
});

test('each named look has a small colour preview, and different looks preview differently', () => {
  const seen = new Set();
  for (const p of THEME_PRESETS) {
    const sw = previewSwatches(p.theme);
    assert.ok(sw.length >= 4);
    for (const c of sw) assert.match(c, /^#[0-9a-f]{6}$/);
    seen.add(sw.join());
  }
  assert.equal(seen.size, THEME_PRESETS.length);
});

test('recolouring a picture through its list of colours gives exactly what applyColour gives', () => {
  const r = rng(99);
  const colours = ['#231b33', '#e8b796', '#c9423a', '#4f7fe0', '#6cc06a', '#ffcf3f', '#ffffff'].map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  const bytes = new Uint8ClampedArray(40 * 30 * 4);
  for (let i = 0; i < bytes.length; i += 4) {
    if (r() < 0.3) continue;   // transparent
    const [cr, cg, cb] = colours[Math.floor(r() * colours.length)];
    bytes[i] = cr; bytes[i + 1] = cg; bytes[i + 2] = cb; bytes[i + 3] = r() < 0.1 ? 128 : 255;
  }
  const indexed = indexPixels(bytes);
  assert.ok(indexed.colours.length <= colours.length * 2 + 1);
  const looks = [...THEME_PRESETS.map((p) => p.theme), randomTheme(3), randomTheme(4)];
  for (const t of looks) {
    const want = applyColour(bytes.slice(), t.colour);
    const got = recolourIndexed(indexed, t.colour);
    assert.ok(got instanceof Uint8ClampedArray);
    assert.deepEqual(Buffer.from(got.buffer), Buffer.from(want.buffer));
  }
  // the original bytes are not changed
  assert.deepEqual(recolourIndexed(indexed, defaultTheme().colour), bytes);
});
