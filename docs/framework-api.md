# The framework and `window.loadout`

This is the guide to Contract 11 of `docs/architecture.md`. Read it before you add to the framework, and before you write anything that drives the live site (an agent in the browser, or an MCP server). This guide is written by hand. The full reference (every function, with its arguments) is written by the build to `generated/api.md`.

## Two layers

1. **The framework** is the code every asset is made with: drawing (`engine/`), body rigs (`rigs/`), sound and music synthesis, analysis and looks (`sound/`), the quality bar (`quality/`), and the metadata rules (`catalog/schema.js`). It starts simple and grows.
2. **The assets** are one file each (`sprites/<id>.js`, `sounds/<id>.json`). An asset file holds only what is particular to that asset. The framework turns it into pixels and samples on demand.

When an asset needs something the framework does not have (a shape, a pose, a pattern, a synthesis block, a measurement), add it to the framework so the next asset can use it. Generic drawing or synthesis code inside an asset file is a review finding.

Everything in the framework is on the page as `window.loadout.framework`, and described in `generated/api.json`. Nobody keeps a list: the build finds the modules by scanning the folders.

## Adding to the framework

### Where a function goes

Put it in the module that already does that job (`engine/fx.js` for effects, `engine/tiles.js` for tiles; there is no code rig to add a body to any more, a body is data). Start a new file only for a new job, directly in `engine/`, `rigs/`, `sound/`, `quality/` or `catalog/`.

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

`app/api.js` puts it on the window when the site loads. That file is small (about 5 KB) and loads nothing else. The first call of any action, or the first look at `framework` or `api`, brings the rest (`app/api-core.js`), which brings what that action needs.

```js
const fw = await loadout.framework;            // the framework: fw.sprite.defineSprite, fw.fx.ring, fw.sfx.renderPatch, ...
const api = await loadout.api;                 // generated/api.json
```

`loadout.framework` and `loadout.api` are fetched on first use. Until one has arrived it is a promise of itself, so always write `await loadout.framework`.

Using the framework directly, in the page:

```js
const { surface, fx, color } = await loadout.framework;
const g = new surface.Surface(32, 32);
fx.ring(g, { t: 0.3, x: 16, y: 16, r1: 12, colours: fx.steps('#e8742a') });
g.data;                                        // Uint32Array, one packed colour per pixel, 0 = see-through
```

### Actions

Every action is async, returns plain data, and never throws. A bad input gives `{ ok: false, errors: ['...'] }`. Each message says what was wrong and what to write instead, in words that need no file of the project to act on. An input that was understood but partly ignored (a setting that does not apply, a key that is not part of a look) comes back with `warnings` that name it.

```js
await loadout.assets.list({ kind: 'sprite', themes: 'fantasy' });   // { ok, total, assets: [rows] }
await loadout.assets.get('knight');                                 // { ok, asset: { ...row, controls, clips } }
await loadout.assets.search('money', { kind: 'sound', limit: 5 });  // { ok, total, assets }
await loadout.assets.similar('coin', 4);                            // { ok, id, assets }
await loadout.assets.remove('my-star');                             // forget an asset made on this visit; { ok, id, kind }

await loadout.make.sprite(definition);     // { id, kind, ok, errors, warnings, kept, replaced }; a loadout-sprite version 2 object or its JSON text
await loadout.make.sound(patchObject);     // { id, kind, ok, errors, warnings, notes, kept, replaced }
await loadout.check('knight');             // { id, kind, ok, errors, warnings, metrics }; also takes a sprite definition or a patch
await loadout.render('coin', { clip: 'spin', scale: 4 });           // { ok, png, artStyle, width, height, frames, opaque, ... }; { artStyle } picks one of the sprite's art styles
await loadout.render('coin-pickup', { style: 'Gem' });              // { ok, wav, seconds, sampleRate, peak, ... }

await loadout.bag.add('knight', { params: { height: 0.8 } });       // { ok, key, count, item, warnings }
await loadout.bag.update('i1', { params: { height: 0.3 } });        // new settings for one item; { ok, key, item, warnings }
await loadout.bag.items();                 // { ok, count, items, look }; an item made on a visit has state: 'ready' | 'needs re-making'
await loadout.bag.remove('i1');            // { ok, count }
await loadout.bag.clear();                 // { ok, count: 0, removed }
await loadout.bag.setLook({ colour: { hue: 40, palette: 'Frost' } });   // { ok, look, warnings }
await loadout.bag.link();                  // { ok, link, length }: an address that opens this bag elsewhere
await loadout.bag.download();              // starts the zip download; { ok, name, bytes, files }
await loadout.go('/sprite/knight');        // { ok, route }
```

