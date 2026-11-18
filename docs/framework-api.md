# The framework and `window.loadout`

This is the guide to Contract 11 of `docs/architecture.md`. Read it before you add to the framework, and before you write anything that drives the live site (an agent in the browser, or an MCP server). This guide is written by hand. The full reference (every function, with its arguments) is written by the build to `generated/api.md`.

## Two layers

1. **The framework** is the code every asset is made with: drawing (`engine/`), body rigs (`rigs/`), sound and music synthesis, analysis and looks (`sound/`), the quality bar (`quality/`), and the metadata rules (`catalog/schema.js`). It starts simple and grows.
2. **The assets** are one file each (`sprites/<id>.js`, `sounds/<id>.json`). An asset file holds only what is particular to that asset. The framework turns it into pixels and samples on demand.

When an asset needs something the framework does not have (a shape, a pose, a pattern, a synthesis block, a measurement), add it to the framework so the next asset can use it. Generic drawing or synthesis code inside an asset file is a review finding.

Everything in the framework is on the page as `window.loadout.framework`, and described in `generated/api.json`. Nobody keeps a list: the build finds the modules by scanning the folders.

## Adding to the framework

### Where a function goes

Put it in the module that already does that job (`engine/fx.js` for effects, `engine/tiles.js` for tiles, `rigs/humanoid.js` for the side-view body). Start a new file only for a new job, directly in `engine/`, `rigs/`, `sound/`, `quality/` or `catalog/`.

A `.js` file in one of those five folders is a framework module when it exports something and runs anywhere: its code must not use a page (`window.`, `document.`), a worker's message port (`self.onmessage`, `postMessage`) or Web Audio (`AudioContext`, `AudioWorklet`). That is why `sound/sfx-engine.js` is framework and `sound/player.js`, `sound/worklet.js` and `sound/render-worker.js` are not. A file whose name starts with `_` is skipped. If the test gets a file wrong, put `// loadout: framework` or `// loadout: not framework` in its first 12 lines.

A module's short name on `loadout.framework` comes from its file name by one rule: drop `.js` and a trailing `-engine`, make it camelCase; modules in `quality/` get `check` in front; if two would still share a name, the one in the later folder (`engine`, `rigs`, `sound`, `quality`, `catalog`) gets its folder name in front. So `engine/fx.js` is `fx`, `sound/sfx-engine.js` is `sfx`, `sound/theme.js` is `soundTheme`, `quality/sprite.js` is `checkSprite`, `catalog/schema.js` is `schema`.

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
- **`tests/unit/api-generator.test.mjs`** checks that what the generator writes matches the real exports: nothing stale, nothing missing, and every framework module loads.

### How it shows up

Run `node tools/build.mjs` (its `framework` step), or just `node tools/lib/api.mjs`. That writes three files, none of them kept in git:

| File | What |
|---|---|
| `generated/api.json` | Every module (`name`, `file`, `purpose`) and every export (`name`, `kind`, `args`, `description`, `doc`; `value` for small constants, `keys` for objects, `methods` for classes), plus `actions` |
| `generated/framework.js` | One module that re-exports every framework module under its short name |
| `generated/api.md` | The same description as a page to read: every action, module and export in tables |

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
await loadout.assets.remove('my-star');                             // forget an asset made on this visit; { ok, id, kind }

await loadout.make.sprite(sourceText);     // { id, kind, ok, errors, warnings, kept, replaced }
await loadout.make.sound(patchObject);     // { id, kind, ok, errors, warnings, notes, kept, replaced }
await loadout.check('knight');             // { id, kind, ok, errors, warnings, metrics }; also takes source text or a patch
await loadout.render('coin', { clip: 'spin', scale: 4 });           // { ok, png, artStyle, width, height, frames, opaque, ... }; { artStyle } picks one of the sprite's art styles
await loadout.render('coin-pickup', { style: 'Gem' });              // { ok, wav, seconds, sampleRate, peak, ... }

