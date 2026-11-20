// engine/color.js as migration batch C3's ported helpers see it: engine/gen/ports/colour.js (the same names, working on
// PAINT REFS instead of colours; brightness and col throw there) plus farRamp, which the robot rigs shade their far side
// with. Pure; Node and browser.
import { ramp, tone, mix } from '../colour.js';

export { INK, tone, ramp, mix, pick, brightness, hexToRgb, rgbToHex, col } from '../colour.js';

/** engine/color.js farRamp for a paint ref: the ramp of the colour a step darker and a little towards the far blue, as colour rules. Arguments: ref. */
export function farRamp(ref) { return ramp(mix(tone(ref, -0.75), '#241a3a', 0.12)); }
