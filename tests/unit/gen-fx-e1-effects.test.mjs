// The effect ports build item E1 adds after its first review (and muzzle-flash after its second) (engine/gen/fx-e1-effects.js; docs/data-sprites.md
// section 9, row E1): ten library effects whose drawing was their own code (layouts worked out per frame, dust puffs,
// nested rings, braided strands, crystals, a frame-filling fireball) ported whole, as migration batch E2 ported its 21
// (engine/gen/fx-e2.js effectPort) and M9 the interface pictures: the code sprite's render, word for word, runs on a
// paint-ref grid (engine/gen/ports/e1/fx-<id>.js, importing E2's copies of the engine helpers). Each data file
// sprites/<id>.json names its port once per clip and draws what the code drew, pixel for pixel: the pixel records
// tests/fixtures/redraw-pixels/<id>.json, written from the code sprite before its file went, hold that
// (tests/unit/library-redraws-pixels.test.mjs). This file holds the generators themselves: registered, pinned by
// goldens, priced at their frame, and the one frame bigger than a frame's 8,192 stamp pixels (explosion-large, 96 x 96)
// kept under it: its middle 90 x 90 comes back as stamps, what little it paints round that as whole-pixel rects.
// To pin: GEN_GOLDEN_WRITE=1 node --test tests/unit/gen-fx-e1-effects.test.mjs (writes only files that do not exist).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';
import { stampPixels } from '../../engine/gen/args.js';
import { SHAPE_CAPS } from '../../engine/gen/args.js';
import { PortSurface, withPaintTable, shiftTo } from '../../engine/gen/port-surface.js';
import { portPhase } from '../../engine/gen/port-sprite.js';
import { render as explosionLargeRender } from '../../engine/gen/ports/e1/fx-explosion-large.js';

/** The effect ports E1 adds, each with the frame of the code sprite it was ported from. */
const EFFECTS = {
  shockwave: [64, 64], 'spawn-warp': [48, 48], 'fx-fire-spell': [64, 64], 'teleport-beam': [64, 64], 'fx-thunder-spell': [64, 96],
  'charge-up': [48, 48], 'hit-flash': [32, 32], 'guard-flash': [32, 32], 'fx-ice-spell': [64, 64], 'explosion-large': [96, 96],
  'muzzle-flash': [32, 32],   // review E1 round 2, issue 4
};
/** The box of the old frame a port gives as stamps when its frame is bigger than a frame's stamp cap: [x0, y0, x1, y1). */
const STAMP_BOX = { 'explosion-large': [3, 3, 93, 93] };

/** Three golden cases of an effect port: its first picture at the start, its last picture half way, and its first at the end with every setting at its far end (E2's effectCases). */
function effectCases(gen, size) {
  const pics = gen.args.picture.values, top = {}, mid = {};
  let n = 0;
  for (const [k, t] of Object.entries(gen.args)) {
    if (k === 'at') { top.at = mid.at = [size[0] / 2, size[1] / 2]; continue; }
    if (k === 'picture') continue;
    if (t.type === 'paint') { top[k] = mid[k] = `p${n++}`; continue; }
    if (t.type === 'word') { top[k] = t.values.at(-1); continue; }
    if (t.type === 'flag') { top[k] = !t.default; continue; }
    top[k] = t.hi;
  }
  const ctx = (frame, frames, loop) => ({ frame, frames, t: loop ? frame / frames : frame / Math.max(1, frames - 1), loop, size });
  return [
    { args: { ...mid, picture: pics[0] }, ctx: ctx(0, 8, true) },
    { args: { ...mid, picture: pics.at(-1) }, ctx: ctx(3, 8, true) },
    { args: { ...top, picture: pics[0] }, ctx: ctx(5, 8, true) },
  ];
}

