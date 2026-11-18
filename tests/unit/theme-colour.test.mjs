// Bundle-level customisation, the picture side (Contract 7): engine/theme.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultTheme, applyColour, PALETTES, paletteByName, THEME_PRESETS,
  themedParams, randomTheme, renderThemedFrame, normalizeTheme,
} from '../../engine/theme.js';
import { pack, col, INK, rgbToHsl } from '../../engine/color.js';
import { renderFrame, defaultParams, cleanParams } from '../../engine/sprite.js';
import { loadSprites } from '../../tools/lib/assets.mjs';

// every sprite in sprites/ (there is no list: the folder is scanned)
const sprites = (await loadSprites()).map((s) => s.def);
const byId = Object.fromEntries(sprites.map((s) => [s.id, s]));

const unpack = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, v >>> 24];
const colour = (over) => ({ ...defaultTheme().colour, ...over });
const frameOf = (id, clip) => {
  const s = byId[id];
  return renderFrame(s, clip ?? s.preview, 1 % s.clips[clip ?? s.preview].frames, defaultParams(s)).data;
};
const distinct = (data) => new Set(Array.from(data).filter((v) => v >>> 24)).size;
const transparentIdx = (data) => Array.from(data).flatMap((v, i) => (v >>> 24 ? [] : [i]));

test('the neutral theme has the Contract 7 shape and changes nothing', () => {
  const t = defaultTheme();
  assert.deepEqual(Object.keys(t).sort(), ['colour', 'music', 'seed', 'shapes', 'sound']);
  assert.deepEqual(t.colour, { hue: 0, saturation: 1, contrast: 1, tint: null, tintAmount: 0, palette: null, outline: null });
  assert.deepEqual(t.sound, { pitch: 0, brightness: 0 });
  assert.deepEqual(t.music, { tempo: 1, intensity: null });
  assert.equal(t.shapes, false);
  for (const s of sprites) {
    const data = frameOf(s.id);
    const copy = data.slice();
    assert.equal(applyColour(data, t.colour), data, 'returns the same array');
    assert.deepEqual(data, copy, `${s.id} changed under the neutral theme`);
  }
  // A missing colour block, or a partial one, also counts as neutral.
  const d = frameOf('knight'); const c = d.slice();
  applyColour(d, undefined); applyColour(d, {}); applyColour(d, { hue: 360 });
  assert.deepEqual(d, c);
});

test('normalizeTheme fills gaps and keeps what was given', () => {
  const t = normalizeTheme({ colour: { hue: 30 }, seed: 5 });
  assert.equal(t.colour.hue, 30);
  assert.equal(t.colour.saturation, 1);
  assert.equal(t.seed, 5);
  assert.deepEqual(t.music, { tempo: 1, intensity: null });
});

test('hue turns colours round the wheel and leaves transparency alone', () => {
  const data = new Uint32Array([0, pack(220, 40, 40), 0, pack(128, 128, 128)]);
  applyColour(data, colour({ hue: 120 }));
  assert.equal(data[0], 0); assert.equal(data[2], 0);
  const [r, g, b, a] = unpack(data[1]);
  assert.ok(g > r && g > b, `red turned 120 degrees should be green, got ${[r, g, b]}`);
  assert.equal(a, 255);
  assert.deepEqual(unpack(data[3]), [128, 128, 128, 255], 'greys have no hue to turn');
});

test('saturation 0 makes grey, above 1 makes colours stronger', () => {
  const data = new Uint32Array([pack(200, 80, 60), 0]);
  applyColour(data, colour({ saturation: 0 }));
  const [r, g, b] = unpack(data[0]);
  assert.ok(Math.abs(r - g) <= 1 && Math.abs(g - b) <= 1, `expected grey, got ${[r, g, b]}`);
  assert.equal(data[1], 0);
  const more = new Uint32Array([pack(160, 110, 100)]);
  applyColour(more, colour({ saturation: 1.6 }));
  const s0 = rgbToHsl(160, 110, 100)[1], s1 = rgbToHsl(...unpack(more[0]).slice(0, 3))[1];
  assert.ok(s1 > s0 + 0.1, `saturation ${s0} -> ${s1}`);
});

