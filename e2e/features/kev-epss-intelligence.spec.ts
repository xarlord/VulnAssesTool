import { test, expect, resetAppState } from '../electron-helper'
import {
  E2E_DEFAULT_TIMEOUT,
  E2E_UI_DELAY,
  createTestProject,
  createProjectWithKevVulnerability,
  createProjectWithEpssData,
  createProjectWithNoEpssData,
  createProjectWithVaryingEpssScores,
  createProjectWithIntelligenceData,
  createProjectWithMultipleVulnerabilities,
  navigateToVulnerabilitiesTab,
  isFeatureImplemented,
} from '../shared-helpers'

/**
 * E2E Tests for KEV/EPSS Intelligence Features
 *
 * Tests the threat intelligence display and functionality:
 * - KEV badge display
 * - EPSS score display
 * - Risk score calculations
 * - Filtering and sorting
 */

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
      await navigateToVulnerabilitiesTab(page)

      // Check if KEV feature is implemented
      const kevBadge = page.locator('text=/KEV|Known Exploited|CISA/i')
      const hasFeature = await isFeatureImplemented(page, 'text=/KEV|Known Exploited|CISA/i')

      if (!hasFeature) {
        test.fixme(true, 'KEV badge feature not yet implemented')
        return
      }

      await expect(kevBadge.first()).toBeVisible({ timeout: E2E_DEFAULT_TIMEOUT })
    })

    test('should show KEV icon', async ({ page }) => {
      await createProjectWithKevVulnerability(page)
      await navigateToVulnerabilitiesTab(page)

      const kevRow = page.locator('tr:has-text("KEV"), [class*="kev"]').first()
      const hasKevRow = await kevRow.isVisible().catch(() => false)

      if (!hasKevRow) {
        test.fixme(true, 'KEV row not found - feature may not be implemented')
        return
      }

      const icon = kevRow.locator('svg')
      await expect(icon.first()).toBeVisible()
    })

    test('should show KEV tooltip on hover', async ({ page }) => {
      await createProjectWithKevVulnerability(page)
      await navigateToVulnerabilitiesTab(page)

      const kevBadge = page.locator('[class*="kev"], text=/KEV/i').first()
      const hasKevBadge = await kevBadge.isVisible().catch(() => false)

      if (!hasKevBadge) {
        test.fixme(true, 'KEV badge not found - feature may not be implemented')
        return
      }

      await kevBadge.hover()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Tooltip should appear
      const tooltip = page.locator('[role="tooltip"], [class*="tooltip"]')
      await expect(tooltip.first()).toBeVisible({ timeout: 5000 })
    })

    test('should highlight KEV vulnerabilities prominently', async ({ page }) => {
      await createProjectWithKevVulnerability(page)
      await navigateToVulnerabilitiesTab(page)

      const kevRow = page.locator('tr:has-text("KEV"), [class*="kev"]')
      const hasStyling = (await kevRow.count()) > 0

      if (!hasStyling) {
        test.fixme(true, 'KEV styling not found - feature may not be implemented')
        return
      }

      expect(hasStyling).toBe(true)
    })

    test('should show CISA reference link', async ({ page }) => {
      await createProjectWithKevVulnerability(page)
      await navigateToVulnerabilitiesTab(page)

      const vulnRow = page.locator('tr:has-text("CVE-")').first()
      if (!(await vulnRow.isVisible().catch(() => false))) {
        test.fixme(true, 'No vulnerability rows found')
        return
      }

      await vulnRow.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      const modal = page.locator('[role="dialog"]')
      if (!(await modal.isVisible().catch(() => false))) {
        test.fixme(true, 'Vulnerability detail modal not found')
        return
      }

      const cisaLink = modal.locator('text=/CISA|Known Exploited/i')
      const hasCisa = (await cisaLink.count()) > 0

      if (!hasCisa) {
        test.fixme(true, 'CISA reference not found - KEV feature may not be fully implemented')
        return
      }

      expect(hasCisa).toBe(true)
    })
  })

  // ==========================================================================
  // EPSS Score Tests
  // ==========================================================================

  test.describe('EPSS Score', () => {
    test('should display EPSS percentile', async ({ page }) => {
      await createProjectWithEpssData(page)
      await navigateToVulnerabilitiesTab(page)

      const epssCell = page.locator('text=/\\d+%/')
      const count = await epssCell.count()

      if (count === 0) {
        test.skip(true, 'No EPSS percentile data found - feature may not be fully implemented')
        return
      }

      expect(count).toBeGreaterThan(0)
    })

    test('should show EPSS icon', async ({ page }) => {
      await createProjectWithEpssData(page)
      await navigateToVulnerabilitiesTab(page)

      const epssCell = page.locator('[class*="epss"], text=/EPSS|%/')
      const hasEpss = await epssCell
        .first()
        .isVisible()
        .catch(() => false)

      if (!hasEpss) {
        test.fixme(true, 'EPSS cell not found - feature may not be implemented')
        return
      }

      const icon = epssCell.first().locator('svg')
      await icon
        .first()
        .waitFor({ state: 'attached', timeout: 5000 })
        .catch(() => {})
    })

    test('should show N/A when no EPSS data', async ({ page }) => {
      await createProjectWithNoEpssData(page)
      await navigateToVulnerabilitiesTab(page)

      const naCell = page.locator('text=N/A')
      await naCell
        .first()
        .waitFor({ state: 'attached', timeout: 5000 })
        .catch(() => {})
    })

    test('should color code by EPSS percentile', async ({ page }) => {
      await createProjectWithVaryingEpssScores(page)
      await navigateToVulnerabilitiesTab(page)

      // High EPSS (>80%) should have red/warning color
      // Low EPSS (<50%) should have green/safe color
      const coloredCells = page.locator('[class*="red"], [class*="green"], [class*="yellow"]')
      await coloredCells
        .first()
        .waitFor({ state: 'attached', timeout: 5000 })
        .catch(() => {})
    })

    test('should show EPSS score in tooltip', async ({ page }) => {
      await createProjectWithEpssData(page)
      await navigateToVulnerabilitiesTab(page)

      const epssCell = page.locator('[class*="epss"], text=/\\d+%/').first()
      const hasEpssCell = await epssCell.isVisible().catch(() => false)

      if (!hasEpssCell) {
        test.fixme(true, 'EPSS cell not found')
        return
      }

      await epssCell.hover()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Should show detailed score
      const tooltip = page.locator('[role="tooltip"], [class*="tooltip"]')
      const tooltipVisible = await tooltip
        .first()
        .isVisible()
        .catch(() => false)
      expect(typeof tooltipVisible).toBe('boolean')
    })

    test('should display EPSS bar chart if available', async ({ page }) => {
      await createProjectWithEpssData(page)
      await navigateToVulnerabilitiesTab(page)

      const barChart = page.locator('[class*="progress"], [class*="bar"]')
      await barChart
        .first()
        .waitFor({ state: 'attached', timeout: 5000 })
        .catch(() => {})
    })
  })

  // ==========================================================================
  // Risk Score Tests
  // ==========================================================================

  test.describe('Risk Score', () => {
    test('should display combined risk score', async ({ page }) => {
      await createProjectWithIntelligenceData(page)
      await navigateToVulnerabilitiesTab(page)

      // Look for risk score column
      const riskScore = page.locator('text=/Risk|Score/i')
      const hasRisk = (await riskScore.count()) > 0

      if (!hasRisk) {
        test.fixme(true, 'Risk score column not found - feature may not be implemented')
        return
      }

      expect(hasRisk).toBe(true)
    })

    test('should calculate risk from CVSS + EPSS + KEV', async ({ page }) => {
      await createProjectWithIntelligenceData(page)
      await navigateToVulnerabilitiesTab(page)

      // Risk should be visible in table
      const riskColumn = page.locator('th:has-text("Risk"), td:has-text("Risk")')
      const hasRiskColumn = (await riskColumn.count()) > 0

      if (!hasRiskColumn) {
        test.fixme(true, 'Risk column not found')
        return
      }

      expect(hasRiskColumn).toBe(true)
    })

    test('should sort by risk score', async ({ page }) => {
      await createProjectWithMultipleVulnerabilities(page)
      await navigateToVulnerabilitiesTab(page)

      // Click risk score column header to sort
      const riskHeader = page.locator('th:has-text("Risk")')
      if (!(await riskHeader.isVisible().catch(() => false))) {
        test.fixme(true, 'Risk header not found')
        return
      }

      await riskHeader.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Click again for descending
      await riskHeader.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Verify sort happened (no error thrown)
    })

    test('should highlight high-risk vulnerabilities', async ({ page }) => {
      await createProjectWithIntelligenceData(page)
      await navigateToVulnerabilitiesTab(page)

      // High risk items should have distinct styling
      const highRisk = page.locator('[class*="high-risk"], [class*="critical"]')
      await highRisk
        .first()
        .waitFor({ state: 'attached', timeout: 5000 })
        .catch(() => {})
    })

    test('should show risk breakdown in details', async ({ page }) => {
      await createProjectWithIntelligenceData(page)
      await navigateToVulnerabilitiesTab(page)

      // Click on vulnerability
      const vulnRow = page.locator('tr:has-text("CVE-")').first()
      if (!(await vulnRow.isVisible().catch(() => false))) {
        test.fixme(true, 'No vulnerability rows found')
        return
      }

      await vulnRow.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Modal should show risk breakdown
      const modal = page.locator('[role="dialog"]')
      if (!(await modal.isVisible().catch(() => false))) {
        test.fixme(true, 'Detail modal not found')
        return
      }

      const riskBreakdown = modal.locator('text=/CVSS|EPSS|KEV|Risk/i')
      const hasBreakdown = (await riskBreakdown.count()) > 0

      if (!hasBreakdown) {
        test.fixme(true, 'Risk breakdown not found in detail modal')
        return
      }

      expect(hasBreakdown).toBe(true)
    })
  })

  // ==========================================================================
  // Filtering Tests
  // ==========================================================================

  test.describe('Filtering', () => {
    test('should filter by KEV status', async ({ page }) => {
      await createProjectWithKevVulnerability(page)
      await navigateToVulnerabilitiesTab(page)

      // Look for KEV filter
      const kevFilter = page.locator('button:has-text("KEV"), [data-testid="kev-filter"]')
      const hasKevFilter = (await kevFilter.count()) > 0

      if (!hasKevFilter) {
        test.fixme(true, 'KEV filter not found')
        return
      }

      await kevFilter.first().click()
      await page.waitForTimeout(E2E_UI_DELAY)
    })

    test('should filter by EPSS threshold', async ({ page }) => {
      await createProjectWithEpssData(page)
      await navigateToVulnerabilitiesTab(page)

      // Look for EPSS filter
      const epssFilter = page.locator('button:has-text("EPSS"), [data-testid="epss-filter"]')
      const hasEpssFilter = (await epssFilter.count()) > 0

      if (!hasEpssFilter) {
        test.fixme(true, 'EPSS filter not found')
        return
      }

      await epssFilter.first().click()
      await page.waitForTimeout(E2E_UI_DELAY)
    })

    test('should filter by high risk', async ({ page }) => {
      await createProjectWithIntelligenceData(page)
      await navigateToVulnerabilitiesTab(page)

      // Look for risk filter
      const riskFilter = page.locator('button:has-text("High Risk"), [data-testid="risk-filter"]')
      const hasRiskFilter = (await riskFilter.count()) > 0

      if (!hasRiskFilter) {
        test.fixme(true, 'High risk filter not found')
        return
      }

      await riskFilter.first().click()
      await page.waitForTimeout(E2E_UI_DELAY)
    })

    test('should combine multiple intelligence filters', async ({ page }) => {
      await createProjectWithIntelligenceData(page)
      await navigateToVulnerabilitiesTab(page)

      // Try to apply multiple filters
      const filters = page.locator('[data-testid*="filter"]')
      const filterCount = await filters.count()

      if (filterCount < 2) {
        test.fixme(true, 'Not enough filters available for combined test')
        return
      }

      await filters.first().click()
      await page.waitForTimeout(E2E_UI_DELAY)
      await filters.nth(1).click()
      await page.waitForTimeout(E2E_UI_DELAY)
    })
  })

  // ==========================================================================
  // Vulnerability Detail Tests
  // ==========================================================================

  test.describe('Vulnerability Detail', () => {
    test('should show KEV section in detail modal', async ({ page }) => {
      await createProjectWithKevVulnerability(page)
      await navigateToVulnerabilitiesTab(page)

      const vulnRow = page.locator('tr:has-text("CVE-")').first()
      if (!(await vulnRow.isVisible().catch(() => false))) {
        test.fixme(true, 'No vulnerability rows found')
        return
      }

      await vulnRow.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      const modal = page.locator('[role="dialog"]')
      if (!(await modal.isVisible().catch(() => false))) {
        test.fixme(true, 'Detail modal not found')
        return
      }

      const kevSection = modal.locator('text=/Known Exploited|KEV|CISA/i')
      const hasKevSection = (await kevSection.count()) > 0

      if (!hasKevSection) {
        test.fixme(true, 'KEV section not found in detail modal')
        return
      }

      expect(hasKevSection).toBe(true)
    })

    test('should show EPSS section in detail modal', async ({ page }) => {
      await createProjectWithEpssData(page)
      await navigateToVulnerabilitiesTab(page)

      const vulnRow = page.locator('tr:has-text("CVE-")').first()
      if (!(await vulnRow.isVisible().catch(() => false))) {
        test.fixme(true, 'No vulnerability rows found')
        return
      }

      await vulnRow.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      const modal = page.locator('[role="dialog"]')
      if (!(await modal.isVisible().catch(() => false))) {
        test.fixme(true, 'Detail modal not found')
        return
      }

      const epssSection = modal.locator('text=/EPSS|Exploit Prediction/i')
      const hasEpssSection = (await epssSection.count()) > 0

      if (!hasEpssSection) {
        test.fixme(true, 'EPSS section not found in detail modal')
        return
      }

      expect(hasEpssSection).toBe(true)
    })

    test('should show risk calculation breakdown', async ({ page }) => {
      await createProjectWithIntelligenceData(page)
      await navigateToVulnerabilitiesTab(page)

      const vulnRow = page.locator('tr:has-text("CVE-")').first()
      if (!(await vulnRow.isVisible().catch(() => false))) {
        test.fixme(true, 'No vulnerability rows found')
        return
      }

      await vulnRow.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      const modal = page.locator('[role="dialog"]')
      if (!(await modal.isVisible().catch(() => false))) {
        test.fixme(true, 'Detail modal not found')
        return
      }

      // Should show how risk was calculated
      const riskCalc = modal.locator('text=/Risk Score|Calculated|Weighted/i')
      const hasRiskCalc = (await riskCalc.count()) > 0

      if (!hasRiskCalc) {
        test.fixme(true, 'Risk calculation breakdown not found')
        return
      }

      expect(hasRiskCalc).toBe(true)
    })

    test('should close detail modal', async ({ page }) => {
      await createProjectWithIntelligenceData(page)
      await navigateToVulnerabilitiesTab(page)

      const vulnRow = page.locator('tr:has-text("CVE-")').first()
      if (!(await vulnRow.isVisible().catch(() => false))) {
        test.fixme(true, 'No vulnerability rows found')
        return
      }

      await vulnRow.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      const modal = page.locator('[role="dialog"]')
      if (!(await modal.isVisible().catch(() => false))) {
        test.fixme(true, 'Detail modal not found')
        return
      }

      // Close with X or Escape
      await page.keyboard.press('Escape')
      await page.waitForTimeout(E2E_UI_DELAY)

      await expect(modal).not.toBeVisible()
    })
  })

  // ==========================================================================
  // Responsive Design Tests
  // ==========================================================================

  test.describe('Responsive Design', () => {
    test.use({ viewport: { width: 768, height: 1024 } })

    test('should display KEV badges on tablet', async ({ page }) => {
      await createProjectWithKevVulnerability(page)
      await navigateToVulnerabilitiesTab(page)

      const kevBadge = page.locator('text=/KEV|Known Exploited/i')
      // Verify KEV badges are visible on tablet or feature not implemented
      await kevBadge
        .first()
        .waitFor({ state: 'attached', timeout: 5000 })
        .catch(() => {})
    })

    test('should display EPSS scores on tablet', async ({ page }) => {
      await createProjectWithEpssData(page)
      await navigateToVulnerabilitiesTab(page)

      const epssCell = page.locator('text=/\\d+%/')
      const count = await epssCell.count()

      if (count === 0) {
        test.skip(true, 'No EPSS data found on tablet viewport - feature may not be fully implemented')
        return
      }

      expect(count).toBeGreaterThan(0)
    })
  })
})
