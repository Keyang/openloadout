// The backdrop helper (style guide sections 7 and 14): outlines and scattered positions
// that wrap exactly at 320 px, colours that recede toward the sky, the sky of a time of day.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { brightness, mix, hexToRgb, col } from '../../engine/color.js';
import { PALETTES, THEME_PRESETS, applyColour } from '../../engine/theme.js';
import { seamCheck } from '../../quality/sprite.js';
import {
  LAYER, PIVOT, SCROLL, TIMES, layerClips, wrapX, wrapGap,
  ridge, treeline, battlements, highest, shifted, litEdge,
  scatter, recede, hazed, standOut, litTone, skyLook,
  fillBands, fillBelow, fillBetween, wrapped, disc, cloud, canopy, stars, mistBand, tidy,
} from '../../engine/backdrop.js';

const HEX = /^#[0-9a-f]{6}$/;
const [W, H] = LAYER;
const XS = [0, 0.5, 1, 17.25, 63, 159.5, 160, 200.75, 318, 319, 319.5];
const columns = (f) => Array.from({ length: W }, (_, x) => f(x + 0.5));
const largestStep = (ys) => ys.slice(1).reduce((m, y, i) => Math.max(m, Math.abs(y - ys[i])), 0);
const sameNumber = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} vs ${b}`);
const layer = () => new Surface(W, H);
const count = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const distance = (a, b) => { const A = hexToRgb(a), B = hexToRgb(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };

// An outline is a function x -> y. It wraps when it has the same value 320 px on, and
// the step across the join is no bigger than the steps inside.
function assertWraps(f, what) {
  for (const x of XS) {
    sameNumber(f(x), f(x + W), `${what} at ${x} + 320`);
    sameNumber(f(x), f(x - W), `${what} at ${x} - 320`);
    sameNumber(f(x), f(x + 3 * W), `${what} at ${x} + 960`);
  }
  const ys = columns(f);
  assert.ok(Math.abs(ys[W - 1] - ys[0]) <= largestStep(ys) + 1e-9, `${what}: step across the join ${Math.abs(ys[W - 1] - ys[0])} vs largest inside ${largestStep(ys)}`);
}

test('a layer is 320x180, anchored at its bottom centre, with the three scroll speeds', () => {
  assert.deepEqual(LAYER, [320, 180]);
  assert.deepEqual(PIVOT, [160, 180]);
  assert.deepEqual(SCROLL, { far: 0.1, mid: 0.4, near: 0.7 });
  assert.deepEqual(TIMES, ['day', 'dusk', 'night']);
});

test('layerClips gives far, mid, near in that order, one still frame each', () => {
  const c = layerClips();
  assert.deepEqual(Object.keys(c), ['far', 'mid', 'near']);
  for (const k of Object.keys(c)) assert.deepEqual({ frames: c[k].frames, fps: c[k].fps, loop: c[k].loop }, { frames: 1, fps: 4, loop: true }, k);
  assert.deepEqual(Object.values(c).map((x) => x.label), ['Far', 'Middle', 'Near']);
  assert.notEqual(layerClips().far, layerClips().far, 'a fresh object every time: defineSprite writes into it');
});

test('layerClips takes a frame count and a speed for layers where something drifts', () => {
  const fps = (p) => 4 * p.speed;
  const c = layerClips({ frames: 8, fps });
  assert.equal(c.far.frames, 8);
  assert.equal(c.near.fps, fps);
  const only = layerClips({ frames: { far: 8 } });
  assert.deepEqual([only.far.frames, only.mid.frames, only.near.frames], [8, 1, 1]);
});

test('wrapX folds any x into 0..320 and wrapGap is the short way round', () => {
  assert.equal(wrapX(0), 0);
  assert.equal(wrapX(320), 0);
  assert.equal(wrapX(-1), 319);
  assert.equal(wrapX(645.5), 5.5);
  assert.equal(wrapGap(5, 315), 10);
  assert.equal(wrapGap(315, 5), -10);
  assert.equal(wrapGap(100, 40), 60);
  assert.equal(Math.abs(wrapGap(160, 0)), 160);
});

test('ridge outlines wrap exactly at 320 px, round and jagged', () => {
  for (const shape of ['round', 'jagged']) for (const seed of [1, 2, 7, 99]) {
    assertWraps(ridge({ base: 120, height: 50, seed, shape }), `${shape} ridge seed ${seed}`);
    assertWraps(ridge({ base: 120, height: 50, seed, shape, peaks: 3, rough: 1 }), `${shape} ridge, 3 peaks, rough`);
  }
});

test('a ridge stays between its base and its height, and uses most of it', () => {
  for (const shape of ['round', 'jagged']) for (const seed of [1, 5, 31]) {
    const ys = columns(ridge({ base: 130, height: 40, seed, shape }));
    assert.ok(Math.max(...ys) <= 130 + 1e-9, `${shape}: never below its base`);
    assert.ok(Math.min(...ys) >= 90 - 1e-9, `${shape}: never above base - height`);
    assert.ok(Math.max(...ys) - Math.min(...ys) >= 40 * 0.6, `${shape}: uses at least 60% of its height (${Math.max(...ys) - Math.min(...ys)})`);
  }
});

test('a ridge has the number of peaks asked for, and height 0 is a flat line', () => {
  for (const peaks of [2, 3, 5, 8]) {
    const ys = columns(ridge({ base: 100, height: 40, seed: 3, peaks, rough: 0 }));
    let tops = 0;
    for (let x = 0; x < W; x++) { const a = ys[(x + W - 1) % W], b = ys[x], c = ys[(x + 1) % W]; if (b < a && b <= c) tops++; }
    assert.equal(tops, peaks, `${peaks} peaks`);
  }
  assert.ok(columns(ridge({ base: 77, height: 0, seed: 1 })).every((y) => y === 77));
});

test('ridges are deterministic and differ by seed', () => {
  const a = columns(ridge({ base: 100, height: 30, seed: 4 })), b = columns(ridge({ base: 100, height: 30, seed: 4 }));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, columns(ridge({ base: 100, height: 30, seed: 5 })));
});

test('treeline outlines wrap exactly at 320 px, round and pointed, on flat ground and on a ridge', () => {
  const ground = ridge({ base: 140, height: 30, seed: 2 });
  for (const shape of ['round', 'pointed']) for (const seed of [1, 3, 12]) {
    assertWraps(treeline({ base: 150, height: 30, count: 9, seed, shape }), `${shape} treeline seed ${seed}`);
    assertWraps(treeline({ base: ground, height: 22, count: 14, seed, shape }), `${shape} treeline on a ridge, seed ${seed}`);
  }
});

test('a treeline rises above its ground by up to its height, never sinks below it, and is deterministic', () => {
  const hills = ridge({ base: 140, height: 30, seed: 2 });
  for (const shape of ['round', 'pointed']) for (const [name, ground] of [['flat', () => 150], ['hills', hills]]) {
    const f = treeline({ base: ground, height: 24, count: 12, seed: 5, shape });
    let rise = 0;
    for (let x = 0.5; x < W; x++) {
      assert.ok(f(x) <= ground(x) + 1e-9, `${shape} on ${name}: at or above the ground at ${x}`);
      rise = Math.max(rise, ground(x) - f(x));
    }
    assert.ok(rise > 24 * 0.9, `${shape} on ${name}: the tallest tree is as tall as asked (${rise} of 24)`);
    if (name === 'flat') assert.ok(rise <= 24 + 1e-9, `${shape}: no tree taller than asked (${rise})`);
    assert.deepEqual(columns(f), columns(treeline({ base: ground, height: 24, count: 12, seed: 5, shape })));
    assert.notDeepEqual(columns(f), columns(treeline({ base: ground, height: 24, count: 12, seed: 6, shape })));
  }
});

test('trees stand upright on a slope, and a treeline takes positions of your own', () => {
  const slope = ridge({ base: 150, height: 60, seed: 1, peaks: 2, rough: 0 });
  const at = [{ x: 100, u: 1, v: 0.5 }, { x: 318, u: 1, v: 0.5 }];
  const f = treeline({ base: slope, height: 20, at });
  sameNumber(f(100.5), slope(100.5) - 20, 'the top of the tree is its height above the ground under its middle');
  assert.ok(f(60.5) === slope(60.5) && f(200.5) === slope(200.5), 'bare ground where there is no tree');
  // upright: the crown is level with itself left and right of the middle, whatever the slope does
  sameNumber(f(95.5), f(105.5), 'same height 5 px either side');
  assert.ok(f(0.5) < slope(0.5) && f(319.5) < slope(319.5), 'the tree at 318 shows on both sides of the join');
  assertWraps(f, 'treeline with its own positions');
});

test('battlements fit a whole number of teeth into 320 px', () => {
  for (const [tooth, gap] of [[8, 8], [10, 6], [7, 6], [12, 9]]) {
    const f = battlements(100, { tooth, gap, depth: 6 });
    assertWraps(f, `battlements ${tooth}+${gap}`);
    const ys = columns(f);
    let rises = 0;
    for (let x = 0; x < W; x++) if (ys[x] < ys[(x + W - 1) % W]) rises++;
    assert.equal(rises, Math.round(W / (tooth + gap)), `${tooth}+${gap}: one rise per tooth`);
    assert.deepEqual([...new Set(ys)].sort((a, b) => a - b), [94, 100], 'tooth tops and gaps only');
    // every tooth is the same width: the join does not cut one
    const widths = [];
    let run = 0;
    const start = ys.findIndex((y, x) => y === 94 && ys[(x + W - 1) % W] === 100);
    for (let i = 0; i < W; i++) { const y = ys[(start + i) % W]; if (y === 94) run++; else if (run) { widths.push(run); run = 0; } }
    assert.ok(Math.max(...widths) - Math.min(...widths) <= 1, `${tooth}+${gap}: tooth widths ${[...new Set(widths)]}`);
  }
  const onRidge = battlements(ridge({ base: 100, height: 10, seed: 1 }), { tooth: 8, gap: 8, depth: 5 });
  assertWraps(onRidge, 'battlements on a ridge');
});

test('highest, shifted and litEdge keep an outline wrapping', () => {
  const a = ridge({ base: 120, height: 40, seed: 1, shape: 'jagged' }), b = ridge({ base: 110, height: 20, seed: 9 });
  const top = highest(a, b);
  assertWraps(top, 'highest');
  for (const x of XS) assert.equal(top(x), Math.min(a(x), b(x)));
  const s = shifted(a, 33, 4);
  assertWraps(s, 'shifted');
  sameNumber(s(50), a(17) + 4, 'shifted moves right and down');
  const lit = litEdge(a, { depth: 0.8 });
  assertWraps(lit, 'litEdge');
  let litColumns = 0;
  for (let x = 0.5; x < W; x++) { assert.ok(lit(x) >= a(x) - 1e-9, 'the lit band never starts above the outline'); if (lit(x) > a(x) + 2) litColumns++; }
  assert.ok(litColumns > 40 && litColumns < 280, `light falls on some faces and not on others (${litColumns} of 320 columns)`);
});

test('scatter gives wrapping positions: inside 0..320, one per slot, even across the join', () => {
  for (const count of [1, 2, 5, 12, 40]) for (const seed of [1, 2, 77]) {
    const pts = scatter(count, seed);
    assert.equal(pts.length, count);
    for (const p of pts) {
      assert.ok(p.x >= 0 && p.x < W, `x ${p.x} inside 0..320`);
      for (const k of ['u', 'v', 'w']) assert.ok(p[k] >= 0 && p[k] < 1, `${k} is 0..1`);
    }
    assert.deepEqual(pts.map((p) => p.i), Array.from({ length: count }, (_, i) => i), 'in order, numbered');
    const slot = W / count;
    // the gap from each to the next, going round the join, is never more than two slots and never under a fifth of one
    for (let i = 0; i < count && count > 1; i++) {
      const gap = wrapX(pts[(i + 1) % count].x - pts[i].x) || W;
      assert.ok(gap <= slot * 2 + 1e-9 && gap >= slot * 0.2 - 1e-9, `count ${count} seed ${seed}: gap ${gap} for slot ${slot}`);
    }
  }
  assert.deepEqual(scatter(0, 1), []);
});

test('scatter is deterministic, differs by seed, and whole positions stay whole', () => {
  assert.deepEqual(scatter(9, 4), scatter(9, 4));
  assert.notDeepEqual(scatter(9, 4).map((p) => p.x), scatter(9, 5).map((p) => p.x));
  assert.ok(scatter(9, 4).every((p) => Number.isInteger(p.x)), 'positions are whole pixels');
  const even = scatter(8, 3, { jitter: 0 });
  assert.deepEqual(even.map((p) => p.x), [20, 60, 100, 140, 180, 220, 260, 300], 'no jitter: evenly spaced, centred in each slot');
});

test('a stable scatter keeps what is there when one more is added, and stays spread out', () => {
  const few = scatter(4, 9, { stable: true }), many = scatter(7, 9, { stable: true });
  assert.equal(few.length, 4);
  assert.equal(many.length, 7);
  for (const p of few) assert.ok(many.some((q) => q.x === p.x && q.u === p.u && q.i === p.i), 'the first four are still there among the seven');
  for (const count of [3, 6, 11]) for (const seed of [1, 9, 40]) {
    const pts = scatter(count, seed, { stable: true });
    assert.deepEqual(pts.map((p) => p.x), [...pts.map((p) => p.x)].sort((a, b) => a - b), 'left to right');
    assert.deepEqual(pts.map((p) => p.i).sort((a, b) => a - b), Array.from({ length: count }, (_, i) => i));
    for (let i = 0; i < count; i++) {
      assert.ok(pts[i].x >= 0 && pts[i].x < W);
      const gap = wrapX(pts[(i + 1) % count].x - pts[i].x) || W;
      assert.ok(gap <= (W / count) * 2.2 && gap >= (W / count) * 0.3, `stable, count ${count} seed ${seed}: gap ${gap}`);
    }
  }
  assert.deepEqual(scatter(6, 2, { stable: true }), scatter(6, 2, { stable: true }));
});

test('recede moves a colour toward the sky as depth grows', () => {
  const sky = '#8fd0f0';
  for (const c of ['#3f8a4f', '#7a4f33', '#c9423a', '#231b33', '#f0ead8']) {
    let last = Infinity;
    for (const depth of [0, 0.25, 0.5, 0.75, 1]) {
      const r = recede(c, depth, sky);
      assert.match(r, HEX);
      const d = distance(r, sky);
      assert.ok(d < last, `${c} at depth ${depth} is nearer the sky than at the depth before`);
      last = d;
    }
    assert.equal(recede(c, 0, sky), mix(c, sky, 0.35), 'the nearest layer is already 35% of the way to the sky');
    assert.notEqual(recede(c, 1, sky), sky, 'the farthest layer still stands out from the sky');
    assert.ok(distance(recede(c, 1, sky), sky) <= distance(c, sky) * 0.2, 'at depth 1 at most a fifth of the difference is left');
    assert.equal(recede(c, -3, sky), recede(c, 0, sky));
    assert.equal(recede(c, 9, sky), recede(c, 1, sky));
    assert.equal(recede(c, 0.4, sky), recede(c, 0.4, sky));
  }
});

test('recede works against a dark sky too', () => {
  const night = '#2a2f5e';
  assert.ok(brightness(recede('#a4c44a', 0.2, night)) > brightness(recede('#a4c44a', 0.9, night)), 'a bright colour dims toward a night sky');
  assert.ok(brightness(recede('#231b33', 0.9, night)) >= brightness(recede('#231b33', 0, night)) - 1e-9);
});

test('hazed moves a layer deeper into the air as the Haze control rises, the same for every background', () => {
  for (const depth of [0, 0.1, 0.5, 0.8]) {
    assert.ok(hazed(depth, 0) < hazed(depth, 0.5) && hazed(depth, 0.5) < hazed(depth, 1) || hazed(depth, 1) === 1, `depth ${depth}`);
    assert.ok(hazed(depth, 0) >= 0 && hazed(depth, 1) <= 1);
  }
  assert.equal(hazed(0, 0), 0, 'the near layer in clear air is not pushed below depth 0');
  assert.ok(Math.abs(hazed(0.5, 0.25) - 0.5) < 1e-9, 'a quarter of the way up the slider leaves the depth as written');
  assert.ok(hazed(0.1, 1) < hazed(0.5, 1) && hazed(0.5, 1) < hazed(0.8, 1) + 1e-9, 'layers keep their order in the thickest haze');
  const sky = '#8fd0f0';
  assert.notEqual(recede('#3f8a4f', hazed(0.1, 0), sky), recede('#3f8a4f', hazed(0.1, 1), sky), 'so a Haze slider always changes the near layer');
});

test('mistBand lays a soft-topped band of air across the whole width, and wraps', () => {
  const g = layer();
  mistBand(g, 150, 12, '#ddeeff', 4);
  assert.deepEqual([g.bounds().x0, g.bounds().x1, g.bounds().y1], [0, W - 1, H - 1]);
  assert.ok(g.bounds().y0 >= 150 - 12 - 6 && g.bounds().y0 <= 150 - 12, `top of the mist at ${g.bounds().y0}`);
  assert.ok(seamCheck(g, g, 'x').ok);
  const none = layer();
  mistBand(none, 150, 0, '#ddeeff', 4);
  assert.ok(none.bounds().y0 >= 150 - 6, 'no thickness: only the ground-level wisp is left');
  const stopped = layer();
  mistBand(stopped, 150, 12, '#ddeeff', 4, { to: 160 });
  assert.equal(stopped.bounds().y1, 159);
});

// A colour as a whole-bundle colour setting (a palette, a tint ...) turns it.
const themed = (hex, colour) => applyColour(new Uint32Array([col(hex)]), colour)[0];

test('standOut keeps a shape a clear step of value away from what is behind it', () => {
  const air = '#c4eef2';
  for (const c of ['#a9dbe0', '#b8e6ea', '#c4eef2', '#9fd0d8', '#d0f4f6']) {
    const out = standOut(c, [air]);
    assert.match(out, HEX);
    assert.ok(Math.abs(brightness(out) - brightness(air)) >= 0.08 - 1e-9, `${c} -> ${out}: at least 8% of value away from ${air}`);
    assert.ok(brightness(out) < brightness(air), 'a shape in front of the light air goes darker, never lighter');
    assert.equal(standOut(c, [air]), out, 'deterministic');
  }
  assert.equal(standOut('#305040', [air]), '#305040', 'a colour that already stands out is returned as it is');
  assert.equal(standOut('#305040', []), '#305040');
  assert.ok(brightness(standOut('#c4eef2', [air], { step: 0.2 })) <= brightness(air) - 0.2 + 1e-9, 'the step can be asked for');
});

test('standOut survives every colour palette of the site: the shape never turns into the colour behind it', () => {
  const day = skyLook('#8fd0f0', 'day'), dusk = skyLook('#8696dc', 'dusk'), night = skyLook('#8fd0f0', 'night');
  const cases = [];
  for (const sky of [day, dusk, night]) for (const land of ['#7fb0b8', '#3f8a4f', '#5d6475', '#f0ead8', '#7a4f33']) {
    cases.push([recede(land, 0.7, sky.air), [sky.bands[1], sky.bands[2], sky.bands[3]]]);
    cases.push([recede(land, 0.4, sky.air), [sky.air]]);
  }
  assert.ok(PALETTES.length >= 8);
  for (const [c, behind] of cases) {
    const out = standOut(c, behind);
    for (const pal of PALETTES) for (const b of behind) {
      assert.notEqual(themed(out, { palette: pal.name }), themed(b, { palette: pal.name }), `${c} -> ${out} against ${b} under ${pal.name}`);
    }
    for (const pr of THEME_PRESETS) for (const b of behind) {
      assert.notEqual(themed(out, pr.theme.colour), themed(b, pr.theme.colour), `${c} -> ${out} against ${b} under the preset ${pr.name}`);
    }
  }
});

test('standOut works in a chain, each layer a step darker than the one behind', () => {
  const sky = skyLook('#8fd0f0', 'day');
  const ridgeTone = standOut(recede('#7fb0b8', 0.6, sky.air), [sky.air]);
  const hill = standOut(recede('#7fb0b8', 0.4, sky.air), [sky.air, ridgeTone]);
  const front = standOut(recede('#7fb0b8', 0.15, sky.air), [sky.air, ridgeTone, hill]);
  assert.ok(brightness(sky.air) > brightness(ridgeTone) && brightness(ridgeTone) > brightness(hill) && brightness(hill) > brightness(front));
  for (const pal of PALETTES) {
    const seen = new Set([sky.air, ridgeTone, hill, front].map((c) => themed(c, { palette: pal.name })));
    assert.equal(seen.size, 4, `four layers stay four colours under ${pal.name}`);
  }
  assert.ok(brightness(front) > 0.2, `and the nearest is still far from black (${front})`);
});

test('stars that straddle the join show on both sides of it', () => {
  // Draw the same stars on a layer twice as wide: nothing is cut off there. Folded back to
  // 320 px it must be exactly the 320 px picture, whatever sits on the join.
  let straddling = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const narrow = layer(), wide = new Surface(W * 2, H);
    stars(narrow, 60, seed, '#ffffff', { top: 0, bottom: 90 });
    stars(wide, 60, seed, '#ffffff', { top: 0, bottom: 90 });
    let crosses = false;
    for (let y = 0; y < H; y++) if (wide.get(W, y)) crosses = true;
    if (!crosses) continue;
    straddling++;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      assert.equal(!!narrow.get(x, y), !!(wide.get(x, y) || wide.get(x + W, y)), `seed ${seed}: pixel ${x},${y} of a star on the join`);
    }
    let onLeft = 0;
    for (let y = 0; y < H; y++) if (narrow.get(0, y)) onLeft++;
    assert.ok(onLeft > 0, `seed ${seed}: the star that leaves on the right comes back in at column 0`);
  }
  assert.ok(straddling >= 3, `the test met stars on the join (${straddling} seeds)`);
});

test('litTone is the sunlit tone of a shape: lighter than its base, never lighter than the air by day', () => {
  const air = '#c4eef2';
  for (const base of ['#6c9d8b', '#8fb8c0', '#5d6475', '#b9dfe2']) {
    const lit = litTone(base, air);
    assert.ok(brightness(lit) > brightness(base), `${base}: lighter than the base`);
    assert.ok(brightness(lit) <= brightness(air) + 1e-9, `${base}: not lighter than the air`);
    assert.ok(brightness(litTone(base, air, 0.6)) > brightness(litTone(base, air, 0.2)), 'more light, lighter');
  }
  const night = '#3a4a80';
  assert.ok(brightness(litTone('#6f86b0', night)) > brightness('#6f86b0'), 'under a dark sky a moonlit shape still gets a lighter tone');
});

test('tidy removes isolated single pixels, across the join too, and leaves everything else alone', () => {
  const g = layer();
  g.rect(0, 100, W, 80, '#446688');
  g.rect(40, 40, 6, 6, '#ffffff');                 // a 6x6 block stays
  g.rect(100, 50, 2, 2, '#ffffff');                // a 2x2 star stays
  const before = Uint32Array.from(g.data);
  g.dot(200, 30, '#ffffff');                       // a lone pixel in the open: removed
  g.dot(150, 140, '#ff0000');                      // a lone pixel inside a shape: takes the shape's colour
  g.dot(0, 150, '#00ff00');                        // one on the join
  g.data[160 * W + 60] = 0;                        // a one-pixel hole: filled
  tidy(g);
  assert.deepEqual(g.data, before);
  const pair = layer();
  pair.rect(319, 20, 1, 1, '#ffffff'); pair.rect(0, 20, 1, 1, '#ffffff');      // two pixels that touch across the join are not alone
  tidy(pair);
  assert.equal(count(pair), 2);
  const peaks = layer();
  const f = ridge({ base: 150, height: 80, seed: 3, peaks: 4, shape: 'jagged', rough: 0.55 });
  fillBelow(peaks, f, '#88aabb'); fillBetween(peaks, f, litEdge(f), '#aaccdd');
  tidy(peaks);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = peaks.get(x, y), same = (dx, dy) => peaks.get((x + dx + W) % W, y + dy) === v && y + dy >= 0 && y + dy < H;
    assert.ok(same(1, 0) || same(-1, 0) || same(0, 1) || same(0, -1), `lone pixel left at ${x},${y}`);
  }
  assert.ok(seamCheck(peaks, peaks, 'x').ok);
});

test('skyLook gives four bands, lightest at the horizon, for every time of day', () => {
  for (const sky of ['#8fd0f0', '#8696dc', '#f0b890', '#9fd8f4']) for (const time of TIMES) {
    const s = skyLook(sky, time);
    assert.equal(s.bands.length, 4);
    for (const b of s.bands) assert.match(b, HEX);
    for (let i = 1; i < 4; i++) assert.ok(brightness(s.bands[i]) > brightness(s.bands[i - 1]), `${sky} ${time}: band ${i} is lighter than the one above it`);
    assert.equal(new Set(s.bands).size, 4);
    assert.match(s.air, HEX);
    assert.match(s.glow, HEX);
    assert.match(s.cloud, HEX);
    assert.ok(brightness(s.glow) > brightness(s.bands[0]), 'the sun or moon shows against the top of the sky');
    assert.equal(s.time, time);
  }
});

test('skyLook: night is darker than dusk, dusk darker than day, and the sky colour still matters at night', () => {
  const mean = (s) => s.bands.reduce((a, b) => a + brightness(b), 0) / 4;
  const sky = '#8fd0f0';
  assert.ok(mean(skyLook(sky, 'day')) > mean(skyLook(sky, 'dusk')));
  assert.ok(mean(skyLook(sky, 'dusk')) > mean(skyLook(sky, 'night')));
  assert.ok(brightness(skyLook(sky, 'night').air) < 0.45);
  for (const time of TIMES) assert.notDeepEqual(skyLook('#8fd0f0', time).bands, skyLook('#f0b890', time).bands, time);
  assert.deepEqual(skyLook(sky, 'dusk'), skyLook(sky, 'dusk'));
  assert.throws(() => skyLook(sky, 'noon'), /day, dusk, night/);
});

test('fillBands covers the whole layer with flat bands', () => {
  const g = layer();
  fillBands(g, ['#101010', '#404040', '#808080', '#c0c0c0'], [40, 80, 120]);
  assert.equal(count(g), W * H);
  for (const [y, c] of [[0, 0x10], [39, 0x10], [40, 0x40], [79, 0x40], [80, 0x80], [119, 0x80], [120, 0xc0], [179, 0xc0]]) {
    assert.equal(g.get(0, y) & 255, c, `row ${y}`);
    assert.equal(g.get(319, y) & 255, c, `row ${y}, right edge`);
  }
});

test('fillBelow fills every column from the outline down, spans the full width and joins itself', () => {
  for (const shape of ['round', 'jagged']) {
    const f = ridge({ base: 130, height: 60, seed: 6, shape });
    const g = layer();
    fillBelow(g, f, '#446688');
    assert.deepEqual([g.bounds().x0, g.bounds().x1, g.bounds().y1], [0, W - 1, H - 1]);
    for (let x = 0; x < W; x += 13) {
      const top = Math.round(f(x + 0.5));
      assert.equal(g.get(x, top - 1), 0, `see-through above the outline at ${x}`);
      assert.notEqual(g.get(x, top), 0, `filled from the outline at ${x}`);
      assert.notEqual(g.get(x, H - 1), 0);
    }
    assert.ok(seamCheck(g, g, 'x').ok, `${shape}: the checker's own wrap test passes`);
  }
});

