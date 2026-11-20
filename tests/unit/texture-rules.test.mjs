// The texture tones as colour rules (build item B15b, from its review: 8 of the 9 tilesets still to port, and the
// dungeon's wet streak, read engine/tiles.js textureTone and textureLight, which search for the first tone that stays
// apart from the colour under every whole-bundle look; a mix toward white matches them only at some colours).
// textureTone { of, against? } and textureLight { of, against?, from? } are engine/data-rules.js COLOUR_RULES, so a
// palette slot derives them by name, nothing in the data runs, and they equal the code's colours at every swatch.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { COLOUR_RULES, paintColour } from '../../engine/data-rules.js';
import { textureTone, textureLight } from '../../engine/tiles.js';
import { validateSprite } from '../../catalog/sprite-schema.js';
import { resolvePalette } from '../../engine/resolve.js';
import { dataSprite } from '../../engine/data-sprite.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import { codeSprite } from '../helpers/library.mjs';

const dungeonCode = await codeSprite('tiles-dungeon');   // the frozen copy once the library's is redrawn
const COLOURS = ['#7e84a0', '#a8a4a0', '#c9a06a', '#e6c96a', '#4f9d57', '#1a1c2c', '#f0ead8', '#ffffff', '#000000', '#c8553a'];

test('textureTone and textureLight are colour rules, each saying what it takes', () => {
  assert.deepEqual(Object.keys(COLOUR_RULES.textureTone.args), ['of', 'against']);
  assert.equal(COLOUR_RULES.textureTone.args.against.optional, true);
  assert.deepEqual(Object.keys(COLOUR_RULES.textureLight.args), ['of', 'against', 'from']);
  assert.equal(COLOUR_RULES.textureLight.args.from.optional, true);
  assert.deepEqual([COLOUR_RULES.textureLight.args.from.min, COLOUR_RULES.textureLight.args.from.max], [0.1, 1]);
  for (const r of ['textureTone', 'textureLight']) assert.match(COLOUR_RULES[r].about, /engine\/tiles\.js/);
});

test('paintColour gives engine/tiles.js textureTone and textureLight, against the colour itself or another', () => {
  for (const c of COLOURS) {
    assert.equal(paintColour({ rule: 'textureTone', of: c }), textureTone(c).toLowerCase(), c);
    assert.equal(paintColour({ rule: 'textureLight', of: c }), textureLight(c).toLowerCase(), c);
    assert.equal(paintColour({ rule: 'textureTone', of: c, against: '#7e84a0' }), textureTone(c, '#7e84a0').toLowerCase(), c);
    assert.equal(paintColour({ rule: 'textureLight', of: c, against: c, from: 0.5 }), textureLight(c, c, 0.5).toLowerCase(), c);
  }
  assert.equal(paintColour({ rule: 'textureTone', of: 'grass' }, { grass: '#4f9d57' }), textureTone('#4f9d57').toLowerCase());
});

// review B15b round 3, issue 3: textureLight reads `against` when it is another colour than `of`
test('textureLight against another colour than of is the code\'s textureLight against that colour', () => {
  let apart = 0;
  for (const c of COLOURS) for (const against of ['#7e84a0', '#1a1c2c', '#f0ead8', '#c8553a']) {
    for (const from of [undefined, 0.3, 0.5, 1]) {
      const want = (from === undefined ? textureLight(c, against) : textureLight(c, against, from)).toLowerCase();
      assert.equal(paintColour({ rule: 'textureLight', of: c, against, ...(from === undefined ? {} : { from }) }), want, `${c} against ${against} from ${from}`);
      if (want !== (from === undefined ? textureLight(c, c) : textureLight(c, c, from)).toLowerCase()) apart++;
    }
  }
  assert.ok(apart > 0, 'some colours give another light against another colour, so the case tells the two apart');
  // and by slot names, in a palette
  assert.equal(paintColour({ rule: 'textureLight', of: 'growth', against: 'floor' }, { growth: '#4f9d57', floor: '#f0ead8' }), textureLight('#4f9d57', '#f0ead8').toLowerCase());
});

