// Time bonus (core-sprites-1, batch K03): extra time for racing, arcade and puzzle games. An hourglass
// in a frame with a thread of sand falling through its neck, a stopwatch with a crown button, or a
// round alarm clock with two bells; the watch and the clock have a hand that jumps once round per
// loop. Clock faces are a fixed cream with no numerals. Collecting it is the standard pickup pop
// (engine/pickups.js). The three kinds are drawn by drawTimer in engine/prizes.js; this file gives
// them their size, colours and motion.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp } from '../engine/motion.js';
import { INK, pick, mix } from '../engine/color.js';
import { PALETTE } from '../engine/palettes.js';
import { pickupClips, pickupPose, collectBurst, gleam } from '../engine/pickups.js';
import { TIMER_KINDS, prizeReach, drawTimer } from '../engine/prizes.js';

const P = PALETTE.thornwood;
const CX = 16;
const GLASS = [P.sky, mix(P.sky, P.cavern, 0.5)];   // a pale and a deeper glass: the one that stands clearer of the sand is used

export default defineSprite({
  id: 'hourglass',
  name: 'Time bonus',
  kind: 'Item',
  blurb: 'A floating hourglass, stopwatch or alarm clock that gives extra time. Change its kind, size, sand left, sparkle and colours.',
  meta: { type: 'pickup', role: 'items/pickup', themes: ['neutral'], gameTypes: ['arcade', 'racing', 'puzzle', 'platformer'], view: 'front',
    words: ['hourglass', 'stopwatch', 'clock', 'timer', 'time', 'sand', 'extra time', 'bonus', 'countdown', 'collect', 'pickup', 'hurry'], license: 'draft' },
  size: [32, 32],
  pivot: [16, 30],
  grounded: false,
  preview: 'idle',
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    shape: choice('Shape', 'hourglass', TIMER_KINDS),
    sand: range('Sand left', 0.5, { lo: 'Little', hi: 'Lots', when: { shape: ['hourglass'] } }),
    sparkle: toggle('Sparkle', true),
    body: color('Frame', P.wood, [P.wood, P.soil, '#a8612a', '#c98a4a', P.steel, P.crimson, P.gold], { material: 'paint' }),
    accent: color('Sand', PALETTE.hearthvale.wheat, [PALETTE.hearthvale.wheat, P.cream, P.magic, P.moss, P.thorn], { material: 'earth', when: { shape: ['hourglass'] } }),
    bob: range('Float', 0.5, { lo: 'Still', hi: 'Floaty', group: 'Motion' }),
    pop: range('Pop height', 0.5, { lo: 'Low', hi: 'High', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: pickupClips(),
  sounds: { collect: [{ sound: 'item-get', preset: 'Chiptune', frame: 1, volume: 0.7 }] },
  versions: [
    { name: 'Hourglass', params: {} },
    { name: 'Stopwatch', params: { shape: 'stopwatch', body: P.steel } },
    { name: 'Alarm clock', params: { shape: 'clock', body: P.crimson } },
    { name: 'Nearly out', params: { sand: 0.1, body: P.crimson } },
    { name: 'Gilded glass', params: { body: P.gold, accent: P.magic } },
  ],

  render(g, { clip, t, p }) {
    const k = lerp(0.8, 1.04, p.size), r = prizeReach('timer', p.shape);
    const cy = Math.round(16.5 + ((r.up - r.down) * k) / 2);
    const at = pickupPose(clip, t, { bob: p.bob, pop: p.pop, cy, up: r.up * k + 1, down: r.down * k + 1, side: r.side * k + 1 });
    const idle = clip === 'idle';
    if (at.show) {
      drawTimer(g, CX, at.y, { kind: p.shape, k, sx: at.sx, sy: at.sy, frame: p.body, sand: p.accent, level: p.sand, glass: pick(p.accent, ...GLASS), face: P.cream,
        hand: pick(P.cream, INK, '#ffffff'), t: idle ? t : 0, bare: at.bare });
      if (at.flash) g.tint('#ffffff');
      g.outline(INK);
    }
    if (idle && p.sparkle) gleam(g, CX + r.side * k, at.y - r.up * k + 3, t, '#ffffff', { at: 0.5 });
    collectBurst(g, { burst: at.burst, x: CX, y: at.y, r: r.side * k, colour: p.shape === 'hourglass' ? p.accent : p.body, sparkle: p.sparkle });
  },
});
