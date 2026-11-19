// Word pop (core-sprites-3, batch K24): the words a game flashes at the player (READY, GO!, LEVEL UP, CLEAR, COMBO,
// BONUS, PERFECT, GAME OVER), dropping in letter by letter, bobbing while they show and breaking into sparkles.
//   idle   8 frames, loop: each letter bobs on its own phase, 1 to 2 px (Bounce)
//   pop    8 frames: 0 a white twinkle and four Sparkles pixels at the middle; 1 to 4 the letters appear left to
//          right, two a frame, each 3 px above the baseline and dropping onto it; 5 to 7 settled, a 2 px glint
//          running across them
//   leave  6 frames: the letters drop 1 to 4 px in turn and break into twinkles of Sparkles; the last frame keeps a
//          sparkle (5 px) per letter
// Letters are drawn on purpose (core-sprites-3, "What is different"): drawText of engine/pixel-font.js, in capitals,
// centred on the frame's middle column, the line's middle on the pivot row. The widest word, GAME OVER in the large
// chunky or rounded letters, is 71 px of letters and 77 px with its rim, inside the 94 px.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, wave, clamp } from '../engine/motion.js';
import { PALETTE } from '../engine/palettes.js';
import { FONT_STYLES, fontMetrics, textWidth, drawText } from '../engine/pixel-font.js';
import { textSweepIn, glyphSpots } from '../engine/text-fx.js';
import { twinkle } from '../engine/fx.js';

const P = PALETTE.thornwood, D = PALETTE.derelict;
const W = 96, MID = 16;
const WORDS = { ready: 'READY', go: 'GO!', 'level-up': 'LEVEL UP', clear: 'CLEAR', combo: 'COMBO', bonus: 'BONUS', perfect: 'PERFECT', 'game-over': 'GAME OVER' };
const WHITE = '#ffffff';

// The line for this look: its text, metrics, pen point and baseline, and each letter's spot.
function line(p) {
  const text = WORDS[p.word], m = fontMetrics(p.size, p.style), w = textWidth(text, m);
  const x = (W >> 1) - (w >> 1), base = MID + Math.ceil(m.cap / 2);
  return { text, m, w, x, base, spots: glyphSpots(text, m) };
}
const draw = (g, L, p, text, x, offsets) => drawText(g, text, x, L.base, {
  metrics: L.m, colour: p.body, outline: p.outline, edge: p.edge, shadow: p.shadow, offsets,
});
// rises per character (spaces included, as drawText counts them) from a rise per letter
const perChar = (L, rise) => { const o = new Array(L.text.length).fill(0); L.spots.forEach((s, j) => { o[s.index] = rise(j); }); return o; };

