// Safety of build item E1's effect ports and its rift (docs/data-sprites.md 3.4 rule 2; Contract 15 rule 6; review E1
// round 2, issues 1 and 2). An effect port runs a whole old effect on a paint-ref grid (engine/gen/fx-e1-effects.js
// effectPort), so its cost must charge what that drawing takes, or the frame budget stops bounding the time a frame can
// take: as tests/unit/gen-e2-safety.test.mjs holds E2's ports, each E1 port's heaviest call (found by trying every
// picture, word and flag and each slider's and count's ends and middle at every frame, then the 24 slowest again as a
// median of nine warm runs in processor time: scratchpad E1r2/calib.mjs, E2's calib.mjs) must run within its cost at
// MS_PER_COST plus SPARE_MS, the median of nine warm runs in processor time. The ports declare `units` of 1.5 times the
// measured time at 0.01 ms a unit; the line here is E2's and M9's, 0.05 ms a unit and 2 ms.
//
// rift@1 (engine/gen/fx-e1.js) is held to the same line at its biggest: review E1 round 1 found it priced below its
// work, and its price now charges the tear mask it works out once a pixel (16 tests a pixel of its box). gen-b12-safety's
// wider allowance (30 ms + 0.1 ms a unit) cannot see a price ten times too low; this line can (a rift priced at its tiles
// alone, cost 240 at its biggest, is allowed 14 ms and takes some 19), and the last test pins the price itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCall, runGenerator, generator } from '../../engine/gen/index.js';
import * as E1 from '../../engine/gen/fx-e1-effects.js';
import { workCost } from '../../engine/gen/pixels.js';

const MS_PER_COST = 0.05;
const SPARE_MS = 2;
const allowedMs = (cost) => SPARE_MS + cost * MS_PER_COST;
const CTX = (frame, frames = 12) => ({ size: [300, 300], frame, frames, t: frame / frames, loop: true });
// [call, frame]: the heaviest call of each effect port the calibration found (paints filled in below), and its time then
// (processor time, median of nine warm runs, load average 8 to 22)
const HEAVIEST = [
  [{ gen: 'effect.shockwave', v: 1, picture: 'burst', size: 1, pieces: 8, spread: 1, height: 0, style: 'dust' }, 0],   // 1.99 ms
  [{ gen: 'effect.spawn-warp', v: 1, picture: 'warn', size: 1, style: 'hex', rings: 'three', pieces: 8, flicker: 1 }, 7],   // 1.00 ms
  [{ gen: 'effect.fx-fire-spell', v: 1, picture: 'burst', size: 1, height: 1, pieces: 7, style: 'ring', sparks: true, flicker: 0 }, 2],   // 8.05 ms
  [{ gen: 'effect.teleport-beam', v: 1, picture: 'burst', size: 0.5, width: 0.5, style: 'rings', pieces: 8, flicker: 1 }, 4],   // 2.01 ms
  [{ gen: 'effect.fx-thunder-spell', v: 1, picture: 'burst', width: 1, pieces: 5, wobble: 1, style: 'chain', sparks: true }, 3],   // 7.21 ms
  [{ gen: 'effect.charge-up', v: 1, picture: 'burst', size: 1, pieces: 4, style: 'rings', twist: 1, flicker: 1 }, 4],   // 0.86 ms
  [{ gen: 'effect.hit-flash', v: 1, picture: 'burst', size: 0.5, pieces: 8, style: 'cross', twist: 0 }, 9],   // 0.50 ms
  [{ gen: 'effect.guard-flash', v: 1, picture: 'burst', size: 0, pieces: 6, spread: 0.5, style: 'dome' }, 2],   // 0.73 ms
  [{ gen: 'effect.fx-ice-spell', v: 1, picture: 'burst', size: 1, height: 1, pieces: 7, style: 'spikes', mist: true }, 3],   // 7.31 ms
  [{ gen: 'effect.explosion-large', v: 1, picture: 'burst', size: 1, pieces: 8, spread: 0.5, lobes: 9, style: 'fire', soot: true }, 7],   // 7.71 ms
  [{ gen: 'effect.muzzle-flash', v: 1, picture: 'burst', size: 0, length: 1, style: 'ring', pieces: 'five' }, 0],   // 0.88 ms
  // the review's own heaviest finds (scratchpad review-E1/sf/timing-e1.mjs), kept so the units cover them too
  [{ gen: 'effect.fx-ice-spell', v: 1, picture: 'burst', size: 1, height: 1, pieces: 7, style: 'spikes', mist: false }, 3],
  [{ gen: 'effect.fx-thunder-spell', v: 1, picture: 'burst', width: 1, pieces: 3, wobble: 1, style: 'chain', sparks: true }, 3],
];
const P = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
// rift@1 at its biggest on a 640 x 360 frame, at four points of a clip: [call, t, fits]. A hairline (open 0, no zigzag,
// no rim) at its biggest fits a frame's stamp pixels; the wide-open ones do not, and runGenerator refuses them, but only
// after drawing them (the cap is checked on what comes back), so their time counts against the cost the budget let
// through all the same.
const RIFTS = [];
for (const t of [0, 0.33, 0.66, 1]) {
  RIFTS.push([{ gen: 'rift', v: 1, at: [320, 180], length: 160, across: 64, scale: 4, teeth: 12, jag: 0, open: 0, rim: false, paints: P }, t, true]);
  RIFTS.push([{ gen: 'rift', v: 1, at: [320, 180], length: 160, across: 64, scale: 4, teeth: 12, jag: 0.5, open: 0, rim: true, paints: P }, t, false]);
  RIFTS.push([{ gen: 'rift', v: 1, at: [320, 180], length: 160, across: 64, scale: 2, teeth: 12, jag: 0.5, open: 1, rim: true, paints: P }, t, false]);
}

