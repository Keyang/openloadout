// FROZEN COPY, not a sprite: sprites/ui-hud-platformer.js as it was on 2026-11-20 (build item T1), before the migration redraws it as
// data (docs/data-sprites.md section 7). Kept only for the tests about the framework its code uses (tests/helpers/library.mjs
// codeSprite, codeSpriteSource); imports point at ../../../. Never edit it; the build never scans tests/.
// Platformer HUD (kit-platformer-fantasy, batch P13): the small marks along the top of the screen.
//   heart-full, heart-half, heart-empty   health: the heart of the heart pickup (heartIn, engine/shapes.js)
//                                         at glyph size; one outline for all three
//   coin, key, star, gem                  to stand beside their counts: the kit's coin, key, star charm and gem
//   key-empty, star-empty                 the same outline as a dark socket, for "not found yet"
//   heart-lose (4 frames)                 a heart jolts up, white, then cracks, drains and is empty: ends on heart-empty
//   heart-gain (4 frames)                 an empty heart fills from below, flashes white and is full: ends on
//                                         heart-full
// Every mark is at most 12x12 with its ink line (13x13 with the drop shadow) in the 16x16 frame, so marks
// sit on a 16 px grid, or closer: at a 13 px pitch their ink lines just touch. Full and empty differ by
// value (a bright body against a dark socket), not only by colour, so they still read under a one-colour look.
// The lit body, the socket and the fill level are the framework's (engine/slots.js); this file is the
// shapes, where each glint sits and the two heart clips.
import { defineSprite, range, choice, color, toggle } from '../../../engine/sprite.js';
import { lerp } from '../../../engine/motion.js';
import { ramp, INK } from '../../../engine/color.js';
import { Surface, ellipseIn } from '../../../engine/surface.js';
import { PALETTE, swatches } from '../../../engine/palettes.js';
import { stampGlyph } from '../../../engine/ui.js';
import { placedIn, heartIn } from '../../../engine/shapes.js';
import { slotFill, levelIn, socketTones } from '../../../engine/slots.js';
import { markIn } from '../../../engine/marks.js';
import { glyphPicture, drawGlyph } from '../../../engine/glyphs.js';
import { drawGem } from '../../../engine/pickups.js';

const P = PALETTE.thornwood;
const N = 16;
const ALL = [0, 0, N, N];
const HEARTS = ['classic', 'round', 'pixel'];

// The heart, 10 or 11 px wide: the same three shapes as the heart pickup, at the sizes where each keeps a clean
// notch and a one-pixel tip. Its middle column is column 8.
function heartShape(style) {
  if (style === 'pixel') return placedIn(heartIn(0, 0, 20, 16, 'pixel'), 8, 8, { sx: 0.5 });
  return style === 'round' ? heartIn(8.5, 8, 11, 10, 'round') : heartIn(8.5, 7.5, 11, 9, 'classic');
}
// The crack of a breaking heart: a zigzag from the notch to the tip.
const CRACK = [[7, 4], [7, 5], [8, 6], [9, 7], [8, 8], [7, 9], [8, 10], [8, 11]];

// A key standing on its tip, bow up and teeth to the right (engine/glyphs.js: one character is one pixel).
const KEY = glyphPicture([
  '.#oo*..',
  '#o..o*.',
  '#o..oo.',
  'x#..oo.',
  '.x#oo..',
  '..#o...',
  '..#o...',
  '..#ooo.',
  '..#o...',
  '..#ooo.',
  '..x#...',
]);
const KEY_AT = [5, 2];

// Where a heart is cut for a half (its left half stays lit) and the rows its level climbs between.
const HEART_LEVEL = { split: 9, top: 3, bottom: 13 };

/** A heart: `level` 1 full, 0 empty; 'half' keeps its left half; a number between fills it from the tip up. */
function heart(s, level, p, { glint = true } = {}) {
  slotFill(s, heartShape(p.shape), p.body, p.accent, { on: levelIn(level, HEART_LEVEL), shine: p.shine });
  // the gloss on the right lobe: a short white mark with a dot under it
  if (p.shine && glint && level !== 'half' && level >= 1) {
    const [gx, gy] = p.shape === 'pixel' ? [10, 5] : p.shape === 'round' ? [11, 4] : [11, 4];
    s.rect(gx, gy, 2, 1, '#ffffff'); s.dot(gx + 1, gy + 1, '#ffffff');
  }
}

function coin(s, p) {
  const M = ramp(p.metal);
  s.fill(...ALL, ellipseIn(8, 8, 5, 5), M, { shade: 1, light: p.shine ? 1 : 0 });
  s.fill(...ALL, ellipseIn(8, 8, 3, 3), M.light);                     // the raised middle
  s.rect(7, 7, 2, 2, M.dark);                                         // the square hole stamped in it
  if (p.shine) { s.dot(10, 4, '#ffffff'); s.dot(11, 5, '#ffffff'); s.dot(11, 6, '#ffffff'); }
}

