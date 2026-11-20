// The interface-picture port generators of migration batch M9 (engine/gen/ui-hud.js, engine/gen/ui-bubbles.js and the
// text ports of engine/gen/text.js; engine/gen/port-sprite.js): each passes the goldens harness at three argument sets
// made from its own argument list (its defaults; every slider high, every flag turned, the last option of every word
// and the last picture; every slider low, the second option of every word, at the origin, a later frame), every paint
// a slot of the argument's own name. tests/unit/m9-ui-redraws.test.mjs holds the redraws that name them to their code
// sprites pixel for pixel.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';

/** The port generators this file holds, by id (each version 1). */
export const PORTS = Object.freeze(['damage.digits', 'status.icons', 'crosshair', 'score.pop', 'word.pop', 'emote.marks', 'battle.menu', 'hud.platformer', 'hud.roguelite', 'score.counter', 'timer', 'upgrade.card', 'emote.bubbles', 'speech.bubble', 'thought.bubble']);

/** Three argument sets for a port generator, from its argument types (see the header). */
function casesOf(entry) {
  const paints = {}, hi = {}, lo = {};
  for (const [k, t] of Object.entries(entry.args)) {
    if (t.type === 'paint') { paints[k] = k; continue; }
    if (k === 'at' || k === 'picture') continue;
    if (t.type === 'share' || t.type === 'px') { hi[k] = t.hi; lo[k] = t.lo; }
    else if (t.type === 'flag') hi[k] = !t.default;
    else if (t.type === 'word') { hi[k] = t.values.at(-1); lo[k] = t.values[Math.min(1, t.values.length - 1)]; }
  }
  const pics = entry.args.picture.values;
  return [
    { args: { at: [16, 16], ...paints } },
    { args: { at: [16, 16], picture: pics.at(-1), ...hi, ...paints }, ctx: { frame: 1 } },
    { args: { at: [0, 0], picture: pics[Math.floor(pics.length / 2)], ...lo, ...paints }, ctx: { frame: 2 } },
  ];
}

for (const id of PORTS) {
  test(`${id}@1 passes the goldens harness`, () => {
    const entry = registry.generator(id, 1);
    assert.ok(entry, `${id}@1 is registered`);
    checkGeneratorContract(registry, entry, { cases: casesOf(entry) });
  });
}

/** The port generators review M9 round 1 added, [id, v]: upgrade.card@2 (the disabled card greyed exactly, issue 8) and name.plate@1 (the name plate, issue 1). */
export const PORTS_R2 = Object.freeze([['upgrade.card', 2], ['name.plate', 1]]);

for (const [id, v] of PORTS_R2) {
  test(`${id}@${v} passes the goldens harness`, () => {
    const entry = registry.generator(id, v);
    assert.ok(entry, `${id}@${v} is registered`);
    checkGeneratorContract(registry, entry, { cases: casesOf(entry) });
  });
}

test('upgrade.card@2 draws what @1 draws but for the disabled card, whose every paint is a grey rule', () => {
  const ctx = { size: [96, 96], frame: 0, frames: 1, t: 0, loop: true };
  const call = (v, picture, more = {}) => registry.runGenerator({ gen: 'upgrade.card', v, at: [48, 48], picture, face: 'face', frame: 'frame', lit: 'lit', ...more }, ctx);
  for (const style of ['plate', 'hologram', 'glass']) {
    for (const picture of ['normal', 'hover', 'pressed']) assert.deepEqual(call(2, picture, { style }).primitives, call(1, picture, { style }).primitives, `${style} ${picture}`);
    const off = call(2, 'disabled', { style }).primitives;
    assert.notDeepEqual(off, call(1, 'disabled', { style }).primitives, style);
    const greys = (r) => r === 'ink' || r === 'clear' || (r && typeof r === 'object' && (r.rule === 'grey' || (r.rule !== undefined && Object.values(r).some(greys))));
    for (const s of off) for (const r of Object.values(s.key)) assert.ok(greys(r), `${style}: ${JSON.stringify(r)} is greyed`);
  }
});
