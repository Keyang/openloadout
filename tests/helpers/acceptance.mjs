// Shared pieces of the acceptance tests (tests/e2e/journey.spec.mjs, whole-bundle.spec.mjs, three-bundles.spec.mjs):
// choosing assets from the catalogue as it is today, hearing what the page plays, reading the playground and a package.
// Nothing here calls into the site's own modules: a test built on it uses the site the way a visitor does.
import fs from 'node:fs';
import path from 'node:path';
import { expect } from '@playwright/test';
import { readZip } from './zip-read.mjs';
import { ROOT, readCatalogue, catalogueOf } from './catalog.mjs';

export { ROOT, readCatalogue, catalogueOf };

/** Every sound and music patch of the build, by id (generated/sounds.json: the file the site itself reads). */
export function readPatches(root = ROOT) {
  const file = path.join(root, 'generated', 'sounds.json');
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(JSON.parse(fs.readFileSync(file, 'utf8')).patches.map((p) => [p.id, p]));
}

// ---- choosing what a journey uses, by what the catalogue says about it (never by id) ---------------

/** The clips the playground's action key plays: attack, shoot or cast, with or without a direction. */
export const ACTION_CLIP = /^(attack|shoot|cast)(_(down|up|side))?$/;
const plainWord = (w) => /^[a-z]{3,}$/.test(w);
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * A word from an asset's own catalogue row that a person would type to find it. Where there is a choice, one that an
 * asset of another kind has too (so a "Kind" filter has something to take away), then the one fewest assets share.
 * Returns { word, shared } (shared: an asset of another kind lists the same word).
 */
export function searchWord(asset, catalog) {
  const words = asset.words.filter(plainWord);
  if (!words.length) return { word: asset.name, shared: false };
  const users = (w) => catalog.assets.filter((a) => a.words.includes(w));
  const rated = words.map((word) => ({ word, n: users(word).length, shared: users(word).some((a) => a.kind !== asset.kind) }));
  rated.sort((a, b) => Number(b.shared) - Number(a.shared) || a.n - b.n || (a.word < b.word ? -1 : 1));
  return { word: rated[0].word, shared: rated[0].shared };
}

/**
 * What one journey customises, chosen from the catalogue as it is today:
 *   sprite: a character the keyboard moves (role characters/player) that has at least one part, at least one sound,
 *           several controls and an action clip, in a frame that fits a bag tile;
 *   sound:  a short one-shot sound effect with a slider, which the sprite does not play itself (so it gets its own
 *           file in the package and its own button in the playground);
 *   track:  a music track with a choice of length and a choice of instrument.
 * Ties are broken by what the row says (more sounds, more parts), then by id, so two runs choose the same things.
 */
export function pickJourney(catalog, patches) {
  const { sprites, sounds, music } = catalogueOf(catalog);
  const heroes = sprites.filter((a) => a.role === 'characters/player' && (a.tech.parts ?? []).length >= 1 && (a.tech.sounds ?? 0) >= 1
    && (a.tech.controls ?? 0) >= 3 && a.tech.clips.some((c) => ACTION_CLIP.test(c.name)) && Math.max(...a.tech.frame) <= 64 && a.thumb)
    .sort((a, b) => b.tech.sounds - a.tech.sounds || b.tech.parts.length - a.tech.parts.length || byId(a, b));
  const sprite = heroes[0] ?? null;
  const own = new Set(sprite?.tech.soundIds ?? []);
  const sound = sounds.filter((a) => !a.tech.loop && a.tech.seconds <= 1.5 && (a.tech.controls ?? 0) >= 1 && !own.has(a.id) && a.words.some(plainWord)).sort(byId)[0] ?? null;
  const lengthOf = (p) => p.params.find((d) => d.unit === 'bars' && d.step);
  const instrumentOf = (p) => p.params.find((d) => Array.isArray(d.options) && d.options.length > 1);
  // the shortest length that is not the usual one, in seconds: music is rendered for the package, and shorter is quicker
  const shortest = (a) => { const d = lengthOf(patches[a.id]); const other = [d.min, d.min + d.step].find((v) => v !== d.default); return (a.tech.seconds * other) / d.default; };
  const track = music.filter((a) => patches[a.id] && lengthOf(patches[a.id]) && instrumentOf(patches[a.id])).sort((a, b) => shortest(a) - shortest(b) || byId(a, b))[0] ?? null;
  const missing = [!sprite && 'a player sprite with a part, a sound and an action clip', !sound && 'a short sound effect with a slider', !track && 'a music track with a choice of length and instrument'].filter(Boolean);
  if (missing.length) throw new Error(`The catalogue (generated/catalog.json) has nothing to walk the journey with: no ${missing.join('; no ')}.`);
  const p = patches[track.id];
  return { sprite, sound, track, length: lengthOf(p), instrument: instrumentOf(p) };
}

