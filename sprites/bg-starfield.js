// Starfield: open space behind the Derelict Station, in three layers that tile sideways (docs/style-guide.md
// section 7), for menus, station windows and the gaps between rooms.
//   far   three flat bands of dark, soft nebula patches and dim stars; opaque
//   mid   brighter stars, some of them twinkling over the 8 frames, and a faint band of dust along the bottom with
//         a few motes drifting in it
//   near  the edge of a planet along the bottom, lit from the top right with its night side to the left; or a
//         planet with rings arching over it; or drifting wreckage
// Drawn with engine/backdrop.js (outlines that repeat every 320 px, things that wrap, colours mixed toward the
// colour of space, tones kept clear of what is behind them) and engine/space.js (the bands of space, stars that
// keep their places, nebula patches, the one broad rise of a planet's limb, tones that are lit against the dark).
// No outlines anywhere, and nothing as dark as the ink: space itself is the darkest thing in the picture, so every
// shape in front of it is lighter than the band it lies on, and its darkest tone stops at brightness 0.18.
// It goes with sprites/tiles-pit.js: the top band is the palette's void, the colour a pit opens onto, and the
// stars are the pit's own. The one background where the near layer is lighter than the far one: a sunlit planet
// against the dark.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, fract, hash } from '../engine/motion.js';
import { tone, mix } from '../engine/color.js';
import { polyIn } from '../engine/surface.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import {
  LAYER, PIVOT, layerClips, recede, standOut, ridge, shifted, scatter, fillBands, fillBelow, fillBetween, wrapped, tidy,
} from '../engine/backdrop.js';
import { spaceLook, arch, starField, nebula, lighterThan, noDarkerThan } from '../engine/space.js';
import { trussIn } from '../engine/shafts.js';
import { placedIn } from '../engine/shapes.js';

const D = PALETTE.derelict;
const [W, H] = LAYER;
const BANDS = [66, 124];                      // the rows where the next band of space starts

// The main tone of every shape, farthest first: mixed toward the colour of space (more the farther it is), then
// moved clear of what it is seen against, so no shape melts into the dark under a whole-bundle look. In space the
// dark is behind everything, so the dust and the land are moved lighter (lighterThan), never darker.
function tones(p) {
  const sky = spaceLook(p.sky, D.void), air = sky.air;
  const cloud = standOut(recede(p.haze, 0.74, air), sky.bands);
  // the dust is faint: one small step of value above the lowest band of space. Its lit edge and its motes are the
  // tone that is still there when a look with few colours turns the dust itself into that band
  const dust = lighterThan(recede(p.haze, 0.86, air), [], { also: [sky.bands[2]], step: 0.06 });
  const dustLit = lighterThan(tone(dust, 0.3), [sky.bands[2], dust], { step: 0.06 });
  const land = lighterThan(recede(p.land, 0.1, air), [sky.bands[2]], { also: [sky.bands[1]] });
  const cloudLit = standOut(tone(cloud, 0.7), [cloud]);
  return {
    sky, air, cloud, cloudLit, cloudCore: tone(cloudLit, 0.8), dust, dustLit, land,
    farStar: recede(D.steel, 0.42, air), star: recede(D.suit, 0, air), starDim: recede(D.panel, 0.2, air), heart: D.suit,
  };
}

// ---- the three near layers --------------------------------------------------------------------------------

// A planet's limb, lit from the top right, in three tones. The limb is one long, shallow swell across the layer
// (arch), level for many columns either side of its foot, which is on the join: two copies side by side show one
// long horizon, not a row of hills, and a layer that stands still, as behind a menu, shows one clean arc. It rises
// above the dust of the middle layer all along. Light and shade follow the limb: a sunlit band lies along the edge
// (broader on the side towards the sun), flat streaks of cloud lie on the body, and the night side comes up from
// below, further on the side away from the sun. The edge itself is the lightest thing: there is no line round it.
function planet(g, T, rise) {
  const body = T.land, lit = tone(body, 0.6), night = noDarkerThan(standOut(tone(body, -1), [body]), 0.19);
  const limb = arch({ base: 156, height: rise, at: 160 });
  const sunlit = arch({ base: 5, height: -4, at: 232 });                 // px of sunlit band under the limb: 5 to 9, most on the right of the top
  fillBelow(g, limb, body);
  fillBetween(g, limb, (x) => limb(x) + sunlit(x), lit);
  for (const c of scatter(5, 17, { jitter: 0.7 })) {
    const rx = 10 + Math.round(c.u * 12), y = Math.round(limb(c.x)) + 14 + Math.round(c.v * 4);
    wrapped(c.x, rx + 2, (x) => g.ellipse(x, y, rx, 2 + Math.round(c.w), lit));
  }
  fillBelow(g, shifted(limb, -40, 23), night);
}

