// Review round 2 of migration batch M8 (the skinned interface pieces, engine/gen/ui-skin.js; their sprites ui-bars-*,
// ui-buttons-*, ui-panel-*). What the review found, each held here:
//   1. a slider's rail: outline, a 1 px band and a trough at every Border (the code's skinSlider), never an opening ring
//      drawn over a trough with no rows (it inked the rail's bottom half)
//   2. a piece too small for its borders exports its rect and no border, and text areas that lie in the frame, also
//      when it fills its frame (the validator took a 14 x 12 button whose export then threw)
//   3. ui.area@1 gives only areas inside the frame and a slice that leaves a middle, whatever its arguments say
//   5. the paper bars are a cream card ruled in the Ink colour round a pale well, their hatching in the Ink colour
//   6. the gilded temple band is the gold band with the code's key carved along its inner edge (top and bottom), not an
//      ink strip; the bars and their rail carry no key (the code's had none)
//   7. a slider knob keeps its face: a 1 px band and corners of at most 2 px whatever Border and Corner say, none of
//      the skin's corner ornaments, only its own small marks (paper's two rules, gilded's gem, candy's highlight)
// Node only (it loads the library files).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as registry from '../../engine/gen/index.js';
import { SKIN_MEASURES, uiSlab } from '../../engine/gen/ui-skin.js';
import { renderSheet, renderFrame, defaultParams, cleanParams, clipStretch } from '../../engine/sprite.js';
import { librarySprite, ROOT } from '../helpers/library.mjs';
import { loadDataSprite } from '../../tools/lib/assets.mjs';
import { validateSprite } from '../../catalog/sprite-schema.js';
import { Surface } from '../../engine/surface.js';
import { drawList } from '../../engine/draw-list.js';

const FAMILIES = ['candy', 'crystal', 'flat', 'gilded', 'grove', 'neon', 'paper'];
const params = (s, over = {}) => cleanParams(s, { ...defaultParams(s), ...over });
const defaultsOf = (gen) => Object.fromEntries(Object.entries(gen.args).map(([k, t]) => [k, t.default]));
const gen = (id) => registry.generator(id.split('@')[0], Number(id.split('@')[1]));
const PAINTS = { face: 'face', frame: 'frame', accent: 'accent', ink: 'ink' };
const hex = (v) => (v >>> 24 ? `#${[0, 8, 16].map((s) => ((v >>> s) & 255).toString(16).padStart(2, '0')).join('')}` : null);
const INK = '#231b33';

/** Every slice and text area of a measure lies in a frame of `size`: borders that leave a middle (or meet), areas inside with w and h at least 1. */
function assertFits(m, size, what) {
  const [W, H] = size;
  if (m.slice) {
    const s = m.slice, r = s.rect ?? { x: 0, y: 0, w: W, h: H };
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H, `${what}: the rect lies in the frame ${JSON.stringify(s)}`);
    if (s.left !== undefined) {
      assert.ok(s.left >= 0 && s.top >= 0 && s.right >= 0 && s.bottom >= 0, `${what}: no negative border ${JSON.stringify(s)}`);
      assert.ok(s.left + s.right <= r.w && s.top + s.bottom <= r.h, `${what}: the border leaves the piece ${JSON.stringify(s)} in ${W} x ${H}`);
    }
  }
  for (const a of [m.textArea ?? []].flat()) {
    assert.ok(a.w >= 1 && a.h >= 1, `${what}: a text area at least 1 x 1 ${JSON.stringify(a)}`);
    assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= W && a.y + a.h <= H, `${what}: the text area lies in the ${W} x ${H} frame ${JSON.stringify(a)}`);
    if (a.edge) assert.ok(a.edge.x >= 0 && a.edge.y >= 0 && a.edge.x < W && a.edge.y < H, `${what}: the edge pixel lies in the frame ${JSON.stringify(a.edge)}`);
  }
}

