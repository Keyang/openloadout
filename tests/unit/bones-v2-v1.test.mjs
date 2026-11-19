// Bone rig v2 (rigs/bones.js, build item B5; docs/data-sprites.md 2.2 and section 9), part 1: version 1 rigs draw
// exactly as before. Since B5 the bone renderer hands its shapes to the shape-list renderer (engine/draw-list.js);
// every version 1 rig must still paint byte for byte what the renderer of 2026-11-19 painted, kept frozen in
// tests/fixtures/bones/bones-v1.mjs: every studio template (every clip, frame and slider end), the newt, the top-down
// beetle in its three directions, the studio fixtures, the maximal rig, a few hundred seeded random rigs, and the
// same definitions drawn the version 2 way (engine/resolve.js resolveSprite, then drawResolvedRig).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Surface } from '../../engine/surface.js';
import * as B from '../../rigs/bones.js';
import * as OLD from '../fixtures/bones/bones-v1.mjs';
import { studioTemplate, STUDIO_TEMPLATE_IDS } from '../../rigs/studio-templates.js';
import { validateDataSprite, framePose, drawOptions, directionRig, directionOf } from '../../engine/data-sprite.js';
import { resolveSprite } from '../../engine/resolve.js';

const load = (path) => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };
/** The old and the new renderer on the same rig, pose and options: the number of pixels that differ (0 wanted). */
function compare(rig, pose, opt) {
  const want = OLD.renderRig(rig, pose, opt).g, got = B.renderRig(rig, pose, opt).g;
  assert.equal(got.w, want.w);
  assert.equal(got.h, want.h);
  return diff(want, got);
}

/** Every rig-bodied definition worth holding: the templates, the newt, the beetle, every studio fixture that is a bone rig. */
function definitions() {
  const out = STUDIO_TEMPLATE_IDS.map((id) => [id, studioTemplate(id)]);
  out.push(['beetle', load('../fixtures/data-sprite/beetle-topdown.json')]);
  for (const f of fs.readdirSync(new URL('../fixtures/studio/', import.meta.url))) {
    if (!f.endsWith('.json')) continue;
    const j = load(`../fixtures/studio/${f}`);
    if (j?.body?.rig) out.push([f, j]);
  }
  return out;
}
/** Settings to try: defaults, every slider low, every slider high, every part off. */
function settingsOf(def) {
  const low = {}, high = {}, off = {};
  for (const c of def.controls ?? []) if (c.scales) { low[c.key] = c.min; high[c.key] = c.max; }
  for (const n of Object.keys(def.parts ?? {})) off[n] = false;
  return [{}, low, high, off];
}

test('bones v2, v1 unchanged: every version 1 definition, every clip, frame and slider end, paints byte for byte as before', () => {
  let frames = 0;
  const defs = definitions();
  assert.ok(defs.some(([n]) => n === 'newt.json') && defs.some(([n]) => n === 'beetle'), 'the newt and the beetle are held');
  for (const [name, raw] of defs) {
    const v = validateDataSprite(raw);
    assert.ok(v.ok, `${name}: ${v.errors.join('; ')}`);
    const def = v.value, rig = def.body.rig;
    for (const s of settingsOf(def)) {
      const opt = drawOptions(def, s);
      for (const [clip, c] of Object.entries(def.clips)) {
        const r = rig.view === 'top-down' ? directionRig(rig, directionOf(clip)) : rig;
        for (let f = 0; f < c.frames; f++) {
          assert.equal(compare(r, framePose(def, clip, f), opt), 0, `${name} ${JSON.stringify(s)} ${clip} frame ${f}`);
          frames++;
        }
      }
    }
  }
  assert.ok(frames > 1000, `${frames} frames compared`);
});

test('bones v2, v1 unchanged: the outline and flash options, nudge, show and hide paint as before', () => {
  const def = validateDataSprite(load('../fixtures/studio/newt.json')).value, rig = def.body.rig;
  const poses = [{}, { flash: true }, { nudge: [2, -1] }, { show: rig.shapes.map((s) => s.id) }, { hide: rig.shapes.slice(0, 3).map((s) => s.id) }, { root: [3, -2], stretch: { [rig.bones[0].id]: 1.4 } }];
  for (const pose of poses) for (const opt of [{}, { outline: false }, { outline: '#102030' }, { flash: true }, { partsOff: Object.keys(def.parts ?? {}) }]) {
    assert.equal(compare(rig, pose, { ...drawOptions(def, {}), ...opt }), 0, `${JSON.stringify(pose)} ${JSON.stringify(opt)}`);
  }
});

// ---- seeded random version 1 rigs -------------------------------------------------------------------------------

