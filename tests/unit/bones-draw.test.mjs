// The bone renderer (rigs/bones.js), part 2: how a bone rig is painted. docs/studio.md section 4 and
// docs/architecture.md Contract 14 rule 5: shape calls sampled at pixel centres, whole-pixel limb widths,
// details moved never turned, same group and z painted as one blob, one outline, glow after it.
// S1/S2 do not exist yet: the rigs here are small local stand-ins written to the format of section 2.1.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Surface, ellipseIn, capsuleIn, polyIn } from '../../engine/surface.js';
import { placedIn } from '../../engine/shapes.js';
import { col, ramp, farRamp, INK, tone } from '../../engine/color.js';
import * as B from '../../rigs/bones.js';

const RAD = Math.PI / 180;
const SKIN = '#4f9d57', EYE = '#f0ead8', GLOW = '#4fd8ee';
const colours = [{ id: 'skin', label: 'Skin', default: SKIN }, { id: 'belly', label: 'Belly', default: '#e6c545' }, { id: 'eye', label: 'Eyes', default: EYE, detail: true }, { id: 'glow', label: 'Glow', default: GLOW }];
/** One root bone at (cx, cy) turned `angle` degrees, carrying the given shapes. */
const one = (shapes, angle = 90, { at = [24, 24], length = 10, size = [48, 48] } = {}) => ({ size, colours, bones: [{ id: 'b', parent: null, at, angle, length }], shapes });
const same = (a, b) => a.data.every((v, i) => v === b.data[i]);
const count = (g, c) => { let n = 0; const v = c === undefined ? null : col(c); for (const p of g.data) if (v === null ? p : p === v) n++; return n; };
const pixels = (g, c) => { const out = [], v = c === undefined ? null : col(c); for (let i = 0; i < g.data.length; i++) if (v === null ? g.data[i] : g.data[i] === v) out.push([i % g.w, Math.floor(i / g.w)]); return out; };
/** Groups of touching pixels (side by side or above and below). */
function pieces(g) {
  const seen = new Uint8Array(g.data.length); let n = 0;
  for (let s = 0; s < g.data.length; s++) {
    if (seen[s] || !g.data[s]) continue;
    n++; const stack = [s]; seen[s] = 1;
    while (stack.length) { const i = stack.pop(), x = i % g.w; for (const j of [x > 0 ? i - 1 : -1, x < g.w - 1 ? i + 1 : -1, i - g.w, i + g.w]) if (j >= 0 && j < g.data.length && !seen[j] && g.data[j]) { seen[j] = 1; stack.push(j); } }
  }
  return n;
}
const draw = (rig, pose = {}, opt = {}) => B.renderRig(rig, pose, opt).g;

// ---- every shape kind is the surface's own shape call ----------------------------------------------------

test('bones: a limb is g.limb along the whole bone, whole pixels wide', () => {
  for (const [angle, w] of [[90, 2], [0, 3], [37, 1], [200, 2]]) {
    const got = draw(one([{ id: 's', bone: 'b', kind: 'limb', width: w, paint: 'skin' }], angle), {}, { outline: false });
    const want = new Surface(48, 48).limb(24, 24, 24 + Math.sin(angle * RAD) * 10, 24 + Math.cos(angle * RAD) * 10, w, ramp(SKIN));
    assert.ok(same(got, want), `limb at ${angle} deg, width ${w}`);
  }
  const flat = draw(one([{ id: 's', bone: 'b', kind: 'limb', width: 2, paint: 'skin' }], 90), {}, { outline: false });
  assert.deepEqual([...new Set(pixels(flat).map(([, y]) => y))].sort(), [23, 24], 'a level limb 2 wide covers exactly two rows');
});

test('bones: a capsule runs from `from` to `to` along the bone, set off across it by `offset`', () => {
  const got = draw(one([{ id: 's', bone: 'b', kind: 'capsule', from: 0.2, to: 0.9, r: [3, 2], offset: -2, paint: 'skin' }], 90), {}, { outline: false });
  // bone points right: across (v) is up, so offset -2 is 2 px down
  const want = new Surface(48, 48).blob([capsuleIn(26, 26, 33, 26, 3, 2)], ramp(SKIN));
  assert.ok(same(got, want));
});

