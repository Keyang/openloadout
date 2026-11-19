// A whole-bundle look may move hue, warmth and tone, but a thing must stay what it is (Contract 7).
// engine/materials.js says what a colour is of and how far a look may pull it; engine/theme.js finds each colour's
// material by drawing (spriteMaterials) and recolours with it (applyColour with a third argument, spriteLook,
// renderThemedFrame). Everything here is measured on colours, with this file's own arithmetic, under every named
// look the site has and a run of "Surprise me" looks: no look and no asset is named in an assertion.
// Run with: node --test tests/unit/looks-materials.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { ramp } from '../../engine/color.js';
import { defineSprite, color, range, choice, renderFrame, defaultParams } from '../../engine/sprite.js';
import {
  THEME_PRESETS, PALETTES, defaultTheme, normalizeTheme, randomTheme, applyColour, renderThemedFrame,
  spriteMaterials, lookColours, spriteLook, isOneColourLook, toneNeed, TONES,
} from '../../engine/theme.js';
import { MATERIALS, MATERIAL_IDS, materialById, controlMaterial, restMaterial, holdColour, outsideMaterial, oklch, fromOklch, colourGap, hueTurn } from '../../engine/materials.js';
import { loadSprites } from '../../tools/lib/assets.mjs';

const sprites = (await loadSprites()).map((s) => s.def);
const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hexOf = (rgb) => '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('');
const pixelOf = (g, x, y) => { const v = g.data[y * g.w + x]; return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255]; };

/** Every look tried: each named look that changes a colour, and 16 "Surprise me" looks. */
const LOOKS = [
  ...THEME_PRESETS.filter((p) => JSON.stringify(p.theme.colour) !== JSON.stringify(defaultTheme().colour)).map((p) => ({ name: p.name, theme: normalizeTheme(p.theme) })),
  ...Array.from({ length: 16 }, (_, i) => ({ name: `Surprise me ${i + 1}`, theme: normalizeTheme(randomTheme(i + 1)) })),
];
const MANY_COLOURS = LOOKS.filter((l) => !isOneColourLook(l.theme.colour));
const ONE_COLOUR = LOOKS.filter((l) => isOneColourLook(l.theme.colour));

// A small scene whose colours all come from controls: sky over ground, a pond, a face and a warning sign, each a
// flat block so a pixel can be read back. Blocks: sky 0..15 x 0..5, ground 0..15 x 6..9, water 0..7 x 10..15,
// skin 8..11 x 10..15, warning 12..15 x 10..15.
const scene = (over = {}) => defineSprite({
  id: 'look-scene', name: 'Look scene', size: [16, 16], pivot: [8, 15],
  params: {
    sky: color('Sky', '#8fd0f0', ['#8fd0f0', '#f0c8a0', '#2a3050']),
    land: color('Grass', '#6aa83e', ['#6aa83e', '#c9a06a', '#8f97a8']),
    water: color('Water', '#3f9fd1', ['#3f9fd1', '#2f8f9d', '#5a8fc0']),
    skin: color('Skin', '#e8b088', ['#f6d3b0', '#e8b088', '#6e4428']),
    sign: color('Warning paint', '#e2473f', ['#e2473f', '#f2c230', '#f0ead8']),
    ...over,
  },
  clips: { idle: { frames: 1, fps: 1 } },
  meta: { type: 'background' },
  render(g, { p }) {
    g.rect(0, 0, 16, 6, p.sky); g.rect(0, 6, 16, 4, p.land);
    g.rect(0, 10, 8, 6, p.water); g.rect(8, 10, 4, 6, p.skin); g.rect(12, 10, 4, 6, p.sign);
  },
});
const AT = { sky: [2, 2], land: [2, 7], water: [2, 12], skin: [9, 12], sign: [13, 12] };
const under = (sprite, theme, where, params = {}) => pixelOf(renderThemedFrame(sprite, 'idle', 0, params, theme), ...AT[where]);