await loadout.bag.add('knight', { params: { height: 0.8 } });       // { ok, key, count, item }
await loadout.bag.items();                 // { ok, count, items, look }
await loadout.bag.setLook({ colour: { hue: 40 } });
await loadout.bag.download();              // starts the zip download; { ok, name, bytes, files }
await loadout.go('/sprite/knight');        // { ok, route }
```

**`make.sprite(source)`** takes one ES module as text, written exactly like a file in `sprites/`: it imports the framework by its usual relative paths and ends in `export default defineSprite({ ... })`. The import addresses are rewritten to full addresses of this site and the text is loaded as a module from memory. An import from another site, a bare package name, a `data:` or `blob:` address, or an `import()` whose address is not plain text, is refused with the line number. This keeps a sprite's imports to the site's own files; it is not a sandbox, because the source still runs in the page.

The id must not be one the catalogue uses. The quality bar (Contract 10) runs on it and its errors and warnings come back; `ok` is true when there are no errors.

**`make.sound(patch)`** takes the patch object (or its JSON text). A patch the engine cannot run at all is not kept (`kept: false`). Make the sound before the sprite that cues it: the sprite's check then finds it.

**The quality bar runs in a background worker.** A sprite's check takes from a tenth of a second to several seconds (measured 2026-11-18: the Hero 0.5 s and the forest backdrop 0.6 s in Chromium on a quiet machine, up to 8 s on a busy one) and a music track's takes minutes. The page stays responsive meanwhile: the longest stall measured during those checks was 38 ms. In a browser with no module workers the check runs on the page instead, and its verdict carries a warning that says so.

### What an asset made on a visit can do

Once made, it behaves like a catalogue asset until the page is left. `app/api.js` keeps it in a registry and hands it to `app/catalog.js` (`addRuntimeAsset(row, definition)`) and, for a sound, to `app/audio.js` (`addSound(patch)`), so `assetById`, `loadSprite`, `loadSound` and `soundById` answer for it. Nothing else on the site has code of its own for these assets.

- **Listed and found**: `assets.list`, `assets.get`, `assets.search` and `assets.similar` include it, with `runtime: true`. (The site's own browse view and search box list the built catalogue only.)
- **Pages**: `go('/sprite/<id>')`, `/sound/<id>`, `/music/<id>` open it, and every control works. The build never drew it, so its row has no pictures (`thumb: null`) and cards draw it live.
- **Drafts**: one that fails the quality bar is kept as a draft (`ok: false`, with its `errors` in its row). A draft can be rendered and has a page, which says what to fix, but it cannot go in the bag: `bag.add` refuses it and its page has no "Add to bag". Warnings do not block. Make it again under the same id to replace it.
- **The bag**: `bag.add(id, settings)` stores the item with its whole definition (`definition: { source }` for a sprite, `{ patch }` for a sound or a track). That is what brings the asset back: when the site starts, `restoreRuntime()` in `app/api.js` makes every such bag item known again before the first page is drawn. It is not checked a second time (`loadout.check(id)` does that). Making an asset again updates the definition in its bag items.
- **A shared bag link** carries the definitions too. A sprite's definition is a program, so a link that holds one is never opened silently: the bag page says so and waits for the visitor to agree. A link is limited to 8,000 characters (`LINK_LIMIT` in `app/bag.js`), because chat and mail apps cut longer ones short; over that, "Copy link" explains and points at the download. Measured: a small pickup (2,800 characters of source) and its sound make a link of 6,700 characters, so a bag with more than one or two made assets is shared as a download, not a link.
- **The playground** takes it from the bag like anything else: a pickup is collected and its cued sound plays.
- **The download**: its sheet, JSON and WAV files are made as for any asset. Its source goes in next to them (`sprites/<id>/<id>.source.js`, `sounds/<id>.source.json`), and its entry in `manifest.json` has `madeOnThisVisit: true` and `source` (the path of that file).
- **`assets.remove(id)`** forgets it. It refuses a catalogue asset, and an asset that is still in the bag.

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

## Styles

A style is one way to draw and export a sprite (Contract 12 of `docs/architecture.md`). The site has one, `pixel`, and every sprite has it. The registry is `engine/styles.js`; every renderer and exporter goes through it. No real sprite has a second style yet: what follows was proven with two test styles in `tests/fixtures/styles/styles.js`, which are the worked examples to copy from.

### What a style is made of

```js
import { defineStyle, pngSheet } from '../engine/styles.js';

