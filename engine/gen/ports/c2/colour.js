// engine/color.js as migration batch C2's ported creature code sees it: M9's paint-ref shim (engine/gen/ports/colour.js:
// tone, ramp, mix, pick and INK on paint refs, each the colour rule of the same function) plus farRamp, which the hive
// bug rig and the spitter, thorn beetle and crawler draw their far legs and undersides in. Pure; Node and browser.
import { ramp, tone, mix } from '../colour.js';

/** The outline colour (engine/color.js INK) as a paint ref: ink. */
export { INK } from '../colour.js';
/** engine/color.js tone for a paint ref: the `tone` colour rule. */
export { tone } from '../colour.js';
/** engine/color.js ramp for a paint ref: { isRamp, base, light, dark, deep } as paint refs. */
export { ramp } from '../colour.js';
/** engine/color.js mix for two paint refs: the `mix` colour rule. */
export { mix } from '../colour.js';
/** engine/color.js pick for paint refs: the `standOut` colour rule. */
export { pick } from '../colour.js';

/** engine/color.js farRamp for a paint ref, word for word: a ramp one step darker (limbs on the far side of the body), as colour rules. Arguments: ref. */
export function farRamp(hex) {
  return ramp(mix(tone(hex, -0.75), '#241a3a', 0.12));
}
