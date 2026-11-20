// FROZEN COPY, not a sprite: sprites/bg-battle-field.js as it was on 2026-11-20 (build item T1), before the migration redraws it as
// data (docs/data-sprites.md section 7). Kept only for the tests about the framework its code uses (tests/helpers/library.mjs
// codeSprite, codeSpriteSource); imports point at ../../../. Never edit it; the build never scans tests/.
// Field battle backdrop: the meadow outside Hearthvale as a battle screen shows it, in three layers that tile
// sideways (docs/style-guide.md, section 7). The party stands on the left and the enemies on the right.
//   far   the sky in four flat bands, a sun or moon, flat-bottomed clouds, one row of soft hills with a few
//         cottages of the village on their slopes, under the terracotta roofs of the map's inn
//   mid   a grassy bank with a line of round trees (the oaks of the map) and a rail fence along it
//   near  the ground the fighters stand on, opaque from row 132 down: a tufted grass edge, then a band of worn
//         earth, kept calm round row 150 where the feet go, and a fringe of grass along the bottom
// Drawn with engine/backdrop.js (outlines that repeat every 320 px, things that wrap, colours mixed toward the
// sky) and engine/scenery.js (the moon, the clouds, the trees, cottages, fence and ground marks). No outlines anywhere.
// What is particular here: the earth is the lightest thing in the near layer and the grass round it the darkest,
// so a fighter's dark outline and a pale skeleton both show on it; the trees are the leaf green of the map's oaks,
// warmed with the meadow's green because the pale air cools everything mixed into it.
import { defineSprite, range, choice, color } from '../../../engine/sprite.js';
import { lerp, hash } from '../../../engine/motion.js';
import { tone, mix } from '../../../engine/color.js';
import { PALETTE, swatches } from '../../../engine/palettes.js';
import {
  LAYER, PIVOT, TIMES, layerClips, skyLook, recede, hazed, litTone, ridge, highest, shifted, scatter,
  fillBands, fillBelow, fillBetween, disc, stars, mistBand, tidy,
} from '../../../engine/backdrop.js';
import { BATTLE, standApart, roundTree, farHouse, railFence, tufts, groundMarks, moon, cloudBank } from '../../../engine/scenery.js';

const HV = PALETTE.hearthvale;
const BANDS = [36, 62, 88];      // the rows where the next sky band starts; the hills stand in the last, lightest one
const DARKEST = 0.26;            // no main tone sinks below this brightness, towards the outline colour of the fighters
const HILL_FOOT = 120;           // the lowest row of the far hills' valleys: behind the bank of the mid layer, so the hills roll on unbroken

// The main tone of each shape, farthest first. Each is receded into the air (0 = right behind the fighters,
// 1 = at the horizon; "Haze" moves all of them) and then moved clear of what it is seen against, so the layers
// stay apart under any whole-bundle look: the hills from the horizon band, the bank from the hills, the trees
// from the hills and the bank, the grass edge from the bank behind it and the earth below it.
function mainTones(p, sky) {
  const air = sky.air, h = p.haze, apart = standApart(p.time === 'night', DARKEST);
  const hill = apart(recede(tone(p.land, -0.25), hazed(0.58, h), air), [air], [sky.bands[2]]);
  const bank = apart(recede(tone(p.land, -0.1), hazed(0.3, h), air), [hill], [air]);
  const crown = apart(recede(tone(mix(HV.leaf, HV.meadow, 0.45), -0.45), hazed(0.02, h), air), [hill], [bank, air]);
  const wood = apart(recede(HV.wood, hazed(0.08, h), air), [bank], [hill]);
  const earth = apart(recede(tone(p.path, -0.15), hazed(0, h), air), [], [air]);
  const grass = apart(recede(tone(p.land, -0.45), hazed(0, h), air), [bank, earth], []);
  return { hill, bank, crown, wood, earth, grass };
}

