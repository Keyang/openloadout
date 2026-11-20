// Follow-up F4 (migration batch M1's third review, its issues 1 and 5): two framework gaps the pickup redraws hit.
//   1. A node's `scale` moves what is drawn on it but does not resize its whole-pixel things: a stamp or a rect, written
//      or given back by a generator (gem.cut@2 is one stamp), keeps its pixel size while its corner moves out, so a gem
//      heart on a node scaled by Size drifts off centre and steps wrong. That stays so for every node `scale` (pictures@1
//      is released: candy, coin-pouch, fruit and gold-key put stamps on scaled nodes), and a motion may now give a node
//      a STRETCH [sx, sy] (engine/gen/pictures.js, rule 4): everything drawn on the node and the nodes under it is drawn
//      that much bigger about the node's origin on each screen axis, shapes, stamps (resampled pixel for pixel, as the
//      code's placedIn sampled a shape), rects and generator output alike. node.size@1 is that motion for a node's
//      size (one scale, or two axes: the two-axis [sx, sy] scale a node's own `scale` cannot hold).
//   2. pickup.collect@1 squashes only token@1 calls (MOTION_TARGETS): pickup.collect.whole@1 squashes and stretches the
//      whole node through its stretch (frame 1 wide and low, frame 2 thin and tall, the swell, the shrink), and hides
//      what is on it once it is under 0.3 of its size, as engine/pickups.js pickupPose did ("show: scale > 0.3"). It is
//      a generator of its own rather than pickup.collect@2 (engine/gen/motion.js says why).
import test from 'node:test';
import assert from 'node:assert/strict';
import { dataSprite, dataFrameList } from '../../engine/data-sprite.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import { generator, checkCall } from '../../engine/gen/index.js';
import { MOTION_TARGETS, STRETCH_TARGETS } from '../../engine/gen/motion.js';
import { stretchPrimitive } from '../../engine/gen/pictures.js';

const META = { type: 'pickup', role: 'items/pickup', view: 'front', themes: ['fantasy'], gameTypes: ['platformer'], words: ['test', 'stretch', 'node', 'pickup', 'size', 'squash'], license: 'draft' };
const CTX = (t, loop = true) => Object.freeze({ t, frame: 0, frames: 8, loop, size: [32, 32], clip: 'x', direction: null });

/** A pictures sprite: node `n` at [16, 16] (child `c` at [4, 0]) holding `draw`, moved by `motion`, with a Size slider 0..1 for bindings. */
function sprite(draw, motion = [], { nodeScale, emitters, clips } = {}) {
  return dataSprite({
    format: 'loadout-sprite', version: 2, id: 'test-stretch', name: 'Stretch', blurb: 'A test of a stretched node.', size: [32, 32], pivot: [16, 30], grounded: false, meta: META,
    palette: [{ id: 'gold', label: 'Gold', default: '#f2c230', material: 'metal' }, { id: 'shine', default: '#ffffff', material: 'light', detail: true }],
    controls: [{ key: 'size', kind: 'range', label: 'Size', default: 0.5 }],
    body: { pictures: {
      nodes: [{ id: 'n', parent: null, at: [16, 16], ...(nodeScale ? { scale: nodeScale } : {}) }, { id: 'c', parent: 'n', at: [4, 0] }],
      draw: [...draw, NAMES_SIZE], motion, ...(emitters ? { emitters } : {}),
    } },
    clips: clips ?? { idle: { frames: 1, fps: 10 } },
  });
}
// a hidden dot whose `when` names the Size slider, so the validator keeps a slider nothing else binds
const NAMES_SIZE = { id: 'names-size', kind: 'dot', on: 'n', at: [0, 0], paint: 'gold', hidden: true, when: { size: [{ atLeast: 0 }] } };
/** The box of the solid pixels: { x0, y0, x1, y1 } inclusive, or null. */
function box(g) {
  let x0 = 99, y0 = 99, x1 = -1, y1 = -1;
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    if (!(g.data[y * g.w + x] >>> 24)) continue;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, cx: (x0 + x1 + 1) / 2, cy: (y0 + y1 + 1) / 2 };
}
const solid = (g) => g.data.filter((v) => v >>> 24).length;
const draw = (s, clip = 'idle', frame = 0, size = 0.5) => renderFrame(s, clip, frame, { ...defaultParams(s), size });
const same = (a, b) => a.w === b.w && a.h === b.h && a.data.every((v, i) => v === b.data[i]);

