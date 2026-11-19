# Direction 1: Studio

Loadout as a calm, professional creative tool. The product is the pitch: the first thing on the
landing page is a small working editor, and every page lets you change the art where you are.

## Palette
- Paper `#F7F8FA` (page), White `#FFFFFF` (bars and panels), Stage `#ECEEF2` (the plane art stands on)
- Hairline `#E1E4EA`, Control line `#C9CED8`
- Graphite `#1B1E26` (text), Slate `#565D6E` (secondary text, 6:1 on white)
- Cobalt `#3346E6` (the one accent: primary action and selected state), with tint `#ECEEFD` and ink `#2434C4`
- One shadow only, on floating panels (hero editor, bag, download, menus). Everything else is a hairline.

## Type
Instrument Sans for everything: 56/600 headline, 32/600 section, 18 lede, 16 body, 14 interface,
12-13 secondary. Pixelify Sans for the wordmark only. Spacing scale 4 8 12 16 24 32 48 72 112.

## Layout of each page
```
LANDING                          LIBRARY                            REMIX (fills the window)
+------------------------------+ +--------------------------------+ +--------------------------------+
| logo  nav               bag  | | logo  nav                 bag  | | logo / Hero  saved  dice undo  DL|
| Headline      +------------+ | | [Sprites|Sounds|Music|Kits]    | +------+----------------+--------+
| one sentence  | live Hero  | | |  game v  theme v  type v  [q ] | | name |                | Body  >|
| [Browse]      | 5 controls | | +----------------------+---------+ | anims|   big stage    | Hair  v|
|               +------------+ | | card card card card   | quick   | | list |   live Hero    |  ....  |
| 3 kits as live scenes + look | | card card card card   | look:   | |      +----------------+ Weapon v|
| 4 steps (pick change try dl) | | card card card card   | live,   | | scene| play  frame  spd|  ....  |
| one Hero, a dozen ways       | | ...                   | 4 ctrls | | on/of| sounds on frames| Cape  >|
| sounds list | where it works | |                       | [Add]   | | kits | 14 look swatches| Colours|
| numbers, one closing action  | |                       | [Editor]| |      |                | Motion |
+------------------------------+ +----------------------+---------+ +------+----------------+--------+
```

## How it answers each complaint
- **"Messy, elements everywhere, everything shouts."** No pixel font on headings, no outlines, no
  hard shadows, no graph paper. Six components (button, chip, slider, swatch, switch, hairline row)
  are reused on all three pages. Colour comes only from the art.
- **"The landing page is a search box and a list."** The hero is a real editor: click a hair style
  and the Hero changes. Below it one look switch restyles all three kit scenes at once, and twelve
  Heroes show how far one sprite goes.
- **"Fifty filter rows before any result."** One slim bar: a four-way kind switch with live counts,
  three dropdowns and the search. Nothing sits beside or above the grid.
- **"Scroll back and forth to change the cape."** The remix page never scrolls. The picture is in
  the centre; controls are sections in a fixed right pane, each showing its current value when
  closed. On a phone the picture and the animation picker stay pinned and the controls scroll under.
- **"Changes are lost unless I press Add again; trying it is another page."** Any change is kept in
  the bag at once and the bar says "Saved in your bag". It carries across pages (try the landing
  editor, then open the remix page). "Try it in a scene" is a switch beside the stage.
- **"Too many clicks."** A library card opens a quick look on the same page: live picture, its
  four most useful controls, Surprise me, Add to bag. Changing a slime's eyes is two clicks from the grid.

## Bag and playground (not mocked)
Both would be the remix layout again. The **bag** is the same three panes with the left rail listing
what you picked (grouped by kit) instead of animations: select one and the centre and the inspector
are exactly the editor, so a change in the bag is the same change, saved the same way; the look row
under the stage restyles everything in the bag at once and Download stays the one primary action.
The **playground** is the "try it in a scene" switch grown up: the stage becomes the playable scene,
the rail lists the bag, and clicking a character in the scene opens its controls in the inspector
without leaving, so there is nothing to carry back.
