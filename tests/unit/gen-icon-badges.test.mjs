// Migration batch M4b (docs/data-sprites.md section 9, M1 to M40; 3.3 family "icon"): icon.badge@1
// (engine/gen/icon-badges.js), the badge pin the library map marks (sprites/icons-map, style "badge") name. Held here to
// what the code drew, pixel for pixel: engine/icons.js iconFit round engine/icons-badge-stem.js iconBadgeStem, tidied
// and inked, then engine/icons-badge.js iconBadge (a picture of icon bodies, bold or not) or the sprite's hand-set
// layers (engine/glyphs.js drawGlyph, inked), at every size step, bold and shine; and to the goldens harness.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';
import { Surface } from '../../engine/surface.js';
import { INK } from '../../engine/color.js';
import { paintColour } from '../../engine/data-rules.js';
import { drawList } from '../../engine/draw-list.js';
import { oldReplay } from '../helpers/old-replay.mjs';

const OLD = oldReplay('gen-icon-badges');   // what the modules that are gone (engine/icons.js, icons-badge.js, icons-badge-stem.js, glyphs.js) drew, recorded in the order of the calls (tests/helpers/old-replay.mjs)

const HEX = { ink: INK, body: '#c9423a', accent: '#7a4f33', face: '#f0ead8', pale: '#a8a4a0' };
const box = (x0, y0, x1, y1, paint) => ({ kind: 'poly', points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], paint });

// three pictures as the map marks' badge style drew them, each as code and as data (pen generators' calls)
const PICTURES = {
  flag: {
    data: [
      { gen: 'icon.body', v: 1, shapes: [box(-8.4, -9.6, -6, 11.5, 'accent'), { kind: 'ellipse', at: [-7.2, -10], r: [1.8, 1.6], paint: 'accent' }], paint: 'accent', soft: 0 },
      { gen: 'icon.rim', v: 1, shapes: [{ kind: 'poly', points: [[-6, -9.6], [10.6, -5], [-6, -0.4]], paint: 'body' }], paint: 'ink' },
      { gen: 'icon.body', v: 1, shapes: [{ kind: 'poly', points: [[-6, -9.6], [10.6, -5], [-6, -0.4]], paint: 'body' }], paint: 'body', soft: 0 },
    ],
  },
  dig: {
    data: [{ gen: 'icon.body', v: 1, shapes: [{ gen: 'taper', v: 1, from: [-8.2, -8.2], to: [8.2, 8.2], r0: 2.9, paint: 'body' }, { gen: 'taper', v: 1, from: [-8.2, 8.2], to: [8.2, -8.2], r0: 2.9, paint: 'body' }], paint: 'body', soft: 0 }],
  },
  here: {
    data: [{ gen: 'icon.body', v: 1, shapes: [{ kind: 'poly', points: [[-10, -8], [10, -8], [0, 10]], paint: 'body' }], paint: 'body', soft: 0 }],
    snap: true,
  },
};
// a hand-set picture of two layers (the map marks' town), regular
const TOWN = [
  { rows: ['....++..+.', '...++++.+.', '..+++++++.', '.++++++++.', '----------', '.x#######.', '.x#######.', '.x##..###.', '.x##..###.', '.x##..###.'], main: 'pale', second: 'accent' },
  { rows: ['', '', '', '', '', '', '', '....##', '....##', '....##'], main: 'body' },
];
const tones = { '#': 'base', o: 'light', x: 'dark', '+': 's-base', '-': 's-dark' };
const ref = (slot, tone) => (tone === 'base' ? slot : `${slot}.${tone}`);
const TOWN_DATA = TOWN.map((l) => {
  const key = {};
  for (const r of l.rows) for (const c of r) if (c !== '.' && !key[c]) { const t = tones[c]; key[c] = t.startsWith('s-') ? ref(l.second ?? l.main, t.slice(2)) : ref(l.main, t); }
  const w = Math.max(...l.rows.map((r) => r.length));
  return { kind: 'stamp', at: [0, 0], rows: l.rows.map((r) => r.padEnd(w, '.')), key };   // a stamp's rows are all one length
});

