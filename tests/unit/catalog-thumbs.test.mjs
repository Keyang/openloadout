// tools/lib/thumbs.mjs: sprite thumbnail (one frame, 2x), strip (preview clip, 1x), sound waveform.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAssets } from '../../tools/lib/assets.mjs';
import { spriteThumb, spriteStrip, soundWave, WAVE_W, WAVE_H } from '../../tools/lib/thumbs.mjs';
import { readPNG, opaqueCount } from '../fixtures/catalog/png-read.mjs';

const { sprites, sounds } = await loadAssets();

test('sprite thumbnail: a valid PNG of one frame at 2x, with something drawn', () => {
  for (const { id, def } of sprites) {
    const t = spriteThumb(def);
    const img = readPNG(t.png);
    assert.equal(img.w, def.size[0] * 2, id);
    assert.equal(img.h, def.size[1] * 2, id);
    assert.ok(t.frame >= 0 && t.frame < def.clips[def.preview].frames, id);
    assert.ok(opaqueCount(img) > 40, `${id}: thumbnail is nearly empty`);
    // transparent background: the corners are see-through (backgrounds, tiles and panels fill their frame)
    const fillsFrame = ['background', 'tileset', 'ui'].includes(def.meta?.type);
    if (!fillsFrame) assert.equal(img.rgba[3], 0, `${id}: top-left corner should be transparent`);
    // 2x: every pixel is doubled
    for (let y = 0; y < img.h; y += 2) for (let x = 0; x < img.w; x += 2) {
      const a = (y * img.w + x) * 4, b = a + 4, c = a + img.w * 4;
      assert.equal(img.rgba.readUInt32BE(a), img.rgba.readUInt32BE(b));
      assert.equal(img.rgba.readUInt32BE(a), img.rgba.readUInt32BE(c));
    }
  }
});

test('sprite thumbnail is the fullest frame of the preview clip and is deterministic', () => {
  const coin = sprites.find((s) => s.id === 'coin').def;
  const a = spriteThumb(coin), b = spriteThumb(coin);
  assert.ok(a.png.equals(b.png));
  assert.equal(a.frame, b.frame);
});

test('sprite strip: every frame of the preview clip in one row at 1x', () => {
  for (const { id, def } of sprites) {
    const s = spriteStrip(def);
    const img = readPNG(s.png);
    const frames = def.clips[def.preview].frames;
    assert.equal(s.frames, frames, id);
    assert.ok(Number.isInteger(s.fps) && s.fps >= 1, id);
    assert.equal(img.w, def.size[0] * frames, id);
    assert.equal(img.h, def.size[1], id);
    // each frame cell has something in it
    const [fw, fh] = def.size;
    for (let f = 0; f < frames; f++) {
      let n = 0;
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) if (img.rgba[(y * img.w + f * fw + x) * 4 + 3]) n++;
      assert.ok(n > 0, `${id}: strip frame ${f} is empty`);   // an effect may end on a few pixels (the checker enforces 'never empty')
    }
  }
});

test('sound waveform: a small PNG of ink-coloured bars on transparent', () => {
  for (const { id, patch, isMusic } of sounds) {
    if (isMusic) { assert.equal(soundWave(patch), null, `${id}: music has no waveform`); continue; }
    const w = soundWave(patch);
    const img = readPNG(w.png);
    assert.equal(img.w, WAVE_W, id);
    assert.equal(img.h, WAVE_H, id);
    let ink = 0, other = 0;
    for (let i = 0; i < img.rgba.length; i += 4) {
      if (!img.rgba[i + 3]) continue;
      if (img.rgba[i] === 0x23 && img.rgba[i + 1] === 0x1b && img.rgba[i + 2] === 0x33 && img.rgba[i + 3] === 255) ink++; else other++;
    }
    assert.equal(other, 0, `${id}: only ink pixels`);
    assert.ok(ink >= WAVE_W * 2, `${id}: every column has a bar`);
    // mirrored around the middle row
    for (let x = 0; x < WAVE_W; x++) for (let y = 0; y < WAVE_H / 2; y++) {
      assert.equal(img.rgba[(y * WAVE_W + x) * 4 + 3], img.rgba[((WAVE_H - 1 - y) * WAVE_W + x) * 4 + 3], `${id}: column ${x} not mirrored`);
    }
  }
});

test('waveform is deterministic', () => {
  const p = sounds.find((s) => s.id === 'explosion').patch;
  assert.ok(soundWave(p).png.equals(soundWave(p).png));
});
