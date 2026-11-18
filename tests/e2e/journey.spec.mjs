// The whole path in one go (acceptance criterion 2: "user can search / customize / add / play / export assets").
// One visitor, one continuous visit, only what a person can do: type, press, drag a slider, press keys, download,
// reload, copy a link. Nothing is put in the bag behind the page's back, and the site's own modules are never called.
//
// What is customised is chosen from the catalogue as it is when the test runs (tests/helpers/acceptance.mjs,
// pickJourney): a playable character with a part and sounds, a short sound effect, a music track. So the test
// does not depend on how many assets there are, on their order, or on any one asset staying as it is.
//
// The two things a browser test cannot do as a person does are observed, not driven:
//   - hearing: every audio buffer the page starts is noted (recordPlayed); live music is read from its button;
//   - the playground scene: read from what the page reports about itself (window.__loadoutPlay.state()).
// Run with: npx playwright test tests/e2e/journey.spec.mjs
import { test, expect as baseExpect, waitForDrawn, canvasStats, canvasGroupStats, setRange, downloadFrom, hasHorizontalScroll, quietNetwork, collectErrors } from '../helpers/test.mjs';
import {
  readCatalogue, readPatches, pickJourney, searchWord, ACTION_CLIP, recordPlayed, played, heardAfter, coloursOf, inkOf,
  playReady, playState, touchHold, packageOf, isPng, isWav,
} from '../helpers/acceptance.mjs';

// Many builders share this machine: anything the page is waited for gets 20 seconds, not the usual 5.
const expect = baseExpect.configure({ timeout: 20_000 });

const INK = '#231b33';
const KIND_WORD = { sprite: 'Sprites', sound: 'Sounds', music: 'Music' };
const literal = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const box = (page) => page.getByRole('searchbox', { name: 'Search' });
const results = (page) => page.locator('ul.results > li');
const resultIds = (page) => results(page).evaluateAll((lis) => lis.map((li) => li.dataset.id));
const bagCount = (page) => page.locator('header .bag-count');
const bagRows = (page) => page.locator('.bag-item');
const addButton = (page) => page.locator('.add-to-bag').getByRole('button', { name: /^Add to (my )?bag$/ });
const hashQuery = (page) => page.evaluate(() => new URLSearchParams(location.hash.split('?')[1] ?? '').toString());
const queryOf = (text) => Object.fromEntries(new URLSearchParams(text));
/** What a bag row tells the visitor: its name, what it is, how it was set up, and where "Change" leads (without the bag's own key). */
const rowFacts = (page) => bagRows(page).evaluateAll((rows) => rows.map((r) => ({
  name: r.querySelector('.bag-name')?.textContent, kind: r.querySelector('.bag-kind')?.textContent, note: r.querySelector('.bag-text .hint')?.textContent,
  change: (r.querySelector('.bag-actions a')?.getAttribute('href') ?? '').replace(/[?&]bag=[^&]*/, ''),
})));

/**
 * The journey. `ui.press(locator)` is a click with a mouse or a tap with a finger; `ui.phone` switches the playground
 * to its on-screen buttons and checks every page for sideways scroll.
 */
