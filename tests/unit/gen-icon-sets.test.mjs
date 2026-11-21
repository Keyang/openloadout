// Migration batch M4 (docs/data-sprites.md section 9, M1 to M40; 3.3 family "icon": icon.plate, icon.slant, icon.rise):
// the generators the library icon sets need besides icon.fit, icon.paint, icon.line and icon.glint, in
// engine/gen/icon-sets.js. Each is a port of engine/icons.js and is held here to what that code paints:
//   icon.body@1    iconPaint through a pen (iconBold's: grown on every side)
//   icon.rim@1     iconPaint's `rim` (and iconOver's parting line, `over`)
//   icon.flame@1   iconFlame
//   icon.plate@1   iconPlate
//   icon.fitted@1  a sprite's render(): bodies (plain shapes), iconSlant / iconRise, iconTidy, outline(INK), lights,
//                  all fitted by iconFit (the ink line and lights measured as drawn)
//   oval@1         placedIn(ellipseIn(...)) turned: the turned ellipse a picture's own ellipse cannot say
// and each passes the goldens harness (tests/helpers/gen-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';
import { Surface, ellipseIn, capsuleIn, polyIn, rectIn } from '../../engine/surface.js';
import { tone, INK } from '../../engine/color.js';
import { paintColour } from '../../engine/data-rules.js';
import { drawList } from '../../engine/draw-list.js';
const DEG = 180 / Math.PI;
const run = (node, ctx = { size: [32, 32] }) => {
  const r = registry.runGenerator(node, ctx);
  assert.ok(r.ok, `${node.gen}: ${r.errors.join('; ')}`);
  return r.primitives;
};
/** Colour rules left in paints worked out to '#rrggbb' at these slot colours. */
function hexed(prims, palette) {
  const fix = (v) => (v && typeof v === 'object' && v.rule ? paintColour(v, palette) : v);
  return prims.map((p) => ({ ...p, ...(p.key ? { key: Object.fromEntries(Object.entries(p.key).map(([k, v]) => [k, fix(v)])) } : {}), ...(p.paint !== undefined ? { paint: fix(p.paint) } : {}) }));
}
function draw(prims, palette, base = null) {
  const g = base ?? new Surface(32, 32);
  drawList(g, hexed(prims, palette), { palette });
  return g;
}
function differ(a, b) {
  const out = [];
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) out.push([i % a.w, Math.floor(i / a.w)]);
  return out;
}
const same = (a, b, label) => assert.deepEqual(differ(a, b).slice(0, 6), [], `${label}: pixels differ`);
const HEX = { body: '#c9423a', gold: '#f2c230', ink: INK, rim: '#5a2a2a', face: '#4a609c', fire: '#e8662c', core: '#f4e06a', flare: '#a8402a', shine: '#ffffff' };

const ICON_LEAN = Math.atan(0.5), ICON_SLANT = 0.25;   // what engine/icons.js (deleted by R3) said: the lean of an icon, and the slant of a worn thing's rows
const PENS = [[ICON_LEAN, 1, true, true], [-ICON_LEAN / 2, 0.83, false, true], [0, 1.17, true, false]];
const CASES = [
  { tests: [ellipseIn(1.5, 0, 9.6, 5.4)], shapes: [{ kind: 'ellipse', at: [1.5, 0], r: [9.6, 5.4] }], opt: { soft: 1 }, args: { soft: 1 } },
  { tests: [ellipseIn(0, -1.2, 11.5, 9.4)], shapes: [{ kind: 'ellipse', at: [0, -1.2], r: [11.5, 9.4] }], opt: { soft: 2, minus: rectIn(-12, -1.2, 24, 11.2) }, args: { soft: 2, minus: [{ kind: 'rect', at: [-12, -1.2], size: [24, 11.2] }] } },
  { tests: [polyIn([[-4.6, -4.4], [4.6, -4.4], [0.7, 11.5], [-0.7, 11.5]]), capsuleIn(0, -4.6, 5, -11.4, 1.6, 0.8)], shapes: [{ kind: 'poly', points: [[-4.6, -4.4], [4.6, -4.4], [0.7, 11.5], [-0.7, 11.5]] }, { kind: 'capsule', from: [0, -4.6], to: [5, -11.4], r: [1.6, 0.8] }], opt: { soft: 0 }, args: { soft: 0 } },
  { tests: [ellipseIn(1.5, 0, 9.6, 5.4)], shapes: [{ kind: 'ellipse', at: [1.5, 0], r: [9.6, 5.4] }], opt: { soft: 0, light: 0, clip: rectIn(-6, 1.4, 20, 10) }, args: { soft: 0, lit: 0, within: [{ kind: 'rect', at: [-6, 1.4], size: [20, 10] }] } },
  { tests: [rectIn(-8, -2, 16, 4)], shapes: [{ kind: 'rect', at: [-8, -2], size: [16, 4] }], opt: { flat: true }, args: { flat: true } },
];

