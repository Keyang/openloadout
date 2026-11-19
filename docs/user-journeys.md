# User journeys

What a creator does on Loadout, step by step, and what they should see at each step. A journey passes only if every
expectation holds in a real browser at 1440×900, 1024×768 and 900×700, and the main steps also work at 390×844 (phone).
The creator is non-technical: an indie game maker who wants art and sound for a 2D game without drawing or composing.

**Ready-made bag.** Journeys that need a bag start from `tests/fixtures/journeys/bag-link.txt`: open
`http://localhost:<port>/index.html` followed by that link, in an empty browser, and keep the bag. It holds the
Knight (a version and the Night look), Coin pickup (a version) and Battle theme (a version).

## Rules every page keeps

These come from the user's own complaints (2026-11-19): the old site was messy, changes did not stick, it took too many
clicks, and making a change meant scrolling back and forth. They apply to every step of every journey below.

- **R1. A change shows where it is made.** When a creator changes something, the result is visible on the same screen
  within 1 s, without scrolling or going to another page. Moving a slider, picking a version, picking a
  look, or changing a sound's settings: they see the new picture or hear the new sound right there.
- **R2. A change sticks.** A change is saved by itself. It is still there after a reload, after leaving and coming
  back, and on every other page that shows the same item (bag, playground, kit page, asset page).
- **R3. One place, one truth.** The same item looks and sounds the same on every page: the same picture, the same
  look, the same sound settings, the same count of changes.
- **R4. The way on is obvious.** At every step the next thing to do has one clear button in everyday words. No dead
  ends: every page has a way back to where the creator came from and a way on (to the bag, to play, to download).
- **R5. Few clicks.** The common jobs take few steps: find something (search or browse: 1–2 steps), change it (1 step
  per change), add it to the bag (0–1 steps, since a change already adds it), try it (1 step), download (1 step).
- **R6. Words a creator understands.** No code words (no "params", "preset", "seed", "theme JSON", ids such as
  `knight` in place of "Knight"). Status lines say what happened ("Saved in your bag", "Downloaded …").
- **R7. Tidy.** Nothing overlaps, nothing is cut off, no sideways scroll, no console errors, and the panel does not
  scroll inside itself at 1440×900, 1024×768 or 900×700.

## J1. First visit: what is this, and is it for me?

1. Open `#/` (landing).
   - The top of the page says in one line what Loadout gives (free game art and sound you can change) and shows live,
     moving sprites, not a static picture.
   - One main button leads into the library; Surprise me shows something new.
   - Without scrolling: the headline, the main button into the library, and moving sprites. The kits and the steps
     that show how changing works are within one scroll.
2. Use the landing's "change the Hero" step.
   - Moving one of its controls changes the Hero picture right there (R1).
   - A clear way leads on to the Hero's own page with that change kept (R2).
3. Click a kit on the landing.
   - It opens that kit's page; its sprites are moving and its sounds can be played.

## J2. Find something specific

1. From the landing, search "slime".
   - The library opens with results that are slimes first; the search box keeps the word.
2. Narrow it: filter by kind (sprites) and by a kit.
   - Each filter shows as a chosen token with ×; the count of results updates; Clear removes them all.
3. Open a result, then press Back.
   - Back returns to the same results, the same filters and the same place on the page.
4. Search something that finds nothing ("xylophone dragon").
   - The page says nothing matched and offers a way on (clear the search, or browse everything), not a blank area.

## J3. Change a sprite and keep it

1. Open a sprite page (the Knight, `#/sprite/knight`).
   - Left: the moving sprite and its animations; right: versions, then the controls in tabs. No page scroll.
2. Pick a version, then change one colour and one shape control.
   - Each change shows on the big picture at once (R1); the changed tab and control get the change dot.
   - The footer says "Saved in your bag" with the number of changes; the bag count in the header goes up to 1 the
     first time, and not again for later changes (R2).
3. Pick a look in the Look tab.
   - The picture recolours at once; the download will be in that look.
4. Reload the page.
   - Everything is as it was: version, colour, shape, look (R2).
5. Open the bag.
   - The Knight is there with the same picture and look, and says what was changed in words (R3).
6. Start over on the sprite page.
   - The picture goes back to its defaults within 1 s. The footer says 0 changes, the item is still in the bag, and
     the bag row shows the defaults.

## J4. Change an item from inside the bag (the user's example)

1. Open the ready-made bag (a sprite, a sound, a music track).
2. Open the bag (`#/bag`) and click the sprite's row.
   - The editing panel opens beside the list without leaving the page.
   - **The creator can see the item they are changing while they change it (R1).** The panel shows the item's own
     live picture, at least 4× the row thumbnail and at least 160 px tall. That picture and the control being
     changed are both in view at 1440×900, 1024×768 and 900×700 without scrolling.
3. Change a colour, then a look, in that panel.
   - The picture they are looking at changes within a second of each change (R1).
   - The row's description of what was changed updates (R3).
4. Close the panel (or click another row).
   - The list shows the new picture; nothing reverts (R2).
5. Click the sound's row and change a slider.
   - The creator can hear it from the panel (a Play button right there), without closing the panel (R1).
