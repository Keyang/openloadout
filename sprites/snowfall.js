// Snowfall (core-sprites-2, batch K19): screen-wide snow as one 64x64 loop that wraps round its inner 62x62 square, so
// copies laid 62 px apart cover the screen with no seam. Built on the framework's wrapping weather field
// (engine/weather.js `fallField`): a near layer of swaying flakes over an optional far layer of fewer, smaller, dimmer
// ones, shifted so the two never line up. Near columns alternate the snow colour and a dimmer tone of it (some flakes a
// little further off); a plus or a star has a lighter middle pixel and a star dimmer arm tips, drawn as the same field
// again (same lattice, so the same places) with one-pixel dots on the middle or shifted onto the tips. This file is the styles (rows, how far each falls per loop, the slant), the
// flake sizes and the colours.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp } from '../engine/motion.js';
import { PALETTE } from '../engine/palettes.js';
import { tone } from '../engine/color.js';
import { fallField } from '../engine/weather.js';

const P = PALETTE.thornwood;
// Near and far flakes cross: the two lists share no colour.
const SNOW = [P.cream, '#d8d8e0', P.sky, P.steel, P.goblin];
const FAR = [P.haze, P.stone, P.slate, P.dusk];
// Each style: rows per column, row gaps fallen per loop (near), slant, and a fixed shape list (sleet) or none.
const STYLES = {
  soft: { rows: 4, laps: 1, slant: 0, shapes: null },
  blizzard: { rows: 3, laps: 3, slant: 1, shapes: null },
  sleet: { rows: 3, laps: 2, slant: 0, shapes: [{ shape: 'streak', size: 3 }, 'dot'] },
};
// the far layer's laps: about two thirds of the near laps, a whole number so its loop closes too
const farLaps = (laps) => Math.max(1, Math.round((2 / 3) * laps));
// lattice seeds whose columns start evenly spread down the square at every count (seed 0 bunches them into a band)
const NEAR_SEED = 26, FAR_SEED = 15;

export default defineSprite({
  id: 'snowfall',
  name: 'Snowfall',
  kind: 'Effect',
  blurb: 'Snow drifting down over the whole screen, swaying as it falls, as soft snow, a blizzard driving at 45 degrees or sleet. Change how many flakes, their size, the style, the sway, the far snow, the colours and the speed. Lay copies 62 px apart (each over its neighbours\' empty border) to cover the screen.',
  meta: { type: 'effect', role: 'effects/weather', themes: ['neutral', 'forest'], gameTypes: ['platformer', 'top-down-rpg', 'farming-sim', 'puzzle'], view: 'none',
    words: ['snow', 'snowfall', 'snowflakes', 'flakes', 'blizzard', 'sleet', 'winter', 'cold', 'falling', 'drifting', 'frosty', 'overlay'], license: 'draft' },
  size: [64, 64],
  pivot: [32, 32],
  grounded: false,
  params: {
    pieces: range('Flakes', 7, { min: 4, max: 12, step: 1, lo: 'Few', hi: 'Many' }),
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big', when: { style: ['soft', 'blizzard'] } }),
    style: choice('Style', 'soft', ['soft', 'blizzard', 'sleet']),
    sway: range('Sway', 0.5, { lo: 'Still', hi: 'Swaying', group: 'Motion' }),
    layers: toggle('Far snow', true),
    body: color('Snow', P.cream, SNOW, { material: 'water' }),
    accent: color('Far snow', P.haze, FAR, { material: 'water', when: { layers: [true] } }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    loop: { frames: 8, fps: (p) => 10 * lerp(0.65, 1.45, p.speed), loop: true },
  },
  sounds: { loop: [{ sound: 'wind', frame: 0, preset: 'Storm', volume: 0.35, when: { style: ['blizzard'] } }] },
  versions: [
    { name: 'Snowfall', params: {} },
    { name: 'Blizzard', params: { style: 'blizzard', pieces: 12 } },
    { name: 'Sleet', params: { style: 'sleet', pieces: 9 } },
    { name: 'Big flakes', params: { size: 1, pieces: 4 } },
    { name: 'Still night', params: { sway: 0, layers: false, body: P.sky } },
  ],

  render(g, { t, p }) {
    const s = STYLES[p.style];
    const near = Math.round(lerp(1, 3, p.size));                        // a dot, a plus or a star
    const common = { t, rows: s.rows, slant: s.slant, sway: lerp(0, 3, p.sway), swayCycles: 2 };
    if (p.layers) {
      fallField(g, { ...common, cols: Math.ceil(p.pieces / 2), laps: farLaps(s.laps), seed: FAR_SEED, shift: [17, 23], colours: [p.accent],
        ...(s.shapes ? { shapes: s.shapes, size: 1 } : { shape: 'flake', size: Math.max(1, near - 1) }) });
    }
    const dim = tone(p.body, -0.3), glint = tone(p.body, 0.6), tip = tone(p.body, -0.6);
    const nearField = { ...common, cols: p.pieces, laps: s.laps, seed: NEAR_SEED };
    fallField(g, { ...nearField, colours: [p.body, dim], ...(s.shapes ? { shapes: s.shapes, size: 2 } : { shape: 'flake', size: near }) });
    // a star's four arm tips (its corner cells 2 px out on each diagonal), then the lit middle of every plus or star
    if (!s.shapes && near >= 3) {
      for (const sh of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) fallField(g, { ...nearField, colours: [tip], shape: 'dot', size: 1, shift: sh });
    }
    if (s.shapes || near >= 2) fallField(g, { ...nearField, colours: [glint], shape: 'dot', size: 1 });
  },
});
