// The faceTone colour rule (engine/data-rules.js COLOUR_RULES; migration batch M3, review round 1 issue 2): the colours of
// a solid lit from above as engine/solids.js faceRamps gives them, the top face a step lighter than the wall, or, for a
// colour too pale to go a step lighter, the top in the colour itself and the wall a step darker. The code props drew
// their solids with faceRamps; their data redraws (chest.topdown@1, cache@1, supply.crate@1, fuel.barrel@1 through
// engine/gen/world-props.js extrudeOn) name this rule, so a pale lid keeps its shading under every colour, swatch or not.
import test from 'node:test';
import assert from 'node:assert/strict';
import { COLOUR_RULES, paintColour } from '../../engine/data-rules.js';
import { faceRamps } from '../../engine/solids.js';
import { tone } from '../../engine/color.js';
import { ROOT, loadDataSprite } from '../../tools/lib/assets.mjs';
import { validateSprite } from '../../catalog/sprite-schema.js';
import { cleanParams, renderFrame } from '../../engine/sprite.js';
import path from 'node:path';

// pale colours (the fallback) and ordinary ones: the metal swatches of chest-topdown, cream, white, black, a few others
const COLOURS = ['#c2c9d6', '#f2c230', '#a8a4a0', '#e6c545', '#f0ead8', '#ffffff', '#000000', '#9a6a3e', '#3f6fd1', '#e8e0d5', '#5d6475'];
const TONES = ['light', 'base', 'dark', 'deep'];

test('faceTone is a documented colour rule taking a colour, a face and a tone', () => {
  const r = COLOUR_RULES.faceTone;
  assert.ok(r && Object.isFrozen(r) && r.about.length > 10);
  assert.deepEqual(Object.keys(r.args).sort(), ['face', 'of', 'tone']);
  assert.equal(r.args.of.kind, 'colour');
  assert.deepEqual([...r.args.face.values], ['top', 'wall']);
  assert.deepEqual([...r.args.tone.values], TONES);
});

test('faceTone gives exactly engine/solids.js faceRamps, the pale fallback included', () => {
  let pale = 0;
  for (const c of COLOURS) {
    const R = faceRamps(c);
    if (R.top.base === c) pale++;
    for (const t of TONES) {
      assert.equal(paintColour({ rule: 'faceTone', of: c, face: 'wall', tone: t }), R.wall[t].toLowerCase(), `${c} wall ${t}`);
      assert.equal(paintColour({ rule: 'faceTone', of: c, face: 'top', tone: t }), (R.top[t] ?? R.top.dark).toLowerCase(), `${c} top ${t}`);
    }
  }
  assert.ok(pale >= 3, 'the list holds pale colours, which take the fallback');
  // nested: the colour may itself be a rule
  assert.equal(paintColour({ rule: 'faceTone', of: { rule: 'tone', of: '#c2c9d6', by: 0.2 }, face: 'top', tone: 'base' }), faceRamps(tone('#c2c9d6', 0.2)).top.base.toLowerCase());
});

test('a definition may name faceTone; a wrong face or tone is refused', () => {
  const def = (paint) => ({ format: 'loadout-sprite', version: 2, id: 'face-probe', name: 'Face probe', size: [8, 8], pivot: [4, 8],
    palette: [{ id: 'body', label: 'Body', default: '#c2c9d6', material: 'metal' }, { id: 'top', material: 'metal', derive: paint }],
    controls: [{ key: 'body', kind: 'colour', label: 'Body' }],
    body: { pictures: { draw: [{ kind: 'rect', at: [1, 1], size: [6, 3], paint: 'top' }, { kind: 'rect', at: [1, 4], size: [6, 3], paint: 'body' }, { kind: 'outline', paint: 'ink' }] } },
    clips: { idle: { frames: 1, fps: 8 } } });
  const ok = validateSprite(def({ rule: 'faceTone', of: 'body', face: 'top', tone: 'base' }));
  assert.ok(ok.ok, ok.errors?.join('; '));
  const bad = validateSprite(def({ rule: 'faceTone', of: 'body', face: 'side', tone: 'base' }));
  assert.ok(!bad.ok && /face must be one of/.test(bad.errors.join(' ')), bad.errors?.join('; '));
});

test('chest-topdown: a pale metal swatch keeps the shaded lid of the code sprite with the iron and royal styles', async () => {
  const s = await loadDataSprite(ROOT, path.join(ROOT, 'sprites', 'chest-topdown.json'));
  const hexes = (g) => new Set([...g.data].filter((v) => v >>> 24).map((v) => `#${[v & 255, (v >> 8) & 255, (v >> 16) & 255].map((n) => n.toString(16).padStart(2, '0')).join('')}`));
  for (const style of ['iron', 'royal']) {
    const p = cleanParams(s, { style, metal: '#c2c9d6' });
    const used = hexes(renderFrame(s, 'closed', 0, p));
    const R = faceRamps('#c2c9d6');
    assert.equal(R.top.base, '#c2c9d6', 'the swatch is pale: faceRamps keeps the top in the colour itself');
    assert.ok(used.has(R.top.base.toLowerCase()), `${style}: the lid's top face is the colour itself, as the code drew it`);
    // the fallback's own tones (the top's light a step above the colour, the wall a step below it), which no other rule gives
    assert.ok(used.has(R.top.light.toLowerCase()) && used.has(R.wall.base.toLowerCase()), `${style}: the fallback's top light and wall`);
    assert.ok(!used.has(tone(tone('#c2c9d6', 0.85), 0.8).toLowerCase()), `${style}: never the near-white top the review saw`);
  }
});
