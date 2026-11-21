// The tile generators of build item T3 (engine/gen/tiles-t3.js): tile.hive@1, tile.pit@1, tile.station-floor@1 and
// tile.station-walls@1, the four station tilesets ported whole on paint refs. Held here: each is registered and
// documented; each draws, at every picture and frame, exactly the pixels its frozen code tileset drew (through the
// colour rules it names: no colour is worked out from the swatches); each draws the same on a node as in frame pixels;
// each is pinned by a golden (tests/fixtures/gen/<id>@1.json); and each one's heaviest call runs within its cost, as
// gen-m9-safety holds the M9 ports (a port's cost must charge what its drawing takes, or the frame budget stops bounding
// a frame's time).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { checkCall, runGenerator, generator } from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';
import { HIVE_CLIPS } from '../../engine/gen/ports/t3/tiles-hive.js';
import { PIT_CLIPS } from '../../engine/gen/ports/t3/tiles-pit.js';
import { FLOOR_CLIPS } from '../../engine/gen/ports/t3/tiles-station-floor.js';
import { WALL_CLIPS } from '../../engine/gen/ports/t3/tiles-station-walls.js';
import { codeSprite } from '../helpers/library.mjs';

const PORTS = {
  'tile.hive': { id: 'tiles-hive', clips: HIVE_CLIPS, paints: { flesh: 'flesh', growth: 'growth', lights: 'glow' }, heavy: [{ veins: 1, edge: 5, texture: 1, wet: true }] },
  'tile.pit': { id: 'tiles-pit', clips: PIT_CLIPS, paints: { land: 'land', hull: 'hull', lights: 'glow' }, heavy: ['space', 'mist', 'reactor'].map((below) => ({ below, height: 14, pieces: 1 })) },
  'tile.station-floor': { id: 'tiles-station-floor', clips: FLOOR_CLIPS, paints: { floor: 'floor', plate: 'plate', accent: 'accent', lights: 'glow' }, heavy: ['panels', 'grid', 'hex'].map((style) => ({ style, edge: 6, texture: 1, wear: 1 })) },
  'tile.station-walls': { id: 'tiles-station-walls', clips: WALL_CLIPS, paints: { hull: 'hull', plate: 'plate', accent: 'accent', lights: 'glow' }, heavy: ['panels', 'ribbed', 'plated'].map((style) => ({ style, edge: 6, texture: 1, wear: 1 })) },
};

test('each port is pinned by its golden and draws the same on a node as in frame pixels', () => {
  for (const [id, P] of Object.entries(PORTS)) {
    const names = Object.keys(P.clips), last = names.at(-1), mid = names[Math.floor(names.length / 2)];
    checkGeneratorContract(registry, generator(id, 1), { cases: [
      { args: { at: [16, 16], picture: names[0], ...P.paints } },
      { args: { at: [10, 20], picture: mid, ...P.paints, ...P.heavy.at(-1) }, ctx: { t: 0.5, loop: true, frames: P.clips[mid].frames, frame: Math.min(4, P.clips[mid].frames - 1) } },
      { args: { at: [16, 16], picture: last, ...P.paints, ...P.heavy[0] }, ctx: { t: 0.25, loop: true, frames: P.clips[last].frames, frame: Math.min(2, P.clips[last].frames - 1) } },
    ] });
  }
});

// A cost unit is about 0.01 ms (engine/gen/port-sprite.js). The M9 pattern (ms <= 2 ms spare + cost x 0.05 ms) let the
// spare swamp a port's cost term, so a `units` declared too low passed (T3 review, issue 4: hive at units 1 passed).
// Now no spare: a call may take at most LOW_SLACK times what its cost says; and MEASURED is each port's
// heaviest call over every picture, frame and heavy setting, in cost units (median CPU ms / 0.01; measured
// 2026-11-20: hive 1.00 ms, pit 0.58, floor 0.47, walls 0.45); a port's declared units may not fall below it.
const MEASURED = { 'tile.hive': 100, 'tile.pit': 58, 'tile.station-floor': 47, 'tile.station-walls': 45 };
const UNIT_MS = 0.01, LOW_SLACK = 3;
const cpuMs = (fn) => { const t0 = process.cpuUsage(); fn(); const d = process.cpuUsage(t0); return (d.user + d.system) / 1000; };
// the median of nine runs of 20 calls each, per call (one call is about a millisecond, under the clock's grain)
const median = (fn) => { fn(); fn(); const ms = []; for (let i = 0; i < 9; i++) ms.push(cpuMs(() => { for (let k = 0; k < 20; k++) fn(); }) / 20); return ms.sort((a, b) => a - b)[4]; };

test('every T3 port at its heaviest settings, at every picture and frame, runs within three times its cost, with no spare', () => {
  const slow = [];
  for (const [id, P] of Object.entries(PORTS)) {
    for (const s of P.heavy) for (const [picture, st] of Object.entries(P.clips)) for (let frame = 0; frame < st.frames; frame += 3) {
      const call = { gen: id, v: 1, at: [16, 16], picture, ...P.paints, ...s };
      const c = checkCall(call);
      assert.ok(c.ok, `${id}: ${c.errors.join('; ')}`);
      const ctx = { size: [32, 32], frame, frames: st.frames, t: frame / st.frames, loop: true };
      const r = runGenerator(call, ctx);
      assert.ok(r.ok, `${id} ${picture}: ${r.errors.join('; ')}`);
      const ms = median(() => runGenerator(call, ctx));
      if (ms > LOW_SLACK * c.cost * UNIT_MS) slow.push(`${id} ${picture} frame ${frame}: ${ms.toFixed(2)} ms for cost ${c.cost} (${(c.cost * UNIT_MS).toFixed(2)} ms)`);
    }
  }
  assert.deepEqual(slow, []);
});

test('each T3 port\'s cost (its declared units) is no lower than its measured heaviest call', () => {
  for (const [id, P] of Object.entries(PORTS)) {
    const { cost } = checkCall({ gen: id, v: 1, at: [16, 16], picture: Object.keys(P.clips)[0], ...P.paints, ...P.heavy[0] });
    assert.ok(cost >= MEASURED[id], `${id}: cost ${cost}, below its measured heaviest call (${MEASURED[id]})`);
  }
});
