// The settings resolver (engine/resolve.js, B4): the palette at a person's settings (colour settings, detail slots,
// derived slots through engine/data-rules.js colour rules), paint refs and colour rules to colours, and the material
// table of Contract 7 read from the data (docs/data-sprites.md 2.8).
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePalette, paintHex, materialTable, resolveSprite, defaultSettings, expandFrame } from '../../engine/resolve.js';
import { tone, ramp, farRamp, mix, INK, hexToRgb } from '../../engine/color.js';
import { validated, testPieces, leftovers } from '../fixtures/resolve/helpers.mjs';
import { stubRegistry } from '../fixtures/v2/registry.mjs';
import { renderList } from '../../engine/draw-list.js';

const store = testPieces();
const knight = validated('knight', store);
const P = (o = {}) => ({ ...defaultSettings(knight), ...o });

test('slots take the person\'s colour, detail slots their default, derived slots their rule', () => {
  const pal = resolvePalette(knight, P({ outfit: '#c9423a' }));
  assert.equal(pal.outfit.hex, '#c9423a');
  assert.equal(pal.eye.hex, '#231b33');
  assert.equal(pal.eye.detail, true);
  assert.equal(pal.trousers.hex, tone('#c9423a', -0.6), 'trousers are a tone of the tunic');
  assert.equal(pal.trousers.derived, true);
  assert.equal(pal.trousers.material, 'cloth');
  assert.equal(pal.skin.material, 'skin');
});

test('a derived slot with no material takes its source\'s; rules chain in order of need', () => {
  const def = { format: 'loadout-sprite', version: 2, meta: { type: 'prop' },
    palette: [ { id: 'a', label: 'A', default: '#336699', material: 'metal' },
               { id: 'c', derive: { rule: 'mix', of: 'b', with: 'a', amount: 0.5 } },
               { id: 'b', derive: { rule: 'ramp', of: 'a', tone: 'light' } } ], controls: [] };
  const pal = resolvePalette(def, { a: '#336699' });
  assert.equal(pal.b.hex, ramp('#336699').light);
  assert.equal(pal.c.hex, mix(ramp('#336699').light, '#336699', 0.5));
  assert.equal(pal.b.material, 'metal');
  assert.equal(pal.c.material, 'metal');
});

test('paint refs: slot, tones, far, ink; colour rules over refs; choose reads the settings', () => {
  const p = P();
  const pal = resolvePalette(knight, p);
  assert.equal(paintHex('outfit', pal, p), '#3a6ea5');
  assert.equal(paintHex('outfit.base', pal, p), '#3a6ea5');
  assert.equal(paintHex('outfit.dark', pal, p), ramp('#3a6ea5').dark);
  assert.equal(paintHex('outfit.light', pal, p), ramp('#3a6ea5').light);
  assert.equal(paintHex('outfit.far', pal, p), farRamp('#3a6ea5').base);
  assert.equal(paintHex('ink', pal, p), INK.toLowerCase());
  assert.equal(paintHex({ rule: 'tone', of: 'metal.dark', by: 0.5 }, pal, p), tone(ramp('#b8c4cc').dark, 0.5));
  const choose = { rule: 'choose', when: { headgear: ['helmet'] }, then: 'metal', else: 'outfit' };
  assert.equal(paintHex(choose, pal, p), '#b8c4cc');
  assert.equal(paintHex(choose, pal, P({ headgear: 'crown' })), '#3a6ea5');
  assert.equal(paintHex('nowhere', pal, p), null);
  assert.equal(paintHex('clear', pal, p), null, 'clear is not a colour');
});

test('materials come from the slots; the rest from the sprite\'s type or materials.rest', () => {
  const r = resolveSprite(knight, {}, { pieces: store, generators: stubRegistry(), validated: true });
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.equal(r.materials.slots.outfit, 'cloth');
  assert.equal(r.materials.slots.trousers, 'cloth');
  assert.equal(r.materials.rest, 'paint');
  const t = materialTable(r);
  assert.equal(t.rest, 'paint');
  assert.ok(t.colours instanceof Map && t.looks instanceof Map);
  const [cr, cg, cb] = hexToRgb('#3a6ea5');
  const e = t.colours.get((cr << 16) | (cg << 8) | cb);
  assert.equal(e.material, 'cloth');
  assert.equal(e.control, 'outfit');
  const dark = hexToRgb(ramp('#3a6ea5').dark);
  assert.equal(t.colours.get((dark[0] << 16) | (dark[1] << 8) | dark[2]).material, 'cloth', 'its tones too');
  const fx = resolveSprite(validated('hit-spark'), {}, { generators: stubRegistry(), validated: true });
  assert.equal(fx.materials.rest, 'light', 'an effect\'s other colours are light (engine/materials.js restMaterial)');
});

