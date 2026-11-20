// The first interface set (kit-rpg-fantasy, batch R20): dialogue box, battle menu, bars, damage digits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderFrame, defaultParams, cleanParams } from '../../engine/sprite.js';
import { col, INK } from '../../engine/color.js';
import { PALETTE } from '../../engine/palettes.js';
import { barOpening, contrast, digitSize, digitBody, panelSwatches } from '../../engine/ui.js';
import { THEME_PRESETS, normalizeTheme, applyColour } from '../../engine/theme.js';
import { validateMeta } from '../../catalog/schema.js';
import { librarySprite } from '../helpers/library.mjs';   // the library asset, a code file or a data file (tests/helpers/library.mjs)
const dialogue = await librarySprite('ui-dialogue');
const menu = await librarySprite('ui-battle-menu');
const bars = await librarySprite('ui-bars-rpg');
const digits = await librarySprite('ui-damage-digits');

const P = PALETTE.hearthvale;
const ALL = [dialogue, menu, bars, digits];
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };
const draw = (s, clip, over = {}, f = 0) => renderFrame(s, clip, f, cleanParams(s, { ...defaultParams(s), ...over }));
const clipList = (s) => Object.entries(s.clips).map(([n, c]) => `${n} ${c.frames}${c.frames > 1 ? (c.loop ? ' loop' : ' once') : ''}`);
const choices = (s, k) => s.params[k].options.map((o) => o.value);

// every look worth testing: each style with the sliders low and high and the toggles both ways
function looks(s) {
  const out = [];
  const styles = s.params.style ? choices(s, 'style') : [undefined];
  for (const style of styles) for (const v of [0, 0.5, 1]) for (const on of [false, true]) {
    const o = {};
    if (style) o.style = style;
    for (const [k, d] of Object.entries(s.params)) { if (d.kind === 'range') o[k] = d.min + (d.max - d.min) * v; if (d.kind === 'toggle') o[k] = on; }
    out.push(o);
  }
  return out;
}

test('ids, frames, pivots, clips and controls are exactly the specification rows', () => {
  assert.deepEqual([dialogue.id, dialogue.size, dialogue.pivot], ['ui-dialogue', [96, 48], [48, 24]]);
  assert.deepEqual(clipList(dialogue), ['box 1', 'name-tag 1', 'choice 1', 'next 8 loop']);
  assert.deepEqual(Object.keys(dialogue.params), ['style', 'corner', 'border', 'shadow', 'face', 'frame', 'accent', 'speed']);

  assert.deepEqual([menu.id, menu.size, menu.pivot], ['ui-battle-menu', [96, 64], [48, 32]]);
  assert.deepEqual(clipList(menu), ['panel 1', 'row 1', 'cursor 8 loop', 'turn-marker 8 loop']);
  assert.deepEqual(Object.keys(menu.params), ['style', 'corner', 'border', 'face', 'frame', 'accent', 'speed']);

  assert.deepEqual([bars.id, bars.size, bars.pivot], ['ui-bars-rpg', [64, 16], [32, 8]]);
  assert.deepEqual(clipList(bars), ['frame 1', 'fill 1', 'fill-b 1', 'fill-c 1', 'flash 4 once']);
  assert.deepEqual(Object.keys(bars.params), ['style', 'corner', 'border', 'shine', 'frame', 'fill', 'fillB', 'fillC']);

  assert.deepEqual([digits.id, digits.size, digits.pivot], ['ui-damage-digits', [16, 16], [8, 8]]);
  assert.deepEqual(clipList(digits), [...Array.from({ length: 10 }, (_, i) => `digit-${i} 1`), 'plus 1', 'minus 1', 'crit 1', 'miss 1']);
  assert.deepEqual(Object.keys(digits.params), ['style', 'slant', 'shadow', 'size', 'body', 'edge']);

  assert.deepEqual(choices(dialogue, 'style'), ['plain', 'ornate', 'scroll']);
  assert.deepEqual(choices(menu, 'style'), ['plain', 'ornate', 'scroll']);
  assert.deepEqual(choices(bars, 'style'), ['solid', 'segmented', 'ornate']);
  assert.deepEqual(choices(digits, 'style'), ['chunky', 'slim', 'rounded']);
});

