// The recorded side of a test that held a generator, a rule or a redraw to the old drawing code (R3). Such a test drew
// the same thing twice, once with the framework's generator and once with the helper module in engine/ that the code
// sprite had used, and compared the two. That module is gone; what it drew is recorded in
// tests/fixtures/old-code/<name>.json, one entry for each call the test made of it, in the order the test makes them.
// The test says what each call was with the same words it always did, minus the code:
//
//   const OLD = oldReplay('gen-b12c-fx');
//   OLD.surface(64, 64)         a Surface (w x h) with what the old code drew on it
//   OLD.value()                 what the old code returned (plain data: numbers, strings, lists, objects)
//
// An entry holds the call's pixels as palette indices (little-endian 16-bit, deflated, base64) or its value as JSON, and
// the head of the file says which tests made it and from which commit. A test that makes more calls than were recorded, or
// in another order, FAILS (it never invents a picture): a test file runs whole, in order, so `node --test <file>` reads
// the record as it was made; `--test-name-pattern` would not. The record is made by the same test file with the old
// modules still there and the helper recording: see tests/fixtures/old-code/README.md. Node only.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ROOT } from '../../tools/lib/assets.mjs';
import { Surface } from '../../engine/surface.js';

/** The reader of tests/fixtures/old-code/<name>.json: { surface(w, h), value(), left() (calls not yet read) }. */
export function oldReplay(name) {
  const file = path.join(ROOT, 'tests', 'fixtures', 'old-code', `${name}.json`);
  const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
  let at = 0;
  const next = (kind, what) => {
    const e = rec.calls[at];
    if (!e) throw new Error(`old code ${name}: call ${at + 1} (${what}) was not recorded: the record holds ${rec.calls.length} (tests/fixtures/old-code/${name}.json)`);
    if (e.k !== kind) throw new Error(`old code ${name}: call ${at + 1} is a ${what}, the record has a ${e.k === 's' ? 'surface' : 'value'} there: the test's calls changed order`);
    at++;
    return e;
  };
  return {
    surface(w, h) {
      const e = next('s', 'surface');
      if (e.w !== w || e.h !== h) throw new Error(`old code ${name}: call ${at} is ${w}x${h}, the record ${e.w}x${e.h}`);
      const g = new Surface(w, h), b = zlib.inflateSync(Buffer.from(e.d, 'base64')), idx = new Uint16Array(b.buffer, b.byteOffset, b.length / 2);
      for (let i = 0; i < idx.length; i++) g.data[i] = idx[i] ? rec.palette[idx[i]] >>> 0 : 0;
      return g;
    },
    value() { return JSON.parse(next('v', 'value').j); },
    left: () => rec.calls.length - at,
  };
}
