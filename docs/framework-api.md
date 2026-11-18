# The framework and `window.loadout`

This is the guide to Contract 11 of `docs/architecture.md`. Read it before you add to the framework, and before you write anything that drives the live site (an agent in the browser, or an MCP server). The first half is written by hand. The reference at the end is written by the build from the code; do not edit it.

## Two layers

1. **The framework** is the code every asset is made with: drawing (`engine/`), body rigs (`rigs/`), sound and music synthesis, analysis and looks (`sound/`), and the quality bar (`quality/`). It starts simple and grows.
2. **The assets** are one file each (`sprites/<id>.js`, `sounds/<id>.json`). An asset file holds only what is particular to that asset. The framework turns it into pixels and samples on demand.

When an asset needs something the framework does not have (a shape, a pose, a pattern, a synthesis block, a measurement), add it to the framework so the next asset can use it. Generic drawing or synthesis code inside an asset file is a review finding.

Everything in the framework is on the page as `window.loadout.framework`, and described in `generated/api.json`. Nobody keeps a list: the build finds the modules by scanning the folders.

## Adding to the framework

### Where a function goes

Put it in the module that already does that job (`engine/fx.js` for effects, `engine/tiles.js` for tiles, `rigs/humanoid.js` for the side-view body). Start a new file only for a new job, directly in `engine/`, `rigs/`, `sound/` or `quality/`.

A `.js` file in one of those four folders is a framework module when it exports something and runs anywhere: its code must not use a page (`window.`, `document.`), a worker's message port (`self.onmessage`, `postMessage`) or Web Audio (`AudioContext`, `AudioWorklet`). That is why `sound/sfx-engine.js` is framework and `sound/player.js`, `sound/worklet.js` and `sound/render-worker.js` are not. A file whose name starts with `_` is skipped. If the test gets a file wrong, put `// loadout: framework` or `// loadout: not framework` in its first 12 lines.

A module's short name on `loadout.framework` comes from its file name by one rule: drop `.js` and a trailing `-engine`, make it camelCase; modules in `quality/` get `check` in front; if two would still share a name, the one in the later folder (`engine`, `rigs`, `sound`, `quality`) gets its folder name in front. So `engine/fx.js` is `fx`, `sound/sfx-engine.js` is `sfx`, `sound/theme.js` is `soundTheme`, `quality/sprite.js` is `checkSprite`.

The first comment line of the file says what the module is for. It becomes the module's one-line purpose.

### The comment the generator reads

Write the comment directly above the export, with no blank line between:

```js
/**
 * An expanding ring from (x, y): shockwave, ripple, landing dust ring.
 * o.t: clip phase 0..1. o.r0, o.r1: the radius at the start and the end. o.thick: px wide at the start.
 * o.colours: a list, hottest first (see steps()). Throws if the centre is outside the box.
 */
export function ring(g, o) { ... }
```

- The **first sentence** is the one-line description. It says what the function does, in words. It ends at the first full stop that is followed by a capital letter or the end of the paragraph.
- The rest lists the arguments and anything else a caller needs. The whole comment is kept in `generated/api.json` as `doc`.
- The argument list comes from the function itself. You do not repeat it.
- A block of `//` lines directly above the export counts too, and so does a `//` comment at the end of a one-line export (`export const INK = '#231b33'; // default outline colour`).
- A comment that starts with a call form (`defineSprite({ ...`) is not a sentence and does not count. Start with the sentence, then show the call.
- An export passed on from another framework module (`export { ramp } from '../engine/color.js'`) takes the description it has there.
- Methods of an exported class are read the same way, from the comment above each method.

### The tests it needs

- **Your own unit test** for the new function, in `tests/unit/<area>-*.test.mjs`. Additions are additive: existing exports keep their behaviour and every existing asset renders the same.
- **`tests/unit/api-descriptions.test.mjs`** fails when an exported function or class has no one-line description, and names the file and the export. `tests/fixtures/api/still-to-describe.json` lists the exports that had none when the rule came in; it can only shrink (an entry that is described now fails the test until you delete it from the list).
- **`tests/unit/api-generator.test.mjs`** checks that `generated/api.json` matches the real exports and that the reference below is current. If it says the reference is out of date, run `node tools/lib/api.mjs`.

### How it shows up

Run `node tools/build.mjs` (its `framework` step), or just `node tools/lib/api.mjs`. That writes:

| File | What |
|---|---|
| `generated/api.json` | Every module (`name`, `file`, `purpose`) and every export (`name`, `kind`, `args`, `description`, `doc`; `value` for small constants, `keys` for objects, `methods` for classes), plus `actions` |
| `generated/framework.js` | One module that re-exports every framework module under its short name |
| `docs/framework-api.md` | The reference between the two marker comments at the end of this file |

After that, with no other edit, the new function is `loadout.framework.<module>.<name>` on the page, and it is in `(await loadout.api).modules`. `node tools/lib/api.mjs --undescribed` prints what still has no description.

## `window.loadout`

`app/api.js` installs it when the site loads. The file is small and loads nothing else until something is used.

```js
const fw = await loadout.framework;            // the framework: fw.sprite.defineSprite, fw.fx.ring, fw.sfx.renderPatch, ...
const api = await loadout.api;                 // generated/api.json
```

`loadout.framework` and `loadout.api` are fetched on first use. Until one has arrived it is a promise of itself, so always write `await loadout.framework`. Once anything has waited for it, `loadout.framework.sprite.defineSprite` also works directly.

Using the framework directly:

```js
const { surface, fx, color } = await loadout.framework;
const g = new surface.Surface(32, 32);
fx.ring(g, { t: 0.3, x: 16, y: 16, r1: 12, colours: fx.steps('#e8742a') });
g.data;                                        // Uint32Array, one packed colour per pixel, 0 = see-through
```

### Actions

Every action is async, returns plain data, and never throws. A bad input gives `{ ok: false, errors: ['...'] }`, and each message says what was wrong and what to write instead.

```js
await loadout.assets.list({ kind: 'sprite', themes: 'fantasy' });   // { ok, total, assets: [rows] }
await loadout.assets.get('knight');                                 // { ok, asset: { ...row, controls, clips } }
await loadout.assets.search('money', { kind: 'sound', limit: 5 });  // { ok, total, assets }
await loadout.assets.similar('coin', 4);                            // { ok, id, assets }

await loadout.make.sprite(sourceText);     // { id, kind, ok, errors, warnings, kept, replaced }
await loadout.make.sound(patchObject);     // { id, kind, ok, errors, warnings, notes, kept, replaced }
await loadout.check('knight');             // { id, kind, ok, errors, warnings, metrics }; also takes source text or a patch
await loadout.render('coin', { clip: 'spin', scale: 4 });           // { ok, png, width, height, frames, opaque, ... }
await loadout.render('coin-pickup', { style: 'Gem' });              // { ok, wav, seconds, sampleRate, peak, ... }

await loadout.bag.add('knight', { params: { height: 0.8 } });       // { ok, key, count, item }
await loadout.bag.items();                 // { ok, count, items, look }
await loadout.bag.setLook({ colour: { hue: 40 } });
await loadout.bag.download();              // starts the zip download; { ok, name, bytes, files }
await loadout.go('/sprite/knight');        // { ok, route }
```

**`make.sprite(source)`** takes one ES module as text, written exactly like a file in `sprites/`: it imports the framework by its usual relative paths and ends in `export default defineSprite({ ... })`. The import addresses are rewritten to full addresses of this site and the text is loaded as a module from memory. An import from another site, a bare package name, a `data:` or `blob:` address, or an `import()` whose address is not plain text, is refused with the line number. This keeps a sprite's imports to the site's own files; it is not a sandbox, because the source still runs in the page.

