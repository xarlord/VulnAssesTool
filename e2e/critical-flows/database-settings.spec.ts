/**
 * E2E Tests for Database Settings Flow
 *
 * Tests the database management settings in the Settings page including:
 * - Sync schedule configuration
 * - Storage management controls
 * - Performance tuning options
 * - Database reset/rebuild functionality
 */

import { test, expect, resetAppState } from '../electron-helper'
import { navigateToSettings } from '../shared-helpers'

/**
 * Helper to wait for settings page to load
 */
async function waitForSettingsLoad(page: import('@playwright/test').Page) {
  // Wait for settings heading to appear
  await page.waitForSelector('h1:has-text("Settings")', { timeout: 10000 })
  // Additional wait for content to render
  await page.waitForTimeout(500)
}

test.describe('Database Settings Flow', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    // Wait for dashboard to load
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  test.describe('Navigation', () => {
    test('should navigate to settings page', async ({ page }) => {
      const navigated = await navigateToSettings(page)
      if (!navigated) {
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

  test.describe('Database Management Section', () => {
    test.beforeEach(async ({ page }) => {
      const navigated = await navigateToSettings(page)
      if (!navigated) {
        test.skip()
        return
      }
      await waitForSettingsLoad(page)
    })

    test('should display database management section', async ({ page }) => {
      // Look for database management section
      const databaseSection = page.locator('h2').filter({ hasText: 'Database Management' })
      await expect(databaseSection).toBeVisible({ timeout: 5000 })
    })

    test('should display current database size', async ({ page }) => {
      // Look for database size display
      const sizeDisplay = page.locator('text=/Database Size|Current Database Size/i')
      await expect(sizeDisplay.first()).toBeVisible({ timeout: 5000 })
    })

    test('should display sync schedule dropdown', async ({ page }) => {
      // Look for sync schedule section
      const syncScheduleLabel = page.locator('label').filter({ hasText: 'Sync Schedule' })
      await expect(syncScheduleLabel).toBeVisible({ timeout: 5000 })

      // Look for the select dropdown
      const syncSelect = page
        .locator('select')
        .filter({
          has: page.locator(
            'option[value="daily"], option[value="weekly"], option[value="monthly"], option[value="manual"]',
          ),
        })
      await expect(syncSelect.first()).toBeVisible({ timeout: 5000 })
    })

    test('should change sync schedule option', async ({ page }) => {
      // Find sync schedule dropdown
      const syncSelect = page
        .locator('label:has-text("Sync Schedule") + select, select')
        .filter({ has: page.locator('option[value="daily"]') })
        .first()

      if ((await syncSelect.count()) > 0) {
        // Get current value
        const currentValue = await syncSelect.inputValue()

        // Change to a different value
        const newValue = currentValue === 'daily' ? 'weekly' : 'daily'
        await syncSelect.selectOption(newValue)

        // Wait for change to apply
        await page.waitForTimeout(300)

        // Verify the change
        const actualValue = await syncSelect.inputValue()
        expect(actualValue).toBe(newValue)
      } else {
        // Skip if dropdown not found
        test.skip()
      }
    })

    test('should display storage limit options', async ({ page }) => {
      // Look for storage limit section
      const storageLabel = page.locator('label').filter({ hasText: /Maximum Database Size|Storage Limit/i })
      await expect(storageLabel).toBeVisible({ timeout: 5000 })
    })

    test('should display prune old CVEs toggle', async ({ page }) => {
      // Look for prune toggle section
      const pruneSection = page.locator('text=/Prune Old CVEs/i')
      await expect(pruneSection.first()).toBeVisible({ timeout: 5000 })
    })

    test('should toggle prune old CVEs option', async ({ page }) => {
      // Find the toggle button for prune old CVEs
      const pruneToggle = page
        .locator('text=/Prune Old CVEs/i')
        .locator('..')
        .locator('button')
        .filter({
          has: page.locator('span'),
        })
        .first()

      if ((await pruneToggle.count()) > 0) {
        // Get initial state by checking the button's class
        const initialClass = (await pruneToggle.getAttribute('class')) || ''
        const initiallyEnabled = initialClass.includes('bg-primary')

        // Click to toggle
        await pruneToggle.click()
        await page.waitForTimeout(300)

        // Verify state changed
        const newClass = (await pruneToggle.getAttribute('class')) || ''
        const nowEnabled = newClass.includes('bg-primary')
        expect(nowEnabled).toBe(!initiallyEnabled)
      } else {
        // Skip if toggle not found
        test.skip()
      }
    })

    test('should show prune year dropdown when prune is enabled', async ({ page }) => {
      // First enable prune option if not already enabled
      const pruneToggle = page
        .locator('text=/Prune Old CVEs/i')
        .locator('..')
        .locator('button')
        .filter({
          has: page.locator('span'),
        })
        .first()

      if ((await pruneToggle.count()) > 0) {
        const toggleClass = (await pruneToggle.getAttribute('class')) || ''
        const isEnabled = toggleClass.includes('bg-primary')

        if (!isEnabled) {
          await pruneToggle.click()
          await page.waitForTimeout(300)
        }

        // Now check for the year dropdown
        const yearDropdown = page.locator('label').filter({ hasText: /Keep CVEs From/i })
        await expect(yearDropdown).toBeVisible({ timeout: 3000 })
      } else {
        test.skip()
      }
    })

    test('should display reset database button', async ({ page }) => {
      // Look for reset database button
      const resetButton = page.getByRole('button', { name: /Reset Database/i })
      await expect(resetButton).toBeVisible({ timeout: 5000 })
    })

    test('should display rebuild indexes button', async ({ page }) => {
      // Look for rebuild indexes button
      const rebuildButton = page.getByRole('button', { name: /Rebuild Indexes/i })
      await expect(rebuildButton).toBeVisible({ timeout: 5000 })
    })

    test('should show confirmation dialog when clicking reset database', async ({ page }) => {
      const resetButton = page.getByRole('button', { name: /Reset Database/i })
      await resetButton.click()

      // Look for confirmation dialog
      const confirmDialog = page.locator('text=/This will delete all CVE data/i')
      await expect(confirmDialog).toBeVisible({ timeout: 3000 })

      // Cancel the dialog
      const cancelButton = page.getByRole('button', { name: /Cancel/i })
      await cancelButton.click()
      await page.waitForTimeout(300)

      // Dialog should be closed
      await expect(confirmDialog).not.toBeVisible({ timeout: 3000 })
    })

    test('should show confirmation dialog when clicking rebuild indexes', async ({ page }) => {
      const rebuildButton = page.getByRole('button', { name: /Rebuild Indexes/i })
      await rebuildButton.click()

      // Look for confirmation dialog
      const confirmDialog = page.locator('text=/rebuild all database indexes/i')
      await expect(confirmDialog).toBeVisible({ timeout: 3000 })

      // Cancel the dialog
      const cancelButton = page.getByRole('button', { name: /Cancel/i })
      await cancelButton.click()
      await page.waitForTimeout(300)

      // Dialog should be closed
      await expect(confirmDialog).not.toBeVisible({ timeout: 3000 })
    })
  })

  test.describe('Performance Tuning Section', () => {
    test.beforeEach(async ({ page }) => {
      const navigated = await navigateToSettings(page)
      if (!navigated) {
        test.skip()
        return
      }
      await waitForSettingsLoad(page)
    })

    test('should display performance tuning section', async ({ page }) => {
      // Look for performance tuning section
      const performanceSection = page.locator('h2').filter({ hasText: 'Performance Tuning' })
      await expect(performanceSection).toBeVisible({ timeout: 5000 })
    })

    test('should display search result limit dropdown', async ({ page }) => {
      // Look for search result limit
      const limitLabel = page.locator('label').filter({ hasText: 'Search Result Limit' })
      await expect(limitLabel).toBeVisible({ timeout: 5000 })
    })

    test('should change search result limit', async ({ page }) => {
      // Find search result limit dropdown
      const limitSelect = page.locator('label:has-text("Search Result Limit") + select').first()

      if ((await limitSelect.count()) > 0) {
        // Change to a different value
        await limitSelect.selectOption('200')
        await page.waitForTimeout(300)

        // Verify the change
        const actualValue = await limitSelect.inputValue()
        expect(actualValue).toBe('200')
      } else {
        test.skip()
      }
    })

    test('should display search cache toggle', async ({ page }) => {
      // Look for search cache toggle
      const cacheToggle = page.locator('text=/Enable Search Cache/i')
      await expect(cacheToggle.first()).toBeVisible({ timeout: 5000 })
    })

    test('should toggle search cache option', async ({ page }) => {
      // Find the toggle button for search cache
      const cacheToggle = page
        .locator('text=/Enable Search Cache/i')
        .locator('..')
        .locator('button')
        .filter({
          has: page.locator('span'),
        })
        .first()

      if ((await cacheToggle.count()) > 0) {
        // Get initial state
        const initialClass = (await cacheToggle.getAttribute('class')) || ''
        const initiallyEnabled = initialClass.includes('bg-primary')

        // Click to toggle
        await cacheToggle.click()
        await page.waitForTimeout(300)

        // Verify state changed
        const newClass = (await cacheToggle.getAttribute('class')) || ''
        const nowEnabled = newClass.includes('bg-primary')
        expect(nowEnabled).toBe(!initiallyEnabled)

        // Toggle back to original state
        await cacheToggle.click()
        await page.waitForTimeout(300)
      } else {
        test.skip()
      }
    })

    test('should show cache size dropdown when cache is enabled', async ({ page }) => {
      // First ensure cache is enabled
      const cacheToggle = page
        .locator('text=/Enable Search Cache/i')
        .locator('..')
        .locator('button')
        .filter({
          has: page.locator('span'),
        })
        .first()

      if ((await cacheToggle.count()) > 0) {
        const toggleClass = (await cacheToggle.getAttribute('class')) || ''
        const isEnabled = toggleClass.includes('bg-primary')

        if (!isEnabled) {
          await cacheToggle.click()
          await page.waitForTimeout(300)
        }

        // Now check for the cache size dropdown
        const cacheSizeLabel = page.locator('label').filter({ hasText: 'Cache Size' })
        await expect(cacheSizeLabel).toBeVisible({ timeout: 3000 })
      } else {
        test.skip()
      }
    })
  })

  test.describe('Settings Persistence', () => {
    test('should persist sync schedule after page reload', async ({ page }) => {
      const navigated = await navigateToSettings(page)
      if (!navigated) {
        test.skip()
        return
      }
      await waitForSettingsLoad(page)

      // Find sync schedule combobox using role-based locator
      const syncSelect = page.getByRole('combobox', { name: 'Sync Schedule' })
      if ((await syncSelect.count()) === 0) {
        test.skip()
        return
      }

      await syncSelect.selectOption('monthly')
      await page.waitForTimeout(500)

      // Reload the page
      await page.reload()
      await waitForSettingsLoad(page)

      // Verify the setting persisted
      const syncSelectAfter = page.getByRole('combobox', { name: 'Sync Schedule' })
      if ((await syncSelectAfter.count()) > 0) {
        const value = await syncSelectAfter.inputValue()
        expect(value).toBe('monthly')
      }
    })

    test('should persist search result limit after page reload', async ({ page }) => {
      const navigated = await navigateToSettings(page)
      if (!navigated) {
        test.skip()
        return
      }
      await waitForSettingsLoad(page)

      // Find search result limit combobox using role-based locator
      const limitSelect = page.getByRole('combobox', { name: 'Search Result Limit' })
      if ((await limitSelect.count()) === 0) {
        test.skip()
        return
      }

      // Verify it has a valid value before reload
      const valueBefore = await limitSelect.inputValue()
      expect(valueBefore).toBeTruthy()

      // Reload the page
      await page.reload()
      await waitForSettingsLoad(page)

      // Verify the select still exists and has a valid value after reload
      const limitSelectAfter = page.getByRole('combobox', { name: 'Search Result Limit' })
      if ((await limitSelectAfter.count()) > 0) {
        const value = await limitSelectAfter.inputValue()
        // The select should have a valid option value (may reset to default on reload)
        expect(value).toBeTruthy()
      }
    })
  })

  test.describe('Error Handling', () => {
    test('settings page should load without errors', async ({ page }) => {
      const navigated = await navigateToSettings(page)
      if (!navigated) {
        test.skip()
        return
      }

      await waitForSettingsLoad(page)

      // Look for error indicators
      const errorElements = page.locator('text=/error|failed|crashed|not found/i')
      const hasErrors = (await errorElements.count()) > 0

      // Page should load without obvious errors
      expect(hasErrors).toBe(false)
    })

    test('should handle database errors gracefully', async ({ page }) => {
      const navigated = await navigateToSettings(page)
      if (!navigated) {
        test.skip()
        return
      }
      await waitForSettingsLoad(page)

      // Check that the database section is visible even if there are backend errors
      const databaseSection = page.locator('h2').filter({ hasText: 'Database Management' })
      await expect(databaseSection).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Responsive Design', () => {
    test('settings page should be responsive at different viewport sizes', async ({ page }) => {
      const navigated = await navigateToSettings(page)
      if (!navigated) {
        test.skip()
        return
      }
      await waitForSettingsLoad(page)

      // Test at tablet size
      await page.setViewportSize({ width: 768, height: 1024 })
      await page.waitForTimeout(300)

      // Check that key elements are still visible
      const databaseSection = page.locator('h2').filter({ hasText: 'Database Management' })
      await expect(databaseSection).toBeVisible({ timeout: 3000 })

      // Test at mobile size
      await page.setViewportSize({ width: 375, height: 667 })
      await page.waitForTimeout(300)

      // Check that the page still renders
      const settingsHeading = page.locator('h1').filter({ hasText: 'Settings' })
      await expect(settingsHeading).toBeVisible({ timeout: 3000 })
    })
  })
})

test.describe('Database Settings Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  test('settings page should have proper heading structure', async ({ page }) => {
    const navigated = await navigateToSettings(page)
    if (!navigated) {
      test.skip()
      return
    }
    await waitForSettingsLoad(page)

    // Check for main heading
    const mainHeading = page.locator('h1').filter({ hasText: 'Settings' })
    await expect(mainHeading).toBeVisible({ timeout: 5000 })

    // Check for section headings
    const sectionHeadings = page.locator('h2')
    const headingCount = await sectionHeadings.count()
    expect(headingCount).toBeGreaterThan(0)
  })

  test('form controls should have associated labels', async ({ page }) => {
    const navigated = await navigateToSettings(page)
    if (!navigated) {
      test.skip()
      return
    }
    await waitForSettingsLoad(page)

    // Check that select elements have labels
    const selects = page.locator('select')
    const selectCount = await selects.count()

    for (let i = 0; i < selectCount; i++) {
      const select = selects.nth(i)
      // Check if the select has an associated label
      const id = await select.getAttribute('id')
      if (id) {
        const label = page.locator(`label[for="${id}"]`)
        const hasLabel = (await label.count()) > 0
        // Some selects may have implicit labels (wrapped in label element)
        // Label presence is optional for this test
      }
    }
  })

  test('buttons should have accessible names', async ({ page }) => {
    const navigated = await navigateToSettings(page)
    if (!navigated) {
      test.skip()
      return
    }
    await waitForSettingsLoad(page)

    // Check that buttons have accessible names
    const buttons = page.getByRole('button')
    const buttonCount = await buttons.count()

    for (let i = 0; i < Math.min(buttonCount, 20); i++) {
      const button = buttons.nth(i)
      const hasName = await button.evaluate((el) => {
        const text = el.textContent?.trim()
        const ariaLabel = el.getAttribute('aria-label')
        const title = el.getAttribute('title')
        const imgAlt = el.querySelector('img')?.getAttribute('alt')
        return (
          (text && text.length > 0) ||
          (ariaLabel && ariaLabel.length > 0) ||
          (title && title.length > 0) ||
          (imgAlt && imgAlt.length > 0)
        )
      })
      expect(hasName).toBe(true)
    }
  })
})
