// The shadeTo colour rule (engine/data-rules.js COLOUR_RULES; migration batch P5): a colour taken darker or lighter
// along its own ramp until its brightness is a target worked out from colours (engine/bulkhead.js shadeTo). The station
// machines drew their recess metal (machineTones' dark: shadeTo(c, max(0.17, brightness(c) - 0.2))) and the blast
// door its frame (shadeTo(hull, max(0.16, min(brightness(hull), brightness(body) - 0.15)))) with it; their data
// redraws (engine/gen/props-p5.js) name this rule, so the frame stays darker than the door under any colour picked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { COLOUR_RULES, paintColour } from '../../engine/data-rules.js';
import { shadeTo, machineTones } from '../../engine/bulkhead.js';
import { brightness, tone } from '../../engine/color.js';
import { validateSprite } from '../../catalog/sprite-schema.js';

// the derelict swatches of the redraws, pale and dark colours, black and white
const COLOURS = ['#6b7896', '#434d6d', '#9db2c5', '#5d6475', '#2f3059', '#a87894', '#f0ead8', '#ffffff', '#000000', '#e2473f', '#2fb3a8', '#101020'];

test('shadeTo is a documented colour rule: a colour, an optional colour it is kept under, a drop and a floor', () => {
  const r = COLOUR_RULES.shadeTo;
  assert.ok(r && Object.isFrozen(r) && r.about.length > 10);
  assert.deepEqual(Object.keys(r.args).sort(), ['drop', 'floor', 'of', 'under']);
  assert.equal(r.args.of.kind, 'colour');
  assert.equal(r.args.under.kind, 'colour');
  assert.equal(r.args.under.optional, true);
  for (const k of ['drop', 'floor']) assert.deepEqual([r.args[k].kind, r.args[k].min, r.args[k].max], ['number', 0, 1]);
});

test('shadeTo gives exactly engine/bulkhead.js shadeTo at max(floor, min(brightness(of), brightness(under) - drop))', () => {
  for (const a of COLOURS) {
    // machineTones' recess metal: under left out is the colour itself
    assert.equal(paintColour({ rule: 'shadeTo', of: a, drop: 0.2, floor: 0.17 }), shadeTo(a, Math.max(0.17, brightness(a) - 0.2)).toLowerCase(), `${a} recess`);
    assert.equal(paintColour({ rule: 'shadeTo', of: a, drop: 0.2, floor: 0.17 }), machineTones(a).dark.toLowerCase(), `${a} is machineTones' dark`);
    for (const b of COLOURS) {
      const want = shadeTo(a, Math.max(0.16, Math.min(brightness(a), brightness(b) - 0.15))).toLowerCase();
      assert.equal(paintColour({ rule: 'shadeTo', of: a, under: b, drop: 0.15, floor: 0.16 }), want, `${a} under ${b}`);
    }
  }
  // nested: the colours may themselves be rules
  const lit = tone('#6b7896', 0.4);
  assert.equal(paintColour({ rule: 'shadeTo', of: { rule: 'tone', of: '#6b7896', by: 0.4 }, drop: 0.2, floor: 0.17 }), shadeTo(lit, Math.max(0.17, brightness(lit) - 0.2)).toLowerCase());
});

test('a definition may name shadeTo; a drop out of range is refused', () => {
  const def = (derive) => ({ format: 'loadout-sprite', version: 2, id: 'shade-probe', name: 'Shade probe', size: [8, 8], pivot: [4, 8],
    palette: [{ id: 'body', label: 'Body', default: '#6b7896', material: 'metal' }, { id: 'recess', material: 'metal', derive }],
    controls: [{ key: 'body', kind: 'colour', label: 'Body' }],
    body: { pictures: { draw: [{ kind: 'rect', at: [1, 1], size: [6, 3], paint: 'recess' }, { kind: 'rect', at: [1, 4], size: [6, 3], paint: 'body' }, { kind: 'outline', paint: 'ink' }] } },
    clips: { idle: { frames: 1, fps: 8 } } });
  const ok = validateSprite(def({ rule: 'shadeTo', of: 'body', drop: 0.2, floor: 0.17 }));
  assert.ok(ok.ok, ok.errors?.join('; '));
  const under = validateSprite(def({ rule: 'shadeTo', of: 'body', under: 'body', drop: 0.15, floor: 0.16 }));
  assert.ok(under.ok, under.errors?.join('; '));
  const bad = validateSprite(def({ rule: 'shadeTo', of: 'body', drop: 2, floor: 0.17 }));
  assert.ok(!bad.ok, 'a drop of 2 is refused');
});
