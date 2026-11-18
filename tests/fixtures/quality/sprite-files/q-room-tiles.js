// A top-down tileset made with the tile helper: the worked example for the top-down kits, and a fixture of the
// tile tests. A floor, a path laid over it (a second ground), a wall with a front face, and a pit: the three kinds
// of top-down block (docs/style-guide.md, section 6). Look at it with
//   node tools/tilemap.mjs --file tests/fixtures/quality/sprite-files/q-room-tiles.js
// which builds a room with a doorway in two walls, a pillar, a wall one tile wide and a wall one tile deep.
//
// What to copy:
//   - one material per block, built from the controls; the helper draws every piece (drawBlock)
//   - blockClips(prefix, { kind }) says what each block is, so maps and the playground need not guess from the name
//   - the wall asks for the narrow pieces (narrow: true): without them a wall must be two tiles thick everywhere
//   - a wall is at least two tiles deep where it should look full height: the upper row is its cap, the lower its
//     face. One tile deep it is drawn as a face under a sliver of cap, and reads as a low wall
//   - floor on floor (the path) takes the material's own dark for its line; things you bump into take INK
//   - every tone is a step of a ramp (light, dark, deep) or textureTone, so the whole-bundle looks keep them apart
// (A real tileset holds one or two blocks and at most 32 clips; this one shows all three kinds at once.)
import { defineSprite, range, color, toggle } from '../../../../engine/sprite.js';
import { ramp, INK } from '../../../../engine/color.js';
import { blockClips, decoClips, drawBlock, pieceOf, patternFill, scatter, edgeWave, textureTone } from '../../../../engine/tiles.js';

const one = { frames: 1, fps: 1, loop: true };
// An outline that wanders: 0 at both ends of every edge and for most of its length, with a dent here and there
// (the helper pins outlines to the tile boundary at the ends; a profile that sat at 1 everywhere would show a nub).
const dent = (seed, px) => (u) => (edgeWave(u, seed, [2, 3]) > 0.7 ? px : 0);

function materials(p) {
  const path = ramp(p.path), stone = ramp(p.stone);
  const edge = Math.round(p.edge);
  // the same rim on every side of the path: no `tuck`, so inner corners are mitred
  const rim = { depth: edge, inset: p.wobble ? dent(3, 2) : null, paint: (d) => (d === 1 ? path.light : d === edge ? path.dark : null) };
  return {
    floor: { fill: patternFill(p.floor, (s) => scatter(5, 5, { margin: 4, gap: 8 }).forEach((m) => { s.rect(m.x, m.y, 1, 2, textureTone(p.floor)); s.dot(m.x + 1, m.y, textureTone(p.floor)); })) },
    path: {
      ink: path.dark, round: 1,
      fill: patternFill(p.path, (s) => scatter(9, 4, { margin: 6, gap: 9 }).forEach((m) => s.rect(m.x, m.y, 2, 1, textureTone(p.path)))),
      top: rim, side: rim, bottom: rim,
    },
    // a wall: its cap is lit, with a light rim along the top and right and a dark one down the left; `face` makes
    // the bottom row its front
    wall: {
      ink: INK,
      fill: patternFill(p.stone, (s) => scatter(13, 4, { margin: 6, gap: 9 }).forEach((m) => s.rect(m.x, m.y, 2, 1, textureTone(p.stone)))),
      top: { depth: edge, paint: (d) => (d <= 2 ? stone.light : null) },
      right: { depth: edge, paint: (d) => (d <= 1 ? stone.light : null) },
      left: { depth: edge, paint: (d) => (d <= 2 ? stone.dark : null) },
      face: {
        paint: (x, y) => (y % 9 === 8 || (x + (Math.floor(y / 9) % 2) * 8) % 16 === 0 ? stone.deep : stone.dark),   // courses of blocks
        shadow: textureTone(p.floor),
      },
    },
    // a hole: its top edge shows the inner wall going down; the other sides are a thin lip
    pit: {
      ink: INK,
      fill: () => '#1c1830',
      top: { depth: edge + 6, paint: (d, u) => (d <= 2 ? stone.dark : d % 5 === 0 || (u + d) % 11 === 0 ? '#2a2444' : stone.deep) },
      side: { depth: 2, paint: () => stone.deep },
      bottom: { depth: 1, paint: () => stone.dark },
    },
  };
}

export default defineSprite({
  id: 'q-room-tiles', name: 'Test room tiles', kind: 'Item', blurb: 'A top-down floor, path, wall and pit: the worked example for top-down tilesets.',
  meta: { type: 'tileset', role: 'world/tile', themes: ['fantasy'], gameTypes: ['top-down-rpg'], view: 'top-down', words: ['floor', 'wall', 'path', 'pit', 'room', 'dungeon'], license: 'draft' },
  size: [32, 32], pivot: [16, 16], grounded: false, preview: 'wall-bottom',
  params: {
    edge: range('Edge', 4, { min: 3, max: 6, step: 1, lo: 'Thin', hi: 'Deep' }),
    wobble: toggle('Worn path', true),
    floor: color('Floor', '#7fbf5a', ['#7fbf5a', '#4f9d57', '#e6c96a']),
    path: color('Path', '#c9a06a', ['#c9a06a', '#a8a4a0', '#e6c96a']),
    stone: color('Stone', '#a8a4a0', ['#a8a4a0', '#5a5f7a', '#c9a06a']),
  },
  clips: {
    'floor-fill': { ...one, label: 'Floor' },
    ...blockClips('path', { kind: 'ground', narrow: true, lanes: true }),      // lanes: a path one tile wide bends, forks and crosses with its rim unbroken
    ...blockClips('wall', { kind: 'wall', narrow: true }),
    ...blockClips('pit', { kind: 'hole' }),
    ...decoClips('floor', ['on']),
  },
  render(g, { clip, t, p }) {
    const k = pieceOf(clip), m = materials(p);
    if (k.kind === 'block') return drawBlock(g, k.piece, m[k.prefix], t);
    // the decal: a crack in the floor, drawn straight on the tile (nothing over a floor is outlined)
    const dark = textureTone(p.floor);
    g.line(10, 12, 15, 17, dark); g.line(15, 17, 14, 22, dark); g.line(15, 17, 21, 19, dark);
  },
});
