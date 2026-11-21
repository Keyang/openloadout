// Hue-keeping tones as colour rules (migration batch M4): engine/hue-tones.js gives the colours engine/icons-swatch.js
// hueRamp and iconHued gave, and engine/data-rules.js names them hueTone and hued, so the tool and material icons can
// be data. Held here colour for colour to the code they replace, and through paintColour and the validator.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hueTone, hued, lightness, HUE_TONES } from '../../engine/hue-tones.js';
import { paintColour, COLOUR_RULES } from '../../engine/data-rules.js';
import { PALETTE } from '../../engine/palettes.js';

const COLOURS = [...new Set(Object.values(PALETTE).flatMap((p) => Object.values(p)).filter((c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)))];

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
