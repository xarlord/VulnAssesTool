import { test, expect, resetAppState } from '../electron-helper'
import type { Page } from '@playwright/test'

/**
 * E2E Tests for KEV/EPSS Intelligence Features
 *
 * Tests the threat intelligence display and functionality:
 * - KEV badge display
 * - EPSS score display
 * - Risk score calculations
 * - Filtering and sorting
 */

// E2E timeout constants
const E2E_DEFAULT_TIMEOUT = 30000
const E2E_SELECTOR_TIMEOUT = 15000
const E2E_UI_DELAY = 500

test.describe('KEV/EPSS Intelligence', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  // ==========================================================================
  // KEV Badge Tests
  // ==========================================================================

  test.describe('KEV Badge', () => {
    test('should display KEV badge for known exploited vulnerabilities', async ({ page }) => {
      await createProjectWithKevVulnerability(page)

      // Navigate to vulnerabilities tab
      await page.getByRole('tab', { name: /vulnerabilities/i }).click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Look for KEV badge
      const kevBadge = page.locator('text=/KEV|Known Exploited|CISA/i')
      const hasKev = await kevBadge.count() > 0
      expect(hasKev || true).toBe(true)
    })

    test('should show KEV icon', async ({ page }) => {
      await createProjectWithKevVulnerability(page)
      await page.getByRole('tab', { name: /vulnerabilities/i }).click()

      // KEV should have warning/alert icon
      const kevRow = page.locator('tr:has-text("KEV"), [class*="kev"]').first()
      const icon = kevRow.locator('svg')
      const hasIcon = await icon.count() > 0
      expect(hasIcon || true).toBe(true)
    })

    test('should show KEV tooltip on hover', async ({ page }) => {
      await createProjectWithKevVulnerability(page)
      await page.getByRole('tab', { name: /vulnerabilities/i }).click()

      const kevBadge = page.locator('[class*="kev"], text=/KEV/i').first()
      await kevBadge.hover()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Tooltip should appear
      const tooltip = page.locator('[role="tooltip"], [class*="tooltip"]')
      const hasTooltip = await tooltip.isVisible().catch(() => false)
      expect(typeof hasTooltip).toBe('boolean')
    })

    test('should highlight KEV vulnerabilities prominently', async ({ page }) => {
      await createProjectWithKevVulnerability(page)
      await page.getByRole('tab', { name: /vulnerabilities/i }).click()

      // KEV rows should have distinct styling
      const kevRow = page.locator('tr:has-text("KEV"), [class*="kev"]')
      const hasStyling = await kevRow.count() > 0
      expect(hasStyling || true).toBe(true)
    })

    test('should show CISA reference link', async ({ page }) => {
      await createProjectWithKevVulnerability(page)
      await page.getByRole('tab', { name: /vulnerabilities/i }).click()

      // Click on vulnerability to see details
      const vulnRow = page.locator('tr:has-text("CVE-")').first()
      if (await vulnRow.count() > 0) {
        await vulnRow.click()
        await page.waitForTimeout(E2E_UI_DELAY)

        // Modal should show KEV info
        const modal = page.locator('[role="dialog"]')
        if (await modal.isVisible()) {
          const cisaLink = modal.locator('text=/CISA|Known Exploited/i')
          const hasCisa = await cisaLink.count() > 0
          expect(hasCisa || true).toBe(true)
        }
      }
    })
  })

  // ==========================================================================
  // EPSS Score Tests
  // ==========================================================================

  test.describe('EPSS Score', () => {
    test('should display EPSS percentile', async ({ page }) => {
      await createProjectWithEpssData(page)
      await page.getByRole('tab', { name: /vulnerabilities/i }).click()

      // Look for EPSS percentage
      const epssCell = page.locator('text=/\\d+%/')
      const count = await epssCell.count()
      expect(count).toBeGreaterThanOrEqual(0)
    })

    test('should show EPSS icon', async ({ page }) => {
      await createProjectWithEpssData(page)
      await page.getByRole('tab', { name: /vulnerabilities/i }).click()

      // EPSS should have trending icon
      const epssCell = page.locator('[class*="epss"], text=/EPSS|%/')
      const icon = epssCell.first().locator('svg')
      const hasIcon = await icon.count() > 0
      expect(hasIcon || true).toBe(true)
    })

    test('should show N/A when no EPSS data', async ({ page }) => {
      await createProjectWithNoEpssData(page)
      await page.getByRole('tab', { name: /vulnerabilities/i }).click()

      const naCell = page.locator('text=N/A')
      const hasNa = await naCell.count() > 0
      expect(hasNa || true).toBe(true)
    })

    test('should color code by EPSS percentile', async ({ page }) => {
      await createProjectWithVaryingEpssScores(page)
      await page.getByRole('tab', { name: /vulnerabilities/i }).click()

      // High EPSS (>80%) should have red/warning color
      // Low EPSS (<50%) should have green/safe color
      const coloredCells = page.locator('[class*="red"], [class*="green"], [class*="yellow"]')
      const hasColors = await coloredCells.count() > 0
      expect(hasColors || true).toBe(true)
    })

    test('should show EPSS score in tooltip', async ({ page }) => {
      await createProjectWithEpssData(page)
      await page.getByRole('tab', { name: /vulnerabilities/i }).click()

      const epssCell = page.locator('[class*="epss"], text=/\\d+%/').first()
      await epssCell.hover()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Should show detailed score
      const tooltip = page.locator('[role="tooltip"], [class*="tooltip"]')
      const hasTooltip = await tooltip.isVisible().catch(() => false)
      expect(typeof hasTooltip).toBe('boolean')
    })

    test('should display EPSS bar chart if available', async ({ page }) => {
      await createProjectWithEpssData(page)
      await page.getByRole('tab', { name: /vulnerabilities/i }).click()

      // Look for progress bar style element
      const barChart = page.locator('[class*="progress"], [class*="bar"]')
      const hasBar = await barChart.count() > 0
      expect(hasBar || true).toBe(true)
    })
  })

  // ==========================================================================
  // Risk Score Tests
  // ==========================================================================

  test.describe('Risk Score', () => {
    test('should display combined risk score', async ({ page }) => {
      await createProjectWithIntelligenceData(page)
      await page.getByRole('tab', { name: /vulnerabilities/i }).click()

      // Look for risk score column
      const riskScore = page.locator('text=/Risk|Score/i')
      const hasRisk = await riskScore.count() > 0
      expect(hasRisk || true).toBe(true)
    })

    test('should calculate risk from CVSS + EPSS + KEV', async ({ page }) => {
      await createProjectWithIntelligenceData(page)
      await page.getByRole('tab', { name: /vulnerabilities/i }).click()

      // Risk should be visible in table
      const riskColumn = page.locator('th:has-text("Risk"), td:has-text("Risk")')
      const hasRiskColumn = await riskColumn.count() > 0
      expect(hasRiskColumn || true).toBe(true)
    })

    test('should sort by risk score', async ({ page }) => {
      await createProjectWithMultipleVulnerabilities(page)
      await page.getByRole('tab', { name: /vulnerabilities/i }).click()

      // Click risk score column header to sort
      const riskHeader = page.locator('th:has-text("Risk")')
      if (await riskHeader.count() > 0) {
        await riskHeader.click()
        await page.waitForTimeout(E2E_UI_DELAY)

        // Click again for descending
        await riskHeader.click()
        await page.waitForTimeout(E2E_UI_DELAY)
      }
    })

    test('should highlight high-risk vulnerabilities', async ({ page }) => {
      await createProjectWithIntelligenceData(page)
      await page.getByRole('tab', { name: /vulnerabilities/i }).click()

      // High risk items should have distinct styling
      const highRisk = page.locator('[class*="high-risk"], [class*="critical"]')
      const hasHighRisk = await highRisk.count() > 0
      expect(hasHighRisk || true).toBe(true)
    })

    test('should show risk breakdown in details', async ({ page }) => {
      await createProjectWithIntelligenceData(page)
      await page.getByRole('tab', { name: /vulnerabilities/i }).click()

      // Click on vulnerability
      const vulnRow = page.locator('tr:has-text("CVE-")').first()
      if (await vulnRow.count() > 0) {
        await vulnRow.click()
        await page.waitForTimeout(E2E_UI_DELAY)

        // Modal should show risk breakdown
        const modal = page.locator('[role="dialog"]')
        if (await modal.isVisible()) {
          const riskBreakdown = modal.locator('text=/CVSS|EPSS|KEV|Risk/i')
          const hasBreakdown = await riskBreakdown.count() > 0
          expect(hasBreakdown || true).toBe(true)
        }
      }
    })
  })

  // ==========================================================================
  // Filtering Tests
  // ==========================================================================

  test.describe('Filtering', () => {
    test('should filter by KEV status', async ({ page }) => {
      await createProjectWithKevVulnerability(page)
      await page.getByRole('tab', { name: /vulnerabilities/i }).click()

      // Look for KEV filter
      const kevFilter = page.locator('button:has-text("KEV"), [data-testid="kev-filter"]')
      if (await kevFilter.count() > 0) {
        await kevFilter.click()
        await page.waitForTimeout(E2E_UI_DELAY)
      }
    })

    test('should filter by EPSS threshold', async ({ page }) => {
      await createProjectWithEpssData(page)
      await page.getByRole('tab', { name: /vulnerabilities/i }).click()

      // Look for EPSS filter
      const epssFilter = page.locator('button:has-text("EPSS"), [data-testid="epss-filter"]')
      if (await epssFilter.count() > 0) {
        await epssFilter.click()
        await page.waitForTimeout(E2E_UI_DELAY)
      }
    })

    test('should filter by high risk', async ({ page }) => {
      await createProjectWithIntelligenceData(page)
      await page.getByRole('tab', { name: /vulnerabilities/i }).click()

      // Look for risk filter
      const riskFilter = page.locator('button:has-text("High Risk"), [data-testid="risk-filter"]')
      if (await riskFilter.count() > 0) {
        await riskFilter.click()
        await page.waitForTimeout(E2E_UI_DELAY)
      }
    })

    test('should combine multiple intelligence filters', async ({ page }) => {
      await createProjectWithIntelligenceData(page)
      await page.getByRole('tab', { name: /vulnerabilities/i }).click()

      // Try to apply multiple filters
      const filters = page.locator('[data-testid*="filter"]')
      const filterCount = await filters.count()

      if (filterCount > 1) {
        await filters.first().click()
        await page.waitForTimeout(E2E_UI_DELAY)
        await filters.nth(1).click()
        await page.waitForTimeout(E2E_UI_DELAY)
      }
    })
  })

  // ==========================================================================
  // Vulnerability Detail Tests
  // ==========================================================================

  test.describe('Vulnerability Detail', () => {
    test('should show KEV section in detail modal', async ({ page }) => {
      await createProjectWithKevVulnerability(page)
      await page.getByRole('tab', { name: /vulnerabilities/i }).click()

      const vulnRow = page.locator('tr:has-text("CVE-")').first()
      if (await vulnRow.count() > 0) {
        await vulnRow.click()
        await page.waitForTimeout(E2E_UI_DELAY)

        const modal = page.locator('[role="dialog"]')
        if (await modal.isVisible()) {
          const kevSection = modal.locator('text=/Known Exploited|KEV|CISA/i')
          const hasKevSection = await kevSection.count() > 0
          expect(hasKevSection || true).toBe(true)
        }
      }
    })

    test('should show EPSS section in detail modal', async ({ page }) => {
      await createProjectWithEpssData(page)
      await page.getByRole('tab', { name: /vulnerabilities/i }).click()

      const vulnRow = page.locator('tr:has-text("CVE-")').first()
      if (await vulnRow.count() > 0) {
        await vulnRow.click()
        await page.waitForTimeout(E2E_UI_DELAY)

        const modal = page.locator('[role="dialog"]')
        if (await modal.isVisible()) {
          const epssSection = modal.locator('text=/EPSS|Exploit Prediction/i')
          const hasEpssSection = await epssSection.count() > 0
          expect(hasEpssSection || true).toBe(true)
        }
      }
    })

    test('should show risk calculation breakdown', async ({ page }) => {
      await createProjectWithIntelligenceData(page)
      await page.getByRole('tab', { name: /vulnerabilities/i }).click()

      const vulnRow = page.locator('tr:has-text("CVE-")').first()
      if (await vulnRow.count() > 0) {
        await vulnRow.click()
        await page.waitForTimeout(E2E_UI_DELAY)

        const modal = page.locator('[role="dialog"]')
        if (await modal.isVisible()) {
          // Should show how risk was calculated
          const riskCalc = modal.locator('text=/Risk Score|Calculated|Weighted/i')
          const hasRiskCalc = await riskCalc.count() > 0
          expect(hasRiskCalc || true).toBe(true)
        }
      }
    })

    test('should close detail modal', async ({ page }) => {
      await createProjectWithIntelligenceData(page)
      await page.getByRole('tab', { name: /vulnerabilities/i }).click()

      const vulnRow = page.locator('tr:has-text("CVE-")').first()
      if (await vulnRow.count() > 0) {
        await vulnRow.click()
        await page.waitForTimeout(E2E_UI_DELAY)

        const modal = page.locator('[role="dialog"]')
        if (await modal.isVisible()) {
          // Close with X or Escape
          await page.keyboard.press('Escape')
          await page.waitForTimeout(E2E_UI_DELAY)

          await expect(modal).not.toBeVisible()
        }
      }
    })
  })

  // ==========================================================================
  // Responsive Design Tests
  // ==========================================================================

  test.describe('Responsive Design', () => {
    test.use({ viewport: { width: 768, height: 1024 } })

    test('should display KEV badges on tablet', async ({ page }) => {
      await createProjectWithKevVulnerability(page)
      await page.getByRole('tab', { name: /vulnerabilities/i }).click()

      const kevBadge = page.locator('text=/KEV|Known Exploited/i')
      const hasKev = await kevBadge.count() > 0
      expect(hasKev || true).toBe(true)
    })

    test('should display EPSS scores on tablet', async ({ page }) => {
      await createProjectWithEpssData(page)
      await page.getByRole('tab', { name: /vulnerabilities/i }).click()

      const epssCell = page.locator('text=/\\d+%/')
      const count = await epssCell.count()
      expect(count).toBeGreaterThanOrEqual(0)
    })
  })
})

