// The counter generators (engine/gen/counter.js, family "ui"): a counter's case with its digit windows, the digits
// standing, rolling or bumped in those windows, and the small stat picture of the Gridline kit
// (bundles/specs/kit-puzzle-gridline.md, `ui-stat-counter`: the look counterPlate, styledCounterPlate, windowDigit and
// rollDigit of engine/counters.js, counter-styles.js and counter-digits.js drew, and statMarkIn of the specification's
// "engine/blocks.js", which was never carried over). ui.counter@1, ui.counter.digits@1 and ui.counter.mark@1 are pinned
// by the goldens harness; the tests after it hold what the specification asks of the counter.
// To pin: GEN_GOLDEN_WRITE=1 node --test tests/unit/gen-ui-counter.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { COUNTER_STYLES, STAT_MARKS, counterLayout, measureCounter } from '../../engine/gen/counter.js';
import { measurePiece } from '../../engine/gen/ui-pieces.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';

const CASES = {
  'ui.counter@1': [
    { args: { face: 'face', frame: 'frame' } },
    { args: { at: [1, 1], width: 62, height: 22, count: 3, style: 'strip', picture: 13, face: 'face', frame: 'frame', text: 'shine' } },
    { args: { at: [-31, -11], width: 62, height: 22, count: 4, big: 1, style: 'drum', picture: 13, face: 'face', frame: 'frame' } },
    { args: { at: [0, 0], width: 94, height: 22, count: 6, big: 0, style: 'plate', band: 2, corner: 0, face: 'face.light', frame: { rule: 'mix', of: 'frame', with: 'shine', amount: 0.5 } } },
  ],
  'ui.counter.digits@1': [
    { args: { paint: 'glow' } },
    { args: { at: [1, 1], width: 62, height: 22, count: 3, style: 'strip', picture: 13, value: 12, play: 'roll', paint: 'glow' }, ctx: { frame: 2, frames: 6, t: 0.4 } },
    { args: { at: [-31, -11], width: 62, height: 22, count: 4, big: 1, style: 'drum', picture: 13, value: 1999, play: 'roll', paint: 'glow' }, ctx: { frame: 1, frames: 6, t: 0.2 } },
    { args: { at: [1, 1], width: 62, height: 22, count: 2, big: 0, style: 'plate', picture: 13, value: 7, play: 'bump', paint: 'glow', flash: 'shine' }, ctx: { frame: 0, frames: 4, t: 0 } },
    { args: { at: [1, 1], width: 62, height: 22, count: 3, picture: 13, value: 12, play: 'bump', paint: 'glow', flash: 'shine' }, ctx: { frame: 1, frames: 4, t: 0.34 } },
  ],
  'ui.counter.mark@1': [
    { args: { paint: 'glow' } },
    { args: { name: 'lines', at: [4, 5], paint: 'glow' } },
    { args: { name: 'speed', at: [-6, -6], paint: 'glow', play: 'bump', flash: 'shine' }, ctx: { frame: 1, frames: 4, t: 0.34 } },
    { args: { name: 'combo', at: [4, 5], paint: 'glow.light', play: 'bump', flash: 'shine', ink: 'face.deep' }, ctx: { frame: 0, frames: 4, t: 0 } },
  ],
};

for (const [key, cases] of Object.entries(CASES)) {
  const at = key.lastIndexOf('@');
  test(`${key} passes the goldens harness`, () => {
    checkGeneratorContract(registry, registry.generator(key.slice(0, at), Number(key.slice(at + 1))), { cases });
  });
}

// ---- what a counter is ---------------------------------------------------------------------------------------------

const GEOM = { at: [1, 1], width: 62, height: 22, picture: 13, count: 3 };

/** A call's stamps as a Map "x,y" -> paint (as text). */
function pixels(call, ctx = {}) {
  const r = registry.runGenerator(call, { size: [64, 24], ...ctx });
  assert.ok(r.ok, r.errors.join('; '));
  const out = new Map();
  for (const p of r.primitives) {
    assert.equal(p.kind, 'stamp');
    p.rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') out.set(`${p.at[0] + i},${p.at[1] + j}`, typeof p.key[ch] === 'string' ? p.key[ch] : JSON.stringify(p.key[ch])); }));
  }
  return out;
}
const plate = (more = {}) => pixels({ gen: 'ui.counter', v: 1, ...GEOM, face: 'face', frame: 'frame', ...more });
const digits = (more = {}, ctx) => pixels({ gen: 'ui.counter.digits', v: 1, ...GEOM, paint: 'glow', ...more }, ctx);
const mark = (more = {}, ctx) => pixels({ gen: 'ui.counter.mark', v: 1, at: [4, 5], paint: 'glow', ...more }, ctx);
const over = (...layers) => { const out = new Map(); for (const l of layers) for (const [k, v] of l) out.set(k, v); return out; };
const differ = (a, b) => { let n = 0; for (const k of new Set([...a.keys(), ...b.keys()])) if (a.get(k) !== b.get(k)) n++; return n; };
const SETTINGS = [];
for (const style of ['plate', 'strip', 'drum']) for (const count of [2, 3, 4]) for (const big of [0, 0.5, 1]) SETTINGS.push({ style, count, big });

