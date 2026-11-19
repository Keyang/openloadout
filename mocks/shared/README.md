# Shared kit for the design mock-ups

Mock-ups only. Nothing here is part of the site.

| File | What it gives a mock page |
|---|---|
| `kit.js` | `<lo-sprite>`: a real Loadout sprite drawn live by the real engine, plus the real catalogue and the real controls of a sprite |
| `fonts.css` | Self-hosted fonts: Instrument Sans, Unbounded, Figtree, Bricolage Grotesque, Schibsted Grotesk, Geist, Onest (all variable weight), Pixelify Sans 600 |
| `mockbar.js` | A floating switcher (design 1 to 5, landing / library / remix). Include it last on every page |
| `shot.mjs` | Screenshots with the project's Chromium: `node mocks/shared/shot.mjs mocks/<design>/landing.html out.png --width 1440 --height 900 [--full] [--click sel] [--scroll px]` |
| `test.html` | A working example of every kit feature |

Pages are served at `http://localhost:5178/mocks/<design>/<page>.html` (the server is already running; do not start another on that port).

## `<lo-sprite>`

```html
<link rel="stylesheet" href="../shared/fonts.css">
<script type="module" src="../shared/kit.js"></script>

<lo-sprite sprite="knight" clip="walk" scale="4"></lo-sprite>
<lo-sprite sprite="knight" clip="attack" scale="3" look="night" params='{"hairStyle":"long","weapon":"axe","outfit":"#3f6fd1"}'></lo-sprite>
<lo-sprite sprite="bg-forest" layers style="width:100%"></lo-sprite>   <!-- a background: all its layers stacked -->
<lo-sprite sprite="void-ranger" scale="3" hover></lo-sprite>            <!-- animates only under the pointer -->
```

Attributes: `sprite` (id), `clip`, `scale` (whole number; or size the element with CSS and keep the frame's aspect ratio), `look`, `params` (JSON of settings that differ from the defaults), `layers`, `paused`, `frame`, `hover`, `flip`.

After `await el.ready` (or the `ready` event):

| Member | Meaning |
|---|---|
| `el.def` | The sprite definition: `name`, `blurb`, `size` [w, h], `clips`, `params`, `parts`, `sounds` (per clip: `[{ sound, frame, preset, volume }]`) |
| `el.params` | Current settings `{ key: value }` |
| `el.clips` | `[{ name, label, frames, loop }]` |
| `el.controls()` | The controls to show right now, grouped: `[{ group, part, items: [{ key, kind, label, value, def, min, max, step, lo, hi, options, swatches, isSelector }] }]`. `kind` is `range` (slider, `lo`/`hi` are the words for its ends), `choice`, `color` or `toggle`. Controls that do nothing at the current settings are left out, so call it again after every change |
| `el.set(key, value)`, `el.setParams(obj)` | Change settings; the picture updates at once |
| `el.setClip(name)`, `el.setLook(id)` | Change animation or look |
| `el.surprise()`, `el.reset()` | Random settings; back to defaults |
| `el.changed()` | Keys that differ from the defaults |
| `el.play()`, `el.pause()` | |
| event `change` | After any change |

Several `<lo-sprite>` elements can show the same sprite with different `params`, so a choice can be shown as a picture (the Hero with each hair style, each weapon, each colour).

## Catalogue and looks

```js
import { loadCatalog, looks, thumb, url } from '../shared/kit.js';
const { assets, bundles } = await loadCatalog();
```

- `assets`: 199 rows. `kind` is `sprite` or `sound`. Fields: `id`, `name`, `description`, `type` (character, creature, tileset, prop, pickup, projectile, effect, background, ui, icon, sfx, ambience, jingle, music), `themes`, `gameTypes`, `view`, `words` (search words), `bundles`, `thumb`, `tech`.
  - Sprites: `tech.frame` [w, h], `tech.clips`, `tech.controls` (count), `tech.parts`, `tech.soundIds`; `strip` (the card animation as one row of frames), `stripFrames`, `stripFps`.
  - Sounds: `tech.seconds`, `tech.loop`, `tech.styles` (names), `thumb` (a small drawn icon), `thumbInk`.
- `bundles`: 6 rows with `id`, `name`, `description` and their assets. The three full kits are `kit-platformer-fantasy` (Thornwood Keep), `kit-rpg-fantasy` (Hearthvale) and `kit-roguelite-scifi` (Derelict Station).
- `thumb(id)` gives the still picture's URL; `url(path)` turns a catalogue path into a URL. Draw pixel pictures with `image-rendering: pixelated` and at whole multiples of their size.
- `looks`: 14 whole-set looks `[{ id, name, blurb }]`: original, sunset, frost, forest, candy, night, desert, toxic, mono, handheld, vivid, faded, spooky, golden. `look="night"` on a `<lo-sprite>` applies one.

For a library grid of many assets, use the still `thumb` pictures (cheap) and animate on hover, either with `<lo-sprite hover>` or by stepping through the `strip` image.

## Useful ids

- Characters: `knight` (the Hero, 64x64, 20 controls, 9 animations: idle walk run jump attack hurt die block victory), `wizard`, `rogue-battler`, `road-bandit`, `spear-goblin`, top-down `hero-walker`, `mage-walker`, `rogue-walker`, `void-ranger`, `shield-trooper`, `villager`-like `farm-kid`, `merchant`, `village-elder`, `town-guard`, `vendor-bot`
- Creatures: `slime`, `bat`, `wolf`, `bone-soldier`, `thorn-beetle`, `moss-golem` (96x96), `ember-wyrm` (128x96 dragon), `crawler-bug`, `spitter-bug`, `security-bot`, `scout-drone`, `warden-mech`, `hive-mother`
- Backgrounds (320x180, use `layers`): `bg-forest`, `bg-castle`, `bg-battle-field`, `bg-battle-dungeon`, `bg-starfield`
- Tiles (32x32 frames, one clip per piece): `tiles-forest`, `tiles-castle`, `tiles-cave`, `tiles-meadow`, `tiles-village`, `tiles-station-floor`, ...
- Interface pieces: `ui-dialogue`, `ui-panel-wood`, `ui-buttons-wood`, `ui-battle-menu`, `ui-upgrade-card`, `ui-bars-rpg`, `ui-bars-tech`
- Music: `thornwood-overworld`, `battle-theme`, `hearthvale-village`, `hearthvale-battle`, `derelict-run`, `derelict-boss`