6. Reload.
   - All changes are still there (R2).
7. Open the same sprite's own page from the bag.
   - It opens with the bag item's settings, and changes made there update the same bag item, not a new one (R3).
8. Start over, remove, empty.
   - Start over (in the panel) puts the picture back to its defaults; the item stays in the bag with 0 changes.
   - Remove from bag takes the row away and lowers the header count by 1 at once.
   - Removing the last item shows an empty bag with one sentence and a way to browse; Download is disabled or hidden.
9. Back button.
   - With a panel open, browser Back closes the panel and stays on the bag. A second Back leaves the bag.

## J5. Change an item from inside the playground

1. With the ready-made bag, open the playground (`#/play`).
   - The scene shows the bag's sprites in a playable little level; the controls to move are said on screen.
2. Pick a sprite to change (from the scene or a list) and change a colour.
   - The panel shows that item's own picture at the top, as in J4.2, and the sprite in the scene changes within 1 s
     (R1).
3. Leave the playground and open the bag.
   - The change is there (R2, R3). Back in the playground it is still there.
4. Change the whole look of the playground/bag.
   - Every item in the scene takes the look at once, except items with a look of their own.

## J6. Restyle a whole kit

1. Open Kits (`#/bundles`) and open a kit.
   - The kit shows all its sprites moving and lists its sounds and music; its size (how many things) is said.
2. Pick a look for the whole kit.
   - Every sprite in the kit recolours at once, and sounds play in the look (R1).
3. Change one item inside the kit (if offered).
   - Its change shows at once in the kit view.
4. Add the whole kit to the bag.
   - Only items not already in the bag are added (no duplicates). The bag count goes up by that number, and one
     message says how many were added and how many were already there.
   - In the bag, those items wear the kit's look (R3).
5. Download the kit.
   - One zip, its name says what it is; the message says what is inside.

## J7. Sounds and music

1. Open a sound (`#/sound/coin-pickup`).
   - A big Play button; pressing it plays at once. Versions are named in words.
2. Pick a version, then move a slider.
   - The new sound plays once when the slider is released (not on every step while dragging) (R1); the footer says
     it is saved (R2).
3. Pick a look in the Look tab.
   - Each look says what it does to the sound ("Higher and brighter"); choosing one plays it.
4. Open a music track and press Play, then move a slider while it plays.
   - The music changes while it plays (R1). Picking a look while it plays restarts it in the look.
5. Open the bag: the sound and the track are there with their changes and can be played from the list (R3).

## J8. Download and use

1. From the bag, press Download.
   - One zip arrives; the message says what is in it (pictures, sounds, music, a short guide) in words.
   - Open the zip: the Knight's sheet has the same colours and look as its bag row, and the sound file is the
     changed version (R3).
2. From a sprite page, download at a pixel size.
   - The size choice is clear (what size the pictures will be); the message names the file.
3. The Unity package option is shown as coming later, not as a broken button.

## J9. Share and come back

1. In the bag, copy the bag's link. Open it in a fresh browser (empty storage).
   - The same items with the same changes and looks appear; the creator is told this is a shared bag and can keep it.
2. From a sprite page with changes, copy the link; open it fresh.
   - The sprite opens with the same changes; it is not in the bag until changed or added, and the page says how to
     add it.
3. Open an old or broken link (`#/sprite/nothing`).
   - A plain "not here" page with a way back.

## J10. Phone

1. At 390×844, do J2 steps 1–3, J3 steps 2–4 and J4 steps 2–3.
   - On the asset page and in the bag's panel, the picture stays pinned at the top while the controls scroll under
     it, so a change shows without scrolling up. No sideways scroll; text is at least 12 px.

## J11. Two tabs

1. Open the Knight in tab A and the bag in tab B. Change a colour in A, then switch to B.
   - Within 1 s (or after a reload at most) B shows the new colour.
2. Change a different control on the Knight in B, then another in A.
   - Neither change is lost: both are in the bag afterwards.

## J12. A browser that will not keep the bag

1. With site storage blocked, open a sprite and make a change.
   - The footer shows the "not kept" warning, not "Saved". It offers Copy link as the way to keep the work.

## J13. Keyboard and reduced motion

1. With Tab alone: reach a bag row, Enter opens its panel, the arrow keys move a slider and the picture updates, Esc
   closes the panel and focus returns to the row. Focus is visible at every step. The same on a sprite page.
2. With reduced motion on, sprites do not animate by themselves until Play is pressed.

## Decisions for the owner (not tested)

- One bag item per asset: a red Knight and a blue Knight cannot both be in the bag. Should duplicating be allowed?
- Undo beyond each control's Reset and Start over is not offered.

## Tester groups (each starts from an empty browser)

- **A. Finding:** J1, J2, J9.3.
- **B. Asset pages:** J3, J7, J8.2, the sprite-page part of J13.
- **C. Bag editing:** J4, J8.1, J8.3, J9.1, the bag part of J13.
- **D. Playground and kits:** J5, J6.
- **E. Keeping changes:** J11, J12, J9.2, reloads across pages.
- **F. Sizes and access:** J10, the 900×700 runs of J3 and J4, J13.2.
