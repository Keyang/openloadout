// chip@1 and chip.turn@1 (engine/gen/chip.js, migration batch M1): the credit chip's turning face, a port of
// sprites/credit-chip.js (frozen in tests/fixtures/redraws/credit-chip.json) built on engine/gadgets.js drawToken and
// drawCircuit; and the motion that turns it, as the old chip turned in idle (half a turn a loop) and flipped in collect.
// The port is held pixel for pixel to the code it replaces: the same Surface calls, made here, against the stamps.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';
import { Surface, ellipseIn } from '../../engine/surface.js';
import { hexIn, starIn } from '../../engine/shapes.js';
import { cutRectIn } from '../../engine/ui.js';
import { drawToken, drawCircuit } from '../../engine/gadgets.js';
import { ramp, mix } from '../../engine/color.js';
import { dataSprite } from '../../engine/data-sprite.js';
import { defaultParams, renderFrame } from '../../engine/sprite.js';
import { lerp, keys, fract } from '../../engine/motion.js';

const chip = () => registry.generator('chip', 1);
const PAL = { metal: '#f2c230', glow: '#3fd1e0' };
const even = (v) => 2 * Math.round(v / 2);
const FACES = {
  hex: { h: (w) => even(w * 1.14), face: (w, h) => hexIn(0, 0, w, h) },
  round: { h: (w) => w, face: (w, h) => ellipseIn(0, 0, w / 2, h / 2) },
  bar: { h: (w) => even(w * 1.8), face: (w, h) => cutRectIn(-w / 2, -h / 2, w, h, 2) },
};

/** What sprites/credit-chip.js painted for one look (no outline), on a 32 x 32 Surface centred on (16, 17). */
function oldChip({ shape, width, thick, mark, spin, sheen, scale = 1, squash = 0, bare = false }) {
  const g = new Surface(32, 32), S = FACES[shape];
  const w = even(width), h = S.h(w), M = ramp(PAL.metal), G = ramp(PAL.glow);
  const sx = scale * (1 + squash), sy = scale * (1 - squash);
  const T = drawToken(g, S.face(w, h), 16, 17, PAL.metal, { turn: (spin * Math.PI) / 180, thick: Math.max(1, thick * scale), sx, sy, field: mix(M.base, M.dark, 0.3) });
  if (sheen !== null) {
    const band = { x: 16 + T.x, y: 17, r: h / 2, phase: sheen, width: 0.13 };
    const glint = (test, colour) => { const b = (px, py) => Math.abs((px - band.x) / band.r + (0.5 * (py - band.y)) / band.r - band.phase) < band.width && test(px, py); g.fill(band.x - band.r - 2, band.y - band.r - 2, band.x + band.r + 2, band.y + band.r + 2, b, colour); };
    glint(T.face, mix(M.light, '#ffffff', 0.6));
    if (T.field) glint(T.field, M.base);
  }
  if (!bare && T.squeeze > 0.6) {
    const lit = mix(G.light, PAL.glow, 0.35);
    if (mark === 'circuit') drawCircuit(g, T.at, lit, { rx: w / 2 - 2, ry: h / 2 - 3 });
    else if (mark === 'star') g.fill(0, 0, 32, 32, T.on(starIn(0, 0.5, Math.min(w, h) / 2 - 2, 5)), lit, { clip: T.field });
  }
  return g;
}
/** What chip@1 paints for the same look, drawn through a data sprite (so its paints resolve as a library sprite's do). */
function newChip(o) {
  const call = { gen: 'chip', v: 1, at: [16, 17], shape: o.shape, width: o.width, thick: o.thick, mark: o.mark, spin: o.spin,
    sheen: o.sheen ?? 0, glint: o.sheen !== null, scale: o.scale ?? 1, squash: o.squash ?? 0, bare: !!o.bare,
    metal: 'metal', field: 'field', gleam: 'gleam', lit: 'lit', pad: 'shine' };
  assert.ok(registry.checkCall(call).ok, registry.checkCall(call).errors.join('; '));
  const def = {
    format: 'loadout-sprite', version: 2, id: 'chip-test', name: 'Chip test', size: [32, 32], pivot: [16, 30], grounded: false, preview: 'still',
    meta: { type: 'pickup', role: 'items/pickup', themes: ['sci-fi'], gameTypes: ['arcade'], view: 'front', words: ['chip', 'credit', 'coin', 'test', 'money', 'token'], license: 'draft' },
    palette: [
      { id: 'metal', label: 'Metal', default: PAL.metal, material: 'metal' },
      { id: 'glow', label: 'Glow', default: PAL.glow, material: 'light' },
      { id: 'shine', default: '#ffffff', material: 'light', detail: true },
      { id: 'field', material: 'metal', derive: { rule: 'mix', of: 'metal', with: { rule: 'ramp', of: 'metal', tone: 'dark' }, amount: 0.3 } },
      { id: 'gleam', material: 'light', derive: { rule: 'mix', of: { rule: 'ramp', of: 'metal', tone: 'light' }, with: 'shine', amount: 0.6 } },
      { id: 'lit', material: 'light', derive: { rule: 'mix', of: { rule: 'ramp', of: 'glow', tone: 'light' }, with: 'glow', amount: 0.35 } },
    ],
    controls: [{ key: 'metal', kind: 'colour', label: 'Metal' }, { key: 'glow', kind: 'colour', label: 'Glow' }],
    body: { pictures: { nodes: [{ id: 'n', parent: null, at: [0, 0] }], draw: [{ ...call, on: 'n' }] } },
    clips: { still: { frames: 1, fps: 1 } },
  };
  const s = dataSprite(def);
  return renderFrame(s, 'still', 0, defaultParams(s));
}

