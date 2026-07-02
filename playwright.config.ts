import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  globalTimeout: 1800000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 60000,
  expect: {
    timeout: 10000,
  },

  reporter: [['html', { outputFolder: 'playwright-report' }], ['list']],

  use: {
    baseURL: 'http://127.0.0.1:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },

  webServer: {
    command: 'node --env-file=.env.e2e dist/server/index.js',
    port: 3001,
    timeout: 30000,
    reuseExistingServer: !process.env.CI,
  },

  projects: [
    {
      name: 'critical-flows',
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
    {
      name: 'a11y',
      testMatch: /a11y\/.*\.spec\.ts$/,
    },
  ],
})
