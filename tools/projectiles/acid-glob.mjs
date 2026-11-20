// E3 round 2: acid-glob as a pictures body. The drips and droplets are solid goo, so they are shapes on keyed nodes
// drawn before the ink outline (the code drew trailPuffs and particles before g.outline); the splat is the code's own
// splatIn outline (engine/plating.js) as a polygon with its satellite drops, on a node Size scales and the keys grow.
import { head, clip, build, B, lin, hash, fract, keys as keysAt, easeOut, clamp } from './lib.mjs';
const h = head('acid-glob', { body: 'water', glow: 'light' });
const TAU = Math.PI * 2, RM = 6;                             // R at the middle size: lerp(4.5, 7.5, 0.5)
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100, q4 = (v) => Math.round(v * 1e4) / 1e4;
const P1 = ([x, y]) => [r1(x), r1(y)];
const R = (k = 1, add = 0) => lin('size', 4.5, 7.5, k, add);
const fly = ['fly'], hit = ['hit'];
const at = (a, d) => [R(Math.cos(a) * d), R(Math.sin(a) * d)];
const goo = (o) => ({ paint: 'body', shade: 1, group: 'goo', ...o });
// the Drips slider: drips = round(lerp(1, 5, pieces)); `atLeast(n)`: there are n or more
const atLeast = (n) => (n <= 1 ? {} : { pieces: [{ atLeast: q4((n - 1.5) / 4) }] });
const exactly = (n) => ({ pieces: [{ ...(n > 1 ? { atLeast: q4((n - 1.5) / 4) } : {}), ...(n < 5 ? { below: q4((n - 0.5) / 4) } : {}) }] });

// ---- fly: the glob, and drips that come off its back, fall behind and shrink (engine/shots.js trailPuffs) ----
const draw = [];
const SLOTS = 5, ORDER = [0, 2, 4, 1, 3];                     // which drip slots show for 1 to 5 drips: spread round the loop
const FROM = { round: 20 - 0.8 * RM, teardrop: 21 - 1.55 * RM }; // where a drip is born at the middle size
for (const kind of ['round', 'teardrop']) for (let i = 0; i < SLOTS; i++) {
  const when = { shape: kind === 'round' ? ['round', 'cluster'] : ['teardrop'], ...atLeast(ORDER.indexOf(i) + 1), clip: fly };
  draw.push({ id: `${kind[0]}Drip${i}`, kind: 'ellipse', on: `${kind[0]}d${i}`, at: [0, 0], r: [B('size', 1.8, 2.4), B('size', 1.8, 2.4)], paint: 'body', shade: 1, group: 'drips', when },
    { id: `${kind[0]}DripDot${i}`, kind: 'dot', on: `${kind[0]}d${i}`, at: [0, 0], paint: 'body', group: 'drips', when });
}
// the drips' life at the middle size: dist min(lerp(8, 11, size), from - 4) = 9.5 (round) or 7.7 (teardrop)
const DIST = { round: 9.5, teardrop: 21 - 1.55 * RM - 4 };
const drip = (kind, i, t) => {
  const life = fract(t + i / SLOTS), side = (i % 2 ? 1 : -1) * 2.4 * (0.5 + hash(i, 2 * 64 + 3)) * life, r = 1 - life ** 1.6;
  return { move: [r2(-DIST[kind] * life), r2(-side)], scale: r2(Math.max(0.15, r)), gone: 2.1 * r < 0.3 };
};
draw.push(
  // round and teardrop: one ball, and a bulge that travels round it; cluster: three drops going round each other
  goo({ id: 'ball', kind: 'ellipse', on: 'glob', at: [0, 0], r: [R(), R()], when: { shape: ['round'], clip: fly } }),
  goo({ id: 'tearBall', kind: 'ellipse', on: 'glob', at: [1, 0], r: [R(0.88), R(0.88)], when: { shape: ['teardrop'], clip: fly } }),
  goo({ id: 'bulge', kind: 'ellipse', on: 'spin', at: at(0, 0.72), r: [R(0.4), R(0.4)], when: { shape: ['round', 'teardrop'], clip: fly } }),
  // the teardrop's tail streams behind it and wags as it goes
  goo({ id: 'tail', kind: 'poly', on: 'tail', points: [[R(-1.9), 0], ...[-60, -30, 0, 30, 60, 90, 120].map((d) => { const a = (d * Math.PI) / 180; return [R(Math.sin(a) * 0.8 * (d > 90 ? 0.4 : 1)), R(-Math.cos(a) * 0.8)]; }), [R(-0.4), R(0.8)]].slice(0, 9), when: { shape: ['teardrop'], clip: fly } }),
  goo({ id: 'lump1', kind: 'ellipse', on: 'spin', at: at(0, 0.42), r: [R(0.66), R(0.66)], when: { shape: ['cluster'], clip: fly } }),
  goo({ id: 'lump2', kind: 'ellipse', on: 'spin', at: at(2.2, 0.55), r: [R(0.5), R(0.5)], when: { shape: ['cluster'], clip: fly } }),
  goo({ id: 'lump3', kind: 'ellipse', on: 'spin', at: at(4.3, 0.6), r: [R(0.4), R(0.4)], when: { shape: ['cluster'], clip: fly } }));