test('1. every skinned slider rail is outline, a 1 px band and a trough at every Border: no ink inside it', async () => {
  for (const f of FAMILIES) {
    const s = await librarySprite(`ui-bars-${f}`);
    for (const border of [0, 0.5, 1]) for (const corner of [0, 0.5, 1]) {
      const p = params(s, { border, corner });
      const g = renderFrame(s, 'slider', 0, p);
      const col = [];
      for (let y = 0; y < s.size[1]; y++) { const c = hex(g.get(32, y)); if (c) col.push(c); }
      const what = `ui-bars-${f} border ${border} corner ${corner}: ${col.join(' ')}`;
      assert.equal(col.length, 6, `${what}: a rail 6 px tall`);
      assert.equal(col[0], INK, `${what}: inked at the top`);
      assert.equal(col[5], INK, `${what}: inked at the bottom`);
      for (let i = 1; i < 5; i++) assert.notEqual(col[i], INK, `${what}: row ${i} is not ink`);
      assert.equal(col[2], col[3], `${what}: a trough two rows deep`);
      assert.notEqual(col[1], col[2], `${what}: the band stands apart from the trough`);
    }
  }
});

test('1. a housing whose rings leave no opening draws no opening ring and no trough', () => {
  const T = gen('ui.trough@1');
  // 8 px tall with a 3 px band: rings ink, band x3, ink from each edge leave no opening (o.h = 0)
  const out = T.run({ ...defaultsOf(T), at: [0, 0], size: [40, 8], border: 3, ...PAINTS }, { t: 0 });
  const g = new Surface(40, 8);
  drawList(g, out, { palette: { ink: '#231b33', face: '#3f5068', frame: '#f0ead8', accent: '#4fd8ee' } });
  // the middle column, top to bottom: ink, the band, then the band again from the bottom (the rings), never an ink line across the middle
  const col = [];
  for (let y = 0; y < 8; y++) col.push(hex(g.get(20, y)));
  assert.equal(col[0], INK);
  assert.equal(col[7], INK);
  for (let y = 1; y < 7; y++) assert.notEqual(col[y], INK, `row ${y}: ${col.join(' ')}`);
});

test('2. every skinned piece measured over small frames it fills: borders that fit, text areas in the frame', () => {
  const roles = uiSlab.args.role.options ?? uiSlab.args.role.values ?? ['panel', 'title', 'inset', 'tooltip', 'button', 'tab', 'tab-open', 'knob'];
  const S = defaultsOf(uiSlab);
  for (let w = 6; w <= 24; w++) for (let h = 6; h <= 24; h += 1) {
    for (const role of roles) for (const border of [1, 3]) for (const extra of [{}, { shadow: true }, { gloss: 2, sunken: true }, { lined: true }]) {
      const a = { ...S, ...PAINTS, at: [0, 0], size: [w, h], role, border, ...extra };
      assertFits(SKIN_MEASURES['ui.slab@1'](a, { size: [w, h] }), [w, h], `ui.slab ${role} ${w}x${h} border ${border} ${JSON.stringify(extra)}`);
    }
    for (const id of ['ui.trough@1', 'ui.strip@1']) {
      const G = gen(id), D = defaultsOf(G);
      if (id === 'ui.strip@1' && (w < 12 || h < 12)) continue;
      for (const role of ['housing', 'rail']) for (const border of [1, 3]) {
        const a = { ...D, ...PAINTS, at: [0, 0], size: [w, h], role, border };
        assertFits(SKIN_MEASURES[id](a, { size: [w, h] }), [w, h], `${id} ${role} ${w}x${h} border ${border}`);
      }
    }
  }
});