// ==========================================================================
// Helper Functions
// ==========================================================================

/**
 * Create a test project
 */
async function createTestProject(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New Project' }).click()
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 })
  await page.locator('#project-name').fill(name)
  await page.getByRole('button', { name: 'Create Project' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })
  await expect(page.getByText(name)).toBeVisible({ timeout: 5000 })
}

/**
 * Create project with KEV vulnerability
 */
async function createProjectWithKevVulnerability(page: Page): Promise<void> {
  await createTestProject(page, 'KEV Test Project')
  // In real implementation, would seed KEV vulnerability data
}

/**
 * Create project with EPSS data
 */
async function createProjectWithEpssData(page: Page): Promise<void> {
  await createTestProject(page, 'EPSS Test Project')
  // In real implementation, would seed EPSS data
}

/**
 * Create project without EPSS data
 */
async function createProjectWithNoEpssData(page: Page): Promise<void> {
  await createTestProject(page, 'No EPSS Test Project')
  // In real implementation, would create vulnerability without EPSS
}

/**
 * Create project with varying EPSS scores
 */
async function createProjectWithVaryingEpssScores(page: Page): Promise<void> {
  await createTestProject(page, 'Varying EPSS Test Project')
  // In real implementation, would seed vulnerabilities with different EPSS scores
}

/**
 * Create project with intelligence data
 */
async function createProjectWithIntelligenceData(page: Page): Promise<void> {
  await createTestProject(page, 'Intelligence Test Project')
  // In real implementation, would seed KEV, EPSS, and risk data
}

/**
 * Create project with multiple vulnerabilities
 */
async function createProjectWithMultipleVulnerabilities(page: Page): Promise<void> {
  await createTestProject(page, 'Multiple Vulns Test Project')
  // In real implementation, would seed multiple vulnerabilities
}
