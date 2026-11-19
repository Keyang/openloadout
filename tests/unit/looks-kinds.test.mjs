// A look must leave a thing what it is (docs/architecture.md, Contract 7), second round of faults found by review:
//   - keeping two tones apart must not turn one of them into another kind of colour (a wooden plank turned green);
//   - a colour control whose words say what it is of must be read that way, and one whose words name a thing that
//     can be made of different stuff (a door: wood or metal) must say which;
//   - two clearly different tones must stay apart under shades of grey too, also in crowded pictures;
//   - grass stays a meadow green and gold stays golden under a warm look.
// Sprites are found in the catalogue, never named here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultParams } from '../../engine/sprite.js';
import { spriteMaterials, lookColours, applyColour, namedMaterials, THEME_PRESETS, isOneColourLook } from '../../engine/theme.js';
import { controlMaterial, oklch, hueTurn, colourGap, materialById, UNSAID_WORDS, unsaidMaterial } from '../../engine/materials.js';
import { lookFaults, checkedLooks, checkSprite, THRESHOLDS } from '../../quality/sprite.js';
import { defineSprite, color } from '../../engine/sprite.js';
import { loadSprites } from '../../tools/lib/assets.mjs';

const sprites = (await loadSprites()).map((s) => s.def);
const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hexOf = (rgb) => '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('');
const LOOKS = checkedLooks();
const plainOf = (rgb, colour) => { const px = new Uint8ClampedArray([...rgb, 255]); applyColour(px, colour); return [px[0], px[1], px[2]]; };
const tables = new Map(sprites.map((s) => [s.id, spriteMaterials(s, defaultParams(s))]));

// ---- keeping tones apart keeps their kind ------------------------------------------------------------------------

/** The look's colours for a table before any two tones are kept apart: the same table with every colour too rare to be kept apart. */
const heldOnly = (table) => ({ ...table, colours: new Map([...table.colours].map(([v, e]) => [v, { ...e, n: 1 }])), looks: new Map() });

test('keeping tones apart never splits the shades of one colour into two kinds of colour', () => {
  // Two shades of one control (planks of one door) that the look makes one family of colour must stay one family once
  // tones are kept apart: one lighter or darker than the other, never one of them another hue.
  const bad = [];
  for (const s of sprites) {
    const table = tables.get(s.id), held = heldOnly(table);
    const cols = [...table.colours].filter(([, e]) => e.control && e.n >= Math.max(2, table.total * THRESHOLDS.toneShare)).map(([v, e]) => ({ rgb: [v >>> 16, (v >>> 8) & 255, v & 255], ...e }));
    for (const look of LOOKS) {
      const lk = lookColours(table, look.colour), before = lookColours(held, look.colour);
      if (!lk || lk.one) continue;
      for (let i = 0; i < cols.length; i++) for (let j = i + 1; j < cols.length; j++) {
        const a = cols[i], b = cols[j];
        if (a.control !== b.control) continue;
        const pa = oklch(...before.of(...a.rgb)), pb = oklch(...before.of(...b.rgb));
        if (pa.C < 0.04 || pb.C < 0.04 || Math.abs(hueTurn(pa.h, pb.h)) > 25) continue;
        const ta = lk.of(...a.rgb), tb = lk.of(...b.rgb), xa = oklch(...ta), xb = oklch(...tb);
        if (xa.C < 0.04 || xb.C < 0.04) continue;
        const d = Math.abs(hueTurn(xa.h, xb.h));
        if (d > 40) bad.push(`${s.id} / ${look.name}: the "${a.control}" shades ${hexOf(a.rgb)} and ${hexOf(b.rgb)} became ${hexOf(ta)} and ${hexOf(tb)}, ${Math.round(d)} degrees apart`);
      }
    }
  }
  assert.deepEqual(bad.slice(0, 12), [], `${bad.length} shade pairs split`);
});

// ---- what a colour is of, from its words --------------------------------------------------------------------------

