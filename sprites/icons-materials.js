// Material icons (core-sprites-2, batch K17): eight raw materials for crafting, building and trading,
// one clip each. Every shape comes from the icon helpers (engine/icons.js for the layout and the
// style controls, engine/icons-more.js for the material shapes); this file only says which shape
// each icon is, how it leans and what colours it takes.
//
// Silhouettes, so no two are told apart by colour alone: a short log with a ringed cut end (log), a
// crosswise pile of three boards (planks), a smooth round boulder (stone), an angular broken chunk
// set with big lit nuggets (ore), two stacked cast bars (ingot), a long cylinder showing its wound end,
// its loose end lying flat under it (bolt of cloth), three turns of a coil with a loose end (rope) and
// an animal skin with four leg flaps, a neck and a tail (hide). Cloth and hide use the second takes of
// engine/icons-craft.js, which read at 1x where the first takes of icons-more.js did not; the planks and the
// ore come from engine/icons-swatch.js: the planks shaded in the picked wood's own hue (the old ramp turned
// brown boards crimson in their shadows), the ore's nuggets each sunk in a dark socket so pale metal on pale
// rock still reads as ore at 1x.
// Colours: Wood paints the log and the planks (the log's bark in it, its cut end a paler mix), Stone
// the stone and the ore's rock, Metal the ingots and the ore's flecks, Cloth and hide the cloth and
// the hide; the rope and the cloth's core are fixed palette colours.
import { defineSprite, range, color, toggle } from '../engine/sprite.js';
import { INK, mix } from '../engine/color.js';
import { PALETTE } from '../engine/palettes.js';
import { ICON_SIZE, ICON_PIVOT, ICON_LEAN, iconClips, iconFit, iconTidy } from '../engine/icons.js';
import { iconLog, iconOre, iconIngot, iconCoil } from '../engine/icons-more.js';
import { iconRoll, iconPelt } from '../engine/icons-craft.js';
import { iconBoards, iconOreLumps } from '../engine/icons-swatch.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale;

// Per icon: its lean when tilted and what it draws before the outline.
const ICONS = {
  log: {
    label: 'Log', angle: -ICON_LEAN,
    body: (g, pen, p) => iconLog(g, pen, { bark: p.wood, wood: mix(p.wood, P.cream, 0.45) }),
  },
  plank: {
    label: 'Planks', angle: -ICON_LEAN,
    body: (g, pen, p) => iconBoards(g, pen, { wood: p.wood, count: 3 }),
  },
  stone: {
    label: 'Stone', angle: ICON_LEAN, fill: 0.9,
    body: (g, pen, p) => iconOre(g, pen, { stone: p.stone, flecks: 0 }),
  },
  ore: {
    label: 'Ore', angle: ICON_LEAN,
    body: (g, pen, p) => iconOreLumps(g, pen, { stone: p.stone, metal: p.metal, nuggets: 3 }),
  },
  ingot: {
    label: 'Ingot', angle: -ICON_LEAN,
    body: (g, pen, p) => iconIngot(g, pen, { metal: p.metal, stack: 2 }),
  },
  cloth: {
    label: 'Bolt of cloth', angle: -ICON_LEAN / 2,
    body: (g, pen, p) => iconRoll(g, pen, { cloth: p.accent, core: P.wood }),
  },
  rope: {
    label: 'Rope', angle: ICON_LEAN / 2,
    body: (g, pen) => iconCoil(g, pen, { rope: H.wheat }),
  },
  hide: {
    label: 'Hide', angle: ICON_LEAN / 2,
    body: (g, pen, p) => iconPelt(g, pen, { hide: p.accent }),
  },
};

export default defineSprite({
  id: 'icons-materials',
  name: 'Material icons',
  kind: 'Item',
  blurb: 'Eight raw-material icons: log, planks, stone, ore, ingot, a bolt of cloth, rope and a hide; change their size, tilt, shading, shine and the colours of the wood, stone, metal and cloth.',
  meta: {
    type: 'icon', role: 'items/icon', themes: ['neutral', 'farm', 'fantasy'], gameTypes: ['farming-sim', 'top-down-rpg', 'roguelike-action', 'arcade'], view: 'none',
    words: ['material', 'resource', 'log', 'planks', 'stone', 'ore', 'ingot', 'cloth', 'rope', 'hide', 'crafting', 'craft', 'build', 'mine'],
    license: 'draft',
  },
  size: [...ICON_SIZE],
  pivot: [...ICON_PIVOT],
  grounded: false,
  preview: 'ingot',
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    tilt: toggle('Tilt', true),
    shade: toggle('Extra shading', true),
    shine: toggle('Shine', true),
    wood: color('Wood', P.wood, [P.wood, P.soil, '#a8612a', '#c98a4a', P.cream]),
    stone: color('Stone', P.stone, [P.stone, P.slate, '#6b7280', H.cobble]),
    metal: color('Metal', P.steel, [P.steel, P.gold, '#e6c545', H.rust, P.crimson]),
    accent: color('Cloth and hide', P.hero, [P.hero, P.thorn, P.leaf, P.ember, P.moss], { material: 'cloth' }),
  },
  clips: iconClips(Object.entries(ICONS).map(([name, i]) => [name, i.label])),
  versions: [
    { name: 'Workshop', params: {} },
    { name: 'Upright', params: { tilt: false } },
    { name: 'Copper and dark wood', params: { metal: H.rust, wood: P.soil } },
    { name: 'Gold ore, red cloth', params: { metal: P.gold, accent: P.ember } },
    { name: 'Plain and big', params: { size: 1, shade: false, stone: P.slate } },
  ],

  render(g, { clip, p }) {
    const icon = ICONS[clip];
    iconFit(g, { size: p.size, tilt: p.tilt, shade: p.shade, shine: p.shine, angle: icon.angle, fill: icon.fill }, (s, pen) => {
      icon.body(s, pen, p);
      iconTidy(s).outline(INK);
    });
  },
});
