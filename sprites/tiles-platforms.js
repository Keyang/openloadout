// Wooden platforms and ladders: one-way platforms and things to climb, for a side-view level.
// A tileset with no block: nothing here is solid ground, so nothing uses the helper's material.
// What it does take from the helper is the names (thinClips) and the habits that make pieces join:
// every piece is drawn on a spare Surface and outlined once, so a shape that runs off the edge of
// the tile gets no outline there and carries on into the next tile; and everything that repeats
// (board joints, rungs, the vine's sway) is a whole number of steps in 32 px.
//
//   plank-thin-l  -thin-m  -thin-r   the platform, in the top of the tile; -thin-m repeats sideways;
//                                    each end piece has a small bracket tucked under it
//   ladder-cap  -mid  -foot          a rope ladder, 16 px wide, centred; -mid repeats up and down
//   vine-cap    -mid  -foot          a hanging vine, 16 px wide, centred; -cap hangs from whatever is above
//   post-cap    -mid                 a support post; -mid repeats up and down. Put -cap in the same cell as a
//                                    platform piece, behind it: its braces reach up to the platform's underside
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { Surface } from '../engine/surface.js';
import { ramp, mix, INK } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { thinClips } from '../engine/tiles.js';

const P = PALETTE.thornwood;
const piece = (label) => ({ frames: 1, fps: 1, loop: true, label });

// ---- the platform -------------------------------------------------------------------------
// Rows 0 and thickness - 1 are the outline; the wood is drawn on the rows between.
function platform(s, part, p) {
  const wood = ramp(p.wood), rope = ramp(p.rope);
  const shade = mix(p.wood, wood.dark, 0.5);                   // wood in the shade of what is above it
  const th = Math.round(p.thickness), last = th - 2;
  const L = part === 'l', R = part === 'r';
  const x0 = L ? 1 : 0, x1 = R ? 30 : 31;
  const span = (a, b, y, h, c) => { if (b >= a && h > 0) s.rect(a, y, b - a + 1, h, c); };

  if (p.style === 'planks') {
    // a deck of short boards laid across a beam; the deck overhangs the beam at each end
    span(x0, x1, 1, 3, wood.base);
    span(x0, x1, 1, 1, wood.light);
    for (let x = 7; x < 32; x += 8) if (x > x0 && x < x1) s.rect(x, 1, 1, 3, wood.dark);          // the joints between boards
    const b0 = L ? 4 : 0, b1 = R ? 27 : 31;
    span(b0, b1, 4, last - 3, shade);
    span(b0, b1, 4, 1, wood.dark);                                                             // the deck's shadow on the beam
    if (last >= 7) { span(Math.max(b0, 9), 14, last - 1, 1, wood.dark); span(21, Math.min(b1, 26), last - 2, 1, wood.dark); }
  } else if (p.style === 'logs') {
    // two logs, one on the other, lashed together; the lower one is shorter and both have round ends
    const mid = Math.floor(last / 2);
    const t0 = x0, t1 = x1, u0 = L ? 3 : 0, u1 = R ? 28 : 31;
    span(t0, t1, 1, mid, wood.base); span(t0, t1, 1, 1, wood.light); span(t0, t1, mid, 1, wood.dark);
    span(u0, u1, mid + 1, last - mid, wood.base); span(u0, u1, last, 1, wood.dark);
    if (L) { s.data[1 * 32 + t0] = 0; s.data[mid * 32 + t0] = 0; s.data[last * 32 + u0] = 0; s.rect(t0 + 1, 2, 1, Math.max(1, mid - 2), wood.light); }
    if (R) { s.data[1 * 32 + t1] = 0; s.data[mid * 32 + t1] = 0; s.data[last * 32 + u1] = 0; s.rect(t1 - 1, 2, 1, Math.max(1, mid - 2), wood.light); }
    for (const x of [6, 22]) { s.rect(x, 1, 2, last, rope.base); s.rect(x, 1, 1, last, rope.dark); }   // the lashings, every 16 px
    span(11, 15, 2, 1, wood.dark); span(26, 29, mid + 2 <= last - 1 ? mid + 2 : mid + 1, 1, wood.dark);     // bark
  } else {
    // one thick slab, its ends cut back underneath
    const cut = Math.min(4, last - 3);
    for (let x = x0; x <= x1; x++) {
      const back = Math.max(0, cut - (L ? x - x0 : R ? x1 - x : 99));
      s.rect(x, 1, 1, last - back, wood.base);
      s.dot(x, 1, wood.light);
      s.dot(x, last - back, wood.dark);
      if (last - back - 1 > 2 && last > 7) s.dot(x, last - back - 1, shade);
    }
    span(Math.max(x0 + 4, 5), 12, 3, 1, wood.dark); span(17, Math.min(x1 - 4, 27), Math.min(5, last - 2), 1, wood.dark);   // the grain
  }

  // wear: nicks in the top edge and chips out of the underside, never within 3 px of the tile's ends
  // (so the middle piece still repeats) and clear of the joints, lashings and grain above
  [[18, 'nick'], [16, 'chip'], [28, 'nick'], [25, 'chip'], [4, 'nick']].slice(0, Math.round(p.wear * 5)).forEach(([x, kind]) => {
    if (kind === 'nick') { s.rect(x, 1, 1, 2, wood.dark); s.dot(x + 1, 1, wood.base); }
    else { s.data[last * 32 + x] = 0; s.data[last * 32 + x + 1] = 0; if (last > 7) s.data[(last - 1) * 32 + x] = 0; }
  });

  // the bracket under an end piece: a short wedge tucked under the end of the deck, part of the platform's own
  // outline (the long braces belong to the post: see post below)
  if (L || R) for (let i = 0; i < 3; i++) span(L ? 3 : 22 + 2 * i, L ? 9 - 2 * i : 28, th - 1 + i, 1, i === 2 ? wood.dark : shade);
}