The settings of a bag item and the parts of a look are spelled out in each action's input schema (`(await loadout.api).actions`), including the names of the built-in palettes.

### A sprite, start to finish

`make.sprite(definition)` takes one sprite definition: a JSON object of `"format": "loadout-sprite"`, `"version": 2` (or its JSON text). It is the same form as the site's own data files (`sprites/<id>.json`, e.g. `sprites/coin.json`), and **it is data, never code**: shapes, pixel stamps, and the framework's generators and pieces named by id and version with their arguments. Nothing in it runs. Sprite source text (an ES module with `defineSprite` and `render`) is no longer taken anywhere: `make.sprite` and `check` refuse it and say what to hand over instead.

The quickest start is a sprite that is data already. `assets.get(id)` gives its `definition`; change the id, the name, the words and whatever else, and make it:

```js
const coin = (await loadout.assets.get('coin')).asset.definition;
const star = { ...coin, id: 'wish-star', name: 'Wish star',
  blurb: 'A star to collect: it floats, spins and bursts into sparks when taken.',
  meta: { ...coin.meta, words: ['star', 'wish', 'collect', 'pickup', 'bonus', 'sparkle', 'spin'] } };
await loadout.make.sprite(star);           // { id: 'wish-star', kind: 'sprite', ok: true, errors: [], warnings: [], kept: true, replaced: false }
await loadout.render('wish-star', { clip: 'spin', scale: 4 });
```

A definition, in outline (the coin, shortened):

```json
{
  "format": "loadout-sprite", "version": 2,
  "id": "coin", "name": "Coin", "blurb": "A spinning pickup. Make it a gold coin, a shop token or a gem medal.",
  "meta": { "type": "pickup", "role": "items/pickup", "themes": ["fantasy"], "gameTypes": ["platformer"], "view": "front",
            "words": ["coin", "gold", "money", "treasure", "collect", "pickup", "spin"], "license": "draft" },
  "size": [32, 32], "pivot": [16, 30], "grounded": false, "preview": "spin",
  "palette": [ { "id": "metal", "label": "Metal", "default": "#f2c230", "material": "metal", "swatches": ["#f2c230", "#c9ced9"] } ],
  "controls": [ { "key": "size", "kind": "range", "label": "Size", "lo": "Small", "hi": "Big", "default": 0.5 } ],
  "body": { "pictures": {
    "nodes": [ { "id": "coin", "parent": null, "at": [16, 16] } ],
    "draw": [ { "id": "face", "gen": "token", "v": 1, "on": "coin", "size": { "from": "size", "map": [[0, 10], [1, 19]], "round": "px" }, "metal": "metal" },
              { "kind": "outline", "paint": "ink" } ],
    "motion": [ { "gen": "pickup.spin", "v": 1, "node": "coin", "clip": ["spin"] } ] } },
  "clips": { "spin": { "frames": 8, "fps": 10 },
             "collect": { "frames": 8, "fps": 14, "loop": false, "sounds": [{ "sound": "coin-pickup", "frame": 1 }] } }
}
```

What the parts mean:

- **`meta`** is what the catalogue files it under. The allowed values (types, the role tree, themes, game types, views) are data in the framework: `(await loadout.framework).schema`. A wrong value comes back as an error that lists the right ones.
- **`palette`** names the colour slots and what each is made of (`material`, so a look keeps it what it is); a slot with a `label` is a colour control. **`controls`** are the other controls: `range`, `choice`, `toggle`, each with a `key`. The quality bar draws the sprite at both ends of every slider, at every option and with every switch flipped; a control that changes nothing is an error. **`when`** on a control says it only matters sometimes (`"when": { "emblem": ["star", "heart"] }`): the site hides it otherwise, and the bar accepts that it then changes nothing.
- **`body`** says how it is drawn, and is one of the body kinds (`pictures`, `rig`, `emitters`, `panel`, `layers`, `tiles`). Inside it, **generators** are named by `gen` and `v` with their arguments, and an argument can follow a control (`{ "from": "size", "map": [[0, 10], [1, 19]] }`). The generators and pieces are a fixed, documented list in the framework; a name that is not on it is refused, with the names that are. `docs/data-sprites.md` is the design of the format; the `/sprite-forge` skill is the how-to.
- **`clips`** are animations: frames, fps, `loop`, and `sounds` (a sound by id on a frame). A looping clip must draw the same picture at its end as at its start.
- **Limits**: at most 128 KB of JSON and 20 levels of nesting (refused before anything else reads it, and `__proto__`, `constructor` and `prototype` keys are dropped); every count capped (`SPRITE_LIMITS` in `catalog/sprite-schema.js`: 64 clips, 64 frames a clip, 256 frames, 48 controls, frames up to 640 by 360); and a cost budget for what one frame expands to.

