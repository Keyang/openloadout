// Weapon icons (kit-roguelite-scifi, batch S16): the six weapons a run can find, one clip each,
// every one seen from the side with its muzzle to the right. Every shape comes from the icon helper
// (engine/icons.js), which also fits each weapon to the same size and draws the plate; this file
// only says which shape each icon is, how it leans and what colours it takes.
//
// Silhouettes: a short slab with a raked grip (blaster), a long gun with a dropped stock, a pump and
// a muzzle band (scatter), a thin rod carrying three rings (beam), a fat tube with a flared bell and
// a pointed nose (rocket), three claws round a hub (orbit blades) and a low drum with prongs (mine).
// The first three are the void ranger's weapon options (rigs/topdown.js, heldGun).
// Colours: Metal is every weapon's body, its darker tones the grips and stocks; Glow is each one's
// light (cell, dot, emitter tip, rocket nose, cutting edges, lamp). The warning bands are amber.
// The plate's swatches are all dark and the metals all light, so a weapon shows on every plate.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { tone, INK } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { glow, twinkle } from '../engine/fx.js';
import { ICON_SIZE, ICON_PIVOT, ICON_RISE, ICON_PLATES, iconClips, iconFit, iconTidy, iconPlate, iconRise, iconPistol, iconShotgun, iconBeamGun, iconLauncher, iconBlades, iconMine } from '../engine/icons.js';

const P = PALETTE.derelict;

// Per weapon: its share of the room on a plate (none: all of it), what it draws before the outline
// (level: the helper's iconRise then lifts the muzzle to the top right when Tilt is on) and the
// light it adds after; `at` turns a point the shape returned into its place in the frame.
const ICONS = {
  blaster: {
    label: 'Blaster', onPlate: 0.94,        // its corners would cross a plate's rim
    body: (g, pen, p) => iconPistol(g, pen, { metal: p.body, glow: p.glow }),
  },
  scatter: {
    label: 'Scatter gun',
    body: (g, pen, p) => iconShotgun(g, pen, { metal: p.body, glow: p.glow }),
  },
  beam: {
    label: 'Beam',
    body: (g, pen, p) => iconBeamGun(g, pen, { metal: p.body, glow: p.glow }),
    // the lit tip of the emitter: a small ball of light with a darker rim of its own colour
    light: (g, pen, p, at, { tip }) => { const [x, y] = at(...tip); glow(g, x + 0.5, y + 0.5, 2.4, [pen.shine ? '#ffffff' : p.glow, p.glow, tone(p.glow, -1)]); },
  },
  rocket: {
    label: 'Rocket launcher',
    body: (g, pen, p) => iconLauncher(g, pen, { metal: p.body, glow: p.glow, mark: P.amber }),
  },
  'orbit-blades': {
    label: 'Orbit blades', level: true,
    // a thing that spins does not climb: Tilt turns it a twelfth of a turn instead
    body: (g, pen, p) => iconBlades(g, pen, { metal: p.body, glow: p.glow, turn: p.tilt ? Math.PI / 6 : 0 }),
  },
  mine: {
    label: 'Mine',
    body: (g, pen, p) => iconMine(g, pen, { metal: p.body, glow: p.glow, mark: P.amber }),
    light: (g, pen, p, at, { lamp }) => { if (pen.shine) twinkle(g, ...at(...lamp), 1, p.glow); },
  },
};

export default defineSprite({
  id: 'icons-weapons',
  name: 'Weapon icons',
  kind: 'Item',
  blurb: 'Six sci-fi weapon icons seen from the side: blaster, scatter gun, beam, rocket launcher, orbit blades and mine; change the plate behind them, their tilt, shine, size and colours.',
  meta: {
    type: 'icon', role: 'items/weapon', themes: ['sci-fi', 'space'], gameTypes: ['roguelike-action', 'shooter', 'arcade'], view: 'none',
    words: ['weapon', 'gun', 'pistol', 'blaster', 'shotgun', 'laser', 'rocket launcher', 'mine', 'blades', 'loadout', 'equip', 'arsenal', 'shoot'],
    license: 'draft',
  },
  size: [...ICON_SIZE],
  pivot: [...ICON_PIVOT],
  grounded: false,
  preview: 'blaster',
  params: {
    backing: choice('Plate', 'none', ['none', { value: 'hex', label: 'Hexagon' }, 'circle']),
    shine: toggle('Shine', true),
    tilt: toggle('Tilt', true),
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    face: color('Plate colour', P.plate, [P.plate, P.deck, P.hull, P.signal, P.nebula], { when: { backing: [...ICON_PLATES] } }),
    // light metals only, so a weapon never merges with its plate; no amber among the lights: it is the warning bands' colour
    body: color('Metal', P.panel, [P.panel, P.steel, P.suit, P.gold, P.chitin]),
    glow: color('Glow', P.cyan, swatches('derelict', 'glow').filter((c) => c !== P.amber)),
  },
  clips: iconClips(Object.entries(ICONS).map(([name, i]) => [name, i.label])),

  render(g, { clip, p }) {
    const icon = ICONS[clip];
    const plate = p.backing === 'none' ? null : iconPlate(g, { shape: p.backing, size: p.size, face: p.face, shine: p.shine });
    iconFit(g, { size: p.size, tilt: false, shade: false, shine: p.shine, fill: plate ? icon.onPlate : 1, span: plate ? [plate.room, plate.room] : undefined }, (s, pen) => {
      let made;
      const moved = iconRise(s, p.tilt && !icon.level ? ICON_RISE : 0, (u) => { made = icon.body(u, pen, p); });
      iconTidy(s).outline(INK);
      if (icon.light) icon.light(s, pen, p, (x, y) => moved(...pen.pt(x, y).map(Math.floor)), made);
    });
  },
});
