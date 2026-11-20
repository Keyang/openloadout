// A colour that cannot be worked out is reported by a flag, never told by its colour (build item B14b; Contract 15;
// docs/data-sprites.md 4.1 steps 2 and 5). engine/data-rules.js paints FALLBACK (#ff00ff) for what it cannot read, so a
// magenta pixel alone says nothing: a palette may hold a real magenta. Held to here:
//   - engine/resolve.js: a data-rules rule holding a colour it cannot work out (a framework rule such as lit.tone, a
//     slot it has not got) is null, left for the frame, never worked out with magenta inside; choose reads only the
//     branch the settings take; a palette slot it cannot work out is flagged `lost`, and the resolved sprite lists them
//     (`lost`); expandFrame lists the colours of its frame that could not be worked out (`lost`)
//   - engine/draw-list.js: a slot flagged lost names no colour: what it paints is left out and reported (lostPaints
//     finds them), never drawn magenta; a slot that really is #ff00ff draws
//   - engine/data-sprite.js: a frame that paints a lost colour is an error naming it (what tools/check.mjs sees)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { paintHex, resolvePalette, resolveSprite, expandFrame } from '../../engine/resolve.js';
import { drawList, renderList, lostPaints } from '../../engine/draw-list.js';
import { makeDataSprite } from '../../engine/data-sprite.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import { sitePieces } from '../../engine/pieces.js';
import { tone, mix } from '../../engine/color.js';