test('words that say what a colour is of: hearts carry a meaning, hide, feathers and bellies are skin, bone is like stone, roofs are earth, jewels are magic', () => {
  const pickup = { meta: { type: 'pickup' } }, creature = { meta: { type: 'creature' } }, prop = { meta: { type: 'prop' } };
  assert.equal(controlMaterial('body', { label: 'Heart' }, pickup), 'signal');
  assert.equal(controlMaterial('body', { label: 'Hide' }, creature), 'skin');
  assert.equal(controlMaterial('body', { label: 'Feathers' }, creature), 'skin');
  assert.equal(controlMaterial('belly', { label: 'Belly and markings' }, creature), 'skin');
  assert.equal(controlMaterial('body', { label: 'Bone' }, creature), 'stone');
  assert.equal(controlMaterial('roofColour', { label: 'Roof colour' }, prop), 'earth');
  assert.equal(controlMaterial('accent', { label: 'Jewel' }, pickup), 'magic');
  assert.equal(controlMaterial('accent', { label: 'Apron' }, creature), 'cloth');
});

test('a colour named after a thing that can be made of different stuff (a door, a liquid) must say what it is of', () => {
  assert.ok(UNSAID_WORDS.length >= 2);
  const door = { meta: { type: 'prop' } };
  assert.equal(unsaidMaterial('body', { label: 'Door' }, door), 'door');
  assert.equal(unsaidMaterial('body', { label: 'Door', material: 'wood' }, door), null);
  assert.equal(unsaidMaterial('body', { label: 'Walls' }, door), null);
  // the quality bar says so
  const s = defineSprite({
    id: 'unsaid-door', name: 'Unsaid door', size: [8, 8], pivot: [4, 7],
    params: { body: color('Door', '#9a6a3e', ['#9a6a3e', '#5a5f7a']) },
    clips: { idle: { frames: 1, fps: 1 } }, meta: { type: 'prop' },
    render(g, { p }) { g.rect(1, 1, 6, 7, p.body); },
  });
  assert.ok(checkSprite(s).warnings.some((w) => /"Door" colour/.test(w) && /material:/.test(w)), 'warned');
  // and no sprite in the catalogue leaves one unsaid
  const unsaid = [];
  for (const sp of sprites) for (const [k, d] of Object.entries(sp.params)) if (d.kind === 'color' && unsaidMaterial(k, d, sp)) unsaid.push(`${sp.id}.${k} (${d.label})`);
  assert.deepEqual(unsaid, []);
});

test('a pickup whose colour says what it gives keeps that colour under every look', () => {
  // every catalogue pickup's colours that carry a meaning ('signal'), found by their control's material
  let seen = 0;
  for (const s of sprites.filter((x) => x.meta?.type === 'pickup')) {
    const table = tables.get(s.id);
    for (const [v, e] of table.colours) {
      if (e.material !== 'signal' || e.n < Math.max(2, table.total * 0.05)) continue;
      const rgb = [v >>> 16, (v >>> 8) & 255, v & 255], m = oklch(...rgb);
      if (m.C < 0.06) continue;
      seen++;
      for (const look of LOOKS) {
        const lk = lookColours(table, look.colour), to = lk?.of(...rgb) ?? rgb, t = oklch(...to);
        // a red heart stays red, not rust or brown: little turn of hue, and most of its strength (a little less under shades of grey)
        assert.ok(Math.abs(hueTurn(m.h, t.h)) <= 16 && t.C >= m.C * (lk?.one ? 0.7 : 0.8), `${s.id} / ${look.name}: ${hexOf(rgb)} became ${hexOf(to)} (hue turned ${Math.round(hueTurn(m.h, t.h))}, strength ${t.C.toFixed(3)} of ${m.C.toFixed(3)})`);
      }
    }
  }
  assert.ok(seen >= 2, `found ${seen} meaning-carrying pickup colours`);
});

// ---- tones under shades of grey ---------------------------------------------------------------------------------------

