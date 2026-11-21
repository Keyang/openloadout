// B16b's proof: sprites/village-elder.js rebuilt from base:person-topdown@1 and the top-down part pieces only
// (tests/fixtures/v2/topdown/village-elder.json, made by tools/bake-topdown.mjs --elder, deleted in R2: the file is pinned
// data now). No drawing code: the definition names the base, the pieces and its own stamps; it passes the quality bar's
// checkSprite. Each part choice turns its piece on and off, each slider moves what it says, and every part piece draws
// inside the frame at the ends of its arguments.
// R2: the distance from the code elder (the frozen copy, the baker's sheet) and the comparison of its ids, meta, clips and
// control keys with the code sprite are deleted with the copy; sprites/village-elder.json is held to the old code by its
// redraw records (library-redraws, library-redraws-boxes), and the checks below are about the data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dataSprite, dataFrameList } from '../../engine/data-sprite.js';
import { renderList } from '../../engine/draw-list.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import { checkSprite } from '../../quality/sprite.js';
import { nodePieceStore } from '../../tools/lib/pieces-index.mjs';

const FIX = new URL('../fixtures/v2/topdown/village-elder.json', import.meta.url);
const def = JSON.parse(fs.readFileSync(FIX, 'utf8'));
const store = nodePieceStore();
// the code elder, its frozen copy once redrawn (T1)
let sprite = null;
async function elder() {
  if (sprite) return sprite;
  const r = await store.loadFor(def);
  assert.ok(r.ok, r.errors.join('; '));
  sprite = dataSprite(def, { pieces: store, strict: true });
  return sprite;
}

test('the elder is data on the base: it extends base:person-topdown-walker and names only pieces and stamps', () => {
  const text = fs.readFileSync(FIX, 'utf8');
  assert.ok(!/function|=>|import /.test(text));
  // the walker: the top-down person's rig with idle, walk and talk only (a villager who never fights; see the report)
  assert.deepEqual(def.body.rig.extends.use, 'base:person-topdown-walker');
  assert.equal(def.body.rig.bones, undefined, 'no bones of its own: the base is the body');
  const used = def.body.rig.shapes.filter((s) => s.kind === 'use').map((s) => s.use).sort();
  assert.deepEqual(used, ['held:topdown-cane', 'held:topdown-lantern', 'part:topdown-beard', 'part:topdown-belt', 'part:topdown-cap-peaked', 'part:topdown-circlet', 'part:topdown-hair-ring', 'part:topdown-hunch', 'part:topdown-robe']);
  for (const s of def.body.rig.shapes) assert.ok(['use', 'stamp'].includes(s.kind), `${s.id}: ${s.kind}`);
  // the base's own face is used as it is: no copies of base stamps (its talk keys swap the base's mouth and eyes)
  for (const id of ['eyeL', 'eyeR', 'mouth']) assert.ok(!def.body.rig.shapes.some((s) => s.id === id), id);
  assert.deepEqual(def.clips.talk, { from: 'talk' });
});

test('the elder passes checkSprite with no errors', async () => {
  const s = await elder();
  const r = checkSprite(s);
  assert.deepEqual(r.errors, [], r.errors.join('\n'));
});

const box = (g) => { let x0 = 99, y0 = 99, x1 = -1, y1 = -1, n = 0; for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.data[y * g.w + x]) { n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { w: x1 - x0 + 1, h: y1 - y0 + 1, x0, y0, x1, y1, n }; };
const VIEWS = ['idle_down', 'idle_up', 'idle_side'];

/** The pixels a sprite's items of one id (a `use`) paint at some settings, drawn alone. */
function own(s, clip, f, p, id) {
  const L = dataFrameList(s, clip, f, p);
  const items = L.list.filter((x) => x.id === id);
  if (!items.length) return null;
  return renderList(s.size[0], s.size[1], items, { palette: L.palette }).g;
}