test('contrast spreads darks and lights apart', () => {
  const data = new Uint32Array([pack(60, 60, 60), pack(190, 190, 190), 0]);
  applyColour(data, colour({ contrast: 1.5 }));
  assert.ok(unpack(data[0])[0] < 60);
  assert.ok(unpack(data[1])[0] > 190);
  assert.equal(data[2], 0);
  // Contrast k moves each channel away from (or toward) the middle: v -> (v - 128) * k + 128.
  const at = (k, v) => { const d = new Uint32Array([pack(v, v, v)]); applyColour(d, colour({ contrast: k })); return unpack(d[0]); };
  assert.deepEqual(at(0.8, 60), [74, 74, 74, 255]);
  assert.deepEqual(at(0.8, 190), [178, 178, 178, 255]);
  assert.deepEqual(at(0.8, 128), [128, 128, 128, 255]);
  assert.deepEqual(at(1.5, 60), [26, 26, 26, 255]);
  assert.deepEqual(at(1.5, 190), [221, 221, 221, 255]);
  assert.deepEqual(at(3, 250), [255, 255, 255, 255], 'clamped at white');
  assert.deepEqual(at(3, 5), [0, 0, 0, 255], 'clamped at black');
  // Order of brightness is kept at 0.8.
  const ramp8 = [10, 50, 90, 128, 170, 210, 250].map((v) => at(0.8, v)[0]);
  for (let i = 1; i < ramp8.length; i++) assert.ok(ramp8[i] > ramp8[i - 1]);
  assert.ok(ramp8[0] > 10 && ramp8[6] < 250, 'contrast 0.8 pulls the ends in');
});

test('tint pulls colours toward the tint colour by tintAmount', () => {
  const data = new Uint32Array([pack(128, 128, 128), pack(40, 90, 200), 0]);
  applyColour(data, colour({ tint: '#ff3010', tintAmount: 0.6 }));
  const [r, g, b] = unpack(data[0]);
  assert.ok(r - g > 90 && r - b > 100, `grey tinted 60% red should be clearly red, got ${[r, g, b]}`);
  const [r2, g2, b2] = unpack(data[1]);
  assert.ok(r2 > 140 && b2 < 100 && r2 > b2 + 50, `blue tinted 60% red should now lean red, got ${[r2, g2, b2]}`);
  assert.equal(data[2], 0);
  // Full tint: the tint's hue and strength, at the pixel's own lightness (so shading survives).
  const tintHsl = rgbToHsl(255, 48, 16);
  for (const v of [40, 100, 128, 180, 220]) {
    const d = new Uint32Array([pack(v, v, v)]);
    applyColour(d, colour({ tint: '#ff3010', tintAmount: 1 }));
    const [h, s, l] = rgbToHsl(...unpack(d[0]).slice(0, 3));
    assert.ok(Math.abs(h - tintHsl[0]) < 6, `grey ${v}: hue ${h} vs tint ${tintHsl[0]}`);
    assert.ok(s > 0.9, `grey ${v}: saturation ${s}`);
    assert.ok(Math.abs(l - v / 255) < 0.02, `grey ${v}: lightness ${l} should stay ${v / 255}`);
  }
  // Half tint sits half way between none and full, channel by channel.
  const half = new Uint32Array([pack(128, 128, 128)]), full = new Uint32Array([pack(128, 128, 128)]);
  applyColour(half, colour({ tint: '#ff3010', tintAmount: 0.5 }));
  applyColour(full, colour({ tint: '#ff3010', tintAmount: 1 }));
  for (let ch = 0; ch < 3; ch++) assert.ok(Math.abs(unpack(half[0])[ch] - (128 + unpack(full[0])[ch]) / 2) <= 1);
  // tintAmount 0 or no tint colour: nothing happens.
  const same = new Uint32Array([pack(40, 90, 200)]);
  applyColour(same, colour({ tint: '#ff3010', tintAmount: 0 }));
  applyColour(same, colour({ tint: null, tintAmount: 1 }));
  assert.equal(same[0], pack(40, 90, 200));
});