// ---- what a colour is of ---------------------------------------------------------------------------------------

test('there is a material for each of sky, water, plants, earth, stone, metal, skin, cloth, fire, light, magic, interface and warnings, each with limits', () => {
  for (const id of ['sky', 'water', 'plant', 'earth', 'stone', 'metal', 'skin', 'cloth', 'fire', 'light', 'magic', 'interface', 'warning']) {
    const m = materialById(id);
    assert.ok(m, `no material "${id}"`);
    assert.ok(m.name && m.about, `${id} has no name or description`);
    assert.ok(m.light !== null || m.hue !== null, `${id} holds nothing`);
  }
  assert.equal(materialById('paint').hue, null, 'the material for "anything else" is free');
  assert.deepEqual(MATERIAL_IDS, MATERIALS.map((m) => m.id));
  assert.equal(new Set(MATERIAL_IDS).size, MATERIAL_IDS.length);
});

test('a colour control says what it is of: by its label, else by its key, else by what kind of sprite it is on', () => {
  const on = (type) => ({ meta: { type } });
  assert.equal(controlMaterial('sky', { label: 'Sky' }, on('background')), 'sky');
  assert.equal(controlMaterial('land', { label: 'Grass' }, on('background')), 'plant', 'the label says more than the key');
  assert.equal(controlMaterial('land', { label: 'Hills' }, on('background')), 'earth');
  assert.equal(controlMaterial('accent', { label: 'Warning paint' }, on('prop')), 'warning');
  assert.equal(controlMaterial('skin', { label: 'Colour' }, on('character')), 'skin', 'the key says it when the label does not');
  assert.equal(controlMaterial('body', { label: 'Health' }, on('ui')), 'signal', 'a meaning shown by colour in an interface piece');
  assert.equal(controlMaterial('body', { label: 'Health' }, on('character')), 'paint', 'the same word on a character says nothing');
  assert.equal(controlMaterial('face', { label: 'Face' }, on('ui')), 'interface');
  assert.equal(controlMaterial('edge', { label: 'Edge' }, on('effect')), 'light');
  assert.equal(controlMaterial('body', { label: 'Body' }, on('creature')), 'paint');
  assert.equal(controlMaterial('body', { label: 'Body' }, undefined), 'paint');
});

test('a control can declare its material, and a declared material wins', () => {
  const s = scene({ sign: color('Edge', '#e2473f', ['#e2473f', '#f2c230', '#f0ead8'], { material: 'warning' }) });
  assert.equal(s.params.sign.material, 'warning');
  assert.equal(controlMaterial('sign', s.params.sign, s), 'warning');
  assert.equal(controlMaterial('sky', { label: 'Sky', material: 'paint' }, s), 'paint');
});

test('a material that does not exist, or one on a control that is not a colour, is refused with the list of materials', () => {
  assert.throws(() => scene({ sign: color('Edge', '#e2473f', ['#e2473f', '#f2c230', '#f0ead8'], { material: 'cheese' }) }), /"cheese".*not a material.*sky/s);
  assert.throws(() => scene({ size: range('Size', 0.5, { material: 'sky' }) }), /material is for colour controls/);
  assert.throws(() => defineSprite({ ...scene(), id: 'x', materials: { rest: 'cheese' } }), /materials\.rest.*not a material/s);
});

test('colours no control paints take the rest material: by the kind of sprite, or what the sprite says', () => {
  assert.equal(restMaterial({ meta: { type: 'ui' } }), 'signal');
  assert.equal(restMaterial({ meta: { type: 'effect' } }), 'light');
  assert.equal(restMaterial({ meta: { type: 'character' } }), 'paint');
  assert.equal(restMaterial({ meta: { type: 'character' }, materials: { rest: 'stone' } }), 'stone');
  assert.equal(restMaterial(undefined), 'paint');
});

// ---- the colour maths --------------------------------------------------------------------------------------------