const cpuMs = (fn) => { const t0 = process.cpuUsage(); fn(); const d = process.cpuUsage(t0); return (d.user + d.system) / 1000; };
const median = (fn, n = 9) => { fn(); fn(); const ms = []; for (let i = 0; i < n; i++) ms.push(cpuMs(fn)); return ms.sort((a, b) => a - b)[n >> 1]; };

test('every effect port of fx-e1-effects.js has a heaviest call here (effectPort refuses one without measured units)', () => {
  const ports = Object.values(E1).filter((e) => e && typeof e.id === 'string' && e.id.startsWith('effect.')).map((e) => e.id).sort();
  assert.deepEqual(ports, [...new Set(HEAVIEST.map(([c]) => c.gen))].sort());
});

test('every E1 effect port at its heaviest runs within its cost', () => {
  const slow = [];
  for (const [base, frame] of HEAVIEST) {
    const entry = generator(base.gen, base.v);
    assert.ok(entry, `${base.gen}@${base.v} is registered`);
    const paints = Object.fromEntries(Object.entries(entry.args).filter(([, t]) => t.type === 'paint' && t.default === undefined).map(([k]) => [k, k]));
    const call = { at: [150, 150], ...paints, ...base };
    const c = checkCall(call);
    assert.ok(c.ok, `${base.gen}@${base.v}: ${c.errors.join('; ')}`);
    const r = runGenerator(call, CTX(frame));
    assert.ok(r.ok, `${base.gen}@${base.v}: ${r.errors.join('; ')}`);
    assert.ok(r.primitives.length > 0, `${base.gen}@${base.v} draws something`);
    const ms = median(() => runGenerator(call, CTX(frame)));
    if (ms > allowedMs(c.cost)) slow.push(`${base.gen}@${base.v} ${JSON.stringify(base)} frame ${frame}: ${ms.toFixed(2)} ms of processor time for cost ${c.cost} (allowed ${allowedMs(c.cost).toFixed(2)})`);
  }
  assert.deepEqual(slow, []);
});

test('rift@1 at its biggest runs within its cost on E2\'s line (its price charges the tear mask)', () => {
  const slow = [];
  for (const [call, t, fits] of RIFTS) {
    const c = checkCall(call);
    assert.ok(c.ok, `rift@1: ${c.errors.join('; ')}`);
    const ctx = { size: [640, 360], t, frame: Math.round(t * 7), frames: 8, loop: false };
    const r = runGenerator(call, ctx);
    if (fits) {
      assert.ok(r.ok, `rift@1: ${r.errors.join('; ')}`);
      assert.ok(r.primitives.length > 0, 'rift@1 draws something');
    } else assert.match(r.errors.join('; '), /stamp pixels/, 'refused only for its stamp pixels, after drawing');
    const ms = median(() => runGenerator(call, ctx));
    if (ms > allowedMs(c.cost)) slow.push(`rift@1 ${call.length} x ${call.across} at scale ${call.scale}, t ${t}: ${ms.toFixed(2)} ms of processor time for cost ${c.cost} (allowed ${allowedMs(c.cost).toFixed(2)})`);
  }
  assert.deepEqual(slow, []);
});

test('rift@1 is priced at 16 shape tests a pixel of its box (the mask\'s four tests, a test with a power priced as four)', () => {
  // the timing above holds the price at the biggest rift with some margin (a rift priced at its tiles alone, 240 at
  // its biggest, is allowed 14 ms and takes some 19 ms there): this pins the price itself at every size, so a cut to
  // it fails here on any machine, however fast (review E1 round 2, issue 2)
  for (const [length, across, scale] of [[16, 8, 1], [40, 16, 1], [80, 40, 1], [160, 64, 1], [100, 50, 2], [160, 64, 2], [160, 64, 4]]) {
    const call = { gen: 'rift', v: 1, at: [320, 180], length, across, scale, paints: P };
    const side = Math.ceil(2 * (Math.max(length, across) * scale / 2 + 3) + 3);
    const want = workCost(16 * Math.min(640 * 360, side * side));
    const c = checkCall(call);
    assert.ok(c.ok, c.errors.join('; '));
    assert.ok(c.cost >= want, `rift@1 ${length} x ${across} at scale ${scale}: cost ${c.cost}, below the ${want} its tear mask's tests come to`);
  }
});