test('metadata is the specification and passes the catalogue schema', () => {
  const roles = { 'ui-dialogue': 'interface/panel', 'ui-battle-menu': 'interface/panel', 'ui-bars-rpg': 'interface/bar', 'ui-damage-digits': 'interface/icon' };
  for (const s of ALL) {
    const r = validateMeta(s.meta, 'sprite');
    assert.ok(r.ok, `${s.id}: ${r.errors.join('; ')}`);
    assert.equal(s.meta.type, 'ui');
    assert.equal(s.meta.role, roles[s.id]);
    assert.equal(s.meta.view, 'none');
    assert.deepEqual(s.meta.themes, ['fantasy', 'neutral']);
    assert.equal(s.meta.gameTypes[0], 'turn-based-rpg');
    assert.equal(s.grounded, false);
    assert.deepEqual(s.sounds, {}, `${s.id} has no sounds`);
    assert.deepEqual(s.parts, {}, `${s.id} has no parts`);
  }
});

test('default colours are the Hearthvale palette colours the specification names, and lead their swatches', () => {
  const want = [
    [dialogue, { face: P.panel, frame: P.cream, accent: P.gold }],
    [menu, { face: P.panel, frame: P.cream, accent: P.gold }],
    [bars, { frame: P.cream, fill: P.heal, fillB: P.hero, fillC: P.gold }],
    [digits, { body: P.cream, edge: P.fire }],
  ];
  const palette = new Set(Object.values(P));
  for (const [s, colours] of want) for (const [k, hex] of Object.entries(colours)) {
    assert.equal(s.params[k].def, hex, `${s.id}.${k}`);
    assert.equal(s.params[k].swatches[0], hex, `${s.id}.${k} leads its swatches`);
    assert.ok(s.params[k].swatches.length >= 4 && s.params[k].swatches.length <= 8, `${s.id}.${k} has 4 to 8 swatches`);
    // palette colours first (a frame has only two that keep their contrast on every face; the rest are tones of palette colours)
    for (const c of s.params[k].swatches.slice(0, k === 'frame' ? 2 : 3)) assert.ok(palette.has(c), `${s.id}.${k}: ${c} is a palette colour`);
  }
});

test('the shared controls use the style guide labels and ends', () => {
  for (const s of [dialogue, menu, bars]) {
    assert.deepEqual([s.params.corner.label, s.params.corner.lo, s.params.corner.hi], ['Corner', 'Square', 'Round'], s.id);
    assert.deepEqual([s.params.border.label, s.params.border.lo, s.params.border.hi], ['Border', 'Thin', 'Thick'], s.id);
    assert.equal(s.params.style.label, 'Style');
  }
  for (const s of [dialogue, menu]) {
    assert.deepEqual([s.params.speed.label, s.params.speed.lo, s.params.speed.hi, s.params.speed.group], ['Speed', 'Slow', 'Fast', 'Motion'], s.id);
    const anim = Object.entries(s.clips).filter(([, c]) => c.frames > 1);
    for (const [name, c] of anim) assert.ok(c.fps({ speed: 1 }) > c.fps({ speed: 0 }), `${s.id} ${name}: speed drives the frame rate`);
  }
  assert.deepEqual([digits.params.size.label, digits.params.size.lo, digits.params.size.hi], ['Size', 'Small', 'Big']);
});

