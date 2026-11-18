// Fixture for the playground tests: a top-down tileset with the names of docs/style-guide.md section 6:
// a floor (floor-fill alone), a wall block whose bottom row is its front face, a pit block and a floor decal.
import { defineSprite, color } from '../../../engine/sprite.js';
import { tone } from '../../../engine/color.js';
import { blockClips, clip, drawPiece } from './block.js';

export default defineSprite({
  id: 'play-room',
  name: 'Test room',
  kind: 'Item',
  blurb: 'A floor, walls and a pit seen from above, used by the playground tests.',
  meta: {
    type: 'tileset', role: 'world/tile', themes: ['neutral'], gameTypes: ['top-down-rpg'], view: 'top-down',
    words: ['tiles', 'floor', 'wall', 'pit', 'room', 'dungeon'], license: 'draft',
  },
  size: [32, 32],
  pivot: [16, 16],
  preview: 'floor-fill',
  params: { stone: color('Stone', '#7d86a8', ['#7d86a8', '#8a6fb0', '#5f8a8f']) },
  clips: { 'floor-fill': clip(), ...blockClips('wall'), ...blockClips('pit'), 'floor-deco-a': clip() },
  render(g, { clip: name, p }) {
    if (name === 'floor-fill') { g.rect(0, 0, 32, 32, tone(p.stone, 0.45)); g.rect(0, 31, 32, 1, tone(p.stone, 0.3)); g.rect(31, 0, 1, 32, tone(p.stone, 0.3)); return; }
    if (name === 'floor-deco-a') { g.rect(10, 13, 5, 1, tone(p.stone, 0.1)); g.rect(14, 14, 4, 1, tone(p.stone, 0.1)); g.rect(17, 15, 1, 4, tone(p.stone, 0.1)); return; }
    if (name.startsWith('wall-')) drawPiece(g, name.slice(5), { base: p.stone, edge: tone(p.stone, 0.3), dark: tone(p.stone, -0.3), face: tone(p.stone, -0.2) });
    else drawPiece(g, name.slice(4), { base: '#1a1626', edge: tone(p.stone, -0.45), dark: tone(p.stone, 0.2) });
  },
});