/** A small seeded random number source (mulberry32), so the rigs are the same every run. */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const COLOURS = [{ id: 'skin', default: '#4f9d57' }, { id: 'belly', default: '#e6c545' }, { id: 'eye', default: '#f0ead8', detail: true }, { id: 'glow', default: '#4fd8ee' }, { id: 'dark', default: '#3b2a4a' }];
function randomRig(seed) {
  const R = rng(seed), pick = (xs) => xs[Math.floor(R() * xs.length)], n = (lo, hi) => lo + R() * (hi - lo), w = (lo, hi) => Math.floor(n(lo, hi + 1));
  const size = pick([[32, 32], [48, 48], [64, 64], [32, 48], [64, 48]]);
  const bones = [];
  const nb = w(1, 12);
  for (let i = 0; i < nb; i++) {
    const parent = i === 0 || R() < 0.15 ? null : bones[w(0, i - 1)].id;
    const b = { id: `b${i}`, parent, angle: Math.round(n(-180, 360)), length: w(1, 14) };
    if (parent === null) b.at = [Math.round(n(4, size[0] - 4) * 2) / 2, Math.round(n(4, size[1] - 4) * 2) / 2];
    else if (R() < 0.5) b.from = Math.round(n(0, 1) * 10) / 10;
    if (R() < 0.3) { b.min = -w(0, 60); b.max = w(0, 60); }
    bones.push(b);
  }
  const shapes = [];
  const ns = w(1, 24);
  for (let i = 0; i < ns; i++) {
    const kind = pick(['limb', 'capsule', 'ellipse', 'poly', 'dot']);
    const s = { id: `s${i}`, bone: pick(bones).id, kind, paint: pick(COLOURS).id, z: w(-3, 6) };
    if (R() < 0.4) s.group = pick(['a', 'b']);
    if (R() < 0.15) s.far = true;
    if (R() < 0.1) s.glow = true;
    if (R() < 0.2) s.shade = pick([0, 1, 2, 1.5]);
    if (R() < 0.1) s.light = pick([0, 1, 0.5]);
    if (R() < 0.1) s.hidden = true;
    if (R() < 0.15) s.part = 'extra';
    if (kind === 'limb') s.width = w(1, 6);
    if (kind === 'capsule') Object.assign(s, { from: Math.round(n(0, 0.5) * 10) / 10, to: Math.round(n(0.5, 1) * 10) / 10, r: [Math.round(n(0, 6) * 2) / 2, Math.round(n(0, 6) * 2) / 2], ...(R() < 0.3 ? { offset: Math.round(n(-3, 3)) } : {}) });
    if (kind === 'ellipse') Object.assign(s, { at: [Math.round(n(-3, 10) * 2) / 2, Math.round(n(-4, 4) * 2) / 2], r: [Math.round(n(0.5, 7) * 2) / 2, Math.round(n(0.5, 7) * 2) / 2] });
    if (kind === 'poly') s.points = Array.from({ length: w(3, 8) }, () => [Math.round(n(-4, 12)), Math.round(n(-6, 6))]);
    if (kind === 'dot') Object.assign(s, { at: [Math.round(n(-2, 10) * 2) / 2, Math.round(n(-3, 3) * 2) / 2], size: pick([1, 2]) });
    shapes.push(s);
  }
  const ik = [];
  const chainable = bones.filter((b) => b.parent && bones.find((p) => p.id === b.parent));
  if (chainable.length && R() < 0.5) { const lower = pick(chainable); ik.push({ id: 'k', bones: [lower.parent, lower.id], bend: pick([1, -1]) }); }
  const points = [{ id: 'p', bone: pick(bones).id, at: [w(0, 6), w(-2, 2)], angle: w(-90, 90) }, { id: 'feet', ground: true }];
  return { size, colours: COLOURS, bones, shapes, ik, points };
}
function randomPose(rig, seed) {
  const R = rng(seed ^ 0x5bd1e995);
  const pose = {};
  if (R() < 0.6) { pose.bones = {}; for (const b of rig.bones) if (R() < 0.5) pose.bones[b.id] = Math.round(R() * 720 - 360); }
  if (R() < 0.4) pose.root = [Math.round(R() * 6 - 3), Math.round(R() * 6 - 3)];
  if (R() < 0.3) pose.nudge = [Math.round(R() * 4 - 2), Math.round(R() * 4 - 2)];
  if (R() < 0.3) { pose.stretch = {}; for (const b of rig.bones) if (R() < 0.3) pose.stretch[b.id] = 0.5 + R(); }
  if (R() < 0.3 && rig.ik.length) pose.ik = { k: [Math.round(R() * 8 - 4), -Math.round(R() * 6)] };
  if (R() < 0.3) pose.show = rig.shapes.filter(() => R() < 0.5).map((s) => s.id);
  if (R() < 0.3) pose.hide = rig.shapes.filter(() => R() < 0.2).map((s) => s.id);
  if (R() < 0.1) pose.flash = true;
  return pose;
}
function randomOpt(rig, seed) {
  const R = rng(seed ^ 0x27d4eb2f);
  const opt = {};
  if (R() < 0.4) opt.colours = { skin: '#c9423a', glow: '#ffe066' };
  if (R() < 0.3) opt.partsOff = ['extra'];
  if (R() < 0.4) { opt.scale = { bones: {}, shapes: {} }; for (const b of rig.bones) if (R() < 0.3) opt.scale.bones[b.id] = 0.5 + R() * 1.2; for (const s of rig.shapes) if (R() < 0.3) opt.scale.shapes[s.id] = 0.5 + R() * 1.2; }
  if (R() < 0.15) opt.outline = false;
  if (R() < 0.15) opt.outline = '#102030';
  if (R() < 0.2) opt.ground = Math.round(rig.size[1] - 2 - R() * 6);
  return opt;
}

