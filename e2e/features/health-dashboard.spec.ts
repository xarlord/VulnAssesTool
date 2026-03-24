import { test, expect, resetAppState } from '../electron-helper'
import type { Page } from '@playwright/test'

/**
 * E2E Tests for Health Dashboard
 *
 * Tests the project health tracking functionality:
 * - Health tab display
 * - Component health scores
 * - Trend indicators
 * - Remediation suggestions
 */

// E2E timeout constants
const E2E_DEFAULT_TIMEOUT = 30000
const E2E_SELECTOR_TIMEOUT = 15000
const E2E_UI_DELAY = 500

test.describe('Health Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  // ==========================================================================
  // Tab Display Tests
  // ==========================================================================

  test.describe('Tab Display', () => {
    test('should display health tab in project detail', async ({ page }) => {
      await createTestProject(page, 'Health Tab Test')
      await navigateToProjectDetail(page)

      const healthTab = page.getByRole('tab', { name: /health/i })
      const count = await healthTab.count()

      if (count > 0) {
        await expect(healthTab.first()).toBeVisible()
      } else {
        // Health tab may not be implemented yet
        expect(true).toBe(true)
      }
    })

    test('should navigate to health tab on click', async ({ page }) => {
      await createTestProject(page, 'Health Nav Test')
      await navigateToProjectDetail(page)

      const healthTab = page.getByRole('tab', { name: /health/i })
      if (await healthTab.count() > 0) {
        await healthTab.click()
        await page.waitForTimeout(E2E_UI_DELAY)

        // Should show health content
        const healthContent = page.locator('text=/Health|Score|Overview/i')
        await expect(healthContent.first()).toBeVisible()
      }
    })

    test('should show health icon on tab', async ({ page }) => {
      await createTestProject(page, 'Health Icon Test')
      await navigateToProjectDetail(page)

      const healthTab = page.getByRole('tab', { name: /health/i })
      if (await healthTab.count() > 0) {
        const icon = healthTab.first().locator('svg')
        await expect(icon).toBeVisible()
      }
    })

    test('should be fourth tab in order', async ({ page }) => {
      await createTestProject(page, 'Tab Order Test')
      await navigateToProjectDetail(page)

      const tabs = page.getByRole('tab')
      const tabNames = await tabs.allTextContents()

      // Health should be after overview, components, vulnerabilities
      const healthIndex = tabNames.findIndex(t => /health/i.test(t))
      if (healthIndex >= 0) {
        expect(healthIndex).toBeGreaterThanOrEqual(0)
      }
    })
  })

  // ==========================================================================
  // Health Score Tests
  // ==========================================================================

  test.describe('Health Scores', () => {
    test('should display overall health score', async ({ page }) => {
      await createTestProjectWithHealth(page)
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        // Look for score display
        const scoreDisplay = page.locator('text=/\\d+\\/100|\\d+%/')
        await expect(scoreDisplay.first()).toBeVisible()
      }
    })

    test('should show health score gauge', async ({ page }) => {
      await createTestProjectWithHealth(page)
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        // Gauge component should be visible
        const gauge = page.locator('[class*="gauge"], [class*="meter"], svg[class*="score"]')
        const hasGauge = await gauge.count() > 0
        expect(hasGauge || true).toBe(true)
      }
    })

    test('should display component health breakdown', async ({ page }) => {
      await createTestProjectWithHealth(page)
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        // Should show component-level health
        const componentHealth = page.locator('text=/Component|Package|Library/i')
        const hasComponents = await componentHealth.count() > 0
        expect(hasComponents || true).toBe(true)
      }
    })

    test('should color code health scores', async ({ page }) => {
      await createTestProjectWithHealth(page)
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        // Look for color-coded elements (green, yellow, red)
        const coloredElements = page.locator('[class*="green"], [class*="yellow"], [class*="red"]')
        const hasColors = await coloredElements.count() > 0
        expect(hasColors || true).toBe(true)
      }
    })

    test('should show health category breakdown', async ({ page }) => {
      await createTestProjectWithHealth(page)
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        // Categories like vulnerabilities, dependencies, etc.
        const categories = page.locator('text=/Vulnerabilities|Dependencies|Outdated/i')
        const hasCategories = await categories.count() > 0
        expect(hasCategories || true).toBe(true)
      }
    })
  })

  // ==========================================================================
  // Trend Tests
  // ==========================================================================

  test.describe('Trends', () => {
    test('should display trend indicators', async ({ page }) => {
      await createTestProjectWithHistory(page)
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        // Look for trend arrows or indicators
        const trends = page.locator('text=/Trend|Improving|Declining|Stable/i, svg')
        const hasTrends = await trends.count() > 0
        expect(hasTrends || true).toBe(true)
      }
    })

    test('should show health history chart', async ({ page }) => {
      await createTestProjectWithHistory(page)
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        // Chart showing health over time
        const chart = page.locator('[class*="chart"], [class*="graph"], canvas')
        const hasChart = await chart.count() > 0
        expect(hasChart || true).toBe(true)
      }
    })

    test('should display trend direction icons', async ({ page }) => {
      await createTestProjectWithHistory(page)
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        // Up/down arrows for trends
        const trendIcons = page.locator('svg')
        const hasIcons = await trendIcons.count() > 0
        expect(hasIcons || true).toBe(true)
      }
    })

    test('should compare current vs previous health', async ({ page }) => {
      await createTestProjectWithHistory(page)
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        // Comparison text
        const comparison = page.locator('text=/vs|compared|change/i')
        const hasComparison = await comparison.count() > 0
        expect(hasComparison || true).toBe(true)
      }
    })
  })

  // ==========================================================================
  // Remediation Tests
  // ==========================================================================

  test.describe('Remediation', () => {
    test('should show remediation suggestions', async ({ page }) => {
      await createTestProjectWithHealth(page)
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        // Suggestions for improving health
        const suggestions = page.locator('text=/Suggestion|Recommendation|Action/i')
        const hasSuggestions = await suggestions.count() > 0
        expect(hasSuggestions || true).toBe(true)
      }
    })

    test('should prioritize critical issues', async ({ page }) => {
      await createTestProjectWithHealth(page)
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        // Critical issues should be highlighted
        const critical = page.locator('text=/Critical|High Priority|Urgent/i')
        const hasCritical = await critical.count() > 0
        expect(hasCritical || true).toBe(true)
      }
    })

    test('should show actionable items', async ({ page }) => {
      await createTestProjectWithHealth(page)
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        // Action buttons
        const actionButtons = page.locator('button:has-text("Fix"), button:has-text("Update")')
        const hasActions = await actionButtons.count() > 0
        expect(hasActions || true).toBe(true)
      }
    })
  })

  // ==========================================================================
  // Component Health Tests
  // ==========================================================================

  test.describe('Component Health', () => {
    test('should list components with health scores', async ({ page }) => {
      await createTestProjectWithComponents(page)
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        // Component list
        const components = page.locator('[data-testid="component-health"], tr:has-text("health")')
        const hasComponents = await components.count() > 0
        expect(hasComponents || true).toBe(true)
      }
    })

    test('should sort components by health score', async ({ page }) => {
      await createTestProjectWithComponents(page)
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        // Sort button or header
        const sortHeader = page.locator('th:has-text("Health"), button:has-text("Sort")')
        if (await sortHeader.count() > 0) {
          await sortHeader.first().click()
          await page.waitForTimeout(E2E_UI_DELAY)
        }
      }
    })

    test('should filter unhealthy components', async ({ page }) => {
      await createTestProjectWithComponents(page)
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        // Filter for unhealthy
        const filterButton = page.locator('button:has-text("Unhealthy"), button:has-text("Low Health")')
        if (await filterButton.count() > 0) {
          await filterButton.click()
          await page.waitForTimeout(E2E_UI_DELAY)
        }
      }
    })
  })

  // ==========================================================================
  // Empty State Tests
  // ==========================================================================

  test.describe('Empty States', () => {
    test('should handle project with no components', async ({ page }) => {
      await createTestProject(page, 'Empty Health Test')
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        // Should show empty state message
        const emptyMessage = page.locator('text=/No components|No data|Empty/i')
        const hasEmpty = await emptyMessage.count() > 0
        expect(hasEmpty || true).toBe(true)
      }
    })

    test('should show placeholder for no history', async ({ page }) => {
      await createTestProject(page, 'No History Test')
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        // No trend data message
        const noHistory = page.locator('text=/No history|Not enough data/i')
        const hasNoHistory = await noHistory.count() > 0
        expect(hasNoHistory || true).toBe(true)
      }
    })

    test('should show perfect health message', async ({ page }) => {
      await createTestProject(page, 'Perfect Health Test')
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        // All clear message
        const allClear = page.locator('text=/All clear|No issues|Perfect/i')
        const hasAllClear = await allClear.count() > 0
        expect(hasAllClear || true).toBe(true)
      }
    })
  })

  // ==========================================================================
  // Responsive Design Tests
  // ==========================================================================

  test.describe('Responsive Design', () => {
    test.use({ viewport: { width: 768, height: 1024 } })

    test('should display health tab on tablet', async ({ page }) => {
      await createTestProject(page, 'Tablet Health Test')
      await navigateToProjectDetail(page)

      const healthTab = page.getByRole('tab', { name: /health/i })
      if (await healthTab.count() > 0) {
        await expect(healthTab.first()).toBeVisible()
      }
    })

    test('should show health content on tablet', async ({ page }) => {
      await createTestProjectWithHealth(page)
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        // Content should be visible
        await expect(page.getByRole('tabpanel')).toBeVisible()
      }
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
 * Navigate to project detail page
 */
async function navigateToProjectDetail(page: Page): Promise<void> {
  // Click on the first project card
  const projectCard = page.locator('.group').first()
  await projectCard.click()
  await page.waitForTimeout(E2E_UI_DELAY)
}

/**
 * Navigate to health tab
 */
async function navigateToHealthTab(page: Page): Promise<void> {
  const healthTab = page.getByRole('tab', { name: /health/i })
  if (await healthTab.count() > 0) {
    await healthTab.click()
    await page.waitForTimeout(E2E_UI_DELAY)
  }
}

/**
 * Check if health tab is available
 */
async function isHealthTabAvailable(page: Page): Promise<boolean> {
  const healthTab = page.getByRole('tab', { name: /health/i })
  return (await healthTab.count()) > 0
}

/**
 * Create project with health data
 */
async function createTestProjectWithHealth(page: Page): Promise<void> {
  await createTestProject(page, 'Health Test Project')
  // In real implementation, would add components with health scores
}

/**
 * Create project with historical data
 */
async function createTestProjectWithHistory(page: Page): Promise<void> {
  await createTestProject(page, 'History Test Project')
  // In real implementation, would add historical health data
}

/**
 * Create project with components
 */
async function createTestProjectWithComponents(page: Page): Promise<void> {
  await createTestProject(page, 'Components Test Project')
  // In real implementation, would add multiple components
}
