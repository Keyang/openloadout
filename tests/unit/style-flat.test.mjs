// The flat style (Contract 12): the same draw list, drawn with solid colours and smooth edges at 4x.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { styleById, styleIds, exportSheet, pixelsOf, preferStyle, preferredStyle, artStyleOf } from '../../engine/styles.js';
import { dataSprite } from '../../engine/data-sprite.js';
import { defaultParams, renderFrame, renderSheet } from '../../engine/sprite.js';
import { drawList } from '../../engine/draw-list.js';
import { FLAT_SCALE, FlatSurface, UNSUPPORTED, smooth } from '../../engine/flat.js';
import { ROOT, loadDataSprite } from '../../tools/lib/assets.mjs';
import { encodePNG } from '../../tools/png.mjs';
import { readPNG } from '../fixtures/catalog/png-read.mjs';

const load = (id, styles) => {
  const def = JSON.parse(readFileSync(new URL(`../../sprites/${id}.json`, import.meta.url), 'utf8'));
  return dataSprite({ ...def, styles });
};
const knight = await loadDataSprite(ROOT, 'sprites/knight.json');   // a library sprite that lists flat
const alpha = (v) => v >>> 24;

test('flat is a registered style with a label and a sentence', () => {
  assert.ok(styleIds().includes('flat'));
  const s = styleById('flat');
  assert.match(s.label, /flat/i);
  assert.ok(s.about.length > 20);
  assert.equal(styleIds()[0], 'pixel', 'pixel stays first');
});

test('a sprite that lists flat draws a 4x frame with smooth edges and no shading steps', () => {
  const crate = knight;
  const p = defaultParams(crate);
  const g = renderFrame(crate, crate.preview, 0, p, { style: 'flat' });
  assert.equal(g.w, crate.size[0] * FLAT_SCALE);
  assert.equal(g.h, crate.size[1] * FLAT_SCALE);
  assert.deepEqual(g.flat, { w: crate.size[0], h: crate.size[1], scale: FLAT_SCALE });
  let partial = 0, solid = 0;
  const count = new Map();
  for (const v of g.data) { const a = alpha(v); if (a === 0) continue; if (a === 255) { solid++; count.set(v, (count.get(v) ?? 0) + 1); } else partial++; }
  assert.ok(solid > 500, 'something is drawn');
  assert.ok(partial > 20, 'edges are anti-aliased (partly see-through pixels)');
  const top = [...count.values()].sort((x, y) => y - x).slice(0, 24).reduce((n, v) => n + v, 0);
  assert.ok(top / solid > 0.9, `flat fills: 24 colours cover ${Math.round((100 * top) / solid)}% of the solid pixels`);
});

test('the pixel picture of a flat frame is the frame size, and pixel sprites are untouched', () => {
  const crate = knight;
  const p = defaultParams(crate);
  const flat = renderFrame(crate, crate.preview, 0, p, { style: 'flat' });
  const grid = pixelsOf(flat, 'flat');
  assert.equal(grid.w, crate.size[0]);
  assert.equal(grid.h, crate.size[1]);
  assert.ok(grid.data.some((v) => v), 'the grid has something in it');
  const a = renderFrame(load('coin', ['pixel']), 'spin', 0, defaultParams(load('coin', ['pixel'])), {}), b = renderFrame(load('coin', ['pixel', 'flat']), 'spin', 0, defaultParams(load('coin', ['pixel'])), {});
  assert.deepEqual([...a.data], [...b.data], 'listing flat does not change the pixel frame');
});

test('a sprite that does not list flat refuses it', () => {
  const crate = load('coin', ['pixel']);
  assert.throws(() => renderFrame(crate, crate.preview, 0, defaultParams(crate), { style: 'flat' }), /cannot be drawn in the style "flat"/);
});

test('drawList on a flat surface: a dither is left out, a dot is round, a stamp is whole blocks', () => {
  const raw = new FlatSurface(16, 16);
  const list = [
    { kind: 'rect', at: [2, 2], size: [6, 6], paint: '#d04030' },
    { kind: 'dither', area: { kind: 'rect', at: [10, 2], size: [4, 4] }, amount: 0.5, paint: '#000000' },
    { kind: 'dot', at: [12, 12], size: 2, paint: '#3040d0' },
    { kind: 'stamp', at: [2, 10], rows: ['XX', 'X.'], key: { X: '#30d040' } },
  ];
  const out = drawList(raw, list, { palette: {} });
  const g = smooth(raw);
  assert.equal(out.skipped.length, 0, JSON.stringify(out.skipped));
  const S = FLAT_SCALE, at = (x, y) => alpha(g.data[Math.round(y * S) * g.w + Math.round(x * S)]);
  assert.equal(at(4, 4), 255, 'the rect');
  assert.equal(at(11, 3), 0, 'the dither is not drawn');
  assert.equal(at(12, 12), 255, 'the dot centre');
  assert.equal(at(12.95, 12.95), 0, 'the dot is round: its corner stays empty');
  assert.equal(at(2.4, 10.4), 255, 'the stamp pixel');
  assert.equal(at(3.4, 11.4), 0, 'a see-through stamp cell');
});

test('text is listed as unsupported, and a flat sheet exports one PNG at 4x with the style marked', async () => {
  assert.ok(UNSUPPORTED.includes('text'));
  const crate = knight;
  const p = defaultParams(crate);
  const out = await exportSheet(crate, p, { style: 'flat', encodePng: (w, h, rgba) => encodePNG(w, h, rgba) });
  assert.equal(out.style, 'flat');
  assert.equal(out.data.artStyle, 'flat');
  assert.equal(out.data.frameWidth, crate.size[0] * FLAT_SCALE);
  assert.equal(out.data.frames.length, renderSheet(crate, p, { style: 'pixel' }).meta.frames.length);
  const img = readPNG(Buffer.from(out.files[0].bytes));
  assert.equal(img.w, out.data.frameWidth * Math.max(...Object.values(out.data.animations).map((a) => a.frames)));
  assert.ok(Object.keys(out.data.animations).length > 0, 'animations kept, so sounds can be timed');
});

test('the site\'s preferred style is a default only: a sprite that lists it shows in it, others keep their first', () => {
  const coin = load('coin', ['pixel']);
  try {
    assert.equal(preferredStyle(), 'pixel');
    assert.equal(artStyleOf(knight), 'pixel');
    preferStyle('flat');
    assert.equal(artStyleOf(knight), 'flat');
    assert.equal(artStyleOf(knight, 'pixel'), 'pixel', 'a style named on the item wins');
    assert.equal(artStyleOf(coin), 'pixel', 'a sprite that does not list it stays in its first');
    assert.equal(preferStyle('nope'), 'pixel', 'an unknown style means pixel');
  } finally { preferStyle('pixel'); }
});