test('nothing touches the outermost row or column in any look, and every frame draws something', () => {
  for (const s of ALL) for (const look of looks(s)) for (const [clip, c] of Object.entries(s.clips)) for (let f = 0; f < c.frames; f++) {
    const g = renderFrame(s, clip, f, cleanParams(s, { ...defaultParams(s), ...look }));
    const b = g.bounds();
    assert.ok(b, `${s.id} ${clip} frame ${f} draws something (${JSON.stringify(look)})`);
    assert.ok(b.x0 >= 1 && b.y0 >= 1 && b.x1 <= s.size[0] - 2 && b.y1 <= s.size[1] - 2, `${s.id} ${clip} frame ${f} keeps a 1 px border: ${JSON.stringify(b)} (${JSON.stringify(look)})`);
    assert.ok(new Set(g.data).size - 1 <= 10, `${s.id} ${clip}: at most 10 colours`);
  }
});

test('deterministic: two renders of every clip match', () => {
  for (const s of ALL) for (const [clip, c] of Object.entries(s.clips)) for (let f = 0; f < c.frames; f++) assert.equal(diff(draw(s, clip, {}, f), draw(s, clip, {}, f)), 0, `${s.id} ${clip} ${f}`);
});

test('the menu panel matches the dialogue box at the same settings', () => {
  for (const style of ['plain', 'ornate', 'scroll']) for (const v of [0, 1]) {
    const a = draw(dialogue, 'box', { style, corner: v, border: v, shadow: false }), b = draw(menu, 'panel', { style, corner: v, border: v });
    // the same corners: the menu is the same panel, 16 px taller
    for (let y = 0; y < 24; y++) for (let x = 0; x < 96; x++) {
      assert.equal(a.get(x, y), b.get(x, y), `${style} ${v}: top half at ${x},${y}`);
      assert.equal(a.get(x, 47 - y), b.get(x, 63 - y), `${style} ${v}: bottom half at ${x},${y}`);
    }
  }
});

test('the choice box has one highlighted row in the accent colour', () => {
  const box = draw(dialogue, 'box'), choice = draw(dialogue, 'choice');
  let gold = 0, top = 99, bottom = -1;
  for (let y = 0; y < 48; y++) for (let x = 0; x < 96; x++) if (choice.get(x, y) === col(P.gold) && box.get(x, y) !== col(P.gold)) { gold++; top = Math.min(top, y); bottom = Math.max(bottom, y); }
  assert.ok(gold > 150, `${gold} accent pixels`);
  assert.ok(bottom - top + 1 >= 8 && bottom - top + 1 <= 14, `the row is ${bottom - top + 1} px tall`);
  assert.ok(diff(draw(dialogue, 'choice'), draw(dialogue, 'choice', { accent: P.crimson })) > 150);
});

test('animated glyphs move by the pixels the specification says and their loops close', () => {
  const span = (s, clip, axis) => {
    const at = [];
    for (let f = 0; f < 8; f++) { const b = draw(s, clip, {}, f).bounds(); at.push(axis === 'x' ? b.x0 : b.y0); }
    return { travel: Math.max(...at) - Math.min(...at), at };
  };
  assert.equal(span(dialogue, 'next', 'y').travel, 2, 'the arrow bobs 2 px');
  assert.equal(span(menu, 'cursor', 'x').travel, 2, 'the cursor slides 2 px');
  assert.equal(span(menu, 'cursor', 'y').travel, 0, 'the cursor does not bob');
  const marker = span(menu, 'turn-marker', 'y');
  assert.ok(marker.travel >= 2 && marker.travel <= 4, `the marker bounces ${marker.travel} px`);
  for (const [s, clip] of [[dialogue, 'next'], [menu, 'cursor'], [menu, 'turn-marker']]) {
    const steps = [];
    for (let f = 0; f < 8; f++) steps.push(diff(draw(s, clip, {}, f), draw(s, clip, {}, (f + 1) % 8)));
    assert.ok(steps.filter((n) => n > 0).length >= 4, `${s.id} ${clip} moves in at least half its frames`);
    // same shape in every frame: only the position changes
    const counts = new Set();
    for (let f = 0; f < 8; f++) counts.add(draw(s, clip, {}, f).data.reduce((n, v) => n + (v ? 1 : 0), 0));
    assert.equal(counts.size, 1, `${s.id} ${clip} keeps its shape`);
  }
});

