// The settings resolver (engine/resolve.js, B4) on version 1 definitions: every valid version 1 definition is a valid
// version 2 one (docs/data-sprites.md 2), so every studio template resolves: its colours from the rig's slots and the
// sprite's defaults, its sliders scaling bones and shapes by their own value (version 1's scales), the same scale
// engine/data-sprite.js drawOptions gives, and nothing left to resolve.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSprite, settingTable } from '../../engine/resolve.js';
import { drawOptions } from '../../engine/data-sprite.js';
import { studioTemplate, STUDIO_TEMPLATE_IDS } from '../../rigs/studio-templates.js';
import { settingsOf, leftovers } from '../fixtures/resolve/helpers.mjs';

test('every studio template (version 1) resolves at every setting worth trying', () => {
  for (const id of STUDIO_TEMPLATE_IDS) {
    const def = studioTemplate(id);
    const keys = Object.keys(settingTable(def));
    for (const s of settingsOf(def)) {
      const r = resolveSprite(def, s);
      assert.equal(r.ok, true, `${id} at ${JSON.stringify(s)}: ${r.errors.join('; ')}`);
      assert.equal(r.version, 1);
      assert.equal(r.body.kind, 'rig');
      assert.deepEqual(leftovers(r.body, keys), []);
      const want = drawOptions(def, r.params);
      for (const what of ['bones', 'shapes']) for (const [k, f] of Object.entries(want.scale[what])) assert.ok(Math.abs(r.scales[what][k] - f) < 1e-12, `${id}: ${what} ${k}`);
      for (const [slot, hex] of Object.entries(want.colours)) assert.equal(r.palette[slot].hex, hex.toLowerCase(), `${id}: ${slot}`);
    }
  }
});

test('a version 1 sprite\'s colour settings are its rig\'s slots, with the sprite\'s defaults', () => {
  const def = studioTemplate('two-legs');
  const t = settingTable(def);
  assert.equal(t.shirt.kind, 'colour');
  assert.equal(t.shirt.default, def.colours.shirt.toLowerCase());
  assert.equal(t.eye, undefined, 'a detail slot has no setting');
  const r = resolveSprite(def, { shirt: '#112233' });
  assert.equal(r.palette.shirt.hex, '#112233');
  assert.equal(r.palette.eye.detail, true);
  assert.equal(r.clips.walk.frames, def.clips.walk.frames);
});