test('bones: an ellipse turns with its bone (shapes.js placedIn)', () => {
  for (const angle of [90, 45, 160]) {
    const got = draw(one([{ id: 's', bone: 'b', kind: 'ellipse', at: [5, 1], r: [4, 2], paint: 'skin' }], angle), {}, { outline: false });
    const a = angle * RAD, d = [Math.sin(a), Math.cos(a)], n = [Math.cos(a), -Math.sin(a)];
    const c = [24 + 5 * d[0] + 1 * n[0], 24 + 5 * d[1] + 1 * n[1]];
    const want = new Surface(48, 48).blob([placedIn(ellipseIn(0, 0, 4, 2), c[0], c[1], { angle: Math.PI / 2 - a })], ramp(SKIN));
    assert.ok(same(got, want), `ellipse at ${angle}`);
  }
});

test('bones: a poly is drawn from its [u, v] points in the bone frame', () => {
  const got = draw(one([{ id: 's', bone: 'b', kind: 'poly', points: [[0, 0], [8, 3], [8, -3]], paint: 'skin' }], 90), {}, { outline: false });
  const want = new Surface(48, 48).blob([polyIn([[24, 24], [32, 21], [32, 27]])], ramp(SKIN));
  assert.ok(same(got, want));
});

test('bones: a dot is a detail: one flat pixel (or 2 x 2) moved to its point, never turned', () => {
  for (let angle = 0; angle < 360; angle += 15) {
    const g = draw(one([{ id: 'h', bone: 'b', kind: 'ellipse', at: [5, 0], r: [5, 4], paint: 'skin', z: 0 }, { id: 'e', bone: 'b', kind: 'dot', at: [7, 1.5], size: 1, paint: 'eye', z: 5 }], angle));
    assert.equal(count(g, EYE), 1, `eye at ${angle} deg is one pixel`);
    const big = draw(one([{ id: 'h', bone: 'b', kind: 'ellipse', at: [5, 0], r: [5, 4], paint: 'skin', z: 0 }, { id: 'e', bone: 'b', kind: 'dot', at: [7, 1.5], size: 2, paint: 'eye', z: 5 }], angle));
    const P = pixels(big, EYE);
    assert.equal(P.length, 4, `big eye at ${angle} deg is four pixels`);
    const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
    assert.equal(Math.max(...xs) - Math.min(...xs), 1); assert.equal(Math.max(...ys) - Math.min(...ys), 1);
  }
});

test('bones: a dot under a body shape with a lower z is covered; z decides, then list order', () => {
  const rig = one([{ id: 'e', bone: 'b', kind: 'dot', at: [5, 0], size: 1, paint: 'eye', z: 0 }, { id: 'h', bone: 'b', kind: 'ellipse', at: [5, 0], r: [5, 4], paint: 'skin', z: 1 }]);
  assert.equal(count(draw(rig), EYE), 0);
  rig.shapes[1].z = 0;
  assert.equal(count(draw(rig), EYE), 0, 'same z: the later one in the list is on top');
  rig.shapes.reverse();
  assert.equal(count(draw(rig), EYE), 1);
});

// ---- one body, one band ------------------------------------------------------------------------------------

test('bones: shapes with the same group and z are painted as one g.blob (one shade band, no seam)', () => {
  const shapes = [
    { id: 'torso', bone: 'b', kind: 'ellipse', at: [3, 0], r: [6, 4], paint: 'skin', z: 10, group: 'body' },
    { id: 'head', bone: 'b', kind: 'ellipse', at: [11, 2], r: [4, 3.5], paint: 'skin', z: 10, group: 'body' },
  ];
  const got = draw(one(shapes, 90), {}, { outline: false });
  const want = new Surface(48, 48).blob([ellipseIn(27, 24, 6, 4), ellipseIn(35, 22, 4, 3.5)], ramp(SKIN));
  assert.ok(same(got, want), 'grouped = one blob');
  const apart = draw(one(shapes.map((s) => ({ ...s, group: undefined })), 90), {}, { outline: false });
  assert.ok(!same(apart, want), 'without a group the second shape paints its own band (the seam the group removes)');
  const otherZ = draw(one([shapes[0], { ...shapes[1], z: 11 }], 90), {}, { outline: false });
  assert.ok(!same(otherZ, want), 'the same group at another z is another blob');
});