for (const [id, size] of Object.entries(EFFECTS)) {
  test(`effect.${id}@1 passes the goldens harness and is priced at its frame (or its stamp box)`, () => {
    const gen = registry.generator(`effect.${id}`, 1);
    assert.ok(gen, `effect.${id}@1 is registered`);
    assert.equal(gen.family, 'fx');
    checkGeneratorContract(registry, gen, { cases: effectCases(gen, size) });
    const box = STAMP_BOX[id], want = box ? (box[2] - box[0]) * (box[3] - box[1]) : size[0] * size[1];
    assert.equal(registry.STAMP_BOUNDS[`effect.${id}@1`]({}, size), want);
    assert.ok(want <= SHAPE_CAPS.stampPixels, `${id}: ${want} stamp pixels fit a frame`);
    assert.deepEqual([...registry.SIZE_KEYS[`effect.${id}@1`]], []);
  });
}

/** Every pixel a call paints, stamps and rects alike: Map "x,y" -> paint (later over earlier). */
function painted(prims) {
  const m = new Map();
  for (const p of prims) {
    if (p.kind === 'stamp') p.rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') m.set(`${p.at[0] + i},${p.at[1] + j}`, JSON.stringify(p.key[ch])); }));
    else if (p.kind === 'rect') for (let y = 0; y < p.size[1]; y++) for (let x = 0; x < p.size[0]; x++) m.set(`${p.at[0] + x},${p.at[1] + y}`, JSON.stringify(p.paint));
    else assert.fail(`a ${p.kind}: an effect port gives stamps and whole-pixel rects only`);
  }
  return m;
}

test('effect.explosion-large@1 keeps its stamps to its middle 90 x 90 and gives what it paints round that as whole-pixel rects, the same pixels', () => {
  const gen = registry.generator('effect.explosion-large', 1);
  const [x0, y0, x1, y1] = STAMP_BOX['explosion-large'];
  let outside = 0;
  for (const size of [0, 0.5, 1]) for (const spread of [0, 1]) for (const style of gen.args.style.values) for (const picture of gen.args.picture.values) {
    const frames = picture === 'burst' ? 12 : 8, loop = picture !== 'burst';
    for (let frame = 0; frame < frames; frame++) {
      const call = { gen: 'effect.explosion-large', v: 1, at: [48, 48], picture, size, spread, style, pieces: 12, lobes: 9, soot: true, core: 'c', edge: 'e' };
      const r = registry.runGenerator(call, { size: [96, 96], frame, frames, loop, t: loop ? frame / frames : frame / (frames - 1) });
      assert.ok(r.ok, r.errors?.join('; '));
      const stamps = r.primitives.filter((p) => p.kind === 'stamp');
      assert.ok(stampPixels(stamps) <= (x1 - x0) * (y1 - y0), `${picture} ${frame}: ${stampPixels(stamps)} stamp pixels`);
      for (const s of stamps) assert.ok(s.at[0] >= x0 && s.at[1] >= y0 && s.at[0] + s.rows[0].length <= x1 && s.at[1] + s.rows.length <= y1, 'a stamp inside the box');
      for (const p of r.primitives.filter((q) => q.kind === 'rect')) {
        outside++;
        assert.equal(p.size[1], 1, 'a rect is one row');
        for (let i = 0; i < p.size[0]; i++) { const x = p.at[0] + i, y = p.at[1]; assert.ok(x < x0 || x >= x1 || y < y0 || y >= y1, `a rect pixel ${x},${y} outside the box`); }
      }
      // and every pixel is painted once: stamps and rects never overlap
      const n = r.primitives.reduce((s, p) => s + (p.kind === 'rect' ? p.size[0] : [...p.rows.join('')].filter((c) => c !== '.').length), 0);
      assert.equal(painted(r.primitives).size, n, `${picture} ${frame}: no pixel twice`);
    }
  }
  assert.ok(outside > 0, 'the big fireball reaches past the middle 90 x 90 somewhere, so the rects are used');
});

test('effect.explosion-large@1 moved by `at` moves its rects with its stamps', () => {
  const call = (at) => ({ gen: 'effect.explosion-large', v: 1, at, picture: 'burst', size: 1, spread: 1, style: 'fire', core: 'c', edge: 'e' });
  const ctx = { size: [96, 96], frame: 5, frames: 12, loop: false, t: 5 / 11 };
  const a = painted(registry.runGenerator(call([48, 48]), ctx).primitives), b = painted(registry.runGenerator(call([50, 47]), ctx).primitives);
  assert.equal(a.size, b.size);
  for (const [k, v] of a) { const [x, y] = k.split(',').map(Number); assert.equal(b.get(`${x + 2},${y - 1}`), v, k); }
});

