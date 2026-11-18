// TEST FIXTURE for the style seam (Contract 12): a small creature built from shape calls, so it can be drawn
// three ways: pixel art, a silhouette (a finish on the pixel surface) and outlined shapes (another surface).
// Its eyes are the "detail layer": single pixels in the pixel style, small ellipses elsewhere (ctx.style).
// It has no colour controls on purpose: a colour control does nothing to a silhouette, and a control that does
// nothing in a style the sprite declares fails the quality bar for that style.
import { defineSprite, range, choice, toggle } from '../../../engine/sprite.js';
import { lerp, pulse, wave } from '../../../engine/motion.js';
import { ramp, INK } from '../../../engine/color.js';
import './styles.js';

const W = 32, GROUND = 28, CX = 16;
const BODY = ramp('#5fc46b'), FOOT = ramp('#3f8f57'), BELLY = '#bfe8a8';

export default defineSprite({
  id: 'style-blob',
  name: 'Style test blob',
  kind: 'Creature',
  blurb: 'A test creature that can be drawn in three styles.',
  meta: { type: 'creature', role: 'characters/enemy', themes: ['neutral'], gameTypes: ['platformer'], view: 'side', words: ['blob', 'slime', 'goo', 'monster', 'enemy', 'bounce'], license: 'draft' },
  styles: ['pixel', 'silhouette', 'outline-svg'],
  size: [W, W],
  pivot: [CX, GROUND],
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    ears: choice('Ears', 'pointy', ['round', 'pointy', 'long']),
    tail: toggle('Tail', true),
    bounce: range('Bounce', 0.5, { lo: 'Calm', hi: 'Bouncy', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 4, fps: (p) => 6 * lerp(0.65, 1.45, p.speed), loop: true },
    hop: { frames: 6, fps: (p) => 10 * lerp(0.65, 1.45, p.speed), loop: true },
  },
  render(g, { clip, t, p, style }) {
    const r = lerp(6, 8.5, p.size), ry = r * 0.82;
    const amp = lerp(1, 4, p.bounce);
    const squash = clip === 'idle' ? amp * 0.5 * pulse(t) : 0;
    const lift = clip === 'hop' ? Math.round(amp * Math.sin(Math.PI * t)) : 0;
    const cy = GROUND - 2.5 - ry - lift + squash * 0.5, top = cy - ry;
    // tail, behind the body
    if (p.tail) g.capsule(CX - r + 1, cy + ry * 0.3, CX - r - 2.5, cy - 4 + wave(t), 2, 1, BODY);
    // feet: they stay on the ground until the hop lifts the body
    for (const side of [-1, 1]) g.limb(CX + side * 3, cy + ry - 1, CX + side * 4, GROUND - 1.5 - lift, 3, FOOT);
    // ears
    for (const side of [-1, 1]) {
      const ex = CX + side * r * 0.5;
      if (p.ears === 'round') g.ellipse(ex, top + 1, 2.5, 2.5, BODY);
      else if (p.ears === 'pointy') g.poly([[ex - 2.5, top + 3], [ex + 2.5, top + 3], [ex + side, top - 4]], BODY);
      else g.capsule(ex, top + 2, ex + side * 2, top - 4, 1.5, 1.5, BODY);
    }
    g.ellipse(CX, cy + squash * 0.25, r + squash * 0.5, ry - squash * 0.25, BODY);
    g.rect(CX - 3, Math.round(cy + ry * 0.35), 6, 2, BELLY);
    g.arc(CX, cy - 1, 3, -0.9, 0.9, 1, INK);                       // a smile
    // the detail layer: one-pixel eyes on the pixel grid, drawn eyes anywhere else
    const ey = Math.round(cy - ry * 0.35);
    if (style === 'outline-svg') for (const ex of [CX - 2.5, CX + 2.5]) g.ellipse(ex, ey + 0.5, 1, 1.4, INK);
    else for (const ex of [CX - 3, CX + 2]) { g.dot(ex, ey, INK); g.dot(ex, ey + 1, INK); }
    g.outline(INK);
  },
});
