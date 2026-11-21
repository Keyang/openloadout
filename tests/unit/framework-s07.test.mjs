// Framework additions of batch S07 (spitter-bug, scout-drone):
//   (rigs/creature-topdown.js, the top-down creature rig, was also added; R2 deleted it and its tests)
//   engine/mech.js             rotor                  a spinning rotor as a blur of two alternating pictures
// R2: rigs/creature-topdown.js went: the tests of the top-down creature rig are deleted; the rotor test (engine/mech.js) stays.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col } from '../../engine/color.js';
import { rotor } from '../../engine/mech.js';

const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };

// ---- rotor ------------------------------------------------------------------------------------------

test('rotor: two alternating pictures while it spins, crisp blades when stopped', () => {
  const pic = (o) => rotor(new Surface(32, 32), 16, 16, 7, { colour: '#c2c9d6', ...o });
  const even = pic({ beat: 0 }), odd = pic({ beat: 1 });
  assert.ok(diff(even, odd) > 8, 'the two pictures differ');
  assert.equal(diff(even, pic({ beat: 2 })), 0);
  assert.equal(diff(odd, pic({ beat: 3 })), 0);
  const b = even.bounds();
  assert.deepEqual([b.x0, b.x1], [9, 22], 'the disc reaches the blade tips');
  assert.ok(b.y1 - b.y0 + 1 <= 7, 'and is seen at a slant, flat');
  const still = pic({ still: true });
  assert.ok(lit(still) < lit(even) / 2, 'stopped, it is two thin blades');
  assert.ok(diff(still, pic({ still: true, turn: 2 })) > 4, 'which can point anywhere');
  assert.equal(pic({ hub: '#e2473f' }).get(16, 16), col('#e2473f'));
});