// ---- bars ---------------------------------------------------------------------

test('the fill strips fit exactly inside the housing opening, in every look', () => {
  for (const look of looks(bars)) {
    const frame = draw(bars, 'frame', look);
    assert.deepEqual(frame.bounds(), { x0: 1, y0: 1, x1: 62, y1: 14 }, 'the housing is 62x14');
    const boxes = ['fill', 'fill-b', 'fill-c'].map((c) => draw(bars, c, look).bounds());
    assert.deepEqual(boxes[1], boxes[0]);
    assert.deepEqual(boxes[2], boxes[0]);
    for (let f = 0; f < 4; f++) assert.deepEqual(draw(bars, 'flash', look, f).bounds(), boxes[0], `flash frame ${f}`);
    const b = boxes[0];
    // the housing shows only its dark trough (and compartment lines) where the strip goes, and the bevel all round it
    const frameCols = new Set([col(look.frame ?? P.cream)]);
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) assert.ok(!frameCols.has(frame.get(x, y)), `trough at ${x},${y}`);
    for (let x = b.x0 - 1; x <= b.x1 + 1; x++) { assert.equal(frame.get(x, b.y0 - 1), col(INK), `ink above the opening at ${x}`); assert.equal(frame.get(x, b.y1 + 1), col(INK), `ink below the opening at ${x}`); }
    for (let y = b.y0; y <= b.y1; y++) { assert.equal(frame.get(b.x0 - 1, y), col(INK)); assert.equal(frame.get(b.x1 + 1, y), col(INK)); }
  }
  // at the plain look the opening is the helper's
  const o = barOpening(1, 1, 62, 14, { border: 0.5 });
  assert.deepEqual(draw(bars, 'fill', { style: 'solid' }).bounds(), { x0: o.x, y0: o.y, x1: o.x + o.w - 1, y1: o.y + o.h - 1 });
});

test('the three fills are the three resources, the flash starts white and ends as the health strip', () => {
  const has = (g, hex) => g.data.includes(col(hex));
  assert.ok(has(draw(bars, 'fill'), P.heal) && !has(draw(bars, 'fill'), P.hero));
  assert.ok(has(draw(bars, 'fill-b'), P.hero) && !has(draw(bars, 'fill-b'), P.heal));
  assert.ok(has(draw(bars, 'fill-c'), P.gold));
  const first = draw(bars, 'flash', {}, 0), last = draw(bars, 'flash', {}, 3);
  assert.deepEqual([...new Set(first.data)].filter(Boolean), [col('#ffffff')]);
  assert.equal(diff(last, draw(bars, 'fill')), 0);
  assert.ok(diff(draw(bars, 'flash', {}, 1), draw(bars, 'flash', {}, 2)) > 100);
  assert.equal(bars.clips.flash.loop, false);
  assert.equal(bars.clips.flash.fps, 8, 'a fixed 8 frames per second: a bar has no speed control');
});

test('segmented bars have compartments in the housing and matching gaps in the strip', () => {
  const frame = draw(bars, 'frame', { style: 'segmented' }), fill = draw(bars, 'fill', { style: 'segmented' });
  const b = fill.bounds();
  const gaps = [];
  for (let x = b.x0; x <= b.x1; x++) if (!fill.get(x, b.y0 + 1)) gaps.push(x);
  assert.ok(gaps.length >= 3 && gaps.length <= 9, `${gaps.length} gaps`);
  for (const x of gaps) for (let y = b.y0; y <= b.y1; y++) { assert.equal(fill.get(x, y), 0); assert.equal(frame.get(x, y), col(INK), `compartment line at ${x},${y}`); }
  const widths = gaps.map((x, i) => x - (i ? gaps[i - 1] : b.x0 - 1) - 1);
  assert.ok(Math.max(...widths) - Math.min(...widths) <= 1, `compartments are even: ${widths}`);
});

