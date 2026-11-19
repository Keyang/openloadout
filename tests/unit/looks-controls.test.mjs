// The look controls' pure helpers (app/theme-controls.js) under the rule that a thing stays what it is (Contract 7):
// a picture repainted from its list of colours is held by its materials exactly as applyColour holds it, the small
// colour preview of each look shows what a look really does to skin and leaves, and the sentence next to
// "Also change shapes" is one plain sentence.
// Run with: node --test tests/unit/looks-controls.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { indexPixels, recolourIndexed, previewSwatches, SHAPES_HINT } from '../../app/theme-controls.js';
import { THEME_PRESETS, applyColour, spriteMaterials, normalizeTheme, randomTheme, isOneColourLook, defaultTheme } from '../../engine/theme.js';
import { oklch, hueTurn } from '../../engine/materials.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import { loadSprites } from '../../tools/lib/assets.mjs';

const sprites = (await loadSprites()).map((s) => s.def);
const LOOKS = [...THEME_PRESETS.map((p) => normalizeTheme(p.theme)), ...[1, 2, 3, 4].map((i) => normalizeTheme(randomTheme(i)))];
const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

test('a picture repainted from its list of colours, with its materials, is exactly what applyColour gives with them', () => {
  for (const s of sprites.slice(0, 12)) {
    const g = renderFrame(s, s.preview, 0, defaultParams(s));
    const bytes = new Uint8ClampedArray(g.data.buffer.slice(0));
    const indexed = indexPixels(bytes), table = spriteMaterials(s, {});
    for (const t of LOOKS) {
      const direct = applyColour(new Uint8ClampedArray(bytes), t.colour, table);
      assert.deepEqual(recolourIndexed(indexed, t.colour, table), direct, s.id);
      assert.deepEqual(recolourIndexed(indexed, t.colour, () => table), direct, `${s.id}: the materials may be handed over as a function`);
    }
    // and without materials it is still the plain colour maths
    const t = LOOKS.find((x) => x.colour.palette);
    assert.deepEqual(recolourIndexed(indexed, t.colour), applyColour(new Uint8ClampedArray(bytes), t.colour));
  }
});

test('the preview of a look keeps the skin sample a skin tone and the leaf sample a leaf colour, under every look with colours', () => {
  const made = previewSwatches(defaultTheme());
  assert.equal(made.length, 5);
  const [skin, , , leaf] = made.map((h) => oklch(...rgbOf(h)));
  for (const t of LOOKS.filter((x) => !isOneColourLook(x.colour))) {
    const now = previewSwatches(t).map((h) => oklch(...rgbOf(h)));
    assert.ok(Math.abs(hueTurn(skin.h, now[0].h)) <= 22, `skin under ${JSON.stringify(t.colour)}`);
    assert.ok(Math.abs(hueTurn(leaf.h, now[3].h)) <= 40, `leaves under ${JSON.stringify(t.colour)}`);
  }
  // looks still preview differently from one another
  assert.ok(new Set(THEME_PRESETS.map((p) => previewSwatches(p.theme).join())).size >= THEME_PRESETS.length - 1);
});

test('the sentence next to "Also change shapes" is one short sentence in everyday words', () => {
  assert.equal(typeof SHAPES_HINT, 'string');
  assert.equal(SHAPES_HINT.split(/[.!?](?:\s|$)/).filter((x) => x.trim()).length, 1, SHAPES_HINT);
  assert.ok(SHAPES_HINT.length <= 180, `${SHAPES_HINT.length} characters`);
  assert.match(SHAPES_HINT, /nothing is taken away or swapped/);
  assert.doesNotMatch(SHAPES_HINT, /param|seed|theme|variant|toggle|slider|control/i);
});