test('bones: far shapes use farRamp, shade and light reach Surface.fill', () => {
  const g = draw(one([{ id: 's', bone: 'b', kind: 'ellipse', at: [5, 0], r: [6, 5], paint: 'skin', far: true }]), {}, { outline: false });
  const F = farRamp(SKIN);
  assert.ok(count(g, F.base) > 0 && count(g, SKIN) === 0);
  const lit = draw(one([{ id: 's', bone: 'b', kind: 'ellipse', at: [5, 0], r: [6, 5], paint: 'skin', shade: 2, light: 1 }]), {}, { outline: false });
  const want = new Surface(48, 48).blob([ellipseIn(29, 24, 6, 5)], ramp(SKIN), { shade: 2, light: 1 });
  assert.ok(same(lit, want));
});

test('bones: a detail slot paints flat even on a body shape', () => {
  const g = draw(one([{ id: 's', bone: 'b', kind: 'ellipse', at: [5, 0], r: [4, 3], paint: 'eye' }]), {}, { outline: false });
  assert.equal(count(g), count(g, EYE));
});

// ---- outline, glow, flash ----------------------------------------------------------------------------------

test('bones: one INK outline after the body; glow shapes after it, rimmed with their own darker tone, never inked', () => {
  const rig = one([
    { id: 'h', bone: 'b', kind: 'ellipse', at: [5, 0], r: [5, 4], paint: 'skin', z: 0 },
    { id: 'spark', bone: 'b', kind: 'ellipse', at: [14, 0], r: [2, 2], paint: 'glow', z: 0, glow: true },
  ]);
  const g = draw(rig);
  const ink = col(INK), rim = col(tone(GLOW, -1));
  const glowPx = pixels(g, GLOW);
  assert.ok(glowPx.length >= 9, 'the glow is drawn');
  for (const [x, y] of glowPx) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const v = g.get(x + dx, y + dy);
    assert.notEqual(v, 0, 'every glow pixel is rimmed');
  }
  // the body is outlined in INK; the glow's free edge is rimmed in its own darker tone, not in INK
  assert.ok(count(g, INK) > 10);
  const right = glowPx.reduce((m, p) => (p[0] > m[0] ? p : m));
  assert.equal(g.get(right[0] + 1, right[1]), rim);
  const body = draw(one([rig.shapes[0]]));
  for (let i = 0; i < body.data.length; i++) if (body.data[i] === ink && !g.data[i]) assert.fail('the glow removed nothing of the outline it does not cover');
});

test('bones: opt.outline false leaves the outline off; opt.outline colour replaces INK', () => {
  const rig = one([{ id: 'h', bone: 'b', kind: 'ellipse', at: [5, 0], r: [5, 4], paint: 'skin' }]);
  assert.equal(count(draw(rig, {}, { outline: false }), INK), 0);
  assert.ok(count(draw(rig, {}, { outline: '#102030' }), '#102030') > 10);
});

test('bones: flash tints the body white before the outline (hurt, die frame 0)', () => {
  const rig = one([{ id: 'h', bone: 'b', kind: 'ellipse', at: [5, 0], r: [5, 4], paint: 'skin' }, { id: 'e', bone: 'b', kind: 'dot', at: [7, 1], size: 1, paint: 'eye', z: 2 }]);
  const g = draw(rig, { flash: true });
  assert.equal(count(g), count(g, '#ffffff') + count(g, INK));
  assert.ok(count(g, INK) > 10);
});

// ---- what a pose and the options switch -------------------------------------------------------------------

test('bones: hidden shapes show only when a pose shows them; a pose can hide any shape; parts can be switched off', () => {
  const rig = one([
    { id: 'h', bone: 'b', kind: 'ellipse', at: [5, 0], r: [5, 4], paint: 'skin' },
    { id: 'open', bone: 'b', kind: 'dot', at: [8, -1], size: 1, paint: 'eye', z: 3, hidden: true },
    { id: 'hat', bone: 'b', kind: 'poly', points: [[2, 4], [8, 4], [5, 9]], paint: 'belly', z: 4, part: 'hat' },
  ]);
  assert.equal(count(draw(rig), EYE), 0);
  assert.equal(count(draw(rig, { show: ['open'] }), EYE), 1);
  assert.equal(count(draw(rig, { show: new Set(['open']) }), EYE), 1, 'a Set works as well as a list');
  assert.equal(count(draw(rig, { show: { open: true } }), EYE), 1, 'and an object of flags');
  assert.ok(count(draw(rig), '#e6c545') > 0);
  assert.equal(count(draw(rig, { hide: ['hat'] }), '#e6c545'), 0);
  assert.equal(count(draw(rig, {}, { partsOff: ['hat'] }), '#e6c545'), 0);
  assert.equal(count(draw(rig, {}, { colours: { belly: '#aa3355' } }), '#aa3355') > 0, true, 'colours override slot defaults');
});

