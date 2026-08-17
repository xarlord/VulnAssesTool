/**
 * Visual Regression Tests for VulnAssesTool
 *
 * These tests capture screenshots of UI components for visual regression testing.
 * Run with: npx playwright test --project=visual
 *
 * IMPORTANT: These tests require the database to be seeded with sample CVE data.
 * Run: npm run seed-db before running these tests.
 */

import { test as base, expect } from '@playwright/test'

const VIEWPORTS = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 720 },
}

const E2E_DEFAULT_TIMEOUT = 30000
const E2E_SELECTOR_TIMEOUT = 15000
const E2E_LOAD_TIMEOUT = 30000
const E2E_UI_DELAY = 500
const E2E_SEARCH_DELAY = 1000

const test = base.extend({
  page: async ({ page }, use) => {
    await page.goto('/dashboard', {
      timeout: E2E_LOAD_TIMEOUT,
      waitUntil: 'domcontentloaded',
    })

    await page.waitForSelector('#root:not(:empty)', { timeout: E2E_SELECTOR_TIMEOUT }).catch(() => {
      console.log('Warning: #root may be empty')
    })

    await page.waitForTimeout(E2E_UI_DELAY)

    await use(page)
  },
})

test.describe('Visual Regression Tests', () => {
  test.describe('Search Page - NVD Mode', () => {
    test('NVD search empty state - desktop', async ({ page }) => {
      // Navigate to search page
      await page.getByRole('link', { name: 'Search' }).click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Switch to NVD mode
      await page.click('button:has-text("NVD Database")')
      await page.waitForTimeout(E2E_UI_DELAY)

      // Take screenshot of empty state (before searching)
      await expect(page).toHaveScreenshot('nvd-search-empty-desktop.png', {
        maxDiffPixels: 500,
      })
    })

    test('NVD search with results - desktop', async ({ page }) => {
      // Navigate to search page
      await page.getByRole('link', { name: 'Search' }).click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Switch to NVD mode
      await page.click('button:has-text("NVD Database")')
      await page.waitForTimeout(E2E_UI_DELAY)

      // Search for a seeded CVE. A full id resolves via the id lookup path;
      // a bare year prefix like "CVE-2024" only matched real-NVD description
      // cross-references, which the seeded fixture set intentionally lacks.
      await page.fill('input[placeholder*="CVE ID"]', 'CVE-2024-3094')
      await page.waitForTimeout(E2E_SEARCH_DELAY)

      // Wait for results to appear (database should be seeded)
      const results = page.locator('[data-testid="nvd-result"]')
      await results.first().waitFor({ state: 'visible', timeout: E2E_SELECTOR_TIMEOUT })

      const count = await results.count()
      expect(count).toBeGreaterThan(0)

      // Take screenshot with results
      await expect(page).toHaveScreenshot('nvd-search-results-desktop.png', {
        maxDiffPixels: 1000,
      })
    })

    test('NVD sync button states - desktop', async ({ page }) => {
      // Navigate to search page
      await page.getByRole('link', { name: 'Search' }).click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Switch to NVD mode
      await page.click('button:has-text("NVD Database")')
      await page.waitForTimeout(E2E_UI_DELAY)

      // Initial state
      await expect(page).toHaveScreenshot('nvd-sync-initial.png', {
        maxDiffPixels: 500,
      })
    })
  })

  test.describe('CVE Detail Modal', () => {
    // These were skipped as "a React event handling issue". That was a misdiagnosis: they were
    // the only tests in this file still clicking `[data-testid="nav-search"]`, a testid that no
    // longer exists anywhere in app code (removed in the AppShell/Sidebar nav refactor). The
    // click timed out waiting for a missing element, which looked like events not registering.
    // They now navigate the same way the rest of the file does, via the Search nav link.
    test('CVE modal - header section', async ({ page }) => {
      await page.getByRole('link', { name: 'Search' }).click()
      await page.waitForTimeout(E2E_UI_DELAY)
      await page.click('button:has-text("NVD Database")')
      await page.waitForTimeout(E2E_UI_DELAY)

      await page.fill('input[placeholder*="CVE ID"]', 'CVE-2023')
      await page.waitForTimeout(E2E_SEARCH_DELAY)

      const results = page.locator('[data-testid="nvd-result"]')
      await results.first().waitFor({ state: 'visible', timeout: E2E_SELECTOR_TIMEOUT })
      await page.waitForTimeout(E2E_UI_DELAY)
      expect(await results.count()).toBeGreaterThan(0)

      await results.first().click()

      const modal = page.locator('[role="dialog"]')
      await modal.waitFor({ state: 'visible', timeout: E2E_SELECTOR_TIMEOUT })
      await page.waitForTimeout(E2E_UI_DELAY * 2)

      await expect(modal).toHaveScreenshot('cve-modal-header.png', {
        maxDiffPixels: 100,
      })
    })

    test('CVE modal - CVSS scores section', async ({ page }) => {
      await page.getByRole('link', { name: 'Search' }).click()
      await page.waitForTimeout(E2E_UI_DELAY)
      await page.click('button:has-text("NVD Database")')
      await page.waitForTimeout(E2E_UI_DELAY)

      await page.fill('input[placeholder*="CVE ID"]', 'CVE-2023')
      await page.waitForTimeout(E2E_SEARCH_DELAY)

      const results = page.locator('[data-testid="nvd-result"]')
      await results.first().waitFor({ state: 'visible', timeout: E2E_SELECTOR_TIMEOUT })
      await page.waitForTimeout(E2E_UI_DELAY)

      await results.first().click()

      const modal = page.locator('[role="dialog"]')
      await modal.waitFor({ state: 'visible', timeout: E2E_SELECTOR_TIMEOUT })
      await page.waitForTimeout(E2E_UI_DELAY * 2)

      // `text=CVSS` was a strict-mode violation (11 matches: the score badge, the vector
      // string, per-version subheadings, metric labels). NvdCveDetailModal.tsx:488-491 renders
      // the section title as an <h3>"CVSS Scores", which is unique.
      const cvssHeader = page.getByRole('heading', { name: 'CVSS Scores' })
      await cvssHeader.waitFor({ state: 'visible', timeout: E2E_SELECTOR_TIMEOUT })
      await cvssHeader.scrollIntoViewIfNeeded()
      await expect(page).toHaveScreenshot('cve-modal-cvss.png', {
        maxDiffPixels: 150,
      })
    })

    test('CVE modal - CPE matches section', async ({ page }) => {
      await page.getByRole('link', { name: 'Search' }).click()
      await page.waitForTimeout(E2E_UI_DELAY)
      await page.click('button:has-text("NVD Database")')
      await page.waitForTimeout(E2E_UI_DELAY)

      await page.fill('input[placeholder*="CVE ID"]', 'CVE-2024-3094')
      await page.waitForTimeout(E2E_SEARCH_DELAY)

      const results = page.locator('[data-testid="nvd-result"]')
      await results.first().waitFor({ state: 'visible', timeout: E2E_SELECTOR_TIMEOUT })
      await page.waitForTimeout(E2E_UI_DELAY)

      await results.first().click()

      const modal = page.locator('[role="dialog"]')
      await modal.waitFor({ state: 'visible', timeout: E2E_SELECTOR_TIMEOUT })
      await page.waitForTimeout(E2E_UI_DELAY * 2)

      // Asserted, not guarded: NvdCveDetailModal.tsx:748 gates this section on
      // `cpeMatches.length > 0` and the seeded CVE-2024-3094 has exactly 2 CPE rows, both
      // vulnerable=1 (scripts/seed-test-db.js), so the heading text is deterministic offline.
      // The previous `if (await cpeHeader.isVisible())` wrapper meant the screenshot — the only
      // assertion in the test — was skipped entirely whenever the section was absent, so the
      // test could never fail.
      const cpeHeader = page.getByRole('heading', { name: 'Affected Software (2 configurations)' })
      await expect(cpeHeader).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
      await cpeHeader.scrollIntoViewIfNeeded()
      await expect(page).toHaveScreenshot('cve-modal-cpe.png', {
        maxDiffPixels: 150,
      })
    })

    // Stays skipped, but for a grounded reason rather than the old vacuous
    // `if (await refsHeader.isVisible())` wrapper (which made the screenshot — the test's only
    // assertion — silently unreachable). NvdCveDetailModal.tsx:924 gates the References section
    // on `cve.references.length > 0`, and the seeded E2E database has an entirely EMPTY
    // `references` table (verified: `SELECT COUNT(*) FROM "references"` = 0 — scripts/seed-test-db.js
    // only calls upsertCVE/insertCPEMatches, never inserts reference rows). So the section cannot
    // render offline for any seeded CVE. Reviving this needs the seed fixture extended with
    // reference rows — a fixture change, not a test change.
    test.skip('CVE modal - references section', async () => {})

    test('CVE modal - full modal', async ({ page }) => {
      await page.getByRole('link', { name: 'Search' }).click()
      await page.waitForTimeout(E2E_UI_DELAY)
      await page.click('button:has-text("NVD Database")')
      await page.waitForTimeout(E2E_UI_DELAY)

      await page.fill('input[placeholder*="CVE ID"]', 'CVE-2023')
      await page.waitForTimeout(E2E_SEARCH_DELAY)

      const results = page.locator('[data-testid="nvd-result"]')
      await results.first().waitFor({ state: 'visible', timeout: E2E_SELECTOR_TIMEOUT })
      await page.waitForTimeout(E2E_UI_DELAY)

      await results.first().click()

      const modal = page.locator('[role="dialog"]')
      await modal.waitFor({ state: 'visible', timeout: E2E_SELECTOR_TIMEOUT })
      await page.waitForTimeout(E2E_UI_DELAY * 2)

      await expect(modal).toHaveScreenshot('cve-modal-full.png', {
        maxDiffPixels: 300,
        fullPage: true,
      })
    })
  })

  test.describe('Severity Badges', () => {
    const severityCveMap: Record<string, string> = {
      CRITICAL: 'CVE-2024-3094',
      HIGH: 'CVE-2023-0002',
      MEDIUM: 'CVE-2023-0003',
      LOW: 'CVE-2023-2152',
    }
    const severities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

    for (const severity of severities) {
      test(`${severity} severity badge`, async ({ page }) => {
        await page.getByRole('link', { name: 'Search' }).click()
        await page.waitForTimeout(E2E_UI_DELAY)
        await page.click('button:has-text("NVD Database")')
        await page.waitForTimeout(E2E_UI_DELAY)

        const cveId = severityCveMap[severity]
        await page.fill('input[placeholder*="CVE ID"]', cveId)
        await page.waitForTimeout(E2E_SEARCH_DELAY)

        const results = page.locator('[data-testid="nvd-result"]')
        await results.first().waitFor({ state: 'visible', timeout: E2E_SELECTOR_TIMEOUT })
        await page.waitForTimeout(E2E_UI_DELAY)

        const badge = results.first().locator('span.text-xs.uppercase').filter({ hasText: severity })

        await badge.waitFor({ state: 'visible', timeout: E2E_SELECTOR_TIMEOUT })

        await expect(badge).toHaveScreenshot(`severity-badge-${severity.toLowerCase()}.png`, {
          maxDiffPixels: 20,
        })
      })
    }
  })

  test.describe('Responsive Design', () => {
    test.use({ viewport: VIEWPORTS.mobile })

    test('Search page - mobile viewport', async ({ page }) => {
      // Desktop sidebar nav is hidden at mobile width; use the SPA router hook directly.
      await page.evaluate(() => (window as unknown as { __navigate?: (p: string) => void }).__navigate?.('/search'))
      await page.waitForTimeout(E2E_UI_DELAY)

      await expect(page).toHaveScreenshot('search-mobile.png', {
        maxDiffPixels: 200,
        fullPage: true,
      })
    })

    test('CVE modal - mobile viewport', async ({ page }) => {
      // This describe sets VIEWPORTS.mobile (375px), where the desktop sidebar nav is hidden —
      // so the sidebar 'Search' link this test used to click could never be clickable and the
      // click timed out. Navigate via the SPA router hook, exactly as the passing
      // 'Search page - mobile viewport' sibling above does.
      await page.evaluate(() => (window as unknown as { __navigate?: (p: string) => void }).__navigate?.('/search'))
      await page.waitForTimeout(E2E_UI_DELAY)
      await page.click('button:has-text("NVD Database")')
      await page.waitForTimeout(E2E_UI_DELAY)
      // Full CVE id, not a bare 'CVE-2024' year prefix — see the 'NVD search with results'
      // test above: a bare prefix relies on description cross-references the seed lacks.
      await page.fill('input[placeholder*="CVE ID"]', 'CVE-2024-3094')
      await page.waitForTimeout(E2E_SEARCH_DELAY)

      const results = page.locator('[data-testid="nvd-result"]')
      await results.first().waitFor({ state: 'visible', timeout: E2E_SELECTOR_TIMEOUT })
      await page.waitForTimeout(E2E_UI_DELAY)

      await results.first().click()

      const modal = page.locator('[role="dialog"]')
      await modal.waitFor({ state: 'visible', timeout: E2E_SELECTOR_TIMEOUT })
      await page.waitForTimeout(E2E_UI_DELAY * 2)

      await expect(modal).toHaveScreenshot('cve-modal-mobile.png', {
        maxDiffPixels: 300,
      })
    })
  })
})
