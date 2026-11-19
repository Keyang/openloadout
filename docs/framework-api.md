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

await loadout.make.sprite(sourceText);     // { id, kind, ok, errors, warnings, kept, replaced }
await loadout.make.sound(patchObject);     // { id, kind, ok, errors, warnings, notes, kept, replaced }
await loadout.check('knight');             // { id, kind, ok, errors, warnings, metrics }; also takes source text or a patch
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

`make.sprite(source)` takes one ES module as text. This one is complete: it passes the quality bar as it stands.

```js
// A star to collect: it floats, and bursts into sparks when taken.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, wave, clamp, TAU } from '../engine/motion.js';
import { ramp, INK } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { sparkles, particles, steps } from '../engine/fx.js';

const P = PALETTE.thornwood;
const CX = 16, CY = 16;
const star = (cx, cy, r, points, turn) => Array.from({ length: points * 2 }, (_, i) => {
  const a = turn + (i * TAU) / (points * 2), d = i % 2 ? r * 0.48 : r;
  return [cx + Math.sin(a) * d, cy - Math.cos(a) * d];
});

export default defineSprite({
  id: 'wish-star',                         // lowercase letters, digits, dashes; not an id the catalogue uses
  name: 'Wish star',
  kind: 'Item',
  blurb: 'A star to collect. It floats, and bursts into sparks when it is taken.',
  meta: { type: 'pickup', role: 'items/pickup', themes: ['fantasy'], gameTypes: ['platformer'], view: 'front',
          words: ['star', 'wish', 'collect', 'pickup', 'bonus', 'treasure', 'sparkle'], license: 'draft' },
  size: [32, 32],                          // one frame, in pixels
  pivot: [16, 28],                         // where it touches the ground
  grounded: false,                         // it floats
  preview: 'idle',
  sounds: { collect: [{ sound: 'wish-chime', frame: 0 }] },      // a sound (by id) on a frame of a clip
  params: {                                // the controls a person sees; every one must change the picture
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    points: choice('Points', 'five', ['four', 'five', 'six']),
    colour: color('Colour', swatches('thornwood', 'gem')[4], swatches('thornwood', 'gem')),
    glint: toggle('Glints', true),
    bob: range('Float', 0.5, { lo: 'Still', hi: 'Floaty', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {                                 // fps may be a number, or a function of the settings
    idle: { frames: 8, fps: (p) => 8 * lerp(0.65, 1.45, p.speed), loop: true },
    collect: { frames: 6, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false },
  },
  // g: the frame to draw on. clip: which animation. t: how far through it, 0..1. p: the settings.
  render(g, { clip, t, p }) {
    const n = { four: 4, five: 5, six: 6 }[p.points];
    const full = lerp(7, 11, p.size);
    const m = ramp(p.colour);
    if (clip === 'idle') {
      const cy = CY - Math.round(lerp(0, 2, p.bob) * wave(t));
      g.poly(star(CX, cy, full, n, 0), m, { shade: 1, light: 1 });
      g.outline(INK);
      if (p.glint) sparkles(g, { t, count: 3, seed: 5, big: false, colours: steps(P.gold), area: [CX - 12, CY - 13, CX + 13, CY + 12] });
      return;
    }
    // collect: the star shrinks away while sparks fly out and settle (no frame of a clip may be empty)
    const r = full * (1 - clamp(t * 1.4));
    if (r > 2) { g.poly(star(CX, CY, r, n, t * 2), m, { shade: 1, light: 1 }); g.outline(INK); }
    particles(g, { t, x: CX, y: CY, count: 8, seed: 2, loop: false, arc: TAU, dist: lerp(8, 12, p.size), size: 2, colours: steps(p.colour) });
    if (p.glint && t < 0.5) sparkles(g, { t, count: 2, seed: 9, big: false, colours: steps(P.gold), area: [CX - 8, CY - 8, CX + 9, CY + 9] });
  },
});
```

What the parts mean:

