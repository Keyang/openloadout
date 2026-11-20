// Writes sprites/bg-battle-dungeon.json: the dungeon battle backdrop of the code sprite
// (tests/fixtures/code-sprites/bg-battle-dungeon.js) as data (migration batch M10, colours named exactly in M10b). See
// tools/backdrops/lib.mjs.
import { rec, controlsFrom, slotFrom, head, hz, tone, mix, clearOf, apart, rect } from './lib.mjs';
import { spots } from '../../engine/gen/backdrop.js';

// no sky: the colour everything fades into is the dark of the passages (the derived slot `air`, worked out from the
// stone), and the layers get LIGHTER as they come nearer: each tone receded into the dark, then made lighter until it
// is clear of the one behind it (the code's mainTones: engine/scenery.js standOutLighter, as stand.apart way lighter)
const DARK = 'air';
function tones() {
  const A = (of, depth, behind, also) => apart(of, { air: DARK, depth: hz(depth), behind, also, night: false, way: 'lighter' });
  const wall = A('stone', 0.5, [DARK], []);
  const column = A(tone('stone', 0.4), 0.2, [wall], [DARK]);
  const floor = A('floor', 0, [column], [wall]);
  return { wall, column, floor };
}

export function definition(root) {
  const r = rec(root, 'bg-battle-dungeon');
  const { wall, column, floor } = tones();
  const spring = (dy = 0) => ({ from: 'height', map: [[0, 106 + dy], [1, 84 + dy]], round: 'px' });
  const dim = mix(DARK, wall, 0.45), trim = column;

  // ---- far: a dark wall pierced by four round arches, each opening onto a passage that fades into black-blue
  const imposts = [];
  for (let k = 0; k < 4; k++) for (const side of [-1, 1]) { const x = k * 80 + side * 13 - 4; for (const cx of x < 0 ? [x, x + 320] : [x]) imposts.push(rect(cx, spring(), 8, 4, trim)); }
  const far = [
    rect(0, 0, 320, 180, wall), rect(0, 0, 320, 12, DARK), rect(0, 12, 320, 2, trim),
    // courses of stone, as short bars where the code put them (review of M10b, issue 4): its scatter(16, 5, { jitter:
    // 0.9 }), each bar from x - 6 on one of five courses 9 px apart, 10 to 14 px long, again 320 px over at the join
    ...spots(16, 5, { jitter: 0.9 }, 320).flatMap((b) => [b.x, ...(b.x + 14 > 320 ? [b.x - 320] : []), ...(b.x - 14 < 0 ? [b.x + 320] : [])]
      .map((x) => rect(x - 6, 24 + Math.round(b.v * 4) * 9, 10 + Math.round(b.u * 4), 2, dim))),
    // a ring of stones round each arch; through it a passage, at its far end a smaller arch into the dark
    { gen: 'arcade', v: 1, count: 4, width: 58, crown: spring(-29), spring: spring(), paint: trim },
    { gen: 'arcade', v: 1, count: 4, width: 52, crown: spring(-26), spring: spring(), paint: DARK },
    { gen: 'arcade', v: 1, count: 4, width: 36, crown: spring(-12), spring: spring(6), paint: dim },
    { gen: 'arcade', v: 1, count: 4, width: 20, crown: spring(2), spring: spring(12), paint: DARK },
    // the imposts the arches spring from, one on each side of every pier
    ...imposts,
  ];

  // ---- mid: pillars on a low step along the wall's foot, a torch on every second one; the flames flicker over the 8
  // frames and each lights a soft-edged patch of the wall behind it
  const S = { light: mix(column, floor, 0.6), base: column, dark: clearOf(mix(column, wall, 0.55), [column], [wall], { step: 0.04 }) };
  const count = { from: 'density', map: [[0, 2], [1, 5]], round: 'px' };
  const torches = { count, lit: { from: 'torches', map: [[0, 0], [1, 1]] }, y: spring(-46), flame: ['flame1', 'flame2', 'glow', 'flame4'], iron: mix(wall, DARK, 0.5), ironLit: 'glow' };
  const mid = [
    { gen: 'wall.torches', v: 1, ...torches, show: 'glow', reach: 25, warm: [mix(mix(wall, column, 0.35), 'glow', 0.14), mix(mix(wall, column, 0.8), 'glow', 0.26)] },
    // the low step along the foot of the wall
    rect(0, 121, 320, 59, S.base), rect(0, 121, 320, 2, S.light), rect(0, 128, 320, 1, S.dark),
    { gen: 'scatter', v: 1, count: 8, seed: 7, jitter: 0.5, wrap: true, rows: [123, 123], place: { kind: 'rect', size: [2, 5], paint: S.dark, shade: 0 } },
    // three kinds of pillar by turns: a square pier of coursed stone, a slimmer column with two collars, a pier with one
    // collar and a broad foot
    { gen: 'pillars', v: 1, count, top: 0, bottom: 121, turns: 'three', seed: 1,
      a: { width: 22, capital: 4, foot: 5, courses: 13 }, b: { width: 16, capital: 5, foot: 4, collar: 30, collar2: 84 }, c: { width: 20, capital: 3, foot: 7, courses: 19, collar: 52 },
      bright: S.light, base: S.base, dark: S.dark },
    { gen: 'wall.torches', v: 1, ...torches, show: 'torch', face: 16, faces: { a: 22, b: 16, c: 20 }, faceWarm: [mix(S.base, 'glow', 0.2), mix(S.light, 'glow', 0.32)] },
  ];

  // ---- near: the flagstone floor, opaque from row 132: courses of big slabs (the "Slabs" paving of tiles-dungeon),
  // each taller and wider than the one behind; none shaded on the rows round the fighters' feet (146 to 154); a few chips
  const joint = clearOf(mix(floor, wall, 0.45), [floor]);
  const stone = { body: floor, joint, lit: mix(floor, 'cream', 0.3), dark: mix(floor, joint, 0.22) };
  const courses = [{ h: 6, period: 32 }, { h: 7, period: 40, shift: 9 }, { h: 13, period: 64 }, { h: 22, period: 80, shift: 23 }];
  const near = [];
  let y = 132;
  courses.forEach((c, k) => {
    near.push({ gen: 'paved.course', v: 1, top: y, h: c.h, period: c.period, shift: c.shift ?? 0, joints: k % 2 ? [4, 20] : [10, 29], shaded: 0.22, calm: y <= 154 && y + c.h > 146, seed: 87 + k, ...stone });
    y += c.h;
  });
  near.push({ gen: 'ground.marks', v: 1, top: 148, bottom: 176, count: 7, seed: 12, keep: [146, 154], dark: joint });

  return {
    ...head(r),
    blurb: 'A torch-lit hall for a side-view battle screen in three layers that repeat sideways, the fighters\' feet on row 150: scroll far at 0.1, mid at 0.4 and near at 0.7 of the camera\'s speed. Change the stone, floor, torch light, torches, pillars and arches.',
    palette: [slotFrom(r, 'stone', 'stone'), slotFrom(r, 'floor', 'stone'), slotFrom(r, 'glow', 'fire'),
      { id: 'night', default: '#231b33', material: 'stone', detail: true },
      { id: 'air', material: 'stone', derive: mix('night', 'stone', 0.22) },
      { id: 'cream', default: '#f0ead8', material: 'light', detail: true },
      { id: 'flame1', material: 'fire', derive: tone('glow', 1.6) },
      { id: 'flame2', material: 'fire', derive: mix(tone('glow', 1.6), 'glow', 0.5) },
      { id: 'flame4', material: 'fire', derive: tone('glow', -1) }],
    controls: controlsFrom(r),
    body: { layers: [
      // no single pixels at any setting: not wrapped in tidy
      { name: 'far', label: 'Far', scroll: 0.1, draw: far },
      { name: 'mid', label: 'Middle', scroll: 0.4, draw: mid },
      { name: 'near', label: 'Near', scroll: 0.7, draw: near },
    ] },
    clips: { far: { label: 'Far', frames: 1, fps: 4 }, mid: { label: 'Middle', frames: 8, fps: 4, sounds: r.sounds.mid }, near: { label: 'Near', frames: 1, fps: 4 } },
  };
}