export default defineSprite({
  id: 'ui-word-pop',
  name: 'Word pop',
  kind: 'Item',
  blurb: 'Words a game flashes at the player (Ready, Go!, Level up, Clear, Combo, Bonus, Perfect, Game over) that drop in letter by letter, bob while they show and break into sparkles; change the word, letter style, size, outline, shadow, colours and motion.',
  meta: {
    type: 'ui', role: 'interface/icon', themes: ['neutral'], gameTypes: ['arcade', 'racing', 'puzzle', 'shooter'], view: 'none',
    words: ['ready', 'go', 'level up', 'clear', 'combo', 'bonus', 'perfect', 'game over', 'announcer', 'popup', 'title'],
    license: 'draft',
  },
  size: [W, 32],
  pivot: [48, 16],
  grounded: false,
  params: {
    word: choice('Word', 'ready', [
      { value: 'ready', label: 'Ready' }, { value: 'go', label: 'Go!' }, { value: 'level-up', label: 'Level up' },
      'clear', 'combo', 'bonus', 'perfect', { value: 'game-over', label: 'Game over' },
    ]),
    style: choice('Style', 'chunky', [...FONT_STYLES]),
    size: range('Size', 1, { lo: 'Small', hi: 'Big' }),
    outline: choice('Outline', 'rimmed', ['ink', 'rimmed']),
    shadow: toggle('Shadow', true),
    body: color('Letters', P.gold, [P.gold, P.cream, P.sky, P.goblin, P.skin, P.steel], { material: 'paint' }),
    edge: color('Rim', P.crimson, [P.crimson, P.cavern, P.hero, P.thorn, P.leaf, P.soil], { material: 'paint', when: { outline: ['rimmed'] } }),
    glow: color('Sparkles', P.magic, [P.magic, P.ember, D.xp, P.moss, P.water], { material: 'light' }),
    bounce: range('Bounce', 0.5, { lo: 'Calm', hi: 'Bouncy', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 8, fps: (p) => 8 * lerp(0.65, 1.45, p.speed), loop: true, label: 'Showing' },
    pop: { frames: 8, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false, label: 'Popping in' },
    leave: { frames: 6, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false, label: 'Leaving' },
  },
  sounds: {
    pop: [
      { sound: 'countdown-go', preset: 'Chiptune', frame: 1, volume: 0.7, when: { word: ['ready', 'go'] } },
      { sound: 'level-up', preset: 'Chiptune', frame: 1, volume: 0.7, when: { word: ['level-up'] } },
      { sound: 'quest-complete', preset: 'Chiptune', frame: 1, volume: 0.7, when: { word: ['clear', 'perfect'] } },
      { sound: 'xp-blip', preset: 'Combo high', frame: 1, volume: 0.7, when: { word: ['combo', 'bonus'] } },
      { sound: 'game-over', preset: 'Chiptune', frame: 1, volume: 0.7, when: { word: ['game-over'] } },
    ],
  },
  versions: [
    { name: 'Ready', params: {} },
    { name: 'Go!', params: { word: 'go', body: P.goblin, edge: P.leaf } },
    { name: 'Level up', params: { word: 'level-up', style: 'rounded', body: P.sky, edge: P.hero } },
    { name: 'Combo', params: { word: 'combo', style: 'slim', body: P.skin, edge: P.thorn, glow: P.ember } },
    { name: 'Game over', params: { word: 'game-over', style: 'serif', body: P.steel, edge: P.cavern, bounce: 0 } },
  ],

  render(g, { clip, frame, t, p }) {
    const L = line(p), n = L.spots.length;
    if (clip === 'idle') {
      // each letter on its own phase, 1 px (Calm) to 2 px (Bouncy) up from the baseline
      const A = lerp(1, 2, p.bounce);
      draw(g, L, p, L.text, L.x, perChar(L, (j) => Math.round(A * (0.5 + 0.5 * wave(t, j / Math.max(n, 1) + 0.25)))));
      return;
    }
    if (clip === 'pop') {
      if (frame === 0) {
        // a white twinkle where the word will stand, four sparkles round it
        const cx = W >> 1, cy = L.base - Math.ceil(L.m.cap / 2);
        twinkle(g, cx, cy, 2, WHITE);
        for (const [dx, dy] of [[-3, -2], [3, -2], [-3, 2], [3, 2]]) g.dot(cx + dx, cy + dy, p.glow);
        return;
      }
      if (frame <= 4) {
        // two letters a frame, each arriving 3 px up; the pair before drops to 1 px, the rest stand on the baseline
        const shown = Math.min(n, 2 * frame), last = L.spots[shown - 1];
        const rise = (j) => (j >= 2 * frame - 2 ? 3 : j >= 2 * frame - 4 ? 1 : 0);
        draw(g, L, p, L.text.slice(0, last.index + 1), L.x, perChar(L, rise).slice(0, last.index + 1));
        return;
      }
      // settled: a 2 px glint runs across the word, left to right, over frames 5 to 7
      draw(g, L, p, L.text, L.x);
      const at = Math.round(lerp(0, L.w + Math.ceil(L.m.cap / 2), (frame - 4.5) / 3)) - 1;
      g.fill(L.x - 1, 0, L.x + L.w + 1, 32, textSweepIn(L.text, L.m, L.x, L.base, at, { width: 2 }), WHITE);
      return;
    }
    // leave: letter j starts dropping at its turn, falls 1 to 4 px, then breaks into a twinkle of sparkles
    const life = (j) => clamp((t - (0.45 * j) / Math.max(n - 1, 1)) / 0.55, 0, 1);
    const gone = L.spots.filter((s, j) => life(j) >= 0.5).length;
    if (gone < n) {
      const first = L.spots[gone], drop = (j) => (life(j) > 0 ? -Math.round(lerp(1, 4, life(j) / 0.5)) : 0);
      draw(g, L, p, L.text.slice(first.index), L.x + first.x, perChar(L, drop).slice(first.index));
    }
    L.spots.forEach((s, j) => {
      const u = life(j);
      if (u < 0.5) return;
      // a twinkle that shrinks from 2 to 1, and a spark beside it while it is big
      const x = L.x + Math.floor(s.cx), y = L.base + Math.floor(s.cy) + 4, big = u < 0.8;
      twinkle(g, x, y, big ? 2 : 1, p.glow);
      if (big) g.dot(x + (j % 2 ? -3 : 3), y - 3, p.glow);
    });
  },
});
