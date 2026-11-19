// engine/draw-list.js, part 6: rigs/bones.js can hand its shapes to this renderer (build-plan row B5 will do it; this
// file proves it can be done byte for byte). The adapter below is test code: it places each v1 shape on its solved bone
// with boneFrame + placeOn, exactly as rigs/bones.js placeShape does, and the draw list must then paint what drawRig paints,
// for every studio template, every clip and every frame, and for a rig with glow, far shapes, dots in a body and a flash.
import test from 'node:test';
import assert from 'node:assert/strict';
import { INK } from '../../engine/color.js';
import { Surface } from '../../engine/surface.js';
import * as B from '../../rigs/bones.js';
import { studioTemplate, STUDIO_TEMPLATE_IDS } from '../../rigs/studio-templates.js';
import { validateDataSprite, framePose, drawOptions } from '../../engine/data-sprite.js';
import * as D from '../../engine/draw-list.js';

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const ids = (v) => (v instanceof Set ? v : new Set(Array.isArray(v) ? v : v && typeof v === 'object' ? Object.keys(v).filter((k) => v[k]) : []));

/** A v1 rig's shapes for one pose as a draw list in frame coordinates (what B5 will write inside rigs/bones.js). */
function rigToList(rig, J, pose, opt) {
  const palette = {};
  for (const c of rig.colours ?? []) palette[c.id] = { hex: opt.colours?.[c.id] ?? c.default, detail: !!c.detail };
  const shown = ids(pose.show), hidden = ids(pose.hide), off = ids(opt.partsOff), scaleS = opt.scale?.shapes ?? {};
  const list = [];
  for (const s of rig.shapes ?? []) {
    const Bn = J.bones[s.bone];
    if (!Bn || !palette[s.paint]) continue;
    if (hidden.has(s.id) || (s.hidden && !shown.has(s.id)) || (s.part && off.has(s.part))) continue;
    const k = clamp(num(scaleS[s.id], 1), 0.1, 4), F = D.boneFrame(Bn.start, Bn.angle), L = Bn.length, uk = Bn.k;
    const common = { id: s.id, paint: s.paint, z: clamp(num(s.z, 0), -100, 100), group: s.group, glow: s.glow, far: s.far, shade: s.shade, light: s.light };
    let p;
    if (s.kind === 'limb') p = { kind: 'limb', from: [0, 0], to: [L, 0], width: Math.max(1, Math.round(num(s.width, 1) * k)) };
    else if (s.kind === 'capsule') {
      const r = Array.isArray(s.r) ? s.r : [], off2 = num(s.offset, 0);
      p = { kind: 'capsule', from: [clamp(num(s.from, 0), 0, 1) * L, off2], to: [clamp(num(s.to, 1), 0, 1) * L, off2], r: [clamp(num(r[0], 1), 0, 32) * k, clamp(num(r[1], num(r[0], 1)), 0, 32) * k] };
    } else if (s.kind === 'ellipse') {
      const r = Array.isArray(s.r) ? s.r : [];
      p = { kind: 'ellipse', at: [s.at[0] * uk, s.at[1]], r: [clamp(num(r[0], 1), 0.01, 32) * k, clamp(num(r[1], num(r[0], 1)), 0.01, 32) * k] };
    } else if (s.kind === 'poly') {
      let pts = s.points.slice(0, 24).map(([u, v]) => [u * uk, v]);
      if (pts.length < 3) continue;
      if (k !== 1) { const cu = pts.reduce((a, q) => a + q[0], 0) / pts.length, cv = pts.reduce((a, q) => a + q[1], 0) / pts.length; pts = pts.map(([u, v]) => [cu + (u - cu) * k, cv + (v - cv) * k]); }
      p = { kind: 'poly', points: pts };
    } else if (s.kind === 'dot') p = { kind: 'dot', at: [s.at[0] * uk, s.at[1]], size: num(s.size, 1) >= 2 ? 2 : 1 };
    else continue;
    list.push(D.placeOn({ ...common, ...p }, F));
  }
  if (pose.flash || opt.flash) list.push({ kind: 'tint', paint: '#ffffff' });
  if (opt.outline !== false) list.push({ kind: 'outline', paint: 'ink' });
  return { list, palette };
}

