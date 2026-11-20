// Migration batch M8b (docs/data-sprites.md 2.5b; review M8 round 3): a lit trough and the second versions of three skinned pieces of
// engine/gen/ui-skin.js, made for the control sets (sprites/ui-controls-*.json) and the neon bars, each drawing what the
// code helpers drew (engine/ui-skins.js skinCheck, skinRadio, skinSwitch, skinPointer, skinSelector, skinSlider;
// engine/ui-neon-tube.js neonBarTube) closer than version 1, which stays as it was:
//   ui.trough.lit@1 a lit tube: `glowRing` (with extras) rings the inside of a housing's opening and is a rail's band, `core`
//                  is a rail's trough, `twoTubes` the accent in its lower half; with none of them it draws exactly as ui.trough@1
//   ui.toggle@2    the code's tick (two 2 px strokes, inked round), radio dot (with its light pixel, inked round) and
//                  switch (a band round the track, a knob 2 px smaller than the track inside it, inked round)
//   ui.pointer@2   drawn from its own pixel art when given one, nudged as version 1, and giving its tip as an attach
//                  point (the code's `tip` socket) that moves with the nudge
//   ui.selector@2  the code's brackets: an arm of `len` px, lit pixels at the bend, a core line, in one of the step
//                  patterns the code sets used (pulse, between, held, grow)
// Review M8b round 1 (each family's look at its defaults, the styles on the selector): ui.toggle@2's band marks (tube,
// vine, bevel, facets, plate, fillet, stripes, gloss, bites, card, cracks, trackOff, trackEnd), ui.selector@2's
// `marks`, ui.trough.lit@1's `sign`, ui.pointer@2's art cap, and ui.strip.lit@1 (the RPG bars' barFill shine). These
// versions were never released (committed) before this round, so their goldens were pinned again with the new cases;
// every case pinned before is unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';
import { SKIN_MEASURES, SKIN_PIECES_2 } from '../../engine/gen/ui-skin.js';
import { UI_MEASURES, measurePiece } from '../../engine/gen/ui-pieces.js';
import { expandList } from '../../engine/gen/index.js';
import { drawList } from '../../engine/draw-list.js';
import { Surface } from '../../engine/surface.js';
import { paintHex } from '../../engine/resolve.js';

const PAINTS = { face: 'face', frame: 'frame', accent: 'accent' };
const PALETTE = { face: { hex: '#3f5068', material: 'interface' }, frame: { hex: '#8fd0f0', material: 'interface' },
  accent: { hex: '#e08a2c', material: 'interface' }, shine: { hex: '#ffffff', material: 'light', detail: true } };
const ART = [{ kind: 'stamp', at: [0, -2], rows: ['.aa..', 'abbaa', 'abbba', 'abbaa', '.aa..'], key: { a: 'ink', b: 'accent' } }];

