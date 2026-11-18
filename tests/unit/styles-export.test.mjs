// Export per style (Contract 12): the chosen style's exporter decides which files a sprite becomes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { exportSheet } from '../../engine/styles.js';
import { defaultParams, renderSheet } from '../../engine/sprite.js';
import { applyColour } from '../../engine/theme.js';
import { col, INK } from '../../engine/color.js';
import { encodePNG } from '../../tools/png.mjs';
import { readPNG } from '../fixtures/catalog/png-read.mjs';
import blob from '../fixtures/styles/blob.js';
import sparkle from '../fixtures/styles/sparkle.js';

const encodePng = (w, h, rgba) => encodePNG(w, h, rgba);
const frameCount = (sprite) => Object.values(sprite.clips).reduce((n, c) => n + c.frames, 0);
const text = (bytes) => new TextDecoder().decode(bytes);

test('the first style is used when none is asked for; pixel: one PNG sheet and the sheet JSON', async () => {
  const p = defaultParams(blob);
  const out = await exportSheet(blob, p, { encodePng });
  assert.deepEqual(out.files.map((f) => f.name), ['style-blob.png']);
  assert.equal(out.files[0].type, 'image/png');
  assert.ok(out.files[0].bytes.length > 100);
  assert.deepEqual(out.data, renderSheet(blob, p).meta);
  assert.ok(!('artStyle' in out.data));
  assert.equal(out.data.image, 'style-blob.png');
});

test('a finish-only style exports the same kind of sheet, marked with its style', async () => {
  const p = defaultParams(blob);
  const out = await exportSheet(blob, p, { style: 'silhouette', scale: 2, encodePng });
  assert.deepEqual(out.files.map((f) => [f.name, f.type]), [['style-blob.png', 'image/png']]);
  assert.equal(out.data.artStyle, 'silhouette');
  assert.equal(out.data.image, 'style-blob.png');
  assert.equal(out.data.frames.length, frameCount(blob));
  assert.equal(out.data.frameWidth, 64);
  // every drawn pixel of the sheet is the one silhouette colour
  const img = readPNG(Buffer.from(out.files[0].bytes));
  const colours = new Set();
  for (let i = 0; i < img.rgba.length; i += 4) if (img.rgba[i + 3]) colours.add(`${img.rgba[i]},${img.rgba[i + 1]},${img.rgba[i + 2]}`);
  const c = col(INK);
  assert.deepEqual([...colours], [`${c & 255},${(c >>> 8) & 255},${(c >>> 16) & 255}`]);
  // and it is not the pixel sheet
  const pixel = await exportSheet(blob, p, { scale: 2, encodePng });
  assert.ok(!Buffer.from(pixel.files[0].bytes).equals(Buffer.from(out.files[0].bytes)));
});

test('another export pipeline: the shape style makes one SVG file per frame, and its JSON says so', async () => {
  const p = defaultParams(blob);
  const out = await exportSheet(blob, p, { style: 'outline-svg', scale: 4 });      // no PNG writer needed
  assert.equal(out.files.length, frameCount(blob));
  assert.ok(out.files.every((f) => f.type === 'image/svg+xml' && /^frames\/(idle|hop)_\d+\.svg$/.test(f.name)));
  assert.ok(!out.files.some((f) => f.name.endsWith('.png')));
  const svg = text(out.files[0].bytes);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 32 32" width="128" height="128">/);
  for (const tag of ['<ellipse ', '<polygon ', '<rect ', '<path ', '<circle ']) assert.ok(svg.includes(tag), tag);
  assert.ok(svg.includes('stroke-width="2"'), 'the outline is the shapes again, one pixel bigger, underneath');
  assert.match(svg, /<\/svg>\n$/);
  assert.equal(out.data.artStyle, 'outline-svg');
  assert.ok(!('image' in out.data), 'there is no sheet picture');
  assert.deepEqual(out.data.frames.map((f) => f.file), out.files.map((f) => f.name));
  assert.deepEqual(Object.keys(out.data.animations), ['idle', 'hop'], 'the clips are still described');
  assert.equal(out.data.animations.hop.frames, 6);
  // different frames are different pictures
  assert.notEqual(text(out.files[6].bytes), text(out.files[7].bytes));
});

test('the look reaches each exporter through options.recolour', async () => {
  const p = defaultParams(blob);
  const recolour = (pixels) => applyColour(pixels, { palette: 'Frost' });
  const plain = await exportSheet(blob, p, { style: 'outline-svg' }), themed = await exportSheet(blob, p, { style: 'outline-svg', recolour });
  assert.notEqual(text(plain.files[0].bytes), text(themed.files[0].bytes));
  const a = await exportSheet(blob, p, { encodePng }), b = await exportSheet(blob, p, { encodePng, recolour });
  assert.ok(!Buffer.from(a.files[0].bytes).equals(Buffer.from(b.files[0].bytes)));
});

test('a style the sprite does not list is refused with a clear message; so is a PNG sheet with no PNG writer', async () => {
  const p = defaultParams(sparkle);
  await assert.rejects(() => exportSheet(sparkle, p, { style: 'outline-svg', encodePng }), /style-sparkle.*"outline-svg".*pixel, silhouette/s);
  await assert.rejects(() => exportSheet(sparkle, p, { style: 'nope', encodePng }), /"nope"/);
  await assert.rejects(() => exportSheet(sparkle, p, {}), /encodePng/);
  const ok = await exportSheet(sparkle, p, { style: 'silhouette', encodePng });
  assert.equal(ok.data.artStyle, 'silhouette');
});
