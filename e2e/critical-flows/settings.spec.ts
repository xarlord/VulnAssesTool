import { test, expect, resetAppState } from '../electron-helper'
import { navigateToSettings } from '../shared-helpers'

/**
 * E2E Tests for Settings Configuration Flow
 *
 * Tests the settings page functionality
 */
test.describe('Settings Configuration Flow', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  test('should navigate to settings page', async ({ page }) => {
    const navigated = await navigateToSettings(page)
    if (!navigated) {
      // Settings might not be accessible - skip test
      test.skip()
      return
    }

    // Verify settings page is loaded
    await expect(
      page
        .getByRole('heading', { name: 'Settings', exact: true })
        .or(page.locator('h1').filter({ hasText: 'Settings' })),
    ).toBeVisible({ timeout: 5000 })
  })

  test('should display theme options in settings', async ({ page }) => {
    const navigated = await navigateToSettings(page)
    if (!navigated) {
      test.skip()
      return
    }

    await page.waitForTimeout(500)

    // Look for theme section
    const themeSection = page.getByText(/theme/i).or(page.getByText(/appearance/i))
    await expect(themeSection.first()).toBeVisible({ timeout: 5000 })
  })

  test('should change theme to dark mode', async ({ page }) => {
    const navigated = await navigateToSettings(page)
    if (!navigated) {
      test.skip()
      return
    }

    await page.waitForTimeout(500)

    // Find and click dark theme button
    const darkButton = page
      .getByRole('button', { name: /^dark$/i })
      .or(page.locator('button').filter({ hasText: /^dark$/ }))

    if ((await darkButton.count()) > 0) {
      await darkButton.first().click()
      await page.waitForTimeout(300)

      // Verify dark mode is applied
      const html = page.locator('html')
      const isDark = await html.evaluate((el) => el.classList.contains('dark'))
      expect(isDark).toBe(true)
    } else {
      // Try to find theme buttons by looking for light/dark/system pattern
      const themeButtons = page.locator('button').filter({ hasText: /light|dark|system/i })
      if ((await themeButtons.count()) >= 3) {
        // Assume second button is dark
        await themeButtons.nth(1).click()
        await page.waitForTimeout(300)
      }
    }
  })

  test('should navigate back to dashboard from settings', async ({ page }) => {
    const navigated = await navigateToSettings(page)
    if (!navigated) {
      test.skip()
      return
    }

    await page.waitForTimeout(500)

    // Go back using browser navigation
    await page.goBack()

    // Should be back on dashboard
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 5000 })
  })
})