// ---- hit: droplets fly out of the splat (engine/fx.js particles, one-shot), drawn under it and inked ----
const DROPLETS = 7;
for (let i = 0; i < DROPLETS; i++) {
  const when = { ...(i >= 3 ? atLeast(i - 1) : {}), clip: hit };
  draw.push({ id: `drop${i}`, kind: 'ellipse', on: `p${i}`, at: [0, 0], r: [1.6, 1.6], paint: 'body', shade: 1, group: 'drops', when },
    { id: `dropDot${i}`, kind: 'dot', on: `p${i}`, at: [0, 0], paint: 'body', group: 'drops', when });
}
const droplet = (i, t) => {
  const hh = (ch) => hash(i, 9 * 64 + ch), delay = hh(1) * 0.1, k = t <= delay ? 0 : (t - delay) / (1 - delay);
  const a = Math.PI + (hh(2) - 0.5) * TAU, d = 12.6 * (0.55 + 0.45 * hh(3)) * easeOut(k);
  // the code kept a droplet's middle in the box [2, 30] and cut its disc there; a shape is not cut, so its edge stays in
  const sc = Math.max(0.2, 1 - k), e = 2 + Math.max(0.5, 1.6 * sc);
  const x = Math.min(Math.max(16 + Math.sin(a) * d, e), 32 - e), y = Math.min(Math.max(16 + Math.cos(a) * d, e), 32 - e);
  return { move: [r2(x - 16), r2(y - 16)], scale: r2(sc) };
};
// the splat (engine/plating.js splatIn, seed 5): a lumpy body r (0.68 + 0.17 sin(n a + ph) + 0.15 sin(2 a + ph2)) and
// drips + 1 droplets flung 1.25 to 1.6 r out; written at R 6 on the node `splat`, which Size scales and the keys grow
const splatBody = (lobes) => {
  const ph = hash(5, 1) * TAU, ph2 = hash(5, 2) * TAU;
  const edge = (a) => { const d = RM * (0.68 + 0.17 * Math.sin(lobes * a + ph) + 0.15 * Math.sin(2 * a + ph2)); return P1([Math.cos(a) * d, Math.sin(a) * d]); };
  // two halves from the middle (a polygon holds at most 24 points), one body: 22 points of the edge each
  return [0, 1].map((half) => [[0, 0], ...Array.from({ length: 23 }, (_, j) => edge(Math.PI * (half + j / 22)))]);
};
const FLECK_BIG = 1, FLECK_GROW = 1.4;                                       // the most the flecks' node grows (the splat grows to 1.75)
const splatDrops = [];
for (let drips = 1; drips <= 5; drips++) {
  const n = drips + 1, ph = hash(5, 1) * TAU;
  for (let i = 0; i < n; i++) {
    // the code cut a droplet at the frame's box; a shape is not cut, so one that would reach past it is drawn further in:
    // on the node `flecks` (which Size scales less than the splat, and grows with it up to FLECK_GROW) none reaches past
    // 13.3 px from the middle
    const rad = (0.9 + 0.9 * hash(5, 30 + i)) / FLECK_GROW, a = (TAU * (i + hash(5, 10 + i) * 0.7)) / n + ph;
    const d = Math.min(RM * (1.25 + 0.35 * hash(5, 20 + i)), 13.3 / (FLECK_BIG * FLECK_GROW) - rad);
    splatDrops.push(goo({ id: `fleck${drips}${i}`, kind: 'ellipse', on: 'flecks', at: P1([Math.cos(a) * d, Math.sin(a) * d]), r: [rad, rad], when: { ...exactly(drips), clip: hit } }));
  }
}
const flecks = splatDrops.map((d) => d.id);
const GROW0 = 1.05;
draw.push(
  // frame 0: the glob flattened wide as it lands (1.25 R), under a white flash
  goo({ id: 'slap', kind: 'ellipse', on: 'splat', at: [0, 0], r: [r2((1.25 * RM) / GROW0), r2((1.25 * RM) / GROW0)], when: { clip: hit } }),
  // frames 1 to 5: the splat bursts open and draws back
  ...splatBody(6).map((points, j) => goo({ id: `splat${j}`, kind: 'poly', on: 'splat', points, when: { clip: hit } })), ...splatDrops,
  // frames 6 and 7: it dries back to a rounder pool
  ...splatBody(4).map((points, j) => goo({ id: `pool${j}`, kind: 'poly', on: 'splat', points, when: { clip: hit } })),
  goo({ id: 'poolMid', kind: 'ellipse', on: 'splat', at: [0, 0], r: [r2(RM * 0.62), r2(RM * 0.5)], when: { clip: hit } }),
  // the shine: a crescent on the side of the light and a dot below it
  { id: 'shine', kind: 'arc', on: 'glob', at: [R(0.12), R(-0.12)], r: R(0.5), a0: 105, a1: 170, thick: 1, paint: 'glow', when: { clip: fly } },
  { id: 'shineDot', kind: 'dot', on: 'glob', at: [R(-0.42), R(0.25)], paint: 'glow', when: { clip: fly } },
  { id: 'splatShine', kind: 'arc', on: 'splat', at: [0.6, -0.6], r: 2.4, a0: 100, a1: 175, thick: 2, paint: 'glow', when: { clip: hit } },
  { id: 'splatDot', kind: 'dot', on: 'splat', at: [-1.7, 0.8], paint: 'glow', when: { clip: hit } },
  { kind: 'outline', paint: 'ink' });

