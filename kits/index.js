// Kits: sprites, sounds and music that belong together and download as one folder.
export const kits = [
  {
    id: 'dungeon-starter',
    name: 'Dungeon starter',
    blurb: 'A hero, two enemies and a coin to collect, with the footsteps, sword, hits, pickup sounds and battle music a first level needs.',
    sprites: ['knight', 'slime', 'bat', 'coin'],
    sounds: ['sword-slash', 'footstep-gravel', 'jump', 'punch', 'coin-pickup', 'metal-hit', 'whoosh'],
    music: ['battle-theme'],
  },
  {
    id: 'wizard-camp',
    name: 'Wizard camp',
    blurb: 'A wizard, a wolf and a campfire for a night scene, with spell, fire and wind sounds.',
    sprites: ['wizard', 'wolf', 'campfire'],
    sounds: ['magic-spell', 'fire', 'wind', 'footstep-gravel', 'whoosh', 'punch', 'chime-success'],
  },
  {
    id: 'menu-sounds',
    name: 'Menu sounds',
    blurb: 'Clicks, confirms, errors and rewards for buttons and menus.',
    sprites: ['coin'],
    sounds: ['ui-click', 'chime-success', 'error-buzz', 'powerup', 'coin-pickup'],
  },
];
export const kitById = Object.fromEntries(kits.map((k) => [k.id, k]));
