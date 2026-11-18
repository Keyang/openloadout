// Consumable icons (kit-rpg-fantasy, batch R16): eight things used from the item menu, one clip
// each. Every shape comes from the icon helper (engine/icons.js), which also carries the set's
// style controls (size, tilt, extra shading, shine) and fits every icon to the same size; this file
// only says which shape each icon is, how it leans and what colours it takes.
//
// Silhouettes, so no two are told apart by colour alone: a ball flask with a cork (potion), a cone
// flask with a ball stopper (mana flask), a small boxy bottle with a big cork and a label (antidote),
// a long loaf (bread), a leafy sprig (herb), a lit candle stub in a dish with a finger ring (the
// revive item: a candle, not a feather), a ball with a fuse (bomb) and a triangle (tent).
// Colours: Health fills the potion, Mana the flask, Bread and cloth the loaf, the tent and the wax.
import { defineSprite, range, color, toggle } from '../engine/sprite.js';
import { ramp, INK } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { twinkle } from '../engine/fx.js';
import { ICON_SIZE, ICON_PIVOT, ICON_LEAN, iconClips, iconFit, iconTidy, iconPaint, iconBottle, iconLoaf, iconSprig, iconCandle, iconBomb, iconTent, iconFlame } from '../engine/icons.js';
import { rectIn, ellipseIn } from '../engine/surface.js';

const P = PALETTE.hearthvale;

// Per icon: its lean when tilted, its share of the set's size (the antidote is the small one), what
// it draws before the outline, and the light it adds after.
const ICONS = {
  potion: {
    label: 'Potion', angle: ICON_LEAN,
    body: (g, pen, p) => iconBottle(g, pen, { shape: 'round', h: 23, glass: P.cream, liquid: p.body, cork: P.wood, level: 0.8 }),
  },
  'mana-flask': {
    label: 'Mana flask', angle: ICON_LEAN,
    body: (g, pen, p) => {
      const { top } = iconBottle(g, pen, { shape: 'flask', h: 23, glass: P.cream, liquid: p.accent, cork: P.steel, level: 0.85 });
      // a ball stopper in place of a cork: the flask's own mark
      iconPaint(g, pen, ellipseIn(0, top + 1.2, 2.9, 2.9), P.steel, { soft: 0, light: 0 });
    },
  },
  antidote: {
    label: 'Antidote', angle: ICON_LEAN, fill: 0.88,
    body: (g, pen) => {
      const { top, label } = iconBottle(g, pen, { shape: 'tall', h: 18, wide: 1.3, glass: P.cream, liquid: P.heal, cork: P.wood, level: 0.94, label: P.cream });
      // a big cork that overhangs the neck, and a cross on the label in the liquid's own dark tone
      iconPaint(g, pen, rectIn(-4, top - 0.8, 8, 3), P.wood, { soft: 0, light: 0 });
      const [x, y] = pen.pt(0, (label[1] + label[3]) / 2).map(Math.floor);
      g.rect(x - 1, y, 3, 1, ramp(P.heal).dark).rect(x, y - 1, 1, 3, ramp(P.heal).dark);
    },
  },
  bread: {
    label: 'Bread', angle: -ICON_LEAN,
    body: (g, pen, p) => iconLoaf(g, pen, { crust: p.cloth }),
  },
  herb: {
    label: 'Herb', angle: ICON_LEAN,
    body: (g, pen) => iconSprig(g, pen, { leaf: P.leaf, stem: P.pine }),
  },
  'revive-candle': {
    label: 'Revive candle', angle: ICON_LEAN / 2,
    body: (g, pen, p) => iconCandle(g, pen, { wax: p.cloth, dish: P.steel }),
    light: (g, pen, p, { wick }) => {
      const [x, y] = pen.pt(...wick);
      g.dot(x, y, INK); g.dot(x, y + 1, INK);
      iconFlame(g, pen, wick[0], wick[1] - 1, { h: 8, w: 6, colours: [P.thunder, P.fire] });
    },
  },
  bomb: {
    label: 'Bomb', angle: ICON_LEAN,
    body: (g, pen) => iconBomb(g, pen, { body: P.slate, cap: P.steel, fuse: P.path }),
    light: (g, pen, p, { fuse }) => twinkle(g, ...pen.pt(...fuse), 2, P.fire),
  },
  tent: {
    label: 'Tent', angle: ICON_LEAN / 2,
    body: (g, pen, p) => iconTent(g, pen, { cloth: p.cloth, pole: P.wood }),
  },
};

export default defineSprite({
  id: 'icons-consumables',
  name: 'Consumable icons',
  kind: 'Item',
  blurb: 'Eight item-menu icons: potion, mana flask, antidote, bread, herb, a revive candle, bomb and tent; change their size, tilt, shading, shine and colours.',
  meta: {
    type: 'icon', role: 'items/icon', themes: ['fantasy'], gameTypes: ['turn-based-rpg', 'top-down-rpg', 'roguelike-action'], view: 'none',
    words: ['potion', 'flask', 'bottle', 'antidote', 'bread', 'food', 'herb', 'candle', 'revive', 'bomb', 'tent', 'item', 'inventory', 'heal'],
    license: 'draft',
  },
  size: [...ICON_SIZE],
  pivot: [...ICON_PIVOT],
  grounded: false,
  preview: 'potion',
  params: {
    shade: toggle('Extra shading', true),
    shine: toggle('Shine', true),
    tilt: toggle('Tilt', true),
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    body: color('Health', P.crimson, swatches('hearthvale', 'gem', { lead: 'crimson' })),
    accent: color('Mana', P.hero, swatches('hearthvale', 'gem', { lead: 'hero' })),
    cloth: color('Bread and cloth', P.wheat, [P.wheat, P.cream, P.path, P.roof, P.skin, P.cobble]),
  },
  clips: iconClips(Object.entries(ICONS).map(([name, i]) => [name, i.label])),

  render(g, { clip, p }) {
    const icon = ICONS[clip];
    iconFit(g, { size: p.size, tilt: p.tilt, shade: p.shade, shine: p.shine, angle: icon.angle, fill: icon.fill }, (s, pen) => {
      const made = icon.body(s, pen, p);
      iconTidy(s).outline(INK);
      if (icon.light) icon.light(s, pen, p, made);
    });
  },
});
