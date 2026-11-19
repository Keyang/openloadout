import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col } from '../../engine/color.js';
import { CANDY_MARK_STYLES, candyMarks } from '../../engine/ui-candy.js';
import { skinButton, skinBarHousing, skinSwitch } from '../../engine/ui-skins.js';

const FACE = '#7a4f33', FRAME = '#f0ead8';
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };
const KEEP = { x: 8, y: 4, w: 48, h: 8 };
const housing = (style, opt = {}) => {
  const g = new Surface(64, 16);
  skinBarHousing(g, 1, 1, 62, 14, 'candy', { frame: FRAME });
  if (style) candyMarks(g, 1, 1, 62, 14, style, { frame: FRAME, keep: KEEP, ...opt });
  return g;
};
const button = (style, opt = {}) => {
  const g = new Surface(96, 32);
  const out = skinButton(g, 1, 1, 94, 30, 'normal', 'candy', { face: FACE, frame: FRAME, style: 'jelly', shine: false });
  if (style) candyMarks(g, out.body.x, out.body.y, out.body.w, out.body.h, style, { frame: FRAME, keep: { x: 8, y: 8, w: 80, h: 16 }, ...opt });
  return { g, out };
};

test('candyMarks lists the candy styles', () => {
  assert.deepEqual([...CANDY_MARK_STYLES], ['jelly', 'striped', 'frosted']);
  assert.throws(() => candyMarks(new Surface(8, 8), 0, 0, 8, 8, 'plain', {}), /style/);
});

test('each style changes a bar housing by 12 px or more, and the styles differ from each other by 12 or more', () => {
  const base = housing(null), m = Object.fromEntries(CANDY_MARK_STYLES.map((s) => [s, housing(s)]));
  for (const s of CANDY_MARK_STYLES) assert.ok(diff(base, m[s]) >= 12, `${s} changed ${diff(base, m[s])}`);
  assert.ok(diff(m.jelly, m.striped) >= 12, `jelly/striped ${diff(m.jelly, m.striped)}`);
  assert.ok(diff(m.jelly, m.frosted) >= 12, `jelly/frosted ${diff(m.jelly, m.frosted)}`);
  assert.ok(diff(m.striped, m.frosted) >= 12, `striped/frosted ${diff(m.striped, m.frosted)}`);
});

test('candyMarks never adds a pixel outside what is drawn, and leaves the kept middle alone except for whole rows', () => {
  for (const s of CANDY_MARK_STYLES) {
    const base = housing(null), g = housing(s, { shine: true });
    for (let i = 0; i < g.data.length; i++) if (g.data[i]) assert.ok(base.data[i], `${s} added a pixel at ${i}`);
    // every row is the same across the kept columns, so the piece still stretches sideways
    for (let py = 0; py < 16; py++) for (let px = KEEP.x + 1; px < KEEP.x + KEEP.w; px++) assert.equal(g.get(px, py), g.get(KEEP.x, py), `${s} row ${py} col ${px}`);
  }
});

test('striped stripes the rim in the corners with the stripe colour, 3 px apart', () => {
  const g = housing('striped', { stripe: FACE }), base = housing(null), s = col(FACE);
  let n = 0;
  for (let i = 0; i < g.data.length; i++) if (g.data[i] !== base.data[i]) { assert.equal(g.data[i], s); n++; const px = i % 64, py = (i - px) / 64; assert.equal((px + py) % 3, 0); }
  assert.ok(n >= 12, `stripes ${n}`);
});

test('shine adds a glint of 4 px or more on the inside of the top right corner and nothing in the text area', () => {
  const plain = button('jelly'), lit = button('jelly', { shine: true });
  const d = diff(plain.g, lit.g);
  assert.ok(d >= 4, `glint ${d}`);
  const t = lit.out.text;
  for (let py = t.y; py < t.y + t.h; py++) for (let px = t.x; px < t.x + t.w; px++) assert.equal(lit.g.get(px, py), plain.g.get(px, py));
  for (let i = 0; i < lit.g.data.length; i++) if (lit.g.data[i] !== plain.g.data[i]) assert.ok(i % 96 >= 80 && i / 96 < 10, `glint pixel at ${i % 96},${Math.floor(i / 96)}`);
});

test('frosted drips hang from the top rim over the ink line in both top corners', () => {
  const base = button(null).g, g = button('frosted').g;
  let left = 0, right = 0;
  for (let py = 4; py < 9; py++) for (let px = 1; px < 95; px++) if (g.get(px, py) !== base.get(px, py)) { if (px < 48) left++; else right++; }
  assert.ok(left >= 3 && right >= 3, `drips ${left} ${right}`);
});

test('marks on a switch stay inside it', () => {
  for (const s of CANDY_MARK_STYLES) {
    const a = new Surface(32, 32); skinSwitch(a, 2, 8, 28, 16, true, 'candy', { frame: FRAME, accent: '#4fd8ee' });
    const b = new Surface(32, 32); skinSwitch(b, 2, 8, 28, 16, true, 'candy', { frame: FRAME, accent: '#4fd8ee' });
    candyMarks(b, 2, 8, 28, 16, s, { frame: FRAME, keep: { x: 10, y: 12, w: 12, h: 8 } });
    for (let i = 0; i < b.data.length; i++) if (b.data[i]) assert.ok(a.data[i]);
    assert.ok(diff(a, b) >= 4, `${s} on a switch ${diff(a, b)}`);
  }
});

test('skip leaves a switch knob untouched', () => {
  const a = new Surface(32, 32); const { knob } = skinSwitch(a, 2, 8, 28, 16, true, 'candy', { frame: FRAME, accent: '#4fd8ee' });
  const b = new Surface(32, 32); skinSwitch(b, 2, 8, 28, 16, true, 'candy', { frame: FRAME, accent: '#4fd8ee' });
  candyMarks(b, 2, 8, 28, 16, 'striped', { frame: FRAME, stripe: FACE, skip: [knob] });
  for (let py = knob.y; py < knob.y + knob.h; py++) for (let px = knob.x; px < knob.x + knob.w; px++) assert.equal(b.get(px, py), a.get(px, py));
  assert.ok(diff(a, b) >= 4);
});
