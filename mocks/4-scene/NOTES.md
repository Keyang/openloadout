# Design 4: Scene first

You never look at an asset alone: you see it in your game. The scene is the workspace and the bag ("your game") is always on screen, so trying a thing and changing it happen in the same place.

## Palette
- Stone `#dce1e5` (page), Well `#edf0f2` (picture backs), Surface `#ffffff` (work surfaces)
- Line `#c0c8cf`, Ink `#17212a`, Quiet ink `#4c5965`
- Slate `#1e2831` (the tray), Teal `#0a6a61` (the one accent: main action, selected thing, "changed" dot), Teal tint `#d7ebe8`
- The scene is the only large area of colour.

## Type
Schibsted Grotesk for everything (700 headings, 600 labels, 400/500 text; 60 / 34 / 24 / 16 / 14 / 13 / 12). Pixelify Sans for the wordmark only. Spacing 4 8 12 16 24 32 48 72 104; radius 6; 1px lines, one shadow (the popover).

## Layout
```
LANDING                          LIBRARY                         REMIX (one window, no scroll)
+---------------------------+--+ +------------------+----------+ +----------------+---------+--+
| headline      text + CTA  |Y | | search  game theme| YOUR GAME| | Hero  blurb    | saved ✓ |Y |
| +-----------------------+ |O | | Sprites Sounds .. | [scene]  | | +------------+ | tabs|   |O |
| | wide scene: click the | |U | | type chips        | Hero   x | | | scene, Hero| | Body|ctl|U |
| | hero, slime, sky ...  | |R | | [card][card][card]| Slime  x | | | large, rest| | Hair|   |R |
| +-----------------------+ |  | | [card][card][card]| Bat    x | | | faded      | | ... |   |  |
| kits | looks | surprise   |G | | (page scrolls,    | ...      | | +------------+ | Sounds  |G |
| steps / kits / sounds ... |A | |  panel stays)     |          | | play + clips   | surprise|A |
+---------------------------+ME+ +------------------+----------+ | frames + sounds| 1x2x4x DL|ME|
```
The tray is the right edge everywhere: slim on landing and remix, opened into a panel with a live scene in the library, a strip along the top on a phone.

## How it answers the complaints
- **"Messy, elements everywhere"**: four parts only (header, scene or grid, inspector or popover, tray). No pixel font, outlines or shadows; one accent; chips, swatches, sliders and tiles are the same components on all pages.
- **Landing shows nothing**: the hero is a live game scene. Click the Hero, slime, coin, sky, ground or hearts and change them there; kit names swap the scene, looks restyle it.
- **Fifty filter rows**: one search box, two small menus (kind of game, theme), a kind switch and one row of type chips.
- **Scrolling between picture and controls**: remix is one fixed window. Controls sit in eight tabs beside the scene; animations and the frame line with its sounds sit under it. On a phone the scene stays pinned.
- **Changes lost, too many clicks**: there is no save step. Every change is written to "your game" at once (status "Saved in your game", a dot on the tray picture, which redraws live). Changing something not yet picked adds it. One click on "+" adds; one click on a picture opens its controls where it is.
- **Trying is another page**: the scene is on every page. In remix the Hero stands among the other things you picked; "Plain background" gives the clean view.

## Bag and playground
They become one page, "Your game": the same scene at full width with the tray opened beside it, as in the library. Arrow keys walk the hero through it (the playground), clicking anything opens the same popover (the bag's "change"), and the list under the scene is the bag with its "changed" dots, take-out buttons, pixel size and Download. Nothing new to learn: it is the landing hero and the library panel, enlarged.

## Mock-up notes
- "Your game" is kept in the browser (localStorage), so a change on one page shows on the others.
- The strip of free space at the bottom of the remix page is kept clear for the mock-up switcher.
