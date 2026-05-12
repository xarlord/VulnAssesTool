import { test, expect } from '../electron-helper'

/**
 * Simple E2E test to verify the Electron app launches and displays the dashboard
 */
test.describe('Basic E2E Test', () => {
  test('should launch Electron app and show dashboard', async ({ page }) => {
    // Verify the page loaded by checking for a key element
    await expect(page.getByRole('button', { name: /new project/i })).toBeVisible({ timeout: 10000 })
    console.log('Dashboard loaded successfully!')
  })
})