test('colours go to lightness, strength and hue and back', () => {
  for (const hex of ['#8fd0f0', '#6aa83e', '#e2473f', '#231b33', '#f0ead8', '#808080', '#000000', '#ffffff']) {
    const { L, C, h } = oklch(...rgbOf(hex));
    assert.deepEqual(fromOklch(L, C, h), rgbOf(hex), hex);
  }
  assert.ok(colourGap([0, 0, 0], [255, 255, 255]) > 0.99);
  assert.equal(colourGap([10, 20, 30], [10, 20, 30]), 0);
  assert.equal(hueTurn(350, 10), 20);
  assert.equal(hueTurn(10, 350), -20);
  assert.deepEqual(fromOklch(0.7, 0.9, 140).length, 3, 'a colour too strong to show is still a colour');
});

test('holdColour: a wish inside the limits is kept as it is; one outside is pulled back; "anything else" is never touched', () => {
  const sky = rgbOf('#8fd0f0'), brown = rgbOf('#9a7046'), nearby = rgbOf('#93c8e6');
  assert.equal(holdColour('paint', sky, brown), brown);
  assert.equal(holdColour('sky', sky, nearby), nearby, 'a wish inside the limits comes back unchanged (the same array)');
  const held = holdColour('sky', sky, brown);
  assert.notDeepEqual(held, brown);
  assert.equal(outsideMaterial('sky', sky, held), null, `held sky ${hexOf(held)} is inside the limits`);
  assert.match(outsideMaterial('sky', sky, brown), /sky/, 'the plain wish is outside, and the reason names the material');
  for (const m of MATERIALS) assert.equal(outsideMaterial(m.id, sky, sky), null, `${m.id}: a colour left alone is always inside`);
});

test('every material holds every colour inside its limits, whatever a look wishes', () => {
  const made = ['#8fd0f0', '#3f9fd1', '#6aa83e', '#7a4f33', '#8f97a8', '#c2c9d6', '#f2c230', '#e8b088', '#6e4428', '#e2473f', '#f0ead8', '#231b33', '#7a4fc4'].map(rgbOf);
  const wishes = ['#000000', '#ffffff', '#808080', '#9a7046', '#2f4a24', '#ff00ff', '#00ffff', '#f7bd6a', '#0c0c10', '#e4e4e8', '#5a8fc0'].map(rgbOf);
  for (const m of MATERIALS) for (const from of made) for (const wish of wishes) for (const oneColour of [false, true]) {
    const to = holdColour(m.id, from, wish, { oneColour });
    assert.equal(outsideMaterial(m.id, from, to, { oneColour }), null, `${m.id}: ${hexOf(from)} wished ${hexOf(wish)} became ${hexOf(to)}${oneColour ? ' (one-colour look)' : ''}`);
  }
});

// ---- a thing stays what it is ---------------------------------------------------------------------------------------

test('the looks tried include ones with many colours and ones with one colour', () => {
  assert.ok(MANY_COLOURS.length >= 10 && ONE_COLOUR.length >= 1, `${MANY_COLOURS.length} with many colours, ${ONE_COLOUR.length} with one`);
  for (const p of PALETTES) assert.equal(typeof isOneColourLook({ palette: p.name }), 'boolean');
  assert.equal(isOneColourLook({ saturation: 0 }), true);
  assert.equal(isOneColourLook({ palette: ['#101010', '#808080', '#f0f0f0'] }), true, 'greys only');
  assert.equal(isOneColourLook({ palette: ['#102040', '#c04020', '#f0f0f0'] }), false);
  assert.equal(isOneColourLook(defaultTheme().colour), false);
});

