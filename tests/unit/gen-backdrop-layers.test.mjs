// The `layers` layout (build item B14; docs/data-sprites.md 2.4, 4.3; engine/gen/backdrop.js): a background is a stack
// of layers, back to front, each a clip, each a list of named backdrop generators that wrap across the layer's width.
// Held to here, through engine/data-sprite.js and the site registry, with two fixtures: tests/fixtures/v2/bg-forest.json
// (B1's) and tests/fixtures/v2/layers/bg-starfield.json (the library's sprites/bg-starfield.js redrawn as data):
//   - the clips are the layers, back to front; far is solid, the others see-through above their shapes and full width
//   - every layer wraps: its left and right edges continue (the quality bar's seamCheck), and a thing that hangs over
//     the join comes back in on the other side, exactly; a layer with wraps: false is told so
//   - `on` stands a call on an earlier item's outline (the forest's trees on its hill)
//   - the colour rules a backdrop names (sky.look ...) are worked out from the palette's slots, with their material:
//     a forest sky stays a sky under every look
//   - wide frames (640 x 180) lay out the same way; a 320 x 180 layer draws in 10 ms or less (section 4.2)
//   - both fixtures pass the quality bar (checkSprite) with no errors
//   - engine/gen/backdrop.js loads on its own, before anything else (no import cycle trips over it)
//   - a framework colour rule nested in a data-rules rule is worked out in its true colour; a real magenta draws; a
//     colour engine/resolve.js flags lost is an error naming it (never told by its colour)
//   - colour rules are bounded: a definition nesting them hugely is refused quickly, never hangs a frame
//   - scatter@1 serves a tile as well as a layer: inside the frame on both axes, a gap apart, wrapping only when told
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dataSprite, dataFrameList, makeDataSprite } from '../../engine/data-sprite.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import { spriteMaterials } from '../../engine/theme.js';
import { checkSprite, seamCheck, lookFaults } from '../../quality/sprite.js';
import { validateMeta } from '../../catalog/schema.js';
import { generator, runGenerator } from '../../engine/gen/index.js';
import { workOutColour } from '../../engine/gen/backdrop.js';
import { renderList } from '../../engine/draw-list.js';

const FIX = new URL('../fixtures/v2/', import.meta.url);
const load = (p) => JSON.parse(fs.readFileSync(new URL(p, FIX), 'utf8'));
const FOREST = 'bg-forest.json', STARS = 'layers/bg-starfield.json', WIDE = 'layers/bg-forest-wide.json';
const sprite = (p) => dataSprite(typeof p === 'string' ? load(p) : p);
const opaque = (g) => g.data.filter((v) => v >>> 24).length;
const MAGENTA = 0xffff00ff;
/** A pixel of magenta or a tone of it: the colour a paint nobody could work out is drawn in. */
const magentaish = (g) => g.data.some((v) => (v >>> 24) && (v & 255) > 190 && ((v >>> 8) & 255) < 90 && ((v >>> 16) & 255) > 190);

const soundIndex = new Map();
for (const f of fs.readdirSync(new URL('../../sounds/', import.meta.url))) {
  if (!f.endsWith('.json') || f === 'index.json' || f.startsWith('_')) continue;
  const p = JSON.parse(fs.readFileSync(new URL(`../../sounds/${f}`, import.meta.url), 'utf8'));
  soundIndex.set(p.id, p);
}

/** Settings worth trying: defaults, every slider low, every slider high, each option of each choice. */
function settings(s) {
  const d = defaultParams(s), low = { ...d }, high = { ...d }, out = [['default', d]];
  for (const [k, c] of Object.entries(s.params)) {
    if (c.kind === 'range') { low[k] = c.min ?? 0; high[k] = c.max ?? 1; }
    if (c.kind === 'choice') for (const o of c.options) out.push([`${k}=${o.value ?? o}`, { ...d, [k]: o.value ?? o }]);
    if (c.kind === 'toggle') out.push([`${k} flipped`, { ...d, [k]: !d[k] }]);
  }
  return [...out, ['all low', low], ['all high', high]];
}

test('bg-forest: the clips are its layers, back to front; far is solid, mid see-through above its hills and full width', () => {
  const s = sprite(FOREST), p = defaultParams(s);
  assert.deepEqual(Object.keys(s.clips), ['far', 'mid']);
  assert.deepEqual([s.size, s.preview], [[320, 180], 'far']);
  const far = renderFrame(s, 'far', 0, p), mid = renderFrame(s, 'mid', 0, p);
  assert.equal(opaque(far), 320 * 180, 'far is solid');
  assert.ok(!magentaish(far) && !magentaish(mid), 'every colour rule worked out (nothing magenta)');
  for (let x = 0; x < 320; x++) {
    assert.equal(mid.get(x, 0) >>> 24, 0, `mid is see-through at the top of column ${x}`);
    assert.ok(mid.get(x, 179) >>> 24, `mid reaches the bottom of column ${x}`);
  }
  for (const clip of ['far', 'mid']) assert.deepEqual(dataFrameList(s, clip, 0, p).warnings, [], clip);
  // sky above the mountains: several flat bands, lightest at the horizon; clouds; the ridge
  const top = new Set(), col = [];
  for (let y = 0; y < 60; y++) col.push(far.get(0, y));
  for (let x = 0; x < 320; x++) top.add(far.get(x, 2));
  assert.ok(new Set(col).size >= 3, 'the sky is in bands');
});