const STAMP = { id: 'st', kind: 'stamp', on: 'n', at: [0, 0], anchor: 'c', rows: ['aaaa', 'abba', 'abba', 'aaaa'], key: { a: 'gold', b: 'shine' } };
const POLY = { id: 'sq', kind: 'poly', on: 'n', points: [[-3, -3], [3, -3], [3, 3], [-3, 3]], paint: 'gold', shade: 0 };
const ELLIPSE = { id: 'el', kind: 'ellipse', on: 'n', at: [0, 0], r: [4, 2], paint: 'gold', shade: 0 };
const RECT = { id: 'rc', kind: 'rect', on: 'n', at: [-2, -3], size: [4, 6], paint: 'gold' };
const GEM = { id: 'gem', gen: 'gem.cut', v: 2, on: 'n', at: [0, 0], r: [6, 5], cut: 'heart', facets: true, paint: 'gold', shine: 'shine' };
const SIZED = (scale, extra = {}) => ({ gen: 'node.size', v: 1, node: 'n', scale, ...extra });

// ---- the motions ---------------------------------------------------------------------------------------------------

test('node.size@1 and pickup.collect.whole@1 are registered motions; pickup.collect@1 is unchanged', () => {
  for (const [id, v] of [['node.size', 1], ['node.hide', 1], ['pickup.collect.whole', 1], ['pickup.collect', 1]]) assert.equal(generator(id, v)?.family, 'motion', `${id}@${v}`);
  assert.deepEqual([...STRETCH_TARGETS['node.size@1']], []);
  assert.deepEqual([...STRETCH_TARGETS['node.hide@1']], []);
  assert.deepEqual([...STRETCH_TARGETS['pickup.collect.whole@1']].sort(), ['token.bare', 'token.sheen', 'token.spin']);
  for (const [key, names] of Object.entries(STRETCH_TARGETS)) {
    const [id, v] = key.split('@');
    const seen = new Set();
    for (const t of [0, 0.25, 0.5, 0.75, 1]) for (const m of generator(id, Number(v)).run(Object.freeze(Object.fromEntries(Object.entries(generator(id, Number(v)).args).map(([k, a]) => [k, a.default]))), CTX(t, false))) for (const k of Object.keys(m.args ?? {})) seen.add(k);
    assert.deepEqual([...seen].sort(), [...names].sort(), `${key} drives what STRETCH_TARGETS names`);
  }
  assert.ok(MOTION_TARGETS['pickup.collect@1'].includes('token.squash'), 'collect@1 still hands its squash to token@1');
  const c1 = generator('pickup.collect', 1).run(Object.freeze({ pop: 0.5, low: 3, high: 7, room: 7, swell: 1.12, flip: 180 }), CTX(0.14, false));
  assert.equal(c1[0].stretch, undefined, 'collect@1 gives no stretch');
});

test('node.size@1 gives its node a stretch: scale on both axes, times wide and tall', () => {
  const run = (a) => generator('node.size', 1).run(Object.freeze({ scale: 1, wide: 1, tall: 1, ...a }), CTX(0.3));
  assert.deepEqual(run({}), [{ move: [0, 0], stretch: [1, 1] }]);
  assert.deepEqual(run({ scale: 1.5 }), [{ move: [0, 0], stretch: [1.5, 1.5] }]);
  assert.deepEqual(run({ scale: 2, wide: 1.5, tall: 0.5 }), [{ move: [0, 0], stretch: [3, 1] }]);
  assert.ok(checkCall({ gen: 'node.size', v: 1, scale: { from: 'size', map: [[0, 0.75], [1, 1.25]] } }).ok, 'scale may be bound to a slider');
  assert.equal(checkCall({ gen: 'node.size', v: 1, scale: 9 }).ok, false, 'scale is held to 0.25..4');
});

