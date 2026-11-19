// Smoke plume: a rising column for chimneys, wrecks, vents and put-out fires. Puffs are born small at
// the foot (the middle of row 45), swell and drift downwind as they climb, light when young and dark
// when old; `fade` stops feeding the column, which lifts off its foot and dies down to one wisp.
// The column is the framework's (engine/fumes.js `plume`, colours from engine/fx.js `steps`); this
// file is the look of the three styles and the timing.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp } from '../engine/motion.js';
import { mix, tone } from '../engine/color.js';
import { PALETTE } from '../engine/palettes.js';
import { steps } from '../engine/fx.js';
import { plume } from '../engine/fumes.js';

const P = PALETTE.thornwood;
const CX = 24, FOOT = 44.5;                      // the column's foot: the middle of row 45 (its rim lands on row 46)
// Light and dark puffs touch in the column, so the two lists share no colour.
const LIGHT = [P.cream, P.haze, P.sky, '#d8d8e0'];
const DARK = [P.stone, P.slate, P.cavern, '#6b7280', P.moss];

// The colours of the column, lightest first, the rim last.
function colours(p) {
  if (p.style === 'soot') return [mix(p.core, p.edge, 0.55), p.edge, tone(p.edge, -0.6), tone(p.edge, -1.4)];      // dark: the light colour only tints the young puffs
  if (p.style === 'steam') { const m = mix(p.core, p.edge, 0.35); return [p.core, mix(p.core, m, 0.5), m, tone(m, -1.2)]; }   // pale all the way up
  return steps(p.edge, { core: p.core, white: false });
}

// The column's settings for this look: steam is quick and thin, soot slow and lumpy.
function column(p, t) {
  const steam = p.style === 'steam', soot = p.style === 'soot';
  return {
    t, x: CX, y: FOOT, count: p.pieces, seed: 5, cycles: steam ? 2 : 1,
    rise: lerp(26, 35, p.size) * (soot ? 0.9 : 1), drift: lerp(0, 13, p.drift), sway: steam ? 0.6 : 1.2,
    size: lerp(3.2, 5.6, p.size) * (steam ? 0.85 : soot ? 1.05 : 1), shape: steam ? 'wispy' : soot ? 'lumpy' : 'round',
    colours: colours(p),
  };
}

export default defineSprite({
  id: 'smoke-plume',
  name: 'Smoke plume',
  kind: 'Effect',
  blurb: 'A column of smoke or steam rising from a chimney, a wreck or a vent, which can die down. Change its size, puffs, drift, style and colours.',
  meta: { type: 'effect', role: 'effects/dust', themes: ['neutral', 'city', 'fantasy'], gameTypes: ['platformer', 'top-down-rpg', 'shooter', 'farming-sim'], view: 'side',
    words: ['smoke', 'plume', 'chimney', 'steam', 'vent', 'soot', 'fumes', 'column', 'rising', 'wreck', 'burnt', 'die down', 'fade'], license: 'draft' },
  size: [48, 48],
  pivot: [24, 46],
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    pieces: range('Puffs', 5, { min: 3, max: 8, step: 1, lo: 'Few', hi: 'Many' }),
    drift: range('Drift', 0.5, { lo: 'Still', hi: 'Windy' }),
    style: choice('Style', 'smoke', ['smoke', 'steam', 'soot']),
    core: color('Light smoke', P.cream, LIGHT, { material: 'stone' }),
    edge: color('Dark smoke', P.stone, DARK, { material: 'stone' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    loop: { frames: 8, fps: (p) => 10 * lerp(0.65, 1.45, p.speed), loop: true },
    fade: { label: 'Die down', frames: 8, fps: (p) => 10 * lerp(0.65, 1.45, p.speed), loop: false },
  },
  versions: [
    { name: 'Chimney smoke', params: {} },
    { name: 'Steam vent', params: { style: 'steam', drift: 0, core: P.sky } },
    { name: 'Black smoke', params: { style: 'soot', core: P.haze, edge: P.slate } },
    { name: 'Windy', params: { drift: 1, pieces: 7 } },
    { name: 'Wisp', params: { size: 0, pieces: 3 } },
  ],

  render(g, { clip, t, p }) {
    if (clip === 'loop') plume(g, column(p, t));
    else plume(g, { ...column(p, t), stop: 0 });          // starts as loop frame 0; no puff is born after it, so it ends on one wisp
  },
});
