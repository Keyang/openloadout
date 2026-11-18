// A small top-down tileset made with the tile helper, used by the tile tests and by
// `node tools/tilemap.mjs --file tests/fixtures/quality/sprite-files/q-room-tiles.js`:
// a floor, a path laid over it (a second ground), a wall with a front face, and a pit.
// It is a test fixture, not a catalogue asset, but it is also the shortest example of
// the three kinds of top-down block (docs/style-guide.md, section 6).
import { defineSprite, range, color, toggle } from '../../../../engine/sprite.js';
import { ramp, mix, INK } from '../../../../engine/color.js';
import { blockClips, decoClips, drawBlock, pieceOf, patternFill, scatter, edgeWave } from '../../../../engine/tiles.js';

const one = { frames: 1, fps: 1, loop: true };
// outlines that wander: 0 at both ends of every edge and for most of its length (see engine/tiles.js, insetAt)
const dent = (seed, px) => (u) => (edgeWave(u, seed, [2, 3]) > 0.7 ? px : 0);

function materials(p) {
  const grass = ramp(p.floor), path = ramp(p.path), stone = ramp(p.stone);
  const edge = Math.round(p.edge);
  const rim = { depth: edge, inset: p.wobble ? dent(3, 2) : null, paint: (d) => (d === 1 ? path.light : d === edge ? mix(p.path, path.dark, 0.5) : null) };
  return {
    floor: { fill: patternFill(p.floor, (s) => scatter(5, 5, { gap: 8 }).forEach((m) => { s.rect(m.x, m.y, 1, 2, grass.dark); s.dot(m.x + 1, m.y, grass.light); })) },
    // a second ground: floor on floor, so its line is the material's own dark tone, not ink; the same rim all round (mitred corners)
    path: { ink: path.dark, round: 1, fill: patternFill(p.path, (s) => scatter(9, 4, { gap: 9 }).forEach((m) => s.rect(m.x, m.y, 2, 1, path.dark))), top: rim, side: rim, bottom: rim },
    // a wall: the cap is lit, with a lighter rim on the top and right and a darker one on the left; the bottom row is its face
    wall: {
      ink: INK,
      fill: patternFill(p.stone, (s) => scatter(13, 4, { gap: 9 }).forEach((m) => s.rect(m.x, m.y, 2, 1, stone.dark))),
      top: { depth: edge, paint: (d) => (d <= 2 ? stone.light : null) },
      right: { depth: edge, paint: (d) => (d <= 1 ? stone.light : null) },
      left: { depth: edge, paint: (d) => (d <= 2 ? mix(p.stone, stone.dark, 0.5) : null) },
      face: {
        paint: (x, y) => (y === 0 ? stone.base : y % 9 === 8 || (x + (Math.floor(y / 9) % 2) * 8) % 16 === 0 ? stone.deep : stone.dark),   // courses of blocks
        shadow: mix(p.floor, grass.deep, 0.6),
      },
    },
    // a hole: the top edge shows the inner wall going down; the other sides are a thin lip
    pit: {
      ink: INK,
      fill: () => '#1c1830',
      top: { depth: edge + 6, paint: (d, u) => (d <= 2 ? stone.dark : d % 5 === 0 || (u + d) % 11 === 0 ? '#241e3c' : stone.deep) },
      side: { depth: 2, paint: () => stone.deep },
      bottom: { depth: 1, paint: () => stone.dark },
    },
  };
}

export default defineSprite({
  id: 'q-room-tiles', name: 'Test room tiles', kind: 'Item', blurb: 'Test fixture: a top-down floor, path, wall and pit.',
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
    ...blockClips('path', { kind: 'ground' }),
    ...blockClips('wall', { kind: 'wall' }),
    ...blockClips('pit', { kind: 'hole' }),
    ...decoClips('floor', ['on']),
  },
  render(g, { clip, t, p }) {
    const k = pieceOf(clip), m = materials(p);
    if (k.kind === 'block') return drawBlock(g, k.piece, m[k.prefix], t);
    // the decal: a crack in the floor, drawn straight on the tile (nothing over a floor is outlined)
    const dark = ramp(p.floor).dark;
    g.line(10, 12, 15, 17, dark); g.line(15, 17, 14, 22, dark); g.line(15, 17, 21, 19, dark);
  },
});
