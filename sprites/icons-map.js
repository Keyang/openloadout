// Map marker icons (core-sprites-2, batch K18): marks for a world map, a minimap and a quest log, one
// clip each, upright. Every shape comes from the icon helpers (engine/icons.js for the layout, the pen
// and the bold pen; engine/icons-more.js for the pin, flag, X, house, shop front and chest;
// engine/icons-badge.js to set a picture on a pin's plate; engine/shapes.js and engine/gadgets.js for
// the skull and the arrow); this file only says which shape each icon is and what colours it takes.
//
// Silhouettes, so no two are told apart by colour alone: a drop-shaped pin (pin), a pennant on a pole
// (flag), a bold X (dig spot), a house with a chimney (town), a striped awning over a counter (shop), a
// banded chest (treasure), a skull (danger) and a broad arrow head pointing down at the spot (you are
// here). Quests use the flag and the pin: there is no exclamation or question mark over a head.
// Style "badge" sets every picture but the pin on the plate of a big-headed pin of the Marker colour
// (iconBadgeStem, engine/icons-badge-stem.js: iconPin's own plate is too small for a picture to read at 1x).
// Below the middle of the Size slider a badge keeps its head and shortens its point, so the picture never
// shrinks past reading; on a badge the arrow is a solid head with a one-pixel tip (the chevron's notch
// closes up at that size). On a badge the skull, the house, the shop and the chest are hand-set pixel
// pictures (GLYPHS, drawn with engine/glyphs.js), because their computed shapes blur at that size; each
// takes five colours at most, so no badge clip goes past the icon limit of ten.
// Colours: Marker paints the pin, the flag, the X, the skull's eyes, the arrow, the house's door and the
// awning; Second colour the flag pole, the roofs, the awning's stripes and the chest's bands (moved
// lighter or darker in its own hue where it would melt into the chest). Fixed: walls and bone cream
// (stone on a badge, off the Badge colour list, so they never melt into the face), the chest gold.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { INK } from '../engine/color.js';
import { Surface, polyIn } from '../engine/surface.js';
import { PALETTE } from '../engine/palettes.js';
import { ICON_SIZE, ICON_PIVOT, iconClips, iconFit, iconTidy, iconBold, iconPaint } from '../engine/icons.js';
import { iconPin, iconFlag, iconSign, iconHome, iconAwning, iconChest } from '../engine/icons-more.js';
import { iconHued } from '../engine/icons-swatch.js';
import { iconBadge } from '../engine/icons-badge.js';
import { iconBadgeStem, BADGE_STEM_TIP } from '../engine/icons-badge-stem.js';
import { skullIn } from '../engine/shapes.js';
import { chevronIn } from '../engine/gadgets.js';
import { glyphPicture, drawGlyph } from '../engine/glyphs.js';

const P = PALETTE.thornwood;
// On a badge the walls and the bone take stone, a colour off the Badge colour list, so they never melt into the face.
const pale = (p, badge) => (badge ? P.stone : P.cream);
// Badge style below the middle of the Size slider: the head (and the picture on it) stays as big as at the middle,
// and the pin's point shortens instead, from BADGE_STEM_TIP down to STEM_SHORT.
const STEM_SHORT = 7.8;
const BADGE_BOLD = 0.15;