// ---- digits ---------------------------------------------------------------------

const GLYPHS = Object.keys(digits.clips);

// How different two glyphs look: the brightness change summed over the pixels that differ.
// 1.0 is about one cream pixel turning into ink.
const lum = (v) => (v ? ((v & 255) * 0.299 + ((v >>> 8) & 255) * 0.587 + ((v >>> 16) & 255) * 0.114) / 255 : 0.5);
const lookDiff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n += Math.abs(lum(a.data[i]) - lum(b.data[i])); return n; };

test('every glyph differs clearly from every other, in every style, upright and slanted', () => {
  let least = Infinity, which = '';
  for (const style of choices(digits, 'style')) for (const slant of [false, true]) for (const size of [0, 0.5, 1]) {
    const drawn = GLYPHS.map((c) => draw(digits, c, { style, slant, size }));
    for (let i = 0; i < drawn.length; i++) for (let j = i + 1; j < drawn.length; j++) {
      const d = lookDiff(drawn[i], drawn[j]);
      if (d < least) { least = d; which = `${GLYPHS[i]} against ${GLYPHS[j]} (${style}, slant ${slant}, size ${size})`; }
      assert.ok(diff(drawn[i], drawn[j]) >= 2 && d >= 1.5, `${GLYPHS[i]} against ${GLYPHS[j]} (${style}, slant ${slant}, size ${size}): ${diff(drawn[i], drawn[j])} px, contrast ${d.toFixed(2)}`);
    }
  }
  assert.ok(least >= 1.5, `closest pair: ${which}, ${least.toFixed(2)}`);
});

test('digits are thick, inked and about 10 px wide; all ten share one height and one baseline', () => {
  for (const style of choices(digits, 'style')) for (const shadow of [false, true]) for (const size of [0, 0.5, 1]) for (const slant of [false, true]) {
    const boxes = Array.from({ length: 10 }, (_, i) => draw(digits, `digit-${i}`, { style, shadow, size, slant }).bounds());
    const tops = new Set(boxes.map((b) => b.y0)), bottoms = new Set(boxes.map((b) => b.y1));
    assert.equal(tops.size, 1, `${style} size ${size}: one top line`);
    assert.equal(bottoms.size, 1, `${style} size ${size}: one baseline`);
    const d = digitSize(size, style);
    for (const [i, b] of boxes.entries()) {
      const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1;
      assert.ok(w <= 14 && h <= 14, `digit ${i} is ${w}x${h}: at most 14x14`);
      assert.equal(h, d.h + 4 + (shadow ? 1 : 0), `digit ${i}: the helper's height plus rim and ink`);
      // (a 1 is narrower; a leaning 7 has nothing at the bottom left, so the lean does not widen it)
      if (i !== 1 && !(slant && i === 7)) assert.equal(w, d.w + 4 + (shadow ? 1 : 0) + (slant ? 1 : 0), `digit ${i}: the helper's width plus rim and ink`);
    }
  }
  const zero = draw(digits, 'digit-0', { style: 'chunky', shadow: false, slant: false }).bounds();
  assert.equal(zero.x1 - zero.x0 + 1, 10, 'a chunky digit is 10 px wide at the usual size');
});

test('every drawn digit differs from every other by more than 2 body pixels at 1x', () => {
  const bodyPixels = (g) => { const out = new Set(); g.data.forEach((v, i) => { if (v === col(P.cream)) out.add(i); }); return out; };
  for (const style of choices(digits, 'style')) for (const size of [0, 0.5, 1]) for (const slant of [false, true]) {
    const drawn = Array.from({ length: 10 }, (_, i) => bodyPixels(draw(digits, `digit-${i}`, { style, size, slant })));
    for (let i = 0; i < 10; i++) for (let j = i + 1; j < 10; j++) {
      let n = 0;
      for (const k of drawn[i]) if (!drawn[j].has(k)) n++;
      for (const k of drawn[j]) if (!drawn[i].has(k)) n++;
      assert.ok(n > 2, `${i} against ${j} (${style}, size ${size}, slant ${slant}): ${n} body px`);
    }
    // and the sprite draws the helper's bodies, not its own
    const d = digitSize(size, style), eight = digitBody(8, d);
    let count = 0; for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) if (eight.at(x, y)) count++;
    assert.equal(drawn[8].size, count, `${style} size ${size}: the 8 has the helper's ${count} body pixels`);
  }
});

