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
await loadout.render('coin', { clip: 'spin', scale: 4 });           // { ok, png, width, height, frames, opaque, ... }
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

## Reference

The full list (every action, every module, every export with its arguments and one-line description) is written by the build to `generated/api.md`, next to `generated/api.json`. It is not kept in git, because it changes with every function added to the framework. Run `node tools/lib/api.mjs` (a tenth of a second) and open it.