// Badge pictures set by hand (engine/glyphs.js), for the icons whose computed shapes blur at the 12 px a badge
// plate holds: the skull, the house, the shop and the chest. Each is a list of layers { rows, main, second } (the
// glyph tones: '#' main, 'o' lit, 'x' shadow, '+' second, '-' second in shadow, 'i' ink), regular and bold, at most
// 10x10, so with its ink line it sits on the plate's 14 px face. Every picture takes five colours or fewer, so
// with the pin's own five no badge goes past ten.
const GLYPHS = {
  // a rounded cranium wider than its jaw, eyes of the Marker colour, an ink nose and teeth parted by ink
  danger: {
    regular: [{ rows: ['..#####..', '.####oo#.', '#######o#', '#++###++#', '#++###++#', 'x###i###x', '.xx###xx.', '..#####..', '..#.#.#..'], main: 'pale', second: 'body' }],
    bold: [{ rows: ['..#####..', '.#####oo.', '######oo#', '#++###++#', '#++###++#', 'x###i###x', 'xx#iii#xx', '.xx###xx.', '..#####..', '..##.##..'], main: 'pale', second: 'body' }],
  },
  // a pitched roof with a chimney over pale walls, a door of the Marker colour between them
  town: {
    regular: [
      { rows: ['....++..+.', '...++++.+.', '..+++++++.', '.++++++++.', '----------', '.x#######.', '.x#######.', '.x##..###.', '.x##..###.', '.x##..###.'], main: 'pale', second: 'accent' },
      { rows: ['', '', '', '', '', '', '', '....##', '....##', '....##'], main: 'body' },
    ],
    bold: [
      { rows: ['....++..++', '...++++.++', '..++++++++', '.++++++++.', '----------', '----------', '.x#######.', '.x##..###.', '.x##..###.', '.x##..###.'], main: 'pale', second: 'accent' },
      { rows: ['', '', '', '', '', '', '', '....##', '....##', '....##'], main: 'body' },
    ],
  },
  // an awning striped in the Marker and Second colours over a dark doorway and a pale counter
  shop: {
    regular: [
      { rows: ['##++##++##', '##++##++##', 'xx--xx--xx'], main: 'body', second: 'accent' },
      { rows: ['', '', '', '.#iiiiii#.', '.#iiiiii#.', '.#iiiiii#.', '.x#######.', '.x#######.'], main: 'pale' },
    ],
    bold: [
      { rows: ['##++##++##', '##++##++##', '##++##++##', 'xx--xx--xx'], main: 'body', second: 'accent' },
      { rows: ['', '', '', '', '.##iiii##.', '.##iiii##.', '.x#######.', '.x#######.'], main: 'pale' },
    ],
  },
  // a gold chest with straps, a rim and a lock in the Second colour
  treasure: {
    regular: [{ rows: ['.oooooooo.', '#+######+#', '#+######+#', '-+------+-', '#+##++##+#', '#+######+#', 'x+xxxxxx+x'], main: 'gold', second: 'metal' }],
    bold: [{ rows: ['.oooooooo.', '#++####++#', '#++####++#', '-++----++-', '-++-++-++-', '#++#++#++#', '#++####++#', 'x++xxxx++x'], main: 'gold', second: 'metal' }],
  },
};

// Set one hand-made badge picture in the middle of a plate: its layers painted, then one ink line round them all.
function badgeGlyph(g, pen, plate, layers, colours, shine) {
  const u = new Surface(g.w, g.h), [cx, cy] = pen.pt(plate.x, plate.y);
  const pics = layers.map((l) => ({ ...l, pic: glyphPicture(l.rows) }));
  const w = Math.max(...pics.map((l) => l.pic.w)), h = Math.max(...pics.map((l) => l.pic.h));
  const x0 = Math.round(cx - w / 2), y0 = Math.round(cy - h / 2);
  for (const l of pics) drawGlyph(u, l.pic, x0, y0, { main: colours[l.main], second: colours[l.second || l.main], shine });
  u.outline(INK);
  g.blit(u);
}

// Per icon: its label and what it draws before the outline.
const ICONS = {
  pin: { label: 'Pin', draw: (g, pen, p) => iconPin(g, pen, { colour: p.body }) },
  flag: { label: 'Flag', draw: (g, pen, p) => iconFlag(g, pen, { cloth: p.body, pole: p.accent }) },
  dig: { label: 'Dig spot', draw: (g, pen, p) => iconSign(g, pen, { kind: 'close', colour: p.body }) },
  town: { label: 'Town', draw: (g, pen, p, badge) => iconHome(g, pen, { wall: pale(p, badge), roof: p.accent, door: p.body }) },
  shop: { label: 'Shop', draw: (g, pen, p, badge) => iconAwning(g, pen, { cloth: p.body, stripe: p.accent, wall: pale(p, badge) }) },
  treasure: { label: 'Treasure', draw: (g, pen, p) => iconChest(g, pen, { wood: P.gold, metal: iconHued(p.accent, [P.gold], 22) }) },
  danger: {
    label: 'Danger',
    draw: (g, pen, p, badge, thin = pen) => {
      // on a badge the pen is small: teeth gaps of a whole pixel, or the jaw closes up into a tombstone
      const k = skullIn(0, 0, 20, 20, badge ? { teeth: 2, gap: 1.6 / pen.k } : {});
      iconPaint(g, pen, k.bone, pale(p, badge), { soft: 0, minus: k.gaps });
      // the sockets keep the regular weight on a bold badge, or the two eyes run into one bar
      iconPaint(g, thin, [k.sockets, k.nose], p.body, { flat: true });
    },
  },
  // on a badge the chevron is too small to keep its notch: a solid arrow head with straight sides and one-pixel tip
  here: {
    label: 'You are here',
    draw: (g, pen, p, badge) => {
      if (!badge) return iconPaint(g, pen, chevronIn(0, 0, 22, 16, 7), p.body, { soft: 0 });
      // the head's middle moved onto a pixel's middle, so its rows are an odd number of pixels wide and the tip is one
      const [x0] = pen.pt(0, 0), o = (Math.floor(x0) + 0.5 - x0) / pen.k;
      iconPaint(g, pen, polyIn([[o - 10, -8], [o + 10, -8], [o, 10]]), p.body, { soft: 0 });
    },
  },
};

