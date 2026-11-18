// Dungeon battle backdrop: a hall under Hearthvale as a battle screen shows it, in three layers that tile sideways
// (docs/style-guide.md, section 7). The party stands on the left and the enemies on the right.
//   far   a dark wall pierced by round arches, each opening onto a passage that fades into black-blue
//   mid   evenly spaced pillars on a low step along the wall's foot, a torch on every second one; the flames
//         flicker over 8 frames and each lights a soft-edged patch of the wall behind it
//   near  the flagstone floor the fighters stand on, opaque from row 132 down: the big slabs of
//         sprites/tiles-dungeon.js, each course taller and wider than the one behind it
// Drawn with engine/backdrop.js (things that wrap, colours mixed toward the dark, tones kept clear of what is
// behind them) and engine/scenery.js (the arches, pillars, torches, patches of light and the paved floor).
// What is particular here: there is no sky, so the colour everything fades into is the dark of the passages, and
// the layers get LIGHTER as they come nearer: wall, pillars, floor, as in the map's dungeon, where the floor is
// the lightest stone. The flames are light and are not mixed toward the dark; nothing else is brighter than the floor.
import { defineSprite, range, color } from '../engine/sprite.js';
import { lerp, hash, wave } from '../engine/motion.js';
import { tone, mix } from '../engine/color.js';
import { rectIn } from '../engine/surface.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { LAYER, PIVOT, layerClips, recede, hazed, standOut, scatter, wrapped, fillBetween, tidy } from '../engine/backdrop.js';
import { steps } from '../engine/fx.js';
import { BATTLE, standOutLighter, arcade, pillar, wallTorch, wallRing, lightPatch, pavedFloor, groundMarks } from '../engine/scenery.js';

const HV = PALETTE.hearthvale;
const [W, H] = LAYER;
const STEP = 121;                              // the top of the low step the pillars stand on, along the foot of the wall
// The big slabs of the map's dungeon floor (the "Slabs" paving of sprites/tiles-dungeon.js): the columns of the
// upright joints in each of its two courses, per 32 px.
const SLABS = [[10, 29], [4, 20]];
// The courses of the floor from the wall to the front edge: each one taller, and its slabs wider, than the one
// behind. No level joint lies on the rows round the fighters' feet (147 to 157).
const COURSES = [{ h: 6, period: 32 }, { h: 7, period: 40, shift: 9 }, { h: 13, period: 64 }, { h: 22, period: 80, shift: 23 }];
// The three kinds of pillar, by turns, so no shape stands more than twice in the 320 px: a square pier of coursed
// stone, a slimmer column with two collars, and a pier with one collar and a broad foot.
const KINDS = [
  { width: 22, capital: 4, foot: 5, courses: 13, collars: [] },
  { width: 16, capital: 5, foot: 4, courses: 0, collars: [30, 84] },
  { width: 20, capital: 3, foot: 7, courses: 19, collars: [52] },
];

// The main tone of each layer, farthest first. The dark of the passages is the colour everything fades into
// ("Haze" thickens it); each tone is then made lighter until it is clear of the one behind it (standOutLighter),
// so the dark, the wall, the pillars and the floor stay four different values under any whole-bundle look.
function mainTones(p) {
  const h = p.haze;
  const air = mix(HV.ink, p.stone, 0.22);                                   // black-blue, a little lighter than the outline colour
  const wall = standOutLighter(recede(p.stone, hazed(0.5, h), air), [air]);
  const column = standOutLighter(recede(tone(p.stone, 0.4), hazed(0.2, h), air), [wall], { also: [air] });
  const floor = standOutLighter(recede(p.floor, hazed(0, h), air), [column], { also: [wall] });
  return { air, wall, column, floor };
}