const BODIES = [
  { tests: [ellipseIn(0, 2, 9, 7)], prims: [{ kind: 'ellipse', at: [0, 2], r: [9, 7], paint: 'gold', shade: 2 }], paint: 'gold', opt: { soft: 1 } },
  { tests: [rectIn(-3, -10, 6, 8), ellipseIn(0, -10, 3, 2)], prims: [{ kind: 'rect', at: [-3, -10], size: [6, 8], paint: 'body', shade: 1, group: 'neck' }, { kind: 'ellipse', at: [0, -10], r: [3, 2], paint: 'body', shade: 1, group: 'neck' }], paint: 'body', opt: { soft: 0 } },
  { tests: [ellipseIn(4, 3, 3, 3)], prims: [{ kind: 'ellipse', at: [4, 3], r: [3, 3], paint: 'rim', shade: 0, light: 0 }], paint: 'rim', opt: { flat: true } },
];
const CUT = { kind: 'cut', from: 'neck', shape: { kind: 'ellipse', at: [0, -7], r: [1.5, 1.5], paint: 'body' } };
const bodyPrims = BODIES.flatMap((b) => b.prims);
const SIZES = [0, 0.2, 0.5, 0.7, 1];

/** iconCog's wheel (engine/icons-more.js): a disc and eight teeth, as shape tests and as data. */
function cogTeeth() {
  const n = 8, w = 1.3 + 5.6 / n, tests = [ellipseIn(0, 0, 7.6, 7.6)], prims = [{ kind: 'ellipse', at: [0, 0], r: [7.6, 7.6], paint: 'body', shade: 1, group: 'wheel' }];
  for (let i = 0; i < n; i++) {
    const t = (i * 2 * Math.PI) / n, c = Math.cos(t), s = Math.sin(t), pts = [[-w, -7], [w, -7], [w * 0.8, -11.5], [-w * 0.8, -11.5]];
    tests.push(polyIn(pts.map(([x, y]) => [x * c - y * s, x * s + y * c])));
    prims.push({ kind: 'poly', points: pts.map(([x, y]) => [x * c - y * s, x * s + y * c]), paint: 'body', shade: 1, group: 'wheel' });
  }
  return { tests, prims };
}

