// The site's named-generator registry, filled (docs/data-sprites.md section 3.1). Import this module, not registry.js,
// to get every generator: each family module below registers its generators when it loads, one line each, as
// engine/library-bodies.js lists the library bodies. A new family is one module engine/gen/<family>.js and one line here.
//
//   import { runGenerator, checkCall, describeGenerators } from '../engine/gen/index.js';
//   runGenerator({ gen: 'twinkle', v: 1, at: [16, 16], size: 2, paint: 'gold', core: 'shine' })   // -> { ok, primitives, errors, cost }
import './fx.js';
import './mark.js';
import './place.js';
import './shape.js';
import './icon.js';
import './shine.js';
import './fx-items.js';
import './motion.js';
import './pictures.js';
import './ui-pieces.js';
import './ui.js';

/** Declares and registers a generator version in the site's registry; returns its frozen entry (engine/gen/registry.js). */
export { defineGenerator } from './registry.js';
/** The site's entry of generator id at version v, or null. */
export { generator } from './registry.js';
/** Every generator in the site's registry, sorted by id and version. */
export { generators } from './registry.js';
/** The versions the site's registry holds for an id, ascending. */
export { generatorVersions } from './registry.js';
/** The site's registry as plain JSON, for generated/generators.json and window.loadout.framework.gen.list(). */
export { describeGenerators } from './registry.js';
/** Checks a generator call before anything draws: { ok, errors, cost } (bindings allowed, worst-case cost). */
export { checkCall } from './registry.js';
/** Runs one resolved generator call: { ok, primitives, errors, cost }; never throws. */
export { runGenerator } from './registry.js';
/** Expands a frame's draw list (primitives and calls) into primitives: { ok, primitives, errors, cost, calls }. */
export { expandList } from './registry.js';
/** A separate, empty registry with the same API (tests, tools). */
export { createRegistry } from './registry.js';
/** The registry key of a generator version: genKey('twinkle', 1) is 'twinkle@1'. */
export { genKey } from './registry.js';
/** Caps: generator calls and primitives per frame, nesting levels, combinations and evaluations spent on costing one call. */
export { GEN_LIMITS } from './registry.js';
/** Fields a call may carry that are not arguments (gen, v, id, on, z, when, group, hidden, glow, part, clip, shade, light, far), each checked by type. */
export { CALL_FIELDS } from './registry.js';
/** What a generator sees besides its arguments: t, frame, frames, loop, size, clip, direction. */
export { CTX_FIELDS } from './registry.js';

/**
 * Released versions that lose what lies left of or above the frame's corner (a call `on` a node centred at its origin
 * draws a quarter), each with the version that draws it whole: "<id>@<v>" -> the fixed version (build item B10b;
 * tests/unit/gen-node-origin.test.mjs). They keep their output; new assets name the fixed version.
 */
export const ORIGIN_FIXED = Object.freeze({ 'gem.cut@1': 2, 'glint@1': 2, 'icon.paint@1': 2, 'icon.line@1': 2, 'icon.glint@1': 2 });

/** Generators that work in frame pixels by design, never on a node's own coordinates, each with why: "<id>@<v>" -> reason. */
export const FRAME_GENERATORS = Object.freeze({
  'pickup.burst@1': 'an effect that keeps its sparkles 3 px inside the frame: name it as an emitter (the pictures layout puts an emitter on its node\'s frame first), not in a draw list on a node',
  'chunks@1': 'an effect whose floor row and box are frame rows and columns: name it as an emitter, not in a draw list on a node',
  'icon.fit@1': 'lays out a whole icon centred in the frame: an icon set\'s fit, never drawn on a node',
});
