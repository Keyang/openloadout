// FROZEN COPY, not a sprite: sprites/ui-hud-roguelite.js as it was on 2026-11-20 (build item T1), before the migration redraws it as
// data (docs/data-sprites.md section 7). Kept only for the tests about the framework its code uses (tests/helpers/library.mjs
// codeSprite, codeSpriteSource); imports point at ../../../. Never edit it; the build never scans tests/.
// Roguelite HUD (kit-roguelite-scifi, batch S20): the small marks along the top of the screen.
//   hp-full, hp-half, hp-empty        health pips: a cream plus on the body colour; one outline for all three
//   shield-full, shield-empty         shield pips: the same outline with a hollow middle (a ring of energy)
//   credit, key                       a six-sided credit chip and a keycard, to stand beside their counts
//   room, room-current, room-boss, room-shop, room-unknown    squares for the floor map: walls round a
//                                     floor; the current room is lit, the boss room is red with a skull,
//                                     the shop holds a credit chip, an unknown room is dark with a question mark
// Every mark is 12x12 with its ink line (the keycard, an upright card, 10x12), centred in the 16x16
// frame, so pips and rooms sit on a 16 px grid (or closer: at a 13 px pitch their ink lines just touch). Health and shield differ by shape,
// not only by colour: a plus against a ring, which still reads under a one-colour look.
// `Bold` gives every mark a heavier ink line and a 1 px drop shadow (down and to the left), for
// screens where the HUD lies over the game.
import { defineSprite, choice, color, toggle } from '../../../engine/sprite.js';
import { ramp, mix, INK } from '../../../engine/color.js';
import { Surface, rectIn } from '../../../engine/surface.js';
import { PALETTE, swatches } from '../../../engine/palettes.js';
import { cutRectIn, stampGlyph } from '../../../engine/ui.js';
import { insetIn, crossIn, hexIn, ringIn, allIn, notIn } from '../../../engine/shapes.js';
import { drawMark } from '../../../engine/marks.js';

const P = PALETTE.derelict;
const N = 16, C = 8;                                 // the frame, and its centre point
const ALL = [0, 0, N, N];

// The outline of a pip, 10x10 before its ink line.
const PIPS = {
  block: () => cutRectIn(3, 3, 10, 10, [3, 1, 3, 1]),
  diamond: () => (px, py) => Math.abs(px - C) + Math.abs(py - C) < 5.25,
  cell: () => { const can = cutRectIn(3, 5, 10, 8, 1), nub = rectIn(6, 3, 4, 2); return (px, py) => can(px, py) || nub(px, py); },
};
// Where the glint goes on each pip: four pixels by the top right edge.
const GLINT = { block: [[9, 4], [10, 4], [11, 5], [11, 6]], diamond: [[8, 4], [9, 5], [10, 6], [10, 7]], cell: [[9, 6], [10, 6], [11, 7], [11, 8]] };

const dark = (c) => mix(INK, c, 0.3);                // the unlit inside of an empty pip, an unknown room
const dim = (c) => mix(INK, c, 0.62);                // a mark that is there but switched off

/** A pip: `kind` hp or shield, `level` full, half or empty. The lit part takes the colour, the rest is a socket in the accent colour. */
function pip(s, kind, level, p) {
  const outer = PIPS[p.shape](), inner = insetIn(outer, 1);
  // half a pip: a block and a diamond keep their left half, a cell its lower half
  const on = level === 'full' ? () => true : level === 'empty' ? () => false : p.shape === 'cell' ? (px, py) => py > C : (px) => px < C;
  const colour = kind === 'hp' ? p.body : p.glow, off = notIn(on);
  s.fill(...ALL, allIn(outer, on), ramp(colour), { shade: 1, light: 1 });
  s.fill(...ALL, allIn(outer, off), p.accent);
  s.fill(...ALL, allIn(inner, off), dark(p.accent));
  if (kind === 'hp') {
    const plus = allIn(crossIn(C, C, 6, 2), inner);
    s.fill(...ALL, allIn(plus, on), P.cream);
    s.fill(...ALL, allIn(plus, off), dim(p.accent));
  } else {
    const hole = insetIn(outer, 3), ring = allIn(insetIn(outer, 2), notIn(hole));
    s.fill(...ALL, allIn(hole, on), dark(colour));
    s.fill(...ALL, allIn(ring, off), dim(p.accent));
  }
  if (p.shine) for (const [x, y] of GLINT[p.shape]) if (inner(x + 0.5, y + 0.5) && on(x + 0.5, y + 0.5)) s.dot(x, y, '#ffffff');
}

/** A credit chip: six sides, and on the big one a ring stamped round its flat middle. `r` is half its width (5 for the HUD mark, 3 inside a shop). */
function chip(s, r, p) {
  const hex = hexIn(C, C, 2 * r, r >= 5 ? 2 * r : 2 * r + 2), M = ramp(p.metal);
  s.fill(...ALL, hex, M, { shade: 1, light: 1 });
  if (r >= 5) {
    // one closed loop, 4 px across: a flat rim 2 px wide stays between it and the shadow down the left and along the bottom
    s.fill(...ALL, ringIn(C, C, 2, 1), M.dark);
    if (p.shine) for (const [x, y] of [[9, 4], [10, 5], [11, 6], [11, 7]]) s.dot(x, y, '#ffffff');
  }
}