const BADGE_STEM_TIP = 11.5;   // what engine/icons-badge-stem.js said: how far down the pin's tip reaches at full size (deleted by R3)
const tipOf = (size) => BADGE_STEM_TIP - (BADGE_STEM_TIP - 7.8) * Math.max(0, 1 - 2 * size);
function codeBadge({ size, bold, shine }, { picture, glyph }) {
  return OLD.surface(32, 32);
}
function genBadge({ size, bold, shine }, args) {
  const r = registry.runGenerator({ gen: 'icon.badge', v: 1, size, tip: tipOf(size), paint: 'body', face: 'face', shiny: shine, pinGrow: bold ? 0.15 : 0, grow: bold ? 0.5 : 0, ...args }, { size: [32, 32] });
  assert.ok(r.ok, r.errors.join('; '));
  const fix = (v) => (v && typeof v === 'object' && v.rule ? paintColour(v, HEX) : v);
  const g = new Surface(32, 32);
  drawList(g, r.primitives.map((p) => ({ ...p, key: Object.fromEntries(Object.entries(p.key).map(([k, v]) => [k, fix(v)])) })), { palette: HEX });
  return g;
}
function differ(a, b) {
  const out = [];
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) out.push([i % a.w, Math.floor(i / a.w)]);
  return out;
}
const LOOKS = [];
for (let size = 0; size <= 1.0001; size += 0.05) for (const bold of [false, true]) for (const shine of [true, false]) LOOKS.push({ size: Math.round(size * 100) / 100, bold, shine });

test('icon.badge@1 draws the map marks\' badge pins with a picture on the plate as the code did, at every size, bold and shine', () => {
  for (const [name, p] of Object.entries(PICTURES)) for (const look of LOOKS) {
    const want = codeBadge(look, { picture: p }), got = genBadge(look, { draw: p.data, ...(p.snap ? { snap: true } : {}) });
    assert.deepEqual(differ(want, got).slice(0, 6), [], `${name} ${JSON.stringify(look)}: pixels differ`);
  }
});

test('icon.badge@1 draws a badge pin with hand-set layers on the plate as the code did', () => {
  for (const look of LOOKS) {
    const want = codeBadge(look, { glyph: TOWN }), got = genBadge(look, { draw: TOWN_DATA });
    assert.deepEqual(differ(want, got).slice(0, 6), [], `town ${JSON.stringify(look)}: pixels differ`);
  }
});

test('icon.badge@1 with no pin draws the picture alone as iconFit drew it, tidied and inked, bold or not', () => {
  for (const [name, p] of Object.entries(PICTURES).filter(([n]) => n !== 'here')) for (const look of LOOKS) {   // (here moves itself on a pin only)
    const want = OLD.surface(32, 32);
    const got = genBadge(look, { draw: p.data, pin: false });
    assert.deepEqual(differ(want, got).slice(0, 6), [], `${name} alone ${JSON.stringify(look)}: pixels differ`);
  }
  assert.deepEqual(registry.runGenerator({ gen: 'icon.badge', v: 1, paint: 'body', face: 'face', draw: [] }).primitives, [], 'an empty picture draws nothing');
});

test('icon.badge@1 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('icon.badge', 1), { cases: [
    { args: { paint: 'body', face: 'face', draw: PICTURES.flag.data } },
    { args: { paint: 'body', face: 'face', size: 1, tip: 11.5, pinGrow: 0.15, snap: true, draw: PICTURES.here.data } },
    { args: { paint: 'body', face: 'face', size: 0, tip: 7.8, shiny: false, draw: TOWN_DATA } },
    { args: { draw: PICTURES.dig.data, pin: false, grow: 0.5, size: 0.7 } },
  ] });
});