The id must not be one the catalogue uses. Making the same new id again replaces the earlier one. The quality bar (Contract 10) runs on it and its errors and warnings come back. `ok` is true when there are no errors. A sprite that loads is kept even when it fails the bar (`kept: true`), so you can `render` it and `check` it while you fix it; it is listed with `ok: false`.

**`make.sound(patch)`** takes the patch object (or its JSON text). A patch the engine cannot run at all is not kept.

**The quality bar runs in a background worker.** A sprite's check takes from a tenth of a second to several seconds (measured 2026-11-18: the Hero 0.5 s and the forest backdrop 0.6 s in Chromium on a quiet machine, up to 8 s on a busy one) and a music track's takes minutes. The page stays responsive meanwhile: the longest stall measured during those checks was 38 ms. In a browser with no module workers the check runs on the page instead, and its verdict carries a warning that says so. `render` draws on the page and pauses between frames; sounds are rendered in the worker.

**Phase 1 limits (2026-11-18).** Assets made on a visit live in a registry inside `app/api.js`. They can be listed, searched, checked and rendered. They have no page yet and cannot go in the bag: `bag.add` and `go` answer `ok: false` and say so. That arrives when `app/catalog.js` exports `addRuntimeAsset(row, definition)`; `app/api.js` already calls it when it exists.

### For an MCP server

`(await loadout.api).actions` is the tool list. Each entry has `name`, `description` and `inputSchema` in the shape MCP uses, and two more fields that say how to run it on the page:

- `call`: where the function is on `window.loadout` (`"assets.search"`)
- `args`: the properties of the input, in the order the function takes them (`["text", "filters"]`)

The shortest way to run a tool is the dispatcher, which takes the tool name and the input object as they arrive:

```js
// in the page, for example through Playwright's page.evaluate
const result = await window.loadout.call(name, input);
```

`loadout.call` refuses an unknown tool or an unknown input property with `{ ok: false, errors }`, like every other action. The result is plain data and can be returned as the tool result as it is. Pictures and sounds come back as `data:` addresses (`png`, `wav`, `zip`).

The framework functions are not tools. An agent uses them by writing sprite source text for `make_sprite` that imports them, or by evaluating code in the page against `await loadout.framework`. `(await loadout.api).modules` is what to show the agent so it knows what exists.

## Reference

<!-- generated reference: start (written by tools/lib/api.mjs from generated/api.json; do not edit by hand) -->
18 framework modules, 261 exports, 14 actions.

### Actions

Each is on `window.loadout` and in `generated/api.json` under `actions` with its full input schema.

| Tool name | On the page | What it does |
|---|---|---|
| `assets_list` | `loadout.assets.list(filter)` | List the assets on the site (sprites, sounds, music), with what each is for and its measured facts. Give a filter to narrow the list. Assets made on this visit are included and marked runtime: true. |
| `assets_get` | `loadout.assets.get(id)` | Everything about one asset: its catalogue row plus its controls (the settings render and the bag accept), its clips or styles, and for an asset made on this visit its last quality verdict. |
| `assets_search` | `loadout.assets.search(text, filters)` | Find assets by words, best match first, the way the site's search box does. Filters narrow the result; filters.limit caps how many come back (30 unless given). |
| `assets_similar` | `loadout.assets.similar(id, count)` | The assets most like this one (same role, shared words, same bundle), best first. |
| `make_sprite` | `loadout.make.sprite(source)` | Define a new sprite on this visit from source text: one ES module written exactly like a file in sprites/, importing the framework by its usual paths ('../engine/sprite.js', '../engine/fx.js', '../rigs/humanoid.js') and ending in "export default defineSprite({ ... })". The quality bar runs on it and its verdict comes back as { id, ok, errors, warnings }. The id must not be one the catalogue already uses; making the same new id again replaces it. |
| `make_sound` | `loadout.make.sound(patch)` | Define a new sound effect or music track on this visit from a synthesis patch (the JSON of a file in sounds/; music has "category": "music"). The quality bar runs on it and its verdict comes back as { id, ok, errors, warnings, notes }. A music track takes minutes to check. |
| `check` | `loadout.check(idOrDefinition)` | Run the quality bar and return its verdict { ok, errors, warnings, metrics } without keeping anything: for an asset id (catalogue or made on this visit), for sprite source text, or for a sound patch. |
| `render` | `loadout.render(id, options)` | Draw or play an asset and return the result as data. A sprite gives a PNG data address of one frame, or of a whole clip in one row when frame is left out, with its size and how many pixels are drawn. A sound or music track gives a WAV data address, or its samples. |
| `bag_add` | `loadout.bag.add(id, settings)` | Put a catalogue asset in the visitor's bag with its settings. Returns the new item's key. The same asset may be added more than once with different settings. |
| `bag_items` | `loadout.bag.items()` | What is in the bag: each item's key, kind, id and settings, and the look applied to the whole bag. |
| `bag_remove` | `loadout.bag.remove(key)` | Take one item out of the bag by its key (bag_items lists the keys). |
| `bag_set_look` | `loadout.bag.setLook(look)` | Set the look applied to everything in the bag when it is downloaded, so the assets match. Leave look out to go back to the plain look. |
| `bag_download` | `loadout.bag.download(options)` | Build the bag as one zip package (sprite sheets, their JSON, WAV files, a manifest and a guide) and start the browser download. Returns the file names and the size. |
| `go` | `loadout.go(route)` | Open a page of the site: "/" (home), "/browse?kind=sprite", "/sprite/<id>", "/sound/<id>", "/music/<id>", "/bundle/<id>", "/bundles", "/bag", "/play". |

### Framework modules

| Module | File | What it is |
|---|---|---|
| `loadout.framework.backdrop` | `engine/backdrop.js` | Backdrop helper: everything a background needs so that it tiles sideways with no seam and its layers read as near and far (docs/style-guide.md, sections 7 and 14). |
| `loadout.framework.color` | `engine/color.js` | Colour helpers. |
| `loadout.framework.fx` | `engine/fx.js` | Effect helpers: repeatable particles, twinkles, expanding rings, shards, smoke puffs and the white-core-to-dark-rim colour steps of an effect (docs/style-guide.md sections 2, 4 and 14). |
| `loadout.framework.motion` | `engine/motion.js` | Motion helpers: everything an animation needs is a pure function of the clip phase t (0..1) and the sprite's parameters. |
| `loadout.framework.palettes` | `engine/palettes.js` | The three bundle palettes (docs/style-guide.md section 3) and the swatch lists for colour controls built from them. |
| `loadout.framework.sprite` | `engine/sprite.js` | Sprite definition, parameters, and rendering frames / sprite sheets. |
| `loadout.framework.surface` | `engine/surface.js` | A Surface is a small grid of pixels plus shape-drawing calls. |
| `loadout.framework.theme` | `engine/theme.js` | Bundle-level customisation (architecture.md, Contract 7), the picture side. |
| `loadout.framework.tiles` | `engine/tiles.js` | The tile helper (docs/style-guide.md, sections 6 and 14). |
| `loadout.framework.ui` | `engine/ui.js` | Interface helper: nine-slice panels, button states, bars, highlight rows, arrow heads and digits (docs/style-guide.md sections 8 and 14). |
| `loadout.framework.humanoid` | `rigs/humanoid.js` | Side-view two-legged character rig (faces right), on a 64x64 canvas. |
| `loadout.framework.topdown` | `rigs/topdown.js` | Top-down two-legged character rig, on a 48x48 canvas: the partner of rigs/humanoid.js for map and room games. |
| `loadout.framework.analyze` | `sound/analyze.js` | Measurements of a rendered sound, so an agent (or a test) can check a patch without listening to it. |
| `loadout.framework.sfx` | `sound/sfx-engine.js` | Procedural sound-effect engine. |
| `loadout.framework.soundTheme` | `sound/theme.js` | Bundle-level customisation (architecture.md, Contract 7), the sound side. |
| `loadout.framework.wav` | `sound/wav.js` | 16-bit PCM WAV encoder. |
| `loadout.framework.checkSound` | `quality/sound.js` | The sound and music quality bar as code. |
| `loadout.framework.checkSprite` | `quality/sprite.js` | The sprite quality bar as code. |