/** A keycard: an upright pass with one corner cut, a slot to hang it by, a dark stripe and a small light. */
function card(s, p) {
  const body = cutRectIn(4, 3, 8, 10, [0, 3, 0, 0]), M = ramp(p.metal);
  s.fill(...ALL, body, M, { shade: 1, light: 1 });
  s.rect(6, 4, 3, 1, dark(p.metal));                 // the slot
  s.rect(4, 7, 8, 2, dim(p.metal));                  // the stripe
  s.rect(6, 10, 2, 2, P.cyan);                       // the light
  if (p.shine) for (const [x, y] of [[9, 5], [10, 6], [9, 7], [10, 7]]) s.dot(x, y, '#ffffff');   // a gleam down the corner and across the stripe
}

/** A room of the floor map: walls round a floor, and what the room holds. */
function room(s, what, p) {
  const outer = cutRectIn(3, 3, 10, 10, 1), floor = rectIn(4, 4, 8, 8);
  // walls one tone lighter than the floor they stand round: a known room is light, an unknown one dark
  const tones = what === 'current' ? ramp(p.glow) : what === 'boss' ? ramp(P.red) : ramp(p.accent);
  const [wall, ground] = what === 'boss' ? [tones.base, tones.deep] : what === 'unknown' ? [tones.base, dark(p.accent)] : what === 'shop' ? [tones.light, tones.dark] : [tones.light, tones.base];
  s.fill(...ALL, outer, wall);
  s.fill(...ALL, floor, ground);
  if (what === 'current') {
    s.rect(C - 1, C - 1, 2, 2, P.cream);             // you are here
    if (p.shine) for (const [x, y] of [[9, 4], [10, 4], [11, 5], [11, 6]]) s.dot(x, y, '#ffffff');
  }
  if (what === 'boss') drawMark(s, 'skull', C, C - 1, 7, P.cream);
  if (what === 'shop') chip(s, 3, p);
  if (what === 'plain') s.rect(4, 4, 8, 1, tones.dark);            // the far wall's shadow on the floor
  if (what === 'unknown') drawMark(s, 'question', C, C - 1, 7, tones.light);
}

const CLIPS = {
  'hp-full': 'Health', 'hp-half': 'Half health', 'hp-empty': 'No health', 'shield-full': 'Shield', 'shield-empty': 'No shield',
  credit: 'Credit', key: 'Key', room: 'Room', 'room-current': 'Current room', 'room-boss': 'Boss room', 'room-shop': 'Shop', 'room-unknown': 'Unknown room',
};

export default defineSprite({
  id: 'ui-hud-roguelite',
  name: 'Roguelite HUD',
  kind: 'Item',
  blurb: 'Health and shield pips, a credit, a key and floor-map rooms (current, boss, shop, unknown) for the top of the screen; change the pip shape, weight, shine and colours.',
  meta: {
    type: 'ui', role: 'interface/bar', themes: ['sci-fi', 'neutral'], gameTypes: ['roguelike-action', 'shooter', 'arcade'], view: 'none',
    words: ['hud', 'health', 'pip', 'shield', 'credit', 'money', 'key', 'keycard', 'minimap', 'map', 'room', 'boss', 'shop', 'status'],
    license: 'draft',
  },
  size: [N, N],
  pivot: [C, C],
  grounded: false,
  preview: 'hp-full',
  params: {
    shape: choice('Shape', 'block', ['block', 'diamond', 'cell']),
    bold: toggle('Bold', true),
    shine: toggle('Shine', true),
    body: color('Health', P.heal, [P.heal, P.acid, P.red, P.amber, P.teal, P.flesh]),
    glow: color('Shield', P.shield, [P.shield, P.cyan, P.signal, P.xp, P.teal, P.steel]),
    accent: color('Empty', P.hull, [P.hull, P.panel, P.deck, P.membrane, P.nebula]),
    metal: color('Credits and keys', P.gold, swatches('derelict', 'metal', { lead: 'gold' })),
  },
  clips: Object.fromEntries(Object.entries(CLIPS).map(([name, label]) => [name, { frames: 1, fps: 1, loop: true, label }])),

  render(g, { clip, p }) {
    const s = new Surface(N, N);
    if (clip.startsWith('hp-')) pip(s, 'hp', clip.slice(3), p);
    else if (clip.startsWith('shield-')) pip(s, 'shield', clip.slice(7), p);
    else if (clip === 'credit') chip(s, 5, p);
    else if (clip === 'key') card(s, p);
    else room(s, clip === 'room' ? 'plain' : clip.slice(5), p);
    // bold: a heavier ink line, and the whole mark again in ink 1 px down and to the left, under it
    stampGlyph(g, s, { heavy: p.bold, shadow: p.bold ? 1 : 0 });
  },
});
