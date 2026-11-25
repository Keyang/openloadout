# Contributing to Loadout

Loadout is a static website of pixel-art sprites, sound effects and music for 2D games. Every asset is made by code and has plain-language sliders. There are two ways to help, and each has its own guide:

| I want to... | Read |
|---|---|
| **Improve the platform**: the engine, the build, the website, the quality checks, the tools | [docs/contributing-platform.md](docs/contributing-platform.md) |
| **Add or improve assets**: a sprite, a sound effect, a music track, a kit | [docs/contributing-assets.md](docs/contributing-assets.md) |

If you are not sure which one your idea is: a *new thing in the catalogue* is an asset, and a *new way of drawing, playing, searching or checking* is the platform. Often one asset needs a small platform addition (a new generator), and the asset guide explains how to make both in one pull request.

## Get it running (both routes)

You need Node (the project is developed and tested on Node 24). No other tools are needed.

```bash
npm install
npm run build -- --skip-quality    # about 5 seconds; writes generated/ and vendor/
npm run serve                      # http://localhost:5178
```

`--skip-quality` is for a quick look while you work. Before you open a pull request, check what you changed (the guides say which command) rather than running the full build, which takes about 25 minutes.

The first build downloads the search model (about 24 MB) from Hugging Face into `.cache/models/`. Add `--no-meaning` to skip it; the site then has keyword search only.

## Ground rules

These hold for every contribution. They are what keeps 500+ assets and the framework consistent, and a pull request that breaks one will be sent back.

1. **Assets are data, not programs.** A sprite is one `sprites/<id>.json` file and a sound is one `sounds/<id>.json` file. The build refuses code in `sprites/`. Anything an asset needs that does not exist yet is added to the framework, never to the asset.
2. **Released things never change.** A generator, a piece or a rig base that has shipped keeps its exact output. A new look is a new version (`v: 2`) beside the old one.
3. **Deterministic.** The same input gives the same pixels and samples. No `Math.random()` and no dates in engine or asset code; variety comes from a `seed` argument.
4. **Static site.** Everything a visitor uses runs in the browser from static files. No server code. Expensive work happens in `npm run build`.
5. **Plain JavaScript, ES modules, no bundler, no framework.** The same engine code runs in the browser and in Node.
6. **Tests first.** Write the failing test, then the code. Run your own area's tests, not the whole suite (it is large).
7. **Everyday words on screen.** Names, blurbs, slider labels and style names are for people who make games, not for programmers or sound designers: "Taller", "Brighter", "Ringing metal", never "offset", "params" or "sine".
8. **Original work only.** Do not copy a famous character, a known melody or a sprite from another game. Describe the asset in your own terms.
9. **Small, focused pull requests.** One asset (or one kit) per pull request, or one platform change per pull request.

## Licence

Loadout is released under the MIT licence (`LICENSE`). By opening a pull request you agree that your contribution is licensed under the same terms. Do not submit anything you do not have the right to license that way: no code, art, samples or melodies copied from elsewhere.

Third-party files that the build copies into `vendor/` keep their own licences, listed in `THIRD_PARTY_NOTICES.md`. If you add a dependency, add a row there.

Each asset still records `"license": "draft"` in its `meta`; this value is being replaced and does not change what the MIT licence allows.

## Opening a pull request

- Say what you changed and why, in plain words.
- Paste the output of the checks the guide asks for (`check.mjs`, `sfx.mjs check` or the tests you ran).
- For an asset, attach the render sheets you looked at (`out/<id>-clips.png`, `-variants.png`). Nobody has listened to the existing sounds, so say plainly whether you judged a sound by ear or only by the checker.
- For a platform change, say which browsers you tried. Only Chromium is tested today, so a Firefox or Safari run is very welcome.

## Asking questions

Open a GitHub issue. Describe what you tried, the command you ran and the message you got.