const CASES = {
  'ui.trough.lit@1': [
    { args: { at: [1, 1], size: [62, 14], ...PAINTS } },
    { args: { at: [1, 1], size: [62, 14], rings: ['ink', 'frame', 'frame.light', 'ink'], extras: true, glowRing: 'frame.dark', ...PAINTS } },
    { args: { at: [1, 1], size: [62, 14], role: 'rail', extras: true, glowRing: 'frame.dark', core: 'frame.light', ...PAINTS } },
    { args: { at: [1, 1], size: [62, 14], role: 'rail', core: 'frame.light', twoTubes: true, edge: 'cut', ...PAINTS } },
    // review M8b round 1: the neon sign's gaps at the bends
    { args: { at: [1, 1], size: [62, 14], rings: ['ink', 'frame', 'frame.light', 'ink'], sign: true, ...PAINTS } },
  ],
  'ui.toggle@2': [
    { args: { at: [16, 16], ...PAINTS } },
    { args: { at: [16, 16], kind: 'radio', lit: true, ...PAINTS } },
    { args: { at: [16, 16], kind: 'switch', size: 28, ...PAINTS } },
    { args: { at: [16, 16], kind: 'switch', size: 28, checked: false, edge: 'cut', knobLight: true, ...PAINTS } },
    { args: { at: [16, 16], kind: 'check', checked: false, corner: 1, border: 1, ...PAINTS } },
    // review M8b round 1: the code sets' band marks (neon tube and sign, grove vine, bark and bloom, crystal, gilded, paper, candy)
    { args: { at: [16, 16], rings: ['ink', 'frame'], tube: 'double', border: 2, ...PAINTS } },
    { args: { at: [16, 16], kind: 'switch', size: 28, tube: 'sign', border: 3, ...PAINTS } },
    { args: { at: [16, 16], kind: 'radio', rings: ['ink', 'frame'], vine: 'bloom', twistIn: 1, ...PAINTS } },
    { args: { at: [16, 16], checked: false, rings: ['ink', 'frame'], vine: 'bark', ...PAINTS } },
    { args: { at: [16, 16], rings: ['ink', 'frame'], bevel: 'outer', bevelDepth: 0.6, facets: 'ice', ...PAINTS } },
    { args: { at: [16, 16], kind: 'switch', size: 28, checked: false, rings: ['ink', 'frame'], bevel: 'outer', facets: 'rime', ...PAINTS } },
    { args: { at: [16, 16], kind: 'radio', rings: ['ink', 'frame'], bevel: 'outer', facets: 'shard', ...PAINTS } },
    { args: { at: [16, 16], edge: 'cut', corner: 3, rings: ['ink', 'frame', 'ink'], fillet: true, bevel: 'skin', bevelDepth: 1, plate: 'temple', cracks: true, ...PAINTS } },
    { args: { at: [16, 16], kind: 'switch', size: 28, edge: 'cut', plate: 'ruin', plateSize: 3, cracks: true, knobLight: true, ...PAINTS } },
    { args: { at: [16, 16], checked: false, rings: ['ink', 'frame', 'face', 'frame'], bites: true, ...PAINTS } },
    { args: { at: [16, 16], kind: 'switch', size: 28, card: 3, trackOff: 'face.dark', trackEnd: 'frame', ...PAINTS } },
    { args: { at: [16, 16], rings: ['ink', 'frame', 'ink'], bevel: 'frosted', gloss: true, stripes: true, card: 4, ...PAINTS } },
  ],
  'ui.pointer@2': [
    { args: { at: [4, 16], ...PAINTS } },
    { args: { at: [4, 16], art: ART, tip: [5, 0], ...PAINTS }, ctx: { t: 0.25, loop: true, frames: 8, frame: 2 } },
    { args: { at: [2, 10], len: 14, reach: 3, ...PAINTS }, ctx: { t: 0.5, loop: true, frames: 8, frame: 4 } },
  ],
  'ui.selector@2': [
    { args: { at: [1, 1], size: [30, 30], len: 4, ...PAINTS } },
    { args: { at: [1, 1], size: [30, 30], len: 4, lit: true, steps: 'between', ...PAINTS }, ctx: { t: 0, loop: true, frames: 8, frame: 0 } },
    { args: { at: [1, 1], size: [30, 30], len: 4, extras: true, steps: 'held', ...PAINTS }, ctx: { t: 0.375, loop: true, frames: 8, frame: 3 } },
    { args: { at: [1, 1], size: [30, 30], len: 7, steps: 'grow', ...PAINTS }, ctx: { t: 0.5, loop: true, frames: 8, frame: 4 } },
    { args: { at: [1, 1], size: [30, 30], len: 4, thick: 3, core: 'frame.light', ...PAINTS } },
    // review M8b round 1: the styles reach the selector
    { args: { at: [1, 1], size: [30, 30], len: 4, core: 'frame.light', marks: 'double', ...PAINTS } },
    { args: { at: [1, 1], size: [30, 30], len: 4, core: 'frame.light', marks: 'sign', ...PAINTS } },
    { args: { at: [1, 1], size: [30, 30], len: 7, steps: 'grow', marks: 'bloom', ...PAINTS }, ctx: { t: 0.5, loop: true, frames: 8, frame: 4 } },
    { args: { at: [1, 1], size: [30, 30], len: 4, marks: 'shard', ...PAINTS } },
  ],
  // review M8b round 1: the RPG bars' fill, lit as the code's barFill
  'ui.strip.lit@1': [
    { args: { at: [1, 1], size: [62, 14], fill: 'accent', shine: 'frame' } },
    { args: { at: [1, 1], size: [62, 14], fill: 'accent', shine: 'frame', gloss: true, glintPaint: 'face' } },
    { args: { at: [1, 1], size: [62, 14], fill: 'accent', shine: 'frame', gloss: true, glintPaint: 'face', segments: 5, flash: 1, fade: true }, ctx: { t: 1 / 3, loop: false, frames: 4, frame: 1 } },
  ],
};

/** A colour rule worked out at the test palette (the panel layout works them out per frame; drawList alone does not). */
const fixPaint = (p) => (p && typeof p === 'object' && typeof p.rule === 'string' ? paintHex(p, PALETTE) ?? p : p);
/** The pixels of one call drawn on a w x h surface: a function (x, y) -> '#rrggbb' or null. */
function pixels(call, ctx = {}, [w, h] = [64, 32]) {
  const x = expandList([call], { size: [w, h], t: 0, frame: 0, frames: 1, loop: true, ...ctx });
  assert.ok(x.ok, x.errors.join('; '));
  const g = new Surface(w, h);
  const prims = x.primitives.map((q) => ({ ...q, ...(q.paint ? { paint: fixPaint(q.paint) } : {}), ...(q.key ? { key: Object.fromEntries(Object.entries(q.key).map(([k, v]) => [k, fixPaint(v)])) } : {}) }));
  drawList(g, prims, { palette: PALETTE });
  return (px, py) => { const v = g.get(px, py); return v >>> 24 ? `#${[0, 8, 16].map((s) => ((v >>> s) & 255).toString(16).padStart(2, '0')).join('')}` : null; };
}
const column = (P, x, y0, y1) => Array.from({ length: y1 - y0 }, (_, i) => P(x, y0 + i));

test('M8b registers the lit trough and the second versions of the toggle, pointer and selector, each measured', () => {
  assert.deepEqual([...SKIN_PIECES_2], Object.keys(CASES));
  for (const key of SKIN_PIECES_2) {
    const [id, v] = key.split('@');
    const e = registry.generator(id, Number(v));
    assert.ok(e, key);
    assert.equal(e.family, 'ui');
    assert.equal(typeof UI_MEASURES[key], 'function', `${key} is measured (UI_MEASURES)`);
    assert.equal(UI_MEASURES[key], SKIN_MEASURES[key]);
    // version 1 (the plain trough for the lit one) stays registered beside it (released versions never change)
    assert.ok(registry.generator(id === 'ui.trough.lit' ? 'ui.trough' : id, 1), `${id}@1`);
  }
});

for (const [key, cases] of Object.entries(CASES)) {
  test(`${key} passes the goldens harness`, () => {
    const [id, v] = key.split('@');
    checkGeneratorContract(registry, registry.generator(id, Number(v)), { cases });
  });
}