export default defineSprite({
  id: 'icons-map',
  name: 'Map marker icons',
  kind: 'Item',
  blurb: 'Eight map marks for a world map or a quest log, from a pin and a flag to a dig spot, a town, a shop, treasure, danger and "you are here"; show them as pictures or on pin badges and change their weight, shine, size and colours.',
  meta: {
    type: 'icon', role: 'interface/icon', themes: ['neutral', 'fantasy', 'farm'], gameTypes: ['top-down-rpg', 'turn-based-rpg', 'farming-sim', 'roguelike-action'], view: 'none',
    words: ['map', 'marker', 'pin', 'waypoint', 'flag', 'quest', 'dig', 'town', 'shop', 'treasure', 'danger', 'you are here', 'minimap', 'location'],
    license: 'draft',
  },
  size: [...ICON_SIZE],
  pivot: [...ICON_PIVOT],
  grounded: false,
  preview: 'pin',
  params: {
    style: choice('Style', 'picture', ['picture', 'badge']),
    bold: toggle('Bold', false),
    shine: toggle('Shine', true),
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    face: color('Badge colour', P.cream, [P.cream, P.goblin, P.sky, P.skin, P.haze], { when: { style: ['badge'] } }),
    body: color('Marker', P.crimson, [P.crimson, P.hero, P.gold, P.leaf, P.thorn, P.ember]),
    accent: color('Second colour', P.wood, [P.wood, P.soil, P.steel, P.slate]),
  },
  clips: iconClips(Object.entries(ICONS).map(([name, i]) => [name, i.label])),
  versions: [
    { name: 'Map marks', params: {} },
    { name: 'Pin badges', params: { style: 'badge' } },
    { name: 'Blue route', params: { body: P.hero, accent: P.slate } },
    { name: 'Bold and big', params: { bold: true, size: 1 } },
    { name: 'Gold quest', params: { body: P.gold, accent: P.soil, style: 'badge', face: P.goblin } },
  ],

  render(g, { clip, p }) {
    const icon = ICONS[clip], badge = p.style === 'badge' && clip !== 'pin';
    const tip = badge ? BADGE_STEM_TIP - (BADGE_STEM_TIP - STEM_SHORT) * Math.max(0, 1 - 2 * p.size) : BADGE_STEM_TIP;
    iconFit(g, { size: p.size, tilt: false, angle: 0, shade: false, shine: p.shine }, (s, pen0) => {
      const pen = p.bold ? iconBold(pen0) : pen0;
      if (!badge) {
        icon.draw(s, pen, p);
        iconTidy(s).outline(INK);
        return;
      }
      // the badge pin keeps its regular weight, so Bold never shrinks the plate the picture sits on
      const { plate } = iconBadgeStem(s, pen0, { colour: p.body, face: p.face, tip });
      iconTidy(s).outline(INK);
      const glyph = GLYPHS[clip];
      if (glyph) {
        const colours = { pale: pale(p, true), body: p.body, accent: p.accent, gold: P.gold, metal: iconHued(p.accent, [P.gold], 22) };
        return badgeGlyph(s, pen0, plate, glyph[p.bold ? 'bold' : 'regular'], colours, p.shine);
      }
      // a badge picture is drawn small, where a full bold step closes its gaps: half the step there
      iconBadge(s, pen0, plate, (u, inner) => icon.draw(u, p.bold ? iconBold(inner, BADGE_BOLD) : inner, p, true, inner));
    });
  },
});