test('a piece slot coloured by its default joins the palette with its own material', () => {
  const r = resolveSprite(knight, { headgear: 'helmet' }, { pieces: store, generators: stubRegistry(), validated: true });
  const grip = Object.entries(r.palette).find(([, s]) => s.piece === 'held:sword@1' && s.slot === 'grip');
  assert.ok(grip, 'the sword\'s grip (a default, no palette slot) is in the palette');
  assert.equal(grip[1].hex, '#5a3a22');
  assert.equal(grip[1].material, 'wood');
  assert.equal(r.materials.slots[grip[0]], 'wood');
  assert.equal(Object.values(r.palette).some((s) => s.piece === 'part:helmet-plumed@1'), false, 'a slot mapped to a palette slot is that slot, not a new one');
  const none = resolveSprite(knight, { weapon: 'none' }, { pieces: store, generators: stubRegistry(), validated: true });
  assert.equal(Object.values(none.palette).some((s) => s.piece === 'held:sword@1'), false, 'a piece that is off brings no colour');
});

test('a pick whose option is a colour rule with a bound number: the binding inside is worked out too', () => {
  const def = { format: 'loadout-sprite', version: 2, id: 'thing', name: 'Thing', blurb: 'A thing for tests.', size: [32, 32], pivot: [16, 30],
    meta: { type: 'prop', role: 'world/prop', view: 'side', themes: ['neutral'], gameTypes: ['platformer'], words: ['thing'], license: 'draft' },
    palette: [ { id: 'hair', label: 'Moss', default: '#4f9d57', material: 'plant' }, { id: 'wood', label: 'Wood', default: '#8a5a2a', material: 'wood' } ],
    controls: [ { key: 'tall', kind: 'range', label: 'Tall', default: 0.5 }, { key: 'look', kind: 'choice', label: 'Look', options: ['plain', 'mossy'], default: 'mossy' } ],
    body: { pictures: { nodes: [{ id: 'top', parent: null, at: [16, 16] }], draw: [
      { id: 'a', kind: 'rect', on: 'top', at: [0, 0], size: [4, 4],
        paint: { from: 'look', pick: { plain: 'wood', mossy: { rule: 'tone', of: 'hair', by: { from: 'tall', map: [[0, 0], [1, -1]] } } } } } ] } },
    clips: { idle: { frames: 1, fps: 1 } } };
  // B1 refuses a size chosen by a pick, so this one runs past the check: whatever is picked is worked out all the same.
  const withB = JSON.parse(JSON.stringify(def));
  withB.body.pictures.draw.push({ id: 'b', kind: 'rect', on: 'top', at: [0, 5], size: { from: 'look', pick: { plain: [1, 1], mossy: [{ from: 'tall', map: [[0, 2], [1, 6]], round: 'px' }, 1] } }, paint: 'wood' });
  const keys = ['tall', 'look'];
  for (const [tall, by] of [[1, -1], [0.5, -0.5], [0, 0]]) {
    const r = resolveSprite(def, { tall }, { pieces: store, generators: stubRegistry() });
    assert.equal(r.ok, true, r.errors.join('; '));
    assert.deepEqual(leftovers(r.body, keys), [], 'no binding left inside the picked value');
    const a = r.body.pictures.draw.find((s) => s.id === 'a');
    // the picked rule is worked out to a palette slot of its own (Contract 15 rule 9: every paint is a slot with a material)
    assert.equal(typeof a.paint, 'string', 'a picked colour rule becomes a slot');
    assert.equal(r.palette[a.paint].hex, tone('#4f9d57', by), `tall ${tall}: tone by ${by}`);
    assert.equal(r.palette[a.paint].material, 'plant', 'the slot takes the material of the slot the rule reads');
    const out = expandFrame(r, r.body.pictures.draw.filter((s) => s.id === 'a').map(({ on, ...s }) => s), { clip: 'idle' });
    assert.equal(out.ok, true, out.errors.join('; '));
    assert.equal(out.palette[out.primitives[0].paint].hex, tone('#4f9d57', by), `tall ${tall}: tone by ${by}`);
  }
  const big = resolveSprite(withB, { tall: 1 }, { pieces: store, generators: stubRegistry(), validated: true });
  assert.deepEqual(leftovers(big.body, keys), []);
  assert.deepEqual(big.body.pictures.draw.find((s) => s.id === 'b').size, [6, 1], 'a picked list with a table in it');
  const plain = resolveSprite(withB, { tall: 1, look: 'plain' }, { pieces: store, generators: stubRegistry(), validated: true });
  assert.equal(plain.body.pictures.draw.find((s) => s.id === 'a').paint, 'wood');
  assert.deepEqual(plain.body.pictures.draw.find((s) => s.id === 'b').size, [1, 1]);
});

