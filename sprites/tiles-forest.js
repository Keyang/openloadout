// Forest ground tiles: grass over soil, for a side-view level. The worked example of a
// tileset made with the tile helper (engine/tiles.js): the ground is described once, as a
// material, and the helper draws every piece of the block, the thin ledge and the slopes
// from it, so every piece joins every other. Only the three decals are drawn by hand.
//
// Where things are (docs/style-guide.md, section 6):
//   grass-left   grass-top   grass-right        thin ledge: grass-thin-l  -thin-m  -thin-r
//   grass-side-l grass-fill  grass-side-r       slopes:     grass-slope-up (rises to the right), grass-slope-down
//   grass-bottom-l  -bottom  -bottom-r          decals:     grass-deco-a tuft, -b flowers, -c stone; each goes in
//   inner corners: grass-inner-tl -tr -bl -br               the empty cell above a top tile and stands on its top line
//   ground one tile thick: grass-strip-l -strip-m -strip-r (a strip), grass-col-t -col-m -col-b (a column), grass-single
//   grass-fill-b, grass-fill-c: two more versions of the fill, with other marks; whoever lays out a level mixes the
//   three by position (pickClip in the helper does), so a field of soil does not show a 32 px grid
import { defineSprite, range, color, toggle } from '../engine/sprite.js';
import { ramp, mix, INK } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { blockClips, thinClips, slopeClips, decoClips, drawTile, drawDecal, patternFill, scatter, edgeWave, textureTone } from '../engine/tiles.js';

const P = PALETTE.thornwood;

// How far the top line dips at each column, 0..1 (times the Surface control, in px). Two dips and, between
// them, a level stretch from column 9 to 22: that is where the decals stand (the checker fails a decal with
// a gap under it), and it gives a crate or a hero something flat under its feet however lumpy the ground is.
// The first and last three columns are level too, so a corner of the block is never a spike.
const DIPS = [0, 0, 0, 0.3, 0.67, 1, 1, 0.67, 0.3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.3, 0.67, 1, 1, 0.67, 0.3, 0, 0, 0];
// How far the grass hangs below the cap's shortest depth at each column (0 to 3 px): pointed clumps, the
// ragged lower edge. The cap is `edge` px deep where this is 3.
const HANG = [1, 2, 1, 0, 0, 1, 2, 3, 2, 0, 0, 1, 1, 0, 2, 3, 1, 0, 0, 1, 2, 1, 0, 0, 1, 3, 2, 1, 0, 0, 2, 1];
// How far the underside is pulled in at each column (px): ragged soil. Like DIPS it starts and ends on 0 and
// spends much of its length there, because the helper pins every outline to the tile boundary at both ends
// of an edge: a profile that sat at 1 or 2 everywhere would show a nub at every tile join.
const UNDER = [0, 0, 1, 1, 2, 1, 0, 1, 2, 3, 2, 1, 1, 0, 0, 1, 2, 2, 1, 0, 1, 1, 2, 3, 2, 1, 0, 0, 1, 1, 0, 0];
// Where roots come through the underside (columns where UNDER is 0 or 1), and how long each is.
const ROOTS = [{ u: 6, len: 9 }, { u: 13, len: 6 }, { u: 19, len: 10 }, { u: 27, len: 7 }];
// A streak of darker earth, 19 px long, that ends inside the tile: where it is, per column, from column 6.
const STREAK = [0, 0, 1, 1, 1, 2, 2, 1, 1, 0, 0, 0, 1, 1, 2, 2, 2, 1, 1];