test('ui.trough.lit@1 with no glow ring, core or second tube draws exactly as ui.trough@1', () => {
  const sets = [
    { at: [1, 1], size: [62, 14] },
    { at: [1, 1], size: [62, 14], role: 'rail', corner: 0 },
    { at: [1, 1], size: [62, 14], segments: 5, lit: true, trough: 'ink', edge: 'cut' },
    { at: [1, 1], size: [62, 14], rings: ['ink', 'frame', 'frame.light', 'accent'], rim: 'accent', extras: true, trough: 'well' },
    { at: [1, 1], size: [62, 14], role: 'rail', extras: true, glowRing: 'clear' },
  ];
  for (const a of sets) {
    const { glowRing, ...v1 } = a;
    const one = registry.runGenerator({ gen: 'ui.trough', v: 1, ...PAINTS, ...v1 }, {});
    const two = registry.runGenerator({ gen: 'ui.trough.lit', v: 1, ...PAINTS, ...a }, {});
    assert.ok(one.ok && two.ok, `${one.errors} ${two.errors}`);
    assert.deepEqual(two.primitives, one.primitives, JSON.stringify(a));
  }
});

test('ui.trough.lit@1: a rail is a lit tube (review M8 round 3: the neon rail was inverted): band or glow round a light core', () => {
  const rail = { gen: 'ui.trough.lit', v: 1, at: [1, 1], size: [62, 14], role: 'rail', ...PAINTS, core: 'frame.light' };
  // the code's neon rail at the middle column: ink, the tube's dark tone (Glow on) or the band, the core twice, again, ink
  const lit = column(pixels({ ...rail, extras: true, glowRing: 'frame.dark' }), 32, 5, 11);
  const plain = column(pixels(rail), 32, 5, 11);
  const P = pixels({ gen: 'ui.trough', v: 1, at: [0, 0], size: [8, 8], ...PAINTS });   // ink, as the panel draws it
  const ink = P(0, 3);
  assert.equal(lit[0], ink); assert.equal(lit[5], ink);
  assert.equal(lit[2], lit[3]); assert.equal(lit[1], lit[4]);
  assert.notEqual(lit[1], lit[2]);
  assert.equal(plain[2], lit[2], 'the core is the same light tone with or without the glow');
  assert.notEqual(plain[1], lit[1], 'the glow darkens the band');
  // the core is lighter than the band round it: a light core, not a dark trough
  const lum = (h) => [1, 3, 5].reduce((s, i, k) => s + [0.3, 0.59, 0.11][k] * parseInt(h.slice(i, i + 2), 16), 0);
  assert.ok(lum(lit[2]) > lum(lit[1]) && lum(plain[2]) > lum(plain[1]), `${lit} ${plain}`);
  // the second tube: the lower half of the core
  const two = column(pixels({ ...rail, twoTubes: true }), 32, 5, 11);
  assert.equal(two[2], plain[2]); assert.notEqual(two[3], plain[3]);
});

test('ui.trough.lit@1: with extras on, a housing\'s glow rings the inside of its opening; off, the opening is as version 1', () => {
  const h = { gen: 'ui.trough.lit', v: 1, at: [1, 1], size: [62, 14], border: 1, rings: ['ink', 'frame', 'frame.light', 'ink'], ...PAINTS, glowRing: 'frame.dark' };
  const { glowRing, ...h1 } = h;
  const on = pixels({ ...h, extras: true }), off = pixels(h), one = pixels({ ...h1, gen: 'ui.trough', v: 1 });
  const o = { x: 5, y: 5, w: 54, h: 6 };   // inside four rings
  const ring = on(o.x, o.y);
  for (const [x, y] of [[o.x, o.y + 3], [o.x + 20, o.y], [o.x + o.w - 1, o.y + 2], [o.x + 30, o.y + o.h - 1]]) assert.equal(on(x, y), ring, `${x},${y}`);
  assert.notEqual(on(o.x + 20, o.y + 2), ring, 'the trough inside the glow');
  for (let y = 0; y < 16; y++) for (let x = 0; x < 64; x++) assert.equal(off(x, y), one(x, y), `${x},${y}`);
  // the strip of the same rings fills the opening exactly, glow or not (it is the opening of version 1)
  const m = measurePiece(registry.generator('ui.trough.lit', 1), { ...h, extras: true }, { size: [64, 16] });
  assert.deepEqual(m.slice.opening, o);
});

/** A call's pixels as rows of letters: A ink, B frame, C face (or the track), D accent, E any other; '.' nothing. */
function letters(call, [x0, y0, x1, y1], ctx = {}) {
  const P = pixels(call, ctx, [32, 32]);
  const ink = pixels({ gen: 'ui.trough', v: 1, at: [0, 0], size: [8, 8], ...PAINTS }, {}, [32, 32])(0, 3);
  const L = { [ink]: 'A', '#8fd0f0': 'B', '#3f5068': 'C', '#e08a2c': 'D' };
  return Array.from({ length: y1 - y0 }, (_, j) => Array.from({ length: x1 - x0 }, (_, i) => { const h = P(x0 + i, y0 + j); return h === null ? '.' : L[h] ?? 'E'; }).join(''));
}
// the flat skin's rings and a 2 px band, as sprites/ui-controls-flat.js drew them (its render at the defaults, letters as above)
const FLAT = { ...PAINTS, rings: ['ink', 'frame'], bandAt: 1, border: 2, corner: 2 };

