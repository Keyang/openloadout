// FROZEN COPY, not a sprite: sprites/icons-food.js as it was before P1 (2026-11-20), when icons-food was redrawn as data (sprites/icons-food.json)
// and the code file deleted. Kept only as the reference the port tests compare with (gen-b8-ports, data-sprite-v2-b8,
// ui-export) and as a stand-in code sprite for the loader tests (tests/helpers/data-sprites.mjs copies it into a scratch
// project's sprites/ with its imports put back to '../engine/'). Never edit it; the build never scans tests/.
// Food icons (core-sprites-2, batch K17): eight things to eat for a farming inventory, a cooking menu
// or an RPG bag, one clip each. Every shape comes from the icon helpers (engine/icons.js for the
// layout and the style controls, engine/icons-more.js for the food shapes, which reach the food
// pickups' fruit and meals of engine/food.js through iconFood); this file only says which shape each
// icon is, how it leans and what colours it takes.
//
// Silhouettes, so no two are told apart by colour alone: a round fruit with a stalk and a leaf
// (apple), a meaty lump on a bone with two knobs (roast leg), a wedge (cheese), a long body with a
// forked tail (fish), a smooth oval (egg), a long taper under a leafy top (carrot), a dome on a thick
// stem (mushroom: plain brown with gills, never a red cap with spots) and a wide bowl on a foot (soup).
// Colours: Fruit paints the apple, Greens the apple's leaf, the carrot's top and the herb in the soup,
// Bowl the soup bowl; everything else is a fixed Thornwood colour.
import { defineSprite, range, color, toggle } from '../../../engine/sprite.js';
import { INK } from '../../../engine/color.js';
import { PALETTE } from '../../../engine/palettes.js';
import { ICON_SIZE, ICON_PIVOT, ICON_LEAN, iconClips, iconFit, iconTidy } from '../../../engine/icons.js';
import { iconFood, iconFish, iconEgg, iconRoot, iconBowl } from '../../../engine/icons-more.js';
import { iconMushroomPlain } from '../../../engine/icons-craft.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale;

// Per icon: its lean when tilted and what it draws before the outline.
const ICONS = {
  apple: {
    label: 'Apple', angle: ICON_LEAN / 2,
    body: (g, pen, p) => iconFood(g, pen, { kind: 'apple', colour: p.body, stalk: P.soil, leaf: p.accent }),
  },
  drumstick: {
    label: 'Roast leg', angle: ICON_LEAN / 2,
    body: (g, pen) => iconFood(g, pen, { kind: 'drumstick', colour: P.wood, bone: P.cream }),
  },
  cheese: {
    label: 'Cheese', angle: -ICON_LEAN / 2,
    body: (g, pen) => iconFood(g, pen, { kind: 'cheese', colour: P.gold }),
  },
  fish: {
    label: 'Fish', angle: -ICON_LEAN,
    body: (g, pen) => iconFish(g, pen, { body: P.water, belly: P.cream, fin: P.water }),
  },
  egg: {
    label: 'Egg', angle: ICON_LEAN, fill: 0.88,
    body: (g, pen) => iconEgg(g, pen, { shell: P.cream }),
  },
  carrot: {
    label: 'Carrot', angle: ICON_LEAN,
    body: (g, pen, p) => iconRoot(g, pen, { kind: 'carrot', root: P.ember, leaf: p.accent }),
  },
  mushroom: {
    label: 'Mushroom', angle: ICON_LEAN / 2,
    body: (g, pen) => iconMushroomPlain(g, pen, { cap: P.soil, stem: P.cream }),
  },
  soup: {
    label: 'Soup', angle: 0,
    body: (g, pen, p) => iconBowl(g, pen, { bowl: p.bowl, soup: P.ember, herb: p.accent }),
  },
};

export default defineSprite({
  id: 'icons-food',
  name: 'Food icons',
  kind: 'Item',
  blurb: 'Eight food icons: apple, roast leg, cheese, fish, egg, carrot, mushroom and a bowl of soup; change their size, tilt, shading, shine and the colours of the fruit, the greens and the bowl.',
  meta: {
    type: 'icon', role: 'items/icon', themes: ['neutral', 'farm', 'fantasy'], gameTypes: ['farming-sim', 'top-down-rpg', 'turn-based-rpg', 'arcade'], view: 'none',
    words: ['food', 'apple', 'meat', 'cheese', 'fish', 'egg', 'carrot', 'mushroom', 'soup', 'cooking', 'ingredient', 'eat', 'harvest', 'inventory'],
    license: 'draft',
  },
  size: [...ICON_SIZE],
  pivot: [...ICON_PIVOT],
  grounded: false,
  preview: 'apple',
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    tilt: toggle('Tilt', true),
    shade: toggle('Extra shading', true),
    shine: toggle('Shine', true),
    body: color('Fruit', P.crimson, [P.crimson, P.gold, P.moss, P.thorn, P.ember], { material: 'plant' }),
    accent: color('Greens', P.leaf, [P.leaf, P.grass, H.leaf, H.pine]),
    bowl: color('Bowl', P.wood, [P.wood, P.soil, P.cream, P.steel, '#a8612a', '#c98a4a'], { material: 'paint' }),
  },
  clips: iconClips(Object.entries(ICONS).map(([name, i]) => [name, i.label])),
  versions: [
    { name: 'Pantry', params: {} },
    { name: 'Upright', params: { tilt: false, body: P.ember, accent: H.pine } },
    { name: 'Green apple', params: { body: P.moss, accent: P.grass } },
    { name: 'Plain and big', params: { size: 1, shade: false, shine: false } },
    { name: 'Dark bowl', params: { bowl: P.soil, body: P.gold } },
  ],

  render(g, { clip, p }) {
    const icon = ICONS[clip];
    iconFit(g, { size: p.size, tilt: p.tilt, shade: p.shade, shine: p.shine, angle: icon.angle, fill: icon.fill }, (s, pen) => {
      icon.body(s, pen, p);
      iconTidy(s).outline(INK);
    });
  },
});
