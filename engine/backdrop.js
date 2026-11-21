// Backdrop helper: everything a background needs so that it tiles sideways with no
// seam and its layers read as near and far (docs/style-guide.md, sections 7 and 14).
//
// A background is one sprite, 320x180, with three clips that are its layers: `far`
// (solid: the sky and the most distant shapes), `mid` and `near` (see-through above
// their shapes). A game scrolls them at SCROLL.far / .mid / .near of the camera's speed
// and repeats each one sideways, so the right edge of a layer must continue into its
// own left edge. Three things make that happen without thinking about it:
//
//   1. OUTLINES are functions x -> y (the top edge of a shape) that repeat every 320 px:
//      ridge(), treeline(), battlements(). Fill under one with fillBelow().
//   2. SCATTERED THINGS get their x from scatter(), and are drawn with wrapped() (or with
//      disc / cloud / canopy / stars, which already do it), so one that hangs over the
//      right edge comes back in on the left.
//   3. COLOURS go through recede(colour, depth, air): every colour is mixed toward the
//      air colour, more the farther the layer, so far layers are pale and flat and the
//      game's sprites stand out in front. skyLook(sky, time) gives the sky bands and
//      that air colour for day, dusk and night; hazed(depth, p.haze) is the "Haze" control.
//      Then the main tone of every silhouette goes through standOut(colour, [what is behind it]),
//      which keeps it a clear step of value away, so a ridge cannot melt into the sky band behind
//      it when a visitor recolours the bundle with a palette. litTone() gives a shape's sunlit
//      tone, and tidy(g), called last in each layer, removes stray single pixels.
//
// A background is data (sprites/bg-forest.json, a landscape; sprites/bg-castle.json, buildings): the generators in
// engine/gen/backdrop.js draws its layers with ports of this module's outlines, fills and colour rules, and engine/gen/scenery.js
// imports it. No sprite file imports it.
// tests/unit/backdrop-helper.test.mjs draws a small three-layer backdrop with it (its `example`), so the way the
// pieces fit together is run, not described.
//
// Rules the helper cannot enforce (style guide, section 7): no outline anywhere; at most
// eight landscape colours per layer (stars, sun, moon and lit windows do not count); nothing in
// `mid` or `near` brighter than the horizon band except small lights; nothing as dark as INK;
// no single landmark in `mid` or `near`, and no shape repeated there more often than every
// 160 px; `mid` and `near` draw a strip at least 8 rows high across their whole bottom edge.
//
// Pure JavaScript, no state: the same input gives the same pixels.






export const LAYER = [320, 180];
/** How fast each layer scrolls, as a share of the camera's speed. Say these in the sprite's blurb. */
export const SCROLL = { far: 0.1, mid: 0.4, near: 0.7 };
const [W, H] = LAYER;
