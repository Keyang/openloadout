// Fixture for tests/unit/build-site.test.mjs: a brand-new sprite file dropped into sprites/
// of a temporary copy of the project. It must appear in the catalogue with no other edit.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { ramp, INK } from '../engine/color.js';

export default defineSprite({
  id: 'test-gem',
  name: 'Test gem',
  kind: 'Item',
  blurb: 'A small shining gem used by the build tests.',
  size: [16, 16],
  pivot: [8, 15],
  preview: 'shine',
  sounds: { shine: [{ sound: 'test-pop', frame: 0 }] },
  meta: {
    type: 'pickup', role: 'items/pickup', themes: ['fantasy'], gameTypes: ['platformer'], view: 'front',
    words: ['gem', 'jewel', 'crystal', 'diamond', 'collect', 'treasure'], license: 'draft',
  },
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    shape: choice('Shape', 'round', ['round', 'tall']),
    tint: color('Colour', '#3f6fd1', ['#3f6fd1', '#c9423a', '#4f9d57']),
    glint: toggle('Glint', true),
  },
  clips: { shine: { frames: 4, fps: 6, loop: true } },
  render(g, { t, p }) {
    const r = 3 + p.size * 2, ry = p.shape === 'tall' ? r + 1 : r;
    g.ellipse(8, 9 - Math.round(Math.sin(t * Math.PI * 2)), r, ry, ramp(p.tint));
    if (p.glint) g.dot(7, 7, '#ffffff');
    g.outline(INK);
  },
});
