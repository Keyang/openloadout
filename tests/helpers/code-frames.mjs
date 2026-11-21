// The recorded frames of the code sprites the nine top-down people (migration batch M7) replaced, for tests that hold a
// redraw to the old pixels now that the code sprites and their rigs are gone (R2). tests/fixtures/code-frames/<id>.json
// holds each code sprite's frames per look and clip (how it was written: tools of R2's report; format in its `about`).
//
//   codeFrames(id)               the record of one sprite: { id, size, clips: { clip: frames }, looks: [look], has(look, clip),
//                                frame(look, clip, f), box(look, clip) }
//   frame(look, clip, f)         one frame as a Uint32Array of w * h pixels (0 where the code drew nothing, else its colour as ABGR)
//   box(look, clip)              [x0, y0, x1, y1] of every pixel the clip draws over all its frames, or null when it draws none
//   settingsOfLook(sprite, look) the settings a look names, on the sprite's defaults ('' defaults, 'k=v', 'k=v & k2=v2')
//   framesDiff(rec, sprite, look, clip)  pixels of the clip that differ between the code sprite's frames and sprite's at that look
// Node only (zlib, fs).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ROOT } from '../../tools/lib/assets.mjs';
import { cleanParams, defaultParams, renderPixels } from '../../engine/sprite.js';

const cache = new Map();

/** The record of one code sprite's frames (see the head of this file); throws naming the id when there is none. */
export function codeFrames(id) {
  if (cache.has(id)) return cache.get(id);
  const file = path.join(ROOT, 'tests', 'fixtures', 'code-frames', `${id}.json`);
  const rec = JSON.parse(fs.readFileSync(file, 'utf8')), [w, h] = rec.size, decoded = new Map();
  const raw = (look, clip) => {
    const key = `${look}\u0000${clip}`;
    if (!decoded.has(key)) {
      const b = zlib.inflateSync(Buffer.from(rec.looks[look][clip], 'base64'));
      decoded.set(key, new Uint16Array(b.buffer, b.byteOffset, b.length / 2));
    }
    return decoded.get(key);
  };
  const out = {
    id, size: rec.size, clips: rec.clips, looks: Object.keys(rec.looks), extra: rec.extra,
    has: (look, clip) => Boolean(rec.looks[look]?.[clip]),
    frame(look, clip, f) {
      const a = raw(look, clip), base = look === '' ? null : raw('', clip), n = w * h, g = new Uint32Array(n);
      for (let i = 0; i < n; i++) {
        const v = a[f * n + i];
        g[i] = rec.palette[look === '' ? v : v ? v - 1 : base[f * n + i]] >>> 0;
      }
      return g;
    },
    box(look, clip) {
      let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
      for (let f = 0; f < rec.clips[clip]; f++) {
        const g = out.frame(look, clip, f);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          if (!g[y * w + x]) continue;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      return x1 < 0 ? null : [x0, y0, x1, y1];
    },
  };
  cache.set(id, out);
  return out;
}

/** The settings a look names (a look is '' for the defaults, 'key=value', or several joined by ' & '), on the sprite's defaults, cleaned. */
export function settingsOfLook(sprite, look) {
  const set = {};
  if (look) for (const part of look.split(' & ')) {
    const i = part.indexOf('='), k = part.slice(0, i), v = part.slice(i + 1), d = sprite.params[k];
    set[k] = d.kind === 'range' ? Number(v) : d.kind === 'toggle' ? v === 'true' : v;
  }
  return cleanParams(sprite, { ...defaultParams(sprite), ...set });
}

/** Pixels of the clip that differ between the recorded code sprite and sprite at a look, summed over the clip's frames (a pixel differs when one draws it and the other does not, or both draw it in different colours). */
export function framesDiff(rec, sprite, look, clip, settings = settingsOfLook(sprite, look)) {
  let n = 0;
  for (let f = 0; f < rec.clips[clip]; f++) {
    const a = rec.frame(look, clip, f), b = renderPixels(sprite, clip, f, settings).data;
    for (let i = 0; i < a.length; i++) if (a[i] !== ((b[i] >>> 24) ? b[i] >>> 0 : 0)) n++;
  }
  return n;
}
