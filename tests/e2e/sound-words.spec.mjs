// Sound and music pages in everyday words, and no sound heard above full scale (final review, 2026-11-18).
// The pages are picked from the catalogue and the patches in sounds/: an effect with a control measured in a unit
// (the review saw "2200 Hz", "3 oct"), and a track (it saw "126 bpm", "0 semitones"). Nothing is hard-coded.
import fs from 'node:fs';
import path from 'node:path';
import { test, expect, openRoute } from '../helpers/test.mjs';
import { readCatalogue, catalogueOf, ROOT } from '../helpers/catalog.mjs';
import { technicalWords, TECHNICAL_WORDS } from '../../quality/sound.js';

const C = catalogueOf(readCatalogue());
const patchOf = (id) => JSON.parse(fs.readFileSync(path.join(ROOT, 'sounds', `${id}.json`), 'utf8'));
const withUnit = (row) => (patchOf(row.id).params ?? []).some((d) => d.unit && !d.options && !d.step);
const EFFECT = C.sounds.find(withUnit);
const TRACK = C.music.find(withUnit);
const UNITS = /\b(?:k?hz|bpm|rpm|oct|semitones?|db|ms)\b|\d\s*s\b/i;

/** Every word on the page a visitor reads in the title, the description and the editing panel, every Fine-tune tab of it opened in turn. */
async function shownText(page) {
  const read = () => page.evaluate(() => [...document.querySelectorAll('main h1, main .blurb, main .rx-panel')].map((n) => n.innerText).join('\n'));
  const texts = [await read()];
  for (const tab of await page.locator('.rx-panel [role="tab"]:visible').all()) { await tab.click(); texts.push(await read()); }
  return texts.join('\n');
}

for (const [kind, row] of [['sound', EFFECT], ['music', TRACK]]) {
  test(`the ${kind} page of "${row?.name}" shows no units or synthesizer words, and its sliders read as words`, async ({ page }) => {
    test.skip(!row, `no ${kind} with a unit control in the catalogue`);
    await openRoute(page, `/${kind}/${row.id}`);
    await expect(page.locator('main .rx-panel input[type=range]:visible').first()).toBeVisible();
    const text = await shownText(page);
    expect(text, 'a unit is shown').not.toMatch(UNITS);
    const found = TECHNICAL_WORDS.flatMap((w) => [...text.matchAll(new RegExp(w.re.source, 'gi'))].map((m) => m[0]));
    expect(found, 'technical words on the page').toEqual([]);
    expect(technicalWords(patchOf(row.id)), 'the patch itself').toEqual([]);
    // each slider's value and what a screen reader hears are words; moving it changes the word at the ends
    const sliders = page.locator('main .rx-panel input[type=range]');      // every tab's
    const n = await sliders.count();
    for (let i = 0; i < n; i++) {
      const s = sliders.nth(i);
      const value = s.locator('xpath=following-sibling::*[contains(@class,"hi")]');      // the slider's value, in words, at its end
      for (const end of ['0', '1']) {
        await s.evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, end);
        const shown = (await value.textContent()).trim();
        expect(shown, `slider ${i} at ${end}`).toMatch(/^[a-z][a-z ]*$/);
        await expect(s).toHaveAttribute('aria-valuetext', shown);
      }
    }
  });
}

// Every sound and music page, read as a visitor sees it at its standard settings: the catalogue decides which pages,
// so a new sound or track is covered with no change here. Text only (the sliders are moved in the tests above).
test('no sound or music page shows a unit or a synthesizer word', async ({ page }) => {
  test.setTimeout(240000);
  const bad = [];
  for (const [kind, rows] of [['sound', C.sounds], ['music', C.music]]) for (const row of rows) {
    await openRoute(page, `/${kind}/${row.id}`);
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.locator('main .rx-panel').first()).toBeVisible();
    const text = await shownText(page);
    const unit = text.match(UNITS);
    if (unit) bad.push(`${kind}/${row.id}: "${unit[0]}"`);
    for (const w of TECHNICAL_WORDS) for (const m of text.matchAll(new RegExp(w.re.source, 'gi'))) bad.push(`${kind}/${row.id}: "${m[0]}"`);
  }
  expect(C.sounds.length + C.music.length).toBeGreaterThan(0);
  expect(bad).toEqual([]);
});

// Several sounds at once (a sprite's cue clicked twice, an animation and a click) add up on the site's speakers.
// Each render peaks at 0.89; two at once used to reach 1.42 and distort. Measured at the speakers with an analyser.
const HOOK = () => {
  window.__peak = 0;
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (target, ...rest) {
    if (target instanceof AudioDestinationNode) {
      const ctx = target.context;
      if (!ctx.__probe) {
        const an = ctx.createAnalyser(); an.fftSize = 512; ctx.__probe = an;
        const buf = new Float32Array(512);
        const read = () => { an.getFloatTimeDomainData(buf); for (const v of buf) if (Math.abs(v) > window.__peak) window.__peak = Math.abs(v); };
        setInterval(read, 5);
      }
      connect.call(this, ctx.__probe);
    }
    return connect.call(this, target, ...rest);
  };
};

test('three sounds started together never reach the speakers above full scale', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'measured in Chromium');
  await page.addInitScript(HOOK);
  const row = C.sounds.find((a) => !a.tech.loop) ?? C.sounds[0];
  await openRoute(page, `/sound/${row.id}`);
  await page.locator('.stage-tools .tools-left button').first().click();       // a click lets the page play sound
  await page.waitForTimeout(300);
  const peak = await page.evaluate(async (id) => {
    const A = await import(new URL('app/audio.js', location.href).href);
    await A.loadSounds?.();
    const patch = A.soundById[id];
    const r = A.rendered(patch, A.soundParams(patch));
    const wait = (ms) => new Promise((ok) => setTimeout(ok, ms)), long = Math.min(1500, r.duration * 1000 + 300);
    A.stopAll(); await wait(400);
    window.__peak = 0; A.playRendered(r, { force: true }); await wait(long);
    const alone = window.__peak;
    A.stopAll(); await wait(400);
    window.__peak = 0;
    for (let i = 0; i < 3; i++) A.playRendered(r, { force: true });
    await wait(long);
    return { peak: window.__peak, alone, one: r.samples.reduce((m, x) => Math.max(m, Math.abs(x)), 0) };
  }, row.id);
  expect(peak.one, 'one render peaks under full scale').toBeLessThan(1);
  expect(peak.peak, 'something was heard').toBeGreaterThan(0.3);
  // one sound on its own is as loud as before the limiter: the master level (0.8) times the render's peak
  expect(Math.abs(peak.alone - 0.8 * peak.one), `one sound alone reached ${peak.alone}`).toBeLessThan(0.03);
  expect(peak.peak, 'three at once reach the speakers at or under full scale').toBeLessThanOrEqual(1);
});