test('ui.toggle@2 draws the code\'s tick, dot and switch (the flat set\'s pixels)', () => {
  assert.deepEqual(letters({ gen: 'ui.toggle', v: 2, at: [16, 16], ...FLAT }, [6, 9, 26, 22]), [
    'ABBCCCCCCCCCCCCCCBBA', 'ABBCCCCCCCCCCCAACBBA', 'ABBCCCCCCCCCCADDABBA', 'ABBCCCCCCCCCADDDABBA', 'ABBCCCCCCCCCADDACBBA',
    'ABBCAACCCCCADDACCBBA', 'ABBADDACCCADDDACCBBA', 'ABBADDDACADDDACCCBBA', 'ABBCADDDAADDACCCCBBA', 'ABBCCADDDDDACCCCCBBA',
    'ABBCCCADDDDACCCCCBBA', 'ABBCCCCADDACCCCCCBBA', 'ABBCCCCCAACCCCCCCBBA']);
  assert.deepEqual(letters({ gen: 'ui.toggle', v: 2, kind: 'radio', at: [16, 16], ...FLAT }, [6, 11, 26, 21]), [
    '.ABBCCCCAAAACCCCBBA.', '.ABBCCCADDDDACCCBBA.', 'ABBCCCADDDDDDACCCBBA', 'ABBCCADDDDDDEDACCBBA', 'ABBCCADDDDDDDDACCBBA',
    'ABBCCADDDDDDDDACCBBA', 'ABBCCADDDDDDDDACCBBA', 'ABBCCCADDDDDDACCCBBA', '.ABBCCCADDDDACCCBBA.', '.ABBCCCCAAAACCCCBBA.']);
  // the switch on: ink, a band of the frame, the track of the accent; the knob of the frame on the right, inked round
  assert.deepEqual(letters({ gen: 'ui.toggle', v: 2, kind: 'switch', size: 28, at: [16, 16], ...FLAT }, [0, 8, 32, 24]), [
    '.......AAAAAAAAAAAAAAAAAA.......', '.....AABBBBBBBBBBBBBBBBBBAA.....', '....ABBDDDDDDDDDDDDDAAAADBBA....', '...ABDDDDDDDDDDDDDAABBBBAADBA...',
    '...ABDDDDDDDDDDDDABBBBBBBBABA...', '..ABDDDDDDDDDDDDDABBBBBBBBADBA..', '..ABDDDDDDDDDDDDABBBBBBBBBBABA..', '..ABDDDDDDDDDDDDABBBBBBBBBBABA..',
    '..ABDDDDDDDDDDDDABBBBBBBBBBABA..', '..ABDDDDDDDDDDDDABBBBBBBBBBABA..', '..ABDDDDDDDDDDDDDABBBBBBBBADBA..', '...ABDDDDDDDDDDDDABBBBBBBBABA...',
    '...ABDDDDDDDDDDDDDAABBBBAADBA...', '....ABBDDDDDDDDDDDDDAAAADBBA....', '.....AABBBBBBBBBBBBBBBBBBAA.....', '.......AAAAAAAAAAAAAAAAAA.......']);
  // off: the knob on the left, the track the face's dark tone
  const off = letters({ gen: 'ui.toggle', v: 2, kind: 'switch', checked: false, size: 28, at: [16, 16], ...FLAT }, [0, 16, 32, 17])[0];
  assert.equal(off, '..ABABBBBBBBBBBAEEEEEEEEEEEEBA..');
});

test('ui.pointer@2 draws its art moved by the nudge and gives its tip as an attach point that moves with it', () => {
  const e = registry.generator('ui.pointer', 2), call = { at: [4, 16], art: ART, tip: [5, 0], reach: 2, ...PAINTS };
  const at = (t) => measurePiece(e, call, { size: [32, 32], t, loop: true, frames: 8 }).points.tip;
  const seen = [];
  for (let f = 0; f < 8; f++) {
    const t = f / 8, P = pixels({ gen: 'ui.pointer', v: 2, ...call }, { t, loop: true, frames: 8, frame: f }, [32, 32]);
    const tip = at(t);
    assert.equal(tip.angle, Math.PI / 2);
    assert.equal(tip.y, 16.5);
    // the tip is the art's far pixel on its centre row (column 4 of the art, plus 1 for the hot spot past it, as the code's)
    assert.ok(P(tip.x - 1, 16) !== null && P(tip.x, 16) === null, `frame ${f}: tip ${tip.x}`);
    seen.push(tip.x - 9);
  }
  // the code's nudge: 1, 2, 2, 2, 1, 0, 0, 0 px over the loop
  assert.deepEqual(seen, [1, 2, 2, 2, 1, 0, 0, 0]);
  // version 1's measure gives no point (unchanged)
  assert.deepEqual(measurePiece(registry.generator('ui.pointer', 1), call, { size: [32, 32], t: 0 }), {});
});