test('outline swaps the standard outline colour exactly, and only it', () => {
  const data = frameOf('knight');
  const before = data.slice();
  const inkCount = Array.from(data).filter((v) => v === col(INK)).length;
  assert.ok(inkCount > 20, 'the knight has an outline to swap');
  applyColour(data, colour({ outline: '#7a1020' }));
  for (let i = 0; i < data.length; i++) {
    if (before[i] === col(INK)) assert.equal(data[i], col('#7a1020'));
    else assert.equal(data[i], before[i]);
  }
  // With other settings too, the outline still lands exactly on the chosen colour.
  const d2 = frameOf('slime');
  const inkAt = Array.from(d2).flatMap((v, i) => (v === col(INK) ? [i] : []));
  applyColour(d2, colour({ outline: '#102030', hue: 90, saturation: 1.3, contrast: 1.2, palette: 'Forest' }));
  for (const i of inkAt) assert.equal(d2[i], col('#102030'));
});

test('there are at least eight palettes of 8-16 colours that run dark to light', () => {
  assert.ok(PALETTES.length >= 8);
  const names = new Set();
  for (const p of PALETTES) {
    assert.match(p.name, /^[A-Z][a-z]+( [a-z]+)?$/, `everyday name: ${p.name}`);
    assert.ok(!names.has(p.name)); names.add(p.name);
    assert.ok(p.colours.length >= 8 && p.colours.length <= 16, `${p.name} has ${p.colours.length} colours`);
    for (const c of p.colours) assert.match(c, /^#[0-9a-f]{6}$/);
    const ls = p.colours.map((c) => rgbToHsl(...[1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)))[2]);
    assert.ok(Math.min(...ls) < 0.2, `${p.name} needs a dark`);
    assert.ok(Math.max(...ls) > 0.75, `${p.name} needs a light`);
    assert.equal(paletteByName(p.name.toLowerCase()), p, 'names match regardless of case');
  }
  for (const n of ['Sunset', 'Frost', 'Forest', 'Candy', 'Night', 'Desert', 'Toxic', 'Mono']) assert.ok(names.has(n), n);
});

test('a palette maps every visible pixel to a palette colour', () => {
  for (const pal of PALETTES) {
    const allowed = new Set(pal.colours.map((c) => col(c)));
    for (const id of ['knight', 'slime', 'campfire']) {
      const data = frameOf(id);
      const holes = transparentIdx(data);
      applyColour(data, colour({ palette: pal.name }));
      for (let i = 0; i < data.length; i++) {
        if (!(data[i] >>> 24)) continue;
        assert.ok(allowed.has(data[i]), `${id} under ${pal.name}: ${unpack(data[i])} is not in the palette`);
      }
      assert.deepEqual(transparentIdx(data), holes, 'transparent pixels stay transparent');
    }
  }
});

test('no setting raises the number of distinct colours, and transparency never moves', () => {
  const settings = [
    { hue: 75 }, { saturation: 0.3 }, { saturation: 1.8 }, { contrast: 1.6 }, { contrast: 0.6 },
    { tint: '#40c0ff', tintAmount: 0.5 }, { palette: 'Candy' }, { outline: '#ffffff' },
    { hue: 200, saturation: 1.2, contrast: 1.1, tint: '#ffaa00', tintAmount: 0.3, palette: 'Night', outline: '#000000' },
  ];
  for (const s of sprites) for (const over of settings) {
    const data = frameOf(s.id);
    const n0 = distinct(data), holes = transparentIdx(data);
    applyColour(data, colour(over));
    assert.ok(distinct(data) <= n0, `${s.id} ${JSON.stringify(over)}: ${n0} -> ${distinct(data)}`);
    assert.deepEqual(transparentIdx(data), holes);
  }
});

