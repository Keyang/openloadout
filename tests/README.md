# Tests

Two kinds, both plain files with no build step.

| Kind | Where | Run it |
|---|---|---|
| Unit (Node's built-in runner) | `tests/unit/<area>-*.test.mjs` | `node --test tests/unit/<area>-*.test.mjs` (everything: `npm test`) |
| Browser (Playwright, Chromium) | `tests/e2e/<area>.spec.mjs` | `npx playwright test tests/e2e/<area>.spec.mjs` (everything: `npm run e2e`) |

Run your own area while you work, not the whole suite. The browser tests start the static server themselves (`playwright.config.mjs`, port 5199) or reuse one that is already running.

## Naming

- Unit: `tests/unit/<area>-*.test.mjs`, for example `engine-surface.test.mjs`, `engine-sound.test.mjs`.
- Browser: `tests/e2e/<area>.spec.mjs`. The regression net for what shipped first is `tests/e2e/smoke-<area>.spec.mjs` (`smoke-home`, `smoke-sprite`, `smoke-sound`).
- Shared code for tests: `tests/helpers/`. Fixtures (sample files): `tests/fixtures/`.

## Writing a unit test

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';

test('rect fills w x h pixels', () => {
  const g = new Surface(10, 10).rect(1, 1, 3, 2, '#fff');
  assert.equal(g.data.filter(Boolean).length, 6);
});
```

Engine code is plain ES modules that run in Node. Code under `app/` that touches `window` (`ui.js`, `audio.js`) cannot be imported in Node; `app/zip.js` can. Test behaviour that does not depend on exact asset content (build a tiny sprite or patch inline) so adding metadata or new assets never breaks it.

## Writing a browser test

Import from `tests/helpers/test.mjs`. Its `test` turns off web fonts and fails the test if the page logs a console error, throws, or a request fails.

```js
import { test, expect, openRoute, canvasStats, setRange, downloadFrom } from '../helpers/test.mjs';

test('the coin preview draws', async ({ page }) => {
  await openRoute(page, '/sprite/coin');                    // the part after '#'
  const { opaque } = await canvasStats(page.locator('canvas.stage'));
  expect(opaque).toBeGreaterThan(0);
});
```

Helpers (`tests/helpers/browser.mjs`): `openRoute` (open and wait until drawn), `collectErrors`, `canvasStats` (non-transparent pixel count and a hash of one canvas), `canvasGroupStats` (the same over many canvases, e.g. the frame strip), `downloadFrom` (click, return `{ name, bytes }`), `setRange` (set a slider so `input` and `change` both fire), `hasHorizontalScroll`. `readZip` (`tests/helpers/zip-read.mjs`) lists the files in a stored zip.

Tips:
- The preview canvas animates and its backdrop scrolls. To compare pictures, pause first (the Pause button), or compare the frame strip, which does not move.
- Audio cannot be heard. Test state (button text, no error). Browsers need a real click before audio starts, so click; do not call functions.
- Pick elements by role and visible text, as a person would. Do not count on exact numbers of sprites or sounds: assets get added. Use "at least".
- Music takes a while to start or render: give those waits 30 seconds.

## Tests that hold a redraw or a generator to old code that is gone

The old drawing code is deleted (docs/data-sprites.md section 5, R2b and R3), so a test that compared a redraw or a generator with it reads a record made while the code was still there, never the code:

- Records of old code (frozen copies, replays, pixel and box records) are gone (R3b): a data sprite is checked on its own.

A record is only as good as its proof: each was shown to fail when the redraw it guards is broken in a scratch copy (listed in the removal report).