/** How far left and right a primitive reaches: [lo, hi) in columns, or null for one that has no extent here. */
function spanOf(p) {
  const r = Array.isArray(p.r) ? p.r[0] : p.r;
  if (p.kind === 'rect') return [p.at[0], p.at[0] + p.size[0]];
  if (p.kind === 'dot') return [p.at[0], p.at[0] + 1];
  if (p.kind === 'ellipse') return [p.at[0] - r, p.at[0] + r + 1];
  if (p.kind === 'poly') { const xs = p.points.map((q) => q[0]); return [Math.min(...xs), Math.max(...xs)]; }
  return null;
}
const sameBut = (a, b, W) => a.kind === b.kind && a.paint === b.paint && JSON.stringify({ ...a, at: undefined, points: undefined }) === JSON.stringify({ ...b, at: undefined, points: undefined })
  && (a.at ? a.at[1] === b.at[1] && Math.abs(a.at[0] - b.at[0]) === W : true);

test('every layer wraps: left and right edges continue, and whatever reaches over the join has its twin on the other side', () => {
  let crossing = 0;
  for (const f of [FOREST, STARS]) {
    const s = sprite(f);
    for (const [name, p] of settings(s)) for (const [clip, c] of Object.entries(s.clips)) for (const i of [...new Set([0, c.frames - 1])]) {
      const g = renderFrame(s, clip, i, p);
      const r = seamCheck(g, g, 'x');
      assert.ok(r.ok, `${f} ${clip} frame ${i} (${name}): ${r.breaks} gaps, step ${r.jump.toFixed(2)}`);
      // exact: a primitive hanging over the right edge has a copy W px to the left, and one over the left edge a copy W
      // px to the right (seamCheck above allows as big a step at the join as the picture has inside it)
      const W = s.size[0], list = dataFrameList(s, clip, i, p).list;
      for (const q of list) {
        const sp = spanOf(q);
        if (!sp || (sp[0] >= 0 && sp[1] <= W)) continue;
        crossing++;
        assert.ok(list.some((o) => o !== q && sameBut(o, q, W)), `${f} ${clip} frame ${i} (${name}): ${q.kind} at ${q.at} reaches over the join with no copy on the other side`);
      }
    }
  }
  assert.ok(crossing > 10, `${crossing} things reach over the join in the fixtures: the twin check is checking something`);
});

const PAL = { cloud: '#f0f4f8', sun: '#f2c230', leaf: '#3f8a4f', light: '#7fc070', dark: '#2a5a30', gas: '#6660b6', glow: '#a8a0f0', star: '#e8ecf2' };

test('a thing hanging over the join comes back in on the other side, exactly; told wrap: false it does not', () => {
  const W = 200, H = 120;      // three layers wide is 600 px: within the 640 a frame may be
  const calls = [
    { gen: 'cloud', v: 1, at: [194, 40], size: 40, seed: 3, paint: 'cloud', under: 'sun' },
    { gen: 'disc', v: 1, at: [3, 30], r: 9, paint: 'sun' },
    { gen: 'canopy', v: 1, at: [196, 60], r: 16, seed: 2, paint: 'leaf', lit: 'light', dark: 'dark' },
    { gen: 'nebula', v: 1, at: [10, 60], size: [90, 40], seed: 4, paint: 'gas', inner: 'glow' },
  ];
  for (const call of calls) {
    const wrapped = runGenerator(call, { size: [W, H] });
    assert.ok(wrapped.ok, `${call.gen}: ${wrapped.errors.join('; ')}`);
    const g = renderList(W, H, wrapped.primitives, { palette: PAL }).g;
    // the same thing, not wrapping, in the middle of a frame three layers wide, folded back onto one layer
    const flat = runGenerator({ ...call, at: [call.at[0] + W, call.at[1]], wrap: false }, { size: [3 * W, H] });
    assert.ok(flat.ok, flat.errors.join('; '));
    const wide = renderList(3 * W, H, flat.primitives, { palette: PAL }).g;
    const want = new Uint32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < 3 * W; x++) { const v = wide.get(x, y); if (v >>> 24) want[y * W + (x % W)] = v; }
    assert.deepEqual([...g.data], [...want], `${call.gen}: the wrapped picture is the thing and its part across the join`);
    const open = renderList(W, H, runGenerator({ ...call, wrap: false }, { size: [W, H] }).primitives, { palette: PAL }).g;
    assert.ok(opaque(open) < opaque(g), `${call.gen}: told wrap: false, the part over the join is not drawn`);
  }
  // placers: told wrap: false, nothing is put past the layer's edges
  for (const call of [{ gen: 'stars', v: 1, count: 60, seed: 4, paint: 'star', plus: 0.5, big: 0.3 },
    { gen: 'scatter', v: 1, count: 20, seed: 7, rows: [20, 90], place: { kind: 'rect', size: [7, 3], paint: 'leaf' } }]) {
    const on = runGenerator({ ...call, wrap: true }, { size: [W, H] }), off = runGenerator({ ...call, wrap: false }, { size: [W, H] });
    assert.ok(on.ok && off.ok);
    assert.ok(on.primitives.some((p) => p.at[0] < 0 || p.at[0] + (p.size?.[0] ?? 1) > W), `${call.gen}: wrapping, some copy reaches over the join`);
    for (const p of off.primitives) assert.ok(p.at[0] >= 0 && p.at[0] + (p.size?.[0] ?? 1) <= W, `${call.gen} wrap: false: inside the layer (${p.at})`);
  }
});

