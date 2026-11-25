# Site design: the Catalogue look

Decided 2026-11-19. Keyang picked mock-up 5, "Catalogue", from five directions (`mocks/index.html`; the chosen pages are `mocks/5-catalogue/`, with its reasons in `mocks/5-catalogue/NOTES.md`). This page is the brief every page of the real site is rebuilt to. The mock-up is the picture to match; where this page and the mock-up disagree, this page wins.

Why the site is being redesigned, in Keyang's words: "the pages look messy. the UI / elements are everywhere"; on the playground "the change will not persist. too many clicks"; the asset page "is super hard to use, user has to scroll forward and back to make changes". He wants it "clean, intuitive and professional", and wants visitors to "feel excited about what we are offering".

## 1. The look

| Token | Value | Use |
|---|---|---|
| Paper | `#ffffff` | Every page background |
| Ink | `#000000` | Text, the one primary button per screen, selected states |
| Second ink | `#5c5c5c` | Quiet text (6.7:1 on paper) |
| Shelf | `#f5f5f3` (pressed `#ececea`) | The one surface. All art sits on it |
| Line | `#e5e5e2`; control line `#cfcfcb` | Rules; borders of controls |
| Mark | `#f26b1d` | The only accent: a 6 px dot meaning "you changed this" and "saved". Nowhere else |