// Rings round a planet, seen from close by and tilted: three bands that rise from behind its limb in one sweep
// and come down again on the far side of the join.
function rings(g, T) {
  const pale = lighterThan(recede(mix(T.land, D.cream, 0.45), 0.25, T.air), [T.sky.bands[1], T.sky.bands[2]], { also: [T.cloud] });
  const dim = noDarkerThan(lighterThan(tone(pale, -0.9), [T.sky.bands[2]], { also: [T.sky.bands[1]], step: 0.05 }), 0.19);
  const ring = arch({ base: 204, height: 104, at: 208 });
  fillBetween(g, ring, shifted(ring, 0, 4), pale);
  fillBetween(g, shifted(ring, 0, 6), shifted(ring, 0, 13), dim);
  fillBetween(g, shifted(ring, 0, 15), shifted(ring, 0, 18), pale);
}

// Drifting wreckage: a field of scrap along the bottom, two big pieces half a layer apart (a torn slab of hull with
// a mast, a broken length of a station's ring) and loose plates tumbling above them. Everything that is seen
// against space or the dust is the body tone or the lit one; the dark tone is only ever a shaded face, a window
// slot or the underside of the scrap, with the body all round it, and it stops well short of the ink.
function wreckage(g, T) {
  const body = T.land, lit = tone(body, 0.6), dark = noDarkerThan(standOut(tone(body, -0.8), [body]), 0.2);
  // loose plates: each a small tilted slab, three pixels or more across; the thicker ones show a shaded lower half
  for (const s of scatter(7, 21, { stable: true })) {
    const w = 5 + Math.round(s.u * 7), h = 3 + Math.round(s.w * 3), y = 118 + Math.round(s.v * 34), turn = (hash(s.i, 31) - 0.5) * 1.6;
    wrapped(s.x, w + 2, (x) => {
      const at = (dy, hh) => placedIn([polyIn([[-w / 2, dy], [w / 2, dy], [w / 2, dy + hh], [-w / 2, dy + hh]])], x, y, { angle: turn });
      g.fill(x - w, y - w, x + w, y + w, at(-h / 2, h), body);
      if (h >= 6) g.fill(x - w, y - w, x + w, y + w, at(0, h / 2), dark);
    });
  }
  // the slab of hull: a long box seen edge on, tilted, its top lit, with dark windows and a lattice mast
  wrapped(86, 60, (x) => {
    g.fill(x - 60, 96, x + 60, H, trussIn(x + 14.5, 106, x + 26.5, 150, { width: 9, bay: 6 }), body);
    g.fill(x - 60, 96, x + 60, H, trussIn(x + 14.5, 106, x + 26.5, 150, { width: 9, bay: 6, part: 'a' }), lit);
    g.poly([[x - 52, 152], [x + 44, 140], [x + 50, 158], [x + 30, 180], [x - 40, 180]], body);
    g.poly([[x - 52, 152], [x + 44, 140], [x + 45, 144], [x - 51, 156]], lit);
    g.poly([[x + 40, 146], [x + 46, 158], [x + 28, 180], [x + 22, 180], [x + 36, 160]], dark);
    for (let i = 0; i < 5; i++) g.rect(x - 38 + i * 14, 160 - Math.round(i * 1.75), 6, 4, dark);
  });
  // the length of ring: an arc of a wheel that stands out of the scrap on two spokes, shaded along its inner side
  wrapped(246, 64, (x) => {
    g.limb(x - 8, H, x - 22, 132, 3, body);
    g.limb(x + 12, H, x + 26, 126, 3, body);
    g.arc(x, 196, 78, Math.PI * 0.76, Math.PI * 1.2, 11, body);
    g.arc(x, 196, 82, Math.PI * 0.76, Math.PI * 1.2, 3, lit);
    g.arc(x, 196, 76, Math.PI * 0.76, Math.PI * 1.2, 3, dark);
  });
  // the scrap field: a strip across the whole bottom edge, broken and sharp (so it is not taken for water), with
  // bigger plates stuck in it at all angles, their upper faces catching the light, and a flat shade underneath
  const scrap = ridge({ base: 168, height: 10, seed: 12, peaks: 6, shape: 'jagged', rough: 0.9 });
  fillBelow(g, scrap, body);
  for (const s of scatter(6, 33, { jitter: 0.5 })) {
    const w = 9 + Math.round(s.u * 7), h = 5 + Math.round(s.w * 3), y = Math.round(scrap(s.x)) + 1, turn = (s.v - 0.5) * 1.5;
    wrapped(s.x, w + 2, (x) => {
      const at = (dy, hh) => placedIn([polyIn([[-w / 2, dy], [w / 2, dy], [w / 2, dy + hh], [-w / 2, dy + hh]])], x, y, { angle: turn });
      g.fill(x - w, y - w, x + w, y + w, at(-h / 2, h), body);
      g.fill(x - w, y - w, x + w, y + w, at(-h / 2, 3), lit);
    });
  }
  g.rect(0, 175, W, H - 175, dark);
}

