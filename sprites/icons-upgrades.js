// Upgrade icons (kit-roguelite-scifi, batch S16): ten pictures for upgrade cards, one clip each.
// Flat signs in two colours, on a plate or alone. Every shape comes from the icon helper
// (engine/icons.js), which also fits every picture to the same size, draws the plate and makes the
// bold pen; this file only says which shapes each picture is made of and where they go.
//
// Silhouettes, so no two are told apart by colour alone: a spiked burst turned off the upright
// (damage), three slugs in a stair (fire rate), a boot with a wing (speed), a fan of three arrows
// (multishot), one long arrow through a hoop (pierce), a horseshoe (magnet), a flat-topped shield
// (shield), an open ring with four ticks (crit), a heart with a plus on its shoulder (regen) and a
// broad arrow trailing lines (dash).
// Colours: Picture is the main shape of each; Second colour its tails, heads, tips, rim and marks.
// The plate's swatches are all dark and the two picture colours all light, so a picture shows on
// every plate under every whole-bundle look.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { INK } from '../engine/color.js';
import { PALETTE } from '../engine/palettes.js';
import {
  ICON_SIZE, ICON_PIVOT, ICON_DIAGONAL, ICON_PLATES, iconClips, iconFit, iconTidy, iconPlate, iconBold,
  iconBurst, iconShot, iconArrow, iconStreaks, iconHoop, iconWing, iconMagnet, iconCrosshair, iconHeart, iconShield, iconBoot,
} from '../engine/icons.js';

const P = PALETTE.derelict;

// Per picture: its turn (clockwise; none: upright), its share of the room on a plate (none: all of
// it) and what it draws before the outline.
const ICONS = {
  damage: {
    label: 'Damage', onPlate: 0.92,        // its eight points would touch a plate's rim
    draw: (g, pen, p) => iconBurst(g, pen, { colour: p.body, core: p.accent, turn: Math.PI / 4, fat: 0.46 }),
  },
  'fire-rate': {
    label: 'Fire rate',
    // three shots one above the other, each a step further on
    draw: (g, pen, p) => { for (const [x, y] of [[4, -7.4], [0, 0], [-4, 7.4]]) iconShot(g, pen, { from: [x - 7.5, y], to: [x + 7.5, y], r: 2.7, colour: p.body, tail: p.accent, head: 0.42 }); },
  },
  speed: {
    label: 'Speed',
    draw: (g, pen, p) => {
      iconBoot(g, pen, { leather: p.body, sole: p.accent, buckle: p.accent, cuff: p.accent });
      iconWing(g, pen, { colour: p.accent, x: -3.6, y: 3.4, len: 10.5, side: -1, reach: 7.4, over: true });
    },
  },
  multishot: {
    label: 'Multishot',
    // one tail, three tips: straight up, up and to the right, and to the right
    draw: (g, pen, p) => {
      for (const [x, y] of [[-6.6, -10.4], [10.4, 6.6]]) iconArrow(g, pen, { from: [-9, 9], to: [x, y], colour: p.body, head: p.accent, shaft: 2.8, wide: 8, long: 6 });
      iconArrow(g, pen, { from: [-9, 9], to: [9.4, -9.4], colour: p.body, head: p.accent, shaft: 2.8, wide: 8, long: 6 });
    },
  },
  pierce: {
    label: 'Pierce', angle: ICON_DIAGONAL, onPlate: 0.94,        // its two ends would cross a plate's rim
    draw: (g, pen, p) => {
      const hoop = { colour: p.accent, y: 2.5, rx: 9.4, ry: 6, thick: 2.7 };
      iconHoop(g, pen, { ...hoop, half: 'back' });
      iconArrow(g, pen, { from: [0, 14], to: [0, -14], colour: p.body, shaft: 2.8, wide: 8.6, long: 7, notch: 1.5 });
      iconHoop(g, pen, { ...hoop, half: 'front', over: true });
    },
  },
  magnet: {
    label: 'Magnet', angle: ICON_DIAGONAL,
    draw: (g, pen, p) => iconMagnet(g, pen, { colour: p.body, tips: p.accent }),
  },
  shield: {
    label: 'Shield',
    draw: (g, pen, p) => iconShield(g, pen, { face: p.body, rim: p.accent }),
  },
  crit: {
    label: 'Critical hit',
    draw: (g, pen, p) => iconCrosshair(g, pen, { colour: p.body, mark: p.accent }),
  },
  regen: {
    label: 'Regeneration',
    draw: (g, pen, p) => iconHeart(g, pen, { colour: p.body, plus: p.accent, cross: 10, thick: 2.4 }),
  },
  dash: {
    label: 'Dash',
    draw: (g, pen, p) => {
      iconStreaks(g, pen, { lines: [[-11.5, 1.4, -5.8], [-11.5, -4, 0], [-8.5, 1.4, 5.8]], colour: p.accent, thick: 2.8 });
      iconArrow(g, pen, { from: [-2.4, 0], to: [11.5, 0], colour: p.body, shaft: 5.6, wide: 15.5, long: 8.5 });
    },
  },
};

export default defineSprite({
  id: 'icons-upgrades',
  name: 'Upgrade icons',
  kind: 'Item',
  blurb: 'Ten flat sign pictures for upgrade cards, from damage and fire rate to regeneration and dash; change the plate behind them, their weight, shine, size and three colours.',
  meta: {
    type: 'icon', role: 'items/icon', themes: ['sci-fi', 'space'], gameTypes: ['roguelike-action', 'shooter', 'arcade'], view: 'none',
    words: ['upgrade', 'perk', 'powerup', 'buff', 'skill', 'ability', 'damage', 'speed', 'shield', 'magnet', 'critical', 'heal', 'dash', 'level up'],
    license: 'draft',
  },
  size: [...ICON_SIZE],
  pivot: [...ICON_PIVOT],
  grounded: false,
  preview: 'damage',
  params: {
    backing: choice('Plate', 'hex', ['none', { value: 'hex', label: 'Hexagon' }, 'circle']),
    bold: toggle('Bold', false),
    shine: toggle('Shine', true),
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    face: color('Plate colour', P.plate, [P.plate, P.deck, P.hull, P.signal, P.nebula], { when: { backing: [...ICON_PLATES] } }),
    body: color('Picture', P.cyan, [P.cyan, P.suit, P.heal, P.steel, P.chitin]),
    accent: color('Second colour', P.amber, [P.amber, P.gold, P.acid, P.xp, P.cream]),
  },
  clips: iconClips(Object.entries(ICONS).map(([name, i]) => [name, i.label])),

  render(g, { clip, p }) {
    const icon = ICONS[clip];
    const plate = p.backing === 'none' ? null : iconPlate(g, { shape: p.backing, size: p.size, face: p.face, shine: p.shine });
    iconFit(g, { size: p.size, tilt: true, angle: icon.angle ?? 0, shade: false, shine: p.shine, fill: plate ? icon.onPlate : 1, span: plate ? [plate.room, plate.room] : undefined }, (s, pen) => {
      icon.draw(s, p.bold ? iconBold(pen) : pen, p);
      iconTidy(s).outline(INK);
    });
  },
});
