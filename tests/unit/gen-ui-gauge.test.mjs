// ui.gauge@1 (engine/gen/ui-gauge.js): the standing gauge of the Gridline kit (bundles/specs/kit-puzzle-gridline.md,
// `ui-junk-gauge`: the look gaugeColumn and gaugeFill of "engine/blocks.js" drew, with the plate and tube housings), and
// block.cell@2, the same cell as block.cell@1 that may also be 4 or 5 px (the gauge's end cells). Both are pinned by
// the goldens harness; the tests after it hold what the specification asks of a gauge.
// To pin: GEN_GOLDEN_WRITE=1 node --test tests/unit/gen-ui-gauge.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { measurePiece } from '../../engine/gen/ui-pieces.js';
import { GAUGE_LOOKS, gaugeOpening } from '../../engine/gen/ui-gauge.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';

const CASES = {
  'ui.gauge@1': [
    { args: { at: [1, 1], size: [14, 62], frame: 'frame' } },
    { args: { at: [1, 1], size: [14, 62], look: 'plate', corner: 4, border: 3, frame: 'frame' } },
    { args: { at: [1, 1], size: [14, 62], look: 'tube', corner: 2, border: 2, frame: 'frame' } },
    { args: { at: [-7, -31], size: [14, 62], look: 'blocks', border: 1, ends: 4, frame: 'frame' } },
    { args: { at: [1, 1], size: [14, 62], layer: 'fill', marks: 8, fill: 'fill', shine: 'shine' } },
    { args: { at: [1, 1], size: [14, 62], layer: 'fill', marks: 8, ends: 4, border: 1, flash: 1, fade: true, fill: 'fill', shine: 'shine' }, ctx: { t: 1 / 3, loop: false, frames: 4, frame: 1 } },
    { args: { at: [0, 0], size: [24, 88], look: 'tube', corner: 4, border: 3, frame: { rule: 'mix', of: 'frame', with: 'shine', amount: 0.5 } } },
  ],
  'block.cell@2': [
    { args: { at: [6, 1], size: 4, edge: 1, paint: 'body' } },
    { args: { at: [0, 0], size: 5, style: 'gem', paint: 'body', shine: 'shine' } },
    { args: { at: [-8, -8], size: 16, style: 'glass', edge: 1, symbol: 'triangle', paint: 'body.light', shine: 'shine' } },
  ],
};

for (const [key, cases] of Object.entries(CASES)) {
  const [id, v] = key.split('@');
  test(`${key} passes the goldens harness`, () => {
    checkGeneratorContract(registry, registry.generator(id, Number(v)), { cases });
  });
}

/** A call's stamps as a Map "x,y" -> paint (as text). */
function pixels(call, ctx = {}) {
  const r = registry.runGenerator(call, { size: [16, 64], ...ctx });
  assert.ok(r.ok, r.errors.join('; '));
  const out = new Map();
  for (const p of r.primitives) {
    assert.equal(p.kind, 'stamp');
    p.rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') out.set(`${p.at[0] + i},${p.at[1] + j}`, JSON.stringify(p.key[ch])); }));
  }
  return out;
}
const BOX = { at: [1, 1], size: [14, 62] };
const gauge = (more = {}, ctx) => pixels({ gen: 'ui.gauge', v: 1, ...BOX, frame: 'frame', fill: 'fill', shine: 'shine', ...more }, ctx);
const differ = (a, b) => { let n = 0; for (const k of new Set([...a.keys(), ...b.keys()])) if (a.get(k) !== b.get(k)) n++; return n; };

test('the looks are the specification\'s three housings', () => {
  assert.deepEqual([...GAUGE_LOOKS], ['blocks', 'plate', 'tube']);
});

