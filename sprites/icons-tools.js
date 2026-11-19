// Tool icons (core-sprites-2, batch K17): the eight tools of a farming or crafting game, one clip
// each, handle bottom left and head top right like every icon in the library. Every shape comes from
// the icon helpers (engine/icons.js for the layout and the style controls, engine/icons-more.js for
// the tool shapes); this file only says which shape each icon is, how it leans and what colours it takes.
//
// Silhouettes, so no two are told apart by colour alone: a blade flaring to a curved edge (axe, iconAxe), a curved
// pick both ways (pickaxe), a pointed spade with straight sides and a cross grip (shovel, iconSpade), a flat blade bent forward
// (hoe), a block head (hammer), a long handle under a crescent blade opening towards it (sickle, iconSickle), a round can with a long
// spout (watering can) and a long thin rod with a reel and a hanging line (fishing rod).
// Colours: Metal paints the heads, the can and the reel, Handles the handles and the rod, Grips the
// wrap under each head and the can's band; the can's drops and the fishing line are fixed colours.
// Metal passes through iconHued (engine/icons-swatch.js), which moves it lighter or darker in its OWN hue
// until it parts from the handle, and the grip moves the same way, in its own hue, off the metal, so the
// swatches picked are still the colours of the heads and the wraps (rust on wood turns a paler rust, not
// maroon, and the crimson wrap under it a deeper crimson). The shovel (a pointed spade, straight sides, symmetric) and the
// sickle (a long handle under a crescent that opens down towards it) also come from icons-swatch.js; untilted,
// the sickle keeps a small lean like the fishing rod so it never stands as a question mark.
import { defineSprite, range, color, toggle } from '../engine/sprite.js';
import { INK } from '../engine/color.js';
import { PALETTE } from '../engine/palettes.js';
import { ICON_SIZE, ICON_PIVOT, ICON_LEAN, ICON_DIAGONAL, iconClips, iconFit, iconTidy } from '../engine/icons.js';
import { iconTool, iconCan, iconRod } from '../engine/icons-more.js';
import { iconAxe } from '../engine/icons-craft.js';
import { iconSpade, iconSickle, iconHued } from '../engine/icons-swatch.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale;

// the metal in its own hue, moved lighter or darker only as far as it takes to part from the handle; then the
// grip, in its own hue, moved off the metal, so the head never melts into the wrap under it
const metalOf = (p) => iconHued(p.metal, [p.wood], 12);
const gripOf = (p) => iconHued(p.accent, [metalOf(p)], 20);

// A hand tool on the diagonal. No white glint is added: on a steel head it hardly shows and it would
// take the shovel and the hoe past the set's ten colours; Shine still lights each head's lit face.
const SHAPE = { axe: iconAxe, shovel: iconSpade, sickle: iconSickle };
const tool = (kind, label, more = {}) => ({
  label, angle: ICON_DIAGONAL, ...more,
  body: (g, pen, p) => (SHAPE[kind] ?? iconTool)(g, pen, { kind, metal: metalOf(p), wood: p.wood, grip: gripOf(p) }),
});

// Per icon: its lean when tilted and what it draws before the outline.
const ICONS = {
  axe: tool('axe', 'Axe'),
  pickaxe: tool('pickaxe', 'Pickaxe'),
  shovel: tool('shovel', 'Shovel'),
  hoe: tool('hoe', 'Hoe'),
  hammer: tool('hammer', 'Hammer'),
  sickle: tool('sickle', 'Sickle', { upright: ICON_LEAN }),
  'watering-can': {
    label: 'Watering can', angle: ICON_LEAN,
    body: (g, pen, p) => iconCan(g, pen, { metal: metalOf(p), water: P.water, band: gripOf(p) }),
  },
  'fishing-rod': {
    label: 'Fishing rod', angle: ICON_DIAGONAL, upright: ICON_LEAN,
    body: (g, pen, p) => iconRod(g, pen, { wood: p.wood, line: P.cream, metal: metalOf(p) }),
  },
};

export default defineSprite({
  id: 'icons-tools',
  name: 'Tool icons',
  kind: 'Item',
  blurb: 'Eight tool icons: axe, pickaxe, shovel, hoe, hammer, sickle, watering can and fishing rod; change their size, tilt, shading, shine and the colours of the metal, the handles and the grips.',
  meta: {
    type: 'icon', role: 'items/icon', themes: ['neutral', 'farm'], gameTypes: ['farming-sim', 'top-down-rpg', 'roguelike-action', 'arcade'], view: 'none',
    words: ['tool', 'axe', 'pickaxe', 'shovel', 'hoe', 'hammer', 'sickle', 'watering can', 'fishing rod', 'chop', 'dig', 'farm', 'craft', 'equip'],
    license: 'draft',
  },
  size: [...ICON_SIZE],
  pivot: [...ICON_PIVOT],
  grounded: false,
  preview: 'axe',
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    tilt: toggle('Tilt', true),
    shade: toggle('Extra shading', true),
    shine: toggle('Shine', true),
    metal: color('Metal', P.steel, [P.steel, P.gold, P.slate, H.rust, '#e6c545']),
    wood: color('Handles', P.wood, [P.wood, P.soil, '#a8612a', '#c98a4a', P.cream]),
    accent: color('Grips', P.crimson, [P.crimson, P.hero, P.leaf, P.thorn, P.ember]),
  },
  clips: iconClips(Object.entries(ICONS).map(([name, i]) => [name, i.label])),
  versions: [
    { name: 'Toolshed', params: {} },
    { name: 'Gold tools', params: { metal: P.gold, accent: P.hero } },
    { name: 'Dark handles', params: { wood: P.soil, accent: P.leaf } },
    { name: 'Upright', params: { tilt: false } },
    { name: 'Old iron', params: { metal: H.rust, size: 1, shine: false } },
  ],

  render(g, { clip, p }) {
    const icon = ICONS[clip];
    // a rod stood straight up would hide its line against itself: untilted it still leans a little
    const lean = p.tilt ? icon.angle : icon.upright ?? 0;
    iconFit(g, { size: p.size, tilt: lean !== 0, shade: p.shade, shine: p.shine, angle: lean, fill: icon.fill }, (s, pen) => {
      icon.body(s, pen, p);
      iconTidy(s).outline(INK);
    });
  },
});
