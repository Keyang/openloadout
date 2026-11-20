// Two colour rules of build item T3 (engine/data-rules.js COLOUR_RULES): the tones the station and hive tilesets work out
// from two colours' brightness, so their data redraws name the code's rule and not the colour it gives at the swatches.
//   sunkTone   { of, under, drop, floor }        the floor's inset plating (sprites/tiles-station-floor.js tones) and the
//              hive wall's cap (sprites/tiles-hive.js tones): of mixed towards its own ramp's dark until its brightness is
//              max(floor, min(brightness(of), brightness(under) - drop)), never past that dark
//   shadeApart { of, under, drop, self, floor }  the station wall's cap (sprites/tiles-station-walls.js tones): engine/
//              bulkhead.js shadeTo(of, max(floor, min(brightness(of) - self, brightness(under) - drop)))
import test from 'node:test';
import assert from 'node:assert/strict';
import { COLOUR_RULES, paintColour } from '../../engine/data-rules.js';
import { shadeTo } from '../../engine/bulkhead.js';
import { brightness, ramp, mix } from '../../engine/color.js';
import { validateSprite } from '../../catalog/sprite-schema.js';

const clamp = (v) => Math.min(1, Math.max(0, v));
// the derelict swatches, pale and dark colours, black and white, and colours off every swatch
const COLOURS = ['#6b7896', '#434d6d', '#9db2c5', '#5d6475', '#2f3059', '#a87894', '#8e6f8c', '#f0ead8', '#ffffff', '#000000', '#e2473f', '#2fb3a8', '#101020', '#7799ff', '#e37f2d', '#520bed'];

/** sprites/tiles-station-floor.js and tiles-hive.js, word for word: the colour sunk under another. */
function sunkCode(c, under, drop, floor) {
  const r = ramp(c);
  const want = Math.max(floor, Math.min(brightness(c), brightness(under) - drop));
  return mix(c, r.dark, clamp((brightness(c) - want) / Math.max(0.01, brightness(c) - brightness(r.dark))));
}

test('sunkTone and shadeApart are documented colour rules with their arguments', () => {
  const s = COLOUR_RULES.sunkTone, a = COLOUR_RULES.shadeApart;
  assert.ok(s && Object.isFrozen(s) && s.about.length > 20);
  assert.deepEqual(Object.keys(s.args).sort(), ['drop', 'floor', 'of', 'under']);
  assert.ok(a && Object.isFrozen(a) && a.about.length > 20);
  assert.deepEqual(Object.keys(a.args).sort(), ['drop', 'floor', 'of', 'self', 'under']);
  for (const r of [s, a]) for (const k of Object.keys(r.args)) if (k !== 'of' && k !== 'under') assert.deepEqual([r.args[k].kind, r.args[k].min, r.args[k].max], ['number', 0, 1], k);
});

test('sunkTone gives exactly the code\'s plating and hive cap tones, for every pair of colours', () => {
  for (const c of COLOURS) for (const u of COLOURS) {
    assert.equal(paintColour({ rule: 'sunkTone', of: c, under: u, drop: 0.08, floor: 0.2 }), sunkCode(c, u, 0.08, 0.2).toLowerCase(), `plating ${c} under ${u}`);
    assert.equal(paintColour({ rule: 'sunkTone', of: c, under: u, drop: 0.09, floor: 0.26 }), sunkCode(c, u, 0.09, 0.26).toLowerCase(), `cap ${c} under ${u}`);
  }
});

test('shadeApart gives exactly the code\'s station wall cap, for every pair of colours', () => {
  for (const c of COLOURS) for (const u of COLOURS) {
    const want = shadeTo(c, Math.max(0.2, Math.min(brightness(c) - 0.08, brightness(u) - 0.2))).toLowerCase();
    assert.equal(paintColour({ rule: 'shadeApart', of: c, under: u, drop: 0.2, self: 0.08, floor: 0.2 }), want, `${c} under ${u}`);
  }
});

test('the rules take rules as their colours, and a definition may name them; out-of-range numbers are refused', () => {
  const lit = { rule: 'tone', of: '#6b7896', by: 0.4 };
  assert.equal(paintColour({ rule: 'sunkTone', of: lit, under: '#434d6d', drop: 0.08, floor: 0.2 }), sunkCode(paintColour(lit), '#434d6d', 0.08, 0.2).toLowerCase());
  const def = (derive) => ({ format: 'loadout-sprite', version: 2, id: 'sunk-probe', name: 'Sunk probe', size: [8, 8], pivot: [4, 8],
    palette: [{ id: 'body', label: 'Body', default: '#6b7896', material: 'metal' }, { id: 'deck', label: 'Deck', default: '#9db2c5', material: 'metal' }, { id: 'low', material: 'metal', derive }],
    controls: [{ key: 'body', kind: 'colour', label: 'Body' }, { key: 'deck', kind: 'colour', label: 'Deck' }],
    body: { pictures: { draw: [{ kind: 'rect', at: [1, 1], size: [6, 2], paint: 'low' }, { kind: 'rect', at: [1, 3], size: [6, 2], paint: 'body' }, { kind: 'rect', at: [1, 5], size: [6, 2], paint: 'deck' }, { kind: 'outline', paint: 'ink' }] } },
    clips: { idle: { frames: 1, fps: 8 } } });
  for (const rule of [{ rule: 'sunkTone', of: 'body', under: 'deck', drop: 0.08, floor: 0.2 }, { rule: 'shadeApart', of: 'body', under: 'deck', drop: 0.2, self: 0.08, floor: 0.2 }]) {
    const ok = validateSprite(def(rule));
    assert.ok(ok.ok, ok.errors?.join('; '));
    assert.ok(!validateSprite(def({ ...rule, drop: 2 })).ok, `${rule.rule}: a drop of 2 is refused`);
    assert.ok(!validateSprite(def({ ...rule, under: undefined })).ok, `${rule.rule}: under is needed`);
  }
});