### A sound patch

`make.sound(patch)` takes an object (or its JSON text). A patch is data: named controls, a list of sound-making blocks, and expressions that wire them together. Nothing in it is code that runs; expressions are read by the sound engine's own small reader.

```json
{
  "format": "sfxpatch/0.1",
  "id": "wish-chime",
  "name": "Wish chime",
  "category": "pickup",
  "description": "A short bright blip.",
  "meta": { "type": "sfx", "role": "items/pickup", "themes": ["neutral"], "gameTypes": ["platformer"],
            "words": ["chime", "blip", "collect", "pickup", "bonus", "ding"], "license": "draft" },
  "duration": "length + 0.02",
  "params": [
    { "id": "pitch", "label": "Pitch", "min": 300, "max": 2000, "default": 800, "scale": "log" },
    { "id": "length", "label": "Length", "min": 0.05, "max": 0.3, "default": 0.12, "scale": "log" },
    { "id": "buzz", "label": "Buzz", "min": 0, "max": 1, "default": 0.3 }
  ],
  "nodes": [
    { "id": "amp", "type": "ad", "attack": 0.001, "decay": "length", "curve": 3 },
    { "id": "tone", "type": "osc", "wave": "sine", "freq": "pitch" },
    { "id": "edge", "type": "osc", "wave": "square", "freq": "pitch" }
  ],
  "out": "(tone*(1 - buzz) + edge*buzz*0.5)*amp",
  "presets": { "Soft": { "pitch": 500, "buzz": 0 } }
}
```

- **`id`**, **`name`**, **`description`**, **`meta`**: as for a sprite (`meta.type` is `sfx`, `ambience`, `jingle` or `music`; there is no `view`).
- **`category`**: what kind of sound it is (`pickup`, `weapon`, `impact`, `movement`, `ui`, `magic`, `vehicle`, `ambience`). `"category": "music"` makes it a music track.
- **`duration`**: seconds, a number or an expression of the controls. **`loop`**: `true` for a sound that repeats (an ambience, a music track).
- **`params`**: the controls, 3 to 7 of them (up to 10 for music). Each has `id`, `label`, `min`, `max`, `default`; `"scale": "log"` for pitch-like ranges; `"step": n` or `"options": [names]` for a control that is a choice. Every control must change the sound audibly.
- **`nodes`**: the blocks, each with an `id`, a `type` and that type's fields. A field takes a number or an expression. The types: `osc`, `noise`, `dust`, `clock`, `env`, `ad`, `seq`, `pattern`, `rand`, `sah`, `filter`, `delay`, `pluck`, `modal`, `shaper`, `crush`, `reverb`, `lag`, `expr`. What each does and the fields it takes is data in the framework: `(await loadout.framework).sfx.NODE_TYPES`.
- **`out`**: the expression that is the sound; a list of two (`[left, right]`) makes it stereo. Expressions use the control ids, the node ids, the values `t`, `dur`, `sr`, `pi`, `tau`, and the functions in `(await loadout.framework).sfx.EXPRESSION_FUNCTIONS` (`sin`, `clamp`, `mix`, `db`, `midi`, ...).
- **`presets`**: named styles, each a set of control values.
- A music track also needs a `bpm` control (`"unit": "bpm"`), a length control in bars used in `duration`, and a melody-instrument choice. Its check takes minutes.

Make the sound before the sprite that cues it: the sprite's check then finds it by its id.

### How a made sprite is read and drawn

Whoever calls `make.sprite` may not have written the definition, and it can also arrive in a shared link or from the browser's storage. Since build item B11 that needs no sandbox: a definition is data, so nothing in it can run.

