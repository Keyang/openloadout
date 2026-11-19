# Playground on one screen, the bag tray, and the workbench (2026-11-19)

Keyang, 2026-11-19: "I like design 4 for workbench and bag building - add them to the current design. also the
playground is too large - make it one screen so user can easily see all assets. still show the list of assets in bag on
the right so user can see different animations in the scene. also if user has background in the bag, the playground
should just use them."

Design 4 is `mocks/4-scene/` (read `NOTES.md`, `remix.html`, `library.html`, the tray code in `app.js` from
`mountRail`, and `shots/remix.png`, `shots/library.png`). We take two ideas from it into the current Catalogue look
(`docs/site-design.md`, `app/css/base.css` tokens): the **workbench** (a sprite shown standing in the creator's game,
with the animations and a frame line with its sounds under it) and **bag building** (the bag always on screen at the
right edge, filling up as the creator adds things). Colours, type and components stay the Catalogue ones; nothing from
design 4's palette or font comes across. Words stay "bag", not "your game".

## 1. Playground: one screen

Applies at 1440×900, 1024×768 and 900×700; at 390×844 the scene is pinned at the top and the rest scrolls under it.

- **No page scroll.** The page fills the window under the header. Nothing sits below the fold.
- **The whole scene is in view at once.** The creator sees every thing from the bag in the scene without walking: the
  level is one screen (or the view is fitted to the whole level), pixels stay crisp (whole-number zoom; any spare room
  is filled by the background, not a grey bar). Every sprite in the bag that belongs in the scene is visible on load.
- **Left: the scene**, as large as the room allows. Score, health and the bag's interface pieces sit over the scene's
  top edge (an overlay), not in a row above it. Under the scene, one compact bar: Pause, Mute, Reset, the view switch
  (side / top-down) when both are possible, and a short keys line. "Copy this level" moves into a small "More" menu.
- **Right: the list of what is in the bag**, scrolling inside itself. Each row: a live picture, the name, what it does
  in the scene in a few words, the change dot, and, for things in the scene, − count +. Sounds have a Play button;
  music has Play/Stop. Things drawn for the other view stay in the list, greyed, with one line saying why and the way
  to switch.
- **Pick a row → see it move.** Clicking a row marks that thing in the scene and shows its animations as chips under
  the scene. Clicking a chip plays that animation on that thing in the scene (it keeps playing it while chosen), so the
  creator sees every animation of every thing in place. For the character the player moves, chips play the move once.
- **Change it in place.** The chosen row has a Change button. It opens the same editing panel (`app/bag-edit.js`) in
  the right column, in place of the list, with "‹ All things in your bag" to go back. The scene takes each change at
  once, as today. A character row also offers "Play as this"; a background row "Use as background".
- **The bag's background is the scene's background.** When the bag holds a background that suits the view, the scene
  uses it, never the plain sky the playground draws for an empty bag. With several, the chosen one (from its row) is
  used; the first by default. Ground tiles in the bag make the ground, as today.
- The look of the whole bag stays reachable from the top of the right column, apart from any one thing's panel.

## 2. Bag building: the tray

- **Library (`#/browse`), 1024 px and wider:** a right-hand panel about 320 px wide, the full height under the header,
  that stays while the results scroll. Head: "Your bag", the count, Download (the bag's own download). Under it a short
  live scene of the bag (its background, ground and sprites, as in the playground) that opens the playground on click.
  Then the list: picture, name, type, change dot, × to take it out. Clicking a row opens that thing's page with its bag
  item. Empty bag: one sentence ("Press + on anything and it lands here.").
  Adding with + makes the new row appear at once; nothing else on the page moves.
- **Asset pages (sprite, sound, music), 1280 px and wider:** a slim column at the right edge, about 88 px: the count,
  Download, then the bag's pictures with change dots; the thing on the page is marked; "+N more" when they do not fit.
  The asset page keeps its no-page-scroll rule.
- Narrower than those widths the tray is not shown (the header's Bag button stays). It follows the bag live, including
  changes from another tab.

## 3. The workbench (sprite page)

- The stage's choice becomes **Plain | In your bag** (interface pieces keep their light and dark panels).
  "In your bag" draws the sprite standing in the creator's own scene: the bag's background and ground tiles when it has
  them (else the scene the page draws today), with up to six other sprites from the bag standing around it, quieter
  (faded), in the bag's look. The sprite on the page stands in front, full strength, and plays the chosen animation.
  This works whether or not the sprite is in the bag yet.
- **The frame line shows the sounds.** Above each frame on which a sound plays, a mark and the sound's name, as in
  design 4. Clicking a mark plays that sound.
- No page scroll at 1440×900, 1024×768 and 900×700, for every sprite (`tests/e2e/asset-layout.spec.mjs`).

## Owners

- Playground builder: `app/play-page.js`, `app/play/*`, `app/css/play.css`, playground tests. Exports used by others
  (`createPainter`, `makeLevel`, `levelFeatures`, `tileIndex`, `planScene`, `rowFromSprite`) keep their signatures.
- Tray and workbench builder: new `app/tray.js`, `app/bag-scene.js`, `app/css/tray.css`; `app/library-page.js`,
  `app/css/library.css`, `app/sprite-page.js`, `app/sound-page.js`, `app/music-page.js`, `app/stage.js`,
  `app/css/asset.css`, `index.html` (stylesheet link), and their tests.
