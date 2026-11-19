// The sprite quality bar, S-held-under-looks: under every whole-bundle look each colour stays inside what its
// material allows, and two tones that were clearly different do not become one (quality/sprite.js: lookFaults,
// checkedLooks, and the "held under every look" part of checkSprite). The check runs with nobody looking.
// To show that it catches the faults, the measure is also handed the plain colour maths (a look that knows nothing
// of the sprite), which is what turned skies brown and colour-coded cells into one grey.
// Run with: node --test tests/unit/quality-looks-held.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSprite, lookFaults, checkedLooks, THRESHOLDS } from '../../quality/sprite.js';
import { defineSprite, color, range } from '../../engine/sprite.js';
import { THEME_PRESETS, applyColour, spriteMaterials, isOneColourLook, randomTheme } from '../../engine/theme.js';
import { loadSprites } from '../../tools/lib/assets.mjs';

const sprites = (await loadSprites()).map((s) => s.def);

/** A look that knows nothing of the sprite: every colour through the plain colour maths. */
const plainLook = (table, colour) => {
  const probe = applyColour(Uint32Array.from([0xff123456]), colour);
  if (probe[0] === 0xff123456 && applyColour(Uint32Array.from([0xffa0b0c0]), colour)[0] === 0xffa0b0c0) return null;
  return { one: isOneColourLook(colour), of: (r, g, b) => { const v = applyColour(Uint32Array.from([(0xff000000 | (b << 16) | (g << 8) | r) >>> 0]), colour)[0]; return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255]; } };
};

const scene = () => defineSprite({
  id: 'held-scene', name: 'Held scene', size: [32, 32], pivot: [16, 31],
  params: {
    sky: color('Sky', '#8fd0f0', ['#8fd0f0', '#f0c8a0', '#2a3050']),
    land: color('Grass', '#6aa83e', ['#6aa83e', '#c9a06a', '#8f97a8']),
    water: color('Water', '#3f9fd1', ['#3f9fd1', '#2f8f9d', '#5a8fc0']),
    skin: color('Skin', '#e8b088', ['#f6d3b0', '#e8b088', '#6e4428']),
    height: range('Height', 0.5), width: range('Width', 0.5),
  },
  clips: { idle: { frames: 1, fps: 1 } },
  meta: { type: 'background' },
  render(g, { p }) { g.rect(0, 0, 32, 12, p.sky); g.rect(0, 12, 32, 8, p.land); g.rect(0, 20, 16, 12, p.water); g.rect(16, 20, 16, 12, p.skin); },
});
// three colour-coded cells, equally light: only their hue tells them apart
const cells = () => defineSprite({
  id: 'held-cells', name: 'Held cells', size: [24, 8], pivot: [12, 7],
  params: { a: color('Body', '#d2534a', ['#d2534a', '#000000', '#ffffff']), b: color('Trim', '#4a9a4e', ['#4a9a4e', '#000000', '#ffffff']), c: color('Edge', '#5a7fd8', ['#5a7fd8', '#000000', '#ffffff']), size: range('Size', 0.5) },
  clips: { idle: { frames: 1, fps: 1 } }, meta: { type: 'prop' },
  render(g, { p }) { g.rect(0, 0, 8, 8, p.a); g.rect(8, 0, 8, 8, p.b); g.rect(16, 0, 8, 8, p.c); },
});

test('the looks measured are every named look that changes a colour, then a run of "Surprise me" looks', () => {
  const looks = checkedLooks();
  const named = THEME_PRESETS.filter((p) => JSON.stringify(p.theme.colour) !== JSON.stringify(THEME_PRESETS.find((x) => x.id === 'original').theme.colour));
  assert.deepEqual(looks.slice(0, named.length).map((l) => l.id), named.map((p) => p.id));
  assert.equal(looks.length, named.length + THRESHOLDS.lookSurprises);
  assert.deepEqual(looks[named.length].colour, randomTheme(1).colour);
  assert.ok(THRESHOLDS.lookSurprises >= 4 && THRESHOLDS.toneSame > 0 && THRESHOLDS.toneShare > 0 && THRESHOLDS.toneMost >= 16);
});