test('the styles and the pictures are the specification\'s', () => {
  assert.deepEqual([...COUNTER_STYLES], ['plate', 'strip', 'drum']);
  assert.deepEqual([...STAT_MARKS], ['level', 'lines', 'speed', 'combo']);
});

test('the default counter is the reviewed one, pixel for pixel: strip, three digits, the level picture, 12', () => {
  // the reviewed render of the code sprite (idle at the defaults): . empty, b ink, c the case's light tone, d its dark
  // tone, g its deepest tone (the studs), e the windows, i the strip's lit top edge, f the digits and the picture
  const REVIEWED = [
    '................................................................',
    '...bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb...',
    '..bccccccccccccccccccccccccccccccccccccccccccccccccccccccccccb..',
    '.bcbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbcb.',
    '.bdbbbbbbbbbbbbbbbddddddddddddddddddddddddddddddddddddddddddbcb.',
    '.bdbeeeeeeeeeeeeebddddddddddddddbbbbbbbbbbbbbbbbbbbbbbbbbbbbbcb.',
    '.bdbeeeeebbbeeeeebddddddddddddddbiiiiiiiiiiiiiiiiiiiiiiiiiibbcb.',
    '.bdbeeebbbfbbbeeebddddddddddddddbeeeeeeeeeeeeeeeeeeeeeeeeeebbcb.',
    '.bdbebbbfffffbbbebddddddddddddddbeeeeeeeeeeefffeeeeeffffffebbcb.',
    '.bdbbbffffbffffbbbddddddddddddddbeeeeeeeeeeeeffeeeeeeeeeffebbcb.',
    '.bdbbfffbbbbbfffbbddddddddddddddbeeeeeeeeeeeeffeeeeeeeeeffebbcb.',
    '.bdbbfbbbbbbbbbfbbdggddggddggdddbeeeeeeeeeeeeffeeeeeffffffebbcb.',
    '.bdbbbbbbbfbbbbbbbdggddggddggdddbeeeeeeeeeeeeffeeeeeffeeeeebbcb.',
    '.bdbebbbfffffbbbebddddddddddddddbeeeeeeeeeeeeffeeeeeffeeeeebbcb.',
    '.bdbbbffffbffffbbbddddddddddddddbeeeeeeeeeeffffffeeeffffffebbcb.',
    '.bdbbfffbbbbbfffbbddddddddddddddbeeeeeeeeeeeeeeeeeeeeeeeeeebbcb.',
    '.bdbbfbbbeeebbbfbbddddddddddddddbbbbbbbbbbbbbbbbbbbbbbbbbbbbbcb.',
    '.bdbbbbeeeeeeebbbbddddddddddddddddddddddddddddddddddddddddddbcb.',
    '.bdbbbbbbbbbbbbbbbddddddddddddddddddddddddddddddddddddddddddbcb.',
    '.bdbddddddddddddddddddddddddddddddddddddddddddddddddddddddddbcb.',
    '.bdbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbcb.',
    '..bdddddddddddddddddddddddddddddddddddddddddddddddddddddddddcb..',
    '...bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb...',
    '................................................................'];
  const CH = { ink: 'b', 'frame.light': 'c', 'frame.dark': 'd', 'frame.deep': 'g', face: 'e', glow: 'f', [JSON.stringify({ rule: 'tone', of: 'face', by: 0.6 })]: 'i' };
  const px = over(plate({ count: 3, style: 'strip' }), mark({ name: 'level' }), digits({ count: 3, style: 'strip', value: 12 }));
  const rows = [];
  for (let y = 0; y < 24; y++) { let r = ''; for (let x = 0; x < 64; x++) { const v = px.get(`${x},${y}`); r += v === undefined ? '.' : CH[v] ?? '?'; } rows.push(r); }
  assert.deepEqual(rows, REVIEWED);
});

