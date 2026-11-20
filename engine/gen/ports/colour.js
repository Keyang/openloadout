// engine/color.js as the ported helpers in this folder see it (migration batch M9): the same names, working on PAINT
// REFS instead of colours. A helper copied here word for word from engine/ with its `./color.js` import pointed at this
// module paints the refs its caller gave it, and every colour it worked out from a colour (a tone, a ramp, a blend, the
// one that stands out) becomes the colour rule of that same function, which engine/resolve.js works out per frame.
// Functions that read a colour's numbers (brightness, hexToRgb) have no ref form and are not here: a port that needs one
// says so where it is copied. Pure; Node and browser.
import { rampP, toneP, mixP, pickP, INK_P } from '../port-surface.js';

/** The outline colour (engine/color.js INK) as a paint ref: ink. */
export const INK = INK_P;

/** engine/color.js tone for a paint ref: the `tone` colour rule. Arguments: ref, amount. */
export function tone(ref, amount) { return toneP(ref, amount); }

/** engine/color.js ramp for a paint ref: { isRamp, base, light, dark, deep } as paint refs. Arguments: ref. */
export function ramp(ref) { return { isRamp: true, ...rampP(ref) }; }

/** engine/color.js mix for two paint refs: the `mix` colour rule. Arguments: a, b, t. */
export function mix(a, b, t) { return mixP(a, b, t); }

/** engine/color.js pick for paint refs: the `standOut` colour rule. Arguments: against, ...candidates. */
export function pick(against, ...candidates) { return pickP(against, ...candidates); }

const noRef = (name) => () => { throw new Error(`${name} reads a colour's numbers; a paint ref has none (engine/gen/ports/colour.js)`); };
/** engine/color.js brightness has no paint-ref form: a ported helper that calls it throws, naming it. */
export const brightness = noRef('brightness');
/** engine/color.js hexToRgb has no paint-ref form: a ported helper that calls it throws, naming it. */
export const hexToRgb = noRef('hexToRgb');
/** engine/color.js rgbToHex has no paint-ref form: a ported helper that calls it throws, naming it. */
export const rgbToHex = noRef('rgbToHex');
/** engine/color.js col has no paint-ref form: a ported helper that calls it throws, naming it. */
export const col = noRef('col');
