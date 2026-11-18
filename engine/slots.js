// Slots (added with batch P13: the platformer HUD): marks that are full, part full or empty.
// A heart, a pip, a star or a key on a HUD is one outline drawn in two ways: a lit body where it is
// "on", and where it is not, a dark socket rimmed with a duller colour. Full and empty then share one
// outline, and they differ by value (bright against dark), so they still read under a one-colour look.
// Pure drawing on a Surface: runs in Node and in the browser. It fills pixels through shape tests, as
// Surface.fill does, so it suits pixel-grid styles only.
//
//   import { slotFill, levelIn, socketTones } from '../engine/slots.js';
//   import { heartIn } from '../engine/shapes.js';
//
//   const H = heartIn(8.5, 7.5, 11, 9);
//   slotFill(s, H, p.body, p.accent);                                               // a full heart
//   slotFill(s, H, p.body, p.accent, { on: levelIn(0) });                           // the empty socket
//   slotFill(s, H, p.body, p.accent, { on: levelIn('half', { split: 9 }) });        // its left half lit
//   slotFill(s, H, p.body, p.accent, { on: levelIn(0.4, { top: 3, bottom: 13 }) }); // filled 40% of the way up
//   drawGlyph(s, KEY, 5, 2, { main: socketTones(p.accent).mark, shine: false });    // a key that is not found yet
//   stampGlyph(g, s);                                                               // engine/ui.js: the ink line round it

import { ramp, mix, INK } from './color.js';
import { lerp } from './motion.js';
import { insetIn, allIn, notIn } from './shapes.js';

/**
 * The colours of an empty slot, from the one colour a sprite offers for it: { rim (the colour itself, a line just inside the outline), inside (the unlit middle, far darker), mark (a thing drawn in a slot that is there but switched off: between the two) }.
 * Arguments: colour (the "empty" colour); options { ink (the outline colour the tones are mixed towards, default INK) }.
 */
export function socketTones(colour, { ink = INK } = {}) {
  return { rim: colour, inside: mix(ink, colour, 0.3), mark: mix(ink, colour, 0.62) };
}

/**
 * Returns the test "is this pixel lit?" for a mark at a fill level: lit(px, py) is true everywhere for a full mark, nowhere for an empty one, on one half for a half, and below a line that climbs from `bottom` to `top` for a number between 0 and 1 (a heart or a flask filling up).
 * Arguments: level ('full' or a number of 1 or more; 'empty' or a number of 0 or less; 'half'; or a number between: the share of the way up); options { top, bottom (the rows the level line runs between, as pixel coordinates; default 0 and 16), split (the column or row a half is cut at, default 8), half ('left': the left half is lit, the default; 'lower': the lower half) }.
 */
export function levelIn(level, { top = 0, bottom = 16, split = 8, half = 'left' } = {}) {
  if (level === 'half') return half === 'lower' ? (px, py) => py > split : (px) => px < split;
  if (level === 'full' || level >= 1) return () => true;
  if (level === 'empty' || !(level > 0)) return () => false;
  const line = lerp(bottom, top, level);
  return (px, py) => py > line;
}

/**
 * Paints a mark that can be full, part full or empty: where `on` holds, a body in the lit colour (three tones, with a highlight band while `shine` is on); where it does not, a dark socket with a rim of the socket colour just inside the edge. It draws no outline, so full and empty keep one outline: finish with stampGlyph or g.outline.
 * Arguments: g (the Surface); shape (a shape test: the whole mark); colour (the lit body); socket (the "empty" colour: socketTones gives its tones); options { on (a test lit(px, py), for example from levelIn; default: lit everywhere), shine (false: no highlight band on the body; default true), box ([x0, y0, x1, y1] to fill within; default the whole Surface) }.
 */
export function slotFill(g, shape, colour, socket, { on = () => true, shine = true, box } = {}) {
  const B = box ?? [0, 0, g.w, g.h], off = notIn(on), T = socketTones(socket);
  g.fill(...B, allIn(shape, on), ramp(colour), { shade: 1, light: shine ? 1 : 0 });
  g.fill(...B, allIn(shape, off), T.rim);
  g.fill(...B, allIn(insetIn(shape, 1), off), T.inside);
  return g;
}
