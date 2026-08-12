/**
 * First-Run Experience — content contracts
 *
 * The offline e2e environment already has its database pre-seeded (16 CVEs, see
 * search-page.spec.ts) before any test runs, so "first run" here means: the dashboard shell
 * renders, the pre-seeded stats are already visible in Settings, and the UI stays usable while
 * whatever startup process the server runs happens in the background. Real network sync (CVE
 * bulk download / delta sync / KEV catalog) cannot be exercised offline — see
 * cve-database-sync.spec.ts for that (itself network-bound) coverage. Grounding:
 *   - components/shell/Sidebar.tsx:28-30,121 — persistent nav links "Dashboard"(/dashboard),
 *     "Search"(/search), "Reports"(/executive), "Settings"(/settings)
 *   - pages/Dashboard.tsx:238 — "New Project" button
 *   - components/ErrorBoundary.tsx:256-257 — fallback heading "Something went wrong" rendered
 *     only when it catches a render error
 *   - pages/Settings.tsx:869,879,888,897,906,964 — "Database Management" (h2, id="database")
 *     section with "Total CVEs"/"CPE Matches"/"Database Size"/"Last Sync" stat labels and a
 *     "Sync Now" button; pages/Settings.tsx:1526 — footer text "VulnAssessTool v0.1.0"
 *   - server/routes/database.ts:352 + server/database/nvdDb.ts:872 — the Settings "Total CVEs"
 *     stat is `metadata.total_cves`, a live `SELECT COUNT(*) FROM cves` — the same source
 *     Search.tsx's "N CVEs in database" text reads, and the seeded e2e database contains
 *     exactly 16 (search-page.spec.ts)
 *   - pages/Settings.tsx:1015 — a "Maximum Database Size" storage-limit label also lives inside
 *     #database and contains the substring "Database Size", so the stat label assertion below
 *     must use `exact: true` to avoid a strict-mode multi-match
 *   - Reused from e2e/workflows/security-assessment.spec.ts:236 (not vulnerability-lifecycle.spec.ts,
 *     as an earlier draft mis-cited) — page.locator('#main-content').getByRole('heading', { name: 'Search' })
 *
 * Tests with no offline-groundable content (real sync triggers, forced error states, generic
 * "some button has a label" a11y smoke checks) are skipped with a one-line reason instead of the
 * previous `if (count > 0) { ... }` / regex-OR-text / dead-variable patterns that could never
 * fail.
 */

import { test, expect, resetAppState } from '../test-helper'
import { navigateToSettingsPage, E2E_SELECTOR_TIMEOUT } from '../shared-helpers'