test('bones v2, v1 unchanged: 1,500 seeded random version 1 rigs in random poses paint byte for byte as before', () => {
  let drawn = 0;
  for (let seed = 1; seed <= 1500; seed++) {
    const rig = randomRig(seed), pose = randomPose(rig, seed), opt = randomOpt(rig, seed);
    assert.equal(compare(rig, pose, opt), 0, `seed ${seed}`);
    if (OLD.renderRig(rig, pose, opt).g.data.some((v) => v)) drawn++;
  }
  assert.ok(drawn > 1100, `${drawn} of the rigs drew something`);
});

test('bones v2, v1 unchanged: broken version 1 data is still left out the same way (missing bones, slots, kinds, NaN)', () => {
  const rig = {
    size: [32, 32], colours: COLOURS,
    bones: [{ id: 'a', parent: null, at: [16, 16], angle: 90, length: 8 }, { id: 'b', parent: 'c', angle: 10, length: 4 }, { id: 'c', parent: 'a', angle: NaN, length: Infinity }],
    shapes: [{ id: 'x', bone: 'a', kind: 'ellipse', at: [4, 0], r: [3, 3], paint: 'skin' }, { id: 'y', bone: 'nope', kind: 'limb', width: 2, paint: 'skin' },
      { id: 'z', bone: 'a', kind: 'star', paint: 'skin' }, { id: 'w', bone: 'a', kind: 'poly', points: [[0, 0], [1, 1]], paint: 'skin' }, { id: 'v', bone: 'a', kind: 'dot', at: [1, 1], paint: 'nope' },
      null, 7, { id: 'u', bone: 'c', kind: 'capsule', r: [2], paint: 'belly' }],
  };
  assert.equal(compare(rig, {}, {}), 0);
  assert.equal(compare(rig, { bones: { a: 'x' }, root: [NaN, 2] }, { scale: { shapes: { x: NaN } } }), 0);
});

test('bones v2, v1 unchanged: the maximal version 1 rig (studio fixture) and attach points as before', () => {
  const def = validateDataSprite(load('../fixtures/studio/maximal.json')).value;
  const rig = def.body.rig;
  assert.equal(compare(rig, {}, drawOptions(def, {})), 0);
  for (const [name, raw] of definitions()) {
    const d = validateDataSprite(raw).value, r = d.body.rig;
    for (const clip of Object.keys(d.clips)) {
      const pose = framePose(d, clip, 1), opt = drawOptions(d, {});
      assert.deepEqual(B.rigPoints(r, B.solveRig(r, pose, opt)), OLD.rigPoints(r, OLD.solveRig(r, pose, opt)), `${name} ${clip}`);
    }
  }
});

// ---- the same definitions the version 2 way ---------------------------------------------------------------------------

test('bones v2, v1 unchanged: drawn the version 2 way (resolveSprite, then drawResolvedRig) every frame is the same', () => {
  let frames = 0;
  for (const [name, raw] of definitions()) {
    const def = validateDataSprite(raw).value;
    for (const s of settingsOf(def)) {
      const resolved = resolveSprite(raw, s);
      assert.equal(resolved.ok, true, `${name}: ${resolved.errors?.join('; ')}`);
      const opt = drawOptions(def, s);
      for (const [clip, c] of Object.entries(def.clips)) {
        const r = def.body.rig.view === 'top-down' ? directionRig(def.body.rig, directionOf(clip)) : def.body.rig;
        for (let f = 0; f < c.frames; f += 3) {
          const pose = framePose(def, clip, f);
          const want = OLD.renderRig(r, pose, opt).g;
          const got = new Surface(want.w, want.h);
          const out = B.drawResolvedRig(got, resolved, pose, { clip, frame: f, frames: c.frames });
          assert.deepEqual(out.errors, [], `${name} ${clip}`);
          assert.equal(diff(want, got), 0, `${name} ${JSON.stringify(s)} ${clip} frame ${f}`);
          assert.deepEqual(B.resolvedRigPoints(resolved, pose, { clip }), OLD.rigPoints(r, OLD.solveRig(r, pose, opt)), `${name} ${clip} points`);
          frames++;
        }
      }
    }
  }
  assert.ok(frames > 300, `${frames} frames compared`);
});

test('bones v2: rigFacing is directionRig for a version 1 rig, in every direction', () => {
  const def = validateDataSprite(load('../fixtures/data-sprite/beetle-topdown.json')).value;
  for (const id of STUDIO_TEMPLATE_IDS) {
    const rig = validateDataSprite(studioTemplate(id)).value.body.rig;
    for (const d of ['down', 'up', 'side', 'left', undefined]) assert.deepEqual(B.rigFacing(rig, d), directionRig(rig, d), `${id} ${d}`);
  }
  for (const d of ['down', 'up', 'side']) assert.deepEqual(B.rigFacing(def.body.rig, d), directionRig(def.body.rig, d));
});
