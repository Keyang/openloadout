// What the editing panel shows (app/panel-model.js): every control of a sprite, a sound or a track, sorted into the
// Fine-tune tabs, with what is changed and what is in effect. No page here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spriteModel, soundModel, SPRITE_TABS } from '../../app/panel-model.js';
import { defaultParams, inEffect } from '../../engine/sprite.js';
import knight from '../../sprites/knight.js';

const start = (sprite) => ({ params: defaultParams(sprite), cues: {}, scale: 1 });

test('the Hero: build in Shape, what it holds and wears in Parts, colours in Colours, movement in Motion', () => {
  const m = spriteModel(knight);
  const tab = Object.fromEntries(m.controls(start(knight)).map((c) => [c.key, c.tab]));
  assert.equal(tab.height, 'shape');
  assert.equal(tab.weapon, 'parts');
  assert.equal(tab.weaponLength, 'parts');
  assert.equal(tab.hairStyle, 'parts');
  assert.equal(tab.hair, 'colours', 'a part\'s colour is with the colours');
  assert.equal(tab.skin, 'colours');
  assert.equal(tab.speed, 'motion');
  assert.deepEqual(m.tabs.map((t) => t.id), ['shape', 'parts', 'colours', 'motion']);
  assert.deepEqual(SPRITE_TABS.map((t) => t.id), ['shape', 'parts', 'colours', 'motion', 'sounds', 'look']);
});

test('every control of every sprite lands in exactly one tab, and tabs with nothing in them are left out', async () => {
  const dir = new URL('../../sprites/', import.meta.url);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  assert.ok(files.length > 50);
  for (const f of files) {
    const sprite = (await import(new URL(f, dir))).default;
    const m = spriteModel(sprite);
    const list = m.controls(start(sprite));
    assert.deepEqual(list.map((c) => c.key).sort(), Object.keys(sprite.params).sort(), `${sprite.id}: every control once`);
    const used = new Set(list.map((c) => c.tab));
    assert.deepEqual(m.tabs.map((t) => t.id), SPRITE_TABS.map((t) => t.id).filter((id) => used.has(id)), `${sprite.id}: its tabs`);
    for (const c of list) assert.ok(['range', 'choice', 'toggle', 'color'].includes(c.kind), `${sprite.id}.${c.key}`);
  }
});

test('a control shows whether it is changed and whether it is in effect', () => {
  const m = spriteModel(knight);
  let s = start(knight);
  const of = (key) => m.controls(s).find((c) => c.key === key);
  assert.equal(of('weapon').changed, false);
  assert.equal(of('weaponLength').shown, inEffect(knight, 'weaponLength', s.params));
  s = m.set(s, 'weapon', 'none');
  assert.equal(of('weapon').changed, true);
  assert.equal(of('weaponLength').shown, false, 'a part\'s settings hide while the part is off');
  assert.equal(of('weapon').main, true, 'the control that picks the part leads its block');
  assert.equal(of('weapon').part, 'weapon');
  s = m.reset(s, 'weapon');
  assert.equal(of('weapon').changed, false);
  assert.equal(m.changedTabs(s).size, 0);
  s = m.set(s, 'skin', knight.params.skin.swatches[2]);
  assert.deepEqual([...m.changedTabs(s)], ['colours']);
});

test('a version sets every control; Surprise me leaves nothing hidden changed', () => {
  const m = spriteModel(knight);
  let s = m.set(start(knight), 'height', 1);
  s = m.applyVersion(s, { name: 'Axe', params: { weapon: 'axe' } });
  assert.equal(s.params.weapon, 'axe');
  assert.equal(s.params.height, defaultParams(knight).height, 'a version is a pick, not an addition');
  assert.equal(m.isVersion(s, { params: { weapon: 'axe' } }), true);
  assert.equal(m.isVersion(s, { params: { weapon: 'spear' } }), false);
  for (let seed = 1; seed < 20; seed++) {
    const r = m.surprise(start(knight), seed), d = defaultParams(knight);
    for (const k of Object.keys(r.params)) if (r.params[k] !== d[k]) assert.ok(inEffect(knight, k, r.params), `${k} is changed but hidden`);
  }
});

test('a sound and a track: their controls in Tone, Timing and Character; a style is a version', () => {
  const patch = JSON.parse(fs.readFileSync(new URL('../../sounds/battle-theme.json', import.meta.url), 'utf8'));
  const m = soundModel(patch);
  const d = Object.fromEntries(patch.params.map((p) => [p.id, p.default]));
  let s = { params: { ...d }, style: null };
  const list = m.controls(s);
  assert.deepEqual(list.map((c) => c.key), patch.params.map((p) => p.id));
  const by = Object.fromEntries(list.map((c) => [c.key, c]));
  assert.equal(by.bpm.tab, 'timing');
  assert.equal(by.bars.tab, 'timing');
  assert.equal(by.bars.kind, 'choice');
  assert.equal(by.inst.kind, 'choice');
  assert.deepEqual(by.inst.options.map((o) => o.label), patch.params.find((p) => p.id === 'inst').options);
  assert.equal(by.key.tab, 'tone');
  assert.equal(by.grit.tab, 'character');
  assert.equal(by.grit.kind, 'range');
  assert.ok(by.grit.min === 0 && by.grit.max === 1, 'a slider runs from 0 to 1 whatever the control measures');
  assert.equal(typeof by.grit.valueText, 'string');
  s = m.set(s, 'grit', 1);
  assert.equal(s.params.grit, patch.params.find((p) => p.id === 'grit').max);
  assert.equal(m.controls(s).find((c) => c.key === 'grit').changed, true);
  const style = Object.keys(patch.presets)[0];
  s = m.applyVersion(s, { name: style, style });
  assert.equal(s.style, style);
  assert.equal(s.params.grit, { ...d, ...patch.presets[style] }.grit);
  assert.equal(m.isVersion(s, { name: style, style }), true);
});