test('sky stays sky under every look with colours: a blue it was made in, lighter and cooler than the ground', () => {
  const s = scene();
  for (const { name, theme } of MANY_COLOURS) {
    const sky = oklch(...under(s, theme, 'sky')), made = oklch(...rgbOf('#8fd0f0')), land = oklch(...under(s, theme, 'land'));
    assert.ok(Math.abs(hueTurn(made.h, sky.h)) <= 45, `${name}: the sky's hue turned ${Math.round(hueTurn(made.h, sky.h))} degrees (${hexOf(under(s, theme, 'sky'))})`);
    assert.ok(sky.C >= made.C * 0.4, `${name}: the sky lost its colour (${hexOf(under(s, theme, 'sky'))})`);
    assert.ok(sky.L > land.L, `${name}: the sky is no longer lighter than the ground`);
    // cooler: further toward blue (a lower b in OKLab, which is C * sin(h))
    const b = (k) => k.C * Math.sin((k.h * Math.PI) / 180);
    assert.ok(b(sky) < b(land), `${name}: the sky is no longer cooler than the ground`);
  }
});

test('water stays blue-green and distinct from the land beside it under every look with colours', () => {
  const s = scene();
  for (const { name, theme } of MANY_COLOURS) {
    const water = under(s, theme, 'water'), land = under(s, theme, 'land'), w = oklch(...water);
    assert.ok(w.h >= 165 && w.h <= 285 && w.C >= 0.04, `${name}: water is ${hexOf(water)} (hue ${Math.round(w.h)}, strength ${w.C.toFixed(3)})`);
    assert.ok(colourGap(water, land) >= 0.08, `${name}: water ${hexOf(water)} and land ${hexOf(land)} are too alike`);
  }
});

test('skin stays the skin tone it was made in under every look with colours, for every skin tone a sprite offers', () => {
  const s = scene();
  for (const tone of s.params.skin.swatches) for (const { name, theme } of MANY_COLOURS) {
    const got = under(s, theme, 'skin', { skin: tone }), a = oklch(...rgbOf(tone)), b = oklch(...got);
    assert.ok(Math.abs(hueTurn(a.h, b.h)) <= 22, `${name}: skin ${tone} became ${hexOf(got)}, hue turned ${Math.round(hueTurn(a.h, b.h))} degrees`);
    assert.ok(Math.abs(a.L - b.L) <= 0.1, `${name}: skin ${tone} became ${hexOf(got)}, lightness moved ${(b.L - a.L).toFixed(2)}`);
    assert.ok(b.C >= a.C * 0.5, `${name}: skin ${tone} became ${hexOf(got)}, nearly grey`);
  }
});

test('grass stays a plant colour under every look with colours', () => {
  const s = scene();
  for (const { name, theme } of MANY_COLOURS) {
    const got = under(s, theme, 'land'), a = oklch(...rgbOf('#6aa83e')), b = oklch(...got);
    assert.ok(Math.abs(hueTurn(a.h, b.h)) <= 34 && b.C >= a.C * 0.45, `${name}: grass became ${hexOf(got)} (hue turned ${Math.round(hueTurn(a.h, b.h))}, strength ${b.C.toFixed(3)} of ${a.C.toFixed(3)})`);
  }
});

test('a warning colour keeps its hue and its strength under every look, one-colour looks included', () => {
  const s = scene();
  for (const { name, theme } of LOOKS) {
    const got = under(s, theme, 'sign'), a = oklch(...rgbOf('#e2473f')), b = oklch(...got);
    assert.ok(Math.abs(hueTurn(a.h, b.h)) <= 24, `${name}: the warning became ${hexOf(got)}, hue turned ${Math.round(hueTurn(a.h, b.h))} degrees`);
    assert.ok(b.C >= a.C * 0.5, `${name}: the warning became ${hexOf(got)}, strength ${b.C.toFixed(3)} of ${a.C.toFixed(3)}`);
    // and it still stands out from a plain mid grey, which is what it nearly became under a grey look
    assert.ok(colourGap(got, [128, 140, 150]) >= 0.12, `${name}: the warning ${hexOf(got)} hardly shows on grey`);
  }
});

