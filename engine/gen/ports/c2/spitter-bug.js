// PORT (migration batch C2): the drawing of sprites/spitter-bug.js, word for word (its frame function, the horns, sac
// and mouth, sockets() and render()), on the top-down creature rig's copy (engine/gen/ports/c2/creature-topdown.js),
// with its imports pointed at the port shims. What the code sprite said besides its drawing is in
// sprites/spitter-bug.json; this is what bug.spitter@1 (engine/gen/creatures.js) runs on a paint-ref grid. Its own
// layer for the burrow (`new Surface`) is a paint-ref grid on the same paint table (engine/gen/ports/surface.js), so the
// blit keeps its paints. The swatch lists of the code file are left out (the data file lists the swatches). Pure; Node
// and browser.
import { lerp, clamp, wave, pulse, keys, fract, hash, PI, TAU } from '../../../motion.js';
import { ramp, farRamp, mix, pick, tone, INK } from './colour.js';
import { Surface, ellipseIn } from '../surface.js';
import { fanIn, hornIn, leafIn } from '../e2/creature.js';
import { glow, particles, shards, starburst, steps } from '../e2/fx.js';
import { PALETTE } from '../e2/palettes.js';
import * as K from './creature-topdown.js';

const P = PALETTE.derelict;
const F = (n) => n / 7;                                   // frame n of an 8-frame one-shot