test('each part choice turns its own piece on, and the other choices\' pieces off, facing every way', async () => {
  const s = await elder();
  const base = { ...defaultParams(s), held: 'none', beard: 'none', headgear: 'none' };
  const cases = [
    ['held', 'cane', ['cane'], ['lantern']], ['held', 'lantern', ['lantern'], ['cane']], ['held', 'none', [], ['cane', 'lantern']],
    ['beard', 'long', ['beard'], []], ['beard', 'short', ['beard'], []], ['beard', 'none', [], ['beard']],
    ['headgear', 'cap', ['cap'], ['circlet']], ['headgear', 'circlet', ['circlet'], ['cap']], ['headgear', 'none', [], ['cap', 'circlet']],
  ];
  // what each piece draws facing each way (the beard and the circlet's stone show nothing from behind)
  const faces = { cane: VIEWS, lantern: VIEWS, beard: ['idle_down', 'idle_side'], cap: VIEWS, circlet: VIEWS };
  for (const [key, value, on, offs] of cases) {
    const p = { ...base, [key]: value };
    for (const clip of VIEWS) {
      for (const id of on) if (faces[id].includes(clip)) { const g = own(s, clip, 0, p, id); assert.ok(g && box(g).n > 0, `${key} ${value}: ${id} draws in ${clip}`); }
      for (const id of offs) assert.equal(own(s, clip, 0, p, id), null, `${key} ${value}: ${id} is not drawn in ${clip}`);
    }
  }
});

test('every part piece draws inside the frame at the ends of its arguments, and its size slider sizes it the way it says', async () => {
  const s = await elder();
  const base = defaultParams(s);
  const sizes = [
    // control, its lowest and highest, the part shown, the piece's use id, how it must change from low to high
    ['beardLength', 0.65, 1.35, { beard: 'long' }, 'beard', 'taller'], ['beardLength', 0.65, 1.35, { beard: 'short' }, 'beard', 'taller'],
    ['headgearSize', 0.5, 1.8, { headgear: 'cap' }, 'cap', 'more'], ['headgearSize', 0.5, 1.8, { headgear: 'circlet' }, 'circlet', 'more'],
    ['heldSize', 0.65, 1.35, { held: 'cane' }, 'cane', 'more'], ['heldSize', 0.65, 1.35, { held: 'lantern' }, 'lantern', 'taller'],
    ['stoop', 0, 1, {}, 'hunch', 'more'],
  ];
  for (const [key, lo, hi, choice, id, how] of sizes) {
    for (const clip of VIEWS) {
      if ((id === 'beard' && clip === 'idle_up') || (id === 'hunch' && clip === 'idle_down')) continue;
      const a = own(s, clip, 0, { ...base, ...choice, [key]: lo }, id), b = own(s, clip, 0, { ...base, ...choice, [key]: hi }, id);
      assert.ok(b, `${key} ${hi}: ${id} draws in ${clip}`);
      const A = a ? box(a) : { n: 0, h: 0 }, Bx = box(b);
      for (const g of [a, b].filter(Boolean)) { const k = box(g); assert.ok(k.x0 >= 1 && k.y0 >= 1 && k.x1 <= g.w - 2 && k.y1 <= g.h - 2, `${id} at ${key} ${lo}/${hi} in ${clip}: inside the frame with room for the outline`); }
      if (how === 'taller') assert.ok(Bx.h > A.h, `${clip}: ${id} is taller at ${key} ${hi} (${Bx.h}) than at ${lo} (${A.h})`);
      else assert.ok(Bx.n > A.n, `${clip}: ${id} draws more at ${key} ${hi} (${Bx.n}) than at ${lo} (${A.n})`);
    }
  }
});

test('the body sliders move the body as their names say: Height, Build and Stoop', async () => {
  const s = await elder();
  const p = { ...defaultParams(s), held: 'none', headgear: 'none' };
  const at = (clip, o) => box(renderFrame(s, clip, 0, { ...p, ...o }));
  for (const clip of VIEWS) {
    const lo = at(clip, { height: 0 }), hi = at(clip, { height: 1 });
    assert.ok(hi.h - lo.h >= 5, `${clip}: Height moves the figure from ${lo.h} to ${hi.h} px tall (the code sprite: 25 to 32)`);
    assert.equal(lo.y1, hi.y1, `${clip}: the feet stay on the ground`);
    const st0 = at(clip, { stoop: 0 }), st1 = at(clip, { stoop: 1 });
    assert.ok(st0.h - st1.h >= 3, `${clip}: Stoop bends the figure from ${st0.h} to ${st1.h} px tall`);
  }
  for (const clip of ['idle_down', 'idle_up']) {
    const lo = at(clip, { build: 0 }), hi = at(clip, { build: 1 });
    assert.ok(hi.w - lo.w >= 2 && hi.n - lo.n >= 60, `${clip}: Build widens the figure from ${lo.w} to ${hi.w} px (${lo.n} to ${hi.n} pixels)`);
  }
});