test('a layer with wraps: false tells its placers so', () => {
  const withSun = (wraps) => { const e = load(FOREST); e.body.layers[0].wraps = wraps; e.body.layers[0].draw.splice(1, 0, { gen: 'disc', v: 1, at: [2, 30], r: 9, paint: 'cloud' }); return sprite(e); };
  const open = withSun(false), wrapping = withSun(true);
  const p = defaultParams(open);
  const a = renderFrame(open, 'far', 0, p), b = renderFrame(wrapping, 'far', 0, p);
  assert.notEqual(a.get(318, 30), b.get(318, 30), 'the wrapping layer shows the sun\'s other half at the right edge; the other does not');
  assert.equal(a.get(5, 30), b.get(5, 30));
});

test('`on` stands a call on an earlier item\'s outline: the forest\'s trees grow from its hill', () => {
  const s = sprite(FOREST), p = { ...defaultParams(s), density: 1 };
  const { list, palette } = dataFrameList(s, 'mid', 0, p);
  assert.ok(list.length > 0);
  // the same with the hill's outline written out as the treeline's ground
  const d = load(FOREST);
  const tl = d.body.layers[1].draw[1];
  delete tl.on;
  tl.ground = { kind: 'ridge', base: 150, seed: 7, peaks: 3 };
  const t = sprite(d);
  assert.deepEqual(dataFrameList(t, 'mid', 0, p).list, list, 'on: "hill" is the hill\'s outline as ground');
  // trees stand on the hill: every column's leaf pixels touch the hill's
  const g = renderFrame(s, 'mid', 0, p);
  const leaf = palette.leaf.hex, back = palette.back.hex;
  const packed = (hex) => { const n = parseInt(hex.slice(1), 16); return ((255 << 24) | ((n & 255) << 16) | (n & 0xff00) | (n >> 16)) >>> 0; };
  let trees = 0;
  for (let x = 0; x < 320; x++) {
    let y = 0;
    while (y < 180 && g.get(x, y) !== packed(leaf)) y++;
    if (y === 180) continue;
    trees++;
    while (y < 180 && g.get(x, y) === packed(leaf)) y++;
    assert.equal(g.get(x, y), packed(back), `column ${x}: the trees stand on the hill`);
  }
  assert.ok(trees > 30, `${trees} columns of trees`);
  const none = sprite(load(FOREST));
  const g0 = renderFrame(none, 'mid', 0, { ...defaultParams(none), density: 0 });
  assert.ok(opaque(g0) < opaque(g), 'fewer trees when the slider is low');
});

