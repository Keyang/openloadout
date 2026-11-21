// The studio's file form (a version 1 studio sprite downloads as <id>.js; docs/studio.md 2.4, Contract 14 rule 8) is written
// and read by catalog/data-file.js, a folder the published site serves (tools/ is not published, tools/build.mjs DIST).
// This module only passes it on to the tools and tests that name it here. Nothing in tools/ calls it: until build item R4a the
// build read a studio file in sprites/ with it, and now the build refuses every code file there (tools/lib/assets.mjs
// codeSpriteRefusal). Pure (no Node imports, no DOM), like the module it passes on.
export * from '../../catalog/data-file.js';
