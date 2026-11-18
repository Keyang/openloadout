// Tiny sprites for the two frame-edge checks added to quality/sprite.js on 2026-11-18:
//   the far ends   all sliders high (and low) with each other value of each choice, and each part with its own
//                  sliders at both ends (S-inside-frame at the far ends)
//   shapes         the settings a whole-bundle look gives a sprite when it also varies shapes (S-inside-frame-shapes)
// Each export is a function that returns a fresh defineSprite() result. Every fault here is out of reach of the
// looks the checker already drew (default, all low, all high, each option alone, 12 random looks).
import { defineSprite, defaultParams, range, choice, toggle } from '../../../engine/sprite.js';
import { themedParams } from '../../../engine/theme.js';
import { lerp, pulse } from '../../../engine/motion.js';
import { INK } from '../../../engine/color.js';

const W = 32, GROUND = 28, CX = 16;
const META = { type: 'creature', role: 'characters/enemy', themes: ['neutral'], gameTypes: ['platformer'], view: 'side', words: ['blob', 'sign', 'flag', 'banner', 'carrier'], license: 'draft' };

// A blob that carries a sign on a pole. In `wave` it lifts the sign 3 pixels in the two middle frames.
//   opts.tall      the banner's pole is long enough to leave the frame, but only on the biggest body at its biggest size
//   opts.tip       the banner gains a 7-pixel tip at its very biggest size, and the biggest body carries it 6 lower:
//                  it leaves the frame on a default body with the sign's own slider high, not when everything is high
//   opts.droop     the flag on the smallest body hangs out to the left edge
//   opts.cape      an on/off cape that reaches the right edge on the biggest body
//   opts.type      another type (interface pieces may touch the edge)
function carrierDef(opts = {}) {
  return {
    id: 'q-carrier', name: 'Sign carrier', kind: 'Creature', blurb: 'Test blob with a sign.',
    meta: { ...META, ...(opts.type ? { type: opts.type } : {}) },
    size: [W, W], pivot: [CX, GROUND],
    params: {
      size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
      sign: choice('Sign', 'none', ['none', 'flag', 'banner']),
      signSize: range('Sign size', 0.5, { lo: 'Small', hi: 'Big' }),
      ...(opts.cape ? { cape: toggle('Cape', false) } : {}),
      bounce: range('Bounce', 0.5, { lo: 'Calm', hi: 'Bouncy', group: 'Motion' }),
    },
    parts: { sign: { label: 'Sign', params: ['sign', 'signSize'], none: 'none' } },
    clips: {
      idle: { frames: 4, fps: 6, loop: true },
      wave: { frames: 4, fps: 8, loop: false },
    },
    render(g, { clip, t, p }) {
      const r = lerp(5, 8, p.size);
      const lift = clip === 'idle' ? Math.round(lerp(0, 1, p.bounce) * pulse(t)) : 0;
      const cy = GROUND + 0.5 - r - lift;
      g.ellipse(CX, cy, r, r, '#5fc46b');
      g.rect(CX - 3, Math.round(cy - 1), 2, 2, INK); g.rect(CX + 2, Math.round(cy - 1), 2, 2, INK);
      if (opts.cape && p.cape) g.rect(CX + Math.round(r) - 1, Math.round(cy), p.size > 0.97 ? W : 3, 3, '#7a4fc4');
      if (p.sign === 'none') return;
      const raise = clip === 'wave' ? Math.round(3 * Math.sin(Math.PI * t)) : 0;
      let len = p.sign === 'banner' ? lerp(4, opts.tall ? 10.5 : 7, p.signSize) : lerp(3, 6, p.signSize);
      if (opts.tip && p.sign === 'banner' && p.signSize > 0.97) len += 7;
      const carriedLow = opts.tip && p.size > 0.9 ? 6 : 0;
      const top = Math.round(cy - r - len - raise + carriedLow);
      g.rect(CX, top, 1, Math.round(cy - r) - top + 1, INK);
      g.rect(CX + 1, top, p.sign === 'banner' ? 5 : 3, 3, '#c9423a');
      if (opts.droop && p.sign === 'flag' && p.size < 0.03) g.rect(0, top + 3, CX, 1, '#c9423a');
    },
  };
}
const carrier = (opts) => () => defineSprite(carrierDef(opts));

// (passes) nothing leaves the frame at any setting
export const carrierGood = carrier({});
// (fails: all sliders high with sign=banner, in the two middle frames of `wave`)
export const bannerTooTall = carrier({ tall: true });
// (fails: sign=banner with the sign's own slider high on a default body; fine when everything is high)
export const bannerTip = carrier({ tip: true });
// (fails: all sliders low with sign=flag)
export const flagDroops = carrier({ droop: true });
// (fails: all sliders high with the cape switched on)
export const capeTooWide = carrier({ cape: true });
// (passes) the same faults on an interface piece, which may touch the frame edge
export const edgeFreeType = carrier({ tall: true, droop: true, type: 'ui' });

// A blob with an arm. The arm reaches the right edge in one frame of `idle` (`frame`, 2 unless given) only at the
// settings a whole-bundle look with shapes varied gives this sprite for one seed (`seed`): exactly that size and arm.
// Frame 2 is the top of the bounce, so it is one of the frames that reach furthest at the tested settings; frame 1 is not.
//   longArm   the arm always ends 2 pixels short of the right edge
export function shapesFault(seed = 5, { type, frame: at = 2, longArm = false } = {}) {
  let target = null;
  const def = defineSprite({
    id: 'q-shapes', name: 'Arm blob', kind: 'Creature', blurb: 'Test blob with an arm.',
    meta: { ...META, ...(type ? { type } : {}) },
    size: [W, W], pivot: [CX, GROUND],
    params: {
      size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
      arm: range('Arm', 0.5, { lo: 'Short', hi: 'Long' }),
      mood: choice('Mood', 'calm', ['calm', 'angry']),
      bounce: range('Bounce', 0.5, { lo: 'Calm', hi: 'Bouncy', group: 'Motion' }),
    },
    clips: { idle: { frames: 4, fps: 6, loop: true } },
    render(g, { frame, t, p }) {
      const r = lerp(5, 8, p.size);
      const cy = GROUND + 0.5 - r - Math.round(lerp(0, 1, p.bounce) * pulse(t));
      g.ellipse(CX, cy, r, r, '#5fc46b');
      g.rect(CX - 3, Math.round(cy - 1), 2, p.mood === 'angry' ? 1 : 2, INK); g.rect(CX + 2, Math.round(cy - 1), 2, p.mood === 'angry' ? 1 : 2, INK);
      const hit = target && frame === at && Math.abs(p.size - target.size) < 0.004 && Math.abs(p.arm - target.arm) < 0.004;
      g.rect(CX + Math.round(r) - 1, Math.round(cy), hit ? W : longArm ? W - 2 - (CX + Math.round(r) - 1) : Math.round(lerp(2, 5, p.arm)), 2, '#3f6fd1');
    },
  });
  target = themedParams(def, defaultParams(def), { seed, shapes: true });
  return def;
}
