import { test, expect, resetAppState } from '../test-helper'
import { E2E_SELECTOR_TIMEOUT } from '../shared-helpers'

/**
 * Database Status — content contracts
 *
 * The local NVD database status lives in the Settings page's "Database Management" section
 * (there is no standalone DatabaseStatus component any more — see the "DatabaseStatus removed"
 * comment in Settings.tsx). scripts/seed-test-db.js seeds exactly 16 CVEs via
 * NvdDatabase.upsertCVE before every e2e run and never touches the metadata table, so the
 * stats this section renders are fully deterministic offline. Grounding:
 *   - shell/Sidebar.tsx MAIN_NAV — sidebar links "Dashboard"(/dashboard) and "Settings"(/settings);
 *     shell/AppShell.tsx — content is rendered inside <main id="main-content">
 *   - Settings.tsx `<div id="database">` — h2 "Database Management"; stat labels "Total CVEs",
 *     "CPE Matches", "Database Size", "Last Sync" inside `div.p-3` cards, with the CVE count in
 *     a `div.text-lg.font-semibold` and the sync date/"Never" fallback in a
 *     `div.text-sm.font-medium`; action buttons "Sync Now", "Bulk Download", "Rebuild Indexes",
 *     "Reset Database"
 *   - server/routes/database.ts `/database/stats` — totalCves: metadata.total_cves
 *   - server/database/nvdDb.ts `getMetadata()` — total_cves = SELECT COUNT(*) FROM cves, and
 *     last_sync_at is only ever set by a sync run (never by the seed script), so a fresh e2e
 *     run always shows 16 CVEs and a "Never" last-sync status
 *
 * Everything here is reachable offline with no scan/sync required, so there are no test.skip
 * entries in this file.
 */

test.describe('Database Status', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  test.describe('Settings Navigation', () => {
    test('should navigate to the settings page via the sidebar', async ({ page }) => {
      await page.getByRole('link', { name: 'Settings' }).click()
      await expect(page).toHaveURL(/\/settings$/)
      await expect(page.locator('#main-content').getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
    })
  })

  test.describe('Database Management Statistics', () => {
    test('should show the database management stat labels', async ({ page }) => {
      await page.getByRole('link', { name: 'Settings' }).click()
      const dbSection = page.locator('#main-content').locator('#database')

      await expect(dbSection.getByRole('heading', { name: 'Database Management' })).toBeVisible()
      for (const label of ['Total CVEs', 'CPE Matches', 'Database Size', 'Last Sync']) {
        await expect(dbSection.getByText(label, { exact: true })).toBeVisible()
      }
    })

    test('should show the seeded NVD CVE count', async ({ page }) => {
      await page.getByRole('link', { name: 'Settings' }).click()
      const dbSection = page.locator('#main-content').locator('#database')

      // The seed script inserts exactly 16 CVEs and getMetadata() counts them live, so this
      // value would change if the seed fixture or the stats query changed.
      const totalCvesValue = dbSection
        .locator('div.p-3')
        .filter({ hasText: 'Total CVEs' })
        .locator('div.text-lg.font-semibold')
      await expect(totalCvesValue).toHaveText('16', { timeout: E2E_SELECTOR_TIMEOUT })
    })

    test('should default the last sync status to Never', async ({ page }) => {
      await page.getByRole('link', { name: 'Settings' }).click()
      const dbSection = page.locator('#main-content').locator('#database')

      // The seed script never writes a last_sync_at metadata row, so Settings.tsx's lastSyncAt
      // stays null and falls back to the 'Never' label until a real sync runs.
      const lastSyncValue = dbSection
        .locator('div.p-3')
        .filter({ hasText: 'Last Sync' })
        .locator('div.text-sm.font-medium')
      await expect(lastSyncValue).toHaveText('Never', { timeout: E2E_SELECTOR_TIMEOUT })
    })
  })

  test.describe('Database Maintenance Actions', () => {
    test('should show the sync and maintenance action buttons', async ({ page }) => {
      await page.getByRole('link', { name: 'Settings' }).click()
      const dbSection = page.locator('#main-content').locator('#database')

      await expect(dbSection.getByRole('button', { name: 'Sync Now' })).toBeVisible()
      await expect(dbSection.getByRole('button', { name: 'Bulk Download' })).toBeVisible()
      await expect(dbSection.getByRole('button', { name: 'Rebuild Indexes' })).toBeVisible()
      await expect(dbSection.getByRole('button', { name: 'Reset Database' })).toBeVisible()
    })
  })

  test.describe('Cross-Feature Navigation', () => {
    test('should return to the dashboard from settings', async ({ page }) => {
      await page.getByRole('link', { name: 'Settings' }).click()
      await expect(page).toHaveURL(/\/settings$/)

      await page.getByRole('link', { name: 'Dashboard' }).click()
      await expect(page).toHaveURL(/\/dashboard$/)
      await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible()
    })
  })
})
