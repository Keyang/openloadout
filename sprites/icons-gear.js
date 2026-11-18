// Equipment icons (kit-rpg-fantasy, batch R17): nine things worn or wielded, one clip each.
// Every shape comes from the icon helper (engine/icons.js), which also carries the set's style
// controls (size, tilt, soft shading, shine); this file only says which shape each icon is, how
// it leans and what colours it takes.
//
// The four weapons lie on the same diagonal, handle at the bottom left: the hero's sword (steel
// blade, gold hilt), the mage's staff (wood, an orb in the spell colour), the rogue's dagger and a
// bow. The shield turns with the pen. The helm, the breastplate and the boots are full of small
// square details, so they are painted upright and leaned by sliding rows (iconSlant).
//
// Silhouettes, so no two are told apart by colour alone: a long blade with a cross guard (sword),
// a stick with a ball in a cup (staff), a short broad blade with a ring (dagger), an arc with a
// string (bow), a flat-topped board that ends in a point (shield), a dome with two horns (helm),
// broad shoulders over a narrow waist (armour), a hoop with a stone (ring) and two L shapes (boots).
import { defineSprite, range, color, toggle } from '../engine/sprite.js';
import { INK, pick } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import {
  ICON_SIZE, ICON_PIVOT, ICON_LEAN, ICON_DIAGONAL, ICON_SLANT, iconClips, iconFit, iconTidy, iconSlant,
  iconSword, iconStaff, iconDagger, iconBow, iconShield, iconHelm, iconArmour, iconRing, iconBoot,
} from '../engine/icons.js';

const P = PALETTE.hearthvale;

// A guard, a pommel or a buckle is gold, or steel when the metal it sits on is itself golden.
const fitting = (p) => pick(p.metal, P.gold, P.steel);

// Per icon: its lean when tilted (`angle` turns the pen, `slant` slides the rows of an upright
// drawing), its share of the set's size (the dagger and the ring are the small ones) and what it draws.
const ICONS = {
  sword: {
    label: 'Sword', angle: ICON_DIAGONAL,
    body: (g, pen, p) => iconSword(g, pen, { metal: p.metal, hilt: fitting(p), grip: p.leather, gem: p.accent }),
  },
  staff: {
    label: 'Staff', angle: ICON_DIAGONAL,
    body: (g, pen, p) => iconStaff(g, pen, { wood: p.wood, metal: p.metal, orb: p.accent, grip: p.leather }),
  },
  dagger: {
    label: 'Dagger', angle: ICON_DIAGONAL, fill: 0.82,
    body: (g, pen, p) => iconDagger(g, pen, { metal: p.metal, hilt: fitting(p), grip: p.leather }),
  },
  bow: {
    label: 'Bow', angle: ICON_DIAGONAL,
    body: (g, pen, p) => iconBow(g, pen, { wood: p.wood, grip: p.leather, tips: p.metal, string: P.cream }),
  },
  shield: {
    label: 'Shield', angle: ICON_LEAN,
    body: (g, pen, p) => iconShield(g, pen, { face: p.wood, rim: p.metal, gem: p.accent }),
  },
  helm: {
    label: 'Helm', slant: ICON_SLANT,
    body: (g, pen, p) => iconHelm(g, pen, { metal: p.metal, horn: P.cream, gem: p.accent }),
  },
  armour: {
    label: 'Armour', slant: ICON_SLANT,
    body: (g, pen, p) => iconArmour(g, pen, { metal: p.metal, belt: p.leather, buckle: fitting(p), gem: p.accent }),
  },
  ring: {
    label: 'Ring', angle: ICON_LEAN, fill: 0.86,
    body: (g, pen, p) => iconRing(g, pen, { metal: p.metal, gem: p.accent }),
  },
  boots: {
    label: 'Boots', slant: ICON_SLANT,
    body: (g, pen, p) => iconBoot(g, pen, { leather: p.leather, sole: p.wood, buckle: p.metal, pair: true }),
  },
};

export default defineSprite({
  id: 'icons-gear',
  name: 'Equipment icons',
  kind: 'Item',
  blurb: 'Nine equipment icons: sword, staff, dagger, bow, shield, helm, armour, ring and boots; change their size, tilt, shading, shine and the colours of metal, wood, leather and jewels.',
  meta: {
    type: 'icon', role: 'items/weapon', themes: ['fantasy'], gameTypes: ['turn-based-rpg', 'top-down-rpg', 'roguelike-action'], view: 'none',
    words: ['sword', 'staff', 'dagger', 'bow', 'shield', 'helmet', 'armour', 'armor', 'ring', 'boots', 'equipment', 'gear', 'weapon', 'equip'],
    license: 'draft',
  },
  size: [...ICON_SIZE],
  pivot: [...ICON_PIVOT],
  grounded: false,
  preview: 'sword',
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    tilt: toggle('Tilt', true),
    shade: toggle('Soft shading', true),
    shine: toggle('Shine', true),
    metal: color('Metal', P.steel, [P.steel, P.gold, P.cobble, P.rust, P.flagstone]),
    wood: color('Wood', P.wood, swatches('hearthvale', 'wood')),
    leather: color('Leather', P.bandit, [P.bandit, P.roof, P.rogue, P.pine, P.hero]),
    accent: color('Jewels', P.magic, swatches('hearthvale', 'gem')),
  },
  clips: iconClips(Object.entries(ICONS).map(([name, i]) => [name, i.label])),

  render(g, { clip, p }) {
    const icon = ICONS[clip];
    iconFit(g, { size: p.size, tilt: p.tilt, shade: p.shade, shine: p.shine, angle: icon.angle ?? 0, fill: icon.fill }, (s, pen) => {
      iconSlant(s, icon.slant && p.tilt ? icon.slant : 0, (u) => icon.body(u, pen, p));
      iconTidy(s).outline(INK);
    });
  },
});