// The cost of icon.fitted@1 must cover the shape tests it makes (engine/gen/pixels.js WORK_PER_COST), so a call within
// the budget cannot take long (docs/data-sprites.md 3.4 rule 2). tallyWork counts every shape test it, icon.body and
// icon.rim make while they run; the review's two mutations (no GROWN_TESTS in the bodies' work, one pass charged
// instead of FITTED_PASSES) and its spread group (a body charged each shape's own box, drawn over their union) fail here.
const many = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const HOSTILE = {
  'the review\'s spread group: two tiny shapes at opposite corners and 128 cuts': { span: [64, 64], size: 1, grow: 0.5, draw: [
    { kind: 'rect', at: [-11, -11], size: [0.5, 0.5], paint: 'body', group: 'g' }, { kind: 'rect', at: [10.5, 10.5], size: [0.5, 0.5], paint: 'body', group: 'g' },
    ...many(128, (i) => ({ kind: 'cut', from: 'g', shape: { kind: 'ellipse', at: [-10 + (i % 16) * 1.3, -10 + Math.floor(i / 16) * 2.6], r: [0.2, 0.2] } })),
  ] },
  'a big bold body of many-sided polygons': { span: [64, 64], size: 1, grow: 0.5, draw: many(12, (i) => ({ kind: 'poly', points: many(32, (j) => [11 * Math.cos(j / 5.1 + i), 11 * Math.sin(j / 5.1 + i)]), paint: 'body', group: 'b' })) },
  'many small bodies, each its own': { span: [64, 64], size: 1, grow: 0.5, draw: many(40, (i) => ({ kind: 'ellipse', at: [-10 + (i % 8) * 3, -10 + Math.floor(i / 8) * 5], r: [1.4, 1.4], paint: i % 2 ? 'body' : 'gold' })) },
  'pen calls and a plate': { span: [64, 64], size: 1, grow: 0.5, plate: 'circle', face: 'face', plateSpan: [64, 64], draw: [
    ...many(6, (i) => ({ gen: 'icon.body', v: 1, shapes: many(4, (j) => ({ kind: 'ellipse', at: [-8 + 3 * i, -8 + 4 * j], r: [3, 3] })), holes: [{ kind: 'ellipse', at: [0, 0], r: [2, 2] }], paint: 'body' })),
    ...many(4, (i) => ({ gen: 'icon.rim', v: 1, shapes: [{ kind: 'rect', at: [-10 + 5 * i, -10], size: [4, 20] }], paint: 'rim', over: true })),
  ] },
  'the spread group drawn with bold on': { span: [64, 64], size: 1, bold: true, draw: [
    { kind: 'rect', at: [-11, -11], size: [0.5, 0.5], paint: 'body', group: 'g' }, { kind: 'rect', at: [10.5, 10.5], size: [0.5, 0.5], paint: 'body', group: 'g' },
    ...many(40, (i) => ({ kind: 'cut', from: 'g', shape: { kind: 'ellipse', at: [-10 + (i % 16) * 1.3, -10 + Math.floor(i / 16) * 2.6], r: [0.2, 0.2] } })),
  ] },
  'a cog drawn bold': { span: [64, 64], size: 1, bold: true, draw: cogTeeth().prims },
  'a bold rim over a ring beside a box': { span: [64, 64], size: 1, bold: true, draw: [
    { kind: 'rect', at: [-10, -10], size: [20, 20], paint: 'body' },
    { gen: 'icon.rim', v: 1, shapes: [{ kind: 'ellipse', at: [0, 0], r: [9, 9] }, { kind: 'rect', at: [-11, -3], size: [22, 6] }], holes: [{ kind: 'ellipse', at: [0, 0], r: [6, 6] }], paint: 'rim', over: true },
  ] },
  'big many-sided cuts out of one body': { span: [64, 64], size: 1, draw: [
    { kind: 'rect', at: [-10, -10], size: [20, 20], paint: 'body', group: 'b' },
    // thin arcs: each one's box covers the body, so every cut is asked at nearly every point, all its sides
    ...many(24, (i) => ({ kind: 'cut', from: 'b', shape: { kind: 'poly', points: [...many(15, (j) => [11 * Math.cos(j / 4.5 + i / 4), 11 * Math.sin(j / 4.5 + i / 4)]), ...many(15, (j) => [10.6 * Math.cos((14 - j) / 4.5 + i / 4), 10.6 * Math.sin((14 - j) / 4.5 + i / 4)])] } })),
  ] },
  'shape calls in a group': { span: [64, 64], size: 1, grow: 0.5, draw: many(16, (i) => ({ gen: 'oval', v: 1, at: [-9 + i, -9 + i], r: [3, 1.5], turn: 10 * i, paint: 'body', group: 'o' })) },
  'a search that runs every pass': { span: [21, 21], size: 0, draw: [{ kind: 'rect', at: [-10, -10], size: [20, 20], paint: 'body' }, ...many(30, (i) => ({ kind: 'cut', from: 'b', shape: { kind: 'rect', at: [-10 + i * 0.6, -1], size: [0.1, 0.1] } }))] },
};
const TALLY_CTX = { size: [32, 32] };

test('icon.fitted@1\'s cost covers every shape test it makes, for hostile calls and the review\'s spread group', async () => {
  const { tallyWork } = await import('../../engine/gen/icon-sets.js');
  const { WORK_PER_COST } = await import('../../engine/gen/pixels.js');
  for (const [name, args] of Object.entries(HOSTILE)) {
    const call = { gen: 'icon.fitted', v: 1, ...args };
    const c = registry.checkCall(call);
    const cost = c.ok ? c.cost : null;
    const tests = tallyWork(() => registry.runGenerator(call, TALLY_CTX, { budget: Infinity }));
    assert.ok(tests > 0, `${name}: tallied`);
    const charged = (c.ok ? c.cost : Number(/costs? (?:about )?([\d,]+)/.exec(c.errors.join(' '))?.[1]?.replace(/,/g, '') ?? NaN)) * WORK_PER_COST;
    assert.ok(Number.isFinite(charged), `${name}: its cost could be read (${c.errors?.join('; ')})`);
    assert.ok(tests <= charged, `${name}: ${tests} shape tests made, ${charged} charged (cost ${cost ?? 'refused'})`);
  }
});