test('pickup.collect.whole@1 lifts as collect@1 does, squashes wide on the dip, stretches tall on the rise, swells, shrinks and hides', () => {
  const A = { pop: 0.5, low: 3, high: 7, room: 7, swell: 1.12, flip: 180 };
  const c1 = (t) => generator('pickup.collect', 1).run(Object.freeze(A), CTX(t, false))[0];
  const c2 = (t, a = {}) => generator('pickup.collect.whole', 1).run(Object.freeze({ ...A, squash: 1, wide: 4, tall: 4, ...a }), CTX(t, false))[0];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    assert.deepEqual(c2(t).move, c1(t).move, `the lift at t ${t}`);
    assert.equal(c2(t).args['token.spin'], c1(t).args['token.spin'], `the flip at t ${t}`);
  }
  assert.deepEqual(c2(0).stretch, [1, 1]);
  const dip = c2(0.14).stretch, rise = c2(0.3).stretch;
  assert.ok(dip[0] > 1.15 && dip[1] < 0.85, `wide and low on the dip: ${dip}`);
  assert.ok(rise[0] < 0.85 && rise[1] > 1.15, `thin and tall on the rise: ${rise}`);
  assert.ok(Math.abs(c2(0.58).stretch[0] - 1.12) < 1e-9 && Math.abs(c2(0.58).stretch[1] - 1.12) < 1e-9, 'the swell on both axes');
  assert.equal(c2(0.5).hide, undefined);
  assert.equal(c2(0.9).hide, true, 'hidden once under 0.3 of its size');
  assert.ok(c2(0.9).stretch.every((v) => v > 0), 'a stretch is always above 0');
  assert.deepEqual(c2(0.14, { squash: 0 }).stretch, [1, 1], 'squash 0: no squash');
  const capped = c2(0.14, { wide: 1.05 }).stretch, capT = c2(0.3, { tall: 1.1 }).stretch;
  assert.equal(capped[0], 1.05, '`wide` caps the width');
  assert.equal(capT[1], 1.1, '`tall` caps the height');
});

// ---- the layout: a stretch on a node --------------------------------------------------------------------------------

test('a stretch of 1 draws exactly what no motion draws', () => {
  for (const item of [STAMP, POLY, ELLIPSE, RECT, GEM]) {
    const plain = sprite([item, { kind: 'outline', paint: 'ink' }, { id: 'd', kind: 'dot', on: 'c', at: [0, 0], paint: 'gold', when: { size: [{ atLeast: 0 }] } }]);
    const one = sprite([item, { kind: 'outline', paint: 'ink' }, { id: 'd', kind: 'dot', on: 'c', at: [0, 0], paint: 'gold', when: { size: [{ atLeast: 0 }] } }], [SIZED(1)]);
    assert.ok(same(draw(plain), draw(one)), `${item.id}`);
  }
});

test('node.size resizes every kind about the node\'s origin: shapes, stamps, rects and generator output', () => {
  for (const item of [STAMP, POLY, ELLIPSE, RECT, GEM]) {
    const s = sprite([item], [SIZED({ from: 'size', map: [[0, 1], [1, 2]] })]);
    const a = box(draw(s, 'idle', 0, 0)), b = box(draw(s, 'idle', 0, 1));
    assert.ok(Math.abs(b.w - 2 * a.w) <= 1 && Math.abs(b.h - 2 * a.h) <= 1, `${item.id}: ${JSON.stringify(a)} at 1, ${JSON.stringify(b)} at 2`);
    assert.ok(Math.abs((b.cx - 16) - 2 * (a.cx - 16)) <= 1 && Math.abs((b.cy - 16) - 2 * (a.cy - 16)) <= 1, `${item.id}: about the node's origin`);
  }
});

test('a stamp is resampled pixel for pixel: at 2 each pixel is a 2 x 2 block of the same colour', () => {
  const s = sprite([STAMP], [SIZED({ from: 'size', map: [[0, 1], [1, 2]] })]);
  const one = draw(s, 'idle', 0, 0), two = draw(s, 'idle', 0, 1);
  const a = box(one), b = box(two);
  assert.equal(solid(two), 4 * solid(one));
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
    const v = one.data[(a.y0 + y) * 32 + a.x0 + x];
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) assert.equal(two.data[(b.y0 + 2 * y + dy) * 32 + b.x0 + 2 * x + dx], v, `pixel ${x},${y}`);
  }
});

