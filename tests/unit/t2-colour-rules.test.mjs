// Three colour rules of build item T2 (engine/data-rules.js COLOUR_RULES): colours the meadow, shore, village and castle
// tilesets worked out from a colour's brightness, so their data redraws name the code's rule and never the colour it
// gives at the swatches (the skill's redraw section; migration M5, review round 2).
//   raisedGround { of }                 engine/ground.js raisedGround: a ground colour lifted towards its light (the
//                                       meadow's path, the shore's bank)
//   pavingTone   { of }                 engine/paving.js pavingTone: the village's paving, lifted towards its light and white
//   brighterBy   { of, than, by, else } of when its brightness is at least `by` above than's, else `else`: the castle's
//                                       highlight on a stone (none on a stone as pale as cream: the stone's own colour)
import test from 'node:test';
import assert from 'node:assert/strict';
import { COLOUR_RULES, paintColour } from '../../engine/data-rules.js';
import { raisedGround } from '../../engine/ground.js';
import { pavingTone } from '../../engine/paving.js';
import { brightness, ramp } from '../../engine/color.js';
import { validateSprite } from '../../catalog/sprite-schema.js';

// the hearthvale and thornwood swatches of the five tilesets, pale and dark colours, black and white, colours off them
const COLOURS = ['#c9a06a', '#e8c872', '#8f8f96', '#f0ead8', '#9e9a8c', '#6f7280', '#5a5f7a', '#d8dde4', '#ffffff', '#000000',
  '#e2473f', '#2fb3a8', '#101020', '#7799ff', '#e37f2d', '#520bed', '#f2e94e', '#3a6ea8'];

test('raisedGround, pavingTone and brighterBy are documented colour rules with their arguments', () => {
  for (const [name, args] of [['raisedGround', ['of']], ['pavingTone', ['of']], ['brighterBy', ['by', 'else', 'of', 'than']]]) {
    const r = COLOUR_RULES[name];
    assert.ok(r && Object.isFrozen(r) && r.about.length > 20, name);
    assert.deepEqual(Object.keys(r.args).sort(), args, name);
  }
  assert.deepEqual([COLOUR_RULES.brighterBy.args.by.kind, COLOUR_RULES.brighterBy.args.by.min, COLOUR_RULES.brighterBy.args.by.max], ['number', 0, 1]);
});

test('raisedGround and pavingTone give exactly the code\'s colours, for every colour', () => {
  for (const c of COLOURS) {
    assert.equal(paintColour({ rule: 'raisedGround', of: c }), raisedGround(c).toLowerCase(), `raisedGround ${c}`);
    assert.equal(paintColour({ rule: 'pavingTone', of: c }), pavingTone(c).toLowerCase(), `pavingTone ${c}`);
  }
});

test('brighterBy gives the castle\'s stone highlight: its light tone when that is 0.1 brighter, else the stone', () => {
  let both = new Set();
  for (const c of COLOURS) {
    const light = ramp(c).light, want = brightness(light) - brightness(c) >= 0.1 ? light : c;
    assert.equal(paintColour({ rule: 'brighterBy', of: { rule: 'ramp', of: c, tone: 'light' }, than: c, by: 0.1, else: c }), want.toLowerCase(), c);
    both.add(want === c);
  }
  assert.deepEqual([...both].sort(), [false, true], 'the colours tried take both branches');
});

test('a sprite may name the three rules in a derived slot, and the validator checks their arguments', () => {
  const def = (derive) => ({
    format: 'loadout-sprite', version: 2, id: 'rule-probe', name: 'Rule probe', size: [32, 32], pivot: [16, 16], meta: { type: 'prop' },
    palette: [{ id: 'ground', label: 'Ground', default: '#c9a06a', material: 'earth' }, { id: 'lifted', material: 'earth', derive }],
    controls: [{ key: 'ground', kind: 'colour', label: 'Ground' }],
    body: { pictures: { nodes: [{ id: 'n', parent: null, at: [16, 16] }], draw: [{ kind: 'rect', at: [10, 10], size: [6, 6], paint: 'ground' }, { kind: 'rect', at: [17, 10], size: [6, 6], paint: 'lifted' }] } },
    clips: { idle: { frames: 1, fps: 1 } },
  });
  for (const d of [{ rule: 'raisedGround', of: 'ground' }, { rule: 'pavingTone', of: 'ground' }, { rule: 'brighterBy', of: 'ground.light', than: 'ground', by: 0.1, else: 'ground' }]) {
    const r = validateSprite(def(d));
    assert.deepEqual(r.errors, [], d.rule);
  }
  assert.equal(validateSprite(def({ rule: 'brighterBy', of: 'ground.light', than: 'ground', by: 3, else: 'ground' })).ok, false, 'by above 1 is refused');
  assert.equal(validateSprite(def({ rule: 'brighterBy', of: 'ground.light', by: 0.1, else: 'ground' })).ok, false, 'than is needed');
});