// ---- hearing ------------------------------------------------------------------------------------------

/**
 * Before the page loads: keep a hash of every audio buffer the page starts playing, in window.__played.
 * (Sound effects and rendered loops are played as buffers. Live music is not: its button says "Stop" while it plays.)
 */
export async function recordPlayed(target) {
  await target.addInitScript(() => {
    window.__played = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      const b = this.buffer;
      let h = 2166136261;
      if (b) for (let c = 0; c < b.numberOfChannels; c++) {
        const d = b.getChannelData(c);
        h = Math.imul(h ^ d.length, 16777619);
        for (let i = 0; i < d.length; i += 3) h = Math.imul(h ^ Math.round(d[i] * 32767), 16777619);
      }
      window.__played.push((h >>> 0).toString(16));
      return start.apply(this, args);
    };
  });
}
export const played = (page) => page.evaluate(() => (window.__played ?? []).slice());

/** Do something that should make a sound; returns the hash of the first buffer it started. */
export async function heardAfter(page, act, { timeout = 20_000 } = {}) {
  const n = (await played(page)).length;
  await act();
  await expect.poll(async () => (await played(page)).length, { timeout, message: 'a sound should start playing' }).toBeGreaterThan(n);
  return (await played(page))[n];
}

// ---- pictures -----------------------------------------------------------------------------------------

/** Every fully opaque colour in a group of canvases, as numbers 0xRRGGBB. */
export const coloursOf = (locator) => locator.evaluateAll((cvs) => {
  const seen = new Set();
  for (const cv of cvs) {
    const { data } = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] === 255) seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
  }
  return [...seen];
});

/** How many pixels of a canvas have exactly this colour ('#rrggbb'). */
export const inkOf = (locator, hex) => locator.evaluate((cv, c) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const { data } = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
  let n = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] === r && data[i + 1] === g && data[i + 2] === b) n++;
  return n;
}, hex);

// ---- the playground (read only: what the page itself reports about its scene) ---------------------------

/** Wait until the playground has built its scene. */
export const playReady = (page, timeout = 90_000) => page.waitForFunction(() => document.querySelector('main.play-page') && window.__loadoutPlay && window.__loadoutPlay.ready, null, { timeout });
/** The scene as the page reports it: mode, player, things, the sounds that fired, muted, music. */
export const playState = (page) => page.evaluate(() => window.__loadoutPlay.state());

/** Hold a finger on something (an on-screen playground button) until `until` resolves, then lift it. */
export async function touchHold(page, locator, until) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const point = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  try { await until(); } finally {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  }
}

// ---- a downloaded package -------------------------------------------------------------------------------

const text = (file) => new TextDecoder().decode(file.data);

/** A downloaded zip as { name, files, names, file(name), json(name), text(name) }. */
export function packageOf({ name, bytes }) {
  const files = readZip(new Uint8Array(bytes));
  const file = (n) => files.find((f) => f.name === n);
  return {
    name, files, names: files.map((f) => f.name), file,
    json: (n) => JSON.parse(text(file(n))),
    text: (n) => text(file(n)),
  };
}
export const isPng = (file) => Buffer.from(file.data.subarray(0, 8)).toString('hex') === '89504e470d0a1a0a';
export const isWav = (file) => new TextDecoder().decode(file.data.subarray(0, 4)) === 'RIFF' && file.data.length > 44;
export const sameBytes = (a, b) => Buffer.from(a.data).equals(Buffer.from(b.data));