test('a gem.cut@2 heart sized by node.size stays centred at every size (a node scale makes it drift)', () => {
  const sized = sprite([GEM], [SIZED({ from: 'size', map: [[0, 0.75], [1, 1.25]] })]);
  const scaled = sprite([GEM], [], { nodeScale: { from: 'size', map: [[0, 0.75], [1, 1.25]] } });
  let drift = 0;
  for (let i = 0; i <= 20; i++) {
    const b = box(draw(sized, 'idle', 0, i / 20)), c = box(draw(scaled, 'idle', 0, i / 20));
    assert.ok(Math.abs(b.cx - 16) <= 0.5, `size ${i / 20}: centred across (${b.cx})`);
    if (i > 0) assert.ok(b.w >= box(draw(sized, 'idle', 0, (i - 1) / 20)).w, `size ${i / 20}: never narrower than a smaller size`);
    drift = Math.max(drift, Math.abs(c.cx - 16));
  }
  assert.ok(drift >= 1.5, `a node's own scale still only moves the stamp (released pictures@1 behaviour): drift ${drift}`);
});

test('a node\'s own scale keeps its released meaning: a stamp on it keeps its pixel size', () => {
  const s = sprite([STAMP], [], { nodeScale: { from: 'size', map: [[0, 1], [1, 2]] } });
  assert.equal(solid(draw(s, 'idle', 0, 1)), solid(draw(s, 'idle', 0, 0)));
});

test('two axes: wide and tall stretch each screen axis on its own', () => {
  const s = sprite([STAMP, POLY], [SIZED({ from: 'size', map: [[0, 1], [1, 2]] }, { wide: 1.5, tall: 0.5 })]);
  const a = box(draw(sprite([STAMP, POLY]))), b = box(draw(s, 'idle', 0, 0));
  assert.ok(Math.abs(b.w - 1.5 * a.w) <= 1, `width ${a.w} -> ${b.w}`);
  assert.ok(Math.abs(b.h - 0.5 * a.h) <= 1, `height ${a.h} -> ${b.h}`);
});

test('the nodes under a stretched node are stretched with it, about the stretched node\'s origin', () => {
  const dot = { id: 'd', kind: 'dot', on: 'c', at: [0, 0], paint: 'gold' };
  const s = sprite([dot], [SIZED({ from: 'size', map: [[0, 1], [1, 2]] })]);
  const a = box(draw(s, 'idle', 0, 0)), b = box(draw(s, 'idle', 0, 1));
  assert.equal(a.x0, 20);
  assert.equal(b.x0, 24, 'the child at [4, 0] is 8 px out at twice the size');
});

test('a big stretched stamp is drawn whole (split into blocks of at most 32 x 32)', () => {
  const rows = Array.from({ length: 20 }, () => 'a'.repeat(20));
  const s = dataSprite({
    format: 'loadout-sprite', version: 2, id: 'test-big', name: 'Big', blurb: 'A big stamp.', size: [64, 64], pivot: [32, 60], grounded: false, meta: META,
    palette: [{ id: 'gold', label: 'Gold', default: '#f2c230', material: 'metal' }],
    controls: [{ key: 'size', kind: 'range', label: 'Size', default: 0.5 }],
    body: { pictures: { nodes: [{ id: 'n', parent: null, at: [32, 32] }], draw: [{ id: 'big', kind: 'stamp', on: 'n', at: [0, 0], anchor: 'c', rows, key: { a: 'gold' } }],
      motion: [SIZED({ from: 'size', map: [[0, 1], [1, 2]] })] } },
    clips: { idle: { frames: 1, fps: 10 } },
  });
  const g = renderFrame(s, 'idle', 0, { ...defaultParams(s), size: 1 });
  assert.equal(solid(g), 1600);
  assert.deepEqual(dataFrameList(s, 'idle', 0, { ...defaultParams(s), size: 1 }).warnings, []);
});

test('emitters on a stretched node are placed on it but not stretched', () => {
  const burst = [{ id: 'b', gen: 'twinkle', v: 2, on: 'n', at: [0, 0], size: 2, paint: 'gold', core: 'shine' }];
  const plain = sprite([POLY], [], { emitters: burst });
  const big = sprite([POLY], [SIZED({ from: 'size', map: [[0, 1], [1, 2]] })], { emitters: burst });
  const ep = sprite([{ id: 'none', kind: 'dot', on: 'n', at: [0, 0], paint: 'gold', hidden: true }], [], { emitters: burst });
  const eb = sprite([{ id: 'none', kind: 'dot', on: 'n', at: [0, 0], paint: 'gold', hidden: true }], [SIZED({ from: 'size', map: [[0, 1], [1, 2]] })], { emitters: burst });
  assert.ok(same(draw(ep, 'idle', 0, 1), draw(eb, 'idle', 0, 1)), 'the twinkle is the same');
  assert.ok(box(draw(big, 'idle', 0, 1)).w > box(draw(plain, 'idle', 0, 1)).w, 'the shape grew');
});

