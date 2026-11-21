// The three colour rules migration batch M9 adds (engine/data-rules.js COLOUR_RULES, worked out by engine/look-tones.js):
// what the interface code sprites worked out from a colour's numbers, which a port's paint refs cannot read (review M9
// issues 1, 6 and 8):
//   lifted   { of, against, beside }       sprites/ui-name-plate.js litBand: the accent lifted until it keeps 3 to 1
//                                          against the plate under every look and sits 0.1 from the band
//   grey     { of }                        engine/ui.js desaturate: the grey of the same brightness (a disabled card)
//   ifLight  { of, above, then, else }     `then` when engine/color.js brightness(of) is above `above`, else `else`
//                                          (engine/inputs-shoulder.js: a pale face is shaded darker, not lighter)
// Each must equal the code it stands for at every colour, swatch or not.
import test from 'node:test';
import assert from 'node:assert/strict';
import { COLOUR_RULES, paintColour } from '../../engine/data-rules.js';
import { tone, brightness } from '../../engine/color.js';
import { validateSprite } from '../../catalog/sprite-schema.js';
import { lifted, grey, ifLight } from '../../engine/look-tones.js';

let seed = 9;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const hex = () => '#' + [0, 0, 0].map(() => Math.floor(rnd() * 256).toString(16).padStart(2, '0')).join('');
// the name plate's swatches, the review's near-blacks (review M9 issue 6), and a seeded spread
const COLOURS = ['#2a2a3a', '#4a3a2a', '#f2c230', '#d1453b', '#9b5fd0', '#5fa04a', '#e8763a', '#f4e8c8', '#8ec5e8', '#050505', '#060606', '#080808',
  '#090909', '#0b0b0b', '#0c0c0c', '#081000', '#000000', '#ffffff', '#000002', '#3afef0', '#40f9fa', ...Array.from({ length: 60 }, hex)];

test('lifted, grey and ifLight are documented colour rules taking colours (and a number)', () => {
  assert.deepEqual(Object.keys(COLOUR_RULES.lifted.args).sort(), ['against', 'beside', 'of']);
  assert.deepEqual(Object.keys(COLOUR_RULES.grey.args), ['of']);
  assert.deepEqual(Object.keys(COLOUR_RULES.ifLight.args).sort(), ['above', 'else', 'of', 'then']);
  for (const name of ['lifted', 'grey', 'ifLight']) {
    const r = COLOUR_RULES[name];
    assert.ok(Object.isFrozen(r) && r.about.length > 10, name);
    assert.ok(!('from' in r.args), `${name}: not "from" (a paint holding "from" reads as a binding)`);
  }
  assert.equal(COLOUR_RULES.ifLight.args.above.kind, 'number');
  assert.equal(COLOUR_RULES.ifLight.args.above.min, 0);
  assert.equal(COLOUR_RULES.ifLight.args.above.max, 1);
});

test('ifLight picks by brightness exactly as the code did: strictly above the line is light, at it or below dark', () => {
  for (const c of COLOURS) {
    const pale = brightness(c) > 0.76;
    assert.equal(ifLight(c, 0.76, 'a', 'b'), pale ? 'a' : 'b', c);
    const face = paintColour({ rule: 'ifLight', of: 'shown', above: 0.76, then: { rule: 'tone', of: 'shown', by: -0.3 }, else: 'shown' }, { shown: c });
    assert.equal(face, (pale ? tone(c, -0.3) : c).toLowerCase(), c);
  }
  // the colours whose brightness is 0.76 to within float error (the review of the old standOut chain found 138 such)
  for (const c of ['#3afef0', '#40f9fa', '#45ffce', '#49f5f7', '#4bfad8']) assert.equal(ifLight(c, 0.76, 'a', 'b'), brightness(c) > 0.76 ? 'a' : 'b', c);
});

test('a definition may name the three rules in a derived slot; out-of-range or missing arguments are refused', () => {
  const def = (derive) => ({ format: 'loadout-sprite', version: 2, id: 'rule-probe', name: 'Rule probe', size: [8, 8], pivot: [4, 8],
    palette: [{ id: 'body', label: 'Body', default: '#3a6ea8', material: 'interface' }, { id: 'band', label: 'Band', default: '#f4e8c8', material: 'interface' }, { id: 'out', material: 'interface', derive }],
    controls: [{ key: 'body', kind: 'colour', label: 'Body' }, { key: 'band', kind: 'colour', label: 'Band' }],
    body: { pictures: { nodes: [{ id: 'n', parent: null, at: [4, 4] }], draw: [{ kind: 'rect', on: 'n', at: [-2, -2], size: [4, 4], paint: 'out' }, { kind: 'rect', on: 'n', at: [-1, -1], size: [2, 2], paint: 'band' }] } },
    clips: { idle: { frames: 1, fps: 8 } } });
  for (const d of [{ rule: 'lifted', of: 'body', against: 'band', beside: 'band' }, { rule: 'grey', of: 'body' }, { rule: 'ifLight', of: 'body', above: 0.5, then: 'band', else: { rule: 'grey', of: 'body' } }]) {
    const r = validateSprite(def(d));
    assert.deepEqual(r.errors, [], JSON.stringify(d));
  }
  assert.ok(validateSprite(def({ rule: 'ifLight', of: 'body', above: 1.5, then: 'band', else: 'body' })).errors.length > 0, 'above out of range');
  assert.ok(validateSprite(def({ rule: 'lifted', of: 'body', against: 'band' })).errors.length > 0, 'beside missing');
});
