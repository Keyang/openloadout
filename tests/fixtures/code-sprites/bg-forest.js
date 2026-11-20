// FROZEN COPY, not a sprite: sprites/bg-forest.js as it was on 2026-11-20 (migration batch M10, review round 3), before the migration redraws it
// as data (docs/data-sprites.md section 7). Kept for the tests that hold the redraw to the code's look (tests/unit/backdrop-redraw-drift.test.mjs,
// through tests/helpers/library.mjs codeSprite); imports point at ../../../. Never edit it; the build never scans tests/.
// Forest backdrop: three layers that tile sideways (docs/style-guide.md, section 7).
//   far   the sky in four flat bands, a sun or moon, flat-bottomed clouds, one distant mountain ridge
//   mid   two rows of rounded hills with tree clumps on their crests
//   near  trunks and heavy canopy masses rising from the bottom edge, with gaps to see through
// Everything is drawn with engine/backdrop.js: outlines that repeat every 320 px, scattered
// things that wrap, and colours mixed toward the sky (more for the far layers). No outlines.
// This file is the worked example for a landscape background.
import { defineSprite, range, choice, color } from '../../../engine/sprite.js';
import { lerp, hash } from '../../../engine/motion.js';
import { ramp, tone, mix } from '../../../engine/color.js';
import { PALETTE, swatches } from '../../../engine/palettes.js';
import {
  LAYER, PIVOT, TIMES, layerClips, skyLook, recede, hazed, standOut, litTone, ridge, treeline, litEdge, shifted, scatter,
  fillBands, fillBelow, fillBetween, wrapped, disc, cloud, canopy, stars, mistBand, tidy,
} from '../../../engine/backdrop.js';

const P = PALETTE.thornwood;
const BANDS = [34, 62, 90];     // the rows where the next sky band starts; the mountains stand in the last, lightest one

// The main tone of each layer, farthest first. Each is receded into the air (0 = right behind the
// game, 1 = at the horizon; "Haze" moves all of them) and then made to stand out from what it is
// seen against (standOut), so that the layers stay apart under any whole-bundle colour preset:
// the ridge from the horizon band, the hills from the ridge, the trees from the hills.
// At night the sky is dark and the land is moonlit: a smaller step, and lighter instead of darker.
function mainTones(p, sky) {
  const air = sky.air, h = p.haze, night = p.time === 'night';
  const out = (c, sure, also) => (night ? standOut(c, [], { also: [...sure, ...also], step: 0.05 }) : standOut(c, sure, { also }));
  const rock = out(recede(tone(p.land, -0.4), hazed(0.55, h), air), [air], [sky.bands[2]]);
  const back = out(recede(tone(p.land, -0.3), hazed(0.4, h), air), [air], [rock]);
  const front = out(recede(tone(p.land, -0.3), hazed(0.15, h), air), [back], [rock]);
  const leaf = out(recede(ramp(p.leaf).dark, hazed(0, h), air), [back], [front]);
  const bark = out(recede(ramp(mix(P.soil, p.leaf, 0.2)).dark, hazed(0, h), air), [back], [front]);
  return { rock, back, front, leaf, bark };
}

