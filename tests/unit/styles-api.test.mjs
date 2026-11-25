// Styles on window.loadout (Contracts 11 and 12): the action schemas accept a style, and generated/api.json lists
// the registered styles. This file must not load the test styles (tests/fixtures/styles/): it checks that the
// build knows `pixel` and nothing else.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS } from '../../app/api-actions.js';
import { buildApi, referenceMarkdown } from '../../tools/lib/api.mjs';
import { ROOT } from '../../tools/lib/assets.mjs';

test('the render and bag_add actions accept a style', () => {
  const render = ACTIONS.find((a) => a.name === 'render'), add = ACTIONS.find((a) => a.name === 'bag_add');
  const { artStyle, style } = render.inputSchema.properties.options.properties;
  assert.equal(artStyle.type, 'string');
  assert.match(artStyle.description, /^Sprites: .*art style/);
  assert.match(style.description, /^Sounds: /, '`style` is still a sound\'s named style, and nothing else');
  assert.ok(!/sprite/i.test(style.description));
  assert.match(add.inputSchema.properties.settings.description, /Sprite: \{ params, cues, scale, artStyle \}/);
});

test('api.json describes the registered styles: on the shipped site that is pixel and flat', async () => {
  const api = await buildApi({ root: ROOT });
  assert.ok(Array.isArray(api.styles));
  assert.deepEqual(api.styles.map((s) => s.id), ['pixel', 'flat'], 'the test styles are never part of the build');
  for (const style of api.styles) { assert.ok(style.label && style.about, style.id); assert.deepEqual(style.exports, ['sheet'], style.id); }
  assert.ok(api.modules.some((m) => m.name === 'styles' && m.file === 'engine/styles.js'));
  const names = api.modules.find((m) => m.name === 'styles').exports.map((e) => e.name);
  for (const n of ['defineStyle', 'styleById', 'styleIds', 'stylesOf', 'supports']) assert.ok(names.includes(n), n);
  assert.match(referenceMarkdown(api), /### Styles/);
});