test('ui.selector@2: the code\'s brackets and step patterns', () => {
  const sel = { gen: 'ui.selector', v: 2, at: [1, 1], size: [30, 30], len: 4, ...PAINTS };
  const at = (args, f) => pixels({ ...sel, ...args }, { t: f / 8, loop: true, frames: 8, frame: f }, [32, 32]);
  // pulse: out (corner 1 px in from the box) then in (2 px), back out; the arm 4 long and 2 thick, inked round
  const out = at({}, 0), inn = at({}, 4);
  assert.equal(out(2, 2), '#8fd0f0'); assert.equal(out(5, 3), '#8fd0f0'); assert.equal(out(6, 2), out(1, 2));
  assert.equal(inn(2, 2), null, 'stepped in: the old corner is empty');
  assert.equal(inn(3, 2), out(1, 2), 'and ink lies along the arm\'s outer side');
  assert.equal(inn(3, 3), '#8fd0f0');
  // the four corners mirror each other
  for (const P of [out, inn]) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) assert.equal(P(31 - x, 31 - y), P(x, y), `${x},${y}`);
  // held (the gilded set): out, out, in, in, in, in, out, out
  const held = [0, 1, 2, 3, 4, 5, 6, 7].map((f) => at({ steps: 'held' }, f)(2, 2) === '#8fd0f0' ? 0 : 1);
  assert.deepEqual(held, [0, 0, 1, 1, 1, 1, 0, 0]);
  // between (the candy set): its between frames hold both poses at once
  const between = at({ steps: 'between' }, 0);
  assert.equal(between(2, 2), '#8fd0f0'); assert.equal(between(3, 3), '#8fd0f0');
  // lit: the two pixels at the bend of the outer line are the band's light tone
  const lit = at({ lit: true }, 0);
  assert.notEqual(lit(2, 2), '#8fd0f0'); assert.equal(lit(5, 2), '#8fd0f0');
  // grow (the grove set): arms of 7 and 8 px with buds of the accent at their ends
  const grow = at({ len: 7, steps: 'grow' }, 4);
  assert.equal(grow(4, 12), '#e08a2c'); assert.equal(grow(12, 5), '#e08a2c'); assert.equal(grow(11, 4), '#8fd0f0');
  // a core line (the neon set): the second line of each arm
  const core = at({ core: 'accent' }, 0);
  assert.equal(core(3, 3), '#e08a2c'); assert.equal(core(4, 2), '#8fd0f0');
});

// ---- review M8b round 1: the code sets' band marks, the styles on the selector, the sign's gaps, the pointer's art ----

const BOX = { gen: 'ui.toggle', v: 2, at: [16, 16], ...PAINTS };
const hex = (call, ctx) => pixels(call, ctx, [32, 32]);
const TONE = (of, by) => ({ rule: 'tone', of, by });
/** The paints of a call's primitives (colour rules as JSON), to find a mark's tone where the test palette cannot work it out. */
const paintsOf = (call, ctx = {}) => new Set(registry.runGenerator(call, ctx).primitives.flatMap((p2) => [p2.paint, ...Object.values(p2.key ?? {})]).filter(Boolean).map((p2) => JSON.stringify(p2)));

test('ui.toggle@2: every band mark is off by default, so a call naming none draws as before (the flat set\'s pixels)', () => {
  for (const kind of ['check', 'radio', 'switch']) for (const checked of [true, false]) {
    const base = { ...BOX, kind, checked, size: kind === 'switch' ? 28 : 20, ...FLAT };
    const off = { tube: 'none', vine: 'none', bevel: 'none', facets: 'none', plate: 'none', fillet: false, stripes: false, gloss: false, bites: false, card: 0, cracks: false, trackOff: 'clear', trackEnd: 'clear' };
    assert.deepEqual(registry.runGenerator({ ...base, ...off }, {}).primitives, registry.runGenerator(base, {}).primitives, `${kind} ${checked}`);
  }
});

test('ui.toggle@2: a neon tube (the code\'s outline style): ink, the gap of the face, the band, its light core, the second tube', () => {
  const col = (args) => letters({ ...BOX, checked: false, rings: ['ink', 'frame'], ...args }, [16, 6, 17, 13]).join('');
  assert.equal(col({ tube: 'tube', border: 2 }), 'ACBECCC');
  assert.equal(col({ tube: 'tube', border: 3 }), 'ACBEBCC', 'Thick: band, core, band');
  assert.equal(col({ tube: 'double', border: 2 }), 'ACBEDCC', 'double: a second tube of the accent inside');
  assert.equal(col({ tube: 'sign', border: 2 }), 'ABECCCC', 'sign: no gap ring');
  assert.ok(paintsOf({ ...BOX, tube: 'tube' }).has(JSON.stringify(TONE('frame', 0.85))), 'the core is the frame\'s tone +0.85');
  // a switch with a tube: a band of `border` lines over the track, its second the core, no gap ring
  const sw = (border) => letters({ ...BOX, kind: 'switch', size: 28, ...FLAT, tube: 'tube', border }, [16, 8, 17, 14]).join('');
  assert.equal(sw(2), 'ABEDDD', 'the band, then its core, over the accent track');
  assert.equal(sw(3), 'ABEBDD', 'Thick: band, core, band');
  // sign: the band broken at each bend in the face's dark tone, a clip of the frame's dark tone inside
  const sign = paintsOf({ ...BOX, checked: false, rings: ['ink', 'frame'], tube: 'sign' });
  assert.ok(sign.has(JSON.stringify(TONE('face', -1))) && sign.has(JSON.stringify(TONE('frame', -1))));
});

test('ui.toggle@2: the grove vine\'s twist runs across the band every 2 px and on over the face', () => {
  const call = { ...BOX, checked: false, rings: ['ink', 'frame'], border: 2, vine: 'vine', twistIn: 1 };
  const P = letters(call, [9, 6, 23, 10]);
  // the top band (rows 7 and 8) and the face's first row (9): stripes of the twist (the frame's tone -1) in alternate
  // columns, counted from each corner (so the two halves meet with two band pixels side by side, as the code's twist)
  assert.equal(P[1], 'BEBEBEBBEBEBEB');
  assert.equal(P[1], P[2]);
  assert.equal(P[3], 'CECECECCECECEC', 'the stripes run on over the face');
  assert.ok(paintsOf(call).has(JSON.stringify(TONE('frame', -1))));
  // bark: no twist; the band's inner line and the face's first ring dark, knots of the face's light tone
  const bark = paintsOf({ ...call, vine: 'bark' });
  assert.ok(bark.has(JSON.stringify(TONE('frame', -1))) && bark.has(JSON.stringify(TONE('face', 0.45))));
  assert.notEqual(letters({ ...call, vine: 'bark' }, [9, 7, 23, 8])[0], P[1]);
  // bloom: the twist and a flower round a gold heart
  assert.ok([...paintsOf({ ...call, vine: 'bloom' })].some((x) => x.includes('#f2c230')));
});

