// TEST FIXTURE for the style seam (Contract 12): a twinkle drawn almost entirely with single pixels.
// Single pixels do not carry over to a surface that keeps shapes, so this sprite does NOT list `outline-svg`:
// the site must never offer that style here. It does list `silhouette`, which works on the pixel grid.
import { defineSprite, range, choice } from '../../../engine/sprite.js';
import { lerp, hash, TAU } from '../../../engine/motion.js';
import './styles.js';

const CX = 16, CY = 16;
const HOT = '#fff6c8', WARM = '#ffd35a';

export default defineSprite({
  id: 'style-sparkle',
  name: 'Style test sparkle',
  kind: 'Effect',
  blurb: 'A test twinkle made of single pixels.',
  meta: { type: 'effect', role: 'effects/spark', themes: ['neutral'], gameTypes: ['platformer'], view: 'none', words: ['sparkle', 'twinkle', 'glint', 'shine', 'star', 'dust'], license: 'draft' },
  styles: ['pixel', 'silhouette'],
  size: [32, 32],
  pivot: [CX, CY],
  grounded: false,
  params: {
    count: range('Sparks', 0.5, { lo: 'Few', hi: 'Many' }),
    spread: range('Spread', 0.5, { lo: 'Tight', hi: 'Wide' }),
    shape: choice('Shape', 'ring', ['ring', 'cross', 'spiral']),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    twinkle: { frames: 6, fps: (p) => 8 * lerp(0.65, 1.45, p.speed), loop: true },
  },
  render(g, { t, p }) {
    const n = Math.round(lerp(10, 24, p.count)), reach = lerp(7, 12, p.spread);
    g.rect(CX - 1, CY - 1, 2, 2, HOT);                              // the core: the one shape call
    for (let i = 0; i < n; i++) {
      const k = i / n, turn = t / n;                                // one step round per loop, so the loop closes
      let x, y;
      if (p.shape === 'ring') { const a = TAU * (k + turn); x = Math.sin(a) * reach; y = Math.cos(a) * reach; }
      else if (p.shape === 'cross') { const d = reach * (0.3 + 0.7 * ((k * 4) % 1)), a = (TAU / 4) * Math.floor(k * 4) + TAU * turn; x = Math.sin(a) * d; y = Math.cos(a) * d; }
      else { const a = TAU * (k * 2 + turn), d = reach * (0.25 + 0.75 * k); x = Math.sin(a) * d; y = Math.cos(a) * d; }
      const lit = hash(i, Math.floor(t * 6)) > 0.35;                // each spark blinks
      if (lit) g.dot(CX + x, CY + y, i % 2 ? HOT : WARM);
    }
  },
});