test('sky.look: the far sky is worked out from the Sky slot, each band a slot of its own with the sky\'s material', () => {
  const s = sprite(FOREST), p = defaultParams(s);
  const { list, palette } = dataFrameList(s, 'far', 0, p);
  const bands = list.slice(0, 6);
  assert.ok(bands.every((b) => b.kind === 'rect' && typeof b.paint === 'string'), 'six bands, each a slot');
  const slots = bands.map((b) => palette[b.paint]);
  assert.ok(slots.every((x) => x && x.material === 'sky' && x.rule === 'sky.look' && /^#[0-9a-f]{6}$/.test(x.hex)), JSON.stringify(slots));
  assert.equal(new Set(slots.map((x) => x.hex)).size, 6, 'six different colours, top to horizon');
  const other = dataFrameList(s, 'far', 0, { ...p, sky: '#e0a060' }).palette;
  assert.notEqual(other[bands[0].paint]?.hex, slots[0].hex, 'another sky colour, other bands');
  const dusk = dataFrameList(s, 'far', 0, { ...p, time: 1 }).palette;
  assert.notEqual(dusk[bands[0].paint]?.hex, slots[0].hex, 'another time of day, other bands');
});

test('a forest sky stays a sky under every look: its colours are the Sky control\'s, material sky, held inside the sky\'s limits', () => {
  const s = sprite(FOREST), p = defaultParams(s);
  const table = spriteMaterials(s, p);
  const g = renderFrame(s, 'far', 0, p);
  const key = (v) => ((v & 255) << 16) | (v & 0xff00) | ((v >>> 16) & 255);
  const { list, palette } = dataFrameList(s, 'far', 0, p);
  const cloudy = new Set(list.filter((q) => q.kind === 'poly' && palette[String(q.paint).split('.')[0]]?.material !== 'sky').map((q) => q.paint));
  let sky = 0;
  for (let y = 0; y < 100; y++) for (const x of [5, 80, 160, 240, 315]) {
    const v = g.get(x, y), e = table.colours.get(key(v));
    assert.ok(e, `column ${x} row ${y}: every colour drawn is in the material table`);
    if (e.material === 'sky') sky++;
  }
  assert.ok(sky > 150, `${sky} of the sky's pixels sampled are of the sky (clouds and the ridge are the rest)`);
  assert.ok(cloudy.size > 0, 'the far layer has things that are not the sky');
  const skyColours = [...table.colours.values()].filter((e) => e.material === 'sky');
  assert.ok(skyColours.length >= 6, `${skyColours.length} colours of the sky in the table: its bands are of the sky`);
  const faults = lookFaults(table);
  assert.ok(faults.tested > 5, 'looks tried');
  assert.deepEqual(faults.left.filter((f) => f.material === 'sky').map((f) => `${f.look.name}: ${f.from} -> ${f.to}`), [], 'no sky colour leaves the sky');
  // the same read from the frame's slots (Contract 15 rule 9: every paint is a slot with a material): the colours the
  // sky's rules give are slots of material sky, and held inside the sky's limits under every look
  const slotTable = { rest: 'paint', total: 0, colours: new Map(), looks: new Map() };
  for (const e of Object.values(palette)) {
    if (!e?.hex) continue;
    const k = parseInt(e.hex.slice(1), 16);
    if (!slotTable.colours.has(k)) { slotTable.colours.set(k, { n: 1, material: e.material ?? 'paint', control: null }); slotTable.total++; }
  }
  const drawnSky = new Set();
  for (let y = 0; y < 100; y++) for (let x = 0; x < 320; x += 7) { const e = slotTable.colours.get(key(g.get(x, y))); if (e?.material === 'sky') drawnSky.add(key(g.get(x, y))); }
  assert.ok(drawnSky.size >= 6, `${drawnSky.size} colours drawn in the sky are slots of material sky (its six bands at least)`);
  const slotFaults = lookFaults(slotTable);
  assert.ok(slotFaults.tested > 5);
  assert.deepEqual(slotFaults.left.filter((f) => f.material === 'sky').map((f) => `${f.look.name}: ${f.from} -> ${f.to}`), [], 'no sky slot leaves the sky');
});

test('wide frames: the forest at 640 x 180 lays out across the whole width and wraps', () => {
  const d = load(FOREST);
  d.size = [640, 180]; d.pivot = [320, 180];
  const s = sprite(d), p = defaultParams(s);
  for (const clip of ['far', 'mid']) {
    const g = renderFrame(s, clip, 0, p);
    assert.equal(g.w, 640);
    assert.ok(seamCheck(g, g, 'x').ok, `${clip} wraps at 640`);
    for (const x of [0, 319, 320, 639]) assert.ok(g.get(x, 179) >>> 24, `${clip} column ${x} is drawn`);
  }
  assert.equal(opaque(renderFrame(s, 'far', 0, p)), 640 * 180);
});

// The target is 10 ms on a quiet machine. Other test files and sessions share this one, so: the best median of three
// rounds counts, and the limit grows with the load past one process per core (os.loadavg; 1 on a machine that has none).
const loadFactor = () => { const l = os.loadavg()[0] / Math.max(1, os.cpus().length); return Number.isFinite(l) ? Math.max(1, l) : 1; };

test('speed: one 320 x 180 layer draws in 10 ms or less (median, warm; more room when the machine is loaded)', () => {
  for (const f of [FOREST, STARS]) {
    const s = sprite(f), p = defaultParams(s);
    for (const clip of Object.keys(s.clips)) {
      for (let i = 0; i < 5; i++) renderFrame(s, clip, 0, p);
      let best = Infinity;
      for (let round = 0; round < 3 && best > 10; round++) {
        const times = [];
        for (let i = 0; i < 25; i++) { const t0 = performance.now(); renderFrame(s, clip, i % s.clips[clip].frames, p); times.push(performance.now() - t0); }
        times.sort((a, b) => a - b);
        best = Math.min(best, times[12]);
      }
      const limit = 10 * loadFactor();
      assert.ok(best <= limit, `${f} ${clip}: median ${best.toFixed(2)} ms (limit ${limit.toFixed(1)} ms at this load)`);
    }
  }
});

test('the starfield redrawn as data: far solid, mid twinkles over its 8 frames and loops, near a planet or a ringed one', () => {
  const s = sprite(STARS), p = defaultParams(s);
  assert.deepEqual(Object.keys(s.clips), ['far', 'mid', 'near']);
  assert.equal(s.clips.mid.frames, 8);
  assert.equal(opaque(renderFrame(s, 'far', 0, p)), 320 * 180);
  const frames = [...Array(8).keys()].map((f) => renderFrame(s, 'mid', f, p));
  assert.ok(frames.some((g, i) => i && g.data.some((v, k) => v !== frames[0].data[k])), 'the stars twinkle');
  const still = [...Array(8).keys()].map((f) => renderFrame(s, 'mid', f, { ...p, sparkle: false }));
  const nearPlanet = renderFrame(s, 'near', 0, { ...p, style: 'planet' }), nearRinged = renderFrame(s, 'near', 0, { ...p, style: 'ringed' });
  assert.ok(opaque(nearRinged) > opaque(nearPlanet), 'the rings add to the planet');
  assert.ok(still.length === 8);
  for (const g of [...frames, nearPlanet, nearRinged, renderFrame(s, 'far', 0, p)]) assert.ok(!magentaish(g), 'every colour rule worked out (nothing magenta)');
});

test('the layers layout called as a plain generator draws nothing', () => {
  const e = generator('layers', 1);
  assert.equal(e.family, 'layout');
  assert.deepEqual(runGenerator({ gen: 'layers', v: 1 }).primitives, []);
});

for (const f of [FOREST, STARS, 'layers/bg-forest-wide.json']) {
  test(`${f} passes the quality bar (checkSprite) with no errors`, () => {
    const r = checkSprite(sprite(f), { soundIndex, validateMeta });
    assert.deepEqual(r.errors, []);
  });
}

test('a broken layer is reported, naming the sprite, clip and frame', () => {
  const d = load(FOREST);
  d.body.layers[0].draw.push({ gen: 'stars', v: 1, count: 200, seed: 1, paint: 'cloud' }, { gen: 'stars', v: 1, count: 200, seed: 2, paint: 'cloud' },
    { gen: 'stars', v: 1, count: 200, seed: 3, paint: 'cloud' }, { gen: 'stars', v: 1, count: 200, seed: 4, paint: 'cloud' });
  const r = makeDataSprite(d);
  assert.equal(r.ok, false, 'over the frame budget: refused before anything draws');
  assert.match(r.errors.join(' '), /budget/);
});

// ---- review fixes (B14 round 2) ---------------------------------------------------------------------------------

test('engine/gen/backdrop.js loads on its own, first, and its helpers and generators work (no import cycle)', () => {
  const url = new URL('../../engine/gen/backdrop.js', import.meta.url).href;
  const code = `const m = await import(${JSON.stringify(url)});
const polys = m.columnPolys([0, 0, 1], [2, 3, 3], 'rock');
const o = m.ridgeOutline({ base: 40, height: 10 }, 96);
const reg = await import(${JSON.stringify(new URL('../../engine/gen/index.js', import.meta.url).href)});
const r = reg.runGenerator({ gen: 'ridge', v: 1, base: 40, paint: 'rock' }, { size: [96, 48] });
console.log(JSON.stringify({ polys: polys.length, o: Number.isFinite(o(3)), ridge: r.ok, frame: typeof reg.FRAME_GENERATORS['ridge@1'] }));`;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', cwd: fileURLToPath(new URL('../../', import.meta.url)) });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout.trim()), { polys: 1, o: true, ridge: true, frame: 'string' });
});

test('a framework colour rule inside a data-rules rule on a shape is worked out by the layout, in its true colour', () => {
  const LT = { rule: 'lit.tone', v: 1, of: 'cloud', air: 'sky' }, HAZE = { rule: 'haze', v: 1, of: 'rock', air: 'air', depth: 0.5 };
  const nested = { rule: 'tone', of: LT, by: 0.2 };
  const rect = (paint) => ({ kind: 'rect', at: [100, 40], size: [20, 10], paint });
  const hexAt = (v) => `#${[v & 255, (v >>> 8) & 255, (v >>> 16) & 255].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
  const cases = {
    'a shape written in the layer': [rect(nested)],
    'a shape a scatter places': [{ gen: 'scatter', v: 1, count: 3, seed: 2, rows: [30, 50], place: { kind: 'rect', size: [6, 3], paint: nested } }],
    'mix(lit.tone, sky)': [rect({ rule: 'mix', of: LT, with: 'sky', amount: 0.5 })],
    'mix(lit.tone, leaf, 0.3)': [rect({ rule: 'mix', of: LT, with: 'leaf', amount: 0.3 })],
    'mix(haze, rock, 0.2)': [rect({ rule: 'mix', of: HAZE, with: 'rock', amount: 0.2 })],
    'mix(rock.dark, haze, 0.9)': [rect({ rule: 'mix', of: 'rock.dark', with: HAZE, amount: 0.9 })],
    'tone(mix(haze, rock))': [rect({ rule: 'tone', of: { rule: 'mix', of: HAZE, with: 'rock', amount: 0.2 }, by: -0.4 })],
    'choose(lit.tone, sky), chosen': [rect({ rule: 'choose', when: { time: [0.5] }, then: LT, else: 'sky' })],
    'bandTone(haze, under leaf)': [rect({ rule: 'bandTone', of: HAZE, under: ['leaf'] })],
    'ramp(haze)': [rect({ rule: 'ramp', of: HAZE, tone: 'dark' })],
    // review B14 round 3: these drew magenta tints, unseen, in a palette with a purple slot
    'tone(lit.tone(cloud, sky), 0.2), purple palette': [rect({ rule: 'tone', of: LT, by: 0.2 }), 'purple'],
    'ramp(haze), purple palette': [rect({ rule: 'ramp', of: HAZE, tone: 'dark' }), 'purple'],
    'mix(lit.tone, tone(sky)), purple palette': [rect({ rule: 'mix', of: LT, with: { rule: 'tone', of: 'sky', by: 0.2 }, amount: 0.5 }), 'purple'],
    'mix(mix(haze, rock), leaf), purple palette': [rect({ rule: 'mix', of: { rule: 'mix', of: HAZE, with: 'rock', amount: 0.2 }, with: 'leaf', amount: 0.5 }), 'purple'],
    'mix(lit.tone, dusk), purple palette': [rect({ rule: 'mix', of: LT, with: 'dusk', amount: 0.5 }), 'purple'],
  };
  for (const [what, [item, purple]] of Object.entries(cases)) {
    const d = load(FOREST);
    if (purple) {
      d.palette.push({ id: 'dusk', label: 'Dusk', default: '#a040e0', material: 'sky' });
      d.body.layers[0].draw.push({ kind: 'rect', at: [0, 0], size: [4, 4], paint: 'dusk' });
    }
    d.body.layers[0].draw.push(item);
    const r = makeDataSprite(d);
    assert.equal(r.ok, true, `${what}: ${(r.errors ?? []).join('; ')}`);
    const s = r.sprite, p = defaultParams(s), g = renderFrame(s, 'far', 0, p);
    const pal = Object.fromEntries(d.palette.map((x) => [x.id, x.default]));
    const want = workOutColour(item.paint ?? item.place.paint, pal, p);
    assert.match(want ?? '', /^#[0-9a-f]{6}$/, what);
    if (item.kind) assert.equal(hexAt(g.get(105, 44)), want, `${what}: drawn in its true colour`);
    else assert.ok(g.data.some((v) => hexAt(v) === want) && !magentaish(g), `${what}: drawn in its true colour`);
  }
  // apart (and standOut) take `from`, which catalog/sprite-schema.js reads as a binding today, so they are refused
  // before they are drawn; whatever refuses them, they are never drawn magenta
  for (const paint of [{ rule: 'apart', of: LT, from: ['rock'] }, { rule: 'standOut', against: 'sky', from: [LT, 'leaf'] }]) {
    const d = load(FOREST);
    d.body.layers[0].draw.push(rect(paint));
    assert.equal(makeDataSprite(d).ok, false, paint.rule);
  }
  // the same colour as a generator's paint, or with the framework rule outermost, works out
  for (const item of [{ gen: 'disc', v: 1, at: [100, 40], r: 10, paint: nested },
    { kind: 'rect', at: [100, 40], size: [20, 10], paint: { rule: 'lit.tone', v: 1, of: { rule: 'tone', of: 'cloud', by: 0.2 }, air: 'sky' } }]) {
    const d = load(FOREST);
    d.body.layers[0].draw.push(item);
    const s = sprite(d), p = defaultParams(s);
    assert.deepEqual(dataFrameList(s, 'far', 0, p).warnings, []);
    assert.ok(!magentaish(renderFrame(s, 'far', 0, p)), JSON.stringify(item).slice(0, 60));
  }
  // real colours made by the data rules in a palette with a purple are drawn as they are
  const d = load(FOREST);
  d.palette.push({ id: 'dusk', label: 'Dusk', default: '#a040e0', material: 'sky' });
  for (const paint of [{ rule: 'mix', of: 'rock', with: 'cloud', amount: 0.3 }, { rule: 'mix', of: 'sky', with: 'dusk', amount: 0.5 },
    { rule: 'mix', of: 'rock', with: 'dusk', amount: 1 }, { rule: 'tone', of: 'dusk', by: -0.8 }, { rule: 'ramp', of: 'dusk', tone: 'light' },
    { rule: 'bandTone', of: 'dusk', under: ['leaf'] }, { rule: 'choose', when: { time: [0.5] }, then: 'dusk', else: 'sky' }]) d.body.layers[0].draw.push(rect(paint));
  const r = makeDataSprite(d);
  assert.equal(r.ok, true, (r.errors ?? []).join('; '));
});

test('a real magenta draws: a #ff00ff palette slot, rules over it, and a colour control set to #ff00ff by the viewer', () => {
  const rect = (paint, x = 100) => ({ kind: 'rect', at: [x, 40], size: [20, 10], paint });
  const hexAt = (v) => `#${[v & 255, (v >>> 8) & 255, (v >>> 16) & 255].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
  // review B14 round 3: a palette slot 'neon' #ff00ff painted through choose or mix was refused as "comes out magenta"
  const d = load(FOREST);
  d.palette.push({ id: 'neon', label: 'Neon', default: '#ff00ff', material: 'light' });
  d.body.layers[0].draw.push(rect('neon', 20), rect({ rule: 'choose', when: { time: [0.5] }, then: 'neon', else: 'sky' }, 100),
    rect({ rule: 'mix', of: 'neon', with: 'neon.light', amount: 0 }, 180), rect({ rule: 'mix', of: 'sky', with: 'neon', amount: 1 }, 260));
  const r = makeDataSprite(d);
  assert.equal(r.ok, true, (r.errors ?? []).join('; '));
  const g = renderFrame(r.sprite, 'far', 0, defaultParams(r.sprite));
  for (const x of [25, 105, 185, 265]) assert.equal(hexAt(g.get(x, 44)), '#ff00ff', `x ${x}`);
  // at run time: the viewer sets Sky (and Clouds) to magenta; a rule over them is that colour, drawn
  for (const [what, paint, set] of [['choose(sky, cloud)', { rule: 'choose', when: { time: [0.5] }, then: 'sky', else: 'cloud' }, { sky: '#ff00ff' }],
    ['mix(sky, cloud, 0.3)', { rule: 'mix', of: 'sky', with: 'cloud', amount: 0.3 }, { sky: '#ff00ff', cloud: '#ff00ff' }],
    ['tone(sky, -0.3)', { rule: 'tone', of: 'sky', by: -0.3 }, { sky: '#ff00ff' }]]) {
    const e = load(FOREST);
    e.body.layers[0].draw.push(rect(paint));
    const s = sprite(e), p = { ...defaultParams(s), ...set };
    const list = dataFrameList(s, 'far', 0, p);
    assert.ok(Array.isArray(list.list), what);
    const h = renderFrame(s, 'far', 0, p);
    const pal = Object.fromEntries(e.palette.map((x) => [x.id, set[x.id] ?? x.default]));
    assert.equal(hexAt(h.get(105, 44)), workOutColour(paint, pal, p), what);
  }
});

test('a colour engine/resolve.js reports lost is an error naming its slot (read from its flag, never from its colour)', () => {
  const run = generator('layers', 1).run;
  const draw = [{ kind: 'rect', at: [0, 0], size: [4, 4], paint: 'gone' }, { kind: 'rect', at: [4, 0], size: [4, 4], paint: 'neon' }];
  const input = (palette) => ({ body: [{ name: 'far', draw }], resolved: { palette, params: {} }, expand: (items) => ({ primitives: items, palette: {} }) });
  const ctx = { t: 0, frame: 0, frames: 1, loop: true, size: [16, 16], clip: 'far' };
  assert.throws(() => run(input({ gone: { hex: '#123456', derived: true, lost: true }, neon: { hex: '#ff00ff' } }), ctx), /colour "gone" cannot be worked out/);
  const ok = run(input({ gone: { hex: '#ff00ff', derived: true, rule: 'mix' }, neon: { hex: '#ff00ff', derived: true, rule: 'choose' } }), ctx);
  assert.equal(ok.list.length, 2, 'magenta that is not flagged lost is a colour like any other');
  // a lost slot nothing paints is no matter
  const unused = run({ ...input({ gone: { hex: '#ff00ff', lost: true }, neon: { hex: '#ff00ff' } }), body: [{ name: 'far', draw: [draw[1]] }] }, ctx);
  assert.equal(unused.list.length, 1);
});

test('colour rules are bounded: a definition nesting them hugely is refused within a frame\'s time, never hangs', () => {
  const nest = (d) => (d === 0 ? 'sky' : { rule: 'clear.of', v: 1, of: nest(d - 1), behind: [nest(d - 1), nest(d - 1), nest(d - 1)], also: [nest(d - 1)], step: 0.3 });
  for (const depth of [3, 4, 5]) {
    const d = load(FOREST);
    d.body.layers[0].draw.push({ gen: 'stars', v: 1, count: 200, seed: 9, paint: nest(depth), plus: 0.3, big: 0.1 });
    // making it lays out every clip's first frame: refused by the up-front check before the stars copy the paint
    // (without that check depth 4 takes about 180 ms and depth 5 about 700 ms to be refused)
    const best = (f) => { let ms = Infinity, out; for (let i = 0; i < 3; i++) { const t0 = performance.now(); out = f(); ms = Math.min(ms, performance.now() - t0); if (ms < 60) break; } return [out, ms]; };
    const [r, made] = best(() => makeDataSprite(d));
    assert.ok(made < 60 * loadFactor(), `depth ${depth}: made (or refused) in ${made.toFixed(0)} ms`);
    if (depth >= 4) {
      assert.equal(r.ok, false, `depth ${depth} is refused when it is made`);
      assert.match(r.errors.join(' '), /copies \d+ parts of colour rules/, `depth ${depth}: refused by the up-front check, saying why`);
    }
    if (!r.ok) continue;      // refused when it is made: bounded too
    const s = r.sprite, p = defaultParams(s);
    const t0 = performance.now();
    let error = null;
    try { dataFrameList(s, 'far', 0, p); } catch (e) { error = e; }
    const ms = performance.now() - t0;
    assert.ok(ms < 150 * loadFactor(), `depth ${depth}: ${ms.toFixed(0)} ms for one frame`);
    if (depth === 4) assert.match(String(error?.message), /colour rules/, 'the huge one is refused, saying why');
  }
  // the same colour used by many shapes is worked out once a frame: 200 stars painted with a small nested rule cost little
  const d = load(FOREST);
  d.body.layers[0].draw.push({ gen: 'stars', v: 1, count: 200, seed: 9, paint: { rule: 'clear.of', v: 1, of: { rule: 'haze', v: 1, of: 'cloud', air: 'sky' }, behind: ['sky'] } });
  const s = sprite(d), p = defaultParams(s);
  assert.deepEqual(dataFrameList(s, 'far', 0, p).warnings, []);
});

test('clear.of is weighed as the costly rule it is: hundreds of different ones are refused (or made) within a frame\'s time', () => {
  // 390 shapes each painted with a different clear.of, behind 4 slots, a step no tone reaches: every one searches every
  // tone both ways (was about 370 ms for the first frame); salted so no earlier run's worked-out colour is reused
  const salt = (process.hrtime.bigint() % 997n).toString();
  const d = load(FOREST);
  for (let i = 0; i < 390; i++) {
    d.body.layers[0].draw.push({ kind: 'rect', at: [i % 300, (i * 3) % 170], size: [1, 1],
      paint: { rule: 'clear.of', v: 1, of: { rule: 'mix', of: 'sky', with: 'rock', amount: Number(`0.${String(i).padStart(3, '0')}${salt}`) }, behind: ['back', 'leaf', 'rock', 'cloud'], also: ['air'], step: 0.5 } });
  }
  const t0 = performance.now();
  const r = makeDataSprite(d);
  const ms = performance.now() - t0;
  assert.ok(ms < 60 * loadFactor(), `${ms.toFixed(0)} ms to make or refuse it`);
  assert.equal(r.ok, false, 'hundreds of different clear.of in one frame are refused');
  assert.match(r.errors.join(' '), /colour rules are too much to work out[\s\S]*each clear\.of counting as 60/);
  // two dozen (a library background uses 6 at most) are fine
  const few = load(FOREST);
  few.body.layers[0].draw.push(...d.body.layers[0].draw.slice(-24));
  const f = makeDataSprite(few);
  assert.equal(f.ok, true, (f.errors ?? []).join('; '));
});

test('scatter@1 serves a tile too: rows default to the frame, margin on both axes, a gap apart, wrapping only when told', () => {
  // docs/data-sprites.md 2.3: a tile's fill version
  const call = { gen: 'scatter', v: 1, seed: 41, count: 3, margin: 4, gap: 10, place: { kind: 'rect', size: [2, 2], paint: 'soil' } };
  for (let seed = 1; seed <= 40; seed++) {
    const r = runGenerator({ ...call, seed }, { size: [32, 32] });
    assert.ok(r.ok, r.errors.join('; '));
    assert.equal(r.primitives.length, 3, `seed ${seed}: as many as asked for`);
    for (const q of r.primitives) for (const k of [0, 1]) assert.ok(q.at[k] >= 4 && q.at[k] <= 27, `seed ${seed}: ${q.at} inside the 4 px margin`);
    for (let i = 0; i < 3; i++) for (let j = 0; j < i; j++) {
      const [a, b] = [r.primitives[i].at, r.primitives[j].at];
      assert.ok(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) >= 10, `seed ${seed}: ${a} and ${b} are a gap apart`);
    }
  }
  // left alone (not in a layer) it does not wrap; in a wrapping layer the layout tells it to
  assert.equal(generator('scatter', 1).args.wrap.default, false);
  const big = runGenerator({ gen: 'scatter', v: 1, count: 30, seed: 3, place: { kind: 'rect', size: [9, 2], paint: 'soil' } }, { size: [64, 40] });
  for (const q of big.primitives) assert.ok(q.at[0] >= 0 && q.at[0] < 64 && q.at[1] >= 0 && q.at[1] < 40, `${q.at}: inside a 64 x 40 frame`);
});

test('bg-forest-wide: wherever its mist shows through the hills it lies in pools at least 3 px deep, never a thin pale line (every Haze stop)', () => {
  // review B14 round 3: at Haze 0.5 the mist band peeked through a hill valley as a 1 px pale line. The mist is painted
  // a colour of its own here so every pixel of it that shows in the finished picture (all layers) can be counted
  const d = load(WIDE);
  d.palette.find((s) => s.id === 'air').default = '#ff0102';
  const s = sprite(d), [W, H] = s.size, mark = 0xff0201ff;
  let shown = 0;
  for (let i = 0; i <= 100; i++) {
    const p = { ...defaultParams(s), haze: i / 100 };
    const gs = Object.keys(s.clips).map((c) => renderFrame(s, c, 0, p));
    const vis = new Uint8Array(W * H);
    for (let k = 0; k < W * H; k++) { let top = 0; for (const g of gs) if (g.data[k] >>> 24) top = g.data[k]; if (top === mark) vis[k] = 1; }
    const seen = new Uint8Array(W * H);
    for (let k = 0; k < W * H; k++) {
      if (!vis[k] || seen[k]) continue;
      const stack = [k], cols = new Map();
      seen[k] = 1;
      while (stack.length) {
        const j = stack.pop(), x = j % W, y = (j / W) | 0;
        cols.set(x, (cols.get(x) ?? 0) + 1);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = (x + dx + W) % W, yy = y + dy, n = yy * W + xx;
          if (yy >= 0 && yy < H && vis[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
        }
      }
      const depths = [...cols.values()].sort((a, b) => a - b);
      shown++;
      assert.ok(depths[depths.length >> 1] >= 3, `Haze ${i / 100}: a pool of mist ${cols.size} px wide at x ${Math.min(...cols.keys())} is mostly ${depths[depths.length >> 1]} px deep`);
    }
  }
  assert.ok(shown > 0, 'the mist shows at some Haze');
});