#### `loadout.framework.backdrop` (`engine/backdrop.js`)

Backdrop helper: everything a background needs so that it tiles sideways with no seam and its layers read as near and far (docs/style-guide.md, sections 7 and 14).

| Export | Kind | Arguments or value | What it does |
|---|---|---|---|
| `LAYER` | constant | `[320,180]` | *(not described yet)* |
| `PIVOT` | constant | `[160,180]` | *(not described yet)* |
| `SCROLL` | object | keys: far, mid, near | How fast each layer scrolls, as a share of the camera's speed. |
| `TIMES` | constant | `["day","dusk","night"]` | *(not described yet)* |
| `layerClips` | function | `({ frames = 1, fps = 4 } = {})` | The three layer clips, farthest first: { far, mid, near }. layerClips() is one still frame each. |
| `wrapX` | function | `(x)` | Any x folded into 0..320. |
| `wrapGap` | function | `(a, b)` | How far a is to the right of b going the short way round the 320 px loop: -160..160. |
| `wrapped` | function | `(x, reach, draw)` | Draw something that may hang over an edge: draw(x) is called with x folded into 0..320, and once more 320 px to the side when the thing (up to `reach` px either way) crosses the join. |
| `ridge` | function | `({ base = 140, height = 40, seed = 1, peaks = 4, shape = 'round', rough = 0.35 } = {})` | A line of hills or mountains. |
| `treeline` | function | `({ base = 150, height = 20, count = 12, seed = 1, shape = 'round', width, at } = {})` | The top of a row of trees standing on `base` (a number, or another outline such as a ridge). |
| `battlements` | function | `(base = 100, { tooth = 8, gap = 8, depth = 6 } = {})` | A wall top with teeth: `tooth` px up, `gap` px down, `depth` px deep, standing on `base` (a number or an outline). |
| `highest` | function | `(...outlines)` | The upper edge of several outlines together (whichever is highest at each x). |
| `shifted` | function | `(outline, dx = 0, dy = 0)` | An outline moved dx px to the right and dy px down. |
| `litEdge` | function | `(outline, { depth = 0.8 } = {})` | Where the sunlit part of a ridge ends. |
| `scatter` | function | `(count, seed = 1, { jitter = 0.6, stable = false } = {})` | `count` positions across the 320 px for trees, clouds, stars, towers, windows: [{ x, i, u, v, w }], left to right. x is a whole pixel in 0..319; u, v, w are three steady random numbers 0..1 for that thing (its size, its row, its kind). |
| `recede` | function | `(colour, depth, sky)` | A colour as it looks through the air: mixed toward `sky` (pass skyLook().air), from 35% of the way at depth 0 (the near layer) to 86% at depth 1 (the horizon). |
| `hazed` | function | `(depth, haze)` | A layer's depth with the "Haze" control (0..1) applied: clear air pulls every layer a little nearer, mist pushes it toward the horizon. |
| `standOut` | function | `(colour, behind = [], { step = 0.08, also = [] } = {})` | A shape's colour, moved far enough in value from everything it is drawn against that it cannot merge with it: at least `step` of brightness away (default 0.08), AND still a different colour when a visitor recolours the whole bundle with… |
| `litTone` | function | `(base, air, k = 0.4)` | The sunlit tone of a shape whose main tone is `base`: part of the way (`k`, default 0.4) to the air colour, so it is lighter than the base but never lighter than the air: nothing in a layer may outshine the sky behind it. |
| `skyLook` | function | `(sky, time = 'day')` | The sky of a time of day from one sky colour (the colour of the daytime sky): |
| `fillBands` | function | `(g, colours, edges = [46, 84, 114])` | Flat bands across the whole layer, top to bottom. |
| `fillBelow` | function | `(g, outline, colour, { to = g.h } = {})` | Fill every column from the outline down to the bottom of the layer (or to row `to`, not included). |
| `fillBetween` | function | `(g, top, bottom, colour)` | Fill every column between two outlines: from `top` down to `bottom` (not included). |
| `disc` | function | `(g, x, y, r, colour)` | A flat disc (sun, moon, a round bush) that wraps. |
| `cloud` | function | `(g, x, y, w, colour, shade, seed = 0)` | A flat-bottomed cartoon cloud that wraps: `y` is its flat underside, `w` its width. |
| `canopy` | function | `(g, x, y, r, tones, seed = 0)` | A mass of leaves about `r` px in radius around (x, y), made of overlapping round clumps in three tones: tones = { light, base, dark } (already receded). |
| `mistBand` | function | `(g, y, thickness, colour, seed = 1, { to = g.h } = {})` | Mist lying on the ground: a band of the air colour with a softly waving top, `thickness` px deep above row `y`, across the whole width. |
| `tidy` | function | `(g)` | Removes isolated single pixels (a pixel with no neighbour of its own colour above, below, left or right; the left and right edges count as neighbours): each takes the colour under it, or beside it. |
| `stars` | function | `(g, count, seed, colour, { top = 0, bottom = 100 } = {})` | `count` stars between rows `top` and `bottom`: 2x2 dots and a few 3 px crosses. |
| `example` | function | `(p = { sky: '#8fd0f0', land: '#7fb0b8', leaf: '#3f8a4f', time: 'day' })` | Draws the example backdrop of the header comment: { far, mid, near } Surfaces. |

#### `loadout.framework.color` (`engine/color.js`)

Colour helpers.

| Export | Kind | Arguments or value | What it does |
|---|---|---|---|
| `pack` | function | `(r, g, b, a = 255)` | Pack red, green, blue and alpha (0..255 each) into the one 32-bit number a Surface stores per pixel. |
| `hexToRgb` | function | `(hex)` | '#rrggbb' (or '#rgb') -> [r, g, b], each 0..255. |
| `rgbToHex` | function | `(r, g, b)` | Red, green, blue (0..255, rounded and clamped) -> '#rrggbb'. |
| `col` | function | `(c)` | '#rrggbb' \| packed number -> packed number. |
| `rgbToHsl` | function | `(r, g, b)` | Red, green, blue (0..255) -> [hue in degrees 0..360, saturation 0..1, lightness 0..1]. |
| `hslToRgb` | function | `(h, s, l)` | Hue (degrees, any number), saturation and lightness (0..1) -> [r, g, b], each 0..255 and not rounded. |
| `hsl` | function | `(h, s, l)` | Hue (degrees), saturation and lightness (0..1) -> '#rrggbb'. |
| `mix` | function | `(a, b, t)` | Blend two '#rrggbb' colours: t = 0 gives a, t = 1 gives b. |
| `tone` | function | `(hex, amount)` | Lighten (amount > 0) or darken (amount < 0) with a pixel-art hue shift. |
| `ramp` | function | `(hex)` | Three-tone ramp from one base colour: shadows drift toward blue-violet and get more saturated, highlights drift toward yellow. |
| `farRamp` | function | `(hex)` | A ramp one step darker: use for limbs on the far side of the body. |
| `brightness` | function | `(hex)` | Perceived brightness of a colour, 0 (black) to 1 (white). |
| `pick` | function | `(against, ...candidates)` | Whichever of the candidates stands out most against `against`. |
| `INK` | constant | `"#231b33"` | Default outline colour |

#### `loadout.framework.fx` (`engine/fx.js`)

Effect helpers: repeatable particles, twinkles, expanding rings, shards, smoke puffs and the white-core-to-dark-rim colour steps of an effect (docs/style-guide.md sections 2, 4 and 14).