const body = { pictures: {
  nodes: [ { id: 'glob', parent: null, at: [20, 16] }, { id: 'spin', parent: 'glob', at: [0, 0] }, { id: 'tail', parent: 'glob', at: [1, 0] },
    { id: 'splat', parent: null, at: [16, 16], scale: B('size', 0.75, 1.25) }, { id: 'flecks', parent: null, at: [16, 16], scale: B('size', [[0, 0.85], [0.5, 0.95], [1, FLECK_BIG]]) },
    ...['round', 'teardrop'].flatMap((kind) => Array.from({ length: SLOTS }, (_, i) => ({ id: `${kind[0]}d${i}`, parent: null, at: [r2(FROM[kind]), 16] }))),
    ...Array.from({ length: DROPLETS }, (_, i) => ({ id: `p${i}`, parent: null, at: [16, 16] })) ],
  draw,
  motion: [ { gen: 'pickup.bob', v: 1, node: 'glob', clip: fly, height: B('wobble', 0, 1.5) } ] } };

// fly: 8 frames, each held: the bulge goes round once, the tail wags, the drips fall back
const dripIds = (kind, i) => [`${kind[0]}Drip${i}`, `${kind[0]}DripDot${i}`];
const flyKeys = Array.from({ length: 8 }, (_, f) => {
  const t = f / 8, nodes = { spin: { turn: 45 * f }, tail: { turn: r2(20 * Math.sin(TAU * t)) } }, hide = [], show = [];
  for (const kind of ['round', 'teardrop']) for (let i = 0; i < SLOTS; i++) {
    const d = drip(kind, i, t); nodes[`${kind[0]}d${i}`] = { move: d.move, scale: d.scale };
    (d.gone ? hide : show).push(...dripIds(kind, i));
  }
  return { t, ease: 'hold', nodes, show, ...(hide.length ? { hide } : {}) };
});
// hit: the code's grow keys at each frame's time; droplets on frames 1 to 5 (their phase (frame - 1) / 5)
const GROW = Array.from({ length: 8 }, (_, f) => r2(keysAt(f / 7, [[0, 1.05], [0.14, 1.45], [0.3, 1.75], [0.6, 1.5], [0.86, 0.95], [1, 0.85]])));
const dropIds = Array.from({ length: DROPLETS }, (_, i) => [`drop${i}`, `dropDot${i}`]).flat();
const hitKeys = GROW.map((g, f) => {
  const nodes = { splat: { scale: f === 0 ? GROW0 : g }, flecks: { scale: Math.min(g, FLECK_GROW) } };
  if (f >= 1 && f <= 5) for (let i = 0; i < DROPLETS; i++) nodes[`p${i}`] = droplet(i, (f - 1) / 5);
  const hide = f === 0 ? ['splat0', 'splat1', ...flecks, 'pool0', 'pool1', 'poolMid', 'splatShine', 'splatDot', ...dropIds]
    : f <= 5 ? ['slap', 'pool0', 'pool1', 'poolMid'] : ['slap', 'splat0', 'splat1', ...flecks, ...dropIds];
  // the latest key that names a shape decides it (rigs/keypose.js), so each key names every shape it toggles
  const all = ['slap', 'splat0', 'splat1', ...flecks, 'pool0', 'pool1', 'poolMid', 'splatShine', 'splatDot', ...dropIds];
  return { t: f / 7, ease: 'hold', nodes, show: all.filter((id) => !hide.includes(id)), hide };
});
// Size: how far the drips fall (dist) and the droplets fly (min(13.5, 2.1 R)), against the middle size
const roundDist = [[0, q4(8 / 9.5)], [0.5, 1], [0.815, q4(10.444 / 9.5)], [1, q4(10 / 9.5)]];
const tearDist = [[0, q4(8 / DIST.teardrop)], [0.265, q4(8.795 / DIST.teardrop)], [0.5, 1], [1, q4(5.375 / DIST.teardrop)]];
const clips = {
  fly: clip(h, 'fly', 12, { travel: [
    { tracks: Array.from({ length: SLOTS }, (_, i) => `nodes.rd${i}.move`), by: B('size', roundDist), about: 0 },
    { tracks: Array.from({ length: SLOTS }, (_, i) => `nodes.td${i}.move`), by: B('size', tearDist), about: 0 } ], keys: flyKeys }),
  hit: clip(h, 'hit', 16, { label: 'Splat', frameEdits: { 0: { flash: true } },
    travel: [ { tracks: Array.from({ length: DROPLETS }, (_, i) => `nodes.p${i}.move`), by: B('size', [[0, 0.75], [0.5, 1], [0.643, 1.0714], [1, 1.0714]]), about: 0 } ], keys: hitKeys }),
};
/** The definition this writer gives (tools/projectiles/write.mjs writes it as sprites/acid-glob.json). */
export const definition = () => build(h, body, clips);