test('ui.toggle@2: bevel, facets, plates, bites, card, cracks, fillet, stripes and gloss stay inside the piece and change it', () => {
  const base = { ...BOX, checked: false, rings: ['ink', 'frame'], border: 2 };
  const drawn = (args) => { const P = hex({ ...base, ...args }); const set = new Set(); for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (P(x, y)) set.add(`${x},${y}`); return { P, set, n: registry.runGenerator({ ...base, ...args }, {}).primitives }; };
  const plain = drawn({});
  for (const args of [{ bevel: 'outer' }, { bevel: 'skin' }, { bevel: 'frosted' }, { facets: 'ice' }, { facets: 'rime' }, { facets: 'shard' }, { plate: 'temple' }, { plate: 'royal' },
    { vine: 'bark' }, { vine: 'bloom' }, { fillet: true }, { stripes: true }, { gloss: true }, { cracks: true }, { tube: 'sign' }]) {
    const d = drawn(args);
    for (const k of d.set) assert.ok(plain.set.has(k), `${JSON.stringify(args)}: ${k} is outside the piece`);
    assert.notDeepEqual(d.n, plain.n, `${JSON.stringify(args)} changes the piece`);
  }
  // the torn bites take pixels away at the sides (and ink the piece round them); the card's fold takes the top right corner
  const torn = drawn({ bites: true }), card = drawn({ card: 4 });
  assert.ok(torn.set.size < plain.set.size);
  assert.ok(!card.set.has('23,6') && plain.set.has('23,6'), 'the folded corner is cut away');
  // the icicles and shards keep out of the middle (the tick, the dot); the rime's ferns grow in from the band as the code's did
  for (const facets of ['ice', 'shard']) { const P = hex({ ...base, facets, bevel: 'outer' }); for (let y = 11; y < 21; y++) for (let x = 11; x < 21; x++) assert.equal(P(x, y), plain.P(x, y), `${facets} ${x},${y}`); }
});

test('ui.toggle@2: a switch\'s track when off and its end when on', () => {
  const sw = { ...BOX, kind: 'switch', size: 28, ...FLAT };
  assert.notEqual(hex({ ...sw, checked: false, trackOff: 'accent' })(20, 16), hex({ ...sw, checked: false })(20, 16));
  const end = hex({ ...sw, trackEnd: 'face' }), on = hex(sw);
  assert.equal(end(4, 16), on(4, 16), 'the track before the knob stays the accent');
  assert.equal(end(24, 10), '#3f5068'); assert.equal(on(24, 10), '#e08a2c');
});

test('ui.toggle@2: band marks keep its cost a bound on what it returns, at every size and border', () => {
  const marks = [{ vine: 'vine', twistIn: 2, stripes: true, bevel: 'frosted', gloss: true }, { tube: 'double', fillet: true }, { tube: 'sign', bevel: 'skin' },
    { plate: 'royal', plateSize: 6, cracks: true, bites: true, card: 6, vine: 'bark', facets: 'shard' }, { vine: 'bloom', facets: 'ice', bevel: 'skin', trackOff: 'accent', trackEnd: 'frame' }, { facets: 'rime', bevel: 'outer' }];
  for (const m of marks) for (const kind of ['check', 'radio', 'switch']) for (const size of [8, 12, 20, 28, 40]) for (const border of [1, 2, 3]) for (const edge of ['round', 'cut', 'chip', 'pill']) {
    const r = registry.runGenerator({ ...BOX, kind, size, border, edge, corner: 4, rings: ['ink', 'frame', 'ink', 'frame'], ...m }, {});
    assert.ok(r.ok, `${kind} ${size} ${border} ${JSON.stringify(m)}: ${r.errors}`);
  }
});

test('ui.selector@2: neon double and sign, grove vine, bark and bloom, crystal rime and shard reach the brackets', () => {
  const sel = { gen: 'ui.selector', v: 2, at: [1, 1], size: [30, 30], len: 4, ...PAINTS };
  const ctx = { t: 1 / 8, loop: true, frames: 8, frame: 1 };
  const at = (args) => pixels({ ...sel, ...args }, ctx, [32, 32]);
  const plain = at({});
  // double: a line of the accent just inside the bracket's second line, as long as its arms
  const dbl = at({ marks: 'double' });
  assert.equal(dbl(4, 4), '#e08a2c'); assert.equal(dbl(5, 4), '#e08a2c'); assert.equal(dbl(4, 5), '#e08a2c'); assert.equal(dbl(2, 2), plain(2, 2));
  // sign: the bracket broken at the bend (within one step of the diagonal) in the face's dark tone, the arm's end kept
  const sign = letters({ ...sel, marks: 'sign' }, [2, 2, 6, 4], ctx);
  assert.deepEqual(sign, ['EEBB', 'EEEB']);
  assert.ok(paintsOf({ ...sel, marks: 'sign' }, ctx).has(JSON.stringify(TONE('face', -1))));
  // vine: every second pixel along each arm, across both its lines, in the frame's dark tone
  assert.deepEqual(letters({ ...sel, marks: 'vine', len: 7 }, [2, 2, 9, 4], ctx), ['BEBEBEB', 'EEBEBEB']);
  // bark and rime: the knot one in from the bend; shard: the bottom brackets only
  assert.equal(letters({ ...sel, marks: 'bark' }, [3, 3, 4, 4], ctx)[0], 'E');
  assert.equal(at({ marks: 'rime' })(3, 3), '#e08a2c'); assert.equal(at({ marks: 'rime' })(28, 28), '#e08a2c');
  const shard = letters({ ...sel, marks: 'shard' }, [3, 28, 4, 29], ctx)[0];
  assert.equal(at({ marks: 'shard' })(3, 3), plain(3, 3)); assert.equal(shard, 'E');
  // bloom: a flower round a gold heart at each top bend, a bud on each bottom bracket
  const bloom = at({ marks: 'bloom', len: 7 });
  for (const [x, y] of [[2, 3], [4, 3], [3, 2], [3, 4], [5, 28]]) assert.equal(bloom(x, y), '#e08a2c', `${x},${y}`);
  assert.ok([...paintsOf({ ...sel, marks: 'bloom', len: 7 }, ctx)].some((x) => x.includes('#f2c230')), 'a gold heart');
});

