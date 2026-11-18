// Fixture for the playground tests: a side-view tileset with the names of docs/style-guide.md section 6:
// one block (stone-*), thin platforms, slopes and a decal.
import { defineSprite, color } from '../../../engine/sprite.js';
import { tone } from '../../../engine/color.js';
import { blockClips, clip, drawPiece } from './block.js';

export default defineSprite({
  id: 'play-tiles',
  name: 'Test tiles',
  kind: 'Item',
  blurb: 'Stone ground with thin platforms and slopes, used by the playground tests.',
  meta: {
    type: 'tileset', role: 'world/tile', themes: ['neutral'], gameTypes: ['platformer'], view: 'side',
    words: ['tiles', 'ground', 'stone', 'platform', 'slope', 'ledge'], license: 'draft',
  },
  size: [32, 32],
  pivot: [16, 16],
  preview: 'stone-top',
  params: { stone: color('Stone', '#8a6fb0', ['#8a6fb0', '#b07a50', '#5f8a8f']) },
  clips: { ...blockClips('stone', { narrow: true }), 'stone-thin-l': clip(), 'stone-thin-m': clip(), 'stone-thin-r': clip(), 'stone-slope-up': clip(), 'stone-slope-down': clip(), 'stone-deco-a': clip() },
  render(g, { clip: name, p }) {
    const c = { base: p.stone, edge: '#ffd94a', dark: tone(p.stone, -0.35) };
    const piece = name.slice('stone-'.length);
    if (piece.startsWith('thin')) {
      g.rect(0, 0, 32, 12, c.base); g.rect(0, 0, 32, 3, c.edge); g.rect(0, 11, 32, 1, c.dark);
      if (piece === 'thin-l') g.rect(0, 0, 2, 12, c.dark);
      if (piece === 'thin-r') g.rect(30, 0, 2, 12, c.dark);
    } else if (piece.startsWith('slope')) {
      for (let x = 0; x < 32; x++) {
        const top = piece === 'slope-up' ? 31 - x : x;
        g.rect(x, top, 1, 32 - top, c.base); g.rect(x, top, 1, Math.min(3, 32 - top), c.edge);
      }
    } else if (piece === 'deco-a') { g.rect(12, 14, 3, 2, c.dark); g.rect(18, 17, 2, 2, c.dark); g.dot(15, 19, c.edge); }
    else drawPiece(g, piece, c);
  },
});