// ---- the layout: pickup.collect.whole@1 on a whole node -------------------------------------------------------------------

const COLLECT = { gen: 'pickup.collect.whole', v: 1, node: 'n', clip: ['collect'], room: 8 };
const CLIPS = { idle: { frames: 1, fps: 10 }, collect: { frames: 8, fps: 14, loop: false } };

// a stamp the size of a pickup (a 4 px one is too small for a fifth more to show at every alignment)
const BIG_STAMP = { ...STAMP, id: 'big', rows: ['.aaaaaaaaa.', 'aaabbbbbaaa', 'aabbbbbbbaa', 'aabbbbbbbaa', 'aabbbbbbbaa', 'aabbbbbbbaa', 'aabbbbbbbaa', 'aaabbbbbaaa', '.aaaaaaaaa.'] };

test('pickup.collect.whole@1 squashes and stretches everything on the node: shapes and stamps alike', () => {
  for (const items of [[POLY], [BIG_STAMP], [ELLIPSE, RECT], [GEM]]) {
    const s = sprite([...items, { kind: 'outline', paint: 'ink' }, { id: 'x', kind: 'dot', on: 'n', at: [0, 0], paint: 'gold', hidden: true, when: { size: [{ atLeast: 0 }] } }], [COLLECT], { clips: CLIPS });
    const f0 = box(draw(s, 'collect', 0)), f1 = box(draw(s, 'collect', 1)), f2 = box(draw(s, 'collect', 2));
    const say = items.map((i) => i.id).join('+');
    assert.ok(f1.w > f0.w && f1.h < f0.h, `${say}: frame 1 ${JSON.stringify(f1)} is wider and lower than frame 0 ${JSON.stringify(f0)}`);
    assert.ok(f2.w < f0.w && f2.h > f0.h, `${say}: frame 2 ${JSON.stringify(f2)} is thinner and taller than frame 0`);
    assert.equal(box(draw(s, 'collect', 7)), null, `${say}: gone by the last frame`);
  }
});

test('pickup.collect.whole@1 hides what is on the node, not its emitters', () => {
  const s = sprite([POLY], [COLLECT], { clips: { ...CLIPS, collect: { ...CLIPS.collect, keys: [{ t: 0, emit: { b: { amount: 1 } } }] } },
    emitters: [{ id: 'b', gen: 'twinkle', v: 2, on: 'n', at: [0, 0], size: 2, paint: 'gold', core: 'shine' }] });
  const last = draw(s, 'collect', 7);
  assert.ok(solid(last) > 0 && solid(last) <= 25, `only the twinkle is left: ${solid(last)} px`);
});

test('node.hide@1 leaves out what is on its node and under it wherever its `when` holds', () => {
  const dot = { id: 'd', kind: 'dot', on: 'c', at: [0, 0], paint: 'gold' };
  const s = sprite([POLY, dot], [{ gen: 'node.hide', v: 1, node: 'c', when: { size: [{ atLeast: 0.5 }] } }]);
  const lo = draw(s, 'idle', 0, 0), hi = draw(s, 'idle', 0, 1);
  assert.equal(lo.data[16 * 32 + 20] >>> 24, 255, 'the dot on c shows below 0.5');
  assert.equal(hi.data[16 * 32 + 20] >>> 24, 0, 'hidden from 0.5');
  assert.equal(solid(hi), solid(lo) - 1, 'the shape on n still shows');
  assert.deepEqual(generator('node.hide', 1).run(Object.freeze({}), CTX(0.5)), [{ move: [0, 0], hide: true }]);
});

test('nothing a library pictures sprite drew changes where no motion gives a stretch (the coin keeps collect@1)', () => {
  const s = sprite([POLY, STAMP], [{ gen: 'pickup.collect', v: 1, node: 'n', clip: ['collect'], room: 8 }], { clips: CLIPS });
  const f0 = box(draw(s, 'collect', 0)), f1 = box(draw(s, 'collect', 1));
  assert.equal(f1.w, f0.w, 'collect@1 squashes no stamp or shape (only token@1 calls)');
});