test('a look still changes the picture: under every look that changes colours, something in the scene has moved', () => {
  const s = scene(), plain = renderFrame(s, 'idle', 0, defaultParams(s)).data;
  for (const { name, theme } of LOOKS) assert.notDeepEqual(renderThemedFrame(s, 'idle', 0, {}, theme).data, plain, `${name} changed nothing`);
});

// ---- two tones that were apart stay apart ----------------------------------------------------------------------------

test('two tones that differ only in hue stay clearly different under every look, shades of grey included', () => {
  // red and green of the same lightness, and a blue: what a row of colour-coded cells is made of
  const cells = defineSprite({
    id: 'look-cells', name: 'Look cells', size: [12, 4], pivot: [6, 3],
    params: { a: color('Body', '#d2534a', ['#d2534a', '#000000', '#ffffff']), b: color('Trim', '#4a9a4e', ['#4a9a4e', '#000000', '#ffffff']), c: color('Edge', '#5a7fd8', ['#5a7fd8', '#000000', '#ffffff']) },
    clips: { idle: { frames: 1, fps: 1 } }, meta: { type: 'prop' },
    render(g, { p }) { g.rect(0, 0, 4, 4, p.a); g.rect(4, 0, 4, 4, p.b); g.rect(8, 0, 4, 4, p.c); },
  });
  const made = [[1, 1], [5, 1], [9, 1]].map(([x, y]) => pixelOf(renderFrame(cells, 'idle', 0, defaultParams(cells)), x, y));
  assert.ok(Math.abs(oklch(...made[0]).L - oklch(...made[1]).L) < 0.03, 'the fixture: red and green are equally light');
  let plainMerges = 0;
  for (const { name, theme } of LOOKS) {
    const g = renderThemedFrame(cells, 'idle', 0, {}, theme);
    const now = [[1, 1], [5, 1], [9, 1]].map(([x, y]) => pixelOf(g, x, y));
    for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) {
      const before = colourGap(made[i], made[j]), after = colourGap(now[i], now[j]);
      assert.ok(after >= toneNeed(before) - 0.004, `${name}: ${hexOf(made[i])} and ${hexOf(made[j])} were ${before.toFixed(3)} apart and are ${after.toFixed(3)} (${hexOf(now[i])}, ${hexOf(now[j])}); ${toneNeed(before).toFixed(3)} needed`);
    }
    // the plain colour maths, which knows nothing of the sprite, does merge some of them: that is the fault this guards
    const plain = applyColour(Uint32Array.from(renderFrame(cells, 'idle', 0, defaultParams(cells)).data), theme.colour);
    if (plain[1] === plain[5]) plainMerges++;
  }
  assert.ok(plainMerges >= 1, 'the fixture is one the plain colour maths merges under some look');
});

test('toneNeed: tones that were not clearly different need nothing; clearly different ones need half their gap, up to a fixed amount', () => {
  assert.equal(toneNeed(TONES.APART - 0.001), 0);
  assert.equal(toneNeed(TONES.APART), Math.min(TONES.HELD, TONES.APART / 2));
  assert.equal(toneNeed(0.5), TONES.HELD);
});

test('the three tones of a colour stay three tones under every look', () => {
  const tones = defineSprite({
    id: 'look-tones', name: 'Look tones', size: [12, 4], pivot: [6, 3],
    params: { body: color('Body', '#c9423a', ['#c9423a', '#3f6fd1', '#4f9d57', '#e6c545', '#8f97a8']) },
    clips: { idle: { frames: 1, fps: 1 } }, meta: { type: 'prop' },
    render(g, { p }) { const r = ramp(p.body); g.rect(0, 0, 4, 4, r.dark); g.rect(4, 0, 4, 4, r.base); g.rect(8, 0, 4, 4, r.light); },
  });
  for (const body of tones.params.body.swatches) for (const { name, theme } of LOOKS) {
    const g = renderThemedFrame(tones, 'idle', 0, { body }, theme);
    const now = new Set([[1, 1], [5, 1], [9, 1]].map(([x, y]) => hexOf(pixelOf(g, x, y))));
    assert.equal(now.size, 3, `${name}: the three tones of ${body} became ${[...now].join(', ')}`);
  }
});