const load = (p) => JSON.parse(fs.readFileSync(new URL(`../fixtures/v2/${p}`, import.meta.url), 'utf8'));
const hexAt = (v) => `#${[v & 255, (v >>> 8) & 255, (v >>> 16) & 255].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
const LT = { rule: 'lit.tone', v: 1, of: 'cloud', air: 'sky' };
const HAZE = { rule: 'haze', v: 1, of: 'rock', air: 'sky', depth: 0.5 };
const PAL = { sky: { hex: '#7fb8e0' }, cloud: { hex: '#f0f4f8' }, rock: { hex: '#6a7280' }, leaf: { hex: '#2f5a32' }, neon: { hex: '#ff00ff' }, dusk: { hex: '#a040e0' } };

test('paintHex: a data-rules rule holding a colour this module cannot work out is null (left for the frame), never a magenta tint', () => {
  for (const [what, paint] of Object.entries({
    'mix(lit.tone, sky)': { rule: 'mix', of: LT, with: 'sky', amount: 0.5 },
    'tone(lit.tone)': { rule: 'tone', of: LT, by: 0.2 },
    'ramp(haze)': { rule: 'ramp', of: HAZE, tone: 'dark' },
    'bandTone(haze)': { rule: 'bandTone', of: HAZE, under: ['leaf'] },
    'bandTone(leaf, under haze)': { rule: 'bandTone', of: 'leaf', under: [HAZE] },
    'mix(lit.tone, tone(sky))': { rule: 'mix', of: LT, with: { rule: 'tone', of: 'sky', by: 0.2 }, amount: 0.5 },
    'mix(mix(haze, rock), leaf)': { rule: 'mix', of: { rule: 'mix', of: HAZE, with: 'rock', amount: 0.2 }, with: 'leaf', amount: 0.5 },
    'mix of a slot it has not got': { rule: 'mix', of: 'nope', with: 'sky', amount: 0.5 },
    'choose, the framework rule chosen': { rule: 'choose', when: { time: [0.5] }, then: LT, else: 'sky' },
  })) assert.equal(paintHex(paint, PAL, { time: 0.5 }), null, what);
  // choose reads only the branch the settings take: the other may be anything
  assert.equal(paintHex({ rule: 'choose', when: { time: [0.5] }, then: LT, else: 'sky' }, PAL, { time: 0 }), '#7fb8e0');
  assert.equal(paintHex({ rule: 'choose', when: { time: [0.5] }, then: 'leaf', else: LT }, PAL, { time: 0.5 }), '#2f5a32');
  // a real magenta, and the colours worked out from it, are colours like any other
  assert.equal(paintHex('neon', PAL), '#ff00ff');
  assert.equal(paintHex({ rule: 'choose', when: { time: [0.5] }, then: 'neon', else: 'sky' }, PAL, { time: 0.5 }), '#ff00ff');
  assert.equal(paintHex({ rule: 'mix', of: 'neon', with: 'neon.light', amount: 0 }, PAL), '#ff00ff');
  assert.equal(paintHex({ rule: 'mix', of: 'sky', with: 'neon', amount: 1 }, PAL), '#ff00ff');
  assert.equal(paintHex({ rule: 'tone', of: 'dusk', by: 0.2 }, PAL), tone('#a040e0', 0.2));
  assert.equal(paintHex({ rule: 'mix', of: 'sky', with: { rule: 'tone', of: 'dusk', by: -0.3 }, amount: 0.4 }, PAL), mix('#7fb8e0', tone('#a040e0', -0.3), 0.4));
});

test('resolvePalette: a slot whose colour cannot be worked out is flagged lost; a slot that really is magenta is not', () => {
  const def = {
    format: 'loadout-sprite', version: 2, id: 'lost-test',
    palette: [
      { id: 'sky', label: 'Sky', default: '#7fb8e0', material: 'sky' },
      { id: 'cloud', label: 'Cloud', default: '#f0f4f8', material: 'sky' },
      { id: 'neon', label: 'Neon', default: '#ff00ff', material: 'light' },
      { id: 'glow', derive: { rule: 'mix', of: 'neon', with: 'neon', amount: 0.5 } },
      { id: 'pick', derive: { rule: 'choose', when: { neon: ['#ff00ff'] }, then: 'neon', else: LT } },
      { id: 'bad', derive: { rule: 'tone', of: LT, by: 0.2 } },
      { id: 'loopA', derive: { rule: 'tone', of: 'loopB', by: 0.2 } },
      { id: 'loopB', derive: { rule: 'tone', of: 'loopA', by: 0.2 } },
    ],
    controls: [{ key: 'neon', kind: 'colour', label: 'Neon' }],
  };
  const p = resolvePalette(def, {});
  for (const id of ['sky', 'cloud', 'neon', 'glow', 'pick']) assert.equal(p[id].lost, undefined, `${id} is worked out`);
  assert.equal(p.neon.hex, '#ff00ff');
  assert.equal(p.glow.hex, '#ff00ff');
  assert.equal(p.pick.hex, '#ff00ff');
  for (const id of ['bad', 'loopA', 'loopB']) assert.equal(p[id].lost, true, `${id} is lost`);
  // the person picks a colour: the choose now takes the framework rule, so that slot is lost; magenta itself never is
  const q = resolvePalette(def, { neon: '#00ff00' });
  assert.equal(q.pick.lost, true);
  assert.equal(q.neon.lost, undefined);
});

test('resolveSprite lists its lost slots; expandFrame lists the colours of its frame that could not be worked out', () => {
  const d = load('pictures/crate.json');
  d.palette.push({ id: 'neon', label: 'Neon', default: '#ff00ff', material: 'light' });
  d.palette.push({ id: 'bad', derive: { rule: 'tone', of: { rule: 'lit.tone', v: 1, of: 'wood', air: 'metal' }, by: 0.2 } });
  const opts = { validated: true, pieces: sitePieces() };
  const r = resolveSprite(d, {}, opts);
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.deepEqual(r.lost, ['bad']);
  assert.equal(r.palette.neon.lost, undefined);
  const rect = (paint) => ({ kind: 'rect', at: [2, 2], size: [3, 3], paint });
  const lt = { rule: 'lit.tone', v: 1, of: 'wood', air: 'metal' };
  const f = expandFrame(r, [rect({ rule: 'mix', of: lt, with: 'wood', amount: 0.5 }), rect('bad'), rect('neon'), rect({ rule: 'choose', when: { bands: [true] }, then: 'neon', else: 'wood' })], { clip: 'idle' });
  assert.equal(f.ok, true, f.errors.join('; '));
  assert.equal(f.lost.length, 2, JSON.stringify(f.lost));
  assert.deepEqual(f.lost.map((x) => x.rule ?? null), ['mix', null]);
  assert.deepEqual(f.lost.map((x) => x.slot ?? null), [null, 'bad']);
  const ok = expandFrame(r, [rect('neon'), rect({ rule: 'mix', of: 'neon', with: 'neon.light', amount: 0 })], { clip: 'idle' });
  assert.deepEqual(ok.lost, [], 'a real magenta is not lost');
});

test('draw-list: a slot flagged lost names no colour: left out and reported, never drawn; a slot that really is #ff00ff draws', () => {
  const palette = { neon: { hex: '#ff00ff' }, gone: { hex: '#ff00ff', lost: true, derived: true } };
  const list = [
    { kind: 'rect', at: [0, 0], size: [4, 4], paint: 'neon' },
    { kind: 'rect', at: [4, 0], size: [4, 4], paint: 'gone.dark' },
    { kind: 'stamp', at: [0, 5], rows: ['ab'], key: { a: 'neon', b: 'gone' } },
    { kind: 'bands', area: { kind: 'rect', at: [0, 6], size: [8, 2] }, stops: ['neon', 'gone'] },
  ];
  assert.deepEqual(lostPaints(list, palette), [{ index: 1, slot: 'gone' }, { index: 2, slot: 'gone' }, { index: 3, slot: 'gone' }]);
  assert.deepEqual(lostPaints(list, { neon: '#ff00ff' }), []);
  const { g, skipped } = renderList(8, 8, list, { palette });
  assert.equal(hexAt(g.get(1, 1)), '#ff00ff', 'the real magenta draws');
  assert.equal(g.get(5, 1) >>> 24, 0, 'the lost colour is not drawn');
  assert.deepEqual(skipped.map((s) => s.index), [1, 2, 3]);
  assert.match(skipped[0].why, /could not be worked out/);
  assert.equal(drawList(g, [list[0]], { palette }).skipped.length, 0);
});

test('data-sprite: a frame painting a colour that cannot be worked out is an error naming it; a real magenta draws', () => {
  const lt = { rule: 'lit.tone', v: 1, of: 'wood', air: 'metal' };
  const d = load('pictures/crate.json');
  d.body.pictures.draw.push({ kind: 'rect', on: 'crate', at: [2, 2], size: [3, 3], paint: { rule: 'mix', of: lt, with: 'wood', amount: 0.5 } });
  const r = makeDataSprite(d);
  assert.equal(r.ok, false, 'refused, not drawn magenta');
  assert.match(r.errors.join(' '), /colour rule "mix"[\s\S]*cannot be worked out/);
  const m = load('pictures/crate.json');
  m.palette.push({ id: 'neon', label: 'Neon', default: '#ff00ff', material: 'light' });
  m.body.pictures.draw.push({ kind: 'rect', on: 'crate', at: [2, 2], size: [3, 3], paint: 'neon' },
    { kind: 'rect', on: 'crate', at: [6, 2], size: [3, 3], paint: { rule: 'mix', of: 'neon', with: 'neon.light', amount: 0 } });
  const s = makeDataSprite(m);
  assert.equal(s.ok, true, (s.errors ?? []).join('; '));
  const g = renderFrame(s.sprite, 'idle', 0, defaultParams(s.sprite));
  assert.equal(hexAt(g.get(3, 3)), '#ff00ff');
  assert.equal(hexAt(g.get(7, 3)), '#ff00ff');
});