| Export | Kind | Arguments or value | What it does |
|---|---|---|---|
| `steps` | function | `(edge, { core, white = true } = {})` | The colour steps of an effect, hottest first: [white, core, mid, edge, rim] where rim = tone(edge, -1). opt.core: the inside colour (default: edge lightened toward yellow). opt.white: false drops the white step (smoke, slime: things… |
| `stepAt` | function | `(list, heat)` | Pick a step by heat: 1 = the hottest (first), 0 = the rim (last). |
| `lifeOf` | function | `(t, i, { seed = 0, loop = true, cycles = 1, stagger = 0.6 } = {})` | Life 0..1 of particle i at clip phase t. loop (default): fract(cycles * t + hash(i)), so the clip closes at whole cycles. one-shot (loop: false): each particle waits at 0 (in the hot core) for a delay of up to `stagger` of the clip,… |
| `twinkle` | function | `(g, x, y, size, colour, { core = '#ffffff', box } = {})` | A four-point sparkle at (x, y). size 0 = one pixel, 1 = a plus, 2 = a big plus. |
| `glow` | function | `(g, x, y, r, colours, { box } = {})` | Concentric hard discs from the rim (radius r, 1 px wide) in to a white centre: the brightest frame of a burst, a muzzle flash, a glowing orb. colours: hottest first. |
| `particles` | function | `(g, o)` | Particles thrown from (x, y): sparks, embers, bubbles, motes. angle / arc: the direction and the width of the cone (arc 2*PI = all round). dist: how far one travels in its life; gravity: px it falls by the end (negative floats up);… |
| `sparkles` | function | `(g, o)` | Twinkles scattered over an area (default: the whole box), each on its own repeating timer: off, a pixel, a plus, a big plus, back down. |
| `ring` | function | `(g, o)` | An expanding ring from (x, y): shockwave, ripple, landing dust ring (squash < 1 flattens it). |
| `shards` | function | `(g, o)` | Shards flung from (x, y): rock chips, glass, metal scraps, crystal splinters. |
| `smoke` | function | `(g, o)` | Smoke puffs rising from (x, y): chimney smoke, dust clouds, steam, poof. |

#### `loadout.framework.motion` (`engine/motion.js`)

Motion helpers: everything an animation needs is a pure function of the clip phase t (0..1) and the sprite's parameters.

| Export | Kind | Arguments or value | What it does |
|---|---|---|---|
| `TAU` | constant | `6.283185307179586` | A full turn, in radians |
| `PI` | constant | `3.141592653589793` | Half a turn, in radians |
| `lerp` | function | `(a, b, t)` | The value t of the way from a to b: t = 0 gives a, t = 1 gives b. |
| `clamp` | function | `(v, lo = 0, hi = 1)` | Keep v between lo and hi (0 and 1 unless given). |
| `smooth` | function | `(t)` | Ease in and out: 0..1 -> 0..1, slow at both ends (smoothstep). t is clamped. |
| `easeIn` | function | `(t)` | Ease in: 0..1 -> 0..1, starting slow and ending fast. t is clamped. |
| `easeOut` | function | `(t)` | Ease out: 0..1 -> 0..1, starting fast and ending slow. t is clamped. |
| `fract` | function | `(t)` | The part of t after the decimal point, always 0 up to 1 (fract(-0.25) is 0.75): wraps a phase round a loop. |
| `wave` | function | `(t, phase = 0)` | Sine wave, one cycle per clip. phase is in cycles (0.25 = quarter turn). |
| `pulse` | function | `(t, phase = 0)` | 0 -> 1 -> 0 over the clip (smooth). |
| `keys` | function | `(t, ks, ease = smooth)` | Keyframes: keys(t, [[0, a], [0.3, b], [1, c]]) interpolates smoothly between the listed (time, value) pairs and holds the end values outside the range. |
| `loopKeys` | function | `(t, ks, ease = smooth)` | Keyframes for a LOOPING clip: like keys(), but the value after the last key eases back to the first key, so the loop always closes. loopKeys(t, [[0, a], [0.4, b], [0.7, c]]) -> ... c eases back to a at t = 1. |
| `dir` | function | `(a)` | Rig angle convention: 0 = pointing down, PI/2 = forward (right), PI = up, negative = backward. dir(a) returns the unit vector in screen space. |
| `reach` | function | `(x, y, a, len)` | Point at distance len from (x, y) along rig angle a. |
| `ik2` | function | `(ax, ay, tx, ty, l1, l2, bend = 1)` | Two-bone IK. |
| `rng` | function | `(seed)` | Small deterministic random generator: rng(seed)() -> 0..1. |
| `hash` | function | `(a, b = 0)` | Stable 0..1 value from integers: use for particles that must not flicker randomly. |

#### `loadout.framework.palettes` (`engine/palettes.js`)

The three bundle palettes (docs/style-guide.md section 3) and the swatch lists for colour controls built from them.

| Export | Kind | Arguments or value | What it does |
|---|---|---|---|
| `BUNDLE_PALETTE` | object | keys: kit-platformer-fantasy, kit-rpg-fantasy, kit-roguelite-scifi | Maps each bundle id to its palette key ('kit-platformer-fantasy' -> 'thornwood'). |
| `PALETTE` | object | keys: thornwood, hearthvale, derelict | The three palettes as frozen { name: '#rrggbb' } objects, keyed thornwood, hearthvale, derelict (aliases: bundle ids, platformer, rpg, roguelite, scifi). |
| `NEVER_SWATCH` | object | keys: thornwood, hearthvale, derelict | Per palette key, the colour names that are never swatches: the outline and "background only" colours. |
| `paletteName` | function | `(bundle)` | Returns the palette key ('thornwood', 'hearthvale', 'derelict'); throws for an unknown name. |
| `palette` | function | `(bundle)` | Returns the frozen palette object. |
| `materials` | function | `(bundle)` | Lists the material words swatches() accepts for a palette (its colour names also work). |
| `swatches` | function | `(bundle, material, { lead } = {})` | Returns a new swatch list for a colour control: 4 to 8 colours, palette colours first, none darker than 0.18. |

#### `loadout.framework.sprite` (`engine/sprite.js`)

Sprite definition, parameters, and rendering frames / sprite sheets.

| Export | Kind | Arguments or value | What it does |
|---|---|---|---|
| `range` | function | `(label, def, o = {})` | *(not described yet)* |
| `choice` | function | `(label, def, options, o = {})` | *(not described yet)* |
| `color` | function | `(label, def, swatches, o = {})` | *(not described yet)* |
| `toggle` | function | `(label, def, o = {})` | *(not described yet)* |
| `SKIN` | constant | `["#f6d3b0","#e8b088","#c98a5c","#9a6240","#6e4428","#9bd18a","#b9a7e0"]` | *(not described yet)* |
| `HAIR` | constant | `["#2b2233","#5a3a22","#a8612a","#e0b040","#d8d8e0","#c9423a","#3f7fd1","#e670b0"]` | *(not described yet)* |
| `CLOTH` | constant | `["#c9423a","#e08a2c","#e6c545","#4f9d57","#2f8f9d","#3f6fd1","#7a4fc4","#d65a9c","#6b7280","#3a3350","#f0ead8"]` | *(not described yet)* |
| `METAL` | constant | `["#c2c9d6","#8f97a8","#e6c545","#c98a4a","#5d6475"]` | *(not described yet)* |
| `defineSprite` | function | `(def)` | *(not described yet)* |
| `cueInEffect` | function | `(sprite, cue, p)` | True when a sound of an animation plays at these settings: an entry of sprite.sounds, or a copy with the same `when`. |
| `partList` | function | `(sprite)` | The sprite's parts in order: [{ name, label, selector, controls, params, none, socket }]. controls = params without the selector. |
| `partOf` | function | `(sprite, key)` | The part a control belongs to (same shape as partList's entries), or null for a control of the sprite itself. |
| `partRemoved` | function | `(sprite, name, p)` | True when the part is taken off: its selector is at a none value (none may be one value or a list). |
| `inEffect` | function | `(sprite, key, p)` | False for a control that does nothing right now, for either reason: |
| `activeParams` | function | `(sprite, p)` | Keys of the controls in effect for these values, in the order of sprite.params. |
| `defaultParams` | function | `(sprite)` | *(not described yet)* |
| `cleanParams` | function | `(sprite, input = {})` | Fill in missing keys and clamp out-of-range values. |
| `randomParams` | function | `(sprite, seed = Date.now())` | A random but good-looking parameter set: colours come from the curated swatches. |
| `clipFps` | function | `(sprite, clip, p)` | *(not described yet)* |
| `renderFrame` | function | `(sprite, clip, frame, p)` | Render one frame of one clip to a new Surface. |
| `frameSockets` | function | `(sprite, clip, frame, p)` | Attach points of one frame: { name: { x, y, angle } } in frame pixels, or null when the sprite declares none. |
| `clipStretch` | function | `(sprite, clip, p)` | What a game needs to stretch one clip of a sprite, from the sprite's optional `slice` (docs/architecture.md, Contract 8), in frame pixels; null when the clip declares nothing. |
| `renderSheet` | function | `(sprite, p, { scale = 1, clips = Object.keys(sprite.clips) } = {})` | Render the full sprite sheet: one row per clip, one column per frame. |

#### `loadout.framework.surface` (`engine/surface.js`)

A Surface is a small grid of pixels plus shape-drawing calls.

| Export | Kind | Arguments or value | What it does |
|---|---|---|---|
| `ellipseIn` | function | `(cx, cy, rx, ry)` | Shape test for an ellipse centred on (cx, cy) with radii rx, ry: returns inside(px, py). |
| `capsuleIn` | function | `(x0, y0, x1, y1, r0, r1 = r0)` | Shape test for a thick line with round ends from (x0, y0) to (x1, y1); its radius goes from r0 to r1. |
| `polyIn` | function | `(pts)` | Shape test for a polygon; pts = [[x, y], ...]. |
| `rectIn` | function | `(x, y, w, h)` | Shape test for a rectangle with its top-left corner at (x, y), w wide and h tall. |
| `Surface` | class | `(w, h)` | A grid of w x h pixels to draw on, all see-through to begin with. |
| `Surface#clear` | method | `()` | Make every pixel see-through again. |
| `Surface#get` | method | `(x, y)` | The packed colour of one pixel; 0 when it is see-through or outside the grid. |
| `Surface#dot` | method | `(x, y, c)` | Set one pixel. |
| `Surface#fill` | method | `(x0, y0, x1, y1, inside, paint, opt = {})` | Fill every pixel whose centre satisfies inside(cx, cy), within a bounding box. opt.shade – depth in px of the shadow band on the far-from-light side (ramp default 1, 0 = flat) opt.light – depth in px of the highlight band on the lit… |
| `Surface#blob` | method | `(parts, paint, opt = {})` | Paint several shape tests as one merged body (see ellipseIn, capsuleIn, polyIn, rectIn). opt.minus: a list of shape tests to cut out of the body (scalloped wing edges, open mouths). |
| `Surface#rect` | method | `(x, y, w, h, paint, opt)` | Rectangle with its top-left corner at (x, y), w wide and h tall. |
| `Surface#ellipse` | method | `(cx, cy, rx, ry, paint, opt)` | Ellipse centred on (cx, cy) with radii rx, ry (all may be fractional). |
| `Surface#capsule` | method | `(x0, y0, x1, y1, r0, r1, paint, opt)` | Thick line with round ends; radius tapers from r0 at the start to r1 at the end. |
| `Surface#limb` | method | `(x0, y0, x1, y1, width, paint, opt)` | A limb exactly `width` pixels thick. |
| `Surface#poly` | method | `(pts, paint, opt)` | Filled polygon; pts = [[x, y], ...]. |
| `Surface#line` | method | `(x0, y0, x1, y1, c)` | 1px line (Bresenham). |
| `Surface#arc` | method | `(cx, cy, r, a0, a1, thick, c, opt = {})` | Part of a ring: centre (cx, cy), radius r, from angle a0 to a1, `thick` px wide. |
| `Surface#outline` | method | `(c, { corners = false } = {})` | Draw a 1px outline around everything drawn so far. |
| `Surface#tint` | method | `(c)` | Replace every drawn pixel with one colour (hit flash). |
| `Surface#blit` | method | `(src, dx = 0, dy = 0)` | Copy another surface on top of this one, skipping its transparent pixels. |
| `Surface#bounds` | method | `()` | Bounding box of drawn pixels, or null when empty. |
| `Surface#bytes` | method | `()` | RGBA bytes, ready for ImageData or a PNG encoder. |

#### `loadout.framework.theme` (`engine/theme.js`)

Bundle-level customisation (architecture.md, Contract 7), the picture side.

| Export | Kind | Arguments or value | What it does |
|---|---|---|---|
| `defaultTheme` | function | `()` | The neutral theme: applying it changes nothing. |
| `normalizeTheme` | function | `(theme = {})` | A complete theme from a partial one (missing blocks and fields take their neutral values). |
| `PALETTES` | constant |  | *(not described yet)* |
| `paletteByName` | function | `(name)` | A built-in palette by name (any letter case), or null. |
| `applyColour` | function | `(pixels, colour)` | Recolour pixels in place and return them. pixels: a Uint32Array in the Surface's byte order (color.js `pack`: r in the low byte, alpha in the high byte), or RGBA bytes (Uint8ClampedArray / Uint8Array). |
| `THEME_PRESETS` | constant |  | Named whole-bundle looks. |
| `assetSeed` | function | `(seed, id)` | A seed for one asset under one theme seed: same inputs, same number; different assets differ. |
| `themedParams` | function | `(sprite, baseParams, theme)` | The controls to render `sprite` with under `theme`. theme.shapes false: `baseParams` itself, unchanged. theme.shapes true: each control nudged from `baseParams` using theme.seed and the sprite's id, so one seed always gives one look and… |
| `randomTheme` | function | `(seed = 0, { shapes = false } = {})` | A tasteful random whole-bundle theme ("Surprise me"). |
| `renderThemedFrame` | function | `(sprite, clip, frame, baseParams, theme)` | Render one frame with the theme's controls and colours. |

#### `loadout.framework.tiles` (`engine/tiles.js`)

The tile helper (docs/style-guide.md, sections 6 and 14).

| Export | Kind | Arguments or value | What it does |
|---|---|---|---|
| `TILE` | constant | `32` | *(not described yet)* |
| `BLOCK_PIECES` | constant | `["left","top","right","side-l","fill","side-r","bottom-l","bottom","bottom-r","inner-tl","inner-tr","inner-bl","inner-br"]` | The 13 pieces of a block, in the layout of style guide section 6 (three rows of three, then the inner corners). |
| `blockClips` | function | `(prefix, opts = {})` | The 13 clip entries of a block: { '<prefix>-left': { frames, fps, loop, label }, ... }. opts.frames (default 1; an animated block gives every piece the same count), opts.fps (number or (p) => number), opts.label (the word shown before… |
| `thinClips` | function | `(prefix, opts = {})` | The three pieces of a thin platform: '<prefix>-thin-l', '-thin-m' (repeats sideways), '-thin-r'. |
| `slopeClips` | function | `(prefix, opts = {})` | The two 45 degree slopes: '<prefix>-slope-up' rises to the right, '-slope-down' falls to the right. |
| `decoClips` | function | `(prefix, places = ['on', 'on'], opts = {})` | Decal clips '<prefix>-deco-a', '-b', ... |
| `pieceOf` | function | `(clip)` | What a clip name says the tile is: { prefix, kind, piece } or null for a name the helper does not know. kind 'block' (piece: one of BLOCK_PIECES), 'thin' (l, m, r), 'slope' (up, down), 'deco' (a, b, ...), 'stack' (cap, mid, foot: things… |
| `blockJoins` | function | `()` | Every pair of block pieces that can sit next to each other in a block: [[a, axis, b], ...] where axis 'x' means a is on the left of b and 'y' means a is above b. |
| `pieceFor` | function | `(around)` | The piece for a cell of a block, from what is around it: around = { N, E, S, W, NE, SE, SW, NW }, each true where there is more of the block. |
| `tileNoise` | function | `(x, y = 0, seed = 0)` | A stable value 0..1 for a pixel that repeats every 32 px both ways. |
| `edgeWave` | function | `(u, seed = 0, cycles = [1, 2, 3])` | A smooth profile 0..1 along an edge that repeats every 32 px: use it for the bumps of an outline (`inset: (u) => Math.round(edgeWave(u, seed) * px)`). cycles: how many waves fit in one tile. |
| `scatter` | function | `(seed, count, { margin = 2, gap = 5, x0 = margin, x1 = M - margin, y0 = margin, y1 = M - margin } = {})` | `count` marks spread over a tile, the same every time: [{ x, y, r }] with whole-number positions `margin` px or more from the tile edge and `gap` px or more apart (r is a spare 0..1 value per mark). |
| `patternFill` | function | `(base, draw)` | A fill made by drawing: `draw(s)` gets a 32x32 Surface already filled with `base` and draws the marks on it with the usual shape calls. |
| `surfaceAt` | function | `(material, x, t = 0)` | The row of the top outline at column x of a top tile (0..3): where something standing on the block touches it. |
| `drawBlock` | function | `(g, piece, material, t = 0)` | Draw one piece of a block on a 32x32 Surface. piece: a name from BLOCK_PIECES ('top', 'inner-tl', ...); a whole clip name ('grass-top') works too. material: see the top of this file. t: the clip phase, passed on to the material for… |
| `drawThin` | function | `(g, part, material, t = 0, opts = {})` | Draw a piece of a thin platform: `thickness` px (default 12) in the top of the tile, see-through below. part: 'l', 'm' or 'r' ('m' repeats sideways). opts.bottom replaces the material's bottom edge for the platform's underside (a cap of… |
| `drawSlope` | function | `(g, dir, material, t = 0)` | Draw a 45 degree slope. dir 'up' rises to the right (its right edge meets a top tile, its bottom edge sits on an inner-tl tile); 'down' falls to the right (top tile on its left, inner-tr under it). |
| `drawTile` | function | `(g, clip, material, t = 0, opts = {})` | Draw whichever block, thin-platform or slope piece a clip name asks for, from one material. |
| `drawDecal` | function | `(g, draw, { ink = INK } = {})` | Draw a decal that stands in the open (a tuft above the top line, a stalactite under the block) with the block's outline round it: `draw(s)` draws on a spare Surface, which is then outlined and pasted on g. |

#### `loadout.framework.ui` (`engine/ui.js`)

Interface helper: nine-slice panels, button states, bars, highlight rows, arrow heads and digits (docs/style-guide.md sections 8 and 14).

| Export | Kind | Arguments or value | What it does |
|---|---|---|---|
| `SLICE` | constant | `8` | The nine-slice border, in pixels from the frame edge: corners and borders end inside it. |
| `EDGE` | constant | `5` | Everything that is not flat lies within this many pixels of a panel's left and bottom edges (one more at the top and right). |
| `SHADOW` | constant | `2` | The drop shadow's offset: down and to the left, because light comes from the top right. |
| `LIP` | constant | `2` | The bottom bevel of a raised button: how far the face travels when pressed. |
| `BUTTON_STATES` | constant | `["normal","hover","pressed","disabled"]` | *(not described yet)* |
| `PANEL_STYLES` | constant | `["plain","ornate","scroll"]` | *(not described yet)* |
| `cornerPx` | function | `(corner = 0.5)` | Slider value (Square 0 .. |
| `borderPx` | function | `(border = 0.5)` | Slider value (Thin 0 .. |
| `roundRectIn` | function | `(x, y, w, h, k = 0)` | Shape test for a rectangle with pixel-art round corners (use with g.fill or g.blob). k is the corner size in pixels, 0 (square) to 4; it is reduced to fit small rectangles. |
| `slice9` | function | `(rect)` | A `slice` entry for a sprite (see the top of this file). slice9() a panel that fills its frame (drawn at 1, 1, W - 2, H - 2): SLICE px on every side. slice9(rect) a panel drawn in its own rectangle inside a bigger frame: that rectangle… |
| `contrast` | function | `(a, b)` | The WCAG contrast ratio of two colours, 1 (the same) to 21 (black on white). |
| `desaturate` | function | `(hex)` | The same colour with no colour in it (a disabled button). |
| `panel9` | function | `(g, x, y, w, h, opt = {})` | A stretchable panel, drawn to fill exactly the rectangle (x, y, w, h), its ink outline and its drop shadow included. |
| `buttonClips` | function | `()` | Clip entries for a button sprite: one frame per state, in the style guide's order. |
| `button` | function | `(g, x, y, w, h, state = 'normal', opt = {})` | A button in one of its four states, in the rectangle (x, y, w, h) (a 96x32 frame: 1, 1, 94, 30). |
| `barOpening` | function | `(x, y, w, h, opt = {})` | The opening of a bar housing drawn in (x, y, w, h): the trough the fill strip fits exactly. opt: border, corner (as panel9), caps (px of solid frame at each end, for ornate ends; default 0). |
| `barHousing` | function | `(g, x, y, w, h, opt = {})` | The empty housing of a bar (a 64x16 frame: 1, 1, 62, 14): the bevel around a dark trough. opt: frame, border, corner, caps (see barOpening), back (the trough colour; default a dark tone made from the frame colour), segments (draw this… |
| `barFill` | function | `(g, opening, value, opt = {})` | The fill strip of a bar, cropped to `value` (0 empty .. 1 full), inside `opening` (from barHousing or barOpening). |
| `highlight` | function | `(g, x, y, w, h, opt = {})` | The highlight behind a chosen row (a menu command, a dialogue choice). |
| `triangle` | function | `(g, cx, cy, size, dir, paint, opt)` | A crisp arrow head: rows `size`, size - 2, ... 1 px long (size is odd), centred on pixel (cx, cy). dir: 'down' \| 'up' \| 'left' \| 'right' is where it points. paint: a colour or a ramp. |
| `glyphGrid` | function | `(w, h)` | A small grid of on/off cells: { w, h, at(x, y), set(x, y, v), box(x0, y0, x1, y1) }. |
| `DIGIT_SIZES` | object | keys: chunky, rounded, slim | Body sizes [width, height] for the three steps of a Size slider, per style. |
| `digitSize` | function | `(size = 0.5, style = 'chunky')` | The digit size for a slider value 0..1 and a style ('chunky' \| 'slim' \| 'rounded'): { w, h, stroke, bar, round }. stroke: the width of the upright strokes; bar: the height of the top and bottom bars (1 px on the 7 px digit, so both… |
| `digitBody` | function | `(n, size)` | The body of digit n (0 to 9) as a glyphGrid, for a size from digitSize(). |
| `rimmed` | function | `(g, body, x, y, opt = {})` | Draw a small glyph the way damage numbers are drawn: the BODY (a glyphGrid, its top left at x, y) in opt.colour; a 1 px RIM of opt.edge all round it, darker below and to the left (away from the light); a 1 px INK line; holes the outside… |

#### `loadout.framework.humanoid` (`rigs/humanoid.js`)

Side-view two-legged character rig (faces right), on a 64x64 canvas.

| Export | Kind | Arguments or value | What it does |
|---|---|---|---|
| `SIZE` | constant | `[64,64]` | *(not described yet)* |
| `GROUND` | constant | `58` | Feet rest on the row above this line |
| `CX` | constant | `28` | Body centre; left of middle so swings in front have room |
| `PIVOT` | constant | `[28,58]` | *(not described yet)* |
| `clips` | function | `(speedOf = () => 0.5, extra = {})` | Standard clip table. |
| `clipsFor` | function | `(names, speedOf = () => 0.5)` | Standard clip entries for the named clips, in the order given, so a character lists exactly the clips it has: |
| `POSES` | constant | `["idle","walk","run","jump","attack","punch","thrust","shoot","cast","block","hurt","die","victory","talk"]` | Every name pose() knows. |
| `dims` | function | `(p = {})` | *(not described yet)* |
| `scaleFrom` | function | `(rest, v, k)` | V moved toward or away from its resting value: k = 1 returns v itself, bit for bit. |
| `pose` | function | `(clip, t, m = {}, d = dims())` | Pose for a clip at phase t (0..1). m: { bounce, stride } 0..1 — how lively and how long the steps are. |
| `solve` | function | `(P, d)` | Joint positions for a pose. |
| `sockets` | function | `(J, P, d, opt = {})` | Named attach points for parts, for one solved pose: { name: { x, y, angle } } in frame pixels. |
| `muzzle` | function | `(J, P, len = 0)` | The muzzle attach point: the tip of a held item of length len (0 = the hand itself), pointing the way the item points. |
| `muzzleFlash` | function | `(g, at, size = 3, colour = '#ffffff')` | The light of a shot: a short ray the way the muzzle points with a small cross behind its tip. |
| `fit` | function | `(P, d, opt = {})` | Keep a pose inside the frame when the body holds something long or wears something tall. |
| `HAIR_STYLES` | constant | `["short","long","spiky","ponytail","bald"]` | Hair styles drawn over the head. |
| `drawHair` | function | `(g, J, P, d, style, hair)` | *(not described yet)* |
| `draw` | function | `(g, P, d, look, hooks = {})` | Paint the character. look: { skin, top, bottom, boots, hair, hairStyle, bareArms } hooks (all optional, each receives (g, J, P, d)): |
| `itemTip` | function | `(J, P, len)` | Tip position of an item of length len held in the front hand. |
| `sword` | function | `(g, J, P, len, metal, hilt)` | *(not described yet)* |
| `axe` | function | `(g, J, P, len, metal, wood)` | *(not described yet)* |
| `spear` | function | `(g, J, P, len, metal, wood)` | *(not described yet)* |
| `staff` | function | `(g, J, P, len, wood, orb, glow = 0)` | *(not described yet)* |
| `ITEM_KINDS` | constant | `["sword","axe","spear","staff"]` | Kinds heldItem() can draw. |
| `ITEMS` | object | keys: sword, axe, spear, staff | Standard sizes of the held items, in pixels, so every character's sword is the same sword: length = hand to tip; back = how far it sticks out behind the hand; pad = how wide its head is. |
| `itemSize` | function | `(kind, scale = 1)` | { length, back, pad } of a kind at a length setting (1 = standard), ready for fit() and heldItem(); null when nothing is held. |
| `holdAngle` | function | `(degrees)` | A "Hold angle" slider in degrees (positive = tipped forward) as the `hold` that pose() takes: forward is a smaller rig angle. |
| `heldItem` | function | `(g, at, item)` | A held item drawn from an attach point and its own settings only, so the same item can go on any body. |
| `slashTrail` | function | `(g, poseAt, t, d, len, colour = '#ffffff', span = 0.16)` | White arc that follows a fast swing. |
| `INK` | constant | `"#231b33"` | *(not described yet)* |
| `farRamp` | function | `(hex)` | A ramp one step darker: use for limbs on the far side of the body. |
| `mix` | function | `(a, b, t)` | Blend two '#rrggbb' colours: t = 0 gives a, t = 1 gives b. |
| `ramp` | function | `(hex)` | Three-tone ramp from one base colour: shadows drift toward blue-violet and get more saturated, highlights drift toward yellow. |

#### `loadout.framework.topdown` (`rigs/topdown.js`)

Top-down two-legged character rig, on a 48x48 canvas: the partner of rigs/humanoid.js for map and room games.

| Export | Kind | Arguments or value | What it does |
|---|---|---|---|
| `SIZE` | constant | `[48,48]` | The frame of every top-down character, [width, height] in pixels. |
| `GROUND` | constant | `42` | The ground line: feet rest on the row above it and their outline lands on it. |
| `CX` | constant | `24` | The pivot column: the standing body is centred on this pixel column. |
| `PIVOT` | constant | `[24,42]` | Where a game anchors the sprite, [x, y]: the ground under the middle of the body. |
| `DIRECTIONS` | constant | `["down","up","side"]` | The three drawn directions, in clip order; the game mirrors `side` (which faces right) for left. |
| `STANDARD` | object | keys: idle, walk, run, attack, shoot, cast, block, dodge, talk, hurt, die | Frames, frames per second at Speed 0.5, and looping of every standard action (style guide, section 4). |
| `clipEntry` | function | `(action, speedOf = () => 0.5)` | The standard clip entry of one action: clipEntry('talk', (p) => p.speed). |
| `clips` | function | `(speedOf = () => 0.5, { action = 'attack', plain = ['hurt', 'die'], walk = true, extra = {} } = {})` | The clip table of a top-down character, in the order section 5 fixes: idle_down, idle_up, idle_side, walk_*, the directed action, then the clips with no direction (drawn facing down and used for every direction). |
| `parseClip` | function | `(name)` | 'walk_side' -> { action: 'walk', direction: 'side' }. |
| `dims` | function | `(p = {}, opt = {})` | Body measurements in whole pixels, from the Height, Build and Head sliders. p: { height, build, head } each 0..1 (missing = 0.5). opt.tall: [shortest, tallest] body in pixels (default [26, 34]; a child passes [22, 27]). |
| `CARRY` | object | keys: up, upright, low, hang | How a held thing is carried at rest: its frame angle per direction (0 = down the picture, PI/2 = right, PI = up). |
| `pose` | function | `(action, direction, t, m = {}, d = dims())` | The pose of an action at phase t (0..1), facing `direction` ('down' \| 'up' \| 'side'); d = dims(p). |
| `solve` | function | `(direction, P, d)` | Joint positions for a pose, in frame pixels. |
| `sockets` | function | `(J, P, d, opt = {})` | Named attach points for parts, for one solved pose: { name: { x, y, angle } } in frame pixels. |
| `fit` | function | `(direction, P, d, opt = {})` | Keep a pose inside the frame when the body holds something long or wears something tall. |
| `over` | function | `(g, inside, box, paint, rim, opt = {})` | Paint a shape that lies over the body, with a 1 px rim of `rim` wherever it covers pixels already drawn: this is what keeps an arm readable against a chest of the same colour. |
| `headIn` | function | `(J, d, grow = 0)` | The outline of the head: a rounded block, 11 to 15 px across. |
| `HAIR_STYLES` | constant | `["short","long","spiky","ponytail","bald"]` | Hair styles drawn over the head. |
| `drawHair` | function | `(g, J, P, d, style, hair, layer = 'front', hatted = false)` | Hair, for the direction in J.dir. layer 'back' is what hangs behind the head (long hair, a ponytail seen from the front or side) and is drawn before the head; layer 'front' is the hair on the head. draw() calls both; a hook may call it… |
| `draw` | function | `(g, direction, P, d, look, hooks = {})` | Paint the character facing `direction`. |
| `ITEM_KINDS` | constant | `["sword","axe","spear","staff"]` | Kinds heldItem() can draw. |
| `ITEMS` | object | keys: sword, axe, spear, staff | Standard sizes of the held items on this body, in pixels, so every top-down character's sword is the same sword: length = hand to tip; back = how far it sticks out behind the hand; pad = how wide its head is. |
| `itemSize` | function | `(kind, scale = 1)` | { length, back, pad } of a kind at a length setting (1 = standard), ready for fit() and heldItem(); null when nothing is held. |
| `itemTip` | function | `(J, P, len)` | Tip of an item of length len held in the weapon hand. |
| `heldItem` | function | `(g, direction, at, item)` | A held item drawn from an attach point and its own settings only, so the same item can go on any body. |
| `slashTrail` | function | `(g, direction, poseAt, t, d, len, colour = '#ffffff', span = 0.21)` | White arc that follows a fast swing. |
| `INK` | constant | `"#231b33"` | *(not described yet)* |
| `brightness` | function | `(hex)` | Perceived brightness of a colour, 0 (black) to 1 (white). |
| `farRamp` | function | `(hex)` | A ramp one step darker: use for limbs on the far side of the body. |
| `mix` | function | `(a, b, t)` | Blend two '#rrggbb' colours: t = 0 gives a, t = 1 gives b. |
| `ramp` | function | `(hex)` | Three-tone ramp from one base colour: shadows drift toward blue-violet and get more saturated, highlights drift toward yellow. |

#### `loadout.framework.analyze` (`sound/analyze.js`)

Measurements of a rendered sound, so an agent (or a test) can check a patch without listening to it.

| Export | Kind | Arguments or value | What it does |
|---|---|---|---|
| `fft` | function | `(re, im)` | Fast Fourier transform, in place: re and im are arrays of the same power-of-two length and are overwritten with the result. |
| `spectrogram` | function | `(samples, size = 1024, hop = 256)` | Magnitude spectrogram: frames[f][bin], linear magnitude. |
| `analyze` | function | `(samples, sr)` | Measure a rendered sound: length, peak and loudness in dB, clipped samples, where the energy sits by band, brightness, how it starts and ends. samples: one channel; sr: its sample rate. |
| `fingerprint` | function | `(samples, sr, seconds, T = 24, B = 20)` | Coarse log-frequency "fingerprint" (time × band, dB) used to measure how different two renders are — e.g. a parameter at its minimum vs its maximum. |
| `fingerprintDistance` | function | `(a, b)` | How different two fingerprints are, as the mean gap in dB over the cells where either one is audible (0 = the same). |
| `critique` | function | `(a, patch)` | Human/agent-readable findings from an analysis. |
| `pulse` | function | `(samples, sr)` | The strongest repeating beats in a render, as tempo candidates: up to four { bpm, strength }, strongest first (half and double tempo show up too). |
| `seam` | function | `(samples)` | How big the sample jump is where a loop wraps, relative to the ordinary sample-to-sample movement just before it. |

#### `loadout.framework.sfx` (`sound/sfx-engine.js`)

Procedural sound-effect engine.

| Export | Kind | Arguments or value | What it does |
|---|---|---|---|
| `FORMAT` | constant | `"sfxpatch/0.1"` | What a patch's "format" field says |
| `PatchError` | class | `()` | The error the engine throws for a patch it cannot run; its message says which field is wrong. |
| `EXPRESSION_FUNCTIONS` | constant | `["sin","cos","tan","abs","sqrt","floor","ceil","round","sign","tanh","exp","log","min","max","pow","clamp","mix","db","midi","semi","step","smooth","rnd"]` | The functions a patch's expressions may call (sin, clamp, lerp, ...), by name. |
| `RESERVED` | object | keys: t, dur, sr, pi, tau, rnd, sin, cos, tan, abs, sqrt, floor, … | Names a control or a node may not use as its id: the built-in values (t, dur, sr, pi, tau, rnd) and the expression functions. |
| `NODE_TYPES` | object | keys: osc, noise, dust, clock, env, ad, seq, pattern, rand, sah, filter, delay, … | Every synthesis block a patch can use, by type name: each has `doc` (what it does) and the fields it takes. |
| `maxSecondsFor` | function | `(patch)` | The longest a render of this patch may be, in seconds: 120 for music, 30 for everything else. |
| `defaultParams` | function | `(patch)` | A patch's controls at their defaults: { id: value }. |
| `createVoice` | function | `(patch, opts = {})` | Builds a playable instance of a patch. tick() returns one mono sample. |
| `renderPatch` | function | `(patch, opts = {})` | Renders a patch. |
| `validatePatch` | function | `(patch)` | Check that a patch is well formed without rendering it: fields, controls, nodes, wiring and expressions. |

#### `loadout.framework.soundTheme` (`sound/theme.js`)

Bundle-level customisation (architecture.md, Contract 7), the sound side.

| Export | Kind | Arguments or value | What it does |
|---|---|---|---|
| `shouldResample` | function | `(patch)` | Whether applySound's `pitch` should be used for this sound. true for sound effects (pitch by resampling); false for music, whose pitch was already applied through its key control by themedSoundParams. |
| `soundSettingsFor` | function | `(patch, theme)` | The settings to hand applySound for this sound under this theme. |
| `dullCutoff` | function | `(k, typicalHz = 0)` | *(not described yet)* |
| `typicalHz` | function | `(channels, sr)` | A sound's typical frequency in Hz: the power-weighted spread of its spectrum (its RMS frequency), from how fast it changes sample to sample. |
| `applySound` | function | `(rendered, sound)` | Apply a theme's sound settings to what renderPatch returned. sound: { pitch (semitones), brightness (-1 duller .. 1 brighter) }. |
| `themedSoundParams` | function | `(patch, baseParams, theme)` | The controls to render `patch` with under `theme`. |

#### `loadout.framework.wav` (`sound/wav.js`)

16-bit PCM WAV encoder.

| Export | Kind | Arguments or value | What it does |
|---|---|---|---|
| `encodeWav` | function | `(input, sampleRate)` | 16-bit PCM WAV encoder. |

#### `loadout.framework.checkSound` (`quality/sound.js`)

The sound and music quality bar as code.

| Export | Kind | Arguments or value | What it does |
|---|---|---|---|
| `THRESHOLDS` | object | keys: silentDb, audibleChangeDb, deadControlDb, cutOffDb, seamFactor, seamJump, tempoTolerance, sameSeedDb, minControls, maxControls, maxMusicControls, nodeSeconds | Every number the sound quality bar judges by (written down in docs/quality-bar.md). |
| `soundType` | function | `(patch)` | What kind of audio a patch is: its meta.type, or from its category: 'sfx', 'ambience', 'jingle' or 'music'. |
| `lengthControl` | function | `(patch)` | The control a music track uses for its length, or null. |
| `instrumentControl` | function | `(patch)` | The control that picks the melody instrument, or null. |
| `writtenTempo` | function | `(patch)` | The tempo the track says it plays at: a "bpm" control's default, or a top-level number. |
| `checkSound` | function | `(patch, { validateMeta } = {})` | Run the sound and music quality bar on a patch. |

#### `loadout.framework.checkSprite` (`quality/sprite.js`)

The sprite quality bar as code.

| Export | Kind | Arguments or value | What it does |
|---|---|---|---|
| `THRESHOLDS` | object | keys: randomLooks, strengthPer, strengthMin, strengthMax, fillWarn, fillError, colours, minControls, maxControls, maxPartControls, feetSlack, loopSeamFactor, … | *(not described yet)* |
| `spriteType` | function | `(def)` | *(not described yet)* |
| `seamCheck` | function | `(A, B, axis)` | Seam test, used for tiles and background layers. |
| `whenAlternatives` | function | `(when)` | A control's `when` as a list of alternatives ("any of these"), each { key: [values] }. |
| `whenHint` | function | `(res, params, dflt)` | The `when` that matches where a control worked, from the tested settings: a key whose values split into some where the control changed the picture and some where it did not. res: { deadIn, aliveIn } (setting names such as 'default',… |
| `checkSprite` | function | `(def, { soundIndex, validateMeta } = {})` | *(not described yet)* |
<!-- generated reference: end -->
