// Settings icons (core-sprites-2, batch K18): the ten signs of a settings and pause menu, one clip
// each, upright on a round or six-sided plate or alone. Every shape comes from the icon helpers
// (engine/icons.js for the layout, the plate and the bold pen; engine/icons-more.js for the signs);
// this file only says which sign each icon is and what colours it takes.
//
// Silhouettes, so no two are told apart by colour alone: a toothed wheel (settings), a speaker with two
// waves (sound), a speaker with a cross (mute), two joined notes (music), a screen on a stand with
// full-screen corners (display), a bar with two grips (controls, no maker's outline), a lined globe
// (language), an open tray with an arrow going in (save: not a floppy disk), two bars (pause) and a
// house with a chimney (home).
// Colours: Picture is the main shape of each; Second colour the cog's hub, the mute cross, the save
// arrow, the house's door and the controller's marks; the house's roof is the picture's dark tone. The
// plate swatches are all dark and the pictures all light, so a picture shows on every plate.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { ramp, INK } from '../engine/color.js';
import { PALETTE } from '../engine/palettes.js';
import { ICON_SIZE, ICON_PIVOT, ICON_PLATES, iconClips, iconFit, iconTidy, iconPlate, iconBold } from '../engine/icons.js';
import { iconCog, iconSpeaker, iconNote, iconScreen, iconPad, iconGlobe, iconTray, iconSign, iconHome } from '../engine/icons-more.js';

const P = PALETTE.thornwood, D = PALETTE.derelict;

// Per icon: its label, its share of the room on a plate (none: all of it) and what it draws before the outline.
const ICONS = {
  settings: { label: 'Settings', draw: (g, pen, p) => iconCog(g, pen, { colour: p.body, hub: p.accent }) },
  sound: { label: 'Sound', draw: (g, pen, p) => iconSpeaker(g, pen, { colour: p.body, waves: 2 }) },
  mute: { label: 'Mute', draw: (g, pen, p) => iconSpeaker(g, pen, { colour: p.body, waves: 0, cross: p.accent }) },
  music: { label: 'Music', draw: (g, pen, p) => iconNote(g, pen, { colour: p.body, double: true }) },
  display: { label: 'Display', draw: (g, pen, p) => iconScreen(g, pen, { colour: p.body, corners: true }) },
  controls: { label: 'Controls', draw: (g, pen, p) => iconPad(g, pen, { colour: p.body, mark: p.accent }) },
  language: { label: 'Language', draw: (g, pen, p) => iconGlobe(g, pen, { colour: p.body, lines: 2 }) },
  save: { label: 'Save', draw: (g, pen, p) => iconTray(g, pen, { colour: p.body, arrow: 'in', mark: p.accent }) },
  pause: { label: 'Pause', onPlate: 0.9, draw: (g, pen, p) => iconSign(g, pen, { kind: 'pause', colour: p.body }) },
  home: { label: 'Home', draw: (g, pen, p) => iconHome(g, pen, { wall: p.body, roof: ramp(p.body).dark, door: p.accent }) },
};

export default defineSprite({
  id: 'icons-system',
  name: 'Settings icons',
  kind: 'Item',
  blurb: 'Ten settings and pause menu signs, from a cog, sound and mute to save, pause and home; change the plate behind them, their weight, shine, size and three colours.',
  meta: {
    type: 'icon', role: 'interface/icon', themes: ['neutral'], gameTypes: ['arcade', 'puzzle', 'platformer', 'card-game'], view: 'none',
    words: ['settings', 'options', 'menu', 'cog', 'gear', 'sound', 'volume', 'mute', 'music', 'display', 'controller', 'language', 'save', 'pause'],
    license: 'draft',
  },
  size: [...ICON_SIZE],
  pivot: [...ICON_PIVOT],
  grounded: false,
  preview: 'settings',
  params: {
    backing: choice('Plate', 'circle', ['none', 'circle', { value: 'hex', label: 'Hexagon' }]),
    bold: toggle('Bold', false),
    shine: toggle('Shine', true),
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    face: color('Plate colour', P.slate, [P.slate, P.hero, P.cavern, P.soil, P.thorn, D.plate], { when: { backing: [...ICON_PLATES] } }),
    body: color('Picture', P.cream, [P.cream, P.gold, P.magic, P.goblin, P.steel]),
    accent: color('Second colour', P.crimson, [P.crimson, P.ember, P.moss, P.grass]),
  },
  clips: iconClips(Object.entries(ICONS).map(([name, i]) => [name, i.label])),
  versions: [
    { name: 'Round plates', params: {} },
    { name: 'No plates', params: { backing: 'none', body: P.steel } },
    { name: 'Gold on hexagons', params: { backing: 'hex', body: P.gold } },
    { name: 'Bold blue', params: { bold: true, face: P.hero } },
    { name: 'Night', params: { face: D.plate, body: P.magic, accent: P.ember } },
  ],

  render(g, { clip, p }) {
    const icon = ICONS[clip];
    const plate = p.backing === 'none' ? null : iconPlate(g, { shape: p.backing, size: p.size, face: p.face, shine: p.shine });
    iconFit(g, { size: p.size, tilt: false, angle: 0, shade: false, shine: p.shine, fill: plate ? icon.onPlate ?? 1 : 1, span: plate ? [plate.room, plate.room] : undefined }, (s, pen) => {
      icon.draw(s, p.bold ? iconBold(pen) : pen, p);
      iconTidy(s).outline(INK);
    });
  },
});