test('effect.explosion-large@1 split into stamps and rects paints the very pixels of its unsplit picture, at every setting and frame', () => {
  // review E1 round 2, issue 3: the split must lose and move nothing. The reference is the ported render on its own
  // PortSurface (what portGenerator would have given as stamps, were the frame within the cap), read pixel by pixel;
  // every word and flag, each slider and count at its ends and middle, every frame of both pictures
  const gen = registry.generator('effect.explosion-large', 1), at = [50, 47];
  const vals = (k) => { const t = gen.args[k]; return t.type === 'count' ? [t.lo, Math.round((t.lo + t.hi) / 2), t.hi] : [0, 0.5, 1]; };
  let cases = 0, wrong = [];
  for (const picture of gen.args.picture.values) for (const style of gen.args.style.values) for (const soot of [false, true])
  for (const size of vals('size')) for (const spread of vals('spread')) for (const pieces of vals('pieces')) for (const lobes of vals('lobes')) {
    const frames = picture === 'burst' ? 12 : 8, loop = picture !== 'burst';
    const p = { at, picture, size, spread, pieces, lobes, style, soot, core: 'c', edge: 'e' };
    for (let frame = 0; frame < frames; frame++) {
      const r = registry.runGenerator({ gen: 'effect.explosion-large', v: 1, ...p }, { size: [96, 96], frame, frames, loop });
      assert.ok(r.ok, r.errors?.join('; '));
      // both as a flat 96 x 96 grid of paint refs (as JSON) in the frame the call drew into, `at` moving it by dx, dy
      const [dx, dy] = shiftTo(at, 48, 48), idx = (x, y) => (x - dx >= 0 && x - dx < 96 && y - dy >= 0 && y - dy < 96 ? (y - dy) * 96 + (x - dx) : -1);
      const got = new Array(96 * 96).fill(null);
      for (const q of r.primitives) {
        if (q.kind === 'stamp') {
          const key = Object.fromEntries(Object.entries(q.key).map(([ch, v]) => [ch, JSON.stringify(v)]));
          q.rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] !== '.') { const n = idx(q.at[0] + i, q.at[1] + j); if (n < 0) wrong.push(`a pixel off the frame`); else got[n] = key[row[i]]; } });
        } else {
          const v = JSON.stringify(q.paint);
          for (let i = 0; i < q.size[0]; i++) { const n = idx(q.at[0] + i, q.at[1]); if (n < 0) wrong.push(`a pixel off the frame`); else got[n] = v; }
        }
      }
      const want = withPaintTable(() => {
        const g = new PortSurface(96, 96);
        explosionLargeRender(g, { clip: picture, frame, frames, loop, t: portPhase(frame, frames, loop), p });
        const refs = new Map();
        return Array.from(g.data, (c) => { if (!c) return null; if (!refs.has(c)) refs.set(c, JSON.stringify(g.table.ref(c))); return refs.get(c); });
      });
      cases++;
      // the unsplit picture never paints the frame's 1 px border (which the split leaves out), and inside it the two agree
      let off = 0, border = 0;
      for (let n = 0; n < want.length; n++) {
        const x = n % 96, y = (n / 96) | 0;
        if (x === 0 || y === 0 || x === 95 || y === 95) { if (want[n] !== null) border++; continue; }
        if (got[n] !== want[n]) off++;
      }
      if (border && wrong.length < 5) wrong.push(`${JSON.stringify(p)} frame ${frame}: the unsplit picture paints ${border} border pixels`);
      if (off && wrong.length < 5) wrong.push(`${JSON.stringify(p)} frame ${frame}: ${off} pixels differ`);
    }
  }
  assert.deepEqual(wrong, []);
  assert.equal(cases, 2 * 3 * 2 * 81 * 10);
});
