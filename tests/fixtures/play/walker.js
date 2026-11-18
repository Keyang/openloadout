// Fixture for the playground tests: a small top-down character with the direction clips of
// docs/style-guide.md section 5 (level "Full": three drawn directions, the fourth mirrored).
// Not a catalogue asset: tests hand it to the playground with window.__loadoutPlay.addAssets([...]).
import { defineSprite, range, color, CLOTH } from '../../../engine/sprite.js';
import { ramp, INK } from '../../../engine/color.js';

const loop = (frames, fps) => ({ frames, fps, loop: true });
const once = (frames, fps) => ({ frames, fps, loop: false });
const three = (action, make, label) => Object.fromEntries(['down', 'up', 'side'].map((d) => [`${action}_${d}`, { ...make, label: `${label} (${d})` }]));

export default defineSprite({
  id: 'play-walker',
  name: 'Test walker',
  kind: 'Character',
  blurb: 'A small explorer seen from above, used by the playground tests.',
  meta: {
    type: 'character', role: 'characters/player', themes: ['neutral'], gameTypes: ['top-down-rpg'], view: 'top-down',
    words: ['walker', 'explorer', 'hero', 'player', 'walk', 'top-down'], license: 'draft',
  },
  size: [48, 48],
  pivot: [24, 42],
  preview: 'walk_down',
  sounds: { walk_side: [{ sound: 'footstep-gravel', frame: 0 }, { sound: 'footstep-gravel', frame: 4 }], attack_side: [{ sound: 'whoosh', frame: 3 }], hurt: [{ sound: 'punch', frame: 0 }] },
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    tunic: color('Tunic', CLOTH[5], CLOTH),
  },
  clips: {
    ...three('idle', loop(8, 7), 'Idle'), ...three('walk', loop(8, 10), 'Walk'), ...three('attack', once(8, 13), 'Attack'),
    hurt: once(4, 9), die: once(8, 10),
  },
  // where a thing leaves its hands: in front of it, the way it faces (Contract 3)
  sockets(clip) {
    const side = clip.endsWith('_side');
    return { hand: { x: side ? 34 : 24, y: 30, angle: Math.PI / 2 }, muzzle: { x: side ? 36 : 24, y: clip.endsWith('_up') ? 14 : 30, angle: Math.PI / 2 } };
  },
  render(g, { clip, frame, p }) {
    const cloth = ramp(p.tunic), skin = ramp('#f6d3b0');
    const [action, way = 'down'] = clip.split('_');
    const wide = p.size > 0.75 ? 1 : 0;
    if (action === 'die' && frame >= 4) {                  // what is left: it lies on the floor
      g.rect(12, 36, 24, 5, cloth); g.rect(32, 35, 7, 6, skin); g.outline(INK);
      return;
    }
    const step = action === 'walk' ? [0, 2, 0, -2][Math.floor(frame / 2) % 4] : 0;
    const bob = action === 'idle' ? (frame >= 4 ? 1 : 0) : action === 'walk' && frame % 4 >= 2 ? 1 : 0;
    const lean = action === 'die' ? frame * 2 : 0;
    // legs: the two feet trade places while walking
    if (way === 'side') { g.rect(20 + step, 34, 4, 7, '#4a3a5e'); g.rect(24 - step, 34, 4, 7, '#3a2c4c'); }
    else { g.rect(18, 34, 5, 7 - Math.max(0, step), '#4a3a5e'); g.rect(25, 34, 5, 7 - Math.max(0, -step), '#4a3a5e'); }
    g.rect(16 - wide + lean, 21 + bob, 16 + wide * 2, 14, cloth);                          // body
    g.rect(17 + lean, 9 + bob, 14, 13, skin);                                              // head
    if (way === 'up') g.rect(17 + lean, 9 + bob, 14, 11, '#5a3a22');                       // seen from behind: hair
    else if (way === 'side') { g.rect(17 + lean, 9 + bob, 9, 6, '#5a3a22'); g.rect(27 + lean, 15 + bob, 2, 2, INK); }
    else { g.rect(17 + lean, 9 + bob, 14, 4, '#5a3a22'); g.rect(20 + lean, 15 + bob, 2, 2, INK); g.rect(26 + lean, 15 + bob, 2, 2, INK); }
    if (action === 'attack' && frame >= 3 && frame <= 5) {                                 // a stick, held out the way it faces
      if (way === 'side') g.rect(32, 26, 10, 2, '#c2c9d6');
      else if (way === 'up') g.rect(23, 2, 2, 8, '#c2c9d6');
      else g.rect(23, 35, 2, 9, '#c2c9d6');
    }
    if (action === 'hurt' && frame === 0) g.tint('#ffffff');
    g.outline(INK);
  },
});
