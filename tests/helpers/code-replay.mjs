// The recorded drawing of code sprites whose code is gone (R2b, R3), for tests that hold a redraw to its old code.
// tests/fixtures/code-replay/<id>.json holds what a frozen code sprite (tests/fixtures/code-sprites/<id>.js) drew and
// answered in every call the tests that read it made: each frame it drew for a (clip, frame, settings) as palette indices
// (little-endian 16-bit, deflated, base64; palette[0] is "no pixel"), each answer of its sockets(), slice(), textArea()
// and of a clip's fps(), each keyed by a hash of the call's arguments (a function the code sprite had and no test called is
// still there, and fails when called). replaySprite(id) builds a sprite from it: the same
// name, size, controls, clips, sounds and versions, whose render() paints the recorded frame, so a test that read
// `codeSprite(id)` reads the same thing through `renderFrame`, `renderPixels`, `frameSockets`, `clipStretch` and `clipFps`
// when the call is one the record holds. A call it does not hold FAILS, naming the sprite, the clip, the frame and the
// settings: a replay never invents a pixel. Recorded by tools of the removal item's report from a `git archive` tree that
// still had the code; the record says which commit and which tests (`about`). Read through tests/helpers/library.mjs
// codeSprite(id) once the frozen copy is gone.
//
//   hasReplay(id)      is there a record of this code sprite
//   replaySprite(id)   the sprite built from it (what defineSprite returns), once per process
//   callKey(...args)   the key a call's arguments are filed under (sorted-key JSON, SHA-1, 16 hex digits); the recorder's too
// Node only (zlib, fs, crypto).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { ROOT } from '../../tools/lib/assets.mjs';
import { defineSprite } from '../../engine/sprite.js';

const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k2) => [k2, x[k2]])) : x));

/** The key a call's arguments are filed under in a record: SHA-1 of their sorted-key JSON, 16 hex digits. */
export const callKey = (...args) => crypto.createHash('sha1').update(canon(args)).digest('hex').slice(0, 16);

const fileOf = (id) => path.join(ROOT, 'tests', 'fixtures', 'code-replay', `${id}.json`);

/** Is there a record of this code sprite's drawing (tests/fixtures/code-replay/<id>.json). */
export const hasReplay = (id) => fs.existsSync(fileOf(id));

const cache = new Map();

/** A sprite that draws what the recorded code sprite drew (see the head of this file); throws naming the id when there is no record. */
export function replaySprite(id) {
  if (cache.has(id)) return cache.get(id);
  const rec = JSON.parse(fs.readFileSync(fileOf(id), 'utf8'));
  const [w, h] = rec.size, decoded = new Map();
  const look = (what, clip, frame, p) => `code replay ${id}: no recorded ${what} for clip ${clip}, frame ${frame}, settings ${canon(p)} (tests/fixtures/code-replay/${id}.json holds only the calls the tests made of the old code)`;
  const frameOf = (key) => {
    if (!decoded.has(key)) {
      const b = zlib.inflateSync(Buffer.from(rec.frames[key], 'base64'));
      decoded.set(key, new Uint16Array(b.buffer, b.byteOffset, b.length / 2));
    }
    return decoded.get(key);
  };
  const answer = (table, what, args, p) => {
    const k = callKey(...args);
    if (!Object.hasOwn(table, k)) throw new Error(look(what, args[0], args[1], p));
    return table[k] === null ? undefined : JSON.parse(table[k]);
  };
  const def = JSON.parse(JSON.stringify(rec.def));
  for (const [name, c] of Object.entries(def.clips)) {
    const fps = rec.calls.fps?.[name];
    c.fps = typeof c.fps === 'number' ? c.fps : (p) => {
      const k = callKey(p);
      if (!Object.hasOwn(fps, k)) throw new Error(look('fps', name, '-', p));
      return fps[k];
    };
  }
  def.render = (g, ctx) => {
    const key = callKey(ctx.clip, ctx.frame, ctx.p);
    if (!Object.hasOwn(rec.frames, key)) throw new Error(look('frame', ctx.clip, ctx.frame, ctx.p));
    const a = frameOf(key);
    if (g.w !== w || g.h !== h) throw new Error(`code replay ${id}: the surface is ${g.w}x${g.h}, the record ${w}x${h}`);
    for (let i = 0; i < a.length; i++) g.data[i] = a[i] ? rec.palette[a[i]] >>> 0 : 0;
  };
  // the code sprite's own functions: answered from the record where the tests called them, else failing, never absent
  for (const [what, key] of [['sockets', (clip, t, p) => [clip, t, p]], ['slice', (clip, p) => [clip, p]], ['textArea', (clip, p) => [clip, p]]]) {
    if (rec.calls[what] || (rec.fns ?? []).includes(what)) def[what] = (...args) => answer(rec.calls[what] ?? {}, what, key(...args), args.at(-1));
  }
  const sprite = defineSprite(def);
  cache.set(id, sprite);
  return sprite;
}