test('2. a small button that fills its frame passes the validator and exports (the review\'s 14 x 12 ui-buttons-candy)', async () => {
  const src = JSON.parse(fs.readFileSync(path.join(ROOT, 'sprites', 'ui-buttons-candy.json'), 'utf8'));
  src.size = [14, 12];
  src.pivot = [7, 6];
  const fit = (c) => { if (c && typeof c === 'object' && c.gen === 'ui.slab') { c.at = [0, 0]; c.size = [14, 12]; } };
  fit(src.body.panel.piece);
  for (const c of src.body.panel.draw ?? []) fit(c);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-m8-'));
  const file = path.join(dir, 'ui-buttons-candy.json');
  fs.writeFileSync(file, JSON.stringify(src));
  try {
    const v = validateSprite(JSON.stringify(src), {});
    assert.equal(v.ok, true, JSON.stringify(v.errors));
    const s = await loadDataSprite(ROOT, file);
    for (const p of [defaultParams(s), params(s, { border: 1 }), params(s, { corner: 1 })]) {
      let meta;
      assert.doesNotThrow(() => { meta = renderSheet(s, p, { scale: 1 }).meta; });
      for (const c of Object.keys(s.clips)) {
        assertFits({ slice: s.slice?.(c, p) ?? undefined, textArea: s.textArea?.(c, p) ?? undefined }, s.size, `14x12 ${c}`);
        assert.doesNotThrow(() => clipStretch(s, c, p));
      }
      assert.ok(meta);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('3. ui.area@1 gives only text areas inside the frame and a slice that leaves a middle', () => {
  const A = gen('ui.area@1'), D = defaultsOf(A), measure = SKIN_MEASURES['ui.area@1'];
  const size = [96, 64];
  const hostile = [
    { left: 60, right: 60, top: 8, bottom: 8 },
    { at: [-200, -200], size: [256, 256], edge: [200, 200] },
    { at: [90, 60], size: [40, 40], also: true, alsoAt: [-10, 2], alsoSize: [256, 3] },
    { at: [100, 70], size: [8, 8], top: 64, bottom: 64 },
  ];
  for (const h of hostile) {
    const m = measure({ ...D, ...h }, { size });
    assertFits(m, size, `ui.area ${JSON.stringify(h)}`);
  }
  // a slice that leaves no middle is dropped rather than exported (the sprite then does not stretch)
  assert.equal(measure({ ...D, left: 60, right: 60, top: 8, bottom: 8 }, { size }).slice, undefined);
  // an area wholly outside the frame is dropped; one partly outside is cut to the frame
  const m = measure({ ...D, at: [-10, 4], size: [50, 10] }, { size });
  assert.deepEqual({ x: m.textArea.x, y: m.textArea.y, w: m.textArea.w, h: m.textArea.h }, { x: 0, y: 4, w: 40, h: 10 });
  assert.equal(measure({ ...D, at: [100, 70], size: [8, 8] }, { size }).textArea, undefined);
  // what fits is given as written (ui-panel-wood's areas)
  const ok = measure({ ...D, at: [8, 17], size: [80, 39], edge: [48, 2], also: true, alsoAt: [8, 5], alsoSize: [80, 11], left: 8, top: 17, right: 8, bottom: 8 }, { size });
  assert.deepEqual(ok.slice, { left: 8, top: 17, right: 8, bottom: 8 });
  assert.deepEqual(ok.textArea[0], { x: 8, y: 17, w: 80, h: 39, edge: { x: 48, y: 2 } });
});

test('5. the paper bars are a cream card ruled in the Ink colour round a pale well; the hatching is in the Ink colour', async () => {
  const s = await librarySprite('ui-bars-paper');
  const cream = '#f0ead8';
  for (const ink of ['#3f5068', '#8e3a4a']) for (const border of [0, 0.5, 1]) {
    const p = params(s, { frame: ink, border });
    const g = renderFrame(s, 'frame', 0, p);
    const o = renderSheet(s, p, { scale: 1 }).meta.animations.frame.opening;
    const what = `ui-bars-paper ink ${ink} border ${border}`;
    assert.equal(hex(g.get(32, 1)), INK, `${what}: the outline`);
    assert.equal(hex(g.get(32, 2)), ink, `${what}: a rule of the Ink inside the outline`);
    assert.equal(hex(g.get(32, o.y - 1)), ink, `${what}: the opening ruled in the Ink`);
    assert.equal(hex(g.get(32, o.y + 2)), cream, `${what}: the well is the paper`);
    if (o.y - 1 > 3) assert.equal(hex(g.get(32, 3)), cream, `${what}: the card between the rules is the paper`);
    // the hatching: in the Ink colour, so the Ink control reaches it
    const f = renderFrame(s, 'fill', 0, p);
    let inked = 0;
    for (let x = o.x; x < o.x + o.w; x++) for (let y = o.y; y < o.y + o.h; y++) if (hex(f.get(x, y)) === ink) inked++;
    assert.ok(inked >= o.w / 2, `${what}: hatching of the Ink colour (${inked} px)`);
    // the slider: the code's cream rail ruled in the Ink round a paper trough
    const r = renderFrame(s, 'slider', 0, p), col = [];
    for (let y = 0; y < 16; y++) { const c = hex(r.get(32, y)); if (c) col.push(c); }
    assert.deepEqual(col, [INK, ink, cream, cream, ink, INK], `${what}: rail ${col.join(' ')}`);
  }
});

test('6. the gilded temple band is gold with the code\'s key along its inner edge, top and bottom; the bars carry none', async () => {
  const s = await librarySprite('ui-panel-gilded');
  // the code's key (engine/ui-gilded-carve.js KEY), by column mod 4, rows: the band's inner row, the ink line, the face's first row
  const KEY = ['ooo.', 'obob', 'o.oo'];
  for (const border of [0, 0.5, 1]) {
    const p = params(s, { border });
    const g = renderFrame(s, 'panel', 0, p);
    const b = Math.round(1 + 2 * border);   // the band in px (the Border map 1 to 3)
    const top = 1, inner = top + b;         // the panel's box starts at row 1; its band rows are top+1 .. top+b
    const what = `ui-panel-gilded border ${border}`;
    // the band's outer row is all gold along the middle: no ink strip (a 1 px band is its inner row too, as in the code)
    if (b >= 2) for (let x = 24; x < 72; x++) assert.notEqual(hex(g.get(x, top + 1)), INK, `${what}: the band's outer row at x=${x} is gold`);
    // the inner row, the ink line and the face's first row carry the key, repeating every 4 px
    const rowOf = (y) => { let r = ''; for (let x = 24; x < 72; x++) r += hex(g.get(x, y)) === INK ? 'o' : '.'; return r; };
    const rows = [rowOf(inner), rowOf(inner + 1), rowOf(inner + 2)];
    for (const r of rows) assert.equal(r.slice(0, 4).repeat(12), r, `${what}: the key repeats every 4 px (${r})`);
    const phase = [0, 1, 2, 3].find((k) => KEY.every((row, i) => [...rows[i].slice(k, k + 4)].every((ch, j) => (row[j] === 'o') === (ch === 'o'))));
    assert.notEqual(phase, undefined, `${what}: the code's key ${rows.join(' | ')}`);
    // and mirrored along the bottom
    const bottom = 1 + 62 - 1, binner = bottom - b;
    const brow = [rowOf(binner), rowOf(binner - 1), rowOf(binner - 2)];
    assert.ok([0, 1, 2, 3].some((k) => KEY.every((row, i) => [...brow[i].slice(k, k + 4)].every((ch, j) => (row[j] === 'o') === (ch === 'o')))), `${what}: the key along the bottom ${brow.join(' | ')}`);
  }
  const bars = await librarySprite('ui-bars-gilded');
  for (const clip of ['frame', 'slider']) {
    const g = renderFrame(bars, clip, 0, defaultParams(bars));
    let r = '';
    for (let x = 16; x < 48; x++) r += hex(g.get(x, clip === 'frame' ? 2 : 6)) === INK ? 'o' : '.';
    assert.ok(!r.includes('o'), `ui-bars-gilded ${clip}: no key along the band (${r})`);
  }
});

test('7. a slider knob keeps its face: Border and Corner past the code\'s 1 px band and 2 px corner, and the corner ornaments, leave it alone', async () => {
  const S = defaultsOf(uiSlab);
  const full = (rows) => [{ kind: 'stamp', at: [1, 1], rows, key: { a: 'accent' } }];
  const base = { ...S, ...PAINTS, at: [0, 0], size: [12, 14], role: 'knob', rings: ['ink', 'frame', 'ink'], bandAt: 1 };
  const plain = uiSlab.run({ ...base, border: 1, corner: 2 }, { t: 0 });
  // every ornament list full and every toggle on: none of them reaches the knob
  const ORN = { trim: full(['aaaa', 'aaaa']), topTrim: full(['aaa']), rightTrim: full(['aaaa']), gleamRight: full(['aaaa', 'aaaa', 'aaaa', 'aaaa']),
    extra: full(['aa']), extraTop: full(['aa']), gleamTrim: full(['a']), gleamTop: full(['a']), along: full(['a']), extraAlong: full(['a']), extras: true, gleam: true, sides: true };
  assert.deepEqual(uiSlab.run({ ...base, border: 3, corner: 4, ...ORN }, { t: 0 }), plain, 'Border 3, Corner 4 and every ornament: the plain knob');
  // its own marks are drawn on the face only
  const marked = uiSlab.run({ ...base, marks: [{ kind: 'stamp', at: [0, 1], rows: ['aaaaaaaa'], key: { a: 'accent' } }] }, { t: 0 });
  const st = marked.filter((p) => p.kind === 'stamp');
  assert.equal(st.length, 1);
  assert.equal(st[0].at[0], 3, 'marks start at the face (1 px band: the face is 3 px in)');
  assert.equal(st[0].rows[0].replace(/\./g, '').length, 6, 'kept to the 6 px face');
  // the measure: its rect alone, no text area
  assert.deepEqual(SKIN_MEASURES['ui.slab@1']({ ...base, at: [26, 1] }, { size: [64, 16] }), { slice: { rect: { x: 26, y: 1, w: 12, h: 14 } } });
  // in the sprites: a knob looks the same at all-high Border and Corner as at Corner 0.5 (its corner at most 2 px)
  for (const f of FAMILIES) {
    const s = await librarySprite(`ui-bars-${f}`);
    const a = renderFrame(s, 'knob', 0, params(s, { border: 1, corner: 1 })), b = renderFrame(s, 'knob', 0, params(s, { border: 0, corner: 1 }));
    for (let y = 0; y < 16; y++) for (let x = 20; x < 44; x++) assert.equal(a.get(x, y), b.get(x, y), `ui-bars-${f}: the knob ignores Border (${x}, ${y})`);
  }
});

test('the cost still holds: a knob with every marks list full, and along stamps counted from the band (alongIn)', () => {
  const LINE = (n, x = 0, y = 0) => Array.from({ length: n }, (_, i) => ({ kind: 'stamp', at: [x + i, y], rows: ['a'], key: { a: 'accent' } }));
  const KEY = [{ kind: 'stamp', at: [0, 0], rows: ['ooo.', 'obob', 'o.oo'], key: { o: 'ink', b: 'frame' } }, { kind: 'stamp', at: [0, 0], rows: ['ab', 'ba'], key: { a: 'accent', b: 'frame' } }];
  let n = 0;
  for (const size of [[12, 14], [6, 6], [40, 40], [128, 128], [128, 32]]) for (const border of [1, 3]) for (const edge of ['round', 'pill', 'chip']) {
    const look = { at: [0, 0], size, ...PAINTS, edge, corner: 4, border, rings: ['ink', 'frame', 'ink', 'face'], bandAt: 1, lit: true, extras: true, gleam: true, sides: true, every: 4, start: 0 };
    const cases = [['ui.slab', { ...look, role: 'knob', marks: LINE(4), extraMarks: LINE(4, 0, 1), gleamMarks: LINE(4, 0, 2), trim: LINE(8), along: KEY }],
      ['ui.slab', { ...look, alongIn: true, along: KEY, extraAlong: KEY }], ['ui.slab', { ...look, role: 'title', alongIn: true, along: KEY, extraAlong: KEY }],
      ['ui.trough', { ...look, size: [size[0], Math.min(size[1], 32)], alongIn: true, along: KEY, extraAlong: KEY }], ['ui.trough', { ...look, size: [size[0], Math.min(size[1], 32)], role: 'rail', alongIn: true, along: KEY }]];
    for (const [g, args] of cases) {
      const r = registry.runGenerator({ gen: g, v: 1, ...args });
      assert.ok(r.ok, `${g}: ${r.errors.join('; ')}`);
      assert.ok(r.primitives.length <= r.cost, `${g} ${args.role ?? ''} ${JSON.stringify(size)} returns ${r.primitives.length}, its cost is ${r.cost}`);
      n++;
    }
  }
  assert.ok(n >= 150);
});