export default defineSprite({
  id: 'bg-starfield',
  name: 'Starfield',
  kind: 'Effect',
  blurb: 'Deep space with nebula clouds, twinkling stars and a planet, a ringed planet or drifting wreckage along the bottom, in three layers that repeat sideways: scroll far at 0.1, mid at 0.4 and near at 0.7 of the camera\'s speed. Change the colours, how many stars there are and whether they twinkle.',
  meta: {
    type: 'background', role: 'environment/background', themes: ['sci-fi', 'space'], gameTypes: ['roguelike-action', 'shooter'], view: 'none',
    words: ['stars', 'starfield', 'night sky', 'galaxy', 'nebula', 'planet', 'rings', 'wreckage', 'cosmos', 'backdrop', 'parallax', 'menu', 'twinkle', 'scroll'],
    license: 'draft',
  },
  size: LAYER,
  pivot: PIVOT,
  grounded: false,
  preview: 'far',
  params: {
    style: choice('Style', 'planet', [{ value: 'planet', label: 'Planet edge' }, { value: 'ringed', label: 'Ringed planet' }, { value: 'wreckage', label: 'Wreckage' }]),
    stars: range('Stars', 0.5, { lo: 'Few', hi: 'Many' }),
    sparkle: toggle('Sparkle', true),
    sky: color('Space', D.plate, swatches('derelict', 'sky')),
    haze: color('Nebula', D.nebula, swatches('derelict', 'haze')),
    land: color('Planet', D.teal, swatches('derelict', 'land', { lead: 'teal' })),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: layerClips({ frames: { mid: 8 }, fps: (p) => 4 * lerp(0.65, 1.45, p.speed) }),

  render(g, { clip, t, p }) {
    const T = tones(p);

    if (clip === 'far') {
      fillBands(g, T.sky.bands, BANDS);
      // dim stars first, then the clouds over them: a star never sits half in a cloud
      starField(g, { count: Math.round(lerp(24, 84, p.stars)), seed: 4, top: 2, bottom: 176, colours: { bright: T.farStar }, plus: 0.14, big: 0 });
      // two nebulae half a layer apart, a big one and a smaller one, each with a brighter heart
      nebula(g, 96, 62, 170, 84, { base: T.cloud, light: T.cloudLit, core: T.cloudCore }, 3);
      nebula(g, 262, 116, 110, 50, { base: T.cloud, light: T.cloudLit }, 8, { lobes: 8 });
      tidy(g);
      return;
    }

    if (clip === 'mid') {
      starField(g, { count: Math.round(lerp(8, 30, p.stars)), seed: 9, top: 3, bottom: 152, colours: { dim: T.starDim, bright: T.star, heart: T.heart }, t: p.sparkle ? t : null, plus: 0.45, big: 0.16, twinkle: 0.7 });
      // the dust: a faint low swell across the whole bottom edge, lit along its top, with motes that drift along it.
      // It lies lower than the foot of every near layer (the planet's limb, the scrap field), so stacked it is hidden
      // whole, never a sliver over an edge; on its own it is what makes this layer reach from side to side
      const swell = ridge({ base: 172, height: 4, seed: 6, peaks: 2, rough: 0.2 });
      fillBelow(g, swell, T.dust);
      fillBetween(g, swell, shifted(swell, 0, 2), T.dustLit);
      for (const m of scatter(6, 13, { jitter: 0.8 })) {
        const life = fract(t + m.u);
        if (life < 0.75) wrapped(m.x + Math.round(8 * life), 6, (x) => g.rect(x, 174 + Math.round(m.v * 3), life < 0.5 ? 4 : 3, 2, T.dustLit));
      }
      return;
    }

    if (p.style === 'wreckage') wreckage(g, T);
    else {
      if (p.style === 'ringed') rings(g, T);
      planet(g, T, p.style === 'ringed' ? 10 : 13);
    }
    tidy(g);
  },
});