// The ground as a material: everything the helper needs to draw any piece of it.
function ground(p) {
  const soil = ramp(p.soil), grass = ramp(p.grass);
  // Marks of soil are drawn in textureTone: the dark of the soil's ramp, the nearest tone that no whole-bundle
  // look (engine/theme.js) turns back into plain soil. Pebbles are their own material.
  const clod = textureTone(p.soil);
  const pebble = textureTone(p.stone, p.soil), pebbleLit = mix(p.stone, pebble, 0.4);
  const root = mix(soil.light, p.soil, 0.45);
  const edge = Math.round(p.edge), bumps = Math.round(p.bumps);

  // The inside, in three versions. Version 0 is what every edge piece has behind its edge, and is the plainest.
  // Each has its own few marks, kept off the outer 4 px: clods, pebbles, and in version 1 a streak of darker earth.
  // Texture adds marks (none to three per version); a level mixes the versions, so no mark sits on a 32 px grid.
  const busy = Math.round(p.texture * 3);
  const drawClod = (s, m) => { s.rect(m.x, m.y, 2, 1, clod); s.dot(m.x + 1, m.y + 1, clod); };
  const drawPebble = (s, m) => { s.rect(m.x, m.y, 3, 2, pebble); s.rect(m.x + 1, m.y - 1, 2, 1, pebble); s.dot(m.x + 2, m.y - 1, pebbleLit); };
  const versions = [
    patternFill(p.soil, (s) => scatter(41, 3, { margin: 4, gap: 10 }).slice(0, busy).forEach((m, i) => (i === 2 ? drawPebble : drawClod)(s, m))),
    patternFill(p.soil, (s) => {
      scatter(57, 3, { margin: 4, gap: 9, y0: 4, y1: 12 }).slice(0, 1 + Math.min(1, busy)).forEach((m) => drawClod(s, m));
      if (busy >= 1) STREAK.forEach((dy, i) => s.rect(6 + i, 19 + dy, 1, busy >= 3 ? 2 : 1, clod));
    }),
    patternFill(p.soil, (s) => scatter(73, 4, { margin: 4, gap: 9 }).slice(0, 1 + busy).forEach((m, i) => (i % 2 === 0 ? drawPebble : drawClod)(s, m))),
  ];
  const fill = (x, y, t, v) => versions[v ?? 0](x, y);

  const rootAt = (d, u) => ROOTS.find((r) => d <= r.len && u === r.u + (d > r.len - 3 ? 1 : 0));   // a root kinks sideways near its top
  return {
    ink: INK,
    round: 1,
    fill,
    // The grass cap, `edge` px deep at its longest counting the ink line. Its last row is the shadow it casts on the soil.
    top: {
      depth: edge,
      wrap: 4,                                                 // the cap hangs 4 px down the side at the top corners
      tuck: true,                                              // and carries on into an inner corner and under a slope's foot
      inset: (u) => DIPS[u] * bumps,
      ragged: (u) => Math.min(3 - HANG[u], edge - 4),          // a thin cap is less ragged, so it never loses its green
      paint: (d, u, t, here) => (
        d === here ? soil.dark                                 // the shadow under the cap
          : d === 1 ? grass.light                              // the lit top row
            : d === here - 1 ? grass.dark                      // the underside of the cap
              : d === 2 && HANG[u] === 0 ? grass.light         // a few taller lit blades
                : d >= 3 && HANG[u] >= 2 && d >= here - 3 ? grass.dark   // the hanging clumps are in shade
                  : grass.base),
    },
    // The sides are bare soil, with one pixel of shade down the left (the light comes from the top right).
    // They are straight but for a dent here and there.
    left: { depth: 1, inset: (u) => (bumps && edgeWave(u, 23, [2, 3]) > 0.8 ? 1 : 0), paint: () => soil.dark },
    right: { inset: (u) => (bumps && edgeWave(u, 29, [2, 3]) > 0.8 ? 1 : 0) },
    // The underside: ragged soil in shade, with roots when they are on. A root reaches the tile boundary.
    bottom: {
      depth: p.roots ? 11 : 2,
      tuck: 2,                                                 // in an inner corner only a touch of shade, never half a root
      inset: (u) => (p.roots && ROOTS.some((r) => Math.abs(u - r.u) <= 1) ? 0 : UNDER[u]),
      paint: (d, u) => (p.roots && rootAt(d, u) ? root : d <= 2 ? soil.dark : null),
    },
  };
}
// A thin ledge has a tidier underside: 12 px leaves no room for roots.
const ledgeUnderside = (p) => ({ depth: 1, inset: (u) => Math.min(1, UNDER[u]), paint: () => ramp(p.soil).dark });

