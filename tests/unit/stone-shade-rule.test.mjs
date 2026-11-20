// The stoneShade colour rule (engine/data-rules.js COLOUR_RULES; migration batch M5, review round 2 issue 1): the tone
// between a paving's colour and its joint colour that every whole-bundle look keeps apart from the paving, exactly as
// engine/paving.js stoneShade works it out. The code tilesets (tiles-dungeon, tiles-village) drew their joints and
// darker stones with it; a data tileset that wrote the amount it gave at each swatch lost its joints under some looks
// for any other colour a person picked (the review saw bricks at #3a6ea8 go flat under the forest and night looks).
import test from 'node:test';
import assert from 'node:assert/strict';
import { COLOUR_RULES, paintColour } from '../../engine/data-rules.js';
import { stoneShade } from '../../engine/paving.js';
import { textureTone } from '../../engine/tiles.js';
import { mix } from '../../engine/color.js';
import { THEME_PRESETS, applyColour } from '../../engine/theme.js';
import { col } from '../../engine/color.js';
import { validateSprite } from '../../catalog/sprite-schema.js';
import { paintHex, resolvePalette } from '../../engine/resolve.js';

// the review's colours (off every swatch), the dungeon's floor swatches, and a seeded spread of others
let seed = 11;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const hex = () => '#' + [0, 0, 0].map(() => Math.floor(rnd() * 256).toString(16).padStart(2, '0')).join('');
const COLOURS = ['#3a6ea8', '#e37f2d', '#520bed', '#a3109b', '#025d28', '#4216b0', '#a8a4a0', '#c9a06a', '#e6c96a', '#5d6475', '#ffffff', '#000000',
  ...Array.from({ length: 40 }, hex)];
const kept = (body, c) => c !== body && THEME_PRESETS.every((look) => { const to = applyColour(Uint32Array.from([col(body), col(c)]), look.theme.colour); return to[0] !== to[1]; });

test('stoneShade is a documented colour rule taking a colour, the colour it moves towards and where to start', () => {
  const r = COLOUR_RULES.stoneShade;
  assert.ok(r && Object.isFrozen(r) && r.about.length > 10);
  assert.deepEqual(Object.keys(r.args).sort(), ['of', 'start', 'with']);
  assert.equal(r.args.of.kind, 'colour');
  assert.equal(r.args.with.kind, 'colour');
  assert.equal(r.args.start.kind, 'number');
  assert.equal(r.args.start.optional, true);
  assert.ok(!('from' in r.args), 'not "from": a paint holding "from" reads as a binding (catalog/sprite-schema.js)');
});

test('stoneShade gives exactly engine/paving.js stoneShade, for any colour, swatch or not', () => {
  for (const c of COLOURS) {
    const j = textureTone(c);
    for (const start of [0.25, 0.4, 0.55, 0.85]) {
      assert.equal(paintColour({ rule: 'stoneShade', of: c, with: j, start }), stoneShade(c, j, start).toLowerCase(), `${c} from ${start}`);
    }
    assert.equal(paintColour({ rule: 'stoneShade', of: c, with: j }), stoneShade(c, j).toLowerCase(), `${c} default start`);
    // nested: the joint colour is itself a rule, as the dungeon writes it
    assert.equal(paintColour({ rule: 'stoneShade', of: c, with: { rule: 'textureTone', of: c }, start: 0.55 }), stoneShade(c, j, 0.55).toLowerCase(), `${c} nested`);
  }
});

test('stoneShade keeps the tone apart from the colour under every look whenever any mix can, where a fixed mix does not', () => {
  let fixedLost = 0;
  for (const c of COLOURS) {
    const j = textureTone(c), s = paintColour({ rule: 'stoneShade', of: c, with: { rule: 'textureTone', of: c }, start: 0.55 });
    if (kept(c, j)) assert.ok(kept(c, s) || s === j.toLowerCase(), `${c}: the shade ${s} is kept apart under every look`);
    if (!kept(c, mix(c, j, 0.55))) fixedLost++;
  }
  assert.ok(fixedLost > 0, 'some colours lose a fixed 0.55 mix under some look (what the rule is for)');
});

test('a definition may name stoneShade in a derived slot and in place; a start out of range is refused', () => {
  const def = (paint, derive) => ({ format: 'loadout-sprite', version: 2, id: 'shade-probe', name: 'Shade probe', size: [8, 8], pivot: [4, 8],
    palette: [{ id: 'body', label: 'Body', default: '#3a6ea8', material: 'stone' }, { id: 'shade', material: 'stone', derive }],
    controls: [{ key: 'body', kind: 'colour', label: 'Body' }],
    body: { pictures: { draw: [{ kind: 'rect', at: [1, 1], size: [6, 3], paint: 'shade' }, { kind: 'rect', at: [1, 4], size: [6, 3], paint }, { kind: 'outline', paint: 'ink' }] } },
    clips: { idle: { frames: 1, fps: 8 } } });
  const rule = { rule: 'stoneShade', of: 'body', with: { rule: 'textureTone', of: 'body' }, start: 0.55 };
  const ok = validateSprite(def(rule, rule));
  assert.ok(ok.ok, ok.errors?.join('; '));
  const pal = resolvePalette(def(rule, rule), { body: '#3a6ea8' });
  assert.equal(pal.shade.hex, stoneShade('#3a6ea8', textureTone('#3a6ea8'), 0.55).toLowerCase());
  assert.equal(paintHex(rule, pal, { body: '#3a6ea8' }), stoneShade('#3a6ea8', textureTone('#3a6ea8'), 0.55).toLowerCase(), 'in place, as engine/resolve.js works a paint out');
  const bad = validateSprite(def(rule, { ...rule, start: 1.5 }));
  assert.ok(!bad.ok, 'start above 1 is refused');
});
