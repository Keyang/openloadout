// The style registry (docs/architecture.md, Contract 12) and how the engine goes through it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defineStyle, styleById, styleIds, stylesOf, supports, styleFor, pixelsOf } from '../../engine/styles.js';
import { defineSprite, renderFrame, renderPixels, renderSheet, defaultParams, range, choice } from '../../engine/sprite.js';
import { renderThemedFrame } from '../../engine/theme.js';
import { Surface } from '../../engine/surface.js';
import { col, INK } from '../../engine/color.js';
import { ShapeRecorder } from '../fixtures/styles/styles.js';
import blob from '../fixtures/styles/blob.js';
import sparkle from '../fixtures/styles/sparkle.js';
import { legacyRenderFrame } from '../fixtures/styles/legacy-render.mjs';

const tiny = (over = {}) => ({
  id: 'tiny', name: 'Tiny', size: [16, 16], pivot: [8, 15],
  params: { size: range('Size', 0.5) },
  clips: { idle: { frames: 2, fps: 4 } },
  render(g, { p }) { g.ellipse(8, 9, 3 + p.size * 3, 4, '#ff0000'); },
  ...over,
});
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const good = (id) => ({ id, label: 'Test style', about: 'A style for a test.', makeSurface: (w, h) => new Surface(w, h), exporters: { sheet: () => ({ files: [], data: {} }) } });

test('pixel is registered, and it is today\'s pipeline: the pixel surface, no finish, the PNG sheet exporter', () => {
  const pixel = styleById('pixel');
  assert.ok(pixel);
  assert.equal(pixel.id, 'pixel');
  assert.ok(pixel.label && pixel.about, 'plain words for the site');
  assert.ok(pixel.makeSurface(8, 6) instanceof Surface);
  assert.equal(pixel.makeSurface(8, 6).w, 8);
  assert.equal(pixel.finish, null, 'nothing is done to a finished pixel frame');
  assert.equal(typeof pixel.exporters.sheet, 'function');
  assert.ok(styleIds().includes('pixel'));
  assert.equal(styleIds()[0], 'pixel');
  assert.equal(styleById('no-such-style'), null);
});

test('defineStyle checks what it is given and refuses a second style with the same id', () => {
  assert.throws(() => defineStyle({ ...good('Bad Id') }), /lowercase/);
  assert.throws(() => defineStyle({ ...good('t-nolabel'), label: '' }), /label/);
  assert.throws(() => defineStyle({ ...good('t-noabout'), about: undefined }), /about/);
  assert.throws(() => defineStyle({ ...good('t-nosurface'), makeSurface: null }), /makeSurface/);
  assert.throws(() => defineStyle({ ...good('t-noexport'), exporters: {} }), /exporters/);
  assert.throws(() => defineStyle({ ...good('t-badfinish'), finish: 'blur' }), /finish/);
  assert.throws(() => defineStyle(good('pixel')), /already/);
  const made = defineStyle(good('t-registry-one'));
  assert.equal(styleById('t-registry-one'), made);
  assert.equal(made.finish, null);
  assert.ok(Object.isFrozen(made));
  assert.throws(() => defineStyle(good('t-registry-one')), /already/);
});

test('a sprite lists its styles; the default is pixel alone', () => {
  const s = defineSprite(tiny());
  assert.deepEqual(s.styles, ['pixel']);
  assert.deepEqual(stylesOf(s), ['pixel']);
  assert.deepEqual(stylesOf({}), ['pixel'], 'a definition that never went through defineSprite');
  assert.ok(supports(s, 'pixel'));
  assert.ok(!supports(s, 'silhouette'));
  assert.deepEqual(stylesOf(blob), ['pixel', 'silhouette', 'outline-svg']);
  assert.ok(supports(blob, 'outline-svg'));
  assert.deepEqual(stylesOf(sparkle), ['pixel', 'silhouette']);
  assert.ok(!supports(sparkle, 'outline-svg'), 'a sprite of single pixels does not offer the shape style');
});

test('defineSprite refuses a bad styles list', () => {
  assert.throws(() => defineSprite(tiny({ styles: [] })), /styles.*at least one/);
  assert.throws(() => defineSprite(tiny({ styles: 'pixel' })), /styles.*list/);
  assert.throws(() => defineSprite(tiny({ styles: ['pixel', 'watercolour'] })), /"watercolour" is not a style.*pixel/s);
  assert.throws(() => defineSprite(tiny({ styles: ['pixel', 'silhouette', 'pixel'] })), /"pixel".*twice/);
  // the page link and the bag use `style` for the chosen style, so a control cannot have that key once there is a choice
  const withStyleControl = { size: range('Size', 0.5), style: choice('Style', 'a', ['a', 'b']) };
  assert.throws(() => defineSprite(tiny({ styles: ['pixel', 'silhouette'], params: withStyleControl })), /control.*"style"/);
  assert.doesNotThrow(() => defineSprite(tiny({ params: withStyleControl })), 'fine while the sprite has one style');
});

