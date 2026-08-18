import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  fullyParallel: true,
  outputDir: './test-results',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  reporter: process.env.CI ? 'github' : 'list',
  testDir: './tests',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node src/server.js',
    cwd: process.env.APP_DIR || '../market',
    reuseExistingServer: !process.env.CI,
    url: 'http://127.0.0.1:3000',
  },
});