export default defineSprite({
  id: 'bg-battle-dungeon',
  name: 'Dungeon battle backdrop',
  kind: 'Effect',
  blurb: 'A torch-lit hall for a side-view battle screen in three layers that repeat sideways (a dark wall of arches, pillars with flickering torches, a flagstone floor with the fighters\' feet on row 150): scroll far at 0.1, mid at 0.4 and near at 0.7 of the camera\'s speed. Change the stone, the floor, the torch light, the number of torches and pillars and the height of the arches.',
  meta: {
    type: 'background', role: 'environment/background', themes: ['fantasy', 'dungeon'], gameTypes: ['turn-based-rpg', 'card-game'], view: 'side',
    words: ['battle', 'fight', 'encounter', 'arena', 'crypt', 'vault', 'hall', 'pillars', 'arches', 'torches', 'flagstones', 'flicker', 'backdrop', 'underground'],
    license: 'draft',
  },
  size: LAYER,
  pivot: PIVOT,
  grounded: false,
  preview: 'far',
  params: {
    torches: range('Torches', 0.5, { lo: 'Few', hi: 'Many' }),
    height: range('Height', 0.5, { lo: 'Low arches', hi: 'High arches' }),
    density: range('Density', 0.5, { lo: 'Few pillars', hi: 'Many pillars' }),
    haze: range('Haze', 0.35, { lo: 'Clear', hi: 'Misty' }),
    // as in the map's dungeon: the walls keep to dark stones and the floor to light ones
    stone: color('Stone', HV.slate, [HV.slate, HV.bandit, HV.pine, HV.mage]),
    floor: color('Floor', HV.flagstone, [HV.flagstone, HV.cobble, HV.path, HV.wheat]),
    glow: color('Torch light', HV.fire, swatches('hearthvale', 'glow', { lead: 'fire' })),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: layerClips({ frames: { mid: 8 }, fps: (p) => 4 * lerp(0.65, 1.45, p.speed) }),
  sounds: { mid: [{ sound: 'fire', preset: 'Torch', frame: 0, volume: 0.35 }] },

  render(g, { clip, t, p }) {
    const T = mainTones(p);

    // the arches of the far wall, and the torches of the mid layer, which hang on the wall above them
    const spring = Math.round(lerp(106, 84, p.height)), crown = spring - 26, torchY = crown - 20;

    if (clip === 'far') {
      // the back wall, with the dark of the vault along its top
      const dim = mix(T.air, T.wall, 0.45), trim = T.column;
      g.rect(0, 0, W, H, T.wall);
      g.rect(0, 0, W, 12, T.air);
      g.rect(0, 12, W, 2, trim);
      // courses of stone, as short bars: fewer towards the floor
      for (const s of scatter(16, 5, { jitter: 0.9 })) wrapped(s.x, 14, (x) => g.rect(x - 6, 24 + Math.round(s.v * 4) * 9, 10 + Math.round(s.u * 4), 2, dim));
      // four round arches, a ring of stones round each; through it a passage, and at its far end a smaller arch into the dark
      const big = arcade({ count: 4, width: 52, crown, spring });
      fillBetween(g, arcade({ count: 4, width: 58, crown: crown - 3, spring }), big, trim);
      fillBetween(g, big, () => H, T.air);
      fillBetween(g, arcade({ count: 4, width: 36, crown: spring - 12, spring: spring + 6 }), () => H, dim);
      fillBetween(g, arcade({ count: 4, width: 20, crown: spring + 2, spring: spring + 12 }), () => H, T.air);
      // the imposts the arches spring from, one on each side of every pier
      for (let k = 0; k < 4; k++) for (const side of [-1, 1]) wrapped(k * 80 + side * 13, 8, (x) => g.rect(x - 4, spring, 8, 4, trim));
      tidy(g);
      return;
    }

    if (clip === 'mid') {
      const C = steps(p.glow, { white: false });                         // the flame: light, so it is not mixed toward the dark
      const S = { light: mix(T.column, T.floor, 0.6), base: T.column, dark: standOut(mix(T.column, T.wall, 0.55), [T.column], { also: [T.wall], step: 0.04 }) };
      const iron = { base: mix(T.wall, T.air, 0.5), light: C[2] };
      const n = Math.round(lerp(2, 5, p.density)), span = W / n;
      // which pillars carry a torch: the odd ones first (every second pillar at the default), then the rest
      const order = [...Array(n).keys()].sort((a, b) => (b % 2) - (a % 2) || a - b);
      const lit = new Set(order.slice(0, Math.max(1, Math.floor(lerp(1, n, p.torches) + 1e-6))));
      const at = (i) => Math.round(i * span);
      const flick = (i) => 0.75 + 0.15 * wave(t, hash(i, 3)) + 0.1 * wave(2 * t, hash(i, 4));      // 0.5..1, whole cycles: the loop closes; each torch on its own beat
      // the patches of wall the torches light: drawn first, behind the pillars
      const warm = [mix(mix(T.wall, T.column, 0.35), p.glow, 0.14), mix(mix(T.wall, T.column, 0.8), p.glow, 0.26)];
      for (const i of lit) lightPatch(g, at(i), torchY - 5, 25, warm, { level: flick(i), seed: i });
      // the low step along the foot of the wall
      g.rect(0, STEP, W, H - STEP, S.base);
      g.rect(0, STEP, W, 2, S.light);
      g.rect(0, STEP + 7, W, 1, S.dark);
      for (const s of scatter(8, 7, { jitter: 0.5 })) wrapped(s.x, 3, (x) => g.rect(x, STEP + 2, 2, 5, S.dark));
      for (let i = 0; i < n; i++) {
        const kind = KINDS[n % 2 && i === n - 1 ? 2 : i % 2];
        const box = pillar(g, at(i), { top: 0, bottom: STEP, ...kind, seed: i + 1, tones: S });
        if (!lit.has(i)) { wallRing(g, at(i), torchY - 4, { links: 2 + (i % 3), colour: iron.base }); continue; }
        // its own face catches the light too
        const face = [mix(S.base, p.glow, 0.2), mix(S.light, p.glow, 0.32)];
        wrapped(at(i), kind.width, (x) => lightPatch(g, x, torchY - 3, 13, face, { level: flick(i), squash: 1.4, seed: i + 9, clip: rectIn(x - kind.width / 2, box.top + 3, kind.width, box.bottom - box.top - 3) }));
        wallTorch(g, at(i), torchY, { t: t + hash(i, 5), cycles: 2, iron, colours: C });
      }
      tidy(g);
      return;
    }

    // near: the floor. Courses of big slabs with dark joints, a line of light along the back edge of each, a slab
    // here and there a shade darker (none on the rows round the feet), a few chips
    const joint = standOut(mix(T.floor, T.wall, 0.45), [T.floor]), stone = { body: T.floor, joint, lit: mix(T.floor, HV.cream, 0.3), shade: mix(T.floor, joint, 0.22) };
    pavedFloor(g, { top: BATTLE.ground, courses: COURSES, joints: SLABS, colours: stone, shaded: 0.22, clear: [BATTLE.feet - 4, BATTLE.feet + 4], seed: 3 });
    groundMarks(g, { top: BATTLE.ground + 16, bottom: 176, count: 7, seed: 12, clear: [BATTLE.feet - 4, BATTLE.feet + 4], colours: { dark: joint } });
    tidy(g);
  },
});