test('chip@1 passes the goldens harness', () => {
  checkGeneratorContract(registry, chip(), { cases: [
    { args: { at: [16, 17], shape: 'hex', width: 14, metal: 'gold', field: 'gold.dark', gleam: 'shine', lit: 'glow', pad: 'shine' } },
    { args: { at: [16, 17], shape: 'round', width: 16, thick: 4, spin: 60, sheen: 0.3, glint: true, mark: 'star', metal: 'gold', field: 'gold.dark', gleam: 'shine', lit: 'glow', pad: 'shine' } },
    { args: { at: [0, 0], shape: 'bar', width: 10, thick: 2, spin: 120, mark: 'plain', scale: 0.6, squash: 0.2, metal: 'gold', field: 'gold.dark', gleam: 'shine', lit: 'glow', pad: 'shine' } },
    { args: { at: [16, 17], shape: 'hex', width: 18, spin: 90, metal: 'gold', field: 'gold.dark', gleam: 'shine', lit: 'glow', pad: 'shine' } },
  ] });
});

test('chip@1 paints what sprites/credit-chip.js painted, pixel for pixel', () => {
  const looks = [];
  for (const shape of ['hex', 'round', 'bar']) for (const mark of ['circuit', 'star', 'plain']) for (const spin of [0, 22.5, 67.5, 112.5, 157.5]) {
    looks.push({ shape, mark, spin, width: shape === 'bar' ? 10 : 15, thick: 3, sheen: lerp(-1.6, 1.6, fract(spin / 180 + 0.5)) });
  }
  looks.push({ shape: 'hex', mark: 'circuit', spin: 30, width: 18, thick: 5, sheen: null, scale: 1.1, squash: -0.1 });
  looks.push({ shape: 'round', mark: 'star', spin: 90, width: 13, thick: 2, sheen: null, scale: 0.5, squash: 0.18, bare: true });
  for (const o of looks) {
    const a = oldChip(o), b = newChip(o);
    let off = 0;
    for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) off++;
    assert.equal(off, 0, `${JSON.stringify(o)}: ${off} pixels differ`);
  }
});

test('chip.turn@1 turns a chip half a turn a loop with its glint, and flips, swells and shrinks it in a collect', () => {
  const e = registry.generator('chip.turn', 1);
  assert.ok(e, 'chip.turn@1 is registered');
  assert.equal(e.family, 'motion');
  const ctx = (t, loop) => Object.freeze({ t, frame: 0, frames: 8, loop, size: [32, 32], clip: 'x', direction: null });
  for (const t of [0, 0.25, 0.5, 0.875]) {
    const [m] = e.run(Object.freeze({ mode: 'spin' }), ctx(t, true));
    assert.deepEqual(m.move, [0, 0]);
    assert.equal(m.args['chip.spin'], 180 * t);
    assert.ok(Math.abs(m.args['chip.sheen'] - lerp(-1.6, 1.6, fract(t + 0.5))) < 1e-9);
    assert.equal(m.args['chip.glint'], true);
  }
  const FLIP = [[0.14, 0], [0.29, 0.34], [0.43, 0.5], [0.57, 1]];
  for (const t of [0, 1 / 7, 3 / 7, 4 / 7, 5 / 7, 1]) {
    const [m] = e.run(Object.freeze({ mode: 'flip' }), ctx(t, false));
    assert.deepEqual(m.move, [0, 0]);
    assert.ok(Math.abs(m.args['chip.spin'] - 180 * keys(t, FLIP, (x) => x)) < 1e-9, `spin at ${t}`);
    assert.equal(m.args['chip.glint'], false);
    const scale = keys(t, [[0, 1], [0.5, 1], [0.58, 1.1], [0.75, 0.5], [0.86, 0]]);
    assert.ok(Math.abs(m.args['chip.scale'] - scale) < 1e-9, `scale at ${t}`);
    assert.equal(m.args['chip.bare'], scale < 0.9);
  }
  assert.deepEqual(e.run({ mode: 'spin' }, ctx(1, true)), e.run({ mode: 'spin' }, ctx(0, true)), 'the spin loop closes');
});
