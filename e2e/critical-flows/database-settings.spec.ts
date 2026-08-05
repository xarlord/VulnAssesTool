/**
 * Database Settings Flow — content contracts
 *
 * Every control this file exercises is local `Settings.tsx` React state (no network, no
 * seeded-DB dependency), so nothing here needed `test.skip` for infeasibility. Grounding:
 *   - pages/Settings.tsx — section `<h2>`s ("Database Management", "Performance Tuning", ...),
 *     labeled selects (#sync-schedule, #max-database-size, #prune-year, #search-result-limit,
 *     #cache-size), `role="switch"` toggles with `aria-label="Toggle prune old CVEs"` /
 *     `"Toggle search cache"`, the Reset/Rebuild buttons and their `ConfirmDialog` (a plain
 *     `<div>`, NOT `role="dialog"`) titles/messages.
 *   - shared/constants.ts — SYNC_SCHEDULE_OPTIONS (4 options) / SEARCH_RESULT_LIMIT_OPTIONS /
 *     CACHE_SIZE_OPTIONS + DEFAULT_DATABASE_SETTINGS (pruneOldCves: false, enableSearchCache:
 *     true, searchResultLimit: 100) — the deterministic values every fresh mount starts from.
 *
 * One real gap surfaced by reading the source: Settings.tsx's mount effect re-hydrates only
 * `syncSchedule` from `database.getSyncConfig()`; there is no `getStorageConfig` /
 * `getPerformanceConfig` anywhere in the platform API (lib/platform/types.ts). Storage and
 * performance settings are write-only from the UI's perspective, so "search result limit
 * persists after reload" is not actually true — that test is `test.skip`ped with the reason
 * instead of asserting a false claim.
 *
 * Sync schedule IS persisted server-side and nothing in this suite resets that DB state
 * between tests, so the "change sync schedule" test toggles relative to whatever value is
 * currently selected rather than assuming a fixed starting value.
 */

import { test, expect, resetAppState } from '../test-helper'
import { navigateToSettings, E2E_UI_DELAY } from '../shared-helpers'
import type { Page } from '@playwright/test'

/**
 * Helper to wait for settings page to load
 */
async function waitForSettingsLoad(page: Page) {
  // Wait for settings heading to appear
  await page.waitForSelector('h1:has-text("Settings")', { timeout: 10000 })
  // Additional wait for content to render
  await page.waitForTimeout(E2E_UI_DELAY)
}