async function journey({ page, browser, context }, ui) {
  const catalog = readCatalogue();
  const pick = pickJourney(catalog, readPatches());
  const { sprite, sound, track } = pick;
  test.info().annotations.push({ type: 'chosen', description: `sprite ${sprite.id}, sound ${sound.id}, track ${track.id}` });
  const fits = async (where) => { if (ui.phone) expect(await hasHorizontalScroll(page), `no sideways scroll on ${where}`).toBe(false); };
  await recordPlayed(page);

  /** From the home page: type a word, narrow by kind, and open the asset from its card. */
  async function find(asset) {
    const { word, shared } = searchWord(asset, catalog);
    await ui.press(box(page));
    await box(page).fill(word);
    await expect.poll(() => resultIds(page), { message: `searching "${word}" finds ${asset.id}` }).toContain(asset.id);
    await expect(page.locator('.result-line')).toContainText(`for "${word}"`);
    const found = await resultIds(page);
    await fits(`the results for "${word}"`);

    // a filter narrows what was found to one kind
    const option = page.getByRole('group', { name: 'Kind', exact: true }).getByRole('button', { name: new RegExp(`^${KIND_WORD[asset.kind]} \\d+$`) });
    if (!(await option.isVisible())) await ui.press(page.getByRole('button', { name: /^Narrow down/ }));      // on a phone the filters are folded away
    await ui.press(option);
    await expect(page.locator('.chips .chip').filter({ hasText: KIND_WORD[asset.kind] })).toBeVisible();
    await expect.poll(() => results(page).evaluateAll((lis, kind) => lis.length > 0 && lis.every((li) => li.dataset.kind === kind), asset.kind)).toBe(true);
    const narrowed = await resultIds(page);
    expect(narrowed).toContain(asset.id);
    expect(found).toEqual(expect.arrayContaining(narrowed));
    if (shared) expect(narrowed.length, `"${word}" also finds other kinds, so the Kind filter leaves fewer`).toBeLessThan(found.length);
    await fits('the filtered results');

    const li = page.locator(`ul.results > li[data-id="${asset.id}"]`);
    await li.scrollIntoViewIfNeeded();
    await ui.press(li.locator(`a[href="#/${asset.kind}/${asset.id}"]`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(asset.name);
    await waitForDrawn(page);
  }
  const goHome = async () => {
    await ui.press(page.locator('header a.brand'));
    await expect(box(page)).toBeVisible();
    await expect(results(page).first()).toBeAttached();
  };

  // ================================================================= home
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await waitForDrawn(page);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(bagCount(page)).toHaveText('0');
  await fits('the home page');

  // ================================================================= the sprite: found, changed three ways, added
  await find(sprite);
  await fits('the sprite page');
  const stage = page.locator('canvas.stage'), strip = page.locator('.strip .cell canvas');
  const firstClip = page.getByRole('group', { name: 'Animation' }).locator('button[aria-pressed="true"]');
  const firstClipName = await firstClip.textContent();
  const usual = new Set(await coloursOf(strip));                    // the colours of the sprite as it comes
  await ui.press(page.locator('.stage-tools').getByRole('button', { name: 'Pause', exact: true }));     // the preview holds still, so pictures can be compared
  let before = { stage: (await canvasStats(stage)).hash, strip: (await canvasGroupStats(strip)).hash };
  expect((await canvasStats(stage)).hash, 'the paused preview holds still').toBe(before.stage);
  /** The preview and the frame strip both show the change just made. */
  const previewChanged = async (what) => {
    await expect.poll(async () => (await canvasGroupStats(strip)).hash, { message: `${what} changes the frames` }).not.toBe(before.strip);
    await expect.poll(async () => (await canvasStats(stage)).hash, { message: `${what} changes the preview` }).not.toBe(before.stage);
    before = { stage: (await canvasStats(stage)).hash, strip: (await canvasGroupStats(strip)).hash };
  };

  // a slider
  const slider = page.locator('.panel input[type=range]:visible').first();
  const sliderKey = (await slider.getAttribute('id')).replace(/^c-/, '');
  await setRange(slider, 'other');
  const sliderValue = Number(await slider.inputValue());
  await previewChanged(`the "${sliderKey}" slider`);

  // a colour
  const swatches = page.locator('.panel .swatches[role=group]:visible').first();
  const colourKey = await swatches.evaluate((n) => n.closest('[data-control]').dataset.control);
  const colourValue = await swatches.locator('button.swatch[aria-pressed="false"]').last().getAttribute('data-v');
  const swatch = swatches.locator(`button.swatch[data-v="${colourValue}"]`);
  await ui.press(swatch);
  await expect(swatch).toHaveAttribute('aria-pressed', 'true');
  await previewChanged(`the "${colourKey}" colour`);

  // a part: another choice of something the sprite holds or wears (not the choice that takes the part off),
  // and one with which the sprite's action still makes a sound
  const actionClip = sprite.tech.clips.find((c) => ACTION_CLIP.test(c.name));
  const clipPill = (label) => page.getByRole('group', { name: 'Animation' }).getByRole('button', { name: label, exact: true });
  let part = null, paused = true;
  const blocks = page.locator('.panel section.group.part:visible');
  for (let b = 0; b < await blocks.count() && !part; b++) {
    const block = blocks.nth(b), pills = block.locator('.pills[role=group]').first();
    if (!(await pills.count())) continue;                                        // an on/off part: no choice to make
    const title = (await block.locator('h2').textContent()).trim();
    const options = await pills.locator('button.pill[aria-pressed="false"]').evaluateAll((bs) => bs.map((x) => ({ value: x.dataset.v, label: x.textContent })));
    for (const o of options) {
      await ui.press(pills.locator(`button.pill[data-v="${o.value}"]`));
      if (await block.evaluate((n) => n.classList.contains('off'))) continue;    // that choice takes the part off
      // the preview shows the choice (the still preview too, as long as it has not been started again)
      if (paused) await previewChanged(`the "${title}" choice ${o.label}`);
      else await expect.poll(async () => (await canvasGroupStats(strip)).hash, { message: `the "${title}" choice ${o.label} changes the frames` }).not.toBe(before.strip);
      // does the action still make a sound with it? (the sounds are listed under each animation)
      await ui.press(clipPill(actionClip.label));
      paused = false;                                                             // choosing an animation starts the preview again
      const sounding = await page.locator('.cues li.cue:not(.off)').count();
      await ui.press(clipPill(firstClipName));
      before.strip = (await canvasGroupStats(strip)).hash;
      if (!sounding) continue;
      part = { name: await block.getAttribute('data-part'), title, key: await pills.evaluate((n) => n.closest('[data-control]').dataset.control), ...o };
      break;
    }
  }
  expect(part, `${sprite.id} has a part with another choice that keeps a sound on "${actionClip.label}"`).toBeTruthy();
  await expect(page.locator(`.panel section.part[data-part="${part.name}"] button.pill[data-v="${part.value}"]`)).toHaveAttribute('aria-pressed', 'true');
  const mine = await coloursOf(strip);
  const onlyMine = mine.filter((c) => !usual.has(c));              // colours the sprite has only because of what was changed
  expect(onlyMine.length, 'the changes brought new colours into the sprite').toBeGreaterThan(0);
  const shows = (tile) => expect.poll(async () => { const have = new Set(await coloursOf(tile)); return onlyMine.filter((c) => have.has(c)).length / onlyMine.length; },
    { message: 'the picture in the bag has the colours chosen on the sprite page', timeout: 15_000 }).toBeGreaterThanOrEqual(0.5);

  await ui.press(addButton(page));
  await expect(bagCount(page)).toHaveText('1');
  await expect(page.locator('.add-to-bag')).toContainText('Added to your bag');
  await fits('the sprite page after the changes');

  // ================================================================= a sound: found, heard, changed, heard again, added
  await goHome();
  await find(sound);
  await fits('the sound page');
  const playSound = page.locator('.stage-tools .tools-left button');
  const firstTake = await heardAfter(page, () => ui.press(playSound));
  await expect(playSound).toHaveText('Play', { timeout: 20_000 });               // it ends by itself
  const soundSlider = page.locator('.panel input[type=range]').first();
  const soundKey = (await soundSlider.getAttribute('id')).replace(/^s-/, '');
  const soundShown = page.locator('.panel .field').first().locator('.value');
  const shownBefore = await soundShown.textContent();
  const changedTake = await heardAfter(page, () => setRange(soundSlider, 'other'));      // letting go of the slider plays the sound
  expect(changedTake, 'the changed sound is not the sound heard before').not.toBe(firstTake);
  await expect(soundShown).not.toHaveText(shownBefore);
  await expect.poll(async () => queryOf(await hashQuery(page))[soundKey], { message: 'the address carries the slider' }).toBeTruthy();
  const soundValue = Number(queryOf(await hashQuery(page))[soundKey]);
  await ui.press(addButton(page));
  await expect(bagCount(page)).toHaveText('2');

  // ================================================================= a music track: another length, another instrument, heard, added
  await goHome();
  await find(track);
  await fits('the music page');
  const lengthPills = page.getByRole('group', { name: pick.length.label, exact: true });
  const lengthNote = page.locator('.stage-tools .tools-left .hint');
  const usualLength = await lengthNote.textContent();
  // the shortest length on offer that is not the one it comes with (the buttons read "14 seconds")
  const lengths = await lengthPills.locator('button[aria-pressed="false"]').evaluateAll((bs) => bs.map((b) => ({ value: b.dataset.v, seconds: parseInt(b.textContent, 10) })));
  const shorter = lengths.sort((a, b) => a.seconds - b.seconds)[0];
  await ui.press(lengthPills.locator(`button[data-v="${shorter.value}"]`));
  await expect(lengthPills.locator(`button[data-v="${shorter.value}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(lengthNote).not.toHaveText(usualLength);
  await expect(lengthNote).toHaveText(new RegExp(`^${shorter.seconds} seconds long`));
  const instrumentPills = page.getByRole('group', { name: pick.instrument.label, exact: true });
  const instrumentValue = await instrumentPills.locator('button[aria-pressed="false"]').last().getAttribute('data-v');
  const instrument = instrumentPills.locator(`button[data-v="${instrumentValue}"]`), instrumentName = await instrument.textContent();
  await ui.press(instrument);
  await expect(instrument).toHaveAttribute('aria-pressed', 'true');
  const playMusic = page.locator('.stage-tools .tools-left button');
  await ui.press(playMusic);
  await expect(playMusic).toHaveText('Stop', { timeout: 60_000 });                // it is playing
  await ui.press(playMusic);
  await expect(playMusic).toHaveText('Play');
  await expect.poll(async () => queryOf(await hashQuery(page))[pick.instrument.id]).toBe(instrumentValue);
  expect(queryOf(await hashQuery(page))[pick.length.id]).toBe(shorter.value);
  await ui.press(addButton(page));
  await expect(bagCount(page)).toHaveText('3');

  // ================================================================= the bag: three things, as they were set up
  await ui.press(page.locator('.add-to-bag').getByRole('link', { name: 'Go to bag' }));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your bag');
  await expect(bagRows(page)).toHaveCount(3);
  await fits('the bag');
  const [spriteRow, soundRow, trackRow] = [0, 1, 2].map((i) => bagRows(page).nth(i));
  await expect(spriteRow.locator('.bag-name')).toHaveText(sprite.name);
  await expect(spriteRow.locator('.bag-kind')).toHaveText('Sprite');
  await expect(spriteRow).toContainText('Your own look');
  await expect(soundRow.locator('.bag-name')).toHaveText(sound.name);
  await expect(soundRow.locator('.bag-kind')).toHaveText('Sound');
  await expect(soundRow).toContainText('your own changes');
  await expect(trackRow.locator('.bag-name')).toHaveText(track.name);
  await expect(trackRow.locator('.bag-kind')).toHaveText('Music');
  await expect(trackRow).toContainText('your own changes');
  // "Change" leads back to each asset's page with exactly these settings
  await expect.poll(async () => (await rowFacts(page)).every((r) => r.change), { message: 'every row has its "Change" link' }).toBe(true);
  const facts = await rowFacts(page);
  const changeOf = (i) => queryOf(facts[i].change.split('?')[1] ?? '');
  expect(Number(changeOf(0)[sliderKey])).toBeCloseTo(sliderValue, 2);
  expect(changeOf(0)[colourKey]).toBe(colourValue);
  expect(changeOf(0)[part.key]).toBe(part.value);
  expect(Number(changeOf(1)[soundKey])).toBe(soundValue);
  expect(changeOf(2)[pick.length.id]).toBe(shorter.value);
  expect(changeOf(2)[pick.instrument.id]).toBe(instrumentValue);
  // the pictures: the sprite in the colours chosen, the sound's waveform, the track's note
  await shows(spriteRow.locator('canvas.tile'));
  await expect.poll(() => inkOf(soundRow.locator('canvas.tile'), INK), { message: 'the sound has a waveform' }).toBeGreaterThan(64 * 2);
  await expect.poll(() => inkOf(trackRow.locator('canvas.tile'), INK), { message: 'the track has its picture' }).toBeGreaterThan(50);
  // the sound in the bag is the changed one
  expect(await heardAfter(page, () => ui.press(soundRow.getByRole('button', { name: `Play ${sound.name}` })))).toBe(changedTake);

  // ================================================================= the playground, from the bag
  await ui.press(page.getByRole('link', { name: 'Try these in the playground' }));
  await playReady(page);
  const scene = page.locator('canvas.play-stage');
  await expect(scene).toBeVisible();
  await fits('the playground');
  const start = await playState(page);
  expect(start.player.id, 'the character in the bag is the one to play').toBe(sprite.id);
  await expect(page.locator('.play-things li', { hasText: sprite.name }).locator('.play-tag')).toHaveText(/your version/i);
  await expect(page.locator('.play-board').getByRole('button', { name: sound.name })).toBeVisible();
  const musicBox = page.locator('.play-music');
  await expect(musicBox).toContainText(track.name);
  await expect.poll(async () => { const s = await canvasStats(scene); return s.opaque === s.width * s.height; }, { message: 'the whole scene is painted' }).toBe(true);
  const sceneBefore = (await canvasStats(scene)).hash;

  // move: the right arrow key, or a finger on the on-screen button
  const moved = () => expect.poll(async () => (await playState(page)).player.x, { message: 'the character walks to the right', timeout: 20_000 }).toBeGreaterThan(start.player.x + 4);
  const pad = page.locator('.play-pad');
  if (ui.phone) {
    for (const name of ['Left', 'Right', 'Action']) await expect(pad.getByRole('button', { name, exact: true })).toBeVisible();
    await touchHold(page, pad.getByRole('button', { name: 'Right', exact: true }), moved);
  } else {
    await page.keyboard.down('ArrowRight');
    await moved();
    await page.keyboard.up('ArrowRight');
  }
  await expect.poll(async () => (await canvasStats(scene)).hash, { message: 'the scene changed' }).not.toBe(sceneBefore);
  // the first key press (or touch) starts the music
  await expect(musicBox.getByRole('button', { name: /^Stop music/ })).toBeVisible({ timeout: 60_000 });
  expect((await playState(page)).music).toBe(true);

  // the action: its animation plays and the sprite's own sound fires on it
  const buffers = (await played(page)).length;
  const actionSound = async () => (await playState(page)).heard.find((h) => h.by === sprite.id && ACTION_CLIP.test(h.clip ?? ''));
  await expect(async () => {
    if (ui.phone) await pad.getByRole('button', { name: 'Action', exact: true }).tap(); else await page.keyboard.press('KeyX');
    await expect.poll(async () => !!(await actionSound()), { timeout: 4000 }).toBe(true);
  }, 'the action plays a sound of the sprite').toPass({ timeout: 30_000 });
  const fired = await actionSound();
  expect(sprite.tech.soundIds, `"${fired.sound}" is one of the sprite's own sounds`).toContain(fired.sound);
  await expect.poll(async () => (await played(page)).length, { message: 'the sound was really played' }).toBeGreaterThan(buffers);
  // a sound from the bag, on its button (once the character stands still again, so no sound of its own is on the way)
  await expect.poll(async () => (await playState(page)).player.clip, { message: 'the character stands still again' }).toMatch(/^idle/);
  expect(await heardAfter(page, () => ui.press(page.locator('.play-board').getByRole('button', { name: sound.name })))).toBe(changedTake);

  // the music can be muted
  await ui.press(page.getByRole('button', { name: 'Mute', exact: true }));
  await expect(musicBox.getByRole('button', { name: /^Play music/ })).toBeVisible();
  const quiet = await playState(page);
  expect([quiet.muted, quiet.music]).toEqual([true, false]);
  await ui.press(page.getByRole('button', { name: 'Unmute', exact: true }));
  expect((await playState(page)).muted).toBe(false);
  await fits('the playground after playing');

  // ================================================================= back to the bag: download
  await ui.press(page.getByRole('link', { name: 'Back to your bag' }));
  await expect(bagRows(page)).toHaveCount(3);
  const zipChoice = page.getByRole('radio', { name: 'Zip package' });
  const unity = page.getByRole('radio', { name: 'Unity package (coming later)' });
  await expect(zipChoice).toBeChecked();
  await expect(unity).toBeVisible();
  await expect(unity).toBeDisabled();
  await page.getByText('Unity package (coming later)').click({ force: true });      // pressing its label chooses nothing
  await expect(unity).not.toBeChecked();
  await expect(zipChoice).toBeChecked();

  const download = page.getByRole('button', { name: 'Download', exact: true });
  const zip = packageOf(await downloadFrom(page, () => ui.press(download), { timeout: 240_000 }));
  await expect(page.locator('.bag-export .status')).toContainText('Downloaded');
  expect(zip.name).toMatch(/\.zip$/);
  const folder = `sprites/${sprite.id}`;
  for (const name of [`${folder}/${sprite.id}.png`, `${folder}/${sprite.id}.json`, `${folder}/how-to-use.txt`, `sounds/${sound.id}.wav`, `music/${track.id}.wav`, 'manifest.json', 'read-me.txt']) expect(zip.names, name).toContain(name);
  // the sprite: its sheet, and the settings and the part chosen
  expect(isPng(zip.file(`${folder}/${sprite.id}.png`)), 'the sheet is a PNG').toBe(true);
  const sheet = zip.json(`${folder}/${sprite.id}.json`);
  expect(sheet.sprite).toBe(sprite.id);
  expect(Number(sheet.params[sliderKey]), `the sheet was made with the "${sliderKey}" slider as it was set`).toBeCloseTo(sliderValue, 5);
  expect(sheet.params[colourKey]).toBe(colourValue);
  expect(sheet.params[part.key]).toBe(part.value);
  expect(sheet.parts[part.name]).toMatchObject({ present: true, settings: { [part.key]: part.value } });
  expect(Object.keys(sheet.animations)).toEqual(sprite.tech.clips.map((c) => c.name));
  // the sound the action fired in the playground comes with the sprite
  const actionCue = (sheet.sounds[fired.clip] ?? []).find((c) => c.sound === fired.sound);
  expect(actionCue, `the sheet lists "${fired.sound}" on "${fired.clip}"`).toBeTruthy();
  expect(isWav(zip.file(`${folder}/${actionCue.file}`)), `${folder}/${actionCue.file} is a WAV`).toBe(true);
  // the sound and the track
  expect(isWav(zip.file(`sounds/${sound.id}.wav`))).toBe(true);
  expect(isWav(zip.file(`music/${track.id}.wav`))).toBe(true);
  // the list of everything, with the settings made on the way
  const manifest = zip.json('manifest.json');
  expect(manifest.missing).toBeUndefined();
  expect(manifest.assets.map((a) => [a.kind, a.id])).toEqual([['sprite', sprite.id], ['sound', sound.id], ['music', track.id]]);
  const [ms, ma, mt] = manifest.assets;
  expect(ms).toMatchObject({ name: sprite.name, role: sprite.role, type: sprite.type });
  expect(ms.files).toEqual(expect.arrayContaining([`${folder}/${sprite.id}.png`, `${folder}/${sprite.id}.json`]));
  expect(Number(ms.settings?.params?.[sliderKey]), `the list has the "${sliderKey}" slider as it was set`).toBeCloseTo(sliderValue, 5);
  expect(ms.settings?.params?.[colourKey], `the list has the "${colourKey}" colour chosen`).toBe(colourValue);
  expect(ms.settings?.params?.[part.key], `the list has the "${part.title}" choice`).toBe(part.value);
  expect(ma).toMatchObject({ name: sound.name, role: sound.role, files: [`sounds/${sound.id}.wav`] });
  expect(ma.settings?.params?.[soundKey], `the list has the sound's "${soundKey}" slider as it was set`).toBe(soundValue);
  expect(mt).toMatchObject({ name: track.name, role: track.role, files: [`music/${track.id}.wav`] });
  expect(String(mt.settings?.params?.[pick.length.id]), 'the list has the length chosen').toBe(shorter.value);
  expect(String(mt.settings?.params?.[pick.instrument.id]), 'the list has the instrument chosen').toBe(instrumentValue);
  expect(Math.abs(mt.seconds - shorter.seconds), `the track is the ${shorter.seconds} seconds chosen (it is ${mt.seconds})`).toBeLessThanOrEqual(1);
  // a guide
  const guide = zip.text('read-me.txt');
  for (const name of [sprite.name, sound.name, track.name, 'manifest.json', 'Unity']) expect(guide).toContain(name);
  test.info().annotations.push({ type: 'settings', description: `${sliderKey}=${sliderValue}, ${colourKey}=${colourValue}, ${part.key}=${part.value}; ${soundKey}=${soundValue}; ${pick.length.id}=${shorter.value}, ${pick.instrument.id}=${instrumentValue} (${instrumentName})` });

  // ================================================================= the bag survives a reload
  const kept = await rowFacts(page);
  await page.reload();
  await expect(bagRows(page)).toHaveCount(3);
  await expect(bagCount(page)).toHaveText('3');
  await expect.poll(() => rowFacts(page), { message: 'after a reload the bag lists the same three things, set up the same way' }).toEqual(kept);
  await shows(bagRows(page).nth(0).locator('canvas.tile'));
  await fits('the bag after a reload');

  // ================================================================= its link opens the same bag for someone else
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await ui.press(page.getByRole('button', { name: 'Copy link to this bag' }));
  await expect(page.locator('.bag-link-note')).toContainText('Link copied');
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toContain('#/bag?load=');

  const elsewhere = await browser.newContext({ viewport: page.viewportSize(), hasTouch: !!ui.phone });
  try {
    const other = await elsewhere.newPage();
    await quietNetwork(other);
    const errors = collectErrors(other);
    await other.goto(link, { waitUntil: 'domcontentloaded' });
    await expect(other.locator('.bag-item')).toHaveCount(3);
    await expect(other.locator('.bag-link-note')).toContainText('Opened a shared bag with 3 items');
    await expect(other.locator('header .bag-count')).toHaveText('3');
    await expect.poll(() => rowFacts(other), { message: 'the shared bag lists the same three things, set up the same way' }).toEqual(kept);
    await shows(other.locator('.bag-item').nth(0).locator('canvas.tile'));
    if (ui.phone) expect(await hasHorizontalScroll(other), 'no sideways scroll on the shared bag').toBe(false);
    errors.expectNone();
  } finally {
    await elsewhere.close();
  }
}

test('search, customise, add, play and export: a sprite, a sound and a track from the home page to the package', async ({ page, browser, context }) => {
  test.setTimeout(480_000);
  await journey({ page, browser, context }, { phone: false, press: (target) => target.click() });
});

test.describe('on a phone (375 px wide, by touch)', () => {
  test.use({ viewport: { width: 375, height: 740 }, hasTouch: true });

  test('the same journey with taps and the on-screen playground buttons, and no page scrolls sideways', async ({ page, browser, context }) => {
    test.setTimeout(480_000);
    await journey({ page, browser, context }, { phone: true, press: (target) => target.tap() });
  });
});
