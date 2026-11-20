// FROZEN COPY, not a sprite: sprites/checkpoint-banner.js as it was on 2026-11-20 (batch P4), before the migration redraws it as
// data (docs/data-sprites.md section 7). Kept only as the reference its port (engine/gen/world-p4.js) is tested against
// (tests/unit/gen-p4-props.test.mjs); imports point at ../../../. Never edit it; the build never scans tests/.
// Checkpoint banner: a flag on a pole. `down` is the flag hanging limp and dull at the foot of
// the pole; `raise` runs it up the pole, where it snaps open with a white flash; `up` is the
// flag flying, in folds that travel along the cloth (engine/cloth.js). The emblem is printed on
// the flat cloth and rides the folds.
import { defineSprite, range, choice, color, toggle } from '../../../engine/sprite.js';
import { lerp, keys } from '../../../engine/motion.js';
import { ramp, tone, mix, brightness, INK } from '../../../engine/color.js';
import { rectIn } from '../../../engine/surface.js';
import { PALETTE, swatches } from '../../../engine/palettes.js';
import { flag } from '../../../engine/cloth.js';
import { markIn } from '../../../engine/marks.js';
import { twinkle } from '../../../engine/fx.js';

const P = PALETTE.thornwood;
const W = 32, H = 64, GROUND = 61;        // the lowest body row; its outline lands on the pivot row
const POLE = 8, HOIST = 10;               // the pole's left column; the column the cloth starts in
const CLOTH = { banner: [17, 14], pennant: [19, 14], swallowtail: [18, 14] };   // length and height of each cut

function layout(p) {
  const tall = Math.round(lerp(36, 56, p.height)), top = GROUND + 1 - tall;   // the top of the finial, or of the bare pole
  const [len, fh] = CLOTH[p.shape];
  const poleTop = top + (p.finial ? 4 : 0);
  return { top, poleTop, len, fh, upY: poleTop + 2, downY: GROUND - 6 - fh };
}

// The pole on its stone foot, with or without the ball on top.
function pole(g, p, L) {
  const wood = ramp(p.wood), stone = ramp(P.stone);
  g.rect(POLE, L.poleTop, 2, GROUND - 3 - L.poleTop, wood, { shade: 0 });
  g.rect(POLE, L.poleTop, 1, GROUND - 3 - L.poleTop, wood.dark);              // its shaded side; the lit side meets the cloth
  g.blob([rectIn(POLE - 3, GROUND - 2, 8, 3), rectIn(POLE - 2, GROUND - 4, 6, 2)], stone, { shade: 1, light: 1 });
  if (p.finial) g.ellipse(POLE + 1, L.top + 2.5, 2.5, 2.5, ramp(P.gold), { light: 1 });
}

// The emblem as a print on the flat cloth, in a colour that shows on this cloth.
function emblem(p, L, y) {
  if (p.emblem === 'none') return [];
  let c = p.emblemColour;
  const gap = brightness(c) - brightness(p.cloth);
  if (Math.abs(gap) < 0.2) c = tone(c, gap > 0 ? 1.3 : -1.3);
  const cx = HOIST + (p.shape === 'pennant' ? 5 : p.shape === 'swallowtail' ? 6 : 8);
  return [{ inside: markIn(p.emblem, cx, y + (L.fh >> 1), 7), paint: c }];
}

// The flag hanging limp against the pole, its top at row y: a drape with one drooping corner.
function limp(g, p, L, y, bright) {
  const c = mix(mix(p.cloth, P.slate, 0.5), p.cloth, bright), cloth = ramp(c), h = L.fh + 1;
  g.poly([[HOIST, y], [HOIST + 6, y + 1], [HOIST + 7, y + h - 5], [HOIST + 4, y + h + 2], [HOIST, y + h - 1]], cloth, { shade: 1, light: 1 });
  g.rect(HOIST + 2, y + 3, 1, h - 5, cloth.dark).rect(HOIST + 4, y + 5, 1, h - 6, cloth.dark);   // the folds it hangs in
  g.rect(HOIST, y + 2, 2, 1, cloth.dark).rect(HOIST, y + h - 4, 2, 1, cloth.dark);                // where it is tied to the pole
}

