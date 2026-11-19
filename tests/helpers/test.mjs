// `test` for browser tests: quiet network, and the test fails if the page logs a console error or throws.
import { test as base, expect } from '@playwright/test';
import { quietNetwork, collectErrors } from './browser.mjs';

export const test = base.extend({
  page: async ({ page }, use) => {
    await quietNetwork(page);
    const errs = collectErrors(page);
    await use(page);
    errs.expectNone();
  },
});
export { expect };
export * from './browser.mjs';
export * from './panel.mjs';
export { readZip } from './zip-read.mjs';
