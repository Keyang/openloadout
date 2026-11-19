// Hero: a two-legged adventurer built on the shared humanoid rig.
// The worked example for parts (docs/architecture.md, Contract 3): the weapon, headgear, cape and hair are each
// declared in `parts` with settings of their own, drawn from an attach point, and exported with the sprite.
import { defineSprite, range, choice, color, SKIN, HAIR, CLOTH, METAL } from '../engine/sprite.js';
import * as H from '../rigs/humanoid.js';
import { ramp, farRamp, tone, INK } from '../engine/color.js';

const WEAPON_KINDS = ['sword', 'axe', 'spear'];          // sizes come from the rig (H.ITEMS), shared by every character
const NO_METAL = '#c2c9d6';                               // the belt buckle's colour when nothing else metal is worn or held

/** Hand-to-tip length of the weapon in pixels for these settings; 0 when no weapon is held. */
export const weaponReach = (p) => H.itemSize(p.weapon, p.weaponLength)?.length ?? 0;

/** How far the headgear rises above the top of the head, in pixels. */
function headgearRise(p, d) {
  if (p.headgear === 'helmet') return 3 + 2.5 * p.headgearSize + 1.6 * Math.sqrt(p.headgearSize);
  if (p.headgear === 'crown') return 1 + crownBand(p) + crownPoints(p);
  return 0;
}
const crownBand = (p) => Math.max(1, Math.round(2 * p.headgearSize));
const crownPoints = (p) => Math.max(1, Math.round(p.headgearSize));

/** The Hero's pose for a frame: the rig's pose with the weapon's own settings, kept inside the frame. */
function heroPose(clip, t, p, d) {
  const w = H.itemSize(p.weapon, p.weaponLength);
  const m = {
    bounce: p.bounce, stride: p.stride, armed: !!w,
    hold: w ? H.holdAngle(p.weaponAngle) : 0,       // the Hold angle slider is in degrees
    swing: w ? p.weaponSwing : 1,
  };
  const P = H.pose(!w && clip === 'attack' ? 'punch' : clip, t, m, d);   // no weapon: an unarmed attack
  const rise = headgearRise(p, d);
  // the top of the headgear must stay inside the frame: above the head when he stands, behind it when he lies (the rig
  // turns the head and everything on it by P.headTurn)
  const top = d.headR + rise;
  return H.fit(P, d, {
    item: w && clip === 'die' ? { ...w, pad: w.pad + 1.5 } : w,       // lying beside him, a wide blade rests on the ground, not in it
    points: rise ? (J, P) => [P.headTurn ? [J.head[0] - Math.sin(P.headTurn) * (top + 1), J.head[1] - Math.cos(P.headTurn) * top] : [J.head[0], J.head[1] - d.headR - rise]] : null,
  });
}

// ---- parts: each is drawn from an attach point and its own settings ----

/** The cape under a body lying on its back: its edge shows along the ground from the shoulders toward the feet. */
function drawCapeOnGround(g, J, P, d, { kind, length, colour }) {
  const paint = ramp(colour);
  const x0 = Math.round(J.neck[0] - d.chestR), x1 = Math.round(J.neck[0] + (d.torso + d.leg * 0.45) * Math.min(length, 1.5));
  const y = Math.round(J.gy) - 1;
  for (let x = x0; x <= x1; x++) {
    const torn = kind === 'tattered' && ((x - x0) % 5 === 3 || x === x1 - 1);
    g.dot(x, y, torn ? paint.dark : paint.base);
    if (!torn && x < x1 - 1) g.dot(x, y - 1, x % 2 || kind !== 'tattered' ? paint.base : paint.dark);
  }
  g.dot(x0 - 1, y, paint.dark);
}

function drawCape(g, J, P, d, { kind, length, colour }) {
  const [nx, ny] = J.neck, s = P.sway;
  const hemY = (k) => Math.min(J.hip[1] + d.leg * k * length, J.gy - 1);
  const back = [nx - d.chestR - 3 - s * 2.5, hemY(0.45)], front = [nx - d.chestR + 1.5 - s * 1.5, hemY(0.55)];
  const pts = [[nx + 1, ny + 1], [nx - d.chestR - 0.5, ny + 1], back];
  if (kind === 'tattered') {
    // a torn hem: two bites out of the bottom edge
    const at = (k, up) => [back[0] + (front[0] - back[0]) * k, back[1] + (front[1] - back[1]) * k - up];
    pts.push(at(0.2, 0), at(0.35, 3.5), at(0.5, 0), at(0.68, 3), at(0.85, 0));
  }
  pts.push(front);
  g.poly(pts, farRamp(colour));
}