test('Uint32 pixels and RGBA bytes give the same result', () => {
  const settings = colour({ hue: 140, saturation: 1.25, contrast: 1.15, tint: '#3355ff', tintAmount: 0.25, palette: 'Desert', outline: '#40200a' });
  for (const id of ['knight', 'wolf', 'coin']) {
    const a = frameOf(id);
    const bytes = new Uint8ClampedArray(a.length * 4);
    for (let i = 0; i < a.length; i++) bytes.set(unpack(a[i]), i * 4);
    applyColour(a, settings);
    const out = applyColour(bytes, settings);
    assert.equal(out, bytes);
    for (let i = 0; i < a.length; i++) assert.deepEqual(Array.from(bytes.subarray(i * 4, i * 4 + 4)), unpack(a[i]), `${id} pixel ${i}`);
  }
  // RGBA bytes that sit at an odd offset inside a bigger buffer work too.
  const big = new Uint8ClampedArray(4 * 3 + 1);
  const view = big.subarray(1);
  view.set([200, 40, 40, 255, 0, 0, 0, 0, 10, 10, 10, 255]);
  applyColour(view, colour({ hue: 120 }));
  assert.ok(view[1] > view[0]);
  assert.deepEqual(Array.from(view.subarray(4, 8)), [0, 0, 0, 0]);
});

test('a 500-frame sheet is themed quickly because each colour is worked out once', () => {
  const s = byId.knight;
  const frame = renderFrame(s, 'walk', 0, defaultParams(s)).data;
  const sheet = new Uint32Array(frame.length * 500);
  for (let i = 0; i < 500; i++) sheet.set(frame, i * frame.length);
  const t0 = performance.now();
  applyColour(sheet, colour({ hue: 40, saturation: 1.2, contrast: 1.1, palette: 'Sunset', outline: '#000000' }));
  const ms = performance.now() - t0;
  assert.ok(ms < 400, `took ${ms.toFixed(0)} ms`);
});

test('at least eight presets, including Original, each a full theme', () => {
  assert.ok(THEME_PRESETS.length >= 8);
  assert.equal(THEME_PRESETS[0].name, 'Original');
  assert.deepEqual(THEME_PRESETS[0].theme, defaultTheme());
  // Spooky's tint is held at 0.4 so small bright details (a coin's star, a bat's eyes) still read.
  assert.equal(THEME_PRESETS.find((p) => p.id === 'spooky').theme.colour.tintAmount, 0.4);
  const ids = new Set();
  for (const p of THEME_PRESETS) {
    assert.ok(p.id && !ids.has(p.id)); ids.add(p.id);
    assert.equal(typeof p.name, 'string');
    assert.equal(typeof p.blurb, 'string');
    assert.deepEqual(Object.keys(p.theme).sort(), ['colour', 'music', 'seed', 'shapes', 'sound']);
    if (p.theme.colour.palette) assert.ok(paletteByName(p.theme.colour.palette), `${p.name} palette`);
    // Each one renders without trouble.
    renderThemedFrame(byId.knight, 'idle', 0, defaultParams(byId.knight), p.theme);
  }
});

test('themedParams leaves controls alone unless shapes is on', () => {
  const s = byId.knight;
  const base = defaultParams(s);
  assert.equal(themedParams(s, base, defaultTheme()), base);
  assert.equal(themedParams(s, base, { ...defaultTheme(), seed: 99 }), base);
});

test('themedParams: same seed same look, different seeds differ, sprites in one bundle differ', () => {
  const s = byId.knight;
  const base = defaultParams(s);
  const on = (seed) => ({ ...defaultTheme(), seed, shapes: true });
  assert.deepEqual(themedParams(s, base, on(7)), themedParams(s, base, on(7)));
  assert.notDeepEqual(themedParams(s, base, on(7)), themedParams(s, base, on(8)));
  assert.notDeepEqual(themedParams(s, base, on(7)), base);
  // Two sprites with identical controls but different ids get different variations from one seed.
  const twin = { ...byId.slime, id: 'slime-twin' };
  assert.notDeepEqual(themedParams(byId.slime, defaultParams(byId.slime), on(3)), themedParams(twin, defaultParams(twin), on(3)));
});

