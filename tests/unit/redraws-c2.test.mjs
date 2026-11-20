// Migration batch C2: the six bugs and beasts (crawler-bug, spitter-bug, thorn-beetle, swarm-mite, hive-mother,
// ember-wyrm) redrawn as data files, sprites/<id>.json, each one call of its creature port (engine/gen/creatures.js).
// What tests/unit/library-redraws.test.mjs holds for every redraw (name, meta, clips, sound cues, controls, the quality
// bar) it holds for these through their records in tests/fixtures/redraws/. Here:
//   - each draws what its code sprite drew, pixel for pixel, at every case of its C2 record (tests/helpers/c2-cases.mjs:
//     why these cases and not every mix), written by tools/redraw-pixels-c2.mjs from the code sprite before its deletion,
//     and no case's frame touches the frame's edge (the edge sweep kept as a test: a box record's digits stop at 62 px,
//     and the queen's and the wyrm's frames are 96 and 128 px; the code drew the same pixels, so none touched there either);
//   - its attach points are where the code's sockets() put them on every frame of every clip (CREATURE_POINTS runs the
//     code's sockets() on the port), to within 0.02 px and 0.002 radians, at the defaults, Size 0 and 1, every slider
//     low and every slider high, and each option of each choice: the data file names its port's points motion
//     (<port>.points@1, engine/gen/creatures.js), which moves one empty node per socket there each frame;
//   - its body is one generator call, drawn in every clip, naming the newest version, bound to the code's controls.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, librarySprite, librarySpriteFile } from '../helpers/library.mjs';
import { c2Cases } from '../helpers/c2-cases.mjs';
import { casesKey } from '../helpers/redraw-pixels.mjs';
import { caseBox, touchesEdge } from '../helpers/redraw-boxes.mjs';
import { defaultParams, cleanParams } from '../../engine/sprite.js';
import { CREATURE_POINTS } from '../../engine/gen/creatures.js';

const IDS = ['crawler-bug', 'spitter-bug', 'thorn-beetle', 'swarm-mite', 'hive-mother', 'ember-wyrm'];
const GEN = { 'crawler-bug': 'bug.crawler', 'spitter-bug': 'bug.spitter', 'thorn-beetle': 'bug.beetle', 'swarm-mite': 'bug.mite', 'hive-mother': 'bug.queen', 'ember-wyrm': 'beast.quadruped' };
const DIR = path.join(ROOT, 'tests', 'fixtures', 'redraw-pixels-c2');
const defOf = (id) => JSON.parse(fs.readFileSync(path.join(ROOT, 'sprites', `${id}.json`), 'utf8'));

test('each C2 sprite is a data file with a C2 pixel record and a redraw record', () => {
  assert.deepEqual(fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort(), IDS.map((id) => `${id}.json`).sort());
  for (const id of IDS) {
    assert.equal(librarySpriteFile(id), `sprites/${id}.json`, id);
    assert.ok(fs.existsSync(path.join(ROOT, 'tests', 'fixtures', 'redraws', `${id}.json`)), `${id}: redraw record`);
  }
});

test('each body is one call of its creature port, in every clip, bound to the code\'s controls', () => {
  for (const id of IDS) {
    const def = defOf(id), draw = def.body.pictures.draw;
    assert.equal(draw.length, 1, id);
    const [call] = draw;
    assert.equal(call.gen, GEN[id], id); assert.equal(call.v, 1, id);
    assert.equal(call.clip, undefined, `${id}: drawn in every clip`);
    assert.equal(call.picture, undefined, `${id}: the picture is the clip being drawn`);
    // every control but speed reaches the call: a setting by its own key (the glow colour as lit), a colour as its slot
    for (const c of def.controls) {
      if (c.key === 'speed') continue;
      const arg = c.key === 'glow' ? 'lit' : c.key;
      if (c.kind === 'colour') assert.equal(call[arg], c.key, `${id} ${c.key}`);
      else assert.equal(call[arg].from, c.key, `${id} ${c.key}`);
    }
  }
});

for (const id of IDS) {
  test(`${id} draws every case of its C2 record as its code sprite did`, { timeout: 600_000 }, async () => {
    const rec = JSON.parse(fs.readFileSync(path.join(DIR, `${id}.json`), 'utf8'));
    const sprite = await librarySprite(id);
    const cases = c2Cases(sprite);
    assert.equal(cases.length, rec.cases, `${id}: the cases its controls and clips give`);
    assert.equal(casesKey(cases), rec.casesKey, `${id}: the same cases in the same order`);
    const want = rec.frames.split(' '), bad = [], edge = [];
    cases.forEach((c, i) => {
      const { box, hash } = caseBox(sprite, c);   // the frame's hash (as c2Hash) and its painted box
      if (hash !== want[i]) bad.push(`${c.clip} f${c.frame} ${JSON.stringify(c.params)}`);
      if (touchesEdge(box, sprite.size)) edge.push(`${c.clip} f${c.frame} ${JSON.stringify(c.params)}`);
    });
    assert.deepEqual(bad.slice(0, 10), [], `${id}: ${bad.length} of ${cases.length} frames differ`);
    assert.deepEqual(edge.slice(0, 10), [], `${id}: ${edge.length} of ${cases.length} frames touch the frame's edge`);
  });
}