export default defineSprite({
  id: 'bg-battle-field',
  name: 'Field battle backdrop',
  kind: 'Effect',
  blurb: 'A meadow for a side-view battle screen in three layers that repeat sideways (sky and soft hills, round trees behind a rail fence, a band of worn earth with the fighters\' feet on row 150): scroll far at 0.1, mid at 0.4 and near at 0.7 of the camera\'s speed. Change the time of day, the clouds, the hills, the trees and the colours of sky, grass and earth.',
  meta: {
    type: 'background', role: 'environment/background', themes: ['fantasy', 'forest'], gameTypes: ['turn-based-rpg', 'card-game'], view: 'side',
    words: ['battle', 'fight', 'encounter', 'arena', 'field', 'meadow', 'grassland', 'plains', 'hills', 'trees', 'fence', 'backdrop', 'scenery', 'outdoors'],
    license: 'draft',
  },
  size: LAYER,
  pivot: PIVOT,
  grounded: false,
  preview: 'far',
  params: {
    time: choice('Time of day', 'day', TIMES),
    clouds: range('Clouds', 0.45, { lo: 'Few', hi: 'Many' }),
    height: range('Height', 0.5, { lo: 'Low hills', hi: 'High hills' }),
    density: range('Density', 0.5, { lo: 'Few trees', hi: 'Many trees' }),
    haze: range('Haze', 0.35, { lo: 'Clear', hi: 'Misty' }),
    sky: color('Sky', HV.sky, swatches('hearthvale', 'sky')),
    // the grass keeps to greens and straw and the earth to browns and greys, so no pair of swatches is one colour
    land: color('Grass', HV.meadow, [HV.meadow, HV.leaf, HV.pine, HV.wheat]),
    path: color('Earth', HV.path, [HV.path, HV.cobble, HV.rust, HV.cream]),
  },
  clips: layerClips(),

  render(g, { clip, p }) {
    const sky = skyLook(p.sky, p.time);
    const air = sky.air, night = p.time === 'night';
    const T = mainTones(p, sky);

    if (clip === 'far') {
      fillBands(g, sky.bands, BANDS);
      // sun, low sun or moon: the one landmark, in the slowest layer
      if (p.time === 'day') disc(g, 284, 42, 9, sky.glow);
      else if (p.time === 'dusk') disc(g, 236, 84, 14, sky.glow);
      else {
        stars(g, 44, 5, mix(sky.glow, sky.bands[1], 0.35), { top: 2, bottom: 80 });
        moon(g, 284, 42, 9, sky.glow, mix(sky.glow, sky.bands[0], 0.28));
      }
      // clouds: more of them as the slider rises; the ones already there stay put, and where two meet they join into one
      cloudBank(g, scatter(Math.round(lerp(2, 8, p.clouds)), 12, { stable: true }).map((c) => ({ x: c.x, y: 12 + Math.round(c.v * 8) * 5, w: lerp(52, 30, c.v) + c.u * 8, seed: c.i })), sky.cloud, sky.cloudShade);
      // one row of soft hills, their right-hand slopes sunlit
      // (two swells in one tone, the lower one standing in the valleys of the higher, so the line never drops to the bank)
      const rise = lerp(22, 58, p.height);
      const hills = highest(ridge({ base: HILL_FOOT, height: rise, seed: 5, peaks: 3, shape: 'round', rough: 0.12 }), shifted(ridge({ base: HILL_FOOT, height: rise * 0.72, seed: 5, peaks: 3, shape: 'round', rough: 0.2 }), 53, 0));
      fillBelow(g, hills, T.hill);
      const hillLit = litTone(T.hill, air, 0.5);
      fillBetween(g, hills, shifted(hills, -4, 3), hillLit);
      // the village on the slopes: a cottage or two under each crest that is high enough to hold them. Walls are the
      // cream of the clouds (the moonlit tone of the hill at night), roofs a step darker than the hill; at dusk and at
      // night a window is lit
      const house = {
        wall: night ? hillLit : sky.cloud,
        roof: standApart(night)(recede(HV.roof, hazed(0.45, p.haze), air), [T.hill]),
        window: p.time === 'day' ? null : recede(HV.thunder, 0.1, air),
      };
      for (const s of scatter(3, 9, { jitter: 0.5 })) {
        let cx = s.x;
        for (let dx = -40; dx <= 40; dx += 4) if (hills(s.x + dx) < hills(cx)) cx = s.x + dx;      // the crest nearest to this place
        cx += Math.round((s.u - 0.5) * 20);
        const foot = Math.round(Math.max(hills(cx - 6), hills(cx + 14))) + 14;
        if (foot > 108) continue;                                                                 // the hill is too low here: no room above the bank
        farHouse(g, cx, foot, { width: 15, wall: 5, roof: 6, chimney: s.i % 2 === 0, tones: house });
        if (s.v > 0.3) farHouse(g, cx + 15, foot + 2, { width: 11, wall: 4, roof: 5, tones: house });
      }
      mistBand(g, 122, lerp(-4, 14, p.haze), air, 21);      // mist at the foot of the hills: it only rises over the bank when the air is thick
      tidy(g);
      return;
    }

    if (clip === 'mid') {
      // the bank: a low swell of meadow, lit along its top
      const bank = ridge({ base: 114, height: 5, seed: 9, peaks: 2, rough: 0.1 });
      fillBelow(g, bank, T.bank);
      fillBetween(g, bank, shifted(bank, 0, 2), litTone(T.bank, air, 0.5));
      // a line of round trees standing on it: more of them as the slider rises, no two alike
      // (the sunlit clumps lean toward the meadow's green)
      const leaves = { light: litTone(T.crown, recede(HV.meadow, hazed(0.08, p.haze), air), 0.7), base: T.crown, dark: tone(T.crown, -0.45) };
      const wood = { base: T.wood, dark: tone(T.wood, -0.5), lit: litTone(T.wood, air, 0.45) };
      for (const t of scatter(Math.round(lerp(3, 8, p.density)), 31, { stable: true })) {
        const tall = 44 + Math.round(t.u * 14);
        roundTree(g, t.x, Math.round(bank(t.x)) + 4, { height: tall, crown: tall * lerp(0.34, 0.4, t.v), trunk: 4 + Math.round(t.w * 2), lean: Math.round((hash(t.i, 82) - 0.5) * 6), tones: leaves, wood, seed: t.i + 3 });
      }
      // the rail fence in front of them: a gateway left open on each side of the middle, and a rail missing here and there
      railFence(g, shifted(bank, 0, 17), { posts: 16, height: 10, rails: [2, 6], open: [4, 11], broken: [[1, 0], [8, 1], [13, 0]], seed: 4, colours: { wood: wood.base, lit: wood.lit, shade: wood.dark } });
      tidy(g);
      return;
    }

    // near: the ground. A tufted edge of grass, a dark lip where the turf ends, then the earth
    const turf = { base: T.grass, dark: tone(T.grass, -0.3) };
    const soil = { base: T.earth, dark: tone(T.earth, -0.55), lit: litTone(T.earth, air, 0.4) };
    const edge = tufts({ base: BATTLE.ground, count: 30, seed: 3, height: 6 });
    fillBelow(g, edge, turf.base);
    fillBetween(g, shifted(edge, 0, 4), () => BATTLE.ground + 7, turf.dark);
    const lip = ridge({ base: BATTLE.ground + 8, height: 2, seed: 14, peaks: 7, rough: 0.5 });
    fillBelow(g, lip, soil.dark);
    fillBelow(g, shifted(lip, 0, 2), soil.base);
    // worn into it: scuffs and a pebble or two, none on the rows round the fighters' feet
    groundMarks(g, { top: BATTLE.ground + 12, bottom: 172, count: 13, seed: 6, clear: [BATTLE.feet - 5, BATTLE.feet + 3], pebbles: 0.3, colours: { dark: soil.dark, stone: soil.lit, light: soil.lit } });
    // a fringe of grass along the bottom edge, in the dark of the turf
    fillBelow(g, tufts({ base: 177, count: 22, seed: 8, height: 7 }), turf.dark);
    tidy(g);
  },
});
