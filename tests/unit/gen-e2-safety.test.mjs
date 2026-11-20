// Safety of migration batch E2's effect ports (docs/data-sprites.md 3.4 rule 2; review E2 round 1, issue 3): an effect
// port runs a whole old effect on a paint-ref grid (engine/gen/fx-e2.js effectPort), so its cost must charge what that
// drawing takes, or the frame budget stops bounding the time a frame can take. As tests/unit/gen-m9-safety.test.mjs does
// for M9's interface ports: each port's heaviest call (found by trying every picture, word and flag and each slider's
// ends and middle at every frame, then the 24 slowest again as a median of nine warm runs: scratchpad e2r2/calib.mjs)
// must run within its cost at MS_PER_COST plus SPARE_MS, the median of nine warm runs in processor time. The ports
// declare `units` of 1.5 times the measured time at 0.01 ms a unit; the line here is 0.05 a unit and 2 ms, M9's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCall, runGenerator, generator } from '../../engine/gen/index.js';
import * as E2 from '../../engine/gen/fx-e2.js';

const MS_PER_COST = 0.05;
const SPARE_MS = 2;
const allowedMs = (cost) => SPARE_MS + cost * MS_PER_COST;
const CTX = (frame, frames = 12) => ({ size: [300, 300], frame, frames, t: frame / frames, loop: true });
// [call, frame]: the heaviest call of each effect port the calibration found (paints filled in below), and its time then
const HEAVIEST = [
  [{gen: 'effect.ash-fall', v: 1, picture: 'loop', pieces: 12, size: 1, style: 'ash', sway: 0}, 9],   // 0.29 ms
  [{gen: 'effect.bubble-stream', v: 1, picture: 'loop', size: 0, pieces: 12, spread: 1, rise: 1, style: 'mixed', wobble: 1}, 5],   // 0.18 ms
  [{gen: 'effect.cave-drip', v: 1, picture: 'loop', size: 1, fall: 0, pieces: 3, style: 'puddle'}, 6],   // 1.11 ms
  [{gen: 'effect.confetti', v: 1, picture: 'burst', size: 1, pieces: 18, spread: 1, style: 'streamers'}, 1],   // 0.64 ms
  [{gen: 'effect.debris-burst', v: 1, picture: 'goo', size: 0.5, pieces: 9, spread: 1, style: 'plates', spin: true}, 10],   // 11.03 ms
  [{gen: 'effect.dizzy-ring', v: 1, picture: 'loop', size: 0, pieces: 5, style: 'stars', depth: 0}, 6],   // 0.18 ms
  [{gen: 'effect.dodge-trail', v: 1, picture: 'burst', size: 0.5, length: 1, pieces: 4, style: 'streaks'}, 1],   // 1.08 ms
  [{gen: 'effect.ember-drift', v: 1, picture: 'loop', size: 1, pieces: 14, spread: 0.5, rise: 0.5, style: 'sparks'}, 3],   // 0.25 ms
  [{gen: 'effect.enemy-poof', v: 1, picture: 'burst', size: 0.5, pieces: 8, spread: 0, style: 'cloud'}, 2],   // 0.32 ms
  [{gen: 'effect.falling-leaves', v: 1, picture: 'loop', pieces: 9, size: 1, style: 'flutter', sway: 0}, 6],   // 0.28 ms
  [{gen: 'effect.fireflies', v: 1, picture: 'loop', size: 0, pieces: 9, spread: 1, style: 'wisps', flicker: 0}, 10],   // 0.12 ms
  [{gen: 'effect.firework', v: 1, picture: 'burst', size: 1, pieces: 20, style: 'ring', trail: true}, 10],   // 0.16 ms
  [{gen: 'effect.flames', v: 1, picture: 'loop', size: 1, width: 0, pieces: 4, style: 'wild', sparks: false, flicker: 0.5}, 4],   // 1.14 ms
  [{gen: 'effect.leaf-burst', v: 1, picture: 'burst', size: 1, pieces: 12, spread: 1, style: 'burst'}, 3],   // 0.52 ms
  [{gen: 'effect.petal-fall', v: 1, picture: 'loop', pieces: 12, size: 0.5, style: 'blossom', sway: 0}, 3],   // 0.28 ms
  [{gen: 'effect.pickup-sparkle', v: 1, picture: 'burst', size: 0.5, pieces: 4, spread: 1, style: 'plus', rise: 1}, 0],   // 0.16 ms
  [{gen: 'effect.poison-haze', v: 1, picture: 'burst', size: 1, pieces: 8, spread: 0, rise: 1, style: 'cloud'}, 3],   // 3.52 ms
  [{gen: 'effect.rain-ripples', v: 1, picture: 'loop', size: 1, pieces: 10, spread: 1, style: 'rings'}, 0],   // 0.20 ms
  [{gen: 'effect.smoke-plume', v: 1, picture: 'loop', size: 1, pieces: 8, drift: 0.5, style: 'soot'}, 2],   // 1.17 ms
  [{gen: 'effect.splash-burst', v: 1, picture: 'burst', size: 1, pieces: 10, spread: 1, style: 'crown'}, 1],   // 0.37 ms
  [{gen: 'effect.sun-rays', v: 1, picture: 'loop', pieces: 4, length: 1, spread: 1, slant: 0, style: 'solid', motes: true}, 5],   // 0.23 ms
  [{gen: 'effect.wind-gust', v: 1, picture: 'loop', pieces: 10, length: 1, spread: 1, style: 'dust'}, 0],   // 0.22 ms
  [{gen: 'effect.zap-crackle', v: 1, picture: 'loop', size: 1, pieces: 5, style: 'arcs', forks: true, flicker: 0.5}, 10],   // 0.94 ms
];

const cpuMs = (fn) => { const t0 = process.cpuUsage(); fn(); const d = process.cpuUsage(t0); return (d.user + d.system) / 1000; };
const median = (fn, n = 9) => { fn(); fn(); const ms = []; for (let i = 0; i < n; i++) ms.push(cpuMs(fn)); return ms.sort((a, b) => a - b)[n >> 1]; };

test('every effect port of fx-e2.js has a heaviest call here', () => {
  const ports = Object.values(E2).filter((e) => e && typeof e.id === 'string' && e.id.startsWith('effect.')).map((e) => e.id).sort();
  assert.deepEqual(ports, HEAVIEST.map(([c]) => c.gen).sort());
});

test('every E2 effect port at its heaviest runs within its cost', () => {
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
    if (ms > allowedMs(c.cost)) slow.push(`${base.gen}@${base.v}: ${ms.toFixed(2)} ms of processor time for cost ${c.cost} (allowed ${allowedMs(c.cost).toFixed(2)})`);
  }
  assert.deepEqual(slow, []);
});