// ---- finding what each colour is of -----------------------------------------------------------------------------------

test('spriteMaterials: each colour takes the material of the control that paints it, a colour no control paints takes the rest', () => {
  const s = defineSprite({ ...scene(), id: 'look-scene-fixed', render(g, { p }) { g.rect(0, 0, 16, 6, p.sky); g.rect(0, 6, 16, 4, p.land); g.rect(0, 10, 16, 6, '#445566'); } });
  const table = spriteMaterials(s, {});
  const of = (hex) => table.colours.get(parseInt(hex.slice(1), 16));
  assert.deepEqual({ material: of('#8fd0f0').material, control: of('#8fd0f0').control }, { material: 'sky', control: 'sky' });
  assert.equal(of('#6aa83e').material, 'plant');
  assert.deepEqual({ material: of('#445566').material, control: of('#445566').control }, { material: 'paint', control: null });
  assert.equal(table.total, 256);
  assert.equal(of('#8fd0f0').n, 96);
  assert.equal(spriteMaterials(s, {}), table, 'kept: asking again gives the same table');
  assert.notEqual(spriteMaterials(s, { sky: '#2a3050' }), table, 'other settings, another table');
  assert.equal(spriteMaterials(s, { sky: '#2a3050' }).colours.get(0x2a3050).material, 'sky', 'the table follows the settings');
});

test('spriteMaterials: a colour mixed from two controls takes the material of the one that decides most of it', () => {
  const mix = (a, b, t) => hexOf(rgbOf(a).map((c, i) => Math.round(c + (rgbOf(b)[i] - c) * t)));
  const s = defineSprite({ ...scene(), id: 'look-scene-haze', render(g, { p }) { g.rect(0, 0, 16, 8, p.sky); g.rect(0, 8, 16, 8, mix(p.land, p.sky, 0.3)); } });
  const table = spriteMaterials(s, {});
  const hazy = parseInt(mix('#6aa83e', '#8fd0f0', 0.3).slice(1), 16);
  assert.equal(table.colours.get(hazy).material, 'plant', 'grass with a little sky in it is still grass');
});

test('spriteMaterials: a sprite drawn elsewhere (made on a visit) is not drawn here; its colours all take the rest material', () => {
  let drawn = 0;
  const s = defineSprite({ ...scene(), id: 'look-scene-made', render() { drawn++; } });
  s.made = true;
  const table = spriteMaterials(s, {});
  assert.equal(drawn, 0);
  assert.equal(table.colours.size, 0);
  const look = lookColours(table, THEME_PRESETS.find((p) => p.theme.colour.palette).theme.colour);
  assert.equal(look.of(143, 208, 240).length, 3, 'a colour it has never seen is still recoloured');
});

test('applyColour with materials: transparent pixels stay, alpha stays, the number of colours never rises, bytes and words agree', () => {
  const s = scene(), table = spriteMaterials(s, {});
  for (const { name, theme } of LOOKS) {
    const g = renderFrame(s, 'idle', 0, defaultParams(s));
    g.data[0] = 0;
    const words = applyColour(Uint32Array.from(g.data), theme.colour, table);
    assert.equal(words[0], 0, `${name}: a see-through pixel was painted`);
    assert.ok(new Set(words).size <= new Set(g.data).size, `${name}: more colours than before`);
    const bytes = applyColour(new Uint8ClampedArray(g.data.buffer.slice(0)), theme.colour, table);
    assert.deepEqual(new Uint32Array(bytes.buffer), words, `${name}: bytes and words differ`);
  }
  const g = renderFrame(s, 'idle', 0, defaultParams(s)), copy = g.data.slice();
  assert.equal(applyColour(g.data, defaultTheme().colour, table), g.data);
  assert.deepEqual(g.data, copy, 'the original look changes nothing');
});