/** The settings the attach points are checked at (controls: the data file's): the defaults, Size 0 and 1, every slider at its low end and at its high end, and each option of each choice (the rest at defaults). */
function pointSettings(sprite, controls) {
  const base = cleanParams(sprite, defaultParams(sprite)), out = [base];
  const ranges = controls.filter((c) => c.kind === 'range' && c.key !== 'speed');
  const ends = (c) => [c.min ?? 0, c.max ?? 1];
  if (ranges.some((c) => c.key === 'size')) for (const v of [0, 1]) out.push(cleanParams(sprite, { ...base, size: v }));
  for (const e of [0, 1]) out.push(cleanParams(sprite, { ...base, ...Object.fromEntries(ranges.map((c) => [c.key, ends(c)[e]])) }));
  for (const c of controls) if (c.kind === 'choice') for (const o of c.options) if (o !== base[c.key]) out.push(cleanParams(sprite, { ...base, [c.key]: o }));
  for (const c of controls) if (c.kind === 'toggle') out.push(cleanParams(sprite, { ...base, [c.key]: !base[c.key] }));
  return out;
}

test('each attach point is where the code\'s sockets() put it, on every frame, as the settings move', async () => {
  for (const id of IDS) {
    const sprite = await librarySprite(id), def = defOf(id);
    const key = `${GEN[id]}@1`;
    if (!CREATURE_POINTS[key]) { assert.equal(def.body.pictures.motion, undefined, `${id}: the code had no sockets`); continue; }
    const [motion] = def.body.pictures.motion;
    assert.equal(motion.gen, `${GEN[id]}.points`, id); assert.deepEqual(motion.at, def.pivot, id);
    for (const q of def.points) {
      assert.deepEqual(q, { id: q.id, on: q.id, at: [0, 0] }, `${id}: point ${q.id} sits on the node of its name`);
      assert.ok(def.body.pictures.nodes.some((nd) => nd.id === q.id && nd.parent === null && nd.at[0] === 0 && nd.at[1] === 0), `${id}: ${q.id} is an empty node at [0, 0]`);
    }
    assert.ok(Object.values(def.clips).every((c) => !c.keys), `${id}: no clip keys the points (the motion moves them)`);
    let n = 0;
    for (const p of pointSettings(sprite, def.controls)) {
      const args = Object.fromEntries(Object.entries(def.body.pictures.draw[0]).filter(([k]) => !['id', 'gen', 'v', 'on'].includes(k)).map(([k, v]) => {
        if (v && typeof v === 'object' && !Array.isArray(v) && v.from) return [k, v.pick ? v.pick[String(p[v.from])] : typeof p[v.from] === 'boolean' ? p[v.from] : Number(p[v.from])];
        return [k, v];
      }));
      args.at = def.pivot; args.picture = 'clip';
      for (const [clip, c] of Object.entries(sprite.clips)) for (let f = 0; f < c.frames; f++) {
        const t = c.loop ? f / c.frames : c.frames > 1 ? f / (c.frames - 1) : 0;
        const want = CREATURE_POINTS[key](args, { clip, frame: f }), got = sprite.sockets(clip, t, p);
        const at = `${id} ${clip} ${f} ${JSON.stringify(p)}`;
        assert.deepEqual(Object.keys(got).sort(), Object.keys(want).sort(), at);
        assert.deepEqual(def.points.map((q) => q.id).sort(), Object.keys(want).sort(), at);
        for (const k of Object.keys(want)) {
          assert.ok(Math.hypot(got[k].x - want[k].x, got[k].y - want[k].y) <= 0.02, `${at} ${k}: ${JSON.stringify(got[k])} against ${JSON.stringify(want[k])}`);
          const da = Math.abs(got[k].angle - want[k].angle) % (2 * Math.PI);
          assert.ok(Math.min(da, 2 * Math.PI - da) <= 0.002, `${at} ${k}: angle ${got[k].angle} against ${want[k].angle}`);
          n++;
        }
      }
    }
    assert.ok(n > 0, id);
  }
});