test('fillBelow can stop at a row and fillBetween fills only between two outlines', () => {
  const g = layer();
  fillBelow(g, () => 100, '#ff0000', { to: 120 });
  assert.equal(count(g), W * 20);
  const h = layer();
  const top = ridge({ base: 100, height: 30, seed: 2 });
  fillBetween(h, top, shifted(top, 0, 5), '#00ff00');
  assert.equal(count(h), W * 5);
  assert.ok(seamCheck(h, h, 'x').ok);
});

test('wrapped draws a thing that crosses the join on both sides', () => {
  const calls = [];
  wrapped(100, 20, (x) => calls.push(x));
  assert.deepEqual(calls, [100]);
  calls.length = 0;
  wrapped(310, 20, (x) => calls.push(x));
  assert.deepEqual(calls, [310, -10]);
  calls.length = 0;
  wrapped(5, 20, (x) => calls.push(x));
  assert.deepEqual(calls, [5, 325]);
  calls.length = 0;
  wrapped(-4, 20, (x) => calls.push(x));
  assert.deepEqual(calls, [316, -4], 'a position outside 0..320 is folded in first');
});

test('discs, clouds, canopies and stars that straddle the join are whole on both sides', () => {
  const tones = { light: '#88cc88', base: '#559955', dark: '#336633' };
  const draws = {
    disc: (g, x) => disc(g, x, 60, 14, '#ffeeaa'),
    cloud: (g, x) => cloud(g, x, 60, 46, '#ffffff', '#ccccdd'),
    canopy: (g, x) => canopy(g, x, 70, 26, tones, 5),
  };
  for (const [name, draw] of Object.entries(draws)) {
    const mid = layer(), edge = layer(), over = layer();
    draw(mid, 160); draw(edge, 0); draw(over, 320);
    assert.ok(count(mid) > 150, `${name} draws something`);
    assert.equal(count(edge), count(mid), `${name}: as many pixels at the join as in the middle`);
    assert.deepEqual(edge.data, over.data, `${name}: x = 0 and x = 320 are the same place`);
    assert.ok(edge.bounds().x0 === 0 && edge.bounds().x1 === W - 1, `${name}: on both edges`);
    assert.ok(seamCheck(edge, edge, 'x').ok, `${name}: the checker's wrap test passes`);
    // the half on the right edge is the left half of the one in the middle
    for (let y = 0; y < H; y += 3) for (let dx = -20; dx < 20; dx += 3) assert.equal(edge.get(wrapX(dx), y), mid.get(160 + dx, y), `${name} at ${dx},${y}`);
  }
  const a = layer(), b = layer();
  stars(a, 40, 3, '#ffffff', { top: 0, bottom: 90 });
  stars(b, 40, 3, '#ffffff', { top: 0, bottom: 90 });
  assert.deepEqual(a.data, b.data, 'stars are deterministic');
  assert.ok(count(a) >= 40 * 4, 'no star is smaller than 2x2');
  assert.ok(a.bounds().y1 < 90, 'stars stay in their rows');
  assert.ok(seamCheck(a, a, 'x').ok);
});

