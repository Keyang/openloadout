// The flat style (Contract 12): every data sprite's draw list drawn as vector shapes (engine/vector.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { styleById, styleIds, stylesOf, ownStyles, exportSheet, pixelsOf, preferStyle, preferredStyle, artStyleOf } from '../../engine/styles.js';
import { dataSprite } from '../../engine/data-sprite.js';
import { defaultParams, renderFrame, renderSheet } from '../../engine/sprite.js';
import { renderVector, shapePolys } from '../../engine/vector.js';
import { FLAT_SCALE } from '../../engine/flat.js';
import { ROOT, loadDataSprite } from '../../tools/lib/assets.mjs';
import { encodePNG } from '../../tools/png.mjs';
import { readPNG } from '../fixtures/catalog/png-read.mjs';
import blob from '../fixtures/styles/blob.js';

const load = (id) => dataSprite(JSON.parse(readFileSync(new URL(`../../sprites/${id}.json`, import.meta.url), 'utf8')));
const knight = await loadDataSprite(ROOT, 'sprites/knight.json');
const alpha = (v) => v >>> 24;

test('flat is a registered, derived style: every data sprite has it after its own, a code sprite does not', () => {
  assert.ok(styleIds().includes('flat'));
  assert.equal(styleIds()[0], 'pixel', 'pixel stays first');
  assert.equal(styleById('flat').derived, true);
  const coin = load('coin');
  assert.deepEqual(ownStyles(coin), ['pixel']);
  assert.deepEqual(stylesOf(coin), ['pixel', 'flat']);
  assert.ok(!stylesOf(blob).includes('flat'), 'a code fixture draws on a pixel surface itself');
});

test('a flat frame: 4x the frame by default, any size asked for, smooth edges, a few flat colours', () => {
  const p = defaultParams(knight);
  const g = renderFrame(knight, 'idle', 0, p, { style: 'flat' });
  assert.equal(g.w, knight.size[0] * FLAT_SCALE);
  assert.deepEqual(g.flat, { w: knight.size[0], h: knight.size[1], scale: FLAT_SCALE });
  const big = renderFrame(knight, 'idle', 0, p, { style: 'flat', scale: 8 });
  assert.equal(big.w, knight.size[0] * 8);
  let partial = 0, solid = 0;
  const count = new Map();
  for (const v of big.data) { const a = alpha(v); if (!a) continue; if (a === 255) { solid++; count.set(v, (count.get(v) ?? 0) + 1); } else partial++; }
  assert.ok(solid > 2000 && partial > 200, 'drawn, with anti-aliased edges');
  const top = [...count.values()].sort((x, y) => y - x).slice(0, 24).reduce((n, v) => n + v, 0);
  assert.ok(top / solid > 0.9, `flat fills: 24 colours cover ${Math.round((100 * top) / solid)}% of the solid pixels`);
});

test('the pixel picture of a flat frame is the frame size; the pixel style is untouched', () => {
  const coin = load('coin'), p = defaultParams(coin);
  const grid = pixelsOf(renderFrame(coin, 'spin', 0, p, { style: 'flat' }), 'flat');
  assert.deepEqual([grid.w, grid.h], coin.size);
  assert.ok(grid.data.some((v) => v));
  assert.equal(renderFrame(coin, 'spin', 0, p).w, coin.size[0], 'with no style asked for, the sprite draws in its first');
});

test('shapes are exact: a circle is round, and one body is one fill (no holes where parts overlap)', () => {
  const g = renderVector([{ kind: 'ellipse', at: [8, 8], r: 6, paint: '#3060c0' }, { kind: 'capsule', from: [8, 8], to: [8, 14], r: [3, 2], paint: '#3060c0' }], {}, { width: 16, height: 16, scale: 8 });
  const at = (x, y) => alpha(g.data[Math.floor(y * 8) * g.w + Math.floor(x * 8)]);
  assert.equal(at(8, 8), 255, 'centre');
  assert.equal(at(8, 12), 255, 'where the capsule overlaps the circle');
  assert.equal(at(8 + 6 * Math.SQRT1_2 + 0.3, 8 - 6 * Math.SQRT1_2 - 0.3), 0, 'just outside the circle on the diagonal');
  assert.equal(at(8 + 6 * Math.SQRT1_2 - 0.3, 8 - 6 * Math.SQRT1_2 + 0.3), 255, 'just inside');
  assert.ok(shapePolys({ kind: 'dot', at: [3.4, 3.7] })[0].length >= 24, 'a dot is a round polygon');
});

test('a body gets one cel shadow away from the light; dither is left out; an outline goes round the outside', () => {
  const g = renderVector([
    { kind: 'ellipse', at: [16, 16], r: 10, paint: 'skin' },
    { kind: 'dither', area: { kind: 'rect', at: [0, 0], size: [4, 4] }, amount: 0.5, paint: '#000000' },
    { kind: 'outline', paint: 'ink' },
  ], { skin: '#d08050' }, { width: 32, height: 32, scale: 4 });
  const px = (x, y) => g.data[Math.floor(y * 4) * g.w + Math.floor(x * 4)];
  const lum = (v) => (v & 255) + ((v >> 8) & 255) + ((v >> 16) & 255);
  assert.ok(lum(px(9, 23)) < lum(px(16, 16)), 'darker at the bottom left');
  assert.ok(lum(px(22, 10)) >= lum(px(16, 16)), 'not darker at the top right');
  assert.equal(alpha(px(1, 1)), 0, 'the dither is not drawn');
  assert.ok(alpha(px(16, 5.6)) > 200 && lum(px(16, 5.6)) < 200, 'ink just outside the top');
});

test('a flat sheet exports one PNG at 4x with the style marked', async () => {
  const p = defaultParams(knight);
  const out = await exportSheet(knight, p, { style: 'flat', encodePng: (w, h, rgba) => encodePNG(w, h, rgba) });
  assert.equal(out.data.artStyle, 'flat');
  assert.equal(out.data.frameWidth, knight.size[0] * FLAT_SCALE);
  assert.equal(out.data.frames.length, renderSheet(knight, p, { style: 'pixel' }).meta.frames.length);
  const img = readPNG(Buffer.from(out.files[0].bytes));
  assert.equal(img.w, out.data.frameWidth * Math.max(...Object.values(out.data.animations).map((a) => a.frames)));
});

test('the site\'s preferred style is a default only', () => {
  try {
    assert.equal(preferredStyle(), 'pixel');
    assert.equal(artStyleOf(knight), 'pixel');
    preferStyle('flat');
    assert.equal(artStyleOf(knight), 'flat');
    assert.equal(artStyleOf(knight, 'pixel'), 'pixel', 'a style named on the item wins');
    assert.equal(artStyleOf(blob), 'pixel', 'a sprite without it stays in its first');
    assert.equal(preferStyle('nope'), 'pixel');
  } finally { preferStyle('pixel'); }
});