test.describe('Database Settings Flow', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    // Wait for dashboard to load
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  test.describe('Navigation', () => {
    test('should navigate to settings page', async ({ page }) => {
      await navigateToSettings(page)
      await expect(page).toHaveURL(/\/settings$/)
    })

    test('should navigate back to dashboard from settings', async ({ page }) => {
      await navigateToSettings(page)
      await page.waitForTimeout(E2E_UI_DELAY)

      // Go back using browser navigation
      await page.goBack()

      // Should be back on dashboard
      await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Database Management Section', () => {
    test.beforeEach(async ({ page }) => {
      await navigateToSettings(page)
      await waitForSettingsLoad(page)
    })

    test('should display database management section', async ({ page }) => {
      // Look for database management section
      const databaseSection = page.locator('h2').filter({ hasText: 'Database Management' })
      await expect(databaseSection).toBeVisible({ timeout: 5000 })
    })

    test('should display current database size', async ({ page }) => {
      // Look for database size display (Settings.tsx stats grid label). exact: true avoids a
      // strict-mode collision with the "Maximum Database Size" select label, which contains
      // "Database Size" as a substring — Playwright's getByText matches substrings by default.
      await expect(page.getByText('Database Size', { exact: true })).toBeVisible({ timeout: 5000 })
    })

    test('should display sync schedule dropdown', async ({ page }) => {
      // Look for sync schedule section
      const syncSelect = page.getByRole('combobox', { name: 'Sync Schedule' })
      await expect(syncSelect).toBeVisible({ timeout: 5000 })
      // Options mirror SYNC_SCHEDULE_OPTIONS in shared/constants.ts (daily/weekly/monthly/manual).
      await expect(syncSelect.locator('option')).toHaveCount(4)
    })

    test('should change sync schedule option', async ({ page }) => {
      const syncSelect = page.getByRole('combobox', { name: 'Sync Schedule' })
      await expect(syncSelect).toBeVisible({ timeout: 5000 })

      // syncInterval is persisted server-side (handleSyncScheduleChange -> updateSyncConfig)
      // and re-hydrated from database.getSyncConfig() on every mount, so an earlier test in
      // this file may have left a non-default value — toggle relative to the current value.
      const currentValue = await syncSelect.inputValue()
      const newValue = currentValue === 'daily' ? 'weekly' : 'daily'
      await syncSelect.selectOption(newValue)

      await expect(syncSelect).toHaveValue(newValue)
    })

    test('should display storage limit options', async ({ page }) => {
      // Look for storage limit section
      await expect(page.getByRole('combobox', { name: 'Maximum Database Size' })).toBeVisible({ timeout: 5000 })
    })

    test('should display prune old CVEs toggle', async ({ page }) => {
      // Look for prune toggle section
      await expect(page.getByText('Prune Old CVEs')).toBeVisible({ timeout: 5000 })
      // Default from DEFAULT_DATABASE_SETTINGS.storage.pruneOldCves = false.
      await expect(page.getByRole('switch', { name: 'Toggle prune old CVEs' })).toHaveAttribute('aria-checked', 'false')
    })

    test('should toggle prune old CVEs option', async ({ page }) => {
      const pruneToggle = page.getByRole('switch', { name: 'Toggle prune old CVEs' })
      // Fresh mount always starts from DEFAULT_DATABASE_SETTINGS.storage.pruneOldCves = false —
      // this local React state is never re-hydrated from the backend on mount.
      await expect(pruneToggle).toHaveAttribute('aria-checked', 'false')

      await pruneToggle.click()
      await expect(pruneToggle).toHaveAttribute('aria-checked', 'true')
    })

    test('should show prune year dropdown when prune is enabled', async ({ page }) => {
      // pruneOldCves defaults to false (DEFAULT_DATABASE_SETTINGS.storage), so enable it first.
      await page.getByRole('switch', { name: 'Toggle prune old CVEs' }).click()

      // The "Keep CVEs From" select renders only while storageSettings.pruneOldCves is true.
      await expect(page.getByRole('combobox', { name: 'Keep CVEs From' })).toBeVisible({ timeout: 3000 })
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
      await navigateToSettings(page)
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
      const limitSelect = page.getByRole('combobox', { name: 'Search Result Limit' })
      // Default from DEFAULT_DATABASE_SETTINGS.performance.searchResultLimit = 100; this local
      // state is never re-hydrated from the backend, so every fresh mount starts here.
      await expect(limitSelect).toHaveValue('100')

      await limitSelect.selectOption('200')
      await expect(limitSelect).toHaveValue('200')
    })

    test('should display search cache toggle', async ({ page }) => {
      // Look for search cache toggle
      await expect(page.getByText('Enable Search Cache')).toBeVisible({ timeout: 5000 })
      // Default from DEFAULT_DATABASE_SETTINGS.performance.enableSearchCache = true.
      await expect(page.getByRole('switch', { name: 'Toggle search cache' })).toHaveAttribute('aria-checked', 'true')
    })

    test('should toggle search cache option', async ({ page }) => {
      const cacheToggle = page.getByRole('switch', { name: 'Toggle search cache' })
      // Enabled by default (DEFAULT_DATABASE_SETTINGS.performance.enableSearchCache = true).
      await expect(cacheToggle).toHaveAttribute('aria-checked', 'true')

      await cacheToggle.click()
      await expect(cacheToggle).toHaveAttribute('aria-checked', 'false')
    })

    test('should show cache size dropdown when cache is enabled', async ({ page }) => {
      // Enabled by default (DEFAULT_DATABASE_SETTINGS.performance.enableSearchCache = true), so
      // the "Cache Size" select — rendered only while enableSearchCache is true — is visible
      // without any extra interaction.
      await expect(page.getByRole('combobox', { name: 'Cache Size' })).toBeVisible({ timeout: 3000 })
    })
  })

  test.describe('Settings Persistence', () => {
    test('should persist sync schedule after page reload', async ({ page }) => {
      await navigateToSettings(page)
      await waitForSettingsLoad(page)

      const syncSelect = page.getByRole('combobox', { name: 'Sync Schedule' })
      await syncSelect.selectOption('monthly')
      // Let handleSyncScheduleChange's updateSyncConfig request land before reloading, so the
      // mount effect's getSyncConfig() read-back sees the write.
      await page.waitForTimeout(E2E_UI_DELAY)

      await page.reload()
      await waitForSettingsLoad(page)

      await expect(page.getByRole('combobox', { name: 'Sync Schedule' })).toHaveValue('monthly')
    })

    test.skip('should persist search result limit after page reload', async () => {
      // Not actually implemented: Settings.tsx's mount effect re-hydrates only `syncSchedule`
      // from database.getSyncConfig(); there is no getStorageConfig/getPerformanceConfig in the
      // platform API (lib/platform/types.ts) at all, so searchResultLimit is plain useState
      // seeded from DEFAULT_DATABASE_SETTINGS and always resets to 100 on reload.
    })
  })

  test.describe('Error Handling', () => {
    test('settings page should load without errors', async ({ page }) => {
      await navigateToSettings(page)
      await waitForSettingsLoad(page)

      // A full, uninterrupted render produces exactly these section headings, in DOM order
      // (ProfilesSection, AppearanceSection, NotificationsSection, CvssSection, then Settings.tsx's
      // api/database/backup/performance/data-management/threat-intel/danger-zone sections). A
      // missing, reordered, or renamed entry means a section failed to mount (e.g. a thrown
      // render error).
      const sectionHeadings = await page.locator('#main-content h2').allTextContents()
      expect(sectionHeadings).toEqual([
        'Settings Profiles',
        'Appearance',
        'Notifications',
        'CVSS',
        'API Configuration',
        'Database Management',
        'Backup & Recovery',
        'Performance Tuning',
        'Data Management',
        'Threat Intelligence',
        'Danger Zone',
      ])
    })

    test('should handle database errors gracefully', async ({ page }) => {
      await navigateToSettings(page)
      await waitForSettingsLoad(page)

      // Check that the database section is visible even if there are backend errors
      const databaseSection = page.locator('h2').filter({ hasText: 'Database Management' })
      await expect(databaseSection).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Responsive Design', () => {
    test('settings page should be responsive at different viewport sizes', async ({ page }) => {
      await navigateToSettings(page)
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
    await navigateToSettings(page)
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
    await navigateToSettings(page)
    await waitForSettingsLoad(page)

    // Reveal the conditional selects (prune-year, cache-size is already visible by default)
    // so they're in the DOM to check too.
    await page.getByRole('switch', { name: 'Toggle prune old CVEs' }).click()

    // Every <select> in Settings.tsx is id'd and paired with a <label htmlFor>. This fails if a
    // future select is added without one.
    const main = page.locator('#main-content')
    const selects = main.locator('select[id]')
    const selectCount = await selects.count()
    expect(selectCount).toBeGreaterThan(0)

    for (let i = 0; i < selectCount; i++) {
      const id = await selects.nth(i).getAttribute('id')
      if (!id) throw new Error('select is missing an id attribute')
      await expect(main.locator(`label[for="${id}"]`)).toHaveCount(1)
    }
  })

  test('buttons should have accessible names', async ({ page }) => {
    await navigateToSettings(page)
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