test('every sprite in the catalogue: two clearly different tones never end up as one, under any measured look (grey ones included)', () => {
  const merged = [];
  for (const s of sprites) for (const f of lookFaults(tables.get(s.id)).merged) merged.push(`${s.id} / ${f.look.name}: ${f.a} and ${f.b} -> ${f.after.toFixed(3)} apart`);
  assert.deepEqual(merged.slice(0, 12), [], `${merged.length} pairs merged`);
});

test('under shades of grey, tones keep their order of lightness where it was clear, and no tone is pushed far from where the look put it', () => {
  const mono = THEME_PRESETS.filter((p) => isOneColourLook(p.theme.colour));
  assert.ok(mono.length >= 1);
  const bad = [];
  for (const s of sprites) {
    const table = tables.get(s.id);
    const cols = [...table.colours].filter(([, e]) => e.n >= Math.max(2, table.total * THRESHOLDS.toneShare)).map(([v, e]) => ({ rgb: [v >>> 16, (v >>> 8) & 255, v & 255], ...e }));
    for (const p of mono) {
      const lk = lookColours(table, p.theme.colour);
      for (const c of cols) {
        if (materialById(c.material).keeps) continue;
        const want = oklch(...plainOf(c.rgb, p.theme.colour)).L, got = oklch(...lk.of(...c.rgb)).L;
        if (Math.abs(got - want) > 0.2) bad.push(`${s.id} / ${p.name}: ${hexOf(c.rgb)} was to be ${want.toFixed(2)} light and is ${got.toFixed(2)}`);
      }
    }
  }
  assert.deepEqual(bad.slice(0, 12), [], `${bad.length} tones pushed far`);
});

// ---- meadow green and gold under a warm look ----------------------------------------------------------------------------

test('a meadow green stays a meadow green, not olive, under every look with colours', () => {
  const table = namedMaterials({ grass: '#7fbf5a', grassLight: '#c1e78a' });
  const made = oklch(...rgbOf('#7fbf5a'));
  for (const look of LOOKS) {
    const lk = lookColours(table, look.colour);
    if (!lk || lk.one) continue;
    const to = lk.of(...rgbOf('#7fbf5a')), t = oklch(...to);
    assert.ok(t.h >= made.h - 14 && t.C >= made.C * 0.7, `${look.name}: grass ${hexOf(to)} (hue ${t.h.toFixed(0)}, strength ${t.C.toFixed(3)})`);
  }
});

test('gold stays golden: under every look with colours a gold coin turns at most 16 degrees toward orange', () => {
  const table = namedMaterials({ coinMetal: '#f2c230', coinShade: '#eaae23' });
  for (const look of LOOKS) {
    const lk = lookColours(table, look.colour);
    if (!lk || lk.one) continue;
    for (const h of ['#f2c230', '#eaae23']) {
      const m = oklch(...rgbOf(h)), to = lk.of(...rgbOf(h)), t = oklch(...to);
      assert.ok(Math.abs(hueTurn(m.h, t.h)) <= 16, `${look.name}: ${h} became ${hexOf(to)}, turned ${Math.round(hueTurn(m.h, t.h))}`);
    }
  }
});

test('the bands of a night sky stay bands: neighbouring tones a little apart do not become one', () => {
  const table = namedMaterials({ sky: '#2e3653', skyLow: '#222944', skyDeep: '#191f39' });
  for (const e of table.colours.values()) e.n = 15000;
  for (const look of LOOKS) {
    const lk = lookColours(table, look.colour);
    if (!lk) continue;
    for (const [x, y] of [['#2e3653', '#222944'], ['#222944', '#191f39']]) {
      const made = colourGap(rgbOf(x), rgbOf(y)), a = lk.of(...rgbOf(x)), b = lk.of(...rgbOf(y));
      assert.ok(colourGap(a, b) >= Math.min(0.02, made / 2), `${look.name}: ${x} and ${y} became ${hexOf(a)} and ${hexOf(b)} (${colourGap(a, b).toFixed(3)} apart, made ${made.toFixed(3)})`);
    }
  }
});