// ---- review F4#1: a stretch never takes a frame past the stamp-pixel cap (data-sprites.md 3.4: what validates loads) ----

/** A 128 x 128 pictures sprite: one side x side stamp on node `n` at [64, 64], sized by node.size at `scale`. */
function bigStamp(side, scale, extra = []) {
  const rows = Array.from({ length: side }, () => 'a'.repeat(side));
  return dataSprite({
    format: 'loadout-sprite', version: 2, id: 'test-cap', name: 'Cap', blurb: 'A stretched stamp at the cap.', size: [128, 128], pivot: [64, 120], grounded: false, meta: META,
    palette: [{ id: 'gold', label: 'Gold', default: '#f2c230', material: 'metal' }],
    controls: [],
    body: { pictures: { nodes: [{ id: 'n', parent: null, at: [64, 64] }], draw: [{ id: 's', kind: 'stamp', on: 'n', at: [0, 0], anchor: 'c', rows, key: { a: 'gold' } }, ...extra],
      motion: [{ gen: 'node.size', v: 1, node: 'n', scale }] } },
    clips: { idle: { frames: 1, fps: 10 } },
  });
}

test('a stretch that would take a frame past 8,192 stamp pixels keeps the stamps it grows at their own size, and says so', () => {
  for (const [side, scale] of [[24, 4], [30, 3.5], [32, 4]]) {
    const s = bigStamp(side, scale);
    const g = renderFrame(s, 'idle', 0, defaultParams(s));
    const b = box(g);
    assert.equal(solid(g), side * side, `${side} at ${scale}: drawn whole at its own size, no holes (${solid(g)} px)`);
    assert.deepEqual([b.x0, b.y0, b.w, b.h], [64 - side / 2, 64 - side / 2, side, side], `${side} at ${scale}: in place`);
    const { warnings } = dataFrameList(s, 'idle', 0, defaultParams(s));
    assert.equal(warnings.length, 1, `${side} at ${scale}: one warning (${JSON.stringify(warnings)})`);
    assert.match(warnings[0], /8,192 stamp pixels/);
    assert.match(warnings[0], /own size/);
  }
});

test('a stretch at or under the cap draws the stamp stretched in full, with no warning', () => {
  for (const [side, scale, want] of [[24, 3, 72 * 72], [16, 4, 64 * 64], [32, 2.8, null]]) {
    const s = bigStamp(side, scale);
    const g = renderFrame(s, 'idle', 0, defaultParams(s));
    const n = Math.round(side * scale) ** 2;
    if (want !== null) assert.equal(solid(g), want, `${side} at ${scale}`);
    else assert.ok(Math.abs(solid(g) - n) <= 2 * Math.round(side * scale), `${side} at ${scale}: ${solid(g)} of about ${n}`);
    assert.ok(solid(g) <= 8192);
    assert.deepEqual(dataFrameList(s, 'idle', 0, defaultParams(s)).warnings, [], `${side} at ${scale}`);
  }
});

test('the cap counts every stamp of the frame: a second stamp that fits alone still keeps the grown one at its own size', () => {
  const other = { id: 't', kind: 'stamp', at: [0, 0], rows: Array.from({ length: 32 }, () => 'a'.repeat(32)), key: { a: 'gold' } };
  const s = bigStamp(24, 3, [other]);      // 5,184 stretched + 1,024 unstretched fits; 3 x 3 of 32 is under it too
  assert.equal(solid(renderFrame(s, 'idle', 0, defaultParams(s))) >= 5184, true);
  const t = bigStamp(30, 2.9, [other, { ...other, id: 'u', at: [96, 96] }]);   // 87 x 87 = 7,569 + 2,048: over
  const g = renderFrame(t, 'idle', 0, defaultParams(t));
  assert.ok(solid(g) <= 8192 && solid(g) >= 900 + 1024, `${solid(g)} px, no holes`);
  assert.equal(dataFrameList(t, 'idle', 0, defaultParams(t)).warnings.length, 1);
});

// ---- review F4#4: what each kind becomes under a stretch, exactly ----------------------------------------------------