- **Imports** are the framework, by relative path as if the text were a file in the site's `sprites/` folder: `'../engine/...'`, `'../rigs/...'`. `(await loadout.api).modules` lists every module with its file and every function with its arguments. Nothing else can be imported: an address on another site, a package name, a `data:` or `blob:` address, or an `import()` whose address is not plain text, is refused with its line number before the source is read.
- **`meta`** is what the catalogue files it under. The allowed values (types, the role tree, themes, game types, views) are data in the framework: `(await loadout.framework).schema`. A wrong value comes back as an error that lists the right ones.
- **Controls** are made with `range`, `choice`, `color` and `toggle`. The quality bar draws the sprite at both ends of every slider, at every option and with every switch flipped; a control that changes nothing is an error.
- **`when`** says that a control only matters sometimes. It goes in the control's options and maps other control keys to the values at which this one is in effect: `inlay: color('Emblem colour', '#c9423a', [...], { when: { emblem: ['star', 'heart'] } })` is in effect only while `emblem` is `'star'` or `'heart'`. Every key listed must match. A list of such objects means any one of them is enough: `when: [{ weapon: ['sword'] }, { headgear: ['helmet'] }]`. A control named in a `when` must itself be in effect for the condition to hold. The site hides a control that is not in effect, and the quality bar then accepts that it changes nothing; a control that does nothing at some setting and does not say so with `when` is an error. An entry of `sounds` may carry the same `when`, to play only at those settings.
- **`parts`** (not used above) groups the controls of something the sprite holds or wears: `parts: { weapon: { label: 'Weapon', params: ['weapon', 'weaponLength'], none: 'none' } }`. The first key is the selector; at its `none` value the part is off and its other controls are not in effect.
- **Clips** are animations. `t` runs 0 to 1 over a clip; a looping clip must draw the same picture at `t = 0` and `t = 1`.
- **`render`** draws one frame with the calls of a `Surface` (`g.poly`, `g.ellipse`, `g.rect`, `g.limb`, `g.outline`, ...) and the helpers (`fx`, `tiles`, `backdrop`, `ui`, the rigs). It must be a pure function of `clip`, `t` and `p`: no random numbers, no clock.

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

### Where a made source runs, and what it may do

A sprite's source is a program, and whoever calls `make.sprite` may not have written it (it can also arrive in a shared link). So it **never runs in the page**.

- **It runs in a worker of its own** (`app/sandbox-worker.js`), one per made sprite, which the page starts from memory and can stop at any moment. Before the source is read, the worker's ways to the network, to the site's storage, to other workers and to the page are taken away; what is left is the framework the source imports, and arithmetic. Code that reaches for `window`, `document`, `localStorage` or `fetch` stops with an error, which `make.sprite` returns.
- **The page gets pixels and data, never functions.** The worker sends what the sprite says about itself (its controls, clips, metadata) as data, which the page checks field by field, and then frames as pixels. The page builds an ordinary sprite definition from that data (`app/made.js`), whose `render` copies those pixels in. Pages, cards, the bag, the playground and the exporter use it as they use a catalogue sprite. Catalogue sprites are untouched: they draw on the page as before.
- **Art styles** (see "Styles" below). A made sprite may list several. For the pixel style the worker sends pixels. For a style whose surface is not a pixel grid it sends what the sprite drew on that surface as plain data: numbers, lists, and short text with nothing in it that could close a tag or a quote. The page checks it, copies it onto a surface of its own and runs the style's finish and exporters itself. A style is framework code: the page loads the site files the source imports (never the source) so that it knows the style, and imports are kept inside the site's own folder.
- **Frames are cached by settings.** A setting that is not there yet is asked for and the last look drawn stands in until it arrives (about a millisecond for a small sprite). Code that draws once and keeps the result (the exporter, the playground) first waits for `sprite.prepare(settings)`, or `sprite.whenReady()`.
- **The quality bar never runs next to the source.** The sprite's worker only loads and draws. The bar (`checkSprite`, unchanged) runs in the site's other background worker (`app/api-worker.js`), which never loads a made source, on a sprite that draws only frames it has been handed (`suppliedSprite` in `app/made.js`). It says which settings it looked at and had no frames for; the page has the sprite's worker draw those, as ordinary drawing requests (the same message a page sends when it draws, so the source cannot tell a check from a draw); and the bar runs again, until it has seen everything it asks for (two rounds and about 80 settings for a small sprite). Those frames stay on the page by settings, so what is shown later at those settings is what was judged.
- **A download looks again at what it writes.** A bag item's settings are usually ones the bar never drew. So before a made sprite is written, the same bar is run on exactly the frames about to be written (every frame of every clip at the item's settings), and the sheet is made from those same frames. A setting that fails is left out of the package and named with the reason (`refused` in `manifest.json` and in what `bag.download()` returns).
- **Advice about the code** (does it read pixels back, so that it could not be drawn in another art style) can only come from where the code runs. The sprite's worker gives it, as warnings for whoever wrote the source. It is never part of the verdict.
- **Every call has a time limit.** Over it the worker is stopped, a fresh one is started for the next call, and the action answers `{ ok: false, errors }`.
- **The site's content policy** (the `Content-Security-Policy` in `index.html`) allows scripts, connections, images, fonts and styles from the site itself only, plus scripts and workers made in memory (`blob:`) and WebAssembly (the search library). No `eval`, no inline script, no other site. The worker carries the same policy, so even a way out the worker forgot to take away does not reach another site.
- **Sound patches are data** and are checked and rendered as before.

