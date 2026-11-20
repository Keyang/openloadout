import { head, clip, build, B, clipWhen } from './lib.mjs';
const h = head('orbit-blade', { metal: 'metal', glow: 'light' });
h.palette.push({ id: 'dim', material: 'light', derive: { rule: 'tone', of: 'glow', by: -1 } }, { id: 'shine', default: '#ffffff', material: 'light', detail: true });
const R0 = 6.5, R1 = 8.8, TAU = Math.PI * 2;
const r3 = (v) => Math.round(v * 100) / 100;
// a point given as a function of R becomes two bindings on Size (every point here is linear in R)
const P = (f) => { const a = f(R0), b = f(R1); return [B('size', r3(a[0]), r3(b[0])), B('size', r3(a[1]), r3(b[1]))]; };
const rot = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
// the outline of each style's blades, as polygons of functions of R (blade k turned clockwise by k / n of a turn)
function outlines(style, n) {
  if (style === 'saw') {   // hooked teeth: the radius climbs from the root to the tip across each tooth, then drops back
    const out = [];
    for (let k = 0; k < n; k++) { const pts = [() => [0, 0]]; for (let i = 0; i <= 8; i++) { const u = i / 8, a = (TAU * (k + u)) / n; pts.push((R) => [Math.cos(a) * R * (0.5 + 0.5 * u), Math.sin(a) * R * (0.5 + 0.5 * u)]); } out.push(pts); }
    // the root circle between the teeth
    const root = []; for (let i = 0; i < 16; i++) { const a = (TAU * i) / 16; root.push((R) => [Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5]); }
    return [...out, root];
  }
  if (style === 'star') {  // straight points: a throwing star
    const k = n === 4 ? 0.4 : 0.3, pts = [];
    for (let i = 0; i < 2 * n; i++) { const a = -Math.PI / 2 + (i * Math.PI) / n; pts.push((R) => [Math.cos(a) * (R + 0.5) * (i % 2 ? k : 1), Math.sin(a) * (R + 0.5) * (i % 2 ? k : 1)]); }
    return [pts];
  }
  // crescent: sickles hooked round the hub, their points trailing (a disc with a bite out of it)
  const out = [];
  for (let k = 0; k < n; k++) {
    const turn = (TAU * k) / n, A = -Math.PI / 2 - 0.5, shift = 0.52, bite = 0.9;
    const pts = [], N = 14;
    // the outer edge: the part of the disc's circle outside the bite; then the bite's edge inside the disc, back the other way
    const c1 = [-0.16, -0.44], r1 = 0.56, c2 = [c1[0] + Math.sin(A) * r1 * shift, c1[1] + Math.cos(A) * r1 * shift], r2 = r1 * bite;
    const inBite = (p) => (p[0] - c2[0]) ** 2 + (p[1] - c2[1]) ** 2 > r2 * r2;
    const ring = (c, r, keep) => { const s = []; for (let i = 0; i < 360; i++) { const a = (i * TAU) / 360; const p = [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]; s.push([p, keep(p)]); } return s; };
    const arc = (s) => { const st = s.findIndex(([, ok], i) => ok && !s[(i + s.length - 1) % s.length][1]); const run = []; for (let i = 0; i < s.length; i++) { const [p, ok] = s[(st + i) % s.length]; if (!ok) break; run.push(p); } return run; };
    const outer = arc(ring(c1, r1, inBite)), inner = arc(ring(c2, r2, (p) => (p[0] - c1[0]) ** 2 + (p[1] - c1[1]) ** 2 <= r1 * r1)).reverse();
    const take = (l, m) => Array.from({ length: m }, (_, i) => l[Math.round((i * (l.length - 1)) / (m - 1))]);
    for (const p of [...take(outer, N), ...take(inner, 10)]) { const q = rot(p, turn); pts.push((R) => [q[0] * R, q[1] * R]); }
    out.push(pts);
  }
  return out;
}
// the lit cutting edge: points two px outside the outline, only out at the tips (further than 0.8 R + 1 from the middle)
function hotEdge(polys, R) {
  const all = polys.map((p) => p.map((f) => f(R)));
  const inside = (x, y) => all.some((poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; });
  const dots = [];
  for (const poly of all) for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let s = 0; s < L; s += 1.2) {
      const p = [a[0] + ((b[0] - a[0]) * s) / L, a[1] + ((b[1] - a[1]) * s) / L];
      let nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
      if (inside(p[0] + nx * 0.5, p[1] + ny * 0.5)) { nx = -nx; ny = -ny; }
      const q = [p[0] + nx * 2.2, p[1] + ny * 2.2];
      if (Math.hypot(...q) <= 0.8 * R + 1 || inside(q[0], q[1])) continue;
      if (dots.some((d) => Math.hypot(d[0] - q[0], d[1] - q[1]) < 0.9)) continue;
      dots.push(q);
    }
  }
  return dots;
}
const draw = [], N = { two: 2, three: 3, four: 4 };
// Size scales the blade on its node: every point is written at the small size (R 6.5) and the node `blade` is drawn
// R / 6.5 times as big (a star reaches R + 0.5, so its own node `star` scales by (R + 0.5) / 7)
const at0 = (f) => f(R0).map(r3);
const blades = (sfx, group) => {
  for (const style of ['saw', 'star', 'crescent']) for (const [blades, n] of Object.entries(N)) {
    const when = { style: [style], blades: [blades] }, polys = outlines(style, n), on = style === 'star' ? `starSpin${n}` : `spin${n}`;
    polys.forEach((poly, i) => draw.push({ id: `${style}${n}p${i}${sfx}`, kind: 'poly', on, points: poly.map(at0), paint: 'metal', shade: 1, light: 1, group, when }));
    if (style !== 'saw') { const hr = r3(R0 * (style === 'star' ? 0.36 : 0.42)); draw.push({ id: `${style}${n}hub${sfx}`, kind: 'ellipse', on, at: [0, 0], r: [hr, hr], paint: 'metal', shade: 1, light: 1, group, when }); }
  }
};
// the hub: a dark cap with a bright bolt, which does not turn
const hub = (sfx) => draw.push({ id: `cap${sfx}`, kind: 'ellipse', on: 'axle', at: [0, 0], r: [2, 2], paint: 'metal.dark', shade: 0 }, { id: `bolt${sfx}`, kind: 'rect', on: 'axle', at: [0, -1], size: [1, 1], paint: 'metal.light' });
blades('', 'blade'); hub('');
// the ink, then the lit cutting edge the way engine/shots.js hotEdge finds it: the pixels two steps outside the blade
// (one beyond the ink) are the outline of the inked blade, painted in the glow ...
draw.push({ kind: 'outline', paint: 'ink' }, { kind: 'outline', paint: 'glow' });
// ... kept only out at the tips, further than 0.8 R + 1 from the axle: the middle is cut away and drawn again, inked
draw.push({ id: 'middle', kind: 'cut', on: 'axle', shape: { kind: 'ellipse', at: [0, 0], r: [B('size', r3(R0 * 0.8 + 1), r3(R1 * 0.8 + 1)), B('size', r3(R0 * 0.8 + 1), r3(R1 * 0.8 + 1))] } });
blades('Again', 'bladeAgain');
draw.push({ kind: 'outline', paint: 'ink', only: 'bladeAgain' });
hub('Again');
// two motion arcs just outside the tips, opposite each other, going round once a loop: bright at the head, dim behind
for (const k of [0, 1]) {
  const hd = 90 + 180 * k;
  draw.push({ id: `arcDim${k}`, kind: 'arc', clip: ['fly'], on: 'arcs', at: [0, 0], r: B('size', 10.5, 12.8), a0: hd + 28.6, a1: hd + 63, thick: 1, paint: 'dim', when: { trail: [true] } },
            { id: `arcLit${k}`, kind: 'arc', clip: ['fly'], on: 'arcs', at: [0, 0], r: B('size', 10.5, 12.8), a0: hd, a1: hd + 28.6, thick: 1, paint: 'glow', when: { trail: [true] } });
}
for (const d of draw) if (d.clip === undefined) delete d.clip;
const spark = (id, turn, r, width, paints) => ({ id, gen: 'starburst', v: 1, clip: ['hit'], at: [22.5, 16.5], points: 1, turn, r, width, paints });
const A = 48.7, hitIds = [];
const emitters = [ { id: 'flash', gen: 'starburst', v: 1, clip: ['hit'], at: [22.5, 16.5], points: 4, turn: 45, r: [0, 3.6], width: 1.5, paints: ['shine', 'glow'] } ];
[[[1.5, 5.5], 1.5, ['shine', 'glow']], [[4, 7.5], 0.4, ['glow']], [[6.8, 8.2], 0.4, ['dim']]].forEach(([r, w, p], f) => { for (const [j, a] of [-A, 0, A].entries()) emitters.push(spark(`s${f + 1}${j}`, 90 + a, r, w, p)); });
const body = { pictures: {
  nodes: [ { id: 'arcs', parent: null, at: [16, 16] }, { id: 'axle', parent: null, at: [16, 16] },
    { id: 'blade', parent: 'axle', at: [0, 0], scale: B('size', 1, r3(R1 / R0 * 1e4) / 1e4) }, { id: 'star', parent: 'axle', at: [0, 0], scale: B('size', 1, Math.round((R1 + 0.5) / (R0 + 0.5) * 1e4) / 1e4) },
    ...[2, 3, 4].flatMap((n) => [{ id: `spin${n}`, parent: 'blade', at: [0, 0] }, { id: `starSpin${n}`, parent: 'star', at: [0, 0] }]) ],
  draw: clipWhen(draw),
  motion: [ { gen: 'pickup.bob', v: 1, node: 'axle', clip: ['fly'], height: B('wobble', 0, 1.3) } ],
  emitters } };
const turns = (k) => ({ spin2: { turn: 180 * k }, spin3: { turn: 120 * k }, spin4: { turn: 90 * k }, starSpin2: { turn: 180 * k }, starSpin3: { turn: 120 * k }, starSpin4: { turn: 90 * k } });
const on = (f) => Object.fromEntries(emitters.map((e) => [e.id, { amount: (f === 0 ? e.id === 'flash' : e.id.startsWith(`s${f}`)) ? 1 : 0 }]));
const clips = {
  fly: clip(h, 'fly', 12, { label: 'Spin', keys: [ { t: 0, ease: 'linear', nodes: { ...turns(0), arcs: { turn: 0 } } }, { t: 1, nodes: { ...turns(1), arcs: { turn: 360 } } } ] }),
  hit: clip(h, 'hit', 16, { keys: [0, 1, 2, 3].map((f) => ({ t: f / 3, ease: 'hold', emit: on(f), nodes: { ...turns(f / 6), axle: { move: [[-2, -1, -1, 0][f], 0] } } })) }),
};
/** The definition this writer gives (tools/projectiles/write.mjs writes it as sprites/orbit-blade.json). */
export const definition = () => build(h, body, clips);
