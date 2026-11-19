import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { BUTTON_STATES } from '../../engine/ui.js';
import { gildedCorners } from '../../engine/ui-gilded.js';
import { gildedKey, gildedCracks, CARVE_SIDES } from '../../engine/ui-gilded-carve.js';
import { skinPanel, skinButton } from '../../engine/ui-skins.js';

const FACE = '#3f5068', FRAME = '#f0ead8', ACCENT = '#4fd8ee';
const LOOKS = [0, 0.5, 1].flatMap((border) => [0, 0.5, 1].flatMap((corner) => [true, false].map((gems) => ({ border, corner, gems }))));
const colours = (g) => new Set([...g.data].filter(Boolean));
const copy = (g) => { const c = new Surface(g.w, g.h); c.blit(g); return c; };
const changed = (a, b) => { const out = []; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) out.push([i % a.w, Math.floor(i / a.w)]); return out; };
const inRect = (r, [x, y]) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

function panel(style, look, w = 96) {
  const g = new Surface(w, 64);
  const out = skinPanel(g, 1, 1, w - 2, 62, 'gilded', { style, face: FACE, frame: FRAME, accent: ACCENT, border: look.border, corner: look.corner, extras: false });
  const keep = { x: 8, y: 8, w: w - 16, h: 48 };
  gildedCorners(g, out.body, style, { face: FACE, frame: FRAME, accent: ACCENT, border: look.border, corner: look.corner, gems: look.gems, keep, skip: [out.inner] });
  return { g, out, keep };
}
function button(style, look, state = 'normal') {
  const g = new Surface(96, 32);
  const out = skinButton(g, 1, 1, 94, 30, state, 'gilded', { style, face: FACE, frame: FRAME, accent: ACCENT, border: look.border, corner: look.corner, extras: false });
  const keep = { x: 8, y: 8, w: 80, h: 16 };
  gildedCorners(g, out.body, style, { face: FACE, frame: FRAME, accent: ACCENT, border: look.border, corner: look.corner, gems: look.gems, bandCap: 2, state, keep, skip: [out.text] });
  return { g, out, keep };
}

test('CARVE_SIDES lists the four sides, and an unknown side throws', () => {
  assert.deepEqual([...CARVE_SIDES], ['top', 'bottom', 'left', 'right']);
  const { g, out } = panel('temple', LOOKS[0]);
  assert.throws(() => gildedKey(g, out.body, { sides: ['middle'] }), /side/);
});

test('gildedKey carves a key of 3 or more steps along the top and bottom band of every temple panel and button, with no new colour', () => {
  for (const look of LOOKS) {
    for (const piece of [panel('temple', look), ...BUTTON_STATES.map((s) => button('temple', look, s))]) {
      const { g, out } = piece, before = copy(g), skip = [out.inner ?? out.text];
      const n = gildedKey(g, out.body, { keep: piece.keep, skip });
      const px = changed(g, before);
      assert.equal(n, px.length);
      for (const p of px) for (const r of skip) assert.ok(!inRect(r, p), `key off the text area (${p})`);
      const top = px.filter(([, y]) => y < 10), bottom = px.filter(([, y]) => y > g.h - 10);
      // one step every 2 px, so 3 steps take 6 columns or more along each band
      for (const [name, side] of [['top', top], ['bottom', bottom]]) {
        const xs = new Set(side.map(([x]) => x));
        assert.ok(xs.size >= 6, `${name} band carved in ${xs.size} columns (border ${look.border}, corner ${look.corner})`);
      }
      for (const c of colours(g)) assert.ok(colours(before).has(c), 'no new colour');
    }
  }
});

test('gildedKey repeats every 4 px through the stretched middle, so the band tiles', () => {
  const { g, out, keep } = panel('temple', LOOKS[4], 160);
  gildedKey(g, out.body, { keep, skip: [out.inner] });
  const column = (x) => Array.from({ length: 64 }, (_, y) => g.get(x, y)).join();
  for (let x = keep.x; x < keep.x + keep.w - 4; x++) assert.equal(column(x), column(x + 4), `column ${x}`);
  // anchored to the slice line: the same columns at 96 and 160 wide
  const n = panel('temple', LOOKS[4]); gildedKey(n.g, n.out.body, { keep: n.keep, skip: [n.out.inner] });
  for (let x = 8; x < 88; x++) assert.equal(Array.from({ length: 6 }, (_, y) => n.g.get(x, y)).join(), Array.from({ length: 6 }, (_, y) => g.get(x, y)).join(), `phase ${x}`);
});

test('gildedCracks: each crack is 4 px or more, starts in the band, reaches the stone, never touches the text or the outline', () => {
  const cracks = [{ side: 'top', at: 0.2, dir: 1, path: [-1, -2, -2, -2, -1, -1, -2, -2, -2, -1, -1, -1, 0, 1, 1] }, { side: 'bottom', at: 0.76, dir: -1, path: [-1, -2, -2, -1, -1, -2, -2, -2, -1, -1, 0, 1, 1] }];
  const sides = [{ side: 'left', at: 0.3, dir: 1, length: 8 }, { side: 'right', at: 0.65, dir: -1, length: 8, jog: 2 }];
  for (const look of LOOKS) {
    for (const [piece, list] of [[panel('ruin', look), cracks], ...BUTTON_STATES.map((s) => [button('ruin', look, s), sides])]) {
      const { g, out } = piece, before = copy(g), skip = [out.inner ?? out.text];
      const ns = gildedCracks(g, out.body, list, { skip });
      for (const n of ns) assert.ok(n >= 4, `crack of ${n} px (border ${look.border}, corner ${look.corner})`);
      const px = changed(g, before);
      for (const p of px) {
        for (const r of skip) assert.ok(!inRect(r, p), `crack off the text area (${p})`);
        const [x, y] = p;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) assert.ok(before.get(x + dx, y + dy), `crack inside the outline (${p})`);
      }
      for (const c of colours(g)) assert.ok(colours(before).has(c), 'no new colour');
      // it reaches the stone: some crack pixel was the stone colour before (a thick band on a panel leaves no stone
      // between its ink line and the text plate, so there it ends at the ink line)
      if (out.inner && look.border > 0.5) continue;
      const stone = before.get(out.body.x + (out.body.w >> 1), out.body.y + (out.body.h >> 1));
      assert.ok(px.some(([x, y]) => before.get(x, y) === stone), `a crack runs into the stone (${out.inner ? 'panel' : 'button'}, border ${look.border}, corner ${look.corner}, gems ${look.gems})`);
    }
  }
});

test('gildedCracks refuses a path that jumps more than 1 px', () => {
  const { g, out } = panel('ruin', LOOKS[4]);
  assert.throws(() => gildedCracks(g, out.body, [{ side: 'top', at: 0.5, path: [-2, 0] }]), /path/);
});
