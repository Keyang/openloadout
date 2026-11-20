// Migration batch M2, review round 1: every M2 pickup's collect clip really collects it. Each sprite is drawn with its
// emitters taken out (the burst is not the body), for every version and every option of its shape choice: the body is
// there at the start, smaller after the white flash than at the start, never grows again after the flash, and is gone
// by the last frame. A second test proves the first has teeth: the same sprites with `collect: false` written on every
// call of an M2 generator keep a body on the last frame, which the first test would fail.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, loadDataSprite } from '../../tools/lib/assets.mjs';
import { cleanParams, renderFrame } from '../../engine/sprite.js';

/** The ten pickups of batch M2. */
const M2 = ['hourglass', 'keycard', 'meal', 'potion', 'power-orb', 'scroll', 'shield-cell', 'star-charm', 'trophy', 'xp-shard'];
/** The generators of engine/gen/prize-items.js that have a collect pose. */
const POSED = new Set(['timepiece', 'trophy', 'potion.bottle', 'meal', 'scroll', 'keycard', 'xp.shard', 'shield.cell', 'star.charm', 'power.orb']);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-m2-collect-'));
const solid = (g) => g.data.filter((v) => v >>> 24).length;

/** Every generator call in a definition, the objects themselves. */
function callsOf(x, out = []) {
  if (Array.isArray(x)) for (const v of x) callsOf(v, out);
  else if (x && typeof x === 'object') { if (typeof x.gen === 'string') out.push(x); for (const v of Object.values(x)) callsOf(v, out); }
  return out;
}

/** The sprite id drawn from its data file with its emitters out, and `edit` run on the definition first. */
async function bodyOnly(id, edit = () => {}) {
  const def = JSON.parse(fs.readFileSync(path.join(ROOT, 'sprites', `${id}.json`), 'utf8'));
  for (const body of Object.values(def.body)) if (body && typeof body === 'object') delete body.emitters;
  for (const c of Object.values(def.clips)) for (const k of c.keys ?? []) delete k.emit;   // and the keys that fire them
  edit(def);
  const file = path.join(TMP, `${id}.json`);
  fs.writeFileSync(file, JSON.stringify(def));
  return { sprite: await loadDataSprite(ROOT, file), def };
}

/** The settings to look at: every version, and every option of the shape choice at the defaults. */
function settingsOf(s) {
  const out = (s.versions ?? []).map((v) => ({ label: `version ${v.name}`, params: cleanParams(s, v.params) }));
  const shape = s.params.shape;
  if (shape?.kind === 'choice') for (const o of shape.options) out.push({ label: `shape ${o.value}`, params: cleanParams(s, { shape: o.value }) });
  if (!out.length) out.push({ label: 'defaults', params: cleanParams(s, {}) });
  return out;
}

/** The flash frame of a clip (its frame edit with `flash`). */
const flashOf = (def, clip) => Number(Object.entries(def.clips[clip].frameEdits ?? {}).find(([, e]) => e.flash)?.[0]);

test('every M2 pickup\'s body shrinks after the flash and is gone by the last frame of its collect clip, at every version and shape', async () => {
  for (const id of M2) {
    const { sprite: s, def } = await bodyOnly(id);
    const clip = 'collect', n = s.clips[clip].frames, flash = flashOf(def, clip);
    assert.equal(s.clips[clip].loop, false, `${id}: collect is one-shot`);
    assert.ok(flash > 0 && flash < n - 1, `${id}: a flash frame before the end`);
    for (const { label, params } of settingsOf(s)) {
      const sizes = Array.from({ length: n }, (_, f) => solid(renderFrame(s, clip, f, params)));
      const at = `${id} ${label}: ${sizes.join(' ')}`;
      assert.ok(sizes[0] > 12, `${at}: the body is there at the start`);
      assert.ok(sizes[flash + 1] < sizes[0], `${at}: smaller after the flash than at the start`);
      for (let f = flash + 2; f < n; f++) assert.ok(sizes[f] <= sizes[f - 1], `${at}: frame ${f} does not grow again`);
      assert.equal(sizes[n - 1], 0, `${at}: gone by the last frame, apart from the burst`);
    }
  }
});

test('the check has teeth: with collect: false on every M2 generator call, a body is left on the last frame', async () => {
  for (const id of M2) {
    const { sprite: s } = await bodyOnly(id, (def) => { for (const c of callsOf(def)) if (POSED.has(c.gen)) c.collect = false; });
    const n = s.clips.collect.frames;
    assert.ok(solid(renderFrame(s, 'collect', n - 1, cleanParams(s, {}))) > 0, `${id}: collect: false leaves the body`);
  }
});
