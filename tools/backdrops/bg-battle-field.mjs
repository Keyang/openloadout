// Writes sprites/bg-battle-field.json: the field battle backdrop of the code sprite
// (tests/fixtures/code-sprites/bg-battle-field.js) as data (migration batch M10, colours named exactly in M10b). See
// tools/backdrops/lib.mjs.
import { rec, controlsFrom, slotFrom, head, sky, air, band, hz, haze, lit, tone, mix, apart, rect, ellipse, shifted, highest, codeClouds } from './lib.mjs';
import { ridgeOutline, spots } from '../../engine/gen/backdrop.js';
import { lerp } from '../../engine/motion.js';

const DARKEST = 0.26;      // no main tone sinks below this brightness, towards the outline colour of the fighters

/** The main tones, farthest first, as the code's mainTones works them out (engine/scenery.js standApart(night, DARKEST) of each tone receded into the air). */
function tones() {
  const A = (of, depth, behind, also) => apart(of, { air: air(), depth: hz(depth), behind, also, darkest: DARKEST });
  const hill = A(tone('land', -0.25), 0.58, [air()], [band(0.7)]);
  const bank = A(tone('land', -0.1), 0.3, [hill], [air()]);
  const crown = A(tone('crown', -0.45), 0.02, [hill], [bank, air()]);
  const wood = A('wood', 0.08, [bank], [hill]);
  const earth = A(tone('path', -0.15), 0, [], [air()]);
  const grass = A(tone('land', -0.45), 0, [bank, earth], []);
  return { hill, bank, crown, wood, earth, grass };
}