function drawHeadgear(g, J, P, d, { kind, size, metal, trim }) {
  const [hx, hy] = J.head, R = d.headR;
  if (kind === 'helmet') {
    const shell = (px, py) => {
      if (((px - hx) / (R + 1)) ** 2 + ((py - hy) / (R + 1)) ** 2 > 1) return false;
      if (py < hy - R * 0.3) return true;          // dome
      return px < hx - R * 0.15;                    // back and cheek guard
    };
    g.fill(hx - R - 2, hy - R - 2, hx + R + 2, hy + R + 2, shell, metal, { light: 1 });
    g.rect(Math.round(hx - R * 0.1), Math.round(hy - R * 0.3) - 1, Math.ceil(R * 1.1) + 1, 1, metal.dark);
    // plume: Size makes it longer and fuller
    const x0 = hx - 0.5, y0 = hy - R - 0.5, w = Math.sqrt(size);
    g.capsule(x0, y0, H.scaleFrom(x0, hx - R * 0.9 - P.sway * 1.5, size), H.scaleFrom(y0, hy - R - 2.5, size), 1.6 * w, 0.9 * w, trim);
  } else if (kind === 'crown') {
    // Size makes the band deeper and the points taller
    const band = Math.max(1, Math.round(2 * size)), points = Math.max(1, Math.round(size));
    const y = Math.round(hy - R - 1) + 2 - band, x = Math.round(hx - R * 0.55), w = Math.round(R * 1.2);
    const gold = ramp('#e6c545');
    g.rect(x, y, w, band, gold);
    for (let i = 0; i < w; i += 2) for (let j = 1; j <= points; j++) g.dot(x + i, y - j, gold.light);
    g.dot(x + Math.floor(w / 2), y + Math.floor((band - 1) / 2), trim.base);
  }
}

/** Hair that shows below the back of a helmet, so the hair colour still reads with the helmet on. */
function drawNapeHair(g, J, d, style, hair) {
  if (style !== 'short' && style !== 'spiky') return;      // long hair and ponytails already hang out; bald has none
  const [hx, hy] = J.head, R = d.headR;
  g.fill(hx - R - 2, hy, hx, hy + R + 1, (px, py) => ((px - hx) / (R + 0.8)) ** 2 + ((py - hy) / (R + 0.7)) ** 2 <= 1 && px < hx - R * 0.45 && py > hy + R * 0.2 && py < hy + R * 0.62, hair, { shade: 0 });
}