- **The plain-data wall comes first.** Text over 128 KB or nested more than 20 levels is refused before it is parsed; `__proto__`, `constructor` and `prototype` keys are dropped wherever they are (`plainSpriteData` in `catalog/sprite-schema.js`). Only then is anything else read.
- **The validator checks every field** (`catalog/sprite-schema.js`): every field typed, every name looked up (palette slots, controls, nodes, stamps, generators and pieces with their versions), every count capped, the cost of a frame under a budget. A definition that does not pass is refused with the validator's words, and nothing of it is kept.
- **The framework draws it on the page** (`engine/data-sprite.js`), with the pieces it names loaded from the site (`engine/pieces.js`). Pages, cards, the bag, the playground and the exporter use it as they use a catalogue sprite.
- **The quality bar runs in the background** (`app/api-worker.js`), so the page keeps answering. It is handed the definition and draws it there with the same framework code. A sprite made on a visit is drawn in the pixel style only (a data sprite lists no other style yet).
- **A download looks again at what it writes.** A bag item's settings are usually ones the bar never drew, so before a made sprite is written the bar runs on exactly the frames about to be written (every frame of every clip at the item's settings). A setting that fails is left out of the package and named with the reason (`refused` in `manifest.json` and in what `bag.download()` returns).
- **The site's content policy** (the `Content-Security-Policy` in `index.html`) allows scripts, workers, connections, images, fonts and styles from the site itself only, and WebAssembly (the search library). No `eval`, no inline script, no script or worker made in memory (`blob:`), no other site.
- **Sound patches are data** and are checked and rendered as before.
- **Old bags and links.** A sprite kept as source text from before sprites were data (`{ source }` in the bag, `{ s }` in a link) is never run: the bag lists it as needing re-making, "made with an older version of Loadout; ask for a new link" (Keyang's DQ2), and leaves it out of the download.

| Limit | Value |
|---|---|
| A definition | 128 KB of JSON, 20 levels of nesting |
| One frame | 640 by 360 pixels |
| Frames in a clip, clips, frames in all | 64, 64, 256 |
| Controls | 48 |
| The quality bar on a sprite | 2 minutes in the background worker |
| The quality bar on a sound effect, on a music track | 60 seconds, 10 minutes |

What remains: **settings nobody looked at.** The bar samples settings (the defaults, both ends of every slider, every option, seeded mixes, the looks). A definition is judged at those, and a download is judged at what it writes, but a page or the playground can show a setting neither drew. This is a risk to what a picture looks like, not to the visitor's machine or data. Firefox and Safari have not been run against the data path (the installed Playwright browsers did not match); it uses JSON, canvas and module workers only.

### Identity in the bag: the `made` token

A sprite made with `make.sprite` carries a **`made` token**: a short hash of the make call (`madeToken` in `app/bag.js`, of the definition the call made). Each bag item of it stores the token. The rules (build item B11b):

- **`make.sprite` changes only the bag items of its own token under its id**: the token of the sprite made under that id on this visit, or this very call's (the definition the bag holds, handed over again). A passing version replaces the definition in every one of them, and they take the new call's token.
- **It never changes anything else.** An id the bag holds for another sprite (one made in the studio, a studio draft's item, a frozen copy, one from a shared link, or this sprite as made on an earlier visit) is refused: `{ ok: false, kept: false }`, and the item is left as it is. After a reload, hand over the version the bag holds first (`assets.get(id)` gives its `definition`); a new version made after that reaches its items.
- **Two different definitions never share an id in one bag.** Items share an id only when they carry the same token and hold the same definition. One that comes in under an id another definition holds (a link, storage, the studio) gets a free id (`<id>-2`, ...), as a studio sprite does, and numbered it is a sprite of its own: it loses its token. Of items that already share an id wrongly (stored, or written by another tab), the first keeps it.
- **What the bag shows is what it downloads.** The site registers, under each id, the definition of the bag item that holds it (`app/bag.js` `followStudio`, `app/catalog.js` `addStudioSprite`); a sprite made on this visit holds its id against any other definition, which the bag then numbers.

### What an asset made on a visit can do

Once made, it behaves like a catalogue asset until the page is left. `app/api-core.js` keeps it in a registry and hands it to `app/catalog.js` (`addRuntimeAsset(row, definition)`) and, for a sound, to `app/audio.js` (`addSound(patch)`), so `assetById`, `loadSprite`, `loadSound` and `soundById` answer for it. Nothing else on the site has code of its own for these assets.

- **Listed and found**: `assets.list`, `assets.get`, `assets.search` and `assets.similar` include it, with `runtime: true`. (The site's own browse view and search box list the built catalogue only.)
- **Pages**: `go('/sprite/<id>')`, `/sound/<id>`, `/music/<id>` open it, and every control works. The build never drew it, so its row has no pictures (`thumb: null`) and cards draw it live. On its page, what one more click could ask for (each option of a choice, each switch, each other art style) is drawn ahead, so a click shows at once; a slider shows the last look for the millisecond its new frames take.
- **Drafts**: one that fails the quality bar is kept as a draft (`ok: false`, with its `errors` in its row). A draft can be rendered and has a page, which says what to fix, but it cannot go in the bag: `bag.add` refuses it and its page has no "Add to bag". Warnings do not block. Make it again under the same id to replace it.
- **The bag**: `bag.add(id, settings)` stores the item with its whole definition (`definition: { data }` and the `made` token for a sprite, `{ patch }` for a sound or a track).
- **The bag keeps what passed.** Making an asset again with a passing version updates its bag items (for a sprite, those of its token: see above). Making it again with a failing version while it is in the bag is refused (`ok: false`, `kept: false`): the asset and the bag stay as they were.
- **A failed save is reported.** When the browser's storage for the site is full, `bag.add`, `bag.update` and `bag.setLook` answer `ok: false` and change nothing, and the bag page says that the bag could not be saved.
- **After a reload, or from a link, nothing is trusted.** (The bag page tells a visitor this in plain words: an item that came broken from a link says to ask the sender for a new one, with what the check found folded under "Details". The `errors` and `reason` in `window.loadout` results are the checker's own words, for whoever can re-make it.) A stored definition is text that anyone could have put there. A sprite's is data: the bag and the catalogue put it through the plain-data wall and the validator again before it is drawn, and one that does not pass is left out. A sound's patch is put through the whole quality bar again, in a worker, with the same limits, after the site has drawn its pages. Until then it is "checking" (`bag.items()` waits for this). One that passes is known to the site again. One that fails, or runs over a limit, **needs re-making**: the bag page lists it by name with the reason, `bag.items()` gives it `state: 'needs re-making'` and `reason`, and nothing of it is drawn or exported.
- **A shared bag link** carries the definitions too (a sprite as `{ d: data, m: token }`; such a link is deflated), and what arrives is checked as above. A link is limited to 8,000 characters (`LINK_LIMIT` in `app/bag.js`), because chat and mail apps cut longer ones short; over that, "Copy link" and `bag.link()` explain and point at the download.
- **The playground** takes it from the bag like anything else: a pickup is collected and its cued sound plays.
- **The download** holds what the bag stored. A made item goes in only when its own definition is the one that was checked, and its frames at the item's settings pass the bar when they are about to be written (otherwise it is named under `refused`); its sheet, JSON and WAV files are then made as for any asset, and its definition goes in next to them: a sprite's as `sprites/<id>/<id>.sprite.json` (`<id>.json` is the sheet's animation list; its manifest entry has `madeIn` and `source`, the path of that file), a sound's as `sounds/<id>.source.json` (its entry has `madeOnThisVisit: true` and `source`). Items that need re-making are left out and named: `needsRemaking` in the manifest and in what `bag.download()` returns.
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

The framework functions are not tools. An agent uses them by naming the framework's generators and pieces in a sprite definition for `make_sprite` (data, as above), or by evaluating code of its own in the page against `await loadout.framework`. `(await loadout.api).modules` is what to show the agent so it knows what exists; the two sections above ("A sprite, start to finish" and "A sound patch") are what to show it so it knows what to write.

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

## Rigs

**R2 (2026-11-21): the code rigs that draw are deleted** (`docs/data-sprites.md` section 5, Contract 15 rule 11): `rigs/topdown.js` with `topdown-riot.js`, `topdown-sneak.js` and `topdown-describe.js`, `creature-topdown.js`, `quadruped.js`, `crawler.js`, `bigbody.js`, `hive-bug.js`, `brood-queen.js`, `guard-bot.js`, `mech-walker.js`, `kiosk.js` and `kiosk-describe.js`, and `tools/rig.mjs` (the tables and contact sheets of a rig's description) with the `rig-describe-*` tests. A body is a bone rig in data (`rigs/bones.js` draws it, `rigs/keypose.js` poses it, `rigs/studio-templates.js` starts one) or a base piece in `pieces/`; **to see what a body offers, run `node tools/piece.mjs` (every piece, its slots and arguments) and `node tools/piece.mjs <kind:name> --sheet` (a contact sheet), and read the generators with `node skills/sprite-forge/context.mjs generators`.**

What is still code: the side-view person. `rigs/humanoid.js` and `rigs/humanoid-figure.js` draw it, `rigs/humanoid-describe.js` (the one description left, `RIG`; in `generated/api.json` under `rigs`, and `(await loadout.framework).humanoidDescribe.RIG` on the page) lists its poses and parts. No test proves that description true any more (`rig-describe-*` went with the tool). The three files stay only while their last callers do: five frozen copies and the tests that read them, `tools/bake-person-side.mjs`, and `engine/data-rules.js`, which takes `apart` (a colour rule) from the figure module. Do not add to them; a new part of the side-view person is a piece (`pieces/part-*.json`).

## Studio definitions: what a definition may name

A studio definition (`loadout-sprite`, `docs/studio.md` section 2.3; Contract 14) is data and never holds code. Where a definition needs framework code it names it from a fixed list, the same way it names a rig (Contract 14 rule 2, amended in studio item F1). The list, on `loadout.framework` under its module's name:

| Export | Module | What it lists |
|---|---|---|
| `COLOUR_RULES` | `engine/data-rules.js` | The colour rules a data sprite's colour may name (`{ "rule": ... }`), with their arguments: `tone`, `mix`, `standOut` (engine/color.js `pick`), `apart`, `bandTone`, `ramp`, `choose`. `paintColour(expr, settings)` and `paintFigure(figure, paint, settings)` work one out; they never throw |

A new rule is a framework addition (Contract 11): an entry in `COLOUR_RULES`, its argument check in `catalog/studio-schema.js`, and a test in `tests/unit/data-rules.test.mjs` that it equals the function it names. A data sprite (`engine/data-sprite.js`) has no `sprite.made`: that field means a sprite made on this visit and drawn in a worker; where a data sprite came from is `sprite.definition.made`.

### Library bodies: removed (build item R1)

A library body was a code rig with a data layer (`body: { library: "<name>", figure: {...} }`), described by a descriptor (`defineLibraryBody()`) and listed in a registry, so that a new body was "its own module plus one line". That path is gone (`docs/data-sprites.md` section 5, Contract 15): `engine/library-body.js`, `engine/library-bodies.js`, `rigs/body-humanoid.js`, `rigs/humanoid-studio.js` and `app/studio/library-body.js` are deleted, with the tables `FIGURE_SETTINGS`, `FIGURE_COLOURS`, `FIGURE_SOCKETS`, `FIGURE_BLOCKS`, `LIBRARY_PARTS`, `HUMANOID_POSE_FIELDS` and `HUMANOID_MOVE_FIELDS`, `paintFigure`, and `studio.bake`. Nothing replaces "a new body is a new module": a new kind of character is a data sprite on a base piece (`pieces/`), written through the `/sprite-forge` skill; a missing capability is a new generator or piece (Contract 15 rule 8).

A version 1 definition that still names a library body is refused with `LIBRARY_BODY_GONE` (`catalog/studio-schema.js`: "This sprite used a library body, which is gone: open the library sprite and edit a copy."). `usedLibraryBody(def)` finds one without running anything; the studio keeps such a saved draft, lists it and opens it as that note (`app/studio/drafts.js gone()`, `app/studio/home.js gonePage`), and `window.loadout.studio` lists it as `damaged` with the same words. The test seed is `tests/fixtures/studio/waving-hero.json` and `f1-rogue.json`.

### Where a data sprite came from

`made: { in: "studio", from: "new" | "template:<id>" | "library:<id>" }` for a sprite made in the studio; its library file starts `// Made in the Loadout studio.` (`STUDIO_HEADER`). `made: { in: "library", from: "code:<id>" | "new" }` for a library sprite converted from its code file to data (or written as data by hand); its file starts `// Converted from code to data for the Loadout library.` (`LIBRARY_HEADER`). The writer picks the header from `made.in` (`headerFor`), the reader refuses a header that says otherwise, and both forms are otherwise the same: one comment, one import, `export default dataSprite(<JSON>);`, refused by the build with anything else in it (`catalog/data-file.js`, `tools/lib/data-file.mjs`, the same code). A converted file sets `made: { in: "library", from: "code:<its id>" }`.

## Reference

The full list (every action, every module, every export with its arguments and one-line description) is written by the build to `generated/api.md`, next to `generated/api.json`. It is not kept in git, because it changes with every function added to the framework. Run `node tools/lib/api.mjs` (a tenth of a second) and open it.