/** Everything about one frame: the rig's pose and joints, the sac, the mouth, and what the clip is doing. */
function frameOf(clip, t, p) {
  const k = lerp(0.82, 1.12, p.size);
  const B = K.body({ segments: [{ len: 14 * k, wide: 20 * k, tall: 12 * k }], rise: 1, pairs: 3, span: 14 * k, splay: 3 * k, fan: 0.24, knee: 4.5 * k });
  const Q = K.pose(clip === 'idle' || clip === 'hurt' ? clip : 'rest', t, { bounce: lerp(0.1, 0.6, p.bounce) }, B);
  // swell: the sac's size; lit: how bright the acid is; jaw: mouth open; spit, dig, burst: progress of each event (below 0: not yet)
  const S = { swell: 1, lit: 0, jaw: 0, spit: -1, dig: -1, sink: 0, burst: -1, flat: 0 };
  const amp = lerp(0.07, 0.24, p.bounce);
  if (clip === 'idle') {
    S.swell = 1 + amp * wave(t, -0.15);                   // the sac lags the breath of the body
    S.lit = pulse(t, -0.15);
  } else if (clip === 'shoot') {
    // 0 rest, 1 to 3 the sac swells and the body draws back, 3 the mouth opens, 4 it spits, 5 to 6 the sac wobbles, 7 rest
    S.swell = keys(t, [[0, 1], [F(1), 1.1], [F(2), 1.2], [F(3), 1.3], [F(4), 0.8], [F(5), 1 + amp * 0.6], [F(6), 1 - amp * 0.4], [1, 1]]);
    S.lit = keys(t, [[0, 0.2], [F(3), 1], [F(4), 1], [F(5), 0.2], [1, 0]]);
    S.jaw = keys(t, [[0, 0], [F(2), 0.15], [F(3), 1], [F(4), 1], [F(5), 0.5], [F(6), 0.15], [1, 0]]);
    S.spit = t >= F(4) - 0.01 ? (t - F(4)) / F(3) : -1;
    Q.x = keys(t, [[0, 0], [F(2), -2], [F(3), -3], [F(4), 3], [F(5), 1.5], [1, 0]]);
    Q.squash = keys(t, [[0, 0], [F(3), 0.5], [F(4), -0.5], [F(5), 0.2], [1, 0]]);
  } else if (clip === 'burrow') {
    // 0 rest, 1 to 2 the legs dig and the hole opens, 3 to 6 it sinks, shaking, 7 only the top of the sac shows
    S.dig = t;
    Q.tuck = keys(t, [[0, 0], [F(1), 0.3], [F(3), 1], [1, 1]]);
    Q.drop = keys(t, [[0, 0], [F(1), 1], [F(2), 1.5], [1, 1.5]]);
    Q.sway = t > F(1) - 0.01 && t < 0.99 ? (Math.round(t * 7) % 2 ? 1 : -1) : 0;
    if (t < F(3)) Q.feet.forEach((f, i) => { f.y = 2.2 * Math.max(0, Math.sin(TAU * (t * 3.5 + i * 0.37))) * (t > 0.01 ? 1 : 0); });
    S.sink = clamp((t - F(2)) / F(5));
    S.swell = 1 + 0.08 * Math.sin(TAU * t * 2);
    S.lit = 0.5 + 0.5 * Math.sin(TAU * t * 2);
  } else if (clip === 'hurt') {
    S.swell = 1 + keys(t, [[0, -0.18], [1 / 3, 0.16], [2 / 3, -0.06], [1, 0]]);
  } else if (clip === 'die') {
    // 0 the hit (white), 1 to 3 the sac swells up, 4 it bursts, 5 to 6 the body sags and the splash falls, 7 a husk in a puddle
    S.swell = keys(t, [[0, 0.85], [F(1), 1.15], [F(2), 1.3], [F(3), 1.48], [1, 1.48]]);
    S.lit = keys(t, [[0, 0], [F(3), 1], [1, 1]]);
    S.jaw = keys(t, [[0, 0.3], [F(3), 1], [F(5), 0.6], [1, 0.4]]);
    S.burst = t >= F(4) - 0.01 ? (t - F(4)) / F(3) : -1;
    S.flat = keys(t, [[0, 0], [F(4), 0], [F(6), 1], [1, 1]]);
    Q.x = keys(t, [[0, -2], [F(1), -1], [1, 0]]);
    Q.squash = keys(t, [[0, 0.4], [F(1), 0.1], [F(3), -0.3], [F(4), 0.5], [F(6), 1.2], [1, 1.2]]);
    Q.drop = 2 * S.flat;
    Q.tuck = 0.55 * S.flat;
    Q.flash = t < 0.1;
    Q.blink = t > F(4) - 0.01;
    Q.feet.forEach((f, i) => { f.y = 1.8 * Math.max(0, Math.sin(TAU * (t * 2.5 + i * 0.37))) * (1 - S.flat) * (t > 0.01 ? 1 : 0); });
  }
  const J = K.solve('down', Q, B), seg = J.segs[0];
  // the sac stands on the back, behind the head: its foot stays put while it swells
  const foot = J.at(-B.len * 0.2, 0, B.top * 0.8), rx0 = lerp(6.5, 11, p.bulk) * k;
  let rx = rx0 * lerp(1, S.swell, 0.8), ry = rx0 * 0.92 * S.swell;
  ry = Math.min(ry, (foot[1] - 3) / 1.5);                 // the biggest sac at its fullest still fits under the top of the frame
  const sac = { x: seg.x, y: foot[1] - ry * 0.5, rx, ry, foot: foot[1] };
  const mouth = { x: seg.x, y: seg.y + seg.ry * 0.38 };
  // the burrow: its near rim is on the ground line, and it is wide enough to take the body
  const hole = { x: seg.x, y: K.GROUND - 4, rx: 13.5 * k, ry: 3.5, open: clamp(S.dig / F(3)) };
  return { k, B, Q, J, S, seg, sac, mouth, hole, head: { x: seg.x, y: seg.y - seg.ry, angle: PI } };
}

