// Writes sprites/bg-forest.json: the forest backdrop of the code sprite (tests/fixtures/code-sprites/bg-forest.js) as
// data (migration batch M10, colours named exactly in M10b). See tools/backdrops/lib.mjs.
import { rec, controlsFrom, slotFrom, head, sky, air, band, hz, lit, tone, mix, ramp, apart, perTime, rect, ellipse, codeClouds } from './lib.mjs';
import { spots } from '../../engine/gen/backdrop.js';

/**
 * The main tones, farthest first, as the code's mainTones works them out: each receded into the air ("Haze" moves all
 * of them), then kept clear of what it is seen against (stand.apart: the ridge from the air, the hills from the ridge,
 * the trees from the hills; at night a smaller step, from all of them). `at`: one time of day, else bound to Time.
 */
function tones(at) {
  const A = (of, depth, behind, also) => apart(of, { air: air(at), depth: hz(depth), behind, also, night: at });
  const rock = A(tone('land', -0.4), 0.55, [air(at)], [band(0.7, at)]);
  const back = A(tone('land', -0.3), 0.4, [air(at)], [rock]);
  const front = A(tone('land', -0.3), 0.15, [back], [rock]);
  const leaf = A('leaf.dark', 0, [back], [front]);
  const bark = A('bark', 0, [back], [front]);
  // the trees on each row of hills: a plain standOut from the row's tone, by day and night alike
  const wood = [[0.4, back], [0.15, front]].map(([d, against]) => apart(tone('leaf', -0.9), { air: air(at), depth: hz(d), behind: [against], night: false }));
  return { rock, back, front, leaf, bark, wood };
}