- **Type:** Geist for everything (self-hosted under `vendor/fonts/` like the current fonts, through `tools/lib/vendor.mjs`). Scale 12 / 13 / 14 / 15 / 18 / 20 / 28 / 40 / 72; headlines 600 with tight tracking (−0.04em at 72, less when smaller), body 400. Pixelify Sans only in the wordmark. Figtree is dropped.
- **Spacing:** 4 8 12 16 24 32 48 64 96 128. One radius, 6 px. No shadows, no gradients, no thick outlines, no graph paper, no pixel-font headings.
- **Components** (the only ones; reuse them everywhere): button (primary black, secondary outlined, small and large sizes), chip (a toggle; pressed = ink border), tab (underline), segmented control (pixel size, plain/scene), tile (shelf-coloured square that holds art), card (tile + name + one tag + add), token (a chosen filter, black with ×), the change dot. The CSS in `mocks/5-catalogue/style.css` was the starting point for `app/css/base.css`.
- **Art:** always on a shelf tile, `image-rendering: pixelated`, whole-number scale, never blurred or stretched.
- **Words:** sentence case, everyday words (the existing rules in `docs/style-guide.md` and the README's voice still hold). No ALL-CAPS labels, no arrows glued to links.
- **Quality floor:** visible keyboard focus, 4.5:1 text contrast, `prefers-reduced-motion` respected, real buttons and links, no sideways scroll at 390 px, works at 1440×900, 1024×768, 900×700 and 390×844.

## 2. Frame

- Header, 56 px, one hairline under it: wordmark; Library, Kits, Play; Bag button with a count on the right. On a phone the three links fold into a menu.
- The content policy, first-paint frame in `index.html` and the lazy page loading stay as they are; only their styles change (the inline first-paint styles must match the new header).
- Footer on the landing page only.

## 3. Changes save themselves

This is the behaviour change behind "the change will not persist" and "too many clicks".

- Changing anything on an asset page (a control, a version, Surprise me, a sound cue, pixel size) puts the asset in the bag with those settings, at once. There is no "Add to my bag" step to forget. The panel footer says "Saved in your bag" with the change dot and how many changes there are.
- An asset opened from the bag edits that bag item. An asset opened from anywhere else edits the bag item for that asset if there is one, otherwise creates one on the first change. Opening a page without changing anything adds nothing.
- "Start over" puts the asset back to its defaults and keeps it in the bag; "Remove from bag" (in the panel's menu) takes it out.
- The playground uses what is in the bag, so a change made anywhere shows in the playground, and a change made in the playground is saved to the bag the same way.
- The playground's "In the scene" list is the bag's list: the same row actions (Surprise me, Duplicate, Remove) and no add-one / remove-one counters; a duplicate is one more thing in the scene (Keyang, 2026-11-25).
- When the browser does not keep storage, the existing warning (`NOT_KEPT` in `app/bag.js`) shows in the panel footer instead of "Saved".
- Links that carry settings (copy link) keep working as now.

## 4. Ready-made versions

"Start from a version" is the first thing on an asset page and three version dots sit on each library card.

- A sprite may list its own versions: `versions: [{ name: 'Ranger', params: {...} }, ...]` in its definition (the Hero's twelve are in `mocks/5-catalogue/common.js`, `HERO_VERSIONS`). This is a new optional field: add it to Contract 1 in `docs/architecture.md`, to `defineSprite` validation (unknown keys and values rejected like any settings), to the checker (every version renders and passes the quality bar like any other setting), and to `generated/catalog.json` (count only).
- A sprite that lists none gets generated versions: a framework function (`versionsOf(sprite, n)` in `engine/`, listed on `window.loadout`) that returns `n` named, clearly different settings drawn from seeded random settings, each checked to differ visibly from the defaults and from each other. Names come from what changed, in everyday words ("Long hair, axe", "Night colours").
- Sounds and music get versions too, from their styles and from seeded settings.
- Versions are a pick, not a place: choosing one sets every control, and fine-tuning continues from there.

## 5. Pages

| Page | Address | Match | What it must do |
|---|---|---|---|
| Landing | `#/` | `mocks/5-catalogue/landing.html` | Headline, one sentence, Browse everything (primary) and Change the Hero, search. A live line-up of sprites from the three kits with Surprise me. Three steps (pick, change with a real control, download with the sheet following the control). The three kits as living scenes that take a look in one click. The Hero as twelve versions. Featured assets. Sounds and music with play. Where it works (Unity and any engine that reads PNG and WAV; Unity package coming later). Real numbers from the catalogue |
| Library | `#/browse` | `library.html` | Search (and Smarter search, as now) at the top. Kind tabs with counts: All, Sprites, Sounds, Music, Kits. One row of filters (Kit, Game type, Theme, Type) as small menus; a chosen one becomes a token with ×. Sort; result count; grid or list. Card: tile, name, one tag, +, three version dots that add directly; hover animates. A sound card: its waveform on the tile (Keyang, 2026-11-19); a music card: its icon; both with length and play. The address keeps the search and filters, as now |
| Asset | `#/sprite/<id>` | `remix.html` | Two columns filling the window, no page scroll at the four desktop sizes. Left: name, line, kits; the live picture on a tile, Plain or In a scene (the asset on a matching background and ground), play/pause; the animations as chips. Right: Start from a version (tiles) with Surprise me and Start over. Surprise me is the one colourful button on every page that has it, with a star and a burst of sparkles on each press (`app/magic.js`, Keyang, 2026-11-19); Fine-tune tabs (Shape, Parts, Colours, Motion, Sounds, Look) that each fit the panel, every control with the change dot, its own Reset and a small ? that opens a hint under it: what the control is, what its two ends or choices are and what its value stands for now, in words (`app/hints.js`, Keyang, 2026-11-22); footer: saved state, pixel size, Download. Copy link and More like this in a small menu. On a phone the picture stays pinned and the panel scrolls under it |
| Sound, music | `#/sound/<id>`, `#/music/<id>` | same two columns | Left: the sound's icon and name, a big play button, length; right: versions (its styles), fine-tune tabs of its controls, footer as above. Music: length and lead instrument choices as now. The sound page shows the icon; library cards show the waveform (Keyang, 2026-11-19). Music pairs (Keyang, 2026-11-22; two with Drums added 2026-11-23): eight one-tap chips under the play button (Guitar + Bass, Piano + Violin, Piano + Bass, Flute + Guitar, Trumpet + Piano, Bell + Piano, Guitar + Drums, Piano + Drums) set the melody instrument and the one that plays along together, in the existing chip style (and a Plays along volume slider right after Melody, the same control), a track without the choice shows none |
| Kits | `#/bundles`, `#/bundle/<id>` | landing's kit section | List: each kit as a living scene with its facts. One kit: its scene, the look picker and Surprise me for the whole kit (whole-bundle customisation, goal 4), what is in it as a library grid, Add the whole kit, Try it in the playground, Download |
| Bag | `#/bag` | `NOTES.md`, "The bag and the playground" | The library's list view with only your things: each row shows the asset as you changed it, its change dots, pixel size; clicking a row opens the same right-hand panel beside the list (no trip to another page). Each row has its own Surprise me (the magic button: a random version of that item at once) and Duplicate (an icon with no words: a copy right after it), beside Open its page and Remove (Keyang, 2026-11-25; `app/row-tools.js`). One Download for everything (zip; Unity package shown as coming later, as now) |
| Playground | `#/play` | same | The scene fills the left; the right is the same panel for whichever thing is clicked in the scene, saving to the bag as it goes. The existing game, levels, keys and views stay |

## 6. What must not change

Behaviour added by the final fix wave (2026-11-19) that the new pages keep, restyled: grouped bundle lists; colour names beside swatches; the storage-blocked warning; the loading state; the view switch in the playground; the one-line explanation under "Also change shapes"; per-kind backdrops in previews.

Everything behind the pages: the catalogue, search, the bag's data and links, downloads and their contents, the sandbox and content policy for made assets, `window.loadout`, the sound engine, the playground's game. The four goals' acceptance tests (`tests/e2e/journey.spec.mjs`, `whole-bundle.spec.mjs`, `three-bundles.spec.mjs`, `newasset.spec.mjs`) must pass after the rebuild; where they name old buttons, update the selectors and keep what they prove.