/** The horns part, drawn from its attach point (the top of the head) and its own settings; `wide` and `deep` are the radii of the shell it stands on. */
function drawHorns(g, at, { kind, length, wide, deep, paint }) {
  const cy = at.y + deep;                                                        // the middle of the shell
  const rim = (a) => [at.x + Math.sin(a) * wide, cy + Math.cos(a) * deep];       // a point on its edge (PI = the top)
  const tests = [];
  if (kind === 'crest') {
    // a frill of seven broad plates standing up round the top of the head, the middle one tallest
    for (let i = -3; i <= 3; i++) {
      const a = PI + i * 0.4, [x, y] = rim(a), L = (8 - 1.3 * Math.abs(i)) * length;
      tests.push(leafIn(x - Math.sin(a) * 3, y - Math.cos(a) * 3, x + Math.sin(a) * L, y + Math.cos(a) * L * 0.9, 3.6, { belly: 0.4, blunt: 0.9 }));
    }
  } else if (kind === 'spines') {
    // three long thin spines on each side, sweeping up and back
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const a = PI - s * (1.05 + 0.42 * i), [x, y] = rim(a);
      tests.push(hornIn(x - Math.sin(a) * 2, y - Math.cos(a) * 2, PI - s * (1.35 + 0.2 * i), (8.5 - 1.5 * i) * length, { curl: s * 0.9, width: 2.8, tip: 0.9, steps: 4 }));
    }
  }
  if (tests.length) g.blob(tests, paint);
}

/** The acid sac: a dark skin with a window into the glowing acid, which stands higher and brighter as the sac fills. */
function drawSac(g, sac, { skin, acid, lit, t, full = 0 }) {
  const M = ramp(skin), A = ramp(acid);
  g.ellipse(sac.x, sac.y, sac.rx, sac.ry, M, { shade: 2 });
  const ix = sac.rx - 2.2, iy = sac.ry - lerp(2.2, 1.4, full);
  if (ix < 1.5 || iy < 1.5) return;
  const inner = ellipseIn(sac.x - 0.5, sac.y + 0.3 - 0.8 * full, ix, iy);
  const box = [sac.x - ix - 1, sac.y - iy - 2, sac.x + ix + 1, sac.y + iy + 2];
  g.fill(...box, inner, mix(M.light, acid, 0.2));                                // the empty top of the sac, seen through its skin
  const level = sac.y + iy * lerp(lerp(0.15, -0.4, lit), -1.2, full);
  const top = (px) => level + 0.8 * Math.sin(px * 0.9 + TAU * t);                // the surface of the acid rocks
  g.fill(...box, (px, py) => inner(px, py) && py >= top(px), lit > 0.55 ? A.light : A.base);
  g.fill(...box, (px, py) => inner(px, py) && py >= top(px) && py < top(px) + 1, lit > 0.55 ? '#ffffff' : A.light);
  for (let i = 0; i < 3; i++) {                                                  // bubbles rise through it
    const life = fract(t + hash(i, 5)), bx = sac.x + (hash(i, 6) - 0.5) * ix * 1.2, by = lerp(sac.y + iy - 1, level + 1, life);
    if (inner(bx, by) && inner(bx, by + 1) && by > top(bx) + 1.5) g.rect(Math.floor(bx), Math.floor(by), 1, 2, lit > 0.55 ? '#ffffff' : A.light);
  }
  // a wet shine on the skin, toward the light
  g.rect(Math.round(sac.x + sac.rx * 0.45), Math.round(sac.y - sac.ry * 0.62), 2, 1, M.light);
  g.dot(Math.round(sac.x + sac.rx * 0.45) + 2, Math.round(sac.y - sac.ry * 0.62) + 1, M.light);
}