// ---- a shape painted with a colour rule is painted with a slot (review of B4, round 2) ------------------------------

const ruleThing = (paint, extra = []) => ({ format: 'loadout-sprite', version: 2, id: 'thing', name: 'Thing', blurb: 'A thing for tests.', size: [32, 32], pivot: [16, 30],
  meta: { type: 'prop', role: 'world/prop', view: 'side', themes: ['neutral'], gameTypes: ['platformer'], words: ['thing'], license: 'draft' },
  palette: [ { id: 'hair', label: 'Moss', default: '#4f9d57', material: 'plant' }, { id: 'wood', label: 'Wood', default: '#8a5a2a', material: 'wood' }, ...extra ],
  controls: [ { key: 'look', kind: 'choice', label: 'Look', options: ['plain', 'mossy'], default: 'mossy' } ],
  body: { pictures: { nodes: [{ id: 'top', parent: null, at: [16, 16] }], draw: [
    { id: 'ball', kind: 'ellipse', at: [16, 16], r: [9, 9], paint, shade: 1, light: 1 },
    { id: 'peg', kind: 'rect', at: [1, 1], size: [3, 3], paint: { from: 'look', pick: { plain: 'wood', mossy: 'hair' } } } ] } },
  clips: { idle: { frames: 1, fps: 1 } } });

const pixelsOf = (r) => {
  const out = expandFrame(r, r.body.pictures.draw, { clip: 'idle' });
  assert.equal(out.ok, true, out.errors.join('; '));
  const { g, skipped } = renderList(32, 32, out.primitives, { palette: out.palette });
  assert.deepEqual(skipped, []);
  const d = new Uint8Array(g.data.buffer), hexes = [];
  for (let i = 0; i < d.length; i += 4) hexes.push(d[i + 3] ? `#${[d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}` : null);
  return { out, hexes };
};

test('a shape painted with a colour rule (inline or picked) is shaded like a derived slot and has the source\'s material', () => {
  const rule = { rule: 'tone', of: 'hair', by: -0.5 };
  const h = tone('#4f9d57', -0.5);
  const asSlot = resolveSprite(ruleThing('g2', [{ id: 'g2', derive: rule }]), {}, { pieces: store, generators: stubRegistry(), validated: true });
  assert.equal(asSlot.ok, true, asSlot.errors.join('; '));
  const want = pixelsOf(asSlot).hexes;
  assert.ok(want.includes(ramp(h).dark) && want.includes(ramp(h).light), 'the derived slot is drawn with its ramp');
  const inline = ruleThing(rule);
  const picked = ruleThing({ from: 'look', pick: { plain: 'wood', mossy: rule } });
  for (const [name, def] of [['inline', inline], ['picked', picked]]) {
    const r = resolveSprite(def, {}, { pieces: store, generators: stubRegistry() });
    assert.equal(r.ok, true, `${name}: ${r.errors.join('; ')}`);
    const ball = r.body.pictures.draw.find((s) => s.id === 'ball');
    assert.equal(typeof ball.paint, 'string', `${name}: the rule is a slot of the palette`);
    const slot = r.palette[ball.paint];
    assert.equal(slot.hex, h);
    assert.equal(slot.material, 'plant', `${name}: the material of the slot the rule reads`);
    assert.equal(slot.derived, true);
    assert.equal(r.materials.slots[ball.paint], 'plant');
    const m = materialTable(r);
    for (const c of [h, ramp(h).light, ramp(h).dark]) {
      const [R, G, B] = hexToRgb(c);
      assert.equal(m.colours.get((R << 16) | (G << 8) | B)?.material, 'plant', `${name}: ${c} is listed as plant`);
    }
    const { out, hexes } = pixelsOf(r);
    assert.equal(out.palette[out.primitives[0].paint].hex, h);
    assert.deepEqual(hexes, want, `${name}: drawn pixel for pixel as the derived slot (rim light and shadow)`);
  }
  const plain = resolveSprite(picked, { look: 'plain' }, { pieces: store, generators: stubRegistry() });
  assert.equal(plain.body.pictures.draw.find((s) => s.id === 'ball').paint, 'wood', 'a slot picked stays that slot');
  assert.equal(Object.values(plain.palette).some((s) => s.rule), false, 'no rule, no slot added');
});

