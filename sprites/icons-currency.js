// Currency icons (core-sprites-2, batch K18): what a shop, a reward screen or a top bar counts, one
// clip each. Every shape comes from the icon helpers (engine/icons.js for the layout, the style
// controls, the gem, the heart and the pen; engine/icons-more.js for the coins, note, token, ticket
// and bolt; engine/shapes.js for the star); this file only says which shape each icon is, how it
// leans and what colours it takes.
//
// Silhouettes, so no two are told apart by colour alone: a stack of three coins (coins), a cut diamond
// (gem), a folded note lying level (banknote), a thick round token with a star in its face (token), a
// strip with notched ends (ticket), a five-pointed star with sharp points and no face (star), a heart
// (lives) and a zigzag bolt (energy). No currency sign, letter or face on the note or the token.
// Colours: Gold paints the coins, the token's rim and the star; Paper the note and the ticket (their
// oval and stub are tones of it); Gems and energy the gem, the token's face and the bolt. The heart
// keeps its red whatever the look.
import { defineSprite, range, color, toggle } from '../engine/sprite.js';
import { tone, INK } from '../engine/color.js';
import { PALETTE } from '../engine/palettes.js';
import { ICON_SIZE, ICON_PIVOT, ICON_LEAN, iconClips, iconFit, iconTidy, iconGlint, iconGem, iconHeart, iconPaint } from '../engine/icons.js';
import { iconCoins, iconBill, iconToken, iconTicket, iconBolt } from '../engine/icons-more.js';
import { starIn } from '../engine/shapes.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale;

// Per icon: its lean when tilted, its share of the set's size (none: all of it) and what it draws before the outline.
const ICONS = {
  coins: { label: 'Coins', angle: ICON_LEAN / 2, draw: (g, pen, p) => iconCoins(g, pen, { metal: p.metal, count: 3 }) },
  gem: {
    label: 'Gem', angle: ICON_LEAN / 2, fill: 0.92,
    draw: (g, pen, p) => iconGem(g, pen, { colour: p.accent, cut: 'diamond', rx: 11, ry: 10 }),
  },
  banknote: {
    label: 'Banknote', angle: -ICON_LEAN,
    draw: (g, pen, p) => iconBill(g, pen, { paper: p.paper, mark: tone(p.paper, -0.6) }),
  },
  token: { label: 'Token', angle: ICON_LEAN / 2, draw: (g, pen, p) => iconToken(g, pen, { metal: p.metal, face: p.accent }) },
  ticket: {
    label: 'Ticket', angle: -ICON_LEAN,
    draw: (g, pen, p) => iconTicket(g, pen, { paper: p.paper, stub: tone(p.paper, -0.6) }),
  },
  star: {
    label: 'Star', angle: ICON_LEAN / 2,
    draw: (g, pen, p) => {
      iconPaint(g, pen, starIn(0, 0.8, 12.4, 5, { inner: 0.44 }), p.metal, { soft: 1 });
      iconGlint(g, pen, 2.2, -4.2, { len: 2, dot: false });
    },
  },
  lives: { label: 'Lives', angle: 0, fill: 0.95, draw: (g, pen) => iconHeart(g, pen, { colour: P.crimson }) },
  energy: { label: 'Energy', angle: ICON_LEAN / 2, draw: (g, pen, p) => iconBolt(g, pen, { colour: p.accent }) },
};

export default defineSprite({
  id: 'icons-currency',
  name: 'Currency icons',
  kind: 'Item',
  blurb: 'Eight currency icons for a shop or a top bar: coins, gem, banknote, token, ticket, star, lives and energy; change their size, tilt, shading, shine and the colours of the gold, the paper and the gems.',
  meta: {
    type: 'icon', role: 'interface/icon', themes: ['neutral'], gameTypes: ['arcade', 'roguelike-action', 'farming-sim', 'card-game'], view: 'none',
    words: ['currency', 'money', 'coins', 'cash', 'gem', 'banknote', 'token', 'ticket', 'star', 'lives', 'energy', 'shop', 'buy', 'reward'],
    license: 'draft',
  },
  size: [...ICON_SIZE],
  pivot: [...ICON_PIVOT],
  grounded: false,
  preview: 'coins',
  materials: { rest: 'signal' },
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    tilt: toggle('Tilt', true),
    shade: toggle('Extra shading', true),
    shine: toggle('Shine', true),
    metal: color('Gold', P.gold, [P.gold, P.steel, '#e6c545', H.rust, '#c98a4a']),
    paper: color('Paper', P.goblin, [P.goblin, P.cream, P.moss, P.sky, P.skin], { material: 'paint' }),
    accent: color('Gems and energy', P.magic, [P.magic, P.crimson, P.thorn, P.hero, P.ember]),
  },
  clips: iconClips(Object.entries(ICONS).map(([name, i]) => [name, i.label])),
  versions: [
    { name: 'Wallet', params: {} },
    { name: 'Silver', params: { metal: P.steel } },
    { name: 'Upright', params: { tilt: false } },
    { name: 'Ruby and cream', params: { accent: P.crimson, paper: P.cream } },
    { name: 'Big and plain', params: { size: 1, shade: false, shine: false } },
  ],

  render(g, { clip, p }) {
    const icon = ICONS[clip];
    iconFit(g, { size: p.size, tilt: p.tilt && icon.angle !== 0, angle: icon.angle, shade: p.shade, shine: p.shine, fill: icon.fill }, (s, pen) => {
      icon.draw(s, pen, p);
      iconTidy(s).outline(INK);
    });
  },
});