/** The mouth, on the front of the head: three kinds, each opening wide to spit. */
function drawMouth(g, at, { kind, jaw, k, shell, acid }) {
  const dark = tone(P.flesh, -2.2), x = at.x, y = at.y, lip = shell.light;
  if (kind === 'round') {
    const rx = (2.4 + 1.4 * jaw) * k, ry = (1.5 + 2 * jaw) * k;
    g.ellipse(x, y, rx + 1, ry + 1, shell.dark, { shade: 0 });
    g.ellipse(x, y, rx, ry, dark, { shade: 0 });
    if (jaw > 0.4) g.ellipse(x, y + ry * 0.35, rx * 0.55, ry * 0.5, acid, { shade: 0 });
  } else if (kind === 'three-way') {
    // three flaps that meet in a Y and fold apart
    const r = (3.2 + 1.2 * jaw) * k, o = jaw * 2.2 * k;
    const tips = [-PI / 2, PI / 6, (5 * PI) / 6].map((a) => [x + Math.cos(a) * r, y - 0.5 + Math.sin(a) * r * 0.8]);
    for (const [tx, ty] of tips) g.limb(x, y - 0.5, tx, ty, 2, dark, { shade: 0 });
    if (o > 0.4) {
      g.poly([[x, y - 0.5 - o * 1.5], [x + o * 1.5, y - 0.5 + o], [x - o * 1.5, y - 0.5 + o]], dark, { shade: 0 });
      g.ellipse(x, y, o * 0.6, o * 0.6, acid, { shade: 0 });
    }
    for (const [tx, ty] of tips) g.dot(tx, ty, lip);
  } else {
    // a wide slit with a row of teeth
    const w = Math.round((5 + 0.8 * jaw) * k), h = Math.round(1 + 3 * jaw * k), x0 = Math.floor(x) - w, y0 = Math.round(y - h / 2);
    g.rect(x0, y0, 2 * w + 1, h, dark);
    if (h >= 3) g.rect(x0 + 2, y0 + h - 1, 2 * w - 3, 1, acid);
    for (let i = 1; i < 2 * w; i += 2) g.dot(x0 + i, y0 - (h < 2 ? 1 : 0), lip);
  }
}

// head: where the horns stand. muzzle: the mouth, where the acid glob appears (it flies toward the camera)
/** The spitter's attach points for one frame (the code sprite's sockets(), word for word): head, muzzle. Arguments: clip, t, p. */
export function sockets(clip, t, p) {
  const { head, mouth, S, hole } = frameOf(clip, t, p), down = clip === 'burrow' ? Math.round(S.sink * 30) : 0;
  return { head: { ...head, y: Math.min(head.y + down, hole.y) }, muzzle: { x: mouth.x, y: Math.min(mouth.y + down, hole.y), angle: 0 } };
}

