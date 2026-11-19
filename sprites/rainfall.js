// Rain (core-sprites-2, batch K19): screen-wide rain as one 64x64 loop that wraps round its inner 62x62 square, so
// copies laid 62 px apart cover the screen with no seam. Built on the framework's wrapping weather field
// (engine/weather.js `fallField`): a near layer of long bright streaks over an optional far layer of fewer, shorter,
// dimmer ones, shifted so the two never line up. Rain and storm streaks are drawn here from the field's own lattice
// (fallLattice + fallAt), so the two streaks of a column can differ: a long one with a lighter leading drop and a
// short dim one, each with a dimmer trailing pixel (see STYLES for why). Drizzle is fallField itself, its columns
// alternating the rain colour and a dimmer tone, each drop lit on its leading pixel by the same field again as one-pixel
// dots. This file is the styles (how many rows, how far each falls per loop, the slant), the streak lengths and the colours.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp } from '../engine/motion.js';
import { PALETTE } from '../engine/palettes.js';
import { tone } from '../engine/color.js';
import { fallField, fallLattice, fallAt } from '../engine/weather.js';

const P = PALETTE.thornwood;
// Near and far streaks cross: the two lists share no colour.
const RAIN = [P.sky, P.cream, P.water, P.steel, '#d8d8e0'];
const FAR = [P.haze, P.stone, P.slate, P.dusk];
// Each style: rows per column, row gaps fallen per loop (near), slant, the near shape list and extra streak length,
// and how the two streaks of a column are told apart (`mark`). Rain falls 4 row gaps per loop and storm 5, as the
// specification says. With 2 rows and 8 frames that is half a row gap a frame (rain) and more than half (storm), so if
// both streaks of a column looked alike the eye could not tell which way they move (rain) or would pair each streak with
// the one above and see the rain rise (storm). So the two streaks of a column differ: one long and bright-headed, the
// other short and dim, and each keeps its look from frame to frame, so the eye follows it down.
//   mark 'row': the look belongs to the piece (its lattice row); at an even number of laps each piece ends the loop on
//     its own place, so the loop closes.
//   mark n: the look is a function of height, long over n bands down the square and short between, so it closes at any
//     laps; n is picked so one frame's fall is close to a whole band pair (storm: 19.4 px a frame against bands 20.7 px
//     apart), so a streak keeps its look while the one above, half a band pair away, shows the other look.
const STYLES = {
  drizzle: { rows: 3, laps: 2, slant: 0, shapes: ['dot', { shape: 'streak', size: 2 }], extra: 0 },
  rain: { rows: 2, laps: 4, slant: 0, shapes: null, extra: 0, mark: 'row' },
  storm: { rows: 2, laps: 5, slant: 1, shapes: null, extra: 2, mark: 3 },
};
// the far layer's laps: about two thirds of the near laps, a whole number so its loop closes too
const farLaps = (laps) => Math.max(1, Math.round((2 / 3) * laps));
// lattice seeds whose columns start evenly spread down the square at every count (seed 0 bunches them into a band)
const NEAR_SEED = 26, FAR_SEED = 15;
const PERIOD = 62, ORIGIN = 1;
const wrap = (v) => ((v % PERIOD) + PERIOD) % PERIOD;

// the near streaks of rain and storm, drawn from the same lattice fallField uses: each streak a 1 px line running back
// up its path from its anchor (the leading drop, lightest), its last pixel dimmer; a short streak is dimmer all through
function nearStreaks(g, { t, cols, rows, laps, slant, mark, long, short, body, dim, head, tail }) {
  const opts = { rows, laps, slant, period: PERIOD };
  for (const piece of fallLattice({ cols, rows, period: PERIOD, seed: NEAR_SEED })) {
    const at = fallAt(piece, t, opts);
    const isLong = mark === 'row' ? piece.row === 0 : Math.floor(wrap(at.y) * mark / PERIOD * 2) % 2 === 0;
    const n = isLong ? long : short;
    const ax = Math.floor(at.x), ay = Math.floor(at.y);
    for (let k = n - 1; k >= 0; k--) {
      const c = k === 0 ? (isLong ? head : body) : k === n - 1 ? tail : isLong ? body : dim;
      g.dot(ORIGIN + wrap(ax - slant * k), ORIGIN + wrap(ay - k), c);
    }
  }
}

