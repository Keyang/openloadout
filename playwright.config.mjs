// Browser tests. One shared static server on port 5199; several test runs may use it at once.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5199', headless: true, viewport: { width: 1280, height: 900 } },
  webServer: { command: 'node tools/serve.mjs --port 5199', url: 'http://localhost:5199/index.html', reuseExistingServer: true, timeout: 20_000 },
});
