// Wind gust (core-sprites-1, batch K08): an area loop of wind blowing to the right (a game mirrors it). Thin 1 px
// streaks of clearly different lengths slide across the patch and shorten, each on its own timer, one lane each, out
// of step, so the patch is filled. Each streak has a bright head stepping down to a darker tail (engine/fx-trails.js
// `taperLine`), so it reads as air moving, not as rain. With style "dust" specks are blown along beside the streaks,
// with "glints" small twinkles ride the heads (`twinkle`, kept apart). Light only: no ink. This file is the lanes,
// the lengths and the timing.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, hash, fract, PI } from '../engine/motion.js';
import { tone, mix } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { twinkle } from '../engine/fx.js';
import { taperLine } from '../engine/fx-trails.js';

const P = PALETTE.thornwood;
const CY = 32, LEFT = 3;                                 // the middle of the patch; where the streaks set off
// The specks ride along the streaks, so the two lists share no colour (stone left the streak list).
const STREAKS = [P.cream, P.haze, P.sky, P.magic, PALETTE.hearthvale.wheat];
const DUST = swatches('thornwood', 'ground', { lead: 'wood' });

export default defineSprite({
  id: 'wind-gust',
  name: 'Wind gust',
  kind: 'Effect',
  blurb: 'Wind blowing to the right: thin streaks of different lengths slide across and fade, with dust or glints carried along, as a patch to place over a field, a cliff or a road. Change how many streaks, their length and spread, what the wind carries and the colours.',
  meta: { type: 'effect', role: 'effects/weather', themes: ['neutral'], gameTypes: ['platformer', 'top-down-rpg', 'racing', 'farming-sim'], view: 'none',
    words: ['wind', 'gust', 'breeze', 'gale', 'air', 'blow', 'draft', 'dust storm', 'speed lines', 'weather'], license: 'draft' },
  size: [64, 64],
  pivot: [32, 32],
  grounded: false,
  params: {
    pieces: range('Streaks', 6, { min: 3, max: 10, step: 1, lo: 'Few', hi: 'Many' }),
    length: range('Length', 0.5, { lo: 'Short', hi: 'Long' }),
    spread: range('Spread', 0.5, { lo: 'Tight', hi: 'Wide' }),
    style: choice('Style', 'lines', ['lines', 'dust', 'glints']),
    core: color('Streaks', P.cream, STREAKS, { material: 'sky' }),
    accent: color('Dust', P.wood, DUST, { when: { style: ['dust'] } }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    loop: { frames: 8, fps: (p) => 10 * lerp(0.65, 1.45, p.speed), loop: true },
  },
  sounds: { loop: [{ sound: 'wind', preset: 'Breeze', frame: 0, volume: 0.35 }] },
  versions: [
    { name: 'Breeze', params: {} },
    { name: 'Gale', params: { pieces: 10, length: 1 } },
    { name: 'Dust storm', params: { style: 'dust', core: PALETTE.hearthvale.wheat, accent: P.soil } },
    { name: 'Sparkling air', params: { style: 'glints', core: P.magic } },
    { name: 'Light air', params: { pieces: 3, length: 0 } },
  ],

  render(g, { t, p }) {
    const C = [mix(p.core, '#ffffff', 0.6), p.core, p.core, mix(p.core, tone(p.core, -1), 0.6), tone(p.core, -1.2)];   // bright head, core, two darker steps to the tail
    const half = lerp(9, 25, p.spread);                                // how far the outer streaks sit from the middle
    const length = lerp(8, 26, p.length);
    const D = [tone(p.accent, 0.5), p.accent];
    const glints = [];                                                 // where glints sit this frame, to keep them apart
    // one lane per streak, spread over the height in an order that is not top to bottom, each on its own timer
    // and starting a little further in or out, so the gust never lines up into a staircase
    for (let i = 0; i < p.pieces; i++) {
      const lane = ((i * 0.618034 + 0.31) % 1) * 2 - 1, y = Math.round(CY + lane * half);
      const life = fract(t + (i + 0.4 * hash(i, 73)) / p.pieces);
      // every third streak is a long one, the rest short, so the lengths clearly differ
      const full = length * (i % 3 === 0 ? 1.15 + 0.15 * hash(i, 72) : 0.45 + 0.4 * hash(i, 72));
      const len = Math.max(3, Math.round(full * (1 - 0.35 * life)));
      const x0 = LEFT + len + Math.round(6 * hash(i, 71));
      const hx = Math.round(x0 + (61 - x0) * life);                    // the head slides to the right edge and shortens
      taperLine(g, hx, y, PI / 2, len, life > 0.75 ? C.slice(1) : C);

      if (p.style === 'dust') {
        // specks blown along beside the streak: a 2 px clump and a single speck, a row above or below it
        const side = hash(i, 74) < 0.5 ? -1 : 1;
        const ax = hx - Math.round(len * fract(0.25 + hash(i, 75) + 0.5 * life)), bx = hx - Math.round(len * fract(0.6 + hash(i, 76) + 0.5 * life));
        twinkle(g, ax, y + side, 0, D[0]); twinkle(g, ax + 1, y + side, 0, D[0]);
        twinkle(g, bx, y - side, 0, D[1]);
      } else if (p.style === 'glints' && i % 2 === 0) {
        // a twinkle riding the head, flaring up once on its own timer; never touching another glint
        const k = fract(t + hash(i, 77)), size = k < 0.12 ? 0 : k < 0.24 ? 1 : k < 0.36 ? 2 : k < 0.48 ? 1 : k < 0.6 ? 0 : -1;
        if (size < 0) continue;
        if (glints.some((o) => Math.max(Math.abs(o.x - hx), Math.abs(o.y - y)) < o.size + size + 4)) continue;
        glints.push({ x: hx, y, size });
        twinkle(g, hx, y, size, C[0], { core: '#ffffff' });
      }
    }
  },
});
