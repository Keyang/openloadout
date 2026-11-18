// The two worked-example backgrounds, bg-forest and bg-castle, against their specification
// rows (bundles/specs/kit-platformer-fantasy.md) and the background rules of the style guide.
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderFrame, defaultParams, cleanParams } from '../../engine/sprite.js';
import { brightness, mix, rgbToHex, INK } from '../../engine/color.js';
import { PALETTE } from '../../engine/palettes.js';
import { LAYER, PIVOT, TIMES, skyLook } from '../../engine/backdrop.js';
import { THEME_PRESETS, applyColour } from '../../engine/theme.js';
import { checkSprite, seamCheck } from '../../quality/sprite.js';
import { validateMeta } from '../../catalog/schema.js';
import forest from '../../sprites/bg-forest.js';
import castle from '../../sprites/bg-castle.js';

const P = PALETTE.thornwood;
const [W, H] = LAYER;
const SPEC = [
  { def: forest, id: 'bg-forest', name: 'Forest backdrop', themes: ['fantasy', 'forest'], time: 'day',
    layersOf: { clouds: ['far'], height: ['far', 'mid'], density: ['mid', 'near'], haze: ['far', 'mid', 'near'] },
    controls: ['sky', 'land', 'leaf', 'time', 'clouds', 'height', 'density', 'haze'], colours: { sky: P.sky, land: P.haze, leaf: P.leaf } },
  { def: castle, id: 'bg-castle', name: 'Castle backdrop', themes: ['fantasy', 'dungeon'], time: 'dusk',
    layersOf: { windows: ['far', 'mid'], height: ['mid'], density: ['near'], haze: ['far', 'mid', 'near'] },
    controls: ['sky', 'land', 'accent', 'time', 'windows', 'height', 'density', 'haze'], colours: { sky: mix(P.sky, P.thorn, 0.45), land: P.slate, accent: P.crimson } },
];
const hexOf = (v) => rgbToHex(v & 255, (v >>> 8) & 255, (v >>> 16) & 255);
const coloursOf = (g) => [...new Set(g.data)].filter((v) => v).map(hexOf);
function looks(def) {
  const lo = {}, hi = {};
  for (const [k, d] of Object.entries(def.params)) if (d.kind === 'range') { lo[k] = d.min; hi[k] = d.max; }
  const out = [['default', defaultParams(def)], ['all low', cleanParams(def, lo)], ['all high', cleanParams(def, hi)]];
  for (const time of TIMES) out.push([time, { ...defaultParams(def), time }], [`${time}, all high`, { ...cleanParams(def, hi), time }]);
  return out;
}

