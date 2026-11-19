# Brief: five design mock-ups for Loadout

Written 2026-11-18. Five designers each build one direction. The owner (Keyang) picks one. Mock-ups only: nothing in the real site changes.

## The product

Loadout is a website of game-ready pixel art, sound effects and music. Nothing in it is a fixed picture or recording: every asset is drawn or synthesised by code, so a person can change it with a few sliders and choices (a hero's build, hair, weapon and colours; a sound's style; a track's length and lead instrument) and download the result ready for a game engine such as Unity.

- **Who it is for:** people making a small game who cannot draw, record or code. Every word on screen is an everyday word. Never say parametric, procedural, schema, asset pipeline, tileset slicing and the like.
- **What exists today (use these real numbers and names, invent no features):**
  - 137 sprites, 56 sounds, 6 music tracks.
  - Three complete kits, each 47 to 49 sprites, 20 sounds and 2 tracks that belong together: **Thornwood Keep** (side-view fantasy platformer), **Hearthvale** (turn-based fantasy RPG), **Derelict Station** (top-down sci-fi action roguelike).
  - Every asset has its own controls. The Hero has 20, and 9 animations.
  - A whole kit can be restyled in one go with a **look** (14 of them: Sunset, Frost, Night, Candy, Handheld, ...) or with "Surprise me".
  - A **bag**: what you have picked, with your changes. A **playground**: a small playable scene to try what is in your bag. **Download** as a zip of sprite sheets (PNG plus a data file) and sounds (WAV). A Unity package is coming later.
  - Search by plain words, plus an optional "smarter search" that understands descriptions like "something for when the player dies".
- **Do not show:** prices, sign-in, accounts, licence claims, AI-agent features, user counts, testimonials. They do not exist.

## Why we are redesigning

The owner's words: "the pages look messy. the UI / elements are everywhere." "when user goes to the playground and tries to change one asset the change will not persist. too many clicks." The asset page "is super hard to use, user has to scroll forward and back to make changes." He wants the result **"clean, intuitive and professional"** and wants people to **"feel excited about what we are offering"** on the landing page. His reference is polyfork.dev (a catalogue of free low-poly 3D models that are code with adjustable knobs): a calm single-column landing page (headline, two buttons, a strip of rendered models, "from catalogue to scene in 3 steps", kits, a grid of asset cards with name and one tag), generous white space, restrained type.

Screenshots of the current site are in `mocks/shared/current/`. What is wrong with it:

- A pixel font for headings, thick black outlines, hard drop shadows and a graph-paper background on everything: every element shouts.
- The landing page is a search box and a list. Nothing moves, nothing shows that the art can change.
- The library has a filter column with seven groups and about fifty rows before any result is understood.
- The asset page puts the picture at the top left, controls in a long right column, and the sounds as raw lists under the picture. Changing the cape means scrolling away from the picture.
- A change made on the asset page is only kept if the person remembers to press "Add to my bag" again; trying it in a scene is another page.

## What you build

Three pages in your own folder `mocks/<your-folder>/`, static HTML and CSS with a little script, sharing one stylesheet:

1. **`landing.html`**: the page that makes a visitor want this. It must show, with live art, that the assets change. One primary action.
2. **`library.html`**: browse and search everything. Real catalogue data. Search and the main filter must work in the mock.
3. **`remix.html`**: the page for one asset, shown with the Hero (`knight`). Real controls, live picture.

Also `NOTES.md` (under 60 lines): palette (named hex values), type, the layout idea of each page as a small ASCII wireframe, how the design answers each complaint above, and one paragraph on how the bag and the playground would follow the same idea (those pages are not mocked).

### Hard requirements, all designs

- **Clean first.** One accent colour used sparingly, a strict spacing scale, a small set of components reused everywhere, one clear primary action per screen, generous space. If in doubt, remove. The art is the colour; the interface stays quiet.
- **Remix page: no scrolling to work.** At 1440x900 and at 1024x768 the picture, the animation picker, every control of the Hero (all 20, reachable through tabs, sections or steps inside a fixed-height panel), and the main action are usable without the page scrolling. The picture never leaves view. On a phone (390 wide) the picture stays pinned while controls scroll or page beneath it.
- **Fewer clicks, and changes are kept.** Changes save by themselves. Show that state in the interface ("Saved in your bag" or your own wording); there is no step a person can forget. Trying the asset against a scene happens on the same page (for example a switch that puts the Hero on `bg-forest` with ground).
- **Remix page content:** name and one-line description; the live Hero, large; play/pause and the 9 animations; the controls from `el.controls()` (they change as choices change: take the cape off and "Cape length" disappears); Surprise me; Start over; a look picker (a few of the 14 looks are enough to show); the sounds of the current animation in a tidy form (from `el.def.sounds[clip]`: which sound, on which frame; a mock play button is enough, no audio needed); download with pixel size 1x / 2x / 4x; which kits it belongs to. Secondary things (copy link, more like this) may be small or behind a menu.
- **Library content:** search box; a way to switch between Sprites, Sounds, Music and Kits; filters that do not bury the results (game type, theme, type: decide how); result count; cards with picture, name, one tag at most, and a quick way to add to the bag; a sound or music card must look deliberate too (they have a small drawn icon, a length in seconds and a play button). Show how a person changes an asset from here in as few clicks as possible.
- **Landing content:** what it is in one sentence a child understands; live proof that the art changes; the three kits; how it works (pick, change, try, download); that sounds and music are included; where it works (Unity and any engine that reads PNG and WAV; Unity package coming later); the real numbers. Sections must differ in layout from each other; do not stack five identical card rows.
- **Real art, live.** Use `mocks/shared/kit.js` (read `mocks/shared/README.md` and try `mocks/shared/test.html` first). Pixel art is always drawn with `image-rendering: pixelated` at whole multiples, never blurred, never stretched.
- **Fonts:** only the families in `mocks/shared/fonts.css` (your direction names yours). No network requests to other hosts. The pixel font may be used for the wordmark only, if at all; never for headings or body text.
- **Sizes:** design for 1440x900 first. It must also look right at 900 wide (the owner will first see it in a pane about that wide) and must not scroll sideways at 390.
- **Quality floor:** visible keyboard focus, text contrast at least 4.5:1, `prefers-reduced-motion` respected, real buttons and links, sentence case, no lorem ipsum.
- **Navigation:** the three pages link to each other through your own header. Put `<script type="module" src="../shared/mockbar.js"></script>` last in every page (a floating switcher for comparing designs; it sits at the bottom centre, keep that spot free of your own fixed controls).
- Avoid the marks of a generated page: an all-caps tracked label above every heading, one italic or coloured word in a headline, numbered 01/02/03 markers on things that are not steps, an arrow glued to every link, identical rounded cards with the same grey shadow everywhere, gradient washes as decoration, a monospace face for small labels.

### Rules of the job

- Write only inside `mocks/<your-folder>/`. Do not edit `mocks/shared/`, the site (`app/`, `index.html`), the engine or any sprite. If the shared kit lacks something, work around it in your own script and say so in your report.
- No git commands that change anything (no add, commit, checkout, stash). Other people are working in this folder.
- No new packages, no downloads.
- Check your own work by looking at it: `node mocks/shared/shot.mjs mocks/<your-folder>/landing.html <out.png> --width 1440 --height 900` (also `--full`, `--width 900`, `--width 390 --height 844`, `--click`). Put screenshots in the scratch folder you are given, read them, and fix what looks wrong: overlap, cramped or uneven spacing, blurry art, text that wraps badly, anything messy. Do at least two rounds of looking and fixing per page. The command prints page errors and sideways-scroll warnings: there must be none.
- When done, save final screenshots in `mocks/<your-folder>/shots/`: `landing.png` (1440x900), `landing-full.png` (full page), `library.png`, `remix.png` (1440x900), `remix-900.png` (900x700), `remix-phone.png` (390x844).

### Your report (final message)

Plain text, under 250 words: the idea in two sentences; what works in the mock and what is only drawn; anything in the requirements you did not meet and why; anything you would change with more time.