test('a housing stays in its box, has an ink line round it and a plain trough ringed with ink', () => {
  for (const look of GAUGE_LOOKS) for (const border of [1, 2, 3]) for (const corner of [0, 2, 4]) {
    const px = gauge({ look, border, corner }), what = `${look} border ${border} corner ${corner}`;
    for (const k of px.keys()) { const [x, y] = k.split(',').map(Number); assert.ok(x >= 1 && x <= 14 && y >= 1 && y <= 62, `${what}: (${k}) is outside the box`); }
    assert.equal(px.get('1,32'), '"ink"', `${what}: the left side is ink`);
    assert.equal(px.get('14,32'), '"ink"', `${what}: the right side is ink`);
    const o = gaugeOpening({ ...BOX, border, ends: 0 });
    const back = px.get(`${o.x},${o.y}`);
    assert.notEqual(back, '"ink"');
    for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) assert.equal(px.get(`${x},${y}`), back, `${what}: the trough is one colour at (${x},${y})`);
    for (let x = o.x - 1; x <= o.x + o.w; x++) for (const y of [o.y - 1, o.y + o.h]) assert.equal(px.get(`${x},${y}`), '"ink"', `${what}: ink above and below the trough`);
    for (let y = o.y - 1; y <= o.y + o.h; y++) for (const x of [o.x - 1, o.x + o.w]) assert.equal(px.get(`${x},${y}`), '"ink"', `${what}: ink beside the trough`);
  }
});

test('every look differs from every other, the corner rounds the plate and the tube, the border widens the band', () => {
  for (const a of GAUGE_LOOKS) for (const b of GAUGE_LOOKS) if (a < b) assert.ok(differ(gauge({ look: a }), gauge({ look: b })) >= 12, `${a} and ${b} differ by 12 pixels or more`);
  for (const look of ['plate', 'tube']) assert.ok(differ(gauge({ look, corner: 0 }), gauge({ look, corner: 4 })) >= 12, `${look}: the corner changes 12 pixels or more`);
  assert.equal(differ(gauge({ look: 'blocks', corner: 0 }), gauge({ look: 'blocks', corner: 4 })), 0, 'the blocks look keeps square corners');
  for (const look of GAUGE_LOOKS) assert.ok(differ(gauge({ look, border: 1 }), gauge({ look, border: 3 })) >= 12, `${look}: the border changes 12 pixels or more`);
});

test('the fill strip fills the opening exactly, from the bottom, with a row mark every `marks` px', () => {
  for (const border of [1, 2, 3]) for (const ends of [0, 4]) {
    const o = gaugeOpening({ ...BOX, border, ends });
    const px = gauge({ layer: 'fill', border, ends, marks: 8 });
    assert.equal(px.size, o.w * o.h, `border ${border} ends ${ends}: every pixel of the opening and no other`);
    for (const k of px.keys()) { const [x, y] = k.split(',').map(Number); assert.ok(x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h, `(${k}) is outside the opening`); }
    const mid = o.x + (o.w >> 1), bottom = o.y + o.h - 1;
    assert.equal(px.get(`${mid},${bottom}`), '"fill"');
    assert.equal(px.get(`${mid},${bottom - 7}`), '"fill.dark"', 'the first mark is the eighth row from the bottom');
    assert.equal(px.get(`${mid},${bottom - 15}`), '"fill.dark"');
    assert.equal(px.get(`${mid},${bottom - 8}`), '"fill"');
    assert.equal(differ(px, gauge({ layer: 'fill', border, ends, marks: 0 })), Math.floor((o.h - 1) / 8) * (o.w - 1), 'marks off: only the mark rows change');
  }
  const quarter = gauge({ layer: 'fill', value: 0.25 }), o = gaugeOpening({ ...BOX, border: 2, ends: 0 });
  const n = Math.round(o.h * 0.25);
  assert.equal(quarter.size, o.w * n, 'a quarter fills the bottom quarter');
  for (const k of quarter.keys()) assert.ok(Number(k.split(',')[1]) >= o.y + o.h - n, 'nothing above it');
});