export default defineSprite({
  id: 'bg-forest',
  name: 'Forest backdrop',
  kind: 'Effect',
  blurb: 'Sky, hills and tall trees in three layers that repeat sideways: scroll far at 0.1, mid at 0.4 and near at 0.7 of the camera\'s speed. Change the time of day, the colours, the clouds and how thick the forest is.',
  meta: {
    type: 'background', role: 'environment/background', themes: ['fantasy', 'forest'], gameTypes: ['platformer'], view: 'side',
    words: ['woodland', 'woods', 'trees', 'hills', 'mountains', 'sky', 'clouds', 'backdrop', 'scenery', 'parallax', 'scroll', 'sunset', 'night', 'outdoors'],
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
    density: range('Density', 0.5, { lo: 'Few trees', hi: 'Thick forest' }),
    haze: range('Haze', 0.35, { lo: 'Clear', hi: 'Misty' }),
    sky: color('Sky', P.sky, swatches('thornwood', 'sky')),
    land: color('Hills', P.haze, swatches('thornwood', 'land', { lead: 'haze' })),
    leaf: color('Trees', P.leaf, swatches('thornwood', 'leaf')),
  },
  clips: layerClips(),

  render(g, { clip, p }) {
    const sky = skyLook(p.sky, p.time);
    const air = sky.air;
    const T = mainTones(p, sky);

    if (clip === 'far') {
      fillBands(g, sky.bands, BANDS);
      // sun, low sun or moon: the one landmark, in the slowest layer
      if (p.time === 'day') disc(g, 236, 26, 10, sky.glow);
      else if (p.time === 'dusk') disc(g, 232, 104, 15, sky.glow);
      else {
        stars(g, 46, 5, mix(sky.glow, sky.bands[1], 0.35), { top: 2, bottom: 86 });
        disc(g, 236, 28, 10, sky.glow);
        const crater = mix(sky.glow, sky.bands[0], 0.28);
        g.ellipse(233, 25, 2.4, 2.4, crater).ellipse(240, 31, 3, 2.4, crater).ellipse(238, 22, 1.5, 1.5, crater);
      }
      // clouds: more of them as the slider rises; the ones already there stay put
      for (const c of scatter(Math.round(lerp(2, 8, p.clouds)), 12, { stable: true })) {
        cloud(g, c.x, 14 + Math.round(c.v * 9) * 5, lerp(54, 30, c.v) + c.u * 8, sky.cloud, sky.cloudShade, c.i);
      }
      // one distant ridge, its sunlit faces lighter, its feet lost in the mist of the horizon band
      const peaks = ridge({ base: 156, height: lerp(44, 84, p.height), seed: 3, peaks: 4, shape: 'jagged', rough: 0.55 });
      fillBelow(g, peaks, T.rock);
      fillBetween(g, peaks, litEdge(peaks, { depth: 0.75 }), litTone(T.rock, air, 0.45));
      mistBand(g, 156, lerp(0, 14, p.haze), air, 21);
      tidy(g);
      return;
    }

    if (clip === 'mid') {
      const rise = lerp(18, 46, p.height);
      const rows = [
        { hill: ridge({ base: 150, height: rise, seed: 7, peaks: 3, rough: 0.15 }), tone: T.back, depth: 0.4, clumps: Math.round(lerp(4, 11, p.density)), tall: 12, seed: 4 },
        { hill: ridge({ base: 172, height: rise * 0.8, seed: 15, peaks: 2, rough: 0.2 }), tone: T.front, depth: 0.15, clumps: Math.round(lerp(3, 9, p.density)), tall: 17, seed: 9 },
      ];
      for (const r of rows) {
        // clumps of four trees on the upper slopes of the hills
        const ys = Array.from({ length: 32 }, (_, i) => r.hill(i * 10 + 5));
        const line = lerp(Math.min(...ys), Math.max(...ys), 0.7);
        const trees = [];
        for (const c of scatter(r.clumps, r.seed, { stable: true })) {
          if (r.hill(c.x) > line) continue;
          for (let k = 0; k < 4; k++) trees.push({ x: c.x + Math.round((k - 1.5) * r.tall * 0.55), u: hash(c.i, 60 + k), v: hash(c.i, 70 + k) });
        }
        const wood = treeline({ base: r.hill, height: r.tall, shape: 'round', width: 1.15, at: trees });
        const woodTone = standOut(recede(tone(p.leaf, -0.9), hazed(r.depth, p.haze), air), [r.tone]);
        fillBelow(g, wood, woodTone);
        fillBetween(g, wood, shifted(wood, -2, 3), litTone(woodTone, air, 0.5));
        fillBelow(g, r.hill, r.tone);
        fillBetween(g, r.hill, shifted(r.hill, -3, 3), litTone(r.tone, air, 0.55));
      }
      tidy(g);
      return;
    }

    // near: the darkest layer. No two trees alike: big ones with a side crown on the left, the right,
    // both or neither, trunks that lean and differ in width, and every third tree a slim young one.
    const tones = { light: litTone(T.leaf, air, 0.3), base: T.leaf, dark: tone(T.leaf, -0.45) };
    const wood = { light: litTone(T.bark, air, 0.3), base: T.bark, dark: tone(T.bark, -0.45) };
    for (const t of scatter(Math.round(lerp(2, 5, p.density)), 31, { stable: true })) {
      const young = t.i % 3 === 1;
      const r = young ? 13 + Math.round(t.u * 4) : 24 + Math.round(t.u * 14);
      const top = young ? 122 - Math.round(t.v * 24) : 112 - r - Math.round(t.v * 44);
      const w = young ? 5 : 7 + Math.round(hash(t.i, 81) * 6), flare = young ? 2 : 5, band = young ? 2 : 3;
      const lean = Math.round((hash(t.i, 82) - 0.5) * (young ? 12 : 24));      // the crown stands this far to the side of the root
      const sides = young ? 0 : 1 + Math.floor(hash(t.i, 83) * 3.99) % 4;      // side crowns: 1 left, 2 right, 3 both, 0 neither
      wrapped(t.x, r * 2.2 + Math.abs(lean) + 10, (x) => {
        const cx = x + lean, lt = cx - w / 2, rt = cx + w / 2, lb = x - w / 2 - 2, rb = x + w / 2 + 1;
        if (sides & 1) g.limb(cx - 1, top + r + 16, cx - r * 0.75, top + r * 0.3, 4, wood.dark);
        if (sides & 2) g.limb(cx + 1, top + r + 22, cx + r * 0.8, top + r * 0.4, 4, wood.base);
        // trunk: wider at the root, a shadow down its left side, a lit strip down its right
        g.poly([[lt, top], [rt, top], [rb, 150], [rb + flare, 180], [lb - flare, 180], [lb, 150]], wood.base);
        g.poly([[lt, top], [lt + band, top], [lb + band, 150], [lb - flare + band, 180], [lb - flare, 180], [lb, 150]], wood.dark);
        if (!young) g.poly([[rt - 3, top], [rt, top], [rb, 150], [rb + flare, 180], [rb + flare - 3, 180], [rb - 3, 150]], wood.light);
      });
      if (sides & 1) canopy(g, t.x + lean - r * 0.72, top + r * 0.42, r * 0.62, tones, t.i + 20);
      if (sides & 2) canopy(g, t.x + lean + r * 0.78, top + r * 0.36, r * 0.58, tones, t.i + 40);
      canopy(g, t.x + lean, top, r, tones, t.i + 3);
    }
    // undergrowth: bushes across the whole bottom edge
    fillBelow(g, ridge({ base: 172, height: 6, seed: 23, peaks: 7, rough: 0.4 }), tones.dark);
    for (const b of scatter(11, 17, { jitter: 0.7 })) canopy(g, b.x, 174 + Math.round(b.v * 4), 12 + Math.round(b.u * 3), tones, b.i + 60);
    tidy(g);
  },
});