defineStyle({
  id: 'flat',                                  // what a sprite writes in `styles`, and what links and files carry
  label: 'Flat shapes',                        // the name on the site
  about: 'Clean shapes in solid colours.',     // one plain sentence, shown under the choice
  makeSurface: (width, height, options) => new Surface(width, height),      // 1. the surface
  finish: (surface, context) => { ... },       // 2. the finish (optional)
  exporters: { sheet: pngSheet },              // 3. the exporter
  // only when the surface is not a pixel grid:
  toPixels: (surface) => aPixelSurface,        // what the site previews and the quality bar looks at
  recolour: (surface, apply) => { ... },       // how a whole-bundle look reaches it
});
```

| Part | What to write | The two test styles |
|---|---|---|
| **Surface** | `makeSurface(width, height, options)` returns a new surface for one frame. `options` is the frame being drawn: `{ clip, t, frame, frames, loop, p, style }`. Use `new Surface(width, height)` for a style that keeps the pixel grid. Any other surface answers the same calls as `engine/surface.js`'s `Surface` (the table in Contract 12 lists them and which can carry over); a call it cannot carry should do nothing and return the surface, and reading pixels (`data`, `get`, `bounds`, `bytes`) should throw with a plain message | `silhouette`: the pixel surface. `outline-svg`: `ShapeRecorder`, which keeps `ellipse`, `capsule`, `limb`, `poly`, `arc`, `rect` and `outline` as a list and drops the rest |
| **Finish** | `finish(surface, context)` runs after the sprite has drawn a frame. Change the surface in place, or return another. `context` is `options` plus `sprite`. Leave it out when the sprite's own drawing is the finished frame, as in `pixel` | `silhouette`: `surface.tint(INK)`, every drawn pixel one colour. `outline-svg`: none |
| **Exporter** | `exporters.sheet(sprite, params, options)` returns, or resolves to, `{ files: [{ name, bytes, type }], data }`. `files` are the pictures; `data` is the JSON that ships with them and must keep `animations` (the export times sounds from it). `options`: `{ style, scale, clips, recolour, encodePng }`. Call `renderSheet(sprite, params, { scale, clips, style })` for the frames and their JSON; when the style is not a pixel grid it returns `surfaces` (each frame as the style drew it) and no sheet picture. A style on the pixel grid uses `pngSheet` as it is | `silhouette`: `pngSheet`. `outline-svg`: one `frames/<clip>_<n>.svg` per frame, and each frame of the JSON gets `file` |
| **Pixel picture** and **look** | `toPixels(surface)` and `recolour(surface, apply)`, where `apply` recolours a `Uint32Array` of packed colours in place. Both are required in practice for a surface that is not a pixel grid: without the first the site cannot preview the sprite and the quality bar cannot look at it; without the second a bag's look does not reach it | `outline-svg`: `replay` draws the recorded shapes on a `Surface`; `recolour` maps each shape's colour |

A style registers itself when its file is loaded. Put a real style in its own module in `engine/` and import that module at the end of `engine/styles.js`, so it is known everywhere the engine is (the build then lists it in `generated/api.json` under `styles`, and it is in the quality bar's cache key). The test styles are deliberately not imported there: a sprite that lists one imports the style's file itself.

### How a sprite opts in

```js
export default defineSprite({
  id: 'blob', ...
  styles: ['pixel', 'flat'],                   // best first; left out means ['pixel']
  render(g, { clip, t, p, style }) {
    g.ellipse(CX, cy, r, ry, BODY);            // the body: shape calls, shared by every style
    // the detail layer: the pixel version is the usual case, and other styles branch off it
    if (style === 'flat') g.ellipse(CX - 2.5, ey, 1, 1.4, INK);       // a drawn eye
    else g.dot(CX - 3, ey, INK);                                       // a one-pixel eye
    g.outline(INK);
  },
});
```

- List a style only if the sprite reads well in it. A sprite drawn mostly with single pixels (`dot`, `line`) does not list a style whose surface drops them; the site then never offers that style for it.
- Branch on `ctx.style` for the detail layer only (eyes, highlights, trim), and keep the pixel branch as the `else`, so the pixel drawing is never at risk.
- A control may have the key `style`. The chosen art style never uses that name where a control's key can appear: it is `artStyle` in a bag item, in `loadout.render` and `loadout.bag.add`, in the sheet JSON and the manifest, and `artstyle=` in a page link. Inside `render(g, ctx)` the art style is `ctx.style` and a control called `style` is `ctx.p.style`.
- Asking for a style a sprite does not list is an error everywhere (`renderFrame`, `renderSheet`, `exportSheet`, `loadout.render`, `loadout.bag.add`); nothing falls back to another style.

### What it costs

- **The quality bar runs once per listed style**, on that style's pixel picture, and the sprite must pass in each. Its messages name the style: `style "flat": hop frame 2 / all-high: drawing touches the frame edge`. The checking time is multiplied by the number of styles.
- **Every control must change the picture in every listed style.** A colour control does nothing in a one-colour finish, and that is an error for that style. There is no way yet to declare a control for some styles only, so such a sprite cannot list such a style.
- **Read-backs lock a sprite to the pixel grid.** A sprite, or a rig it uses, that reads pixels back (`g.get`, `g.bounds`, `g.data`) or pastes its own pixel layer (`new Surface`, `blit`, `tilt`, `lean`) cannot be drawn on a surface that keeps shapes. The bar warns when the sprite's own code reads back from the surface it is handed ("draws outside the surface's calls", with the file and line); it does not see reads from a layer the sprite made itself. `rigs/humanoid.js` reads pixels back too, so today no sprite on that rig can take such a style.
- **The exports differ.** A pixel sheet's JSON has no `artStyle` (a file without it is pixel, so nothing made before styles changed); any other style's JSON, and its entry in a package's `manifest.json`, says `artStyle`.

On the page: `loadout.render(id, { artStyle })` draws in an art style, `loadout.bag.add(id, { artStyle })` stores it, `(await loadout.api).styles` lists what is registered, and `(await loadout.assets.get(id)).asset.styles` is what one sprite offers.

## Reference

The full list (every action, every module, every export with its arguments and one-line description) is written by the build to `generated/api.md`, next to `generated/api.json`. It is not kept in git, because it changes with every function added to the framework. Run `node tools/lib/api.mjs` (a tenth of a second) and open it.
