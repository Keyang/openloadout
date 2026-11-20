// Writes sprites/bg-castle.json: the castle backdrop of the code sprite (tests/fixtures/code-sprites/bg-castle.js) as
// data (migration batch M10, colours named exactly in M10b). See tools/backdrops/lib.mjs.
import { rec, controlsFrom, slotFrom, head, sky, air, band, hz, haze, lit, tone, mix, apart, rect, ellipse } from './lib.mjs';

/** The main tone of each layer, farthest first, as the code's mainTones works them out (stand.apart: at night a smaller step, from all of them). */
function tones() {
  const A = (of, depth, behind, also) => apart(of, { air: air(), depth: hz(depth), behind, also });
  const crags = A('land', 0.6, [air()], [band(0.7)]);
  const wall = A('land', 0.32, [crags], [air()]);
  const near = A(tone('land', -1.1), 0, [wall], [crags]);
  return { crags, wall, near };
}

/** Stone in three tones and a fourth for openings, round its main tone (the code's stone). */
const stone = (base, l = 0.55, shade = 0.55) => ({ light: lit(base, l, air()), base, dark: tone(base, -shade), deep: tone(base, -0.3 - shade) });

export function definition(root) {
  const r = rec(root, 'bg-castle');
  const T = tones();
  const lamp = haze('lamp', 0.1, air());

  // ---- far: a sun by day, a moon at dusk and at night; crags with a tower or two on each, a row of several so no one
  // marks the repeat, the first few with a lit window; mist at their feet
  const glow = sky('glow');
  const moonDusk = mix(glow, 'cream', 0.6);
  const craters = (paint) => [[80, 25, 3, 3], [88, 32, 3.5, 3], [86, 21, 2, 2]].map(([x, y, rx, ry]) => ellipse(x, y, rx, ry, paint));
  const sun = {
    day: [{ gen: 'disc', v: 1, at: [84, 24], r: 10, paint: glow }],
    dusk: [{ gen: 'disc', v: 1, at: [84, 28], r: 12, paint: moonDusk }, ...craters(mix(moonDusk, band(0), 0.25))],
    night: [{ gen: 'stars', v: 1, count: 40, seed: 8, top: 2, bottom: 70, plus: 0.25, big: 0, paint: mix(glow, band(0.38), 0.35) },
      { gen: 'disc', v: 1, at: [84, 28], r: 12, paint: glow }, ...craters(mix(glow, band(0), 0.25))],
  };
  const SC = stone(T.crags, 0.5);
  const cragsGround = { kind: 'ridge', base: 128, height: 36, seed: 11, peaks: 5, shape: 'jagged', rough: 0.5 };
  const BANDS = [rect(0, 0, 320, 20, band(0)), rect(0, 20, 320, 18, band(0.38)), rect(0, 38, 320, 18, band(0.7)), rect(0, 56, 320, 124, band(1))];
  const far = [
    // the night sky's stars and moon stand clear of everything else: drawn as they are
    { gen: 'tidy', v: 1, when: { time: ['night'] }, most: 700, draw: [...BANDS, ...sun.night] },
    { gen: 'tidy', v: 1, draw: [
      ...BANDS.map((x) => ({ ...x, when: { time: ['day', 'dusk'] } })),
      ...['day', 'dusk'].flatMap((time) => sun[time].map((x) => ({ ...x, when: { time: [time] } }))),
      { gen: 'towers', v: 1, ground: cragsGround, count: 9, seed: 6, jitter: 0.5, sink: 6, lit: { from: 'windows', map: [[0, 1], [1, 9]], round: 'px' }, stone: SC.base, lamp },
      { gen: 'ridge', v: 1, base: 128, height: 36, seed: 11, peaks: 5, shape: 'jagged', rough: 0.5, paint: SC.base, litEdge: { depth: 0.7, paint: SC.light } },
      { gen: 'mist.band', v: 1, at: 128, height: { from: 'haze', map: [[0, 0], [1, 12]] }, seed: 21, paint: air() },
    ] },
  ];

  // ---- mid: a long castle wall: battlements, blind arches, turrets and bastions by turns, windows lit as the slider rises
  const SW = stone(T.wall);
  const mid = [
    { gen: 'tidy', v: 1, draw: [
      { gen: 'castle.wall', v: 1, top: { from: 'height', map: [[0, 122], [1, 92]], round: 'px' }, bays: 4, lit: { from: 'windows', map: [[0, 0], [1, 1]] }, seed: 5,
        bright: SW.light, base: SW.base, dark: SW.dark, deep: SW.deep, lamp },
    ] },
  ];

  // ---- near: an arcade seen from inside, the darkest layer: columns from the floor to the vault, an arch between each
  // pair, a banner dropping from the top edge over each column. A pale banner never outshines the sky: by day and dusk
  // it is kept a small step darker than the air (the code's standOut of the banner from the air, step 0.04)
  const SN = stone(T.near);
  const cloth0 = haze('accent', hz(0.06), air());
  const cloth = { rule: 'choose', when: { time: ['night'] }, then: cloth0, else: { rule: 'clear.of', v: 1, of: cloth0, behind: ['clear'], also: [air()], step: 0.04, way: 'darker' } };
  const count = { from: 'density', map: [[0, 2], [1, 4]], round: 'px' };
  const opening = { from: 'density', map: [[0, 142], [0.2499, 142], [0.25, 88.667], [0.7499, 88.667], [0.75, 62], [1, 62]] };
  const near = [
    { gen: 'tidy', v: 1, most: 600, draw: [
      { gen: 'arcade', v: 1, count, width: opening, crown: 10, spring: 56, side: 'above', top: 0, to: 180, paint: SN.base },
      { gen: 'arcade', v: 1, count, width: opening, crown: 10, spring: 56, side: 'above', depth: 3, paint: SN.dark },
      { gen: 'castle.columns', v: 1, count, spring: 56, shaft: 18, foot: 154, bright: SN.light, base: SN.base, dark: SN.dark },
      { gen: 'banners', v: 1, count, width: 22, length: 36, short: 28, cloth, dark: tone(cloth, -0.8), trim: lit(cloth, 0.5, air()) },
      // the floor: a ledge across the whole bottom edge
      rect(0, 168, 320, 12, SN.base), rect(0, 168, 320, 3, SN.light), rect(0, 176, 320, 4, SN.dark),
    ] },
  ];

  return {
    ...head(r),
    palette: [slotFrom(r, 'sky', 'sky'), slotFrom(r, 'land', 'stone'), slotFrom(r, 'accent', 'cloth'),
      { id: 'lamp', default: '#ecae2f', material: 'light', detail: true }, { id: 'cream', default: '#f0ead8', material: 'light', detail: true }],
    controls: controlsFrom(r),
    body: { layers: [
      { name: 'far', label: 'Far', scroll: 0.1, draw: far },
      { name: 'mid', label: 'Middle', scroll: 0.4, draw: mid },
      { name: 'near', label: 'Near', scroll: 0.7, draw: near },
    ] },
    clips: { far: { label: 'Far', frames: 1, fps: 4 }, mid: { label: 'Middle', frames: 1, fps: 4 }, near: { label: 'Near', frames: 1, fps: 4 } },
  };
}
