import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', testMatch: '*.spec.mjs', workers: 1, timeout: 60_000,
  use: { baseURL: 'http://localhost:3000', browserName: 'chromium', viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev:local', url: 'http://localhost:3000', reuseExistingServer: !process.env.CI, timeout: 120_000 },
});