test('icon.fitted@1\'s cost charges each pass of the search and the grown tests of a bold body', () => {
  const { prims } = cogTeeth();
  const base = { gen: 'icon.fitted', v: 1, span: [64, 64], size: 1, draw: prims };
  const thin = registry.checkCall(base), bold = registry.checkCall({ ...base, grow: 0.5 });
  assert.ok(thin.ok && bold.ok, `${thin.errors} ${bold.errors}`);
  // the bodies' share of the work is GROWN_TESTS (7) times over when grown; the grid work and the calls are not
  assert.ok(bold.cost >= 4 * thin.cost, `bold ${bold.cost}, plain ${thin.cost}`);
});

test('icon.fitted@1\'s cost while bold is bound to a control is its cost bold: the validator reads a bound flag as 0, never as off', async () => {
  const { validateSprite } = await import('../../catalog/sprite-schema.js');
  const { prims } = cogTeeth();
  const call = (bold) => ({ gen: 'icon.fitted', v: 1, room: 32, size: { from: 'size', map: [[0, 0], [1, 1]] }, tilt: false, bold, draw: prims.map((q) => ({ ...q, paint: 'body' })) });
  const sprite = (bold) => ({
    format: 'loadout-sprite', version: 2, id: 'bold-cost', name: 'Bold cost', size: [32, 32], pivot: [16, 16],
    meta: { type: 'icon', role: 'items/icon', themes: ['neutral'], gameTypes: ['arcade'], view: 'none', words: ['test'], license: 'draft' },
    palette: [{ id: 'body', label: 'Body', default: '#c9423a', material: 'metal', swatches: ['#c9423a', '#f2c230'] }],
    controls: [{ key: 'bold', kind: 'toggle', label: 'Bold', default: false }, { key: 'size', kind: 'range', label: 'Size', default: 0.5 }, { key: 'body', kind: 'colour', label: 'Body' }],
    body: { pictures: { draw: [], pictures: { a: { label: 'A', draw: [call(bold)] } } } },
    clips: { a: { frames: 1, fps: 1 } },
  });
  const bound = validateSprite(sprite({ from: 'bold', pick: { true: true, false: false } })), on = validateSprite(sprite(true)), off = validateSprite(sprite(false));
  // (with bold written out, its control is unused: those two are refused for that alone, after their cost is worked out)
  assert.ok(bound.ok, bound.errors.join('; '));
  assert.ok(on.cost.expanded > off.cost.expanded, `bold ${on.cost.expanded}, plain ${off.cost.expanded}`);
  assert.ok(bound.cost.expanded >= on.cost.expanded, `bound ${bound.cost.expanded} (${bound.errors.join('; ')}), bold ${on.cost.expanded}`);
});

test('icon.body@1\'s and icon.rim@1\'s costs cover the shape tests they make, plain, bold and grown, with cut-outs, holes and clips', async () => {
  const { tallyWork } = await import('../../engine/gen/icon-sets.js');
  const { WORK_PER_COST } = await import('../../engine/gen/pixels.js');
  const shapes = many(6, (i) => ({ kind: 'poly', points: many(12, (j) => [-8 + 3 * i + 4 * Math.cos(j / 2), -8 + 3 * i + 4 * Math.sin(j / 2)]) }));
  const extras = [{}, { within: [{ kind: 'rect', at: [-20, -20], size: [40, 30] }] }, { holes: [{ kind: 'ellipse', at: [0, 0], r: [3, 3] }] }, { minus: shapes.slice(0, 3) }];
  for (const gen of ['icon.body', 'icon.rim']) for (const grown of [{}, { bold: true }, { grow: 0.3 }]) for (const scale of [1, 4]) for (const extra of extras) {
    const call = { gen, v: 1, shapes, paint: 'body', scale, ...grown, ...extra };
    const c = registry.checkCall(call);
    assert.ok(c.ok, c.errors.join('; '));
    const tests = tallyWork(() => registry.runGenerator(call, TALLY_CTX, { budget: Infinity }));
    assert.ok(tests <= c.cost * WORK_PER_COST, `${gen} ${JSON.stringify({ ...grown, scale, ...Object.fromEntries(Object.keys(extra).map((k) => [k, true])) })}: ${tests} shape tests made, ${c.cost * WORK_PER_COST} charged`);
  }
});