for (const spec of SPEC) {
  const { def, id } = spec;

  test(`${id}: frame, layers, controls and metadata are the specification's`, () => {
    assert.equal(def.id, id);
    assert.equal(def.name, spec.name);
    assert.deepEqual(def.size, [320, 180]);
    assert.deepEqual(def.pivot, PIVOT);
    assert.deepEqual(Object.keys(def.clips), ['far', 'mid', 'near'], 'the farthest layer first');
    for (const c of Object.values(def.clips)) assert.equal(c.frames, 1);
    assert.deepEqual(Object.keys(def.params).sort(), [...spec.controls].sort());
    assert.deepEqual(Object.keys(def.parts ?? {}), []);
    assert.deepEqual(def.sounds, {});
    for (const [k, c] of Object.entries(spec.colours)) {
      assert.equal(def.params[k].kind, 'color');
      assert.equal(def.params[k].def, c, `${k} default`);
      assert.equal(def.params[k].swatches[0], c, `${k}: the default is the first swatch`);
      assert.ok(def.params[k].swatches.length >= 4 && def.params[k].swatches.length <= 8);
    }
    assert.deepEqual(def.params.time.options.map((o) => o.value), TIMES);
    assert.equal(def.params.time.def, spec.time);
    for (const k of ['height', 'density', 'haze']) assert.equal(def.params[k].kind, 'range');
    assert.deepEqual({ type: def.meta.type, role: def.meta.role, view: def.meta.view, themes: def.meta.themes, license: def.meta.license },
      { type: 'background', role: 'environment/background', view: 'side', themes: spec.themes, license: 'draft' });
    assert.equal(def.meta.gameTypes[0], 'platformer');
    assert.deepEqual(validateMeta(def.meta, 'sprite'), { ok: true, errors: [] });
    for (const speed of ['0.1', '0.4', '0.7']) assert.ok(def.blurb.includes(speed), `the blurb says the scroll speed ${speed}`);
  });

  test(`${id}: passes the quality checker with no errors and no warnings`, () => {
    const r = checkSprite(def, { validateMeta });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.warnings, []);
  });

  test(`${id}: every layer spans the width and joins itself, at every time of day and at both ends of the sliders`, () => {
    for (const [name, p] of looks(def)) for (const clip of ['far', 'mid', 'near']) {
      const g = renderFrame(def, clip, 0, p);
      const b = g.bounds();
      assert.deepEqual([b.x0, b.x1], [0, W - 1], `${clip} / ${name} spans the width`);
      const s = seamCheck(g, g, 'x');
      assert.ok(s.ok, `${clip} / ${name}: ${s.breaks} gaps (${s.maxBreaks} allowed), step ${s.jump} (${s.maxJump} allowed)`);
      // stricter than the checker: the column pair across the join is as alike as the most alike pair inside
      let same = 0;
      for (let y = 0; y < H; y++) if (g.get(0, y) === g.get(W - 1, y)) same++;
      assert.ok(same >= H * 0.8, `${clip} / ${name}: only ${same} of ${H} rows match across the join`);
    }
  });

  test(`${id}: far is solid; mid and near are see-through above and have a strip across the bottom`, () => {
    for (const [name, p] of looks(def)) {
      const far = renderFrame(def, 'far', 0, p);
      assert.ok(far.data.every((v) => (v >>> 24) === 255), `far / ${name} is fully solid`);
      for (const clip of ['mid', 'near']) {
        const g = renderFrame(def, clip, 0, p);
        let open = 0;
        for (const v of g.data) if (!v) open++;
        assert.ok(open > W * H * 0.2, `${clip} / ${name}: at least a fifth is see-through (${Math.round((open / (W * H)) * 100)}%)`);
        for (let y = H - 8; y < H; y++) for (let x = 0; x < W; x++) assert.notEqual(g.get(x, y), 0, `${clip} / ${name}: hole in the bottom strip at ${x},${y}`);
      }
      const near = renderFrame(def, 'near', 0, p);
      let gaps = 0;
      for (let x = 0; x < W; x++) if (!near.get(x, 120)) gaps++;
      assert.ok(gaps > W * 0.5, `near / ${name}: more than half of row 120 is open, so the game is not walled in (${gaps})`);
    }
  });

  test(`${id}: stays behind the game: at most 8 landscape colours a layer, no pure palette colour, nothing as dark as the outline`, () => {
    const pure = new Set(Object.values(P));
    for (const [name, p] of looks(def)) for (const clip of ['far', 'mid', 'near']) {
      const g = renderFrame(def, clip, 0, p);
      const area = new Map();
      for (const v of g.data) if (v) area.set(v, (area.get(v) ?? 0) + 1);
      // stars, the sun or moon and lit windows do not count: they are the colours covering under 2% of the layer
      const landscape = [...area].filter(([, n]) => n >= W * H * 0.02);
      assert.ok(landscape.length <= 8, `${clip} / ${name}: ${landscape.length} landscape colours`);
      assert.ok(area.size <= 12, `${clip} / ${name}: ${area.size} colours in all`);
      for (const [v] of area) {
        const c = hexOf(v);
        assert.ok(!pure.has(c), `${clip} / ${name}: ${c} is a pure palette colour (use recede)`);
        assert.ok(brightness(c) > brightness(INK) + 0.04, `${clip} / ${name}: ${c} is as dark as the outline`);
      }
    }
  });

  test(`${id}: nothing in mid or near is brighter than the horizon band, except small lights (day and dusk)`, () => {
    for (const [name, p] of looks(def)) {
      if (p.time === 'night') continue;      // under a dark sky the moonlit land is lighter than the sky
      const horizon = brightness(skyLook(p.sky, p.time).bands[3]);
      for (const clip of ['mid', 'near']) {
        const g = renderFrame(def, clip, 0, p);
        let bright = 0;
        for (const v of g.data) if (v && brightness(hexOf(v)) > horizon + 0.005) bright++;
        assert.ok(bright < W * H * 0.02, `${clip} / ${name}: ${bright} pixels brighter than the horizon band`);
      }
    }
  });

  test(`${id}: no isolated single pixels in any layer`, () => {
    for (const [name, p] of looks(def)) for (const clip of ['far', 'mid', 'near']) {
      const g = renderFrame(def, clip, 0, p);
      const at = (x, y) => (y < 0 || y >= H ? -1 : g.data[y * W + ((x + W) % W)]);
      let lone = 0, where = '';
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const v = at(x, y);
        if (v !== at(x - 1, y) && v !== at(x + 1, y) && v !== at(x, y - 1) && v !== at(x, y + 1)) { if (!lone) where = `${x},${y}`; lone++; }
      }
      assert.equal(lone, 0, `${clip} / ${name}: ${lone} single pixels, first at ${where}`);
    }
  });

  // The main shapes of each layer and what they are seen against: [front colour, colour behind, layer].
  // far: its biggest shape that is not a sky band, against the bands it touches. mid and near: their two
  // biggest colours, against the main colours (the two biggest, and the sky bands) of the layers behind
  // that show next to them, at three scroll positions.
  const byArea = (g, skip = new Set()) => { const m = new Map(); for (const v of g.data) if (v && !skip.has(v)) m.set(v, (m.get(v) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]).map(([v]) => v); };
  function scene(p) {
    const L = ['far', 'mid', 'near'].map((c) => renderFrame(def, c, 0, p));
    const sky = skyLook(p.sky, p.time);
    const bands = sky.bands.map((c) => L[0].data.find((v) => hexOf(v) === c));
    const mains = [new Set([...bands, byArea(L[0], new Set(bands))[0]]), new Set(byArea(L[1]).slice(0, 2)), new Set(byArea(L[2]).slice(0, 2))];
    return { L, bands, mains, air: bands[3] };
  }
  function contacts(p) {
    const { L, bands, mains } = scene(p);
    const bandSet = new Set(bands), count = new Map();
    const note = (front, behind, layer) => { if (front !== behind) { const k = `${front}|${behind}|${layer}`; count.set(k, (count.get(k) ?? 0) + 1); } };
    const ridge = byArea(L[0], bandSet)[0];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (L[0].data[y * W + x] === ridge) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1]]) { const v = L[0].get((x + dx + W) % W, y + dy); if (bandSet.has(v)) note(ridge, v, 'far'); }
    }
    for (const li of [1, 2]) for (const shift of [0, 107, 213]) {
      const behind = (x, y) => { for (let k = li - 1; k >= 0; k--) { const v = L[k].get((x + shift * (li - k) + W * 4) % W, y); if (v) return mains[k].has(v) ? v : 0; } return 0; };
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const v = L[li].data[y * W + x];
        if (!mains[li].has(v)) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1]]) { const nx = (x + dx + W) % W, ny = y + dy; if (ny >= 0 && !L[li].get(nx, ny)) { const b = behind(nx, ny); if (b) note(v, b, ['far', 'mid', 'near'][li]); } }
      }
    }
    return [...count].filter(([, n]) => n >= 40).map(([k]) => { const [f, b, layer] = k.split('|'); return [Number(f), Number(b), layer]; });
  }
  // The share of edges (neighbouring pixels that differ) still there after a colour setting: the checker's measure.
  function edgesLeft(data, colour) {
    const pairs = new Map();
    let total = 0, gone = 0;
    const edge = (a, b) => { if (!a && !b) return; total++; if (a && b) { const k = a < b ? `${a}|${b}` : `${b}|${a}`; pairs.set(k, (pairs.get(k) ?? 0) + 1); } };
    for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) { const v = data[i]; if (x + 1 < W && data[i + 1] !== v) edge(v, data[i + 1]); if (y + 1 < H && data[i + W] !== v) edge(v, data[i + W]); }
    for (const [k, n] of pairs) { const to = applyColour(Uint32Array.from(k.split('|').map(Number)), colour); if (to[0] === to[1]) gone += n; }
    return (total - gone) / total;
  }

  test(`${id}: under every whole-bundle colour preset, each layer's main shapes stay distinct from the band behind them`, () => {
    const p = defaultParams(def);
    const { L, mains, air, bands } = scene(p);
    const pairs = contacts(p).filter(([, , layer]) => layer === 'far');
    assert.ok(pairs.length >= 1, 'the far ridge touches a sky band');
    for (const li of [1, 2]) for (const v of mains[li]) pairs.push([v, air, ['far', 'mid', 'near'][li]]);       // mid and near: against the horizon band
    assert.ok(THEME_PRESETS.filter((t) => t.theme.colour.palette).length >= 8, 'the palette presets are there');
    for (const preset of THEME_PRESETS) {
      for (const [front, behind, layer] of pairs) {
        const [a, b] = applyColour(new Uint32Array([front, behind]), preset.theme.colour);
        assert.notEqual(a, b, `${preset.name}: ${layer} shape ${hexOf(front)} turns into the ${hexOf(behind)} behind it (both ${hexOf(a)})`);
      }
      // and the picture as a whole keeps its shapes: each layer alone, and all three one over the other
      const all = new Uint32Array(W * H);
      for (const g of L) for (let i = 0; i < all.length; i++) if (g.data[i]) all[i] = g.data[i];
      for (const [name, data] of [['far', L[0].data], ['mid', L[1].data], ['near', L[2].data], ['all three layers', all]]) {
        const left = edgesLeft(data, preset.theme.colour);
        assert.ok(left >= 0.65, `${preset.name}: only ${Math.round(left * 100)}% of the edges of ${name} are left`);
      }
      // far keeps at least a sky, a ridge and one thing more, even in a palette with three light colours
      const far = applyColour(Uint32Array.from(L[0].data), preset.theme.colour);
      assert.ok(new Set(far).size >= 3, `${preset.name}: far is down to ${new Set(far).size} colours`);
    }
    assert.ok(bands.every(Boolean));
  });

  test(`${id}: by day and at dusk the main shapes are a clear step of value from what is behind them; at night they still differ`, () => {
    for (const time of TIMES) {
      const pairs = contacts({ ...defaultParams(def), time });
      assert.ok(['far', 'mid', 'near'].every((l) => pairs.some(([, , layer]) => layer === l)), `${time}: shapes found in all three layers`);
      for (const [front, behind, layer] of pairs) {
        const step = Math.abs(brightness(hexOf(front)) - brightness(hexOf(behind)));
        assert.ok(step >= (time === 'night' ? 0.01 : 0.05), `${time}: ${layer} shape ${hexOf(front)} against ${hexOf(behind)}: a step of ${step.toFixed(3)}`);
      }
    }
  });

  test(`${id}: each slider changes the layers it is meant for`, () => {
    const d = defaultParams(def);
    for (const [k, layers] of Object.entries(spec.layersOf)) for (const clip of layers) for (const base of [d, ...TIMES.map((time) => ({ ...d, time }))]) {
      const a = renderFrame(def, clip, 0, { ...base, [k]: def.params[k].min }).data, b = renderFrame(def, clip, 0, { ...base, [k]: def.params[k].max }).data;
      let n = 0;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
      assert.ok(n > 100, `${k} changes ${clip} (${base.time}): ${n} pixels`);
    }
  });

  test(`${id}: the layers recede: far is the lightest by day, near the darkest`, () => {
    const mean = (g) => { let s = 0, n = 0; for (const v of g.data) if (v) { s += brightness(hexOf(v)); n++; } return s / n; };
    const p = { ...defaultParams(def), time: 'day' };
    const [far, mid, near] = ['far', 'mid', 'near'].map((c) => mean(renderFrame(def, c, 0, p)));
    assert.ok(far > mid && mid > near, `far ${far.toFixed(2)} > mid ${mid.toFixed(2)} > near ${near.toFixed(2)}`);
  });

  test(`${id}: each time of day and each end of every slider gives a different picture`, () => {
    const d = defaultParams(def);
    const all = (p) => ['far', 'mid', 'near'].map((c) => renderFrame(def, c, 0, p).data);
    const differ = (a, b) => { let n = 0; for (let l = 0; l < 3; l++) for (let i = 0; i < a[l].length; i++) if (a[l][i] !== b[l][i]) n++; return n; };
    for (let i = 0; i < TIMES.length; i++) for (let j = i + 1; j < TIMES.length; j++) {
      assert.ok(differ(all({ ...d, time: TIMES[i] }), all({ ...d, time: TIMES[j] })) > W * H, `${TIMES[i]} against ${TIMES[j]}`);
    }
    for (const [k, c] of Object.entries(def.params)) if (c.kind === 'range') {
      assert.ok(differ(all({ ...d, [k]: c.min }), all({ ...d, [k]: c.max })) > 200, `${k}: low against high changes more than 200 pixels`);
    }
  });
}