test('a canopy uses its three tones and is deterministic', () => {
  const tones = { light: '#88cc88', base: '#559955', dark: '#336633' };
  const a = layer(), b = layer(), c = layer();
  canopy(a, 100, 80, 30, tones, 2); canopy(b, 100, 80, 30, tones, 2); canopy(c, 100, 80, 30, tones, 3);
  assert.deepEqual(a.data, b.data);
  assert.notDeepEqual(a.data, c.data, 'another seed, another shape');
  assert.equal(new Set(a.data).size, 4, 'three tones and see-through');
  const box = a.bounds();
  assert.ok(box.x1 - box.x0 >= 40 && box.x1 - box.x0 <= 2 * 30 + 12, `about as wide as asked (${box.x1 - box.x0})`);
});

test('the example at the top of the helper draws a seamless three-layer backdrop', async () => {
  const { example } = await import('../../engine/backdrop.js');
  const layers = example();
  assert.deepEqual(Object.keys(layers), ['far', 'mid', 'near']);
  for (const [name, g] of Object.entries(layers)) {
    assert.deepEqual([g.w, g.h], LAYER);
    assert.deepEqual([g.bounds().x0, g.bounds().x1], [0, W - 1], `${name} spans the width`);
    assert.ok(seamCheck(g, g, 'x').ok, `${name} wraps`);
  }
  assert.equal(count(layers.far), W * H, 'far is solid');
  assert.ok(count(layers.mid) < W * H && count(layers.near) < W * H, 'mid and near are see-through above their shapes');
});
