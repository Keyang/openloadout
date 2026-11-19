# Design 3: Playroom

Bright, friendly and confident, for someone who has never made game art. Friendly through colour, scale and wording; tidy through one accent, one spacing scale and a small set of parts.

## Palette
- Paper `#ffffff` (the page) · Ink `#241c52` (text, selected states) · Soft ink `#5a5482` (secondary text, 6.9:1 on white)
- Mist `#f4f2fb` (quiet controls, the dock) · Line `#e3dff2`
- Fields, each owned by one section or kit: Sky `#bfe4f7` (the Hero, fantasy), Leaf `#c4e8b5` (Thornwood Keep, forest), Sun `#ffe28a` (Hearthvale, farm), Teal `#a8e2da` (Derelict Station, sci-fi), Dusk `#dacffa` (sounds, dungeon)
- Accent: Coral `#ff6b4a` with ink text (5.8:1). Used only for the one primary action of a screen and the sound dots.

## Type
Bricolage Grotesque 750 to 800 for headlines (tight, large). Figtree 400 to 700 for text and controls. No pixel font anywhere.
Spacing scale 4 8 12 16 24 32 48 72 112. Radii: 32 on fields, 20 on tiles and cards, 12 on buttons, full on pills.
Parts reused everywhere: field, tile, button (coral / ink / mist / white), pill, picture button, swatch, slider, round button.

## Layout
```
LANDING                           LIBRARY                         REMIX (wide; phone stacks the same parts)
[ sky field ...................]  [ big search box ...........]  ‹ Hero  description   kits  1x 2x 4x [Download] …
| Headline     HERO   Hair  o o|  Sprites Sounds Music Kits      +--------------------+ +---------------------+
| sentence     big    Weapon o |  (Game type)(Theme)(Kind)  137  | scene switch  Look | | Body Hair ... Sounds|
| [Browse]            Colour oo|  +----+ +----+ +----+ +----+    |                    | |---------------------|
|                 [Surprise me]|  |tile| |tile| |tile| |tile|    |     HERO (big)     | | picture buttons     |
[..............................]  | (+)| | (+)| | (+)| | (+)|    |                    | | swatches / sliders  |
wall: 12 versions of the Hero     name   name   name   name      | ▮▮   Surprise Start| |                     |
[leaf] Thornwood | live scene     tag    tag    tag    tag       +--------------------+ | ‹Back  Saved  Next› |
[sun ] live scene | Hearthvale    ~~~~~~ sheet slides up ~~~~~   Idle Walk Run Jump ...  +---------------------+
[teal] Derelict  | live scene     | live asset | 3 controls  |
1 Pick 2 Change 3 Try 4 Download  |            | [Add] [Change everything]
[dusk] sounds + footstep frames
Unity/PNG/WAV · numbers · [sun] closing action
```

## How it answers each complaint
- **Every element shouts** (pixel headings, outlines, hard shadows, graph paper): no outlines, no shadows except under a menu, a white page, and colour only as large flat fields. The art is the loudest thing on every screen.
- **Landing is a search box and a list; nothing shows the art can change**: the first screen is the Hero itself with hair, weapon and outfit colour as pictures to press, plus "Surprise me". Below it, twelve versions of the same Hero, and three live kit scenes that all restyle with one press of a look.
- **Seven filter groups, about fifty rows**: kind is four big tabs; everything else is three pills (Game type, Theme, Kind of thing) that open small menus with counts. Results start 340 px from the top.
- **Controls in a long column, picture scrolls away**: the picture never moves. The dock shows one category at a time (Body, Hair, Headgear, Weapon, Cape, Colours, Motion, Sounds), with choices as pictures of the Hero wearing each option. "Back" and "Next" walk through them. Nothing scrolls at 1440x900, 1024x768 or 900x700; on a phone only the dock's own panel scrolls.
- **Sounds as raw lists**: the Sounds tab shows the pictures of the current animation with a dot under the ones that make a noise, and one tidy row per sound.
- **Changes are lost unless you press "Add to my bag" again; trying is another page**: there is no save step. The first change puts the item in the bag and the dock says "Saved in your bag"; the bag count in the header moves. "Show in a scene" is a switch on the picture. The same holds in the library sheet, so the common case (pick, tweak two things, keep) is two or three clicks without leaving the grid.

## The bag and the playground (not mocked)
Both follow the remix layout: the thing you look at on the left or top, a dock of big controls beside or below it. The **bag** is a wall of tiles like the library, each showing your version, with a "Look" pill above the wall that restyles everything at once and one coral "Download all". Pressing a tile opens the same sheet as in the library, with your changes already in it. The **playground** is the remix page with the scene switch always on: the playable scene takes the stage, the dock lists what is in your bag as picture buttons, and pressing one opens its controls in the dock, so a change is seen in the scene at once and is kept, with no trip to another page.
