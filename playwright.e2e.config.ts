import { defineConfig } from '@playwright/test'

/**
 * Playwright E2E Test Configuration for VulnAssesTool (Electron App)
 * Simplified config for running tests when preview server is already running
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 60000,
  reporter: [['html', { outputFolder: 'playwright-report' }], ['list']],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'electron',
      testMatch: /critical-flows\/.*\.spec\.ts$/,
    },
    {
      name: 'features',
      testMatch: /features\/.*\.spec\.ts$/,
    },
    {
      name: 'workflows',
      testMatch: /workflows\/.*\.spec\.ts$/,
    },
  ],
})