// ---- the decals: small plants and a stone, standing on the level stretch of the top line -------
// Each is drawn in the bottom rows of its own cell; the game puts it in the empty cell above a top tile.

function tuft(s, p) {
  const grass = ramp(p.grass);
  // blades: [column, height]; the tallest in the middle, tips lit
  for (const [x, h] of [[10, 3], [11, 5], [12, 4], [13, 7], [14, 6], [15, 9], [16, 6], [17, 8], [18, 5], [19, 6], [20, 3], [21, 2]]) {
    s.rect(x, 32 - h, 1, h, x % 3 === 1 ? grass.dark : grass.base);
    s.dot(x, 32 - h, grass.light);
  }
}
function flowers(s, p) {
  const grass = ramp(p.grass), petal = ramp(p.flowers);
  for (const [x, h] of [[11, 7], [16, 11], [21, 8]]) {
    s.rect(x, 32 - h, 1, h, grass.dark);                       // stem
    s.rect(x + 1, 32 - Math.floor(h / 2), 2, 1, grass.base);   // leaf
    const y = 32 - h - 1;                                      // the head: four petals round a light middle
    s.rect(x - 1, y - 1, 3, 3, petal.base);
    s.dot(x + 1, y - 1, petal.light); s.dot(x - 1, y + 1, petal.dark);
    s.dot(x, y, mix(petal.light, '#ffffff', 0.6));
  }
}
function stone(s, p) {
  const rock = ramp(p.stone);
  s.ellipse(16, 32, 5.6, 6.4, rock, { shade: 2, light: 1 });   // only the top half is inside the frame: the rest is buried
  s.rect(14, 28, 1, 2, rock.dark); s.dot(15, 27, rock.dark);   // a crack
}
const DECALS = { 'grass-deco-a': tuft, 'grass-deco-b': flowers, 'grass-deco-c': stone };

export default defineSprite({
  id: 'tiles-forest',
  name: 'Forest ground tiles',
  kind: 'Item',
  blurb: 'Grassy earth for a side-view level, with a ledge, slopes and small plants; change the colours, how deep the grass is and how lumpy the ground.',
  meta: {
    type: 'tileset',
    role: 'world/tile',
    themes: ['fantasy', 'forest'],
    gameTypes: ['platformer'],
    view: 'side',
    words: ['grass', 'ground', 'dirt', 'soil', 'earth', 'floor', 'terrain', 'hill', 'slope', 'ledge', 'walk', 'level', 'meadow'],
    license: 'draft',
  },
  size: [32, 32],
  pivot: [16, 16],
  grounded: false,
  preview: 'grass-top',
  params: {
    edge: range('Edge', 7, { min: 5, max: 9, step: 1, lo: 'Thin', hi: 'Deep' }),
    bumps: range('Surface', 1, { min: 0, max: 3, step: 1, lo: 'Flat', hi: 'Lumpy' }),
    texture: range('Texture', 0.5, { lo: 'Plain', hi: 'Busy' }),
    roots: toggle('Roots', false),
    grass: color('Grass', P.grass, swatches('thornwood', 'grass')),
    soil: color('Soil', P.soil, swatches('thornwood', 'ground', { lead: 'soil' })),
    stone: color('Stone', P.stone, swatches('thornwood', 'stone')),
    flowers: color('Flowers', P.crimson, swatches('thornwood', 'accent', { lead: 'crimson' })),
  },
  clips: {
    ...blockClips('grass', { kind: 'ground', narrow: true, fills: 3 }),
    ...thinClips('grass', { label: 'Grass ledge' }),
    ...slopeClips('grass'),
    ...decoClips('grass', [{ place: 'above', label: 'Grass tuft' }, { place: 'above', label: 'Flowers' }, { place: 'above', label: 'Half-buried stone' }]),
  },
  render(g, { clip, t, p }) {
    // block, ledge and slope pieces all come from the one material
    if (drawTile(g, clip, ground(p), t, { thickness: 12, bottom: ledgeUnderside(p) })) return;
    // the stone is solid ground, so it gets the block's outline; plants are soft and get none
    if (clip === 'grass-deco-c') drawDecal(g, (s) => stone(s, p));
    else DECALS[clip](g, p);
  },
});