test.describe('First-Run Experience E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  test.describe('First-Run Detection', () => {
    test('should show the dashboard shell with sidebar navigation on first run', async ({ page }) => {
      await expect(page.getByRole('button', { name: 'New Project' })).toBeEnabled()
      await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Search' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Reports' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible()
    })

    test.skip('should show database-related UI elements', async () => {
      // The dashboard renders project cards only, no CVE/database content by design;
      // the seeded database stats are asserted in 'Database Status Display' below.
    })

    test.skip('should load application without errors', async () => {
      // Duplicate of the ErrorBoundary check in 'Error Handling' below.
    })
  })

  test.describe('Database Status Display', () => {
    test('should show the Database Management section with an enabled Sync Now control', async ({ page }) => {
      await navigateToSettingsPage(page)
      const databaseSection = page.locator('#main-content').locator('#database')

      await expect(databaseSection.getByRole('heading', { name: 'Database Management' })).toBeVisible()
      await expect(databaseSection.getByText('Total CVEs')).toBeVisible()
      await expect(databaseSection.getByText('CPE Matches')).toBeVisible()
      // exact: true — a "Maximum Database Size" storage-limit label also lives in this section
      // and would otherwise strict-mode-match alongside the "Database Size" stat label.
      await expect(databaseSection.getByText('Database Size', { exact: true })).toBeVisible()
      await expect(databaseSection.getByText('Last Sync', { exact: true })).toBeVisible()
      await expect(databaseSection.getByRole('button', { name: 'Sync Now' })).toBeEnabled()
    })
  })

  test.describe('Background Sync Experience', () => {
    test.skip('should not block UI during background operations', async () => {
      // Redundant with the shell-render check in 'First-Run Detection' above; there is no way
      // to observe or toggle the server-side startup process from e2e.
    })

    test('should allow navigation while first-run background sync runs', async ({ page }) => {
      await page.getByRole('link', { name: 'Search' }).click()
      await expect(page).toHaveURL(/\/search$/)
      await expect(page.locator('#main-content').getByRole('heading', { name: 'Search', exact: true })).toBeVisible()

      await page.getByRole('link', { name: 'Dashboard' }).click()
      await expect(page).toHaveURL(/\/dashboard$/)
      await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible()
    })
  })

  test.describe('Database Version Display', () => {
    test('should show the app version in Settings', async ({ page }) => {
      await navigateToSettingsPage(page)
      const main = page.locator('#main-content')

      await expect(main.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
      await expect(main.getByText('VulnAssessTool v0.1.0')).toBeVisible()
    })

    test.skip('should show last sync time if available', async () => {
      // The "Last Sync" label is already asserted with the rest of the Database Management
      // stats grid in 'Database Status Display' above.
    })
  })

  test.describe('First-Run Performance', () => {
    test('should load dashboard within acceptable time', async ({ page }) => {
      const startTime = Date.now()

      await resetAppState(page)
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 })

      const loadTime = Date.now() - startTime

      // Dashboard should load within 10 seconds
      expect(loadTime).toBeLessThan(10000)
    })

    test.skip('should show progress indicator if initial setup is needed', async () => {
      // No progress indicator renders for a fast local first run; the bulk-download progress
      // bar (Settings.tsx) only appears during handleBulkDownload, a network operation.
    })

    test.skip('should not show excessive loading states', async () => {
      // The original budget ("< 5 loading messages") was an arbitrary number with no basis in
      // shipped source — not a real content contract.
    })
  })

  test.describe('Error Handling', () => {
    test('should load without tripping the error boundary', async ({ page }) => {
      // ErrorBoundary.tsx's default fallback renders this heading only when it catches a
      // render error — its absence is a real signal that first-run rendering didn't crash.
      await expect(page.getByRole('heading', { name: 'Something went wrong' })).not.toBeVisible()
      await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible()
    })

    test.skip('should show user-friendly error messages', async () => {
      // Infeasible offline: forcing a component/API error to inspect message quality needs
      // network-failure injection outside this suite's scope.
    })
  })

  test.describe('Accessibility', () => {
    test.skip('should have accessible navigation', async () => {
      // Redundant with the grounded sidebar-link check in 'First-Run Detection' above.
    })

    test.skip('should have accessible buttons', async () => {
      // Generic "first few buttons have a label" check always passes for this component
      // library and isn't tied to any specific first-run business content.
    })
  })
})

test.describe('Database Seeding E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  test('should show the seeded CVE count in Settings', async ({ page }) => {
    await navigateToSettingsPage(page)
    const databaseSection = page.locator('#main-content').locator('#database')

    const totalCvesBlock = databaseSection.locator('div.rounded-lg.bg-muted').filter({ hasText: 'Total CVEs' })
    // The seeded e2e database contains exactly 16 CVEs (search-page.spec.ts); Settings reads the
    // same live `SELECT COUNT(*) FROM cves` as Search.tsx's "N CVEs in database" text.
    await expect(totalCvesBlock.locator('div.text-lg.font-semibold')).toHaveText('16', {
      timeout: E2E_SELECTOR_TIMEOUT,
    })
  })

  test.skip('should allow manual sync trigger if available', async () => {
    // Duplicate of the Sync Now button check in 'Database Status Display' above; actually
    // invoking sync requires network (see cve-database-sync.spec.ts).
  })

  test.skip('should display data freshness indicator', async () => {
    // Duplicate of the "Last Sync" label check in 'Database Status Display' above.
  })
})
