// Ground colours (added with batch R10, fix round 1: the Hearthvale shore). Rules for turning the one colour a
// person picks for a kind of ground (a path, a sandy bank, a beach, a floor) into the colour it is drawn in, so
// that two tilesets that share a control draw the same ground. Pure functions: Node and browser.
// Worked examples: sprites/tiles-shore.js (the bank), sprites/tiles-meadow.js (the path, which wrote the rule first).
//
//   import { raisedGround } from '../engine/ground.js';
//   const sand = ramp(raisedGround(p.land));      // the bank: a step lighter than its colour, cream left as it is

import { ramp, mix, brightness } from './color.js';

/**
 * Lifts a ground colour towards its light tone so that it stands apart by value from the ground round it: a full step for a mid colour, less for a light one, nothing for a very light one (a full step would bleach it).
 * Arguments: colour (the ground's colour, '#rrggbb'); options { target (the brightness, 0 to 1, at and above which a colour is left alone, default 0.86), span (how far below the target a colour must be to get the whole step, default 0.2; in between it gets a share of it) }. Returns '#rrggbb'.
 */
export function raisedGround(colour, { target = 0.86, span = 0.2 } = {}) {
  const short = target - brightness(colour);
  const raise = span > 0 ? Math.min(1, Math.max(0, short / span)) : short > 0 ? 1 : 0;
  return mix(colour, ramp(colour).light, raise);
}