export default defineSprite({
  id: 'rainfall',
  name: 'Rain',
  kind: 'Effect',
  blurb: 'Rain falling over the whole screen, near streaks long and bright over far ones short and dim, as drizzle, rain or a slanting storm. Change how many drops, how long, the style, the far rain, the colours and the speed. Lay copies 62 px apart (each over its neighbours\' empty border) to cover the screen.',
  meta: { type: 'effect', role: 'effects/weather', themes: ['neutral', 'forest', 'city'], gameTypes: ['platformer', 'top-down-rpg', 'farming-sim', 'shooter'], view: 'none',
    words: ['rain', 'raindrops', 'shower', 'drizzle', 'downpour', 'storm', 'rainy', 'wet', 'falling', 'overlay', 'gloomy'], license: 'draft' },
  size: [64, 64],
  pivot: [32, 32],
  grounded: false,
  params: {
    pieces: range('Drops', 8, { min: 4, max: 12, step: 1, lo: 'Few', hi: 'Many' }),
    length: range('Length', 0.5, { lo: 'Short', hi: 'Long', when: { style: ['rain', 'storm'] } }),
    style: choice('Style', 'rain', ['drizzle', 'rain', 'storm']),
    layers: toggle('Far rain', true),
    body: color('Rain', P.sky, RAIN, { material: 'water' }),
    accent: color('Far rain', P.haze, FAR, { material: 'water', when: { layers: [true] } }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    loop: { frames: 8, fps: (p) => 10 * lerp(0.65, 1.45, p.speed), loop: true },
  },
  sounds: { loop: [{ sound: 'wind', frame: 0, preset: 'Storm', volume: 0.35, when: { style: ['storm'] } }] },
  versions: [
    { name: 'Rain', params: {} },
    { name: 'Drizzle', params: { style: 'drizzle', pieces: 6 } },
    { name: 'Storm', params: { style: 'storm', pieces: 12, length: 1 } },
    { name: 'Light shower', params: { pieces: 4, layers: false } },
    { name: 'Night rain', params: { body: P.steel, accent: P.slate } },
  ],

  render(g, { t, p }) {
    const s = STYLES[p.style];
    const near = Math.round(lerp(3, 9, p.length)) + s.extra;           // streaks 3 to 9 px, a storm's 2 px longer
    const far = Math.max(2, Math.round(near / 2));                      // far streaks half as long
    const common = { t, rows: s.rows, slant: s.slant };
    const head = tone(p.body, 0.6), tail = tone(p.body, -0.45);
    if (p.layers) {
      fallField(g, { ...common, cols: Math.ceil(p.pieces / 2), laps: farLaps(s.laps), seed: FAR_SEED, shift: [17, 23], colours: [p.accent],
        ...(s.shapes ? { shapes: s.shapes, size: 1 } : { shape: 'streak', size: far }) });
    }
    const nearField = { ...common, cols: p.pieces, laps: s.laps, seed: NEAR_SEED };
    if (s.shapes) {
      fallField(g, { ...nearField, colours: [p.body, p.body, tail, tail], shapes: s.shapes, size: 2 });
      // the leading drop: the anchor pixel of every near piece
      fallField(g, { ...nearField, colours: [head], shape: 'dot', size: 1 });
    } else {
      nearStreaks(g, { t, cols: p.pieces, rows: s.rows, laps: s.laps, slant: s.slant, mark: s.mark, long: near, short: Math.max(2, Math.round(near * 0.55)),
        body: p.body, dim: tone(p.body, -0.25), head, tail });
    }
  },
});
