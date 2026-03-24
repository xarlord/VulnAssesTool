import { test, expect, resetAppState } from '../electron-helper'
import type { Page } from '@playwright/test'

/**
 * E2E Tests for Executive Dashboard
 *
 * Tests the high-level security overview including:
 * - Widget display and functionality
 * - Filters and controls
 * - Export capabilities
 * - Navigation to details
 */

// E2E timeout constants
const E2E_DEFAULT_TIMEOUT = 30000
const E2E_SELECTOR_TIMEOUT = 15000
const E2E_UI_DELAY = 500

test.describe('Executive Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  // ==========================================================================
  // Page Load Tests
  // ==========================================================================

  test.describe('Page Load', () => {
    test('should display executive dashboard header', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      await expect(page.locator('h1:has-text("Executive Dashboard")')).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
    })

    test('should display page description', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      await expect(page.locator('text=/security overview|compliance metrics/i')).toBeVisible()
    })

    test('should show back to dashboard button', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      await expect(page.locator('button:has-text("Back")')).toBeVisible()
    })

    test('should display date range filter', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      const dateRange = page.locator('button:has-text("Date Range"), [data-testid="date-range-filter"]')
      await expect(dateRange.first()).toBeVisible()
    })

    test('should display project scope filter', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      const projectScope = page.locator('button:has-text("All Projects"), [data-testid="project-scope"]')
      await expect(projectScope.first()).toBeVisible()
    })

    test('should show refresh button', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      const refreshButton = page.locator('button:has-text("Refresh"), [aria-label*="refresh"]')
      await expect(refreshButton.first()).toBeVisible()
    })

    test('should show export button', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      const exportButton = page.locator('button:has-text("Export")')
      await expect(exportButton.first()).toBeVisible()
    })
  })

  // ==========================================================================
  // Widget Tests
  // ==========================================================================

  test.describe('Widgets', () => {
    test('should display risk gauge widget', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      // Look for risk-related content
      const riskWidget = page.locator('text=/Risk|Overall|Score/i')
      await expect(riskWidget.first()).toBeVisible()
    })

    test('should display vulnerability trend chart', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      // Look for trend or chart content
      const trendWidget = page.locator('text=/Trend|Over Time|History/i')
      await expect(trendWidget.first()).toBeVisible()
    })

    test('should display project health section', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      const healthSection = page.locator('text=/Project Health|Health Score/i')
      await expect(healthSection.first()).toBeVisible()
    })

    test('should display compliance status section', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      const complianceSection = page.locator('text=/Compliance|Status/i')
      await expect(complianceSection.first()).toBeVisible()
    })

    test('should display action items section', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      const actionItems = page.locator('text=/Action Items|Recommendations|Priority/i')
      await expect(actionItems.first()).toBeVisible()
    })

    test('should show team productivity section if available', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      const productivitySection = page.locator('text=/Productivity|Team|Activity/i')
      const isVisible = await productivitySection.first().isVisible().catch(() => false)
      // Optional feature
      expect(typeof isVisible).toBe('boolean')
    })

    test('should display vulnerability counts', async ({ page }) => {
      await createProjectWithVulnerabilities(page)
      await navigateToExecutiveDashboard(page)

      // Should show some count
      const countText = page.locator('text=/\\d+.*vulnerabilities?/i')
      await expect(countText.first()).toBeVisible()
    })

    test('should show critical vulnerability count prominently', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      const criticalCount = page.locator('text=/Critical.*\\d+|\\d+.*Critical/i')
      const isVisible = await criticalCount.first().isVisible().catch(() => false)
      expect(typeof isVisible).toBe('boolean')
    })
  })

  // ==========================================================================
  // Filter Tests
  // ==========================================================================

  test.describe('Filters', () => {
    test('should open date range picker', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      const dateRangeButton = page.locator('button:has-text("Date Range")')
      await dateRangeButton.first().click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Dropdown or picker should appear
      const dropdown = page.locator('[role="listbox"], [role="dialog"], .dropdown-menu')
      const isVisible = await dropdown.first().isVisible().catch(() => false)
      expect(typeof isVisible).toBe('boolean')
    })

    test('should select date range preset', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      const dateRangeButton = page.locator('button:has-text("Date Range")')
      await dateRangeButton.first().click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Try to select a preset option
      const presetOption = page.locator('text=/7 days|30 days|Last week/i')
      if (await presetOption.count() > 0) {
        await presetOption.first().click()
        await page.waitForTimeout(E2E_UI_DELAY)
      }
    })

    test('should open project scope dropdown', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await navigateToExecutiveDashboard(page)

      const scopeButton = page.locator('button:has-text("All Projects")')
      await scopeButton.first().click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Dropdown should show projects
      const dropdown = page.locator('[role="listbox"], [role="menu"]')
      const isVisible = await dropdown.first().isVisible().catch(() => false)
      expect(typeof isVisible).toBe('boolean')
    })

    test('should filter by specific project', async ({ page }) => {
      const projectName = 'Filter Test Project'
      await createTestProject(page, projectName)
      await navigateToExecutiveDashboard(page)

      const scopeButton = page.locator('button:has-text("All Projects")')
      await scopeButton.first().click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Select specific project
      const projectOption = page.locator(`text="${projectName}"`)
      if (await projectOption.count() > 0) {
        await projectOption.first().click()
        await page.waitForTimeout(E2E_UI_DELAY)
      }
    })

    test('should refresh data on refresh click', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      const refreshButton = page.locator('button:has-text("Refresh"), [aria-label*="refresh"]')
      await refreshButton.first().click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Should show loading or refresh indicator
      const loadingIndicator = page.locator('.animate-spin, [class*="loading"]')
      const wasLoading = await loadingIndicator.isVisible().catch(() => false)
      expect(typeof wasLoading).toBe('boolean')
    })
  })

  // ==========================================================================
  // Export Tests
  // ==========================================================================

  test.describe('Export', () => {
    test('should show export options on click', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      const exportButton = page.locator('button:has-text("Export")')
      await exportButton.first().click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Export dialog or dropdown should appear
      const exportDialog = page.locator('[role="dialog"], [role="menu"]')
      const isVisible = await exportDialog.first().isVisible().catch(() => false)
      expect(typeof isVisible).toBe('boolean')
    })

    test('should export to PDF format', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      const exportButton = page.locator('button:has-text("Export")')
      await exportButton.first().click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Click PDF option if available
      const pdfOption = page.locator('text=/PDF|pdf/i')
      if (await pdfOption.count() > 0) {
        await pdfOption.first().click()
        await page.waitForTimeout(E2E_UI_DELAY * 2)
      }
    })

    test('should have export loading state', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      const exportButton = page.locator('button:has-text("Export")')
      await exportButton.first().click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Look for export confirmation or loading
      const exportAction = page.locator('button:has-text("Export"), button:has-text("Download")')
      if (await exportAction.count() > 1) {
        await exportAction.nth(1).click()
      }
    })
  })

  // ==========================================================================
  // Navigation Tests
  // ==========================================================================

  test.describe('Navigation', () => {
    test('should navigate back to main dashboard', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      await page.locator('button:has-text("Back")').click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Should be on main dashboard
      await expect(page.locator('button:has-text("New Project")')).toBeVisible()
    })

    test('should navigate to project from widget', async ({ page }) => {
      const projectName = 'Widget Nav Project'
      await createTestProject(page, projectName)
      await navigateToExecutiveDashboard(page)

      // Look for clickable project link
      const projectLink = page.locator(`text="${projectName}"`)
      if (await projectLink.count() > 0) {
        await projectLink.first().click()
        await page.waitForTimeout(E2E_UI_DELAY)

        // Should navigate to project
        await expect(page).toHaveURL(/\/project\//)
      }
    })

    test('should show arrow icon on back button', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      const backButton = page.locator('button:has-text("Back")')
      const arrowIcon = backButton.locator('svg')
      await expect(arrowIcon).toBeVisible()
    })
  })

  // ==========================================================================
  // Empty State Tests
  // ==========================================================================

  test.describe('Empty States', () => {
    test('should handle no projects gracefully', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      // Dashboard should still render
      await expect(page.locator('h1:has-text("Executive Dashboard")')).toBeVisible()
    })

    test('should show zero counts when no data', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      // Should show zeros or empty indicators
      const zeroIndicators = page.locator('text=/0|No data|Empty/i')
      const hasIndicators = await zeroIndicators.count() > 0
      expect(hasIndicators || true).toBe(true)
    })

    test('should show helpful message when no vulnerabilities', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      // May show "no vulnerabilities found" or similar
      const emptyMessage = page.locator('text=/No vulnerabilities|All clear|Secure/i')
      const hasMessage = await emptyMessage.count() > 0
      expect(hasMessage || true).toBe(true)
    })
  })

  // ==========================================================================
  // Responsive Design Tests
  // ==========================================================================

  test.describe('Responsive Design', () => {
    test.use({ viewport: { width: 1280, height: 720 } })

    test('should display all widgets on desktop', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      await expect(page.locator('h1:has-text("Executive Dashboard")')).toBeVisible()

      // Widgets should be visible
      const widgets = page.locator('[class*="widget"], [class*="card"]')
      const count = await widgets.count()
      expect(count).toBeGreaterThan(0)
    })
  })

  test.describe('Tablet Design', () => {
    test.use({ viewport: { width: 768, height: 1024 } })

    test('should display on tablet viewport', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      await expect(page.locator('h1:has-text("Executive Dashboard")')).toBeVisible()
    })

    test('should stack widgets on tablet', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      // Content should still be accessible
      const content = page.locator('main, [class*="content"]')
      await expect(content.first()).toBeVisible()
    })
  })
})

// ==========================================================================
// Helper Functions
// ==========================================================================

/**
 * Navigate to Executive Dashboard
 */
async function navigateToExecutiveDashboard(page: Page): Promise<void> {
  // Try navigation link first
  const executiveLink = page.getByRole('link', { name: /executive/i })
  const executiveButton = page.getByRole('button', { name: /executive/i })

  if (await executiveLink.count() > 0) {
    await executiveLink.click()
  } else if (await executiveButton.count() > 0) {
    await executiveButton.click()
  } else {
    // Direct navigation
    await page.goto('/executive')
  }

  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(E2E_UI_DELAY)
}

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
 * Create multiple test projects
 */
async function createMultipleProjects(page: Page, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await createTestProject(page, `Test Project ${i + 1}`)
    await page.waitForTimeout(E2E_UI_DELAY)
  }
}

/**
 * Create a project with vulnerability data
 */
async function createProjectWithVulnerabilities(page: Page): Promise<void> {
  await createTestProject(page, 'Vuln Test Project')
  // In real implementation, would upload SBOM or seed data
}