test('a derived palette slot names them, validates, and resolves to the code\'s colour at every setting', () => {
  const d = {
    format: 'loadout-sprite', version: 2, id: 'texture-test', name: 'Texture test', blurb: 'A test.', size: [16, 16], pivot: [8, 8], grounded: false,
    meta: { type: 'prop', role: 'world/prop', view: 'side', themes: ['neutral'], gameTypes: ['platformer'], words: ['test'], license: 'draft' },
    palette: [
      { id: 'floor', label: 'Floor', default: '#7e84a0', material: 'stone' },
      { id: 'growth', label: 'Growth', default: '#4f9d57', material: 'plant' },
      { id: 'joint', material: 'stone', derive: { rule: 'textureTone', of: 'floor' } },
      { id: 'moss', material: 'plant', derive: { rule: 'textureTone', of: 'growth', against: 'floor' } },
      { id: 'glint', material: 'stone', derive: { rule: 'textureLight', of: 'floor', against: 'floor', from: 0.5 } },
      { id: 'sheen', material: 'plant', derive: { rule: 'textureLight', of: 'growth', against: 'floor' } },
    ],
    controls: [],
    body: { pictures: { nodes: [{ id: 'root', at: [8, 8] }], draw: ['floor', 'joint', 'moss', 'glint', 'sheen'].map((paint, i) => ({ kind: 'rect', on: 'root', at: [-4 + 2 * i, 0], size: [2, 2], paint })) } },
    clips: { idle: { frames: 1 } },
  };
  assert.deepEqual(validateSprite(d).errors, []);
  for (const floor of COLOURS) {
    const p = resolvePalette(d, { floor });
    assert.equal(p.joint.hex, textureTone(floor).toLowerCase(), floor);
    assert.equal(p.moss.hex, textureTone('#4f9d57', floor).toLowerCase(), floor);
    assert.equal(p.glint.hex, textureLight(floor, floor, 0.5).toLowerCase(), floor);
    assert.equal(p.sheen.hex, textureLight('#4f9d57', floor).toLowerCase(), floor);
  }
  // a from outside 0.1..1 is refused
  const bad = structuredClone(d);
  bad.palette[4].derive.from = 2;
  assert.match(validateSprite(bad).errors.join('\n'), /from/);
});

test('the dungeon redraw\'s wet streak is the code tileset\'s colour at every floor swatch (review B15b issue 6b)', () => {
  const def = JSON.parse(fs.readFileSync(new URL('../fixtures/v2/tiles/tiles-dungeon.json', import.meta.url), 'utf8'));
  const s = dataSprite(def);
  const ds = defaultParams(s), dc = defaultParams(dungeonCode);
  const floors = def.palette.find((x) => x.id === 'floor').swatches;
  assert.ok(floors.length >= 4);
  for (const floor of [...floors, '#3a6ea5', '#d8d0c0']) {
    for (const clip of ['floor-fill-b', 'floor-fill-c']) {   // the first floor version has no wet streak
      const set = { floor, damp: true };
      const a = renderFrame(s, clip, 0, { ...ds, ...set }), b = renderFrame(dungeonCode, clip, 0, { ...dc, ...set });
      const a0 = renderFrame(s, clip, 0, { ...ds, floor }), b0 = renderFrame(dungeonCode, clip, 0, { ...dc, floor });
      let wet = 0;
      for (let i = 0; i < a.data.length; i++) {
        if (a.data[i] === a0.data[i] || b.data[i] === b0.data[i]) continue;   // where damp paints in both
        assert.equal(a.data[i].toString(16), b.data[i].toString(16), `${clip} at floor ${floor}, pixel ${i % 32},${Math.floor(i / 32)}`);
        wet++;
      }
      assert.ok(wet > 0, `${clip} at floor ${floor}: damp paints in both`);
    }
  }
});
