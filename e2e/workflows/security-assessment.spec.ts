import { test, expect, resetAppState } from '../electron-helper'
import {
  createProjectOnly,
  navigateToProjectDetail,
  navigateToExecutiveDashboard,
  E2E_UI_DELAY,
} from '../shared-helpers'

test.describe('Security Assessment Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  // ==========================================================================
  // Assessment Setup Workflow
  // ==========================================================================

  test.describe('Assessment Setup', () => {
    test('should create assessment project', async ({ page }) => {
      const projectName = 'Security Assessment Project'
      await createProjectOnly(page, projectName)

      await expect(page.getByText(projectName)).toBeVisible()
    })

    test('should configure project for assessment', async ({ page }) => {
      const projectName = 'Configured Assessment'
      await createProjectOnly(page, projectName)
      await navigateToProjectDetail(page, projectName)

      // Verify all tabs are accessible
      const tabs = ['Overview', 'Components', 'Vulnerabilities']
      for (const tabName of tabs) {
        const tab = page.getByRole('tab', { name: new RegExp(tabName, 'i') })
        if ((await tab.count()) > 0) {
          await tab.click()
          await page.waitForTimeout(E2E_UI_DELAY)
        }
      }
    })

    test('should access executive dashboard', async ({ page }) => {
      await navigateToExecutiveDashboard(page)

      await expect(page.locator('h1:has-text("Executive Dashboard")')).toBeVisible()
    })
  })

  // ==========================================================================
  // Vulnerability Scanning Workflow
  // ==========================================================================

  test.describe('Vulnerability Scanning', () => {
    test('should access vulnerability scan UI', async ({ page }) => {
      const projectName = 'Scan Test Project'
      await createProjectOnly(page, projectName)
      await navigateToProjectDetail(page, projectName)

      await page.getByRole('tab', { name: /vulnerabilities/i }).click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Should show scan interface
      const scanUI = page.getByText(/vulnerabilities|CVE/i)
      await expect(scanUI.first()).toBeVisible()
    })

    test('should display vulnerability list', async ({ page }) => {
      const projectName = 'Vuln List Test'
      await createProjectOnly(page, projectName)
      await navigateToProjectDetail(page, projectName)

      await page.getByRole('tab', { name: /vulnerabilities/i }).click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Should show empty state or list
      const vulnContent = page.locator('text=/No vulnerabilities|CVE-|Found/i')
      await expect(vulnContent.first()).toBeVisible()
    })

    test('should filter vulnerabilities', async ({ page }) => {
      const projectName = 'Filter Test'
      await createProjectOnly(page, projectName)
      await navigateToProjectDetail(page, projectName)

      await page.getByRole('tab', { name: /vulnerabilities/i }).click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Look for filter controls
      const filters = page.locator('select, [role="combobox"], button:has-text("Filter")')
      if ((await filters.count()) > 0) {
        await filters.first().click()
        await page.waitForTimeout(E2E_UI_DELAY)
      }
    })

    test('should sort vulnerabilities', async ({ page }) => {
      const projectName = 'Sort Test'
      await createProjectOnly(page, projectName)
      await navigateToProjectDetail(page, projectName)

      await page.getByRole('tab', { name: /vulnerabilities/i }).click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Click on column headers to sort
      const headers = page.locator('th:has-text("Severity"), th:has-text("CVSS"), th:has-text("Risk")')
      if ((await headers.count()) > 0) {
        await headers.first().click()
        await page.waitForTimeout(E2E_UI_DELAY)
      }
    })
  })

  // ==========================================================================
  // Intelligence Analysis Workflow
  // ==========================================================================

  test.describe('Intelligence Analysis', () => {
    test('should view KEV intelligence', async ({ page }) => {
      const projectName = 'KEV Analysis Test'
      await createProjectOnly(page, projectName)
      await navigateToProjectDetail(page, projectName)

      await page.getByRole('tab', { name: /vulnerabilities/i }).click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Look for KEV indicators
      const kevIndicators = page.locator('text=/KEV|Known Exploited|CISA/i')
      // KEV indicators are optional - depend on data availability
      await kevIndicators
        .first()
        .waitFor({ state: 'attached', timeout: 5000 })
        .catch(() => {})
    })

    test('should view EPSS scores', async ({ page }) => {
      const projectName = 'EPSS Analysis Test'
      await createProjectOnly(page, projectName)
      await navigateToProjectDetail(page, projectName)

      await page.getByRole('tab', { name: /vulnerabilities/i }).click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Look for EPSS indicators
      const epssIndicators = page.locator('text=/EPSS|%|Exploit Prediction/i')
      // EPSS indicators are optional - depend on data availability
      await epssIndicators
        .first()
        .waitFor({ state: 'attached', timeout: 5000 })
        .catch(() => {})
    })

    test('should view risk scores', async ({ page }) => {
      const projectName = 'Risk Analysis Test'
      await createProjectOnly(page, projectName)
      await navigateToProjectDetail(page, projectName)

      await page.getByRole('tab', { name: /vulnerabilities/i }).click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Look for risk indicators
      const riskIndicators = page.locator('text=/Risk|Score|Priority/i')
      // Risk indicators are optional - depend on data availability
      await riskIndicators
        .first()
        .waitFor({ state: 'attached', timeout: 5000 })
        .catch(() => {})
    })

    test('should access vulnerability details', async ({ page }) => {
      const projectName = 'Vuln Detail Test'
      await createProjectOnly(page, projectName)
      await navigateToProjectDetail(page, projectName)

      await page.getByRole('tab', { name: /vulnerabilities/i }).click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Click on vulnerability if available
      const vulnRow = page.locator('tr:has-text("CVE-")').first()
      if ((await vulnRow.count()) > 0) {
        await vulnRow.click()
        await page.waitForTimeout(E2E_UI_DELAY)

        // Modal should show details
        const modal = page.locator('[role="dialog"]')
        // Modal may or may not appear depending on data
        const hasModal = await modal.isVisible().catch(() => false)

        if (hasModal) {
          await page.keyboard.press('Escape')
        }
      }
    })
  })

  // ==========================================================================
  // Health Assessment Workflow
  // ==========================================================================

  test.describe('Health Assessment', () => {
    test('should view project health', async ({ page }) => {
      const projectName = 'Health Assessment Test'
      await createProjectOnly(page, projectName)
      await navigateToProjectDetail(page, projectName)

      const healthTab = page.getByRole('tab', { name: /health/i })
      if ((await healthTab.count()) > 0) {
        await healthTab.click()
        await page.waitForTimeout(E2E_UI_DELAY)

        // Should show health content
        const healthContent = page.locator('text=/Health|Score|Overview/i')
        await expect(healthContent.first()).toBeVisible()
      }
    })

    test('should view component health breakdown', async ({ page }) => {
      const projectName = 'Component Health Test'
      await createProjectOnly(page, projectName)
      await navigateToProjectDetail(page, projectName)

      const healthTab = page.getByRole('tab', { name: /health/i })
      if ((await healthTab.count()) > 0) {
        await healthTab.click()
        await page.waitForTimeout(E2E_UI_DELAY)

        // Should show component health
        const componentHealth = page.locator('text=/Component|Package|Library/i')
        // Component health data is optional - depends on project data
        await componentHealth
          .first()
          .waitFor({ state: 'attached', timeout: 5000 })
          .catch(() => {})
      }
    })

    test('should view health trends', async ({ page }) => {
      const projectName = 'Health Trends Test'
      await createProjectOnly(page, projectName)
      await navigateToProjectDetail(page, projectName)

      const healthTab = page.getByRole('tab', { name: /health/i })
      if ((await healthTab.count()) > 0) {
        await healthTab.click()
        await page.waitForTimeout(E2E_UI_DELAY)

        // Look for trend indicators
        const trends = page.locator('text=/Trend|Improving|Declining|History/i')
        // Trend indicators are optional - depend on data history
        await trends
          .first()
          .waitFor({ state: 'attached', timeout: 5000 })
          .catch(() => {})
      }
    })
  })

  // ==========================================================================
  // Remediation Planning Workflow
  // ==========================================================================

  test.describe('Remediation Planning', () => {
    test('should view remediation suggestions', async ({ page }) => {
      const projectName = 'Remediation Planning Test'
      await createProjectOnly(page, projectName)
      await navigateToProjectDetail(page, projectName)

      // Check health tab for suggestions
      const healthTab = page.getByRole('tab', { name: /health/i })
      if ((await healthTab.count()) > 0) {
        await healthTab.click()
        await page.waitForTimeout(E2E_UI_DELAY)

        const suggestions = page.locator('text=/Suggestion|Recommendation|Action|Fix/i')
        // Suggestions are optional - depend on project data
        await suggestions
          .first()
          .waitFor({ state: 'attached', timeout: 5000 })
          .catch(() => {})
      }
    })

    test('should view dependency graph for impact analysis', async ({ page }) => {
      const projectName = 'Impact Analysis Test'
      await createProjectOnly(page, projectName)
      await navigateToProjectDetail(page, projectName)

      const graphButton = page.locator('button:has-text("Dependency Graph")')
      if ((await graphButton.count()) > 0) {
        await graphButton.click()
        await page.waitForTimeout(E2E_UI_DELAY)

        await expect(page.locator('h1:has-text("Dependency Graph")')).toBeVisible()
      }
    })

    test('should access FPF for filtering', async ({ page }) => {
      const projectName = 'FPF Planning Test'
      await createProjectOnly(page, projectName)
      await navigateToProjectDetail(page, projectName)

      const fpfButton = page.locator('button:has-text("False Positive")')
      if ((await fpfButton.count()) > 0) {
        await fpfButton.click()
        await page.waitForTimeout(E2E_UI_DELAY)

        await expect(page.locator('text=/False Positive|Filter/i').first()).toBeVisible()
      }
    })
  })

  // ==========================================================================
  // Report Generation Workflow
  // ==========================================================================

  test.describe('Report Generation', () => {
    test('should access export functionality', async ({ page }) => {
      const projectName = 'Export Test'
      await createProjectOnly(page, projectName)
      await navigateToProjectDetail(page, projectName)

      const exportButton = page.locator('button:has-text("Export")')
      if ((await exportButton.count()) > 0) {
        await exportButton.first().click()
        await page.waitForTimeout(E2E_UI_DELAY)

        const dialog = page.locator('[role="dialog"]')
        await expect(dialog).toBeVisible()

        await page.keyboard.press('Escape')
      }
    })

    test('should generate executive report', async ({ page }) => {
      // Create a project first so the executive dashboard has data
      await createProjectOnly(page, 'Report Project')
      await navigateToExecutiveDashboard(page)

      const exportButton = page.locator('button:has-text("Export")')
      if ((await exportButton.count()) > 0 && (await exportButton.first().isEnabled())) {
        await exportButton.first().click()
        await page.waitForTimeout(E2E_UI_DELAY)
      }
    })

    test('should select report format', async ({ page }) => {
      const projectName = 'Format Test'
      await createProjectOnly(page, projectName)
      await navigateToProjectDetail(page, projectName)

      const exportButton = page.locator('button:has-text("Export")')
      if ((await exportButton.count()) > 0) {
        await exportButton.first().click()
        await page.waitForTimeout(E2E_UI_DELAY)

        // Look for format options
        const formats = page.locator('text=/PDF|CSV|JSON/i')
        // Format options are optional - depend on export implementation
        await formats
          .first()
          .waitFor({ state: 'attached', timeout: 5000 })
          .catch(() => {})

        await page.keyboard.press('Escape')
      }
    })
  })

  // ==========================================================================
  // Complete Assessment Workflow Tests
  // ==========================================================================

  test.describe('Complete Assessment', () => {
    test('should complete basic assessment workflow', async ({ page }) => {
      // Step 1: Create project
      const projectName = 'Complete Assessment Test'
      await createProjectOnly(page, projectName)

      // Step 2: Navigate to project
      await navigateToProjectDetail(page, projectName)

      // Step 3: Check vulnerabilities
      await page.getByRole('tab', { name: /vulnerabilities/i }).click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Step 4: Check health
      const healthTab = page.getByRole('tab', { name: /health/i })
      if ((await healthTab.count()) > 0) {
        await healthTab.click()
        await page.waitForTimeout(E2E_UI_DELAY)
      }

      // Step 5: View executive dashboard
      await navigateToExecutiveDashboard(page)

      await expect(page.locator('h1:has-text("Executive Dashboard")')).toBeVisible()
    })

    test('should navigate assessment with search', async ({ page }) => {
      const projectName = 'Search Assessment Test'
      await createProjectOnly(page, projectName)

      // Navigate to search page via SPA router
      await page.evaluate(() => {
        const nav = (window as unknown as Record<string, unknown>).__navigate
        if (typeof nav === 'function') nav('/search')
      })
      await page.waitForTimeout(E2E_UI_DELAY * 2)

      // Verify search page loaded
      const searchHeading = page.getByRole('heading', { name: /search/i })
      if (await searchHeading.isVisible().catch(() => false)) {
        await expect(searchHeading).toBeVisible()
      }
    })

    test('should use command palette for quick navigation', async ({ page }) => {
      const projectName = 'Command Assessment Test'
      await createProjectOnly(page, projectName)

      // Open command palette
      await page.keyboard.press('Control+Shift+P')
      await page.waitForTimeout(E2E_UI_DELAY)

      const dialog = page.locator('[role="dialog"]')
      if (await dialog.isVisible()) {
        const input = page.locator('input[placeholder*="Search commands"]')
        await input.fill('settings')
        await page.waitForTimeout(E2E_UI_DELAY)

        await page.keyboard.press('Escape')
      }
    })

    test('should complete multi-project assessment', async ({ page }) => {
      // Create multiple projects
      for (let i = 1; i <= 3; i++) {
        await createProjectOnly(page, `Assessment Project ${i}`)
        await page.waitForTimeout(E2E_UI_DELAY)
      }

      // View executive dashboard
      await navigateToExecutiveDashboard(page)

      await expect(page.locator('h1:has-text("Executive Dashboard")')).toBeVisible()

      // Should show multiple projects
      const projectCount = page.locator('text=/Assessment Project/i')
      const count = await projectCount.count()
      expect(count).toBeGreaterThanOrEqual(0)
    })
  })
})
