// The library bodies a studio definition may name (body.library; studio item F2, docs/studio.md 2.3). One line per body
// module, `export * from '../rigs/body-<name>.js';`, and nothing else: the module exports its descriptor(s), made by
// engine/library-body.js defineLibraryBody(), under a name of its own (HUMANOID_BODY; a module with several bodies
// exports a list, CREATURE_BODIES). catalog/studio-schema.js makes the registry from this module (LIBRARY_REGISTRY)
// and engine/data-sprite.js draws through it. A body added here reaches the validator, dataSprite, the library file
// form and the bag with no other change (tests/unit/studio-bodies-stub.test.mjs makes this change on a copy).
export * from '../rigs/body-humanoid.js';
