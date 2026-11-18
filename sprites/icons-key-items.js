// Key item icons (kit-rpg-fantasy, batch R16): six story items, one clip each. Every shape comes
// from the icon helper (engine/icons.js), which also carries the set's style controls (size, tilt,
// extra shading, shine) and fits every icon to the same size; this file only says which shape each
// icon is, how it leans and what colours it takes.
//
// Silhouettes: a long key with a ring (key), a tied tube (map), a flat rectangle with a round seal
// (letter), two splinters of crystal (crystal shard, in the save crystal's colour), a round sack with
// a frilled neck and coins at its foot (coin pouch) and a boxy lamp with a ring on top (lantern).
// Colours: Metal is the key, the coins and the lantern; Paper the map and the letter; Crystal and
// seal the shard, the map's band, the letter's seal and the lantern's flame. The lantern's glass is
// dark, so its flame shows whatever colour it is given and under every whole-bundle look.
import { defineSprite, range, color, toggle } from '../engine/sprite.js';
import { INK } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { ICON_SIZE, ICON_PIVOT, ICON_LEAN, ICON_DIAGONAL, iconClips, iconFit, iconTidy, iconKey, iconScroll, iconLetter, iconGem, iconPouch, iconLantern } from '../engine/icons.js';

const P = PALETTE.hearthvale;

// Per icon: its lean when tilted and what it draws before the outline.
const ICONS = {
  key: {
    label: 'Key', angle: ICON_DIAGONAL,
    body: (g, pen, p) => iconKey(g, pen, { metal: p.metal }),
  },
  map: {
    label: 'Map', angle: -ICON_DIAGONAL,
    body: (g, pen, p) => iconScroll(g, pen, { paper: p.paper, band: p.accent }),
  },
  letter: {
    label: 'Letter', angle: ICON_LEAN / 2,
    body: (g, pen, p) => iconLetter(g, pen, { paper: p.paper, seal: p.accent }),
  },
  'crystal-shard': {
    label: 'Crystal shard', angle: ICON_LEAN,
    body: (g, pen, p) => {
      // a small splinter leaning out from the foot of the big one
      iconGem(g, pen, { colour: p.accent, cut: 'shard', x: -5.6, y: 5.4, rx: 3, ry: 6.6, turn: -0.42, glint: false });
      iconGem(g, pen, { colour: p.accent, cut: 'shard', x: 1.2, y: 0, rx: 6, ry: 12.4 });
    },
  },
  'coin-pouch': {
    label: 'Coin pouch', angle: ICON_LEAN / 2,
    body: (g, pen, p) => iconPouch(g, pen, { cloth: P.wood, tie: P.wheat, coin: p.metal }),
  },
  lantern: {
    label: 'Lantern', angle: ICON_LEAN,
    body: (g, pen, p) => iconLantern(g, pen, { metal: p.metal, glow: P.slate, flame: p.accent }),
  },
};

export default defineSprite({
  id: 'icons-key-items',
  name: 'Key item icons',
  kind: 'Item',
  blurb: 'Six story-item icons: a key, a rolled map, a sealed letter, a crystal shard, a coin pouch and a lantern; change their size, tilt, shading, shine and colours.',
  meta: {
    type: 'icon', role: 'items/key', themes: ['fantasy'], gameTypes: ['turn-based-rpg', 'top-down-rpg', 'roguelike-action'], view: 'none',
    words: ['key', 'map', 'scroll', 'letter', 'envelope', 'crystal', 'shard', 'pouch', 'purse', 'lantern', 'quest', 'story', 'inventory', 'unlock'],
    license: 'draft',
  },
  size: [...ICON_SIZE],
  pivot: [...ICON_PIVOT],
  grounded: false,
  preview: 'key',
  params: {
    shade: toggle('Extra shading', true),
    shine: toggle('Shine', true),
    tilt: toggle('Tilt', true),
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    // no slate among the metals: it is the lantern's glass, and the frame must not merge with it
    metal: color('Metal', P.gold, swatches('hearthvale', 'metal', { lead: 'gold' }).filter((c) => c !== P.slate)),
    paper: color('Paper', P.cream, [P.cream, P.wheat, P.skin, P.path, P.haze, P.cobble]),
    accent: color('Crystal and seal', P.magic, swatches('hearthvale', 'gem')),
  },
  clips: iconClips(Object.entries(ICONS).map(([name, i]) => [name, i.label])),

  render(g, { clip, p }) {
    const icon = ICONS[clip];
    iconFit(g, { size: p.size, tilt: p.tilt, shade: p.shade, shine: p.shine, angle: icon.angle }, (s, pen) => {
      icon.body(s, pen, p);
      iconTidy(s).outline(INK);
    });
  },
});
