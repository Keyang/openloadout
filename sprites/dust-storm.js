// Dust storm (core-sprites-2, batch K20): sand and grit streaming to the right across the whole screen as one 64x64
// loop that wraps round its inner 62x62 square, so copies laid 62 px apart cover the screen with no seam. Built on the
// framework's wrapping weather field (engine/weather.js `fallField` with `axis: 'x'`): streams of grains (1 px dashes
// along the wind), fine dust (dots between dashes) or debris (every third stream a tumbling leaf). Streams alternate
// the sand colour and the dark grains; debris leaves are dark. A game mirrors it for a wind blowing left. This file is
// the styles (rows, how far each streams per loop, the shapes), the grain length and the colours.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp } from '../engine/motion.js';
import { PALETTE } from '../engine/palettes.js';
import { fallField } from '../engine/weather.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale;
// Streams of the two colours can touch: the lists share no colour.
const SAND = [P.cream, P.stone, P.haze, H.wheat, H.path];
const DARK = [P.wood, P.soil, P.slate, P.ember];
// Each style: pieces per stream, how far each streams per loop (in piece gaps), flips per gap, the shape list (by
// stream), and the colours by stream ('b' sand, 'a' dark grains). Dots and leaves keep their own size.
const STYLES = {
  sand: { rows: 3, laps: 3, turns: 1, shapes: ['grain'], tones: ['b', 'a'] },
  dust: { rows: 4, laps: 2, turns: 1, shapes: [{ shape: 'dot', size: 1 }, 'grain'], tones: ['b', 'a'] },
  debris: { rows: 2, laps: 3, turns: 2, shapes: ['grain', 'grain', { shape: 'leaf', size: 4 }], tones: ['b', 'a', 'a'] },
};
// a lattice seed whose streams start evenly spread across the square at every count (seed 0 bunches them into a band)
const SEED = 26;

export default defineSprite({
  id: 'dust-storm',
  name: 'Dust storm',
  kind: 'Effect',
  blurb: 'Sand and grit streaming sideways across the whole screen, as a sandstorm, a haze of fine dust or blown debris with tumbling leaves. Change how many grains, how long, the style, the sway, the colours and the speed. Lay copies 62 px apart (each over its neighbours\' empty border) to cover the screen.',
  meta: { type: 'effect', role: 'effects/weather', themes: ['neutral', 'farm'], gameTypes: ['top-down-rpg', 'racing', 'shooter', 'platformer'], view: 'none',
    words: ['dust', 'sandstorm', 'sand', 'grit', 'wind', 'windy', 'desert', 'wasteland', 'debris', 'blowing', 'haze', 'overlay'], license: 'draft' },
  size: [64, 64],
  pivot: [32, 32],
  grounded: false,
  params: {
    pieces: range('Grains', 8, { min: 4, max: 12, step: 1, lo: 'Few', hi: 'Many' }),
    length: range('Length', 0.5, { lo: 'Short', hi: 'Long' }),
    style: choice('Style', 'sand', ['sand', 'dust', 'debris']),
    sway: range('Sway', 0.5, { lo: 'Still', hi: 'Swaying', group: 'Motion' }),
    body: color('Sand', P.cream, SAND, { material: 'earth' }),
    accent: color('Dark grains', P.wood, DARK, { material: 'earth' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    loop: { frames: 8, fps: (p) => 10 * lerp(0.65, 1.45, p.speed), loop: true },
  },
  sounds: { loop: [{ sound: 'wind', frame: 0, preset: 'Storm', volume: 0.35 }] },
  versions: [
    { name: 'Sandstorm', params: {} },
    { name: 'Golden sand', params: { body: H.wheat, pieces: 10 } },
    { name: 'Dust haze', params: { style: 'dust', length: 1 } },
    { name: 'Debris', params: { style: 'debris', pieces: 6 } },
    { name: 'Grey grit', params: { body: P.stone, accent: P.slate } },
    { name: 'Light breeze', params: { pieces: 4, length: 0 } },
  ],

  render(g, { t, p }) {
    const s = STYLES[p.style];
    fallField(g, { t, axis: 'x', cols: p.pieces, rows: s.rows, laps: s.laps, turns: s.turns, sway: lerp(0, 3, p.sway), swayCycles: 1,
      seed: SEED, shapes: s.shapes, size: Math.round(lerp(2, 6, p.length)), colours: s.tones.map((k) => (k === 'b' ? p.body : p.accent)) });
  },
});