test('a material leaving its allowed range is caught: the plain colour maths turns the sky, the water and the skin, and the measure says which, under which look, and why', () => {
  const table = spriteMaterials(scene(), {});
  const faults = lookFaults(table, checkedLooks(), plainLook);
  assert.ok(faults.tested >= 10);
  for (const material of ['sky', 'water', 'skin', 'plant']) {
    const mine = faults.left.filter((f) => f.material === material);
    assert.ok(mine.length >= 1, `nothing caught for ${material}`);
    assert.match(mine[0].why, new RegExp(material === 'plant' ? 'plants' : material));
    assert.match(mine[0].from, /^#[0-9a-f]{6}$/); assert.match(mine[0].to, /^#[0-9a-f]{6}$/);
    assert.ok(mine[0].look.name && mine[0].control);
  }
  // a colour set that has no blue takes the sky with it under the plain maths
  const noBlue = checkedLooks().filter((l) => faults.left.some((f) => f.look.id === l.id && f.material === 'sky'));
  assert.ok(noBlue.length >= 1);
});

test('with the engine\'s own recolouring no colour of the same scene leaves its range, under any look', () => {
  const faults = lookFaults(spriteMaterials(scene(), {}));
  assert.deepEqual(faults.left.map((f) => `${f.look.name}: ${f.material} ${f.from} -> ${f.to}: ${f.why}`), []);
  assert.equal(faults.tested, checkedLooks().length);
});

test('two tones collapsing is caught: the plain colour maths makes equally light cells one grey, and the measure names the pair and the look', () => {
  const table = spriteMaterials(cells(), {});
  const faults = lookFaults(table, checkedLooks(), plainLook);
  assert.ok(faults.merged.length >= 1, 'nothing caught');
  const m = faults.merged[0];
  assert.ok(m.before >= 0.07 && m.after < THRESHOLDS.toneSame, `${m.before} -> ${m.after}`);
  assert.ok(faults.merged.some((x) => isOneColourLook(x.look.colour)), 'caught under a look of one colour (shades of grey)');
  assert.notEqual(m.a, m.b);
  // and the engine's own recolouring keeps them apart
  assert.deepEqual(lookFaults(table).merged, []);
});

test('checkSprite runs the measure by itself and reports it in metrics.held', () => {
  const r = checkSprite(scene());
  const held = r.metrics.held;
  assert.equal(held.tested, checkedLooks().length);
  assert.equal(held.left, 0); assert.equal(held.merged, 0);
  assert.equal(held.colours, 4);
  assert.deepEqual(Object.keys(held.materials).sort(), ['plant', 'skin', 'sky', 'water']);
  assert.ok(held.ms >= 0);
  assert.ok(!r.errors.some((m) => /under the ".*" look/.test(m)), r.errors.join('\n'));
  assert.ok(!r.warnings.some((m) => /nearly the same/.test(m)), r.warnings.join('\n'));
});

test('checkSprite is deterministic about it', () => {
  const a = checkSprite(cells()), b = checkSprite(cells());
  assert.deepEqual({ ...a.metrics.held, ms: 0 }, { ...b.metrics.held, ms: 0 });
  assert.deepEqual(a.warnings, b.warnings);
});

test('every sprite in the catalogue: no colour leaves its material\'s limits under any measured look', () => {
  const bad = [];
  let merged = 0, pairs = 0;
  for (const s of sprites) {
    const faults = lookFaults(spriteMaterials(s, {}));
    for (const f of faults.left) bad.push(`${s.id} / ${f.look.name}: ${f.material} ${f.from} -> ${f.to}: ${f.why}`);
    merged += faults.merged.length; pairs++;
  }
  assert.deepEqual(bad.slice(0, 10), [], `${bad.length} colours left their limits`);
  // tones nearly the same are warnings; they must stay rare (a crowded icon sheet under shades of grey)
  assert.ok(merged <= pairs * 2, `${merged} pairs of tones nearly the same over ${pairs} sprites`);
});
