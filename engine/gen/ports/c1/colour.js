// engine/color.js as creature batch C1's ports see it: the M9 shims of engine/gen/ports/colour.js (the same names,
// working on PAINT REFS instead of colours) plus the two the creatures read that the shims have not got: farRamp, and
// a stand-in for the bat's own brightness test (lightAbove, the `ifLight` colour rule). It is the drawing code of the
// creature ports (engine/gen/creature-c1.js), so it is NOT temporary: it stays when engine/color.js goes and goes only
// with the last generator version that draws with it. Pure; Node and browser.
import { ramp, tone, mix } from '../colour.js';
import { fixed } from '../../port-surface.js';
import { colourOf } from '../../pixels.js';

export { INK, tone, ramp, mix, pick } from '../colour.js';

/** engine/color.js farRamp for a paint ref: the ramp of the colour toned down 0.75 and mixed 0.12 toward the far-shadow violet, as colour rules. Arguments: ref. */
export function farRamp(ref) { return ramp(mix(tone(ref, -0.75), '#241a3a', 0.12)); }

/** One of two paint refs by how light a third is (`then` when its brightness is above `above`, else `otherwise`): the `ifLight` colour rule, which reads engine/color.js brightness. Arguments: of, above, then, otherwise. */
export function lightAbove(of, above, then, otherwise) {
  return { rule: 'ifLight', of: colourOf(fixed(of)), above, then: colourOf(fixed(then)), else: colourOf(fixed(otherwise)) };
}
