// Helpers for browser tests. Import from tests/helpers/test.mjs for the `test` that also fails on console errors.
import fs from 'node:fs';
import { expect } from '@playwright/test';

/** Make the page's network quiet and local: no web fonts, no favicon request (neither is part of the site under test). */
export async function quietNetwork(page) {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route(/favicon\.ico$/, (r) => r.fulfill({ status: 204, body: '' }));
}

/**
 * Collect console errors and uncaught page errors. Returns { errors, expectNone() }.
 * Call expectNone() at the end of a test (the shared `test` in test.mjs does it for you).
 */
export function collectErrors(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) errors.push(`request failed: ${r.url()} (${r.failure()?.errorText})`); });
  return { errors, expectNone: () => expect(errors, 'the page should log no errors').toEqual([]) };
}

/**
 * Open a route such as '/sprite/knight' or '/' (the part after '#') and wait until the page has drawn:
 * the app has replaced its "Loading" text, and every canvas in the main area has a size.
 */
export async function openRoute(page, route = '/') {
  await page.goto(`/index.html#${route.startsWith('/') ? route : '/' + route}`, { waitUntil: 'domcontentloaded' });
  await waitForDrawn(page);
}

/** Wait until the page has content and its canvases are sized, then give the animation loop two frames. */
export async function waitForDrawn(page) {
  await page.waitForFunction(() => {
    const main = document.querySelector('#app main');
    if (!main || /^Loading/.test(main.textContent.trim())) return false;
    return [...main.querySelectorAll('canvas')].every((c) => c.width > 0 && c.height > 0);
  });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/**
 * Read a canvas: how many pixels are not fully transparent, and a hash of all its pixels.
 * `target` is a Locator for one canvas.
 */
export async function canvasStats(target) {
  return target.evaluate((cv) => {
    const { data } = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
    let opaque = 0, h = 2166136261;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 0) opaque++;
      h = Math.imul(h ^ data[i], 16777619); h = Math.imul(h ^ data[i + 1], 16777619);
      h = Math.imul(h ^ data[i + 2], 16777619); h = Math.imul(h ^ data[i + 3], 16777619);
    }
    return { opaque, hash: (h >>> 0).toString(16).padStart(8, '0'), width: cv.width, height: cv.height };
  });
}

/** The same two numbers for a group of canvases (the frame strip): total opaque pixels and one hash over all of them. */
export async function canvasGroupStats(locator) {
  return locator.evaluateAll((cvs) => {
    let opaque = 0, h = 2166136261;
    for (const cv of cvs) {
      const { data } = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 0) opaque++;
        h = Math.imul(h ^ data[i], 16777619); h = Math.imul(h ^ data[i + 1], 16777619);
        h = Math.imul(h ^ data[i + 2], 16777619); h = Math.imul(h ^ data[i + 3], 16777619);
      }
    }
    return { count: cvs.length, opaque, hash: (h >>> 0).toString(16).padStart(8, '0') };
  });
}

/** Click something that starts a download; returns { name, bytes: Buffer }. */
// `retries`: click again when no download starts within `timeout` (many downloads in one page can miss one under load).
export async function downloadFrom(page, click, { timeout = 60_000, retries = 0 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout }), click()]);
      const file = await dl.path();
      return { name: dl.suggestedFilename(), bytes: fs.readFileSync(file) };
    } catch (e) {
      if (attempt >= retries || !/waitForEvent/.test(String(e.message))) throw e;
    }
  }
}

/**
 * Set a range slider the way a person does: the value changes, then `input` and `change` fire
 * (the sites listen to `input` while dragging and `change` on release).
 * `value` is a number, or 'min' / 'max' / 'other' ('other' goes to whichever end is farther from where it is now).
 */
export async function setRange(locator, value) {
  await locator.evaluate((input, v) => {
    const min = Number(input.min || 0), max = Number(input.max || 100), now = Number(input.value);
    const target = v === 'min' ? min : v === 'max' ? max : v === 'other' ? (now - min > max - now ? min : max) : Number(v);
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    input.focus();
    set.call(input, String(target));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

/** True when the page scrolls sideways. */
export const hasHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