test('the case is the box it is given at every setting: ink on its outer line, nothing outside, and the frame never changes it', () => {
  for (const s of SETTINGS) {
    const px = plate(s);
    for (const k of px.keys()) { const [x, y] = k.split(',').map(Number); assert.ok(x >= 1 && x <= 62 && y >= 1 && y <= 22, `${JSON.stringify(s)}: (${k}) is outside the case`); }
    for (let x = 4; x < 60; x++) { assert.equal(px.get(`${x},1`), 'ink'); assert.equal(px.get(`${x},22`), 'ink'); }
    for (const frame of [1, 3]) assert.equal(differ(px, pixels({ gen: 'ui.counter', v: 1, ...GEOM, face: 'face', frame: 'frame', ...s }, { frame, frames: 4, t: frame / 3 })), 0, 'the case never moves');
  }
});

test('four big digits and the picture window fit side by side in 64 px, in every style', () => {
  for (const s of SETTINGS) {
    const L = counterLayout({ ...GEOM, band: 1, ...s });
    assert.equal(L.fits, true, JSON.stringify(s));
    assert.equal(L.windows.length, s.count);
    assert.deepEqual(L.picture, { x: 4, y: 5, w: 13, h: 13 });
    assert.ok(L.windows[0].x - 1 >= L.picture.x + L.picture.w + 2, `${JSON.stringify(s)}: the first window's ink is clear of the picture's`);
  }
});

test('the three styles differ in shape (12 pixels or more between any two), and Size and Digits change the windows', () => {
  for (const count of [2, 3, 4]) for (const big of [0, 0.5, 1]) for (const a of COUNTER_STYLES) for (const b of COUNTER_STYLES) {
    if (a < b) assert.ok(differ(plate({ style: a, count, big }), plate({ style: b, count, big })) >= 12, `${a} and ${b} at ${count} digits, size ${big}`);
  }
  for (const style of COUNTER_STYLES) {
    assert.ok(differ(plate({ style, count: 2 }), plate({ style, count: 4 })) >= 12, `${style}: digits`);
    assert.ok(differ(plate({ style, big: 0 }), plate({ style, big: 1 })) >= 12, `${style}: size`);
  }
});

test('digits and the picture lie only on windows, in every frame of bump and roll: never on the case, never on ink', () => {
  for (const s of SETTINGS) for (const name of STAT_MARKS) {
    const base = plate(s);
    for (const [play, frames] of [['rest', 1], ['roll', 6], ['bump', 4]]) for (let frame = 0; frame < frames; frame++) {
      const ctx = { frame, frames, t: frames > 1 ? frame / (frames - 1) : 0 };
      const d = digits({ ...s, value: 12, play, flash: 'shine' }, ctx);
      const where = `${JSON.stringify(s)} ${name} ${play} frame ${frame}`;
      assert.ok(d.size > 0, `${where}: digits are drawn`);
      for (const k of d.keys()) assert.ok(/face/.test(base.get(k)), `${where}: digit pixel (${k}) lies on ${base.get(k)}`);
      if (play === 'roll') continue;
      const m = mark({ name, play, flash: 'shine' }, ctx);
      for (const [k, v] of m) { const [x, y] = k.split(',').map(Number); assert.ok(x >= 4 && x <= 16 && y >= 5 && y <= 17, `${where}: picture pixel (${k}) is outside its window`); if (v !== 'ink') assert.equal(base.get(k), 'face'); }
    }
  }
});

test('bump: frame 0 white, frame 1 the digits and the picture 1 px higher, frames 2 and 3 back at rest', () => {
  const rest = digits({ value: 12 }), up = new Map([...rest].map(([k, v]) => { const [x, y] = k.split(',').map(Number); return [`${x},${y - 1}`, v]; }));
  const at = (frame) => digits({ value: 12, play: 'bump', flash: 'shine' }, { frame, frames: 4, t: frame / 3 });
  assert.deepEqual([...at(0).keys()].sort(), [...rest.keys()].sort());
  assert.ok([...at(0).values()].every((v) => v === 'shine'), 'frame 0 is the flash colour');
  assert.equal(differ(at(1), up), 0, 'frame 1 is 1 px higher');
  assert.equal(differ(at(2), rest), 0); assert.equal(differ(at(3), rest), 0);
  const m = (frame) => mark({ play: 'bump', flash: 'shine' }, { frame, frames: 4, t: frame / 3 });
  const body = (px) => [...px].filter(([, v]) => v !== 'ink').map(([k]) => k).sort();
  assert.ok([...m(0).values()].every((v) => v === 'shine' || v === 'ink'));
  assert.deepEqual(body(m(0)), body(mark()));
  assert.deepEqual(body(m(1)), body(mark()).map((k) => { const [x, y] = k.split(',').map(Number); return `${x},${y - 1}`; }).sort());
  assert.equal(differ(m(2), mark()), 0); assert.equal(differ(m(3), mark()), 0);
});