// ---- the rope ladder: two ropes, wooden rungs --------------------------------------------------
function ladder(s, part, p) {
  const wood = ramp(p.wood), rope = ramp(p.rope);
  const pitch = p.rungs === 'close' ? 8 : 16;
  const y0 = part === 'cap' ? 2 : 0, y1 = part === 'foot' ? 30 : 31;
  const rung = (y, crack) => {
    s.rect(9, y, 14, 2, wood.base); s.rect(9, y, 14, 1, wood.light);
    if (crack) { s.rect(crack, y, 1, 2, wood.dark); s.dot(crack + 1, y + 1, wood.dark); }
  };
  let n = 0;
  for (let y = pitch / 2 - 1; y < 32; y += pitch, n++) {
    if (part === 'cap' && y < 9) continue;                     // the top bar is there instead
    if (part === 'foot' && y > 22) continue;                   // and the bottom bar here
    rung(y, p.wear > 0.35 && n % 2 === 0 ? 13 + n : p.wear > 0.75 ? 17 : 0);
  }
  if (part === 'cap') { s.rect(9, 2, 14, 3, wood.base); s.rect(9, 2, 14, 1, wood.light); s.rect(9, 4, 14, 1, wood.dark); }   // the bar it hangs from
  if (part === 'foot') rung(27, 0);
  // the ropes run in front of the rungs; a darker pixel every fourth row is the twist
  for (const x of [9, 21]) for (let y = y0; y <= y1; y++) { s.dot(x, y, rope.dark); s.dot(x + 1, y, y % 4 === 1 ? rope.dark : rope.base); }
}

// ---- the vine: a stem that sways once per tile, a leaf every 8 px on alternate sides -----------------
const sway = (y) => 15 + Math.round(2.4 * Math.sin((Math.PI * 2 * y) / 32));
function vine(s, part, p) {
  const leaf = ramp(p.leaf);
  const end = part === 'foot' ? 21 : 31;
  const blade = (y, side, big) => {                            // a small leaf pointing out and down
    const x = side < 0 ? sway(y) - 1 : sway(y) + 2, d = side;
    s.rect(Math.min(x, x + d), y, 2, 1, leaf.light);
    s.rect(Math.min(x, x + 2 * d), y + 1, 3, 1, leaf.base);
    s.rect(Math.min(x + d, x + 2 * d), y + 2, 2, 1, leaf.dark);
    if (big) s.dot(x + 2 * d, y, leaf.base);
  };
  for (let y = 0; y <= end; y++) { s.dot(sway(y), y, leaf.dark); s.dot(sway(y) + 1, y, leaf.base); }
  [3, 11, 19, 27].forEach((y, i) => { if (y + 2 < end) blade(y, i % 2 ? 1 : -1, part === 'cap' && i === 0); });
  if (part === 'cap') { blade(1, 1, true); s.rect(sway(0) - 1, 0, 4, 2, leaf.dark); s.rect(sway(0), 0, 2, 1, leaf.base); }   // where it is rooted above
  if (part === 'foot') {                                       // the tip thins, curls and ends in a bud
    const x = sway(end) + 1;
    s.dot(x, 22, leaf.dark); s.dot(x + 1, 23, leaf.dark); s.dot(x + 1, 24, leaf.base); s.dot(x, 25, leaf.base);
    s.rect(x - 2, 25, 2, 2, leaf.light); s.dot(x - 2, 27, leaf.base);
  }
}