/** The placed primitive of id `id` in a frame's list. */
const placed = (s, id, size = 0.5) => dataFrameList(s, 'idle', 0, { ...defaultParams(s), size }).list.find((p) => p.id === id);
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} vs ${b}`);

/** The sprite of sprite() with node `n` turned by `turn` degrees. */
function turned(draw, motion, turn) {
  return dataSprite({
    format: 'loadout-sprite', version: 2, id: 'test-turned', name: 'Turned', blurb: 'A turned node stretched.', size: [32, 32], pivot: [16, 30], grounded: false, meta: META,
    palette: [{ id: 'gold', label: 'Gold', default: '#f2c230', material: 'metal' }],
    controls: [],
    body: { pictures: { nodes: [{ id: 'n', parent: null, at: [16, 16], turn }], draw, motion } },
    clips: { idle: { frames: 1, fps: 10 } },
  });
}

test('an ellipse on a turned node under a two-axis stretch is the exact image of the ellipse (the non-axis branch)', () => {
  const EL = { id: 'te', kind: 'ellipse', on: 'n', at: [1, 0], r: [6, 3], paint: 'gold', shade: 0 };
  for (const turn of [30, 75, 120]) {
    const plain = turned([EL], [], turn), s = turned([EL], [SIZED(1, { wide: 1.5, tall: 0.75 })], turn);
    const e0 = dataFrameList(plain, 'idle', 0, {}).list.find((p) => p.id === 'te');
    assert.ok(Math.abs(Math.sin(e0.turnRad)) > 0.1, `turn ${turn}: the ellipse is turned (${e0.turnRad})`);
    const g = renderFrame(s, 'idle', 0, defaultParams(s));
    // a pixel is drawn exactly when its centre, mapped back through the stretch, is inside the turned ellipse
    const ct = Math.cos(e0.turnRad), st = Math.sin(e0.turnRad);
    let wrong = 0, inside = 0;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const X = (x + 0.5 - 16) / 1.5 + 16, Y = (y + 0.5 - 16) / 0.75 + 16;
      const dx = X - e0.at[0], dy = Y - e0.at[1], u = dx * ct + dy * st, v = dy * ct - dx * st;
      const want = (u / e0.r[0]) ** 2 + (v / e0.r[1]) ** 2 <= 1, got = (g.data[y * 32 + x] >>> 24) > 0;
      if (want) inside++;
      if (want !== got) wrong++;
    }
    assert.ok(inside > 40, `turn ${turn}: ${inside} px inside`);
    assert.ok(wrong <= 1, `turn ${turn}: ${wrong} pixels differ from the image of the ellipse`);
    const e = dataFrameList(s, 'idle', 0, {}).list.find((p) => p.id === 'te');
    assert.ok(Math.abs(e.turnRad - e0.turnRad) > 0.02, `turn ${turn}: the turn changes under a two-axis stretch`);
    near(e.r[0] * e.r[1], e0.r[0] * e0.r[1] * 1.5 * 0.75, `turn ${turn}: the area grows by sx x sy`);
  }
});

test('a ring and an arc grow by the mean of the two axes; their centres move with the stretch', () => {
  const RING = { id: 'rg', kind: 'ring', on: 'n', at: [2, 1], r: 4, paint: 'gold' };
  const ARC = { id: 'ac', kind: 'arc', on: 'n', at: [0, 0], r: 5, a0: 0, a1: 180, paint: 'gold' };
  const s = sprite([RING, ARC], [SIZED(1, { wide: 2, tall: 0.5 })]);
  const r = placed(s, 'rg'), a = placed(s, 'ac');
  near(r.r, 4, 'ring: sqrt(2 x 0.5) = 1'); near(r.at[0], 20, 'ring x'); near(r.at[1], 16.5, 'ring y');
  near(a.r, 5, 'arc'); assert.deepEqual([a.a0, a.a1], [0, 180], 'an arc keeps its angles');
  const t = sprite([RING, ARC], [SIZED(2)]);
  near(placed(t, 'rg').r, 8, 'ring at 2'); near(placed(t, 'ac').r, 10, 'arc at 2');
  near(placed(sprite([RING], [SIZED(1, { wide: 4, tall: 1 })]), 'rg').r, 8, 'ring at 4 x 1: sqrt(4) = 2');
});

test('a capsule (as a generator gives one) moves its ends and grows its radii by the mean of the two axes', () => {
  const [c] = stretchPrimitive({ kind: 'capsule', from: [10, 16], to: [22, 18], r: [2, 1], paint: 'gold' }, [2, 0.5], [-16, 8]);
  assert.deepEqual(c.from, [4, 16]); assert.deepEqual(c.to, [28, 17]); assert.deepEqual(c.r, [2, 1]);
  const [d] = stretchPrimitive({ kind: 'capsule', from: [0, 0], to: [4, 0], r: 3 }, [2, 2], [0, 0]);
  assert.equal(d.r, 6);
  const [l] = stretchPrimitive({ kind: 'limb', from: [0, 0], to: [4, 0], r: 3, width: 2 }, [2, 2], [0, 0]);
  assert.deepEqual(l.to, [8, 0]);
});

test('a dither or bands area and a cut shape are stretched with the node', () => {
  const DITHER = { id: 'dt', kind: 'dither', on: 'n', area: { kind: 'ellipse', at: [0, 0], r: [4, 2] }, pattern: 'checker', amount: 0.5, paint: 'gold' };
  const BANDS = { id: 'bd', kind: 'bands', on: 'n', area: { kind: 'poly', points: [[-2, -2], [2, -2], [2, 2], [-2, 2]] }, stops: ['gold', 'shine'] };
  const CUT = { id: 'ct', kind: 'cut', on: 'n', shape: { kind: 'rect', at: [-1, -1], size: [2, 2] } };
  const s = sprite([POLY, DITHER, BANDS, CUT], [SIZED(1, { wide: 2, tall: 0.5 })]);
  const d = placed(s, 'dt'), b = placed(s, 'bd'), c = placed(s, 'ct');
  assert.deepEqual(d.area.at, [16, 16]); assert.deepEqual(d.area.r, [8, 1]);
  assert.deepEqual(b.area.points, [[12, 15], [20, 15], [20, 17], [12, 17]]);
  assert.deepEqual(c.shape.at, [14, 15.5]); assert.deepEqual(c.shape.size, [4, 1]);
  // drawn: the checker covers about half the stretched ellipse's pixels (r [8, 2]: about 50), twice the unstretched
  const one = solid(draw(sprite([DITHER]))), two = solid(draw(sprite([DITHER], [SIZED(1, { wide: 2, tall: 1 })])));
  assert.ok(two >= 20 && two <= 32, `${two} px of dither`);
  assert.ok(Math.abs(two - 2 * one) <= 4, `${one} px unstretched, ${two} stretched`);
});

test('hide does the hiding: at the size collect.whole first hides, the stretch alone would still draw the node', () => {
  const A = { pop: 0.5, low: 3, high: 7, room: 8, swell: 1.12, flip: 180, squash: 1, wide: 4, tall: 4 };
  let first = null;
  for (let i = 0; i <= 400 && !first; i++) { const m = generator('pickup.collect.whole', 1).run(Object.freeze(A), CTX(i / 400, false))[0]; if (m.hide) first = m; }
  assert.ok(first && first.stretch[0] >= 0.25 && first.stretch[1] >= 0.25, `first hidden at ${first?.stretch}`);
  const [sx, sy] = first.stretch;
  const shown = sprite([BIG_STAMP, POLY], [SIZED(1, { wide: sx, tall: sy })]);
  assert.ok(solid(draw(shown)) > 0, 'the stretch alone leaves pixels');
  const hidden = sprite([BIG_STAMP, POLY], [SIZED(1, { wide: sx, tall: sy }), { gen: 'node.hide', v: 1, node: 'n' }]);
  assert.equal(solid(draw(hidden)), 0, 'with hide: nothing');
  // and in the clip: every collect frame the motion hides draws nothing, though its stretch is the size above
  const s = sprite([BIG_STAMP, POLY], [{ ...COLLECT, room: 8 }], { clips: CLIPS });
  for (let f = 0; f < 8; f++) {
    const m = generator('pickup.collect.whole', 1).run(Object.freeze({ ...A, room: 8, pop: 0.5 }), CTX(f / 7, false))[0];
    if (m.hide) assert.equal(solid(draw(s, 'collect', f)), 0, `frame ${f}`);
  }
});
