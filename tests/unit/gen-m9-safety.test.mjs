// Safety of migration batch M9's port generators (docs/data-sprites.md 3.4 rule 2; review M9 round 1, issue 5): a port
// runs a whole old picture on a paint-ref grid, so its cost must charge what that drawing takes, or the frame budget
// stops bounding the time a frame can take. Each port's heaviest call (found by trying every picture, word, flag and
// slider end at every frame: scratchpad m9/calib.mjs) must run within its cost at MS_PER_COST plus SPARE_MS, the median
// of nine warm runs in processor time (process.cpuUsage, so a busy machine does not fail it; tests/unit/versions-sprites
// measures the same way). Calibrated at about 0.01 ms a unit with the machine under a load average of about 120; B8's
// pixel generators measured about 0.02 (tests/unit/gen-b8-safety.test.mjs allows 0.1 a unit with 30 ms to spare). Review
// M9 round 2, issue 3: round 1 allowed 0.03 ms a unit of wall time and nothing to spare, which failed 3 runs in 4 at a
// load average of about 100; this allows 0.05 a unit (five times the calibration) and 2 ms, still under B8's line.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCall, runGenerator, generator } from '../../engine/gen/index.js';

const MS_PER_COST = 0.05;
const SPARE_MS = 2;
const allowedMs = (cost) => SPARE_MS + cost * MS_PER_COST;
const CTX = (frame, frames = 12) => ({ size: [300, 300], frame, frames, t: frame / frames, loop: true });
// [call, frame]: the heaviest call of each port the calibration found (paints filled in below)
const HEAVIEST = [
  [{ gen: 'font.cell', v: 1, style: 'serif', row: 'lower', size: 1, outline: 'rimmed', shadow: true }, 7],
  [{ gen: 'score.pop', v: 1, picture: 'rise', number: 'p1000', style: 'slim', size: 1, outline: 'rimmed' }, 5],
  [{ gen: 'word.pop', v: 1, picture: 'pop', word: 'game-over', style: 'serif', size: 1, outline: 'rimmed' }, 8],
  [{ gen: 'key.cap', v: 1, picture: 'up', mark: 'left', size: 1, depth: 1 }, 2],
  [{ gen: 'key.wide', v: 1, picture: 'up', shape: 'long', size: 1, depth: 0.5, lights: true }, 11],
  [{ gen: 'pad.dpad', v: 1, picture: 'idle', style: 'rocker', size: 1, depth: 0 }, 1],
  [{ gen: 'pad.face', v: 1, picture: 'idle', style: 'cluster', button: 'all', size: 1, depth: 0 }, 8],
  [{ gen: 'pad.shoulder', v: 1, picture: 'idle', button: 'bumper', side: 'right', style: 'rounded', size: 1 }, 6],
  [{ gen: 'mouse', v: 1, picture: 'show', action: 'left', shape: 'oval', size: 1 }, 2],
  [{ gen: 'stick', v: 1, picture: 'move', motion: 'spin', style: 'flat', size: 0.5 }, 11],
  [{ gen: 'damage.digits', v: 1, picture: 'crit', style: 'chunky', size: 0 }, 0],
  [{ gen: 'status.icons', v: 1, picture: 'attack-down', backing: 'round', bold: true, shine: true }, 2],
  [{ gen: 'crosshair', v: 1, picture: 'reload', style: 'brackets', size: 0, gap: 0.5, thickness: 1 }, 4],
  [{ gen: 'battle.menu', v: 1, picture: 'panel', style: 'ornate', corner: 1 }, 0],
  [{ gen: 'hud.platformer', v: 1, picture: 'gem', shape: 'round', shine: true }, 3],
  [{ gen: 'hud.roguelite', v: 1, picture: 'shield-full', shape: 'cell', bold: true, shine: true }, 9],
  [{ gen: 'score.counter', v: 1, picture: 'idle', style: 'drum', digits: 7, size: 0, icon: 'heart', zeros: true }, 6],
  [{ gen: 'timer', v: 1, picture: 'idle', style: 'drum', format: 'clock', size: 1, icon: false }, 8],
  [{ gen: 'upgrade.card', v: 1, picture: 'hover', style: 'hologram', rarity: 'rare', corner: 0 }, 9],
  [{ gen: 'upgrade.card', v: 2, picture: 'disabled', style: 'hologram', rarity: 'rare', corner: 0 }, 9],
  [{ gen: 'emote.marks', v: 1, picture: 'idle', emote: 'anger', size: 1, bold: true, shadow: true }, 8],
  [{ gen: 'emote.bubbles', v: 1, picture: 'pop', emote: 'music', style: 'cloud', tail: 'right', size: 1 }, 4],
  [{ gen: 'speech.bubble', v: 1, picture: 'plain', style: 'round', tail: 'left', shadow: false }, 2],
  [{ gen: 'thought.bubble', v: 1, picture: 'bubble' }, 0],
  [{ gen: 'name.plate', v: 1, picture: 'plate-lit', style: 'ribbon', border: 1 }, 0],
];

const cpuMs = (fn) => { const t0 = process.cpuUsage(); fn(); const d = process.cpuUsage(t0); return (d.user + d.system) / 1000; };
const median = (fn, n = 9) => { fn(); fn(); const ms = []; for (let i = 0; i < n; i++) ms.push(cpuMs(fn)); return ms.sort((a, b) => a - b)[n >> 1]; };

test('every M9 port at its heaviest runs within its cost', () => {
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
