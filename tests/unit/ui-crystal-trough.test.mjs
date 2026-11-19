// engine/ui-crystal-trough.js (batch K26, bundles/specs/core-sprites-3.md): the crystal styles inside a bar trough's ends.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { PALETTE } from '../../engine/palettes.js';
import { col } from '../../engine/color.js';
import { skinBarHousing, skinBarOpening } from '../../engine/ui-skins.js';
import { MORE_SKIN_STYLES } from '../../engine/ui-skins-more.js';
import { crystalTroughMarks } from '../../engine/ui-crystal-trough.js';

const P = PALETTE.thornwood;
const look = (borderPx) => ({ style: 'solid', face: P.cavern, frame: P.sky, accent: P.magic, borderPx, corner: 0.5 });
function housing(w, borderPx = 2) {
  const g = new Surface(w, 16);
  skinBarHousing(g, 1, 1, w - 2, 14, 'flat', look(borderPx));
  return { g, opening: skinBarOpening(1, 1, w - 2, 14, 'flat', look(borderPx)) };
}
const copy = (g) => { const s = new Surface(g.w, g.h); s.data.set(g.data); return s; };
const changed = (a, b) => { const out = []; for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) if (a.get(x, y) !== b.get(x, y)) out.push([x, y]); return out; };

test('crystalTroughMarks draws only inside the opening, within `zone` columns of each end', () => {
  for (const bp of [1, 2, 3]) for (const style of MORE_SKIN_STYLES.crystal) {
    const { g, opening: o } = housing(64, bp), before = copy(g);
    const n = crystalTroughMarks(g, o, style, { frame: P.sky, accent: P.magic, zone: 3 });
    const px = changed(before, g);
    assert.ok(n > 0 && px.length === n, `${style} ${bp}: ${n} painted, ${px.length} changed`);
    for (const [x, y] of px) {
      assert.ok(x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h, `${style} ${bp}: (${x}, ${y}) outside the opening`);
      assert.ok(x < o.x + 3 || x >= o.x + o.w - 3, `${style} ${bp}: (${x}, ${y}) in the middle`);
    }
  }
});

test('crystalTroughMarks marks the two ends alike, so a bar stretched wider keeps the same ends', () => {
  for (const style of MORE_SKIN_STYLES.crystal) {
    const a = housing(64), b = housing(112), a0 = copy(a.g);
    crystalTroughMarks(a.g, a.opening, style, { frame: P.sky, accent: P.magic });
    crystalTroughMarks(b.g, b.opening, style, { frame: P.sky, accent: P.magic });
    const at = new Set(changed(a0, a.g).map(([x, y]) => x + ',' + y));
    for (const k of at) { const [x, y] = k.split(',').map(Number); assert.ok(at.has((63 - x) + ',' + y), `${style}: (${x}, ${y}) has no mirror`); }
    for (let y = 0; y < 16; y++) for (let x = 0; x < 12; x++) {
      assert.equal(a.g.get(x, y), b.g.get(x, y), `${style}: left end (${x}, ${y})`);
      assert.equal(a.g.get(63 - x, y), b.g.get(111 - x, y), `${style}: right end (${x}, ${y})`);
    }
  }
});

test('the three styles differ, rime tips its stems in the accent, disabled keeps no colour', () => {
  const pics = MORE_SKIN_STYLES.crystal.map((style) => { const { g, opening } = housing(64); crystalTroughMarks(g, opening, style, { frame: P.sky, accent: P.crimson }); return g; });
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.ok(changed(pics[i], pics[j]).length >= 6, `${i} vs ${j}`);
  assert.ok([...pics[1].data].includes(col(P.crimson)), 'rime: an accent tip');
  const { g, opening } = housing(64), before = copy(g);
  crystalTroughMarks(g, opening, 'rime', { frame: P.sky, accent: P.crimson, state: 'disabled' });
  for (const [x, y] of changed(before, g)) {
    const c = g.get(x, y), rgb = [c & 255, (c >> 8) & 255, (c >> 16) & 255];
    assert.ok(Math.max(...rgb) - Math.min(...rgb) <= 3, `(${x}, ${y}) ${rgb} has colour`);
  }
});

test('crystalTroughMarks is repeatable and refuses an unknown style', () => {
  const a = housing(64), b = housing(64);
  crystalTroughMarks(a.g, a.opening, 'shard', { frame: P.goblin, accent: P.moss });
  crystalTroughMarks(b.g, b.opening, 'shard', { frame: P.goblin, accent: P.moss });
  assert.deepEqual([...a.g.data], [...b.g.data]);
  assert.throws(() => crystalTroughMarks(a.g, a.opening, 'tube', {}), /ice, rime, shard/);
});