test('ui.trough.lit@1: the sign\'s gaps break the tube at each corner bend, on the rings only', () => {
  const h = { gen: 'ui.trough.lit', v: 1, at: [1, 1], size: [62, 14], rings: ['ink', 'frame', 'frame.light', 'ink'], ...PAINTS };
  const off = pixels(h), on = pixels({ ...h, sign: true });
  let changed = 0;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 64; x++) if (on(x, y) !== off(x, y)) { changed++; assert.ok(x < 8 || x > 55, `${x},${y}: only at the corners`); }
  assert.ok(changed >= 8 && changed <= 24, `${changed}`);
  assert.equal(on(3, 2), on(60, 2)); assert.notEqual(on(3, 2), off(3, 2));
});

test('ui.pointer@2: art past its eighth stamp, or a stamp missing its rows, at or key, is an error, never dropped unseen; another primitive is not drawn, as its description says (review M8b rounds 1 and 2)', () => {
  const call = { gen: 'ui.pointer', v: 2, at: [4, 16], ...PAINTS };
  assert.ok(registry.runGenerator({ ...call, art: Array.from({ length: 8 }, () => ART[0]) }, {}).ok);
  const r = registry.runGenerator({ ...call, art: Array.from({ length: 40 }, () => ART[0]) }, {});
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /at most 8 stamps/);
  // round 2, issue 5: a stamp missing its rows, at or key, or an item that is no primitive, fails the argument check
  for (const bad of [{ kind: 'stamp', at: [0, 0], key: { a: 'ink' } }, { kind: 'stamp', rows: ['a'], key: { a: 'ink' } }, 'stamp']) {
    const q = registry.runGenerator({ ...call, art: [ART[0], bad] }, {});
    assert.equal(q.ok, false, JSON.stringify(bad));
    assert.match(q.errors.join(' '), /art\.1/);
  }
  // a well-formed primitive that is not a stamp runs (every generator takes any primitive list: the contract harness)
  // but is not drawn, and the art's description says so
  const rect = registry.runGenerator({ ...call, art: [ART[0], { kind: 'rect', at: [0, 0], size: [5, 5], paint: 'ink' }] }, {});
  assert.ok(rect.ok); assert.deepEqual(rect.primitives, registry.runGenerator({ ...call, art: [ART[0]] }, {}).primitives);
  assert.match(registry.generator('ui.pointer', 2).args.art.about, /other primitives are not drawn/);
});

test('ui.strip.lit@1: the code\'s barFill shine (a light top row, a short glint at its start) that flashes with the strip', () => {
  const st = { gen: 'ui.strip.lit', v: 1, at: [1, 1], size: [62, 14], fill: 'accent', shine: 'frame' };
  // with no glint paint it is ui.strip@1
  for (const a of [{}, { gloss: true }, { gloss: true, segments: 5, flash: 0.5 }]) assert.deepEqual(registry.runGenerator({ ...st, ...a }, {}).primitives, registry.runGenerator({ ...st, ...a, gen: 'ui.strip', v: 1 }, {}).primitives);
  const P = pixels({ ...st, gloss: true, glintPaint: 'face' });
  const top = Array.from({ length: 8 }, (_, i) => P(5 + i, 5));
  assert.deepEqual(top.map((h) => (h === '#3f5068' ? 'g' : h === '#e08a2c' ? 'f' : 'l')).join(''), 'llgggllll'.slice(0, 8), `${top}`);
  assert.equal(P(7, 6), '#e08a2c', 'only the top row');
  // at the flash's first frame everything, the glint too, is the shine
  const F = pixels({ ...st, gloss: true, glintPaint: 'face', flash: 1, fade: true }, { t: 0, loop: false, frames: 4, frame: 0 });
  assert.equal(F(7, 5), F(20, 7));
});

// ---- review M8b round 2: the crystal selector's bevel, the code's pulse, the grove twist as it creeps, the neon blink ----

