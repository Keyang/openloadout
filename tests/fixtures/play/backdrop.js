// Fixture for the playground tests: a background of three layers, far to near (docs/style-guide.md section 7).
// Each layer is one 320x180 frame that repeats sideways; far is solid sky, mid and near are see-through above their shapes.
import { defineSprite, color } from '../../../engine/sprite.js';
import { tone, mix } from '../../../engine/color.js';

const W = 320, H = 180;
const layer = () => ({ frames: 1, fps: 4, loop: true });

export default defineSprite({
  id: 'play-backdrop',
  name: 'Test hills',
  kind: 'Effect',
  blurb: 'Sky, far hills and near bushes, used by the playground tests. Scrolls at 0.1, 0.4 and 0.7 of the camera.',
  meta: {
    type: 'background', role: 'environment/background', themes: ['neutral'], gameTypes: ['platformer'], view: 'side',
    words: ['hills', 'background', 'backdrop', 'bushes', 'scenery', 'parallax'], license: 'draft',
  },
  size: [W, H],
  pivot: [160, 180],
  preview: 'far',
  params: { sky: color('Sky', '#9fd4f0', ['#9fd4f0', '#f0c8a0', '#2a3560']), hill: color('Hills', '#5f9a78', ['#5f9a78', '#8a6fb0', '#b07a50']) },
  clips: { far: layer(), mid: layer(), near: layer() },
  render(g, { clip, p }) {
    // whole waves across the frame, so the right edge meets the left edge
    const wave = (x, cycles, phase = 0) => Math.sin((x / W) * Math.PI * 2 * cycles + phase);
    if (clip === 'far') {
      g.rect(0, 0, W, 70, tone(p.sky, -0.08)); g.rect(0, 70, W, 50, p.sky); g.rect(0, 120, W, 60, tone(p.sky, 0.12));
      const c = mix(p.hill, p.sky, 0.7);
      for (let x = 0; x < W; x++) { const h = Math.round(52 + 16 * wave(x, 2)); g.rect(x, H - h, 1, h, c); }
      return;
    }
    const c = mix(p.hill, p.sky, clip === 'mid' ? 0.5 : 0.35);
    for (let x = 0; x < W; x++) {
      const h = clip === 'mid' ? Math.round(38 + 12 * wave(x, 3, 1)) : Math.round(18 + 7 * wave(x, 5, 2) + 4 * wave(x, 9));
      g.rect(x, H - h, 1, h, c);
    }
  },
});