function star(s, p, empty) {
  slotFill(s, markIn('star', 8, 8, 9), p.metal, p.accent, { on: levelIn(empty ? 0 : 1), shine: p.shine });
  if (!empty && p.shine) { s.dot(8, 5, '#ffffff'); s.dot(9, 6, '#ffffff'); s.dot(10, 7, '#ffffff'); }
}

function key(s, p, empty) {
  // an empty slot is the same key in the socket's colours: the accent colour, unlit
  drawGlyph(s, KEY, KEY_AT[0], KEY_AT[1], empty ? { main: socketTones(p.accent).mark, shine: false } : { main: p.metal, shine: p.shine });
}

const still = (label) => ({ frames: 1, fps: 1, loop: true, label });
const moving = (label) => ({ frames: 4, fps: (p) => 8 * lerp(0.65, 1.45, p.speed), loop: false, label });

export default defineSprite({
  id: 'ui-hud-platformer',
  name: 'Platformer HUD',
  kind: 'Item',
  blurb: 'Hearts (full, half, empty), a coin, a key, a star and a gem for the top of the screen, with a heart breaking and a heart filling; change the heart shape, shine, shadow and colours.',
  meta: {
    type: 'ui', role: 'interface/bar', themes: ['fantasy', 'neutral'], gameTypes: ['platformer', 'arcade', 'puzzle'], view: 'none',
    words: ['hud', 'heart', 'health', 'life', 'lives', 'coin', 'key', 'star', 'gem', 'counter', 'score', 'status', 'lose', 'gain'],
    license: 'draft',
  },
  size: [N, N],
  pivot: [8, 8],
  grounded: false,
  preview: 'heart-full',
  params: {
    shape: choice('Shape', 'classic', HEARTS),
    shine: toggle('Shine', true),
    shadow: toggle('Shadow', true),
    body: color('Hearts', P.crimson, [P.crimson, P.ember, P.thorn, P.magic, P.moss, P.hero]),
    accent: color('Empty', P.slate, [P.slate, P.stone, P.cavern, P.soil, P.haze]),
    metal: color('Coin, key and star', P.gold, swatches('thornwood', 'metal', { lead: 'gold' }).filter((c) => c !== P.slate)),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    'heart-full': still('Heart'), 'heart-half': still('Half heart'), 'heart-empty': still('Empty heart'),
    coin: still('Coin'), key: still('Key'), 'key-empty': still('No key'), star: still('Star'), 'star-empty': still('No star'), gem: still('Gem'),
    'heart-lose': moving('Lose a heart'), 'heart-gain': moving('Gain a heart'),
  },

  render(g, { clip, frame, p }) {
    const s = new Surface(N, N);
    let dy = 0, flash = false;
    if (clip === 'heart-full') heart(s, 1, p);
    else if (clip === 'heart-half') heart(s, 'half', p);
    else if (clip === 'heart-empty') heart(s, 0, p);
    else if (clip === 'coin') coin(s, p);
    else if (clip === 'key' || clip === 'key-empty') key(s, p, clip === 'key-empty');
    else if (clip === 'star' || clip === 'star-empty') star(s, p, clip === 'star-empty');
    else if (clip === 'gem') drawGem(s, 8, 8, 5, 5, P.magic, { cut: 'diamond', facets: true });
    else if (clip === 'heart-lose') {
      // 0 a white jolt upward, 1 cracked, 2 cracked and half drained, 3 empty
      if (frame === 0) { heart(s, 1, p, { glint: false }); flash = true; dy = -1; }
      else if (frame === 3) heart(s, 0, p);
      else {
        heart(s, frame === 1 ? 1 : 0.42, p, { glint: frame === 1 });
        const H = heartShape(p.shape);
        for (const [x, y] of CRACK) if (H(x + 0.5, y + 0.5)) s.dot(x, y, INK);
      }
    } else {
      // heart-gain: 0 empty, 1 filled half way from the tip, 2 full and white, 3 full
      if (frame === 0) heart(s, 0, p);
      else if (frame === 1) heart(s, 0.5, p, { glint: false });
      else if (frame === 2) { heart(s, 1, p, { glint: false }); flash = true; }
      else heart(s, 1, p);
    }
    if (flash) s.tint('#ffffff');
    const layer = dy ? new Surface(N, N).blit(s, 0, dy) : s;
    stampGlyph(g, layer, { shadow: p.shadow ? 1 : 0 });
  },
});