export function definition(root) {
  const r = rec(root, 'bg-battle-field');
  const T = tones();

  // ---- far: the sky, a sun or moon, clouds, a row of soft hills with cottages on their crests, mist at their foot
  const glow = sky('glow');
  const sun = {
    day: [{ gen: 'disc', v: 1, at: [284, 42], r: 9, paint: glow }],
    dusk: [{ gen: 'disc', v: 1, at: [236, 84], r: 14, paint: glow }],
    night: [{ gen: 'stars', v: 1, count: 44, seed: 5, top: 2, bottom: 80, plus: 0.25, big: 0, paint: mix(glow, band(0.38), 0.35) },
      { gen: 'disc', v: 1, at: [284, 42], r: 9, paint: glow },
      ...[[-0.33, -0.33, 0.267, 0.267], [0.44, 0.33, 0.29, 0.245], [0.22, -0.66, 0.167, 0.167]].map(([dx, dy, rx, ry]) => ellipse(284 + Math.round(dx * 9), 42 + Math.round(dy * 9), Math.max(1.5, rx * 9), Math.max(1.5, ry * 9), mix(glow, band(0), 0.28)))],
  };
  const rise = (k) => ({ from: 'height', map: [[0, 22 * k], [1, 58 * k]] });
  const first = { kind: 'ridge', base: 120, height: rise(1), seed: 5, peaks: 3, shape: 'round', rough: 0.12 }, second = { kind: 'ridge', base: 120, height: rise(0.72), seed: 5, peaks: 3, shape: 'round', rough: 0.2, dx: 53 };
  const hillLit = lit(T.hill, 0.5, air());
  // cottages on the crests (the code's three places at the default height); each stands where the hills are high enough
  // to hold it above the bank: its foot follows the Height slider, and it is shown only where it stood in the code
  const houses = [];
  {
    const H = (height) => { const rs = lerp(22, 58, height); return highest(ridgeOutline({ base: 120, height: rs, seed: 5, peaks: 3, shape: 'round', rough: 0.12 }), shifted(ridgeOutline({ base: 120, height: rs * 0.72, seed: 5, peaks: 3, shape: 'round', rough: 0.2 }), 53, 0)); };
    const hills = H(0.5), steps = Array.from({ length: 21 }, (_, i) => i / 20);
    // walls the cream of the clouds (the moonlit tone of the hill at night), roofs a step from the hill, a lit window
    const walls = { rule: 'choose', when: { time: ['night'] }, then: hillLit, else: sky('cloud') };
    const roof = apart('roof', { air: air(), depth: hz(0.45), behind: [T.hill] });
    const lamp = haze('thunder', 0.1, air());
    for (const s of spots(3, 9, { jitter: 0.5 }, 320)) {
      let cx = s.x;
      for (let dx = -40; dx <= 40; dx += 4) if (hills(s.x + dx) < hills(cx)) cx = s.x + dx;
      cx += Math.round((s.u - 0.5) * 20);
      const feet = steps.map((h) => { const f = H(h); return Math.round(Math.max(f(cx - 6), f(cx + 14))) + 14; });
      const shown = steps.filter((h, i) => feet[i] <= 108);
      if (!shown.length) continue;
      const when = { height: [{ atLeast: shown[0] }] };
      const foot = { from: 'height', map: steps.map((h, i) => [h, feet[i]]).filter((p, i, a) => i === 0 || i === a.length - 1 || p[1] !== a[i - 1][1] || p[1] !== a[i + 1][1]) };
      const lampOn = { from: 'time', pick: { day: false, dusk: true, night: true } };
      houses.push({ gen: 'far.house', v: 1, when, at: [cx, foot], width: 15, wall: 5, roof: 6, chimney: s.i % 2 === 0, window: lampOn, walls, tiles: roof, lamp });
      if (s.v > 0.3) houses.push({ gen: 'far.house', v: 1, when, at: [cx + 15, { ...foot, map: foot.map.map(([h, f]) => [h, f + 2]) }], width: 11, wall: 4, roof: 5, window: lampOn, walls, tiles: roof, lamp });
    }
  }
  // clouds: more of them as the slider rises; the ones already there stay put (the code joined two that meet into one
  // bank, its shade left off where another cloud lies under it: here each keeps its own shade)
  const clouds = codeClouds(spots, { seed: 12, top: 12, rows: 8, wide: [52, 30], paint: sky('cloud'), under: band(0.7) });
  const BANDS = [rect(0, 0, 320, 36, band(0)), rect(0, 36, 320, 26, band(0.38)), rect(0, 62, 320, 26, band(0.7)), rect(0, 88, 320, 92, band(1))];
  const far = [
    // the night sky's stars and moon stand clear of everything else: drawn as they are
    { gen: 'tidy', v: 1, when: { time: ['night'] }, most: 700, draw: [...BANDS, ...sun.night, ...clouds] },
    { gen: 'tidy', v: 1, draw: [
      ...BANDS.map((x) => ({ ...x, when: { time: ['day', 'dusk'] } })),
      ...['day', 'dusk'].flatMap((time) => sun[time].map((x) => ({ ...x, when: { time: [time] } }))), ...clouds.map((x) => ({ ...x, when: { ...x.when, time: ['day', 'dusk'] } })),
      // one row of soft hills, two swells in one tone, the lower standing in the valleys of the higher, right slopes sunlit
      { gen: 'ridge', v: 1, base: 120, height: rise(1), seed: 5, peaks: 3, shape: 'round', rough: 0.12, paint: T.hill },
      { gen: 'fill.below', v: 1, ground: second, paint: T.hill },
      { gen: 'edge.band', v: 1, ground: first, also: second, dx: -4, dy: 3, paint: hillLit },
      ...houses,
      // mist at the foot of the hills (the code's mistBand(122, lerp(-4, 14, haze)): its waving top that far above row
      // 122, below it when thin), only rising over the bank when the air is thick
      { gen: 'mist.band', v: 1, at: { from: 'haze', map: [[0, 126], [1, 108]] }, height: 0, seed: 21, paint: air() },
    ] },
  ];

  // ---- mid: a grassy bank lit along its top, a line of round trees on it, a rail fence in front of them
  const bankGround = { kind: 'ridge', base: 114, height: 5, seed: 9, peaks: 2, rough: 0.1 };
  const mid = [
    { gen: 'tidy', v: 1, most: 16, draw: [
      { gen: 'ridge', v: 1, base: 114, height: 5, seed: 9, peaks: 2, rough: 0.1, paint: T.bank },
      { gen: 'fill.between', v: 1, ground: bankGround, from: 0, to: 2, paint: lit(T.bank, 0.5, air()) },
      // the sunlit clumps lean toward the meadow's green
      { gen: 'round.trees', v: 1, ground: bankGround, count: { from: 'density', map: [[0, 3], [1, 8]], round: 'px' }, seed: 31, sink: 4, tall: 44, vary: 14,
        leaf: T.crown, lit: lit(T.crown, 0.7, haze('meadow', hz(0.08), air())), dark: tone(T.crown, -0.45), wood: T.wood, woodDark: tone(T.wood, -0.5) },
    ] },
    { gen: 'tidy', v: 1, most: 16, draw: [
      { gen: 'rail.fence', v: 1, ground: { ...bankGround, dy: 17 }, posts: 16, height: 10, rails: [2, 6], open: [4, 11], missing: 3, seed: 4,
        wood: T.wood, lit: lit(T.wood, 0.45, air()), shadow: tone(T.wood, -0.5) },
    ] },
  ];

  // ---- near: the ground the fighters stand on, opaque from row 132: a tufted grass edge, a dark lip, worn earth with
  // scuffs and pebbles kept off the rows round the feet (150), a fringe of grass along the bottom
  const turfDark = tone(T.grass, -0.3);
  const soil = { base: T.earth, dark: tone(T.earth, -0.55), lit: lit(T.earth, 0.4, air()) };
  const near = [
    { gen: 'tufts', v: 1, base: 132, count: 30, seed: 3, height: 6, paint: T.grass },
    { gen: 'tufts', v: 1, base: 132, count: 30, seed: 3, height: 6, from: 4, to: 139, paint: turfDark },
    { gen: 'ridge', v: 1, base: 140, height: 2, seed: 14, peaks: 7, rough: 0.5, paint: soil.dark },
    { gen: 'fill.below', v: 1, ground: { kind: 'ridge', base: 140, height: 2, seed: 14, peaks: 7, rough: 0.5, dy: 2 }, paint: soil.base },
    { gen: 'ground.marks', v: 1, top: 144, bottom: 172, count: 13, seed: 6, keep: [145, 153], pebbles: 0.3, dark: soil.dark, stone: soil.lit, gleam: soil.lit },
    { gen: 'tufts', v: 1, base: 177, count: 22, seed: 8, height: 7, paint: turfDark },
  ];

  return {
    ...head(r),
    blurb: 'A meadow for a side-view battle screen in three layers that repeat sideways, the fighters\' feet on row 150: scroll far at 0.1, mid at 0.4 and near at 0.7 of the camera\'s speed. Change the time of day, clouds, hills, trees and colours.',
    palette: [slotFrom(r, 'sky', 'sky'), slotFrom(r, 'land', 'plant'), slotFrom(r, 'path', 'earth'),
      { id: 'crown', default: '#65ac58', material: 'plant', detail: true }, { id: 'meadow', default: '#7fbf5a', material: 'plant', detail: true },
      { id: 'wood', default: '#9a6a3e', material: 'wood', detail: true }, { id: 'roof', default: '#c8553a', material: 'earth', detail: true },
      { id: 'thunder', default: '#f4e06a', material: 'light', detail: true }],
    controls: controlsFrom(r),
    body: { layers: [
      { name: 'far', label: 'Far', scroll: 0.1, draw: far },
      { name: 'mid', label: 'Middle', scroll: 0.4, draw: mid },
      // no single pixels at any setting: not wrapped in tidy
      { name: 'near', label: 'Near', scroll: 0.7, draw: near },
    ] },
    clips: { far: { label: 'Far', frames: 1, fps: 4 }, mid: { label: 'Middle', frames: 1, fps: 4 }, near: { label: 'Near', frames: 1, fps: 4 } },
  };
}
