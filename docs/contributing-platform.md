# Contributing to the platform

This guide is for changes to Loadout itself: the drawing and sound engines, the build, the website, the quality checks, the search, the tools. To add a sprite, a sound or a kit, read [contributing-assets.md](contributing-assets.md) instead. Start with [CONTRIBUTING.md](../CONTRIBUTING.md) for the ground rules.

## 1. Set up

```bash
npm install                       # includes Playwright for the browser tests
npx playwright install chromium   # once, if Playwright asks for a browser
npm run build -- --skip-quality   # ~5 s: writes generated/ and vendor/ (both are gitignored)
npm run serve                     # http://localhost:5178
```

`generated/` (catalogue, search index, thumbnails) and `vendor/` (browser copies of SQLite WebAssembly, the search library and model) are build outputs. The site cannot run without them, and many tests need them. If you work in a second checkout or a copy of the folder, copy both over from a built one rather than rebuilding.

Useful build options (full list in the README): `--skip-quality` for a quick look, `--no-meaning` to skip the 24 MB search model, `--dist` to also write the publishable site to `dist/`, `--root <dir>` to build another copy. Do not run two builds in the same folder at once.

## 2. The map

| Folder | What lives there |
|---|---|
| `engine/` | Sprite drawing: surface, colour, motion, the data-sprite resolver, pieces, themes and looks. `engine/gen/` is the **generator registry**: named, versioned functions that return shapes |
| `rigs/` | The bone-rig renderer, key poses and studio templates |
| `sound/` | The sound engine (`sfx-engine.js`), player, analyser, music helpers |
| `quality/` | The quality bar as code (`sprite.js`, `sound.js`, `data-checks.js`). Same code in the build, the command line and the browser |
| `catalog/` | Metadata schema, the role tree and the validators that wall off untrusted data |
| `search/` | Keyword and meaning search (browser client, ranking, index builder parts) |
| `app/` | The website: hash-routed pages (`#/sprite/coin`, `#/studio`, `#/play`), the bag, the playground, the studio (`app/studio/`) |
| `tools/` | Node tools: `build.mjs`, `serve.mjs`, `check.mjs`, `sfx.mjs`, `render.mjs`, `gen.mjs`, `piece.mjs`, and `tools/lib/` for the pieces they share |
| `pieces/` | Shared data that sprites use by name (bases, parts, held things, skins, fonts, stamps). Reviewed like framework code |
| `sprites/`, `sounds/`, `bundles/` | The assets. Not the platform, but the build scans them |
| `tests/` | `unit/` (Node's built-in runner), `e2e/` (Playwright, Chromium), `fixtures/`, `helpers/` |
| `docs/` | Design and rules. `docs/architecture.md` holds the numbered contracts |

Read these before a non-trivial change, in this order:

1. [architecture.md](architecture.md): the **contracts**. If a change touches a contract, the change and the contract text go in the same pull request.
2. [framework-api.md](framework-api.md): how the framework grows, `window.loadout`, and how a made sprite is read and drawn.
3. [data-sprites.md](data-sprites.md): the sprite data format and the build plan with each item's state.
4. [quality-bar.md](quality-bar.md): every threshold the checks use, with the constant that holds it.
5. [features.md](features.md): the vision, the feature list and the open decisions. Check it before you start something big, in case it is already decided or planned.

## 3. Rules for platform code

- **Additive.** Add a function, a module, a node type or a version. Do not change what existing code does. A change that alters existing output is its own pull request with its own review, because every asset's pixels or samples are pinned by tests.
- **Released versions are frozen.** A generator's output at `id@v`, a piece version in `pieces/` (hashed in `pieces/_pins.json`) and a golden in `tests/fixtures/gen/` never change. A new look is `v: 2` next to `v: 1`.
- **Deterministic.** No `Math.random()`, `Date.now()` or clocks in engine, generator or asset code. Variety comes from a `seed` argument through `engine/motion.js` `hash`.
- **Pure data in, pure data out at the edges.** Anything that arrives from storage, a shared link or `window.loadout.make.*` goes through the plain-data wall and the validators in `catalog/` before it is drawn. Never `eval`, `new Function` or build a script or worker from text. The content policy in `index.html` forbids `blob:` scripts and workers, and a test holds it.
- **The browser and Node share the engine.** Code under `engine/`, `rigs/`, `sound/`, `quality/`, `catalog/` and `search/` must run in both. Only `app/` may touch `window` or the DOM. Browser code reaches third-party files only through `vendor/` copies the build writes.
- **No bundler, no framework.** Plain ES modules.
- **One-line doc comments.** Every exported framework function carries one that says what it does and lists its arguments. The build turns them into `generated/api.json` for agents, and `tests/unit/api-descriptions.test.mjs` fails if one is missing.
- **Everyday words on screen.** Anything a visitor reads (buttons, labels, errors, hints) is plain language. No "params", "patch", "index", "facet".
- **Re-read a file right before editing it, and append rather than reorder.** Several people may touch the same module. Avoid reformatting lines you did not change.

## 4. Common platform tasks

### Add a generator (a new way to draw)

A generator is a named function that returns shapes, which sprites call with `{ "gen": "<id>", "v": 1, ... }`. Add one when no existing generator can draw what an asset needs.

1. Find the family module in `engine/gen/` (list families with `node tools/gen.mjs`). A new family is a new module plus one import line at the end of the list in `engine/gen/index.js`.
2. Write the test first, in `tests/unit/gen-<family>-<topic>.test.mjs`, using the contract harness:

   ```js
   import test from 'node:test';
   import * as registry from '../../engine/gen/index.js';
   import { checkGeneratorContract } from '../helpers/gen-harness.mjs';

   test('shimmer@1 passes the goldens harness', () => {
     checkGeneratorContract(registry, registry.generator('shimmer', 1), { cases: [
       { args: { at: [16, 16], paint: 'gold', core: 'shine' } },
       { args: { at: [8, 20], size: 2, paint: 'gold.light', core: 'shine' }, ctx: { t: 0.5, loop: true, frames: 8, frame: 4 } } ] });
   });
   ```

   Run it and watch it fail: `node --test tests/unit/gen-<family>-<topic>.test.mjs`.
3. Append the generator to the family module with `defineGenerator({ id, v, family, about, args, cost, run, keyable })`. Look at a neighbour in the same file for the exact shape. `run` sees only its arguments and a context (`t`, `frame`, `frames`, `loop`, `size`, `clip`, `direction`), returns primitives, and never touches a surface, a clock or `Math.random`.
4. Pin its output once: `GEN_GOLDEN_WRITE=1 node --test tests/unit/gen-<family>-<topic>.test.mjs` writes `tests/fixtures/gen/<id>@<v>.json` and never overwrites an existing golden. Run the test again without the variable.
5. It must draw the same centred on a node at its origin as in frame pixels, so do not keep only pixels from 0 to the frame size. `tests/unit/gen-node-origin.test.mjs` runs every generator both ways. A generator that truly needs the frame's edges is an effect and goes in `FRAME_GENERATORS` in `engine/gen/index.js`.
6. Look at it: `node tools/gen.mjs <id> --sheet` draws it across each argument's range into `out/`.
7. Run your family's tests, `node --test tests/unit/api-descriptions.test.mjs`, and `node tools/check.mjs` on every sprite that names your family.

### Add a piece (shared data)

A piece is one file `pieces/<kind>-<name>.v1.json` (kinds: `base`, `part`, `held`, `skin`, `material`, `font`, `stamp`). `pieces/README.md` shows the format and how to pin a released version. Check with `node tools/lib/pieces-index.mjs` and `node tools/piece.mjs <kind:name> --sheet`. `tests/unit/pieces-index.test.mjs` fails if a pinned version's content changes.

### Extend the sound engine or the music kit

- A new synthesis block: add an entry at the **end** of `NODE_TYPES` (or `FUNCS`) in `sound/sfx-engine.js`, with its `doc` and field docs. A new function name becomes a reserved word, so first make sure no existing patch uses it as a control or node id (`grep -l '"<name>"' sounds/*.json`).
- A new music building block (a voice, a drum, a fill): add an export at the end of `tools/compose/kit.mjs`. Tests go in `tests/unit/engine-sound-<topic>.test.mjs` or `compose-kit-<topic>.test.mjs`.
- **Prove every existing sound renders the same.** Fingerprint every patch before and after, and the two lists must match except for your new sound:

  ```bash
  mkdir -p out && node --input-type=module -e "
  import fs from 'node:fs'; import crypto from 'node:crypto'; import { renderPatch } from './sound/sfx-engine.js';
  for (const f of fs.readdirSync('sounds').filter((f) => f.endsWith('.json')).sort()) {
    const r = renderPatch(JSON.parse(fs.readFileSync('sounds/' + f, 'utf8')), { seed: 1 });
    console.log(f, crypto.createHash('sha1').update(Buffer.from(r.samples.buffer)).digest('hex').slice(0, 12));
  }" > out/sounds-before.txt     # run again with after.txt, then: diff out/sounds-before.txt out/sounds-after.txt
  ```

- Changing the drum or `along` helpers changes track output. `tests/unit/compose-tracks.test.mjs` pins each track, so regenerate and re-pin the tracks you changed, and say so in the pull request.

### Change the quality checks

Thresholds are named constants in `THRESHOLDS` in `quality/sprite.js` and `quality/sound.js`. If you change one, change [quality-bar.md](quality-bar.md) in the same pull request, and run `node tools/check.mjs` and `node tools/sfx.mjs check` over the library to see what you newly fail. A check that makes many existing assets fail needs a plan for them, not just the constant.

### Change the website (`app/`)

Pages are plain ES modules routed by the URL hash. Shared styles are in `app/css/`.

- Keep to everyday words and keep the page usable at phone width. Browser tests check both.
- Anything that touches the bag, the shared link format or the download must keep reading what older versions wrote. Storage and links are untrusted input (see "Safety of run-time assets" in [architecture.md](architecture.md), Contract 11).
- Write a Playwright test for the behaviour. `tests/e2e/journey.spec.mjs` is the model: it uses the site as a person would.

### Change the build or the tools

`tools/build.mjs` must stay all-or-nothing: it writes nothing the site reads until every asset has passed. Keep `--dist` from ever modifying source (`tests/unit/dist-leaves-source.test.mjs` holds this). If you add a file the browser loads, add its folder to the `DIST` list in `tools/build.mjs`, or it will be missing from the deployed site.

## 5. Tests

```bash
node --test tests/unit/<area>-*.test.mjs        # your own area: run this while you work
npm test                                         # every unit test (large; run before a big pull request)
npx playwright test tests/e2e/<area>.spec.mjs   # one browser spec
npm run e2e                                      # every browser spec (Chromium; starts its own server on :5199)
```

[tests/README.md](../tests/README.md) covers naming, the helpers and how to write a unit or browser test. Rules of thumb:

- Test behaviour that does not depend on a particular asset's content (build a tiny sprite or patch inline), so adding assets never breaks your test.
- Browser tests import `test` from `tests/helpers/test.mjs`, which fails the test on any console error, uncaught exception or failed request.
- `tests/unit/assets-data-quality.test.mjs` can hang under load; run it alone.
- Running `node --test tests/unit/` needs a glob: `tests/unit/*.test.mjs`.

## 6. What is open

Good places to start, and known gaps. Say in the issue which you are taking.

- **Firefox and Safari have never been tested.** Only Chromium is installed in the maintainer's setup. The safety rules for made assets (Contract 11 in [architecture.md](architecture.md), and "How a made sprite is read and drawn" in [framework-api.md](framework-api.md)) have only been verified there, so a run in both browsers is the main gap.
- **An MCP server** that exposes the actions in `generated/api.json` does not exist yet. `window.loadout` and its description do.
- **Unity package export is not built.** The zip is engine-neutral with written Unity and Godot steps that nobody has imported yet. Checking those steps in a real project is useful on its own.
- **A second art style.** The seam exists and is tested with test-only styles (Contract 12).
- **The studio** works for bone rigs only; the other body kinds are not yet editable there ([studio.md](studio.md)).
- **Nobody has listened to the sounds.** They were tuned by measurement. Listening and reporting is a real contribution.

## 7. Before you open the pull request

- [ ] Tests for your area pass, and a new behaviour has a test that failed first.
- [ ] If you touched the engine, a generator or a piece: `node tools/check.mjs` passes for every sprite that uses it, and released output is unchanged (goldens and pins pass).
- [ ] If you touched the sound engine: the before/after fingerprints match.
- [ ] If you touched `app/`: the relevant Playwright spec passes, and you tried it at desktop and phone width.
- [ ] New exports have their one-line doc comment, and `tests/unit/api-descriptions.test.mjs` passes.
- [ ] Documents that describe what you changed are updated (the contract in `architecture.md`, the threshold in `quality-bar.md`, the README's tables).
- [ ] No generated output, `node_modules`, `out/` or `dist/` is committed.
