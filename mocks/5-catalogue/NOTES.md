# 5 · Catalogue

A calm white catalogue: restrained type, a lot of space, and the pixel art on pale tiles like objects on a shelf.
Its own idea for cutting clicks: **ready-made versions first, fine-tuning second.**

## Palette
- Paper `#ffffff`: every page background.
- Ink `#000000`: text, the primary button, selected states.
- Second ink `#5c5c5c`: quiet text (6.7:1 on paper).
- Shelf `#f5f5f3`: the one surface. All art sits on it.
- Line `#e5e5e2`, control line `#cfcfcb`: the two greys for rules and control borders.
- Mark `#f26b1d`: the only accent, a 6px dot that means "you changed this" and "saved". Nowhere else.
No shadows, no gradients as decoration, one radius (6px).

## Type
Geist for everything. Scale 12 / 13 / 14 / 15 / 18 / 20 / 28 / 40 / 72, headlines weight 600 and tight (-0.04em),
body 400. Pixelify Sans only in the wordmark. Spacing scale 4 8 12 16 24 32 48 64 96 128.

## Layout of each page
```
LANDING (one column, 1120)          LIBRARY (1312)                      REMIX (fills the window, no scroll)
  headline, sentence                 [ search .............] smarter    +-- Hero ------------+-- Start from a version ----+
  [Browse everything] [Change Hero]  All Sprites Sounds Music Kits      | name, line, kits   | 12 ready-made Heroes       |
  [ search ]                         [Kit][Game][Theme][Type] n  sort   | +----------------+ | [Surprise me] [Start over] |
  == live line-up on a shelf ==      +--+ +--+ +--+ +--+ +--+ +--+      | |  live Hero     | +-- Fine-tune --------------+
  3 steps (pick / change / download) |  | |  | |  | |  | |  | |  |      | |  plain | scene | | Shape Parts Colours Motion |
  3 kits: scene | facts (rows)       +--+ +--+ +--+ +--+ +--+ +--+      | +----------------+ | Sounds Look  (one fits)    |
  text | 12 Heroes (4x3)             ... +  name, one tag               | animations (chips) +----------------------------+
  favourites (6-up cards)            list view = same rows, more facts  |                    | Saved in bag | 1x 2x 4x | Download
  text | sounds and music rows
  where it works, numbers, footer
```

## How it answers each complaint
- **"Messy, elements everywhere."** One surface, two greys, one radius, five components (button, chip, tab, tile, card)
  used on all three pages. Black is spent on the one primary action per screen; orange only on the changed/saved dot.
- **A landing that is a search box and a list.** The first screen has a live line-up from all three kits with a
  "Surprise me" that changes every one. Step 2 has real controls, and the sprite sheet in step 3 follows them. Each kit
  is a moving scene that takes a look (Sunset, Frost, Night ...) in one click.
- **Seven filter groups before any result.** Kind is a row of tabs with counts. Kit, Game type, Theme and Type are four
  small buttons in one row; a chosen one turns into a black token with an x. Results start about 270px from the top.
- **Scrolling back and forth on the asset page.** Two fixed columns. The Hero never moves. All 20 controls sit in four
  tabs that each fit the panel at 1440x900, 1024x768 and 900x700; Sounds and Look are two more. On a phone the picture
  is pinned and the controls scroll under it.
- **Changes not kept, too many clicks.** Nothing to press: every change is stored and the footer says "Saved in your
  bag". A version sets everything in one click; a changed control gets a dot and its own Reset. "In a scene" puts the
  Hero on forest ground on the same page. From the library, three dots on a card add a ready-made version directly.

## The bag and the playground
Both would keep the two-column idea of the remix page. The bag is the library's list view with only your things: a
row per asset with its picture as you changed it, the dots of its changes, pixel size and one Download; clicking a row
opens the same remix panel beside it, so there is no trip to another page and back. The playground is the remix stage
made playable: the scene on the left filling the window, and on the right the same panel (versions first, then tabs)
for whichever thing you click in the scene, saving as you go. A whole-kit look is one more row of version tiles there.