test('themedParams always gives valid controls for every sprite over 50 seeds', () => {
  for (const s of sprites) {
    const base = defaultParams(s);
    for (let seed = 0; seed < 50; seed++) {
      const p = themedParams(s, base, { ...defaultTheme(), seed, shapes: true });
      assert.deepEqual(p, cleanParams(s, p), `${s.id} seed ${seed}`);
      for (const [k, d] of Object.entries(s.params)) {
        if (d.kind === 'range') assert.ok(p[k] >= d.min && p[k] <= d.max, `${s.id}.${k}`);
        if (d.kind === 'choice') assert.ok(d.options.some((o) => o.value === p[k]), `${s.id}.${k}`);
      }
      // Every frame of every clip draws something and stays clear of the frame edge
      // (tiles, backgrounds, interface pieces and icons may reach the edge: the same rule as quality/sprite.js).
      const [w, h] = s.size, mayTouch = ['tileset', 'background', 'ui', 'icon'].includes(s.meta?.type);
      for (const clip of Object.keys(s.clips)) for (let f = 0; f < s.clips[clip].frames; f++) {
        const b = renderFrame(s, clip, f, p).bounds();
        assert.ok(b, `${s.id} seed ${seed} ${clip} ${f} drew nothing`);
        assert.ok(mayTouch || (b.x0 > 0 && b.y0 > 0 && b.x1 < w - 1 && b.y1 < h - 1), `${s.id} seed ${seed} ${clip} frame ${f} touches the edge: ${JSON.stringify(b)}`);
      }
    }
  }
});

test('randomTheme: same seed same theme, different seeds differ, always readable', () => {
  assert.deepEqual(randomTheme(42), randomTheme(42));
  assert.notDeepEqual(randomTheme(42), randomTheme(43));
  for (let seed = 0; seed < 200; seed++) {
    const t = randomTheme(seed);
    assert.equal(t.seed, seed);
    assert.deepEqual(Object.keys(t).sort(), ['colour', 'music', 'seed', 'shapes', 'sound']);
    const c = t.colour;
    assert.ok(c.saturation >= 0.75 && c.saturation <= 1.3, `saturation ${c.saturation}`);
    assert.ok(c.contrast >= 0.9 && c.contrast <= 1.15, `contrast ${c.contrast}`);
    assert.ok(c.tintAmount >= 0 && c.tintAmount <= 0.3);
    if (c.palette) { assert.ok(paletteByName(c.palette)); assert.equal(c.outline, null, 'no off-palette outline'); }
    assert.ok(t.sound.pitch >= -4 && t.sound.pitch <= 4 && Number.isInteger(t.sound.pitch));
    assert.ok(t.sound.brightness >= -0.5 && t.sound.brightness <= 0.5);
    assert.ok(t.music.tempo >= 0.9 && t.music.tempo <= 1.1);
    // The knight stays readable: outline still differs from the body, and more than one colour survives.
    const g = renderThemedFrame(byId.knight, 'idle', 0, defaultParams(byId.knight), t);
    assert.ok(distinct(g.data) >= 4, `seed ${seed} collapsed the knight to ${distinct(g.data)} colours`);
  }
});

test('renderThemedFrame renders and recolours', () => {
  const s = byId.slime;
  const base = defaultParams(s);
  const plain = renderFrame(s, 'idle', 0, base);
  const t = { ...defaultTheme(), colour: colour({ palette: 'Mono' }) };
  const g = renderThemedFrame(s, 'idle', 0, base, t);
  assert.equal(g.w, plain.w); assert.equal(g.h, plain.h);
  const expect = applyColour(plain.data.slice(), t.colour);
  assert.deepEqual(g.data, expect);
});
