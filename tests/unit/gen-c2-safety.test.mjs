// Safety of migration batch C2's creature ports (docs/data-sprites.md 3.4 rule 2): a creature port runs a whole old
// creature drawing on a paint-ref grid (engine/gen/creatures.js creaturePort), so its cost must charge what that drawing
// takes, or the frame budget stops bounding the time a frame can take. As tests/unit/gen-e2-safety.test.mjs does for
// E2's effect ports: each port's heaviest call (found by trying every clip at frames 0 to 11 with every slider low,
// middle and high and each option of each choice, the 24 slowest again as a median of nine warm runs) must run within
// its cost at MS_PER_COST plus SPARE_MS, the median of nine warm runs in processor time. The ports declare `units` of
// 1.5 times the measured time at 0.01 ms a unit (measured 2026-11-20 on a busy machine); the line here is E2's.
// E2's line alone does not hold the declared units (its 0.05 ms a cost unit is five times theirs, and a big frame's cost
// is mostly its tiles and RUN_RECTS), so the units are held on their own too: the heaviest call must run within its
// port's units at UNIT_MS plus UNIT_SPARE_MS, which a port priced at a fifth of its time fails (the C2 review's queen at
// 100 units for about 18 ms). That time is the fastest of 15 warm runs, not the median: what the call costs, without
// the waits of a loaded machine (on 2026-11-20, at a load average of 140, medians of nine ran two to four times over).
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCall, runGenerator, generator } from '../../engine/gen/index.js';
import * as C2 from '../../engine/gen/creatures.js';

const MS_PER_COST = 0.05;
const UNIT_MS = 0.01, UNIT_SPARE_MS = 0.5;
const SPARE_MS = 2;
const allowedMs = (cost) => SPARE_MS + cost * MS_PER_COST;
const PAINTS = { body: 'body', accent: 'accent', lit: 'glow' };
// [call, frame]: the heaviest call of each creature port the calibration found, and its time then
const HEAVIEST = [
  [{ gen: 'bug.crawler', v: 1, size: 1, legs: 1, hornLength: 1.35, tailLength: 1.35, bounce: 1, stride: 1, spikes: true, tail: 'club', picture: 'attack-up' }, 7],   // 1.44 ms
  [{ gen: 'bug.mite', v: 1, size: 0, bounce: 0, legs: 'four', picture: 'die' }, 3],   // 0.96 ms
  [{ gen: 'bug.spitter', v: 1, horns: 'spines', picture: 'die' }, 4],   // 1.74 ms
  [{ gen: 'bug.beetle', v: 1, horns: 'stag', picture: 'walk' }, 1],   // 2.48 ms
  [{ gen: 'bug.queen', v: 1, size: 1, bulk: 1, pieces: 1, hornLength: 1.35, wingSpan: 1.35, bounce: 1, horns: 'antlers', picture: 'spawn' }, 4],   // 18.10 ms
  [{ gen: 'beast.quadruped', v: 1, size: 1, length: 1, bulk: 1, wingSpan: 1.35, hornLength: 1.35, tailLength: 1.35, bounce: 1, wings: 'tattered', picture: 'attack' }, 7],   // 11.98 ms
];

const cpuMs = (fn) => { const t0 = process.cpuUsage(); fn(); const d = process.cpuUsage(t0); return (d.user + d.system) / 1000; };
const fastest = (fn, n = 15) => { for (let i = 0; i < 5; i++) fn(); let best = Infinity; for (let i = 0; i < n; i++) best = Math.min(best, cpuMs(fn)); return best; };
const median = (fn, n = 9) => { fn(); fn(); const ms = []; for (let i = 0; i < n; i++) ms.push(cpuMs(fn)); return ms.sort((a, b) => a - b)[n >> 1]; };

test('every creature port of creatures.js has a heaviest call here', () => {
  const ports = Object.values(C2).filter((e) => e && typeof e.id === 'string' && e.family === 'creature').map((e) => e.id).sort();
  assert.deepEqual(ports, HEAVIEST.map(([c]) => c.gen).sort());
});

test('every C2 creature port at its heaviest runs within its declared units and its cost, and its cost is within the frame budget', () => {
  const slow = [];
  for (const [base, frame] of HEAVIEST) {
    const entry = generator(base.gen, base.v);
    assert.ok(entry, `${base.gen}@${base.v} is registered`);
    const paints = Object.fromEntries(Object.entries(PAINTS).filter(([k]) => Object.hasOwn(entry.args, k)));
    const call = { at: [150, 150], ...paints, ...base };
    const c = checkCall(call);
    assert.ok(c.ok, `${base.gen}@${base.v}: ${c.errors.join('; ')}`);
    assert.ok(c.cost <= 4000, `${base.gen}@${base.v}: cost ${c.cost} within a frame's 4,000`);
    const r = runGenerator(call, { size: [300, 300], frame });
    assert.ok(r.ok, `${base.gen}@${base.v}: ${r.errors.join('; ')}`);
    assert.ok(r.primitives.length > 0, `${base.gen}@${base.v} draws something`);
    const ms = median(() => runGenerator(call, { size: [300, 300], frame }));
    const units = C2.CREATURE_UNITS[`${base.gen}@${base.v}`];
    assert.ok(Number.isInteger(units), `${base.gen}@${base.v} declares its units`);
    const best = fastest(() => runGenerator(call, { size: [300, 300], frame }));
    if (best > UNIT_SPARE_MS + units * UNIT_MS) slow.push(`${base.gen}@${base.v}: ${best.toFixed(2)} ms of processor time (fastest) against its ${units} units (allowed ${(UNIT_SPARE_MS + units * UNIT_MS).toFixed(2)})`);
    if (ms > allowedMs(c.cost)) slow.push(`${base.gen}@${base.v}: ${ms.toFixed(2)} ms of processor time for cost ${c.cost} (allowed ${allowedMs(c.cost).toFixed(2)})`);
  }
  assert.deepEqual(slow, []);
});