/** The code sprite's render(), word for word. Arguments: g (a paint-ref grid), { clip, t, p }. */
export function render(g, { clip, t, p }) {
  const { k, B, Q, J, S, seg, sac, mouth, hole, head } = frameOf(clip, t, p);
  const shell = ramp(p.body), acid = ramp(p.glow), legs = farRamp(p.body);
  const burst = S.burst >= 0, dug = S.dig >= 0;
  // the bug itself goes on a layer of its own, so that it can sink into the burrow
  const bug = dug ? new Surface(g.w, g.h) : g;

  if (burst) {
    // the acid that was in the sac: a puddle spreading under the husk
    const spread = clamp(S.burst * 1.4);
    g.ellipse(seg.x, K.GROUND - 3, lerp(6, 15, spread) * k, lerp(1.5, 3, spread), { base: p.glow, dark: acid.dark, light: acid.light }, { shade: 1 });
  }
  K.drawLegs(bug, J, legs, { width: 2 });
  if (!burst) drawSac(bug, sac, { skin: p.accent, acid: p.glow, lit: S.lit, t, full: dug ? clamp((S.sink - 0.4) / 0.4) : 0 });
  else {
    // what is left of the sac: torn flaps of skin, folding down onto the back
    const M = ramp(p.accent), h = lerp(0.75, 0.3, clamp(S.burst)) * sac.ry;
    bug.blob([fanIn(seg.x, sac.foot + 1, PI - 1.2, PI + 1.2, 5, [h, h * 1.2], 4, { belly: 0.5, blunt: 0.9 })], M);
  }
  if (p.horns !== 'none') drawHorns(bug, head, { kind: p.horns, length: p.hornLength * k * (1 - 0.4 * S.flat), wide: seg.rx, deep: seg.ry, paint: ramp(mix(p.body, P.cream, 0.5)) });

  // the body: one glossy shell, the face on its front
  bug.ellipse(seg.x, seg.y, seg.rx, seg.ry, shell, { shade: 1 });
  bug.rect(Math.round(seg.x + seg.rx * 0.4), Math.round(seg.y - seg.ry * 0.72), 3, 1, shell.light);        // the shine of the shell
  const brow = Math.round(seg.y - seg.ry * 0.3);
  for (let dx = -Math.floor(seg.rx * 0.62); dx <= Math.floor(seg.rx * 0.62); dx++) bug.dot(Math.floor(seg.x) + dx, brow - Math.round(1.6 * (1 - (dx / (seg.rx * 0.62)) ** 2)), shell.dark);
  // eyes: two big and two small, under the brow
  const eye = pick(p.body, '#ffffff', INK), ey = brow + 1, ex = Math.round(seg.rx * 0.36);
  for (const s of [-1, 1]) {
    const x = Math.floor(seg.x) + s * ex - (s < 0 ? 1 : 0);
    if (Q.blink) bug.rect(x, ey + 1, 2, 1, shell.dark);
    else bug.rect(x, ey, 2, 2, eye);
    if (!Q.blink && seg.rx > 8) bug.dot(Math.floor(seg.x) + s * (ex + 3) + (s > 0 ? 1 : -1), ey, eye);
  }
  if (seg.ry > 3) drawMouth(bug, mouth, { kind: p.shape, jaw: S.jaw * clamp(seg.ry / 4.5), k, shell, acid: p.glow });

  if (dug && t < 0.01) g.blit(bug);                     // frame 0 is the idle pose, with no hole yet
  else if (dug) {
    K.burrow(g, { ...hole, layer: 'hole', dark: P.void });
    K.burrow(g, { ...hole, layer: 'back', colour: P.panel, seed: 4 });
    // it sinks until only the top rows of the sac show inside the hole
    const top = bug.bounds().y0, last = hole.y + hole.ry - 4 - top;
    g.blit(K.sunk(bug, Math.round(S.sink ** 1.3 * last), hole));
    K.burrow(g, { ...hole, layer: 'front', colour: P.panel, seed: 4 });
  }

  if (Q.flash) g.tint('#ffffff');
  g.outline(INK);

  // light and flying things, after the outline
  const C = steps(p.glow, { core: P.cream });
  if (S.spit >= 0 && S.spit < 0.99) {
    // the glob leaves the mouth and flies toward the camera
    glow(g, mouth.x, mouth.y + 3 + S.spit * 7, lerp(3.8, 1.2, S.spit) * k, C, { box: [2, 2, g.w - 2, g.h - 2] });
    if (S.spit > 0.05) particles(g, { t: S.spit, x: mouth.x, y: mouth.y + 3, count: 4, seed: 3, loop: false, stagger: 0.1, angle: 0, arc: 2, dist: 6, gravity: 3, size: 2.4, colours: C.slice(1), box: [3, 3, g.w - 3, g.h - 2] });
  }
  // rubble thrown up and out on both sides as it digs
  if (dug && t > F(1) - 0.01 && t < F(5) + 0.01) for (const s of [-1, 1]) shards(g, { t: clamp((t - F(1)) / F(5)), x: hole.x + s * hole.rx * 0.7, y: hole.y - 1, count: 3, seed: 2 + s, dist: 9, gravity: 8, size: 3, angle: PI - s * 1, arc: 0.9, colour: P.panel, box: [2, 6, g.w - 2, K.GROUND + 1] });
  if (burst) {
    if (S.burst < 0.05) {
      starburst(g, { x: Math.floor(sac.x) + 0.5, y: Math.floor(sac.y) + 0.5, count: 8, r1: Math.min(sac.rx * 1.35, sac.y - 3), width: 6, turn: PI + 0.2, colour: C[2], rim: C[4], box: [2, 2, g.w - 2, K.GROUND] });
      glow(g, sac.x, sac.y, sac.rx * 0.55, C.slice(0, 3), { box: [2, 2, g.w - 2, g.h - 2] });
    }
    particles(g, { t: S.burst, x: sac.x, y: sac.y, count: 9, seed: 6, loop: false, stagger: 0.15, angle: PI, arc: TAU, dist: 15 * k, gravity: 12, size: 3, colours: C, box: [2, 2, g.w - 2, K.GROUND] });
  }
}
