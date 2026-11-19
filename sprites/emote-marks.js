// Emote marks (core-sprites-3, batch K24, the pathfinder for emotes): a rimmed mark that pops up over a character's
// head and keeps moving while it shows: surprise, a question, love, anger, nerves, sleep, a tune, delight, dizziness.
//   idle  8 frames, loop: the mark's own motion (emoteBody of engine/emotes.js: the ! shakes, the heart beats, ...)
//   pop   6 frames: emotePop: a 3x3 dot, the mark small, too big and 1 px high, settling; the last frame is idle's first
// Pivot [16, 30]: the bottom middle, the point above the head the mark stands on. The mark's body rests 4 rows above
// it (rim, ink and the drop shadow below it, and one more row for the pop's 1 px dip), so no frame reaches row 31.
// Letters are drawn on purpose: the sleep mark's Zs are the pixel font's (core-sprites-3, "What is different").
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp } from '../engine/motion.js';
import { INK } from '../engine/color.js';
import { PALETTE } from '../engine/palettes.js';
import { drawEmote, emotePop } from '../engine/emotes.js';

const P = PALETTE.thornwood;
const CX = 16, BY = 26;                                  // the mark's centre column and its body's bottom row at rest
const STROKED = ['exclaim', 'question', 'anger', 'sleep', 'music', 'spark', 'swirl'];

const markSize = (p) => Math.round(lerp(12, 20, p.size));
const mark = (g, p, size, dy, t) => drawEmote(g, p.emote, CX, BY + dy, size, {
  t, bounce: p.bounce, bold: p.bold, colour: p.body, edge: p.edge, rim: true, shadow: p.shadow,
});

export default defineSprite({
  id: 'emote-marks',
  name: 'Emote marks',
  kind: 'Item',
  blurb: 'Nine rimmed reaction marks that pop up over a character\'s head and keep moving while they show (surprise, question, love, anger, nerves, sleep, a tune, delight, dizziness); change the mark, its size, boldness, shadow, colours and motion.',
  meta: {
    type: 'ui', role: 'interface/icon', themes: ['neutral'], gameTypes: ['arcade', 'top-down-rpg', 'farming-sim', 'turn-based-rpg'], view: 'none',
    words: ['emote', 'exclamation', 'question', 'heart', 'angry', 'sweat', 'sleep', 'music', 'delight', 'dizzy', 'reaction'],
    license: 'draft',
  },
  size: [32, 32],
  pivot: [16, 30],
  grounded: false,
  params: {
    emote: choice('Emote', 'exclaim', [
      { value: 'exclaim', label: 'Exclamation' }, { value: 'question', label: 'Question' }, 'heart', 'anger', 'sweat', 'sleep', 'music',
      { value: 'spark', label: 'Delight' }, { value: 'swirl', label: 'Dizzy' },
    ]),
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    bold: toggle('Bold', false, { when: { emote: STROKED } }),
    shadow: toggle('Shadow', true),
    body: color('Mark', P.ember, [P.ember, P.crimson, P.hero, P.thorn, P.leaf, P.water], { material: 'paint' }),
    edge: color('Rim', P.cream, [P.cream, P.skin, P.steel, P.gold]),
    bounce: range('Bounce', 0.5, { lo: 'Calm', hi: 'Bouncy', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 8, fps: (p) => 8 * lerp(0.65, 1.45, p.speed), loop: true, label: 'Showing' },
    pop: { frames: 6, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false, label: 'Popping up' },
  },
  sounds: {
    pop: [{ sound: 'notify-ping', preset: 'Storybook', frame: 1, volume: 0.5 }],
  },
  versions: [
    { name: 'Surprise', params: {} },
    { name: 'Question', params: { emote: 'question', body: P.hero } },
    { name: 'Love', params: { emote: 'heart', size: 1, body: P.crimson } },
    { name: 'Sleepy', params: { emote: 'sleep', body: P.hero, edge: P.steel } },
    { name: 'Delight', params: { emote: 'spark', body: P.leaf } },
    { name: 'Humming', params: { emote: 'music', body: P.thorn, bold: true } },
  ],

  render(g, { clip, frame, t, p }) {
    const size = markSize(p);
    if (clip === 'idle') { mark(g, p, size, 0, t); return; }
    const pop = emotePop(frame, 6);
    if (pop.dot) {
      // what the mark grows from: a 3x3 dot of the mark's colour, inked, where its foot will stand
      g.rect(CX - 1, BY - 2, 3, 3, p.body, { outline: INK });
      return;
    }
    mark(g, p, Math.round(size * pop.size), pop.dy, 0);
  },
});
