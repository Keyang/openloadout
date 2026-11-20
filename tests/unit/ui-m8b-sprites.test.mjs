// Migration batch M8b (review M8 round 3): the last interface skin sets redrawn as data, sprites/<id>.json: the neon
// bars (their slider rail lit as the code's neon tube, not inverted), the RPG bars (three ready-made versions again) and
// the seven control sets ui-controls-{candy,crystal,flat,gilded,grove,neon,paper} (on ui.toggle@2, ui.pointer@2 and
// ui.selector@2, engine/gen/ui-skin.js). Held to here:
//   - every export is the code's: per setting (each control moved off its default) and clip, the stretch (border, rect,
//     opening, tile), the text areas and every frame's sockets, the pointer's moving `tip` included
//     (tests/fixtures/m8b-exports.json, frozen from the code sprites before the redraw)
//   - the quality bar passes with no errors and no warnings (the neon bars' Forest-look warning of round 3 is gone)
//   - the neon rail is the code's lit tube at the middle column: ink, the tube's dark tone (Glow) or the tube, the light
//     core twice, again, ink; the neon fills are flat as the code's (no gloss row)
//   - the RPG bars get at least three ready-made versions, with no FEW_VERSIONS exception
//   - the controls' clips carry no text (noText) and the pointer has its tip socket
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadDataSprite } from '../../tools/lib/assets.mjs';
import { defaultParams, cleanParams, clipStretch, frameSockets, renderFrame } from '../../engine/sprite.js';
import { checkSprite } from '../../quality/sprite.js';
import { versionsOf } from '../../engine/versions.js';

const FROZEN = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'm8b-exports.json'), 'utf8')).sprites;
const IDS = Object.keys(FROZEN);
const CONTROLS = IDS.filter((id) => id.startsWith('ui-controls-'));
const sprites = new Map();
for (const id of IDS) sprites.set(id, await loadDataSprite(ROOT, path.join(ROOT, 'sprites', `${id}.json`)));
const r2 = (v) => JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'number' ? Math.round(x * 100) / 100 : x)));
const hexAt = (g, x, y) => { const v = g.get(x, y); return v >>> 24 ? `#${[0, 8, 16].map((s) => ((v >>> s) & 255).toString(16).padStart(2, '0')).join('')}` : null; };

test('M8b covers the nine sets: the neon and RPG bars and the seven control sets', () => {
  assert.deepEqual(IDS, ['ui-bars-neon', 'ui-bars-rpg', ...['candy', 'crystal', 'flat', 'gilded', 'grove', 'neon', 'paper'].map((f) => `ui-controls-${f}`)]);
});

test('each exports what its code sprite exported: stretch, text areas and sockets at every setting one move from the defaults', () => {
  const faults = [];
  for (const id of IDS) {
    const s = sprites.get(id);
    for (const row of FROZEN[id]) {
      const p = cleanParams(s, { ...defaultParams(s), ...row.set });
      const text = typeof s.textArea === 'function' && !s.clips[row.clip]?.noText ? s.textArea(row.clip, p) ?? null : null;
      const got = { stretch: r2(clipStretch(s, row.clip, p)), text: r2(text), sockets: r2(Array.from({ length: s.clips[row.clip].frames }, (_, f) => frameSockets(s, row.clip, f, p))) };
      for (const k of ['stretch', 'text', 'sockets']) if (JSON.stringify(got[k]) !== JSON.stringify(row[k])) faults.push(`${id} ${JSON.stringify(row.set)} ${row.clip} ${k}: ${JSON.stringify(got[k])} (code: ${JSON.stringify(row[k])})`);
    }
  }
  assert.deepEqual(faults, []);
});

test('each passes the quality bar with no errors and no warnings', () => {
  for (const id of IDS) {
    const r = checkSprite(sprites.get(id));
    const say = (l) => (l ?? []).map((w) => (typeof w === 'string' ? w : w.message ?? JSON.stringify(w)));
    assert.deepEqual(say(r.errors), [], `${id} errors`);
    assert.deepEqual(say(r.warnings), [], `${id} warnings`);
  }
});

test('the neon slider rail is the code\'s lit tube, not inverted, and the neon fills are flat', () => {
  const s = sprites.get('ui-bars-neon');
  const col = (p) => { const g = renderFrame(s, 'slider', 0, cleanParams(s, { ...defaultParams(s), ...p })); return Array.from({ length: 6 }, (_, j) => hexAt(g, 32, 5 + j)); };
  // the code's column at x = 32 (frozen from sprites/ui-bars-neon.js): Glow on, then off
  assert.deepEqual(col({}), ['#231b33', '#5181bb', '#b1f7ff', '#b1f7ff', '#5181bb', '#231b33']);
  assert.deepEqual(col({ halo: false }), ['#231b33', '#8fd0f0', '#b1f7ff', '#b1f7ff', '#8fd0f0', '#231b33']);
  // the second tube (double): the lower half of the core in the accent
  assert.deepEqual(col({ style: 'double' }).slice(2, 4), ['#b1f7ff', '#e08a2c']);
  for (const clip of ['fill', 'fill-b', 'fill-c']) {
    const g = renderFrame(s, clip, 0, defaultParams(s)), seen = new Set();
    for (let y = 0; y < 16; y++) for (let x = 0; x < 64; x++) { const h = hexAt(g, x, y); if (h) seen.add(h); }
    assert.equal(seen.size, 1, `${clip}: one flat colour, as the code's (${[...seen]})`);
  }
});

test('the RPG bars get at least three ready-made versions', () => {
  const list = versionsOf(sprites.get('ui-bars-rpg'), 12);
  assert.ok(list.length >= 3, list.map((v) => v.name).join(', '));
});

test('the control sets: no clip carries text, the pointer has its tip socket, and they name the second versions', () => {
  for (const id of CONTROLS) {
    const s = sprites.get(id);
    for (const [c, clip] of Object.entries(s.clips)) assert.equal(clip.noText, true, `${id} ${c}`);
    const tips = Array.from({ length: 8 }, (_, f) => frameSockets(s, 'pointer', f, defaultParams(s)).tip.x);
    assert.deepEqual(tips, [24, 25, 25, 25, 24, 23, 23, 23], id);
    const body = JSON.stringify(s.definition?.body ?? JSON.parse(fs.readFileSync(path.join(ROOT, 'sprites', `${id}.json`), 'utf8')).body);
    for (const [g, v] of [['ui.toggle', 2], ['ui.pointer', 2], ['ui.selector', 2]]) assert.ok(body.includes(`"gen":"${g}","v":${v}`), `${id} names ${g}@${v}`);
  }
});
