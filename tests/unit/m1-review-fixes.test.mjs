// M1 review fixes. 1: the pixel heart's stamps (sprites/heart.json, shape "pixel") carry the old code heart's tone bands,
// a shadow band down the left and along the lower steps and a light band along the top and right, not a checker of
// single light and dark pixels. A single pixel of one tone whose neighbours inside the heart are all other tones is an
// orphan (docs/style-guide.md); the old fill leaves at most 5 at a step corner, the checkered redraw left 12 to 22.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadDataSprite } from '../../tools/lib/assets.mjs';
import { defaultParams, renderFrame } from '../../engine/sprite.js';

const def = JSON.parse(fs.readFileSync(path.join(ROOT, 'sprites', 'heart.json'), 'utf8'));
const stamps = def.body.pictures.draw.filter((d) => d.kind === 'stamp' && /^pixel-\d+-/.test(d.id ?? ''));

/** Pixels of a stamp whose four neighbours inside the shape are all of another tone. */
function orphans(rows) {
  let n = 0;
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    if (c === '.') return;
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => rows[y + dy]?.[x + dx]).filter((v) => v && v !== '.');
    if (near.length && near.every((v) => v !== c)) n++;
  }));
  return n;
}

test('the pixel heart has a stamp per size, beat strength and shine, each with a beat variant', () => {
  assert.equal(stamps.length, 12);
  for (const s of stamps) {
    assert.ok(Array.isArray(s.variants?.beat), `${s.id} beat`);
    assert.deepEqual(s.when.shine, [!s.id.endsWith('-matt')], `${s.id} shine`);
  }
});

test('its tones are bands, not a checker: at most 5 orphan pixels a stamp, none without shine from 16 px wide', () => {
  for (const s of stamps) for (const [name, rows] of [['rows', s.rows], ['beat', s.variants.beat]]) {
    assert.ok(orphans(rows) <= 5, `${s.id} ${name}: ${orphans(rows)} orphan pixels`);
    if (s.id.endsWith('-matt') && !s.id.startsWith('pixel-6-')) assert.equal(orphans(rows), 0, `${s.id} ${name}`);
  }
});

test('the light tone appears only with shine on', () => {
  for (const s of stamps) {
    const lit = [...s.rows, ...s.variants.beat].join('').includes('c');
    assert.equal(lit, !s.id.endsWith('-matt'), s.id);
  }
});

// 2: the gem's collect keeps the code gem's anticipation: frame 1 squashed wide, frame 2 stretched tall, and frame 5 a
// small bare stone between the white flash and the sparkles (engine/pickups.js pickupPose), for every cut
/** The bounding box of the solid pixels inside the sprite's own body (the burst's sparkles kept out by a radius). */
function box(g, cx = 16, cy = 17, reach = 13) {
  let x0 = 99, x1 = -1, y0 = 99, y1 = -1;
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    if (!(g.data[y * g.w + x] >>> 24) || Math.abs(x - cx) > reach || Math.abs(y - cy) > reach) continue;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return { w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

test('the gem squashes wide on collect frame 1, stretches tall on frame 2 and shows a smaller stone on frame 5', async () => {
  const s = await loadDataSprite(ROOT, path.join(ROOT, 'sprites', 'gem.json'));
  for (const shape of ['diamond', 'emerald', 'round', 'shard']) for (const size of [0, 0.5, 1]) {
    const p = { ...defaultParams(s), shape, size, sparkle: false };
    const rest = box(renderFrame(s, 'collect', 0, p)), wide = box(renderFrame(s, 'collect', 1, p)), tall = box(renderFrame(s, 'collect', 2, p));
    const at = `${shape} at size ${size}`;
    assert.ok(wide.w > rest.w && wide.h < rest.h, `${at}: frame 1 ${JSON.stringify(wide)} is wider and lower than frame 0 ${JSON.stringify(rest)}`);
    assert.ok(tall.w < rest.w && tall.h > rest.h, `${at}: frame 2 ${JSON.stringify(tall)} is thinner and taller than frame 0 ${JSON.stringify(rest)}`);
  }
  // frame 5 (the burst's sparkles are already out there, so read it from the data): a smaller stone of the same cut, bare
  const def = JSON.parse(fs.readFileSync(path.join(ROOT, 'sprites', 'gem.json'), 'utf8'));
  const items = new Map(def.body.pictures.draw.filter((d) => d.id).map((d) => [d.id, d]));
  const shown = def.clips.collect.frameEdits['5'].show.map((id) => items.get(id));
  assert.equal(shown.length, 4);
  for (const d of shown) {
    const rest = items.get(`stone-${d.cut}`);
    assert.equal(d.hidden, true, d.id);
    assert.equal(d.facets, false, `${d.id} is bare`);
    for (const i of [0, 1]) for (const e of [0, 1]) assert.ok(d.r[i].map[e][1] < rest.r[i].map[e][1] * 0.75, `${d.id}: smaller than stone-${d.cut}`);
  }
});