// Run time against cost, as tests/unit/gen-b12-safety.test.mjs holds the effect behaviours (the same allowance).
const MS_PER_COST = 0.1;
function quickest(fn) {
  fn();
  let best = Infinity;
  for (let i = 0; i < 3; i++) { const t0 = performance.now(); fn(); best = Math.min(best, performance.now() - t0); }
  return best;
}

test('icon.fitted@1 runs within its cost (0.1 ms a unit, 30 ms more) for the hostile calls', () => {
  for (const [name, args] of Object.entries(HOSTILE)) {
    const call = { gen: 'icon.fitted', v: 1, ...args };
    const c = registry.checkCall(call);
    if (!c.ok) { assert.match(c.errors.join(' '), /budget/, `${name}: refused only for its cost`); continue; }
    const ms = quickest(() => registry.runGenerator(call, TALLY_CTX));
    assert.ok(ms <= 30 + c.cost * MS_PER_COST, `${name}: ${ms.toFixed(1)} ms for cost ${c.cost}`);
  }
});

const GOLDEN_CASES = {
  'icon.body@1': [
    { args: { shapes: [{ kind: 'ellipse', at: [0, 0], r: [6, 7] }], paint: 'body' } },
    { args: { shapes: [{ kind: 'rect', at: [-5, -5], size: [10, 10] }], paint: 'body', grow: 0.5, turn: 30 } },
    { args: { shapes: [{ kind: 'ellipse', at: [0, 0], r: [6, 7] }], minus: [{ kind: 'ellipse', at: [0, 0], r: [2, 2] }], paint: 'body', centre: [4, 28], soften: false } },
  ],
  'icon.rim@1': [
    { args: { shapes: [{ kind: 'ellipse', at: [0, 0], r: [6, 7] }], paint: 'rim' } },
    { args: { shapes: [{ kind: 'rect', at: [-5, -5], size: [10, 10] }], paint: 'rim', grow: 0.5, turn: 30 } },
    { args: { shapes: [{ kind: 'ellipse', at: [0, 0], r: [6, 7] }], within: [{ kind: 'rect', at: [0, -8], size: [8, 16] }], paint: 'rim', centre: [28, 4] } },
  ],
  'icon.flame@1': [
    { args: { at: [0, 0], paint: 'fire', core: 'core', rim: 'flare' } },
    { args: { at: [2, -4], h: 9, w: 6, sway: 1, paint: 'fire', core: 'core', rim: 'flare', turn: 26.57 } },
    { args: { at: [0, 0], h: 4, w: 3, paint: 'fire', core: 'core', rim: 'flare', centre: [3, 3] } },
  ],
  'icon.plate@1': [
    { args: { at: [16, 16], face: 'face' } },
    { args: { at: [16, 16], shape: 'circle', size: 1, face: 'face', shine: false } },
    { args: { at: [10, 12], shape: 'hex', size: 0, face: 'face' } },
  ],
  'oval@1': [
    { args: { at: [16, 16], r: [6, 3], paint: 'body' } },
    { args: { at: [10, 20], r: [8, 4], turn: -24, paint: 'body' } },
    { args: { at: [16, 16], r: [5, 5], turn: 45, paint: 'gold' } },
  ],
  'icon.fitted@1': [
    { args: { draw: bodyPrims } },
    { args: { draw: [...bodyPrims, CUT], size: 1, fill: 0.8, turn: 26.57, grow: 0.5, lights: [{ gen: 'twinkle', v: 1, at: [3, -10], size: 2, paint: 'fire', core: 'shine' }] } },
    { args: { draw: bodyPrims, centre: [6, 26], size: 0, tilt: false, slant: 0.25 } },
    { args: { draw: bodyPrims, size: 0.6, fill: 0.9, plate: 'circle', face: 'face', grow: 0.5 } },
  ],
};

for (const [key, cases] of Object.entries(GOLDEN_CASES)) {
  test(`${key} passes the goldens harness`, () => {
    const [id, v] = key.split('@');
    checkGeneratorContract(registry, registry.generator(id, Number(v)), { cases });
  });
}