test('rule slots: one per colour and material, named after their source, capped; a rule this module cannot work out is magenta as before', () => {
  const two = ruleThing({ rule: 'mix', of: 'wood', with: 'hair', amount: 0.5 });
  two.body.pictures.draw.push({ id: 'twin', kind: 'rect', at: [6, 1], size: [3, 3], paint: { rule: 'mix', of: 'wood', with: 'hair', amount: 0.5 } });
  const r = resolveSprite(two, {}, { pieces: store, generators: stubRegistry() });
  assert.equal(r.ok, true, r.errors.join('; '));
  const [ball, twin] = ['ball', 'twin'].map((id) => r.body.pictures.draw.find((s) => s.id === id).paint);
  assert.equal(ball, twin, 'the same colour from the same source is one slot');
  assert.match(ball, /^wood-r\d+$/);
  assert.equal(r.palette[ball].material, 'wood', 'the first slot the rule reads');
  assert.equal(r.palette[ball].hex, mix('#8a5a2a', '#4f9d57', 0.5));
  const many = ruleThing('hair');
  for (let i = 0; i < 80; i++) many.body.pictures.draw.push({ kind: 'rect', at: [i % 30, 20], size: [1, 1], paint: { rule: 'tone', of: 'hair', by: -0.9 + i * 0.02 } });
  const capped = resolveSprite(many, {}, { pieces: store, generators: stubRegistry(), validated: true });
  assert.equal(capped.ok, false);
  assert.match(capped.errors.join(' '), /more than 64 colours/);
  const unknown = resolveSprite(ruleThing({ rule: 'sky.look', of: 'hair', time: 0.5 }), {}, { pieces: store, generators: stubRegistry(), validated: true });
  assert.equal(unknown.ok, true, unknown.errors.join('; '));
  assert.deepEqual(unknown.body.pictures.draw[0].paint, { rule: 'sky.look', of: 'hair', time: 0.5 }, 'left for the frame');
  const f = expandFrame(unknown, unknown.body.pictures.draw.slice(0, 1), { clip: 'idle' });
  assert.equal(f.ok, true, f.errors.join('; '));
  assert.equal(f.primitives[0].paint, '#ff00ff');
  assert.match(f.warnings.join(' '), /sky\.look/);
});

test('expandFrame: a colour rule left in a paint, a stamp key or band stops becomes a slot of the frame\'s palette', () => {
  const r = resolveSprite(ruleThing('hair'), {}, { pieces: store, generators: stubRegistry() });
  assert.equal(r.ok, true, r.errors.join('; '));
  const rule = { rule: 'tone', of: 'wood', by: -0.5 }, h = tone('#8a5a2a', -0.5);
  const list = [
    { kind: 'rect', at: [0, 0], size: [4, 4], paint: rule },
    { kind: 'stamp', at: [6, 0], rows: ['ab'], key: { a: rule, b: 'hair' } },
    { kind: 'bands', area: { kind: 'rect', at: [0, 10], size: [8, 8] }, dir: 'down', stops: [rule, 'hair'] } ];
  const out = expandFrame(r, list, { clip: 'idle' });
  assert.equal(out.ok, true, out.errors.join('; '));
  const [rect, stamp, bands] = out.primitives;
  assert.equal(typeof rect.paint, 'string');
  assert.equal(out.palette[rect.paint].hex, h);
  assert.equal(out.palette[rect.paint].material, 'wood');
  assert.equal(stamp.key.a, rect.paint, 'one slot for the same colour');
  assert.equal(stamp.key.b, 'hair');
  assert.deepEqual(bands.stops, [rect.paint, 'hair']);
  assert.equal(Object.hasOwn(r.palette, rect.paint), false, 'the resolved sprite is not changed');
  const { skipped } = renderList(32, 32, out.primitives, { palette: out.palette });
  assert.deepEqual(skipped, []);
});

test('expandFrame reuses the rule slots resolveSprite made: the same colour from a generator or a raw list is the same slot', () => {
  const rule = { rule: 'tone', of: 'hair', by: -0.5 };
  const r = resolveSprite(ruleThing(rule), {}, { pieces: store, generators: stubRegistry() });
  assert.equal(r.ok, true, r.errors.join('; '));
  const slot = r.body.pictures.draw.find((s) => s.id === 'ball').paint;
  const out = expandFrame(r, [{ kind: 'rect', at: [0, 0], size: [2, 2], paint: rule }], { clip: 'idle' });
  assert.equal(out.ok, true, out.errors.join('; '));
  assert.equal(out.primitives[0].paint, slot);
  assert.deepEqual(Object.keys(out.palette), Object.keys(r.palette), 'no second slot for the same colour');
});
