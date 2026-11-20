// The first slice as data (docs/data-sprites.md section 9, row B8 and "First useful slice"): coin, crate and icons-food
// written as version 2 definitions (tests/fixtures/v2/pictures/, not sprites/ yet) that name only framework generators,
// drawn by engine/data-sprite.js with the site's registry, passing the quality bar (quality/sprite.js checkSprite) with
// no errors, and drawing what today's code sprites draw: the same clips, sounds, control keys and versions, and
// pictures that match the code sprite's frame for frame (redraws are allowed, so within a small share of pixels).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dataSprite } from '../../engine/data-sprite.js';
import { validateSprite } from '../../catalog/sprite-schema.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import { checkSprite } from '../../quality/sprite.js';
import coinCode from '../fixtures/code-sprites/coin.js';     // the code files as they were before P1 redrew them as data
import crateCode from '../fixtures/code-sprites/crate.js';
import iconsCode from '../fixtures/code-sprites/icons-food.js';

const load = (id) => JSON.parse(fs.readFileSync(new URL(`../fixtures/v2/pictures/${id}.json`, import.meta.url), 'utf8'));
const CODE = { coin: coinCode, crate: crateCode, 'icons-food': iconsCode };
const IDS = Object.keys(CODE);
const built = new Map();
const sprite = (id) => { if (!built.has(id)) built.set(id, dataSprite(load(id))); return built.get(id); };

/** The share of drawn pixels (in either frame) that have no drawn pixel within one pixel of them in the other frame. */
function apartBy1(a, b) {
  const on = (g, x, y) => x >= 0 && y >= 0 && x < g.w && y < g.h && (g.data[y * g.w + x] >>> 24) !== 0;
  let n = 0, miss = 0;
  for (const [p, q] of [[a, b], [b, a]]) for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    if (!on(p, x, y)) continue;
    n++;
    let hit = false;
    for (let j = -1; j <= 1 && !hit; j++) for (let i = -1; i <= 1; i++) if (on(q, x + i, y + j)) { hit = true; break; }
    if (!hit) miss++;
  }
  return n ? miss / n : 0;
}
/** How many pixels differ in colour or presence. */
const pixelsOff = (a, b) => a.data.reduce((n, v, i) => n + (v !== b.data[i] ? 1 : 0), 0);

test('each fixture is data the validator passes with the site\'s generators, naming only B8\'s and B2\'s', () => {
  for (const id of IDS) {
    const def = load(id);
    assert.equal(def.version, 2);
    assert.equal(JSON.stringify(def).includes('function'), false);
    const r = validateSprite(def);
    assert.deepEqual(r.errors, [], id);
    assert.ok(r.uses.length >= 2, `${id} names generators: ${r.uses.join(', ')}`);
  }
});

test('each fixture keeps its code sprite\'s id, clips, sounds, control keys and versions', () => {
  for (const id of IDS) {
    const s = sprite(id), old = CODE[id];
    assert.equal(s.id, old.id);
    assert.deepEqual(Object.keys(s.clips), Object.keys(old.clips), `${id} clips`);
    for (const [c, clip] of Object.entries(old.clips)) {
      assert.equal(s.clips[c].frames, clip.frames, `${id} ${c} frames`);
      assert.equal(!!s.clips[c].loop, !!clip.loop, `${id} ${c} loop`);
    }
    assert.deepEqual(Object.keys(s.params).sort(), Object.keys(old.params).sort(), `${id} control keys`);
    for (const [k, d] of Object.entries(old.params)) assert.equal(s.params[k].kind, d.kind, `${id} ${k} kind`);
    assert.deepEqual(Object.keys(s.sounds ?? {}).sort(), Object.keys(old.sounds ?? {}).sort(), `${id} sounds`);
    assert.deepEqual((s.versions ?? []).map((v) => v.name), (old.versions ?? []).map((v) => v.name), `${id} versions`);
    assert.equal(s.meta.type, old.meta.type);
  }
});

const SETTINGS = {
  coin: [{}, { size: 0 }, { size: 1, thickness: 1 }, { shape: 'octagon', emblem: 'hole' }, { shape: 'square', emblem: 'gem', rim: false }, { emblem: 'heart', pop: 1 }, { sparkle: false, bob: 0 }],
  crate: [{}, { style: 'barrel' }, { style: 'pot', mark: 'star' }, { size: 0, bands: false, mark: 'skull' }, { size: 1, pieces: 1, mark: 'leaf' }, { style: 'barrel', size: 1, pieces: 0 }],
  'icons-food': [{}, { tilt: false }, { size: 0, shade: false, shine: false }, { size: 1 }],
};
// Pixels allowed to differ in a frame: none where the port is exact; the crate's breaking frames draw its crumbs
// before the splinters (a few pixels), the egg is a 24-point polygon and the roast leg's highlight follows Shine.
const OFF = { coin: { spin: 0 }, crate: { idle: 0, hurt: 0, break: 12 }, 'icons-food': { any: 32 } };
// Redrawn on purpose: the coin's collect burst is the standard pickup burst (engine/pickups.js collectBurst), which
// leaves its three pixels when Sparkle is off too, where the coin drew one.
const REDRAWN = (id, set, clip, f) => id === 'coin' && set.sparkle === false && clip === 'collect' && f >= 6;

test('each fixture draws what its code sprite draws: every clip and frame at several settings, within a pixel', () => {
  for (const id of IDS) {
    const s = sprite(id), old = CODE[id];
    for (const set of SETTINGS[id]) {
      const pNew = { ...defaultParams(s), ...set }, pOld = { ...defaultParams(old), ...set };
      for (const [c, clip] of Object.entries(old.clips)) for (let f = 0; f < clip.frames; f++) {
        if (REDRAWN(id, set, c, f)) continue;
        const a = renderFrame(s, c, f, pNew), b = renderFrame(old, c, f, pOld);
        const d = apartBy1(a, b);
        assert.ok(d <= 0.01, `${id} ${c} ${f} at ${JSON.stringify(set)}: ${(100 * d).toFixed(1)}% of drawn pixels are more than a pixel from the code sprite's`);
        const cap = OFF[id][c] ?? OFF[id].any;
        if (cap !== undefined) assert.ok(pixelsOff(a, b) <= cap, `${id} ${c} ${f} at ${JSON.stringify(set)}: ${pixelsOff(a, b)} pixels differ (at most ${cap})`);
      }
    }
  }
});

test('the coin\'s spin and the crate\'s idle and hurt are the code sprite\'s pixels exactly, at their defaults', () => {
  const coin = sprite('coin'), crate = sprite('crate');
  const p = { ...defaultParams(coin), sparkle: false };
  for (let f = 0; f < 8; f++) {
    const a = renderFrame(coin, 'spin', f, p), b = renderFrame(coinCode, 'spin', f, { ...defaultParams(coinCode), sparkle: false });
    assert.ok(a.data.every((v, i) => v === b.data[i]), `coin spin ${f}`);
  }
  for (const [c, frames] of [['idle', 1], ['hurt', 4]]) for (let f = 0; f < frames; f++) {
    const a = renderFrame(crate, c, f, defaultParams(crate)), b = renderFrame(crateCode, c, f, defaultParams(crateCode));
    assert.ok(a.data.every((v, i) => v === b.data[i]), `crate ${c} ${f}`);
  }
});

for (const id of IDS) {
  test(`${id}: the quality bar passes with no errors`, () => {
    const r = checkSprite(sprite(id));
    assert.deepEqual(r.errors, [], `${id}: ${r.errors.join('\n')}`);
  });
}