test('bones: nudge moves the whole picture by whole pixels', () => {
  const rig = one([{ id: 'h', bone: 'b', kind: 'ellipse', at: [3, 0], r: [5, 4], paint: 'skin' }, { id: 'l', bone: 'b', kind: 'limb', width: 2, paint: 'skin', z: 1 }], 70);
  const a = draw(rig), b = draw(rig, { nudge: [2, -3] });
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) assert.equal(b.get(x + 2, y - 3), a.get(x, y));
});

test('bones: opt.scale stretches named bones and grows named shapes (what a slider may scale)', () => {
  const rig = one([{ id: 'l', bone: 'b', kind: 'limb', width: 2, paint: 'skin' }, { id: 'h', bone: 'b', kind: 'ellipse', at: [10, 0], r: [3, 3], paint: 'belly', z: 1 }]);
  const J = B.renderRig(rig, {}, { scale: { bones: { b: 1.5 } } }).J;
  assert.ok(Math.abs(J.bones.b.length - 15) < 1e-9);
  const g = draw(rig, {}, { scale: { bones: { b: 1.5 } }, outline: false });
  const ys = pixels(g, '#e6c545').map((p) => p[0]);
  assert.ok(Math.min(...ys) > 33, 'a shape on a stretched bone moves along with it');
  assert.ok(count(draw(rig, {}, { scale: { shapes: { h: 1.6 } } }), '#e6c545') > count(draw(rig), '#e6c545'));
  const w = draw(one([{ id: 'l', bone: 'b', kind: 'limb', width: 2, paint: 'skin' }]), {}, { scale: { shapes: { l: 1.6 } }, outline: false });
  assert.deepEqual([...new Set(pixels(w).map(([, y]) => y))].sort(), [23, 24, 25], 'a scaled limb stays a whole number of pixels wide (2 x 1.6 -> 3)');
});

// ---- clean at any angle -----------------------------------------------------------------------------------

test('bones: a 360 degree turn stays clean: no pixel outside the ring the shapes sweep, one piece, steady size', () => {
  const rig = one([
    { id: 'arm', bone: 'b', kind: 'capsule', from: 0, to: 1, r: [3, 2], paint: 'skin', z: 0, group: 'g' },
    { id: 'hand', bone: 'b', kind: 'ellipse', at: [12, 0], r: [3, 2.5], paint: 'skin', z: 0, group: 'g' },
    { id: 'eye', bone: 'b', kind: 'dot', at: [12, 1], size: 1, paint: 'eye', z: 1 },
  ]);
  const sizes = [];
  for (let a = 0; a < 360; a += 5) {
    const g = draw(rig, { bones: { b: a } });
    const outer = 15 + 1 + 0.75 + 0.5;            // the hand's far edge, the outline, a pixel centre, half-pixel rounding
    for (const [x, y] of pixels(g)) assert.ok(Math.hypot(x + 0.5 - 24, y + 0.5 - 24) <= outer, `pixel ${x},${y} at ${a} deg is outside the ring`);
    assert.equal(pieces(g), 1, `one piece at ${a} deg`);
    sizes.push(count(g));
  }
  const lo = Math.min(...sizes), hi = Math.max(...sizes);
  assert.ok(hi / lo < 1.25, `drawn size swings from ${lo} to ${hi} pixels during the turn`);
  // an offset shape sweeps a ring with a hole: nothing lands in the hole
  const ring = one([{ id: 'o', bone: 'b', kind: 'ellipse', at: [9, 0], r: [2.5, 2.5], paint: 'skin' }]);
  for (let a = 0; a < 360; a += 7) {
    for (const [x, y] of pixels(draw(ring, { bones: { b: a } }))) {
      const d = Math.hypot(x + 0.5 - 24, y + 0.5 - 24);
      assert.ok(d >= 9 - 2.5 - 1 - 0.75 - 0.5 && d <= 9 + 2.5 + 1 + 0.75 + 0.5, `ring pixel at distance ${d.toFixed(2)} (${a} deg)`);
    }
  }
});

// ---- deterministic and fast -----------------------------------------------------------------------------