test('the miss mark is a swoosh with two motion lines: three separate strokes inside one rim', () => {
  for (const style of choices(digits, 'style')) for (const size of [0, 0.5, 1]) {
    const g = draw(digits, 'miss', { style, size, shadow: false });
    // count the body's separate strokes (pixels joined side to side or corner to corner are one stroke)
    const body = new Set(); g.data.forEach((v, i) => { if (v === col(P.cream)) body.add(i); });
    let strokes = 0; const seen = new Set();
    for (const start of body) {
      if (seen.has(start)) continue;
      strokes++;
      const todo = [start]; seen.add(start);
      while (todo.length) { const i = todo.pop(), x = i % 16, y = i >> 4; for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) { const k = (y + dy) * 16 + x + dx; if (body.has(k) && !seen.has(k)) { seen.add(k); todo.push(k); } } }
    }
    assert.equal(strokes, 3, `${style} size ${size}: ${strokes} strokes`);
    const b = g.bounds();
    assert.ok(b.x1 - b.x0 + 1 >= 11 && b.y1 - b.y0 + 1 >= 10, `${style}: the mark is ${b.x1 - b.x0 + 1}x${b.y1 - b.y0 + 1}`);
  }
});

test('a glyph is body colour inside a rim of the edge colour inside ink, and its holes are ink', () => {
  { const z = draw(digits, 'digit-0', { shadow: false }), b = z.bounds(); assert.equal(z.get((b.x0 + b.x1 + 1) >> 1, b.y0 + 4), col(INK), 'the upper counter of a zero'); }
  for (const c of GLYPHS) {
    const g = draw(digits, c, { shadow: false });
    let body = 0, rim = 0;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const v = g.get(x, y);
      if (!v) continue;
      const open = !g.get(x - 1, y) || !g.get(x + 1, y) || !g.get(x, y - 1) || !g.get(x, y + 1);
      if (open) assert.equal(v, col(INK), `${c}: the outside of ${x},${y} is ink`);
      if (v === col(P.cream)) {
        body++;
        // the body never reaches the outside: nothing empty next to it, even diagonally (holes inside a digit are ink)
        for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) assert.ok(g.get(x + dx, y + dy), `${c}: body pixel ${x},${y} is next to the outside`);
      }
      if (v === col(P.fire)) rim++;
    }
    assert.ok(body >= 4, `${c}: ${body} body pixels`);
    assert.ok(rim >= 8, `${c}: ${rim} rim pixels`);
  }
});

test('each digit control does something a person can see', () => {
  const zero = (o) => draw(digits, 'digit-0', o), eight = (o) => draw(digits, 'digit-8', o);
  assert.ok(diff(zero({ slant: false }), zero({ slant: true })) > 8, 'slant');
  assert.ok(diff(zero({ shadow: false }), zero({ shadow: true })) > 4, 'shadow');
  assert.ok(diff(zero({ size: 0 }), zero({ size: 1 })) > 20, 'size');
  assert.ok(diff(zero({ body: P.cream }), zero({ body: P.thunder })) > 8, 'body');
  assert.ok(diff(zero({ edge: P.fire }), zero({ edge: P.mage })) > 8, 'edge');
  for (const [a, b] of [['chunky', 'slim'], ['chunky', 'rounded'], ['slim', 'rounded']]) assert.ok(diff(eight({ style: a }), eight({ style: b })) > 2, `${a} against ${b}`);
  // the shadow falls down and to the left
  const plain = zero({ shadow: false }).bounds(), shaded = zero({ shadow: true }).bounds();
  assert.equal(shaded.y1 - shaded.y0, plain.y1 - plain.y0 + 1);
  assert.equal(shaded.x1 - shaded.x0, plain.x1 - plain.x0 + 1);
});