function both(rig, pose, opt) {
  const want = B.renderRig(rig, pose, opt).g;
  const J = B.solveRig(rig, pose, opt);
  const { list, palette } = rigToList(rig, J, pose, opt);
  const got = new Surface(want.w, want.h);
  const out = D.drawList(got, list, { palette });
  assert.deepEqual(out.skipped, []);
  return { want, got };
}
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };

test('draw-list + bones: every studio template, every clip, every frame paints byte for byte as drawRig', () => {
  let frames = 0;
  for (const id of STUDIO_TEMPLATE_IDS) {
    const v = validateDataSprite(studioTemplate(id));
    assert.ok(v.ok, `${id}: ${v.errors.join('; ')}`);
    const def = v.value, rig = def.body.rig, opt = drawOptions(def, {});
    for (const [clip, c] of Object.entries(def.clips)) for (let f = 0; f < c.frames; f++) {
      const { want, got } = both(rig, framePose(def, clip, f), opt);
      assert.equal(diff(want, got), 0, `${id} ${clip} frame ${f}`);
      frames++;
    }
  }
  assert.ok(frames > 100, `${frames} frames compared`);
});

test('draw-list + bones: glow, far, dots inside a body, flash, hidden and shown shapes, scaled shapes', () => {
  const rig = {
    size: [48, 48],
    colours: [{ id: 'skin', default: '#4f9d57' }, { id: 'eye', default: '#f0ead8', detail: true }, { id: 'glow', default: '#4fd8ee' }],
    bones: [{ id: 'body', parent: null, at: [22, 30], angle: 100, length: 12 }, { id: 'head', parent: 'body', angle: -25, length: 7 },
      { id: 'leg', parent: 'body', from: 0.2, angle: -80, length: 7 }, { id: 'leg2', parent: 'leg', angle: 30, length: 6 }],
    shapes: [
      { id: 'torso', bone: 'body', kind: 'capsule', from: 0, to: 1, r: [5, 4], paint: 'skin', z: 10, group: 'b' },
      { id: 'skull', bone: 'head', kind: 'ellipse', at: [3, 1], r: [4.5, 3.5], paint: 'skin', z: 10, group: 'b', shade: 2, light: 1 },
      { id: 'nub', bone: 'head', kind: 'dot', at: [6, -2], size: 2, paint: 'skin', z: 10, group: 'b' },
      { id: 'fin', bone: 'body', kind: 'poly', points: [[2, 3], [8, 9], [10, 3]], paint: 'skin', z: 9, far: true },
      { id: 'leg1', bone: 'leg', kind: 'limb', width: 2, paint: 'skin', z: 8, far: true },
      { id: 'leg2', bone: 'leg2', kind: 'limb', width: 3, paint: 'skin', z: 8 },
      { id: 'eye', bone: 'head', kind: 'dot', at: [4, 1.5], paint: 'eye', z: 20 },
      { id: 'shut', bone: 'head', kind: 'dot', at: [4, 0.5], paint: 'eye', z: 21, hidden: true },
      { id: 'orb', bone: 'head', kind: 'ellipse', at: [9, 3], r: [2.5, 2.5], paint: 'glow', z: 30, glow: true },
      { id: 'spark', bone: 'body', kind: 'dot', at: [14, -5], paint: 'glow', z: 30, glow: true } ],
  };
  const poses = [{}, { bones: { head: 10 }, root: [1, -2] }, { flash: true }, { show: ['shut'], hide: ['eye'] }, { nudge: [2, 1], stretch: { body: 1.3 } }];
  for (const pose of poses) for (const opt of [{}, { scale: { shapes: { skull: 1.3, leg2: 1.4, fin: 0.8 }, bones: { body: 1.2 } } }]) {
    const { want, got } = both(rig, pose, opt);
    assert.equal(diff(want, got), 0, `pose ${JSON.stringify(pose)} opt ${JSON.stringify(opt)}`);
  }
  assert.ok(B.renderRig(rig, {}, {}).g.data.some((v) => v), 'the rig draws something');
  assert.equal(INK, '#231b33');
});