test('bones: deterministic: the same rig and pose give the same pixels; no randomness or clock in the module', () => {
  const rig = one([{ id: 'h', bone: 'b', kind: 'ellipse', at: [5, 0], r: [5, 4], paint: 'skin' }, { id: 'l', bone: 'b', kind: 'limb', width: 2, paint: 'skin', z: 1 }], 33);
  assert.ok(same(draw(rig, { root: [0.3, -0.6], bones: { b: 47.3 } }), draw(rig, { root: [0.3, -0.6], bones: { b: 47.3 } })));
  const src = fs.readFileSync(new URL('../../rigs/bones.js', import.meta.url), 'utf8');
  assert.ok(!/Math\.random|Date\.now|new Date|performance\.now/.test(src));
  assert.ok(!/from ['"]node:/.test(src), 'no Node-only imports: the module runs in the browser too');
});

test('bones: drawing does not change the rig or the pose it was given', () => {
  const rig = one([{ id: 'h', bone: 'b', kind: 'ellipse', at: [5, 0], r: [5, 4], paint: 'skin' }]);
  const pose = { root: [1, 1], bones: { b: 80 }, show: ['h'] };
  const before = JSON.stringify([rig, pose]);
  draw(rig, pose, { scale: { bones: { b: 1.2 }, shapes: { h: 1.3 } } });
  assert.equal(JSON.stringify([rig, pose]), before);
});

/** The largest rig the validator lets through: 48 bones (depth 16), 160 shapes of every kind, 8 IK chains, 16 points, 128 x 96. */
function maximal() {
  const bones = [], shapes = [], ik = [];
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 16; i++) bones.push({ id: `r${r}b${i}`, parent: i ? `r${r}b${i - 1}` : null, ...(i ? {} : { at: [30 + r * 34, 48] }), angle: i ? 18 : 90 + r * 40, length: 6, min: -40, max: 40 });
  }
  const kinds = ['limb', 'capsule', 'ellipse', 'poly', 'dot'];
  for (let k = 0; k < 160; k++) {
    const bone = bones[k % 48].id, kind = kinds[k % 5];
    const s = { id: `s${k}`, bone, kind, paint: k % 7 ? 'skin' : 'belly', z: k % 9, group: k % 3 ? `g${k % 4}` : undefined, far: k % 11 === 0, glow: k % 23 === 0 };
    if (kind === 'limb') s.width = 3;
    if (kind === 'capsule') Object.assign(s, { from: 0, to: 1, r: [6, 4] });
    if (kind === 'ellipse') Object.assign(s, { at: [3, 1], r: [8, 6] });
    if (kind === 'poly') s.points = Array.from({ length: 24 }, (_, j) => [3 + 9 * Math.cos(j / 24 * 6.283), 9 * Math.sin(j / 24 * 6.283)]);
    if (kind === 'dot') Object.assign(s, { at: [2, 1], size: 2, paint: 'eye' });
    shapes.push(s);
  }
  for (let c = 0; c < 8; c++) { const i = 1 + c * 2 + (c >= 7 ? 2 : 0); ik.push({ id: `k${c}`, bones: [bones[i].id, bones[i + 1].id], bend: c % 2 ? 1 : -1 }); }
  const points = Array.from({ length: 16 }, (_, i) => ({ id: `p${i}`, bone: bones[i * 3].id, at: [3, 0] }));
  return { size: [128, 96], colours, bones, shapes, ik, points };
}

test('bones: the maximal rig draws a frame in under 50 ms', () => {
  const rig = maximal();
  const g = new Surface(128, 96);
  B.drawRig(g, rig, {});           // warm up
  // CPU time of this process, not the wall clock: builders share the machine (load averages of 300 were seen), and
  // waiting for a core is not the renderer's cost
  const c0 = process.cpuUsage();
  const N = 20;
  for (let f = 0; f < N; f++) {
    g.clear();
    const bonesPose = {}; for (const b of rig.bones) bonesPose[b.id] = (b.parent ? 18 : 90) + 10 * Math.sin(f + b.length);
    const ikPose = {}; for (const c of rig.ik) ikPose[c.id] = [f % 5, -(f % 3)];
    B.drawRig(g, rig, { bones: bonesPose, ik: ikPose, root: [f % 3, 0] });
  }
  const used = process.cpuUsage(c0), ms = (used.user + used.system) / 1000 / N;
  assert.ok(ms < 50, `${ms.toFixed(1)} ms a frame`);
  assert.ok(count(g) > 500);
});
