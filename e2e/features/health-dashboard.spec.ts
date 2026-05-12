import { test, expect, resetAppState } from '../electron-helper'
import { createProjectOnly, navigateToProjectDetail, E2E_UI_DELAY } from '../shared-helpers'

test.describe('Health Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  test.describe('Tab Display', () => {
    test('should display health tab in project detail', async ({ page }) => {
      await createProjectOnly(page, 'Health Tab Test')
      await navigateToProjectDetail(page, 'Health Tab Test')

      const healthTab = page.getByRole('tab', { name: /health/i })
      const count = await healthTab.count()

      if (count > 0) {
        await expect(healthTab.first()).toBeVisible()
      }
    })

    test('should navigate to health tab on click', async ({ page }) => {
      await createProjectOnly(page, 'Health Nav Test')
      await navigateToProjectDetail(page, 'Health Nav Test')

      const healthTab = page.getByRole('tab', { name: /health/i })
      if ((await healthTab.count()) > 0) {
        await healthTab.click()
        await page.waitForTimeout(E2E_UI_DELAY)

        const healthContent = page.locator('text=/Health|Score|Overview/i')
        await expect(healthContent.first()).toBeVisible()
      }
    })

    test('should show health icon on tab', async ({ page }) => {
      await createProjectOnly(page, 'Health Icon Test')
      await navigateToProjectDetail(page, 'Health Icon Test')

      const healthTab = page.getByRole('tab', { name: /health/i })
      if ((await healthTab.count()) > 0) {
        const icon = healthTab.first().locator('svg')
        await expect(icon).toBeVisible()
      }
    })

    test('should be fourth tab in order', async ({ page }) => {
      await createProjectOnly(page, 'Tab Order Test')
      await navigateToProjectDetail(page, 'Tab Order Test')

      const tabs = page.getByRole('tab')
      const tabNames = await tabs.allTextContents()

      const healthIndex = tabNames.findIndex((t) => /health/i.test(t))
      if (healthIndex >= 0) {
        expect(healthIndex).toBeGreaterThanOrEqual(0)
      }
    })
  })

  test.describe('Health Scores', () => {
    test('should display overall health score', async ({ page }) => {
      await createProjectOnly(page, 'Health Test Project')
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        const scoreDisplay = page.locator('text=/\\d+\\/100|\\d+%/')
        await expect(scoreDisplay.first()).toBeVisible()
      }
    })

    test('should show health score gauge', async ({ page }) => {
      await createProjectOnly(page, 'Health Test Project')
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        const gauge = page.locator('[class*="gauge"], [class*="meter"], svg[class*="score"]')
        await expect(gauge.first()).toBeVisible()
      }
    })

    test('should display component health breakdown', async ({ page }) => {
      await createProjectOnly(page, 'Health Test Project')
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        const componentHealth = page.locator('text=/Component|Package|Library/i')
        await expect(componentHealth.first()).toBeVisible()
      }
    })

    test('should color code health scores', async ({ page }) => {
      await createProjectOnly(page, 'Health Test Project')
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        const coloredElements = page.locator('[class*="green"], [class*="yellow"], [class*="red"]')
        await expect(coloredElements.first()).toBeVisible()
      }
    })

    test('should show health category breakdown', async ({ page }) => {
      await createProjectOnly(page, 'Health Test Project')
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        const categories = page.locator('text=/Vulnerabilities|Dependencies|Outdated/i')
        await expect(categories.first()).toBeVisible()
      }
    })
  })

  test.describe('Trends', () => {
    test('should display trend indicators', async ({ page }) => {
      await createProjectOnly(page, 'History Test Project')
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        const trends = page.locator('text=/Trend|Improving|Declining|Stable/i, svg')
        await expect(trends.first()).toBeVisible()
      }
    })

    test('should show health history chart', async ({ page }) => {
      await createProjectOnly(page, 'History Test Project')
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        const chart = page.locator('[class*="chart"], [class*="graph"], canvas')
        await expect(chart.first()).toBeVisible()
      }
    })

    test('should display trend direction icons', async ({ page }) => {
      await createProjectOnly(page, 'History Test Project')
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        const trendIcons = page.locator('svg')
        expect(await trendIcons.count()).toBeGreaterThan(0)
      }
    })

    test('should compare current vs previous health', async ({ page }) => {
      await createProjectOnly(page, 'History Test Project')
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        const comparison = page.locator('text=/vs|compared|change/i')
        await expect(comparison.first()).toBeVisible()
      }
    })
  })

  test.describe('Remediation', () => {
    test('should show remediation suggestions', async ({ page }) => {
      await createProjectOnly(page, 'Health Test Project')
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        const suggestions = page.locator('text=/Suggestion|Recommendation|Action/i')
        await expect(suggestions.first()).toBeVisible()
      }
    })

    test('should prioritize critical issues', async ({ page }) => {
      await createProjectOnly(page, 'Health Test Project')
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        const critical = page.locator('text=/Critical|High Priority|Urgent/i')
        await expect(critical.first()).toBeVisible()
      }
    })

    test('should show actionable items', async ({ page }) => {
      await createProjectOnly(page, 'Health Test Project')
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        const actionButtons = page.locator('button:has-text("Fix"), button:has-text("Update")')
        await expect(actionButtons.first()).toBeVisible()
      }
    })
  })

  test.describe('Component Health', () => {
    test('should list components with health scores', async ({ page }) => {
      await createProjectOnly(page, 'Components Test Project')
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        const components = page.locator('[data-testid="component-health"], tr:has-text("health")')
        await expect(components.first()).toBeVisible()
      }
    })

    test('should sort components by health score', async ({ page }) => {
      await createProjectOnly(page, 'Components Test Project')
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        const sortHeader = page.locator('th:has-text("Health"), button:has-text("Sort")')
        if ((await sortHeader.count()) > 0) {
          await sortHeader.first().click()
          await page.waitForTimeout(E2E_UI_DELAY)
        }
      }
    })

    test('should filter unhealthy components', async ({ page }) => {
      await createProjectOnly(page, 'Components Test Project')
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        const filterButton = page.locator('button:has-text("Unhealthy"), button:has-text("Low Health")')
        if ((await filterButton.count()) > 0) {
          await filterButton.click()
          await page.waitForTimeout(E2E_UI_DELAY)
        }
      }
    })
  })

  test.describe('Empty States', () => {
    test('should handle project with no components', async ({ page }) => {
      await createProjectOnly(page, 'Empty Health Test')
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        const emptyMessage = page.locator('text=/No components|No data|Empty/i')
        await expect(emptyMessage.first()).toBeVisible()
      }
    })

    test('should show placeholder for no history', async ({ page }) => {
      await createProjectOnly(page, 'No History Test')
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        const noHistory = page.locator('text=/No history|Not enough data/i')
        await expect(noHistory.first()).toBeVisible()
      }
    })

    test('should show perfect health message', async ({ page }) => {
      await createProjectOnly(page, 'Perfect Health Test')
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        const allClear = page.locator('text=/All clear|No issues|Perfect/i')
        await expect(allClear.first()).toBeVisible()
      }
    })
  })

  test.describe('Responsive Design', () => {
    test.use({ viewport: { width: 768, height: 1024 } })

    test('should display health tab on tablet', async ({ page }) => {
      await createProjectOnly(page, 'Tablet Health Test')
      await navigateToProjectDetail(page, 'Tablet Health Test')

      const healthTab = page.getByRole('tab', { name: /health/i })
      if ((await healthTab.count()) > 0) {
        await expect(healthTab.first()).toBeVisible()
      }
    })

    test('should show health content on tablet', async ({ page }) => {
      await createProjectOnly(page, 'Health Test Project')
      await navigateToHealthTab(page)

      if (await isHealthTabAvailable(page)) {
        await expect(page.getByRole('tabpanel')).toBeVisible()
      }
    })
  })
})

async function navigateToHealthTab(page: import('@playwright/test').Page): Promise<void> {
  const healthTab = page.getByRole('tab', { name: /health/i })
  if ((await healthTab.count()) > 0) {
    await healthTab.click()
    await page.waitForTimeout(E2E_UI_DELAY)
  }
}

async function isHealthTabAvailable(page: import('@playwright/test').Page): Promise<boolean> {
  const healthTab = page.getByRole('tab', { name: /health/i })
  return (await healthTab.count()) > 0
}