test('applyColour without materials is the plain colour maths it always was', () => {
  const sky = Uint32Array.from([0xff000000 | (0xf0 << 16) | (0xd0 << 8) | 0x8f]);
  const forest = PALETTES.find((p) => p.name === THEME_PRESETS.find((x) => x.theme.colour.palette).theme.colour.palette);
  const out = applyColour(sky.slice(), { palette: forest.name });
  const hex = hexOf([out[0] & 255, (out[0] >>> 8) & 255, (out[0] >>> 16) & 255]);
  assert.ok(forest.colours.includes(hex), `a colour set with no materials snaps to the set: ${hex}`);
});

test('renderThemedFrame is renderFrame at the look\'s settings, recoloured with the sprite\'s materials', () => {
  const s = scene();
  for (const { name, theme } of LOOKS.slice(0, 8)) {
    const look = spriteLook(s, {}, theme);
    const g = renderFrame(s, 'idle', 0, look.params);
    look.recolour(g.data);
    assert.deepEqual(renderThemedFrame(s, 'idle', 0, {}, theme).data, g.data, name);
    const again = applyColour(renderFrame(s, 'idle', 0, look.params).data, theme.colour, spriteMaterials(s, look.params));
    assert.deepEqual(again, g.data, `${name}: applyColour with the sprite's materials`);
  }
});

// ---- the catalogue's own sprites ------------------------------------------------------------------------------------

test('every sprite in the catalogue: under every look, each colour stays inside its material\'s limits', () => {
  const bad = [];
  for (const s of sprites) {
    const table = spriteMaterials(s, {});
    for (const { name, theme } of LOOKS) {
      const look = lookColours(table, theme.colour);
      for (const [v, e] of table.colours) {
        const from = [v >>> 16, (v >>> 8) & 255, v & 255], to = look.of(...from);
        // the outline colour is swapped exactly for the look's outline, whatever it is of
        if (theme.colour.outline && hexOf(from) === '#231b33') continue;
        const why = outsideMaterial(e.material, from, to, { oneColour: look.one });
        if (why) bad.push(`${s.id} / ${name}: ${hexOf(from)} (${e.material}) became ${hexOf(to)}: ${why}`);
      }
    }
  }
  assert.deepEqual(bad.slice(0, 12), [], `${bad.length} colours left their limits`);
});

test('every sprite with a sky, water, plant or skin colour keeps it under every look with colours (measured on its own pictures)', () => {
  const HELD = { sky: 45, water: 40, plant: 40, skin: 22 };
  let checked = 0;
  for (const s of sprites) {
    const table = spriteMaterials(s, {});
    const mine = [...table.colours].filter(([, e]) => HELD[e.material] !== undefined && e.n >= 4);
    if (!mine.length) continue;
    for (const { name, theme } of MANY_COLOURS) {
      const look = lookColours(table, theme.colour);
      for (const [v, e] of mine) {
        const from = [v >>> 16, (v >>> 8) & 255, v & 255], a = oklch(...from);
        if (a.C < 0.05) continue;                      // a near grey (foam, cloud) has no hue to hold
        const b = oklch(...look.of(...from));
        checked++;
        assert.ok(b.C < 0.02 || Math.abs(hueTurn(a.h, b.h)) <= HELD[e.material], `${s.id} / ${name}: ${e.material} ${hexOf(from)} became ${hexOf(look.of(...from))}`);
        assert.ok(b.C >= a.C * 0.35, `${s.id} / ${name}: ${e.material} ${hexOf(from)} became ${hexOf(look.of(...from))}, nearly grey`);
      }
    }
  }
  assert.ok(checked > 0 || !sprites.length, 'the catalogue has sprites with a sky, water, plant or skin colour');
});