export default defineSprite({
  id: 'checkpoint-banner',
  name: 'Checkpoint banner',
  kind: 'Item',
  blurb: 'A flag that runs up its pole and flies when a checkpoint is reached. Change the pole, the cut of the flag, its emblem, colours and how much it waves.',
  meta: { type: 'prop', role: 'world/prop', themes: ['fantasy', 'forest'], gameTypes: ['platformer'], view: 'side',
    words: ['flag', 'banner', 'checkpoint', 'pole', 'pennant', 'save', 'raise', 'wave', 'respawn', 'goal', 'cloth', 'emblem'], license: 'draft' },
  size: [W, H],
  pivot: [16, GROUND + 1],
  params: {
    height: range('Height', 0.5, { lo: 'Short', hi: 'Tall' }),
    shape: choice('Shape', 'swallowtail', ['pennant', 'banner', 'swallowtail']),
    finial: toggle('Ball on top', true),
    emblem: choice('Emblem', 'star', ['none', 'star', 'skull', 'sun']),
    emblemColour: color('Colour', P.gold, swatches('thornwood', 'accent', { lead: 'gold' })),
    cloth: color('Cloth', P.hero, swatches('thornwood', 'trim', { lead: 'hero' })),
    wood: color('Wood', P.wood, swatches('thornwood', 'wood')),
    sway: range('Sway', 0.5, { lo: 'Still', hi: 'Swaying', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  parts: { emblem: { label: 'Emblem', params: ['emblem', 'emblemColour'], none: 'none' } },
  clips: {
    down: { frames: 1, fps: 8, loop: true, label: 'Inactive' },
    raise: { frames: 8, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false },
    up: { frames: 8, fps: (p) => 8 * lerp(0.65, 1.45, p.speed), loop: true, label: 'Active' },
  },
  sounds: {
    raise: [
      { sound: 'whoosh', preset: 'Quick swipe', frame: 1, volume: 0.7 },
      { sound: 'chime-success', preset: 'Quick confirm', frame: 6, volume: 0.8 },
    ],
  },

  render(g, { clip, t, frame, p }) {
    const L = layout(p);
    const amp = lerp(1.2, 3.4, p.sway);
    const fly = (phase, len, paint, marks) => flag(g, { x: HOIST, y: L.upY, length: len, height: L.fh, shape: p.shape, t: phase, amp, paint, marks });

    pole(g, p, L);
    if (clip === 'down') { limp(g, p, L, L.downY, 0); g.outline(INK); return; }
    if (clip === 'up') { fly(t, L.len, ramp(p.cloth), emblem(p, L, L.upY)); g.outline(INK); return; }

    // raise: frames 0 to 4 it runs up the pole, 5 it snaps open white, 6 it settles, 7 is the first frame of `up`
    if (frame <= 4) {
      const k = keys(frame / 4, [[0, 0], [0.25, 0.12], [1, 1]]);
      limp(g, p, L, Math.round(lerp(L.downY, L.upY, k)), frame >= 3 ? 1 : 0);   // dull at the foot, its own colour once it is up in the light
      g.outline(INK);
      return;
    }
    const snap = frame === 5;
    const f = fly((frame - 7) / 8, Math.min(L.len + (snap ? 1 : 0), W - 2 - HOIST), snap ? '#ffffff' : ramp(p.cloth), snap ? [] : emblem(p, L, L.upY));
    g.outline(INK);
    if (frame === 7) return;
    // the flash: sparkles round the cloth as it cracks open
    const lit = tone(p.cloth, 1.2);
    const [ex, ey] = f.at(1, 0.5);
    twinkle(g, Math.min(ex + 2, W - 4), ey, snap ? 2 : 1, lit);
    twinkle(g, HOIST + 6, L.upY - 5 + (snap ? 0 : -1), snap ? 1 : 0, lit);
    twinkle(g, HOIST + 9, L.upY + L.fh + 5 + (snap ? 0 : 1), snap ? 1 : 0, lit);
  },
});
