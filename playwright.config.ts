import { defineConfig } from '@playwright/test'

/**
 * Playwright E2E Test Configuration for VulnAssesTool (Electron App)
 *
 * Uses Playwright's built-in _electron for Electron application testing.
 * Uses shared Electron instance pattern to avoid resource exhaustion.
 *
 * Setup requirements:
 * 1. globalSetup builds the app and starts the preview server
 * 2. Tests will launch the actual Electron application (shared instance)
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  globalTimeout: 1800000, // 30 minutes total timeout
  fullyParallel: false, // Electron apps must run sequentially
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1, // Single worker to reuse Electron instance
  timeout: 90000, // 90 seconds per test (increased for stability)
  expect: {
    timeout: 10000, // 10 seconds for assertions
  },

  reporter: [['html', { outputFolder: 'playwright-report' }], ['list']],

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15000, // 15 seconds for individual actions
    navigationTimeout: 30000, // 30 seconds for navigation
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
    {
      name: 'visual',
      testMatch: /visual\/.*\.spec\.ts$/,
      use: {
        screenshot: 'on',
        trace: 'on',
      },
    },
  ],
})
