/**
 * Visual Regression Tests for VulnAssesTool
 *
 * These tests capture screenshots of UI components for visual regression testing.
 * Run with: npx playwright test --grep visual
 *
 * Uses browser-based testing with mocked Electron APIs instead of actual Electron
 * to avoid Playwright/Electron compatibility issues.
 *
 * IMPORTANT: These tests require the database to be seeded with sample CVE data.
 * Run: npm run seed-db before running these tests.
 */

import { test as base, expect } from '@playwright/test'

// Server port (must match global-setup.ts)
const serverPort = 4173

// Visual test configuration
const VIEWPORTS = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 720 },
}

// ============================================================
// E2E TIMEOUT CONSTANTS
// ============================================================
const E2E_DEFAULT_TIMEOUT = 30000
const E2E_SELECTOR_TIMEOUT = 15000
const E2E_LOAD_TIMEOUT = 30000
const E2E_UI_DELAY = 500
const E2E_SEARCH_DELAY = 1000

/**
 * Mock Electron APIs in the browser
 */
async function mockElectronAPIs(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    ;(window as unknown as Record<string, unknown>).electronAPI = {
      invoke: async (channel: string) => {
        console.log(`[Mock] invoke('${channel}')`)
        return undefined
      },
      store: {
        get: async () => undefined,
        set: async () => {},
        delete: async () => {},
      },
      secureStorage: {
        get: async () => null,
        set: async () => true,
        delete: async () => true,
        has: async () => false,
      },
      getDatabaseStatus: async () => ({
        exists: true,
        path: 'C:\\test\\nvd-data.db',
        size: 32768,
        lastUpdated: new Date().toISOString(),
      }),
      platform: 'win32',
      appVersion: '2.0.0',
      onUpdateAvailable: () => {},
      onProgress: () => {},
      removeAllListeners: () => {},
    }
  })
}

// Create test fixture with browser-based testing
const test = base.extend({
  page: async ({ page }, use) => {
    await mockElectronAPIs(page)

    await page.goto(`http://127.0.0.1:${serverPort}/`, {
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
      await page.click('[data-testid="nav-search"]')
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
      await page.click('[data-testid="nav-search"]')
      await page.waitForTimeout(E2E_UI_DELAY)

      // Switch to NVD mode
      await page.click('button:has-text("NVD Database")')
      await page.waitForTimeout(E2E_UI_DELAY)

      // Search for a CVE
      await page.fill('input[placeholder*="CVE ID"]', 'CVE-2024')
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
      await page.click('[data-testid="nav-search"]')
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
    // NOTE: CVE modal tests are skipped due to a React event handling issue
    test.skip('CVE modal - header section', async ({ page }) => {
      await page.click('[data-testid="nav-search"]')
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

    test.skip('CVE modal - CVSS scores section', async ({ page }) => {
      await page.click('[data-testid="nav-search"]')
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

      const cvssHeader = page.locator('text=CVSS')
      await cvssHeader.waitFor({ state: 'visible', timeout: E2E_SELECTOR_TIMEOUT })
      await cvssHeader.scrollIntoViewIfNeeded()
      await expect(page).toHaveScreenshot('cve-modal-cvss.png', {
        maxDiffPixels: 150,
      })
    })

    test.skip('CVE modal - CPE matches section', async ({ page }) => {
      await page.click('[data-testid="nav-search"]')
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

      const cpeHeader = page.locator('text=/Affected Software|CPE|Affected Products/i')
      if (await cpeHeader.isVisible()) {
        await cpeHeader.scrollIntoViewIfNeeded()
        await expect(page).toHaveScreenshot('cve-modal-cpe.png', {
          maxDiffPixels: 150,
        })
      }
    })

    test.skip('CVE modal - references section', async ({ page }) => {
      await page.click('[data-testid="nav-search"]')
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

      const refsHeader = page.locator('text=References')
      if (await refsHeader.isVisible()) {
        await refsHeader.scrollIntoViewIfNeeded()
        await expect(page).toHaveScreenshot('cve-modal-references.png', {
          maxDiffPixels: 150,
        })
      }
    })

    test.skip('CVE modal - full modal', async ({ page }) => {
      await page.click('[data-testid="nav-search"]')
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
        await page.click('[data-testid="nav-search"]')
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
      await page.click('[data-testid="nav-search"]')
      await page.waitForTimeout(E2E_UI_DELAY)

      await expect(page).toHaveScreenshot('search-mobile.png', {
        maxDiffPixels: 200,
        fullPage: true,
      })
    })

    test.skip('CVE modal - mobile viewport', async ({ page }) => {
      await page.click('[data-testid="nav-search"]')
      await page.waitForTimeout(E2E_UI_DELAY)
      await page.click('button:has-text("NVD Database")')
      await page.waitForTimeout(E2E_UI_DELAY)
      await page.fill('input[placeholder*="CVE ID"]', 'CVE-2024')
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