export function definition(root) {
  const r = rec(root, 'bg-forest');
  const T = tones();

  // ---- far: the sky in four flat bands, a sun, a low sun or a moon over stars, clouds, one distant ridge, its sunlit
  // faces lighter, its feet in the mist of the horizon band
  const glow = sky('glow');
  const sun = {
    day: [{ gen: 'disc', v: 1, at: [236, 26], r: 10, paint: glow }],
    dusk: [{ gen: 'disc', v: 1, at: [232, 104], r: 15, paint: glow }],
    night: [
      { gen: 'stars', v: 1, count: 46, seed: 5, top: 2, bottom: 86, plus: 0.25, big: 0, paint: mix(glow, band(0.38), 0.35) },
      { gen: 'disc', v: 1, at: [236, 28], r: 10, paint: glow },
      ...[[233, 25, 2.4, 2.4], [240, 31, 3, 2.4], [238, 22, 1.5, 1.5]].map(([x, y, rx, ry]) => ellipse(x, y, rx, ry, mix(glow, band(0), 0.28))),
    ],
  };
  // clouds: more of them as the slider rises; the ones already there stay put
  const clouds = codeClouds(spots, { seed: 12, top: 14, rows: 9, wide: [54, 30], paint: sky('cloud'), under: band(0.7) });
  const BANDS = [rect(0, 0, 320, 34, band(0)), rect(0, 34, 320, 28, band(0.38)), rect(0, 62, 320, 28, band(0.7)), rect(0, 90, 320, 90, band(1))];
  const far = [
    // the night sky's stars and moon stand clear of everything else: drawn as they are
    { gen: 'tidy', v: 1, when: { time: ['night'] }, most: 650, draw: [...BANDS, ...sun.night, ...clouds] },
    { gen: 'tidy', v: 1, draw: [
      ...BANDS.map((x) => ({ ...x, when: { time: ['day', 'dusk'] } })),
      ...['day', 'dusk'].flatMap((time) => sun[time].map((x) => ({ ...x, when: { time: [time] } }))), ...clouds.map((x) => ({ ...x, when: { ...x.when, time: ['day', 'dusk'] } })),
      { gen: 'ridge', v: 1, base: 156, height: { from: 'height', map: [[0, 44], [1, 84]] }, seed: 3, peaks: 4, shape: 'jagged', rough: 0.55, paint: T.rock, litEdge: { depth: 0.75, paint: lit(T.rock, 0.45, air()) } },
      { gen: 'mist.band', v: 1, at: 156, height: { from: 'haze', map: [[0, 0], [1, 14]] }, seed: 21, paint: air() },
    ] },
  ];

  // ---- mid: two rows of rounded hills, lit along the top, with clumps of trees on their upper slopes. Written once
  // per time of day (perTime): the front row's trees name the chain of four tones, which with Time bound would nest
  // past the 20 levels a definition may have
  const rise = (k) => ({ from: 'height', map: [[0, 18 * k], [1, 46 * k]] });
  // (the whole layer tidied at once, as the code's tidy did)
  const mid = perTime((at) => {
    const X = tones(at);
    return [{ gen: 'tidy', v: 1, most: 16, draw: [
      { n: 0, base: 150, k: 1, seed: 7, peaks: 3, rough: 0.15, tone: X.back, clumps: [4, 11], tall: 12, treeSeed: 4 },
      { n: 1, base: 172, k: 0.8, seed: 15, peaks: 2, rough: 0.2, tone: X.front, clumps: [3, 9], tall: 17, treeSeed: 9 },
    ].flatMap((row) => {
      const trees = X.wood[row.n];
      const ground = { kind: 'ridge', base: row.base, height: rise(row.k), seed: row.seed, peaks: row.peaks, rough: row.rough };
      return [
        { gen: 'ridge', v: 1, base: row.base, height: rise(row.k), seed: row.seed, peaks: row.peaks, rough: row.rough, paint: row.tone },
        { gen: 'edge.band', v: 1, ground, dx: -3, dy: 3, paint: lit(row.tone, 0.55, air(at)) },
        { gen: 'treeline', v: 1, ground, clumps: { from: 'density', map: [[0, row.clumps[0]], [1, row.clumps[1]]], round: 'px' }, tall: row.tall, seed: row.treeSeed,
          paint: trees, lit: { dx: -2, dy: 3, paint: lit(trees, 0.5, air(at)) } },
      ];
    }) }];
  });

  // ---- near: the darkest layer: the undergrowth's dark foot, the tall trees, bushes across the whole bottom edge
  // tall.trees shades its crowns and trunks from the leaf and bark tones and the air as the code did (lit 0.3 towards
  // the air, dark a tone of -0.45), so the call names each chain of tones once
  const near = [
    { gen: 'tidy', v: 1, most: 16, draw: [
      { gen: 'ridge', v: 1, base: 172, height: 6, seed: 23, peaks: 7, rough: 0.4, paint: tone(T.leaf, -0.45) },
      { gen: 'tall.trees', v: 1, count: { from: 'density', map: [[0, 2], [1, 5]], round: 'px' }, seed: 31, leaf: T.leaf, bark: T.bark, air: air(),
        bushes: 11, bushSeed: 17, bushRows: [174, 178], bushSize: 12 },
    ] },
  ];

  return {
    ...head(r),
    palette: [slotFrom(r, 'sky', 'sky'), slotFrom(r, 'land', 'earth'), slotFrom(r, 'leaf', 'plant'), { id: 'soil', default: '#7a4f33', material: 'wood', detail: true },
      { id: 'bark', material: 'wood', derive: ramp(mix('soil', 'leaf', 0.2), 'dark') }],
    controls: controlsFrom(r),
    body: { layers: [
      { name: 'far', label: 'Far', scroll: 0.1, draw: far },
      { name: 'mid', label: 'Middle', scroll: 0.4, draw: mid },
      { name: 'near', label: 'Near', scroll: 0.7, draw: near },
    ] },
    clips: { far: { label: 'Far', frames: 1, fps: 4 }, mid: { label: 'Middle', frames: 1, fps: 4 }, near: { label: 'Near', frames: 1, fps: 4 } },
  };
}