export default defineSprite({
  id: 'knight',
  name: 'Hero',
  kind: 'Character',
  blurb: 'A brave adventurer. Change the build, hair, gear and how they move.',
  meta: { type: 'character', role: 'characters/player', themes: ['fantasy', 'dungeon'], gameTypes: ['platformer', 'turn-based-rpg'], view: 'side', words: ['knight', 'hero', 'warrior', 'adventurer', 'player', 'paladin', 'soldier', 'sword', 'armor', 'fighter', 'attack', 'walk', 'run', 'jump'], license: 'draft' },
  size: H.SIZE,
  pivot: H.PIVOT,
  preview: 'walk',
  // ready-made versions to start from (docs/site-design.md, section 4): the settings that differ from the defaults
  versions: [
    { name: 'Classic', params: {} },
    { name: 'Ranger', params: { hairStyle: 'long', hair: '#a8612a', headgear: 'none', weapon: 'spear', cape: 'tattered', outfit: '#4f9d57', trim: '#3a3350', skin: '#e8b088', build: 0.25, height: 0.75 } },
    { name: 'Royal', params: { headgear: 'crown', hairStyle: 'long', hair: '#e0b040', capeLength: 1.6, outfit: '#7a4fc4', trim: '#e6c545', metal: '#e6c545' } },
    { name: 'Raider', params: { build: 1, hairStyle: 'ponytail', hair: '#c9423a', headgear: 'none', weapon: 'axe', weaponLength: 1.3, cape: 'none', outfit: '#6b7280', trim: '#e08a2c', metal: '#8f97a8' } },
    { name: 'Shadow', params: { hairStyle: 'spiky', hair: '#2b2233', headgear: 'none', weaponLength: 0.7, cape: 'tattered', outfit: '#3a3350', trim: '#3a3350', metal: '#5d6475', skin: '#c98a5c', build: 0.2 } },
    { name: 'Swamp guard', params: { skin: '#9bd18a', hairStyle: 'bald', headgearSize: 1.4, weapon: 'spear', outfit: '#e08a2c', trim: '#4f9d57', cape: 'none', height: 0.2, metal: '#c98a4a' } },
    { name: 'Brawler', params: { hairStyle: 'bald', headgear: 'none', weapon: 'none', cape: 'none', outfit: '#e08a2c', skin: '#9a6240', build: 0.9, bounce: 0.9 } },
    { name: 'Frost guard', params: { outfit: '#2f8f9d', trim: '#f0ead8', hairStyle: 'long', hair: '#d8d8e0', capeLength: 1.5, weapon: 'spear', weaponLength: 1.2 } },
    { name: 'Gold knight', params: { headgearSize: 1.3, metal: '#e6c545', outfit: '#f0ead8', trim: '#e6c545', weaponLength: 1.3 } },
    { name: 'Squire', params: { height: 0, head: 1, hairStyle: 'spiky', hair: '#e0b040', headgear: 'none', weaponLength: 0.65, cape: 'none', outfit: '#c9423a', bounce: 1 } },
    { name: 'Spirit', params: { skin: '#b9a7e0', hairStyle: 'long', hair: '#d8d8e0', headgear: 'none', cape: 'tattered', capeLength: 1.8, outfit: '#f0ead8', trim: '#7a4fc4', weapon: 'none' } },
    { name: 'Rose captain', params: { hairStyle: 'ponytail', hair: '#e670b0', headgear: 'crown', outfit: '#d65a9c', trim: '#f0ead8', weapon: 'axe', metal: '#e6c545', skin: '#6e4428' } },
  ],
  // sounds that play with each animation: frame is counted from 0; preset is one of the sound's named styles;
  // `when` limits a sound to some settings (the blade is heard only when a weapon is held; a bare fist swishes instead;
  // a blocked blow rings on a weapon and thuds on bare arms)
  sounds: { walk: [{ sound: 'footstep-gravel', frame: 0, preset: 'Boots' }, { sound: 'footstep-gravel', frame: 4, preset: 'Boots' }], run: [{ sound: 'footstep-gravel', frame: 0, preset: 'Boots' }, { sound: 'footstep-gravel', frame: 4, preset: 'Boots' }], jump: [{ sound: 'jump', frame: 2, preset: 'Big leap' }, { sound: 'land-thud', frame: 6, preset: 'Armoured', volume: 0.7 }], attack: [{ sound: 'sword-slash', frame: 3, preset: 'Heavy blade', when: { weapon: WEAPON_KINDS } }, { sound: 'whoosh', frame: 3, preset: 'Quick swipe', when: { weapon: ['none'] } }], hurt: [{ sound: 'punch', frame: 0, preset: 'Light jab' }], die: [{ sound: 'punch', frame: 0, preset: 'Heavy body blow', volume: 1 }, { sound: 'land-thud', frame: 5, preset: 'Armoured', volume: 1 }], block: [{ sound: 'metal-hit', frame: 1, preset: 'Sword clash', volume: 0.7, when: { weapon: WEAPON_KINDS } }, { sound: 'punch', frame: 1, preset: 'Light jab', volume: 0.7, when: { weapon: ['none'] } }] },
  params: {
    height: range('Height', 0.5, { lo: 'Short', hi: 'Tall' }),
    build: range('Build', 0.5, { lo: 'Slim', hi: 'Stocky' }),
    head: range('Head', 0.55, { lo: 'Small', hi: 'Big' }),
    // hair
    hairStyle: choice('Hair', 'short', H.HAIR_STYLES),
    hair: color('Color', HAIR[1], HAIR),
    // headgear
    headgear: choice('Headgear', 'helmet', ['helmet', 'crown', 'none']),
    headgearSize: range('Size', 1, { min: 0.5, max: 1.8, step: 0.05, lo: 'Small', hi: 'Big' }),
    // weapon
    weapon: choice('Weapon', 'sword', [...WEAPON_KINDS, 'none']),
    weaponLength: range('Length', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Short', hi: 'Long' }),
    weaponAngle: range('Hold angle', 0, { min: -10, max: 40, step: 1, lo: 'Upright', hi: 'Forward' }),
    weaponSwing: range('Swing', 1, { min: 0.5, max: 1.3, step: 0.05, lo: 'Short chop', hi: 'Wide sweep' }),
    // cape
    cape: choice('Cape', 'plain', ['plain', 'tattered', 'none'], { was: { false: 'none', true: 'plain' } }),   // the cape used to be on/off: old links still work
    capeLength: range('Length', 1, { min: 0.3, max: 1.8, step: 0.05, lo: 'Short', hi: 'Long' }),
    skin: color('Skin', SKIN[0], SKIN),
    outfit: color('Outfit', CLOTH[5], CLOTH),
    trim: color('Cape and trim', CLOTH[0], CLOTH),
    // metal is the helmet and the weapon: with neither there is nothing for it to colour
    metal: color('Metal', METAL[0], METAL, { when: [{ weapon: WEAPON_KINDS }, { headgear: ['helmet'] }] }),
    bounce: range('Bounce', 0.5, { lo: 'Calm', hi: 'Bouncy', group: 'Motion' }),
    stride: range('Stride', 0.5, { lo: 'Small steps', hi: 'Big steps', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  // What the Hero holds and wears. The first key of each list picks which one (or none); the rest are that part's own settings.
  parts: {
    hair: { label: 'Hair', params: ['hairStyle', 'hair'], none: 'bald', socket: 'head' },
    headgear: { label: 'Headgear', params: ['headgear', 'headgearSize'], none: 'none', socket: 'head' },
    weapon: { label: 'Weapon', params: ['weapon', 'weaponLength', 'weaponAngle', 'weaponSwing'], none: 'none', socket: 'hand' },
    cape: { label: 'Cape', params: ['cape', 'capeLength'], none: 'none', socket: 'back' },
  },
  // die, block and victory are the rig's standard poses (style guide, section 4)
  clips: { ...H.clips((p) => p.speed), ...H.clipsFor(['die', 'block', 'victory'], (p) => p.speed) },

  // attach points for every frame (hand, offhand, head, back, feet), exported so a game can attach or swap parts
  sockets(clip, t, p) {
    const d = H.dims(p);
    const P = heroPose(clip, t, p, d);
    return H.sockets(H.solve(P, d), P, d);
  },

  render(g, { clip, t, p }) {
    const d = H.dims(p);
    const poseAt = (u) => heroPose(clip, u, p, d);
    const P = poseAt(t);
    const metal = ramp(p.metal), trim = ramp(p.trim);
    const armed = p.weapon !== 'none';
    const look = {
      skin: p.skin, top: p.outfit, bottom: tone(p.outfit, -0.6), boots: '#5b3d2e',
      hair: p.hair, hairStyle: p.hairStyle,
    };

    H.draw(g, P, d, look, {
      behind(g, J) {
        if (p.cape !== 'none') drawCape(g, J, P, d, { kind: p.cape, length: p.capeLength, colour: p.trim });
      },
      torso(g, J) {
        // belt
        const hx = Math.round(J.hip[0]), hy = Math.round(J.hip[1]);
        const buckle = armed || p.headgear === 'helmet' ? metal.light : ramp(NO_METAL).light;
        if (P.lie > 0.5) {
          // lying down, the belt runs across the body, top to bottom
          for (let y = hy - Math.round(d.hipR) - 1; y <= hy + Math.round(d.hipR); y++) if (g.get(hx - 2, y)) g.dot(hx - 2, y, trim.dark);
          if (g.get(hx - 2, hy - 1)) g.dot(hx - 2, hy - 1, buckle);
          return;
        }
        g.rect(hx - Math.round(d.hipR), hy - 2, Math.round(d.hipR) * 2, 1, trim.dark);
        g.dot(hx + 1, hy - 2, buckle);
      },
      head(g, J) {
        if (p.headgear === 'none') return;
        drawHeadgear(g, J, P, d, { kind: p.headgear, size: p.headgearSize, metal, trim });
        if (p.headgear === 'helmet') drawNapeHair(g, J, d, p.hairStyle, ramp(p.hair));
      },
      front(g, J) {
        if (p.cape !== 'none' && P.lie > 0.9) drawCapeOnGround(g, J, P, d, { kind: p.cape, length: p.capeLength, colour: p.trim });
      },
      item(g, J) {
        if (armed) H.heldItem(g, H.sockets(J, P, d).hand, { kind: p.weapon, length: weaponReach(p), metal, wood: '#8a5a34', hilt: '#e6c545' });
      },
    });

    if (P.flash) g.tint('#ffffff');
    g.outline(INK);
    if (clip === 'attack' && armed) H.slashTrail(g, poseAt, t, d, weaponReach(p), '#ffffff');
  },
});