// ---- the post -----------------------------------------------------------------------------
// post-cap goes in the same cell as a platform piece, behind it: its head is hidden by the deck and its two
// braces spring from the post to the underside of the platform, wherever under the platform the post stands.
function post(s, part, p) {
  const wood = ramp(p.wood), shade = mix(p.wood, wood.dark, 0.5);
  const th = Math.round(p.thickness);
  const y0 = part === 'cap' ? 3 : 0;
  if (part === 'cap') { s.limb(8, th - 1, 13, th + 5, 2, shade); s.limb(24, th - 1, 19, th + 5, 2, shade); }   // the braces
  s.rect(13, y0, 6, 32 - y0, wood.base);
  s.rect(13, y0, 1, 32 - y0, wood.dark);                       // the side away from the light
  s.rect(18, y0, 1, 32 - y0, wood.light);
  s.rect(15, 6, 1, 5, wood.dark); s.rect(16, 19, 1, 6, wood.dark);                              // the grain
  if (p.wear > 0.3) s.rect(14, 12, 1, 4, wood.dark);
  if (p.wear > 0.65) { s.rect(17, 26, 1, 4, wood.dark); s.dot(16, 27, wood.dark); }
  if (part === 'cap') { s.rect(12, 3, 8, 3, wood.base); s.rect(12, 3, 8, 1, wood.light); s.rect(12, 5, 8, 1, wood.dark); }   // a head, a little wider than the post
}

const DRAW = { plank: platform, ladder, vine, post };

export default defineSprite({
  id: 'tiles-platforms',
  name: 'Wooden platforms and ladders',
  kind: 'Item',
  blurb: 'One-way wooden platforms with a rope ladder, a vine and a support post; change the kind of platform, its thickness, the rungs, the wear and the colours.',
  meta: {
    type: 'tileset',
    role: 'world/platform',
    themes: ['fantasy', 'forest'],
    gameTypes: ['platformer'],
    view: 'side',
    words: ['platform', 'plank', 'ladder', 'vine', 'rope', 'post', 'bridge', 'scaffold', 'climb', 'jump', 'wooden', 'ledge'],
    license: 'draft',
  },
  size: [32, 32],
  pivot: [16, 16],
  grounded: false,
  preview: 'plank-thin-l',
  params: {
    style: choice('Style', 'planks', ['planks', 'logs', 'slab']),
    thickness: range('Thickness', 11, { min: 8, max: 14, step: 1, lo: 'Thin', hi: 'Chunky' }),
    rungs: choice('Rungs', 'wide', [{ value: 'wide', label: 'Wide apart' }, { value: 'close', label: 'Close together' }]),
    wear: range('Wear', 0.3, { lo: 'New', hi: 'Worn' }),
    wood: color('Wood', P.wood, swatches('thornwood', 'wood')),
    rope: color('Rope', P.cream, [P.cream, P.gold, P.stone, P.moss, P.crimson, '#c98a4a']),
    leaf: color('Leaf', P.leaf, swatches('thornwood', 'leaf')),
  },
  clips: {
    ...thinClips('plank', { label: 'Platform' }),
    'ladder-cap': piece('Ladder: top end'), 'ladder-mid': piece('Ladder: middle'), 'ladder-foot': piece('Ladder: bottom end'),
    'vine-cap': piece('Vine: top end'), 'vine-mid': piece('Vine: middle'), 'vine-foot': piece('Vine: bottom end'),
    'post-cap': piece('Post: top end'), 'post-mid': piece('Post: middle'),
  },
  render(g, { clip, p }) {
    const [thing, ...rest] = clip.split('-');
    const s = new Surface(32, 32);
    DRAW[thing](s, rest[rest.length - 1], p);
    s.outline(INK);                                            // one outline round the whole piece; none where it leaves the tile
    g.blit(s);
  },
});
