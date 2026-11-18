// Hero: a two-legged adventurer built on the shared humanoid rig.
import { defineSprite, range, choice, color, toggle, SKIN, HAIR, CLOTH, METAL } from '../engine/sprite.js';
import { lerp, reach, PI } from '../engine/motion.js';
import * as H from '../rigs/humanoid.js';
import { ramp, farRamp, tone, INK } from '../engine/color.js';

const WEAPON_LEN = { sword: 13, axe: 12, spear: 15, none: 0 };

export default defineSprite({
  id: 'knight',
  name: 'Hero',
  kind: 'Character',
  blurb: 'A brave adventurer. Change the build, hair, gear and how they move.',
  meta: { type: 'character', role: 'characters/player', themes: ['fantasy', 'dungeon'], gameTypes: ['platformer', 'turn-based-rpg'], view: 'side', words: ['knight', 'hero', 'warrior', 'adventurer', 'player', 'paladin', 'soldier', 'sword', 'armor', 'fighter', 'attack', 'walk', 'run', 'jump'], license: 'draft' },
  size: H.SIZE,
  pivot: H.PIVOT,
  preview: 'walk',
  // sounds that play with each animation: frame is counted from 0; preset is one of the sound's named styles
  sounds: { walk: [{ sound: 'footstep-gravel', frame: 0, preset: 'Boots' }, { sound: 'footstep-gravel', frame: 4, preset: 'Boots' }], run: [{ sound: 'footstep-gravel', frame: 0, preset: 'Boots' }, { sound: 'footstep-gravel', frame: 4, preset: 'Boots' }], jump: [{ sound: 'jump', frame: 2, preset: 'Big leap' }, { sound: 'footstep-gravel', frame: 6, preset: 'Boots' }], attack: [{ sound: 'sword-slash', frame: 3, preset: 'Heavy blade' }], hurt: [{ sound: 'punch', frame: 0, preset: 'Light jab' }] },
  params: {
    height: range('Height', 0.5, { lo: 'Short', hi: 'Tall' }),
    build: range('Build', 0.5, { lo: 'Slim', hi: 'Stocky' }),
    head: range('Head', 0.55, { lo: 'Small', hi: 'Big' }),
    hairStyle: choice('Hair', 'short', H.HAIR_STYLES),
    headgear: choice('Headgear', 'helmet', ['none', 'helmet', 'crown']),
    weapon: choice('Weapon', 'sword', ['sword', 'axe', 'spear', 'none']),
    cape: toggle('Cape', true),
    skin: color('Skin', SKIN[0], SKIN),
    hair: color('Hair', HAIR[1], HAIR),
    outfit: color('Outfit', CLOTH[5], CLOTH),
    trim: color('Cape and trim', CLOTH[0], CLOTH),
    metal: color('Metal', METAL[0], METAL),
    bounce: range('Bounce', 0.5, { lo: 'Calm', hi: 'Bouncy', group: 'Motion' }),
    stride: range('Stride', 0.5, { lo: 'Small steps', hi: 'Big steps', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: H.clips((p) => p.speed),

  render(g, { clip, t, p }) {
    const d = H.dims(p);
    const m = { bounce: p.bounce, stride: p.stride, armed: p.weapon !== 'none' };
    const poseAt = (u) => H.pose(clip, u, m, d);
    const P = poseAt(t);
    const metal = ramp(p.metal), trim = ramp(p.trim), wood = '#8a5a34';
    const len = WEAPON_LEN[p.weapon];
    const look = {
      skin: p.skin, top: p.outfit, bottom: tone(p.outfit, -0.6), boots: '#5b3d2e',
      hair: p.hair, hairStyle: p.hairStyle,
    };

    H.draw(g, P, d, look, {
      behind(g, J) {
        if (!p.cape) return;
        const [nx, ny] = J.neck, s = P.sway;
        const back = farRamp(p.trim);
        g.poly([
          [nx + 1, ny + 1], [nx - d.chestR - 0.5, ny + 1],
          [nx - d.chestR - 3 - s * 2.5, J.hip[1] + d.leg * 0.45],
          [nx - d.chestR + 1.5 - s * 1.5, J.hip[1] + d.leg * 0.55],
        ], back);
      },
      torso(g, J) {
        // belt
        const hx = Math.round(J.hip[0]), hy = Math.round(J.hip[1]);
        g.rect(hx - Math.round(d.hipR), hy - 2, Math.round(d.hipR) * 2, 1, trim.dark);
        g.dot(hx + 1, hy - 2, metal.light);
      },
      head(g, J) {
        const [hx, hy] = J.head, R = d.headR;
        if (p.headgear === 'helmet') {
          const shell = (px, py) => {
            if (((px - hx) / (R + 1)) ** 2 + ((py - hy) / (R + 1)) ** 2 > 1) return false;
            if (py < hy - R * 0.3) return true;          // dome
            return px < hx - R * 0.15;                    // back and cheek guard
          };
          g.fill(hx - R - 2, hy - R - 2, hx + R + 2, hy + R + 2, shell, metal, { light: 1 });
          g.rect(Math.round(hx - R * 0.1), Math.round(hy - R * 0.3) - 1, Math.ceil(R * 1.1) + 1, 1, metal.dark);
          // plume
          g.capsule(hx - 0.5, hy - R - 0.5, hx - R * 0.9 - P.sway * 1.5, hy - R - 2.5, 1.6, 0.9, trim);
        } else if (p.headgear === 'crown') {
          const y = Math.round(hy - R - 1), x = Math.round(hx - R * 0.55), w = Math.round(R * 1.2);
          const gold = ramp('#e6c545');
          g.rect(x, y, w, 2, gold);
          for (let i = 0; i < w; i += 2) g.dot(x + i, y - 1, gold.light);
          g.dot(x + Math.floor(w / 2), y, trim.base);
        }
      },
      item(g, J) {
        if (p.weapon === 'sword') H.sword(g, J, P, len, metal, '#e6c545');
        else if (p.weapon === 'axe') H.axe(g, J, P, len, metal, wood);
        else if (p.weapon === 'spear') H.spear(g, J, P, len, metal, wood);
      },
    });

    if (P.flash) g.tint('#ffffff');
    g.outline(INK);
    if (clip === 'attack' && len) H.slashTrail(g, poseAt, t, d, len, '#ffffff');
  },
});
