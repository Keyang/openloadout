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
import './fx-burst.js';
import './emitters.js';
import './motion.js';
import './pictures.js';
import './ui-pieces.js';
import './ui.js';
import './backdrop.js';
import './tiles.js';         // build item B15: tiles@1, the layout of a tileset, its material as data (engine/gen/tiles.js)
import './icon-sets.js';     // batch M4: icon.fitted, icon.body, icon.rim, icon.flame, icon.plate and oval: what the library icon sets drew in code
import './prize-items.js';   // migration batch M2: the ten pickups' shape generators (timepiece@1 ...), ports of their code
import './world-props.js';   // migration batch M3: the library props' shape generators (spring.pad@1 ...), ports of their code
import './motion-sheen.js';  // migration batch M1: pickup.sheen@1, the glint sweep of a floating pickup (engine/gen/motion-sheen.js)
import './chip.js';          // migration batch M1: chip@1 and chip.turn@1, the credit chip's turning face (engine/gen/chip.js)
import './cell.js';          // migration batch M1: cell@1 and cell.pulse@1, the health cell's charge and beat (engine/gen/cell.js)
import { SKIN_FRAME_GENERATORS } from './ui-skin.js';      // migration batch M8: ui.slab, ui.trough, ui.strip, ui.toggle, ui.pointer, ui.selector, ui.area, the skin families' pieces (engine/gen/ui-skin.js)
import './text.js';          // migration batch M9: font.cell@1 and the text ports, the interface pieces' pixel letters (engine/gen/text.js)
import './ui-inputs.js';     // migration batch M9: key.cap, key.wide, pad.dpad, pad.face, mouse, stick: the input pictures' ports (engine/gen/ui-inputs.js)
import './ui-hud.js';        // migration batch M9: damage.digits, status.icons, crosshair ...: the HUD pictures' ports (engine/gen/ui-hud.js)
import './ui-bubbles.js';    // migration batch M9: emote.marks, the bubbles and the name plate: their ports (engine/gen/ui-bubbles.js)
import { BACKDROP_FRAME_GENERATORS } from './backdrop-frame.js';
import { FX_STAMP_BOUNDS, FX_SIZE_KEYS } from './fx-burst.js';   // not from backdrop.js: it imports resolve.js, which imports this module
import { B12C_STAMP_BOUNDS, B12C_SIZE_KEYS, B12C_FRAME_GENERATORS } from './fx-b12c.js';   // build item B12c: the other 20 effect behaviours (engine/gen/fx-glints.js, fx-debris.js, fx-fire.js, fx-spells.js, fx-fields.js)

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

/**
 * The most stamp pixels a call can return in a frame of size [W, H]: "<id>@<v>" -> (args with defaults filled, size) ->
 * pixels, for every behaviour (family fx). catalog/sprite-schema.js prices each emitter once by it, at its declared
 * values, alone and summed over the emitters that can draw together, and refuses an emitter whose generator has none,
 * before anything draws (build items B12, B12b: the effect behaviours, engine/gen/fx-burst.js).
 */
export const STAMP_BOUNDS = Object.freeze({
  ...FX_STAMP_BOUNDS,
  ...B12C_STAMP_BOUNDS,
  // engine/gen/fx.js and fx-items.js (B2, B8): a twinkle is one stamp of at most 9 x 9; a pickup burst at most three
  // twinkles of size 1 and one of size 2 (its dots are not stamps); chunks are polygons and dots
  'twinkle@1': () => 81,
  'pickup.burst@1': () => 3 * 9 + 25,
  'chunks@1': () => 0,
});

/**
 * The keyable arguments of each behaviour that its cost or its stamp bound reads: "<id>@<v>" -> names. A clip key may
 * set one of these below what the emitter sets, never above (catalog/sprite-schema.js), so keys never raise what an
 * emitter was priced at; a behaviour with no entry has every keyable argument treated so (build item B12b).
 */
export const SIZE_KEYS = Object.freeze({
  ...FX_SIZE_KEYS,
  ...B12C_SIZE_KEYS,
  'twinkle@1': Object.freeze([]),          // its cost (1) and its bound (81) read no argument
  'pickup.burst@1': Object.freeze([]),
  'chunks@1': Object.freeze([]),
});

/** Generators that work in frame pixels by design, never on a node's own coordinates, each with why: "<id>@<v>" -> reason. */
export const FRAME_GENERATORS = Object.freeze({
  ...BACKDROP_FRAME_GENERATORS,      // build item B14: backdrops wrap across the layer's width (engine/gen/backdrop.js)
  ...B12C_FRAME_GENERATORS,          // build item B12c: the other effect behaviours keep to the frame's 1 px border, fall.field to the frame (engine/gen/fx-b12c.js)
  ...SKIN_FRAME_GENERATORS,          // migration batch M8: ui.area@1 draws nothing; its text areas and slice are frame pixels (engine/gen/ui-skin.js)
  'pickup.burst@1': 'an effect that keeps its sparkles 3 px inside the frame: name it as an emitter (the pictures layout puts an emitter on its node\'s frame first), not in a draw list on a node',
  'chunks@1': 'an effect whose floor row and box are frame rows and columns: name it as an emitter, not in a draw list on a node',
  'icon.fit@1': 'lays out a whole icon centred in the frame: an icon set\'s fit, never drawn on a node',
  // build item B12: the effect behaviours keep to the frame's 1 px border as engine/fx.js did (engine/gen/fx-burst.js)
  'particles@1': 'an effect whose one-shot particles stop at the frame\'s border: name it as an emitter, not in a draw list on a node',
  'starburst@1': 'an effect clipped to the frame\'s 1 px border: name it as an emitter, not in a draw list on a node',
  'glow@1': 'an effect clipped to the frame\'s 1 px border: name it as an emitter, not in a draw list on a node',
  'ring@1': 'an effect that stops growing at the frame\'s border: name it as an emitter, not in a draw list on a node',
  'streaks@1': 'an effect clipped to the frame\'s 1 px border: name it as an emitter, not in a draw list on a node',
  'puffs@1': 'an effect whose one-shot puffs stop at the frame\'s border: name it as an emitter, not in a draw list on a node',
  'shot.bar@1': 'a bar of light whose nose and tail keep 3 px inside the frame: name it as an emitter, not in a draw list on a node',
  // build item B15: a tile's pattern wraps round the tile's 32 px (engine/gen/tiles.js)
  'tile.courses@1': 'stone courses that wrap round the tile\'s 32 px: name it in a tile\'s fill version or face picture, not on a node',
});