| Limit | Value |
|---|---|
| Source text | 400,000 characters |
| One frame | 640 by 360 pixels (the largest frame in the catalogue, a backdrop, is 320 by 180) |
| Frames in a clip, clips, frames in all | 64, 32, 256 |
| Controls | 48 |
| Reading the source (its top-level code and its imports) | 10 seconds |
| Drawing | 300 ms a frame, and never less than 3 seconds for one request |
| The quality bar on a sprite, with all the drawing it asks for | 60 seconds, 600 settings, 12 rounds |
| The quality bar on a sound effect, on a music track | 60 seconds, 10 minutes |
| Made sprites kept running at once | 8 (the one used longest ago rests, and starts again when needed) |

What remains, stated plainly:

1. **Settings nobody looked at.** The bar samples settings (the defaults, both ends of every slider, every option, a dozen seeded mixes, the looks). A source can draw anything at a setting that was never drawn for the bar or for a download, and it can guess which settings those are, since the sampling is in the open. Such a frame can be shown on a page or in the playground. It cannot be downloaded: a download checks what it writes. This is a risk to what a picture looks like, not to the visitor's machine or data.
2. **A source can tell that many settings are being drawn in a row**, and so guess that it is being checked, from the pattern of requests alone. It gains nothing by it: the frames it sends are the frames that are judged, kept and shown.
3. **The worker belongs to the site's own origin.** Its ways to the site's own storage (IndexedDB, the cache) are closed by taking them away (`TAKEN` in `app/api-source.js`), which is a list to keep up as browsers add new ones, not a wall. A sandboxed frame with an origin of its own around the worker would be a wall; it needs the host to send the framework files with cross-origin headers.

### Before a public release: Firefox and Safari

Everything above was verified in Chromium only (the one browser installed where it was built, 2026-11-18). **Firefox and Safari have not been tested.** Two facts carry the safety of made sprites, and each must be seen to hold in each browser before the site is public:

1. **A worker started from memory carries the page's content policy.** The policy is a `<meta>` tag, and the worker a made source runs in is started from a `blob:` address so that it inherits it. If a browser does not pass a `<meta>` policy on to such a worker, a made source could load a script from, or connect to, another site through anything the removal list misses. Check: in a module worker made from a `Blob`, `fetch`, `import()`, `XMLHttpRequest` and `WebSocket` to another site, and `eval` and `new Function`, are all refused.
2. **Every name on the removal list is really gone.** For each name in `TAKEN`: it is `undefined` on the worker's global, and no object the global inherits from still has it (browsers put these on different prototypes). Also check that module workers can `import()` a `blob:` module at all, or `make.sprite` does not work there.

Both are one command away, for every browser Playwright has installed (a missing browser is skipped, with the install command):

```
npx playwright install firefox webkit
npx playwright test tests/e2e/route2-browsers.spec.mjs
```

If either fails in a browser, made sprites must be switched off there (answer `make.sprite` with `ok: false`) until it is fixed; the rest of the site does not depend on them.

