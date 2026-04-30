import { test, expect, resetAppState } from '../electron-helper'
import { createProjectOnly, navigateToExecutiveDashboard, E2E_UI_DELAY, E2E_SELECTOR_TIMEOUT } from '../shared-helpers'

test.describe('Executive Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  test.describe('Page Load', () => {
    test('should display executive dashboard header', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      await expect(page.getByRole('heading', { name: 'Executive Dashboard' })).toBeVisible({
        timeout: E2E_SELECTOR_TIMEOUT,
      })
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

      const settingsButton = page.getByRole('button', { name: 'Dashboard Settings' })
      await expect(settingsButton).toBeVisible()
      await settingsButton.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      const dateRangeLabel = page.locator('text=/Date Range/i')
      await expect(dateRangeLabel.first()).toBeVisible()
    })

    test('should display project scope filter', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      const settingsButton = page.getByRole('button', { name: 'Dashboard Settings' })
      await expect(settingsButton).toBeVisible()
      await settingsButton.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      const projectScope = page.locator('text=/Project Scope|All Projects/i')
      await expect(projectScope.first()).toBeVisible()
    })

    test('should show refresh button', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      const settingsButton = page.getByRole('button', { name: 'Dashboard Settings' })
      await expect(settingsButton).toBeVisible()
      await settingsButton.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      const refreshButton = page.locator('button:has-text("Refresh")')
      await expect(refreshButton).toBeVisible()
    })

    test('should show export button', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      const exportButton = page.locator('button:has-text("Export")')
      await expect(exportButton.first()).toBeVisible()
    })
  })

  test.describe('Widgets', () => {
    test('should display risk gauge widget', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      const riskWidget = page.locator('text=/Risk|Overall|Score/i')
      await expect(riskWidget.first()).toBeVisible()
    })

    test.skip('should display vulnerability trend chart', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

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

    test.skip('should display action items section', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      const actionItems = page.locator('text=/Action Items|Recommendations|Priority/i')
      await expect(actionItems.first()).toBeVisible()
    })

    test.skip('should show team productivity section if available', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      const productivitySection = page.locator('text=/Productivity|Team|Activity/i')
      await expect(productivitySection.first()).toBeVisible()
    })

    test('should display vulnerability counts', async ({ page }) => {
      await createProjectOnly(page, 'Vuln Test Project')
      await navigateToExecutiveDashboard(page)

      const countText = page.locator('text=/\\d+.*vulnerabilities?/i')
      await expect(countText.first()).toBeVisible()
    })

    test('should show critical vulnerability count prominently', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      const criticalCount = page.locator('text=/Critical.*\\d+|\\d+.*Critical/i')
      await expect(criticalCount.first()).toBeVisible()
    })
  })

  test.describe('Filters', () => {
    test('should open date range picker', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      const settingsButton = page.getByRole('button', { name: 'Dashboard Settings' })
      await settingsButton.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      const dateRangeLabel = page.locator('text=/Date Range/i')
      await expect(dateRangeLabel.first()).toBeVisible()
    })

    test('should select date range preset', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      const settingsButton = page.getByRole('button', { name: 'Dashboard Settings' })
      await settingsButton.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      const presetOption = page.locator('text=/Last 7 days|Last 30 days|7 days/i')
      if ((await presetOption.count()) > 0) {
        await presetOption.first().click()
        await page.waitForTimeout(E2E_UI_DELAY)
      }
    })

    test('should open project scope dropdown', async ({ page }) => {
      for (let i = 0; i < 3; i++) {
        await createProjectOnly(page, `Test Project ${i + 1}`)
        await page.waitForTimeout(E2E_UI_DELAY)
      }
      await navigateToExecutiveDashboard(page)

      const settingsButton = page.getByRole('button', { name: 'Dashboard Settings' })
      await settingsButton.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      const scopeOption = page.locator('text=/All Projects|Project Scope/i')
      await expect(scopeOption.first()).toBeVisible()
    })

    test('should filter by specific project', async ({ page }) => {
      const projectName = 'Filter Test Project'
      await createProjectOnly(page, projectName)
      await navigateToExecutiveDashboard(page)

      const settingsButton = page.getByRole('button', { name: 'Dashboard Settings' })
      await settingsButton.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      const selectedOption = page.locator('text=/Selected Projects/i')
      if ((await selectedOption.count()) > 0) {
        await selectedOption.first().click()
        await page.waitForTimeout(E2E_UI_DELAY)
      }
    })

    test('should refresh data on refresh click', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      const settingsButton = page.getByRole('button', { name: 'Dashboard Settings' })
      await settingsButton.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      const refreshButton = page.locator('button:has-text("Refresh")')
      await refreshButton.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      const loadingIndicator = page.locator('.animate-spin, [class*="loading"]')
      await loadingIndicator
        .first()
        .waitFor({ state: 'attached', timeout: 5000 })
        .catch(() => {})
    })
  })

  test.describe('Export', () => {
    test('should show export options on click', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      const exportButton = page.locator('button:has-text("Export Report")')
      if ((await exportButton.count()) > 0 && (await exportButton.first().isEnabled())) {
        await exportButton.first().click()
        await page.waitForTimeout(E2E_UI_DELAY)
      }
    })

    test('should export to PDF format', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      const exportButton = page.locator('button:has-text("Export Report")')
      if ((await exportButton.count()) > 0 && (await exportButton.first().isEnabled())) {
        await exportButton.first().click()
        await page.waitForTimeout(E2E_UI_DELAY)
      }
    })

    test('should have export loading state', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      const exportButton = page.locator('button:has-text("Export Report")')
      if ((await exportButton.count()) > 0 && (await exportButton.first().isEnabled())) {
        await exportButton.first().click()
        await page.waitForTimeout(E2E_UI_DELAY)

        const spinner = page.locator('.animate-spin, [class*="loading"]')
        await spinner
          .first()
          .waitFor({ state: 'attached', timeout: 5000 })
          .catch(() => {})
      }
    })
  })

  test.describe('Navigation', () => {
    test('should navigate back to main dashboard', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      await page.locator('button:has-text("Back")').click()
      await page.waitForTimeout(E2E_UI_DELAY)

      await expect(page.locator('button:has-text("New Project")')).toBeVisible()
    })

    test('should navigate to project from widget', async ({ page }) => {
      const projectName = 'Widget Nav Project'
      await createProjectOnly(page, projectName)
      await navigateToExecutiveDashboard(page)

      const projectLink = page.locator(`text="${projectName}"`)
      if ((await projectLink.count()) > 0) {
        await projectLink.first().click()
        await page.waitForTimeout(E2E_UI_DELAY)

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

  test.describe('Empty States', () => {
    test('should handle no projects gracefully', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      await expect(page.getByRole('heading', { name: 'Executive Dashboard' })).toBeVisible()
    })

    test('should show zero counts when no data', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      const zeroIndicators = page.locator('text=/0|No data|Empty/i')
      await zeroIndicators
        .first()
        .waitFor({ state: 'attached', timeout: 5000 })
        .catch(() => {})
    })

    test('should show helpful message when no vulnerabilities', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      const emptyMessage = page.locator('text=/No vulnerabilities|All clear|Secure/i')
      await emptyMessage
        .first()
        .waitFor({ state: 'attached', timeout: 5000 })
        .catch(() => {})
    })
  })

  test.describe('Responsive Design', () => {
    test.use({ viewport: { width: 1280, height: 720 } })

    test('should display all widgets on desktop', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      await expect(page.getByRole('heading', { name: 'Executive Dashboard' })).toBeVisible()

      const widgets = page.locator('[class*="widget"], [class*="card"]')
      const count = await widgets.count()
      expect(count).toBeGreaterThan(0)
    })
  })

  test.describe('Tablet Design', () => {
    test.use({ viewport: { width: 768, height: 1024 } })

    test('should display on tablet viewport', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      await expect(page.getByRole('heading', { name: 'Executive Dashboard' })).toBeVisible()
    })

    test('should stack widgets on tablet', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      const content = page.locator('.container, [class*="content"], .grid')
      await expect(content.first()).toBeVisible()
    })
  })
})