test('with `ends` the opening keeps clear of the end cells, and never grows', () => {
  assert.deepEqual(gaugeOpening({ ...BOX, border: 1, ends: 4 }), { x: 4, y: 5, w: 8, h: 54 });
  assert.deepEqual(gaugeOpening({ ...BOX, border: 1, ends: 0 }), { x: 4, y: 4, w: 8, h: 56 });
  assert.deepEqual(gaugeOpening({ ...BOX, border: 2, ends: 4 }), { x: 5, y: 5, w: 6, h: 54 });
  assert.deepEqual(gaugeOpening({ ...BOX, border: 3, ends: 4 }), { x: 6, y: 6, w: 4, h: 52 });
});

test('the flash turns the strip to the shine and dies away over a clip that does not loop', () => {
  const at = (frame) => gauge({ layer: 'fill', marks: 8, flash: 1, fade: true }, { t: frame / 3, loop: false, frames: 4, frame });
  const first = at(0), last = at(3), plain = gauge({ layer: 'fill', marks: 8 });
  assert.equal(new Set(first.values()).size, 1, 'frame 0 is one colour');
  assert.match([...first.values()][0], /shine/);
  assert.equal(differ(last, plain), 0, 'the last frame is the strip itself');
  assert.ok(differ(at(1), at(2)) > 0 && differ(at(1), first) > 0);
});

test('the measure: the housing stretches between its ends, the strips lie in the opening', () => {
  const g = registry.generator('ui.gauge', 1), ctx = { size: [16, 64] };
  for (const border of [1, 2, 3]) for (const ends of [0, 4]) {
    const o = gaugeOpening({ ...BOX, border, ends });
    assert.deepEqual(measurePiece(g, { ...BOX, border, ends }, ctx).slice, { left: o.x, top: 8, right: 16 - (o.x + o.w), bottom: 8, opening: o });
    assert.deepEqual(measurePiece(g, { ...BOX, border, ends, layer: 'fill', marks: 8 }, ctx).slice, { opening: o }, 'a strip with row marks is a pattern: no border');
    assert.deepEqual(measurePiece(g, { ...BOX, border, ends, layer: 'fill' }, ctx).slice, { rect: o, left: 1, top: 0, right: 1, bottom: 0, opening: o });
  }
  const off = gaugeOpening({ at: [20, 4], size: [14, 40], border: 2, ends: 0 });
  assert.deepEqual(measurePiece(g, { at: [20, 4], size: [14, 40] }, { size: [64, 64] }).slice, { rect: { x: 20, y: 4, w: 14, h: 40 }, left: off.x - 20, top: 8, right: 34 - (off.x + off.w), bottom: 8, opening: off });
});

test('block.cell@2 draws what block.cell@1 draws, and a 4 px cell too', () => {
  for (const size of [6, 10, 16]) for (const style of ['bevel', 'gem', 'glass', 'pillow', 'frame']) {
    const call = { at: [3, 2], size, style, edge: 2, symbol: 'plus', paint: 'body', shine: 'shine' };
    assert.equal(differ(pixels({ gen: 'block.cell', v: 1, ...call }), pixels({ gen: 'block.cell', v: 2, ...call })), 0, `${style} at ${size}`);
  }
  const px = pixels({ gen: 'block.cell', v: 2, at: [6, 1], size: 4, edge: 1, paint: 'body' });
  assert.equal(px.size, 16);
  for (let i = 0; i < 4; i++) for (const k of [`${6 + i},1`, `${6 + i},4`, `6,${1 + i}`, `9,${1 + i}`]) assert.equal(px.get(k), '"ink"', `(${k}) is the ink line`);
  assert.equal(px.get('7,2'), '"body.light"');
  assert.equal(px.get('7,3'), '"body.dark"');
  assert.equal(registry.checkCall({ gen: 'block.cell', v: 1, size: 4, paint: 'body' }).ok, false, 'version 1 keeps its sizes');
});