Measured 2026-11-18 in Chromium, a 32 by 32 sprite with two clips and 14 frames: `make.sprite` 220 to 235 ms in all (worker start, reading the source, the bar's two rounds in the other worker at 7 ms each, the 80 settings and 1,134 frames it asked to be drawn at about 110 ms, the advice run); with the bar next to the source it was 67 to 84 ms, so judging from frames costs about 150 ms a sprite. Checking it again, its frames already there: 51 ms. A download's look at one made sprite: 30 ms the first time, nothing after. One frame at a new setting 1 ms (5 ms at worst), and 0.1 ms once it is kept; a slider dragged through 61 steps in a second made 66 requests and 91 ms of worker time while the page kept every frame (16.7 ms median, 16.8 ms worst); the playground ran at 60 frames a second with it, the same as without, and asked the worker for nothing while playing.

### What an asset made on a visit can do

Once made, it behaves like a catalogue asset until the page is left. `app/api-core.js` keeps it in a registry and hands it to `app/catalog.js` (`addRuntimeAsset(row, definition)`) and, for a sound, to `app/audio.js` (`addSound(patch)`), so `assetById`, `loadSprite`, `loadSound` and `soundById` answer for it. Nothing else on the site has code of its own for these assets.

- **Listed and found**: `assets.list`, `assets.get`, `assets.search` and `assets.similar` include it, with `runtime: true`. (The site's own browse view and search box list the built catalogue only.)
- **Pages**: `go('/sprite/<id>')`, `/sound/<id>`, `/music/<id>` open it, and every control works. The build never drew it, so its row has no pictures (`thumb: null`) and cards draw it live. On its page, what one more click could ask for (each option of a choice, each switch, each other art style) is drawn ahead, so a click shows at once; a slider shows the last look for the millisecond its new frames take.
- **Drafts**: one that fails the quality bar is kept as a draft (`ok: false`, with its `errors` in its row). A draft can be rendered and has a page, which says what to fix, but it cannot go in the bag: `bag.add` refuses it and its page has no "Add to bag". Warnings do not block. Make it again under the same id to replace it.
- **The bag**: `bag.add(id, settings)` stores the item with its whole definition (`definition: { source }` for a sprite, `{ patch }` for a sound or a track).
- **The bag keeps what passed.** Making an asset again with a passing source updates its bag items. Making it again with a failing source while it is in the bag is refused (`ok: false`, `kept: false`): the asset and the bag stay as they were.
- **A failed save is reported.** When the browser's storage for the site is full, `bag.add`, `bag.update` and `bag.setLook` answer `ok: false` and change nothing, and the bag page says that the bag could not be saved.
- **After a reload, or from a link, nothing is trusted.** (The bag page tells a visitor this in plain words: an item that came broken from a link says to ask the sender for a new one, with what the check found folded under "Details". The `errors` and `reason` in `window.loadout` results are the checker's own words, for whoever can re-make it.) A stored definition is text that anyone could have put there. The site draws its pages first; then each such item is loaded and put through the whole quality bar again, in a worker, with the same limits. Until then it is "checking" (`bag.items()` waits for this). One that passes is known to the site again. One that fails, or runs over a limit, **needs re-making**: the bag page lists it by name with the reason, `bag.items()` gives it `state: 'needs re-making'` and `reason`, and nothing of it is drawn or exported.
- **A shared bag link** carries the definitions too. A link that holds a made sprite is never opened silently: the bag page says so and waits for the visitor to agree, and what arrives is then checked as above. A link is limited to 8,000 characters (`LINK_LIMIT` in `app/bag.js`), because chat and mail apps cut longer ones short; over that, "Copy link" and `bag.link()` explain and point at the download. Measured: a small pickup (2,800 characters of source) and its sound make a link of 6,700 characters, so a bag with more than one or two made assets is shared as a download, not a link.
- **The playground** takes it from the bag like anything else: a pickup is collected and its cued sound plays.
- **The download** holds what the bag stored. A made item goes in only when its own definition is the one that was checked, and its frames at the item's settings pass the bar when they are about to be written (otherwise it is named under `refused`); its sheet, JSON and WAV files are then made as for any asset, its source goes in next to them (`sprites/<id>/<id>.source.js`, `sounds/<id>.source.json`), and its entry in `manifest.json` has `madeOnThisVisit: true` and `source` (the path of that file). Items that need re-making are left out and named: `needsRemaking` in the manifest and in what `bag.download()` returns.
- **`assets.remove(id)`** forgets it and stops its worker. It refuses a catalogue asset, and an asset that is still in the bag.

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

The framework functions are not tools. An agent uses them by writing sprite source text for `make_sprite` that imports them (that source runs in a worker, as above), or by evaluating code of its own in the page against `await loadout.framework`. `(await loadout.api).modules` is what to show the agent so it knows what exists; the two sections above ("A sprite, start to finish" and "A sound patch") are what to show it so it knows what to write.

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

A body rig describes itself (the first step of Contract 13 of `docs/architecture.md`; nothing else of that contract is built). Beside each character rig there is one module of plain data, no code:

| Rig | Description | Covers |
|---|---|---|
| Side-view character | `rigs/humanoid-describe.js` | `rigs/humanoid.js`, `rigs/humanoid-figure.js` |
| Top-down character | `rigs/topdown-describe.js` | `rigs/topdown.js`, `rigs/topdown-riot.js` |
| Kiosk robot | `rigs/kiosk-describe.js` | `rigs/kiosk.js` |

Where to read one: `generated/api.json` under `rigs` (`(await loadout.api).rigs`); on the page as `(await loadout.framework).topdownDescribe.RIG`; in a terminal with `node tools/rig.mjs <rig>` (tables) and `node tools/rig.mjs <rig> --sheet` (contact sheets in `out/` of every part and every held kind on a plain body, in each direction: look at these before you write a sprite). The files are named `<rig>-describe.js`, with a hyphen, so the folder scan gives them a usable name (`topdownDescribe`); the creature and boss rigs have none yet.

What a description holds (`RIG`):

| Field | What it lists |
|---|---|
| `id`, `view`, `size`, `pivot`, `ground`, `directions`, `modules` | The frame, and the files the description covers, by their name on `loadout.framework` |
| `frames` | The functions that build one posed frame |
| `layers` | The hooks of the rig's `draw()`, in the order they are called |
| `poses` | Each pose: `fn`, `frames`, `fps`, `loop`, `directions`, `standardFor` (the clips it is the standard pose of), `options` |
| `carries`, `manners`, `stances` | How a held thing rests; ways of moving laid over a pose; how the body is carried |
| `body` | The proportion `controls` with their ranges, and the body `kinds` (human, skeleton, imp; adult, child) |
| `hair` | Each hair style and the function that draws it |
| `parts` | Each part it can wear: `fn`, `layer` (or `layers`), `socket`, `directions` (where it shows), `options` with ranges and choices, `rise` (how far it rises above the head, for the fit) |
| `held` | Each held kind: `fn`, `size` (its size function), `px` (length, back, pad), `length` (the range of the length setting), `carry`, `clips` |
| `effects` | Light drawn after the outline: trails, muzzle light |
| `sockets` | The attach points it exports |
| `helpers`, `drawingHelpers` | Every other export, so nothing is left out |
| `duplicates` | Where the same idea exists more than once, with the calls a tidy-up would merge |
| `inSprites` | What a sprite file on the rig still draws or poses itself |

A name such as `topdown.cape` is `<module>.<export>`. An option is `{ min, max, default }`, `{ choices, default }`, `{ colour: true }`, `{ flag: true }` or `{ data }`.

**When you add to one of these rigs, add to its description in the same change.** `tests/unit/rig-describe-data.test.mjs` fails for an export, a drawing function (first argument `g`), a name in an exported list, or a side module `rigs/<rig>-<name>.js` that the description does not list; `tests/unit/rig-describe-draw.test.mjs` draws every listed pose, part, held kind, hair style and effect through the function named, checks a part shows in exactly the directions given, and that both ends of every range stay inside the frame. A new part with a kind list needs the list exported (`PACK_KINDS`), or the tests cannot see a kind added later.

## Studio definitions: what a library body may name and set

A studio definition (`loadout-sprite`, `docs/studio.md` section 2.3; Contract 14) is data and never holds code. Where a library body (the side-view person) needs framework code, it names it from a fixed list, the same way it names a rig (Contract 14 rule 2, amended in studio item F1). The lists, each on `loadout.framework` under its module's name:

| Export | Module | What it lists |
|---|---|---|
| `COLOUR_RULES` | `engine/data-rules.js` | The colour rules `body.paint` may name, with their arguments: `tone`, `mix`, `standOut` (engine/color.js `pick`), `apart`, `bandTone`, `ramp`, `choose`. `paintColour(expr, settings)` and `paintFigure(figure, paint, settings)` work one out; they never throw |
| `FIGURE_SETTINGS` | `catalog/studio-schema.js` | The figure fields a slider or choice may `sets` (`"part.field"` and `stance`), each a number range or a list of words |
| `FIGURE_COLOURS` | `catalog/studio-schema.js` | The figure's colour fields `body.paint` may paint |
| `FIGURE_SOCKETS` | `catalog/studio-schema.js` | The attach points a Contract 3 part may hang from (`muzzle` too when the figure has `thrown`) |
| `FIGURE_BLOCKS` | `engine/data-rules.js` | The blocks of a figure read with defaults when absent (`body`, `motion`, `look`, `hair`): a control may set a field of one the stored figure has not; any other part it sets must be in the figure |

A new rule is a framework addition (Contract 11): an entry in `COLOUR_RULES`, its argument check in `catalog/studio-schema.js`, and a test in `tests/unit/data-rules.test.mjs` that it equals the function it names. A data sprite (`engine/data-sprite.js`) has no `sprite.made`: that field means a sprite made on this visit and drawn in a worker; where a data sprite came from is `sprite.definition.made`.

## Reference

The full list (every action, every module, every export with its arguments and one-line description) is written by the build to `generated/api.md`, next to `generated/api.json`. It is not kept in git, because it changes with every function added to the framework. Run `node tools/lib/api.mjs` (a tenth of a second) and open it.
