// Hue-keeping tones as colour rules (migration batch M4): engine/hue-tones.js gives the colours engine/icons-swatch.js
// hueRamp and iconHued gave, and engine/data-rules.js names them hueTone and hued, so the tool and material icons can
// be data. Held here colour for colour to the code they replace, and through paintColour and the validator.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hueTone, hued, lightness, HUE_TONES } from '../../engine/hue-tones.js';
import { hueRamp, iconHued, lightness as oldLightness } from '../../engine/icons-swatch.js';
import { paintColour, COLOUR_RULES } from '../../engine/data-rules.js';
import { PALETTE } from '../../engine/palettes.js';

const COLOURS = [...new Set(Object.values(PALETTE).flatMap((p) => Object.values(p)).filter((c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)))];

test('hueTone gives every tone of hueRamp, and hued what iconHued gives, for every palette colour', () => {
  assert.ok(COLOURS.length > 40, `${COLOURS.length} colours`);
  for (const c of COLOURS) {
    const r = hueRamp(c);
    for (const t of HUE_TONES) assert.equal(hueTone(c, t), r[t], `${c} ${t}`);
    assert.equal(lightness(c), oldLightness(c));
  }
  for (let i = 0; i < COLOURS.length; i++) {
    const c = COLOURS[i], a = COLOURS[(i * 7 + 3) % COLOURS.length], b = COLOURS[(i * 13 + 5) % COLOURS.length];
    for (const gap of [12, 20, 22]) {
      assert.equal(hued(c, [a], gap), iconHued(c, [a], gap), `${c} against ${a} by ${gap}`);
      assert.equal(hued(c, [a, b], gap), iconHued(c, [a, b], gap), `${c} against ${a}, ${b} by ${gap}`);
    }
  }
});

test('the colour rules hueTone and hued work out as the code did, nested as the tools sprite nests them', () => {
  assert.ok(COLOUR_RULES.hueTone && COLOUR_RULES.hued);
  for (let i = 0; i < COLOURS.length; i += 3) {
    const metal = COLOURS[i], wood = COLOURS[(i + 11) % COLOURS.length], grip = COLOURS[(i + 17) % COLOURS.length];
    const v = { metal, wood, accent: grip };
    const metalOf = iconHued(metal, [wood], 12), gripOf = iconHued(grip, [metalOf], 20);
    const M = { rule: 'hued', of: 'metal', against: ['wood'], gap: 12 };
    assert.equal(paintColour(M, v), metalOf.toLowerCase());
    assert.equal(paintColour({ rule: 'hued', of: 'accent', against: [M], gap: 20 }, v), gripOf.toLowerCase());
    for (const t of HUE_TONES) assert.equal(paintColour({ rule: 'hueTone', of: M, tone: t }, v), hueRamp(metalOf)[t].toLowerCase(), `${t} of ${metalOf}`);
  }
});

test('a sprite may name them: the validator takes hueTone and hued in a palette rule and in a paint', async () => {
  const { validateSprite } = await import('../../catalog/sprite-schema.js');
  const def = {
    format: 'loadout-sprite', version: 2, id: 'hue-test', name: 'Hue test', size: [16, 16], pivot: [8, 8],
    meta: { type: 'icon', role: 'items/icon', themes: ['neutral'], gameTypes: ['arcade'], view: 'none', words: ['test'], license: 'draft' },
    palette: [
      { id: 'metal', label: 'Metal', default: '#c2c9d6', material: 'metal', swatches: ['#c2c9d6', '#f2c230'] },
      { id: 'wood', label: 'Wood', default: '#9a6a3e', material: 'wood', swatches: ['#9a6a3e', '#5a3a24'] },
      { id: 'metal-hued', material: 'metal', derive: { rule: 'hued', of: 'metal', against: ['wood'], gap: 12 } },
    ],
    body: { kind: 'pictures', pictures: { a: { label: 'A', draw: [
      { kind: 'rect', at: [2, 2], size: [12, 12], paint: 'metal-hued' },
      { kind: 'rect', at: [4, 4], size: [4, 4], paint: { rule: 'hueTone', of: 'metal-hued', tone: 'deep' } },
    ] } } },
    clips: { a: { frames: 1, fps: 1 } },
  };
  const r = validateSprite(def);
  assert.ok(!r.errors.some((e) => /hueTone|hued|colour rule/.test(e)), r.errors.join('; '));
});