// ---- contrast (style guide, section 8) ----------------------------------------------

const hexOf = (v) => '#' + [v & 255, (v >>> 8) & 255, (v >>> 16) & 255].map((c) => c.toString(16).padStart(2, '0')).join('');
const LOOKS = [['as made', null], ...THEME_PRESETS.map((t) => [t.name, normalizeTheme(t.theme).colour])];
const under = (g, colour) => { if (colour) applyColour(g.data, colour); return g; };

test('white text keeps 4.5 to 1 on every face swatch, and every frame swatch keeps 3 to 1 against it, under every whole-bundle look', () => {
  for (const [s, clip, x, y] of [[dialogue, 'box', 48, 24], [menu, 'panel', 48, 32]]) {
    for (const face of s.params.face.swatches) for (const frame of s.params.frame.swatches) for (const [name, colour] of LOOKS) {
      const g = under(draw(s, clip, { face, frame, border: 1, corner: 0 }), colour);
      const faceNow = hexOf(g.get(x, y)), frameNow = hexOf(g.get(x, 3));       // the middle of the face; the middle row of the 3 px band
      assert.ok(contrast('#ffffff', faceNow) >= 4.5, `${s.id} face ${face} under ${name}: white text ${contrast('#ffffff', faceNow).toFixed(2)}`);
      assert.ok(contrast(frameNow, faceNow) >= 3, `${s.id} frame ${frame} on face ${face} under ${name}: ${contrast(frameNow, faceNow).toFixed(2)}`);
    }
  }
});

test('the highlighted row is a text area too: white text keeps 4.5 to 1 on it for every face and accent, under every look', () => {
  for (const face of menu.params.face.swatches) for (const accent of menu.params.accent.swatches) for (const [name, colour] of LOOKS) {
    const row = under(draw(menu, 'row', { face, accent }), colour), choice = under(draw(dialogue, 'choice', { face, accent }), colour);
    const b = row.bounds();
    const rowText = hexOf(row.get(48, (b.y0 + b.y1) >> 1));
    assert.ok(contrast('#ffffff', rowText) >= 4.5, `row, face ${face}, accent ${accent}, ${name}: ${contrast('#ffffff', rowText).toFixed(2)}`);
    // the choice box's row holds the same colour as the menu's row
    let found = false;
    for (let y = 8; y < 24 && !found; y++) if (hexOf(choice.get(48, y)) === rowText) found = true;
    assert.ok(found, `choice row matches the menu row (face ${face}, ${name})`);
  }
});

test('face and frame swatches come from the helper, so a palette change cannot break the contrast rules', () => {
  const sw = panelSwatches('hearthvale', { face: 'panel', frame: 'cream', faces: ['slate', 'bandit', 'mage', 'rogue'], frames: ['skin', 'steel', 'thunder', 'sky'] });
  assert.deepEqual(sw.failing, []);
  for (const s of [dialogue, menu]) {
    assert.deepEqual(s.params.face.swatches, sw.face, `${s.id} face`);
    assert.deepEqual(s.params.frame.swatches, sw.frame, `${s.id} frame`);
    assert.ok(s.params.face.swatches.length >= 4 && s.params.frame.swatches.length >= 4);
  }
  assert.deepEqual(bars.params.frame.swatches, sw.frame, 'the bars take the same frames as the panels they sit on');
  // the defaults did not move
  assert.deepEqual([dialogue.params.face.def, dialogue.params.frame.def, dialogue.params.accent.def], [P.panel, P.cream, P.gold]);
});