test('roll: the last digit goes up a quarter window a frame and ends on the next number; a carry rolls every digit that changes', () => {
  const at = (frame, value = 12) => digits({ value, play: 'roll' }, { frame, frames: 6, t: frame / 5 });
  assert.equal(differ(at(0), digits({ value: 12 })), 0, 'frame 0 is the number at rest');
  assert.equal(differ(at(4), digits({ value: 13 })), 0, 'frame 4 is the next number at rest');
  assert.equal(differ(at(5), digits({ value: 13 })), 0);
  const L = counterLayout({ ...GEOM, band: 1, count: 3, big: 0.5, style: 'strip' }), last = L.windows[2];
  const inLast = (k) => { const [x] = k.split(',').map(Number); return x >= last.x && x < last.x + last.w; };
  for (const frame of [1, 2, 3]) {
    const a = at(frame), b = at(frame - 1);
    assert.ok(differ(a, b) >= 4, `frame ${frame} moves`);
    for (const k of new Set([...a.keys(), ...b.keys()])) if (a.get(k) !== b.get(k)) assert.ok(inLast(k), `frame ${frame}: only the last window changes (${k})`);
  }
  // 199 -> 200: all three windows roll
  const carry = at(2, 199), still = digits({ value: 199 });
  const cols = new Set([...new Set([...carry.keys(), ...still.keys()])].filter((k) => carry.get(k) !== still.get(k)).map((k) => L.windows.findIndex((w) => { const x = Number(k.split(',')[0]); return x >= w.x && x < w.x + w.w; })));
  assert.deepEqual([...cols].sort(), [0, 1, 2]);
});

test('the sample is right-aligned: the windows left of it stay empty, and only the last `count` digits show', () => {
  const L = counterLayout({ ...GEOM, band: 1, count: 4, big: 0.5, style: 'plate' });
  const d = digits({ count: 4, style: 'plate', value: 12 });
  for (const k of d.keys()) { const x = Number(k.split(',')[0]); assert.ok(x >= L.windows[2].x, `(${k}) is in an empty window`); }
  assert.equal(differ(digits({ count: 2, value: 512 }), digits({ count: 2, value: 12 })), 0);
});

test('the text areas are the digit windows: flat face only, given only when a text colour is named', () => {
  const entry = registry.generator('ui.counter', 1);
  assert.deepEqual(measurePiece(entry, { ...GEOM, face: 'face', frame: 'frame' }, { size: [64, 24] }), {});
  for (const s of SETTINGS) {
    const args = { ...GEOM, face: 'face', frame: 'frame', text: 'shine', ...s };
    const m = measurePiece(entry, args, { size: [64, 24] });
    assert.deepEqual(m, measureCounter({ band: 1, corner: 2, ink: 'ink', ...args }));
    assert.equal(m.textArea.length, s.count);
    const px = plate(s);
    for (const r of m.textArea) {
      assert.equal(r.colour, 'shine'); assert.deepEqual(r.edge, { x: 32, y: 2 });
      assert.ok(r.w >= 7 && r.h >= 5, 'room for a digit');
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) assert.equal(px.get(`${x},${y}`), 'face', `${JSON.stringify(s)}: (${x},${y}) of a text area`);
    }
    assert.equal(px.get('32,2'), 'frame.light', 'the edge pixel is on the frame band');
  }
});

test('every picture differs from every other by 12 or more pixels and keeps a 1 px ink line inside its 13 px window', () => {
  for (const a of STAT_MARKS) {
    const pa = mark({ name: a });
    assert.ok([...pa.values()].filter((v) => v === 'glow').length >= 24, `${a}: a picture of some weight`);
    for (const [k, v] of pa) {
      const [x, y] = k.split(',').map(Number);
      assert.ok(x >= 4 && x <= 16 && y >= 5 && y <= 17, `${a}: (${k})`);
      if (v === 'glow') assert.ok(x >= 5 && x <= 15 && y >= 6 && y <= 16, `${a}: the picture is 11 px, 1 px clear of the window's edge`);
    }
    for (const b of STAT_MARKS) if (a < b) assert.ok(differ(pa, mark({ name: b })) >= 12, `${a} and ${b}`);
  }
});