test('render(g, ctx) is told the style, and a default call draws exactly what it drew before the seam', () => {
  const seen = [];
  const s = defineSprite(tiny({ styles: ['pixel', 'silhouette'], render(g, ctx) { seen.push(ctx.style); g.rect(2, 2, 5, 5, '#00ff00'); } }));
  renderFrame(s, 'idle', 0, defaultParams(s));
  renderFrame(s, 'idle', 0, defaultParams(s), { style: 'pixel' });
  renderFrame(s, 'idle', 0, defaultParams(s), { style: 'silhouette' });
  assert.deepEqual(seen, ['pixel', 'pixel', 'silhouette']);
  for (const sprite of [blob, sparkle]) {
    const p = defaultParams(sprite);
    for (const [clip, c] of Object.entries(sprite.clips)) for (let f = 0; f < c.frames; f++) {
      const now = renderFrame(sprite, clip, f, p), before = legacyRenderFrame(sprite, clip, f, p);
      assert.ok(now instanceof Surface);
      assert.ok(same(now.data, before.data), `${sprite.id} ${clip} ${f}`);
    }
  }
});

test('asking for a style the sprite does not have is an error that names what it has, never a fallback', () => {
  const p = defaultParams(sparkle);
  assert.throws(() => renderFrame(sparkle, 'twinkle', 0, p, { style: 'outline-svg' }), /style-sparkle.*"outline-svg".*pixel, silhouette/s);
  assert.throws(() => renderFrame(sparkle, 'twinkle', 0, p, { style: 'no-such-style' }), /"no-such-style"/);
  assert.throws(() => renderSheet(sparkle, p, { style: 'outline-svg' }), /"outline-svg"/);
  assert.throws(() => renderThemedFrame(sparkle, 'twinkle', 0, p, null, { style: 'outline-svg' }), /"outline-svg"/);
  assert.throws(() => renderPixels(sparkle, 'twinkle', 0, p, { style: 'outline-svg' }), /"outline-svg"/);
  assert.throws(() => styleFor(sparkle, 'outline-svg'), /"outline-svg"/);
  assert.equal(styleFor(sparkle).id, 'pixel', 'no style asked for: the sprite\'s first');
  assert.equal(styleFor(sparkle, 'silhouette').id, 'silhouette');
});

test('a finish-only style: the same surface, drawn differently', () => {
  const p = defaultParams(blob);
  const pixel = renderFrame(blob, 'idle', 0, p), flat = renderFrame(blob, 'idle', 0, p, { style: 'silhouette' });
  assert.ok(flat instanceof Surface);
  assert.ok(!same(pixel.data, flat.data), 'the two styles differ');
  // the same shape, every drawn pixel one colour
  assert.ok(pixel.data.every((v, i) => (v !== 0) === (flat.data[i] !== 0)));
  assert.deepEqual([...new Set(flat.data)].filter(Boolean), [col(INK)]);
  assert.ok(new Set(pixel.data).size > 4);
  assert.equal(renderPixels(blob, 'idle', 0, p, { style: 'silhouette' }).data.length, 32 * 32);
});

test('another surface: the shape style records calls, and still gives a pixel picture to look at', () => {
  const p = defaultParams(blob);
  const rec = renderFrame(blob, 'hop', 2, p, { style: 'outline-svg' });
  assert.ok(rec instanceof ShapeRecorder);
  const kinds = new Set(rec.ops.map((o) => o.kind));
  for (const k of ['ellipse', 'capsule', 'poly', 'arc', 'rect', 'outline']) assert.ok(kinds.has(k), k);
  assert.throws(() => rec.data, /no pixels/, 'reading pixels back cannot work here');
  const px = renderPixels(blob, 'hop', 2, p, { style: 'outline-svg' });
  assert.ok(px instanceof Surface);
  assert.ok(px.bounds(), 'something is drawn');
  assert.ok(pixelsOf(rec, 'outline-svg') instanceof Surface);
  const pixel = renderFrame(blob, 'hop', 2, p);
  assert.equal(pixelsOf(pixel, 'pixel'), pixel, 'a pixel surface is its own picture');
  assert.ok(!same(px.data, pixel.data));
});

test('a whole-bundle look reaches every style', () => {
  const p = defaultParams(blob), look = { colour: { palette: 'Frost' } };
  const plain = renderFrame(blob, 'idle', 0, p), themed = renderThemedFrame(blob, 'idle', 0, p, look);
  assert.ok(!same(plain.data, themed.data));
  assert.ok(same(renderThemedFrame(blob, 'idle', 0, p, null).data, plain.data), 'the neutral look changes nothing');
  const rec = renderThemedFrame(blob, 'idle', 0, p, look, { style: 'outline-svg' });
  const before = renderFrame(blob, 'idle', 0, p, { style: 'outline-svg' });
  assert.equal(rec.ops.length, before.ops.length);
  assert.ok(rec.ops.some((o, i) => o.c !== before.ops[i].c), 'the recorded colours were recoloured');
});