test('ui.selector@2 bends: per-corner stamps recolour the bracket at its bend, never past it, and follow its step', () => {
  const sel = { gen: 'ui.selector', v: 2, at: [1, 1], size: [30, 30], len: 4, ...PAINTS };
  const ctx = (f) => ({ t: f / 8, loop: true, frames: 8, frame: f });
  // top left lit, top right dark, bottom right the accent, bottom left lit; `at` from the bend, written as drawn (no mirroring)
  const stamp = (at, ch) => ({ kind: 'stamp', at, rows: [ch.repeat(4), ch.repeat(4), ch.repeat(4), ch.repeat(4)], key: { [ch]: ch === 'l' ? 'frame.light' : ch === 'd' ? 'frame.dark' : 'accent' } });
  const bends = [stamp([0, 0], 'l'), stamp([-3, 0], 'd'), stamp([-3, -3], 'a'), stamp([0, -3], 'l')];
  const plain = letters(sel, [0, 0, 32, 32], ctx(1)), bent = letters({ ...sel, bends }, [0, 0, 32, 32], ctx(1));
  // the same pixels drawn (the stamps' 4 x 4 squares cover the bracket's L and the empty pixels inside it)
  assert.deepEqual(bent.map((r) => r.replace(/[^.]/g, '#')), plain.map((r) => r.replace(/[^.]/g, '#')));
  assert.equal(bent[2].slice(2, 6), 'EEEE', 'top left: the light tone along its arm');
  assert.equal(bent[4][2], 'E'); assert.equal(bent[4][4], plain[4][4], 'never inside the L'); assert.equal(bent[5][5], plain[5][5]);
  assert.equal(bent[2].slice(26, 30), 'EEEE'); assert.equal(bent[29].slice(26, 30), 'DDDD', 'bottom right: the accent');
  assert.equal(bent[2][1], 'A', 'the ink stays');
  // stepped in, the stamps step in with the bracket; with eight, the last four are the stepped-in pose's
  const inn = letters({ ...sel, steps: 'pulse', bends }, [0, 0, 32, 32], ctx(4));
  assert.equal(inn[3].slice(3, 7), 'EEEE'); assert.equal(inn[2][2], '.');
  const eight = letters({ ...sel, bends: [...bends, stamp([0, 0], 'a'), stamp([-3, 0], 'a'), stamp([-3, -3], 'a'), stamp([0, -3], 'a')] }, [0, 0, 32, 32], ctx(4));
  assert.equal(eight[3].slice(3, 7), 'DDDD');
  assert.deepEqual(letters({ ...sel, bends: [...bends, stamp([0, 0], 'a'), stamp([-3, 0], 'a'), stamp([-3, -3], 'a'), stamp([0, -3], 'a')] }, [0, 0, 32, 32], ctx(1)), bent, 'out: the first four');
  // a ninth bend is an error; a primitive that is not a stamp is not drawn (its description says: stamps only)
  assert.equal(registry.runGenerator({ ...sel, bends: Array.from({ length: 9 }, () => bends[0]) }, {}).ok, false);
  assert.deepEqual(letters({ ...sel, bends: [{ kind: 'rect', at: [0, 0], size: [2, 2], paint: 'accent' }] }, [0, 0, 32, 32], ctx(1)), plain);
  assert.match(registry.generator('ui.selector', 2).args.bends.about, /stamps only/);
});

test('ui.selector@2 steps eased: the code\'s pulse (out 3 frames, in 4, out 1) with its first frame the pose between, so no frame run is long and the loop\'s ends differ', () => {
  const sel = { gen: 'ui.selector', v: 2, at: [1, 1], size: [30, 30], len: 4, steps: 'eased', ...PAINTS };
  // out: the arm down from (2, 2) reaches row 5; in: the arm along from (3, 3) reaches column 6; between: both
  const pose = (f) => { const P = pixels(sel, { t: f / 8, loop: true, frames: 8, frame: f }, [32, 32]); const o = P(2, 5) === '#8fd0f0', i = P(6, 3) === '#8fd0f0'; return o && i ? 'both' : o ? 0 : i ? 1 : '?'; };
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(pose), ['both', 0, 0, 1, 1, 1, 1, 0]);
});

test('ui.selector@2 vine: the twist keeps its place in the frame as the bracket creeps in (the code\'s stripes do not move with the step)', () => {
  const sel = { gen: 'ui.selector', v: 2, at: [1, 1], size: [30, 30], len: 7, steps: 'grow', marks: 'vine', ...PAINTS };
  const at = (f) => letters(sel, [0, 0, 32, 6], { t: f / 8, loop: true, frames: 8, frame: f });
  // frame 0: step 0, the bend at column 2; frame 1: step 1, the bend at column 3; the dark stripes on the same columns
  const r0 = at(0)[2], r1 = at(1)[3];
  for (let x = 4; x < 9; x++) assert.equal(r1[x] === 'E', r0[x] === 'E', `column ${x}: ${r0} / ${r1}`);
  assert.equal(r1[3], 'E', 'stepped in by one, the bend itself takes the stripe');
});

test('ui.pointer@2 blink: on the last frame of every eight the art\'s accent takes the blink paint (the neon core going dark)', () => {
  const call = { gen: 'ui.pointer', v: 2, at: [4, 16], art: ART, reach: 0, blink: 'frame.dark', ...PAINTS };
  const at = (f) => pixels(call, { t: f / 8, loop: true, frames: 8, frame: f }, [32, 32]);
  for (let f = 0; f < 7; f++) assert.equal(at(f)(5, 16), '#e08a2c', `frame ${f}`);
  assert.notEqual(at(7)(5, 16), '#e08a2c'); assert.equal(at(7)(4, 16), at(0)(4, 16), 'the ink stays');
  assert.deepEqual(registry.runGenerator({ ...call, blink: 'clear' }, { t: 7 / 8 }).primitives, registry.runGenerator({ ...call, blink: 'clear' }, { t: 0 }).primitives, 'no blink: as before');
});
