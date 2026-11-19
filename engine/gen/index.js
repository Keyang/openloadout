// The site's named-generator registry, filled (docs/data-sprites.md section 3.1). Import this module, not registry.js,
// to get every generator: each family module below registers its generators when it loads, one line each, as
// engine/library-bodies.js lists the library bodies. A new family is one module engine/gen/<family>.js and one line here.
//
//   import { runGenerator, checkCall, describeGenerators } from '../engine/gen/index.js';
//   runGenerator({ gen: 'twinkle', v: 1, at: [16, 16], size: 2, paint: 'gold', core: 'shine' })   // -> { ok, primitives, errors, cost }
import './fx.js';
import './mark.js';
import './place.js';

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
