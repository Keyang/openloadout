// The effect behaviours of build item B12c (docs/data-sprites.md section 9, row B12c; 2.5c, 3.3 "fx"), registered by
// loading their five family files, and their tables gathered for engine/gen/index.js in one place, so the registry
// takes them with one import line: the stamp bound of every behaviour (STAMP_BOUNDS), the keyable arguments its price
// reads (SIZE_KEYS) and why each works in frame pixels (FRAME_GENERATORS).
//   engine/gen/fx-glints.js   twinkle@2, sparkles@1, rays@1, beam@1, scorch@1
//   engine/gen/fx-debris.js   shards@1, smoke@1, leaves@1, trail.puffs@1, mist@1
//   engine/gen/fx-fire.js     flame@1, embers@1, spark.ring@1, blast.ball@1, puff.ring@1
//   engine/gen/fx-spells.js   bolt@1, swirl@1, motes@1
//   engine/gen/fx-fields.js   fall.field@1, ripples@1
// Pure: registers generators and exports frozen tables; runs the same in the browser and Node.
import { GLINT_STAMP_BOUNDS, GLINT_SIZE_KEYS, GLINT_FRAME_GENERATORS } from './fx-glints.js';
import { DEBRIS_STAMP_BOUNDS, DEBRIS_SIZE_KEYS, DEBRIS_FRAME_GENERATORS } from './fx-debris.js';
import { FIRE_STAMP_BOUNDS, FIRE_SIZE_KEYS, FIRE_FRAME_GENERATORS } from './fx-fire.js';
import { SPELL_STAMP_BOUNDS, SPELL_SIZE_KEYS, SPELL_FRAME_GENERATORS } from './fx-spells.js';
import { FIELD_STAMP_BOUNDS, FIELD_SIZE_KEYS, FIELD_FRAME_GENERATORS } from './fx-fields.js';

/** The most stamp pixels each B12c behaviour can return in a frame of `size`: "<id>@<v>" -> (args with defaults, size) -> pixels. */
export const B12C_STAMP_BOUNDS = Object.freeze({ ...GLINT_STAMP_BOUNDS, ...DEBRIS_STAMP_BOUNDS, ...FIRE_STAMP_BOUNDS, ...SPELL_STAMP_BOUNDS, ...FIELD_STAMP_BOUNDS });

/** The keyable arguments of each B12c behaviour that its cost or stamp bound reads: a key may set one only at or below what the emitter sets. */
export const B12C_SIZE_KEYS = Object.freeze({ ...GLINT_SIZE_KEYS, ...DEBRIS_SIZE_KEYS, ...FIRE_SIZE_KEYS, ...SPELL_SIZE_KEYS, ...FIELD_SIZE_KEYS });

/** Why each B12c behaviour works in frame pixels: "<id>@<v>" -> reason (name it as an emitter, not on a node). */
export const B12C_FRAME_GENERATORS = Object.freeze({ ...GLINT_FRAME_GENERATORS, ...DEBRIS_FRAME_GENERATORS, ...FIRE_FRAME_GENERATORS, ...SPELL_FRAME_GENERATORS, ...FIELD_FRAME_GENERATORS });
