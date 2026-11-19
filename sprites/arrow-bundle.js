// Arrow bundle (core-sprites-1, batch K02): arrows for a bow, floating to be picked up. A leather
// quiver at a slant with fletched shafts fanning out of it, a bundle of arrows tied at the middle, or
// a few short crossbow bolts lying loose; the shafts sway a pixel against the quiver or the cord as it bobs.
// Collecting it is the standard pickup pop (engine/pickups.js). The three kinds are drawn by
// drawArrows in engine/munitions.js; this file gives them their size, colours and motion.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, wave, clamp } from '../engine/motion.js';
import { INK, tone, mix } from '../engine/color.js';
import { PALETTE } from '../engine/palettes.js';
import { pickupClips, pickupPose, collectBurst, glint, gleam } from '../engine/pickups.js';
import { ARROW_KINDS, munitionReach, drawArrows } from '../engine/munitions.js';

const P = PALETTE.thornwood;
const CX = 16;
const TILT = 0.06;                                // how far the whole thing rocks with the bob, in radians
const SWAY = 0.09;                                // how far the shafts sway against it, a frame behind

export default defineSprite({
  id: 'arrow-bundle',
  name: 'Arrow bundle',
  kind: 'Item',
  blurb: 'Floating arrows to pick up: a leather quiver of fletched arrows, a tied bundle or loose crossbow bolts. Change the kind, how many arrows, its size, sparkle and colours.',
  meta: { type: 'pickup', role: 'items/pickup', themes: ['neutral', 'fantasy', 'forest'], gameTypes: ['top-down-rpg', 'platformer', 'arcade', 'roguelike-action'], view: 'front',
    words: ['arrows', 'arrow', 'quiver', 'bolts', 'crossbow', 'bow', 'ammo', 'ammunition', 'fletching', 'collect', 'pickup', 'archery', 'leather'], license: 'draft' },
  size: [32, 32],
  pivot: [16, 30],
  grounded: false,
  preview: 'idle',
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    shape: choice('Shape', 'quiver', ARROW_KINDS),
    pieces: range('Arrows', 3, { min: 2, max: 5, step: 1, lo: 'Few', hi: 'Many' }),
    sparkle: toggle('Sparkle', true),
    body: color('Leather', P.soil, [P.soil, '#5a3a22', '#a8612a', P.leaf], { when: { shape: ['quiver'] } }),
    wood: color('Shafts', P.wood, [P.wood, '#c98a4a', P.cream, PALETTE.hearthvale.wheat]),
    metal: color('Heads', P.steel, [P.steel, P.gold, P.stone, P.slate, '#e6c545']),
    trim: color('Fletching', P.crimson, [P.crimson, P.gold, P.hero, P.thorn, P.ember, P.steel, P.moss]),
    bob: range('Float', 0.5, { lo: 'Still', hi: 'Floaty', group: 'Motion' }),
    pop: range('Pop height', 0.5, { lo: 'Low', hi: 'High', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: pickupClips(),
  sounds: { collect: [{ sound: 'ammo-pickup', preset: 'Arrows', frame: 1, volume: 0.7 }] },
  versions: [
    { name: "Hunter's quiver", params: {} },
    { name: 'Tied bundle', params: { shape: 'bundle', pieces: 4 } },
    { name: 'Crossbow bolts', params: { shape: 'bolts', trim: P.steel, wood: '#c98a4a' } },
    { name: 'Gilded arrows', params: { metal: P.gold, trim: P.ember } },
    { name: 'Forest quiver', params: { body: P.leaf, trim: P.moss, pieces: 5 } },
  ],

  render(g, { clip, t, p }) {
    // the cord that ties a bundle: the darkest shaft-free brown, so it never merges with the shafts
    const o = { kind: p.shape, k: lerp(0.85, 1.08, p.size), count: p.pieces, leather: p.body, wood: p.wood, metal: p.metal, fletching: p.trim, cord: P.soil };
    let r = munitionReach('arrows', { ...o, tilt: TILT + SWAY });
    // a wide sheaf of many bolts at the biggest size is brought back inside the frame
    const fit = Math.min(1, 13 / r.side, 25 / (r.up + r.down));
    if (fit < 1) { o.k *= fit; r = munitionReach('arrows', { ...o, tilt: TILT + SWAY }); }
    const cy = Math.max(r.up + 2, Math.min(28 - r.down, Math.round(17 + (r.up - r.down) / 2)));
    const at = pickupPose(clip, t, { bob: p.bob, pop: p.pop, cy, up: r.up + 1, down: r.down + 1, side: r.side + 1 });
    const idle = clip === 'idle';
    // it rocks with the float; the shafts follow an eighth of a loop later
    const angle = idle ? TILT * wave(t, 0.25) : 0, sway = idle ? SWAY * wave(t - 0.125, 0.25) - angle : 0;
    if (at.show) {
      const arrows = drawArrows(g, CX, at.y, { ...o, sx: at.sx, sy: at.sy, angle, sway, bare: at.bare });
      if (idle) glint(g, arrows.body, { x: CX, y: at.y, r: r.side, phase: lerp(-1.5, 1.5, clamp((t - 0.1) / 0.6)), width: 0.1, colour: mix(tone(p.wood, 0.85), '#ffffff', 0.6) });
      if (at.flash) g.tint('#ffffff');
      g.outline(INK);
    }
    if (idle && p.sparkle) gleam(g, CX + r.side - 2, at.y - r.up + 2, t, '#ffffff', { at: 0.5 });
    collectBurst(g, { burst: at.burst, x: CX, y: at.y, r: r.side, colour: p.trim, sparkle: p.sparkle });
  },
});