test('finding the materials of a sprite is quick enough to do when it is first shown, and free when asked again', () => {
  let worst = { ms: 0, id: null };
  for (const s of sprites.slice(0, 40)) {
    // settings not asked for before in this file: the first slider at its lowest
    const slider = Object.keys(s.params).find((k) => s.params[k].kind === 'range');
    const p = slider ? { [slider]: s.params[slider].min } : {};
    const t0 = performance.now();
    const table = spriteMaterials(s, p);
    const t1 = performance.now();
    assert.equal(spriteMaterials(s, p), table);
    assert.ok(performance.now() - t1 < 50, `${s.id}: asking again is not free`);
    if (t1 - t0 > worst.ms) worst = { ms: t1 - t0, id: s.id };
  }
  assert.ok(worst.ms < 4000, `${worst.id} took ${Math.round(worst.ms)} ms`);
});

// ---- pictures that are not one sprite ---------------------------------------------------------------------------------

test('namedMaterials: a scene\'s own named colours take the material their name says, and are held like a sprite\'s', async () => {
  const { namedMaterials } = await import('../../engine/theme.js');
  const table = namedMaterials({ sky: '#bfe6f7', skyLow: '#d3eef9', grassEdge: '#4f9d57', dirt: '#b07a50', wallTop: '#8a7fa8', outside: '#2d2646' });
  const of = (hex) => table.colours.get(parseInt(hex.slice(1), 16)).material;
  assert.deepEqual([of('#bfe6f7'), of('#d3eef9'), of('#4f9d57'), of('#b07a50'), of('#8a7fa8'), of('#2d2646')], ['sky', 'sky', 'plant', 'earth', 'stone', 'paint']);
  assert.equal(namedMaterials({ thing: '#2d2646' }, { rest: 'stone' }).colours.get(0x2d2646).material, 'stone');
  for (const { name, theme } of MANY_COLOURS) {
    const px = applyColour(Uint32Array.from([0xff000000 | (0xf7 << 16) | (0xe6 << 8) | 0xbf]), theme.colour, table);
    const got = [px[0] & 255, (px[0] >>> 8) & 255, (px[0] >>> 16) & 255], a = oklch(0xbf, 0xe6, 0xf7), b = oklch(...got);
    assert.ok(b.C < 0.02 || Math.abs(hueTurn(a.h, b.h)) <= 45, `${name}: the scene's sky became ${hexOf(got)}`);
  }
});

test('mergeMaterials: one table for a picture of several sprites; where two disagree, the one that draws more of the colour wins', async () => {
  const { mergeMaterials, namedMaterials } = await import('../../engine/theme.js');
  const a = namedMaterials({ sky: '#bfe6f7', grass: '#4f9d57' });
  const b = { rest: 'paint', total: 10, colours: new Map([[0xbfe6f7, { n: 10, material: 'water', control: 'water' }], [0x112233, { n: 1, material: 'stone', control: 'stone' }]]), looks: new Map() };
  const m = mergeMaterials([a, b]);
  assert.equal(m.colours.get(0xbfe6f7).material, 'water');
  assert.equal(m.colours.get(0xbfe6f7).n, 12);
  assert.equal(m.colours.get(0x4f9d57).material, 'plant');
  assert.equal(m.colours.get(0x112233).material, 'stone');
  assert.equal(m.colours.size, 3);
  assert.equal(a.colours.get(0xbfe6f7).material, 'sky', 'the tables handed in are left as they were');
});

test('applyColour takes the materials as a function too, and only asks for them when the look changes a colour', () => {
  const s = scene();
  let asked = 0;
  const lazy = () => { asked++; return spriteMaterials(s, {}); };
  const g = renderFrame(s, 'idle', 0, defaultParams(s));
  applyColour(g.data, defaultTheme().colour, lazy);
  assert.equal(asked, 0, 'the original look needs no materials');
  const theme = MANY_COLOURS[0].theme;
  applyColour(g.data, theme.colour, lazy);
  assert.equal(asked, 1);
  assert.deepEqual(g.data, renderThemedFrame(s, 'idle', 0, {}, theme).data);
});
